import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoastPoint } from './coast-clip.js';
import { buildEdgeGrid, cellIndex, edgeBounds, edgeGridFarField, spanOf } from './shore-grid.js';
import { shoreField } from './shore-fall.js';

/** A brute-force distance to the nearest point of any ring, capped — the definition the grid is an
 *  optimisation OF. Deliberately the slowest possible spelling: no pruning, no index, nothing that
 *  could share a bug with the thing under test. */
function bruteDistance(rings: readonly (readonly CoastPoint[])[], x: number, z: number, width: number): number {
  let best = width;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const lenSq = ex * ex + ez * ez;
      const raw = lenSq === 0 ? 0 : ((x - a.x) * ex + (z - a.z) * ez) / lenSq;
      const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
      if (d < best) best = d;
    }
  }
  return best;
}

const SQUARE: CoastPoint[] = [
  { x: 0, z: 0 },
  { x: 40, z: 0 },
  { x: 40, z: 40 },
  { x: 0, z: 40 },
];

test('the far-field argument holds only while the cell is at least the query width', () => {
  // The short-circuit's whole soundness. A cell SMALLER than the width would leave a point's 3x3
  // block narrower than the cap, so an edge just outside the block could still be nearer than
  // `width` — and the empty-neighbourhood answer would be a wrong distance rather than the cap.
  assert.equal(edgeGridFarField(10, 10), true);
  assert.equal(edgeGridFarField(11, 10), true);
  assert.equal(edgeGridFarField(9.99, 10), false);
  // And the builder honours it: the grid it returns uses the width as its cell.
  assert.equal(buildEdgeGrid([SQUARE], 7).cell, 7);
});

test('the cell index FLOORS — a ceiling would shift every edge one cell over', () => {
  assert.equal(cellIndex(0, 0, 10), 0);
  assert.equal(cellIndex(9.99, 0, 10), 0);
  assert.equal(cellIndex(10, 0, 10), 1);
  // ⚠ NEGATIVE ORDINATES TOO. Ground coordinates straddle the origin, and `Math.trunc` — the
  // plausible substitute — collapses [-10, 0) and [0, 10) onto the same cell, silently merging the
  // two sides of the axis and hiding half a coast from the other half.
  assert.equal(cellIndex(-0.01, 0, 10), -1);
  assert.equal(cellIndex(-10, 0, 10), -1);
});

test('a degenerate grid answers "nothing near" rather than dividing by zero', () => {
  assert.deepEqual([...buildEdgeGrid([], 5).candidates(0, 0)], []);
  // A zero width would make the cell arithmetic divide by zero and hand every query NaN cells —
  // which reads as "no candidates" and would silently erase the coast.
  const zero = buildEdgeGrid([SQUARE], 0);
  assert.ok(zero.cell > 0, 'a zero width must not become a zero cell');
});

test('⚠ AN EDGE IS BUCKETED INTO EVERY CELL IT CROSSES, not just its endpoints`', () => {
  // ⚠⚠ THE FAILURE THIS PREVENTS IS A MISSED COASTLINE. A 40-unit edge across a 5-unit grid spans
  // eight cells; bucketed only by its endpoints, a point beside its MIDDLE finds an empty
  // neighbourhood and is told it is far inland — sand missing from exactly the water's edge, and
  // no error anywhere.
  const grid = buildEdgeGrid([SQUARE], 5);
  // Beside the middle of the bottom edge, just outside the square.
  const mid = grid.candidates(20, -1);
  assert.ok(mid.length > 0, 'a point beside an edge`s middle found no candidate edge');
  // And it really is that edge: the nearest distance from here is ~1.
  assert.ok(bruteDistance([SQUARE], 20, -1, 5) < 1.5);
});

test('⚠⚠ THE GRID IS EXACT — it agrees with a brute-force walk at every probe', () => {
  // ⚠ THIS IS THE CLAIM THE WHOLE OPTIMISATION RESTS ON, and it is the one a speed-up most easily
  // breaks: a faster field that is quietly wrong produces a plausible beach in the wrong place,
  // and every downstream measurement inherits it. `shoreField` now walks only the grid's
  // candidates, so this compares its answers against the definition over a dense sweep.
  const width = 9.9;
  const rings = [SQUARE];
  const reader = shoreField(
    [
      {
        kind: 'cell-ground',
        group: 'cell-ground',
        island: 'sq',
        transform: { x: 20, y: 0, z: 20 },
        points: SQUARE.map((p) => ({ x: p.x, y: 0, z: p.z })),
      },
    ],
    width,
  );
  let compared = 0;
  let sawBand = 0;
  let sawCap = 0;
  for (let x = -15; x <= 55; x += 0.7) {
    for (let z = -15; z <= 55; z += 0.7) {
      const expected = bruteDistance(rings, x, z, width);
      const got = reader.sample(x, z).distance;
      assert.ok(
        Math.abs(got - expected) < 1e-9,
        `at (${x.toFixed(1)}, ${z.toFixed(1)}) the grid said ${got} and the walk said ${expected}`,
      );
      compared += 1;
      if (expected > 0 && expected < width) sawBand += 1;
      if (expected === width) sawCap += 1;
    }
  }
  // ⚠ AND THE SWEEP MUST HAVE EXERCISED BOTH REGIMES, or it compared two constants. The band is
  // where the walk runs; the cap is where the short-circuit answers without touching an edge.
  assert.ok(compared > 9000, `only ${compared} probes — the sweep is too sparse to mean much`);
  assert.ok(sawBand > 500, `only ${sawBand} probes landed in the band the walk actually resolves`);
  assert.ok(sawCap > 500, `only ${sawCap} probes hit the capped far field the short-circuit serves`);
});

test('⚠ the grid is exact on a MANY-EDGED ring too, not just on a square', () => {
  // The square has four long edges; a real coast after the clip has hundreds of short ones, which
  // is the case the bucketing actually has to survive — an edge shorter than a cell, many of them
  // per bucket, and a boundary that curves through every cell it touches.
  //
  // ⚠ THE FIXTURE IS BUILT HERE RATHER THAN IMPORTED FROM `harness/`. `src/` is MIRRORED into the
  // public site by `pnpm sync:web-engine`, which copies nothing from `harness/` — so a src module
  // reaching across that line dangles in the published tree. `harness/scope-fence.test.ts` fences
  // it, and it caught this test's first version importing `shippedParcels`.
  const ring: CoastPoint[] = Array.from({ length: 240 }, (_, i) => {
    const a = (i / 240) * Math.PI * 2;
    // A wobbling radius, so the boundary is not a circle the grid could get right by symmetry.
    const r = 60 + 9 * Math.sin(a * 5) + 4 * Math.cos(a * 11);
    return { x: r * Math.cos(a), z: r * Math.sin(a) };
  });
  const width = 9.9;
  const reader = shoreField(
    [
      {
        kind: 'cell-ground',
        group: 'cell-ground',
        island: 'blob',
        transform: { x: 0, y: 0, z: 0 },
        points: ring.map((p) => ({ x: p.x, y: 0, z: p.z })),
      },
    ],
    width,
  );
  let compared = 0;
  let sawBand = 0;
  for (let x = -85; x <= 85; x += 1.7) {
    for (let z = -85; z <= 85; z += 1.7) {
      const expected = bruteDistance([ring], x, z, width);
      const got = reader.sample(x, z).distance;
      assert.ok(
        Math.abs(got - expected) < 1e-9,
        `many-edged ring: at (${x.toFixed(1)}, ${z.toFixed(1)}) grid ${got} vs walk ${expected}`,
      );
      compared += 1;
      if (expected > 0 && expected < width) sawBand += 1;
    }
  }
  assert.ok(compared > 9000, `only ${compared} probes on the many-edged ring`);
  assert.ok(sawBand > 500, `only ${sawBand} probes landed in the ring's band`);
});

test('⚠⚠ THE CONTRACT: the grid never OMITS an edge that could win', () => {
  // ⚠ THIS IS WHAT THE GRID PROMISES, AND IT IS THE ONLY THING IT PROMISES. Everything else about
  // it is a cost decision: a broken bound, a collapsed axis or a duplicated bucket makes the walk
  // test MORE edges and returns the identical distance, which is why `check:mutation-diff` reports
  // those internals as survivors and why they genuinely are equivalent. What is NOT equivalent is
  // dropping a candidate — that returns a WRONG distance, and it is invisible in any single
  // sample because the answer stays plausible.
  //
  // So this asserts the contract directly rather than through a distance: for every probe, every
  // edge whose true distance is under the cap must be among the candidates.
  const width = 9.9;
  // ⚠ OFF-ORIGIN AND ASYMMETRIC, because a fixture centred on the origin cannot distinguish a
  // min/max swap from a correct bound — both collapse to something symmetric that still works.
  const ring: CoastPoint[] = Array.from({ length: 90 }, (_, i) => {
    const a = (i / 90) * Math.PI * 2;
    return { x: 137 + (48 + 11 * Math.sin(a * 3)) * Math.cos(a), z: -64 + (29 + 6 * Math.cos(a * 4)) * Math.sin(a) };
  });
  const grid = buildEdgeGrid([ring], width);
  let probes = 0;
  let omissionsPossible = 0;
  for (let x = 60; x <= 215; x += 2.3) {
    for (let z = -110; z <= -18; z += 2.3) {
      const got = new Set(grid.candidates(x, z));
      for (let n = 0; n < grid.edges.length; n += 1) {
        const e = grid.edges[n]!;
        const d = bruteDistance([[{ x: e.ax, z: e.az }, { x: e.bx, z: e.bz }]], x, z, Infinity);
        // A degenerate "ring" of two points has one real edge and one zero-length return leg; the
        // brute helper walks both, so the distance above is that single segment's.
        if (d < width) {
          assert.ok(got.has(n), `edge ${n} is ${d.toFixed(2)} away at (${x.toFixed(1)}, ${z.toFixed(1)}) but was not offered`);
          omissionsPossible += 1;
        }
      }
      probes += 1;
    }
  }
  assert.ok(probes > 2000, `only ${probes} probes`);
  // ⚠ AND THE SWEEP MUST ACTUALLY HAVE HAD SOMETHING TO OMIT. With no in-range edge anywhere the
  // assertion above is vacuous and would pass against a grid that offers nothing at all.
  assert.ok(omissionsPossible > 2000, `only ${omissionsPossible} in-range edges were ever checked`);
});

test('an empty edge set and a populated one take different paths, and both answer', () => {
  // The empty-edges branch returns a grid that offers nothing; flipping its condition would send
  // an EMPTY set down the bounds arithmetic (Infinity bounds, NaN cells) and a POPULATED one down
  // the trivial return — which offers no candidates and erases every coast.
  assert.equal(buildEdgeGrid([], 5).edges.length, 0);
  assert.deepEqual([...buildEdgeGrid([], 5).candidates(0, 0)], []);
  const real = buildEdgeGrid([SQUARE], 5);
  assert.equal(real.edges.length, 4);
  assert.ok(real.candidates(20, -1).length > 0, 'a populated grid must still offer its edges');
});

test('edgeBounds returns the true box, and each corner comes from the right extreme', () => {
  // ⚠ ASYMMETRIC AND OFF-ORIGIN ON BOTH AXES, so a min/max swap or an axis mix-up is visible.
  // Inside `buildEdgeGrid` none of that is visible at all: a collapsed axis still returns exact
  // distances (every query finds every edge) and only the build TIME changes.
  const b = edgeBounds([
    { ax: -12, az: 40, bx: 5, bz: 41 },
    { ax: 3, az: -7, bx: 88, bz: 2 },
  ]);
  assert.deepEqual(b, { minX: -12, minZ: -7, maxX: 88, maxZ: 41 });
  // Each endpoint of an edge counts, not just the first.
  assert.deepEqual(edgeBounds([{ ax: 0, az: 0, bx: -3, bz: -4 }]), {
    minX: -3, minZ: -4, maxX: 0, maxZ: 0,
  });
  assert.deepEqual(edgeBounds([{ ax: -3, az: -4, bx: 0, bz: 0 }]), {
    minX: -3, minZ: -4, maxX: 0, maxZ: 0,
  });
});

test('spanOf is INCLUSIVE at both ends, and empty when the range inverts', () => {
  // The bucketing writes an edge into every cell of its box, so an off-by-one at EITHER end drops
  // a cell — and a dropped cell is a candidate never offered, which is the one failure mode the
  // grid may not have.
  assert.deepEqual([...spanOf(2, 5)], [2, 3, 4, 5]);
  assert.deepEqual([...spanOf(0, 0)], [0]);
  assert.deepEqual([...spanOf(-2, 1)], [-2, -1, 0, 1]);
  // An inverted range is empty rather than enormous — `Math.max(0, ...)` is what stops a negative
  // length becoming a thrown RangeError deep inside a build.
  assert.deepEqual([...spanOf(3, 1)], []);
});
