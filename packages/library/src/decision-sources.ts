import { Anchor } from "@storytree/proof-protocol";
import { z } from "zod";

/**
 * PER-CLAIM CODE ANCHORS ON A DECISION — the grounded-claim binding (ADR-0424).
 *
 * `grounded-decisions-arc` increment 01.
 *
 * ADR-0139 requires every accepted decision to be TRUE IN FULL, and nothing mechanical held that
 * obligation: a decision whose supporting code moved renders green, reports `accepted`, and appears
 * in `adr list --current`, which is exactly what a new session calibrates to. ADR-0324's curation
 * trigger fires on curated PATHS, and its own Consequences name the case it cannot see — code that
 * falsifies a decision's prose without touching one. This field is what a later sweep reads to
 * answer that question mechanically.
 *
 * ## THE SHAPE IS DERIVED FROM ADR-0016's ANCHOR, NOT COPIED FROM IT
 *
 * {@link Anchor} in `@storytree/proof-protocol` IS the re-anchorable binding from a proof-or-
 * knowledge unit to a span of code — its own docstring already reads "proof/**knowledge** unit", and
 * this is the knowledge half finally arriving. So {@link DecisionSource} EXTENDS it rather than
 * restating its fields, and the consequence is the point: a BOUND entry is structurally an `Anchor`,
 * so the drift compute that reads these can be typed on the published shape with no adapter and no
 * second copy of the field list to keep in step. `sources-are-anchors` in the suite pins that, so if
 * the two ever diverge a test says so rather than a caller discovering it.
 *
 * The extension is deliberately small: one added field, one relaxed.
 *
 * ## `boundHash` IS OPTIONAL HERE, AND THAT IS ADR-0424 D2 LANDING
 *
 * `Anchor` requires it, correctly — a binding with no content hash cannot detect drift. A DECISION's
 * anchor has a state that a proof's does not: ADR-0424 D2 binds at the GREEN FLIP, so a decision
 * that is still `proposed` carries anchor IDENTITIES with nothing bound to them yet. That is not a
 * degraded anchor; it is the only honest representation of "an author has said which code this claim
 * rests on, and the truth obligation has not attached yet". Folding the two states together would
 * mean either refusing to record an identity before acceptance, or minting a hash at a moment the
 * decision was not yet claiming anything.
 *
 * Read it as a THREE-state field and never as a boolean: absent `sources` = never bound; an entry
 * without `boundHash` = declared, unbound; an entry with one = bound and comparable.
 *
 * ## `claim` IS A LABEL, NOT A MINTED IDENTITY
 *
 * Clause identity does not exist in this system, and ADR-0428 D3 already recorded that minting it is
 * the largest and least reversible build available here. So `claim` is a free string an author
 * writes — `"D7"`, `"the second paragraph of Context"` — carried verbatim and never resolved. It is
 * OPTIONAL, and absent means the anchor grounds the whole record, which mirrors
 * `ComposedStatementFields.scope` on the sibling field exactly. The two conventions are kept
 * identical on purpose: the day clause identity IS minted, both fields must move, and they should
 * move the same way.
 *
 * NO UNIQUENESS REFINEMENT, and that is where this parts company with `composed`. Two composed
 * statements at one scope are rivals — only one can be the position. Two anchors on one claim are
 * ordinary: a claim routinely rests on several spans, and the sweep reports each.
 *
 * ## WHAT IS DELIBERATELY NOT HERE
 *
 * NO GROUNDED-SHARE COMPUTE, and its absence is load-bearing rather than pending (ADR-0424 D4). Most
 * accepted decisions have no code span to point at — decisions about escalation, register,
 * ownership, who decides — so the share is low and permanently so. If it were ever measured as a
 * target, authors would attach spans to satisfy the number and we would have built a green check
 * that verified nothing, on purpose. **A low grounded share is not a finding.** The instrument
 * speaks about claims that carry an anchor and stays silent about the rest.
 *
 * NO SWEEP AND NO BINDING VERB. This module makes the binding REPRESENTABLE; reading it is
 * `grounded-decisions-arc-inc-02` and writing it is inc-03. What lives here is the shape and the
 * defensive readers a live-corpus caller needs.
 *
 * Pure and browser-safe: no `node:` import, no filesystem, no store, no clock. Hashing a span needs
 * a repository checkout and therefore cannot happen here — which is also why the module can say
 * nothing about WHEN a hash is taken.
 */

/**
 * One code span a decision's claim rests on.
 *
 * IDENTITY (`file` + optional `symbol` + optional `quote`) and VERSION (`boundHash` + optional
 * `boundCommit`) stay distinct, inherited from {@link Anchor} — re-anchoring moves the version
 * without touching the identity, which is the whole reason ADR-0016 split them.
 */
export const DecisionSource = Anchor.extend({
  /**
   * WHICH claim of the decision this span grounds — a free label, absent for the whole record.
   * See the header: labels, never resolved identities.
   */
  claim: z.string().min(1).optional(),
  /**
   * The span's content hash, frozen at the green flip. ABSENT means declared-but-unbound — see the
   * header for why that state has to be representable.
   */
  boundHash: z.string().min(1).optional(),
});
export type DecisionSource = z.infer<typeof DecisionSource>;

/** A decision's whole anchor list. Ordinary array — no uniqueness rule; see the header. */
export const DecisionSources = z.array(DecisionSource);
export type DecisionSources = z.infer<typeof DecisionSources>;

/**
 * True when a BOUND hash was frozen onto this anchor — the only entries a drift sweep may read.
 *
 * A predicate rather than an inline `!== undefined` at each call site, because the three-state rule
 * in the header is the kind that gets flattened to a truthiness test by the second reader.
 */
export function isBoundSource(source: DecisionSource): boolean {
  return source.boundHash !== undefined;
}

/**
 * True when the stored payload CARRIES the anchor list — as distinct from carrying an empty one.
 *
 * KEY PRESENCE, never non-emptiness, and this is the load-bearing half of the field (ADR-0223's
 * optional-not-defaulted rule, the same one `hasDependsOnKey` keeps next door). Absent means nobody
 * has ever grounded this decision; `[]` means somebody looked and this decision grounds nothing.
 * Collapsing the two is what silently decremented a denominator in the `dependsOn` work — a reader
 * that counts "decisions carrying the field" cannot otherwise tell its own blindness from a real
 * absence.
 */
export function hasSourcesKey(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return Array.isArray((payload as Record<string, unknown>)["sources"]);
}

/**
 * Read a stored doc's anchors.
 *
 * TOTAL over untrusted input, the `readDependsOnPointers` posture next door and for its reason: this
 * runs over the LIVE corpus, so a row written by a branch whose schema this checkout does not carry
 * must project as "no anchors" rather than throw. A malformed doc is refused at the WRITE boundary
 * (`validateLibraryDoc`); a read-side surprise must never be where a fail-closed sweep goes down,
 * because that failure looks identical to a real finding.
 *
 * Entries that do not satisfy the shape are DROPPED rather than repaired — a half-read anchor would
 * be compared against a span it may not name.
 */
export function readDecisionSources(payload: unknown): DecisionSource[] {
  if (typeof payload !== "object" || payload === null) return [];
  const raw = (payload as Record<string, unknown>)["sources"];
  if (!Array.isArray(raw)) return [];
  const out: DecisionSource[] = [];
  for (const entry of raw) {
    const parsed = DecisionSource.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
