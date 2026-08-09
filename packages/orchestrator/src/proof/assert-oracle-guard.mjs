/**
 * The ASSERT-ORACLE GUARD (ADR-0211): a `node --import` preload that makes the spine's exit-code
 * oracle tamper-EVIDENT against the IMPLEMENT-phase source it runs in the same process.
 *
 * The forged-green hole it closes (ADR-0020 re-opened): the spine's ONLY red/green signal is the
 * proof command's process exit code, and that command loads+runs the leaf-authored source in the
 * SAME process and module registry as the test. Because the source is authored AFTER CONFIRM_RED,
 * red-first does not help — source can simply subvert the oracle the test depends on and force a
 * hollow `exit 0`. Two demonstrated vectors:
 *   A) monkeypatch the oracle: `import assert from "node:assert/strict"; assert.equal = () => {}`
 *      (the module object is shared/cached, so the test's later `assert.equal` becomes a no-op);
 *   B) truncate the run: `process.exit(0)` at import time (no assertion ever runs, yet `node --test`
 *      still reports a passing file and exits 0).
 *
 * Two defences, installed BEFORE any test/source module loads:
 *   1. FREEZE — wrap every node:assert assertion METHOD to count its real invocations, then
 *      `Object.freeze` both assert modules. A source that tries to reassign a method (vector A) throws
 *      a TypeError under ESM strict → its import fails → the proof reds. The wrappers cannot be swapped.
 *   2. ACCOUNT — a `process.on("exit")` hook (registered FIRST, so it runs even when the source calls
 *      `process.exit(0)` — vector B) writes the real assertion count to a file DERIVED from
 *      `STORYTREE_PROOF_REPORT`. The spine reads it back (aggregated — see the PER-PROCESS note below)
 *      and refuses a green that executed 0 assertions, out-of-band — the thing a bare exit code cannot
 *      see.
 *
 * PER-PROCESS REPORT FILES (`custom-proof-command-red-accounting` residual, `parallel-red-green-arc`).
 * A WHOLE-SUITE proof command (`node --test` over more than one file, whether invoked directly or via
 * a package script) isolates each test file in its OWN child process, and node:test's runner PARENT
 * outlives every child — so a single shared report file is overwritten LAST by the parent's own exit
 * hook, with the parent's own count of ZERO (it never runs an assertion itself). That is not a partial
 * signal, it is a GUARANTEED false zero regardless of how many real assertions the children ran.
 * Every guard-loaded process (the parent AND each child) therefore writes to its OWN file —
 * `${STORYTREE_PROOF_REPORT}.${process.pid}` — rather than the shared path directly. The spine reads
 * ALL of them back and sums the counts ({@link import("./oracle-accounting.js").readAssertionCount}),
 * so the parent's honest zero and each child's honest count compose into the suite's real total,
 * instead of the parent's zero silently winning a last-write race.
 *
 * WHAT REGISTERING FIRST DOES *NOT* BUY (ADR-0249, read before touching the write below): registering
 * first survives `process.exit(0)`, but nothing an in-process hook can do survives
 * `process.removeAllListeners("exit")` — source that removes the listener simply produces NO report.
 * That is safe ONLY because the spine CLEARS the report before every observation it trusts
 * (`resetOracleReport`), so a run that writes nothing leaves nothing, and "no report" is a fail-closed
 * refusal. Absent that reset, the report path is reused across CONFIRM_RED / feedback runs /
 * CONFIRM_GREEN and a non-writing run silently inherits the PREVIOUS run's positive count — a forged
 * green. The guard's honesty here rests on the spine's reset; do not remove one and keep the other.
 *
 * Honest limit (ADR-0211): no in-process oracle is PERFECTLY tamper-proof against arbitrary
 * same-process code (a determined attacker could run one dummy `assert.equal(1, 1)` then
 * `process.exit(0)` to bump the count to 1). This is the FLOOR — it fails closed on the easy vectors
 * and makes forgery require conspicuous, reviewable, intent-revealing code. The count is also written
 * so a later cross-check against the spine's declared-test parse can raise the bar further.
 *
 * Node builtins only (no package imports) so it loads in a bare worktree with no node_modules, and is
 * loaded from the SPINE's own committed copy (never a path the leaf's write scope can reach).
 */
import assertStrict from "node:assert/strict";
import assertLoose from "node:assert";
import { openSync, writeSync, closeSync } from "node:fs";

/** The env var naming the report file the spine reads back (mirrors oracle-accounting.ts). */
const REPORT_ENV = "STORYTREE_PROOF_REPORT";

/**
 * The assertion methods we count. An explicit allowlist (never the whole module) so we wrap only the
 * callable assertion surface — never `AssertionError` (a class used for `instanceof` / `throw`) or
 * `strict` (the sub-namespace), whose wrapping would break node:assert / node:test internals.
 */
const COUNTED_METHODS = new Set([
  "ok",
  "equal",
  "notEqual",
  "strictEqual",
  "notStrictEqual",
  "deepEqual",
  "notDeepEqual",
  "deepStrictEqual",
  "notDeepStrictEqual",
  "match",
  "doesNotMatch",
  "throws",
  "doesNotThrow",
  "rejects",
  "doesNotReject",
  "ifError",
  "fail",
]);

// A private counter, unreachable from the source under test (a module-scope closure, not a global).
let assertionCount = 0;

/** Wrap every counted method on `mod` to tally its calls, then freeze `mod` so the wrappers stick. */
function instrument(mod) {
  for (const name of COUNTED_METHODS) {
    const original = mod[name];
    if (typeof original !== "function") continue;
    try {
      mod[name] = (...args) => {
        assertionCount += 1;
        return original(...args);
      };
    } catch {
      // A non-writable property (already frozen elsewhere): leave it — freeze below still protects it.
    }
  }
  // FREEZE: a leaf's `assert.equal = () => {}` now throws (ESM strict) → its import fails → proof reds.
  try {
    Object.freeze(mod);
  } catch {
    /* best-effort — a frozen-freeze is a no-op */
  }
}

instrument(assertStrict);
instrument(assertLoose);

// ACCOUNT: write the real count on process exit. Registered FIRST and synchronous, so it fires even
// when the source calls process.exit(0) (vector B) — delivering the out-of-band evidence the spine
// cross-checks. Best-effort I/O: if the write fails, the report is absent and the spine fails CLOSED —
// TRUE only because the spine cleared the report before this observation (ADR-0249; see the header).
const reportPath = process.env[REPORT_ENV];
if (reportPath !== undefined && reportPath !== "") {
  // PER-PROCESS: this process's own count goes to its own file, never the shared base path — see the
  // header note. `process.pid` is unique among the concurrently-live processes of one observation
  // (parent + every node:test worker it forks), which is all the uniqueness this needs: the spine
  // clears every matching file before each observation it trusts (ADR-0249), so a stale pid from a
  // PRIOR observation can never survive to be misread as this one's.
  const perProcessPath = `${reportPath}.${process.pid}`;
  process.on("exit", () => {
    try {
      const fd = openSync(perProcessPath, "w");
      writeSync(fd, JSON.stringify({ assertions: assertionCount }));
      closeSync(fd);
    } catch {
      /* an unwritable report → the spine reads none → refuses the green fail-closed */
    }
  });
}
