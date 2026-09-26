/**
 * Capability 2 · Capability tree (stories/forest.md).
 */
import type { WorkStates } from "@storytree/arc-surface";
import type { AnnotatedStory, HealthState } from "@storytree/library";

/** How a capability's tree looks. */
export type TreeForm = "seedling" | "pale" | "green" | "dead";

/** One tree in a story node's grove. */
export interface Tree {
  capability: string | undefined;
  title: string;
  buildsOn: string[];
  state: ReturnType<WorkStates["part"]>;
  reported: HealthState;
  form: TreeForm;
}

export function grove(_story: AnnotatedStory, _states: WorkStates): Tree[] {
  return [];
}
