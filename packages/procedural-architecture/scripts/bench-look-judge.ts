// bench-look-judge.ts — the Station-4 look-judge benchmark harness (grounded-art arc,
// ADR-0217 D6 / increment-4 recommendation).
//
// WHAT THIS IS. A measurement, not a shipped feature. It assembles the LABELLED
// before/after pairs the factory work already produced — each with a known human answer
// for which render is WORSE — so a pairwise, revert-only look-judge (a VLM) can be scored
// by its AGREEMENT RATE. The question the benchmark answers: is Station 4 (an automated
// render-look-refine loop with a judge empowered only to REVERT) worth building, or does
// the ~58% VLM-on-geometry ceiling mean the human stays in the loop?
//
// HOW THE "BEFORE" STATES ARE MADE. Mutation testing applied to look: `benchBake` is a
// faithful mirror of `src/bake.ts`'s pipeline with two switches that REVERT a specific
// machinery fix —
//   * centroidOrder  — reverts station 3 (draw-order.ts): order faces by centroid depth
//                      with NO BSP split, the classic painter's-sort inversion.
//   * forceStrips    — reverts the aperture fix (apertures.ts / bake.ts, commit 176aca90):
//                      draw a pierced wall as stroked facade STRIPS instead of one
//                      compound even-odd path, so the subdivision's seams show across the
//                      wall (the "facade seams" / "X across the door" defect class).
// With both switches OFF, benchBake reproduces the shipped bake (asserted against the real
// render() in bench-selfcheck). Each PAIR therefore differs by exactly one reverted fix.
//
// The TASTE pairs need no mutation — they are pure inputs to the real pipeline (a flat
// one-hue palette vs the temple palette; a flush pane vs the 0.34 reveal vs an over-deep
// 0.7 reveal; flat shading vs N·L shading). Their "worse" side is the OWNER's directed
// call, recorded as ground truth; whether a VLM agrees is exactly what ~50% would deny.
//
// This script only BAKES to SVG + writes a manifest. Rasterising to PNG (Playwright) and
// the judge run are separate steps, kept out of this package (no playwright dep here).

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  faceNormal,
  facePoints,
  apertureQuad,
  lightVector,
  project,
  shade,
} from '../src/procedural-utils.js';
import type {
  Aperture,
  ApertureQuad,
  BuildingModel,
  Facet,
  ShadeOptions,
  Vec2,
  Vec3,
} from '../src/procedural-utils.js';
import { facadeStrips, openingOf, reveal } from '../src/apertures.js';
import type { Opening } from '../src/apertures.js';
import { orderForPainter, viewOf, findDepthConflicts } from '../src/draw-order.js';
import type { OrderPoly } from '../src/draw-order.js';
import { THEMES, themeFor } from '../src/bake.js';
import type { Palette, Paint } from '../src/bake.js';

import { mushroomDwelling } from '../src/buildings/mushroom-dwelling.js';
import { forestWindmill } from '../src/buildings/forest-windmill.js';
import { tieredPagoda } from '../src/buildings/tiered-pagoda.js';
import { render } from '../src/render-svg.js';

// ---------------------------------------------------------------------------
// colour helpers (copied from bake.ts — not exported there)
// ---------------------------------------------------------------------------
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');
function litColour(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * k, g * k, b * k);
}
const outline = (hex: string, k = 0.62): string => litColour(hex, k);
const f = (n: number): number => Number(n.toFixed(3));

// ---------------------------------------------------------------------------
// benchBake — a faithful mirror of src/bake.ts with the two revert switches.
// ---------------------------------------------------------------------------

export interface Regression {
  /** revert station 3 — centroid painter's sort, no BSP split */
  centroidOrder?: boolean;
  /** revert the aperture fix — stroked facade strips instead of a compound path */
  forceStrips?: boolean;
  /** revert edge provenance — stroke EVERY edge of a fragment, including the BSP's own
   *  cut edges (the historical "large dark X across the door") */
  strokeAllEdges?: boolean;
}

export interface BenchOpts {
  theme?: string;
  palette?: Record<string, string>;
  /** override every aperture's reveal depth (world units) */
  revealOverride?: number;
  /** flat-shade every face (k=1, no N·L) — the "flat plates" look */
  forceFlat?: boolean;
  width?: number;
  regression?: Regression;
}

interface BenchResult {
  svg: string;
  /** depth-order inversions the oracle finds in the painter order used (objective GT) */
  conflicts: number;
}

/** Centroid depth (view-axis w) of a world-space polygon. Larger w == nearer. */
function centroidW(pts: readonly Vec3[]): number {
  let s = 0;
  for (const p of pts) s += viewOf(p).w;
  return s / Math.max(1, pts.length);
}

function benchBake(model: BuildingModel, opts: BenchOpts = {}): BenchResult {
  const reg = opts.regression ?? {};
  const width = opts.width ?? 640;
  const pad = 6;
  const strokeWidth = 0.35;
  const theme: Palette = { ...themeFor(opts.theme ?? model.style), ...(opts.palette ?? {}) };
  const light = lightVector(model.lightAngle, 52);
  const shadeOpts: ShadeOptions = {};
  const outlineK = 0.62;

  const prims: OrderPoly<Paint>[] = [];

  const push = (
    worldPts: Vec3[],
    baseColour: string,
    o: { opacity?: number; flat?: boolean; smooth?: boolean; holes?: Vec3[][]; parts?: Vec3[][] } = {},
  ): void => {
    const n = faceNormal(worldPts);
    const facing = n.x + n.y + n.z;
    if (facing <= 0.0001) return; // backface cull
    const flat = o.flat === true || opts.forceFlat === true;
    const k = flat ? 1 : shade(n, light, shadeOpts);
    const fill = litColour(baseColour, k);
    const meta: Paint = { fill, stroke: o.smooth ? fill : outline(fill, outlineK) };
    if (o.opacity !== undefined) meta.opacity = o.opacity;
    const prim: OrderPoly<Paint> = { pts: worldPts, meta };
    if (o.holes !== undefined) prim.holes = o.holes;
    if (o.parts !== undefined) prim.parts = o.parts;
    prims.push(prim);
  };

  // --- contact shadow --------------------------------------------------------
  let ground: { cx: number; cy: number; rx: number; ry: number } | null = null;
  {
    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    for (const p of model.parts) {
      for (const w of p.world) {
        if (w.z > 0.4) continue;
        gMinX = Math.min(gMinX, w.x); gMaxX = Math.max(gMaxX, w.x);
        gMinY = Math.min(gMinY, w.y); gMaxY = Math.max(gMaxY, w.y);
      }
    }
    if (Number.isFinite(gMinX)) {
      const c = project({ x: (gMinX + gMaxX) / 2, y: (gMinY + gMaxY) / 2, z: 0 });
      const rx = (gMaxX - gMinX + (gMaxY - gMinY)) * 0.42;
      ground = { cx: c.x, cy: c.y, rx, ry: rx * 0.34 };
    }
  }

  // --- apertures collected per pierced facet ---------------------------------
  const apertures: Aperture[] =
    opts.revealOverride === undefined
      ? model.apertures
      : model.apertures.map((ap) => ({ ...ap, reveal: opts.revealOverride as number }));

  const cutFacets = new Map<string, { facet: Facet; openings: { opening: Opening; ring: Vec3[] }[] }>();
  const cutQuads: { ap: Aperture; quad: ApertureQuad }[] = [];
  for (const ap of apertures) {
    const q = apertureQuad(model, ap);
    if (!q) continue;
    cutQuads.push({ ap, quad: q });
    const key = `${ap.host}#${ap.facet}`;
    const entry = cutFacets.get(key) ?? { facet: q.facet, openings: [] };
    entry.openings.push({ opening: openingOf(ap, q), ring: [...q.pts] });
    cutFacets.set(key, entry);
  }

  // --- solid faces -----------------------------------------------------------
  for (const part of model.parts) {
    for (const face of part.shape.faces) {
      if (face.kind === 'floor') continue;
      const key = part.material && part.material !== 'wall' ? part.material : face.kind;
      const colour = theme[key] ?? theme[face.kind] ?? theme.wall;
      const cut = face.facet === undefined ? undefined : cutFacets.get(`${part.id}#${face.facet}`);
      if (cut) {
        if (reg.forceStrips) {
          // REVERTED: draw the wall as subdivided facade strips, each stroked on every
          // edge — so the subdivision's seams show across the wall (pre-176aca90).
          for (const strip of facadeStrips(cut.facet, cut.openings.map((o) => o.opening))) {
            push(strip, colour);
          }
        } else {
          push(facePoints(part.world, face), colour, {
            holes: cut.openings.map((o) => o.ring),
            parts: facadeStrips(cut.facet, cut.openings.map((o) => o.opening)),
          });
        }
      } else {
        push(facePoints(part.world, face), colour, { smooth: face.smooth === true });
      }
    }
  }

  // --- apertures: reveal jambs + pane ---------------------------------------
  for (const { ap, quad } of cutQuads) {
    const { jambs, pane } = reveal(quad, ap.reveal);
    for (const jamb of jambs) push(jamb, theme.trim);
    push(pane, ap.kind === 'door' ? theme.door : theme.glass, { flat: ap.kind !== 'door' });
  }

  // --- ordering: station 3, or the reverted centroid sort --------------------
  let orderedPolys: OrderPoly<Paint>[];
  if (reg.centroidOrder) {
    orderedPolys = [...prims].sort((a, b) => centroidW(a.pts) - centroidW(b.pts)); // far (small w) first
  } else {
    orderedPolys = orderForPainter(prims, {}).polys;
  }
  const conflicts = findDepthConflicts(orderedPolys).length;

  const projected = orderedPolys.map((p) => ({
    pts: p.pts.map(project),
    holes: (p.holes ?? []).map((ring) => ring.map(project)),
    edges: p.edges,
    paint: p.meta,
  }));

  // --- extent ---------------------------------------------------------------
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of projected) for (const q of p.pts) {
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  }
  if (ground) {
    minX = Math.min(minX, ground.cx - ground.rx); maxX = Math.max(maxX, ground.cx + ground.rx);
    minY = Math.min(minY, ground.cy - ground.ry); maxY = Math.max(maxY, ground.cy + ground.ry);
  }

  const pt = (q: Vec2): string => `${f(q.x)},${f(q.y)}`;
  const ring = (r: readonly Vec2[]): string => `M${r.map(pt).join('L')}Z`;

  const body: string[] = [];
  if (ground) {
    body.push(
      `<ellipse cx="${f(ground.cx)}" cy="${f(ground.cy)}" rx="${f(ground.rx)}" ry="${f(ground.ry)}" fill="#000" opacity="0.13"/>`,
    );
  }
  for (const p of projected) {
    const op = p.paint.opacity;
    const opAttr = op !== undefined ? ` opacity="${op}"` : '';
    if (p.holes.length > 0) {
      body.push(
        `<path d="${[p.pts, ...p.holes].map(ring).join('')}" fill-rule="evenodd" fill="${p.paint.fill}" stroke="${p.paint.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${opAttr}/>`,
      );
      continue;
    }
    const cut = p.edges?.some((e) => !e) === true;
    if (!cut || reg.strokeAllEdges) {
      // REVERTED (strokeAllEdges): a split fragment strokes ALL its edges, including the
      // BSP's own cut lines — the historical "dark X across the door".
      body.push(
        `<polygon points="${p.pts.map(pt).join(' ')}" fill="${p.paint.fill}" stroke="${p.paint.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${opAttr}/>`,
      );
      continue;
    }
    // split fragment: stroke only inherited edges (matches bake.ts)
    const runs: string[] = [];
    let run: Vec2[] = [];
    for (let i = 0; i < p.pts.length; i++) {
      const a = p.pts[i];
      const b = p.pts[(i + 1) % p.pts.length];
      if (a === undefined || b === undefined) continue;
      if (p.edges?.[i] === true) { if (run.length === 0) run.push(a); run.push(b); }
      else if (run.length > 1) { runs.push(`M${run.map(pt).join('L')}`); run = []; }
      else run = [];
    }
    if (run.length > 1) runs.push(`M${run.map(pt).join('L')}`);
    body.push(
      `<polygon points="${p.pts.map(pt).join(' ')}" fill="${p.paint.fill}" stroke="${p.paint.fill}" stroke-width="${strokeWidth}" stroke-linejoin="round"${opAttr}/>`,
    );
    if (runs.length > 0) {
      body.push(
        `<path d="${runs.join('')}" fill="none" stroke="${p.paint.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${opAttr}/>`,
      );
    }
  }

  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;
  const height = Math.round((width * vh) / vw);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(minX - pad)} ${f(minY - pad)} ${f(vw)} ${f(vh)}" width="${width}" height="${height}" role="img" aria-label="${model.name}">`,
    `  <rect x="${f(minX - pad)}" y="${f(minY - pad)}" width="${f(vw)}" height="${f(vh)}" fill="#cfc6ad"/>`,
    '  ' + body.join('\n  '),
    '</svg>',
  ].join('\n');

  return { svg, conflicts };
}

// ---------------------------------------------------------------------------
// The pairs
// ---------------------------------------------------------------------------

type Category = 'objective' | 'taste';
interface PairSpec {
  id: string;
  category: Category;
  object: string;
  /** what the machinery fix / owner call is */
  fix: string;
  /** the human-known WORSE render's file suffix ('before' or one of the variant keys) */
  worse: string;
  /** one line the judge NEVER sees — why 'worse' is worse */
  groundTruth: string;
  /** rendered variants: key -> svg + conflict count */
  variants: Record<string, BenchResult>;
}

const W = 720;

const mushroom = mushroomDwelling();
const windmill = forestWindmill();
const pagoda = tieredPagoda();
// the "flat plates" before-state: a straight hip (sweep 1) instead of the flaredRoof's
// concave sweep (default 1.5) — the exact kit gap the temple/flaredRoof retune closed (#824).
const pagodaFlatPlates = tieredPagoda({ sweep: 1 });

const pairs: PairSpec[] = [
  // ---- OBJECTIVE (calibration — carry objective ground truth) --------------
  {
    id: 'centroid-vs-bsp-pagoda',
    category: 'objective',
    object: 'tiered pagoda',
    fix: 'station 3 (draw-order.ts): explicit BSP draw order vs a centroid painter\'s sort',
    worse: 'before',
    groundTruth: 'centroid sort inverts the stacked-eave overlaps (oracle: conflicts>0); BSP order is 0.',
    variants: {
      before: benchBake(pagoda, { width: W, regression: { centroidOrder: true } }),
      after: benchBake(pagoda, { width: W }),
    },
  },
  {
    id: 'centroid-vs-bsp-windmill',
    category: 'objective',
    object: 'forest windmill',
    fix: 'station 3: a sail blade sweeping past the balcony railing — the catalogued inversion',
    worse: 'before',
    groundTruth: 'centroid sort paints the far sail blade over the near railing (oracle: conflicts>0); BSP is 0.',
    variants: {
      before: benchBake(windmill, { width: W, regression: { centroidOrder: true } }),
      after: benchBake(windmill, { width: W }),
    },
  },
  {
    id: 'centroid-vs-bsp-mushroom',
    category: 'objective',
    object: 'mushroom dwelling',
    fix: 'station 3: the ground-level door/windows sorting behind the wall they are cut into',
    worse: 'before',
    groundTruth: 'centroid sort paints apertures/parts in the wrong depth order (oracle: conflicts>0); BSP is 0.',
    variants: {
      before: benchBake(mushroom, { width: W, regression: { centroidOrder: true } }),
      after: benchBake(mushroom, { width: W }),
    },
  },
  {
    id: 'seams-vs-compound-mushroom',
    category: 'objective',
    object: 'mushroom dwelling',
    fix: 'the aperture fix (176aca90): compound-path opening + edge provenance vs stroked facade strips',
    worse: 'before',
    groundTruth: 'stroked subdivision paints seams across the wall / a box around the door that are not real edges.',
    variants: {
      before: benchBake(mushroom, { width: W, regression: { forceStrips: true, strokeAllEdges: true } }),
      after: benchBake(mushroom, { width: W }),
    },
  },
  {
    id: 'seams-vs-compound-pagoda',
    category: 'objective',
    object: 'tiered pagoda',
    fix: 'the aperture fix: compound-path windows + edge provenance vs stroked facade strips',
    worse: 'before',
    groundTruth: 'stroked subdivision draws grid seams across every pierced wall that are not real edges.',
    variants: {
      before: benchBake(pagoda, { width: W, regression: { forceStrips: true, strokeAllEdges: true } }),
      after: benchBake(pagoda, { width: W }),
    },
  },
  // ---- TASTE (no objective GT — the owner's directed call) -----------------
  {
    id: 'oneblue-vs-temple-pagoda',
    category: 'taste',
    object: 'tiered pagoda',
    fix: 'the temple palette (warm timber vs cool slate) vs one flat blue mass',
    worse: 'before',
    groundTruth: 'without the warm/cool contrast the tiered roof reads as one blue mass (owner call, #823).',
    variants: {
      before: benchBake(pagoda, {
        width: W,
        palette: { wall: '#5f7f9a', roof: '#5f7f9a', gable: '#5f7f9a', soffit: '#5f7f9a', stone: '#5f7f9a' },
      }),
      after: benchBake(pagoda, { width: W, theme: 'temple' }),
    },
  },
  {
    id: 'flush-vs-reveal-pagoda',
    category: 'taste',
    object: 'tiered pagoda',
    fix: 'the 0.34 reveal (windows recessed with a shaded jamb) vs a flush pane',
    worse: 'before',
    groundTruth: 'a flush pane reads as a decal stuck on the wall; 0.34 gives depth (reveal study, DEFAULT_REVEAL).',
    variants: {
      before: benchBake(pagoda, { width: W, revealOverride: 0 }),
      after: benchBake(pagoda, { width: W, revealOverride: 0.34 }),
    },
  },
  {
    id: 'deep-vs-reveal-pagoda',
    category: 'taste',
    object: 'tiered pagoda',
    fix: 'the 0.34 reveal vs an over-deep 0.7 reveal',
    worse: 'before',
    groundTruth: 'a 0.7 reveal becomes the thing you notice about the building; 0.34 was the owner-scoped depth.',
    variants: {
      before: benchBake(pagoda, { width: W, revealOverride: 0.7 }),
      after: benchBake(pagoda, { width: W, revealOverride: 0.34 }),
    },
  },
  {
    id: 'flatplates-vs-flared-pagoda',
    category: 'taste',
    object: 'tiered pagoda',
    fix: 'flaredRoof concave sweep (1.5) vs a straight-hip roof (sweep 1) — the "flat plates" kit gap',
    worse: 'before',
    groundTruth: 'without the concave flaredRoof sweep the tiered roofs read as flat plates (kit gap, #824).',
    variants: {
      before: benchBake(pagodaFlatPlates, { width: W, theme: 'temple' }),
      after: benchBake(pagoda, { width: W, theme: 'temple' }),
    },
  },
  {
    // SYNTHETIC CONTROL — not a defect the owner called out; an obvious extreme (shading
    // fully off) that confirms the judges detect a blatant regression (the floor).
    id: 'flat-vs-shaded-mushroom',
    category: 'taste',
    object: 'mushroom dwelling',
    fix: 'N·L shading (facets read as solid form) vs flat plates (every face one tone) [synthetic control]',
    worse: 'before',
    groundTruth: 'flat shading collapses the isometric solid into flat coloured plates with no read of depth.',
    variants: {
      before: benchBake(mushroom, { width: W, forceFlat: true }),
      after: benchBake(mushroom, { width: W }),
    },
  },
];

// ---------------------------------------------------------------------------
// self-check: benchBake with no regression ~ the real render() (fidelity)
// ---------------------------------------------------------------------------
function selfCheck(): { object: string; benchNodes: number; realNodes: number }[] {
  const count = (svg: string): number => (svg.match(/<(polygon|path|ellipse)/g) ?? []).length;
  return [mushroom, windmill, pagoda].map((m) => ({
    object: m.name,
    benchNodes: count(benchBake(m, { width: W }).svg),
    realNodes: count(render(m, { width: W })),
  }));
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------
const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: bench-look-judge.ts <output-dir>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const manifest = pairs.map((p) => {
  for (const [key, res] of Object.entries(p.variants)) {
    writeFileSync(join(OUT, `${p.id}__${key}.svg`), res.svg, 'utf8');
  }
  return {
    id: p.id,
    category: p.category,
    object: p.object,
    fix: p.fix,
    worse: p.worse,
    groundTruth: p.groundTruth,
    variants: Object.fromEntries(
      Object.entries(p.variants).map(([k, v]) => [k, { svg: `${p.id}__${k}.svg`, oracleConflicts: v.conflicts }]),
    ),
  };
});

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ selfCheck: selfCheck(), pairs: manifest }, null, 2), 'utf8');
console.log(`wrote ${pairs.length} pairs (${manifest.reduce((n, p) => n + Object.keys(p.variants).length, 0)} svgs) + manifest to ${OUT}`);
console.log('self-check (bench vs real node counts):', JSON.stringify(selfCheck()));
console.log('oracle conflicts per objective before/after:');
for (const p of pairs.filter((p) => p.category === 'objective')) {
  console.log(`  ${p.id}: before=${p.variants.before?.conflicts} after=${p.variants.after?.conflicts}`);
}
