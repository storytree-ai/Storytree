// bake.ts — station 3's output as DRAWABLES rather than as a document.
//
// ADR-0217 decision 4: "parts bake at build time and the runtime composes them, so
// the runtime performs no geometry." This is that bake. It runs the whole pipeline —
// shade, cull, cut, order, project — and stops one step short of markup, handing back
// a flat list of resolved vector nodes in painter order.
//
// Two backends consume it and neither may diverge from the other, because there is
// only one of them: `render-svg.ts` prints these nodes into an `<svg>` document, and
// a surface that composes buildings into a larger scene (the forest island) places the
// same nodes into its own drawable tree. A building baked for the island and a building
// rendered to a contact sheet are the SAME geometry in the SAME order — which is what
// makes "does it hold up on the island" a question the contact sheet can answer.
//
// The node vocabulary (`polygon` with `points`, `path` with `d`) is deliberately the
// scene-graph's vocabulary, not SVG's: `@storytree/forest-world`'s `ScenePolygon` /
// `ScenePath` carry exactly these fields, so a baked node crosses into a scene as data
// with no translation layer. What stays behind in `render-svg.ts` is everything about
// an SVG *document* — the element names, the viewBox, the attribute spelling.

import {
  apertureQuad,
  faceNormal,
  facePoints,
  lightVector,
  project,
  shade,
} from './procedural-utils.js';
import type { Aperture, ApertureQuad, BuildingModel, Facet, Vec2, Vec3 } from './procedural-utils.js';
import { facadeStrips, openingOf, reveal } from './apertures.js';
import type { Opening } from './apertures.js';
import { orderForPainter } from './draw-order.js';
import type { DrawOrderOptions, DrawOrderStats, OrderPoly } from './draw-order.js';

// ---------------------------------------------------------------------------
// Themes — a material key resolves to a base colour; N·L then modulates it.
// ---------------------------------------------------------------------------

/**
 * A theme's colours. The named keys are the ones every face kind needs; the index
 * signature is what lets a part carry an off-menu `material` (a mushroom's `spot`,
 * a windmill's `stone`) and still resolve — falling back to `wall` when it cannot.
 */
export interface Palette {
  wall: string;
  roof: string;
  gable: string;
  soffit: string;
  trim: string;
  glass: string;
  door: string;
  stone: string;
  [material: string]: string | undefined;
}

export const THEMES = {
  timber:   { wall: '#b08154', roof: '#6d4630', gable: '#a2764c', soffit: '#5d3a27', trim: '#4a2f20', glass: '#ffd98a', door: '#5a3722', stone: '#9a9086' },
  concrete: { wall: '#c8c6c0', roof: '#8e8b85', gable: '#bcb9b3', soffit: '#77746f', trim: '#5f5d59', glass: '#9fc4d8', door: '#6b6862', stone: '#a8a5a0' },
  brick:    { wall: '#a8583f', roof: '#4e3b34', gable: '#9d5039', soffit: '#43322c', trim: '#33251f', glass: '#ffe0a3', door: '#4b3226', stone: '#8d8378' },
  glass:    { wall: '#7fa8bd', roof: '#4f6b7d', gable: '#7099b0', soffit: '#3f5666', trim: '#2d3f4b', glass: '#d7f0ff', door: '#3d5563', stone: '#9aa7ad' },
  mushroom: { wall: '#efe3cf', roof: '#c4453f', gable: '#e6d6bd', soffit: '#f4ece0', trim: '#6b4a35', glass: '#ffce6b', door: '#7a5133', stone: '#9c9184', spot: '#fbf3e4', gill: '#e8d7c0' },
  // Warm timber against cool slate — the contrast a tiered roof needs to read as a
  // stack rather than one mass. Trim is gold because the finial and the eave hardware
  // are the only warm accents above the wall line.
  temple:   { wall: '#8b6244', roof: '#42667f', gable: '#7d5a3f', soffit: '#2f4859', trim: '#c9a24e', glass: '#ffcf78', door: '#5a3a24', stone: '#9aa1a6' },
} satisfies Record<string, Palette>;

/** The themes that ship. A `style` outside this set falls back to `timber`. */
export type ThemeName = keyof typeof THEMES;

/** Resolve a style name to a palette, falling back to `timber` for anything else. */
export function themeFor(name: string): Palette {
  return (THEMES as Record<string, Palette | undefined>)[name] ?? THEMES.timber;
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');

/** Apply a 0..1+ brightness multiplier to a base colour. */
function litColour(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * k, g * k, b * k);
}
/** A darker sibling of a fill, for the flat-vector outline pass. */
const outline = (hex: string, k = 0.62): string => litColour(hex, k);

// ---------------------------------------------------------------------------
// options + the baked shapes
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** output size in px */
  width?: number;
  /** margin in world units */
  pad?: number;
  /** page colour, or null for transparent */
  background?: string | null;
  /** draw a contact shadow under the footprint */
  showGround?: boolean;
  strokeWidth?: number;
  /** override model.style */
  theme?: string;
  /** override model.lightAngle (azimuth degrees) */
  lightAngle?: number;
  lightElevation?: number;
  /** extra material-key colours merged over the theme */
  palette?: Record<string, string>;
  /** tuning for station 3's draw-order pass */
  drawOrder?: DrawOrderOptions;
}

export interface BakeOptions extends RenderOptions {
  /**
   * Re-origin the baked coordinates so the footprint's horizontal centre is x = 0 and
   * the lowest painted point is y = 0 — a building that STANDS on the origin.
   *
   * This is the placement contract a map needs: a caller drops the whole thing with
   * `translate(x y) scale(k)` and it meets the ground at (x, y), the same contract the
   * island's other sprites already use. Off by default so the SVG backend's own
   * coordinates are untouched.
   */
  normalize?: boolean;
}

/** The paint a polygon carries through the ordering pass. */
export interface Paint {
  fill: string;
  stroke: string;
  opacity?: number;
}

/**
 * One resolved drawable, in painter order — a projected 2D shape with its colour
 * already computed. Structurally a `ScenePolygon` / `ScenePath` minus the scene's
 * semantic fields, so a surface can lift it into a scene tree by adding a `kind`.
 *
 * Colour is RESOLVED here rather than left to a stylesheet because it is not a
 * category: a facet's fill is its material modulated by N·L, so two walls of one
 * building carry different colours and no class can name them.
 */
export type BakedNode =
  | { el: 'polygon'; points: string; fill: string; stroke: string; strokeWidth: number; opacity?: number }
  | { el: 'path'; d: string; fill: string; stroke: string; strokeWidth: number; opacity?: number; fillRule?: 'evenodd' }
  | { el: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number };

export interface BakedBuilding {
  /** the model's name, carried through for the tooltip / attribution */
  name: string;
  /** every drawable, already in painter order — paint them in sequence and stop */
  nodes: BakedNode[];
  /** the painted extent, in the baked coordinate space */
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** what station 3 cost — `output - input` is the split inflation, ADR-0069's watch */
  order: DrawOrderStats;
  /** the ordered world-space polygons, so a test can hold the ORDER to account
   *  directly rather than inferring it from the drawables */
  polys: OrderPoly<Paint>[];
}

// ---------------------------------------------------------------------------
// the bake
// ---------------------------------------------------------------------------

const f = (n: number): number => Number(n.toFixed(3));

/**
 * Run the whole pipeline and hand back resolved drawables in painter order.
 *
 * The one thing worth knowing about the order of operations here: geometry is collected
 * in WORLD space and projected only at the very end. Station 3 needs the 3D polygons to
 * split them, and a primitive that projected on the way in could only ever be re-sorted
 * — which is the failure this pipeline exists to retire.
 */
export function bakeBuilding(model: BuildingModel, opts: BakeOptions = {}): BakedBuilding {
  const { showGround = true, strokeWidth = 0.35, normalize = false } = opts;
  const theme: Palette = { ...themeFor(opts.theme ?? model.style), ...(opts.palette ?? {}) };
  const light = lightVector(opts.lightAngle ?? model.lightAngle, opts.lightElevation ?? 52);

  const prims: OrderPoly<Paint>[] = [];

  interface PushOptions {
    opacity?: number;
    flat?: boolean;
    smooth?: boolean;
    /** openings punched out of this face — drawn as one compound path */
    holes?: Vec3[][];
    /** the hole-free subdivision, if the ordering pass has to take this face apart */
    parts?: Vec3[][];
  }

  const push = (worldPts: Vec3[], baseColour: string, { opacity, flat = false, smooth = false, holes, parts }: PushOptions = {}): void => {
    const n = faceNormal(worldPts);
    const facing = n.x + n.y + n.z; // dot with the (1,1,1) view axis
    if (facing <= 0.0001) return; // backface cull — before ordering, so it splits less
    const k = flat ? 1 : shade(n, light);
    const fill = litColour(baseColour, k);
    const meta: Paint = {
      fill,
      // A curved surface's internal seams are a discretisation artefact — stroking
      // them turns a dome into a tiled parasol. Match the stroke to the fill and the
      // shell reads as one form, banded only by N·L.
      stroke: smooth ? fill : outline(fill),
    };
    if (opacity !== undefined) meta.opacity = opacity;
    const prim: OrderPoly<Paint> = { pts: worldPts, meta };
    if (holes !== undefined) prim.holes = holes;
    if (parts !== undefined) prim.parts = parts;
    prims.push(prim);
  };

  // --- contact shadow, first and furthest back.
  let ground: { cx: number; cy: number; rx: number; ry: number } | null = null;
  if (showGround) {
    let gMinX = Infinity,
      gMaxX = -Infinity,
      gMinY = Infinity,
      gMaxY = -Infinity;
    for (const p of model.parts) {
      for (const w of p.world) {
        if (w.z > 0.4) continue;
        gMinX = Math.min(gMinX, w.x);
        gMaxX = Math.max(gMaxX, w.x);
        gMinY = Math.min(gMinY, w.y);
        gMaxY = Math.max(gMaxY, w.y);
      }
    }
    if (Number.isFinite(gMinX)) {
      const c = project({ x: (gMinX + gMaxX) / 2, y: (gMinY + gMaxY) / 2, z: 0 });
      const rx = (gMaxX - gMinX + (gMaxY - gMinY)) * 0.42;
      ground = { cx: c.x, cy: c.y, rx, ry: rx * 0.34 };
    }
  }

  // --- which facets have been pierced, so a wall is drawn with its holes in it.
  const cutFacets = new Map<string, { facet: Facet; openings: { opening: Opening; ring: Vec3[] }[] }>();
  const cutQuads: { ap: Aperture; quad: ApertureQuad }[] = [];
  for (const ap of model.apertures) {
    const q = apertureQuad(model, ap);
    if (!q) continue;
    cutQuads.push({ ap, quad: q });
    const key = `${ap.host}#${ap.facet}`;
    const entry = cutFacets.get(key) ?? { facet: q.facet, openings: [] };
    entry.openings.push({ opening: openingOf(ap, q), ring: [...q.pts] });
    cutFacets.set(key, entry);
  }

  // --- solid faces. A pierced wall is emitted as ONE compound path with its openings
  //     punched out, so what shows through the hole is whatever is genuinely behind it.
  for (const part of model.parts) {
    for (const face of part.shape.faces) {
      if (face.kind === 'floor') continue; // never visible from above
      const key = part.material && part.material !== 'wall' ? part.material : face.kind;
      const colour = theme[key] ?? theme[face.kind] ?? theme.wall;
      const cut = face.facet === undefined ? undefined : cutFacets.get(`${part.id}#${face.facet}`);
      if (cut) {
        // The strips go along only as the fallback the ordering pass reaches for if this
        // wall turns out to interpenetrate something.
        push(facePoints(part.world, face), colour, {
          holes: cut.openings.map((o) => o.ring),
          parts: facadeStrips(cut.facet, cut.openings.map((o) => o.opening)),
        });
      } else {
        push(facePoints(part.world, face), colour, { smooth: face.smooth === true });
      }
    }
  }

  // --- apertures: the wall's thickness in section, then the pane set back behind it.
  //     Ordinary geometry at honest positions — station 3 needs no hint about it.
  for (const { ap, quad } of cutQuads) {
    const { jambs, pane } = reveal(quad, ap.reveal);
    for (const jamb of jambs) push(jamb, theme.trim);
    push(pane, ap.kind === 'door' ? theme.door : theme.glass, { flat: ap.kind !== 'door' });
  }

  // --- station 3: the explicit draw-order pass (ADR-0217 decision 4). Splits every
  //     interpenetrating polygon and hands back a painter's order that is correct by
  //     construction, not correct on the models we happened to try.
  const ordered = orderForPainter(prims, opts.drawOrder ?? {});
  const projected = ordered.polys.map((p) => ({
    pts: p.pts.map(project),
    holes: (p.holes ?? []).map((ring) => ring.map(project)),
    edges: p.edges,
    paint: p.meta,
  }));

  // --- extent, over everything that will be painted (the shadow included, since it is
  //     the widest thing at ground level and a caller placing this needs its real box).
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of projected) {
    for (const q of p.pts) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  }
  if (ground) {
    minX = Math.min(minX, ground.cx - ground.rx);
    maxX = Math.max(maxX, ground.cx + ground.rx);
    minY = Math.min(minY, ground.cy - ground.ry);
    maxY = Math.max(maxY, ground.cy + ground.ry);
  }

  // Screen y grows downward, so the LOWEST painted point is maxY — that is what "base"
  // means, and it is the ground line a caller translates to.
  const dx = normalize ? -(minX + maxX) / 2 : 0;
  const dy = normalize ? -maxY : 0;
  const pt = (q: Vec2): string => `${f(q.x + dx)},${f(q.y + dy)}`;
  const ring = (r: readonly Vec2[]): string => `M${r.map(pt).join('L')}Z`;

  const nodes: BakedNode[] = [];
  if (ground) {
    nodes.push({
      el: 'ellipse',
      cx: f(ground.cx + dx),
      cy: f(ground.cy + dy),
      rx: f(ground.rx),
      ry: f(ground.ry),
      fill: '#000',
      opacity: 0.13,
    });
  }

  for (const p of projected) {
    const op = p.paint.opacity;

    if (p.holes.length > 0) {
      // A wall and its openings as ONE even-odd path. Two things fall out of that: the
      // hole is genuinely empty rather than covered by a same-coloured patch, and the
      // stroke lands on the opening rims — which is where the window frame comes from
      // now that no frame quad is drawn.
      nodes.push({
        el: 'path',
        d: [p.pts, ...p.holes].map(ring).join(''),
        fillRule: 'evenodd',
        fill: p.paint.fill,
        stroke: p.paint.stroke,
        strokeWidth,
        ...(op !== undefined ? { opacity: op } : {}),
      });
      continue;
    }

    const cut = p.edges?.some((e) => !e) === true;
    if (!cut) {
      nodes.push({
        el: 'polygon',
        points: p.pts.map(pt).join(' '),
        fill: p.paint.fill,
        stroke: p.paint.stroke,
        strokeWidth,
        ...(op !== undefined ? { opacity: op } : {}),
      });
      continue;
    }

    // A fragment the ordering pass cut. Outlining its cut edges would draw a line across
    // the middle of a continuous surface, so the fill goes down unstroked and only the
    // edges it INHERITED are traced. Two nodes instead of one, and only for the fragments
    // that were actually split.
    const runs: string[] = [];
    let run: Vec2[] = [];
    for (let i = 0; i < p.pts.length; i++) {
      const a = p.pts[i];
      const b = p.pts[(i + 1) % p.pts.length];
      if (a === undefined || b === undefined) continue;
      if (p.edges?.[i] === true) {
        if (run.length === 0) run.push(a);
        run.push(b);
      } else if (run.length > 1) {
        runs.push(`M${run.map(pt).join('L')}`);
        run = [];
      } else {
        run = [];
      }
    }
    if (run.length > 1) runs.push(`M${run.map(pt).join('L')}`);

    // The fill is stroked in its OWN colour, not left bare. Two adjacent fills sharing an
    // edge do not composite to full opacity along it — antialiasing leaves a pale hairline
    // — and a same-colour hairline is what closes that seam.
    nodes.push({
      el: 'polygon',
      points: p.pts.map(pt).join(' '),
      fill: p.paint.fill,
      stroke: p.paint.fill,
      strokeWidth,
      ...(op !== undefined ? { opacity: op } : {}),
    });
    if (runs.length > 0) {
      nodes.push({
        el: 'path',
        d: runs.join(''),
        fill: 'none',
        stroke: p.paint.stroke,
        strokeWidth,
        ...(op !== undefined ? { opacity: op } : {}),
      });
    }
  }

  return {
    name: model.name,
    nodes,
    minX: f(minX + dx),
    minY: f(minY + dy),
    width: f(maxX - minX),
    height: f(maxY - minY),
    order: ordered.stats,
    polys: ordered.polys,
  };
}
