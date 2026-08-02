import { z } from "zod";
import { Outcome, UatWitness } from "./enums.js";
import { CriterionId, CriterionRevisionId } from "./criterion-binding.js";

/**
 * The attestation DATA shapes (ADR-0044, published per ADR-0068 §3).
 *
 * DATA SHAPES ONLY: the per-test attestation doc and its display-projection type. The
 * DERIVATION compute (`deriveAttestations`) is NOT here — it stays in the farmer organism
 * (`@storytree/core`). Mirrors `@storytree/core/attestations.ts` shapes field-for-field.
 *
 * A vouch is NOT a proof (ADR-0044 d.2): attestations are keyed by TEST id, never roll up to a
 * story, and are never written to `events.verdict`.
 */

/** A non-blank, trimmed signer — fail-closed: a blank signer is a malformed signal (ADR-0044 d.2). */
const signerField = z.string().refine((s) => s.trim().length > 0, {
  message: "signer must be a non-blank string (fail-closed; ADR-0044 d.2)",
});

/**
 * One recorded attestation (ADR-0044 d.2). `witness` is `human`|`machine`; `signer` is the
 * resolved identity; `relayedBy` records the agent/session that SCRIBED a relayed human
 * attestation. Strict: unknown fields rejected, so this can never be coerced into a verdict.
 */
const AttestationData = z
  .object({
    /** Compatibility key: current attestations set this to the opaque criterionId. */
    testId: z.string().min(1),
    /** What was observed: the test passed or failed when witnessed. */
    outcome: Outcome,
    /** Who witnessed: a human, or a machine run. */
    witness: UatWitness,
    /** The resolved signing identity (fail-closed; never blank). */
    signer: signerField,
    /** ISO timestamp of the attestation. */
    at: z.string(),
    /** Optional free-text note ("clicked it, the panel rendered"). */
    note: z.string().optional(),
    /** The agent/session that scribed a relayed human attestation (absent = direct/machine). */
    relayedBy: z.string().optional(),
  })
  .strict();

/** Preserved pre-ADR-0253 positional attestation history. Never accepted by new writers. */
export const LegacyAttestation = AttestationData;
export type LegacyAttestation = z.infer<typeof LegacyAttestation>;

/** A new attestation, bound to the exact authored criterion and immutable revision. */
export const Attestation = AttestationData.extend({
  criterionId: CriterionId,
  revisionId: CriterionRevisionId,
}).superRefine((value, ctx) => {
  if (value.testId !== value.criterionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["testId"],
      message: "a current attestation testId must equal criterionId",
    });
  }
});
export type Attestation = z.infer<typeof Attestation>;

/** Read shape for the append-only log: exact current rows plus untouched legacy rows. */
export const StoredAttestation = z.union([Attestation, LegacyAttestation]);
export type StoredAttestation = z.infer<typeof StoredAttestation>;

/**
 * The display projection for one test: the latest human and/or machine attestation. A DATA shape
 * only; the derivation (`deriveAttestations`) that builds it stays in core.
 */
export interface TestAttestations {
  human?: StoredAttestation;
  machine?: StoredAttestation;
}
