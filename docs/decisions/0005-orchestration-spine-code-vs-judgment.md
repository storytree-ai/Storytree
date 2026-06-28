---
status: accepted
load_bearing: true
decided: 2026-06-04
---

# ADR-0005: Orchestration spine — code sequences, pi judges

**Status:** accepted (2026-06-04; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — full rationale: v1 ADR-0026/0010/0020.

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** (DBOS deferred; the store is a plain typed Postgres connection now — the orchestrator-over-DBOS wording is the reserved future target, not the built path).

> **Amended by [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)** — the leaf
> is an **owned agent loop**, not a pi session; read "pi leaf" / "pi-adapter" below as that
> owned loop. The spine/leaf discriminator and the code-sequences-vs-model-judges split are
> unchanged.

> **Amended in degree by [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md)**
> — the per-node budget's *default USD ceiling* (the Open question below) is resolved in the no-ceiling
> direction: under subscription billing the metered `$`-budget is a phantom, so it is removed as a
> default. "Per-node budget is first-class" and "terminates on green **or** budget-exhausted" stand —
> the runaway terminal is now the **turn cap**, and the USD path survives as the opt-in `--budget`.

## Decision

The orchestrator (TypeScript over DBOS workflows) owns code-sequenced control-flow; a pi session's model loop owns leaf judgment.

- **Discriminator:** if a `for` loop or a `match` could express the routing, the **spine** (code) owns it; if the next step needs the model to decide, a **pi leaf** owns it.
- Spine owns: step order, loop-until-green/until-budget, branch-on-result, fan-out/fan-in (DBOS queues, ADR-0009). pi owns: what to write, how to satisfy a contract/UAT.
- Depend **only** on pi's documented surface — never undocumented internals. All pi access via `pi-adapter` (ADR-0004).
- **Per-node budget is first-class:** a node loop terminates on green **or** budget-exhausted (a typed terminal event, per-round cost visible). Inverts v1's "rounds aren't a cost" — v2 is pay-as-you-go.
- The spine is **code, not a second agent**.

## Open

Budget unit + default ceiling (iterations / tokens / wall-cost) open-q §6 · terminal-event vocabulary ADR-0006.

> Default-ceiling update: the **USD** default ceiling is resolved (removed) by
> [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md) — phantom under
> subscription billing; the turn cap is the brake, `--budget` the opt-in USD path.
