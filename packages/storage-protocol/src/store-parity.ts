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
  test(`${name} parity: upsert-replaces-and-bumps — upsertDoc replaces on same id and bumps updatedAt`, async () => {
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

  test(`${name} parity: patch-writes-only-named-fields — patchDoc writes ONLY the named fields, so a sibling's edit survives (ADR-0352)`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "p1", kind: "template", doc: parityFixtureDoc("p1", "original") });

    // The lost-update shape, in the order it actually happens: two sessions each read the doc,
    // THEN each writes. Session A rewrites `body`; session B retitles. Neither names the other's
    // field. Under `upsertDoc` B's write carries B's STALE `body` and silently reverts A.
    await store.patchDoc({ id: "p1", fields: { body: "A's rewrite" } });
    await store.patchDoc({ id: "p1", fields: { title: "B's title" } });

    const current = await store.getDoc("p1");
    const doc = current?.doc as { body: string; title: string; description: string };
    assert.equal(doc.body, "A's rewrite", "the field A patched survived B's later patch");
    assert.equal(doc.title, "B's title", "the field B patched was written");
    assert.equal(doc.description, "a parity-suite fixture", "an untouched field is left alone");
  });

  test(`${name} parity: patchDoc merges onto CURRENT state, not onto what the caller read`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "p2", kind: "template", doc: parityFixtureDoc("p2", "original") });

    // A caller that read early holds a stale doc. Its patch must still land on top of the write
    // that happened in between — this is the assertion a real backend needs a row lock to keep.
    const staleRead = await store.getDoc("p2");
    assert.ok(staleRead, "precondition: the doc exists");
    await store.upsertDoc({ id: "p2", kind: "template", doc: parityFixtureDoc("p2", "landed in between") });
    await store.patchDoc({ id: "p2", fields: { title: "patched late" } });

    const doc = (await store.getDoc("p2"))?.doc as { body: string; title: string };
    assert.equal(doc.body, "landed in between", "the in-between write was NOT reverted by the late patch");
    assert.equal(doc.title, "patched late");
  });

  test(`${name} parity: patchDoc on an absent id returns null and creates nothing`, async () => {
    const store = await makeStore();
    assert.equal(await store.patchDoc({ id: "ghost", fields: { title: "x" } }), null);
    assert.equal(await store.getDoc("ghost"), null, "patch never creates");
  });

  test(`${name} parity: append-event-monotonic-seq — appendEvent preserves insertion order with increasing seq`, async () => {
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

  test(`${name} parity: getdoc-absent-null — getDoc(absent) returns null (not throw)`, async () => {
    const store = await makeStore();
    const got = await store.getDoc("does-not-exist");
    assert.equal(got, null);
  });

  test(`${name} parity: querydocs-empty-array — queryDocs on empty store returns [] (not throw)`, async () => {
    const store = await makeStore();
    const docs = await store.queryDocs();
    assert.deepEqual(docs, []);
    const filtered = await store.queryDocs({ kind: "anything" });
    assert.deepEqual(filtered, []);
  });

  test(`${name} parity: deletedoc-idempotent — deleteDoc is idempotent (true then false)`, async () => {
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

/**
 * The parity contracts an IN-PROCESS store can be held to but a REMOTE one cannot: `patchDoc`'s
 * `validate` hook is a closure, and a closure does not cross an HTTP wire (`HttpStore.patchDoc`
 * refuses one loudly rather than dropping it, which would let a patch skip migrate-on-write).
 *
 * Run this ALONGSIDE `storeParitySuite` for every local backend — `InMemoryStore` and, behind the
 * live-DB gate, `PgLibraryStore`. Keeping it separate is what lets the shared suite stay honestly
 * uniform across all three backends instead of carrying a contract one of them can never meet.
 */
export function localStoreParitySuite(name: string, makeStore: () => Store | Promise<Store>): void {
  test(`${name} local parity: patch-honours-the-write-boundary — patchDoc persists what validate() returns (the upcast boundary)`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "v1", kind: "template", doc: parityFixtureDoc("v1", "original") });
    // What the validator RETURNS is what lands, mirroring upsertDoc's persist-the-upcast-output
    // boundary — so a field-scoped write cannot slip past migrate-on-write (ADR-0352).
    const saved = await store.patchDoc({
      id: "v1",
      fields: { body: "raw" },
      validate: (merged) => ({ ...(merged as Record<string, unknown>), body: "upcast" }),
    });
    assert.equal((saved?.doc as { body: string }).body, "upcast", "validate()'s RETURN is persisted");
    const reread = (await store.getDoc("v1"))?.doc as { body: string };
    assert.equal(reread.body, "upcast", "and it is what the projection holds");
  });

  test(`${name} local parity: patch-honours-the-write-boundary — a throwing validate() refuses the write and leaves the doc untouched`, async () => {
    const store = await makeStore();
    await store.upsertDoc({ id: "v2", kind: "template", doc: parityFixtureDoc("v2", "keep me") });
    await assert.rejects(
      () =>
        store.patchDoc({
          id: "v2",
          fields: { body: "invalid" },
          validate: () => {
            throw new Error("schema says no");
          },
        }),
      /schema says no/,
      "the validator's refusal propagates",
    );
    const after = (await store.getDoc("v2"))?.doc as { body: string };
    assert.equal(after.body, "keep me", "a refused patch wrote nothing");
  });
}
