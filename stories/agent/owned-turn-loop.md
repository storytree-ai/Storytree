---
id: "owned-turn-loop"
tier: capability
story: agent
title: "A model-tool turn runs to a natural stop and a step fails closed, never forging success"
outcome: "The owned loop runs a model↔tool turn to a natural stop and a step fails closed: a malformed or wrong-shape result retries, then HALTS — never a forged success."
status: mapped
proof_mode: integration-test
depends_on: [model-runtime-seam, leaf-tool-surface]
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
