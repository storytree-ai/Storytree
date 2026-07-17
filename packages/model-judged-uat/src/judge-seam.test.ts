import test from "node:test";
import assert from "node:assert/strict";

import { ScriptedJudge, assertReadOnlyJudgePort, type JudgeContext } from "./judge-seam.js";

const baseCtx = (criterionId: string): JudgeContext => ({
  criterionId,
  title: "one-liner",
  detailBody: "do the thing",
  detailHash: "abc",
  requiredTier: "advanced",
  judgeId: "claude-opus-4-8",
});

test("judge-seam-returns-structured-result-only: ScriptedJudge returns parsed PASS/FAIL/INCONCLUSIVE", () => {
  const judge = new ScriptedJudge({
    "demo#uat-1": {
      criterionId: "demo#uat-1",
      outcome: "PASS",
      evidenceRefs: ["asset:ev"],
      rationale: "ok",
    },
  });
  const result = judge.judge(baseCtx("demo#uat-1"));
  assert.equal(result.outcome, "PASS");
  assert.equal(result.criterionId, "demo#uat-1");
  assert.ok(!("signature" in result));
});

test("judge-seam-has-no-write-surface: JudgePort / ScriptedJudge expose no write methods", () => {
  const judge = new ScriptedJudge({});
  assertReadOnlyJudgePort(judge);
  assert.equal(typeof (judge as unknown as { write?: unknown }).write, "undefined");
  assert.equal(typeof (judge as unknown as { edit?: unknown }).edit, "undefined");
  assert.equal(typeof (judge as unknown as { delete?: unknown }).delete, "undefined");
  assert.equal(typeof (judge as unknown as { runTool?: unknown }).runTool, "undefined");
});

test("judge-seam-fresh-context-per-call: sequential calls do not leak prior scratch", () => {
  const judge = new ScriptedJudge({
    "demo#uat-1": {
      criterionId: "demo#uat-1",
      outcome: "PASS",
      evidenceRefs: ["asset:a"],
      rationale: "first",
    },
    "demo#uat-2": {
      criterionId: "demo#uat-2",
      outcome: "FAIL",
      evidenceRefs: ["asset:b"],
      rationale: "second",
    },
  });
  const first = judge.judge(baseCtx("demo#uat-1"));
  const second = judge.judge({
    ...baseCtx("demo#uat-2"),
    title: "other",
    detailHash: "zzz",
  });
  assert.equal(first.outcome, "PASS");
  assert.equal(first.rationale, "first");
  assert.equal(second.outcome, "FAIL");
  assert.equal(second.rationale, "second");
  assert.notEqual(first.criterionId, second.criterionId);
});
