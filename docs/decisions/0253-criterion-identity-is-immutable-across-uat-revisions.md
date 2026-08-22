---
status: accepted
decided: 2026-08-02
arc: verification-integrity-arc
---
# ADR-0253: Criterion identity is immutable across UAT revisions

## Status

accepted (2026-08-02) — the criterion-identity preflight found a concrete collision in the
positional UAT key, and the owner selected the identity and lineage model in conversation on
2026-08-02: an authored opaque criterion id, a linked sequence of immutable content-bound revisions,
evidence bound to the exact identity-plus-revision pair, and an explicit legacy-disposition ledger.
Owner direction in conversation IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The proof model gives each UAT criterion a separately addressable proof unit. Today that unit is
derived from its position in Markdown: `<story>#uat-<n>`. Verdicts and attestations persist against
that string. It is deterministic for unchanged text, but it is not an identity for the criterion's
meaning: inserting, removing, splitting, merging, or reordering a list item can make the same key
name different acceptance work.

The collision is documented, not hypothetical. `app-surface#uat-4` received an operator-attested
failure at commit `9377e897` against a seven-leg version of the story whose fourth leg combined the
shared scene with the six-state semantic-growth walk. Main then carried a four-leg version whose
narrower fourth leg reused the same positional id, so the store displayed that failure against a
criterion the operator had not walked. That interval demonstrated the defect: an ordinal says where
a criterion sits in one rendering of a story; it cannot establish continuity across revisions.

**Correction (2026-07-27, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
the concrete app-surface collision is historical, not current.** The accepted app-surface increment
restored the seven-leg/four-gate story shape, and the live verdict log now ends with an
operator-attested `pass` for `app-surface#uat-4` at commit `52ffee9e`, after the earlier failures.
The current UAT projection therefore reads that criterion as proven. This reconciliation does not
choose or implement any identity model proposed below; it only corrects the overtaken claim that
the narrower four-leg criterion is still current. The historical interval remains the evidence that
positional identity can misattribute proof when revisions diverge.

This is proof provenance, not presentation polish. A signed verdict says that a specified witness
proved a specified criterion; a human attestation says that a specified person observed a specified
criterion. Reusing either after the criterion's meaning changes would turn historical evidence into
evidence for a different claim. ADR-0016 already separates an anchor's identity (what) from its
version (when); the UAT proof key needs the same separation.

The migration also has real history to preserve. Existing events are keyed only by the positional
form, so some old rows may be safely connected to a new identity only after an explicit review,
while others are known supersessions or cannot honestly be resolved. A title match, a current
ordinal, or a best-effort parser reconstruction is not that review.

## Decision

**Selected model — authored identity, linked revisions, explicit migration ledger.** The Markdown
criterion remains the human-readable source, but its identity is no longer derived from its list
position. Each criterion carries an authored opaque id. Its meaning advances through immutable
revision records linked by `previousRevisionId`, and proof names the exact revision it observed.

1. **A criterion has an immutable identity independent of its list position.** Reordering or
   renumbering must not make one criterion become another. A wording or meaning revision of the same
   acceptance claim keeps the identity and advances its revision chain; new, split, merged, or
   replacement acceptance work gets a new identity with explicit lineage where applicable.
2. **A criterion's revisions form a linked sequence.** The first revision has no predecessor; each
   later revision carries its own immutable, content-bound `revisionId` and points to the immediately
   preceding revision through `previousRevisionId`. Reordering or renumbering alone creates no new
   revision. A material change to the acceptance meaning creates a new revision on the same identity.
   Split, merged, or genuinely new acceptance work receives a new criterion identity; explicit
   lineage edges may relate those identities, but they do not splice different claims into one
   revision chain.
3. **Evidence binds an identity to the exact revision it proved.** A verdict or attestation must carry,
   or resolve through an immutable record to, both `criterionId` and `revisionId` for the precise
   criterion meaning in force when it was signed. Evidence on an earlier revision remains attributable
   history and never silently advances to the current head.
4. **Every legacy positional key receives an explicit disposition.** A migration record must say one
   of: (a) **mapped**, with a reviewed one-to-one target identity and the applicable historical
   revision/binding; (b) **superseded**, meaning the old claim has been replaced and its evidence
   stays historical only; or (c) **unresolved**, meaning continuity is unknown. No default map by
   ordinal, heading, title, or current parser output is allowed.
5. **Unresolved and superseded history earns no current proof credit.** It remains visible and
   attributable as history, but cannot make a current criterion healthy, satisfy a witness
   requirement, or pre-fill an attestation. A current criterion without a verified mapped proof
   requires a fresh machine run or a fresh human attestation for its current revision.
6. **Migration projects immutable history through the ledger; it does not rewrite old events.** First
   create the immutable identity, linked revision records, and explicit legacy dispositions. A
   dual-read path may then show legacy and new evidence together, but it resolves only reviewed
   mappings and visibly retains superseded/unresolved state. It must never silently treat a legacy
   `<story>#uat-<n>` row as a current verdict or attestation. Retiring the legacy read path is a later,
   separately verified cutover after every positional row has a disposition.

### Alternatives considered

| Candidate | Shape | Strength | Cost / unresolved trade-off |
| --- | --- | --- | --- |
| A. Authored opaque criterion id in story Markdown | Each numbered item declares a generated immutable id; its normalized criterion revision is separately anchored. | Identity travels with the human-readable source and survives reorder. | Authors must preserve ids; the parser and story-authoring surface must validate them. |
| B. Structured criterion records as canonical source | Story prose renders records containing id, text, witness, revision, and bindings. | Makes identity and revision first-class typed data with strong write-time validation. | Larger authoring and corpus migration; changes the current Markdown-first source boundary. |
| C. External identity/revision registry keyed from a story anchor | Markdown remains mostly prose; a registry holds immutable ids, revision bindings, and the legacy disposition ledger. | Can minimise visible story syntax and support a review workflow. | Adds a second source that must be atomically maintained and made inspectable; drift risk is material. |
| D. Content-derived identity | Canonicalized criterion content (possibly plus a semantic scope) produces the identity or revision key. | Cheap deduplication and clear change detection. | Cannot represent continuity through wording edits or distinguish intentionally similar criteria without extra policy; content alone is insufficient for human-proof lineage. |

**Selected: A, combined with a linked content-bound revision record and a migration-only ledger.**
The ledger is not a second canonical identity source: authored Markdown owns `criterionId`; immutable
revision records own the linked history; the ledger owns only the reviewed disposition of legacy
positional evidence. B was rejected as a larger canonical-source migration, C as an ongoing second
identity source with drift risk, and D as insufficient to represent continuity through wording edits
or intentionally similar criteria. No history is classified automatically.

## Consequences

**Good.** Once implemented, the system can distinguish “the same criterion, revised” from “a
different criterion now occupying this ordinal,” while retaining historical proof without laundering
it into current credit. Reordering a story becomes safe **for criterion identity**, because it no
longer changes `criterionId` or the content-bound revision.

*(Qualifier added in place 2026-08-22 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
This sentence read "Reordering a story becomes safe because it no longer changes criterion identity",
and the unqualified form was read as a general licence: the 2026-08-03 ADR-0294 D2 pass deleted legs
and renumbered the surviving legs DOWN to close the gaps, on the explicit stated grounds that a list
position is not identity. That is true of identity and false of the migration LEDGER this same
decision froze as a positional record. A `superseded` `<story>#uat-N` key denotes the DELETED
criterion permanently, so a survivor moved onto `N` makes one frozen key denote two criteria at once
— and because identity really is unchanged, every rung that reads identity stays green while it
does. Six such collisions were found across five stories and repaired (`studio-cloud` by reading, on
2026-08-20; `agent`, `cli`, `drive-machinery` ×2 and `proof-binding-integrity` by measurement, on
2026-08-22). **A deleted criterion's ordinal is spent: leave the gap.**
`packages/library/src/burned-ordinal-collision.ts` now enforces it, so the rule no longer depends on
a reader noticing a stale cross-reference. The DECISION is unchanged — authored `criterionId` owns
identity, and the ledger owns only the reviewed disposition of legacy positional evidence, exactly as
the Decision section above states.)*

**Cost:** every proof read and write becomes more explicit about criterion identity and revision;
migration needs a reviewed ledger and an honest unresolved path. Some presently green or attested
positional rows will correctly stop counting until they are mapped with evidence or re-proven.

**Non-consequence:** this decision does not itself change current runtime behaviour, store schema, event
history, UI, story prose, seed data, or verdict status. The app-surface increment independently
reconciled its own criterion and signed state as recorded above; that instance being current again
does not implement the general positional-identity decision recorded here.

## References

- [ADR-0044](0044-per-uat-test-human-attestation.md) — per-criterion attestation, currently keyed
  by `<story>#uat-<n>`.
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) — per-criterion
  signed verdicts and story roll-up; the provenance this proposal protects.
- [ADR-0016](0016-knowledge-code-binding-and-staleness.md) — identity separated from a versioned
  binding anchor.
- [ADR-0206](0206-rename-story-level-uat-tests-to-uat-test-criteria.md) — current criterion
  vocabulary.
- [`stories/app-surface/story.md`](../../stories/app-surface/story.md) — the current seven-leg
  app-surface criterion set whose fourth leg is proven by the latest signed verdict.
- [`packages/library/src/uat-test-criteria.ts`](../../packages/library/src/uat-test-criteria.ts) —
  current positional id derivation; reference only, not changed here.
