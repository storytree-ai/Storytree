import test from "node:test";
import assert from "node:assert/strict";

import { PgClaimStore } from "./claim-store.js";

/**
 * Offline: drive `PgClaimStore` through a FAKE pool that records every query and returns canned
 * rows, asserting the CONTROL FLOW — which branch each claim takes (fresh / re-entrant / reclaim /
 * REFUSED), the typed audit event it appends, and COMMIT-vs-ROLLBACK. The real DB-level atomicity
 * (two concurrent claims, exactly one wins) is exercised by the live-gated leg at the bottom.
 *
 * The headline red→green: a SECOND session claiming a unit a FIRST still-live session holds is
 * REFUSED (the confirmed 2026-06-27 duplicate-build race).
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";
const NOW = new Date("2026-06-27T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

interface ClaimRow {
  unit_id: string;
  session_id: string;
  branch: string;
  intent: string;
  claimed_at: string;
  heartbeat_at: string;
}

interface QueryCall {
  text: string;
  values: unknown[];
}

interface AppendedEvent {
  unitId: string;
  type: string;
  sessionId: string;
}

function rowFromWriteValues(values: unknown[], heartbeatAt: string = NOW_ISO): ClaimRow {
  return {
    unit_id: String(values[0]),
    session_id: String(values[1]),
    branch: String(values[2]),
    intent: String(values[3]),
    claimed_at: NOW_ISO,
    heartbeat_at: heartbeatAt,
  };
}

/** Fake transactional client: SQL-fragment routing with configurable holder / race outcomes. */
class FakeClaimClient {
  readonly calls: QueryCall[] = [];
  readonly events: AppendedEvent[] = [];
  released = false;

  /** The row the holder read (`... FOR UPDATE`) returns; undefined = unclaimed. */
  existingForUpdate?: ClaimRow;
  /** The row the post-race-loss re-SELECT returns (the winner). */
  winnerRow?: ClaimRow;
  /** When true the fresh INSERT … RETURNING returns 0 rows (we lost the insert race). */
  insertRaceLost = false;
  /** The row a DELETE (release) returns; undefined = nothing of ours to release. */
  deleteReturns?: ClaimRow;
  /** The rows a releaseClaimsByBranch DELETE returns; the bulk branch-clear can remove many. */
  branchDeleteReturns?: ClaimRow[];
  /** The row a bumpHeartbeat UPDATE returns; undefined = nothing of ours to bump. */
  bumpReturns?: ClaimRow;
  /** When set, any query whose text includes this fragment throws. */
  failOnPattern?: string;

  async query(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values });
    if (this.failOnPattern !== undefined && text.includes(this.failOnPattern)) {
      throw new Error(`Fake-induced failure matching ${JSON.stringify(this.failOnPattern)}`);
    }
    if (text.includes("INSERT INTO events.node_claim")) {
      return { rows: this.insertRaceLost ? [] : [rowFromWriteValues(values)] };
    }
    if (text.includes("INSERT INTO events.claim_event")) {
      this.events.push({
        unitId: String(values[0]),
        type: String(values[1]),
        sessionId: String(values[2]),
      });
      return { rows: [] };
    }
    const head = text.trimStart().toUpperCase();
    if (head.startsWith("SELECT") && text.includes("events.node_claim")) {
      if (text.includes("FOR UPDATE")) {
        return { rows: this.existingForUpdate ? [this.existingForUpdate] : [] };
      }
      return { rows: this.winnerRow ? [this.winnerRow] : [] };
    }
    // The heartbeat bump is the only UPDATE whose SET clause STARTS with heartbeat_at (claim()'s
    // multi-column UPDATE never contains the literal "SET heartbeat_at = now()") — route it first.
    if (head.startsWith("UPDATE") && text.includes("SET heartbeat_at = now()")) {
      return { rows: this.bumpReturns ? [this.bumpReturns] : [] };
    }
    if (head.startsWith("UPDATE") && text.includes("events.node_claim")) {
      return { rows: [rowFromWriteValues(values)] };
    }
    // The bulk branch-clear (releaseClaimsByBranch) deletes by `branch` alone and can return MANY
    // rows; release() deletes one by (unit_id, session_id). Route the branch form first.
    if (head.startsWith("DELETE") && text.includes("WHERE branch =")) {
      return { rows: this.branchDeleteReturns ?? [] };
    }
    if (head.startsWith("DELETE")) {
      return { rows: this.deleteReturns ? [this.deleteReturns] : [] };
    }
    return { rows: [] }; // BEGIN / COMMIT / ROLLBACK
  }

  release(): void {
    this.released = true;
  }
}

class FakePool {
  constructor(readonly client: FakeClaimClient) {}
  async connect(): Promise<FakeClaimClient> {
    return this.client;
  }
  async query(): Promise<{ rows: unknown[] }> {
    return { rows: [] };
  }
}

function storeWith(client: FakeClaimClient): PgClaimStore {
  return new PgClaimStore(new FakePool(client) as never);
}

function heldRow(over: Partial<ClaimRow> = {}): ClaimRow {
  return {
    unit_id: "chat-session-stream",
    session_id: "session-A",
    branch: "claude/a",
    intent: "real",
    claimed_at: NOW_ISO,
    heartbeat_at: NOW_ISO,
    ...over,
  };
}

const REQ_B = {
  unitId: "chat-session-stream",
  sessionId: "session-B",
  branch: "claude/b",
  intent: "real",
} as const;

function commits(client: FakeClaimClient): boolean {
  return client.calls.some((c) => c.text.includes("COMMIT"));
}
function rollsBack(client: FakeClaimClient): boolean {
  return client.calls.some((c) => c.text.includes("ROLLBACK"));
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("constructs from a pool-like object with the claim/release/current/history surface", () => {
  const store = storeWith(new FakeClaimClient());
  assert.ok(store instanceof PgClaimStore);
  for (const m of ["claim", "release", "current", "history"] as const) {
    assert.equal(typeof store[m], "function", `${m} present`);
  }
});

test("claim (fresh): unclaimed unit → acquired, INSERT + 'claimed' event, COMMIT", async () => {
  const client = new FakeClaimClient(); // existingForUpdate undefined → unclaimed
  const res = await storeWith(client).claim(REQ_B, { now: NOW });

  assert.equal(res.acquired, true);
  if (res.acquired) {
    assert.equal(res.reclaimed, false);
    assert.equal(res.claim.sessionId, "session-B");
  }
  assert.ok(client.calls.some((c) => c.text.includes("INSERT INTO events.node_claim")), "insert issued");
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "claimed", sessionId: "session-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released, "client released");
});

test("claim (REFUSED — the red→green): a different session's live claim → acquired:false, holder named, 'conflict-refused' event, NO write to node_claim", async () => {
  const client = new FakeClaimClient();
  client.existingForUpdate = heldRow(); // session-A holds it, heartbeat = now (fresh)
  const res = await storeWith(client).claim(REQ_B, { now: NOW });

  assert.equal(res.acquired, false);
  if (!res.acquired) {
    assert.equal(res.heldBy.sessionId, "session-A");
    assert.equal(res.heldBy.branch, "claude/a");
  }
  // The refusal NEVER mutates the holder row — no INSERT, no UPDATE on node_claim.
  assert.ok(!client.calls.some((c) => c.text.includes("INSERT INTO events.node_claim")), "no insert");
  assert.ok(
    !client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("UPDATE")),
    "no update",
  );
  // But the refusal IS a typed event (ADR-0009) and IS committed (the audit must persist).
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "conflict-refused", sessionId: "session-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("claim (re-entrant): same session re-claims → acquired, reclaimed:false, UPDATE + 'claimed' event", async () => {
  const client = new FakeClaimClient();
  client.existingForUpdate = heldRow({ session_id: "session-B", branch: "claude/b" });
  const res = await storeWith(client).claim(REQ_B, { now: NOW });

  assert.equal(res.acquired, true);
  if (res.acquired) assert.equal(res.reclaimed, false);
  assert.ok(client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("UPDATE")), "update issued");
  assert.deepEqual(client.events.map((e) => e.type), ["claimed"]);
});

test("claim (reclaim): a STALE other-session claim → acquired, reclaimed:true, 'reclaimed' event", async () => {
  const client = new FakeClaimClient();
  const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1_000).toISOString();
  client.existingForUpdate = heldRow({ session_id: "session-A", heartbeat_at: threeHoursAgo });
  const res = await storeWith(client).claim(REQ_B, { now: NOW }); // default 2h threshold

  assert.equal(res.acquired, true);
  if (res.acquired) assert.equal(res.reclaimed, true);
  assert.deepEqual(client.events.map((e) => e.type), ["reclaimed"]);
});

test("claim (insert race lost): unclaimed at read, but the INSERT loses → refused with the winner named", async () => {
  const client = new FakeClaimClient(); // existingForUpdate undefined → took the fresh path
  client.insertRaceLost = true;
  client.winnerRow = heldRow({ session_id: "session-A" });
  const res = await storeWith(client).claim(REQ_B, { now: NOW });

  assert.equal(res.acquired, false);
  if (!res.acquired) assert.equal(res.heldBy.sessionId, "session-A");
  assert.deepEqual(client.events.map((e) => e.type), ["conflict-refused"]);
  assert.ok(commits(client));
});

test("claim: fail-closed on blank attribution (never opens a transaction)", async () => {
  const client = new FakeClaimClient();
  await assert.rejects(
    () => storeWith(client).claim({ ...REQ_B, branch: "  " }, { now: NOW }),
    /non-blank/,
  );
  assert.equal(client.calls.length, 0, "validation precedes any query");
});

test("claim: a DB error mid-transaction → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClaimClient();
  client.failOnPattern = "INSERT INTO events.claim_event"; // blow up the audit append
  await assert.rejects(() => storeWith(client).claim(REQ_B, { now: NOW }), /Fake-induced failure/);
  assert.ok(rollsBack(client) && !commits(client), "rolled back, not committed");
  assert.ok(client.released, "client released even on failure");
});

test("release (held by us): DELETE removes the row, 'released' event, returns true", async () => {
  const client = new FakeClaimClient();
  client.deleteReturns = heldRow({ session_id: "session-B" });
  const ok = await storeWith(client).release("chat-session-stream", "session-B");
  assert.equal(ok, true);
  assert.deepEqual(client.events.map((e) => e.type), ["released"]);
  assert.ok(commits(client));
});

test("release (nothing of ours): DELETE removes nothing → returns false, no 'released' event", async () => {
  const client = new FakeClaimClient(); // deleteReturns undefined
  const ok = await storeWith(client).release("chat-session-stream", "session-B");
  assert.equal(ok, false);
  assert.equal(client.events.length, 0);
  assert.ok(commits(client));
});

// ── releaseClaimsByBranch (A1, ADR-0138 §4): the CI merge bulk-clear ──────────
// The DB-level atomicity is proven live in claim-store-release-by-branch.live.test.ts (the --real
// arm). This offline control-flow test keeps the method EXERCISED in the package suite + CI, where
// the live file skips for want of a DB — so the bulk-release never goes uncovered.

test("releaseClaimsByBranch: bulk-DELETE by branch → returns the count, one 'released' event per cleared claim, COMMIT", async () => {
  const client = new FakeClaimClient();
  client.branchDeleteReturns = [
    heldRow({ unit_id: "unit-alpha", session_id: "sess-A", branch: "claude/x" }),
    heldRow({ unit_id: "unit-beta", session_id: "sess-B", branch: "claude/x" }),
  ];
  const count = await storeWith(client).releaseClaimsByBranch("claude/x");

  assert.equal(count, 2, "returns the number of cleared claims");
  assert.ok(
    client.calls.some((c) => c.text.includes("DELETE FROM events.node_claim WHERE branch =")),
    "deletes by branch alone",
  );
  // One 'released' audit event per cleared claim, attributed to each claim's own session.
  assert.deepEqual(client.events, [
    { unitId: "unit-alpha", type: "released", sessionId: "sess-A" },
    { unitId: "unit-beta", type: "released", sessionId: "sess-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("releaseClaimsByBranch (no claims on the branch): returns 0, no 'released' event, still COMMITs", async () => {
  const client = new FakeClaimClient(); // branchDeleteReturns undefined → nothing matched
  const count = await storeWith(client).releaseClaimsByBranch("claude/empty");
  assert.equal(count, 0);
  assert.equal(client.events.length, 0);
  assert.ok(commits(client));
});

test("releaseClaimsByBranch: a DB error mid-transaction → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClaimClient();
  client.branchDeleteReturns = [heldRow({ unit_id: "unit-alpha", session_id: "sess-A", branch: "claude/x" })];
  client.failOnPattern = "INSERT INTO events.claim_event"; // blow up the audit append
  await assert.rejects(() => storeWith(client).releaseClaimsByBranch("claude/x"), /Fake-induced failure/);
  assert.ok(rollsBack(client) && !commits(client));
  assert.ok(client.released);
});

// ── bumpHeartbeat (A2, ADR-0138 §4): the store-side liveness refresh ──────────

test("bumpHeartbeat (held by us): UPDATE refreshes heartbeat_at → returns true, COMMIT, and NO audit event", async () => {
  const client = new FakeClaimClient();
  client.bumpReturns = heldRow({ session_id: "session-B" });
  const ok = await storeWith(client).bumpHeartbeat("chat-session-stream", "session-B");

  assert.equal(ok, true);
  assert.ok(
    client.calls.some((c) => c.text.includes("SET heartbeat_at = now()")),
    "the bump UPDATE was issued",
  );
  // A heartbeat is a high-frequency liveness signal, not a state transition — never audited.
  assert.equal(client.events.length, 0, "no claim_event for a heartbeat bump");
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("bumpHeartbeat (nothing of ours): UPDATE matches no row → returns false, no audit event, still COMMITs", async () => {
  const client = new FakeClaimClient(); // bumpReturns undefined
  const ok = await storeWith(client).bumpHeartbeat("chat-session-stream", "session-B");
  assert.equal(ok, false);
  assert.equal(client.events.length, 0);
  assert.ok(commits(client));
});

// ── Live-gated: real atomic claim/refuse/reclaim over Postgres ────────────────

if (LIVE) {
  test("live: two concurrent claims on one unit — exactly one wins; release lets the other in; stale reclaim", async () => {
    const { createTestPool } = await import("@storytree/library/store");
    const { closePool, applySchema } = await import("@storytree/library/store");
    const { pool, connector } = await createTestPool();
    try {
      await applySchema(pool);
      await pool.query("TRUNCATE events.node_claim");
      await pool.query("TRUNCATE events.claim_event");
      const store = new PgClaimStore(pool);
      const unit = "live-claim-unit";

      // First session takes it; a second, live, is REFUSED and told who holds it.
      const a = await store.claim({ unitId: unit, sessionId: "sess-A", branch: "a", intent: "real" });
      const b = await store.claim({ unitId: unit, sessionId: "sess-B", branch: "b", intent: "real" });
      assert.equal(a.acquired, true);
      assert.equal(b.acquired, false);
      if (!b.acquired) assert.equal(b.heldBy.sessionId, "sess-A");

      // Different unit never contends.
      const other = await store.claim({ unitId: "other-unit", sessionId: "sess-B", branch: "b" });
      assert.equal(other.acquired, true);

      // Release by the holder lets the next session in.
      assert.equal(await store.release(unit, "sess-A"), true);
      const b2 = await store.claim({ unitId: unit, sessionId: "sess-B", branch: "b" });
      assert.equal(b2.acquired, true);

      // Stale reclaim: backdate B's heartbeat past the threshold; A reclaims it.
      await pool.query(
        "UPDATE events.node_claim SET heartbeat_at = now() - interval '3 hours' WHERE unit_id = $1",
        [unit],
      );
      const a2 = await store.claim({ unitId: unit, sessionId: "sess-A", branch: "a" });
      assert.equal(a2.acquired, true);
      if (a2.acquired) assert.equal(a2.reclaimed, true);

      // True concurrency: 8 sessions race the SAME fresh unit → exactly one wins.
      await pool.query("TRUNCATE events.node_claim");
      const race = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          store.claim({ unitId: "race-unit", sessionId: `racer-${i}`, branch: "r" }),
        ),
      );
      assert.equal(race.filter((r) => r.acquired).length, 1, "exactly one of 8 racers acquires");

      // The audit history carries the typed refusal (ADR-0009).
      const hist = await store.history(unit);
      assert.ok(hist.some((e) => e.type === "conflict-refused"), "a refusal was recorded");
      assert.ok(hist.some((e) => e.type === "reclaimed"), "a reclaim was recorded");
    } finally {
      await closePool(pool, connector);
    }
  });
}
