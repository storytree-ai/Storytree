// island-dressing.test.ts — the properties the five dressings have to hold, and the one
// invariant that keeps an art module from deciding a semantic question.
//
// WHAT THIS FILE IS NOT. It does not assert that an island looks good; a metric that decided
// that would be a metric invented to agree with a conclusion, which this arc has already
// declined to ship once and kept the refusal on the record for. The owner's look is the verdict
// (ADR-0392 D1). What is assertable is that the composition is DETERMINISTIC, that it stays
// inside the closed palette, that it puts real content on the island rather than reporting that
// it did, and that it never reads what a parcel MEANS.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDressing,
  clearDressingCache,
  dressingNames,
  type Dressing,
  type DressingName,
} from './island-dressing.js';
import { groundCellsFrom } from './island-descriptors.js';
import { islandScene } from './island-fixture.js';
import { LAND_RELIEF_AMPLITUDE } from './land-definition.js';
import { landTokens } from './palette-band.js';

const CELLS = groundCellsFrom(islandScene({}));
const RELIEF = LAND_RELIEF_AMPLITUDE;

function build(name: DressingName): Dressing {
  return buildDressing(name, { cells: CELLS, relief: RELIEF });
}

/** Every number a dressing emits, flattened — positions, normals, and the casters' four fields.
 *  One pass over everything is what makes "no NaN anywhere" a claim about the whole result
 *  rather than about the parts someone remembered to check. */
function everyNumber(d: Dressing): number[] {
  const out: number[] = [];
  for (const g of d.groups) {
    out.push(...g.offset);
    for (const mesh of g.parts.values()) {
      out.push(...mesh.positions, ...mesh.normals);
    }
  }
  for (const c of d.casters) out.push(c.x, c.z, c.radius, c.height);
  return out;
}

function tokensOf(d: Dressing): Set<string> {
  const out = new Set<string>();
  for (const g of d.groups) for (const token of g.parts.keys()) out.add(token);
  return out;
}

function triangles(d: Dressing): number {
  let n = 0;
  for (const g of d.groups) for (const m of g.parts.values()) n += m.triangles;
  return n;
}

test('there are five dressings and they are named in a stable order', () => {
  assert.deepEqual(dressingNames(), ['hamlet', 'shrine', 'terrace', 'walled', 'wild']);
});

for (const name of ['hamlet', 'shrine', 'terrace', 'walled', 'wild'] as const) {
  test(`${name}: builds, and every emitted token is in the closed palette`, () => {
    const d = build(name);
    const authored = new Set(landTokens());
    assert.ok(d.groups.length > 0, 'a dressing that puts nothing on the island is not a dressing');
    for (const token of tokensOf(d)) {
      assert.ok(
        authored.has(token),
        `${name} emits ${token}, which is not an authored token — it would deliver off-palette ` +
          'pixels and capture.mjs would report PALETTE BREACHED',
      );
    }
  });

  test(`${name}: is deterministic — the same island twice is byte-identical`, () => {
    // ⚠ THE CACHE IS CLEARED BETWEEN THE TWO BUILDS, and without that this test is vacuous:
    // identical arguments hit one cache entry and the assertions below would be comparing an
    // object with itself. Two SEPARATE cell extractions as well, so nothing upstream is shared
    // either.
    clearDressingCache();
    const a = buildDressing(name, { cells: groundCellsFrom(islandScene({})), relief: RELIEF });
    clearDressingCache();
    const b = buildDressing(name, { cells: groundCellsFrom(islandScene({})), relief: RELIEF });
    assert.notEqual(a, b, 'the two builds collapsed into one cache entry — the test proves nothing');
    assert.equal(a.groups.length, b.groups.length);
    a.groups.forEach((ga, i) => {
      const gb = b.groups[i]!;
      assert.deepEqual(ga.offset, gb.offset);
      assert.deepEqual([...ga.parts.keys()], [...gb.parts.keys()]);
      for (const [token, mesh] of ga.parts) {
        const other = gb.parts.get(token)!;
        assert.deepEqual([...mesh.positions], [...other.positions], `${name}/${token} positions`);
        assert.deepEqual([...mesh.normals], [...other.normals], `${name}/${token} normals`);
        assert.deepEqual([...mesh.indices], [...other.indices], `${name}/${token} indices`);
      }
    });
  });

  test(`${name}: emits no NaN and no infinity, anywhere`, () => {
    // A single NaN position collapses a whole merged mesh's bounding box, which the renderer uses
    // to FRAME the island — so one bad vertex does not produce one bad triangle, it produces a
    // blank or wildly mis-scaled canvas that reads as a camera bug.
    const bad = everyNumber(build(name)).filter((v) => !Number.isFinite(v));
    assert.deepEqual(bad, [], `${name} emitted ${bad.length} non-finite numbers`);
  });

  test(`${name}: is BLIND to status — the cache key depends on it`, () => {
    // The invariant at the top of `island-dressing.ts`: a dressing places props by GEOMETRY and
    // never by what a parcel means. Two things rest on it. First, ADR-0392 D5 — an art call may
    // never settle a semantic question under cover of appearance. Second, `buildDressing`'s cache
    // omits the cells from its key, which is only sound while this holds.
    //
    // `oddOneOut` gives one capability a foreign status without moving a single vertex of the
    // ground, so identical geometry out is exactly the property being claimed.
    const plain = buildDressing(name, { cells: groundCellsFrom(islandScene({})), relief: RELIEF });
    //
    // ⚠ THIS TEST ONLY MEANS ANYTHING BECAUSE `buildDressing`'S CACHE KEY FINGERPRINTS STATUS.
    // If it did not, both calls would hit one cache entry, the assertions would compare an object
    // to itself, and this would be a green that proves nothing. The key is deliberately
    // conservative for exactly this reason — see the note beside it.
    const odd = buildDressing(name, {
      cells: groundCellsFrom(islandScene({ oddOneOut: { index: 2, status: 'unhealthy' } })),
      relief: RELIEF,
    });
    assert.notEqual(plain, odd, 'the two builds collapsed into one cache entry — see above');
    assert.equal(triangles(plain), triangles(odd));
    assert.deepEqual([...tokensOf(plain)].sort(), [...tokensOf(odd)].sort());
  });

  test(`${name}: puts real CONTENT on the island, which is what this increment is for`, () => {
    const d = build(name);
    const tokens = tokensOf(d);
    // SIX distinct materials is the floor, and the number is not arbitrary: the diagnosis that
    // produced this work counted four kinds of object on our island against eight to fifteen in
    // every reference, with ONE material against four or five. A dressing that delivered three
    // materials would be reporting progress it had not made. It is a floor rather than a target —
    // the shrine court is deliberately sparse in OBJECTS, but it is still built of stone, gravel,
    // timber, tile, water and light.
    assert.ok(
      tokens.size >= 6,
      `${name} emits only ${tokens.size} materials (${[...tokens].join(', ')}) — the whole finding ` +
        'behind this work is that one material in different shapes is what made the last round fail',
    );
    assert.ok(d.groups.length >= 5, `${name} places only ${d.groups.length} prop groups`);
    assert.ok(triangles(d) > 500, `${name} emits ${triangles(d)} triangles — that is not a place`);
  });

  test(`${name}: every prop CASTS, so nothing on it looks pasted on`, () => {
    const d = build(name);
    assert.ok(d.casters.length > 0, `${name} contributes no occlusion at all`);
    for (const c of d.casters) {
      assert.ok(c.radius > 0 && c.height > 0, `${name} has a caster with no extent`);
      // Nothing should cast from outside the island's own ground bounds by more than a wall's
      // thickness — a caster adrift in the sea would lay a pool on water that is not there.
      assert.ok(Math.abs(c.x) < 140 && Math.abs(c.z) < 92, `${name} casts from (${c.x}, ${c.z})`);
    }
  });

  test(`${name}: thins the vegetation, which is call (3)`, () => {
    const d = build(name);
    assert.ok(
      d.plantFraction > 0 && d.plantFraction <= 0.75,
      `${name} keeps ${d.plantFraction} of the plants — 144 marks of about fifteen delivered ` +
        'pixels read as speckle, which is most of why the previous round read as textured ground',
    );
  });
}

test('the five dressings are genuinely DIFFERENT, not one idea at five settings', () => {
  // The owner's rejection of the previous round was that six islands "all look the same", and the
  // cause was that they differed by a quantity. This asserts the structural claim that replaced
  // it: no two dressings carry the same set of materials, and no two place the same number of
  // prop groups. It cannot prove they LOOK different — only a look can — but it can refuse the
  // specific failure of five entries that are one entry copied.
  const built = dressingNames().map((n) => ({ name: n, d: build(n) }));
  const signatures = built.map(({ name, d }) => ({
    name,
    materials: [...tokensOf(d)].sort().join(','),
    groups: d.groups.length,
  }));
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const a = signatures[i]!;
      const b = signatures[j]!;
      assert.notEqual(
        a.materials,
        b.materials,
        `${a.name} and ${b.name} are built of exactly the same materials — that is a setting, ` +
          'not a direction',
      );
    }
  }
});
