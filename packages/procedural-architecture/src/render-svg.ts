// render-svg.ts — the ONLY file that knows what SVG is.
//
// Consumes the frozen model from ./procedural-utils.ts and emits a string. It holds
// no geometry knowledge of its own: it culls, sorts, shades, projects, and prints.
// A three.js backend would replace exactly this file (~200 lines) and nothing else —
// that is what makes the engine choice a swap rather than a rewrite.

import {
  apertureQuad,
  centroid,
  depthKey,
  faceNormal,
  facePoints,
  lightVector,
  project,
  shade,
  add3,
  scale3,
} from './procedural-utils.js';
import type { BuildingModel, Vec2, Vec3 } from './procedural-utils.js';

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
// render
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
}

interface Prim {
  pts: Vec2[];
  fill: string;
  depth: number;
  stroke: string;
  opacity?: number;
}

interface PushOptions {
  bias?: number;
  opacity?: number;
  flat?: boolean;
  depth?: number;
  smooth?: boolean;
}

export function render(model: BuildingModel, opts: RenderOptions = {}): string {
  const { width = 640, pad = 6, background = null, showGround = true, strokeWidth = 0.35 } = opts;
  const theme: Palette = { ...themeFor(opts.theme ?? model.style), ...(opts.palette ?? {}) };
  const light = lightVector(opts.lightAngle ?? model.lightAngle, opts.lightElevation ?? 52);

  const prims: Prim[] = [];

  const push = (worldPts: Vec3[], baseColour: string, { bias = 0, opacity, flat = false, depth, smooth = false }: PushOptions = {}): void => {
    const n = faceNormal(worldPts);
    const facing = n.x + n.y + n.z; // dot with the (1,1,1) view axis
    if (facing <= 0.0001) return; // backface cull
    const k = flat ? 1 : shade(n, light);
    const fill = litColour(baseColour, k);
    const prim: Prim = {
      pts: worldPts.map(project),
      fill,
      // A curved surface's internal seams are a discretisation artefact — stroking
      // them turns a dome into a tiled parasol. Match the stroke to the fill and the
      // shell reads as one form, banded only by N·L.
      stroke: smooth ? fill : outline(fill),
      // An aperture must sort against the wall it is CUT INTO, not against its own
      // centroid — a low door on a tall wall has a smaller depth key than the wall's
      // midpoint and would be painted over by its own host. Callers that belong to a
      // parent surface pass that surface's depth explicitly.
      depth: (depth ?? depthKey(centroid(worldPts))) + bias,
    };
    if (opacity !== undefined) prim.opacity = opacity;
    prims.push(prim);
  };

  // --- contact shadow, first and furthest back.
  const groundPrims: string[] = [];
  if (showGround) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of model.parts) {
      for (const w of p.world) {
        if (w.z > 0.4) continue;
        minX = Math.min(minX, w.x);
        maxX = Math.max(maxX, w.x);
        minY = Math.min(minY, w.y);
        maxY = Math.max(maxY, w.y);
      }
    }
    if (Number.isFinite(minX)) {
      const c = project({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: 0 });
      const rx = (maxX - minX + (maxY - minY)) * 0.42;
      groundPrims.push(
        `<ellipse cx="${f(c.x)}" cy="${f(c.y)}" rx="${f(rx)}" ry="${f(rx * 0.34)}" fill="#000" opacity="0.13"/>`,
      );
    }
  }

  // --- solid faces.
  for (const part of model.parts) {
    for (const face of part.shape.faces) {
      if (face.kind === 'floor') continue; // never visible from above
      const pts = facePoints(part.world, face);
      const key = part.material && part.material !== 'wall' ? part.material : face.kind;
      const colour = theme[key] ?? theme[face.kind] ?? theme.wall;
      push(pts, colour, { smooth: face.smooth === true });
    }
  }

  // --- apertures, nudged outward along their facet normal so the depth sort lifts
  //     them clear of the wall they are cut into. No z-fighting, no special-casing.
  for (const ap of model.apertures) {
    const q = apertureQuad(model, ap);
    if (!q) continue;
    const n = q.facet.normal;
    const frameColour = theme.trim;
    const paneColour = ap.kind === 'door' ? theme.door : theme.glass;

    const grow = (pts: Vec3[], amount: number): Vec3[] => {
      const c = centroid(pts);
      return pts.map((p) => add3(add3(c, scale3({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }, amount)), scale3(n, 0.05)));
    };
    // Sort against the HOST FACET's depth, so an aperture always lands in front of
    // the wall that carries it regardless of where on that wall it sits.
    const hostDepth = depthKey(centroid([q.facet.bl, q.facet.br, q.facet.tr, q.facet.tl]));
    push(grow(q.pts, 1.16), frameColour, { depth: hostDepth, bias: 0.2 });
    push(q.pts.map((p) => add3(p, scale3(n, 0.11))), paneColour, { depth: hostDepth, bias: 0.4, flat: ap.kind !== 'door' });
  }

  // --- painter's algorithm: far to near.
  prims.sort((a, b) => a.depth - b.depth);

  // --- fit.
  const all = prims.flatMap((p) => p.pts);
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const maxY = Math.max(...all.map((p) => p.y)) + pad;
  const vw = maxX - minX,
    vh = maxY - minY;
  const height = Math.round((width * vh) / vw);

  const body = prims
    .map((p) => {
      const d = p.pts.map((q) => `${f(q.x)},${f(q.y)}`).join(' ');
      const op = p.opacity !== undefined ? ` opacity="${p.opacity}"` : '';
      return `<polygon points="${d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${op}/>`;
    })
    .join('\n  ');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(minX)} ${f(minY)} ${f(vw)} ${f(vh)}" width="${width}" height="${height}" role="img" aria-label="${esc(model.name)}">`,
    background ? `  <rect x="${f(minX)}" y="${f(minY)}" width="${f(vw)}" height="${f(vh)}" fill="${background}"/>` : '',
    ...groundPrims.map((g) => '  ' + g),
    '  ' + body,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

const f = (n: number): number => Number(n.toFixed(3));

const ENTITIES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
const esc = (s: string): string => String(s).replace(/[<>&"]/g, (c) => ENTITIES[c] ?? c);
