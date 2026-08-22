// prop-layout.ts — WHERE props go, and nothing about what they look like. Pure geometry:
// the island's ground cells in, polylines / rings / scattered points out. Browser-free,
// node:test-provable, deterministic.
//
// WHY THIS IS ITS OWN MODULE, AND WHY IT EMITS NO MESHES. ADR-0406 unfenced decorative
// props on this surface, and a prop is two separable problems: what it looks like, and
// where it stands. Fusing them is how the arc's earlier passes got expensive — a fence
// generator that also decided the fence's route could not be re-routed without regrowing
// its geometry, and a placement bug and a modelling bug arrived indistinguishable. So the
// SITING lives here and is proved against measured island geometry in node, while the
// growing lives in the prop generators and is proved against triangle counts and normals.
// Nothing below imports three, react, or the DOM.
//
// ── THE y-IS-REALLY-z TRAP, WHICH THIS MODULE EXISTS PARTLY TO ABSORB ─────────────────
//
// `island-descriptors.ts` returns cells whose points are `{x, y}` in GROUND space, and the
// renderer maps that `y` to 3D `z`. So `GroundCell.points[].y` IS the depth axis, already
// unprojected — it is not a screen y and it must never be treated as one. Every downstream
// consumer that re-encountered this convention re-encountered the trap with it.
//
// `layoutCells` therefore converts ONCE, on the way in, and everything after it speaks
// `{x, z}` — the same basis `landHeight(x, z)` takes. That is the whole reason `LayoutCell`
// exists rather than this module operating on `GroundCell` directly: a prop generator that
// only ever sees `GPoint` cannot make the mistake, because the axis it would have to
// misread is not present in any type it touches.
//
// ── WHY EVERY LOOP IS CHAINED UNDIRECTED ──────────────────────────────────────────────
//
// MEASURED, NOT HYPOTHETICAL. The island fixture's cell winding is MIXED: 68 cells have a
// positive `signedArea2` and 96 negative. The relaxed substrate emits each cell's outline
// in whatever order its decomposition produced, and nothing downstream ever normalised it.
//
// The consequence is that the obvious rim walk — follow `points[i] -> points[i+1]` and
// chase the matching directed half-edge — CANNOT CLOSE. Measured on this fixture and pinned
// in the test: only 49 of the 52 rim vertices have an outgoing directed rim edge at all, and
// the longest directed run strands after 29 of 52. It does not throw and it does not look
// wrong: it returns a perfectly plausible open polyline, which, handed to a fence generator,
// puts a wall around half the island and reads as an art choice. That is the single most
// expensive failure shape available here, so nothing below uses edge DIRECTION at all: edges
// are identified by their unordered vertex pair, chained by vertex adjacency, and the walk
// asserts that every vertex has degree exactly 2 and that one circuit visits all of them.
//
// ── WHY VERTEX IDENTITY IS A ROUNDED KEY ──────────────────────────────────────────────
//
// The relaxed substrate interns its vertices, so two cells sharing a corner start out
// bit-equal — but every point on this path has been through `unprojectGround`, which
// divides by sin(20 degrees) and leaves a floating-point tail. Float equality then fails on
// corners that ARE the same corner, every shared edge reads as two rim edges, and the rim
// comes back as 164 disconnected quads. Rounding to 1e-3 of a ground unit absorbs the tail
// without ever merging two genuinely distinct corners: the closest authored vertices on
// this island are ~1.5 units apart, three orders of magnitude clear. This is the same
// tolerance and the same reasoning as `land-definition.ts`'s own `vertexKey`, restated here
// rather than imported because that one is private to its module and keyed on `{x, y}`.

import type { GroundCell } from './island-descriptors.js';
import { LAND_RELIEF_AMPLITUDE, landHeight, signedArea2 } from './land-definition.js';
import { mulberry32 } from './mesh-kit.js';

// ---------------------------------------------------------------------------
// 0. THE SPACE
// ---------------------------------------------------------------------------

/** A ground-space point. x east, z south — the space `landHeight(x, z)` takes. */
export interface GPoint {
  x: number;
  z: number;
}

/** Every cell's outline in `{x, z}`, plus its parcel — the form the rest of this module
 *  works in. Converting once here is what stops the y-is-really-z trap being re-encountered
 *  downstream (see the header). */
export interface LayoutCell {
  points: GPoint[];
  parcel: string | undefined;
  status: string;
  cellId: string | undefined;
}

/** The island's ground cells, converted into this module's basis. The ONLY place the
 *  `y`-means-`z` identity is applied — every other function here takes `GPoint`. */
export function layoutCells(cells: readonly GroundCell[]): LayoutCell[] {
  return cells.map((c) => ({
    points: c.points.map((p) => ({ x: p.x, z: p.y })),
    parcel: c.parcel,
    status: c.status,
    cellId: c.cellId,
  }));
}

// ---------------------------------------------------------------------------
// 1. SMALL SHARED GEOMETRY
// ---------------------------------------------------------------------------

/** Below this the two points are the same point for every purpose in this module. */
const EPS = 1e-9;

function clone(p: GPoint): GPoint {
  return { x: p.x, z: p.z };
}

function dist(a: GPoint, b: GPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Twice the signed polygon area, in the `(x, z)` basis.
 *
 *  DELEGATES rather than restating the shoelace sum, so the two can never drift — and the
 *  `z -> y` map here is the one place in this module that touches the old convention at
 *  all, which is exactly where a reader should expect to find it. */
function signedArea2G(loop: readonly GPoint[]): number {
  return signedArea2(loop.map((p) => ({ x: p.x, y: p.z })));
}

function boundsOf(points: readonly GPoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ, w: maxX - minX, h: maxZ - minZ };
}

/** The exact polygon centroid of one ring (the first-moment formula, not the vertex mean).
 *  Winding-independent: the signed area appears in numerator and denominator alike. */
function ringCentroid(loop: readonly GPoint[]): GPoint {
  const n = loop.length;
  if (n === 0) return { x: 0, z: 0 };
  let cx = 0;
  let cz = 0;
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    const cross = a.x * b.z - b.x * a.z;
    a2 += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  if (Math.abs(a2) < EPS) {
    // A degenerate ring (collinear, or a single repeated point) has no first moment — fall
    // back to the vertex mean rather than dividing by zero and returning NaN, because a NaN
    // point propagates silently into every prop sited from it.
    let mx = 0;
    let mz = 0;
    for (const p of loop) {
      mx += p.x;
      mz += p.z;
    }
    return { x: mx / n, z: mz / n };
  }
  return { x: cx / (3 * a2), z: cz / (3 * a2) };
}

// ---------------------------------------------------------------------------
// 2. BOUNDARY LOOPS — the rim, and each parcel's outline
// ---------------------------------------------------------------------------

/** Vertex identity, rounded to 1e-3 of a ground unit. See the header for why float equality
 *  is not an option here and why 1e-3 cannot over-merge on this island. */
function vertexKey(p: GPoint): string {
  return `${Math.round(p.x * 1000)},${Math.round(p.z * 1000)}`;
}

/** An UNORDERED edge key. The direction is thrown away deliberately: cell winding is mixed
 *  on this island, so the same physical edge is emitted in opposite directions by its two
 *  owners and a directed key would never match them up. */
function edgeKey(a: GPoint, b: GPoint): string {
  const ka = vertexKey(a);
  const kb = vertexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Everything the boundary walk needs to know about the cells it is walking around, indexed
 *  the way it needs it. Built in ONE pass over the cells, because three separate passes over
 *  164 quads is three chances for two of them to disagree about what an edge is. */
interface BoundaryIndex {
  /** vertexKey -> the point itself, so the walk can emit coordinates. */
  pointOf: Map<string, GPoint>;
  /** edgeKey -> its two endpoint keys. */
  endsOf: Map<string, [string, string]>;
  /** Every edge owned by exactly ONE cell — i.e. the boundary of the region. Insertion
   *  order, so a boundary is a deterministic function of the cell order handed in. */
  boundary: string[];
  /** vertexKey -> the boundary edges meeting there. */
  boundaryAt: Map<string, string[]>;
  /** vertexKey -> for every cell touching that vertex, the pair of ITS edges that meet
   *  there. This is what resolves a pinch (see `pairBoundaryEdges`). */
  cellSpansAt: Map<string, [string, string][]>;
}

function indexBoundary(cells: readonly LayoutCell[]): BoundaryIndex {
  const pointOf = new Map<string, GPoint>();
  const endsOf = new Map<string, [string, string]>();
  const count = new Map<string, number>();
  const order: string[] = [];
  const cellSpansAt = new Map<string, [string, string][]>();

  for (const cell of cells) {
    const pts = cell.points;
    const n = pts.length;
    if (n < 3) continue;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const ka = vertexKey(a);
      const kb = vertexKey(b);
      pointOf.set(ka, clone(a));
      pointOf.set(kb, clone(b));
      const key = edgeKey(a, b);
      keys.push(key);
      if (!endsOf.has(key)) {
        endsOf.set(key, [ka, kb]);
        order.push(key);
      }
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    // Vertex i of this cell sits between edge i-1 and edge i. Recording that SPAN is what
    // lets the walk tell, at a vertex several cells meet at, which of them are angularly
    // contiguous — and therefore which side of that vertex is land and which is water.
    for (let i = 0; i < n; i++) {
      const vk = vertexKey(pts[i]!);
      const span: [string, string] = [keys[(i - 1 + n) % n]!, keys[i]!];
      const list = cellSpansAt.get(vk);
      if (list) list.push(span);
      else cellSpansAt.set(vk, [span]);
    }
  }

  const boundary: string[] = [];
  const boundaryAt = new Map<string, string[]>();
  for (const key of order) {
    if (count.get(key) !== 1) continue;
    boundary.push(key);
    const [ka, kb] = endsOf.get(key)!;
    for (const vk of [ka, kb]) {
      const list = boundaryAt.get(vk);
      if (list) list.push(key);
      else boundaryAt.set(vk, [key]);
    }
  }

  return { pointOf, endsOf, boundary, boundaryAt, cellSpansAt };
}

/** The angle of the edge `key` as seen FROM vertex `vk` — the direction you would set off in
 *  if you left that vertex along that edge. */
function edgeAngleFrom(index: BoundaryIndex, vk: string, key: string): number {
  const [ka, kb] = index.endsOf.get(key)!;
  const here = index.pointOf.get(vk)!;
  const there = index.pointOf.get(ka === vk ? kb : ka)!;
  return Math.atan2(there.z - here.z, there.x - here.x);
}

/**
 * At every vertex, which boundary edge does the walk continue along?
 *
 * THE EASY CASE IS THE WHOLE ISLAND. On the rim, and on nine of this fixture's eleven
 * parcels, every boundary vertex has exactly TWO boundary edges and the answer is "the other
 * one". That is the case the undirected chaining in the header describes, and it needs no
 * geometry at all.
 *
 * THE HARD CASE IS A PINCH, AND IT IS REAL HERE — measured, not defensive. Parcels `cap-1`
 * and `cap-5` each have ONE vertex where four boundary edges meet: the capability is two
 * blobs of cells touching at a single corner, like two squares meeting on a diagonal. Their
 * outline is still ONE closed circuit — it just passes through that corner twice — and a
 * degree-2-only walk cannot express that, so an earlier draft of this module threw on 2 of
 * 11 capabilities and would have left two of the island's parcels unfenceable.
 *
 * The resolution needs no orientation, which matters because cell winding here is mixed and
 * normalising it would be one more thing to get wrong. Around the pinch vertex the incident
 * cells form angular RUNS separated by GAPS, and the boundary crosses the gaps — so:
 *
 *   1. group the boundary edges at the vertex into runs, by walking the cell spans recorded
 *      above (two edges of the same cell are in the same run; a shared interior edge welds
 *      two cells into one run);
 *   2. sort the boundary edges by angle around the vertex — each run's two ends then land
 *      cyclically adjacent, because any boundary edge between them would have to cut through
 *      that run's own cells;
 *   3. pair each cyclically-consecutive pair that belongs to DIFFERENT runs. Those are
 *      exactly the gaps, and the boundary goes across a gap, never back through the land.
 *
 * Pairing THROUGH the cells instead — the intuitive-looking "leave by this cell's other
 * edge" — is the bug this replaced: it closes one blob and abandons the other, silently.
 */
function pairBoundaryEdges(index: BoundaryIndex, label: string): Map<string, Map<string, string>> {
  const pairs = new Map<string, Map<string, string>>();

  for (const [vk, atV] of index.boundaryAt) {
    const link = new Map<string, string>();
    const record = (a: string, b: string): void => {
      link.set(a, b);
      link.set(b, a);
    };

    if (atV.length === 2) {
      record(atV[0]!, atV[1]!);
      pairs.set(vk, link);
      continue;
    }
    if (atV.length % 2 !== 0) {
      throw new Error(
        `${label}: vertex ${vk} has ${atV.length} boundary edges — an odd count means the ` +
          'region is not a closed area there, so no loop through it is well defined',
      );
    }

    // (1) runs: union the two edges every incident cell spans at this vertex.
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      let root = parent.get(k) ?? k;
      while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root;
      parent.set(k, root);
      return root;
    };
    const union = (a: string, b: string): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const [e1, e2] of index.cellSpansAt.get(vk) ?? []) union(e1, e2);

    // (2) angular order.
    const sorted = [...atV].sort(
      (a, b) => edgeAngleFrom(index, vk, a) - edgeAngleFrom(index, vk, b),
    );

    // (3) pair across the gaps.
    let paired = 0;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!;
      const b = sorted[(i + 1) % sorted.length]!;
      if (find(a) === find(b)) continue;
      record(a, b);
      paired += 1;
    }
    if (paired * 2 !== atV.length) {
      throw new Error(
        `${label}: vertex ${vk} has ${atV.length} boundary edges that resolve into ` +
          `${paired} crossing(s) — the land around it is not a set of separated wedges, so ` +
          'which way the boundary continues there is genuinely ambiguous',
      );
    }
    pairs.set(vk, link);
  }

  return pairs;
}

/**
 * Chain a region's boundary edges into ONE ordered closed loop.
 *
 * THROWS RATHER THAN RETURNING A PARTIAL LOOP, and that is the whole point of the function.
 * A silent partial loop is the failure this module was written to make impossible: it comes
 * back as a well-formed polyline that puts a wall around two-thirds of the island and reads
 * as a deliberate art choice, so nobody ever looks for a bug.
 *
 * The walk itself consults NO EDGE DIRECTION — see the header. It steps from edge to edge
 * through the pairing above, which is derived from vertex identity and (only at a pinch)
 * from angle. Cell winding is mixed on this island, so any use of `points[i] -> points[i+1]`
 * direction would be reading a coin flip.
 */
function chainBoundary(cells: readonly LayoutCell[], label: string): GPoint[] {
  const index = indexBoundary(cells);
  const { boundary, endsOf, pointOf } = index;
  if (boundary.length < 3) {
    throw new Error(
      `${label}: only ${boundary.length} boundary edge(s) — a closed loop needs at least 3`,
    );
  }
  const pairs = pairBoundaryEdges(index, label);

  const firstEdge = boundary[0]!;
  let edge = firstEdge;
  let from = endsOf.get(firstEdge)![0];
  const loop: GPoint[] = [];
  let traversed = 0;

  for (;;) {
    loop.push(clone(pointOf.get(from)!));
    const [ka, kb] = endsOf.get(edge)!;
    const to = ka === from ? kb : ka;
    traversed += 1;

    const next = pairs.get(to)?.get(edge);
    if (next === undefined) {
      throw new Error(
        `${label}: the boundary dead-ends at ${to} — nothing continues the loop from there`,
      );
    }
    edge = next;
    from = to;
    if (edge === firstEdge) break;
    if (traversed > boundary.length) {
      // Unreachable while every pairing is an involution, but a walk that cannot terminate
      // is the one bug that hangs a build instead of failing it.
      throw new Error(`${label}: the boundary walk did not terminate`);
    }
  }

  if (traversed !== boundary.length) {
    throw new Error(
      `${label}: the walk closed after ${traversed} of ${boundary.length} boundary edges — ` +
        'the boundary is more than one loop (a hole, or a disconnected region), and returning ' +
        'the first one would silently fence off part of the island',
    );
  }
  return loop;
}

/** The island's outer perimeter as ONE ordered closed loop, walked undirected.
 *  Throws with a clear message if the rim is not a single simple loop — a silent partial
 *  loop would put a wall around two-thirds of the island and read as an art choice. */
export function rimLoop(cells: readonly LayoutCell[]): GPoint[] {
  return chainBoundary(cells, 'rimLoop');
}

/** The perimeter of one parcel (capability), as an ordered closed loop, same construction.
 *  A parcel that is two blobs of cells touching at ONE corner comes back as one circuit
 *  passing through that corner twice — measured, and true of `cap-1` and `cap-5` on this
 *  fixture. A parcel in two genuinely SEPARATE pieces throws, because a capability drawn as
 *  two islands is a substrate fact worth surfacing rather than one to average over. */
export function parcelLoop(cells: readonly LayoutCell[], parcel: string): GPoint[] {
  const mine = cells.filter((c) => c.parcel === parcel);
  if (mine.length === 0) throw new Error(`parcelLoop: no cells belong to parcel ${parcel}`);
  return chainBoundary(mine, `parcelLoop(${parcel})`);
}

// ---------------------------------------------------------------------------
// 3. LOOP OPERATIONS — inset, resample, smooth
// ---------------------------------------------------------------------------

/**
 * Which perpendicular points INTO this loop: +1 when the left-hand perpendicular does, -1
 * when the right-hand one does.
 *
 * DERIVED, NEVER ASSUMED. Ground `(x, y)` maps to 3D `(x, z)` and flips handedness, so "the
 * left-hand perpendicular is the inward one" is true for exactly half the loops on this
 * island and there is nothing in the data that announces which half — the same trap
 * `land-definition.ts` names, which culled every top face on the first island render.
 *
 * It is decided ONCE PER LOOP from the signed area, not per vertex from a dot against the
 * centroid. The per-vertex form is what `land-definition.ts` uses and is right for its job
 * (a single small cell, convex, offsetting toward its own middle), but it is WRONG at a
 * reflex corner of a big non-convex ring: there the inward direction points AWAY from the
 * centroid, so a centroid dot flips the sign at exactly the corners that matter and the
 * inset turns itself inside out at every notch — and this island's rim has notches. The
 * signed area is a global property of the ring and cannot disagree with itself. The centroid
 * vote survives only as the fallback for a ring too degenerate to have a signed area.
 */
function inwardSign(loop: readonly GPoint[]): number {
  const a2 = signedArea2G(loop);
  if (Math.abs(a2) > EPS) return a2 > 0 ? 1 : -1;
  const c = ringCentroid(loop);
  let vote = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    vote += -(b.z - a.z) * (c.x - mx) + (b.x - a.x) * (c.z - mz) >= 0 ? 1 : -1;
  }
  return vote >= 0 ? 1 : -1;
}

/** The unit inward normal of the edge `a -> b`, given the loop's inward sign. */
function inwardNormal(a: GPoint, b: GPoint, sign: number): GPoint {
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const len = Math.hypot(ex, ez) || 1;
  return { x: (sign * -ez) / len, z: (sign * ex) / len };
}

/**
 * The sharpest corner an exact miter is allowed to be computed at.
 *
 * The exact inset of a corner sits at `d / cos(half-angle)` along the bisector, which blows
 * up as the corner sharpens: at a 20-degree corner it is 5.8x `d`, and the "inset" vertex
 * shoots across the island as a spike. 0.35 caps that at ~2.9x `d` (a corner of about 41
 * degrees). Below the cap the offset at that ONE corner is no longer exactly `d`, which is
 * the right trade: a bounded shape that is slightly under-inset in a notch is usable, and a
 * spike is not. The island rim's corners are all far shallower than this, so the clamp is
 * dormant there and exists for parcel loops, which do have slivers.
 */
const MIN_MITER_COS = 0.35;

/** A closed loop pulled INWARD by `d` units, offsetting each vertex along the angle bisector
 *  of its two edges. */
export function insetLoop(loop: readonly GPoint[], d: number): GPoint[] {
  const n = loop.length;
  if (n < 3) return loop.map(clone);
  const sign = inwardSign(loop);
  const out: GPoint[] = [];
  for (let i = 0; i < n; i++) {
    const previous = loop[(i - 1 + n) % n]!;
    const current = loop[i]!;
    const next = loop[(i + 1) % n]!;
    const n1 = inwardNormal(previous, current, sign);
    const n2 = inwardNormal(current, next, sign);
    let bx = n1.x + n2.x;
    let bz = n1.z + n2.z;
    const blen = Math.hypot(bx, bz);
    if (blen < 1e-6) {
      // The two edges double straight back on each other, so there is no bisector. Offset
      // along one edge's normal: any answer here is arbitrary, but a NaN is not an answer.
      bx = n1.x;
      bz = n1.z;
    } else {
      bx /= blen;
      bz /= blen;
    }
    const cos = Math.abs(bx * n1.x + bz * n1.z);
    const scale = d / Math.max(cos, MIN_MITER_COS);
    out.push({ x: current.x + bx * scale, z: current.z + bz * scale });
  }
  return out;
}

/** Total arc length of a polyline. */
export function pathLength(points: readonly GPoint[], closed = false): number {
  const n = points.length;
  if (n < 2) return 0;
  let total = 0;
  for (let i = 0; i + 1 < n; i++) total += dist(points[i]!, points[i + 1]!);
  if (closed) total += dist(points[n - 1]!, points[0]!);
  return total;
}

export interface PointAtResult { point: GPoint; dir: GPoint }

/** The point at arc-length `t` (0..1) along a polyline, plus the unit direction there.
 *  `t` outside 0..1 is CLAMPED rather than wrapped, so a rounding overshoot at the end of a
 *  resample lands on the last vertex instead of teleporting back to the first. */
export function pointAt(
  points: readonly GPoint[],
  t: number,
  closed = false,
): PointAtResult {
  const n = points.length;
  if (n === 0) return { point: { x: 0, z: 0 }, dir: { x: 1, z: 0 } };
  if (n === 1) return { point: clone(points[0]!), dir: { x: 1, z: 0 } };

  const total = pathLength(points, closed);
  if (total < EPS) return { point: clone(points[0]!), dir: { x: 1, z: 0 } };

  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  let target = clamped * total;

  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const len = dist(a, b);
    if (len < EPS) continue;
    if (target <= len || i === segments - 1) {
      const f = Math.min(1, Math.max(0, target / len));
      return {
        point: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f },
        dir: { x: (b.x - a.x) / len, z: (b.z - a.z) / len },
      };
    }
    target -= len;
  }
  // Only reachable if every segment was degenerate, which `total < EPS` already caught.
  return { point: clone(points[n - 1]!), dir: { x: 1, z: 0 } };
}

/**
 * Resample a polyline at uniform ARC LENGTH.
 *
 * The count is `round(total / spacing)` and the emitted step is then `total / count` rather
 * than `spacing` itself — so the points come out EXACTLY evenly spaced along the path at
 * approximately the requested pitch, instead of exactly the requested pitch with a ragged
 * remainder at the end. For a closed loop the second form is not even available: the
 * leftover shows up as one short segment across the seam, which on a fence is a visibly
 * wrong post and on a hedge is a gap.
 *
 * Note the emitted points are CHORDS of the path, so consecutive distances come out
 * marginally shorter than the step wherever the path turns between two samples. That deficit
 * is the path's curvature, not a defect — it is why the test below asserts a band rather
 * than an equality.
 */
export function resample(loop: readonly GPoint[], spacing: number, closed = false): GPoint[] {
  const n = loop.length;
  if (n === 0) return [];
  if (n === 1) return [clone(loop[0]!), clone(loop[0]!)];

  const total = pathLength(loop, closed);
  if (!(total > EPS) || !(spacing > 0)) {
    // Degenerate input still yields a segment, so a caller sweeping consecutive pairs never
    // meets a one-point "polyline" and indexes off the end.
    return [clone(loop[0]!), clone(loop[n - 1]!)];
  }

  // A closed ring needs 3 points to bound anything; an open path needs 1 interval, i.e. 2
  // points. Below those the result would no longer be the kind of shape that was asked for.
  const count = Math.max(closed ? 3 : 1, Math.round(total / spacing));
  const out: GPoint[] = [];
  const emit = closed ? count : count + 1;
  for (let i = 0; i < emit; i++) out.push(pointAt(loop, i / count, closed).point);
  if (!closed) {
    // Pin the ends exactly. `pointAt(1)` already lands there analytically, but a resampled
    // path whose end is 1e-13 off its input's end is a joint a later weld will miss.
    out[0] = clone(loop[0]!);
    out[out.length - 1] = clone(loop[n - 1]!);
  }
  return out;
}

/**
 * Smooth a polyline by Chaikin corner-cutting, `rounds` times. What turns a 52-sided polygon
 * into something that reads as a coast rather than as a board.
 *
 * WHY CHAIKIN AND NOT A SPLINE. Chaikin only ever moves a point to a convex combination of
 * two neighbours, so the result stays inside the original polygon's hull and can never bulge
 * OUTWARD across a boundary the loop was insetted to respect. A Catmull-Rom through the same
 * points overshoots at every corner, which on a parcel outline means the smoothed ring
 * crosses into the neighbouring capability — a fence that reads as being on the wrong side
 * of a boundary the island already asserts with colour.
 *
 * The cost is that it SHRINKS: every round cuts every corner off, so the enclosed area falls
 * toward the inscribed limit. Measured on this island's rim, one round retains 99.883% of
 * the area and two rounds 99.853% — about 29 square units out of 24,632, which at 2 px per
 * ground unit is invisible. The test pins those numbers so a future change of scheme cannot
 * quietly start eating the island.
 *
 * WHAT DOES NOT MOVE IS THE TOTAL TURNING, and that is worth knowing before anyone reaches
 * for it as a smoothness metric. Chaikin splits each corner into two corners whose turns SUM
 * to the original, so the rim's total absolute turning is 1559.92 degrees before smoothing
 * and 1559.92 degrees after any number of rounds — exactly. The number that falls is the
 * SHARPEST corner: 60.11 degrees on the raw rim, 30.36 after one round, 16.23 after two.
 * That is the honest measure of "reads as a coast rather than as a board", and it is what
 * the test asserts.
 */
export function smoothLoop(loop: readonly GPoint[], rounds = 1, closed = true): GPoint[] {
  let current = loop.map(clone);
  const passes = Math.max(0, Math.round(rounds));
  for (let r = 0; r < passes; r++) {
    const n = current.length;
    if (n < 3) break;
    const next: GPoint[] = [];
    const segments = closed ? n : n - 1;
    if (!closed) next.push(clone(current[0]!));
    for (let i = 0; i < segments; i++) {
      const a = current[i]!;
      const b = current[(i + 1) % n]!;
      next.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    if (!closed) next.push(clone(current[n - 1]!));
    current = next;
  }
  return current;
}

// ---------------------------------------------------------------------------
// 4. PARCELS — where a capability's middle is
// ---------------------------------------------------------------------------

/** Area-weighted centroid of a set of cells — where a parcel's "middle" is.
 *  Weighted by |area|, NOT by signed area: cell winding is mixed on this island (see the
 *  header), so a signed sum would cancel most of the island away and hand back a centroid
 *  drifting somewhere off the coast. */
export function centroidOf(cells: readonly LayoutCell[]): GPoint {
  let wx = 0;
  let wz = 0;
  let weight = 0;
  for (const cell of cells) {
    const area = Math.abs(signedArea2G(cell.points)) / 2;
    if (!(area > 0)) continue;
    const c = ringCentroid(cell.points);
    wx += c.x * area;
    wz += c.z * area;
    weight += area;
  }
  if (weight <= 0) {
    // Every cell degenerate: the mean of all vertices, rather than 0/0.
    let mx = 0;
    let mz = 0;
    let count = 0;
    for (const cell of cells) {
      for (const p of cell.points) {
        mx += p.x;
        mz += p.z;
        count += 1;
      }
    }
    return count > 0 ? { x: mx / count, z: mz / count } : { x: 0, z: 0 };
  }
  return { x: wx / weight, z: wz / weight };
}

/** One entry per parcel: its id, its cells, its centroid, its area, its status. */
export interface ParcelSummary {
  parcel: string;
  cells: LayoutCell[];
  centroid: GPoint;
  area: number;
  status: string;
}

/**
 * Every parcel on the island, SORTED BY ID.
 *
 * The sort is the point. Grouping produces a `Map`, whose iteration order is the order the
 * parcels' first cells happened to appear in the substrate's decomposition — stable for a
 * given fixture, and therefore stable enough to LOOK correct, right up until a cell order
 * changes and every prop sited "on the third parcel" moves. Sorting by id makes the order a
 * property of the data rather than of the traversal.
 *
 * Cells with no parcel are omitted: they belong to no capability, so there is no summary to
 * write about them.
 */
export function parcelSummaries(cells: readonly LayoutCell[]): ParcelSummary[] {
  const grouped = new Map<string, LayoutCell[]>();
  for (const cell of cells) {
    if (cell.parcel === undefined) continue;
    const list = grouped.get(cell.parcel);
    if (list) list.push(cell);
    else grouped.set(cell.parcel, [cell]);
  }
  const out: ParcelSummary[] = [];
  for (const [parcel, own] of grouped) {
    let area = 0;
    for (const cell of own) area += Math.abs(signedArea2G(cell.points)) / 2;
    out.push({
      parcel,
      cells: own,
      centroid: centroidOf(own),
      area,
      // Every cell of a parcel inherits the parcel group's status, so the first cell's IS
      // the parcel's. Taken positionally rather than voted on, because a disagreement here
      // would be a substrate bug worth seeing rather than one to smooth over.
      status: own[0]!.status,
    });
  }
  out.sort((a, b) => (a.parcel < b.parcel ? -1 : a.parcel > b.parcel ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// 5. INSIDE / DISTANCE / DEEPEST
// ---------------------------------------------------------------------------

/** Is a point inside a (possibly non-convex) closed ring? Even-odd ray crossing.
 *  Winding-AGNOSTIC by construction, which matters here: the rim's walk direction depends on
 *  which cell the substrate emitted first, so a winding-number test would need the
 *  orientation derived before it could answer, and this one does not. */
export function insideLoop(loop: readonly GPoint[], p: GPoint): boolean {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = loop[i]!;
    const b = loop[j]!;
    if (a.z > p.z !== b.z > p.z) {
      const x = a.x + ((p.z - a.z) / (b.z - a.z)) * (b.x - a.x);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Distance from a point to the nearest segment of a polyline. */
export function distanceToPath(points: readonly GPoint[], p: GPoint, closed = false): number {
  const n = points.length;
  if (n === 0) return Infinity;
  if (n === 1) return dist(points[0]!, p);
  let best = Infinity;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    let f = 0;
    if (len2 > EPS) {
      f = ((p.x - a.x) * ex + (p.z - a.z) * ez) / len2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
    }
    const d = Math.hypot(p.x - (a.x + ex * f), p.z - (a.z + ez * f));
    if (d < best) best = d;
  }
  return best;
}

/** How many times `deepestPoint` refines, and how wide each window is. Two rounds at 1/3
 *  take the coarse grid's ~5-unit cell on this island down to under 0.6 units — half the
 *  ~1-unit (2-pixel) delivery floor, so a third round could not move a delivered pixel. */
const DEEPEST_REFINE_ROUNDS = 2;
const DEEPEST_REFINE_STEPS = 9;

/**
 * The largest inscribed-ish point of a ring: the sample point furthest from the ring's
 * edges. Where a building goes so it does not overhang a boundary.
 *
 * SAMPLED, NOT SOLVED, and deliberately so. The exact pole of inaccessibility wants a
 * quadtree with a priority queue; this is a coarse grid plus two local refinements, which on
 * the island rim lands within a fraction of a ground unit of the true optimum — well under a
 * delivered pixel. Ties resolve to the first point in scan order, so the answer is a
 * deterministic function of the ring alone.
 *
 * A ring so thin that NO grid sample falls inside it returns the ring's centroid. That is a
 * point on no boundary rather than a good answer, and the caller can tell: its
 * `distanceToPath` will be near zero, which is the tell.
 */
export function deepestPoint(loop: readonly GPoint[], samples = 48): GPoint {
  if (loop.length < 3) return loop.length > 0 ? clone(loop[0]!) : { x: 0, z: 0 };
  const n = Math.max(4, Math.round(samples));
  const b = boundsOf(loop);
  const stepX = b.w / (n - 1);
  const stepZ = b.h / (n - 1);

  let best = ringCentroid(loop);
  let bestD = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = { x: b.minX + i * stepX, z: b.minZ + j * stepZ };
      if (!insideLoop(loop, p)) continue;
      const d = distanceToPath(loop, p, true);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  if (bestD === -Infinity) return best;

  let windowX = stepX;
  let windowZ = stepZ;
  for (let round = 0; round < DEEPEST_REFINE_ROUNDS; round++) {
    // Snapshot the centre: refining around a `best` that moves mid-scan would make the
    // answer depend on scan order in a way nobody would expect from the name.
    const centre = best;
    for (let i = 0; i < DEEPEST_REFINE_STEPS; i++) {
      for (let j = 0; j < DEEPEST_REFINE_STEPS; j++) {
        const p = {
          x: centre.x + ((i / (DEEPEST_REFINE_STEPS - 1)) * 2 - 1) * windowX,
          z: centre.z + ((j / (DEEPEST_REFINE_STEPS - 1)) * 2 - 1) * windowZ,
        };
        if (!insideLoop(loop, p)) continue;
        const d = distanceToPath(loop, p, true);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    windowX /= 3;
    windowZ /= 3;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 6. SCATTER AND ROUTE
// ---------------------------------------------------------------------------

/** Rejection attempts per requested point, plus a floor. BOUNDED ON PURPOSE: an
 *  over-constrained request (too many points, too large a gap) has no solution at all, and
 *  the honest answer is fewer points rather than a loop that never returns. A harness page
 *  that hangs is indistinguishable from one that crashed, and costs more to diagnose. */
const SCATTER_ATTEMPTS_PER_POINT = 40;
const SCATTER_ATTEMPT_FLOOR = 800;

/** A deterministic scatter of `count` points inside the island, at least `minGap` apart from
 *  each other, at least `edgeGap` from the rim, and at least `avoidGap` from any polyline in
 *  `avoid`. Poisson-ish by rejection with a bounded attempt budget; returns FEWER points
 *  rather than looping forever, and the caller can see how many it got. */
export function scatter(opts: {
  loop: readonly GPoint[];
  count: number;
  seed?: number;
  minGap?: number;
  edgeGap?: number;
  avoid?: readonly (readonly GPoint[])[];
  avoidGap?: number;
}): GPoint[] {
  const { loop } = opts;
  const count = Math.max(0, Math.round(opts.count));
  if (loop.length < 3 || count === 0) return [];

  const minGap = opts.minGap ?? 0;
  const edgeGap = opts.edgeGap ?? 0;
  const avoid = opts.avoid ?? [];
  const avoidGap = opts.avoidGap ?? 0;
  const rnd = mulberry32(opts.seed ?? 1);
  const b = boundsOf(loop);

  const budget = Math.max(SCATTER_ATTEMPT_FLOOR, count * SCATTER_ATTEMPTS_PER_POINT);
  const out: GPoint[] = [];
  for (let attempt = 0; attempt < budget && out.length < count; attempt++) {
    // BOTH randoms are drawn every attempt, BEFORE any rejection. Drawing them lazily would
    // make the stream depend on which test a candidate failed, so the same seed would give a
    // different scatter after an unrelated change to the order the filters run in.
    const rx = rnd();
    const rz = rnd();
    const p = { x: b.minX + rx * b.w, z: b.minZ + rz * b.h };
    if (!insideLoop(loop, p)) continue;
    if (edgeGap > 0 && distanceToPath(loop, p, true) < edgeGap) continue;
    let ok = true;
    for (const other of out) {
      if (dist(other, p) < minGap) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (avoidGap > 0) {
      for (const path of avoid) {
        if (distanceToPath(path, p, false) < avoidGap) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * A CLUMPED scatter: stands of points with bare ground between them, rather than points spread
 * evenly over the whole plot.
 *
 * THIS IS A SEPARATE FUNCTION FROM {@link scatter} BECAUSE THE DIFFERENCE IS THE WHOLE POINT,
 * and it is the finding the ISLANDERS research pass returned
 * (`docs/research/chapter2-islanders-canopy-2026-08-22/`). Its islands do not sprinkle trees at
 * a uniform density; they pack them into groves — twenty on one small plateau, none at all on
 * the next — and the empty ground is doing as much work as the trees. A uniform scatter of the
 * same COUNT reads as a green rash on the ground, which is exactly what this arc's 144 evenly
 * dispersed plants already delivered and every dressing had to thin away.
 *
 * Two stages, both deterministic from `seed`: the stand CENTRES are a `scatter` at a large
 * minimum gap, and each stand's members are rejection-sampled inside `spread` of its centre. The
 * island's own filters — inside the loop, off the rim, clear of the avoid-paths — apply to the
 * members, so a stand near the coast simply comes back smaller rather than hanging off the edge.
 *
 * ⚠ IT RETURNS FEWER POINTS THAN ASKED FOR RATHER THAN LOOPING, exactly as `scatter` does, and
 * for the same reason: an over-constrained request has no solution and a harness page that hangs
 * is indistinguishable from one that crashed.
 */
export function grove(opts: {
  loop: readonly GPoint[];
  /** How many stands. */
  clusters: number;
  /** Trees per stand. The actual count varies per stand across this inclusive range. */
  perCluster: readonly [number, number];
  /** A stand's radius, in ground units. */
  spread: number;
  /** Minimum tree-to-tree distance WITHIN and BETWEEN stands. */
  minGap: number;
  /** Minimum distance from the rim. */
  edgeGap?: number;
  /** Minimum distance between two stands' centres. Defaults to three spreads, which leaves a
   *  stand's width of bare ground between neighbours — the gap is the composition. */
  clusterGap?: number;
  avoid?: readonly (readonly GPoint[])[];
  avoidGap?: number;
  seed?: number;
}): GPoint[] {
  const seed = opts.seed ?? 3;
  const spread = Math.max(0.1, opts.spread);
  const centres = scatter({
    loop: opts.loop,
    count: Math.max(0, Math.round(opts.clusters)),
    seed,
    minGap: opts.clusterGap ?? spread * 3,
    edgeGap: opts.edgeGap ?? 0,
    ...(opts.avoid ? { avoid: opts.avoid } : {}),
    ...(opts.avoidGap === undefined ? {} : { avoidGap: opts.avoidGap }),
  });

  const rnd = mulberry32(seed + 977);
  const edgeGap = opts.edgeGap ?? 0;
  const avoid = opts.avoid ?? [];
  const avoidGap = opts.avoidGap ?? 0;
  const [lo, hi] = opts.perCluster;
  const out: GPoint[] = [];
  for (const centre of centres) {
    const want = Math.round(lo + (hi - lo) * rnd());
    const budget = Math.max(SCATTER_ATTEMPT_FLOOR, want * SCATTER_ATTEMPTS_PER_POINT);
    let got = 0;
    for (let attempt = 0; attempt < budget && got < want; attempt++) {
      // Drawn in a fixed order before any rejection, so the stream cannot depend on which
      // filter a candidate failed — the trap `scatter` documents, and it bites harder here
      // because a stand near the coast rejects far more candidates than one inland.
      const ra = rnd() * Math.PI * 2;
      // sqrt so the stand is uniform over its AREA rather than piling up at the centre, which
      // would deliver a bullseye of overlapping crowns with a thin fringe.
      const rr = Math.sqrt(rnd()) * spread;
      const p = { x: centre.x + Math.cos(ra) * rr, z: centre.z + Math.sin(ra) * rr };
      if (!insideLoop(opts.loop, p)) continue;
      if (edgeGap > 0 && distanceToPath(opts.loop, p, true) < edgeGap) continue;
      let ok = true;
      for (const other of out) {
        if (dist(other, p) < opts.minGap) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (avoidGap > 0) {
        for (const path of avoid) {
          if (distanceToPath(path, p, false) < avoidGap) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      out.push(p);
      got++;
    }
  }
  return out;
}

/** How many segments a meander is drawn with, and how far it may stray, by default. 12
 *  segments over a typical cross-parcel route puts a bend every ~5-15 units — 10 to 30
 *  delivered pixels, so the wander reads as a walked line rather than as a jagged one. */
const MEANDER_STEPS = 12;
const MEANDER_SWAY = 2.5;

/**
 * A route between two ground points that wanders slightly rather than running dead straight
 * — a walked path. Deterministic from `seed`; `sway` is the maximum lateral offset in units.
 *
 * TWO SCALES, ONE ENVELOPE. A single per-step random gives a route that reads as noise; a
 * single slow arc reads as a drawn curve. The sum of a slow half-wave and a smaller per-step
 * jitter reads as a path someone walked. Both are multiplied by `sin(pi * t)`, which is zero
 * at both ends — so the endpoints are EXACTLY `from` and `to` BY CONSTRUCTION rather than by
 * a correction applied afterwards, and two routes sharing an endpoint meet exactly.
 *
 * The two weights sum to 1, so `sway` really is the maximum lateral offset rather than a
 * scale factor on an unbounded sum.
 */
export function meander(
  from: GPoint,
  to: GPoint,
  opts: { seed?: number; steps?: number; sway?: number } = {},
): GPoint[] {
  const steps = Math.max(2, Math.round(opts.steps ?? MEANDER_STEPS));
  const sway = opts.sway ?? MEANDER_SWAY;
  const rnd = mulberry32(opts.seed ?? 1);

  // Every random is drawn UP FRONT in one fixed order, so the route is a function of the
  // seed and the step count alone — never of a branch taken while emitting.
  const jitter: number[] = [];
  for (let i = 0; i <= steps; i++) jitter.push(rnd() * 2 - 1);
  const phase = (jitter[0] ?? 0) * Math.PI;

  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  // A zero-length route has no perpendicular; pick one rather than dividing by zero.
  const px = len > EPS ? -dz / len : 0;
  const pz = len > EPS ? dx / len : 1;

  const out: GPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    if (i === 0) {
      out.push(clone(from));
      continue;
    }
    if (i === steps) {
      out.push(clone(to));
      continue;
    }
    const t = i / steps;
    const envelope = Math.sin(Math.PI * t);
    const slow = Math.sin(Math.PI * t + phase);
    const offset = sway * envelope * (0.6 * slow + 0.4 * (jitter[i] ?? 0));
    out.push({ x: from.x + dx * t + px * offset, z: from.z + dz * t + pz * offset });
  }
  return out;
}

/** Default ring resolution. 24 sides on a plaza of ~15 units puts a facet every ~4 units, or
 *  ~8 delivered pixels — below the point at which a straight edge is visible as one, and
 *  well above the ~1-unit floor where extra sides stop resolving at all. */
const RING_SIDES = 24;

/** A ring around `centre` of `radius`, `sides` long — for a plaza, a pond, a court.
 *  Emitted OPEN (the closing point is not repeated), the same convention every loop in this
 *  module uses — so `pathLength(ring(...), true)` is the circumference. */
export function ring(centre: GPoint, radius: number, sides = RING_SIDES, phase = 0): GPoint[] {
  const n = Math.max(3, Math.round(sides));
  const out: GPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push({ x: centre.x + Math.cos(a) * radius, z: centre.z + Math.sin(a) * radius });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. THE RELIEF FIELD, BOUND
// ---------------------------------------------------------------------------

/**
 * Bind the relief field once so callers pass one function around instead of an amplitude.
 * `heightAt(x, z)` is exactly `landHeight(x, z, amplitude)`.
 *
 * The point is not brevity — it is that a prop generator holding an AMPLITUDE has to know
 * that the amplitude is a property of the LAND and must match whatever the ground mesh was
 * built at. Two call sites defaulting independently is how a fence ends up floating a
 * quarter of a unit above the ground it is supposed to stand on: too small to see directly,
 * and large enough for a contact shadow to disagree with it.
 */
export function heightField(
  amplitude: number = LAND_RELIEF_AMPLITUDE,
): (x: number, z: number) => number {
  return (x, z) => landHeight(x, z, amplitude);
}
