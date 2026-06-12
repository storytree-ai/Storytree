---
status: proposed
decided: 2026-06-04
---

# ADR-0006: Event store & observability surface

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0006/0021/0023 (this **inverts** them).

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** (DBOS deferred; the store is a plain typed Postgres connection now — DBOS is a reserved future target, not the built path).

## Decision

The event store is the single source of truth; the studio renders it **and** drives the agents through it.

- **One SSOT:** every state change is a typed `event` in the shared Postgres store. If it isn't an event, it doesn't exist.
- **Two ingest channels only:** the owned loop's lifecycle stream + `edit` diffs (via `packages/agent`); orchestrator control-flow events. **No** Claude hooks, **no** OTel-from-an-agent, **no** MCP, **no** trace SaaS.
- **Split the grain v1 fused:** an append-only **event log** (one row per change — the only thing written) under a derived **node rollup** (status + latest verdict per node — a projection, never hand-maintained). Replaces v1's `runs`/`test_runs` mess; do not reuse those names.
- **Studio = embedded + bidirectional:** renders the log (events out) and issues approvals/steering/chat (commands in). **Not** a read-only sidecar.
- **Typed terminal outcomes:** `succeeded` / `budget-exhausted` / `crashed` / `gate-refused` — not one overloaded enum.
- `packages/agent` is the **sole** producer of owned-loop-derived events, and the mapping is load-bearing (not a shim) (ADR-0011).

## Open

Event vocabulary — OTel-GenAI vs bespoke (open-q §8) · wire protocol (open-q §8) · proof/attestation persistence (open-q §1) · channel as a typed event vs dropped (open-q §5).
