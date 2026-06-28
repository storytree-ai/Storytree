---
status: accepted
decided: 2026-06-28
amends: [5]
---
# ADR-0130: Remove the inner-loop USD budget ceilings (subscription-funded; the turn cap is the brake)

## Status

accepted (2026-06-28) — decided/directed by the owner in conversation on 2026-06-28. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

> **Completed by [ADR-0131](0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md)**
> — this ADR's explicit build-harness-only scope carve-out (the orchestrator and curator SDK sessions,
> named below as "out of scope... separate decisions") is now lifted: ADR-0131 extends the
> no-USD-ceiling default to both. The build-harness decision here is unchanged; the carve-out is the
> only thing widened.

## Context

The inner-loop build harness (`node build --real` / `story build --real`, the drive over the prove-it
gate) carried two USD ceilings: a **per-authoring-slice** cap defaulting to **$1/slice**, and — for a
story chain — a **$10 total** cap across the run. They are SDK-enforced: the leaf aborts with
`error_max_budget_usd` once the SDK's own `total_cost_usd` estimate crosses the threshold.

But that estimate is a **phantom** under our billing model. The leaf is the live Claude Agent SDK,
**subscription-funded** (ADR-0030) — a flat monthly cost, not metered per token. The SDK still reports a
`total_cost_usd` computed from *list-price* token rates, and the budget ceiling caps against *that*
number. So the dollar wall throttles a build that costs the same flat subscription amount whether it
runs or not: it adds **no real cost protection** and **does** artificially halt subscription-funded
work mid-slice (the `chat-sse-mount` integration build hit `Reached maximum budget ($1)` and needed
`--budget` raised purely to clear a phantom wall — `real-build-turn-ceiling-vs-budget.md`).

This friction has an adoption cost. The inner loop is the *default* proof path (ADR-0057), yet ~92% of
source-changing PRs bypass it (ADR-0128). The adoption analysis names per-build cost friction as one
material reason a session reaches for `edit → pnpm gate → merge` instead of driving — for a clean unit,
the rational local choice is the free offline path over a billed build that can stall on a phantom
ceiling (`docs/research/inner-loop-adoption-gap.md` §4). Fewer artificial caps lowers that friction.

The forces against removal are weak: the **turn cap** (`maxTurns`, default 16, raisable to 45) is the
genuine fail-closed runaway brake — it bounds how long any one slice can churn regardless of estimated
dollars. The USD ceiling was a *second* brake measured in a currency that does not reflect our actual
spend. ADR-0108 deferred per-*session* budget controls; this ADR resolves the per-*build* default in the
no-ceiling direction, leaving the per-session question to ADR-0108 where it belongs.

## Decision

**Remove the USD budget ceiling as a default. `--budget` becomes an optional opt-in cap; with no
`--budget` flag, no USD ceiling is enforced anywhere in the inner-loop build harness.** The turn cap
remains the runaway brake.

Concretely:

- **The SDK leaf (`@storytree/agent`, `sdk-author.ts`) stops defaulting `maxBudgetUsd` to 1.** It now
  passes `maxBudgetUsd` to the SDK *only* when an explicit value is threaded down; absent, the SDK runs
  with no USD ceiling (bounded by `maxTurns ?? 16`). This is the keystone — the `?? 1` default here was
  the real source of the $1/slice wall; the drive packages only ever threaded a budget *conditionally*.
- **The drive story chain (`@storytree/drive`, `story-build.ts`) drops the `$10` total and `$1`
  per-slice defaults.** `--budget` is opt-in: unset → `runStoryBuild` runs with no total ceiling (it
  already treats `budgetUsd === undefined` as unbounded), and each slice runs with no USD cap. When an
  operator *does* pass `--budget N`, it is honoured as a total ceiling and each slice may draw the
  remaining total (no artificial $1 sub-cap — the turn cap bounds the slice).
- **`node build --real/--live`** already threaded `--budget` conditionally; with the SDK-author keystone
  it is now unbounded-by-default too. Docs/help updated to match.

What is explicitly **out of scope** (untouched): the adjacent subscription-funded SDK sessions that are
not the build harness — the chat/headless orchestrator's per-session budget (ADR-0108's deferred
control) and the post-green librarian-curator's budget (ADR-0067). They are separate decisions.

The honesty walls are **unchanged**: the spine still observes the genuine red→green (the leaf's claim is
never the proof, ADR-0020); the test-author is still not the code-author; `error_max_budget_usd` is
still mapped to `exhausted` (salvage-not-discard) for the case where an operator *does* set `--budget`.

## Consequences

- **Good.** Subscription-funded builds are no longer halted by a phantom dollar wall; the common
  `--budget`-raising dance for substantial slices disappears. One less artificial cap on the default
  proof path — a small reduction in the adoption friction ADR-0128/§4 identified. The escape hatch
  survives: an operator who *wants* to bound a slice by the SDK's estimate can still pass `--budget`.
- **Bad / risk.** A genuinely runaway leaf is now bounded only by the turn cap (16, or `--max-turns`),
  not also by dollars. This is acceptable precisely because the dollars were phantom — the turn cap is
  the brake that maps to real work, and a subscription run is "full-bill survivable" (owner, the same
  risk posture taken on the backstop-verify skip). It is a default change, fully reversible by passing
  `--budget`.
- **Neutral.** The `budgetUsd` / `maxBudgetUsd` plumbing and the `runStoryBuild` total-budget
  sequencing stay — the change makes the default unbounded, it does not rip out the capability.

## References

- [ADR-0005](0005-orchestration-spine-code-vs-judgment.md) — **amended in degree.** ADR-0005 made
  per-node budget first-class ("a node loop terminates on green **or** budget-exhausted … v2 is
  pay-as-you-go") and left the *default ceiling* an Open question. This ADR resolves that Open in the
  no-ceiling direction for the USD unit: the dropped `DEFAULT_STORY_BUDGET_USD` was that per-node budget
  at story grain. The pay-as-you-go *capability* survives (`--budget` opt-in); the terminal-on-exhaustion
  brake is now the turn cap, not a phantom USD wall.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the SDK leaf is subscription-funded; this is why the
  metered `$`-budget is a phantom.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — deferred per-*session*
  budget controls; this ADR resolves the per-*build* default in the no-ceiling direction.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — the inner loop is
  the default proof path; fewer artificial caps lowers adoption friction
  (`docs/research/inner-loop-adoption-gap.md` §4, owner-directed update 2026-06-28).
- [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) — ~92% inner-loop
  bypass; per-build cost is one named friction.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the honesty walls (spine observes
  red/green) this change does not touch.
- Code: `packages/agent/src/sdk-author.ts` (keystone), `packages/drive/src/story-build.ts`,
  `packages/drive/src/node-build.ts`; the turn cap (`maxTurns`) stays the runaway brake.
