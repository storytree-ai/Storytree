import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "./store.js";
import { snapshotReads } from "./snapshot-store.js";

/** An InMemoryStore that counts the reads actually reaching it. */
function counting(): { store: InMemoryStore; reads: () => number } {
  const inner = new InMemoryStore();
  let reads = 0;
  const original = { getDoc: inner.getDoc.bind(inner), queryDocs: inner.queryDocs.bind(inner) };
  inner.getDoc = async (id) => {
    reads += 1;
    return original.getDoc(id);
  };
  inner.queryDocs = async (filter) => {
    reads += 1;
    return original.queryDocs(filter);
  };
  return { store: inner, reads: () => reads };
}

async function seeded(): Promise<{ store: InMemoryStore; reads: () => number }> {
  const c = counting();
  for (const id of ["a", "b", "c"]) {
    await c.store.upsertDoc({ id, kind: "principle", doc: { id } });
  }
  return c;
}

test("a repeated getDoc reaches the underlying store once", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  for (let i = 0; i < 20; i += 1) assert.equal((await snap.getDoc("a"))?.id, "a");

  assert.equal(reads() - before, 1, "20 reads of one id must cost one round trip");
  assert.equal(snap.stats.forwarded, 1);
  assert.equal(snap.stats.served, 19);
});

test("an ABSENT id is cached too — a dangling ref is not re-asked", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  for (let i = 0; i < 5; i += 1) assert.equal(await snap.getDoc("missing"), null);

  assert.equal(reads() - before, 1, "a null answer is an answer; re-asking is the amplification");
});

test("queryDocs seeds the per-id cache, so listing a kind then reading its members is free", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  const listed = await snap.queryDocs({ kind: "principle" });
  assert.equal(listed.length, 3);
  for (const row of listed) assert.equal((await snap.getDoc(row.id))?.id, row.id);

  assert.equal(reads() - before, 1, "the list is the only round trip; its members come with it");
  assert.equal(snap.stats.docs, 3);
});

test("a repeated queryDocs of the same kind reaches the store once, and callers cannot mutate it", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  const first = await snap.queryDocs({ kind: "principle" });
  first.length = 0;
  const second = await snap.queryDocs({ kind: "principle" });

  assert.equal(reads() - before, 1);
  assert.equal(second.length, 3, "one caller emptying its copy must not empty the snapshot");
});

test("an unfiltered query and a kind-filtered query are distinct keys", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  await snap.queryDocs();
  await snap.queryDocs({ kind: "principle" });

  assert.equal(reads() - before, 2, "'all docs' and 'docs of kind X' are different questions");
});

test("no real kind can collide with the unfiltered-query key", async () => {
  // The keys are JSON-encoded precisely so there is no magic sentinel a kind could impersonate.
  // An earlier draft used a literal control character for "no filter", which also made the source
  // file read as binary to git — hence both the encoding and this test.
  const { store, reads } = await seeded();
  await store.upsertDoc({ id: "odd", kind: "null", doc: { id: "odd" } });
  const snap = snapshotReads(store);
  const before = reads();

  const unfiltered = await snap.queryDocs();
  const nullKind = await snap.queryDocs({ kind: "null" });

  assert.equal(reads() - before, 2, "a kind named 'null' must not answer the unfiltered query");
  assert.equal(unfiltered.length, 4);
  assert.deepEqual(
    nullKind.map((r) => r.id),
    ["odd"],
  );
});

test("concurrent reads of one id share a single in-flight round trip", async () => {
  const { store, reads } = await seeded();
  const snap = snapshotReads(store);
  const before = reads();

  const all = await Promise.all(Array.from({ length: 10 }, () => snap.getDoc("b")));

  assert.equal(reads() - before, 1, "a parallel walk must not stampede the store");
  for (const got of all) assert.equal(got?.id, "b");
});

test("a FAILED read is evicted, not cached — a transient failure stays transient", async () => {
  const { store } = await seeded();
  let fail = true;
  store.getDoc = async (id) => {
    if (fail) throw new Error("transient");
    return { id, kind: "principle", doc: { id }, createdAt: "t", updatedAt: "t" };
  };
  const snap = snapshotReads(store);

  await assert.rejects(() => snap.getDoc("a"), /transient/);
  fail = false;
  assert.equal((await snap.getDoc("a"))?.id, "a", "the retry must reach the store, not the failure");
});

test("every WRITE verb is refused — a snapshot cannot serve one honestly", async () => {
  const { store } = await seeded();
  const snap = snapshotReads(store);

  await assert.rejects(() => snap.upsertDoc({ id: "x", kind: "principle", doc: {} }), /READ-ONLY/);
  await assert.rejects(() => snap.deleteDoc("a"), /READ-ONLY/);
  await assert.rejects(
    () => snap.appendEvent({ id: "a", kind: "principle", type: "updated", doc: {} }),
    /READ-ONLY/,
  );
});

test("the snapshot does not observe a write that lands mid-pass", async () => {
  const { store } = await seeded();
  const snap = snapshotReads(store);

  const firstView = await snap.getDoc("a");
  await store.upsertDoc({ id: "a", kind: "principle", doc: { id: "a", changed: true } });
  const secondView = await snap.getDoc("a");

  assert.deepEqual(secondView, firstView, "one instant, by construction — that is the point");
  assert.deepEqual((await store.getDoc("a"))?.doc, { id: "a", changed: true });
});
