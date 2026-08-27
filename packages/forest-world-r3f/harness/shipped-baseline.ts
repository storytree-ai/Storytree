// shipped-baseline.ts — WHAT THE SHIPPED FOREST MAP DRAWS TODAY, as authored numbers.
//
// THE QUESTION IT ANSWERS, from `adopt-the-land-into-the-shipped-map-arc-inc-01`: the arc's
// end state asks what the new land COSTS, and a cost is a difference. Nothing in this repo
// records what the shipped renderer costs now — `harness/hardware-floor.ts:240-241` reads
// three's own runtime counters, so the only figures that have ever existed came out of a
// browser and were never written down. This module is the AUTHORED half: the triangle count
// of `src/ForestWorldCanvas.tsx`'s scene derived from its own primitive arguments, so a
// runtime counter has something to be checked against.
//
// ⚠ IT IS DELIBERATELY NOT A RE-IMPLEMENTATION. Every formula here is a claim about what
// three.js generates for a primitive the SHIPPED FILE asks for, and `baseline-measure.mjs`
// REFUSES a run in which the browser's real `geometry.index.count / 3` disagrees with it.
// An authored count that quietly diverged from the file it describes is the failure mode this
// whole increment exists to prevent, so the two are held together by a refusal rather than by
// anyone remembering to re-derive.
//
// ⚠ THE PALETTE TRANSCRIPTION BELOW IS PINNED AGAINST THE SHIPPED SOURCE by
// `shipped-baseline.test.ts`, which reads `ForestWorldCanvas.tsx` and parses its map. A
// transcription nobody checks is how this codebase acquired two disagreeing palettes in the
// first place (`palette-band.ts` vs the shipped file vs `apps/studio/src/index.css`).

/** Three.js `CylinderGeometry` torso triangles.
 *
 *  Three emits TWO triangles per (radial x height) cell, except where one end has radius 0 —
 *  a cone's tip — where the degenerate triangle is dropped and only ONE is emitted per radial
 *  segment of that row. That exception is why a `coneGeometry` is not simply "a cylinder with
 *  a zero radius": it changes the count. */
export function cylinderTorsoTriangles(
  radialSegments: number,
  heightSegments: number,
  radiusTop: number,
  radiusBottom: number,
): number {
  const degenerateRows = (radiusTop === 0 ? 1 : 0) + (radiusBottom === 0 ? 1 : 0);
  const fullRows = heightSegments - degenerateRows;
  return radialSegments * (fullRows * 2 + degenerateRows);
}

/** Three.js cylinder END CAPS. A cap is a triangle fan of `radialSegments` triangles, and it
 *  is generated only when that end has a non-zero radius. */
export function cylinderCapTriangles(radialSegments: number, radiusTop: number, radiusBottom: number): number {
  return (radiusTop > 0 ? radialSegments : 0) + (radiusBottom > 0 ? radialSegments : 0);
}

/** A whole closed `CylinderGeometry` / `ConeGeometry`. */
export function cylinderTriangles(
  radialSegments: number,
  heightSegments: number,
  radiusTop: number,
  radiusBottom: number,
): number {
  return (
    cylinderTorsoTriangles(radialSegments, heightSegments, radiusTop, radiusBottom) +
    cylinderCapTriangles(radialSegments, radiusTop, radiusBottom)
  );
}

/** Three.js `CircleGeometry`: a fan of `segments` triangles. */
export function circleTriangles(segments: number): number {
  return segments;
}

/** Three.js `SphereGeometry`. The two polar rows are fans (one triangle per width segment);
 *  every row between them is two. */
export function sphereTriangles(widthSegments: number, heightSegments: number): number {
  if (heightSegments <= 1) return widthSegments;
  return widthSegments * (2 * (heightSegments - 1));
}

/** One primitive the shipped canvas asks for, named by where it is asked for. */
export interface ShippedPrimitive {
  /** The drawable family in `world-to-3d.ts` terms. */
  kind: string;
  /** `src/ForestWorldCanvas.tsx` line the primitive is written on. */
  source: string;
  /** The primitive call, verbatim enough to check against the file. */
  primitive: string;
  /** Triangles in ONE of them. */
  triangles: number;
  /** How many are drawn per drawable of this kind. */
  perDrawable: number;
}

/** ⚠ HEX_RADIUS / TILE_HEIGHT are transcribed from `src/ForestWorldCanvas.tsx:49-50`. They do
 *  not affect the triangle count (a cylinder's count is segment-driven), and are recorded
 *  because the SIZE is what a later reader compares against the harness's cell pitch. */
export const SHIPPED_HEX_RADIUS = 9;
export const SHIPPED_TILE_HEIGHT = 3;

/** Every primitive the shipped canvas draws, with its authored triangle count.
 *
 *  ⚠ `trail-strip` is ABSENT ON PURPOSE and its absence is a finding rather than an omission:
 *  `ForestWorldCanvas` takes `showTrails = false` as its default (ADR-0169 §3), so the shipped
 *  map draws no trail at all unless a mount opts in. A count for it would misreport the
 *  default scene. `trail-ghost-strip` is never drawn at any setting. */
export const SHIPPED_PRIMITIVES: readonly ShippedPrimitive[] = [
  {
    kind: 'hex-ground',
    source: 'ForestWorldCanvas.tsx:57',
    primitive: 'cylinderGeometry(9, 9, 3, 6)',
    triangles: cylinderTriangles(6, 1, 9, 9),
    perDrawable: 1,
  },
  {
    kind: 'story-tree/trunk',
    source: 'ForestWorldCanvas.tsx:77',
    primitive: 'cylinderGeometry(1.2, 1.6, 8)',
    triangles: cylinderTriangles(32, 1, 1.2, 1.6),
    perDrawable: 1,
  },
  {
    kind: 'story-tree/crown',
    source: 'ForestWorldCanvas.tsx:81',
    primitive: 'coneGeometry(7, 14, 8)',
    triangles: cylinderTriangles(8, 1, 0, 7),
    perDrawable: 1,
  },
  {
    kind: 'cave-arch',
    source: 'ForestWorldCanvas.tsx:110',
    primitive: 'circleGeometry(hw, 24)',
    triangles: circleTriangles(24),
    perDrawable: 1,
  },
  {
    kind: 'wisp-sprite',
    source: 'ForestWorldCanvas.tsx:121',
    primitive: 'sphereGeometry(2.2, 12, 12)',
    triangles: sphereTriangles(12, 12),
    perDrawable: 1,
  },
];

/** How many drawables of each kind a scene holds — the counts `worldTo3D` produced. */
export type DrawableCensus = Readonly<Record<string, number>>;

/** The authored triangle total for a census, and the per-kind breakdown behind it. */
export interface AuthoredCount {
  triangles: number;
  byKind: readonly { kind: string; drawables: number; triangles: number }[];
}

/** ⚠ A kind in the census with no primitive here contributes ZERO and is REPORTED, never
 *  silently dropped: a scene family the shipped canvas does not draw is exactly the thing a
 *  baseline must say out loud. */
export function authoredTriangles(census: DrawableCensus): AuthoredCount {
  const byKind: { kind: string; drawables: number; triangles: number }[] = [];
  let triangles = 0;
  for (const p of SHIPPED_PRIMITIVES) {
    const family = p.kind.split('/')[0] ?? p.kind;
    const drawables = census[family] ?? 0;
    const t = drawables * p.perDrawable * p.triangles;
    triangles += t;
    byKind.push({ kind: p.kind, drawables, triangles: t });
  }
  return { triangles, byKind };
}

/** The families `world-to-3d.ts` can emit that the shipped canvas draws NOTHING for.
 *  Named rather than inferred, so a new descriptor kind does not join this list by accident. */
export const SHIPPED_UNDRAWN: readonly { kind: string; why: string }[] = [
  {
    kind: 'trail-strip',
    why: 'drawn only when a mount passes showTrails; the default is false (ADR-0169 §3)',
  },
  {
    kind: 'trail-ghost-strip',
    why: 'never drawn on this canvas at any setting — the cave props carry the under-island run',
  },
  { kind: 'skipped', why: 'an audit record, not a drawable' },
];

/** The shipped canvas's OWN status palette, transcribed from `src/ForestWorldCanvas.tsx:30-37`.
 *
 *  ⚠⚠ THIS IS NOT THE PALETTE THE MAP SHIPS ELSEWHERE. `harness/palette-band.ts`'s
 *  `STATUS_TOKENS` and `apps/studio/src/index.css` carry a different, later vocabulary
 *  (ADR-0462: five colours over six states). These six values are what the R3F canvas draws
 *  today, and the divergence is a finding of this baseline rather than a defect it fixes.
 *  `shipped-baseline.test.ts` parses the shipped file and fails if this transcription drifts. */
export const SHIPPED_STATUS_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#4f9d5d'],
  ['mapped', '#5d8fa8'],
  ['building', '#7f8fd1'],
  ['proposed', '#c2b280'],
  ['unhealthy', '#8a5a44'],
  ['unknown', '#9a9a9a'],
]);

/** The six `SceneStatus` values, in the order this arc's reports print them. */
export const SHIPPED_STATUSES: readonly string[] = [
  'healthy',
  'mapped',
  'proposed',
  'building',
  'unhealthy',
  'unknown',
];

/** A minimal CLASSIC extruded-hex island — the substrate `world-to-3d.ts`'s `tile` case was
 *  written for, and the only one the shipped canvas can draw ground for.
 *
 *  ⚠ IT IS A CONTROL, NOT A FIXTURE TO BUILD ON. `scene.ts:658` documents `relaxedCells: null`
 *  as "the classic extruded-hex ground", and the studio ships the relaxed MESH instead. This
 *  exists so the claim "the shipped canvas draws no ground for a shipped-shape island" has a
 *  non-vacuity control beside it: the same mapper, the same call, ground drawn. Without the
 *  control that claim is equally satisfied by a mapper that is simply broken.
 *
 *  Typed as `unknown` at the boundary and cast once inside, so this pure module keeps its own
 *  narrow surface rather than re-exporting the semantic layer's whole `SceneInput` shape. */
export function classicHexScene(
  buildSceneFn: (input: never) => unknown,
  hexCentreFn: (h: { q: number; r: number }) => { x: number; y: number },
  tiles: readonly { q: number; r: number }[] = CLASSIC_TILES,
): unknown {
  const drawTiles = tiles.map((h) => ({ h, owner: 0 }));
  const centres = tiles.map((h) => hexCentreFn(h));
  const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const cy = centres.reduce((s, c) => s + c.y, 0) / centres.length;
  const input = {
    offset: { x: 0, y: 0 },
    width: 1200,
    height: 900,
    empties: [],
    relaxedCells: null,
    drawTiles,
    wheatSets: [new Set<string>()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      {
        id: 'classic-hex-control',
        status: 'healthy',
        caps: 0,
        centroid: { x: cx, y: cy },
        groundRadius: 70,
        screenRadius: 70 * Math.sin((20 * Math.PI) / 180),
        treeSpot: { x: cx, y: cy - 6 },
        labelY: cy + 46,
        coastPaths: [],
        decor: [],
        plants: [],
        treeTitle: 'classic-hex-control',
        wisps: [],
        plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: 'classic', subText: 'control', title: 'classic' },
      },
    ],
    vegetation: {},
  };
  return buildSceneFn(input as never);
}

/** The control island's tiles — a centre and its six neighbours. */
export const CLASSIC_TILES: readonly { q: number; r: number }[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];
