// shore-fall.test.ts — the pure arithmetic of the landform that falls to the shore.
//
// ⚠ WHAT THIS FILE ASSERTS AND WHAT IT DELIBERATELY DOES NOT. Everything here is a claim about
// the FIELD — the falloff, the distance, the height, the normal — driven by rings written out in
// this file, so it needs no fixture and no renderer. The claims about the REAL island (its rim,
// its parcel count, what each arm costs) live in `harness/shipped-shore-scene.test.ts`, next to
// the instrument that measures them. That division is the one `coast-clip.test.ts` already draws.

import assert from 'node:assert/strict';
import test from 'node:test';

import { landGradient, landHeight, landHeightRange } from './land-relief.js';
import {
  AUTHORED_SHORE_WIDTH,
  SHIPPED_SHORE,
  SHORE_ARMS,
  SHORE_ARM_WIDTH,
  SHORE_DIP,
  shoreFall,
  shoreFallSlope,
  shoreField,
  shoreRelief,
} from './shore-fall.js';
import type { InstanceDescriptor } from './world-to-3d.js';

// ---------------------------------------------------------------------------
// Fixtures — a square island, so every distance in this file is one anybody can check by hand.
// ---------------------------------------------------------------------------

/** One square parcel from (0,0) to (SIDE,SIDE). Its rim is its own outline, so the distance to
 *  the shore from any interior point is the distance to the nearest of four axis-aligned sides. */
const SIDE = 100;

function square(island = 'story-a', ox = 0, oz = 0): InstanceDescriptor {
  return {
    kind: 'cell-ground',
    island,
    parcel: `${island}/only`,
    transform: { x: ox, y: 0, z: oz },
    points: [
      { x: ox, y: 0, z: oz },
      { x: ox + SIDE, y: 0, z: oz },
      { x: ox + SIDE, y: 0, z: oz + SIDE },
      { x: ox, y: 0, z: oz + SIDE },
    ],
  } as InstanceDescriptor;
}

// ---------------------------------------------------------------------------
// The falloff
// ---------------------------------------------------------------------------

test('the falloff is 0 at the waterline, 1 at the band edge, and smoothstep between', () => {
  assert.equal(shoreFall(0, 10), 0);
  assert.equal(shoreFall(10, 10), 1);
  assert.equal(shoreFall(5, 10), 0.5);
  // smoothstep, not linear — a quarter of the way in delivers less than a quarter of the rise.
  assert.ok(shoreFall(2.5, 10) < 0.25);
  assert.equal(shoreFall(2.5, 10), 0.25 * 0.25 * (3 - 2 * 0.25));
});

test('past the band the falloff is exactly 1, and it never overshoots inside it', () => {
  assert.equal(shoreFall(10.0001, 10), 1);
  assert.equal(shoreFall(1e9, 10), 1);
  for (let d = 0; d <= 10; d += 0.25) {
    const f = shoreFall(d, 10);
    assert.ok(f >= 0 && f <= 1, `f(${d}) = ${f} left [0,1]`);
  }
});

test('a band of ZERO width is the control — the falloff is 1 everywhere, including AT the shore', () => {
  // The control is the same code path as every arm rather than a branch around it, so this is an
  // ordinary answer rather than a guard: at width 0 there is no band, so nowhere is in one.
  assert.equal(shoreFall(0, 0), 1);
  assert.equal(shoreFall(50, 0), 1);
  assert.equal(shoreFallSlope(0, 0), 0);
});

test('the falloff SLOPE vanishes at both ends and peaks in the middle', () => {
  assert.equal(shoreFallSlope(0, 10), 0);
  assert.equal(shoreFallSlope(10, 10), 0);
  assert.equal(shoreFallSlope(20, 10), 0);
  // s'(t) = 6t(1-t) peaks at t = 1/2 with value 3/2, divided by the width.
  assert.ok(Math.abs(shoreFallSlope(5, 10) - 1.5 / 10) < 1e-12);
  assert.ok(shoreFallSlope(2.5, 10) < shoreFallSlope(5, 10));
  assert.ok(shoreFallSlope(7.5, 10) < shoreFallSlope(5, 10));
});

test('⚠ THE SLOPE IS THE FALLOFF-OF-DISTANCE DERIVATIVE — held to a finite difference', () => {
  // A transcription that divided by the wrong thing, or dropped the 6, passes every shape test
  // above and fails here.
  const w = 7;
  for (const d of [0.5, 1.5, 3, 4.5, 6, 6.5]) {
    const h = 1e-6;
    const fd = (shoreFall(d + h, w) - shoreFall(d - h, w)) / (2 * h);
    assert.ok(
      Math.abs(fd - shoreFallSlope(d, w)) < 1e-6,
      `at d=${d}: analytic ${shoreFallSlope(d, w)} vs finite difference ${fd}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The distance field
// ---------------------------------------------------------------------------

test('the shore of one square parcel is its own outline', () => {
  const field = shoreField([square()], 40);
  assert.equal(field.loops, 1);
  // Dead centre: 50 units from all four sides, so capped at the band width.
  assert.equal(field.sample(50, 50).distance, 40);
  // Ten in from the west side.
  const s = field.sample(10, 50);
  assert.ok(Math.abs(s.distance - 10) < 1e-9, `distance ${s.distance}`);
  // Inland from the west side is +x.
  assert.ok(Math.abs(s.gx - 1) < 1e-9 && Math.abs(s.gz) < 1e-9, `gradient ${s.gx},${s.gz}`);
});

test('the gradient points inland from whichever side is nearest', () => {
  const field = shoreField([square()], 40);
  assert.ok(Math.abs(field.sample(50, 10).gz - 1) < 1e-9, 'from the north side, inland is +z');
  assert.ok(Math.abs(field.sample(90, 50).gx + 1) < 1e-9, 'from the east side, inland is -x');
  assert.ok(Math.abs(field.sample(50, 90).gz + 1) < 1e-9, 'from the south side, inland is -z');
});

test('ON the shore the distance is zero and the gradient is zero — it is undefined there', () => {
  const s = shoreField([square()], 40).sample(0, 50);
  assert.equal(s.distance, 0);
  assert.equal(s.gx, 0);
  assert.equal(s.gz, 0);
});

test('the distance is CAPPED at the band width, and the cap is the only reason a deep point is cheap', () => {
  assert.equal(shoreField([square()], 5).sample(50, 50).distance, 5);
  assert.equal(shoreField([square()], 12).sample(50, 50).distance, 12);
  // Inside the band the cap is not reached, so the real distance comes back.
  assert.ok(Math.abs(shoreField([square()], 12).sample(3, 50).distance - 3) < 1e-9);
});

test('⚠ A NEIGHBOURING ISLAND NEVER PULLS THE SHORE — the nearest loop is the containing one', () => {
  // Two squares 20 units apart. A point 5 units inside A's east side is 25 from B's west side,
  // so A wins — and it wins for the geometric reason the module's own note gives, not by luck.
  const field = shoreField([square('story-a'), square('story-b', SIDE + 20, 0)], 60);
  assert.equal(field.loops, 2);
  const s = field.sample(SIDE - 5, 50);
  assert.ok(Math.abs(s.distance - 5) < 1e-9, `distance ${s.distance}`);
  assert.ok(s.gx < 0, 'inland from the EAST side of A is -x, not toward B');
});

test('a descriptor that belongs to no coast contributes no shore', () => {
  const tree = { kind: 'story-tree', island: 'story-a', transform: { x: 5, y: 0, z: 5 } };
  // ⚠ OMITTED, NOT SET TO `undefined`. Under `exactOptionalPropertyTypes` those are different
  // inputs, and only the first is the shape `worldTo3D` can actually emit.
  const { island: _i, ...homeless } = square();
  const { points: _p, ...ringless } = square('story-c');
  const field = shoreField(
    [square(), tree as InstanceDescriptor, homeless, ringless],
    40,
  );
  assert.equal(field.loops, 1);
});

test('no parcels at all is a field with no shore — everything is inland', () => {
  const field = shoreField([], 40);
  assert.equal(field.loops, 0);
  assert.deepEqual(field.sample(0, 0), { distance: 40, gx: 0, gz: 0 });
});

// ---------------------------------------------------------------------------
// The relief — the two properties the whole increment rests on
// ---------------------------------------------------------------------------

test('⚠⚠ INLAND OF THE BAND THE FIELD IS `landRelief` TO THE LAST BIT', () => {
  // Not "within a tolerance" — the same double. `(H + D) * 1 - D` is `H` exactly, and a session
  // that later reaches for a tolerance here has changed the claim rather than relaxed it.
  const relief = shoreRelief([square()], 'beach');
  for (const [x, z] of [[50, 50], [40, 60], [55, 45], [30, 30], [70, 70]] as const) {
    assert.equal(relief.height(x, z), landHeight(x, z), `height at ${x},${z}`);
    const g = landGradient(x, z);
    const len = Math.hypot(g.dx, 1, g.dz);
    const n = relief.normal(x, z);
    assert.equal(n.x, -g.dx / len, `normal.x at ${x},${z}`);
    assert.equal(n.y, 1 / len);
    assert.equal(n.z, -g.dz / len);
  }
});

test('⚠⚠ AT THE WATERLINE THE LAND SITS EXACTLY `SHORE_DIP` BELOW THE GRASS LINE', () => {
  // The half of the reference's landform a pure scaling drops: scaling alone leaves the beach at
  // the height of flat ground, and flat ground is what its own comment says has no shore.
  const relief = shoreRelief([square()], 'beach');
  assert.ok(Math.abs(relief.height(0, 50) - -SHORE_DIP) < 1e-9);
  assert.ok(Math.abs(relief.height(50, 0) - -SHORE_DIP) < 1e-9);
  assert.ok(Math.abs(relief.height(SIDE, 50) - -SHORE_DIP) < 1e-9);
});

test('⚠⚠ THE HEIGHT ABOVE THE WATERLINE IS THE FALLOFF TIMES THE OLD HEIGHT ABOVE IT', () => {
  // THE COMPONENT, STATED EXACTLY. `h + D == f * (H + D)` for every point, which says the shore
  // fall does one thing: it scales the land's height ABOVE THE WATERLINE by the falloff. Total at
  // the shore, nil at the band edge, smoothstep between.
  //
  // ⚠ THIS REPLACED A MONOTONICITY TEST WHOSE OWN PREMISE WAS FALSE, and the correction is worth
  // keeping. "Walking inland the land only rises" assumed the relief's sine sum moves less than
  // the 0.62 dip over 7 units; it has amplitude 4.2 and moves far more, so the height genuinely
  // falls at d = 5.5 on this line. Monotonicity was never a property of this component — a land
  // with relief has slopes both ways — and asserting it would have pinned an accident of the
  // fixture. The identity below is the thing that IS true, and it holds whatever the swell does.
  const relief = shoreRelief([square()], 'beach');
  for (let d = 0; d <= 10; d += 0.5) {
    const f = shoreFall(Math.min(d, SHORE_ARM_WIDTH.beach), SHORE_ARM_WIDTH.beach);
    const above = relief.height(d, 50) + SHORE_DIP;
    const wasAbove = landHeight(d, 50) + SHORE_DIP;
    assert.ok(
      Math.abs(above - f * wasAbove) < 1e-12,
      `at ${d}: ${above} is not ${f} x ${wasAbove}`,
    );
  }
});

test('the shore fall moves the land TOWARD the waterline and never past it', () => {
  // The corollary, and the one a reader checks against the picture: a beach cannot end up higher
  // than the land behind it, nor dip below the waterline it is falling to.
  const relief = shoreRelief([square()], 'shelf');
  for (let d = 0; d <= 16.5; d += 0.5) {
    const moved = relief.height(d, 50) + SHORE_DIP;
    const was = landHeight(d, 50) + SHORE_DIP;
    assert.ok(Math.abs(moved) <= Math.abs(was) + 1e-12, `at ${d}: |${moved}| > |${was}|`);
    assert.ok(moved * was >= 0, `at ${d}: the fall crossed the waterline`);
  }
});

test('⚠⚠ THE NORMAL IS THE NORMAL OF THE HEIGHT THIS OBJECT RETURNS — the conservation law', () => {
  // THE ASSERTION THIS FILE EXISTS FOR. The normal is computed analytically through the product
  // rule; this drives a CENTRAL DIFFERENCE of the height and demands they agree. The two routes
  // share no arithmetic, so dropping the product rule's second term — the mistake a transcription
  // makes, and one that is invisible in the picture, the bounds and the silhouette — fails here
  // and nowhere else.
  const relief = shoreRelief([square()], 'beach');
  const h = 1e-5;
  // Sample ACROSS the band on all four approaches, plus deep inland. The band is 7 wide.
  const points: readonly (readonly [number, number])[] = [
    [1, 50], [2, 50], [3.5, 50], [5, 50], [6.5, 50],
    [50, 1], [50, 3.5], [50, 6.5],
    [SIDE - 2, 50], [SIDE - 5, 50],
    [50, SIDE - 3.5],
    [50, 50], [30, 40],
  ];
  for (const [x, z] of points) {
    const dx = (relief.height(x + h, z) - relief.height(x - h, z)) / (2 * h);
    const dz = (relief.height(x, z + h) - relief.height(x, z - h)) / (2 * h);
    const len = Math.hypot(dx, 1, dz);
    const n = relief.normal(x, z);
    assert.ok(
      Math.abs(n.x - -dx / len) < 1e-4 && Math.abs(n.z - -dz / len) < 1e-4,
      `at ${x},${z}: analytic (${n.x}, ${n.z}) vs finite difference (${-dx / len}, ${-dz / len})`,
    );
    assert.ok(Math.abs(n.y - 1 / len) < 1e-4, `at ${x},${z}: n.y ${n.y} vs ${1 / len}`);
  }
});

test('the normal is a UNIT vector everywhere, and points up', () => {
  const relief = shoreRelief([square()], 'shelf');
  for (const [x, z] of [[0, 50], [1, 50], [8, 50], [16, 50], [50, 50]] as const) {
    const n = relief.normal(x, z);
    assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12, `not unit at ${x},${z}`);
    assert.ok(n.y > 0, `normal points down at ${x},${z}`);
  }
});

// ---------------------------------------------------------------------------
// The arms
// ---------------------------------------------------------------------------

test('the CONTROL arm is the map exactly as it drew before this module', () => {
  const relief = shoreRelief([square()], 'none');
  // Right at the waterline, where every other arm dips.
  assert.equal(relief.height(0, 50), landHeight(0, 50));
  assert.equal(relief.height(1, 50), landHeight(1, 50));
  const g = landGradient(0, 50);
  const len = Math.hypot(g.dx, 1, g.dz);
  assert.equal(relief.normal(0, 50).x, -g.dx / len);
});

test('every arm is declared, control first, and the widths are the authored ones', () => {
  assert.deepEqual([...SHORE_ARMS], ['none', 'authored', 'beach', 'shelf']);
  assert.equal(SHORE_ARM_WIDTH.none, 0);
  assert.equal(SHORE_ARM_WIDTH.authored, AUTHORED_SHORE_WIDTH);
  assert.equal(AUTHORED_SHORE_WIDTH, 3.1, "the reference generator's own BEACH");
  assert.equal(SHORE_DIP, 0.62, "the reference generator's own beach dip");
  assert.equal(SHORE_ARM_WIDTH.beach, 7, 'COAST_OUTSET — the beach this map actually draws');
  assert.equal(SHORE_ARM_WIDTH.shelf, 16.5, 'the mean parcel diameter');
  assert.ok(SHORE_ARMS.includes(SHIPPED_SHORE));
});

test('⚠ THE ARMS ARE THREE DIFFERENT LANDS, and the authored width leaves our own beach standing', () => {
  // The finding this increment puts to a picture: the reference's band is 3.1 units and the beach
  // the coast clip draws is 7, so `authored` has already reached full height less than half way
  // across it, while `beach` is still rising.
  const at = (arm: 'authored' | 'beach' | 'shelf') => shoreRelief([square()], arm).height(5, 50);
  assert.equal(at('authored'), landHeight(5, 50), 'authored is already inland at 5 units');
  assert.ok(at('beach') < at('authored'), 'beach is still climbing at 5 units');
  assert.ok(at('shelf') < at('beach'), 'shelf is climbing more slowly still');
});

test('⚠ THE SHORE FALL CANNOT CROP A FRAME — it stays inside `landHeightRange`', () => {
  // `landHeightRange` is the number a camera frames by and the number the ground shadow's reach is
  // derived from (`land-shadow.ts`). Both would be wrong if the shore fall could push the land
  // outside it. It cannot, and the reason is structural rather than lucky: the fall only ever
  // moves the land TOWARD the waterline at `-SHORE_DIP`, and 0.62 is far inside the +/-4.224 the
  // sine sum already reaches. So no framing constant moves in this increment.
  assert.ok(SHORE_DIP < landHeightRange(), `the dip ${SHORE_DIP} escaped the bound`);
  const relief = shoreRelief([square()], 'shelf');
  const bound = landHeightRange();
  for (let d = 0; d <= 20; d += 0.25) {
    for (const z of [20, 50, 80]) {
      const h = relief.height(d, z);
      assert.ok(Math.abs(h) <= bound, `height ${h} at ${d},${z} escaped +/-${bound}`);
    }
  }
});

test('⚠⚠ THE SHIPPED ARM LEAVES EVERY PROP STANDING ON THE GROUND IT WAS PLACED ON', () => {
  // `dressMapFromKit` still reads the MAPPER's descriptors, so a tree stands where its parcel put
  // it and the beach grows underneath — the coast clip's own deliberate scoping, inherited here.
  // That only stays honest because the SHIPPED arm's band is exactly the width the coast outsets
  // by: a prop on the pre-coast boundary sits a full band inland of the new shore, where the
  // falloff is 1 and the ground has not moved at all. The `shelf` arm would undermine it, and
  // this is where that shows.
  const preCoastBoundary = SHORE_ARM_WIDTH.beach; // the coast outsets by exactly this
  const shipped = shoreRelief([square()], SHIPPED_SHORE);
  assert.equal(shipped.height(preCoastBoundary, 50), landHeight(preCoastBoundary, 50));
  const shelf = shoreRelief([square()], 'shelf');
  assert.notEqual(shelf.height(preCoastBoundary, 50), landHeight(preCoastBoundary, 50));
});
