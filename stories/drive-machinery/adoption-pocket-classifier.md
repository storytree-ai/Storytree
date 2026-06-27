---
id: "adoption-pocket-classifier"
tier: capability
story: drive-machinery
title: "The adoption-proposal pocket classifier (observe / R1 / R2)"
outcome: "The spine turns each uncovered brownfield pocket into a proposed reliability gate with a build-tests classification and the key forks the human must settle."
status: proposed
proof_mode: integration-test
depends_on: [build-drive-cli]
# Deciding ADRs (ADR-0037 §2): the proving-process model that NAMES this gap (97), the build-tests
# R1/R2 taxonomy + the up-front decision sweep this fills the input of (98), the observe/build-tests
# gate KIND it proposes (85). ADR pending for the fork-recording axis (see `## Open modeling calls`).
decisions: [97, 98, 85]
---

# The adoption-proposal pocket classifier (observe / R1 / R2)

**Outcome —** The spine turns each uncovered brownfield pocket into a proposed reliability gate with a
build-tests classification and the key forks the human must settle.

**Depends on —** [`build-drive-cli`](build-drive-cli.md) — the classifier extends the `adopt plan`
surface (where the structural covers-diff already renders) and emits gate stanzas the build-drive CLI's
`gate run --real` then drives; it reads the same loaded `NodeSpec` (caps + reliability gates) that the
build drive resolves.

> **Proof status (honest) — `proposed` (net-new behaviour, no test yet).** This capability does not
> exist as behaviour today. The MECHANICAL half it builds on IS proven —
> [`classifyAdoption`](../../packages/orchestrator/src/proof/adoption-proposal.ts) (the covers-diff) and
> [`sweepDecisions`](../../packages/orchestrator/src/proof/decision-sweep.ts) (the fork partitioner)
> both have green offline suites — but each stops at the boundary this capability crosses:
> `classifyAdoption` emits `pocket: "unclassified"` for every uncovered cap (a deliberately-empty
> `PocketClass` slot, ADR-0098 §1), and `sweepDecisions` CONSUMES agent-supplied `DecisionFork[]` rather
> than PRODUCING them. Nothing turns an uncovered pocket into an `observe`/`R1`/`R2` verdict or into a
> candidate gate. Every contract below is a **would-be** test.

## Guidance

This is the substantive new work [ADR-0097](../../docs/decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
names in its Consequences: *"The adoption proposal / feedback mechanism does not exist. There is no
surface today for the spine to analyze a brownfield story's coverage and present 'adopt-able vs
needs-`build-tests` vs decisions-I-need-from-you.'"* ADR-0098 §1 pins its job: *"Classifying each gap
into observe / R1 / R2 is the adoption-proposal's job (Layer 2); Layer 3 consumes the classification."*

**Where it sits in the three layers (ADR-0098 §7).** Layer 1 (the `proposed`-state model + the
`(covers:)` crown-coverage) is built. Layer 2's MECHANICAL half (the covers-diff + the `adopt plan`
report + the studio surfaces) is built. Layer 3 (the `build-tests`-capable inner loop —
`driveBuildTestsGate`, `gate run <gate> --real`) is built and consumes a hand-fed gate + agent-supplied
forks. **This capability is the JUDGMENT half of Layer 2** — the deliberately-empty slot between the
mechanical covers-diff and the inner loop. It fills `classifyAdoption`'s `PocketClass` slot and PRODUCES
the `DecisionFork[]` input `sweepDecisions` / `driveBuildTestsGate` already consume.

**The classification it produces (the ADR-0098 d.1 taxonomy).** For each UNCOVERED pocket of a
brownfield story being adopted, exactly one of:

- **`observe`** — untested but CORRECT and testable-as-is (a characterization test would pass on
  arrival). Earned by `observeAndSign` → an `adopted` verdict. NOT a `build-tests` target — forcing a
  fake red here is the theater ADR-0085/0097 ban.
- **`R1` — behavioural red** — untested AND incomplete/incorrect against its contract. Earned by the
  existing `editsExisting` red→green (ADR-0057): a regression test that fails against current code → fix
  → green.
- **`R2` — refactor-for-testability red** — untested, CORRECT, but UNTESTABLE as-is (entry-guarded
  `main()`, a raw `Pool`, no seam). Earned by a behaviour-preserving refactor that introduces a seam → a
  structural (missing-symbol) red → the whole-package-suite green (the regression wall, ADR-0098 d.2).
- **`already-covered`** — a `(covers:)` gate already names it (the structural covers-diff's `covered`
  set). Not re-classified; surfaced so the proposal is whole.

**The classifier is semi-automated by design (the honesty seam).** The covered-vs-uncovered split is
mechanical and deterministic (the existing covers-diff). The observe/R1/R2 call requires reading the
code — *is this pocket correct? testable-as-is?* — which is **agent analysis** (the orchestrator /
story-author session's pre-build pocket reading, ADR-0098 §5), NOT a heuristic the pure compute can
honestly make. So this capability draws the line precisely: the pure compute ASSEMBLES the proposal from
the structural diff + the agent's per-pocket reading (injected as data), partitions the forks by the
deterministic owner-fork bar ([`classifyFork`](../../packages/orchestrator/src/proof/decision-sweep.ts)),
and refuses to INVENT a classification it cannot ground. The agent supplies judgment; the spine supplies
the deterministic ruler and the honest assembly — the same Layer-2 ↔ Layer-3 split `sweepDecisions`
already embodies (*"the agent supplies judgement, the spine supplies the deterministic ruler"*).

**What it emits (the proposal as data, the build hand-off).** A `ProposedGate` per uncovered pocket
carrying: the `kind` (`observe` | `build-tests`), the `(covers:)` cap id(s), the R1/R2 marker for a
`build-tests` gate, and the suggested `proofCommand` / `(build:)` node reference. This is the exact
shape the author writes into a story's `## Reliability Gates` and that `gate run --real` then drives — so
the proposal is a CANDIDATE the human reviews, never an auto-written gate (the recommend-vs-author fork
is the human's; see `## Open modeling calls` #2). It also threads each pocket's surfaced design forks
into the `sweepDecisions` partition (escalated vs routine), so the proposal's "decisions I need from
you" section IS the up-front batch sweep viewed from Layer 2 — one surface, not two (the design doc's
"build them as one `adopt-plan`/sweep command" steer).

**Honesty walls inherited, not re-invented.** The classifier RECOMMENDS; it never signs, never flips a
status, never writes the decision log. `green = a signed verdict` (ADR-0020) is untouched — a proposed
`build-tests` gate greens nothing until `gate run --real` drives it. The machine never authors an ADR
or resolves a fork; it surfaces them for the human (ADR-0097 d.4). A pocket the classifier cannot
honestly classify (the agent supplied no reading) is reported as `unclassified` — the current
`classifyAdoption` behaviour preserved as the fail-closed default, never silently guessed as `observe`.

## Integration test

**Goal (would-be) —** Given a real brownfield story spec (a `mapped`/`proposed` story with uncovered
capabilities) and an injected per-pocket agent reading, run the classifier against the REAL
`classifyAdoption` covers-diff, the REAL `ReliabilityGate` parser, and the REAL `classifyFork` fork bar,
and assert it emits: the covered set unchanged, each uncovered pocket carrying its `observe`/`R1`/`R2`
verdict, a well-formed `ProposedGate` stanza per `build-tests` pocket (parseable back through
`parseReliabilityGates`), and the surfaced forks partitioned escalated-vs-routine — with an
un-read pocket reported `unclassified`, never guessed.

So the integration test for this capability is **would-be**: today `adopt plan` renders only the
mechanical covers-diff (`pocket: unclassified` for every uncovered cap, verified by running
`storytree adopt plan drive-machinery`), and no test exercises a finer classification because the
behaviour does not exist.

## Contracts (4)

The would-be leaf behaviours — each would be **one isolated automated test** against real in-story
collaborators (no stubs; integration-test proof mode, ADR-0010 §2). All are currently would-be tests.

1. **`classifies-uncovered-pockets`** — each uncovered pocket carries its injected observe/R1/R2 verdict, covered caps are unchanged
   - **asserts —** given a story's caps + gates + a per-pocket agent reading map, the classifier runs
     the real `classifyAdoption` covers-diff, leaves every `covered` cap untouched, and stamps each
     `uncovered` cap with the agent-supplied `observe` | `R1` | `R2` `PocketClass`.
   - **covers —** the `PocketClass` slot the structural compute leaves `unclassified`
     (`packages/orchestrator/src/proof/adoption-proposal.ts`).
   - **would-be test —** no test asserts a non-`unclassified` `PocketClass` today (the slot is empty).
2. **`emits-proposed-gate-stanzas`** — each build-tests pocket yields a parseable candidate reliability-gate stanza
   - **asserts —** for each `R1`/`R2` pocket the classifier emits a `ProposedGate` (kind `build-tests`,
     the `(covers:)` cap id, the R1/R2 marker, a `(build:)` node + suggested `proofCommand`) whose
     rendered markdown round-trips back through the REAL `parseReliabilityGates` to an equivalent
     `ReliabilityGate` — so the recommendation is a valid floor entry, not free text.
   - **covers —** the proposal→`## Reliability Gates` hand-off shape
     (`packages/library/src/reliability-gates.ts` is the round-trip oracle).
   - **would-be test —** no proposal-to-gate emission exists yet.
3. **`unreadable-pocket-stays-unclassified`** — a pocket with no agent reading is reported unclassified, never guessed
   - **asserts —** when the injected reading map omits an uncovered pocket, that pocket's `PocketClass`
     stays `unclassified` and NO `ProposedGate` is emitted for it (the fail-closed default — the
     classifier never silently picks `observe`).
   - **covers —** the fail-closed honesty wall (preserves `classifyAdoption`'s current default).
   - **would-be test —** the guard does not exist because the finer classification does not exist.
4. **`partitions-the-key-forks`** — the surfaced design forks are partitioned escalated-vs-routine by the owner-fork bar
   - **asserts —** the per-pocket surfaced `DecisionFork[]` are run through the REAL `sweepDecisions` /
     `classifyFork`, and the proposal's "decisions" section reports the escalated (owner-call) set
     separately from the routine (leaf) set — the same partition `driveBuildTestsGate` gates the spend
     on, so the proposal and the drive can never disagree on what is the owner's call.
   - **covers —** the Layer-2 view of the up-front batch sweep
     (`packages/orchestrator/src/proof/decision-sweep.ts`).
   - **would-be test —** no surface composes the classification with the fork partition today.

## Open modeling calls (for the owner)

1. **Where the observe/R1/R2 JUDGMENT comes from (the input seam).** The covers-diff is mechanical; the
   per-pocket "correct? testable-as-is?" call is reasoning over code. Recommendation (settled in the
   design doc's open-questions): the pure compute takes the per-pocket reading as INJECTED DATA (the
   orchestrator / story-author session supplies it, exactly as it already supplies `DecisionFork[]` to
   `driveBuildTestsGate`), so the compute stays offline-testable and never embeds a brittle static
   heuristic. The alternative — an LLM-judged classifier subagent invoked inside the command — is a
   heavier v2 that this capability's seam does not preclude (it would just fill the same injected slot).
2. **Recommend vs auto-author the candidate gates.** Whether the proposal AUTHORS the `## Reliability
   Gates` stanzas into the story spec (a Library write) or only RECOMMENDS them as data for the human to
   paste/approve. Recommendation: **recommend-only** for v1 (slow-growth minimum-to-green) — the
   classifier emits the stanzas as data and the human (or a separate, explicit authoring act) writes
   them, keeping the machine off the authored-spec write path and honouring "the human owns what they
   decided" (ADR-0097 d.4). Auto-authoring is a clean later extension once the recommend surface is
   trusted. **This is an owner call — surfaced, not assumed.**
3. **How a raised fork is recorded.** A surfaced key fork can be recorded as a comment / open-question
   in the signal graph (ADR-0032) OR as a reserved ADR fork (`storytree adr new --pg`, for an
   ADR-worthy fork). Recommendation: the classifier SURFACES the fork in its output and lets the
   orchestrator session choose the durable home per the existing owner-fork bar (an OQ for a
   within-story call, a reserved ADR for a cross-cutting one) — the classifier does not itself write
   either, preserving "the machine never writes the decision log." **Owner call.**
