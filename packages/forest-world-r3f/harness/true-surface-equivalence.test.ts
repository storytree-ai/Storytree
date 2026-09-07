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
// ⚠ SO THE BLOCKER IS UPSTREAM OF THE MODULE D2 DELETES, and two tempting explanations are ruled
// out here rather than left suspected. It is NOT index misalignment: sorting, and matching 1:1 by
// nearest neighbour, both leave it. It is NOT the fixture's anchors — a variant handing them over
// pre-camera under `anchorSpace: 'ground'` (which PR #1858 made possible) reproduces every figure
// to the digit, and by construction must: the default already states them at the scene's own
// camera, which is exactly what the tag re-derives. The variant is therefore not shipped.
//
// WHAT A LATER SESSION SHOULD TAKE FROM THIS. D5's bar can be met at the level it is true at — the
// footprint — or the substrate has to be made camera-independent before a per-cell equivalence can
// exist at all. Do not read the numbers below as "the repair is wrong": they say the repair is
// right about the outline and that nothing in this comparison can see inside it.

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

test('⚠ but there is NO cell-to-cell correspondence — the substrate decomposes differently per camera', () => {
  // Pinned as a MEASUREMENT, not as a wish. This is the finding that says where ADR-0527 D5's bar
  // actually stands: not at `true-footprint.ts`, which is right about the outline, but upstream at
  // the relaxed substrate, which tessellates the interior differently once the camera changes the
  // space its distances are measured in (the ADR-0367 fault class).
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
    `the interiors are expected to DISAGREE while the substrate is camera-dependent — if this is ` +
      `now ${worst.toFixed(2)}, the blocker may be gone and ADR-0527 D5 is worth re-reading`,
  );
});
