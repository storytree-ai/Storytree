/**
 * Capability 6 · Knowledge and memory (stories/library.md): alongside the plan, the library keeps
 * what the project has learned: memory notes, decisions and definitions of terms, together
 * "notes". A note can link to the records it relates to (a story, another note, any record at
 * all), and is found again by searching its words.
 */
import type { SchemaRecord, SchemaRecords } from "../schema/index.js";
import type { FieldsOf } from "../schema/types.js";

/** The three kinds of note. */
export type NoteType = "memory" | "decision" | "definition";
/** A stored note of any kind. */
export type Note = SchemaRecord<NoteType>;
/** A new memory note's fields. Every link must name an existing record. */
export type NewMemory = FieldsOf<"memory">;
/** A new decision's fields. Every link must name an existing record. */
export type NewDecision = FieldsOf<"decision">;
/** A new definition's fields. Every link must name an existing record. */
export type NewDefinition = FieldsOf<"definition">;
/** An edit of a note: some of its kind's fields. A field set to undefined is removed. */
export type NoteEdit = {
  [K in NoteType]: { [F in keyof FieldsOf<K>]?: FieldsOf<K>[F] | undefined };
}[NoteType];

export class Knowledge {
  readonly #records: SchemaRecords;

  constructor(records: SchemaRecords) {
    this.#records = records;
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
}
