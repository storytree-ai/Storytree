import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import { reconcileAgents, syncSeedAgents, diffAgents, diffSeedAgents } from "./sync-agents.js";

/**
 * Offline agent-tier reconciliation tests (ADR-0055). Run against InMemoryStore — NO Cloud SQL, NO
 * live-DB gate, so they NEVER touch (or truncate) the real tables. `reconcileAgents` is the pure
 * core (any source → any target); `syncSeedAgents` is the seed-loading convenience the CLI runs.
 */

function agent(id: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: "agent", title: id, ...extra };
}

async function seed(store: InMemoryStore, docs: Record<string, unknown>[]): Promise<void> {
  for (const doc of docs) {
    await store.upsertDoc({ id: doc["id"] as string, kind: doc["kind"] as string, doc });
  }
}

test("reconcileAgents: upserts missing seed agents, deletes stale ones, leaves the source canonical", async () => {
  const source = new InMemoryStore();
  await seed(source, [agent("a1", { title: "fresh" }), agent("a2"), { id: "p1", kind: "principle" }]);

  const target = new InMemoryStore();
  await seed(target, [agent("a1", { title: "stale" }), agent("gone"), { id: "p2", kind: "principle" }]);

  const r = await reconcileAgents(source, target);

  assert.deepEqual(r.before, ["a1", "gone"]);
  assert.deepEqual(r.seed, ["a1", "a2"]);
  assert.deepEqual(r.upserted, ["a1", "a2"]);
  assert.deepEqual(r.deleted, ["gone"]);
  assert.deepEqual(r.after, ["a1", "a2"]);
  assert.equal(r.inSync, true);

  // a1 was refreshed to the source's content, a2 created, the stale 'gone' deleted.
  assert.equal((await target.getDoc("a1"))?.doc && ((await target.getDoc("a1"))!.doc as { title: string }).title, "fresh");
  assert.ok(await target.getDoc("a2"), "a2 created");
  assert.equal(await target.getDoc("gone"), null, "stale agent deleted");
});

test("reconcileAgents: NEVER touches non-agent kinds in either store", async () => {
  const source = new InMemoryStore();
  await seed(source, [agent("a1"), { id: "p1", kind: "principle" }]);
  const target = new InMemoryStore();
  await seed(target, [{ id: "p2", kind: "principle" }, { id: "d1", kind: "definition" }]);

  await reconcileAgents(source, target);

  // The target's non-agent docs survive; the source's non-agent doc was not copied across.
  assert.ok(await target.getDoc("p2"), "target principle untouched");
  assert.ok(await target.getDoc("d1"), "target definition untouched");
  assert.equal(await target.getDoc("p1"), null, "source's non-agent doc not copied");
});

test("reconcileAgents: idempotent — a second run upserts the same set and deletes nothing", async () => {
  const source = new InMemoryStore();
  await seed(source, [agent("a1"), agent("a2")]);
  const target = new InMemoryStore();
  await seed(target, [agent("gone")]);

  const first = await reconcileAgents(source, target);
  assert.deepEqual(first.deleted, ["gone"]);
  assert.equal(first.inSync, true);

  const second = await reconcileAgents(source, target);
  assert.deepEqual(second.before, ["a1", "a2"]);
  assert.deepEqual(second.deleted, [], "nothing stale left to delete");
  assert.deepEqual(second.after, ["a1", "a2"]);
  assert.equal(second.inSync, true);
});

test("diffAgents: read-only — reports missing/extra/inSync and writes NOTHING", async () => {
  const source = new InMemoryStore();
  await seed(source, [agent("a1"), agent("a2"), { id: "p1", kind: "principle" }]);
  const target = new InMemoryStore();
  await seed(target, [agent("a1"), agent("gone")]);

  const diff = await diffAgents(source, target);
  assert.deepEqual(diff.seed, ["a1", "a2"]);
  assert.deepEqual(diff.live, ["a1", "gone"]);
  assert.deepEqual(diff.missing, ["a2"], "in seed, absent from target");
  assert.deepEqual(diff.extra, ["gone"], "in target, absent from seed");
  assert.equal(diff.inSync, false);

  // Read-only: the target is untouched (a2 NOT created, gone NOT deleted).
  assert.equal(await target.getDoc("a2"), null);
  assert.ok(await target.getDoc("gone"));
});

test("diffAgents: identical agent tiers report inSync with no missing/extra", async () => {
  const source = new InMemoryStore();
  await seed(source, [agent("a1"), agent("a2")]);
  const target = new InMemoryStore();
  await seed(target, [agent("a2"), agent("a1")]); // order-independent
  const diff = await diffAgents(source, target);
  assert.equal(diff.inSync, true);
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
});

test("diffSeedAgents: a target holding exactly the seed's agents is inSync", async () => {
  // Reconcile a fresh target to the real seed, then diff — must report inSync.
  const target = new InMemoryStore();
  await syncSeedAgents(target);
  const diff = await diffSeedAgents(target);
  assert.equal(diff.inSync, true, "after a sync, the diff is clean");
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
});

test("syncSeedAgents: brings a target in line with the REAL seed corpus and removes a stale agent", async () => {
  const target = new InMemoryStore();
  // Pre-seed a stale agent that is not in the real seed.
  await seed(target, [agent("definitely-not-a-real-agent")]);

  const r = await syncSeedAgents(target);

  assert.equal(r.inSync, true, "target equals the seed's agent tier");
  assert.ok(r.seed.length > 0, "the seed has agents");
  assert.ok(r.deleted.includes("definitely-not-a-real-agent"), "the stale agent was deleted");
  assert.equal(await target.getDoc("definitely-not-a-real-agent"), null);
  // The reconciled set matches the seed exactly (no stale, all seed agents present).
  assert.deepEqual(r.after, r.seed);
});
