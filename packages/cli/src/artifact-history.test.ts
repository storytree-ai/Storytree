import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore, type StoreEvent } from "@storytree/storage-protocol";

import { foldHistory, renderHistory } from "./artifact-history.js";
import { run } from "./commands.js";

/**
 * The history instrument's proofs (`guidance-write-path-integrity-arc` end-state 3, ADR-0361 D6).
 *
 * The scenario under test is the measured one: `session-orchestrator`'s workflow went 16,791 →
 * 9,733 → 18,488 characters across three writes, and the middle one — a sibling's whole-doc write
 * carrying a stale copy — was invisible to every surface that reads current state. Sizes here are
 * scaled down; the shape is the same.
 */
function event(seq: number, workflow: string, actor: string): StoreEvent {
  return {
    seq,
    id: "session-orchestrator",
    kind: "agent",
    type: seq === 1 ? "created" : "updated",
    doc: { kind: "agent", id: "session-orchestrator", workflow, role: "the session loop" },
    actor,
    at: `2026-08-1${seq}T04:0${seq}:00.000Z`,
  };
}

const LONG = "x".repeat(1_679);
const STALE = LONG.slice(0, 973);
const RESTORED = "x".repeat(1_848);

test("foldHistory reports each write's size and what it gained or lost", () => {
  const entries = foldHistory([
    event(1, LONG, "cli"),
    event(2, STALE, "sibling"),
    event(3, RESTORED, "cli"),
  ]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0]?.changed[0]?.delta, null); // first appearance
  assert.equal(entries[1]?.changed[0]?.length, 973);
  assert.equal(entries[1]?.changed[0]?.delta, 973 - 1_679);
  assert.equal(entries[2]?.changed[0]?.delta, 1_848 - 973);
});

test("foldHistory flags the write whose value is a PREFIX of the one before it", () => {
  const entries = foldHistory([event(1, LONG, "cli"), event(2, STALE, "sibling")]);
  assert.equal(entries[1]?.changed[0]?.prefixOfPrevious, true);
  // The restore is not a prefix — it is longer, and only a shrink can be one.
  const restored = foldHistory([event(2, STALE, "sibling"), event(3, RESTORED, "cli")]);
  assert.equal(restored[1]?.changed[0]?.prefixOfPrevious, false);
});

test("foldHistory omits fields a write did not change, so the line that matters is not buried", () => {
  const entries = foldHistory([event(1, LONG, "cli"), event(2, LONG, "someone")]);
  assert.deepEqual(entries[1]?.changed, []);
});

test("foldHistory --field narrows to one field but KEEPS every write, holes and all", () => {
  const entries = foldHistory([event(1, LONG, "cli"), event(2, LONG, "someone")], "workflow");
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[1]?.changed, []);
  // Narrowed: one row. Unnarrowed: every string field on the doc (`kind`, `id`, `workflow`, `role`).
  assert.equal(foldHistory([event(1, LONG, "cli")], "workflow")[0]?.changed.length, 1);
  assert.equal(foldHistory([event(1, LONG, "cli")])[0]?.changed.length, 4);
});

test("renderHistory names the actor and the loss, and calls out the prefix without judging it", () => {
  const body = renderHistory({
    id: "session-orchestrator",
    entries: foldHistory([event(1, LONG, "cli"), event(2, STALE, "sibling"), event(3, RESTORED, "cli")]),
  });
  assert.match(body, /seq 2 .* by sibling/);
  assert.match(body, /-706/);
  assert.match(body, /a prefix of the previous value/);
  // It reports; it does not adjudicate. A shrink is ordinary curation more often than it is damage.
  assert.doesNotMatch(body, /suspicious|corrupt|damaged/i);
});

test("renderHistory says so plainly when the log holds nothing", () => {
  assert.match(renderHistory({ id: "nope", entries: [] }), /no history for "nope"/);
});

test("library artifact history <id> reads the append-only log, not the current doc", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "an-agent",
    kind: "definition",
    doc: { kind: "definition", id: "an-agent", description: "d", body: "the long original body" },
  });
  await store.upsertDoc({
    id: "an-agent",
    kind: "definition",
    doc: { kind: "definition", id: "an-agent", description: "d", body: "the long" },
  });
  const env = await run(["library", "artifact", "history", "an-agent"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /2 write\(s\) to "an-agent"/);
  // The whole point: the FIRST value's size is visible although the store no longer holds it.
  assert.match(env.body, /22 chars/);
  assert.match(env.body, /a prefix of the previous value/);
});

test("library artifact history without an id asks for one rather than guessing", async () => {
  const env = await run(["library", "artifact", "history"], { store: new InMemoryStore() });
  assert.equal(env.ok, false);
  assert.match(env.body, /which artifact\?/);
});
