import { Attestation } from "@storytree/verdict-contract";
import type { TestAttestations } from "@storytree/verdict-contract";

/**
 * The attestation DERIVATION compute (ADR-0044 `attestation-signals`). MOVED here from
 * `@storytree/core`'s `attestations.ts` (ADR-0068 step 1): deriving the display projection is the
 * farmer organism's ruler. The DATA shapes it reads/returns ({@link Attestation},
 * {@link TestAttestations}) are the verdict CONTRACT's — imported above, never re-defined.
 *
 * A vouch is NOT a proof (ADR-0044 d.2): attestations are keyed by TEST id, never roll up to a
 * story, and are never written to `events.verdict`.
 */

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
