/**
 * Turns a session's correlated host-transcript windows into validated `model_context` occupancy
 * events on disk, idempotently (ADR-0235 clause 6 / ADR-0241 D4 / ADR-0248 D1-D3), story
 * `context-traversal-transcript`, capability `transcript-occupancy-ingest`.
 *
 * Composes two already-proven siblings — `correlateTranscripts` (which host windows belong to this
 * storytree session) and `readTranscriptWindow` (that window's per-request occupancy observations)
 * — with increment 2's durable sink (`appendTraversalEvents` / `readTraversalSession`). Every byte
 * written goes through that sink, which is what makes ADR-0241 D4's validate-before-write rule hold
 * here for free. Neither directory is resolved here: both are supplied by the caller (the CLI's
 * job), which keeps this module HOME-independent and its tests deterministic.
 */
import {
  appendTraversalEvents,
  readTraversalSession,
} from "@storytree/context-traversal-capture";
import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
} from "@storytree/context-traversal-telemetry";

import { correlateTranscripts } from "./correlate-transcripts.js";
import { readTranscriptWindow } from "./transcript-occupancy.js";

export interface IngestedWindow {
  readonly windowId: string;
  /** Observations the window yielded. */
  readonly observed: number;
  /** Events actually appended — 0 on a re-ingest. */
  readonly appended: number;
}

export interface TranscriptIngestResult {
  readonly sessionId: string;
  readonly windows: readonly IngestedWindow[];
  readonly scannedFiles: number;
  readonly appended: number;
  /** Assistant-shaped transcript lines skipped across every window. */
  readonly skippedLines: number;
  /** Sidechain requests excluded across every window. */
  readonly sidechainRequests: number;
  /**
   * Transcript files that correlated to this session but named only subagent windows, so no
   * occupancy event was produced from them. Carried through from the correlation verbatim: this
   * adapter observes parent windows, and this is how many windows it reached and did not observe.
   */
  readonly sidechainFiles: number;
}

export interface IngestTranscriptOccupancyArgs {
  readonly sessionId: string;
  /** The trace directory the sink writes under — supplied, never resolved here. */
  readonly traceDir: string;
  /** The host transcript root to scan — supplied, never resolved here. */
  readonly transcriptDir: string;
}

function eventIdFor(windowId: string, requestId: string): string {
  return `host-transcript:${windowId}:${requestId}`;
}

export function ingestTranscriptOccupancy(input: IngestTranscriptOccupancyArgs): TranscriptIngestResult {
  const { sessionId, traceDir, transcriptDir } = input;

  const correlation = correlateTranscripts(sessionId, { dir: transcriptDir });

  // Read the existing trace FIRST so idempotence is a property of the ids, not of run order:
  // an event whose id already appears on disk is never appended again.
  const { replay } = readTraversalSession({ dir: traceDir, sessionId });
  const alreadyPresent = new Set(replay.events.map((event) => event.eventId));

  const windows: IngestedWindow[] = [];
  const toAppend: ContextTraversalEvent[] = [];
  let skippedLines = 0;
  let sidechainRequests = 0;

  for (const window of correlation.windows) {
    const read = readTranscriptWindow(window.file);
    skippedLines += read.skippedLines;
    sidechainRequests += read.sidechainRequests;
    if (read.windowId === undefined) continue;

    const windowId = read.windowId;
    let cumulativeInputTokens = 0;
    let appendedForWindow = 0;

    for (const observation of read.observations) {
      cumulativeInputTokens += observation.residentInputTokens;
      const eventId = eventIdFor(windowId, observation.requestId);

      const event: ContextTraversalEvent = {
        kind: "model_context",
        eventId,
        sessionId,
        at: observation.at,
        windowId,
        ...(observation.modelId !== undefined ? { modelId: observation.modelId } : {}),
        residentInputTokens: observation.residentInputTokens,
        cumulativeInputTokens,
        // Deliberately duplicates cumulativeInputTokens: `addedInputTokens` is deprecated
        // (ADR-0248 D3) and every existing emitter (context-traversal-spawn) sets it equal to the
        // cumulative total from one shared variable. Giving it a real per-request delta here would
        // contradict that accepted decision and leave the eventual deletion increment two patterns
        // to remove instead of one.
        addedInputTokens: cumulativeInputTokens,
      };

      if (!alreadyPresent.has(eventId)) {
        toAppend.push(event);
        appendedForWindow++;
      }
    }

    windows.push({ windowId, observed: read.observations.length, appended: appendedForWindow });
  }

  const appended = appendTraversalEvents(toAppend, { dir: traceDir, sessionId });
  const appendedCount = appended ? toAppend.length : 0;

  return {
    sessionId,
    windows,
    scannedFiles: correlation.scannedFiles,
    appended: appendedCount,
    skippedLines,
    sidechainRequests,
    sidechainFiles: correlation.sidechainFiles,
  };
}

/**
 * Exhaustive coverage declaration for this adapter: `supported` names exactly the five features
 * this floor observes; `omitted` is every remaining member of the closed `CoverageFeature` domain,
 * derived from the vocabulary itself so a future addition can never leave a silent gap. The host
 * transcript surface declares no window size (`field:context_window_capacity` is omitted), and this
 * adapter observes model requests only — every visit/search/candidate/followed-edge/spawn/return
 * feature is omitted too.
 */
const SUPPORTED_FEATURES = [
  "surface:host_transcript",
  "event:model_context",
  "field:model_tokens",
  "field:resident_input_tokens",
  "field:window_id",
] as const;

const supportedSet = new Set<string>(SUPPORTED_FEATURES);

export const HOST_TRANSCRIPT_COVERAGE: ContextTraversalCoverage = ContextTraversalCoverage.parse({
  adapterId: "host-transcript",
  supported: SUPPORTED_FEATURES,
  omitted: CoverageFeature.options.filter((feature) => !supportedSet.has(feature)),
});
