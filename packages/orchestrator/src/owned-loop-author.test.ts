import { test } from "node:test";
import assert from "node:assert/strict";

import { MapToolExecutor, ScriptedModel } from "@storytree/agent";
import type { ModelResponse } from "@storytree/agent";

import { PathWriteScope } from "./phase-machine.js";
import type { WriteToolSpec } from "./write-scoped-executor.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";

/**
 * `failed-step-fails-closed` (owned-loop-phase-author contract 3), characterized at the AUTHOR level.
 *
 * The existing gate suites only ever drive `OwnedLoopAuthor` on its HAPPY path (a scripted model that
 * writes, then ends the turn — `prove-it-gate.test.ts` / `.e2e.test.ts` / `resolve-prove-spec.test.ts`),
 * and the halt fall-through is asserted with `StepResult` doubles through `runSequence` — NEVER the
 * author's OWN fail-closed branch (`owned-loop-author.ts:59-62`). So the contract was genuinely untested
 * at the author level; this file closes that gap, which is what lets the `drive-machinery#gate-1` observe
 * gate honestly `(covers:)` `owned-loop-phase-author`.
 *
 * GREEN-ON-ARRIVAL characterization (ADR-0098 observe-characterization): the code is already correct and
 * testable as-is, so the test PINS the existing fail-closed pass-through rather than driving a red→green.
 */

const writeTools: WriteToolSpec = {
  write: (input) => (input as { path: string }).path,
};

const scope = () =>
  new PathWriteScope({
    testGlobs: ["**/*.test.ts"],
    sourceGlobs: ["packages/**/src/*.ts"],
  });

/** The leaf tools — never reached on these paths (the model fails before any tool call), but the wall needs them. */
const leafTools = () => new MapToolExecutor({ write: () => "wrote", read: () => "contents" });

const author = (model: ScriptedModel): OwnedLoopAuthor =>
  new OwnedLoopAuthor({ model, tools: leafTools(), scope: scope(), writeTools });

test("failed-step-fails-closed: an empty-terminal step surfaces as { ok:false } from author()", async () => {
  // A model whose single terminal turn carries NO text: `runStep` sees an empty `finalText` and returns
  // { ok:false, error:"NoTerminalResult" } — the canonical fail-closed step (step.ts §fail-closed).
  const emptyTerminal = new ScriptedModel(
    (): ModelResponse => ({ stopReason: "end_turn", content: [{ type: "text", text: "" }] }),
  );

  const result = await author(emptyTerminal).author("AUTHOR_TEST", "author the failing test");

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable: a fail-closed step must not report ok");
  // The author surfaces the step's error VERBATIM (it neither swallows nor renames it).
  assert.equal(result.error, "NoTerminalResult");
  // A GENUINE fail-closed error, NOT a leaf cost-guard exhaustion: the owned loop never sets `exhausted`
  // (its scripted turn-exhaustion IS a test bug, per the PhaseAuthor seam doc), so the gate aborts the
  // authoring phase rather than falling through to its own observation.
  assert.notEqual(result.exhausted, true);
});

test("failed-step-fails-closed: a model-error step (exhausted script) also surfaces as { ok:false }", async () => {
  // An exhausted ScriptedModel rejects on the first call → `runTurn` throws → `runStep` catches it →
  // { ok:false, error:"ModelError" }. Proves `author()` surfaces ANY failed step, not just the empty one.
  const modelError = new ScriptedModel([]); // no scripted responses: the first createMessage rejects

  const result = await author(modelError).author("IMPLEMENT", "implement it");

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable: a fail-closed step must not report ok");
  assert.equal(result.error, "ModelError");
});
