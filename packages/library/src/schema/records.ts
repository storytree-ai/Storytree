/**
 * SchemaRecords: capability 3's typed layer over any Transactions (capability 2), so it runs
 * unchanged on the in-memory twin and on Postgres.
 *
 * - Every write is checked INSIDE the write, as the transactions' validate hook, on the record the
 *   write would leave (for an edit, the merged fields). A refused write writes nothing.
 * - A record this code cannot interpret is refused, never guessed at: one whose type it does not
 *   know, or whose schema version is newer than it knows for that type.
 * - What comes back is capability 2's envelope, unchanged.
 */
import { randomUUID } from "node:crypto";

import type { z } from "zod";

import type { HistoryEntry, HistoryFilter, RecordEnvelope, Transactions } from "../transactions/types.js";
import { NewerSchemaError, SchemaError, UnknownTypeError, type FieldProblem } from "./errors.js";
import { RECORD_SCHEMAS, SCHEMA_VERSIONS, type FieldsOf, type RecordType } from "./types.js";

/** A stored record of type `T`: capability 2's envelope, unchanged, with its type and fields typed. */
export type SchemaRecord<T extends RecordType = RecordType> = {
  [K in T]: Omit<RecordEnvelope, "type" | "fields"> & { type: K; fields: FieldsOf<K> };
}[T];

/** An edit: some of one type's fields. A field set to undefined is removed. */
export type FieldEdit = {
  [K in RecordType]: { [F in keyof FieldsOf<K>]?: FieldsOf<K>[F] | undefined };
}[RecordType];

export interface CreateOptions {
  /** The new record's id. When omitted, one is generated: `<type>_<12 lowercase hex digits>`. */
  readonly id?: string;
  /** Who is writing, kept in the history. */
  readonly actor?: string;
}

export interface WriteOptions {
  /** Who is writing, kept in the history. */
  readonly actor?: string;
}

export class SchemaRecords {
  readonly #transactions: Transactions;

  constructor(transactions: Transactions) {
    this.#transactions = transactions;
  }

  /**
   * Save a new record of `type`, stamped with the type's schema version, under `options.id` or a
   * generated id. (An existing record with that id is replaced whole, as capability 2's save does.)
   * An unknown type is refused (UnknownTypeError), and so are fields that do not fit the type
   * (SchemaError); either way nothing is written.
   */
  async create<T extends RecordType>(type: T, fields: FieldsOf<T>, options: CreateOptions = {}): Promise<SchemaRecord<T>> {
    if (!isRecordType(type)) throw new UnknownTypeError(type);
    const record = await this.#transactions.save({
      id: options.id ?? newId(type),
      type,
      fields,
      version: SCHEMA_VERSIONS[type],
      validate: checkRecord,
      ...actorOf(options),
    });
    return record as SchemaRecord<T>;
  }

  /** The record, or null if it is missing or retired. One this code cannot interpret is refused. */
  async get(id: string): Promise<SchemaRecord | null> {
    const record = await this.#transactions.get(id);
    return record === null ? null : interpretable(record);
  }

  /**
   * The current records of `type`, ordered by id. An unknown type is refused, and so is the whole
   * list if any record in it cannot be interpreted.
   */
  async list<T extends RecordType>(type: T): Promise<SchemaRecord<T>[]> {
    if (!isRecordType(type)) throw new UnknownTypeError(type);
    const records = await this.#transactions.list(type);
    return records.map((record) => interpretable(record) as SchemaRecord<T>);
  }

  /**
   * Change only the named fields, merged onto what is stored now (capability 2's edit). The merged
   * record is checked inside the write, so an edit that would leave it invalid, or that touches a
   * record this code cannot interpret, is refused and writes nothing. Null if the record is
   * missing or retired.
   */
  async edit(id: string, fields: FieldEdit, options: WriteOptions = {}): Promise<SchemaRecord | null> {
    const record = await this.#transactions.edit({ id, fields, validate: checkRecord, ...actorOf(options) });
    return record as SchemaRecord | null;
  }

  /** Retire the record, keeping the reason in its history: capability 2's retire, unchanged. */
  async retire(id: string, reason: string, options: WriteOptions = {}): Promise<void> {
    await this.#transactions.retire({ id, reason, ...actorOf(options) });
  }

  /** The history, oldest first: capability 2's history, unchanged. */
  async history(filter?: HistoryFilter): Promise<HistoryEntry[]> {
    return this.#transactions.history(filter);
  }
}

/** Whether `type` is a declared record type. Only the schema's own keys count, never inherited names. */
function isRecordType(type: string): type is RecordType {
  return Object.hasOwn(SCHEMA_VERSIONS, type);
}

/** A new id for a record of `type`: `<type>_` and 12 lowercase hex digits, all of them random. */
function newId(type: RecordType): string {
  return `${type}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** `{ actor }` when the writer named one, and nothing otherwise, as capability 2's inputs take it. */
function actorOf(options: WriteOptions): { actor?: string } {
  return options.actor === undefined ? {} : { actor: options.actor };
}

/**
 * The record, if this code can interpret it: its type is declared, and its schema version is no
 * newer than this code knows for that type. Anything else is refused rather than guessed at.
 */
function interpretable(record: RecordEnvelope): SchemaRecord {
  const { id, type, version } = record;
  if (!isRecordType(type)) throw new UnknownTypeError(type, id);
  const known = SCHEMA_VERSIONS[type];
  if (version > known) throw new NewerSchemaError(id, type, version, known);
  return record as SchemaRecord;
}

/**
 * The validate hook of every write. The record the write would leave, after any merge, must be one
 * this code can interpret, and its fields must fit its type. A throw aborts the write.
 */
function checkRecord(candidate: RecordEnvelope): void {
  const { type } = interpretable(candidate);
  const problems = [...shapeProblems(type, candidate.fields), ...unstorableText(candidate.fields)];
  if (problems.length > 0) throw new SchemaError(type, problems);
}

/** How the fields break their type's schema, each problem naming its field. */
function shapeProblems(type: RecordType, fields: unknown): FieldProblem[] {
  const result = RECORD_SCHEMAS[type].safeParse(fields);
  return result.success ? [] : result.error.issues.flatMap((issue) => describeIssue(issue, fields));
}

function describeIssue(issue: z.core.$ZodIssue, fields: unknown): FieldProblem[] {
  const [head, ...rest] = issue.path;
  if (head === undefined) {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({ field: key, problem: `unknown field ${quote(key)}` }));
    }
    return [{ field: undefined, problem: `the fields must be an object, not ${kindOf(fields)}` }];
  }
  const field = String(head);
  if (rest.length === 0 && !hasOwnField(fields, field)) {
    return [{ field, problem: `missing required field ${quote(field)}` }];
  }
  const where = [`field ${quote(field)}`, ...rest.map((key) => `item ${String(key)}`)].join(" ");
  switch (issue.code) {
    case "invalid_type":
      return [{ field, problem: `${where} must be ${kindName(issue.expected)}, not ${kindOf(valueAt(fields, issue.path))}` }];
    case "too_small":
      if (issue.origin === "string" && Number(issue.minimum) === 1) return [{ field, problem: `${where} must not be empty` }];
      break;
    case "invalid_value":
      return [{ field, problem: `${where} must be one of ${issue.values.map((value) => JSON.stringify(value)).join(", ")}` }];
  }
  return [{ field, problem: `${where} is not valid: ${issue.message}` }];
}

/**
 * Text Postgres cannot store, anywhere in the fields' values, lists included: a NUL character, or a
 * lone UTF-16 surrogate. The in-memory twin could store both, so refusing them here, before either
 * backend sees them, keeps the two alike.
 */
function unstorableText(fields: unknown): FieldProblem[] {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields)) return [];
  return Object.entries(fields).flatMap(([field, value]) =>
    textsIn(value, `field ${quote(field)}`).flatMap(([where, text]) => {
      const found = unstorable(text);
      return found === undefined ? [] : [{ field, problem: `${where} contains ${found}, which the library cannot store` }];
    }),
  );
}

/** Every string in `value` (itself, or anywhere inside its lists and objects), with where it sits. */
function textsIn(value: unknown, where: string): [where: string, text: string][] {
  if (typeof value === "string") return [[where, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => textsIn(item, `${where} item ${index}`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => textsIn(item, `${where} key ${quote(key)}`));
  }
  return [];
}

/** A high surrogate with no low one after it, or a low surrogate with no high one before it. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** What in `text` cannot be stored, or undefined if it all can. */
function unstorable(text: string): string | undefined {
  if (text.includes("\u0000")) return "a NUL character (U+0000)";
  const lone = LONE_SURROGATE.exec(text)?.[0];
  return lone === undefined ? undefined : `a lone UTF-16 surrogate (U+${lone.charCodeAt(0).toString(16).toUpperCase()})`;
}

function hasOwnField(fields: unknown, field: string): boolean {
  return typeof fields === "object" && fields !== null && Object.hasOwn(fields, field);
}

function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

/** What a zod `expected` kind is called in a message. */
function kindName(expected: string): string {
  if (expected === "array") return "a list";
  if (expected === "object") return "an object";
  return `a ${expected}`;
}

/** What kind of value `value` is, as a message says it. */
function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

function quote(name: string): string {
  return JSON.stringify(name);
}
