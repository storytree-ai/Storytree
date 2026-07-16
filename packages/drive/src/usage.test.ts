import test from "node:test";
import assert from "node:assert/strict";

import type { SdkRunInfo } from "@storytree/agent";
import { UsageEventDoc } from "@storytree/proof-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";

import { appendSliceUsage, sliceUsageDocs } from "./usage.js";

/**
 * The persistence half of the usage pipeline: SdkRunInfo slices in → validated usage docs in the
 * event store out. The capture half (API/SDK result → TokenUsage) is proven in @storytree/agent;
 * the SQL routing in the pg work store's own tests.
 */

const USAGE = { inputTokens: 10, cacheCreationInputTokens: 20, cacheReadInputTokens: 30, outputTokens: 40 };

const RUNS: SdkRunInfo[] = [
  { phase: "AUTHOR_TEST", subtype: "success", turns: 5, costUsd: 0.1, usage: USAGE },
  {
    phase: "IMPLEMENT",
    subtype: "success",
    turns: 9,
    costUsd: 0.3,
    usage: { ...USAGE, outputTokens: 999 },
    byModel: { "claude-sonnet-5": { ...USAGE, outputTokens: 999, costUsd: 0.3 } },
  },
];

test("sliceUsageDocs maps each slice with a breakdown to a valid UsageEventDoc", () => {
  const docs = sliceUsageDocs({ unitId: "u1", runId: "real-x", model: "claude-sonnet-5" }, RUNS);
  assert.equal(docs.length, 2);
  for (const doc of docs) UsageEventDoc.parse(doc); // every mapped doc must survive the wire shape
  assert.deepEqual(docs[0], {
    unitId: "u1",
    runId: "real-x",
    phase: "AUTHOR_TEST",
    source: "sdk-leaf",
    usage: USAGE,
    turns: 5,
    costUsd: 0.1,
    model: "claude-sonnet-5",
  });
  assert.deepEqual(docs[1]!.byModel, { "claude-sonnet-5": { ...USAGE, outputTokens: 999, costUsd: 0.3 } });
});

test("a slice without a token breakdown is skipped — capture is additive, nothing is invented", () => {
  const docs = sliceUsageDocs({ unitId: "u1", runId: "r" }, [
    { phase: "AUTHOR_TEST", subtype: "success", turns: 1, costUsd: 0 },
    RUNS[1]!,
  ]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]!.phase, "IMPLEMENT");
});

test("appendSliceUsage lands one usage event per slice in the run's store", async () => {
  const store = new InMemoryStore();
  const appended = await appendSliceUsage(store, { unitId: "u1", runId: "real-x" }, RUNS, "tester@example.com");
  assert.equal(appended, 2);
  const events = await store.readEvents();
  const usage = events.filter((e) => e.kind === "usage");
  assert.equal(usage.length, 2);
  assert.deepEqual(usage.map((e) => e.id), ["real-x:u1:AUTHOR_TEST", "real-x:u1:IMPLEMENT"]);
  assert.equal(usage[0]!.actor, "tester@example.com");
  assert.equal(UsageEventDoc.parse(usage[1]!.doc).usage.outputTokens, 999);
});

test("appendSliceUsage is advisory: a store failure warns and never throws", async () => {
  const warnings: string[] = [];
  const failing = new InMemoryStore();
  const boom = () => Promise.reject(new Error("store down"));
  (failing as unknown as { appendEvent: typeof boom }).appendEvent = boom;
  const appended = await appendSliceUsage(
    failing,
    { unitId: "u1", runId: "r" },
    RUNS,
    "tester",
    (m) => warnings.push(m),
  );
  assert.equal(appended, 0);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /did not persist: store down/);
});
