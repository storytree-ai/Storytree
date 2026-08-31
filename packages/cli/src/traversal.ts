/**
 * The `storytree traversal` area — the read surface over captured context-traversal traces
 * (ADR-0235 / ADR-0241), story `context-traversal-capture`.
 *
 * GLUE (ADR-0158): un-asserted connective code in the `cli` building. Every behaviour it exposes
 * lives in the story's own package — this file only maps sub-commands onto that composition and
 * hands back the envelope the dispatch already knows how to print. No capability claims it as
 * proof, and nothing here may re-implement a renderer or touch the trace files directly.
 */
import {
  censusSessionOrigins,
  declareSessionOrigin,
  describeSessionOrigin,
  listTraversalSessions,
  listTraversalSessionsRendered,
  readSessionOriginDeclaration,
  readTraversalSession,
  resolveSessionOrigin,
  resolveTraversalDir,
  sessionOriginPath,
  writeSessionOriginDeclaration,
  CUT_BY_SESSION_ENV,
  CUT_FOR_UNIT_ENV,
  SESSION_ORIGIN_ENV,
} from "@storytree/context-traversal-capture";
import type {
  OriginDeclarationRefusal,
  SessionOrigin,
  SessionOriginDeclaration,
} from "@storytree/context-traversal-capture";
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
      "  storytree traversal origin            how THIS session came to exist — human-started, or",
      "                                        cut by a predecessor (ADR-0484 D7). Bare, it reports",
      "                                        and writes nothing; `--origin human`, `--origin cut`",
      "                                        or `--cut-by <sessionId> [--cut-for <unit>]` declares",
      "                                        it, and every line written from then on carries it.",
      "                                        An undeclared session reads `unknown`, which is NOT a",
      "                                        synonym for human-started — origins are never",
      "                                        inferred from timing, branch names or worktree reuse.",
      "  storytree traversal origin --census   how much of this store's population declared at all",
      "                                        (ADR-0487). A READING of coverage, never a compliance",
      "                                        score: read every origin-derived figure against the",
      "                                        share it reports, because that share is the subset",
      "                                        such a figure was actually computed over.",
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

/** The flags `storytree traversal origin` reads, already parsed by the one strict CLI parse. */
export interface TraversalOptions {
  /** `--origin human|cut`. Spelled exactly as `STORYTREE_SESSION_ORIGIN`'s two words. */
  readonly origin?: string | undefined;
  /** `--cut-by <sessionId>` — the session that cut this one. Implies `cut`. */
  readonly cutBy?: string | undefined;
  /** `--cut-for <arc-or-increment-id>` — what this session was cut to drive. */
  readonly cutFor?: string | undefined;
  /** `--census` — report coverage across the whole local store instead of this one session. */
  readonly census?: boolean | undefined;
}

/**
 * The operator-facing sentence for each refusal the RULE returns.
 *
 * ⚠ THE RULE ITSELF IS NOT HERE, and that is deliberate. `declareSessionOrigin` in
 * `@storytree/context-traversal-capture` decides which combinations are declarable, beside the
 * resolver whose rules those are; this table only says each refusal out loud. The first draft
 * restated all three judgements inside this dispatch, which is two copies of one rule — and two
 * copies drift silently, leaving the CLI refusing a combination the resolver had started accepting.
 *
 * Every sentence names the REASON rather than just the rule, because an operator who is told only
 * "not allowed" learns nothing and tries the next spelling.
 */
const REFUSAL_SENTENCE = {
  "origin-word-unknown":
    '--origin must be "human" (an operator started this session) or "cut" (a predecessor session ' +
    "cut it). There is deliberately no third word: a session that cannot say is left UNDECLARED, " +
    "which is its own answer.",
  "human-carries-no-cut-riders":
    "--origin human carries no --cut-by / --cut-for: a session an operator started was cut by " +
    "nobody, for nothing. Recording either would put a value on the row that a later reader could " +
    "quote back as a cut.",
  "cut-for-alone-declares-nothing":
    "--cut-for alone declares nothing. A human-started session driving an increment could carry the " +
    "same value honestly, so treating it as proof of a cut would be an inference rather than a " +
    "record. Add --origin cut, or --cut-by <the session that cut you>.",
  // `satisfies`, not an annotation: the annotation discards the literal key set, and the key set is
  // what makes a NEW refusal code in the rule fail to compile here rather than print `undefined`.
  //
  // ⚠ `nothing-to-declare` IS ABSENT ON PURPOSE, and its absence is what removed a second predicate
  // from this file. That code means every flag was absent — which on this surface is not a refusal
  // at all, it is a bare `storytree traversal origin`, which REPORTS. The first draft asked the same
  // question twice, once as its own `declaring` boolean and once inside the rule, and two spellings
  // of one predicate is exactly what drifts.
} satisfies Record<Exclude<OriginDeclarationRefusal, "nothing-to-declare">, string>;

type PrintableRefusal = keyof typeof REFUSAL_SENTENCE;

function originRefusal(because: PrintableRefusal): Envelope {
  return {
    ok: false,
    body: REFUSAL_SENTENCE[because],
    next: ["storytree traversal origin — what this session currently says, and how to declare it"],
  };
}

/**
 * WHICH CHANNEL ANSWERED, said plainly on the report.
 *
 * The two are not equally strong and the render says which one spoke: a declaration is keyed by this
 * session's own id, while an environment variable is inherited by whatever was started under it. And
 * "nobody" is a first-class third answer rather than a blank — a report that simply omitted the line
 * would leave the reader supplying the missing word themselves, which on this surface means "human".
 */
function whoStated(
  declaration: SessionOriginDeclaration | null,
  resolved: SessionOrigin | null,
): string {
  if (declaration !== null) {
    return declaration.declaredAt === null
      ? "by this session"
      : `by this session, ${declaration.declaredAt}`;
  }
  if (resolved !== null) return "by this session's environment";
  return "by nobody — and nothing here will guess";
}

/** The two lines a session hands its successor, and the one it can run itself. */
function originHowTo(sessionId: string): readonly string[] {
  return [
    "Declare it, and every line this session writes from here on carries the answer:",
    "  storytree traversal origin --origin human",
    "  storytree traversal origin --cut-by <the session that cut you> [--cut-for <arc-or-increment-id>]",
    "",
    "Cutting a successor? Put this line in the brief you author for it — it is the one thing the",
    "successor cannot work out for itself, and nothing may infer it after the fact:",
    `  storytree traversal origin --cut-by ${sessionId} --cut-for <arc-or-increment-id>`,
    "",
    `A storytree-owned launcher can set ${SESSION_ORIGIN_ENV} / ${CUT_BY_SESSION_ENV} /`,
    `${CUT_FOR_UNIT_ENV} in the child's environment instead. The declaration wins where both are`,
    "present: it is keyed by this session's own id, and an exported variable is not.",
  ];
}

/**
 * `storytree traversal origin --census` — how much of the store's population declared (ADR-0487).
 *
 * ⚠ A READING, NOT A COMPLIANCE GRADE. It exists so that the partiality of origin coverage is
 * visible in the data rather than assumed away: every figure computed over origins is computed over
 * the DECLARED subset, and without this number a reader cannot tell how large that subset is. It is
 * deliberately not a gate rung and must not become one — a gate over a judgment ceremony is
 * `a-compliance-gate-turns-a-judgment-ceremony-into-theatre`, and this one could not score the
 * honest case (a session that never ran the verb) as anything but a failure.
 *
 * It reads the ORIGIN STAMPED ON THE LINES, not the declaration files, and the difference is the
 * point: a declaration applies FORWARD only, so what a trace can actually be read as is what its
 * lines say. A session that declared late reads `unknown` for the events that preceded it, and this
 * census reports that honestly rather than crediting the whole session to the later answer.
 */
function traversalOriginCensus(): Envelope {
  const summaries = listTraversalSessions({ dir: resolveTraversalDir() });
  const census = censusSessionOrigins(summaries.map((s) => s.origin.reading));
  const pct = (n: number): string =>
    census.total === 0 ? "—" : `${((n / census.total) * 100).toFixed(1)}%`;

  const lines = [
    "traversal origin --census — who started the sessions in this store (ADR-0487)",
    "",
    `sessions: ${census.total} with at least one captured event`,
    "",
    `  human:   ${census.human}  (${pct(census.human)})  started by an operator`,
    `  cut:     ${census.cut}  (${pct(census.cut)})  cut by a predecessor session`,
    `  unknown: ${census.unknown}  (${pct(census.unknown)})  never declared — NOT a synonym for human-started`,
    `  mixed:   ${census.mixed}  (${pct(census.mixed)})  contradictory; neither answer may be quoted`,
    "",
    `quotable: ${(census.quotableShare * 100).toFixed(1)}% of sessions carry an origin a reader may quote.`,
  ];

  if (census.quotableShare < 1) {
    lines.push(
      "",
      "READ EVERY ORIGIN-DERIVED FIGURE AGAINST THAT SHARE. The remainder is not a population with",
      "no origin — it is one whose origin nobody recorded, and nothing here will guess it. This is a",
      "reading of coverage and never a compliance score: a session that did not declare is not in",
      "breach of anything, and the honest response to a low share is to distrust the derived figure,",
      "not to chase the sessions.",
    );
  }

  return {
    ok: true,
    body: lines.join("\n"),
    next: ["storytree traversal origin — what THIS session says, and how to declare it"],
  };
}

/**
 * `storytree traversal origin` — how this session came to exist (ADR-0484 D7).
 *
 * WHAT IT IS FOR. A trace records what a session READ; it has never recorded WHO STARTED IT, so
 * every reading of the data has had to assume. A session cut by a predecessor is BRIEFED by that
 * predecessor, and its first reads therefore follow an agent-authored handover rather than an
 * operator's prompt — which means a figure attributing those reads to what the owner asked for is
 * wrong for an unknown share of them. This verb is the route by which a session says which it is.
 *
 * Bare, it REPORTS and writes nothing — including the `unknown` that is the honest answer for a
 * session which never declared. With flags it writes the declaration, and says plainly how many
 * events were already recorded WITHOUT it: an origin applies forward only, never backwards.
 */
function traversalOrigin(
  opts: TraversalOptions,
  sessionId: string | null,
  now: () => Date,
): Envelope {
  if (sessionId === null) {
    return {
      ok: false,
      body: [
        "storytree traversal origin — this invocation resolves no session identity, so there is no",
        "session to report on or declare for (the primary checkout, CI, and the lobby all resolve",
        "none — the same runs that capture no trace at all).",
        "",
        "A harness-run session resolves its own context window; an explicit STORYTREE_SESSION_ID",
        "overrides it.",
      ].join("\n"),
      next: ["storytree traversal list — the captured session ids"],
    };
  }

  const dir = resolveTraversalDir();

  const asked = declareSessionOrigin(opts, now().toISOString());
  if ("refusedBecause" in asked && asked.refusedBecause !== "nothing-to-declare") {
    return originRefusal(asked.refusedBecause);
  }

  if ("declaration" in asked) {
    const built = asked;
    const { replay } = readTraversalSession({ dir, sessionId });
    const already = replay.events.length;
    if (!writeSessionOriginDeclaration(dir, sessionId, built.declaration)) {
      return {
        ok: false,
        body: [
          `could not write the origin declaration to ${sessionOriginPath(dir, sessionId)}.`,
          "",
          "Nothing else changed: the session simply stays undeclared, which reads as `unknown` — the",
          "one thing that never happens is a guessed origin taking its place.",
        ].join("\n"),
        next: ["storytree traversal origin — what this session currently says"],
      };
    }

    const { origin, cutBy, cutFor } = built.declaration;
    const lines = [
      "traversal origin — declared (ADR-0484 D7)",
      "",
      `session: ${sessionId}`,
      `origin:  ${origin} — ${describeSessionOrigin(origin)}`,
    ];
    if (cutBy !== null) lines.push(`cut by:  ${cutBy}`);
    if (cutFor !== null) lines.push(`cut for: ${cutFor}`);
    lines.push(
      "",
      "Every line this session writes from here on carries it.",
      already === 0
        ? "Nothing was recorded before this, so the whole trace carries the answer."
        : `The ${already} event(s) already recorded keep what they were stamped with — an origin is ` +
          "applied forward, never backwards, because a retrofitted provenance cannot be told apart " +
          "from a recorded one.",
    );
    return { ok: true, body: lines.join("\n"), next: [`storytree traversal show ${sessionId}`] };
  }

  const declaration = readSessionOriginDeclaration(dir, sessionId);
  const resolved: SessionOrigin | null = resolveSessionOrigin({ env: process.env, declaration });
  const reading = resolved?.kind ?? "unknown";

  const lines = [
    "traversal origin — how this session says it came to exist (ADR-0484 D7)",
    "",
    `session: ${sessionId}`,
    `origin:  ${reading} — ${describeSessionOrigin(reading)}`,
  ];
  if (resolved !== null && resolved.cutBy !== null) lines.push(`cut by:  ${resolved.cutBy}`);
  if (resolved !== null && resolved.cutFor !== null) lines.push(`cut for: ${resolved.cutFor}`);
  lines.push(`stated:  ${whoStated(declaration, resolved)}`, "", ...originHowTo(sessionId));

  return { ok: true, body: lines.join("\n"), next: [`storytree traversal show ${sessionId}`] };
}

/** What the `traversal` area needs from the composition root. */
export interface TraversalDeps {
  /** The shared traversal log — the live `--pg` store, or null/absent when there is none. */
  readonly traversalEvents?: TraversalEventStore | null;
  /**
   * This session's trace identity, resolved LAZILY — `origin` is the only sub-command that needs
   * it, and resolving it shells out to git (ADR-0162's startup budget is what that pays for).
   */
  readonly resolveSessionId?: () => string | null;
  /** Injected clock, so a declaration's `declaredAt` is deterministic under test. */
  readonly now?: () => Date;
}

/**
 * Dispatch one `traversal` invocation. Every sub-command but `ship` is a local read: this area does
 * not touch the corpus, and only `ship` touches the database at all.
 */
export async function traversalCommand(
  sub: string | undefined,
  third: string | undefined,
  opts: TraversalOptions = {},
  deps: TraversalDeps = {},
): Promise<Envelope> {
  if (sub === undefined || sub === "list" || sub === "sessions") {
    return listTraversalSessionsRendered();
  }

  if (sub === "origin") {
    // BEFORE the identity resolve, deliberately: a census is about the STORE, so it neither needs
    // this session's id nor should be refused when there is none. Resolving first would make the
    // reading unavailable in exactly the runs (the lobby, CI) most likely to want to ask for it.
    if (opts.census === true) return traversalOriginCensus();
    const resolveSessionId = deps.resolveSessionId ?? (() => null);
    return traversalOrigin(opts, resolveSessionId(), deps.now ?? (() => new Date()));
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
    body: `unknown traversal sub-command "${sub}" — expected "list", "show", "origin", "ingest", "backlog", or "ship".`,
    next: ["storytree traversal --help"],
  };
}
