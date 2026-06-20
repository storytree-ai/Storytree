# Cross-story interface: `oq-proposal-authoring`

A declared cross-story interface per [ADR-0010 §4](../../docs/decisions/0010-organism-model-story-bounded-context.md)
(declared 2026-06-11, resolving `feedback-graduation` owner call #3). ADR-0010 leaves the schema
term provisional (`boundary` / `port`) and names no canonical location, so this one-pager lives
with the owning story; ratify shape and home when `packages/library` formalises the entity.

## Name

`oq-proposal-authoring` — the open-question / proposal authoring path: how new decision-bearing
signal enters the Library and flows to an ADR (the
[ADR-0018](../../docs/decisions/0018-knowledge-tier-phase1-structured-source.md) §6 OQ lifecycle:
owner decisions park as `open-question` units, the owner comments, an agent records the resolution
in an ADR and retires the unit).

## Owner

The **`library`** story ([story](story.md)) — the schema, the validated write boundary, and the
CLI surface are all its capabilities (`library-schema-and-write-validation`,
`event-sourced-store-seam`, `library-cli`).

## What constitutes the interface

- The **`open-question`** kind in `KIND_SPECS` and its **`OpenQuestion`** schema
  ([`packages/library/src/knowledge.ts`](../../packages/library/src/knowledge.ts)) — the validated doc
  shape an authored OQ/proposal must satisfy.
- The Store seam's validated write boundary — **`upsertDoc`** through
  **`upcastAndValidate`** / **`validateLibraryDoc`**
  ([`packages/library/src/library-doc.ts`](../../packages/library/src/library-doc.ts),
  [`packages/library/src/store/pg-store.ts`](../../packages/library/src/store/pg-store.ts)) — every authored unit
  enters as an event + projection write, zod-validated.
- The CLI authoring surface (ADR-0023): `storytree library artifact new --file <doc.json> --pg` ·
  `storytree library artifact edit <id> --set <field>=<value> --pg`.

Everything else about the Library (health gate, batch migration, rendering) is story-internal —
consumers author through the surfaces above only.

## Consumers

- [`stories/feedback-graduation`](../feedback-graduation/story.md) — `signal-synthesis` (deferred)
  graduates accumulated signal by emitting open-questions / proposals through this path; it never
  writes Library state any other way.
