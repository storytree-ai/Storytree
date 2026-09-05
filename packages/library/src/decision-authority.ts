import { z } from "zod";

/**
 * ADR-0519's AUTHORITY STAMP — whose call a decision was, as a fact rather than as prose.
 *
 * ## The question this exists to answer, and why nothing already answered it
 *
 * A decision record has always said WHEN it was decided (`decided`, an ISO date) and never WHO. The
 * answer lived in the opening of each `## Status` section, written by an agent: measured across 509
 * rows on 2026-09-05, 277 carried the stock `adr new --decided` phrase, 154 named the owner in the
 * author's own words, 21 recorded an ADR-0084 agent flip, 8 named an agent, and 49 named nobody at
 * all. Nothing could query it and no `check:adr-health` gate asked.
 *
 * ⚠ WRITE ATTRIBUTION IS NOT A SUBSTITUTE, AND THAT IS STRUCTURAL. `events.library_event` stamps an
 * `actor` on every write, so `library artifact history` can say which session typed a field. But
 * across 3,966 decision write events by 144 distinct actors, NOT ONE is a human — 2,418 are the
 * migration's `system` actor and the rest are `cli@<branch>` sessions. The owner has never written a
 * decision row and never will, because an agent always types it. "Which session wrote these bytes"
 * and "whose call was this" are different questions, and the store could only ever answer the first.
 *
 * ## Why this is a ROW-ONLY field, and what each omission buys
 *
 * `composed` (ADR-0428) and `sources` (ADR-0424) established the pattern and ADR-0424 D6 gives the
 * reason this one copies: EVIDENCE A HAND-EDIT CAN REWRITE IS NOT EVIDENCE. So this field is on the
 * schema and is written by exactly one writer, and is deliberately ABSENT from `FRONTMATTER_ORDER`,
 * `parseAdrDocument`/`renderAdrDocument`, `AdrMeta`, and `adrPush`'s named-field spread:
 *
 * - Out of `FRONTMATTER_ORDER` — which is also the known-key set — is what makes `adr push` REFUSE a
 *   document carrying an `authority:` key, loudly, instead of dropping it at exit 0.
 * - Out of `adrPush`'s named spread is the FENCE: the spread carries the stored value through
 *   untouched, so correcting a decision's PROSE cannot rewrite who decided it. That is the whole
 *   point — the standing instruction to correct accepted prose in place (ADR-0139) has no carve-out
 *   for a clause recording an owner directive, and this field is what puts the stamp out of its
 *   reach.
 *
 * ONE WAY IT DIFFERS FROM BOTH SIBLINGS: `composed` and `sources` are written by their own verbs
 * AFTER creation; `authority` is set AT creation, so `scaffoldRow` is its single writer. Still
 * exactly one writer, and the row-only property is unchanged. Do NOT wire the other three.
 *
 * ## The vocabulary is borrowed, deliberately, from one tier down
 *
 * `Attestation` (`packages/proof-protocol/src/attestations.ts`, ADR-0044 d.2) already carries
 * `witness: human | machine`, a fail-closed non-blank `signer`, and `relayedBy` — "the agent/session
 * that SCRIBED a relayed human attestation". The tier that proves CODE works has been strict about
 * human-versus-machine provenance all along; the decision tier, which is what every session
 * calibrates its worldview on, was not. {@link DecisionAuthority.scribedBy} is that `relayedBy`
 * concept, and the rename is not an inconsistency: on an attestation an ABSENT `relayedBy` means
 * "direct or machine", whereas a decision's scribe is never absent. Different semantics, different
 * name.
 */

/** A non-blank, trimmed string — the fail-closed shape `Attestation.signer` uses (ADR-0044 d.2). */
const nonBlank = z.string().refine((s) => s.trim().length > 0, {
  message: "must be a non-blank string (fail-closed)",
});

/**
 * WHOSE call the decision was (ADR-0519 D1).
 *
 * The two owner values differ by who moved first: `owner-directed` is the owner saying *do X*
 * unprompted (ADR-0110's path, where design-time alignment IS the ratification); `owner-ratified` is
 * the owner approving something put to him. `agent-derived` is the honest default — an agent reached
 * this and the owner has not weighed in. `agent-flipped` is ADR-0084's transcription: an agent
 * judged the evidence supported accepting a `proposed` record.
 *
 * ⚠ `agent-derived` IS THE CHEAPEST VALUE TO DECLARE, AND THAT IS THE DESIGN. ADR-0519 D4 turns on
 * it: the health rung asks only whether a basis is DECLARED, never whether it is TRUE, and a rung
 * whose lazy path is the WEAKER claim cannot manufacture false confidence. That is what separates it
 * from the presence check ADR-0427 deleted and refuses to have rebuilt.
 */
export const AuthorityBasis = z.enum(["owner-directed", "owner-ratified", "agent-derived", "agent-flipped"]);
export type AuthorityBasis = z.infer<typeof AuthorityBasis>;

/** True for the two bases that CLAIM the owner's authority — the ones that owe his words. */
export function isOwnerBasis(basis: AuthorityBasis): boolean {
  return basis === "owner-directed" || basis === "owner-ratified";
}

/**
 * One decision's authority stamp. `.strict()`, so an unknown key fails closed rather than riding
 * along unread.
 */
export const DecisionAuthority = z
  .object({
    /** Whose call it was. */
    basis: AuthorityBasis,
    /**
     * The session that WROTE the record — always present, because one always did. This is the
     * honest half: it is the only field here nobody has to be trusted about, since the store
     * observes it independently in `events.library_event.actor`.
     */
    scribedBy: nonBlank,
    /**
     * When the stamp was applied, ISO — a `YYYY-MM-DD` date from the composition root's injected
     * clock in practice, which is the same clock the record's `decided` date comes from. Kept a
     * plain string rather than a date shape so a backfill can record a coarser or a fuller value
     * without the schema pretending to a precision it did not have.
     */
    at: z.string(),
    /**
     * The owner's VERBATIM directive — his words, never a paraphrase or a summary (ADR-0519 D3).
     *
     * This is the half that does real work. A quote is materially harder to fabricate than a flag is
     * to pass, and more importantly it hands a later reader the EVIDENCE rather than a conclusion
     * about it, so they can weigh what was actually said against what the record claims it meant. A
     * paraphrase stored here is a defect, not a lesser filling of the field.
     */
    ownerSaid: nonBlank.optional(),
    /**
     * Set ONLY by ADR-0519 D5's backfill: this stamp was read off the record's own `## Status`
     * prose, and no owner words were ever captured.
     *
     * `z.literal(true)` rather than a boolean on purpose — `false` is unrepresentable, so absent is
     * the only "no" and the absent/false ambiguity cannot arise. A stamp carrying it is a
     * TRANSCRIPTION of an existing agent-written claim, NOT a verification of one, and the two must
     * stay separable by query: it is what lets a reader discount the 298 mechanically-classifiable
     * rows without discounting the records authored under D1.
     */
    transcribedFromProse: z.literal(true).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // AN OWNER BASIS OWES THE OWNER'S WORDS. This is D3 made unrepresentable-otherwise rather than
    // merely asked for: an agent cannot claim the owner's authority without producing what he said.
    // Where there is no quotable directive, the honest basis is `agent-derived` — which is exactly
    // the judgment this refusal is meant to force, so do NOT relax it by making the message
    // suggest inventing a quote.
    if (isOwnerBasis(value.basis) && value.ownerSaid === undefined && value.transcribedFromProse !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerSaid"],
        message:
          `a '${value.basis}' stamp must quote the owner verbatim in ownerSaid (ADR-0519 D3). ` +
          `If there is no directive to quote, the honest basis is 'agent-derived'.`,
      });
    }
    // AN AGENT BASIS MAY NOT CARRY OWNER WORDS. The field is the EVIDENCE for an owner-authority
    // claim; on `agent-derived` / `agent-flipped` it asserts nothing and invites exactly the
    // confusion the stamp exists to remove — a reader skimming for the owner's voice would find a
    // quote sitting on a decision the owner never made. If his words are worth keeping beside an
    // agent's decision, they belong in the record's own prose, where they read as context rather
    // than as authority.
    if (!isOwnerBasis(value.basis) && value.ownerSaid !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerSaid"],
        message:
          `ownerSaid is the evidence for an OWNER basis and is meaningless on '${value.basis}'. ` +
          `Either the owner's words settled this — in which case the basis is 'owner-directed' or ` +
          `'owner-ratified' — or they are context and belong in the decision's prose.`,
      });
    }
    // THE BACKFILL'S OWN FENCE (D5): a stamp read off prose has no captured owner words, so carrying
    // both states would be claiming evidence that was reconstructed from an agent's summary —
    // forging precisely the thing this field exists to make trustworthy.
    if (value.transcribedFromProse === true && value.ownerSaid !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerSaid"],
        message:
          "a stamp transcribed from prose has no captured owner words; ownerSaid must be absent " +
          "(ADR-0519 D5 — reconstructing it from an agent's summary forges the evidence).",
      });
    }
    // Only an OWNER basis can be transcribed from owner-claiming prose. An `agent-derived` or
    // `agent-flipped` stamp needs no transcription marker, and one there would be noise a later
    // filter has to special-case.
    if (value.transcribedFromProse === true && !isOwnerBasis(value.basis)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transcribedFromProse"],
        message: `transcribedFromProse marks a backfilled OWNER claim; it is meaningless on '${value.basis}'.`,
      });
    }
  });
export type DecisionAuthority = z.infer<typeof DecisionAuthority>;

/**
 * True when this stamp claims the owner's authority AND carries his words to back it.
 *
 * A predicate rather than an inline test at each call site, for the reason `isBoundSource` next door
 * is one: the three-way distinction (no stamp / a transcribed owner claim / a quoted owner
 * directive) is the kind a second reader flattens into a truthiness test, and flattening it here
 * would silently promote the 298 backfilled rows into the same class as a record authored with the
 * owner in the room.
 */
export function hasQuotedOwnerDirective(authority: DecisionAuthority | undefined): boolean {
  return authority !== undefined && isOwnerBasis(authority.basis) && authority.ownerSaid !== undefined;
}
