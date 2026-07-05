---
id: "adoption-pocket-classifier"
tier: capability
story: drive-machinery
title: "The adoption-proposal pocket classifier (observe / R1 / R2)"
outcome: "The spine turns each uncovered brownfield pocket into a proposed reliability gate with a build-tests classification and the key forks the human must settle."
status: mapped
proof_mode: integration-test
depends_on: [build-drive-cli]
# Deciding ADRs (ADR-0037 §2): the proving-process model that NAMED this gap (97), the build-tests
# R1/R2 taxonomy + the up-front decision sweep whose input this fills (98), the observe/build-tests
# gate KIND it proposes (85). The design forks the first authoring surfaced (input seam,
# recommend-vs-auto-author, fork recording) were settled by 97 d.4 + 98 d.5's ratified model —
# see `## Design forks (settled)`; no further ADR was needed.
decisions: [97, 98, 85]
---

# The adoption-proposal pocket classifier (observe / R1 / R2)

**Outcome —** The spine turns each uncovered brownfield pocket into a proposed reliability gate with a
build-tests classification and the key forks the human must settle.

**Depends on —** [`build-drive-cli`](build-drive-cli.md) — the classifier extends the `adopt plan`
surface (where the structural covers-diff already renders) and emits gate stanzas the build-drive CLI's
`gate run --real` then drives; it reads the same loaded `NodeSpec` (caps + reliability gates) that the
build drive resolves.

> **Proof status (honest) — `mapped` (brownfield): built outer-loop 2026-06-27, observationally
> green, never gate-driven.** The behaviour was hand-built and landed via the ordinary gate→PR path
> (commit `2c170db`, on `main`), so it never earned a driven verdict — the same brownfield shape as
> the story's other 17 capabilities. Every contract below is proven by a real, passing, OFFLINE test:
> the judgment half [`assembleProposal`](../../packages/orchestrator/src/proof/adoption-proposal.ts)
> + `renderProposedGate` + the `parsePocketReadings` boundary live beside the mechanical
> `classifyAdoption` in `@storytree/orchestrator` (suite: `adoption-proposal.test.ts`), and the CLI
> surface (`adopt plan --readings`) is proven in `@storytree/cli` (`adopt-plan.test.ts:106`). The
> whole compute is pure-by-injection (no store / git / clock), so there is NO live `proposed` pocket;
> coverage is the story's gate-1 observe (the orchestrator suite).

## Guidance

This was the substantive new work [ADR-0097](../../docs/decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
named in its Consequences — *"The adoption proposal / feedback mechanism does not exist"* — now built.
ADR-0098 §1 pins its job: *"Classifying each gap into observe / R1 / R2 is the adoption-proposal's job
(Layer 2); Layer 3 consumes the classification."*

**Where it sits in the three layers (ADR-0098 §7).** Layer 1 (the `proposed`-state model + the
`(covers:)` crown-coverage) is built. Layer 2's MECHANICAL half (the covers-diff + the `adopt plan`
report + the studio surfaces) is built. Layer 3 (the `build-tests`-capable inner loop —
`driveBuildTestsGate`, `gate run <gate> --real`) is built and consumes a hand-fed gate + agent-supplied
forks. **This capability is the JUDGMENT half of Layer 2** — it fills `classifyAdoption`'s
`PocketClass` slot from the agent's injected reading and PRODUCES the `DecisionFork[]` input
`sweepDecisions` / `driveBuildTestsGate` consume: `assembleProposal` (the enriched proposal),
`renderProposedGate` (the stanza renderer), `parsePocketReadings` (the fail-closed JSON boundary
behind `adopt plan --readings <file>`).

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
honestly make. So the built seam draws the line precisely: the pure compute ASSEMBLES the proposal from
the structural diff + the agent's per-pocket reading (injected as a `PocketReading` map, validated at
the JSON boundary by `parsePocketReadings`), partitions the forks by the deterministic owner-fork bar
([`classifyFork`](../../packages/orchestrator/src/proof/decision-sweep.ts)), and refuses to INVENT a
classification it cannot ground. The agent supplies judgment; the spine supplies the deterministic
ruler and the honest assembly — the same Layer-2 ↔ Layer-3 split `sweepDecisions` already embodies.

**What it emits (the proposal as data, the build hand-off).** A `ProposedGate` per classified uncovered
pocket carrying: the `kind` (`observe` | `build-tests`), the `(covers:)` cap id(s), the R1/R2 `redKind`
for a `build-tests` gate, and the suggested `proofCommand` / `(build:)` node reference. This is the
exact shape the author writes into a story's `## Reliability Gates` and that `gate run --real` then
drives — `renderProposedGate` renders the stanza body and the round-trip through the REAL
`parseReliabilityGates` is the honesty oracle, so a recommendation is a valid floor entry, never free
text. The proposal is a CANDIDATE the human reviews, never an auto-written gate. It also threads each
pocket's surfaced design forks into the `sweepDecisions` partition (escalated vs routine), so the
proposal's "decisions I need from you" section IS the up-front batch sweep viewed from Layer 2 — one
surface, not two.

**Honesty walls inherited, not re-invented.** The classifier RECOMMENDS; it never signs, never flips a
status, never writes the decision log. `green = a signed verdict` (ADR-0020) is untouched — a proposed
`build-tests` gate greens nothing until `gate run --real` drives it. The machine never authors an ADR
or resolves a fork; it surfaces them for the human (ADR-0097 d.4). A pocket the classifier cannot
honestly classify (the agent supplied no reading) is reported as `unclassified` — `classifyAdoption`'s
fail-closed default preserved, never silently guessed as `observe`.

## Integration test

**Goal —** Given a real brownfield story spec (a `mapped`/`proposed` story with uncovered
capabilities) and an injected per-pocket agent reading, the classifier runs against the REAL
`classifyAdoption` covers-diff, the REAL `parseReliabilityGates` round-trip oracle, and the REAL
`classifyFork` fork bar, and emits: the covered set unchanged, each uncovered pocket carrying its
`observe`/`R1`/`R2` verdict, a well-formed `ProposedGate` stanza per classified pocket, and the
surfaced forks partitioned escalated-vs-routine — with an un-read pocket reported `unclassified`,
never guessed.

Proven end-to-end at the CLI surface: `storytree adopt plan <story> --readings <file>` renders the
enriched proposal — stamped classes, recommended gate stanzas, the decision sweep
(`packages/cli/src/adopt-plan.ts`; `packages/cli/src/adopt-plan.test.ts:106`). Without `--readings`
the plan stays the mechanical covers-diff (`pocket: unclassified` for every uncovered cap).

## Contracts (4)

Each is **one isolated automated test** against real in-story collaborators (no stubs;
integration-test proof mode, ADR-0010 §2), in
[`packages/orchestrator/src/proof/adoption-proposal.test.ts`](../../packages/orchestrator/src/proof/adoption-proposal.test.ts).

1. **`classifies-uncovered-pockets`** — each uncovered pocket carries its injected observe/R1/R2 verdict, covered caps are unchanged
   - **asserts —** given a story's caps + gates + a per-pocket agent reading map, `assembleProposal`
     runs the real `classifyAdoption` covers-diff, leaves every `covered` cap untouched, and stamps
     each `uncovered` cap with the agent-supplied `observe` | `R1` | `R2` `PocketClass`.
   - **covers —** the `PocketClass` slot the structural compute leaves `unclassified`
     (`packages/orchestrator/src/proof/adoption-proposal.ts`).
   - **proven by —** `adoption-proposal.test.ts:181` (REAL, passing).
2. **`emits-proposed-gate-stanzas`** — each classified pocket yields a parseable candidate reliability-gate stanza
   - **asserts —** for each classified pocket the classifier emits a `ProposedGate` (`observe` bare;
     `R1`/`R2` → kind `build-tests` with the `redKind` marker + the `(build:)` node), and the rendered
     markdown round-trips back through the REAL `parseReliabilityGates` to an equivalent
     `ReliabilityGate` — so the recommendation is a valid floor entry, not free text.
   - **covers —** the proposal→`## Reliability Gates` hand-off shape
     (`packages/library/src/reliability-gates.ts` is the round-trip oracle).
   - **proven by —** `adoption-proposal.test.ts:207` (emission shape) + `:314`/`:335` (the
     build-tests and observe round-trips through the REAL parser) (REAL, passing).
3. **`unreadable-pocket-stays-unclassified`** — a pocket with no agent reading is reported unclassified, never guessed
   - **asserts —** when the injected reading map omits an uncovered pocket, that pocket's `PocketClass`
     stays `unclassified` and NO `ProposedGate` is emitted for it (the fail-closed default — the
     classifier never silently picks `observe`); the `parsePocketReadings` boundary is likewise
     fail-closed (a bad class or unknown field is refused, never dropped).
   - **covers —** the fail-closed honesty wall (preserves `classifyAdoption`'s default).
   - **proven by —** `adoption-proposal.test.ts:241` (+ `:370`/`:376` for the boundary) (REAL, passing).
4. **`partitions-the-key-forks`** — the surfaced design forks are partitioned escalated-vs-routine by the owner-fork bar
   - **asserts —** the per-pocket surfaced `DecisionFork[]` are run through the REAL `sweepDecisions` /
     `classifyFork`, and the proposal's sweep reports the escalated (owner-call) set separately from
     the routine (leaf) set — the same partition `driveBuildTestsGate` gates the spend on, so the
     proposal and the drive can never disagree on what is the owner's call.
   - **covers —** the Layer-2 view of the up-front batch sweep
     (`packages/orchestrator/src/proof/decision-sweep.ts`).
   - **proven by —** `adoption-proposal.test.ts:265` (REAL, passing).

## Design forks (settled)

The three forks the first authoring surfaced as owner calls, and how each settled in the built shape
(the owner ratified the ADR-0098 model + U1–U5 decomposition 2026-06-23; the judgment half landed
under it 2026-06-27):

1. **Where the observe/R1/R2 JUDGMENT comes from (the input seam) — settled: injected data.** The pure
   compute takes the per-pocket reading as INJECTED DATA (`PocketReading`, keyed by cap id; the
   orchestrator / story-author session supplies it, exactly as it supplies `DecisionFork[]` to
   `driveBuildTestsGate`), validated fail-closed at the JSON boundary (`parsePocketReadings`, behind
   `adopt plan --readings <file>`). The compute stays offline-testable and embeds no brittle static
   heuristic. An LLM-judged classifier subagent remains a heavier v2 the seam does not preclude (it
   would fill the same injected slot).
2. **Recommend vs auto-author the candidate gates — settled: recommend-only (ADR-0097 d.4).** The
   proposal emits the stanzas as DATA (`ProposedGate` + `renderProposedGate`); the human (or a
   separate, explicit authoring act) writes them into the story spec. The machine stays off the
   authored-spec write path — `adopt plan` is read-only. Auto-authoring remains a possible later
   extension once the recommend surface is trusted; nothing in the built shape precludes it.
3. **How a raised fork is recorded — settled: surface-only.** The classifier SURFACES each fork in the
   sweep partition (escalated vs routine) and the orchestrator session chooses the durable home per
   the existing owner-fork bar (an OQ for a within-story call, a reserved ADR for a cross-cutting
   one). The classifier writes neither — "the machine never writes the decision log" holds.
