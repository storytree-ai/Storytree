import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "./store.js";
import { storeParitySuite } from "./store-parity.js";

// The `validateLibraryDoc` write-boundary tests moved WITH the schema to
// `@storytree/library` (ADR-0068 step 4): see `packages/library/src/library-doc.test.ts`.
// This file now tests ONLY the base Store seam (InMemoryStore + the reusable parity suite).

// Run the reusable behavioural-parity suite against the in-memory implementation.
storeParitySuite("InMemoryStore", () => new InMemoryStore());

test("InMemoryStore: upsertDoc appends an event AND updates the projection", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "x", kind: "note", doc: { v: 1 }, actor: "alice" });
  await store.upsertDoc({ id: "x", kind: "note", doc: { v: 2 }, actor: "bob" });

  const events = await store.readEvents({ id: "x" });
  assert.deepEqual(
    events.map((e) => e.type),
    ["created", "updated"],
    "first upsert is created, second is updated",
  );
  assert.deepEqual(events.map((e) => e.actor), ["alice", "bob"]);

  const doc = await store.getDoc("x");
  assert.equal((doc?.doc as { v: number }).v, 2);
});

test("InMemoryStore: deleteDoc appends a deleted event", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "y", kind: "note", doc: {} });
  await store.deleteDoc("y");
  const events = await store.readEvents({ id: "y" });
  assert.deepEqual(events.map((e) => e.type), ["created", "deleted"]);
  assert.equal(await store.getDoc("y"), null);
});

test("InMemoryStore: queryDocs filters by kind", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "a", kind: "note", doc: {} });
  await store.upsertDoc({ id: "b", kind: "task", doc: {} });
  const notes = await store.queryDocs({ kind: "note" });
  assert.deepEqual(notes.map((d) => d.id), ["a"]);
});
