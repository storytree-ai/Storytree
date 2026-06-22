---
id: "event-sourced-store-seam"
tier: capability
story: library
title: "The narrow event-sourced Store seam over the keyless events schema (in-memory + Postgres)"
outcome: "A narrow Store seam appends every write as a history event and updates a current-state projection atomically, over one keyless-IAM events schema."
status: mapped
proof_mode: integration-test
depends_on: [library-schema-and-write-validation, migrate-on-write-upcaster]
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real Postgres Store seam, so
# this capability is single-node `--live`-buildable. The ADR-0092 brownfield `real:` arm (which carried
# `db: true`, ADR-0064 — an ISOLATED test database, never production) was REMOVED (ADR-0094
# supersedes_in_part 92 d.5): the library is `mapped`, so its green path is Adopt (the story's
# `## Reliability Gates`, ADR-0085), not a fail-closed `--real` Build.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/**/*.ts"]
---

# The narrow event-sourced Store seam over the keyless `events` schema (in-memory + Postgres)

**Outcome —** A narrow Store seam appends every write as a history event and updates a current-state projection atomically, over one keyless-IAM `events` schema.

**Depends on —** [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Substrate re-home (ADR-0077).** This capability absorbed the shared-persistence competence
> the dissolved `stories/store` story declared as two peer capabilities — `keyless-store-connection`
> (`packages/library/src/store/connection.ts`) and `shared-events-schema`
> (`packages/library/src/store/schema.sql`). They are NOT re-homed as separate library capabilities:
> the keyless Cloud SQL connection and the one `events` schema are the substrate the live half of
> THIS seam writes through, proven by the same one exported parity run — aspects of the one
> Store-seam journey, not two peer journeys. They land here as the Pg-pocket contracts below
> (`pg-createpool-iam-no-password`, `schema-shape-stable`), keeping their honest `mapped`/`proposed`
> (live-DB-gated, integration-test) status — never claiming a status the offline run can't back.

> **Proof status (honest) — the riskiest `mapped` call: a `mapped` in-memory half + a `proposed` Postgres half.** The IN-MEMORY seam is genuinely proven offline: `storeParitySuite` (5 contracts, `@storytree/storage-protocol/parity`) + 3 InMemoryStore-specific tests are REAL and passing (the `@storytree/storage-protocol` parity suite + `packages/library/src/store/store.test.ts`). storytree's prove-it-gate did NOT drive them, so even the in-memory half is `mapped`, not `healthy`. The POSTGRES half — `PgLibraryStore`'s transactional read/write, the one shared `events` schema (`schema.sql`), and the keyless-IAM `createPool` connection (`connection.ts`) — is `proposed`: it is proven ONLY by the same parity suite registered against a real `PgLibraryStore` under `STORYTREE_DB_LIVE=1` (`packages/library/src/store/store.test.ts:101`), which is a visible **skip** by default (`store.test.ts:103-106`). The `InMemoryStore` parity run proves the *contract* offline but never touches the Pg impl, the connection, or the schema, so the three Pg/substrate contracts below are **would-be** tests.

## Guidance

The persistence seam (ADR-0017: history = events, current = projection; relationships are ID refs inside docs, NEVER foreign keys). The `Store` interface (`packages/storage-protocol/src/store.ts:60-72`) is intentionally narrow; `InMemoryStore` (`packages/storage-protocol/src/store.ts:116`) is the offline reference impl whose `upsertDoc` atomically appends a `created`/`updated` event AND updates the projection (`store.ts:122-148`), with a monotonic `seq` (`appendEvent`, `store.ts:173`). `storeParitySuite` (`packages/storage-protocol/src/store-parity.ts:60`) is EXPORTED on purpose (consumed via the `@storytree/storage-protocol/parity` subpath): it registers the behavioural contracts so ANY impl is held to the same bar.

**v1 lineage —** the exported `storeParitySuite()` is the v2 form of V1's **trait-parity testing** (`legacy/Agentic/stories/4.yml` ↔ `5.yml`): V1 authored story 4's Store-trait harness against `dyn Store` and re-ran the *same* harness against story 5's `SurrealStore` — the reuse, not a copy, is what proved the trait was a real abstraction rather than a 1-impl stub. Here the same contract suite runs against both `InMemoryStore` and `PgLibraryStore`, which is exactly what makes the Store seam real and not a single-impl façade. This is also why open call #2 (don't split the seam into two capabilities) is the lineage-consistent choice: one exported parity contract deliberately shared across both impls is the whole proof, and splitting it would sever the parity claim the way V1 was careful never to.

The code edge for the `depends_on`: the Postgres impl `PgLibraryStore.upsertDoc` (`packages/library/src/store/pg-store.ts:75-126`) calls `upcastAndValidate` (`pg-store.ts:84`) at the write boundary BEFORE its `BEGIN`/`COMMIT` and PERSISTS THE UPCAST OUTPUT — a real call into both the schema-validation and migrate-on-write capabilities. `PgLibraryStore` mirrors the same event+projection-in-one-transaction shape against `events.library_event` + `events.library_artifact` (`packages/library/src/store/schema.sql:8-25`).

**The substrate this seam writes through (re-homed from `stories/store`, ADR-0077).** Two pieces of the live half are now part of THIS capability rather than peer capabilities:

- **The keyless connection (`connection.ts`).** `createPool` (`packages/library/src/store/connection.ts:43-71`) builds a plain `pg` `Pool` over the Cloud SQL Node connector with `AuthTypes.IAM` — the session's IAM principal email is the DB user (`STORYTREE_DB_USER`), and there is deliberately **no password and no JSON key** (ADR-0021 keyless; ADR-0019 plain `node-pg`, no DBOS). A down/idle-stopped instance surfaces as a connection error the CLI maps to `pnpm db:up` guidance — never a forged success.
- **The one shared `events` schema (`schema.sql`).** `events` (`packages/library/src/store/schema.sql`) is the single substrate hosting EVERY organism's append-only history plus its one-row current-state projection — library docs/comments, notice-board sessions, studio-members, and the work/verdict/attestation log — each written under transactional upsert (event + projection in one txn), with relationships as in-doc ID pointers (no foreign keys, ADR-0017). `PgLibraryStore` is the library's own per-domain realization over the `library_event` + `library_artifact` tables; the sibling stores (`PgPresenceStore`, `PgUserStore`, the verdict log read via the `proof-protocol` port) write their own tables in the same schema.

HONESTY TRAP: the in-memory seam is fully proven offline, and the schema's table-shape + no-foreign-key invariant has a REAL offline assertion (`store.test.ts:20-39`); but the Postgres transactional behaviour AND the keyless connection's IAM wiring are proven only by the live-gated parity run (`store.test.ts:101`, `STORYTREE_DB_LIVE=1`) which is SKIPPED by default — so the `InMemoryStore` proves the CONTRACT offline while the Pg impl's real read/write and the live connection remain `proposed`.

## Integration test

**Goal —** Hold both Store implementations to the same exported parity suite against real collaborators (no stubs): the in-memory impl offline, and the real `PgLibraryStore` over the keyless connection + `events` schema under the live-DB gate, proving every write appends a history event and updates the current-state projection together.

Real collaborators, no stubs: `storeParitySuite` (`packages/storage-protocol/src/store-parity.ts:60`) is run against a REAL `InMemoryStore` at `packages/storage-protocol/src/store.test.ts:11` — 5 passing parity tests (upsert replaces + bumps `updatedAt` + preserves `createdAt`; `appendEvent` monotonic `seq` + order; `getDoc(absent)=null`; `queryDocs` empty=`[]`; `deleteDoc` idempotent), plus 3 `InMemoryStore`-specific passing tests (event+projection atomicity `store.test.ts:13`, `deleteDoc` appends a deleted event `store.test.ts:30`, `queryDocs` filters by kind `store.test.ts:39`).

The `events` schema shape is also proven OFFLINE: `packages/library/src/store/store.test.ts:20-39` reads `schema.sql` and asserts it declares the `events` schema + every organism's history/projection tables (`library_event`/`library_artifact`/`comment*`/`work_event`/`verdict`/`adr_number`), the `created`/`updated`/`deleted` event-type check, and the ADR-0017 no-foreign-key invariant — so `schema-shape-stable` is `mapped` (real), not would-be.

The SAME parity suite is registered against a REAL `PgLibraryStore` (`packages/library/src/store/store.test.ts:101` via `makePgStore` `store.test.ts:86-99`) but only under `STORYTREE_DB_LIVE=1`; by default it is a visible skip placeholder (`store.test.ts:103-106`) — so the Postgres transactional half + the keyless connection are would-be (`proposed`) and the in-memory half + the schema shape are `mapped`. `connection.ts` / `pg-store.ts` / `load-corpus.ts` also pass a real offline import-smoke test (`store.test.ts:65-77`) asserting `createPool`/`closePool` exist and the ADR-0015 instance + database constants — the keyless IAM/no-password wiring itself is exercised only behind the live gate.

## Contracts (9)

The test-proven leaf behaviours — each **one isolated leaf behaviour** under one automated test (no stubs: these are collaborator-free `InMemoryStore`/parity/schema tests, matching this capability's integration-test proof mode, ADR-0010 §2). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test. Contracts 7–9 carry the substrate competence re-homed from the dissolved `stories/store` (ADR-0077): the live Pg write, the keyless connection (`keyless-store-connection`), and the shared `events` schema (`shared-events-schema`).

1. **`upsert-replaces-and-bumps`** — Upsert on the same id replaces, preserves createdAt, bumps updatedAt
   - **asserts —** Two upserts on id `u1` leave one doc with the latest body, `createdAt` preserved, `updatedAt >=` the first.
   - **covers —** `packages/storage-protocol/src/store.ts:122-148`
   - **proven by —** `packages/storage-protocol/src/store-parity.ts:64-88` (the parity contract, run at `packages/storage-protocol/src/store.test.ts:11`) (REAL, passing)
2. **`append-event-monotonic-seq`** — appendEvent preserves order with strictly increasing seq
   - **asserts —** Three appended events read back in insertion order with strictly increasing `seq`.
   - **covers —** `packages/storage-protocol/src/store.ts:173-180`
   - **proven by —** `packages/storage-protocol/src/store-parity.ts:89-106` (run at `packages/storage-protocol/src/store.test.ts:11`) (REAL, passing)
3. **`getdoc-absent-null`** — getDoc of an absent id returns null
   - **asserts —** `getDoc('does-not-exist')` returns `null` and does not throw.
   - **covers —** `packages/storage-protocol/src/store.ts:149-152`
   - **proven by —** `packages/storage-protocol/src/store-parity.ts:107-112` (run at `packages/storage-protocol/src/store.test.ts:11`) (REAL, passing)
4. **`querydocs-empty-array`** — queryDocs on an empty store returns []
   - **asserts —** `queryDocs()` and `queryDocs({kind})` on an empty store both return `[]` without throwing.
   - **covers —** `packages/storage-protocol/src/store.ts:153-158`
   - **proven by —** `packages/storage-protocol/src/store-parity.ts:113-120` (run at `packages/storage-protocol/src/store.test.ts:11`) (REAL, passing)
5. **`deletedoc-idempotent`** — deleteDoc is idempotent
   - **asserts —** First `deleteDoc` returns `true`, second returns `false`.
   - **covers —** `packages/storage-protocol/src/store.ts:159-172`
   - **proven by —** `packages/storage-protocol/src/store-parity.ts:121-127` (run at `packages/storage-protocol/src/store.test.ts:11`) (REAL, passing)
6. **`upsert-event-and-projection-atomic`** — Upsert appends created-then-updated events with the actor and updates the projection
   - **asserts —** Two upserts on id `x` append a `created` event (actor alice) then an `updated` event (actor bob), and `getDoc` returns the latest body.
   - **covers —** `packages/storage-protocol/src/store.ts:122-148`
   - **proven by —** `packages/storage-protocol/src/store.test.ts:13-28` (REAL, passing)
7. **`pg-upsert-transactional-event-projection`** — PgLibraryStore upserts event + projection in one transaction at the migrate-on-write boundary
   - **asserts —** `PgLibraryStore.upsertDoc` `upcastAndValidate`s the doc, then in one `BEGIN`/`COMMIT` appends a `created`/`updated` event and upserts the projection, preserving `createdAt` and bumping `updatedAt` on same-id replace.
   - **covers —** `packages/library/src/store/pg-store.ts:75-126`
   - **would-be test —** proven only by the live-gated parity run (`packages/library/src/store/store.test.ts:101` under `STORYTREE_DB_LIVE=1`), which is **skipped by default**; no offline assertion touches the Pg impl.
8. **`pg-createpool-iam-no-password`** *(re-homed `keyless-store-connection`)* — createPool builds a pg Pool over the Cloud SQL connector with keyless IAM auth and no password
   - **asserts —** `createPool` wires a `pg` `Pool` from the connector's `getOptions` with `AuthTypes.IAM`, the operator IAM user (`STORYTREE_DB_USER`), and no password/key material (ADR-0021 keyless); a live pull returns data while a down DB fails closed with a connection error (no partial/forged success).
   - **covers —** `packages/library/src/store/connection.ts:43-71`
   - **would-be test —** only the import-smoke test (`store.test.ts:65-77`) touches `createPool`'s existence + the ADR-0015 instance/database constants; its IAM/no-password wiring + pull-or-fail-closed behaviour are exercised only behind the live-DB gate.
9. **`schema-shape-stable`** *(re-homed `shared-events-schema`)* — the `events` DDL declares the append-only history + projection tables every organism reads, with no foreign keys
   - **asserts —** `schema.sql` declares `CREATE SCHEMA events` and the per-organism history/projection tables (`library_event`/`library_artifact`/`comment*`/`work_event`/`verdict`/`adr_number`), constrains the event `type` to `created`/`updated`/`deleted`, and declares NO foreign keys / cross-table `REFERENCES` (relationships are in-doc ID pointers, ADR-0017).
   - **covers —** `packages/library/src/store/schema.sql:1-25`
   - **proven by —** `packages/library/src/store/store.test.ts:20-39` (REAL, passing offline)
