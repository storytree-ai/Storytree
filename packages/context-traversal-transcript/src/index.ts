/**
 * The host transcript surface as the orchestrator's own context-window occupancy
 * (ADR-0235 clause 1, a new boundary; ADR-0241 local persistence; ADR-0248 D1).
 *
 * Export lines are appended here as each capability's source lands. The barrel stays connective
 * glue: it is deliberately un-asserted, so no capability claims it as proof.
 *
 * This package is node-only by construction (it reads real transcript bytes and writes real trace
 * bytes), so like `@storytree/context-traversal-capture` it is never bundled by the studio.
 */
export {
  readTranscriptWindow,
  type OccupancyObservation,
  type TranscriptWindowRead,
} from "./transcript-occupancy.js";

export {
  collectTranscriptFiles,
  correlateTranscriptFile,
  correlateTranscripts,
  resolveTranscriptDir,
  type CorrelatedWindow,
  type TranscriptCorrelation,
  type TranscriptFileCorrelation,
} from "./correlate-transcripts.js";

// The two marks are ALSO reachable at the `./marks` subpath, which imports nothing — that is the
// door the studio's browser-side meter uses, since this barrel is node-only by construction.
export {
  bandGuidance,
  bandOf,
  HARD_MARK_TOKENS,
  SOFT_MARK_TOKENS,
  type ContextBand,
} from "./context-marks.js";

export {
  readContextWindows,
  readOwnContextWindow,
  readWindowOccupancySeries,
  type ContextHelperWire,
  type ContextScanWire,
  type ContextWindowWire,
  type ContextWindowsWire,
  type OwnWindowAbsence,
  type OwnWindowArgs,
  type OwnWindowRead,
  type OwnWindowScan,
  type OwnWindowSelection,
  type WindowOccupancy,
  type WindowSeriesAbsence,
  type WindowSeriesArgs,
  type WindowSeriesObservation,
  type WindowSeriesRead,
  type WindowSeriesScan,
} from "./context-windows.js";

export {
  DECISION_READ_SURFACES,
  decisionNodeIdsInPath,
  scanTranscriptDecisionReads,
  scrapeCliDecisionReads,
  scrapeShellDecisionReads,
  sessionIdFromCwd,
  type CliDecisionRead,
  type CliScrape,
  type DecisionRead,
  type DecisionReadScan,
  type DecisionReadShape,
  type DecisionReadStrength,
  type DeclinedShellVerb,
  type DeclinedVerb,
  type ShellScrape,
} from "./decision-reads.js";

export {
  DECISION_READ_COVERAGE,
  DECISION_READ_OMISSIONS,
  ingestDecisionReads,
  renderDecisionReadIngest,
  type DecisionReadIngestResult,
  type IngestDecisionReadsArgs,
  type IngestedDecisionSession,
} from "./ingest-decision-reads.js";

export {
  ingestTranscriptOccupancy,
  HOST_TRANSCRIPT_COVERAGE,
  type IngestedWindow,
  type IngestTranscriptOccupancyArgs,
  type TranscriptIngestResult,
} from "./ingest-occupancy.js";

export {
  collectDecisionReadCoverage,
  renderDecisionReadCoverage,
  resolveDecisionId,
  routeOfSurface,
  summariseDecisionReadCoverage,
  type CountsBy,
  type DecisionIdSpelling,
  type DecisionReadCoverage,
  type DecisionReadRoute,
  type ResolvedDecisionId,
} from "./decision-read-coverage.js";
