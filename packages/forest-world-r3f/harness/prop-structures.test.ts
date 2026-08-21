// prop-structures.test.ts — the point props and the built structures, proved without a browser.
//
// WHAT THIS FILE IS ACTUALLY GUARDING, because "a prop came out" is not worth a test. Three
// classes of failure, each of which has already been paid for somewhere on this arc:
//
//   1. A BUFFER THAT LOOKS FINE AND IS NOT. `finishRaw` does `Uint16Array.from(raw.idx)` with no
//      guard, and a non-unit normal on a BANDED material does not shade slightly wrong — it moves
//      a visible rung BOUNDARY, which reads as art rather than as a bug. So normals, index range,
//      array agreement and NaN are asserted on every generator rather than spot-checked.
//   2. A PROP THAT SHADES AS SOMETHING ELSE. The whole point of the rung table in
//      `prop-structures.ts` is that a pitched roof with its ridge along z is the ONLY rung-3
//      surface the island can deliver. `mesh-kit.ts`'s own `addGableRoof` gives that away by
//      swapping the slope normal's components, so the roof test below is not a formality: it is
//      the check that this file did not inherit that.
//   3. A PROP THAT DOES NOT COMPOSE. Every caller places a prop by translating it to a ground
//      point, so "base on y = 0, plan-centred on the origin" is the placement contract. A prop
//      that floats or sinks still looks like a prop, which is exactly why it needs an assertion
//      rather than a look.
//
// Determinism is asserted BYTE-IDENTICALLY (hex of the actual buffers) rather than with a
// deep-equal on floats, because the property claimed is byte reproducibility of the scene graph
// (ADR-0380 D6 fence 2), not approximate agreement.

import assert from 'node:assert/strict';
import test from 'node:test';

import type { GeneratedMesh } from './mesh-kit.js';
import { PROP_TOKENS, SHARED_TOKENS, landTokens, rungOfNormal } from './palette-band.js';
import {
  growArch,
  growBoat,
  growCottage,
  growCrates,
  growLantern,
  growPavilion,
  growPlatform,
  growPot,
  growRock,
  growWell,
  type PropParts,
} from './prop-structures.js';

/** Every generator, at its defaults and at one non-default configuration each. The sweeps below
 *  run over this table, so a generator added without a row here is a generator with no coverage —
 *  named explicitly rather than discovered by reflection, for the same reason `scope-fence.test.ts`
 *  names its module list. */
const CASES: readonly { name: string; make: () => PropParts }[] = [
  { name: 'growRock()', make: () => growRock({}) },
  { name: 'growRock(seeded, 5 lobes)', make: () => growRock({ seed: 7, radius: 9, height: 6, lobes: 5 }) },
  { name: 'growPot()', make: () => growPot({}) },
  { name: 'growPot(sapling)', make: () => growPot({ contents: 'sapling', seed: 3 }) },
  { name: 'growPot(marigold)', make: () => growPot({ contents: 'marigold', seed: 5 }) },
  { name: 'growWell()', make: () => growWell({}) },
  { name: 'growWell(no roof, shallow pool)', make: () => growWell({ radius: 11, wallHeight: 3, roof: false }) },
  { name: 'growCottage()', make: () => growCottage({}) },
  { name: 'growCottage(porch, yawed)', make: () => growCottage({ seed: 4, porch: true, yaw: 0.6 }) },
  { name: 'growLantern()', make: () => growLantern({}) },
  { name: 'growArch()', make: () => growArch({}) },
  { name: 'growArch(yawed)', make: () => growArch({ yaw: 0.5 }) },
  { name: 'growPavilion()', make: () => growPavilion({}) },
  { name: 'growPavilion(no plinth, square)', make: () => growPavilion({ width: 20, depth: 20, plinth: false }) },
  { name: 'growPlatform()', make: () => growPlatform({}) },
  { name: 'growPlatform(4 courses)', make: () => growPlatform({ courses: 4, height: 5 }) },
  { name: 'growCrates()', make: () => growCrates({}) },
  { name: 'growCrates(6)', make: () => growCrates({ seed: 9, count: 6, size: 2.6 }) },
  { name: 'growBoat()', make: () => growBoat({}) },
  { name: 'growBoat(yawed)', make: () => growBoat({ yaw: 0.9, length: 18, beam: 6 }) },
];

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function hex(a: Float32Array | Uint16Array): string {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('hex');
}

/** The exact bytes a prop delivers, tokens in a stable order. Two calls agreeing on THIS string
 *  agree on every byte that reaches a GPU buffer. */
function fingerprint(parts: PropParts): string {
  return [...parts.keys()]
    .sort()
    .map((token) => {
      const m = parts.get(token)!;
      return `${token}\t${hex(m.positions)}\t${hex(m.normals)}\t${hex(m.indices)}`;
    })
    .join('\n');
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function boxOf(meshes: readonly GeneratedMesh[]): Box {
  const b: Box = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!;
      const y = m.positions[i + 1]!;
      const z = m.positions[i + 2]!;
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y;
      if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z;
      if (z > b.maxZ) b.maxZ = z;
    }
  }
  return b;
}

function boxOfParts(parts: PropParts): Box {
  return boxOf([...parts.values()]);
}

function partBox(parts: PropParts, token: string): Box {
  const m = parts.get(token);
  assert.ok(m, `no part wears ${token}`);
  return boxOf([m]);
}

/** Every ladder rung the part's own normals land on, under the authored light. `rungOfNormal`
 *  IS the shader's decision, so this is what the GPU will do rather than an approximation of it. */
function rungsOf(mesh: GeneratedMesh): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < mesh.normals.length; i += 3) {
    out.add(rungOfNormal({ x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// the sweeps
// ---------------------------------------------------------------------------------------------

test('DETERMINISM: identical arguments deliver byte-identical buffers', () => {
  // ADR-0380 D6 fence 2 — determinism MOVES rather than disappearing. A prop whose shape changed
  // between two calls would take the scene graph's byte reproducibility with it, and every proof
  // that attaches to the graph with it. `Math.random` is unreachable from this module by
  // construction (the pure half holds no clock and no random — `scope-fence.test.ts`), so what
  // this actually guards is the SEEDED path: a draw order that depends on iteration order, or an
  // rng consumed conditionally.
  for (const { name, make } of CASES) {
    assert.equal(fingerprint(make()), fingerprint(make()), `${name} is not deterministic`);
  }
});

test('DETERMINISM: a different seed really does move the geometry', () => {
  // The non-vacuity half. Without it, a generator that ignored its seed would pass the test above
  // perfectly — which is the failure mode a determinism check is most likely to hide.
  assert.notEqual(
    fingerprint(growRock({ seed: 1 })),
    fingerprint(growRock({ seed: 2 })),
    'growRock ignores its seed',
  );
  assert.notEqual(
    fingerprint(growCrates({ seed: 1 })),
    fingerprint(growCrates({ seed: 2 })),
    'growCrates ignores its seed',
  );
  assert.notEqual(
    fingerprint(growCottage({ seed: 1 })),
    fingerprint(growCottage({ seed: 2 })),
    'growCottage ignores its seed',
  );
});

test('every colour a prop can emit is an AUTHORED palette token', () => {
  // The locked-palette fence (ADR-0380 D6 fence 3, read by ADR-0406 D3): the delivered palette is
  // the closure of (authored token x authored level), which is what lets `capture.mjs` REFUSE
  // rather than merely report. A prop wearing a hex literal nobody authored would put a colour on
  // the island that the checker has to be told to ignore, and a palette with an exception is a
  // palette that has stopped being closed.
  const authored = new Set(landTokens());
  for (const { name, make } of CASES) {
    for (const token of make().keys()) {
      assert.ok(authored.has(token), `${name} emits ${token}, which is not in landTokens()`);
    }
  }
});

test('every buffer is well-formed: unit normals, in-range indices, no NaN, under the uint16 wall', () => {
  for (const { name, make } of CASES) {
    for (const [token, m] of make()) {
      const where = `${name} / ${token}`;
      const verts = m.positions.length / 3;

      assert.equal(m.normals.length, m.positions.length, `${where}: normals and positions disagree`);
      assert.equal(m.positions.length % 3, 0, `${where}: positions are not xyz triples`);
      assert.equal(m.indices.length % 3, 0, `${where}: indices are not triangles`);
      assert.equal(m.triangles, m.indices.length / 3, `${where}: the triangle count is wrong`);
      assert.ok(m.indices.length > 0, `${where}: an empty part reached the output`);

      // `finishRaw` does `Uint16Array.from(raw.idx)` with NO guard, so a part over 65535 vertices
      // does not fail — it wraps, and the mesh comes out as a shredded tangle that still draws.
      assert.ok(verts < 65536, `${where}: ${verts} vertices overflows the uint16 index buffer`);

      for (let i = 0; i < m.positions.length; i++) {
        assert.ok(Number.isFinite(m.positions[i]!), `${where}: NaN/Inf in positions[${i}]`);
        assert.ok(Number.isFinite(m.normals[i]!), `${where}: NaN/Inf in normals[${i}]`);
      }
      for (let i = 0; i < m.normals.length; i += 3) {
        const len = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
        assert.ok(
          Math.abs(len - 1) < 1e-5,
          `${where}: normal ${i / 3} has length ${len} — a non-unit normal moves a rung boundary`,
        );
      }
      for (let i = 0; i < m.indices.length; i++) {
        const v = m.indices[i]!;
        assert.ok(v < verts, `${where}: index ${i} is ${v}, past ${verts} vertices`);
      }
      for (const v of [m.bounds.w, m.bounds.h, m.bounds.d]) {
        assert.ok(Number.isFinite(v) && v >= 0, `${where}: bad bounds ${JSON.stringify(m.bounds)}`);
      }
    }
  }
});

test('THE PLACEMENT CONTRACT: base on y = 0, plan-centred on the origin', () => {
  // The caller translates each prop by `[gx, landHeight(gx, gz), gz]`, so a prop that is not
  // authored standing on zero at its own plan centre lands somewhere else — and a prop half a
  // unit into the ground still reads as a prop, which is precisely why this is an assertion and
  // not a look.
  for (const { name, make } of CASES) {
    const parts = make();
    const b = boxOfParts(parts);
    const tol = Math.max(0.02, (b.maxX - b.minX) * 1e-4);
    assert.ok(Math.abs(b.minY) < 0.02, `${name}: its base sits at y = ${b.minY}, not 0`);
    assert.ok(b.maxY > 0, `${name}: nothing rises above the ground`);
    assert.ok(
      Math.abs((b.minX + b.maxX) / 2) < tol,
      `${name}: plan centre x is ${((b.minX + b.maxX) / 2).toFixed(4)}, not 0`,
    );
    assert.ok(
      Math.abs((b.minZ + b.maxZ) / 2) < tol,
      `${name}: plan centre z is ${((b.minZ + b.maxZ) / 2).toFixed(4)}, not 0`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// the rung arithmetic — the property the whole vocabulary is shaped around
// ---------------------------------------------------------------------------------------------

test('A ROOF REACHES RUNG 3 AND RUNG 0 — the island’s only full-strength surface', () => {
  // The measured claim, restated as an assertion: a pitched roof with its ridge running along z
  // is the ONLY large surface on this island that reaches rung 3 (x1.00), and its own twin slope
  // sits on rung 0 (x0.78). That is the brightest and the darkest entry the ladder holds, on one
  // object, which is why every reference image reads from its roofs first.
  //
  // ⚠ IF THIS EVER GOES RED, THE FIX IS THE PITCH OR THE NORMAL — NEVER THIS ASSERTION. It failed
  // once already, for a reason worth recording: `mesh-kit.ts`'s `addGableRoof` emits the slope
  // normal as `norm(-hx, rise, 0)` where the true one is `norm(-rise, hx, 0)`, so a roof shades as
  // its own COMPLEMENT. At the cottage's default 34.8-degree pitch the kit's normal is
  // (-0.8209, 0.5711, 0) — dot 0.8388, rung 2 — against the true (-0.5711, 0.8209, 0) — dot
  // 0.9313, rung 3. `prop-structures.ts` therefore carries its own `addPitchedRoof`, and this test
  // is what stops that quietly reverting. No default pitch had to change: the rung-3 window is a
  // geometric pitch of roughly 12.7 to 44.8 degrees, and the cottage (34.8), the pavilion (32.8)
  // and the well (about 30) all sit inside it as authored.
  const roofed: readonly { name: string; parts: PropParts; token: string }[] = [
    { name: 'growCottage', parts: growCottage({}), token: PROP_TOKENS.roofTile },
    { name: 'growPavilion', parts: growPavilion({}), token: PROP_TOKENS.roofTile },
    { name: 'growWell', parts: growWell({}), token: PROP_TOKENS.roofTile },
  ];
  for (const { name, parts, token } of roofed) {
    const mesh = parts.get(token);
    assert.ok(mesh, `${name} grew no roof`);
    const rungs = rungsOf(mesh);
    assert.ok(rungs.has(3), `${name}'s roof reaches only rungs [${[...rungs].sort().join(', ')}] — no rung 3`);
    assert.ok(rungs.has(0), `${name}'s roof has no rung-0 twin, so it carries no contrast`);
  }
});

test('a battered wall lifts off rung 0 — the second-strongest lever, and it is being used', () => {
  // Every vertical face lands on rung 0 at every compass bearing (the best a horizontal normal can
  // reach is dot 0.5708, short of rung 1), so an un-battered cottage delivers exactly two colours.
  // The wall's 0.2 batter is what buys rung 1 on the lit side. This asserts the lever fired.
  const wall = growCottage({}).get(PROP_TOKENS.stoneLight);
  assert.ok(wall, 'the cottage grew no walls');
  const rungs = rungsOf(wall);
  assert.ok(rungs.has(1), `the battered wall lands on [${[...rungs].sort().join(', ')}] — no rung 1`);
  assert.ok(rungs.has(0), 'the shaded wall should still be rung 0 — otherwise there is no relief');
});

test('the lantern’s cap and the porch roof are the other two full-strength surfaces', () => {
  // Both are recorded appearance calls in the module, so both get an assertion rather than a
  // comment: the lantern's six-sided cone reaches rung 3 on its light-facing facet (which is what
  // makes a two-metre object read across an island), and the porch's mono-pitch reaches it from a
  // much shallower slope because it faces -x.
  const cap = growLantern({}).get(PROP_TOKENS.stone);
  assert.ok(cap, 'the lantern grew no stone');
  assert.ok(rungsOf(cap).has(3), 'the lantern’s cap never reaches rung 3');

  const porchRoof = growCottage({ porch: true }).get(PROP_TOKENS.roofTile);
  assert.ok(porchRoof, 'the porched cottage grew no roof');
  const rungs = rungsOf(porchRoof);
  assert.ok(rungs.has(3) && rungs.has(0), 'the porched cottage’s roof lost its full-strength face');
});

// ---------------------------------------------------------------------------------------------
// requested dimensions
// ---------------------------------------------------------------------------------------------

test('a cottage is the size it was asked for', () => {
  // Asserted on the WALL part rather than on the whole prop, deliberately: the roof's overhang,
  // the footing course and the porch all legitimately reach past the requested footprint, so a
  // whole-prop assertion would either be wrong or would have to encode every one of those
  // margins. The wall box IS the requested `width x depth`, exactly, at its base.
  const parts = growCottage({ width: 20, depth: 15, wallHeight: 9, rise: 8 });
  const wall = partBox(parts, PROP_TOKENS.stoneLight);
  assert.ok(Math.abs(wall.maxX - wall.minX - 20) < 0.05, `wall x extent ${wall.maxX - wall.minX}`);
  assert.ok(Math.abs(wall.maxZ - wall.minZ - 15) < 0.05, `wall z extent ${wall.maxZ - wall.minZ}`);
  assert.ok(Math.abs(wall.maxY - 9) < 0.05, `the eaves are at ${wall.maxY}, not the requested 9`);

  // And the whole silhouette: ridge at 17, chimney above it, nothing runaway. The band rather
  // than an equality because the chimney's height above the ridge is an authored constant that a
  // later art pass may legitimately move.
  const all = boxOfParts(parts);
  assert.ok(all.maxY > 17 && all.maxY < 23, `the cottage tops out at ${all.maxY}`);
  // Above ~15 units a prop reads as ARCHITECTURE rather than as an object, which is the point of
  // a cottage and the thing that separates it from everything else in this file.
  assert.ok(all.maxY > 15, 'a cottage that does not clear 15 units stops reading as a building');
});

test('a well, a lantern, an arch, a pavilion and a platform hold their documented sizes', () => {
  const well = boxOfParts(growWell({ radius: 6, wallHeight: 5, roof: false }));
  // "about 12 across and 6 tall to the rim" — the coping sits 1.0 above the 5-unit wall.
  assert.ok(Math.abs(well.maxY - 6) < 0.1, `the well's rim is at ${well.maxY}`);
  assert.ok(well.maxX - well.minX > 11 && well.maxX - well.minX < 14, 'the well is not ~12 across');

  const lantern = boxOfParts(growLantern({ height: 10 }));
  assert.ok(Math.abs(lantern.maxY - 10) < 0.05, `the lantern is ${lantern.maxY} tall`);
  assert.ok(
    lantern.maxX - lantern.minX > 2 && lantern.maxX - lantern.minX < 3.2,
    `the lantern is ${lantern.maxX - lantern.minX} across, not the documented ~2.5`,
  );

  const arch = boxOfParts(growArch({ width: 12, height: 14 }));
  assert.ok(Math.abs(arch.maxY - 14) < 0.05, `the arch is ${arch.maxY} tall`);
  assert.ok(arch.maxX - arch.minX >= 12 && arch.maxX - arch.minX < 14, 'the arch is not ~12 wide');

  // plinth (2.0) + posts (12) + rise (10) = 24.
  const pavilion = boxOfParts(growPavilion({}));
  assert.ok(Math.abs(pavilion.maxY - 24) < 0.1, `the pavilion tops out at ${pavilion.maxY}`);

  const platform = boxOfParts(growPlatform({ height: 3 }));
  assert.ok(Math.abs(platform.maxY - 3) < 0.05, `the platform is ${platform.maxY} tall`);

  const boat = boxOfParts(growBoat({ length: 14, beam: 5 }));
  assert.ok(Math.abs(boat.maxX - boat.minX - 14) < 0.2, `the boat is ${boat.maxX - boat.minX} long`);
});

test('a six-post pavilion appears only when the plan is long', () => {
  // The rule is mechanical (`width >= depth * 1.35`), so it gets a mechanical check rather than a
  // comment: a long roof on four posts reads as a table.
  const four = growPavilion({ width: 20, depth: 20 }).get(PROP_TOKENS.wood)!;
  const six = growPavilion({ width: 30, depth: 20 }).get(PROP_TOKENS.wood)!;
  assert.equal(six.triangles / four.triangles, 1.5, 'six posts is not 1.5x four posts of geometry');
});

// ---------------------------------------------------------------------------------------------
// the pot's contents — the one generator whose PART SET is part of its contract
// ---------------------------------------------------------------------------------------------

test('growPot emits exactly the parts each `contents` mode implies', () => {
  const expected: readonly [Parameters<typeof growPot>[0]['contents'], string[]][] = [
    ['none', [PROP_TOKENS.terracotta]],
    ['shrub', [PROP_TOKENS.terracotta, PROP_TOKENS.hedge]],
    ['sapling', [PROP_TOKENS.terracotta, PROP_TOKENS.hedge, SHARED_TOKENS.storyTrunk]],
    ['blossom', [PROP_TOKENS.terracotta, PROP_TOKENS.hedge, PROP_TOKENS.blossom]],
    ['marigold', [PROP_TOKENS.terracotta, PROP_TOKENS.hedge, PROP_TOKENS.marigold]],
  ];
  for (const [contents, want] of expected) {
    const parts = growPot(contents === undefined ? {} : { contents });
    assert.deepEqual([...parts.keys()].sort(), [...want].sort(), `contents: ${String(contents)}`);
  }
  // And an empty pot really is emptier: `none` must not merely omit a token, it must omit the
  // geometry. A token map is not evidence on its own — a part left in with zero indices would be
  // dropped by `finish` and would read here exactly like a part that was never grown.
  const bare = growPot({ contents: 'none' }).get(PROP_TOKENS.terracotta)!;
  const planted = growPot({ contents: 'shrub' }).get(PROP_TOKENS.terracotta)!;
  assert.equal(bare.triangles, planted.triangles, 'the pot itself changed when its contents did');
});

test('a porched cottage carries eight distinct MATERIALS — the ADR-0406 count, in one object', () => {
  // ADR-0406's whole diagnosis: our island drew four kinds of object with one material, against
  // eight to fifteen in every reference. The count is what the gap was measured in, so it gets an
  // assertion rather than a hope.
  const parts = growCottage({ porch: true });
  assert.equal(
    parts.size,
    8,
    `a porched cottage wears ${parts.size} materials: ${[...parts.keys()].join(', ')}`,
  );
  const plain = growCottage({});
  assert.ok(plain.size >= 6, `a plain cottage wears only ${plain.size} materials`);
});

// ---------------------------------------------------------------------------------------------
// degenerate input
// ---------------------------------------------------------------------------------------------

test('DEGENERATE INPUT refuses rather than shipping NaN into a GPU buffer', () => {
  // The failure this prevents is specific and silent. `addLobe` divides by its per-axis radius to
  // build the true ellipsoid normal, and `addLathe` divides by a profile slope: a zero extent
  // produces NaN, and NaN in a position buffer does not throw — it deletes the whole prop from the
  // render and reports nothing at all. So a zero-sized prop is refused at the door.
  const empties: readonly [string, PropParts][] = [
    ['growRock(radius 0)', growRock({ radius: 0 })],
    ['growRock(height 0)', growRock({ height: 0 })],
    ['growPot(radius 0)', growPot({ radius: 0 })],
    ['growWell(radius 0)', growWell({ radius: 0 })],
    ['growCottage(width 0)', growCottage({ width: 0 })],
    ['growCottage(depth 0)', growCottage({ depth: 0 })],
    ['growLantern(height 0)', growLantern({ height: 0 })],
    ['growArch(width 0)', growArch({ width: 0 })],
    ['growPavilion(width 0)', growPavilion({ width: 0 })],
    ['growPlatform(empty profile)', growPlatform({ profile: [] })],
    ['growPlatform(height 0)', growPlatform({ height: 0 })],
    ['growCrates(count 0)', growCrates({ count: 0 })],
    ['growCrates(size 0)', growCrates({ size: 0 })],
    ['growBoat(length 0)', growBoat({ length: 0 })],
    ['growBoat(beam 0)', growBoat({ beam: 0 })],
  ];
  for (const [name, parts] of empties) {
    assert.equal(parts.size, 0, `${name} should return an empty map, got ${[...parts.keys()]}`);
  }
});

test('a clamped-but-usable input still delivers a valid mesh', () => {
  // The other half of the degenerate story: not every odd input is a refusal. `courses: 0` is a
  // request for a platform with no steps, which is a slab — clamped to one course rather than
  // refused, because refusing would delete a prop the caller can plainly see should exist.
  const flat = growPlatform({ courses: 0 });
  assert.equal(flat.size, 1, 'a zero-course platform should still be a slab');
  const slab = flat.get(PROP_TOKENS.stone)!;
  assert.ok(slab.triangles > 0);
  for (let i = 0; i < slab.positions.length; i++) {
    assert.ok(Number.isFinite(slab.positions[i]!), 'NaN in a clamped platform');
  }
  // A single lobe is a legitimate rock, not a refusal.
  const pebble = growRock({ lobes: 1, radius: 1.5, height: 1.2 });
  assert.equal(pebble.size, 1);
  assert.ok(pebble.get(PROP_TOKENS.stone)!.triangles > 0);
});
