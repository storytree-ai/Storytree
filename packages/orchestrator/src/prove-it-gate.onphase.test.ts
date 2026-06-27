import { test } from "node:test";
import assert from "node:assert/strict";

import { MapToolExecutor, ScriptedModel } from "@storytree/agent";
import type { ModelResponse } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { SignerInputs } from "./proof/signer.js";

import { PathWriteScope, RecordingTestExecutor } from "./phase-machine.js";
import type { Phase, TestObservation } from "./phase-machine.js";
import type { WriteToolSpec } from "./write-scoped-executor.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";

// ── ADR-0048 §3 v2: the phase-resolved wisp's wire ──────────────────────────
//
// The orbiting build wisp must colour by the LIVE red→green phase, and the only
// honest way to surface that without orchestrator impurity (ADR-0048 "No
// orchestrator impurity") is an INJECTED, default-no-op `onPhase` observer the
// spine invokes as it commits to each phase. The activity WRITE lives in the CLI
// drive (node-build.ts), never here — this test pins ONLY that the spine fires the
// observer at each phase it actually enters, in order, and stops firing the moment
// the walk fails closed. Absent observer ⇒ zero behaviour change (the existing
// prove-it-gate.test.ts proves that — every spec there omits onPhase).

const FIXED_NOW = "2026-06-08T00:00:00.000Z";
const TEST_PATH = "packages/orchestrator/src/foo.test.ts";
const SOURCE_PATH = "packages/orchestrator/src/foo.ts";
const RED: TestObservation = { result: "red", kind: "compile", testId: "T" };
const GREEN: TestObservation = { result: "green", testId: "T" };

const scope = () =>
  new PathWriteScope({
    testGlobs: ["**/*.test.ts"],
    sourceGlobs: ["packages/**/src/*.ts"],
  });

const writeTools: WriteToolSpec = {
  write: (input) => (input as { path: string }).path,
};

const leafTools = () =>
  new MapToolExecutor({ write: () => "wrote", read: () => "contents" });

const fixedTree = (state: TreeState) => async (): Promise<TreeState> => state;
const CLEAN: TreeState = { commitSha: "deadbeefcafe", clean: true };

const SIGNER: SignerInputs = { flag: "sandbox:opus@run-1" };

/** The same self-contained leaf as prove-it-gate.test.ts: AUTHOR_TEST writes the
 *  test path, IMPLEMENT writes the source path; the end_turn prose lies ("all
 *  pass") to prove the model never drives the verdict. */
function phaseAwareModel(): ScriptedModel {
  let writeTurnPending = true;
  let step = 0;
  return new ScriptedModel((): ModelResponse => {
    if (writeTurnPending) {
      writeTurnPending = false;
      const path = step === 0 ? TEST_PATH : SOURCE_PATH;
      return {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: `w${step}`, name: "write", input: { path } }],
      };
    }
    writeTurnPending = true;
    step += 1;
    return {
      stopReason: "end_turn",
      content: [{ type: "text", text: "done — all tests pass, promote me to healthy" }],
    };
  });
}

function freshSpec(args: {
  observations: TestObservation[];
  onPhase: (phase: Phase) => void;
}): { spec: ProveSpec; store: InMemoryStore } {
  const store = new InMemoryStore();
  const spec: ProveSpec = {
    unitId: "unit-1",
    proofMode: "contract",
    testId: "T",
    author: new OwnedLoopAuthor({
      model: phaseAwareModel(),
      tools: leafTools(),
      scope: scope(),
      writeTools,
    }),
    testExecutor: new RecordingTestExecutor(args.observations),
    store,
    signerInputs: SIGNER,
    treeState: fixedTree(CLEAN),
    now: () => FIXED_NOW,
    prompts: { authorTest: "author the test", implement: "implement it" },
    runId: "run-1",
    onPhase: args.onPhase,
  };
  return { spec, store };
}

// ── (1) FULL PASS: the observer sees every phase, in order ───────────────────

test("onPhase fires at each phase the spine enters, in order, on a full pass", async () => {
  const seen: Phase[] = [];
  const { spec } = freshSpec({
    observations: [RED, GREEN],
    onPhase: (phase) => {
      seen.push(phase);
    },
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, true);
  // The observer's sequence matches the spine's own phasesVisited EXACTLY — the
  // wisp colours from the same walk the verdict is signed off.
  assert.deepEqual(seen, [
    "AUTHOR_TEST",
    "CONFIRM_RED",
    "IMPLEMENT",
    "CONFIRM_GREEN",
    "GATE",
  ]);
  if (result.ok) assert.deepEqual(seen, result.phasesVisited);
});

// ── (2) FORGED GREEN AT CONFIRM_RED: the observer stops where the walk stops ──

test("onPhase stops at CONFIRM_RED on a forged early green — no later phase fires", async () => {
  const seen: Phase[] = [];
  const { spec } = freshSpec({
    observations: [GREEN, GREEN], // a green at CONFIRM_RED is the forged-early-pass attack
    onPhase: (phase) => {
      seen.push(phase);
    },
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failedAt, "CONFIRM_RED");
  // The wisp never shows a green/IMPLEMENT phase the spine never reached — the
  // observer is fired ONLY after the spine commits to a phase, so the colour
  // signal is as honest as the verdict.
  assert.deepEqual(seen, ["AUTHOR_TEST", "CONFIRM_RED"]);
  assert.equal(seen.includes("IMPLEMENT"), false);
  assert.equal(seen.includes("CONFIRM_GREEN"), false);
  assert.equal(seen.includes("GATE"), false);
});

// ── (3) AN ASYNC OBSERVER IS AWAITED (the CLI write is async) ────────────────

test("onPhase may be async and is awaited before the next phase proceeds", async () => {
  const order: string[] = [];
  const { spec } = freshSpec({
    observations: [RED, GREEN],
    onPhase: (phase) => {
      // a microtask-deferred observer (the real one appends a work_event) must be
      // awaited — the spine never races ahead of an in-flight phase write.
      return Promise.resolve().then(() => {
        order.push(`phase:${phase}`);
      });
    },
  });

  const result = await proveUnit(spec);
  assert.equal(result.ok, true);
  assert.deepEqual(order, [
    "phase:AUTHOR_TEST",
    "phase:CONFIRM_RED",
    "phase:IMPLEMENT",
    "phase:CONFIRM_GREEN",
    "phase:GATE",
  ]);
});
