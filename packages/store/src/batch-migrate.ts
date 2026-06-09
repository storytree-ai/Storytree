import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { Store } from "@storytree/core";
import { upcast, CURRENT_SCHEMA_VERSION } from "@storytree/core";
import { createPool, closePool } from "./connection.js";
import { applySchema } from "./migrate.js";
import { PgLibraryStore } from "./pg-store.js";

/**
 * The eager batch migrate (design §3 "eager batch", Phase 3): the bulk mover that drains the
 * mixed-version tail the write-boundary upcaster ({@link PgLibraryStore.upsertDoc}) only closes
 * lazily (a doc nobody touches stays at its old version forever otherwise).
 *
 * NON-DESTRUCTIVE — deliberately UNLIKE `load-corpus.ts --force`, which re-seeds from the studio
 * files and reverts live CLI edits. This reads every LIVE artifact via {@link Store.queryDocs},
 * runs the core {@link upcast} on each, and re-upserts ONLY those whose `schemaVersion` actually
 * changed — preserving all other content of every row. A row already at
 * {@link CURRENT_SCHEMA_VERSION} (and every non-structured asset, which {@link upcast} passes
 * through unchanged) is left untouched, so a second run is a no-op.
 *
 * Store-agnostic: takes a {@link Store}, so it is testable offline against `InMemoryStore`.
 * The DB ledger row (which version was applied + when + by whom) is written by the script
 * {@link main} entry, not here, because the ledger is Postgres-specific.
 */

/** Read a doc's per-row schema version (absent / non-numeric => 0, the v0 baseline). */
function schemaVersionOf(doc: unknown): number {
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>)["schemaVersion"];
    if (typeof v === "number") return v;
  }
  return 0;
}

export interface BatchMigrateResult {
  /** Total live artifacts scanned. */
  scanned: number;
  /** Artifacts whose schemaVersion changed and were re-upserted. */
  upgraded: number;
}

/**
 * Scan every live artifact and forward-migrate the lagging ones in place. Returns the counts:
 * `{ scanned, upgraded }`. Only rows whose `schemaVersion` changed under {@link upcast} are
 * re-upserted (through the store's own write boundary, which re-stamps + re-validates), so the
 * pass is idempotent — re-running yields `upgraded: 0`.
 */
export async function batchMigrate(store: Store): Promise<BatchMigrateResult> {
  const docs = await store.queryDocs();
  let upgraded = 0;
  for (const row of docs) {
    if (typeof row.doc !== "object" || row.doc === null) continue;
    const before = schemaVersionOf(row.doc);
    const migrated = upcast(row.doc as Record<string, unknown>);
    const after = schemaVersionOf(migrated);
    if (after === before) continue; // already current, or a non-structured asset passthrough
    await store.upsertDoc({
      id: row.id,
      kind: row.kind,
      doc: migrated,
      actor: "batch-migrate",
    });
    upgraded += 1;
  }
  return { scanned: docs.length, upgraded };
}

/**
 * Record an applied migration version in the DB ledger (design §3 "DB ledger row"). Append-only:
 * `ON CONFLICT (version) DO NOTHING` makes a re-run a no-op. Postgres-specific.
 */
async function recordLedger(
  pool: Pool,
  version: number,
  name: string,
  actor: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO events.schema_migration (version, name, actor)
     VALUES ($1, $2, $3)
     ON CONFLICT (version) DO NOTHING`,
    [version, name, actor],
  );
}

/**
 * Script entry: when this file is the process entry point, build a live pool, apply the schema,
 * run {@link batchMigrate} against the live projection, print the counts, and record the current
 * schema version in the ledger. NEVER invoked during tests (entry-guarded, mirrors load-corpus.ts).
 */
async function main(): Promise<void> {
  const { pool, connector } = await createPool();
  try {
    await applySchema(pool);
    const store = new PgLibraryStore(pool);
    const result = await batchMigrate(store);
    await recordLedger(
      pool,
      CURRENT_SCHEMA_VERSION,
      "batch-migrate",
      "batch-migrate",
    );
    console.log(
      `batch-migrate: scanned ${result.scanned} artifacts, upgraded ${result.upgraded} to schemaVersion ${CURRENT_SCHEMA_VERSION}`,
    );
  } finally {
    await closePool(pool, connector);
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
