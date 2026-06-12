---
status: proposed
decided: 2026-06-04
---

# ADR-0009: Concurrency, isolation & ID allocation

**Status:** proposed (2026-06-04) — full rationale: v1 ADR-0013/0022/0025/0014.

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** (DBOS deferred; the store is a plain typed Postgres connection now — the DBOS-based isolation/claims here are the deferred path, not the built one).

## Decision

Back ADR-0001's "parallel + conflict-free IDs from day one" on DBOS/Postgres, and collapse v1's git+claims substrate (which only existed to fake a shared store v2 ships by default).

- **Isolation** = per-node DBOS workflow execution against **one shared Postgres event store** — *not* a git branch+worktree per session.
- **Conflict detection** = a typed **claim** row naming write-ownership, checked under a serializable/unique constraint at **node-schedule time**; a conflict is a hard refusal (a typed event), never a warning.
- **One write-ownership vocabulary** (unifies v1's `declared_scope` / `does_not_touch`).
- **IDs are DB-allocated** (Postgres sequence or UUID + unique constraint), recorded as a typed event — dissolving **both** v1 collision classes, including *landed-but-unseen* (which a claims-gate structurally cannot catch). No hand-picked next integer.
- The same discipline covers **v2's own ADR-number namespace** (the two-0021 / gap-0009 collisions were exactly this bug).

## Open

Git branch/worktree for the owned loop's *code edits*? · claim granularity / write-ownership shape · conflict-resolution ceremony · the ADR-number allocation scheme — all open-q §3 · channel open-q §5.
