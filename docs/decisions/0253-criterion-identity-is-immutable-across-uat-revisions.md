---
status: proposed
arc: verification-integrity-arc
---
# ADR-0253: Criterion identity is immutable across UAT revisions

## Status

proposed (2026-07-27) — a criterion-identity preflight found a concrete collision in the
positional UAT key. This records the safety conditions and viable design forks before any data or
runtime migration. The owner has **not** selected the identity representation, revision anchor,
migration policy, or cutover; this ADR therefore authorises none of them.

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

**Proposed safety contract — not a selected implementation.** Any migration away from positional
criterion keys must satisfy all of the following. The owner chooses the concrete model and migration
after reviewing the alternatives below.

1. **A criterion has an immutable identity independent of its list position.** Reordering or
   renumbering must not make one criterion become another. A new, split, merged, or materially
   re-written claim gets a new identity unless an explicit continuity decision says otherwise.
2. **Evidence binds an identity to the revision it proved.** A verdict or attestation must carry, or
   resolve through an immutable record to, both the criterion identity and a revision/binding anchor
   for the precise criterion text/meaning in force when it was signed. The anchor's exact shape
   (revision id, canonical-content hash, or another versioned binding) is deliberately open; it must
   be able to distinguish an old claim from a changed one.
3. **Every legacy positional key receives an explicit disposition.** A migration record must say one
   of: (a) **mapped**, with a reviewed one-to-one target identity and the applicable historical
   revision/binding; (b) **superseded**, meaning the old claim has been replaced and its evidence
   stays historical only; or (c) **unresolved**, meaning continuity is unknown. No default map by
   ordinal, heading, title, or current parser output is allowed.
4. **Unresolved and superseded history earns no current proof credit.** It remains visible and
   attributable as history, but cannot make a current criterion healthy, satisfy a witness
   requirement, or pre-fill an attestation. A current criterion without a verified mapped proof
   requires a fresh machine run or a fresh human attestation for its current revision.
5. **A dual-read bridge, if one is selected, follows the new model rather than substituting for it.**
   First create the immutable identity, revision/binding, and explicit legacy-disposition model;
   then a read path may show old and new evidence together. During that bridge it must resolve only
   recorded mappings and must visibly retain superseded/unresolved state. It must never silently
   treat a legacy `<story>#uat-<n>` row as a current verdict or attestation. Legacy retirement is a
   later, separately verified step.

### Alternatives for owner decision

| Candidate | Shape | Strength | Cost / unresolved trade-off |
| --- | --- | --- | --- |
| A. Authored opaque criterion id in story Markdown | Each numbered item declares a generated immutable id; its normalized criterion revision is separately anchored. | Identity travels with the human-readable source and survives reorder. | Authors must preserve ids; the parser and story-authoring surface must validate them. |
| B. Structured criterion records as canonical source | Story prose renders records containing id, text, witness, revision, and bindings. | Makes identity and revision first-class typed data with strong write-time validation. | Larger authoring and corpus migration; changes the current Markdown-first source boundary. |
| C. External identity/revision registry keyed from a story anchor | Markdown remains mostly prose; a registry holds immutable ids, revision bindings, and the legacy disposition ledger. | Can minimise visible story syntax and support a review workflow. | Adds a second source that must be atomically maintained and made inspectable; drift risk is material. |
| D. Content-derived identity | Canonicalized criterion content (possibly plus a semantic scope) produces the identity or revision key. | Cheap deduplication and clear change detection. | Cannot represent continuity through wording edits or distinguish intentionally similar criteria without extra policy; content alone is insufficient for human-proof lineage. |

These candidates can be combined — for example, an authored opaque id with a canonical-content
revision hash and an external migration ledger. This ADR does **not** choose among them, does not
decide whether old event rows are rewritten or projected through a mapping, and does not approve
any automatic classification of history.

## Consequences

**If accepted and implemented:** the system can distinguish “the same criterion, revised” from “a
different criterion now occupying this ordinal,” while retaining historical proof without laundering
it into current credit. Reordering a story becomes safe because it no longer changes criterion
identity.

**Cost:** every proof read and write becomes more explicit about criterion identity and revision;
migration needs a reviewed ledger and an honest unresolved path. Some presently green or attested
positional rows will correctly stop counting until they are mapped with evidence or re-proven.

**Non-consequence:** this proposal does not change current runtime behaviour, store schema, event
history, UI, story prose, seed data, or verdict status. The app-surface increment independently
reconciled its own criterion and signed state as recorded above; that instance being current again
does not resolve the general positional-identity defect or ratify any migration alternative.

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
