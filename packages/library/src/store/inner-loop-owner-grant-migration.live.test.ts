import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";

/**
 * Live-gated proof that an existing ADR-0563 inner-loop ledger converges on ADR-0578's
 * owner-grant vocabulary without losing its rows. The disposable-database guard lives in
 * createTestPool; production can never be the target of this destructive fixture.
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

async function createPreOwnerGrantTable(pool: Pool): Promise<void> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS events");
  await pool.query("DROP TABLE IF EXISTS events.inner_loop_event");
  await pool.query(`
    CREATE TABLE events.inner_loop_event (
      seq          BIGSERIAL PRIMARY KEY,
      event_id     TEXT NOT NULL UNIQUE,
      unit_id      TEXT NOT NULL,
      increment_id TEXT NOT NULL,
      run_id       TEXT NOT NULL,
      event        TEXT NOT NULL CHECK (event IN ('attempt', 'grant', 'signed-pass', 'adjudication')),
      doc          JSONB NOT NULL,
      actor        TEXT NOT NULL,
      at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (unit_id, increment_id, event, run_id)
    )`);
  await pool.query(
    `INSERT INTO events.inner_loop_event
       (event_id, unit_id, increment_id, run_id, event, doc, actor)
     VALUES ($1, $2, $3, $4, 'attempt', $5::jsonb, $6)`,
    ["attempt-before-migration", "unit-a", "increment-a", "run-a", JSON.stringify({ event: "attempt" }), "test"],
  );
}

if (!LIVE) {
  test(
    "inner-loop owner-grant migration (skipped: set STORYTREE_DB_LIVE=1 + STORYTREE_DB_NAME=storytree_test to run)",
    { skip: true },
    () => {
      // The offline schema-shape test pins the migration and unique index in ordinary CI.
    },
  );
} else {
  test("ADR-0578: the existing inner-loop CHECK widens in place and accepts owner-grant", async () => {
    const { createTestPool } = await import("./test-db.js");
    const { applySchema } = await import("./migrate.js");
    const { closePool } = await import("./connection.js");
    const { pool, connector } = await createTestPool();
    try {
      await createPreOwnerGrantTable(pool);

      await applySchema(pool);
      await pool.query(
        `INSERT INTO events.inner_loop_event
           (event_id, unit_id, increment_id, run_id, event, doc, actor)
         VALUES ($1, $2, $3, $4, 'owner-grant', $5::jsonb, $6)`,
        [
          "owner-grant-after-migration",
          "unit-a",
          "increment-a",
          "run-a",
          JSON.stringify({ event: "owner-grant", authorityQuestionRef: "asset:q-owner" }),
          "test",
        ],
      );

      await assert.rejects(
        () => pool.query(
          `INSERT INTO events.inner_loop_event
             (event_id, unit_id, increment_id, run_id, event, doc, actor)
           VALUES ($1, $2, $3, $4, 'owner-grant', $5::jsonb, $6)`,
          [
            "racing-owner-grant",
            "unit-b",
            "increment-b",
            "run-b",
            JSON.stringify({ event: "owner-grant", authorityQuestionRef: "asset:q-owner" }),
            "test",
          ],
        ),
        /inner_loop_owner_grant_authority_unique/,
      );

      const rows = await pool.query<{ event: string }>(
        "SELECT event FROM events.inner_loop_event ORDER BY seq",
      );
      assert.deepEqual(rows.rows.map((row) => row.event), ["attempt", "owner-grant"]);

      await applySchema(pool);
      const checks = await pool.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid)::text AS definition
          FROM pg_constraint
         WHERE conrelid = 'events.inner_loop_event'::regclass
           AND conname = 'inner_loop_event_event_check'
           AND contype = 'c'`);
      assert.equal(checks.rows.length, 1);
      assert.match(checks.rows[0]?.definition ?? "", /owner-grant/);
    } finally {
      await closePool(pool, connector);
    }
  });
}
