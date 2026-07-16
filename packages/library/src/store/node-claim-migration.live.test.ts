import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";

/**
 * Live-gated proof of the ADR-0200 D2 graded claim-ledger migration: an EXISTING old-shape
 * `events.node_claim` (single-column PK, no grade) is upgraded IN PLACE by applySchema — the
 * first ALTER precedent in schema.sql — and a fresh install converges on the same shape.
 *
 * Gated exactly like the sibling live suites: STORYTREE_DB_LIVE=1, and the connection goes
 * through createTestPool, which fails closed unless STORYTREE_DB_NAME names a disposable
 * database (ADR-0054 — this test DROPs/recreates events.node_claim, so production is never
 * touchable). Run per-file:
 *
 *   STORYTREE_DB_LIVE=1 STORYTREE_DB_NAME=storytree_test STORYTREE_DB_USER=<iam-email> \
 *     pnpm --filter @storytree/library exec node --import tsx --test --test-force-exit \
 *     src/store/node-claim-migration.live.test.ts
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

/** The pre-ADR-0200 shape: unit_id was the PK, no grade column. */
async function createOldShapeTable(pool: Pool): Promise<void> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS events");
  await pool.query("DROP TABLE IF EXISTS events.node_claim");
  await pool.query(`
    CREATE TABLE events.node_claim (
      unit_id      TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL,
      branch       TEXT NOT NULL,
      intent       TEXT NOT NULL DEFAULT '',
      claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

/** The PK's column names in key order, straight from the catalog. */
async function pkColumns(pool: Pool): Promise<string[]> {
  const res = await pool.query<{ attname: string }>(`
    SELECT a.attname::text AS attname
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        ON true
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conrelid = 'events.node_claim'::regclass AND c.contype = 'p'
     ORDER BY k.ord`);
  return res.rows.map((r) => r.attname);
}

async function insertClaim(
  pool: Pool,
  unit: string,
  session: string,
  grade: string,
): Promise<void> {
  await pool.query(
    "INSERT INTO events.node_claim (unit_id, session_id, grade, branch) VALUES ($1, $2, $3, $4)",
    [unit, session, grade, "claude/test"],
  );
}

if (!LIVE) {
  test(
    "node_claim graded-ledger migration (skipped: set STORYTREE_DB_LIVE=1 + STORYTREE_DB_NAME=storytree_test to run)",
    { skip: true },
    () => {
      // The live DB is stopped by default; the offline companion (node-claim-schema.test.ts)
      // pins the DDL shape in CI. This placeholder keeps the gate visible in default output.
    },
  );
} else {
  test("ADR-0200 D2: an old-shape events.node_claim migrates in place to the graded ledger", async () => {
    const { createTestPool } = await import("./test-db.js");
    const { applySchema } = await import("./migrate.js");
    const { closePool } = await import("./connection.js");
    const { pool, connector } = await createTestPool();
    try {
      // Old shape + a pre-existing claim row (yesterday's exclusive build/work claim).
      await createOldShapeTable(pool);
      await pool.query(
        "INSERT INTO events.node_claim (unit_id, session_id, branch) VALUES ($1, $2, $3)",
        ["story-a", "session-1", "claude/old"],
      );
      assert.deepEqual(await pkColumns(pool), ["unit_id"]);

      // The migration: applySchema runs the whole DDL, including the guarded ALTER block.
      await applySchema(pool);

      // grade exists and the seeded row backfilled to 'work'.
      const seeded = await pool.query<{ grade: string }>(
        "SELECT grade FROM events.node_claim WHERE unit_id = 'story-a'",
      );
      assert.equal(seeded.rows[0]?.grade, "work");

      // The PK is now composite (unit_id, session_id).
      assert.deepEqual(await pkColumns(pool), ["unit_id", "session_id"]);

      // Shared grades coexist on the same unit: two more sessions, exploring + waiting.
      await insertClaim(pool, "story-a", "session-2", "exploring");
      await insertClaim(pool, "story-a", "session-3", "waiting");
      // ...and a second exploring session alongside — shared grades are unbounded.
      await insertClaim(pool, "story-a", "session-4", "exploring");

      // The partial unique index REFUSES a second work claim on the same unit...
      await assert.rejects(
        () => insertClaim(pool, "story-a", "session-5", "work"),
        /node_claim_work_excl/,
      );
      // ...while the composite PK still refuses a duplicate (unit, session) pair.
      await assert.rejects(
        () => insertClaim(pool, "story-a", "session-2", "waiting"),
        /node_claim_pkey/,
      );
      // A work claim on a DIFFERENT unit is fine (per-unit granularity unchanged).
      await insertClaim(pool, "story-b", "session-5", "work");

      // Idempotent: applySchema runs on every boot — a second pass is a no-op.
      await applySchema(pool);
      assert.deepEqual(await pkColumns(pool), ["unit_id", "session_id"]);
      const count = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM events.node_claim",
      );
      assert.equal(count.rows[0]?.n, 5);
    } finally {
      await closePool(pool, connector);
    }
  });

  test("ADR-0200 D2: a FRESH install converges on the same graded shape", async () => {
    const { createTestPool } = await import("./test-db.js");
    const { applySchema } = await import("./migrate.js");
    const { closePool } = await import("./connection.js");
    const { pool, connector } = await createTestPool();
    try {
      await pool.query("DROP TABLE IF EXISTS events.node_claim");
      await applySchema(pool);

      // Same composite PK as the migrated path.
      assert.deepEqual(await pkColumns(pool), ["unit_id", "session_id"]);

      // Same exclusivity behaviour: one work claim per unit, shared grades unbounded.
      await insertClaim(pool, "story-x", "session-1", "work");
      await insertClaim(pool, "story-x", "session-2", "exploring");
      await insertClaim(pool, "story-x", "session-3", "waiting");
      await assert.rejects(
        () => insertClaim(pool, "story-x", "session-4", "work"),
        /node_claim_work_excl/,
      );

      // Unspecified grade defaults to 'work' (existing callers keep exclusive semantics).
      await pool.query(
        "INSERT INTO events.node_claim (unit_id, session_id, branch) VALUES ($1, $2, $3)",
        ["story-y", "session-1", "claude/test"],
      );
      const def = await pool.query<{ grade: string }>(
        "SELECT grade FROM events.node_claim WHERE unit_id = 'story-y'",
      );
      assert.equal(def.rows[0]?.grade, "work");
    } finally {
      await closePool(pool, connector);
    }
  });
}
