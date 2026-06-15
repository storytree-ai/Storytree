import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The knowledge↔code binding & staleness model (ADR-0016).
 *
 * Replaces the brittle `Covers = {file, lines}` line-pointer (which rotted on any edit ABOVE the
 * span, never mind a change to the span itself) with a RE-ANCHORABLE binding whose drift is driven
 * by the CONTENT of the bound span — not its line numbers, and not the commit it sits in.
 *
 * Pinned decisions (ADR-0016, all biased toward MINIMAL re-UAT — never re-witness a human UAT
 * unless the proved code MEANINGFULLY changed; a human re-witness is the expensive case):
 *
 *   - GRAIN: a binding lives on the finest PROOF UNIT (a `#uat-N` test, a contract), capability as
 *     the coarsest fallback, NEVER a whole story — so a change re-proves only the affected unit
 *     (owner call). You re-prove at the grain you bind at.
 *   - DRIFT DRIVER: the content-hash of the bound span drives drift; the git commit SHA and the
 *     event-log seq are PROVENANCE, never the trigger (Bazel/Buck2 action keys, Salsa backdating,
 *     Nix CA paths, Git blob-vs-commit, Datomic/XTDB transaction-time all key invalidation on
 *     CONTENT, not revision). A commit that does not change the span's hash produces NO staleness.
 *   - HASH MODEL: an AST-fingerprint (identifiers RETAINED) is the canonical target; this module
 *     ships normalized-text behind the {@link hashSpan} seam (a later per-language AST swap changes
 *     no caller, with this normalized-text hasher as the fallback for unparsed languages).
 *     Identifiers stay IN the hash — a rename SHOULD re-witness (a false-negative is the dangerous
 *     direction for a human UAT).
 *   - RE-LOCATION (secondary — the hash is the primary change-DETECTOR): the anchor stores a
 *     structural `symbol` path AND a fuzzy text-quote ({@link TextQuote}, the W3C
 *     TextQuoteSelector shape). The resolve cascade (structure-first, fuzzy-fallback, REFUSE on an
 *     ambiguous span rather than re-anchoring the wrong one — halt-is-never-a-pass) is a later
 *     slice; this module defines the anchor SHAPE the cascade reads.
 *
 * Described-change gating (ADR-0016 §2-3): only a DESCRIBED change counts as drift; an UNDESCRIBED
 * divergence is DEMOTED — kept in the log, surfaced only by an explicit audit, never a re-UAT
 * trigger. This suppresses cosmetic/false-positive staleness AND makes the stale flag explanatory
 * ("changed: <why>") so a token-budgeted agent can judge relevance without re-deriving.
 *
 * PURE: no store, no clock, no git. The drift compare is LAZY (compare-on-read); the caller
 * supplies `currentHash` (recomputed from the located span) and the unit's change log.
 */

// ---------------------------------------------------------------------------
// The anchor (the re-anchorable binding)
// ---------------------------------------------------------------------------

/**
 * A fuzzy text-quote re-LOCATOR (W3C Web Annotation `TextQuoteSelector`). `exact` is the bound
 * span's verbatim text; `prefix`/`suffix` are the surrounding context (~32 chars is the
 * conventional window) that disambiguate it when the same text appears more than once. It is the
 * language-agnostic, parser-free re-location fallback — NOT the change detector (the content hash
 * is that). Stored alongside the structural `symbol` so re-location can resolve structure-first
 * and fall back to a quote search.
 */
export const TextQuote = z
  .object({
    exact: z.string(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  })
  .strict();
export type TextQuote = z.infer<typeof TextQuote>;

/**
 * A re-anchorable binding from a proof/knowledge unit to a span of code (ADR-0016 d.1), replacing
 * the retired `Covers = {file, lines}`. IDENTITY ("WHAT" — the re-anchorable locator) and VERSION
 * ("WHEN" — the bind point) are kept as DISTINCT fields, never fused (the Kythe lesson: a stable
 * symbol identity stays separate from the code-version it was observed at).
 *
 *   IDENTITY:  `file` (repo-relative) + optional `symbol` (a structural/AST path) + optional
 *              `quote` (the fuzzy fallback) — the re-location cascade reads these.
 *   VERSION:   `boundHash` (the {@link hashSpan} of the span at bind time — THE drift anchor) +
 *              optional `boundCommit` (the git SHA it was glued to — PROVENANCE only, never the
 *              drift driver; a pointer to "go look at the diff").
 *
 * `boundHash` is required because it is the whole point — a binding with no content hash cannot
 * detect drift. `symbol`/`quote`/`boundCommit` are optional re-location/provenance aids, present
 * when available.
 */
export const Anchor = z
  .object({
    file: z.string().min(1),
    symbol: z.string().optional(),
    quote: TextQuote.optional(),
    boundHash: z.string().min(1),
    boundCommit: z.string().optional(),
  })
  .strict();
export type Anchor = z.infer<typeof Anchor>;

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

/**
 * The content-hash SEAM (ADR-0016 d.3): a hex SHA-256 of the {@link normalizeSpan}'d span, so the
 * hash changes IFF the span meaningfully changed. This is the seam the canonical AST-fingerprint
 * swaps in behind later (per language, with this normalized-text hasher as the fallback) — no
 * caller changes when it does.
 */
export function hashSpan(span: string): string {
  return createHash("sha256").update(normalizeSpan(span), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// The described-change vocabulary (ADR-0016 §2)
// ---------------------------------------------------------------------------

/**
 * A change event (ADR-0016 §2 + Consequences): the unit of "the bound code changed, here's why".
 * Append-only (one row in the event log). `description` present-and-non-blank = a DESCRIBED change
 * (counts as drift, carries the explanatory "changed: why"); absent/blank = UNDESCRIBED (DEMOTED —
 * kept in the log for the audit, never a re-UAT trigger). `author` + `at` attribute it.
 *
 * `commitSha` is PROVENANCE only — a pointer to the diff, never the drift driver (ADR-0016 fork 1).
 */
export const ChangeEvent = z
  .object({
    /** The proof unit whose binding this change touches (`#uat-N`, a contract id, …). */
    unitId: z.string().min(1),
    /** The bound span's hash before the change (the {@link hashSpan} it diverged FROM). */
    hashBefore: z.string().min(1),
    /** The bound span's hash after the change (the {@link hashSpan} it advanced TO). */
    hashAfter: z.string().min(1),
    /** The "changed: why". Present + non-blank ⇒ DESCRIBED; absent/blank ⇒ DEMOTED. */
    description: z.string().optional(),
    /** Who authored the change (a resolved identity). */
    author: z.string().min(1),
    /** ISO timestamp — the valid-time of the change (bitemporal; ADR-0016 §5). */
    at: z.string().min(1),
    /** PROVENANCE only — the commit the change landed in, a pointer to the diff. Never the driver. */
    commitSha: z.string().optional(),
  })
  .strict();
export type ChangeEvent = z.infer<typeof ChangeEvent>;

/**
 * Is this a DESCRIBED change (ADR-0016 §2)? A non-blank `description`. An undescribed change is
 * DEMOTED — it stays in the log but is filtered from drift propagation and re-UAT.
 */
export function isDescribed(change: ChangeEvent): boolean {
  return change.description !== undefined && change.description.trim().length > 0;
}

// ---------------------------------------------------------------------------
// The drift flag (ADR-0016 §3) — lazy, per-binding, described-change-gated
// ---------------------------------------------------------------------------

/** The three honest end-states of a binding's drift check (ADR-0016 §3). */
export const DRIFT_STATES = ["fresh", "stale", "drifted-undescribed"] as const;
export const DriftState = z.enum(DRIFT_STATES);
export type DriftState = z.infer<typeof DriftState>;

/** The result of a compare-on-read drift check — an explicit, explanatory flag. */
export interface DriftFlag {
  /** `fresh` | `stale` | `drifted-undescribed` (see {@link classifyDrift}). */
  state: DriftState;
  /** True iff the bound span's hash differs from the hash the proof was signed against. */
  drifted: boolean;
  /**
   * The explanatory "changed: why" from the latest DESCRIBED change — present ONLY for `stale`, so
   * a token-budgeted agent can judge relevance without re-deriving (ADR-0016 §3). `undefined` for
   * `fresh` and for `drifted-undescribed` (a demoted change carries no consumer-facing reason).
   */
  description: string | undefined;
  /** The hash the proof was signed against (echoed for audit). */
  boundHash: string;
  /** The bound span's hash right now (recomputed by the caller from the located span). */
  currentHash: string;
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
 * proved code. (Note: a span change is DETECTED either way via the hash; the gate decides whether
 * it is a re-UAT trigger or audit-only.)
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
