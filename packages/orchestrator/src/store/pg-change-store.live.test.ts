import test from "node:test";
import assert from "node:assert/strict";
import { hashSpan } from "../proof/anchor-compute.js";
import type { ChangeEvent } from "@storytree/verdict-contract";
import { createTestPool, closePool, applySchema } from "@storytree/library/store";
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
