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
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Return an original observation only from a refused CONFIRM phase

**Outcome —** A refused CONFIRM phase returns its immediately preceding original shell observation to
the outer caller.

## Proof walkthrough

Given a real `ShellTestExecutor` and a recording signing store:

1. run a command that is unexpectedly green at CONFIRM_RED; observe one spawn, its original
   exit-0 output in the failed result, and no signing row;
2. set an explicit `expectedRed`, return a measured `oracle-count` wrong-kind red, and observe one
   spawn, its original red output in the failed result, and no signing row;
3. advance on the expected red, leave the implementation red, and observe two total spawns with
   only the CONFIRM_GREEN result attached to the final failure; and
4. pass the walk and separately refuse at authoring, GATE, and backstop; observe no failed
   observation payload in all four cases.

The observable is the discriminated `ProveResult`, the shell spawn count, and the signing store. The
tests use ordinary shell children, never a fabricated `RecordingTestExecutor` observation.

## Guidance

`proveUnit` transports `TestObservation.originalProcessResult` as `ProveResult.failedObservation`
only after `nextPhase` has already refused the CONFIRM phase. It neither re-observes nor modifies
that decision. The payload is in memory and failure-only: it is not verdict evidence, event/history
data, a leaf feedback response, or permission to rerun a command. `expectedRed` remains meaningful
only when the red kind is measured by `oracle-count`; output-text classification still never refuses
work.

## Contracts (1)

1. **`final-confirm-refusal-carries-one-original-observation`** — only a refused CONFIRM result carries the shell result that caused that refusal.
   - **asserts —** unexpected CONFIRM_RED green and measured wrong-kind red each spawn once and return their original result; expected red followed by CONFIRM_GREEN red spawns twice and returns only the second result; each refusal has zero signing rows; passes and authoring/GATE/backstop/non-shell failures carry none.
   - **covers —** `packages/orchestrator/src/prove-it-gate.ts`.
   - **proven by —** authored additions to `packages/orchestrator/src/prove-it-gate.test.ts` through the declared ordinary package-suite REAL proof.
