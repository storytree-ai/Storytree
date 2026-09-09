---
id: "confirm-refusal-observation"
tier: contract
story: drive-machinery
capability: prove-it-gate
arc: rendering-engine-structure-arc
title: "Return an original observation only from a refused CONFIRM phase"
outcome: "A refused CONFIRM phase returns its immediately preceding original shell observation to the outer caller."
status: proposed
proof_mode: contract-test
depends_on: [original-shell-observation]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/prove-it-gate.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/prove-it-gate.ts"]
  real:
    testFile: "packages/orchestrator/src/prove-it-gate.test.ts"
    sourceFile: "packages/orchestrator/src/prove-it-gate.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/prove-it-gate.test.ts"]
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
        - "packages/orchestrator/src/prove-it-gate.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Return an original observation only from a refused CONFIRM phase

**Outcome —** A refused CONFIRM phase returns its immediately preceding original shell observation to
the outer caller.

## Proof walkthrough

Given ordinary child commands run by a real `ShellTestExecutor`, a child-written marker file, and a
recording signing store:

1. run a command that is unexpectedly green at CONFIRM_RED; observe one spawn, its original
   exit-0 output in the failed result, one child-written marker, and no signing row;
2. set an explicit `expectedRed`, return a measured `oracle-count` wrong-kind red, and observe one
   spawn, its original red output in the failed result, one child-written marker, and no signing row;
3. advance on the expected red, leave the implementation red, and observe two total spawns with
   two child-written markers and only the CONFIRM_GREEN result attached to the final failure; and
4. pass the walk and separately refuse at authoring, GATE, and backstop; observe no failed
   observation payload in all four cases.

The unexpected-green case must be an actual exit-0 child. The wrong-kind case sets the actual
`expectedRed: "assertion"` declaration and obtains its red kind from real guard/report measurement:
zero real assertions measures `compile` on the executor's `oracle-count` basis, rather than using an
injected observation or classifier constant. The observable is the discriminated
`ProveResult`, child-written marker count, and signing store; resolver command calls do not prove a
spawn count. The tests use ordinary shell children, never a fabricated `RecordingTestExecutor`
observation. The focused command is the discriminating acceptance; the full orchestrator package
suite and typecheck remain mandatory installed pre-signature backstops.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read the full
canonical acceptance at `stories/drive-machinery/confirm-refusal-observation.md`: `## Proof
walkthrough` and the complete assertion body under `## Contracts (1)`. The generated contract-ID
briefing is an index only, never a replacement for that reading. Preserve every stated case:
child-written markers rather than resolver-call counts; an unexpectedly green CONFIRM_RED child; a
measured `oracle-count` wrong-kind red under `expectedRed: "assertion"`; the advancing expected-red
then CONFIRM_GREEN-red path; and the pass, authoring, GATE, backstop, and non-shell no-payload paths.

`proveUnit` transports `TestObservation.originalProcessResult` as `ProveResult.failedObservation`
only after `nextPhase` has already refused the final CONFIRM phase. It neither re-observes nor
modifies that decision. The payload is in memory and failure-only: it is not verdict evidence,
event/history data, a leaf feedback response, or permission to rerun a command. `expectedRed`
remains meaningful only when the red kind is measured by `oracle-count`; an output-text red remains
an ordinary advancing red. No original process payload exists after an authoring, GATE, backstop,
`beforeRun`, ENOENT, or non-shell failure, and no detail is fabricated for any of them. The code
after an oracle veto remains eligible for the failed CONFIRM payload only when that transition itself
refuses. Its exact flat shape is `failedObservation?: { phase: "CONFIRM_RED" | "CONFIRM_GREEN";
testId: string; stdout: string; stderr: string; exitCode: number | null }`: `phase` identifies the
refused CONFIRM transition, `testId` is the original observation's id, and `exitCode` is the original
status (including `null` for termination). No `code` alias, nested process object, or additional
phase/prompt is part of this boundary.

## Contracts (1)

1. **`final-confirm-refusal-carries-one-original-observation`** — only a refused CONFIRM result carries the shell result that caused that refusal.
   - **asserts —** an actual exit-0 unexpected CONFIRM_RED child and a real guard/report-measured oracle-count wrong-kind red under `expectedRed: "assertion"` each produce exactly one child-written marker, return `failedObservation` with `phase`, the original `testId`, exact stdout/stderr, and `exitCode: number | null`, and write zero signing rows; an ordinary non-zero expected red advances, then a CONFIRM_GREEN red produces two child-written markers and returns only the second child's flat payload. A pass retains its ordinary one signing row; authoring, GATE, backstop, beforeRun, ENOENT, and non-shell refusals carry no payload and every refusal writes zero signing rows. The transport adds no rerun, phase authority, extra authoring prompt, or persisted evidence, feedback, or event/history data.
   - **covers —** `packages/orchestrator/src/prove-it-gate.ts`.
   - **proven by —** authored additions to `packages/orchestrator/src/prove-it-gate.test.ts` through the declared focused REAL proof; the full orchestrator package suite and typecheck remain installed pre-signature backstops.
