// coast-clip.test.ts — the claims the SHIPPED map's coastline rests on.
//
// ⚠⚠ THE TEST THIS FILE EXISTS FOR IS {@link the area conservation one}. The first working version
// of `coastArcs` matched the rim to the curve with a nearest-point SEARCH, which is the obvious
// answer and is wrong: on the shipped fixture it lands 2 of 52 rim vertices one segment BEHIND
// their predecessor, so the arc between them runs 207 segments the long way instead of 1 and two
// boundary parcels swallow the whole coastline. The island still had the right BOUNDS and the right
// parcel COUNT and its picture would have been recognisably an island — the summed parcel area was
// 3.0x its true value and nothing else said so. So the area assertion below is the one that would
// have caught it, and the fixed correspondence is asserted directly beside it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COAST_MODES,
  COAST_OUTSET,
  applyDisplacement,
  clipToCoast,
  coastArcs,
  coastCurve,
  coastDisplacement,
  edgeKey,
  nearestOnSegment,
  rimLoops,
  vertexKey,
  type CoastMode,
  type CoastPoint,
} from './coast-clip.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/** A 2x2 block of unit-ish square parcels: four rings sharing one centre vertex, so the block has
 *  8 boundary edges, 4 interior ones and exactly one rim loop. Small enough to reason about by
 *  hand, and it is NOT convex-per-parcel by accident — every parcel is a square, which is what
 *  makes the shared-vertex claim checkable without a mesh generator. */
const BLOCK: CoastPoint[][] = [
  [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
  [{ x: 10, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 10, z: 10 }],
  [{ x: 0, z: 10 }, { x: 10, z: 10 }, { x: 10, z: 20 }, { x: 0, z: 20 }],
  [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }],
];

/** The block as `cell-ground` descriptors on one island. `null` means the mapper could not name
 *  one — spelled `null` rather than `undefined` because passing `undefined` to a parameter with a
 *  default takes the DEFAULT, which is how the unhomed test below first passed a homed island and
 *  reported the module broken. */
function blockCells(island: string | null = 'story-a'): InstanceDescriptor[] {
  return BLOCK.map((ring, i) => {
    const d: InstanceDescriptor = {
      kind: 'cell-ground',
      transform: { x: 0, y: 0, z: 0 },
      group: 'cell-ground',
      points: ring.map((p) => ({ x: p.x, y: 0, z: p.z })),
      parcel: `cap-${i}`,
      material: 'healthy',
    };
    if (island !== null) d.island = island;
    return d;
  });
}

/** Twice the signed shoelace area of a ring — SIGNED, so a ring that folds back on itself does not
 *  get to hide behind an absolute value. */
function signedArea2(ring: readonly CoastPoint[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    s += p.x * q.z - q.x * p.z;
  }
  return s;
}

/** The summed |area| of every parcel in a descriptor set — the island's own area while the parcels
 *  tile it, and a number that BLOWS UP the moment a ring self-crosses. */
function summedArea(cells: readonly InstanceDescriptor[]): number {
  return cells.reduce(
    (a, c) => a + Math.abs(signedArea2((c.points ?? []).map((p) => ({ x: p.x, z: p.z })))) / 2,
    0,
  );
}

function ringsOf(cells: readonly InstanceDescriptor[]): CoastPoint[][] {
  return cells.map((c) => (c.points ?? []).map((p) => ({ x: p.x, z: p.z })));
}

// ---------------------------------------------------------------------------
// The rim
// ---------------------------------------------------------------------------

test('rimLoops finds the one closed loop of edges used by a single parcel', () => {
  const loops = rimLoops(BLOCK);
  assert.equal(loops.length, 1);
  assert.equal(loops[0]!.length, 8);
  // Every rim vertex is on the block's outside; the shared centre (10, 10) is on no boundary edge.
  const keys = new Set(loops[0]!.map(vertexKey));
  assert.equal(keys.has(vertexKey({ x: 10, z: 10 })), false);
  assert.equal(keys.size, 8);
});

test('rimLoops walks the loop in order — consecutive vertices are 10 apart, never diagonal', () => {
  const loop = rimLoops(BLOCK)[0]!;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    assert.equal(Math.hypot(b.x - a.x, b.z - a.z), 10, `step ${i} is not one block edge`);
  }
});

test('rimLoops ignores a ring that bounds no area', () => {
  const withSliver = [...BLOCK, [{ x: 50, z: 50 }, { x: 51, z: 50 }]];
  assert.deepEqual(rimLoops(withSliver), rimLoops(BLOCK));
});

test('an interior seam is one edge however its two parcels traverse it', () => {
  const a = { x: 10, z: 0 };
  const b = { x: 10, z: 10 };
  assert.equal(edgeKey(a, b), edgeKey(b, a));
});

// ---------------------------------------------------------------------------
// The curve, and the correspondence that is NOT a search
// ---------------------------------------------------------------------------

test('coastCurve outsets 1:1 and Chaikin-doubles twice', () => {
  const rim = rimLoops(BLOCK)[0]!;
  const curve = coastCurve(rim, 'story-a');
  assert.equal(curve.outset.length, rim.length);
  assert.equal(curve.smooth.length, rim.length * 4);
});

test('the outset pushes every rim vertex OUTWARD, by about the authored beach', () => {
  const rim = rimLoops(BLOCK)[0]!;
  const curve = coastCurve(rim, 'story-a');
  const centre = { x: 10, z: 10 };
  for (let i = 0; i < rim.length; i += 1) {
    const before = Math.hypot(rim[i]!.x - centre.x, rim[i]!.z - centre.z);
    const after = Math.hypot(curve.outset[i]!.x - centre.x, curve.outset[i]!.z - centre.z);
    assert.ok(after > before, `vertex ${i} did not move outward`);
  }
  // `jitteredOutset` modulates COAST_OUTSET by ±(0.7 wave + wobble) * 0.5, so the widest it can
  // ever reach is COAST_OUTSET * 1.5 — the cap the 2D map's own comment relies on to keep a coast
  // inside the inter-island gap.
  const widths = curve.outset.map((p, i) =>
    Math.hypot(p.x - rim[i]!.x, p.z - rim[i]!.z),
  );
  for (const w of widths) assert.ok(w > 0 && w <= COAST_OUTSET * 1.5, `beach ${w} out of range`);
});

test('coastArcs partitions the curve EXACTLY once — no point used twice, none left out', () => {
  const rim = rimLoops(BLOCK)[0]!;
  const curve = coastCurve(rim, 'story-a');
  const { landings, arcs } = coastArcs(curve);
  assert.equal(landings.length, rim.length);
  assert.equal(arcs.length, rim.length);
  const used = arcs.flat();
  assert.equal(used.length, curve.smooth.length);
  assert.equal(new Set(used.map(vertexKey)).size, new Set(curve.smooth.map(vertexKey)).size);
});

test('each arc is the curve run FORWARD from its own landing — never the long way round', () => {
  const rim = rimLoops(BLOCK)[0]!;
  const curve = coastCurve(rim, 'story-a');
  const index = new Map(curve.smooth.map((p, i) => [vertexKey(p), i]));
  const { arcs } = coastArcs(curve);
  const n = curve.smooth.length;
  for (let i = 0; i < arcs.length; i += 1) {
    const ids = arcs[i]!.map((p) => index.get(vertexKey(p))!);
    for (let k = 1; k < ids.length; k += 1) {
      assert.equal((ids[k]! - ids[k - 1]! + n) % n, 1, `arc ${i} skips curve points`);
    }
  }
});

test('coastArcs REFUSES a curve that is not the outset loop doubled twice', () => {
  const rim = rimLoops(BLOCK)[0]!;
  const curve = coastCurve(rim, 'story-a');
  assert.throws(
    () => coastArcs({ outset: curve.outset, smooth: curve.smooth.slice(0, -1) }),
    /coastArcs: expected 32 curve points for 8 outset points/,
  );
});

test('nearestOnSegment returns a point ON the segment, both ends included', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 10, z: 0 };
  assert.deepEqual(nearestOnSegment({ x: 4, z: 7 }, a, b), { x: 4, z: 0 });
  assert.deepEqual(nearestOnSegment({ x: -9, z: 1 }, a, b), { x: 0, z: 0 });
  assert.deepEqual(nearestOnSegment({ x: 99, z: 1 }, a, b), { x: 10, z: 0 });
  assert.deepEqual(nearestOnSegment({ x: 3, z: 3 }, a, a), { x: 0, z: 0 });
});

// ---------------------------------------------------------------------------
// The displacement, and what it does to a parcel
// ---------------------------------------------------------------------------

test('the interior vertex never moves, under any mode', () => {
  for (const mode of COAST_MODES) {
    const d = coastDisplacement(BLOCK, 'story-a', mode);
    assert.equal(d.moved.has(vertexKey({ x: 10, z: 10 })), false, mode);
  }
});

test('a shared rim vertex moves ONCE, so the two parcels holding it stay watertight', () => {
  for (const mode of COAST_MODES.filter((m) => m !== 'none')) {
    const clipped = clipToCoast(blockCells(), mode);
    const rings = ringsOf(clipped);
    // (10, 0) is the rim vertex the two top parcels share.
    const holders = rings.filter((r, i) =>
      (BLOCK[i] ?? []).some((p) => vertexKey(p) === vertexKey({ x: 10, z: 0 })),
    );
    assert.equal(holders.length, 2, mode);
    const seen = new Set<string>();
    for (const ring of holders) {
      // The moved vertex is whichever of this ring's points is NOT one of the original interior
      // ones; find it by asking the displacement directly.
      const d = coastDisplacement(BLOCK, 'story-a', mode);
      const target = d.moved.get(vertexKey({ x: 10, z: 0 }))!;
      assert.ok(
        ring.some((p) => vertexKey(p) === vertexKey(target)),
        `${mode}: a holder of the shared rim vertex does not carry its moved position`,
      );
      seen.add(vertexKey(target));
    }
    assert.equal(seen.size, 1, `${mode}: the shared vertex moved to two different places`);
  }
});

test('`none` is the identity — the same descriptors, points and all', () => {
  const cells = blockCells();
  const out = clipToCoast(cells, 'none');
  assert.deepEqual(out, cells);
});

test('only `subdivide` adds ring vertices, and it adds the whole curve exactly once', () => {
  const rimLength = rimLoops(BLOCK)[0]!.length;
  const before = ringsOf(blockCells()).reduce((a, r) => a + r.length, 0);
  const counts = new Map<CoastMode, number>();
  for (const mode of COAST_MODES) {
    counts.set(
      mode,
      ringsOf(clipToCoast(blockCells(), mode)).reduce((a, r) => a + r.length, 0),
    );
  }
  assert.equal(counts.get('none'), before);
  assert.equal(counts.get('outset'), before);
  assert.equal(counts.get('project'), before);
  // Two Chaikin passes → 4 curve points per rim vertex, every one of them inserted once.
  assert.equal(counts.get('subdivide'), before + rimLength * 4);
});

test('THE PARCELS STILL TILE THE ISLAND — summed parcel area IS the area the rim encloses', () => {
  // ⚠⚠ THE REGRESSION, AND IT IS AN EQUALITY RATHER THAN A BOUND. A nearest-point search matched
  // two rim vertices out of order and two boundary parcels each swallowed the whole coastline;
  // bounds, parcel count, ring count and winding all still looked right and the island's summed
  // parcel area went to 3.0x. No ratio threshold is the right instrument for that — the invariant
  // is that parcels tile their island with no gap and no overlap, so their summed area IS the area
  // enclosed by the rim they collectively bound. A folded ring breaks it in one direction and a
  // gap breaks it in the other, and neither needs a magic number to notice.
  for (const mode of COAST_MODES) {
    const clipped = clipToCoast(blockCells(), mode);
    const loops = rimLoops(ringsOf(clipped));
    assert.equal(loops.length, 1, `${mode}: the clipped island is not one landmass`);
    const enclosed = Math.abs(signedArea2(loops[0]!)) / 2;
    const tiled = summedArea(clipped);
    assert.ok(
      Math.abs(tiled - enclosed) < enclosed * 1e-9,
      `${mode}: parcels sum to ${tiled} inside a rim enclosing ${enclosed} — a ring folded or a gap opened`,
    );
    assert.ok(enclosed > 0, `${mode}: the island bounds nothing`);
  }
});

test('the beach GROWS the island, and only the modes that draw one', () => {
  const plain = summedArea(blockCells());
  assert.equal(summedArea(clipToCoast(blockCells(), 'none')), plain);
  for (const mode of COAST_MODES.filter((m) => m !== 'none')) {
    assert.ok(summedArea(clipToCoast(blockCells(), mode)) > plain, `${mode}: the island did not grow`);
  }
});

test('every parcel keeps the winding it arrived with', () => {
  for (const mode of COAST_MODES) {
    const clipped = ringsOf(clipToCoast(blockCells(), mode));
    for (let i = 0; i < clipped.length; i += 1) {
      assert.equal(
        Math.sign(signedArea2(clipped[i]!)),
        Math.sign(signedArea2(BLOCK[i]!)),
        `${mode}: parcel ${i} flipped`,
      );
    }
  }
});

test('the clip carries every parcel identity through untouched', () => {
  for (const mode of COAST_MODES) {
    const clipped = clipToCoast(blockCells(), mode);
    assert.equal(clipped.length, 4);
    clipped.forEach((c, i) => {
      assert.equal(c.parcel, `cap-${i}`, mode);
      assert.equal(c.island, 'story-a', mode);
      assert.equal(c.material, 'healthy', mode);
      assert.equal(c.kind, 'cell-ground', mode);
    });
  }
});

test('a descriptor that is not ground passes through in place', () => {
  const tree: InstanceDescriptor = {
    kind: 'story-tree',
    transform: { x: 3, y: 0, z: 4 },
    group: 'story-tree',
  };
  const mixed = [...blockCells(), tree];
  const out = clipToCoast(mixed, 'subdivide');
  assert.equal(out.length, 5);
  assert.deepEqual(out[4], tree);
});

test('a parcel the mapper could not attribute to an island is LEFT ALONE', () => {
  // No island id means no story seed, so there is no coast to draw — and pooling unhomed parcels
  // would compute a rim across the sea between two unrelated ones.
  const cells = blockCells(null);
  const out = clipToCoast(cells, 'subdivide');
  assert.deepEqual(out, cells);
});

test('two islands get two coasts, and neither reaches into the other', () => {
  const a = blockCells('story-a');
  const b = blockCells('story-b').map((c) => ({
    ...c,
    points: (c.points ?? []).map((p) => ({ x: p.x + 200, y: p.y, z: p.z })),
  }));
  const out = clipToCoast([...a, ...b], 'outset');
  const xs = out.flatMap((c) => (c.points ?? []).map((p) => p.x));
  const near = xs.filter((x) => x < 100);
  const far = xs.filter((x) => x >= 100);
  assert.equal(near.length, far.length);
  assert.ok(Math.max(...near) < Math.min(...far), 'the two islands overlap after clipping');
  // Different story ids seed different waves, so the two coasts are not translations of each other.
  const shifted = far.map((x) => x - 200);
  assert.notDeepEqual(near, shifted);
});

test('applyDisplacement reads an inserted arc BACKWARDS for a ring that traverses the edge the other way', () => {
  const forward: CoastPoint[] = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
  ];
  const backward: CoastPoint[] = [
    { x: 10, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 10 },
  ];
  const inserted = new Map([
    [
      edgeKey({ x: 0, z: 0 }, { x: 10, z: 0 }),
      { from: vertexKey({ x: 0, z: 0 }), points: [{ x: 3, z: -1 }, { x: 7, z: -1 }] },
    ],
  ]);
  const d = { moved: new Map<string, CoastPoint>(), inserted };
  assert.deepEqual(applyDisplacement(forward, d).slice(1, 3), [
    { x: 3, z: -1 },
    { x: 7, z: -1 },
  ]);
  assert.deepEqual(applyDisplacement(backward, d).slice(1, 3), [
    { x: 7, z: -1 },
    { x: 3, z: -1 },
  ]);
});

test('the coast is DETERMINISTIC and story-seeded', () => {
  const once = clipToCoast(blockCells(), 'subdivide');
  const twice = clipToCoast(blockCells(), 'subdivide');
  assert.deepEqual(once, twice);
  const other = clipToCoast(blockCells('story-b'), 'subdivide');
  assert.notDeepEqual(
    once.map((c) => c.points),
    other.map((c) => c.points),
  );
});
