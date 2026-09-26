/**
 * Capability 1 · Project routing (stories/agent-link.md). Not built yet: this stub gives the
 * contracts' tests something to fail against.
 */
import type { Storytree } from "@storytree/library";

/** The marker a folder set up as a storytree project holds. */
export const MARKER_FILE = ".storytree.json";
/** What routing says of a folder nobody has set up. */
export const NOT_A_PROJECT = "not a storytree project";
/** What routing says while the app's database is not running. */
export const NOT_RUNNING = "storytree isn't running";

export type ProjectLookup = { project: string; folder: string } | { project: undefined; message: string };

export interface SetUpOptions {
  readonly folder: string;
  readonly project: string;
  readonly storytree: Storytree;
}

export interface LocateOptions {
  readonly dataDir?: string;
}

export type StorytreeAddress = { running: true; url: string } | { running: false; message: string };

export type Route =
  | { status: "routed"; project: string; folder: string; url: string }
  | { status: "not-a-project"; message: string }
  | { status: "not-running"; project: string; message: string };

export function findProject(_from: string): ProjectLookup {
  throw new Error("project routing is not built yet");
}

export async function setUpProject(_options: SetUpOptions): Promise<{ project: string; marker: string }> {
  throw new Error("project routing is not built yet");
}

export function locateStorytree(_options: LocateOptions = {}): StorytreeAddress {
  throw new Error("project routing is not built yet");
}

export function route(_from: string, _options: LocateOptions = {}): Route {
  throw new Error("project routing is not built yet");
}
