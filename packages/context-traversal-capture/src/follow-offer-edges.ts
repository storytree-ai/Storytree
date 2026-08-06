/**
 * Story `context-traversal-capture`, capability `offer-follow-edges` (ADR-0235 / ADR-0260), story
 * spec `stories/context-traversal-capture/offer-follow-edges.md`.
 *
 * `artifact-offer-candidate-sets` records what a `library artifact <id>` render OFFERED, at render
 * time, unconditionally. This module records which offer a LATER read ANSWERED — and only when the
 * answering invocation's own argv carries the offer's id (ADR-0260 D3): the id travels in argv,
 * never resolved by joining on the session's own trace. `emitFollowedEdge` is handed no prior
 * events and no trace reader — a recency join is structurally impossible here, not merely
 * undiscipled.
 *
 * `planOfferIdentity` mints an offer id only where a candidate set will actually be recorded for it
 * (the same `isOfferableArtifactRead` predicate the sibling offers on), so a render can never print
 * a dangling id. `renderOfferFollowUps` turns a recorded offer into the follow-up command lines an
 * agent can literally paste, skipping any offer id carrying a scheme prefix (a `doc:` ref has no CLI
 * read to follow). `parseOfferFollow` decomposes `--from-offer` from the FOLLOWING invocation's own
 * argv, purely from the string. `emitFollowedEdge` is a total, pure join: it stamps the answering
 * visit and appends one `followed_edge` event naming both ends, and is a no-op — never a thrown
 * error, never a fabricated edge — on every shape ADR-0260 D4 requires the mechanism to under-report
 * rather than repair.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalCoverage, ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import {
  CANDIDATE_SET_PREFIX,
  LIBRARY_ARTIFACT_SURFACE,
  OFFER_CANDIDATE_SET_CAVEATS,
  OFFER_CANDIDATE_SET_COVERAGE,
  candidateSetIdOf,
  isOfferableArtifactRead,
  offerIdOf,
} from "./offer-candidate-sets.js";
import type { CoverageCaveat } from "./offer-candidate-sets.js";
import type { ObserveCliDeps } from "./observe-cli.js";

/** The follow-up flag: `--from-offer <candidateSetId>` or `--from-offer=<candidateSetId>`. */
export const OFFER_FLAG = "--from-offer";

/** A parsed, well-formed offer follow: the id split into its two carried parts. */
export interface FollowedOffer {
  readonly candidateSetId: string;
  readonly fromVisitId: string;
}

/** The identity a render plans to print, before anything has been recorded. */
export interface OfferIdentity {
  readonly visitId: string;
  readonly candidateSetId: string;
}

/** The identity + clock this producer needs to stamp a followed-edge event. */
export type FollowDeps = Pick<ObserveCliDeps, "sessionId" | "now">;

/**
 * Decompose `--from-offer` from `argv`, purely from the string — no lookup, no history, no trace.
 * The flag and its value are stripped from the returned argv in every case, including a malformed
 * or missing value, because the underlying read still happened and the remainder must still present
 * the bare shape `observeCliInvocation` allowlists.
 */
export function parseOfferFollow(argv: readonly string[]): {
  readonly argv: readonly string[];
  readonly followed: FollowedOffer | null;
} {
  const remaining: string[] = [];
  let matched = false;
  let rawValue: string | null = null;
  let i = 0;

  while (i < argv.length) {
    const token = argv[i];
    if (token === OFFER_FLAG) {
      const next = argv[i + 1];
      if (!matched) {
        matched = true;
        rawValue = next ?? null;
      }
      i += next !== undefined ? 2 : 1;
      continue;
    }
    if (token !== undefined && token.startsWith(`${OFFER_FLAG}=`)) {
      if (!matched) {
        matched = true;
        rawValue = token.slice(OFFER_FLAG.length + 1);
      }
      i += 1;
      continue;
    }
    if (token !== undefined) remaining.push(token);
    i += 1;
  }

  if (!matched || rawValue === null) return { argv: remaining, followed: null };
  if (!rawValue.startsWith(CANDIDATE_SET_PREFIX)) return { argv: remaining, followed: null };
  const fromVisitId = rawValue.slice(CANDIDATE_SET_PREFIX.length);
  if (fromVisitId.trim().length === 0) return { argv: remaining, followed: null };
  return { argv: remaining, followed: { candidateSetId: rawValue, fromVisitId } };
}

/**
 * Plan the offer identity a render would print, only where a candidate set will actually be
 * recorded for it — the exact `isOfferableArtifactRead` shape the sibling offers on, mirrored, never
 * widened. `mintVisitId` is called exactly once, and only when the shape is offerable, so a refused
 * shape never mints an id it would then discard.
 */
export function planOfferIdentity(
  argv: readonly string[],
  mintVisitId: () => string,
): OfferIdentity | null {
  if (!isOfferableArtifactRead(argv)) return null;
  const visitId = mintVisitId();
  return { visitId, candidateSetId: candidateSetIdOf(visitId) };
}

/**
 * Turn one render's offered refs into the follow-up command lines an agent can literally paste, in
 * authored order. Each id printed is `offerIdOf(ref)`, byte-identical to the id recorded in the
 * candidate set's own `candidateNodeIds`. Any offer id carrying a scheme prefix (an id containing
 * `:`, e.g. a `doc:` ref) is skipped — there is no CLI read that could follow one, and printing a
 * command that cannot run would forge a follow-up form for the exact gap the caveats declare.
 */
export function renderOfferFollowUps(candidateSetId: string, refs: readonly string[]): string[] {
  const lines: string[] = [];
  for (const ref of refs) {
    const id = offerIdOf(ref);
    if (id.includes(":")) continue;
    lines.push(`storytree library artifact ${id} ${OFFER_FLAG} ${candidateSetId}`);
  }
  return lines;
}

/**
 * The ASK that rides beside the printed form (ADR-0320) — rendered as the envelope's `note:`
 * immediately above the follow-ups {@link renderOfferFollowUps} produced, and only when it produced
 * some.
 *
 * It lives HERE, beside the form and beside the `follow-completeness-depends-on-the-offered-command-form`
 * caveat below, because those three are one fact wearing three faces: the caveat states the
 * dependency to a coverage READER, the form gives an agent the line, and this states the ask to the
 * agent looking at it. Printing the form alone was measured insufficient — over every session trace
 * on the dev box on 2026-08-06, 5048 offered ids produced ZERO `followed_edge` events, and the cause
 * was not reluctance but silence: `--from-offer` appeared in no guidance anywhere, so the trailing
 * flag read as an internal token to strip rather than the point of the line (ADR-0320 Context).
 *
 * Two things it deliberately is NOT. It is not a gate and never becomes one (ADR-0320 D2): a check
 * that rewarded the flag's presence would buy it on reads that answered no offer, manufacturing the
 * false edges ADR-0260 D4 refuses. And it does not widen scope (ADR-0320 D4) — hence the closing
 * sentence, since a read reached from a chip, a search, or an agent's own memory has no offer to
 * name and naming one anyway is fabrication, not diligence.
 */
export const OFFER_FOLLOW_NOTE: readonly string[] = [
  `Following one of the pointers below? Run that line AS PRINTED — its trailing \`${OFFER_FLAG}\``,
  "id is what records which branch you chose (ADR-0260 D3). Retyping the bare form reads the same",
  "artifact and silently loses the edge. Never add the flag to a read that answered no offer.",
];

/** Locate the index of the `library-artifact` surface visit within `observed`, or -1. */
function findAnsweringVisitIndex(observed: readonly ContextTraversalEvent[]): number {
  return observed.findIndex(
    (event) => isContextVisitEvent(event) && event.surfaceId === LIBRARY_ARTIFACT_SURFACE,
  );
}

/**
 * Stamp the answering `library-artifact` visit with `followedEdgeId` and append one `followed_edge`
 * event naming both ends. A total no-op — `observed` returned unchanged, never mutated — when:
 * `followed` is null, the batch holds no `library-artifact` render visit, the render visit already
 * carries a `followedEdgeId`, or `fromVisitId` equals the answering visit's own `visitId` (a read
 * cannot answer its own offer). The edge id is derived from the (fromVisitId, toVisitId) pair, never
 * minted, so re-running this over its own output appends nothing new.
 */
export function emitFollowedEdge(
  observed: readonly ContextTraversalEvent[],
  followed: FollowedOffer | null,
  deps: FollowDeps,
): ContextTraversalEvent[] {
  if (followed === null) return [...observed];

  const idx = findAnsweringVisitIndex(observed);
  if (idx === -1) return [...observed];

  const candidate = observed[idx];
  if (candidate === undefined || !isContextVisitEvent(candidate)) return [...observed];
  if (candidate.followedEdgeId !== undefined) return [...observed];
  if (followed.fromVisitId === candidate.visitId) return [...observed];

  const edgeId = `edge:${followed.fromVisitId}:${candidate.visitId}`;
  const stamped: ContextVisitEvent = { ...candidate, followedEdgeId: edgeId };

  const result: ContextTraversalEvent[] = observed.map((event, i) => (i === idx ? stamped : event));

  const edgeEvent: ContextTraversalEvent = {
    kind: "followed_edge",
    eventId: `event:${edgeId}`,
    sessionId: deps.sessionId,
    at: deps.now().toISOString(),
    edgeId,
    candidateSetId: followed.candidateSetId,
    fromVisitId: followed.fromVisitId,
    toVisitId: candidate.visitId,
  };

  return [...result, edgeEvent];
}

/**
 * The `terminal-cli-dispatch` coverage, composed FROM `OFFER_CANDIDATE_SET_COVERAGE`:
 * `event:followed_edge` and `field:candidate_follow_causality` move from `omitted` to `supported`.
 * Nothing else changes — composition, never a rewrite.
 */
export const FOLLOW_OFFER_EDGE_COVERAGE: ContextTraversalCoverage = {
  adapterId: OFFER_CANDIDATE_SET_COVERAGE.adapterId,
  supported: [
    ...OFFER_CANDIDATE_SET_COVERAGE.supported,
    "event:followed_edge",
    "field:candidate_follow_causality",
  ],
  omitted: OFFER_CANDIDATE_SET_COVERAGE.omitted.filter(
    (feature) => feature !== "event:followed_edge" && feature !== "field:candidate_follow_causality",
  ),
};

/**
 * The sibling's `doc:` caveat carries through byte-identical — still true of the inner adapter. Its
 * `follow-completeness-…` caveat carries the SAME stable id but a SHARPER note: with a producer in
 * place, the agent must re-use the offered form carrying the offer id, since a bare command now
 * loses the edge outright. A third, new caveat states the ADR-0260 D4 asymmetry: a visit with no
 * `followedEdgeId` means either the offer went unanswered or the mechanism was bypassed — the two
 * are indistinguishable by design, and no inference may ever repair the gap.
 */
export const FOLLOW_OFFER_EDGE_CAVEATS: readonly CoverageCaveat[] = OFFER_CANDIDATE_SET_CAVEATS.map(
  (caveat): CoverageCaveat => {
    if (caveat.id === "follow-completeness-depends-on-the-offered-command-form") {
      return {
        id: caveat.id,
        note:
          "A follow is only observable when the agent re-invokes the exact offered follow-up form " +
          `printed by \`renderOfferFollowUps\` — the bare \`library artifact <id>\` read carrying ` +
          `\`${OFFER_FLAG} <candidateSetId>\`; the bare form alone (with no offer id) now loses the ` +
          "edge outright, and any other path to the same content is invisible to this telemetry.",
      };
    }
    return caveat;
  },
).concat([
  {
    id: "an-unanswered-visit-and-a-bypassed-mechanism-are-indistinguishable",
    note:
      "A visit with no `followedEdgeId` means either the offer went unanswered or the follow " +
      "mechanism was bypassed (a hand-typed bare command, a direct file read) — the two are " +
      "indistinguishable by design, and this gap is never repaired by inference: under-reporting is " +
      "the accepted failure mode (ADR-0260 D4), not an error to be joined away after the fact.",
  },
]);
