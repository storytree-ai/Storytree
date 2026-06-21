---
status: accepted
decided: 2026-06-04
---

# ADR-0004: Orchestrator/agent boundary

**Status:** accepted (2026-06-04; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — full rationale: v1 ADR-0003/0006/0008/0026.

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** (DBOS deferred; the store is a plain typed Postgres connection now — DBOS is a reserved future target, not the built path).

> **Amended by [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)** — pi is
> replaced by an **owned agent loop** (`packages/agent`, superseding `pi-adapter`). Read
> "pi" / "pi-adapter" below as that owned loop; the boundary, single-model-import-site,
> orchestrator-only-driver, run≠node, and sole-fan-out rules are unchanged.

## Decision

Confine every model call behind one orchestrator-driven boundary, so model-unavailability is a *local* failure, never a system outage.

- pi is reached **only** through `packages/pi-adapter` — the sole place a model runtime is imported.
- **Only** `packages/orchestrator` drives `pi-adapter`. `packages/core` and `apps/studio` contain **no** agent invocation and no path to a model runtime.
- The **gate**, verdict computation, and event-log→rollup projection are pure functions of recorded evidence — they **never** call a model to reach a verdict.
- `pi-adapter` is a project-owned thin wrapper over pi's **documented** surface (`prompt`/`steer`/`followUp` + lifecycle stream + `edit` diffs); no third-party agent framework in the runtime path.
- **Run ≠ node:** a pi run/attempt is an execution event (many per node), never a new tree node.
- The orchestrator is the **sole fan-out point**; pi nodes never schedule child nodes (no agent-spawns-agent).

## Open

Per-node agent-spec/role taxonomy — does any survive, and under what name (never `contract`)? open-q §4 · wire protocol open-q §8 · the pi-event→typed-event mapping ADR-0006.
