import { test } from "node:test";
import assert from "node:assert/strict";

import { AcceptedGuardRail, Verdict } from "./index.js";

// ADR-0573 D5 (recording ADR-0572 D3): a verdict names every test CONFIRM_RED accepted as a declared
// guard-rail. Additive and optional, as ADR-0127's coverage axis is, so every stored verdict round-trips.

const SIGNED = {
  unitId: "unit-1",
  proofMode: "contract",
  outcome: "pass",
  commitSha: "deadbeefcafe",
  signer: "tester@example.com",
  runId: "run-1",
  at: "2026-09-15T00:00:00.000Z",
};

test("a verdict signed without per-test observation round-trips with no acceptance record", () => {
  const parsed = Verdict.parse(SIGNED);
  assert.equal("acceptedGuardRails" in parsed, false);
});

test("a verdict keeps an empty acceptance record apart from an absent one, and enumerates what it accepted", () => {
  assert.deepEqual(Verdict.parse({ ...SIGNED, acceptedGuardRails: [] }).acceptedGuardRails, []);
  const accepted = [{ test: ["probe-cluster", "parse-port-accepts-a-valid-port: never throws"], contracts: ["parse-port-accepts-a-valid-port"] }];
  assert.deepEqual(Verdict.parse({ ...SIGNED, acceptedGuardRails: accepted }).acceptedGuardRails, accepted);
});

test("an acceptance that names no test, no contract, or an empty contract id is refused", () => {
  assert.equal(AcceptedGuardRail.safeParse({ test: [], contracts: ["c"] }).success, false);
  assert.equal(AcceptedGuardRail.safeParse({ test: ["t"], contracts: [] }).success, false);
  assert.equal(AcceptedGuardRail.safeParse({ test: ["t"], contracts: [""] }).success, false);
  assert.equal(AcceptedGuardRail.safeParse({ test: ["t"], contracts: ["c"], note: "extra" }).success, false);
  assert.equal(Verdict.safeParse({ ...SIGNED, acceptedGuardRails: [{ test: ["t"], contracts: [] }] }).success, false);
});
