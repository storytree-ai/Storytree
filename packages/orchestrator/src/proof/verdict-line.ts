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
 *
 * ADR-0127: when the verdict carries a per-contract coverage axis, a coverage clause is appended —
 * `… — coverage <covered>/<total> contracts[ (⚠ uncovered: …)]` — so a reader sees at a glance which
 * declared `## Contracts` the green covered vs over-claimed. Omitted entirely when the axis is absent
 * (every pre-ADR-0127 / non-real-build verdict renders exactly as before).
 *
 * A non-zero `unreadTitles` (2026-08-06) appends `⚠ N title(s) unread` INSIDE the same parenthetical.
 * It qualifies the `uncovered` list it sits beside: some of the test surface was not legible to the
 * static reader, so that list is at least partly a statement about the checker rather than about the
 * tests. Rendered only when non-zero — a `0` is the axis saying it measured and found nothing unread,
 * which the unqualified clause already conveys — and the clause is byte-identical to before for every
 * verdict whose titles all read.
 */
export function verdictLine(verdict: Verdict): string {
  const shortSha = verdict.commitSha.slice(0, 7);
  const base = `${verdict.outcome.toUpperCase()} ${verdict.unitId} (${verdict.proofMode}) — signed by ${verdict.signer} @ ${shortSha}, ${verdict.at}`;
  const cov = verdict.contractCoverage;
  if (cov === undefined) return base;
  const total = cov.covered.length + cov.uncovered.length;
  const notes: string[] = [];
  if (cov.uncovered.length > 0) notes.push(`⚠ uncovered: ${cov.uncovered.join(", ")}`);
  if (cov.unreadTitles !== undefined && cov.unreadTitles > 0) {
    notes.push(`⚠ ${cov.unreadTitles} title(s) unread`);
  }
  const suffix = notes.length > 0 ? ` (${notes.join("; ")})` : "";
  return `${base} — coverage ${cov.covered.length}/${total} contracts${suffix}`;
}
