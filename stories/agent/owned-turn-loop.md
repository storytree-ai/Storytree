---
id: "owned-turn-loop"
tier: capability
story: agent
title: "A model-tool turn runs to a natural stop and a step fails closed, never forging success"
outcome: "The owned loop runs a model↔tool turn to a natural stop and a step fails closed: a malformed or wrong-shape result retries, then HALTS — never a forged success."
status: mapped
proof_mode: integration-test
depends_on: [model-runtime-seam, leaf-tool-surface]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (ADR-0057 §3 expansion C): the
# leaf authors a regression test that FAILS against current behaviour, then edits the EXISTING
# packages/agent/src/run-turn.ts. The red is genuine and runtime: `TurnResult` returns
# `finalText`/`blocks`/`transcript`/`turns` but NOT the terminating `stopReason`, so a consumer cannot
# tell a clean `end_turn` from a `max_tokens` truncation. A test driving `runTurn` with a
# `ScriptedModel` (stopReason "max_tokens", a terminal non-tool_use stop) and asserting
# `result.stopReason === "max_tokens"` reads `undefined` at HEAD (no such field) until IMPLEMENT adds
# it. `install: true` + a typecheck wall because run-turn.ts is part of a package that imports `zod`
# (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). Single
# LITERAL source file (no `*`), so the default node:test proof on the one test file is legal — no
# `proofCommand` (the edits-existing single-file exemption, ADR-0057 §3 / ADR-0087).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/turn-stop-reason.test.ts"
    sourceFile: "packages/agent/src/run-turn.ts"
    scope:
      testGlobs: ["packages/agent/src/turn-stop-reason.test.ts"]
      sourceGlobs: ["packages/agent/src/run-turn.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
---

# The owned turn loop — natural-stop turns, fail-closed steps

**Outcome —** The owned loop runs a model↔tool turn to a natural stop and a step fails closed: a
malformed or wrong-shape result retries, then HALTS — never a forged success.

> **Proof status (honest) — `mapped`.** `run-turn.test.ts` (5) + `step.test.ts` (8) pass offline.
> `runTurn` (`run-turn.ts`) drives the model↔tool exchange to a natural stop with a turn cap
> (`DEFAULT_MAX_TURNS`), reading text/tool blocks via the model-event helpers. `runStep` /
> `runStepValidated` (`step.ts`) wrap a turn with fail-closed validation: malformed JSON or a
> wrong-shape result RETRIES, and exhausting retries HALTS to `ValidationFailed` — never a forged
> success. No `healthy` — no signed verdict (ADR-0020).

This capability is the owned loop's engine (ADR-0011) — the offline/deterministic executor and the
pivot-out fallback behind the `PhaseAuthor` seam. It depends by code on `model-runtime-seam`
(`run-turn.ts` + `step.ts` import `Model` / `ModelMessage` / `ModelRequest` and the model-event
helpers; `step.ts` calls `runTurn`) and on `leaf-tool-surface` (both import `ToolExecutor` — the loop
drives tool calls through it).

## Proof

Integration-proven against a real `ScriptedModel` + a real `MapToolExecutor` (ADR-0010 §2 — real
in-story collaborators, no stubs within the organism): a multi-turn exchange runs to a stop; a
malformed result retries then halts. The *halted-is-never-a-pass* property proven here is the same
invariant the spine's sequence relies on (`runSequence` in drive-machinery consumes `StepResult`).

## Guidance

The brownfield slice that earns this capability a signed verdict (the next bootstrap rung toward
`healthy`): surface the TERMINATING `stopReason` on `runTurn`'s result, so a consumer can tell a
clean `end_turn` from a `max_tokens` truncation or a `refusal` instead of being blind to WHY the turn
ended. This is one additive field on an existing interface, additive-only.

- **The existing source —** `packages/agent/src/run-turn.ts`. `runTurn` already reads
  `response.stopReason` to decide whether to loop (`if (response.stopReason === "tool_use")`) and
  returns a `TurnResult` from the terminal branch — but `TurnResult` exposes only `finalText`,
  `blocks`, `transcript`, and `turns`. The terminating stop reason the loop already has in hand is
  THROWN AWAY: a consumer holding a `TurnResult` cannot distinguish a natural `end_turn` from a
  `max_tokens` cut-off or a safety `refusal`. (`ModelResponse.stopReason` is a `StopReason` from
  `model.ts`, and `StopReason` is exported from `./model-events.js`.)
- **The new test —** `packages/agent/src/turn-stop-reason.test.ts` (`node:test` + `node:assert/strict`).
  Mirror `run-turn.test.ts`: `import { ScriptedModel } from "./model.js"`,
  `import { runTurn } from "./run-turn.js"`, and the `userText(text): ModelRequest` helper
  (`{ model: "test", messages: [{ role: "user", content: text }] }`).
- **The RED the spine observes (before IMPLEMENT) —** drive `runTurn` with a `ScriptedModel` whose
  single response is a TERMINAL, non-`tool_use` stop:
  `new ScriptedModel([{ content: [{ type: "text", text: "truncated" }], stopReason: "max_tokens" }])`.
  Because `"max_tokens"` is not `"tool_use"`, the loop returns on the first turn. Assert
  `result.stopReason === "max_tokens"`. Against the unedited source `TurnResult` has no `stopReason`
  field, so `result.stopReason` is `undefined` — a genuine runtime red against CURRENT behaviour. (Use
  `max_tokens`, NOT `tool_use`: a `tool_use` stop would make the loop try to execute tools and need an
  executor — pick a terminal stop so the turn returns cleanly.) Optionally also assert the `end_turn`
  case (`stopReason: "end_turn"` → `result.stopReason === "end_turn"`) so both a clean and a truncated
  terminal stop are pinned.
- **The GREEN edit —** in `run-turn.ts`, two additive changes to ONE file:
  1. add `StopReason` to the existing type-only import from `./model-events.js`
     (`import type { ContentBlock, StopReason, ToolResultBlock, ToolUseBlock } from "./model-events.js"`);
  2. add `stopReason: StopReason;` to the `TurnResult` interface and set it in the terminal `return`
     from the stop reason already in hand (`stopReason: response.stopReason`).

Rules:

- **Touch only `TurnResult` + the terminal return + the one import.** Do not change the loop logic,
  the `maxTurns` fail-closed throw, the tool round-trip, or `joinText`. The stop reason is already
  computed (`response.stopReason`); you are only THREADING it onto the result, not recomputing it.
- **`stopReason` is required (not optional) on `TurnResult`.** Every terminal return has a
  `response.stopReason` in scope, so the field is always populated — there is no back-compat caller of
  this internal interface to preserve as optional (unlike a persisted/serialised schema). A required
  field keeps the type honest: a `TurnResult` always knows why it stopped.
- The `editsExisting` brief is genuine: read the existing interface, author a test that fails against
  it (`stopReason` undefined), then edit it — CONFIRM_RED observes the new test failing against the
  UNCHANGED interface before IMPLEMENT adds the field.
