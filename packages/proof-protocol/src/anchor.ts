import { z } from "zod";

/**
 * The knowledge↔code binding DATA shapes (ADR-0016, published per ADR-0068 §3).
 *
 * DATA SHAPES ONLY: the re-anchorable binding, the change-event vocabulary, and the drift
 * end-states. The COMPUTE — `hashSpan`, `normalizeSpan`, `classifyDrift`, `isDescribed` — is
 * NOT here; it is the farmer organism's ruler and stays in `@storytree/core` / the gate.
 * Mirrors `@storytree/core/anchor.ts` field-for-field (no-op re-point), shapes only.
 */

// ---------------------------------------------------------------------------
// The anchor (the re-anchorable binding)
// ---------------------------------------------------------------------------

/**
 * A fuzzy text-quote re-LOCATOR (W3C Web Annotation `TextQuoteSelector`). `exact` is the bound
 * span's verbatim text; `prefix`/`suffix` are the surrounding context that disambiguate it when the
 * same text appears more than once. The parser-free re-location fallback — NOT the change detector.
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
 * A re-anchorable binding from a proof/knowledge unit to a span of code (ADR-0016 d.1).
 * IDENTITY (`file` + optional `symbol` + optional `quote`) and VERSION (`boundHash` + optional
 * `boundCommit`, provenance only) are kept DISTINCT. `boundHash` is required — a binding with no
 * content hash cannot detect drift.
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
// The described-change vocabulary (ADR-0016 §2)
// ---------------------------------------------------------------------------

/**
 * A change event (ADR-0016 §2): "the bound code changed, here's why". Append-only.
 * `description` present-and-non-blank = a DESCRIBED change (counts as drift); absent/blank =
 * UNDESCRIBED (DEMOTED — kept for the audit, never a re-UAT trigger). `commitSha` is PROVENANCE only.
 */
export const ChangeEvent = z
  .object({
    /** The proof unit whose binding this change touches (`#uat-N`, a contract id, …). */
    unitId: z.string().min(1),
    /** The bound span's hash before the change (the hashSpan it diverged FROM). */
    hashBefore: z.string().min(1),
    /** The bound span's hash after the change (the hashSpan it advanced TO). */
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

// ---------------------------------------------------------------------------
// The drift end-states (ADR-0016 §3)
// ---------------------------------------------------------------------------

/** The three honest end-states of a binding's drift check (ADR-0016 §3). */
export const DRIFT_STATES = ["fresh", "stale", "drifted-undescribed"] as const;
export const DriftState = z.enum(DRIFT_STATES);
export type DriftState = z.infer<typeof DriftState>;

/**
 * The result of a compare-on-read drift check — an explicit, explanatory flag (ADR-0016 §3).
 * A DATA shape only; the classification COMPUTE (`classifyDrift`) stays in core / the gate.
 */
export interface DriftFlag {
  /** `fresh` | `stale` | `drifted-undescribed`. */
  state: DriftState;
  /** True iff the bound span's hash differs from the hash the proof was signed against. */
  drifted: boolean;
  /**
   * The explanatory "changed: why" from the latest DESCRIBED change — present ONLY for `stale`.
   * `undefined` for `fresh` and for `drifted-undescribed`.
   */
  description: string | undefined;
  /** The hash the proof was signed against (echoed for audit). */
  boundHash: string;
  /** The bound span's hash right now (recomputed by the caller from the located span). */
  currentHash: string;
}
