import test from "node:test";
import assert from "node:assert/strict";

import { ScriptedJudge, assertReadOnlyJudgePort, type JudgeContext } from "./judge-seam.js";
import { C1, C2, R1, R2 } from "./test-bindings.js";

const baseCtx = (criterionId: string): JudgeContext => ({
  criterionId,
  revisionId: "uatr1:0000000000000001",
  title: "one-liner",
  detailBody: "do the thing",
  detailHash: "abc",
  requiredTier: "advanced",
  judgeId: "claude-opus-4-8",
});

test("judge-seam-returns-structured-result-only: ScriptedJudge returns parsed PASS/FAIL/INCONCLUSIVE", () => {
  const judge = new ScriptedJudge({
    [C1]: {
      criterionId: C1,
      revisionId: R1,
      outcome: "PASS",
      evidenceRefs: ["asset:ev"],
      rationale: "ok",
    },
  });
  const result = judge.judge(baseCtx(C1));
  assert.equal(result.outcome, "PASS");
  assert.equal(result.criterionId, C1);
  assert.ok(!("signature" in result));
});

test("judge-seam-has-no-write-surface: JudgePort / ScriptedJudge expose no write methods", () => {
  const judge = new ScriptedJudge({});
  assertReadOnlyJudgePort(judge);
  assert.ok(!("write" in judge), "no write method");
  assert.ok(!("edit" in judge), "no edit method");
  assert.ok(!("delete" in judge), "no delete method");
  assert.ok(!("runTool" in judge), "no runTool method");
});

test("judge-seam-fresh-context-per-call: sequential calls do not leak prior scratch", () => {
  const judge = new ScriptedJudge({
    [C1]: {
      criterionId: C1,
      revisionId: R1,
      outcome: "PASS",
      evidenceRefs: ["asset:a"],
      rationale: "first",
    },
    [C2]: {
      criterionId: C2,
      revisionId: R2,
      outcome: "FAIL",
      evidenceRefs: ["asset:b"],
      rationale: "second",
    },
  });
  const first = judge.judge(baseCtx(C1));
  const second = judge.judge({
    ...baseCtx(C2),
    revisionId: R2,
    title: "other",
    detailHash: "zzz",
  });
  assert.equal(first.outcome, "PASS");
  assert.equal(first.rationale, "first");
  assert.equal(second.outcome, "FAIL");
  assert.equal(second.rationale, "second");
  assert.notEqual(first.criterionId, second.criterionId);
});
