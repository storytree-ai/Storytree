/** One local Postgres server on a data directory. (Stub: not built yet.) */

export interface ClusterOptions {
  /** The directory holding initdb, pg_ctl and postgres. By default, findBinaries(). */
  readonly bin?: string;
  /** Where the Postgres tools' output is appended. By default, `<dataDir>.tools.log`. */
  readonly toolLog?: string;
  /** Called with each step worth telling a person about. */
  readonly log?: (message: string) => void;
}

export interface StartOptions extends ClusterOptions {
  /** The cluster's directory. It is made (initdb) if there is none. */
  readonly dataDir: string;
  /** The port to listen on, on 127.0.0.1. By default, a free one. */
  readonly port?: number;
  /** Where the server writes its log. By default, `<dataDir>.log`. */
  readonly serverLog?: string;
  /** Who is starting it, as a refusal names the holder to someone else. */
  readonly owner?: string;
}

/** A running server. */
export interface LocalPostgres {
  /** postgres://postgres@127.0.0.1:<port>/postgres */
  readonly url: string;
  readonly port: number;
  /** The data directory, as an absolute path. */
  readonly dataDir: string;
  /** Stop the server. Stopping it again is harmless. */
  stop(): Promise<void>;
}

/** A start refused because a live process holds the data directory. */
export class DataDirInUseError extends Error {
  readonly dataDir: string;
  readonly pid: number;
  readonly owner: string | undefined;

  constructor(dataDir: string, pid: number, owner?: string) {
    super(`${dataDir} is in use by process ${pid}${owner === undefined ? "" : ` (${owner})`}`);
    this.name = "DataDirInUseError";
    this.dataDir = dataDir;
    this.pid = pid;
    this.owner = owner;
  }
}

/** Make the cluster in `dataDir` unless there is one. True if it was made now. */
export async function ensureCluster(_dataDir: string, _options: ClusterOptions = {}): Promise<boolean> {
  throw new Error("ensureCluster is not built yet");
}

/** Start the server on `options.dataDir`. */
export async function start(_options: StartOptions): Promise<LocalPostgres> {
  throw new Error("start is not built yet");
}
