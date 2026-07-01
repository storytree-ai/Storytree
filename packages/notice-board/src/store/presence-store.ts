import type { PresenceDeclarationDoc } from "../presence.js";
import { mergeDeclaration } from "../presence.js";

/**
 * ADR-0033: the Postgres-backed presence store. History lives in
 * `events.session_event` (append-only); current state is the `events.session`
 * projection. Every write is one atomic transaction: append event + upsert
 * projection, `ROLLBACK` on any error.
 *
 * No signing chain (ADR-0033 Decision 1 — presence is not proof). Connection
 * comes from the library story's `event-sourced-store-seam` (`createPool`,
 * keyless IAM) — consumed here, never created.
 *
 * The structural seams below are duck-typed so the offline test can pass a
 * `FakePool` without importing `pg` types.
 */

// ── Structural seams ────────────────────────────────────────────────────────

export interface PresenceClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PresencePoolClient extends PresenceClient {
  release(): void;
}

export interface PresencePool extends PresenceClient {
  connect(): Promise<PresencePoolClient>;
}

// ── Domain types ────────────────────────────────────────────────────────────

/** A single event row from `events.session_event`. */
export interface PresenceEvent {
  type: string;
  doc: unknown;
  actor: string;
  at: string;
}

// ── Internal row shapes ─────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  doc: unknown;
}

interface SessionEventRow {
  type: string;
  doc: unknown;
  actor: string;
  at: string;
}

// ── Store ────────────────────────────────────────────────────────────────────

export class PgPresenceStore {
  readonly #pool: PresencePool;

  constructor(pool: PresencePool) {
    this.#pool = pool;
  }

  /**
   * Persist a presence declaration atomically: appends a `declared` event to
   * `events.session_event` and upserts `events.session`. When an existing row
   * is found for the same `sessionId`, the doc is merged via `mergeDeclaration`
   * (anchors `sessionId`/`startedAt` from the existing row).
   *
   * `opts.reactivate: false` marks an AMBIENT declare (the statusline
   * heartbeat/self-heal): when the stored row is already `status: "done"`
   * (merge-retired, reaped) the call is a no-op — no event, no upsert, the
   * retired doc returned unchanged — so background automation can never flip a
   * retired session back to active. The default (`true`) is the explicit path
   * (`noticeboard declare`, a build's `withPresence`), which deliberately can.
   * The guard reads the row inside the same transaction, so a retire landing
   * just before the heartbeat's write is still respected.
   *
   * Returns the persisted (possibly merged) doc.
   */
  async declare(
    doc: PresenceDeclarationDoc,
    opts?: { reactivate?: boolean },
  ): Promise<PresenceDeclarationDoc> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const selectRes = await client.query(
        "SELECT id, doc FROM events.session WHERE id = $1",
        [doc.sessionId],
      );
      const existingRow = (selectRes.rows as SessionRow[])[0];
      let persisted: PresenceDeclarationDoc;
      if (existingRow !== undefined) {
        const existing = existingRow.doc as PresenceDeclarationDoc;
        if (opts?.reactivate === false && existing.status === "done") {
          await client.query("ROLLBACK");
          return existing;
        }
        const { sessionId: _id, startedAt: _sa, ...patch } = doc;
        persisted = mergeDeclaration(existing, patch);
      } else {
        persisted = doc;
      }
      const docJson = JSON.stringify(persisted);
      await client.query(
        "INSERT INTO events.session_event (id, type, doc, actor) VALUES ($1, 'declared', $2::jsonb, $3)",
        [persisted.sessionId, docJson, persisted.sessionId],
      );
      await client.query(
        `INSERT INTO events.session (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [persisted.sessionId, docJson],
      );
      await client.query("COMMIT");
      return persisted;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mark a session done: appends a `done` event and flips the projection's
   * `status` to `"done"` and `lastSeenAt` to the provided value. Returns the
   * updated doc, or `null` when no projection row exists for `sessionId`.
   */
  async done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const selectRes = await client.query(
        "SELECT id, doc FROM events.session WHERE id = $1",
        [sessionId],
      );
      const existingRow = (selectRes.rows as SessionRow[])[0];
      if (existingRow === undefined) {
        await client.query("ROLLBACK");
        return null;
      }
      const persisted: PresenceDeclarationDoc = {
        ...(existingRow.doc as PresenceDeclarationDoc),
        status: "done",
        lastSeenAt,
      };
      const docJson = JSON.stringify(persisted);
      await client.query(
        "INSERT INTO events.session_event (id, type, doc, actor) VALUES ($1, 'done', $2::jsonb, $3)",
        [sessionId, docJson, sessionId],
      );
      await client.query(
        `INSERT INTO events.session (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [sessionId, docJson],
      );
      await client.query("COMMIT");
      return persisted;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Return all projection rows whose `doc.status === "active"`, ordered by id.
   * Filtering is done in JS on the stored doc.
   */
  async listActive(): Promise<PresenceDeclarationDoc[]> {
    const res = await this.#pool.query(
      "SELECT id, doc FROM events.session ORDER BY id",
    );
    return (res.rows as SessionRow[])
      .map((row) => row.doc as PresenceDeclarationDoc)
      .filter((d) => d.status === "active");
  }

  /**
   * Return all `events.session_event` rows for `sessionId` in ascending `seq`
   * (insertion) order.
   */
  async history(sessionId: string): Promise<PresenceEvent[]> {
    const res = await this.#pool.query(
      "SELECT type, doc, actor, at FROM events.session_event WHERE id = $1 ORDER BY seq",
      [sessionId],
    );
    return (res.rows as SessionEventRow[]).map((row) => ({
      type: row.type,
      doc: row.doc,
      actor: row.actor,
      at: row.at,
    }));
  }
}
