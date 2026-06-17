// River geometry — pure path primitives for the #/tree forest map.
//
// Extracted from TreeView so they can be unit-tested without the component.
// Everything here is deterministic (no Math.random): the world must render
// identically every time, so river paths are a pure function of the layout.

export interface Vec2 {
  x: number;
  y: number;
}

/** A dock on a loop: the point plus the loop's outward unit normal there. */
export interface LoopDock extends Vec2 {
  nx: number;
  ny: number;
}

/** An obstacle the river network routes AROUND: a centre with a keep-out radius
 *  (an island territory the river must not cut across). */
export interface Disk extends Vec2 {
  r: number;
}

/**
 * Where the ray from `origin` toward `toward` first crosses a closed point `loop`,
 * with the loop's OUTWARD unit normal there (oriented back toward `origin`, so for a
 * river docking onto a pond from OUTSIDE the pond the normal faces the approaching
 * river — exactly what rivermouthCubic's outward handle wants). This is the inland
 * cousin of rayCoastIntersect: it lets a river mouth dock on a pond's smoothed rim
 * the same way it docks on a coastline. Returns null when the ray misses the loop.
 * Pure, deterministic — no Math.random.
 */
export function rayPolyIntersect(origin: Vec2, toward: Vec2, loop: Vec2[]): LoopDock | null {
  const dirx = toward.x - origin.x;
  const diry = toward.y - origin.y;
  const dl = Math.hypot(dirx, diry) || 1;
  const ux = dirx / dl;
  const uy = diry / dl;
  let bestS = Infinity;
  let best: LoopDock | null = null;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    if (!a || !b) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const det = ex * uy - ux * ey;
    if (Math.abs(det) < 1e-6) continue; // parallel
    const wx = a.x - origin.x;
    const wy = a.y - origin.y;
    const s = (ex * wy - wx * ey) / det; // distance along the ray
    const r = (ux * wy - wx * uy) / det; // position along the segment
    if (s <= 0 || r < 0 || r > 1 || s >= bestS) continue;
    bestS = s;
    const el = Math.hypot(ex, ey) || 1;
    let nx = ey / el;
    let ny = -ex / el;
    // orient the normal AGAINST the ray (i.e. back toward the origin) → outward
    // from a loop whose interior the ray is entering.
    if (nx * ux + ny * uy > 0) {
      nx = -nx;
      ny = -ny;
    }
    best = { x: origin.x + ux * s, y: origin.y + uy * s, nx, ny };
  }
  return best;
}

/**
 * Even-odd ray-cast point-in-polygon test against a closed point `loop`. Used to
 * decide which relaxed substrate cells a pond/channel covers (so they can be
 * re-tinted as water — "cells become water"). Pure, deterministic.
 */
export function pointInPoly(p: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (!a || !b) continue;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Centroid (vertex average) of a point loop — a stable interior aim point. */
export function polyCentroid(loop: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  let k = 0;
  for (const p of loop) {
    if (!p) continue;
    x += p.x;
    y += p.y;
    k++;
  }
  return k ? { x: x / k, y: y / k } : { x: 0, y: 0 };
}

/**
 * A river segment's stroke width as a function of how much flow it carries.
 * `flow` 1 (or less) returns `base`; each extra unit of flow adds `step`, clamped
 * at `max`. This is what lets a MERGED trunk fatten with the number of tributaries
 * it gathers while a lone strand stays at the base width — the visual that sells a
 * confluence as a merge rather than as bundled parallel strands. Pure, deterministic.
 */
export function rampWidth(flow: number, base: number, step: number, max: number): number {
  return Math.min(max, base + Math.max(0, flow - 1) * step);
}

/** Evaluate a quadratic bézier P0→C→P1 at parameter t ∈ [0,1]. */
export function quadPt(p0: Vec2, c: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/**
 * A smooth OPEN SVG path through `points` — the open-curve cousin of
 * smoothLoopPath: quadratic segments whose controls are the interior vertices
 * and whose on-curve points are the segment midpoints, pinned to the EXACT first
 * and last point so a river starts/ends precisely on its dock and mouth.
 */
export function smoothOpenPath(points: Vec2[]): string {
  const n = points.length;
  const p0 = points[0];
  if (!p0) return '';
  const f = (v: Vec2): string => `${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
  if (n === 1) return `M ${f(p0)}`;
  const p1 = points[1];
  if (n === 2 && p1) return `M ${f(p0)} L ${f(p1)}`;
  let d = `M ${f(p0)}`;
  for (let i = 1; i <= n - 2; i++) {
    const c = points[i];
    const nxt = points[i + 1];
    if (!c || !nxt) continue;
    const target: Vec2 = i === n - 2 ? nxt : { x: (c.x + nxt.x) / 2, y: (c.y + nxt.y) / 2 };
    d += ` Q ${f(c)} ${f(target)}`;
  }
  return d;
}

/**
 * Sample a parametric centreline `curve(t)` (t ∈ [0,1]) at `n`+1 steps, push each
 * sample sideways along its unit normal by `dOf(t)`, and re-emit the result as a
 * smooth open path. This is the metro-lane primitive: several rivers sharing a
 * corridor offset the SAME centreline by different signed distances so they run
 * as evenly-spaced parallel lanes. To stop a tight bend from folding into a cusp
 * when offset past its radius of curvature, |dOf| is clamped per sample to a
 * fraction of the local radius (estimated from the Menger curvature of the three
 * neighbouring samples). Deterministic.
 */
export function offsetCurve(curve: (t: number) => Vec2, dOf: (t: number) => number, n = 16): string {
  const P: Vec2[] = [];
  for (let i = 0; i <= n; i++) P.push(curve(i / n));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const cur = P[i];
    const prev = P[Math.max(0, i - 1)];
    const next = P[Math.min(n, i + 1)];
    if (!cur || !prev || !next) continue;
    // unit tangent via central difference, then its left normal
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    let d = dOf(i / n);
    // curvature clamp: radius ≈ 1/κ, κ = 4·area / (|ab|·|bc|·|ac|) (Menger).
    const abx = cur.x - prev.x;
    const aby = cur.y - prev.y;
    const acx = next.x - prev.x;
    const acy = next.y - prev.y;
    const area = Math.abs(abx * acy - aby * acx) / 2;
    const lab = Math.hypot(abx, aby);
    const lbc = Math.hypot(next.x - cur.x, next.y - cur.y);
    const lac = Math.hypot(acx, acy);
    if (area > 1e-6 && lab > 1e-6 && lbc > 1e-6 && lac > 1e-6) {
      const radius = (lab * lbc * lac) / (4 * area);
      const maxD = 0.85 * radius;
      if (Math.abs(d) > maxD) d = Math.sign(d) * maxD;
    }
    out.push({ x: cur.x + nx * d, y: cur.y + ny * d });
  }
  return smoothOpenPath(out);
}

/** A deterministic [0,1) hash of an integer lattice index `i` under `seed`
 *  (mulberry32-style integer mix). Local to the meander noise so riverGeometry
 *  stays a pure module with no Math.random and no shared RNG state. */
function latticeHash(i: number, seed: number): number {
  let t = (Math.floor(i) + Math.imul(seed | 0, 0x9e3779b1) + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smooth 1-D value noise in [-1, 1] at position `p`, lattice seeded by `seed`:
 *  smoothstep-interpolated hashed values at the integer lattice points. */
function valueNoise1D(p: number, seed: number): number {
  const i = Math.floor(p);
  const f = p - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  const a = latticeHash(i, seed) * 2 - 1;
  const b = latticeHash(i + 1, seed) * 2 - 1;
  return a + (b - a) * u;
}

/**
 * Displace a routed river polyline sideways with smooth deterministic value-noise so
 * the channel MEANDERS like a real river instead of reading as a routed pipe — Red
 * Blob Games' river-meander idea ported to our SVG basin. The polyline is resampled
 * to `samples`+1 evenly arc-spaced points; each INTERIOR sample is pushed along its
 * local normal by `amp · noise(t·freq) · taper`, where `taper = sin(π·t)` pins BOTH
 * endpoints EXACTLY (a river still starts on its dock and ends on its mouth) and fades
 * the wiggle to zero at the ends so nothing kinks at a junction. `freq` is roughly the
 * number of meander lobes along the river; the seed (e.g. a hash of the edge's two
 * story ids) makes every river wiggle differently but identically on every render. The
 * result is meant to feed smoothOpenPath. `amp <= 0` (or fewer than two points) returns
 * the input UNCHANGED, so meander is a clean no-op when disabled. Deterministic.
 */
export function meanderPath(
  pts: Vec2[],
  seed: number,
  amp: number,
  freq = 1.6,
  samples = 24,
): Vec2[] {
  if (amp <= 0 || pts.length < 2) return pts;
  // cumulative arc length along the input polyline
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const prev = cum[i - 1] ?? 0;
    cum.push(a && b ? prev + Math.hypot(b.x - a.x, b.y - a.y) : prev);
  }
  const total = cum[cum.length - 1] ?? 0;
  if (total < 1e-6) return pts;
  // resample evenly by arc length
  const base: Vec2[] = [];
  let seg = 0;
  for (let s = 0; s <= samples; s++) {
    const d = (s / samples) * total;
    while (seg < pts.length - 2 && (cum[seg + 1] ?? 0) < d) seg++;
    const a = pts[seg];
    const b = pts[seg + 1] ?? a;
    if (!a || !b) continue;
    const segLen = (cum[seg + 1] ?? 0) - (cum[seg] ?? 0) || 1;
    const t = (d - (cum[seg] ?? 0)) / segLen;
    base.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  // displace interior samples along the local (left) normal of the resampled curve
  const out: Vec2[] = [];
  const n = base.length - 1;
  for (let s = 0; s <= n; s++) {
    const p = base[s];
    if (!p) continue;
    const prev = base[s - 1];
    const next = base[s + 1];
    if (s === 0 || s === n || !prev || !next) {
      out.push(p); // endpoints (and degenerate neighbours) stay put
      continue;
    }
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const u = s / n;
    const w = valueNoise1D(u * freq, seed) * amp * Math.sin(Math.PI * u);
    out.push({ x: p.x - ty * w, y: p.y + tx * w }); // left normal = (−ty, tx)
  }
  return out;
}

/** Perpendicular distance from `p` to the segment a→b, the foot point on the
 *  segment, and the clamped parameter t∈[0,1] of that foot. */
function segFoot(p: Vec2, a: Vec2, b: Vec2): { dist: number; foot: Vec2; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1e-9;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const foot = { x: a.x + abx * t, y: a.y + aby * t };
  return { dist: Math.hypot(p.x - foot.x, p.y - foot.y), foot, t };
}

/**
 * Shortest distance from point `p` to a closed point `loop`'s boundary — the
 * distance to its nearest edge. Used by the procedural pond placer to size a pond
 * to the open space at a candidate centre (the largest circle that fits on land is
 * bounded by the nearest coast edge). Pure, deterministic.
 */
export function distToLoop(p: Vec2, loop: Vec2[]): number {
  let best = Infinity;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    if (!a || !b) continue;
    const d = segFoot(p, a, b).dist;
    if (d < best) best = d;
  }
  return best;
}

/**
 * A polyline from `a` to `b` that detours AROUND a set of obstacle keep-out disks
 * (third-party island territories) so a river hugs the open water between islands
 * instead of cutting across an island that is neither its source nor its
 * destination. The worst-intruded obstacle whose nearest point lies strictly
 * WITHIN the span is detoured first — the path is pushed out past that disk on the
 * side it already favours (the smaller detour) — then each half is routed
 * recursively, so a whole CLUSTER of islands is skirted one disk at a time (where
 * `avoidanceBow`'s single bow gives up). Endpoints are preserved exactly.
 *
 * The detour vertex is pushed to `2·r − dist` from the centre, not just `r`: a
 * quadratic smoothing of the returned polyline (smoothOpenPath) pulls the curve
 * about halfway back toward the chord, so over-pushing by the intrusion keeps the
 * SMOOTHED river clear of the disk. Deterministic — no Math.random; the degenerate
 * "segment runs through the centre" case picks the chord's left normal, so the
 * detour side is stable rather than coin-flipped.
 */
export function routeAround(a: Vec2, b: Vec2, obstacles: Disk[], maxDepth = 6): Vec2[] {
  const worst = (p: Vec2, q: Vec2): { d: Disk; foot: Vec2; intr: number } | null => {
    let best: { d: Disk; foot: Vec2; intr: number } | null = null;
    for (const d of obstacles) {
      const { dist, foot, t } = segFoot(d, p, q);
      if (t <= 0.001 || t >= 0.999) continue; // grazes an endpoint — the neighbour span owns it
      const intr = d.r - dist;
      if (intr <= 0) continue; // already clear of this island
      if (!best || intr > best.intr) best = { d, foot, intr };
    }
    return best;
  };
  const route = (p: Vec2, q: Vec2, depth: number): Vec2[] => {
    const w = worst(p, q);
    if (!w || depth <= 0) return [p, q];
    const cx = w.d.x;
    const cy = w.d.y;
    const dist = Math.hypot(w.foot.x - cx, w.foot.y - cy);
    let dirx: number;
    let diry: number;
    if (dist < 1e-6) {
      // the segment runs through the centre — push along its left normal.
      const sx = q.x - p.x;
      const sy = q.y - p.y;
      const sl = Math.hypot(sx, sy) || 1;
      dirx = -sy / sl;
      diry = sx / sl;
    } else {
      dirx = (w.foot.x - cx) / dist;
      diry = (w.foot.y - cy) / dist;
    }
    const push = 2 * w.d.r - dist; // over-push so the smoothed curve still clears r
    const wp: Vec2 = { x: cx + dirx * push, y: cy + diry * push };
    return [...route(p, wp, depth - 1), ...route(wp, q, depth - 1).slice(1)];
  };
  return route(a, b, maxDepth);
}

/** The smallest unsigned angle between two bearings, in [0, π]. Wraps correctly
 *  across ±π, so it's the right "how far off the bay direction is this vertex"
 *  metric for the crescent-coast Gaussian. Pure, deterministic. */
export function angularDistance(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** The circular MEAN of a set of bearings — `atan2(Σ sinθ, Σ cosθ)`. Used to aim a
 *  bay at the average direction the island's rivers enter from, robust across the
 *  ±π wrap where a plain arithmetic mean would point the wrong way. Returns 0 for
 *  no angles. Pure, deterministic. */
export function circularMeanAngle(angles: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (sx === 0 && sy === 0) return 0;
  return Math.atan2(sy, sx);
}

/**
 * How big an island's lake should be for its river `degree` (the number of
 * connections — in + out — incident on the island). Area reads as proportional to
 * degree, so the RADIUS grows with `sqrt(degree)`: a degree-9 hub holds a clearly
 * bigger pool than a leaf without being nine times wider. `base` is the floor (a
 * degree-0 island still gets a visible pond), `gain` the px per unit √degree, `max`
 * the cap the land/aesthetics allow. Pure, deterministic.
 */
export function pondRadiusForDegree(degree: number, base: number, gain: number, max: number): number {
  const r = base + gain * Math.sqrt(Math.max(0, degree));
  return Math.min(max, Math.max(base, r));
}

/**
 * Grow a closed coast `loop` into a C of land that WRAPS an island's degree-sized
 * lake — the "create a c shape coastline / increase the land mass you need" owner
 * call, robust at any lake size. Every coast vertex nearer than `pondR + beach` to
 * `pondCenter` is pushed radially OUT (away from the lake centre) to exactly that
 * distance, so the shore bulges around the lake and holds it with a beach margin —
 * EXCEPT vertices in the seaward MOUTH sector (within `openHalf` radians of
 * `thetaBay` as seen from the lake centre), which are left untouched so the lake
 * stays OPEN to the sea on the side its rivers enter. The result is a crescent of
 * land hugging the lake with a river-entry mouth — a true C. Vertices already clear
 * of the lake are untouched, so a lake that fits leaves the coast unchanged. Meant
 * to be re-smoothed (Chaikin) by the caller. Pure, deterministic — no Math.random.
 */
export function embayCoast(
  loop: Vec2[],
  pondCenter: Vec2,
  pondR: number,
  beach: number,
  thetaBay: number,
  openHalf: number,
): Vec2[] {
  const want = pondR + beach;
  if (want <= 0) return loop.map((p) => ({ x: p.x, y: p.y }));
  return loop.map((p) => {
    const dx = p.x - pondCenter.x;
    const dy = p.y - pondCenter.y;
    const d = Math.hypot(dx, dy);
    if (d >= want || d < 1e-6) return { x: p.x, y: p.y };
    const bearing = Math.atan2(dy, dx);
    if (angularDistance(bearing, thetaBay) < openHalf) return { x: p.x, y: p.y }; // the mouth
    const s = want / d;
    return { x: pondCenter.x + dx * s, y: pondCenter.y + dy * s };
  });
}

/** A confluence-tree edge: water flows a→b carrying `flow` source tributaries
 *  (== how many of the network's rivers share this edge — which drives its width). */
export interface ConfluenceEdge {
  a: Vec2;
  b: Vec2;
  flow: number;
}

export interface ConfluenceNet {
  edges: ConfluenceEdge[];
  /** For each input head (by index) the edge indices its water traverses, in
   *  head→sink order. A downstream edge appears in EVERY head that fused into it —
   *  that shared geometry IS the merge (tributaries braiding into one stem). */
  routeOf: number[][];
}

/**
 * Build a drainage/confluence tree that MERGES a set of source `heads` into a
 * single trunk reaching `sink`. Repeatedly the two NEAREST active heads fuse at a
 * confluence point placed downstream (their midpoint pulled `pullFrac` of the way
 * toward the sink); the fused head carries their combined flow, and the loop
 * continues until one trunk runs to the sink. Rivers that fuse early then share
 * every edge below their confluence, so the network reads as tributaries braiding
 * into a main stem — the replacement for the parallel metro lanes that read as a
 * criss-cross tangle. Deterministic: nearest-pair ties break by index, no
 * Math.random. Returns empty for no heads; a lone head yields one head→sink edge.
 */
export function confluenceTree(heads: Vec2[], sink: Vec2, pullFrac = 0.3): ConfluenceNet {
  const edges: ConfluenceEdge[] = [];
  const routeOf: number[][] = heads.map(() => []);
  interface Cluster {
    pt: Vec2;
    flow: number;
    members: number[];
  }
  let active: Cluster[] = heads.map((h, i) => ({ pt: { x: h.x, y: h.y }, flow: 1, members: [i] }));
  const pushEdge = (from: Cluster, to: Vec2): void => {
    const idx = edges.length;
    edges.push({ a: from.pt, b: to, flow: from.flow });
    for (const k of from.members) routeOf[k]?.push(idx);
  };
  while (active.length > 1) {
    let bi = 0;
    let bj = 1;
    let bd = Infinity;
    for (let i = 0; i < active.length; i++) {
      const A = active[i];
      if (!A) continue;
      for (let j = i + 1; j < active.length; j++) {
        const B = active[j];
        if (!B) continue;
        const d2 = (A.pt.x - B.pt.x) ** 2 + (A.pt.y - B.pt.y) ** 2;
        if (d2 < bd) {
          bd = d2;
          bi = i;
          bj = j;
        }
      }
    }
    const A = active[bi];
    const B = active[bj];
    if (!A || !B) break;
    const midx = (A.pt.x + B.pt.x) / 2;
    const midy = (A.pt.y + B.pt.y) / 2;
    const m: Vec2 = { x: midx + (sink.x - midx) * pullFrac, y: midy + (sink.y - midy) * pullFrac };
    pushEdge(A, m);
    pushEdge(B, m);
    active = active.filter((_, idx) => idx !== bi && idx !== bj);
    active.push({ pt: m, flow: A.flow + B.flow, members: [...A.members, ...B.members] });
  }
  const root = active[0];
  if (root) pushEdge(root, sink);
  return { edges, routeOf };
}

/** One distributary of a source delta: the routed polyline of a confluence-tree
 *  edge (drawn source-ward → dest-ward) and the number of dests that share it —
 *  the Shreve count that drives a trunk's width, so the stem nearest the source
 *  (carrying every distributary) is the fattest. */
export interface DistributaryTrunk {
  pts: Vec2[];
  flow: number;
}

export interface Distributary {
  /** Per dest (same order as `dests`): the routed point chain SOURCE → … → dest,
   *  threading the shared confluence points. `chain[0]` is EXACTLY `source` and
   *  `chain.at(-1)` is EXACTLY `dests[i]` — so a far dependency rerouted into the
   *  delta is still traceable end to end (the endpoint guard the MST/hub-reroute
   *  threw away). A chain has ≥ 2 points. */
  chains: Vec2[][];
  /** Per confluence segment: its routed polyline (source-ward → dest-ward) and the
   *  flow it carries. The tributary chains and these trunks are cut from the SAME
   *  routed polylines, so on a shared stem their geometry is identical and a fat
   *  trunk drawn on top covers the braided tributaries exactly. */
  trunks: DistributaryTrunk[];
}

/**
 * A DISTRIBUTARY DELTA — the reverse of a confluence: ONE source fanning to many
 * `dests`, MERGING into a shared trunk near the source and FORKING toward the
 * destinations ("merge then break off at a point"). It runs confluenceTree with the
 * roles swapped (the dests are the heads, the source is the sink) and re-expresses
 * every head's route as a source→dest polyline, so the network reads as a river
 * leaving the source as one fat stem that progressively splits to reach each dest.
 *
 * Island avoidance is INJECTED: each confluence segment is handed to `route(a, b)`
 * (in production `routeAround` against the third-party islands, so the trunk skirts a
 * hub like the central drive-machinery chain instead of plowing through it — the
 * owner's "if the distance is far enough the river should opt to go around"); a test
 * can pass the identity `(a, b) => [a, b]` for straight segments. `route` MUST
 * preserve its endpoints (every router here does) — that's what keeps each chain's
 * ends pinned exactly on the source and the dest. Deterministic when `route` is.
 * Empty dests → empty delta; a lone dest → one source→dest chain.
 */
export function distributaryChains(
  source: Vec2,
  dests: Vec2[],
  pullFrac: number,
  route: (a: Vec2, b: Vec2) => Vec2[],
): Distributary {
  if (dests.length === 0) return { chains: [], trunks: [] };
  const net = confluenceTree(dests, source, pullFrac);
  // Route each tree edge ONCE, source-ward (`b`) → dest-ward (`a`), and cache it so
  // the tributary chains and the fat trunks read identical geometry on shared stems.
  const routed = net.edges.map((e) => {
    const seg = route(e.b, e.a);
    return seg.length >= 2 ? seg : [e.b, e.a];
  });
  const chains = dests.map((_, di) => {
    const eis = net.routeOf[di] ?? []; // dest → source order
    const pts: Vec2[] = [{ x: source.x, y: source.y }]; // start EXACTLY at the source
    for (let k = eis.length - 1; k >= 0; k--) {
      // walk source → dest
      const seg = routed[eis[k] ?? -1] ?? [];
      for (let j = 1; j < seg.length; j++) {
        const p = seg[j];
        if (p) pts.push(p); // skip the shared first point of each segment
      }
    }
    return pts; // ends EXACTLY at dests[di] (the head's tributary edge `a`)
  });
  const trunks: DistributaryTrunk[] = net.edges.map((e, ei) => ({
    pts: routed[ei] ?? [e.b, e.a],
    flow: e.flow,
  }));
  return { chains, trunks };
}

/**
 * The Euclidean minimum spanning tree over `pts` (Prim's algorithm, dense O(n²)),
 * returned as `n−1` index-pair edges `[i, j]` with `i < j`. This is the SKELETON of
 * the global river basin: it links every island to its nearest neighbours in one
 * connected, acyclic, organic network (a real watershed shape) — no parallel
 * strands, no crossings introduced by the tree itself. Deterministic: distance ties
 * break toward the lower index, so the tree never depends on Math.random. Returns
 * empty for fewer than two points.
 */
export function euclideanMST(pts: Vec2[]): Array<[number, number]> {
  const n = pts.length;
  if (n < 2) return [];
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity); // min dist² from each node to the tree
  const from = new Array<number>(n).fill(-1);
  best[0] = 0;
  const edges: Array<[number, number]> = [];
  for (let it = 0; it < n; it++) {
    let u = -1;
    let bd = Infinity;
    for (let v = 0; v < n; v++) {
      if (!inTree[v] && (best[v] ?? Infinity) < bd) {
        bd = best[v] ?? Infinity;
        u = v;
      }
    }
    if (u === -1) break;
    inTree[u] = true;
    const fu = from[u] ?? -1;
    if (fu >= 0) edges.push(fu < u ? [fu, u] : [u, fu]);
    const pu = pts[u];
    if (!pu) continue;
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const pv = pts[v];
      if (!pv) continue;
      const d2 = (pu.x - pv.x) ** 2 + (pu.y - pv.y) ** 2;
      if (d2 < (best[v] ?? Infinity)) {
        best[v] = d2;
        from[v] = u;
      }
    }
  }
  return edges;
}

/** One stream of the basin skeleton: tree edge (hub `a` → hub `b`) carrying `flow`
 *  accumulated drainage — the count drives the stroke width, so trunks near the
 *  foundations fatten and leaf twigs stay thin. */
export interface FlowEdge {
  a: number;
  b: number;
  flow: number;
}

/**
 * Per-edge DRAINAGE of a spanning `tree` (index-pair edges, e.g. from euclideanMST)
 * rooted at `root`: each edge carries the number of nodes in the subtree on its
 * far-from-root side, so the flow grows MONOTONICALLY toward the root. Rooted at the
 * map's foundation, this is exactly the classic river look — a fat main stem near
 * the base draining the whole basin, thinning to one-node twigs at the leaves —
 * which is what sells the merge as "thicker rivers where flow accumulates" rather
 * than as bundled strands of equal weight. Deterministic (DFS; no Math.random).
 * Nodes unreachable from `root` (a disconnected tree) get flow 0.
 */
export function treeDrainage(
  hubCount: number,
  tree: Array<[number, number]>,
  root: number,
): FlowEdge[] {
  const adj: Array<Array<{ to: number; e: number }>> = Array.from({ length: hubCount }, () => []);
  tree.forEach(([a, b], e) => {
    adj[a]?.push({ to: b, e });
    adj[b]?.push({ to: a, e });
  });
  const parent = new Array<number>(hubCount).fill(-1);
  const parentEdge = new Array<number>(hubCount).fill(-1);
  const seen = new Array<boolean>(hubCount).fill(false);
  const order: number[] = [];
  if (root >= 0 && root < hubCount) {
    seen[root] = true;
    const stack = [root];
    while (stack.length > 0) {
      const x = stack.pop();
      if (x === undefined) break;
      order.push(x);
      for (const { to, e } of adj[x] ?? []) {
        if (!seen[to]) {
          seen[to] = true;
          parent[to] = x;
          parentEdge[to] = e;
          stack.push(to);
        }
      }
    }
  }
  const size = new Array<number>(hubCount).fill(1);
  // Roll subtree sizes up from the leaves (reverse discovery order).
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i];
    if (v === undefined) continue;
    const p = parent[v];
    if (p !== undefined && p >= 0) size[p] = (size[p] ?? 1) + (size[v] ?? 1);
  }
  const flow = new Array<number>(tree.length).fill(0);
  for (let v = 0; v < hubCount; v++) {
    const e = parentEdge[v];
    if (e !== undefined && e >= 0) flow[e] = size[v] ?? 1;
  }
  return tree.map(([a, b], e) => ({ a, b, flow: flow[e] ?? 0 }));
}

/** A graph edge to bundle: an index pair into the `nodes` array. */
export interface BundleEdge {
  a: number;
  b: number;
}

/** Accumulated flow on one graph segment (a real edge `a`–`b`, `a < b`): how many
 *  of the network's edge paths route ALONG it — the Shreve-like count that drives a
 *  shared trunk's stroke width. */
export interface BundleSegment {
  a: number;
  b: number;
  flow: number;
}

export interface EdgeBundle {
  /** Per input edge (same order): its routed node-index path `[a, …hubs, b]`. A
   *  straight edge is `[a, b]`; a bundled edge has ≥1 intermediate hub. The
   *  endpoints are ALWAYS the input edge's own `a` and `b` — no edge is dropped or
   *  re-pointed, so every real dependency keeps its true endpoints (the property the
   *  MST basin threw away). */
  paths: number[][];
  /** Per input edge (same order): whether it was rerouted through hub(s). */
  bundled: boolean[];
  /** Per shared graph segment, the accumulated flow (≥1). Keyed elsewhere by
   *  `min-max` node pair; here returned as a stable, index-sorted list. */
  segments: BundleSegment[];
}

/** Deterministic Dijkstra over an undirected weighted graph, EXCLUDING one edge
 *  (by its index), so an edge can be tested for a detour through the rest of the
 *  graph. Dense O(V²); ties break toward the lower node index, and a node's
 *  predecessor only updates on a STRICT improvement, so equal-cost alternatives
 *  never flip the result. Returns the node path src→dst and its total weight, or
 *  null when dst is unreachable. */
function dijkstraExcluding(
  n: number,
  adj: Array<Array<{ to: number; ei: number; w: number }>>,
  src: number,
  dst: number,
  excludeEi: number,
): { path: number[]; cost: number } | null {
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[src] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    let bd = Infinity;
    for (let v = 0; v < n; v++) {
      if (!done[v] && (dist[v] ?? Infinity) < bd) {
        bd = dist[v] ?? Infinity;
        u = v;
      }
    }
    if (u === -1) break;
    done[u] = true;
    if (u === dst) break;
    for (const { to, ei, w } of adj[u] ?? []) {
      if (ei === excludeEi || done[to]) continue;
      const nd = (dist[u] ?? Infinity) + w;
      if (nd < (dist[to] ?? Infinity)) {
        dist[to] = nd;
        prev[to] = u;
      }
    }
  }
  if ((dist[dst] ?? Infinity) === Infinity) return null;
  const path: number[] = [];
  for (let v = dst; v !== -1; v = prev[v] ?? -1) {
    path.push(v);
    if (v === src) break;
  }
  path.reverse();
  if (path[0] !== src) return null;
  return { path, cost: dist[dst] ?? Infinity };
}

/**
 * EDGE-PATH BUNDLING over the REAL dependency graph (Wallinger et al. 2021): merge
 * nearby edges into shared trunks WITHOUT inventing false adjacencies. Every input
 * edge keeps its own endpoints `a` and `b`; a LONG edge whose two islands are also
 * reachable along a short chain through a shared hub is REROUTED to flow along that
 * chain (so a hub like the library becomes a fat trunk many edges run along), while
 * a direct edge with no cheaper detour stays STRAIGHT (its own channel) — which is
 * exactly the owner's "merge when close, but still signal a direct connection".
 *
 * Algorithm: weight each edge `len^d` (d≈2 penalises long edges so they prefer a
 * hub detour); process edges LONGEST-first (ties → lower index, the same
 * determinism euclideanMST uses); for each edge run Dijkstra from a to b through the
 * REMAINING edges (the edge itself excluded, so a genuine detour is found) and
 * BUNDLE it along that path when the detour's total weight ≤ `dMax · len(e)^d` and
 * it has ≥1 intermediate hub. Finally accumulate, per shared graph segment, how many
 * edge paths traverse it (the trunk-width signal). Deterministic — no Math.random,
 * no wall-clock; O(|E|²·log|V|)-ish (here a dense O(|E|·|V|²)), trivial at 10–30
 * islands. Returns empty paths for empty edges.
 */
export function edgePathBundle(
  nodes: Vec2[],
  edges: BundleEdge[],
  opts: { d: number; dMax: number },
): EdgeBundle {
  const n = nodes.length;
  const len = edges.map((e) => {
    const A = nodes[e.a];
    const B = nodes[e.b];
    return A && B ? Math.hypot(B.x - A.x, B.y - A.y) : 0;
  });
  const w = len.map((L) => Math.pow(L, opts.d));
  const adj: Array<Array<{ to: number; ei: number; w: number }>> = Array.from(
    { length: n },
    () => [],
  );
  edges.forEach((e, ei) => {
    if (e.a === e.b || e.a < 0 || e.b < 0 || e.a >= n || e.b >= n) return;
    const wi = w[ei] ?? 0;
    adj[e.a]?.push({ to: e.b, ei, w: wi });
    adj[e.b]?.push({ to: e.a, ei, w: wi });
  });
  // Longest edge first — a long edge is the one most worth rerouting through a hub.
  const order = edges.map((_, i) => i).sort((i, j) => (len[j] ?? 0) - (len[i] ?? 0) || i - j);
  const paths: number[][] = edges.map((e) => [e.a, e.b]);
  const bundled: boolean[] = edges.map(() => false);
  for (const ei of order) {
    const e = edges[ei];
    if (!e || e.a === e.b) continue;
    const res = dijkstraExcluding(n, adj, e.a, e.b, ei);
    if (res && res.path.length >= 3 && res.cost <= opts.dMax * (w[ei] ?? 0)) {
      paths[ei] = res.path;
      bundled[ei] = true;
    }
  }
  // Shreve-like accumulation: every segment a path traverses gains one unit of flow.
  const segFlow = new Map<string, number>();
  for (const p of paths) {
    for (let k = 0; k < p.length - 1; k++) {
      const x = p[k];
      const y = p[k + 1];
      if (x === undefined || y === undefined) continue;
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      segFlow.set(key, (segFlow.get(key) ?? 0) + 1);
    }
  }
  const segments: BundleSegment[] = [...segFlow.entries()]
    .map(([key, flow]) => {
      const [a, b] = key.split('-').map(Number);
      return { a: a ?? 0, b: b ?? 0, flow };
    })
    .sort((p, q) => p.a - q.a || p.b - q.b);
  return { paths, bundled, segments };
}

/** Stable `min-max` key for a graph segment between node indices `a` and `b` — the
 *  same key edgePathBundle accumulates flow under, so a caller can look a segment's
 *  flow up from the returned list. */
export function segmentKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
