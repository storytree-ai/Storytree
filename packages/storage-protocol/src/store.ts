import type { ChangeEvent } from "@storytree/proof-protocol";

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

/**
 * A qualified reference to ANOTHER event that caused this one (ADR-0350 D1).
 *
 * `(stream, seq)` is the only addressable event identity that exists today — every one of the
 * append-only streams already has a `BIGSERIAL` primary key, and `StoreEvent.id` is the DOCUMENT id,
 * not an event identity. So this builds on what exists rather than minting a competing global event
 * id (ADR-0350 candidate B, refused on sequencing, not on merit).
 *
 * THE EMITTER STAMPS IT OR IT IS ABSENT (D2). There is no backfill, no correlation job, no "nearest
 * preceding event in the same run", and no join on `unitId` plus adjacency — that is ADR-0235 clause
 * 3 applied to the event log. **Under-reporting is the accepted failure mode and inference may never
 * repair it.** Which is why every reader owes D3: render `caused by: <stream>#<seq>` or `caused by:
 * not recorded`, never a blank, because a blank reads as "nothing caused this" and that is this
 * arc's signature failure — a stale picture and a healthy one looking identical from outside.
 *
 * OBSERVABILITY ONLY (D7). Nothing in the spine may branch on this: no behaviour reacts to it, no
 * rollup reads it, and no derived status or verdict moves with it — `rollupStatus` ignores it exactly
 * as it ignores `usage_event`. The moment something branches on it, that is a new decision.
 */
export interface CausedBy {
  /** The event stream the cause lives in, e.g. `claim_event` — a table name, not a doc kind. */
  stream: string;
  /** The cause's `BIGSERIAL` primary key within that stream. */
  seq: number;
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
  /** Absent means UNRECORDED, never "nothing caused this" — see {@link CausedBy}. */
  causedBy?: CausedBy;
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
/**
 * A field-scoped write (ADR-0352). `fields` are merged onto whatever the store CURRENTLY holds,
 * inside the write itself — so a key this patch does not name survives a concurrent session's edit
 * to it. That is the whole point: `upsertDoc` replaces the doc a caller read some time ago, which
 * silently reverts every change landed in between (the measured lost update, ADR-0352 Context).
 *
 * `validate` runs on the MERGED doc, still inside the write, and what it RETURNS is persisted —
 * mirroring `upsertDoc`'s upcast-then-persist boundary, so a patch cannot skip migrate-on-write.
 * Throwing from it refuses the whole write. It must be PURE and FAST: a real backend holds a row
 * lock across the call, so anything slow there serializes every other writer of that doc.
 *
 * `kind` defaults to the kind the row already carries — a patch that does not say otherwise is not
 * a re-kinding.
 */
export interface PatchDocInput {
  id: string;
  fields: Readonly<Record<string, unknown>>;
  actor?: string;
  kind?: string;
  validate?: (mergedDoc: unknown) => unknown;
}

export interface Store {
  upsertDoc(input: {
    id: string;
    kind: string;
    doc: unknown;
    actor?: string;
  }): Promise<StoredDoc>;
  /** Field-scoped write; `null` when the id does not exist (never creates). See {@link PatchDocInput}. */
  patchDoc(input: PatchDocInput): Promise<StoredDoc | null>;
  getDoc(id: string): Promise<StoredDoc | null>;
  queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]>;
  deleteDoc(id: string, opts?: DeleteDocOpts): Promise<boolean>;
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
    /** ADR-0350 D2: stamped by the emitter at append, or absent forever. Never inferred later. */
    causedBy?: CausedBy;
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
 * The ONE merge rule behind {@link Store.patchDoc}, shared by every impl so the in-memory reference
 * and a real backend cannot drift into two different definitions of "patch" (the parity suite holds
 * them to it). A shallow top-level merge: a named key REPLACES, an unnamed key is untouched. It is
 * deliberately NOT a deep merge — the fields this writes are whole prose blocks and whole arrays,
 * and a deep merge would silently half-apply an array edit.
 *
 * `undefined` as a value DELETES the key, which is how a patch expresses "unset this" without a
 * second verb (`null` is a real JSON value and is written through as one).
 */
export function mergeFields(
  doc: unknown,
  fields: Readonly<Record<string, unknown>>,
  id: string,
) {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error(
      `patchDoc("${id}"): the stored doc is not a JSON object, so there are no fields to patch — use upsertDoc to replace it.`,
    );
  }
  const merged = { ...(doc as Record<string, unknown>) } satisfies Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged satisfies Record<string, unknown>;
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

  /**
   * Field-scoped write (ADR-0352). Single-threaded here, so read-merge-write is already atomic:
   * nothing can interleave between the `#docs.get` and the `#docs.set` below. The contract this
   * upholds is the one a real backend needs a row lock for — merge onto CURRENT state, not onto
   * whatever the caller read earlier.
   */
  async patchDoc(input: PatchDocInput): Promise<StoredDoc | null> {
    const existing = this.#docs.get(input.id);
    if (!existing) return null;
    const merged = mergeFields(existing.doc, input.fields, input.id);
    const doc = input.validate ? input.validate(merged) : merged;
    const kind = input.kind ?? existing.kind;
    const now = new Date().toISOString();
    const stored: StoredDoc = { id: input.id, kind, doc, createdAt: existing.createdAt, updatedAt: now };
    this.#appendEventSync({
      id: input.id,
      kind,
      type: "updated",
      doc,
      actor: input.actor ?? DEFAULT_ACTOR,
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
    causedBy?: CausedBy;
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
    causedBy?: CausedBy;
  }): StoreEvent {
    const event: StoreEvent = {
      seq: ++this.#seq,
      id: e.id,
      kind: e.kind,
      type: e.type,
      doc: e.doc,
      actor: e.actor ?? DEFAULT_ACTOR,
      at: new Date().toISOString(),
      // Carried only when the emitter stamped it — an absent cause stays absent (ADR-0350 D2),
      // never widened to a null that a reader could mistake for "nothing caused this".
      ...(e.causedBy !== undefined ? { causedBy: { ...e.causedBy } } : {}),
    };
    this.#events.push(event);
    return event;
  }
}
