import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { renderProcessNode, processGraphViolations } from "./render-process.js";

// The process NODE of the Library context DAG (ADR-0154 follow-on / ADR-0161). Mirrors the agent
// step→refs extractor tests (render-agent.test.ts): the library reads branch-edges into node DATA and
// fails closed; the CLI shapes them into the `next:` envelope via the shared emitter.

/** A store with one `process` carrying a branch-edge graph (one labelled edge, one bare). */
async function withProcess(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "demo-process",
    kind: "process",
    doc: {
      kind: "process",
      id: "demo-process",
      title: "Demo Process",
      description: "a process with a branch-edge graph",
      body: "The ceremony. Do the thing.",
      references: [],
      branchEdges: [
        { ref: "asset:merge-ceremony", label: "when green" },
        { ref: "asset:pull-based-context" },
      ],
    },
  });
  return store;
}

test("renderProcessNode reads branch-edges VERBATIM in order (asset: kept; the emitter strips it)", async () => {
  const store = await withProcess();
  const res = await renderProcessNode(store, "demo-process");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.id, "demo-process");
  assert.match(res.headline, /Demo Process/);
  assert.deepEqual(res.edges, [
    { ref: "asset:merge-ceremony", label: "when green" },
    { ref: "asset:pull-based-context" },
  ]);
});

test("renderProcessNode: an unknown id fails closed listing the process ids that exist", async () => {
  const store = await withProcess();
  const res = await renderProcessNode(store, "ghost");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no process "ghost"/);
  assert.deepEqual(res.available, ["demo-process"]);
});

test("renderProcessNode: a non-process kind fails closed (the graph is process-only)", async () => {
  const store = await withProcess();
  await store.upsertDoc({
    id: "some-principle",
    kind: "principle",
    doc: {
      kind: "principle",
      title: "P",
      description: "d",
      statement: "s",
      why: "w",
      howToApply: "h",
      references: [],
    },
  });
  const res = await renderProcessNode(store, "some-principle");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /no process "some-principle"/);
  // `available` lists only the process ids — the principle is not one of them.
  assert.deepEqual(res.available, ["demo-process"]);
});

test("renderProcessNode: a process with NO branchEdges degrades honestly (empty edges, ok)", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "bare-process",
    kind: "process",
    doc: {
      kind: "process",
      id: "bare-process",
      title: "Bare",
      description: "no graph yet",
      body: "b",
      references: [],
    },
  });
  const res = await renderProcessNode(store, "bare-process");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.edges, []);
  assert.match(res.headline, /no branch-edges yet/);
});

test("renderProcessNode: malformed branch-edges (no ref / junk) are DROPPED, never thrown", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "messy-process",
    kind: "process",
    doc: {
      kind: "process",
      id: "messy-process",
      title: "Messy",
      description: "d",
      body: "b",
      references: [],
      branchEdges: [null, { label: "orphan-no-ref" }, { ref: "asset:ok" }, { ref: 42 }],
    },
  });
  const res = await renderProcessNode(store, "messy-process");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.edges, [{ ref: "asset:ok" }]);
});

test("renderProcessNode: a missing id fails closed asking for one, still listing the processes", async () => {
  const store = await withProcess();
  const res = await renderProcessNode(store, undefined);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /needs a process id/);
  assert.deepEqual(res.available, ["demo-process"]);
});

// ── processGraphViolations — the process-graph integrity gate (ADR-0161 decision 5) ────────────────
// The dangling-ref fence extended to the process tier's structured edges (the counterpart of
// essentialsGateViolations' step→refs integrity). Scoped to (a) resolve + (b) no cycle — reachability
// is out of scope (no declared graph root), see render-process.ts's section header.

/** Upsert a `process` with the given branch-edges (a body so it round-trips, like the fixtures above). */
async function putProcess(
  store: InMemoryStore,
  id: string,
  branchEdges: { ref: string; label?: string }[],
): Promise<void> {
  await store.upsertDoc({
    id,
    kind: "process",
    doc: { kind: "process", id, title: id, description: "d", body: "b", references: [], branchEdges },
  });
}

/** Upsert a non-process leaf artifact (a real resolution target that carries no outbound edges). */
async function putLeaf(store: InMemoryStore, id: string): Promise<void> {
  await store.upsertDoc({
    id,
    kind: "principle",
    doc: { kind: "principle", id, title: id, description: "d", statement: "s", why: "w", howToApply: "h", references: [] },
  });
}

test("processGraphViolations (a): a dangling branch-edge REDS, naming the process + the missing ref", async () => {
  const store = new InMemoryStore();
  await putProcess(store, "p1", [{ ref: "asset:ghost" }]);
  const v = await processGraphViolations(store);
  assert.equal(v.length, 1);
  assert.match(v[0]!, /process "p1" has a dangling branch-edge asset:ghost — it resolves to no artifact\./);
});

test("processGraphViolations (b): a two-node cycle REDS, naming the loop path", async () => {
  const store = new InMemoryStore();
  await putProcess(store, "a", [{ ref: "asset:b" }]);
  await putProcess(store, "b", [{ ref: "asset:a" }]);
  const v = await processGraphViolations(store);
  const body = v.join("\n");
  // Both refs resolve (a and b are real processes) — the ONLY violation is the cycle, reported once.
  assert.equal(v.length, 1);
  assert.match(body, /process branch-edge CYCLE:/);
  assert.match(body, /a → b → a/);
});

test("processGraphViolations (b): a self-loop REDS as a cycle", async () => {
  const store = new InMemoryStore();
  await putProcess(store, "s", [{ ref: "asset:s" }]);
  const v = await processGraphViolations(store);
  assert.equal(v.length, 1);
  assert.match(v[0]!, /process branch-edge CYCLE: s → s/);
});

test("processGraphViolations (c): a clean multi-node graph (process→process→leaf) passes", async () => {
  const store = new InMemoryStore();
  await putProcess(store, "root", [{ ref: "asset:mid", label: "go" }]);
  await putProcess(store, "mid", [{ ref: "asset:leaf" }]);
  await putLeaf(store, "leaf"); // a non-process target: resolves, and is a leaf (no outbound edges → can't close a cycle)
  const v = await processGraphViolations(store);
  assert.deepEqual(v, []);
});

test("processGraphViolations (d): a corpus with no process carrying branchEdges is a clean no-op", async () => {
  const store = new InMemoryStore();
  // A bare process (no branchEdges) + a leaf principle → an empty graph, no violations (the honest
  // no-op that keeps `pnpm gate` green until a real process is given a graph).
  await store.upsertDoc({
    id: "bare",
    kind: "process",
    doc: { kind: "process", id: "bare", title: "Bare", description: "d", body: "b", references: [] },
  });
  await putLeaf(store, "some-principle");
  assert.deepEqual(await processGraphViolations(store), []);
  // And an empty store is trivially sound.
  assert.deepEqual(await processGraphViolations(new InMemoryStore()), []);
});

test("processGraphViolations: dangling + cycle compose, and a longer cycle is reported once", async () => {
  const store = new InMemoryStore();
  await putProcess(store, "x", [{ ref: "asset:y" }, { ref: "asset:ghost" }]);
  await putProcess(store, "y", [{ ref: "asset:z" }]);
  await putProcess(store, "z", [{ ref: "asset:x" }]); // x → y → z → x, a 3-cycle
  const v = await processGraphViolations(store);
  const body = v.join("\n");
  assert.match(body, /process "x" has a dangling branch-edge asset:ghost/);
  assert.match(body, /process branch-edge CYCLE: x → y → z → x/);
  // Exactly one dangling + one cycle line — the cycle is not double-counted from a second entry node.
  assert.equal(v.length, 2);
});
