import type { ChangeEvent, DriftFlag } from "@storytree/verdict-contract";

/**
 * The knowledge↔code binding & staleness COMPUTE (ADR-0016). MOVED here from `@storytree/core`'s
 * `anchor.ts` (ADR-0068 step 1): hashing a span and classifying drift is the farmer organism's
 * ruler. The DATA shapes it reads/returns ({@link ChangeEvent}, {@link DriftFlag}, the anchor) are
 * the verdict CONTRACT's — imported above, never re-defined here.
 *
 * The drift model (all biased toward MINIMAL re-UAT — never re-witness a human UAT unless the proved
 * code MEANINGFULLY changed):
 *   - DRIFT DRIVER: the content-hash of the bound span drives drift; the git commit SHA and the
 *     event-log seq are PROVENANCE, never the trigger. A commit that does not change the span's hash
 *     produces NO staleness.
 *   - HASH MODEL: an AST-fingerprint (identifiers RETAINED) is the canonical target; this ships
 *     normalized-text behind the {@link hashSpan} seam (a later per-language AST swap changes no
 *     caller). Identifiers stay IN the hash — a rename SHOULD re-witness.
 *   - Described-change gating: only a DESCRIBED change counts as drift; an UNDESCRIBED divergence is
 *     DEMOTED — kept in the log, surfaced only by an explicit audit, never a re-UAT trigger.
 *
 * PURE: no store, no clock, no git. The drift compare is LAZY (compare-on-read); the caller
 * supplies `currentHash` (recomputed from the located span) and the unit's change log.
 */

// ---------------------------------------------------------------------------
// The content-hash seam (ADR-0016 d.3)
// ---------------------------------------------------------------------------

/**
 * Conservative, language-agnostic span normalization (ADR-0016 d.3). Normalizes line endings to
 * `\n`, strips trailing whitespace per line, drops blank lines, and trims — killing the dominant
 * cosmetic false-positives (CRLF/LF churn, trailing whitespace, blank-line insertion) WITHOUT
 * touching identifiers, leading indentation, or in-line whitespace inside the code. It does NOT
 * collapse interior whitespace (that would corrupt string literals) or strip comments (a
 * per-language minefield — deferred to the AST swap). Exported so tests and a future AST hasher
 * share the one definition.
 *
 * Deliberately on the SAFE side: a real edit, a rename, or a reindent still changes the
 * normalized text and therefore the hash — the right direction for a human UAT (we would rather
 * over-flag and let the described-change gate demote it than silently miss a meaningful change).
 */
export function normalizeSpan(span: string): string {
  return span
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

// FNV-1a 128-bit constants (the canonical offset basis + prime). A content FINGERPRINT, not a
// cryptographic hash — drift detection needs collision-resistance, not security (and a fingerprint
// is exactly the AST-fingerprint direction d.3 names). FNV needs only `TextEncoder` + `BigInt`
// (universal globals), stays sync, and pulls no `node:` import.
const FNV_OFFSET_128 = 0x6c62272e07bb014262b821756295c58dn;
const FNV_PRIME_128 = 0x0000000001000000000000000000013bn;
const MASK_128 = (1n << 128n) - 1n;

/**
 * The content-hash SEAM (ADR-0016 d.3): a 128-bit FNV-1a fingerprint (32 hex chars) of the
 * {@link normalizeSpan}'d span, so the hash changes IFF the span meaningfully changed. This is the
 * seam the canonical AST-fingerprint swaps in behind later (per language, with this normalized-text
 * hasher as the fallback) — no caller changes when it does. Sync, zero-dependency, browser-safe.
 */
export function hashSpan(span: string): string {
  let h = FNV_OFFSET_128;
  for (const byte of new TextEncoder().encode(normalizeSpan(span))) {
    h = ((h ^ BigInt(byte)) * FNV_PRIME_128) & MASK_128;
  }
  return h.toString(16).padStart(32, "0");
}

// ---------------------------------------------------------------------------
// The described-change gate + drift classification (ADR-0016 §2-3)
// ---------------------------------------------------------------------------

/**
 * Is this a DESCRIBED change (ADR-0016 §2)? A non-blank `description`. An undescribed change is
 * DEMOTED — it stays in the log but is filtered from drift propagation and re-UAT.
 */
export function isDescribed(change: ChangeEvent): boolean {
  return change.description !== undefined && change.description.trim().length > 0;
}

/**
 * PURE, LAZY (compare-on-read) drift classification (ADR-0016 §3). Given the hash a proof was
 * signed against (`boundHash`), the bound span's hash RIGHT NOW (`currentHash`, recomputed by the
 * caller from the re-located span), and the change events recorded for the unit SINCE that bind
 * point, classify the binding:
 *
 *   - `fresh`               — `currentHash === boundHash`; the proved span is unchanged. No re-UAT.
 *   - `stale`               — the span changed AND a DESCRIBED change explains it; carries the
 *                             latest description. → re-prove THIS unit (and only this unit).
 *   - `drifted-undescribed` — the span changed but NO described change explains it; DEMOTED
 *                             (ADR-0016 §2) — kept for the "show undescribed divergence" audit,
 *                             never a re-UAT trigger.
 *
 * The owner's bias is baked in: an undescribed/cosmetic divergence NEVER promotes to a re-UAT —
 * the expensive case is a human re-witness, spent only on a genuine, described change of the
 * proved code.
 */
export function classifyDrift(
  boundHash: string,
  currentHash: string,
  changes: readonly ChangeEvent[],
): DriftFlag {
  const drifted = currentHash !== boundHash;
  if (!drifted) {
    return { state: "fresh", drifted: false, description: undefined, boundHash, currentHash };
  }
  const described = changes.filter(isDescribed);
  if (described.length === 0) {
    return {
      state: "drifted-undescribed",
      drifted: true,
      description: undefined,
      boundHash,
      currentHash,
    };
  }
  // The latest DESCRIBED change wins as the explanatory reason (valid-time order; ADR-0016 §5).
  const latest = described.reduce((a, b) => (b.at >= a.at ? b : a));
  return { state: "stale", drifted: true, description: latest.description, boundHash, currentHash };
}
