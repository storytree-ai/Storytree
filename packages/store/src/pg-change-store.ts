import type { ChangeEvent, ChangeStore } from "@storytree/core";

/** The slice of `pg.Pool` this store needs (structural, so offline tests can inject a fake). */
export interface ChangeStoreClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface ChangeEventRow {
  doc: unknown;
}

/**
 * The Postgres home for the ADR-0016 change log (the `ChangeStore` seam, @storytree/core). Append-only
 * over `events.change_event`: one row per change, the full ChangeEvent in `doc` JSONB (so a read
 * round-trips it unchanged), the scalar columns the queryable spine. Held to `changeStoreParitySuite`,
 * the same bar InMemoryStore meets.
 */
export class PgChangeStore implements ChangeStore {
  readonly #client: ChangeStoreClient;

  constructor(client: ChangeStoreClient) {
    this.#client = client;
  }

  async appendChangeEvent(change: ChangeEvent): Promise<void> {
    await this.#client.query(
      `INSERT INTO events.change_event (unit_id, hash_before, hash_after, description, author, commit_sha, doc)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        change.unitId,
        change.hashBefore,
        change.hashAfter,
        change.description ?? null,
        change.author,
        change.commitSha ?? null,
        JSON.stringify(change),
      ],
    );
  }

  async readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]> {
    const res =
      filter?.unitId === undefined
        ? await this.#client.query(`SELECT doc FROM events.change_event ORDER BY seq`)
        : await this.#client.query(
            `SELECT doc FROM events.change_event WHERE unit_id = $1 ORDER BY seq`,
            [filter.unitId],
          );
    return (res.rows as ChangeEventRow[]).map((r) => r.doc as ChangeEvent);
  }
}
