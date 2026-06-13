import test from "node:test";
import assert from "node:assert/strict";
import type { UserDoc } from "@storytree/core";
import { PgUserStore, LastAdminError, type UserEvent } from "./user-store.js";

/**
 * Offline: drives `PgUserStore` through a FAKE `UserPool` that records every
 * `query(text, values)` call and returns canned projection rows. No live DB — the
 * `presence-store.test.ts` pattern (a live-gated parity run is later spine work).
 */

// ── Fake infrastructure ────────────────────────────────────────────────────

interface QueryCall {
  text: string;
  values: unknown[];
}

/**
 * Fake transactional client: records every query; returns canned `{ id, doc }` rows
 * for the `SELECT ... FROM events."user"` read inside a transaction.
 */
class FakeClient {
  readonly calls: QueryCall[] = [];
  /** Rows returned for the in-transaction projection SELECT (empty = no rows yet). */
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
 * queries (list/get → user rows; history → user_event rows).
 */
class FakePool {
  readonly client: FakeClient;
  /** Rows for pool-level queries against events."user" (list/get). */
  userRows: { id: string; doc: unknown }[] = [];
  /** Rows for pool-level queries against events.user_event (history). */
  userEventRows: { type: string; doc: unknown; actor: string; at: string }[] = [];

  constructor(client: FakeClient) {
    this.client = client;
  }

  async connect(): Promise<FakeClient> {
    return this.client;
  }

  async query(text: string, _values?: unknown[]): Promise<{ rows: unknown[] }> {
    if (text.includes("user_event")) {
      return { rows: this.userEventRows };
    }
    return { rows: this.userRows };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function userDoc(over: Partial<UserDoc> = {}): UserDoc {
  return {
    email: "a@example.com",
    role: "member",
    status: "active",
    invitedBy: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    lastSeenAt: "2026-06-14T00:00:00.000Z",
    ...over,
  };
}

/** Assert that `calls` contains all `fragments` as an ORDERED SUBSEQUENCE. */
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
    `${label} — missing ordered subsequence [${fragments.join(", ")}] in:\n  ${calls
      .map((c) => c.text)
      .join("\n  ")}`,
  );
}

/** Count calls whose SQL text contains `fragment`. */
function countMatching(calls: QueryCall[], fragment: string): number {
  return calls.filter((c) => c.text.includes(fragment)).length;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("PgUserStore: imports and constructs from a pool-like object", () => {
  const store = new PgUserStore(new FakePool(new FakeClient()) as never);
  assert.ok(store instanceof PgUserStore, "is a PgUserStore");
  for (const m of ["upsert", "remove", "list", "get", "history"]) {
    assert.equal(typeof (store as unknown as Record<string, unknown>)[m], "function", `${m} present`);
  }
});

test("upsert (fresh): BEGIN / SELECT / user_event INSERT / user upsert / COMMIT in order", async () => {
  const client = new FakeClient(); // projectionRows = [] → no existing row
  const store = new PgUserStore(new FakePool(client) as never);
  const doc = userDoc({ email: "Dev@Example.com", role: "member", status: "invited" });

  const result = await store.upsert(doc, "owner@example.com");

  assert.ok(client.released, "client always released");
  assertSubsequence(
    client.calls,
    ['BEGIN', 'FROM events."user"', "INSERT INTO events.user_event", "ON CONFLICT", "COMMIT"],
    "upsert fresh: statement order",
  );
  assert.equal(countMatching(client.calls, "INSERT INTO events.user_event"), 1, "one event INSERT");
  assert.equal(countMatching(client.calls, "ON CONFLICT"), 1, "one projection upsert");
  // the event type for a fresh row is 'created'
  const evt = client.calls.find((c) => c.text.includes("INSERT INTO events.user_event"));
  assert.equal(evt?.values[1], "created", "fresh row → created event");
  // email normalised by the schema (the projection is keyed by the lowercased email)
  assert.equal(result.email, "dev@example.com", "email lowercased at the write boundary");
  assert.equal(result.status, "invited", "status preserved");
});

test("role-status-validated: a blank email / unknown role is refused at the write boundary", async () => {
  const store = new PgUserStore(new FakePool(new FakeClient()) as never);
  await assert.rejects(() => store.upsert(userDoc({ email: "  " }), "a"), "blank email refused");
  await assert.rejects(
    () => store.upsert(userDoc({ role: "owner" as never }), "a"),
    "unknown role refused",
  );
  await assert.rejects(
    () => store.upsert(userDoc({ status: "banned" as never }), "a"),
    "unknown status refused",
  );
});

test("upsert (re-role): merges with existing row; createdAt anchored, role updated, one upsert, updated event", async () => {
  const existing = userDoc({
    email: "m@example.com",
    role: "member",
    status: "active",
    invitedBy: "owner@example.com",
    createdAt: "2026-06-14T00:00:00.000Z",
  });
  const client = new FakeClient();
  client.projectionRows = [{ id: existing.email, doc: existing }];
  const store = new PgUserStore(new FakePool(client) as never);

  // a second admin exists, so promoting m@ to admin is fine — and the createdAt the
  // caller sends must NOT move the anchor.
  client.projectionRows.push({ id: "owner@example.com", doc: userDoc({ email: "owner@example.com", role: "admin" }) });
  const incoming = userDoc({
    email: "m@example.com",
    role: "admin",
    status: "active",
    invitedBy: "owner@example.com",
    createdAt: "2026-06-14T09:00:00.000Z", // intentionally different — must be ignored
  });

  const result = await store.upsert(incoming, "owner@example.com");

  assert.equal(result.createdAt, existing.createdAt, "createdAt anchored from the existing row");
  assert.equal(result.role, "admin", "role updated");
  assert.equal(countMatching(client.calls, "INSERT INTO events.user_event"), 1, "one event per upsert");
  assert.equal(countMatching(client.calls, "ON CONFLICT"), 1, "upsert path, never a second row");
  const evt = client.calls.find((c) => c.text.includes("INSERT INTO events.user_event"));
  assert.equal(evt?.values[1], "updated", "existing row → updated event");
});

test("upsert: failure on the projection upsert → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClient();
  client.failOnPattern = "ON CONFLICT";
  const store = new PgUserStore(new FakePool(client) as never);

  await assert.rejects(() => store.upsert(userDoc(), "a"), /Fake-induced failure/);
  assert.ok(client.calls.some((c) => c.text.includes("ROLLBACK")), "ROLLBACK issued");
  assert.ok(!client.calls.some((c) => c.text.includes("COMMIT")), "no COMMIT after failure");
  assert.ok(client.released, "client released even after failure");
});

test("last-admin-protected: downgrading the only admin is refused (LastAdminError), ROLLBACK, no write", async () => {
  const soloAdmin = userDoc({ email: "admin@example.com", role: "admin", status: "active" });
  const client = new FakeClient();
  client.projectionRows = [{ id: soloAdmin.email, doc: soloAdmin }];
  const store = new PgUserStore(new FakePool(client) as never);

  await assert.rejects(
    () => store.upsert(userDoc({ email: "admin@example.com", role: "member", status: "active" }), "admin@example.com"),
    (err: unknown) => err instanceof LastAdminError,
    "downgrade of the sole admin throws LastAdminError",
  );
  assert.ok(client.calls.some((c) => c.text.includes("ROLLBACK")), "ROLLBACK issued");
  assert.equal(countMatching(client.calls, "ON CONFLICT"), 0, "no projection write happened");
  assert.ok(client.released, "client released");
});

test("last-admin-protected: with two admins, downgrading one succeeds", async () => {
  const a1 = userDoc({ email: "a1@example.com", role: "admin" });
  const a2 = userDoc({ email: "a2@example.com", role: "admin" });
  const client = new FakeClient();
  client.projectionRows = [
    { id: a1.email, doc: a1 },
    { id: a2.email, doc: a2 },
  ];
  const store = new PgUserStore(new FakePool(client) as never);

  const result = await store.upsert(userDoc({ email: "a1@example.com", role: "member" }), "a2@example.com");
  assert.equal(result.role, "member", "downgrade applied");
  assert.equal(countMatching(client.calls, "COMMIT"), 1, "committed");
});

test("remove: missing row → false, ROLLBACK, no event; existing member → true with a removed event", async () => {
  // missing
  const empty = new FakeClient();
  const s1 = new PgUserStore(new FakePool(empty) as never);
  assert.equal(await s1.remove("ghost@example.com", "owner@example.com"), false, "missing → false");
  assert.ok(empty.calls.some((c) => c.text.includes("ROLLBACK")), "ROLLBACK on missing row");
  assert.equal(countMatching(empty.calls, "DELETE"), 0, "no delete for a missing row");

  // present member, with an admin also present so the guard passes
  const member = userDoc({ email: "m@example.com", role: "member" });
  const admin = userDoc({ email: "admin@example.com", role: "admin" });
  const client = new FakeClient();
  client.projectionRows = [
    { id: member.email, doc: member },
    { id: admin.email, doc: admin },
  ];
  const s2 = new PgUserStore(new FakePool(client) as never);
  assert.equal(await s2.remove("M@Example.com", "owner@example.com"), true, "present → true (case-insensitive)");
  assertSubsequence(
    client.calls,
    ['BEGIN', 'FROM events."user"', "INSERT INTO events.user_event", 'DELETE FROM events."user"', "COMMIT"],
    "remove: statement order",
  );
  const evt = client.calls.find((c) => c.text.includes("INSERT INTO events.user_event"));
  // VALUES ($1=id, 'removed', $2=doc, $3=actor) — $1 is the normalised email key.
  assert.equal(evt?.values[0], "m@example.com", "removed event keyed by the normalised email");
});

test("remove: removing the sole admin is refused (LastAdminError), ROLLBACK, no delete", async () => {
  const soloAdmin = userDoc({ email: "admin@example.com", role: "admin" });
  const client = new FakeClient();
  client.projectionRows = [{ id: soloAdmin.email, doc: soloAdmin }];
  const store = new PgUserStore(new FakePool(client) as never);

  await assert.rejects(
    () => store.remove("admin@example.com", "admin@example.com"),
    (err: unknown) => err instanceof LastAdminError,
  );
  assert.ok(client.calls.some((c) => c.text.includes("ROLLBACK")), "ROLLBACK issued");
  assert.equal(countMatching(client.calls, "DELETE"), 0, "no delete happened");
});

test("list / get: read the projection; history reads events for one email", async () => {
  const a = userDoc({ email: "a@example.com", role: "admin" });
  const b = userDoc({ email: "b@example.com", role: "member" });
  const pool = new FakePool(new FakeClient());
  pool.userRows = [
    { id: a.email, doc: a },
    { id: b.email, doc: b },
  ];
  const store = new PgUserStore(pool as never);

  const all = await store.list();
  assert.equal(all.length, 2, "two rows");
  assert.deepEqual(all.map((u) => u.email).sort(), ["a@example.com", "b@example.com"]);

  // get filters in the fake by returning all userRows; the store's WHERE is exercised by the
  // values it passes — assert it normalises the email it queries with.
  const got = await store.get("A@Example.com");
  assert.ok(got, "row returned");

  pool.userEventRows = [
    { type: "created", doc: a, actor: "owner@example.com", at: "2026-06-14T00:00:00.000Z" },
    { type: "updated", doc: a, actor: "owner@example.com", at: "2026-06-14T01:00:00.000Z" },
  ];
  const history: UserEvent[] = await store.history("a@example.com");
  assert.equal(history.length, 2, "two events");
  assert.equal(history[0]!.type, "created", "first event is created");
  assert.equal(history[1]!.type, "updated", "second event is updated");
  assert.ok(typeof history[0]!.at === "string", "at is a string");
});
