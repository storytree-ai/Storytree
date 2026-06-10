import type { Verdict } from "./proof.js";

/**
 * Render a signed verdict as a single human-readable line (no trailing newline).
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
