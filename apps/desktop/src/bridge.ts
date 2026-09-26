/**
 * What the preload script hands the page, as `window.storytree`: these functions and nothing else.
 * Each is answered by the main process, which alone holds the library (@storytree/app's pageReads).
 */
import type { LinesSince } from "@storytree/agent-link";
import type { AnnotatedTree, Changes } from "@storytree/library";

export interface StorytreeBridge {
  /** The names of the projects in the app's library, sorted. */
  listProjects(): Promise<string[]>;
  /** A project's tree, with every node's health. Refused for a name that is not a project. */
  projectTree(name: string): Promise<AnnotatedTree>;
  /**
   * The library's changes to a project after `cursor`, oldest first, and the cursor to pass next
   * time. Start from 0. Refused for a name that is not a project.
   */
  changesSince(name: string, cursor: number): Promise<Changes>;
  /**
   * The agent activity log's lines for a project after `cursor`, oldest first, and the cursor to
   * pass next time. Start from 0. Refused for a name that is not a project.
   */
  linesSince(name: string, cursor: number): Promise<LinesSince>;
}

/** The IPC channels the functions travel on. */
export const CHANNELS = {
  listProjects: "storytree:list-projects",
  projectTree: "storytree:project-tree",
  changesSince: "storytree:changes-since",
  linesSince: "storytree:lines-since",
} as const;
