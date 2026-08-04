/**
 * Durable per-session context-traversal capture at the terminal CLI boundary
 * (ADR-0235 observation vocabulary, ADR-0241 local-JSONL persistence).
 *
 * Export lines are appended here as each capability's source lands. The barrel stays
 * connective glue: it is deliberately un-asserted, so no capability claims it as proof.
 *
 * This package is node-only by construction (the sink writes real bytes), so unlike the
 * increment-1 vocabulary barrel it is never bundled by the studio.
 */
export {
  resolveTraversalDir,
  appendTraversalEvents,
  readTraversalSession,
  listTraversalSessions,
  type TraversalSinkLocation,
  type TraversalListLocation,
  type TraversalReadResult,
  type TraversalSessionSummary,
} from "./sink.js";

export {
  observeCliInvocation,
  TERMINAL_CLI_DISPATCH_COVERAGE,
  type ObserveCliDeps,
} from "./observe-cli.js";

export { linkRevisits, REVISIT_LINK_COVERAGE } from "./revisit-links.js";
export {
  AGENT_DESCENT_COVERAGE,
  descendAgentRefs,
  resolveAgentDescent,
} from "./descend-agent-refs.js";
export type { AgentDescentDeps, AgentDocStore } from "./descend-agent-refs.js";

export {
  candidateSetIdOf,
  emitCandidateSet,
  isOfferableArtifactRead,
  offerIdOf,
  renderCoverageCaveats,
  resolveArtifactOffers,
  CANDIDATE_SET_PREFIX,
  LIBRARY_ARTIFACT_SURFACE,
  OFFER_CANDIDATE_SET_CAVEATS,
  OFFER_CANDIDATE_SET_COVERAGE,
} from "./offer-candidate-sets.js";
export type { CoverageCaveat, OfferDeps, OfferDocStore } from "./offer-candidate-sets.js";

export {
  emitFollowedEdge,
  parseOfferFollow,
  planOfferIdentity,
  renderOfferFollowUps,
  FOLLOW_OFFER_EDGE_CAVEATS,
  FOLLOW_OFFER_EDGE_COVERAGE,
  OFFER_FLAG,
} from "./follow-offer-edges.js";
export type { FollowDeps, FollowedOffer, OfferIdentity } from "./follow-offer-edges.js";

export {
  computeDecisionPoints,
  isFollowableOfferId,
  renderDecisionPoints,
} from "./decision-point-playback.js";
export type {
  CandidateOutcome,
  DecisionCandidate,
  DecisionPoint,
  DecisionPointReport,
  UnresolvedFollow,
  UnresolvedReason,
} from "./decision-point-playback.js";

export {
  renderTraversalSessions,
  renderTraversalSession,
  type TraversalRenderEnvelope,
} from "./query-render.js";

export {
  captureCliInvocation,
  isTraversalCaptureEnabled,
  showTraversalSession,
  listTraversalSessionsRendered,
  type CaptureCliInvocationInput,
  type TraversalQueryOptions,
} from "./terminal-capture.js";
