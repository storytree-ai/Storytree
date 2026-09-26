/**
 * Capability 4 · Drill-down (stories/forest.md).
 */
import type { PartState, WorkStates } from "@storytree/arc-surface";
import type { AnnotatedTree, Change, HealthState } from "@storytree/library";

export interface ContractLine {
  id: string;
  title: string;
  reported: HealthState;
  trail: string;
  verified?: HealthState;
}

export interface CapabilityLine {
  id: string;
  title: string;
  description: string;
  reported: HealthState;
  verified?: HealthState;
  state: PartState;
  contracts: ContractLine[];
}

export interface Arrow {
  from: string;
  to: string;
  toTitle: string;
  toStory?: string;
  landed: boolean;
}

export interface StoryPanel {
  story: string;
  title: string;
  description: string;
  capabilities: CapabilityLine[];
  arrows: Arrow[];
}

export const NO_DESCRIPTION = "no description yet";

export function drillDown(_tree: AnnotatedTree, _story: string, _states: WorkStates, _history: readonly Change[]): StoryPanel | undefined {
  return undefined;
}
