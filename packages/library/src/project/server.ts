/**
 * How storytree reaches a Postgres server: the seam between where the server is (a postgres://
 * URL, or a Cloud SQL instance reached with Google sign-in, capability 8) and what storytree does
 * there (capability 1). Wherever the server is, every database on it is reached through a pool its
 * PoolFactory makes.
 */
import type { Pool } from "pg";

/** Makes a connection pool for one database on the server. */
export type PoolFactory = (database: string) => Pool;

/** One Postgres server, as storytree reaches it. */
export interface ServerAccess {
  /** What kind of server it is, for the messages that say what to fix. */
  readonly kind: "postgres" | "cloud-sql";
  /** A pool on the server's own database, used only to create and list project databases. */
  readonly admin: Pool;
  /** Makes the pool for one database on the server: a project's. */
  readonly pool: PoolFactory;
  /**
   * A failure to reach or use the server, as a ConnectionError saying what to fix when it is one
   * this server knows how to explain; any other error as it is.
   */
  explain(error: unknown): unknown;
  /** Release what reaching the server holds besides its pools (the Cloud SQL connector). */
  close(): void;
}
