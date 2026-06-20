import { test } from "node:test";
import assert from "node:assert/strict";

import { MapToolExecutor, ScriptedModel } from "@storytree/agent";
import type { ModelResponse } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { Verdict } from "@storytree/proof-protocol";
import type { SignerInputs } from "./proof/signer.js";

import { PathWriteScope, RecordingTestExecutor } from "./phase-machine.js";
import type { TestObservation } from "./phase-machine.js";
import type { WriteToolSpec } from "./write-scoped-executor.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { proveUnit, gitTreeState } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";

// ── Offline fixtures ────────────────────────────────────────────────────────

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

/** The leaf tools: a `write` that always succeeds and a `read`. */
const leafTools = () =>
  new MapToolExecutor({ write: () => "wrote", read: () => "contents" });

const fixedTree = (state: TreeState) => async (): Promise<TreeState> => state;
const CLEAN: TreeState = { commitSha: "deadbeefcafe", clean: true };
const DIRTY: TreeState = { commitSha: "deadbeefcafe", clean: false };

const SIGNER: SignerInputs = { flag: "sandbox:opus@run-1" };

/**
 * A self-contained leaf model whose write target depends on which authoring step it is in. Each
 * authoring step (AUTHOR_TEST, then IMPLEMENT) is a `runStep` that loops the model: response 0 is a
 * `write` tool_use, response 1 is an `end_turn`. The FIRST step writes the TEST path (in scope for
 * AUTHOR_TEST); the SECOND writes the SOURCE path (in scope for IMPLEMENT). The end_turn prose
 * deliberately claims "all tests pass" — proving the model's content never drives the verdict.
 */
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
  tree: TreeState;
  signerInputs: SignerInputs;
}): { spec: ProveSpec; executor: RecordingTestExecutor; store: InMemoryStore } {
  const store = new InMemoryStore();
  const executor = new RecordingTestExecutor(args.observations);
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
    testExecutor: executor,
    store,
    signerInputs: args.signerInputs,
    treeState: fixedTree(args.tree),
    now: () => FIXED_NOW,
    prompts: { authorTest: "author the test", implement: "implement it" },
    runId: "run-1",
  };
  return { spec, executor, store };
}

async function signingRows(store: InMemoryStore): Promise<number> {
  const events = await store.readEvents();
  return events.filter((e) => e.kind === "signing").length;
}

// ── (a) HAPPY PATH ──────────────────────────────────────────────────────────

test("(a) happy path: red then green, clean tree, signer present => pass + exactly one signing row", async () => {
  const { spec, executor, store } = freshSpec({
    observations: [RED, GREEN],
    tree: CLEAN,
    signerInputs: SIGNER,
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.verdict.outcome, "pass");
  assert.equal(result.verdict.unitId, "unit-1");
  assert.equal(result.verdict.commitSha, CLEAN.commitSha);
  assert.equal(result.verdict.signer, "sandbox:opus@run-1");
  assert.equal(result.verdict.at, FIXED_NOW, "timestamp comes only from injected now()");
  assert.deepEqual(result.phasesVisited, [
    "AUTHOR_TEST",
    "CONFIRM_RED",
    "IMPLEMENT",
    "CONFIRM_GREEN",
    "GATE",
  ]);

  // The verdict's evidence is the spine's OWN observations, not a model claim.
  assert.equal(result.verdict.evidence.length, 2);
  assert.deepEqual(
    result.verdict.evidence.map((e) => e.kind),
    ["observation:red", "observation:green"],
  );

  // Exactly ONE signing row, and it is the signed promotion event.
  assert.equal(await signingRows(store), 1);

  // The spine OBSERVED red/green itself — it asked the executor to run the testId TWICE; the model's
  // "all tests pass" prose never determined the verdict.
  assert.deepEqual(executor.observed, ["T", "T"]);
});

// ── (b) FORGED GREEN AT CONFIRM_RED ──────────────────────────────────────────

test("(b) forged green at CONFIRM_RED: green first => abort at CONFIRM_RED, no signing row", async () => {
  const { spec, executor, store } = freshSpec({
    observations: [GREEN, GREEN],
    tree: CLEAN,
    signerInputs: SIGNER,
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "CONFIRM_RED");
  assert.match(result.reason, /requires an observed red/);
  assert.deepEqual(result.phasesVisited, ["AUTHOR_TEST", "CONFIRM_RED"]);

  // The forged green stopped the walk BEFORE IMPLEMENT — only one observation was taken.
  assert.deepEqual(executor.observed, ["T"]);
  assert.equal(await signingRows(store), 0, "no signing row on a forged green");
});

// ── (c) DIRTY TREE AT GATE ───────────────────────────────────────────────────

test("(c) dirty tree at GATE: red then green but tree not clean => refuse at GATE, no row", async () => {
  const { spec, store } = freshSpec({
    observations: [RED, GREEN],
    tree: DIRTY,
    signerInputs: SIGNER,
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "GATE");
  assert.match(result.reason, /not clean/);
  assert.deepEqual(result.phasesVisited, [
    "AUTHOR_TEST",
    "CONFIRM_RED",
    "IMPLEMENT",
    "CONFIRM_GREEN",
    "GATE",
  ]);
  assert.equal(await signingRows(store), 0, "a dirty tree never signs");
});

// ── (d) NO SIGNER ────────────────────────────────────────────────────────────

test("(d) no signer: red then green, clean, but signerInputs all empty => refuse at GATE, no row", async () => {
  const { spec, store } = freshSpec({
    observations: [RED, GREEN],
    tree: CLEAN,
    signerInputs: { flag: "", env: "", gitEmail: "  " },
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "GATE");
  assert.match(result.reason, /no signer resolved/);
  assert.equal(await signingRows(store), 0, "no signer => no attestation => no row");
});

// ── (e) GREEN FAILS AT CONFIRM_GREEN ─────────────────────────────────────────

test("(e) green-fails-at-CONFIRM_GREEN: red then red => abort at CONFIRM_GREEN, no row", async () => {
  const { spec, executor, store } = freshSpec({
    observations: [RED, RED],
    tree: CLEAN,
    signerInputs: SIGNER,
  });

  const result = await proveUnit(spec);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failedAt, "CONFIRM_GREEN");
  assert.match(result.reason, /requires an observed green/);
  assert.deepEqual(result.phasesVisited, [
    "AUTHOR_TEST",
    "CONFIRM_RED",
    "IMPLEMENT",
    "CONFIRM_GREEN",
  ]);
  assert.deepEqual(executor.observed, ["T", "T"]);
  assert.equal(await signingRows(store), 0, "an unproven implementation never signs");
});

// ── gitTreeState typechecks + is constructible (NOT exercised against a live tree here) ──────────

test("gitTreeState returns a callable treeState seam (constructible; not run against a live tree)", () => {
  const seam = gitTreeState();
  assert.equal(typeof seam, "function");
  const seamCwd = gitTreeState("C:/some/where");
  assert.equal(typeof seamCwd, "function");
});
