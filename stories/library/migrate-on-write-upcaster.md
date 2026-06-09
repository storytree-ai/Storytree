---
id: "migrate-on-write-upcaster"
tier: capability
story: library
title: "Forward-migrate and version-stamp library docs on write"
outcome: "A library doc authored against an older schema is forward-migrated and version-stamped at the write boundary rather than rejected."
status: mapped
proof_mode: integration-test
depends_on: [library-schema-and-write-validation]
---

# Forward-migrate and version-stamp library docs on write

**Outcome —** A library doc authored against an older schema is forward-migrated and version-stamped at the write boundary rather than rejected.

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md)

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The full suite `packages/core/src/migrations.test.ts` (5/5 cases) is REAL and passing — I ran it (part of `@storytree/core` 48/48). It observationally verifies the upcaster + the `upcastAndValidate` seam offline. But storytree's prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) did NOT drive it red→green, so this is brownfield `mapped`, not `healthy`. One contract (`upcast-skips-already-migrated`) is a **would-be** test: with a single migration in the registry, the `m.version > v` skip guard is only exercised transitively (via idempotency), never in isolation.

## Guidance

The lazy half of the schema-evolution story (the eager half lives in [`eager-batch-migrate`](eager-batch-migrate.md)). The code edge justifying the `depends_on`: `migrations.ts:1` imports `KIND_SPECS` from `knowledge.ts` (`isStructuredKnowledge`, `migrations.ts:55-58`, gates on whether the kind is a structured key), and `store.ts:219-221` is `upcastAndValidate = validateLibraryDoc(upcast(...))` — `upcast` is composed INTO the validator, a genuine code call.

`CURRENT_SCHEMA_VERSION = 1` (`migrations.ts:18`); `MIGRATIONS` (`migrations.ts:37-48`) is the ordered forward registry — one migration today, `seeAlso-to-sources` (#1), which is mostly a defensive STAMP that drops a residual retired `seeAlso`. `upcast` (`migrations.ts:68-79`) reads a per-ROW version pin (`doc.schemaVersion` absent => 0 baseline), folds every pending `up()` where `m.version > v`, then re-stamps `schemaVersion = CURRENT_SCHEMA_VERSION`. A non-structured `LibraryAsset` passes through UNCHANGED (`migrations.ts:69`) because stamping it would break its `.strict()` schema (no `schemaVersion` field). `upcastAndValidate` (`store.ts:219-221`) is the helper every write boundary must use instead of bare `validateLibraryDoc`. Pure JS transforms on JSONB-shaped records — no DB. There are NO down-migrations (the append-only event log is the backup).

## Integration test

**Goal —** Run the real `upcast` (`migrations.ts`) composed with the real `validateLibraryDoc` (`store.ts`) — exactly the `upcastAndValidate` seam, no stubs — proving an old-shape doc is forward-migrated and stamped rather than rejected, and a current-shape doc validates unchanged.

The integration test exercises this capability against its **real in-story collaborator** — the schema validator from [`library-schema-and-write-validation`](library-schema-and-write-validation.md), composed live (ADR-0010 §2/§5). The REAL passing suite is `packages/core/src/migrations.test.ts` (5/5): a v0 `definition` carrying a stray `seeAlso` is upcast — `seeAlso` dropped, `schemaVersion` stamped to 1, and the RESULT then passes `validateLibraryDoc` (`migrations.test.ts:47-55`); `upcast` is idempotent (`migrations.test.ts:57-61`); a template asset passes through byte-for-byte with no `schemaVersion` stamped and still validates (`migrations.test.ts:63-70`); `upcastAndValidate` forwards a v0 doc that bare `validateLibraryDoc` throws on (`migrations.test.ts:72-78`); the `MIGRATIONS` registry is strictly version-ordered and its top equals `CURRENT_SCHEMA_VERSION` (`migrations.test.ts:80-88`). `mapped` (observational); the prove-it-gate did not drive it.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`upcast-drops-retired-and-stamps`** — Upcasting a v0 structured unit drops the retired field and stamps the version
   - **asserts —** `upcast` on a v0 `definition` with stray `seeAlso` returns it without `seeAlso`, `schemaVersion === CURRENT_SCHEMA_VERSION` (1), and the result then passes `validateLibraryDoc`.
   - **covers —** `packages/core/src/migrations.ts:37-48,68-79`
   - **proven by —** `packages/core/src/migrations.test.ts:47-55` (REAL, passing)
2. **`upcast-idempotent`** — Upcast is idempotent
   - **asserts —** `upcast(upcast(x))` deep-equals `upcast(x)` (re-running applies no further migration and re-stamps the same version).
   - **covers —** `packages/core/src/migrations.ts:70-78`
   - **proven by —** `packages/core/src/migrations.test.ts:57-61` (REAL, passing)
3. **`upcast-passes-through-asset`** — A rendered LibraryAsset passes through upcast unchanged
   - **asserts —** `upcast` on a body-bearing template asset returns it byte-for-byte with no `schemaVersion` stamped, and it still validates under the strict asset schema.
   - **covers —** `packages/core/src/migrations.ts:55-58,69`
   - **proven by —** `packages/core/src/migrations.test.ts:63-70` (REAL, passing)
4. **`upcast-and-validate-forwards-legacy`** — upcastAndValidate forwards a doc that bare validation would reject
   - **asserts —** `validateLibraryDoc` throws on the v0 `seeAlso` doc, but `upcastAndValidate` returns it stamped to `CURRENT_SCHEMA_VERSION` with `seeAlso` gone.
   - **covers —** `packages/core/src/store.ts:219-221`
   - **proven by —** `packages/core/src/migrations.test.ts:72-78` (REAL, passing)
5. **`migrations-registry-ordered`** — The migration registry is version-ordered and reaches the current version
   - **asserts —** `MIGRATIONS` versions are strictly increasing and the top entry's version equals `CURRENT_SCHEMA_VERSION`.
   - **covers —** `packages/core/src/migrations.ts:18,37-48`
   - **proven by —** `packages/core/src/migrations.test.ts:80-88` (REAL, passing)
6. **`upcast-skips-already-migrated`** — A migration whose version <= the doc's pin is not re-applied
   - **asserts —** Given a doc already at version N, `upcast` applies no `up()` for any `m.version <= N` (the `m.version > v` guard), in isolation.
   - **covers —** `packages/core/src/migrations.ts:72-77`
   - **would-be test —** only transitively exercised today (via idempotency) because there is a single migration; no isolated multi-migration assertion exists.
