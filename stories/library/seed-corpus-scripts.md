---
id: "seed-corpus-scripts"
tier: capability
story: library
title: "Seed the library store from the studio knowledge files"
outcome: "The store seeds every studio knowledge unit and template through the validated write boundary."
status: proposed
proof_mode: integration-test
depends_on: [event-sourced-store-seam, migrate-on-write-upcaster]
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real packages/library source,
# so this capability is single-node `--live`-buildable. The ADR-0092 brownfield `real:` arm was REMOVED
# (ADR-0094 supersedes_in_part 92 d.5): the library is `mapped`, so its green path is Adopt (the story's
# `## Reliability Gates`, ADR-0085), not a fail-closed `--real` Build.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/**/*.ts"]
---

# Seed the library store from the studio knowledge files

**Outcome —** The store seeds every studio knowledge unit and template through the validated write boundary.

**Depends on —** [`event-sourced-store-seam`](event-sourced-store-seam.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `proposed` (no standalone behavioural test).** The data-provenance root: `loadCorpus` IS exercised TRANSITIVELY as a real collaborator inside the CLI seed (`cli.test.ts:16-20`) and the health SEED gate (`health.test.ts:191-203`), but NO test asserts its own returned counts, and `loadComments` / `applySchema` / `recordLedger` / both entry-guarded `main()`s have NO behavioural test (Postgres-specific / smoke-only). Per the glossary a capability is `mapped` only when its dominant behaviour is observationally verified by an existing test suite — that bar is NOT met here in isolation, so this half is honestly `proposed`. Every contract below is a **would-be** test. *(The genuinely-proven eager-migrate + render half split out to [`eager-batch-migrate`](eager-batch-migrate.md), which is `mapped`.)*

## Guidance

The data-provenance root the seeded read store stands on — the seed/DDL plumbing that lands the studio corpus into the store, deliberately separated from the proven eager-migrate path because it carries a weaker proof posture.

`loadCorpus` (`load-corpus.ts:61-74`) reads `knowledge.json` + the generated template assets from `assets.json` and upserts each THROUGH the store write boundary (so validation/upcast run); it is store-agnostic and IS exercised — but only as a real collaborator inside OTHER capabilities' tests (the CLI seed and the health SEED gate), never by a count assertion of its own. `loadComments` (`load-corpus.ts:82-112`), `applySchema` (`migrate.ts:10-14`), `recordLedger` (`batch-migrate.ts:72-84`) and both entry-guarded `main()`s have NO behavioural test (Postgres-specific / smoke-only). The code edge for the `depends_on`: `loadCorpus` upserts through the `Store` seam ([`event-sourced-store-seam`](event-sourced-store-seam.md)) and each upsert runs `upcastAndValidate` at the boundary ([`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)).

## Integration test

**Goal (would-be) —** Run `loadCorpus` against a real `InMemoryStore` and assert it upserts every knowledge unit + template through the real validated write boundary and returns the expected `{knowledge, templates}` counts; run `applySchema` idempotently against a real pool (live-gated). NO such standalone assertion exists today — `loadCorpus` is only proven transitively as a collaborator in the CLI and health-gate suites, and `applySchema`'s pool execution is Postgres-specific and unrun.

So the integration test for this capability is **would-be**: the seeding behaviour is observed only indirectly (a green CLI dashboard and an empty SEED gate both depend on `loadCorpus` having run), never by a test that targets the seeder's own contract.

## Contracts (2)

The would-be leaf behaviours — each would be **one isolated automated test** against real in-story collaborators (no stubs; integration-test proof mode, ADR-0010 §2). Both are currently would-be tests.

1. **`loadcorpus-upserts-counts`** — loadCorpus upserts every knowledge unit and template through the store and returns counts
   - **asserts —** `loadCorpus(store)` reads `knowledge.json` + the generated templates from `assets.json`, upserts each via `store.upsertDoc`, and returns `{knowledge, templates}` counts.
   - **covers —** `packages/library/src/store/load-corpus.ts:61-74`
   - **would-be test —** `loadCorpus` runs as a real collaborator inside `cli.test.ts` and `health.test.ts:191-203`, but no test asserts its own returned counts; the seed plumbing is `proposed`.
2. **`applyschema-idempotent`** — applySchema applies the idempotent DDL to a pool
   - **asserts —** `applySchema` runs `schema.sql` against a pool and is safe to apply twice (all `CREATE ... IF NOT EXISTS`).
   - **covers —** `packages/library/src/store/migrate.ts:10-14`
   - **would-be test —** only the DDL shape is asserted offline (`packages/library/src/store/store.test.ts:20-38`); `applySchema`'s execution against a pool is Postgres-specific and untested.
