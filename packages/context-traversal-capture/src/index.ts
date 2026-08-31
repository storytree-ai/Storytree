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
  summarizeTraversalSession,
  TRAVERSAL_TRACE_EXT,
  type TraversalLineIdentity,
  type TraversalSinkLocation,
  type TraversalListLocation,
  type TraversalReadResult,
  type TraversalSessionSummary,
} from "./sink.js";

export {
  classifyTraceIdentity,
  describeTraceIdentity,
  resolveTraceIdentity,
  DECLARED_SESSION_ID_ENV,
  HOST_WINDOW_ID_ENV,
  type TraceIdentity,
  type TraceIdentityGrade,
  type TraceIdentityInput,
  type TraceIdentityKind,
} from "./session-identity.js";

export {
  classifySessionOrigin,
  declareSessionOrigin,
  describeSessionOrigin,
  foldSessionOrigin,
  parseSessionOriginDeclaration,
  resolveSessionOrigin,
  SessionOriginDeclarationDoc,
  CUT_BY_SESSION_ENV,
  CUT_FOR_UNIT_ENV,
  SESSION_ORIGIN_ENV,
  type OriginDeclarationOutcome,
  type OriginDeclarationRefusal,
  type OriginDeclarationRequest,
  type SessionOrigin,
  type SessionOriginClaim,
  type SessionOriginDeclaration,
  type SessionOriginInput,
  type SessionOriginKind,
  type SessionOriginReading,
  type TraceOriginReading,
} from "./session-origin.js";

export {
  readSessionOriginDeclaration,
  sessionOriginPath,
  writeSessionOriginDeclaration,
  SESSION_ORIGIN_EXT,
} from "./origin-declaration.js";

export {
  AREAS_WITHOUT_CORPUS_READS,
  CLI_READ_VERBS,
  KEY_LENGTHS,
  observeCliInvocation,
  TERMINAL_CLI_DISPATCH_COVERAGE,
  verbSpecFor,
  type CliVerbSpec,
  type ObserveCliDeps,
} from "./observe-cli.js";

export { linkRevisits, REVISIT_LINK_COVERAGE } from "./revisit-links.js";
export {
  AGENT_DESCENT_CAVEATS,
  AGENT_DESCENT_COVERAGE,
  descendAgentRefs,
  renderCoverageCaveats,
  resolveAgentDescent,
} from "./descend-agent-refs.js";
export type { AgentDescentDeps, AgentDocStore, CoverageCaveat } from "./descend-agent-refs.js";

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

// The trace index, answered incrementally (moved here from the studio server by increment
// `desktop-serves-the-traversal-routes` so the studio and the desktop share ONE cache rather than
// two that must be kept deep-equal by hand).
export {
  listTraversalSessionsIncremental,
  resetTraversalIndexMemo,
  type SummarizeTraversalSession,
} from "./traversal-index-memo.js";
