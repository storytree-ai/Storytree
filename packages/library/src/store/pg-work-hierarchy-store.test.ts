import test from "node:test";
import assert from "node:assert/strict";

import type { Pool } from "pg";

import {
  WORK_HIERARCHY_SCHEMA_VERSION,
  WorkHierarchySnapshot,
  diffWorkHierarchy,
} from "../work-hierarchy-projection.js";
import {
  PgWorkHierarchyStore,
  WORK_HIERARCHY_SNAPSHOT_ID,
  type WorkHierarchyClient,
} from "./pg-work-hierarchy-store.js";

/**
 * OFFLINE: the statement SEQUENCE and the read-back reassembly, against a recording fake. The live
 * SQL runs behind `hierarchy:load` / `check:hierarchy-drift`, which hold the credential; nothing
 * here dials a database, so this suite stays inside `pnpm -r test` (ADR-0302 D3).
 */

const C1 = "uatc_000000000000000000000001";
const C2 = "uatc_000000000000000000000002";
const R1 = "uatr1:0000000000000001";

function snapshot(over: Record<string, unknown> = {}): WorkHierarchySnapshot {
  return WorkHierarchySnapshot.parse({
    schemaVersion: WORK_HIERARCHY_SCHEMA_VERSION,
    commitSha: "aaaaaaa",
    storiesTreeSha: "bbbbbbb",
    generatedAt: "2026-08-26T00:00:00.000Z",
    generator: "test",
    stories: [
      {
        id: "demo",
        title: "Demo",
        outcome: "a demo",
        status: "building",
        proofMode: "UAT",
        uatWitness: "machine",
        building: false,
        capabilities: ["demo-cap"],
        uatTestCriteria: [
          { criterionId: C1, revisionId: R1, title: "first", witness: "machine" },
          { criterionId: C2, revisionId: R1, title: "second", witness: "machine", wouldBe: true },
        ],
        reliabilityGates: [{ id: "demo#gate-1", title: "green", kind: "observe", covers: ["demo-cap"] }],
      },
    ],
    capabilities: [
      {
        id: "demo-cap",
        storyId: "demo",
        title: "Demo cap",
        outcome: "a cap",
        status: "healthy",
        proofMode: "integration-test",
        contractCount: 2,
      },
    ],
    ...over,
  });
}

/** Records every statement; answers reads from an in-memory table set filled by the writes. */
function recordingClient(options: { failOn?: RegExp } = {}) {
  const statements: string[] = [];
  const rows = new Map<string, Record<string, unknown>[]>();
  const client: WorkHierarchyClient = {
    query: async (text, values) => {
      statements.push(text.trim().split(/\s+/).slice(0, 6).join(" "));
      if (options.failOn?.test(text)) throw new Error("boom");
      const del = /DELETE FROM (\S+)/.exec(text);
      if (del) rows.set(del[1]!, []);
      const ins = /INSERT INTO (\S+)/.exec(text);
      if (ins) {
        const table = ins[1]!;
        const cols = /\(([^)]*)\)\s*\r?\n?\s*VALUES/s.exec(text)?.[1] ?? "";
        const names = cols.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
        const record: Record<string, unknown> = {};
        names.forEach((name, i) => {
          const raw = (values ?? [])[i];
          record[name] = typeof raw === "string" && raw.startsWith("{") ? JSON.parse(raw) : raw;
        });
        rows.set(table, [...(rows.get(table) ?? []), record]);
      }
      const sel = /FROM (events\.\w+)/.exec(text);
      if (/^\s*SELECT/.test(text) && sel) {
        let out = rows.get(sel[1]!) ?? [];
        if (/WHERE id = \$1/.test(text)) out = out.filter((r) => r["id"] === (values ?? [])[0]);
        return { rows: out };
      }
      return { rows: [] };
    },
  };
  return { client, statements, rows };
}

test("work-hierarchy-store-replaces-the-whole-snapshot-in-one-transaction: BEGIN, delete every table, insert, COMMIT", async () => {
  const { client, statements } = recordingClient();
  await new PgWorkHierarchyStore({} as Pool).writeSnapshot(snapshot(), "tester", client);

  assert.equal(statements[0], "BEGIN", "the replace opens a transaction before deleting anything");
  assert.equal(statements.at(-1), "COMMIT");

  // TOTALITY: every one of the four projection tables is cleared. An upsert-only loader could never
  // express a DELETED story, which would leave a retired story standing in the store forever.
  const deletes = statements.filter((s) => s.startsWith("DELETE FROM"));
  assert.deepEqual(deletes.sort(), [
    "DELETE FROM events.work_capability",
    "DELETE FROM events.work_criterion",
    "DELETE FROM events.work_gate",
    "DELETE FROM events.work_story",
  ]);
  for (const del of deletes) {
    assert.ok(
      statements.indexOf(del) < statements.findIndex((s) => s.startsWith("INSERT INTO")),
      `${del} runs before any insert, so the replace is never a partial merge`,
    );
  }
});

test("work-hierarchy-store-replaces-the-whole-snapshot-in-one-transaction: a mid-write failure ROLLS BACK and rethrows", async () => {
  // A partially-written hierarchy is worse than an old complete one: the drift check would then
  // report differences describing the loader's crash rather than the tree.
  const { client, statements } = recordingClient({ failOn: /INSERT INTO events\.work_gate/ });
  await assert.rejects(
    () => new PgWorkHierarchyStore({} as Pool).writeSnapshot(snapshot(), "tester", client),
    /boom/,
  );
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.ok(!statements.includes("COMMIT"), "a failed replace never commits");
});

test("work-hierarchy-store-round-trips-a-snapshot: what is written reads back identical", async () => {
  const { client } = recordingClient();
  const store = new PgWorkHierarchyStore({} as Pool);
  const written = snapshot();
  await store.writeSnapshot(written, "tester", client);

  const read = await store.readSnapshot(client);
  assert.notEqual(read, null);
  assert.deepEqual(
    diffWorkHierarchy(written, read!),
    [],
    "the normalised criterion/gate rows reassemble into the stories they came from",
  );
  assert.deepEqual(
    read!.stories[0]?.uatTestCriteria.map((c) => c.criterionId),
    [C1, C2],
    "and the authored ORDER survives the round trip, because `ordinal` carries it",
  );
  assert.equal(read!.storiesTreeSha, "bbbbbbb", "the freshness key round-trips on the stamp");
});

test("work-hierarchy-store-round-trips-a-snapshot: an unloaded store answers null, never an empty snapshot", async () => {
  // The two are different failures: `null` means nobody has looked; an EMPTY snapshot means somebody
  // looked and found no stories. A reader that collapsed them would report a healthy load of nothing.
  const { client } = recordingClient();
  assert.equal(await new PgWorkHierarchyStore({} as Pool).readSnapshot(client), null);
});

test("work-hierarchy-store-round-trips-a-snapshot: the stamp is a singleton, keyed and upserted", async () => {
  const { client, rows } = recordingClient();
  const store = new PgWorkHierarchyStore({} as Pool);
  await store.writeSnapshot(snapshot(), "tester", client);
  await store.writeSnapshot(snapshot({ storiesTreeSha: "ccccccc" }), "tester", client);
  const stamps = rows.get("events.work_hierarchy_snapshot") ?? [];
  assert.ok(stamps.every((r) => r["id"] === WORK_HIERARCHY_SNAPSHOT_ID));
  assert.deepEqual(
    stamps.at(-1)?.["story_count"],
    1,
    "the stamp records the denominators, so 'no differences' and 'read nothing' cannot print alike",
  );
});
