import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "./store.js";
import { storeParitySuite } from "./store-parity.js";
import { validateLibraryDoc } from "./library-doc.js";

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

test("validateLibraryDoc accepts a well-formed knowledge doc", () => {
  const doc = {
    kind: "principle",
    id: "p1",
    title: "Less is more",
    description: "one line",
    statement: "Prefer the smaller surface.",
    why: "Smaller surfaces are easier to prove.",
    howToApply: "Ask: can this be removed?",
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(doc);
  assert.ok("kind" in parsed && parsed.kind === "principle");
});

test("validateLibraryDoc accepts a generated template artifact", () => {
  const tpl = {
    id: "template-principle",
    category: "template",
    title: "Template · principle",
    description: "the shape a principle conforms to",
    body: "**The principle.** _..._",
    references: [],
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(tpl);
  assert.ok("category" in parsed && parsed.category === "template");
});

test("validateLibraryDoc accepts a general edited asset (any category + body)", () => {
  // The studio edits a structured unit and persists it in rendered form: a body-bearing asset
  // whose category is NOT 'template' (here a 'definition'). The generalised boundary accepts it.
  const asset = {
    id: "owned-loop",
    category: "definition",
    title: "Owned loop",
    description: "the agent loop we build and own",
    body: "**In one line.** The loop we own end to end.\n\n## What it is\n\nOurs.",
    references: ["doc:decisions/0019-...md"],
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(asset);
  assert.ok("category" in parsed && parsed.category === "definition");
  assert.ok("body" in parsed && typeof parsed.body === "string");
});

test("validateLibraryDoc throws on malformed input (loud write boundary)", () => {
  assert.throws(() => validateLibraryDoc({ kind: "principle", id: "p1" }));
  assert.throws(() => validateLibraryDoc({ kind: "not-a-kind" }));
  assert.throws(() => validateLibraryDoc({ category: "template", id: "t1" })); // missing body/title
});
