/**
 * Story UAT for `model-judged-uat` — integrated acceptance against the public
 * `@storytree/model-judged-uat` ROOT barrel (six machine legs, ADR-0209 D3/D4).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  Criterion,
  SEED_MODEL_REGISTRY,
  resolveJudge,
} from "@storytree/model-uat";
import {
  computeDetailHash,
  classifyDetailAnchor,
} from "@storytree/uat-criterion";

import {
  JudgeOutcome,
  JudgeResult,
  parseJudgeResult,
  ScriptedJudge,
  assertReadOnlyJudgePort,
  validateModelJudgeResult,
  classifyEscalation,
} from "@storytree/model-judged-uat";

const detail = {
  action: "Inspect the delivered surface.",
  successConditions: "Observable success matches the one-liner intent.",
  evidenceExpectations: "Cite the observed evidence refs.",
  refs: ["asset:human-witness-is-a-judgment-gap-not-cost"],
};

test("uat-1: The judge-result shape validates through the public port", () => {
  assert.equal(JudgeOutcome.parse("PASS"), "PASS");
  assert.equal(JudgeOutcome.parse("FAIL"), "FAIL");
  assert.equal(JudgeOutcome.parse("INCONCLUSIVE"), "INCONCLUSIVE");
  for (const outcome of ["PASS", "FAIL", "INCONCLUSIVE"] as const) {
    const parsed = parseJudgeResult({
      criterionId: "model-judged-uat#uat-1",
      outcome,
      evidenceRefs: ["asset:ev"],
      rationale: "public barrel round-trip",
    });
    assert.equal(JudgeResult.parse(parsed).outcome, outcome);
  }
  assert.throws(() =>
    parseJudgeResult({
      criterionId: "x",
      outcome: "PASS",
      evidenceRefs: ["e"],
      rationale: "r",
      signature: "forged",
    }),
  );
});

test("uat-2: The judge seam is independent, fresh, and read-only", () => {
  const judge = new ScriptedJudge({
    "model-judged-uat#uat-2": {
      criterionId: "model-judged-uat#uat-2",
      outcome: "PASS",
      evidenceRefs: ["asset:ev"],
      rationale: "scripted",
    },
  });
  assertReadOnlyJudgePort(judge);
  const result = judge.judge({
    criterionId: "model-judged-uat#uat-2",
    title: "one-liner",
    detailBody: detail.action,
    detailHash: computeDetailHash(detail),
    requiredTier: "advanced",
    judgeId: "claude-opus-4-8",
  });
  assert.equal(result.outcome, "PASS");
  assert.equal(typeof (judge as unknown as { write?: unknown }).write, "undefined");
});

test("uat-3: The spine admits only eligible, hash-fresh, well-shaped results", () => {
  const criterion = Criterion.parse({
    id: "model-judged-uat#uat-3",
    title: "one-liner",
    witness: "model",
    tier: "advanced",
  });
  const eligibility = resolveJudge("advanced", SEED_MODEL_REGISTRY);
  assert.equal(eligibility.status, "eligible");
  if (eligibility.status !== "eligible") return;
  const hash = computeDetailHash(detail);
  assert.equal(classifyDetailAnchor(hash, detail), "fresh");

  const admitted = validateModelJudgeResult({
    result: {
      criterionId: "model-judged-uat#uat-3",
      outcome: "PASS",
      evidenceRefs: ["asset:ev"],
      rationale: "ok",
    },
    criterion,
    eligibility,
    namedJudgeId: eligibility.judge.id,
    detailArtifactId: "detail-uat-3",
    detailHash: hash,
    hashFreshness: "fresh",
  });
  assert.equal(admitted.status, "admitted");

  const stale = validateModelJudgeResult({
    result: {
      criterionId: "model-judged-uat#uat-3",
      outcome: "PASS",
      evidenceRefs: ["asset:ev"],
      rationale: "ok",
    },
    criterion,
    eligibility,
    namedJudgeId: eligibility.judge.id,
    detailArtifactId: "detail-uat-3",
    detailHash: hash,
    hashFreshness: "stale",
  });
  assert.equal(stale.status, "refused");
  if (stale.status === "refused") assert.equal(stale.reason, "stale-or-missing-hash");
});

test("uat-4: Escalation follows the locked ladder", () => {
  assert.deepEqual(
    classifyEscalation({ outcome: "PASS", requiredTier: "advanced", frontierAvailable: true }),
    { status: "ok", action: "sign" },
  );
  assert.deepEqual(
    classifyEscalation({ outcome: "FAIL", requiredTier: "advanced", frontierAvailable: true }),
    { status: "ok", action: "build" },
  );
  assert.deepEqual(
    classifyEscalation({
      outcome: "INCONCLUSIVE",
      requiredTier: "advanced",
      frontierAvailable: true,
    }),
    { status: "ok", action: "escalate-frontier" },
  );
  assert.deepEqual(
    classifyEscalation({
      outcome: "INCONCLUSIVE",
      requiredTier: "frontier",
      frontierAvailable: true,
    }),
    { status: "ok", action: "escalate-human" },
  );
});

test("uat-5: A FAIL cannot be laundered into human green", () => {
  const normal = classifyEscalation({
    outcome: "FAIL",
    requiredTier: "frontier",
    frontierAvailable: true,
  });
  assert.equal(normal.status, "ok");
  if (normal.status === "ok") assert.equal(normal.action, "build");

  const launder = classifyEscalation({
    outcome: "FAIL",
    requiredTier: "frontier",
    frontierAvailable: true,
    attemptHumanOverride: true,
  });
  assert.equal(launder.status, "refused");
});

test("uat-6: Offline scripted end-to-end matches the public contract", () => {
  const criterion = Criterion.parse({
    id: "model-judged-uat#uat-6",
    title: "end-to-end",
    witness: "model",
    tier: "advanced",
  });
  const eligibility = resolveJudge("advanced", SEED_MODEL_REGISTRY);
  assert.equal(eligibility.status, "eligible");
  if (eligibility.status !== "eligible") return;
  const hash = computeDetailHash(detail);

  const judge = new ScriptedJudge({
    "model-judged-uat#uat-6": {
      criterionId: "model-judged-uat#uat-6",
      outcome: "INCONCLUSIVE",
      evidenceRefs: ["asset:ev"],
      rationale: "ambiguous at advanced",
    },
  });
  const result = judge.judge({
    criterionId: "model-judged-uat#uat-6",
    title: criterion.title,
    detailBody: detail.action,
    detailHash: hash,
    requiredTier: "advanced",
    judgeId: eligibility.judge.id,
  });

  const validated = validateModelJudgeResult({
    result,
    criterion,
    eligibility,
    namedJudgeId: eligibility.judge.id,
    detailArtifactId: "detail-uat-6",
    detailHash: hash,
    hashFreshness: classifyDetailAnchor(hash, detail),
  });
  assert.equal(validated.status, "admitted");

  const next = classifyEscalation({
    outcome: result.outcome,
    requiredTier: "advanced",
    frontierAvailable: true,
  });
  assert.deepEqual(next, { status: "ok", action: "escalate-frontier" });
});
