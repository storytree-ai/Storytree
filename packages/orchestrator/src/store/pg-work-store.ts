import type { Store, StoredDoc, StoreEvent } from "@storytree/base";
import {
  SIGNING_EVENT_KIND,
  Verdict,
  WORK_EVENT_KIND,
  WorkEventDoc,
} from "@storytree/verdict-contract";

/**
 * The Postgres work-hierarchy event store (drive-machinery Phase A's tables, finally written to —
 * PR #29's parked decision 4): the {@link Store} impl `proveUnit` + `rollupStatus` ride when a
 * build runs with `--store pg`. It routes the two work-hierarchy event kinds to their dedicated
 * homes — `kind:"work"` → `events.work_event`, `kind:"signing"` → `events.verdict` — so signed
 * verdicts STOP co-mingling with `events.library_event` (the plan §1 mis-landing).
 *
 * EVENT-ONLY and fail-closed by design:
 *  - the doc surface (`upsertDoc`/`getDoc`/`queryDocs`/`deleteDoc`) throws — library artifacts
 *    live in {@link PgLibraryStore}, never here;
 *  - a `signing` event whose doc is not a full signed {@link Verdict} throws (nothing forgeable
 *    lands in `events.verdict`); an unknown kind throws rather than landing somewhere silent.
 *
 * `readEvents` merges both tables into one stream ordered by `at` (work before signing on a tie —
 * a `building` mark precedes the pass it leads to) and REASSIGNS `seq` monotonically over the
 * merged view: the two tables have independent BIGSERIALs, so the raw values cannot order the
 * union. The Store contract only needs `seq` monotonic per store; `rollupStatus` sorts by it.
 */

/** The slice of `pg.Pool` this store needs (structural, so offline tests can inject a fake). */
export interface WorkStoreClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface WorkEventRow {
  seq: string | number;
  type: string;
  doc: unknown;
  actor: string;
  at: Date | string;
}

interface VerdictRow {
  seq: string | number;
  unit_id: string;
  run_id: string;
  signer: string;
  doc: unknown;
  at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** The StoreEvent id rule the work-event/verdict writers use: `runId:unitId`, or bare unitId. */
function eventId(unitId: string, runId: string | undefined): string {
  return runId !== undefined ? `${runId}:${unitId}` : unitId;
}

export class PgWorkStore implements Store {
  readonly #client: WorkStoreClient;

  constructor(client: WorkStoreClient) {
    this.#client = client;
  }

  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent> {
    if (e.kind === SIGNING_EVENT_KIND) {
      // Fail-closed: only a full signed Verdict may land in events.verdict. The scalar columns
      // are the queryable spine; the doc column keeps the whole signed object.
      const verdict = Verdict.parse(e.doc);
      const actor = e.actor ?? verdict.signer;
      const res = await this.#client.query(
        `INSERT INTO events.verdict (unit_id, run_id, proof_mode, outcome, commit_sha, signer, doc)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING seq, at`,
        [
          verdict.unitId,
          verdict.runId,
          verdict.proofMode,
          verdict.outcome,
          verdict.commitSha,
          verdict.signer,
          JSON.stringify(verdict),
        ],
      );
      const row = res.rows[0] as { seq: string | number; at: Date | string } | undefined;
      if (row === undefined) throw new Error("PgWorkStore.appendEvent: no verdict row returned");
      return {
        seq: Number(row.seq),
        id: e.id,
        kind: e.kind,
        type: e.type,
        doc: verdict,
        actor,
        at: toIso(row.at),
      };
    }

    if (e.kind === WORK_EVENT_KIND) {
      const doc = WorkEventDoc.parse(e.doc);
      const actor = e.actor ?? "system";
      const res = await this.#client.query(
        `INSERT INTO events.work_event (unit_id, tier, type, doc, actor)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING seq, at`,
        // The table's `type` column carries the LIFECYCLE word (proposed|building|retired —
        // schema.sql's vocabulary), not the StoreEvent created/updated/deleted envelope.
        [doc.unitId, doc.tier ?? "unknown", doc.event, JSON.stringify(doc), actor],
      );
      const row = res.rows[0] as { seq: string | number; at: Date | string } | undefined;
      if (row === undefined) throw new Error("PgWorkStore.appendEvent: no work_event row returned");
      return {
        seq: Number(row.seq),
        id: e.id,
        kind: e.kind,
        type: e.type,
        doc,
        actor,
        at: toIso(row.at),
      };
    }

    throw new Error(
      `PgWorkStore is the work-hierarchy event store: kind "${e.kind}" has no home here ` +
        `(only "${WORK_EVENT_KIND}" and "${SIGNING_EVENT_KIND}"); library docs belong in PgLibraryStore`,
    );
  }

  async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    const work = await this.#client.query(
      `SELECT seq, type, doc, actor, at FROM events.work_event ORDER BY seq`,
    );
    const verdicts = await this.#client.query(
      `SELECT seq, unit_id, run_id, signer, doc, at FROM events.verdict ORDER BY seq`,
    );

    // kindRank orders a same-timestamp tie: the building mark precedes the pass it led to.
    const merged: Array<{ at: string; kindRank: number; tableSeq: number; event: Omit<StoreEvent, "seq"> }> = [];
    for (const raw of work.rows) {
      const row = raw as WorkEventRow;
      const doc = WorkEventDoc.safeParse(row.doc);
      const id = doc.success ? eventId(doc.data.unitId, doc.data.runId) : `work:${String(row.seq)}`;
      merged.push({
        at: toIso(row.at),
        kindRank: 0,
        tableSeq: Number(row.seq),
        event: {
          id,
          kind: WORK_EVENT_KIND,
          type: "created",
          doc: row.doc,
          actor: row.actor,
          at: toIso(row.at),
        },
      });
    }
    for (const raw of verdicts.rows) {
      const row = raw as VerdictRow;
      merged.push({
        at: toIso(row.at),
        kindRank: 1,
        tableSeq: Number(row.seq),
        event: {
          id: eventId(row.unit_id, row.run_id),
          kind: SIGNING_EVENT_KIND,
          type: "created",
          doc: row.doc,
          actor: row.signer,
          at: toIso(row.at),
        },
      });
    }

    merged.sort(
      (a, b) =>
        a.at.localeCompare(b.at) || a.kindRank - b.kindRank || a.tableSeq - b.tableSeq,
    );
    const events = merged.map(({ event }, index) => ({ ...event, seq: index + 1 }));
    return filter?.id === undefined ? events : events.filter((e) => e.id === filter.id);
  }

  // ── The doc surface: not this store's job, fail loud ───────────────────────
  async upsertDoc(): Promise<StoredDoc> {
    throw new Error(docSurfaceError("upsertDoc"));
  }
  async getDoc(): Promise<StoredDoc | null> {
    throw new Error(docSurfaceError("getDoc"));
  }
  async queryDocs(): Promise<StoredDoc[]> {
    throw new Error(docSurfaceError("queryDocs"));
  }
  async deleteDoc(): Promise<boolean> {
    throw new Error(docSurfaceError("deleteDoc"));
  }
}

function docSurfaceError(method: string): string {
  return `PgWorkStore.${method}: this store is EVENT-ONLY (events.work_event + events.verdict); library docs live in PgLibraryStore`;
}
