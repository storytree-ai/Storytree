/**
 * Story `context-traversal-capture`, capability `offer-observability-share` (ADR-0235 / ADR-0260 /
 * ADR-0312), story spec `stories/context-traversal-capture/offer-observability-share.md`.
 *
 * `decision-point-playback` renders `followed` / `not-followed` / `unobservable` / `ambiguous` for
 * every recorded offer, but says nothing about how much of the OFFER SET the telemetry could ever
 * have seen a follow land on. This module states that denominator: for each recorded `candidate_set`,
 * every offered id is classified `observable` or `unobservable` (with a reason) by running the REAL
 * machinery, never a restated prefix table —
 *
 *   1. {@link followArgvFor} builds the argv a follow of that offer would use — the ONE hand-authored
 *      mapping, and it maps a scheme to a command SHAPE, never to a verdict.
 *   2. {@link observeCliInvocation} (the real allowlist) is run against that argv, using a fixed
 *      internal stub for identity/clock — this module is pure and has no identity or clock of its
 *      own, and the stub's values are never read back by anything (only whether a visit came back,
 *      and its `surfaceId`, are observed).
 *   3. A returned visit whose `surfaceId` is not {@link LIBRARY_ARTIFACT_SURFACE} (the one surface
 *      `emitFollowedEdge` actually stamps) means a read exists but no follow producer accepts it.
 *   4. No argv, or an argv that observes no visit at all, means no read shape observes a visit for
 *      this offer in the first place.
 *
 * It emits nothing — no event kind, no field — and consumes only the events it is handed: no
 * filesystem, no clock, no store, no CLI dispatch, no id generation.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { CandidateSetEvent, ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import { LIBRARY_ARTIFACT_SURFACE } from "./offer-candidate-sets.js";
import { observeCliInvocation } from "./observe-cli.js";
import type { ObserveCliDeps } from "./observe-cli.js";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type UnobservableReason =
  | "no-cli-read-shape-observes-a-visit-for-this-offer"
  | "a-cli-read-exists-but-no-follow-producer-accepts-its-surface";

export type OfferObservability =
  | { readonly nodeId: string; readonly observable: true }
  | { readonly nodeId: string; readonly observable: false; readonly reason: UnobservableReason };

export interface PointObservability {
  readonly candidateSetId: string;
  readonly offered: number;
  readonly observable: number;
  readonly offers: readonly OfferObservability[];
}

export interface ObservabilityReport {
  readonly points: readonly PointObservability[];
  readonly offered: number;
  readonly observable: number;
}

// ---------------------------------------------------------------------------
// followArgvFor — the ONE hand-authored scheme→command-shape mapping
// ---------------------------------------------------------------------------

const NODE_PREFIX = "node:";

/**
 * The argv a follow of `offerId` would use, mirroring `renderOfferFollowUps`'s own command shape.
 * Maps a scheme to a command SHAPE, never to a verdict — the verdict is derived downstream by
 * actually running that argv through the real allowlist.
 */
export function followArgvFor(offerId: string): readonly string[] | null {
  if (!offerId.includes(":")) return ["library", "artifact", offerId];
  if (offerId.startsWith(NODE_PREFIX)) return ["tree", offerId.slice(NODE_PREFIX.length)];
  return null;
}

// ---------------------------------------------------------------------------
// classifyOfferObservability — derived from the real allowlist, never restated
// ---------------------------------------------------------------------------

/**
 * This module is pure and has no identity or clock of its own; these values are never read back —
 * only whether a visit came back, and its `surfaceId`, are observed.
 */
const STUB_DEPS: ObserveCliDeps = {
  ok: true,
  sessionId: "offer-observability-share:probe",
  nextVisitId: () => "offer-observability-share:probe-visit",
  now: () => new Date("2026-01-01T00:00:00.000Z"),
};

const NO_CLI_READ_REASON: UnobservableReason = "no-cli-read-shape-observes-a-visit-for-this-offer";
const NO_FOLLOW_PRODUCER_REASON: UnobservableReason =
  "a-cli-read-exists-but-no-follow-producer-accepts-its-surface";

/**
 * Classify one offer id by actually running the real machinery — never a restated prefix table.
 * Total: never throws.
 */
export function classifyOfferObservability(offerId: string): OfferObservability {
  const argv = followArgvFor(offerId);
  if (argv === null) {
    return { nodeId: offerId, observable: false, reason: NO_CLI_READ_REASON };
  }

  const observed = observeCliInvocation(argv, STUB_DEPS);
  const visit = observed.find(isContextVisitEvent);
  if (visit === undefined) {
    return { nodeId: offerId, observable: false, reason: NO_CLI_READ_REASON };
  }

  if (visit.surfaceId !== LIBRARY_ARTIFACT_SURFACE) {
    return { nodeId: offerId, observable: false, reason: NO_FOLLOW_PRODUCER_REASON };
  }

  return { nodeId: offerId, observable: true };
}

// ---------------------------------------------------------------------------
// computeOfferObservability
// ---------------------------------------------------------------------------

function isCandidateSetEvent(event: ContextTraversalEvent): event is CandidateSetEvent {
  return event.kind === "candidate_set";
}

/**
 * For every recorded `candidate_set`, in observed order, classify every offered id (authored order,
 * duplicates kept as separate entries — none dropped or added). Total: never throws, for any event
 * list.
 */
export function computeOfferObservability(events: readonly ContextTraversalEvent[]): ObservabilityReport {
  const points: PointObservability[] = [];

  for (const event of events) {
    if (!isCandidateSetEvent(event)) continue;

    const offers = event.candidateNodeIds.map((nodeId) => classifyOfferObservability(nodeId));
    const observableCount = offers.reduce((count, offer) => count + (offer.observable ? 1 : 0), 0);

    points.push({
      candidateSetId: event.candidateSetId,
      offered: offers.length,
      observable: observableCount,
      offers,
    });
  }

  const offered = points.reduce((sum, point) => sum + point.offered, 0);
  const observable = points.reduce((sum, point) => sum + point.observable, 0);

  return { points, offered, observable };
}

// ---------------------------------------------------------------------------
// renderOfferObservability
// ---------------------------------------------------------------------------

const REASON_ORDER: readonly UnobservableReason[] = [
  "no-cli-read-shape-observes-a-visit-for-this-offer",
  "a-cli-read-exists-but-no-follow-producer-accepts-its-surface",
];

function renderPointLine(point: PointObservability): string {
  const unobservableCount = point.offered - point.observable;
  const base =
    `  ${point.candidateSetId} — offered ${point.offered}, observable ${point.observable} of ` +
    `${point.offered}`;

  if (unobservableCount === 0) return base;

  const counts = new Map<UnobservableReason, number>();
  for (const offer of point.offers) {
    if (offer.observable) continue;
    counts.set(offer.reason, (counts.get(offer.reason) ?? 0) + 1);
  }

  const breakdown = REASON_ORDER.filter((reason) => (counts.get(reason) ?? 0) > 0)
    .map((reason) => `${reason} x${counts.get(reason) ?? 0}`)
    .join(", ");

  return `${base}; unobservable ${unobservableCount}: ${breakdown}`;
}

/**
 * The pathway this whole denominator is scoped to (ADR-0360 D6), stated on the surface rather than
 * left to a reader's assumption.
 *
 * The counts above are honest about WHICH offers could be followed; they say nothing about how much
 * of a session's navigation ever passes an offer at all, and without this line a reader takes them
 * for the latter. Measured 2026-08-13: all 7,212 recorded events carry one of four `storytree` CLI
 * surfaces, because `observeCliInvocation` is an allowlist over argv and no hook observes a file
 * read — so an agent that greps to an artifact and opens the file contributes nothing to either
 * side of this ratio. Same class of over-read as a percentage, which is why it sits here.
 */
export const PATHWAY_CAVEAT =
  "pathway — offers are recorded only where a storytree read renders them; file reads observe " +
  "nothing, so these counts cover one pathway, not all of this session's navigation";

/**
 * Render an `ObservabilityReport` as a plain-text block, or `""` when there are no points — no
 * heading, no blank line, nothing, so a replay with no recorded offer grows no section. No
 * percentage is ever rendered, and the block closes by naming the pathway it observes. Never throws.
 */
export function renderOfferObservability(report: ObservabilityReport): string {
  if (report.points.length === 0) return "";

  const lines: string[] = ["offer observability:"];
  for (const point of report.points) lines.push(renderPointLine(point));

  lines.push(
    `  trace total — offered ${report.offered}, observable ${report.observable} of ${report.offered}: ` +
      `the followed counts above are over ${report.observable} observable branches, not ${report.offered} offered`,
  );
  lines.push(`  ${PATHWAY_CAVEAT}`);

  return lines.join("\n");
}
