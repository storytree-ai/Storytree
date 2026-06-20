import type { Pool, PoolClient } from "pg";

/**
 * The Postgres-backed comment store (ADR-0015 §6 / ADR-0017): history = `events.comment_event`
 * (append-only), current state = the `events.comment` projection. Each write appends a typed event
 * AND upserts the projection atomically in one transaction. The stored JSONB `doc` is the full
 * {@link Comment} (apps/studio/src/types.ts) verbatim — no schema split, the wire shape IS the doc.
 *
 * This is the pg backend for the studio `/api/comments` endpoints; it mirrors the JSON dev API's
 * behaviour so the React client is unchanged.
 *
 * It only RUNS behind the live-DB gate; it is constructed from a live `pg` Pool. The PURE helpers
 * (mergeCommentPatch) are unit-tested offline; the live SQL is verified by the human afterwards.
 */

const DEFAULT_ACTOR = "system";

/** Where on a topic a comment is attached (mirror of apps/studio CommentAnchor). */
export interface CommentAnchor {
  kind: "topic" | "section" | "text";
  headingSlug: string | null;
  headingText: string | null;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  startOffset: number | null;
  color: string | null;
}

/** A forum comment — the full JSONB doc stored verbatim (mirror of apps/studio Comment). */
export interface Comment {
  id: string;
  topicKind: "doc" | "asset";
  topicId: string;
  anchor: CommentAnchor;
  body: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

/** A partial update to a stored comment. `id` is fixed and never patched. */
export type CommentPatch = Partial<Omit<Comment, "id">>;

/** Filter for {@link PgCommentStore.list}: by topic id and/or topic kind. */
export interface CommentFilter {
  topicId?: string;
  topicKind?: "doc" | "asset";
}

/**
 * PURE: merge a patch into an existing comment doc. `id` is never overwritten (the path id wins).
 * Undefined patch fields are ignored (a real `null` — e.g. `resolvedAt: null` — IS applied).
 * Offline-tested; the live store calls this between read and upsert.
 */
export function mergeCommentPatch(existing: Comment, patch: CommentPatch): Comment {
  const merged = { ...existing } as Comment & Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "id") continue;
    merged[key] = value;
  }
  merged.id = existing.id;
  return merged;
}

/** Row shape of the `events.comment` projection. */
interface CommentRow {
  id: string;
  doc: unknown;
}

export class PgCommentStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /**
   * Read the comment projection, optionally filtered by topic. Filtering is done in JS on the stored
   * doc (the doc is the source of truth for topicId/topicKind), ordered by createdAt then id.
   */
  async list(filter?: CommentFilter): Promise<Comment[]> {
    const res = await this.#pool.query<CommentRow>(
      "SELECT id, doc FROM events.comment ORDER BY created_at, id",
    );
    let comments = res.rows.map((row) => row.doc as Comment);
    if (filter?.topicId !== undefined) {
      comments = comments.filter((c) => c.topicId === filter.topicId);
    }
    if (filter?.topicKind !== undefined) {
      comments = comments.filter((c) => c.topicKind === filter.topicKind);
    }
    return comments;
  }

  /** Append a `created` event + upsert the projection, atomically. Returns the stored comment. */
  async create(comment: Comment, actor: string = DEFAULT_ACTOR): Promise<Comment> {
    const docJson = JSON.stringify(comment);
    const client: PoolClient = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO events.comment_event (id, type, doc, actor) VALUES ($1, 'created', $2::jsonb, $3)",
        [comment.id, docJson, actor],
      );
      await client.query(
        `INSERT INTO events.comment (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [comment.id, docJson],
      );
      await client.query("COMMIT");
      return comment;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Merge `patch` into the stored comment, append an `updated` event, upsert the projection — all in
   * one transaction. Returns the merged comment, or `null` if the id does not exist.
   */
  async update(
    id: string,
    patch: CommentPatch,
    actor: string = DEFAULT_ACTOR,
  ): Promise<Comment | null> {
    const client: PoolClient = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<CommentRow>(
        "SELECT id, doc FROM events.comment WHERE id = $1",
        [id],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const merged = mergeCommentPatch(row.doc as Comment, patch);
      const docJson = JSON.stringify(merged);
      await client.query(
        "INSERT INTO events.comment_event (id, type, doc, actor) VALUES ($1, 'updated', $2::jsonb, $3)",
        [id, docJson, actor],
      );
      await client.query(
        `INSERT INTO events.comment (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [id, docJson],
      );
      await client.query("COMMIT");
      return merged;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Append a `deleted` event + DELETE the projection row, atomically. Returns whether a row existed.
   */
  async remove(id: string, actor: string = DEFAULT_ACTOR): Promise<boolean> {
    const client: PoolClient = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<CommentRow>(
        "SELECT id, doc FROM events.comment WHERE id = $1",
        [id],
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        "INSERT INTO events.comment_event (id, type, doc, actor) VALUES ($1, 'deleted', $2::jsonb, $3)",
        [id, JSON.stringify(row.doc), actor],
      );
      await client.query("DELETE FROM events.comment WHERE id = $1", [id]);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
