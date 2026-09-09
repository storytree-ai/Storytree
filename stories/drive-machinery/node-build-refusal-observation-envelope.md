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
---

# Render a refused CONFIRM observation in the node-build envelope

**Outcome —** The node-build failure envelope renders an eligible original CONFIRM observation with
its run and unit attribution.

## Authoring timing

This downstream proposed contract intentionally has no executable `proof:` registration yet: its
required new test file does not exist in the first runtime-unit landing. At its fresh unit anchor,
before node build begins, its story author registers
`packages/drive/src/node-build-refusal-observation.test.ts` and `packages/drive/src/node-build.ts`
as its node-borne REAL scope with the `@storytree/drive` package regression command, install, and
typecheck backstops. The normal AUTHOR_TEST phase then creates that file and IMPLEMENT lands it with
the production change in the same signed build. Deferring this registration does not retire, narrow,
or satisfy any acceptance below; it prevents an absent test from being represented as a current
real-build surface.

## Proof walkthrough

Given the production `ProveResult` returned by `proveUnit`, whose `ShellTestExecutor` observation
contains an eligible original observation:

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

The drive is a renderer and propagator here. Its implementation extracts the existing
`ProveResult`-to-failure-envelope formatting into a shared same-file production function that
`nodeBuild` calls; it consumes `ProveResult.failedObservation` through that normal result
composition. The new test obtains its actual returned failure from `proveUnit` plus
`ShellTestExecutor` ordinary child commands, using only a scripted/no-op unit-test author fixture,
then passes that result to the production renderer. It does not call `nodeBuild`'s dry-run synthetic
pair, inject an author/result/executor into `NodeBuildOpts`, make a paid nested author call, or add a
production test-only override. It retains the existing result decision, signature, evidence,
promotion, cleanup, `onLeafSlices` accounting, and blind leaf boundary. It does not add a diagnostic
command, a persisted result field, a history reader, transcript capture, or a separate CLI route.

## Contracts (1)

1. **`node-build-renders-only-returned-confirm-observation`** — node build labels and renders the returned eligible observation without executing a command.
   - **asserts —** the production result-to-envelope renderer, called by `nodeBuild`, preserves run/unit/phase/test attribution plus exact exit code/stdout/stderr for CONFIRM_RED and CONFIRM_GREEN; the original proof count stays one or two respectively with zero diagnostic reruns; passes and GATE/backstop/non-observation failures omit the section.
   - **covers —** the same-file production result-to-envelope renderer in `packages/drive/src/node-build.ts` and its `nodeBuild` call site.
   - **proven by —** a new `packages/drive/src/node-build-refusal-observation.test.ts` in this contract's fresh real build, which registers the ordinary `@storytree/drive` package-suite REAL proof.
