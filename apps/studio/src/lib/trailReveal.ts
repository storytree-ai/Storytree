// trailReveal — pure trail DRAW-ON plan selectors for the ADR-0169 trail network.
//
// The map draws every trail by default now (owner 2026-07-07 — reveal-on-click retired;
// pathways should be visible without hunting). The growth animation moved to WHERE it
// means something: an island being PLACED. `arrivalGrowPlan` (the primary export) roots
// at the ARRIVING island(s) and draws on their DIRECT incident trails, growing outward
// from the new island. The DOM half (SceneView's mask hookup + the index.css animation)
// consumes the plan verbatim, so the animation LOGIC is red-green testable here
// (ADR-0070 Stage-1; the look is owner-attested).
//
// `trailRevealPlan` (below) is the RETAINED focus-rooted selector from the reveal-on-click
// era (items 1-3, 2026-07-06 — the full transitive dependency chain both directions). It
// is no longer wired into the map, but kept pure + tested in case click-to-highlight
// returns; both selectors share the same TrailRevealPlan shape and the SceneView hookup.
//
// Why a plan and not classes: a segment is SHARED (a trunk carries many edges), so two
// edges can reach the same segment at different chain positions or from different ends —
// the plan folds those deterministically (earliest draw-on wins). The §5 honesty
// invariant holds by construction: every plan is a subset of REAL edges, never invented.

import type { TrailNetwork } from '@storytree/forest-world';

/** Stagger between chain positions (ADR-0169 §3 — "~350ms/segment, ease-out"). */
export const REVEAL_STAGGER_MS = 350;

/**
 * The direction tint of a revealed segment relative to the focused island F
 * (edge `from → to` means "`to` depends on `from`"):
 *   `out`  — a dependency edge (`to === F`): what F stands on. Warm earth.
 *   `in`   — a dependent edge (`from === F`): who stands on F. Cooler tint.
 *   `both` — a shared trunk carrying edges of both directions. Neutral sand.
 */
export type TrailDir = 'in' | 'out' | 'both';

export interface RevealSegment {
  id: string;
  /** Chain-position stagger: `chainIndex * REVEAL_STAGGER_MS` (earliest across edges). */
  delayMs: number;
  /** True ⇒ the mask grows from the segment path's geometric END (the chain walks it
   *  against its drawn direction), so growth always moves away from the island. */
  fromEnd: boolean;
  dir: TrailDir;
  /** Distinct REVEALED edges through this segment — the multi-reveal width step-up
   *  (§3: a segment shared by k≥2 revealed edges widens), NOT the global usage. */
  revealedUsage: number;
}

export interface TrailRevealPlan {
  focusId: string;
  /** Deterministic order: by delay, then id (stable across renders). */
  segments: RevealSegment[];
  byId: ReadonlyMap<string, RevealSegment>;
}

/**
 * Build the reveal plan for a focused island. Returns null only when nothing is
 * focused (or there is no network) — a focused island with NO incident edges still
 * yields a plan (empty segments), so the world still dims around it. Pure and
 * deterministic; the honesty invariant (ADR-0169 §5) holds by construction: the plan
 * is the UNION of the REAL edges on the focused island's full dependency chain (both
 * directions, transitively), never a curated subset or an invented edge.
 */
export function trailRevealPlan(
  network: TrailNetwork | null | undefined,
  focusId: string | null | undefined,
): TrailRevealPlan | null {
  if (!network || !focusId) return null;
  const byId = new Map<string, RevealSegment>();
  const edgesOf = new Map<string, Set<string>>(); // segment id → distinct edge keys revealed through it

  // Adjacency keyed by the NEAR end of each edge, per walk direction:
  //   `out` (dependencies): a node's own dependencies hang off its `to` end — so we
  //         expand edges where `edge.to === node`, arriving at `edge.from` farther out.
  //   `in`  (dependents):   a node's dependents hang off its `from` end — expand edges
  //         where `edge.from === node`, arriving at `edge.to` farther out.
  const byTo = new Map<string, TrailNetwork['edges']>(); // near end for the `out` walk
  const byFrom = new Map<string, TrailNetwork['edges']>(); // near end for the `in` walk
  for (const edge of network.edges) {
    (byTo.get(edge.to) ?? byTo.set(edge.to, []).get(edge.to)!).push(edge);
    (byFrom.get(edge.from) ?? byFrom.set(edge.from, []).get(edge.from)!).push(edge);
  }

  // One outward Dijkstra pass. `near` maps a node to the edges we expand when it is
  // reached; a `far` edge's chain is walked from the near node outward, its per-segment
  // delay accumulating from the near node's arrival delay. Both passes fold into the
  // SAME `byId` (earliest reveal wins timing + growth end; a segment on both an `out`
  // and an `in` edge merges to `both`).
  const walk = (near: Map<string, TrailNetwork['edges']>, dir: TrailDir): void => {
    const dist = new Map<string, number>([[focusId, 0]]); // node → earliest arrival delay
    const settled = new Set<string>();
    for (;;) {
      // pick the unsettled reached node with the smallest delay (small graphs: O(n²))
      let cur: string | null = null;
      let best = Infinity;
      for (const [n, d] of dist) if (!settled.has(n) && d < best) ((best = d), (cur = n));
      if (cur === null) break;
      settled.add(cur);
      for (const edge of near.get(cur) ?? []) {
        const far = dir === 'out' ? edge.from : edge.to;
        // walk the chain from the near node OUTWARD: `to`-anchored (`out`) means the
        // stored from→to chain is walked backwards; `from`-anchored (`in`) forwards.
        const chain = dir === 'out' ? [...edge.segments].reverse() : edge.segments;
        const edgeKey = `${edge.from}->${edge.to}`;
        chain.forEach((ref, i) => {
          const fromEnd = dir === 'out' ? !ref.reversed : ref.reversed;
          const delayMs = best + i * REVEAL_STAGGER_MS;
          const users = edgesOf.get(ref.id) ?? new Set<string>();
          users.add(edgeKey);
          edgesOf.set(ref.id, users);
          const prev = byId.get(ref.id);
          if (!prev) {
            byId.set(ref.id, { id: ref.id, delayMs, fromEnd, dir, revealedUsage: users.size });
            return;
          }
          byId.set(ref.id, {
            id: ref.id,
            delayMs: Math.min(prev.delayMs, delayMs),
            fromEnd: delayMs < prev.delayMs ? fromEnd : prev.fromEnd,
            dir: prev.dir === dir ? prev.dir : 'both',
            revealedUsage: users.size,
          });
        });
        // the far node is reached one full chain later; relax if that is earlier.
        const arrive = best + chain.length * REVEAL_STAGGER_MS;
        const prevD = dist.get(far);
        if (prevD === undefined || arrive < prevD) dist.set(far, arrive);
      }
    }
  };

  walk(byTo, 'out'); // dependencies, recursively — what the island stands on
  walk(byFrom, 'in'); // dependents, recursively — who stands on the island

  const segments = [...byId.values()].sort(
    (a, b) => a.delayMs - b.delayMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { focusId, segments, byId };
}

/**
 * The ARRIVAL grow plan (owner 2026-07-07): the map now draws every trail by default
 * (reveal-on-click retired — pathways should be visible without hunting), so the growth
 * animation moves to WHERE it means something — a story island being placed on the map.
 * When one or more islands ARRIVE, their DIRECT incident trails draw on, growing OUTWARD
 * from the new island (existing trails elsewhere stay statically drawn). Direct-incident
 * only, not the transitive chain: it is the NEW connections that draw in, not the whole
 * reachable network. Pure + deterministic (network.edges is already canonical order); the
 * §5 honesty invariant holds — the plan is a subset of REAL incident edges, never invented.
 */
export function arrivalGrowPlan(
  network: TrailNetwork | null | undefined,
  arrivalIds: ReadonlySet<string> | null | undefined,
): TrailRevealPlan | null {
  if (!network || !arrivalIds || arrivalIds.size === 0) return null;
  const usageOf = new Map(network.segments.map((s) => [s.id, s.usage]));
  const byId = new Map<string, RevealSegment>();
  for (const edge of network.edges) {
    const toNew = arrivalIds.has(edge.to);
    const fromNew = arrivalIds.has(edge.from);
    if (!toNew && !fromNew) continue;
    // grow OUTWARD from the arriving island. If `to` is the new island (it depends on
    // `from`), the stored from→to chain is walked backwards (from the `to` end); if
    // `from` is new, forwards. `to` wins if both ends are new, deterministically.
    const rootAtTo = toNew;
    const chain = rootAtTo ? [...edge.segments].reverse() : edge.segments;
    chain.forEach((ref, i) => {
      const fromEnd = rootAtTo ? !ref.reversed : ref.reversed;
      const delayMs = i * REVEAL_STAGGER_MS;
      const prev = byId.get(ref.id);
      // a segment reached from two arriving edges keeps the EARLIER draw-on
      if (prev && prev.delayMs <= delayMs) return;
      byId.set(ref.id, { id: ref.id, delayMs, fromEnd, dir: 'both', revealedUsage: usageOf.get(ref.id) ?? 1 });
    });
  }
  const segments = [...byId.values()].sort(
    (a, b) => a.delayMs - b.delayMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { focusId: [...arrivalIds].sort()[0] ?? '', segments, byId };
}
