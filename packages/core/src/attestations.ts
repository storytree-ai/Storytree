import { z } from "zod";
import { Outcome } from "./proof.js";
import { UatWitness } from "./schema.js";

/**
 * ADR-0044 `attestation-signals`: a per-UAT-test attestation — a signed, append-only
 * signal that a human ("I saw it work") or a machine run vouched for a specific test.
 *
 * A vouch is NOT a proof (ADR-0044 d.2): attestations live in their OWN log
 * (`events.attestation`), keyed by **test id**, and are NEVER written to
 * `events.verdict` — a person vouching and the gate proving are different claims, the
 * whole point of the signed-verdict system. There is NO story roll-up (d.3): these
 * accumulate per-test and never derive a story-level hue.
 *
 * Pure, no I/O: the doc + the witness/outcome vocabulary + the conservative derivation
 * (`deriveAttestations`, the `deriveVerdictGlyphs` pattern). The signing chain
 * (`resolveSigner`) and the store live elsewhere.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** A non-blank, trimmed signer — fail-closed: a blank signer is a malformed signal. */
const signerField = z.string().refine((s) => s.trim().length > 0, {
  message: "signer must be a non-blank string (fail-closed; ADR-0044 d.2)",
});

/**
 * One recorded attestation (ADR-0044 d.2). `witness` is `human`|`machine` — the
 * recorded fact is concretely one (unlike a test's `either` PERMISSION). `signer` is
 * the resolved identity (the operator for a human relay, the runner for a machine);
 * `relayedBy` records the agent/session that SCRIBED a relayed human attestation —
 * honest provenance for "the owner vouched, the agent scribed" (ADR-0044 d.4).
 *
 * Strict: unknown fields rejected. A malformed doc grants nothing (the derivation
 * `safeParse`s and skips), so this can never be coerced into looking like a verdict.
 */
export const Attestation = z
  .object({
    /** The UAT test id this signal is keyed by (`<story>#uat-<n>`). */
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

export type Attestation = z.infer<typeof Attestation>;

// ---------------------------------------------------------------------------
// Derivation — latest signal per (testId, witness)
// ---------------------------------------------------------------------------

/** The display projection for one test: the latest human and/or machine attestation. */
export interface TestAttestations {
  human?: Attestation;
  machine?: Attestation;
}

/**
 * PURE: derive the latest attestation per (testId, witness) from a raw event stream
 * (the `deriveVerdictGlyphs` discipline). Events are sorted by `seq`; for each
 * (testId, witness) the LAST well-formed attestation wins. Full history is retained
 * upstream — this is only the display projection.
 *
 * Conservative parsing: a doc that does not fully parse as an {@link Attestation}
 * grants nothing (it is skipped). The result is keyed ONLY by test id — never a
 * story id — so attestations can never roll up to a story-level signal (ADR-0044 d.3).
 */
export function deriveAttestations(
  events: ReadonlyArray<{ seq: number; doc: unknown }>,
): Map<string, TestAttestations> {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const result = new Map<string, TestAttestations>();
  for (const event of sorted) {
    const parsed = Attestation.safeParse(event.doc);
    if (!parsed.success) continue;
    const att = parsed.data;
    const bucket = result.get(att.testId) ?? {};
    bucket[att.witness] = att;
    result.set(att.testId, bucket);
  }
  return result;
}
