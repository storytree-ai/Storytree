// stressLayout — dependency-aware island PLACEMENT behind the default-OFF
// `?layout=stress` gear control (ADR-0171). The default `dag` layout is a strict
// Sugiyama layered layout: a node's y is pinned HARD to its longest-path rank, so a
// dependency from a low foundation (e.g. `agent`) to a high consumer MUST span every
// rank between them — the long cross-forest trail the owner flagged (2026-07-06).
//
// This module answers that structurally, per the session research pass: localized
// stress majorization (SMACOF / Guttman coordinate descent) with a SOFT y-hierarchy
// anchor — the browser-cheap "soft" form of DiG-CoLa (Dwyer & Koren, InfoVis 2005).
// Stress pulls dependency-adjacent islands to their graph-distance apart (short edges);
// a per-node y-anchor keyed to dependency rank keeps the top-down hierarchy read. The
// `alpha` knob trades the two: high ⇒ "looks like the layered `dag`", low ⇒ shortest
// trails. A lone high consumer of a deep foundation relaxes DOWN toward it instead of
// floating at the top of its rank band — shortening that trail without hiding it.
//
// Why a standalone, framework-free module (mirrors solarLayout / worldSettings):
//   • Pure number math (no React, no DOM) → unit-testable Stage-1 red-green of the
//     placement GEOMETRY (ADR-0070; the APPEARANCE is owner-attested, never self-signed).
//   • buildWorld consumes `stressSeeds` to seed island positions ONLY in stress mode;
//     the `dag` seed block is untouched, so the default world stays byte-identical.
//   • Seeds flow into the SAME hex-snap / growth-floor / territory-growth pipeline as
//     every other mode — this changes only WHERE islands sit, never what they encode
//     (ADR-0062 one-element-per-signal preserved upstream).
//
// Determinism (ADR-0169 §5 honesty — no per-map hand-tuning): a pure function of
// (nodes, edges, seed). All randomness hashes from node ids; fixed iteration count and
// fixed id-sorted sweep order; no Math.random, no clock. Same input → byte-identical
// output, pinned by test. A messy graph lays out messy — placement never curates.

export interface Pt {
  x: number;
  y: number;
}

/** One island to place. */
export interface StressNode {
  /** Stable id (story id). */
  id: string;
  /** Longest-path dependency rank (0 = foundation), the hierarchy the y-anchor keys to. */
  rank: number;
  /** Rough island pixel radius (buildWorld's `estRadius`) — scales the unit edge length. */
  radius: number;
}

/** A dependency edge: `from → to` means "`to` depends on `from`" (buildWorld's convention). */
export interface StressEdge {
  from: string;
  to: string;
}

export interface StressOpts {
  /** Majorization sweeps — FIXED (no convergence early-exit: a float threshold could
   *  flip on rounding across machines and break determinism). */
  iters: number;
  /** Unit edge length: the target spacing for a 1-hop (dependency-adjacent) pair. */
  unit: number;
  /** Vertical world-units per rank level (the y-anchor scale). */
  levelGap: number;
  /** Hierarchy weight: the soft y-anchor strength, as a fraction of a node's mean stress
   *  weight. 0 ⇒ pure stress (shortest edges, hierarchy only from the seeded init);
   *  large ⇒ y pinned to rank (≈ the layered `dag`). The one hierarchy↔locality knob. */
  alphaFrac: number;
  /** De-overlap sweeps after majorization (owner 2026-07-07: islands too close in dense
   *  clusters). Fixed count → deterministic. */
  sepIters: number;
  /** Min-separation pad: two islands are pushed apart until their centres are at least
   *  `sepPad · (r_i + r_j)` apart. >1 leaves breathing room; sized ABOVE 1 because the
   *  seed radius is pre-growth and territories grow to ~2× it. */
  sepPad: number;
}

export const STRESS_OPTS: StressOpts = {
  iters: 60,
  unit: 220,
  levelGap: 200,
  alphaFrac: 0.55,
  sepIters: 24,
  sepPad: 2.0,
};

// ---------- deterministic pseudo-random (self-contained; no Math.random) ----------

/** FNV-1a → uint32. Stable across runs so the layout never reshuffles. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A uint32 seed → [0,1). xorshift, deterministic. */
function rand01(seed: number): number {
  let x = (seed || 1) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 4294967296;
}

/** Round to 2dp for compact, stable output. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- the layout ----------

/**
 * Seed every node's island centre by localized stress majorization with a soft
 * y-hierarchy anchor. Keyed by index in `nodes` (exactly the story-index buildWorld's
 * downstream arrays use), so it drops into the seed-placement block like `solarSeeds`.
 *
 * Pure + deterministic and ORDER-INDEPENDENT: each id lands in the same place
 * regardless of input array order (init hashes from the id; the majorization sweep
 * runs in a fixed id-sorted order).
 */
export function stressSeeds(
  nodes: StressNode[],
  edges: StressEdge[],
  seed: string,
  opts: StressOpts = STRESS_OPTS,
): Map<number, Pt> {
  const n = nodes.length;
  const out = new Map<number, Pt>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(0, { x: 0, y: 0 });
    return out;
  }

  const idOf = nodes.map((nd) => nd.id);
  const idx = new Map<string, number>(idOf.map((id, i) => [id, i]));

  // unit edge length scaled by the mean island radius so spacing tracks island size.
  const avgR = nodes.reduce((s, nd) => s + Math.max(0, nd.radius), 0) / n;
  const L = opts.unit + 2 * avgR;

  // --- undirected adjacency (dependency graph, direction-agnostic for distances) ---
  const adj: number[][] = nodes.map(() => []);
  for (const e of edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a]!.push(b);
    adj[b]!.push(a);
  }

  // --- all-pairs shortest-path HOP distances (BFS from each node) ---
  const hops: Int32Array[] = nodes.map(() => new Int32Array(n).fill(-1));
  let maxHop = 1;
  for (let s = 0; s < n; s++) {
    const d = hops[s]!;
    d[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!;
      for (const v of adj[u]!) {
        if (d[v] === -1) {
          d[v] = d[u]! + 1;
          if (d[v]! > maxHop) maxHop = d[v]!;
          queue.push(v);
        }
      }
    }
  }

  // --- target distances δ and weights w = 1/δ² (down-weights far pairs so local
  //     structure dominates). Disconnected pairs get a finite far distance so
  //     components repel gently rather than fly apart. ---
  const disconnected = (maxHop + 1) * L;
  const delta = (i: number, j: number): number => {
    const h = hops[i]![j]!;
    return h < 0 ? disconnected : h * L;
  };

  // --- soft y-anchor: ideal level from rank, negative = up (buildWorld's convention) ---
  const yTarget = nodes.map((nd) => -nd.rank * opts.levelGap);

  // --- seeded deterministic init: x scattered by id-hash, y on the hierarchy so the
  //     layout starts already reading top-down and stress only refines locally. ---
  const spread = L * Math.sqrt(n);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = hash(`${seed}:${idOf[i]}`);
    xs[i] = (rand01(h) - 0.5) * spread;
    ys[i] = yTarget[i]! + (rand01(h ^ 0x9e3779b9) - 0.5) * (0.5 * L);
  }

  // --- alpha: the y-anchor strength, comparable to a node's mean total stress weight
  //     so hierarchy and locality are balanced (not one drowning the other). ---
  let wsumTotal = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = delta(i, j);
      wsumTotal += 1 / (d * d);
    }
  }
  const meanWsum = wsumTotal / n;
  const alpha = opts.alphaFrac * meanWsum;

  // --- localized stress majorization (Gauss–Seidel): sweep nodes in a FIXED id-sorted
  //     order, applying the per-node Guttman optimum given all others fixed. The
  //     `alpha·yTarget` blend in the y-update is the soft hierarchy anchor. ---
  const order = [...Array(n).keys()].sort((a, b) =>
    idOf[a]! < idOf[b]! ? -1 : idOf[a]! > idOf[b]! ? 1 : 0,
  );
  for (let iter = 0; iter < opts.iters; iter++) {
    for (const i of order) {
      let wsum = 0;
      let numX = 0;
      let numY = 0;
      const xi = xs[i]!;
      const yi = ys[i]!;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = delta(i, j);
        const w = 1 / (d * d);
        const dx = xi - xs[j]!;
        const dy = yi - ys[j]!;
        const dist = Math.max(Math.hypot(dx, dy), 1e-6);
        wsum += w;
        numX += w * (xs[j]! + (d * dx) / dist);
        numY += w * (ys[j]! + (d * dy) / dist);
      }
      if (wsum > 0) {
        xs[i] = numX / wsum;
        // y also answers to the soft hierarchy anchor.
        ys[i] = (numY + alpha * yTarget[i]!) / (wsum + alpha);
      }
    }
  }

  // --- de-overlap relaxation (owner 2026-07-07: islands sat too close in dense
  //     clusters). Stress targets graph-distance, which can pack a mutually-adjacent
  //     cluster tighter than the islands' footprints — and the seed radius is pre-growth,
  //     so territories then grow into each other. A few deterministic separation sweeps
  //     push apart any pair closer than `sepPad·(r_i+r_j)`, in a FIXED id-sorted pair
  //     order (so it stays pure/deterministic); each is a symmetric nudge, so the stress
  //     structure (short edges, hierarchy) is preserved — only overlaps are relieved. ---
  for (let pass = 0; pass < opts.sepIters; pass++) {
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi]!;
      for (let oj = oi + 1; oj < order.length; oj++) {
        const j = order[oj]!;
        const minSep = opts.sepPad * (Math.max(0, nodes[i]!.radius) + Math.max(0, nodes[j]!.radius));
        let dx = xs[i]! - xs[j]!;
        let dy = ys[i]! - ys[j]!;
        let dist = Math.hypot(dx, dy);
        if (dist >= minSep) continue;
        if (dist < 1e-6) {
          // coincident: separate along a deterministic id-hashed axis so it stays pure
          const a = (hash(`${idOf[i]}|${idOf[j]}`) % 628) / 100;
          dx = Math.cos(a);
          dy = Math.sin(a);
          dist = 1;
        }
        const push = (minSep - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        xs[i] = xs[i]! + ux * push;
        ys[i] = ys[i]! + uy * push;
        xs[j] = xs[j]! - ux * push;
        ys[j] = ys[j]! - uy * push;
      }
    }
  }

  // Centre the cloud on the origin (x mean → 0) so downstream framing is stable.
  let cx = 0;
  for (let i = 0; i < n; i++) cx += xs[i]!;
  cx /= n;
  for (let i = 0; i < n; i++) out.set(i, { x: r2(xs[i]! - cx), y: r2(ys[i]!) });
  return out;
}
