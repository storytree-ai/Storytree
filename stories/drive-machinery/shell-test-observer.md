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
> real Node child processes (`packages/orchestrator/src/shell-test-executor.test.ts` — 22/22, I ran
> the file 2026-08-06). Brownfield `mapped`, not `healthy`.

## Guidance

The LIVE `TestExecutor` (ADR-0020 §3): `ShellTestExecutor`
(`packages/orchestrator/src/shell-test-executor.ts:139-190`) spawns a resolved `ShellCommand`
(file + argv via `execFile`, **never a shell** — injection-safe) and maps `exit 0 → green`,
non-zero → red with a classified `kind`. A red is DATA — `run` never throws on a non-zero exit; only
a genuine spawn failure (ENOENT — the command never ran, so no exit code exists to observe) rejects.

**A red's `kind` has two BASES, and only one of them may gate anything.** Every red carries a
`kindBasis` (`phase-machine.ts:88`) recording how its `kind` was arrived at:

- `"oracle-count"` — MEASURED, through the resolver's `measureRedKind` seam
  (`shell-test-executor.ts:85-97`): the assert-oracle report says how many assertions really RAN, so
  0 means the run never reached one (structural → `compile`) and ≥1 means the oracle ran and refused
  (assertion → `runtime`). This is the ONLY basis ADR-0020 §3's right-kind-red gate refuses on
  ([`red-green-phase-machine`](red-green-phase-machine.md));
- `"output-text"` — INFERRED by `defaultClassifyKind` (`:119-131`) from stdout+stderr:
  missing-symbol / unresolved-module / syntax / TS-diagnostic shapes read as `compile`, everything
  else `runtime`. It is the REPORTING basis (the evidence note on the verdict) and refuses nothing.

That split is not fastidiousness. `defaultClassifyKind`'s module-resolution alternatives were
TypeScript's wording (`cannot find name`, `no such module`) and matched **none** of what Node prints,
so a net-new node's unresolved import — the commonest structural red in the corpus — classified as
`runtime` and was stamped that way on every verdict's evidence. It survived because nothing DEPENDED
on the answer: the value was dead to control flow but live to the attestation, so no test could go
red over it being wrong. The patterns are fixed (`Cannot find module` / `Cannot find package` /
`ERR_MODULE_NOT_FOUND` / `ERR_UNKNOWN_FILE_EXTENSION` / `MODULE_NOT_FOUND` now read as `compile`,
while a real assertion failure stays `runtime`) — and the gate still arms only on the measured basis,
because a heuristic that was wrong for months unnoticed is the wrong instrument to refuse real work
with.

**The three optional cross-check seams** (`shell-test-executor.ts:62-98`) are wired together at one
site by [`prove-spec-resolution`](prove-spec-resolution.md), and only for oracle-accounted proof
commands (the default `node --import tsx --test` one) — a custom-`proofCommand` node has none of them
and stays exit-code-only. `beforeRun` (ADR-0249) clears the oracle report before the spawn, so what
is read back can only be THIS run's; `verifyGreen` (ADR-0211) downgrades an `exit 0` that never
exercised the oracle to a fail-closed red; `measureRedKind` reads the same cleared-then-read report
for the kind. The third depends on the first for exactly the reason the second does — an uncleared
report's count is not attributable to this observation.

**The forged-green fix (PR #29) lives here**: `scrubbedChildEnv`
(`shell-test-executor.ts:203-237`) strips two env families from every spawned child —

- `NODE_TEST*`: when the spine itself runs under `node --test`, the runner exports
  `NODE_TEST_CONTEXT` to children; a spawned `node --test <file>` inheriting it behaves as a
  coordinated test-runner child and can exit 0 WITHOUT running the file — observed as a FORGED
  GREEN at CONFIRM_RED;
- secret-shaped names (TOKEN/SECRET/PASSWORD/CREDENTIAL/API_KEY/ACCESS_KEY): the leaf authors the
  test file this command executes, and with the ADR-0035 feedback tool its OUTPUT flows back to
  the model — a test that prints `process.env` must find no credentials there.

`runShellCommand` (`shell-test-executor.ts:257-312`) is exported as the SHARED runner: the gate's
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

## Contracts (11)

1. **`exit-code-is-the-verdict-channel`** — exit 0 observes green; exit 1 observes a runtime red; a compile-shaped message + exit 1 observes a compile red
   - **asserts —** the three observation shapes off real spawned scripts.
   - **covers —** `packages/orchestrator/src/shell-test-executor.ts:146-184`
   - **proven by —** `packages/orchestrator/src/shell-test-executor.test.ts:16`, `:22`, `:30` (REAL, passing)
2. **`node-test-env-never-inherited`** — THE FORGED-GREEN FIX: the spawned observer never inherits `NODE_TEST*`
   - **asserts —** a child that would forge a green via `NODE_TEST_CONTEXT` is observed honestly.
   - **covers —** `shell-test-executor.ts:203-237`
   - **proven by —** `shell-test-executor.test.ts:39` (REAL, passing)
3. **`secrets-never-reach-the-child`** — secret-shaped env names are scrubbed (the leaf sees the output)
   - **asserts —** TOKEN/SECRET/… vars are absent in the child; benign names survive; the scrub predicate's name list is exact.
   - **covers —** `shell-test-executor.ts:203-237`
   - **proven by —** `shell-test-executor.test.ts:196` and `:243` (REAL, passing)
4. **`red-is-data-not-an-error`** — a non-zero exit resolves normally with the observation
   - **asserts —** `run` resolves on a red; never throws.
   - **covers —** `shell-test-executor.ts:169-184`
   - **proven by —** `shell-test-executor.test.ts:55` (REAL, passing)
5. **`spawn-failure-rejects`** — ENOENT (the command never ran) rejects rather than reading as a silent green
   - **asserts —** a missing executable rejects with the could-not-observe reason.
   - **covers —** `shell-test-executor.ts:304-309`
   - **proven by —** `shell-test-executor.test.ts:143` and `:189` (REAL, passing)
6. **`classification-is-pluggable`** — stdout-only compile shapes classify as compile; a custom `classifyKind` overrides the default
   - **asserts —** both classifier paths.
   - **covers —** `shell-test-executor.ts:119-131`, `:178-183`
   - **proven by —** `shell-test-executor.test.ts:62`, `:70`, `:301` (REAL, passing)
7. **`cwd-reaches-the-child`** — the resolved command's cwd is the spawned process's cwd
   - **asserts —** a cwd-sensitive script observes the right directory.
   - **covers —** `shell-test-executor.ts:277-279`
   - **proven by —** `shell-test-executor.test.ts:150` (REAL, passing)
8. **`shared-runner-captures-everything`** — `runShellCommand` captures stdout, stderr, and the exit code as data
   - **asserts —** the full `ShellRunResult` off a real child.
   - **covers —** `shell-test-executor.ts:257-312`
   - **proven by —** `shell-test-executor.test.ts:179` (REAL, passing)
9. **`node-module-resolution-reads-as-compile`** — the default classifier reads NODE's real unresolved-import wording as `compile`, and a genuine assertion failure still as `runtime`
   - **asserts —** `Cannot find module` / `Cannot find package` / `ERR_MODULE_NOT_FOUND` / `ERR_UNKNOWN_FILE_EXTENSION` / `SyntaxError` / a `TS####` diagnostic all classify `compile`; an `AssertionError` stays `runtime` (the widening swallows nothing).
   - **covers —** `shell-test-executor.ts:119-131`
   - **proven by —** `shell-test-executor.test.ts:82` (REAL, passing)
10. **`measured-kind-wins-and-the-basis-is-recorded`** — a MEASURED red kind overrides the text heuristic and is stamped `oracle-count`; an unmeasurable red degrades to the heuristic and is stamped `output-text`
    - **asserts —** with `measureRedKind` returning a kind, that kind wins over contradicting output text and `kindBasis === "oracle-count"`; returning `undefined` means "cannot measure" (never a kind) and yields the heuristic's kind with `kindBasis === "output-text"`, which the phase gate will not refuse on.
    - **covers —** `shell-test-executor.ts:171-183`
    - **proven by —** `shell-test-executor.test.ts:112` and `:128` (REAL, passing)
11. **`a-green-declares-whether-it-was-vetted`** — an unvetted green SAYS so, and a cross-checked one reports what it measured
    - **asserts —** a green observed with no `verifyGreen` wired carries `UNVETTED_GREEN_NOTE`; a green whose `verifyGreen` returns `{ok:true, note}` carries that note instead and never reads as unvetted; a `{ok:false}` veto is still a fail-closed RED carrying the veto reason (ADR-0211 unchanged).
    - **covers —** the green branch of `ShellTestExecutor.run` + `UNVETTED_GREEN_NOTE` (`packages/orchestrator/src/shell-test-executor.ts`)
    - **proven by —** `packages/orchestrator/src/shell-test-executor.test.ts`, the three `oracle-veto-covers-custom-proof-commands` cases (REAL, passing)
