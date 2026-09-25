/**
 * SchemaRecords: capability 3's typed layer over any Transactions (capability 2), so it runs
 * unchanged on the in-memory twin and on Postgres.
 */
import type { HistoryEntry, HistoryFilter, RecordEnvelope, Transactions } from "../transactions/types.js";
import type { FieldsOf, RecordType } from "./types.js";

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

  async create<T extends RecordType>(type: T, fields: FieldsOf<T>, options: CreateOptions = {}): Promise<SchemaRecord<T>> {
    throw new Error("not implemented");
  }

  async get(id: string): Promise<SchemaRecord | null> {
    throw new Error("not implemented");
  }

  async list<T extends RecordType>(type: T): Promise<SchemaRecord<T>[]> {
    throw new Error("not implemented");
  }

  async edit(id: string, fields: FieldEdit, options: WriteOptions = {}): Promise<SchemaRecord | null> {
    throw new Error("not implemented");
  }

  async retire(id: string, reason: string, options: WriteOptions = {}): Promise<void> {
    throw new Error("not implemented");
  }

  async history(filter?: HistoryFilter): Promise<HistoryEntry[]> {
    throw new Error("not implemented");
  }
}
