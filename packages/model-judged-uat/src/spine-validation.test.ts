import test from "node:test";
import assert from "node:assert/strict";

import { Criterion, SEED_MODEL_REGISTRY, resolveJudge } from "@storytree/model-uat";

import { validateModelJudgeResult } from "./spine-validation.js";

const modelCriterion = Criterion.parse({
  id: "demo#uat-1",
  title: "one-liner",
  witness: "model",
  tier: "advanced",
});

const passResult = {
  criterionId: "demo#uat-1",
  outcome: "PASS" as const,
  evidenceRefs: ["asset:ev"],
  rationale: "matches success",
};

const eligible = resolveJudge("advanced", SEED_MODEL_REGISTRY);
assert.equal(eligible.status, "eligible");
const judgeId = eligible.status === "eligible" ? eligible.judge.id : "";

test("spine-admits-eligible-fresh-pass: happy path yields signable payload", () => {
  const out = validateModelJudgeResult({
    result: passResult,
    criterion: modelCriterion,
    eligibility: eligible,
    namedJudgeId: judgeId,
    detailArtifactId: "detail-1",
    detailHash: "deadbeefcafebabe0123456789abcdef",
    hashFreshness: "fresh",
  });
  assert.equal(out.status, "admitted");
  if (out.status !== "admitted") return;
  assert.equal(out.payload.signableForSpine, true);
  assert.equal(out.payload.judgeId, judgeId);
  assert.equal(out.payload.requiredTier, "advanced");
  assert.equal(out.payload.detailHash, "deadbeefcafebabe0123456789abcdef");
  assert.equal(out.payload.outcome, "PASS");
  assert.ok(!("signature" in out.payload));
  assert.ok(!("signedBy" in out.payload));
});

test("spine-refuses-ineligible-or-stale: each dishonest input refuses", () => {
  const base = {
    result: passResult,
    criterion: modelCriterion,
    eligibility: eligible,
    namedJudgeId: judgeId,
    detailArtifactId: "detail-1",
    detailHash: "deadbeefcafebabe0123456789abcdef",
    hashFreshness: "fresh" as const,
  };

  const reasonOf = (input: Parameters<typeof validateModelJudgeResult>[0]) => {
    const out = validateModelJudgeResult(input);
    assert.equal(out.status, "refused");
    return out.status === "refused" ? out.reason : "admitted";
  };

  assert.equal(reasonOf({ ...base, result: { ...passResult, outcome: "MAYBE" } }), "bad-shape");
  assert.equal(
    reasonOf({
      ...base,
      criterion: Criterion.parse({ id: "demo#uat-1", title: "t", witness: "machine" }),
    }),
    "non-model-witness",
  );
  assert.equal(
    reasonOf({
      ...base,
      eligibility: { status: "hold", reason: "no judge" },
    }),
    "ineligible-judge",
  );
  assert.equal(reasonOf({ ...base, namedJudgeId: "self-declared-gpt" }), "ineligible-judge");
  assert.equal(reasonOf({ ...base, hashFreshness: "stale" }), "stale-or-missing-hash");
  assert.equal(
    reasonOf({ ...base, detailHash: undefined, hashFreshness: "missing" }),
    "stale-or-missing-hash",
  );
  assert.equal(
    reasonOf({
      ...base,
      result: { ...passResult, criterionId: "other#uat-9" },
    }),
    "missing-evidence",
  );
});

test("spine-payload-is-not-a-model-signature: admission is signable-for-spine only", () => {
  const out = validateModelJudgeResult({
    result: passResult,
    criterion: modelCriterion,
    eligibility: eligible,
    namedJudgeId: judgeId,
    detailArtifactId: "detail-1",
    detailHash: "deadbeefcafebabe0123456789abcdef",
    hashFreshness: "fresh",
  });
  assert.equal(out.status, "admitted");
  if (out.status !== "admitted") return;
  assert.equal(out.payload.signableForSpine, true);
  assert.equal(
    Object.keys(out.payload).includes("signature") ||
      Object.keys(out.payload).includes("signedBy") ||
      Object.keys(out.payload).includes("verdictSeal"),
    false,
  );
});
