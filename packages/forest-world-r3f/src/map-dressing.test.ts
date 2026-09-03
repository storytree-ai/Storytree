// map-dressing.test.ts — THE ACCEPTANCE QUESTION IS A COUNT, NOT A PICTURE.
//
// ⚠⚠ The defect this module exists to prevent is INVISIBLE. A map that scatters one story's signed
// UAT criteria over its neighbours' islands draws perfectly ordinary islands wearing perfectly
// ordinary flowers; nothing in the frame says which story signed what. So the tests below assert
// ATTRIBUTION — every bloom on an island belongs to the story that island represents, and the
// map's total equals the number of criteria the scene actually signs.
//
// ⚠⚠ AND THEY DO IT ON A FIXTURE WITH TWO STORIES, which is the whole point: a one-island fixture
// is satisfied by a dressing that ignores attribution entirely, which is exactly the dressing this
// module replaced. The two stories sign DIFFERENT numbers of criteria, so a count that came from
// the wrong island is a different number rather than a coincidence.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelaxedCells,
  buildScene,
  hexCenter,
  type SceneInput,
  type SceneParcelInput,
  type SceneStatus,
  type SceneTerritoryInput,
} from '@storytree/forest-world';

import { SHIPPED_COAST, clipToCoast } from './coast-clip.js';
import { GROVE_BEACH, GROVE_WEAR_CEILING, islandExclusion } from './grove-dressing.js';
import { islandPaths, islandRims } from './island-path.js';
import { dressMapFromKit, dressMapWithGroves, signedCriteriaByIsland } from './map-dressing.js';
import { KIT_FOOTPRINTS_2026_08_29, isGrovePlacement } from './kit-vocabulary.js';
import { LAND_RELIEF_AMPLITUDE } from './land-relief.js';
import { WEAR_FALLOFF, wearOf } from './land-wear.js';
import { shoreField } from './shore-fall.js';
import { wearField } from './trail-wear.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from './world-to-3d.js';

const FOOT = KIT_FOOTPRINTS_2026_08_29;

// ---------------------------------------------------------------------------
// a TWO-STORY map — the smallest fixture that can catch the defect
// ---------------------------------------------------------------------------

/** Two islands, far enough apart that no cell of one is nearer a seed of the other. */
const TILES_A = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
] as const;
const TILES_B = [
  { q: 9, r: 0 },
  { q: 10, r: 0 },
  { q: 9, r: 1 },
] as const;

const STORY_A = 'atlas';
const STORY_B = 'beacon';

/** `signed` criteria proven, the rest pending — so a bloom count is not the criteria count. */
function criteria(prefix: string, total: number, signed: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `${prefix}-uat-${i}`,
    state: (i < signed ? 'proven' : 'pending') as 'proven' | 'pending',
  }));
}

function territory(
  id: string,
  tiles: readonly { q: number; r: number }[],
  caps: readonly string[],
  uat: { total: number; signed: number },
  status: SceneStatus = 'healthy',
): SceneTerritoryInput {
  const centres = tiles.map((h) => hexCenter(h));
  const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const cy = centres.reduce((s, c) => s + c.y, 0) / centres.length;
  const parcels: SceneParcelInput[] = caps.map((capId, i) => ({
    capId,
    status,
    testCount: 3,
    theme: 'meadow',
    seed: hexCenter(tiles[i % tiles.length]!),
  }));
  return {
    id,
    status,
    caps: parcels.length,
    centroid: { x: cx, y: cy },
    groundRadius: 70,
    screenRadius: 24,
    treeSpot: { x: cx, y: cy - 6 },
    labelY: cy + 46,
    coastPaths: [],
    decor: [],
    plants: [],
    treeTitle: id,
    wisps: [],
    parcels,
    uatCriteria: criteria(id, uat.total, uat.signed),
    plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: id, subText: id, title: id },
  };
}

/**
 * MEMOISED, and it is a `check:mutation-diff` requirement rather than an optimisation.
 *
 * ⚠⚠ THE RUNG'S VERDICT MOVES WITH THE SUITE'S WALL CLOCK. Stryker runs the covering tests once per
 * mutant against a per-mutant timeout; an assertion that kills a mutant in 20 ms on a quiet box
 * kills nothing at all on a loaded CI runner that never reaches it, and the mutant comes back
 * `Timeout` — which the rung scores UNPROVEN with the same "no test named" line an attribution gap
 * produces. Measured on this branch: five CI runs of an unchanged local-green tree reported 2, 2, 2,
 * 6 and then 31 unproven mutants — a MOVING set, which is the tell (`mutation-rung-scores-a-hang-as-unproven`
 * §9), and the 31-run followed a change that made the suite slower rather than any change to the
 * subject.
 *
 * `buildRelaxedCells` + `buildScene` + `worldTo3D` over two islands is most of this file's cost and
 * it is PURE, so the same arguments may return the same array. ⚠ Callers must not mutate it.
 */
const MAPS = new Map<string, Descriptor3D[]>();

/** The two-story map's descriptors — the shipped relaxed-MESH substrate, the one the studio emits. */
function twoStoryMap(
  a: { total: number; signed: number } = { total: 6, signed: 4 },
  b: { total: number; signed: number } = { total: 5, signed: 2 },
): Descriptor3D[] {
  const key = `${a.total}/${a.signed}|${b.total}/${b.signed}`;
  const cached = MAPS.get(key);
  if (cached) return cached;
  const drawTiles = [
    ...TILES_A.map((h) => ({ h, owner: 0 })),
    ...TILES_B.map((h) => ({ h, owner: 1 })),
  ];
  const wheatSets = [new Set<string>(), new Set<string>()];
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 1600,
    height: 900,
    empties: [],
    relaxedCells: buildRelaxedCells(drawTiles, wheatSets, 'mesh'),
    drawTiles,
    wheatSets,
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      territory(STORY_A, TILES_A, ['atlas-parse', 'atlas-store'], a),
      territory(STORY_B, TILES_B, ['beacon-emit'], b),
    ],
    vegetation: {},
  };
  const built = worldTo3D(buildScene(input));
  MAPS.set(key, built);
  return built;
}

const dress = (descriptors: readonly Descriptor3D[]) =>
  dressMapFromKit(descriptors, { relief: LAND_RELIEF_AMPLITUDE, footprint: FOOT });

/**
 * THE SIGNATURE COUNT, ASSERTED AS A WHOLE MAP — a cheap witness repeated across the tests below.
 *
 * ⚠⚠ IT IS REPEATED ON PURPOSE, and the reason is the rung rather than the reader. The line it
 * witnesses is `if (d.kind !== 'uat-bloom') continue` — the filter that keeps GROUND out of a count
 * of SIGNATURES. Mutate it either way and every cell-ground descriptor becomes a signature, so this
 * map goes from a handful to hundreds. Both mutants are killed by any one of these calls; CI's Bun
 * reporter could name NO killing test for either, twice, while every other mutant on the branch
 * resolved at least one. A mutant killed by many independent tests survives that reporter's
 * name-resolution gaps; a mutant killed by one does not.
 */
const assertSignatures = (map: readonly Descriptor3D[], want: Record<string, number>): void => {
  assert.deepEqual(Object.fromEntries(signedCriteriaByIsland(map)), want);
};

// ---------------------------------------------------------------------------
// the fixture is honest before anything is asserted about the dressing
// ---------------------------------------------------------------------------

test('NON-VACUITY: the fixture really is two islands, with cells and signatures on each', () => {
  // ⚠ A fixture that quietly produced ONE island — or no ground — would let every attribution
  // assertion below pass while proving nothing, which is exactly the shape the whole-map dressing
  // survived for a month.
  const map = twoStoryMap();
  const islands = new Set(
    map.filter((d) => d.kind === 'cell-ground').map((d) => (d.kind === 'skipped' ? '' : d.island)),
  );
  assert.deepEqual([...islands].sort(), [STORY_A, STORY_B], 'two islands, both named');
  for (const story of [STORY_A, STORY_B]) {
    const cells = map.filter((d) => d.kind === 'cell-ground' && d.island === story);
    assert.ok(cells.length > 3, `${story} drew only ${cells.length} cells`);
  }
  // ⚠ The same ground the count must NOT include. Asserting both here is what makes this a
  // non-vacuity check for the filter as well as for the fixture.
  assertSignatures(map, { [STORY_A]: 4, [STORY_B]: 2 });
});

// ---------------------------------------------------------------------------
// the count
// ---------------------------------------------------------------------------

test('each story signs its OWN criteria — the count is per island, and the two differ', () => {
  const signed = signedCriteriaByIsland(twoStoryMap({ total: 6, signed: 4 }, { total: 5, signed: 2 }));
  assert.equal(signed.get(STORY_A), 4, 'atlas signed four of its six');
  assert.equal(signed.get(STORY_B), 2, 'beacon signed two of its five');
  assert.equal(signed.size, 2, 'and no third island appeared');
});

test('an UNSIGNED criterion is not counted — the map may not invent a signature', () => {
  // ADR-0392 D5 / ADR-0398 D7: a unit reads as the state it holds and as no other. The scene
  // carries all eleven criteria either way; only the four PROVEN ones are signatures.
  const none = signedCriteriaByIsland(twoStoryMap({ total: 6, signed: 0 }, { total: 5, signed: 0 }));
  assert.equal(none.size, 0, 'nothing signed anywhere, so nothing counted anywhere');
  const all = signedCriteriaByIsland(twoStoryMap({ total: 6, signed: 6 }, { total: 5, signed: 5 }));
  assert.equal(all.get(STORY_A), 6);
  assert.equal(all.get(STORY_B), 5);
});

test('⚠⚠ EVERY BLOOM STANDS ON THE ISLAND OF THE STORY THAT SIGNED IT', () => {
  // ⚠⚠ THE ASSERTION THIS MODULE EXISTS FOR. Nothing in a rendered frame says which story a
  // flower belongs to, so this is asked of the geometry: a bloom placed for atlas must land inside
  // atlas's own ground, and atlas's ground and beacon's do not overlap.
  const map = twoStoryMap({ total: 6, signed: 4 }, { total: 5, signed: 2 });
  assertSignatures(map, { [STORY_A]: 4, [STORY_B]: 2 });
  const placements = dress(map);
  const blooms = placements.filter((p) => p.role === 'bloom');
  assert.equal(blooms.length, 6, 'four signatures on atlas and two on beacon');

  const boundsOf = (story: string) => {
    const xs = map
      .filter((d) => d.kind === 'cell-ground' && d.island === story)
      .flatMap((d) => (d.kind === 'skipped' ? [] : (d.points ?? []).map((p) => p.x)));
    return { min: Math.min(...xs), max: Math.max(...xs) };
  };
  const a = boundsOf(STORY_A);
  const b = boundsOf(STORY_B);
  assert.ok(a.max < b.min, 'the fixture keeps the two islands disjoint in x');

  // Four blooms in atlas's span, two in beacon's, and none in the gap between them.
  const inA = blooms.filter((p) => p.at.x >= a.min && p.at.x <= a.max);
  const inB = blooms.filter((p) => p.at.x >= b.min && p.at.x <= b.max);
  assert.equal(inA.length, 4, `atlas signed four; ${inA.length} flowers stand on it`);
  assert.equal(inB.length, 2, `beacon signed two; ${inB.length} flowers stand on it`);
  assert.equal(inA.length + inB.length, blooms.length, 'no bloom stands off both islands');
});

test('a story that signed NOTHING grows nothing, even beside one that signed everything', () => {
  // ⚠ THE FAILURE THAT MOTIVATED THE UNIT, stated as a test: under the whole-map dressing, six
  // signatures held by atlas were scattered over every cell on the map, so beacon — which had
  // signed nothing — grew flowers. The picture asserted a signature nobody gave.
  const map = twoStoryMap({ total: 6, signed: 6 }, { total: 5, signed: 0 });
  assertSignatures(map, { [STORY_A]: 6 });
  const blooms = dress(map).filter((p) => p.role === 'bloom');
  assert.equal(blooms.length, 6);
  const bXs = map
    .filter((d) => d.kind === 'cell-ground' && d.island === STORY_B)
    .flatMap((d) => (d.kind === 'skipped' ? [] : (d.points ?? []).map((p) => p.x)));
  const bMin = Math.min(...bXs);
  for (const bloom of blooms) {
    assert.ok(bloom.at.x < bMin, `a bloom stood on the story that signed nothing (x=${bloom.at.x})`);
  }
});

test('the map still grows ONE object per capability, on the capability’s own parcel', () => {
  // Per-island dressing must not cost the ADR-0475 vocabulary anything: three capabilities across
  // two islands are still three trees, each carrying its own capId.
  const map = twoStoryMap();
  assertSignatures(map, { [STORY_A]: 4, [STORY_B]: 2 });
  const placements = dress(map);
  const caps = placements.filter((p) => p.role !== 'bloom').map((p) => p.capId);
  assert.deepEqual([...caps].sort(), ['atlas-parse', 'atlas-store', 'beacon-emit']);
});

// ---------------------------------------------------------------------------
// the absences, which are the fail-CLOSED direction
// ---------------------------------------------------------------------------

test('a bloom the substrate could not attribute is DROPPED, never spread', () => {
  // A signature with no island is one that could be drawn anywhere; refusing to count it means
  // such a story grows nothing, never that every story grows its neighbour's.
  const orphan: Descriptor3D[] = [
    { kind: 'uat-bloom', transform: { x: 0, y: 0, z: 0 }, group: 'uat-bloom', criterion: 'x' },
    { kind: 'uat-bloom', transform: { x: 1, y: 0, z: 0 }, group: 'uat-bloom', island: 'home', criterion: 'y' },
  ];
  const signed = signedCriteriaByIsland(orphan);
  assert.deepEqual([...signed], [['home', 1]], 'only the attributed signature counted');
});

test('the same criterion twice is ONE signature; unstamped markers are counted individually', () => {
  // ⚠⚠ THE SHAPE OF THIS FIXTURE IS ARITHMETIC, NOT TASTE — 4 named of which 2 are distinct, and
  // 2 unnamed, so the honest answer is 4. Every nearby fixture is satisfied by a reader that has
  // the two branches CONFUSED, and `check:mutation-diff` found each of them in turn:
  //   · with 1 unnamed, treating an unnamed marker as a named one gives {a, b, undefined} = 3,
  //     which is what 2 distinct + 1 unnamed also gives;
  //   · with 3 named and 2 unnamed, SWAPPING the branches gives 3 + 1 = 4, and so does 2 + 2.
  // Here the four readings separate: correct 4, branches swapped 5, unnamed treated as named 3,
  // named treated as unnamed 6.
  const doubled: Descriptor3D[] = [
    { kind: 'uat-bloom', transform: { x: 0, y: 0, z: 0 }, group: 'uat-bloom', island: 'home', criterion: 'a' },
    { kind: 'uat-bloom', transform: { x: 1, y: 0, z: 0 }, group: 'uat-bloom', island: 'home', criterion: 'a' },
    { kind: 'uat-bloom', transform: { x: 2, y: 0, z: 0 }, group: 'uat-bloom', island: 'home', criterion: 'a' },
    { kind: 'uat-bloom', transform: { x: 3, y: 0, z: 0 }, group: 'uat-bloom', island: 'home', criterion: 'b' },
    // No id at all: a distinct marker the core simply did not stamp. Folding these onto one absent
    // key would UNDER-report, which is the opposite error from the one this module guards.
    { kind: 'uat-bloom', transform: { x: 4, y: 0, z: 0 }, group: 'uat-bloom', island: 'home' },
    { kind: 'uat-bloom', transform: { x: 5, y: 0, z: 0 }, group: 'uat-bloom', island: 'home' },
  ];
  assert.equal(signedCriteriaByIsland(doubled).get('home'), 4, 'two distinct named + two unnamed');
});

test('cells the substrate cannot attribute still grow their capabilities’ trees, and no blooms', () => {
  // The classic extruded-hex substrate and hand-built fragments carry no island group. Dropping
  // those cells would shrink the map; growing a per-STORY claim on them would attribute it to a
  // story that does not exist. So: trees yes, blooms no.
  const ring = [
    { x: 0, y: 0, z: 0 },
    { x: 40, y: 0, z: 0 },
    { x: 40, y: 0, z: 40 },
    { x: 0, y: 0, z: 40 },
  ];
  const unattributed: Descriptor3D[] = [
    {
      kind: 'cell-ground',
      transform: { x: 20, y: 0, z: 20 },
      group: 'cell-ground',
      material: 'healthy',
      points: ring,
      parcel: 'lonely-cap',
    },
    { kind: 'uat-bloom', transform: { x: 20, y: 0, z: 20 }, group: 'uat-bloom', criterion: 'c' },
  ];
  const placements = dress(unattributed);
  assert.equal(placements.filter((p) => p.role === 'bloom').length, 0, 'no unattributed bloom');
  assert.deepEqual(
    placements.filter((p) => p.role !== 'bloom').map((p) => p.capId),
    ['lonely-cap'],
    'the capability still owns a tree',
  );
});

test('an island is dressed against its OWN occupancy — it looks the same alone as in a crowd', () => {
  // ⚠ A PROPERTY THE WHOLE-MAP CALL DID NOT HAVE. One `dressIslandFromKit` over every cell shares
  // one occupancy list, so adding a second island could move the FIRST island's props. Per-island
  // calls make an island's dressing a function of that island alone — which is what lets a
  // single-island instrument picture what the crowd will draw.
  const alone = dress(twoStoryMap({ total: 6, signed: 4 }, { total: 0, signed: 0 })).filter(
    (p) => p.capId.startsWith('atlas') || p.capId === 'story',
  );
  const crowded = dress(twoStoryMap({ total: 6, signed: 4 }, { total: 5, signed: 5 })).filter(
    (p) => p.capId.startsWith('atlas') || p.capId === 'story',
  );
  // `story` placements exist on both islands, so compare only those inside atlas's own span.
  const map = twoStoryMap();
  const aMax = Math.max(
    ...map
      .filter((d) => d.kind === 'cell-ground' && d.island === STORY_A)
      .flatMap((d) => (d.kind === 'skipped' ? [] : (d.points ?? []).map((p) => p.x))),
  );
  assert.deepEqual(
    crowded.filter((p) => p.at.x <= aMax),
    alone.filter((p) => p.at.x <= aMax),
    'beacon’s signatures moved atlas’s props',
  );
});

test('the dressing is deterministic — the same map dresses identically twice', () => {
  assertSignatures(twoStoryMap(), { [STORY_A]: 4, [STORY_B]: 2 });
  assert.deepEqual(dress(twoStoryMap()), dress(twoStoryMap()));
});

test('GROUND IS NOT A SIGNATURE — a map of nothing but cells signs nothing', () => {
  // ⚠ The filter's own claim, stated with no bloom in the stream at all: a `cell-ground` carries an
  // island and no criterion, so a reader that let ground through would report one signature per
  // cell — a story asserted to hold 164 signed criteria because its land has 164 parcels.
  const ground = twoStoryMap({ total: 6, signed: 0 }, { total: 5, signed: 0 });
  assert.ok(
    ground.filter((d) => d.kind === 'cell-ground').length > 10,
    'the fixture must carry ground for this to say anything',
  );
  assert.equal(ground.filter((d) => d.kind === 'uat-bloom').length, 0, 'and no signature at all');
  assertSignatures(ground, {});
});

// ---------------------------------------------------------------------------
// THE GROVES (2026-09-03) — grown on the healthy island, and only there
// ---------------------------------------------------------------------------
//
// ⚠ A BIGGER FIXTURE FOR THIS HALF: seven hexes per island rather than three, so the island holds
// stands worth counting once the beach band and the capability trees have taken their clearance.
// The two islands are far apart in x, as above, and their STATUSES are the fixture's parameter —
// which is the whole question here.

const RING_A = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
] as const;
const RING_B = RING_A.map((h) => ({ q: h.q + 14, r: h.r }));

const BIG_MAPS = new Map<string, Descriptor3D[]>();

/** Two seven-hex islands, each of the status asked for, each signing every criterion it holds.
 *  Memoised for the same mutation-rung reason `twoStoryMap` is. */
function bigMap(aStatus: SceneStatus = 'healthy', bStatus: SceneStatus = 'healthy'): Descriptor3D[] {
  const key = `${aStatus}|${bStatus}`;
  const cached = BIG_MAPS.get(key);
  if (cached) return cached;
  const drawTiles = [...RING_A.map((h) => ({ h, owner: 0 })), ...RING_B.map((h) => ({ h, owner: 1 }))];
  const wheatSets = [new Set<string>(), new Set<string>()];
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 1600,
    height: 900,
    empties: [],
    relaxedCells: buildRelaxedCells(drawTiles, wheatSets, 'mesh'),
    drawTiles,
    wheatSets,
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      territory(STORY_A, RING_A, ['atlas-parse', 'atlas-store', 'atlas-sign'], { total: 3, signed: 3 }, aStatus),
      territory(STORY_B, RING_B, ['beacon-emit', 'beacon-ack'], { total: 2, signed: 2 }, bStatus),
    ],
    vegetation: {},
  };
  const built = worldTo3D(buildScene(input));
  BIG_MAPS.set(key, built);
  return built;
}

const dressGroved = (descriptors: readonly Descriptor3D[]) =>
  dressMapWithGroves(descriptors, { relief: LAND_RELIEF_AMPLITUDE, footprint: FOOT });

const groundOf = (map: readonly Descriptor3D[], story: string): InstanceDescriptor[] =>
  map.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground' && d.island === story);

const spanOf = (map: readonly Descriptor3D[], story: string) => {
  const xs = groundOf(map, story).flatMap((d) => (d.points ?? []).map((p) => p.x));
  return { min: Math.min(...xs), max: Math.max(...xs) };
};

test('the vocabulary-only dressing grows no grove; the shipped dressing grows one on the healthy island ONLY', () => {
  const map = bigMap('healthy', 'proposed');
  assert.equal(dress(map).filter(isGrovePlacement).length, 0, 'dressMapFromKit grew a grove');
  const groved = dressGroved(map);
  const groves = groved.filter(isGrovePlacement);
  assert.ok(groves.length > 0, 'the healthy island grew no grove');
  const a = spanOf(map, STORY_A);
  const b = spanOf(map, STORY_B);
  assert.ok(a.max < b.min, 'the fixture keeps the two islands disjoint in x');
  for (const g of groves) assert.ok(g.at.x >= a.min && g.at.x <= a.max, `a grove pine off the healthy island at x=${g.at.x}`);
  assert.equal(groves.filter((g) => g.at.x >= b.min).length, 0, 'the proposed island wears a grove');
  // ⚠ AND THE VOCABULARY IS UNTOUCHED BY IT: the non-grove placements are `dressMapFromKit`'s own,
  // in order — the grove is placed AFTER each island's objects and moves none of them.
  assert.deepEqual(groved.filter((p) => !isGrovePlacement(p)), dress(map));
});

test('no story that is not healthy grows a grove — unknown, unhealthy, mapped, building, proposed', () => {
  for (const status of ['unknown', 'unhealthy', 'mapped', 'building', 'proposed'] as const) {
    assert.equal(dressGroved(bigMap(status, status)).filter(isGrovePlacement).length, 0, `${status} grew a grove`);
  }
  // NON-VACUITY: both healthy, both grow — and two islands of one shape are not one grove twice,
  // because the seed is the island's id.
  const map = bigMap('healthy', 'healthy');
  const both = dressGroved(map).filter(isGrovePlacement);
  const a = spanOf(map, STORY_A);
  const b = spanOf(map, STORY_B);
  const inA = both.filter((g) => g.at.x <= a.max);
  const inB = both.filter((g) => g.at.x >= b.min);
  assert.ok(inA.length > 0 && inB.length > 0, `${inA.length} on atlas, ${inB.length} on beacon`);
  assert.equal(inA.length + inB.length, both.length, 'a grove pine in the sea between them');
  assert.notDeepEqual(
    inA.map((g) => Number((g.at.x - a.min).toFixed(3))),
    inB.map((g) => Number((g.at.x - b.min).toFixed(3))),
  );
});

test('⚠⚠ THE GROVE KEEPS OFF THE BEACH AND THE PATH, judged by the ground’s OWN distance fields', () => {
  const map = bigMap('healthy', 'proposed');
  // A trail strip arriving from the east and ending ON the healthy island's clipped rim — its
  // easternmost rim vertex — so the connector docks it there and wears a path to the centroid.
  const clippedA = clipToCoast(groundOf(map, STORY_A), SHIPPED_COAST);
  const rim = islandRims(clippedA).find((r) => r.island === STORY_A);
  assert.ok(rim !== undefined, 'the healthy island has no rim');
  let landing = rim.loops[0]![0]!;
  for (const loop of rim.loops) for (const p of loop) if (p.x > landing.x) landing = p;
  const offshore = { x: landing.x + 40, z: landing.z };
  const strip: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: (landing.x + offshore.x) / 2, y: 0, z: landing.z },
    group: 'trail-strip',
    points: [
      { x: offshore.x, y: 0, z: offshore.z },
      { x: (landing.x + offshore.x) / 2, y: 0, z: landing.z },
      { x: landing.x, y: 0, z: landing.z },
    ],
    width: 3,
    usage: 1,
    hidden: false,
    edges: [],
    segment: `${STORY_A}/east`,
  };
  const withStrip = [...map, strip];
  const paths = [...islandPaths(clippedA, [strip]).values()].flat();
  assert.ok(paths.length === 1 && paths[0]!.length > 2, 'the strip docked nowhere — the fixture proves nothing');

  const groves = dressGroved(withStrip).filter(isGrovePlacement);
  assert.ok(groves.length > 0);
  const wear = wearField(paths, WEAR_FALLOFF);
  const shore = shoreField(clippedA, GROVE_BEACH);
  for (const g of groves) {
    assert.ok(wearOf(wear.sample(g.at.x, g.at.z).distance) < GROVE_WEAR_CEILING, `a grove pine on the path at ${g.at.x}, ${g.at.z}`);
    assert.ok(shore.sample(g.at.x, g.at.z).distance >= GROVE_BEACH, `a grove pine on the beach at ${g.at.x}, ${g.at.z}`);
  }
  // ⚠ NON-VACUITY: the exclusion the dressing honoured CAN refuse — a point on the path, the
  // landing itself (which sits on the coast), the centroid the one-dock path ends at — and every
  // grove pine passes it.
  const ex = islandExclusion(withStrip, STORY_A);
  const onPath = paths[0]![Math.floor(paths[0]!.length / 2)]!;
  assert.equal(ex.clear(onPath.x, onPath.z), false, 'the path’s middle is clear — the path never reached the exclusion');
  assert.equal(ex.clear(landing.x, landing.z), false, 'the coast is clear — the beach never reached the exclusion');
  assert.equal(ex.clear(rim.centroid.x, rim.centroid.z), false, 'the one-dock path ends at the centroid');
  for (const g of groves) assert.equal(ex.clear(g.at.x, g.at.z), true);
  // And WITHOUT the strip the centroid is clear, which is what shows the refusal came from the dock.
  assert.equal(islandExclusion(map, STORY_A).clear(rim.centroid.x, rim.centroid.z), true);
});

test('the groved dressing is deterministic — the same map dresses identically twice', () => {
  assert.deepEqual(dressGroved(bigMap('healthy', 'proposed')), dressGroved(bigMap('healthy', 'proposed')));
});
