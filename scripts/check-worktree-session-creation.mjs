#!/usr/bin/env node
// The `session-cutting-outage-arc` mechanical check — answers "did worktree-backed desktop session
// creation work on this machine just now, and if not, WHICH FAULT SHAPE was it?" without
// re-deriving the 2026-08-13/19 investigation by hand. The live decision is **ADR-0389** (accepted
// 2026-08-19): `docs/decisions/0389-session-cutting-is-restored-and-permitted-the-outage-was-our.md`.
//
// ── WHAT THIS FILE USED TO SAY, AND WHY IT HAD TO BE RE-POINTED ─────────────────────────────────
// Until 2026-08-19 this script attributed the outage to a VENDOR bug (anthropics/claude-code#86574)
// and keyed its BROKEN branch on "no session record, no worktree directory, no claude.exe".
// ADR-0389 withdraws both readings. Do not restore either.
//
//   THE CAUSE IS OURS, AND IT IS NAMED (ADR-0389 D2). When the desktop REUSES a pooled worktree
//   slot it scrubs it with `git clean -ffdx` over a `.claude/**` pathspec and AWAITS the result.
//   pnpm materialises this workspace's dev-dependency cycle — library -> proof-protocol -> library
//   — as Windows JUNCTIONS, which git traverses as ordinary directories, so the clean recurses
//   unboundedly and never returns (154,373 `Function not implemented` warnings at ever-deeper
//   paths; ~29.5 minutes at ~85% of a core). The start therefore never reaches `[rebindWorktree]`
//   and no CLI binary is ever spawned. What RESTORED session cutting was draining the reuse pool
//   (D3), which routes starts down the create-fresh path — that path runs no clean at all, and it
//   was measured working end-to-end in four seconds WITH the junction cycle still fully in place.
//   The cycle is a necessary condition for the hang, not for the fix, and it stays latent until
//   `session-cutting-outage-arc-inc-02` removes it.
//
//   "NOTHING WAS CREATED" IS A RETIRED TELL — IT NOW READS A REAL FAILURE AS HEALTHY. The failing
//   start of 2026-08-19 07:49 created branch `claude/youthful-wing-54dabe` and re-leased pooled
//   slot `inspiring-keller-79cd2e` before going silent. Anyone re-testing with the previous version
//   of this script would have concluded the capability was HEALTHY on a machine where it was not.
//   That is the defect this file exists to have stopped making.
//
//   THE UPSTREAM RESIDUE, STATED ACCURATELY (ADR-0389 D4). What is genuinely worth filing is NOT
//   "desktop session creation is broken" — that finding is withdrawn. It is that an unbounded
//   `git clean -ffdx` AWAITED on the session-start path breaks any pnpm workspace carrying a
//   dev-dependency cycle on Windows, and the app stores its worktrees inside the very directory
//   that pathspec covers. #86574 should be re-scoped to that, not cited as this outage's cause.
//
// ── THE PRIMARY TELL (unchanged in spirit — it survived all three retracted diagnoses) ───────────
// A start that PROCEEDED logs `Starting local session <id> in <cwd>` after `LocalSessions.start:`
// in %APPDATA%\Claude\logs\main.log — normally within ~5s. A start that did NOT proceed logs the
// marker and never reaches that line. That CORRELATION is the whole primary signal, and it is the
// one thing that has not had to be retracted. Everything below it is SECONDARY: it names the fault
// shape once the primary tell has already said a start did not proceed.
//
//   ⚠ THE ~5s IS THE NORMAL LATENCY, NOT A DEADLINE — and treating it as one manufactures a false
//   BROKEN. Measured 2026-08-19 23:57:15 -> 23:58:50 in this machine's own main.log, a
//   worktree-backed start took **95 SECONDS AND SUCCEEDED**: the pool scrubbed six reuse candidates
//   first (the junction recursion's `could not open directory …@storytree/proof-protocol/…`
//   warnings are right there in the log), gave up on all of them, and fell through to create-fresh,
//   which then finished in four seconds. So `Starting local session` inside ~5s is HEALTHY, and
//   arriving late is `slow-but-proceeded` — NOT a failure, but flagged, because the delay is the
//   ADR-0389 D2 mechanism costing time without hanging. See DEFAULT_PROCEEDED_WINDOW_MS.
//
// ── THE SECONDARY SHAPE CLASSIFIER ──────────────────────────────────────────────────────────────
// Two faults wear the same primary tell and are NOT the same bug, so the verdict says which:
//
//   allocate-then-die — the start got past the marker into worktree provisioning (a slot leased or
//                       created, a branch minted, or the create path provably running) and THEN
//                       went silent. This is the CURRENT known fault, the one the retired
//                       "nothing was created" tell reads as healthy.
//   total-silence     — the marker, and then no worktree-provisioning evidence at all. This is the
//                       shape the original throwaway-repo control repro tested, and the ONLY one it
//                       ever tested — which is part of why it could not rule anything machine-level
//                       out.
//
// A further shape, `indeterminate`, exists because an instrument that cannot tell must SAY it
// cannot tell: when the scanned log ends inside the window in which a SLOW start has been measured
// to still succeed, no follow-up line could yet have been ruled out, and calling that "total
// silence" would be a fabricated negative. So `check` is honest only a few MINUTES after the
// attempt, not a few seconds — it says so rather than guessing.
//
// ── TRAPS THIS FILE ENCODES SO NOBODY RE-FALLS INTO THEM ─────────────────────────────────────────
//   - `LocalSessions.start:` CARRIES NO FIELDS, EVER. It is a hardcoded literal logged identically
//     on every start, healthy or broken. It is only ever a MARKER TO CORRELATE FROM, never a
//     symptom. (The retracted reading "LocalSessions.start receives an empty payload" was never
//     observable there — ADR-0389 Context.)
//   - `[createWorktree] could not fast-forward local main (continuing)` is a BYSTANDER as a
//     symptom: it fires on SUCCESSFUL starts too (it is the dirty primary checkout, not the fault).
//     It is still legitimate PROGRESS evidence, because it proves the provisioning path ran — and
//     those two facts are not in tension, since progress evidence is only ever consulted after the
//     primary tell has already said the start did not proceed.
//   - THE `[WorktreePool]` PREFIX IS NOT A FAMILY YOU MAY MATCH BARE. The pool GC runs on its own
//     ~30-minute timer with no start involved (`untracked-dir GC …`, `Pruning orphaned store entry
//     …`, `Released worktree … to pool`). Matching the bare prefix would classify a total-silence
//     failure as allocate-then-die whenever that timer happened to tick inside the window. Only the
//     session-naming pool lines count.
//   - THE SCRUB'S OWN FAILURE LINE CANNOT BE ATTRIBUTED TO AN ATTEMPT. The awaited clean only
//     reports when it finally gives up: the 07:49:22 attempt's `[purgeSessionClaudeState]` failure
//     landed at 08:20:59 — 31 minutes and three further attempts later. So it is reported as a
//     RANGE-SCOPED observation ("the ADR-0389 mechanism is visible somewhere in this range"), never
//     pinned to one attempt.
//   - THAT LINE IS ~27 MB LONG (the recursion's stderr is embedded in it). Every evidence line is
//     truncated before it is stored or printed.
//
// ── `census` IS RETIRED (deleted, not fenced). DO NOT RE-ADD IT. ─────────────────────────────────
// The old `census` mode bucketed session starts by the `worktree=true` flag in `[CCD start-timing]`
// lines and printed "matches the outage signature" when the most recent day held zero. That
// inference is what cost six days: a provably app-created, successfully-started worktree session on
// 2026-08-15 (`[WorktreePool] No reusable worktree` -> `Creating worktree` -> `Created worktree` ->
// `Starting local session`) emitted NO start-timing line at all. So "zero worktree=true since
// 08-13" could never distinguish a DEAD CAPABILITY from an APP VERSION THAT STOPPED STAMPING THE
// FLAG, and it was read as the former for six days (ADR-0389 Consequences).
//
// It was deleted rather than fenced for three reasons. (a) There is no second instrument that would
// make the count meaningful, so a fenced version would still print a table whose only available
// reading is the forbidden one — and a caveat above a number loses to the number. (b) It cannot
// even serve as history: log rotation destroyed the Aug 3-9 file mid-investigation, so the healthy
// era is not on disk any more, and no future instrument may assume retained history exists.
// (c) It read EVERY `main*.log` rotation into a string, including a 219 MB one. `check` answers the
// real question with the tell that survived; running `census` is not a cheaper way to ask it.
//
// ── SCOPE ───────────────────────────────────────────────────────────────────────────────────────
// Deliberately NOT wired into `pnpm gate` — it reads Windows/Electron-desktop-local state
// (%APPDATA%\Claude) that CI cannot see. It stays a standalone operator tool (same spirit as
// provision-worktree.mjs / worktree-health.mjs, but in scripts/ since nothing invokes it as a hook).
// The correlation + classification is factored into the pure, exported `classifySessionStarts` /
// `formatCheckReport` so it is testable off synthetic log lines with no machine-local state:
// `packages/cli/src/check-worktree-session-creation.test.ts`.
//
// Usage:
//   node scripts/check-worktree-session-creation.mjs baseline [--claude-dir <path>]
//   node scripts/check-worktree-session-creation.mjs check    [--claude-dir <path>]
//
// Exit codes for `check`:  0 = HEALTHY   1 = BROKEN / MIXED   2 = could not conclude
// (`2` is deliberately distinct from both: "no attempt seen" and "too soon to tell" are absences of
// observation, and neither may read as a green.)
import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const STATE_PATH = join(tmpdir(), "storytree-session-creation-check.json");

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The pure classifier. Everything below this banner and above `cmdBaseline` is a pure function over
// an array of log lines — no filesystem, no clock, no machine-local state.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The start MARKER. A hardcoded literal with no interpolation, logged identically on every start —
 * healthy or broken. Correlate FROM it; never read it as a symptom.
 */
export const ATTEMPT_MARKER = "LocalSessions.start:";

/**
 * The primary tell's window: a start that proceeded NORMALLY logs `Starting local session` within
 * this long of the marker. Measured latencies for normal starts: 0ms, 1s, 3s, 4s.
 */
export const DEFAULT_CORRELATION_WINDOW_MS = 5_000;

/**
 * How long after the marker a `Starting local session` line still counts as this start's AT ALL.
 *
 * ⚠ THIS BOUND IS NOT DECORATION, AND `5s` ALONE WOULD MANUFACTURE A FALSE BROKEN. Measured
 * 2026-08-19 23:57:15 -> 23:58:50 in %APPDATA%\Claude\logs\main.log: a worktree-backed start took
 * **95 SECONDS AND SUCCEEDED** (`Created worktree "relaxed-khorana-c390cd"` ->
 * `Starting local session`). The delay is the ADR-0389 D2 mechanism NOT hanging but still costing:
 * the pool scrubbed reuse candidates first — the junction recursion's `could not open directory
 * 'apps/desktop/node_modules/@storytree/drive/node_modules/@storytree/library/node_modules/
 * @storytree/proof-protocol/…'` warnings are in the log — gave up on all six, and fell through to
 * the create-fresh path, which then completed in four seconds.
 *
 * So a start beyond the correlation window is NOT broken; it is SLOW, and slow is a leading
 * indicator that the latent cycle (`session-cutting-outage-arc-inc-02`) is still burning time on
 * every start that touches a reuse candidate. It is reported as its own shape rather than folded
 * into either verdict. This bound is also the INDETERMINACY HORIZON: below it, an attempt with no
 * start line yet cannot honestly be called broken, because a slow success has not had time to land.
 */
export const DEFAULT_PROCEEDED_WINDOW_MS = 180_000;

/**
 * How far after the marker shape evidence is still attributed to that attempt. Matches the
 * proceeded window, since evidence is only ever collected for an attempt already judged failed.
 */
export const DEFAULT_EVIDENCE_WINDOW_MS = 180_000;

/** Evidence lines are truncated to this many characters. The scrub's failure line is ~27 MB. */
export const EVIDENCE_LINE_MAX = 240;

/**
 * Lines proving a start got past the marker into worktree provisioning. Every pattern was read off
 * a real %APPDATA%\Claude\logs\main.log before being hard-coded; the measured line it matches is
 * quoted beside it. `strength` records how much the evidence actually supports:
 *
 *   direct     — a named worktree, pooled slot or branch was created, leased, bound or trusted.
 *   path-entry — provisioning is provably RUNNING, but the log named nothing attributable to this
 *                attempt. The 2026-08-19 07:49 failure left only this, so the classifier must
 *                accept it — while still reporting that it is the weaker of the two.
 */
const ALLOCATION_EVIDENCE = [
  // `Creating worktree for session local_0a235fb9-… from C:/code/storytree`
  { strength: "direct", kind: "creating-worktree", re: /\bCreating worktree for session\b/ },
  // `Created worktree "test123-e9fb60" at C:\code\storytree\.claude\worktrees\test123-e9fb60`
  { strength: "direct", kind: "created-worktree", re: /\bCreated worktree "/ },
  // `Using worktree "test123-e9fb60" at … for session local_0a235fb9-…`
  { strength: "direct", kind: "bound-worktree", re: /\bUsing worktree "/ },
  // `[rebindWorktree] Rebound C:\…\test123-640433 (was leased by none) to local_a0d432c5-… on
  //  branch claude/test123-8e6da7` — the reuse path's completion. ADR-0389 D2: a hung start never
  //  reaches this line, so its presence is the strongest single "the reuse path finished" signal.
  { strength: "direct", kind: "rebound-worktree", re: /\[rebindWorktree\]/ },
  // `[WorktreePool] Reused worktree test123-640433 for session local_a0d432c5-… (was leased by none)`
  // Session-naming, so it is this attempt's. The GC lines sharing the prefix are NOT — see below.
  { strength: "direct", kind: "reused-worktree", re: /\[WorktreePool\] Reused worktree \S+ for session\b/ },
  // `… on branch claude/test123-8e6da7`
  { strength: "direct", kind: "branch-minted", re: /\bon branch claude\/\S+/ },
  // `Saved workspace trust for C:\…` / `Auto-trusted worktree with key "C:\…" (inherited from …)`
  {
    strength: "direct",
    kind: "worktree-trusted",
    re: /\b(?:Saved workspace trust for|Auto-trusted worktree with key)\b/,
  },

  // `[createWorktree] FETCH_HEAD is 181s old — skipping full origin fetch { baseRepo: … }` and
  // `[createWorktree] could not fast-forward local main (continuing): …`. The base-repo refresh
  // preamble, common to BOTH the reuse and create-fresh branches. This is the ONLY evidence the
  // 2026-08-19 07:49 failure left behind, so dropping it would restore the very blind spot this
  // file was re-pointed to close. (The fast-forward line is a bystander as a SYMPTOM — it fires on
  // successful starts too — and that does not stop it being honest progress evidence here.)
  { strength: "path-entry", kind: "create-path", re: /\[createWorktree\]/ },
  // `[stageCheckout] Selective checkout done in 252ms (2 paths)`
  { strength: "path-entry", kind: "stage-checkout", re: /\[stageCheckout\]/ },
  // `[refreshSourceRef] refreshed origin/main in 3035ms { baseRepo: 'C:/code/storytree' }`
  { strength: "path-entry", kind: "source-ref-refresh", re: /\[refreshSourceRef\]/ },
  // `[WorktreePool] No reusable worktree for C:/code/storytree (5/5 candidates checked)`
  { strength: "path-entry", kind: "pool-consulted", re: /\[WorktreePool\] No reusable worktree\b/ },
];

/**
 * The ADR-0389 D2 mechanism, when it is visible at all: the awaited `git clean -ffdx` that cannot
 * terminate over pnpm's junction cycle. Reported RANGE-SCOPED, never per attempt — the clean only
 * logs when it finally gives up, measured 31 minutes and three further attempts after the start it
 * belonged to.
 */
const SCRUB_EVIDENCE = [
  // `[purgeSessionClaudeState] session-authority clean failed in C:\…\inspiring-keller-79cd2e: …`
  { kind: "purge-clean-failed", re: /\[purgeSessionClaudeState\]/ },
  // `Git command failed: git -c core.longpaths=true clean -ffdx -- :(icase,glob).claude/** …`
  { kind: "unbounded-clean", re: /\bclean -ffdx\b/ },
];

/** `2026-08-15 21:56:03 [info] …` -> epoch ms, or null when the line carries no timestamp. */
function lineTimestampMs(line) {
  const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(line);
  if (!m) return null;
  const t = Date.parse(m[1].replace(" ", "T") + "Z"); // logs are local time; treated as UTC consistently
  return Number.isNaN(t) ? null : t;
}

function truncateEvidence(line) {
  if (line.length <= EVIDENCE_LINE_MAX) return line;
  return `${line.slice(0, EVIDENCE_LINE_MAX)}… (+${line.length - EVIDENCE_LINE_MAX} more chars)`;
}

/**
 * Correlate every start attempt in `lines` with the start that followed it, and — for any attempt
 * that did NOT proceed — name which fault shape it was.
 *
 * @param {readonly string[]} lines Raw main.log lines, in order.
 * @param {{ correlationWindowMs?: number, evidenceWindowMs?: number }} [opts]
 */
export function classifySessionStarts(lines, opts = {}) {
  const correlationWindowMs = opts.correlationWindowMs ?? DEFAULT_CORRELATION_WINDOW_MS;
  const proceededWindowMs = opts.proceededWindowMs ?? DEFAULT_PROCEEDED_WINDOW_MS;
  const evidenceWindowMs = opts.evidenceWindowMs ?? DEFAULT_EVIDENCE_WINDOW_MS;

  // A single log ENTRY can span several lines — the `could not fast-forward` body does — and the
  // continuation lines carry no timestamp of their own, so they inherit the last one seen.
  const stamped = [];
  let carried = null;
  let lastObservedMs = null;
  for (const line of lines) {
    const ownTs = lineTimestampMs(line);
    if (ownTs !== null) {
      carried = ownTs;
      lastObservedMs = ownTs;
    }
    stamped.push({ line, ts: carried, ownTs });
  }

  const attemptIdx = [];
  const startIdx = [];
  for (let i = 0; i < stamped.length; i++) {
    const entry = stamped[i];
    if (entry.ownTs === null) continue;
    if (entry.line.includes(ATTEMPT_MARKER)) attemptIdx.push(i);
    if (/Starting local session (\S+) in (.+?)\s*$/.test(entry.line)) startIdx.push(i);
  }

  // Pair attempts to starts FIFO, consuming each start line once. A `Starting local session` line
  // belongs to exactly one start, so two attempts a second apart cannot both claim the same one —
  // which is what a plain "find any start within 5s" does, and it manufactures a false HEALTHY.
  let nextStart = 0;
  const attempts = [];
  for (let a = 0; a < attemptIdx.length; a++) {
    const idx = attemptIdx[a];
    const attemptMs = stamped[idx].ts;
    const nextAttemptIdx = a + 1 < attemptIdx.length ? attemptIdx[a + 1] : stamped.length;

    // Discard start lines that precede this attempt outright — they belong to nothing we can pair.
    while (nextStart < startIdx.length && stamped[startIdx[nextStart]].ts < attemptMs) nextStart++;

    let matched = null;
    if (nextStart < startIdx.length) {
      const cand = stamped[startIdx[nextStart]];
      if (cand.ts - attemptMs <= proceededWindowMs) {
        const m = /Starting local session (\S+) in (.+?)\s*$/.exec(cand.line);
        matched = { sessionId: m[1], cwd: m[2], latencyMs: cand.ts - attemptMs };
        nextStart++;
      }
    }

    if (matched) {
      // The primary tell, unchanged: inside the correlation window this is an ordinary healthy
      // start. Outside it the start still PROCEEDED — calling that broken would be a fabricated
      // negative (measured: 95s, succeeded) — but it is flagged, because the delay is the ADR-0389
      // mechanism costing time without hanging.
      const fast = matched.latencyMs <= correlationWindowMs;
      attempts.push({
        timestampMs: attemptMs,
        shape: fast ? "healthy" : "slow-but-proceeded",
        sessionId: matched.sessionId,
        cwd: matched.cwd,
        latencyMs: matched.latencyMs,
        evidence: [],
        note: fast
          ? null
          : `the start PROCEEDED, but took ${Math.round(matched.latencyMs / 1000)}s against a normal ${correlationWindowMs / 1000}s — the reuse-candidate scrub burning time before falling through to create-fresh (ADR-0389 D2)`,
      });
      continue;
    }

    // The start did not proceed. Before naming a shape, check we could even have SEEN one: a
    // success has been measured at 95s, so a range that ends inside the proceeded window has not
    // yet ruled a slow success out, and calling it broken would be a fabricated negative.
    if (lastObservedMs !== null && lastObservedMs - attemptMs < proceededWindowMs) {
      attempts.push({
        timestampMs: attemptMs,
        shape: "indeterminate",
        sessionId: null,
        cwd: null,
        latencyMs: null,
        evidence: [],
        note:
          `the scanned log ends ${lastObservedMs - attemptMs}ms after this attempt, inside the ` +
          `${proceededWindowMs}ms window in which a SLOW start has been measured to still succeed ` +
          `(95s, 2026-08-19 23:57) — a start line could not yet have been ruled out`,
      });
      continue;
    }

    const evidence = [];
    for (let j = idx + 1; j < nextAttemptIdx; j++) {
      const entry = stamped[j];
      if (entry.ts !== null && entry.ts - attemptMs > evidenceWindowMs) break;
      for (const matcher of ALLOCATION_EVIDENCE) {
        if (matcher.re.test(entry.line)) {
          evidence.push({
            kind: matcher.kind,
            strength: matcher.strength,
            line: truncateEvidence(entry.line),
          });
          break;
        }
      }
    }

    if (evidence.length === 0) {
      attempts.push({
        timestampMs: attemptMs,
        shape: "total-silence",
        sessionId: null,
        cwd: null,
        latencyMs: null,
        evidence: [],
        note: "no worktree-provisioning evidence of any kind followed the marker",
      });
      continue;
    }

    const strength = evidence.some((e) => e.strength === "direct") ? "direct" : "path-entry";
    attempts.push({
      timestampMs: attemptMs,
      shape: "allocate-then-die",
      sessionId: null,
      cwd: null,
      latencyMs: null,
      strength,
      evidence,
      note:
        strength === "direct"
          ? "a worktree, pooled slot or branch was named for this start before it went silent"
          : "provisioning was provably running, but the log named no worktree or branch — the same evidence the 2026-08-19 07:49 failure left",
    });
  }

  // Range-scoped, deliberately unattributed. See the header trap about the 31-minute delay.
  const scrubEvidence = [];
  for (const entry of stamped) {
    for (const matcher of SCRUB_EVIDENCE) {
      if (matcher.re.test(entry.line)) {
        scrubEvidence.push({ kind: matcher.kind, line: truncateEvidence(entry.line) });
        break;
      }
    }
  }

  const healthy = attempts.filter((a) => a.shape === "healthy").length;
  const slow = attempts.filter((a) => a.shape === "slow-but-proceeded").length;
  const broken = attempts.filter(
    (a) => a.shape === "allocate-then-die" || a.shape === "total-silence",
  ).length;
  const indeterminate = attempts.filter((a) => a.shape === "indeterminate").length;

  // A slow start PROCEEDED, so it counts toward the capability working — it is reported loudly in
  // the text, never by reddening a verdict it did not earn.
  const proceeded = healthy + slow;

  let verdict;
  if (attempts.length === 0) verdict = "NO ATTEMPT DETECTED";
  else if (broken > 0 && proceeded > 0) verdict = "MIXED";
  else if (broken > 0) verdict = "BROKEN";
  else if (proceeded > 0) verdict = "HEALTHY";
  else verdict = "INDETERMINATE";

  return { attempts, scrubEvidence, counts: { healthy, slow, broken, indeterminate }, verdict };
}

/** `check`'s human-readable report. Pure, so the wording itself is testable. */
export function formatCheckReport(report) {
  const out = [];
  const stamp = (ms) => new Date(ms).toISOString();

  if (report.verdict === "NO ATTEMPT DETECTED") {
    out.push(`NO ATTEMPT DETECTED — no "${ATTEMPT_MARKER}" line appeared in main.log since the`);
    out.push(`baseline. Did the session/chip actually fire? (Queued chips are hidden behind the`);
    out.push(`front card — dismiss or start it first.)`);
    return out.join("\n");
  }

  out.push(`${report.attempts.length} session-start attempt(s) since baseline:`);
  for (const a of report.attempts) {
    if (a.shape === "healthy") {
      out.push(
        `  ${stamp(a.timestampMs)}  HEALTHY — "Starting local session ${a.sessionId}" followed ${a.latencyMs}ms later, in ${a.cwd}`,
      );
    } else if (a.shape === "slow-but-proceeded") {
      out.push(
        `  ${stamp(a.timestampMs)}  PROCEEDED, BUT SLOW — "Starting local session ${a.sessionId}" followed ${Math.round(a.latencyMs / 1000)}s later, in ${a.cwd}`,
      );
      out.push(`      ${a.note}.`);
      out.push(`      NOT a failure. It is the latent junction cycle still costing on every start`);
      out.push(`      that touches a reuse candidate — session-cutting-outage-arc-inc-02.`);
    } else if (a.shape === "indeterminate") {
      out.push(`  ${stamp(a.timestampMs)}  INDETERMINATE — ${a.note}.`);
      out.push(`      Re-run "check" in a few seconds; do NOT read this as either shape.`);
    } else if (a.shape === "total-silence") {
      out.push(`  ${stamp(a.timestampMs)}  BROKEN, shape: TOTAL SILENCE — ${a.note}.`);
      out.push(
        `      This is the shape the original throwaway-repo control repro tested, and the only`,
      );
      out.push(`      one it ever tested. It is NOT the ADR-0389 fault, which allocates first.`);
    } else {
      out.push(
        `  ${stamp(a.timestampMs)}  BROKEN, shape: ALLOCATE-THEN-DIE (${a.strength} evidence) — ${a.note}.`,
      );
      out.push(`      This is the ADR-0389 fault. The retired "nothing was created" tell reads it`);
      out.push(`      as HEALTHY, which is why that tell is gone. Evidence:`);
      for (const e of a.evidence) out.push(`        [${e.kind}] ${e.line}`);
    }
  }

  if (report.scrubEvidence.length > 0) {
    out.push(``);
    out.push(
      `The ADR-0389 D2 reuse-scrub mechanism is visible somewhere in this range (${report.scrubEvidence.length} line(s)).`,
    );
    out.push(
      `RANGE-SCOPED, not attributed to any attempt above: the awaited clean only logs when it finally`,
    );
    out.push(
      `gives up — measured 31 minutes and three further attempts after the start it belonged to.`,
    );
    for (const e of report.scrubEvidence.slice(0, 3)) out.push(`  [${e.kind}] ${e.line}`);
  }

  out.push(``);
  if (report.verdict === "BROKEN") {
    out.push(`VERDICT: BROKEN — no start attempt since the baseline proceeded.`);
    out.push(`Cause and remedy are ours, not upstream's (ADR-0389): the reuse path's awaited`);
    out.push(`"git clean -ffdx" cannot terminate over pnpm's junction cycle. Drain the reuse pool so`);
    out.push(`starts take the create-fresh path, which runs no clean — that is what restored cutting`);
    out.push(`on 2026-08-19, with the cycle still in place. Removing the cycle itself is`);
    out.push(`session-cutting-outage-arc-inc-02.`);
  } else if (report.verdict === "HEALTHY") {
    if (report.counts.slow > 0) {
      out.push(
        `VERDICT: HEALTHY — every start attempt since the baseline proceeded, but ${report.counts.slow} was SLOW.`,
      );
      out.push(`Session cutting works. The slow start is not a fault, it is a COST: the reuse-candidate`);
      out.push(`scrub burns time on pnpm's junction cycle before falling through to create-fresh.`);
    } else {
      out.push(`VERDICT: HEALTHY — every start attempt since the baseline proceeded normally.`);
    }
    if (report.counts.indeterminate > 0) {
      out.push(
        `(${report.counts.indeterminate} attempt(s) could not be judged — the log ended too soon. Re-run to resolve them.)`,
      );
    }
  } else if (report.verdict === "MIXED") {
    out.push(`VERDICT: MIXED — some attempts proceeded, some did not. Re-run against a single`);
    out.push(`isolated attempt (one chip or one session) for a clean read, and note the shapes above:`);
    out.push(`allocate-then-die and total-silence are different faults.`);
  } else {
    out.push(`VERDICT: INDETERMINATE — an attempt was seen but nothing can yet be concluded about it.`);
    out.push(`Re-run "check" in a few seconds. This is not a green.`);
  }
  return out.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Machine-local state gathering and the two commands.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function defaultClaudeDir() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude");
  }
  return join(homedir(), ".config", "Claude");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--claude-dir") args.claudeDir = argv[++i];
    else args._.push(a);
  }
  return args;
}

/** Every file under claude-code-sessions, recursively — count + newest mtime. */
function scanSessionRecords(claudeDir) {
  const root = join(claudeDir, "claude-code-sessions");
  let count = 0;
  let newestMs = 0;
  let newestPath = null;
  if (!existsSync(root)) return { count, newestMs, newestPath, root, exists: false };
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile()) {
        count++;
        try {
          const mtimeMs = statSync(p).mtimeMs;
          if (mtimeMs > newestMs) {
            newestMs = mtimeMs;
            newestPath = p;
          }
        } catch {
          // record may have been deleted between readdir and stat — skip it
        }
      }
    }
  }
  return { count, newestMs, newestPath, root, exists: true };
}

function scanWorktreeDirs(repoRoot) {
  const dir = join(repoRoot, ".claude", "worktrees");
  if (!existsSync(dir)) return { count: 0, dir, exists: false };
  const count = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  return { count, dir, exists: true };
}

function readMainLogLines(claudeDir) {
  const p = join(claudeDir, "logs", "main.log");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split(/\r?\n/);
}

function findRepoRoot() {
  // The worktree-dir count belongs to the MAIN checkout, not whichever worktree this script happens
  // to run from — `.claude/worktrees` lives only there. `git rev-parse --git-common-dir` resolves to
  // the shared `.git` regardless of which worktree calls it, so its parent is always the main
  // checkout root; that beats walking up for a `.git` entry, which would stop at a worktree's own
  // `.git` FILE (not dir) and silently point at the worktree instead of main.
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (r.status === 0 && r.stdout.trim()) {
    return dirname(r.stdout.trim());
  }
  // Fall back to walking up for a workspace marker (e.g. git itself is unavailable).
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function cmdBaseline(args) {
  const claudeDir = args.claudeDir ?? defaultClaudeDir();
  const repoRoot = findRepoRoot();
  const records = scanSessionRecords(claudeDir);
  const worktrees = scanWorktreeDirs(repoRoot);
  const logLines = readMainLogLines(claudeDir);

  if (!records.exists) {
    console.error(
      `No session-records directory found at ${records.root} — is this a machine with the desktop app installed?`,
    );
    process.exitCode = 1;
    return;
  }

  const snapshot = {
    takenAtMs: Date.now(),
    claudeDir,
    repoRoot,
    sessionRecordCount: records.count,
    newestRecordMtimeMs: records.newestMs,
    worktreeDirCount: worktrees.count,
    mainLogLineCount: logLines.length,
  };
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(snapshot, null, 2));

  console.log(`Baseline captured → ${STATE_PATH}`);
  console.log(
    `  session records:  ${snapshot.sessionRecordCount}  (newest mtime ${new Date(snapshot.newestRecordMtimeMs).toISOString()})`,
  );
  console.log(`  worktree dirs:    ${snapshot.worktreeDirCount}  (${worktrees.dir})`);
  console.log(`  main.log lines:   ${snapshot.mainLogLineCount}`);
  console.log(``);
  console.log(`Now fire the thing you want to check — a background-task chip, or a new desktop`);
  console.log(`session with "create a fresh worktree" ticked — then run:`);
  console.log(`  node scripts/check-worktree-session-creation.mjs check`);
}

function cmdCheck(args) {
  const claudeDir = args.claudeDir ?? defaultClaudeDir();
  if (!existsSync(STATE_PATH)) {
    console.error(`No baseline found at ${STATE_PATH} — run the "baseline" command first.`);
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const records = scanSessionRecords(claudeDir);
  const worktrees = scanWorktreeDirs(baseline.repoRoot);
  const logLines = readMainLogLines(claudeDir);

  const recordDelta = records.count - baseline.sessionRecordCount;
  const worktreeDelta = worktrees.count - baseline.worktreeDirCount;
  const newestMoved = records.newestMs > baseline.newestRecordMtimeMs;

  console.log(`Baseline (${new Date(baseline.takenAtMs).toISOString()}) → now:`);
  console.log(
    `  session records:  ${baseline.sessionRecordCount} → ${records.count}  (${recordDelta >= 0 ? "+" : ""}${recordDelta})`,
  );
  console.log(
    `  worktree dirs:    ${baseline.worktreeDirCount} → ${worktrees.count}  (${worktreeDelta >= 0 ? "+" : ""}${worktreeDelta})`,
  );
  console.log(`  newest record:    ${newestMoved ? "moved forward" : "unchanged"}`);
  console.log(
    `  ⚠ These three deltas are CONTEXT ONLY and feed no verdict. ADR-0389: a real failure`,
  );
  console.log(
    `    ALLOCATES — the 2026-08-19 07:49 failure created a branch and re-leased a pooled slot —`,
  );
  console.log(`    so a non-zero delta neither proves health nor rules the fault out.`);
  console.log(``);

  if (logLines.length < baseline.mainLogLineCount) {
    console.log(`⚠ main.log is SHORTER than the baseline (it rotated) — re-run "baseline" and fire`);
    console.log(`  the probe again; this check can only see the current file.`);
    console.log(``);
  }

  // Only the NEW lines since baseline are in scope.
  const report = classifySessionStarts(logLines.slice(Math.max(0, baseline.mainLogLineCount)));
  console.log(formatCheckReport(report));

  if (report.verdict === "BROKEN" || report.verdict === "MIXED") process.exitCode = 1;
  else if (report.verdict === "HEALTHY") process.exitCode = 0;
  else process.exitCode = 2;
}

/**
 * Commands that were deleted and must not come back. Refusing by name (rather than falling through
 * to a generic usage error) is the point: it tells whoever reached for `census` WHY it is gone, so
 * the six-day inference is not re-derived from scratch.
 */
const RETIRED_COMMANDS = {
  census: [
    `"census" was DELETED, not disabled (ADR-0389). It bucketed starts by the "worktree=true" flag`,
    `in [CCD start-timing] lines — but a provably app-created, successfully-started worktree session`,
    `on 2026-08-15 emitted NO start-timing line at all. So the count could never distinguish a dead`,
    `capability from an app version that stopped stamping the flag, and it was read as the former for`,
    `six days. Use "check" against a live attempt; there is no cheaper honest substitute.`,
  ],
};

function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === "baseline") return cmdBaseline(args);
  if (cmd === "check") return cmdCheck(args);
  if (cmd !== undefined && Object.hasOwn(RETIRED_COMMANDS, cmd)) {
    for (const line of RETIRED_COMMANDS[cmd]) console.error(line);
    process.exitCode = 1;
    return;
  }
  console.error(
    `Usage: node scripts/check-worktree-session-creation.mjs <baseline|check> [--claude-dir <path>]`,
  );
  process.exitCode = 1;
}

/**
 * True when this module is the process entry, false when it is imported — the arrangement
 * `provision-worktree.mjs` / `worktree-health.mjs` already use. Load-bearing here: without it,
 * importing `classifySessionStarts` from the test would run `main()`, print usage to stderr and set
 * `process.exitCode = 1`, redding the suite for a reason that names nothing about the suite.
 */
function isEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) main();
