import type { Pool, PoolClient } from "pg";
import type { DeleteDocOpts, Store, StoredDoc, StoreEvent } from "@storytree/core";
import { retiredEventDoc } from "@storytree/core";
import { upcastAndValidate } from "@storytree/library";

/**
 * The Postgres-backed {@link Store} (ADR-0017): history = `events.library_event`, current-state =
 * the `events.library_artifact` projection. `upsertDoc` does BOTH atomically in one transaction
 * (append event + upsert projection). Relationships live as ID refs inside docs, never as FKs.
 *
 * The doc body is forward-migrated AND validated at the write boundary with
 * {@link upcastAndValidate} (migrate-on-write, design §3) before anything is persisted: an
 * old-shape doc is upcast-and-stamped rather than rejected, and the UPCAST OUTPUT is what gets
 * persisted (so a v0 legacy row auto-forwards to the current version on its next write). Reads come
 * from the projection; history comes from the event log.
 *
 * This class only RUNS behind the live-DB gate; it is constructed from a live `pg` Pool.
 */

const DEFAULT_ACTOR = "system";

/** Row shape of the `events.library_artifact` projection. */
interface ArtifactRow {
  id: string;
  kind: string;
  doc: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Row shape of the `events.library_event` history log. */
interface EventRow {
  seq: string | number;
  id: string;
  kind: string;
  type: "created" | "updated" | "deleted";
  doc: unknown;
  actor: string;
  at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStoredDoc(row: ArtifactRow): StoredDoc {
  return {
    id: row.id,
    kind: row.kind,
    doc: row.doc,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toStoreEvent(row: EventRow): StoreEvent {
  return {
    seq: typeof row.seq === "string" ? Number(row.seq) : row.seq,
    id: row.id,
    kind: row.kind,
    type: row.type,
    doc: row.doc,
    actor: row.actor,
    at: toIso(row.at),
  };
}

export class PgLibraryStore implements Store {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDoc> {
    // Loud write boundary: forward-migrate an old-shape doc to the current schema version, then
    // validate, before opening the transaction. PERSIST THE UPCAST OUTPUT (not the original input)
    // so a legacy v0 row auto-forwards on its next write (design §3).
    const doc = upcastAndValidate(input.doc);
    const actor = input.actor ?? DEFAULT_ACTOR;
    const docJson = JSON.stringify(doc);

    const client: PoolClient = await this.#pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM events.library_artifact WHERE id = $1) AS exists",
        [input.id],
      );
      const type = existing.rows[0]?.exists ? "updated" : "created";

      await client.query(
        `INSERT INTO events.library_event (id, kind, type, doc, actor)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [input.id, input.kind, type, docJson, actor],
      );

      const projected = await client.query<ArtifactRow>(
        `INSERT INTO events.library_artifact (id, kind, doc)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE
           SET kind = EXCLUDED.kind,
               doc = EXCLUDED.doc,
               updated_at = now()
         RETURNING id, kind, doc, created_at, updated_at`,
        [input.id, input.kind, docJson],
      );

      await client.query("COMMIT");

      const row = projected.rows[0];
      if (!row) throw new Error("upsertDoc: projection row missing after upsert");
      return toStoredDoc(row);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getDoc(id: string): Promise<StoredDoc | null> {
    const res = await this.#pool.query<ArtifactRow>(
      `SELECT id, kind, doc, created_at, updated_at
       FROM events.library_artifact WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? toStoredDoc(row) : null;
  }

  async queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]> {
    const res =
      filter?.kind === undefined
        ? await this.#pool.query<ArtifactRow>(
            `SELECT id, kind, doc, created_at, updated_at
             FROM events.library_artifact ORDER BY created_at, id`,
          )
        : await this.#pool.query<ArtifactRow>(
            `SELECT id, kind, doc, created_at, updated_at
             FROM events.library_artifact WHERE kind = $1 ORDER BY created_at, id`,
            [filter.kind],
          );
    return res.rows.map(toStoredDoc);
  }

  /**
   * The highest per-row `schemaVersion` pin across the library projection (0 when no row carries
   * one — body-bearing assets never do). The studio /api/health skew probe compares this against
   * the code's CURRENT_SCHEMA_VERSION: db > code means the running server is OLDER than the data
   * (a stale detached studio server) and renders degrade rather than parse.
   */
  async maxSchemaVersion(): Promise<number> {
    const res = await this.#pool.query<{ max: number | string | null }>(
      `SELECT MAX((doc->>'schemaVersion')::int) AS max FROM events.library_artifact`,
    );
    return Number(res.rows[0]?.max ?? 0);
  }

  async deleteDoc(id: string, opts?: DeleteDocOpts): Promise<boolean> {
    const client: PoolClient = await this.#pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query<ArtifactRow>(
        `SELECT id, kind, doc, created_at, updated_at
         FROM events.library_artifact WHERE id = $1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }

      // Retire-with-rationale (ADR-0065): when a reason is given, the terminal `deleted` event
      // records the retiring actor and folds `retiredReason` / `supersededBy` into its doc, so the
      // append-only history carries WHY. The projection row is dropped either way.
      await client.query(
        `INSERT INTO events.library_event (id, kind, type, doc, actor)
         VALUES ($1, $2, 'deleted', $3::jsonb, $4)`,
        [row.id, row.kind, JSON.stringify(retiredEventDoc(row.doc, opts)), opts?.actor ?? DEFAULT_ACTOR],
      );
      await client.query("DELETE FROM events.library_artifact WHERE id = $1", [id]);

      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent> {
    const res = await this.#pool.query<EventRow>(
      `INSERT INTO events.library_event (id, kind, type, doc, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING seq, id, kind, type, doc, actor, at`,
      [e.id, e.kind, e.type, JSON.stringify(e.doc), e.actor ?? DEFAULT_ACTOR],
    );
    const row = res.rows[0];
    if (!row) throw new Error("appendEvent: no row returned");
    return toStoreEvent(row);
  }

  async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    const res =
      filter?.id === undefined
        ? await this.#pool.query<EventRow>(
            `SELECT seq, id, kind, type, doc, actor, at
             FROM events.library_event ORDER BY seq`,
          )
        : await this.#pool.query<EventRow>(
            `SELECT seq, id, kind, type, doc, actor, at
             FROM events.library_event WHERE id = $1 ORDER BY seq`,
            [filter.id],
          );
    return res.rows.map(toStoreEvent);
  }
}
