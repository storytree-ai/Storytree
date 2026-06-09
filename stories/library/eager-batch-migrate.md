---
id: "eager-batch-migrate"
tier: capability
story: library
title: "Eagerly drain the version tail and render stored docs for reading"
outcome: "A lagging library doc is bulk forward-migrated in place non-destructively at the store boundary."
status: mapped
proof_mode: integration-test
depends_on: [event-sourced-store-seam, migrate-on-write-upcaster]
---

# Eagerly drain the version tail and render stored docs for reading

**Outcome —** A lagging library doc is bulk forward-migrated in place non-destructively at the store boundary.

**Depends on —** [`event-sourced-store-seam`](event-sourced-store-seam.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The EAGER BATCH migrator (`batchMigrate`) and the read adapter (`renderStoredDoc`) are genuinely proven offline: `packages/store/src/batch-migrate.test.ts` (3/3) and `packages/store/src/render-doc.test.ts` (4/4) are REAL passing tests I ran (part of `@storytree/store` 16-pass). storytree's prove-it-gate did NOT drive them red→green, so this is brownfield `mapped`, not `healthy`. Every contract below has a real passing test. *(The seed-script half — `loadCorpus` / `loadComments` / `applySchema` / `recordLedger` — split out to [`seed-corpus-scripts`](seed-corpus-scripts.md), which is honestly `proposed`.)*

## Guidance

The eager-migration root the CLI's read store stands on, plus the read adapter that shapes a stored doc for viewing.

**EAGER BATCH (proven, `mapped`):** `batchMigrate` (`packages/store/src/batch-migrate.ts:48-66`) is store-agnostic — it takes a `Store`, `queryDocs()` every live artifact, runs core `upcast` on each, and re-upserts ONLY rows whose `schemaVersion` actually changed (`after === before` guard, `batch-migrate.ts:56`), preserving all other content; deliberately NON-DESTRUCTIVE, unlike `load-corpus --force`. `schemaVersionOf` (`batch-migrate.ts:27-33`) treats absent/non-numeric as 0. The code edge: `batch-migrate.ts:4` imports `upcast` + `CURRENT_SCHEMA_VERSION` from `@storytree/core` (the migrate capability) and the `Store` type (line 3); its `main()` also imports `PgLibraryStore` + `createPool`.

**RENDER (proven, `mapped`):** `render-doc` is folded here as the read shaping the eager-migrated store feeds: `renderStoredDoc` (`packages/store/src/render-doc.ts:62-98`) maps a `StoredDoc` into the studio GuidanceAsset wire shape, deriving structured bodies via core `renderBody` (a code edge to knowledge-render) and passing template/edited bodies through; it is fully proven (4 passing tests). *(NOTE — open call: `render-doc`'s only live consumer is the CLI view path (`commands.ts:14` → `viewArtifact` `commands.ts:219`), not `batchMigrate`; it co-resides here by package locality. The owner may prefer to move it under `library-cli` where it actually couples — see story open call #7.)*

## Integration test

**Goal —** Run `batchMigrate` against a real `InMemoryStore` seeded with a real v0 doc, and run `renderStoredDoc` against real `StoredDoc` envelopes + the real core `renderBody` — no stubs — proving the version tail drains non-destructively and stored docs render into the studio wire shape.

Real collaborators, no stubs: `batchMigrate` run against a REAL `InMemoryStore` seeded with a real v0 doc — `packages/store/src/batch-migrate.test.ts` (3/3 passing): a v0 structured doc is upgraded in place to `CURRENT_SCHEMA_VERSION` with `seeAlso` dropped and title/references preserved, returning `{scanned:1,upgraded:1}` (`batch-migrate.test.ts:30-51`); a second run is a no-op `{scanned:1,upgraded:0}` (`batch-migrate.test.ts:53-64`); a non-structured asset is left untouched, no `schemaVersion` stamped (`batch-migrate.test.ts:66-86`). `renderStoredDoc` is proven against real `StoredDoc` envelopes + real core `renderBody` — `render-doc.test.ts` (4/4 passing): structured principle body derived byte-for-byte (`render-doc.test.ts:13-48`), template body passed through (`render-doc.test.ts:50-73`), edited asset keeps its category (`render-doc.test.ts:75-97`), body-doc missing category falls back to the kind (`render-doc.test.ts:99-109`).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** against real in-story collaborators (no stubs; integration-test proof mode, ADR-0010 §2). Every contract here has a real passing test (`proven by`).

1. **`batch-upgrades-in-place`** — Batch-migrate upgrades a lagging structured doc in place, preserving content
   - **asserts —** `batchMigrate` on a store holding one v0 doc returns `{scanned:1,upgraded:1}`, stamps `schemaVersion`, drops `seeAlso`, and preserves title + references.
   - **covers —** `packages/store/src/batch-migrate.ts:48-66`
   - **proven by —** `packages/store/src/batch-migrate.test.ts:30-51` (REAL, passing)
2. **`batch-rerun-noop`** — Re-running batch-migrate is a no-op
   - **asserts —** A second `batchMigrate` over the same store returns `{scanned:1,upgraded:0}` (already-current rows skipped).
   - **covers —** `packages/store/src/batch-migrate.ts:53-56`
   - **proven by —** `packages/store/src/batch-migrate.test.ts:53-64` (REAL, passing)
3. **`batch-leaves-asset-untouched`** — Batch-migrate leaves a non-structured asset untouched
   - **asserts —** `batchMigrate` over a template asset returns `upgraded:0` and stamps no `schemaVersion` (upcast passthrough => `after === before`).
   - **covers —** `packages/store/src/batch-migrate.ts:52-56`
   - **proven by —** `packages/store/src/batch-migrate.test.ts:66-86` (REAL, passing)
4. **`render-derives-structured-body`** — renderStoredDoc derives a structured unit's body with category = kind
   - **asserts —** A structured principle renders with `body === core renderBody(...)` byte-for-byte, `category` = the stored kind, and timestamps from the `StoredDoc` envelope.
   - **covers —** `packages/store/src/render-doc.ts:83-97`
   - **proven by —** `packages/store/src/render-doc.test.ts:13-48` (REAL, passing)
5. **`render-passes-through-body`** — renderStoredDoc passes a body-bearing doc through with its own category
   - **asserts —** A template/edited body doc renders with its string body verbatim and its own category.
   - **covers —** `packages/store/src/render-doc.ts:65-81`
   - **proven by —** `packages/store/src/render-doc.test.ts:50-73` (REAL, passing)
6. **`render-category-fallback-to-kind`** — renderStoredDoc falls back to the stored kind when a body doc omits category
   - **asserts —** A body-bearing doc with no `category` renders with `category` = the stored `kind`.
   - **covers —** `packages/store/src/render-doc.ts:65-81`
   - **proven by —** `packages/store/src/render-doc.test.ts:99-109` (REAL, passing)
