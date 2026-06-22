---
id: "model-runtime-seam"
tier: capability
story: agent
title: "One swappable Model seam + one typed model-event vocabulary, with the model SDK import isolated"
outcome: "The owned loop calls any model through one swappable seam and speaks one typed model-event vocabulary, with every @anthropic-ai/sdk import isolated to a single file."
status: mapped
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (ADR-0057 §3 expansion C): the
# leaf authors a regression test that FAILS against current behaviour, then edits the EXISTING
# packages/agent/src/model-events.ts. The red is genuine and runtime: the `StopReason` enum
# (`z.enum(["end_turn","tool_use","max_tokens","stop_sequence"])`) does NOT include the Anthropic
# Messages API's real `"refusal"` stop reason, so `StopReason.parse("refusal")` THROWS at HEAD until
# IMPLEMENT widens the enum. `install: true` + a typecheck wall because model-events.ts imports `zod`
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
    testFile: "packages/agent/src/stop-reason-refusal.test.ts"
    sourceFile: "packages/agent/src/model-events.ts"
    scope:
      testGlobs: ["packages/agent/src/stop-reason-refusal.test.ts"]
      sourceGlobs: ["packages/agent/src/model-events.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
---

# One swappable Model seam + one typed model-event vocabulary

**Outcome —** The owned loop calls any model through one swappable seam and speaks one typed
model-event vocabulary, with every `@anthropic-ai/sdk` import isolated to a single file.

> **Proof status (honest) — `mapped`.** `model.test.ts` (4) + `model-events.test.ts` (7) pass
> offline. The `Model` seam (`model.ts`) is the one swappable model call (`createMessage`);
> `ScriptedModel` proves the loop runs with ZERO live calls and a LOUD error past the scripted end;
> `AnthropicModel` is the only `@anthropic-ai/sdk` import site (ADR-0004/0011), keeping the live SDK
> behind the seam. The model-event vocabulary (`model-events.ts` — `ContentBlock` / `ToolUseBlock` /
> `ToolResultBlock` / `isTextBlock` / `isToolUseBlock` / `parseContentBlock`) is the published `port`
> the orchestrator consumes across the organism boundary (ADR-0068 step 6). No `healthy` — no signed
> verdict (ADR-0020).

This is the bottom seam of the leaf organism. It does two jobs, both root-level (it imports no other
in-story capability): it (a) defines the **one model call** the owned loop is built on, so the model
runtime is swappable + mockable, and (b) owns the **typed event vocabulary** every other capability
(and the orchestrator) speaks. `model.ts` imports the vocabulary from `model-events.ts`
(`ContentBlock`, `parseContentBlock`); `model-events.ts` imports nothing — the true root.

## Proof

Integration-proven against real in-story collaborators (ADR-0010 §2): `ScriptedModel` drives the
turn loop; `parseContentBlock` round-trips the API block shapes the live model returns. Live SDK
behaviour (`AnthropicModel.createMessage` against the real API) is live-attested via the drive's
dogfood, never a standing test here.

## Guidance

The brownfield slice that earns this capability a signed verdict (the next bootstrap rung toward
`healthy`): WIDEN the model-event vocabulary's `StopReason` enum to recognise the Anthropic Messages
API's real `"refusal"` stop reason. This is one additive value on an existing `z.enum`, additive-only.

- **The existing source —** `packages/agent/src/model-events.ts` declares
  `export const StopReason = z.enum(["end_turn", "tool_use", "max_tokens", "stop_sequence"])`. The
  Messages API returns a `"refusal"` `stop_reason` when the model declines for safety, and this enum
  does not list it — so the typed vocabulary that is supposed to be LOUD-on-drift would itself REJECT
  a real, well-formed stop reason the live model can send.
- **The new test —** `packages/agent/src/stop-reason-refusal.test.ts` (`node:test` + `node:assert/strict`,
  the package convention). Import `{ StopReason } from "./model-events.js"`.
- **The RED the spine observes (before IMPLEMENT) —** assert `StopReason.parse("refusal")` returns
  `"refusal"`. Against the unedited enum that value is unrecognised, so `.parse("refusal")` THROWS a
  `ZodError` — a genuine runtime red against CURRENT behaviour (not a missing symbol; the symbol
  exists, the value is rejected). Also assert in the SAME test that an existing value still parses
  (`StopReason.parse("end_turn") === "end_turn"`) and that a bogus value still throws
  (`assert.throws(() => StopReason.parse("nope"))`) — these two prove the enum stays HONEST: it is
  WIDENED to admit one real value, never relaxed into accepting anything.
- **The GREEN edit —** add `"refusal"` to the `z.enum([...])` array in `model-events.ts`. That is the
  entire source change. After it, `StopReason.parse("refusal")` succeeds, the existing-value and
  bogus-value assertions still hold, and the package suite + typecheck stay green.

Rules:

- **Touch ONLY the enum array.** Do not relax `.strict()` anywhere, do not alter `parseContentBlock`
  or any block schema, do not reorder the existing members. One new string literal, that's all.
- The `editsExisting` brief is genuine: read the existing enum, author a test that fails against it,
  then edit it — the AUTHOR_TEST wall keeps you to the test file, and CONFIRM_RED observes the new
  test failing against the UNCHANGED enum before IMPLEMENT widens it.
