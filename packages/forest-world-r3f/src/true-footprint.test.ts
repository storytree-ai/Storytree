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
  scaleAboutIslands,
  scaledBearing,
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
  // ⚠ AWAY FROM z = 0 AND WITH x VARYING, NON-UNIFORMLY. Islands on z = 0 make `p.z - c.z` and
  // `p.z + c.z` the same number, and points on one x make the arc length blind to its x term —
  // both survived `check:mutation-diff` before this fixture moved.
  const ds: InstanceDescriptor[] = [square('a', 0, 40), square('b', 0, 140)];
  // A strip from a's south coast (z = 50) to b's north coast (z = 130), five points, wandering in x.
  const raw = [
    { x: 0, z: 50 },
    { x: 12, z: 70 },
    { x: 12, z: 90 },
    { x: -5, z: 110 },
    { x: 0, z: 130 },
  ];
  const pts = raw.map((p) => ({ x: p.x, y: 0, z: p.z }));
  const strip: InstanceDescriptor = { kind: 'trail-strip', transform: { x: 0, y: 0, z: 90 }, group: 'trail-strip', points: pts };
  const s = 3;
  const out = stretchAboutIslands([...ds, strip], s);
  const moved = out[2]!;
  // a's coast moved to 40 + 10·3 = 70; b's coast to 140 - 10·3 = 110.
  assert.ok(Math.abs(moved.points![0]!.z - 70) < 1e-9, 'the first end sits on a’s stretched coast');
  assert.ok(Math.abs(moved.points![4]!.z - 110) < 1e-9, 'the last end sits on b’s stretched coast');
  // Every interior point is DERIVED here from the definition — arc-length blend of the two
  // islands' displacements — never read back off the module.
  const lengths = [0];
  for (let i = 1; i < raw.length; i += 1) {
    lengths.push(lengths[i - 1]! + Math.hypot(raw[i]!.x - raw[i - 1]!.x, raw[i]!.z - raw[i - 1]!.z));
  }
  const total = lengths[4]!;
  for (const [i, p] of raw.entries()) {
    const t = lengths[i]! / total;
    const want = p.z + (1 - t) * (p.z - 40) * (s - 1) + t * (p.z - 140) * (s - 1);
    assert.ok(Math.abs(moved.points![i]!.z - want) < 1e-9, `point ${i}: ${moved.points![i]!.z} against ${want}`);
    assert.equal(moved.points![i]!.x, p.x, 'x never moves');
  }
  // Monotone in between: no fold, no jump.
  for (let i = 1; i < 5; i += 1) assert.ok(moved.points![i]!.z > moved.points![i - 1]!.z, `point ${i} steps back`);
  // ⚠ NON-VACUITY against the per-point-nearest-island rule: that rule would put point 3 (z=110,
  // nearer b) at 140 + (110-140)·3 = 50, BEHIND point 1 — a fold in the ribbon.
  assert.ok(moved.points![3]!.z > moved.points![1]!.z);
  // The anchor moved by the mean of the points' shifts.
  const meanShift = moved.points!.reduce((acc, p, i) => acc + (p.z - pts[i]!.z), 0) / 5;
  assert.ok(Math.abs(moved.transform.z - (90 + meanShift)) < 1e-9);
  assert.equal(moved.transform.x, 0);
  // A ghost strip is a ribbon too.
  const ghost: InstanceDescriptor = { ...strip, kind: 'trail-ghost-strip', group: 'trail-ghost-strip' };
  const g = stretchAboutIslands([...ds, ghost], s)[2]!;
  assert.deepEqual(g.points, moved.points);
  // A ribbon of ONE point (or coincident points) has no arc length to blend along: it is placed
  // about the island nearest it and stays finite.
  const dot: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 0, y: 0, z: 56 },
    group: 'trail-strip',
    points: [{ x: 0, y: 0, z: 56 }, { x: 0, y: 0, z: 56 }],
  };
  const d1 = stretchAboutIslands([...ds, dot], s)[2]!;
  assert.deepEqual(d1.points!.map((p) => p.z), [88, 88]);
  assert.equal(d1.transform.z, 88);
  // A strip with NO points, or an empty list, is a point-like thing: nearest island, no blend.
  const bare: InstanceDescriptor = { kind: 'trail-strip', transform: { x: 0, y: 0, z: 56 }, group: 'trail-strip' };
  assert.equal(stretchAboutIslands([...ds, bare], s)[2]!.transform.z, 88);
  assert.equal(stretchAboutIslands([...ds, { ...bare, points: [] }], s)[2]!.transform.z, 88);
  // A ribbon whose both ends are nearest the SAME island stretches about that island exactly.
  const dock: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 0, y: 0, z: 26 },
    group: 'trail-strip',
    points: [{ x: 0, y: 0, z: 22 }, { x: 0, y: 0, z: 26 }, { x: 0, y: 0, z: 30 }],
  };
  const d2 = stretchAboutIslands([...ds, dock], s)[2]!;
  assert.deepEqual(d2.points!.map((p) => p.z), [-14, -2, 10]);
  assert.ok(Math.abs(d2.transform.z - -2) < 1e-9);
});

test('⚠ islandCentres reads CELLS ONLY, and only cells with vertices; nearestCentre keeps the first of two equidistant centres', () => {
  // A bloom carrying an island id AND points is not ground and contributes to no centre.
  const impostor: InstanceDescriptor = {
    kind: 'uat-bloom',
    transform: { x: 500, y: 0, z: 500 },
    group: 'uat-bloom',
    island: 'a',
    points: [{ x: 500, y: 0, z: 500 }],
  };
  assert.deepEqual(islandCentres([square('a', 0, 0), impostor]).get('a'), { x: 0, z: 0 });
  // A cell with an island id and NO ring contributes nothing — the island is absent, not at NaN.
  const { points: _ring, ...ringless } = square('r', 5, 5);
  void _ring;
  assert.equal(islandCentres([ringless]).size, 0);
  assert.equal(islandCentres([{ ...ringless, points: [] }]).size, 0);
  // Two centres at the same distance: the first inserted wins, deterministically.
  const c = islandCentres([square('a', -10, 0), square('b', 10, 0)]);
  assert.deepEqual(nearestCentre(c, 0, 0), { x: -10, z: 0 });
});

test('⚠ a descriptor that NAMES its island stretches about it even when another island is nearer; an unknown island id falls back to the nearest', () => {
  // ⚠ b sits at a DIFFERENT z from a, or "about a" and "about b" would be the same number and
  // the own-island branch could be deleted unnoticed (`check:mutation-diff`, 2026-09-05).
  const ds: InstanceDescriptor[] = [
    square('a', 0, 0),
    square('b', 100, 30),
    // A bloom of island a standing right beside b.
    { kind: 'uat-bloom', transform: { x: 95, y: 0, z: 34 }, group: 'uat-bloom', material: 'healthy', island: 'a' },
    // A cave claiming an island the stream does not carry.
    { kind: 'cave-arch', transform: { x: 95, y: 0, z: 34 }, group: 'cave-arch', material: 'healthy', island: 'ghost', bearing: 0 },
    // A wisp names no island at all.
    { kind: 'wisp-sprite', transform: { x: 95, y: 0, z: 34 }, group: 'wisp-sprite' },
  ];
  const out = stretchAboutIslands(ds, 3);
  assert.ok(Math.abs(out[2]!.transform.z - 34 * 3) < 1e-9, 'the bloom stretched about a (its own, z 0), not b (the nearest, z 30)');
  assert.ok(Math.abs(out[3]!.transform.z - (30 + 4 * 3)) < 1e-9, 'the cave fell back to the nearest island — b');
  assert.ok(Math.abs(out[4]!.transform.z - (30 + 4 * 3)) < 1e-9, 'the wisp follows the nearest island — b');
  // And a big island beside a tiny one: the big ring's corners are nearer the tiny island than
  // their own centre, and still stretch about their own — a ring is never blended like a ribbon.
  const big = square('big', 0, 0, 100);
  const tiny = square('tiny', 60, 0, 4);
  const [bigOut] = stretchAboutIslands([big, tiny], 3);
  assert.deepEqual(bigOut!.points!.map((p) => p.z), [-150, -150, 150, 150]);
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

// ---------------------------------------------------------------- the general scale

test('⚠ scaleAboutIslands REFUSES a scale that is not a positive finite pair, naming the island and the pair; zero is refused, not only negatives', () => {
  const isle = square('a', 0, 0);
  for (const bad of [
    { x: 0, z: 1 },
    { x: 1, z: 0 },
    { x: -1, z: 1 },
    { x: 1, z: -0.5 },
    { x: Number.NaN, z: 1 },
    { x: 1, z: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(
      () => scaleAboutIslands([isle], () => bad),
      (e: unknown) => e instanceof Error && e.message === `true-footprint: island "a" was given a scale of (${bad.x}, ${bad.z}); both must be positive finite numbers`,
      `(${bad.x}, ${bad.z}) was accepted`,
    );
  }
  // And a positive pair on each axis is applied on each axis, about the island's centre.
  const [out] = scaleAboutIslands([square('a', 10, 20)], () => ({ x: 2, z: 0.5 })) as [InstanceDescriptor];
  const e = depthOf([out]);
  assert.ok(Math.abs(e.w - 40) < 1e-9 && Math.abs(e.d - 10) < 1e-9, `${e.w} × ${e.d}`);
  assert.deepEqual(out.transform, { x: 10, y: 0, z: 20 });
  assert.deepEqual(scaleAboutIslands([], () => ({ x: 2, z: 2 })), []);
});

test('⚠ a wisp EQUIDISTANT from two islands follows the FIRST — the tie rule nearestCentre already holds', () => {
  const a = square('a', 0, 0);
  const b = square('b', 100, 0);
  const wisp: InstanceDescriptor = { kind: 'wisp-sprite', transform: { x: 50, y: 0, z: 0 }, group: 'g' };
  // a scales by 2 about (0, 0) — the wisp at 50 goes to 100; b by 0.5 about (100, 0) — it would go to 75.
  const out = scaleAboutIslands([a, b, wisp], (id) => (id === 'a' ? { x: 2, z: 2 } : { x: 0.5, z: 0.5 }));
  assert.deepEqual(out[2]!.transform, { x: 100, y: 0, z: 0 });
  // Listed the other way round, b is first and wins the tie.
  const swapped = scaleAboutIslands([b, a, wisp], (id) => (id === 'a' ? { x: 2, z: 2 } : { x: 0.5, z: 0.5 }));
  assert.deepEqual(swapped[2]!.transform, { x: 75, y: 0, z: 0 });
});

test('⚠ a ribbon under an x-scale: each end follows its own island along x, the points between blend, and the transform moves by the mean shift', () => {
  const a = square('a', 0, 0); // scaled ×3 about (0, 0)
  const b = square('b', 200, 0); // held
  const strip: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 105, y: 0, z: 7 },
    group: 'g',
    points: [
      { x: 10, y: 0, z: 7 },
      { x: 105, y: 0, z: 7 },
      { x: 200, y: 0, z: 7 },
    ],
  };
  const out = scaleAboutIslands([a, b, strip], (id) => (id === 'a' ? { x: 3, z: 1 } : { x: 1, z: 1 }));
  const s = out[2]!;
  // First end: attached to a, (10 − 0) × (3 − 1) = +20. Last end: attached to b, 0. The middle
  // point blends the two islands' displacements OF ITSELF by arc length: ½·(105 − 0)·2 + ½·0 = +105.
  assert.deepEqual(s.points!.map((p) => p.x), [30, 210, 200]);
  assert.ok(s.points!.every((p) => p.z === 7));
  // The transform moves by the MEAN of the points' shifts: (20 + 105 + 0) / 3.
  assert.ok(Math.abs(s.transform.x - (105 + 125 / 3)) < 1e-9, `${s.transform.x}`);
  assert.equal(s.transform.z, 7);
});

test('scaledBearing: the rim normal turns with an anisotropic scale and not with an isotropic one; the z-stretch is the special case', () => {
  assert.ok(Math.abs(scaledBearing(0.7, { x: 2, z: 2 }) - 0.7) < 1e-12);
  assert.ok(Math.abs(scaledBearing(0.7, { x: 1, z: 3 }) - stretchedBearing(0.7, 3)) < 1e-12);
  assert.ok(Math.abs(scaledBearing(0.7, { x: 3, z: 1 }) - Math.atan2(Math.sin(0.7), Math.cos(0.7) / 3)) < 1e-12);
});
