// The session picker's JOIN (`traversal-panel-arc`, increment `traversal-panel-session-picker`):
// which of the sessions that CLAIMED this story can actually be replayed on THIS machine.
//
// Two independent facts meet here, and the whole point of this module is that they are independent:
//
//   1. WHO CLAIMED IT — `GET /api/claims` → the claim ledger (ADR-0200 D7). Shared, live, and the
//      same for every operator: a claim is a coordination signal recorded in the store.
//   2. WHAT CAN BE REPLAYED — `GET /api/traversal/sessions` → this machine's local JSONL trace dir.
//      Per-machine by the arc's owner decision of 2026-08-10, so it is emphatically NOT the same for
//      every operator, and the hosted studio's answer is legitimately empty.
//
// A picker built on (1) alone offers sessions that render nothing; one built on (2) alone offers
// sessions that never touched this story. Neither absence may be smoothed into the other, so an
// entry is never silently dropped: a claimed session with no local trace is OFFERED AND DISABLED,
// carrying the reason and the directory that was searched. "No trace on this machine" and "this
// session traversed nothing" are different claims about the world, and only the first is one this
// surface is entitled to make.
//
// Pure: claims + index in, options out. No fetch, no clock, no React (the component owns all three).

import type { ClaimActivity, ClaimGrade, TraversalSessionsPayload } from '../types';

/** Whether a claiming session can be replayed here, and — when it cannot — WHY, in the operator's terms. */
export type TraversalAvailability =
  | {
      readonly state: 'available';
      /** Usable events in the trace, straight off the index (never re-counted here). */
      readonly eventCount: number;
      /** `null` when no event carried a usable timestamp — never a fabricated "now". */
      readonly lastObservedAt: string | null;
    }
  | {
      /** Claimed, but this machine holds no readable trace for it. Offered, disabled, explained. */
      readonly state: 'no-trace';
      readonly reason: string;
    }
  | {
      /** The index has not answered yet, or could not be read — which is NOT the same as no-trace. */
      readonly state: 'unknown';
      readonly reason: string;
    };

/** One row the picker offers: a claiming session, plus whether selecting it can show anything. */
export interface TraversalPickerOption {
  readonly sessionId: string;
  readonly branch: string;
  readonly grade: ClaimGrade;
  /** ISO string of the claim this row was folded from — the STRONGEST claim the session holds here. */
  readonly claimedAt: string;
  readonly intent: string;
  readonly availability: TraversalAvailability;
}

/**
 * How the trace index answered. `pending` and `failed` are deliberately separate from an EMPTY
 * index: an index that answered `{sessions: []}` is a machine that has captured nothing, which is a
 * real observation, while a read still in flight or a route that refused is the absence of one.
 */
export type TraversalIndexState =
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'read'; readonly payload: TraversalSessionsPayload };

/** work > waiting > exploring — the same ranking the claim ledger's own dock view uses. */
const GRADE_RANK: Record<ClaimGrade, number> = { work: 0, waiting: 1, exploring: 2 };

/**
 * A session may hold SEVERAL live claims that resolve to one story — the capability-grain claims
 * ADR-0270 D1 asks for do exactly this, and the map's `claimsByStory` already folds a capability up
 * to its owning story. The picker's unit is the SESSION (one session replays as one trace), so the
 * rows are folded by session id and the strongest claim wins the row's grade.
 */
function strongest(a: ClaimActivity, b: ClaimActivity): ClaimActivity {
  const rankA = GRADE_RANK[a.grade ?? 'work'];
  const rankB = GRADE_RANK[b.grade ?? 'work'];
  if (rankA !== rankB) return rankA < rankB ? a : b;
  // Same grade — keep the OLDEST claim, so the row's age reads as "how long this session has been
  // here", which is what the neighbouring "Sessions here" rows already mean.
  return new Date(a.at).getTime() <= new Date(b.at).getTime() ? a : b;
}

/**
 * Join this story's live claims against the local trace index.
 *
 * Ordering is deterministic and availability-led: sessions that can actually be replayed come first
 * (the picker's whole job is to lead with those), each group oldest-claim-first so the ordering does
 * not churn under a poll. Returns `[]` for no claims — the caller renders NO picker rather than an
 * empty control, because an empty dropdown reads as "no sessions have traces" when the truth is that
 * nobody is working here.
 */
export function buildTraversalPickerOptions(
  claims: readonly ClaimActivity[],
  index: TraversalIndexState,
): TraversalPickerOption[] {
  const bySession = new Map<string, ClaimActivity>();
  for (const claim of claims) {
    const held = bySession.get(claim.sessionId);
    bySession.set(claim.sessionId, held ? strongest(held, claim) : claim);
  }

  const options = [...bySession.values()].map((claim) => ({
    sessionId: claim.sessionId,
    branch: claim.branch,
    grade: claim.grade ?? 'work',
    claimedAt: claim.at,
    intent: claim.intent,
    availability: availabilityOf(claim.sessionId, index),
  }));

  return options.sort((a, b) => {
    const availA = a.availability.state === 'available' ? 0 : 1;
    const availB = b.availability.state === 'available' ? 0 : 1;
    if (availA !== availB) return availA - availB;
    const timeA = new Date(a.claimedAt).getTime();
    const timeB = new Date(b.claimedAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.sessionId.localeCompare(b.sessionId);
  });
}

function availabilityOf(sessionId: string, index: TraversalIndexState): TraversalAvailability {
  if (index.status === 'pending') {
    return { state: 'unknown', reason: 'reading this machine’s traces…' };
  }
  if (index.status === 'failed') {
    // The studio server itself did not answer. Saying "no trace" here would blame the machine's
    // trace dir for the server's silence — and an operator would go looking in the wrong place.
    return { state: 'unknown', reason: `could not read the trace index — ${index.message}` };
  }
  const entry = index.payload.sessions.find((session) => session.sessionId === sessionId);
  if (entry === undefined) {
    return {
      state: 'no-trace',
      reason: `no trace under ${index.payload.dir} — traces are per-machine, so a session that ran elsewhere leaves none here`,
    };
  }
  return { state: 'available', eventCount: entry.eventCount, lastObservedAt: entry.lastObservedAt };
}

/**
 * Can ANY of these options be replayed? Drives the picker's one-line summary, which must distinguish
 * an empty local trace dir from an unread one — the picker says "none of these ran on this machine"
 * only when it has actually looked.
 */
export function replayableCount(options: readonly TraversalPickerOption[]): number {
  return options.filter((option) => option.availability.state === 'available').length;
}
