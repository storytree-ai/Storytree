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
// ⚠⚠ THE FOOTPRINT AGREES EXACTLY. THE INTERIOR IS A DIFFERENT TESSELLATION. Measured here: both
// arms draw 174 descriptors in the same kinds, every height is identical (`y` differs by exactly 0),
// and the island's x and z EXTENTS agree to the unit — so the repair really does restore the true
// footprint, which is the claim ADR-0517 D1 rests on. What does NOT hold is a cell-to-cell
// correspondence: matched 1:1 by nearest neighbour of the same kind, the worst pair is ~62 units
// apart on an island spanning 222 x 122. There is no correspondence to compare because the RELAXED
// SUBSTRATE DECOMPOSES DIFFERENTLY at the two cameras — the same fault class ADR-0367 names, where
// "an island re-decomposing 50 -> 52 cells" is a recorded instance.
//
// ⚠⚠ CORRECTED 2026-09-07 — THE SUBSTRATE IS NOT THE BLOCKER, AND THE SENTENCE ABOVE THAT SAID SO
// IS WRONG. The paragraph above reads "the RELAXED SUBSTRATE DECOMPOSES DIFFERENTLY at the two
// cameras". That was inferred from a single whole-population number, and separating the population
// refutes it: **the mosaic agrees.** Split by kind, and matched 1:1 BEST-FIRST rather than in one
// arm's own order, the 164 `cell-ground` cells — the mosaic itself, the thing the un-projection is
// suspected of re-cutting — differ by at most **0.348 units** on an island spanning 222 x 122, across
// a NINETY-DEGREE change of camera. The entire ~62-unit disagreement is the ten `uat-bloom` markers.
// `substrate.ts` already cuts on the ground: its `GROUND` constant pins every `hexCenter`/`hexCorners`
// call to `PLAN_VIEW_ELEVATION_DEG` and `buildRelaxedCells` projects ONCE, at the very end. There was
// never a camera in the cut.
//
// ⚠ AND THE HEADLINE NUMBER WAS INFLATED BY ITS OWN MATCHER. The 1:1 pairing below walks ONE arm in
// ITS OWN ORDER and takes each descriptor's nearest unused partner, which is greedy, not generous: an
// early displaced marker steals a partner and cascades. Unrestricted nearest-neighbour puts every A
// within 30.7 of some B and 170 of the 174 within ONE unit. Read "most generous" in the test below as
// what it is — a greedy walk — and read the by-kind test at the end of this file for the real figures.
//
// ⚠ WHY THE TEN MARKERS DISAGREE, WHICH IS NOT THE SAME DEFECT. `buildUatMarkers` draws up to twenty
// polar candidates and accepts the first that clears the tree well, the spacing floor, the land, AND
// the nameplate band. The first three are ground distances (ADR-0367 D1). The fourth,
// `clearsPlate`, is a SCREEN test on purpose — the nameplate is screen art, and its own comment says
// so. So a different camera accepts a different candidate, and the markers land elsewhere. That is a
// documented design choice about what a flower may sit under, not a distance measured in the wrong
// space, and undoing it is a LOOK question rather than a repair.
//
// WHAT A LATER SESSION SHOULD TAKE FROM THIS. ADR-0527 D5's bar, restated by ADR-0540 D3 as
// tile-for-tile agreement, is MET ON THE TILES TODAY. What cannot meet it is a decoration whose
// placement deliberately reads the camera. That is an owner-level fork rather than a session's call,
// and it is authored on `forest-geometry-rebuild-arc` — do not settle it from here.

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

test('⚠ the two arms DO disagree overall — but read the next test before naming a cause', () => {
  // Pinned as a MEASUREMENT, and it still holds — the arms DO disagree. What it does not do is say
  // WHERE, and its original comment named the substrate, which the by-kind test at the end of this
  // file measures and refutes. Kept unchanged so the number this decision was taken on is still on
  // the record; read it as "something disagrees", never as "the substrate re-cuts".
  const trueSurface = drawn(arm(PLAN_VIEW_ELEVATION_DEG));
  const drawing = drawn(arm(LAND_CAMERA_ELEVATION_DEG));

  // Matched 1:1 by nearest neighbour of the same kind — the most generous pairing available, and
  // strictly better than by index. If a later change makes the substrate camera-independent this
  // separation collapses and the assertion fails, which is the point: it is a tripwire on the
  // blocker, so the day it is fixed is the day someone is told.
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
    worst > 10,
    `the arms are expected to DISAGREE somewhere while the marker scatter reads the camera — if ` +
      `this is now ${worst.toFixed(2)}, the last camera-dependent placement may be gone and ` +
      `ADR-0527 D5 / ADR-0540 are worth re-reading`,
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

test('THE MOSAIC AGREES — the substrate is camera-independent, and the disagreement is elsewhere', () => {
  // ⚠ THIS TEST EXISTS BECAUSE THE TEST ABOVE WAS READ AS SAYING SOMETHING IT CANNOT SAY. One number
  // over a mixed population named the substrate as the cause; separating the population refutes it.
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

  // AND THE WHOLE OF THE DISAGREEMENT IS THE MARKERS. Kept as a tripwire in the same shape as the
  // test above: the day a session makes the marker scatter camera-independent — which is an owner
  // question about what a flower may sit under, not a repair — this fails and says so.
  const bloomA = ofKind(trueSurface, 'uat-bloom');
  const bloomB = ofKind(drawing, 'uat-bloom');
  assert.ok(bloomA.length > 0, 'the fixture must draw UAT markers for this to measure anything');
  assert.equal(bloomB.length, bloomA.length, 'and the same number at both cameras');
  const bloomWorst = worstUnderBestFirstMatching(bloomA, bloomB);
  assert.ok(
    bloomWorst > 10,
    `the markers are expected to move while \`clearsPlate\` reads the camera — if this is now ` +
      `${bloomWorst.toFixed(2)}, re-read ADR-0540 and the question on forest-geometry-rebuild-arc`,
  );

  // The two populations together ARE the whole scene, so nothing is being quietly excluded from the
  // comparison — a by-kind split that dropped a kind could hide a disagreement in it.
  assert.equal(
    mosaicA.length + bloomA.length,
    trueSurface.length,
    'every drawn descriptor must be one of the two kinds this test separates',
  );
});
