---
status: accepted
decided: 2026-06-06
---

# ADR-0013: A structured, schema-validated corpus; markdown as a generated view

## Status

accepted (2026-06-06) — **extends** [ADR-0002](0002-work-hierarchy-story-capability-contract.md)
and [ADR-0010](0010-organism-model-story-bounded-context.md) (the work-hierarchy schema)
toward its `packages/core` encoding.

> **Amended same day (2026-06-06)** — format resolved to **YAML**; markdown reframed as a
> *rendered content-type for prose fields*, not a document container (it forced a dumb
> structure-vs-readable choice); narrative is structured into typed fields, decomposed only
> where it pays; the principle is **corpus-wide** (ADRs included — work units convert first
> in practice). Revised Decision below. (Owner conversation, 2026-06-06.)

> **Scope note (library tier):** "YAML is the source of truth" below scopes the work-hierarchy units. The **library** tier's structured source on disk is **JSON** (`apps/studio/data/knowledge.json`, ADR-0018) — same structured-source / markdown-as-view principle, JSON encoding.

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

1. **One structured format — YAML is the source of truth.** Everything queried, validated,
   or graphed — capability list, dependency edges, contracts (`id`/assertion/`covers`),
   `proof_mode`, `status`, relationships — lives as **structured YAML fields**. Narrative is
   **not** exiled to a freeform body: it lives in **typed fields too** (a UAT's ordered
   `steps[]` of `{action, success}`, discrete `guidance[]` notes, a framing/`proof_note`
   field), decomposed **only where granular pull / query / validate pays** — long-form prose
   stays a single block-scalar field. (Owner, 2026-06-06: context is a first-class
   input/signal, treated like data/code; *and* over-decomposing is wasted effort — both hold.
   Text still lives at the **leaves** as typed, addressable values, never a body.)
2. **A schema enforces the discipline.** `packages/core` defines the unit schema (story /
   capability / contract / cross-story **boundary**) as a **zod validator**, and the corpus
   must validate against it — run in `pnpm typecheck` / CI. **The discipline comes from
   validation, not the format choice:** the old frontmatter was already structured and facts
   *still* leaked, because nothing forbade load-bearing data in prose. This is the encoding
   ADR-0002 deferred to `packages/core` and ADR-0010 said the schema would carry.
3. **Markdown is a rendered content-type, not the document container.** A prose field's value
   may be markdown-formatted text; the web UI renders it. Markdown stops being the *file
   format* (which forced the dumb structure-vs-readable choice) and becomes a *value type* for
   prose. The source is YAML; humans read the rendered UI, so raw-file ergonomics don't
   dictate the format. Any whole-document markdown view is **generated** from the YAML —
   output, not input.
4. **`covers` becomes validatable.** A contract's `covers` pointer is structured
   (`{file, lines}`, e.g. `{apps/studio/src/components/Library.tsx, "16-17"}`) so it can be
   **checked** (the file/line exists) and drive scaffolding — not a prose citation.
5. **Corpus-wide in principle; work units first in practice.** This is how the *whole* corpus
   is represented — ADRs, glossary, and guidelines are **not a special kind**, just a higher
   prose-to-structure ratio (an ADR = a few queryable fields — `status`, `supersedes`,
   `amends`, `references` — plus large block-scalar prose). Converting them later makes ADR
   relationships queryable, letting the [ADR-0003](0003-v1-reversal-ledger.md) reversal ledger
   be **generated** rather than hand-curated. Sequencing is effort-based: the **work-hierarchy
   units convert now** (they feed the agent engine, ADR-0011); docs follow the same model later.

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

- **single-file-per-unit vs a combined document** — lands with the `packages/core` schema.
  (YAML is decided; there is no separate prose body — narrative lives in typed fields, see
  Decision #1/#3.)
- The exact **zod/JSON-Schema shape** and the cross-story **boundary** term
  (`boundary`/`port`, still TBD per ADR-0010 §4).
- Whether the studio **edits** structured units directly or via a form — a studio concern.

## References

- [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (work hierarchy), [ADR-0010](0010-organism-model-story-bounded-context.md) (organism model; schema carrier), [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (context engineering consumes this).
- [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md); `stories/studio-foundation/` (the seed this restructures).
- Design conversation, 2026-06-06.
