import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import { reconcileCorpus, syncSeedCorpus, diffCorpus, diffSeedCorpus } from "./sync-corpus.js";

/**
 * Offline non-agent corpus reconciliation tests (ADR-0103). Run against InMemoryStore — NO Cloud SQL,
 * NO live-DB gate, so they NEVER touch the real tables. `reconcileCorpus` is the migrate-only core
 * (carry seed artifacts ABSENT from live across, never overwrite, never delete); `syncSeedCorpus` is
 * the seed-loading convenience the CLI runs. The behaviour is the INVERSE of the seed-canonical agent
 * sync, so the no-clobber / no-delete guarantees are the load-bearing assertions here.
 */

function doc(id: string, kind: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { id, kind, title: id, ...extra };
}

async function seed(store: InMemoryStore, docs: Record<string, unknown>[]): Promise<void> {
  for (const d of docs) {
    await store.upsertDoc({ id: d["id"] as string, kind: d["kind"] as string, doc: d });
  }
}

test("reconcileCorpus: creates seed non-agents ABSENT from live, never overwrites, never deletes, ignores agents", async () => {
  const source = new InMemoryStore();
  await seed(source, [
    doc("p1", "principle", { body: "seed version" }),
    doc("d1", "definition"),
    doc("a1", "agent"), // an agent in the seed must NOT be synced by this command
  ]);

  const target = new InMemoryStore();
  await seed(target, [
    doc("p1", "principle", { body: "LIVE EDIT — must survive" }), // present in both: live-canonical
    doc("x1", "principle", { body: "live-only creation" }), // absent from seed: must NOT be deleted
  ]);

  const r = await reconcileCorpus(source, target);

  assert.deepEqual(r.seed, ["d1", "p1"], "the seed's non-agent ids (agent excluded)");
  assert.deepEqual(r.created, ["d1"], "only the absent seed artifact is created");
  assert.deepEqual(r.skipped, ["p1"], "the already-present artifact is skipped");
  assert.equal(r.complete, true, "every seed non-agent id is now present in live");

  // The live edit survives — reconcile did NOT clobber it (the load-corpus --force harm we forbid).
  assert.equal(((await target.getDoc("p1"))!.doc as { body: string }).body, "LIVE EDIT — must survive");
  // The absent seed artifact was migrated across.
  assert.ok(await target.getDoc("d1"), "d1 created");
  // The live-only artifact absent from the seed was preserved (no delete).
  assert.ok(await target.getDoc("x1"), "live-only artifact kept");
  // The seed's agent was not synced (agents have their own seed-canonical sync).
  assert.equal(await target.getDoc("a1"), null, "agent kind not synced by reconcileCorpus");
});

test("reconcileCorpus: idempotent — a second run creates nothing", async () => {
  const source = new InMemoryStore();
  await seed(source, [doc("p1", "principle"), doc("d1", "definition")]);
  const target = new InMemoryStore();

  const first = await reconcileCorpus(source, target);
  assert.deepEqual(first.created, ["d1", "p1"]);
  assert.equal(first.complete, true);

  const second = await reconcileCorpus(source, target);
  assert.deepEqual(second.created, [], "nothing left to create");
  assert.deepEqual(second.skipped, ["d1", "p1"], "everything already present is skipped");
  assert.equal(second.complete, true);
});

test("reconcileCorpus: never overwrites a same-id artifact even if the seed holds it under a different kind", async () => {
  // A pathological id collision: live holds `c1` as a definition; the seed holds `c1` as a principle.
  // Migrate-only must SKIP it (present under some kind), never overwrite the live row.
  const source = new InMemoryStore();
  await seed(source, [doc("c1", "principle", { body: "seed" })]);
  const target = new InMemoryStore();
  await seed(target, [doc("c1", "definition", { body: "live" })]);

  const r = await reconcileCorpus(source, target);
  assert.deepEqual(r.created, [], "collision id is not created");
  assert.deepEqual(r.skipped, ["c1"], "collision id is skipped");
  const live = (await target.getDoc("c1"))!;
  assert.equal(live.kind, "definition", "live kind untouched");
  assert.equal((live.doc as { body: string }).body, "live", "live content untouched");
});

test("reconcileCorpus + diffCorpus: EPHEMERAL kinds are out of the seed ceremony entirely (ADR-0183 D2)", async () => {
  // A `plan` is live-only by design: never carried seed→live (even if one pathologically appears in
  // the seed), and a LIVE plan is neither a migration gap nor drift — else every live plan would
  // read as seed drift forever.
  const source = new InMemoryStore();
  await seed(source, [
    doc("p1", "principle"),
    doc("stray-plan", "plan"), // pathological: a plan must never be in the seed — refuse to carry it
  ]);
  const target = new InMemoryStore();
  await seed(target, [
    doc("p1", "principle"),
    doc("live-plan", "plan"), // the normal case: a live-only plan
  ]);

  const diff = await diffCorpus(source, target);
  assert.deepEqual(diff.seed, ["p1"], "a seed plan is out of scope");
  assert.deepEqual(diff.live, ["p1"], "a live plan is out of scope — never counted, never drift");
  assert.equal(diff.complete, true);

  const r = await reconcileCorpus(source, target);
  assert.deepEqual(r.created, [], "the stray seed plan is NOT migrated");
  assert.equal(await target.getDoc("stray-plan"), null, "no plan ever crosses seed→live");
  assert.ok(await target.getDoc("live-plan"), "the live-only plan is untouched");
});

test("diffCorpus: read-only — reports the missing seed non-agents and writes NOTHING", async () => {
  const source = new InMemoryStore();
  await seed(source, [doc("p1", "principle"), doc("d1", "definition"), doc("a1", "agent")]);
  const target = new InMemoryStore();
  await seed(target, [doc("p1", "principle"), doc("x1", "principle")]);

  const diff = await diffCorpus(source, target);
  assert.deepEqual(diff.seed, ["d1", "p1"]);
  assert.deepEqual(diff.missing, ["d1"], "the seed non-agent absent from live (agent excluded)");
  assert.equal(diff.complete, false);
  // A live-only artifact (x1) is NOT reported as drift — under live-canonical that is expected.
  assert.equal((diff as { extra?: unknown }).extra, undefined, "no `extra` field — live-only is not drift");

  // Read-only: the target is untouched (d1 NOT created).
  assert.equal(await target.getDoc("d1"), null);
});

test("diffCorpus: a live tier holding every seed non-agent reports complete", async () => {
  const source = new InMemoryStore();
  await seed(source, [doc("p1", "principle"), doc("d1", "definition")]);
  const target = new InMemoryStore();
  await seed(target, [doc("d1", "definition"), doc("p1", "principle"), doc("extra", "pattern")]);
  const diff = await diffCorpus(source, target);
  assert.equal(diff.complete, true, "extra live artifacts do not break completeness");
  assert.deepEqual(diff.missing, []);
});

test("syncSeedCorpus: carries the REAL seed non-agent corpus into a fresh target, agents excluded", async () => {
  const target = new InMemoryStore();
  const r = await syncSeedCorpus(target);

  assert.equal(r.complete, true, "every seed non-agent artifact is now present");
  assert.ok(r.created.length > 0, "the seed has non-agent artifacts to migrate");
  // The graduation-gap artifact that motivated this command is carried across.
  assert.ok(
    r.created.includes("real-test-must-not-leak-a-handle"),
    "the seed-only graduated principle is migrated",
  );
  assert.ok(await target.getDoc("real-test-must-not-leak-a-handle"), "present in the target after sync");
  // Agents are NOT synced by this command — they have their own seed-canonical sync.
  assert.equal(await target.getDoc("session-orchestrator"), null, "a known seed agent is NOT migrated");

  // After a sync, the diff against the seed is clean.
  const diff = await diffSeedCorpus(target);
  assert.equal(diff.complete, true, "after a sync the diff reports complete");
  assert.deepEqual(diff.missing, []);
});

test("syncSeedCorpus: idempotent against the REAL seed — a second run creates nothing", async () => {
  const target = new InMemoryStore();
  await syncSeedCorpus(target);
  const second = await syncSeedCorpus(target);
  assert.deepEqual(second.created, [], "second run migrates nothing");
  assert.equal(second.complete, true);
});
