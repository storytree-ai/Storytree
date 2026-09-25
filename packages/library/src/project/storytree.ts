/**
 * Capability 1 · Project libraries (stories/library.md): one Postgres server holds many
 * projects, each in its own database, created the first time the project is opened.
 */
import type { Pool } from "pg";

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
  /** Close this project's connections. */
  close(): Promise<void>;
}

/** Connect to a Postgres server. Nothing touches the server until a call needs it. */
export async function connect(_options: ConnectOptions): Promise<Storytree> {
  throw new Error("not implemented");
}
