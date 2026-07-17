/**
 * `@storytree/model-judged-uat` — the model-judged-uat organism.
 *
 * Independent fresh read-only model judge: structured PASS/FAIL/INCONCLUSIVE
 * result shape, judge seam, spine validation + signable payload, and the
 * capability escalation ladder (ADR-0209 D3/D4). Pure zod + port seams;
 * packages-forward (ADR-0192). Consumers import `@storytree/model-judged-uat`,
 * never a sibling capability file directly.
 */

export {
  JUDGE_OUTCOMES,
  JudgeOutcome,
  JudgeResult,
  parseJudgeResult,
} from "./judge-result.js";
export type { JudgeOutcome as JudgeOutcomeType, JudgeResult as JudgeResultType } from "./judge-result.js";

export {
  ScriptedJudge,
  assertReadOnlyJudgePort,
} from "./judge-seam.js";
export type { JudgeContext, JudgePort } from "./judge-seam.js";

export { validateModelJudgeResult } from "./spine-validation.js";
export type {
  EligibilityDecision,
  SignableModelUatPayload,
  SpineValidationInput,
  SpineValidationRefusalReason,
  SpineValidationResult,
} from "./spine-validation.js";

export { classifyEscalation } from "./escalation.js";
export type { EscalationAction, EscalationInput, EscalationResult } from "./escalation.js";
