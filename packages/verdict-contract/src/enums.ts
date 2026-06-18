import { z } from "zod";

/**
 * The published verdict-contract enum vocabulary (ADR-0068 §3): the small set of
 * fixed-option enums the verdict DATA shapes are built from.
 *
 * `Tier` and `Status` are DELIBERATELY DUPLICATED from `@storytree/core`'s `schema.ts`
 * (the locked owner decision, ADR-0068): the contract is the published SHAPE readers
 * validate verdict-DATA against, so it must not import the farmer organism's package to
 * read its own enums. A parity guard in the tests imports core's enums (TEST ONLY) and
 * asserts an IDENTICAL option set, so this duplicate can never silently drift from core.
 */

// ---------------------------------------------------------------------------
// Duplicated from @storytree/core/schema.ts (ADR-0068; parity-guarded in tests)
// ---------------------------------------------------------------------------

/** The three work-hierarchy tiers (story / capability / contract). Duplicated from core. */
export const Tier = z.enum(["story", "capability", "contract"]);
export type Tier = z.infer<typeof Tier>;

/** A work unit's lifecycle status. Duplicated from core (`healthy` is non-authorable; ADR-0020). */
export const Status = z.enum([
  "proposed",
  "building",
  "healthy",
  "unhealthy",
  "mapped",
  "retired",
]);
export type Status = z.infer<typeof Status>;

// ---------------------------------------------------------------------------
// The proof / attestation vocabulary the verdict shapes are built from
// ---------------------------------------------------------------------------

/**
 * The proof modes (ADR-0007). `contract` / `capability` / `story` are the three tiers'
 * automated ladders; `operator-attested` is the human-anchored mode.
 */
export const ProofMode = z.enum([
  "contract",
  "capability",
  "story",
  "operator-attested",
]);
export type ProofMode = z.infer<typeof ProofMode>;

/** The binary outcome of a proof run. */
export const Outcome = z.enum(["pass", "fail"]);
export type Outcome = z.infer<typeof Outcome>;

/** Who witnessed a UAT: a human, or a machine run (ADR-0040 / ADR-0044). */
export const UatWitness = z.enum(["human", "machine"]);
export type UatWitness = z.infer<typeof UatWitness>;
