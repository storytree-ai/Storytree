---
status: accepted
decided: 2026-06-08
supersedes_in_part: [1, 9, 11, 12]
---

# ADR-0019: The knowledge tier is named "library"; defer DBOS for its store

## Status

accepted (2026-06-08) — **resolves** [ADR-0017](0017-cross-cutting-knowledge-tier.md)'s deferred tier
name; sets the store execution model for ADR-0017's Phase-2 migration, **deferring**
[ADR-0001](0001-foundational-stack.md) / [ADR-0009](0009-concurrency-isolation-id-allocation.md)'s DBOS
for the corpus. Records owner decisions from the studio open-questions `oq-knowledge-tier-name` and
`oq-store-execution-model`.

## Date

2026-06-08

## Context

[ADR-0017](0017-cross-cutting-knowledge-tier.md) returned the cross-cutting knowledge tier but
**deferred its name** (provisional "knowledge"; `asset` is reserved for game art, bare `guidance`
collides with the per-capability note) and left the **store execution model** open.
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) made `knowledge.json` the structured source
of truth, ready to migrate into the provisioned Cloud SQL store
([ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md)). Both decisions were parked as `open-question`
units and decided by the owner in the studio.

## Decision

1. **The tier is named `library`.** Resolves ADR-0017's deferred name (supersedes the provisional
   "knowledge"). The studio surface (the Library grid) and the tier now **share one name** — the
   container and its contents are one concept. The exact per-unit noun ("library unit" / "library
   entry") and the `packages/core` rename (`Knowledge` → `Library`) land in Phase 2.

2. **Defer DBOS for the library store; start with a plain Postgres connection.** Phase 2 begins with a
   thin typed Postgres client (the Cloud SQL connector + IAM, ADR-0015) writing the library **artifact**
   + append-only **event** + **projection** tables; DBOS (ADR-0001 / ADR-0009) is deferred until the
   foundation is more solid / the orchestrator needs durable workflows. The reserved `dbos` schema stays
   reserved.

## Consequences

- **Phase 2's first build** = connection + library / event / projection schema (JSONB, zod-validated at
  the write boundary per ADR-0017) + load `knowledge.json`, with **no DBOS yet**.
- A **Phase-2 rename sweep**: `Knowledge` → `Library` in `packages/core`, `knowledge.json` →
  `library.json`, and generator / variable names. Tracked, not done here.
- Coordination `claim`s (ADR-0009) that presume the shared store wait for DBOS; the library migration
  does not need them.

## What this does NOT decide

- The exact **per-unit noun**; the precise moment **DBOS** lands; **D2** (`oq-anti-pattern-lessons`,
  deferred by the owner); the full **agent↔Library interaction protocol** (under design).

## References

- [ADR-0017](0017-cross-cutting-knowledge-tier.md) (name deferred there, resolved here),
  [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) (the store),
  [ADR-0001](0001-foundational-stack.md) / [ADR-0009](0009-concurrency-isolation-id-allocation.md)
  (DBOS, deferred for now), [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) (the structured
  source this migrates).
