import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { perTestReportFile } from "./proof/per-test-report.js";
import type { PerTestReport, PerTestReportSource } from "./proof/per-test-report.js";
import { ShellTestExecutor } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";

// The observer's half of ADR-0573 D2: clear the per-test report before the spawn (ADR-0249's rule), read
// it right after, and carry what THIS run wrote on the observation. Real child processes, no files beyond
// the report itself.

const PASS_LINE = '{"type":"test:pass","name":"t","nesting":0,"testType":"test"}';

/** A child that writes one reporter line to `target` when asked, then exits `code`. */
function childCommand(target: string, code: number, write: boolean): ShellCommand {
  const script = write
    ? `require("node:fs").writeFileSync(process.argv[1], ${JSON.stringify(`${PASS_LINE}\n`)}); process.exit(${code});`
    : `process.exit(${code});`;
  return { file: process.execPath, args: ["-e", script, target] };
}

/** A per-test source double that counts how often the executor touched it. */
function countingSource(resetResult: { ok: true } | { ok: false; reason: string }): PerTestReportSource & {
  resets: number;
  reads: number;
} {
  const source = {
    channel: "node-test" as const,
    resets: 0,
    reads: 0,
    reset(): { ok: true } | { ok: false; reason: string } {
      source.resets += 1;
      return resetResult;
    },
    read(): PerTestReport {
      source.reads += 1;
      return { channel: "node-test", present: false, rows: [] };
    },
  };
  return source;
}

async function withDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "storytree-per-test-observer-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("per-test-report-rides-the-observation: what the run wrote rides on the observation, red and green", async () => {
  await withDir(async (dir) => {
    const reportPath = join(dir, "report.jsonl");
    for (const code of [0, 1]) {
      const executor = new ShellTestExecutor({
        command: () => childCommand(reportPath, code, true),
        perTestReport: perTestReportFile("node-test", reportPath),
      });
      const obs = await executor.run("unit");
      assert.equal(obs.result, code === 0 ? "green" : "red");
      assert.deepEqual(obs.perTest, {
        channel: "node-test",
        present: true,
        rows: [{ path: ["t"], outcome: "passed", message: "" }],
      });
      // The per-test report never changes what the exit code decided, nor the process result it carries.
      assert.equal(obs.originalProcessResult?.exitCode, code);
    }
  });
});

test("per-test-report-rides-the-observation: a stale report is cleared before the spawn, so a run that writes nothing reads as absent", async () => {
  await withDir(async (dir) => {
    const reportPath = join(dir, "report.jsonl");
    await writeFile(reportPath, `${PASS_LINE}\n`);
    const obs = await new ShellTestExecutor({
      command: () => childCommand(reportPath, 0, false),
      perTestReport: perTestReportFile("node-test", reportPath),
    }).run("unit");
    assert.deepEqual(obs.perTest, { channel: "node-test", present: false, rows: [] });
  });
});

test("per-test-report-rides-the-observation: a report that survives the clear refuses the observation without spawning", async () => {
  await withDir(async (dir) => {
    const marker = join(dir, "spawned");
    const source = countingSource({ ok: false, reason: "per-test report: could not be cleared" });
    const obs = await new ShellTestExecutor({
      command: () => childCommand(marker, 0, true),
      perTestReport: source,
    }).run("unit");
    assert.deepEqual(obs, { result: "red", kind: "runtime", testId: "unit", note: "per-test report: could not be cleared" });
    assert.equal(existsSync(marker), false, "the command never ran");
    assert.equal(source.reads, 0);
  });
});

test("per-test-report-rides-the-observation: an executor with no per-test source attaches nothing", async () => {
  await withDir(async (dir) => {
    const obs = await new ShellTestExecutor({ command: () => childCommand(join(dir, "report.jsonl"), 0, true) }).run("unit");
    assert.equal("perTest" in obs, false);
  });
});
