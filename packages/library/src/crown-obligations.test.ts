import test from "node:test";
import assert from "node:assert/strict";

import {
  crownObligations,
  crownUatCriteria,
  isSignableUatCriterion,
  unsignableUatCriteria,
} from "./crown-obligations.js";
import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion } from "./uat-test-criteria.js";

/**
 * WHICH own-proof obligations gate the crown (ADR-0443 D2): the union minus would-be legs, minus
 * gates retired in place, minus legs that can never be signed as authored.
 */

let n = 0;
function leg(over: Partial<UatTestCriterion> = {}): UatTestCriterion {
  n += 1;
  return {
    criterionId: `uatc_${String(n).padStart(24, "0")}`,
    revisionId: `uatr1:${String(n).padStart(16, "0")}`,
    title: `leg ${n}`,
    witness: "machine",
    wouldBe: false,
    ...over,
  };
}

function gate(over: Partial<ReliabilityGate> = {}): ReliabilityGate {
  return {
    id: "s#gate-1",
    title: "the suite",
    kind: "observe",
    proofCommand: "pnpm -r test",
    covers: [],
    retired: false,
    ...over,
  };
}

// ── The unsignable shape ADR-0443 D2 removes from the crown ─────────────────────────────────────

test("a machine leg naming NO proof gate is unsignable — no adopt pass can ever sign it", () => {
  // `proof-binding-integrity`'s surviving leg, verbatim in shape: deliberately unbound, and its own
  // prose says none may be minted for it until the runtime lands. Holding a crown grey on that is a
  // permanent block, not an incentive.
  assert.equal(isSignableUatCriterion(leg({ witness: "machine" }), []), false);
});

test("a machine leg bound to a command-bearing observe gate IS signable", () => {
  const g = gate({ id: "s#gate-1" });
  assert.equal(isSignableUatCriterion(leg({ witness: "machine", proofGateId: "s#gate-1" }), [g]), true);
});

test("a HUMAN leg is signable — an operator attestation proves it", () => {
  assert.equal(isSignableUatCriterion(leg({ witness: "human" }), []), true);
});

test("an `either` leg is signable — it resolves to human (ADR-0106's fail-closed rule)", () => {
  assert.equal(isSignableUatCriterion(leg({ witness: "either" }), []), true);
});

// ── The three refusals D2 deliberately does NOT cover: a BROKEN binding is not an unsignable one ──

test("a machine leg bound to an UNKNOWN gate stays an obligation — broken, not unsignable", () => {
  // ADR-0443's Consequences draw exactly this line for the mirror-image case: "a gate pointing at a
  // deleted step is not an unsignable obligation, it is a broken one." A broken binding must keep
  // holding the crown, which is what makes someone repair it.
  assert.equal(isSignableUatCriterion(leg({ witness: "machine", proofGateId: "s#gate-9" }), [gate()]), true);
});

test("a machine leg bound to a NON-observe gate stays an obligation", () => {
  const g = gate({ id: "s#gate-1", kind: "build-tests" });
  assert.equal(isSignableUatCriterion(leg({ witness: "machine", proofGateId: "s#gate-1" }), [g]), true);
});

test("a machine leg bound to a COMMANDLESS observe gate stays an obligation", () => {
  const { proofCommand: _dropped, ...commandless } = gate({ id: "s#gate-1" });
  assert.equal(
    isSignableUatCriterion(leg({ witness: "machine", proofGateId: "s#gate-1" }), [commandless]),
    true,
  );
});

test("a leg bound to a gate RETIRED IN PLACE is broken, not unsignable — signability reads the FULL parse", () => {
  // Resolved against the story's own declared gates, retired ones included: a leg pointing at a
  // withdrawn gate is a mismatch to repair, and silently absorbing it would hide the mismatch.
  const retired = gate({ id: "s#gate-1", retired: true });
  const bound = leg({ witness: "machine", proofGateId: "s#gate-1" });
  assert.equal(isSignableUatCriterion(bound, [retired]), true);
  assert.deepEqual(crownUatCriteria([bound], [retired]), [bound]);
});

// ── The composed obligation set ─────────────────────────────────────────────────────────────────

test("crownObligations drops would-be legs, unsignable legs, and retired gates — and keeps the rest", () => {
  const signable = leg({ witness: "machine", proofGateId: "s#gate-1" });
  const unsignable = leg({ witness: "machine" });
  const aspirational = leg({ witness: "human", wouldBe: true });
  const live = gate({ id: "s#gate-1" });
  const withdrawn = gate({ id: "s#gate-2", retired: true });

  const obligations = crownObligations([signable, unsignable, aspirational], [live, withdrawn]);
  assert.deepEqual(
    obligations.map((o) => ("criterionId" in o ? o.criterionId : o.id)),
    [signable.criterionId, "s#gate-1"],
  );
});

test("unsignableUatCriteria reports what was dropped, so a surface can SAY SO", () => {
  // ADR-0416 D2's "silence is not acceptable" applies to a dropped obligation as much as an added
  // one: a green crown that quietly stopped counting three steps is not an honest green.
  const unsignable = leg({ witness: "machine" });
  const aspirational = leg({ witness: "human", wouldBe: true });
  const dropped = unsignableUatCriteria([unsignable, aspirational, leg({ witness: "human" })], []);
  assert.deepEqual(dropped.map((c) => c.criterionId), [unsignable.criterionId]);
});

test("a story whose EVERY leg is unsignable yields an empty obligation set, not a partial one", () => {
  // This is the state ADR-0443 D2 unblocks. The crown then rests on the capability clause and D3's
  // vacuity floor — it does not abstain, which is what kept 9 stories grey permanently.
  assert.deepEqual(crownObligations([leg({ witness: "machine" }), leg({ witness: "machine" })], []), []);
});
