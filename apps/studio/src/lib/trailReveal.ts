// trailReveal — the pure reveal-on-focus selector for the ADR-0169 trail network.
//
// The default map draws NO visible trail strokes (§3); focusing an island reveals the
// union of segments its incident `depends_on` edges route through, growing outward
// from the island segment-by-segment in chain order. This module is the PURE half of
// that experience: (focused id, TrailNetwork) → the ordered segment reveal plan —
// which segments, in what stagger order, growing from which geometric end, in which
// direction tint. The DOM half (SceneView's mask hookup + the index.css animation)
// consumes the plan verbatim, so the animation LOGIC is red-green testable here
// (ADR-0070 Stage-1; the look is owner-attested).
//
// Why a plan and not classes: a segment is SHARED (a trunk carries many edges), so
// two incident edges can reach the same segment at different chain positions or from
// different ends — the plan folds those deterministically (earliest reveal wins).

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
 * is the UNION of the focused island's incident edges, never a curated subset.
 */
export function trailRevealPlan(
  network: TrailNetwork | null | undefined,
  focusId: string | null | undefined,
): TrailRevealPlan | null {
  if (!network || !focusId) return null;
  const byId = new Map<string, RevealSegment>();
  const edgesOf = new Map<string, Set<string>>(); // segment id → distinct edge keys revealed through it

  for (const edge of network.edges) {
    const isOut = edge.to === focusId; // F depends on `from` — F's own dependency
    const isIn = edge.from === focusId; // someone depends on F
    if (!isOut && !isIn) continue;
    const dir: TrailDir = isOut ? 'out' : 'in';
    const edgeKey = `${edge.from}->${edge.to}`;
    // Walk the chain OUTWARD from F: an edge's chain is ordered from → to, so when F
    // is `to` we walk it backwards and each segment grows from its opposite end.
    const chain = isIn ? edge.segments : [...edge.segments].reverse();
    chain.forEach((ref, i) => {
      const fromEnd = isIn ? ref.reversed : !ref.reversed;
      const delayMs = i * REVEAL_STAGGER_MS;
      const users = edgesOf.get(ref.id) ?? new Set<string>();
      users.add(edgeKey);
      edgesOf.set(ref.id, users);
      const prev = byId.get(ref.id);
      if (!prev) {
        byId.set(ref.id, { id: ref.id, delayMs, fromEnd, dir, revealedUsage: users.size });
        return;
      }
      // fold: earliest reveal wins the timing + growth end; directions merge to `both`.
      byId.set(ref.id, {
        id: ref.id,
        delayMs: Math.min(prev.delayMs, delayMs),
        fromEnd: delayMs < prev.delayMs ? fromEnd : prev.fromEnd,
        dir: prev.dir === dir ? prev.dir : 'both',
        revealedUsage: users.size,
      });
    });
  }

  const segments = [...byId.values()].sort(
    (a, b) => a.delayMs - b.delayMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { focusId, segments, byId };
}
