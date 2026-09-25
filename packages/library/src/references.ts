/**
 * References between records (capabilities 4 and 6): a capability names its story, a contract its
 * capability, an arc the stories it grows, a capability the capabilities it depends on, and a note
 * the records it links to. A write whose references are broken is refused, and writes nothing.
 */

/**
 * A reference that names no record it may name: the record is missing, retired, or of the wrong
 * type. The message names the field and the id:
 * `field "story" names "story_0123456789ab": there is no story with that id (it is missing or retired)`.
 */
export class MissingReferenceError extends Error {
  /** The field holding the reference: `story`, `capability`, `stories`, `dependsOn` or `links`. */
  readonly field: string;
  /** The id that names no suitable record. */
  readonly id: string;
  /** What the reference must name: a record type, or `record` when any type will do. */
  readonly expected: string;
  /** The type of the record the id does name, when that record is of the wrong type. */
  readonly found: string | undefined;

  constructor(field: string, id: string, expected: string, found?: string) {
    const named = `field ${JSON.stringify(field)} names ${JSON.stringify(id)}`;
    super(
      found === undefined
        ? `${named}: there is no ${expected} with that id (it is missing or retired)`
        : `${named}: that is ${article(found)} ${found} record, not ${article(expected)} ${expected}`,
    );
    this.name = "MissingReferenceError";
    this.field = field;
    this.id = id;
    this.expected = expected;
    this.found = found;
  }
}

/**
 * A write would make a capability depend on itself, directly or through others. The message names
 * the loop, from the capability being written back round to itself: `A → B → A`.
 */
export class DependencyLoopError extends Error {
  /** The capability ids around the loop, starting and ending with the capability being written. */
  readonly path: readonly string[];

  constructor(path: readonly string[]) {
    super(
      `dependency loop between capabilities: ${path.join(" → ")} ` +
        "(a capability may not depend on itself, directly or through others)",
    );
    this.name = "DependencyLoopError";
    this.path = [...path];
  }
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
