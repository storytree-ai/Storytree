import { z } from "zod";

/**
 * The `judge-result-shape` capability (ADR-0209 D3): a model-judge's structured
 * output is exactly PASS | FAIL | INCONCLUSIVE with criterion id, evidence refs,
 * and rationale. Distinct from proof-protocol's binary `Outcome` — this is the
 * judge's vocabulary; the spine maps PASS/FAIL to signed pass/fail and never
 * signs INCONCLUSIVE as green. The model cannot carry a self-signing seal.
 */

export const JUDGE_OUTCOMES = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export const JudgeOutcome = z.enum(JUDGE_OUTCOMES);
export type JudgeOutcome = z.infer<typeof JudgeOutcome>;

/** Fields a model must never mint — the spine alone signs (ADR-0209 D3 / ADR-0020). */
const SELF_SIGNING_KEYS = ["signature", "signedBy", "verdictSeal", "seal"] as const;

export const JudgeResult = z
  .object({
    /** Stable criterion id, `<story>#uat-<n>`. */
    criterionId: z.string().min(1),
    /** Structured ternary outcome. */
    outcome: JudgeOutcome,
    /** Evidence references supporting the judgment. */
    evidenceRefs: z.array(z.string().min(1)).min(1),
    /** Rationale for the outcome (required even for INCONCLUSIVE). */
    rationale: z.string().min(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Decisive PASS/FAIL still need non-empty evidence (already min(1) above).
    // INCONCLUSIVE must explain why judgment could not conclude — rationale
    // already min(1); keep the refine hook for future outcome-specific rules.
    if (val.outcome === "INCONCLUSIVE" && val.rationale.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rationale"],
        message: "INCONCLUSIVE requires a non-empty rationale explaining why judgment could not conclude",
      });
    }
  });
export type JudgeResult = z.infer<typeof JudgeResult>;

/**
 * Parse a candidate judge payload. Refuses malformed shapes and any attempt to
 * carry self-signing fields (even before `.strict()` would catch unknowns — we
 * surface a clear refuse for signature-style keys).
 */
export function parseJudgeResult(input: unknown): JudgeResult {
  if (input !== null && typeof input === "object") {
    for (const key of SELF_SIGNING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        throw new Error(
          `judge result refuses self-signing field "${key}" — the spine alone signs (ADR-0209 D3)`,
        );
      }
    }
  }
  return JudgeResult.parse(input);
}
