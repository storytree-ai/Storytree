import {
  ClaimDoc,
  ClaimGrade,
  isReclaimable,
  CLAIM_STALE_RECLAIM_MS,
  type ClaimDocT,
  type ClaimGradeT,
  type ClaimRequest,
  type ClaimResult,
} from "../claim.js";

/**
 * The Postgres-backed CLAIM-LEDGER store (ADR-0200 D2: the noticeboard IS the claim ledger —
 * ADR-0009's claim on plain Postgres now that DBOS is deferred, ADR-0019; graded per ADR-0200).
 * One row per (unit, session) at one of THREE grades:
 *   - `exploring` — SHARED (any number of sessions per unit), carries the intent prose.
 *   - `waiting`   — SHARED: the queue behind a work claim, ordered by `claimed_at`.
 *   - `work`      — the EXCLUSIVE mutex (ADR-0121/0138 semantics unchanged): a second concurrent
 *                   work holder is a HARD REFUSAL that names the holder.
 *
 * Rows live in `events.node_claim` (composite PK `(unit_id, session_id)` so shared-grade rows
 * coexist; work exclusivity moved to the PARTIAL UNIQUE INDEX `node_claim_work_excl ON (unit_id)
 * WHERE grade='work'`); the audit history is append-only in `events.claim_event`
 * (claimed / reclaimed / released / conflict-refused / upgraded / downgraded / queued / promoted).
 * Every write is one transaction (BEGIN … COMMIT, ROLLBACK on any error) — the house pattern.
 *
 * Race-safety (the exclusive work path): `claim()` reads the work row `FOR UPDATE` (serializing
 * two claimers on the SAME unit when a work row already exists), and the fresh-insert path races on
 * the partial unique index — `ON CONFLICT (unit_id) WHERE grade = 'work' DO NOTHING RETURNING`
 * (Postgres arbitrates a conflict target with a WHERE clause against the matching partial index) —
 * so the one case `FOR UPDATE` cannot cover — two sessions racing to insert the FIRST work claim —
 * resolves to exactly one winner (the loser sees 0 returned rows and refuses). Because the PK is
 * now composite, a session's OWN shared-grade row on the unit would 23505 the work INSERT before
 * the partial index ever arbitrates — so every take-work path first FOLDS the session's own
 * shared row away (DELETE … RETURNING, restored verbatim if the take is then refused).
 *
 * Atomic promotion (ADR-0200 D2: "on release of the work claim the store atomically promotes the
 * oldest live waiter"): EVERY path that drops or downgrades a work row — release(),
 * releaseClaimsByBranch(), releaseClaimsBySession(), downgrade() — picks the unit's oldest
 * still-live `waiting` row (order by `claimed_at`, staleness skipped by heartbeat — the SQL mirror
 * of the pure `oldestLiveWaiter`) and flips it to `grade='work'` IN THE SAME TRANSACTION, audited
 * `promoted`. The freed slot is never observable as empty while a live waiter queues.
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
  /** Optional at the type level (pre-grade fixtures); the live column is NOT NULL DEFAULT 'work'. */
  grade?: string;
  branch: string;
  intent: string;
  claimed_at: Date | string;
  heartbeat_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToDoc(row: ClaimRow): ClaimDocT {
  const doc: ClaimDocT = {
    unitId: row.unit_id,
    sessionId: row.session_id,
    branch: row.branch,
    intent: row.intent,
    claimedAt: toIso(row.claimed_at),
    heartbeatAt: toIso(row.heartbeat_at),
  };
  // An ABSENT grade IS the work claim (ADR-0200 D2 back-compat — read via claimGrade()); a present
  // one is validated fail-closed (a corrupt grade column must never masquerade as a valid doc).
  if (row.grade !== undefined) doc.grade = ClaimGrade.parse(row.grade);
  return doc;
}

/** The row's effective grade — `work` when absent, mirroring {@link claimGrade}. */
function rowGrade(row: ClaimRow): ClaimGradeT {
  return row.grade === undefined ? "work" : ClaimGrade.parse(row.grade);
}

const CLAIM_COLUMNS =
  "unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at";

/** Options for the acquire paths — both injectable so the live test can drive reclaim. */
export interface ClaimOptions {
  /** Clock for the reclaim decision (default `new Date()`). */
  now?: Date;
  /** Reclaim threshold in ms (default {@link CLAIM_STALE_RECLAIM_MS}). */
  staleReclaimMs?: number;
}

/** The SHARED grades — everything but the exclusive work mutex (ADR-0200 D2). */
export type SharedClaimGrade = Exclude<ClaimGradeT, "work">;

/** Options for {@link PgClaimStore.upgrade} — `branch`/`intent` cover the no-prior-row upgrade. */
export interface UpgradeOptions extends ClaimOptions {
  /** Required when the session holds NO prior row on the unit (there is nothing to inherit from). */
  branch?: string;
  /** Overrides the inherited intent prose when provided. */
  intent?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class PgClaimStore {
  readonly #pool: ClaimPool;

  constructor(pool: ClaimPool) {
    this.#pool = pool;
  }

  /**
   * Try to take the EXCLUSIVE work claim on `req.unitId` — today's exact ADR-0121/0138 semantics,
   * unchanged for every existing consumer (drive's build/declare paths). Acquires when no work row
   * exists, the work row is already this session's (re-entrant refresh), or the holder's claim has
   * gone stale (reclaim). Otherwise REFUSES — returning the live holder so the caller can name it —
   * and records a `conflict-refused` audit event. `req.grade` is ignored: this IS the work take
   * (grade-aware callers go through {@link take}). Atomic; ROLLBACK on any error.
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
      grade: "work",
      claimedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
    });

    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");

      // The exclusive read is now grade-scoped (ADR-0200 D2): shared exploring/waiting rows on the
      // unit never block a work take — only the ONE work row (partial-index-enforced) does.
      const held = await client.query(
        `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 AND grade = 'work' FOR UPDATE`,
        [candidate.unitId],
      );
      const existing = (held.rows as ClaimRow[])[0];

      // ── Refused: a different session holds a still-fresh work claim ─────────
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
      // FOLD: the composite PK (ADR-0200 D2) means our own exploring/waiting row on this unit would
      // 23505 the work INSERT / the reclaim UPDATE's session_id flip before the partial index ever
      // arbitrates — a session taking work ABSORBS its shared row (RETURNING kept so the one refusal
      // path below can restore it verbatim).
      const fold = await client.query(
        `DELETE FROM events.node_claim
          WHERE unit_id = $1 AND session_id = $2 AND grade <> 'work'
        RETURNING ${CLAIM_COLUMNS}`,
        [candidate.unitId, candidate.sessionId],
      );
      const folded = (fold.rows as ClaimRow[])[0];

      let acquiredRow: ClaimRow | undefined;
      let reclaimed = false;
      let eventType: "claimed" | "reclaimed";

      if (existing === undefined) {
        // Fresh claim. ON CONFLICT on the PARTIAL unique index covers the one race FOR UPDATE
        // cannot: a concurrent session inserting the FIRST work claim between our SELECT and this
        // INSERT. 0 returned rows = we lost that race → restore our folded shared row (the wisp
        // must not vanish as collateral of a refused take), re-read the winner, and refuse.
        const ins = await client.query(
          `INSERT INTO events.node_claim (unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at)
           VALUES ($1, $2, 'work', $3, $4, now(), now())
           ON CONFLICT (unit_id) WHERE grade = 'work' DO NOTHING
           RETURNING ${CLAIM_COLUMNS}`,
          [candidate.unitId, candidate.sessionId, candidate.branch, candidate.intent],
        );
        acquiredRow = (ins.rows as ClaimRow[])[0];
        if (acquiredRow === undefined) {
          if (folded !== undefined) await this.#restoreRow(client, folded);
          const winner = await client.query(
            `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 AND grade = 'work'`,
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
        // The UPDATE keys on THE work row (unit + grade), not the composite PK — a reclaim flips
        // its session_id to ours (PK slot freed by the fold above).
        reclaimed = existing.session_id !== candidate.sessionId;
        eventType = reclaimed ? "reclaimed" : "claimed";
        const upd = await client.query(
          `UPDATE events.node_claim
             SET session_id = $2, branch = $3, intent = $4, claimed_at = now(), heartbeat_at = now()
           WHERE unit_id = $1 AND grade = 'work'
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
   * Grade-aware acquire (ADR-0200 D2). `work` (or absent — every pre-grade producer) delegates to
   * the exclusive {@link claim} path unchanged. `exploring`/`waiting` are SHARED: the row upserts
   * on the composite PK — the same session re-taking refreshes heartbeat/intent/branch, and
   * `claimed_at` (the queue position for `waiting`) moves ONLY when the grade actually changes
   * (a re-take never loses your place in line). A shared take NEVER demotes the session's own work
   * row (grade transitions down are {@link downgrade}'s job, which fires promotion) — taking
   * exploring while holding work is a plain refresh. Audited `claimed` (the doc carries the grade).
   */
  async take(req: ClaimRequest, opts: ClaimOptions = {}): Promise<ClaimResult> {
    const grade = req.grade ?? "work";
    if (grade === "work") return this.claim(req, opts);

    const now = opts.now ?? new Date();
    // Fail-closed on attribution before any write, exactly like claim().
    const candidate = ClaimDoc.parse({
      unitId: req.unitId,
      sessionId: req.sessionId,
      branch: req.branch,
      intent: req.intent ?? "",
      grade,
      claimedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
    });

    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO events.node_claim (unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at)
         VALUES ($1, $2, $3, $4, $5, now(), now())
         ON CONFLICT (unit_id, session_id) DO UPDATE
           SET grade = CASE WHEN events.node_claim.grade = 'work'
                            THEN events.node_claim.grade ELSE EXCLUDED.grade END,
               branch = EXCLUDED.branch,
               intent = EXCLUDED.intent,
               claimed_at = CASE WHEN events.node_claim.grade IN (EXCLUDED.grade, 'work')
                                 THEN events.node_claim.claimed_at ELSE now() END,
               heartbeat_at = now()
         RETURNING ${CLAIM_COLUMNS}`,
        [candidate.unitId, candidate.sessionId, grade, candidate.branch, candidate.intent],
      );
      const claim = rowToDoc((ins.rows as ClaimRow[])[0] as ClaimRow);
      await this.#appendEvent(client, candidate.unitId, "claimed", candidate.sessionId, claim);
      await client.query("COMMIT");
      return { acquired: true, claim, reclaimed: false };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Upgrade this session's claim on `unitId` to the WORK grade (exploring→work, ADR-0200 D2).
   * Atomically, in one transaction:
   *   - work slot FREE (no work row, or ours, or stale-reclaimable): take it — the session's
   *     exploring row BECOMES the work row (`claimed_at` restamps to now: the work claim starts
   *     now, exactly like a fresh claim()); audited `upgraded` (`reclaimed: true` when a stale
   *     holder was evicted).
   *   - work slot held by a LIVE other session: the session's row flips/inserts to `waiting`
   *     instead — the QUEUE, position = now (joining the line is when you start waiting; an
   *     already-waiting re-upgrade keeps its spot); audited `queued`; returns the queued arm.
   * A session with NO prior row can still upgrade (take-work-or-queue) — `opts.branch` is then
   * required (fail-closed: attribution is never invented). Mechanically the take is fold-then-
   * insert on the partial index (see the class header): the composite PK makes an in-place
   * grade-flip UPDATE racy against a concurrent first-work INSERT, while ON CONFLICT … WHERE
   * grade='work' DO NOTHING resolves that race to one winner — the loser lands in the queue.
   */
  async upgrade(unitId: string, sessionId: string, opts: UpgradeOptions = {}): Promise<ClaimResult> {
    const now = opts.now ?? new Date();
    const staleMs = opts.staleReclaimMs ?? CLAIM_STALE_RECLAIM_MS;

    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");

      // Our own row (any grade), locked — the branch/intent to inherit, and the fold target.
      const ownRes = await client.query(
        `SELECT ${CLAIM_COLUMNS} FROM events.node_claim
          WHERE unit_id = $1 AND session_id = $2 FOR UPDATE`,
        [unitId, sessionId],
      );
      const own = (ownRes.rows as ClaimRow[])[0];
      const branch = opts.branch ?? own?.branch;
      const intent = opts.intent ?? own?.intent ?? "";
      if (branch === undefined || branch.trim().length === 0) {
        // Fail-closed: no prior row to inherit attribution from and none supplied.
        throw new Error(
          `upgrade(${unitId}, ${sessionId}): session holds no prior claim row and no branch was supplied`,
        );
      }

      // The work row, locked (the same serialization point as claim()).
      const held = await client.query(
        `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 AND grade = 'work' FOR UPDATE`,
        [unitId],
      );
      const existing = (held.rows as ClaimRow[])[0];

      // ── Already ours: a re-entrant upgrade is a refresh of the held work row ─
      if (existing !== undefined && existing.session_id === sessionId) {
        const upd = await client.query(
          `UPDATE events.node_claim
             SET branch = $2, intent = $3, claimed_at = now(), heartbeat_at = now()
           WHERE unit_id = $1 AND grade = 'work'
           RETURNING ${CLAIM_COLUMNS}`,
          [unitId, branch, intent],
        );
        const claim = rowToDoc((upd.rows as ClaimRow[])[0] as ClaimRow);
        await this.#appendEvent(client, unitId, "upgraded", sessionId, claim);
        await client.query("COMMIT");
        return { acquired: true, claim, reclaimed: false };
      }

      // ── Held by a LIVE other session: join the queue (the ADR-0200 waiting line) ─
      if (
        existing !== undefined &&
        !isReclaimable({ heartbeatAt: toIso(existing.heartbeat_at) }, now, staleMs)
      ) {
        const heldBy = rowToDoc(existing);
        const waiting = await this.#upsertWaiting(client, unitId, sessionId, branch, intent);
        await this.#appendEvent(client, unitId, "queued", sessionId, waiting);
        await client.query("COMMIT");
        return { acquired: false, queued: true, waiting, heldBy };
      }

      // ── Stale other holder: evict it (reclaim), then take the freed slot ─────
      const reclaimed = existing !== undefined;
      if (existing !== undefined) {
        await client.query(
          `DELETE FROM events.node_claim WHERE unit_id = $1 AND grade = 'work'`,
          [unitId],
        );
      }

      // FOLD our own shared row (composite-PK slot must be free for the work insert), then race
      // the partial index for the slot — see claim()'s fresh path for the reasoning.
      if (own !== undefined) {
        await client.query(
          `DELETE FROM events.node_claim
            WHERE unit_id = $1 AND session_id = $2 AND grade <> 'work'
          RETURNING ${CLAIM_COLUMNS}`,
          [unitId, sessionId],
        );
      }
      const ins = await client.query(
        `INSERT INTO events.node_claim (unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at)
         VALUES ($1, $2, 'work', $3, $4, now(), now())
         ON CONFLICT (unit_id) WHERE grade = 'work' DO NOTHING
         RETURNING ${CLAIM_COLUMNS}`,
        [unitId, sessionId, branch, intent],
      );
      const acquiredRow = (ins.rows as ClaimRow[])[0];
      if (acquiredRow === undefined) {
        // Lost the first-work race to a concurrent claimer: an upgrade never dead-ends — the
        // session lands in the queue behind the winner (the graceful arm), audited `queued`.
        const winner = await client.query(
          `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 AND grade = 'work'`,
          [unitId],
        );
        const heldBy = rowToDoc((winner.rows as ClaimRow[])[0] as ClaimRow);
        const waiting = await this.#upsertWaiting(client, unitId, sessionId, branch, intent);
        await this.#appendEvent(client, unitId, "queued", sessionId, waiting);
        await client.query("COMMIT");
        return { acquired: false, queued: true, waiting, heldBy };
      }

      const claim = rowToDoc(acquiredRow);
      await this.#appendEvent(client, unitId, "upgraded", sessionId, claim);
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
   * Downgrade this session's claim on `unitId` to a SHARED grade (work→exploring, waiting→
   * exploring, …; ADR-0200 D2). `claimed_at` restamps only when the grade actually changes (a
   * downgrade to `waiting` joins the BACK of the queue now — so a work holder downgrading to
   * waiting yields to every existing waiter, and wins its own slot back only when the line is
   * empty). Audited `downgraded`. Downgrading a WORK row frees the exclusive slot → the oldest
   * live waiter is promoted IN THE SAME TRANSACTION (audited `promoted`). Returns true when a row
   * of ours was downgraded; false when there was nothing of ours on the unit. Atomic.
   */
  async downgrade(unitId: string, sessionId: string, grade: SharedClaimGrade): Promise<boolean> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const ownRes = await client.query(
        `SELECT ${CLAIM_COLUMNS} FROM events.node_claim
          WHERE unit_id = $1 AND session_id = $2 FOR UPDATE`,
        [unitId, sessionId],
      );
      const own = (ownRes.rows as ClaimRow[])[0];
      if (own === undefined) {
        await client.query("COMMIT");
        return false;
      }
      const wasWork = rowGrade(own) === "work";
      const upd = await client.query(
        `UPDATE events.node_claim
           SET grade = $3,
               claimed_at = CASE WHEN grade = $3 THEN claimed_at ELSE now() END,
               heartbeat_at = now()
         WHERE unit_id = $1 AND session_id = $2
         RETURNING ${CLAIM_COLUMNS}`,
        [unitId, sessionId, grade],
      );
      const doc = rowToDoc((upd.rows as ClaimRow[])[0] as ClaimRow);
      await this.#appendEvent(client, unitId, "downgraded", sessionId, doc);
      // A downgraded WORK row frees the exclusive slot — promote atomically (ADR-0200 D2).
      if (wasWork) await this.#promoteOldestWaiter(client, unitId);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Release THIS SESSION's claim on `unitId`, WHATEVER its grade (the composite key — a session can
   * only drop its own row). Appends a `released` audit event and returns true when a row was
   * removed; false when there was nothing of ours to release. When the released row was the WORK
   * row, the oldest live waiter is promoted in the same transaction (ADR-0200 D2, audited
   * `promoted`); releasing a shared exploring/waiting row never fires promotion. Atomic.
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
      if (rowGrade(removed) === "work") await this.#promoteOldestWaiter(client, unitId);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The current WORK holder of `unitId`, or null when the exclusive slot is unclaimed — "the
   * current holder" is what every existing caller means (shared exploring/waiting rows are the
   * board's business, {@link claimsFor}). Read-only (no transaction).
   */
  async current(unitId: string): Promise<ClaimDocT | null> {
    const res = await this.#pool.query(
      `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 AND grade = 'work'`,
      [unitId],
    );
    const row = (res.rows as ClaimRow[])[0];
    return row === undefined ? null : rowToDoc(row);
  }

  /**
   * EVERY claim row on `unitId`, all grades, ascending by `claimed_at` (so a `waiting` slice reads
   * in queue order) — the board/queue read (ADR-0200 D2). Read-only (no transaction).
   */
  async claimsFor(unitId: string): Promise<ClaimDocT[]> {
    const res = await this.#pool.query(
      `SELECT ${CLAIM_COLUMNS} FROM events.node_claim WHERE unit_id = $1 ORDER BY claimed_at, session_id`,
      [unitId],
    );
    return (res.rows as ClaimRow[]).map(rowToDoc);
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
   * `events.node_claim` rows (all grades) in one transaction and appends one `released` audit event
   * per cleared claim to `events.claim_event`. Every unit whose WORK row was cleared then promotes
   * its oldest live waiter in the SAME transaction (ADR-0200 D2 — a merged branch's freed slot goes
   * straight to the line, and its own now-deleted waiting rows can never win it). Returns the
   * number of claims released.
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
      await this.#promoteForClearedWork(client, removed);
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
   * Bulk-release every claim held by `sessionId` — the `noticeboard done` twin of
   * {@link releaseClaimsByBranch} (ADR-0142): a session marking itself done drops ALL of its
   * claims (all grades) in one transaction, one `released` audit event per cleared claim, and every
   * unit whose WORK row was cleared promotes its oldest live waiter in the same transaction
   * (ADR-0200 D2). Returns the number of claims released (0 when the session held nothing — a
   * no-op, never an error).
   */
  async releaseClaimsBySession(sessionId: string): Promise<number> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const del = await client.query(
        `DELETE FROM events.node_claim WHERE session_id = $1 RETURNING ${CLAIM_COLUMNS}`,
        [sessionId],
      );
      const removed = del.rows as ClaimRow[];
      for (const row of removed) {
        const doc = rowToDoc(row);
        await this.#appendEvent(client, row.unit_id, "released", row.session_id, doc);
      }
      await this.#promoteForClearedWork(client, removed);
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
   * Bump the heartbeat on EVERY claim held by `sessionId` — the statusline-heartbeat twin of
   * {@link bumpHeartbeat} (ADR-0142): the ambient beat that keeps a live session's claims (ALL
   * grades — one trace-driven clock, ADR-0200 D5) out of the stale window, without knowing which
   * units it holds. Touches ONLY `heartbeat_at`, appends NO audit event (a heartbeat is a liveness
   * signal, not a state transition). Returns the number of claims bumped (0 = held nothing). Atomic.
   */
  async bumpHeartbeatsBySession(sessionId: string): Promise<number> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE events.node_claim SET heartbeat_at = now()
           WHERE session_id = $1
         RETURNING ${CLAIM_COLUMNS}`,
        [sessionId],
      );
      await client.query("COMMIT");
      return (upd.rows as ClaimRow[]).length;
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
   * (ADR-0138 §4). The WHERE is already the composite key, so it bumps the session's row at ANY
   * grade (a waiting session's queue liveness rides the same beat — ADR-0200 D5). Touches ONLY
   * `heartbeat_at`; it never re-acquires, refuses, or appends a `claim_event` — a heartbeat is a
   * high-frequency liveness signal, not a state transition, so auditing every bump would flood the
   * log. Returns true when our row was refreshed; false when there was nothing of ours to bump
   * (released, never held, or held by another). Atomic.
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

  // ── Internals ───────────────────────────────────────────────────────────────

  /**
   * Promote the oldest LIVE waiter on `unitId` to the work grade — the SQL half of the pure
   * `oldestLiveWaiter` (ADR-0200 D2): order by `claimed_at`, skip stale-by-heartbeat (a dead
   * session never wins promotion; the SAME 2 h clock as reclaim), `session_id` tiebreak for
   * determinism. Runs INSIDE the caller's transaction — every work-release path calls this before
   * its COMMIT, so the freed slot and the promotion are one atomic step. The caller must have just
   * removed/downgraded the unit's work row (the partial unique index would refuse a second work
   * row otherwise — fail-closed, never a silent double-holder). `claimed_at` restamps to now (the
   * work claim starts at promotion); `heartbeat_at` is deliberately untouched — liveness is the
   * session's OWN signal (ADR-0200 D5), promotion must not forge a beat for a session that may
   * have died since it queued. No-op (returns undefined) when no live waiter remains.
   */
  async #promoteOldestWaiter(client: ClaimClient, unitId: string): Promise<ClaimDocT | undefined> {
    const pick = await client.query(
      `SELECT ${CLAIM_COLUMNS} FROM events.node_claim
        WHERE unit_id = $1 AND grade = 'waiting'
          AND heartbeat_at > now() - ($2::bigint * interval '1 millisecond')
        ORDER BY claimed_at, session_id
        LIMIT 1
        FOR UPDATE`,
      [unitId, CLAIM_STALE_RECLAIM_MS],
    );
    const waiter = (pick.rows as ClaimRow[])[0];
    if (waiter === undefined) return undefined;
    const upd = await client.query(
      `UPDATE events.node_claim SET grade = 'work', claimed_at = now()
        WHERE unit_id = $1 AND session_id = $2
      RETURNING ${CLAIM_COLUMNS}`,
      [waiter.unit_id, waiter.session_id],
    );
    const promoted = rowToDoc((upd.rows as ClaimRow[])[0] as ClaimRow);
    await this.#appendEvent(client, unitId, "promoted", promoted.sessionId, promoted);
    return promoted;
  }

  /** Promote once per DISTINCT unit whose WORK row is among `removed` (the bulk-release paths). */
  async #promoteForClearedWork(client: ClaimClient, removed: ClaimRow[]): Promise<void> {
    const workUnits = [...new Set(removed.filter((r) => rowGrade(r) === "work").map((r) => r.unit_id))];
    for (const unitId of workUnits) {
      await this.#promoteOldestWaiter(client, unitId);
    }
  }

  /**
   * Flip/insert the session's row on `unitId` to `waiting` — the queue join (ADR-0200 D2).
   * `claimed_at` (the queue POSITION) moves to now only when the grade actually changes: joining
   * the line is when you start waiting, while an already-waiting re-join keeps its spot.
   */
  async #upsertWaiting(
    client: ClaimClient,
    unitId: string,
    sessionId: string,
    branch: string,
    intent: string,
  ): Promise<ClaimDocT> {
    const res = await client.query(
      `INSERT INTO events.node_claim (unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at)
       VALUES ($1, $2, 'waiting', $3, $4, now(), now())
       ON CONFLICT (unit_id, session_id) DO UPDATE
         SET grade = 'waiting',
             branch = EXCLUDED.branch,
             intent = EXCLUDED.intent,
             claimed_at = CASE WHEN events.node_claim.grade = 'waiting'
                               THEN events.node_claim.claimed_at ELSE now() END,
             heartbeat_at = now()
       RETURNING ${CLAIM_COLUMNS}`,
      [unitId, sessionId, branch, intent],
    );
    return rowToDoc((res.rows as ClaimRow[])[0] as ClaimRow);
  }

  /** Restore a folded shared row verbatim (the refused-take path — the wisp must survive). */
  async #restoreRow(client: ClaimClient, row: ClaimRow): Promise<void> {
    await client.query(
      `INSERT INTO events.node_claim (unit_id, session_id, grade, branch, intent, claimed_at, heartbeat_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.unit_id,
        row.session_id,
        row.grade ?? "work",
        row.branch,
        row.intent,
        toIso(row.claimed_at),
        toIso(row.heartbeat_at),
      ],
    );
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
