/**
 * Capability 2 · Agent activity log (stories/agent-link.md): the agent link's own logbook of what
 * agents do, one per project, kept beside the library rather than in it (ADR-0626 D2). Lines are
 * only ever added, and are read back in order as "everything since line N", including lines other
 * processes wrote.
 *
 * - It lives in its own database, `storytree-activity`, on the same Postgres server as the
 *   projects' libraries: never in a project's database, so the library's records and change feed
 *   never see it. The library lists as projects only databases named `storytree_<name>`, so this
 *   one, with a hyphen, is never mistaken for a project.
 * - One table holds every project's lines, and a project reads only its own. A line's number comes
 *   from one sequence shared by all projects, so a project's numbers rise but skip.
 * - A project's writes take turns on a lock, so its lines commit in the order they are numbered:
 *   a reader passing back each cursor it is handed never misses a line that committed late, nor
 *   reads one twice.
 * - There is no way to change or delete a line.
 */
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { NEW_LINE, type Line, type LinesSince, type NewLine } from "./lines.js";

/** The database the log lives in, on the same server as the projects' libraries. */
export const ACTIVITY_DATABASE = "storytree-activity";

/** The agent activity log on one Postgres server: one log per project, only ever added to. */
export interface ActivityLog {
  /** Add a line to `project`'s log, and return it as the log keeps it. A line that is not one the log knows is refused. */
  append(project: string, line: NewLine): Promise<Line>;
  /** `project`'s lines after `cursor`, oldest first, and the cursor to pass next time. Start from 0. */
  since(project: string, cursor: number): Promise<LinesSince>;
  /** Close the log's connections. */
  close(): Promise<void>;
}

export interface OpenOptions {
  /** How long a connection to the server may take before the attempt is given up. By default, 5 s. */
  readonly connectTimeoutMs?: number;
}

/** The log's tables, as idempotent statements applied in order at every open. Later changes are appended. */
const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS activity (
    seq     bigserial PRIMARY KEY,
    project text NOT NULL,
    at      timestamptz NOT NULL DEFAULT now(),
    session text NOT NULL,
    harness text,
    source  text NOT NULL,
    kind    text NOT NULL,
    folder  text,
    detail  jsonb NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activity_project_seq_idx ON activity (project, seq)`,
];

/** The fields every line has its own column for; the rest of a line is its `detail`. */
const COLUMNS = ["session", "harness", "source", "kind", "folder"] as const;

interface ActivityRow {
  seq: string; // bigint: pg hands it over as a string
  project: string;
  at: Date;
  session: string;
  harness: string | null;
  source: string;
  kind: string;
  folder: string | null;
  detail: Record<string, unknown>;
}

/**
 * Open the agent activity log on the Postgres server at `url` (a postgres:// URL; its own database
 * is used only to create the log's, the first time). The log's database and table are made if
 * they are missing.
 */
export async function openActivityLog(url: string, options: OpenOptions = {}): Promise<ActivityLog> {
  const server = new URL(url);
  const timeout = options.connectTimeoutMs ?? 5_000;
  let pool = newPool(databaseUrl(server, ACTIVITY_DATABASE), timeout);
  try {
    await applySchema(pool);
  } catch (error) {
    await pool.end();
    if (!isMissingDatabase(error)) throw error;
    await createDatabase(server, timeout);
    pool = newPool(databaseUrl(server, ACTIVITY_DATABASE), timeout);
    try {
      await applySchema(pool);
    } catch (again) {
      await pool.end();
      throw again;
    }
  }
  return new PgActivityLog(pool);
}

class PgActivityLog implements ActivityLog {
  readonly #pool: Pool;
  #closing: Promise<void> | undefined;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async append(project: string, line: NewLine): Promise<Line> {
    assertProject(project);
    const parsed = NEW_LINE.safeParse(line);
    if (!parsed.success) throw new Error(`the activity log refused a line: ${z.prettifyError(parsed.error)}`);
    const { session, harness, source, kind, folder, ...detail } = parsed.data;
    return this.#write(project, async (client) => {
      const { rows } = await client.query<{ seq: string; at: Date }>(
        `INSERT INTO activity (project, session, harness, source, kind, folder, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING seq, at`,
        [project, session, harness ?? null, source, kind, folder ?? null, JSON.stringify(detail)],
      );
      const row = rows[0]!;
      return { ...parsed.data, seq: Number(row.seq), project, at: row.at.toISOString() } as Line;
    });
  }

  async since(project: string, cursor: number): Promise<LinesSince> {
    assertProject(project);
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new RangeError(`since takes a cursor: 0 to read from the start, or a line's number (a whole number, 0 or more), not ${String(cursor)}`);
    }
    const { rows } = await this.#pool.query<ActivityRow>(
      `SELECT seq, project, at, ${COLUMNS.join(", ")}, detail FROM activity WHERE project = $1 AND seq > $2 ORDER BY seq`,
      [project, cursor],
    );
    const lines = rows.map(lineOf);
    return { lines, cursor: lines.at(-1)?.seq ?? cursor };
  }

  close(): Promise<void> {
    this.#closing ??= this.#pool.end();
    return this.#closing;
  }

  /**
   * Run one write as one transaction, holding `project`'s lock until it commits: the project's
   * writes take turns, so they commit in the order their lines are numbered. Writes for other
   * projects do not wait.
   */
  async #write<T>(project: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('storytree.activity'), hashtext($1))", [project]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        broken = true;
      });
      throw error;
    } finally {
      client.release(broken);
    }
  }
}

/** A stored row as the line it is: its own fields, with nothing absent written as undefined. */
function lineOf(row: ActivityRow): Line {
  return {
    ...row.detail,
    seq: Number(row.seq),
    project: row.project,
    at: row.at.toISOString(),
    session: row.session,
    ...(row.harness === null ? {} : { harness: row.harness }),
    source: row.source,
    kind: row.kind,
    ...(row.folder === null ? {} : { folder: row.folder }),
  } as Line;
}

function assertProject(project: unknown): asserts project is string {
  if (typeof project !== "string" || project === "") throw new TypeError(`the activity log is kept per project: name one, not ${JSON.stringify(project)}`);
}

/** Apply the log's schema in one transaction; opens racing each other take turns on a lock. */
async function applySchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('storytree.activity-schema'))");
    for (const statement of SCHEMA) await client.query(statement);
    await client.query("COMMIT");
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release(failed);
  }
}

/** Create the log's database from the server's own. Another open creating it first is the outcome wanted. */
async function createDatabase(server: URL, timeout: number): Promise<void> {
  const client = new pg.Client({ connectionString: server.href, connectionTimeoutMillis: timeout });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${ACTIVITY_DATABASE}"`);
  } catch (error) {
    const { code, constraint } = error as { code?: unknown; constraint?: unknown };
    if (!(code === "42P04" || (code === "23505" && constraint === "pg_database_datname_index"))) throw error;
  } finally {
    await client.end();
  }
}

function newPool(connectionString: string, timeout: number): Pool {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: timeout });
  // An idle connection that drops is discarded by the pool; without a listener Node would crash.
  pool.on("error", () => {});
  return pool;
}

/** The server URL with its database swapped for `database`: user, host, port and options stay. */
function databaseUrl(server: URL, database: string): string {
  const url = new URL(server.href);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.href;
}

/** The server said the database does not exist (invalid_catalog_name). */
function isMissingDatabase(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "3D000";
}
