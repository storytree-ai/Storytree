// prop-linear.test.ts — the boundary and ground-surface props, proved without a browser.
//
// WHAT THIS FILE IS FOR, because "a wall came out" would pass over almost every way these
// generators can be wrong. Three clusters carry the weight:
//
//   1. THE RUNG CLAIM IS MEASURED, NOT ASSERTED IN PROSE. `prop-linear.ts` says in as many words
//      that a battered wall lifts its lit face off the flat rung-0 plateau every vertical face
//      lands on. That is the single design decision the whole module rests on, so it is checked by
//      reading the GENERATED NORMALS through `rungOfNormal` — the shader's own decision function —
//      across sixteen orientations, WITH `batter: 0` as the control. Without the control the test
//      would pass against a generator that had accidentally stopped battering anything.
//   2. THE ARC-LENGTH WALK IS THE POINT OF THE POLYLINE API. A generator that placed one unit per
//      input point would look completely fine on the even 13.5-unit rim and fall apart on a
//      hand-authored path. So the spacing is measured on a deliberately UNEVEN polyline.
//   3. THE UINT16 FENCE. `finishRaw` does `Uint16Array.from(raw.idx)` with NO guard, so an index
//      past 65535 wraps silently and folds the mesh into itself — a defect that looks like art
//      rather than like a bug. Every generator is therefore driven with a pathological spacing and
//      the vertex count is asserted under the ceiling.
//
// And the standing floor everything in this package carries: determinism (ADR-0380 D6 fence 2), unit
// normals (the banded material's rungs are only honest if they are), and an authored palette
// (ADR-0406 D3/D4 — a prop token that delivered a status family's colour would be an ornament
// indistinguishable from a status read).

import assert from 'node:assert/strict';
import test from 'node:test';

import type { GeneratedMesh } from './mesh-kit.js';
import { PROP_TOKENS, familylessTokens, landTokens, rungOfNormal } from './palette-band.js';
import {
  WALL_COPING_COURSE,
  growFenceRun,
  growHedgeRun,
  growPathRun,
  growPavedArea,
  growSteps,
  growWallRun,
  growWaterChannel,
  type GPoint,
  type PropParts,
} from './prop-linear.js';

/** A polyline with a corner and deliberately uneven point spacing — the shape a hand-authored
 *  garden path has, and the one that separates an arc-length walk from a per-point one. */
const BENT: GPoint[] = [
  { x: -40, z: 0 },
  { x: -37, z: 0 },
  { x: 0, z: 0 },
  { x: 0, z: 40 },
];

/** A closed loop, first point repeated at the end — the documented way to close a run. */
const LOOP: GPoint[] = [
  { x: -30, z: -30 },
  { x: 30, z: -30 },
  { x: 30, z: 30 },
  { x: -30, z: 30 },
  { x: -30, z: -30 },
];

/** A convex ring for the area generators. `addPrism` fans its caps from the centroid, so anything
 *  concave is the caller's error and is documented as such rather than validated. */
const COURT: GPoint[] = [
  { x: -20, z: -14 },
  { x: 18, z: -20 },
  { x: 22, z: 16 },
  { x: -16, z: 20 },
];

/** Every generator behind one nullary call, so the whole-family assertions below cannot silently
 *  skip one. NAMED rather than derived from the module's exports: a rename that dropped one would
 *  otherwise make every sweep pass over a generator that no longer exists, which reads exactly like
 *  a pass. */
const EVERY: readonly (readonly [string, () => PropParts])[] = [
  ['wall', () => growWallRun(BENT, {})],
  ['wall/loop', () => growWallRun(LOOP, { height: 7, thickness: 4 })],
  ['fence', () => growFenceRun(BENT, {})],
  ['fence/loop', () => growFenceRun(LOOP, { rails: 3 })],
  ['hedge', () => growHedgeRun(BENT, {})],
  ['path', () => growPathRun(BENT, {})],
  ['path/wide', () => growPathRun(BENT, { width: 14, across: 4 })],
  ['paved', () => growPavedArea(COURT, {})],
  ['paved/kerb', () => growPavedArea(COURT, { kerb: true })],
  ['steps', () => growSteps({ x: 0, z: 0 }, { x: 0, z: 16 }, {})],
  ['water', () => growWaterChannel(BENT, {})],
];

function bounds(positions: Float32Array) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!);
    maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!);
    maxY = Math.max(maxY, positions[i + 1]!);
    minZ = Math.min(minZ, positions[i + 2]!);
    maxZ = Math.max(maxZ, positions[i + 2]!);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** The lowest y anything in a run reaches — the "standing on y = 0" contract, across every token. */
function floorOf(parts: PropParts): number {
  let lo = Infinity;
  for (const [, mesh] of parts) lo = Math.min(lo, bounds(mesh.positions).minY);
  return lo;
}

/** The highest y anything in a run reaches. */
function ceilingOf(parts: PropParts): number {
  let hi = -Infinity;
  for (const [, mesh] of parts) hi = Math.max(hi, bounds(mesh.positions).maxY);
  return hi;
}

/** The distinct rungs the SIDE faces of a part land on. Tops and bottoms are excluded by their own
 *  normals rather than by position, because the claim under test is about the faces a batter can
 *  move and a horizontal face is not one of them. */
function sideRungs(mesh: GeneratedMesh): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const n = { x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! };
    if (Math.abs(n.y) > 0.9) continue;
    seen.add(rungOfNormal(n));
  }
  return [...seen].sort();
}

test('every emitted token is AUTHORED, and every one is FAMILY-LESS', () => {
  // Two claims, and the second is the load-bearing one. ADR-0406 D3 makes a prop material legal by
  // AUTHORING ITS TOKEN, so an unauthored hex would deliver a colour `capture.mjs` must refuse.
  // ADR-0406 D4 goes further: a prop belongs to no status family, so a prop that reached for
  // `healthy` green would be an ornament indistinguishable from a status read — the one thing the
  // licence must not produce even on a surface that asserts nothing, because a human judges this
  // island and carries what he learns to the map.
  const authored = new Set(landTokens());
  const familyless = new Set(familylessTokens());
  for (const [name, grow] of EVERY) {
    for (const token of grow().keys()) {
      assert.ok(authored.has(token), `${name} emits ${token}, which is not in landTokens()`);
      assert.ok(familyless.has(token), `${name} emits ${token}, which belongs to a status family`);
    }
  }
});

test('every mesh is WELL-FORMED, and stays inside the uint16 index fence', () => {
  for (const [name, grow] of EVERY) {
    const parts = grow();
    assert.ok(parts.size > 0, `${name} produced nothing`);
    for (const [token, mesh] of parts) {
      const where = `${name}/${token}`;
      assert.equal(mesh.normals.length, mesh.positions.length, `${where}: normals per position`);
      assert.equal(mesh.indices.length % 3, 0, `${where}: indices are triangles`);
      assert.ok(mesh.indices.length > 0, `${where}: an empty part should not have been emitted`);
      const verts = mesh.positions.length / 3;
      assert.ok(verts < 65536, `${where}: ${verts} vertices — Uint16Array.from would wrap`);
      for (let i = 0; i < mesh.indices.length; i++) {
        assert.ok(mesh.indices[i]! < verts, `${where}: index ${mesh.indices[i]} past ${verts}`);
      }
      for (let i = 0; i < mesh.normals.length; i += 3) {
        const l = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
        assert.ok(Math.abs(l - 1) < 1e-5, `${where}: normal length ${l}`);
      }
      for (let i = 0; i < mesh.positions.length; i++) {
        assert.ok(Number.isFinite(mesh.positions[i]!), `${where}: a non-finite position`);
      }
    }
  }
});

test('DETERMINISM: the same arguments grow the same run, byte for byte', () => {
  // ADR-0380 D6 fence 2, restated by ADR-0406 D5: a prop's placement is a pure function of its
  // arguments, seeded, never a live random. A mesh whose shape changed between two calls would take
  // the scene graph's byte-reproducibility with it.
  for (const [name, grow] of EVERY) {
    const a = grow();
    const b = grow();
    assert.deepEqual([...a.keys()], [...b.keys()], `${name}: token set moved`);
    for (const [token, mesh] of a) {
      const twin = b.get(token)!;
      assert.deepEqual(Array.from(mesh.positions), Array.from(twin.positions), `${name} pos`);
      assert.deepEqual(Array.from(mesh.normals), Array.from(twin.normals), `${name} nrm`);
      assert.deepEqual(Array.from(mesh.indices), Array.from(twin.indices), `${name} idx`);
    }
  }
});

test('a different SEED is a different run — the jitter is real, not decorative', () => {
  // The non-vacuity half of determinism. Without it a generator that had quietly stopped consuming
  // its PRNG would sail through the test above.
  const one = growWallRun(BENT, { seed: 1 }).get(PROP_TOKENS.stone)!;
  const two = growWallRun(BENT, { seed: 9 }).get(PROP_TOKENS.stone)!;
  assert.equal(one.positions.length, two.positions.length, 'the same run, differently jittered');
  assert.notDeepEqual(Array.from(one.positions), Array.from(two.positions));
});

test('runs stand ON THE GROUND at y = 0, with the two documented exceptions', () => {
  // Everything is authored standing on y = 0 so the caller can translate it onto the terrain by one
  // `landHeight`. The two exceptions are contracts of their own and are asserted as such rather
  // than excused: a PAVED AREA is a platform whose top is `thickness` proud and whose skirt is
  // buried, and a WATER SURFACE floats partway up its kerbs.
  for (const [name, grow] of EVERY) {
    if (name.startsWith('paved') || name === 'water') continue;
    assert.ok(Math.abs(floorOf(grow())) < 1e-5, `${name} does not stand on y = 0`);
  }

  const paved = growPavedArea(COURT, { thickness: 0.9 });
  const slab = bounds(paved.get(PROP_TOKENS.gravel)!.positions);
  assert.ok(Math.abs(slab.maxY - 0.9) < 1e-5, 'the court stands `thickness` proud of flat ground');
  assert.ok(slab.minY < 0, 'and its skirt is buried, so relief can never leave it floating');

  const water = growWaterChannel(BENT, { kerbHeight: 1.4 });
  const surface = bounds(water.get(PROP_TOKENS.water)!.positions);
  assert.ok(
    surface.minY > 0.5 && surface.maxY < 1.4,
    `water sits inside its kerbs, not on the ground: [${surface.minY}, ${surface.maxY}]`,
  );
  // Kerbs, on the other hand, are ordinary ground-standing props.
  assert.ok(Math.abs(bounds(water.get(PROP_TOKENS.stoneLight)!.positions).minY) < 1e-5);
});

// ---------------------------------------------------------------------------
// The rung claim — the module's central design decision, made falsifiable
// ---------------------------------------------------------------------------

test('THE BATTER BUYS THE CONTRAST: a plain wall is one rung, a battered one is not', () => {
  // THE CONTROL FIRST, because it is what stops this test being a tautology. With `batter: 0` every
  // side face is vertical, and the light's horizontal component has magnitude 0.5707 — so the best
  // half-lambert any vertical face can reach is 0.7854, which quantises to 0.78: RUNG 0, at every
  // compass angle. A wall of plain boxes is therefore a flat silhouette with a lid, and no amount
  // of turning it changes that.
  const flat = growWallRun([{ x: 0, z: 0 }, { x: 0, z: 60 }], { batter: 0 });
  assert.deepEqual(
    sideRungs(flat.get(PROP_TOKENS.stone)!),
    [0],
    'an unbattered wall reaches exactly one rung on its sides — this is the thing the batter fixes',
  );

  // AND THE CLAIM. At the default 0.4 batter the same run's lit face lands on rung 2 (measured
  // dot 0.723) while its opposite stays on rung 0 (measured dot -0.113). Both must be present:
  // a wall that reached rung 2 everywhere would be as flat as one that reached rung 0 everywhere.
  const battered = sideRungs(growWallRun([{ x: 0, z: 0 }, { x: 0, z: 60 }], {}).get(PROP_TOKENS.stone)!);
  assert.ok(battered.includes(0), `a shaded face must stay on rung 0, got ${battered.join(',')}`);
  assert.ok(battered.includes(2), `a lit face must reach rung 2, got ${battered.join(',')}`);
});

test('the batter works at EVERY orientation, not just the lucky one', () => {
  // The arithmetic in the module header, checked rather than trusted. A box's four side directions
  // are two perpendicular pairs, so the best of them always projects at least 0.5707/sqrt(2) =
  // 0.4036 onto the light's horizontal component; with a 0.4 batter that lands on rung 1 in the
  // very worst case and rung 2 almost everywhere. The floor asserted here is the PROVABLE one
  // (>= 1); at these sixteen sampled headings every one in fact reaches 2, which is recorded in the
  // second assertion so that a regression to the theoretical floor still shows up as a change.
  let allReachTwo = true;
  for (let k = 0; k < 16; k++) {
    const theta = (k / 16) * Math.PI * 2;
    const run = growWallRun(
      [{ x: 0, z: 0 }, { x: Math.cos(theta) * 60, z: Math.sin(theta) * 60 }],
      {},
    );
    const rungs = sideRungs(run.get(PROP_TOKENS.stone)!);
    const best = Math.max(...rungs);
    assert.ok(best >= 1, `heading ${((theta * 180) / Math.PI).toFixed(0)}deg tops out at rung ${best}`);
    assert.ok(rungs.includes(0), `heading ${((theta * 180) / Math.PI).toFixed(0)}deg has no shaded face`);
    if (best < 2) allReachTwo = false;
  }
  assert.ok(allReachTwo, 'measured 2026-08-21: all sixteen sampled headings reach rung 2');
});

test('a FLIGHT OF STEPS gets its contrast from its form, with no batter needed', () => {
  // The one prop in the module that does not depend on the batter: a tread is horizontal (rung 2)
  // and a riser is near-vertical, so the flight alternates the two ends of the ladder by
  // construction. Asserted because the shallow 0.18 batter on steps looks like an oversight next to
  // the 0.4 everywhere else, and this is the reason it is not one.
  const flight = growSteps({ x: 0, z: 0 }, { x: 0, z: 16 }, { steps: 4, rise: 3 });
  const mesh = flight.get(PROP_TOKENS.stone)!;
  const tops = new Set<number>();
  for (let i = 0; i < mesh.normals.length; i += 3) {
    if (mesh.normals[i + 1]! > 0.9) tops.add(rungOfNormal({ x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! }));
  }
  assert.deepEqual([...tops], [2], 'a tread is a horizontal top face and lands on rung 2');
  assert.ok(sideRungs(mesh).includes(0), 'and a riser stays on rung 0 — the ladder`s other end');
});

test('a water surface is LIT, not a dark stripe', () => {
  // The only teal on the island is worth nothing if it delivers at x0.78. A level strip is a
  // horizontal face and lands on rung 2, which is what the `water` token was chosen against.
  const mesh = growWaterChannel(BENT, {}).get(PROP_TOKENS.water)!;
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const n = { x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! };
    assert.ok(n.y > 0, 'a water normal that pointed down would light the channel bed, not the water');
    assert.equal(rungOfNormal(n), 2, 'the surface lands on the horizontal rung');
  }
});

// ---------------------------------------------------------------------------
// The arc-length walk
// ---------------------------------------------------------------------------

test('ARC LENGTH decides spacing, not the input points', () => {
  // A 110-unit run whose four segments are 3, 40, 5 and 62 units long. A generator that placed one
  // post per input point would give five posts at gaps of 3, 40, 5 and 62; an arc-length walk gives
  // evenly spaced posts that ignore where the polyline happened to be sampled.
  const uneven: GPoint[] = [
    { x: 0, z: 0 },
    { x: 3, z: 0 },
    { x: 43, z: 0 },
    { x: 48, z: 0 },
    { x: 110, z: 0 },
  ];
  const posts = growFenceRun(uneven, { postSpacing: 11 }).get(PROP_TOKENS.wood)!;

  // ⚠ THE GROUPING IS A COUPLING TO `addBox`, so it is asserted before it is used: one box with
  // `skipBottom` is five quads of four unshared corners, pushed contiguously — 20 vertices. If that
  // layout ever changes, this arithmetic is wrong, and the equality below is what says so.
  assert.equal(posts.positions.length % 60, 0, 'the post part is a whole number of 20-vertex boxes');
  const centres: [number, number][] = [];
  for (let b = 0; b < posts.positions.length; b += 60) {
    let sx = 0;
    let sz = 0;
    for (let k = 0; k < 20; k++) {
      sx += posts.positions[b + k * 3]!;
      sz += posts.positions[b + k * 3 + 2]!;
    }
    centres.push([sx / 20, sz / 20]);
  }

  // 110 / 11 = 10 spans, so 11 posts including both ends.
  assert.equal(centres.length, 11, 'both ends carry a post');
  for (let i = 1; i < centres.length; i++) {
    const gap = Math.hypot(
      centres[i]![0] - centres[i - 1]![0],
      centres[i]![1] - centres[i - 1]![1],
    );
    assert.ok(
      Math.abs(gap - 11) < 0.05,
      `post ${i} is ${gap.toFixed(2)} from its neighbour, not the requested 11`,
    );
  }
});

test('the requested spacing is a TARGET that is rounded to fit the run exactly', () => {
  // 100 units at a target of 9 is 11.1 spans, so the walk uses 11 spans of 9.09 rather than eleven
  // 9-unit blocks and a 1-unit orphan at the end. A short remainder block is the tell of a
  // generator that stepped by a fixed distance instead of dividing the run.
  const posts = growFenceRun([{ x: 0, z: 0 }, { x: 100, z: 0 }], { postSpacing: 9 })
    .get(PROP_TOKENS.wood)!;
  assert.equal(posts.positions.length / 60, 12, '11 spans means 12 posts');
  const last = bounds(posts.positions);
  assert.ok(Math.abs(last.maxX - (100 + 0.7 + 0.3)) < 1.2, 'the final post lands ON the run`s end');
});

test('a CLOSED LOOP closes, and does not stand two posts in the same hole', () => {
  // The documented contract: a loop is an open polyline with its first point repeated. The only
  // place closure is detected at all is the post walk, which drops the duplicated final node.
  const perimeter = 240;
  const spacing = 12;
  const posts = growFenceRun(LOOP, { postSpacing: spacing }).get(PROP_TOKENS.wood)!;
  assert.equal(
    posts.positions.length / 60,
    perimeter / spacing,
    'a closed loop carries exactly one post per span — the closing duplicate is dropped',
  );
  // And the rails still close the loop: 20 spans on a closed run means 20 rails, not 19.
  const rails = growFenceRun(LOOP, { postSpacing: spacing, rails: 1 }).get(PROP_TOKENS.woodLight)!;
  assert.equal(rails.positions.length / 60, perimeter / spacing, 'the closing rail is drawn');
});

test('DEGENERATE input returns an empty map rather than throwing', () => {
  // A caller composing an island from live geometry will hand over a one-point ring sooner or
  // later, and an island that fails to render is worse than one missing a fence.
  const nothing: GPoint[] = [];
  const one: GPoint[] = [{ x: 5, z: 5 }];
  const same: GPoint[] = [{ x: 5, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 5 }];
  for (const points of [nothing, one, same]) {
    assert.equal(growWallRun(points, {}).size, 0);
    assert.equal(growFenceRun(points, {}).size, 0);
    assert.equal(growHedgeRun(points, {}).size, 0);
    assert.equal(growPathRun(points, {}).size, 0);
    assert.equal(growWaterChannel(points, {}).size, 0);
  }
  assert.equal(growPavedArea([{ x: 0, z: 0 }, { x: 4, z: 4 }], {}).size, 0, 'a ring needs three');
  assert.equal(growSteps({ x: 3, z: 3 }, { x: 3, z: 3 }, {}).size, 0, 'a flight with no run');
  // Non-finite input is dropped rather than propagated into NaN geometry, which renders as nothing
  // at all and reports no error anywhere.
  assert.equal(growWallRun([{ x: NaN, z: 0 }, { x: 10, z: 0 }], {}).size, 0);
});

test('a pathological spacing is CLAMPED, and the clamp is what keeps the index buffer honest', () => {
  // A 702-unit rim asked for half-unit units is ~1400 stations. `finishRaw` would take that to
  // `Uint16Array.from` with no guard, so the clamp is a correctness fence and not a performance
  // one — an index past 65535 wraps silently and folds the mesh into itself.
  const rim: GPoint[] = [];
  for (let i = 0; i <= 52; i++) {
    const a = (i / 52) * Math.PI * 2;
    rim.push({ x: Math.cos(a) * 111.7, z: Math.sin(a) * 111.7 });
  }
  const pathological: readonly (readonly [string, PropParts])[] = [
    ['wall', growWallRun(rim, { blockLength: 0.01 })],
    ['fence', growFenceRun(rim, { postSpacing: 0.01, rails: 99 })],
    ['hedge', growHedgeRun(rim, { lobeSpacing: 0.01 })],
    ['path', growPathRun(rim, { slabLength: 0.01, across: 99 })],
    ['water', growWaterChannel(rim, { width: 0.01 })],
    ['steps', growSteps({ x: 0, z: 0 }, { x: 0, z: 400 }, { steps: 9999 })],
    ['paved', growPavedArea(rim, { kerb: true })],
  ];
  for (const [name, parts] of pathological) {
    assert.ok(parts.size > 0, `${name} clamped itself out of existence`);
    for (const [token, mesh] of parts) {
      const verts = mesh.positions.length / 3;
      assert.ok(verts < 65536, `${name}/${token}: ${verts} vertices is past the uint16 ceiling`);
      for (let i = 0; i < mesh.indices.length; i++) {
        assert.ok(mesh.indices[i]! < verts, `${name}/${token}: a wrapped index`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Per-generator contracts
// ---------------------------------------------------------------------------

test('a wall of `height: h` is h tall plus its cap course', () => {
  // The size contract a caller sizes a wall against a plant with. The +-5% is the authored height
  // wobble — a dead-level coping reads as an extrusion — so the window is the wobble, not slack.
  for (const height of [4, 5, 8]) {
    const top = ceilingOf(growWallRun(BENT, { height }));
    const lo = height * 0.95 + WALL_COPING_COURSE;
    const hi = height * 1.05 + WALL_COPING_COURSE;
    assert.ok(top >= lo && top <= hi, `a ${height}-unit wall tops out at ${top.toFixed(2)}, want [${lo}, ${hi}]`);
  }
  // And `coping: false` really removes it, rather than painting it the body colour.
  const bare = growWallRun(BENT, { height: 5, coping: false });
  assert.equal(bare.size, 1, 'a coping-less wall emits one token');
  assert.ok(ceilingOf(bare) < 5 * 1.05 + 1e-6);
});

test('a wall emits EXACTLY the two tokens its options name', () => {
  // The recorded withdrawal in the module header: a third, darker footing course was considered and
  // dropped, because `bodyToken`/`copingToken` are the caller's whole palette control and a hidden
  // third token would put a stone footing under a wall asked for in wood.
  const timber = growWallRun(BENT, {
    bodyToken: PROP_TOKENS.wood,
    copingToken: PROP_TOKENS.woodLight,
  });
  assert.deepEqual(
    [...timber.keys()].sort(),
    [PROP_TOKENS.wood, PROP_TOKENS.woodLight].sort(),
    'a timber wall is timber all the way down',
  );
});

test('a fence`s rails never ride over its posts', () => {
  // The failure this replaced, and the reason `growFenceRun` computes its rail ceiling instead of
  // picking one: at the defaults the first version put the top rail`s crown at 5.30 against a 5.19
  // post, which erases the post — and a post you cannot see is a fence that reads as a floating
  // ladder. Checked across rail counts, because the ceiling is a function of them.
  for (const rails of [1, 2, 3, 4, 6]) {
    const fence = growFenceRun(BENT, { rails, height: 5 });
    const post = bounds(fence.get(PROP_TOKENS.wood)!.positions);
    const rail = bounds(fence.get(PROP_TOKENS.woodLight)!.positions);
    assert.ok(rail.maxY < post.maxY, `${rails} rails: rail tops at ${rail.maxY.toFixed(2)} vs post ${post.maxY.toFixed(2)}`);
    assert.ok(rail.minY > 0.5, `${rails} rails: the lowest rail is buried at ${rail.minY.toFixed(2)}`);
  }
  // `rails: 0` is a legal fence of bare posts, and emits no rail token at all.
  const posts = growFenceRun(BENT, { rails: 0 });
  assert.equal(posts.size, 1);
  assert.ok(posts.has(PROP_TOKENS.wood));
});

test('a hedge is one token, and its crest lands on a brighter rung than its flanks', () => {
  // ONE token: a lighter crest green would put a colour on the island that means nothing and would
  // say the highlight twice — the same argument `TREE_TOKENS` records for the story tree's crown.
  // The crest's job is done by its FORM: a lobe carries normals through the whole ladder, so the
  // top of the hedge reaches rungs the flat flanks cannot.
  const hedge = growHedgeRun(BENT, { height: 4, width: 5 });
  assert.equal(hedge.size, 1, 'a hedge wears one material');
  const mesh = hedge.get(PROP_TOKENS.hedge)!;
  const rungs = new Set<number>();
  for (let i = 0; i < mesh.normals.length; i += 3) {
    rungs.add(rungOfNormal({ x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! }));
  }
  assert.ok(rungs.has(0) && rungs.has(3), `a hedge should span the ladder, got ${[...rungs].sort().join(',')}`);
  // And it is the size it was asked for, within the crest jitter.
  const h = ceilingOf(hedge);
  assert.ok(h > 3.7 && h < 4.3, `a 4-unit hedge came out ${h.toFixed(2)} tall`);
});

test('a path lays `across` lanes with visible joints between its slabs', () => {
  // The joints are the thing that makes a path read as a path rather than as a stripe, and the
  // batter is what widens them past the resolving floor: the visible joint is
  // `gap + 2 * batter * thickness`, not `gap`.
  const across = 3;
  const path = growPathRun([{ x: 0, z: 0 }, { x: 60, z: 0 }], {
    width: 12,
    across,
    slabLength: 5,
    gap: 0.7,
  });
  const mesh = path.get(PROP_TOKENS.paving)!;
  const boxes = mesh.positions.length / 60;
  assert.ok(boxes > across * 10, `only ${boxes} slabs over a 60-unit path`);
  // The path is `width` wide at its base and no wider — a lane offset that had drifted would show
  // up here as a path spilling past the width the caller asked for.
  const b = bounds(mesh.positions);
  assert.ok(b.maxZ - b.minZ <= 12 + 1e-3, `the path is ${(b.maxZ - b.minZ).toFixed(2)} wide, not 12`);
  assert.ok(b.maxZ - b.minZ > 12 - 1.5, 'and it is not much narrower either — the gap eats a little');
});

test('a paved area`s kerb is a separate, darker token that sits a course higher', () => {
  const plain = growPavedArea(COURT, { thickness: 0.9 });
  assert.equal(plain.size, 1, 'no kerb unless one is asked for');

  const kerbed = growPavedArea(COURT, { thickness: 0.9, kerb: true });
  assert.equal(kerbed.size, 2);
  const court = bounds(kerbed.get(PROP_TOKENS.gravel)!.positions);
  const kerb = bounds(kerbed.get(PROP_TOKENS.stone)!.positions);
  assert.ok(Math.abs(kerb.minY - court.maxY) < 1e-5, 'the kerb starts where the paving stops');
  assert.ok(kerb.maxY > court.maxY + 1, 'and stands a course proud of it');
  // THE KERB TURNS INWARD, and this is checked on the stones themselves rather than on the part's
  // bounding box. Ground (x, y) maps to 3D (x, z) and flips handedness, so "the left-hand
  // perpendicular" is not reliably the inward one — an outward flip would put every kerb stone
  // OUTSIDE the court it is supposed to contain, and the picture would still look plausible. A
  // bounding-box test cannot see it: each stone is extended half a kerb width at both ends so
  // convex corners mitre closed, and that overshoot pokes past the ring's own extreme vertex either
  // way. So the test is per-stone: one 20-vertex box per ring edge, in ring order, and each box's
  // centre must sit CLOSER to the centroid than the edge midpoint it was built from.
  //
  // ⚠ AND IT IS CHECKED ON BOTH WINDINGS, which is what makes it non-vacuous. A generator that took
  // the raw left-hand perpendicular and never tested it would still turn inward for ONE winding —
  // so a single ring can pass a broken generator by luck. Reversing the ring is the input that
  // makes a fixed handedness choice go red.
  for (const ring of [COURT, [...COURT].reverse()]) {
    const stones = growPavedArea(ring, { thickness: 0.9, kerb: true }).get(PROP_TOKENS.stone)!;
    assert.equal(stones.positions.length / 60, ring.length, 'one kerb stone per ring edge');
    const cx = ring.reduce((a, p) => a + p.x, 0) / ring.length;
    const cz = ring.reduce((a, p) => a + p.z, 0) / ring.length;
    for (let e = 0; e < ring.length; e++) {
      const a = ring[e]!;
      const b = ring[(e + 1) % ring.length]!;
      let sx = 0;
      let sz = 0;
      for (let k = 0; k < 20; k++) {
        sx += stones.positions[e * 60 + k * 3]!;
        sz += stones.positions[e * 60 + k * 3 + 2]!;
      }
      const stone = Math.hypot(sx / 20 - cx, sz / 20 - cz);
      const edge = Math.hypot((a.x + b.x) / 2 - cx, (a.z + b.z) / 2 - cz);
      assert.ok(stone < edge, `kerb stone ${e} sits ${stone.toFixed(2)} out, past its edge at ${edge.toFixed(2)}`);
    }
  }
  // And the mitre overshoot is bounded: a stone may reach past the ring by the half kerb width it
  // was extended by, and no further.
  assert.ok(kerb.maxX < court.maxX + 1.7 && kerb.minX > court.minX - 1.7, 'the mitre stays local');
});

test('a flight of steps climbs `rise` in `steps`, standing on `baseY`', () => {
  for (const baseY of [0, 7.5]) {
    const flight = growSteps({ x: -8, z: 0 }, { x: 8, z: 0 }, { steps: 5, rise: 4, baseY, width: 9 });
    const b = bounds(flight.get(PROP_TOKENS.stone)!.positions);
    assert.ok(Math.abs(b.minY - baseY) < 1e-5, `the flight starts at ${b.minY}, not ${baseY}`);
    assert.ok(Math.abs(b.maxY - (baseY + 4)) < 1e-5, `the flight tops out at ${b.maxY}`);
  }
  // The tread TOPS are exactly `width` across, because each box is authored oversized in plan by
  // its own batter inset — the correction that stops a battered flight opening a notch at every
  // nosing. Read off the top faces only.
  const flight = growSteps({ x: 0, z: -8 }, { x: 0, z: 8 }, { steps: 4, rise: 3, width: 9 });
  const mesh = flight.get(PROP_TOKENS.stone)!;
  // Read off the TOP faces only, identified by their own upward normal rather than by position —
  // the flight runs along z here, so a tread's half-width is its |x|.
  let widest = 0;
  for (let i = 0; i < mesh.normals.length; i += 3) {
    if (mesh.normals[i + 1]! < 0.9) continue;
    widest = Math.max(widest, Math.abs(mesh.positions[i]!) * 2);
  }
  assert.ok(Math.abs(widest - 9) < 1e-3, `the tread tops measure ${widest.toFixed(3)}, not the authored 9`);
});

test('a water channel is stone AND water, and the water spans the gap between the kerbs', () => {
  const width = 6;
  const channel = growWaterChannel([{ x: 0, z: 0 }, { x: 50, z: 0 }], { width, kerbWidth: 1.6 });
  assert.equal(channel.size, 2, 'two kerbs and a surface, in two materials');
  const surface = bounds(channel.get(PROP_TOKENS.water)!.positions);
  const stone = bounds(channel.get(PROP_TOKENS.stoneLight)!.positions);
  assert.ok(Math.abs(surface.maxZ - surface.minZ - width) < 1e-4, 'the water is the channel`s width');
  assert.ok(stone.maxZ > surface.maxZ && stone.minZ < surface.minZ, 'and the kerbs contain it');
});

test('`heightAt` drapes a run over relief instead of bridging it', () => {
  // The alternative — one translation for the whole prop — puts a fence post half underground the
  // moment the land is not a plane, and a post half into the ground still reads as a post, which is
  // exactly why this is threaded through rather than left to be noticed.
  const slope = (x: number): number => x * 0.15;
  const draped = growFenceRun([{ x: 0, z: 0 }, { x: 100, z: 0 }], {
    postSpacing: 10,
    heightAt: (x) => slope(x),
  });
  const b = bounds(draped.get(PROP_TOKENS.wood)!.positions);
  assert.ok(Math.abs(b.minY) < 1e-5, 'the first post still stands on the ground at x = 0');
  assert.ok(b.maxY > slope(100), 'and the last one has climbed the slope with the land');
  // The default really is flat, so a caller who wants the one-translation form gets it.
  const flat = growFenceRun([{ x: 0, z: 0 }, { x: 100, z: 0 }], { postSpacing: 10 });
  assert.ok(bounds(flat.get(PROP_TOKENS.wood)!.positions).maxY < 6);
});
