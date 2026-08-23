import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { libraryRelated, librarySearch, toSearchDoc } from "./library-search.js";

/**
 * The CLI half of `library search` / `library related` (`decision-read-measurement-arc` inc 16).
 *
 * The RANKING is proved in `@storytree/library`'s `search.test.ts` against a literal fixture. What
 * is proved HERE is the part that only exists at this boundary: the adapter from a `StoredDoc` onto
 * the ranker's structural view — in particular that a decision's NUMBER-valued edges are rendered
 * into the same pointer spelling every string-valued field uses, which is the one place the two
 * storage shapes meet — and the refusals.
 */

function row(id: string, kind: string, doc: Record<string, unknown>): {
  id: string;
  kind: string;
  doc: unknown;
  createdAt: string;
  updatedAt: string;
} {
  return { id, kind, doc, createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z" };
}

async function storeWith(rows: ReadonlyArray<ReturnType<typeof row>>): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const r of rows) await store.upsertDoc({ id: r.id, kind: r.kind, doc: r.doc });
  return store;
}

const CORPUS = [
  row("adr-0139", "adr", {
    title: "Consolidating the decision log",
    description: "Every accepted decision must be true in full.",
    body: "An amends edge means reading the target alone is no longer sufficient.",
    amends: [37],
    supersedes: [86],
  }),
  row("adr-0037", "adr", {
    title: "Decision frontmatter carries structured state",
    body: "Status, decided, supersedes and amends live as typed fields on the decision.",
  }),
  row("adr-0419", "adr", {
    title: "Support edges move to dependsOn by deprecation",
    body: "Plain support is authored as dependsOn; the amends edge is reserved for a read obligation.",
    dependsOn: ["asset:adr-0402"],
  }),
  row("adr-0402", "adr", {
    title: "Authored dependency edges are named dependsOn",
    body: "The support edge every kind carries. Renaming standsOn was migration seven.",
  }),
  row("merge-ceremony", "process", {
    title: "Merge ceremony",
    description: "How a green unit reaches main.",
    body: "Commit, push, open a non-draft pull request, and let continuous integration merge it.",
  }),
];

// ---------------------------------------------------------------------------
// The adapter — where the two storage shapes meet
// ---------------------------------------------------------------------------

test("a decision's NUMBER-valued amends/supersedes render into the asset: pointer spelling", () => {
  const doc = toSearchDoc(CORPUS[0] as ReturnType<typeof row>);
  assert.deepEqual(doc.refs, [
    { field: "amends", ref: "asset:adr-0037" },
    { field: "supersedes", ref: "asset:adr-0086" },
  ]);
});

test("string-valued pointer fields are carried with the field that authored them", () => {
  const doc = toSearchDoc(CORPUS[2] as ReturnType<typeof row>);
  assert.deepEqual(doc.refs, [{ field: "dependsOn", ref: "asset:adr-0402" }]);
});

test("a row with no pointers and no body adapts without inventing fields", () => {
  const doc = toSearchDoc(row("bare", "note", {}));
  assert.deepEqual(doc, { id: "bare", kind: "note", title: undefined, description: undefined, body: undefined, refs: [] });
});

test("a malformed doc payload adapts to an empty artifact rather than throwing", () => {
  const doc = toSearchDoc(row("weird", "note", null as unknown as Record<string, unknown>));
  assert.equal(doc.id, "weird");
  assert.deepEqual(doc.refs, []);
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

test("library search refuses an empty query rather than ranking everything", async () => {
  const store = await storeWith(CORPUS);
  const env = await librarySearch(store, undefined, { kind: undefined, limit: undefined });
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a query/);
});

test("library search reports a real zero WITH its denominator", async () => {
  const store = await storeWith(CORPUS);
  const env = await librarySearch(store, "kumquat", { kind: undefined, limit: undefined });
  assert.equal(env.ok, true);
  assert.match(env.body, /^0 of 5 artifacts/m);
  assert.match(env.body, /real zero/);
});

test("library search finds a body-only match and names the terms it used", async () => {
  const store = await storeWith(CORPUS);
  const env = await librarySearch(store, "pull request", { kind: undefined, limit: undefined });
  assert.equal(env.ok, true);
  assert.match(env.body, /merge-ceremony/);
  assert.match(env.body, /`pull` `request`/);
});

test("--kind narrows both the ranking and the reported denominator", async () => {
  const store = await storeWith(CORPUS);
  const env = await librarySearch(store, "decision", { kind: "adr", limit: undefined });
  assert.match(env.body, / of 4 adr artifacts/);
  assert.ok(!env.body.includes("merge-ceremony"));
});

test("--limit must be a positive integer", async () => {
  const store = await storeWith(CORPUS);
  const env = await librarySearch(store, "decision", { kind: undefined, limit: "0" });
  assert.equal(env.ok, false);
  assert.match(env.body, /positive integer/);
});

// ---------------------------------------------------------------------------
// related — the verb this increment exists for
// ---------------------------------------------------------------------------

test("library related refuses an id the corpus does not hold, and says how many it read", async () => {
  const store = await storeWith(CORPUS);
  const env = await libraryRelated(store, "adr-9999", { kind: undefined, limit: undefined, unlinked: false });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "adr-9999" in the corpus \(5 read\)/);
});

test("related marks an amended decision LINKED, naming the field that joined them", async () => {
  const store = await storeWith(CORPUS);
  const env = await libraryRelated(store, "adr-0139", { kind: undefined, limit: undefined, unlinked: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /adr-0037.*← linked via amends/);
});

test("--unlinked hides the linked neighbours AND still counts them", async () => {
  const store = await storeWith(CORPUS);
  const env = await libraryRelated(store, "adr-0139", { kind: undefined, limit: undefined, unlinked: true });
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("← linked via"), "a linked neighbour must not be printed under --unlinked");
  assert.match(env.body, /further neighbour/, "the hidden count must still be reported");
});

test("an artifact whose neighbours are ALL linked says so rather than printing an empty list", async () => {
  // Two artifacts, one edge between them: the only possible neighbour is already linked.
  const store = await storeWith([
    row("a", "adr", { title: "Amends and annotation", body: "amends annotation obligation", dependsOn: ["asset:b"] }),
    row("b", "adr", { title: "Annotation obligation", body: "amends annotation obligation" }),
  ]);
  const env = await libraryRelated(store, "a", { kind: undefined, limit: undefined, unlinked: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /every ranked neighbour is ALREADY linked \(1 of them\)/);
});
