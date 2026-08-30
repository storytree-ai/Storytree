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
import { shipTraversalBacklog, traversalShipBacklog } from "@storytree/context-traversal-capture/store";
import type { TraversalEventStore } from "@storytree/context-traversal-capture/store";
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
      "  storytree traversal backlog           what has NOT reached the shared store yet, and",
      "                                        since when. Offline — reads the local cursors.",
      "  storytree traversal ship --pg         drain the local traces into the shared store",
      "                                        (ADR-0484). Runs out of band; a command never",
      "                                        waits on it. Retries are the cursor, so re-running",
      "                                        after a failure is the normal repair.",
      "",
      "The shared log holds what was traced FORWARD from 2026-08-30 (ADR-0484 D6): a session's",
      "pre-existing local history stays local and is never backfilled, so a question spanning the",
      "change reads both stores.",
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
    // THE TWO ADAPTERS AGREE ON WHAT A SESSION IS AGAIN (`linked-session-context-arc-inc-32`).
    // inc-30 made terminal-CLI reads keyed by the host context WINDOW while this ingest still keyed
    // occupancy by the correlated storytree session (the worktree SLOT), so the two landed in
    // different files and `traversal show <windowId>` reported capacity as unknown even after a
    // successful ingest. A DISCLOSURE of that split stood here; the split is now closed, so the
    // disclosure would be a false statement rather than a stale one and is replaced, not kept.
    // Correlation is still slot-driven — the `cwd` join (ADR-0248) is what FINDS the transcripts —
    // and only the destination moved.
    "note: occupancy is written under each WINDOW id listed above, not under the session id — the",
    "same identity the terminal-CLI reads use, so a window's replay carries its reads and this",
    "series together. The session id above is recorded on each line as the grouping slot.",
    "",
    // ADR-0235 clause 6 — an adapter publishes what it can observe AT ITS OWN BOUNDARY. The replay
    // renderer in `context-traversal-spawn` does not yet know this adapter; until it does, this is
    // where the declaration is honest rather than nowhere.
    `coverage: adapter=${HOST_TRANSCRIPT_COVERAGE.adapterId} supported=[${HOST_TRANSCRIPT_COVERAGE.supported.join(", ")}] omitted=[${HOST_TRANSCRIPT_COVERAGE.omitted.join(", ")}]`,
  );

  return {
    ok: true,
    body: lines.join("\n"),
    // Offer the WINDOWS, because they are where the series now is. Offering `show <sessionId>` would
    // point at a file this ingest no longer writes — a follow-up command that answers empty is worse
    // than none, since it reads as "the ingest recorded nothing". Falls back to the session id only
    // when nothing correlated, where it is the honest thing to re-run against.
    next:
      result.windows.length > 0
        ? result.windows.map(
            (window) => `storytree traversal show ${window.windowId} — replay that window with its occupancy series`,
          )
        : [`storytree traversal show ${sessionId} — replay the session (no window correlated to ingest)`],
  };
}

/**
 * `storytree traversal backlog` — what has not reached the shared store, and since when
 * (ADR-0484 D4's reportable backlog).
 *
 * OFFLINE, deliberately: it reads this machine's own ship cursors and the unshipped tail of each
 * waiting trace. A backlog report that needed the database would be unable to answer in exactly the
 * case it exists for — the database being unreachable is the commonest reason there IS a backlog.
 *
 * The report distinguishes the two states a bare "no data" collapses: sessions merely WAITING (the
 * shipper has not run, or has nothing new) and sessions FAILING (the last attempt did not land, and
 * here is what it said).
 */
function traversalBacklogReport(): Envelope {
  const dir = resolveTraversalDir();
  const backlog = traversalShipBacklog(dir);

  const lines = [
    "traversal backlog — local traces not yet in the shared store (ADR-0484 D4)",
    "",
    `tracked ${backlog.tracked} session(s) since the ship path landed; ${backlog.totalUnshippedEvents} event(s) unshipped`,
  ];
  if (backlog.oldestUnshippedAt !== undefined) {
    lines.push(`oldest unshipped event observed at ${backlog.oldestUnshippedAt}`);
  }

  if (backlog.waiting.length === 0) {
    lines.push("", "nothing waiting — every tracked session is up to date in the shared store.");
  } else {
    lines.push("", "waiting:");
    for (const row of backlog.waiting) {
      lines.push(
        `  ${row.sessionId} — ${row.unshippedEvents} event(s), ${row.unshippedBytes} byte(s)` +
          (row.oldestUnshippedAt !== undefined ? `, oldest ${row.oldestUnshippedAt}` : ""),
      );
    }
  }

  if (backlog.failing.length > 0) {
    lines.push("", "FAILING — the last ship attempt did not land (this is not 'nothing happened'):");
    for (const row of backlog.failing) {
      lines.push(
        `  ${row.sessionId} — ${row.consecutiveFailures} consecutive failure(s)` +
          (row.lastAttemptAt !== undefined ? `, last tried ${row.lastAttemptAt}` : "") +
          `: ${row.lastError ?? "reason unrecorded"}`,
      );
    }
  }

  lines.push(
    "",
    // Sessions with no cursor are pre-landing history and are NOT part of this count. Said out
    // loud, because a total that quietly excluded them would read as "everything is shipped".
    "history written before the ship path landed is not counted here and is never backfilled",
    "(ADR-0484 D6) — it stays readable through `storytree traversal show <session>`.",
  );

  return {
    ok: true,
    body: lines.join("\n"),
    next:
      backlog.waiting.length > 0
        ? ["storytree traversal ship --pg — drain the backlog into the shared store"]
        : ["storytree traversal list — the captured session ids"],
  };
}

/**
 * `storytree traversal ship --pg` — drain this machine's local traces into the shared store.
 *
 * The verb exists so the ship is ADDRESSABLE: the ordinary path is the throttled detached sweep the
 * capture path starts, and this is the same sweep run deliberately — after a fix, on a machine that
 * has been offline, or to see what the backlog does when it is asked to move.
 *
 * `--pg` is required and that is not ceremony: this is the one traversal verb that talks to the
 * database, and a bare read must not open a pool it did not already need (ADR-0484 D4).
 */
async function traversalShip(store: TraversalEventStore | null | undefined): Promise<Envelope> {
  if (store === null || store === undefined) {
    return {
      ok: false,
      body: [
        "storytree traversal ship needs --pg — the shared traversal log lives in the live store.",
        "",
        "Nothing is lost by not running it: every event is already durable in this machine's local",
        "trace, and `storytree traversal backlog` reports what is waiting.",
      ].join("\n"),
      next: ["storytree traversal backlog — what is waiting, and since when"],
    };
  }

  const dir = resolveTraversalDir();
  const report = await shipTraversalBacklog({ dir, store });
  const lines = [
    "traversal ship — draining local traces into the shared store (ADR-0484 D1)",
    "",
    `shipped ${report.shipped} event(s) across ${report.sessions.length} session(s)`,
  ];
  if (report.unshippable > 0) {
    lines.push(`skipped ${report.unshippable} unusable line(s) — counted, and stepped past`);
  }
  if (report.failed > 0) {
    lines.push(`${report.failed} session(s) FAILED to ship; their cursors did not advance and will retry`);
  }
  for (const outcome of report.sessions) {
    lines.push(
      `  ${outcome.sessionId} — ${outcome.ok ? `shipped ${outcome.shipped}` : `FAILED: ${outcome.error ?? "unknown"}`}`,
    );
  }

  return {
    ok: report.failed === 0,
    body: lines.join("\n"),
    next: ["storytree traversal backlog — what is still waiting"],
  };
}

/** What the `traversal` area needs from the composition root. */
export interface TraversalDeps {
  /** The shared traversal log — the live `--pg` store, or null/absent when there is none. */
  readonly traversalEvents?: TraversalEventStore | null;
}

/**
 * Dispatch one `traversal` invocation. Every sub-command but `ship` is a local read: this area does
 * not touch the corpus, and only `ship` touches the database at all.
 */
export async function traversalCommand(
  sub: string | undefined,
  third: string | undefined,
  deps: TraversalDeps = {},
): Promise<Envelope> {
  if (sub === undefined || sub === "list" || sub === "sessions") {
    return listTraversalSessionsRendered();
  }

  if (sub === "backlog") {
    return traversalBacklogReport();
  }

  if (sub === "ship") {
    return traversalShip(deps.traversalEvents);
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
    body: `unknown traversal sub-command "${sub}" — expected "list", "show", "ingest", "backlog", or "ship".`,
    next: ["storytree traversal --help"],
  };
}
