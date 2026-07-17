import test from "node:test";
import assert from "node:assert/strict";

import { JudgeOutcome, JudgeResult, parseJudgeResult } from "./judge-result.js";

test("judge-result-three-outcomes-round-trip: PASS / FAIL / INCONCLUSIVE each validate", () => {
  for (const outcome of ["PASS", "FAIL", "INCONCLUSIVE"] as const) {
    const raw = {
      criterionId: "demo#uat-1",
      outcome,
      evidenceRefs: ["asset:some-evidence"],
      rationale: outcome === "INCONCLUSIVE" ? "Ambiguous rubric edge." : "Matches success conditions.",
    };
    const parsed = parseJudgeResult(raw);
    assert.equal(parsed.outcome, outcome);
    assert.equal(JudgeOutcome.parse(outcome), outcome);
    assert.deepEqual(JudgeResult.parse(raw), parsed);
  }
});

test("judge-result-refuses-malformed: missing fields, unknown outcome, empty evidence/rationale, unknown keys", () => {
  assert.throws(() => parseJudgeResult({ outcome: "PASS", evidenceRefs: ["e"], rationale: "r" }));
  assert.throws(() =>
    parseJudgeResult({
      criterionId: "demo#uat-1",
      outcome: "MAYBE",
      evidenceRefs: ["e"],
      rationale: "r",
    }),
  );
  assert.throws(() =>
    parseJudgeResult({
      criterionId: "demo#uat-1",
      outcome: "PASS",
      evidenceRefs: [],
      rationale: "r",
    }),
  );
  assert.throws(() =>
    parseJudgeResult({
      criterionId: "demo#uat-1",
      outcome: "PASS",
      evidenceRefs: ["e"],
      rationale: "",
    }),
  );
  assert.throws(() =>
    parseJudgeResult({
      criterionId: "demo#uat-1",
      outcome: "PASS",
      evidenceRefs: ["e"],
      rationale: "r",
      rogue: true,
    }),
  );
});

test("judge-result-refuses-self-signing: signature / signedBy / verdictSeal are refused", () => {
  const base = {
    criterionId: "demo#uat-1",
    outcome: "PASS" as const,
    evidenceRefs: ["e"],
    rationale: "ok",
  };
  for (const key of ["signature", "signedBy", "verdictSeal", "seal"] as const) {
    assert.throws(
      () => parseJudgeResult({ ...base, [key]: "forged" }),
      /self-signing/,
    );
  }
});
