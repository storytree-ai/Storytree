---
status: accepted
decided: 2026-08-21
arc: machine-verdict-approver-arc
amends: [97, 405]
---
# ADR-0408: A machine-witnessed acceptance leg carries no human approver; brownfield adoption still does

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21, answering the
escalation `oq-who-approves-a-machine-checked-acceptance-result` raised by
[ADR-0405](0405-the-machine-uat-signing-verb-already-exists-the-gap-is-bindi.md) D6. Design-time
alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask. Recorded 2026-08-22.

## Context

A signed verdict carries two names on two deliberately separate axes
([ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) d.4):

- **`signer`** — *"did it work?"* — the machine that watched the declared command exit 0 out-of-band.
  For an `adopted` verdict that is always `spine@storytree`, never a human and never a model.
- **`approvedBy`** — *"do we bring it in?"* — the human who decided to bring the unit into the fold.

`observeAndSign` (`packages/orchestrator/src/proof/observe-and-sign.ts`) required a resolved approver
on **every** call and failed closed without one, resolving it from `--signer` → `STORYTREE_SIGNER` →
git email. On the owner's dev box that chain resolves to his address whoever — or whatever — typed the
command.

**One command does two different jobs, and only one of them has a human decision in it.**

- **ADOPTING BROWNFIELD CODE.** Deciding that an existing, unproven suite is good enough to trust.
  Nothing is being *checked* here; risk is being *accepted*, on work the system did not produce.
- **RECORDING A MACHINE-CHECKED ACCEPTANCE LEG** on a story already in the fold, whose test was
  already declared and already bound to that exact journey. The machine watched a check the owner had
  already asked for, and it passed.

The second job had no human decision left in it, yet it wrote the owner's name into a field meaning
*"I decided to bring this in."* ADR-0405 D4 identified **65 legs across 12 stories** waiting to be
recorded; every one would have carried it. ADR-0405 D6 escalated rather than deciding.

**The owner's ruling, 2026-08-21, verbatim:**

> "no human should need to sign these, they done by a model. If they using my signature thats wrong
> but not the worse thing, maybe setup an arc to fix this."

and, on the other half, in the same message:

> "Adopting a code thats mapped should require some sort of human signature."

He also stated the general rule the first half is an instance of — *"machine in the loop is fine for
most surfaces, human in the loop is only required when the judgement is taste or models are not yet
capable to do it themselves"* — which this ADR applies to the approver field only. Wiring that general
principle into agent guidance is the rest of `machine-verdict-approver-arc`, not this decision.

**Why the fix is cheap.** `approvedBy` is already `z.string().optional()`
(`packages/proof-protocol/src/proof.ts`) and its one non-display reader
(`packages/cli/src/build-unit-status.ts`) already spreads it conditionally. No schema migration, no
expand/migrate/contract, no rename.

**A correction ADR-0405 D6 got wrong, worth not leaving on the record.** D6 argued that writing the
owner's address into `approvedBy` was *"the false-attribution shape ADR-0007 exists to prevent."* He
rejected that framing: *"this whole system has been designed by me and coded by AI using my intent,
I've been telling AI agents to stamp ADRs as approved along the way."* His name on a verdict is
**standing delegated authority** — the same basis on which an agent stamps an ADR `accepted` under
ADR-0110 — not an act he never performed. ADR-0007 governs an agent VOUCHING FOR ITS OWN WORK; it does
not govern an agent recording a decision the owner has already delegated. This decision therefore
rests on the ruling that the field should not DEMAND a human at all — **not** on any claim that his
name there was a lie.

## Decision

**D1 — ADR-0097 d.4 is NARROWED to the brownfield adoption decision it was written for.** Its
*"The adoption **decision** is a separate human act, always required to enter the process"* binds the
act of adopting an unproven suite. It does **not** bind the recording of a machine-witnessed
acceptance leg on a story already in the fold. d.4's witness clause — the signer is the spine, never
the clicker — is untouched and remains true of both classes.

**D2 — A machine UAT leg signs with NO `approvedBy` at all, and does not consult the signer chain.**
An absent field is the honest record: there was no human decision, so there is no name to write, and
writing a blank string or a resolved-by-accident address would both be worse than absence. The field's
optionality already makes this round-trip.

**D3 — The brownfield observe gate stays FAIL-CLOSED on a blank approver.** `storytree adopt <story>`
and `storytree adopt gate <story>#gate-n` still refuse without a named human. This half is
owner-confirmed in the same message, and it **survives the general machine-in-the-loop rule** because
it is not a verification judgement at all — risk is being accepted on work the system did not produce.
No improvement in model capability retires an ownership decision, so this is not a human requirement
awaiting a capability that would retire it.

**D4 — The distinction is STRUCTURAL, never a caller-supplied flag.** It is derived from the criterion
binding the call already carries: `criterionId`/`revisionId` are present exactly when this is a UAT
leg, and a parsed `ReliabilityGate` can never carry them. `ObserveAndSignSpec` is now a union of
`ObserveMachineLegSpec` (criterion binding required, `approverInputs?: never`) and
`ObserveBrownfieldGateSpec` (no binding, `approverInputs` required). A `skipApprover: true` boolean is
REFUSED as the mechanism: it would let any caller opt a brownfield adoption out of its human, which is
precisely the fence the owner did not lift. On the leg class a caller cannot even supply approver
inputs, so the fence cannot be leaned on from the outside.

**D5 — The honesty walls keep their existing order.** Observe FIRST, then the clean-tree gate, then
sign — so the pinned commit is the clean tree the green was observed against. The brownfield approver
resolution stays where it was, ahead of the observation ("resolve before any spend"), so a blank
approver still refuses without running the suite. The leg path skips that step and reorders nothing.

**D6 — The surfaces print what was SIGNED, not what was resolved.** `storytree adopt gate` renders its
`approvedBy` line from `result.verdict.approvedBy`, so it can never name an approver the verdict does
not carry. `storytree adopt` scopes its header line to the observe-gate verdicts and states, where the
run signed machine legs, that those legs carry none and why. Header comments in
`observe-and-sign.ts`, `drive/src/adopt.ts`, `cli/src/adopt.ts`, `spine-principal.ts` and
`proof-protocol/src/proof.ts` that asserted "human-approved" as an invariant of every adopted verdict
are corrected in the same change. ADR-0405's own friction item exists because a doc comment that
narrowed what the code did was believed over the code for weeks; leaving these disagreeing would
reproduce it. *(The studio's `/api/adopt` route note carried the same claim and was corrected too,
but ADR-0404's retirement of the SPA's Build and Adopt dispatch surface deleted the route while this
change was in flight, so that correction is not in the landed diff — the surface it described is
gone. `adoptStory` / `runAdopt` themselves are untouched by that retirement.)*

**D7 — What is NOT changing, stated explicitly because the neighbouring rules look similar.**
`signer` stays the spine principal on every adopted verdict. A model still never signs its own verdict
(ADR-0295 D2) — the model drives the journey and files a report, a separate cheap check re-reads it,
and the spine watches THAT check's exit code. A human click still cannot satisfy a machine leg
([ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) d.2). The
no-partial-verdict rule stands (ADR-0405 D3). `human-owns-the-outer-loop` is untouched — this is about
verification, not direction. And the 29 existing criterion verdicts, signed 2026-08-03/04 by genuine
brownfield adopt runs where a human approver was the correct record, are left exactly as they are:
this rewrites no history.

## Consequences

- **`machine-uat-signing-gap-arc-inc-03` is unblocked.** ADR-0405 D6 said the approver question
  "blocks the backlog leg (D4's execution)". It no longer does: the 65 legs can be signed with an
  honest record rather than 65 approvals the owner never gave. D6's status and its ADR-0007 reasoning
  are corrected in place under [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
- **`approvedBy` becomes a field whose ABSENCE carries meaning**, not merely a legacy gap. A reader
  distinguishing "adopted by a human" from "machine-witnessed only" reads presence/absence, and the
  evidence note on a leg verdict says which it is in words.
- **A cost accepted knowingly:** the two classes are told apart by a structural property of the call
  rather than by an explicit tag on the verdict. A future reader wanting to filter verdicts by class
  in SQL reads `criterionId IS NOT NULL`, which is correct today but is a derived signal, not a
  declared one. Declaring it would have meant a schema change the ruling does not require. If a
  surface ever needs the class first-class, add it then — do not infer intent from `approvedBy` alone.
- **The general rule is recorded but not yet wired.** The owner's broader machine-in-the-loop ruling
  is captured as the principle `machine-in-the-loop-is-the-default-human-is-the-exception`; auditing
  every remaining human requirement against the two-condition test (taste, or models not yet capable)
  is the rest of `machine-verdict-approver-arc`, and ADR-0070 stage-2 `operator-attested` nodes are
  explicitly NOT flipped on the general rule alone.
- **Independence survives where the human left.** The ruling removes the PERSON, never the JUDGE: a
  machine leg is still witnessed by the spine over a check that a separate cheap process re-read, not
  by the model that drove the journey.

## References

- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) d.4 — the two
  provenance axes; narrowed by D1 above.
- [ADR-0405](0405-the-machine-uat-signing-verb-already-exists-the-gap-is-bindi.md) D4/D6 — the 65-leg
  backlog and the escalation this answers; D6 corrected in place.
- ADR-0295 D2 and ADR-0082 d.2 — untouched (D7).
- `packages/orchestrator/src/proof/observe-and-sign.ts` · `packages/drive/src/adopt.ts` ·
  `packages/cli/src/gate.ts` · `packages/proof-protocol/src/proof.ts`.
