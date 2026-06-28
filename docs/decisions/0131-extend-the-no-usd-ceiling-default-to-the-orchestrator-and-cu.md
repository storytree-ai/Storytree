---
status: accepted
decided: 2026-06-28
amends: [130, 108, 67]
---
# ADR-0131: Extend the no-USD-ceiling default to the orchestrator and curator SDK sessions (completing ADR-0130)

## Status

accepted (2026-06-28) — decided/directed by the owner in conversation on 2026-06-28. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0130 removed the USD budget ceiling as a default from the inner-loop BUILD harness (the SDK leaf +
the drive over the prove-it gate), on the reasoning that the leaf is subscription-funded (ADR-0030) so
the SDK's metered `total_cost_usd` is a *phantom* — list-price token math that doesn't reflect our flat
cost. It explicitly scoped itself to the build harness and named two adjacent subscription-funded SDK
sessions as "out of scope... separate decisions":

- the **headless / chat orchestrator** (`headless-orchestrator.ts`, ADR-0108) — its per-session budget
  default was `maxBudgetUsd ?? 1`; ADR-0108 had **deferred** per-session budget controls; and
- the **post-green librarian-curator** (`sdk-curator.ts`, ADR-0067) — its default was `maxBudgetUsd ?? 0.5`.

The owner has now directed (in conversation, 2026-06-28) that those two be removed as well. The phantom-cost
reasoning is identical — all three are the same Claude Agent SDK under the same flat subscription, so a
metered dollar wall throttles them for no real cost protection. The only reason they were carved out of
ADR-0130 was scope discipline (the owner's first directive named the build harness); that carve-out is
now lifted. This ADR is the copy-on-write record of that scope extension (ADR-0086): ADR-0130 stated the
carve-out as a decision, so widening it is a new decision, not an in-place edit of 0130.

## Decision

**Extend ADR-0130's rule to the orchestrator and curator SDK sessions: no USD ceiling by default;
`maxBudgetUsd` (via `orchestrate --budget`, or the curator's injected arg) is an optional opt-in cap.**
The respective TURN caps remain the runaway brakes.

Concretely (same keystone shape as ADR-0130 — pass `maxBudgetUsd` to the SDK only when explicitly set):

- **`packages/agent/src/headless-orchestrator.ts`** drops `maxBudgetUsd ?? 1`. Absent a `--budget`, the
  session runs with no USD ceiling, bounded by `maxTurns ?? 16`. The `orchestrate --budget` flow already
  threads the value conditionally, so an operator can still opt into a cap. This **resolves ADR-0108's
  deferred per-session budget control** in the no-ceiling direction.
- **`packages/agent/src/sdk-curator.ts`** drops `maxBudgetUsd ?? 0.5`. The post-green curator runs
  bounded by its single-shot `maxTurns ?? 6`; the `SdkCuratorRunner` already threads an injected budget
  conditionally, so a cap is opt-in.

The turn caps (orchestrator 16, curator 6) and every read-only / best-effort property are untouched —
the curator is still `tools: []` read-only and still can never fail a build (ADR-0067); the orchestrator
is still single-session-guarded and read-only (ADR-0108). What is now **complete**: every
subscription-funded SDK session in the system (build leaf, orchestrator, curator) defaults to
no-USD-ceiling, with the turn cap as the uniform runaway brake.

## Consequences

- **Good.** Uniform, honest posture across all three SDK sessions — no phantom dollar wall anywhere by
  default. The curator no longer risks truncating a borderline curation pass on a $0.50 estimate; a chat
  orchestration turn is bounded by turns (16), not a phantom $1. The opt-in escape hatch survives on both.
- **Bad / risk.** A runaway orchestrator/curator session is now bounded only by its turn cap, not also
  by dollars. Acceptable for the same reason as ADR-0130 — the dollars were phantom, the turn cap maps to
  real work, and a subscription run is full-bill survivable. Both are read-only sessions (no writes to
  guard), so the blast radius of a runaway is wasted turns, not damage. Fully reversible via `--budget`.
- **Neutral.** The `maxBudgetUsd` plumbing stays on both; only the default becomes unbounded.

## References

- [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md) — **completed.** This
  ADR lifts ADR-0130's explicit build-harness-only scope carve-out to the two sessions it named as
  separate decisions.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — **resolves its
  deferred per-session budget control** in the no-ceiling direction (the orchestrator session's
  `?? 1` default).
- [ADR-0132](0132-the-desktop-chat-is-orchestrator-first-on-the-smartest-model.md) — **parallel
  declaration.** Landed first (a sibling session) and DECLARED the orchestrator's no-USD-ceiling budget
  as part of the desktop-chat shape, but did not change the code. This ADR is the IMPLEMENTATION (drops
  the `?? 1` in `headless-orchestrator.ts`) and additionally covers the curator (ADR-0067), which
  ADR-0132 does not touch. The two converge — neither supersedes the other.
- [ADR-0067](0067-the-inner-loop-runs-a-scoped-librarian-curator-after-a-green.md) — the post-green
  librarian-curator whose `?? 0.5` default this removes; its best-effort, never-fails-the-build,
  read-only properties are untouched.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — subscription-funded SDK; why the metered `$`-budget
  is a phantom for all three sessions.
- Code: `packages/agent/src/headless-orchestrator.ts`, `packages/agent/src/sdk-curator.ts`; the turn
  caps (`maxTurns`) stay the runaway brakes.
