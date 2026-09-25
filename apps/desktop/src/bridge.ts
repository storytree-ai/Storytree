/**
 * What the preload script hands the page, as `window.storytree`: these two functions and nothing
 * else. Each is answered by the main process, which alone holds the library.
 */
import type { AnnotatedTree } from "@storytree/library";

export interface StorytreeBridge {
  /** The names of the projects in the app's library, sorted. */
  listProjects(): Promise<string[]>;
  /** A project's tree, with every node's health. Refused for a name that is not a project. */
  projectTree(name: string): Promise<AnnotatedTree>;
}

/** The IPC channels the two functions travel on. */
export const CHANNELS = {
  listProjects: "storytree:list-projects",
  projectTree: "storytree:project-tree",
} as const;
