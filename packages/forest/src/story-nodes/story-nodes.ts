/**
 * Capability 1 · Story nodes (stories/forest.md): one story node for every story in the project,
 * each at its place, with its title and its health as the agent reports it. (Stub: not built yet.)
 */
import type { AnnotatedTree, Change, HealthState } from "@storytree/library";

/** A point on the forest's ground, in place-widths from its centre. */
export interface Point {
  x: number;
  y: number;
}

export interface StoryNode {
  id: string;
  title: string;
  reported: HealthState;
  place: number;
  at: Point;
}

export function storyNodes(_tree: AnnotatedTree, _history: readonly Change[]): StoryNode[] {
  throw new Error("story nodes are not built yet");
}
