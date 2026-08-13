import { existsSync } from "node:fs";

import { Pool, type PoolConfig } from "pg";
import { Connector, AuthTypes } from "@google-cloud/cloud-sql-connector";
import { GoogleAuth, Impersonated } from "google-auth-library";

import { dataPlaneRefusal } from "./data-plane.js";
import { resolveDatabaseUser } from "./db-credential.js";

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
  /**
   * Optional keyless connector identity. The local ADC principal must have Token Creator on this
   * service account; the database `user` remains the matching Cloud SQL IAM database role.
   */
  impersonateServiceAccount?: string;
}

/** A pool paired with the connector that owns its sockets, so both can be torn down together. */
export interface PoolHandle {
  pool: Pool;
  connector: Connector;
}

interface ConnectionConstruction {
  createConnector: () => Connector;
  createPool: (config: PoolConfig) => Pool;
}

/**
 * Build a `pg` Pool wired to Cloud SQL over IAM auth. Defaults:
 *   - instanceConnectionName: env STORYTREE_INSTANCE_CONNECTION_NAME ?? the ADR-0015 literal
 *   - user: env STORYTREE_DB_USER (the operator IAM email) — REQUIRED for a live connection
 *   - database: 'storytree'
 *
 * Returns the Pool together with its Connector so the caller can {@link closePool} both.
 */
export async function createPool(
  opts?: CreatePoolOptions,
  construction?: ConnectionConstruction,
): Promise<PoolHandle> {
  // ADR-0250: refuse a data-plane dial this session's egress structurally cannot carry, BEFORE the
  // connector spends its handshake budget failing. `createPool` is the single choke point every
  // `--pg` / `--real` / gate-check path funnels through, so one guard here covers them all. Callers
  // that already treat a createPool throw as "live store unavailable" (the gate's check:* rungs)
  // keep skipping exactly as they do offline — only the reason they print gets better.
  const refusal = dataPlaneRefusal(process.env, { dirExists: existsSync });
  if (refusal !== null) throw new Error(refusal);

  // Hydration stays lazy at this shared dialing root: a programmatic override wins, otherwise a
  // real environment value wins, and only a missing/blank STORYTREE_DB_USER is filled from disk.
  const user = resolveDatabaseUser(opts?.user, process.env);

  if (user === undefined) {
    throw new Error(
      "createPool: no IAM principal resolved; set STORYTREE_DB_USER to the operator IAM email " +
        "(e.g. export STORYTREE_DB_USER=my-sa@project.iam.gserviceaccount.com). " +
        "A user-less pool cannot authenticate with Cloud SQL IAM auth.",
    );
  }

  const instanceConnectionName =
    opts?.instanceConnectionName ??
    process.env["STORYTREE_INSTANCE_CONNECTION_NAME"] ??
    DEFAULT_INSTANCE_CONNECTION_NAME;
  const database = opts?.database ?? DEFAULT_DATABASE;

  const impersonateServiceAccount =
    opts?.impersonateServiceAccount?.trim() ||
    process.env["STORYTREE_DB_IMPERSONATE_SERVICE_ACCOUNT"]?.trim();
  let connector: Connector;
  if (construction !== undefined) {
    connector = construction.createConnector();
  } else if (impersonateServiceAccount) {
    const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
    const sourceClient = await new GoogleAuth({ scopes }).getClient();
    const auth = new Impersonated({
      sourceClient,
      targetPrincipal: impersonateServiceAccount,
      targetScopes: scopes,
      lifetime: 3600,
    });
    connector = new Connector({ auth });
  } else {
    connector = new Connector();
  }
  const clientOpts = await connector.getOptions({
    instanceConnectionName,
    authType: AuthTypes.IAM,
  });

  const poolConfig = {
    ...clientOpts,
    user,
    database,
  };
  const pool = construction?.createPool(poolConfig) ?? new Pool(poolConfig);

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
