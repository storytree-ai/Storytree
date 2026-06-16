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
