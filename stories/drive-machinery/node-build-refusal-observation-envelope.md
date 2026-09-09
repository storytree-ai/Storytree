---
id: "node-build-refusal-observation-envelope"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: rendering-engine-structure-arc
title: "Render a refused CONFIRM observation in the node-build envelope"
outcome: "The node-build failure envelope renders an eligible original CONFIRM observation with its run and unit attribution."
status: proposed
proof_mode: contract-test
depends_on: [confirm-refusal-observation]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/node-build-refusal-observation.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/node-build-refusal-observation.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/node-build-refusal-observation.test.ts"]
      sourceGlobs: ["packages/drive/src/node-build.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/drive", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Render a refused CONFIRM observation in the node-build envelope

**Outcome —** The node-build failure envelope renders an eligible original CONFIRM observation with
its run and unit attribution.

## Proof walkthrough

Given a drive result containing an eligible original observation:

1. render a CONFIRM_RED refusal and read a labeled original-observation section with run id, unit
   id, phase, test id, exit code, stdout, and stderr;
2. render the red-then-CONFIRM_GREEN refusal and read the equivalent second-observation section;
3. count the underlying ordinary proof commands and observe one spawn in the first case, two in the
   second, and no render-triggered spawn; and
4. render a pass and non-observation GATE/backstop failures and observe no original-observation
   section.

The observable is the normal returned envelope and the command counter. The test file is NEW:
`packages/drive/src/node-build-refusal-observation.test.ts`; the existing broad CLI tests remain at
`packages/cli/src/node-build.test.ts` and are neither moved nor placed in this contract's write scope.
The REAL typecheck and regression backstop is a different failure path and is not an input to this
contract.

## Guidance

The drive is a renderer and propagator here. It consumes `ProveResult.failedObservation` through its
normal result composition. The test uses the existing offline `nodeBuild` seams (fixture corpus,
in-memory store, and dry-run path) and the ordinary orchestrator shell-child proof cases establish
the original subprocess data; neither needs a paid model call or a production test-only override.
It retains the existing result decision, signature, evidence, promotion, cleanup, `onLeafSlices`
accounting, and blind leaf boundary. It does not add a diagnostic command, a persisted result field,
a history reader, transcript capture, or a separate CLI route.

## Contracts (1)

1. **`node-build-renders-only-returned-confirm-observation`** — node build labels and renders the returned eligible observation without executing a command.
   - **asserts —** CONFIRM_RED and CONFIRM_GREEN envelopes preserve run/unit/phase/test attribution plus exact exit code/stdout/stderr; the original proof count stays one or two respectively with zero diagnostic reruns; passes and GATE/backstop/non-observation failures omit the section.
   - **covers —** `packages/drive/src/node-build.ts`.
   - **proven by —** a new `packages/drive/src/node-build-refusal-observation.test.ts` through the declared ordinary package-suite REAL proof.
