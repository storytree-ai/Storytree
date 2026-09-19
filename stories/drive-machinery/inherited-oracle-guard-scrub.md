---
id: "inherited-oracle-guard-scrub"
tier: contract
story: drive-machinery
capability: shell-test-observer
arc: inner-loop-exit-arc
title: "A spawned proof never inherits another observation's assert-oracle guard"
outcome: "A command the spine spawns runs with only the oracle instrumentation its own spine chose, never an assert-oracle guard inherited through NODE_OPTIONS."
status: retired
proof_mode: contract-test
depends_on: []
# RETIRED by ADR-0580 D1 (2026-09-19), which removed the assert-oracle guard from the build spine
# entirely. There is no guard left to inherit, so the value strip this contract proved was deleted from
# `scrubbedChildEnv` in the same landing, with its two tests in `shell-test-executor.test.ts`. The
# `real:` arm is DROPPED so this node no longer registers a REAL proof — the coverage sweep and
# contract-binding drift key on that arm, and `status` alone changes neither. proof.command +
# proof.scope are kept as history (the node stays visible, never REAL-buildable), and so is the body.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/shell-test-executor.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/shell-test-executor.ts"]
---

# A spawned proof never inherits another observation's assert-oracle guard

> **RETIRED by ADR-0580 D1 (2026-09-19).** The assert-oracle guard is gone from the build spine, so
> no process can inherit one. The `NODE_OPTIONS` strip this contract proved (signed run
> `real-mu0zz0sc`) was deleted from `scrubbedChildEnv` with its tests; the key scrubs (`NODE_TEST*`
> and secret-shaped names) are unchanged. The `real:` arm was dropped on retirement, and the body below
> is kept as history of what the scrub WAS — its `proven by —` tests no longer exist in this checkout,
> and the `scrubbedChildEnv` its `covers —` names no longer carries the strip.

**Outcome —** A command the spine spawns runs with only the oracle instrumentation its own spine
chose, never an assert-oracle guard inherited through NODE_OPTIONS.

## Proof walkthrough

Given the test process's own `process.env.NODE_OPTIONS` set to an `--import` of an assert-oracle
guard plus one unrelated option — for example `--import <assertOracleGuardUrl()>` followed by
`--max-old-space-size=4096` — and restored in `finally`:

1. spawn an ordinary `node -e` child through `runShellCommand` that reports
   `Object.isFrozen(require("node:assert/strict"))`, and observe `false`: no inherited guard loaded;
2. spawn a child that prints its own `process.env.NODE_OPTIONS`, and observe the unrelated option
   in it byte-for-byte;
3. set `NODE_OPTIONS` to the guard import ALONE, spawn a child that reports whether it has any
   `NODE_OPTIONS`, and observe that it has none; and
4. with the inherited guard still set, spawn a child whose `cmd.env.NODE_OPTIONS` supplies a guard
   import of its own, and observe `node:assert/strict` frozen in that child.

The observable is each child's exit code or stdout, read off `runShellCommand`'s `ShellRunResult`.
Before the source change steps 1 and 3 fail, because the inherited guard reaches the child; after
it, all four pass. Steps 2 and 4 already pass before the change, and they are the fences on the fix
rather than padding: scrubbing `NODE_OPTIONS` by key fails step 2, and stripping the guard from the
merged env (after `cmd.env`) fails step 4. Step 4 is also the positive control that keeps step 1
honest — the same observable reads frozen when a guard really is loaded, so step 1's `false` cannot
come from a probe that never reads anything.

## Guidance

**Why this exists (measured 2026-09-14).** When the orchestrator suite is a `--real` build's proof,
the spine delivers its assert-oracle guard through `NODE_OPTIONS`: the proof route is
`package-script-node-test-suite`, and `withOracleGuardEnv`
(`packages/orchestrator/src/proof/proof-route.ts`) composes the value that
`packages/orchestrator/src/resolve-prove-spec.ts` places on the proof command's `cmd.env`.
`scrubbedChildEnv()` then passes `NODE_OPTIONS` through to every process the suite's own tests
spawn, and two things break. Nested guarded observations load a SECOND, different copy of the
guard: the first copy has already frozen `node:assert`, so the second counts nothing, and its exit
hook overwrites the per-process report with zero — "the proof exited 0 but executed 0 assertions",
or a red measured as `compile`. And spawns a test deliberately leaves UNGUARDED inherit a guard they
never asked for. Reproduced with a control: under exactly this build's proof conditions, 11 tests
fail — five in `packages/orchestrator/src/proof/oracle-accounting.test.ts` (ATTACK A, ATTACK C,
HONEST GREEN, both CONCURRENT SIBLINGS) and six in
`packages/orchestrator/src/resolve-prove-spec.test.ts` (REAL mode offline walk, the two own-file
node:test proofs, both C — edit-existing walks, R2 — refactor-for-testability). With only an
inherited-guard strip added to `scrubbedChildEnv`, all 643 non-skipped tests pass under the same
conditions. This is why `inner-loop-exit-arc-inc-08`'s whole-suite orchestrator proofs could never
go green — and why this contract's own REAL proof is deliberately the WHOLE package suite rather
than the focused single-file command `confirm-refusal-observation` and `original-shell-observation`
use: this build going green is itself the acceptance evidence that such a proof can.

**What the leaf will see.** Before the source change, `run_proof` shows those 11 failures IN
ADDITION to the new test. They sit outside the write scope, they are this contract's in-situ
acceptance, and they go green when the scrub is right. Never edit them, and never try to make them
pass any other way.

**The shape of the fix.** In `scrubbedChildEnv`, remove from the inherited `NODE_OPTIONS` every
`--import <specifier>` / `--import=<specifier>` whose specifier ends in `assert-oracle-guard.mjs` —
any directory, any copy, because foreign copies are the problem. Leave every other byte of
`NODE_OPTIONS` untouched (do not normalise whitespace or re-quote), and drop the variable if nothing
but whitespace remains. Do not scrub by key: `NODE_OPTIONS` must still pass through, so
`isScrubbedEnvKey` does not change. The spine's OWN chosen instrument reaches the child through
`cmd.env`, which `runShellCommand` merges after `scrubbedChildEnv()`, so the strip removes nothing
the spine chose. Update the doc comment that lists the scrub families (above `isScrubbedEnvKey`,
which `scrubbedChildEnv` applies) so it names this third one — a strip of a value, not a key — and
why.

**Out of scope.** Do not change `packages/orchestrator/src/proof/assert-oracle-guard.mjs`,
`packages/orchestrator/src/proof/oracle-accounting.ts`,
`packages/orchestrator/src/proof/proof-route.ts` or `packages/orchestrator/src/resolve-prove-spec.ts`.
A latent defect in the guard itself — a copy that could not install its counter still writes a zero
— is recorded separately and is not this contract's business.

## Contracts (1)

1. **`an-inherited-oracle-guard-never-reaches-the-child`** — a command spawned through `runShellCommand` never inherits an assert-oracle guard preload from the spine's own `NODE_OPTIONS`, while every other inherited option and the command's own `cmd.env` still reach the child.
   - **asserts —** with the test process's `process.env.NODE_OPTIONS` set (and restored in `finally`) to an `--import` of an assert-oracle guard (`assertOracleGuardUrl()` from `./proof/oracle-accounting.js`, or any copy whose specifier ends `assert-oracle-guard.mjs`) plus one unrelated option such as `--max-old-space-size=4096`: (a) a child spawned through `runShellCommand` does NOT have the guard loaded — `Object.isFrozen(require("node:assert/strict"))` is false in the child; (b) the child's own `process.env.NODE_OPTIONS` still carries the unrelated option, byte-for-byte (assert on that option's text, not on the exact whole value: the whitespace around a removed import is not part of this contract); (c) when `NODE_OPTIONS` held ONLY the guard import, the child sees no `NODE_OPTIONS` at all; (d) a guard the COMMAND itself supplies through `cmd.env.NODE_OPTIONS` still reaches the child (its `node:assert/strict` IS frozen), because `cmd.env` is merged after the scrub. The spawned children are ordinary `node -e` processes that report by exit code or stdout, matching the existing `ENV HONESTY` tests in `shell-test-executor.test.ts` (around lines 47 and 204). Test titles must be STATIC strings beginning with the clause id followed by `: ` (e.g. `an-inherited-oracle-guard-never-reaches-the-child: …`), and each must execute a real assertion — that is how contract coverage is counted (`packages/orchestrator/src/proof/contract-coverage.ts`).
   - **covers —** `packages/orchestrator/src/shell-test-executor.ts` (`scrubbedChildEnv`).
   - **proven by —** authored additions to `packages/orchestrator/src/shell-test-executor.test.ts` through the declared whole-package-suite REAL proof.
