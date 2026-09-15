---
id: "codex-bound-suspends-during-feedback"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Suspend the Codex spawn bound while the spine runs a feedback command"
outcome: "The leaf spawn's bound can be suspended while the spine runs a feedback command and resumes with its remaining time, so only the leaf's own time counts against it."
status: proposed
proof_mode: contract-test
depends_on: []
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-bound-suspend.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-author.ts"]
  real:
    testFile: "packages/agent/src/codex-bound-suspend.test.ts"
    sourceFile: "packages/agent/src/codex-author.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-bound-suspend.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-author.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
---

# Suspend the Codex spawn bound while the spine runs a feedback command

**Outcome —** The leaf spawn's bound can be suspended while the spine runs a feedback command and
resumes with its remaining time, so only the leaf's own time counts against it.

## Proof walkthrough

Every leaf below is a stand-in: `process.execPath`, named by `STORYTREE_CODEX_EXECUTABLE`, running a
short `-e` script, spawned by `runPinnedCodexCli` exactly as the existing bound tests spawn one.

1. Start a leaf that runs for about two seconds, with a 30 000 ms bound, a bound control, and an
   injected `CodexBoundClock` that records every `setTimeout` and `clearTimeout` and whose time the
   test advances by hand. Advance the clock 10 000 ms and call `suspend()`: the armed timer is
   released. Call `suspend()` again: nothing further is released.
2. Advance the clock 40 000 ms and call `resume()`: one timer is armed, for 20 000 ms, because the
   forty seconds spent suspended do not count. Call `resume()` again: nothing further is armed.
3. Call `suspend()` and let the leaf exit on its own. The run settles with the leaf's own exit code and
   output and no `timedOut`; a `resume()` after it settles arms nothing, and no armed timer is left
   unreleased.
4. Start a leaf that would run for thirty seconds, with a 400 ms bound on the system clock. Suspend it
   and resume it once before the deadline: it is still killed, and reports `timedOut: true`.
5. Run a command carrying no control through a recording clock: exactly one `setTimeout` and one
   `clearTimeout`, as today.

The observable is the recorded clock calls, and the spawn's own result.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-bound-suspends-during-feedback.md`: the `## Proof walkthrough` and every clause
of the assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an index,
never the acceptance.

**The adapter is dormant.** Nothing in `packages/orchestrator/src/resolve-prove-spec.ts` passes
feedback commands to the Codex leaf yet, so no build behaviour changes when this lands. Leave that file
alone. `packages/agent/src/sdk-author.ts` is out of scope and must not be edited.

**The change is one function and two types.** `runPinnedCodexCli` in
`packages/agent/src/codex-author.ts` learns to suspend and resume its bound. `CodexCommand` gains one
optional field carrying the control, and `CodexBoundClock` gains whatever the remaining-time arithmetic
needs. `CodexPhaseAuthor` stays as it is.

- **Everything new is optional.** `recordingClock` and `heldClock` in `codex-author.test.ts` declare
  only `setTimeout` and `clearTimeout` under `satisfies CodexBoundClock`, and the proof's
  `@storytree/agent` typecheck covers that file, which is outside this contract's write scope. A new
  required clock member, such as a time source, fails that typecheck; add it as an optional member
  that defaults to the system clock.
- **No control, no change.** A command with no control makes exactly one `setTimeout` and one
  `clearTimeout` on its clock, which the existing test pins as `["set 30000", "clear"]`.
- **Remaining time is leaf time.** `resume()` arms the time that was left when `suspend()` released
  the timer, across any number of cycles. A `resume()` after the child settled arms nothing: a timer
  left armed keeps a finished spawn reachable, which is the reason `CodexBoundClock` is injectable at
  all.
- **The red must be an assertion.** This contract edits a file that already exists, so the spine
  declares an assertion red and measures its kind by counting the assertions that ran. A test that
  imports by name a value `codex-author.ts` does not export yet never loads, runs no assertion, and is
  refused at CONFIRM_RED as the wrong red. Reach the new behaviour through `runPinnedCodexCli` and
  `CodexCommand`, which already exist; a type-only import is erased and costs nothing.

**Tests.** Spawn stand-in leaves as the existing bound tests do, and bound every await as `within`
does in `codex-author.test.ts`. `packages/agent` is inside the mutation rung, and CI's Linux run once
found a survivor that only Windows had killed. So a test names every operator-facing string by its
LITERAL value, never through an exported constant: write `STORYTREE_CODEX_EXECUTABLE` and
`STORYTREE_CODEX_TIMEOUT_MS`, not the `CODEX_EXECUTABLE_ENV` and `CODEX_TIMEOUT_ENV` the older file
imports. Every test title starts with the contract-line id and a colon —
`test("suspended-bound-counts-only-leaf-time: …")` — because that prefix is how coverage binds a test to
this contract. Use `node:test` and `node:assert/strict`: the spine's focused proof runs this file under
Node, and `pnpm --filter @storytree/agent test` runs it under Bun, so it must pass under both.

## Contracts (1)

1. **`suspended-bound-counts-only-leaf-time`** — the spawn bound pauses while the spine works, and only the leaf's own time counts against it.
   - **asserts —** `runPinnedCodexCli` given a command carrying a bound control, observed through an
     injected `CodexBoundClock`, releases the armed timer on `suspend()` and re-arms it on `resume()`
     with exactly the remaining time, and a repeated `suspend()` or `resume()` changes nothing; time
     spent suspended never counts, so suspending before the deadline and resuming later still leaves
     the full remainder; a leaf that exceeds its bound in leaf time is still killed and reports
     `timedOut`; a child that exits while the bound is suspended settles normally with nothing left
     armed, a later `resume()` included; and a command carrying no control behaves exactly as today,
     with the existing bound tests in `codex-author.test.ts` still green.
   - **covers —** `packages/agent/src/codex-author.ts` (`runPinnedCodexCli`, `CodexCommand`, `CodexBoundClock`).
   - **proven by —** a new `packages/agent/src/codex-bound-suspend.test.ts` through the default focused
     REAL proof, with the `@storytree/agent` typecheck as the pre-promotion wall.
