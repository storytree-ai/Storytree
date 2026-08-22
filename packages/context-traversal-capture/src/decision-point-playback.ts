/**
 * Story `context-traversal-capture`, capability `decision-point-playback` (ADR-0235 / ADR-0260),
 * story spec `stories/context-traversal-capture/decision-point-playback.md`.
 *
 * `artifact-offer-candidate-sets` records what a render OFFERED; `offer-follow-edges` records which
 * offer a later read ANSWERED. This module is the READ side that joins the two into a decision tree:
 * for each recorded `candidate_set`, every offered candidate renders what the trace deterministically
 * says happened to it (followed / not-followed / unobservable / ambiguous), and every `followed_edge`
 * this batch cannot resolve is surfaced rather than dropped. It emits nothing — no event kind, no
 * field — and consumes only the events it is handed: no filesystem, no clock, no store, no trace
 * reader, no id generation.
 *
 * THE JOIN IS ALREADY DETERMINISTIC (ADR-0260 D3): `FollowedEdgeEvent.candidateSetId` names the
 * offer exactly, `toVisitId` names the answering visit, and that visit carries `nodeId`. A candidate
 * is "followed" only because a recorded edge naming THIS set resolves onto it — never because some
 * visit anywhere in the trace happens to read a node this set offered. `nodeId` equality alone is
 * never a join.
 *
 * ADR-0260 D4 governs every gap this module cannot resolve: under-report, never repair. Three
 * distinct honest-gap shapes render distinguishably —
 *   - `not-followed`  — the offer is followable and nothing recorded answered it;
 *   - `unobservable`  — the offer carries a scheme prefix, so no CLI read could ever follow it;
 *   - `ambiguous`     — the same node id was offered more than once in one set and an edge landed on
 *                        it, so which offer slot was answered cannot be said.
 * An edge this batch cannot resolve onto any candidate in its own set (a dangling `toVisitId`, or one
 * answering a node the set never offered) is surfaced on that point's `unresolved` list; an edge
 * naming a set that was never offered at all in this batch is an ORPHAN on the report, never
 * discarded and never re-attached to some other set.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  CandidateSetEvent,
  ContextTraversalEvent,
  ContextVisitEvent,
  FollowedEdgeEvent,
} from "@storytree/context-traversal-telemetry";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type CandidateOutcome =
  | { readonly status: "followed"; readonly toVisitId: string; readonly edgeId: string }
  | { readonly status: "not-followed" }
  | { readonly status: "unobservable"; readonly reason: string }
  | { readonly status: "ambiguous"; readonly reason: string; readonly edgeIds: readonly string[] };

export interface DecisionCandidate {
  readonly nodeId: string;
  readonly outcome: CandidateOutcome;
}

export type UnresolvedReason =
  | "answering-visit-absent"
  | "answered-a-node-the-offer-did-not-contain"
  | "offer-absent-from-this-trace";

export interface UnresolvedFollow {
  readonly edgeId: string;
  readonly candidateSetId: string;
  readonly toVisitId: string;
  readonly reason: UnresolvedReason;
}

export interface DecisionPoint {
  readonly candidateSetId: string;
  readonly surfaceId: string;
  readonly candidates: readonly DecisionCandidate[];
  readonly unresolved: readonly UnresolvedFollow[];
}

export interface DecisionPointReport {
  readonly points: readonly DecisionPoint[];
  readonly orphanFollows: readonly UnresolvedFollow[];
}

const UNOBSERVABLE_REASON =
  "this offer id carries a scheme prefix and has no CLI read that could ever follow it";

/**
 * Mirrors `renderOfferFollowUps`'s own skip rule byte-for-byte (`follow-offer-edges.ts`): an offer id
 * carrying a scheme prefix (containing `:`, e.g. a `doc:` ref) has no CLI read that could ever follow
 * it, on either side of the join. This is the whole rule — no allowlist, no store lookup.
 */
export function isFollowableOfferId(offerId: string): boolean {
  return !offerId.includes(":");
}

// ---------------------------------------------------------------------------
// computeDecisionPoints
// ---------------------------------------------------------------------------

function isCandidateSetEvent(event: ContextTraversalEvent): event is CandidateSetEvent {
  return event.kind === "candidate_set";
}

function isFollowedEdgeEvent(event: ContextTraversalEvent): event is FollowedEdgeEvent {
  return event.kind === "followed_edge";
}

interface ResolvedFollow {
  readonly edgeId: string;
  readonly toVisitId: string;
  readonly nodeId: string;
}

/**
 * Resolve every edge naming `offer`'s set against the visit index, and fold the authored
 * `candidateNodeIds` into one `DecisionPoint` — no matching, no scoring, no proximity: only the
 * recorded edge decides "followed".
 */
function computeOnePoint(
  offer: CandidateSetEvent,
  edges: readonly FollowedEdgeEvent[],
  visitsById: ReadonlyMap<string, ContextVisitEvent>,
): DecisionPoint {
  const offeredIds = new Set(offer.candidateNodeIds);
  const unresolved: UnresolvedFollow[] = [];
  const resolved: ResolvedFollow[] = [];

  for (const edge of edges) {
    const visit = visitsById.get(edge.toVisitId);
    if (visit === undefined) {
      unresolved.push({
        edgeId: edge.edgeId,
        candidateSetId: edge.candidateSetId,
        toVisitId: edge.toVisitId,
        reason: "answering-visit-absent",
      });
      continue;
    }
    if (!offeredIds.has(visit.nodeId)) {
      unresolved.push({
        edgeId: edge.edgeId,
        candidateSetId: edge.candidateSetId,
        toVisitId: edge.toVisitId,
        reason: "answered-a-node-the-offer-did-not-contain",
      });
      continue;
    }
    resolved.push({ edgeId: edge.edgeId, toVisitId: edge.toVisitId, nodeId: visit.nodeId });
  }

  const occurrenceCounts = new Map<string, number>();
  for (const nodeId of offer.candidateNodeIds) {
    occurrenceCounts.set(nodeId, (occurrenceCounts.get(nodeId) ?? 0) + 1);
  }

  const candidates: DecisionCandidate[] = offer.candidateNodeIds.map((nodeId): DecisionCandidate => {
    const resolvingEdges = resolved.filter((entry) => entry.nodeId === nodeId);
    const occurrences = occurrenceCounts.get(nodeId) ?? 1;

    if (occurrences > 1 && resolvingEdges.length > 0) {
      return {
        nodeId,
        outcome: {
          status: "ambiguous",
          reason:
            `this node id was offered ${occurrences} times in this set and ${resolvingEdges.length} ` +
            "edge(s) resolved onto it, so which offer slot was answered cannot be said",
          edgeIds: resolvingEdges.map((entry) => entry.edgeId),
        },
      };
    }

    const firstResolving = resolvingEdges[0];
    if (firstResolving !== undefined) {
      return {
        nodeId,
        outcome: { status: "followed", toVisitId: firstResolving.toVisitId, edgeId: firstResolving.edgeId },
      };
    }

    if (!isFollowableOfferId(nodeId)) {
      return { nodeId, outcome: { status: "unobservable", reason: UNOBSERVABLE_REASON } };
    }

    return { nodeId, outcome: { status: "not-followed" } };
  });

  return {
    candidateSetId: offer.candidateSetId,
    surfaceId: offer.surfaceId,
    candidates,
    unresolved,
  };
}

/**
 * Join every recorded `candidate_set` against every recorded `followed_edge`, purely from recorded
 * fields — see the module doc for the join and the three honest-gap shapes. Total: never throws.
 */
export function computeDecisionPoints(events: readonly ContextTraversalEvent[]): DecisionPointReport {
  const visitsById = new Map<string, ContextVisitEvent>();
  for (const event of events) {
    if (isContextVisitEvent(event)) visitsById.set(event.visitId, event);
  }

  const edgesBySet = new Map<string, FollowedEdgeEvent[]>();
  for (const event of events) {
    if (!isFollowedEdgeEvent(event)) continue;
    const existing = edgesBySet.get(event.candidateSetId);
    if (existing === undefined) edgesBySet.set(event.candidateSetId, [event]);
    else existing.push(event);
  }

  const offeredSetIds = new Set<string>();
  for (const event of events) {
    if (isCandidateSetEvent(event)) offeredSetIds.add(event.candidateSetId);
  }

  const points: DecisionPoint[] = [];
  for (const event of events) {
    if (!isCandidateSetEvent(event)) continue;
    points.push(computeOnePoint(event, edgesBySet.get(event.candidateSetId) ?? [], visitsById));
  }

  const orphanFollows: UnresolvedFollow[] = [];
  for (const event of events) {
    if (!isFollowedEdgeEvent(event)) continue;
    if (offeredSetIds.has(event.candidateSetId)) continue;
    orphanFollows.push({
      edgeId: event.edgeId,
      candidateSetId: event.candidateSetId,
      toVisitId: event.toVisitId,
      reason: "offer-absent-from-this-trace",
    });
  }

  return { points, orphanFollows };
}

// ---------------------------------------------------------------------------
// renderDecisionPoints
// ---------------------------------------------------------------------------

const TAG_WIDTH = 16;

function tag(label: string): string {
  return label.padEnd(TAG_WIDTH);
}

function renderCandidateLine(candidate: DecisionCandidate): string {
  const outcome = candidate.outcome;
  if (outcome.status === "followed") {
    return `    ${tag("[followed]")}${candidate.nodeId} (visit=${outcome.toVisitId}, edge=${outcome.edgeId})`;
  }
  if (outcome.status === "not-followed") {
    return `    ${tag("[not-followed]")}${candidate.nodeId}`;
  }
  if (outcome.status === "unobservable") {
    return `    ${tag("[unobservable]")}${candidate.nodeId} — ${outcome.reason}`;
  }
  return `    ${tag("[ambiguous]")}${candidate.nodeId} — ${outcome.reason}`;
}

function renderUnresolvedLine(entry: UnresolvedFollow): string {
  return `    ${tag("[unresolved]")}edge=${entry.edgeId} to=${entry.toVisitId} — ${entry.reason}`;
}

function renderOrphanLine(entry: UnresolvedFollow): string {
  return (
    `    ${tag("[unresolved]")}edge=${entry.edgeId} set=${entry.candidateSetId} to=${entry.toVisitId} — ` +
    `${entry.reason}`
  );
}

function renderSummaryLine(point: DecisionPoint): string {
  interface CountsShape { followed: number; "not-followed": number; unobservable: number; ambiguous: number }

  const counts: CountsShape = {
    followed: 0,
    "not-followed": 0,
    unobservable: 0,
    ambiguous: 0,
  };
  for (const candidate of point.candidates) {
    counts[candidate.outcome.status] += 1;
  }

  const terms: string[] = [];
  if (counts.followed > 0) terms.push(`followed ${counts.followed}`);
  if (counts["not-followed"] > 0) terms.push(`not followed ${counts["not-followed"]}`);
  if (counts.unobservable > 0) terms.push(`unobservable ${counts.unobservable}`);
  if (counts.ambiguous > 0) terms.push(`ambiguous ${counts.ambiguous}`);

  return (
    `  ${point.candidateSetId} (surface=${point.surfaceId}) — offered ${point.candidates.length}: ` +
    terms.join(", ")
  );
}

/**
 * Render a `DecisionPointReport` as a plain-text block, or `""` when there is nothing to say (no
 * recorded offer AND no orphan follow) — no heading, no blank line, nothing, so a replay with no
 * recorded offer gets no decision section at all. Candidates render in authored order, never sorted
 * and never grouped by status; a zero-valued term is omitted from the summary line rather than
 * printed as `<label> 0`. Never throws.
 */
export function renderDecisionPoints(report: DecisionPointReport): string {
  if (report.points.length === 0 && report.orphanFollows.length === 0) return "";

  const lines: string[] = ["decision points:"];
  for (const point of report.points) {
    lines.push(renderSummaryLine(point));
    for (const candidate of point.candidates) lines.push(renderCandidateLine(candidate));
    for (const entry of point.unresolved) lines.push(renderUnresolvedLine(entry));
  }

  if (report.orphanFollows.length > 0) {
    lines.push("  follows whose offer is absent from this trace:");
    for (const entry of report.orphanFollows) lines.push(renderOrphanLine(entry));
  }

  return lines.join("\n");
}
