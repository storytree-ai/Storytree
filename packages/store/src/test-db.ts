import { createPool, DEFAULT_DATABASE, type PoolHandle } from "./connection.js";

/**
 * Fail-closed connection for the DESTRUCTIVE live-gated tests (they `TRUNCATE` to start clean).
 *
 * The bug this closes: a `STORYTREE_DB_LIVE=1` run built its store with a bare `createPool()`, which
 * defaults to the PRODUCTION `storytree` database (ADR-0015). The test setup then truncated
 * `events.library_artifact` / `events.work_event` / `events.verdict` / `events.adr_number` — silently
 * wiping the real corpus AND every signed verdict, so a green story (e.g. `library`'s 8/8) reverted to
 * brown. A signed verdict must be durable; a test run must never be able to destroy it.
 *
 * The fix: destructive live tests connect ONLY through {@link createTestPool}, which refuses to run
 * against production. They must point at a disposable database via STORYTREE_DB_NAME:
 *
 *   gcloud sql databases create storytree_test --instance=storytree-pg   # one-time, owner
 *   STORYTREE_DB_LIVE=1 STORYTREE_DB_NAME=storytree_test STORYTREE_DB_USER=<iam-email> \
 *     pnpm --filter @storytree/store exec node --import tsx --test src/store.test.ts
 *
 * Without STORYTREE_DB_NAME (or with it pointed at production) the live suite fails CLOSED — loudly —
 * before any connection is opened, instead of quietly nuking the live tables (ADR-0054).
 */

/** The env var naming the disposable live-test database (e.g. `storytree_test`). */
export const TEST_DB_ENV = "STORYTREE_DB_NAME";

/**
 * Assert `database` is a disposable test target — never the production database, never blank. Throws
 * a loud, instructional error otherwise (the guard the destructive live tests run before truncating).
 */
export function assertTestDatabase(database: string | undefined): asserts database is string {
  if (database === undefined || database.trim() === "") {
    throw new Error(
      `destructive live test needs a disposable database — set ${TEST_DB_ENV} ` +
        `(e.g. ${TEST_DB_ENV}=storytree_test). These tests TRUNCATE, so they must NEVER touch production.`,
    );
  }
  if (database === DEFAULT_DATABASE) {
    throw new Error(
      `refusing to run a destructive live test against the PRODUCTION database "${database}" — ` +
        `it would TRUNCATE the real corpus + verdicts. Set ${TEST_DB_ENV} to a disposable database ` +
        `(e.g. storytree_test); create it once: gcloud sql databases create storytree_test --instance=storytree-pg.`,
    );
  }
}

/**
 * Open a pool for a destructive live-gated test — fail-closed unless STORYTREE_DB_NAME names a
 * disposable (non-production) database. Use this in EVERY live test that truncates or writes; the
 * guard runs BEFORE any socket is opened, so production can never be reached, let alone truncated.
 */
export async function createTestPool(): Promise<PoolHandle> {
  const database = process.env[TEST_DB_ENV];
  assertTestDatabase(database);
  return createPool({ database });
}
