import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Knowledge } from "./knowledge.js";
import { upcast } from "./migrations.js";
import type { ChangeEvent } from "./anchor.js";

/**
 * The narrow Store seam + an in-memory implementation + a REUSABLE parity suite
 * (ported from legacy/Agentic/crates/agentic-store's Store trait + trait-parity tests;
 * surrealkv DROPPED). ADR-0017: history = events, current = projection; relationships
 * are ID refs inside docs, NEVER foreign keys.
 *
 * The interface is intentionally minimal. packages/store implements the SAME interface over
 * Postgres and runs {@link storeParitySuite} to prove behavioural equivalence.
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
  deleteDoc(id: string): Promise<boolean>;
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
 * Postgres `PgChangeStore` is a parallel follow-on, held to {@link changeStoreParitySuite}).
 */
export interface ChangeStore {
  /** Append one ADR-0016 change event to the unit's change log. */
  appendChangeEvent(change: ChangeEvent): Promise<void>;
  /** Read change events, newest-appended last (insertion order); filter by `unitId` when given. */
  readChangeEvents(filter?: { unitId?: string }): Promise<ChangeEvent[]>;
}

const DEFAULT_ACTOR = "system";

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

  async deleteDoc(id: string): Promise<boolean> {
    const existing = this.#docs.get(id);
    if (!existing) return false;
    this.#docs.delete(id);
    this.#appendEventSync({
      id,
      kind: existing.kind,
      type: "deleted",
      doc: existing.doc,
      actor: DEFAULT_ACTOR,
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

/**
 * A rendered (markdown-`body`) library artifact at the write boundary — the GuidanceAsset shape the
 * studio persists when it edits ANY non-structured-source unit. Unlike a structured {@link Knowledge}
 * unit (whose body is DERIVED from per-kind fields), a LibraryAsset carries the markdown `body`
 * directly and its `category` is a free string (the asset taxonomy: definition / principle / pattern /
 * guardrail / techstack / template / adr / open-question). This is how the studio stores an edited
 * unit (one-way rendered) and the generated `template-*` artifacts (which have no structured source).
 */
export const LibraryAsset = z
  .object({
    id: z.string(),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    body: z.string(),
    references: z.array(z.string()).default([]),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();
export type LibraryAsset = z.infer<typeof LibraryAsset>;

/**
 * Back-compat alias: a `template` artifact is just a {@link LibraryAsset} with `category: 'template'`.
 * Kept so existing importers of `LibraryTemplate` keep working after the generalisation.
 */
export const LibraryTemplate = LibraryAsset;
export type LibraryTemplate = LibraryAsset;

/**
 * A library artifact at the write boundary: a structured {@link Knowledge} unit (definition /
 * principle / pattern / guardrail / techstack / open-question) OR a rendered {@link LibraryAsset}
 * (markdown-`body`, any category — templates and previously-edited assets). Together these are every
 * artifact the studio Library shows.
 */
export const LibraryDoc = z.union([Knowledge, LibraryAsset]);
export type LibraryDoc = z.infer<typeof LibraryDoc>;

/**
 * The zod write-boundary validator for library documents (ADR-0017: zod-validated at write). Accepts
 * a structured {@link Knowledge} unit or a rendered {@link LibraryAsset} (any category). Throws on
 * malformed input (loud write boundary). (ADR-0019's Knowledge->Library rename is deferred, so the
 * structured type name stays `Knowledge`.)
 */
export function validateLibraryDoc(input: unknown): LibraryDoc {
  return LibraryDoc.parse(input);
}

/**
 * The single write-boundary helper (design §3 "migrate-on-write":
 * docs/research/library-schema-migrations-and-health-checks.md): forward-migrate an old-shape doc
 * with {@link upcast}, THEN validate. A doc authored against an old schema is upcast-and-stamped
 * rather than rejected; a current-shape doc validates unchanged. Use this (not bare
 * {@link validateLibraryDoc}) at any write boundary that may receive lagging-version docs.
 */
export function upcastAndValidate(input: unknown): LibraryDoc {
  return validateLibraryDoc(upcast(input as Record<string, unknown>));
}

/**
 * A minimal VALID {@link LibraryDoc} (a {@link LibraryAsset}) for the parity fixtures. The Postgres
 * {@link Store} validates every `upsertDoc` doc at the ADR-0017 write boundary
 * ({@link upcastAndValidate}), so the SHARED parity suite must feed docs BOTH implementations accept:
 * the in-memory reference stores any `doc: unknown` raw, but Postgres rejects a non-LibraryDoc (e.g.
 * the old `{ v: 1 }` fixture, which only InMemoryStore ever accepted). `body` is the observable
 * payload the replace test asserts on. (This suite proves the GENERIC store behaviours — replace,
 * timestamps, query, delete, event order — on valid input; it is NOT a validation-parity suite.
 * Write-boundary validation is a library-store concern layered ON TOP of the narrow seam, whose
 * contract is `doc: unknown`, not part of it — InMemoryStore is also used to hold non-library docs
 * like the prove-it-gate's `signing` rows and work-event verdicts.)
 */
function parityFixtureDoc(id: string, body: string): LibraryAsset {
  return {
    id,
    category: "template",
    title: `parity ${id}`,
    description: "a parity-suite fixture",
    body,
    references: [],
  };
}

/**
 * A REUSABLE behavioural-parity suite (node:test). Registers the 5 Store contracts so any
 * implementation — InMemoryStore here, Postgres in packages/store — can be held to the same bar.
 *
 * EXPORTED on purpose: packages/store calls `storeParitySuite('PostgresStore', () => ...)`.
 */
export function storeParitySuite(
  name: string,
  makeStore: () => Store | Promise<Store>,
): void {
  test(`${name} parity: upsertDoc replaces on same id and bumps updatedAt`, async () => {
    const store = await makeStore();
    const first = await store.upsertDoc({
      id: "u1",
      kind: "template",
      doc: parityFixtureDoc("u1", "first"),
    });
    // Force a clock tick so updatedAt is observably newer.
    await new Promise((r) => setTimeout(r, 2));
    const second = await store.upsertDoc({
      id: "u1",
      kind: "template",
      doc: parityFixtureDoc("u1", "second"),
    });
    const current = await store.getDoc("u1");
    assert.equal(current?.doc && (current.doc as { body: string }).body, "second");
    assert.equal(second.createdAt, first.createdAt, "createdAt preserved on replace");
    assert.ok(
      second.updatedAt >= first.updatedAt,
      "updatedAt is bumped (>=) on replace",
    );
    const all = await store.queryDocs();
    assert.equal(all.length, 1, "same id replaces, does not duplicate");
  });

  test(`${name} parity: appendEvent preserves insertion order with increasing seq`, async () => {
    const store = await makeStore();
    await store.appendEvent({ id: "a", kind: "k", type: "created", doc: {} });
    await store.appendEvent({ id: "b", kind: "k", type: "created", doc: {} });
    await store.appendEvent({ id: "c", kind: "k", type: "updated", doc: {} });
    const events = await store.readEvents();
    assert.deepEqual(
      events.map((e) => e.id),
      ["a", "b", "c"],
      "insertion order preserved",
    );
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const cur = events[i];
      assert.ok(prev && cur && cur.seq > prev.seq, "seq strictly increasing");
    }
  });

  test(`${name} parity: getDoc(absent) returns null (not throw)`, async () => {
    const store = await makeStore();
    const got = await store.getDoc("does-not-exist");
    assert.equal(got, null);
  });

  test(`${name} parity: queryDocs on empty store returns [] (not throw)`, async () => {
    const store = await makeStore();
    const docs = await store.queryDocs();
    assert.deepEqual(docs, []);
    const filtered = await store.queryDocs({ kind: "anything" });
    assert.deepEqual(filtered, []);
  });

  test(`${name} parity: deleteDoc is idempotent (true then false)`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "d1", kind: "template", doc: parityFixtureDoc("d1", "to delete") });
    assert.equal(await store.deleteDoc("d1"), true, "first delete reports true");
    assert.equal(await store.deleteDoc("d1"), false, "second delete reports false");
  });
}

/**
 * A REUSABLE behavioural-parity suite (node:test) for any {@link ChangeStore} (ADR-0016 §2): the same
 * bar InMemoryStore meets here and the parallel session's PgChangeStore must meet. EXPORTED on purpose.
 */
export function changeStoreParitySuite(
  name: string,
  makeStore: () => (Store & ChangeStore) | Promise<Store & ChangeStore>,
): void {
  const change = (unitId: string, why?: string): ChangeEvent => ({
    unitId,
    hashBefore: "aaaa",
    hashAfter: "bbbb",
    ...(why !== undefined ? { description: why } : {}),
    author: "tester",
    at: "2026-06-16T00:00:00.000Z",
  });

  test(`${name} change parity: empty store returns [] (never throws)`, async () => {
    const store = await makeStore();
    assert.deepEqual(await store.readChangeEvents(), []);
    assert.deepEqual(await store.readChangeEvents({ unitId: "nope" }), []);
  });

  test(`${name} change parity: round-trip — event stored and read back unchanged`, async () => {
    const store = await makeStore();
    const c = change("unit-1");
    await store.appendChangeEvent(c);
    const result = await store.readChangeEvents();
    assert.deepEqual(result, [c]);
  });

  test(`${name} change parity: filter by unitId returns only matching events`, async () => {
    const store = await makeStore();
    const ca = change("a", "fix a");
    const cb = change("b", "fix b");
    await store.appendChangeEvent(ca);
    await store.appendChangeEvent(cb);
    assert.deepEqual(await store.readChangeEvents({ unitId: "a" }), [ca]);
    assert.deepEqual(await store.readChangeEvents({ unitId: "b" }), [cb]);
    const all = await store.readChangeEvents();
    assert.equal(all.length, 2);
  });

  test(`${name} change parity: insertion order preserved`, async () => {
    const store = await makeStore();
    const c1 = change("u", "first");
    const c2 = change("u", "second");
    const c3 = change("u", "third");
    await store.appendChangeEvent(c1);
    await store.appendChangeEvent(c2);
    await store.appendChangeEvent(c3);
    assert.deepEqual(await store.readChangeEvents({ unitId: "u" }), [c1, c2, c3]);
  });
}
