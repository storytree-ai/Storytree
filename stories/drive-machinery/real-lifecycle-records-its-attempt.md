---
id: "real-lifecycle-records-its-attempt"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Record a REAL build's attempt before its gate walk, and its signed pass after"
outcome: "Given an increment, the single-node REAL lifecycle records one attempt on the attempt ledger immediately before the gate walk and one signed pass after a signed result, refuses the walk when the attempt cannot be recorded, reports a signed pass it could not record, and records nothing when no increment is supplied."
status: proposed
proof_mode: contract-test
depends_on: [attempt-count-follows-the-unit]
decisions: [576, 575, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/real-lifecycle-records-its-attempt.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/real-lifecycle-records-its-attempt.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/real-lifecycle-records-its-attempt.test.ts"]
      sourceGlobs: ["packages/drive/src/node-build.ts"]
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
        - "./packages/drive/src/real-lifecycle-records-its-attempt.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Record a REAL build's attempt before its gate walk, and its signed pass after

**Outcome —** Given an increment, the single-node REAL lifecycle records one attempt on the attempt
ledger immediately before the gate walk and one signed pass after a signed result. It refuses the walk
when the attempt cannot be recorded, reports a signed pass it could not record, and records nothing
when no increment is supplied.

## Proof walkthrough

**The walks are production walks.** Each case drives `buildNodeReal` over the offline REAL fixture,
the way `build-node-real-revision.test.ts` and `backstop-before-signature.test.ts` do:
- `fixtureStories([{ id, dependsOn: [] }])` and `fixtureRepo(false)` from `./real-chain-fixture.js`;
- `createBuildWorktree(repo.root, {})`;
- the spec from `findNodeSpecFile` and `loadNodeSpec`, and its config from `resolveBuildConfig`;
- the signer from `resolveSignerFromEnv({ flag: "tester@example.com" })`;
- leaf prompts from `NodeBuildModule.renderLeafPhasePrompts` over an `InMemoryStore` loaded by
  `loadFixtureCorpus`.

The author is `scriptedAuthors({ [id]: scopeFor(id) })(spec, worktree.root)`, wrapped by a
**recording author**. The wrapper counts its calls and, on its FIRST call, snapshots the store's
inner-loop docs before delegating. Every call passes `promote: false`, so nothing is pushed. Each test
tears its fixture down.

Two fixture units matter: `cap-a` signs a pass, and `cap-bad` fails closed (its authored
implementation never satisfies its test). "The inner-loop docs" means
`(await store.readEvents()).filter((e) => e.kind === INNER_LOOP_EVENT_KIND).map((e) => e.doc)`.

1. **An attempt is recorded before the gate walk.** Build `cap-bad` with `incrementId: "inc-1"` and
   `runId: "run-bad-1"`.
   - `built.result.ok` is `false`.
   - The recording author was called, and its first-call snapshot deep-equals
     `[{ event: "attempt", unitId: "cap-bad", incrementId: "inc-1", runId: "run-bad-1" }]`.
   - After the build, the inner-loop docs deep-equal that same one-element array: a failed walk
     records no signed pass.
   - `built.innerLoop` deep-equals `{ incrementId: "inc-1", attempt: { recorded: true } }`, with no
     `signedPass` key.
   - `readInnerLoopLedger(store, "cap-bad")` reports `attempts` deep-equal to
     `[{ runId: "run-bad-1", incrementId: "inc-1", signed: false }]`, and `consecutiveFailures` of `1`.
2. **A signed walk records its signed pass.** Build `cap-a` with `incrementId: "inc-1"` and
   `runId: "run-a-1"`.
   - `built.result.ok` is `true`.
   - The inner-loop docs deep-equal, in this order,
     `[{ event: "attempt", unitId: "cap-a", incrementId: "inc-1", runId: "run-a-1" }, { event: "signed-pass", unitId: "cap-a", incrementId: "inc-1", runId: "run-a-1" }]`.
   - `built.innerLoop` deep-equals
     `{ incrementId: "inc-1", attempt: { recorded: true }, signedPass: { recorded: true } }`.
   - `readInnerLoopLedger(store, "cap-a")` reports `unresolvedSignedRuns` deep-equal to
     `["run-a-1"]`, and `policy.disposition` of `"signed"`.
3. **An attempt that cannot be recorded refuses the walk.** Build `cap-a` with `incrementId: "inc-1"`
   over an `InMemoryStore` subclass. Its `appendEvent` throws `new Error("attempt-append-marker")` for
   any event of kind `INNER_LOOP_EVENT_KIND`, and delegates every other append.
   - `built.result.ok` is `false`, `failedAt` is `"AUTHOR_TEST"`, and `phasesVisited` deep-equals
     `[]`. The `reason` contains `attempt-append-marker` and `ADR-0576 D5`.
   - The recording author was called ZERO times.
   - The store holds no inner-loop event and no event of kind `signing`.
   - `built.innerLoop` deep-equals
     `{ incrementId: "inc-1", attempt: { recorded: false, reason: "attempt-append-marker" } }`.

   Then build `cap-a` over a plain `InMemoryStore` with `incrementId: "   "`:
   - `built.result.ok` is `false`, and the recording author was called zero times;
   - the store holds no inner-loop event;
   - `built.innerLoop?.incrementId` is `"   "`, `built.innerLoop?.attempt.recorded` is `false`, and
     the attempt's `reason` is a non-empty string. It is the protocol's own refusal of a blank id.
4. **A signed pass that cannot be recorded is reported, never swallowed.** Build `cap-a` with
   `incrementId: "inc-1"` over an `InMemoryStore` subclass. Its `appendEvent` throws
   `new Error("signed-pass-append-marker")` only for an `INNER_LOOP_EVENT_KIND` event whose doc's
   `event` is `"signed-pass"`.
   - `built.result.ok` is `true`, and the store holds at least one event of kind `signing`: the
     verdict stands.
   - The inner-loop docs deep-equal the single `attempt` doc.
   - `built.innerLoop` deep-equals
     `{ incrementId: "inc-1", attempt: { recorded: true }, signedPass: { recorded: false, reason: "signed-pass-append-marker" } }`.
5. **Nothing is recorded without an increment or a walk (the guard-rail).**
   - Build `cap-a` with NO `incrementId`. `built.result.ok` is `true`, `"innerLoop" in built` is
     `false`, and the inner-loop docs deep-equal `[]`.
   - Build `cap-a` with `incrementId: "inc-1"`, NO `authorOverride`, and
     `liveAuthorOverride: cannedLiveAuthor([])`, which the resolver refuses before any walk.
     `built.result.ok` is `false` and its `reason` contains `liveAuthorOverride`. `"innerLoop" in built`
     is `false`, and the inner-loop docs deep-equal `[]`.

   Both hold before the source change. Today `buildNodeReal` records no inner-loop event at all, so
   their test passes at red by design, under the contract's declared guard-rail.

**Before the source change**, `buildNodeReal` ignores `incrementId` and writes no inner-loop event.
Steps 1–4 each fail on an assertion: the snapshot and the docs are empty, `innerLoop` is absent, and
the walks in step 3 run and pass. Step 5 passes. After the change, every step passes.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (5)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Decided by ADR-0576 D5** (`storytree library artifact adr-0576`), under D3: a paid build records
only what the spine observed. That is an attempt and, when the spine signs, a signed pass. It never
grants and never adjudicates. Only `buildNodeReal` and two type declarations in
`packages/drive/src/node-build.ts` change.

- **The types.** Export from `packages/drive/src/node-build.ts`:
  - `type InnerLoopAppend = { readonly recorded: true } | { readonly recorded: false; readonly reason: string }`;
  - `interface InnerLoopRecording { readonly incrementId: string; readonly attempt: InnerLoopAppend; readonly signedPass?: InnerLoopAppend }`.

  `RealBuildArgs` gains `incrementId?: string | undefined`, documented as ADR-0576 D5's increment.
  When it is absent, nothing is recorded. That includes story-chain members, which ADR-0576 D7 walks
  without one. `RealBuildResult` gains `innerLoop?: InnerLoopRecording`. The key is PRESENT exactly
  when an attempt append was made, and absent otherwise, never set to `undefined`. That covers both
  "no increment supplied" and "the walk refused before the gate", such as a resolution refusal.
- **Where the attempt goes.** Place it inside `buildNodeReal`, after `resolveProveSpec` succeeds and
  after the `onPhase` and `backstop` wiring, immediately BEFORE
  `const result = await proveUnit(resolved.spec);`.
  - When `args.incrementId !== undefined`, append
    `appendInnerLoopEvent(store, { event: "attempt", unitId: spec.id, incrementId: args.incrementId, runId }, signer)`
    (`@storytree/orchestrator`).
  - Nothing before that point is an attempt at the unit: not the `building` event, not resolution,
    and not the worktree or install, which the caller owns. A resolution refusal therefore returns as
    it does today, with no `innerLoop` key.
- **The attempt append FAILS CLOSED.** If it throws, do NOT walk. Return
  `{ result: { ok: false, failedAt: "AUTHOR_TEST", reason, phasesVisited: [] }, innerLoop: { incrementId, attempt: { recorded: false, reason: <message> } } }`,
  where:
  - `<message>` is the thrown error's `message`, or `String(error)` for a non-Error;
  - `reason` reads
    `inner-loop attempt for <unitId> (run <runId>, increment <incrementId>) could not be recorded: <message> — the walk is refused before the leaf (ADR-0576 D5)`.

  The protocol refuses a blank increment id, so a blank id takes this same path; no separate check is
  needed. Do NOT copy the usage and scope appends that follow `proveUnit`. They are advisory, and they
  swallow failures by design.
- **Where the signed pass goes.** Immediately after `proveUnit` returns, and before the advisory
  appends and every early return that follows, append
  `{ event: "signed-pass", unitId: spec.id, incrementId, runId }` the same way when `result.ok` is
  true. A throw is caught and reported as `signedPass: { recorded: false, reason: <message> }`. It
  never changes `result`, and it never stops the rest of the lifecycle: the verdict is already signed.
  A walk that did not sign carries no `signedPass` key.
- **Attach the recording** to `out` as soon as `out` is built, so every later return, including the
  failure, nothing-authored and `promote: false` returns, carries it.
- **Traps from the plan, as they bear on this unit.**
  - **Trap 6: the attempt append fails CLOSED.** It is the only fail-closed append in this function.
    Refusing the walk is the point, because a build that could not record its attempt would otherwise
    spend on an attempt the ledger never counts.
  - **Trap 4: each new refusal sits after every existing cheap refusal.** Inside `buildNodeReal`, the
    only refusal ahead of the new one is `resolveProveSpec`'s, and it keeps its place and its shape.
    `nodeBuild`'s refusals are untouched.
  - **Trap 2: keep every existing test title byte-for-byte.** This unit's test file is NEW, and no
    existing test file is in its write scope. `build-node-real-revision.test.ts`,
    `backstop-before-signature.test.ts`, `leaf-slices-activation.test.ts` and every other caller pass
    no `incrementId` and must stay green, unchanged, in the package suite that runs before signing.
  - **Trap 3: the leaf writes only its declared globs.** IMPLEMENT edits `node-build.ts` alone.
- **The red is an ASSERTION red, reviewed per test.** The node declares `editsExisting`.
  - Import `./node-build.js` as a namespace (`import * as NodeBuildModule`), never by name. A named
    import of a type or value the module does not yet export fails to link, which is a structural red
    of the wrong kind (ADR-0057 C). Do not import the two new types at all; assert through values.
  - **Every NEW test must FAIL at red on an `assert` call, never on a `TypeError`.** Assert on
    `built.innerLoop` as a whole with `assert.deepEqual`, or reach into it only through `?.`, because
    at red it is `undefined`.
  - A new test that passes at red is refused unless every contract its title names declares a
    guard-rail (ADR-0572 D2). Step 5's cases are exactly that, which is why contract 5 declares one.
    - Keep step 5's test titles naming ONLY `nothing-is-recorded-without-an-increment-or-a-walk`.
    - Keep every other test's title naming ONLY its own contract.
  - Use flat `test(...)` calls from `node:test`, with no `describe`. Each title is ONE static string
    literal beginning `<contract-id>: `, with no concatenation, no template and no `.each`.
  - Assert with `node:assert/strict`.
- **The test's imports all exist today.**
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `INNER_LOOP_EVENT_KIND` from `@storytree/proof-protocol`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `createBuildWorktree`, `findNodeSpecFile`, `loadNodeSpec`, `resolveBuildConfig`,
    `resolveSignerFromEnv` and `readInnerLoopLedger` from `@storytree/orchestrator`;
  - `fixtureRepo`, `fixtureStories`, `scriptedAuthors`, `scopeFor` and `cannedLiveAuthor` from
    `./real-chain-fixture.js`;
  - types through `import type`.
- **The mutation rung scores the added lines.** `check:mutation-diff` mutates every expression on the
  lines this branch adds to `node-build.ts`. So pin the refusal's `failedAt`, `phasesVisited` and the
  `reason`'s fixed parts, and each recording exactly, as the walkthrough does.

## Out of scope

- `nodeBuild`, `storyBuild` and `driveBuildTestsGate`: taking `--increment`, passing it here, and
  turning `innerLoop` into the entry state. Those are the later `node-build-names-its-increment`,
  `story-real-chain-names-its-increment` and `gate-real-build-names-its-increment` units.
- The story chain's own ledger unit, which ADR-0576 D7 records against the story id in `storyBuild`.
  Chain members keep calling this function with no increment.
- The pre-spend preflight and the entry state (`build-entry-refuses-before-spend`), and the grant and
  adjudication verbs (`orchestrator-records-its-calls`).
- Any change to `packages/orchestrator/src/proof/inner-loop-ledger.ts`, `inner-loop-exit.ts`,
  `packages/proof-protocol/src/inner-loop-event.ts` or `pg-work-store.ts`.

## Contracts (5)

1. **`an-attempt-is-recorded-before-the-gate-walk`** — given an increment, one attempt is appended before the leaf authors anything, and a walk that fails records nothing more.
   - **asserts —** building the failing fixture unit `cap-bad` with `incrementId: "inc-1"` gives the leaf's first call a store already holding exactly the `attempt` doc for that unit, increment and run. After the build the store holds only that doc, and `built.innerLoop` deep-equals `{ incrementId: "inc-1", attempt: { recorded: true } }`. `readInnerLoopLedger` reports that one unsigned attempt and one consecutive failure. Test titles begin `an-attempt-is-recorded-before-the-gate-walk: `.
   - **covers —** `buildNodeReal`, `RealBuildArgs.incrementId` and `RealBuildResult.innerLoop` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/real-lifecycle-records-its-attempt.test.ts`, through the declared focused bun REAL proof.
2. **`a-signed-walk-records-its-signed-pass`** — a walk the spine signs appends one signed pass after its attempt and reports both.
   - **asserts —** building `cap-a` with `incrementId: "inc-1"` signs a pass, leaves the `attempt` doc then the `signed-pass` doc for that unit, increment and run, and returns `innerLoop` deep-equal to `{ incrementId: "inc-1", attempt: { recorded: true }, signedPass: { recorded: true } }`. The ledger reports the run as an unresolved signed run, with policy `signed`. Test titles begin `a-signed-walk-records-its-signed-pass: `.
   - **covers —** `buildNodeReal` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/real-lifecycle-records-its-attempt.test.ts`.
3. **`an-unrecordable-attempt-refuses-the-walk`** — an attempt that cannot be appended refuses the walk before the leaf is called.
   - **asserts —** when the store throws on an inner-loop append, or the increment id is blank, `buildNodeReal` returns `result` with `ok: false`, `failedAt: "AUTHOR_TEST"` and `phasesVisited: []`, and a reason carrying the append's error and `ADR-0576 D5`. It never calls the author, and it leaves no inner-loop or `signing` event. It reports `innerLoop.attempt` as `{ recorded: false, reason: <the error's message> }`. Test titles begin `an-unrecordable-attempt-refuses-the-walk: `.
   - **covers —** `buildNodeReal` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/real-lifecycle-records-its-attempt.test.ts`.
4. **`an-unrecordable-signed-pass-is-reported`** — a signed pass that cannot be appended leaves the verdict standing and is reported on the result.
   - **asserts —** when the store throws only on the `signed-pass` append, building `cap-a` still returns `result.ok: true` with a `signing` event stored, leaves only the `attempt` doc, and returns `innerLoop` deep-equal to `{ incrementId: "inc-1", attempt: { recorded: true }, signedPass: { recorded: false, reason: "signed-pass-append-marker" } }`. Test titles begin `an-unrecordable-signed-pass-is-reported: `.
   - **covers —** `buildNodeReal` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/real-lifecycle-records-its-attempt.test.ts`.
5. **`nothing-is-recorded-without-an-increment-or-a-walk`** — a build given no increment, or refused before its walk, appends no inner-loop event and carries no recording.
   - **asserts —** building `cap-a` with no `incrementId` passes with no `innerLoop` key and no inner-loop doc. Building it with `incrementId: "inc-1"` but a `liveAuthorOverride` and no `authorOverride` is refused by the resolver, with no `innerLoop` key and no inner-loop doc. Test titles begin `nothing-is-recorded-without-an-increment-or-a-walk: `.
   - **guard-rail —** both cases already hold before this contract's source change, because `buildNodeReal` records no inner-loop event today, so their test passes at red by design (ADR-0572 D2). It pins that existing callers and story-chain members (ADR-0576 D7), which pass no increment, stay unaffected, and that a resolution refusal is not an attempt (ADR-0576 D5).
   - **covers —** `buildNodeReal` (`packages/drive/src/node-build.ts`).
   - **proven by —** `packages/drive/src/real-lifecycle-records-its-attempt.test.ts`.
