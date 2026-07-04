---
status: accepted
decided: 2026-07-04
amends: [130, 131]
load_bearing: true
---
# ADR-0151: Lift the turn cap on the orchestrator session (desktop chat / terminal orchestrate)

## Status

accepted (2026-07-04) — decided/directed by the owner in conversation on 2026-07-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md): ADR-0130 kept the
turn cap (`maxTurns`, default 16) as the genuine runaway brake for the inner-loop build harness. This ADR
narrows that for ONE path — the orchestrator SESSION — lifting its default turn cap. ADR-0130's build-harness
decision (the leaf/story-chain brake) is unchanged; only the orchestrator-session case is re-decided.

Also amends [ADR-0131](0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md): ADR-0131
removed the USD ceiling for this same orchestrator session and, in passing, restated its turn cap as `16`
(the "uniform runaway brake"). That incidental turn-cap prose is now narrowed here — the orchestrator
session's default cap is lifted. ADR-0131's core decision (no USD ceiling for the orchestrator + curator
sessions, and the curator's own turn cap) stands unchanged; only its orchestrator turn-cap statement is
qualified.

## Context

The desktop chat IS the `session-orchestrator` — the human-watched outer loop (ADR-0136/0137): the owner
types an intent, watches the session stream orient → propose (→ spawn), and can stop it at any time. That
session runs through `runHeadlessOrchestrator` (`packages/agent`), driven for the desktop chat via
`chat-sse-mount → startChatStream → orchestrate`, and for the terminal via `storytree orchestrate`.

It carried a **default 16-turn ceiling** (`maxTurns ?? 16`) — inherited from ADR-0130, where the turn cap is
the runaway brake for the *inner-loop build harness*. But the orchestrator session is a different animal from
the build leaf:

- **It is watched.** The owner sees every turn stream over SSE and can abort a genuine hang. The build leaf
  runs unattended behind the spine, where an autonomous runaway brake earns its keep; the chat does not.
- **The cap false-fails healthy long work.** Orienting across the whole corpus and proposing/spawning is
  legitimately many turns. The same 16-turn ceiling already mislabelled a *successful* story-author authoring
  as `✗ failed` (the spawn-visibility walk, PR #570 — mitigated there by raising the story-author spawn to 40).
  On the orchestrator session itself the ceiling is the same trap: a long-but-healthy orient/propose can hit
  16 and return a false failure.
- **The cost it "protects" is a phantom.** The session is subscription-funded (ADR-0030), so extra turns are
  flat-cost, not metered — the same reasoning ADR-0130/0131 used to drop the USD ceiling. ADR-0131 already
  removed the USD ceiling default here, leaving the turn cap as the *sole* remaining brake on the session.

The owner directed (2026-07-04): "can we remove max turns — if it really does hang, I'll know about it; worst
case it burns through my subscription." For a watched, subscription-funded loop that is the right trade: the
human IS the runaway backstop, so the machine cap costs more (false failures) than it protects.

## Decision

**Lift the default turn cap on the orchestrator SESSION. `runHeadlessOrchestrator` runs UNBOUNDED by default
— it hands no `maxTurns` to the SDK unless an explicit value is threaded down.** The human watching the stream
is the runaway backstop; a positive `maxTurns` is now an opt-in to RE-impose a cap (a bounded / debug run).

Concretely:

- **`packages/agent/src/headless-orchestrator.ts` stops defaulting `maxTurns` to 16.** It passes `maxTurns`
  to the SDK options *only* when an explicit value is threaded down (mirroring how `maxBudgetUsd` is handled
  since ADR-0131); absent, the SDK runs with no turn ceiling. This is the keystone — it applies to BOTH the
  desktop chat and the terminal `orchestrate` command (both are the orchestrator session).
- **The desktop chat path threads an optional operator override end-to-end.** `chat-sse-mount` gained an
  optional `maxTurns` (forwarded through `startChatStream → orchestrate` — which already carried it — to the
  runner). The sidecar (`backend-entry.ts`, operator-attested glue) resolves it from the env via the pure
  `resolveOrchestratorMaxTurns(STORYTREE_ORCHESTRATOR_MAX_TURNS)`: `undefined` (unbounded) by default, a
  positive whole number to re-impose a cap. Absent env → no `maxTurns` forwarded → the SDK runs unbounded.

**Scope — this is the orchestrator SESSION only.** The inner-loop runaway brakes ADR-0130 named are
UNCHANGED:

- the SDK build leaf (`sdk-author.ts`, `maxTurns ?? 16`) — the builder dispatch relies on it;
- the owned-loop `run-turn.ts` (`DEFAULT_MAX_TURNS = 16`);
- the chat-spawned **story-author** (`resolveSpawnMaxTurns`, default 40, PR #570 — a within-framework tuning
  of ADR-0130's cap, env-tunable via `STORYTREE_SPAWN_MAX_TURNS`).

Those are unattended inner-loop sessions where the fail-closed turn brake still earns its keep; lifting the
cap on the *watched* conversation does not lift it on the *spawned* work the conversation dispatches.

## Consequences

- **Good.** A long-but-healthy orient/propose can no longer be false-failed by a fixed turn ceiling — the trap
  that mislabelled successful authoring as `✗ failed`. The human-watched loop is bounded by the human, which is
  the honest backstop for a subscription-funded session. One less phantom cap on the outer loop; the USD ceiling
  (ADR-0131) and now the turn ceiling are both lifted for this session.
- **Bad / risk.** A genuinely runaway orchestrator session (a model that never stops) is now bounded only by the
  owner noticing and stopping it — it can burn subscription-funded turns until then. The owner accepted this
  explicitly ("if it really does hang, I'll know about it"). The escape hatch survives: set
  `STORYTREE_ORCHESTRATOR_MAX_TURNS=<n>` (or pass `--max-turns` to the terminal command) to re-impose a cap for
  a bounded or debug run. The single-session guard (ADR-0108 d.6) still prevents concurrent runaway sessions.
- **Honesty walls unchanged.** The chat is still READ/PROPOSE + SPAWN only (the Phase-2 wall, ADR-0091); the
  spine is still the sole signer (ADR-0020); the human is still the sole lander (ADR-0022). Lifting the turn cap
  changes how long the session may run, not what it is trusted to do.

## References

- [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md) — amended: the turn cap stays
  the build-harness runaway brake; this ADR narrows it for the orchestrator session only.
- [ADR-0131](0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md) — **amended.** It removed
  the USD ceiling default for this same session and restated its turn cap as `16` (the "uniform runaway
  brake"); this ADR removes that remaining turn ceiling. ADR-0131's core decision stands; its incidental
  orchestrator turn-cap prose is narrowed here.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the headless orchestrator session (its deferred per-session
  budget control is what ADR-0131 and this ADR resolve in the no-ceiling direction).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the session is subscription-funded, so a turn/USD cap
  protects a phantom cost.
- Code: `packages/agent/src/headless-orchestrator.ts`, `apps/desktop/src/backend/orchestrator-turns.ts`,
  `apps/desktop/src/backend/chat-sse-mount.ts`, `apps/desktop/electron/backend-entry.ts`.
