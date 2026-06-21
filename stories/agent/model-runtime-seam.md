---
id: "model-runtime-seam"
tier: capability
story: agent
title: "One swappable Model seam + one typed model-event vocabulary, with the model SDK import isolated"
outcome: "The owned loop calls any model through one swappable seam and speaks one typed model-event vocabulary, with every @anthropic-ai/sdk import isolated to a single file."
status: mapped
proof_mode: integration-test
depends_on: []
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
