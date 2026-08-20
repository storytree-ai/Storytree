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
# so this capability is single-node `--live`-buildable. The earlier `real:` arm was REMOVED by
# ADR-0094. ADR-0395 records this greenfield unit without a current signed pass as `proposed`;
# registration order does not make it brownfield or Adopt-bound.
# ADR-0098 (U5, the live pilot) RE-ADDS a `real:` arm — but a DIFFERENT kind from the removed ADR-0092
# one: this is an R2 `refactorForTests` build-tests config (a genuine structural red→green for this
# `proposed`, genuinely-untested pocket), borrowed by the story's `library#gate-4` `(build:)` annotation
# and driven via `storytree gate run library#gate-4 --real --pg`. It does NOT re-light a fail-closed
# blanket Build: the other six caps carry no `real:` arm, so the story is not real-buildable; only this
# build-tests gate drives it (ADR-0094 stands).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/**/*.ts"]
  # ADR-0098 R2 (refactor-for-testability): the entry-guarded `main()` seed orchestration is correct but
  # UNTESTABLE as-is (no injection seam). The leaf authors a seam test (the structural red is the missing
  # `runSeed` symbol), then refactors `main()` to extract a behaviour-preserving `runSeed(deps)` core; the
  # whole `@storytree/library` suite is the regression wall. install:true (the suite imports workspace
  # deps); pnpm proofCommand + typecheck per the schema. See `## Guidance` and story gate 4.
  real:
    testFile: "packages/library/src/store/load-corpus.runseed.test.ts"
    sourceFile: "packages/library/src/store/load-corpus.ts"
    scope:
      testGlobs: ["packages/library/src/store/load-corpus.runseed.test.ts"]
      sourceGlobs: ["packages/library/src/store/load-corpus.ts"]
    install: true
    refactorForTests: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
---

# Seed the library store from the studio knowledge files

**Outcome —** The store seeds every studio knowledge unit and template through the validated write boundary.

**Depends on —** [`event-sourced-store-seam`](event-sourced-store-seam.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `proposed` (no standalone behavioural test).** The data-provenance root: `loadFixtureCorpus` IS exercised TRANSITIVELY as a real collaborator inside the CLI seed (`cli.test.ts:16-20`) and the health SEED gate (`health.test.ts:191-203`), but NO test asserts its own returned counts, and `loadComments` / `applySchema` / `recordLedger` / both entry-guarded `main()`s have NO behavioural test (Postgres-specific / smoke-only). This greenfield capability has no current signed pass, so ADR-0395 keeps it `proposed`; the absent standalone coverage is recorded separately as proof detail. Every contract below is a **would-be** test. *(The observationally proven eager-migrate + render half split out to [`eager-batch-migrate`](eager-batch-migrate.md), which is also greenfield `proposed`.)*

## Guidance

The data-provenance root the seeded read store stands on — the seed/DDL plumbing that lands the studio corpus into the store, deliberately separated from the proven eager-migrate path because it carries a weaker proof posture.

`loadFixtureCorpus` reads the frozen fixture units + the `template` artifacts from `libraryTemplates()` (ADR-0210 — re-homed from the retired generated `assets.json`) and upserts each THROUGH the store write boundary (so validation/upcast run); it is store-agnostic and IS exercised — but only as a real collaborator inside OTHER capabilities' tests (the CLI seed and the health SEED gate), never by a count assertion of its own. `loadComments` (`load-corpus.ts`), `applySchema` (`migrate.ts:10-14`), `recordLedger` (`batch-migrate.ts:72-84`) and both entry-guarded `main()`s have NO behavioural test (Postgres-specific / smoke-only). The code edge for the `depends_on`: `loadFixtureCorpus` upserts through the `Store` seam ([`event-sourced-store-seam`](event-sourced-store-seam.md)) and each upsert runs `upcastAndValidate` at the boundary ([`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)).

### Build-tests R2 target (ADR-0098 d.6 — the live pilot, story gate 4)

The `library#gate-4` build-tests gate `(build:)`s this node and drives an **R2 refactor-for-testability** red→green over the `main()` seed orchestration (`load-corpus.ts:118-131`). `main()` is correct but UNTESTABLE as-is: it is `import.meta.url`-guarded and wires `createPool → applySchema → loadCorpus → loadComments` with no injection point, so the seed SEQUENCE has no offline test surface.

The refactor (behaviour-preserving — `main()`'s observable effect is unchanged): extract a **`runSeed(deps)`** core that `main()` calls, where `deps` injects the seed steps as the seam — `applySchema`, `loadCorpus`, and `loadComments` (the store + comment-loader, NOT a raw `Pool` — keep the seam at the already-injectable boundary so it is fakeable offline; `loadCorpus` already takes a `Store`). The new seam test (`load-corpus.runseed.test.ts`) imports `runSeed` and asserts it invokes the three steps **in order** against injected fakes (a recording double per step) — the structural RED is that `runSeed` does not exist yet (a missing-symbol/module-not-found failure), and IMPLEMENT introduces it. `main()` is then a thin wire: build the real deps (`createPool` → the real `applySchema`/`loadCorpus`/`loadComments`) and call `runSeed`. The whole `@storytree/library` suite is the regression wall — nothing else may go red. The Pg-bound `loadComments`/`applySchema` internals stay untested offline here (that is gate 5's live-gated pocket, owner D3); gate 4 proves only the seam + the orchestration sequence.

## Integration test

**Goal (would-be) —** Run `loadFixtureCorpus` against a real `InMemoryStore` and assert it upserts every fixture unit + template through the real validated write boundary and returns the expected `{knowledge, templates}` counts; run `applySchema` idempotently against a real pool (live-gated). NO such standalone assertion exists today — the loader is only proven transitively as a collaborator in the CLI and health-gate suites, and `applySchema`'s pool execution is Postgres-specific and unrun.

So the integration test for this capability is **would-be**: the seeding behaviour is observed only indirectly (a green CLI dashboard and an empty SEED gate both depend on the loader having run), never by a test that targets the seeder's own contract.

## Contracts (2)

The would-be leaf behaviours — each would be **one isolated automated test** against real in-story collaborators (no stubs; integration-test proof mode, ADR-0010 §2). Both are currently would-be tests.

1. **`loadcorpus-upserts-counts`** — the corpus loader upserts every unit and template through the store and returns counts
   - **asserts —** `loadFixtureCorpus(store)` reads the frozen fixture units + the templates from `libraryTemplates()` (ADR-0210), upserts each via `store.upsertDoc`, and returns `{knowledge, templates}` counts.
   - **covers —** `packages/library/src/fixture/index.ts`
   - **would-be test —** `loadFixtureCorpus` runs as a real collaborator inside `cli.test.ts` and `health.test.ts`, but no test asserts its own returned counts; the plumbing is `proposed`.
   - **note —** the contract ID is historical. Its subject was `loadCorpus`, which read the committed corpus seed; ADR-0302 D1 deleted both the seed and the loader, and `loadFixtureCorpus` is the successor doing the same job over a frozen literal. The id is left UNCHANGED deliberately — ids are the stable handle proof binds to, so renaming one to match a refactor is how a signed verdict gets re-pointed.
2. **`applyschema-idempotent`** — applySchema applies the idempotent DDL to a pool
   - **asserts —** `applySchema` runs `schema.sql` against a pool and is safe to apply twice (all `CREATE ... IF NOT EXISTS`).
   - **covers —** `packages/library/src/store/migrate.ts:10-14`
   - **would-be test —** only the DDL shape is asserted offline (`packages/library/src/store/store.test.ts:20-38`); `applySchema`'s execution against a pool is Postgres-specific and untested.
