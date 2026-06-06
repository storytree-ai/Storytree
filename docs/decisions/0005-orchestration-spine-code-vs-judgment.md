# ADR-0005: Orchestration spine — code sequences, pi judges

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0026/0010/0020.

> **Amended by [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)** — the leaf
> is an **owned agent loop**, not a pi session; read "pi leaf" / "pi-adapter" below as that
> owned loop. The spine/leaf discriminator and the code-sequences-vs-model-judges split are
> unchanged.

## Decision

The orchestrator (TypeScript over DBOS workflows) owns code-sequenced control-flow; a pi session's model loop owns leaf judgment.

- **Discriminator:** if a `for` loop or a `match` could express the routing, the **spine** (code) owns it; if the next step needs the model to decide, a **pi leaf** owns it.
- Spine owns: step order, loop-until-green/until-budget, branch-on-result, fan-out/fan-in (DBOS queues, ADR-0009). pi owns: what to write, how to satisfy a contract/UAT.
- Depend **only** on pi's documented surface — never undocumented internals. All pi access via `pi-adapter` (ADR-0004).
- **Per-node budget is first-class:** a node loop terminates on green **or** budget-exhausted (a typed terminal event, per-round cost visible). Inverts v1's "rounds aren't a cost" — v2 is pay-as-you-go.
- The spine is **code, not a second agent**.

## Open

Budget unit + default ceiling (iterations / tokens / wall-cost) open-q §6 · terminal-event vocabulary ADR-0006.
