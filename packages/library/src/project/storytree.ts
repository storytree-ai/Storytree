/**
 * Capability 1 · Project libraries (stories/library.md): one Postgres server holds many
 * projects, each in its own database, created the first time the project is opened.
 */
import pg from "pg";
import type { Pool } from "pg";

import { SchemaRecords } from "../schema/records.js";
import { PgTransactions } from "../transactions/pg.js";
import type { Transactions } from "../transactions/types.js";
import { WorkModel } from "../work/work-model.js";
import { assertProjectName, PROJECT_DATABASE_PREFIX, projectDatabase } from "./names.js";
import { PROJECT_SCHEMA } from "./schema.js";

/** Where the Postgres server is. */
export interface ConnectOptions {
  /**
   * A postgres:// URL for the server. Its own database is only used to create and list project
   * databases; each project's records live in that project's database.
   */
  readonly url: string;
}

/** A connection to one Postgres server and the storytree projects on it. */
export interface Storytree {
  /**
   * Open the library of the project called `name`, creating its database and tables the first
   * time. A name that breaks the project-name rule is refused before anything touches the server.
   */
  openProject(name: string): Promise<Project>;
  /** The names of the storytree projects on the server, sorted. No other database is listed. */
  listProjects(): Promise<string[]>;
  /** Close this connection and every project opened through it. */
  close(): Promise<void>;
}

/** One project's library: its own database on the server. */
export interface Project {
  readonly name: string;
  /**
   * The connection pool to this project's database. Internal: tests and later capabilities use
   * it, and capability 7 keeps it out of the public API.
   */
  readonly pool: Pool;
  /** This project's records: the only data actions the library allows (capability 2). */
  readonly transactions: Transactions;
  /** The same records, typed and checked against the data schema (capability 3). */
  readonly records: SchemaRecords;
  /** The project's plan of work: stories, capabilities, contracts and arcs (capability 4). */
  readonly work: WorkModel;
  /** Close this project's connections. */
  close(): Promise<void>;
}

/** Connect to a Postgres server. Nothing touches the server until a call needs it. */
export async function connect(options: ConnectOptions): Promise<Storytree> {
  return new ServerConnection(new URL(options.url));
}

class ServerConnection implements Storytree {
  readonly #server: URL;
  /** Connections to the server's own database, used only to create and list project databases. */
  readonly #admin: Pool;
  readonly #projects = new Set<ProjectLibrary>();
  #closed = false;

  constructor(server: URL) {
    this.#server = server;
    this.#admin = newPool(server.href);
  }

  async openProject(name: string): Promise<Project> {
    assertProjectName(name); // before anything touches the server
    const database = projectDatabase(name);
    await this.#createDatabaseIfMissing(database);
    const pool = newPool(databaseUrl(this.#server, database));
    try {
      await applySchema(pool, name);
    } catch (error) {
      await pool.end();
      throw error;
    }
    const project = new ProjectLibrary(name, pool, () => this.#projects.delete(project));
    this.#projects.add(project);
    return project;
  }

  async listProjects(): Promise<string[]> {
    const { rows } = await this.#admin.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE starts_with(datname, $1)",
      [PROJECT_DATABASE_PREFIX],
    );
    return rows.map((row) => row.datname.slice(PROJECT_DATABASE_PREFIX.length)).sort();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.all([...this.#projects].map((project) => project.close()));
    await this.#admin.end();
  }

  async #createDatabaseIfMissing(database: string): Promise<void> {
    const existing = await this.#admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (existing.rows.length > 0) return;
    try {
      await this.#admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    } catch (error) {
      // Another open of the same project created it first: the outcome we wanted.
      if (!isDuplicateDatabase(error)) throw error;
    }
  }
}

class ProjectLibrary implements Project {
  readonly name: string;
  readonly pool: Pool;
  readonly transactions: Transactions;
  readonly records: SchemaRecords;
  readonly work: WorkModel;
  readonly #forget: () => void;
  #closing: Promise<void> | undefined;

  constructor(name: string, pool: Pool, forget: () => void) {
    this.name = name;
    this.pool = pool;
    this.transactions = new PgTransactions(pool);
    this.records = new SchemaRecords(this.transactions);
    this.work = new WorkModel(this.records);
    this.#forget = forget;
  }

  close(): Promise<void> {
    this.#closing ??= this.pool.end().finally(this.#forget);
    return this.#closing;
  }
}

/**
 * Apply the project schema in one transaction and record the project's name. Opens of one project
 * can race (two processes, or two first opens), so they take turns on an advisory lock: two
 * concurrent CREATE TABLE IF NOT EXISTS can otherwise collide.
 */
async function applySchema(pool: Pool, name: string): Promise<void> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('storytree.project-schema'))");
    for (const statement of PROJECT_SCHEMA) await client.query(statement);
    await client.query(
      "INSERT INTO library_meta (key, value) VALUES ('project', $1) ON CONFLICT (key) DO NOTHING",
      [name],
    );
    await client.query("COMMIT");
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release(failed);
  }
}

function newPool(connectionString: string): Pool {
  const pool = new pg.Pool({ connectionString });
  // An idle connection that drops (a server restart, a dropped database) is discarded by the pool
  // and the next query reconnects or fails loudly. Without a listener Node would crash instead.
  pool.on("error", () => {});
  return pool;
}

/** The server URL with its database swapped for `database`; user, host, port and options stay. */
function databaseUrl(server: URL, database: string): string {
  const url = new URL(server.href);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.href;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * CREATE DATABASE lost a race with another open of the same project. Postgres reports that as
 * duplicate_database or, when both creates passed its own existence check, as a unique violation
 * on pg_database's name index.
 */
function isDuplicateDatabase(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return code === "42P04" || (code === "23505" && constraint === "pg_database_datname_index");
}
