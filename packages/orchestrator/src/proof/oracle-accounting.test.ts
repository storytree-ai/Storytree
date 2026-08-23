import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { TestObservation } from "../phase-machine.js";
import { ShellTestExecutor, runShellCommand } from "../shell-test-executor.js";
import type { ShellCommand, ShellRunResult } from "../shell-test-executor.js";
import {
  PROOF_REPORT_ENV,
  allocateOracleReportPath,
  assertOracleGuardUrl,
  readAssertionCount,
  resetOracleReport,
  verifyOracleExercised,
} from "./oracle-accounting.js";

/**
 * ADR-0211 — the forged-green regression suite. The spine's only red/green signal is the proof
 * command's process exit code, and that command runs the IMPLEMENT-phase source in the SAME process
 * as the test. This suite DEMONSTRATES the two forged-green vectors (proving they forge a green with
 * no guard) and then proves the assert-oracle guard + out-of-band accounting turns each into a
 * fail-closed RED — so a hollow proof can never reach the signed verdict.
 *
 * Fully offline: it spawns the SAME Node binary running this test over tiny synthetic files, no tsx,
 * no network, no worktree (the tsx-fidelity leg is the one exception, and still fully local).
 */

/** The `tsx` loader URL, resolved as the real proof command does — for the tsx-fidelity leg. */
function tsxLoaderUrl(): string {
  return import.meta.resolve("tsx");
}

/** A malicious IMPLEMENT-phase source that MONKEYPATCHES the shared assert oracle at import time. */
const IMPL_MONKEYPATCH = `import assert from "node:assert/strict";
assert.equal = () => {};
assert.strictEqual = () => {};
export const add = (_a, _b) => 0; // wrong on purpose; the neutered oracle won't catch it
`;

/** A malicious source that TRUNCATES the run at import time — no assertion ever executes. */
const IMPL_PROCESS_EXIT = `export const add = (_a, _b) => 0;
process.exit(0);
`;

/** An honest source — the baseline green. */
const IMPL_GOOD = `export const add = (a, b) => a + b;
`;

/**
 * A malicious source that REMOVES the guard's accounting hook before truncating. ADR-0211's vector B
 * defence is "register the exit hook FIRST, so it fires even on `process.exit(0)`" — registering first
 * does nothing against source that REMOVES the listener. No report is written by this observation at
 * all, so whatever the previous observation left on disk is what the spine reads back.
 */
const IMPL_REMOVE_EXIT_HOOK = `process.removeAllListeners("exit");
process.exit(0);
export const add = (_a, _b) => 0;
`;

/** A wrong-but-present source: the honest test's assertion EXECUTES (counted), then throws — a red. */
const IMPL_WRONG = `export const add = (_a, _b) => 0;
`;

/** The leaf-authored test (frozen after CONFIRM_RED): it genuinely asserts the contract behaviour. */
const UNIT_TEST = (implRel: string): string => `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "./${implRel}";
test("add(2,3) === 5", () => {
  assert.equal(add(2, 3), 5, "add must satisfy the contract");
});
`;

/**
 * Like {@link UNIT_TEST}, but the assertion is preceded by a real async delay — used to
 * DESYNCHRONISE concurrent observers so their observations overlap rather than marching in step.
 */
const SLOW_UNIT_TEST = (implRel: string, delayMs: number): string => `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "./${implRel}";
test("add(2,3) === 5", async () => {
  await new Promise((resolve) => setTimeout(resolve, ${delayMs}));
  assert.equal(add(2, 3), 5, "add must satisfy the contract");
});
`;

/** Write a {test, impl} .mjs pair into a fresh temp workspace and return their paths. */
async function workspace(
  impl: string,
  testSource: string = UNIT_TEST("impl.mjs"),
): Promise<{ dir: string; testRel: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-oracle-"));
  await fs.writeFile(path.join(dir, "impl.mjs"), impl);
  await fs.writeFile(path.join(dir, "unit.test.mjs"), testSource);
  return { dir, testRel: "unit.test.mjs" };
}

/** The UNGUARDED observer: exactly what the spine did BEFORE ADR-0211 — exit code only. */
function unguarded(dir: string, testRel: string): ShellTestExecutor {
  return new ShellTestExecutor({
    command: (): ShellCommand => ({
      // NODE, named: `--test` is node's own runner. `process.execPath` would be `bun.exe` under
      // `bun test`, and these legs must spawn the binary production spawns — see `NODE_BINARY`
      // in `proof-route.ts`. A LITERAL, not the production constant: these tests prove the guard
      // defeats a forged green, so their fixtures must not be derived from what they verify.
      file: "node",
      args: ["--test", path.join(dir, testRel)],
      cwd: dir,
    }),
  });
}

/**
 * The GUARDED observer: exactly the wiring `resolve-prove-spec.ts` builds — the assert-oracle guard
 * preloaded, the stale report cleared BEFORE the spawn (ADR-0249), and the out-of-band green
 * cross-check after it. beforeRun/verifyGreen are a pair; a test that wired only one would be
 * measuring a configuration production never uses.
 */
function guarded(dir: string, testRel: string, reportPath: string): ShellTestExecutor {
  return new ShellTestExecutor({
    command: (): ShellCommand => guardedCommand(dir, testRel, reportPath),
    beforeRun: () => resetOracleReport(reportPath),
    verifyGreen: (out: ShellRunResult) => verifyOracleExercised(reportPath, out),
  });
}

/**
 * The guarded proof COMMAND itself — one definition, shared by {@link guarded}'s executor wiring and
 * by the legs below that spawn it directly in order to place a step BETWEEN the spawn and the read.
 */
function guardedCommand(dir: string, testRel: string, reportPath: string): ShellCommand {
  return {
    // NODE, named — `--import` and `--test` are node's own flags (see `unguarded` above).
    file: "node",
    args: ["--import", assertOracleGuardUrl(), "--test", path.join(dir, testRel)],
    cwd: dir,
    env: { [PROOF_REPORT_ENV]: reportPath },
  };
}

// ── The load-bearing regressions: each attack forges a green UNGUARDED, and is caught GUARDED ──────

test("ATTACK A (monkeypatch the oracle): forges a green UNGUARDED; the guard makes it a RED", async () => {
  const { dir, testRel } = await workspace(IMPL_MONKEYPATCH);
  try {
    // BEFORE ADR-0211: the neutered assert lets add(2,3)===0 pass — a forged green.
    const forged = await unguarded(dir, testRel).run("t");
    assert.equal(forged.result, "green", "precondition: unguarded, the monkeypatch DOES forge a green");

    // AFTER: the guard freezes node:assert, so `assert.equal = ...` throws at import → the proof reds.
    const report = path.join(dir, "report.json");
    const obs = await guarded(dir, testRel, report).run("t");
    assert.equal(obs.result, "red", "the guard must turn the monkeypatch into a red");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ATTACK B (process.exit(0) truncation): forges a green UNGUARDED; the accounting makes it a RED", async () => {
  const { dir, testRel } = await workspace(IMPL_PROCESS_EXIT);
  try {
    // BEFORE ADR-0211: process.exit(0) at import → no assertion runs, yet node --test exits 0.
    const forged = await unguarded(dir, testRel).run("t");
    assert.equal(forged.result, "green", "precondition: unguarded, process.exit(0) DOES forge a green");

    // AFTER: the exit code is still 0, but the guard's exit hook reports 0 assertions → the green is
    // downgraded to a fail-closed red, WITH a forensic note. This is the vector freeze alone can't stop.
    const report = path.join(dir, "report.json");
    const obs = await guarded(dir, testRel, report).run("t");
    assert.equal(obs.result, "red", "the out-of-band accounting must refuse a 0-assertion green");
    assert.match(obs.note ?? "", /oracle accounting/);
    assert.match(obs.note ?? "", /0 assertions/);
    // The report is real: the guard wrote a zero count even though the source called process.exit(0).
    assert.equal(readAssertionCount(report), 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ATTACK C (remove the accounting hook): a STALE report from the previous observation must never green", async () => {
  // The REAL build sequence over ONE report path — the thing a single-observation test cannot see.
  // resolve-prove-spec calls allocateOracleReportPath ONCE and closes over the result for CONFIRM_RED,
  // every leaf feedback run, and CONFIRM_GREEN. The protocol assumes the guard truncates on every run;
  // source that REMOVES the exit listener never truncates, so the spine reads the PREVIOUS observation.
  const { dir, testRel } = await workspace(IMPL_WRONG);
  try {
    const report = path.join(dir, "report.json");
    const observe = (): Promise<TestObservation> => guarded(dir, testRel, report).run("t");

    // CONFIRM_RED: the honest test runs against a wrong source. The assertion EXECUTES (so the guard
    // counts it) and then throws — a genuine red that leaves a POSITIVE count on disk.
    const red = await observe();
    assert.equal(red.result, "red", "precondition: a wrong source is observed red");
    assert.equal(readAssertionCount(report), 1, "precondition: CONFIRM_RED leaves a positive count");

    // IMPLEMENT authors the attack, then CONFIRM_GREEN observes. The exit code is 0 and NO report is
    // written by this run — the stale `{assertions:1}` above is what a freshness-blind spine reads.
    await fs.writeFile(path.join(dir, "impl.mjs"), IMPL_REMOVE_EXIT_HOOK);
    const green = await observe();
    assert.equal(
      green.result,
      "red",
      "a green whose observation wrote no assertion report must be refused, not served by the previous run's count",
    );
    assert.match(green.note ?? "", /oracle accounting/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ATTACK C differential: the SAME source on a FRESH report path is already refused — staleness is the whole gap", async () => {
  // The control that isolates the cause: with no prior observation to inherit from, the attack is
  // caught by the existing missing-report rule. So the ONLY thing that made it green above was the
  // spine trusting a report it had not established belonged to the observation it just made.
  const { dir, testRel } = await workspace(IMPL_REMOVE_EXIT_HOOK);
  try {
    const report = path.join(dir, "fresh.json");
    const obs = await guarded(dir, testRel, report).run("t");
    assert.equal(obs.result, "red", "on a fresh path the attack hits the missing-report refusal");
    assert.match(obs.note ?? "", /no assertion report/);
    assert.equal(readAssertionCount(report), null, "the attack genuinely wrote no report");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("resetOracleReport: clears a stale report, is a no-op when absent, and REFUSES when one survives", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-oracle-reset-"));
  try {
    const stale = path.join(dir, "stale.json");
    await fs.writeFile(stale, JSON.stringify({ assertions: 7 }));
    assert.equal(readAssertionCount(stale), 7, "precondition: a stale report is on disk");
    assert.deepEqual(resetOracleReport(stale), { ok: true });
    assert.equal(readAssertionCount(stale), null, "the stale report is gone after the reset");

    // Absent is the normal first-observation case — a no-op success, never a refusal.
    assert.deepEqual(resetOracleReport(path.join(dir, "never-existed.json")), { ok: true });

    // A path that cannot be cleared (a DIRECTORY stands in for any unlink failure) must REFUSE, not
    // silently proceed — an uncleared report is exactly the stale-read hole this reset exists to close.
    const undeletable = path.join(dir, "undeletable.json");
    await fs.mkdir(undeletable);
    await fs.writeFile(path.join(undeletable, "child"), "keeps the directory non-empty");
    const refused = resetOracleReport(undeletable);
    assert.equal(refused.ok, false, "a report that survives the reset must fail closed");
    if (!refused.ok) assert.match(refused.reason, /could not be cleared/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("HONEST GREEN: a real node:assert test still greens under the guard, and the oracle counted it", async () => {
  const { dir, testRel } = await workspace(IMPL_GOOD);
  try {
    const report = path.join(dir, "report.json");
    const obs = await guarded(dir, testRel, report).run("t");
    assert.equal(obs.result, "green", "the guard must never false-red an honest proof");
    // `oracle-veto-covers-custom-proof-commands`: a VETTED green now reports what the oracle
    // measured instead of carrying no note at all. What must never appear here is a DOWNGRADE
    // reason — this proof is accounted, so it is the one shape that must not read as unvetted.
    assert.match(obs.note ?? "", /assert-oracle: \d+ assertion\(s\) executed/);
    assert.ok((readAssertionCount(report) ?? 0) >= 1, "the guard counted the real assertion(s)");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("tsx fidelity: the guard defeats the monkeypatch under `node --import tsx --import guard` on a .ts test", async () => {
  // The REAL proof command runs under tsx over a .ts test — prove the guard composes with tsx.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-oracle-tsx-"));
  try {
    await fs.writeFile(
      path.join(dir, "impl.ts"),
      `import assert from "node:assert/strict";\nassert.equal = () => {};\nexport const add = (_a: number, _b: number): number => 0;\n`,
    );
    await fs.writeFile(
      path.join(dir, "unit.test.ts"),
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "./impl.ts";\ntest("t", () => { assert.equal(add(2, 3), 5); });\n`,
    );
    const report = path.join(dir, "report.json");
    const exec = new ShellTestExecutor({
      command: (): ShellCommand => ({
        // NODE, named — see `unguarded` above.
        file: "node",
        args: [
          "--import",
          tsxLoaderUrl(),
          "--import",
          assertOracleGuardUrl(),
          "--test",
          path.join(dir, "unit.test.ts"),
        ],
        cwd: dir,
        env: { [PROOF_REPORT_ENV]: report },
      }),
      beforeRun: () => resetOracleReport(report),
      verifyGreen: (out: ShellRunResult) => verifyOracleExercised(report, out),
    });
    const obs = await exec.run("t");
    assert.equal(obs.result, "red", "under tsx the frozen oracle still rejects the monkeypatch");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── verifyOracleExercised / readAssertionCount: fail-closed on every "cannot trust this" case ──────

test("verifyOracleExercised: a positive count is OK; zero and a missing report are fail-closed refusals", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-oracle-read-"));
  try {
    const ok = path.join(dir, "ok.json");
    await fs.writeFile(ok, JSON.stringify({ assertions: 3 }));
    assert.equal(readAssertionCount(ok), 3);
    // OK, and it now REPORTS the count it read (the vetted-green disclosure) rather than a bare ok.
    assert.deepEqual(verifyOracleExercised(ok), {
      ok: true,
      note: "assert-oracle: 3 assertion(s) executed",
    });

    const zero = path.join(dir, "zero.json");
    await fs.writeFile(zero, JSON.stringify({ assertions: 0 }));
    const zeroVeto = verifyOracleExercised(zero);
    assert.equal(zeroVeto.ok, false);
    if (!zeroVeto.ok) assert.match(zeroVeto.reason, /0 assertions/);

    // Missing file → null → fail-closed (never a silent pass).
    const missing = path.join(dir, "nope.json");
    assert.equal(readAssertionCount(missing), null);
    const missVeto = verifyOracleExercised(missing);
    assert.equal(missVeto.ok, false);
    if (!missVeto.ok) assert.match(missVeto.reason, /no assertion report/);

    // Malformed / wrong-shape JSON → null → fail-closed.
    const bad = path.join(dir, "bad.json");
    await fs.writeFile(bad, "not json at all");
    assert.equal(readAssertionCount(bad), null);
    const badShape = path.join(dir, "badshape.json");
    await fs.writeFile(badShape, JSON.stringify({ assertions: "lots" }));
    assert.equal(readAssertionCount(badShape), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("allocateOracleReportPath: sanitises runId/unitId and stays OUTSIDE any worktree (the OS temp dir)", () => {
  const p = allocateOracleReportPath("run/../weird 1", "unit:id");
  assert.equal(path.dirname(p), os.tmpdir(), "the report must live in the OS temp dir, never the worktree");
  assert.doesNotMatch(path.basename(p), /[/\\:]/, "unsafe path chars are sanitised out of the filename");
  // runId/unitId survive (sanitised) so a leaked report is attributable to the build that made it.
  assert.match(path.basename(p), /^storytree-proof-oracle-run_\.\._weird_1-unit_id-/);
});

test("allocateOracleReportPath: every call returns a DISTINCT path, even for the same (runId, unitId)", () => {
  // The deterministic guard behind the two concurrency legs below. Two observers proving the same unit
  // at the same moment must not be able to derive one shared path — on a shared path each observer's
  // ADR-0249 reset destroys the other's evidence. Asserted here without racing anything, so the
  // property cannot regress silently and be caught only by a flake.
  const paths = Array.from({ length: 64 }, () => allocateOracleReportPath("same-run", "same-unit"));
  assert.equal(new Set(paths).size, paths.length, "allocated report paths must never repeat");
});

// ── CONCURRENCY: the report path must belong to exactly ONE observer ────────────────────────────
//
// The report lives in the SHARED OS temp dir, and ADR-0249 makes every observation DELETE it first.
// Those two facts compose into a hazard the freshness protocol alone does not address: if two
// observers can ever derive the SAME path, each one's reset destroys the other's evidence, and the
// robbed observer reads `null` and refuses its green. That refusal is the SAFE direction — these legs
// never soften it — but the input was contaminated, so the red says nothing about the proof it judged.
//
// MEASURED 2026-08-03 (Windows), three concurrent runs of the orchestrator suite: two tests refused a
// green with "no assertion report was written". Both were honest proofs robbed by their own twin in a
// sibling run, because the suites keyed the path off HARDCODED fixture constants — identical in every
// run. The production hazard is LATENT rather than demonstrated: the one production caller passes a
// real per-run `runId`, so real builds collide only if a runId ever repeats.
//
// These two legs are the only ones that allocate a REAL report path — they are what the allocator's
// uniqueness is FOR, so substituting a workspace-local path would test nothing. Every other leg keeps
// its report inside its own temp workspace. Both legs therefore delete what they allocate: a per-call
// unique path is never overwritten by a rerun, so leaving them behind would grow the OS temp dir.

test("CONCURRENT SIBLINGS (forced interleaving): a sibling proving the same unit must not delete this observation's report", async () => {
  const mine = await workspace(IMPL_GOOD);
  const sibling = await workspace(IMPL_GOOD);
  const allocated: string[] = [];
  try {
    // Two observers, each allocating its own report path for the SAME (runId, unitId) — the shape two
    // concurrent proofs of one unit produce. Nothing here is stubbed: both paths come from the
    // production allocator, the reset and the read are the production functions, and the proof child
    // and its guard are real. Only the ORDERING is chosen rather than raced for, so the leg pins the
    // exact mechanism instead of re-rolling the dice the 2026-08-03 measurement happened to lose.
    const minePath = allocateOracleReportPath("same-run", "same-unit");
    const siblingPath = allocateOracleReportPath("same-run", "same-unit");
    allocated.push(minePath, siblingPath);

    // MY observation, decomposed exactly as ShellTestExecutor.run sequences it (reset → spawn → read),
    // so the sibling's reset can be placed in the window between my guard's write and my read.
    assert.deepEqual(resetOracleReport(minePath), { ok: true });
    const out = await runShellCommand(guardedCommand(mine.dir, mine.testRel, minePath));
    assert.equal(out.code, 0, "precondition: my honest proof exits 0");
    assert.ok((readAssertionCount(minePath) ?? 0) >= 1, "precondition: my guard wrote MY report");

    // ── the sibling begins ITS observation here: reset the path IT allocated, then spawn. Its proof
    // is deliberately left IN FLIGHT — the damaging interleaving is the sibling's reset landing after
    // my guard's write and before my read, while the sibling's own guard has not yet written. Awaiting
    // it first would let the sibling's report stand in for mine and hide the collision.
    assert.deepEqual(resetOracleReport(siblingPath), { ok: true });
    const siblingRun = runShellCommand(guardedCommand(sibling.dir, sibling.testRel, siblingPath));

    // ── I now read back what must still be MY evidence ──
    const verdict = verifyOracleExercised(minePath, out);
    const siblingOut = await siblingRun;
    assert.equal(siblingOut.code, 0, "precondition: the sibling's honest proof also exits 0");
    assert.equal(
      verdict.ok,
      true,
      "a sibling observation must not be able to destroy this observation's assertion report",
    );
  } finally {
    await fs.rm(mine.dir, { recursive: true, force: true });
    await fs.rm(sibling.dir, { recursive: true, force: true });
    await Promise.all(allocated.map((p) => fs.rm(p, { force: true })));
  }
});

test("CONCURRENT SIBLINGS (real parallelism): overlapping honest proofs of the same unit all keep their green", async () => {
  // The faithful reproduction: real OVERLAPPING observers, each a full ShellTestExecutor observation
  // (reset → real guarded child → read), all proving the same (runId, unitId) at once — what three
  // concurrent runs of this suite did on 2026-08-03. Staggered proof durations and repeated rounds
  // desynchronise them, so one observer's reset lands inside another's write→read window instead of
  // every observer marching in step. Every one of these proofs is honest, so every one must green.
  const OBSERVERS = 6;
  const ROUNDS = 3;
  const spaces = await Promise.all(
    Array.from({ length: OBSERVERS }, (_unused, i) =>
      workspace(IMPL_GOOD, SLOW_UNIT_TEST("impl.mjs", i * 40)),
    ),
  );
  const allocated: string[] = [];
  try {
    const observed = await Promise.all(
      spaces.map(async ({ dir, testRel }) => {
        const report = allocateOracleReportPath("parallel-run", "parallel-unit");
        allocated.push(report);
        const exec = guarded(dir, testRel, report);
        const rounds: TestObservation[] = [];
        for (let round = 0; round < ROUNDS; round += 1) {
          rounds.push(await exec.run("t"));
        }
        return rounds;
      }),
    );
    const refused = observed.flat().filter((obs) => obs.result !== "green");
    assert.deepEqual(
      refused.map((obs) => obs.note ?? "(refused with no note)"),
      [],
      "an honest proof must never be refused because a concurrent sibling cleared its report",
    );
  } finally {
    await Promise.all(spaces.map(({ dir }) => fs.rm(dir, { recursive: true, force: true })));
    await Promise.all(allocated.map((p) => fs.rm(p, { force: true })));
  }
});
