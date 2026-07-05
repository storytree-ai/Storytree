import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { renderProcessNode } from "./render-process.js";

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
