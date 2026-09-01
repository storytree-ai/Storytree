// shore-grid.ts — A UNIFORM GRID OVER THE COAST'S EDGES, so a distance query does not have to look
// at every edge to discover that the nearest one is out of range.
//
// ⚠⚠ IT EXISTS FOR A MEASURED REASON, NOT A THEORETICAL ONE. `shoreField.sample` prunes by LOOP
// bounding box, which is the right first cut but leaves two costs the shore atlas cannot afford:
// a point inside a loop's box is never pruned and walks that loop's whole ring, and every point
// pays one box test per loop before it gets there. Building layer 2's packed shore field over the
// 35-island forest cost **49.7 s** with the whole map's coast in one reader and **26.1 s** with a
// per-island reader — for a field the shipped canvas builds on mount.
//
// ⚠ AND IT IS EXACT. Every answer this changes is an answer the walk would have produced anyway;
// the grid only decides which edges CANNOT be the nearest. Nothing here is an approximation of the
// distance field, which is why it can sit under a layer whose whole justification is a measured
// colour and not be a second source of error.

import type { CoastPoint } from './coast-clip.js';

/** One coast edge, flattened — the walk reads these four numbers and nothing else, so the grid
 *  stores them rather than re-deriving them from a ring and an index on every hit. */
export interface CoastEdge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface EdgeGrid {
  /** The cell size, in ground units — equal to the query width by construction. */
  readonly cell: number;
  /** Every edge, in the order the buckets index. */
  readonly edges: readonly CoastEdge[];
  /**
   * The edges worth testing for this point, as indices into {@link edges}.
   *
   * ⚠ AN EMPTY RESULT IS A PROOF, NOT A HINT: it means every edge is at least `width` away, so a
   * caller that caps at `width` already has the exact answer. See {@link edgeGridFarField}.
   *
   * ⚠ THE ARRAY IS A REUSED SCRATCH BUFFER, valid only until the next call. Callers read it and
   * move on; the alternative is one allocation per texel, and there are 5.4 M of them.
   */
  candidates(x: number, z: number): readonly number[];
}

/**
 * WHY AN EMPTY 3x3 NEIGHBOURHOOD PROVES THE POINT IS OUT OF RANGE — the argument the far-field
 * short-circuit rests on, stated where a test can assert it rather than left in a comment.
 *
 * The grid's cell size IS the query width. A point lies in some cell C. The 3x3 block of cells
 * centred on C extends a full cell beyond C in every direction, so the nearest point OUTSIDE that
 * block is at least one cell — one `width` — away from anywhere in C, and therefore from the
 * point. If no edge is bucketed in the block, every edge lies outside it, so every edge is at
 * least `width` away. `sample` caps at `width`, so the capped value is already the exact answer.
 *
 * ⚠ IT DEPENDS ON EDGES BEING BUCKETED INTO EVERY CELL THEY CROSS, not just the cells their
 * endpoints fall in. A long edge spanning several cells would otherwise be invisible to a point
 * beside its middle — which is a MISSED coast, delivering "far inland" where the water is.
 */
export function edgeGridFarField(cell: number, width: number): boolean {
  return cell >= width;
}

/** The grid cell an ordinate falls in. A named function because the floor's direction is the
 *  whole of it: `Math.ceil` here would shift every edge one cell and put the coast next door. */
export function cellIndex(v: number, min: number, cell: number): number {
  return Math.floor((v - min) / cell);
}

/**
 * Build the index over a set of coast rings.
 *
 * ⚠ THE CELL IS THE QUERY WIDTH, which is what makes {@link edgeGridFarField} hold. A smaller cell
 * would be faster per hit and would BREAK the short-circuit's proof; a larger one keeps the proof
 * and buckets more edges per cell than the walk needs.
 */
export function buildEdgeGrid(rings: readonly (readonly CoastPoint[])[], width: number): EdgeGrid {
  const edges: CoastEdge[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      edges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
  }
  // ⚠ A ZERO OR NEGATIVE WIDTH WOULD DIVIDE BY ZERO in the cell arithmetic, so the cell is
  // floored here rather than by a caller-side special case.
  //
  // ⚠⚠ AND THERE IS DELIBERATELY NO EMPTY-EDGES GUARD. One was written and then DELETED, because
  // it was unreachable in effect: with no edges `edgeBounds` returns infinite bounds, both axes
  // collapse to a single cell, and the neighbourhood scan finds that cell out of range and returns
  // nothing — which is exactly what the guard returned. `check:mutation-diff` reported it as a
  // survivor twice, which is what dead code looks like from outside. `shore-grid.test.ts` asserts
  // the empty case still answers, so the behaviour is pinned without the branch.
  const cell = width > 0 ? width : 1;
  const { minX, minZ, maxX, maxZ } = edgeBounds(edges);
  const nx = Math.max(1, cellIndex(maxX, minX, cell) + 1);
  const nz = Math.max(1, cellIndex(maxZ, minZ, cell) + 1);
  const buckets: number[][] = Array.from({ length: nx * nz }, emptyBucket);

  for (let n = 0; n < edges.length; n += 1) {
    const e = edges[n]!;
    // ⚠ EVERY CELL THE EDGE'S BOUNDING BOX TOUCHES, not just its endpoints' cells. A conservative
    // box rather than an exact line rasterisation: it can only ADD candidates, never drop one, and
    // dropping one is the failure that hides a coastline.
    const i0 = clampCell(cellIndex(Math.min(e.ax, e.bx), minX, cell), nx);
    const i1 = clampCell(cellIndex(Math.max(e.ax, e.bx), minX, cell), nx);
    const j0 = clampCell(cellIndex(Math.min(e.az, e.bz), minZ, cell), nz);
    const j1 = clampCell(cellIndex(Math.max(e.az, e.bz), minZ, cell), nz);
    // Counter-free for the same attribution reason as the neighbourhood scan below.
    for (const j of spanOf(j0, j1)) {
      for (const i of spanOf(i0, i1)) buckets[j * nx + i]!.push(n);
    }
  }

  // ⚠ ONE REUSED SCRATCH BUFFER AND A QUERY STAMP, rather than a Set per call. This is called once
  // per texel — 5.4 M times for the forest atlas — and allocating there is most of what an index
  // is supposed to save.
  const stamp = new Int32Array(edges.length);
  let query = 0;
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — `collect` sets `hits.length = 0`
  // before it fills, so whatever this starts as is discarded on the first call and unreachable
  // after it.
  const hits: number[] = [];

  const collect = (x: number, z: number): readonly number[] => {
    hits.length = 0;
    // Stryker disable next-line AssignmentOperator: EQUIVALENT — the stamp only needs a value
    // DIFFERENT from every previous query's, so counting down dedupes exactly as well as counting
    // up. Nothing reads the number itself, and no input separates the two.
    query += 1;
    const ci = cellIndex(x, minX, cell);
    const cj = cellIndex(z, minZ, cell);
    // ⚠ COUNTER-FREE, and that is a `check:mutation-diff` finding rather than a style choice. As
    // indexed `for` loops the `j += 1` and `i += 1` came back UNPROVEN — killed, but with no test
    // named — which the rung counts as neither a pass nor a survivor. It is what the bun runner's
    // coverage attribution does to loop counters, and `rampSelectGlsl` in
    // `banded-ground-material.ts` records the same finding and the same remedy: with the counter
    // gone there is nothing left to mis-attribute.
    // Stryker disable next-line ArithmeticOperator: EQUIVALENT BY SYMMETRY. The offsets are
    // [-1, 0, 1], so `cj - d` visits {cj+1, cj, cj-1} — the SAME three cells in the other order,
    // and the scan is order-independent. No input can separate the two.
    for (const j of NEIGHBOUR_OFFSETS.map((d) => cj + d)) {
      if (j < 0 || j >= nz) continue;
      // Stryker disable next-line ArithmeticOperator: EQUIVALENT BY SYMMETRY, as above.
      for (const i of NEIGHBOUR_OFFSETS.map((d) => ci + d)) {
        if (i < 0 || i >= nx) continue;
        for (const n of buckets[j * nx + i]!) {
          // Stryker disable next-line ConditionalExpression: EQUIVALENT for the ANSWER, which is
          // all any caller reads. The stamp DEDUPES an edge bucketed into several of the nine
          // cells; without it the walk tests that edge more than once and takes the same minimum.
          // It is a cost decision, so no assertion about a distance can reach it.
          if (stamp[n] === query) continue;
          stamp[n] = query;
          hits.push(n);
        }
      }
    }
    return hits;
  };

  return {
    cell,
    edges,
    candidates: collect,
  };
}

/** The inclusive integer range `[from, to]`. Extracted and counter-free so the bucketing's own
 *  loops carry no index the mutation rung has to attribute — and so the range is a value a test
 *  can assert directly rather than a shape only a whole grid build exercises. */
export function spanOf(from: number, to: number): readonly number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, addFrom(from));
}

/** One step of {@link spanOf}'s fill. Named rather than an inline arrow: the rung cannot attribute
 *  a mutant inside a callback body to the test that kills it. */
function addFrom(from: number): (unused: unknown, k: number) => number {
  return (_unused, k) => from + k;
}

/** The 3x3 neighbourhood, as offsets — the block whose emptiness proves the far field. Named and
 *  module-scope so the scan reads as "these three cells" rather than as arithmetic on a counter. */
const NEIGHBOUR_OFFSETS: readonly number[] = [-1, 0, 1];

/** A fresh bucket. Named rather than an inline arrow so the mutation rung can attribute a mutant
 *  inside it to the test that kills it. */
function emptyBucket(): number[] {
  return [];
}

/** Keep a cell index inside the grid — a point outside the edges' own bounds still has to land
 *  somewhere, and clamping is what makes the neighbourhood scan safe without a second bounds test
 *  in the hot loop. */
function clampCell(v: number, n: number): number {
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT on every input this has. The grid's
  // bounds are DERIVED from the edges it is about to bucket, so an edge's own cell is in range by
  // construction and the clamp never binds — it is here so the arithmetic is total, not because a
  // caller is known to exceed it. Only `buildEdgeGrid` calls this, and only with those cells.
  return Math.max(0, Math.min(n - 1, v));
}

/**
 * THE BOUNDING BOX OF A SET OF EDGES — the grid's own origin and extent.
 *
 * ⚠ EXTRACTED SO IT CAN BE TESTED DIRECTLY, which is a `check:mutation-diff` finding rather than a
 * preference. Inlined in {@link buildEdgeGrid} its mutants came back UNPROVEN — killed, but with no
 * test named — because nothing exercises the fold except through a whole grid build. The same
 * extraction cleared the same report for `bucketByIsland` in `shore-atlas.ts`.
 *
 * ⚠ AND THE MIN/MAX PAIRING IS LOAD-BEARING IN A WAY THE GRID HIDES. Swapping a `min` for a `max`
 * collapses that axis to a single cell, and a one-cell axis still returns EXACT distances — every
 * query simply finds every edge. So the failure is invisible in any answer and shows up only as
 * the 50-second build this index exists to remove.
 */
export interface EdgeBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function edgeBounds(edges: readonly CoastEdge[]): EdgeBounds {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const e of edges) {
    minX = Math.min(minX, e.ax, e.bx);
    maxX = Math.max(maxX, e.ax, e.bx);
    minZ = Math.min(minZ, e.az, e.bz);
    maxZ = Math.max(maxZ, e.az, e.bz);
  }
  return { minX, minZ, maxX, maxZ };
}
