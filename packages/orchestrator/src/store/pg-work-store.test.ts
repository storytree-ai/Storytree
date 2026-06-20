import test, { after } from "node:test";
import assert from "node:assert/strict";

import { rollupParitySuite } from "../proof/rollup-parity.js";
import { rollupStatus, workEvent } from "../proof/rollup.js";
import type { Store } from "@storytree/storage-protocol";
import type { Verdict } from "@storytree/proof-protocol";

import { PgWorkStore } from "./pg-work-store.js";
import type { WorkStoreClient } from "./pg-work-store.js";

/**
 * PgWorkStore (PR #29 parked decision 4): offline tests drive the SQL routing through a FAKE
 * client (recorded queries + canned rows) — no DB, no network; the live behavioural bar is the
 * shared {@link rollupParitySuite}, gated behind STORYTREE_DB_LIVE=1 like every other live suite.
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";

const PASS_VERDICT: Verdict = {
  unitId: "u1",
  proofMode: "contract",
  outcome: "pass",
  commitSha: "cafebabe",
  signer: "tester@example.com",
  runId: "run-1",
  outputVersion: "v1",
  evidence: [],
  at: "2026-06-10T00:00:00.000Z",
};

/** A fake client: records every query and returns canned rows keyed by the target table. */
function fakeClient(rowsByTable?: {
  work?: unknown[];
  verdict?: unknown[];
}): { client: WorkStoreClient; queries: Array<{ text: string; values: unknown[] }> } {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let seq = 0;
  const client: WorkStoreClient = {
    async query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number }> {
      queries.push({ text, values: values ?? [] });
      if (text.startsWith("INSERT")) {
        seq += 1;
        return { rows: [{ seq, at: new Date("2026-06-10T00:00:00.000Z") }] };
      }
      if (text.startsWith("DELETE")) return { rows: [], rowCount: 1 };
      if (text.includes("FROM events.work_event")) return { rows: rowsByTable?.work ?? [] };
      if (text.includes("FROM events.verdict")) return { rows: rowsByTable?.verdict ?? [] };
      return { rows: [] };
    },
  };
  return { client, queries };
}

test("a signing event routes to events.verdict with the Verdict's scalar spine", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  const event = await store.appendEvent({
    id: "run-1:u1",
    kind: "signing",
    type: "created",
    doc: PASS_VERDICT,
    actor: "tester@example.com",
  });

  assert.equal(queries.length, 1);
  const q = queries[0]!;
  assert.match(q.text, /INSERT INTO events\.verdict/);
  assert.deepEqual(q.values.slice(0, 6), [
    "u1",
    "run-1",
    "contract",
    "pass",
    "cafebabe",
    "tester@example.com",
  ]);
  assert.deepEqual(JSON.parse(q.values[6] as string), PASS_VERDICT);
  assert.equal(event.kind, "signing");
  assert.equal(event.id, "run-1:u1");
});

test("a signing event whose doc is NOT a full Verdict fails closed (nothing forgeable lands)", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  await assert.rejects(
    store.appendEvent({
      id: "run-1:u1",
      kind: "signing",
      type: "created",
      doc: { unitId: "u1", outcome: "pass" },
      actor: "tester",
    }),
  );
  assert.equal(queries.length, 0, "no INSERT may run for an unparseable verdict");
});

test("a work event routes to events.work_event with the LIFECYCLE word in the type column", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  await store.appendEvent(
    workEvent({ unitId: "u1", event: "building", runId: "run-1", tier: "capability" }, "tester"),
  );

  const q = queries[0]!;
  assert.match(q.text, /INSERT INTO events\.work_event/);
  // unit_id, tier, type (= the lifecycle event, not "created"), doc, actor.
  assert.equal(q.values[0], "u1");
  assert.equal(q.values[1], "capability");
  assert.equal(q.values[2], "building");
  assert.equal(q.values[4], "tester");
});

test("a work event without a tier lands with the explicit 'unknown' tier", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  await store.appendEvent(workEvent({ unitId: "u1", event: "building" }, "tester"));
  assert.equal(queries[0]!.values[1], "unknown");
});

test("an unknown event kind is refused — nothing lands somewhere silent", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  await assert.rejects(
    store.appendEvent({ id: "x", kind: "library", type: "created", doc: {}, actor: "t" }),
    /has no home here/,
  );
  assert.equal(queries.length, 0);
});

test("readEvents merges both tables ordered by at (work before signing on a tie), reassigning seq", async () => {
  const buildingDoc = { unitId: "u1", event: "building", runId: "run-1" };
  const { client } = fakeClient({
    work: [
      { seq: 7, type: "building", doc: buildingDoc, actor: "tester", at: "2026-06-10T00:00:00.000Z" },
    ],
    verdict: [
      {
        seq: 3,
        unit_id: "u1",
        run_id: "run-1",
        signer: "tester@example.com",
        doc: PASS_VERDICT,
        at: "2026-06-10T00:00:00.000Z",
      },
    ],
  });
  const store = new PgWorkStore(client);
  const events = await store.readEvents();

  assert.equal(events.length, 2);
  // Same timestamp: the work (building) event precedes the signing event, raw BIGSERIALs ignored.
  assert.deepEqual(events.map((e) => e.kind), ["work", "signing"]);
  assert.deepEqual(events.map((e) => e.seq), [1, 2]);
  // The StoreEvent id is reconstructed by the runId:unitId rule both writers use.
  assert.deepEqual(events.map((e) => e.id), ["run-1:u1", "run-1:u1"]);
  // The merged stream is exactly what the rollup projects healthy from.
  assert.equal(rollupStatus("u1", events), "healthy");
});

test("readEvents honours the id filter", async () => {
  const { client } = fakeClient({
    work: [
      { seq: 1, type: "building", doc: { unitId: "u1", event: "building", runId: "r" }, actor: "t", at: "2026-06-10T00:00:00.000Z" },
      { seq: 2, type: "building", doc: { unitId: "u2", event: "building", runId: "r" }, actor: "t", at: "2026-06-10T00:00:01.000Z" },
    ],
  });
  const store = new PgWorkStore(client);
  const events = await store.readEvents({ id: "r:u2" });
  assert.equal(events.length, 1);
  assert.equal(events[0]!.id, "r:u2");
});

test("deleteWorkEvent hard-deletes ONLY the building row for (unitId, runId) — the smoke's narrow exception", async () => {
  const { client, queries } = fakeClient();
  const store = new PgWorkStore(client);
  const removed = await store.deleteWorkEvent("library", "wisp-smoke-abc");

  assert.equal(queries.length, 1);
  const q = queries[0]!;
  // A DELETE, scoped to events.work_event, type='building', and the runId inside the JSONB doc —
  // so it can never touch a verdict (those live in events.verdict) or another run's history.
  assert.match(q.text, /DELETE FROM events\.work_event/);
  assert.match(q.text, /type = 'building'/);
  assert.match(q.text, /doc->>'runId' = \$2/);
  assert.deepEqual(q.values, ["library", "wisp-smoke-abc"]);
  assert.equal(removed, 1);
});

test("the doc surface fails loud — this store is event-only", async () => {
  const store = new PgWorkStore(fakeClient().client);
  await assert.rejects(store.upsertDoc(), /EVENT-ONLY/);
  await assert.rejects(store.getDoc(), /EVENT-ONLY/);
  await assert.rejects(store.queryDocs(), /EVENT-ONLY/);
  await assert.rejects(store.deleteDoc(), /EVENT-ONLY/);
});

// ---- Live-gated: the shared rollup-parity bar over the real tables --------------------------

/** Build a PgWorkStore against the live DB, truncating the work tables so each run starts clean. */
const livePools: Array<() => Promise<void>> = [];
async function makePgWorkStore(): Promise<Store> {
  const { createTestPool, closePool, applySchema } = await import("@storytree/library/store");
  // Fail-closed against production — the TRUNCATE below can never wipe the live verdicts (ADR-0054).
  const { pool, connector } = await createTestPool();
  livePools.push(() => closePool(pool, connector));
  await applySchema(pool);
  await pool.query("TRUNCATE events.work_event, events.verdict RESTART IDENTITY");
  return new PgWorkStore(pool);
}

if (LIVE) {
  rollupParitySuite("PgWorkStore", makePgWorkStore);
  after(async () => {
    // Close every leaked pool so the test process can exit (the parity suite has no teardown seam).
    await Promise.allSettled(livePools.map((close) => close()));
  });
} else {
  test("PgWorkStore rollup parity (skipped: set STORYTREE_DB_LIVE=1 to run)", { skip: true }, () => {
    // The live DB is stopped by default; the fake-client tests above prove the SQL routing
    // offline and the InMemoryStore rollup parity (rollupParitySuite) proves the projection.
  });
}
