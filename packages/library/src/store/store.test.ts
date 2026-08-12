import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localStoreParitySuite, storeParitySuite } from "@storytree/storage-protocol/parity";
import type { Store } from "@storytree/storage-protocol";
import { validateLibraryDoc } from "../library-doc.js";
import { FIXTURE_CORPUS_UNITS } from "../fixture/index.js";
import { SCHEMA_SQL_PATH } from "./migrate.js";

/**
 * The live DB is STOPPED by default and costs money, so everything that needs a real connection is
 * gated behind STORYTREE_DB_LIVE === '1'. The default `pnpm --filter @storytree/library test` runs
 * fully OFFLINE: it exercises the schema DDL, the write-boundary validator, and that the
 * connection/store modules import without throwing.
 */
const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

// ---- Offline: schema.sql shape -------------------------------------------------------------

test("schema-shape-stable: schema.sql declares the events schema and all six tables", async () => {
  const sql = await readFile(SCHEMA_SQL_PATH, "utf8");
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS events/);
  assert.match(sql, /events\.library_event/);
  assert.match(sql, /events\.library_artifact/);
  assert.match(sql, /events\.comment_event/);
  assert.match(sql, /events\.comment\b/);
  // ADR-0140 suggestions-as-proposals: the suggestion event + projection homes (additive only), the
  // live tables the offline-proven PgSuggestionStore (pg-suggestion-store.ts) targets.
  assert.match(sql, /events\.suggestion_event/);
  assert.match(sql, /events\.suggestion\b/);
  // Drive-machinery Phase A: the work-hierarchy lifecycle + signed-verdict homes (additive only).
  assert.match(sql, /events\.work_event/);
  assert.match(sql, /events\.verdict\b/);
  // ADR-0050: the ADR-number allocator table (number is the PK — the unique-violation retry hinges on it).
  assert.match(sql, /events\.adr_number/);
  assert.match(sql, /number INT PRIMARY KEY/);
  // The event `type` is constrained to the three lifecycle kinds.
  assert.match(sql, /CHECK \(type IN \('created', 'updated', 'deleted'\)\)/);
  // No foreign keys at this layer (ADR-0017: relationships are ID refs in docs).
  assert.doesNotMatch(sql, /FOREIGN KEY/i);
  assert.doesNotMatch(sql, /\bREFERENCES\s+events\./i);
});

// ---- Offline: write-boundary validator -----------------------------------------------------

test("validateLibraryDoc accepts every unit of the real fixture corpus", () => {
  // It read the FIRST unit of `apps/studio/data/knowledge.json` until ADR-0302 D1 deleted that file.
  // The fixture is small enough to check in FULL rather than sampling, which is strictly stronger:
  // the old assertion could only ever catch a schema break that happened to hit index 0, and it is
  // also what keeps the fixture itself honest — a unit that falls behind the schema fails here
  // rather than in whichever suite happens to load it next.
  assert.ok(FIXTURE_CORPUS_UNITS.length > 0, "the fixture corpus must not be empty");
  const kinds = new Set<string>();
  for (const unit of FIXTURE_CORPUS_UNITS) {
    const parsed = validateLibraryDoc(unit);
    assert.equal(typeof parsed.id, "string");
    assert.ok("kind" in parsed && typeof parsed.kind === "string");
    kinds.add(parsed.kind as string);
  }
  assert.ok(kinds.size >= 4, `the fixture must span several kinds, spans ${[...kinds].join(", ")}`);
});

test("validateLibraryDoc rejects garbage", () => {
  assert.throws(() => validateLibraryDoc({ nope: true }));
  assert.throws(() => validateLibraryDoc(null));
  assert.throws(() => validateLibraryDoc({ kind: "not-a-kind", id: "x" }));
});

// ---- Offline: the projection row's kind, as the doc declares it (ADR-0352) -------------------

/*
 * `patchDoc` keeps the row's kind unless the merged doc says otherwise, and `kindOfDoc` is the rule
 * that reads it. Driven directly rather than through a fake: it is the real implementation the
 * production write path calls, and its three branches are the whole of its behaviour.
 */
test("kindOfDoc: reads `kind` for a structured doc and `category` for a rendered asset", async () => {
  const { kindOfDoc } = await import("./pg-store.js");
  assert.equal(kindOfDoc({ kind: "principle", id: "p" }), "principle");
  assert.equal(kindOfDoc({ category: "template", id: "t" }), "template");
  // `kind` wins when a doc somehow carries both — the structured field is the declared one.
  assert.equal(kindOfDoc({ kind: "arc", category: "template", id: "a" }), "arc");
});

test("kindOfDoc: a doc declaring neither yields undefined, so a patch KEEPS the row's kind", async () => {
  const { kindOfDoc } = await import("./pg-store.js");
  assert.equal(kindOfDoc({ id: "no-kind" }), undefined);
  // Non-objects can never declare a kind, and must not throw on the write path.
  assert.equal(kindOfDoc(null), undefined);
  assert.equal(kindOfDoc("a string"), undefined);
  assert.equal(kindOfDoc(42), undefined);
  // A non-string kind is not a kind — falling through is what keeps the row's existing one.
  assert.equal(kindOfDoc({ kind: 7 }), undefined);
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
  assert.equal(typeof corpus.loadComments, "function");
});

// ---- Live-gated: full behavioural parity over Postgres -------------------------------------

/**
 * Build a PgLibraryStore against the live DB, applying the schema and truncating the tables so each
 * parity run starts clean. Only ever invoked when STORYTREE_DB_LIVE === '1'.
 */
async function makePgStore(): Promise<Store> {
  const { createTestPool } = await import("./test-db.js");
  const { applySchema } = await import("./migrate.js");
  const { PgLibraryStore } = await import("./pg-store.js");
  // createTestPool fails closed unless STORYTREE_DB_NAME names a disposable DB — the TRUNCATE below
  // can never reach production (ADR-0054).
  const { pool } = await createTestPool();
  await applySchema(pool);
  await pool.query(
    "TRUNCATE events.library_event, events.library_artifact RESTART IDENTITY",
  );
  return new PgLibraryStore(pool);
}

if (LIVE) {
  storeParitySuite("PgLibraryStore", makePgStore);
  // Plus the in-process-only contracts: `patchDoc`'s validate() hook is a closure, so it is held
  // here (and against InMemoryStore) but never against HttpStore (ADR-0352).
  localStoreParitySuite("PgLibraryStore", makePgStore);
} else {
  test("PgLibraryStore parity suite (skipped: set STORYTREE_DB_LIVE=1 to run)", { skip: true }, () => {
    // The live DB is stopped by default; the in-memory parity suite in @storytree/core proves the
    // contract offline. This placeholder keeps the gate visible in the default test output.
  });
}
