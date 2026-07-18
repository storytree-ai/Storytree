import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { ShellTestExecutor } from "../shell-test-executor.js";
import type { ShellCommand, ShellRunResult } from "../shell-test-executor.js";
import {
  PROOF_REPORT_ENV,
  assertOracleGuardUrl,
  oracleReportPath,
  readAssertionCount,
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

/** The leaf-authored test (frozen after CONFIRM_RED): it genuinely asserts the contract behaviour. */
const UNIT_TEST = (implRel: string): string => `import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "./${implRel}";
test("add(2,3) === 5", () => {
  assert.equal(add(2, 3), 5, "add must satisfy the contract");
});
`;

/** Write a {test, impl} .mjs pair into a fresh temp workspace and return their paths. */
async function workspace(impl: string): Promise<{ dir: string; testRel: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-oracle-"));
  await fs.writeFile(path.join(dir, "impl.mjs"), impl);
  await fs.writeFile(path.join(dir, "unit.test.mjs"), UNIT_TEST("impl.mjs"));
  return { dir, testRel: "unit.test.mjs" };
}

/** The UNGUARDED observer: exactly what the spine did BEFORE ADR-0211 — exit code only. */
function unguarded(dir: string, testRel: string): ShellTestExecutor {
  return new ShellTestExecutor({
    command: (): ShellCommand => ({
      file: process.execPath,
      args: ["--test", path.join(dir, testRel)],
      cwd: dir,
    }),
  });
}

/** The GUARDED observer: the assert-oracle guard preloaded + the out-of-band green cross-check. */
function guarded(dir: string, testRel: string, reportPath: string): ShellTestExecutor {
  return new ShellTestExecutor({
    command: (): ShellCommand => ({
      file: process.execPath,
      args: ["--import", assertOracleGuardUrl(), "--test", path.join(dir, testRel)],
      cwd: dir,
      env: { [PROOF_REPORT_ENV]: reportPath },
    }),
    verifyGreen: (out: ShellRunResult) => verifyOracleExercised(reportPath, out),
  });
}

// ── The load-bearing regressions: each attack forges a green UNGUARDED, and is caught GUARDED ──────

test("ATTACK A (monkeypatch the oracle): forges a green UNGUARDED; the guard makes it a RED", async () => {
  const { dir, testRel } = await workspace(IMPL_MONKEYPATCH);
  try {
    // BEFORE ADR-0211: the neutered assert lets add(2,3)===0 pass — a forged green.
    const forged = await unguarded(dir, testRel).run("t");
    assert.equal(forged.result, "green", "precondition: unguarded, the monkeypatch DOES forge a green");

    // AFTER: the guard freezes node:assert, so `assert.equal = ...` throws at import → the proof reds.
    const report = oracleReportPath("attack-a", "unit");
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
    const report = oracleReportPath("attack-b", "unit");
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

test("HONEST GREEN: a real node:assert test still greens under the guard, and the oracle counted it", async () => {
  const { dir, testRel } = await workspace(IMPL_GOOD);
  try {
    const report = oracleReportPath("honest", "unit");
    const obs = await guarded(dir, testRel, report).run("t");
    assert.equal(obs.result, "green", "the guard must never false-red an honest proof");
    assert.equal(obs.note, undefined);
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
    const report = oracleReportPath("tsx", "unit");
    const exec = new ShellTestExecutor({
      command: (): ShellCommand => ({
        file: process.execPath,
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
    assert.deepEqual(verifyOracleExercised(ok), { ok: true });

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

test("oracleReportPath: sanitises runId/unitId and stays OUTSIDE any worktree (the OS temp dir)", () => {
  const p = oracleReportPath("run/../weird 1", "unit:id");
  assert.equal(path.dirname(p), os.tmpdir(), "the report must live in the OS temp dir, never the worktree");
  assert.doesNotMatch(path.basename(p), /[/\\:]/, "unsafe path chars are sanitised out of the filename");
});
