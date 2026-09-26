/**
 * Capability 1 · Work states (stories/arc-surface.md), at part grain.
 */
import type { Line } from "@storytree/agent-link";

/** Where a part stands. */
export type PartState = "planned" | "in-progress" | "landed";

/** The one reading of where each part, and each story from its parts, stands. */
export interface WorkStates {
  part(id: string): PartState;
  story(parts: readonly string[]): PartState;
}

export function workStates(_lines: readonly Line[]): WorkStates {
  return { part: () => "planned", story: () => "planned" };
}
