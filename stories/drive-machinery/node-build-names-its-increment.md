---
id: "node-build-names-its-increment"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Make node build --real name a live increment and pass its attempt policy before spend"
outcome: "`node build --real` refuses before any spend unless it names a live increment and its unit passes the attempt policy, records the attempt under that increment, renders every outcome through the one entry state, and prints REAL commands that name the increment."
status: proposed
proof_mode: contract-test
depends_on: [build-entry-refuses-before-spend, real-lifecycle-records-its-attempt, node-verbs-dispatch]
decisions: [576, 575, 563, 571]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/drive/src/node-build-names-its-increment.test.ts"
      - "packages/drive/src/node-build-revise-test.test.ts"
      - "packages/cli/src/node-build.test.ts"
      - "packages/cli/src/story-build.test.ts"
      - "packages/cli/src/at-path.test.ts"
    sourceGlobs:
      - "packages/drive/src/node-build.ts"
      - "packages/cli/src/commands.ts"
      - "packages/cli/src/at-path.ts"
  real:
    testFile: "packages/drive/src/node-build-names-its-increment.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs:
        - "packages/drive/src/node-build-names-its-increment.test.ts"
        - "packages/drive/src/node-build-revise-test.test.ts"
        - "packages/cli/src/node-build.test.ts"
        - "packages/cli/src/story-build.test.ts"
        - "packages/cli/src/at-path.test.ts"
      sourceGlobs:
        - "packages/drive/src/node-build.ts"
        - "packages/cli/src/commands.ts"
        - "packages/cli/src/at-path.ts"
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
        - "./packages/drive/src/node-build-names-its-increment.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "--filter", "@storytree/cli", "typecheck"]
---

# Make node build --real name a live increment and pass its attempt policy before spend

**Outcome —** `node build --real` refuses before any spend unless it names a live increment and its
unit passes the attempt policy. It records the attempt under that increment, renders every outcome
through the one entry state, and prints REAL commands that name the increment.

## Proof walkthrough

**The build is the production `nodeBuild`**, driven offline up to the first leg that would spend, the
way `node-build-revise-test.test.ts` drives it. **No offline test reaches the REAL worktree arm**:
`NodeBuildOpts` has no author seam, on purpose (ADR-0243 D4), so every walk below ends at or before an
injected DB preflight.

**Fixtures.**
- **The repo and stories:** `fixtureRepo(false)` and `fixtureStories([{ id: "cap-a", dependsOn: [] }])`
  from `packages/drive/src/real-chain-fixture.ts`. `cap-a` carries a no-install real arm.
- **The corpus:** an `InMemoryStore` loaded by `loadFixtureCorpus` (`@storytree/library/fixture`), plus
  these rows written with `upsertDoc`:
  - `inc-live` and `inc-closed`, each of kind `increment` with doc
    `{ kind: "increment", arcRef: "asset:some-arc", status: "active" | "closed" }`;
  - `some-arc`, of kind `arc` with doc `{ kind: "arc" }`.
- **The ledger:** an `InMemoryStore` filled with `appendInnerLoopEvent` (`@storytree/orchestrator`) for
  unit `cap-a`, runs `r1`…`r7`, under `inc-live` unless a step says otherwise.
- **The throwing handles:** `{ getDoc: async () => { throw new Error("corpus-down-marker"); } }` and
  `{ readEvents: async () => { throw new Error("ledger-down-marker"); } }`.
- **The REAL options** are
  `{ dryRun: false, real: true, runtime: "claude", actor: "tester@example.com", repoRoot, storiesDir, corpusStore: <the corpus>, innerLoopReads: { corpus: <the corpus>, ledger: <the ledger> }, increment: "inc-live", ensureDb, progress, escalationsDir: <a fresh temp dir> }`,
  where:
  - `ensureDb` counts its calls and returns `{ ok: false, reason: "INCREMENT_TEST_DB_MARKER" }`;
  - `progress` records each `stage` name in order and runs its work; `note` does nothing.
- **"Refused as S"** means the envelope deep-equals `NodeBuildModule.innerLoopRefusalEnvelope(S)`,
  `ensureDb` was never called, and the recorded stages deep-equal
  `["inner-loop preflight (the increment and the attempt ledger, before any spend)"]`. S is the refused
  state the pure functions return for the same input, computed by the test:
  `(await resolveBuildIncrement(corpus, id)).state` for an increment refusal, or
  `(await preflightInnerLoop({ ledger, incrementId: "inc-live", unitIds: ["cap-a"], revise })).state`
  for a ledger refusal (`./inner-loop-entry.js`).
- **"Proceeds"** means `ensureDb` was called exactly once, the envelope's body is exactly
  `"--real persists to the live store, but the database could not be brought up:\nINCREMENT_TEST_DB_MARKER"`,
  and the recorded stages deep-equal
  `["inner-loop preflight (the increment and the attempt ledger, before any spend)", "library agent prompts (red-builder + green-builder, from the live store)", "live-store preflight (probe -> db:up -> wait for connections)"]`.

1. **`--increment` is REAL-only.**
   - `nodeBuild("no-such-unit-for-increment", { dryRun: true, increment: "inc-live", actor: "tester@example.com" })`,
     and the same with `dryRun: false, live: true`, each deep-equal
     `{ ok: false, body: "--increment is valid only with --real: it names the increment a paid attempt is filed under on the attempt ledger, and neither --dry-run nor --live records an attempt (ADR-0575 D1, ADR-0576 D1).", next: ["storytree node build no-such-unit-for-increment --real --increment inc-live"] }`.
     The body never mentions `no node spec`: the check precedes the spec load.
   - Without `increment`, the same dry-run reaches the spec load: `ok: false` and a body beginning
     `no node spec "no-such-unit-for-increment"`.
2. **A REAL build names a live increment, refused before any spend.** Each call is the REAL options
   with `increment` as shown.
   - `increment` omitted, and `"   "`: refused as the `increment-missing` state. The prompt stage never
     opens.
   - `"no-such-increment"`: refused as `increment-unknown`. `"some-arc"`: refused as
     `increment-wrong-kind`. `"inc-closed"`: refused as `increment-closed`.
   - `innerLoopReads.corpus` is the throwing corpus: refused as `increment-unreadable`, whose body
     contains `corpus-down-marker`.
   - **The existing cheap refusals keep their precedence.** With `increment` omitted AND
     `reviseTest: "a-run-with-no-record"`, the envelope deep-equals
     `{ ok: false, body: NodeBuildModule.readTestRevision(escalationsDir, "cap-a", "a-run-with-no-record").reason, next: [] }`
     and NO stage is recorded.
3. **A REAL build's unit passes the attempt policy before any spend.** Each call is the REAL options
   over the ledger shown.
   - `r1`–`r3`: refused as `decision-point`. `r1`–`r6`: refused as `owner-ceiling`.
   - `r1` and a signed pass on `r1`: refused as `unresolved-signed-pass`.
   - `r1`, a signed pass and a `land` adjudication of `r1` (`mayRefuse: false`, `escalates: false`,
     `reason: "landed"`): refused as `landed-under-increment`.
   - The throwing ledger: refused as `ledger-unreadable`, whose body contains `ledger-down-marker`.
   - An empty ledger: proceeds.
   - `r1`–`r3` with a `fixed-defect` grant of 2 on `r3`: proceeds.
   - `r1`, `r2` filed under `inc-old`, requested as `inc-live`: proceeds. A relabel only warns.
4. **A revision run pairs with its live grant (ADR-0576 D6).** A valid revision record for `cap-a` is
   written to `escalationsDir` under run `real-prior`, by `writeRevisionRecord` from a real `proveUnit`
   AUTHOR_TEST escalation walk, exactly as `node-build-revise-test.test.ts` builds one.
   - Ledger `r1`–`r3` with a `revised-test` grant of 1 on `r3`:
     - the REAL options without `reviseTest`: refused as the `grant-kind-mismatch` state for
       `revise: false`;
     - with `reviseTest: "real-prior"`: proceeds.
   - Ledger `r1`–`r3` with a `fixed-defect` grant of 1 on `r3`:
     - with `reviseTest: "real-prior"`: refused as `grant-kind-mismatch` for `revise: true`;
     - without `reviseTest`: proceeds.
5. **Every outcome renders through the one entry state.**
   - `innerLoopRefusalEnvelope(S)` for S holding `{ kind: "increment-closed", reason: "x" }` and
     `{ kind: "decision-point", unitId: "cap-a", reason: "y" }` deep-equals
     `{ ok: false, body: <renderInnerLoopEntryState(S).lines joined by "\n">, next: [...renderInnerLoopEntryState(S).next] }`.
   - `renderIncrementLines(undefined, [])` is `[]`. `renderIncrementLines("inc-live", [])` is
     `["increment:   inc-live"]`. `renderIncrementLines("inc-live", ["w1", "w2"])` is
     `["increment:   inc-live", "warning:     w1", "warning:     w2"]`.
   - `renderInnerLoopOutcome("cap-a", "r7", innerLoop, events)` returns `{ lines, next }`:
     - `innerLoop` undefined: `{ lines: [], next: [] }`;
     - `{ incrementId: "inc-live", attempt: { recorded: false, reason: "down" } }`: `{ lines: [], next: [] }`;
     - `{ incrementId: "inc-live", attempt: { recorded: true }, signedPass: { recorded: true } }`:
       `renderInnerLoopEntryState({ state: "signed", unitId: "cap-a", runId: "r7" })`, as arrays;
     - the same with `signedPass: { recorded: false, reason: "pass-append-marker" }`:
       `{ lines: ["inner loop:  signed, but the signed pass could not be recorded: pass-append-marker — the ledger holds no landing obligation for run r7 (ADR-0576 D5)"], next: [] }`;
     - `{ incrementId: "inc-live", attempt: { recorded: true } }` over the events of a ledger holding
       `r5`, `r6` and `r7` under `inc-live`:
       `renderInnerLoopEntryState({ state: "attempt-failed", unitId: "cap-a", runId: "r7", consecutiveFailures: 3, remainingGrantCount: 0 })`,
       as arrays, whose `next` is the grant command;
     - the same recording over the events of a store holding only a `grant` on `r9` (so the fold
       throws `grant references no recorded attempt: r9`):
       `{ lines: ["inner loop:  the attempt was recorded, but the ledger could not be folded after the walk: grant references no recorded attempt: r9"], next: ["pnpm db:probe"] }`.
6. **Printed REAL commands name the increment.**
   - `renderRevisionRecord("cap-a", "run-x", runtime, { written: true, path: "/tmp/r.json" }, "inc-live")`
     is, for each runtime `codex`, `claude` and `pi`,
     `["revision:    written to /tmp/r.json — re-run with: storytree node build cap-a --real --runtime <runtime> --increment inc-live --revise-test run-x"]`.
     With the fifth argument omitted it is the command without `--increment`. An unwritten record
     still names no command.
   - `nodeBuildRetryCommand("cap-a", "--real", "inc-live")` is
     `storytree node build cap-a --real --increment inc-live`. `nodeBuildRetryCommand("cap-a", "--dry-run", undefined)`
     is `storytree node build cap-a --dry-run`.
   - `realConfigRefusal(<the fixture story's spec, loaded from its story.md>, null, storiesDir)`
     refuses with `next` deep-equal to
     `NodeBuildModule.buildableNodeIds(storiesDir).realBuildable.map((id) => \`storytree node build ${id} --real --increment <increment-id>\`)`,
     which includes `storytree node build cap-a --real --increment <increment-id>` (the list also
     carries the registry's REAL-buildable ids).
   - `nodeBuild("cap-a", { dryRun: true, reviseTest: "run-x", actor: "tester@example.com" })` refuses
     with `next` deep-equal to `["storytree node build cap-a --real --increment <increment-id> --revise-test run-x"]`.

**Before the source change** `nodeBuild` ignores `increment` and `innerLoopReads`, and the new
functions do not exist. Step 1's dry-run proceeds to the spec load. Steps 2–4 run on past the missing
check, render the prompts and reach the DB preflight. Step 5's functions are not functions, and step
6's commands name no `--increment`. Every step fails on an assertion. After the change, every step
passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (6)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Where the wiring goes.** Line numbers are approximate, as of this spec's commit; search for the
quoted text if they have moved.
- `packages/drive/src/node-build.ts`:
  - the imports: the `@storytree/orchestrator` block at ~18 (it has `appendInnerLoopEvent`; add
    `foldInnerLoopLedger`); `applySchema`, `closePool` and `createPool` from `@storytree/library/store`
    at ~56; `PgWorkStore` at ~66; `openCorpusStore` at ~70; `type Envelope` at ~82. Import
    `resolveBuildIncrement`, `preflightInnerLoop`, `renderInnerLoopEntryState` and
    `type InnerLoopRefusedState` from `./inner-loop-entry.js`;
  - **the pattern to copy for the ledger handle** is `resolveVerdictStore` at ~695: its `pg` branch
    at ~736 opens `createPool()`, builds `new PgWorkStore(pool)` and closes with
    `closePool(pool, connector)`. Copy it WITHOUT its `applySchema(pool)` line;
  - `renderRevisingLine` at ~1337 and `renderRevisionRecord` at ~1353, the export site for the new
    functions; `realConfigRefusal` at ~1379, whose `next` is at ~1394;
  - `InnerLoopRecording` at ~1508, and `buildNodeReal` at ~1559;
  - `NodeBuildOpts` at ~1772; its `reviseTest` field is at ~1867, and the interface ends at ~1873;
  - in `nodeBuild` at ~1876: the `--revise-test` mode check at ~1984, whose `next` is at ~1991; the
    revision read at ~2101; `const progress = …` at ~2117; the prompt stage at ~2118; `modeFlag` and
    `retryCmd` at ~2128; the DB preflight at ~2138; `let promotion` at ~2218; the `realArgs` block at
    ~2246 (`realArgs.escalationsDir = escalationsDir;` at ~2267); `promotion = built.promotion;` at
    ~2274; `const derived = rollupStatus(…)` at ~2320; the header's
    `...renderRevisingLine(testRevision)` at ~2330; the failure body at ~2380
    (`...renderRevisionRecord(…)` at ~2390, `next` at ~2396); the pass body at ~2400
    (`...promotionLines` at ~2407, `next` at ~2412).
- `packages/cli/src/commands.ts`: `BuildValues` at ~2756; `nodeStoryBuildOpts` at
  ~2782 (`opts.reviseTest = values["revise-test"];` at ~2796); `storyBuildFromValues` at
  ~2808, whose `next` is at ~2819; `CLI_OPTIONS` at ~3302, where the ADR-0576 D3
  node-verb flags end at ~3354.
- `packages/cli/src/at-path.ts`: `LITERAL_FLAGS`, where the ADR-0576 D3 node-verb flags end at
  ~269.
- **The pure functions this unit calls:** `resolveBuildIncrement` (~82), `preflightInnerLoop` (~224),
  `InnerLoopRefusedState` (~55) and `renderInnerLoopEntryState` (~320), in
  `packages/drive/src/inner-loop-entry.ts`; `openCorpusStore(tool)` (~82) in
  `packages/drive/src/corpus-store.ts`; `EnsureDbResult` (~85) in `packages/drive/src/db-control.ts`;
  `BuildProgress` (~44) in `packages/drive/src/build-progress.ts`.
- **The existing tests in scope, and where:**
  - `packages/drive/src/node-build-revise-test.test.ts`: `setupRealFixture` at ~160,
    `driveEscalatingProveUnit` at ~109 (the record-writing walk to copy), the mode-check test at ~201,
    the valid-revision test at ~355, and the `renderRevisionRecord` tests at ~456;
  - `packages/cli/src/node-build.test.ts`: the real-config refusal test at ~207, and the
    `--revise-test` threading test at ~670;
  - `packages/cli/src/story-build.test.ts`: the `--revise-test` refusal test at ~331;
  - `packages/cli/src/at-path.test.ts`: the `--revise-test` classification test at ~60.
- **Order of work.** AUTHOR_TEST writes the new test file first, then the existing-test body updates.
  IMPLEMENT makes the first compiling edit (the new `NodeBuildOpts` fields and the exported
  functions), then calls `run_proof` at once and iterates against its failures. It wires `nodeBuild`
  and the CLI in the same pass, because no test of this proof reaches the CLI.

**Decided by ADR-0576** (`storytree library artifact adr-0576`): D1 (every refusal before the
database, through injectable read handles, fail-closed, after every existing cheap refusal), D2, D4,
D5, D6 (a revision run is a paid entry, paired with its live grant) and D8 (one entry state, one
renderer). It implements ADR-0575 D1 for `node build`. The pure functions already exist:
`resolveBuildIncrement`, `preflightInnerLoop` and `renderInnerLoopEntryState` in
`packages/drive/src/inner-loop-entry.ts`, and `buildNodeReal`'s `incrementId` recording in
`packages/drive/src/node-build.ts`. **ADR-0571 D5's statement that `--revise-test` neither runs the
ledger preflight nor records an attempt becomes false with this unit.** The in-place correction is
landing glue, not this build's. **The whole preflight runs before the prompt render**, so production
opens the live corpus once for the increment lookup and once more for the prompts. That cost is
accepted.

- **The options** (`NodeBuildOpts`):
  - `increment?: string | undefined` — `--increment <id>`, the arc increment this attempt is filed
    under (ADR-0575 D1). A LITERAL id.
  - `innerLoopReads?: InnerLoopReadHandles | undefined` — a test seam. Production omits it, and the
    live handles open instead.
- **The production read handles and the shared preflight.** Export these from `node-build.ts`,
  directly after `renderRevisionRecord`. The story chain and the gate build driver will reuse them.
  - `interface InnerLoopReadHandles { readonly corpus: Pick<Store, "getDoc">; readonly ledger: Pick<Store, "readEvents"> }`.
  - `liveInnerLoopReads(): InnerLoopReadHandles & { readonly close: () => Promise<void> }` — the
    production handles (ADR-0576 D1). The corpus opens LAZILY on its first `getDoc`, through
    `openCorpusStore("build --real")`. The ledger opens LAZILY on its first `readEvents`, as
    `new PgWorkStore(pool)` over `createPool()`, with NO `applySchema`: it only reads. An open that
    throws surfaces as that method's throw, so the pure functions refuse it as `increment-unreadable`
    or `ledger-unreadable` quoting the error. `close` closes only what opened. No hermetic test may
    reach this function, because it opens the live store (ADR-0302 D3). Precede each of its lines
    that carries a mutable expression with the house comment
    `// Stryker disable next-line all: NO COVERAGE BY DESIGN — the production read handles open the live store, which no hermetic test may reach (ADR-0302 D3)`,
    as `packages/cli/src/main.ts` does for its own composition-root wire.
  - `type PaidBuildPreflight = { readonly ok: true; readonly incrementId: string; readonly warnings: readonly string[] } | { readonly ok: false; readonly state: InnerLoopRefusedState }`.
  - `preflightPaidBuild(input: { readonly incrementId: string | undefined; readonly unitIds: readonly string[]; readonly revise: boolean; readonly reads: InnerLoopReadHandles | undefined }): Promise<PaidBuildPreflight>`.
    With `reads` undefined, it uses `liveInnerLoopReads()` and closes it in a `finally`. It resolves
    the increment first, so a missing id refuses without reading anything. It then preflights the
    units with `revise`, and returns the resolved id and the warnings.
  - `innerLoopRefusalEnvelope(state: InnerLoopRefusedState): Envelope` — `ok: false`, the rendered
    lines joined by `"\n"`, and the rendered `next`.
  - `renderIncrementLines(incrementId: string | undefined, warnings: readonly string[]): string[]`.
  - `renderInnerLoopOutcome(unitId: string, runId: string, innerLoop: InnerLoopRecording | undefined, events: readonly StoreEvent[]): { lines: string[]; next: string[] }`,
    in the order walkthrough step 5 lists. A failed walk's counts come from
    `foldInnerLoopLedger(events, unitId)` (`@storytree/orchestrator`).
  - `nodeBuildRetryCommand(unitId: string, modeFlag: string, incrementId: string | undefined): string`.

  Every string these return comes from `renderInnerLoopEntryState`, except the lines and commands the
  walkthrough spells out. Never re-type the renderer's strings (ADR-0576 D8).
- **`renderRevisionRecord` gains an optional fifth parameter**, `incrementId?: string`. A written
  record's command becomes
  `storytree node build <unitId> --real --runtime <runtime> --increment <incrementId> --revise-test <runId>`
  when it is given, and stays as it is when it is not.
- **The printed REAL commands** gain the placeholder `--increment <increment-id>` where no increment
  is known: `realConfigRefusal`'s `next`, the `--revise-test` mode check's `next`
  (`storytree node build <unitId> --real --increment <increment-id> --revise-test <runId>`), and
  `storyBuildFromValues`' `next` in `commands.ts`
  (`storytree node build <unit-id> --real --increment <increment-id> --revise-test <runId>`).
- **`nodeBuild`, in this order.**
  1. **The mode check**, directly after the existing `--revise-test` mode check: an `increment`
     without `real` refuses with walkthrough step 1's exact envelope.
  2. **The preflight**, directly after `const progress = …` and before `let phasePrompts`, so it
     follows every existing cheap refusal, the revision read included (plan trap 4). Declare
     `let incrementId: string | undefined;` and `let incrementWarnings: readonly string[] = [];`.
     When `real`, run
     `preflightPaidBuild({ incrementId: opts.increment, unitIds: [spec.id], revise: testRevision !== undefined, reads: opts.innerLoopReads })`
     inside `progress.stage("inner-loop preflight (the increment and the attempt ledger, before any spend)", …)`.
     A refusal returns `innerLoopRefusalEnvelope(preflight.state)`. Otherwise assign the id and the
     warnings.
  3. **The retry command:** `const retryCmd = nodeBuildRetryCommand(spec.id, modeFlag, incrementId);`
     replaces the existing template.
  4. **The REAL arm:** `realArgs.incrementId = incrementId;` beside the other `realArgs` assignments,
     so `buildNodeReal` records the attempt and any signed pass (ADR-0576 D5). Declare
     `let innerLoop: InnerLoopRecording | undefined;` beside `let promotion`, and assign
     `innerLoop = built.innerLoop;` beside `promotion = built.promotion;`.
  5. **The envelopes.** Replace `const derived = rollupStatus(spec.id, await store.readEvents());` with
     one read, `const events = await store.readEvents();`, then
     `const derived = rollupStatus(spec.id, events);` and
     `const outcome = renderInnerLoopOutcome(spec.id, runId, innerLoop, events);`. Trap 9: never a
     second read of the work store.
     - The header spreads `...renderIncrementLines(incrementId, incrementWarnings)` directly after
       `...renderRevisingLine(testRevision)`.
     - The failure body passes `incrementId` as `renderRevisionRecord`'s fifth argument, and spreads
       `...outcome.lines` directly after that call. Its `next` becomes `[...outcome.next, retryCmd]`.
     - The pass body spreads `...outcome.lines` directly after `...promotionLines`. Its `next` becomes
       `[...outcome.next, <the existing entries>]`.
- ⚠ **Lines on the REAL worktree arm carry NO mutable expression.** No offline test reaches that arm,
  and `check:mutation-diff` reds on a changed line's surviving mutant. So `realArgs.incrementId`, the
  `innerLoop` declaration and assignment, and every spread above hold only identifiers, member access,
  calls and spreads. Defaults and conditionals live inside the exported functions, which steps 5 and 6
  test directly.
- **The CLI** (`packages/cli/src/commands.ts`, `packages/cli/src/at-path.ts`).
  - `CLI_OPTIONS` gains `increment: { type: "string" }`, directly after the ADR-0576 D3 node-verb
    flags, with a comment naming ADR-0575 D1.
  - `BuildValues` gains `increment?: string;`, and `nodeStoryBuildOpts` gains the unguarded
    `opts.increment = values.increment;` beside `opts.reviseTest`. That same function feeds
    `storyBuild`, which reads the field from `story-real-chain-names-its-increment` on.
  - `LITERAL_FLAGS` gains `increment`, directly after the ADR-0576 D3 node-verb flags, with a comment:
    an increment id names the work an attempt is filed under, never a durable prose record.
- **The existing tests in scope.** Keep EVERY `test` and `describe` title byte-for-byte, and change
  bodies only (trap 2).
  - `packages/drive/src/node-build-revise-test.test.ts`:
    - `a genuinely written, matching revision is never refused by the revision read — the build proceeds to the DB preflight`
      reaches the new preflight. Its `nodeBuild` call gains `increment: "inc-live"` and
      `innerLoopReads: { corpus: <the fixture corpus, holding an active inc-live increment>, ledger: new InMemoryStore() }`.
      Every one of its assertions stands;
    - `--revise-test without --real is refused before the signer resolves or the spec loads, naming --revise-test and --real`
      expects the new `next`.

    No other test in that file reaches the preflight or pins a changed command.
    `renderRevisionRecord`'s four-argument tests still hold, because the fifth parameter is optional.
  - `packages/cli/src/node-build.test.ts`:
    - `node build --real on a node WITHOUT a real-proof config fails closed before any worktree`
      looks for `storytree node build verdict-line --real --increment <increment-id>` in `next`;
    - `node build carries --revise-test to nodeBuild on every node route, which refuses it without --real (ADR-0571 D3)`
      expects the new `next`;
    - add, after that test, one new test titled
      `node build carries --increment to nodeBuild on every node route, which refuses it without --real (ADR-0575 D1)`.
      For the argv `node build library-cli --dry-run --increment inc-x --actor tester@example.com`,
      and the same through `build node library-cli` and `build library-cli`, `run(argv, deps)`
      deep-equals the step 1 refusal for `library-cli` and `inc-x`.
  - `packages/cli/src/story-build.test.ts`:
    `story build REFUSES --revise-test on every route to the chain — no single unit to revise (ADR-0571 D3)`
    expects the new `next`.
  - `packages/cli/src/at-path.test.ts`: add, after the `--revise-test` classification test, one new
    test titled
    ``"`node build --increment` is LITERAL — an increment id naming the work an attempt is filed under, never prose"``,
    asserting `LITERAL_FLAGS.has("increment")` and not `PROSE_FLAGS.has("increment")`.

  Titles in those four files follow their files' own convention and carry no contract id.
- **Traps from the plan, as they bear on this unit.**
  - **Trap 3: the leaf writes only its declared globs.** Every file above is declared. The backstop
    runs BOTH packages' suites, because a drive-only backstop never runs the CLI tests.
  - **Trap 4: each new refusal sits after every existing cheap refusal**, which is what step 2's
    precedence case pins.
  - **Trap 9: read the work store once** after the walk.
- **The red is an assertion red, reviewed per test.** The node declares `editsExisting`.
  - Import `./node-build.js` as a namespace (`import * as NodeBuildModule`), never by name, and reach
    `nodeBuild`, `readTestRevision`, `writeRevisionRecord`, `realConfigRefusal`, `renderRevisionRecord`
    and every new function through it. Before calling a new function, assert `typeof` it is
    `"function"`.
  - **Every NEW test must FAIL at red on an `assert` call, never on a `TypeError`.** Assert whole
    envelopes with `assert.deepEqual`.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`. Loops over
    cases go INSIDE a test.
  - Assert with `node:assert/strict`.
- **The test's other imports all exist today.**
  - `InMemoryStore` and `type StoreEvent` from `@storytree/storage-protocol`;
  - `appendInnerLoopEvent`, `loadNodeSpec`, `proveUnit` and `ShellTestExecutor` from `@storytree/orchestrator`;
  - `resolveBuildIncrement`, `preflightInnerLoop` and `renderInnerLoopEntryState` from
    `./inner-loop-entry.js`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `parseAuthoringEscalation` from `@storytree/agent`;
  - `fixtureRepo` and `fixtureStories` from `./real-chain-fixture.js`.
- **Before signing.** The typecheck of both packages and both packages' whole suites run as the
  backstop.

**Declared, not observed by this test.** `nodeBuild` has no author seam (ADR-0243 D4), so no offline
test reaches the REAL worktree arm or anything after it. These are confirmed by reading, not
observed:
- the end-of-build envelopes: the header, failure and pass spreads, and the failure `next`;
- the REAL arm's `realArgs.incrementId` and `innerLoop` assignments;
- `liveInnerLoopReads`.

## Out of scope

- `storyBuild` (`story-real-chain-names-its-increment`) and `driveBuildTestsGate`
  (`gate-real-build-names-its-increment`), which reuse the exported preflight.
- The help text (`nodeHelp`, `buildHelp`), the Library's documented REAL commands, the pass
  envelope's generic "any registered node" suggestion, printed `--real` commands outside this unit's
  source files (`packages/drive/src/adopt-capability.ts`, `packages/drive/src/tree.ts`), and ADR-0571's
  in-place correction. These are landing glue.
- Any change to `packages/drive/src/inner-loop-entry.ts`, `packages/cli/src/inner-loop-verbs.ts`,
  `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.

## Contracts (6)

1. **`node-build-increment-is-real-only`** — `--increment` reaches `nodeBuild` on every node route and is refused without `--real`.
   - **asserts —** `nodeBuild` given `increment` with `--dry-run` or `--live` refuses with a body naming `--increment` and `--real` and a `next` of the same command with `--real`, before the spec loads, and without `increment` a dry-run reaches the spec load. Test titles begin `node-build-increment-is-real-only: `.
   - **covers —** `nodeBuild`'s increment mode check and `NodeBuildOpts.increment` (`packages/drive/src/node-build.ts`); `CLI_OPTIONS`, `BuildValues` and `nodeStoryBuildOpts` (`packages/cli/src/commands.ts`); `LITERAL_FLAGS` (`packages/cli/src/at-path.ts`).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`, through the declared focused bun REAL proof; the dispatch half by `packages/cli/src/node-build.test.ts` and `packages/cli/src/at-path.test.ts` in the backstop.
2. **`real-node-build-names-a-live-increment-before-spend`** — a REAL node build refuses a missing, unknown, closed, wrong-kind or unreadable increment before the prompts render or the database starts.
   - **asserts —** with `increment` absent or blank, `nodeBuild` returns `innerLoopRefusalEnvelope` of the `increment-missing` state with only the preflight stage opened and `ensureDb` never called. An unknown id, an arc id, a closed increment and a throwing corpus refuse the same way as `increment-unknown`, `increment-wrong-kind`, `increment-closed` and `increment-unreadable`. A missing revision record still refuses first, with no stage opened. Test titles begin `real-node-build-names-a-live-increment-before-spend: `.
   - **covers —** `preflightPaidBuild`, `innerLoopRefusalEnvelope` and `nodeBuild`'s preflight placement (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`.
3. **`real-node-build-preflights-its-unit-before-spend`** — a REAL node build refuses a unit the attempt policy stops, and otherwise proceeds to the database preflight.
   - **asserts —** over a ledger at the decision point, at the ceiling, holding an unresolved signed pass, or landed under the requested increment, and over a throwing ledger, `nodeBuild` refuses with `innerLoopRefusalEnvelope` of the state `preflightInnerLoop` returns, before `ensureDb`. An empty ledger, a live grant, and an open loop filed under another increment each proceed through the preflight, prompt and DB-preflight stages to the injected DB refusal. Test titles begin `real-node-build-preflights-its-unit-before-spend: `.
   - **covers —** `preflightPaidBuild` and `nodeBuild`'s preflight (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`.
4. **`revision-run-pairs-with-its-live-grant`** — a `--revise-test` build proceeds only under a live `revised-test` grant or no grant, and a plain build never under one.
   - **asserts —** over a live `revised-test` grant, a plain REAL build refuses as `grant-kind-mismatch` and a revision build naming a valid record proceeds. Over a live `fixed-defect` grant, the revision build refuses as `grant-kind-mismatch` and the plain build proceeds. Test titles begin `revision-run-pairs-with-its-live-grant: `.
   - **covers —** `nodeBuild`'s `revise: testRevision !== undefined` preflight input (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`.
5. **`paid-build-envelopes-render-the-entry-state`** — a paid build's refusal, header and outcome lines come from the one entry-state renderer.
   - **asserts —** `innerLoopRefusalEnvelope` is the rendered refused state as an envelope. `renderIncrementLines` is `[]` without an increment, and names the increment then each warning with one. `renderInnerLoopOutcome` is empty without a recording or with an unrecorded attempt, is the rendered `signed` state for a recorded signed pass, names an unrecorded signed pass, is the rendered `attempt-failed` state with the fold's counts after a failed walk, and names a fold that throws with `pnpm db:probe`. Test titles begin `paid-build-envelopes-render-the-entry-state: `.
   - **covers —** `innerLoopRefusalEnvelope`, `renderIncrementLines` and `renderInnerLoopOutcome` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`.
6. **`printed-real-commands-name-the-increment`** — every REAL command a node build prints names the increment, as its id when known and as a placeholder when not.
   - **asserts —** `renderRevisionRecord` for a written record and an increment prints `storytree node build <unit> --real --runtime <runtime> --increment <increment> --revise-test <run>` for `codex`, `claude` and `pi`, prints the command without `--increment` when none is given, and names no command for an unwritten record. `nodeBuildRetryCommand` appends `--increment <id>` only when an increment is given. `realConfigRefusal`'s `next` and the `--revise-test` mode check's `next` name `--increment <increment-id>`. Test titles begin `printed-real-commands-name-the-increment: `.
   - **covers —** `renderRevisionRecord`, `nodeBuildRetryCommand`, `realConfigRefusal` and the `--revise-test` mode check (`packages/drive/src/node-build.ts`); `storyBuildFromValues` (`packages/cli/src/commands.ts`, through `packages/cli/src/story-build.test.ts` in the backstop).
   - **proven by —** `packages/drive/src/node-build-names-its-increment.test.ts`.
