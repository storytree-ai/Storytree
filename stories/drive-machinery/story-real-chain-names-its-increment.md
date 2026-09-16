---
id: "story-real-chain-names-its-increment"
tier: contract
story: drive-machinery
capability: story-topo-build
arc: inner-loop-exit-arc
title: "Make a REAL story chain name a live increment, preflight every unit it drives, and record one attempt for the story"
outcome: "`story build --real` refuses before the database starts unless it names a live increment and the story and every driven member pass the attempt policy in one ledger read; it records one attempt for the story before the first member's walk and one signed pass only when the chain passed and its promotion ran unwithheld, walks its members without per-member ledger events, and renders every outcome through the one entry state."
status: proposed
proof_mode: contract-test
depends_on: [node-build-names-its-increment]
decisions: [576, 575, 563]
proof:
  command:
    file: bun
    args:
      - "test"
      - "--preload"
      - "./scripts/tsx-cache-off.mjs"
      - "--timeout"
      - "300000"
      - "./packages/drive/src/story-real-chain-names-its-increment.test.ts"
      - "./packages/drive/src/story-backstop-forensics.test.ts"
      - "./packages/cli/src/story-build.test.ts"
  scope:
    testGlobs:
      - "packages/drive/src/story-real-chain-names-its-increment.test.ts"
      - "packages/drive/src/leaf-slices-activation.test.ts"
      - "packages/drive/src/story-backstop-forensics.test.ts"
      - "packages/cli/src/story-real-build.test.ts"
      - "packages/cli/src/story-build.test.ts"
    sourceGlobs:
      - "packages/drive/src/story-build.ts"
  real:
    testFile: "packages/drive/src/story-real-chain-names-its-increment.test.ts"
    sourceFile: "packages/drive/src/story-build.ts"
    scope:
      testGlobs:
        - "packages/drive/src/story-real-chain-names-its-increment.test.ts"
        - "packages/drive/src/leaf-slices-activation.test.ts"
        - "packages/drive/src/story-backstop-forensics.test.ts"
        - "packages/cli/src/story-real-build.test.ts"
        - "packages/cli/src/story-build.test.ts"
      sourceGlobs:
        - "packages/drive/src/story-build.ts"
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
        - "./packages/drive/src/story-real-chain-names-its-increment.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "--filter", "@storytree/cli", "typecheck"]
---

# Make a REAL story chain name a live increment, preflight every unit it drives, and record one attempt for the story

**Outcome —** `story build --real` refuses before the database starts unless it names a live increment
and the story and every driven member pass the attempt policy, in one ledger read. It records one
attempt for the story before the first member's walk. It records one signed pass only when the chain
passed and its promotion ran with the push not withheld. It walks its members without per-member ledger
events, and renders every outcome through the one entry state.

## Proof walkthrough

**Every case drives the production `storyBuild`** over the offline REAL chain fixture, the way
`packages/cli/src/story-real-build.test.ts` drives it: `fixtureRepo`, `fixtureStories`,
`scriptedAuthors` and `scopeFor` from `packages/drive/src/real-chain-fixture.ts`. `fixture-story`
declares no `uat_witness`, so its story node is withheld and only the capabilities are driven.

**Fixtures.**
- **The corpus:** an `InMemoryStore` loaded by `loadFixtureCorpus` (`@storytree/library/fixture`), plus
  these rows written with `upsertDoc`:
  - `inc-live` and `inc-closed`, each of kind `increment` with doc
    `{ kind: "increment", arcRef: "asset:some-arc", status: "active" | "closed" }`;
  - `some-arc`, of kind `arc` with doc `{ kind: "arc" }`.
- **The ledger:** an `InMemoryStore` filled with `appendInnerLoopEvent` (`@storytree/orchestrator`) under
  `inc-live` where a step says so. A **counting ledger** wraps it, counting `readEvents` calls.
- **The chain options** are
  `{ dryRun: false, real: true, actor: "tester@example.com", storiesDir, repoRoot, corpusStore: <the corpus>, increment: "inc-live", innerLoopReads: { corpus: <the corpus>, ledger: <the ledger> }, progress, ensureDb, authorOverride: scriptedAuthors({ …scopeFor per member }) }`,
  where:
  - `progress` records each `stage` name in order and runs its work; `note` does nothing;
  - `ensureDb` counts its calls and returns `{ ok: false, reason: "STORY_INCREMENT_TEST_DB_MARKER" }`.
- **The stage names:** PREFLIGHT = `inner-loop preflight (the increment and the attempt ledger, before any spend)`;
  DB = `live-store preflight (probe -> db:up -> wait for connections)`.
- **`Refusal(S)`** = `innerLoopRefusalEnvelope(S)` (`./node-build.js`), where S is the state the pure
  functions return for the same input, computed by the test: `(await resolveBuildIncrement(corpus, id)).state`,
  or `(await preflightInnerLoop({ ledger, incrementId: "inc-live", unitIds, revise: false })).state`
  with `unitIds` `["fix-story", <the driven members in order>]` (`./inner-loop-entry.js`).
- **"The inner-loop docs"** means
  `(await store.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND).map((e) => e.doc)`.

1. **`--increment` is REAL-only.** `storyBuild("fix-story", { dryRun: true, increment: "inc-live", actor: "tester@example.com", storiesDir })`,
   and the same with `dryRun: false, live: true`, each deep-equal
   `{ ok: false, body: "--increment is valid only with --real: it names the increment a paid chain attempt is filed under on the attempt ledger, and neither --dry-run nor --live records an attempt (ADR-0575 D1, ADR-0576 D1).", next: ["storytree story build fix-story --real --increment inc-live"] }`.
   In the SAME test, a control that already holds before the change: without `increment`, the
   dry-run's body does not contain `--increment is valid only`.
2. **The chain is preflighted before the database starts.** Stories `cap-a` and `cap-b` (`cap-b`
   depends on `cap-a`). No `store` is supplied, so `ensureDb` is reached.
   - `increment` omitted: `Refusal(<increment-missing>)`, stages `[PREFLIGHT]`, and `ensureDb` never
     called. `"no-such-increment"`: `Refusal(<increment-unknown>)`. `"inc-closed"`:
     `Refusal(<increment-closed>)`.
   - A ledger holding `r1`–`r3` for the STORY `fix-story`: `Refusal(<decision-point for fix-story>)`.
   - A ledger holding `r1` and a signed pass on `r1` for the MEMBER `cap-a`:
     `Refusal(<unresolved-signed-pass for cap-a>)`. A member's streak or obligation refuses the whole
     chain.
   - Both at once: ONE envelope naming both refusals, and the counting ledger's `readEvents` was called
     exactly once.
   - An empty counting ledger proceeds: `readEvents` was called exactly once, `ensureDb` exactly once,
     the body is exactly
     `"this build persists to the live store, but the database could not be brought up:\nSTORY_INCREMENT_TEST_DB_MARKER"`,
     and the stages begin `[PREFLIGHT, DB]`.
   - **The existing cheap refusals keep their precedence**, checked in the SAME test as the
     `increment`-omitted refusal above, as a control that already holds before the change.
     `storyBuild("no-such-story", { …the chain options, increment omitted })` returns a body beginning
     `no story spec "no-such-story"`.
3. **One attempt for the story, one signed pass only on a promotable pass.** Each case supplies
   `store: <a fresh InMemoryStore>`, `verdictStore: "memory"`, a fresh `fixtureRepo(false)`, and
   `innerLoopReads.ledger` = that same store.
   - **A passing chain** (`cap-a`, `cap-b`; `promote` left at its default) returns `ok: true`. The
     inner-loop docs are exactly
     `[{ event: "attempt", unitId: "fix-story", incrementId: "inc-live", runId }, { event: "signed-pass", unitId: "fix-story", incrementId: "inc-live", runId }]`,
     with `runId` the attempt doc's own. There is no doc for `cap-a` or `cap-b`.
     - The body contains `increment:   inc-live`, and
       `renderInnerLoopEntryState({ state: "signed", unitId: "fix-story", runId }).lines[0]`.
     - `next[0]` is `storytree node adjudicate fix-story --run <runId> --pg`.
   - **The same chain with `promote: false`** records only the `attempt` doc, because its promotion
     never ran. Its body contains the `attempt-failed` line for one consecutive failure.
   - **A halted chain** (`cap-a`, `cap-bad` depending on `cap-a`, `cap-b` depending on `cap-bad`)
     returns `ok: false`.
     - The inner-loop docs are exactly the one story `attempt` doc.
     - The body contains the story's `attempt-failed` line for one consecutive failure, and
       `renderInnerLoopEntryState({ state: "not-attempted", unitId: "cap-b" }).lines[0]`.
     - It still offers no `gh pr create` in `next`, and its last `next` entry is
       `storytree story build fix-story --real --increment inc-live`.
   - **A second chain over the passing chain's store** is refused as
     `Refusal(<unresolved-signed-pass for fix-story>)` before `ensureDb`.
4. **Recording fails closed, and an unrecordable pass is reported.**
   - The store is an `InMemoryStore` subclass whose `appendEvent` throws `new Error("attempt-append-marker")`
     for any `INNER_LOOP_EVENT_KIND` event.
     - The passing chain returns `ok: false` with `next` deep-equal to `["pnpm db:probe"]`, and a body
       matching
       `/^inner-loop attempt for fix-story \(run \S+, increment inc-live\) could not be recorded: attempt-append-marker — the chain is refused before its first member's walk \(ADR-0576 D5, D7\)$/`.
     - A counting wrapper around `scriptedAuthors` saw ZERO author calls, and the store holds no event
       of kind `signing`.
   - The store throws `new Error("signed-pass-append-marker")` only for a doc whose `event` is
     `signed-pass`. The passing chain returns `ok: true`, and the body contains
     `inner loop:  signed, but the signed pass could not be recorded: signed-pass-append-marker — the ledger holds no landing obligation for run <runId> (ADR-0576 D5)`.

**Before the source change** `storyBuild` ignores `increment`, `innerLoopReads` and `store`, and
records nothing. Step 1's runs proceed. Step 2 reaches `ensureDb` without a refusal. Step 3 finds no
inner-loop doc and the fresh store unused. Step 4's store is never written. Every TEST fails on an
assertion, because the two control checks that already hold (step 1's un-refused dry-run and step 2's
unknown-story precedence) each share a test with an assertion that does not. After the change, every
step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (5)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Where the wiring goes.** Line numbers are approximate, as of this spec's commit; search for the
quoted text if they have moved.
- `packages/drive/src/story-build.ts`:
  - the imports: `@storytree/orchestrator` at ~13–27, the `./node-build.js` block at ~54–66 (add
    `preflightPaidBuild`, `innerLoopRefusalEnvelope`, `renderIncrementLines`, `renderInnerLoopOutcome`,
    and the types `InnerLoopReadHandles` and `InnerLoopRecording`), and `./inner-loop-entry.js` for
    `renderInnerLoopEntryState`. `appendInnerLoopEvent` comes from `@storytree/orchestrator`;
  - `StoryBuildOpts` at ~407, with `corpusStore` at ~414, `verdictStore` at ~449, `authorOverride` at
    ~475, `promote` at ~494, and `progress` at ~531, where it ends;
  - `storyBuild` at ~535: the mode menu at ~549; the runtime, pi and Codex refusals at ~569–621;
    `rootDir` at ~622; the signer at ~626; the story load at ~644–674; `topoOrderStoryNodes` at ~698;
    `driveOrder` at ~714; the `realConfigRefusal` loop at ~740; the db proof env at ~753; the dep-add
    groups at ~764; `const retryCmd = …` at ~780; `needsDb` at ~784;
  - `const progress = …` at ~788, `ensureDb` at ~789–806, and the prompt stage at ~811–819;
  - `const storeChoice = await progress.stage("verdict store …", …)` at ~821;
  - `runId` at ~844; the chain claims at ~861–893; the shared worktree cut at ~900–911; `leaves` and
    `failures` at ~914; `realArgs` at ~950–966; `const run = await runStoryBuild(…)` at ~1038;
  - the promotion at ~1041–1089: the promote branch at ~1047 (`anyRed` at ~1063,
    `promotion = await promoteRealPass(promoteArgs);` at ~1077), and the halt branch at ~1078;
  - `const events = await store.readEvents();` at ~1092; `nodeLines` at ~1094, whose "never ran" line
    is at ~1111; the header at ~1114, whose `runtime:` line is at ~1121;
  - the halt envelope at ~1188–1201, with its `next` at ~1199; the withheld-story pass envelope at
    ~1256; and the full pass envelope after it.
- **The template for the injected store** is the gate driver's `deps.store` branch in
  `packages/cli/src/gate-build-driver.ts` at ~337: an injected store with `persisted: false`, an
  `in-memory (injected …)` label, and a no-op `close`.
- **The existing tests in scope, and where:** `packages/cli/src/story-real-build.test.ts` at ~199,
  ~237, ~274 and ~323 (its `fixtureCorpus` is near the top); `packages/drive/src/leaf-slices-activation.test.ts`
  at ~70, ~105, ~136 and ~239; `packages/drive/src/story-backstop-forensics.test.ts` at ~258 and ~320;
  and `packages/cli/src/story-build.test.ts`, whose `--revise-test` refusal test at ~331 is the
  threading test to sit beside.
- **Order of work.** AUTHOR_TEST writes the new test file first, then the existing-test body updates.
  IMPLEMENT makes the first compiling edit (the three `StoryBuildOpts` fields), then calls `run_proof`
  at once and iterates against its failures.

**The regression backstop is narrowed, and that is a DECLARED gap.**
- **What it runs:** three files — `story-real-chain-names-its-increment.test.ts` and
  `story-backstop-forensics.test.ts` in `packages/drive/src`, and `story-build.test.ts` in
  `packages/cli/src`. The two existing ones exited 0 at `5ca8557c` in 31 s
  (29 tests); the third is the new test file this build authors.
- **What it drops:** the other two touched test files, measured at `5ca8557c`:
  `packages/drive/src/leaf-slices-activation.test.ts` (157 s) and
  `packages/cli/src/story-real-build.test.ts` (125 s). Both stay in this unit's test globs, so the
  test author still updates them.
- **Who covers the rest:** the landing gate re-runs both whole suites in full, including those two
  files and the cli package's `validate-corpus.ts` step.
- **Why:** the spine's backstop bound is fixed at 600 s. `node-build-names-its-increment` measured
  both whole suites at 844 s together, and its attempt 4 was killed at that bound.

**Decided by ADR-0576 D7** (`storytree library artifact adr-0576`), with D1, D2, D5 and D8. **A story
chain is ONE unit on the ledger, the story id.** The chain records one attempt against the story before
its first member's walk, and walks its members through `buildNodeReal` WITHOUT an increment id, so U2's
per-member recording never fires. **The signed pass is recorded only when the chain passed AND its
promotion ran with the push not withheld** (ruled for this unit). A withheld push is no landing
candidate, and recording a pass there would mint an obligation nobody can land. The preflight reads the
story's own ledger and every driven member's, and refuses the whole chain if any refuses, so a chain
cannot step around a node build's streak or obligation. A halted chain is one failed attempt at the
story. Its signed prefix owes the ledger nothing, and the promote-once rule and the halt test's "never a
landing candidate" assertions stand unchanged.

- **The options** (`StoryBuildOpts`):
  - `increment?: string | undefined` — `--increment <id>` (ADR-0575 D1). The CLI already threads it
    through `nodeStoryBuildOpts`;
  - `innerLoopReads?: InnerLoopReadHandles | undefined` — a test seam. Production omits it, and
    `preflightPaidBuild` opens the live handles;
  - `store?: Store | undefined` — a test-only verdict store, following the gate driver's `deps.store`
    precedent. When present, the chain uses it in place of the resolved verdict store: `persisted`
    false, no claim store, and a no-op close. Tests pass `verdictStore: "memory"` beside it, as the
    chain tests already do, so no DB preflight runs.
- **`storyBuild`, in this order.**
  1. **The mode check**, directly after the Codex `--max-turns` refusal and before `rootDir`: an
     `increment` without `real` refuses with walkthrough step 1's exact envelope.
  2. **The preflight**, directly after `const progress = …` and before `if (needsDb)`, so it follows
     every existing cheap refusal (plan trap 4). Declare `let incrementId: string | undefined;` and
     `let incrementWarnings: readonly string[] = [];`. When `real`, run
     `preflightPaidBuild({ incrementId: opts.increment, unitIds: <story.id then each driveOrder id, without duplicates>, revise: false, reads: opts.innerLoopReads })`
     inside `progress.stage("inner-loop preflight (the increment and the attempt ledger, before any spend)", …)`.
     A refusal returns `innerLoopRefusalEnvelope(preflight.state)`. ONE call reads the ledger ONCE for
     every unit (plan trap 9).
  3. **The store:** use `opts.store` in place of the `verdict store` stage when it is supplied.
  4. **The story attempt**, after the shared worktree is cut and before `leaves` is declared, REAL only:
     append `{ event: "attempt", unitId: story.id, incrementId, runId }` with `appendInnerLoopEvent(store, …, signer.signer)`,
     and hold the recording `{ incrementId, attempt: { recorded: true } }`. **A throw FAILS CLOSED**
     (plan trap 6). Return walkthrough step 4's envelope before any member walks; the existing `finally`
     removes the worktree and releases the claims.
  5. **The members** keep their `realArgs` exactly as they are, with no `incrementId`.
  6. **The signed pass**, inside the promote branch, directly after
     `promotion = await promoteRealPass(promoteArgs);`, only when `!anyRed`: append
     `{ event: "signed-pass", unitId: story.id, incrementId, runId }`. A throw is caught and held as
     `signedPass: { recorded: false, reason: <message> }`. It never changes the envelope's `ok`.
  7. **The envelopes.** After the existing `const events = await store.readEvents();`, compute
     `const outcome = renderInnerLoopOutcome(story.id, runId, <the recording>, events);`, and the
     not-attempted lines: for a REAL chain that halted, one
     `renderInnerLoopEntryState({ state: "not-attempted", unitId })` line per driven member after the
     halted one.
     - The header spreads `...renderIncrementLines(incrementId, incrementWarnings)` after its
       `runtime:` line.
     - The halt envelope spreads the not-attempted lines, then `...outcome.lines`, after its `outcome:`
       lines. Its `next` becomes `[...outcome.next, <the retry command>]`, where the retry command
       for a REAL chain is `storytree story build <storyId> --real --increment <incrementId>` and is
       otherwise unchanged.
     - Both pass envelopes spread `...outcome.lines` after their `outcome:` lines, and their `next`
       becomes `[...outcome.next, <the existing entries>]`.
- **The existing tests in scope.** Keep EVERY title byte-for-byte and change bodies only (trap 2).
  Each chain walk below gains `increment: "inc-live"` and
  `innerLoopReads: { corpus: <a corpus holding an active inc-live increment>, ledger: new InMemoryStore() }`,
  and every existing assertion stands. A small per-file helper that builds that corpus is fine.
  - `packages/cli/src/story-real-build.test.ts`:
    - `--real chains capabilities topo-ordered over ONE worktree; cap-b builds on cap-a's committed source`;
    - `--real HALTS the chain when a node fails closed; the later node never runs`;
    - `--real promotes ONCE at the stacked HEAD; cap-a's verdict commit is an ancestor of the branch tip`;
    - `--real HALT parks the proven prefix LOCAL-ONLY — never pushed, never a landing candidate`.
  - `packages/drive/src/leaf-slices-activation.test.ts`:
    - `the-leaf-slices-observer-fires-with-the-canned-run-accounting: a --real chain with a liveAuthorOverride invokes onLeafSlices with that node's EXACT canned runs`;
    - `no-live-author-override-leaves-the-observer-silent: authorOverride alone (no liveAuthorOverride) never invokes onLeafSlices — no fabricated accounting is claimed`;
    - `a-canned-live-author-cannot-move-a-verdict: a canned success-shaped run accounting cannot turn a genuinely FAILING node into a signed pass`;
    - `each-chained-node-reports-its-own-slices: a two-node --real chain reports EACH node's own canned accounting once, never swapped or reused`.
  - `packages/drive/src/story-backstop-forensics.test.ts`:
    - `a first-node backstop red reports its diagnostics and retains only the unsigned local attempt`;
    - `a later story-node backstop red keeps distinct signed-prefix and unsigned forensic refs`.
  - `packages/cli/src/story-build.test.ts`: add one new test, after the `--revise-test` refusal test,
    titled `story build carries --increment to storyBuild on every route to the chain, which refuses it without --real (ADR-0575 D1)`.
    For the argv `story build library --dry-run --increment inc-x`, and the same through
    `build story library` and `build library`, `run(argv, deps)` returns `ok: false` with a body
    beginning `--increment is valid only with --real` and `next` deep-equal to
    `["storytree story build library --real --increment inc-x"]`.

  Every other test in those files either refuses before the preflight or runs no REAL chain, and stays
  unchanged. Titles in those four files follow their own convention.
- **Traps from the plan, as they bear on this unit.**
  - **Trap 6: the story attempt append fails CLOSED.** Do not copy the advisory usage appends.
  - **Trap 9: read the ledger once per build**, never once per member.
  - **Trap 4: each new refusal sits after every existing cheap refusal.**
- **The red is an assertion red, reviewed per test.** The node declares `editsExisting`.
  - **Two control checks hold before the change**, and no contract here declares a guard-rail: step
    1's "without `increment` a dry-run is not refused for it", and step 2's unknown-story precedence
    case. Put each in the SAME test as an assertion that fails at red (step 1's mode refusal, and step
    2's missing-increment refusal). A test whose every assertion already holds at red is refused at
    CONFIRM_RED (C4), as `node-build-names-its-increment` attempt 2 measured.
  - **Write every `assert` call in the test body itself.** The per-test review's static read credits
    only assertions it finds there, and refuses a test whose assertions all live in a helper function
    (C6, ADR-0126). A helper may build fixtures or compute an expected value; the asserting stays
    inline.
  - Import `./story-build.js` as a namespace (`import * as StoryBuildModule`), and reach `storyBuild`
    through it.
  - **Every NEW test must FAIL at red on an `assert` call, never on a `TypeError`.** Assert whole
    envelopes with `assert.deepEqual`, and reach into docs only through `?.`.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`. Loops over
    cases go INSIDE a test.
  - Assert with `node:assert/strict`.
- **The test's other imports all exist today.**
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `INNER_LOOP_EVENT_KIND` from `@storytree/proof-protocol`;
  - `appendInnerLoopEvent` from `@storytree/orchestrator`;
  - `resolveBuildIncrement`, `preflightInnerLoop` and `renderInnerLoopEntryState` from
    `./inner-loop-entry.js`;
  - `innerLoopRefusalEnvelope` from `./node-build.js`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `fixtureRepo`, `fixtureStories`, `scriptedAuthors` and `scopeFor` from `./real-chain-fixture.js`.
- **Before signing.** The typecheck of both packages runs, and the narrowed regression command runs
  as the backstop over the three files the declared gap above names.

**Declared, not observed by this test.** A promotion whose push is withheld by a red chain-end
backstop (`anyRed`) is confirmed by reading: the fixture's nodes are not install-bearing, so the push
gate observes nothing and cannot red.

## Out of scope

- `nodeBuild` and `driveBuildTestsGate`.
- The help text (`storyHelp`) and the Library's documented commands. These are landing glue.
- Any change to `packages/drive/src/node-build.ts`, `packages/drive/src/inner-loop-entry.ts`,
  `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.

## Contracts (5)

1. **`story-chain-increment-is-real-only`** — `--increment` reaches `storyBuild` on every route to the chain and is refused without `--real`.
   - **asserts —** `storyBuild` given `increment` with `--dry-run` or `--live` refuses with a body naming `--increment` and `--real` and a `next` of the same command with `--real`; without `increment` a dry-run is not refused for it. Test titles begin `story-chain-increment-is-real-only: `.
   - **covers —** `storyBuild`'s increment mode check and `StoryBuildOpts.increment` (`packages/drive/src/story-build.ts`).
   - **proven by —** `packages/drive/src/story-real-chain-names-its-increment.test.ts`, through the declared focused bun REAL proof; the dispatch half by `packages/cli/src/story-build.test.ts` in the backstop.
2. **`story-chain-preflights-every-unit-before-spend`** — a REAL chain refuses a missing or dead increment, or any refusing story or member, in one ledger read before the database starts.
   - **asserts —** a missing, unknown or closed increment, a story at its decision point, and a member holding an unresolved signed pass each refuse with `innerLoopRefusalEnvelope` of the pure functions' state, with only the preflight stage opened and `ensureDb` never called. Refusals for the story and a member arrive in one envelope from one `readEvents` call. An empty ledger proceeds through one read to the injected DB refusal, and an unknown story still refuses first. Test titles begin `story-chain-preflights-every-unit-before-spend: `.
   - **covers —** `storyBuild`'s preflight and `StoryBuildOpts.innerLoopReads` (`packages/drive/src/story-build.ts`).
   - **proven by —** `packages/drive/src/story-real-chain-names-its-increment.test.ts`.
3. **`story-chain-records-one-attempt-for-the-story`** — a REAL chain records one attempt for the story and no member events, and a signed pass only on a pass whose promotion ran unwithheld.
   - **asserts —** a passing, promoting chain leaves exactly an `attempt` then a `signed-pass` for `fix-story` under `inc-live`, and no doc for its members. The same chain with `promote: false` leaves only the `attempt`, and a halted chain leaves only the `attempt`. A second chain over the passing chain's ledger refuses on the story's unresolved signed pass. Test titles begin `story-chain-records-one-attempt-for-the-story: `.
   - **covers —** the story attempt and signed-pass appends and `StoryBuildOpts.store` (`packages/drive/src/story-build.ts`).
   - **proven by —** `packages/drive/src/story-real-chain-names-its-increment.test.ts`.
4. **`story-chain-recording-fails-closed`** — an unrecordable story attempt refuses the chain before any member walks, and an unrecordable signed pass is reported.
   - **asserts —** when the store throws on an inner-loop append, the chain refuses with the attempt-recording body and `pnpm db:probe`, calls no author, and signs nothing. When it throws only on the signed pass, the chain still passes and its body names the unrecorded signed pass. Test titles begin `story-chain-recording-fails-closed: `.
   - **covers —** the story attempt's fail-closed refusal and the signed pass's reported failure (`packages/drive/src/story-build.ts`).
   - **proven by —** `packages/drive/src/story-real-chain-names-its-increment.test.ts`.
5. **`story-chain-envelopes-render-the-entry-state`** — a REAL chain's header, outcome and member lines come from the one entry-state renderer.
   - **asserts —** a passing chain names its increment and renders the story's `signed` state with the adjudicate command first in `next`. A halted chain renders the story's `attempt-failed` state and a `not-attempted` line for each member after the halt, offers no `gh pr create`, and ends `next` with `storytree story build fix-story --real --increment inc-live`. Test titles begin `story-chain-envelopes-render-the-entry-state: `.
   - **covers —** `storyBuild`'s header, halt and pass envelopes (`packages/drive/src/story-build.ts`).
   - **proven by —** `packages/drive/src/story-real-chain-names-its-increment.test.ts`.
