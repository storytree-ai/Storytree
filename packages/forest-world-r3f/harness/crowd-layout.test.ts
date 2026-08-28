// crowd-layout.test.ts — the layout held to the one standard a density MODEL has to meet: it has
// to be able to be WRONG.
//
// `crowd-layout.ts` exists because nobody has seen 35 of these islands together, and the picture
// it frames is only evidence if the frame is a fair model of the real map. Three things decide
// that, and each of them has a test below that would fail if the arithmetic were inverted or the
// units confused: the DELIVERED land fraction (not the target that was asked for), the fact that
// no two islands overlap (a crowd that secretly overlapped would report a denser forest than the
// one being modelled), and the visitor's delivered zoom — the lane's headline number.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CROWD_POPULATION,
  ELEV_RAD,
  NEEDLE_INDEX,
  REAL_FOREST,
  crowdLayout,
  visitorZoom,
} from './crowd-layout.js';

/**
 * The harness island's own footprint, in ground units — width, and the already-foreshortened
 * screen height. Measured off `islandExtent()`'s subject (the fixture island's ground bounds:
 * 233.8 wide, 135.1 deep, so 135.1 * sin(50°) = 103.5 of screen height) rather than invented, so
 * the zoom claims below are about a forest of islands this repo actually renders.
 *
 * ⚠ It is a LITERAL on purpose: `islandExtent()` needs three and a composed scene, and a pure
 * layout test that dragged a renderer in would stop being runnable in `bun test`.
 */
const ISLAND = { islandW: 233.8, islandScreenH: 103.5 } as const;

/** The visitor's screen — the same one `crowd-scene.ts` composes the crowd for. */
const VIEWPORT = { w: 2560, h: 1600, dpr: 2 } as const;

/** What the one-island pages on this arc are delivered at, in DEVICE px per ground unit. */
const ONE_ISLAND_ZOOM_PX_PER_UNIT = 2;

// ------------------------------------------------------------------ the population

test('the crowd is the real forest`s 35 islands, 21 of them healthy, across all six statuses', () => {
  assert.equal(CROWD_POPULATION.length, 35);
  assert.equal(CROWD_POPULATION.length, REAL_FOREST.islands);
  // 21 is the live count off the committed snapshot, not a number chosen to look healthy.
  assert.equal(CROWD_POPULATION.filter((s) => s === 'healthy').length, 21);
  assert.equal(CROWD_POPULATION.filter((s) => s === 'healthy').length, REAL_FOREST.proven);
  const statuses = new Set<string>(CROWD_POPULATION);
  for (const status of ['healthy', 'mapped', 'proposed', 'building', 'unhealthy', 'unknown']) {
    assert.ok(statuses.has(status), `the crowd carries no ${status} island, so a reader never sees one`);
  }
  assert.equal(statuses.size, 6);
});

// ------------------------------------------------------------------ how many, and where

test('the layout places the real forest`s 35 islands by default, and exactly the count it is asked for', () => {
  assert.equal(crowdLayout(ISLAND).islands.length, REAL_FOREST.islands);
  assert.equal(crowdLayout({ ...ISLAND, count: 1 }).islands.length, 1);
  assert.equal(crowdLayout({ ...ISLAND, count: 12 }).islands.length, 12);
  // Indices are dense and in order, so a caller may address an island by its position.
  const layout = crowdLayout(ISLAND);
  assert.deepEqual(
    layout.islands.map((i) => i.index),
    Array.from({ length: 35 }, (_, i) => i),
  );
});

test('exactly one island is the needle, and it is the only unhealthy one', () => {
  const layout = crowdLayout(ISLAND);
  const needles = layout.islands.filter((i) => i.needle);
  assert.equal(needles.length, 1, 'a truth reading with two needles is hunting for nothing in particular');
  assert.equal(needles[0]!.status, 'unhealthy');
  // The plant is ONE island, stated as one.
  assert.equal(layout.islands.filter((i) => i.status === 'unhealthy').length, 1);
  // `NEEDLE_INDEX` is a position in the population BEFORE the scatter, so it is not where the
  // needle ends up — what marks it in a laid-out forest is its status.
  assert.equal(CROWD_POPULATION[NEEDLE_INDEX], 'unhealthy');
});

test('the statuses are SCATTERED over the grid, so the failing island has healthy neighbours', () => {
  // ⚠ THE CLAIM THAT MADE THE NEIGHBOURHOOD READING ANSWERABLE AT ALL. `CROWD_POPULATION` lists
  // 21 healthy and then the rest; filling the grid in that order put every non-healthy island in
  // one corner, and measured, the failing island's five nearest neighbours contained NOT ONE
  // healthy island — so there was no population to read a bar off and the reading returned
  // UNVERIFIED. It also handed the whole-forest view an easier question than the product poses.
  const layout = crowdLayout(ISLAND);
  const needle = layout.islands.find((i) => i.needle)!;
  const byDistance = layout.islands
    .filter((i) => !i.needle)
    .sort(
      (a, b) =>
        Math.hypot(a.offset.x - needle.offset.x, a.offset.z - needle.offset.z) -
        Math.hypot(b.offset.x - needle.offset.x, b.offset.z - needle.offset.z),
    );
  const nearestEight = byDistance.slice(0, 8);
  const healthyNearby = nearestEight.filter((i) => i.status === 'healthy').length;
  assert.ok(
    healthyNearby >= 2,
    `the failing island needs healthy neighbours to be picked out FROM; it has ${healthyNearby} of 8`,
  );

  // And the scatter must not merely have moved the block — the healthy islands have to be spread
  // over the grid rather than pooled in one half of it.
  const healthy = layout.islands.filter((i) => i.status === 'healthy');
  const leftHalf = healthy.filter((i) => i.offset.x < 0).length;
  assert.ok(
    leftHalf >= 5 && leftHalf <= healthy.length - 5,
    `healthy islands pooled on one side: ${leftHalf} of ${healthy.length} left of centre`,
  );
});

// ------------------------------------------------------------------ the density calibration

test('the delivered land fraction is the target that was asked for, not merely near it', () => {
  // THE LOAD-BEARING CLAIM. `landFraction` is COMPUTED off the frame the function chose; if the
  // frame-area arithmetic were wrong in either direction this is the number that would say so,
  // and it is the parameter that decides whether the crowd models the real map at all.
  const real = crowdLayout(ISLAND);
  assert.ok(
    Math.abs(real.landFraction - REAL_FOREST.landFractionOfBox) < 1e-9,
    `default layout delivered ${real.landFraction} land, asked for ${REAL_FOREST.landFractionOfBox}`,
  );
  for (const target of [0.01, 0.05, 0.1, 0.2]) {
    const layout = crowdLayout({ ...ISLAND, landFraction: target });
    assert.ok(
      Math.abs(layout.landFraction - target) < 1e-9,
      `asked for ${target} land, delivered ${layout.landFraction}`,
    );
  }
  // And it holds when the count moves, which is what makes it a calibration rather than a constant.
  const twelve = crowdLayout({ ...ISLAND, count: 12, landFraction: 0.07 });
  assert.ok(Math.abs(twelve.landFraction - 0.07) < 1e-9);
});

test('a denser target shrinks the frame', () => {
  // A monotonicity claim, and it is here to catch the formula being inverted: more land in the
  // same frame means a SMALLER frame, and an inverted `frameArea` would still deliver a
  // self-consistent `landFraction` while growing the frame as density rose.
  const sparse = crowdLayout({ ...ISLAND, landFraction: 0.02 });
  const middling = crowdLayout({ ...ISLAND, landFraction: 0.08 });
  const dense = crowdLayout({ ...ISLAND, landFraction: 0.2 });
  assert.ok(middling.screenW < sparse.screenW, `${middling.screenW} should be under ${sparse.screenW}`);
  assert.ok(dense.screenW < middling.screenW, `${dense.screenW} should be under ${middling.screenW}`);
  assert.ok(dense.screenH < sparse.screenH);
});

test('the layout is deterministic — two calls with the same options place the islands identically', () => {
  // A random scatter would make two crowd pictures differ by the scatter rather than by the
  // variable under test, which is the whole reason `jitter()` is a hash of the index.
  const a = crowdLayout(ISLAND);
  const b = crowdLayout(ISLAND);
  assert.deepEqual(
    a.islands.map((i) => i.offset),
    b.islands.map((i) => i.offset),
  );
  assert.equal(a.screenW, b.screenW);
  assert.equal(a.screenH, b.screenH);
  // The jitter is real, so the determinism claim is not vacuously true of a plain grid: an
  // unjittered grid would repeat each column's x once per row, so its distinct x count would be
  // the COLUMN count rather than the island count.
  assert.equal(new Set(a.islands.map((i) => i.offset.x)).size, a.islands.length);
  assert.equal(new Set(a.islands.map((i) => i.offset.z)).size, a.islands.length);
});

// ------------------------------------------------------------------ the islands are separate things

/** One island's footprint in SCREEN space. `offset.z` is GROUND depth, so it foreshortens back
 *  through sin(elevation) to get the height a reader actually sees. */
interface ScreenBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function screenBox(offset: { x: number; z: number }): ScreenBox {
  const screenZ = offset.z * Math.sin(ELEV_RAD);
  return {
    x0: offset.x - ISLAND.islandW / 2,
    x1: offset.x + ISLAND.islandW / 2,
    y0: screenZ - ISLAND.islandScreenH / 2,
    y1: screenZ + ISLAND.islandScreenH / 2,
  };
}

test('no two islands overlap, at the real density and at a much tighter one', () => {
  // What makes the density model MEAN anything: 35 islands covering 2.85% of the frame are only
  // 2.85% if they are 35 separate footprints. Overlapping islands would report a sparser forest
  // than the picture actually shows, and would do it in the flattering direction.
  for (const landFraction of [REAL_FOREST.landFractionOfBox, 0.15]) {
    const layout = crowdLayout({ ...ISLAND, landFraction });
    const boxes = layout.islands.map((i) => screenBox(i.offset));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        assert.ok(
          overlapX <= 1e-9 || overlapY <= 1e-9,
          `islands ${i} and ${j} overlap by ${overlapX.toFixed(2)}x${overlapY.toFixed(2)} at land ${landFraction}`,
        );
      }
    }
  }
});

test('ground depth is not screen height — the forest is deeper in ground units than it is tall on screen', () => {
  // The 23% squash this module's own comment warns about: laying the crowd out as though
  // `offset.z` were screen height would deliver a `groundD` equal to `screenH`.
  const layout = crowdLayout(ISLAND);
  assert.ok(layout.groundD > layout.screenH);
  assert.ok(Math.abs(layout.groundD * Math.sin(ELEV_RAD) - layout.screenH) < 1e-9);
  assert.equal(layout.groundW, layout.screenW);
});

// ------------------------------------------------------------------ the headline number

test('a whole 35-island forest is delivered COARSER than the 2 px/unit the one-island pages use', () => {
  // ⚠ THE LANE'S HEADLINE NUMBER. Every land measurement on this arc is taken at 2 and 8 device
  // px per ground unit, and 2 has been called "the size the map is actually delivered at" — but
  // that is one island alone. A visitor holding the whole forest is much further back, and this
  // is the assertion that would catch the rule being derived backwards.
  const forest = crowdLayout(ISLAND);
  const wide = visitorZoom(forest, VIEWPORT);
  assert.ok(
    wide.devicePxPerUnit < ONE_ISLAND_ZOOM_PX_PER_UNIT,
    `a 35-island forest delivered ${wide.devicePxPerUnit} device px/unit, which is not coarser than ${ONE_ISLAND_ZOOM_PX_PER_UNIT}`,
  );
  assert.ok(wide.devicePxPerUnit > 0);
  assert.equal(wide.devicePxPerUnit, wide.cssPxPerUnit * VIEWPORT.dpr);

  // ...and a SMALLER forest is delivered FINER, which is the direction that makes it a zoom rule
  // rather than a constant.
  const one = visitorZoom(crowdLayout({ ...ISLAND, count: 1 }), VIEWPORT);
  assert.ok(
    one.devicePxPerUnit > wide.devicePxPerUnit,
    `one island delivered ${one.devicePxPerUnit}, a whole forest ${wide.devicePxPerUnit} — the rule is inverted`,
  );
  assert.ok(one.halfHeight < wide.halfHeight, 'a smaller forest should frame less world');
  // Monotone in between, so it is not just the two endpoints that happen to sit the right way.
  const twelve = visitorZoom(crowdLayout({ ...ISLAND, count: 12 }), VIEWPORT);
  assert.ok(twelve.devicePxPerUnit > wide.devicePxPerUnit);
  assert.ok(twelve.devicePxPerUnit < one.devicePxPerUnit);
});

test('the visitor zoom reads the outermost ground CELL, not the island centres', () => {
  // The shipped rule takes its spread off every instance, so the framed half-height has to cover
  // the island's own footprint on top of the centre spread. Framing off centres would crop half
  // an island at each edge of the forest and look like a composition choice.
  const layout = crowdLayout(ISLAND);
  const { halfHeight } = visitorZoom(layout, VIEWPORT);
  const centreSpread = Math.max(
    ...layout.islands.map((i) => Math.abs(i.offset.x)),
    ...layout.islands.map((i) => Math.abs(i.offset.z)),
  );
  assert.ok(halfHeight > centreSpread, `${halfHeight} does not clear the centre spread ${centreSpread}`);
});
