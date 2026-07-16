import test from "node:test";
import assert from "node:assert/strict";

import { PgClaimStore } from "./claim-store.js";

/**
 * Offline: drive the ADR-0200 D4 cursor-once delta read (`pullOverlapDeltas` / `baselineCursor`)
 * through a lean FAKE pool (the claim-store.test.ts pattern), asserting the CONTROL FLOW and the
 * SQL SHAPE — the first-read self-baseline (no cursor row → baseline to max seq, return EMPTY),
 * the delta read's three-way filter (`seq > cursor AND seq <= max` ∩ own-live-units ∩
 * `session_id <> me`), the atomic advance-with-delivery (cursor UPSERT to the snapshotted max in
 * the SAME transaction), the nothing-new fast path (no cursor write), and ROLLBACK on error.
 * Real cursor-once semantics against real Postgres live in claim-cursor.live.test.ts.
 */

interface QueryCall {
  text: string;
  values: unknown[];
}

interface DeltaRow {
  seq: number;
  unit_id: string;
  type: string;
  session_id: string;
  doc: unknown;
  at: string;
}

const AT = "2026-07-16T12:00:00.000Z";

class FakeCursorClient {
  readonly calls: QueryCall[] = [];
  released = false;

  /** The session's cursor row; undefined = first read (self-baseline). */
  cursorRow?: { last_seq: number | string };
  /** What COALESCE(MAX(seq), 0) returns. */
  maxSeq: number | string = 0;
  /** The rows the bounded delta SELECT returns. */
  deltaRows: DeltaRow[] = [];
  /** When set, any query whose text includes this fragment throws. */
  failOnPattern?: string;

  async query(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values });
    if (this.failOnPattern !== undefined && text.includes(this.failOnPattern)) {
      throw new Error(`Fake-induced failure matching ${JSON.stringify(this.failOnPattern)}`);
    }
    if (text.includes("FROM events.claim_cursor")) {
      return { rows: this.cursorRow ? [this.cursorRow] : [] };
    }
    if (text.includes("MAX(seq)")) {
      return { rows: [{ max_seq: this.maxSeq }] };
    }
    if (text.includes("FROM events.claim_event e")) {
      return { rows: this.deltaRows };
    }
    return { rows: [] }; // BEGIN / COMMIT / ROLLBACK / cursor upsert
  }

  release(): void {
    this.released = true;
  }
}

class FakePool {
  constructor(readonly client: FakeCursorClient) {}
  async connect(): Promise<FakeCursorClient> {
    return this.client;
  }
  async query(): Promise<{ rows: unknown[] }> {
    return { rows: [] };
  }
}

function storeWith(client: FakeCursorClient): PgClaimStore {
  return new PgClaimStore(new FakePool(client) as never);
}

function cursorUpserts(client: FakeCursorClient): QueryCall[] {
  return client.calls.filter((c) => c.text.includes("INSERT INTO events.claim_cursor"));
}

function commits(client: FakeCursorClient): boolean {
  return client.calls.some((c) => c.text.includes("COMMIT"));
}

test("pullOverlapDeltas: FIRST READ self-baselines to the current max seq and returns EMPTY — never the backlog", async () => {
  const client = new FakeCursorClient();
  client.maxSeq = 42; // history exists…
  client.deltaRows = [
    { seq: 41, unit_id: "story-a", type: "claimed", session_id: "sess-b", doc: {}, at: AT },
  ]; // …and even if the delta SELECT would return rows, it must never be reached
  const store = storeWith(client);

  const deltas = await store.pullOverlapDeltas("sess-me");

  assert.deepEqual(deltas, [], "a fresh session hears only events written AFTER its first read");
  const upserts = cursorUpserts(client);
  assert.equal(upserts.length, 1, "the baseline is written");
  assert.deepEqual(upserts[0]?.values, ["sess-me", 42], "baselined to the CURRENT max seq");
  assert.ok(
    !client.calls.some((c) => c.text.includes("FROM events.claim_event e")),
    "the bounded delta SELECT is never issued on the first read",
  );
  assert.ok(commits(client));
  assert.ok(client.released);
});

test("pullOverlapDeltas: delivers the bounded intersection and advances the cursor to the snapshotted max IN THE SAME TRANSACTION", async () => {
  const client = new FakeCursorClient();
  client.cursorRow = { last_seq: 10 };
  client.maxSeq = 15;
  client.deltaRows = [
    {
      seq: 12,
      unit_id: "notice-board",
      type: "claimed",
      session_id: "sess-other",
      doc: { grade: "exploring", intent: "reading the spine" },
      at: AT,
    },
    { seq: 14, unit_id: "notice-board", type: "released", session_id: "sess-other", doc: { grade: "exploring" }, at: AT },
  ];
  const store = storeWith(client);

  const deltas = await store.pullOverlapDeltas("sess-me");

  assert.equal(deltas.length, 2);
  assert.deepEqual(deltas[0], {
    seq: 12,
    unitId: "notice-board",
    type: "claimed",
    sessionId: "sess-other",
    grade: "exploring",
    intent: "reading the spine",
    at: AT,
  });

  // The SQL shape: bounded window, own events excluded, own-LIVE-units intersection.
  const deltaSelect = client.calls.find((c) => c.text.includes("FROM events.claim_event e"));
  assert.ok(deltaSelect !== undefined);
  assert.ok(deltaSelect.text.includes("e.seq > $2 AND e.seq <= $3"), "the window is cursor < seq <= snapshotted max");
  assert.ok(deltaSelect.text.includes("e.session_id <> $1"), "a session is never told about its own events");
  assert.ok(deltaSelect.text.includes("SELECT unit_id FROM events.node_claim"), "intersected with the session's own claim units");
  assert.ok(deltaSelect.text.includes("heartbeat_at > now()"), "…live ones only (the listLiveClaims clock)");
  assert.deepEqual(deltaSelect.values.slice(0, 3), ["sess-me", 10, 15]);

  // Advance-with-delivery: the cursor moves to the SNAPSHOTTED max, before the COMMIT.
  const upserts = cursorUpserts(client);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0]?.values, ["sess-me", 15]);
  const upsertIdx = client.calls.findIndex((c) => c.text.includes("INSERT INTO events.claim_cursor"));
  const commitIdx = client.calls.findIndex((c) => c.text.includes("COMMIT"));
  assert.ok(upsertIdx < commitIdx, "the advance commits atomically with the delivery");
});

test("pullOverlapDeltas: nothing new (max <= cursor) is the silent fast path — no delta read, no cursor write", async () => {
  const client = new FakeCursorClient();
  client.cursorRow = { last_seq: 15 };
  client.maxSeq = 15;
  const store = storeWith(client);

  const deltas = await store.pullOverlapDeltas("sess-me");

  assert.deepEqual(deltas, []);
  assert.equal(cursorUpserts(client).length, 0, "no pointless cursor write");
  assert.ok(
    !client.calls.some((c) => c.text.includes("FROM events.claim_event e")),
    "no delta read either",
  );
  assert.ok(commits(client));
});

test("pullOverlapDeltas: a doc without grade/intent degrades gracefully (delta carries neither); conflict-refused rides through", async () => {
  const client = new FakeCursorClient();
  client.cursorRow = { last_seq: 0 };
  client.maxSeq = 2;
  client.deltaRows = [
    { seq: 1, unit_id: "story-a", type: "conflict-refused", session_id: "sess-d", doc: { grade: "bogus-grade", intent: 7 }, at: AT },
    { seq: 2, unit_id: "story-a", type: "released", session_id: "sess-d", doc: null, at: AT },
  ];
  const store = storeWith(client);

  const deltas = await store.pullOverlapDeltas("sess-me");

  assert.equal(deltas.length, 2);
  assert.equal(deltas[0]?.grade, undefined, "an unparseable grade is dropped, never a throw");
  assert.equal(deltas[0]?.intent, undefined, "a non-string intent is dropped");
  assert.equal(deltas[1]?.grade, undefined, "a null doc yields a bare delta");
});

test("pullOverlapDeltas: bigint-as-string seq/cursor/max (the pg driver's bigint shape) are coerced to numbers", async () => {
  const client = new FakeCursorClient();
  client.cursorRow = { last_seq: "10" };
  client.maxSeq = "15";
  client.deltaRows = [
    { seq: "12" as unknown as number, unit_id: "story-a", type: "released", session_id: "sess-b", doc: {}, at: AT },
  ];
  const store = storeWith(client);

  const deltas = await store.pullOverlapDeltas("sess-me");

  assert.equal(deltas[0]?.seq, 12);
  assert.deepEqual(cursorUpserts(client)[0]?.values, ["sess-me", 15], "the advance carries the numeric max");
});

test("pullOverlapDeltas: a mid-transaction failure ROLLS BACK and releases the client", async () => {
  const client = new FakeCursorClient();
  client.cursorRow = { last_seq: 10 };
  client.maxSeq = 15;
  client.failOnPattern = "FROM events.claim_event e";
  const store = storeWith(client);

  await assert.rejects(() => store.pullOverlapDeltas("sess-me"));
  assert.ok(client.calls.some((c) => c.text.includes("ROLLBACK")));
  assert.ok(!commits(client));
  assert.ok(client.released);
});

test("baselineCursor: upserts the session's cursor to the current max seq (GREATEST — never backwards) and commits", async () => {
  const client = new FakeCursorClient();
  client.maxSeq = 99;
  const store = storeWith(client);

  await store.baselineCursor("fresh-sess");

  const upserts = cursorUpserts(client);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0]?.values, ["fresh-sess", 99]);
  assert.ok(upserts[0]?.text.includes("GREATEST"), "a baseline never rewinds an advanced cursor");
  assert.ok(commits(client));
  assert.ok(client.released);
});
