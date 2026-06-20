/**
 * Per-UAT-test attestation marks for the `storytree tree <story>` focused view
 * (ADR-0044 `attestation-surface`). The DISPLAY half of the attestation log: a human
 * seal, a distinct machine mark, or blank — advisory and silently absent offline,
 * exactly like the verdict glyphs (`tree-verdicts.ts`).
 *
 * Deliberately NOT the gate-proven ✓/✗: a vouch is not a proof (ADR-0044 d.2), so the
 * marks read differently and never claim a verdict.
 */

import { deriveAttestations } from "@storytree/orchestrator";
import type { TestAttestations } from "@storytree/proof-protocol";

/** Human attestation seal (filled) · machine mark (boxed) — distinct from the ✓/✗ verdict glyphs. */
export const HUMAN_SEAL = "◉";
export const MACHINE_MARK = "▣";

/** Structural slice of the attestation store this module consumes — injected, so tests need no DB. */
export interface AttestationReaderLike {
  readEvents(): Promise<ReadonlyArray<{ seq: number; doc: unknown }>>;
}

/**
 * Read the latest-per-(testId,witness) attestation projection, silently returning
 * `null` when the store is unavailable (null reader) or the read fails — the
 * offline-silent contract, the only place it lives (mirrors `readVerdictGlyphs`).
 */
export async function readAttestations(
  reader: AttestationReaderLike | null,
): Promise<Map<string, TestAttestations> | null> {
  if (reader === null) return null;
  try {
    return deriveAttestations(await reader.readEvents());
  } catch {
    return null;
  }
}

/**
 * Format one test's attestation mark for the CLI column.
 *
 *   marks === null  (offline)            → "" (column absent)
 *   no entry for the test (never voucht) → "–"
 *   human and/or machine present         → the seal/mark + outcome (+ fail flagged)
 */
export function attestationMark(
  marks: ReadonlyMap<string, TestAttestations> | null,
  testId: string,
): string {
  if (marks === null) return "";
  const entry = marks.get(testId);
  if (entry === undefined) return "–";
  const parts: string[] = [];
  if (entry.human !== undefined) parts.push(`${HUMAN_SEAL} human:${entry.human.outcome}`);
  if (entry.machine !== undefined) parts.push(`${MACHINE_MARK} machine:${entry.machine.outcome}`);
  return parts.length > 0 ? parts.join("  ") : "–";
}
