/**
 * ONE island, emitted twice — the geometry half of ADR-0367's interior fork.
 *
 * The fork is settled on evidence, so the two variants must differ in exactly ONE thing: the
 * interior's DECOMPOSITION. Everything else — which hexes are claimed, the coast, the capability
 * partition, the statuses, the camera — is computed once here and shared by both, and both are
 * written by ONE run of this file. (The hero track measured what happens otherwise: a fork picture
 * whose cells were rendered either side of an edit compared two variables with no visible cue.)
 *
 *   variant B  =  THE SHIPPED INTERIOR. `buildRelaxedCells(..., 'mesh')` from
 *                 `packages/forest-world/src/substrate.ts`, imported rather than re-implemented, so
 *                 there is no second copy of the mesh to drift. Its cells come back in SCREEN space
 *                 (the substrate works there); they are unprojected to the ground plane with the
 *                 declared camera's own inverse, because the renderer needs ground polygons.
 *
 *   variant A  =  A REGULARISED INTERIOR. There is no shipped code for this — it is the hypothetical
 *                 ADR-0367's Consequences names — so it is constructed here, in the GROUND plane, as
 *                 the smallest honest repeating lattice finer than the hex itself: each claimed hex
 *                 fans into six kites (centre → edge-midpoint → corner → next edge-midpoint). Every
 *                 kite in the whole island is one of SIX ground shapes, repeated, which is what makes
 *                 a finite rendered tile set able to cover it.
 *
 * The camera is `LAND_CAMERA_ELEVATION_DEG` (ADR-0367 D1, landed in PR #1344). It is read, never
 * restated: this file has no angle of its own.
 *
 * Run:  npx tsx docs/research/chapter2-land-interior-fork-2026-08-15/emit_island.ts
 * Out:  island.json  (the single input both the Blender piece render and the compositor read)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  unprojectGround,
} from '../../../packages/forest-world/src/camera.js';
import { smoothCoast, type BoundarySeg } from '../../../packages/forest-world/src/coast.js';
import {
  HEX_R,
  HEX_W,
  TILE_DEPTH_WORLD,
  AXIAL_DIRS,
  axialKey,
  hexCenter,
  hexCorners,
  type Axial,
  type Pt,
} from '../../../packages/forest-world/src/hex.js';
import { hash, rand01 } from '../../../packages/forest-world/src/rng.js';
import { buildRelaxedCells, type DrawTile } from '../../../packages/forest-world/src/substrate.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The spike's fixed seed. Every hashed choice below keys off this string. */
const SEED = 'land-interior-fork-2026-08-15';
/** The story whose island this is — `smoothCoast` hashes the shore off the story id. */
const STORY_ID = 'fork-spike-island';

/**
 * The claimed hexes: the centre, its full first ring, and five of the second, which is the shape a
 * ~12-capability story's territory actually takes under the app's `max(3, caps + 2)` quota. Written
 * out rather than generated so the island is byte-stable independent of the layout packer, which is
 * not what this spike is measuring.
 */
const TILES: Axial[] = [
  { q: 0, r: 0 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 2, r: -2 },
  { q: 2, r: -1 },
  { q: 1, r: 1 },
  { q: 0, r: 2 },
  { q: -1, r: 2 },
  { q: -2, r: 2 },
  { q: -2, r: 1 },
  { q: -1, r: -1 },
  { q: 0, r: -2 },
  { q: 2, r: 0 },
];

/**
 * The capability partition, and each capability's folded status. Cells are the CAPABILITY
 * (ADR-0367's Context) and each carries its capability's status tint, so an island legitimately
 * shows several statuses at once — which is what makes the tint an on-picture check rather than a
 * claim. All five of the studio's ground statuses appear.
 */
const CAP_STATUSES = [
  'healthy',
  'healthy',
  'building',
  'proposed',
  'proposed',
  'mapped',
  'unhealthy',
  'healthy',
  'building',
  'proposed',
] as const;

/**
 * THE CAMERA THIS ISLAND IS EMITTED FOR. Defaults to `LAND_CAMERA_ELEVATION_DEG`, so a bare
 * `npx tsx emit_island.ts` is byte-identical to the committed `island.json` (asserted by
 * `verify.py` check 1) and this file still declares no angle of its own.
 *
 * `--elev <deg>` overrides ONLY the camera block written below, and `--out <path>` the
 * destination. That is a genuine camera sweep and not a geometry sweep, which is the whole
 * reason the override is drawn here rather than deeper:
 *
 *   · The GROUND geometry is unaffected by it, by construction. Cell polygons and the coast
 *     come from `buildRelaxedCells` / `smoothCoast`, which take no elevation argument at all —
 *     they work in the screen space of `hexCenter`'s own default — and are then carried back to
 *     the ground plane with `unprojectGround`. So the emitted ground island is always the one
 *     the app's own constant produces, and re-projecting it at another angle shows THAT island
 *     from higher up rather than a differently decomposed one.
 *   · Which is what a sweep needs: one variable. Threading a sweep angle into the substrate
 *     would ALSO re-intern its vertices — the mesh's decomposition is a function of the
 *     projection while `VKEY` rounds screen coordinates (measured on the camera lane as
 *     50 -> 52 cells), so the pictures would vary camera AND cell count together.
 *   · The cost of that choice, stated rather than hidden: this sweep does NOT show the
 *     re-decomposition a REAL camera move would additionally cause. Moving the interning to
 *     ground space remains a precondition of actually changing the shipped angle, exactly as
 *     the interior-fork README's first non-discretionary condition already says.
 */
const ARGV = process.argv.slice(2);
const argOf = (name: string, fallback: string): string => {
  const i = ARGV.indexOf(name);
  const v = i >= 0 ? ARGV[i + 1] : undefined;
  return v === undefined ? fallback : v;
};
const CAMERA_DEG = Number(argOf('--elev', String(LAND_CAMERA_ELEVATION_DEG)));
if (!Number.isFinite(CAMERA_DEG) || CAMERA_DEG <= 0 || CAMERA_DEG >= 90) {
  throw new Error(`--elev must be an angle in (0, 90) degrees above the ground plane, got ${argOf('--elev', '')}`);
}
const OUT_PATH = argOf('--out', join(HERE, 'island.json'));
const IS_SWEEP = CAMERA_DEG !== LAND_CAMERA_ELEVATION_DEG;

const SIN = groundFlattening(CAMERA_DEG);
const cos = (d: number): number => Math.cos((d * Math.PI) / 180);

/** GROUND-plane hex centre — `hexCenter` with the projection undone. */
function groundCenter(h: Axial): Pt {
  return { x: HEX_W * (h.q + h.r / 2), y: 1.5 * HEX_R * h.r };
}

/** GROUND-plane hex corners: the same six offsets, unflattened. */
function groundCorners(c: Pt): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: c.x + HEX_R * Math.cos(a), y: c.y + HEX_R * Math.sin(a) });
  }
  return pts;
}

const centroid = (poly: Pt[]): Pt => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

/** Shoelace area, unsigned. */
function areaOf(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * A cell's SHAPE identity, in the GROUND plane: the polygon translated to its own centroid and
 * rounded to 0.05 px, with its vertex ring rotated to a canonical start. Two cells share a key
 * exactly when one is a translation of the other — which is the only equivalence a finite tile set
 * can exploit, because a sprite rendered at a fixed camera may be moved but never turned.
 */
function shapeKey(poly: Pt[]): string {
  const c = centroid(poly);
  const rel = poly.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const fmt = (p: Pt): string => `${(Math.round(p.x * 20) / 20).toFixed(2)},${(Math.round(p.y * 20) / 20).toFixed(2)}`;
  const rings: string[] = [];
  for (let s = 0; s < rel.length; s++) {
    rings.push(rel.map((_, i) => fmt(rel[(s + i) % rel.length]!)).join(' '));
  }
  rings.sort();
  return rings[0]!;
}

// ------------------------------------------------------------------ the shared island

const keySet = new Set(TILES.map(axialKey));
const drawTiles: DrawTile[] = TILES.map((h) => ({ h, owner: 0 }));

/** The territory boundary — every claimed tile edge whose neighbour is foreign soil (SCREEN space,
 *  because `smoothCoast` and the app's coast both work there). */
const segs: BoundarySeg[] = [];
for (const h of TILES) {
  const c = hexCenter(h);
  const corners = hexCorners(c.x, c.y, HEX_R);
  for (let i = 0; i < 6; i++) {
    const n = AXIAL_DIRS[i]!;
    if (keySet.has(axialKey({ q: h.q + n.q, r: h.r + n.r }))) continue;
    const a = corners[i]!;
    const b = corners[(i + 1) % 6]!;
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
}
const coast = smoothCoast(segs, STORY_ID);
const coastLoopScreen = coast.loops[0] ?? [];
const coastLoopGround = coastLoopScreen.map((p) => unprojectGround(p));

/** Capability seeds, one per capability, scattered deterministically over the claimed tiles — the
 *  equal-weight Voronoi the app partitions a parcel with. */
const capSeeds: Pt[] = CAP_STATUSES.map((_s, i) => {
  const h = TILES[hash(`${SEED}:capseed:${i}`) % TILES.length]!;
  const c = groundCenter(h);
  const a = rand01(hash(`${SEED}:capang:${i}`)) * Math.PI * 2;
  const rad = rand01(hash(`${SEED}:caprad:${i}`)) * HEX_R * 0.8;
  return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
});

/** Nearest capability seed — the cell's owner, and therefore its status tint. */
function capOf(p: Pt): number {
  let best = 0;
  let bd = Infinity;
  capSeeds.forEach((s, i) => {
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ------------------------------------------------------------------ variant B: the shipped mesh

/** The wheat sets the app tints per territory — one deterministic subset of the claimed hexes. */
const wheatKeys = new Set(TILES.filter((h) => rand01(hash(`${SEED}:wheat:${axialKey(h)}`)) < 0.22).map(axialKey));

const meshCellsScreen = buildRelaxedCells(drawTiles, [wheatKeys], 'mesh');

interface EmittedCell {
  /** GROUND-plane polygon (the renderer's input; screen position is this projected). */
  poly: [number, number][];
  /** Ground centroid — where its rendered piece is pasted. */
  c: [number, number];
  /** Shape-identity key: cells sharing one can share a rendered piece. */
  shape: string;
  /** The app's own grass variant index (0..2), untouched. */
  variant: number;
  wheat: boolean;
  /** Capability index → the status this cell wears. */
  cap: number;
}

const cellsB: EmittedCell[] = meshCellsScreen.map((rc) => {
  const g = rc.poly.map((p) => unprojectGround(p));
  const c = centroid(g);
  return {
    poly: g.map((p) => [p.x, p.y] as [number, number]),
    c: [c.x, c.y],
    shape: shapeKey(g),
    variant: rc.variant,
    wheat: rc.wheat,
    cap: capOf(c),
  };
});

// ------------------------------------------------------------------ variant A: the regular lattice

const cellsA: EmittedCell[] = [];
for (const h of TILES) {
  const c = groundCenter(h);
  const corners = groundCorners(c);
  const mids = corners.map((cor, i) => {
    const nxt = corners[(i + 1) % 6]!;
    return { x: (cor.x + nxt.x) / 2, y: (cor.y + nxt.y) / 2 };
  });
  const hkey = axialKey(h);
  const wheatHex = wheatKeys.has(hkey);
  for (let i = 0; i < 6; i++) {
    const poly = [c, mids[(i + 5) % 6]!, corners[i]!, mids[i]!];
    const cc = centroid(poly);
    cellsA.push({
      poly: poly.map((p) => [p.x, p.y] as [number, number]),
      c: [cc.x, cc.y],
      // The lattice repeats, so the kite INDEX is the shape class; `shapeKey` is asserted against it
      // below rather than trusted, because "six shapes" is the whole claim option (a) rests on.
      shape: shapeKey(poly),
      variant: hash(`lattice-cell:${hkey}:${i}`) % 3,
      wheat: wheatHex && rand01(hash(`lattice-wheat:${hkey}:${i}`)) < 0.7,
      cap: capOf(cc),
    });
  }
}

/**
 * A DENSITY CONTROL, measured but never rendered. Variant A's kites are larger than the shipped
 * mesh's cells, so "the lattice is coarser" is a real cost — and the obvious reply is to subdivide
 * once more. This computes what that reply costs in PIECES, so the report can answer the objection
 * with a number instead of a guess: each kite splits into four, and the tile set is still finite.
 */
const shapesAFine = new Set<string>();
let fineCount = 0;
for (const k of cellsA) {
  const p = k.poly.map(([x, y]) => ({ x, y }));
  const g = centroid(p);
  const m = p.map((q, i) => {
    const n = p[(i + 1) % p.length]!;
    return { x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 };
  });
  for (let i = 0; i < p.length; i++) {
    shapesAFine.add(shapeKey([p[i]!, m[i]!, g, m[(i + p.length - 1) % p.length]!]));
    fineCount++;
  }
}

const classesA = [...new Set(cellsA.map((k) => k.shape))].sort();
const classesB = [...new Set(cellsB.map((k) => k.shape))].sort();
if (classesA.length !== 6) {
  throw new Error(`variant A must be a six-piece lattice; got ${classesA.length} distinct shapes`);
}

/** One representative ground polygon per variant-A shape class — what Blender actually renders. */
const pieceSet = classesA.map((key) => {
  const rep = cellsA.find((k) => k.shape === key)!;
  const c = rep.c;
  return {
    shape: key,
    /** centred on its own centroid, so the rendered sprite pastes at the cell centroid */
    poly: rep.poly.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]),
    count: cellsA.filter((k) => k.shape === key).length,
  };
});

// ------------------------------------------------------------------ the shared coast walk

/**
 * The coast walked at a FIXED ground step, each step carrying its ground heading. This is the
 * addressable set option (b) leans on: a wall piece is rendered once per quantised heading and
 * repeated, so the pieces are independent of the island's unique outline. Both variants get the
 * identical rim, because the fork is about the INTERIOR.
 */
const WALL_STEP = 11; // ground px per wall piece
const WALL_HEADINGS = 16; // the quantised OUTWARD-NORMAL set — 22.5 degrees apart
const islandCentre = centroid(coastLoopGround);
const wallPlacements: { c: [number, number]; heading: number }[] = [];
{
  let carry = 0;
  for (let i = 0; i < coastLoopGround.length; i++) {
    const a = coastLoopGround[i]!;
    const b = coastLoopGround[(i + 1) % coastLoopGround.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    let t = carry;
    while (t < len) {
      const p = { x: a.x + (dx / len) * t, y: a.y + (dy / len) * t };
      // The piece set is indexed by the wall's OUTWARD NORMAL, not its tangent: a sprite rendered at
      // a fixed camera may be MOVED but never turned, so the near shore and the far shore are
      // genuinely different pieces and the index has to say which. The sign is taken from the island
      // centroid rather than from the loop's winding, which a re-derivation could get backwards.
      let nx = dy / len;
      let ny = -dx / len;
      if ((p.x - islandCentre.x) * nx + (p.y - islandCentre.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const ang = Math.atan2(ny, nx);
      const hIdx = ((Math.round((ang / (Math.PI * 2)) * WALL_HEADINGS) % WALL_HEADINGS) + WALL_HEADINGS) % WALL_HEADINGS;
      wallPlacements.push({ c: [p.x, p.y], heading: hIdx });
      t += WALL_STEP;
    }
    carry = t - len;
  }
}

// ------------------------------------------------------------------ write

const out = {
  seed: SEED,
  storyId: STORY_ID,
  camera: {
    elevationDeg: CAMERA_DEG,
    groundFlattening: SIN,
    uprightForeshortening: cos(CAMERA_DEG),
    source: IS_SWEEP
      ? `--elev ${CAMERA_DEG} SWEEP OVERRIDE, for ADR-0367 D1's reserved question. The shipped ` +
        `constant is ${LAND_CAMERA_ELEVATION_DEG} (packages/forest-world/src/camera.ts — ` +
        `LAND_CAMERA_ELEVATION_DEG, PR #1344) and is NOT changed by this run. Ground geometry ` +
        `below is decomposed at the constant and re-projected here: a camera sweep, not a ` +
        `geometry sweep.`
      : 'packages/forest-world/src/camera.ts — LAND_CAMERA_ELEVATION_DEG (ADR-0367 D1, PR #1344)',
  },
  tileDepthWorld: TILE_DEPTH_WORLD,
  hexR: HEX_R,
  tiles: TILES,
  capStatuses: CAP_STATUSES,
  coastLoopGround: coastLoopGround.map((p) => [p.x, p.y]),
  islandCentreGround: [islandCentre.x, islandCentre.y],
  wall: { step: WALL_STEP, headings: WALL_HEADINGS, placements: wallPlacements },
  variantA: {
    label: 'regularised lattice (six-piece kite fan)',
    cells: cellsA,
    distinctShapes: classesA.length,
    pieceSet,
    meanCellArea: cellsA.reduce((s, k) => s + areaOf(k.poly.map(([x, y]) => ({ x, y }))), 0) / cellsA.length,
    /** The density control: one further subdivision, measured only. */
    finerLattice: { cells: fineCount, distinctShapes: shapesAFine.size },
  },
  variantB: {
    label: 'shipped relaxed mesh (buildMeshCells, MESH_TUNING)',
    cells: cellsB,
    distinctShapes: classesB.length,
    meanCellArea: cellsB.reduce((s, k) => s + areaOf(k.poly.map(([x, y]) => ({ x, y }))), 0) / cellsB.length,
  },
};

writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 1)}\n`);
console.log(
  `${OUT_PATH}  camera=${CAMERA_DEG}deg${IS_SWEEP ? ' (SWEEP OVERRIDE)' : ' (LAND_CAMERA_ELEVATION_DEG)'}  ` +
    `tiles=${TILES.length}  ` +
    `A: ${cellsA.length} cells / ${classesA.length} distinct shapes  ` +
    `B: ${cellsB.length} cells / ${classesB.length} distinct shapes  ` +
    `coast=${coastLoopGround.length} pts  wallPieces=${wallPlacements.length} at ${WALL_HEADINGS} headings`,
);
