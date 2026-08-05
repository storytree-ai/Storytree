/**
 * ORACLE ACCOUNTING (ADR-0211, freshness added by ADR-0249): the spine-side half of the assert-oracle
 * guard — the guard URL, the out-of-band report path, the PRE-observation reset, and the fail-closed
 * GREEN cross-check.
 *
 * The guard ({@link ./assert-oracle-guard.mjs}) is a `node --import` preload the spine adds to the
 * DEFAULT node:test proof command. It freezes node:assert (defeating the monkeypatch-the-oracle
 * vector) and writes the real assertion count to a report file (surviving the process.exit(0)
 * truncation vector). This module reads that report and turns "exit 0 but 0 assertions" — a hollow /
 * neutralised proof — into a fail-closed RED, so a forged green never reaches the signed verdict.
 *
 * THE TWO HALVES ARE ONE MECHANISM (ADR-0249). Reading the report is only fail-closed if the report is
 * KNOWN to be this observation's: {@link resetOracleReport} clears it before the spawn,
 * {@link verifyOracleExercised} reads it after. Wire them as a pair. Reading without resetting lets an
 * observation that wrote NO report inherit the previous one's count — which inverts the whole layer's
 * degradation mode from fail-closed to fail-OPEN.
 *
 * WHY THE FLOOR IS `>= 1`, and its honest limit: the two demonstrated forged-green vectors both leave
 * ZERO real assertions executed, so requiring at least one closes them. A more determined same-process
 * attacker could still run one dummy `assert.equal(1, 1)` then `process.exit(0)` to reach a count of 1;
 * defeating THAT needs the declared-count cross-check (the owner-chosen follow-on, ADR-0211). This
 * floor fails closed on the easy vectors and makes forgery require conspicuous code.
 *
 * SCOPE: the veto is wired only for the DEFAULT `node --import tsx --test <file>` proof command, whose
 * tests assert via `node:assert/strict` (the codebase convention the coverage classifier already
 * assumes). Custom-`proofCommand` nodes (package suites, vitest) may assert via other APIs the guard
 * does not count, so they keep exit-code-only observation for now — a documented narrower follow-on.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ShellRunResult } from "../shell-test-executor.js";

/** The env var the guard writes its assertion-count report to, and the spine reads back. */
export const PROOF_REPORT_ENV = "STORYTREE_PROOF_REPORT";

/**
 * The `node --import` URL of the guard preload. Resolved off THIS module so it always points at the
 * SPINE's own committed copy of the guard — never a copy inside the build worktree, which (though
 * outside the leaf's declared write scope) should never be trusted as the oracle's own instrument.
 * Uses `import.meta.resolve` exactly as {@link ../resolve-prove-spec.ts}'s `tsxLoaderUrl` does.
 */
export function assertOracleGuardUrl(): string {
  return import.meta.resolve("./assert-oracle-guard.mjs");
}

/**
 * ALLOCATE a report path for ONE observation sequence, OUTSIDE any git worktree (the OS temp dir) so
 * the guard writing it can never dirty the tree the GATE proves clean.
 *
 * CALL IT ONCE PER BUILD AND CLOSE OVER THE RESULT. The single path is REUSED by every observation of
 * that build (CONFIRM_RED, each leaf feedback run, CONFIRM_GREEN), and the report body carries no run
 * identity — so a count read off it is NOT self-evidently this observation's. It becomes attributable
 * only because {@link resetOracleReport} clears it first; the original protocol instead assumed "the
 * guard truncates on every run", which is false whenever the guard's exit hook does not fire (ADR-0249).
 *
 * WHY THE RETURN IS UNIQUE PER CALL, not a pure function of (runId, unitId). The report lives in the
 * SHARED OS temp dir and ADR-0249 makes every trusted observation DELETE it first, so a path two
 * observers can both derive is a path on which each destroys the other's evidence: the robbed observer
 * reads no report and refuses its green. That refusal is the correct, fail-closed direction — but its
 * input was contaminated by a stranger, so the red says nothing about the proof it judged. Keying on
 * (runId, unitId) alone carried exactly that hazard: it separates DIFFERENT units but not two
 * concurrent observations of the SAME one. MEASURED 2026-08-03, three concurrent runs of the
 * orchestrator suite: two honest proofs were refused with "no assertion report was written", each
 * robbed by its own twin in a sibling run, because the suites keyed the path off hardcoded fixture
 * constants. Production was never demonstrated to collide — its one caller passes a real per-run
 * `runId` — so that hazard was LATENT, and this makes it unreachable rather than unlikely.
 *
 * runId/unitId are kept in the NAME (sanitised) purely so a leaked report is attributable to the build
 * and unit that made it; `pid` names the owning process. Uniqueness itself rests on the random token.
 *
 * The compute-once discipline is not merely convention — it FAILS CLOSED when broken. A caller that
 * re-allocates instead of closing over the value resets one fresh path and reads another, so it finds
 * no report and refuses the green LOUDLY. The mistake cannot manufacture a pass.
 */
export function allocateOracleReportPath(runId: string, unitId: string): string {
  const safe = `${runId}-${unitId}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(
    os.tmpdir(),
    `storytree-proof-oracle-${safe}-${process.pid}-${randomUUID()}.json`,
  );
}

/**
 * CLEAR the report before an observation the spine intends to TRUST — the freshness half of the
 * protocol (ADR-0249).
 *
 * Why it is load-bearing: {@link allocateOracleReportPath} hands back ONE path per build, and the
 * resolver closes over it for CONFIRM_RED, every leaf feedback run, and CONFIRM_GREEN. The report
 * body carries no identity, so the spine cannot tell WHICH observation wrote the count it is reading.
 * The protocol leaned on "the guard truncates on every run" — but the guard's `process.on("exit")` hook
 * only truncates if it RUNS, and IMPLEMENT-phase source can simply
 * `process.removeAllListeners("exit")` before `process.exit(0)`. Then nothing truncates, CONFIRM_GREEN
 * exits 0, and the spine reads the PREVIOUS observation's positive count and greens a proof that
 * executed zero assertions — a layer designed to fail closed failing OPEN.
 *
 * Deleting the report first makes the count trustworthy BY CONSTRUCTION: after a successful reset the
 * only way a report can exist is that the guard wrote it DURING this observation. "The guard did not
 * write" then collapses to "no report", which is what {@link verifyOracleExercised} already refuses —
 * so the guard's own best-effort-write comment becomes true rather than aspirational.
 *
 * FAIL-CLOSED, including its own failure: a report that SURVIVES the reset attempt is a refusal, never
 * a shrug. An uncleared report is precisely the stale read this exists to prevent, so swallowing the
 * unlink error would reintroduce the hole it closes. A missing report is the normal
 * first-observation case and succeeds silently.
 */
export function resetOracleReport(
  reportPath: string,
): { ok: true } | { ok: false; reason: string } {
  try {
    rmSync(reportPath, { force: true });
  } catch {
    // Swallowed HERE only because the existence check below is the real verdict — see it fail closed.
  }
  if (existsSync(reportPath)) {
    return {
      ok: false,
      reason:
        `oracle accounting: the previous assertion report at ${reportPath} could not be cleared before ` +
        `this observation, so a count read back from it cannot be attributed to this run — refusing ` +
        `the observation fail-closed rather than trusting a possibly stale report`,
    };
  }
  return { ok: true };
}

/**
 * Fail-closed read of the assertion count from a guard report. Returns the finite count, or `null`
 * when the file is missing, unreadable, malformed, or does not carry a numeric `assertions` — every
 * "cannot trust this" case collapses to `null`, which the caller treats as "the oracle did not run".
 */
export function readAssertionCount(reportPath: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as { assertions?: unknown }).assertions === "number"
    ) {
      const count = (parsed as { assertions: number }).assertions;
      return Number.isFinite(count) ? count : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * MEASURE a red's kind from the assertion count (`gate-the-right-kind-red`).
 *
 * The report answers the question the "right-kind red" check is actually asking. A red that executed
 * ZERO assertions never reached an assertion at all — the module did not resolve, the file did not
 * load, the run died in setup — which is a STRUCTURAL red (`compile`). A red that executed at least
 * one assertion reached the oracle and the oracle said no, which is an ASSERTION red (`runtime`).
 *
 * That is a measurement of the thing itself, where {@link defaultClassifyKind} is a guess about how
 * some toolchain worded its output — and a guess that was demonstrably wrong for Node's own
 * `Cannot find module` until nothing-consumed-it stopped hiding the bug. Hence `nextPhase` refuses a
 * wrong-kind red only on THIS basis.
 *
 * Returns `undefined` when the count cannot be read at all (no report / unreadable / malformed).
 * That is "unmeasurable", NOT "structural": collapsing it to a kind would let a missing report — the
 * very thing {@link verifyOracleExercised} treats as suspicious — silently satisfy a kind gate. The
 * caller falls back to the text heuristic and the gate stays disarmed.
 *
 * Only meaningful paired with {@link resetOracleReport}, exactly as the green cross-check is: without
 * the pre-run clear, a count could belong to a previous observation.
 */
export function classifyRedByOracle(
  reportPath: string,
): "compile" | "runtime" | undefined {
  const count = readAssertionCount(reportPath);
  if (count === null) return undefined;
  return count >= 1 ? "runtime" : "compile";
}

/**
 * The GREEN cross-check (ADR-0211): a proof that exited 0 is only trusted as a green if the guard's
 * out-of-band report shows the assertion oracle actually ran (>= 1 real assertion). Fail-closed — a
 * missing/unreadable report, or a zero count, REFUSES the green (returns `ok: false` with a forensic
 * reason). Pure but for the one report read; the `_out` is accepted so this fits the executor's
 * `verifyGreen(out)` seam and can grow to consult stdout later without a signature change.
 */
export function verifyOracleExercised(
  reportPath: string,
  _out?: ShellRunResult,
): { ok: true } | { ok: false; reason: string } {
  const count = readAssertionCount(reportPath);
  if (count === null) {
    return {
      ok: false,
      reason:
        `oracle accounting: no assertion report was written (${PROOF_REPORT_ENV}=${reportPath}) — ` +
        `the proof exited 0 without running the instrumented assert oracle; refusing the green fail-closed`,
    };
  }
  if (count < 1) {
    return {
      ok: false,
      reason:
        `oracle accounting: the proof exited 0 but executed 0 assertions — the test oracle was ` +
        `neutralised or the run was truncated before any assertion; refusing the green as unproven`,
    };
  }
  return { ok: true };
}
