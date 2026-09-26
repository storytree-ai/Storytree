/**
 * Capability 5 · Agent capability claims (stories/forest.md).
 */
import type { Line } from "@storytree/agent-link/readings";

export interface Marker {
  capability: string;
  session: string;
  text: string;
  faded: boolean;
  hooksNotRunning: boolean;
}

export function claimMarkers(_lines: readonly Line[], _now: Date): Marker[] {
  return [];
}
