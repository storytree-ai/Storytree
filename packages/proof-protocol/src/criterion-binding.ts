import { z } from "zod";

/** Authored, opaque UAT criterion identity (ADR-0253). */
export const CriterionId = z
  .string()
  .regex(/^uatc_[0-9a-f]{24}$/, "criterionId must be an opaque uatc_ id");
export type CriterionId = z.infer<typeof CriterionId>;

/** Immutable content-bound UAT criterion revision identity (ADR-0253). */
export const CriterionRevisionId = z
  .string()
  .regex(/^uatr1:[0-9a-f]{16}$/, "revisionId must be a uatr1 content binding");
export type CriterionRevisionId = z.infer<typeof CriterionRevisionId>;

/** The exact proof target. Neither member has meaning as current proof without the other. */
export const CriterionBinding = z
  .object({
    criterionId: CriterionId,
    revisionId: CriterionRevisionId,
  })
  .strict();
export type CriterionBinding = z.infer<typeof CriterionBinding>;

/**
 * Browser-safe FNV-1a/64 content binding. The version prefix makes the algorithm
 * explicit and leaves a clean migration path if the canonicalisation changes.
 */
export function criterionRevisionId(canonicalContent: string): CriterionRevisionId {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(canonicalContent);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return CriterionRevisionId.parse(`uatr1:${hash.toString(16).padStart(16, "0")}`);
}
