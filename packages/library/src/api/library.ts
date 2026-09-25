/**
 * Capability 7 · Library API (stories/library.md): one small, fixed list of functions is the only
 * way anything outside the library reads or writes it. The agent link, the arc surface, the forest
 * and the desktop app all call these, and changesSince lets them see what just changed without
 * re-reading everything.
 *
 * connect() reaches a Postgres server, and openProject() hands back a Library: the public face of
 * one project. It composes the internals (the project's transactions, typed records, work model,
 * knowledge and health) without exposing any of them, and everything it returns is data.
 */
import type { AnnotatedTree, HealthEntry, HealthOptions, HealthState, NodeHealth } from "../health/index.js";
import type { NewDecision, NewDefinition, NewMemory, Note, NoteEdit } from "../knowledge/index.js";
import { connect as connectServer, type ConnectOptions, type Project, type Storytree as Server } from "../project/index.js";
import type { SchemaRecord } from "../schema/index.js";
import type { HistoryEntry, RecordEnvelope } from "../transactions/index.js";
import type { CapabilityEdit, NewArc, NewCapability, NewContract, NewStory } from "../work/index.js";

/** A connection to one Postgres server and the storytree projects on it. */
export interface Storytree {
  /**
   * Open the library of the project called `name`, creating its database the first time. A name
   * that breaks the project-name rule is refused (ProjectNameError) before anything touches the
   * server.
   */
  openProject(name: string): Promise<Library>;
  /** The names of the storytree projects on the server, sorted. No other database is listed. */
  listProjects(): Promise<string[]>;
  /** Close this connection and every library opened through it. */
  close(): Promise<void>;
}

/** One project's library, as everything outside the library reaches it. */
export interface Library {
  /** The project's name. */
  readonly name: string;

  /** Add a story to the project, under an id the library makes. */
  addStory(story: NewStory): Promise<SchemaRecord<"story">>;
  /** Create an arc. Every story it lists must be a live story (MissingReferenceError otherwise); it may list none. */
  createArc(arc: NewArc): Promise<SchemaRecord<"arc">>;
  /** Add a capability to a story. The story, and every capability it depends on, must be live. */
  addCapability(capability: NewCapability): Promise<SchemaRecord<"capability">>;
  /**
   * Change only the named fields of a capability. A dependency that would close a loop is refused
   * (DependencyLoopError). Null, with nothing written, if `id` is not a live capability.
   */
  editCapability(id: string, fields: CapabilityEdit): Promise<SchemaRecord<"capability"> | null>;
  /** Add a contract to a capability, which must be a live capability. */
  addContract(contract: NewContract): Promise<SchemaRecord<"contract">>;
  /** The plan as it is now, story › capability › contract with every node's health, and the arcs: what the forest reads. */
  projectTree(): Promise<AnnotatedTree>;
  /** The live arcs listing story `storyId`, in creation order. */
  arcsFor(storyId: string): Promise<SchemaRecord<"arc">[]>;

  /** Write what the agent reported about a contract. Health is written on contracts only: anything else is refused. */
  reportHealth(contractId: string, state: HealthState, options?: HealthOptions): Promise<HealthEntry>;
  /** Write what storytree verified about a contract, by seeing it for itself. */
  recordVerified(contractId: string, state: HealthState, options?: HealthOptions): Promise<HealthEntry>;
  /** A story's, capability's or contract's health: the reported and the verified column side by side. */
  health(nodeId: string): Promise<NodeHealth>;
  /** Every health entry of a contract, both columns, in the order written. */
  healthHistory(contractId: string): Promise<HealthEntry[]>;

  /** Write a memory note. Every link must name a live record. */
  writeMemory(memory: NewMemory): Promise<SchemaRecord<"memory">>;
  /** Record a decision. Every link must name a live record. */
  recordDecision(decision: NewDecision): Promise<SchemaRecord<"decision">>;
  /** Define a term. Every link must name a live record. */
  defineTerm(definition: NewDefinition): Promise<SchemaRecord<"definition">>;
  /** Change only the named fields of a note, keeping its old wording in history. Null if `id` is not a live note. */
  editNote(id: string, fields: NoteEdit): Promise<Note | null>;
  /** The live notes holding every word of `query`, ignoring case, in creation order. */
  search(query: string): Promise<Note[]>;
  /** The live notes linking to `nodeId`, in creation order. */
  relatedNotes(nodeId: string): Promise<Note[]>;

  /**
   * Retire a record: it is gone from every read, and its history keeps it and `reason`. Retiring
   * a missing or already retired record is a harmless no-op.
   */
  retire(id: string, reason: string): Promise<void>;
  /**
   * The changes after `cursor`, oldest first, and the cursor to pass next time. Start from 0; pass
   * back each cursor handed out and no change is ever missed or seen twice.
   */
  changesSince(cursor: number): Promise<Changes>;
  /** Close this library's connections. */
  close(): Promise<void>;
}

/** One change to the project's records, as the history keeps it. */
export interface Change {
  /** Where the change sits in the project's history. Passed as a cursor, it reads what came after it. */
  seq: number;
  recordId: string;
  type: string;
  action: HistoryEntry["action"];
  /** The record as the change left it; for `retired`, its last state. */
  record: RecordEnvelope;
}

/** What changesSince returns. */
export interface Changes {
  /** The changes after the cursor given, oldest first. */
  changes: Change[];
  /** The cursor to pass next time: the last change's seq, or the cursor given when there are no changes. */
  cursor: number;
}

/** Connect to a Postgres server. Nothing touches the server until a call needs it. */
export async function connect(options: ConnectOptions): Promise<Storytree> {
  return new ServerHandle(await connectServer(options));
}

class ServerHandle implements Storytree {
  readonly #server: Server;

  constructor(server: Server) {
    this.#server = server;
  }

  async openProject(name: string): Promise<Library> {
    return new LibraryHandle(await this.#server.openProject(name));
  }

  listProjects(): Promise<string[]> {
    return this.#server.listProjects();
  }

  close(): Promise<void> {
    return this.#server.close();
  }
}

class LibraryHandle implements Library {
  readonly name: string;
  readonly #project: Project;

  constructor(project: Project) {
    this.name = project.name;
    this.#project = project;
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

  async projectTree(): Promise<AnnotatedTree> {
    throw new Error("not implemented");
  }

  async arcsFor(storyId: string): Promise<SchemaRecord<"arc">[]> {
    throw new Error("not implemented");
  }

  async reportHealth(contractId: string, state: HealthState, options?: HealthOptions): Promise<HealthEntry> {
    throw new Error("not implemented");
  }

  async recordVerified(contractId: string, state: HealthState, options?: HealthOptions): Promise<HealthEntry> {
    throw new Error("not implemented");
  }

  async health(nodeId: string): Promise<NodeHealth> {
    throw new Error("not implemented");
  }

  async healthHistory(contractId: string): Promise<HealthEntry[]> {
    throw new Error("not implemented");
  }

  async writeMemory(memory: NewMemory): Promise<SchemaRecord<"memory">> {
    throw new Error("not implemented");
  }

  async recordDecision(decision: NewDecision): Promise<SchemaRecord<"decision">> {
    throw new Error("not implemented");
  }

  async defineTerm(definition: NewDefinition): Promise<SchemaRecord<"definition">> {
    throw new Error("not implemented");
  }

  async editNote(id: string, fields: NoteEdit): Promise<Note | null> {
    throw new Error("not implemented");
  }

  async search(query: string): Promise<Note[]> {
    throw new Error("not implemented");
  }

  async relatedNotes(nodeId: string): Promise<Note[]> {
    throw new Error("not implemented");
  }

  async retire(id: string, reason: string): Promise<void> {
    throw new Error("not implemented");
  }

  async changesSince(cursor: number): Promise<Changes> {
    throw new Error("not implemented");
  }

  close(): Promise<void> {
    return this.#project.close();
  }
}
