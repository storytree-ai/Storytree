import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoredDoc } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import { findInboundRefs, referencedAssetIds, referencedAssetSites } from "./retire.js";

/** A minimal stored doc — the reader reads `title`/`kind` and scans the body; it re-validates nothing. */
function doc(id: string, kind: string, body: Record<string, unknown> = {}): StoredDoc {
  return {
    id,
    kind,
    doc: { id, kind, title: `T ${id}`, ...body },
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as StoredDoc;
}

async function seed(docs: StoredDoc[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const d of docs) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  return store;
}

// --- the walk, now carrying its own provenance -------------------------------------------------

test("referencedAssetSites names the FIELD PATH of every edge, at any depth", () => {
  // The field is the point: a caller planning a repoint needs to know whether it is editing a
  // `dependsOn` array, an increment's `arcRef`, or residue in a retired `references` list.
  const sites = referencedAssetSites({
    dependsOn: ["asset:alpha", "doc:decisions/0001-x.md"], // the authored dependency edge
    context: ["asset:beta"], // an agent refList field
    arcRef: "asset:epsilon", // the single containment pointer
    stepRefs: [{ step: "one", refs: ["asset:zeta"] }], // an agent step's outbound edges
    branchEdges: [{ ref: "asset:eta", label: "next" }], // a process node's edges
    references: ["asset:theta"], // residue of the field ADR-0477 retired
  });
  assert.deepEqual(sites.map((s) => `${s.id} @ ${s.path}`).sort(), [
    "alpha @ dependsOn[0]",
    "beta @ context[0]",
    "epsilon @ arcRef",
    "eta @ branchEdges[0].ref",
    "theta @ references[0]",
    "zeta @ stepRefs[0].refs[0]",
  ]);
});

test("a prose `asset:` token is NOT a site (the ADR-0477 narrowing, fenced)", () => {
  // 2026-08-03: an inline `asset:<id>` inside one 6433-character `routeReason` counted as an edge
  // and hard-refused the retire of eight proposals. Widening back to substring matching re-opens it.
  const sites = referencedAssetSites({
    routeReason: "parked on asset:some-arc because the remedy is deferred capability work",
    statement: "as noted in asset:delta this matters",
    dependsOn: ["asset:alpha"],
  });
  assert.deepEqual(
    sites.map((s) => s.id),
    ["alpha"],
    "only a value that is WHOLLY a ref is an edge",
  );
});

test("referencedAssetIds is the id-projection of the SAME walk (one implementation, not two)", () => {
  // The regression fence for ADR-0498's "share the walk, do not copy it": if a later edit re-forks
  // `referencedAssetIds` into its own traversal, the two drift here rather than in production.
  const body = { dependsOn: ["asset:a"], rules: ["asset:b"], prose: "see asset:c" };
  assert.deepEqual(
    [...referencedAssetIds(body)].sort(),
    [...new Set(referencedAssetSites(body).map((s) => s.id))].sort(),
  );
  assert.deepEqual([...referencedAssetIds(body)].sort(), ["a", "b"]);
});

test("findInboundRefs excludes self, sorts by id, and keeps EVERY site on a referrer", () => {
  const docs = [
    doc("target", "principle"),
    doc("z", "definition", { references: ["asset:target"] }),
    doc("a", "agent", { rules: ["asset:target"], context: ["asset:target"] }), // two sites, one doc
    doc("unrelated", "pattern", { references: ["asset:other"] }),
    doc("self", "principle", { dependsOn: ["asset:self"] }), // nothing depends on itself
    doc("just-talks", "friction", { routeReason: "superseded by asset:target's remedy" }), // prose
  ];
  const refs = findInboundRefs("target", docs);
  assert.deepEqual(
    refs.map((r) => r.doc.id),
    ["a", "z"],
  );
  // Traversal order, which is document order — the useful order for a reader planning an edit.
  assert.deepEqual(refs[0]?.paths, ["rules[0]", "context[0]"]);
  assert.deepEqual(refs[1]?.paths, ["references[0]"]);
});

// --- the 2026-09-01 defect, reproduced -----------------------------------------------------------

/**
 * The measured case behind ADR-0498. `tree focus adr-0028` reported
 * `inbound (what stands on this): (none yet)`; `retire adr-0028` then REFUSED, naming adr-0018.
 *
 * The edge lives in adr-0018's `references[…]` — data residue from the field ADR-0477 retired — and
 * adr-0018 carries no `dependsOn` at all, so the authored-edge view could never have seen it.
 */
const REPRO: StoredDoc[] = [
  doc("adr-0028", "adr"),
  doc("adr-0018", "adr", { references: ["asset:adr-0017", "asset:adr-0028"] }),
];

test("the reader sees the edge the authored-edge view cannot (the 2026-09-01 case)", async () => {
  const store = await seed(REPRO);
  const env = await run(["library", "inbound", "adr-0028"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /adr-0018/);
  assert.match(env.body, /references\[1\]/, "and names the field the edge sits in");
});

test("the reader and the retire wall name the SAME dependents", async () => {
  // The whole point of ADR-0498 D1: no reader of this graph may answer CLEAR where the wall
  // answers BLOCKED. Fencing both instruments together is what stops them diverging again.
  const store = await seed(REPRO);
  const reader = await run(["library", "inbound", "adr-0028"], { store });
  const wall = await run(["library", "artifact", "retire", "adr-0028", "--reason", "x"], {
    store,
    writable: true,
  });
  assert.equal(wall.ok, false, "the wall refuses — the state the reader must not call clear");
  assert.match(wall.body, /adr-0018/);
  assert.match(reader.body, /adr-0018/, "the reader must not answer CLEAR where the wall says BLOCKED");
});

test("tree focus no longer answers the wall's question with the authored edge alone", async () => {
  const store = await seed(REPRO);
  const env = await run(["library", "tree", "focus", "adr-0028"], { store });
  assert.equal(env.ok, true);
  // The authored-edge view stays reachable — it has legitimate uses and is what tree focus is FOR.
  assert.match(env.body, /authored depends_on/);
  // ...but it no longer renders alone: the wider population is on the same page, so an empty
  // authored block can never again read as "nothing stands on this".
  assert.match(env.body, /adr-0018/);
  assert.match(env.body, /references\[1\]/);
});

// --- the reader as a verb ------------------------------------------------------------------------

test("the reader names each referrer's field path, across every field shape", async () => {
  const store = await seed([
    doc("target", "pattern"),
    doc("an-agent", "agent", { rules: ["asset:target"], stepRefs: [{ step: "s", refs: ["asset:target"] }] }),
    doc("an-increment", "increment", { arcRef: "asset:target" }),
    doc("a-decision", "adr", { dependsOn: ["asset:target"] }),
  ]);
  const env = await run(["library", "inbound", "target"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /a-decision/);
  assert.match(env.body, /dependsOn\[0\]/);
  assert.match(env.body, /an-agent/);
  assert.match(env.body, /rules\[0\]/);
  assert.match(env.body, /stepRefs\[0\]\.refs\[0\]/);
  assert.match(env.body, /an-increment/);
  assert.match(env.body, /arcRef/);
});

test("on a DECISION with inbound refs, the reader names the exit rather than only the blocker", async () => {
  // ADR-0497 D2 — retirement is not the route for any decision with an inbound reference, and the
  // wall is right to refuse. The reader's customer is a session planning that exit, so it says so.
  const store = await seed(REPRO);
  const env = await run(["library", "inbound", "adr-0028"], { store });
  assert.match(env.body, /CONSOLIDATING SUPERSESSION/);
});

test("that exit line is decision-scoped — it is not general advice for every kind", async () => {
  const store = await seed([
    doc("a-principle", "principle"),
    doc("cites-it", "definition", { dependsOn: ["asset:a-principle"] }),
  ]);
  const env = await run(["library", "inbound", "a-principle"], { store });
  assert.match(env.body, /cites-it/);
  assert.doesNotMatch(env.body, /CONSOLIDATING SUPERSESSION/, "supersession is the adr tier's exit");
});

test("the reader reports how much of the population the authored-edge view would have shown", async () => {
  // The divergence is made visible AT the reader: 1 of 2 here, and 0 of 1 in the REPRO case.
  const store = await seed([
    doc("target", "pattern"),
    doc("declares-it", "adr", { dependsOn: ["asset:target"] }),
    doc("residue", "adr", { references: ["asset:target"] }),
  ]);
  const env = await run(["library", "inbound", "target"], { store });
  assert.match(env.body, /1 of 2/);
});

test("a prose `asset:` token is an edge to NEITHER instrument (ADR-0477, fenced end-to-end)", async () => {
  const store = await seed([
    doc("target", "principle"),
    doc("talks-about-it", "friction", {
      routeReason: "a long adjudication record that names asset:target in a sentence",
    }),
  ]);
  const reader = await run(["library", "inbound", "target"], { store });
  assert.equal(reader.ok, true);
  assert.doesNotMatch(reader.body, /talks-about-it/, "a name in a paragraph was never an edge");
  const wall = await run(["library", "artifact", "retire", "target", "--reason", "x"], {
    store,
    writable: true,
  });
  assert.equal(wall.ok, true, "and the wall agrees — prose does not block a retire");
});

test("a genuinely clear artifact says so, and names the population it checked", async () => {
  const store = await seed([doc("lonely", "principle"), doc("other", "principle")]);
  const env = await run(["library", "inbound", "lonely"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing references/);
  // An honest CLEAR: the same population the wall enforces, so this one is safe to act on.
  assert.match(env.body, /retire/);
});

test("inbound on an absent id is guidance, not a throw", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "inbound", "ghost"], { store });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost"/);
});

test("inbound with no id prints its help", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "inbound"], { store });
  assert.match(env.body, /storytree library inbound <id>/);
});

test("an EMPTY id prints the help too, rather than searching for an artifact named ''", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "inbound", ""], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree library inbound <id>/);
  assert.doesNotMatch(env.body, /no artifact/, "an empty id is a missing id, not a missing artifact");
});

test("`--help` WITH an id prints the help rather than the artifact's inbound refs", async () => {
  const store = await seed(REPRO);
  const env = await run(["library", "inbound", "adr-0028", "--help"], { store });
  assert.match(env.body, /storytree library inbound <id>/);
  // NOT `/via references/` — the help quotes `via references[13]` as its own worked example, so
  // that probe passes on the help and proves nothing. Match a line only a RESULT can carry.
  assert.doesNotMatch(env.body, /authored depends_on edges:/, "the help never renders a result");
});

test("an artifact NEVER appears in its own inbound, even when it references itself", async () => {
  // The self-exclusion is one line and the shape is real: a doc can name its own id in a ref field.
  // Without this fixture, dropping the guard shows the target standing on itself and nothing fails.
  const store = await seed([
    doc("narcissus", "adr", { dependsOn: ["asset:narcissus"] }),
    doc("elsewhere", "principle"),
  ]);
  const env = await run(["library", "inbound", "narcissus"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing references narcissus/);
  assert.doesNotMatch(env.body, /← narcissus/);
});

test("a referrer reaching the target through BOTH an authored and an unauthored field counts once, as authored", async () => {
  // `authoredCount` asks whether ANY of a referrer's paths is an authored edge. Asking whether ALL
  // of them are gives a different number on exactly this shape and on no other.
  const store = await seed([
    doc("target", "pattern"),
    doc("both-ways", "agent", { dependsOn: ["asset:target"], rules: ["asset:target"] }),
    doc("residue-only", "adr", { references: ["asset:target"] }),
  ]);
  const env = await run(["library", "inbound", "target"], { store });
  assert.match(env.body, /via dependsOn\[0\], rules\[0\]/, "both sites are listed, on one row");
  assert.match(env.body, /authored depends_on edges: 1 of 2/);
});

test("a referrer with no title renders its id and kind rather than throwing", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "target", kind: "pattern", doc: { id: "target", kind: "pattern" } });
  await store.upsertDoc({
    id: "untitled",
    kind: "adr",
    doc: { id: "untitled", kind: "adr", dependsOn: ["asset:target"] },
  });
  const env = await run(["library", "inbound", "target"], { store });
  assert.equal(env.ok, true);
  // The title slot collapses to nothing, leaving the two separators either side of it adjacent.
  assert.match(env.body, /← untitled {4}\[adr\]/, "an empty title collapses, the row survives");
  assert.match(env.body, /^target — {4}\[pattern\]/m, "and the header too");
});

test("a stored body that is not an object at all is rendered, not thrown over", async () => {
  // The defensive arm in `titleOf`. `StoredDoc.doc` is `unknown` at the seam, so a row that did not
  // come through the validated write path can carry a scalar; the reader must survive it.
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "target", kind: "pattern", doc: "not an object at all" });
  await store.upsertDoc({
    id: "points-at-it",
    kind: "adr",
    doc: { id: "points-at-it", kind: "adr", dependsOn: ["asset:target"] },
  });
  const env = await run(["library", "inbound", "target"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /← points-at-it/);
});

test("a NULL stored body is rendered too — the arm a scalar body cannot reach", async () => {
  // A scalar body proves less than it looks: `"str".title` is merely `undefined`, so dropping the
  // guard still yields an empty title and nothing fails. `null` is the one value where the guard is
  // load-bearing — reading a property off it THROWS — so this is what makes the arm provable.
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "target", kind: "pattern", doc: null });
  await store.upsertDoc({
    id: "points-at-it",
    kind: "adr",
    doc: { id: "points-at-it", kind: "adr", dependsOn: ["asset:target"] },
  });
  const env = await run(["library", "inbound", "target"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /← points-at-it/);
});
