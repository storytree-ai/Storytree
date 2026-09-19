/**
 * The shared context-traversal event log (ADR-0484 D1) — story `context-traversal-capture`,
 * capability `traversal-trace-sink`.
 *
 * ONE PARITY SUITE, RUN AGAINST BOTH BACKENDS, so "the Postgres store is the same seam the JSONL
 * sink has always been" (ADR-0241 D8) is a test rather than a sentence in a header. Two
 * independently-written suites would let the two backends drift into agreeing about nothing in
 * particular while both stayed green — the `storeParitySuite` lesson from
 * `@storytree/storage-protocol` applied one organism over.
 *
 * EVERY PARITY CASE IS DECLARED TWICE, BY HAND, rather than in a loop over the two backends. The
 * loop is what a reader would write first and it costs two things that matter here: the contract id
 * stops being a STATIC token in the test title, which is how a declared contract binds to the test
 * that proves it, and a reader of this file can no longer see at a glance that both backends really
 * do run every case. Fourteen literal lines buy both.
 *
 * WHY THE FAKE POOL IS A REAL TABLE. The house double for a `pg` store is usually SQL-fragment
 * routing with canned rows (`FakeClaimClient`), which is right for a store whose interesting
 * behaviour is WHICH statement runs in which order. This store's interesting behaviour is the
 * OPPOSITE: what a caller gets back after appending. A canned-row fake would answer the parity
 * suite's questions with values the test itself supplied — an expectation derived from its own
 * subject. So {@link FakeTraversalPool} implements the three statements' semantics over an array.
 *
 * IT IS STILL A DOUBLE, and there is deliberately no `.live.test.ts` beside it. This package's
 * dependencies are zod plus the increment-1 vocabulary (ADR-0241 D9's reason: the sink must not
 * reach `@storytree/drive`), and a live suite would need `@storytree/library/store` for
 * `createTestPool` — a package edge added for a test, on a package whose narrow dependency set is
 * itself a decision. What the double cannot vouch for is the DDL and the driver, and that half is
 * proven END TO END through the CLI against the live store and recorded on the increment.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendTraversalEvents, listTraversalSessions, readTraversalSession } from "../sink.js";
import type { TraversalSinkLocation } from "../sink.js";
import { PgTraversalEventStore } from "./traversal-event-store.js";
import type { TraversalEventLocation, TraversalEventStore, TraversalPool } from "./traversal-event-store.js";

// ---------------------------------------------------------------------------
// The two backends
// ---------------------------------------------------------------------------

/** One stored row, in the shape `PgTraversalEventStore.read` selects. */
interface FakeRow {
  seq: number;
  event_id: string;
  session_id: string;
  observed_at: string;
  grade: string | null;
  slot: string | null;
  origin: string | null;
  cut_by: string | null;
  cut_for: string | null;
  harness: string | null;
  host: string | null;
  event: unknown;
}

/** A nullable text column's value, as the driver would store it. */
function column(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * An in-memory table that honours the three statements the store issues.
 *
 * `failOn` reaches the one thing a canned fake could not: a store that answers reads and refuses
 * writes, which is what a shipped batch meets when the database is up but the write does not land —
 * and what the shipper has to turn into a reportable backlog rather than a swallowed success.
 */
export class FakeTraversalPool implements TraversalPool {
  readonly rows: FakeRow[] = [];
  /** When set, any statement whose text contains this fragment throws. */
  failOn: string | undefined;
  /** Every statement issued, so a test can assert the store did not touch the pool at all. */
  readonly calls: string[] = [];
  /** The session ids the per-session SELECT was issued for, so a phantom id is observable. */
  readonly selectedSessionIds: string[] = [];
  /** The parameters of every INSERT issued, so a test can assert what reached each POSITION. */
  readonly insertParams: unknown[][] = [];

  async query(text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.calls.push(text);
    if (text.includes("WHERE session_id = $1")) this.selectedSessionIds.push(String(values[0]));
    if (this.failOn !== undefined && text.includes(this.failOn)) {
      throw new Error(`fake-induced failure matching ${JSON.stringify(this.failOn)}`);
    }

    if (text.includes("INSERT INTO events.traversal_event")) {
      this.insertParams.push([...values]);
      const eventId = String(values[0]);
      // ON CONFLICT (event_id) DO NOTHING — the idempotence a retry rests on.
      if (this.rows.some((row) => row.event_id === eventId)) return { rows: [] };
      this.rows.push({
        seq: this.rows.length + 1,
        event_id: eventId,
        session_id: String(values[1]),
        observed_at: String(values[2]),
        grade: column(values[3]),
        slot: column(values[4]),
        origin: column(values[5]),
        cut_by: column(values[6]),
        cut_for: column(values[7]),
        event: JSON.parse(String(values[8])),
        // $10 and $11 — appended AFTER the event, exactly as `INSERT_EVENT_SQL` lists the columns.
        harness: column(values[9]),
        host: column(values[10]),
      });
      return { rows: [] };
    }

    if (text.includes("GROUP BY session_id")) {
      const lastSeq = new Map<string, number>();
      for (const row of this.rows) lastSeq.set(row.session_id, row.seq);
      return { rows: [...lastSeq.entries()].sort((a, b) => a[1] - b[1]).map(([session_id]) => ({ session_id })) };
    }

    if (text.includes("WHERE session_id = $1")) {
      const sessionId = String(values[0]);
      return {
        rows: this.rows
          .filter((row) => row.session_id === sessionId)
          .sort((a, b) => a.seq - b.seq)
          .map((row) => ({
            event: row.event,
            grade: row.grade,
            slot: row.slot,
            // ALIASED, exactly as `SELECT_SESSION_SQL` aliases them: the double answers in the
            // camelCase the row schema reads, or the parity suite would prove the store copes with
            // a shape the driver never hands it.
            origin: row.origin,
            cutBy: row.cut_by,
            cutFor: row.cut_for,
            harness: row.harness,
            host: row.host,
          })),
      };
    }

    return { rows: [] };
  }

  /** Overwrite one stored row's payload, so the tolerant-read contract has something to skip. */
  corrupt(eventId: string, payload: unknown): void {
    const row = this.rows.find((candidate) => candidate.event_id === eventId);
    if (row !== undefined) row.event = payload;
  }

  /** Overwrite one stored row's identity columns, reachable no other way through the store. */
  restamp(
    eventId: string,
    columns: {
      grade?: string | null;
      slot?: string | null;
      origin?: string | null;
      cutBy?: string | null;
      cutFor?: string | null;
      harness?: string | null;
      host?: string | null;
    },
  ): void {
    const row = this.rows.find((candidate) => candidate.event_id === eventId);
    if (row === undefined) return;
    if (columns.grade !== undefined) row.grade = columns.grade;
    if (columns.slot !== undefined) row.slot = columns.slot;
    if (columns.origin !== undefined) row.origin = columns.origin;
    if (columns.cutBy !== undefined) row.cut_by = columns.cutBy;
    if (columns.cutFor !== undefined) row.cut_for = columns.cutFor;
    if (columns.harness !== undefined) row.harness = columns.harness;
    if (columns.host !== undefined) row.host = columns.host;
  }
}

/** The JSONL sink, adapted to the async seam so both backends run through one suite. */
export function jsonlTraversalEventStore(dir: string): TraversalEventStore {
  return {
    append: async (events: readonly unknown[], location: TraversalEventLocation) => {
      let sink: TraversalSinkLocation = { dir, sessionId: location.sessionId };
      if (location.grade !== undefined) sink = { ...sink, grade: location.grade };
      if (location.slot !== undefined) sink = { ...sink, slot: location.slot };
      if (location.origin !== undefined) sink = { ...sink, origin: location.origin };
      if (location.cutBy !== undefined) sink = { ...sink, cutBy: location.cutBy };
      if (location.cutFor !== undefined) sink = { ...sink, cutFor: location.cutFor };
      if (location.harness !== undefined) sink = { ...sink, harness: location.harness };
      if (location.host !== undefined) sink = { ...sink, host: location.host };
      return appendTraversalEvents(events, sink);
    },
    read: async (sessionId: string) => readTraversalSession({ dir, sessionId }),
    list: async () => listTraversalSessions({ dir }),
  };
}

export function freshTraceDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-store-${prefix}-`));
}

/** A fresh, empty JSONL-backed store. */
const jsonl = (): TraversalEventStore => jsonlTraversalEventStore(freshTraceDir("parity"));
/** A fresh, empty Postgres-backed store. */
const postgres = (): TraversalEventStore => new PgTraversalEventStore(new FakeTraversalPool());

function visit(over: { eventId: string; at: string; sessionId: string; visitId: string; nodeId: string }) {
  return { kind: "front_matter_read", ...over };
}

// ---------------------------------------------------------------------------
// The parity cases
// ---------------------------------------------------------------------------

async function appendedEventsReplayInAFreshRead(store: TraversalEventStore): Promise<void> {
  const sessionId = "session-parity";
  assert.equal(
    await store.append(
      [
        visit({ eventId: "e1", at: "2026-08-30T00:00:00.000Z", sessionId, visitId: "v1", nodeId: "node-a" }),
        visit({ eventId: "e2", at: "2026-08-30T00:00:01.000Z", sessionId, visitId: "v2", nodeId: "node-b" }),
      ],
      { sessionId },
    ),
    true,
  );

  const read = await store.read(sessionId);
  assert.equal(read.skipped, 0);
  assert.deepEqual(
    read.replay.events.map((event) => event.eventId),
    ["e1", "e2"],
  );
}

async function anUnknownSessionReplaysEmpty(store: TraversalEventStore): Promise<void> {
  const read = await store.read("session-never-written");
  assert.equal(read.replay.events.length, 0);
  assert.equal(read.skipped, 0);
  assert.deepEqual(read.slots, []);
  assert.deepEqual(await store.list(), []);
}

async function invalidEventsNeverReachTheStore(store: TraversalEventStore): Promise<void> {
  const sessionId = "session-invalid";
  await store.append(
    [
      visit({ eventId: "ok-1", at: "2026-08-30T00:00:00.000Z", sessionId, visitId: "v1", nodeId: "node-a" }),
      { kind: "front_matter_read", eventId: "bad", sessionId, at: "not-a-timestamp" },
      visit({ eventId: "ok-2", at: "2026-08-30T00:00:02.000Z", sessionId, visitId: "v2", nodeId: "node-b" }),
    ],
    { sessionId },
  );

  const read = await store.read(sessionId);
  assert.deepEqual(
    read.replay.events.map((event) => event.eventId),
    ["ok-1", "ok-2"],
  );
}

async function aDuplicateIdentityIsSkippedNeverThrownOn(store: TraversalEventStore): Promise<void> {
  const sessionId = "session-duplicate";
  const event = visit({
    eventId: "dupe",
    at: "2026-08-30T00:00:00.000Z",
    sessionId,
    visitId: "v-dupe",
    nodeId: "node-a",
  });
  // The in-memory trace THROWS on a repeated identity; a durable read must answer instead.
  await store.append([event], { sessionId });
  await store.append([event], { sessionId });

  const read = await store.read(sessionId);
  assert.equal(read.replay.events.length, 1);
}

async function lineIdentityIsCarriedAndAnUnstatedGradeIsTheLegacyEra(
  makeStore: () => TraversalEventStore,
): Promise<void> {
  const graded = makeStore();
  await graded.append(
    [visit({ eventId: "g1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-graded", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-graded", grade: "window", slot: "worktree-alpha" },
  );
  const gradedRead = await graded.read("s-graded");
  assert.equal(gradedRead.identity, "window");
  assert.deepEqual(gradedRead.slots, ["worktree-alpha"]);

  const legacy = makeStore();
  await legacy.append(
    [visit({ eventId: "l1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-legacy", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-legacy" },
  );
  const legacyRead = await legacy.read("s-legacy");
  assert.equal(legacyRead.identity, "slot");
  assert.deepEqual(legacyRead.slots, []);

  // A session whose lines DISAGREE is `mixed`, never either — the silent mixing the classification
  // exists to make visible, asserted here so both backends are held to it, not just the JSONL one.
  const mixed = makeStore();
  await mixed.append(
    [visit({ eventId: "m1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-mixed", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-mixed", grade: "window", slot: "worktree-alpha" },
  );
  await mixed.append(
    [visit({ eventId: "m2", at: "2026-08-30T00:00:01.000Z", sessionId: "s-mixed", visitId: "v2", nodeId: "n" })],
    { sessionId: "s-mixed", grade: "declared", slot: "worktree-beta" },
  );
  const mixedRead = await mixed.read("s-mixed");
  assert.equal(mixedRead.identity, "mixed");
  assert.deepEqual(mixedRead.slots, ["worktree-alpha", "worktree-beta"]);
}

/**
 * WHO STARTED THE SESSION, held over BOTH backends (ADR-0484 D7).
 *
 * Parity matters more here than for `grade`, not less: the shared store is where a fleet-wide figure
 * is taken, so a Postgres backend that dropped the origin would leave every such figure with no way
 * to exclude the sessions that were briefed by an agent — while the local JSONL trace, which nobody
 * queries across machines, kept it and looked fine.
 */
async function sessionOriginIsCarriedAndAnUnstatedOriginIsNeverHuman(
  makeStore: () => TraversalEventStore,
): Promise<void> {
  const declared = makeStore();
  await declared.append(
    [visit({ eventId: "o1", at: "2026-08-31T00:00:00.000Z", sessionId: "s-cut", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-cut", grade: "window", origin: "cut", cutBy: "parent-window", cutFor: "some-arc" },
  );
  assert.deepEqual((await declared.read("s-cut")).origin, {
    reading: "cut",
    cutBy: ["parent-window"],
    cutFor: ["some-arc"],
  });
  // ...and it reaches the INDEX row too, which is where a count is taken.
  assert.equal((await declared.list())[0]?.origin.reading, "cut");

  const undeclared = makeStore();
  await undeclared.append(
    [visit({ eventId: "o2", at: "2026-08-31T00:00:00.000Z", sessionId: "s-silent", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-silent", grade: "window" },
  );
  const silent = await undeclared.read("s-silent");
  assert.equal(silent.origin.reading, "unknown");
  assert.notEqual(silent.origin.reading, "human", "the one default this attribute exists to refuse");
  assert.deepEqual(silent.origin.cutBy, []);

  // A session that declares PARTWAY THROUGH reads as what it declared: its earlier lines said "not
  // yet", which is an absence rather than a competing claim — the deliberate divergence from the
  // identity grade beside it, which WOULD read `mixed` here.
  const late = makeStore();
  await late.append(
    [visit({ eventId: "o3", at: "2026-08-31T00:00:00.000Z", sessionId: "s-late", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-late", grade: "window" },
  );
  await late.append(
    [visit({ eventId: "o4", at: "2026-08-31T00:00:01.000Z", sessionId: "s-late", visitId: "v2", nodeId: "n" })],
    { sessionId: "s-late", grade: "window", origin: "cut", cutBy: "parent-window" },
  );
  assert.equal((await late.read("s-late")).origin.reading, "cut");

  // A genuine contradiction stays visible.
  const contradictory = makeStore();
  await contradictory.append(
    [visit({ eventId: "o5", at: "2026-08-31T00:00:00.000Z", sessionId: "s-both", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-both", origin: "human" },
  );
  await contradictory.append(
    [visit({ eventId: "o6", at: "2026-08-31T00:00:01.000Z", sessionId: "s-both", visitId: "v2", nodeId: "n" })],
    { sessionId: "s-both", origin: "cut" },
  );
  assert.equal((await contradictory.read("s-both")).origin.reading, "mixed");
}

/**
 * WHICH HARNESS AND WHICH MACHINE wrote the session, held over BOTH backends.
 *
 * Parity matters here for the reason it matters for the origin: the shared store is where a
 * cross-machine reading is taken, so a Postgres backend that dropped either attribute would leave
 * exactly the question these exist to answer — "which box, which harness?" — unanswerable where it is
 * asked, while the local trace that nobody queries across machines kept it and looked fine.
 */
async function lineProvenanceIsCarriedAndAnUnrecordedOneReadsAsNone(
  makeStore: () => TraversalEventStore,
): Promise<void> {
  const stamped = makeStore();
  await stamped.append(
    [
      visit({ eventId: "p1", at: "2026-09-18T00:00:00.000Z", sessionId: "s-prov", visitId: "v1", nodeId: "n" }),
      visit({ eventId: "p2", at: "2026-09-18T00:00:01.000Z", sessionId: "s-prov", visitId: "v2", nodeId: "n" }),
    ],
    { sessionId: "s-prov", grade: "window", harness: "codex", host: "owner-laptop" },
  );
  await stamped.append(
    [visit({ eventId: "p3", at: "2026-09-18T00:00:02.000Z", sessionId: "s-prov", visitId: "v3", nodeId: "n" })],
    { sessionId: "s-prov", grade: "declared", harness: "claude-code", host: "mint-box" },
  );
  // A repeat of the first pair must not be listed twice, and an unrecorded append adds nothing.
  await stamped.append(
    [visit({ eventId: "p4", at: "2026-09-18T00:00:03.000Z", sessionId: "s-prov", visitId: "v4", nodeId: "n" })],
    { sessionId: "s-prov", harness: "codex", host: "owner-laptop" },
  );
  await stamped.append(
    [visit({ eventId: "p5", at: "2026-09-18T00:00:04.000Z", sessionId: "s-prov", visitId: "v5", nodeId: "n" })],
    { sessionId: "s-prov", host: null },
  );

  const read = await stamped.read("s-prov");
  assert.equal(read.replay.events.length, 5);
  assert.deepEqual(read.harnesses, ["codex", "claude-code"]);
  assert.deepEqual(read.hosts, ["owner-laptop", "mint-box"]);
  // ...and it reaches the INDEX row too, which is where a cross-session reading is taken.
  const [row] = await stamped.list();
  assert.deepEqual(row?.harnesses, ["codex", "claude-code"]);
  assert.deepEqual(row?.hosts, ["owner-laptop", "mint-box"]);

  const unrecorded = makeStore();
  await unrecorded.append(
    [visit({ eventId: "u1", at: "2026-09-18T00:00:00.000Z", sessionId: "s-bare", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-bare", grade: "window", slot: "worktree-alpha" },
  );
  const bare = await unrecorded.read("s-bare");
  assert.equal(bare.replay.events.length, 1);
  assert.deepEqual(bare.harnesses, [], "an unrecorded harness is none, never a default");
  assert.deepEqual(bare.hosts, []);
}

async function listReportsEachSessionOnce(store: TraversalEventStore): Promise<void> {
  await store.append(
    [
      visit({ eventId: "a1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-a", visitId: "va1", nodeId: "n" }),
      visit({ eventId: "a2", at: "2026-08-30T00:00:05.000Z", sessionId: "s-a", visitId: "va2", nodeId: "n" }),
    ],
    { sessionId: "s-a" },
  );
  await store.append(
    [visit({ eventId: "b1", at: "2026-08-30T00:00:09.000Z", sessionId: "s-b", visitId: "vb1", nodeId: "n" })],
    { sessionId: "s-b" },
  );

  const list = await store.list();
  const byId = new Map(list.map((row) => [row.sessionId, row]));
  assert.equal(byId.size, 2);
  assert.equal(byId.get("s-a")?.eventCount, 2);
  assert.equal(byId.get("s-a")?.lastObservedAt, "2026-08-30T00:00:05.000Z");
  assert.equal(byId.get("s-b")?.eventCount, 1);
  assert.equal(byId.get("s-b")?.lastObservedAt, "2026-08-30T00:00:09.000Z");
}

async function anEmptyAppendIsASuccessNotAWrite(store: TraversalEventStore): Promise<void> {
  assert.equal(await store.append([], { sessionId: "s-empty" }), true);
  assert.deepEqual(await store.list(), []);
}

// ---------------------------------------------------------------------------
// Each parity case, declared once per backend
// ---------------------------------------------------------------------------

test("appended-events-replay-in-a-fresh-read [jsonl]: an append reads back in order under its own session", () =>
  appendedEventsReplayInAFreshRead(jsonl()));
test("appended-events-replay-in-a-fresh-read [postgres]: an append reads back in order under its own session", () =>
  appendedEventsReplayInAFreshRead(postgres()));

test("an-unknown-session-replays-empty-and-never-throws [jsonl]: an unseen session is an answer, not a crash", () =>
  anUnknownSessionReplaysEmpty(jsonl()));
test("an-unknown-session-replays-empty-and-never-throws [postgres]: an unseen session is an answer, not a crash", () =>
  anUnknownSessionReplaysEmpty(postgres()));

test("invalid-events-never-reach-the-store [jsonl]: a bad event is dropped and its siblings still land", () =>
  invalidEventsNeverReachTheStore(jsonl()));
test("invalid-events-never-reach-the-store [postgres]: a bad event is dropped and its siblings still land", () =>
  invalidEventsNeverReachTheStore(postgres()));

test("a-duplicate-identity-is-skipped-and-counted-never-thrown-on [jsonl]: a repeat replays once", () =>
  aDuplicateIdentityIsSkippedNeverThrownOn(jsonl()));
test("a-duplicate-identity-is-skipped-and-counted-never-thrown-on [postgres]: a repeat replays once", () =>
  aDuplicateIdentityIsSkippedNeverThrownOn(postgres()));

test("line-identity-is-carried-and-an-unstated-grade-is-the-legacy-era [jsonl]: graded, legacy and mixed", () =>
  lineIdentityIsCarriedAndAnUnstatedGradeIsTheLegacyEra(jsonl));
test("line-identity-is-carried-and-an-unstated-grade-is-the-legacy-era [postgres]: graded, legacy and mixed", () =>
  lineIdentityIsCarriedAndAnUnstatedGradeIsTheLegacyEra(postgres));

test("session-origin-is-carried-and-an-unstated-origin-is-never-human [jsonl]: declared, undeclared, late and contradictory", () =>
  sessionOriginIsCarriedAndAnUnstatedOriginIsNeverHuman(jsonl));
test("session-origin-is-carried-and-an-unstated-origin-is-never-human [postgres]: declared, undeclared, late and contradictory", () =>
  sessionOriginIsCarriedAndAnUnstatedOriginIsNeverHuman(postgres));

test("line-provenance-is-carried-and-an-unrecorded-one-reads-as-none [jsonl]: which harness and which machine wrote it", () =>
  lineProvenanceIsCarriedAndAnUnrecordedOneReadsAsNone(jsonl));
test("line-provenance-is-carried-and-an-unrecorded-one-reads-as-none [postgres]: which harness and which machine wrote it", () =>
  lineProvenanceIsCarriedAndAnUnrecordedOneReadsAsNone(postgres));

test("list-reports-each-session-once-with-its-count-and-last-observed-time [jsonl]: one row per session", () =>
  listReportsEachSessionOnce(jsonl()));
test("list-reports-each-session-once-with-its-count-and-last-observed-time [postgres]: one row per session", () =>
  listReportsEachSessionOnce(postgres()));

test("an-empty-append-is-a-success-not-a-write [jsonl]: nothing to say is not a failure", () =>
  anEmptyAppendIsASuccessNotAWrite(jsonl()));
test("an-empty-append-is-a-success-not-a-write [postgres]: nothing to say is not a failure", () =>
  anEmptyAppendIsASuccessNotAWrite(postgres()));

// ---------------------------------------------------------------------------
// The Postgres backend alone
// ---------------------------------------------------------------------------

const RETRY_BATCH = [
  {
    kind: "front_matter_read",
    eventId: "retry-1",
    sessionId: "s-retry",
    at: "2026-08-30T00:00:00.000Z",
    visitId: "v1",
    nodeId: "node-a",
  },
  {
    kind: "front_matter_read",
    eventId: "retry-2",
    sessionId: "s-retry",
    at: "2026-08-30T00:00:01.000Z",
    visitId: "v2",
    nodeId: "node-b",
  },
];

test("a-reship-of-already-landed-rows-adds-nothing: the idempotence a retry rests on", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);

  assert.equal(await store.append(RETRY_BATCH, { sessionId: "s-retry" }), true);
  // The shape a real retry takes: the shipper re-reads the same bytes because its cursor never
  // advanced, so the SAME rows are offered again. Without ON CONFLICT DO NOTHING this doubles a
  // session's history every time the database recovers from a partial failure.
  assert.equal(await store.append(RETRY_BATCH, { sessionId: "s-retry" }), true);

  assert.equal(pool.rows.length, 2);
  assert.equal((await store.read("s-retry")).replay.events.length, 2);
});

test("an-append-stamps-the-identity-columns-the-reader-reads-back: grade and slot reach the row itself", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "stamped", at: "2026-08-30T00:00:00.000Z", sessionId: "s-stamp", visitId: "v", nodeId: "n" })],
    { sessionId: "s-stamp", grade: "declared", slot: "worktree-gamma" },
  );

  // Asserted on the ROW rather than through `read`, so a store that round-tripped the values through
  // some other channel — or dropped them and had the reader invent them — could not pass.
  assert.equal(pool.rows[0]?.grade, "declared");
  assert.equal(pool.rows[0]?.slot, "worktree-gamma");
  assert.equal(pool.rows[0]?.session_id, "s-stamp");
  assert.equal(pool.rows[0]?.observed_at, "2026-08-30T00:00:00.000Z");
});

test("an-append-with-no-identity-stores-nulls-not-strings: an unstated grade is absent in the row", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "bare", at: "2026-08-30T00:00:00.000Z", sessionId: "s-bare", visitId: "v", nodeId: "n" })],
    { sessionId: "s-bare" },
  );
  assert.equal(pool.rows[0]?.grade, null);
  assert.equal(pool.rows[0]?.slot, null);
  // An unrecorded harness and machine are NULL columns — "unrecorded", never an empty string a
  // reader could quote back as a harness or a box.
  assert.equal(pool.rows[0]?.harness, null);
  assert.equal(pool.rows[0]?.host, null);
});

test("an-append-carries-the-harness-and-host-in-the-parameter-positions-the-insert-names: $10 and $11, after the event", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  const event = visit({ eventId: "prov", at: "2026-09-18T00:00:00.000Z", sessionId: "s-prov", visitId: "v", nodeId: "n" });
  await store.append([event], {
    sessionId: "s-prov",
    grade: "window",
    slot: "worktree-alpha",
    origin: "cut",
    cutBy: "parent-window",
    cutFor: "some-arc",
    harness: "codex",
    host: "owner-laptop",
  });

  // EVERY position, so a parameter slotted in the wrong place — the harness where the event belongs,
  // say — shows here rather than as a row the live INSERT would reject. The event ($9) is compared by
  // VALUE: it is serialised after the vocabulary's parse, which fixes its own key order.
  assert.equal(pool.insertParams.length, 1);
  const [params] = pool.insertParams;
  assert.deepEqual(params?.slice(0, 8), [
    "prov",
    "s-prov",
    "2026-09-18T00:00:00.000Z",
    "window",
    "worktree-alpha",
    "cut",
    "parent-window",
    "some-arc",
  ]);
  assert.deepEqual(JSON.parse(String(params?.[8])), event);
  assert.deepEqual(params?.slice(9), ["codex", "owner-laptop"]);
  assert.equal(params?.length, 11);
  // ...and the ROW the double built from them, so what the reader reads back is what was sent.
  assert.equal(pool.rows[0]?.harness, "codex");
  assert.equal(pool.rows[0]?.host, "owner-laptop");

  // An unrecorded pair is sent as NULLs in the same two positions, never dropped from the list.
  await store.append(
    [visit({ eventId: "prov-bare", at: "2026-09-18T00:00:01.000Z", sessionId: "s-prov", visitId: "v2", nodeId: "n" })],
    { sessionId: "s-prov" },
  );
  assert.deepEqual(pool.insertParams[1]?.slice(9), [null, null]);
  assert.equal(pool.insertParams[1]?.length, 11);
});

test("a-row-with-an-unrecognised-harness-or-an-empty-host-reads-as-unrecorded: the event still lands", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [
      visit({ eventId: "odd-1", at: "2026-09-18T00:00:00.000Z", sessionId: "s-odd", visitId: "v1", nodeId: "n" }),
      visit({ eventId: "odd-2", at: "2026-09-18T00:00:01.000Z", sessionId: "s-odd", visitId: "v2", nodeId: "n" }),
    ],
    { sessionId: "s-odd", harness: "codex", host: "owner-laptop" },
  );
  // A harness this reader does not know and a host that names nothing — a newer writer, or a
  // hand-edited row. Neither may cost the event, and neither may be coerced into a value.
  pool.restamp("odd-1", { harness: "gemini", host: "" });
  pool.restamp("odd-2", { harness: null, host: null });

  const read = await store.read("s-odd");
  assert.equal(read.replay.events.length, 2, "an unusable attribute must never cost the event");
  assert.equal(read.skipped, 0);
  assert.deepEqual(read.harnesses, []);
  assert.deepEqual(read.hosts, []);
});

test("a-row-whose-payload-no-longer-parses-is-skipped-and-counted: honestly partial, never thrown on", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [
      visit({ eventId: "good", at: "2026-08-30T00:00:00.000Z", sessionId: "s-partial", visitId: "v1", nodeId: "a" }),
      visit({ eventId: "rots", at: "2026-08-30T00:00:01.000Z", sessionId: "s-partial", visitId: "v2", nodeId: "b" }),
    ],
    { sessionId: "s-partial" },
  );
  // A row written under an older vocabulary, or by a writer this reader is behind: the JSONL sink
  // meets exactly this as a line with an unreadable `event`, and answers with a skip AND a count.
  pool.corrupt("rots", { kind: "front_matter_read", eventId: "rots" });

  const read = await store.read("s-partial");
  assert.equal(read.replay.events.length, 1);
  assert.equal(read.replay.events[0]?.eventId, "good");
  assert.equal(read.skipped, 1);
});

test("a-row-with-an-unrecognised-grade-is-read-as-a-legacy-line-not-rejected: the event still lands", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "odd", at: "2026-08-30T00:00:00.000Z", sessionId: "s-odd", visitId: "v", nodeId: "n" })],
    { sessionId: "s-odd", grade: "window", slot: "worktree-alpha" },
  );
  // A grade this reader does not know — a newer writer, or a hand-edited row. The rule is "this
  // reader cannot vouch for it", NOT "throw the event away with it".
  pool.restamp("odd", { grade: "from-the-future", slot: "" });

  const read = await store.read("s-odd");
  assert.equal(read.replay.events.length, 1, "an unknown grade must never cost the event");
  assert.equal(read.skipped, 0);
  assert.equal(read.identity, "slot", "unrecognised is unstated, which is the legacy era");
  assert.deepEqual(read.slots, [], "an empty slot names no worktree and is not reported as one");
});

test("a-write-the-pool-refuses-returns-false-and-never-throws: the shipper reads that false as a backlog", async () => {
  const pool = new FakeTraversalPool();
  pool.failOn = "INSERT INTO events.traversal_event";
  const store = new PgTraversalEventStore(pool);

  const landed = await store.append(
    [visit({ eventId: "refused", at: "2026-08-30T00:00:00.000Z", sessionId: "s-refused", visitId: "v", nodeId: "n" })],
    { sessionId: "s-refused" },
  );

  // FALSE, not a throw: telemetry never changes a caller's control flow (ADR-0241 D3). What
  // ADR-0484 D4 withdrew is SWALLOWING the failure — which is why the answer is reported at all.
  assert.equal(landed, false);
  assert.equal(pool.rows.length, 0);
});

test("an-empty-append-touches-the-pool-not-at-all: nothing to say issues no statement", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  assert.equal(await store.append([], { sessionId: "s-empty" }), true);
  assert.deepEqual(pool.calls, []);
});

test("a-read-the-pool-refuses-replays-empty-and-never-throws: an outage is not a crash", async () => {
  const pool = new FakeTraversalPool();
  pool.failOn = "SELECT";
  const store = new PgTraversalEventStore(pool);

  const read = await store.read("s-any");
  assert.equal(read.replay.events.length, 0);
  assert.equal(read.skipped, 0);
  assert.deepEqual(await store.list(), []);
});

test("the-session-list-omits-a-session-whose-every-row-is-unusable: never a fabricated timestamp", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "only", at: "2026-08-30T00:00:00.000Z", sessionId: "s-rotted", visitId: "v", nodeId: "n" })],
    { sessionId: "s-rotted" },
  );
  pool.corrupt("only", { nonsense: true });

  // The JSONL `listTraversalSessions` omits a file that replays to zero usable events rather than
  // reporting it with an invented `lastObservedAt`; the row-backed list answers the same way.
  assert.deepEqual(await store.list(), []);
});

test("the-session-list-ignores-a-row-that-does-not-name-a-session: a projection miss is not a session", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "real", at: "2026-08-30T00:00:00.000Z", sessionId: "s-real", visitId: "v", nodeId: "n" })],
    { sessionId: "s-real" },
  );
  // A driver that answers the id projection with something else — a column renamed, a row of blanks.
  // The list must drop it rather than reading an empty id as a session and listing a phantom.
  pool.rows.push({
    seq: 99,
    event_id: "orphan",
    session_id: "",
    observed_at: "2026-08-30T00:00:01.000Z",
    grade: null,
    slot: null,
    origin: null,
    cut_by: null,
    cut_for: null,
    harness: null,
    host: null,
    event: {},
  });

  assert.deepEqual(
    (await store.list()).map((row) => row.sessionId),
    ["s-real"],
  );
  // Asserted on the STATEMENTS, not only on the answer: a list that invented an id and then found it
  // empty would produce the same list while issuing a query for a session that does not exist.
  assert.deepEqual(pool.selectedSessionIds, ["s-real"]);
});

test("the-visit-identity-dedups-independently-of-the-event-identity: two rows, two different traps", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  // SAME visit, DIFFERENT event ids — the shape a crash-duplicated append takes once the writer has
  // re-minted its event id. Only the VISIT identity catches it.
  await store.append(
    [
      visit({ eventId: "va-1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-visit", visitId: "shared", nodeId: "n" }),
      visit({ eventId: "va-2", at: "2026-08-30T00:00:01.000Z", sessionId: "s-visit", visitId: "shared", nodeId: "n" }),
    ],
    { sessionId: "s-visit" },
  );
  const byVisit = await store.read("s-visit");
  assert.equal(byVisit.replay.events.length, 1);
  assert.equal(byVisit.skipped, 1, "the second is skipped AND counted, never silently dropped");

  // SAME event, DIFFERENT visit ids — only the EVENT identity catches this one, so a reader that
  // kept just the visit set would let it through and double the session's history.
  const other = new FakeTraversalPool();
  const otherStore = new PgTraversalEventStore(other);
  await otherStore.append(
    [visit({ eventId: "same", at: "2026-08-30T00:00:00.000Z", sessionId: "s-event", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-event" },
  );
  other.rows.push({
    seq: 2,
    event_id: "same-row",
    session_id: "s-event",
    observed_at: "2026-08-30T00:00:01.000Z",
    grade: null,
    slot: null,
    origin: null,
    cut_by: null,
    cut_for: null,
    harness: null,
    host: null,
    event: visit({ eventId: "same", at: "2026-08-30T00:00:01.000Z", sessionId: "s-event", visitId: "v2", nodeId: "n" }),
  });
  const byEvent = await otherStore.read("s-event");
  assert.equal(byEvent.replay.events.length, 1);
  assert.equal(byEvent.skipped, 1);
});

test("two-searches-in-one-session-are-two-events: a visit-less event has no visit identity to dedup on", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  // A SEARCH carries no `visitId` at all. A reader that treated "no visit id" as an id would file
  // the second search as a repeat of the first and drop it — silently halving the one figure
  // ADR-0484 D3 landed the search capture to make answerable.
  await store.append(
    [
      {
        kind: "search",
        eventId: "search-1",
        sessionId: "s-search",
        at: "2026-08-30T00:00:00.000Z",
        searchId: "sq-1",
        surfaceId: "library-search",
        operation: "library_artifact_list",
        resultNodeIds: ["a"],
      },
      {
        kind: "search",
        eventId: "search-2",
        sessionId: "s-search",
        at: "2026-08-30T00:00:01.000Z",
        searchId: "sq-2",
        surfaceId: "library-search",
        operation: "library_artifact_list",
        resultNodeIds: ["b"],
      },
    ],
    { sessionId: "s-search" },
  );

  const read = await store.read("s-search");
  assert.deepEqual(
    read.replay.events.map((event) => event.eventId),
    ["search-1", "search-2"],
  );
  assert.equal(read.skipped, 0);
});

test("a-row-with-a-null-slot-names-no-worktree-and-is-not-reported-as-one", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "n1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-null", visitId: "v1", nodeId: "n" })],
    { sessionId: "s-null", grade: "window", slot: null },
  );
  await store.append(
    [visit({ eventId: "n2", at: "2026-08-30T00:00:01.000Z", sessionId: "s-null", visitId: "v2", nodeId: "n" })],
    { sessionId: "s-null", grade: "window", slot: "worktree-alpha" },
  );
  // The slot list is what a reader uses to say WHICH worktrees a window worked in. A null must not
  // become an entry, and a repeat must not become a second one.
  await store.append(
    [visit({ eventId: "n3", at: "2026-08-30T00:00:02.000Z", sessionId: "s-null", visitId: "v3", nodeId: "n" })],
    { sessionId: "s-null", grade: "window", slot: "worktree-alpha" },
  );
  assert.deepEqual((await store.read("s-null")).slots, ["worktree-alpha"]);
});

test("the-identity-of-a-declared-session-reads-back-as-declared: both grades survive the round trip", async () => {
  const pool = new FakeTraversalPool();
  const store = new PgTraversalEventStore(pool);
  await store.append(
    [visit({ eventId: "d1", at: "2026-08-30T00:00:00.000Z", sessionId: "s-decl", visitId: "v", nodeId: "n" })],
    { sessionId: "s-decl", grade: "declared", slot: "worktree-alpha" },
  );
  assert.equal((await store.read("s-decl")).identity, "declared");
});
