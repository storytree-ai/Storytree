// grove-dressing.test.ts — the grove pass, proved where it lives.
//
// ⚠ IN `src/` FOR THE MUTATION RUNG'S SAKE, like `kit-vocabulary.test.ts`: `check:mutation-diff`
// mutates a project's `src/` only, and a `src/` module proved from `harness/` buys it nothing.
//
// ⚠ THE ISLANDS HERE ARE BUILT, NOT LOADED, and the exclusion is INJECTED where the dressing is
// under test — the pass takes its cells, its standing objects and its exclusion as arguments
// precisely so the acceptance rule and the draws can be proved apart. The real exclusion (the
// clipped coast, the trail docks' worn path) is proved on its own fixture below, through the SAME
// distance walks the ground layers sample with.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GROVE_BEACH,
  GROVE_MEMBERS_MAX,
  GROVE_MEMBERS_MIN,
  GROVE_MEMBER_TRIES,
  GROVE_DENSITY,
  GROVE_DENSITY_RUNGS,
  GROVE_SCALE_MAX,
  GROVE_SCALE_MIN,
  GROVE_SIGMA_X,
  GROVE_SIGMA_Z,
  GROVE_STATUS,
  GROVE_WEAR_CEILING,
  RECIPE_ISLAND_AREA,
  RECIPE_ISLAND_ASPECT,
  RECIPE_STANDS,
  STAND_CANDIDATES,
  beachClear,
  cellAt,
  cellsArea,
  cellsAspect,
  cellsBounds,
  dressGroves,
  gaussian,
  groveEligible,
  groveExclusion,
  groveNeed,
  groveSigma,
  groveStandCount,
  crossingIsRight,
  crossingX,
  insideRing,
  islandExclusion,
  memberAssembly,
  memberCount,
  memberPoint,
  memberScale,
  memberYaw,
  pathClear,
  ringArea,
  standCeiling,
  standCentre,
  standingOccupants,
  straddles,
  type GroveExclusion,
  type GroveOccupant,
  type Stream,
} from './grove-dressing.js';
import { islandSeed } from './island-path.js';
import {
  GROVE_CAP_ID,
  GROVE_CLEARANCE,
  KIT_FOOTPRINTS_2026_08_29,
  KIT_ROLE_ASSEMBLIES,
  bestCandidate,
  candidatePoints,
  capabilityFactsFrom,
  dressIslandFromKit,
  dressingOverlaps,
  isGrovePlacement,
  propRadius,
  propStream,
  type KitPlacement,
} from './kit-vocabulary.js';
import { landHeight } from './land-relief.js';
import { SAND_SHIPPED_BEACH_WIDTH } from './land-sand.js';
import { WEAR_FALLOFF, wearOf } from './land-wear.js';
import type { GPoint, LayoutCell } from './parcel-cells.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

const FOOT = KIT_FOOTPRINTS_2026_08_29;
const TREE_RADIUS = propRadius(FOOT, 'tree');

// ---------------------------------------------------------------------------
// a built island — the same hostile shape `kit-vocabulary.test.ts` uses
// ---------------------------------------------------------------------------

const CELL_W = 34;
const CELL_D = 26;
const ORIGIN_X = 140;
const ORIGIN_Z = -70;

function parcel(capId: string | undefined, status: string, row: number, cols: number): LayoutCell[] {
  return Array.from({ length: cols }, (_, c) => {
    const x0 = ORIGIN_X + c * CELL_W;
    const z0 = ORIGIN_Z + row * CELL_D;
    return {
      points: [
        { x: x0, z: z0 },
        { x: x0 + CELL_W, z: z0 },
        { x: x0 + CELL_W, z: z0 + CELL_D },
        { x: x0, z: z0 + CELL_D },
      ],
      parcel: capId,
      island: 'built',
      status,
      cellId: `${capId ?? 'none'}-${row}-${c}`,
    } satisfies LayoutCell;
  });
}

/** An island of `states.length` capabilities, one parcel-row each, `cols` cells wide. */
function island(states: readonly string[], cols = 4): LayoutCell[] {
  return states.flatMap((status, row) => parcel(`cap-${row}`, status, row, cols));
}

/** Four healthy parcels, four cells each: 136 x 104 units, 14,144 sq units — 7 stands at rung 1. */
const HEALTHY = island(['healthy', 'healthy', 'healthy', 'healthy']);

const ALLOW: GroveExclusion = { clear: () => true };
const REFUSE: GroveExclusion = { clear: () => false };

function standingOn(cells: readonly LayoutCell[], blooms = 3): KitPlacement[] {
  return dressIslandFromKit({
    cells,
    facts: capabilityFactsFrom(cells),
    blooms,
    relief: 0,
    footprint: FOOT,
  });
}

function grovesOn(
  cells: readonly LayoutCell[],
  over: {
    island?: string;
    exclusion?: GroveExclusion;
    relief?: number;
    standing?: KitPlacement[];
    density?: number;
  } = {},
): KitPlacement[] {
  return dressGroves({
    island: over.island ?? 'built',
    cells,
    standing: over.standing ?? standingOn(cells),
    footprint: FOOT,
    relief: over.relief ?? 0,
    exclusion: over.exclusion ?? ALLOW,
    density: over.density ?? GROVE_DENSITY,
  });
}

/** A stream that replays a scripted list, then fails loudly. */
function scripted(values: readonly number[]): Stream {
  let i = 0;
  return () => {
    const v = values[i];
    i += 1;
    if (v === undefined) throw new Error(`scripted stream ran out after ${values.length} draws`);
    return v;
  };
}

// ---------------------------------------------------------------------------
// the recipe's numbers, as constants a report can quote
// ---------------------------------------------------------------------------

test('the constants are the recipe’s own — build_land.py’s scatter(), forest variant', () => {
  assert.equal(RECIPE_STANDS, 13, ':1036 stands=13');
  assert.equal(GROVE_MEMBERS_MIN, 4, ':1036 per_stand=(4, 8)');
  assert.equal(GROVE_MEMBERS_MAX, 8);
  assert.equal(GROVE_SIGMA_X, 3.6, ':1064 gauss(0, 3.6)');
  assert.equal(GROVE_SIGMA_Z, 3.0, ':1064 gauss(0, 3.0)');
  assert.equal(GROVE_WEAR_CEILING, 0.3, ':1046 wear < 0.30');
  assert.equal(GROVE_MEMBER_TRIES, 30, ':1063 range(30)');
  assert.equal(RECIPE_ISLAND_ASPECT, 135.1 / 233.8, ':88 ASPECT');
  assert.equal(RECIPE_ISLAND_AREA, 24631.8, 'the fixture island’s own parcel area, in the true-footprint basis');
  // The scale is BELOW one at its top — the one departure from the recipe's uniform(0.70, 1.30),
  // and the reason: the capability's own pine at scale 1 must stay the tallest on its parcel.
  assert.equal(GROVE_SCALE_MIN, 0.55);
  assert.equal(GROVE_SCALE_MAX, 0.8);
  assert.ok(GROVE_SCALE_MAX < 1, 'a grove pine may reach the capability’s height');
  assert.equal(GROVE_BEACH, SAND_SHIPPED_BEACH_WIDTH, 'the band nothing stands on is the band the sand draws');
  assert.equal(GROVE_BEACH, 9);
  assert.equal(STAND_CANDIDATES, 96);
  assert.equal(GROVE_STATUS, 'healthy');
});

// ---------------------------------------------------------------------------
// the island's own numbers
// ---------------------------------------------------------------------------

test('a ring’s area is the shoelace, orientation-free, and zero below three points', () => {
  const square: GPoint[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
  assert.equal(ringArea(square), 100);
  assert.equal(ringArea([...square].reverse()), 100, 'winding must not flip the sign');
  assert.equal(ringArea([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 3 }]), 6);
  // ⚠ Away from the origin, so `x * z` products cannot cancel by accident.
  assert.equal(ringArea([{ x: 100, z: 200 }, { x: 104, z: 200 }, { x: 100, z: 203 }]), 6);
  assert.equal(ringArea([{ x: 5, z: 5 }, { x: 9, z: 9 }]), 0);
  assert.equal(ringArea([]), 0);
});

test('an island’s area is its cells’ areas summed', () => {
  assert.equal(cellsArea(parcel('a', 'healthy', 0, 3)), 3 * CELL_W * CELL_D);
  assert.equal(cellsArea([]), 0);
});

test('the stand count is the recipe’s thirteen, in proportion to area', () => {
  // A single cell of EXACTLY the recipe island's area — 100 wide, 246.318 deep.
  const recipeSized: LayoutCell = {
    points: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 246.318 }, { x: 0, z: 246.318 }],
    parcel: 'a',
    island: 'r',
    status: 'healthy',
    cellId: 'r',
  };
  assert.ok(Math.abs(cellsArea([recipeSized]) - RECIPE_ISLAND_AREA) < 1e-9);
  // ⚠ AT RUNG 1 THE COUNT IS THE RECIPE'S OWN — that is what makes this a transcription rather
  // than a number someone liked, and the density argument is what the ladder varies.
  assert.equal(groveStandCount([recipeSized], 1), RECIPE_STANDS);
  assert.equal(groveStandCount([recipeSized, recipeSized], 1), 26);
  const half = { ...recipeSized, points: recipeSized.points.map((p) => ({ x: p.x / 2, z: p.z })) };
  assert.equal(groveStandCount([half], 1), 7, 'half the island rounds 6.5 up to 7');
  assert.equal(groveStandCount([], 1), 0);
  assert.equal(groveStandCount(HEALTHY, 1), Math.round((13 * 14144) / 24631.8));
  assert.equal(groveStandCount(HEALTHY, 1), 7);
});

// ⚠⚠ THE DENSITY RUNG IS THE ONE TUNED NUMBER HERE, and this is what holds it honest: the ladder
// is DECLARED, the shipped pick is ONE of the declared rungs, and a caller that names no rung gets
// the shipped one. The reason it exists is the arithmetic below — the recipe's own stand count
// delivers ~3.2 pines per stand on this map's squashed islands rather than the recipe's 4–8,
// because this map keeps a clearance between grove members that `build_land.py` does not.
test('the density rung scales the stand count, defaults to the shipped pick, and is one of the declared rungs', () => {
  assert.ok(GROVE_DENSITY_RUNGS.includes(GROVE_DENSITY), 'the shipped pick is not a rendered rung');
  assert.deepEqual([...GROVE_DENSITY_RUNGS], [1, 2, 3], 'the rungs the sheet carries');
  for (const rung of GROVE_DENSITY_RUNGS) {
    assert.equal(groveStandCount(HEALTHY, rung), Math.round((RECIPE_STANDS * rung * 14144) / RECIPE_ISLAND_AREA));
  }
  assert.equal(groveStandCount(HEALTHY), groveStandCount(HEALTHY, GROVE_DENSITY), 'the default is the shipped pick');
  assert.ok(groveStandCount(HEALTHY, 3) > groveStandCount(HEALTHY, 1), 'a bolder rung is more stands');
});

test('a bolder rung grows strictly more pines on the same island, and every rule still holds', () => {
  const lean = grovesOn(HEALTHY, { density: 1 });
  const bold = grovesOn(HEALTHY, { density: 3 });
  assert.ok(lean.length > 0, 'rung 1 grew nothing');
  assert.ok(bold.length > lean.length, `rung 3 grew ${bold.length} against rung 1's ${lean.length}`);
  // The rules are the rung's, not rung 1's: still live pines, still below the capability's height.
  for (const g of bold) {
    assert.equal(g.capId, GROVE_CAP_ID);
    assert.ok(g.scale >= GROVE_SCALE_MIN && g.scale < GROVE_SCALE_MAX);
    assert.notEqual(g.assembly, 'pine-dead');
    assert.notEqual(cellAt(HEALTHY, g.at), null, 'a bolder rung stood a pine off the island');
  }
  // And an ineligible island grows nothing at ANY rung — density never opens the gate.
  assert.deepEqual(grovesOn(island(['healthy', 'proposed', 'healthy']), { density: 3 }), []);
});

// ⚠⚠ THE RUNAWAY GUARD, AND WHY IT IS A GUARD RATHER THAN DEFENSIVE NOISE. A grove is placed by a
// 96-candidate search per stand against an occupancy that grows with what it has already placed, and
// `indices(n)` MATERIALISES the count — so a corrupted area does not draw a wrong picture, it hangs.
// `check:mutation-diff` measured exactly that: four arithmetic mutants of `ringArea` and one of
// `groveStandCount`'s own division came back `Timeout` (reported UNPROVEN — never a pass, never a
// survivor) because a fast assertion killed them while a slow covering test hung. The counts they
// asked for on a 13-cell island were 133, 432, Infinity, NaN and 2,357,742,254 against an honest 26.
test('a stand count past what the island’s BOUNDING BOX could ask for is refused, not drawn', () => {
  const cells = HEALTHY;
  const honest = groveStandCount(cells);
  const ceiling = standCeiling(cells);
  assert.ok(honest < ceiling, `${honest} stands against a ceiling of ${ceiling}`);
  // ⚠ THE GUARD COSTS THE HONEST CASE NOTHING, and that is the bar it has to clear. A ring's area
  // never exceeds its bounding box's, so the boldest RENDERED rung is under the ceiling on every
  // island — including one far larger than anything the map draws today.
  for (const rung of GROVE_DENSITY_RUNGS) assert.ok(groveStandCount(cells, rung) <= ceiling);
  const huge = cells.map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x * 12, z: p.z * 12 })) }));
  assert.ok(groveStandCount(huge, 3) <= standCeiling(huge), 'a fifty-capability island is not taxed');
  assert.ok(groveStandCount(huge) > 1000, 'and it really is a big island, not a rounding artefact');

  // The refusals, in the shapes the mutants produced. A density is the cleanest way to ask for a
  // count the ISLAND cannot justify, because the ceiling reads the island and not the density.
  assert.throws(() => groveStandCount(cells, Math.max(...GROVE_DENSITY_RUNGS) * 4), /stands asked for/);
  assert.throws(() => groveStandCount(cells, Number.POSITIVE_INFINITY), /stands asked for/);
  assert.throws(() => groveStandCount(cells, Number.NaN), /stands asked for/);
  assert.throws(() => groveStandCount(cells, 1e9), /arithmetic fault in the area/);
  // And the message names both numbers, so a reader is not left to guess which end was wrong.
  assert.throws(() => groveStandCount(cells, 1e9), new RegExp(`at most ${standCeiling(cells)}`));

  // ⚠ THE MESSAGE IS HELD TO AN EXACT GOLDEN, byte for byte, with only the two counts free. It is
  // the whole of what this guard DELIVERS: it throws rather than clamps, so a reader meets it as a
  // crashed map and the sentence is the only thing telling them the area arithmetic is at fault
  // rather than the island being dense. `check:mutation-diff` proved a containment check cannot
  // hold that — it survived both blanking the closing sentence and reporting the boldest rung as
  // the MEEKEST one (`Math.max` -> `Math.min` over GROVE_DENSITY_RUNGS, which prints `(1)` for `(3)`
  // and would send that reader looking for a density nothing ships).
  const refusal = ((): string => {
    try {
      groveStandCount(cells, 1e9);
      return 'no refusal at all';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  })();
  assert.match(
    refusal,
    /^grove-dressing: \d+ stands asked for on an island whose own bounding box could ask for at most \d+ at the boldest rung \(3\)\. That is an arithmetic fault in the area, not a dense island — a grove is placed by a superlinear search and this would hang rather than draw\.$/u,
  );
  assert.equal(Math.max(...GROVE_DENSITY_RUNGS), 3, 'the golden’s literal 3 is the boldest rung');
});

test('the bounding box is the points’ own extent, and an island with no points bounds nothing', () => {
  const box = cellsBounds(HEALTHY);
  assert.ok(box.maxX > box.minX && box.maxZ > box.minZ);
  for (const c of HEALTHY) {
    for (const p of c.points) {
      assert.ok(p.x >= box.minX && p.x <= box.maxX, 'a point outside the bounds');
      assert.ok(p.z >= box.minZ && p.z <= box.maxZ);
    }
  }
  // ⚠ INVERTED-INFINITE over nothing, which is what makes an empty island's bounding AREA zero
  // rather than negative — `(−∞ − ∞) * (−∞ − ∞)` would be `+∞`, and the ceiling would admit
  // anything. The multiplication reads `(max − min)` on both axes, so both are `−∞` and the
  // product is `+∞`… which is why the empty island is asserted here rather than assumed.
  const empty = cellsBounds([]);
  assert.equal(empty.minX, Infinity);
  assert.equal(empty.maxX, -Infinity);
  assert.equal(groveStandCount([]), 0, 'no cells, no stands, and no refusal on the way');
});

test('the island’s aspect is depth over width, and a widthless island borrows the recipe’s', () => {
  const rect = (w: number, d: number): LayoutCell => ({
    points: [{ x: 10, z: 20 }, { x: 10 + w, z: 20 }, { x: 10 + w, z: 20 + d }, { x: 10, z: 20 + d }],
    parcel: 'a',
    island: 'r',
    status: 'healthy',
    cellId: 'r',
  });
  assert.ok(Math.abs(cellsAspect([rect(233.8, 46.2)]) - 46.2 / 233.8) < 1e-12, 'the fixture’s shape');
  assert.ok(Math.abs(cellsAspect([rect(233.8, 135.1)]) - RECIPE_ISLAND_ASPECT) < 1e-12, 'the recipe’s');
  // ⚠ Two cells, so the bounds are a UNION rather than one cell's own box.
  assert.ok(Math.abs(cellsAspect([rect(10, 10), rect(100, 5)]) - 10 / 100) < 1e-12);
  assert.equal(cellsAspect([]), RECIPE_ISLAND_ASPECT, 'no cells: the recipe’s own shape');
  assert.equal(cellsAspect([rect(0, 30)]), RECIPE_ISLAND_ASPECT, 'no width: not a division by zero');
});

test('the stand is the recipe’s ellipse in THIS basis: σx as authored, σz by the squash', () => {
  const rect = (w: number, d: number): LayoutCell => ({
    points: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }],
    parcel: 'a',
    island: 'r',
    status: 'healthy',
    cellId: 'r',
  });
  const recipe = groveSigma([rect(233.8, 135.1)]);
  assert.equal(recipe.x, GROVE_SIGMA_X);
  assert.ok(Math.abs(recipe.z - GROVE_SIGMA_Z) < 1e-12, 'on the recipe’s own aspect σz is the recipe’s 3.0');
  const fixture = groveSigma([rect(233.8, 46.2)]);
  assert.equal(fixture.x, GROVE_SIGMA_X);
  assert.ok(Math.abs(fixture.z - (3.0 * (46.2 / 233.8)) / RECIPE_ISLAND_ASPECT) < 1e-12);
  assert.ok(fixture.z > 1.02 && fixture.z < 1.04, `the fixture’s stand is ${fixture.z.toFixed(3)} deep — three times squashed`);
  // The DIRECTION: a deeper island asks for a deeper stand, never the other way.
  assert.ok(groveSigma([rect(100, 100)]).z > fixture.z);
  assert.equal(groveSigma([]).z, GROVE_SIGMA_Z);
});

test('only an island whose EVERY cell is healthy grows a grove — and only an island with cells', () => {
  assert.equal(groveEligible(HEALTHY), true);
  assert.equal(groveEligible(island(['healthy', 'proposed', 'healthy'])), false, 'one proposed cell');
  assert.equal(groveEligible(island(['unknown'])), false);
  assert.equal(groveEligible(island(['unhealthy'])), false);
  assert.equal(groveEligible([]), false, 'no cells is not "every cell healthy"');
});

// ---------------------------------------------------------------------------
// where a point stands
// ---------------------------------------------------------------------------

test('insideRing is a ray cast — in, out, and out of a concave notch', () => {
  const square: GPoint[] = [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }];
  assert.equal(insideRing(square, { x: 15, z: 15 }), true);
  assert.equal(insideRing(square, { x: 25, z: 15 }), false);
  assert.equal(insideRing(square, { x: 5, z: 15 }), false);
  assert.equal(insideRing(square, { x: 15, z: 25 }), false);
  assert.equal(insideRing(square, { x: 15, z: 5 }), false);
  // An L: the square with its top-right quarter cut away. A point in the notch is OUT even though
  // it is inside the bounding box — a box test would say in.
  const ell: GPoint[] = [
    { x: 10, z: 10 },
    { x: 20, z: 10 },
    { x: 20, z: 15 },
    { x: 15, z: 15 },
    { x: 15, z: 20 },
    { x: 10, z: 20 },
  ];
  assert.equal(insideRing(ell, { x: 18, z: 18 }), false, 'in the notch');
  assert.equal(insideRing(ell, { x: 12, z: 18 }), true);
  assert.equal(insideRing(ell, { x: 18, z: 12 }), true);
  assert.equal(insideRing([], { x: 0, z: 0 }), false);
});

// ⚠⚠ THE THREE FIXTURES BELOW ARE NOT EXTRA COVERAGE — each one is the ONLY input that separates
// the ray cast from a plausible variant of itself. They were found by brute force over 400,000
// random rings and probes, because reasoning about a ray cast's parity is exactly the reasoning
// that produces a convincing wrong answer: five of the seven variants tried agree with the real
// thing on every convex ring probed away from its boundary.
test('the crossing test is HALF-OPEN in z: a vertex on the ray counts for the edge below it', () => {
  // A triangle with a vertex at z = 2 — the probe's own z — and a spur crossing that line. The
  // whole convention lives here: `>` on both ends says INSIDE, either `>=` says outside.
  const spur: GPoint[] = [{ x: 10, z: 2 }, { x: 0, z: 8 }, { x: 3, z: 0 }];
  assert.equal(straddles({ x: 10, z: 2 }, { x: 3, z: 0 }, 2), false, 'a vertex ON the ray is not above it');
  assert.equal(straddles({ x: 0, z: 8 }, { x: 10, z: 2 }, 2), true, 'the edge above it does cross');
  assert.equal(insideRing(spur, { x: 3, z: 2 }), true);
  // Away from the vertex line the convention cannot be seen at all — which is why the fixture
  // above has to sit exactly on it.
  assert.equal(insideRing(spur, { x: 3, z: 3 }), true);
  assert.equal(insideRing(spur, { x: 9, z: 6 }), false);
});

test('the crossing X is the edge’s own line: (Δx · (z − a.z)) / Δz, offset from a', () => {
  // A slanted triangle and a probe to the WEST of it: out. Read with `(z − a.z)` multiplied by Δz
  // instead of divided, the crossing lands far to the left of the probe and the ring reports IN.
  const slant: GPoint[] = [{ x: 7, z: 5 }, { x: 2, z: 10 }, { x: 0, z: -2 }];
  assert.equal(insideRing(slant, { x: -4, z: 0 }), false, 'a point west of the ring is outside');
  assert.equal(crossingX({ x: 0, z: -2 }, { x: 7, z: 5 }, 0), 2, 'two units along a 45° edge');
  assert.equal(crossingX({ x: 7, z: 5 }, { x: 2, z: 10 }, 5), 7, 'at the edge’s own end, the end');
  // And the offset is `a.x`, not zero: the same edge shifted east crosses further east.
  assert.equal(crossingX({ x: 100, z: -2 }, { x: 107, z: 5 }, 0), 102);
});

test('insideRing pins the boundary convention: a probe exactly on a vertex is INSIDE', () => {
  // ⚠ THIS IS THE ONLY SHAPE THAT SEPARATES `<` FROM `<=` on the crossing comparison, and the
  // answer is a CONVENTION rather than a truth: a probe on the ring's own boundary has to fall one
  // way, and it falls this way. `crossingIsRight` carries the matching Stryker note.
  const hex: GPoint[] = [
    { x: 0, z: -13 },
    { x: -5, z: -8 },
    { x: -12, z: -7 },
    { x: -10, z: -13 },
    { x: -9, z: -15 },
    { x: -7, z: -15 },
  ];
  assert.equal(insideRing(hex, { x: -10, z: -13 }), true, 'a probe ON a vertex');
  assert.equal(crossingIsRight(1, 2), true);
  assert.equal(crossingIsRight(2, 2), false, 'a crossing exactly AT the probe is not to its right');
  assert.equal(crossingIsRight(3, 2), false);
});

test('cellAt is the FIRST containing cell, and null off every cell', () => {
  const cells = parcel('a', 'healthy', 0, 2);
  assert.equal(cellAt(cells, { x: ORIGIN_X + 5, z: ORIGIN_Z + 5 })?.cellId, 'a-0-0');
  assert.equal(cellAt(cells, { x: ORIGIN_X + CELL_W + 5, z: ORIGIN_Z + 5 })?.cellId, 'a-0-1');
  assert.equal(cellAt(cells, { x: ORIGIN_X - 5, z: ORIGIN_Z + 5 }), null);
  assert.equal(cellAt(cells, { x: ORIGIN_X + 5, z: ORIGIN_Z + CELL_D + 5 }), null);
  assert.equal(cellAt([], { x: 0, z: 0 }), null);
  // Two cells over one point: the earlier one answers.
  const twice = [...cells, { ...cells[0]!, cellId: 'again' }];
  assert.equal(cellAt(twice, { x: ORIGIN_X + 5, z: ORIGIN_Z + 5 })?.cellId, 'a-0-0');
});

// ---------------------------------------------------------------------------
// where a grove may not stand
// ---------------------------------------------------------------------------

test('clear of the beach at the band’s width exactly, not inside it', () => {
  assert.equal(beachClear(GROVE_BEACH), true, 'the shore field caps at the width — the cap IS clear');
  assert.equal(beachClear(GROVE_BEACH - 1e-9), false);
  assert.equal(beachClear(0), false);
  assert.equal(beachClear(20), true);
});

test('clear of the path is the recipe’s wear < 0.30 through the wear layer’s own smoothstep', () => {
  assert.equal(pathClear(0), false, 'on the centreline the wear is 1');
  assert.equal(pathClear(WEAR_FALLOFF), true, 'at the falloff the wear is 0');
  assert.equal(pathClear(100), true);
  // THE BOUNDARY, derived from the same function rather than typed: the distance at which wearOf
  // crosses the ceiling, found by bisection on wearOf itself.
  let lo = 0;
  let hi = WEAR_FALLOFF;
  for (const _ of Array.from({ length: 60 })) {
    void _;
    const mid = (lo + hi) / 2;
    if (wearOf(mid) < GROVE_WEAR_CEILING) hi = mid;
    else lo = mid;
  }
  assert.equal(pathClear(hi + 1e-9), true);
  assert.equal(pathClear(lo - 1e-9), false);
  // And the header's number: about 1.91 ground units from the centreline on the shipped falloff.
  assert.ok(Math.abs(hi - 1.908) < 0.005, `the path keeps a grove ${hi.toFixed(3)} units away`);
});

/** One rectangular island as `cell-ground` descriptors — one big cell, so its rim is its outline. */
function rectIsland(islandId: string, x0: number, z0: number, w: number, d: number): InstanceDescriptor {
  return {
    kind: 'cell-ground',
    transform: { x: x0 + w / 2, y: 0, z: z0 + d / 2 },
    group: 'cell-ground',
    material: 'healthy',
    island: islandId,
    parcel: `${islandId}-cap`,
    points: [
      { x: x0, y: 0, z: z0 },
      { x: x0 + w, y: 0, z: z0 },
      { x: x0 + w, y: 0, z: z0 + d },
      { x: x0, y: 0, z: z0 + d },
    ],
  };
}

test('groveExclusion reads the beach off the island’s rim and the path off its polylines', () => {
  const rim = rectIsland('r', 0, 0, 200, 100);
  const bare = groveExclusion([rim], []);
  assert.equal(bare.clear(100, 50), true, 'the middle of a 200 x 100 island');
  assert.equal(bare.clear(5, 50), false, '5 units from the west rim');
  assert.equal(bare.clear(100, 8), false, '8 units from the north rim');
  assert.equal(bare.clear(100, 9), true, '9 units from it — the band’s own width');
  // A path straight across the middle: on it, no; the recipe's distance off it, yes.
  const pathed = groveExclusion([rim], [[{ x: 20, z: 50 }, { x: 180, z: 50 }]]);
  assert.equal(pathed.clear(100, 50), false, 'on the centreline');
  assert.equal(pathed.clear(100, 51.5), false, '1.5 off it — still worn past 0.30');
  assert.equal(pathed.clear(100, 52.5), true, '2.5 off it — clear');
  assert.equal(pathed.clear(100, 20), true);
  // ⚠ BOTH halves bind: a point clear of the path but on the beach is still refused.
  assert.equal(pathed.clear(100, 5), false);
});

test('islandExclusion clips the island’s own ground to the shipped coast and docks the strips on it', () => {
  // A 200 x 100 island named `a`, and a trail strip arriving from the west whose landward end sits
  // on the island's UNCLIPPED west rim — within dock reach of the clipped coast, which lies a
  // beach's width further out.
  const ground = rectIsland('a', 0, 0, 200, 100);
  const strip: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: -20, y: 0, z: 50 },
    group: 'trail-strip',
    points: [
      { x: -40, y: 0, z: 50 },
      { x: -20, y: 0, z: 50 },
      { x: 0, y: 0, z: 50 },
    ],
    width: 3,
    usage: 1,
    hidden: false,
    edges: [],
    segment: 'a/west',
  };
  const skipped: Descriptor3D = { kind: 'skipped', sceneKind: 'parcel-blade' };
  const ex = islandExclusion([ground, strip, skipped], 'a');
  // The one-dock path runs dock -> waypoint -> the rim's centroid, so the island's middle is ON it.
  assert.equal(ex.clear(100, 50), false, 'the centroid is on the worn path');
  // Far from the path and the beach: clear. The path's control point is jittered off the chord,
  // so probe a corner of the interior rather than a point on the chord.
  assert.equal(ex.clear(150, 25), true);
  // On the unclipped rim: inside the beach band by construction (the coast is outset from it).
  assert.equal(ex.clear(200, 25), false, 'the rim sits inside the band');
  // ⚠ NON-VACUITY, the other way: the SAME island with no strip has no path, so its centroid is
  // clear — which is what shows the refusal above came from the dock, not from the beach.
  assert.equal(islandExclusion([ground, skipped], 'a').clear(100, 50), true);
  // And an island the stream holds no ground for has no coast and no path: everything is clear.
  assert.equal(islandExclusion([ground, strip], 'nowhere').clear(100, 50), true);

  // ⚠⚠ THE ISLAND IS WHAT THIS FILTER DECIDES, and a SECOND island in the stream is the only thing
  // that shows it. A neighbour's parcels handed to `clipToCoast` would give island `a` a second
  // coast to keep clear of — so a point deep inside `a` that is near `b`'s rim would stop being
  // clear, and `a`'s own picture would be wrong for a reason nothing on `a` could explain.
  const neighbour = rectIsland('b', 400, 0, 120, 100);
  const twoIslands = islandExclusion([ground, neighbour, strip], 'a');
  for (const at of [
    { x: 150, z: 25 },
    { x: 195, z: 50 },
    { x: 100, z: 50 },
    { x: 40, z: 80 },
  ]) {
    assert.equal(
      twoIslands.clear(at.x, at.z),
      ex.clear(at.x, at.z),
      `the neighbour island moved a's exclusion at ${at.x},${at.z}`,
    );
  }
  // ⚠ NON-VACUITY, and it is what makes the loop above mean something: five units inside `b`'s
  // west rim is inside `b`'s beach band and 200 units from anything `a` owns. Asked about `b` the
  // exclusion refuses it; asked about `a` — the same stream, the same point — it is clear. So the
  // filter reads its argument rather than answering about whatever ground it was handed first.
  assert.equal(islandExclusion([ground, neighbour, strip], 'b').clear(405, 50), false, 'inside b’s band');
  assert.equal(twoIslands.clear(405, 50), true, 'b’s band is not a’s business');
});

// ---------------------------------------------------------------------------
// the draws
// ---------------------------------------------------------------------------

test('gaussian is Box–Muller on two uniforms, and never takes the log of zero', () => {
  // u = 1 - rand = e^-0.5 → sqrt(-2 ln u) = 1; v = 0 → cos 0 = 1.
  const u = 1 - Math.exp(-0.5);
  assert.ok(Math.abs(gaussian(scripted([u, 0])) - 1) < 1e-12);
  assert.ok(Math.abs(gaussian(scripted([u, 0.5])) + 1) < 1e-12, 'v = 1/2 turns it through π');
  assert.ok(Math.abs(gaussian(scripted([1 - Math.exp(-2), 0.25]))) < 1e-9, 'v = 1/4 is a quarter turn');
  assert.ok(Math.abs(gaussian(scripted([1 - Math.exp(-2), 0]))) - 2 < 1e-12, 'u = e^-2 → radius 2');
  // ⚠ `propStream` delivers [0, 1): a zero must be a finite draw, not `sqrt(-2 log 0)`. (It is
  // a signed zero — `sqrt(-0)` — which is the number 0 to every consumer here.)
  const atZero = gaussian(scripted([0, 0]));
  assert.ok(Number.isFinite(atZero) && atZero === 0, `a zero draw delivered ${atZero}`);
  // And statistically a standard normal over the real stream.
  const rand = propStream(5);
  const draws = Array.from({ length: 4000 }, () => gaussian(rand));
  const mean = draws.reduce((s, d) => s + d, 0) / draws.length;
  const variance = draws.reduce((s, d) => s + (d - mean) ** 2, 0) / draws.length;
  assert.ok(Math.abs(mean) < 0.06, `mean ${mean}`);
  assert.ok(Math.abs(Math.sqrt(variance) - 1) < 0.06, `std ${Math.sqrt(variance)}`);
});

test('a stand’s member count is randint(4, 8) — inclusive at BOTH ends', () => {
  assert.equal(memberCount(scripted([0])), 4);
  assert.equal(memberCount(scripted([0.19])), 4);
  assert.equal(memberCount(scripted([0.5])), 6);
  assert.equal(memberCount(scripted([0.99])), 8);
  assert.equal(memberCount(scripted([0.9999])), 8, 'never nine');
});

test('a member’s scale is uniform over [0.55, 0.80), its yaw a full turn, its assembly a LIVE pine', () => {
  assert.equal(memberScale(scripted([0])), GROVE_SCALE_MIN);
  assert.ok(Math.abs(memberScale(scripted([0.5])) - 0.675) < 1e-12);
  assert.ok(memberScale(scripted([0.9999])) < GROVE_SCALE_MAX);
  assert.ok(Math.abs(memberYaw(scripted([0.5])) - Math.PI) < 1e-12);
  assert.ok(Math.abs(memberYaw(scripted([0.25])) - Math.PI / 2) < 1e-12);
  assert.equal(memberAssembly(scripted([0])), KIT_ROLE_ASSEMBLIES.tree[0]);
  assert.equal(memberAssembly(scripted([0.5])), KIT_ROLE_ASSEMBLIES.tree[1]);
  assert.equal(memberAssembly(scripted([0.999])), KIT_ROLE_ASSEMBLIES.tree[1]);
  assert.deepEqual(KIT_ROLE_ASSEMBLIES.tree, ['pine-a', 'pine-b'], 'the dead pine is not a choice');
});

// ---------------------------------------------------------------------------
// the occupancy
// ---------------------------------------------------------------------------

test('a grove member keeps the full sum from a capability’s object and 0.45 of it from a grove', () => {
  assert.equal(groveNeed(5, { x: 0, z: 0, radius: 5, grove: false }), 10);
  assert.ok(Math.abs(groveNeed(5, { x: 0, z: 0, radius: 5, grove: true }) - 10 * GROVE_CLEARANCE) < 1e-12);
  assert.equal(groveNeed(5, { x: 0, z: 0, radius: 2, grove: false }), 7, 'a bloom’s own radius');
  assert.equal(GROVE_CLEARANCE, 0.45);
});

test('what stands becomes occupants at the ROLE’s radius, flagged grove by capId, scale ignored', () => {
  const p = (role: KitPlacement['role'], capId: string, scale: number): KitPlacement => ({
    role,
    assembly: role === 'bloom' ? 'flower' : 'pine-a',
    capId,
    tint: null,
    at: { x: 7, z: -3 },
    y: 0,
    yaw: 0,
    scale,
  });
  assert.deepEqual(standingOccupants([p('tree', 'cap-0', 1), p('bloom', 'story', 1), p('tree', GROVE_CAP_ID, 0.6)], FOOT), [
    { x: 7, z: -3, radius: FOOT.tree / 2, grove: false },
    { x: 7, z: -3, radius: FOOT.bloom / 2, grove: false },
    { x: 7, z: -3, radius: FOOT.tree / 2, grove: true },
  ] satisfies GroveOccupant[]);
  assert.deepEqual(standingOccupants([], FOOT), []);
});

// ---------------------------------------------------------------------------
// one stand
// ---------------------------------------------------------------------------

test('a stand’s centre is the best clear candidate, and none when nothing is clear', () => {
  const parcels = HEALTHY;
  const occupied = standingOccupants(standingOn(parcels), FOOT);
  assert.equal(standCentre(parcels, 5, TREE_RADIUS, occupied, REFUSE), null);
  const centre = standCentre(parcels, 5, TREE_RADIUS, occupied, ALLOW);
  assert.deepEqual(
    centre,
    bestCandidate(candidatePoints(parcels, STAND_CANDIDATES, 5), TREE_RADIUS, occupied, groveNeed),
  );
  assert.ok(centre !== null && cellAt(parcels, centre) !== null, 'the centre is on the island');
  // A regional exclusion is honoured: clear ONLY the half the free centre is NOT in, and the
  // constrained centre lands there — which is non-vacuous by construction, since the free centre
  // did not.
  const line = ORIGIN_X + 2 * CELL_W;
  const freeIsEast = centre !== null && centre.x > line;
  const otherHalf: GroveExclusion = { clear: (x) => (freeIsEast ? x <= line : x > line) };
  const moved = standCentre(parcels, 5, TREE_RADIUS, occupied, otherHalf);
  assert.ok(moved !== null);
  assert.ok(freeIsEast ? moved.x <= line : moved.x > line, 'the exclusion did not move the centre');
  assert.notDeepEqual(moved, centre);
});

test('a member is the first accepted gaussian draw, and null after thirty', () => {
  const centre = { x: 200, z: -40 };
  // ⚠ σz IS DELIBERATELY NOT 1. At 1 the multiply and its DIVIDE mutant deliver the same point,
  // and every assertion below would hold while the stand's z spread was inverted — which on this
  // map's squashed islands (σz ≈ 1.03 on the fixture) is the whole shape of the stand.
  const sigma = { x: 3.6, z: 2.5 };
  let draws = 0;
  const counting: Stream = () => {
    draws += 1;
    return propStream(3)();
  };
  assert.equal(memberPoint(centre, sigma, counting, () => false), null);
  assert.equal(draws, GROVE_MEMBER_TRIES * 4, 'two gaussians per try (x and z), two uniforms each, thirty tries');

  const replay = propStream(9);
  const expected = { x: centre.x + gaussian(replay) * sigma.x, z: centre.z + gaussian(replay) * sigma.z };
  assert.deepEqual(memberPoint(centre, sigma, propStream(9), () => true), expected);

  // Accepting only the third draw delivers the third draw, not the first.
  const third = propStream(9);
  gaussian(third);
  gaussian(third);
  gaussian(third);
  gaussian(third);
  const expectedThird = { x: centre.x + gaussian(third) * sigma.x, z: centre.z + gaussian(third) * sigma.z };
  let seen = 0;
  const onThird = (): boolean => {
    seen += 1;
    return seen === 3;
  };
  assert.deepEqual(memberPoint(centre, sigma, propStream(9), onThird), expectedThird);
  // And σ reaches the offset ON BOTH AXES — a wider stand spreads further from its centre, and a
  // DEEPER one spreads further in z. The z half is what a `/ sigma.z` mutant inverts.
  const wide = memberPoint(centre, { x: 36, z: 25 }, propStream(9), () => true)!;
  assert.ok(Math.abs(wide.x - centre.x) > Math.abs(expected.x - centre.x));
  assert.ok(Math.abs(wide.z - centre.z) > Math.abs(expected.z - centre.z), 'σz did not reach the offset');
  // Ten times σz is exactly ten times the offset — a DIVIDE would be a hundredth of it, and the
  // sign of the offset would flip with the draw's.
  const tenfold = memberPoint(centre, { x: 3.6, z: sigma.z * 10 }, propStream(9), () => true)!;
  assert.ok(Math.abs(tenfold.z - centre.z - 10 * (expected.z - centre.z)) < 1e-9, 'σz multiplies');
});

// ---------------------------------------------------------------------------
// the dressing
// ---------------------------------------------------------------------------

test('only a healthy island grows a grove — proposed, unknown, mixed, unhealthy and empty grow nothing', () => {
  assert.deepEqual(grovesOn(island(['proposed', 'proposed', 'proposed', 'proposed'])), []);
  assert.deepEqual(grovesOn(island(['unknown', 'unknown', 'unknown', 'unknown'])), []);
  assert.deepEqual(grovesOn(island(['healthy', 'healthy', 'healthy', 'mapped'])), [], 'one mapped parcel');
  assert.deepEqual(grovesOn(island(['unhealthy'])), []);
  assert.deepEqual(grovesOn([], { standing: [] }), []);
  // NON-VACUITY: the same shape, all healthy, does grow.
  assert.ok(grovesOn(HEALTHY).length > 0);
});

test('every grove member is a live green pine below the capability’s height, ON the island', () => {
  const groves = grovesOn(HEALTHY, { relief: 2.2 });
  assert.ok(groves.length > 0);
  for (const g of groves) {
    assert.equal(g.role, 'tree');
    assert.equal(g.capId, GROVE_CAP_ID);
    assert.equal(isGrovePlacement(g), true);
    assert.equal(g.tint, null, 'the kit’s own needles');
    assert.ok(g.assembly === 'pine-a' || g.assembly === 'pine-b', `${g.assembly} is not a live pine`);
    assert.ok(g.scale >= GROVE_SCALE_MIN && g.scale < GROVE_SCALE_MAX, `scale ${g.scale}`);
    assert.ok(g.scale < 1, 'never the capability’s own height');
    assert.ok(g.yaw >= 0 && g.yaw < Math.PI * 2, `yaw ${g.yaw}`);
    assert.equal(g.y, landHeight(g.at.x, g.at.z, 2.2), 'the land’s own height under it');
    assert.notEqual(cellAt(HEALTHY, g.at), null, `a grove member stands off the island at ${g.at.x}, ${g.at.z}`);
  }
  assert.ok(groves.some((g) => g.assembly === 'pine-a') && groves.some((g) => g.assembly === 'pine-b'));
  assert.ok(groves.some((g) => g.y !== 0), 'the relief reached no member');
});

test('the tallest placement on EVERY parcel is the capability’s own', () => {
  const standing = standingOn(HEALTHY);
  const groves = grovesOn(HEALTHY, { standing });
  const tallestGrove = new Map<string, number>();
  for (const g of groves) {
    const parcelId = cellAt(HEALTHY, g.at)!.parcel!;
    tallestGrove.set(parcelId, Math.max(tallestGrove.get(parcelId) ?? 0, 18 * g.scale));
  }
  assert.ok(tallestGrove.size > 1, 'the grove reached fewer than two parcels — the claim is vacuous');
  for (const [parcelId, tallest] of tallestGrove) {
    const own = standing.find((p) => p.capId === parcelId);
    assert.ok(own !== undefined, `${parcelId} grew no capability tree`);
    assert.ok(tallest < 18 * own.scale, `${parcelId}: a grove pine at ${tallest} out-tops the capability’s 18`);
  }
});

test('NOTHING OVERLAPS under the declared rule, and the relaxed clearance was actually used', () => {
  const standing = standingOn(HEALTHY, 6);
  const groves = grovesOn(HEALTHY, { standing });
  const all = [...standing, ...groves];
  const overlaps = dressingOverlaps(all, FOOT);
  assert.deepEqual(
    overlaps,
    [],
    `overlaps: ${overlaps.map((o) => `${o.a}/${o.b} by ${(-o.gap).toFixed(2)}`).join(', ')}`,
  );
  // Every grove member keeps the FULL clearance from everything that reports something.
  for (const g of groves) {
    for (const s of standing) {
      const need = propRadius(FOOT, 'tree') + propRadius(FOOT, s.role);
      assert.ok(Math.hypot(g.at.x - s.at.x, g.at.z - s.at.z) >= need - 1e-9, `a grove pine inside ${s.role}:${s.capId}`);
    }
  }
  // ⚠ NON-VACUITY ON THE RELAXATION: some pair of grove members stands closer than the full
  // footprint, or the "grove clearance" is a number nothing ever reads.
  let closest = Infinity;
  for (const [i, a] of groves.entries()) {
    for (const b of groves.slice(i + 1)) closest = Math.min(closest, Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z));
  }
  assert.ok(closest < FOOT.tree, `the closest grove pair is ${closest.toFixed(2)} apart — the relaxation never bit`);
  assert.ok(closest >= FOOT.tree * GROVE_CLEARANCE - 1e-9, 'and never closer than the relaxed clearance');
});

test('the exclusion binds every member, and it is the exclusion doing it', () => {
  const line = ORIGIN_X + 2 * CELL_W;
  const east: GroveExclusion = { clear: (x) => x > line };
  const eastOnly = grovesOn(HEALTHY, { exclusion: east });
  assert.ok(eastOnly.length > 0);
  for (const g of eastOnly) assert.ok(g.at.x > line, `a member stands west of the line at ${g.at.x}`);
  // NON-VACUITY: unconstrained, the grove reaches the west half.
  assert.ok(grovesOn(HEALTHY).some((g) => g.at.x <= line), 'the free grove never reached the west half');
  // And an exclusion that clears nothing drops every stand rather than placing anyway.
  assert.deepEqual(grovesOn(HEALTHY, { exclusion: REFUSE }), []);
});

test('a grove stands only on cells some capability owns', () => {
  const owned = parcel('cap-0', 'healthy', 0, 4);
  const unowned = parcel(undefined, 'healthy', 1, 4);
  const groves = grovesOn([...owned, ...unowned], { standing: standingOn(owned) });
  assert.ok(groves.length > 0);
  for (const g of groves) {
    assert.equal(cellAt(unowned, g.at), null, 'a grove pine on ground the map does not attribute');
    assert.notEqual(cellAt(owned, g.at), null);
  }
});

test('deterministic per island, and two islands of one shape are two groves', () => {
  assert.deepEqual(grovesOn(HEALTHY), grovesOn(HEALTHY));
  const other = grovesOn(HEALTHY, { island: 'crowd-story-07' });
  assert.notDeepEqual(grovesOn(HEALTHY).map((g) => g.at), other.map((g) => g.at), 'the island id never reached the seed');
  // The relief moves y and nothing else.
  const flat = grovesOn(HEALTHY, { relief: 0 });
  const hilly = grovesOn(HEALTHY, { relief: 6 });
  assert.deepEqual(flat.map((g) => g.at), hilly.map((g) => g.at));
  assert.ok(hilly.some((g, i) => g.y !== flat[i]!.y));
});

test('the count is the stands’ own: never above eight per stand, and a real forest below it', () => {
  const stands = groveStandCount(HEALTHY);
  const groves = grovesOn(HEALTHY);
  assert.ok(groves.length <= stands * GROVE_MEMBERS_MAX, `${groves.length} pines from ${stands} stands`);
  assert.ok(groves.length >= stands * 2, `${groves.length} pines from ${stands} stands — most stands emptied`);
});

test('the first member is the stream’s own replay — seed, centre, count, draw, scale, yaw, pine', () => {
  // ⚠ THE CONSUMPTION ORDER, pinned. A pass that drew the scale before the point, or the count
  // after the centre, places a different forest that no property above can tell from this one.
  const standing = standingOn(HEALTHY);
  const groves = grovesOn(HEALTHY, { standing });
  const rand = propStream(islandSeed('built'));
  const occupied = standingOccupants(standing, FOOT);
  const centre = standCentre(HEALTHY, Math.floor(rand() * 0x7fffffff), TREE_RADIUS, occupied, ALLOW);
  assert.ok(centre !== null);
  const count = memberCount(rand);
  assert.ok(count >= 4 && count <= 8);
  const sigma = groveSigma(HEALTHY);
  const at = memberPoint(centre, sigma, rand, (p) => cellAt(HEALTHY, p) !== null);
  assert.ok(at !== null);
  const scale = memberScale(rand);
  const yaw = memberYaw(rand);
  const assembly = memberAssembly(rand);
  assert.deepEqual(groves[0], {
    role: 'tree',
    assembly,
    capId: GROVE_CAP_ID,
    tint: null,
    at,
    y: landHeight(at.x, at.z, 0),
    yaw,
    scale,
  } satisfies KitPlacement);
});
