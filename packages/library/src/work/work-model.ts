/**
 * Capability 4 · Work model (stories/library.md): each project's plan of work. Stories belong to
 * the project; a capability points at its story, a contract at its capability, and an arc may list
 * the stories it grows. The library refuses broken structure.
 */
import type { SchemaRecord, SchemaRecords } from "../schema/index.js";
import type { FieldsOf } from "../schema/types.js";

/** A new story's fields. */
export type NewStory = FieldsOf<"story">;
/** A new arc's fields. `stories`, when given, lists existing stories; an arc may list none. */
export type NewArc = FieldsOf<"arc">;
/** A new capability's fields: `story` and every `dependsOn` id must name existing records. */
export type NewCapability = FieldsOf<"capability">;
/** A new contract's fields: `capability` must name an existing capability. */
export type NewContract = FieldsOf<"contract">;
/** An edit of a capability: some of its fields. A field set to undefined is removed. */
export type CapabilityEdit = { [F in keyof FieldsOf<"capability">]?: FieldsOf<"capability">[F] | undefined };

/** The plan of work as the forest reads it: story › capability › contract, and the arcs. */
export interface ProjectTree {
  /** Every story, in creation order, each holding its capabilities. */
  stories: StoryNode[];
  /** Every arc, in creation order. */
  arcs: ArcNode[];
}

export interface StoryNode {
  id: string;
  title: string;
  description?: string;
  /** The capabilities pointing at this story, in creation order. */
  capabilities: CapabilityNode[];
}

export interface CapabilityNode {
  id: string;
  title: string;
  description?: string;
  /** The capabilities this one depends on, as stored. */
  dependsOn: string[];
  /** The contracts pointing at this capability, in creation order. */
  contracts: ContractNode[];
}

export interface ContractNode {
  id: string;
  title: string;
  description?: string;
}

export interface ArcNode {
  id: string;
  title: string;
  description?: string;
  /** The stories the arc lists, as stored: empty for an arc that lists none. */
  stories: string[];
}

export class WorkModel {
  readonly #records: SchemaRecords;

  constructor(records: SchemaRecords) {
    this.#records = records;
  }

  async addStory(story: NewStory): Promise<SchemaRecord<"story">> {
    throw new Error("not implemented");
  }

  async createArc(arc: NewArc): Promise<SchemaRecord<"arc">> {
    throw new Error("not implemented");
  }

  async addCapability(capability: NewCapability): Promise<SchemaRecord<"capability">> {
    throw new Error("not implemented");
  }

  async editCapability(id: string, fields: CapabilityEdit): Promise<SchemaRecord<"capability"> | null> {
    throw new Error("not implemented");
  }

  async addContract(contract: NewContract): Promise<SchemaRecord<"contract">> {
    throw new Error("not implemented");
  }

  async projectTree(): Promise<ProjectTree> {
    throw new Error("not implemented");
  }

  async arcsFor(storyId: string): Promise<SchemaRecord<"arc">[]> {
    throw new Error("not implemented");
  }
}
