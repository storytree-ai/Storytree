---
id: "shell-test-observer"
tier: capability
story: drive-machinery
title: "The spine's shell test observer (exit-code red/green)"
outcome: "Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge."
status: proposed
proof_mode: integration-test
depends_on: [red-green-phase-machine]
---

# The spine's shell test observer (exit-code red/green)

**Outcome —** Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md)

> **Proof status (honest) — `proposed`.** Covered by a real, passing, offline suite that spawns real
> Node child processes (`packages/orchestrator/src/shell-test-executor.test.ts` — 35 cases: all 34
> applicable Windows cases passed and the POSIX-only case was platform-skipped on 2026-09-19). This
> greenfield capability has no current signed pass; the standing suite does not make it brownfield
> (ADR-0395).

## Guidance

The LIVE `TestExecutor` (ADR-0020 §3): `ShellTestExecutor`
(`packages/orchestrator/src/shell-test-executor.ts:153-198`) spawns a resolved `ShellCommand`
(file + argv via `spawn`, with no shell for ordinary proof commands — injection-safe) and maps
`exit 0 → green`, non-zero → red with a classified `kind`. A red is DATA — `run` never throws on a
non-zero exit. Observation infrastructure rejects distinctly when the command never starts, when a
started command exceeds one stream's capture ceiling before its deadline, or when force-stop delivery
to a still-live root's owned process scope cannot be confirmed.

**Red and green are the exit code, and nothing else (ADR-0020 §3, ADR-0580 D1).** A green is an
`exit 0` and is never downgraded; a red is any non-zero exit. Until ADR-0580 D1 the resolver also wired
an assert-oracle cross-check onto some proof routes (ADR-0211 / ADR-0249); it was removed entirely.
What checks a new test individually is the per-test report below, on the routes
[`prove-spec-resolution`](prove-spec-resolution.md) arms.

**A red's `kind` is a REPORTING value, and nothing gates on it.** `defaultClassifyKind`
(`shell-test-executor.ts:129-141`) infers it from stdout+stderr: missing-symbol / unresolved-module /
syntax / TS-diagnostic shapes read as `compile`, everything else `runtime`. It rides on the verdict's
evidence note; whether a new test's red is an assertion or a crash is judged by the per-test review
from the runner's own report (ADR-0573 C5), never from this heuristic.

The heuristic's history is the reason. `defaultClassifyKind`'s module-resolution alternatives were
TypeScript's wording (`cannot find name`, `no such module`) and matched **none** of what Node prints,
so a net-new node's unresolved import — the commonest structural red in the corpus — classified as
`runtime` and was stamped that way on every verdict's evidence. It survived because nothing DEPENDED
on the answer: the value was dead to control flow but live to the attestation, so no test could go
red over it being wrong. The patterns are fixed (`Cannot find module` / `Cannot find package` /
`ERR_MODULE_NOT_FOUND` / `ERR_UNKNOWN_FILE_EXTENSION` / `MODULE_NOT_FOUND` now read as `compile`,
while a real assertion failure stays `runtime`).

**The child-env scrubs live here, the forged-green fix (PR #29) among them**: `scrubbedChildEnv`
and its key predicate `isScrubbedEnvKey` (`shell-test-executor.ts:211-228`) apply TWO key scrubs to
every spawned child:

- `NODE_TEST*` (the forged-green fix): when the spine itself runs under `node --test`, the runner
  exports `NODE_TEST_CONTEXT` to children; a spawned `node --test <file>` inheriting it behaves as a
  coordinated test-runner child and can exit 0 WITHOUT running the file — observed as a FORGED
  GREEN at CONFIRM_RED;
- secret-shaped names (TOKEN/SECRET/PASSWORD/CREDENTIAL/API_KEY/ACCESS_KEY): the leaf authors the
  test file this command executes, and with the ADR-0035 feedback tool its OUTPUT flows back to
  the model — a test that prints `process.env` must find no credentials there.

A third scrub — a strip of an inherited assert-oracle guard out of `NODE_OPTIONS`, contract
[`inherited-oracle-guard-scrub`](inherited-oracle-guard-scrub.md) — retired with the guard (ADR-0580
D1); `NODE_OPTIONS` now passes through like any other unscrubbed key.

`runShellCommand` is exported as the SHARED runner: the gate's
CONFIRM observations spawn through it, and the leaf's bounded `run_proof`/`run_typecheck` feedback
tools (ADR-0035 option A, wired by [`prove-spec-resolution`](prove-spec-resolution.md)) spawn the
SAME command the same way — one oracle, two consumers.

**Deadline ownership and process scope.** The deadline is armed only when the child emits `spawn`,
and remains armed between root `exit` and process `close` because descendants may still own inherited
pipes. Once its callback begins, it owns the terminal observation: a final output burst or `close`
cannot rewrite the timeout as a max-buffer rejection or numeric exit. Output received through
termination is retained up to the unchanged 64 MiB **per-stream** ceiling; bytes beyond the ceiling
are discarded after timeout. Before timeout, exceeding either independent byte ceiling attempts the
same ownership-scoped stop, releases the runner's handles, and rejects as
`ERR_CHILD_PROCESS_STDIO_MAXBUFFER` regardless of that stop's delivery result. The error names the
overflowing stream and preserves both streams as captured at the overflow; it never says the command
failed to run.

While the root is still observed live, POSIX uses `detached: true` and sends `SIGKILL` to that owned
process group; this covers descendants that remain in the group, **not** descendants that call
`setsid`, spawn detached, or otherwise escape it. Windows asks `taskkill /T /F` for the tree reachable
from the live root. That Windows operation has an unavoidable check-to-taskkill race without a Job
Object or retained OS process handle: checking that Node has not observed exit reduces stale-PID risk
but cannot eliminate it. A successful native call means delivery was accepted, not that every target
was independently observed dead. The native wrapper/child/grandchild proof separately observes that
its same-scope fixtures die; it does not extend the runtime promise to escaped descendants. A refused
or throwing live-root request rejects distinctly as `ERR_CHILD_PROCESS_TREE_TERMINATION`, with its
cause and both captured streams, after natural `close` or bounded handle release.

If root `exit` has already been observed but `close` has not arrived when the deadline fires, the
numeric PID — and on POSIX the former PGID — is no longer treated as ownership proof. The group may
have emptied while an escaped process alone retains a pipe, permitting number reuse. On **either**
platform the runner therefore sends no signal, closes its own pipes, unreferences the process handle,
and returns the timeout-red `code: null`; such descendants may continue running. Node's standard
child-process API retains no ownership-safe whole-scope handle after leader exit.

Settlement is bounded but not identical to the declared command budget. The already-exited-root path
releases its handles and settles in the deadline callback. For a still-live Windows root, synchronous
`taskkill` has its own 10-second ceiling and is followed by at most a 1-second stream drain, bounding
that post-deadline Windows path to 11 seconds; POSIX group signal delivery is followed by the same
drain. Natural `close` settles sooner. A delivered stop ends as timeout-red `code: null`; an
undelivered or throwing stop ends as the structured termination error above, never as an ordinary
red.

The code edge for the `depends_on`: `shell-test-executor.ts:15` imports the `TestExecutor` /
`TestObservation` seam types from `./phase-machine.js` — this class IS the live implementation of
the phase machine's observation seam.

**Original-command refusal detail.** A `ShellTestExecutor` observation made from a spawned command
sets `TestObservation.originalProcessResult` to that command's own `stdout`, `stderr`, and
`exitCode` (including `null` for a signal-terminated child), alongside its red/green classification.
It is the one result already obtained for this observation, never a diagnostic rerun. A per-test
report that could not be cleared is deliberately different: it refuses before the spawn, so it has no
original subprocess result to attach. This detail neither reaches the leaf nor changes the
classification, `kind`, phase transition, signed evidence, event schema, or stored history; the gate
may expose it only on the final refused CONFIRM result.

**The per-test report seam (ADR-0573 D1–D2).** `ShellTestResolver.perTestReport` is an optional seam
held to a clear-then-read discipline (ADR-0249's rule): the report is cleared before the spawn, and a
report that survives the clear refuses the observation without spawning; after the run it
is read and rides on the observation as `TestObservation.perTest`, changing neither `result` nor
`originalProcessResult`. The readers for node's reporter JSONL, bun junit and vitest json live in
`packages/orchestrator/src/proof/per-test-report.ts`. [`prove-spec-resolution`](prove-spec-resolution.md) arms it on
every real proof route that runs ONE test file through node:test, vitest or `bun test` (ADR-0573 D3);
whole-package suites and other runners are observed exactly as before.

## Integration test

**Goal —** The observer feeds the real gate: the e2e walk
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:161`) wires a real `ShellTestExecutor` over
a real authored test file and the spine's CONFIRM_RED/CONFIRM_GREEN decisions ride its
observations — a genuinely failing then genuinely passing child process, exit codes only.

## Contracts (15 → 13 surviving; ADR-0580 D1)

1. **`exit-code-is-the-verdict-channel`** — exit 0 observes green; exit 1 observes a runtime red; a compile-shaped message + exit 1 observes a compile red
   - **asserts —** the three observation shapes off real spawned scripts.
   - **covers —** `packages/orchestrator/src/shell-test-executor.ts:153-198`
   - **proven by —** `packages/orchestrator/src/shell-test-executor.test.ts:25`, `:32`, `:40` (REAL, passing)
2. **`node-test-env-never-inherited`** — THE FORGED-GREEN FIX: the spawned observer never inherits `NODE_TEST*`
   - **asserts —** a child that would forge a green via `NODE_TEST_CONTEXT` is observed honestly.
   - **covers —** `shell-test-executor.ts:211-228`
   - **proven by —** `shell-test-executor.test.ts:49` (REAL, passing)
3. **`secrets-never-reach-the-child`** — secret-shaped env names are scrubbed (the leaf sees the output)
   - **asserts —** TOKEN/SECRET/… vars are absent in the child; benign names survive; the scrub predicate's name list is exact.
   - **covers —** `shell-test-executor.ts:211-228`
   - **proven by —** `shell-test-executor.test.ts:175` and `:222` (REAL, passing)
4. **`red-is-data-not-an-error`** — a non-zero exit resolves normally with the observation
   - **asserts —** `run` resolves on a red; never throws.
   - **covers —** `shell-test-executor.ts:153-198`
   - **proven by —** `shell-test-executor.test.ts:65` (REAL, passing)
5. **`spawn-failure-rejects`** — ENOENT (the command never ran) rejects rather than reading as a silent green
   - **asserts —** a missing executable rejects with the could-not-observe reason.
   - **covers —** `shell-test-executor.ts:473-480`, `:641-657`
   - **proven by —** `shell-test-executor.test.ts:122` and `:168` (REAL, passing)
6. **`classification-is-pluggable`** — stdout-only compile shapes classify as compile; a custom `classifyKind` overrides the default
   - **asserts —** both classifier paths.
   - **covers —** `shell-test-executor.ts:129-141`, `:186-191`
   - **proven by —** `shell-test-executor.test.ts:72`, `:80`, `:861` (REAL, passing)
7. **`cwd-reaches-the-child`** — the resolved command's cwd is the spawned process's cwd
   - **asserts —** a cwd-sensitive script observes the right directory.
   - **covers —** `shell-test-executor.ts:404-416`
   - **proven by —** `shell-test-executor.test.ts:129` (REAL, passing)
8. **`shared-runner-captures-everything`** — `runShellCommand` captures stdout, stderr, and the exit code as data
   - **asserts —** the full `ShellRunResult` off a real child.
   - **covers —** `shell-test-executor.ts:389-659`
   - **proven by —** `shell-test-executor.test.ts:158` (REAL, passing)
9. **`node-module-resolution-reads-as-compile`** — the default classifier reads NODE's real unresolved-import wording as `compile`, and a genuine assertion failure still as `runtime`
   - **asserts —** `Cannot find module` / `Cannot find package` / `ERR_MODULE_NOT_FOUND` / `ERR_UNKNOWN_FILE_EXTENSION` / `SyntaxError` / a `TS####` diagnostic all classify `compile`; an `AssertionError` stays `runtime` (the widening swallows nothing).
   - **covers —** `shell-test-executor.ts:129-141`
   - **proven by —** `shell-test-executor.test.ts:92` (REAL, passing)
10. ~~`measured-kind-wins-and-the-basis-is-recorded`~~ — *(RETIRED by ADR-0580 D1, 2026-09-19 — the measured red kind and its `kindBasis` stamp went with the assert-oracle guard, and a red's kind is now the text heuristic's alone and gates nothing. Struck history, not a live contract: the id is left un-bolded so the contract parser no longer declares it, and its tests were deleted.)* — a MEASURED red kind overrode the text heuristic and was stamped `oracle-count`
11. ~~`a-green-declares-whether-it-was-vetted`~~ — *(RETIRED by ADR-0580 D1, 2026-09-19 — with no cross-check left, there is no vetted or unvetted green to distinguish: every green is an exit 0 and carries no note. Struck history, not a live contract: the id is left un-bolded so the contract parser no longer declares it, and its tests were deleted.)* — an unvetted green said so, and a cross-checked one reported what it measured
12. **`spawned-observation-keeps-its-original-process-result`** — a spawned observation can carry `originalProcessResult` from the exact process the spine already read, without another command
    - **asserts —** ordinary child commands emitting distinct stdout and stderr preserve those exact strings and their exit status for both a green and a red observation, including `exitCode: null` on signal termination; each assertion observes exactly one child spawn. An ENOENT rejection and any non-shell executor have no fabricated subprocess payload.
    - **covers —** `ShellTestExecutor.run` and its `ShellRunResult` hand-off (`packages/orchestrator/src/shell-test-executor.ts`)
    - **proven by —** `packages/orchestrator/src/shell-test-executor.test.ts:876` (ordinary real child processes; pending the capability's normal red→green proof)
13. **`runner-reports-read-per-test`** — each runner's report reads into one row per leaf test, with its full title path and outcome
    - **asserts —** node's reporter JSONL (`readNodeTestReport`), bun junit (`readBunJunitReport`) and vitest json (`readVitestJsonReport`) each yield one row per leaf test, carrying its full title path and outcome; a skip or a todo never reads as passed or failed, though node reports a skip as `test:pass` and a failing todo as `test:fail`; suites are containers, never rows; a duplicate title stays two rows; a load failure or an early exit leaves node a single file-level row and vitest a file row; an unnamed vitest status reads `other`; and `nodeTestReporterArgs` names `spec` to stdout beside the spine's reporter.
    - **covers —** `packages/orchestrator/src/proof/per-test-report.ts`, `packages/orchestrator/src/proof/per-test-reporter.mjs`
    - **proven by —** `packages/orchestrator/src/proof/per-test-report.test.ts`, over reports captured 2026-09-15 on Node 24.15.0, Bun 1.4.0 and vitest 3.2.6 (session-authored; pending the capability's normal red→green proof)
14. **`per-test-report-rides-the-observation`** — a resolver's per-test report is cleared before the spawn and read after, and the observation carries what the run wrote
    - **asserts —** a report that survives the clear refuses the observation without spawning; a stale report never reads as this run's; what the run wrote rides on the observation as `perTest`, red and green, without changing its `result` or its `originalProcessResult`; and a resolver with no `perTestReport` source yields no `perTest`.
    - **covers —** `ShellTestExecutor.run` and `ShellTestResolver.perTestReport` (`packages/orchestrator/src/shell-test-executor.ts`); `perTestReportFile` (`packages/orchestrator/src/proof/per-test-report.ts`)
    - **proven by —** `packages/orchestrator/src/shell-test-executor.per-test.test.ts`, and the report-file cases in `packages/orchestrator/src/proof/per-test-report.test.ts` (session-authored; pending the capability's normal red→green proof)
15. **`timeout-stops-owned-process-scope`** — a timed-out `runShellCommand` targets only the still-live root's owned POSIX process group or taskkill-reachable Windows tree, reports undelivered termination, and never treats an observed-exited root's number as ownership
    - **asserts —** `runShellCommand` spawns rather than `execFile`s. A native ready wrapper/child/grandchild fixture proves same-scope force-stop and partial-output retention; that fixture deliberately keeps every descendant in scope, while detached/setsid descendants are excluded from the contract rather than claimed as proof. A deterministic Windows seam and a native POSIX leader-exit case prove that an observed-exited root is not signalled and that the observation still settles; the live-root Windows path documents, but cannot test away, its check-to-taskkill race. Refused or throwing live-root termination rejects with structured `ERR_CHILD_PROCESS_TREE_TERMINATION` evidence after natural close or bounded close/unref. Timeout owns any later max-buffer/close event, while a pre-timeout overflow wins, makes exactly one stop attempt, and clears the deadline. The unchanged 64 MiB byte ceiling applies independently per stream; structured `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` errors retain their stream, byte limit, stdout, and stderr without claiming the command never ran. Delivered and already-exited-root timeouts carry `code: null`, transported by `ShellTestExecutor` as `originalProcessResult.exitCode: null`; in-budget exit 0 and explicit non-zero exits retain exact streams and numeric codes; ENOENT remains a distinct command-never-ran rejection.
    - **covers —** `runShellCommand`, `runShellCommandWithRuntime`, `terminateProcessTree`, and `SHELL_COMMAND_MAX_BUFFER_BYTES` in `packages/orchestrator/src/shell-test-executor.ts`
    - **proven by —** the ten cases in `packages/orchestrator/src/shell-test-executor.test.ts` whose static titles begin `timeout-stops-owned-process-scope: `: timeout transport, the native same-scope tree, Windows and POSIX exited-root cases, undelivered and throwing termination, numeric controls, byte-accurate stdout/stderr ceilings, and first-event ordering. The two cases titled `ShellTestExecutor: a genuine spawn failure (ENOENT) rejects, not a silent green` and `runShellCommand rejects on a genuine spawn failure (the command never ran)` pin the distinct spawn-failure rejection (session-authored; pending the capability's normal red→green proof)
