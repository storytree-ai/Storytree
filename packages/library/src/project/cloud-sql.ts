/**
 * Capability 8 · Cloud connection (GCP) (stories/library.md): instead of a local Postgres,
 * storytree can reach a Cloud SQL for PostgreSQL instance, signing in as the user's own Google
 * account: IAM database authentication through Application Default Credentials, with no stored
 * password. Everything else works the same: one database per project, storytree_<name>, now on
 * the cloud server.
 */
import type { Duplex } from "node:stream";

import type { ServerAccess } from "./server.js";

/** A Cloud SQL instance, and the Google account storytree signs in to it as. */
export interface CloudSqlConfig {
  /**
   * The instance's connection name, project:region:instance, as the Cloud Console shows it under
   * "Connection name": `my-project:australia-southeast1:my-instance`.
   */
  readonly instance: string;
  /** The email of the Google account storytree signs in as, which is also its database user on the instance. */
  readonly user: string;
}

/**
 * The part of the Cloud SQL connector (@google-cloud/cloud-sql-connector's Connector) that
 * storytree uses. getOptions signs in and looks the instance up; the stream it hands back opens one
 * authenticated socket to the instance each time it is called.
 */
export interface CloudSqlConnector {
  getOptions(options: {
    readonly instanceConnectionName: string;
    readonly authType: "IAM";
    readonly ipType: "PUBLIC";
  }): Promise<{ readonly stream: () => Duplex }>;
  close(): void;
}

/**
 * What the cloud path can be handed in place of what it reaches for itself. Internal: tests hand
 * it a fake connector, so that nothing reaches Google. The public connect() takes options only.
 */
export interface CloudSqlSeams {
  /** Makes the connector. By default, Google's. */
  readonly connector?: () => Promise<CloudSqlConnector>;
  /** How long reaching the instance may take before it is refused, in milliseconds. By default 20 seconds. */
  readonly timeoutMs?: number;
}

/**
 * Reach the Cloud SQL instance `config` names, signed in as its user: check the config, sign in,
 * and hand back how to open a pool on any database on the instance.
 */
export async function cloudSqlServer(_config: unknown, _seams: CloudSqlSeams = {}): Promise<ServerAccess> {
  throw new Error("not implemented");
}
