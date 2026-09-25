/**
 * PgTransactions: a project's records in its own Postgres database (capability 1), in the tables
 * `record` (the current records) and `record_event` (the append-only history).
 */
import type { Pool } from "pg";

import type {
  EditInput,
  HistoryEntry,
  HistoryFilter,
  RecordEnvelope,
  RetireInput,
  SaveInput,
  Transactions,
} from "./types.js";

export class PgTransactions implements Transactions {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async save(_input: SaveInput): Promise<RecordEnvelope> {
    throw new Error("not implemented");
  }

  async get(_id: string): Promise<RecordEnvelope | null> {
    throw new Error("not implemented");
  }

  async list(_type: string): Promise<RecordEnvelope[]> {
    throw new Error("not implemented");
  }

  async edit(_input: EditInput): Promise<RecordEnvelope | null> {
    throw new Error("not implemented");
  }

  async retire(_input: RetireInput): Promise<void> {
    throw new Error("not implemented");
  }

  async history(_filter?: HistoryFilter): Promise<HistoryEntry[]> {
    throw new Error("not implemented");
  }
}
