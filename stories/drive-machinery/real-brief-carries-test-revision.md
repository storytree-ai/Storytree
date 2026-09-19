---
id: "real-brief-carries-test-revision"
tier: contract
story: drive-machinery
capability: prove-spec-resolution
arc: inner-loop-exit-arc
title: "Brief a revising test author with the escalation it revises against"
outcome: "A REAL build handed a test revision briefs its AUTHOR_TEST leaf with the prior run's escalation and the spine's observation behind it, and leaves the IMPLEMENT brief and every unrevised brief unchanged."
status: proposed
proof_mode: contract-test
depends_on: [gate-routes-authoring-escalation]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/resolve-prove-spec.revision.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts", "packages/orchestrator/src/index.ts"]
  real:
    testFile: "packages/orchestrator/src/resolve-prove-spec.revision.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/resolve-prove-spec.revision.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts", "packages/orchestrator/src/index.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: node
      args:
        - "--import"
        - "./scripts/tsx-cache-off.mjs"
        - "--import"
        - "./packages/orchestrator/node_modules/tsx/dist/loader.mjs"
        - "--test"
        - "packages/orchestrator/src/resolve-prove-spec.revision.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Brief a revising test author with the escalation it revises against

**Outcome —** A REAL build handed a test revision briefs its AUTHOR_TEST leaf with the prior run's
escalation and the spine's observation behind it, and leaves the IMPLEMENT brief and every unrevised
brief unchanged.

## Proof walkthrough

The test uses the production `realPrompts` and `resolveProveSpec`, a real spec loaded from disk, and
revisions it constructs itself.

**The revision is constructed plain data**, typed as `TestRevision`. It is the renderer's input, and
this contract reads nothing from disk: reading a revision back from a failed build's record is
contract [`revision-record-round-trip`](revision-record-round-trip.md)'s job. Hand-built escalation
records are the right setup here, because the unit renders data it is handed. The test needs no
`proveUnit` walk, no shell child and no scripted author, and none is expected.

**The spec and the arms.** Load `stories/notice-board/tree-view.md` with `loadNodeSpec`; the existing
resolver tests load the same spec for real-mode resolution. Build its three REAL arms — net-new,
`editsExisting` and `refactorForTests` — as `RealProofConfig` literals, exactly as the existing test
`briefs-name-the-declared-contract-ids — ALL THREE realPrompts arms carry them (net-new,
editsExisting, refactorForTests)` in `resolve-prove-spec.test.ts` builds them.

Each case calls `realPrompts` twice with identical arguments, once without a revision and once with
one. The **remainder** is what the with-revision AUTHOR_TEST brief holds after its leading
without-revision brief.

1. **An IMPLEMENT revision.** Use a revision whose escalation was raised at IMPLEMENT
   (`unsatisfiable-test`). Its `failedObservation` carries a distinctive exit code and single-line
   stdout and stderr markers that appear nowhere else in the fixture. For each arm, under both the
   `claude` and `codex` runtimes, read:
   - a with-revision AUTHOR_TEST brief that starts, byte for byte, with the without-revision one;
   - a remainder containing `revised-test`, `ADR-0563`, the prior run id, `IMPLEMENT`,
     `unsatisfiable-test`, the test id, the statement, the assertion, the exit code, both stream
     markers and `CONFIRM_GREEN`;
   - two equal IMPLEMENT briefs.
2. **An IMPLEMENT revision with no observation.** The same revision without `failedObservation` still
   renders: its remainder contains the prior run id, the statement and the assertion, and neither
   stream marker.
3. **An AUTHOR_TEST revision.** Use a revision whose escalation was raised at AUTHOR_TEST
   (`untestable-contract`), whose `escalation.observation` carries its own single-line stream markers.
   Read a remainder that contains `AUTHOR_TEST`, `untestable-contract`, the statement and both of that
   observation's markers, and contains neither `CONFIRM_GREEN` nor `CONFIRM_RED`. The two IMPLEMENT
   briefs are equal.
4. **Truncation.** Use a `failedObservation` whose stdout is 20,000 characters, opening on a unique
   head sentinel and closing on a unique tail, and whose stderr is exactly 8,000 characters. Read a
   remainder that contains the stdout's last 8,000 characters exactly, lacks the head sentinel, and
   contains `12000`, and that contains the whole stderr.
5. **Threading.** Call `resolveProveSpec(spec, { mode: "real", workspace: <a temp dir>, store: new
   InMemoryStore(), runId, signerInputs: { flag }, authorOverride, testRevision })`. Here
   `authorOverride` is an author whose `author()` throws if called, and the call's own `runId` differs
   from the revision's. Read a `resolved.spec.prompts.authorTest` containing the revision's statement
   and run id, and a `resolved.spec.prompts.implement` containing neither. The same call without
   `testRevision` returns two briefs, neither containing the statement.

The observable is the returned brief text. The test file is NEW:
`packages/orchestrator/src/resolve-prove-spec.revision.test.ts`. The existing
`resolve-prove-spec.test.ts` and `packages/cli/src/codex-leaf-prompt.test.ts` are not in this
contract's write scope.

**As built (signed PASS on the first attempt, run `real-mu1xkwj2`, merged at `6e37de06`).** The
signed test differs from the walkthrough above in these ways, and each difference is a declared gap:

- **The spec.** It loads `stories/drive-machinery/verdict-line.md`, not `tree-view.md`, and builds the
  same three arms as literals.
- **Step 1.** The loop over the three arms and both runtimes uses an AUTHOR_TEST-kind revision with
  no observation. It checks:
  - the prefix and the equal IMPLEMENT briefs;
  - that the plain brief carries no `ADR-0563`;
  - a remainder carrying `ADR-0563`, `revised-test`, the prior run id, the test id and the statement.
- **The IMPLEMENT-kind facts** (the assertion, both stream markers and `CONFIRM_GREEN`) are checked for
  the net-new arm under `claude` only. That case asserts neither its exit code nor `unsatisfiable-test`.
- **Kind and phase literals.** No test asserts a kind literal (`untestable-contract` or
  `unsatisfiable-test`) or a phase literal. The built section describes an AUTHOR_TEST escalation's
  phase as "test-authoring" and never spells the literal `AUTHOR_TEST`, so step 3's `AUTHOR_TEST`
  containment is not met. The leaf chose that wording because its truncation test plants 12,000
  capital `H`s and asserts that no `H` survives in the remainder.
- **Step 2 has no case.** An AUTHOR_TEST-kind revision with no observation stands in. It still appends
  a section, names no CONFIRM phase, and carries no other case's markers or exit code. Nothing asserts
  the wording that says no observation is attached.
- **The AUTHOR_TEST-kind observation case** (net-new, `claude`) checks both stream markers, the exit
  code `137`, and that neither `CONFIRM_RED` nor `CONFIRM_GREEN` appears.
- **Step 4 has no exactly-8,000-character stream.** Its stdout is 12,000 `H`s then 8,000 `T`s, with
  an empty stderr. The test checks for the `T` run, the absence of any `H`, and `12000`. A short
  three-line stream, appearing whole and verbatim in the brief, stands in for "appears whole".
- **Step 5** calls `resolveProveSpec` with `runtime: "claude"` and no `authorOverride`, so it
  constructs a `ClaudeAgentAuthor` and never invokes it. It compares the resolutions with and without
  the revision: the prefix, the equal IMPLEMENT briefs, and the run id, test id and statement in the
  remainder.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

Only `packages/orchestrator/src/resolve-prove-spec.ts` changes, plus one type export in
`packages/orchestrator/src/index.ts`.

- **The revision type (ADR-0571 D4).** `resolve-prove-spec.ts` exports
  `type TestRevision = { unitId: string; runId: string; escalation: EscalationRecord; failedObservation?: NonNullable<TestObservation["originalProcessResult"]> }`.
  `EscalationRecord` is the record contract `gate-routes-authoring-escalation` put on `ProveResult`.
  `index.ts` adds `TestRevision` to the type exports it already re-exports from
  `./resolve-prove-spec.js`, because the drive consumes the type by package name.
- **The seam.** `realPrompts(spec, real, proofDisplay, runtime = "claude", revision?: TestRevision)`
  gains an optional fifth parameter. `RealResolveOptions` gains
  `testRevision?: TestRevision | undefined`, which `resolveReal` passes to its `realPrompts` call.
  Every existing three- and four-argument call compiles unchanged and returns what it returns today.
- **The revision section (ADR-0571 D4).** When a revision is present, the AUTHOR_TEST brief gains a
  section appended after everything the brief says today. This holds in all three REAL arms (net-new,
  `editsExisting`, `refactorForTests`) and for every runtime, so the brief without a revision is always
  the exact prefix. The section states:
  - that this is an ADR-0563 D6 test revision, consuming one D4 attempt of kind `revised-test`;
  - the prior run id, the raising phase and its kind (`untestable-contract` or
    `unsatisfiable-test`), and the test id;
  - the statement verbatim, and for IMPLEMENT the assertion verbatim;
  - the spine's observation behind the escalation, with exit code, stdout and stderr. For an
    IMPLEMENT revision it is `failedObservation`, labelled as the CONFIRM_GREEN run of the test the
    implementer disowned. For an AUTHOR_TEST revision it is `escalation.observation`, labelled as the
    single observation the spine took that is not a CONFIRM run; that section names neither
    `CONFIRM_RED` nor `CONFIRM_GREEN` anywhere. When the revision carries no such observation, the
    section says so;
  - that nothing from the failed run is in this worktree, so the test is authored afresh, and that
    the outcome and contracts above are unchanged.
- **The stream bound (ADR-0571 D4).** Each stream is tail-kept at 8,000 characters, the bound
  `formatFeedbackOutput` in `packages/agent/src/sdk-author.ts` applies to the Claude leaf's feedback
  output. A longer stream keeps its last 8,000 characters, and the cut names the omitted count in plain
  digits (`12000` for a 20,000-character stream). A stream of at most 8,000 characters appears whole.
  Streams appear verbatim rather than re-indented line by line, so a kept tail is a contiguous run of
  the brief.
- **The section as built.** `testRevisionSection` in `resolve-prove-spec.ts` renders the section after
  a `---` rule, in this order:
  - the sentence naming the ADR-0563 D6 test revision and its one D4 attempt of kind `revised-test`;
  - a "Prior run" line naming the run id, then "raised during the <phase> phase" with the kind in
    parentheses, then the test id. The phase is `IMPLEMENT`, or "test-authoring" for an AUTHOR_TEST
    escalation; the enum literal is never spelled out;
  - "Statement, verbatim:" and, for IMPLEMENT, "Assertion, verbatim:", each followed by its text;
  - the observation, under one of two labels: "The CONFIRM_GREEN run of the test the implementer
    disowned", or "The single observation the spine took before ending that walk, which is not a
    CONFIRM run,". The label is followed by "exited <code>:" and the streams under `--- stdout ---`
    and `--- stderr ---`. An empty stream reads `(empty)`, and a null exit code reads `null`. With no
    observation, the block reads "No observation is attached to this revision.";
  - the closing sentence: nothing from that failed run is present in this worktree, the test is
    authored afresh, and the outcome and contracts above are unchanged.

  A cut stream opens with `(kept the last 8000 characters; <N> omitted)` on its own line, before the
  kept tail. The 8,000 bound is a constant local to `resolve-prove-spec.ts`, not an import.
- **The IMPLEMENT brief is untouched (ADR-0571 D4).** It is byte-identical with or without a
  revision, because the implementer of a revised test still satisfies it on its own terms (ADR-0563
  D6). With no revision, both briefs are byte-identical to today's.
- **Facts, not phrasing.** The test compares the prefix byte for byte and checks the remainder by
  containment. The connecting words are the implementer's to choose; a test that pinned one phrasing
  would refuse an implementation that states the same facts.
- **The red is an assertion red.** The node declares `editsExisting` and its focused proof is
  observed per test, so CONFIRM_RED refuses unless every new test's red is an assertion (ADR-0573
  C5). The test imports only what
  the package exports today:
  - `realPrompts`, `realProofCommand` and `resolveProveSpec` from `./resolve-prove-spec.js`, and
    `loadNodeSpec` from `./node-spec.js`;
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - `TestRevision`, `EscalationRecord` and `RealProofConfig` through `import type` only, which the tsx
    loader erases.

  At HEAD `realPrompts` ignores a fifth argument, so every revision assertion fails on the brief's
  content, never on a missing symbol.

Unchanged: the dry-run and live-smoke briefs, `assemblePrompts`, `liveSmokePrompts`, every other
`resolveReal` input, and every call that passes no revision.

**Declared, not observed by this test.** The as-built paragraph under `## Proof walkthrough` names
what the signed test checks in place of each step. Beyond that:

- The `index.ts` type export. The drive contracts consume it by package name, and the package
  typecheck backstop compiles it.
- The wording that says no observation is attached, that nothing from the failed run is present, and
  that the outcome and contracts are unchanged. These are confirmed by reading.
- Byte-identity with today's briefs when no revision is passed. The unchanged
  `resolve-prove-spec.test.ts` holds it through the orchestrator package suite, which the landing gate
  runs (ADR-0580 D2 took it out of the build). The new test checks
  only that a plain brief carries no `ADR-0563`.
- Six further clauses are confirmed in `testRevisionSection` by reading, not by the test:
  - either kind literal;
  - the phase label;
  - an IMPLEMENT observation's exit code;
  - an IMPLEMENT revision with no observation;
  - the `codex` runtime outside the prefix loop;
  - a stream of exactly 8,000 characters.

No mutation rung reaches `packages/orchestrator` (ADR-0563 D3), so these remain declared gaps rather
than scored ones.

## Contracts (1)

1. **`test-revision-reaches-only-the-author-test-brief`** — a test revision handed to a REAL build reaches the AUTHOR_TEST brief, after everything that brief says today, and no other brief.
   - **asserts —** given a `TestRevision`, `realPrompts` returns, for all three REAL arms under both the `claude` and `codex` runtimes, an AUTHOR_TEST brief that begins byte for byte with the brief returned without one. The brief continues with `revised-test`, `ADR-0563`, the prior run id, the raising phase (`IMPLEMENT`, or test-authoring for AUTHOR_TEST) and its kind, the test id and the statement, plus the assertion verbatim for IMPLEMENT. An IMPLEMENT revision's remainder carries its `failedObservation` exit code, stdout and stderr with `CONFIRM_GREEN`. An AUTHOR_TEST revision's remainder carries `escalation.observation` and names neither `CONFIRM_GREEN` nor `CONFIRM_RED`. A revision with no observation still renders. A stream over 8,000 characters keeps exactly its last 8,000 and names the omitted count, and a stream of 8,000 appears whole. The IMPLEMENT brief is byte-identical with or without the revision. In real mode, `resolveProveSpec` threads `testRevision` into `spec.prompts.authorTest` and not into `spec.prompts.implement`.
   - **covers —** `realPrompts`, `RealResolveOptions.testRevision` and its pass-through in `resolveReal` (`packages/orchestrator/src/resolve-prove-spec.ts`), and the `TestRevision` type export through `packages/orchestrator/src/index.ts`.
   - **proven by —** `packages/orchestrator/src/resolve-prove-spec.revision.test.ts`, over constructed revisions and `stories/drive-machinery/verdict-line.md`, through the declared focused REAL proof, signed PASS on the first attempt (run `real-mu1xkwj2`); the full orchestrator package suite and typecheck were pre-signature backstops. Not exercised by that proof: either kind literal or the phase label, an IMPLEMENT observation's exit code, an IMPLEMENT revision with no observation, the IMPLEMENT-kind facts outside the net-new arm under `claude`, and a stream of exactly 8,000 characters. No mutation rung reaches `packages/orchestrator` (ADR-0563 D3).
