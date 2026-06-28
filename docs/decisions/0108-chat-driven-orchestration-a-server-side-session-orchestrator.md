---
status: accepted
decided: 2026-06-25
amends: [30]
load_bearing: true
---
# ADR-0108: Chat-driven orchestration — a server-side session-orchestrator runtime, supervised and landed by the human

## Status

accepted — owner-decided 2026-06-25, ratified after review 2026-06-26, in session with the orchestrator (the stated
end goal: "a chat UI to talk to an agent"). The SHAPE is settled here; the BUILD is **phased** so the
full loop is delivered in increments and never one-shot in a single session (owner's call). Two scope
calls are pinned: **whole-loop authority** from the first landed increment (the agent may orient →
decide → decompose → build → curate → open the landing PR), and **one orchestration session at a
time** to start. Per-session budget controls are deferred (owner: not a day-one concern). The chat
surface's APPEARANCE is operator-attested under ADR-0070 when built.

> **Amended by [ADR-0132](0132-the-desktop-chat-is-orchestrator-first-on-the-smartest-model.md)**
> (accepted, 2026-06-28) — the Phase-2 chat surface is settled: orchestrator-first (no concierge) on the
> smartest model (Opus), with a `storytree-guide` help specialist; §7 is reconciled (prose streaming is
> the conversational rendering, the phase/tool trail the observability layer — "not the raw token stream"
> amended accordingly); and the **deferred per-session budget** is resolved no-ceiling (the turn cap is the
> brake, opt-in budget survives). The shape and phasing here stand.

## Context

Today the session-orchestrator is a *generated prompt* (ADR-0051) that a human-run Claude Code session
embodies at a terminal: the human is the outer loop (ADR-0030), the deterministic spine drives the
prove-it-gate, the SDK leaf authors inside each phase. ADR-0090 moved the build TRIGGER into the
studio — a thin client posts a build intent, a server-process WORKER (the single agent boundary,
ADR-0004) drives the build, the spine signs (ADR-0091). What ADR-0090 deliberately did NOT build is a
conversational surface: it drives builds from the UI, not a dialogue with an orchestrator.

The owner's end goal is that dialogue — to talk to an orchestrator agent in the studio that runs the
whole session loop (orient → decide the unit → decompose into provable units → route them to the inner
loop → gate → librarian-curator pass → land → escalate), with the human supervising and approving
rather than typing every step at a terminal.

The piece that does not exist yet: a **headless runtime that RUNS the session-orchestrator loop** with
the storytree tool surface wired (tree / notice-board / library queries, the build worker, the gate,
PR/land), driven by chat and supervised by a human. We have the SDK *leaf* executor
(`packages/agent`) and the build *worker* (`apps/studio/server/buildWorker.ts`) — but nothing that
embodies the *orchestrator* headlessly. That runtime is the keystone and the bulk of the work.

This fulfils ADR-0008 ("UI drives agents — approval-gated trunk"), which named this direction and left
the surface unbuilt; it builds on ADR-0090's worker and ADR-0091's proof-off-tether sanction; and it
amends ADR-0030 in degree (decision 4).

## Decision

1. **A server-side orchestrator-agent runtime embodies the loop.** It runs on the ADR-0090 worker (the
   single server-side agent boundary, ADR-0004). The chat UI is a THIN client — it sends messages and
   renders a live stream; it never imports the agent or holds a model-invocation path
   (ADR-0004 / ADR-0090 d.2).

2. **One source of truth for the loop.** The runtime runs the SAME generated `session-orchestrator`
   library agent (ADR-0051) the terminal session uses today, executed headlessly. The studio does not
   fork the loop's definition — edit the library artifact, regenerate, and both the terminal and the
   studio runtime move together.

3. **Whole-loop authority, with the human gate permanent.** The agent may orient (query the three
   surfaces), decide and decompose the unit, route provable units to the inner loop / build worker, run
   the prove-it-gate, spawn the librarian-curator pass (ADR-0095), and open the landing PR.
   **Accept-to-land remains a human action** — an explicit, non-spoofable approval affordance in the UI
   (a button / confirm, never a free-text "yes" parsed by the agent). The agent proposes and drives up
   to the trunk; the human lands. This is a permanent control, not a phase the build graduates out of.

4. **Amends ADR-0030 in degree, not in principle.** ADR-0030's "the human owns the outer loop" assumed
   a human-driven terminal session *is* the loop. Here a server-side agent runs the loop's mechanics and
   the human owns it by **supervision + the accept-to-land gate**. "Human owns the outer loop" stays
   true; *who executes the mechanics* changes. ADR-0008's approval-gated trunk is preserved by decision 3.

5. **Proof integrity is unchanged (ADR-0091).** The orchestrator agent DRIVES the spine, which observes
   RED then GREEN from real exit codes and SIGNS; the agent holds no signing key and no verdict is ever
   handed in. Its reach is the write-scoped filesystem plus the same public build / gate / PR entries the
   CLI uses — never the verdict store directly. CI independently re-proves green before the trunk
   (ADR-0022). The damage ceiling stays a briefly-wrong hue, corrected by CI — the ADR-0091 argument
   carries over verbatim.

6. **One orchestration session at a time, to start.** The runtime serves a single live orchestration at
   a time (mirroring the worker's single-build guard and ADR-0009's still-deferred claims). It declares
   presence on the notice board (ADR-0033) like any session. Multi-session concurrency is deferred to the
   hosted phase and its own decision.

7. **Reuses, does not rebuild.** Notice-board presence (ADR-0033), the build worker and its routing
   (ADR-0090), the prove-it-gate (ADR-0020), and CI-lands-the-trunk (ADR-0022). The transcript is a live
   **stream** (Server-Sent Events) at the granularity of the **coarse phase trail + tool calls** — not
   the raw token stream (owner's observability call) — richer than the build-trigger's coarse poll but
   not a model log.

8. **Appearance is operator-attested (ADR-0070).** The chat surface's feel — does it read well, does the
   stream feel alive, is the approval gate legible — is the owner's two-stage visual verdict; the loop
   *mechanics* (intent accepted, run reaches a signed verdict, PR opened, land gated) are
   machine-witnessed. Units stay `proposed` until the owner attests.

## Phased build (slow growth — full loop, never one-shot)

The target is the whole loop; the **construction** is staged so each phase is an isolatable, provable
increment that lands on its own. No phase one-shots the runtime.

- **Phase 1 — the headless orchestrator runtime (the keystone).** Stand up the server-side runtime that
  runs the `session-orchestrator` library agent with the storytree read tools wired (tree / notice-board
  / library queries). Driven by a programmatic intent (no chat UI yet); proves it can ORIENT on the real
  three surfaces and PROPOSE a unit. Single session at a time. This is the largest unit and everything
  else hangs off it.
- **Phase 2 — the chat surface.** The studio chat panel: send a message, render the live SSE transcript
  (coarse phase trail + tool calls). Wired to the runtime over the gated API (intent in, stream out). The
  frontend imports no agent (ADR-0004). Appearance operator-attested (ADR-0070).
- **Phase 3 — drive authority (build + gate).** The agent routes provable units to the build worker
  (ADR-0090) and runs the prove-it-gate (ADR-0020) — connecting the conversation to real, spine-signed
  builds.
- **Phase 4 — land with the human gate.** The agent runs the librarian-curator pass (ADR-0095) and opens
  the landing PR (ADR-0022 / ADR-0031); accept-to-land is the explicit approval affordance (decision 3).
  The whole loop closes — orient → … → land — supervised, on the operator's own machine.
- **Phase 5 — hosted for the circle (distant; defers to ADR-0090 Phase 3 + ADR-0109).** The same runtime
  hosted, IAP-gated, BYO-credential via the desktop client (ADR-0109). Multi-session concurrency and its
  isolation are this phase's, not assumed earlier.

Each phase is a candidate story (story-author decomposes the accepted ADR); Phases 1–4 are the local
loop, Phase 5 is hosting.

## Consequences

**Good**
- The owner drives the whole session loop conversationally from a signed-in surface, instead of typing
  each step at a terminal — the stated end goal.
- One loop definition (the `session-orchestrator` library agent) across terminal and studio: no drift,
  edit-once.
- Proof and land integrity are untouched (ADR-0091 + ADR-0022); the human still owns accept-to-land.
- The ADR-0090 worker investment is reused; the chat surface is the new piece, not a new backend.

**Bad / accepted costs**
- The server-side orchestrator runtime is the biggest new surface: it runs agent-authored
  *orchestration* (decompose, spawn subagents, open PRs), so containment, a minimal-privilege service
  account, and locked egress matter even more than for the build worker.
- "Whole-loop authority from day one" is ambitious; the phased build keeps each increment provable, but
  Phase 1 is a substantial unit.
- Spend is owner-funded and a whole loop can run long; with budget controls deferred (owner's call), the
  approval gate and the single-session guard are the load-bearing brakes until budget is revisited.

**Neutral**
- Solo / terminal orchestration stays fully valid; this adds a chat surface, it does not retire the
  terminal loop.
- Per-session budget controls are deferred, not foreclosed — a natural follow-on when spend or the
  hosted phase makes them matter.

## References

- [ADR-0008](0008-ui-drives-agents-approvals.md) — UI drives agents, approval-gated trunk; the
  direction this fulfils.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — human owns the outer loop; **amended in degree** (a
  server-side agent runs the mechanics; the human owns it by supervision + the land gate).
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — thin client +
  server-side worker; this builds the conversational surface on that worker.
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the
  proof-off-tether sanction; its integrity argument carries over.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; the worker is that
  boundary, the chat UI never crosses it.
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the agent renderer;
  the runtime runs the generated `session-orchestrator` agent.
- [ADR-0033](0033-session-presence-notice-board.md) — session presence; the orchestration declares it.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate the agent drives.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — CI re-proves and lands the trunk.
- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) — the librarian-curator
  pass before the merge ceremony.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the chat surface's
  appearance is operator-attested.
- [ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md) — the desktop
  credential client that brokers tokens to the hosted runtime (Phase 5).
