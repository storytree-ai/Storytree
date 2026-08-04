// The gate's RUNNER — the PURE half. Runs every step, records each one, reports per-step.
//
// WHY THIS EXISTS. `pnpm gate` was a single `&&` chain, so the FIRST red aborted it and left every
// later step UNRUN — reported as nothing at all rather than as unverified. Three measured
// consequences, all on this repo, all recorded on `verification-integrity-arc`:
//
//   - 2026-07-29  a mid-gate wall-clock flake in packages/forest-world aborted the chain before the
//                 three corpus checks. Run by hand afterwards, `check:corpus-content` reported
//                 `RED — corpus-content drain ceiling breached: 1 value-drift`: a real landing
//                 blocker the gate run never surfaced.
//   - 2026-08-02  `check:declared` red at link 10 on FOUR uncommitted paths another session had left
//                 in the shared primary checkout. Typecheck, the whole test suite and eleven later
//                 checks never ran; verifying the branch took ~25 minutes of manual re-runs across
//                 three invocations, and all fourteen were green. Per ADR-0245 D5.2 D3 the lobby was
//                 not that session's to clean, so NO in-session action could have produced one green
//                 gate run.
//   - 2026-08-03  `check:verification-decay` red at link ~19 (a breach on main, not the branch's)
//                 meant the six rungs behind it never ran for any session, each invoked by hand.
//
// The failure is silent in the direction that costs most: an aborted chain reports one red and says
// nothing about the rest, while `asset:unrun-check-is-unverified-not-refuted` is explicit that a
// check which COULD NOT RUN is UNVERIFIED, not refuted. Both readings — "the gate failed" and "not
// my problem, skip it" — are available from the same output. Hence three distinct statuses here, and
// `not-run` is never collapsed into either neighbour.
//
// WHAT THIS DOES NOT REACH, stated because the gap is easy to mistake for closed. `pnpm -r test` is
// ONE step here, and `pnpm -r` halts at its first failing package. So a flake in `packages/forest-
// world` still hides `packages/cli`'s suite INSIDE step 12 — the 2026-07-29 evidence had both halves,
// and only the outer one is fixed here. What changed is that the flake no longer costs the thirteen
// steps BEHIND `pnpm -r test`, which is where the corpus RED was hiding. The inner half is a
// different unit (it is `pnpm -r`'s behaviour, not the gate's shape) and is deliberately not
// smuggled into this one.
//
// THIS IS STRICTLY STRONGER THAN THE CHAIN IT REPLACES, and that is the property to preserve when
// editing: MORE steps actually execute, no check's own semantics change, no ceiling moves, and any
// red still fails the gate. {@link gateExitCode} is deliberately "green only if EVERY step passed" —
// a `not-run` step can never bank a pass, because a gate that cannot go red is not a gate
// (`asset:an-assert-oracle-proof-that-cannot-fail-is-not-a-proof`, and this arc's whole subject).
//
// REPORT-EVERYTHING, WITH NO HARD PRECONDITIONS — a deliberate call, not an omission. The
// alternative design is a plan where some step's failure makes later results MEANINGLESS, so they
// are honestly reported `not-run` rather than executed. Each of the 25 steps was checked against
// that bar and none clears it: every `check:*` reads its own inputs off disk or the live store, and
// the two expensive legs are independent of each other because tests run TRANSPILE-ONLY through tsx,
// so a type error does not stop the suite from producing a real verdict. "Likely to also be red" is
// not the same as "meaningless", and only the latter would justify withholding a step. If a genuine
// precondition ever appears, it belongs in `gate-order.ts` beside the plan as declared data — never
// as an early `return` here.
//
// `not-run` is therefore reachable by three routes, all real: the opt-in fail-fast mode (for the
// inner loop, where the first red is the whole answer); INTERRUPTION via {@link
// RunGateInput.shouldStop}; and a step KILLED BY A SIGNAL mid-flight ({@link
// GateExecution.unverified}). The last two matter because a foreground gate run exceeding the
// harness's fixed tool-call ceiling and being killed with no verdict at all is itself a measured trap
// — `asset:merge-ceremony` step 2 mandates backgrounding for exactly that reason, and this landing
// makes that guidance MORE load-bearing, not less, because a failing run no longer stops early.
//
// Pure: no spawning, no clock of its own, no process access. The caller injects execution and time.

import type { GateStep } from "./gate-order.js";

/**
 * A step's outcome. Three values, never two: `not-run` is UNVERIFIED — it is not a pass (nothing was
 * checked) and it is not a fail (nothing was found wanting).
 */
export type GateStepStatus = "pass" | "fail" | "not-run";

/** What one executed step reported. */
export interface GateExecution {
  /** The process exit code; `null` when the step could not be spawned at all. */
  readonly exitCode: number | null;
  /** Free text for the summary — a spawn error, typically. */
  readonly note?: string;
  /**
   * The step started but produced NO verdict — killed by a signal, typically. It is `not-run`
   * (unverified), never `fail`: nothing was found wanting, the answer simply never arrived. Reporting
   * a killed step as a failure is the same dishonesty as reporting a skipped one as absent.
   */
  readonly unverified?: boolean;
}

export interface GateStepResult {
  readonly command: string;
  readonly status: GateStepStatus;
  /** `null` for a step that never ran, and for one that could not be spawned. */
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly note?: string;
}

export interface RunGateInput {
  readonly steps: readonly GateStep[];
  /** Run one step and report its exit code. Injected, so tests drive the runner with stubs. */
  readonly execute: (step: GateStep, index: number) => GateExecution;
  /**
   * Opt-in fail-fast for the inner loop (default false — run every step). The steps after the first
   * failure are reported `not-run`, which is exactly what they are; they are never omitted, because
   * an absent row is the ambiguity this whole module removes.
   */
  readonly failFast?: boolean;
  /** Checked before each step; `true` stops the walk and reports the remainder `not-run`. */
  readonly shouldStop?: () => boolean;
  readonly onStepStart?: (step: GateStep, index: number, total: number) => void;
  readonly onStepDone?: (result: GateStepResult, index: number, total: number) => void;
  /** Injected clock (default `Date.now`) so durations are reportable without a real timer in tests. */
  readonly now?: () => number;
}

/**
 * Run the plan and return ONE result per step, in plan order — always `steps.length` of them, so a
 * caller can never mistake an absent row for a passing one.
 */
export function runGate(input: RunGateInput): GateStepResult[] {
  const { steps, execute } = input;
  const failFast = input.failFast ?? false;
  const now = input.now ?? Date.now;
  const total = steps.length;
  const results: GateStepResult[] = [];

  let stopped: string | undefined;
  for (const [index, step] of steps.entries()) {
    if (stopped === undefined && input.shouldStop?.() === true) stopped = "interrupted";

    if (stopped !== undefined) {
      const result: GateStepResult = {
        command: step.command,
        status: "not-run",
        exitCode: null,
        durationMs: 0,
        note: stopped,
      };
      results.push(result);
      input.onStepDone?.(result, index, total);
      continue;
    }

    input.onStepStart?.(step, index, total);
    const started = now();
    const exec = execute(step, index);
    const durationMs = now() - started;
    const status: GateStepStatus =
      exec.unverified === true ? "not-run" : exec.exitCode === 0 ? "pass" : "fail";
    const result: GateStepResult = {
      command: step.command,
      status,
      exitCode: status === "not-run" ? null : exec.exitCode,
      durationMs,
      ...(exec.note !== undefined ? { note: exec.note } : {}),
    };
    results.push(result);
    input.onStepDone?.(result, index, total);

    // A step that was killed answers for the whole walk: whatever stopped it is still in force.
    if (status === "not-run") stopped = "interrupted";
    else if (status === "fail" && failFast) stopped = "skipped after an earlier failure (--fail-fast)";
  }

  return results;
}

export interface GateTally {
  readonly pass: number;
  readonly fail: number;
  readonly notRun: number;
}

export function tallyGate(results: readonly GateStepResult[]): GateTally {
  return {
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    notRun: results.filter((r) => r.status === "not-run").length,
  };
}

/**
 * The gate's exit code. GREEN ONLY IF EVERY STEP PASSED — a `not-run` step is unverified, and
 * unverified is not green. An empty result set is likewise non-zero: a run that proved nothing has
 * not earned a pass.
 */
export function gateExitCode(results: readonly GateStepResult[]): number {
  if (results.length === 0) return 1;
  return results.every((r) => r.status === "pass") ? 0 : 1;
}

const GLYPH: Record<GateStepStatus, string> = {
  pass: "PASS   ",
  fail: "FAIL   ",
  "not-run": "NOT RUN",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/**
 * The per-step summary table. Every step appears, with its own status — the whole point being that a
 * reader can tell a step that FAILED from a step that NEVER RAN without reconstructing the plan.
 */
export function renderGateSummary(results: readonly GateStepResult[]): string[] {
  const tally = tallyGate(results);
  const width = Math.max(0, ...results.map((r) => r.command.length));
  const lines = ["", "=== gate summary ===", ""];

  for (const r of results) {
    // A KILLED step is `not-run` but did burn wall clock; hiding that would lose the one signal that
    // separates it from a step that was never reached.
    const timing =
      r.status === "not-run" && r.durationMs === 0 ? "" : `  ${formatDuration(r.durationMs)}`;
    const code = r.status === "fail" && r.exitCode !== null ? `  (exit ${r.exitCode})` : "";
    const note = r.note !== undefined ? `  — ${r.note}` : "";
    lines.push(`  ${GLYPH[r.status]}  ${r.command.padEnd(width)}${timing}${code}${note}`);
  }

  lines.push(
    "",
    `  ${tally.pass} passed, ${tally.fail} failed, ${tally.notRun} not run  (of ${results.length})`,
  );

  if (tally.fail > 0) {
    lines.push("", "  FAILED:");
    for (const r of results.filter((x) => x.status === "fail")) lines.push(`    ${r.command}`);
  }
  if (tally.notRun > 0) {
    lines.push(
      "",
      "  NOT RUN is UNVERIFIED, not passed — these steps were never executed, so they found",
      "  nothing and proved nothing. Re-run them before treating the gate as answered:",
    );
    for (const r of results.filter((x) => x.status === "not-run")) lines.push(`    ${r.command}`);
  }

  lines.push(
    "",
    gateExitCode(results) === 0
      ? "  GATE GREEN — every step ran and passed."
      : "  GATE RED — the gate is green only when every step ran and passed.",
    "",
  );
  return lines;
}
