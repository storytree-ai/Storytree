// mesh-kit.test.ts — the FLAT-FACED primitives (ADR-0406), and the one bug they shipped with.
//
// WHY THIS FILE EXISTS WHEN THE REST OF THE KIT HAS NO TEST OF ITS OWN. `mesh-kit.ts`'s header
// says its consumers' determinism tests are the regression check, and for the organic emitters
// that is right: a lobe or a swept tube is proved by the plant and tree it grows. The flat-faced
// half is different, because its whole reason for existing is WHICH RUNG each face lands on, and
// that is a property of the primitive rather than of anything built from it.
//
// It is also where a real bug hid. `addGableRoof` emitted the slope normal as `(-hx, rise, 0)`
// where the perpendicular of a slope running eave `(-hx, 0)` to ridge `(0, rise)` is
// `(-rise, hx, 0)` — the components swapped. That shades a roof as its own COMPLEMENT: exact at a
// 45-degree pitch, and worse the flatter the roof, so a shallow roof shaded as a near-vertical
// wall. It survived review because it looks right; it was caught by putting the emitted normals
// through `rungOfNormal`. Since a pitched roof is the only surface on this island that can reach
// the ladder's top rung, the bug quietly gave away the strongest lever in the vocabulary.
//
// So the assertions below are about DELIVERED SHADING, not about vertex counts. Nothing here
// judges whether a shape looks good — that is the owner's, once, on a whole island (ADR-0392 D1).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addBox,
  addGableRoof,
  addPrism,
  addQuad,
  addTri,
  emptyRaw,
  finishRaw,
  ringProfile,
  yawBasis,
  type Raw,
} from './mesh-kit.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, rungOfNormal } from './palette-band.js';

/** Every distinct normal a raw soup carries, deduped to 4 decimal places. */
function normals(raw: Raw): { x: number; y: number; z: number }[] {
  const seen = new Map<string, { x: number; y: number; z: number }>();
  for (let i = 0; i < raw.nrm.length; i += 3) {
    const n = { x: raw.nrm[i]!, y: raw.nrm[i + 1]!, z: raw.nrm[i + 2]! };
    seen.set(`${n.x.toFixed(4)},${n.y.toFixed(4)},${n.z.toFixed(4)}`, n);
  }
  return [...seen.values()];
}

function rungs(raw: Raw): Set<number> {
  return new Set(normals(raw).map(rungOfNormal));
}

function dot(n: { x: number; y: number; z: number }): number {
  return n.x * LIGHT_DIRECTION.x + n.y * LIGHT_DIRECTION.y + n.z * LIGHT_DIRECTION.z;
}

test('the ladder facts every built prop is designed against', () => {
  // Restated as assertions rather than as a comment, because every batter and every pitch in
  // `prop-linear.ts`, `prop-structures.ts` and `island-dressing.ts` is chosen against these four
  // numbers. If the light or the ladder ever moves, this is what says so first.
  assert.deepEqual([...SHADE_LEVELS], [0.78, 0.8, 0.9, 1.0]);
  assert.equal(rungOfNormal({ x: 0, y: 1, z: 0 }), 2, 'a horizontal top lands on rung 2, not 3');
  for (const [x, z] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-0.7071, 0.7071],
    [0.7071, -0.7071],
  ] as const) {
    assert.equal(
      rungOfNormal({ x, y: 0, z }),
      0,
      `a VERTICAL face at (${x}, ${z}) must land on rung 0 — this is why built props are battered`,
    );
  }
});

test('addBox: an UNBATTERED box delivers exactly two rungs, whichever way it is turned', () => {
  // The finding that decides `BoxOptions.batter`. If this ever stops being true, the batter is
  // no longer buying anything and every constant chosen against it needs revisiting.
  for (const yaw of [0, 0.4, 1.1, 2.7, 4.9]) {
    const raw = emptyRaw();
    addBox(raw, [0, 0, 0], { x: 3, z: 3 }, 5, { yaw });
    assert.deepEqual(
      [...rungs(raw)].sort(),
      [0, 2],
      `an unbattered box at yaw ${yaw} should deliver only the vertical rung and the top rung`,
    );
  }
});

test('addBox: the batter genuinely buys contrast, and 0.4 is where it reaches rung 2', () => {
  const at = (batter: number): Set<number> => {
    const raw = emptyRaw();
    addBox(raw, [0, 0, 0], { x: 3, z: 3 }, 5, { batter });
    return rungs(raw);
  };
  // Measured landings, pinned so a change to the light or the ladder surfaces here rather than in
  // a picture: slope 0.2 -> dot 0.603 -> rung 1; slope 0.4 -> dot 0.723 -> rung 2.
  assert.ok(at(0.2).has(1), 'batter 0.2 should lift the lit side to rung 1');
  assert.ok(at(0.4).has(2), 'batter 0.4 should lift the lit side to rung 2');
  for (const b of [0.2, 0.4, 0.45]) {
    assert.ok(at(b).has(0), `batter ${b} must still leave a side on rung 0 — contrast needs both`);
  }
});

test('addBox: normals follow the batter, so a leaning face is not lit as a wall', () => {
  const raw = emptyRaw();
  addBox(raw, [0, 0, 0], { x: 3, z: 3 }, 5, { batter: 0.4 });
  for (const n of normals(raw)) {
    assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-6, 'every normal must be unit length');
  }
  // A battered SIDE has a positive y component equal to its slope — that is the whole correction.
  const sides = normals(raw).filter((n) => Math.abs(n.y) < 0.99 && n.y > 0);
  assert.equal(sides.length, 4, 'four battered sides, each carrying an upward term');
  for (const n of sides) {
    const horizontal = Math.hypot(n.x, n.z);
    assert.ok(
      Math.abs(n.y / horizontal - 0.4) < 1e-6,
      'the side normal must carry the batter slope, or the face leans while the shading does not',
    );
  }
});

test('addGableRoof: the ridge-along-z slope reaches RUNG 3 — the regression this file exists for', () => {
  // ⚠ THE BUG. Before the fix this delivered rung 2 at every pitch in the usable band, because the
  // normal's components were swapped. Asserting the RUNG rather than the vector is deliberate: a
  // vector assertion would have to restate the arithmetic and could be "corrected" to agree with
  // whatever the code emitted, which is exactly how a metric stops being evidence.
  for (const pitchDeg of [20, 25, 30, 35, 40]) {
    const half = { x: 10, z: 8 };
    const rise = half.x * Math.tan((pitchDeg * Math.PI) / 180);
    const raw = emptyRaw();
    addGableRoof(raw, [0, 0, 0], half, rise);
    const got = rungs(raw);
    assert.ok(
      got.has(3),
      `a ${pitchDeg}-degree roof ridged along z must reach rung 3 — it is the only surface on ` +
        'this island that can, and a swapped normal silently costs it',
    );
    assert.ok(got.has(0), `a ${pitchDeg}-degree roof must also carry rung 0 on its far slope`);
  }
});

test('addGableRoof: ridged along X the SAME pitch tops out at rung 2, which is why z is the default', () => {
  const half = { x: 10, z: 8 };
  const rise = half.z * Math.tan((30 * Math.PI) / 180);
  const raw = emptyRaw();
  addGableRoof(raw, [0, 0, 0], half, rise, { ridgeAlongX: true });
  const got = rungs(raw);
  assert.ok(!got.has(3), 'ridge along x cannot reach rung 3 at 30 degrees');
  assert.ok(got.has(2) && got.has(0), 'it should still deliver a lit slope and a dark one');
});

test('addGableRoof: the slope normal is the PERPENDICULAR of the slope, at every pitch', () => {
  // The property the rung assertions above are a consequence of, stated once directly so a future
  // reader can see WHY the components are what they are rather than inferring it from a rung.
  for (const pitchDeg of [8, 20, 34.8, 45, 62]) {
    const half = { x: 10, z: 8 };
    const rise = half.x * Math.tan((pitchDeg * Math.PI) / 180);
    const raw = emptyRaw();
    addGableRoof(raw, [0, 0, 0], half, rise);
    // There are TWO slopes and they run opposite ways — `(half.x, rise)` and `(-half.x, rise)` —
    // so each normal must be orthogonal to ITS OWN slope, not to a single remembered direction.
    // Getting that wrong here is the same class of mistake as the bug being guarded against, and
    // it failed once on the first run of this very test.
    for (const n of normals(raw).filter((v) => Math.abs(v.z) < 0.5 && v.y > 0.01)) {
      const alongMinus = Math.abs(n.x * half.x + n.y * rise);
      const alongPlus = Math.abs(-n.x * half.x + n.y * rise);
      assert.ok(
        Math.min(alongMinus, alongPlus) < 1e-5,
        `at ${pitchDeg} degrees the slope normal is not perpendicular to either slope — this is ` +
          'the swapped-component bug returning',
      );
    }
  }
});

test('addPrism: side normals point AWAY from the ring, whichever way it is wound', () => {
  // The correction inherited from `land-definition.ts`: ground (x, y) maps to 3D (x, z) and flips
  // handedness, so the left-hand perpendicular is not reliably the outward one. A ring wound the
  // other way must still light from outside.
  const forward = ringProfile(0, 0, 10, 9);
  const backward = [...forward].reverse();
  for (const [name, profile] of [
    ['forward', forward],
    ['reversed', backward],
  ] as const) {
    const raw = emptyRaw();
    addPrism(raw, profile, 0, 4);
    // Every side normal, paired back to the face it belongs to by position.
    for (let i = 0; i < raw.pos.length; i += 3) {
      const ny = raw.nrm[i + 1]!;
      if (Math.abs(ny) > 0.01) continue; // a cap, not a side
      const px = raw.pos[i]!;
      const pz = raw.pos[i + 2]!;
      const nx = raw.nrm[i]!;
      const nz = raw.nrm[i + 2]!;
      assert.ok(
        px * nx + pz * nz > 0,
        `${name}: a side normal points back into the ring — the whole prism would light inside out`,
      );
    }
  }
});

test('addPrism: refuses a degenerate ring rather than emitting a fan of nothing', () => {
  const raw = emptyRaw();
  addPrism(raw, [{ x: 0, z: 0 }, { x: 1, z: 0 }], 0, 3);
  assert.equal(raw.idx.length, 0, 'two points is not a ring');
});

test('the flat emitters produce a well-formed, finite, unit-normalled mesh', () => {
  const raw = emptyRaw();
  addBox(raw, [0, 0, 0], { x: 2, z: 2 }, 4, { batter: 0.3, yaw: 0.6 });
  addPrism(raw, ringProfile(20, 0, 6, 7), 0, 3);
  addGableRoof(raw, [0, 6, 0], { x: 5, z: 4 }, 3, { overhang: 1, yaw: 0.2 });
  addQuad(raw, [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0]);
  addTri(raw, [0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
  const mesh = finishRaw(raw);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.indices.length % 3, 0);
  assert.ok(mesh.positions.length / 3 < 65536, 'the index buffer is Uint16 and has no guard');
  for (const v of [...mesh.positions, ...mesh.normals]) assert.ok(Number.isFinite(v));
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const l = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
    assert.ok(Math.abs(l - 1) < 1e-5, 'a non-unit normal shades wrong and the shading would be a lie');
  }
  for (const idx of mesh.indices) assert.ok(idx < mesh.positions.length / 3);
});

test('yawBasis is orthonormal, so a normal takes the same transform as a position', () => {
  // The property that lets `addBox` rotate its normals with the same 3x3 as its corners and skip
  // an inverse-transpose. If it ever stopped holding, every yawed prop would light wrong in a way
  // that reads as an art choice.
  for (const a of [0, 0.3, 1.4, 3.9]) {
    const [u, v, w] = yawBasis(a);
    for (const axis of [u, v, w]) {
      assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-12);
    }
    const d = (p: readonly number[], q: readonly number[]): number =>
      p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
    assert.ok(Math.abs(d(u, v)) < 1e-12);
    assert.ok(Math.abs(d(v, w)) < 1e-12);
    assert.ok(Math.abs(d(u, w)) < 1e-12);
  }
});

test('a box is anchored at its BASE, not its centre', () => {
  // The contract every prop generator and every dressing relies on: the caller already holds the
  // ground height where the prop stands, so that number is where its FOOT goes. A centre anchor
  // would have every call site adding half a height, and a forgotten one buries the prop.
  const raw = emptyRaw();
  addBox(raw, [0, 17, 0], { x: 2, z: 2 }, 6);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < raw.pos.length; i += 3) {
    minY = Math.min(minY, raw.pos[i]!);
    maxY = Math.max(maxY, raw.pos[i]!);
  }
  assert.equal(minY, 17);
  assert.equal(maxY, 23);
});

test('the roof pitch band that reaches rung 3 is BOUNDED at both ends', () => {
  // Worth pinning because it is counter-intuitive: a steeper roof is not a brighter one. The
  // light sits 28.75 degrees off vertical, so the rung-3 window is centred there and closes again
  // once the pitch overshoots it. A generator that "made the roof steeper to make it pop" would
  // lose the rung it was reaching for.
  const reaches = (pitchDeg: number): boolean => {
    const rise = 10 * Math.tan((pitchDeg * Math.PI) / 180);
    const raw = emptyRaw();
    addGableRoof(raw, [0, 0, 0], { x: 10, z: 8 }, rise);
    return rungs(raw).has(3);
  };
  assert.ok(!reaches(5), 'a nearly flat roof does not reach rung 3');
  assert.ok(reaches(29), 'the middle of the band does');
  assert.ok(!reaches(60), 'and a very steep roof loses it again');

  // ⚠ AND THE BEST IT CAN EVER DO IS 0.9366, NOT 1.0 — which is worth pinning because the obvious
  // expectation is wrong. A ridge-along-z roof's slope normal lies in the x-y plane by
  // construction, so it can never capture the light's z component at all; the ceiling is
  // `hypot(L.x, L.y) = 0.9366`, reached at a pitch of `atan(L.x / L.y) = 28.75` degrees. That is
  // still comfortably inside rung 3, so nothing is lost — but a generator chasing the last 6% by
  // steepening the roof would move AWAY from the band, and one chasing it by yawing the ridge
  // toward the light would be trading the reliable rung-3 slope for a pair of half-lit ones.
  const rise = 10 * Math.tan((28.75 * Math.PI) / 180);
  const raw = emptyRaw();
  addGableRoof(raw, [0, 0, 0], { x: 10, z: 8 }, rise);
  const best = Math.max(...normals(raw).map(dot));
  const ceiling = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y);
  assert.ok(
    Math.abs(best - ceiling) < 1e-4,
    `the optimal pitch should reach the x-y plane's ceiling ${ceiling.toFixed(4)}, got ${best.toFixed(4)}`,
  );
  assert.ok(ceiling < 1, 'a roof ridged along z cannot reach the light exactly, by construction');
});
