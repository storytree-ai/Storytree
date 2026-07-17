import type { UserDoc } from "../users.js";
import {
  User,
  mergeUser,
  normalizeEmail,
  wouldOrphanAdminsOnRemove,
  wouldOrphanAdminsOnRole,
} from "../users.js";

/**
 * ADR-0043 `user-directory`: the Postgres-backed app-owned user (member) store. History
 * lives in `events.user_event` (append-only); current state is the `events."user"`
 * projection, one row per lowercased email. Every write is one atomic transaction:
 * append event + upsert/delete projection, `ROLLBACK` on any error — the
 * `PgPresenceStore` pattern (ADR-0033), siblings to comments/sessions.
 *
 * Two boundaries are enforced HERE (not just in the HTTP layer):
 *  - **validation** — the doc is re-parsed through the studio-members `User` schema
 *    on every write, so a blank email / unknown role / unknown status is refused at
 *    the write boundary (`role-status-validated`).
 *  - **no lockout** — the last-admin guard (`last-admin-protected`): a remove or a
 *    downgrade that would leave the directory with zero admins throws
 *    {@link LastAdminError} and the transaction never commits. The guard reads the whole
 *    projection, decides in memory, then writes, so every mutation first takes a shared,
 *    xact-scoped advisory lock ({@link USER_DIRECTORY_LOCK_KEY}) — otherwise two concurrent
 *    transactions downgrading/removing DIFFERENT admin rows could each pass the guard and
 *    both commit, orphaning the directory (a TOCTOU race `FOR UPDATE` can't cover).
 *
 * `"user"` is a reserved SQL word, so the projection table is always double-quoted.
 * The structural seams below are duck-typed so the offline test can pass a `FakePool`
 * without importing `pg` types.
 */

// ── Structural seams ────────────────────────────────────────────────────────

export interface UserClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface UserPoolClient extends UserClient {
  release(): void;
}

export interface UserPool extends UserClient {
  connect(): Promise<UserPoolClient>;
}

// ── Domain types ────────────────────────────────────────────────────────────

/** A single event row from `events.user_event`. */
export interface UserEvent {
  type: string;
  doc: unknown;
  actor: string;
  at: string;
}

/**
 * Thrown by `upsert`/`remove` when the write would leave the directory with zero
 * admins (ADR-0043 Decision 4 — no lockout). Carries its own name so the HTTP layer
 * can map it to a 4xx instead of a generic 500.
 */
export class LastAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastAdminError";
  }
}

// ── Internal row shapes ─────────────────────────────────────────────────────

interface UserProjectionRow {
  id: string;
  doc: unknown;
}

interface UserEventRow {
  type: string;
  doc: unknown;
  actor: string;
  at: string;
}

// ── Concurrency: the admin-set mutex ─────────────────────────────────────────

/**
 * Fixed key for the transaction-scoped advisory lock that serialises EVERY user-directory
 * mutation (ADR-0043 Decision 4 — no lockout).
 *
 * The last-admin guard reads the whole projection, decides in memory, then writes. Under
 * Postgres' default READ COMMITTED isolation a plain `SELECT` does not stop two concurrent
 * transactions that downgrade/remove DIFFERENT admin rows from EACH reading `adminCount > 1`,
 * each passing {@link wouldOrphanAdminsOnRole}/{@link wouldOrphanAdminsOnRemove}, and — because
 * they touch different projection rows, so no row-lock ever conflicts — BOTH committing. That
 * leaves the directory with zero admins, and recovery is not automatic (a present member row
 * wins over the `STORYTREE_STUDIO_ADMINS` seed), so the whole studio is locked out of user
 * management: exactly the availability failure the guard exists to prevent.
 *
 * Row-level `FOR UPDATE` cannot serialise the two writers because they lock different rows. A
 * single shared `pg_advisory_xact_lock` taken at the top of every `upsert`/`remove` does: the
 * two transactions contend on the SAME key, so the loser blocks until the winner commits, then
 * runs its guard against the winner's now-reduced admin set and refuses. The lock is
 * xact-scoped — it auto-releases at COMMIT/ROLLBACK — and, because every mutation takes the same
 * single key first, the writers form a total order and cannot deadlock.
 *
 * The value is arbitrary but must stay stable and unique among this store's advisory keys.
 */
const USER_DIRECTORY_LOCK_KEY = 430043;

// ── Store ────────────────────────────────────────────────────────────────────

export class PgUserStore {
  readonly #pool: UserPool;

  constructor(pool: UserPool) {
    this.#pool = pool;
  }

  /**
   * Persist a user doc atomically: validate it, merge over any existing row (anchoring
   * `email`/`createdAt`), enforce the last-admin guard, append a `created`/`updated`
   * event, and upsert `events."user"`. The same path serves invite (fresh `invited`
   * row), re-role, and activation (`invited` → `active` + `lastSeenAt` bump) — the
   * caller builds the target doc.
   *
   * Throws {@link LastAdminError} if the merge would downgrade the only admin to member.
   * Returns the persisted (possibly merged) doc.
   */
  async upsert(doc: UserDoc, actor: string): Promise<UserDoc> {
    // role-status-validated: re-parse at the write boundary (blank email / unknown
    // role / unknown status is a refusal here, not only in the HTTP handler).
    const validated = User.parse(doc);
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      // no-lockout (ADR-0043): serialise the read-guard-write below against any concurrent
      // admin-set mutation, so two downgrades/removals can't both pass the last-admin guard
      // and both commit (see USER_DIRECTORY_LOCK_KEY).
      await client.query("SELECT pg_advisory_xact_lock($1)", [USER_DIRECTORY_LOCK_KEY]);
      const allRes = await client.query('SELECT id, doc FROM events."user" ORDER BY id');
      const allRows = (allRes.rows as UserProjectionRow[]).map((r) => r.doc as UserDoc);
      const existing = allRows.find((u) => u.email === validated.email);

      let persisted: UserDoc;
      if (existing !== undefined) {
        const { email: _e, createdAt: _c, ...patch } = validated;
        persisted = mergeUser(existing, patch);
        // last-admin guard: a downgrade of the sole admin is refused (the catch ROLLBACKs).
        if (wouldOrphanAdminsOnRole(allRows, validated.email, persisted.role)) {
          throw new LastAdminError(
            `refusing to downgrade ${validated.email}: the directory must keep at least one admin`,
          );
        }
      } else {
        persisted = validated;
      }

      const docJson = JSON.stringify(persisted);
      await client.query(
        'INSERT INTO events.user_event (id, type, doc, actor) VALUES ($1, $2, $3::jsonb, $4)',
        [persisted.email, existing !== undefined ? "updated" : "created", docJson, actor],
      );
      await client.query(
        `INSERT INTO events."user" (id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [persisted.email, docJson],
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
   * Remove a user: enforce the last-admin guard, append a `removed` event (history is
   * retained — comment authorship stays attributed), then delete the projection row so
   * the email drops to the request-access wall on its next request.
   *
   * Returns `true` when a row was removed, `false` when no projection row existed.
   * Throws {@link LastAdminError} when removing the sole admin.
   */
  async remove(email: string, actor: string): Promise<boolean> {
    const target = normalizeEmail(email);
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      // no-lockout (ADR-0043): same admin-set mutex as upsert — serialise this remove against a
      // concurrent downgrade/removal so the last-admin guard can't be raced (USER_DIRECTORY_LOCK_KEY).
      await client.query("SELECT pg_advisory_xact_lock($1)", [USER_DIRECTORY_LOCK_KEY]);
      const allRes = await client.query('SELECT id, doc FROM events."user" ORDER BY id');
      const allRows = (allRes.rows as UserProjectionRow[]).map((r) => r.doc as UserDoc);
      const existing = allRows.find((u) => u.email === target);
      if (existing === undefined) {
        await client.query("ROLLBACK");
        return false;
      }
      if (wouldOrphanAdminsOnRemove(allRows, target)) {
        throw new LastAdminError(
          `refusing to remove ${target}: the directory must keep at least one admin`,
        );
      }
      await client.query(
        "INSERT INTO events.user_event (id, type, doc, actor) VALUES ($1, 'removed', $2::jsonb, $3)",
        [target, JSON.stringify(existing), actor],
      );
      await client.query('DELETE FROM events."user" WHERE id = $1', [target]);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** All projection rows (the directory), ordered by email. */
  async list(): Promise<UserDoc[]> {
    const res = await this.#pool.query('SELECT id, doc FROM events."user" ORDER BY id');
    return (res.rows as UserProjectionRow[]).map((row) => row.doc as UserDoc);
  }

  /** The projection row for one email, or `null` when not in the directory. */
  async get(email: string): Promise<UserDoc | null> {
    const target = normalizeEmail(email);
    const res = await this.#pool.query('SELECT id, doc FROM events."user" WHERE id = $1', [target]);
    const row = (res.rows as UserProjectionRow[])[0];
    return row !== undefined ? (row.doc as UserDoc) : null;
  }

  /** All `events.user_event` rows for one email in ascending `seq` (insertion) order. */
  async history(email: string): Promise<UserEvent[]> {
    const target = normalizeEmail(email);
    const res = await this.#pool.query(
      "SELECT type, doc, actor, at FROM events.user_event WHERE id = $1 ORDER BY seq",
      [target],
    );
    return (res.rows as UserEventRow[]).map((row) => ({
      type: row.type,
      doc: row.doc,
      actor: row.actor,
      at: row.at,
    }));
  }
}
