/**
 * Capability 6 · Knowledge and memory (stories/library.md): alongside the plan, the library keeps
 * what the project has learned: memory notes, decisions and definitions of terms, together
 * "notes". A note can link to the records it relates to (a story, another note, any record at
 * all), and is found again by searching its words.
 *
 * Knowledge is a layer over capability 3's SchemaRecords, so it runs unchanged on the in-memory
 * twin and on Postgres. Every link is checked BEFORE the write, and a broken one throws with
 * nothing written; the note itself is then checked against its type inside the write, as
 * capability 3 checks every write.
 */
import { byCreation } from "../creation-order.js";
import { checkReferences, liveRecord } from "../references.js";
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

const NOTE_TYPES: readonly NoteType[] = ["memory", "decision", "definition"];

export class Knowledge {
  readonly #records: SchemaRecords;

  constructor(records: SchemaRecords) {
    this.#records = records;
  }

  /**
   * Write a memory note. Every link must name a live record of any type: otherwise a
   * MissingReferenceError names the first that does not, and nothing is written.
   */
  async writeMemory(memory: NewMemory): Promise<SchemaRecord<"memory">> {
    await this.#checkLinks(memory.links);
    return this.#records.create("memory", memory);
  }

  /** Record a decision. Its links are checked as writeMemory checks them. */
  async recordDecision(decision: NewDecision): Promise<SchemaRecord<"decision">> {
    await this.#checkLinks(decision.links);
    return this.#records.create("decision", decision);
  }

  /** Define a term. Its links are checked as writeMemory checks them. */
  async defineTerm(definition: NewDefinition): Promise<SchemaRecord<"definition">> {
    await this.#checkLinks(definition.links);
    return this.#records.create("definition", definition);
  }

  /**
   * Change only the named fields of a note, as capability 3's edit does; new links are checked as
   * writeMemory checks them. The note's earlier wording stays in its history. Returns null, and
   * writes nothing, if `id` is not a live note.
   */
  async editNote(id: string, fields: NoteEdit): Promise<Note | null> {
    if ((await liveRecord(this.#records, id, NOTE_TYPES)) === null) return null;
    await this.#checkLinks(fields.links);
    return (await this.#records.edit(id, fields)) as Note | null;
  }

  /**
   * The live notes in which every whitespace-separated word of `query` appears, ignoring case,
   * somewhere in their text: a memory note's text, a decision's title or text, a definition's
   * term or meaning. Links are ids, not words, and are not searched. A word is found wherever it
   * appears, part of a longer word included. A query with no words has none for a note to miss,
   * so it matches every note. In creation order.
   */
  async search(query: string): Promise<Note[]> {
    const words = query.toLowerCase().split(/\s+/).filter((word) => word !== "");
    return (await this.#notes()).filter((note) => {
      const texts = textsOf(note).map((text) => text.toLowerCase());
      return words.every((word) => texts.some((text) => text.includes(word)));
    });
  }

  /** The live notes whose links include `nodeId`, in creation order. */
  async relatedNotes(nodeId: string): Promise<Note[]> {
    return (await this.#notes()).filter((note) => note.fields.links?.includes(nodeId) === true);
  }

  /** Every live note, of all three kinds, in creation order. */
  async #notes(): Promise<Note[]> {
    const lists = await Promise.all(NOTE_TYPES.map((type) => this.#records.list(type)));
    return lists.flat().sort(byCreation);
  }

  /** A note may link to a live record of any type. */
  #checkLinks(links: unknown): Promise<void> {
    return checkReferences(this.#records, "links", links, "record");
  }
}

/** The text a note is searched by. */
function textsOf(note: Note): string[] {
  switch (note.type) {
    case "memory":
      return [note.fields.text];
    case "decision":
      return [note.fields.title, note.fields.text];
    case "definition":
      return [note.fields.term, note.fields.meaning];
  }
}
