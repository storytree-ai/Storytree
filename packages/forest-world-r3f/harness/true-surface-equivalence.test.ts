// true-surface-equivalence.test.ts — what ADR-0527 D5's equivalence actually says, measured.
//
// THE QUESTION THE DELETION WAITS ON. `restoreTrueFootprint` un-projects the drawing the 2D surface
// handed over, stretching every ground z by `1 / sin(elevation)` about each island's own centre
// (ADR-0517 D1). ADR-0527 D2 deletes it, on the ground that the layout should EMIT a true ground
// surface rather than a drawing somebody un-projects afterwards — and D5 refuses to allow that on
// argument: it asks for evidence that mapping a true surface lands where un-projecting the drawing
// lands. This file is that measurement, and its result is more specific than either a pass or a
// blocker.
//
// ⚠⚠ THE ARMS AGREE, ON ALL 174 DESCRIPTORS. Measured here: both arms draw 174 descriptors in the
// same kinds, every height is identical (`y` differs by exactly 0), the island's x and z extents
// agree to the unit — and across a NINETY-DEGREE change of camera, on an island spanning 222 x 122,
// the worst-placed descriptor of any kind moves **0.348 units**. ADR-0527 D5's bar, restated by
// ADR-0540 D3 as tile-for-tile agreement, is MET WITH NO EXCEPTION RECORDED, which is the outcome
// that option was chosen for. `restoreTrueFootprint` is released for deletion.
//
// ⚠ THE THREE THINGS THAT HAD TO BE TRUE, AND THE ORDER THEY WERE ESTABLISHED IN — because two of
// them were asserted here BEFORE they were measured, and one of those was wrong.
//
//  1. THE MOSAIC. This file once read "the RELAXED SUBSTRATE DECOMPOSES DIFFERENTLY at the two
//     cameras". That was inferred from a single whole-population number and it is FALSE. Split by
//     kind and matched best-first, the 164 `cell-ground` cells always differed by at most 0.348
//     units. `substrate.ts` already cuts on the ground — its `GROUND` constant pins every
//     `hexCenter`/`hexCorners` call to `PLAN_VIEW_ELEVATION_DEG` and `buildRelaxedCells` projects
//     ONCE, at the very end. There was never a camera in the cut, and nothing was changed to fix it.
//
//  2. THE MATCHER. The greedy 1:1 walk below takes each descriptor's nearest UNUSED partner in one
//     arm's own order, so an early displaced marker steals a partner and the displacement cascades
//     through everything behind it. That inflated the headline number to ~62 units. It is worth
//     knowing that greedy and best-first now return the SAME 0.348: with nothing displaced there is
//     nothing left to cascade, which is its own evidence about what the cascade was made of.
//
//  3. THE MARKERS — the only thing that was actually broken, and the only thing that was fixed.
//     `buildUatMarkers` draws up to twenty polar candidates and accepts the first that clears the
//     tree well, the spacing floor, the land AND the nameplate band. The first three are ground
//     distances (ADR-0367 D1). The fourth was a SCREEN test — `y < labelY - 14` — because the
//     nameplate had no world position, so a different camera accepted a different candidate and the
//     ten markers landed on different ground. ADR-0545 gave the plate a ground baseline and made the
//     band's clearance a ground distance like the other three; this fixture's plate drop and tree
//     nudge, frozen screen offsets for the same reason, were recovered onto the ground with it.
//     The markers now agree to 0.312.
//
// ⚠ WHAT THIS FILE DOES NOT SAY. 0.348 is not zero, and it is not claimed to be: it is the
// substrate's own residue under a 90-degree swing, present before this landing and unchanged by it.
// The thresholds below are stated against it rather than against 0 so a real regression has somewhere
// to show, and every one of them is an upper bound on a measured figure — never a golden.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LAND_CAMERA_ELEVATION_DEG, PLAN_VIEW_ELEVATION_DEG } from '@storytree/forest-world';

import { islandScene } from './island-fixture.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';

/** One arm: build the island at a camera and map it, telling the mapper the same camera.
 *
 *  `landAreaPerCapability: null` leaves every island at the size the drawing gave it — the control
 *  option, so this measures the projection and nothing the capability ratio does on top of it. */
function arm(elevationDeg: number): Descriptor3D[] {
  return worldTo3D(islandScene({ cameraElevationDeg: elevationDeg }), {
    cameraElevationDeg: elevationDeg,
    landAreaPerCapability: null,
  });
}

/**
 * The DRAWN descriptors of one arm, narrowed through the union's own discriminant.
 *
 * ⚠ NARROWED, NEVER ASSERTED, AND THE DIFFERENCE IS THE WHOLE FILE. A first draft declared a
 * structural `{ kind, x?, y?, z? }` and reached the mapper's output through `as unknown as`. Every
 * descriptor's position actually lives on `transform`, so `x`/`y`/`z` were `undefined` on all 174,
 * `?? 0` turned each into zero, and the equivalence compared ZERO AGAINST ZERO and passed — with a
 * conclusion ("exact agreement") that was the opposite of the truth. `pnpm lint`'s
 * no-chained-type-assertions rule is what caught it; nothing else would have.
 */
function drawn(descriptors: readonly Descriptor3D[]): InstanceDescriptor[] {
  return descriptors.filter((d): d is InstanceDescriptor => d.kind !== 'skipped');
}

function span(ds: readonly InstanceDescriptor[], axis: 'x' | 'z'): number {
  const v = ds.map((d) => d.transform[axis]);
  return Math.max(...v) - Math.min(...v);
}

test('the true-surface arm and the un-projected drawing agree on the island FOOTPRINT — ADR-0517 D1', () => {
  // At plan view the stretch factor is `1 / sin 90° = 1`, so the true-surface arm passes through
  // `restoreTrueFootprint` untouched: this compares the repair against its own absence.
  const trueSurface = drawn(arm(PLAN_VIEW_ELEVATION_DEG));
  const drawing = drawn(arm(LAND_CAMERA_ELEVATION_DEG));

  assert.equal(trueSurface.length, 174, 'the fixture draws 174 descriptors');
  assert.equal(drawing.length, trueSurface.length, 'and both arms draw the same number');

  const kinds = (ds: readonly InstanceDescriptor[]): string =>
    [...ds.map((d) => d.kind)].sort().join(',');
  assert.equal(kinds(trueSurface), kinds(drawing), 'and the same kinds, in the same multiset');

  // THE CLAIM ADR-0517 D1 RESTS ON. The repair's whole job is the island's true footprint, and both
  // axes of it agree to under a unit on a span of hundreds. Asserted on the EXTENT rather than on
  // positions because the extent is what "footprint" means — and because positions demonstrably do
  // not correspond (the next test).
  for (const axis of ['x', 'z'] as const) {
    const a = span(trueSurface, axis);
    const b = span(drawing, axis);
    assert.ok(
      Math.abs(a - b) < 1,
      `the ${axis} extent must agree: true ${a.toFixed(2)} against drawing ${b.toFixed(2)}`,
    );
    assert.ok(a > 100, `and be a real island, not a degenerate one (${axis} span ${a.toFixed(2)})`);
  }

  // Height is untouched by a ground-plane projection, so it must be identical rather than close —
  // and it is the axis that would move first if the stretch were ever applied to the wrong one.
  for (const i of trueSurface.keys()) {
    assert.equal(trueSurface[i]!.transform.y, drawing[i]!.transform.y, `height at ${i}`);
  }
});

test('the two arms agree EVEN UNDER THE GREEDY MATCHER — the cascade went with what caused it', () => {
  // THIS TEST WAS A TRIPWIRE ASSERTING THE OPPOSITE, and its own message named the day it would fire:
  // "if this is now <small>, the last camera-dependent placement may be gone". It fired. Inverted
  // here rather than deleted, because the matcher it uses is the WEAKER of the two and that is
  // exactly what makes its agreement worth asserting.
  //
  // The walk below takes each descriptor's nearest UNUSED partner in one arm's own order, so a single
  // displaced descriptor can steal a partner some later one needed and the error cascades. Under the
  // old placement that inflated the disagreement to ~62 units on ten displaced markers. It now
  // returns the SAME figure as the best-first matching at the end of this file, which is the
  // strongest available statement that nothing is displaced at all: a greedy matcher can only differ
  // from a best-first one when there is something for it to get wrong.
  const trueSurface = drawn(arm(PLAN_VIEW_ELEVATION_DEG));
  const drawing = drawn(arm(LAND_CAMERA_ELEVATION_DEG));

  const used = new Set<number>();
  let worst = 0;
  for (const p of trueSurface) {
    let best = -1;
    let bestD = Infinity;
    for (const j of drawing.keys()) {
      if (used.has(j) || drawing[j]!.kind !== p.kind) continue;
      const q = drawing[j]!.transform;
      const d = Math.hypot(p.transform.x - q.x, p.transform.y - q.y, p.transform.z - q.z);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    assert.ok(best >= 0, 'every descriptor finds a partner of its own kind');
    used.add(best);
    worst = Math.max(worst, bestD);
  }
  assert.ok(
    worst < 1,
    `every descriptor must land within a unit of its partner across a 90-degree camera swing; the ` +
      `worst moved ${worst.toFixed(3)} units. A figure in the TENS is the old signature — a ground ` +
      `placement rule reading the camera, cascading through the greedy pairing (ADR-0545)`,
  );
  assert.equal(
    used.size,
    trueSurface.length,
    'and the matching must be total, or the number above is about a subset nobody named',
  );
});

/**
 * A 1:1 matching taken BEST-FIRST over all same-kind pairs, which is what "the most generous
 * pairing" should mean and what the greedy walk above is not.
 *
 * The difference is not cosmetic. Walking one arm in its own order and giving each descriptor its
 * nearest UNUSED partner lets a single displaced marker take a partner some later descriptor needed,
 * and the displacement cascades through everything behind it. Sorting every candidate pair by
 * distance first and accepting greedily from the shortest is the standard cheap approximation and
 * cannot cascade that way.
 */
function worstUnderBestFirstMatching(
  a: readonly InstanceDescriptor[],
  b: readonly InstanceDescriptor[],
): number {
  const pairs: { i: number; j: number; d: number }[] = [];
  for (const i of a.keys()) {
    for (const j of b.keys()) {
      if (a[i]!.kind !== b[j]!.kind) continue;
      const p = a[i]!.transform;
      const q = b[j]!.transform;
      pairs.push({ i, j, d: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) });
    }
  }
  pairs.sort((p, q) => p.d - q.d);
  const takenA = new Set<number>();
  const takenB = new Set<number>();
  let worst = 0;
  for (const p of pairs) {
    if (takenA.has(p.i) || takenB.has(p.j)) continue;
    takenA.add(p.i);
    takenB.add(p.j);
    worst = Math.max(worst, p.d);
  }
  assert.equal(takenA.size, a.length, 'every descriptor must find a partner of its own kind');
  return worst;
}

const ofKind = (ds: readonly InstanceDescriptor[], kind: string): InstanceDescriptor[] =>
  ds.filter((d) => d.kind === kind);

test('THE MOSAIC AND THE MARKERS BOTH AGREE — split by kind, so neither can hide inside the other', () => {
  // ⚠ THIS TEST EXISTS BECAUSE THE TEST ABOVE WAS ONCE READ AS SAYING SOMETHING IT CANNOT SAY. One
  // number over a mixed population named the substrate as the cause; separating the population
  // refuted it and named the markers instead. The split is KEPT now that both agree, because a
  // single whole-population bound is exactly what let ten displaced markers read as 164 re-cut tiles.
  const trueSurface = drawn(arm(PLAN_VIEW_ELEVATION_DEG));
  const drawing = drawn(arm(LAND_CAMERA_ELEVATION_DEG));

  const mosaicA = ofKind(trueSurface, 'cell-ground');
  const mosaicB = ofKind(drawing, 'cell-ground');
  assert.ok(mosaicA.length > 100, `the fixture must draw a real mosaic, saw ${mosaicA.length} cells`);
  assert.equal(mosaicB.length, mosaicA.length, 'and the same number of cells at both cameras');

  // THE FINDING. Ninety degrees of camera change moves no mosaic cell by more than a third of a
  // unit, on an island spanning 222 x 122. `substrate.ts` cuts on the ground — its `GROUND` constant
  // pins every lattice call to `PLAN_VIEW_ELEVATION_DEG` and `buildRelaxedCells` projects once, at
  // the end — so there is no camera in the cut to remove.
  const mosaicWorst = worstUnderBestFirstMatching(mosaicA, mosaicB);
  assert.ok(
    mosaicWorst < 1,
    `the mosaic must be camera-independent: worst cell moved ${mosaicWorst.toFixed(3)} units`,
  );

  // AND THE MARKERS AGREE TOO — the term ADR-0540 D2 was waiting on. This was the other inverted
  // tripwire: it asserted `> 10` and named the day it failed as the day to re-read ADR-0540. It
  // failed, at 0.31. The markers were the WHOLE of the old disagreement, so this bound and the
  // mosaic's above now cover the same population between them.
  //
  // ⚠ THE MARKERS ARE HELD TO THE MOSAIC'S OWN TOLERANCE, deliberately. They are placed by rejection
  // sampling against ground keep-outs measured off the mosaic, so they cannot be steadier than the
  // ground they are sampled on — and holding them to a LOOSER bound than the substrate would leave
  // room for exactly the defect that was here, at a tenth of its old size.
  const bloomA = ofKind(trueSurface, 'uat-bloom');
  const bloomB = ofKind(drawing, 'uat-bloom');
  assert.ok(bloomA.length > 0, 'the fixture must draw UAT markers for this to measure anything');
  assert.equal(bloomB.length, bloomA.length, 'and the same number at both cameras');
  const bloomWorst = worstUnderBestFirstMatching(bloomA, bloomB);
  assert.ok(
    bloomWorst < 1,
    `every UAT marker must land on the same ground at both cameras; the worst moved ` +
      `${bloomWorst.toFixed(3)} units. A figure in the TENS means a ground placement keep-out is ` +
      `reading the screen again — the nameplate band was the last one (ADR-0545)`,
  );

  // The two populations together ARE the whole scene, so nothing is being quietly excluded from the
  // comparison — a by-kind split that dropped a kind could hide a disagreement in it.
  assert.equal(
    mosaicA.length + bloomA.length,
    trueSurface.length,
    'every drawn descriptor must be one of the two kinds this test separates',
  );
});
