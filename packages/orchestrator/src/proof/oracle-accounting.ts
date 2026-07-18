/**
 * ORACLE ACCOUNTING (ADR-0211): the spine-side half of the assert-oracle guard — the guard URL, the
 * out-of-band report path, and the fail-closed GREEN cross-check.
 *
 * The guard ({@link ./assert-oracle-guard.mjs}) is a `node --import` preload the spine adds to the
 * DEFAULT node:test proof command. It freezes node:assert (defeating the monkeypatch-the-oracle
 * vector) and writes the real assertion count to a report file (surviving the process.exit(0)
 * truncation vector). This module reads that report and turns "exit 0 but 0 assertions" — a hollow /
 * neutralised proof — into a fail-closed RED, so a forged green never reaches the signed verdict.
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

import { readFileSync } from "node:fs";
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
 * A per-build report path OUTSIDE any git worktree (the OS temp dir), so the guard writing it can
 * never dirty the tree the GATE proves clean. Keyed by runId+unitId so concurrent builds never clash;
 * the guard truncates on every run, so a build's later CONFIRM observation always overwrites its own
 * earlier feedback runs.
 */
export function oracleReportPath(runId: string, unitId: string): string {
  const safe = `${runId}-${unitId}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(os.tmpdir(), `storytree-proof-oracle-${safe}.json`);
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
