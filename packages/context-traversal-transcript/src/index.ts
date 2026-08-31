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

// The harness ingest's RECEIPT (ADR-0484 D5 deliverable 4). The WRITER lives here because only this
// organism knows an ingest ran; the READER is the replay composition in
// `@storytree/context-traversal-spawn`; the FORMAT is neither's — it is declared once in
// `@storytree/context-traversal-telemetry`, the package all three already depend on.
export {
  readHarnessIngestReceipt,
  recordHarnessIngestRun,
  type RecordHarnessIngestArgs,
} from "./ingest-receipt.js";

export {
  ingestTranscriptOccupancy,
  HOST_TRANSCRIPT_COVERAGE,
  type IngestedWindow,
  type IngestTranscriptOccupancyArgs,
  type TranscriptIngestResult,
} from "./ingest-occupancy.js";

// ADR-0464 D1 deleted `decision-read-coverage.ts`, whose subject was the offer/read join. The three
// symbols below are the part of it that was never about offers — the reconciliation of the four live
// spellings of a decision id — and they moved to `decision-reads.ts`, which is the read-side home and
// already held the surface table they sit beside. `decision-read-baseline.ts`'s chain-depth and reach
// figures import them, and ADR-0464 D7 preserves those figures explicitly.
export {
  resolveDecisionId,
  type DecisionIdSpelling,
  type ResolvedDecisionId,
} from "./decision-reads.js";
