// Rebuild-core tests (ADR-0164 Phase 1). The step-runner seam is a recording double, so every branch
// runs without a real `pnpm` spawn: all-pass → ok; a mid-sequence failure STOPS (fail-closed) and
// names the failing step; the output tail is bounded.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REBUILD_STEPS,
  runRebuild,
  tailOutput,
  type RebuildStep,
  type StepResult,
  type StepRunner,
} from "./rebuild.js";

/** A recording runner: returns the queued result per call and logs which step labels it saw. */
function recordingRunner(results: StepResult[]): { run: StepRunner; seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  const run: StepRunner = async (step: RebuildStep) => {
    seen.push(step.label);
    return results[i++] ?? { code: 0, output: "" };
  };
  return { run, seen };
}

test("REBUILD_STEPS is the studio-then-electron recipe (ADR-0164)", () => {
  assert.equal(REBUILD_STEPS.length, 2);
  assert.deepEqual([...REBUILD_STEPS[0]!.args], ["--filter", "studio", "build"]);
  assert.deepEqual([...REBUILD_STEPS[1]!.args], ["run", "build:electron"]);
  // Every step spawns pnpm (the win32 wrap keys off this in spawnStepRunner).
  assert.ok(REBUILD_STEPS.every((s) => s.cmd === "pnpm"));
});

test("runRebuild returns ok when every step exits 0, running them in order", async () => {
  const { run, seen } = recordingRunner([
    { code: 0, output: "studio built" },
    { code: 0, output: "electron built" },
  ]);
  const result = await runRebuild(run);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, ["build studio bundle", "build electron main/preload"]);
});

test("runRebuild STOPS on the first failing step (fail-closed — later steps never run)", async () => {
  const { run, seen } = recordingRunner([
    { code: 2, output: "vite: build failed\nType error in App.tsx" },
    { code: 0, output: "should never run" },
  ]);
  const result = await runRebuild(run);
  assert.deepEqual(result, {
    ok: false,
    step: "build studio bundle",
    code: 2,
    output: "vite: build failed\nType error in App.tsx",
  });
  // The electron rebuild was SKIPPED — a broken studio build is never followed by a stale relaunch.
  assert.deepEqual(seen, ["build studio bundle"]);
});

test("runRebuild reports a failure in the SECOND step after the first passed", async () => {
  const { run, seen } = recordingRunner([
    { code: 0, output: "" },
    { code: 1, output: "esbuild: main.ts failed" },
  ]);
  const result = await runRebuild(run);
  assert.equal(result.ok, false);
  assert.equal((result as { step: string }).step, "build electron main/preload");
  assert.deepEqual(seen, ["build studio bundle", "build electron main/preload"]);
});

test("a spawn-failure shape (non-zero code carrying the error) is surfaced fail-closed", async () => {
  // spawnStepRunner folds an ENOENT to { code: 1, output: '…spawn pnpm ENOENT' }; runRebuild must
  // treat that as a failure, never an ok.
  const { run } = recordingRunner([{ code: 1, output: "spawn pnpm ENOENT" }]);
  const result = await runRebuild(run);
  assert.equal(result.ok, false);
  assert.match((result as { output: string }).output, /ENOENT/);
});

test("tailOutput keeps the actionable END of a long log", () => {
  const long = "x".repeat(5_000) + "THE REAL ERROR";
  const tail = tailOutput(long, 100);
  assert.equal(tail.length, 100);
  assert.match(tail, /THE REAL ERROR$/);
  // Short output is returned trimmed, untouched.
  assert.equal(tailOutput("  short  ", 100), "short");
});
