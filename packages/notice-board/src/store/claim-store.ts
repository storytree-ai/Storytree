import {
  ClaimDoc,
  isReclaimable,
  CLAIM_STALE_RECLAIM_MS,
  type ClaimDocT,
  type ClaimRequest,
  type ClaimResult,
} from "../claim.js";

/**
 * The Postgres-backed WRITE-CLAIM store (ADR-0009's claim, built on plain Postgres now that DBOS is
 * deferred — ADR-0019; the ADR-0033 §4 "typed-claims-with-refusal" upgrade the notice board
 * named-deferred). The ENFORCING twin of `PgPresenceStore`: presence swallows every failure and
 * always proceeds, a claim REFUSES a second concurrent holder of the same unit.
 *
 * Current holder lives in `events.node_claim` (one row per claimed unit, `unit_id` PK); the audit
 * history is append-only in `events.claim_event` (claimed / reclaimed / released / conflict-refused).
 * Every write is one transaction (BEGIN … COMMIT, ROLLBACK on any error) — the same house pattern as
 * the presence store.
 *
 * Race-safety: `claim()` reads the holder `FOR UPDATE` (serializing two claimers on the SAME unit
 * when a row already exists), and the fresh-insert path uses `ON CONFLICT (unit_id) DO NOTHING
 * RETURNING` so the one case `FOR UPDATE` cannot cover — two sessions racing to insert the FIRST
 * claim — resolves to exactly one winner (the loser sees 0 returned rows and refuses).
 *
 * The structural seams are duck-typed so the offline test injects a `FakePool` without `pg` types,
 * exactly like the presence store.
 */

// ── Structural seams ────────────────────────────────────────────────────────

export interface ClaimClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ClaimPoolClient extends ClaimClient {
  release(): void;
}

export interface ClaimPool extends ClaimClient {
  connect(): Promise<ClaimPoolClient>;
}

/** One row from `events.claim_event` (the audit history). */
export interface ClaimAuditEvent {
  type: string;
  sessionId: string;
  doc: unknown;
  at: string;
}

// ── Internal row shape ───────────────────────────────────────────────────────

interface ClaimRow {
  unit_id: string;
  session_id: string;
  branch: string;
  intent: string;
  claimed_at: Date | string;
  heartbeat_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToDoc(row: ClaimRow): ClaimDocT {
  return {
    unitId: row.unit_id,
    sessionId: row.session_id,
    branch: row.branch,
    intent: row.intent,
    claimedAt: toIso(row.claimed_at),
    heartbeatAt: toIso(row.heartbeat_at),
  };
}

const CLAIM_COLUMNS =
  "unit_id, session_id, branch, intent, claimed_at, heartbeat_at";

/** Options for {@link PgClaimStore.claim} — both injectable so the live test can drive reclaim. */
export interface ClaimOptions {
  /** Clock for the reclaim decision (default `new Date()`). */
  now?: Date;
  /** Reclaim threshold in ms (default {@link CLAIM_STALE_RECLAIM_MS}). */
  staleReclaimMs?: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class PgClaimStore {
  readonly #pool: ClaimPool;

  constructor(pool: ClaimPool) {
    this.#pool = pool;
  }

  /**
   * Try to take the build-claim on `req.unitId`. Acquires when the unit is unclaimed, already held
   * by this same session (re-entrant heartbeat refresh), or held by a holder whose claim has gone
   * stale (reclaim). Otherwise REFUSES — returning the live holder so the caller can name it — and
   * records a `conflict-refused` audit event. Atomic; ROLLBACK on any error.
   */
  async claim(req: ClaimRequest, opts: ClaimOptions = {}): Promise<ClaimResult> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleReclaimMs ?? CLAIM_STALE_RECLAIM_MS;
    // Fail-closed on attribution before any write (blank unitId/sessionId/branch is a refusal).
    const candidate = ClaimDoc.parse({
      unitId: req.unitId,
      sessionId: req.sessionId,
      branch: req.branch,
      intent: req.intent ?? "",
      claimedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
    });

    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");

      const held = await client.query(
        `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 FOR UPDATE`,
        [candidate.unitId],
      );
      const existing = (held.rows as ClaimRow[])[0];

      // ── Refused: a different session holds a still-fresh claim ──────────────
      if (
        existing !== undefined &&
        existing.session_id !== candidate.sessionId &&
        !isReclaimable({ heartbeatAt: toIso(existing.heartbeat_at) }, now, staleMs)
      ) {
        const heldBy = rowToDoc(existing);
        await this.#appendEvent(client, candidate.unitId, "conflict-refused", candidate.sessionId, heldBy);
        await client.query("COMMIT");
        return { acquired: false, heldBy };
      }

      // ── Acquired ────────────────────────────────────────────────────────────
      let acquiredRow: ClaimRow | undefined;
      let reclaimed = false;
      let eventType: "claimed" | "reclaimed";

      if (existing === undefined) {
        // Fresh claim. ON CONFLICT DO NOTHING covers the one race FOR UPDATE cannot: a concurrent
        // session inserting the FIRST claim between our SELECT and this INSERT. 0 returned rows =
        // we lost that race → re-read the winner and refuse.
        const ins = await client.query(
          `INSERT INTO events.node_claim (unit_id, session_id, branch, intent, claimed_at, heartbeat_at)
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT (unit_id) DO NOTHING
           RETURNING ${CLAIM_COLUMNS}`,
          [candidate.unitId, candidate.sessionId, candidate.branch, candidate.intent],
        );
        acquiredRow = (ins.rows as ClaimRow[])[0];
        if (acquiredRow === undefined) {
          const winner = await client.query(
            `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1`,
            [candidate.unitId],
          );
          const heldBy = rowToDoc((winner.rows as ClaimRow[])[0] as ClaimRow);
          await this.#appendEvent(client, candidate.unitId, "conflict-refused", candidate.sessionId, heldBy);
          await client.query("COMMIT");
          return { acquired: false, heldBy };
        }
        eventType = "claimed";
      } else {
        // Re-entrant (same session) OR reclaim (stale other session): take/refresh ownership.
        reclaimed = existing.session_id !== candidate.sessionId;
        eventType = reclaimed ? "reclaimed" : "claimed";
        const upd = await client.query(
          `UPDATE events.node_claim
             SET session_id = $2, branch = $3, intent = $4, claimed_at = now(), heartbeat_at = now()
           WHERE unit_id = $1
           RETURNING ${CLAIM_COLUMNS}`,
          [candidate.unitId, candidate.sessionId, candidate.branch, candidate.intent],
        );
        acquiredRow = (upd.rows as ClaimRow[])[0];
      }

      const claim = rowToDoc(acquiredRow as ClaimRow);
      await this.#appendEvent(client, candidate.unitId, eventType, candidate.sessionId, claim);
      await client.query("COMMIT");
      return { acquired: true, claim, reclaimed };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Release the claim on `unitId` IFF held by `sessionId` (a session can only drop its own claim).
   * Appends a `released` audit event and returns true when a row was removed; false when there was
   * nothing of ours to release (already reclaimed, never held, or held by another). Atomic.
   */
  async release(unitId: string, sessionId: string): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const del = await client.query(
        `DELETE FROM events.node_claim WHERE unit_id = $1 AND session_id = $2 RETURNING ${CLAIM_COLUMNS}`,
        [unitId, sessionId],
      );
      const removed = (del.rows as ClaimRow[])[0];
      if (removed === undefined) {
        await client.query("COMMIT");
        return false;
      }
      await this.#appendEvent(client, unitId, "released", sessionId, rowToDoc(removed));
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** The current holder of `unitId`, or null when unclaimed. Read-only (no transaction). */
  async current(unitId: string): Promise<ClaimDocT | null> {
    const res = await this.#pool.query(
      `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1`,
      [unitId],
    );
    const row = (res.rows as ClaimRow[])[0];
    return row === undefined ? null : rowToDoc(row);
  }

  /** The append-only audit history for `unitId`, ascending by `seq`. */
  async history(unitId: string): Promise<ClaimAuditEvent[]> {
    const res = await this.#pool.query(
      "SELECT type, session_id, doc, at FROM events.claim_event WHERE unit_id = $1 ORDER BY seq",
      [unitId],
    );
    return (res.rows as { type: string; session_id: string; doc: unknown; at: Date | string }[]).map(
      (row) => ({ type: row.type, sessionId: row.session_id, doc: row.doc, at: toIso(row.at) }),
    );
  }

  /**
   * Bulk-release every claim whose `branch` column equals `branch`. Deletes all matching
   * `events.node_claim` rows in one transaction and appends one `released` audit event per cleared
   * claim to `events.claim_event`. Returns the number of claims released.
   *
   * This is the guaranteed machine clear the CI merge job calls — `release()` drops one claim by
   * `(unitId, sessionId)`; this drops ALL of a merged branch's claims by `branch` alone.
   */
  async releaseClaimsByBranch(branch: string): Promise<number> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const del = await client.query(
        `DELETE FROM events.node_claim WHERE branch = $1 RETURNING ${CLAIM_COLUMNS}`,
        [branch],
      );
      const removed = del.rows as ClaimRow[];
      for (const row of removed) {
        const doc = rowToDoc(row);
        await this.#appendEvent(client, row.unit_id, "released", row.session_id, doc);
      }
      await client.query("COMMIT");
      return removed.length;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Bump the heartbeat on `unitId` IFF held by `sessionId` (a session can only refresh its OWN
   * claim's liveness) — the store-side mirror of {@link bumpHeartbeat from claim.ts}, the cheap
   * mid-flight refresh the loops' trace signals call so a live session's claim never ages out
   * (ADR-0138 §4). Touches ONLY `heartbeat_at`; it never re-acquires, refuses, or appends a
   * `claim_event` — a heartbeat is a high-frequency liveness signal, not a state transition, so
   * auditing every bump would flood the log. Returns true when our row was refreshed; false when
   * there was nothing of ours to bump (released, never held, or held by another). Atomic.
   */
  async bumpHeartbeat(unitId: string, sessionId: string): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE events.node_claim SET heartbeat_at = now()
           WHERE unit_id = $1 AND session_id = $2
         RETURNING ${CLAIM_COLUMNS}`,
        [unitId, sessionId],
      );
      const bumped = (upd.rows as ClaimRow[])[0];
      await client.query("COMMIT");
      return bumped !== undefined;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async #appendEvent(
    client: ClaimClient,
    unitId: string,
    type: string,
    sessionId: string,
    doc: ClaimDocT,
  ): Promise<void> {
    await client.query(
      "INSERT INTO events.claim_event (unit_id, type, session_id, doc) VALUES ($1, $2, $3, $4::jsonb)",
      [unitId, type, sessionId, JSON.stringify(doc)],
    );
  }
}
