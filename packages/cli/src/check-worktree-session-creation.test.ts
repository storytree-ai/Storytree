// The session-creation check's classifier — scripts/check-worktree-session-creation.mjs.
//
// WHAT THIS FENCES, AND WHY IT IS NOT A TAUTOLOGY. Until 2026-08-19 the check keyed its BROKEN
// branch on "no session record, no worktree directory, no claude.exe" and attributed the outage to
// a vendor bug. ADR-0389 withdrew both: the real cause is our own reuse-path `git clean -ffdx`
// hanging on pnpm's junction cycle, and the failing start of 2026-08-19 07:49 CREATED A BRANCH and
// RE-LEASED A POOLED SLOT before going silent. So a real failure SATISFIED the old tell, and anyone
// re-testing with it concluded HEALTHY on a machine that was not. The centrepiece test below is
// therefore `the 2026-08-19 07:49 shape` — an instrument that returns PASS on that sequence is the
// defect, not a passing test.
//
// The fixtures are SYNTHETIC lines modelled on shapes read off a real
// %APPDATA%\Claude\logs\main.log before they were written down. A test must never read
// machine-local logs: log rotation destroyed the Aug 3-9 file mid-investigation (ADR-0389
// Consequences), so no instrument — this suite included — may assume retained history exists.
//
// Proof: node --import tsx --test packages/cli/src/check-worktree-session-creation.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ATTEMPT_MARKER,
  EVIDENCE_LINE_MAX,
  classifySessionStarts,
  formatCheckReport,
} from "../../../scripts/check-worktree-session-creation.mjs";
import type {
  SessionStartReport,
  StartAttempt,
} from "../../../scripts/check-worktree-session-creation.mjs";

const script = fileURLToPath(
  new URL("../../../scripts/check-worktree-session-creation.mjs", import.meta.url),
);

/** One log line in the app's real format: `YYYY-MM-DD HH:MM:SS [level] body`. */
function at(clock: string, body: string, level = "info"): string {
  return `2026-08-19 ${clock} [${level}] ${body}`;
}

function attemptAt(report: SessionStartReport, i: number): StartAttempt {
  const a = report.attempts[i];
  if (!a) throw new Error(`expected an attempt at index ${i}, got ${report.attempts.length}`);
  return a;
}

// The marker, verbatim. It is a hardcoded literal with NO interpolation — every start logs it
// identically, healthy or broken — so it is only ever something to correlate FROM. Declared once
// here and reused by every fixture so the suite cannot accidentally give the healthy and broken
// cases different marker text and "prove" a discrimination that does not exist.
const MARKER = ATTEMPT_MARKER;

// ---------- fixtures, modelled on measured sequences ----------

/** The create-fresh path, measured 2026-08-19 21:29 — the sequence that proved cutting restored. */
const HEALTHY_CREATE_FRESH: string[] = [
  at("21:29:53", MARKER),
  at("21:29:53", "[WorktreePool] No reusable worktree for C:/code/storytree (5/5 candidates checked)"),
  at("21:29:53", "Creating worktree for session local_0a235fb9-a681-41bd-89cd-98453ef18aa1 from C:/code/storytree"),
  at("21:29:57", "[createWorktree] FETCH_HEAD is 1851s old — fetching origin in the background { baseRepo: 'C:/code/storytree' }"),
  at("21:29:57", "[stageCheckout] Selective checkout done in 252ms (2 paths)"),
  at("21:29:57", 'Created worktree "test123-e9fb60" at C:\\code\\storytree\\.claude\\worktrees\\test123-e9fb60'),
  at("21:29:57", 'Using worktree "test123-e9fb60" at C:\\code\\storytree\\.claude\\worktrees\\test123-e9fb60 for session local_0a235fb9-a681-41bd-89cd-98453ef18aa1'),
  at("21:29:57", "Starting local session local_0a235fb9-a681-41bd-89cd-98453ef18aa1 in C:\\code\\storytree\\.claude\\worktrees\\test123-e9fb60"),
  at("21:30:20", "[process-memory] trigger=interval tree_rss_sum=2141MB sys_free=10173MB/32324MB"),
];

/** The REUSE path succeeding, measured 2026-08-19 22:03 — reuse is not broken per se, the hang is. */
const HEALTHY_REUSE: string[] = [
  at("22:03:16", MARKER),
  at("22:03:20", "[rebindWorktree] Rebound C:\\code\\storytree\\.claude\\worktrees\\test123-640433 (was leased by none) to local_a0d432c5-4c88-4384-aeb6-b487fefd54aa on branch claude/test123-8e6da7"),
  at("22:03:20", "[WorktreePool] Reused worktree test123-640433 for session local_a0d432c5-4c88-4384-aeb6-b487fefd54aa (was leased by none)"),
  at("22:03:20", "Starting local session local_a0d432c5-4c88-4384-aeb6-b487fefd54aa in C:\\code\\storytree\\.claude\\worktrees\\test123-640433"),
  at("22:03:45", "[process-memory] trigger=interval tree_rss_sum=1915MB sys_free=8378MB/32324MB"),
];

/**
 * The failure of 2026-08-19 07:49 — the sequence ADR-0389 is built on. Note what it does and does
 * NOT contain: no `[WorktreePool]` line and no named worktree, only the `[createWorktree]` base-repo
 * preamble. The branch (`claude/youthful-wing-54dabe`) and the re-leased slot
 * (`inspiring-keller-79cd2e`) were real but never named in the log, which is exactly why the
 * classifier has to accept path-entry evidence and has to report that it is the weaker kind.
 */
const ALLOCATE_THEN_DIE_0749: string[] = [
  at("07:49:22", MARKER),
  at("07:49:22", "using oauth config {"),
  "  apiHost: 'https://api.anthropic.com',",
  "}",
  at("07:49:23", "[createWorktree] FETCH_HEAD is 181s old — skipping full origin fetch { baseRepo: 'C:\\\\code\\\\storytree' }"),
  at("07:49:27", "Git command failed: git merge --ff-only 715dd46a84c1767923f18b57eb24140373b6e88d { code: 1 }", "error"),
  at("07:49:27", "[createWorktree] could not fast-forward local main (continuing): error: Your local changes to the following files would be overwritten by merge:"),
  "\tpackages/agent/src/codex-author.ts",
  "Aborting { baseRepo: 'C:\\\\code\\\\storytree', worktreePath: 'C:/code/storytree' }",
  at("07:49:28", '[LocalSessionManager] [replaceEnabledMcpTools] Session "local_982079ae-46c9-4ec9-884d-aa34bed1644e" not found after session load; skipping', "warn"),
  at("07:53:00", "[process-memory] trigger=interval tree_rss_sum=1915MB sys_free=8378MB/32324MB"),
];

/** The same fault where the log DID name the slot — direct evidence, plus the D2 scrub mechanism. */
const ALLOCATE_THEN_DIE_NAMED: string[] = [
  at("02:55:20", MARKER),
  at("02:55:22", "[WorktreePool] Reused worktree inspiring-keller-79cd2e for session local_deadbeef-0000-0000-0000-000000000000 (was leased by none)"),
  at("02:55:25", "Git command failed: git -c core.longpaths=true clean -ffdx -- :(icase,glob).claude/** :(icase,glob).mcp.json { cwd: 'C:\\\\code\\\\storytree\\\\.claude\\\\worktrees\\\\inspiring-keller-79cd2e' }", "error"),
  at("02:55:25", "[purgeSessionClaudeState] session-authority clean failed in C:\\code\\storytree\\.claude\\worktrees\\inspiring-keller-79cd2e: git output exceeded maxBuffer limit", "warn"),
  at("03:25:00", "[process-memory] trigger=interval tree_rss_sum=2141MB sys_free=10173MB/32324MB"),
];

/**
 * The marker and then nothing — the shape the throwaway-repo control repro tested, and only that.
 * The tail runs well past the proceeded window ON PURPOSE: a slow start has been measured to
 * succeed at 95s, so a fixture that stopped at 40s would be INDETERMINATE, not silent.
 */
const TOTAL_SILENCE: string[] = [
  at("12:00:00", MARKER),
  at("12:00:00", "using oauth config {"),
  at("12:00:01", "[oauth] looking up token for orgId=38dcc30b-c083-48d6-8634-5a503029e0ef"),
  at("12:00:01", "[oauth] no cached token found for orgId=38dcc30b-c083-48d6-8634-5a503029e0ef"),
  at("12:05:00", "[process-memory] trigger=interval tree_rss_sum=1915MB sys_free=8378MB/32324MB"),
];

/**
 * The measured 95-second SUCCESS of 2026-08-19 23:57:15 -> 23:58:50 — this very machine's own log.
 * The pool scrubbed six reuse candidates (the junction recursion's warnings are in the real log
 * verbatim), gave up on all of them, and fell through to create-fresh, which finished in 4s.
 * A 5-second deadline reports this working capability as BROKEN.
 */
const SLOW_BUT_PROCEEDED: string[] = [
  at("23:57:15", MARKER),
  at("23:57:30", "[createWorktree] FETCH_HEAD is 1413s old — skipping full origin fetch { baseRepo: 'C:\\\\code\\\\storytree' }"),
  at("23:57:33", "[createWorktree] could not fast-forward local main (continuing): error: Your local changes would be overwritten"),
  "warning: could not open directory 'apps/desktop/node_modules/@storytree/drive/node_modules/@storytree/library/node_modules/@storytree/proof-protocol/node_modules/@storytree/library/': Function not implemented",
  at("23:58:46", "[WorktreePool] No reusable worktree for C:\\code\\storytree (6/6 candidates checked)"),
  at("23:58:46", "Creating worktree for session local_56ef0b90-0a9e-46df-954d-9da75f2021f5 from C:\\code\\storytree"),
  at("23:58:49", "[refreshSourceRef] refreshed origin/main in 2831ms { baseRepo: 'C:\\\\code\\\\storytree' }"),
  at("23:58:50", "[stageCheckout] Selective checkout done in 219ms (2 paths)"),
  at("23:58:50", 'Created worktree "relaxed-khorana-c390cd" at C:\\code\\storytree\\.claude\\worktrees\\relaxed-khorana-c390cd'),
  at("23:58:50", "Starting local session local_56ef0b90-0a9e-46df-954d-9da75f2021f5 in C:\\code\\storytree\\.claude\\worktrees\\relaxed-khorana-c390cd"),
  at("23:59:20", "[process-memory] trigger=interval tree_rss_sum=1915MB sys_free=8378MB/32324MB"),
];

// ---------- the primary tell, kept primary ----------

test("a create-fresh start that proceeded is HEALTHY, with the follow-up line's own facts", () => {
  const report = classifySessionStarts(HEALTHY_CREATE_FRESH);
  assert.equal(report.verdict, "HEALTHY");
  const a = attemptAt(report, 0);
  assert.equal(a.shape, "healthy");
  assert.equal(a.sessionId, "local_0a235fb9-a681-41bd-89cd-98453ef18aa1");
  assert.equal(a.cwd, "C:\\code\\storytree\\.claude\\worktrees\\test123-e9fb60");
  assert.equal(a.latencyMs, 4000, "21:29:53 -> 21:29:57 is the measured four seconds");
});

test("a REUSE start that proceeded is HEALTHY — reuse is not itself the fault", () => {
  // ADR-0389 D3: the create-fresh path was measured working WITH the junction cycle in place, and
  // this reuse start succeeded too. The fault is the awaited clean hanging, not the reuse branch, so
  // a classifier that read every reuse as broken would be wrong in the other direction.
  const report = classifySessionStarts(HEALTHY_REUSE);
  assert.equal(report.verdict, "HEALTHY");
  assert.equal(attemptAt(report, 0).shape, "healthy");
});

// ---------- the centrepiece: the shape the retired tell read as healthy ----------

test("the 2026-08-19 07:49 shape is BROKEN and is NAMED as allocate-then-die", () => {
  const report = classifySessionStarts(ALLOCATE_THEN_DIE_0749);
  assert.equal(report.verdict, "BROKEN");

  const a = attemptAt(report, 0);
  assert.equal(
    a.shape,
    "allocate-then-die",
    "this sequence is the ADR-0389 fault; classifying it healthy — or merely 'broken' with no shape — is the defect this file fences",
  );
  assert.equal(a.sessionId, null, "no session line followed, so there is no id to report");
  assert.ok(a.evidence.length > 0, "the verdict must carry the lines that carried the shape");
  assert.ok(
    a.evidence.some((e) => e.kind === "create-path"),
    "the ONLY evidence this failure left is the [createWorktree] preamble — dropping it restores the blind spot",
  );
});

test("07:49 reports PATH-ENTRY strength — an instrument that cannot tell must say so", () => {
  // The branch and the pooled slot really were allocated, but the log named neither. Reporting this
  // as `direct` would claim evidence that is not on disk; reporting no strength at all would hide
  // that the two cases differ. Naming the weaker kind is the honest middle.
  const a = attemptAt(classifySessionStarts(ALLOCATE_THEN_DIE_0749), 0);
  assert.equal(a.strength, "path-entry");
});

test("when the log DOES name the slot, the same shape is reported at DIRECT strength", () => {
  const a = attemptAt(classifySessionStarts(ALLOCATE_THEN_DIE_NAMED), 0);
  assert.equal(a.shape, "allocate-then-die");
  assert.equal(a.strength, "direct");
  assert.ok(a.evidence.some((e) => e.kind === "reused-worktree"));
});

// ---------- the other fault, kept distinct ----------

test("marker-then-nothing is BROKEN as total-silence, a DIFFERENT fault", () => {
  const report = classifySessionStarts(TOTAL_SILENCE);
  assert.equal(report.verdict, "BROKEN");
  const a = attemptAt(report, 0);
  assert.equal(a.shape, "total-silence");
  assert.equal(a.evidence.length, 0);
});

test("the two failure shapes are never collapsed into one another", () => {
  // Both are BROKEN under the primary tell. If the classifier ever returns the same shape for both,
  // the secondary classifier has stopped doing the only job it has.
  const silence = attemptAt(classifySessionStarts(TOTAL_SILENCE), 0);
  const allocated = attemptAt(classifySessionStarts(ALLOCATE_THEN_DIE_0749), 0);
  assert.notEqual(silence.shape, allocated.shape);
});

// ---------- the `LocalSessions.start:` trap ----------

test("the marker carries NO fields — identical bytes yield opposite verdicts", () => {
  // `t.Jb.info(`LocalSessions.start:`)` is a literal with no interpolation, so it is logged
  // identically on every start. The retracted reading "LocalSessions.start receives an empty
  // payload" was never observable there. Stated as a measurement: the marker line in the healthy
  // fixture and the marker line in the broken fixture are byte-identical apart from their clock, and
  // the verdicts still differ — therefore nothing in the marker itself is doing the discriminating.
  const healthyMarker = HEALTHY_CREATE_FRESH[0] ?? "";
  const brokenMarker = TOTAL_SILENCE[0] ?? "";
  assert.notEqual(healthyMarker, "", "fixture must open with the marker line");
  assert.equal(
    healthyMarker.replace(/^\S+ \S+ /, ""),
    brokenMarker.replace(/^\S+ \S+ /, ""),
    "the fixtures must use the SAME marker text, or this suite proves a discrimination that does not exist",
  );
  assert.equal(classifySessionStarts(HEALTHY_CREATE_FRESH).verdict, "HEALTHY");
  assert.equal(classifySessionStarts(TOTAL_SILENCE).verdict, "BROKEN");
});

test("a marker line with no timestamp is not counted as an attempt", () => {
  // The marker string can appear inside a multi-line entry's body. Only a line that opens with the
  // log's own timestamp is a real attempt.
  const report = classifySessionStarts([`  echoed body mentioning ${MARKER} in passing`]);
  assert.equal(report.verdict, "NO ATTEMPT DETECTED");
  assert.equal(report.attempts.length, 0);
});

// ---------- the `[WorktreePool]` over-match trap ----------

test("pool GC churn is NOT read as allocation — a total silence stays total silence", () => {
  // Hard-coded here rather than imported from the script, so the assertion cannot be satisfied by
  // the script agreeing with itself. Every line below is a measured `[WorktreePool]`-family (or
  // worktree-removal) line emitted by a ~30-minute timer with NO session start involved. Matching
  // the bare prefix — the natural thing to reach for — would classify this failure as
  // allocate-then-die whenever that timer happened to tick inside the window.
  const poolNoise = [
    at("12:00:05", "[WorktreePool] untracked-dir GC kept C:\\code\\storytree\\.claude\\worktrees\\adr0178-gate (recently-active)"),
    at("12:00:06", "[WorktreePool] untracked-dir GC: 16 untracked dir(s), 0 past min age, 0 removed"),
    at("12:00:07", "[WorktreePool] Pruning orphaned store entry test123-640433 (directory gone or not a worktree)"),
    at("12:00:08", "[WorktreePool] Released worktree test123-640433 to pool (was leased by local_3b81dd4f-3cb9-44d3-b29e-3a6d91c19c92)"),
    at("12:00:09", 'Removing worktree "brave-golick-1b95db" (leased by none): C:\\code\\storytree\\.claude\\worktrees\\brave-golick-1b95db'),
  ];
  const withNoise = [...TOTAL_SILENCE.slice(0, 4), ...poolNoise, ...TOTAL_SILENCE.slice(4)];

  const a = attemptAt(classifySessionStarts(withNoise), 0);
  assert.equal(
    a.shape,
    "total-silence",
    `pool GC churn was mistaken for this start's allocation: ${JSON.stringify(a.evidence)}`,
  );
});

// ---------- the fast-forward bystander ----------

test("`could not fast-forward local main` never turns a healthy start broken", () => {
  // It fires on SUCCESSFUL starts too — it is the dirty primary checkout, not the fault (ADR-0389
  // Context). It is legitimate PROGRESS evidence on a failed start and must be nothing at all on a
  // healthy one, and those two facts are not in tension.
  const healthyWithBystander = [
    ...HEALTHY_CREATE_FRESH.slice(0, 3),
    at("21:29:55", "[createWorktree] could not fast-forward local main (continuing): error: Your local changes would be overwritten"),
    ...HEALTHY_CREATE_FRESH.slice(3),
  ];
  const report = classifySessionStarts(healthyWithBystander);
  assert.equal(report.verdict, "HEALTHY");
  assert.equal(attemptAt(report, 0).evidence.length, 0, "a healthy attempt collects no shape evidence");
});

// ---------- the measured slow success: the ~5s is a latency, not a deadline ----------

test("a start that took 95s and SUCCEEDED is not broken — it is slow-but-proceeded", () => {
  // Measured on this machine, 2026-08-19 23:57:15 -> 23:58:50. Reporting it BROKEN would be the
  // same class of confident-wrong verdict as the retired "nothing was created" tell, arrived at
  // from the opposite direction.
  const report = classifySessionStarts(SLOW_BUT_PROCEEDED);
  assert.equal(report.verdict, "HEALTHY", "the capability worked; the start landed");
  const a = attemptAt(report, 0);
  assert.equal(a.shape, "slow-but-proceeded");
  assert.equal(a.sessionId, "local_56ef0b90-0a9e-46df-954d-9da75f2021f5");
  assert.equal(a.latencyMs, 95_000);
  assert.equal(report.counts.broken, 0);
  assert.equal(report.counts.slow, 1);
});

test("the proceeded window is LOAD-BEARING: at 5s the same measured success reads BROKEN", () => {
  // The red anchor for the bound. Re-run the identical measured sequence with the window narrowed
  // to the old ~5s deadline: the working capability is reported broken, and named as the ADR-0389
  // fault it is not. That is what the default bound exists to prevent, so it is pinned rather than
  // left as a number someone later "tidies".
  const report = classifySessionStarts(SLOW_BUT_PROCEEDED, { proceededWindowMs: 5_000 });
  assert.equal(report.verdict, "BROKEN");
  assert.equal(attemptAt(report, 0).shape, "allocate-then-die");
});

test("a slow start is FLAGGED, never silently accepted", () => {
  // It is not a failure, but it is the latent junction cycle still costing on every start that
  // touches a reuse candidate. Passing it off as an ordinary green would hide inc-02's live cost.
  const text = formatCheckReport(classifySessionStarts(SLOW_BUT_PROCEEDED));
  assert.match(text, /PROCEEDED, BUT SLOW/);
  assert.match(text, /SLOW/);
  assert.doesNotMatch(text, /BROKEN/);
});

// ---------- the honest third answer ----------

test("a log that ends before a slow start could have landed is INDETERMINATE, not a failure", () => {
  // Running `check` two seconds after firing a chip must not manufacture a negative: a success has
  // been measured at 95s, so nothing has been ruled out yet. An instrument that cannot tell has to
  // say it cannot tell.
  const tooSoon = [at("12:00:00", MARKER), at("12:00:02", "[oauth] looking up token for orgId=38dcc30b")];
  const report = classifySessionStarts(tooSoon);
  assert.equal(report.verdict, "INDETERMINATE");
  const a = attemptAt(report, 0);
  assert.equal(a.shape, "indeterminate");
  assert.match(String(a.note), /SLOW start has been measured to still succeed/);
});

test("INDETERMINATE is neither shape, and never reads as a green", () => {
  const tooSoon = [at("12:00:00", MARKER)];
  const report = classifySessionStarts(tooSoon);
  assert.notEqual(report.verdict, "HEALTHY");
  assert.notEqual(report.verdict, "BROKEN");
  assert.equal(report.counts.broken, 0, "an unobserved attempt is not a broken one either");
});

// ---------- correlation arithmetic ----------

test("two attempts cannot both claim the SAME start line", () => {
  // Attempts a second apart with one start between them. A plain 'find any start within 5s' hands
  // the same line to both and reports two healthies — a manufactured green for a start that never
  // happened. Pairing consumes each start line once.
  const burst = [
    at("12:00:00", MARKER),
    at("12:00:01", MARKER),
    at("12:00:02", "Starting local session local_only-one in C:\\code\\storytree"),
    at("12:05:00", "[process-memory] trigger=interval sys_free=8378MB/32324MB"),
  ];
  const report = classifySessionStarts(burst);
  assert.equal(report.counts.healthy, 1);
  assert.equal(report.counts.broken, 1);
  assert.equal(report.verdict, "MIXED");
});

test("a start line beyond the PROCEEDED window does not rescue an attempt", () => {
  // Slow is bounded. A start line ten minutes later belongs to something else, not to this marker.
  const late = [
    at("12:00:00", MARKER),
    at("12:10:00", "Starting local session local_far-too-late in C:\\code\\storytree"),
    at("12:15:00", "[process-memory] trigger=interval sys_free=8378MB/32324MB"),
  ];
  assert.equal(classifySessionStarts(late).verdict, "BROKEN");
});

test("no attempts at all reports NO ATTEMPT DETECTED, not a green", () => {
  const report = classifySessionStarts([at("12:00:00", "[process-memory] trigger=interval")]);
  assert.equal(report.verdict, "NO ATTEMPT DETECTED");
});

// ---------- the scrub mechanism is range-scoped, and evidence is bounded ----------

test("the reuse-scrub mechanism is surfaced but NOT attributed to an attempt", () => {
  // The awaited clean only logs when it finally gives up — measured 31 minutes and three further
  // attempts after the start it belonged to — so pinning it to one attempt would be a guess.
  const report = classifySessionStarts(ALLOCATE_THEN_DIE_NAMED);
  assert.ok(
    report.scrubEvidence.some((e) => e.kind === "unbounded-clean"),
    "the `git clean -ffdx` line is the ADR-0389 D2 mechanism and must be surfaced",
  );
  assert.ok(report.scrubEvidence.some((e) => e.kind === "purge-clean-failed"));
});

test("evidence lines are truncated — the real scrub failure line is ~27 MB", () => {
  const monster = at("02:55:25", `[purgeSessionClaudeState] session-authority clean failed: ${"x".repeat(500_000)}`);
  const report = classifySessionStarts([
    at("02:55:20", MARKER),
    at("02:55:22", "[WorktreePool] Reused worktree slot-a for session local_x (was leased by none)"),
    monster,
    at("03:25:00", "[process-memory] trigger=interval"),
  ]);
  for (const e of report.scrubEvidence) {
    assert.ok(
      e.line.length < EVIDENCE_LINE_MAX + 64,
      `a ${e.line.length}-char evidence line escaped truncation — the real one is ~27 MB and floods the terminal`,
    );
  }
});

// ---------- the report's own wording is part of the deliverable ----------

test("the BROKEN report names the shape and cites ADR-0389, not the withdrawn vendor bug", () => {
  const text = formatCheckReport(classifySessionStarts(ALLOCATE_THEN_DIE_0749));
  assert.match(text, /ALLOCATE-THEN-DIE/);
  assert.match(text, /ADR-0389/);
  assert.doesNotMatch(
    text,
    /86574/,
    "citing the upstream issue as this outage's cause is the attribution ADR-0389 D4 withdrew",
  );
  assert.doesNotMatch(
    text,
    /upstream fix|until upstream/i,
    "the remedy is ours (drain the reuse pool / remove the cycle), not a wait on a vendor",
  );
});

test("the total-silence report names ITS shape, so the two never read alike", () => {
  const text = formatCheckReport(classifySessionStarts(TOTAL_SILENCE));
  assert.match(text, /TOTAL SILENCE/);
  assert.doesNotMatch(text, /ALLOCATE-THEN-DIE/);
});

test("the HEALTHY report flags any attempt that could not be judged", () => {
  const mixedObservability = [
    ...HEALTHY_CREATE_FRESH,
    at("21:30:21", MARKER),
    at("21:30:22", "[oauth] looking up token for orgId=38dcc30b"),
  ];
  const report = classifySessionStarts(mixedObservability);
  assert.equal(report.verdict, "HEALTHY");
  assert.equal(report.counts.indeterminate, 1);
  assert.match(formatCheckReport(report), /could not be judged/);
});

// ---------- the CLI surface ----------

function runScript(args: string[]) {
  const res = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(res.error, undefined, `spawning node failed: ${String(res.error)}`);
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

test("no arguments prints usage and exits non-zero", () => {
  const { status, stderr } = runScript([]);
  assert.notEqual(status, 0);
  assert.match(stderr, /Usage: node scripts\/check-worktree-session-creation\.mjs <baseline\|check>/);
});

test("`census` is retired: it refuses BY NAME and says why", () => {
  // Deleting it silently would leave the next operator to re-derive the six-day inference from
  // scratch — "zero worktree=true since 08-13" could never distinguish a dead capability from an app
  // version that stopped stamping the flag, because a successful 2026-08-15 worktree start emitted
  // no start-timing line at all. Refusing by name is what carries that forward.
  const { status, stderr } = runScript(["census"]);
  assert.notEqual(status, 0);
  assert.match(stderr, /census/);
  assert.match(stderr, /start-timing/, "the refusal must name the flag the mode keyed on");
  assert.match(stderr, /ADR-0389/);
});

test("importing the module does not run the CLI", () => {
  // The classifier is imported at the top of this file. Without the isEntry() guard that import
  // would print usage and set process.exitCode = 1, redding the whole suite for a reason naming
  // nothing about the suite.
  assert.equal(process.exitCode ?? 0, 0);
});
