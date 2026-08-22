/**
 * The `storytree traversal` area — the read surface over captured context-traversal traces
 * (ADR-0235 / ADR-0241), story `context-traversal-capture`.
 *
 * GLUE (ADR-0158): un-asserted connective code in the `cli` building. Every behaviour it exposes
 * lives in the story's own package — this file only maps sub-commands onto that composition and
 * hands back the envelope the dispatch already knows how to print. No capability claims it as
 * proof, and nothing here may re-implement a renderer or touch the trace files directly.
 */
import { listTraversalSessionsRendered, resolveTraversalDir } from "@storytree/context-traversal-capture";
import { showTraversalSessionAllAdapters } from "@storytree/context-traversal-spawn";
import {
  HOST_TRANSCRIPT_COVERAGE,
  ingestTranscriptOccupancy,
  resolveTranscriptDir,
} from "@storytree/context-traversal-transcript";

import type { Envelope } from "./envelope.js";

export function traversalHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree traversal — replay this machine's captured context-traversal traces.",
      "",
      "Traces are local, per-session, metadata-only JSONL under ~/.storytree/traces",
      "(override with STORYTREE_TRAVERSAL_DIR). Capture is on by default and opts out",
      "with STORYTREE_TRAVERSAL=off (ADR-0241).",
      "",
      "  storytree traversal list              the captured sessions, newest observed first",
      "  storytree traversal show <session>    replay one session chronologically",
      "  storytree traversal ingest <session>  read this session's host transcript windows and",
      "                                        append their per-request context OCCUPANCY",
      "                                        (ADR-0248 D1). Idempotent — re-running appends",
      "                                        nothing. Transcripts are read from",
      "                                        ~/.claude/projects (STORYTREE_TRANSCRIPT_DIR).",
    ].join("\n"),
    next: ["storytree traversal list — find a captured session id"],
  };
}

/**
 * `storytree traversal ingest <sessionId>` — the host-transcript adapter's boundary (ADR-0248 D1).
 *
 * READS rather than emitting ambiently, and the reason is a property of the surface: the host
 * harness writes the transcript and has not flushed the current request when our process runs, so
 * an ambient hook at dispatch would observe a file missing exactly the request that triggered it.
 * Ingest is explicit and idempotent instead, so running it repeatedly is the normal way to keep a
 * live session's trace current.
 */
function traversalIngest(sessionId: string): Envelope {
  const result = ingestTranscriptOccupancy({
    sessionId,
    traceDir: resolveTraversalDir(),
    transcriptDir: resolveTranscriptDir(),
  });

  const lines = [
    `traversal ingest — ${sessionId}`,
    "",
    `scanned ${result.scannedFiles} transcript file(s); correlated ${result.windows.length} window(s)`,
  ];
  for (const window of result.windows) {
    lines.push(`  window=${window.windowId} observed=${window.observed} appended=${window.appended}`);
  }
  lines.push(
    "",
    `appended ${result.appended} occupancy event(s)`,
    `skipped ${result.skippedLines} unusable transcript line(s); excluded ${result.sidechainRequests} sidechain request(s)`,
    // Reached-but-unobserved, stated separately from the two counts above: those describe lines
    // inside windows this adapter DID observe, while this one sizes the windows it reached and did
    // not observe at all. Left unsaid, a subagent-heavy session reads as fully ingested.
    `reached ${result.sidechainFiles} subagent window(s) this adapter does not observe`,
    "",
    // THE TWO ADAPTERS NO LONGER AGREE ON WHAT A SESSION IS, and that is said here rather than left
    // for a reader to discover as a missing capacity line (`linked-session-context-arc-inc-30`).
    // Terminal-CLI reads are now keyed by the host context WINDOW; this ingest still keys occupancy
    // by the correlated storytree session, which is the worktree SLOT — the identity the `cwd` join
    // is built on (ADR-0248). So an ingested slot trace and a window's read trace are different
    // files, and `traversal show <windowId>` reports capacity as unknown even after an ingest.
    // Moving the ingest to window keying is transcript-story work, not something to infer here.
    "note: occupancy is written under the storytree session id above (the worktree slot), while",
    "terminal-CLI reads are keyed by the host context window — so a window's replay will not carry",
    "this series. `storytree traversal show <this id>` is where the occupancy lands.",
    "",
    // ADR-0235 clause 6 — an adapter publishes what it can observe AT ITS OWN BOUNDARY. The replay
    // renderer in `context-traversal-spawn` does not yet know this adapter; until it does, this is
    // where the declaration is honest rather than nowhere.
    `coverage: adapter=${HOST_TRANSCRIPT_COVERAGE.adapterId} supported=[${HOST_TRANSCRIPT_COVERAGE.supported.join(", ")}] omitted=[${HOST_TRANSCRIPT_COVERAGE.omitted.join(", ")}]`,
  );

  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree traversal show ${sessionId} — replay the session with its occupancy series`],
  };
}

/**
 * Dispatch one `traversal` invocation. Reads only: this area never writes a trace, so it is
 * offline-safe and needs no `--pg`.
 */
export function traversalCommand(sub: string | undefined, third: string | undefined): Envelope {
  if (sub === undefined || sub === "list" || sub === "sessions") {
    return listTraversalSessionsRendered();
  }

  if (sub === "show") {
    if (third === undefined) {
      return {
        ok: false,
        body: "storytree traversal show <sessionId> — which captured session should be replayed?",
        next: ["storytree traversal list — the captured session ids"],
      };
    }
    // The MULTI-adapter replay, not increment 2's single-adapter `showTraversalSession`: that one
    // hardcodes `TERMINAL_CLI_DISPATCH_COVERAGE`, whose omitted list names the three spawn event
    // kinds. Once a build emits, rendering those under a declaration that denies them is exactly
    // the ADR-0235 clause 6 dishonesty — so the replay declares every INSTALLED adapter's coverage.
    return showTraversalSessionAllAdapters(third);
  }

  if (sub === "ingest") {
    if (third === undefined) {
      return {
        ok: false,
        body: "storytree traversal ingest <sessionId> — which session's host transcripts should be read?",
        next: ["storytree traversal list — the captured session ids"],
      };
    }
    return traversalIngest(third);
  }

  return {
    ok: false,
    body: `unknown traversal sub-command "${sub}" — expected "list", "show", or "ingest".`,
    next: ["storytree traversal --help"],
  };
}
