---
id: "gate-real-build-names-its-increment"
tier: contract
story: cli
capability: gate-ci-parity
arc: inner-loop-exit-arc
title: "Make a REAL build-tests gate drive name a live increment and pass the gate's attempt policy before spend"
outcome: "A REAL build-tests gate drive refuses a missing increment as argument validation before its prompts or decision sweep, refuses an unknown increment or a gate the attempt policy stops after the sweep and before the database starts, records the attempt and any signed pass under the gate id, and renders every outcome through the one entry state."
status: proposed
proof_mode: contract-test
depends_on: [node-build-names-its-increment]
decisions: [576, 575, 563, 98]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/cli/src/gate-real-build-names-its-increment.test.ts"
      - "packages/cli/src/gate-build-driver.test.ts"
    sourceGlobs:
      - "packages/cli/src/gate-build-driver.ts"
      - "packages/cli/src/commands.ts"
  real:
    testFile: "packages/cli/src/gate-real-build-names-its-increment.test.ts"
    sourceFile: "packages/cli/src/gate-build-driver.ts"
    scope:
      testGlobs:
        - "packages/cli/src/gate-real-build-names-its-increment.test.ts"
        - "packages/cli/src/gate-build-driver.test.ts"
      sourceGlobs:
        - "packages/cli/src/gate-build-driver.ts"
        - "packages/cli/src/commands.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/cli/src/gate-real-build-names-its-increment.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# Make a REAL build-tests gate drive name a live increment and pass the gate's attempt policy before spend

**Outcome —** A REAL build-tests gate drive refuses a missing increment as argument validation, before
its prompts or decision sweep. It refuses an unknown increment, or a gate the attempt policy stops,
after the sweep and before the database starts. It records the attempt and any signed pass under the
gate id, and renders every outcome through the one entry state.

## Proof walkthrough

**Every case drives the production `driveBuildTestsGate`** over the offline R2 fixture that
`packages/cli/src/gate-build-driver.test.ts` builds. Copy its `fixtureCorpus`, `fixtureRepo`,
`fixtureStories`, `SEAM_TEST`/`REFACTORED`, `scriptedR2Author`, `buildTestsGate` and `routineFork`
into the new test file. Never import another test file: its tests would register in this proof.

**Fixtures.**
- **The corpus:** `fixtureCorpus()`, plus these rows written with `upsertDoc`:
  - `inc-live` and `inc-closed`, each of kind `increment` with doc
    `{ kind: "increment", arcRef: "asset:some-arc", status: "active" | "closed" }`;
  - `some-arc`, of kind `arc` with doc `{ kind: "arc" }`.
- **The gate** is `buildTestsGate()`, whose id `fix-story#gate-1` is the ledger unit (ADR-0098 U2).
- **The ledger:** an `InMemoryStore`, filled with `appendInnerLoopEvent` (`@storytree/orchestrator`) for
  unit `fix-story#gate-1` under `inc-live` where a step says so.
- **The throwing ledger:** `{ readEvents: async () => { throw new Error("ledger-down-marker"); } }`.
- **The deps** are
  `{ corpusStore: <the corpus>, progress, storiesDir, repoRoot, ensureDb, increment: "inc-live", innerLoopReads: { corpus: <the corpus>, ledger: <the ledger> } }`,
  where:
  - `progress` records each `stage` name in order and runs its work, and `note` does nothing;
  - `ensureDb` counts its calls and returns `{ ok: false, reason: "GATE_INCREMENT_TEST_DB_MARKER" }`.

  A step adds `store`, `promote: false` and `authorOverride` where it drives a walk.
- **The stage names:** PROMPTS = `library agent prompts (red-builder + green-builder, from the live store)`;
  PREFLIGHT = `inner-loop preflight (the increment and the attempt ledger, before any spend)`;
  DB = `live-store preflight (probe -> db:up -> wait for connections)`.
- **`Refusal(S)`** = `innerLoopRefusalEnvelope(S)` (`@storytree/drive`), where S is the state the pure
  functions return for the same input, computed by the test:
  `(await resolveBuildIncrement(corpus, id)).state`, or
  `(await preflightInnerLoop({ ledger, incrementId: "inc-live", unitIds: ["fix-story#gate-1"], revise: false })).state`.

1. **A missing increment is argument validation, before the prompts and the sweep.**
   - `increment` omitted, and `"   "`: the envelope deep-equals `Refusal(<increment-missing>)`, the
     recorded stages deep-equal `[]`, and `ensureDb` was never called.
   - The same with `decisionForks` holding an unresolved key fork
     (`routineFork({ id: "k", question: "q", changesPublicSeam: true })`): still that envelope. The
     missing check precedes the sweep.
   - **The existing argument refusals keep their precedence.** `buildTestsGate({ buildNode: undefined })`
     with `increment` omitted returns `ok: false` with a body matching `/names no build to drive/`.
2. **An unknown increment and a stopped gate are refused after the sweep, before the database starts.**
   No `store` is supplied, so the production store path runs and reaches `ensureDb`.
   - `increment: "no-such-increment"`: the envelope deep-equals `Refusal(<increment-unknown>)`, the
     stages deep-equal `[PROMPTS, PREFLIGHT]`, and `ensureDb` was never called.
   - The same with the unresolved key fork: the body matches `/HALTED fix-story#gate-1/` and the stages
     deep-equal `[PROMPTS]`. The sweep precedes the lookup.
   - `increment: "inc-closed"`: `Refusal(<increment-closed>)`.
   - A ledger holding `r1`–`r3`: `Refusal(<decision-point>)`. A ledger holding `r1` and a signed pass
     on `r1`: `Refusal(<unresolved-signed-pass>)`. The throwing ledger: `Refusal(<ledger-unreadable>)`.
     In each, the stages deep-equal `[PROMPTS, PREFLIGHT]` and `ensureDb` was never called.
   - An empty ledger proceeds. `ensureDb` is called exactly once, the body is exactly
     `"gate run --real persists to the live store, but the database could not be brought up:\nGATE_INCREMENT_TEST_DB_MARKER"`,
     and the stages deep-equal `[PROMPTS, PREFLIGHT, DB]`.
3. **The walk records under the gate id, and the envelopes render the entry state.** Each case supplies
   `store: <a fresh InMemoryStore>`, `promote: false`, `repoRoot: <a fresh fixtureRepo()>`, and
   `innerLoopReads.ledger` = that same store. "The inner-loop docs" means
   `(await store.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND).map((e) => e.doc)`.
   - **A signed walk** (`authorOverride: scriptedR2Author`) returns `ok: true`. The inner-loop docs are
     exactly two:
     `{ event: "attempt", unitId: "fix-story#gate-1", incrementId: "inc-live", runId }`, then
     `{ event: "signed-pass", …the same three ids }`, where `runId` is the attempt doc's own.
     - The body contains `increment:   inc-live`, and the line
       `renderInnerLoopEntryState({ state: "signed", unitId: "fix-story#gate-1", runId }).lines[0]`.
     - `next[0]` is `storytree node adjudicate fix-story#gate-1 --run <runId> --pg`.
   - **A second drive over the same store** is refused as `Refusal(<unresolved-signed-pass>)` for that
     run, and its store gains no inner-loop doc.
   - **A failing walk** (the regressing author from `gate-build-driver.test.ts`'s regression-wall test)
     returns `ok: false`. The inner-loop docs are exactly the one `attempt` doc.
     - The body contains
       `renderInnerLoopEntryState({ state: "attempt-failed", unitId: "fix-story#gate-1", runId, consecutiveFailures: 1, remainingGrantCount: 0 }).lines[0]`.
     - The last `next` entry is `storytree gate run fix-story#gate-1 --real --increment inc-live --pg`.
4. **Printed commands name the increment.**
   - `gateRetryCommand("fix-story#gate-1", "inc-live")` is
     `storytree gate run fix-story#gate-1 --real --increment inc-live --pg`.
   - `gateRetryCommand("fix-story#gate-1", undefined)` and `gateRetryCommand("fix-story#gate-1", "   ")`
     are each `storytree gate run fix-story#gate-1 --real --increment <increment-id> --pg`.
   - `driveBuildTestsGate` with `runtime: "other"` refuses with `next` deep-equal to
     `["storytree gate run fix-story#gate-1 --real --increment inc-live --pg"]`.
5. **The CLI composition reaches the check.**
   `makeGateDeps({ store: new InMemoryStore() }, { real: true }, <the fixture stories dir>).driveBuildTestsGate(buildTestsGate(), "builder@example.com")`
   deep-equals `Refusal(<increment-missing>)`.

**Before the source change** the driver ignores `increment` and `innerLoopReads`, `gateRetryCommand`
does not exist, and nothing is recorded. Step 1 renders the prompts and proceeds. Steps 2–3 find no
refusal and no inner-loop doc. Step 4's function is not a function. Step 5 proceeds past the missing
check to the live prompt render. Every TEST fails on an assertion, because the two control checks that
already hold (step 1's `(build:)` precedence and step 2's key-fork HALT) each share a test with an
assertion that does not. After the change, every step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (5)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Where the wiring goes.** Line numbers are approximate, as of this spec's commit; search for the
quoted text if they have moved.
- `packages/cli/src/gate-build-driver.ts`:
  - the `@storytree/drive` imports at ~53 and ~56, where `buildNodeReal` and `realConfigRefusal` are
    imported. Add `preflightPaidBuild`, `innerLoopRefusalEnvelope`, `renderIncrementLines`,
    `renderInnerLoopOutcome` and `type InnerLoopReadHandles` there;
  - `GateBuildDriverDeps` at ~70, which ends with `progress?: BuildProgress;` at ~129;
  - `driveBuildTestsGate` at ~146: `const retryCmd = …` at ~151; the runtime and Codex refusals at
    ~152–173; the `(build:)` check at ~177; the spec lookup and load at ~189–208; `realConfigRefusal`
    at ~212; the signer refusal at ~224, whose `next` is at ~229; the db proof env at ~233; the dep-add
    group at ~241–244;
  - `const progress = …` at ~251, then the prompt stage at ~252–256;
  - the decision sweep at ~264–271, and `const phasePrompts = …` at ~272;
  - the store block at ~278–317: the injected `deps.store` branch at ~283, and `ensureDb` at ~292;
  - `realArgs` at ~337–356; `const events = await store.readEvents();` at ~361; the header at
    ~363–374; the failure body at ~377–389, whose `next` is at ~387; the pass body at ~390–410, whose
    `next` is at ~401.
- `packages/cli/src/commands.ts`: `makeGateDeps` at ~3108, where `driverDeps` is built
  and each `values` field is threaded.
- `packages/cli/src/gate-build-driver.test.ts`: `fixtureCorpus` at ~35, `fixtureRepo` at ~64,
  `fixtureStories` at ~90, `scriptedR2Author` at ~132, and `buildTestsGate` at ~145. The four tests in
  scope are at ~166, ~216, ~270 and ~301, and `routineFork` is at ~259.
- **The functions this unit calls, all exported from `@storytree/drive`:** `preflightPaidBuild`,
  `innerLoopRefusalEnvelope`, `renderIncrementLines` and `renderInnerLoopOutcome` in
  `packages/drive/src/node-build.ts` (built by `node-build-names-its-increment`); and
  `resolveBuildIncrement`, `preflightInnerLoop` and `renderInnerLoopEntryState` in
  `packages/drive/src/inner-loop-entry.ts`.
- **Order of work.** AUTHOR_TEST writes the new test file, then the four existing-test body updates.
  IMPLEMENT makes the first compiling edit (the two `GateBuildDriverDeps` fields and
  `gateRetryCommand`), then calls `run_proof` at once and iterates against its failures.

**Decided by ADR-0576** (`storytree library artifact adr-0576`): D1 (every refusal before the
database), D2, D4, D5 (the walk records the attempt) and D8 (one entry state). D7's last sentence
applies it here: the gate driver's ledger unit is the gate id (ADR-0098 U2). The placement was ruled
for this unit: **a missing `--increment` is ARGUMENT validation**, so it follows the existing
argument and config refusals and precedes the prompt render and the decision sweep. **The unknown
increment and the ledger refusals follow the sweep** and precede the database.

- **The deps** (`GateBuildDriverDeps`):
  - `increment?: string | undefined` — `--increment <id>`, the arc increment this gate attempt is filed
    under (ADR-0575 D1);
  - `innerLoopReads?: InnerLoopReadHandles | undefined` — a test seam. Production omits it, and
    `preflightPaidBuild` opens the live handles.
- **`gateRetryCommand(gateId: string, increment: string | undefined): string`**, exported from
  `gate-build-driver.ts`, returns `storytree gate run <gateId> --real --increment <id> --pg`. It prints
  the placeholder `<increment-id>` for an absent or blank id. `const retryCmd = gateRetryCommand(gate.id, deps.increment);`
  replaces the existing template. The signer refusal's `next` becomes `` `${retryCmd} --signer <email>` ``.
- **`driveBuildTestsGate`, in this order.**
  1. **The missing check**, directly after the dep-add group and before `const progress`:
     `if (deps.increment === undefined || deps.increment.trim().length === 0)`, call
     `preflightPaidBuild({ incrementId: deps.increment, unitIds: [gate.id], revise: false, reads: deps.innerLoopReads })`.
     For a blank or absent id it reads nothing and refuses, so return
     `innerLoopRefusalEnvelope(missing.state)` when `!missing.ok`.
  2. **The preflight**, directly after the sweep's HALT return and before the store block: run
     `preflightPaidBuild({ incrementId: deps.increment, unitIds: [gate.id], revise: false, reads: deps.innerLoopReads })`
     inside `progress.stage("inner-loop preflight (the increment and the attempt ledger, before any spend)", …)`,
     and return `innerLoopRefusalEnvelope(preflight.state)` on a refusal.
  3. **The walk:** `realArgs` gains `incrementId: preflight.incrementId`, so `buildNodeReal` records the
     attempt and any signed pass under the gate id (ADR-0576 D5).
  4. **The envelopes.** After the existing `const events = await store.readEvents();`, compute
     `const outcome = renderInnerLoopOutcome(gate.id, runId, built.innerLoop, events);`. Trap 9: never
     a second read of the store.
     - The header spreads `...renderIncrementLines(preflight.incrementId, preflight.warnings)` after
       `...sweepSummaryLine(sweep)`.
     - The failure body spreads `...outcome.lines` after its `verdict:` line, and its `next` becomes
       `[...outcome.next, retryCmd]`.
     - The pass body spreads `...outcome.lines` after `...promotionLines`, and its `next` becomes
       `[...outcome.next, <the existing entries>]`.
- **The CLI** (`makeGateDeps` in `commands.ts`). Add the unguarded
  `driverDeps.increment = values.increment;` beside the other `values` threading. `BuildValues.increment`
  exists since `node-build-names-its-increment`.
- **The existing tests in scope** (`packages/cli/src/gate-build-driver.test.ts`). Keep EVERY title
  byte-for-byte and change bodies only (trap 2). Each of these calls gains `increment: "inc-live"` and
  `innerLoopReads: { corpus: <a corpus holding an active inc-live increment>, ledger: <its own store> }`,
  and every existing assertion stands:
  - `drives a build-tests gate's R2 red→green and signs a DRIVEN verdict FOR the gate id; the gate greens its covered cap`;
  - `U3 regression wall: an R2 refactor that REGRESSES the sibling test reds the suite → no verdict signed`;
  - `U4 — an UNRESOLVED key design fork HALTS the drive before any spend (no worktree, no verdict signed)`;
  - `U4 — a ROUTINE choice + a RESOLVED key fork sweep CLEAR; the drive proceeds to a signed green`.

  Its two refusal tests (`refuses a build-tests gate with no (build:) reference`,
  `refuses when the referenced build node spec does not exist`) refuse before the missing check, and
  stay unchanged.
- **Traps from the plan, as they bear on this unit.**
  - **Trap 4: each new refusal sits after every existing cheap refusal**, which step 1's precedence
    case pins.
  - **Trap 9: read the store once** after the walk.
  - **The attempt append fails closed** inside `buildNodeReal` already. Do not wrap or re-implement it.
- **The red is an assertion red, reviewed per test.** The node declares `editsExisting`.
  - **Two control checks hold before the change**, and no contract here declares a guard-rail: step
    1's `(build:)` precedence case, and step 2's key-fork HALT case. Put each in the SAME test as an
    assertion that fails at red (step 1's missing-increment refusal, and step 2's unknown-increment
    refusal). A test whose every assertion already holds at red is refused at CONFIRM_RED (C4), as
    `node-build-names-its-increment` attempt 2 measured.
  - **Write every `assert` call in the test body itself.** The per-test review's static read credits
    only assertions it finds there, and refuses a test whose assertions all live in a helper function
    (C6, ADR-0126). A helper may build fixtures or compute an expected value; the asserting stays
    inline.
  - Import `./gate-build-driver.js` as a namespace (`import * as GateDriver`) and reach
    `driveBuildTestsGate` and `gateRetryCommand` through it. Assert `typeof GateDriver.gateRetryCommand`
    is `"function"` before calling it. `makeGateDeps` exists today; import it by name from
    `./commands.js`.
  - **Every NEW test must FAIL at red on an `assert` call, never on a `TypeError`.** Assert whole
    envelopes with `assert.deepEqual`, and never dereference a field that exists only on success.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`. Loops over
    cases go INSIDE a test.
  - Assert with `node:assert/strict`.
- **The test's other imports all exist today.**
  - `InMemoryStore` and `type Store` from `@storytree/storage-protocol`;
  - `INNER_LOOP_EVENT_KIND` from `@storytree/proof-protocol`;
  - `appendInnerLoopEvent`, `OwnedLoopAuthor`, `PathWriteScope` and `scriptedWriterModel` from
    `@storytree/orchestrator`;
  - `FileToolExecutor` and `FILE_WRITE_TOOLS` from `@storytree/agent`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `resolveBuildIncrement`, `preflightInnerLoop`, `renderInnerLoopEntryState` and
    `innerLoopRefusalEnvelope` from `@storytree/drive`.
- **Before signing.** The `@storytree/cli` typecheck and the whole `@storytree/cli` suite run as the
  backstop.

**Declared, not observed by this test.** `makeGateDeps`' threading of a PRESENT `--increment` is
confirmed by reading: with a present id the composed driver goes on to render the prompts from the live
store, which no hermetic test may reach.

## Out of scope

- `packages/cli/src/gate.ts`'s printed `gate run … --real --pg` commands and `gateHelp`, and the
  Library's documented commands. These are landing glue.
- `nodeBuild` and `storyBuild`.
- Any change to `packages/drive/src/inner-loop-entry.ts`, `packages/drive/src/node-build.ts`,
  `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.

## Contracts (5)

1. **`gate-build-refuses-a-missing-increment-first`** — a REAL gate drive with no increment refuses as argument validation, before its prompts render or its decision sweep runs.
   - **asserts —** with `increment` absent or blank, `driveBuildTestsGate` returns `innerLoopRefusalEnvelope` of the `increment-missing` state with no stage opened and `ensureDb` never called, even when an unresolved key fork would halt the sweep; a gate with no `(build:)` reference still refuses with its own reason first. Test titles begin `gate-build-refuses-a-missing-increment-first: `.
   - **covers —** `driveBuildTestsGate`'s missing check and `GateBuildDriverDeps.increment` (`packages/cli/src/gate-build-driver.ts`).
   - **proven by —** `packages/cli/src/gate-real-build-names-its-increment.test.ts`, through the declared focused bun REAL proof.
2. **`gate-build-preflights-the-gate-after-the-sweep`** — an unknown or closed increment, or a gate the attempt policy stops, is refused after the decision sweep and before the database starts.
   - **asserts —** an unknown or closed increment, a gate at the decision point, a gate holding an unresolved signed pass and an unreadable ledger each refuse with `innerLoopRefusalEnvelope` of the pure functions' state, with the prompt and preflight stages opened and `ensureDb` never called; an unresolved key fork halts first; an empty ledger proceeds through the preflight to the injected DB refusal. Test titles begin `gate-build-preflights-the-gate-after-the-sweep: `.
   - **covers —** `driveBuildTestsGate`'s preflight and `GateBuildDriverDeps.innerLoopReads` (`packages/cli/src/gate-build-driver.ts`).
   - **proven by —** `packages/cli/src/gate-real-build-names-its-increment.test.ts`.
3. **`gate-build-records-under-the-gate-id`** — the walk records its attempt and any signed pass under the gate id, and the envelopes render the entry state that leaves.
   - **asserts —** a signed walk leaves exactly an `attempt` then a `signed-pass` for `fix-story#gate-1` under `inc-live`, names the increment and the signed state, and leads `next` with the adjudicate command; a second drive over that ledger refuses on the unresolved signed pass; a failing walk leaves only the `attempt`, renders the one-failure `attempt-failed` state, and ends `next` with the retry command naming the increment. Test titles begin `gate-build-records-under-the-gate-id: `.
   - **covers —** `driveBuildTestsGate`'s `realArgs.incrementId`, header, failure and pass envelopes (`packages/cli/src/gate-build-driver.ts`).
   - **proven by —** `packages/cli/src/gate-real-build-names-its-increment.test.ts`.
4. **`gate-build-prints-the-increment`** — every REAL command the gate driver prints names the increment, as its id when known and as a placeholder when not.
   - **asserts —** `gateRetryCommand` prints `--increment <id>` for a present id and `--increment <increment-id>` for an absent or blank one, and a runtime refusal's `next` is that command. Test titles begin `gate-build-prints-the-increment: `.
   - **covers —** `gateRetryCommand` and the driver's refusal `next`s (`packages/cli/src/gate-build-driver.ts`).
   - **proven by —** `packages/cli/src/gate-real-build-names-its-increment.test.ts`.
5. **`gate-deps-reach-the-increment-check`** — the CLI's composed gate driver refuses a REAL gate drive that names no increment.
   - **asserts —** `makeGateDeps(…, { real: true }, <stories>).driveBuildTestsGate(gate, signer)` returns `innerLoopRefusalEnvelope` of the `increment-missing` state. Test titles begin `gate-deps-reach-the-increment-check: `.
   - **covers —** `makeGateDeps`' `driverDeps.increment` threading (`packages/cli/src/commands.ts`).
   - **proven by —** `packages/cli/src/gate-real-build-names-its-increment.test.ts`.
