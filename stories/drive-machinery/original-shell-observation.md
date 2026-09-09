---
id: "original-shell-observation"
tier: contract
story: drive-machinery
capability: shell-test-observer
arc: rendering-engine-structure-arc
title: "Preserve a spawned proof command's original observation"
outcome: "A shell test observation retains its spawned proof command's original stdout, stderr, and exit status as in-memory transport detail."
status: proposed
proof_mode: contract-test
depends_on: [red-green-phase-machine]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs:
      - "packages/orchestrator/src/phase-machine.test.ts"
      - "packages/orchestrator/src/shell-test-executor.test.ts"
    sourceGlobs:
      - "packages/orchestrator/src/phase-machine.ts"
      - "packages/orchestrator/src/shell-test-executor.ts"
  real:
    testFile: "packages/orchestrator/src/shell-test-executor.test.ts"
    sourceFile: "packages/orchestrator/src/shell-test-executor.ts"
    scope:
      testGlobs:
        - "packages/orchestrator/src/phase-machine.test.ts"
        - "packages/orchestrator/src/shell-test-executor.test.ts"
      sourceGlobs:
        - "packages/orchestrator/src/phase-machine.ts"
        - "packages/orchestrator/src/shell-test-executor.ts"
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
        - "packages/orchestrator/src/phase-machine.test.ts"
        - "packages/orchestrator/src/shell-test-executor.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Preserve a spawned proof command's original observation

**Outcome —** A shell test observation retains its spawned proof command's original stdout, stderr,
and exit status as in-memory transport detail.

## Proof walkthrough

Given ordinary `ShellTestExecutor` commands that each append one marker to a temporary child-owned
file as well as emitting distinct stdout and stderr:

1. observe one green child, one red child, and one signal-terminated child, and read each original
   output and exit status (`null` for the terminated child) from its resulting observation and
   exactly one marker per observation;
2. make `verifyGreen` downgrade an exit-0 child and read the same spawned result from the resulting
   red observation;
3. make `beforeRun` refuse, use an ENOENT command, and use a non-shell executor; observe no
   fabricated process detail; and
4. give `nextPhase` otherwise identical observations with and without the detail and observe the
   same transition, including the existing measured-kind-only wrong-red rule.

The observable is the returned observation plus the child-observed marker count. Resolver command
calls do not prove the count: production may resolve once and spawn twice. The signal child writes
its distinct original stdout and stderr before termination and runs under a timeout margin sufficient
for both writes; the proof requires only the observed `exitCode: null`, never a platform signal name.
The focused CONFIRM command executes both acceptance suites: phase-machine transition inertness and
the live shell observer's ordinary child commands. The full orchestrator package suite and typecheck
remain mandatory pre-signature backstops in `buildNodeReal` (`packages/drive/src/node-build.ts`,
lines 1165–1220); the ordinary child commands are the discriminating integration path.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read the full
canonical acceptance at `stories/drive-machinery/original-shell-observation.md`: `## Proof
walkthrough` and the complete assertion body under `## Contracts (1)`. The generated contract-ID
briefing is an index only, never a replacement for that reading. Preserve every stated case:
child-written marker counts rather than resolver-call counts, green/red/signal-terminated/
verifyGreen-downgraded observations, `beforeRun`/ENOENT/non-shell no-payload paths, phase-transition
inertness, and the signal child's distinct stdout/stderr before termination.

This contract changes exactly the exported `TestObservation.originalProcessResult` transport seam and
`ShellTestExecutor`'s mapping from the already completed `ShellRunResult`. It adds no command path
and no feedback path. A spawned exit-0 result remains available even when `verifyGreen` classifies it
as a fail-closed red; a signal-terminated child retains `exitCode: null`; a `beforeRun` veto occurs
before a spawn, so it has none. The phase machine treats the optional detail as inert data: result,
expected-red declaration, and measured kind remain the whole transition oracle.

## Contracts (1)

1. **`original-shell-result-is-preserved-without-a-rerun`** — spawned command data survives classification as optional observation detail.
   - **asserts —** real green, red, signal-terminated, and verifyGreen-downgraded child commands retain their exact stdout, stderr, and exit status (`null` for termination) in `originalProcessResult`; a marker written inside each ordinary child records exactly one invocation for each one-command path, rather than inferring that count from resolver calls. The signal child emits distinct original stdout/stderr before termination with a sufficient timeout margin, and the assertion names only `exitCode: null`. beforeRun vetoes, spawn errors, and non-shell observations expose no invented detail; adding the detail cannot change a phase transition or make output-text classification refuse a wrong red.
   - **covers —** `packages/orchestrator/src/phase-machine.ts` and `packages/orchestrator/src/shell-test-executor.ts`.
   - **proven by —** authored additions to `phase-machine.test.ts` and `shell-test-executor.test.ts` through the declared focused REAL proof; the full orchestrator package suite and typecheck remain pre-signature backstops.
