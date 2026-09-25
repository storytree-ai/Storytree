/**
 * MemoryTransactions: the in-memory twin of PgTransactions. The behaviour suite runs unchanged on
 * both, so later stories can test against this one without a database.
 */
import type {
  EditInput,
  HistoryEntry,
  HistoryFilter,
  RecordEnvelope,
  RetireInput,
  SaveInput,
  Transactions,
} from "./types.js";

export class MemoryTransactions implements Transactions {
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
