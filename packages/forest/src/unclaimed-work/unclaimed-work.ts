/**
 * Capability 6 · Unclaimed work (stories/forest.md).
 */
import type { Line } from "@storytree/agent-link/readings";

export interface UnclaimedEntry {
  session: string;
  agent: string;
  files: string[];
  command?: string;
  at: string;
}

export interface UnclaimedWork {
  count: number;
  entries: UnclaimedEntry[];
}

export function unclaimedWork(_lines: readonly Line[]): UnclaimedWork {
  return { count: 0, entries: [] };
}
