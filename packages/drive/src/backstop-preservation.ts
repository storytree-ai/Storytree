import type { PromotionResult, promoteRealPass } from "@storytree/orchestrator";

import type { BackstopRefusalObservation } from "./backstop-report.js";

export interface BackstopPreservationRefusal {
  observation: BackstopRefusalObservation;
  authoredCommitSha: string;
}

export interface BackstopPreservationPlanInput {
  refusal: BackstopPreservationRefusal | undefined;
  baseSha: string;
  repoRoot: string;
  unitId: string;
  runId: string;
}

export type BackstopPreservationRequest = Parameters<typeof promoteRealPass>[0];

/**
 * Plan local-only retention of a distinct authored HEAD after a pre-signature backstop refusal.
 * No refusal, or a refusal at the unchanged base, has nothing to preserve.
 */
export function planBackstopPreservation(
  input: BackstopPreservationPlanInput,
): BackstopPreservationRequest | undefined {
  if (input.refusal === undefined || input.refusal.authoredCommitSha === input.baseSha) {
    return undefined;
  }
  return {
    repoRoot: input.repoRoot,
    unitId: input.unitId,
    runId: input.runId,
    commitSha: input.refusal.authoredCommitSha,
    purpose: "unsigned-forensics",
    push: false,
  };
}

export interface BackstopResultEvidence {
  backstopObservation?: BackstopRefusalObservation;
  forensicPreservation?: PromotionResult;
}

export interface BackstopResultEvidenceInput {
  backstopObservation: BackstopRefusalObservation | undefined;
  forensicPreservation: PromotionResult | undefined;
}

/** Assemble optional result evidence without manufacturing own-properties whose values are absent. */
export function assembleBackstopResultEvidence(
  input: BackstopResultEvidenceInput,
): BackstopResultEvidence {
  const evidence: BackstopResultEvidence = {};
  if (input.backstopObservation !== undefined) {
    evidence.backstopObservation = input.backstopObservation;
  }
  if (input.forensicPreservation !== undefined) {
    evidence.forensicPreservation = input.forensicPreservation;
  }
  return evidence;
}
