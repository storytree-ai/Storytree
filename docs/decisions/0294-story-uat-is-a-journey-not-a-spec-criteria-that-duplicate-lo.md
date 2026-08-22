---
status: accepted
decided: 2026-08-03
amends: [70, 106]
load_bearing: true
arc: uat-journey-surgery-arc
---
# ADR-0294: Story UAT is a journey, not a spec — criteria that duplicate lower-tier proof are deleted

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

The owner's framing, on being re-onboarded to how machine UAT runs: *"machine uat doesn't sound like
uat but more like e2e integration tests … the map is lying by saying its uat"*, and separately
*"i don't think 'does it look good' is something that should be a uat test"*. Both readings were
measured against the corpus before this ADR was written, and both hold.

## Context

`asset:uat` defines a UAT as *"a prose journey, run end-to-end against real collaborators, that proves
a story (the whole organism) meets its goal"*, and adds explicitly: *"capabilities get integration
tests, contracts get isolated unit tests, not UATs."* ADR-0010 §2 sets the same ladder — contract
proven by an isolated test with collaborators stubbed, capability by an integration test against real
in-story collaborators, story by an integrated UAT against the whole organism.

The corpus has drifted a long way from that, on **both** witness kinds. Measured against `origin/main`
@ `7ef1e55` on 2026-08-03, by parsing every `stories/*/story.md` with the live
`@storytree/library` parser and classifying every bound reliability-gate command:

- **282 criteria across 40 stories** — about 7 per story. That is a specification, not a walkthrough.
- **Of the 133 bound machine legs, 100 run `pnpm --filter <pkg> test`** — a single package's own
  suite, with everything outside that package stubbed. That is the contract and capability rungs
  being used to sign the story rung. Only 13 legs run a genuine end-to-end driver (`pnpm --filter
  studio uat`, which is `playwright test` against a real Chromium and a real dev server), and a
  further ~3 run bespoke live-artifact checks (`drive-machinery`'s `promotion-ancestry.check.ts`,
  `witnessable-verdict.check.ts`, `dogfood-witness.check.ts`).
- **Of the 41 human legs, 17 are appearance verdicts** — "it READS as one coherent terminal", "the
  tabs FEEL like ONE coherent tabbed terminal", "the owner's verdict that it reads as …".

The second finding is the same bug as the first, one tier over. ADR-0070's two-stage proof already
homes the appearance verdict at **node level** as `proof_mode: operator-attested`, and nine
capabilities already carry it. Those capability outcomes and the story legs that shadow them state the
same claim in nearly the same words:

- `stories/wisp-as-story-claim/appearance-uat.md` (tier: capability, proof_mode: operator-attested) —
  outcome: *"… the colour shifts by the active subagent, **claimed is visibly distinct from
  proven-green**, and the wisp clears on merge — operator-attested …"*
- the same story's UAT leg 8, `(witness: human)` — *"**Claimed LOOKS clearly different from
  proven-green.**"*

`website-experience` repeats the pattern across five operator-attested capabilities (`act1-terminal-storm`
and siblings) shadowed by story legs such as "The overwhelm is FELT".

So **117 of the 268 non-aspirational criteria are a second signature over proof that already exists
one rung down** — 100 duplicating capability integration, 17 duplicating a capability's
operator-attested look verdict. A further 97 machine legs name no gate at all and are unsignable as
authored.

The corpus already named this hazard in prose without enforcing it. `stories/drive-machinery/story.md`:
*"each leg's gate witnesses a real persisted signed pass, **never an offline mechanics suite dressed up
as acceptance**."*

Two structural facts make the repair cheap rather than costly:

1. **A story with zero UAT criteria already greens honestly.** The crown's own-proof clause takes the
   union of UAT criteria and reliability gates (`packages/drive/src/tree.ts:224` —
   `const ownObligations = [...hardUatTestCriteria, ...reliabilityGates]`, per ADR-0085), so a pure
   port with an adopted observe gate needs no UAT at all. No new mechanism is required to let a story
   have none.
2. **Nothing is currently proven anyway.** After ADR-0253 landed on 2026-08-02, criterion identity is
   an opaque `uatc_` id plus a content-bound `uatr1:` revision, and a verdict counts only on an exact
   match. Measured: 142 legacy UAT verdicts in `events.verdict`, **zero** carrying a `criterionId`, and
   all 282 entries in `stories/uat-legacy-dispositions.json` marked `unresolved` — which ADR-0253 D4
   says earns no current proof credit. **Zero of 282 criteria hold proof credit today.** There is no
   green to preserve.

## Decision

**1. A story UAT criterion is a step in a narratable journey. Nothing else belongs in the section.**

The test for a criterion is: *can you narrate a person or agent doing this, end to end, against the
real thing?* A property of a module ("the seam is runtime-agnostic") is not a journey step, however
true and however well tested. The `studio` story is the reference shape — thirteen criteria that are
consecutive steps of one operator walkthrough, driven by one Playwright run.

**2. A criterion whose proof already exists at a lower tier is deleted, not re-pointed.**

The 100 machine legs bound to a package suite are the capability tier re-signed at the story tier: the
command they name is the same command that greens their own capabilities and drives that capability's
grass density. Deleting them is provably lossless — every assertion still runs, every capability still
greens, no rendered signal changes. The obligation on the deleting author is to **name, per deleted
criterion, the lower-tier node that already proves it**; a criterion with no such node is not a
duplicate and must instead be re-authored as a journey step or dropped on its merits.

**Corrected in place 2026-08-08 (ADR-0139), after increments 1–3 applied this to real stories. The
decision is unchanged; what follows is the test it turned out to require.** "Provably lossless" is a
property of each criterion, not of the population — asserted of the class it reads as a settled
verdict, licensing exactly the bulk deletion the Cost / watch section below forbids. A leg is a
duplicate only when it clears **both** of these:

- **Does the command the leg NAMES also green that leg's own capabilities?** A different command means
  this decision never reaches the leg. `studio`'s thirteen survive on that alone — `studio#gate-1` runs
  `pnpm --filter studio uat`, a dedicated whole-journey Playwright run, not the `pnpm --filter studio
  test` suite that greens its capabilities. `app-surface`'s nine died on it, because each bound gate
  carried an explicit `_(covers: <capability>)_` annotation, so the identity was declared rather than
  inferred. And where a story's capabilities register no `proof.real.testFile` at all there is no lower
  tier to name, so the obligation cannot be discharged for any leg: `studio-build`'s eleven were kept
  for that reason, all three of its capabilities declaring none.
- **Do that suite's own assertions reach the leg's claim?** The binding is not the proof — verify
  against the named suite's test TITLES, never against file existence. `uat-criterion-detail` was
  carried into increment 3 as the classic duplicate shape with heavy deletion expected, and all four
  legs survived: its capability tests import sibling modules by DEEP PATH, while every leg asserts the
  same behaviour reached through the PUBLIC root barrel — a claim the capability tier structurally
  cannot make.

**3. Appearance is proven at the node it belongs to, never as a story-UAT criterion.**

"Does it look right" earns an `operator-attested` verdict on the capability whose look it is
(ADR-0070 stage 2, the existing nine-node pattern), not a `(witness: human)` leg in the story's UAT
section. This does not weaken ADR-0070 — it removes the duplicate rendering of it and keeps the
verdict at the altitude where the visual change was actually made. Story UAT asks whether the journey
completed; it does not ask whether the journey was handsome.

**Corrected in place 2026-08-21 (ADR-0139). [ADR-0348](0348-human-uat-witness-narrows-to-taste-live-spend-and-outward-fa.md)
D6 overtook the RELOCATE-EVERY-LEG reading of this point and went the other way: a user EXPERIENCE
property is not a user ACCEPTANCE criterion at all, so the appearance legs this ADR counted (a
re-measurement with the full parser later found 21, not 17 — see ADR-0348's own counting correction)
are DELETED outright, not relocated to a capability — chip `task_99f7e0a9`, which owned the
relocation, is discharged and owns nothing (its reservation on `app-guide` 4 and `app-surface` 11 is
moot rather than overridden). What survives of this point unchanged: D3 still governs WHERE an
appearance verdict lives *when one is worth carrying* — that home is `operator-attested` at the
capability per ADR-0070 stage 2, never a story-UAT leg. What no longer holds is that every appearance
leg must be carried somewhere.**

**4. A story may declare zero UAT criteria, and pure ports should.**

Already legal via the ADR-0085 union above; this ADR makes it the expected shape for a story nobody
operates. `proof-protocol` and `storage-protocol` have a contract and a parity suite and no journey;
inventing criteria for them is what produced property-shaped legs in the first place.

**5. The target is roughly 60 criteria, not 268.**

Not a quota to hit mechanically — the number falls out of applying 1–4. It is recorded so that a later
drift back toward ~7 criteria per story is visible as drift rather than growth.

**Corrected in place 2026-08-08 (ADR-0139); the target stands.** What is added is the floor beneath
it, so the remaining distance to ~60 is not read as a deletion budget. Applying 1–4 leaves criteria it
provably cannot reach, and increment 3 measured a first instalment inside a single eleven-story
cluster: `studio` (13 — decision 1's reference shape), `studio-build` (11 — no capability declares a
`testFile`) and `uat-criterion-detail` (4 — a root-barrel claim no capability test makes) hold 28
untouchable criteria between them. Corpus at the close of increment 3: **226 criteria, 218
non-aspirational**. Whether ~60 survives the remaining stories is the re-measurement this decision
exists to make visible; it is not a number to delete toward.

## Consequences

**Good.**

- The word "UAT" starts meaning what the Library says it means. A flower on the map comes to mean *"a
  journey ran end to end"* — a claim no grass blade makes — which is what stops the map lying without
  any new art or a new plant species.
- The deletions cost no coverage and no signal. They remove a second rendering of evidence, not the
  evidence.
- The owner's standing attestation queue falls from 41 criteria to roughly 6, because 17 move to
  capability-tier attestation and the rest are handled by ADR-0295. *(Corrected in place 2026-08-21,
  ADR-0139: ADR-0348 D6 later deleted the experience legs outright (re-measured at 21, not 17) rather
  than moving them to capability-tier attestation — see decision 3's correction above. The queue still
  fell, just not by that mechanism; the final story-tier human population, per ADR-0357 and ADR-0396,
  is 5.)*
- The timing is close to free: with zero criteria holding proof credit after ADR-0253, deleting and
  re-authoring costs nothing that is not already spent.
- The unbound-machine-leg population (97) is largely dissolved by the same pass rather than needing
  97 new gates minted for it — which ADR-0097 §2 warns against anyway ("never mint a gate to host a
  leg").

**Cost / watch.**

- The adjudication is real work: 268 criteria read one at a time, per story, deciding journey-step vs
  property vs duplicate. It is reading rather than building, but it is not small.
- The "name the lower-tier node" obligation is the honesty wall of decision 2 and the place this can
  go wrong. A deletion justified by a node that does not actually prove the claim is a silent coverage
  loss, and no mechanical check can catch it — the lower-tier node's own test set is not indexed by
  claim. This is the one part of the pass that must not be done in bulk.

  **Narrowed 2026-08-22 (ADR-0139), by the `uat-contractless-tested-behaviour-claims` increment.**
  "Not indexed by claim" is no longer true of the EXISTENCE half of this bullet: `storytree coverage
  --contractless <test-path>` (`classifyBehaviourClaims`,
  `packages/orchestrator/src/proof/contract-coverage.ts`) walks a unit's own test set the inverse
  direction — test ⇒ declared contract — so a deleting author can now ask, mechanically, whether ANY
  contract claims a given running assertion, rather than reaching straight for a free-form test title.
  What the instrument still cannot do, and what this bullet is really warning about, is unchanged: it
  matches the SAME naming convention (`describe("<contract-id>: …")`, ADR-0122) the coverage sweep
  already trusts the other way, so a contract that NAMES a behaviour it does not actually exercise
  reads identically to one that does. A deletion citing such a contract is still a silent coverage
  loss no mechanical check can catch — the failure mode moves from "no node to cite" to "a
  well-named node that lies," and it is the same semantic-reviewer gap ADR-0122's Consequences leaves
  open. This is still the one part of the pass that must not be done in bulk.
- Six residual human criteria are classified `OTHER` by the sweep and genuinely need individual
  adjudication; they are not covered by any rule here.
- The 17/13/5/6 split of the human legs came from reading all 41 and bucketing them; the boundaries
  are a judgement call, not a parse. A later reader should re-derive rather than trust the split.
- Deleting a criterion deletes its `uatc_` identity. Under ADR-0253 that identity is immutable and its
  legacy disposition must remain honest — a deleted criterion's history is `superseded`, not silently
  dropped.

## References

- [ADR-0010](0010-organism-model-story-bounded-context.md) §2 — the proof ladder this restores.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage
  visual proof; amended only in that its stage 2 is the *sole* home for an appearance verdict.
- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) — per-leg witness
  resolution; amended in that far fewer legs survive to be resolved.
- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — the own-proof
  union that already permits a zero-UAT story.
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) §2 — never mint a
  gate to host a leg.
- [ADR-0253](0253-criterion-identity-is-immutable-across-uat-revisions.md) — criterion identity and
  the disposition ledger; why nothing currently holds proof credit.
- [ADR-0295](0295-the-uat-driver-s-own-verdict-is-the-witness-model-driven-uat.md) — the witness half
  of the same conversation.
- [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) /
  [ADR-0353](0353-a-capability-declares-where-its-contract-tests-live-separate.md) — the
  declared-contract ⇒ test coverage sweep this decision's honesty wall runs the OTHER direction from;
  `storytree coverage --contractless` (2026-08-22) is the inverse instrument the Cost/watch correction
  above cites.
- `asset:uat`, `asset:contract`, `asset:human-witness-is-a-judgment-gap-not-cost` — the definitions
  and the labelling rule this realigns to.
- `stories/wisp-as-story-claim/appearance-uat.md`, `stories/website-experience/act1-terminal-storm.md`
  — the capability-tier operator-attested pattern the 17 look legs duplicate.
