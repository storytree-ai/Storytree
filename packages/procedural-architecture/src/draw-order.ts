// draw-order.ts — station 3 of the building factory: the explicit, deterministic
// draw-order pass (ADR-0217 decision 4).
//
// WHY THIS EXISTS. A part-tree derives POSITIONS; it does not derive DRAW ORDER.
// Five of the nineteen houses in docs/research/forest-house-art/ shipped a depth-order
// inversion, and TWO of those were introduced by a fix pass that corrected real faults.
// The checker was green throughout, because nothing in station 2 looks at occlusion.
// This file is the station that does.
//
// WHY NOT JUST SORT BETTER. Centroid sorting is not repairable by sorting better.
// Once two polygons interpenetrate — or one merely SPANS the other in depth, like a
// windmill sail blade sweeping past a balcony railing, its centroid back at the hub
// BEHIND the railing while its outboard half is in FRONT of it — no total order over
// whole polygons is correct. Some fragment is always painted wrong. Correctness needs
// the polygons SPLIT: the classic BSP result, and the precedent GL2PS follows with its
// BEST_ROOT heuristic.
//
// WHAT IT COSTS. Splitting inflates the polygon count, and ADR-0069's node-count
// ceiling is the thing to watch — so every entry point returns `stats` and the caller
// can see the inflation rather than discover it in a slow frame.
//
// Three exports, each usable alone:
//   viewOf             the (screen u, screen v, depth w) basis project() implies
//   orderForPainter    world polygons in, back-to-front fragments out
//   findDepthConflicts the oracle — where does an order paint a farther polygon over
//                      a nearer one? Empty means the order is honest.

import { DEG, VIEW, add3, dot3, faceNormal, len3, lerp3, scale3, sub3 } from './procedural-utils.js';
import type { Vec2, Vec3 } from './procedural-utils.js';

// ---------------------------------------------------------------------------
// The view basis
// ---------------------------------------------------------------------------

const COS30 = Math.cos(30 * DEG);
const SIN30 = Math.sin(30 * DEG);
const SQRT3 = Math.sqrt(3);

/** A point in view space: `u`/`v` are exactly what `project()` emits, `w` is depth. */
export interface ViewPoint {
  u: number;
  v: number;
  /** distance along the view axis — LARGER is nearer the camera. */
  w: number;
}

/**
 * The view-space coordinates of a world point.
 *
 * `project()` is an ORTHOGRAPHIC projection along `VIEW` = (1,1,1)/√3 — sliding a point
 * along that axis leaves both screen coordinates unchanged — so (u, v, w) is a genuine
 * 3D basis rather than a lossy flattening. That is what lets this file reason about
 * depth at a screen position instead of only at a centroid, and `core.test.ts` proves
 * the orthographality rather than trusting this comment.
 */
export function viewOf(p: Vec3): ViewPoint {
  return {
    u: (p.x - p.y) * COS30,
    v: (p.x + p.y) * SIN30 - p.z,
    w: (p.x + p.y + p.z) / SQRT3,
  };
}

// ---------------------------------------------------------------------------
// Planes and splitting
// ---------------------------------------------------------------------------

interface Plane {
  n: Vec3;
  d: number;
}

/** The supporting plane of a polygon, or null if it is degenerate (no area). */
function planeOf(pts: readonly Vec3[]): Plane | null {
  const first = pts[0];
  if (first === undefined || pts.length < 3) return null;
  const n = faceNormal(pts);
  // faceNormal normalises, so a zero-area polygon comes back as a zero-ish vector
  // rather than NaN. Either way it cannot define a plane.
  if (!Number.isFinite(n.x) || Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z) < 0.5) return null;
  return { n, d: dot3(n, first) };
}

const signedDistance = (p: Vec3, pl: Plane): number => dot3(pl.n, p) - pl.d;

/** A ring plus, per vertex, whether the edge LEAVING it was an edge of the original
 *  polygon. A cut edge is interior to the surface and must never be outlined. */
interface Ring {
  pts: Vec3[];
  /** `edges[i]` describes the edge from `pts[i]` to `pts[i+1]` */
  edges: boolean[];
}

/**
 * Split a polygon by a plane into its front and back parts. A vertex ON the plane
 * joins BOTH parts, which is what keeps the two fragments sharing an exact edge —
 * the alternative leaves a hairline gap the renderer would show as a seam.
 *
 * Edge provenance travels with the geometry, and that is load-bearing rather than
 * bookkeeping. A fragment that outlines its own cut edges draws a dark line across the
 * middle of a flat surface: the first build of this pass split a door into four and
 * painted a large X over it. Splitting has to be invisible, or station 3 just trades
 * one class of visible defect for another.
 *
 * Either side may come back with fewer than 3 points, meaning the polygon did not
 * actually straddle; callers drop those.
 */
function splitPolygon(pts: readonly Vec3[], edges: readonly boolean[] | undefined, pl: Plane, eps: number) {
  const front: Ring = { pts: [], edges: [] };
  const back: Ring = { pts: [], edges: [] };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // Both indices are in range by construction (`i` walks the array, the successor
    // wraps). The guard is what makes that provable rather than merely true.
    if (a === undefined || b === undefined) continue;
    const original = edges?.[i] ?? true;
    const da = signedDistance(a, pl);
    const db = signedDistance(b, pl);
    const sa = da > eps ? 1 : da < -eps ? -1 : 0;
    const sb = db > eps ? 1 : db < -eps ? -1 : 0;
    // Whichever side keeps `a`, the edge leaving it is part of the original edge a->b,
    // whether it runs the whole way to `b` or stops at the crossing point.
    if (sa >= 0) {
      front.pts.push(a);
      front.edges.push(original);
    }
    if (sa <= 0) {
      back.pts.push(a);
      back.edges.push(original);
    }
    if (sa !== 0 && sb !== 0 && sa !== sb) {
      const t = da / (da - db);
      const x = lerp3(a, b, t);
      // On the side `b` belongs to, the crossing point continues the original edge.
      // On the other side it begins the cut, which is new surface and not an outline.
      front.pts.push(x);
      front.edges.push(sb > 0 ? original : false);
      back.pts.push(x);
      back.edges.push(sb < 0 ? original : false);
    }
  }
  return { front, back };
}

/** How a whole polygon sits relative to a plane, without building the fragments. */
const enum Straddle {
  Coplanar = 0,
  Front = 1,
  Back = 2,
  Spanning = 3,
}

function straddleOf(pts: readonly Vec3[], pl: Plane, eps: number): Straddle {
  let seenFront = false;
  let seenBack = false;
  for (const p of pts) {
    const d = signedDistance(p, pl);
    if (d > eps) seenFront = true;
    else if (d < -eps) seenBack = true;
    if (seenFront && seenBack) return Straddle.Spanning;
  }
  if (seenFront) return Straddle.Front;
  if (seenBack) return Straddle.Back;
  return Straddle.Coplanar;
}

// ---------------------------------------------------------------------------
// The BSP
// ---------------------------------------------------------------------------

/** A polygon awaiting an order: world-space points plus whatever payload the caller
 *  needs carried through. Fragments inherit their parent's `meta` by reference. */
export interface OrderPoly<M> {
  pts: Vec3[];
  meta: M;
  /**
   * Rings cut OUT of `pts`, in the same plane — a wall's windows and doors.
   *
   * A holed polygon survives the pass whole whenever nothing forces it apart, which is
   * what lets the renderer draw it as one compound path. That matters for more than
   * node count: subdividing a facade into strips leaves a stroked seam across every
   * cut, and those seams are visible on the wall. The look is the metric (ADR-0214
   * decision 4), so the hole stays a hole for as long as it possibly can.
   */
  holes?: Vec3[][];
  /**
   * The same surface as hole-free simple polygons — a facade subdivision.
   *
   * Only consulted when this polygon genuinely has to be split, because a ring with a
   * hole in it cannot be cut by a plane and stay a ring. Supplying it is what keeps
   * `holes` from being a correctness compromise: the common case renders as one clean
   * path, and the rare interpenetrating case degrades to strips rather than to a lie.
   */
  parts?: Vec3[][];
  /**
   * Per vertex, whether the edge LEAVING it belongs to the polygon's real outline.
   *
   * Absent means every edge is real, which is true of everything handed in. Fragments
   * come back with this set, and a renderer that strokes outlines MUST honour it —
   * outlining a cut edge draws a line across the middle of a continuous surface.
   */
  edges?: boolean[];
}

export interface DrawOrderStats {
  /** polygons handed in */
  input: number;
  /** fragments handed back — `output - input` is the split inflation */
  output: number;
  /** how many split operations were performed */
  splits: number;
  /** deepest BSP recursion reached */
  depth: number;
}

export interface DrawOrderOptions {
  /**
   * Distance below which a point counts as ON a plane. The default is sized for a
   * building measured in world units of roughly a metre — loose enough that two faces
   * meant to be flush do not generate slivers, tight enough that a reveal reads.
   */
  eps?: number;
  /**
   * How many candidate splitting planes to weigh at each node (GL2PS's `BEST_ROOT`,
   * bounded). Candidates are drawn by a fixed stride, so the choice is deterministic;
   * raising this trades build time for fewer splits.
   */
  rootSamples?: number;
}

const DEFAULT_EPS = 1e-4;
const DEFAULT_ROOT_SAMPLES = 24;

interface Frag<M> {
  pts: Vec3[];
  meta: M;
  /** input position, the stable tie-break that keeps the whole pass deterministic */
  seq: number;
  holes?: Vec3[][];
  parts?: Vec3[][];
  edges?: boolean[];
}

const ON_SEGMENT_TOL = 1e-6;

/** Whether `p` lies on the segment a-b, within tolerance. */
function onSegment(p: Vec3, a: Vec3, b: Vec3): boolean {
  const ab = sub3(b, a);
  const l2 = dot3(ab, ab);
  if (l2 < ON_SEGMENT_TOL) return false;
  const t = dot3(sub3(p, a), ab) / l2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  return len3(sub3(p, add3(a, scale3(ab, t)))) <= 1e-6;
}

/**
 * Which of a facade strip's edges were real outline, and which are the subdivision's
 * own cut lines.
 *
 * Decided geometrically against the rings the strip came from — the facet outline and
 * its openings — rather than threaded out of the subdivision, so the two can never
 * disagree about which lines a viewer is supposed to see.
 */
function facadeEdgeFlags(strip: readonly Vec3[], outer: readonly Vec3[], holes: readonly Vec3[][] = []): boolean[] {
  const rings = [outer, ...holes];
  return strip.map((a, i) => {
    const b = strip[(i + 1) % strip.length];
    if (b === undefined) return false;
    for (const ring of rings) {
      for (let j = 0; j < ring.length; j++) {
        const p = ring[j];
        const q = ring[(j + 1) % ring.length];
        if (p === undefined || q === undefined) continue;
        if (onSegment(a, p, q) && onSegment(b, p, q)) return true;
      }
    }
    return false;
  });
}

interface Node<M> {
  plane: Plane;
  coplanar: Frag<M>[];
  front: Node<M> | null;
  back: Node<M> | null;
}

/**
 * Pick the splitting plane. GL2PS's BEST_ROOT: prefer the candidate that splits the
 * fewest polygons, because every split is a new node against ADR-0069's ceiling.
 * Ties break on the most balanced front/back partition, then on the lowest sequence
 * number — three levels of tie-break so the choice never depends on iteration luck.
 */
function chooseSplitter<M>(frags: readonly Frag<M>[], eps: number, samples: number): Plane | null {
  const stride = Math.max(1, Math.ceil(frags.length / Math.max(1, samples)));
  let best: { plane: Plane; splits: number; imbalance: number; seq: number } | null = null;

  for (let i = 0; i < frags.length; i += stride) {
    const candidate = frags[i];
    if (candidate === undefined) continue;
    const plane = planeOf(candidate.pts);
    if (plane === null) continue;

    let splits = 0;
    let front = 0;
    let back = 0;
    for (const other of frags) {
      if (other === candidate) continue;
      switch (straddleOf(other.pts, plane, eps)) {
        case Straddle.Spanning:
          splits++;
          break;
        case Straddle.Front:
          front++;
          break;
        case Straddle.Back:
          back++;
          break;
        default:
          break; // coplanar costs nothing either way
      }
    }
    const imbalance = Math.abs(front - back);
    if (
      best === null ||
      splits < best.splits ||
      (splits === best.splits && imbalance < best.imbalance) ||
      (splits === best.splits && imbalance === best.imbalance && candidate.seq < best.seq)
    ) {
      best = { plane, splits, imbalance, seq: candidate.seq };
    }
  }
  return best?.plane ?? null;
}

interface BuildStats {
  splits: number;
  depth: number;
}

function buildTree<M>(frags: Frag<M>[], eps: number, samples: number, depth: number, stats: BuildStats): Node<M> | null {
  if (frags.length === 0) return null;
  if (depth > stats.depth) stats.depth = depth;

  const plane = chooseSplitter(frags, eps, samples);
  if (plane === null) {
    // Every remaining fragment is degenerate — nothing can define a plane, and
    // nothing here has area to occlude anything. Drop them rather than invent an order.
    return null;
  }

  // This terminates because the plane always comes from one of these fragments, and
  // that fragment is by definition coplanar with it — so every level consumes at least
  // one fragment into `coplanar` and neither child can be the whole set again.

  const coplanar: Frag<M>[] = [];
  const front: Frag<M>[] = [];
  const back: Frag<M>[] = [];

  for (const frag of frags) {
    switch (straddleOf(frag.pts, plane, eps)) {
      case Straddle.Coplanar:
        coplanar.push(frag);
        break;
      case Straddle.Front:
        front.push(frag);
        break;
      case Straddle.Back:
        back.push(frag);
        break;
      default: {
        // A ring with a hole in it cannot be cut by a plane and stay a ring, so a
        // holed polygon that must split first becomes its hole-free subdivision. Each
        // strip is then re-classified — most of them do not straddle at all.
        const exploded = frag.holes?.length && frag.parts?.length;
        const pieces: { pts: Vec3[]; edges: boolean[] | undefined }[] = exploded
          ? // A subdivision's own cut lines are interior to the wall, so only the edges
            // it inherited from the facet outline or an opening rim are real outline.
            (frag.parts ?? []).map((p) => ({ pts: p, edges: facadeEdgeFlags(p, frag.pts, frag.holes ?? []) }))
          : [{ pts: frag.pts, edges: frag.edges }];

        for (const piece of pieces) {
          const side = straddleOf(piece.pts, plane, eps);
          if (side !== Straddle.Spanning) {
            const kept: Frag<M> = { pts: piece.pts, meta: frag.meta, seq: frag.seq };
            if (piece.edges !== undefined) kept.edges = piece.edges;
            if (side === Straddle.Front) front.push(kept);
            else if (side === Straddle.Back) back.push(kept);
            else coplanar.push(kept);
            continue;
          }
          const parts = splitPolygon(piece.pts, piece.edges, plane, eps);
          stats.splits++;
          if (parts.front.pts.length >= 3) {
            front.push({ pts: parts.front.pts, meta: frag.meta, seq: frag.seq, edges: parts.front.edges });
          }
          if (parts.back.pts.length >= 3) {
            back.push({ pts: parts.back.pts, meta: frag.meta, seq: frag.seq, edges: parts.back.edges });
          }
        }
        break;
      }
    }
  }

  return {
    plane,
    coplanar,
    front: buildTree(front, eps, samples, depth + 1, stats),
    back: buildTree(back, eps, samples, depth + 1, stats),
  };
}

/**
 * Walk the tree back-to-front for an orthographic camera looking along `VIEW`.
 *
 * The camera sits at infinity on the positive side of any plane whose normal has a
 * positive dot with `VIEW`; for such a plane everything BEHIND it is farther, so the
 * back subtree paints first. That single test is the whole of painter's correctness
 * once the polygons no longer straddle.
 */
function walk<M>(node: Node<M> | null, out: Frag<M>[]): void {
  if (node === null) return;
  const cameraInFront = dot3(node.plane.n, VIEW) > 0;
  if (cameraInFront) {
    walk(node.back, out);
    out.push(...node.coplanar);
    walk(node.front, out);
  } else {
    walk(node.front, out);
    out.push(...node.coplanar);
    walk(node.back, out);
  }
}

export interface DrawOrderResult<M> {
  polys: OrderPoly<M>[];
  stats: DrawOrderStats;
}

/**
 * Order world-space polygons far-to-near, splitting any that interpenetrate.
 *
 * The result is a painter's order that is correct by construction rather than correct
 * on the models we happened to try: `findDepthConflicts` on the output is empty for
 * any input, which is the property `draw-order.test.ts` asserts.
 *
 * Cull backfaces BEFORE calling. A culled polygon is one fewer candidate plane and one
 * fewer thing to split, and a back face can never occlude anything the camera sees.
 */
export function orderForPainter<M>(polys: readonly OrderPoly<M>[], opts: DrawOrderOptions = {}): DrawOrderResult<M> {
  const eps = opts.eps ?? DEFAULT_EPS;
  const samples = opts.rootSamples ?? DEFAULT_ROOT_SAMPLES;
  const frags: Frag<M>[] = polys.map((p, seq) => {
    const f: Frag<M> = { pts: p.pts, meta: p.meta, seq };
    if (p.holes !== undefined) f.holes = p.holes;
    if (p.parts !== undefined) f.parts = p.parts;
    if (p.edges !== undefined) f.edges = p.edges;
    return f;
  });
  const stats: BuildStats = { splits: 0, depth: 0 };
  const tree = buildTree(frags, eps, samples, 0, stats);
  const ordered: Frag<M>[] = [];
  walk(tree, ordered);
  return {
    polys: ordered.map((f) => {
      const out: OrderPoly<M> = { pts: f.pts, meta: f.meta };
      // Holes only survive on a fragment that was never split — a split one has already
      // been replaced by its hole-free subdivision.
      if (f.holes !== undefined) out.holes = f.holes;
      if (f.edges !== undefined) out.edges = f.edges;
      return out;
    }),
    stats: { input: polys.length, output: ordered.length, splits: stats.splits, depth: stats.depth },
  };
}

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

/** One place where a draw order paints a farther polygon over a nearer one. */
export interface DepthConflict {
  /** index of the polygon drawn FIRST */
  earlier: number;
  /** index of the polygon drawn SECOND — the one wrongly on top */
  later: number;
  /** where on screen the inversion shows */
  at: Vec2;
  /** how far behind the later polygon sits, in world units */
  gap: number;
}

export interface ConflictOptions {
  /**
   * How far behind an earlier polygon a later one must sit before it counts. The
   * default follows the owner's sizing call for a top-down map view: silhouette-scale
   * inversions are in scope, sub-pixel ones are not.
   */
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 0.02;

/** Even-odd point-in-polygon against a projected ring. */
function contains(p: Vec2, ring: readonly Vec2[]): boolean {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}

/** A polygon's depth at a screen position, read off its supporting plane. */
interface DepthAt {
  ring: Vec2[];
  depth: (u: number, v: number) => number | null;
}

function depthReader(pts: readonly Vec3[]): DepthAt | null {
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];
  if (a === undefined || b === undefined || c === undefined) return null;
  const va = viewOf(a);
  const vb = viewOf(b);
  const vc = viewOf(c);
  // Solve w = alpha*u + beta*v + gamma through the three view-space points.
  const d1u = vb.u - va.u;
  const d1v = vb.v - va.v;
  const d1w = vb.w - va.w;
  const d2u = vc.u - va.u;
  const d2v = vc.v - va.v;
  const d2w = vc.w - va.w;
  const det = d1u * d2v - d1v * d2u;
  // A near-zero determinant means the polygon is edge-on to the camera: it covers no
  // screen area, so it can neither occlude nor be occluded.
  if (Math.abs(det) < 1e-9) return null;
  const alpha = (d1w * d2v - d1v * d2w) / det;
  const beta = (d1u * d2w - d1w * d2u) / det;
  return {
    ring: pts.map((p) => {
      const v = viewOf(p);
      return { x: v.u, y: v.v };
    }),
    depth: (u, v) => va.w + alpha * (u - va.u) + beta * (v - va.v),
  };
}

const centre2 = (ring: readonly Vec2[]): Vec2 => ({
  x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
  y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
});

/** Where two screen-space segments cross, or null if they do not. */
function segmentCross(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null; // parallel
  const ox = p3.x - p1.x;
  const oy = p3.y - p1.y;
  const t = (ox * d2y - oy * d2x) / den;
  const u = (ox * d1y - oy * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Points at which to compare two polygons' depths.
 *
 * Corners inside the other polygon are the obvious ones, but they are not enough: two
 * quads crossing like a plus sign overlap over a real area with NO corner of either
 * inside the other. So the edge crossings are collected too, and their mean — which
 * lies in the interior of the overlap — is the sample that actually discriminates.
 * That case is not exotic; it is a sail blade sweeping past a railing.
 */
function overlapSamples(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const samples: Vec2[] = [];
  for (const p of a) if (contains(p, b)) samples.push(p);
  for (const p of b) if (contains(p, a)) samples.push(p);

  const crossings: Vec2[] = [];
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    if (a0 === undefined || a1 === undefined) continue;
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j];
      const b1 = b[(j + 1) % b.length];
      if (b0 === undefined || b1 === undefined) continue;
      const x = segmentCross(a0, a1, b0, b1);
      if (x !== null) crossings.push(x);
    }
  }
  if (crossings.length >= 2) {
    const mid = centre2([...crossings, ...samples]);
    samples.push(mid);
    // The mean alone is not enough. Where two polygons cross symmetrically, their
    // centre sits exactly on the line where the depths are EQUAL — the one point in
    // the whole overlap that proves nothing. So probe outward from it as well, which
    // lands on both sides of any such line while staying inside the overlap.
    for (const c of crossings) {
      samples.push({ x: mid.x + (c.x - mid.x) * 0.6, y: mid.y + (c.y - mid.y) * 0.6 });
    }
  }
  return samples;
}

/**
 * The oracle: given polygons IN DRAW ORDER, find every place the order paints a
 * farther polygon over a nearer one.
 *
 * Sampling is by shared vertices and centroids rather than by rasterising, which is
 * what keeps this a pure unit test rather than an image diff — and it is exactly the
 * scale the owner scoped for: an inversion big enough to change a silhouette always
 * puts one polygon's corner inside the other.
 */
export function findDepthConflicts<M>(ordered: readonly OrderPoly<M>[], opts: ConflictOptions = {}): DepthConflict[] {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const readers = ordered.map((p) => depthReader(p.pts));
  const out: DepthConflict[] = [];

  for (let i = 0; i < readers.length; i++) {
    const A = readers[i];
    if (!A) continue;
    for (let j = i + 1; j < readers.length; j++) {
      const B = readers[j];
      if (!B) continue;
      // B is drawn after A, so wherever they overlap B must be the NEARER one.
      for (const s of overlapSamples(A.ring, B.ring)) {
        const wa = A.depth(s.x, s.y);
        const wb = B.depth(s.x, s.y);
        if (wa === null || wb === null) continue;
        if (wb < wa - tolerance) {
          out.push({ earlier: i, later: j, at: s, gap: wa - wb });
          break; // one witness per pair is enough to condemn the order
        }
      }
    }
  }
  return out;
}
