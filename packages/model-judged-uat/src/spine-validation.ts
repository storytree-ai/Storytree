import type { Criterion, Tier, RegisteredModel } from "@storytree/model-uat";
import type { DetailAnchorFreshness } from "@storytree/uat-criterion";

import type { JudgeOutcome, JudgeResult } from "./judge-result.js";
import { JudgeResult as JudgeResultSchema } from "./judge-result.js";

/** Eligibility decision shape from `@storytree/model-uat` `resolveJudge`. */
export type EligibilityDecision =
  | { status: "eligible"; judge: RegisteredModel }
  | { status: "hold"; reason: string };

/**
 * The `spine-judge-validation` capability (ADR-0209 D3/D6): the spine admits a
 * model judgment only when shape, eligibility, tier, fresh detail-hash, and
 * evidence bindings all hold — and builds a *signable* payload the model itself
 * cannot seal. Persistence/signing stays in orchestrator consumer glue.
 */

export type SpineValidationRefusalReason =
  | "bad-shape"
  | "non-model-witness"
  | "ineligible-judge"
  | "insufficient-tier"
  | "stale-or-missing-hash"
  | "missing-evidence";

export type SpineValidationResult =
  | { status: "admitted"; payload: SignableModelUatPayload }
  | { status: "refused"; reason: SpineValidationRefusalReason; detail: string };

/**
 * Payload the spine *may* sign — deliberately has no model-authored seal.
 * `signableForSpine: true` marks admission without claiming a finished verdict.
 */
export interface SignableModelUatPayload {
  readonly signableForSpine: true;
  readonly criterionId: string;
  readonly judgeId: string;
  readonly judgeTier: Tier;
  readonly requiredTier: Tier;
  readonly detailArtifactId: string;
  readonly detailHash: string;
  readonly outcome: JudgeOutcome;
  readonly evidenceRefs: readonly string[];
  readonly rationale: string;
}

export interface SpineValidationInput {
  readonly result: unknown;
  readonly criterion: Criterion;
  /** Eligibility decision from `@storytree/model-uat` `resolveJudge` / resolveWitness. */
  readonly eligibility: EligibilityDecision;
  /** Named judge that produced the result — must match an eligible registered judge. */
  readonly namedJudgeId: string;
  readonly detailArtifactId: string;
  readonly detailHash: string | undefined;
  readonly hashFreshness: DetailAnchorFreshness | "missing";
}

const TIER_RANK: Record<Tier, number> = { advanced: 0, frontier: 1 };

/**
 * PURE: admit a structured judge result into a signable model-UAT payload, or
 * refuse with a typed reason. Never returns a finished signed verdict.
 */
export function validateModelJudgeResult(input: SpineValidationInput): SpineValidationResult {
  const parsed = JudgeResultSchema.safeParse(input.result);
  if (!parsed.success) {
    return { status: "refused", reason: "bad-shape", detail: parsed.error.message };
  }
  const result: JudgeResult = parsed.data;

  if (input.criterion.witness !== "model") {
    return {
      status: "refused",
      reason: "non-model-witness",
      detail: `criterion witness is "${input.criterion.witness}", not model`,
    };
  }

  const requiredTier = input.criterion.tier;
  if (requiredTier === undefined) {
    return {
      status: "refused",
      reason: "insufficient-tier",
      detail: "model criterion has no required tier",
    };
  }

  if (input.eligibility.status !== "eligible") {
    return {
      status: "refused",
      reason: "ineligible-judge",
      detail: input.eligibility.reason,
    };
  }

  const judge = input.eligibility.judge;
  if (judge.id !== input.namedJudgeId) {
    return {
      status: "refused",
      reason: "ineligible-judge",
      detail: `named judge "${input.namedJudgeId}" is not the eligible judge "${judge.id}"`,
    };
  }

  if (TIER_RANK[judge.tier] < TIER_RANK[requiredTier]) {
    return {
      status: "refused",
      reason: "insufficient-tier",
      detail: `judge tier "${judge.tier}" does not satisfy required "${requiredTier}"`,
    };
  }

  if (
    input.detailHash === undefined ||
    input.detailHash.length === 0 ||
    input.hashFreshness !== "fresh"
  ) {
    return {
      status: "refused",
      reason: "stale-or-missing-hash",
      detail: `detail hash freshness is "${input.hashFreshness}"`,
    };
  }

  if (!result.evidenceRefs.some((ref) => ref.length > 0) || result.criterionId !== input.criterion.id) {
    return {
      status: "refused",
      reason: "missing-evidence",
      detail:
        result.criterionId !== input.criterion.id
          ? `result criterionId "${result.criterionId}" does not bind criterion "${input.criterion.id}"`
          : "evidence refs are empty",
    };
  }

  const payload: SignableModelUatPayload = {
    signableForSpine: true,
    criterionId: result.criterionId,
    judgeId: judge.id,
    judgeTier: judge.tier,
    requiredTier,
    detailArtifactId: input.detailArtifactId,
    detailHash: input.detailHash,
    outcome: result.outcome,
    evidenceRefs: result.evidenceRefs,
    rationale: result.rationale,
  };

  // Admission is not a model signature — payload carries no seal fields.
  return { status: "admitted", payload };
}
