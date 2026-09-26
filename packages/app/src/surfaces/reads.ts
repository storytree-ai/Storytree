/**
 * Capability 3 · Surfaces (stories/app.md): what the app answers when the page asks. The page runs
 * sandboxed and cannot reach the database, so every read a surface makes comes through here. (Stub:
 * not built yet.)
 */
import type { LinesSince } from "@storytree/agent-link";
import type { AnnotatedTree, Changes, Storytree } from "@storytree/library";

/** The page's reads, as the app answers them. */
export interface PageReads {
  /** The names of the projects in the app's library, sorted. */
  listProjects(): Promise<string[]>;
  /** A project's tree, with every node's health. */
  projectTree(project: unknown): Promise<AnnotatedTree>;
  /** The library's changes to a project after `cursor` (0 for all), and the cursor to pass next time. */
  changesSince(project: unknown, cursor: unknown): Promise<Changes>;
  /** The agent activity log's lines for a project after `cursor` (0 for all), and the cursor to pass next time. */
  linesSince(project: unknown, cursor: unknown): Promise<LinesSince>;
  /** Close the libraries and the log opened here. The connection to the library stays the caller's. */
  close(): Promise<void>;
}

export interface PageReadsOptions {
  /** The app's connection to its library. */
  readonly storytree: Storytree;
  /** The address of the Postgres server the libraries are on, where the agent activity log lives too. */
  readonly serverUrl: string;
}

export function pageReads(_options: PageReadsOptions): PageReads {
  const notBuilt = async (): Promise<never> => {
    throw new Error("the page's reads are not built yet");
  };
  return { listProjects: notBuilt, projectTree: notBuilt, changesSince: notBuilt, linesSince: notBuilt, close: async () => {} };
}
