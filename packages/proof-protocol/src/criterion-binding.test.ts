import test from "node:test";
import assert from "node:assert/strict";

import {
  Attestation,
  CriterionBinding,
  CriterionVerdict,
  StoredAttestation,
  Verdict,
} from "./index.js";

const PAIR = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:0123456789abcdef",
};

const VERDICT = {
  unitId: PAIR.criterionId,
  proofMode: "operator-attested" as const,
  outcome: "pass" as const,
  commitSha: "abc123",
  signer: "owner@example.com",
  runId: "run-1",
  evidence: [],
  at: "2026-08-02T00:00:00.000Z",
};

test("criterion proof bindings require the exact opaque identity and content revision", () => {
  assert.deepEqual(CriterionBinding.parse(PAIR), PAIR);
  assert.equal(
    CriterionBinding.safeParse({ ...PAIR, criterionId: "demo#uat-1" }).success,
    false,
  );
  assert.equal(
    CriterionBinding.safeParse({ ...PAIR, revisionId: "latest" }).success,
    false,
  );
});

test("criterion verdicts bind the exact pair and unitId cannot name another criterion", () => {
  assert.equal(CriterionVerdict.safeParse({ ...VERDICT, ...PAIR }).success, true);
  assert.equal(CriterionVerdict.safeParse(VERDICT).success, false);
  assert.equal(
    CriterionVerdict.safeParse({ ...VERDICT, ...PAIR, unitId: "uatc_aaaaaaaaaaaaaaaaaaaaaaaa" })
      .success,
    false,
  );
});

test("generic verdict history remains readable but half-bound criterion proof is malformed", () => {
  assert.equal(Verdict.safeParse(VERDICT).success, true, "legacy/non-criterion verdict remains readable");
  assert.equal(Verdict.safeParse({ ...VERDICT, criterionId: PAIR.criterionId }).success, false);
  assert.equal(Verdict.safeParse({ ...VERDICT, revisionId: PAIR.revisionId }).success, false);
});

test("new attestations require the exact pair while stored legacy attestations remain readable", () => {
  const base = {
    testId: PAIR.criterionId,
    outcome: "pass" as const,
    witness: "human" as const,
    signer: "owner@example.com",
    at: "2026-08-02T00:00:00.000Z",
  };
  assert.equal(Attestation.safeParse({ ...base, ...PAIR }).success, true);
  assert.equal(Attestation.safeParse(base).success, false);
  assert.equal(StoredAttestation.safeParse(base).success, true, "legacy evidence is preserved");
});
