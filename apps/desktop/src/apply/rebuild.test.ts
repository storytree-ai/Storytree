// Rebuild-core tests (ADR-0164 Phase 1 + ADR-0181 ff-to-main enforcement). The step-runner seam is a
// recording double, so every branch runs without a real `pnpm`/`git` spawn: all-pass → ok; a
// mid-sequence failure (a non-fast-forward, or a broken build) STOPS fail-closed and names the failing
// step; the output tail is bounded.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  rebuildSteps,
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

test("rebuildSteps (fallback, ffToMain:false) is the studio-then-electron build, all in plan.root", () => {
  const steps = rebuildSteps({ root: "/runtime", ffToMain: false });
  assert.equal(steps.length, 2);
  assert.deepEqual([...steps[0]!.args], ["--filter", "studio", "build"]);
  assert.deepEqual([...steps[1]!.args], ["--filter", "desktop", "run", "build:electron"]);
  // Every build step spawns pnpm (the win32 wrap keys off this) and runs in plan.root.
  assert.ok(steps.every((s) => s.cmd === "pnpm" && s.cwd === "/runtime"));
});

test("rebuildSteps (ffToMain:true) LEADS with fetch + ff-only-to-main + frozen install (Rail 2 enforced, ADR-0181)", () => {
  const steps = rebuildSteps({ root: "/runtime", ffToMain: true });
  assert.deepEqual(steps.map((s) => s.label), [
    "fetch origin",
    "fast-forward to origin/main",
    "install dependencies",
    "build studio bundle",
    "build electron main/preload",
  ]);
  // The advance is a git fast-forward-only merge — nothing but merged main can land.
  assert.deepEqual([...steps[0]!.args], ["fetch", "origin"]);
  assert.equal(steps[1]!.cmd, "git");
  assert.deepEqual([...steps[1]!.args], ["merge", "--ff-only", "origin/main"]);
  assert.deepEqual([...steps[2]!.args], ["install", "--frozen-lockfile"]);
  // Every step runs in the runtime worktree.
  assert.ok(steps.every((s) => s.cwd === "/runtime"));
});

test("runRebuild returns ok when every step exits 0, running them in order", async () => {
  const { run, seen } = recordingRunner([
    { code: 0, output: "studio built" },
    { code: 0, output: "electron built" },
  ]);
  const result = await runRebuild(run, rebuildSteps({ root: "/runtime", ffToMain: false }));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, ["build studio bundle", "build electron main/preload"]);
});

test("runRebuild STOPS on a non-fast-forward (ff-only merge fails → no build runs, ADR-0181)", async () => {
  // git merge --ff-only exits non-zero when HEAD is not behind origin/main → the rebuild halts BEFORE
  // any install/build, so un-merged code can never be compiled and relaunched onto.
  const { run, seen } = recordingRunner([
    { code: 0, output: "fetched" },
    { code: 128, output: "fatal: Not possible to fast-forward, aborting." },
    { code: 0, output: "should never run" },
  ]);
  const result = await runRebuild(run, rebuildSteps({ root: "/runtime", ffToMain: true }));
  assert.equal(result.ok, false);
  assert.equal((result as { step: string }).step, "fast-forward to origin/main");
  assert.match((result as { output: string }).output, /fast-forward/);
  // fetch ran, ff failed, install/builds SKIPPED.
  assert.deepEqual(seen, ["fetch origin", "fast-forward to origin/main"]);
});

test("runRebuild STOPS on the first failing build step (fail-closed — later steps never run)", async () => {
  const { run, seen } = recordingRunner([
    { code: 2, output: "vite: build failed\nType error in App.tsx" },
    { code: 0, output: "should never run" },
  ]);
  const result = await runRebuild(run, rebuildSteps({ root: "/runtime", ffToMain: false }));
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
  const result = await runRebuild(run, rebuildSteps({ root: "/runtime", ffToMain: false }));
  assert.equal(result.ok, false);
  assert.equal((result as { step: string }).step, "build electron main/preload");
  assert.deepEqual(seen, ["build studio bundle", "build electron main/preload"]);
});

test("a spawn-failure shape (non-zero code carrying the error) is surfaced fail-closed", async () => {
  // spawnStepRunner folds an ENOENT to { code: 1, output: '…spawn pnpm ENOENT' }; runRebuild must
  // treat that as a failure, never an ok.
  const { run } = recordingRunner([{ code: 1, output: "spawn pnpm ENOENT" }]);
  const result = await runRebuild(run, rebuildSteps({ root: "/runtime", ffToMain: false }));
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
