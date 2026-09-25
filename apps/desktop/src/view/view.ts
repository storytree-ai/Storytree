/**
 * The desktop app's view of a project: the library's projectTree(), rendered. (Stub: not built yet.)
 */
import type { AnnotatedTree, HealthState } from "@storytree/library";

export type ColumnName = "reported" | "verified";

export interface CellView {
  column: ColumnName;
  label: string;
  state: HealthState;
  badge: string;
  detail?: string;
}

export type HealthView = [reported: CellView, verified: CellView];

export interface ContractView {
  id: string;
  title: string;
  description?: string;
  health: HealthView;
}

export interface CapabilityView {
  id: string;
  title: string;
  description?: string;
  dependsOn: string[];
  health: HealthView;
  contracts: ContractView[];
}

export interface Tally {
  passing: number;
  failing: number;
  notChecked: number;
}

export interface StoryView {
  id: string;
  title: string;
  description?: string;
  health: HealthView;
  contractCount: number;
  tally: Record<ColumnName, Tally>;
  capabilities: CapabilityView[];
}

export interface ProjectView {
  project: string;
  stories: StoryView[];
}

export function inBuildOrder<T extends { readonly id: string; readonly dependsOn: readonly string[] }>(capabilities: readonly T[]): T[] {
  return [...capabilities];
}

export function projectView(project: string, _tree: AnnotatedTree): ProjectView {
  return { project, stories: [] };
}

export function renderProject(_project: string, _tree: AnnotatedTree): string {
  return "";
}

export function renderNoProjects(): string {
  return "";
}

export function renderSwitcher(_projects: readonly string[], _current: string | undefined): string {
  return "";
}
