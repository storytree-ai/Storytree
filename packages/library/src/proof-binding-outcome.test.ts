import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion } from "./uat-test-criteria.js";
import {
  proofBindingOutcome,
  type MachineWitnessResolution,
  type ProofBindingEvidence,
} from "./proof-binding-outcome.js";
import { resolveWitness } from "./witness-resolution.js";

function criterion(proofGateId?: string): UatTestCriterion {
  return {
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:0123456789abcdef",
    title: "machine criterion",
    witness: "machine",
    wouldBe: false,
    ...(proofGateId !== undefined ? { proofGateId } : {}),
  };
}

function gate(
  kind: ReliabilityGate["kind"],
  id = "story#gate-2",
  proofCommand?: string,
): ReliabilityGate {
  return {
    id,
    title: "gate",
    kind,
    covers: [],
    ...(proofCommand !== undefined ? { proofCommand } : {}),
  };
}

function machineResolution(leg: UatTestCriterion, gates: readonly ReliabilityGate[]): MachineWitnessResolution {
  const resolution = resolveWitness(leg, gates);
  assert.equal(resolution.witness, "machine");
  return resolution;
}

test("proof-binding outcome: evidence preserves the resolver's exact eligible gate and literal declared command", () => {
  const leg = criterion("story#gate-2");
  const outcome = proofBindingOutcome(
    leg,
    machineResolution(leg, [
      gate("observe", "story#gate-1", "pnpm test:unrelated"),
      gate("observe", "story#gate-2", "pnpm --filter @storytree/library test"),
    ]),
  );

  assert.deepEqual(outcome, {
    outcome: "evidence",
    criterionId: "uatc_0123456789abcdef01234567",
    gateId: "story#gate-2",
    gateKind: "observe",
    proofCommand: "pnpm --filter @storytree/library test",
    adoptionInvocation: ["storytree", "adopt", "gate", "story#gate-2", "--pg"],
  });
});

test("proof-binding outcome: every resolver refusal remains non-runnable with its stable class", () => {
  const cases: ReadonlyArray<{
    label: string;
    criterion: UatTestCriterion;
    gates: readonly ReliabilityGate[];
    reason: "missing-binding" | "unknown-gate" | "ineligible-gate" | "missing-command";
  }> = [
    { label: "missing binding", criterion: criterion(), gates: [gate("observe", "story#gate-1", "pnpm test")], reason: "missing-binding" },
    { label: "unknown gate", criterion: criterion("story#gate-9"), gates: [], reason: "unknown-gate" },
    { label: "non-observe gate", criterion: criterion("story#gate-2"), gates: [gate("build-tests")], reason: "ineligible-gate" },
    { label: "commandless observe gate", criterion: criterion("story#gate-2"), gates: [gate("observe")], reason: "missing-command" },
  ];

  for (const current of cases) {
    const outcome = proofBindingOutcome(
      current.criterion,
      machineResolution(current.criterion, current.gates),
    );
    assert.equal(outcome.outcome, "refused", current.label);
    assert.equal(outcome.criterionId, "uatc_0123456789abcdef01234567", current.label);
    assert.equal(outcome.reason, current.reason, current.label);
    assert.equal(outcome.declaredGateId, current.criterion.proofGateId, current.label);
    assert.equal("proofCommand" in outcome, false, current.label);
    assert.equal("adoptionInvocation" in outcome, false, current.label);
    assert.equal("gateId" in outcome, false, current.label);
  }
});

test("proof-binding outcome: only an evidence branch is accepted by an evidence-only reader", () => {
  const leg = criterion("story#gate-2");
  const outcome = proofBindingOutcome(
    leg,
    machineResolution(leg, [gate("observe", "story#gate-2", "pnpm test")]),
  );
  assert.equal(outcome.outcome, "evidence");

  const readEvidence = (evidence: ProofBindingEvidence) => evidence.adoptionInvocation.join(" ");
  assert.equal(readEvidence(outcome), "storytree adopt gate story#gate-2 --pg");
});
