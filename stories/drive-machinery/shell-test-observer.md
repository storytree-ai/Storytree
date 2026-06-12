---
id: "shell-test-observer"
tier: capability
story: drive-machinery
title: "The spine's shell test observer (exit-code red/green)"
outcome: "Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge."
status: mapped
proof_mode: integration-test
depends_on: [red-green-phase-machine]
---

# The spine's shell test observer (exit-code red/green)

**Outcome —** Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md)

> **Proof status (honest) — `mapped`.** Fully covered by a real, passing, offline suite that spawns
> real Node child processes (`packages/orchestrator/src/shell-test-executor.test.ts`, part of
> `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). Brownfield `mapped`, not `healthy`.

## Guidance

The LIVE `TestExecutor` (ADR-0020 §3): `ShellTestExecutor`
(`packages/orchestrator/src/shell-test-executor.ts:66-93`) spawns a resolved `ShellCommand`
(file + argv via `execFile`, **never a shell** — injection-safe) and maps `exit 0 → green`,
non-zero → red with a classified `kind` (`defaultClassifyKind`, `shell-test-executor.ts:50-58`:
missing-symbol/TS-diagnostic shapes read as `compile`, everything else `runtime` — the §3
"right-kind red"). A red is DATA — `run` never throws on a non-zero exit; only a genuine spawn
failure (ENOENT — the command never ran, so no exit code exists to observe) rejects.

**The forged-green fix (PR #29) lives here**: `scrubbedChildEnv`
(`shell-test-executor.ts:106-122`) strips two env families from every spawned child —

- `NODE_TEST*`: when the spine itself runs under `node --test`, the runner exports
  `NODE_TEST_CONTEXT` to children; a spawned `node --test <file>` inheriting it behaves as a
  coordinated test-runner child and can exit 0 WITHOUT running the file — observed as a FORGED
  GREEN at CONFIRM_RED;
- secret-shaped names (TOKEN/SECRET/PASSWORD/CREDENTIAL/API_KEY/ACCESS_KEY): the leaf authors the
  test file this command executes, and with the ADR-0035 feedback tool its OUTPUT flows back to
  the model — a test that prints `process.env` must find no credentials there.

`runShellCommand` (`shell-test-executor.ts:134-164`) is exported as the SHARED runner: the gate's
CONFIRM observations spawn through it, and the leaf's bounded `run_proof`/`run_typecheck` feedback
tools (ADR-0035 option A, wired by [`prove-spec-resolution`](prove-spec-resolution.md)) spawn the
SAME command the same way — one oracle, two consumers.

The code edge for the `depends_on`: `shell-test-executor.ts:14` imports the `TestExecutor` /
`TestObservation` seam types from `./phase-machine.js` — this class IS the live implementation of
the phase machine's observation seam.

## Integration test

**Goal —** The observer feeds the real gate: the e2e walk
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`) wires a real `ShellTestExecutor` over
a real authored test file and the spine's CONFIRM_RED/CONFIRM_GREEN decisions ride its
observations — a genuinely failing then genuinely passing child process, exit codes only.

## Contracts (8)

1. **`exit-code-is-the-verdict-channel`** — exit 0 observes green; exit 1 observes a runtime red; a compile-shaped message + exit 1 observes a compile red
   - **asserts —** the three observation shapes off real spawned scripts.
   - **covers —** `packages/orchestrator/src/shell-test-executor.ts:73-87`
   - **proven by —** `packages/orchestrator/src/shell-test-executor.test.ts:15`, `:21`, `:29` (REAL, passing)
2. **`node-test-env-never-inherited`** — THE FORGED-GREEN FIX: the spawned observer never inherits `NODE_TEST*`
   - **asserts —** a child that would forge a green via `NODE_TEST_CONTEXT` is observed honestly.
   - **covers —** `shell-test-executor.ts:106-122`
   - **proven by —** `shell-test-executor.test.ts:38` (REAL, passing)
3. **`secrets-never-reach-the-child`** — secret-shaped env names are scrubbed (the leaf sees the output)
   - **asserts —** TOKEN/SECRET/… vars are absent in the child; benign names survive; the scrub predicate's name list is exact.
   - **covers —** `shell-test-executor.ts:106-122`
   - **proven by —** `shell-test-executor.test.ts:132` and `:152` (REAL, passing)
4. **`red-is-data-not-an-error`** — a non-zero exit resolves normally with the observation
   - **asserts —** `run` resolves on a red; never throws.
   - **covers —** `shell-test-executor.ts:143-154`
   - **proven by —** `shell-test-executor.test.ts:54` (REAL, passing)
5. **`spawn-failure-rejects`** — ENOENT (the command never ran) rejects rather than reading as a silent green
   - **asserts —** a missing executable rejects with the could-not-observe reason.
   - **covers —** `shell-test-executor.ts:151-162`
   - **proven by —** `shell-test-executor.test.ts:79` and `:125` (REAL, passing)
6. **`classification-is-pluggable`** — stdout-only compile shapes classify as compile; a custom `classifyKind` overrides the default
   - **asserts —** both classifier paths.
   - **covers —** `shell-test-executor.ts:50-58`, `:81-87`
   - **proven by —** `shell-test-executor.test.ts:61`, `:69`, `:168` (REAL, passing)
7. **`cwd-reaches-the-child`** — the resolved command's cwd is the spawned process's cwd
   - **asserts —** a cwd-sensitive script observes the right directory.
   - **covers —** `shell-test-executor.ts:136-141`
   - **proven by —** `shell-test-executor.test.ts:86` (REAL, passing)
8. **`shared-runner-captures-everything`** — `runShellCommand` captures stdout, stderr, and the exit code as data
   - **asserts —** the full `ShellRunResult` off a real child.
   - **covers —** `shell-test-executor.ts:134-164`
   - **proven by —** `shell-test-executor.test.ts:115` (REAL, passing)
