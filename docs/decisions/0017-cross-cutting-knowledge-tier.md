---
status: proposed
decided: 2026-06-07
---

# ADR-0017: The cross-cutting knowledge tier (resolves open-q §9)

## Status

proposed (2026-06-07) — **resolves** `open-questions.md` §9 (cross-cutting knowledge /
shared-content tier); builds on [ADR-0013](0013-structured-corpus-markdown-as-view.md) (structured
corpus) and [ADR-0016](0016-knowledge-code-binding-and-staleness.md) (binding/staleness);
**corrects** [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md)'s "corpus → git" claim.

## Date

2026-06-07

## Context

`open-questions.md` §9 parked the question: does v2 have a tier for **cross-cutting knowledge** —
referenced, shared entities used across the work hierarchy — or do the event store + per-node
guidance make it unnecessary? It is real: the studio already holds **88 such units** (`assets.json`
— definitions, principles, patterns, guardrails, techstack notes, templates), the "Library."

Two facts shaped this decision:

- **It is distinct from `packages/core`'s `Guidance`.** That `Guidance` is the *per-capability,
  embedded* note the context engine pulls per step (ADR-0011) — not a cross-cutting library. The
  88 units are the shared, reusable doctrine. Two different concepts have been colliding on the
  word "guidance."
- **The owner's mental model:** ADRs are the **source layer**; other artifacts are **downstream**
  of sources and of each other (a derivation DAG); the knowledge layer is a **real-time input** to
  agents; the two planes are logically separate with agents between them.

## Decision

1. **The tier returns** — as a **corpus tier**: structured, zod-validated documents
   (ADR-0013), parallel to the work hierarchy, discriminated by **`kind`** ∈ {definition,
   principle, pattern, guardrail, techstack, template}, the way work units are discriminated by
   `tier`. It is *not* folded into the work-hierarchy `Unit` union — a separate but linkable graph.

2. **It lives in the shared event store, not git-only** — current state = a projection, history =
   events ([ADR-0016](0016-knowledge-code-binding-and-staleness.md)). Stored as **JSONB documents,
   zod-validated at the write boundary**: document flexibility *and* validation, with relationships
   as **ID references inside the documents** (resolved into a graph), never relational FK
   constraints. **This corrects [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md)**, whose
   two-tier map wrongly put the corpus in git — git cannot be a shared live-state layer across
   parallel sessions/worktrees (the very thing ADR-0009 collapsed), and ADR-0006's node-rollup
   projection already puts unit state in Postgres. Git holds the **code** and an optional
   **generated** markdown view (ADR-0013), not the source of artifact state.

3. **Provenance: ADRs are the source layer; knowledge is a downstream DAG.** A knowledge unit
   `derives_from` one or more ADRs and/or other knowledge units. Work units **consume** knowledge
   units (the bridge between the two planes). **Source-drift** (ADR-0016) propagates *down* this
   DAG: when a source ADR changes, downstream units flag stale.

4. **Staleness via [ADR-0016](0016-knowledge-code-binding-and-staleness.md).** Knowledge that
   binds to code gets **code-drift**; ADR-derived doctrine with no code anchor gets **source-drift
   + freshness**. Either way it is an explicit signal agents read, never silent.

5. **Stories can depend on stories.** The current `packages/core` schema has only *within-story*
   edges; cross-story `depends_on` (the **boundary** ADR-0010 §4 deferred) is a real gap to add —
   a story-level dependency edge.

## Deferred (consciously parked, per the owner)

- The tier's **final name.** `asset` is reserved (glossary = game art) and bare `guidance`
  collides with the per-capability note; provisional working name **`knowledge`** (a "knowledge
  unit"). To settle.
- The **citing / reference / reciprocity** mechanism (how `derives_from` / `consumes` are checked
  and kept mutual) and the **comments** layer — the human-input plane on top. The owner judged
  these need more thought; deferred. *(Resolved 2026-06-10: the comments layer shipped (ADR-0027),
  and the citing mechanism is now decided by [ADR-0032](0032-cite-graduation-mechanism.md) — a cite
  is a typed link, graduation is a future synthesis agent.)*
- Whether per-capability `Guidance` becomes a **`consumes`-reference into the knowledge tier** (the
  DRY unification) or stays separate — folded into the deferred citing decision.
- **Templates → schema.** The 6 `template` units describe shapes `packages/core` zod already
  validates; per ADR-0013 the template should be a *generated view* of the schema, one source.

## Consequences

- **Closes open-q §9** ("does the tier return?" — yes, as corpus-in-the-shared-store with an
  ADR-rooted derivation DAG). The term is **not** `asset` (ADR-0003 / glossary collision avoided).
- **Unifies the migration:** the 88 Library units *and* the (empty) comments both move from
  git-file stopgaps into the shared store — making the **DB foundation** (connection + DBOS +
  artifact/event/projection schema) the genuine next build, not a data migration.
- **`packages/core` grows** a `Knowledge` discriminated union (by `kind`) alongside `Unit`, sharing
  ADR-0016's anchor and the reference vocabulary; plus the story→story edge.

## What this does NOT decide

- The tier's name; the citing/reciprocity mechanism; the comments layer; the guidance-unification —
  all deferred above.
- The exact **zod shape** of a knowledge unit and the cross-story **boundary** term
  (`boundary`/`port`, still TBD per ADR-0010 §4).

## References

- `open-questions.md` §9 (the question this resolves), [ADR-0013](0013-structured-corpus-markdown-as-view.md)
  (structured corpus), [ADR-0016](0016-knowledge-code-binding-and-staleness.md) (binding/staleness),
  [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) (corrected here),
  [ADR-0010](0010-organism-model-story-bounded-context.md) (the boundary edge),
  [ADR-0006](0006-event-store-observability-surface.md) (event store / node rollup).
- `apps/studio/src/types.ts` (`GuidanceAsset`, the 88 units), design conversation 2026-06-07.
