// cell-ground-geometry.test.ts — the claims the merged ground buffer rests on.
//
// ⚠ THE ONE THAT MATTERS IS THE WINDING. A parcel whose top face is wound the wrong way is
// INVISIBLE FROM ABOVE under backface culling — which is indistinguishable, on the only surface
// that draws this, from the bug the whole increment exists to fix. It cannot be settled by
// argument: the relaxed mesh's rings come out of a Voronoi relaxation clipped to an island
// boundary, with no guaranteed orientation and no guaranteed convexity. So every claim here is
// checked against the emitted buffer itself, and the fixtures deliberately include a ring handed
// in each orientation and one that is not convex.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_GROUND_DEPTH,
  cellGroundGeometry,
  cellGroundTriangles,
  normalisedRing,
  pointInTriangle,
  signedRingArea2,
  signedTriangleArea2,
  triangulateRing,
  type LinearRgb,
} from './cell-ground-geometry.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from './world-to-3d.js';

const WHITE: LinearRgb = { r: 1, g: 1, b: 1 };
const resolveWhite = (): LinearRgb => WHITE;

/** A `cell-ground` descriptor over a ring given as [x, z] pairs. */
function cellOf(ring: readonly (readonly [number, number])[], material?: string): InstanceDescriptor {
  const points = ring.map(([x, z]) => ({ x, y: 0, z }));
  const d: InstanceDescriptor = {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    points,
  };
  if (material !== undefined) d.material = material;
  return d;
}

/** A unit square, counter-clockwise in the (x, z) plane. */
const SQUARE_CCW = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
] as const;

/** The same square, handed the other way round. */
const SQUARE_CW = [...SQUARE_CCW].reverse();

/** An L-shape: NOT convex, and chosen because its CENTROID FALLS OUTSIDE IT — (13.3, 13.3) lands
 *  in the notch. That is what makes it a real test rather than a decorative one: a centroid fan
 *  emits inverted triangles here, and a centroid-based outward test picks the wrong side of two
 *  of its six walls. Both mistakes were made and both were caught by this fixture. */
const L_SHAPE = [
  [0, 0],
  [0, 30],
  [10, 30],
  [10, 10],
  [30, 10],
  [30, 0],
] as const;

/** Read triangle `i` out of a non-indexed buffer as three [x, y, z] vertices. */
function triangleAt(positions: Float32Array, i: number) {
  const o = i * 9;
  return [0, 1, 2].map((v) => ({
    x: positions[o + v * 3]!,
    y: positions[o + v * 3 + 1]!,
    z: positions[o + v * 3 + 2]!,
  }));
}

/** The geometric normal of a triangle, from its vertices — computed HERE independently of the
 *  builder so that agreeing with the builder's stored normals is evidence rather than tautology. */
function normalOf(t: ReturnType<typeof triangleAt>) {
  const [a, b, c] = t as [(typeof t)[0], (typeof t)[0], (typeof t)[0]];
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

test('a ring of n vertices costs 3n-2 triangles — a triangulated top plus two per wall', () => {
  // n-2 is what ANY simple polygon triangulates to, convex or not; 2n is the wall.
  assert.equal(cellGroundTriangles(4), 4 * 3 - 2);
  assert.equal(cellGroundTriangles(6), 6 * 3 - 2);
  // Below three there is no area to bound, so there is nothing to draw.
  assert.equal(cellGroundTriangles(2), 0);
  assert.equal(cellGroundTriangles(0), 0);
});

test('the buffer is non-indexed and self-consistent: 3 vertices and 9 floats per triangle', () => {
  const geo = cellGroundGeometry({ cells: [cellOf(SQUARE_CCW)], resolve: resolveWhite });
  assert.equal(geo.cells, 1);
  assert.equal(geo.triangles, 10);
  assert.equal(geo.positions.length, 10 * 9);
  assert.equal(geo.normals.length, 10 * 9);
  assert.equal(geo.colors.length, 10 * 9);
});

test('EVERY top face points +Y, whichever way the ring was handed in', () => {
  // ⚠ The three arms are the point of this test. `worldTo3D` passes the scene's ring through
  // untouched — winding is settled HERE and nowhere else — so the builder is held to producing an
  // upward top face under both handednesses and for a ring that is not convex.
  for (const [label, ring] of [
    ['ccw', SQUARE_CCW],
    ['cw', SQUARE_CW],
    ['non-convex L', L_SHAPE],
  ] as const) {
    const geo = cellGroundGeometry({ cells: [cellOf(ring)], resolve: resolveWhite });
    const tops = [];
    for (let i = 0; i < geo.triangles; i += 1) {
      const t = triangleAt(geo.positions, i);
      if (t.every((v) => v.y === 0)) tops.push(normalOf(t));
    }
    assert.equal(tops.length, ring.length - 2, `${label}: a simple polygon triangulates to n-2`);
    for (const n of tops) {
      assert.ok(
        Math.abs(n.y) > 0.999,
        `${label}: a top face must be horizontal, got normal.y=${n.y}`,
      );
    }
    // All of them agree, and they agree on UP — a fan half of which faced down would still
    // satisfy a per-triangle |y| check.
    const ups = tops.filter((n) => n.y > 0).length;
    assert.equal(ups, tops.length, `${label}: ${tops.length - ups} top faces point DOWN`);
  }
});

test('the stored normals are the emitted geometry’s own, not authored beside it', () => {
  const geo = cellGroundGeometry({ cells: [cellOf(L_SHAPE)], resolve: resolveWhite });
  for (let i = 0; i < geo.triangles; i += 1) {
    const expected = normalOf(triangleAt(geo.positions, i));
    for (let v = 0; v < 3; v += 1) {
      const o = i * 9 + v * 3;
      assert.ok(Math.abs(geo.normals[o]! - expected.x) < 1e-5, `tri ${i} vtx ${v} normal.x`);
      assert.ok(Math.abs(geo.normals[o + 1]! - expected.y) < 1e-5, `tri ${i} vtx ${v} normal.y`);
      assert.ok(Math.abs(geo.normals[o + 2]! - expected.z) < 1e-5, `tri ${i} vtx ${v} normal.z`);
    }
  }
});

/** Ray-casting point-in-polygon in the (x, z) plane. Used instead of a centroid comparison
 *  because the centroid test is exactly what this module stopped relying on: for the non-convex
 *  L the centroid sits in the notch, OUTSIDE the shape, so "away from the centre" points INTO
 *  the parcel along two of its six edges — a test written that way would have demanded the bug. */
function insidePolygon(px: number, pz: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test('every wall faces OUT OF the parcel, including on a non-convex ring', () => {
  for (const [label, ring] of [
    ['ccw square', SQUARE_CCW],
    ['cw square', SQUARE_CW],
    ['non-convex L', L_SHAPE],
  ] as const) {
    const geo = cellGroundGeometry({ cells: [cellOf(ring)], resolve: resolveWhite });
    let walls = 0;
    for (let i = 0; i < geo.triangles; i += 1) {
      const t = triangleAt(geo.positions, i);
      if (t.every((v) => v.y === 0)) continue; // a top face
      walls += 1;
      const n = normalOf(t);
      assert.ok(Math.abs(n.y) < 1e-6, `${label} wall ${i} must be vertical, got normal.y=${n.y}`);
      // Step a short way along the face normal from the wall's own midpoint. Outward means the
      // step lands OUTSIDE the parcel AND the mirrored step lands inside — checking both is what
      // rules out a midpoint that was already outside for some unrelated reason.
      const mx = (t[0]!.x + t[1]!.x + t[2]!.x) / 3;
      const mz = (t[0]!.z + t[1]!.z + t[2]!.z) / 3;
      const eps = 0.05;
      assert.equal(
        insidePolygon(mx + n.x * eps, mz + n.z * eps, ring),
        false,
        `${label} wall ${i} normal points INTO the parcel`,
      );
      assert.equal(
        insidePolygon(mx - n.x * eps, mz - n.z * eps, ring),
        true,
        `${label} wall ${i}: the mirrored step is not inside either — the probe is unsound`,
      );
    }
    assert.equal(walls, ring.length * 2, `${label}: two wall triangles per ring edge`);
  }
});

test('walls fall exactly CELL_GROUND_DEPTH below the ground plane, and the top sits at y=0', () => {
  const geo = cellGroundGeometry({ cells: [cellOf(SQUARE_CCW)], resolve: resolveWhite });
  const ys = new Set<number>();
  for (let i = 0; i < geo.positions.length; i += 3) ys.add(geo.positions[i + 1]!);
  assert.deepEqual([...ys].sort((a, b) => a - b), [-CELL_GROUND_DEPTH, 0]);
});

test('per-parcel colour survives the merge — every vertex of a parcel wears its own status', () => {
  const red: LinearRgb = { r: 1, g: 0, b: 0 };
  const blue: LinearRgb = { r: 0, g: 0, b: 1 };
  const resolve = (m: string | undefined): LinearRgb => (m === 'healthy' ? red : blue);
  const geo = cellGroundGeometry({
    cells: [cellOf(SQUARE_CCW, 'healthy'), cellOf(L_SHAPE, 'unhealthy')],
    resolve,
  });
  assert.equal(geo.cells, 2);
  const first = cellGroundTriangles(SQUARE_CCW.length) * 9;
  for (let i = 0; i < first; i += 3) {
    assert.equal(geo.colors[i], 1, `parcel 1 vertex ${i / 3} is not red`);
    assert.equal(geo.colors[i + 2], 0);
  }
  for (let i = first; i < geo.colors.length; i += 3) {
    assert.equal(geo.colors[i], 0, `parcel 2 vertex ${i / 3} is not blue`);
    assert.equal(geo.colors[i + 2], 1);
  }
});

test('no cells is an empty buffer, not a throw — the classic substrate is an ordinary island', () => {
  const geo = cellGroundGeometry({ cells: [], resolve: resolveWhite });
  assert.equal(geo.triangles, 0);
  assert.equal(geo.cells, 0);
  assert.equal(geo.positions.length, 0);
});

test('a degenerate ring is dropped rather than emitted as a parcel bounding no area', () => {
  const geo = cellGroundGeometry({
    cells: [cellOf([[0, 0], [1, 1]]), cellOf(SQUARE_CCW)],
    resolve: resolveWhite,
  });
  assert.equal(geo.cells, 1);
  assert.equal(geo.triangles, cellGroundTriangles(4));
});

// ---------------------------------------------------------------------------
// End to end: the mapper's winding normalisation and the builder agree
// ---------------------------------------------------------------------------

/** A minimal relaxed-mesh scene: a ground group carrying its status, with plain cells under it
 *  carrying NONE — the exact shape `scene.ts:3252` emits, which is what makes the status
 *  inheritance load-bearing rather than defensive. */
function meshGroundScene(rings: readonly (readonly (readonly [number, number])[])[], status: string) {
  const polyPath = (r: readonly (readonly [number, number])[]) =>
    r.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
  return {
    el: 'g' as const,
    kind: 'ground-mesh',
    children: [
      {
        el: 'g' as const,
        kind: 'ground',
        status,
        children: rings.map((r) => ({ el: 'path' as const, kind: 'cell', d: polyPath(r) })),
      },
    ],
  };
}

test('the mapper hands the builder rings it can always fan upward', () => {
  // Both handednesses go in; every top face must still come out pointing up.
  const scene = meshGroundScene([SQUARE_CCW, SQUARE_CW, L_SHAPE], 'healthy');
  const ds: Descriptor3D[] = worldTo3D(scene as never);
  const cells = ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  assert.equal(cells.length, 3);
  const geo = cellGroundGeometry({ cells, resolve: resolveWhite });
  for (let i = 0; i < geo.triangles; i += 1) {
    const t = triangleAt(geo.positions, i);
    if (!t.every((v) => v.y === 0)) continue;
    assert.ok(normalOf(t).y > 0.999, `triangle ${i} is a top face pointing down`);
  }
});

// ---------------------------------------------------------------------------
// The primitives — the orientation convention everything above rests on
// ---------------------------------------------------------------------------
//
// ⚠ WHY THESE EXIST AT ALL. The tests above check the buffer's OUTPUT SHAPE, and a mutation
// sweep over the changed lines found 78 surviving mutants inside the triangulation: on a square
// and an L, many arithmetic variants of the shoelace and many wrong ear-selection rules still
// produce the right NUMBER of triangles, all facing up, with walls on the outside. Shape is
// necessary and nowhere near sufficient. What discriminates is AREA CONSERVATION — a
// triangulation that loses, duplicates or inverts a piece cannot sum back to the polygon it came
// from — plus containment, which is what catches an ear taken at a reflex corner.

const P = (x: number, z: number) => ({ x, z });

/** A regular n-gon of radius r, wound one way; `-r` flips it. */
function ngon(n: number, r: number) {
  return Array.from({ length: n }, (_, i) => P(Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r));
}

/** A comb — the nastiest shape here: five deep notches, so ear selection cannot be naive and the
 *  centroid is comfortably outside the polygon. */
const COMB = (() => {
  const pts = [P(0, 0), P(0, 100)];
  for (let i = 0; i < 5; i += 1) {
    const x0 = 20 * i + 10;
    pts.push(P(x0, 100), P(x0, 25), P(x0 + 8, 25), P(x0 + 8, 100));
  }
  pts.push(P(110, 100), P(110, 0));
  return pts;
})();

const ringOf = (r: readonly (readonly [number, number])[]) => r.map(([x, z]) => P(x, z));
const SQ = ringOf(SQUARE_CCW);
const L = ringOf(L_SHAPE);

test('signedTriangleArea2 IS twice the area, and its sign IS the winding', () => {
  // A right triangle of legs 3 and 4: area 6, so |area2| = 12. Both windings, magnitude equal.
  const a = P(0, 0);
  const b = P(3, 0);
  const c = P(0, 4);
  assert.equal(Math.abs(signedTriangleArea2(a, b, c)), 12);
  assert.equal(signedTriangleArea2(a, b, c), -signedTriangleArea2(a, c, b));
  // NEGATIVE is the upward winding — the sentence the whole module rests on, pinned against the
  // buffer rather than restated: the first top face the builder emits for this ring points +Y.
  const geo = cellGroundGeometry({ cells: [cellOf(SQUARE_CCW)], resolve: resolveWhite });
  const firstTop = triangleAt(geo.positions, 0);
  assert.ok(normalOf(firstTop).y > 0.999);
  assert.ok(
    signedTriangleArea2(
      P(firstTop[0]!.x, firstTop[0]!.z),
      P(firstTop[1]!.x, firstTop[1]!.z),
      P(firstTop[2]!.x, firstTop[2]!.z),
    ) < 0,
  );
  // Collinear points bound nothing.
  assert.equal(signedTriangleArea2(P(0, 0), P(1, 1), P(2, 2)), 0);
  // Translation invariant — it is an area, not a position.
  const shift = (p: ReturnType<typeof P>) => P(p.x + 137, p.z - 91);
  assert.equal(signedTriangleArea2(a, b, c), signedTriangleArea2(shift(a), shift(b), shift(c)));
});

test('signedRingArea2 IS twice the polygon area, and reversing the ring negates it', () => {
  assert.equal(Math.abs(signedRingArea2(SQ)), 200); // a 10x10 square
  assert.equal(signedRingArea2([...SQ].reverse()), -signedRingArea2(SQ));
  // The L: 10x30 arm plus a 20x10 foot = 300 + 200 = 500, so |area2| = 1000.
  assert.equal(Math.abs(signedRingArea2(L)), 1000);
  // It agrees with the triangle form on a triangle, which is what makes them one convention.
  const tri = [P(0, 0), P(3, 0), P(0, 4)];
  assert.equal(signedRingArea2(tri), signedTriangleArea2(tri[0]!, tri[1]!, tri[2]!));
});

test('normalisedRing lands on the negative winding, is idempotent, and only ever reverses', () => {
  for (const ring of [SQ, [...SQ].reverse(), L, [...L].reverse(), COMB, [...COMB].reverse()]) {
    const n = normalisedRing(ring);
    assert.ok(signedRingArea2(n) < 0, 'not on the negative winding');
    assert.deepEqual(normalisedRing(n), n, 'not idempotent');
    // The same vertices, in the same cyclic order or its reverse — never resorted or dropped.
    assert.equal(n.length, ring.length);
    const same = n.every((p, i) => p === ring[i]);
    const reversed = n.every((p, i) => p === ring[ring.length - 1 - i]);
    assert.ok(same || reversed, 'normalisedRing did something other than reverse');
  }
});

test('pointInTriangle answers inside / outside / on the boundary', () => {
  // Wound NEGATIVE, which is the orientation the predicate is written against.
  const t = normalisedRing([P(0, 0), P(10, 0), P(0, 10)]);
  const [a, b, c] = [t[0]!, t[1]!, t[2]!];
  assert.equal(pointInTriangle(P(1, 1), a, b, c), true, 'an interior point');
  assert.equal(pointInTriangle(P(9, 9), a, b, c), false, 'beyond the hypotenuse');
  assert.equal(pointInTriangle(P(-1, 5), a, b, c), false, 'outside an edge');
  assert.equal(pointInTriangle(P(5, 5), a, b, c), true, 'ON the hypotenuse — edges are inclusive');
  assert.equal(pointInTriangle(a, a, b, c), true, 'a vertex is not outside its own triangle');
});

// ---------------------------------------------------------------------------
// triangulateRing — area conservation is the assertion that discriminates
// ---------------------------------------------------------------------------

/** A regular five-point star: ten vertices, FIVE deep reflex corners. ⚠ It is here because it is
 *  the shape that discriminates the ear test's convexity guard — remove the guard and three of its
 *  eight pieces come out inverted, while the area still conserves and the count is still n-2. The
 *  square, the L and the comb all survive that mutation unchanged. Found by search rather than by
 *  intuition, after the guard was reported as an unkilled mutant. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  const r = i % 2 ? 14 : 50;
  return P(Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100);
});

/** A concave ring carrying a vertex exactly on the midpoint of one of its edges — the T-junction
 *  a parcel gets when a neighbour subdivides an edge they share. ⚠ It discriminates the OTHER
 *  half of the ear test: relax `>= 0` to `> 0` and this collinear corner is taken as an ear,
 *  emitting a zero-area piece. The plain T-junction hexagon does NOT catch that (its collinear
 *  corner is never reached as an apex), which is why this shape exists as well. */
const COLLINEAR_ON_CONCAVE = [
  P(10, 0),
  P(22, 37),
  P(-10, 17),
  P(-37, 0),
  P(-7, -12),
  P(5, -9),
  P(7.5, -4.5),
];

const SHAPES: readonly (readonly [string, readonly { x: number; z: number }[]])[] = [
  ['5-point star (5 reflex corners)', STAR],
  ['5-point star reversed', [...STAR].reverse()],
  ['collinear vertex on a concave ring', COLLINEAR_ON_CONCAVE],
  ['collinear on concave, reversed', [...COLLINEAR_ON_CONCAVE].reverse()],
  ['square', SQ],
  ['square reversed', [...SQ].reverse()],
  ['non-convex L', L],
  ['non-convex L reversed', [...L].reverse()],
  ['comb (5 notches)', COMB],
  ['comb reversed', [...COMB].reverse()],
  ['triangle', [P(0, 0), P(10, 0), P(5, 8)]],
  ['24-gon', ngon(24, 40)],
  ['24-gon reversed', [...ngon(24, 40)].reverse()],
];

test('triangulateRing CONSERVES AREA — the pieces sum back to the polygon', () => {
  // ⚠ THIS IS THE LOAD-BEARING TEST OF THE MODULE. A triangulation that drops a piece, emits one
  // twice, inverts one, or takes an ear across a notch cannot sum back to the ring it came from.
  // Every other property here (count, winding, containment) is satisfiable by a wrong answer.
  for (const [label, ring] of SHAPES) {
    const tris = triangulateRing(ring);
    assert.equal(tris.length, ring.length - 2, `${label}: expected n-2 triangles`);
    let sum = 0;
    for (const [a, b, c] of tris) {
      const s = signedTriangleArea2(a, b, c);
      assert.ok(s < 0, `${label}: a piece is wound the wrong way (or is degenerate)`);
      sum += s;
    }
    assert.ok(
      Math.abs(Math.abs(sum) - Math.abs(signedRingArea2(ring))) < 1e-6,
      `${label}: pieces sum to ${Math.abs(sum)}, the ring is ${Math.abs(signedRingArea2(ring))}`,
    );
  }
});

test('every piece lies INSIDE the polygon — no ear taken across a notch', () => {
  // ⚠ Area conservation alone does not catch this on every shape: a piece taken outside the
  // polygon and a compensating overlap can still sum correctly. The comb is the shape where a
  // naive ear rule actually reaches across a notch, so its centroid test is the one that bites.
  for (const [label, ring] of SHAPES) {
    for (const [a, b, c] of triangulateRing(ring)) {
      const cx = (a.x + b.x + c.x) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const pi = ring[i]!;
        const pj = ring[j]!;
        if (pi.z > cz !== pj.z > cz && cx < ((pj.x - pi.x) * (cz - pi.z)) / (pj.z - pi.z) + pi.x) inside = !inside;
      }
      assert.ok(inside, `${label}: a piece's centroid (${cx}, ${cz}) is outside the polygon`);
    }
  }
});

test('no piece swallows another ring vertex — the ear test is doing its job', () => {
  for (const [label, ring] of SHAPES) {
    const pts = normalisedRing(ring);
    for (const [a, b, c] of triangulateRing(ring)) {
      for (const p of pts) {
        if (p === a || p === b || p === c) continue;
        const strictlyInside =
          signedTriangleArea2(a, b, p) < 0 && signedTriangleArea2(b, c, p) < 0 && signedTriangleArea2(c, a, p) < 0;
        assert.equal(strictlyInside, false, `${label}: a piece contains a ring vertex`);
      }
    }
  }
});

test('a degenerate ring terminates and bounds no area, rather than looping forever', () => {
  // ⚠ The guard in `triangulateRing` exists for this and nothing else, so it needs a case that
  // reaches it. Every vertex here is collinear: no corner is ever an ear, so the ear loop finds
  // nothing to clip on any pass and must fall out rather than spin.
  const collinear = [P(0, 0), P(1, 0), P(2, 0), P(3, 0), P(4, 0)];
  const tris = triangulateRing(collinear);
  for (const [a, b, c] of tris) assert.equal(signedTriangleArea2(a, b, c), 0);
  assert.equal(signedRingArea2(collinear), 0);
});

test('the buffer’s top faces ARE triangulateRing’s output, ring for ring', () => {
  // Ties the primitive to the thing that ships: the same pieces, the same count, the same area.
  for (const [label, ring] of SHAPES) {
    const cells = [cellOf(ring.map((p) => [p.x, p.z] as const))];
    const geo = cellGroundGeometry({ cells, resolve: resolveWhite });
    const tops = [];
    for (let i = 0; i < geo.triangles; i += 1) {
      const t = triangleAt(geo.positions, i);
      if (t.every((v) => v.y === 0)) tops.push(t);
    }
    const expected = triangulateRing(ring);
    assert.equal(tops.length, expected.length, `${label}: top-face count`);
    const areaOf = (ts: readonly { x: number; z: number }[][]) =>
      ts.reduce((s, t) => s + Math.abs(signedTriangleArea2(P(t[0]!.x, t[0]!.z), P(t[1]!.x, t[1]!.z), P(t[2]!.x, t[2]!.z))), 0);
    // ⚠ A RELATIVE tolerance, and it has to be. `positions` is a Float32Array — about seven
    // significant digits — so on the 24-gon (area ~4,900) an absolute 1e-6 bound is tighter than
    // the storage the numbers came out of, and the test fails on the round trip rather than on
    // anything about the triangulation.
    const got = areaOf(tops);
    const want = areaOf(expected.map((t) => [...t]));
    assert.ok(
      Math.abs(got - want) <= Math.max(1e-4, want * 1e-5),
      `${label}: the buffer's top area is ${got}, the triangulation's is ${want}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The boundary cases a mutation sweep asked for
// ---------------------------------------------------------------------------
//
// ⚠ EVERY TEST BELOW EXISTS BECAUSE A SURVIVING MUTANT NAMED IT. They are the cases the shapes
// above cannot reach: a ring whose area is exactly zero, a point exactly ON an edge, a corner
// exactly collinear, an input array the caller still owns. Each is a real thing a Voronoi parcel
// clipped to a hex boundary can hand in — a T-junction puts a vertex exactly on a neighbour's
// edge — so none of this is testing for the test's sake.

test('normalisedRing does NOT mutate the array it was given', () => {
  // ⚠ `pts.slice().reverse()` — drop the `slice()` and the RETURN VALUE is identical while the
  // CALLER'S array is reversed underneath it. Nothing about the output can see that, which is
  // exactly why it survived until this test existed. `cellGroundGeometry` reuses the descriptor's
  // `points` for the walls after triangulating, so the aliasing would be live.
  const original = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
  const copy = original.map((p) => P(p.x, p.z));
  normalisedRing(original);
  assert.deepEqual(original, copy, 'normalisedRing reversed its input in place');
});

test('normalisedRing leaves a ring it need not touch ALONE, by reference', () => {
  // ⚠ `> 0` vs `>= 0` differ on exactly one input: a ring of zero area. Both answers are equally
  // correct about the winding of something that has none, so the only observable difference is
  // whether an untouched ring is handed back as ITSELF or as a fresh reversed copy. Pinning the
  // reference is what makes that difference visible at all.
  const zeroArea = [P(0, 0), P(1, 0), P(2, 0), P(3, 0)];
  assert.equal(signedRingArea2(zeroArea), 0);
  assert.equal(normalisedRing(zeroArea), zeroArea, 'a zero-area ring was needlessly copied');
  const alreadyNegative = normalisedRing(SQ);
  assert.equal(normalisedRing(alreadyNegative), alreadyNegative);
});

test('pointInTriangle is inclusive on ALL THREE edges, not just one', () => {
  // ⚠ Three separate `<= 0` terms, and a test that only probes one edge leaves the other two
  // free to become `< 0`. A parcel vertex landing exactly on a neighbour's edge is the ordinary
  // T-junction case, so each term is probed on its own edge.
  const t = normalisedRing([P(0, 0), P(12, 0), P(0, 12)]);
  const [a, b, c] = [t[0]!, t[1]!, t[2]!];
  const mid = (p: typeof a, q: typeof a) => P((p.x + q.x) / 2, (p.z + q.z) / 2);
  assert.equal(pointInTriangle(mid(a, b), a, b, c), true, 'on edge ab');
  assert.equal(pointInTriangle(mid(b, c), a, b, c), true, 'on edge bc');
  assert.equal(pointInTriangle(mid(c, a), a, b, c), true, 'on edge ca');
  // ⚠ And a point just OUTSIDE each edge in turn. Three separate terms means three separate ways
  // to be wrong, and a probe that is outside two edges at once leaves the third term free to be
  // anything — including a constant `true`. Each point below violates exactly ONE term.
  const outsideOf = (p: typeof a, q: typeof a) => {
    const m = mid(p, q);
    // Step along the outward normal of edge pq for a NEGATIVE-wound triangle: (-dz, dx).
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    return P(m.x + (-dz / len) * 0.1, m.z + (dx / len) * 0.1);
  };
  assert.equal(pointInTriangle(outsideOf(a, b), a, b, c), false, 'just outside edge ab only');
  assert.equal(pointInTriangle(outsideOf(b, c), a, b, c), false, 'just outside edge bc only');
  assert.equal(pointInTriangle(outsideOf(c, a), a, b, c), false, 'just outside edge ca only');
  // ⚠ A DEGENERATE triangle: the predicate is three half-plane tests, so it collapses to "is p on
  // the line". A point OFF the line is outside; a point ON it comes back true even beyond the
  // segment's ends. That is a real limit of the predicate and it is stated rather than asserted
  // away — `triangulateRing` never asks it about a degenerate triangle, because the ear test
  // rejects a collinear corner before this is reached.
  assert.equal(pointInTriangle(P(5, 0), P(0, 0), P(1, 1), P(2, 2)), false, 'off the line');
  assert.equal(pointInTriangle(P(5, 5), P(0, 0), P(1, 1), P(2, 2)), true, 'on the line, past the end');
});

/** A hexagon with an extra vertex sitting exactly on the midpoint of one edge — the T-junction a
 *  parcel gets when a neighbour subdivides the edge they share. Its extra corner is COLLINEAR. */
const T_JUNCTION = [P(0, 0), P(0, 60), P(30, 90), P(60, 60), P(60, 30), P(60, 0), P(30, 0)];

test('a COLLINEAR corner is never taken as an ear — no zero-area piece reaches the buffer', () => {
  // ⚠ `>= 0` vs `> 0` on the ear test differ on exactly a collinear corner: with `> 0` such a
  // corner is accepted and emitted as a zero-area triangle. The area still conserves and the
  // count is still n-2, so only a STRICT check on each piece's area catches it.
  assert.equal(signedTriangleArea2(P(60, 60), P(60, 30), P(60, 0)), 0, 'the fixture has no collinear corner');
  const tris = triangulateRing(T_JUNCTION);
  assert.equal(tris.length, T_JUNCTION.length - 2);
  for (const [a, b, c] of tris) {
    assert.ok(signedTriangleArea2(a, b, c) < 0, 'a zero-area or inverted piece was emitted');
  }
  const sum = tris.reduce((s, [a, b, c]) => s + signedTriangleArea2(a, b, c), 0);
  assert.ok(Math.abs(Math.abs(sum) - Math.abs(signedRingArea2(T_JUNCTION))) < 1e-6);
});

test('a fully collinear ring TERMINATES — the loop is total without an iteration guard', () => {
  // ⚠ This is the assertion that replaced a dead `n*n+4` pass counter. No corner is ever an ear,
  // so the ear loop finds nothing on its first pass and must fall out of `if (!clipped) break`
  // rather than spin. If this test ever hangs, that break is what broke.
  const collinear = Array.from({ length: 12 }, (_, i) => P(i, 0));
  const tris = triangulateRing(collinear);
  assert.equal(tris.length, collinear.length - 2);
  for (const [a, b, c] of tris) assert.equal(signedTriangleArea2(a, b, c), 0);
});

test('a parcel with NO material resolves through the resolver like any other', () => {
  // ⚠ `input.cells[i]?.material` — the optional chain. A descriptor list is never sparse here, so
  // dropping the `?.` changes nothing observable; what IS observable is that an absent material
  // reaches the resolver as `undefined` rather than being skipped or defaulted behind its back.
  const seen: (string | undefined)[] = [];
  cellGroundGeometry({
    cells: [cellOf(SQUARE_CCW), cellOf(SQUARE_CCW, 'healthy')],
    resolve: (m) => {
      seen.push(m);
      return WHITE;
    },
  });
  assert.deepEqual(seen, [undefined, 'healthy']);
});

test('the normal is NORMALISED, and a degenerate face gets a zero normal rather than NaN', () => {
  // ⚠ `Math.hypot(...) > 0` guards the divide. Without it a zero-area face divides by zero and
  // writes NaN into the buffer, which three propagates into the lighting as a black hole rather
  // than as an error. A fully collinear ring is the case that produces one.
  const collinear = [
    [0, 0],
    [10, 0],
    [20, 0],
    [30, 0],
  ] as const;
  const geo = cellGroundGeometry({ cells: [cellOf(collinear)], resolve: resolveWhite });
  for (let i = 0; i < geo.normals.length; i += 1) {
    assert.ok(Number.isFinite(geo.normals[i]!), `normal component ${i} is not finite`);
  }
  // And on a real parcel every normal is unit length — the divide actually happened.
  const real = cellGroundGeometry({ cells: [cellOf(L_SHAPE)], resolve: resolveWhite });
  for (let i = 0; i < real.triangles; i += 1) {
    const o = i * 9;
    const len = Math.hypot(real.normals[o]!, real.normals[o + 1]!, real.normals[o + 2]!);
    assert.ok(Math.abs(len - 1) < 1e-5, `face ${i} normal has length ${len}`);
  }
});

test('a custom depth reaches the walls, and the top stays on the ground plane', () => {
  const geo = cellGroundGeometry({ cells: [cellOf(SQUARE_CCW)], resolve: resolveWhite, depth: 7 });
  const ys = new Set<number>();
  for (let i = 0; i < geo.positions.length; i += 3) ys.add(geo.positions[i + 1]!);
  assert.deepEqual([...ys].sort((a, b) => a - b), [-7, 0]);
});

test('a MALFORMED ring still yields exactly n-2 pieces — the buffer is sized before it is filled', () => {
  // ⚠ THIS IS A BUFFER-SIZING INVARIANT, not a claim that the answer is meaningful. `positions`
  // is allocated up front from `cellGroundTriangles(n)`, so a ring that produced FEWER pieces
  // would leave zeroed floats at the tail — degenerate triangles collapsed at the world origin,
  // drawn, and attributable to nothing. A relaxed parcel should never be malformed, which is
  // exactly why nothing else here would notice if it were.
  //
  // The exact pieces are pinned because the fallback fan is otherwise unreachable: on a
  // well-formed ring the ear loop consumes everything and the fan emits nothing at all. These
  // three rings are the only inputs in this file that exercise it.
  const cases = [
    { label: 'bowtie (self-intersecting)', ring: [P(0, 0), P(10, 10), P(10, 0), P(0, 10)], areas: [-100, 100] },
    {
      label: 'a spike doubling back along an edge',
      ring: [P(0, 0), P(10, 0), P(5, 0), P(10, 10), P(0, 10)],
      areas: [-100, -50, 0],
    },
    { label: 'a repeated vertex', ring: [P(0, 0), P(0, 10), P(0, 10), P(10, 10), P(10, 0)], areas: [-100, 0, -100] },
  ];
  for (const { label, ring, areas } of cases) {
    const tris = triangulateRing(ring);
    assert.equal(tris.length, ring.length - 2, `${label}: wrong piece count — the buffer would not fill`);
    // And the geometry is DETERMINISTIC, pinned piece by piece: the fan's choice of vertices is
    // what a mutation of it changes, and a count alone cannot see that.
    assert.deepEqual(
      tris.map(([a, b, c]) => signedTriangleArea2(a, b, c)),
      areas,
      `${label}: the pieces changed`,
    );
  }
  // The buffer really is exactly filled — no zeroed tail.
  const geo = cellGroundGeometry({
    cells: [cellOf([[0, 0], [10, 10], [10, 0], [0, 10]])],
    resolve: resolveWhite,
  });
  assert.equal(geo.triangles, cellGroundTriangles(4));
  assert.equal(geo.positions.length, geo.triangles * 9);
});

test('a descriptor with NO ring at all is dropped, and does not become an empty parcel', () => {
  // ⚠ `c.points !== undefined && c.points.length >= 3` — two conditions, and forcing either one
  // true admits a descriptor with no ring, which then indexes `undefined` inside the
  // triangulation. Both arms are probed here because a single fixture only ever exercises one.
  const noPoints: InstanceDescriptor = {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    material: 'healthy',
  };
  const geo = cellGroundGeometry({ cells: [noPoints, cellOf(SQUARE_CCW)], resolve: resolveWhite });
  assert.equal(geo.cells, 1, 'a ringless descriptor was counted as a parcel');
  assert.equal(geo.triangles, cellGroundTriangles(4));
});
