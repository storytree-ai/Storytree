import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { SCHEMA_SQL_PATH } from "./migrate.js";

/**
 * Offline pin on the graded claim-ledger DDL (ADR-0200 D2): the DB-free CI companion to
 * node-claim-migration.live.test.ts. It reads schema.sql as TEXT and asserts the shape is
 * declared — the live test proves the shape actually lands on a real Postgres.
 */

test("schema.sql: node_claim carries the ADR-0200 graded-ledger shape (fresh installs)", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  // The grade column, defaulted to the exclusive grade existing callers mean.
  assert.match(sql, /grade\s+TEXT NOT NULL DEFAULT 'work'/);
  // Per-(story, session) rows: the PK is composite, no longer unit_id alone.
  assert.match(sql, /PRIMARY KEY \(unit_id, session_id\)/);
  // Work-grade exclusivity moved from the PK to a partial unique index.
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS node_claim_work_excl/);
  assert.match(sql, /ON events\.node_claim \(unit_id\)\s+WHERE grade = 'work'/);
});

test("schema.sql: guarded in-place migration upgrades a pre-graded node_claim (ADR-0200 D2)", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  // Existing rows are yesterday's exclusive build/work claims — backfilled to 'work'.
  assert.match(
    sql,
    /ALTER TABLE events\.node_claim\s+ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'work'/,
  );
  // The PK swap runs inside a DO block guarded on the catalog's CURRENT pk column set,
  // so applySchema (which runs on every boot) no-ops once the shape has converged.
  assert.match(sql, /DO \$\$/);
  assert.match(sql, /pg_constraint/);
  assert.match(sql, /ARRAY\['unit_id'\]/);
  assert.match(
    sql,
    /ADD CONSTRAINT node_claim_pkey PRIMARY KEY \(unit_id, session_id\)/,
  );
});

test("schema.sql: node_claim carries the ADR-0346 D3 typed role column, NULLABLE and unbackfilled", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  // Fresh installs declare it — bare TEXT, so it is nullable by omission.
  assert.match(sql, /^\s*role\s+TEXT,\s*$/m);
  // The in-place migration for an existing table. NO `NOT NULL`, and NO `DEFAULT` — unlike the
  // grade ALTER above, whose backfill to 'work' was correct because every pre-grade row genuinely
  // WAS a work claim. A pre-split row's role lives inside its own `intent` string, so NULL means
  // "derive it" (claimRole) and the migration stays additive and pull-based.
  assert.match(sql, /ALTER TABLE events\.node_claim\s+ADD COLUMN IF NOT EXISTS role TEXT;/);
  assert.doesNotMatch(
    sql,
    /ADD COLUMN IF NOT EXISTS role TEXT NOT NULL/,
    "a NOT NULL role would need a backfill, and there is no single right answer to backfill it to",
  );
});

test("schema.sql: events.claim_event is untouched by the grade migration (free-TEXT type)", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  // The audit log's `type` stays free TEXT — new grade-transition event types need no DDL.
  assert.match(sql, /CREATE TABLE IF NOT EXISTS events\.claim_event/);
  // SCOPED TO THE `type` COLUMN, which is what this test is about. It read `doesNotMatch(/ALTER
  // TABLE events.claim_event/)` — a blunt proxy that banned EVERY future ALTER on the table, and
  // ADR-0350 D1 legitimately adds two nullable causal columns to every append-only stream, this one
  // included. Widening the proxy back would re-forbid unrelated additive migrations; narrowing it
  // to `type` keeps the invariant the comment above actually states.
  const claimEventAlters = sql.match(/ALTER TABLE events\.claim_event[^;]*;/g) ?? [];
  for (const alter of claimEventAlters) {
    assert.doesNotMatch(
      alter,
      /\btype\b/,
      "the audit log's `type` must stay free TEXT — constraining it would mean DDL per new event type",
    );
  }
});
