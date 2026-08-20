---
status: accepted
decided: 2026-08-21
arc: uat-journey-surgery-arc
amends: [294]
---
# ADR-0396: A retired story's UAT criteria are deleted with their ordinals burned — the body keeps the history, the criteria keep no obligation

## Status

accepted (2026-08-21) — a **story-author disposition**, made at the tier that owns what a story's
spec IS (ADR-0002 / ADR-0010), not an owner fork and not a claim conflict. The corpus routed it here
explicitly and had been carrying a promissory note against it: `stories/chat-subagent-spawn/story.md`
leg 5's triage record read *"Whether a retired story's UAT legs should be DELETED (ordinals burned, as
ADR-0348 D6 did for experience legs) or kept verbatim as history is a story-author / librarian
disposition call, deliberately not made here — and it reaches leg 6 the same way"*, and
`stories/chat-drive-bridge/story.md` leg 5 carried the same sentence. Both notes are corrected in
place by the same change that lands this ADR (ADR-0139), so no reader is left pointed at a question
that has since been answered. Born `proposed` by `adr new` and flipped here (ADR-0084's green flip):
the decision is made and the prose below supports it. Nothing in it is reversible only by an owner —
git holds every deleted leg verbatim, and the frozen ledger holds each one's key.

## Context

**The question.** Five stories carry `status: retired` and, between them, 29 UAT criteria: 
`scoped-glue-actuator` (6), `chat-subagent-spawn` (7), `chat-drive-bridge` (5),
`headless-orchestrator` (5), `spawn-visibility` (6). Each was authored as a step in that story's
acceptance walkthrough; each story then had its journey withdrawn by a later decision — ADR-0155
(`chat-drive-bridge`), ADR-0174 + ADR-0175 (`chat-subagent-spawn`, `spawn-visibility`,
`scoped-glue-actuator`) and the `app-guide` substrate move (`headless-orchestrator`). The criteria
stayed. Nobody had decided whether they should.

**Why nobody could decide it in passing.** Two increments of `uat-journey-surgery-arc` reach these
criteria — the unbound-machine-leg pass owns 21 of them and the bound-duplicative recut owns 4 more —
and neither may resolve them, because the question underneath is not an ADR-0294 adjudication. ADR-0294
asks *does this criterion's proof already exist one rung down?* That question has an answer for a live
story. On a retired story it is the wrong question: the issue is not where the proof lives, it is that
there is no longer an outcome for a proof to be OF.

**What a retired story already does with its body.** Every one of the five retires **in place**: the
frontmatter and the opening blockquote say so in the same words — *"retired in place (the
`chat-drive-bridge` / `scoped-glue-actuator` precedent): the body below is kept as history."* So the
convention for a retired story's PROSE is settled and is not in question here. What was never settled
is whether the `## UAT Test Criteria` list is part of that prose.

**It is not, and that is the whole decision.** A UAT criterion is not a paragraph that happens to sit
in a story file. It is a parsed, identified, counted, gate-visible OBLIGATION: `parseUatTestCriteria`
reads it, `storytree uat census` counts it, `storytree uat list` prints it with a `proven` column,
`resolveWitness` resolves it, the ADR-0085 own-proof union folds it into the story's crown, and
`storytree uat attest` offers to sign it. None of those instruments filters on `status: retired` —
`readCorpusStoryDocs` walks every `stories/*/` directory — so a retired story's criteria are, to every
one of them, indistinguishable from live ones. Measured 2026-08-21, the corpus held **170** criteria
across 35 stories; **29 of them (17%)** were these, standing against journeys that were withdrawn
between one and two months ago. They sit inside the number this arc measures against ADR-0294 D5's
~60 marker, so the arc's own headline is mixing two populations.

**The risk that would have made this hard is absent.** All 29 are `proven=–`: no signed verdict in
`events.verdict` names any of their `criterionId`s, and `events.attestation` holds no
`scoped-glue-actuator#uat-*` / `chat-subagent-spawn#uat-*` / `chat-drive-bridge#uat-*` /
`headless-orchestrator#uat-*` / `spawn-visibility#uat-*` row. Verified per story with
`storytree uat list <story> --pg`. So no proof is destroyed and no green is lost whichever way this
falls, which is what makes it a disposition rather than an owner call.

**Half the convention was already settled locally, in this exact shape.** ADR-0348 D6 deleted
`spawn-visibility` leg 5 and `chat-drive-bridge` leg 6 — both on already-retired stories — burning
their ordinals and carrying the dying leg's design intent up into a named prose section above the
list (`### The spawn line's legibility`, `### The accept-and-watch feel`). PR #1214 burned deleted
ordinals and left survivors' numbering alone. ADR-0307 D5 supersedes a criterion whose SUBJECT is
withdrawn rather than whose proof moved, and `packages/library/src/corpus-criterion-migration.test.ts`
already accepts *"retired"* as an honest ledger rationale for exactly that. What was missing was not a
mechanism; it was a ruling on whether being on a retired story is itself sufficient ground.

## Decision

**D1 — A retired story's UAT criteria are DELETED.** When a story reaches `status: retired`, every
criterion under its `## UAT Test Criteria` heading is deleted in the same change, or in the first
change that notices the omission. A criterion is a standing acceptance obligation against a story's
outcome; a retired story has withdrawn its outcome, so the obligation is against a journey nobody will
run and no instrument will ever discharge. A story may declare zero criteria (ADR-0294 D5) and greens
honestly on the ADR-0085 own-proof union, so deleting the last one costs nothing structural.

**D2 — The ordinals are BURNED, never renumbered.** This restates the corpus convention (PR #1214,
ADR-0348 D6, ADR-0307 D5) rather than inventing one. Renumbering re-points signed verdicts and
surviving `(proof-gate:)` bindings onto different criteria, silently. When a whole story's list goes,
every one of its ordinals is burned — so no positional `<story>#uat-<n>` key can ever denote a second
criterion for that story.

**D3 — The history goes into the BODY, in the same change.** Anything load-bearing that a dying leg
carried — a scope note recording which cited code survived and which was deleted, a correction that
would otherwise have to be re-derived, an authored design intent — is moved into the story's prose
above the list before the leg goes. This is ADR-0348 D6's move generalised, and ADR-0139's
correct-in-place applied to a story file. The test is whether a later reader loses a fact by reading
the body instead of the leg; if they would, the fact was not carried.

**D4 — Every ordinal-citing sentence in the story is corrected in the same change.** Retired stories
are dense with *"leg 6 carries its full force"*, *"legs 5–6 are the composed surface run live"*,
*"UAT leg 1"* — in frontmatter comments, honest-proof-posture blocks, capability tables, reliability-gate
prose and per-leg triage records. A deletion that leaves those standing makes the body false, which is
the opposite of keeping it as history.

**D5 — The ledger entry is `superseded` on the RETIRED ground, not on a proving-node ground.** Each
deleted criterion's key in `stories/uat-legacy-dispositions.json` flips `unresolved → superseded` with
a rationale citing this ADR and stating that the claim was retired with its story. The ledger stays
frozen at 282 keys. This ground is deliberately NOT ADR-0294 D2's: D2 requires the deleting author to
name the lower-tier node that proves the claim, checked against that test's actual assertions. Demanding
that here would force 29 citations nobody verified, which is the honesty wall running backwards. The
migration check's `withdrawn|retired|no longer exists` branch exists for precisely this case
(ADR-0307 D5), and this decision uses it as the primary ground rather than as a fallback.

**D6 — Reliability gates are NOT deleted with the criteria that bound to them.** `reliabilityGateId`
mints `<story>#gate-<n>` from 1-based POSITION, so removing a gate renumbers every later gate and
silently re-points already-signed verdicts. When the criteria that carried a gate's `(proof-gate:)`
bindings die, the gate stays exactly where it is and the story says in prose that it is now unclaimed.

**D7 — The census is NOT taught to split active from retired, and that alternative is declined.**
The obvious rival answer was: keep the 29 as history and teach `storytree uat census` to report
active and retired separately. It is declined on two grounds. First, it leaves 29 standing obligations
in the corpus and merely hides them from one reader — `uat list` would still offer to attest them,
`resolveWitness` would still report them refused, and the crown would still fold them in. Second, it
mints a second answer to "how many criteria does this corpus have", which is the extra pathway
`one-way-to-do-things` refuses. Deletion answers the census question by removing its subject.

**The fence — D8: a criterion that HOLDS PROOF CREDIT is kept, and retirement does not remove it.**
If a criterion has a signed verdict in `events.verdict` against its `criterionId`, or a recorded
attestation, it is NOT deleted when its story retires. There the criterion is the anchor a real proof
points at, and deleting it leaves a signed record naming content the corpus no longer contains —
retiring a story withdraws a future obligation, it never unmakes a journey that actually ran. Such a
criterion stays in place, marked in prose as the historical record of a proof rather than a live
obligation. None of the 29 is in this state, which is exactly why the first application of this rule
is a safe one; the fence is stated now so the second application does not have to discover it.

## Consequences

**Applied immediately to all 29** in the change that lands this ADR: 29 criteria deleted across five
stories, 29 ledger keys flipped `unresolved → superseded` (the ledger still totals 282), 11 orphaned
live `uat-criterion` detail artifacts retired in the store (`chat-drive-bridge#uat-5`;
`chat-subagent-spawn#uat-5/6/7`; `headless-orchestrator#uat-4/5`; `scoped-glue-actuator#uat-5/6`;
`spawn-visibility#uat-4/6/7`), every ordinal-citing sentence corrected, and `spawn-visibility`'s three
reliability gates left standing and declared unclaimed. The corpus criterion total moves 170 → 141.

**The arc's headline number becomes honest.** ADR-0294 D5's ~60 marker was always meant to describe
live acceptance walkthroughs. It was being measured against a population 17% of which was retired
history. It now is not.

**A retirement gets more expensive, deliberately.** Retiring a story now costs a criteria pass, a
ledger pass, a detail-artifact pass and a citation sweep, rather than a `status:` flip. That is the
cost of the retirement being COMPLETE; the cheaper flip was only cheaper because it left the work for
someone who did not know it existed. Nothing gates this — `validateLegacyDispositionCoverage` is wired
into no check, and no instrument compares a retired story's criteria count to zero — so it is an
editorial obligation on whoever retires, in the same class as the ledger flip itself.

**What deletion does NOT do, and must not be read as doing.** It does not retire the code. Three of
the five stories had their subject code deleted under ADR-0175; `headless-orchestrator` did NOT — its
Phase-1 entry `storytree orchestrate "<intent>"` is live and reachable
(`packages/cli/src/commands.ts`), and the walls its legs asserted are still asserted one rung down by
the contracts `ots-write-verb-refused-at-surface`, `ots-exposes-exactly-the-read-surfaces`,
`oc-single-session-guard` and `hsr-refuses-concurrent-session`. Deleting the legs removes a retired
story's obligation, not a live wall. **If those walls deserve a standing STORY-tier acceptance claim,
that claim belongs to whichever LIVE story owns the substrate today — `app-guide`, per ADR-0175 — and
authoring it there is a separate story-author unit that this ADR deliberately does not perform.** It
is recorded here rather than left implicit so that a later reader does not mistake the silence for a
finding that no claim is owed.

**An open modeling call may be sitting on a deleted leg — check before deleting, never after.** A leg
deletion can silently resolve a question a story raised for the owner. Checked on all five: none of
the four `spawn-visibility` calls, none of the four `chat-subagent-spawn` calls, none of the four
`scoped-glue-actuator` calls and neither `headless-orchestrator` placement call is answered by any of
these deletions. `spawn-visibility` call 5 — *legs 6 and 7 are `machine` with no harness and no bound
gate* — NAMES two of the deleted legs, so it is corrected in place rather than left pointing at
absent ordinals; its finding (the hole was recorded, not closed, because the story is retired and its
composed path dormant) is unchanged by the deletion and survives on the call. `wisp-as-story-claim`'s
open call 1 — *does an owner attestation carry forward onto a changed leg?* — is untouched, because
no leg deleted here ever held an attestation to carry.

**The accepted risk.** Someone reading a retired story in six months will find its journey described
in prose and its acceptance steps absent, and will have to reach for `git log -p` to read the legs
verbatim. That is the same bargain ADR-0139 already struck for overtaken ADR prose — git is the
archive — and it is accepted for the same reason: a record that cannot be told apart from a live
obligation is worse than a record that costs one command to retrieve. The frozen ledger keeps every
key, so the retrieval always has a starting point.

## References

- [ADR-0294](0294-story-uat-is-a-journey-not-a-spec-criteria-that-duplicate-lo.md) — story UAT is a
  journey; D2's honesty wall (which this ADR deliberately does not stretch to cover retirement), and
  D5's zero-criteria allowance and ~60 marker. This ADR `amends` it by adding a second, distinct
  deletion ground that D2 does not describe.
- [ADR-0348](0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md) — D6, the precedent
  move: delete the leg, burn the ordinal, carry the intent into named prose above the list.
- [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) — D5, the precedent for
  superseding a criterion whose SUBJECT is withdrawn, and for retiring an orphaned `uat-criterion`
  detail artifact in the live store rather than deleting a seed file.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — correct in place;
  the basis for D4's citation sweep and for correcting the two promissory notes.
- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — the own-proof
  union (story green = all capabilities healthy AND the story's own-proof obligations discharged),
  under which a story with zero criteria greens honestly.
- [ADR-0357](0357-human-uat-witness-also-covers-surfaces-no-harness-owns-every.md) — the triage that
  found these legs MOOT and recorded that neither of ADR-0348's answers fits them, which is the
  reading this ADR completes.
- `stories/uat-legacy-dispositions.json` — the frozen 282-key positional ledger; and
  `packages/library/src/corpus-criterion-migration.test.ts`, the check that holds it frozen and reads
  the rationale.
- `storytree library artifact edit-story-uat-criteria` — the editing ceremony whose traps D2 and D6
  encode.
