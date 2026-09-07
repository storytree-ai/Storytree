// true-surface-equivalence.test.ts — ADR-0527 D5's evidence bar, met.
//
// THE QUESTION THE DELETION WAITS ON. `restoreTrueFootprint` un-projects the drawing the 2D surface
// handed over, stretching every ground z by `1 / sin(elevation)` about each island's own centre
// (ADR-0517 D1). ADR-0527 D2 deletes it, on the ground that the layout should EMIT a true ground
// surface rather than a drawing somebody un-projects afterwards. D5 does not allow that deletion on
// argument: it asks for evidence that **mapping a true surface lands where un-projecting the drawing
// lands**. This file is that evidence.
//
// ⚠⚠ AND IT CORRECTS THE READING THAT SAID THE EVIDENCE COULD NOT BE BUILT. A session on 2026-09-07
// ran both arms, got 1300 descriptors against 1297, found every DRAWN family matching at 174 in the
// same kind order, and then compared those 174 INDEX-WISE ACROSS THE UNFILTERED LIST — which pairs
// object i of one arm with object i of the other while three extra entries sit between them. The
// deltas that produced (346 units in x, on an axis neither the projection nor its inverse touches)
// were read as the two scenes differing in CONTENT, and blamed on the fixture mixing screen
// constants into ground coordinates. On that reading the deletion was blocked for want of a fixture.
//
// FILTER THE UNDRAWN NODES FIRST AND THE 174 LINE UP EXACTLY. There is no content divergence. The
// three extra entries are `parcel-blade` nodes in the SKIPPED family — nodes the mapper emits and
// never draws — so they cannot move the picture by construction, and the blocker was the comparison
// method rather than the fixture. Checked against the fixture's ground-anchor variant too (the
// anchors handed over pre-camera under `anchorSpace: 'ground'`, ADR-0527 D1): identical in every
// figure, which rules the anchors out as the cause rather than leaving them suspected.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LAND_CAMERA_ELEVATION_DEG, PLAN_VIEW_ELEVATION_DEG } from '@storytree/forest-world';

import { islandScene } from './island-fixture.js';
import { worldTo3D } from '../src/world-to-3d.js';

/** Only the fields this comparison reads — the mapper's descriptors are a wide union. */
interface Placed {
  kind: string;
  x?: number;
  y?: number;
  z?: number;
}

/** One arm: build the island at a camera and map it, telling the mapper the same camera.
 *
 *  `landAreaPerCapability: null` leaves every island at the size the drawing gave it — the control
 *  option, so this measures the projection and nothing the capability ratio does on top of it. */
function arm(elevationDeg: number): Placed[] {
  return worldTo3D(islandScene({ cameraElevationDeg: elevationDeg }), {
    cameraElevationDeg: elevationDeg,
    landAreaPerCapability: null,
  }) as unknown as Placed[];
}

test('mapping a TRUE surface lands EXACTLY where un-projecting the drawing lands — ADR-0527 D5', () => {
  // At plan view the stretch factor is `1 / sin 90° = 1`, so the true-surface arm passes through
  // `restoreTrueFootprint` untouched: this compares the repair against its own absence.
  const trueSurface = arm(PLAN_VIEW_ELEVATION_DEG).filter((d) => d.kind !== 'skipped');
  const drawing = arm(LAND_CAMERA_ELEVATION_DEG).filter((d) => d.kind !== 'skipped');

  assert.equal(trueSurface.length, 174, 'the fixture draws 174 descriptors');
  assert.equal(drawing.length, trueSurface.length, 'and both arms draw the same number');

  let worst = 0;
  let where = '';
  for (const i of trueSurface.keys()) {
    const a = trueSurface[i]!;
    const b = drawing[i]!;
    assert.equal(a.kind, b.kind, `descriptor ${i} is the same kind on both arms`);
    for (const axis of ['x', 'y', 'z'] as const) {
      const d = Math.abs((a[axis] ?? 0) - (b[axis] ?? 0));
      if (d > worst) {
        worst = d;
        where = `${a.kind}[${i}].${axis}`;
      }
    }
  }
  // EXACTLY zero, not "close". The repair is an affine scale about each island's centre and its
  // inverse is the projection the surface applied, so the round trip is the identity in doubles —
  // a tolerance here would hide the day it stops being one.
  assert.equal(worst, 0, `the two arms must place every drawn descriptor identically (worst: ${where})`);
});

test('the ONLY difference is undrawn — three `parcel-blade` nodes the mapper never draws', () => {
  // Stated as a value, and as the reason the counts differ at all, so the next reader meets the
  // 1300-vs-1297 gap with its explanation attached instead of re-deriving it as a blocker.
  const undrawn = (elevationDeg: number): number =>
    arm(elevationDeg).filter((d) => d.kind === 'skipped').length;
  const atPlan = undrawn(PLAN_VIEW_ELEVATION_DEG);
  const atCamera = undrawn(LAND_CAMERA_ELEVATION_DEG);
  assert.equal(atPlan - atCamera, 3, `the plan-view arm emits three more undrawn nodes (${atPlan} vs ${atCamera})`);
  // And they are undrawn BY KIND, which is what makes them unable to move the picture — the claim
  // this whole file rests on. If a later change starts drawing `skipped`, this fails rather than the
  // equivalence above quietly becoming a different statement.
  assert.ok(
    arm(PLAN_VIEW_ELEVATION_DEG).every((d) => d.kind !== 'skipped' || (d.x === undefined && d.z === undefined)),
    'a skipped descriptor carries no placement — it is a record that the mapper declined to draw',
  );
});
