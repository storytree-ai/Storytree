---
id: "build-node-real-threads-revision"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Thread a test revision through the single-node REAL lifecycle and record its escalation"
outcome: "`buildNodeReal` hands a supplied test revision to the AUTHOR_TEST brief and, given a directory, records a returned escalation and reports what it wrote."
status: proposed
proof_mode: contract-test
depends_on: [revision-record-round-trip]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/build-node-real-revision.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/build-node-real-revision.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/build-node-real-revision.test.ts"]
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
        - "./packages/drive/src/build-node-real-revision.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Thread a test revision through the single-node REAL lifecycle and record its escalation

**Outcome —** `buildNodeReal` hands a supplied test revision to the AUTHOR_TEST brief and, given a
directory, records a returned escalation and reports what it wrote.

## Proof walkthrough

**The lifecycle is real.** The test drives the production `buildNodeReal` over a real fixture
worktree, with the same helpers `backstop-before-signature.test.ts` uses:

- a throwaway repo from `fixtureRepo(false)`;
- a fixture story from `fixtureStories([{ id: "cap-a", dependsOn: [] }])`, both from
  `packages/drive/src/real-chain-fixture.ts`;
- a fresh `createBuildWorktree(repo.root, {})` per call, removed afterwards;
- the `cap-a` spec loaded through `findNodeSpecFile` and `loadNodeSpec`;
- `buildConfig` from `resolveBuildConfig(spec)`, and `realConfig` from its `real:` arm (no install,
  so no backstop);
- a signer from `resolveSignerFromEnv({ flag })`;
- `phasePrompts` from `renderLeafPhasePrompts` over an `InMemoryStore` loaded by `loadFixtureCorpus`;
- an `InMemoryStore` verdict store;
- `repoRoot: repo.root` and `baseSha: worktree.headSha`.

**The author is an inline recording `PhaseAuthor`**, not `scriptedAuthors`. It records each
`(phase, prompt)` it is asked for and returns a result the case scripts. It is passed as
`authorOverride`.

**The revision is production output.** Step 1 builds its revision from a real `proveUnit`
IMPLEMENT-escalation walk over a `ShellTestExecutor` child command, as
`node-build-revision-record.test.ts` does. It passes that walk's result through `writeRevisionRecord`,
then reads it back with `readTestRevision`.

1. **Threading.** The author returns `{ ok: false, error: "recorded" }`.
   - With `testRevision`, `built.result` fails at `AUTHOR_TEST`, IMPLEMENT is never requested, and the
     recorded AUTHOR_TEST prompt contains the revision's run id, statement and assertion.
   - Without it, the recorded AUTHOR_TEST prompt contains none of the three.
   - Neither built result carries a `revisionWrite` key: `"revisionWrite" in built` is false.
2. **Recording a returned escalation.** The author returns
   `{ ok: false, error, escalation }` at AUTHOR_TEST, with an escalation built by
   `parseAuthoringEscalation("AUTHOR_TEST", { statement })`. The spine then takes its one observation:
   `cap-a`'s real proof command, run in the fixture worktree.
   - With `escalationsDir` set to a fresh temp directory, `built.result.escalation` is present.
     `built.revisionWrite` deep-equals
     `{ written: true, path: revisionRecordPath(tmp, "cap-a", runId) }`, and
     `readTestRevision(tmp, "cap-a", runId)` yields a revision whose `escalation` deep-equals
     `built.result.escalation`.
   - The same walk without `escalationsDir` gives a result with no `revisionWrite` key, and a second
     fresh temp directory stays empty.
3. **A failure that is not an escalation.** The author returns `{ ok: false, error }` with
   `escalationsDir` set. The result carries no `revisionWrite` key, and the directory stays empty.

The observable is the `RealBuildResult`, the prompts the recording author received, and the files
under the temp directories. The test file is NEW: `packages/drive/src/build-node-real-revision.test.ts`.
The existing `backstop-before-signature.test.ts` and `leaf-slices-activation.test.ts` are not in this
contract's write scope.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

Only `buildNodeReal`, `RealBuildArgs` and `RealBuildResult` in `packages/drive/src/node-build.ts`
change. The record functions they call belong to contract
[`revision-record-round-trip`](revision-record-round-trip.md), and the brief they feed belongs to
contract [`real-brief-carries-test-revision`](real-brief-carries-test-revision.md).

- **The revision (ADR-0571 D4).** `RealBuildArgs` gains `testRevision?: TestRevision | undefined`.
  `buildNodeReal` assigns it UNCONDITIONALLY to `resolveOptions.testRevision`, either inside the
  `resolveOptions` literal or as a bare assignment after it, never behind the
  `if (args.x !== undefined)` guard its neighbours use. Assigning `undefined` is harmless, and such a
  guard would add a conditional whose always-true mutant changes nothing observable: a mutant no test
  can kill.
- **The record (ADR-0571 D2).** `RealBuildArgs` gains `escalationsDir?: string | undefined`. Right
  after `proveUnit` returns, and before `if (!result.ok) return out;`, `buildNodeReal` calls
  `writeRevisionRecord(args.escalationsDir, spec.id, runId, result)`. `RealBuildResult` gains
  `revisionWrite?: RevisionWrite`, which carries that call's result when it is non-null; otherwise the
  key is absent. The write happens where the walk ends, so both surfaces that share this lifecycle
  reach it, and only a caller that supplies a directory records anything.
- **The chain writes nothing.** `packages/drive/src/story-build.ts` and
  `packages/cli/src/gate-build-driver.ts` pass neither field and are unchanged, because a chain
  renders no escalation and a record it wrote would be one nobody was told about (ADR-0571 D2). They
  are outside this contract's write scope.
- **Unchanged.** The claim, the backstop, promotion, usage and scope accounting, and every existing
  `RealBuildResult` key.
- **The mutation rung scores these lines.** `check:mutation-diff` mutates every expression on the
  lines a branch adds to `node-build.ts`, and counts a mutant killed only by that branch's own new or
  changed tests. So the test reads the key's absence (`in`), not only an `undefined` value: a guard
  that assigned `null` would otherwise read the same.
- **The red is an assertion red.** The node declares `editsExisting`. The test imports
  `./node-build.js` as a namespace (`import * as NodeBuildModule`), never by name, so that nothing new
  on the module can turn the red into a failure to link (ADR-0057 C). Everything the test takes from
  `./node-build.js` is reached through that namespace. That includes the existing `buildNodeReal` and
  `renderLeafPhasePrompts`, not only `writeRevisionRecord`, `readTestRevision` and
  `revisionRecordPath`. At HEAD `buildNodeReal` ignores both new fields, so each step fails on what it
  asserts. The list below names only the test's imports from other modules:
  - `createBuildWorktree`, `findNodeSpecFile`, `loadNodeSpec`, `resolveBuildConfig`,
    `resolveSignerFromEnv`, `proveUnit` and `ShellTestExecutor` from `@storytree/orchestrator`;
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `parseAuthoringEscalation` from `@storytree/agent`;
  - `fixtureRepo` and `fixtureStories` from `./real-chain-fixture.js`.

**Declared, not observed by this test.**

- That `story-build.ts` and `gate-build-driver.ts` pass neither field is confirmed by reading.
- The IMPLEMENT brief's independence from the revision is observed by contract
  `real-brief-carries-test-revision`, not here.

## Contracts (1)

1. **`build-node-real-threads-the-revision-and-records-the-escalation`** — the single-node REAL lifecycle hands a supplied revision to the AUTHOR_TEST brief and records a returned escalation where its caller asked.
   - **asserts —** over a real fixture worktree and a recording author, `buildNodeReal` given `testRevision` hands the AUTHOR_TEST leaf a prompt carrying the revision's run id, statement and assertion, and without it hands a prompt carrying none of them. Given `escalationsDir`, a walk whose AUTHOR_TEST escalation the gate returned yields `revisionWrite` deep-equal to `{ written: true, path }` at `revisionRecordPath(escalationsDir, unitId, runId)`, and the record reads back with an escalation deep-equal to the result's. A result carries no `revisionWrite` key when no directory was supplied, when the failure carried no escalation, or when the walk only recorded an authoring error, and no file is written.
   - **covers —** `buildNodeReal`, `RealBuildArgs.testRevision`, `RealBuildArgs.escalationsDir` and `RealBuildResult.revisionWrite` (`packages/drive/src/node-build.ts`).
   - **proven by —** a new `packages/drive/src/build-node-real-revision.test.ts`, over `real-chain-fixture.ts` worktrees and a recording author, through the declared focused bun REAL proof; the `@storytree/drive` typecheck and package suite remain pre-signature backstops.
