// OFFER FANS (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`): the branches a
// visit PRINTED and did not take, drawn only from what was recorded.
//
// This module JOINS NOTHING. Every outcome it renders arrives already decided by
// `computeDecisionPoints` (`packages/context-traversal-capture/src/decision-point-playback.ts`), run
// server-side and mirrored onto the replay payload — the same function `storytree traversal show`
// renders from. What is left here is placing each recorded offer on the axis and counting it. A second
// implementation of "which offers could ever be followed" is the one way the panel and the CLI could
// come to describe the same trace differently, and ADR-0312 D6's denominator exists to make that
// impossible rather than merely unlikely.
//
// THREE HONESTY RULES WITH TEETH, all three enforced here rather than left to the renderer:
//
//   1. THE DENOMINATOR IS RAW AND NEVER A PERCENTAGE (ADR-0312 D6). Every fan states
//      `offered N, observable M of N`. `doc:` refs are 36.7% of the corpus's references and can never
//      be followed by any CLI read, so they must read as PERMANENTLY UNOBSERVABLE and never as a
//      declined branch; 25.8% of offer sets have nothing observable at all. A follow count over the
//      offered denominator systematically over-reports how often a session stayed inside the asset
//      graph, which is why the observable count travels with it and why no ratio is ever rendered.
//
//   2. ORDER CARRIES NO MEANING (ADR-0318 D3). The recorded set is authoritative on WHICH ids were
//      offered and never on their order — two renders of the same offer diverge on order in 63% of
//      multi-ref artifacts. So the fan preserves the recorded order EXACTLY and never sorts: sorting
//      would produce a stable-looking sequence that is not what the agent saw, which is a worse lie
//      than the arbitrary one.
//
//   3. THE PICTURE WILL BE NEARLY EMPTY, AND THAT IS THE SIGNAL. Measured on this machine:
//      1,356 `candidate_set` events against 3 `followed_edge`; ADR-0320's pinned baseline was 0 of
//      5,048. Under-reporting is the ACCEPTED failure mode (ADR-0260 D4) — no renderer, pass, or
//      backfill may close the gap by correlation. A fan of not-followed rays is a correct drawing of a
//      sparse signal, never a renderer bug to fix.

import type {
  TraversalCandidateSetEvent,
  TraversalDecisionPointReport,
  TraversalEventEnvelope,
} from '../types';
import { yAt, type TraversalTimeScale } from './traversalTime';

export type TraversalOfferStatus = 'followed' | 'not-followed' | 'unobservable' | 'ambiguous';

export interface TraversalOfferCandidate {
  readonly nodeId: string;
  readonly status: TraversalOfferStatus;
  /** The recorded reason, for the honest-gap statuses that carry one. */
  readonly reason: string | null;
}

export interface TraversalOffer {
  readonly candidateSetId: string;
  readonly surfaceId: string;
  readonly atMs: number;
  readonly y: number;
  /** RECORDED ORDER, never sorted (rule 2 above). */
  readonly candidates: readonly TraversalOfferCandidate[];
  /** N — how many branches were printed. */
  readonly offered: number;
  /** M — how many of them any CLI read could ever have followed. */
  readonly observable: number;
  /** How many were actually followed, and it is over M rather than over N. */
  readonly followed: number;
  /** The exact sentence ADR-0312 D6 requires. Raw counts; no percentage, ever. */
  readonly denominator: string;
}

export interface TraversalOfferModel {
  readonly offers: readonly TraversalOffer[];
  /** Offers whose `at` was unreadable, or which no `candidate_set` in this trace placed in time. */
  readonly unplaced: number;
  /** Totals across the trace, stated in the same raw form as a single fan's. */
  readonly totalOffered: number;
  readonly totalObservable: number;
  readonly totalFollowed: number;
}

const EMPTY: TraversalOfferModel = {
  offers: [],
  unplaced: 0,
  totalOffered: 0,
  totalObservable: 0,
  totalFollowed: 0,
};

/** Every instant a fan is drawn at, so the axis is built to COVER what the picture will show. */
export function offerInstants(events: readonly TraversalEventEnvelope[]): number[] {
  const out: number[] = [];
  for (const event of events) {
    if (event.kind !== 'candidate_set') continue;
    const atMs = Date.parse(event.at);
    if (!Number.isNaN(atMs)) out.push(atMs);
  }
  return out;
}

export function buildTraversalOffers(
  events: readonly TraversalEventEnvelope[],
  report: TraversalDecisionPointReport | undefined,
  scale: TraversalTimeScale,
): TraversalOfferModel {
  const points = report?.points ?? [];
  if (points.length === 0) return EMPTY;

  const setEvents = new Map<string, TraversalCandidateSetEvent>();
  for (const event of events) {
    if (event.kind === 'candidate_set' && !setEvents.has(event.candidateSetId)) {
      setEvents.set(event.candidateSetId, event);
    }
  }

  const offers: TraversalOffer[] = [];
  let unplaced = 0;
  let totalOffered = 0;
  let totalObservable = 0;
  let totalFollowed = 0;

  for (const point of points) {
    const candidates: TraversalOfferCandidate[] = point.candidates.map((candidate) => ({
      nodeId: candidate.nodeId,
      status: candidate.outcome.status,
      reason: 'reason' in candidate.outcome ? candidate.outcome.reason : null,
    }));

    const offered = candidates.length;
    // OBSERVABLE is "not permanently unfollowable" — the complement of the `unobservable` verdict the
    // server's classifier already reached. It is never recomputed from the id here (rule above).
    const observable = candidates.filter((candidate) => candidate.status !== 'unobservable').length;
    const followed = candidates.filter((candidate) => candidate.status === 'followed').length;

    totalOffered += offered;
    totalObservable += observable;
    totalFollowed += followed;

    const setEvent = setEvents.get(point.candidateSetId);
    const atMs = setEvent === undefined ? Number.NaN : Date.parse(setEvent.at);
    if (Number.isNaN(atMs)) {
      // The offer is real and its counts are real; only its INSTANT is unknown, so it is not drawn on
      // the axis. Counted rather than dropped — a fan placed at a guessed row is a claim about when
      // the branch point happened.
      unplaced += 1;
      continue;
    }

    offers.push({
      candidateSetId: point.candidateSetId,
      surfaceId: point.surfaceId,
      atMs,
      y: yAt(scale, atMs),
      candidates,
      offered,
      observable,
      followed,
      denominator: formatDenominator(offered, observable),
    });
  }

  offers.sort((a, b) => a.atMs - b.atMs);
  return { offers, unplaced, totalOffered, totalObservable, totalFollowed };
}

/** `offered N, observable M of N` — ADR-0312 D6's own words, and never a ratio. */
export function formatDenominator(offered: number, observable: number): string {
  return `offered ${offered}, observable ${observable} of ${offered}`;
}
