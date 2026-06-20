import type { Verdict } from "@storytree/proof-protocol";

/**
 * Render a signed verdict as a single human-readable line (no trailing newline). MOVED here from
 * `@storytree/core` (ADR-0068 step 1): rendering a verdict is the farmer organism's compute; the
 * {@link Verdict} shape it reads is the verdict CONTRACT's.
 *
 * Format:
 *   <OUTCOME> <unitId> (<proofMode>) — signed by <signer> @ <short commitSha>, <at>
 *
 * where <short commitSha> is the first 7 characters of commitSha, or the full
 * value if it is shorter than 7 characters.
 */
export function verdictLine(verdict: Verdict): string {
  const shortSha = verdict.commitSha.slice(0, 7);
  return `${verdict.outcome.toUpperCase()} ${verdict.unitId} (${verdict.proofMode}) — signed by ${verdict.signer} @ ${shortSha}, ${verdict.at}`;
}
