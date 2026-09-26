/**
 * Capability 2 · Agent activity log (stories/agent-link.md). Not built yet: this stub gives the
 * contracts' tests something to fail against.
 */
import type { LinesSince, Line, NewLine } from "./lines.js";

/** The database the log lives in, on the same server as the projects' libraries. */
export const ACTIVITY_DATABASE = "storytree-activity";

/** The agent activity log on one Postgres server: one log per project, only ever added to. */
export interface ActivityLog {
  /** Add a line to `project`'s log, and return it as the log keeps it. */
  append(project: string, line: NewLine): Promise<Line>;
  /** `project`'s lines after `cursor`, oldest first, and the cursor to pass next time. Start from 0. */
  since(project: string, cursor: number): Promise<LinesSince>;
  /** Close the log's connections. */
  close(): Promise<void>;
}

export interface OpenOptions {
  /** How long a connection to the server may take before the attempt is given up. */
  readonly connectTimeoutMs?: number;
}

/** Open the agent activity log on the Postgres server at `url` (a postgres:// URL). */
export async function openActivityLog(_url: string, _options: OpenOptions = {}): Promise<ActivityLog> {
  throw new Error("the agent activity log is not built yet");
}
