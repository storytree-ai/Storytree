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

// ⚠ The harness may import `src/`; the reverse is fenced (`scope-fence.test.ts`). `cellGroundTriangles`
// is imported rather than transcribed because it is the ONE number in this module that a second copy
// could silently disagree with — every other count here is authored against three.js, which this
// repo does not own, so a transcription is the only option there and a refusal holds it.
import { cellGroundTriangles } from '../src/cell-ground-geometry.js';
import type { Descriptor3D } from '../src/world-to-3d.js';
import { LIGHT_DIRECTION, SHADE_LEVELS } from '../src/shade-ladder.js';

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
 *  baseline must say out loud.
 *
 *  ⚠⚠ `cell-ground` CANNOT BE A ROW IN {@link SHIPPED_PRIMITIVES} and its absence there is not
 *  an omission. Every other family is a fixed primitive whose triangle count is the same for
 *  every drawable, so "drawables x triangles" is the whole story. A parcel is an arbitrary
 *  polygon: an n-vertex ring costs `cellGroundTriangles(n)` and n varies parcel to parcel, so
 *  the count is a property of the SCENE and not of the family. It is passed in via
 *  `cellGroundTrianglesFor(descriptors)` rather than guessed from a mean ring length — a mean
 *  would make the authored total approximately right, and `baseline-measure.mjs` refuses a run
 *  where authored and measured disagree precisely so that "approximately" is never available. */
export function authoredTriangles(census: DrawableCensus, cellGroundTriangleTotal = 0): AuthoredCount {
  const byKind: { kind: string; drawables: number; triangles: number }[] = [];
  let triangles = 0;
  for (const p of SHIPPED_PRIMITIVES) {
    const family = p.kind.split('/')[0] ?? p.kind;
    const drawables = census[family] ?? 0;
    const t = drawables * p.perDrawable * p.triangles;
    triangles += t;
    byKind.push({ kind: p.kind, drawables, triangles: t });
  }
  const parcels = census['cell-ground'] ?? 0;
  if (parcels > 0 || cellGroundTriangleTotal > 0) {
    triangles += cellGroundTriangleTotal;
    byKind.push({ kind: 'cell-ground', drawables: parcels, triangles: cellGroundTriangleTotal });
  }
  return { triangles, byKind };
}

/** The authored triangle total for the `cell-ground` parcels in a descriptor set — summed from
 *  each parcel's OWN ring length, which is the only honest way to count a family whose members
 *  differ. Mirrors `cellGroundTriangles` in `src/`, which is where the shape is decided. */
export function cellGroundTrianglesFor(descriptors: readonly Descriptor3D[]): number {
  let total = 0;
  for (const d of descriptors) {
    if (d.kind !== 'cell-ground') continue;
    total += cellGroundTriangles(d.points?.length ?? 0);
  }
  return total;
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

/** ⚠ THE TWO GROUND SUBSTRATES DIFFER BY EXACTLY ONE FACE PER PARCEL, and it is recorded rather
 *  than smoothed over. The classic `cylinderGeometry` prism carries a BOTTOM cap because three
 *  generates one and the shipped file does not ask it not to; `cellGroundGeometry` emits none,
 *  since the map is viewed from above and the parcels tile the island with no gaps. So a
 *  like-for-like triangle comparison between the two substrates is off by `ringLength` per
 *  parcel in the classic path's favour, and a reader comparing the two columns should know that
 *  before concluding the mesh ground is cheaper than it is. */
export const CELL_GROUND_HAS_NO_BOTTOM_CAP = true;

/** What the shipped mapper produced for the mesh-substrate fixture BEFORE the `cell` case
 *  existed. Kept as data, not prose: it is the other half of every "what did this cost" answer
 *  this arc gives, and PR #1679's report is the only other place it is written down. */
export const BEFORE_THE_CELL_CASE = {
  hexGround: 0,
  cellGround: 0,
  skippedCells: 164,
  storyTree: 1,
  triangles: 144,
  drawCalls: 2,
} as const;

/** THE RETIRED SPIKE PALETTE — FROZEN HISTORY, NOT A TRANSCRIPTION OF ANYTHING LIVE.
 *
 *  These are the six colours `src/ForestWorldCanvas.tsx` drew until 2026-08-28, under a single
 *  `STATUS_COLOUR` map whose own comment called it "a spike palette, not art direction". It
 *  disagreed with `apps/studio/src/index.css` and `harness/palette-band.ts` on ALL SIX states:
 *  `mapped` was this BLUE where ADR-0470 settled a tilled clay, `unhealthy` a BROWN where the
 *  decision says a charred near-black, and `building` still owned a periwinkle after ADR-0462
 *  merged it into `proposed`'s yellow.
 *
 *  ⚠ IT IS KEPT, AND KEPT FROZEN, FOR ONE REASON: it is the state the guard has to be able to
 *  refuse. `palette-transcription.test.ts` runs the check against exactly this table and asserts
 *  it says no — which is how "the check can fail" stays a property of the suite rather than a
 *  claim in a commit message that decays the moment anyone touches the parser. Freezing the data
 *  a proof is about, beside the proof, is the same discipline `ADR0462_STATUS_TOKENS` follows in
 *  `status-vocabulary.ts`.
 *
 *  It is DELIBERATELY no longer parsed out of the shipped file — the shipped file no longer holds
 *  it. `shipped-baseline.test.ts` asserts that: a frozen "before" that still matched the live
 *  source would mean the fix never landed. */
export const SPIKE_STATUS_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#4f9d5d'],
  ['mapped', '#5d8fa8'],
  ['building', '#7f8fd1'],
  ['proposed', '#c2b280'],
  ['unhealthy', '#8a5a44'],
  ['unknown', '#9a9a9a'],
]);

/** WHAT THE SHIPPED CANVAS DRAWS NOW — the GROUND, one colour per parcel.
 *
 *  Transcribed from `src/ForestWorldCanvas.tsx`'s `GROUND_COLOUR`, and pinned against it by
 *  `shipped-baseline.test.ts`. These are the authoring surface's own `--hex-top-0` values: the
 *  canvas has no per-cell variant hash, so it holds each family's FIRST authored variant and not
 *  the three the CSS and `palette-band.ts` carry.
 *
 *  ⚠ FIVE COLOURS OVER SIX STATES (ADR-0462) — `proposed` and `building` share the yellow. Six
 *  DISTINCT values here would be a regression, not a completion. */
export const SHIPPED_GROUND_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#8cb85e'],
  ['mapped', '#b7684e'],
  ['building', '#d8c069'],
  ['proposed', '#d8c069'],
  ['unhealthy', '#57544a'],
  ['unknown', '#9ca3af'],
]);

/** WHAT THE SHIPPED CANVAS DRAWS NOW — the story tree's CROWN.
 *
 *  ⚠ IT IS A SECOND TABLE BECAUSE GROUND AND CROWN LEGITIMATELY DIFFER, and `building` is where
 *  that is visible: the app authors no `--crown-building-*` pair, so a building crown falls
 *  through to `unknown`'s slate while its ground wears `proposed`'s yellow. Before 2026-08-28 ONE
 *  lookup painted both, which is why correcting the palette was a split rather than a swap — a
 *  wholesale replacement would have fixed the land and repainted every canopy with a ground
 *  colour. Transcribed from `CROWN_COLOUR` and pinned against it by the same test. */
export const SHIPPED_CROWN_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#2f6b3f'],
  ['mapped', '#7d5f3b'],
  ['building', '#6b7280'],
  ['proposed', '#b06a24'],
  ['unhealthy', '#9f2d22'],
  ['unknown', '#6b7280'],
]);

/** THE SHIPPED CANVAS'S LIGHT AND GROUND, as authored numbers — so a comparison drawn in raw
 *  three is lit the way the product is rather than the way its author remembered.
 *
 *  ⚠ IT IS A TRANSCRIPTION AND IT IS PINNED, exactly as the palette above is. Every previous
 *  transcription in this package that nobody checked ended up disagreeing with its source — the
 *  three status palettes, and `frameWorld` quoted against line numbers that had already moved.
 *  `shipped-baseline.test.ts` parses `ForestWorldCanvas.tsx` and refuses any drift from these.
 *
 *  ⚠ AND IT MATTERS MORE FOR RELIEF THAN FOR ANYTHING BEFORE IT. Relief is a LIGHTING operation:
 *  it moves no colour and adds no mark, so the entire visible difference is `dot(n, L)` against
 *  THIS light direction. A comparison lit from somewhere else would be a picture of a land the
 *  map does not draw. */
export const SHIPPED_LIGHTING = {
  /**
   * `<ambientLight intensity={…} />`.
   *
   * ⚠⚠ DERIVED FROM THE LADDER SINCE 2026-08-30, and this too is a finding rather than a
   * tidy-up. It was `0.7` against a directional `1.1`, chosen when every lit object on this map
   * was a flat placeholder cone or cylinder whose own colour was the whole picture — for those,
   * 1.8 of total intensity is merely bright. The bought kit is the first thing here with a
   * TEXTURE, and 1.8 saturates it: the first dressed frame delivered pale grey needles on PINK
   * trunks, which reads as a broken asset and is actually an overexposed one.
   *
   * The ladder already says what "lit" and "unlit" mean on this map, so the intensities are read
   * off it — exactly the pair `calibrateLights` starts from: a fully lit white face lands on the
   * ladder's TOP rung and an unlit one on its FLOOR, which is the range the ground beside it is
   * quantised into.
   *
   * ⚠ WHAT IS NOT DONE HERE is that calibration's second half. `calibrateLights` then PROBES a
   * live renderer and scales both intensities by `target / probe`, because a standard material's
   * real response includes a specular term this arithmetic does not model. The shipped canvas runs
   * no probe, so what it hangs is the authored intent rather than the measured correction — named
   * rather than silently approximated, and it is what a later increment would close.
   */
  ambientIntensity: SHADE_LEVELS[0]!,
  /**
   * `<directionalLight position={…} />`, in world units.
   *
   * ⚠⚠ DERIVED FROM `LIGHT_DIRECTION` SINCE 2026-08-30, NOT TRANSCRIBED — and the change is a
   * finding rather than a tidy-up. It was the literal `[120, 300, 80]`, which normalises to
   * (+0.36, +0.90, +0.24): the OPPOSITE SIDE IN X from the land's own authored sun at
   * (-0.45, +0.83, +0.35). So every lit object on the shipped map was lit from the east while
   * the ground beside it was banded — and, once the shadow field crossed, CAST ITS SHADOWS —
   * from the west. The story tree carried that alone for months; a stand of bought trees cannot,
   * which is what surfaced it.
   *
   * The canvas now hangs the light along `LIGHT_DIRECTION` too, so there is no transcription left
   * to drift: both read one constant. The distance is arbitrary (a directional light has a
   * direction, not a position) and only has to sit outside any world.
   */
  directionalPosition: [
    LIGHT_DIRECTION.x * 400,
    LIGHT_DIRECTION.y * 400,
    LIGHT_DIRECTION.z * 400,
  ] as readonly [number, number, number],
  /** `<directionalLight intensity={…} />` — what carries a face from the ladder's floor to its
   *  top rung. Derived with the ambient above; see its note. */
  directionalIntensity: SHADE_LEVELS[SHADE_LEVELS.length - 1]! - SHADE_LEVELS[0]!,
  /** `<color attach="background" args={[…]} />` */
  background: '#101418',
} as const;

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
