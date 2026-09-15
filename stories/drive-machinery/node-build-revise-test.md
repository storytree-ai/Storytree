---
id: "node-build-revise-test"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Take a test revision on node build and name the record a failed build leaves"
outcome: "`node build --real` reads the named run's revision record before any spend, refuses a missing or foreign one, passes it to the REAL lifecycle, and names the record a failed build leaves together with the command that revises against it."
status: proposed
proof_mode: contract-test
depends_on: [build-node-real-threads-revision]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/node-build-revise-test.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/node-build-revise-test.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/node-build-revise-test.test.ts"]
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
        - "./packages/drive/src/node-build-revise-test.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Take a test revision on node build and name the record a failed build leaves

**Outcome —** `node build --real` reads the named run's revision record before any spend, refuses a
missing or foreign one, passes it to the REAL lifecycle, and names the record a failed build leaves
together with the command that revises against it.

## Proof walkthrough

**The build is the production `nodeBuild`**, driven offline up to the first leg that would spend. It
runs over `fixtureRepo(false)` and `fixtureStories([{ id: "cap-a", dependsOn: [] }])` from
`packages/drive/src/real-chain-fixture.ts`, with:

- `actor` set to a fixed email;
- `corpusStore`: an `InMemoryStore` loaded by `loadFixtureCorpus` (`@storytree/library/fixture`);
- a recording `ensureDb` that counts its calls, notes which recorded stage is open at each call, and
  returns `{ ok: false, reason: <a unique marker> }`;
- a recording `progress`:
  - its `stage(name, work)` records `name`, holds it as the open stage while `work` runs, and returns
    `work`'s result;
  - its `note` does nothing;
- `escalationsDir`: a fresh temp directory.

**No offline test reaches the REAL worktree arm.** `NodeBuildOpts` has no author seam, on purpose
(ADR-0243 D4), so every walk below ends before a claim, a worktree or a leaf.

**The records are production output.** Each is written by `writeRevisionRecord` from a real
`proveUnit` escalation walk over a `ShellTestExecutor` child command, as
`node-build-revision-record.test.ts` does.

1. **The flag needs `--real`.** `nodeBuild("any-id", { dryRun: true, reviseTest: "r1", actor,
   progress })` returns `ok: false`, with a body naming `--revise-test` and `--real`. No stage is
   recorded.
2. **A missing record is refused before any spend.**
   `nodeBuild("cap-a", { dryRun: false, real: true, runtime: "claude", reviseTest: "no-such-run", escalationsDir, storiesDir, repoRoot, actor, corpusStore, ensureDb, progress })`,
   with an empty `escalationsDir`, returns `ok: false`. Its body contains
   `revisionRecordPath(escalationsDir, "cap-a", "no-such-run")` and its `next` is `[]`. `ensureDb` is
   never called and no stage is recorded.
3. **A foreign record is refused before any spend.** Another unit's record is copied to `cap-a`'s
   path under the same run id, and requested by that run id. It is refused, with:
   - `ok: false` and an empty `next`;
   - a body naming both unit ids;
   - `ensureDb` never called, and no stage recorded.
4. **A valid record passes the read.** With a `cap-a` record in `escalationsDir`, requested by its
   own run id, the same call gets past the read. It then records TWO stages, in this order:
   - the leaf-prompt render, whose name begins `library agent prompts`;
   - the DB preflight, whose name begins `live-store preflight`.

   `ensureDb` is called exactly once, inside the second stage: the recorder notes which stage is open
   when it is called. The body contains the marker.
5. **The renderers.**
   - `renderRevisingLine(undefined)` returns `[]`.
   - `renderRevisingLine(revision)` returns exactly one line, containing the revision's run id, its
     raising phase, its test id, `ADR-0563` and `revised-test`.
   - `renderRevisionRecord("cap-a", "run-x", "claude", undefined)` returns `[]`.
   - With `{ written: true, path }`, it returns one line beginning `revision:` that contains the path
     and `storytree node build cap-a --real --runtime claude --revise-test run-x`.
   - With `{ written: false, path, reason }`, it returns one line containing the path and the reason,
     and no `storytree node build`.

The observable is the returned `Envelope`, the `ensureDb` call count, the recorded stage names, and
the renderers' returned lines. The test file is NEW:
`packages/drive/src/node-build-revise-test.test.ts`. The existing `packages/cli/src/node-build.test.ts`
is not in this contract's write scope.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

Only `nodeBuild`, `NodeBuildOpts` and two new renderers in `packages/drive/src/node-build.ts` change.

- **The options.** `NodeBuildOpts` gains two fields:
  - `reviseTest?: string | undefined`, the run id whose record the re-run's test author revises
    against. It is a literal run id, never `@path` content, so the orchestrator names which
    escalation and never handles its text (ADR-0571 D3).
  - `escalationsDir?: string | undefined`, a test seam. Production omits it and gets the default.
- **The mode check (ADR-0571 D3).** A `reviseTest` without `real` is refused beside the existing
  `--runtime` mode checks, before the signer resolves or the spec loads. The body names
  `--revise-test` and `--real`.
- **The read, before any spend (ADR-0571 D3).** It runs after the REAL prechecks and the
  `dbProofEnv` and add-deps resolution, and before the leaf-prompt rendering, the DB preflight, the
  claim and the worktree:

  ```ts
  const escalationsDir = resolveEscalationsDir(opts.escalationsDir);
  const revisionRead = await readTestRevision(escalationsDir, spec.id, opts.reviseTest);
  if (!revisionRead.ok) return { ok: false, body: revisionRead.reason, next: [] };
  const testRevision = revisionRead.revision;
  ```

  No mode guard is needed: without `real`, `reviseTest` was already refused, and
  `readTestRevision(…, undefined)` returns no revision without touching the filesystem.
- **The pass-through (REAL arm).** `realArgs` gains the shorthand fields `testRevision` and
  `escalationsDir`. `let revisionWrite: RevisionWrite | undefined;` is declared beside
  `let promotion`, and `revisionWrite = built.revisionWrite;` is assigned beside
  `promotion = built.promotion;`.
- **The renderers.** Both are exported and pure.
  - `renderRevisingLine(revision: TestRevision | undefined): string[]` returns `[]`, or one line naming
    the prior run id, the raising phase and the test id, and saying this build is an ADR-0563 D6 test
    revision: one D4 attempt, `revised-test`.
  - `renderRevisionRecord(unitId, runId, runtime: LiveRuntime, write: RevisionWrite | undefined): string[]`
    returns `[]` when there is no write. A written record gives one `revision:` line naming the path
    and the command `storytree node build <unitId> --real --runtime <runtime> --revise-test <runId>`.
    The command carries the runtime the failed build ran, so running it as printed does not switch
    leaves (ADR-0571 D3). An unwritten record gives one line naming the path and the reason, and saying
    the escalation block above must be relayed by hand. It names no command.
- **The call sites (ADR-0571 D2, extending ADR-0569 D5).** The header spreads
  `...renderRevisingLine(testRevision)` directly after its `runtime:` line. The failure body spreads
  `...renderRevisionRecord(spec.id, runId, runtime, revisionWrite)` directly after
  `...renderEscalation(spec.id, runId, result)` and before `...renderFailedConfirmObservation(…)`. The
  pass body gains nothing: a pass writes no record.
- ⚠ **Every line this contract adds on the REAL worktree arm carries NO mutable expression.** No
  offline test can reach that arm, because `NodeBuildOpts` has no author seam (ADR-0243 D4). And
  `check:mutation-diff` reds on any mutant in a changed line that no test of the branch kills. So each
  such line holds only identifiers, member access, calls and spreads. That covers the two `realArgs`
  fields, the `revisionWrite` declaration and assignment, and both spreads. None of these lines may
  hold a `??`, `&&`, `||`, ternary, comparison, string or template literal, or object or array
  literal. Defaults and conditionals belong inside the tested functions, which is why
  `resolveEscalationsDir` exists and why `renderRevisionRecord` takes an absent write rather than
  being called behind a check.
- **The mutation rung scores the reachable lines too.** The mode refusal, the read block and both
  renderers are reached by this contract's test, so each literal in them must be killed by it. The
  test therefore pins each renderer's lines and each refusal envelope's `ok` and `next` exactly, not
  only by containment of the values they interpolate. `node-build-escalation-envelope.test.ts` pins its
  lines the same way.
- **The red is an assertion red.** The node declares `editsExisting`. The test imports
  `./node-build.js` as a namespace (`import * as NodeBuildModule`), never by name: the renderers are
  new to the module, and a named import of an export the module lacks fails to link, which is a
  structural red of the wrong kind (ADR-0057 C). Everything the test takes from `./node-build.js` is
  reached through that namespace. That includes the existing `nodeBuild`, not only the new
  `writeRevisionRecord`, `revisionRecordPath`, `renderRevisingLine` and `renderRevisionRecord`. At
  HEAD `nodeBuild` ignores `reviseTest`, so steps 1–3 run on past where they should stop and fail on
  what they assert. The list below names only the test's imports from other modules:
  - `proveUnit` and `ShellTestExecutor` from `@storytree/orchestrator`;
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `loadFixtureCorpus` from `@storytree/library/fixture`;
  - `parseAuthoringEscalation` from `@storytree/agent`;
  - `fixtureRepo` and `fixtureStories` from `./real-chain-fixture.js`.
- **Outside this contract.** `story build` stays as it is, and so do the CLI's argument table and
  help text in `packages/cli/src/commands.ts` and the gate build driver.

**Declared, not observed by this test.** The REAL arm's pass-through is confirmed by reading and is
not observed: the two `realArgs` fields, the `revisionWrite` declaration and copy, and the two spread
call sites.

## Contracts (1)

1. **`node-build-takes-a-revision-and-names-the-record-it-leaves`** — node build reads a named revision record before any spend, refuses a bad one, and names the record a failed build leaves with the command that revises against it.
   - **asserts —** `nodeBuild` given `reviseTest` without `real` refuses with a body naming `--revise-test` and `--real`, before any stage. With `real`, a missing record refuses with a body naming `revisionRecordPath(escalationsDir, unitId, runId)`, and a record for another unit refuses naming both ids, each with an empty `next`, before the leaf prompts render and before `ensureDb` is called. A valid record passes the read and the build reaches the prompt stage and the DB preflight. `renderRevisingLine` returns `[]` without a revision, and one line with its run id, phase, test id, `ADR-0563` and `revised-test` with one. `renderRevisionRecord` returns `[]` without a write. For a written record it returns one `revision:` line with the path and `storytree node build <unitId> --real --runtime <runtime> --revise-test <runId>`. For an unwritten one it returns one line with the path and the reason and no command.
   - **covers —** `nodeBuild`'s `reviseTest` mode check and pre-spend revision read, `NodeBuildOpts.reviseTest` and `NodeBuildOpts.escalationsDir`, `renderRevisingLine`, `renderRevisionRecord`, and their header and failure-envelope call sites (`packages/drive/src/node-build.ts`).
   - **proven by —** a new `packages/drive/src/node-build-revise-test.test.ts`, over `real-chain-fixture.ts` fixtures, an injected `ensureDb` and `progress`, and records written from real `proveUnit` walks, through the declared focused bun REAL proof; the `@storytree/drive` typecheck and package suite remain pre-signature backstops. The REAL worktree arm's pass-through is confirmed by reading.
