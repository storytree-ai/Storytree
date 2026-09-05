// true-footprint.test.ts — the drawing's projection undone per island, held without a GPU.
//
// What has to hold: every ground z is stretched by exactly the drawing's projection about ITS
// island's centre and x is never touched; the layout of a forest holds still; a ribbon between two
// islands lands on both stretched coasts with no step in between; a cave's bearing turns with the
// rim; and the stretch is invertible. The check that the shipped mapper's route agrees with the
// scene's own plan-view route — an independent implementation of the same arithmetic — needs the
// harness's fixture island and lives in `harness/true-footprint-routes.test.ts` (src never imports
// the harness: `scope-fence.test.ts`).

import assert from 'node:assert/strict';
import test from 'node:test';

import { LAND_CAMERA_ELEVATION_DEG, PLAN_VIEW_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import {
  islandCentres,
  nearestCentre,
  restoreTrueFootprint,
  stretchAboutIslands,
  stretchedBearing,
} from './true-footprint.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

/** A square island of side `side` centred at (cx, cz), one cell, named `id`. */
function square(id: string, cx: number, cz: number, side = 20): InstanceDescriptor {
  const h = side / 2;
  return {
    kind: 'cell-ground',
    transform: { x: cx, y: 0, z: cz },
    group: 'cell-ground',
    material: 'healthy',
    island: id,
    parcel: `${id}/p`,
    points: [
      { x: cx - h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz + h },
      { x: cx - h, y: 0, z: cz + h },
    ],
  };
}

/** A ground-plane extent: width along x, depth along z. */
interface Extent {
  w: number;
  d: number;
}

function depthOf(ds: readonly InstanceDescriptor[]): Extent {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of ds) {
    for (const p of c.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { w: maxX - minX, d: maxZ - minZ };
}

test('the land camera is 20° and the stretch it implies is 1 / sin 20° = 2.9238', () => {
  assert.equal(LAND_CAMERA_ELEVATION_DEG, 20);
  const stretch = 1 / groundFlattening();
  assert.ok(Math.abs(stretch - 2.9238) < 5e-4, `stretch ${stretch}`);
  assert.ok(Math.abs(1 / groundFlattening(PLAN_VIEW_ELEVATION_DEG) - 1) < 1e-12, 'plan view is already true');
});

test('islandCentres is the mean of each island’s ring vertices; nearestCentre picks by distance', () => {
  const ds = [square('a', 0, 0), square('b', 100, 50)];
  const c = islandCentres(ds);
  assert.equal(c.size, 2);
  assert.deepEqual(c.get('a'), { x: 0, z: 0 });
  assert.deepEqual(c.get('b'), { x: 100, z: 50 });
  assert.deepEqual(nearestCentre(c, 10, 5), { x: 0, z: 0 });
  assert.deepEqual(nearestCentre(c, 80, 40), { x: 100, z: 50 });
  assert.equal(nearestCentre(new Map(), 0, 0), null);
  // A cell with no island id contributes to no centre; a skip contributes nothing.
  const { island: _dropped, ...anon } = square('x', 5, 5);
  void _dropped;
  assert.equal(islandCentres([anon, { kind: 'skipped', sceneKind: 'tree' }]).size, 0);
});

test('⚠⚠ every ground z is stretched about ITS island’s centre, x and y untouched, the points too — and the centre does not move', () => {
  const s = 2.5;
  const ds = [square('a', 0, 0), square('b', 100, 50, 10)];
  const out = stretchAboutIslands(ds, s);
  assert.equal(out.length, 2);
  for (const [i, d] of out.entries()) {
    const b = ds[i]!;
    const cz = islandCentres(ds).get(b.island!)!.z;
    assert.equal(d.transform.x, b.transform.x);
    assert.equal(d.transform.y, b.transform.y);
    assert.ok(Math.abs(d.transform.z - cz - (b.transform.z - cz) * s) < 1e-9);
    for (const [j, p] of (d.points ?? []).entries()) {
      const q = b.points![j]!;
      assert.equal(p.x, q.x);
      assert.ok(Math.abs(p.z - cz - (q.z - cz) * s) < 1e-9);
    }
  }
  // The centres are invariant: a's stays at 0, b's stays at 50 — the layout holds still.
  const after = islandCentres(out);
  assert.deepEqual(after.get('a'), { x: 0, z: 0 });
  assert.ok(Math.abs(after.get('b')!.z - 50) < 1e-9);
  // Each island's depth grew by exactly s; their spacing did not.
  assert.ok(Math.abs(depthOf([out[0]!]).d - 20 * s) < 1e-9);
  assert.ok(Math.abs(depthOf([out[1]!]).d - 10 * s) < 1e-9);
  // The input is not mutated.
  assert.equal(ds[0]!.points![0]!.z, -10);
  // The whole stream's depth grew by LESS than s: only the islands stretch, not the water.
  const before = depthOf(ds).d;
  const now = depthOf(out).d;
  assert.ok(now > before && now < before * s, `${before} → ${now}`);
});

test('a bloom and a cave stretch about their own island; a wisp follows the nearest island', () => {
  const ds: InstanceDescriptor[] = [
    square('a', 0, 0),
    square('b', 100, 0),
    { kind: 'uat-bloom', transform: { x: 3, y: 0, z: 4 }, group: 'uat-bloom', material: 'healthy', island: 'a' },
    { kind: 'cave-arch', transform: { x: 90, y: 0, z: -8 }, group: 'cave-arch', material: 'healthy', island: 'b', bearing: 0.3 },
    { kind: 'wisp-sprite', transform: { x: 95, y: 0, z: 6 }, group: 'wisp-sprite' },
  ];
  const out = stretchAboutIslands(ds, 3);
  assert.ok(Math.abs(out[2]!.transform.z - 12) < 1e-9, 'the bloom: 4 about a’s centre 0');
  assert.ok(Math.abs(out[3]!.transform.z - -24) < 1e-9, 'the cave: -8 about b’s centre 0');
  assert.ok(Math.abs(out[4]!.transform.z - 18) < 1e-9, 'the wisp: nearest island b, 6 about 0');
  assert.equal(out[4]!.transform.x, 95);
  assert.ok(Math.abs(out[3]!.bearing! - stretchedBearing(0.3, 3)) < 1e-12, 'the cave’s bearing turned with the rim');
  assert.equal(out[2]!.bearing, undefined, 'no bearing invented');
});

test('⚠ a cave’s bearing turns with the stretched rim — n′ ∝ (s·cos b, sin b) — and is identity at 1', () => {
  assert.equal(stretchedBearing(0.7, 1), Math.atan2(Math.sin(0.7), Math.cos(0.7)));
  assert.ok(Math.abs(stretchedBearing(0.7, 1) - 0.7) < 1e-12);
  // Along x the normal does not turn at all; along z neither.
  assert.ok(Math.abs(stretchedBearing(0, 3)) < 1e-12);
  assert.ok(Math.abs(stretchedBearing(Math.PI / 2, 3) - Math.PI / 2) < 1e-12);
  // A 45° normal on a plane stretched 3× along z leans toward x: atan2(sin 45, 3 cos 45) = atan(1/3).
  assert.ok(Math.abs(stretchedBearing(Math.PI / 4, 3) - Math.atan(1 / 3)) < 1e-12);
  // Derived from the geometry, not from the function: the rim tangent (-sin b, cos b) stretched to
  // (-sin b, s·cos b) is perpendicular to the returned normal.
  for (const b of [0.2, 1.1, 2.4, -0.9]) {
    const n = stretchedBearing(b, 2.9238);
    const dot = -Math.sin(b) * Math.cos(n) + 2.9238 * Math.cos(b) * Math.sin(n);
    assert.ok(Math.abs(dot) < 1e-12, `bearing ${b}: tangent·normal = ${dot}`);
  }
});

test('⚠⚠ a ribbon between two islands lands on BOTH stretched coasts and has no step between them', () => {
  const ds: InstanceDescriptor[] = [square('a', 0, 0), square('b', 0, 100)];
  // A strip from a's south coast (z = 10) to b's north coast (z = 90), five points.
  const pts = [10, 30, 50, 70, 90].map((z) => ({ x: 0, y: 0, z }));
  const strip: InstanceDescriptor = { kind: 'trail-strip', transform: { x: 0, y: 0, z: 50 }, group: 'trail-strip', points: pts };
  const s = 3;
  const out = stretchAboutIslands([...ds, strip], s);
  const moved = out[2]!;
  // a's coast moved to 10·3 = 30; b's coast to 100 - 10·3 = 70.
  assert.ok(Math.abs(moved.points![0]!.z - 30) < 1e-9, 'the first end sits on a’s stretched coast');
  assert.ok(Math.abs(moved.points![4]!.z - 70) < 1e-9, 'the last end sits on b’s stretched coast');
  // Monotone in between: no fold, no jump.
  for (let i = 1; i < 5; i += 1) assert.ok(moved.points![i]!.z > moved.points![i - 1]!.z, `point ${i} steps back`);
  // ⚠ NON-VACUITY against the per-point-nearest-island rule: that rule would put point 3 (z=70,
  // nearer b) at 100 + (70-100)·3 = 10, BEHIND point 1 — a fold in the ribbon.
  assert.ok(moved.points![3]!.z > moved.points![1]!.z);
  // The anchor moved by the mean of the points' shifts.
  const meanShift = moved.points!.reduce((acc, p, i) => acc + (p.z - pts[i]!.z), 0) / 5;
  assert.ok(Math.abs(moved.transform.z - (50 + meanShift)) < 1e-9);
  assert.equal(moved.transform.x, 0);
  // A ribbon whose both ends are nearest the SAME island stretches about that island exactly.
  const dock: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 0, y: 0, z: -14 },
    group: 'trail-strip',
    points: [{ x: 0, y: 0, z: -18 }, { x: 0, y: 0, z: -14 }, { x: 0, y: 0, z: -10 }],
  };
  const d2 = stretchAboutIslands([...ds, dock], s)[2]!;
  assert.deepEqual(d2.points!.map((p) => p.z), [-54, -42, -30]);
  assert.ok(Math.abs(d2.transform.z - -42) < 1e-9);
});

test('a stream with no islands, or a stretch of 1, comes back unchanged; a bad factor refuses; skips pass through', () => {
  const wisp: InstanceDescriptor = { kind: 'wisp-sprite', transform: { x: 1, y: 0, z: 2 }, group: 'wisp-sprite' };
  assert.deepEqual(stretchAboutIslands([wisp], 3), [wisp]);
  const ds: Descriptor3D[] = [square('a', 0, 0), { kind: 'skipped', sceneKind: 'tree' }];
  assert.deepEqual(stretchAboutIslands(ds, 1), ds);
  assert.deepEqual(stretchAboutIslands(ds, 3)[1], { kind: 'skipped', sceneKind: 'tree' });
  assert.throws(() => stretchAboutIslands(ds, 0), /positive finite/);
  assert.throws(() => stretchAboutIslands(ds, Number.NaN), /positive finite/);
  assert.throws(() => stretchAboutIslands(ds, -2), /positive finite/);
});

test('⚠ the stretch is exactly invertible: stretching by s then by 1/s is the identity to the bit of a centre', () => {
  const ds = [square('a', 3, -7), square('b', 120, 40, 14)];
  const back = stretchAboutIslands(stretchAboutIslands(ds, 2.9238), 1 / 2.9238);
  for (const [i, d] of back.entries()) {
    for (const [j, p] of (d.points ?? []).entries()) {
      assert.ok(Math.abs(p.z - ds[i]!.points![j]!.z) < 1e-9);
    }
  }
});

test('restoreTrueFootprint at the land camera IS the stretch by 1/sin 20°; at plan view it is the identity', () => {
  const ds = [square('a', 0, 0)];
  const a = restoreTrueFootprint(ds);
  const b = stretchAboutIslands(ds, 1 / groundFlattening(LAND_CAMERA_ELEVATION_DEG));
  assert.deepEqual(a, b);
  assert.deepEqual(restoreTrueFootprint(ds, PLAN_VIEW_ELEVATION_DEG), ds);
});
