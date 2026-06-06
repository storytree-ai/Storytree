# ADR-0013: A structured, schema-validated corpus; markdown as a generated view

## Status

accepted (2026-06-06) — **extends** [ADR-0002](0002-work-hierarchy-story-capability-contract.md)
and [ADR-0010](0010-organism-model-story-bounded-context.md) (the work-hierarchy schema)
toward its `packages/core` encoding.

## Date

2026-06-06

## Context

The `stories/` corpus (the first story, `studio-foundation`) is authored as file-per-unit
**frontmatter-markdown**. The frontmatter is already structured YAML
(`id`/`tier`/`status`/`proof_mode`/`depends_on`) — that part has discipline. But the
load-bearing, queryable facts have **leaked into the markdown body** as prose, tables, and
bold-labeled lists (owner, 2026-06-06: "we lost discipline that existed previously"):

- the **code-derived dependency edges** (`story.md`'s dependency graph) — storytree's core
  data — encoded as English bullets;
- the **contracts** (`id` / `asserts` / `covers` `file:line`) — structured records written
  as prose with bold labels;
- **status** narrated in prose alongside the structured `status` field.

This is the wrong source-of-truth shape for a system whose product *is* a queryable DAG
grown by agents, and whose agents need that corpus **assembled into context**
([ADR-0011](0011-own-the-agent-loop-and-context-engineering.md);
[`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md)).
Prose can't be queried, validated, or assembled programmatically.

## Decision

1. **Structured data is the source of truth.** Everything queried, validated, or graphed —
   capability list, dependency edges (with rationale), contracts (`id` / assertion /
   `covers`), `proof_mode`, `status` — lives as **structured fields** (YAML/JSON), not
   prose. Genuine narrative (the UAT walkthrough, the "what this is" framing, honesty
   notes) stays prose, in a **designated body/description field**.
2. **A schema enforces the discipline.** `packages/core` defines the unit schema (story /
   capability / contract / cross-story **boundary**) as a **validator** (zod / JSON-Schema),
   and the corpus must validate against it — run in `pnpm typecheck` / CI. **The discipline
   comes from validation, not the format choice:** the frontmatter was already structured
   and facts *still* leaked, because nothing forbade load-bearing data in prose. This is the
   encoding ADR-0002 deferred to `packages/core` and ADR-0010 said the schema would carry.
3. **Markdown becomes a generated view.** The studio (and any human-readable rendering)
   renders markdown **generated from** the structured source — markdown is *output, not
   input*. This inverts today's hand-maintained markdown and removes the drift between the
   structured frontmatter and the prose body (e.g. the capabilities table in `story.md`
   that duplicates each capability's own frontmatter).
4. **`covers` becomes validatable.** A contract's `covers` pointer (e.g.
   `Library.tsx:16-17`) is structured so it can be **checked** (the file/line exists) and
   drive scaffolding — not a prose citation.

## Consequences

- **Extends ADR-0002 / ADR-0010** — those fixed the conceptual hierarchy and said
  `packages/core` encodes it; this fixes the **representation**: structured + validated,
  markdown as a view. The cross-story **boundary** entity (ADR-0010 §4) is part of the same
  schema.
- **Required migration (follow-up).** The `studio-foundation` seed (8 files) is rewritten
  from prose-bearing markdown to structured units + generated markdown; the studio's
  renderer and the Library **seeder**, which read markdown today, consume the structured
  source instead. Tracked, not done in this ADR.
- **Context engineering benefits directly (ADR-0011).** Assembling a node's context becomes
  a **query** over structured units (pull X's contracts + inbound/outbound edges + upstream
  boundaries), not prose parsing or whole-file dumps. This is the connective tissue: a
  structured corpus is what makes the owned context engineering tractable.
- **Unrelated to the parked knowledge tier** — this is the representation of the
  work-hierarchy units, *not* a new shared-content tier (open-q §9 / v1 `asset`s).

## What this does NOT decide

- **YAML vs JSON** for the on-disk format, **single-file-per-unit vs a combined document**,
  and **where the prose body lives** (inline field vs sibling file) — land with the
  `packages/core` schema.
- The exact **zod/JSON-Schema shape** and the cross-story **boundary** term
  (`boundary`/`port`, still TBD per ADR-0010 §4).
- Whether the studio **edits** structured units directly or via a form — a studio concern.

## References

- [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (work hierarchy), [ADR-0010](0010-organism-model-story-bounded-context.md) (organism model; schema carrier), [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (context engineering consumes this).
- [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md); `stories/studio-foundation/` (the seed this restructures).
- Design conversation, 2026-06-06.
