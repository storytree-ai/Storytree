---
id: "verification-decay-instruments"
tier: capability
story: cli
title: "The chartered decay instruments — located, charged to their author, held to a per-instrument ceiling"
outcome: "Every chartered verification instrument reports the decay it locates as a finding charged to the branch that authored it."
status: mapped
proof_mode: integration-test
depends_on: []
# Deciding ADRs (ADR-0037 §2): ADR-0252 D1 charters the instrument roster and D3 is why this is a
# drain obligation on the session rather than a merge barrier; ADR-0278 adds the fifth instrument
# (`unproven-seam-default`); ADR-0301 is the attribution half — a breach resting entirely on signals
# this branch did not author is `inherited` and does not block the landing.
decisions: [252, 278, 301]
# A brownfield capability over already-implemented, already-tested code (the arc that authored it:
# capability-layer-coverage-arc increment 5, 2026-08-08). It resolves ONE story-grain
# `repo-manifest.json` declaration (`packages/cli/src/*decay*.ts`).
# THE MANIFEST KEY IS COARSER THAN THIS SCOPE, DELIBERATELY. The key also matches
# `check-verification-decay.ts`, which is NOT in the scope below: under rule (6) fence 2 a gatherer
# joins the organ only when it manufactures observability that does not otherwise exist, and that
# file reads only facts already on disk (source text, package.json, git). It is the
# `check-boundaries.ts` shape — glue — and the precedent for declaring it here anyway is exactly
# `check-boundaries.ts`, which `repo-manifest.json` homes to `organism-boundary-tooling` while that
# capability's own spec excludes it. Ownership answers who is RESPONSIBLE; the proof block answers
# what is BOUND. They are allowed to differ, and here they do.
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm:
#   1. ADR-0085/ADR-0094 — mapped brownfield, so the green path is Adopt, never a manufactured red on
#      mature code (ADR-0097 ":61"/":89" — corrected by the pre-merge librarian pass from ADR-0159,
#      which is about frontend-builder's two-stage visual proof and says nothing about manufactured
#      reds). A `real:` arm would also move the pinned REAL-buildable snapshot in
#      `packages/cli/src/node-build.test.ts` (verified: this id appears there zero times).
#   2. `readUnitSourceFiles` (packages/cli/src/check-boundaries.ts:210-234) `continue`s on an absent
#      `real` (`:226`), so this unit contributes nothing to `unitSourceFiles` and the ADR-0192
#      landlord rule does not fire. Both files are in `packages/cli`, this story's OWN building.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/cli/src/verification-decay.test.ts"
      - "packages/cli/src/decay-attribution.test.ts"
    sourceGlobs:
      - "packages/cli/src/verification-decay.ts"
      - "packages/cli/src/decay-attribution.ts"
---

# The chartered decay instruments — located, charged to their author, held to a per-instrument ceiling

**Outcome —** Every chartered verification instrument reports the decay it locates as a finding
charged to the branch that authored it.

**Depends on —** nothing within this story. `verification-decay.ts` reaches outside itself for
exactly two things: the TypeScript compiler API, and `readTestCallTitle` from
`@storytree/orchestrator` (`:70`) — the same title reader ADR-0126's classifier uses, imported so the
`vacuous-proof` join is spelled identically on both sides rather than re-derived. That is a shared
parser, not a consumed outcome. It is a root.

> **Proof status (honest) — `mapped` (a real, standing, passing suite; observational; NOT
> `healthy`).** storytree's own prove-it-gate did not drive this red→green. That is what `mapped`
> records (ADR-0094), and it is why there is no `real:` arm.
>
> **The proof — 116 tests.** `verification-decay.test.ts` (103 `it()` across 24 `describe` blocks)
> and `decay-attribution.test.ts` (13). Every one of the five instruments is held on BOTH sides —
> what it locates AND its false-positive guards, as separate `describe` blocks — and the ceiling, the
> attribution, the report and the escalation backstop each have their own.
>
> **THE HONEST LIMIT, STATED FIRST BECAUSE IT IS THE THING A READER WILL ASSUME OTHERWISE.** This
> suite is **fixture-only**: zero of the 116 cases read the real repo tree. It builds its inputs from
> literal factories (`workspace()` `:39-46`, `binding()` `:48-50`, `surface()` `:161-164`,
> `finding()` / `measured()` in `decay-attribution.test.ts:15-33`). So **`pnpm --filter
> @storytree/cli test` reds when the JUDGE breaks, and never when the repo decays.** The command that
> reds on real decay is `pnpm check:verification-decay` — `GATE_PLAN` step 9
> (`gate-order.ts:228-233`), whose gatherer walks `stories/`, every workspace `package.json`, every
> test file, the studio and desktop route tables and `git merge-base`.
>
> **THAT SPLIT IS WHY THE OUTCOME ABOVE IS A JUDGING OUTCOME, AND THE WORDING IS DELIBERATE.** This
> unit does NOT claim "the repo's verification apparatus is free of decay"; nothing here could red on
> that, and binding such an outcome to this suite would be the rubber stamp ADR-0085 / ADR-0097 §2
> forbid. It claims that each chartered instrument LOCATES and CHARGES correctly — which is a fact
> about this code, and which 116 tests observe directly. The module says the same of itself
> (`verification-decay.ts:59-62`, *"Pure and injectable — every instrument judges FACTS handed to it,
> never disk"*), and every instrument's own contract below is a locating claim, never an adjudicating
> one.
>
> **AND `pnpm check:verification-decay` COULD NOT SERVE AS THE `proof.command` EVEN THOUGH IT IS THE
> ADR-0057 D3 stage B form increment 3 used for `mirrored-route-conformance`.** Its exit code is
> BRANCH-DEPENDENT by design: `check-verification-decay.ts:1165` sets exit 1 only when a breached
> instrument carries at least one finding THIS BRANCH authored, and exits 0 on an `inherited` breach
> (ADR-0301, `verification-decay.ts:1191`). A proof command whose red depends on who is running it is
> not a stable proof of anything, so the suite is not merely the convenient choice here — it is the
> only honest one.
>
> **No reliability gate `(covers:)` this capability.** [`story.md`](story.md)'s `cli#gate-1` names
> three capabilities and not this one. Its command runs this suite, so the evidence sits inside that
> gate's observation, but the gate does not CLAIM it — and extending an already-signed gate's
> `(covers:)` changes what a signed verdict asserts, which is a deliberate owner edit. Stated gap,
> not a hidden one.

## Guidance

**WHY THIS IS ONE ORGAN AND NOT TWO.** The two files could be cut apart — a judge and an attributor —
and they are not, because a finding without its charge is not actionable and the code says so
structurally: the two are MUTUALLY type-dependent (`verification-decay.ts:75` imports
`DecayAttribution`/`DecayOwner`; `decay-attribution.ts:71` imports `DecayFinding`), and
`evaluateDecayCeiling` (`:1160-1208`) cannot reach a verdict without the attribution, because
`red` versus `inherited` IS the attribution. Split them and the attributor is a pure function with
one consumer and no outcome of its own. Both splitting-rule triggers pass for the fused unit: the
outcome states in one sentence without a conjunction (the charge is a property of the finding, not a
second job), and the proof shares one precondition (the instrument's injected facts) and one
observable (the finding set and its verdict level).

**WHY THIS IS A `cli` CAPABILITY — and the reading of rule (6) that decides it.** This case looks
exactly like the one rule (6) was written for, and applied at face value the rule would REFUSE it.
That is worth setting out, because the resolution turns on a fact about the anchor precedent that had
not been checked before.

Rule (6)'s headline is *"a gate instrument homes to the story whose test surface goes red when THE
THING DRIFTS"*, and increment 3 used it to eliminate `cli` for the mirror-conformance harness on the
ground that the CLI suite *"runs the judge's rules but NEVER SPAWNS A PROBE"*. This suite likewise
never walks the tree. So on the face of it, `cli` is eliminated here too.

**It is not, and the reason is that the anchor precedent does not satisfy that reading either.**
[`organism-boundary-tooling`](organism-boundary-tooling.md) — a pure judge plus a disk-reading check
gatherer in `packages/cli/src`, at the immediately adjacent `GATE_PLAN` step, homed to `cli`
precisely because `boundaries.test.ts` reds — was checked on the bytes for this increment:
`boundaries.test.ts` builds *"a miniature world"* of literal fixtures and reads no repo file at all.
Its single `node:fs` occurrence (`:715`) is inside a synthetic module source being fed to
`extractImports`. So if "the thing that drifts" meant the SUBJECT MATTER, rule (6) would retroactively
refuse its own anchor, and `library-health-gate` — four checks over a frozen fixture corpus — with it.

The reading that makes all three precedents true at once is the one ADR-0085 / ADR-0097 §2 actually
state: **the proof must be able to red on WHAT THE OUTCOME ASSERTS.** Increment 3's sentence carries
that already, in a clause easy to skim past — *"it cannot go red when the route table drifts, WHICH IS
THE ENTIRE OUTCOME"*. `mirrored-route-conformance` asserts a fact about the world (two surfaces
agree), so it needed a command that walks the world. `organism-boundary-tooling` and
`library-health-gate` assert facts about a JUDGE, and a fixture suite reds on those. This unit is the
second kind, and its outcome is written to say so rather than to borrow the first kind's authority.

On that reading the placement is unremarkable: three files, all in `packages/cli/src`, no importer
anywhere outside `packages/cli` (checked repo-wide, both import forms), not on the package's public
surface, and riding the CLI's test surface — the criterion `organism-boundary-tooling` was admitted
on.

**WHAT THE OBLIGATION DOES *NOT* DO HERE, recorded because rule (6) fence 3 says it is the selector.**
Fence 3 holds that the observing command eliminates a wrong home while the OBLIGATION picks the right
one — as all three `MIRRORS` rows pointing at the desktop picked `desktop`. That selector **does not
fire here, and it does not point anywhere else either.** The five instruments' repairs land on five
different surfaces owned by five different parties: `contract-binding-drift` on a story spec's proof
block under `stories/**`; `mirror-pair-drift` on a studio probe plus a desktop probe plus a `MIRRORS`
row; `vacuous-proof` on whichever package's test file carries the hidden skip; `warn-list-hygiene` on
a `packages/cli/src/*-drain.ts`; `unproven-seam-default` on a new test for an arbitrary package's
source. No single story is under obligation, so the fence-3 selector is silent — which is not a
refusal, because fence 1 only bars an instrument whose drift NO command observes, and
`pnpm check:verification-decay` observes it. Where the obligation is silent, what remains is rule
(1)'s ordinary reading plus residency, and both point at `cli`.

**THE TWO HOMES THAT WERE CHECKED AND REFUTED.**

1. **`proof-binding-integrity` (arc `verification-integrity-arc`) — the obvious candidate, since this
   organ was built on that arc.** Its outcome is *"A reader inspecting any real machine UAT leg
   receives its exact runnable observe-gate chain, or an explicit refusal"*, and its three
   capabilities are all the evidence-or-refusal contract for machine UAT legs. That does not name or
   plainly cover a five-instrument decay sweep. Only `contract-binding-drift` is even adjacent, and
   it judges whether a `pnpm --filter` names a live package — not whether a leg has an observe-gate
   chain. Rule (1)'s test fails; sharing an arc is not sharing an outcome.
2. **A new story for verification integrity — not authored, and not this unit's call.** No such story
   exists, and creating one is a structural fork for the owner rather than something an increment
   resolving an ownership declaration should take. Recorded so the option is visibly declined rather
   than overlooked.

**WHAT THIS DOES NOT RE-DERIVE.** [`story.md`](story.md)'s design floor fences the hub against
re-deriving per-domain command surfaces owned by another organism. Nothing is re-derived: no
organism owns "verification decay", and the five surfaces the findings land on are the instrument's
SUBJECTS, not its home — the same relationship `check:boundaries` has with the 24 packages it judges.
Open modeling call 1 in `story.md` remains the live question about whether CLI-resident judges belong
to the hub at all; this unit enters on the footing `organism-boundary-tooling` already holds under
that unresolved call and does not widen it.

## Integration test

**Goal —** Prove that each chartered instrument returns exactly the findings its charter describes
and no others — the located set AND the false-positive guards — that a finding is charged to the
branch that authored it, that each instrument is held to its OWN ceiling with no fungibility between
them, and that an instrument which sweeps nothing escalates instead of reporting a clean run.

The integration-flavoured proof is `packages/cli/src/verification-decay.test.ts` plus
`packages/cli/src/decay-attribution.test.ts`, run by `pnpm --filter @storytree/cli test`. Real
collaborators where they exist: the sweep runner drives the real instruments through the real ceiling
and the real attributor end to end (`verification-decay.test.ts:708-766`, `:1290-1406`), and the
`vacuous-proof` join is asserted against the REAL `extractVouchingTestNames` from
`@storytree/orchestrator` (`:322`, `:336`) rather than a re-spelling of it — which is the one place
this judge could silently disagree with the classifier it is joining against.

Facts are injected rather than read, which is the design (`verification-decay.ts:59-62`) and the
stated limit above; nothing in this scope walks the repo.

`mapped` (observational); the prove-it-gate did not drive it.

## Contracts (9)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`every-instrument-locates-and-none-adjudicates`** — the two-phase discipline, asserted per
   instrument rather than left to the module header
   - **asserts —** a located region is reported as a region to LOOK at, never as an established
     defect: `mirror-pair-drift` must not assert the two payloads are REQUIRED to agree;
     `vacuous-proof`'s detail claims no contract is falsely covered; `warn-list-hygiene` states only
     what is mechanical and never that a list is too long or needs a ceiling;
     `unproven-seam-default` never escalates, because locating a default is an obligation to look
     rather than a defect; and the WARN report says all of this in the text the reader gets.
   - **covers —** `packages/cli/src/verification-decay.ts:86-126`, `:128-183`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:190`, `:422`, `:436`, `:567`,
     `:586`, `:743`, `:1052` (REAL, passing)
2. **`contract-binding-drift-flags-a-dead-target-and-nothing-that-merely-looks-dead`** — the
   instrument plus its three guards
   - **asserts —** a `pnpm --filter` naming a package no workspace provides is flagged (it exits 0
     without running, which is a proof that proves nothing), as is a bound path that is missing AND
     outside every workspace package; one finding per unit however many dead targets it names. And
     the guards: a not-yet-authored test file inside a package that EXISTS is silent (a net-new unit
     reads identically to rot, so it must not be flagged), an EXISTING path outside every workspace
     is silent, a live name with a live path is silent, and an empty binding set returns nothing —
     which the caller, not the rule, must treat as vacuous.
   - **covers —** `packages/cli/src/verification-decay.ts:260-304`, `:306-333`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:70`, `:82`, `:91`, `:114`, `:128`,
     `:142`, `:155` (REAL, passing)
3. **`mirror-pair-drift-flags-only-an-unregistered-pair-both-surfaces-serve`** — and never
   re-derives the registry
   - **asserts —** a route BOTH surfaces dispatch that no `MIRRORS` row compares is flagged, naming
     both files so the reader knows where each implementation lives, one finding per route in a
     stable sorted order the ceiling can count. The guards: a route only the REFERENCE serves is
     silent (one implementation cannot drift from itself), a route only the MIRROR serves is silent,
     every REGISTERED pair is silent — the boundary guard, so the instrument never second-guesses
     `MIRRORS` — and two empty route tables return nothing rather than a false clean sweep.
   - **covers —** `packages/cli/src/verification-decay.ts:393-426`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:177`, `:184`, `:201`, `:218`,
     `:227`, `:236`, `:250` (REAL, passing)
4. **`vacuous-proof-reads-the-skip-form-the-repo-s-own-classifier-cannot-see`** — the join is the
   whole instrument
   - **asserts —** the OPTIONS form (`test(name, {skip: cond}, fn)`) is read on `test`/`it`/`describe`
     and the title spelled EXACTLY as ADR-0126's classifier spells it, so the join holds; a test
     skipped that way whose name the classifier calls vouching is located; one finding per FILE
     listing every test, ordered by path. The guards: a literal `skip: false` skips nothing, the
     `.skip` MODIFIER is already VISIBLE to the classifier and is not flagged, an options object on a
     non-test call is ignored, the visible placeholder idiom is not flagged, a vouching test with no
     options skip is not flagged, and an options skip the classifier does not call vouching is not
     flagged.
   - **covers —** `packages/cli/src/verification-decay.ts:508-590`, `:592-616`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:279`, `:293`, `:304`, `:314`,
     `:322`, `:346`, `:360`, `:375`, `:388`, `:401`, `:408`, `:418` (REAL, passing)
5. **`warn-list-hygiene-is-a-three-fact-conjunction-read-from-the-ast`** — an advisory check whose
   warning can never fail
   - **asserts —** the level, the bound and the witnesses are separated as three facts, and a check
     is flagged only when all three coincide: it carries a WARN, its output tracks a collection
     (either a stated count or a line emitted PER ITEM), and no source sets a non-zero exit. It reads
     the RENDERER as well as the entry, because this repo splits advisory checks entrypoint/judge.
     The guards: a check that CAN fail is not flagged (a bounded worklist is the repair), one failing
     via `process.exit(1)` is not flagged, one whose only exit is `process.exit(0)` still IS (that
     bounds nothing), a SINGLE-FACT warn is not flagged (nothing there accumulates), a check with no
     WARN level is not flagged, WARN inside a COMMENT does not set the level, and a loop over
     non-output literals is not a per-item witness.
   - **covers —** `packages/cli/src/verification-decay.ts:693-809`, `:811-838`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:479`, `:491`, `:497`, `:504`,
     `:517`, `:523`, `:528`, `:533`, `:540`, `:545`, `:556`, `:595`, `:602` (REAL, passing)
6. **`unproven-seam-default-needs-a-real-code-reference-not-a-mention`** — the aperture and the
   coverage oracle, which is where this instrument's false positives would come from
   - **asserts —** the aperture matches the nullish-fallback and parameter-default forms, IGNORES a
     scalar default (a number has no unproven behaviour) and a fallback whose symbol is not declared
     in the file, and reads an object seam's members past a fixed window as arms. The oracle is the
     regression surface: a symbol named only in a COMMENT does not count as covered, nor one
     appearing only inside a STRING, while one a test really imports and calls does; and a prose
     apostrophe does not swallow the code that follows it. One finding per SYMBOL, arms that ARE
     tested omitted so a partial drain is visible, ordered by path then symbol.
   - **covers —** `packages/cli/src/verification-decay.ts:982-991`, `:993-1025`, `:1027-1053`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:980`, `:992`, `:1003`, `:1013`,
     `:1025`, `:1034`, `:1062`, `:1081`, `:1088`, `:1095`, `:1104`, `:1114`, `:1126`, `:1144`,
     `:1149` (REAL, passing)
7. **`the-ceiling-is-per-instrument-and-backlogs-are-not-fungible`** — the property that stops one
   easy drain from buying budget for a hard one
   - **asserts —** each instrument is held to its OWN ceiling and only the one that GREW reds;
     repairing one instrument's signal buys NO budget for another; a clean instrument still reports
     its tally, so 0/n is visible rather than absent; the baseline is OK at exactly the ceiling and
     reds the moment the backlog grows past it; a finding from an UNDECLARED instrument is held to
     zero, so unattributed backlog fails closed; a NEW instrument's honest baseline does not red the
     gate; and the RED report names the breached instrument and says another's repair cannot clear
     it.
   - **covers —** `packages/cli/src/verification-decay.ts:1160-1208`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:615`, `:619`, `:625`, `:630`,
     `:642`, `:655`, `:672`, `:688`, `:694` (REAL, passing)
8. **`an-inherited-breach-does-not-block-the-landing-and-a-failed-attribution-is-never-silent`** —
   ADR-0301, and the fail-closed behaviour around it
   - **asserts —** a breach resting entirely on files identical to the merge base is `inherited`, not
     red; ONE authored signal in an over-ceiling backlog REDS; below the ceiling stays OK however the
     signals are attributed; with NO attribution supplied the pre-ADR-0301 behaviour is reproduced
     exactly (charged, red); a finding the attributor never classified is CHARGED rather than
     defaulted to inherited; each instrument's authorship is scored SEPARATELY so an inherited breach
     cannot absorb an authored one; and an attributor that THROWS degrades to charging everything
     rather than taking the sweep down. The report half is part of the contract: it names a
     pre-existing breach as its own outcome and says the landing is not blocked, prints every NOT
     YOURS signal IN FULL rather than a count, splits YOURS from NOT YOURS on a mixed breach, and
     says so LOUDLY when attribution could not be measured — so a charge is never mistaken for a
     verdict.
   - **covers —** `packages/cli/src/decay-attribution.ts:135-144`, `:146-181`,
     `packages/cli/src/verification-decay.ts:1223-1358`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:1197`, `:1215`, `:1229`, `:1245`,
     `:1253`, `:1269`, `:1312`, `:1328`, `:1339`, `:1359`, `:1379` (REAL, passing);
     `packages/cli/src/decay-attribution.test.ts` (13 tests, REAL, passing)
9. **`an-instrument-that-swept-nothing-escalates-instead-of-reporting-clean`** — the backstop that
   stops the whole mechanism from failing silently open
   - **asserts —** a loader that enumerated NOTHING is a BLIND instrument and escalates rather than
     banking a clean sweep, carrying the empty enumeration's own message so the report says WHAT went
     blind; a THROWING instrument is fenced to itself as a finding, because a sweep that stops
     sweeping proves nothing; an escalation fails the gate that a green backlog would otherwise pass,
     CANNOT be cleared by raising the ceiling, is not merely the ceiling renamed (a ceiling RED
     carries no escalation), and still fails even when every signal is inherited. The guards: observing
     facts and finding nothing wrong stays green, any non-zero enumeration however small does not
     throw, and an ordinary located signal NEVER escalates. Chartered coverage is machine-checked —
     an unswept chartered instrument is named on a clean run rather than left as a source comment.
   - **covers —** `packages/cli/src/verification-decay.ts:185-201`, `:1360-1407`
   - **proven by —** `packages/cli/src/verification-decay.test.ts:716`, `:790`, `:807`, `:816`,
     `:827`, `:837`, `:847`, `:856`, `:872`, `:894`, `:906`, `:921`, `:931`, `:944`, `:951`
     (REAL, passing)
