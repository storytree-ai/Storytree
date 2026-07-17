import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import { UAT_CRITERION_DETAIL_KIND } from "./detail-kind.js";
import { reconcileDetails, diffDetails } from "./detail-seed-sync.js";

/**
 * Offline detail-kind reconciliation tests (ADR-0209 D5 — the deliberate extension of the
 * seed-canonical exception (ADR-0055) beyond the `agent` kind to `uat-criterion`). Mirrors
 * `reconcileAgents`/`diffAgents` (packages/library/src/store/sync-agents.ts) shape exactly, but
 * kind-fenced to `UAT_CRITERION_DETAIL_KIND` only. Run against two `InMemoryStore`s — NO Cloud SQL,
 * NO live-DB gate; `reconcileDetails`/`diffDetails` are the pure core (any source -> any target).
 */

function detail(id: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    kind: UAT_CRITERION_DETAIL_KIND,
    action: `run ${id}`,
    successConditions: `${id} succeeds observably`,
    evidenceExpectations: `capture evidence for ${id}`,
    refs: [],
    ...extra,
  };
}

async function seed(store: InMemoryStore, docs: Record<string, unknown>[]): Promise<void> {
  for (const doc of docs) {
    await store.upsertDoc({ id: doc["id"] as string, kind: doc["kind"] as string, doc });
  }
}

test("reconcileDetails: upserts missing seed details, deletes stale ones, refreshes drifted content", async () => {
  const source = new InMemoryStore();
  await seed(source, [
    detail("s1#c1", { action: "fresh action" }),
    detail("s1#c2"),
    { id: "p1", kind: "principle" },
  ]);

  const target = new InMemoryStore();
  await seed(target, [
    detail("s1#c1", { action: "stale action" }),
    detail("s1#gone"),
    { id: "p2", kind: "principle" },
  ]);

  const r = await reconcileDetails(source, target);

  assert.deepEqual(r.before, ["s1#c1", "s1#gone"]);
  assert.deepEqual(r.seed, ["s1#c1", "s1#c2"]);
  assert.deepEqual(r.upserted, ["s1#c1", "s1#c2"]);
  assert.deepEqual(r.deleted, ["s1#gone"]);
  assert.deepEqual(r.after, ["s1#c1", "s1#c2"]);
  assert.equal(r.inSync, true);

  const c1 = await target.getDoc("s1#c1");
  assert.equal((c1?.doc as { action: string }).action, "fresh action", "drifted content refreshed");
  assert.ok(await target.getDoc("s1#c2"), "s1#c2 created");
  assert.equal(await target.getDoc("s1#gone"), null, "stale detail deleted");
});

test("reconcileDetails: is kind-fenced — never reads or writes docs of any other kind", async () => {
  const source = new InMemoryStore();
  await seed(source, [
    detail("s1#c1"),
    { id: "a1", kind: "agent", title: "some agent" },
    { id: "p1", kind: "principle" },
  ]);
  const target = new InMemoryStore();
  await seed(target, [
    { id: "p2", kind: "principle" },
    { id: "oq1", kind: "open-question" },
  ]);

  await reconcileDetails(source, target);

  // Target's non-detail docs survive untouched.
  assert.ok(await target.getDoc("p2"), "target principle untouched");
  assert.ok(await target.getDoc("oq1"), "target open-question untouched");
  // Source's non-detail docs were never copied across.
  assert.equal(await target.getDoc("a1"), null, "source agent not copied");
  assert.equal(await target.getDoc("p1"), null, "source principle not copied");
  // The detail itself landed.
  assert.ok(await target.getDoc("s1#c1"), "the detail was synced");
});

test("reconcileDetails: idempotent — a second run against an already-synced target upserts identical content and deletes nothing", async () => {
  const source = new InMemoryStore();
  await seed(source, [detail("s1#c1"), detail("s1#c2")]);
  const target = new InMemoryStore();
  await seed(target, [detail("s1#gone")]);

  const first = await reconcileDetails(source, target);
  assert.deepEqual(first.deleted, ["s1#gone"]);
  assert.equal(first.inSync, true);

  const second = await reconcileDetails(source, target);
  assert.deepEqual(second.before, ["s1#c1", "s1#c2"]);
  assert.deepEqual(second.upserted, ["s1#c1", "s1#c2"]);
  assert.deepEqual(second.deleted, [], "nothing stale left to delete");
  assert.deepEqual(second.after, ["s1#c1", "s1#c2"]);
  assert.equal(second.inSync, true);
});

test("diffDetails: read-only — reports missing/extra/inSync and writes NOTHING to the target", async () => {
  const source = new InMemoryStore();
  await seed(source, [detail("s1#c1"), detail("s1#c2"), { id: "p1", kind: "principle" }]);
  const target = new InMemoryStore();
  await seed(target, [detail("s1#c1"), detail("s1#gone")]);

  const diff = await diffDetails(source, target);
  assert.deepEqual(diff.seed, ["s1#c1", "s1#c2"]);
  assert.deepEqual(diff.live, ["s1#c1", "s1#gone"]);
  assert.deepEqual(diff.missing, ["s1#c2"], "in seed, absent from target");
  assert.deepEqual(diff.extra, ["s1#gone"], "in target, absent from seed");
  assert.equal(diff.inSync, false);

  // Read-only: the target is untouched.
  assert.equal(await target.getDoc("s1#c2"), null, "diff never creates");
  assert.ok(await target.getDoc("s1#gone"), "diff never deletes");
});

test("diffDetails: identical detail tiers report inSync with no missing/extra, order-independent", async () => {
  const source = new InMemoryStore();
  await seed(source, [detail("s1#c1"), detail("s1#c2")]);
  const target = new InMemoryStore();
  await seed(target, [detail("s1#c2"), detail("s1#c1")]);

  const diff = await diffDetails(source, target);
  assert.equal(diff.inSync, true);
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
});

test("diffDetails: ignores non-detail kinds entirely when computing the diff", async () => {
  const source = new InMemoryStore();
  await seed(source, [detail("s1#c1"), { id: "a1", kind: "agent" }]);
  const target = new InMemoryStore();
  await seed(target, [detail("s1#c1"), { id: "a2", kind: "agent" }, { id: "p1", kind: "principle" }]);

  const diff = await diffDetails(source, target);
  assert.equal(diff.inSync, true, "extra non-detail docs in either store do not affect the detail diff");
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
});
