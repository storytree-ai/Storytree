---
id: "node-build-refusal-observation-envelope"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
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
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/drive/src/node-build-refusal-observation.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Render a refused CONFIRM observation in the node-build envelope

**Outcome —** The node-build failure envelope renders an eligible original CONFIRM observation with
its run and unit attribution.

## Authoring timing

This downstream proposed contract intentionally carried no executable `proof:` registration in its
first runtime-unit landing, because its required new test file had not been authored. At its fresh
unit anchor, ahead of its node build, its story author registered
`packages/drive/src/node-build-refusal-observation.test.ts` and `packages/drive/src/node-build.ts`
as its node-borne REAL scope with install, the `@storytree/drive` typecheck backstop, and a real
proof command FOCUSED on that one test file rather than the package suite — the shape
`confirm-refusal-observation` and `original-shell-observation` use, because a whole-suite proof run
inside a `--real` build worktree fails on nested-proof tests no leaf may touch (measured for
`@storytree/orchestrator` on 2026-09-14; `@storytree/drive` carries tests of the same kind). The
frontmatter `proof:` block sets `editsExisting: true` because the source file already exists at HEAD
and its behaviour changes (the flag reads the source, not the new test file). The normal AUTHOR_TEST phase then creates that test file and IMPLEMENT lands it with the
production change in the same signed build. Neither the deferral nor the registration retires,
narrows, or satisfies any acceptance below; the deferral only kept an unauthored test from being
represented as a real-build surface before its build was due.

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
