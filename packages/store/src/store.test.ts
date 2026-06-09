import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateLibraryDoc, storeParitySuite } from "@storytree/core";
import type { Store } from "@storytree/core";
import { SCHEMA_SQL_PATH } from "./migrate.js";

/**
 * The live DB is STOPPED by default and costs money, so everything that needs a real connection is
 * gated behind STORYTREE_DB_LIVE === '1'. The default `pnpm --filter @storytree/store test` runs
 * fully OFFLINE: it exercises the schema DDL, the write-boundary validator, and that the
 * connection/store modules import without throwing.
 */
const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

// ---- Offline: schema.sql shape -------------------------------------------------------------

test("schema.sql declares the events schema and all six tables", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS events/);
  assert.match(sql, /events\.library_event/);
  assert.match(sql, /events\.library_artifact/);
  assert.match(sql, /events\.comment_event/);
  assert.match(sql, /events\.comment\b/);
  // Drive-machinery Phase A: the work-hierarchy lifecycle + signed-verdict homes (additive only).
  assert.match(sql, /events\.work_event/);
  assert.match(sql, /events\.verdict\b/);
  // The event `type` is constrained to the three lifecycle kinds.
  assert.match(sql, /CHECK \(type IN \('created', 'updated', 'deleted'\)\)/);
  // No foreign keys at this layer (ADR-0017: relationships are ID refs in docs).
  assert.doesNotMatch(sql, /FOREIGN KEY/i);
  assert.doesNotMatch(sql, /\bREFERENCES\s+events\./i);
});

// ---- Offline: write-boundary validator -----------------------------------------------------

async function firstKnowledgeUnit(): Promise<unknown> {
  const path = fileURLToPath(
    new URL("../../../apps/studio/data/knowledge.json", import.meta.url),
  );
  const units = JSON.parse(await readFile(path, "utf8")) as unknown[];
  return units[0];
}

test("validateLibraryDoc accepts a real knowledge.json unit", async () => {
  const unit = await firstKnowledgeUnit();
  const parsed = validateLibraryDoc(unit);
  assert.equal(typeof parsed.id, "string");
  assert.ok("kind" in parsed && typeof parsed.kind === "string");
});

test("validateLibraryDoc rejects garbage", () => {
  assert.throws(() => validateLibraryDoc({ nope: true }));
  assert.throws(() => validateLibraryDoc(null));
  assert.throws(() => validateLibraryDoc({ kind: "not-a-kind", id: "x" }));
});

// ---- Offline: modules import without throwing ----------------------------------------------

test("connection + store modules import without throwing", async () => {
  const conn = await import("./connection.js");
  const store = await import("./pg-store.js");
  const corpus = await import("./load-corpus.js");
  assert.equal(typeof conn.createPool, "function");
  assert.equal(typeof conn.closePool, "function");
  assert.equal(
    conn.DEFAULT_INSTANCE_CONNECTION_NAME,
    "storytree-498613:australia-southeast1:storytree-pg",
  );
  assert.equal(conn.DEFAULT_DATABASE, "storytree");
  assert.equal(typeof store.PgLibraryStore, "function");
  assert.equal(typeof corpus.loadCorpus, "function");
});

// ---- Live-gated: full behavioural parity over Postgres -------------------------------------

/**
 * Build a PgLibraryStore against the live DB, applying the schema and truncating the tables so each
 * parity run starts clean. Only ever invoked when STORYTREE_DB_LIVE === '1'.
 */
async function makePgStore(): Promise<Store> {
  const { createPool } = await import("./connection.js");
  const { applySchema } = await import("./migrate.js");
  const { PgLibraryStore } = await import("./pg-store.js");
  const { pool } = await createPool();
  await applySchema(pool);
  await pool.query(
    "TRUNCATE events.library_event, events.library_artifact RESTART IDENTITY",
  );
  return new PgLibraryStore(pool);
}

if (LIVE) {
  storeParitySuite("PgLibraryStore", makePgStore);
} else {
  test("PgLibraryStore parity suite (skipped: set STORYTREE_DB_LIVE=1 to run)", { skip: true }, () => {
    // The live DB is stopped by default; the in-memory parity suite in @storytree/core proves the
    // contract offline. This placeholder keeps the gate visible in the default test output.
  });
}
