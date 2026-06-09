---
id: "event-sourced-store-seam"
tier: capability
story: library
title: "The narrow event-sourced Store seam (in-memory + Postgres)"
outcome: "A narrow Store seam appends every write as a history event and updates a current-state projection atomically."
status: mapped
proof_mode: integration-test
depends_on: [library-schema-and-write-validation, migrate-on-write-upcaster]
---

# The narrow event-sourced Store seam (in-memory + Postgres)

**Outcome —** A narrow Store seam appends every write as a history event and updates a current-state projection atomically.

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — the riskiest `mapped` call: a `mapped` in-memory half + a `proposed` Postgres half.** The IN-MEMORY seam is genuinely proven offline: `storeParitySuite` (5 contracts) + 3 InMemoryStore-specific tests are REAL and passing (`packages/core/src/store.test.ts`, part of `@storytree/core` 48/48). storytree's prove-it-gate did NOT drive them, so even the in-memory half is `mapped`, not `healthy`. The POSTGRES half — `PgLibraryStore`'s transactional read/write and the IAM `createPool` connection — is `proposed`: it is proven ONLY by the same parity suite registered against a real `PgLibraryStore` under `STORYTREE_DB_LIVE=1` (`packages/store/src/store.test.ts:91-92`), which is a visible **skip** by default (`store.test.ts:94-97`). The `InMemoryStore` parity run proves the *contract* offline but never touches the Pg impl, so the two Pg contracts below are **would-be** tests.

## Guidance

The persistence seam (ADR-0017: history = events, current = projection; relationships are ID refs inside docs, NEVER foreign keys). The `Store` interface (`store.ts:45-63`) is intentionally narrow; `InMemoryStore` (`store.ts:72-162`) is the offline reference impl whose `upsertDoc` atomically appends a `created`/`updated` event AND updates the projection (`store.ts:77-102`), with a monotonic `seq` (`store.ts:143-161`). `storeParitySuite` (`store.ts:229-288`) is EXPORTED on purpose: it registers 5 behavioural contracts so ANY impl is held to the same bar.

**v1 lineage —** the exported `storeParitySuite()` is the v2 form of V1's **trait-parity testing** (`legacy/Agentic/stories/4.yml` ↔ `5.yml`): V1 authored story 4's Store-trait harness against `dyn Store` and re-ran the *same* harness against story 5's `SurrealStore` — the reuse, not a copy, is what proved the trait was a real abstraction rather than a 1-impl stub. Here the same contract suite runs against both `InMemoryStore` and `PgLibraryStore`, which is exactly what makes the Store seam real and not a single-impl façade. This is also why open call #2 (don't split the seam into two capabilities) is the lineage-consistent choice: one exported parity contract deliberately shared across both impls is the whole proof, and splitting it would sever the parity claim the way V1 was careful never to.

The code edge for the `depends_on`: the Postgres impl `PgLibraryStore.upsertDoc` (`packages/store/src/pg-store.ts:74-125`) calls `upcastAndValidate` (`pg-store.ts:83`) at the write boundary BEFORE its `BEGIN`/`COMMIT` and PERSISTS THE UPCAST OUTPUT — a real call into both the schema-validation and migrate-on-write capabilities. `PgLibraryStore` mirrors the same event+projection-in-one-transaction shape against `events.library_event` + `events.library_artifact` (`schema.sql:8-25`). HONESTY TRAP: the in-memory seam is fully proven offline, but the Postgres transactional behaviour is proven only by the live-gated parity run (`store.test.ts:91-92`, `STORYTREE_DB_LIVE=1`) which is SKIPPED by default — so the `InMemoryStore` proves the CONTRACT offline while the Pg impl's real read/write/connection behaviour is `proposed`.

## Integration test

**Goal —** Hold both Store implementations to the same exported parity suite against real collaborators (no stubs): the in-memory impl offline, and the real `PgLibraryStore` under the live-DB gate, proving every write appends a history event and updates the current-state projection together.

Real collaborators, no stubs: `storeParitySuite` (`packages/core/src/store.ts:229-288`) is run against a REAL `InMemoryStore` at `store.test.ts:6` — 5 passing parity tests (upsert replaces + bumps `updatedAt` + preserves `createdAt`; `appendEvent` monotonic `seq` + order; `getDoc(absent)=null`; `queryDocs` empty=`[]`; `deleteDoc` idempotent), plus 3 `InMemoryStore`-specific passing tests (event+projection atomicity `store.test.ts:8-23`, `deleteDoc` appends a deleted event `store.test.ts:25-32`, `queryDocs` filters by kind `store.test.ts:34-40`).

The SAME suite is registered against a REAL `PgLibraryStore` (`packages/store/src/store.test.ts:91-92` via `makePgStore` `store.test.ts:79-89`) but only under `STORYTREE_DB_LIVE=1`; by default it is a visible skip placeholder (`store.test.ts:94-97`) — so the Postgres half is would-be (`proposed`) and the in-memory half is `mapped`. `connection.ts` / `pg-store.ts` / `load-corpus.ts` also pass a real offline import-smoke test (`store.test.ts:58-71`) asserting the ADR-0015 instance + database constants.

## Contracts (8)

The test-proven leaf behaviours — each **one isolated leaf behaviour** under one automated test (no stubs: these are collaborator-free `InMemoryStore`/parity tests, matching this capability's integration-test proof mode, ADR-0010 §2). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`upsert-replaces-and-bumps`** — Upsert on the same id replaces, preserves createdAt, bumps updatedAt
   - **asserts —** Two upserts on id `u1` leave one doc with the latest body, `createdAt` preserved, `updatedAt >=` the first.
   - **covers —** `packages/core/src/store.ts:77-102`
   - **proven by —** `packages/core/src/store.ts:233-248` (the parity contract, run at `packages/core/src/store.test.ts:6`) (REAL, passing)
2. **`append-event-monotonic-seq`** — appendEvent preserves order with strictly increasing seq
   - **asserts —** Three appended events read back in insertion order with strictly increasing `seq`.
   - **covers —** `packages/core/src/store.ts:128-161`
   - **proven by —** `packages/core/src/store.ts:250-266` (run at `packages/core/src/store.test.ts:6`) (REAL, passing)
3. **`getdoc-absent-null`** — getDoc of an absent id returns null
   - **asserts —** `getDoc('does-not-exist')` returns `null` and does not throw.
   - **covers —** `packages/core/src/store.ts:104-106`
   - **proven by —** `packages/core/src/store.ts:268-272` (run at `packages/core/src/store.test.ts:6`) (REAL, passing)
4. **`querydocs-empty-array`** — queryDocs on an empty store returns []
   - **asserts —** `queryDocs()` and `queryDocs({kind})` on an empty store both return `[]` without throwing.
   - **covers —** `packages/core/src/store.ts:108-112`
   - **proven by —** `packages/core/src/store.ts:274-280` (run at `packages/core/src/store.test.ts:6`) (REAL, passing)
5. **`deletedoc-idempotent`** — deleteDoc is idempotent
   - **asserts —** First `deleteDoc` returns `true`, second returns `false`.
   - **covers —** `packages/core/src/store.ts:114-126`
   - **proven by —** `packages/core/src/store.ts:282-287` (run at `packages/core/src/store.test.ts:6`) (REAL, passing)
6. **`upsert-event-and-projection-atomic`** — Upsert appends created-then-updated events with the actor and updates the projection
   - **asserts —** Two upserts on id `x` append a `created` event (actor alice) then an `updated` event (actor bob), and `getDoc` returns the latest body.
   - **covers —** `packages/core/src/store.ts:77-102`
   - **proven by —** `packages/core/src/store.test.ts:8-23` (REAL, passing)
7. **`pg-upsert-transactional-event-projection`** — PgLibraryStore upserts event + projection in one transaction at the migrate-on-write boundary
   - **asserts —** `PgLibraryStore.upsertDoc` `upcastAndValidate`s the doc, then in one `BEGIN`/`COMMIT` appends a `created`/`updated` event and upserts the projection, preserving `createdAt` and bumping `updatedAt` on same-id replace.
   - **covers —** `packages/store/src/pg-store.ts:74-125`
   - **would-be test —** proven only by the live-gated parity run (`packages/store/src/store.test.ts:91-92` under `STORYTREE_DB_LIVE=1`), which is **skipped by default**; no offline assertion touches the Pg impl.
8. **`pg-createpool-iam-no-password`** — createPool builds a pg Pool over the Cloud SQL connector with IAM auth and no password
   - **asserts —** `createPool` wires a `pg` `Pool` from the connector's `getOptions` with `AuthTypes.IAM`, the operator IAM user, and no password.
   - **covers —** `packages/store/src/connection.ts:43-64`
   - **would-be test —** only the import-smoke test (`store.test.ts:58-71`) touches `createPool`'s existence; its IAM/no-password wiring is exercised only behind the live-DB gate.
