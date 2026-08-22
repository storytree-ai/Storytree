/**
 * Turns the decision-record reads the host harness has been writing all along into validated
 * `full_payload_read` traversal events on disk, idempotently — story
 * `context-traversal-transcript`, capability `transcript-decision-read-ingest`
 * (ADR-0403 / `adrs-into-the-dag-arc-inc-07`).
 *
 * Composes two already-proven pieces — `collectTranscriptFiles` (the SAME walk, at the same depth
 * bound, that occupancy correlation uses) and `scanTranscriptDecisionReads` (this increment's
 * extractor) — with the durable sink `appendTraversalEvents` / `readTraversalSession`. Every byte
 * written goes through that sink, so ADR-0241 D4's validate-before-write rule holds here for free.
 * Neither directory is resolved here: both are supplied by the caller, which keeps this module
 * HOME-independent and its tests deterministic.
 *
 * ## IT IS A BATCH INGEST, AND THAT IS A PROPERTY OF THE RECORD
 *
 * Unlike `observeCliInvocation`, which records as the command runs, this reads a file the harness
 * wrote at some earlier moment. The trace is therefore only as current as the last run of this
 * ingest, and {@link renderDecisionReadIngest} says so on its own face rather than letting a reader
 * take the count for a live one.
 *
 * ## AND A ZERO FROM IT IS NOW A VERDICT, NOT A SILENCE
 *
 * The extractor beneath this one matched a FILE PATH, and `docs/decisions/` was deleted whole on
 * 2026-08-22 (ADR-0403 dec 1). From that commit it could only ever return zero, and it returned it
 * the same way it would have reported a genuinely quiet machine — the third instance of one fault
 * class on that migration. {@link DecisionReadIngestResult.blind} is the repair: the sweep now also
 * counts the tool calls that NAMED a decision and yielded nothing, so zero-reads-with-many-mentions
 * is reported as an instrument out of date with its subject, and `probe:decision-reads` exits
 * non-zero on it rather than printing an empty table under a success banner.
 *
 * ## WHY IT SWEEPS EVERY SESSION AT ONCE
 *
 * `ingestTranscriptOccupancy` takes ONE session id, because occupancy is something a live session
 * asks about itself. This one is retroactive by construction: its whole purpose is to recover the
 * history back to 2026-06-08 across every worktree that ever ran, against an arc grounding of ZERO
 * recorded decision reads. So it derives the session from each line's own `cwd` and writes into as
 * many session traces as it finds.
 */
import {
  appendTraversalEvents,
  readTraversalSession,
} from "@storytree/context-traversal-capture";
import {
  ContextTraversalCoverage,
  CoverageFeature,
  type ContextTraversalEvent,
} from "@storytree/context-traversal-telemetry";

import { collectTranscriptFiles } from "./correlate-transcripts.js";
import {
  DECISION_READ_SURFACES,
  scanTranscriptDecisionReads,
  type DecisionRead,
  type DecisionReadShape,
  type DeclinedVerb,
} from "./decision-reads.js";

/** One session's slice of the sweep. */
export interface IngestedDecisionSession {
  readonly sessionId: string;
  /** Distinct reads extracted for this session. */
  readonly extracted: number;
  /** Events actually appended — 0 on a re-ingest. */
  readonly appended: number;
}

export interface DecisionReadIngestResult {
  /** Every `*.jsonl` the walk considered — the honest denominator. */
  readonly scannedFiles: number;
  /** Distinct reads extracted and attributable to a session, by shape. */
  readonly byShape: Readonly<Record<DecisionReadShape, number>>;
  /** Distinct reads extracted and attributable to a session, total. */
  readonly extracted: number;
  /** Events appended this run. 0 on a clean re-run is the idempotence property, not a failure. */
  readonly appended: number;
  readonly sessions: readonly IngestedDecisionSession[];
  /** Distinct `doc:decisions/NNNN-slug.md` node ids reached. */
  readonly distinctDecisions: number;
  /** Reads a SUBAGENT made, of {@link extracted}. Attributed to the parent session, never dropped. */
  readonly sidechainReads: number;
  /** The earliest read observed, ISO-8601, or undefined when nothing was extracted. */
  readonly earliestAt: string | undefined;
  /** Named blind spots, sized — see {@link renderDecisionReadIngest}. */
  readonly uncorrelatedReads: number;
  readonly unidentifiedCalls: number;
  readonly declinedShellVerbs: readonly DeclinedVerb[];
  /** `storytree` invocations that reached the decision log and minted no read — see the scan field
   * of the same name. Reported on its own line because most of them named NO single decision. */
  readonly declinedCliVerbs: readonly DeclinedVerb[];
  readonly redirectTargets: number;
  /** Tool calls that NAMED a decision and yielded no read — see {@link DecisionReadScan.decisionMentions}. */
  readonly decisionMentions: number;
  /**
   * THE VERDICT ON A ZERO, and the reason this module can no longer hide the failure that produced it.
   *
   * True when the sweep recovered NOTHING from a corpus that talks about decisions constantly — which
   * is not a session that consulted none, it is an extractor that has stopped matching the world.
   * That is exactly the state this module sat in from the moment `docs/decisions/` was deleted, and
   * it reported it as a clean zero because a clean zero was all it could say.
   *
   * FALSE IS NOT A CERTIFICATE. It says the instrument recovered something, not that it recovered
   * everything: under-reporting remains this arc's accepted failure mode and every figure here is
   * still a floor. What it rules out is the total blindness that a single read disproves.
   */
  readonly blind: boolean;
  /** True when the caller asked for a scan with no writes. */
  readonly dryRun: boolean;
}

export interface IngestDecisionReadsArgs {
  /** The trace directory the sink writes under — supplied, never resolved here. */
  readonly traceDir: string;
  /** The host transcript root to scan — supplied, never resolved here. */
  readonly transcriptDir: string;
  /** Scan and report without writing a byte. Default false. */
  readonly dryRun?: boolean;
}

const EVENT_PREFIX = "host-transcript-decision-read:";
const VISIT_PREFIX = "host-transcript-decision-visit:";

/**
 * The event's identity, and therefore the whole idempotence property.
 *
 * Keyed on the host tool-call id plus the node — content-derived, so it is stable across runs, and
 * per-node, so one command reading two decision records yields two events rather than losing one.
 * Nothing here consults the clock or a counter; a re-run of this ingest over an unchanged disk
 * mints exactly the ids already on it and appends nothing.
 */
function eventIdFor(read: DecisionRead): string {
  return `${EVENT_PREFIX}${read.toolUseId}:${read.nodeId}`;
}

function visitIdFor(read: DecisionRead): string {
  return `${VISIT_PREFIX}${read.toolUseId}:${read.nodeId}`;
}

export function ingestDecisionReads(input: IngestDecisionReadsArgs): DecisionReadIngestResult {
  const { traceDir, transcriptDir } = input;
  const dryRun = input.dryRun === true;

  const files = collectTranscriptFiles(transcriptDir);

  const bySession = new Map<string, DecisionRead[]>();
  const seenEventIds = new Set<string>();
  const declinedByVerb = new Map<string, number>();
  const declinedByCliVerb = new Map<string, number>();
  const distinctDecisions = new Set<string>();
  const byShape = { read: 0, grep: 0, shell: 0, cli: 0 } satisfies Record<DecisionReadShape, number>;
  let uncorrelatedReads = 0;
  let unidentifiedCalls = 0;
  let redirectTargets = 0;
  let sidechainReads = 0;
  let decisionMentions = 0;
  let earliestAt: string | undefined;

  for (const file of files) {
    const scan = scanTranscriptDecisionReads(file);
    uncorrelatedReads += scan.uncorrelatedReads;
    unidentifiedCalls += scan.unidentifiedCalls;
    redirectTargets += scan.redirectTargets;
    decisionMentions += scan.decisionMentions;
    for (const declined of scan.declinedShellVerbs) {
      declinedByVerb.set(declined.verb, (declinedByVerb.get(declined.verb) ?? 0) + declined.segments);
    }
    for (const declined of scan.declinedCliVerbs) {
      declinedByCliVerb.set(declined.verb, (declinedByCliVerb.get(declined.verb) ?? 0) + declined.segments);
    }

    for (const read of scan.reads) {
      // Dedupe ACROSS FILES too, not merely across runs: the harness copies a session's history
      // when a session is resumed or forked, so the same tool-call id genuinely appears in more
      // than one transcript. Counting it twice would inflate every figure this ingest reports.
      const eventId = eventIdFor(read);
      if (seenEventIds.has(eventId)) continue;
      seenEventIds.add(eventId);

      const lane = bySession.get(read.sessionId);
      if (lane === undefined) bySession.set(read.sessionId, [read]);
      else lane.push(read);

      byShape[read.shape]++;
      distinctDecisions.add(read.nodeId);
      if (read.sidechain) sidechainReads++;
      if (earliestAt === undefined || read.at < earliestAt) earliestAt = read.at;
    }
  }

  const sessions: IngestedDecisionSession[] = [];
  let appended = 0;

  for (const [sessionId, reads] of [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Read the existing trace FIRST so idempotence is a property of the ids, not of run order.
    const { replay } = readTraversalSession({ dir: traceDir, sessionId });
    const alreadyPresent = new Set(replay.events.map((event) => event.eventId));

    const toAppend: ContextTraversalEvent[] = [];
    for (const read of reads) {
      const eventId = eventIdFor(read);
      if (alreadyPresent.has(eventId)) continue;
      toAppend.push({
        // The strength the READ actually had, never a blanket full payload: a `--raw <field>` read
        // recorded as a whole-document one inflates every re-read ratio taken from this trace.
        kind: read.strength,
        eventId,
        sessionId,
        at: read.at,
        visitId: visitIdFor(read),
        nodeId: read.nodeId,
        surfaceId: DECISION_READ_SURFACES[read.shape],
      });
    }

    let appendedForSession = 0;
    if (!dryRun && toAppend.length > 0) {
      appendedForSession = appendTraversalEvents(toAppend, { dir: traceDir, sessionId })
        ? toAppend.length
        : 0;
    }
    appended += appendedForSession;
    sessions.push({ sessionId, extracted: reads.length, appended: appendedForSession });
  }

  const bySize = (counts: Map<string, number>): DeclinedVerb[] =>
    [...counts.entries()]
      .map(([verb, segments]) => ({ verb, segments }))
      .sort((a, b) => b.segments - a.segments || a.verb.localeCompare(b.verb));
  const declinedShellVerbs = bySize(declinedByVerb);
  const declinedCliVerbs = bySize(declinedByCliVerb);

  const extracted = byShape.read + byShape.grep + byShape.shell + byShape.cli;

  return {
    scannedFiles: files.length,
    byShape,
    extracted,
    appended,
    sessions,
    distinctDecisions: distinctDecisions.size,
    sidechainReads,
    earliestAt,
    uncorrelatedReads,
    unidentifiedCalls,
    declinedShellVerbs,
    declinedCliVerbs,
    redirectTargets,
    decisionMentions,
    // A sweep that recovered nothing from transcripts that name decisions constantly is an
    // instrument reporting on a world it no longer matches. Zero reads AND zero mentions is the
    // other, honest zero: a machine with no decision traffic at all.
    blind: extracted === 0 && decisionMentions > 0,
    dryRun,
  };
}

/**
 * Exhaustive coverage declaration for this adapter (ADR-0235 clause 6). Its `adapterId` is distinct
 * from `host-transcript` (the occupancy adapter) because a trace refuses a duplicate `adapterId`
 * and, more to the point, the two observe genuinely different things at the same boundary: one
 * reads `usage` off assistant lines, this one reads `tool_use` blocks.
 *
 * `supported` names the features this floor observes and nothing else — notably NOT
 * `event:candidate_set` or `event:followed_edge`: this adapter sees a read and can say nothing
 * whatever about which offer, if any, that read was answering.
 *
 * `event:front_matter_read` JOINED THE LIST when the store route did, and the two had to move
 * together: a `library artifact adr-NNNN --raw <field>` read emits that kind, so leaving it under
 * `omitted` would have made this declaration state the opposite of what the adapter does. An
 * exhaustive coverage declaration is only worth having while it is exhaustively true (ADR-0235
 * clause 6) — and a declaration that quietly disagrees with its own emitter is the same class of
 * silent-wrong-answer this increment exists to remove.
 */
const SUPPORTED_FEATURES = [
  "surface:host_transcript",
  "event:front_matter_read",
  "event:full_payload_read",
  "field:surface_id",
] as const;

const supportedSet = new Set<string>(SUPPORTED_FEATURES);

export const DECISION_READ_COVERAGE: ContextTraversalCoverage = ContextTraversalCoverage.parse({
  adapterId: "host-transcript-decision-read",
  supported: SUPPORTED_FEATURES,
  omitted: CoverageFeature.options.filter((feature) => !supportedSet.has(feature)),
});

/**
 * The standing declaration of what this ingest DOES NOT SEE.
 *
 * Printed unconditionally on every report, in full, and never abbreviated when the numbers look
 * good. The arc's accepted failure mode is under-reporting, and under-reporting is only acceptable
 * while it is declared — a count that arrives without this block reads as a census, which is
 * precisely the failure this increment was chartered to avoid.
 */
export const DECISION_READ_OMISSIONS: readonly string[] = [
  "Codex runs — outside the Claude harness entirely, so no transcript exists to read (ADR-0232).",
  "The primary checkout / lobby — `deriveIdentity()` rule 3 refuses it by design, the same floor " +
    "`storytree own` has. Sized below as `uncorrelated`.",
  "Worktrees git registered outside `.claude/worktrees/<name>` — rule 1 is the only identity rule " +
    "expressible from a recorded `cwd`; rules 2 and 3 need git, which a transcript line is not.",
  "Shell reads that do not name the path literally — heredocs, `$VAR`, globs, `find -exec cat`, " +
    "and `git show <rev>:<path>`. UNBOUNDED in principle; the recognisable part is sized below as " +
    "`declined shell segments`, by verb.",
  "`Grep` over a DIRECTORY, which names no file and therefore no decision record.",
  "Non-tool reads — the CLAUDE.md / AGENTS.md auto-load, `@file` mentions, the UserPromptSubmit " +
    "injection, Skill-loaded files. UNTESTED here: declared unknown rather than absent.",
  "`adr list` — a SEARCH over the log, which names no single decision. 391 invocations on this " +
    "disk name no decision to record, and minting one read apiece would manufacture history.",
  "`library artifact history adr-NNNN` — a read of the CHANGE LOG rather than of the document.",
  "A decision reached through the STORE by any route other than the two recognised verbs — the " +
    "studio, a direct `psql`, a script holding its own pool. None of those is a transcript tool call.",
  "Worktree-ISOLATED subagents, which derive their own session id and land on a separate trace. " +
    "Not empirically tested.",
  "Reads made outside any agent at all.",
  "And the standing limit: a read is not comprehension.",
];

function pct(part: number, whole: number): string {
  if (whole === 0) return "n/a";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * The human-readable report. Its job is as much to bound the claim as to state it: every number
 * here is a FLOOR, the record is only as fresh as this run, and the read count is not a measure of
 * whether anyone understood what they read.
 */
export function renderDecisionReadIngest(result: DecisionReadIngestResult): string {
  const lines: string[] = [];
  lines.push(
    result.dryRun
      ? "decision-record reads recovered from host transcripts — DRY RUN, nothing written"
      : "decision-record reads recovered from host transcripts",
  );
  lines.push("");
  lines.push(`scanned ${result.scannedFiles} transcript file(s)`);
  lines.push(
    `extracted ${result.extracted} read(s) — ` +
      `${result.byShape.cli} cli (the STORE route: library artifact adr-NNNN / adr pull), ` +
      `${result.byShape.read} Read (exact path, HISTORICAL), ` +
      `${result.byShape.grep} Grep (exact path, HISTORICAL), ` +
      `${result.byShape.shell} shell (SCRAPED from an opaque command string, HISTORICAL)`,
  );
  lines.push(
    "The three path shapes are HISTORICAL by construction: `docs/decisions/` was deleted whole on " +
      "2026-08-22 (ADR-0403 dec 1), so only a replay of a pre-migration session can produce one, and " +
      "a session recorded after that date can only ever read a decision through the cli shape.",
  );
  lines.push(
    `across ${result.sessions.length} session(s), reaching ${result.distinctDecisions} distinct decision record(s)`,
  );
  lines.push(
    `${result.sidechainReads} of them (${pct(result.sidechainReads, result.extracted)}) were made by a SUBAGENT, ` +
      "attributed to the parent session whose worktree it ran in",
  );
  lines.push(`earliest read observed: ${result.earliestAt ?? "(none)"}`);
  lines.push("");
  lines.push(
    result.dryRun
      ? `would append ${result.sessions.reduce((sum, s) => sum + s.extracted, 0)} event(s) (before de-duplication against existing traces)`
      : `appended ${result.appended} read event(s) — node id form doc:decisions/NNNN-slug.md for a ` +
        "file read, adr-NNNN for a store read (the corpus's own pointer form for each route, so both " +
        "join to the offer that led there)",
  );
  lines.push(
    "0 appended on a re-run is the IDEMPOTENCE property, not a failure: each event is keyed on the " +
      "host tool-call id plus the node it names.",
  );
  lines.push("");
  lines.push(
    result.blind
      ? "⚠ THIS ZERO IS NOT AN ANSWER — THE EXTRACTOR MAY BE BLIND.\n" +
          `  ${result.decisionMentions} tool call(s) NAMED a decision and not one of them yielded a read. A corpus ` +
          "that\n  talks about decisions this much and reads none is far likelier to be an instrument whose " +
          "subject\n  moved than a run of sessions that consulted nothing — which is precisely what happened " +
          "when\n  `docs/decisions/` was deleted and this module went on reporting a clean zero. Treat the " +
          "count\n  above as UNVERIFIED and check how a decision is reached today before believing it."
      : `not blind: ${result.extracted} read(s) recovered against ${result.decisionMentions} decision-naming ` +
          "tool call(s) that yielded none.\n" +
          "A mention is usually prose — an `echo`, a note, a commit message — so this is a denominator, " +
          "never a\ntarget to drive to zero. It is here so a ZERO can be told apart from a BLIND SPOT: this " +
          "extractor\nreported zero for the whole `docs/decisions/` migration and nothing in its output said so.",
  );
  lines.push("");
  lines.push("THIS IS A FLOOR, NOT A CENSUS.");
  lines.push(
    "Shell reads are recovered only by scraping an opaque command string, so the shell figure above " +
      "is a lower bound by construction and the total is one with it.",
  );
  lines.push(
    "It is also a BATCH ingest: the record is only as fresh as this run, never live. A read the " +
      "harness wrote after this run is absent until it is run again.",
  );
  lines.push(
    "And a READ COUNT IS NOT A SUFFICIENCY MEASURE — models given insufficient context answer " +
      "confidently rather than abstaining, so nothing here supports a conclusion that agents are " +
      "reading the decision log and getting on fine.",
  );
  lines.push(
    "THE ONE DIRECTION IT CAN OVER-COUNT: a transcript records that a command was ISSUED, never " +
      "that it succeeded. A `cat` of a missing file, an `adr pull` that failed on a stopped " +
      "database, a `library artifact` read that errored — each is counted here as a read. The live " +
      "observer gates on the invocation's own exit status; a batch sweep of the transcript has no " +
      "such signal, and is stating intent rather than delivery. Unbounded in principle, and named " +
      "because everything else here is a floor and this single item is not.",
  );
  lines.push("");
  lines.push("REACHED AND NOT RECORDED, sized:");
  lines.push(
    `  ${result.uncorrelatedReads} read(s) whose cwd derived no storytree session (the primary checkout / lobby)`,
  );
  lines.push(`  ${result.unidentifiedCalls} read(s) on a tool call carrying no id, so never idempotently keyable`);
  lines.push(`  ${result.redirectTargets} path(s) that were a > / >> WRITE target, not a read`);
  const declinedTotal = result.declinedShellVerbs.reduce((sum, entry) => sum + entry.segments, 0);
  lines.push(
    `  ${declinedTotal} shell segment(s) that NAMED a decision record under a verb this scraper does ` +
      "not read" +
      (result.declinedShellVerbs.length === 0
        ? ""
        : `: ${result.declinedShellVerbs
            .slice(0, 8)
            .map((entry) => `${entry.verb}=${entry.segments}`)
            .join(", ")}`),
  );
  const declinedCliTotal = result.declinedCliVerbs.reduce((sum, entry) => sum + entry.segments, 0);
  lines.push(
    `  ${declinedCliTotal} storytree invocation(s) that reached the decision log and minted no read` +
      (result.declinedCliVerbs.length === 0
        ? ""
        : `: ${result.declinedCliVerbs
            .slice(0, 8)
            .map((entry) => `${entry.verb}=${entry.segments}`)
            .join(", ")}`),
  );
  lines.push(
    "    — counted apart from the shell line above because MOST OF THESE NAMED NO SINGLE DECISION: " +
      "`adr list` is a search over the log, and folding it in would claim a decision record was " +
      "named when none was.",
  );
  lines.push("");
  lines.push("NOT COVERED AT ALL:");
  for (const omission of DECISION_READ_OMISSIONS) lines.push(`  - ${omission}`);
  lines.push("");
  lines.push(
    `coverage: adapter=${DECISION_READ_COVERAGE.adapterId} ` +
      `supported=[${DECISION_READ_COVERAGE.supported.join(", ")}] ` +
      `omitted=[${DECISION_READ_COVERAGE.omitted.join(", ")}]`,
  );

  return lines.join("\n");
}
