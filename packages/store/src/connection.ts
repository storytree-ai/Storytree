import { Pool } from "pg";
import { Connector, AuthTypes } from "@google-cloud/cloud-sql-connector";

/**
 * The Cloud SQL connection seam (ADR-0015/0019): a plain typed `pg` Pool whose socket comes from
 * the Cloud SQL Node connector with IAM database authentication — NO password, NO DBOS.
 *
 * The connector hands `pg` a `stream` factory (the IAM-authenticated TLS socket); we spread that
 * into a `new Pool({ ...stream, user, database })`. The `user` is the operator's IAM principal
 * email (the IAM-auth login role); there is deliberately no `password`.
 *
 * This module only TYPECHECKS in the default offline test run — it is solely exercised behind the
 * live-DB gate (`STORYTREE_DB_LIVE === '1'`), because the real instance is STOPPED by default.
 */

/** The literal instance connection name for the storytree Cloud SQL Postgres (ADR-0015). */
export const DEFAULT_INSTANCE_CONNECTION_NAME =
  "storytree-498613:australia-southeast1:storytree-pg";

/** The runtime database name (ADR-0015). */
export const DEFAULT_DATABASE = "storytree";

export interface CreatePoolOptions {
  instanceConnectionName?: string;
  user?: string;
  database?: string;
}

/** A pool paired with the connector that owns its sockets, so both can be torn down together. */
export interface PoolHandle {
  pool: Pool;
  connector: Connector;
}

/**
 * Build a `pg` Pool wired to Cloud SQL over IAM auth. Defaults:
 *   - instanceConnectionName: env STORYTREE_INSTANCE_CONNECTION_NAME ?? the ADR-0015 literal
 *   - user: env STORYTREE_DB_USER (the operator IAM email) — REQUIRED for a live connection
 *   - database: 'storytree'
 *
 * Returns the Pool together with its Connector so the caller can {@link closePool} both.
 */
export async function createPool(opts?: CreatePoolOptions): Promise<PoolHandle> {
  const instanceConnectionName =
    opts?.instanceConnectionName ??
    process.env["STORYTREE_INSTANCE_CONNECTION_NAME"] ??
    DEFAULT_INSTANCE_CONNECTION_NAME;
  const user = opts?.user ?? process.env["STORYTREE_DB_USER"];
  const database = opts?.database ?? DEFAULT_DATABASE;

  const connector = new Connector();
  const clientOpts = await connector.getOptions({
    instanceConnectionName,
    authType: AuthTypes.IAM,
  });

  const pool = new Pool({
    ...clientOpts,
    ...(user !== undefined ? { user } : {}),
    database,
  });

  // An idle client's socket dying (Cloud SQL idle-stopped, a network blip) makes the Pool emit
  // 'error'; with no listener that crashes the whole Node process. Log and let the pool replace
  // the client on next checkout — in-flight queries still reject normally at the call site.
  pool.on("error", (err) => {
    console.error(`[store] pg pool idle-client error (suppressed): ${err.message}`);
  });

  return { pool, connector };
}

/** Tear down a pool and the connector that owns its sockets. Safe to call once. */
export async function closePool(pool: Pool, connector: Connector): Promise<void> {
  await pool.end();
  connector.close();
}
