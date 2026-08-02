import type { UatTestCriterion } from "./uat-test-criteria.js";
import type { WitnessResolution } from "./witness-resolution.js";

/** The stable, inspectable alternatives for a declared machine UAT leg. */
export const PROOF_BINDING_OUTCOME_KINDS = ["evidence", "refused"] as const;
export type ProofBindingOutcomeKind = (typeof PROOF_BINDING_OUTCOME_KINDS)[number];

/** Human and undecided criteria deliberately have no outcome on this machine-proof surface. */
export type MachineWitnessResolution = Extract<WitnessResolution, { witness: "machine" }>;

/** The parsed criterion fields that identify an outcome and its declared binding. */
export type ProofBindingCriterion = Pick<UatTestCriterion, "criterionId" | "proofGateId">;

/** A display-only adoption command. Executing or signing stays with the drive adoption path. */
export type AdoptionInvocation = readonly [
  "storytree",
  "adopt",
  "gate",
  gateId: string,
  "--pg",
];

/** A declared, runnable observe-gate chain for one machine criterion. */
export interface ProofBindingEvidence {
  outcome: "evidence";
  criterionId: string;
  gateId: string;
  gateKind: "observe";
  /** The literal command declared on the eligible reliability gate; never reconstructed here. */
  proofCommand: string;
  adoptionInvocation: AdoptionInvocation;
}

/** A non-runnable binding defect. There is deliberately no command or invocation field. */
export interface ProofBindingRefusal {
  outcome: "refused";
  criterionId: string;
  reason: Extract<MachineWitnessResolution, { coverage: "refused" }>["refusal"];
  /** Present only when the criterion actually declared a gate id. */
  declaredGateId?: string;
}

/**
 * Exhaustively adapt the strict resolver's machine result into reader-facing evidence or a refusal.
 * It does no parsing, lookup, command execution, signing, or verdict decision: the resolver has
 * already made the only eligibility decision, and this adapter only preserves it.
 */
export function proofBindingOutcome(
  criterion: ProofBindingCriterion,
  resolution: MachineWitnessResolution,
): ProofBindingEvidence | ProofBindingRefusal {
  if (resolution.coverage === "observe") {
    return {
      outcome: "evidence",
      criterionId: criterion.criterionId,
      gateId: resolution.observedBy,
      gateKind: "observe",
      proofCommand: resolution.proofCommand,
      adoptionInvocation: ["storytree", "adopt", "gate", resolution.observedBy, "--pg"],
    };
  }

  return {
    outcome: "refused",
    criterionId: criterion.criterionId,
    reason: resolution.refusal,
    ...(criterion.proofGateId !== undefined ? { declaredGateId: criterion.proofGateId } : {}),
  };
}
