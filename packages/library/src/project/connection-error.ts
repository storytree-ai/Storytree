/**
 * The refusal to connect (capability 8 · Cloud connection, contract 8.2 in stories/library.md). A
 * server storytree cannot reach or use as it is set up is refused with a message saying what to
 * fix: never a hang, and never a driver's raw error. It is one class, so a caller catches every
 * such refusal the same way, and its `problem` says which one it is.
 */

/** What stopped storytree connecting. */
export type ConnectionProblem =
  /** The options given to connect() do not describe a server: a Cloud SQL instance not written as project:region:instance, say. */
  | "config"
  /** No Google sign-in was found, or the one found has expired or been revoked. */
  | "sign-in"
  /** The Cloud SQL instance does not exist, or the account is not allowed to use it. */
  | "instance"
  /** The account is not a database user on the Cloud SQL instance. */
  | "database-user"
  /** A new project's database cannot be made: the server's user may not create databases. */
  | "create-database"
  /** The server did not answer in time. */
  | "timeout";

/** Storytree cannot reach or use the server as it is set up. The message says what to fix. */
export class ConnectionError extends Error {
  /** What stopped storytree connecting. */
  readonly problem: ConnectionProblem;

  /** `cause`, when given, is the failure this refusal explains. */
  constructor(problem: ConnectionProblem, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ConnectionError";
    this.problem = problem;
  }
}

/**
 * The refusal of a new project's database: the server's user `user` may not create databases
 * (Postgres refused CREATE DATABASE with `cause`, SQLSTATE 42501). It names the one grant that
 * fixes it for good, and the other way out: the database made by someone who may, owned by the
 * user, since only a database's owner may create tables in it (Postgres 15 and later).
 */
export function cannotCreateDatabases(
  server: "postgres" | "cloud-sql",
  user: string,
  database: string,
  cause: unknown,
): ConnectionError {
  const role = quoteIdentifier(user);
  const [whose, grantor] =
    server === "cloud-sql"
      ? ["Your Cloud SQL user", "as the instance's `postgres` user"]
      : ["Your Postgres user", "as a superuser (such as `postgres`)"];
  return new ConnectionError(
    "create-database",
    `${whose} cannot create databases, and storytree keeps one database per project. Grant it once, ${grantor}: ` +
      `\`ALTER ROLE ${role} CREATEDB;\` — or create the database \`${database}\` yourself, owned by ${role}.`,
    cause,
  );
}

/** Whether `error` is Postgres refusing for want of a privilege (SQLSTATE 42501, insufficient_privilege). */
export function isInsufficientPrivilege(error: unknown): boolean {
  return sqlState(error) === "42501";
}

/** The SQLSTATE of a Postgres error, as pg reports it in `code`; undefined for anything else. */
export function sqlState(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
