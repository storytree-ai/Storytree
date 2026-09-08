// resting-world-framing.test.ts — the 3D canvas's adoption of ADR-0471's designed resting frame.
//
// ⚠ THE ASSERTIONS ARE RELATIONS AND INDEPENDENT DERIVATIONS, never numbers remembered from a run.
// The composition is `RESTING_ISLAND_SPANS` median islands across the frame's shorter side, so the
// test re-derives that from the shared constant and checks the CAMERA delivers it — which is the
// only thing that can fail if the conversion `halfHeight = shortSide / (2 * scale)` is inverted,
// dropped, or applied to the wrong side.
//
// ⚠ AND THE FORESHORTENING IS DERIVED HERE TOO. `restingFrame` compares island sizes against a
// frame in CSS px, so what it must be handed is what the eye DELIVERS — ground x at 1, ground z at
// `sin(elevation)`. A version that fed it raw ground depth would still return a plausible scale
// and would open the view on the wrong amount of forest; the fixtures below are deliberately
// oblong in z so that mistake is separable.

import assert from 'node:assert/strict';
import test from 'node:test';

import { RESTING_ISLAND_SPANS, groundFlattening } from '@storytree/forest-world';

import {
  SHIPPED_ELEVATION_DEG,
  SHIPPED_GROUND_FLATTENING,
  frameWorld,
  islandDeliveredDiameters,
  orthographicZoomFor,
  restingWorldFraming,
} from './camera-framing.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/** A square parcel of side `side` centred on (`cx`, `cz`), attributed to island `id`. The ring is
 *  what an island's measured diameter comes from, so the fixture supplies rings rather than points. */
function parcel(id: string, cx: number, cz: number, side: number): InstanceDescriptor {
  const h = side / 2;
  return {
    kind: 'cell-ground',
    transform: { x: cx, y: 0, z: cz },
    group: 'cell-ground',
    material: 'healthy',
    island: id,
    points: [
      { x: cx - h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz + h },
      { x: cx - h, y: 0, z: cz + h },
    ],
  };
}

/** `count` same-sized islands strung down the z axis `pitch` apart — the real forest's own shape
 *  (a thin deep ribbon), which is what makes the z axis the binding one. */
function ribbon(count: number, side: number, pitch: number): InstanceDescriptor[] {
  return Array.from({ length: count }, (_, i) => parcel(`s-${i}`, 0, i * pitch, side));
}

const VIEWPORT = { width: 1600, height: 900 };

test('an island DIAMETER is the ground extent of its own parcels, not a prop count', () => {
  const island = [parcel('a', 0, 0, 40), parcel('a', 60, 0, 40)];
  // Two 40-wide parcels 60 apart span 100 across the ground; delivered depth is only
  // `40 · sin 50°`, so the larger side — the ground diameter — is the 100.
  assert.deepEqual(islandDeliveredDiameters(island), [100]);
});

test('a bloom or a cave on an island does not enlarge it', () => {
  const land = [parcel('a', 0, 0, 40)];
  const withProps: InstanceDescriptor[] = [
    ...land,
    { kind: 'uat-bloom', transform: { x: 500, y: 0, z: 0 }, group: 'uat-bloom', island: 'a' },
    { kind: 'cave-arch', transform: { x: -500, y: 0, z: 0 }, group: 'cave-arch', island: 'a' },
  ];
  assert.deepEqual(islandDeliveredDiameters(withProps), islandDeliveredDiameters(land));
});

test('an island with no id is not counted, rather than counted as one nameless island', () => {
  const anonymous: InstanceDescriptor = {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    points: [
      { x: -5, y: 0, z: -5 },
      { x: 5, y: 0, z: -5 },
      { x: 5, y: 0, z: 5 },
    ],
  };
  assert.deepEqual(islandDeliveredDiameters([anonymous]), []);
  assert.deepEqual(islandDeliveredDiameters([...ribbon(3, 40, 200), anonymous]).length, 3);
});

test('the delivered SCALE spans RESTING_ISLAND_SPANS median islands across the shorter side', () => {
  const side = 40;
  const framing = restingWorldFraming(ribbon(9, side, 300), VIEWPORT);
  const zoom = orthographicZoomFor(framing.halfHeight, Math.min(VIEWPORT.width, VIEWPORT.height));
  // `zoom` IS the delivered CSS px per world unit, so the composition is checkable end to end:
  // nine median islands must fill the shorter side exactly.
  const shortSide = Math.min(VIEWPORT.width, VIEWPORT.height);
  assert.ok(Math.abs(zoom * side * RESTING_ISLAND_SPANS - shortSide) < 1e-6, `zoom ${zoom}`);
  assert.equal(framing.resting.bound, 'designed');
  // And the round trip is exact: the scale the rule chose is the zoom the camera lands at.
  assert.ok(Math.abs(zoom - framing.resting.scale) < 1e-9);
});

test('the frame is measured in DELIVERED space — ground depth counts at sin(elevation)', () => {
  // A forest of one very deep island. Fed raw ground depth its extent would be `depth`; delivered
  // it is `depth · sin 50°`, which is what decides whether the whole world already fits inside the
  // designed frame ('whole-world') or has to be cropped to it ('designed').
  assert.ok(Math.abs(SHIPPED_GROUND_FLATTENING - groundFlattening(SHIPPED_ELEVATION_DEG)) < 1e-12);
  assert.ok(SHIPPED_GROUND_FLATTENING < 1, 'the shipped eye is not plan view');

  const framing = restingWorldFraming(ribbon(9, 40, 300), VIEWPORT);
  const zoom = orthographicZoomFor(framing.halfHeight, Math.min(VIEWPORT.width, VIEWPORT.height));
  // The world's delivered height, at the scale the rule chose, against the frame it was given.
  const groundDepth = 8 * 300 + 40;
  const deliveredHeightPx = groundDepth * SHIPPED_GROUND_FLATTENING * zoom;
  const rawHeightPx = groundDepth * zoom;
  assert.ok(deliveredHeightPx > VIEWPORT.height, 'the ribbon still runs off the frame');
  assert.ok(
    Math.abs(deliveredHeightPx / rawHeightPx - SHIPPED_GROUND_FLATTENING) < 1e-9,
    'the two readings differ by exactly the foreshortening, so the choice is separable',
  );
  // ⚠ AND THE SEPARATION IS ASSERTED, not merely shown to exist. `extentShown` is the fraction of
  // the world the frame opens on, so it is computed from the world's own extent — feeding raw
  // ground depth there reports a view onto LESS of the forest than the eye actually shows, and the
  // two answers differ by exactly `sin 50°` on a world this frame is height-bound by.
  assert.ok(Math.abs(framing.resting.extentShown - VIEWPORT.height / deliveredHeightPx) < 1e-9);
  assert.ok(
    Math.abs(framing.resting.extentShown - VIEWPORT.height / rawHeightPx) > 0.04,
    'the raw-depth reading is a different number, so this assertion chooses between them',
  );
});

test('the view is BOTTOM-ANCHORED on the world, the way the 2D map is', () => {
  const framing = restingWorldFraming(ribbon(9, 40, 300), VIEWPORT);
  const zoom = orthographicZoomFor(framing.halfHeight, Math.min(VIEWPORT.width, VIEWPORT.height));
  // The world's bottom edge is its LARGEST ground z (SVG y → 3D z, so +z is the bottom of the
  // page): the last island's far parcel edge.
  const worldBottomZ = 8 * 300 + 20;
  // The frame's own bottom edge, in ground z: the target plus half a frame-height of delivered
  // depth converted back to ground.
  const halfFrameGroundZ = VIEWPORT.height / (2 * zoom) / SHIPPED_GROUND_FLATTENING;
  const frameBottomZ = framing.target[2] + halfFrameGroundZ;
  assert.ok(Math.abs(frameBottomZ - worldBottomZ) < 1e-6, `frame bottom ${frameBottomZ}`);
  // Horizontally centred on the world, which the ribbon puts at x = 0.
  assert.ok(Math.abs(framing.target[0]) < 1e-9);
  // ⚠ The crop is the point: a resting scale tighter than the fit must leave the canopy off the
  // top, or bottom-anchoring would be a distinction with no consequence.
  const worldTopZ = -20;
  assert.ok(framing.target[2] - halfFrameGroundZ > worldTopZ, 'the top of the forest is cropped');
});

test('the eye keeps the FIT’s offset, so near/far still contain a world the viewer pans across', () => {
  const world = ribbon(9, 40, 300);
  const fit = frameWorld([...world]);
  const framing = restingWorldFraming(world, VIEWPORT);
  const fitOffset = [fit.position[1] - fit.target[1], fit.position[2] - fit.target[2]];
  const restingOffset = [
    framing.position[1] - framing.target[1],
    framing.position[2] - framing.target[2],
  ];
  assert.ok(Math.abs(restingOffset[0]! - fitOffset[0]!) < 1e-9);
  assert.ok(Math.abs(restingOffset[1]! - fitOffset[1]!) < 1e-9);
  // …and the framing itself is NOT the fit's, or there would be nothing to adopt.
  assert.ok(Math.abs(framing.halfHeight - fit.halfHeight) > 1);
});

test('an empty world falls through to the fit rather than inventing a composition', () => {
  const framing = restingWorldFraming([], VIEWPORT);
  const fit = frameWorld([]);
  assert.deepEqual(framing.target, fit.target);
  assert.deepEqual(framing.position, fit.position);
  assert.equal(framing.halfHeight, fit.halfHeight);
  assert.equal(framing.resting.bound, 'undetermined');
});

test('a zero-sized viewport falls through to the fit rather than dividing by it', () => {
  const world = ribbon(3, 40, 300);
  for (const viewport of [{ width: 0, height: 900 }, { width: 1600, height: 0 }]) {
    const framing = restingWorldFraming(world, viewport);
    assert.equal(framing.halfHeight, frameWorld([...world]).halfHeight);
    assert.equal(framing.resting.bound, 'undetermined');
  }
});

test('a world with land but no NAMED island still frames, on the extent floor', () => {
  // The composition has nothing to pin to, so `restingFrame` reports `undetermined` and falls back
  // to the fit — which must still be a fit of the DELIVERED world, not a divide by zero.
  const anonymous: InstanceDescriptor = {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    points: [
      { x: -100, y: 0, z: -100 },
      { x: 100, y: 0, z: -100 },
      { x: 100, y: 0, z: 100 },
      { x: -100, y: 0, z: 100 },
    ],
  };
  const framing = restingWorldFraming([anonymous], VIEWPORT);
  assert.equal(framing.resting.bound, 'undetermined');
  assert.ok(Number.isFinite(framing.halfHeight) && framing.halfHeight > 0);
});
