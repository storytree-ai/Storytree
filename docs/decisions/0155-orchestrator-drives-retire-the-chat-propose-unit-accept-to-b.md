---
status: accepted
decided: 2026-07-04
amends: [108, 133]
load_bearing: true
---
# ADR-0155: Orchestrator drives; retire the chat propose_unit / accept-to-Build affordance

## Status

accepted (2026-07-04) — decided/directed by the owner in conversation on 2026-07-04, immediately after
the desktop-orchestrator full-autonomy arc (ADR-0151 unbounded the session, ADR-0152 gave the chat the
merge ceremony). Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Owner steer, verbatim: *"this build button should be removed from the session orchestrator… if I tell
it to drive something then it should drive that without needing my attention to click a button again."*

## Context

The desktop chat IS the session-orchestrator (ADR-0030 / ADR-0119). Under ADR-0108 d.3 the chat used a
**propose → accept → dispatch** handshake to build: the agent called a read-only `propose_unit` MCP tool,
which surfaced a `proposedUnitId` on the stream's `done` frame; the ChatPanel rendered an explicit
**Build** button under that reply; clicking it POSTed to a distinct `/api/chat/accept` route (ADR-0133 d.3,
accept-provenance) that dispatched a real, subscription-billed `--real` build. That handshake was the
ONLY chat→build bridge when it was designed — the orchestrator had no way to act on its own.

That is no longer true. ADR-0137 (Phase 3) gave the chat orchestrator claim-gated **spawn** tools
(`spawn_story_author` / `spawn_builder`) and ADR-0152 gave it the **landing** tools (`run_gate` /
`open_landing_pr`). The orchestrator can now drive a unit red→green and run the merge ceremony itself,
streaming its spawn/trace frames into the same transcript. Against that surface the accept-to-Build
button is vestigial friction: the owner asks the orchestrator to drive, and it hands back a button to
click instead of driving. It also reads as an *unexpected* billed action — a single click launches a
`--real` build that opens an auto-merging PR — surfaced during the 2026-07-04 desktop UAT.

This is distinct from the **story detail panel's** Build/Adopt affordance (`BuildSection.tsx`, ADR-0090 /
ADR-0094 / ADR-0136) — a deliberate map-driven control the owner keeps. This ADR touches ONLY the chat
session-orchestrator surface.

## Decision

The session-orchestrator **drives; it does not propose a unit for a human to accept**. Concretely:

1. **Remove the `propose_unit` tool** and the `proposedUnitId` result field from
   `runHeadlessOrchestrator` (`@storytree/agent`). The chat still carries `tools: []` (no Write/Edit/Bash,
   ADR-0137 d.1); it acts through its spawn (ADR-0137) + landing (ADR-0152) tools. When asked to drive,
   it drives; there is no propose-and-wait half-state.
2. **Drop `proposedUnitId` from the stream contract** — `ChatStreamDoneEvent` (`@storytree/drive`) and the
   SSE `done` frame no longer carry it.
3. **Remove the accept-to-Build affordance** from `ChatPanel.tsx` and the `api.acceptBuild` seam
   (`@storytree/studio`) — no Build button, no chat-scoped build-progress poll. The drive's progress
   streams into the transcript as spawn/trace frames.
4. **Remove the desktop `/api/chat/accept` route** (`accept-dispatch.ts` + its wiring in
   `electron/backend-entry.ts`). The story detail panel's build route (`/api/build`) is UNCHANGED — the
   panel's Build/Adopt buttons keep working.

This UPHOLDS the spine-signs / CI-lands invariants unchanged (ADR-0020 / ADR-0091 / ADR-0022): the
orchestrator's landing tools observe the gate and open a NON-DRAFT PR; the spine signs verdicts
out-of-band; CI re-proves before trunk. Nothing about who signs or lands changes — only the trigger
does (the orchestrator's own drive, not a human accept-click).

The `chat-drive-bridge` capabilities that built the retired handshake (`proposed-unit-signal`,
`proposal-id-threading`, `chat-build-dispatch`, `accept-to-land-affordance`) and
`desktop-build-mount/desktop-accept-dispatch` are **retired** with this ADR as their deciding record.

## Consequences

**Good.** The desktop orchestrator behaves as the owner expects: "drive X" drives X, no button. One
fewer surprise billed action from a single click. The chat surface is simpler (no build-poll state, no
accept route). The chat→build path is now ONE mechanism (the orchestrator's spawn+landing tools), not
two (autonomous drive AND a legacy accept-dispatch that duplicated the worker call).

**Cost / risk.** The non-spoofable "human explicitly accepts THIS unit before any spend" gate
(ADR-0108 d.3) is gone for the chat surface. The owner accepted this as part of the full-autonomy arc
("if it really does hang, I'll know about it, worst case it burns through my subscription", ADR-0151):
the human still watches the session, the spine still signs, CI still re-proves, and a runaway is bounded
by the inner-loop turn brakes (ADR-0130, unchanged for the spawned leaf). The story detail panel remains
the explicit-click path for anyone who wants one.

**Curation.** ADR-0108 d.3 and ADR-0133 d.3 are amended (their propose/accept clauses retired, bodies
kept as history). The `chat-drive-bridge` story and the `desktop-accept-dispatch` capability retire.

## References

- Amends ADR-0108 (d.3 propose_unit / accept-to-land gate) and ADR-0133 (d.3 desktop accept-dispatch /
  accept-provenance route).
- Builds on ADR-0137 (chat spawn surface) + ADR-0152 (chat landing surface) — the drive mechanism that
  makes propose/accept redundant — and ADR-0151 (unbounded session).
- Upholds ADR-0020 / ADR-0091 (spine sole signer) and ADR-0022 (CI sole lander).
- Distinct from ADR-0090 / ADR-0094 / ADR-0136 (the story-panel Build/Adopt affordance — kept).
- Code: `packages/agent/src/headless-orchestrator.ts`, `packages/drive/src/chat-stream.ts`,
  `apps/studio/src/components/ChatPanel.tsx`, `apps/studio/src/api.ts`,
  `apps/desktop/electron/backend-entry.ts` (removed `apps/desktop/src/backend/accept-dispatch.ts`).
