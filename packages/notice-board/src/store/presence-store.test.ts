import test from "node:test";
import assert from "node:assert/strict";
import type { PresenceDeclarationDoc } from "@storytree/notice-board";
import {
  PgPresenceStore,
  type PresenceEvent,
} from "./presence-store.js";

/**
 * Offline: drives `PgPresenceStore` through a FAKE `PresencePool` that records every
 * `query(text, values)` call and returns canned projection rows.  No live DB, no
 * STORYTREE_DB_LIVE leg — the live-gated parity run is later spine work.
 */

// ── Fake infrastructure ────────────────────────────────────────────────────

interface QueryCall {
  text: string;
  values?: unknown[];
}

/**
 * Fake transactional client: records every query; returns canned `{ id, doc }` rows
 * for SELECT statements (simulating the projection read inside a transaction).
 */
class FakeClient {
  readonly calls: QueryCall[] = [];
  /** Rows returned for SELECT queries (empty = no existing row). */
  projectionRows: { id: string; doc: unknown }[] = [];
  released = false;
  /** When set, throw a fake error if query text includes this fragment. */
  failOnPattern?: string;

  async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values: values ?? [] });
    if (this.failOnPattern !== undefined && text.includes(this.failOnPattern)) {
      throw new Error(`Fake-induced failure matching: ${JSON.stringify(this.failOnPattern)}`);
    }
    if (text.trimStart().toUpperCase().startsWith("SELECT")) {
      return { rows: this.projectionRows };
    }
    return { rows: [] };
  }

  release(): void {
    this.released = true;
  }
}

/**
 * Fake pool: provides a transactional client via `connect()` and answers pool-level
 * queries (listActive → session rows; history → session_event rows).
 */
class FakePool {
  readonly client: FakeClient;
  /** Rows for pool-level queries against events.session (listActive). */
  sessionRows: { id: string; doc: unknown }[] = [];
  /** Rows for pool-level queries against events.session_event (history). */
  sessionEventRows: { type: string; doc: unknown; actor: string; at: string }[] = [];

  constructor(client: FakeClient) {
    this.client = client;
  }

  async connect(): Promise<FakeClient> {
    return this.client;
  }

  async query(text: string, _values?: unknown[]): Promise<{ rows: unknown[] }> {
    if (text.includes("session_event")) {
      return { rows: this.sessionEventRows };
    }
    return { rows: this.sessionRows };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sampleDoc(over: Partial<PresenceDeclarationDoc> = {}): PresenceDeclarationDoc {
  return {
    sessionId: "session-abc",
    branch: "feature/test",
    workingOn: "testing presence store",
    nodes: ["declare-presence"],
    status: "active",
    startedAt: "2026-06-11T00:00:00.000Z",
    lastSeenAt: "2026-06-11T01:00:00.000Z",
    ...over,
  };
}

/**
 * Assert that `calls` contains all `fragments` as an ORDERED SUBSEQUENCE (not necessarily
 * consecutive).  Fails with a descriptive message that lists the recorded SQL texts.
 */
function assertSubsequence(calls: QueryCall[], fragments: string[], label: string): void {
  let fi = 0;
  for (const call of calls) {
    if (fi < fragments.length && call.text.includes(fragments[fi] as string)) {
      fi++;
    }
  }
  assert.equal(
    fi,
    fragments.length,
    `${label} — missing ordered subsequence [${fragments.join(", ")}] in:\n  ${calls.map((c) => c.text).join("\n  ")}`,
  );
}

/** Count calls whose SQL text contains `fragment`. */
function countMatching(calls: QueryCall[], fragment: string): number {
  return calls.filter((c) => c.text.includes(fragment)).length;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("PgPresenceStore: imports and constructs from a pool-like object", () => {
  const store = new PgPresenceStore(new FakePool(new FakeClient()) as never);
  assert.ok(store instanceof PgPresenceStore, "is a PgPresenceStore");
  assert.equal(typeof store.declare, "function", "declare method present");
  assert.equal(typeof store.done, "function", "done method present");
  assert.equal(typeof store.listActive, "function", "listActive method present");
  assert.equal(typeof store.history, "function", "history method present");
});

test("declare (fresh): issues BEGIN / SELECT / session_event INSERT / session upsert / COMMIT in order", async () => {
  const client = new FakeClient(); // projectionRows = [] → no existing row
  const pool = new FakePool(client);
  const store = new PgPresenceStore(pool as never);
  const doc = sampleDoc();

  const result = await store.declare(doc);

  assert.ok(client.released, "client always released");

  // Ordered subsequence: BEGIN → projection SELECT → event append → projection upsert → COMMIT
  assertSubsequence(
    client.calls,
    ["BEGIN", "FROM events.session", "INSERT INTO events.session_event", "ON CONFLICT", "COMMIT"],
    "declare fresh: statement order",
  );

  // Exactly one event insert and one upsert — no extras
  assert.equal(countMatching(client.calls, "INSERT INTO events.session_event"), 1, "one session_event INSERT");
  assert.equal(countMatching(client.calls, "ON CONFLICT"), 1, "one session upsert");

  // Return value matches the incoming doc (no merge when no existing row)
  assert.equal(result.sessionId, doc.sessionId, "sessionId preserved");
  assert.equal(result.workingOn, doc.workingOn, "workingOn preserved");
  assert.equal(result.startedAt, doc.startedAt, "startedAt preserved");
});

test("declare: failure on upsert → ROLLBACK issued, no COMMIT, client released", async () => {
  const client = new FakeClient();
  client.failOnPattern = "ON CONFLICT"; // blow up the projection upsert
  const pool = new FakePool(client);
  const store = new PgPresenceStore(pool as never);

  await assert.rejects(
    () => store.declare(sampleDoc()),
    /Fake-induced failure/,
    "store rethrows the DB error",
  );

  assert.ok(
    client.calls.some((c) => c.text.includes("ROLLBACK")),
    "ROLLBACK issued on failure",
  );
  assert.ok(
    !client.calls.some((c) => c.text.includes("COMMIT")),
    "no COMMIT after failure (abort-together)",
  );
  assert.ok(client.released, "client released even after failure (finally block)");
});

test("declare (re-declare): merges with existing row; startedAt anchored, workingOn/nodes updated, one upsert", async () => {
  const original = sampleDoc({
    workingOn: "original task",
    nodes: ["node-alpha"],
    startedAt: "2026-06-11T00:00:00.000Z",
    lastSeenAt: "2026-06-11T01:00:00.000Z",
  });

  const client = new FakeClient();
  client.projectionRows = [{ id: original.sessionId, doc: original }];
  const pool = new FakePool(client);
  const store = new PgPresenceStore(pool as never);

  // Incoming doc has a DIFFERENT startedAt to prove the merge anchors from existing
  const incoming = sampleDoc({
    workingOn: "updated task",
    nodes: ["node-alpha", "node-beta"],
    startedAt: "2026-06-11T09:00:00.000Z", // intentionally different — must be ignored
    lastSeenAt: "2026-06-11T02:00:00.000Z",
  });

  const result = await store.declare(incoming);

  // Anchor fields come from the existing row
  assert.equal(result.startedAt, original.startedAt, "startedAt anchored from existing row (not incoming)");
  assert.equal(result.sessionId, original.sessionId, "sessionId unchanged");

  // Updatable fields reflect the incoming doc
  assert.equal(result.workingOn, incoming.workingOn, "workingOn updated");
  assert.deepEqual(result.nodes, incoming.nodes, "nodes updated");

  // Exactly one event insert (history grows by one per declare call)
  assert.equal(countMatching(client.calls, "INSERT INTO events.session_event"), 1, "one event per re-declare");
  // One upsert — not two inserts (no second projection row created)
  assert.equal(countMatching(client.calls, "ON CONFLICT"), 1, "upsert path, never a second row");

  assert.ok(client.released, "client released");
});

test("done: returns null when projection row is missing; ROLLBACK issued, client released", async () => {
  const client = new FakeClient(); // projectionRows = [] → no row
  const pool = new FakePool(client);
  const store = new PgPresenceStore(pool as never);

  const result = await store.done("session-abc", "2026-06-11T10:00:00.000Z");

  assert.equal(result, null, "null returned for missing session");
  assert.ok(
    client.calls.some((c) => c.text.includes("ROLLBACK")),
    "ROLLBACK issued on missing row",
  );
  assert.ok(
    !client.calls.some((c) => c.text.includes("COMMIT")),
    "no COMMIT when row is missing",
  );
  assert.ok(client.released, "client released");
});

test("done: flips status to 'done', updates lastSeenAt, appends event, commits", async () => {
  const existing = sampleDoc({ status: "active" });
  const client = new FakeClient();
  client.projectionRows = [{ id: existing.sessionId, doc: existing }];
  const pool = new FakePool(client);
  const store = new PgPresenceStore(pool as never);

  const lastSeenAt = "2026-06-11T10:00:00.000Z";
  const result = await store.done(existing.sessionId, lastSeenAt);

  assert.ok(result !== null, "result not null for existing session");
  assert.equal(result!.status, "done", "status flipped to done");
  assert.equal(result!.lastSeenAt, lastSeenAt, "lastSeenAt updated to provided value");
  assert.equal(result!.sessionId, existing.sessionId, "sessionId preserved (anchor)");
  assert.equal(result!.startedAt, existing.startedAt, "startedAt preserved (anchor)");

  // Correct statement order: BEGIN → SELECT → event INSERT → upsert → COMMIT
  assertSubsequence(
    client.calls,
    ["BEGIN", "FROM events.session", "INSERT INTO events.session_event", "ON CONFLICT", "COMMIT"],
    "done: statement order",
  );
  assert.equal(countMatching(client.calls, "INSERT INTO events.session_event"), 1, "one done event appended");
  assert.ok(client.released, "client released");
});

test("listActive: returns only projection rows with doc.status === 'active'", async () => {
  const activeA = sampleDoc({ sessionId: "session-a", status: "active" });
  const activeB = sampleDoc({ sessionId: "session-b", status: "active" });
  const doneC = sampleDoc({ sessionId: "session-c", status: "done" });

  const client = new FakeClient();
  const pool = new FakePool(client);
  pool.sessionRows = [
    { id: activeA.sessionId, doc: activeA },
    { id: activeB.sessionId, doc: activeB },
    { id: doneC.sessionId, doc: doneC },
  ];
  const store = new PgPresenceStore(pool as never);

  const result = await store.listActive();

  assert.equal(result.length, 2, "only two active sessions returned");
  assert.ok(
    result.every((d) => d.status === "active"),
    "every returned doc has status=active",
  );
  const ids = result.map((d) => d.sessionId);
  assert.ok(ids.includes("session-a"), "active session-a included");
  assert.ok(ids.includes("session-b"), "active session-b included");
  assert.ok(!ids.includes("session-c"), "done session-c excluded");
});

test("history: returns PresenceEvent array for the sessionId in seq order", async () => {
  const client = new FakeClient();
  const pool = new FakePool(client);
  // Three events in ascending time order (the fake preserves insertion order)
  const eventRows: { type: string; doc: unknown; actor: string; at: string }[] = [
    {
      type: "declared",
      doc: sampleDoc(),
      actor: "session-abc",
      at: "2026-06-11T00:00:00.000Z",
    },
    {
      type: "declared",
      doc: sampleDoc({ workingOn: "updated task" }),
      actor: "session-abc",
      at: "2026-06-11T01:00:00.000Z",
    },
    {
      type: "done",
      doc: sampleDoc({ status: "done" }),
      actor: "session-abc",
      at: "2026-06-11T02:00:00.000Z",
    },
  ];
  pool.sessionEventRows = eventRows;
  const store = new PgPresenceStore(pool as never);

  const events: PresenceEvent[] = await store.history("session-abc");

  assert.equal(events.length, 3, "all 3 events returned");
  assert.equal(events[0]!.type, "declared", "first event is declared");
  assert.equal(events[1]!.type, "declared", "second event is declared");
  assert.equal(events[2]!.type, "done", "third event is done");
  assert.equal(events[0]!.actor, "session-abc", "actor field present on events");
  assert.ok(typeof events[0]!.at === "string", "at field is a string");
  assert.ok(events[0]!.doc !== undefined, "doc field present on events");
});
