---
status: accepted
load_bearing: true
decided: 2026-06-23
amends: [85, 94, 83]
---
# ADR-0097: Brownfield go-green is a proving process: adopt enters brown to proposed to green, earned not flipped

## Status

accepted (2026-06-23) — direct owner decision across a design conversation on 2026-06-22/23. The owner
objected to running CLI commands to flip the `library` story green ("if the reliability gates all pass,
it should just flip itself green"), and over the conversation **sharpened the model well past the
original objection**: bringing a brownfield story into the fold is a **proving process**, entered by a
deliberate human adoption decision, that runs **brown → proposed → green** — the green is **earned by
real work, never flipped by a button**. The owner ratified this model and directed it be landed in the
decision log before next steps; the `status:` flip was applied by this session per
[ADR-0084](0084-agents-may-flip-an-adr-green.md).

It **amends [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)** (observe-and-sign
becomes the cheap first step of a human-entered proving process — machine-witnessed and human-approved —
not a deliberate human-invoked `gate run`, and never a one-click green), **amends
[ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)** (the Adopt affordance
ENTERS the process and produces a proposal; it does not flip green, and the studio surfaces the process
rather than copy-paste `gate run` commands), and **amends
[ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) Fork A** (a brownfield
capability's `healthy` is satisfiable by an adopted gate that *covers* it). It **overturns no honesty
wall** — `green = a signed verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) and
`mapped never self-reports green` ([ADR-0007](0007-proof-model.md)) both stand; this refines the PATH to
green, not the bar.

## Context

[ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) made go-green
status-aware (`proposed → healthy` = Build; `mapped → healthy` = Adopt) but left the studio Adopt
affordance *surfacing* `storytree gate run library#gate-N --pg` commands for the operator to copy-paste
(decided-but-built-follow-on). The owner found running CLI commands to green a story weird. Working the
objection through the conversation surfaced, in order:

1. **The signer is the machine, not the clicker.** An `observe` gate's `adopted` verdict records a
   MACHINE observation ([ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)
   job 3 — judging a port is a machine's job, not a person's). Attributing it to the human who clicked is
   false witness provenance, so the verdict is signed by a named **spine principal**.

2. **Adopting the gates alone does not green the library.** `rollupStoryGreen`
   ([uat-proof.ts](../../packages/orchestrator/src/proof/uat-proof.ts)) requires EVERY capability
   `healthy` AND every own-proof obligation (per-test UAT legs + reliability gates) signed. The library
   has 7 caps + 7 UAT legs + 3 gates; `observeAndSign` covers only the 3 gates. Brownfield caps and
   machine-witnessed UAT legs have no signing path — so "flip the library green" exposed a real modeling
   gap, not just CLI friction.

3. **Brownfield→green must require REAL WORK where the code is genuinely untested** — *"this is what I
   imagined would be the requirement of turning brownfield to green."* *(Reframed 2026-06-25 by
   [ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md): adopt and drive are
   peer best-efforts to bring code under the TDD umbrella, both earning a provisional green — not "REAL
   WORK" ranked above a "cheap first step". The honest split below is one of basis, not rank.)* The `library` honestly flags
   `proposed` pockets with no real tests (`seed-corpus-scripts`, the Postgres transaction path, several
   CLI branches). These cannot be honestly adopted — observing a suite that only smoke-imports the code
   proves nothing about it; adopting it would be exactly the rubber-stamp
   [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) rejects. They need the
   `build-tests` path: real red→green work. Conversely, forcing a manufactured red onto the ~471 tests
   that already pass is theater ADR-0085 equally rejects.

4. **It should never be "too easy to click a button and have it flip green," and the spine should be able
   to tell the human "hold up — we need to refactor here, and I need your input on key decisions."** Brown
   means *this existed and has been working; leave it alone unless we choose to bring it in.* Bringing it
   in is a deliberate human act, and what follows is real work with key decisions escalated — a **process**,
   not a flip. The owner named the ladder: **brown → proposed → green**.

The two foundational ports (`proof-protocol`, `storage-protocol`) are the trivial end of this — already
fully tested, nothing owed — but the `library`, a brownfield story *with capabilities and untested
pockets*, is the case [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) left
structurally unable to green: it handled the zero-capability port (greens from its gates) but not a
with-capabilities brownfield story whose caps have no driven verdict.

## Decision

**1. Brownfield green is EARNED, never flipped; the ladder is brown → proposed → green.** A `mapped`
story never reaches `healthy` by any button. A human's adoption decision flips it `mapped → proposed` —
*"we have committed to bringing this into the fold"* — and `healthy` is reached only when the proving
work the proposed state holds is complete and signed. `mapped` stays *never self-reports green*
([ADR-0007](0007-proof-model.md) / [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)).
`proposed` now also carries the honest **"adoption underway"** signal — distinct from `mapped`
("untouched brownfield") and `healthy` ("proven in the fold"); a stalled adoption honestly reads amber,
not green.

**2. The honest split is the gate KIND (re-affirming ADR-0085; answering "must we refactor?").**
Already-tested code is **adopted**: an `observe` gate's declared suite is observed green at a clean
committed HEAD and signed to an `adopted` verdict — no manufactured red. Genuinely-untested code is
**earned**: a `build-tests` gate is driven red→green for real (the refactoring / test-building the owner
imagined). A brownfield story's `## Reliability Gates` is the author's honest floor mixing both. An
`observe` gate over code its suite does not actually exercise is a mis-declaration (the rubber-stamp
[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) bans); a fake red→green
over code with real passing tests is the inverse theater it also bans.

**3. Adopt ENTERS the process and produces an adoption PROPOSAL; it does not green.** The human adoption
decision (the studio Adopt action / the CLI) means *"I want this in the fold."* It (a) flips the story to
`proposed`; (b) adopts the already-tested `observe` gates as the cheap first step — machine-witnessed,
`signer` = the spine principal, `approvedBy` = the operator who decided; *(per
[ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md), "cheap first step"
reads as a peer best-effort, not a lesser green — the adopted and driven paths are provisional peers)* and (c) triggers the spine to
produce an **adoption proposal** surfacing what remains: the untested capabilities / pockets that need
`build-tests` work, and the **key decisions it needs the human to make** (escalated through the existing
open-question / ADR-fork flow). The story does NOT reach `healthy` from the Adopt act whenever any
obligation is still unproven.

**4. The witness is the machine; the approval and the decisions are the human's — different axes.**
*"Did it work?"* is a machine fact: an `adopted` verdict's `signer` is the spine principal (it observed
the green out-of-band at a clean HEAD), never the human who clicked. *"Do we bring it in?"* and *"how do
we resolve this design fork?"* are the human's: recorded as `approvedBy` on the adopted verdict and as
escalated decisions. This composes with the standing rule that a human **witness** sign-off is opt-in —
only an author-declared human UAT ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)
/ [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)). The adoption
**decision** is a separate human act, always required to enter the process.

**5. A brownfield capability greens via the adopted gate that COVERS it; an uncovered/untested cap keeps
the story `proposed`.** `rollupStoryGreen` requires every capability `healthy`, but a brownfield cap has
no per-cap driven verdict. A `mapped` story's capability clause is satisfied per-cap by EITHER the cap's
own signed verdict OR an adopted `observe` gate that DECLARES it covered — a new `(covers: <cap-ids>)`
gate annotation, parsed like the existing `(gate: <kind>)` tag
([reliability-gates.ts](../../packages/library/src/reliability-gates.ts)). A cap covered by no honest
observe gate — `seed-corpus-scripts`, which the library suite only smoke-imports — is NOT green and holds
the crown at `proposed` until its `build-tests` gate is genuinely driven. This is what makes a green crown
MEAN the untested pockets got real coverage. *(Refines ADR-0083 Fork A's caps clause for the
brownfield-with-capabilities case; `(covers:)` is the proposed mechanism, syntax polished in build.)*

**6. A would-be (unscripted) UAT leg is aspirational, not green-blocking.** A `## Story UAT` leg becomes
a hard own-proof obligation only when it is actually witnessable — a real machine/scripted test signs it,
or a declared human witness attests it. The library's seven `_(witness: machine)_` legs describe a
journey with "no scripted UAT today"; they record intent and must not wedge the crown until a real test
backs them. A brownfield story's hard floor is its `## Reliability Gates`.

## Consequences

**Good.**
- Brownfield green stops being a rubber-stamp AND stops being "too easy": a green crown is earned by real
  work on the untested pockets, with the work and the key decisions surfaced *first*.
- `proposed` becomes an honest **"adoption underway"** state — the world distinguishes untouched
  brownfield (`mapped`/brown) from in-progress adoption (`proposed`/amber) from proven (`healthy`/green).
- Honest provenance end-to-end: the machine signs what it witnessed (spine principal), the human owns
  what they decided (`approvedBy` + escalated forks). Neither pretends to be the other.
- `green = a signed verdict` (ADR-0020) and `mapped never self-reports green` (ADR-0007) both stand; this
  refines the PATH to green, not the bar.
- The CLI friction the owner objected to is removed (the studio surfaces the adoption process, not
  copy-paste `gate run` commands) without making green a one-click flip.

**Bad / costs / follow-on (surfaced, not buried) — the model is DECIDED; the infrastructure was largely
NOT BUILT at decision time (the load-bearing caveat the owner flagged; both headline gaps have since
been built — see the dated updates below).**
- **The adoption proposal / feedback mechanism does not exist.** There is no surface today for the spine
  to analyze a brownfield story's coverage and present "adopt-able vs needs-`build-tests` vs
  decisions-I-need-from-you." Building it is the substantive new work this ADR names. *(Update 2026-06-27:
  the Layer-2 JUDGMENT half + a CLI surface are now BUILT — `assembleProposal` / `renderProposedGate` /
  `parsePocketReadings` in `@storytree/orchestrator` stamp each uncovered pocket's observe/R1/R2 class from
  the agent's injected per-pocket reading, emit recommend-only `ProposedGate` stanzas that round-trip the
  real reliability-gate parser, and partition the surfaced forks through the owner-fork bar;
  `storytree adopt plan <story> --readings <file>` renders the full proposal. Recommend-only (d.4) — it
  authors and greens nothing; the in-studio panel remains the open follow-on. The work-hierarchy home is
  the `adoption-pocket-classifier` capability under `drive-machinery`.)*
- **The inner loop is mechanical.** Today it drives a hand-registered net-new test red→green; it does not
  yet author `build-tests` gates for discovered gaps, perform the refactoring those pockets need, or
  escalate key design decisions mid-build. A less-mechanical, decision-escalating inner loop is required
  for the `build-tests` half — named follow-on, not assumed. *(Update 2026-06-23: this named follow-on is
  now designed and BUILT — [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)
  defines the R1/R2 red taxonomy, the gate→loop wiring, and the up-front decision sweep, and its live
  pilot drove `seed-corpus-scripts`'s `library#gate-4` to a real signed driven green.)*
- **Buildable now (the cheap layer):** the studio Adopt action that flips `mapped → proposed`, adopts the
  `observe` gates (the existing `observeAndSign`, re-signed by the spine principal with `approvedBy`), the
  `(covers:)` annotation + the crown-coverage refinement to `rollupStoryGreen`, and the would-be-UAT
  relaxation. These green nothing on their own — they leave the library honestly `proposed` with its
  remaining work visible.
- **Per-capability DISPLAY now matches §5 (clarification, 2026-06-25 — not a re-decision).** §5's *"a
  brownfield capability greens via the adopted gate that covers it"* was first wired ONLY into the crown
  rollup (`rollupStoryGreen`), so a green crown could float over still-brown plants in the CLI `storytree
  tree` and the studio world — an internally-contradictory half-application of §5, not a second decision.
  The owner chose **Option A** (a capability covered by a healthy gate renders the SAME full green as an
  own-driven cap, so the crown and its plants tell ONE story) over Option B (a distinct "covered/adopted"
  hue) and Option C (keep plants brown, fix only the crown wording). §5's intent is honored, not changed:
  green still derives from the covering gate's SIGNED verdict — never authored `status:` paint, so
  [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) decision 1's anti-hand-painting
  wall holds (the authored `status: mapped/proposed` column is unchanged), and the adopted-vs-driven
  distinction stays in the verdict `proofMode` + reliability-gate sub-signals, not the plant hue. Landed
  as a shared `rollupCapStatus` the crown clause and every display now both sit behind (so they can never
  diverge again): `packages/orchestrator/src/proof/uat-proof.ts`, `packages/cli/src/tree.ts`,
  `apps/studio/server/apiRouter.ts` (`applyCapCoverage`).
- **A new `approvedBy` on the verdict shape** (`@storytree/proof-protocol` `Verdict`) is implied — an
  optional human-approver field distinct from `signer`. A schema decision to confirm in build.
- **Related but separable (surfaced, not decided here):** the owner's "human sign-off should be opt-in"
  also implies flipping [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)'s
  `absent = human` witness default to `machine`. For reliability gates it is moot (gates are machine by
  construction). Left as its own call.
- **Surface breadth:** when built, the change threads proof-protocol (`approvedBy`) → library
  (`(covers:)` parse) → orchestrator (crown coverage, spine-principal signer) → cli / studio (the
  Adopt-enters-`proposed` surface + the proposal). Held together by reuse of `observeAndSign` and
  `rollupStoryGreen`.

## References

- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — brownfield reliability
  gates + observe/build-tests + the `adopted` mode (**amended**: observe-and-sign is the cheap first step
  of a human-entered proving process, machine-witnessed + human-approved; the deliberate human act is
  split into the author's DECLARATION and the operator's ADOPTION DECISION).
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) — `mapped → healthy` =
  Adopt (**amended**: Adopt ENTERS brown→proposed→green and produces a proposal; it does not flip green,
  and the studio surfaces the process, not copy-paste `gate run`).
- [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — author-defined story
  green, Fork A caps-necessary (**amended**: a brownfield cap's `healthy` is satisfiable by an adopted
  gate that `(covers:)` it).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — verdict-derived green +
  `uat_witness` (the `absent = human` default reserve is surfaced, not flipped). Decision 1's
  anti-hand-painting wall is PRESERVED by the §5 per-capability display completion (Consequences,
  2026-06-25 / Option A): a covered cap's green derives from the covering gate's SIGNED verdict, never
  authored `status:` paint.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) / [ADR-0007](0007-proof-model.md) — `green =
  a signed verdict`; `mapped` never self-reports green (both preserved).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop (the adoption decision +
  the key forks are the human's; the inner loop earns the green).
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the policy under which this ADR's status flip was
  applied.
- `packages/orchestrator/src/proof/observe-and-sign.ts`, `packages/orchestrator/src/proof/uat-proof.ts`
  (`rollupStoryGreen`), `packages/library/src/reliability-gates.ts`,
  `apps/studio/src/components/BuildSection.tsx` (`AdoptPanel`), `apps/studio/server/apiRouter.ts`
  (`storyGoGreen` / `applyUatCrowns`) — the compute + surfaces this model refines.
- `stories/library/story.md` — the canonical brownfield story whose path to green this model defines.
