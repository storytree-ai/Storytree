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
  correlateTranscripts,
  resolveTranscriptDir,
  type CorrelatedWindow,
  type TranscriptCorrelation,
} from "./correlate-transcripts.js";

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
