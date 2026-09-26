/**
 * Capability 3 · Story node render (stories/forest.md): the plan of the 3D forest.
 */
import type { WorkStates } from "@storytree/arc-surface";
import type { AnnotatedTree, Change } from "@storytree/library";

import type { TreeForm } from "../capability-tree/capability-tree.js";

export interface PlacedTree {
  capability: string | undefined;
  form: TreeForm;
  x: number;
  z: number;
  scale: number;
}

export interface Island {
  story: string;
  title: string;
  x: number;
  z: number;
  radius: number;
  trees: PlacedTree[];
  key: string;
}

export interface ForestScene {
  islands: Island[];
}

export interface ForestDrawn {
  surface: "forest";
  stories: string[];
  capabilities: string[];
  labels: string[];
  trees: { capability: string | undefined; form: TreeForm }[];
}

export function forestScene(_tree: AnnotatedTree, _history: readonly Change[], _states: WorkStates): ForestScene {
  return { islands: [] };
}

export function changedIslands(_before: ForestScene, _after: ForestScene): string[] {
  return [];
}

export function storyAt(_scene: ForestScene, _x: number, _z: number): string | undefined {
  return undefined;
}

export function forestDrawn(_scene: ForestScene): ForestDrawn {
  return { surface: "forest", stories: [], capabilities: [], labels: [], trees: [] };
}
