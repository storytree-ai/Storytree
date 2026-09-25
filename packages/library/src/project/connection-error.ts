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
