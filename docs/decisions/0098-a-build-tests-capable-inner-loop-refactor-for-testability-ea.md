---
status: accepted
load_bearing: true
decided: 2026-06-23
amends: [85]
---
# ADR-0098: A build-tests-capable inner loop: refactor-for-testability earns the brownfield build-tests gate

## Status

accepted (2026-06-23) — the owner **ratified the model AND the U1–U5 build decomposition** on
2026-06-23 (decision D1 of a four-decision owner batch), and the build is now **underway,
incrementally**. The three load-bearing scope calls the owner set stand: **design-only was the prior
session** (this ADR landed the model + the build decomposition with no code; building begins now), the
**pilot is `seed-corpus-scripts`** (one library pocket, U5), and **decision-escalation is a batch
sweep up-front** (not mid-build pause/resume, the owner's Q3 call). The R1/R2 red taxonomy,
refactor-for-testability, the regression-wall-as-suite, and the gate→loop wiring below are the ratified
model. **Build status:** **U1** (the R2 `refactorForTests` author mode) + **U3** (the
regression-wall-as-suite oracle) in `packages/orchestrator` and **U2** (the gate→loop wiring —
`gate run <story>#gate-N --real` drives the build-tests engine and signs a driven verdict for the
gate id) and **U4** (the batch decision-sweep surface — the pre-build owner-fork-bar classifier
`classifyFork`/`sweepDecisions` in `packages/orchestrator`, consulted by the `gate run --real` driver
before any spend so an unresolved key fork HALTS fail-closed) have landed; **U5 (the live pilot) has
now LANDED** — `gate run 'library#gate-4' --real --pg` drove the `seed-corpus-scripts` R2
refactor-for-testability pilot to a real signed green: a genuine structural red (the missing
behaviour-preserving `runSeed` seam) → whole-package-suite GREEN (the regression wall held) →
typecheck GREEN, signing a **DRIVEN-tier `capability` verdict** (never `adopted`) for `library#gate-4`,
persisted to `events.verdict` — the R2 loop proven end-to-end on a real pocket and the
`seed-corpus-scripts` capability greened via the gate's `(covers:)` annotation. The `status:` flip was
applied by this
session per [ADR-0084](0084-agents-may-flip-an-adr-green.md). It **amends [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)**
(naming and refining the `build-tests` satisfaction engine ADR-0085 d.4 left as "named follow-on, not
built"). It is the load-bearing follow-on [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
flagged ("the inner loop is mechanical … a less-mechanical, decision-escalating inner loop is required
for the `build-tests` half"). It **overturns no honesty wall**: `green = a signed verdict`
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) and `the human owns the outer loop`
([ADR-0030](0030-all-in-on-claude-agent-sdk.md)) both stand — this defines the PATH a build-tests gate
takes to a signed green, and where the human's key calls enter it.

## Context

[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) defined the
`build-tests` reliability-gate KIND — brownfield code with no test-first coverage, "earned by a
genuine red→green through the gate (real work, real red)" — but built **only** the `observe`
satisfaction path (`observeAndSign` → an `adopted` verdict). `build-tests` is **refused everywhere
today**: [`observeAndSign`](../../packages/orchestrator/src/proof/observe-and-sign.ts) and
[`gate run`](../../packages/cli/src/gate.ts) both fail-closed on a non-`observe` kind, pointing
vaguely at `node build --real` — but nothing actually wires a gate id to a build.
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) then made
brown→green a proving process and re-named this as the substantive unbuilt work: *"the inner loop …
does not yet author `build-tests` gates for discovered gaps, perform the refactoring those pockets
need, or escalate key design decisions mid-build."* This ADR is that work, designed.

**The inner loop today drives three author modes over a NODE's `real:` arm**
([resolve-prove-spec.ts](../../packages/orchestrator/src/resolve-prove-spec.ts),
[proof-config.ts](../../packages/orchestrator/src/proof-config.ts)), all walking the same ADR-0020
phase machine (`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`):

- **net-new** — the source does NOT exist yet; the red is a missing-symbol import; IMPLEMENT writes
  the new source.
- **`editsExisting`** (ADR-0057 §3 expansion C) — the source EXISTS at HEAD but its BEHAVIOUR is
  wrong/incomplete; the red is a **regression/behaviour assertion** that fails against current code
  ("a runtime assertion, **not** a missing symbol"); IMPLEMENT edits the existing source.
- **live-smoke / dry-run** — synthetic walks that prove the glue, not a real proof.

None of these earns a reliability GATE, and — the crux — **none fits brownfield code that already
works.** The honest question is: *what is the RED for code that is correct but untested?* A
behavioural test of already-correct code is **green-on-arrival** — exactly the "inverse theater"
[ADR-0097 §2](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) and ADR-0085 ban
("a fake red→green over code with real passing tests"). `editsExisting`'s red presupposes the code is
*wrong*; pure coverage of *correct* code has no behavioural red to offer.

**The pilot pocket shows the full spread.** `seed-corpus-scripts`
([the capability](../../stories/library/seed-corpus-scripts.md), `status: proposed`) is the canonical
brownfield gap, and its three pieces (in
[`load-corpus.ts`](../../packages/library/src/store/load-corpus.ts)) sit at three different points:

1. **`loadCorpus(store)`** — correct AND **already testable as-is**: it takes a `Store`, is
   store-agnostic, and a behavioural test against `InMemoryStore` would pass on arrival. There is no
   honest red here.
2. **The entry-guarded `main()` seed orchestration** — correct but **untestable as-is**: it is
   `import.meta.url`-guarded and wires `createPool → applySchema → loadCorpus → loadComments` with no
   injection point. You cannot test the orchestration without first extracting a seam.
3. **`loadComments(pool)` / `applySchema(pool)`** — correct but **Pg-bound and unseam'd**: they take
   a raw `pg.Pool` and run raw SQL, so the behaviour they *should* expose has no offline test surface.

This spread is exactly why `seed-corpus-scripts` is the right pilot: it forces the design to name what
is a build-tests target and what is not.

## Decision

**1. The build-tests RED taxonomy — two honest reds, and a hard boundary.** A `build-tests` gate
earns a green only through a GENUINE red. There are exactly two honest brownfield reds, plus a third
case that is explicitly *not* build-tests:

- **R1 — behavioural / regression red.** The code is untested AND, on inspection, does not fully meet
  its contract (a latent gap, a hardening). The new test asserts the should-behaviour and **fails
  against current code** → fix → green. **This already exists** as `editsExisting` (ADR-0057 §3 C); a
  build-tests gate of this shape rides it unchanged. The "real work" is the behaviour fix.
- **R2 — refactor-for-testability red.** The code is untested, **correct**, but **untestable as-is**
  (entry-guarded `main()`, a raw `Pool`, no seam). The new test targets a **behaviour-preserving seam
  that does not exist yet** → a **structural red** (a missing-symbol / module-not-found failure) →
  IMPLEMENT performs a **behaviour-preserving refactor** that introduces the seam → green. The "real
  work" is the refactor. **This is the genuinely-new mode this ADR adds.** R2 *inverts* one of
  `editsExisting`'s steers: where `editsExisting` forbids a missing-symbol red, R2 *requires* one (the
  seam isn't there yet).
- **Boundary — code that is untested, correct, AND testable-as-is is NOT a build-tests target.** A
  green-on-arrival test there is **observe / characterization** work (sign `adopted` via the existing
  `observeAndSign`), never build-tests. Forcing a fake red onto it is the theater ADR-0085/0097 ban.
  `loadCorpus` is this case; `main()` and `loadComments` are R2. **Classifying each gap into
  observe / R1 / R2 is the adoption-proposal's job (Layer 2); Layer 3 consumes the classification.**

**2. R2's structural red is exactly as honest as the accepted `net-new` mode, plus a regression
wall — so it needs little new honesty machinery.** `net-new` already trusts a structural red (a
missing-symbol import) plus the brief's insistence on real assertions; the vacuity bound ("did the
test actually assert behaviour?") is the **same standing PR-review/brief bound net-new carries
today**, not a new R2 weakness. R2 then adds a **regression wall**: the proof command for an R2 gate
is the **whole package suite** (e.g. `pnpm --filter @storytree/library test`), so a single oracle
gives both signals at once — RED = the suite is red because the new test cannot resolve its seam
(everything else green); GREEN = the suite is green = **the new test passes AND nothing regressed**.
The behaviour-preservation guarantee that `net-new` cannot give, R2 gets for free from the suite-wide
oracle. **R2 is therefore strictly better-guarded than `net-new`, not weaker.** (A
mutation/fault-injection non-vacuity strengthening is a NAMED optional follow-on, not required for
honesty parity with `net-new`.)

**3. A `build-tests` gate becomes a buildable unit; `gate run --real` drives it.** The `build-tests`
reliability gate carries (or references) a build config of the existing `real:` arm shape
([`RealProofConfig`](../../packages/orchestrator/src/proof-config.ts) — `testFile`, `sourceFile`,
`scope`, `proofCommand` = the package suite, and an R2 marker). `storytree gate run <story>#gate-N
--real --pg` resolves that config and drives [`proveUnit`](../../packages/orchestrator/src/prove-it-gate.ts)
in a fresh worktree, signing the verdict **for the gate id**. This replaces today's flat refusal in
[`gateRun`](../../packages/cli/src/gate.ts) for the `build-tests` kind. `observe` stays
observe-and-sign→`adopted`; `integrate` is unchanged (earned when its capability greens).

**4. A satisfied `build-tests` gate earns a DRIVEN TIER verdict, never `adopted`.** Because it IS a
genuine red→green, its verdict's `proofMode` is the driven tier mode (`capability` / `story`, per
what it proves) — the same a node earns. Only `observe` earns the weaker `adopted`
([proof-protocol `ProofMode`](../../packages/proof-protocol/src/enums.ts) is unchanged; **no new
mode**). This is the whole point of the observe↔build-tests split: a build-tests green carries the
strong driven provenance, distinguishing the pockets that got *real* coverage from those merely
*observed*.

**5. Key design decisions are escalated UP-FRONT (a batch sweep), never guessed (the owner's Q3
call).** Before driving an R2 refactor, a **pre-build decision sweep** analyses the pocket + the gate
and surfaces the KEY design forks to the human (the owner, via the orchestrator session). The bar for
"key" mirrors [the owner-fork bar](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
— escalate **ownership, not uncertainty**: a fork is escalated iff it (a) changes a **public
seam/signature** other code depends on, (b) picks between **materially different refactor strategies**,
or (c) is **cross-cutting or irreversible**. The owner resolves each (an inline answer, or — for an
ADR-worthy fork like growing `storage-protocol` with a comment seam — a reserved ADR fork via `adr
new`); the resolutions are threaded into the leaf's brief, and the loop then runs unattended. A fork
**discovered mid-build** still **halts fail-closed** and surfaces (the existing halt-is-never-a-pass
spine), so the loop *never silently guesses* a key decision — it just doesn't pre-empt with a
pause/resume machine. Routine within-pocket choices (names, test layout) the leaf makes itself.

**6. The pilot is `seed-corpus-scripts`, hand-fed (no Layer-2 dependency).** The pilot proves the R2
loop shape on one pocket by **hand-authoring one `build-tests` gate**, so it does not wait on Layer
2's automated classifier. Concretely:

- **`loadCorpus`** is driven down the **observe/characterization** path (a green-on-arrival test,
  signed `adopted`) — the foil that demonstrates the boundary, not an R2 target.
- **The `main()` orchestration** is the R2 pilot: extract a behaviour-preserving `runSeed(deps)` core
  that `main()` calls; the test asserts the seed sequence (`applySchema → loadCorpus → loadComments`)
  against injected fakes; the structural red is `runSeed` not existing; the refactor introduces it;
  the package suite goes green. **Batch-sweep fork:** the seam shape of `runSeed` (inject a `Pool`, or
  the already-built `Store` + a comment-loader fn?).
- **`loadComments` / `applySchema`** are a second R2 target carrying an **ADR-worthy** batch-sweep
  fork: introduce a narrow offline-testable comment seam (which touches the `storage-protocol`
  boundary) **vs.** keep them Pg-only and cover them with a live-gated test (`real.db: true`). This is
  exactly the kind of fork the sweep escalates rather than the leaf guessing.

**7. Sequencing.** Layer 3 builds on **Layer 1** (the `proposed`-state model + the `(covers:)`
crown-coverage annotation, ADR-0097 d.3/d.5) and **Layer 2** (the adoption proposal that *classifies*
each gap observe / R1 / R2). The general loop consumes Layer 2's classification; the **pilot
decouples** by hand-feeding one gate, so the R2 loop shape can be proven before Layer 2 lands. Build
order: Layer 1 → Layer 2 → Layer 3 (U1–U4 below) → the live pilot (U5).

## Build decomposition (the provable units)

The owner asked for the decomposition alongside the model. Each unit is split by the routing filter
*"does this piece have an isolatable red→green test?"* (not package boundaries), so it is routable to
the inner loop once Layers 1–2 land. U1–U4 are offline-provable; U5 is the live pilot, sequenced last.

- **U1 — the R2 author mode (refactor-for-testability).** A new `real:` marker (e.g.
  `refactorForTests: true`) + the R2 brief in
  [`realPrompts`](../../packages/orchestrator/src/resolve-prove-spec.ts): source exists and is
  *correct* but untestable; introduce a behaviour-preserving seam; the red is the new test failing to
  resolve the seam (a missing-symbol/module red — inverting `editsExisting`'s steer); the green is the
  **whole package suite** green. *Proof (offline):* a scripted-leaf wiring test that an R2 config
  resolves and a structural-red→suite-green walk signs a driven verdict; and that the
  CONFIRM_RED/CONFIRM_GREEN observations use the package-suite oracle. (`resolve-prove-spec.ts`,
  `proof-config.ts`, `node:test`.)
- **U2 — the gate→loop wiring.** Extend the `ReliabilityGate` schema/parser
  ([`reliability-gates.ts`](../../packages/library/src/reliability-gates.ts)) so a `build-tests` gate
  carries/references a build config, and route `gate run <build-tests-gate> --real --pg`
  ([`gate.ts`](../../packages/cli/src/gate.ts)) to resolve it and drive `proveUnit`, signing the
  verdict for the gate id — replacing today's refusal. *Proof (offline):* `gate run` on a `build-tests`
  gate resolves a config and drives the loop (scripted leaf), vs. the current fail-closed refusal.
  (`node:test`.)
- **U3 — the regression-wall-as-suite oracle.** Folded into U1's proof-command choice (the package
  suite), but pinned by its own contract: a refactor that regresses a sibling test turns the suite RED
  → CONFIRM_GREEN fails closed → no verdict. *Proof (offline):* a planted sibling-regression makes the
  R2 walk halt at CONFIRM_GREEN. (`node:test`.)
- **U4 — the batch decision-sweep surface.** A pre-build analysis (a CLI command / an orchestrator
  subagent) that, given a `(pocket, gate)`, emits the KEY forks (by the d.5 bar) for the human, threads
  the resolutions into the leaf brief, and HALTS a mid-build fork fail-closed rather than guessing.
  *Proof (offline):* a key-decision fork halts the drive (no silent guess); a routine choice does not.
  (new module, `node:test`.)
- **U5 — the LIVE pilot (sequenced last; LANDED).** Drove `seed-corpus-scripts`'s hand-authored
  `build-tests` gate end-to-end: the real `runSeed` extraction (a behaviour-preserving seam pulled out
  of the entry-guarded `main()`, with an injectable `SeedDeps` seam asserting the
  `applySchema → loadCorpus → loadComments` sequence against fakes), a real DRIVEN-tier `capability`
  verdict signed for `library#gate-4` and persisted `--pg`. The live proof the whole layer rests on;
  depended on Layers 1–2 + U1–U4.

## Consequences

**Good.**
- `build-tests` stops being a refused stub: the kind ADR-0085 defined finally has an honest
  satisfaction engine, and a green `build-tests` gate MEANS the untested pocket got real, driven
  coverage (ADR-0097 §5's "what makes a green crown mean the untested pockets got real coverage").
- The honest line is drawn precisely: **observe** (testable-as-is, `adopted`) vs **R1** (incorrect,
  behavioural red) vs **R2** (correct-but-untestable, structural red + regression wall). Each green
  carries provenance matched to its basis; neither the rubber-stamp nor the inverse theater can slip
  through.
- R2 reuses the entire existing `real:` worktree machinery (write-scope walls, the one-oracle proof
  command, the SDK leaf, `run_proof`, the spine-side commit + clean-tree gate) — the only genuinely
  new pieces are the R2 brief, the gate→loop wiring, and the batch sweep. **R2 is strictly
  better-guarded than the accepted `net-new` mode** (it adds the regression wall over the same
  structural-red basis).
- The human owns the key forks BEFORE the spend (batch sweep), and `green = a signed verdict` /
  `the human owns the outer loop` both stand — the path changes, not the bar.

**Bad / costs / follow-on (surfaced, not buried).**
- **Design-only was the prior session — the build is incremental.** The owner's Q1 call scoped the
  authoring session to the model + the U1–U5 decomposition (no code); the owner ratified on 2026-06-23
  and the build is now underway, landing the units across PRs (PR-1: U1 + U3).
- **R2's vacuity bound is the same as `net-new`'s** (a structural red does not prove the test's
  assertions bite). Accepted as parity with the existing mode; a mutation/fault-injection non-vacuity
  strengthening is a named optional follow-on, not required.
- **Layer-2 dependency for the GENERAL loop.** Without the adoption-proposal classifier, gaps must be
  hand-classified observe/R1/R2. The pilot decouples by hand-feeding one gate; the general loop does
  not.
- **The batch sweep can miss a fork** that only surfaces mid-refactor. Mitigated by the fail-closed
  halt (the loop stops and surfaces rather than guessing), but a stalled R2 drive is the cost of
  choosing batch over pause/resume (the owner's Q3 trade, taken with eyes open). Promoting to
  mid-build pause/resume is a clean future extension if the halt rate proves high.
- **Surface breadth (when built):** the change threads library (`reliability-gates.ts` schema) →
  orchestrator (`proof-config.ts` R2 marker, `resolve-prove-spec.ts` brief, the suite oracle) → cli
  (`gate.ts` routing + the sweep surface). Held together by reuse of the `real:` machinery.

## References

- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — brownfield green
  is a proving process; **names this build-tests inner loop as the load-bearing unbuilt follow-on**
  (Consequences: "a less-mechanical, decision-escalating inner loop is required for the `build-tests`
  half").
- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — the `build-tests`
  gate KIND + observe/build-tests/integrate (**amended**: its `build-tests` satisfaction engine,
  "named follow-on, not built", is defined here as the R1/R2 red taxonomy + the gate→loop wiring).
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — the inner-loop envelope incl. `editsExisting` (the
  R1 behavioural-red mode this builds R2 alongside) and the `real:` worktree machinery R2 reuses.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed verdict`; the
  spine-observed red/green and the halt-is-never-a-pass guard R2 and the batch-sweep halt rest on
  (preserved).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop (the batch sweep is
  where the human's key forks enter the inner loop; the leaf earns the green).
- `packages/orchestrator/src/{prove-it-gate.ts,phase-machine.ts,resolve-prove-spec.ts,proof-config.ts}`,
  `packages/orchestrator/src/proof/observe-and-sign.ts`, `packages/cli/src/gate.ts`,
  `packages/library/src/reliability-gates.ts`, `packages/library/src/store/load-corpus.ts`,
  `stories/library/seed-corpus-scripts.md` — the compute + surfaces this design extends.
