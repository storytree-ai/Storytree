import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { changeStoreParitySuite } from "@storytree/core";
import type { ChangeEvent } from "@storytree/verdict-contract";

import { PgChangeStore } from "./pg-change-store.js";
import type { ChangeStoreClient } from "./pg-change-store.js";
import { SCHEMA_SQL_PATH } from "./migrate.js";

/**
 * PgChangeStore (ADR-0016 §2 + ADR-0064 §1): the FAST offline coverage. The live, DB-backed round-trip
 * against the isolated `storytree_test` database is `pg-change-store.live.test.ts` (the db:true `--real`
 * proof's signed test — it self-skips when STORYTREE_DB_NAME is unset). Here a FAKE pg client
 * (an in-memory append-only row store keyed by the SQL it receives) drives the SAME reusable
 * `changeStoreParitySuite` the InMemoryStore meets — proving the SQL-shaping (INSERT params + the
 * `doc` JSONB read round-trip + the unit_id filter) without a DB, no network, the same bar both
 * backends are held to (exactly how `storeParitySuite` proves PgLibraryStore offline-equivalent).
 */

/**
 * A fake {@link ChangeStoreClient}: an in-memory row store that interprets PgChangeStore's two
 * statements. INSERT stores the JSONB `doc` (the 7th param) keyed by its `unit_id` (the 1st); SELECT
 * returns the `doc`s in append order, filtered by `unit_id` when a value is bound. This mirrors the
 * `events.change_event` semantics PgChangeStore relies on (append-only, ordered, doc-as-given), so the
 * parity suite exercises the real query-shaping logic, not a stub.
 */
function fakeChangeClient(): ChangeStoreClient {
  const rows: Array<{ unitId: string; doc: unknown }> = [];
  return {
    async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
      if (text.startsWith("INSERT")) {
        const unitId = values?.[0] as string;
        const docJson = values?.[6] as string;
        rows.push({ unitId, doc: JSON.parse(docJson) });
        return { rows: [] };
      }
      // SELECT doc FROM events.change_event [WHERE unit_id = $1] ORDER BY seq
      const selected =
        values !== undefined && values.length > 0
          ? rows.filter((r) => r.unitId === values[0])
          : rows;
      return { rows: selected.map((r) => ({ doc: r.doc })) };
    },
  };
}

// The reusable bar, over the fake client — the same four contracts (round-trip, filter, order, empty)
// InMemoryStore meets in @storytree/core.
changeStoreParitySuite("PgChangeStore (fake client)", () => new PgChangeStore(fakeChangeClient()));

test("appendChangeEvent binds the scalar spine + the full doc, NULLing absent optionals", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const client: ChangeStoreClient = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values: values ?? [] });
      return { rows: [] };
    },
  };
  const store = new PgChangeStore(client);
  const change: ChangeEvent = {
    unitId: "math#uat-1",
    hashBefore: "aaaa",
    hashAfter: "bbbb",
    author: "tester",
    at: "2026-06-16T00:00:00.000Z",
    // description + commitSha deliberately absent
  };
  await store.appendChangeEvent(change);

  assert.equal(queries.length, 1);
  const q = queries[0]!;
  assert.match(q.text, /INSERT INTO events\.change_event/);
  // unit_id, hash_before, hash_after, description (NULL), author, commit_sha (NULL), doc JSON
  assert.deepEqual(q.values.slice(0, 6), [
    "math#uat-1",
    "aaaa",
    "bbbb",
    null,
    "tester",
    null,
  ]);
  assert.deepEqual(JSON.parse(q.values[6] as string), change);
});

test("schema.sql declares events.change_event with the scalar spine + doc JSONB", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS events\.change_event/);
  assert.match(sql, /unit_id\s+TEXT NOT NULL/);
  assert.match(sql, /hash_before\s+TEXT NOT NULL/);
  assert.match(sql, /hash_after\s+TEXT NOT NULL/);
  assert.match(sql, /doc\s+JSONB NOT NULL/);
  // The unit_id filter PgChangeStore.readChangeEvents leans on is indexed.
  assert.match(sql, /change_event_unit_idx ON events\.change_event \(unit_id\)/);
  // No foreign keys at this layer (ADR-0017: relationships are ID refs in docs).
  assert.doesNotMatch(sql, /FOREIGN KEY/i);
});
