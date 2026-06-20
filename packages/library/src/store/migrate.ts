import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

/**
 * Apply {@link ./schema.sql} to a pool. Idempotent (the DDL is all `IF NOT EXISTS`), so it is
 * safe to call on every boot. The SQL file is read relative to THIS module so it resolves the
 * same way regardless of cwd.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const sqlPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const ddl = await readFile(sqlPath, "utf8");
  await pool.query(ddl);
}

/** The location of the bundled schema DDL, exported so tests can read it without a DB. */
export const SCHEMA_SQL_PATH = fileURLToPath(
  new URL("./schema.sql", import.meta.url),
);
