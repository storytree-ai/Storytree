import test from "node:test";
import assert from "node:assert/strict";
import type { ChangeEvent } from "@storytree/proof-protocol";
import type { Store, ChangeStore } from "./store.js";

/**
 * The minimal valid-library-doc shape this parity suite feeds to `upsertDoc`. Structurally a
 * `LibraryAsset` (category: 'template'), but typed LOCALLY here: the full `LibraryAsset` schema
 * MOVED to `@storytree/library` (ADR-0068 step 4), and the narrow `Store` seam must NOT depend on
 * the library organism (that would re-introduce a core→library edge). The seam's contract is
 * `doc: unknown`; this local type just keeps the fixture honest.
 */
interface ParityFixtureDoc {
  id: string;
  category: "template";
  title: string;
  description: string;
  body: string;
  references: readonly string[];
}

/**
 * The REUSABLE behavioural-parity suites (node:test) for the {@link Store} and {@link ChangeStore}
 * seams. Split out of `store.ts` (ADR-0068 step 0) so the pure store seam carries NO `node:test`
 * import; the suites live here and are exported from `@storytree/storage-protocol` via the `./parity` subpath.
 *
 * EXPORTED on purpose: packages/store calls `storeParitySuite('PostgresStore', () => ...)` and
 * `changeStoreParitySuite('PgChangeStore', () => ...)` to prove behavioural equivalence.
 */

/**
 * A minimal VALID library doc (a {@link LibraryAsset}) for the parity fixtures. The Postgres
 * {@link Store} validates every `upsertDoc` doc at the ADR-0017 write boundary (`upcastAndValidate`),
 * so the SHARED parity suite must feed docs BOTH implementations accept: the in-memory reference
 * stores any `doc: unknown` raw, but Postgres rejects a non-LibraryDoc (e.g. the old `{ v: 1 }`
 * fixture, which only InMemoryStore ever accepted). `body` is the observable payload the replace
 * test asserts on. (This suite proves the GENERIC store behaviours — replace, timestamps, query,
 * delete, event order — on valid input; it is NOT a validation-parity suite. Write-boundary
 * validation is a library-store concern layered ON TOP of the narrow seam, whose contract is
 * `doc: unknown`, not part of it — InMemoryStore is also used to hold non-library docs like the
 * prove-it-gate's `signing` rows and work-event verdicts.)
 */
function parityFixtureDoc(id: string, body: string): ParityFixtureDoc {
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

  test(`${name} parity: deleteDoc records a retire rationale on the terminal event (ADR-0065)`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "r1", kind: "template", doc: parityFixtureDoc("r1", "overtaken") });
    assert.equal(
      await store.deleteDoc("r1", {
        actor: "librarian-curator",
        reason: "overtaken by ADR-9999",
        supersededBy: "doc:decisions/9999-x.md",
      }),
      true,
    );
    // The row is gone from the projection, but the WHY is durable on the deleted event.
    assert.equal(await store.getDoc("r1"), null, "retired row dropped from the projection");
    const deleted = (await store.readEvents({ id: "r1" })).find((e) => e.type === "deleted");
    assert.ok(deleted, "a deleted event was appended");
    assert.equal(deleted?.actor, "librarian-curator", "retire actor recorded");
    const body = deleted?.doc as { retiredReason?: string; supersededBy?: string };
    assert.equal(body.retiredReason, "overtaken by ADR-9999", "retiredReason folded into the event doc");
    assert.equal(body.supersededBy, "doc:decisions/9999-x.md", "supersededBy folded in");
  });
}

/**
 * A REUSABLE behavioural-parity suite (node:test) for any {@link ChangeStore} (ADR-0016 §2): the same
 * bar InMemoryStore meets here and packages/store's PgChangeStore must meet. EXPORTED on purpose —
 * `change-event-store.test.ts` runs it for InMemoryStore and `pg-change-store.test.ts` runs it for
 * PgChangeStore (over a fake pg client offline, the real pool when live-gated).
 *
 * Takes a bare {@link ChangeStore} (not `Store & ChangeStore`): the suite exercises ONLY the change
 * log (`appendChangeEvent`/`readChangeEvents`), so a backend that implements `ChangeStore` alone —
 * like PgChangeStore, the change log's dedicated Postgres home — can be held to the same bar without
 * also being a full doc/event {@link Store}.
 */
export function changeStoreParitySuite(
  name: string,
  makeStore: () => ChangeStore | Promise<ChangeStore>,
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
