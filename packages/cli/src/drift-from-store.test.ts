import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/base";
import { hashSpan } from "@storytree/orchestrator";
import { runDriftFromStore } from "./drift.js";

const V1 = "export const x = 1;\n";
const V2 = "export const x = 2;\n";
const anchorDoc = (file: string, content: string) => ({ file, boundHash: hashSpan(content) });

// ---------------------------------------------------------------------------
// runDriftFromStore — reads anchor + change log from store, classifies drift
// ---------------------------------------------------------------------------

test("runDriftFromStore: current file matches stored boundHash → FRESH", async () => {
  const store = new InMemoryStore();
  const id = "math#uat-1";
  await store.upsertDoc({ id, kind: "anchor", doc: anchorDoc("src/math.ts", V1) });
  const readFile = (_path: string) => V1;

  const e = await runDriftFromStore(id, store, readFile);
  assert.equal(e.ok, true, "FRESH is ok:true");
  assert.match(e.body, /FRESH/, "body signals FRESH state");
});

test("runDriftFromStore: file changed with described change event → STALE carrying the reason", async () => {
  const store = new InMemoryStore();
  const id = "math#uat-2";
  await store.upsertDoc({ id, kind: "anchor", doc: anchorDoc("src/math.ts", V1) });
  await store.appendChangeEvent({
    unitId: id,
    hashBefore: hashSpan(V1),
    hashAfter: hashSpan(V2),
    description: "switched constant from 1 to 2",
    author: "x",
    at: "2026-06-16T00:00:00.000Z",
  });
  const readFile = (_path: string) => V2;

  const e = await runDriftFromStore(id, store, readFile);
  assert.equal(e.ok, true, "STALE is ok:true");
  assert.match(e.body, /STALE/, "body signals STALE state");
  assert.match(e.body, /switched constant from 1 to 2/, "surfaces the described change reason");
});

test("runDriftFromStore: file changed with no described change → DRIFTED-UNDESCRIBED", async () => {
  const store = new InMemoryStore();
  const id = "math#uat-3";
  await store.upsertDoc({ id, kind: "anchor", doc: anchorDoc("src/math.ts", V1) });
  // no change event appended
  const readFile = (_path: string) => V2;

  const e = await runDriftFromStore(id, store, readFile);
  assert.equal(e.ok, true, "DRIFTED-UNDESCRIBED is ok:true");
  assert.match(e.body, /DRIFTED \(undescribed\)/, "body signals the demoted drifted-undescribed state");
});

test("runDriftFromStore: no stored anchor → ok:false with guidance to bind first", async () => {
  const store = new InMemoryStore();
  const id = "math#uat-missing";
  const readFile = (_path: string) => V1;

  const e = await runDriftFromStore(id, store, readFile);
  assert.equal(e.ok, false, "absent anchor is ok:false");
  assert.match(e.body, /math#uat-missing/, "names the unit id so the agent can act");
  assert.ok(
    e.next !== undefined && e.next.length > 0,
    "provides next-step guidance for binding",
  );
});
