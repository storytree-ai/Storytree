---
id: "change-store-pg"
tier: contract
story: binding-staleness
title: "PgChangeStore — the Postgres home for the change log"
outcome: "packages/store gains PgChangeStore, the Postgres adapter of @storytree/core's ChangeStore contract (appendChangeEvent/readChangeEvents) over the events.change_event table — held to the SAME reusable changeStoreParitySuite as InMemoryStore, and proven by a REAL round-trip against an isolated storytree_test database (the thing the offline fake-client pattern cannot attest)."
status: proposed
proof_mode: contract-test
depends_on: [change-event-store]
decisions: [16, 64]
# Node-borne proof config (ADR-0057 keystone A) + DB-BACKED proof mode (ADR-0064 §1): authoring THIS
# block is what makes the node inner-loop buildable. NET-NEW: the leaf authors a net-new
# packages/store/src/pg-change-store.ts (the red is the missing module). `db: true` makes the spine
# provision an ISOLATED test database (storytree_test, never prod) and FORCE STORYTREE_DB_NAME onto the
# proof env, so the authored round-trip test connects to the disposable DB via createTestPool(). The
# `events.change_event` table + the `changeStoreParitySuite` it is held to are PREREQUISITES already on
# this branch (committed by the orchestrator — outside the leaf's write scope). `install: true` +
# typecheck because the adapter imports `@storytree/core` and the test imports `pg`/the Cloud SQL
# connector from node_modules (ADR-0064 requires db ⇒ install ⇒ typecheck). A custom pnpm proofCommand
# carries `--test-force-exit` so the connector socket can never hang the proof (a live-store-test trap).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/store", "test"]
  scope:
    testGlobs: ["packages/store/src/**/*.test.ts"]
    sourceGlobs: ["packages/store/src/**/*.ts"]
  real:
    testFile: "packages/store/src/pg-change-store.live.test.ts"
    sourceFile: "packages/store/src/pg-change-store.ts"
    scope:
      testGlobs: ["packages/store/src/pg-change-store.live.test.ts"]
      sourceGlobs: ["packages/store/src/pg-change-store.ts"]
    install: true
    db: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/store", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "@storytree/store"
        - "exec"
        - "node"
        - "--import"
        - "tsx"
        - "--test"
        - "--test-force-exit"
        - "src/pg-change-store.live.test.ts"
---

# PgChangeStore — the Postgres home for the change log

**Outcome —** `packages/store` gains `PgChangeStore`, the Postgres adapter of `@storytree/core`'s
`ChangeStore` contract (`appendChangeEvent`/`readChangeEvents`) over the `events.change_event` table —
held to the **same** reusable `changeStoreParitySuite` as `InMemoryStore`, and proven by a **REAL
round-trip** against an isolated `storytree_test` database (the thing the offline fake-client pattern
cannot attest).

> **The gap this closes (ADR-0016 §2 + ADR-0064 §1).** [`change-event-store`](change-event-store.md)
> landed the OFFLINE `ChangeStore` contract (`InMemoryStore` + the reusable `changeStoreParitySuite`).
> This unit lands the **Postgres** backend — exactly how `PgLibraryStore` is the Postgres `Store` to
> `InMemoryStore`. It is the first dogfood of ADR-0064's **DB-backed proof mode**: the spine cuts a
> worktree, installs deps, provisions an isolated `storytree_test`, and runs the authored test against
> it — never production (two honesty walls + the forced env guarantee it).

## Guidance

You author exactly TWO files (your write scope): the test `packages/store/src/pg-change-store.live.test.ts`
and the implementation `packages/store/src/pg-change-store.ts`. Everything they depend on is ALREADY on
this branch — do NOT create or edit it:

- the `events.change_event` table is in `packages/store/src/schema.sql` (applied by `applySchema`);
- the `ChangeStore` interface + `ChangeEvent` type are exported from `@storytree/core`;
- `createTestPool` / `closePool` / `applySchema` are exported from `packages/store` (use the **relative**
  `./test-db.js`, `./connection.js`, `./migrate.js` — the live test lives inside `packages/store`).

**1. The implementation `packages/store/src/pg-change-store.ts`.** A small, append-only adapter over
`events.change_event`, mirroring `PgWorkStore`'s structural-client seam (a duck-typed `query` so the
offline test can inject a fake). The full ADR-0016 `ChangeEvent` is stored in the `doc` JSONB column so a
read round-trips it byte-for-byte (including an absent `description`/`commitSha`); reads return the full
append-only log ordered by `seq` (which `classifyDrift` consumes), filtered by `unitId` when given:

```ts
import type { ChangeEvent, ChangeStore } from "@storytree/core";

/** The slice of `pg.Pool` this store needs (structural, so offline tests can inject a fake). */
export interface ChangeStoreClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface ChangeEventRow {
  doc: unknown;
}

/**
 * The Postgres home for the ADR-0016 change log (the `ChangeStore` seam, @storytree/core). Append-only
 * over `events.change_event`: one row per change, the full ChangeEvent in `doc` JSONB (so a read
 * round-trips it unchanged), the scalar columns the queryable spine. Held to `changeStoreParitySuite`,
 * the same bar InMemoryStore meets.
 */
export class PgChangeStore implements ChangeStore {
  readonly #client: ChangeStoreClient;

  constructor(client: ChangeStoreClient) {
    this.#client = client;
  }

  async appendChangeEvent(change: ChangeEvent): Promise<void> {
    await this.#client.query(
      `INSERT INTO events.change_event (unit_id, hash_before, hash_after, description, author, commit_sha, doc)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        change.unitId,
        change.hashBefore,
        change.hashAfter,
        change.description ?? null,
        change.author,
        change.commitSha ?? null,
        JSON.stringify(change),
      ],
    );
  }

  async readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]> {
    const res =
      filter?.unitId === undefined
        ? await this.#client.query(`SELECT doc FROM events.change_event ORDER BY seq`)
        : await this.#client.query(
            `SELECT doc FROM events.change_event WHERE unit_id = $1 ORDER BY seq`,
            [filter.unitId],
          );
    return (res.rows as ChangeEventRow[]).map((r) => r.doc as ChangeEvent);
  }
}
```

**2. The DB-backed round-trip test `packages/store/src/pg-change-store.live.test.ts`.** It connects to the
ISOLATED test DB via `createTestPool()` (fail-closed against production), applies the schema, truncates
`events.change_event`, then writes a `ChangeEvent`, reads it back, and asserts the round-trip + filtering.
It MUST self-skip when `STORYTREE_DB_NAME` is unset — so the offline package suite
(`pnpm --filter @storytree/store test`, no DB) stays green, while the spine's db-backed proof (which
FORCES `STORYTREE_DB_NAME=storytree_test`) runs it for real:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { hashSpan } from "@storytree/core";
import type { ChangeEvent } from "@storytree/core";
import { createTestPool } from "./test-db.js";
import { closePool } from "./connection.js";
import { applySchema } from "./migrate.js";
import { PgChangeStore } from "./pg-change-store.js";

// DB-backed proof (ADR-0064): runs ONLY when STORYTREE_DB_NAME names a disposable test DB. The spine
// forces it (storytree_test) for the db:true proof; absent (the offline package suite) the test skips,
// so this file never touches production and never reds the offline gate.
const DB = process.env["STORYTREE_DB_NAME"];

test(
  "PgChangeStore round-trips a ChangeEvent through events.change_event",
  { skip: !DB },
  async () => {
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.change_event RESTART IDENTITY");
      const store = new PgChangeStore(pool);
      const change: ChangeEvent = {
        unitId: "math#uat-1",
        hashBefore: hashSpan("export const x = 1;\n"),
        hashAfter: hashSpan("export const x = 2;\n"),
        description: "switched constant from 1 to 2",
        author: "tester",
        at: "2026-06-16T00:00:00.000Z",
      };
      await store.appendChangeEvent(change);
      // round-trips deep-equal, filtered and unfiltered; a different unit's log is empty.
      assert.deepEqual(await store.readChangeEvents({ unitId: "math#uat-1" }), [change]);
      assert.deepEqual(await store.readChangeEvents(), [change]);
      assert.deepEqual(await store.readChangeEvents({ unitId: "other" }), []);
    } finally {
      await closePool(pool, connector);
    }
  },
);
```

**The red the spine observes (before IMPLEMENT):** the test imports `./pg-change-store.js`, which does
not exist at HEAD — the proof command fails to load the test (a genuine missing-module red). After
IMPLEMENT authors `pg-change-store.ts`, the import resolves and the real round-trip passes green against
`storytree_test`.

Do NOT touch `package.json`/`pnpm-lock.yaml`, `schema.sql`, `connection.ts`, `test-db.js`, or anything
outside the two files above — they are prerequisites, not your work. If you find a missing dependency or a
prerequisite is absent, STOP and say so (the node spec is then wrong) rather than working around it.

## Contract

1. **`pg-change-store-round-trips-via-test-db`** — `PgChangeStore` persists and reads back a `ChangeEvent`
   against an isolated `storytree_test` database (never production), and filters by `unitId`.
   - **asserts —** an appended `ChangeEvent` reads back deep-equal (filtered by `unitId` and unfiltered);
     a different unit's log is empty; the connection is the disposable test DB (`createTestPool` is
     fail-closed against prod, ADR-0054/0064).
   - **proven by —** `packages/store/src/pg-change-store.live.test.ts`, authored by the gated leaf and run
     by the spine against `storytree_test` (the DB-backed proof mode, ADR-0064 §1); the offline
     fake-client `changeStoreParitySuite` run is the fast companion coverage the orchestrator adds.
