---
id: "confirm-green-refusal-names-standing-escalation"
tier: contract
story: drive-machinery
capability: prove-it-gate
arc: inner-loop-exit-arc
title: "Name the authoring escalation in the refusal reason"
outcome: "A refusal's reason names the authoring escalation the refusal carries or rejects, so a surface that prints only the reason can tell an escalation from an ordinary failure."
status: proposed
proof_mode: contract-test
depends_on: [gate-routes-authoring-escalation]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/prove-it-gate.ts"]
  real:
    testFile: "packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts"
    sourceFile: "packages/orchestrator/src/prove-it-gate.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/prove-it-gate.ts"]
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
        - "packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Name the authoring escalation in the refusal reason

**Outcome —** A refusal's reason names the authoring escalation the refusal carries or rejects, so a
surface that prints only the reason can tell an escalation from an ordinary failure.

## Why the reason

Two of the three surfaces that print a refused walk print only its `reason`. One is `story build`'s
chain summary, whose `HALT` line (`packages/drive/src/story-build.ts`) prints the orchestrator's
`failed closed at <phase>: <reason>` detail. The other is the gate build driver's `verdict: NONE`
line (`packages/cli/src/gate-build-driver.ts`). ADR-0569 D5 renders the whole escalation only in
`node build`'s envelope (contract [`node-build-escalation-envelope`](node-build-escalation-envelope.md)),
and its Consequences say the other two print a reason "which names the escalation".

Before this contract, that reason did not name it. Contract
[`gate-routes-authoring-escalation`](gate-routes-authoring-escalation.md) (signed PASS, run
`real-mu1lv3wm`) refused a standing IMPLEMENT escalation with the plain CONFIRM_GREEN refusal, plus
any oracle or exhaustion note, and refused an AUTHOR_TEST escalation with its kind and the slice's
`error`, but not its `statement`. On those two surfaces an implementer that escalated and was not
overruled reads exactly like an implementation that failed: the undifferentiated failure ADR-0569
exists to end.

This contract changes reasons only. It builds in either order with `node-build-escalation-envelope`,
whose renderer reads the escalation records and no reason.

## Proof walkthrough

Given real `ShellTestExecutor` child commands (never a `RecordingTestExecutor`), an inline scripted
`PhaseAuthor` whose two slices return fixed results, and an `InMemoryStore` signing store, over two
children:

- an **always-red** child: a `nodeEvalExecutor` script that prints one line to stdout and exits 1;
- a **red-then-green** child: a `nodeEvalExecutor` script that exits 1 until a file the scripted
  IMPLEMENT slice writes exists, then exits 0, with a fresh temporary directory per walk.

*(Amended in place by ADR-0580 D1, 2026-09-19: a third, **vetoed** child — an exit-0 script whose
`verifyGreen` veto made every observation a red carrying a note — went with the assert-oracle guard,
and with it step 3's case (b).)*

Steps 1, 3 and 5(b) compare a walk with its **twin**. The twin is the identical walk (same child,
`testId`, `now`, `runId`, signer inputs, tree and slice writes), except for the escalating slice. In
place of a plain escalation, the twin's slice returns `{ ok: true }`; in place of an exhausted one,
it returns the same `{ ok: false, error, exhausted: true }` without the `escalation` key.

1. **A standing IMPLEMENT escalation is named.** AUTHOR_TEST returns `{ ok: true }`, the IMPLEMENT
   slice returns `{ ok: false, error, escalation }` with an IMPLEMENT escalation, and the always-red
   child stays red. Read `failedAt: "CONFIRM_GREEN"`, a `failedObservation` with exit code 1 carrying
   the child's stdout line, `escalation` deep-equal to `{ raised, testId }` with no `observation` key,
   and no signing row. Read a `reason` that begins, byte for byte, with the twin's reason, which is
   exactly `CONFIRM_GREEN requires an observed green (got 'red' for test <testId>)`. The remainder
   of that `reason` contains the kind `unsatisfiable-test` and the escalation's `statement`, verbatim.
2. **The AUTHOR_TEST reason carries the statement.** The AUTHOR_TEST slice returns
   `{ ok: false, error, escalation }` with an AUTHOR_TEST escalation, over the always-red child. Read
   `failedAt: "AUTHOR_TEST"`, the `escalation` record, no signing row, and a `reason` that contains
   the kind `untestable-contract` and the `statement` verbatim; it may also keep `error`. The
   fixture's `error` must not contain its `statement`. At HEAD this reason is
   `leaf escalated at AUTHOR_TEST (<kind>): <error>`, so a fixture whose `error` repeated the
   statement would pass against the unchanged code and prove nothing.
3. **Existing suffixes are kept.** Run step 1's walk once more and read only its `reason`: with the
   IMPLEMENT slice also `exhausted: true`, the twin's reason is the CONFIRM_GREEN refusal followed by
   the raise-the-ceiling note `exhaustionNote` writes today. Read a `reason` that begins, byte for
   byte, with the twin's, and whose remainder contains the kind and the `statement`.
4. **Mismatch reasons name both phases.** An IMPLEMENT escalation returned from the AUTHOR_TEST slice
   refuses at AUTHOR_TEST; an AUTHOR_TEST escalation returned from the IMPLEMENT slice, over the
   always-red child, refuses at IMPLEMENT. Read each `reason` containing both `AUTHOR_TEST` and
   `IMPLEMENT`, and neither result carrying `escalation` or `overruledEscalation`. This already holds
   at HEAD; the test pins it.
5. **Regression.** (a) With no escalation, both slices returning `{ ok: true }` over the always-red
   child, read a `reason` exactly equal to
   `CONFIRM_GREEN requires an observed green (got 'red' for test <testId>)`. (b) An IMPLEMENT
   escalation over the red-then-green child with a dirty tree is overruled and then refused at GATE:
   read `overruledEscalation`, and a `reason` exactly equal to the twin's.

The observable is the `reason` on the discriminated `ProveResult`, beside the result keys and the
signing store. The reason is compared byte for byte with the twin's, and checked by containment for
the kind and the statement. The test file is NEW:
`packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts`. The signed
`prove-it-gate.escalation.test.ts` and `prove-it-gate.test.ts` are not in this contract's write
scope.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

Only the refusal `reason` strings that `proveUnit` builds in
`packages/orchestrator/src/prove-it-gate.ts` change.

- **A standing IMPLEMENT escalation (ADR-0569 D3).** When CONFIRM_GREEN refuses a walk whose
  IMPLEMENT slice escalated, the reason begins with the reason that refusal gives today. That is the
  `nextPhase` refusal, then the observation's note and the raise-the-ceiling note wherever each applies.
  Text naming the escalation's `kind` and quoting its `statement` verbatim follows. The new text goes
  after every existing suffix, not straight after the CONFIRM_GREEN refusal. That order lets a test
  compare the whole existing reason byte for byte without knowing the new words, and it moves nothing
  an existing reader matches.
- **An AUTHOR_TEST escalation (ADR-0569 D4).** Its reason names the `kind` and quotes the `statement`
  verbatim. It may keep the slice's `error`.
- **A mismatched phase (ADR-0569 D1).** Each malformed-escalation reason names the phase of the slice
  that returned it and the phase the escalation declares, as both already do.
- **An overruled escalation adds nothing (ADR-0569 D3).** A walk whose IMPLEMENT escalation was
  overruled and that later refuses at GATE gives exactly the reason its twin gives.
- **The surfaces gain the name through the reason (ADR-0569 D5).** `packages/drive/src/story-build.ts`,
  `packages/cli/src/gate-build-driver.ts` and `packages/drive/src/node-build.ts` are outside this
  contract's write scope and do not change.
- **Facts, not phrasing.** The test compares the prefix with the twin's byte for byte, and checks the
  remainder for the kind and the statement by containment. The connecting words are the
  implementer's to choose. A test that pinned one phrasing would refuse an implementation that names
  the same two facts.
- **The red is an assertion red.** The node declares `editsExisting` and its focused proof is
  observed per test, so CONFIRM_RED refuses unless every new test's red is an assertion (ADR-0573
  C5). The test imports only
  what exists today:
  - `proveUnit`, `nodeEvalExecutor` and `ShellTestExecutor` from this package;
  - `InMemoryStore` from `@storytree/storage-protocol`;
  - types from `@storytree/agent`.

  It reaches assertions in steps 1–3 that fail against the current reasons. Steps 4 and 5 already
  hold at HEAD.

Unchanged: every result key and its value (`failedAt`, `failedObservation`, `escalation`,
`overruledEscalation`, `phasesVisited`), every phase transition, the number of observations, the
signing append, `toEvidence`, and the reason of every walk that carries no escalation. `nextPhase` in
`phase-machine.ts` is outside the write scope, so the CONFIRM_GREEN wording cannot move. An escalation
still never enters `verdict.evidence` (ADR-0569 D2): a pass carries no reason, and a reason is not
evidence.

## Contracts (1)

1. **`standing-escalation-is-named-in-its-refusal-reason`** — a refusal names the authoring escalation it carries or rejects in its reason, after the reason it gives without one.
   - **asserts —** Over real `ShellTestExecutor` children and an inline scripted author, an IMPLEMENT escalation whose child stays red refuses at CONFIRM_GREEN with `failedObservation`, the `{ raised, testId }` record and no signing row, as contract `gate-routes-authoring-escalation` specifies them. Its reason begins byte for byte with the same walk's reason without the escalation, which is exactly `CONFIRM_GREEN requires an observed green (got 'red' for test <testId>)`, and continues with the kind `unsatisfiable-test` and the statement verbatim. When the slice is also exhausted, that prefix also carries the raise-the-ceiling note, and the kind and statement still follow it. An AUTHOR_TEST escalation's reason contains the kind `untestable-contract` and the statement verbatim, from a slice whose `error` does not contain the statement. Each phase-mismatch reason names both the slice's phase and the escalation's declared phase. A walk with no escalation refuses with exactly `CONFIRM_GREEN requires an observed green (got 'red' for test <testId>)`. The dirty-tree GATE refusal after an overruled escalation carries exactly the reason of the same walk without it.
   - **covers —** the refusal reasons `proveUnit` builds on its escalation paths in `packages/orchestrator/src/prove-it-gate.ts`.
   - **proven by —** a new `packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts` over ordinary `ShellTestExecutor` child commands, through the declared focused REAL proof; the orchestrator package typecheck remains the pre-signature backstop, and the package suite runs at landing, not in the build (ADR-0580 D2).
