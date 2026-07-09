---
status: accepted
decided: 2026-07-06
amends: [108]
---
# ADR-0170: Chat continuity via SDK session resume

## Status

accepted (2026-07-06) — decided/directed by the owner in conversation on 2026-07-06. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0108 — the chat surface gains conversational continuity across sends; the one-intent-one-session shape of d.1/d.2 is extended, not overturned. The single-session guard (d.6) is unchanged: sequential resumed runs each terminate before the next starts, so the in-flight brake never sees two at once.

> **Amended by [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)**
> — the cross-turn continuity mechanism (the `resume` / `sessionId` thread through
> `headless-orchestrator` → `orchestrate` / `chat-stream` → `chat-sse-mount` → `ChatPanel`) is
> **re-aimed as the future `app-guide` help agent's conversation memory** across a multi-step setup,
> not deleted: the in-app *interactive* work-orchestrator it originally served retires under ADR-0174,
> but the resume machinery is repurposed wholesale.

## Context

ADR-0163 dogfood gap D (owner hit this live, 2026-07-06): the desktop in-app orchestrator chat RENDERS a multi-turn transcript (the multi-turn-transcript scrollback), but each send spawned a brand-new SDK session with no memory of prior exchanges. The owner asked a question (answered fine over 6 turns), then said "can you proceed to reauthor it?" — and the orchestrator honestly replied it had lost all context, because it genuinely had. The transcript was UI scrollback only; the continuity it visually promised did not exist.

Two candidate designs:

1. **SDK session resume** — the Claude Agent SDK's `Options.resume` takes a prior session id and loads that session's full conversation history (assistant turns, tool calls and tool results included). The result message of every run carries its `session_id`, so the handle is already surfaced; the wire cost is one opaque string each way.
2. **History replay** — thread the settled transcript (prompt + proposal pairs) down from the panel and prepend it into the user prompt. Simple, but LOSSY (no tool-call/tool-result memory — the orchestrator would remember what it *said* but not what it *did* or *read*), and the prompt grows with every exchange.

The dogfood failure that motivated this ("proceed to reauthor it") needs exactly the memory replay drops: the orientation tool results and spawn context of the prior exchange. Both designs are equally offline-testable through the injected `queryFn` seam (capture the SDK options, assert `resume`; script a result carrying `session_id`).

## Decision

**SDK session resume (design 1).** The continuity handle is threaded through the whole chain, additively and §7-scale-down-mirrored at every layer (absent → byte-identical to before):

- `runHeadlessOrchestrator` (packages/agent) accepts `resume?: string` → handed to the SDK as `Options.resume` (no key at all when absent), and surfaces the result message's `session_id` as `HeadlessOrchestratorResult.sessionId` on success.
- `orchestrate` and `startChatStream` (packages/drive) thread `resume` down; the terminal `done` event carries `sessionId`.
- The desktop SSE mount (apps/desktop `chat-sse-mount`) parses an optional `resume` string from the POST body — **fail-closed**: a present-but-malformed value is a 400, never a silent fresh session (a silent restart is exactly the gap-D bug).
- The panel (apps/studio `ChatPanel`) holds the last settled `done` frame's `sessionId` and threads it back on each send; a `done` without a `sessionId` keeps the last known handle. **The reset button ("new chat") is the explicit context boundary**: it drops the handle, so reset = fresh session, anything else = continuity.

## Consequences

- The chat transcript is now real continuity, not scrollback theater: follow-up sends remember prior exchanges including tool activity (gap D closed; cite ADR-0163).
- The continuity handle lives client-side (the panel), keeping the backend stateless per-request — no hidden server-side session affinity, and the reset semantics fall out for free.
- Resume depends on SDK session persistence (on by default, `~/.claude/projects/`) and on the sidecar keeping a stable cwd across sends; a resume of an evicted/foreign session id fails as a typed terminal `error` event — visible, not silent.
- The §7 scale-down mirrors hold: with no `resume` in the body, every layer's SDK options are byte-identical to the pre-ADR-0170 shape (pinned by tests at each layer).
- History replay stays available as a fallback design if SDK persistence ever becomes unavailable in a deployment shape; nothing in the wire contract (an opaque `resume` string + a `sessionId` on `done`) would need to change.

## References

- ADR-0108 (the chat surface this amends), ADR-0163 (dogfood practice — this is gap D), ADR-0137 (spawn tools), ADR-0151 (unbounded turns), ADR-0152 (landing tools), ADR-0155 (propose_unit retired).
- Code: packages/agent/src/headless-orchestrator.ts · packages/drive/src/orchestrate.ts · packages/drive/src/chat-stream.ts · apps/desktop/src/backend/chat-sse-mount.ts · apps/studio/src/api.ts · apps/studio/src/components/ChatPanel.tsx.
