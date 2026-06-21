---
status: accepted
decided: 2026-06-21
amends: [83, 7]
---
# ADR-0085: Resolve ADR-0083 Fork B: brownfield reliability gates + author-declared observe-and-sign

## Status

accepted (2026-06-21) — resolves the open **Fork B** of [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md)
(which itself left it for "a separate session"), from a direct owner realignment in conversation the
same day. The owner ratified the model — *the story author owns the brownfield green bar; an
observation is a legitimate author-declared criterion that can be added to; brownfield gets its own
`## Reliability Gates` section* — and authorised driving it to completion; the `status:` flip was
applied by this session per [ADR-0084](0084-agents-may-flip-an-adr-green.md). It **amends
[ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md)** (resolving Fork B,
refining decisions 4–5) and **[ADR-0007](0007-proof-model.md)** (the `mapped` exit). It overturns no
honesty wall — `green = a signed verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md))
stands.

## Context

[ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) reframed `mapped` as a
transient bootstrap state with a defined exit, made a story's green obligations author-defined (d.2),
and proposed **observe-and-sign** (d.4) — the spine runs an already-green suite at a clean HEAD and
signs an **`adopted`** verdict — as the brownfield exit off `mapped`. It carried that as **Fork B**,
explicitly unresolved.

The owner worked the fork through several turns, and the landing is sharper than the draft:

1. **Not a rubber-stamp, but not "brown forever" either.** The owner first rejected observe-and-sign as
   a *generic automatic* exit ("assume green unless disproven" applied mechanically) — *"brown→green
   means building or refactoring the node into the system, not rubber-stamping an existing suite."* But
   they equally rejected the opposite (a foundational port stuck at `mapped` until a chance defect):
   the ports should be **brought into the fold and flipped** at a deliberate point.
2. **The story author owns the bar — and an observation is a legitimate *declared* criterion.** The
   resolution is author-agency: *"for brownfield it's the story writer's job to determine what is
   required to turn it green, and it could just be an observation the thing works, that can be added to
   if the observation proves insufficient."* A thinking author *deciding* observation is the right bar
   for *this* node — recorded with transparent `adopted` provenance, and committed to strengthening it —
   is the opposite of a mechanical auto-flip. **Author-agency + transparent provenance + expandability**
   is where the honesty lives, not a ban on observation.
3. **UAT-as-journey does not fit a port; human attestation is the wrong tool.** A pure protocol is
   *"mostly schemas and scaffolding"* — judging it is a machine's job, not a person's, so the human
   `operator-attested` path ([ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md))
   is the wrong fit. The honest path is a **machine** observation.
4. **Brownfield deserves its own surface.** Beyond "observe it works", a brownfield story may need real
   work to become trustworthy — *building tests for code that was not written test-first*, or
   *integrating an existing suite that is not structured as capabilities*. The author should be able to
   declare these as visible requirements so the owner has **honest observability on what the brownfield
   tree is and what is left to do to build reliability** — a list distinct from UAT tests.

ADR-0083 Fork A (story green = caps-healthy AND per-test-UAT-healthy) is already **accepted and built**
(`rollupStoryGreen`, [uat-proof.ts](../../packages/orchestrator/src/proof/uat-proof.ts)); this ADR
composes with it, it does not refork it.

## Decision

**1. Resolve Fork B: the story author owns the brownfield green bar; observe-and-sign is retained as
ONE author-declared mechanism, never an automatic exit.** The system imposes no single mechanism for
`mapped → healthy`. The author declares what flips a brownfield story green (ADR-0083 d.2, generalized).
Observe-and-sign (ADR-0083 d.4) survives — but as a criterion an author *chose and recorded*, not the
default "assume green unless disproven" flip for every `mapped` node. This refines ADR-0007's `mapped`
exit: `mapped` stays *never self-reported green*, and leaves only by a signed verdict the author's
declared obligations earn.

**2. A new `## Reliability Gates` story section — the author-declared brownfield obligation set.**
Distinct from `## Story UAT` (the integrated acceptance journey; a pure port has none). Parsed into
addressable units (`<story>#gate-<n>`, mirroring [ADR-0044](0044-per-uat-test-human-attestation.md)'s
UAT-test units), each earning a real signed verdict; the story greens only when **all** are healthy.
Each gate declares a **kind**:
- **`observe`** — "the existing suite / scaffolding works" → earned by observe-and-sign (decision 3).
- **`build-tests`** — brownfield code with no test-first coverage; the writer *flags the gap* → earned
  by a genuine red→green through the existing gate (real work, real red), not observe-and-sign.
- **`integrate`** — an existing suite not structured as capabilities; wrap it → earned when the
  capability it is folded under greens.

The list is the **expandable floor** the owner asked for: a brownfield story can start with one
`observe` gate and **grow** `build-tests` gates as observation proves insufficient (a defect slips
through, a consumer breaks). An **unsatisfied** gate is the honest-observability payoff — the world /
CLI renders it as "this brown tree has unproven or untested code", so the map shows what *exists*
versus what has been *earned*.

**3. The `observe` gate earns an `adopted` machine verdict (observe-and-sign, homed here).** The spine
runs the gate's declared `proofCommand` (decision 5 of ADR-0083 — the backticked command, now declared
in the gate prose) at a **clean committed HEAD**, observes the exit code **out-of-band** (a process the
spine watched, never a model claim), and on green signs a verdict whose `proofMode` is **`adopted`** — a
new first-class proof mode ([proof-protocol](../../packages/proof-protocol/src/enums.ts) `ProofMode`),
distinct from a gate-driven tier pass *and* from `operator-attested`, so the weaker basis is first-class
and renderable. The verdict is pinned to the commit + a resolved signer and persists to `events.verdict`
or it greens nothing. **Every honesty wall of the gate holds except the prior-red requirement** (job 2);
for a reviewed existing suite, review supplies it, and the `adopted` mode records that it was *adopted*,
not *driven*. Fail-closed: a dirty tree, a non-zero exit, or a missing/unparseable command refuses and
signs nothing.

**4. `build-tests` and `integrate` are DECIDED here; their satisfaction engines are named follow-on.**
The parser records all three kinds now, so the model and the honest observability are complete, but
only `observe` has a built satisfaction path this PR. `gate run` **refuses** a `build-tests`/`integrate`
gate (they are not observe-and-signable — fail-closed), naming the real path: a red→green build, or a
capability. Wiring those is follow-on (see Consequences).

**5. Story green extends Fork A with the reliability-gate clause — by feeding the existing roll-up the
union of obligations.** Story green = (all capabilities `healthy`) AND (the story's **own-proof
obligations** — its per-test UAT tests **and** its reliability gates — all `healthy`, at least one
declared). Mechanically this needs **no change to Fork A's `rollupStoryGreen` logic**: the crown
callers pass the **union** of UAT-test ids + reliability-gate ids as the own-proof obligation list, so
Fork A's AND-rule and its vacuous-empty guard (a story with zero obligations never greens — no
green-by-emptiness) carry over unchanged. A pure port (zero capabilities, zero UAT, ≥1 reliability
gate) greens **entirely** from its reliability gates.

**6. The two foundational ports move their machine UAT legs into `## Reliability Gates` as `observe`
gates.** `proof-protocol` and `storage-protocol` declared `_(witness: machine)_` "run the suite" /
cross-boundary legs under `## Story UAT`; UAT-as-journey does not fit a port, so those become `observe`
reliability gates carrying their inline `proofCommand`. `storytree gate run <port>#gate-<n> --pg`
observe-and-signs each, and the port flips off `mapped` to a signed-`adopted` green.

## Consequences

**Good.**
- Brownfield / foundational stories reach an **honest signed green** without faking a red, at a
  **deliberate author-chosen moment** — `mapped` is neither a rubber-stamp away nor a dead end.
- The **author owns the brownfield bar** and the owner gets **honest observability**: `## Reliability
  Gates` shows, per brownfield story, exactly what is assumed (`observe`) versus what reliability work
  is still owed (`build-tests` / `integrate`).
- `green = a signed verdict` is **preserved**; the `adopted` `ProofMode` makes the observe basis
  first-class and renderable — never silently equated with a driven red→green pass.
- The rubber-stamp the owner rejected is excluded **by construction**: there is no automatic
  mapped→green flip; every green is an author-declared obligation earning a signed verdict.

**Bad / costs / follow-on (surfaced, not buried).**
- **`observe` trades away "the test provably failed once"** (job 2). Recorded as `adopted` provenance;
  the author supplies job 2 by review, and the gate may be *strengthened* into a `build-tests` red→green
  later. This is the deliberate, transparent weakening — not a hidden one.
- **BUILT with this ADR:** `ProofMode` `adopted` (proof-protocol); `ReliabilityGate` + the
  `## Reliability Gates` parser (`@storytree/library`); the gate parse onto `NodeSpec`
  (`node-spec.ts`); the `observeAndSign` compute (`@storytree/orchestrator`, red→green tested); the
  `storytree gate list` / `gate run <id> --pg` CLI surface; the story-green crown wiring (CLI `tree` +
  studio `applyUatCrowns`, fed the obligation union); and the two ports' `## Reliability Gates`.
- **NAMED follow-on (decided, not built):** the `build-tests` and `integrate` satisfaction engines; the
  studio rendering of *pending* gates as a visible reliability-gap layer (the crown shows the rolled-up
  state today; the per-gate gap surface is the visual unit); a story-level `gate run <story>` convenience.
- **Surface breadth:** the change spans six packages (proof-protocol → library → orchestrator → cli →
  studio → the two stories) because the `adopted` vocabulary and the obligation set thread end to end.
  Held together by reuse — the gate parser mirrors the UAT-test parser, the roll-up reuses Fork A.

## References

- [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — author-defined story
  green; **Fork B resolved here** (decisions 4–5 refined: observe-and-sign is author-declared, homed in
  `## Reliability Gates`, and given a first-class `adopted` mode).
- [ADR-0007](0007-proof-model.md) — proof modes incl. `mapped` (amended: the `mapped` exit is the
  author's declared obligation set earning a signed verdict; a new `adopted` machine mode is added).
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) — per-test UAT verdicts
  + AND-roll-up (reused: reliability gates roll up identically; the crown ANDs the obligation union).
- [ADR-0044](0044-per-uat-test-human-attestation.md) — per-test UAT units + the prose parser the
  reliability-gate parser mirrors.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed gate verdict`,
  preserved (observe-and-sign keeps every wall except prior-red).
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the policy under which this ADR's `status:` flip
  was applied.
- [open-questions.md §2](../open-questions.md) — the brownfield mapping mechanism (this, with ADR-0083,
  answers it: an author-declared `## Reliability Gates` set, `observe` earning an `adopted` verdict).
- `packages/proof-protocol/src/enums.ts`, `packages/library/src/reliability-gates.ts`,
  `packages/orchestrator/src/proof/observe-and-sign.ts`, `packages/cli/src/gate.ts`,
  `stories/proof-protocol/story.md`, `stories/storage-protocol/story.md` — the compute + surfaces this
  ADR builds.
</content>
</invoke>
