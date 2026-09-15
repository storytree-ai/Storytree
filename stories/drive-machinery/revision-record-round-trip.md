---
id: "revision-record-round-trip"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Write and read the revision record a failed build leaves"
outcome: "A failed REAL build's returned escalation round-trips through a per-user revision record, and reading a record back yields the test revision for exactly that unit or a refusal that says why."
status: proposed
proof_mode: contract-test
depends_on: [real-brief-carries-test-revision, node-build-escalation-envelope]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/node-build-revision-record.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/node-build-revision-record.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/node-build-revision-record.test.ts"]
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
        - "./packages/drive/src/node-build-revision-record.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Write and read the revision record a failed build leaves

**Outcome —** A failed REAL build's returned escalation round-trips through a per-user revision
record, and reading a record back yields the test revision for exactly that unit or a refusal that
says why.

## Proof walkthrough

**The results are production output.** Obtain `ProveResult`s from real `proveUnit` walks over a real
`ShellTestExecutor` whose ordinary child commands (`node -e <script>` via `process.execPath`) exit
with scripted codes, under an inline scripted `PhaseAuthor`. Build them exactly as
`node-build-escalation-envelope.test.ts` builds its fixtures. Each escalation the scripted author
returns is built with `parseAuthoringEscalation`, the only admitted route onto the type (ADR-0569 D1),
so its text survives the round trip unchanged. There are four walks:

- an **AUTHOR_TEST escalation** (one spawn);
- an **IMPLEMENT escalation whose child stays red**, carrying `escalation` and `failedObservation`;
- an **overruled IMPLEMENT escalation** (red, then green), carrying `overruledEscalation`;
- a **plain CONFIRM_GREEN refusal** (red, red) with no escalation.

**The malformed records are hand-written JSON.** Constructed data is the right input there, because
no walk produces a malformed record.

**All I/O happens under a fresh temporary directory.** Records are written into
`<tmp>/escalations`, which the test has not created before the first write. The test never writes to
`~/.storytree`.

1. **The paths.**
   - `defaultEscalationsDir()` equals `path.join(os.homedir(), ".storytree", "escalations")`. The
     test reads that value and writes nothing there.
   - `resolveEscalationsDir(undefined)` equals `defaultEscalationsDir()`, and
     `resolveEscalationsDir("/x")` equals `"/x"`.
   - `revisionRecordPath(dir, "unit-a", "run-1")` equals `path.join(dir, "unit-a", "run-1.json")`.
2. **The AUTHOR_TEST record.**
   - `writeRevisionRecord(dir, unitId, runA, result)` returns
     `{ written: true, path: revisionRecordPath(dir, unitId, runA) }`.
   - The file parses as JSON deep-equal to `{ unitId, runId: runA, escalation: result.escalation }`,
     with no `failedObservation` key.
   - `readTestRevision(dir, unitId, runA)` returns `{ ok: true, revision }` with `revision` deep-equal
     to that object.
3. **The IMPLEMENT record.** Write it for the same unit id under a second run id, so it lands beside
   the first.
   - Its JSON adds `failedObservation`, deep-equal to `result.failedObservation`.
   - It reads back deep-equal.
4. **Nothing written.**
   - For the overruled walk and the plain refusal, `writeRevisionRecord` returns `null`, and a fresh
     directory they are pointed at stays empty.
   - `writeRevisionRecord(undefined, …)` on the IMPLEMENT escalation's result also returns `null`.
5. **No run requested.** `readTestRevision(<an empty directory>, unitId, undefined)` returns
   `{ ok: true, revision: undefined }`.
6. **A run id that is not a single path segment is refused before the filesystem is touched.** The
   cases are `"../x"`, `"a/b"`, `"a\\b"` (one backslash), `".."` and `""`.
   - For each, first plant a copy of the step-2 record at `revisionRecordPath(dir, unitId, <that id>)`,
     creating its parent directory, with its stored `runId` set to that id.
   - `readTestRevision(dir, unitId, <that id>)` still returns `ok: false`, with a reason naming the
     run id.

   The planted file is what makes each case discriminating: a read that skipped the guard would find a
   valid record at the joined path and return it.
7. **Refusals.** Each of these reads returns `ok: false` with a reason, and none throws:
   - a missing run, whose reason contains `revisionRecordPath(dir, unitId, "no-such-run")`;
   - unit A's record copied to unit B's path under the same run id and read as unit B, whose reason
     names both unit ids;
   - a valid record copied under another run's filename, `revisionRecordPath(dir, unitId, runB)`, and
     read as `runB`, whose reason names both run ids;
   - these hand-written records at a unit's path:
     - invalid JSON;
     - a JSON `null`;
     - a blank `runId`;
     - a blank `escalation.testId`;
     - a declared phase of `GATE`;
     - an IMPLEMENT escalation without an assertion;
     - an IMPLEMENT escalation whose `raised.kind` is `untestable-contract`;
     - an IMPLEMENT record whose escalation carries an `observation`;
     - an AUTHOR_TEST record carrying `failedObservation`;
     - an AUTHOR_TEST observation whose `exitCode` is a string;
     - an IMPLEMENT `failedObservation` with no `stderr`.
8. **A write that cannot land.** With `dir` naming a regular FILE, `writeRevisionRecord` returns
   `{ written: false, path, reason }` without throwing. The `path` is `revisionRecordPath` under that
   file, and the reason is non-empty.

The observable is each function's return value and the files on disk. The test file is NEW:
`packages/drive/src/node-build-revision-record.test.ts`. The existing
`node-build-escalation-envelope.test.ts` and `node-build-refusal-observation.test.ts` are not in this
contract's write scope.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

The drive stores and reads a record here. It decides nothing about attempts: nothing counts them,
and nothing checks the D4 decision point (ADR-0571 D5).

- **The functions.** `packages/drive/src/node-build.ts` exports:
  - `defaultEscalationsDir(): string`, which returns
    `path.join(os.homedir(), ".storytree", "escalations")`, the house per-user state directory
    (ADR-0571 D2);
  - `resolveEscalationsDir(dir: string | undefined): string`, which returns `dir`, or the default when
    `dir` is undefined;
  - `revisionRecordPath(dir, unitId, runId)`, which returns `path.join(dir, unitId, runId + ".json")`;
  - `type RevisionWrite = { written: true; path: string } | { written: false; path: string; reason: string }`;
  - `writeRevisionRecord(dir: string | undefined, unitId, runId, result: ProveResult): Promise<RevisionWrite | null>`;
  - `parseTestRevision(input: unknown, unitId: string)`, which returns
    `{ ok: true; revision: TestRevision } | { ok: false; reason: string }`;
  - `readTestRevision(dir: string, unitId, runId: string | undefined)`, which returns
    `{ ok: true; revision: TestRevision | undefined } | { ok: false; reason: string }`.

  `TestRevision` is the type contract `real-brief-carries-test-revision` exports from
  `@storytree/orchestrator`.
- **Only a returned escalation is written (ADR-0571 D2).** `writeRevisionRecord` returns `null` when
  `dir` is undefined, or when the result is not `ok: false` with a returned `escalation`. An
  `overruledEscalation` and a result carrying neither key count as not returned. Returning `null`
  writes nothing and creates no directory.
- **The record.** JSON holding `{ unitId, runId, escalation, failedObservation? }`, serialized straight
  from the result. The `failedObservation` key is present only when the result carries one. The write
  creates the unit directory, and any missing parent with it.
- **A write failure never fails the build (ADR-0571 D2).** `writeRevisionRecord` never throws. A
  filesystem failure returns `{ written: false, path, reason }`.
- **The parse refuses what the gate never produces (ADR-0571 D3; ADR-0569 D3/D4).**
  `parseTestRevision` refuses:
  - a non-object;
  - a `unitId` other than the expected one, with a reason naming both ids;
  - a blank or non-string `runId`, or a blank `escalation.testId`;
  - a declared phase other than `AUTHOR_TEST` or `IMPLEMENT`;
  - a raised escalation that `parseAuthoringEscalation(phase, raised)` from `@storytree/agent`
    refuses;
  - a `raised.kind` other than the kind that phase produces;
  - an IMPLEMENT record carrying `escalation.observation`, or an AUTHOR_TEST record carrying
    `failedObservation`;
  - any observation that is not `{ stdout: string; stderr: string; exitCode: number | null }`.

  It rebuilds the escalation through `parseAuthoringEscalation` rather than trusting the stored one.
- **The read (ADR-0571 D3).** `readTestRevision` handles its inputs in this order:
  - An undefined `runId` returns `{ ok: true, revision: undefined }` without touching the filesystem.
  - A `runId` that is not a single path segment is refused before the filesystem is touched, with a
    reason naming the run id. That covers a blank id, one containing `/` or `\`, and one that is
    exactly `.` or `..`. This guard is why the flag can only ever name a record, never an arbitrary
    file.
  - A missing file is refused with the path it looked at named, and so is invalid JSON.
  - A parse refusal is passed through.
  - A record whose stored `runId` is not the run id asked for, as with a copied or renamed file, is
    refused with a reason naming both run ids.
- **Out of scope.** No caller changes here. `buildNodeReal`, `nodeBuild`, `story-build.ts` and the
  envelope renderers are untouched: the call sites belong to contracts
  [`build-node-real-threads-revision`](build-node-real-threads-revision.md) and
  [`node-build-revise-test`](node-build-revise-test.md).
- **The mutation rung scores these lines.** `check:mutation-diff` mutates every expression on the
  lines a branch adds to `node-build.ts`, string and template literals included, and counts a mutant
  killed only by that branch's own new or changed tests. So pin each reason exactly where its text is
  the function's own, and by its fixed part where it quotes a filesystem or JSON error.
  `node-build-escalation-envelope.test.ts` pins its lines the same way. A test that reads only
  `ok: false` leaves every reason literal a surviving mutant that reds the gate after the signature.
- **The red is an assertion red.** The node declares `editsExisting`. The test imports
  `./node-build.js` as a namespace (`import * as NodeBuildModule`), never by name: these functions are
  new to the module, and a named import of an export the module lacks fails to link, which is a
  structural red of the wrong kind (ADR-0057 C). The first assertion is that each function is
  published. The test's other imports exist today:
  - `proveUnit` and `ShellTestExecutor` from `@storytree/orchestrator`;
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `parseAuthoringEscalation` from `@storytree/agent`;
  - types through `import type`.

**Declared, not observed by this test.** That `readTestRevision` touches no file when `runId` is
undefined is confirmed by reading. The test observes only that it refuses nothing there.

## Contracts (1)

1. **`a-returned-escalation-round-trips-through-its-revision-record`** — a failed build's returned escalation is written to a per-user record keyed by unit and run, and reading that record back yields its test revision or a refusal that says why.
   - **asserts —** over results from real `proveUnit` walks, `writeRevisionRecord` writes `{ unitId, runId, escalation }` for an AUTHOR_TEST escalation, and adds `failedObservation` for an IMPLEMENT one, at `revisionRecordPath(dir, unitId, runId)` under a directory it creates. `readTestRevision` reads each record back deep-equal. An overruled escalation, a result without an escalation and an undefined directory write nothing and return `null`. `readTestRevision` with no run id returns no revision. Before touching the filesystem, it refuses a run id that is not a single path segment (blank, containing `/` or `\`, or `.` or `..`), naming the run id, even where a valid record sits at the path that id would join to. It refuses, without throwing, a missing run (naming the path), a record for another unit (naming both unit ids), a record stored under another run's filename (naming both run ids), invalid JSON, a non-object, a blank run or test id, an undeclared phase, an escalation `parseAuthoringEscalation` refuses, a kind its phase does not produce, an IMPLEMENT `observation`, an AUTHOR_TEST `failedObservation`, and a malformed observation. A write that cannot land returns `{ written: false, path, reason }` rather than throwing. The default directory is `~/.storytree/escalations`.
   - **covers —** `defaultEscalationsDir`, `resolveEscalationsDir`, `revisionRecordPath`, `writeRevisionRecord`, `parseTestRevision` and `readTestRevision` (`packages/drive/src/node-build.ts`).
   - **proven by —** a new `packages/drive/src/node-build-revision-record.test.ts`, over real `proveUnit` walks and hand-written malformed records, through the declared focused bun REAL proof; the `@storytree/drive` typecheck and package suite remain pre-signature backstops.
