import test from "node:test";
import assert from "node:assert/strict";

import { claimGrade, CLAIM_STALE_RECLAIM_MS } from "../claim.js";
import { PgClaimStore } from "./claim-store.js";

/**
 * Offline: drive `PgClaimStore` through a FAKE pool that records every query and returns canned
 * rows, asserting the CONTROL FLOW — which branch each transition takes (fresh / re-entrant /
 * reclaim / REFUSED / shared take / upgrade / queue / downgrade / promote), the typed audit event
 * it appends, and COMMIT-vs-ROLLBACK. The real DB-level atomicity (two concurrent claims, exactly
 * one wins; partial-index exclusivity; real claimed_at queue ordering) is exercised by the
 * live-gated leg at the bottom and by claim-store-grades.live.test.ts.
 *
 * The headline red→green: a SECOND session claiming a unit a FIRST still-live session holds is
 * REFUSED (the confirmed 2026-06-27 duplicate-build race) — unchanged under the ADR-0200 grade
 * ledger, where it becomes the WORK grade's exclusivity.
 */

const LIVE = process.env["STORYTREE_DB_LIVE"] === "1";
const NOW = new Date("2026-06-27T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

interface ClaimRow {
  unit_id: string;
  session_id: string;
  grade?: string;
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

/** The work-path writes carry values [unit, session, branch, intent] (grade is a SQL literal). */
function rowFromWriteValues(values: unknown[], heartbeatAt: string = NOW_ISO): ClaimRow {
  return {
    unit_id: String(values[0]),
    session_id: String(values[1]),
    grade: "work",
    branch: String(values[2]),
    intent: String(values[3]),
    claimed_at: NOW_ISO,
    heartbeat_at: heartbeatAt,
  };
}

/** The shared take upsert carries values [unit, session, grade, branch, intent]. */
function rowFromSharedTakeValues(values: unknown[]): ClaimRow {
  return {
    unit_id: String(values[0]),
    session_id: String(values[1]),
    grade: String(values[2]),
    branch: String(values[3]),
    intent: String(values[4]),
    claimed_at: NOW_ISO,
    heartbeat_at: NOW_ISO,
  };
}

/** The waiting (queue-join) upsert carries values [unit, session, branch, intent]. */
function rowFromWaitingValues(values: unknown[]): ClaimRow {
  return {
    unit_id: String(values[0]),
    session_id: String(values[1]),
    grade: "waiting",
    branch: String(values[2]),
    intent: String(values[3]),
    claimed_at: NOW_ISO,
    heartbeat_at: NOW_ISO,
  };
}

/** Fake transactional client: SQL-fragment routing with configurable holder / race outcomes. */
class FakeClaimClient {
  readonly calls: QueryCall[] = [];
  readonly events: AppendedEvent[] = [];
  released = false;

  /** The row the WORK-holder read (`grade = 'work' … FOR UPDATE`) returns; undefined = slot free. */
  existingForUpdate?: ClaimRow;
  /** The row the session's OWN-row read (`session_id = $2 … FOR UPDATE`) returns (upgrade/downgrade). */
  ownRowForUpdate?: ClaimRow;
  /** The row the post-race-loss re-SELECT returns (the winner). */
  winnerRow?: ClaimRow;
  /** The unit's waiting rows the promotion pick (`grade = 'waiting'`) sees. */
  waiterRows?: ClaimRow[];
  /** When true the fresh work INSERT … RETURNING returns 0 rows (we lost the insert race). */
  insertRaceLost = false;
  /** The rows the own-shared-row FOLD delete (`grade <> 'work'`) returns. */
  foldDeleteReturns?: ClaimRow[];
  /** The row a DELETE (release) returns; undefined = nothing of ours to release. */
  deleteReturns?: ClaimRow;
  /** The rows a releaseClaimsByBranch DELETE returns; the bulk branch-clear can remove many. */
  branchDeleteReturns?: ClaimRow[];
  /** The rows a releaseClaimsBySession DELETE returns; the `done` bulk-release can remove many. */
  sessionDeleteReturns?: ClaimRow[];
  /** The row a bumpHeartbeat UPDATE returns; undefined = nothing of ours to bump. */
  bumpReturns?: ClaimRow;
  /** The rows a bumpHeartbeatsBySession UPDATE returns; the session bulk-bump can touch many. */
  sessionBumpReturns?: ClaimRow[];
  /** When set, any query whose text includes this fragment throws. */
  failOnPattern?: string;

  async query(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values });
    if (this.failOnPattern !== undefined && text.includes(this.failOnPattern)) {
      throw new Error(`Fake-induced failure matching ${JSON.stringify(this.failOnPattern)}`);
    }
    if (text.includes("INSERT INTO events.node_claim")) {
      // The queue-join upsert stamps its grade as the literal 'waiting'.
      if (text.includes("'waiting'")) return { rows: [rowFromWaitingValues(values)] };
      // The shared take upserts on the composite PK, grade as $3.
      if (text.includes("ON CONFLICT (unit_id, session_id)")) {
        return { rows: [rowFromSharedTakeValues(values)] };
      }
      // The exclusive work insert races on the PARTIAL index (ADR-0200 D2).
      if (text.includes("ON CONFLICT (unit_id) WHERE grade = 'work'")) {
        return { rows: this.insertRaceLost ? [] : [rowFromWriteValues(values)] };
      }
      // Plain INSERT = the refused-take restore of a folded shared row.
      return { rows: [] };
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
      // The promotion pick reads the unit's live waiting rows.
      if (text.includes("grade = 'waiting'")) return { rows: this.waiterRows ?? [] };
      // The session's own row (any grade) — upgrade/downgrade's first read.
      if (text.includes("FOR UPDATE") && text.includes("session_id = $2")) {
        return { rows: this.ownRowForUpdate ? [this.ownRowForUpdate] : [] };
      }
      // The exclusive work-holder read.
      if (text.includes("FOR UPDATE")) {
        return { rows: this.existingForUpdate ? [this.existingForUpdate] : [] };
      }
      // The post-race-loss winner re-read.
      return { rows: this.winnerRow ? [this.winnerRow] : [] };
    }
    // The heartbeat bumps are the only UPDATEs whose SET clause STARTS with heartbeat_at — route
    // them first. The per-unit bump filters on unit_id; the session bulk-bump keys on session_id.
    if (head.startsWith("UPDATE") && text.includes("SET heartbeat_at = now()")) {
      if (text.includes("WHERE session_id =")) return { rows: this.sessionBumpReturns ?? [] };
      return { rows: this.bumpReturns ? [this.bumpReturns] : [] };
    }
    // The promotion flip: the picked waiter becomes the work row.
    if (head.startsWith("UPDATE") && text.includes("SET grade = 'work'")) {
      const session = String(values[1]);
      const waiter = (this.waiterRows ?? []).find((w) => w.session_id === session);
      return { rows: waiter ? [{ ...waiter, grade: "work" }] : [] };
    }
    // The downgrade flip: the session's own row moves to the parameterised shared grade.
    if (head.startsWith("UPDATE") && text.includes("SET grade = $3")) {
      const base = this.ownRowForUpdate as ClaimRow;
      return {
        rows: [
          { ...base, unit_id: String(values[0]), session_id: String(values[1]), grade: String(values[2]) },
        ],
      };
    }
    // Upgrade's re-entrant refresh of an already-ours work row.
    if (head.startsWith("UPDATE") && text.includes("SET branch = $2")) {
      const base = this.existingForUpdate as ClaimRow;
      return { rows: [{ ...base, branch: String(values[1]), intent: String(values[2]) }] };
    }
    if (head.startsWith("UPDATE") && text.includes("events.node_claim")) {
      return { rows: [rowFromWriteValues(values)] };
    }
    // The own-shared-row FOLD delete (a take-work path absorbing our exploring/waiting row).
    if (head.startsWith("DELETE") && text.includes("grade <> 'work'")) {
      return { rows: this.foldDeleteReturns ?? [] };
    }
    // Upgrade's eviction of a stale work holder.
    if (head.startsWith("DELETE") && text.includes("grade = 'work'")) {
      return { rows: [] };
    }
    // The bulk branch-clear (releaseClaimsByBranch) deletes by `branch` alone and can return MANY
    // rows; release() deletes one by (unit_id, session_id). Route the branch form first.
    if (head.startsWith("DELETE") && text.includes("WHERE branch =")) {
      return { rows: this.branchDeleteReturns ?? [] };
    }
    // The `done` bulk-release (releaseClaimsBySession, ADR-0142) deletes by session_id alone.
    if (head.startsWith("DELETE") && text.includes("WHERE session_id =")) {
      return { rows: this.sessionDeleteReturns ?? [] };
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
    grade: "work",
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
function issuedWorkInsert(client: FakeClaimClient): boolean {
  return client.calls.some(
    (c) =>
      c.text.includes("INSERT INTO events.node_claim") &&
      c.text.includes("ON CONFLICT (unit_id) WHERE grade = 'work'"),
  );
}
function issuedPromotionPick(client: FakeClaimClient): boolean {
  return client.calls.some(
    (c) => c.text.trimStart().toUpperCase().startsWith("SELECT") && c.text.includes("grade = 'waiting'"),
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("constructs from a pool-like object with the full graded-claim surface", () => {
  const store = storeWith(new FakeClaimClient());
  assert.ok(store instanceof PgClaimStore);
  for (const m of ["claim", "take", "upgrade", "downgrade", "release", "current", "claimsFor", "listLiveClaims", "claimsBySession", "history"] as const) {
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
    assert.equal(claimGrade(res.claim), "work", "a claim() take is always the work grade");
  }
  assert.ok(issuedWorkInsert(client), "insert races on the partial work index (ADR-0200 D2)");
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
  // The refusal NEVER mutates any node_claim row — no INSERT, no UPDATE, no fold DELETE.
  assert.ok(!client.calls.some((c) => c.text.includes("INSERT INTO events.node_claim")), "no insert");
  assert.ok(
    !client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("UPDATE")),
    "no update",
  );
  assert.ok(
    !client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("DELETE")),
    "no delete",
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

test("claim (insert race lost with a folded shared row): the session's exploring wisp is RESTORED before the refusal", async () => {
  const client = new FakeClaimClient();
  client.insertRaceLost = true;
  client.winnerRow = heldRow({ session_id: "session-A" });
  client.foldDeleteReturns = [
    heldRow({ session_id: "session-B", grade: "exploring", branch: "claude/b", intent: "scoping" }),
  ];
  const res = await storeWith(client).claim(REQ_B, { now: NOW });

  assert.equal(res.acquired, false);
  // The folded exploring row is put back verbatim (a refused work take must not eat the wisp).
  const restore = client.calls.find(
    (c) => c.text.includes("INSERT INTO events.node_claim") && !c.text.includes("ON CONFLICT"),
  );
  assert.ok(restore !== undefined, "the plain restore INSERT was issued");
  assert.equal(restore.values[2], "exploring", "the restored row keeps its grade");
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

// ── take (ADR-0200 D2): the grade-aware acquire ───────────────────────────────

test("take (exploring): SHARED upsert on the composite PK, 'claimed' event carrying the grade, no exclusive read, COMMIT", async () => {
  const client = new FakeClaimClient();
  const res = await storeWith(client).take(
    { ...REQ_B, grade: "exploring", intent: "scoping the stream" },
    { now: NOW },
  );

  assert.equal(res.acquired, true);
  if (res.acquired) {
    assert.equal(claimGrade(res.claim), "exploring");
    assert.equal(res.claim.intent, "scoping the stream", "intent prose rides the exploring claim");
  }
  const upsert = client.calls.find((c) => c.text.includes("ON CONFLICT (unit_id, session_id)"));
  assert.ok(upsert !== undefined, "shared grades upsert re-entrantly on the composite PK");
  // A shared take never touches the exclusive machinery: no work-row lock, no partial-index race.
  assert.ok(!client.calls.some((c) => c.text.includes("FOR UPDATE")), "no exclusive read");
  assert.ok(!issuedWorkInsert(client), "no work insert");
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "claimed", sessionId: "session-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("take (work / absent grade): delegates to the exclusive claim() path unchanged", async () => {
  const client = new FakeClaimClient();
  const res = await storeWith(client).take(REQ_B, { now: NOW }); // no grade → work

  assert.equal(res.acquired, true);
  assert.ok(issuedWorkInsert(client), "the work take is claim()'s partial-index insert");
  assert.deepEqual(client.events.map((e) => e.type), ["claimed"]);
});

test("take (shared): fail-closed on blank attribution (never opens a transaction)", async () => {
  const client = new FakeClaimClient();
  await assert.rejects(
    () => storeWith(client).take({ ...REQ_B, grade: "exploring", branch: " " }, { now: NOW }),
    /non-blank/,
  );
  assert.equal(client.calls.length, 0, "validation precedes any query");
});

test("take (shared): a DB error mid-transaction → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClaimClient();
  client.failOnPattern = "INSERT INTO events.claim_event";
  await assert.rejects(
    () => storeWith(client).take({ ...REQ_B, grade: "waiting" }, { now: NOW }),
    /Fake-induced failure/,
  );
  assert.ok(rollsBack(client) && !commits(client));
  assert.ok(client.released);
});

// ── upgrade (ADR-0200 D2): exploring→work, or queue behind a live holder ─────

test("upgrade (slot free, prior exploring row): the session's row becomes the work row → acquired, fold + work insert, 'upgraded' event", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", grade: "exploring", branch: "claude/b" });
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW });

  assert.equal(res.acquired, true);
  if (res.acquired) {
    assert.equal(res.reclaimed, false);
    assert.equal(claimGrade(res.claim), "work");
    assert.equal(res.claim.branch, "claude/b", "branch inherited from the prior row");
  }
  assert.ok(
    client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("DELETE") && c.text.includes("grade <> 'work'")),
    "the shared row is folded away (composite-PK slot freed)",
  );
  assert.ok(issuedWorkInsert(client), "the take races on the partial work index");
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "upgraded", sessionId: "session-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("upgrade (held by a LIVE other session): the session QUEUES → waiting upsert, 'queued' event, queued arm names the holder", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", grade: "exploring", branch: "claude/b" });
  client.existingForUpdate = heldRow(); // session-A, heartbeat fresh
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW });

  assert.equal(res.acquired, false);
  assert.ok("queued" in res && res.queued === true, "the queued arm, not a dead-end refusal");
  if ("queued" in res) {
    assert.equal(res.heldBy.sessionId, "session-A");
    assert.equal(res.waiting.sessionId, "session-B");
    assert.equal(claimGrade(res.waiting), "waiting");
  }
  assert.ok(!issuedWorkInsert(client), "no work insert while a live holder stands");
  assert.ok(
    client.calls.some((c) => c.text.includes("'waiting'") && c.text.includes("ON CONFLICT (unit_id, session_id)")),
    "the queue join is a waiting upsert",
  );
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "queued", sessionId: "session-B" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
});

test("upgrade (held by a STALE other session): the stale work row is evicted → acquired, reclaimed:true, 'upgraded' event", async () => {
  const client = new FakeClaimClient();
  const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1_000).toISOString();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", grade: "exploring", branch: "claude/b" });
  client.existingForUpdate = heldRow({ session_id: "session-A", heartbeat_at: threeHoursAgo });
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW });

  assert.equal(res.acquired, true);
  if (res.acquired) assert.equal(res.reclaimed, true, "a stale holder was evicted");
  assert.ok(
    client.calls.some((c) => c.text.trimStart().toUpperCase().startsWith("DELETE") && c.text.includes("grade = 'work'")),
    "the stale work row is deleted",
  );
  assert.deepEqual(client.events.map((e) => e.type), ["upgraded"]);
  assert.ok(commits(client));
});

test("upgrade (already ours): a re-entrant upgrade refreshes the held work row → acquired, 'upgraded' event", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", branch: "claude/b" });
  client.existingForUpdate = heldRow({ session_id: "session-B", branch: "claude/b" });
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW });

  assert.equal(res.acquired, true);
  if (res.acquired) assert.equal(res.reclaimed, false);
  assert.ok(!issuedWorkInsert(client), "a refresh, not a re-insert");
  assert.deepEqual(client.events.map((e) => e.type), ["upgraded"]);
});

test("upgrade (no prior row, no branch): fail-closed — attribution is never invented → throws, ROLLBACK", async () => {
  const client = new FakeClaimClient(); // ownRowForUpdate undefined
  await assert.rejects(
    () => storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW }),
    /no prior claim row and no branch/,
  );
  assert.ok(rollsBack(client) && !commits(client));
  assert.equal(client.events.length, 0);
  assert.ok(client.released);
});

test("upgrade (no prior row, branch supplied): treat as take-work-or-queue → acquired when the slot is free", async () => {
  const client = new FakeClaimClient(); // no own row, no work row
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", {
    now: NOW,
    branch: "claude/b",
    intent: "edit",
  });
  assert.equal(res.acquired, true);
  assert.ok(issuedWorkInsert(client));
  assert.deepEqual(client.events.map((e) => e.type), ["upgraded"]);
});

test("upgrade (insert race lost): a concurrent first-work claim wins → the session lands in the QUEUE, 'queued' event", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", grade: "exploring", branch: "claude/b" });
  client.insertRaceLost = true;
  client.winnerRow = heldRow({ session_id: "session-A" });
  const res = await storeWith(client).upgrade("chat-session-stream", "session-B", { now: NOW });

  assert.equal(res.acquired, false);
  assert.ok("queued" in res && res.queued === true, "an upgrade never dead-ends: race loss → queue");
  if ("queued" in res) assert.equal(res.heldBy.sessionId, "session-A");
  assert.deepEqual(client.events.map((e) => e.type), ["queued"]);
  assert.ok(commits(client));
});

// ── downgrade (ADR-0200 D2): work→shared frees the slot and PROMOTES ─────────

test("downgrade (work→exploring, live waiter queued): 'downgraded' then 'promoted' IN ONE transaction", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-A", grade: "work" });
  client.waiterRows = [heldRow({ session_id: "session-B", grade: "waiting", branch: "claude/b" })];
  const ok = await storeWith(client).downgrade("chat-session-stream", "session-A", "exploring");

  assert.equal(ok, true);
  assert.ok(issuedPromotionPick(client), "the freed work slot triggers the waiter pick");
  assert.ok(
    client.calls.some((c) => c.text.includes("SET grade = 'work'")),
    "the oldest live waiter is flipped to the work grade",
  );
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "downgraded", sessionId: "session-A" },
    { unitId: "chat-session-stream", type: "promoted", sessionId: "session-B" },
  ]);
  // One BEGIN, one COMMIT — the downgrade and the promotion are one atomic step.
  assert.equal(client.calls.filter((c) => c.text.includes("BEGIN")).length, 1);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("downgrade (work→exploring, no live waiter): 'downgraded' only — a promotion no-op, still COMMITs", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-A", grade: "work" });
  // waiterRows undefined → no live waiter
  const ok = await storeWith(client).downgrade("chat-session-stream", "session-A", "exploring");
  assert.equal(ok, true);
  assert.deepEqual(client.events.map((e) => e.type), ["downgraded"]);
  assert.ok(commits(client));
});

test("downgrade (waiting→exploring): a SHARED row's downgrade never fires promotion", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-B", grade: "waiting" });
  const ok = await storeWith(client).downgrade("chat-session-stream", "session-B", "exploring");

  assert.equal(ok, true);
  assert.ok(!issuedPromotionPick(client), "no work slot was freed — no promotion pick");
  assert.deepEqual(client.events.map((e) => e.type), ["downgraded"]);
  assert.ok(commits(client));
});

test("downgrade (nothing of ours): returns false, no events, still COMMITs", async () => {
  const client = new FakeClaimClient(); // ownRowForUpdate undefined
  const ok = await storeWith(client).downgrade("chat-session-stream", "session-B", "exploring");
  assert.equal(ok, false);
  assert.equal(client.events.length, 0);
  assert.ok(commits(client));
});

test("downgrade: a DB error mid-transaction → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClaimClient();
  client.ownRowForUpdate = heldRow({ session_id: "session-A", grade: "work" });
  client.failOnPattern = "INSERT INTO events.claim_event";
  await assert.rejects(
    () => storeWith(client).downgrade("chat-session-stream", "session-A", "exploring"),
    /Fake-induced failure/,
  );
  assert.ok(rollsBack(client) && !commits(client));
  assert.ok(client.released);
});

// ── release: grade-aware — a WORK release promotes, a shared release never does ─

test("release (work row, live waiter queued): DELETE + 'released' + 'promoted' in one transaction, returns true", async () => {
  const client = new FakeClaimClient();
  client.deleteReturns = heldRow({ session_id: "session-B", grade: "work" });
  client.waiterRows = [heldRow({ session_id: "session-C", grade: "waiting", branch: "claude/c" })];
  const ok = await storeWith(client).release("chat-session-stream", "session-B");

  assert.equal(ok, true);
  assert.deepEqual(client.events, [
    { unitId: "chat-session-stream", type: "released", sessionId: "session-B" },
    { unitId: "chat-session-stream", type: "promoted", sessionId: "session-C" },
  ]);
  assert.equal(client.calls.filter((c) => c.text.includes("BEGIN")).length, 1, "one atomic transaction");
  assert.ok(commits(client));
});

test("release (held by us, no waiter): DELETE removes the row, 'released' event, returns true", async () => {
  const client = new FakeClaimClient();
  client.deleteReturns = heldRow({ session_id: "session-B" });
  const ok = await storeWith(client).release("chat-session-stream", "session-B");
  assert.equal(ok, true);
  assert.deepEqual(client.events.map((e) => e.type), ["released"]);
  assert.ok(commits(client));
});

test("release (exploring row): the shared release NEVER fires promotion", async () => {
  const client = new FakeClaimClient();
  client.deleteReturns = heldRow({ session_id: "session-B", grade: "exploring" });
  client.waiterRows = [heldRow({ session_id: "session-C", grade: "waiting" })]; // would-be bait
  const ok = await storeWith(client).release("chat-session-stream", "session-B");

  assert.equal(ok, true);
  assert.ok(!issuedPromotionPick(client), "no work slot was freed — no promotion pick");
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

test("releaseClaimsByBranch (a WORK row among the cleared): the freed unit promotes its oldest live waiter in the same transaction", async () => {
  const client = new FakeClaimClient();
  client.branchDeleteReturns = [
    heldRow({ unit_id: "unit-alpha", session_id: "sess-A", branch: "claude/x", grade: "work" }),
    heldRow({ unit_id: "unit-beta", session_id: "sess-A", branch: "claude/x", grade: "exploring" }),
  ];
  client.waiterRows = [heldRow({ unit_id: "unit-alpha", session_id: "sess-W", grade: "waiting" })];
  const count = await storeWith(client).releaseClaimsByBranch("claude/x");

  assert.equal(count, 2);
  // Exactly ONE promotion pick — only unit-alpha's work row was cleared, exploring frees nothing.
  assert.equal(
    client.calls.filter((c) => c.text.trimStart().toUpperCase().startsWith("SELECT") && c.text.includes("grade = 'waiting'")).length,
    1,
    "one promotion pick, for the one unit whose work row was cleared",
  );
  assert.deepEqual(client.events, [
    { unitId: "unit-alpha", type: "released", sessionId: "sess-A" },
    { unitId: "unit-beta", type: "released", sessionId: "sess-A" },
    { unitId: "unit-alpha", type: "promoted", sessionId: "sess-W" },
  ]);
  assert.equal(client.calls.filter((c) => c.text.includes("BEGIN")).length, 1, "one atomic transaction");
  assert.ok(commits(client));
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

// ── releaseClaimsBySession / bumpHeartbeatsBySession (ADR-0142): the session-scoped twins ────
// `noticeboard done` drops every claim the session holds; the statusline heartbeat keeps every
// claim the session holds out of the stale-reclaim window without knowing which units they are.

test("releaseClaimsBySession: bulk-DELETE by session → returns the count, one 'released' event per cleared claim, COMMIT", async () => {
  const client = new FakeClaimClient();
  client.sessionDeleteReturns = [
    heldRow({ unit_id: "unit-alpha", session_id: "sess-A", branch: "claude/x" }),
    heldRow({ unit_id: "unit-beta", session_id: "sess-A", branch: "claude/x" }),
  ];
  const count = await storeWith(client).releaseClaimsBySession("sess-A");

  assert.equal(count, 2, "returns the number of cleared claims");
  assert.ok(
    client.calls.some((c) => c.text.includes("DELETE FROM events.node_claim WHERE session_id =")),
    "deletes by session alone",
  );
  assert.deepEqual(client.events, [
    { unitId: "unit-alpha", type: "released", sessionId: "sess-A" },
    { unitId: "unit-beta", type: "released", sessionId: "sess-A" },
  ]);
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("releaseClaimsBySession (a WORK row among the cleared): the freed unit promotes its oldest live waiter", async () => {
  const client = new FakeClaimClient();
  client.sessionDeleteReturns = [
    heldRow({ unit_id: "unit-alpha", session_id: "sess-A", grade: "work" }),
    heldRow({ unit_id: "unit-beta", session_id: "sess-A", grade: "waiting" }),
  ];
  client.waiterRows = [heldRow({ unit_id: "unit-alpha", session_id: "sess-W", grade: "waiting" })];
  const count = await storeWith(client).releaseClaimsBySession("sess-A");

  assert.equal(count, 2);
  assert.deepEqual(client.events, [
    { unitId: "unit-alpha", type: "released", sessionId: "sess-A" },
    { unitId: "unit-beta", type: "released", sessionId: "sess-A" },
    { unitId: "unit-alpha", type: "promoted", sessionId: "sess-W" },
  ]);
  assert.ok(commits(client));
});

test("releaseClaimsBySession (held nothing): returns 0, no 'released' event, still COMMITs", async () => {
  const client = new FakeClaimClient(); // sessionDeleteReturns undefined → nothing matched
  const count = await storeWith(client).releaseClaimsBySession("sess-empty");
  assert.equal(count, 0);
  assert.equal(client.events.length, 0);
  assert.ok(commits(client));
});

test("releaseClaimsBySession: a DB error mid-transaction → ROLLBACK, no COMMIT, client released", async () => {
  const client = new FakeClaimClient();
  client.sessionDeleteReturns = [heldRow({ unit_id: "unit-alpha", session_id: "sess-A" })];
  client.failOnPattern = "INSERT INTO events.claim_event";
  await assert.rejects(() => storeWith(client).releaseClaimsBySession("sess-A"), /Fake-induced failure/);
  assert.ok(rollsBack(client) && !commits(client));
  assert.ok(client.released);
});

test("bumpHeartbeatsBySession: UPDATE by session alone → returns the count, NO audit event, COMMIT", async () => {
  const client = new FakeClaimClient();
  client.sessionBumpReturns = [
    heldRow({ unit_id: "unit-alpha", session_id: "sess-A" }),
    heldRow({ unit_id: "unit-beta", session_id: "sess-A" }),
  ];
  const count = await storeWith(client).bumpHeartbeatsBySession("sess-A");

  assert.equal(count, 2, "returns the number of bumped claims");
  const bulkBump = client.calls.find(
    (c) => c.text.includes("SET heartbeat_at = now()") && c.text.includes("WHERE session_id ="),
  );
  assert.ok(bulkBump !== undefined, "the session bulk-bump UPDATE was issued (session_id filter alone)");
  assert.equal(client.events.length, 0, "no claim_event for a heartbeat bump");
  assert.ok(commits(client) && !rollsBack(client));
  assert.ok(client.released);
});

test("bumpHeartbeatsBySession (held nothing): returns 0, still COMMITs", async () => {
  const client = new FakeClaimClient(); // sessionBumpReturns undefined
  const count = await storeWith(client).bumpHeartbeatsBySession("sess-empty");
  assert.equal(count, 0);
  assert.ok(commits(client));
});

// ── Live-gated: real atomic claim/refuse/reclaim over Postgres ────────────────
// (The grade transitions' live proof — partial-index exclusivity, real claimed_at queue ordering,
// end-to-end promotion — is claim-store-grades.live.test.ts.)

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

// ── The unbounded ledger reads (ADR-0200 D7: listLiveClaims / claimsBySession) ──
//
// Both are read-only pool.query paths (no transaction), so a tiny dedicated fake
// captures the SQL + values and feeds rows back — the FakeClaimClient's
// fragment-routing is for the transactional verbs above.

class FakeReadPool {
  readonly calls: { text: string; values: unknown[] }[] = [];
  rows: unknown[] = [];
  async connect(): Promise<never> {
    throw new Error("the read paths never open a transaction");
  }
  async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values: values ?? [] });
    return { rows: this.rows };
  }
}

const READ_ROW_WORK = {
  unit_id: "story-a",
  session_id: "sess-A",
  grade: "work",
  branch: "claude/sess-A",
  intent: "building",
  claimed_at: "2026-07-16T10:00:00.000Z",
  heartbeat_at: "2026-07-16T11:59:00.000Z",
};
const READ_ROW_EXPLORING = { ...READ_ROW_WORK, unit_id: "story-b", session_id: "sess-B", grade: "exploring", intent: "reading" };

test("listLiveClaims: unbounded (no unit/session filter), heartbeat-live in SQL, rows map WITH grade", async () => {
  const pool = new FakeReadPool();
  pool.rows = [READ_ROW_WORK, READ_ROW_EXPLORING];
  const docs = await new PgClaimStore(pool as never).listLiveClaims();

  const call = pool.calls[0];
  assert.ok(call, "one query issued");
  assert.match(call.text, /FROM events\.node_claim/);
  assert.doesNotMatch(call.text, /unit_id\s*=/, "no unit filter — every unit");
  assert.doesNotMatch(call.text, /session_id\s*=/, "no session filter — every session");
  assert.match(call.text, /heartbeat_at > now\(\)/, "liveness filtered in SQL");
  assert.match(call.text, /ORDER BY claimed_at/);
  assert.deepEqual(call.values, [CLAIM_STALE_RECLAIM_MS], "default stale window rides as the parameter");

  assert.equal(docs.length, 2);
  assert.equal(docs[0]?.grade, "work");
  assert.equal(docs[1]?.grade, "exploring");
  assert.equal(docs[1]?.intent, "reading");
});

test("listLiveClaims: staleReclaimMs override is passed through; a corrupt grade fails closed", async () => {
  const pool = new FakeReadPool();
  await new PgClaimStore(pool as never).listLiveClaims({ staleReclaimMs: 5_000 });
  assert.deepEqual(pool.calls[0]?.values, [5_000]);

  const bad = new FakeReadPool();
  bad.rows = [{ ...READ_ROW_WORK, grade: "sneaky" }];
  await assert.rejects(new PgClaimStore(bad as never).listLiveClaims(), /invalid/i);
});

test("claimsBySession: keyed on session_id + heartbeat-live, values [sessionId, staleMs], maps grade", async () => {
  const pool = new FakeReadPool();
  pool.rows = [READ_ROW_WORK];
  const docs = await new PgClaimStore(pool as never).claimsBySession("sess-A");

  const call = pool.calls[0];
  assert.ok(call, "one query issued");
  assert.match(call.text, /WHERE session_id = \$1/);
  assert.match(call.text, /heartbeat_at > now\(\)/, "liveness filtered in SQL");
  assert.deepEqual(call.values, ["sess-A", CLAIM_STALE_RECLAIM_MS]);

  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.unitId, "story-a");
  assert.equal(docs[0]?.grade, "work");
});

test("claimsBySession: empty rows → empty list (a claim-less session is a plain no, not an error)", async () => {
  const pool = new FakeReadPool();
  const docs = await new PgClaimStore(pool as never).claimsBySession("nobody");
  assert.deepEqual(docs, []);
});

// ── recentDepartures (ADR-0200 D7): the wisp-out departure read ───────────────
// Another read-only pool.query path (FakeReadPool.connect throws, so a passing
// test also proves no transaction is opened).

test("recentDepartures: released-only over claim_event, window-bounded in SQL, ORDER BY at DESC, rows map to the departure shape", async () => {
  const pool = new FakeReadPool();
  pool.rows = [
    {
      unit_id: "story-a",
      session_id: "sess-A",
      doc: { grade: "exploring", intent: "scoping" },
      at: new Date("2026-07-16T11:59:30.000Z"),
    },
    { unit_id: "story-b", session_id: "sess-B", doc: null, at: "2026-07-16T11:59:00.000Z" },
  ];
  const rows = await new PgClaimStore(pool as never).recentDepartures(120_000);

  const call = pool.calls[0];
  assert.ok(call, "one query issued");
  assert.match(call.text, /FROM events\.claim_event/);
  assert.match(call.text, /type = 'released'/, "departures are released events ONLY");
  assert.match(call.text, /at > now\(\)/, "the window is bounded in SQL");
  assert.match(call.text, /ORDER BY at DESC/, "newest first");
  assert.deepEqual(call.values, [120_000], "the window rides as the parameter");

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    unitId: "story-a",
    sessionId: "sess-A",
    doc: { grade: "exploring", intent: "scoping" },
    at: "2026-07-16T11:59:30.000Z",
  });
  assert.equal(rows[1]?.at, "2026-07-16T11:59:00.000Z", "a string `at` normalises to ISO too");
  assert.equal(rows[1]?.doc, null, "the doc passes through untouched — the pure fold reads it tolerantly");
});

test("recentDepartures: empty rows → empty list (a quiet window is a plain no, not an error)", async () => {
  const pool = new FakeReadPool();
  const rows = await new PgClaimStore(pool as never).recentDepartures(120_000);
  assert.deepEqual(rows, []);
});
