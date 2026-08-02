import test from "node:test";
import assert from "node:assert/strict";
import type { Attestation, TestAttestations } from "@storytree/proof-protocol";
import { deriveAttestations } from "./attestations.js";

/**
 * Offline unit tests for the `deriveAttestations` projection (ADR-0044 d.2/d.3): the conservative
 * latest-per-(testId, witness) reducer. The `Attestation` DATA shape is validated in the verdict
 * contract's `shapes.test.ts`; here we cover the derivation compute and the no-roll-up rule.
 */

function att(over: Partial<Attestation> = {}): Attestation {
  const criterionId = over.criterionId ?? "uatc_000000000000000000000001";
  return {
    testId: over.testId ?? criterionId,
    criterionId,
    revisionId: "uatr1:0000000000000001",
    outcome: "pass",
    witness: "human",
    signer: "owner@example.com",
    at: "2026-06-14T00:00:00.000Z",
    ...over,
  };
}

// ── deriveAttestations: latest per (testId, witness) ─────────────────────────

test("deriveAttestations: latest signal per (testId, witness) wins by seq", () => {
  const events = [
    { seq: 1, doc: att({ outcome: "fail", at: "t1" }) },
    { seq: 2, doc: att({ outcome: "pass", at: "t2" }) }, // later human → wins
    { seq: 3, doc: att({ witness: "machine", signer: "runner", at: "t3" }) },
  ];
  const map = deriveAttestations(events);
  const t1 = map.get("uatc_000000000000000000000001");
  assert.equal(t1?.human?.outcome, "pass", "later human pass wins over the earlier fail");
  assert.equal(t1?.machine?.signer, "runner", "machine signal recorded alongside the human one");
});

test("deriveAttestations: order-independent (same result fed out of seq order)", () => {
  const inOrder = deriveAttestations([
    { seq: 1, doc: att({ outcome: "fail" }) },
    { seq: 2, doc: att({ outcome: "pass" }) },
  ]);
  const outOfOrder = deriveAttestations([
    { seq: 2, doc: att({ outcome: "pass" }) },
    { seq: 1, doc: att({ outcome: "fail" }) },
  ]);
  assert.equal(inOrder.get("uatc_000000000000000000000001")?.human?.outcome, "pass");
  assert.equal(outOfOrder.get("uatc_000000000000000000000001")?.human?.outcome, "pass");
});

test("deriveAttestations: a malformed signal grants nothing (conservative parsing)", () => {
  const map = deriveAttestations([
    { seq: 1, doc: { testId: "demo-story#uat-1", outcome: "pass" } }, // missing witness/signer/at
    { seq: 2, doc: "not even an object" },
    {
      seq: 3,
      doc: att({
        testId: "uatc_000000000000000000000002",
        criterionId: "uatc_000000000000000000000002",
      }),
    },
  ]);
  assert.equal(map.has("demo-story#uat-1"), false, "the malformed doc granted nothing");
  assert.equal(
    map.get("uatc_000000000000000000000002")?.human?.outcome,
    "pass",
    "the well-formed one stands",
  );
});

// ── no-story-rollup ──────────────────────────────────────────────────────────

test("no-story-rollup: every test of a story attested → keys are ONLY per-test ids, no story key", () => {
  const story = "demo-story";
  const tests = [1, 2, 3, 4, 5].map(
    (n) => `uatc_${n.toString(16).padStart(24, "0")}`,
  );
  const events = tests.map((criterionId, i) => ({
    seq: i + 1,
    doc: att({ testId: criterionId, criterionId }),
  }));
  const map = deriveAttestations(events);

  assert.equal(map.size, 5, "one entry per test");
  assert.equal(map.has(story), false, "no story-level key is ever derived");
  for (const key of map.keys()) {
    assert.ok(key.startsWith("uatc_"), `key ${key} is a criterion id, never the bare story`);
  }
  // Nothing here produces a story outcome/hue: the map carries no aggregate field.
  const values: TestAttestations[] = [...map.values()];
  assert.ok(values.every((v) => v.human !== undefined), "each test has its own per-test signal");
});
