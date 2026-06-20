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

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The full suite `packages/library/src/migrations.test.ts` is REAL and passing — I ran it (part of the `@storytree/library` suite, 99 pass + 1 live-gated skip). It observationally verifies the upcaster + the `upcastAndValidate` seam offline. But storytree's prove-it-gate (`packages/orchestrator/src/prove-it-gate.ts`) did NOT drive it red→green, so this is brownfield `mapped`, not `healthy`. One contract (`upcast-skips-already-migrated`) is a **would-be** test: the `m.version > v` skip guard is only exercised transitively (a v1-pinned doc skips migration #1 while #2 applies, but #1 is a no-op on those fixtures), never by an isolated assertion of the skip.

## Guidance

The lazy half of the schema-evolution story (the eager half lives in [`eager-batch-migrate`](eager-batch-migrate.md)). The code edge justifying the `depends_on`: `migrations.ts:1` imports `KIND_SPECS` from `knowledge.ts` (`isStructuredKnowledge`, `migrations.ts:104-107`, gates on whether the kind is a structured key), and `library-doc.ts:67-69` is `upcastAndValidate = validateLibraryDoc(upcast(...))` — `upcast` is composed INTO the validator, a genuine code call.

`CURRENT_SCHEMA_VERSION = 2` (`migrations.ts:18`); `MIGRATIONS` (`migrations.ts:52-97`) is the ordered forward registry — `seeAlso-to-sources` (#1), mostly a defensive STAMP that drops a residual retired `seeAlso`, and the ADR-0029 `agent-context-assembly-reshape` (#2). `upcast` (`migrations.ts:117-128`) reads a per-ROW version pin (`doc.schemaVersion` absent => 0 baseline), folds every pending `up()` where `m.version > v`, then re-stamps `schemaVersion = CURRENT_SCHEMA_VERSION`. A non-structured `LibraryAsset` passes through UNCHANGED (`migrations.ts:118`) because stamping it would break its `.strict()` schema (no `schemaVersion` field). `upcastAndValidate` (`library-doc.ts:67-69`) is the helper every write boundary must use instead of bare `validateLibraryDoc`. Pure JS transforms on JSONB-shaped records — no DB. There are NO down-migrations (the append-only event log is the backup).

## Integration test

**Goal —** Run the real `upcast` (`migrations.ts`) composed with the real `validateLibraryDoc` (`library-doc.ts`) — exactly the `upcastAndValidate` seam, no stubs — proving an old-shape doc is forward-migrated and stamped rather than rejected, and a current-shape doc validates unchanged.

The integration test exercises this capability against its **real in-story collaborator** — the schema validator from [`library-schema-and-write-validation`](library-schema-and-write-validation.md), composed live (ADR-0010 §2/§5). The REAL passing tests are in `packages/library/src/migrations.test.ts`: a v0 `definition` carrying a stray `seeAlso` is upcast — `seeAlso` dropped, `schemaVersion` stamped to `CURRENT_SCHEMA_VERSION`, and the RESULT then passes `validateLibraryDoc` (`migrations.test.ts:47-55`); `upcast` is idempotent (`migrations.test.ts:57-61`); a template asset passes through byte-for-byte with no `schemaVersion` stamped and still validates (`migrations.test.ts:63-70`); `upcastAndValidate` forwards a v0 doc that bare `validateLibraryDoc` throws on (`migrations.test.ts:72-78`); the `MIGRATIONS` registry is strictly version-ordered and its top equals `CURRENT_SCHEMA_VERSION` (`migrations.test.ts:155-163`). `mapped` (observational); the prove-it-gate did not drive it.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`upcast-drops-retired-and-stamps`** — Upcasting a v0 structured unit drops the retired field and stamps the version
   - **asserts —** `upcast` on a v0 `definition` with stray `seeAlso` returns it without `seeAlso`, `schemaVersion === CURRENT_SCHEMA_VERSION` (2), and the result then passes `validateLibraryDoc`.
   - **covers —** `packages/library/src/migrations.ts:52-97,117-128`
   - **proven by —** `packages/library/src/migrations.test.ts:47-55` (REAL, passing)
2. **`upcast-idempotent`** — Upcast is idempotent
   - **asserts —** `upcast(upcast(x))` deep-equals `upcast(x)` (re-running applies no further migration and re-stamps the same version).
   - **covers —** `packages/library/src/migrations.ts:117-128`
   - **proven by —** `packages/library/src/migrations.test.ts:57-61` (REAL, passing)
3. **`upcast-passes-through-asset`** — A rendered LibraryAsset passes through upcast unchanged
   - **asserts —** `upcast` on a body-bearing template asset returns it byte-for-byte with no `schemaVersion` stamped, and it still validates under the strict asset schema.
   - **covers —** `packages/library/src/migrations.ts:104-107,118`
   - **proven by —** `packages/library/src/migrations.test.ts:63-70` (REAL, passing)
4. **`upcast-and-validate-forwards-legacy`** — upcastAndValidate forwards a doc that bare validation would reject
   - **asserts —** `validateLibraryDoc` throws on the v0 `seeAlso` doc, but `upcastAndValidate` returns it stamped to `CURRENT_SCHEMA_VERSION` with `seeAlso` gone.
   - **covers —** `packages/library/src/library-doc.ts:67-69`
   - **proven by —** `packages/library/src/migrations.test.ts:72-78` (REAL, passing)
5. **`migrations-registry-ordered`** — The migration registry is version-ordered and reaches the current version
   - **asserts —** `MIGRATIONS` versions are strictly increasing and the top entry's version equals `CURRENT_SCHEMA_VERSION`.
   - **covers —** `packages/library/src/migrations.ts:18,52-97`
   - **proven by —** `packages/library/src/migrations.test.ts:155-163` (REAL, passing)
6. **`upcast-skips-already-migrated`** — A migration whose version <= the doc's pin is not re-applied
   - **asserts —** Given a doc already at version N, `upcast` applies no `up()` for any `m.version <= N` (the `m.version > v` guard), in isolation.
   - **covers —** `packages/library/src/migrations.ts:121-126`
   - **would-be test —** only transitively exercised today (the idempotency tests re-skip both migrations, and a v1-pinned agent doc skips migration #1 while #2 applies — but #1 is a no-op on those fixtures, so removing the `m.version > v` guard fails no test); no isolated assertion of the `m.version <= N` skip exists.
