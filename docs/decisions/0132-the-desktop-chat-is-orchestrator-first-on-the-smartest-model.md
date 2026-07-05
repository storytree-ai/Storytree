---
status: accepted
decided: 2026-06-28
amends: [108]
load_bearing: true
---
# ADR-0132: The desktop chat is orchestrator-first on the smartest model, with a help specialist for newcomers

## Status

accepted (2026-06-28) — decided/directed by the owner in conversation on 2026-06-28, in a design session
held expressly to settle the desktop chat's orchestrator loop. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask.

## Context

ADR-0108 stood up the server-side session-orchestrator runtime, phased, and Phase 2 (the chat surface)
is built: the desktop chat panel POSTs `{ intent }` to `/api/chat`, a tsx sidecar
(`apps/desktop/electron/backend-entry.ts`) drives `startChatStream` → `orchestrate` →
`runHeadlessOrchestrator` → one SDK `query()`, and streams the session back as SSE. The renderer imports
no agent (ADR-0004); the session is read/propose only (ADR-0091).

The owner found "hello" slow versus Claude Desktop. A live trace (captured through a new `onMessage`
seam) named the tax: a ~2 s cold start (the SDK spawns a CLI subprocess per message — no warm session), a
~14.5k-token `session-orchestrator` system prompt processed every turn, and an "orientation detour" (an
unwired runner stub burned a turn and leaked `(orientation runner not configured)` into the reply). A
**scale-down landed** (PR #457): orientation tools are wired ONLY when a real runner is present (no
stub-induced turn), plus the `onMessage` trace seam and `onDelta` token streaming. "hello" dropped from
11.7 s / 3 turns to ~7 s / 1 turn, with no leaked line.

That set up the architecture question this ADR settles: should the chat **default to a fast lightweight
concierge** that escalates to the full orchestrator (the best "Claude Desktop" feel), or stay
**orchestrator-first**? The owner's call, in conversation: **"hello" was a smoke test, not the typical
flow.** The typical flow is the session-orchestrator (planning) → the inner loop — that IS the main use
case. So we do not optimise the trivial path, and we do not hide the orchestrator — the actual product —
behind a concierge for every real session. The one newcomer case worth handling well is "what is
storytree / how does it work"; answer that with a focused help specialist on the `claude-code-guide`
pattern (a read-only domain-Q&A agent the main loop delegates to), not by slowing the main flow.

Two facts from the merge window frame the rest. (1) The orchestrator now **defaults to Opus**
(`claude-opus-4-8`, PR #457) — the owner's standing directive that the orchestrator runs the smartest
model, made concrete. (2) ADR-0130 removed the inner-loop USD budget ceilings as a **phantom**
(subscription-funded billing; the SDK's list-price `total_cost_usd` is not real spend) but **explicitly
left the chat/headless orchestrator's per-session budget to ADR-0108** — yet `runHeadlessOrchestrator`
still defaults `maxBudgetUsd: 1`. A $1 phantom wall on an **Opus** session halts real work almost
immediately. That deferred question lands here.

## Decision

1. **The chat is orchestrator-first — no concierge.** The desktop chat's main flow IS the
   `session-orchestrator` (the orient → decide → decompose → route → curate → land loop ADR-0108 names),
   a single front door. We considered and **rejected** a lightweight-concierge default: "hello" latency
   is not a design target (it was a smoke test), and a concierge tier would put the orchestrator — the
   thing the owner actually wants to use — behind a door for every substantive session. The chat is the
   orchestrator; we make it lean where that costs nothing, but we do not gut it to win a trivial path.

2. **The orchestrator runs on the smartest available model (currently Opus 4.8, `claude-opus-4-8`).**
   The session-orchestrator is the highest-leverage reasoning in the system — it decomposes intent,
   routes provable units, and runs the librarian pass; it gets the best brain. Cheaper tiers are for the
   leaf executors (ADR-0030) and the help specialist (decision 3). The §7 scale-down removed the
   per-message bloat that made a capable-but-slower model painful, so Opus's latency is acceptable for a
   substantive planning session. This is a **standing decision, not a tuned default**: when a more
   capable model ships, the orchestrator moves to it.

3. **A `storytree-guide` help specialist beside the orchestrator (the `claude-code-guide` pattern).**
   For newcomer questions — "what is storytree, how does it work, what's a story vs capability vs
   contract" — a read-only Q&A agent answers from the corpus / glossary / ADRs, accurately, without
   spinning up a planning session. It is authored as a Library `agent` artifact (seed-canonical,
   ADR-0055), rendered through the existing `.claude/agents` surface (ADR-0052) so terminal sessions can
   delegate to it too, and it runs on a cheap, fast model (Haiku). In the desktop chat it is reached by
   **delegation** — registered as a subagent of the orchestrator session — the same relationship Claude
   Code has with its own help agent: the orchestrator handles planning itself and hands help-questions to
   the guide. (A lighter **front-router** that sends help-questions straight to the guide without booting
   the orchestrator was considered; delegation is chosen for simplicity and fidelity to the named
   pattern, latency being explicitly not a target. The router remains a clean follow-on if newcomer-help
   latency ever matters.)

4. **No phantom per-session USD budget on the chat orchestrator.** This resolves the per-session budget
   ADR-0108 deferred and ADR-0130 pointed back here — in the **same no-ceiling direction, for the same
   reason**: the leaf is subscription-funded (ADR-0030), so the SDK's list-price `total_cost_usd` is a
   phantom, and a $1 default ceiling on an Opus session halts real work mid-session for no real saving.
   `runHeadlessOrchestrator` **stops defaulting `maxBudgetUsd` to 1**; it passes a USD ceiling to the SDK
   only when one is explicitly threaded down. The **turn cap** (`maxTurns`, default 16) is the runaway
   brake, exactly as ADR-0130 made it for the build harness. Per-session budget control survives as an
   **opt-in** (a caller may still pass `maxBudgetUsd`), not a default wall — the door ADR-0108 left open
   for per-session controls stays open, it just isn't a phantom by default.

5. **Live orientation is operator-attested glue, not an offline contract.** At decision time
   the chat orchestrator could not read the live tree / library / notice-board: the mount forwarded no
   `OrientationRunner`, so the orientation tools fell back to a no-op stub (a conversational session over
   the rendered prompt, blind to live state). Wiring a real runner is real work, but as the
   `chat-sse-mount` story established (story-author, 2026-06-27) it has **no offline-provable
   observable** — the runner fires only through a real SDK tool-dispatch, which the scripted `queryFn`
   discipline (every offline proof here) never triggers. So it is witnessed under the desktop **Story
   UAT** (ADR-0070, leg 7), not authored as a CI contract. The boundary is resolved by constructing the
   runner **in the sidecar** (`electron/backend-entry.ts`, which already holds the live pg store) from
   `drive`/`library` read projections and injecting it down the existing `ChatSseMountDeps →
   startChatStream → orchestrate → runHeadlessOrchestrator` chain — never importing `@storytree/cli` (the
   cycle the stub exists to avoid). *(Since built exactly this way: `@storytree/drive`'s
   `createOrientationRunner` is composed in `electron/backend-entry.ts` and injected down the mount
   chain; the live orientation walk remains the story's operator-attested UAT leg.)*

6. **§7 reconciled: prose streaming is the conversational rendering; the message trace is the
   observability layer.** ADR-0108 §7 specified the transcript as "the coarse phase trail + tool calls —
   **not** the raw token stream (owner's observability call)." The owner has since **directed token
   streaming** (the `onDelta` path, landed PR #457), and it is **kept**: streaming the orchestrator's
   **prose** to the operator as it generates is the answer rendering live — the responsiveness that makes
   the surface feel alive — and is distinct from a raw model log. It is **complementary** to the §7
   phase/tool trail, which is the `onMessage` trace seam (also landed) surfaced as the loop-observability
   layer (the transcript §7 named, still to be surfaced in the UI). §7's "not the raw token stream" is
   amended to: the operator sees the orchestrator's **prose stream live** (the conversational rendering)
   AND, separately, a **phase/tool trail** of what the loop did (the observability rendering) — neither is
   a raw token / model-internals log.

## Consequences

**Good**
- The product — the planning → inner-loop orchestrator — is the chat's front door, on the best available
  model, which is exactly the surface the owner wants to drive; no detour through a concierge.
- Newcomers get an accurate storytree explainer (the guide) without paying the orchestrator's startup,
  and the guide is reusable by terminal sessions via `.claude/agents` (one artifact, two surfaces).
- The Opus chat session can actually run — the phantom $1 wall is gone — consistent with ADR-0130's
  subscription-funded reasoning, with the turn cap as the honest brake.
- One loop definition still (the rendered `session-orchestrator`, ADR-0108 d.2); the guide is a separate,
  narrow agent, not a fork of the loop.

**Bad / accepted costs**
- "hello" stays on Opus + the full orchestrator prompt — a few seconds, not instant. Accepted: it is not
  the typical flow, and the guide covers the one newcomer case where speed-of-answer matters.
- Live orientation remains operator-attested, so a real part of the main flow's value (the orchestrator
  reading live state) is proven by the owner's eyes, not CI — a known limit of the scripted-`queryFn`
  discipline (decision 5; the runner is since built and wired, but its live read is still the owner's
  leg, not a CI contract).
- Delegation means a help question via the chat pays the orchestrator's startup before the guide answers;
  acceptable while latency is not a target, with the front-router as the escape hatch (decision 3).

**Neutral**
- Per-session budget control is deferred-but-available (opt-in), not foreclosed — a natural follow-on if a
  session ever needs bounding for a reason other than phantom dollars.
- Solo terminal orchestration and the terminal `orchestrate` command are unchanged; this settles the chat
  surface, it does not retire the terminal loop.
- Much of this redesign is, by nature, corpus authoring (the guide) and operator-attested glue
  (orientation, the transcript, the live feel) rather than offline-provable code — itself a concrete
  example of the structural-shape tail ADR-0128/0129 name in the inner-loop adoption gap.

## References

- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the server-side
  session-orchestrator runtime; **amended**: §7 reconciled (decision 6), the deferred per-session budget
  resolved (decision 4), and the Phase-2 chat surface's model / help-specialist / orientation shape
  settled (decisions 1–3, 5).
- [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md) — removed the
  inner-loop USD ceilings as phantom and pointed the per-*session* case back to ADR-0108; decision 4
  resolves it the same way (turn cap is the brake).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the SDK leaf is subscription-funded (why the $ ceiling
  is phantom) and the human owns the outer loop (the chat supervises, it does not self-land).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
  [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) /
  [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the agent renderer; the
  `.claude/agents` push surface; agents are seed-canonical — where `storytree-guide` is authored.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the chat surface's
  appearance AND live orientation are operator-attested (Story UAT leg 7).
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — read/propose only;
  the chat holds no signing key and the guide is read-only.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the orchestrator/agent boundary; the renderer imports
  no agent/model — the guide and the orientation runner live behind the sidecar.
- [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) /
  [ADR-0129](0129-inner-loop-adoption-target-ratio-and-goal-open-question.md) — the inner-loop adoption
  gap this redesign exemplifies (mostly corpus + operator-attested glue, one small offline-provable slice).
- Code: `packages/agent/src/headless-orchestrator.ts` (the budget keystone for decision 4 + the Opus
  default + `onMessage`/`onDelta`), `packages/drive/src/{orchestrate,chat-stream}.ts`,
  `apps/desktop/src/backend/chat-sse-mount.ts`, `apps/desktop/electron/backend-entry.ts` (the sidecar
  runner-injection point, decision 5), `apps/studio/src/components/ChatPanel.tsx` (the thin client).
</content>
</invoke>
