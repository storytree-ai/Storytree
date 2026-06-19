import type { ChangeEvent } from "@storytree/verdict-contract";

/**
 * The narrow Store seam + an in-memory implementation
 * (ported from legacy/Agentic/crates/agentic-store's Store trait + trait-parity tests;
 * surrealkv DROPPED). ADR-0017: history = events, current = projection; relationships
 * are ID refs inside docs, NEVER foreign keys.
 *
 * The interface is intentionally minimal. packages/store implements the SAME interface over
 * Postgres and runs `storeParitySuite` (see `store-parity.ts`) to prove behavioural equivalence.
 *
 * PURE by construction (ADR-0068 step 0): this file carries NO `node:` import. The reusable
 * `node:test` parity suites live in `store-parity.ts`; the library write-boundary schema (which
 * pulls in `knowledge.ts` / `migrations.ts`) lives in `library-doc.ts`. The parity suites are exported
 * from this package's `./parity` subpath; the write-boundary schema now lives in `@storytree/library`.
 */

/** The current-state projection of a document. */
export interface StoredDoc {
  id: string;
  kind: string;
  doc: unknown;
  createdAt: string;
  updatedAt: string;
}

/** An append-only event in the history log. `seq` is a monotonic per-store sequence. */
export interface StoreEvent {
  seq: number;
  id: string;
  kind: string;
  type: "created" | "updated" | "deleted";
  doc: unknown;
  actor: string;
  at: string;
}

/**
 * Optional retire metadata for {@link Store.deleteDoc} — the "retire with a recorded rationale"
 * path (the curator's auto-retire of a clearly-overtaken open-question, ADR-0065). When `reason`
 * (and optionally `supersededBy`) is given, the terminal `deleted` event records `actor` and folds
 * `retiredReason` / `supersededBy` into its event `doc`, so WHY a doc left the projection is durable
 * in the append-only history (ADR-0017: history = events). Absent = a plain delete (default actor,
 * the doc's last state verbatim) — every existing caller is unaffected.
 */
export interface DeleteDocOpts {
  actor?: string;
  reason?: string;
  supersededBy?: string;
}

/**
 * The Store seam. KEPT NARROW on purpose.
 *
 * `upsertDoc` does TWO things atomically (ADR-0017): it appends a `created`/`updated` event to
 * history AND updates the current-state projection. `getDoc` of an absent id returns `null`,
 * never throws. Relationships between docs are expressed as ID references inside the doc bodies,
 * never as foreign keys at this layer.
 */
export interface Store {
  upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDoc>;
  getDoc(id: string): Promise<StoredDoc | null>;
  queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]>;
  deleteDoc(id: string, opts?: DeleteDocOpts): Promise<boolean>;
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent>;
  readEvents(filter?: { id?: string }): Promise<StoreEvent[]>;
}

/**
 * The binding-staleness change log (ADR-0016 §2). A SEPARATE seam from {@link Store} — a backend
 * implements both — so the narrow doc/event store is not widened for every implementer at once (the
 * Postgres `PgChangeStore` is a parallel follow-on, held to `changeStoreParitySuite`).
 */
export interface ChangeStore {
  /** Append one ADR-0016 change event to the unit's change log. */
  appendChangeEvent(change: ChangeEvent): Promise<void>;
  /** Read change events, newest-appended last (insertion order); filter by `unitId` when given. */
  readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]>;
}

const DEFAULT_ACTOR = "system";

/**
 * The `doc` payload of a `deleted` event: the doc's last state verbatim, plus `retiredReason` /
 * `supersededBy` folded in WHEN a retire rationale was given and the body is an object — so the
 * append-only history records WHY the doc was retired (ADR-0065). The projection has already
 * dropped the row, so these extra keys never reach a live read or the `.strict()` write boundary;
 * they live only on the terminal event. A plain delete (no opts / non-object body) is untouched.
 */
export function retiredEventDoc(doc: unknown, opts?: DeleteDocOpts): unknown {
  if (opts?.reason === undefined && opts?.supersededBy === undefined) return doc;
  if (typeof doc !== "object" || doc === null) return doc;
  return {
    ...(doc as Record<string, unknown>),
    ...(opts.reason !== undefined ? { retiredReason: opts.reason } : {}),
    ...(opts.supersededBy !== undefined ? { supersededBy: opts.supersededBy } : {}),
  };
}

/**
 * In-memory {@link Store}: a Map for the current-state projection and an array for the event
 * history. `appendEvent` assigns a monotonic `seq`; `upsertDoc` appends the event and updates
 * the projection together, in-process (no await between the two -> atomic for this impl).
 */
export class InMemoryStore implements Store, ChangeStore {
  #docs = new Map<string, StoredDoc>();
  #events: StoreEvent[] = [];
  #seq = 0;
  #changes: ChangeEvent[] = [];

  async upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDoc> {
    const now = new Date().toISOString();
    const existing = this.#docs.get(input.id);
    const actor = input.actor ?? DEFAULT_ACTOR;
    const stored: StoredDoc = {
      id: input.id,
      kind: input.kind,
      doc: input.doc,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.#appendEventSync({
      id: input.id,
      kind: input.kind,
      type: existing ? "updated" : "created",
      doc: input.doc,
      actor,
    });
    this.#docs.set(input.id, stored);
    return stored;
  }

  async getDoc(id: string): Promise<StoredDoc | null> {
    return this.#docs.get(id) ?? null;
  }

  async queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]> {
    const all = [...this.#docs.values()];
    if (filter?.kind === undefined) return all;
    return all.filter((d) => d.kind === filter.kind);
  }

  async deleteDoc(id: string, opts?: DeleteDocOpts): Promise<boolean> {
    const existing = this.#docs.get(id);
    if (!existing) return false;
    this.#docs.delete(id);
    this.#appendEventSync({
      id,
      kind: existing.kind,
      type: "deleted",
      doc: retiredEventDoc(existing.doc, opts),
      actor: opts?.actor ?? DEFAULT_ACTOR,
    });
    return true;
  }

  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent> {
    return this.#appendEventSync(e);
  }

  async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    if (filter?.id === undefined) return [...this.#events];
    return this.#events.filter((ev) => ev.id === filter.id);
  }

  async appendChangeEvent(change: ChangeEvent): Promise<void> {
    this.#changes.push(change);
  }

  async readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]> {
    const all = [...this.#changes];
    if (filter?.unitId === undefined) return all;
    return all.filter((c) => c.unitId === filter.unitId);
  }

  #appendEventSync(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): StoreEvent {
    const event: StoreEvent = {
      seq: ++this.#seq,
      id: e.id,
      kind: e.kind,
      type: e.type,
      doc: e.doc,
      actor: e.actor ?? DEFAULT_ACTOR,
      at: new Date().toISOString(),
    };
    this.#events.push(event);
    return event;
  }
}
