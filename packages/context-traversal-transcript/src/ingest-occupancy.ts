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
 *
 * ## OCCUPANCY IS KEYED BY WINDOW, AND CORRELATION IS STILL KEYED BY SLOT
 *
 * These are two different questions and this module answers them differently on purpose
 * (`linked-session-context-arc-inc-32`). WHICH transcripts belong to a session is answered by the
 * `cwd` join (ADR-0248) — matching the final segment of `.claude/worktrees/<name>`, i.e. the
 * worktree SLOT — so the verb's argument is still the storytree session. WHERE the findings land is
 * answered by the context WINDOW each observation was read from: each window's events carry that
 * window as their `sessionId` and are appended to that window's own trace, `grade: "window"`, with
 * the storytree session recorded beside them as the `slot` grouping attribute.
 *
 * `linked-session-context-arc-inc-30` had made the terminal-CLI read trace's identity the host
 * window while this ingest still keyed occupancy by the slot, so the two adapters disagreed about
 * what a session was: `traversal show <windowId>` rendered a window's reads and reported
 * `capacity: unknown` even after a successful ingest, while `traversal show <slot>` rendered the
 * occupancy and none of the reads. inc-30 DISCLOSED that rather than fixing it, because the repair
 * lives in this story and its fence did not reach here. The disclosure the CLI printed is REPLACED
 * rather than left standing — it would now be a false statement, not merely a stale one.
 *
 * ⚠ Renaming the destination file alone would NOT have moved the series: `replay(sessionId)` filters
 * on `event.sessionId`, so the events themselves have to carry the window's identity. Both halves
 * are asserted, and the "no session-keyed file" half is asserted as file EXISTENCE — a reader over a
 * missing file returns an empty replay exactly as a genuinely empty one does.
 *
 * Traces already written under a slot are left alone: they are local, unretained and version-pinned
 * (ADR-0241), so nothing is owed a migration, and their ungraded lines classify as the legacy `slot`
 * era, which `traversal list` / `show` already label honestly.
 */
import {
  appendTraversalEvents,
  readTraversalSession,
} from "@storytree/context-traversal-capture";
import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
  type ModelContextEvent,
} from "@storytree/context-traversal-telemetry";

import { correlateTranscripts } from "./correlate-transcripts.js";
import { recordHarnessIngestRun } from "./ingest-receipt.js";
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
  /**
   * The traces this run stamped with an ingest RECEIPT (ADR-0484 D5 deliverable 4) — the requested
   * session plus every window the occupancy landed in.
   *
   * The stamp is what lets a later replay tell *this session was measured and had nothing* from
   * *nobody ever ran the ingest here*, which a trace alone cannot say about itself: this adapter is
   * not ambient, and a run recovering nothing writes no event. It is therefore written even when
   * {@link TranscriptIngestResult.appended} is zero, which is precisely the case it exists for.
   */
  readonly receipted: readonly string[];
  /** Traces whose receipt could not be written. Reported, never swallowed — the run still stands. */
  readonly receiptFailures: readonly string[];
}

export interface IngestTranscriptOccupancyArgs {
  readonly sessionId: string;
  /** The trace directory the sink writes under — supplied, never resolved here. */
  readonly traceDir: string;
  /** The host transcript root to scan — supplied, never resolved here. */
  readonly transcriptDir: string;
  /**
   * The clock the receipt is stamped from, ISO-8601. Injected so this module stays deterministic —
   * every other timestamp it writes originates at the observation, and this one originates at the
   * RUN, which is the one fact a receipt is about.
   */
  readonly now?: () => string;
}

function eventIdFor(windowId: string, requestId: string): string {
  return `host-transcript:${windowId}:${requestId}`;
}

export function ingestTranscriptOccupancy(input: IngestTranscriptOccupancyArgs): TranscriptIngestResult {
  const { sessionId, traceDir, transcriptDir } = input;

  // CORRELATION STAYS SLOT-DRIVEN, AND ONLY THE DESTINATION MOVES. The `cwd` join (ADR-0248) is
  // what FINDS a session's transcripts in the first place — it matches the final segment of
  // `.claude/worktrees/<name>`, which is the worktree SLOT — so the verb's argument is still the
  // storytree session. What changed is where its findings LAND.
  const correlation = correlateTranscripts(sessionId, { dir: transcriptDir });

  const windows: IngestedWindow[] = [];
  let skippedLines = 0;
  let sidechainRequests = 0;
  let appendedCount = 0;

  for (const window of correlation.windows) {
    const read = readTranscriptWindow(window.file);
    skippedLines += read.skippedLines;
    sidechainRequests += read.sidechainRequests;
    if (read.windowId === undefined) continue;

    const windowId = read.windowId;

    // IDEMPOTENCE IS NOW PER WINDOW, because each window's events live in the window's own trace.
    // Read that trace FIRST so idempotence stays a property of the IDS, not of run order: an event
    // whose id already appears on disk is never appended again. This costs one read per correlated
    // window rather than one per ingest, which is the price of the split and is paid deliberately.
    //
    // It also STRENGTHENS the guarantee rather than merely preserving it. The old single read was
    // taken once, before any append, so two transcript FILES naming the same window inside one run
    // (the shape a resumed or forked session produces) both missed the guard and wrote the request
    // twice. Reading inside the loop means the second file sees the first file's append.
    const { replay } = readTraversalSession({ dir: traceDir, sessionId: windowId });
    const alreadyPresent = new Set(replay.events.map((event) => event.eventId));

    const toAppend: ContextTraversalEvent[] = [];
    let cumulativeInputTokens = 0;

    for (const observation of read.observations) {
      cumulativeInputTokens += observation.residentInputTokens;
      const eventId = eventIdFor(windowId, observation.requestId);

      // An unattributed observation carries NO `modelId` key, exactly as before — the sink's
      // schema parse is what fixes the wire key order, so drafting here changes no output.
      const event: ModelContextEvent = {
        kind: "model_context",
        eventId,
        // THE EVENT'S SESSION IS THE WINDOW IT WAS READ FROM, not the storytree session that found
        // it. `replay(sessionId)` filters on `event.sessionId`, so the file name alone would not
        // have moved the series — the events themselves have to carry the window's identity, which
        // is the same id `linked-session-context-arc-inc-30` gave the terminal-CLI reads. That is
        // what puts a window's reads and its occupancy in one replay instead of two files.
        sessionId: windowId,
        at: observation.at,
        windowId,
        residentInputTokens: observation.residentInputTokens,
        cumulativeInputTokens,
        // Deliberately duplicates cumulativeInputTokens: `addedInputTokens` is deprecated
        // (ADR-0248 D3) and every existing emitter (context-traversal-spawn) sets it equal to the
        // cumulative total from one shared variable. Giving it a real per-request delta here would
        // contradict that accepted decision and leave the eventual deletion increment two patterns
        // to remove instead of one.
        addedInputTokens: cumulativeInputTokens,
      };
      if (observation.modelId !== undefined) event.modelId = observation.modelId;

      if (!alreadyPresent.has(eventId)) toAppend.push(event);
    }

    // The identity attributes the sink stamps on every line: `grade: "window"` says this id IS one
    // context window (`TraceIdentityGrade`, inc-30), and the storytree session rides along as the
    // `slot` GROUPING attribute — never as the identity, which is the whole point of that decision.
    // Before this, occupancy lines carried no grade at all and `classifyTraceIdentity` therefore
    // read them as the legacy slot era. They now classify honestly beside the reads.
    const appended = appendTraversalEvents(toAppend, {
      dir: traceDir,
      sessionId: windowId,
      grade: "window",
      slot: sessionId,
    });
    const appendedForWindow = appended ? toAppend.length : 0;
    appendedCount += appendedForWindow;

    windows.push({ windowId, observed: read.observations.length, appended: appendedForWindow });
  }

  // THE RECEIPT (ADR-0484 D5 deliverable 4). Stamped for the trace the caller ASKED about and for
  // every window the series actually landed in, because those are two different traces and a reader
  // holding either one is entitled to know whether anybody ever looked.
  //
  // The requested session is stamped with the run's TOTALS and each window with its own. Where the
  // requested session IS one of the windows, the window's own numbers are the ones that stand —
  // `Map.set` overwrites, and the more specific fact about that trace is the honest one to keep.
  const at = (input.now ?? (() => new Date().toISOString()))();
  const stamps = new Map<string, { observed: number; appended: number }>([
    [
      sessionId,
      {
        observed: windows.reduce((sum, window) => sum + window.observed, 0),
        appended: appendedCount,
      },
    ],
  ]);
  for (const window of windows) {
    stamps.set(window.windowId, { observed: window.observed, appended: window.appended });
  }

  const receipted: string[] = [];
  const receiptFailures: string[] = [];
  for (const [traceId, counts] of stamps) {
    const ok = recordHarnessIngestRun({
      traceDir,
      sessionId: traceId,
      adapter: "host-transcript-occupancy",
      observed: counts.observed,
      appended: counts.appended,
      at,
    });
    (ok ? receipted : receiptFailures).push(traceId);
  }

  return {
    sessionId,
    windows,
    scannedFiles: correlation.scannedFiles,
    appended: appendedCount,
    skippedLines,
    sidechainRequests,
    sidechainFiles: correlation.sidechainFiles,
    receipted,
    receiptFailures,
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
