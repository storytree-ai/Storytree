/**
 * Capability 5 · Health record (stories/library.md): every story, capability and contract has a
 * health record with two separate columns, what the agent REPORTED and what storytree VERIFIED by
 * seeing it for itself, each `passing`, `failing` or `not-checked`. A missing entry always reads
 * as `not-checked`, never as `passing`.
 *
 * Health is RECORDED on contracts and DERIVED for capabilities and stories, rolled up from their
 * contracts column by column. HealthRecord is a layer over capability 3's SchemaRecords and
 * capability 4's WorkModel, so it runs unchanged on the in-memory twin and on Postgres.
 */
import type { SchemaRecords } from "../schema/index.js";
import type { FieldsOf } from "../schema/types.js";
import type { ArcNode, CapabilityNode, ContractNode, ProjectTree, StoryNode, WorkModel } from "../work/index.js";

/** A column's state. A column with no entry reads `not-checked`, never `passing`. */
export type HealthState = FieldsOf<"health">["state"];

/** The two columns: what the agent `reported`, and what storytree `verified` by seeing it for itself. */
export type HealthColumnName = FieldsOf<"health">["column"];

/** One column of a node's health as it stands now. */
export interface HealthColumn {
  state: HealthState;
  /** Who wrote the entry: on a contract's column only, and only when the writer said. */
  by?: string;
  /** When the entry was written, as an ISO 8601 timestamp: on a contract's column only, once it has an entry. */
  at?: string;
  /** The note written with the entry: on a contract's column only, and only when there is one. */
  note?: string;
}

/** A node's health: the two columns, side by side. */
export interface NodeHealth {
  reported: HealthColumn;
  verified: HealthColumn;
}

/** Who is writing a health entry, and a note to keep with it. */
export interface HealthOptions {
  readonly by?: string;
  readonly note?: string;
}

/** One health entry, as it was written. */
export interface HealthEntry {
  column: HealthColumnName;
  state: HealthState;
  /** Who wrote it, when the writer said. */
  by?: string;
  /** When it was written, as an ISO 8601 timestamp. */
  at: string;
  /** The note written with it, when there is one. */
  note?: string;
}

/** A contract in the annotated tree, with its own health. */
export interface AnnotatedContract extends ContractNode {
  health: NodeHealth;
}

/** A capability in the annotated tree, with its health rolled up from its contracts. */
export interface AnnotatedCapability extends Omit<CapabilityNode, "contracts"> {
  contracts: AnnotatedContract[];
  health: NodeHealth;
}

/** A story in the annotated tree, with its health rolled up from all its capabilities' contracts. */
export interface AnnotatedStory extends Omit<StoryNode, "capabilities"> {
  capabilities: AnnotatedCapability[];
  health: NodeHealth;
}

/** WorkModel.projectTree()'s tree with every story, capability and contract's health added. */
export interface AnnotatedTree {
  stories: AnnotatedStory[];
  arcs: ArcNode[];
}

export class HealthRecord {
  readonly #records: SchemaRecords;
  readonly #work: WorkModel;

  constructor(records: SchemaRecords, work: WorkModel) {
    this.#records = records;
    this.#work = work;
  }

  async reportHealth(contractId: string, state: HealthState, options: HealthOptions = {}): Promise<HealthEntry> {
    throw new Error("not implemented");
  }

  async recordVerified(contractId: string, state: HealthState, options: HealthOptions = {}): Promise<HealthEntry> {
    throw new Error("not implemented");
  }

  async health(nodeId: string): Promise<NodeHealth> {
    throw new Error("not implemented");
  }

  async healthHistory(contractId: string): Promise<HealthEntry[]> {
    throw new Error("not implemented");
  }

  async annotate(tree?: ProjectTree): Promise<AnnotatedTree> {
    throw new Error("not implemented");
  }
}
