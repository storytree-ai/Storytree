/**
 * Capability 6 · Knowledge and memory (stories/library.md): alongside the plan, the library keeps
 * what the project has learned: memory notes, decisions and definitions of terms, together
 * "notes". A note links to the other notes it relates to, and is found again by searching its
 * words.
 *
 * Capability 9 · Knowledge entrances: every story and capability has its own shelf of front-cover
 * decisions, and a decision can be a front cover of one of them at most. Notes link only to other
 * notes, so the only way from the work into the knowledge is through a front cover. A decision
 * names the node it is a cover of in its one `frontCoverOf` field, so no decision can be the cover
 * of two, and nothing has to check for it.
 *
 * Knowledge is a layer over capability 3's SchemaRecords, so it runs unchanged on the in-memory
 * twin and on Postgres. Every link, and every front cover, is checked BEFORE the write, and a
 * broken one throws with nothing written; the note itself is then checked against its type inside
 * the write, as capability 3 checks every write.
 */
import { byCreation } from "../creation-order.js";
import { checkReference, checkReferences, liveRecord, type Expected } from "../references.js";
import type { SchemaRecord, SchemaRecords } from "../schema/index.js";
import type { FieldsOf } from "../schema/types.js";

/** The three kinds of note. */
export type NoteType = "memory" | "decision" | "definition";
/** A stored note of any kind. */
export type Note = SchemaRecord<NoteType>;
/** A new memory note's fields. Every link must name a live note. */
export type NewMemory = FieldsOf<"memory">;
/** A new decision's fields. Every link must name a live note, and `frontCoverOf` a live story or capability. */
export type NewDecision = FieldsOf<"decision">;
/** A new definition's fields. Every link must name a live note. */
export type NewDefinition = FieldsOf<"definition">;
/** An edit of a note: some of its kind's fields. A field set to undefined is removed. */
export type NoteEdit = {
  [K in NoteType]: { [F in keyof FieldsOf<K>]?: FieldsOf<K>[F] | undefined };
}[NoteType];

const NOTE_TYPES: readonly NoteType[] = ["memory", "decision", "definition"];

/** What a note may link to: another note, never the work (capability 9). */
const NOTE: Expected = {
  name: "note",
  types: NOTE_TYPES,
  why: "notes link only to other notes: a story or capability is reached through its front covers, the decisions whose frontCoverOf names it",
};

/** What a decision may be the front cover of (capability 9). */
const COVERABLE: Expected = { name: "story or capability", types: ["story", "capability"] };

export class Knowledge {
  readonly #records: SchemaRecords;

  constructor(records: SchemaRecords) {
    this.#records = records;
  }

  /**
   * Write a memory note. Every link must name a live note: otherwise a MissingReferenceError names
   * the first that does not, and nothing is written.
   */
  async writeMemory(memory: NewMemory): Promise<SchemaRecord<"memory">> {
    await this.#checkLinks(memory.links);
    return this.#records.create("memory", memory);
  }

  /**
   * Record a decision. Its links are checked as writeMemory checks them, and its `frontCoverOf`,
   * if it has one, must name a live story or capability.
   */
  async recordDecision(decision: NewDecision): Promise<SchemaRecord<"decision">> {
    await this.#checkLinks(decision.links);
    await this.#checkFrontCover(decision.frontCoverOf);
    return this.#records.create("decision", decision);
  }

  /** Define a term. Its links are checked as writeMemory checks them. */
  async defineTerm(definition: NewDefinition): Promise<SchemaRecord<"definition">> {
    await this.#checkLinks(definition.links);
    return this.#records.create("definition", definition);
  }

  /**
   * Change only the named fields of a note, as capability 3's edit does; new links, and a new
   * front cover, are checked as they are when the note is written. Setting `frontCoverOf` to
   * undefined takes a decision off its node's shelf. The note's earlier wording stays in its
   * history. Returns null, and writes nothing, if `id` is not a live note.
   */
  async editNote(id: string, fields: NoteEdit): Promise<Note | null> {
    if ((await liveRecord(this.#records, id, NOTE_TYPES)) === null) return null;
    await this.#checkLinks(fields.links);
    if ("frontCoverOf" in fields) await this.#checkFrontCover(fields.frontCoverOf);
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

  /**
   * Every live definition, in creation order: what a reader that looks terms up by name (the agent
   * link's prompt-time lookup, ADR-0636 D1) matches against.
   */
  async definitions(): Promise<SchemaRecord<"definition">[]> {
    return (await this.#records.list("definition")).sort(byCreation);
  }

  /**
   * The live notes whose links include `noteId`, in creation order. Notes link only to notes, so a
   * story or capability has none: its knowledge is reached through frontCovers.
   */
  async relatedNotes(noteId: string): Promise<Note[]> {
    return (await this.#notes()).filter((note) => note.fields.links?.includes(noteId) === true);
  }

  /**
   * A story's or capability's shelf (capability 9): the live decisions whose `frontCoverOf` is
   * `nodeId`, founding (oldest) first. Empty for any other id.
   */
  async frontCovers(nodeId: string): Promise<SchemaRecord<"decision">[]> {
    const decisions = await this.#records.list("decision");
    return decisions.filter((decision) => decision.fields.frontCoverOf === nodeId).sort(byCreation);
  }

  /** Every live note, of all three kinds, in creation order. */
  async #notes(): Promise<Note[]> {
    const lists = await Promise.all(NOTE_TYPES.map((type) => this.#records.list(type)));
    return lists.flat().sort(byCreation);
  }

  /** A note may link to a live note, and to nothing else. */
  #checkLinks(links: unknown): Promise<void> {
    return checkReferences(this.#records, "links", links, NOTE);
  }

  /** A decision may be the front cover of a live story or capability, and of nothing else. */
  #checkFrontCover(frontCoverOf: unknown): Promise<void> {
    return checkReference(this.#records, "frontCoverOf", frontCoverOf, COVERABLE);
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
