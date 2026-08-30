/**
 * Durable local write, then asynchronous ship (ADR-0484 D4) — story `context-traversal-capture`,
 * capability `traversal-trace-sink`.
 *
 * The cases here are the ones the old sink never had, named by the increment itself: a ship that
 * FAILS and retries, a backlog that is REPORTED rather than hidden, and a command that completes
 * normally with the database down. Plus the one this landing must not get wrong in the other
 * direction — that nothing here BACKFILLS (ADR-0484 D6).
 *
 * THE DOUBLE IS A `TraversalEventStore`, NOT A POOL. What the shipper is responsible for is the
 * FILE-to-seam path — which bytes it reads, where its cursor lands, and what it does when the store
 * says no — and none of that is about SQL. Driving a Postgres double here would put the store's own
 * behaviour between every assertion and its subject; the store has its own suite for that.
 *
 * Every fixture writes to a fresh temporary directory, never the real `HOME`, and the clock is
 * injected so a cursor's timestamps are assertable rather than merely present.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { appendTraversalEvents, resolveTraversalDir } from "../sink.js";
import {
  ensureShipBaseline,
  hasUnshippedEvents,
  isShipChildProcess,
  markShipAttempt,
  readShipCursor,
  shippableSessions,
  shipTraversalBacklog,
  shipTraversalSession,
  shouldAttemptShip,
  shouldStartShip,
  traversalShipBacklog,
  writeShipCursor,
  SHIP_CHILD_ENV,
  SHIP_THROTTLE_MS,
  SHIP_WATCHDOG_MS,
  TRAVERSAL_DIR_ENV,
} from "./ship.js";
import type { TraversalEventLocation, TraversalEventStore } from "./traversal-event-store.js";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const now = (): Date => NOW;

/**
 * A store that remembers what it was handed, and can be told to refuse or to throw.
 *
 * `append` records the LOCATION with each batch, so a test can assert that a trace whose identity
 * changed mid-file was shipped as separate appends rather than smeared under one.
 */
class RecordingStore implements TraversalEventStore {
  readonly appends: { location: TraversalEventLocation; eventIds: string[] }[] = [];
  /** "refuse" answers false; "throw" raises; undefined accepts. */
  mode: "refuse" | "throw" | undefined;

  async append(events: readonly unknown[], location: TraversalEventLocation): Promise<boolean> {
    if (this.mode === "throw") throw new Error("the connector went away mid-batch");
    if (this.mode === "refuse") return false;
    this.appends.push({
      location,
      eventIds: events.map((event) => String((event as { eventId: unknown }).eventId)),
    });
    return true;
  }

  async read(): Promise<never> {
    throw new Error("the shipper never reads the store");
  }

  async list(): Promise<never> {
    throw new Error("the shipper never lists the store");
  }

  /** Every event id this store accepted, in the order it accepted them. */
  get shippedIds(): string[] {
    return this.appends.flatMap((entry) => entry.eventIds);
  }
}

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-ship-${prefix}-`));
}

function visit(sessionId: string, n: number) {
  return {
    kind: "front_matter_read",
    eventId: `${sessionId}-e${n}`,
    sessionId,
    at: `2026-08-30T00:00:0${n}.000Z`,
    visitId: `${sessionId}-v${n}`,
    nodeId: `node-${n}`,
  };
}

/** The capture path's own order: baseline first (a no-op after the first), then the local append. */
function capture(
  dir: string,
  sessionId: string,
  n: number,
  identity?: { grade: "window" | "declared"; slot: string },
): void {
  ensureShipBaseline(dir, sessionId);
  const location = identity === undefined ? { dir, sessionId } : { dir, sessionId, ...identity };
  appendTraversalEvents([visit(sessionId, n)], location);
}

function traceLines(dir: string, sessionId: string): string[] {
  return fs.readFileSync(path.join(dir, `${sessionId}.jsonl`), "utf8").split("\n").filter(Boolean);
}

// ---------------------------------------------------------------------------
// The forward-only baseline (ADR-0484 D6)
// ---------------------------------------------------------------------------

test("the-baseline-is-the-files-current-end-so-history-is-never-backfilled: ADR-0484 D6, and it is the default", async () => {
  const dir = freshDir("no-backfill");
  const sessionId = "s-history";

  // Pre-landing history: three events written by a capture path that knew nothing about shipping.
  appendTraversalEvents([visit(sessionId, 1), visit(sessionId, 2), visit(sessionId, 3)], { dir, sessionId });

  // The FIRST invocation after the landing stamps the baseline before appending its own event.
  capture(dir, sessionId, 4);

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });

  assert.equal(outcome.shipped, 1);
  assert.deepEqual(store.shippedIds, [`${sessionId}-e4`]);
  // The history is still on disk, untouched — "stays valid and stays where it is".
  assert.equal(traceLines(dir, sessionId).length, 4);
});

test("a-session-with-no-cursor-is-pure-history-and-the-sweep-skips-it-entirely", async () => {
  const dir = freshDir("untracked");
  appendTraversalEvents([visit("s-untracked", 1)], { dir, sessionId: "s-untracked" });

  assert.deepEqual(shippableSessions(dir), []);
  const store = new RecordingStore();
  const report = await shipTraversalBacklog({ dir, store, now });
  assert.equal(report.shipped, 0);
  // ASKED DIRECTLY TOO, not only through the sweep: the sweep's own filter would hide a
  // `shipTraversalSession` that shipped a cursorless session when asked by id, and that is the call
  // a future caller would reach for.
  const direct = await shipTraversalSession("s-untracked", { dir, store, now });
  assert.equal(direct.shipped, 0);
  assert.equal(readShipCursor(dir, "s-untracked"), null, "and it never stamps a cursor of its own");
  // Not merely "shipped nothing" — the sweep never considered it, which is what stops a first sweep
  // from silently becoming the migration the owner declined.
  assert.deepEqual(store.appends, []);
});

test("the-baseline-is-stamped-once-and-a-later-invocation-never-moves-it-forward-past-unshipped-events", () => {
  const dir = freshDir("baseline-once");
  const sessionId = "s-once";
  capture(dir, sessionId, 1);
  const first = readShipCursor(dir, sessionId);

  // A second invocation of the same session: `ensureShipBaseline` must be a no-op, or every
  // invocation would re-baseline past the events the previous one just wrote.
  capture(dir, sessionId, 2);
  assert.equal(first?.offset, 0);
  assert.equal(readShipCursor(dir, sessionId)?.offset, 0);
});

// ---------------------------------------------------------------------------
// The cursor, its retries, and what it tolerates
// ---------------------------------------------------------------------------

test("a-ship-that-fails-leaves-the-cursor-unadvanced-and-records-why: the retry IS the cursor", async () => {
  const dir = freshDir("retry");
  const sessionId = "s-retry";
  capture(dir, sessionId, 1);
  capture(dir, sessionId, 2);

  const store = new RecordingStore();
  store.mode = "refuse";

  const failed = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(failed.ok, false);
  assert.equal(failed.shipped, 0);
  assert.equal(failed.error, "the store refused the batch");

  const afterFailure = readShipCursor(dir, sessionId);
  assert.equal(afterFailure?.offset, 0, "a failed ship must not step over bytes the store never saw");
  assert.equal(afterFailure?.consecutiveFailures, 1);
  assert.equal(afterFailure?.lastAttemptAt, NOW.toISOString());
  assert.ok((afterFailure?.lastError ?? "").length > 0, "the failure is recorded, not swallowed");
  assert.equal(afterFailure?.lastShippedAt, undefined);

  // A SECOND failure accumulates rather than resetting — the count is what tells a reader whether
  // this is a blip or an outage.
  await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(readShipCursor(dir, sessionId)?.consecutiveFailures, 2);

  // The database comes back. The SAME bytes are retried, because nothing advanced.
  store.mode = undefined;
  const recovered = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.shipped, 2);

  const afterSuccess = readShipCursor(dir, sessionId);
  assert.equal(afterSuccess?.consecutiveFailures, 0);
  assert.equal(afterSuccess?.lastError, undefined);
  assert.equal(afterSuccess?.lastShippedAt, NOW.toISOString());
  assert.equal(afterSuccess?.shipped, 2);
  assert.deepEqual(store.shippedIds, [`${sessionId}-e1`, `${sessionId}-e2`]);
});

test("a-store-that-throws-is-recorded-by-its-message-not-turned-into-a-crash", async () => {
  const dir = freshDir("throws");
  const sessionId = "s-throws";
  capture(dir, sessionId, 1);

  const store = new RecordingStore();
  store.mode = "throw";
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, "the connector went away mid-batch");
  assert.equal(readShipCursor(dir, sessionId)?.lastError, "the connector went away mid-batch");
});

test("a-second-ship-with-nothing-new-sends-nothing: the cursor is what stops a sweep re-sending a whole trace", async () => {
  const dir = freshDir("idle");
  const sessionId = "s-idle";
  capture(dir, sessionId, 1);

  const store = new RecordingStore();
  await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(store.appends.length, 1);

  const second = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(second.shipped, 0);
  assert.equal(store.appends.length, 1, "an up-to-date session must not touch the store at all");
});

test("a-crash-truncated-final-line-is-left-for-the-next-attempt-never-shipped-half-parsed", async () => {
  const dir = freshDir("truncated");
  const sessionId = "s-truncated";
  capture(dir, sessionId, 1);
  // A line still being written: no trailing newline, and only part of the JSON on disk.
  fs.appendFileSync(path.join(dir, `${sessionId}.jsonl`), '{"v":1,"event":{"kind":"front_mat', "utf8");

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 1);
  assert.equal(outcome.unshippable, 0, "an unfinished line is not an unusable one — it is not yet a line");

  // Completed by the writer that was mid-flight; the next attempt picks it up.
  fs.appendFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    `ter_read","eventId":"${sessionId}-e9","sessionId":"${sessionId}","at":"2026-08-30T00:00:09.000Z","visitId":"${sessionId}-v9","nodeId":"node-9"}}\n`,
    "utf8",
  );
  const resumed = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(resumed.shipped, 1);
  assert.deepEqual(store.shippedIds, [`${sessionId}-e1`, `${sessionId}-e9`]);
});

test("a-baselined-session-whose-trace-file-does-not-exist-ships-nothing-and-records-no-success", async () => {
  const dir = freshDir("no-file");
  const sessionId = "s-no-file";
  // The shape an opted-out or refused append leaves behind: a cursor with nothing beside it.
  ensureShipBaseline(dir, sessionId);
  assert.deepEqual(shippableSessions(dir), [sessionId]);

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 0);
  assert.deepEqual(store.appends, []);
  // NOT recorded as a successful ship: a cursor that stamped `lastShippedAt` for a file it never
  // read would report a machine as up to date on the strength of having done nothing.
  assert.equal(readShipCursor(dir, sessionId)?.lastShippedAt, undefined);
  assert.equal(readShipCursor(dir, sessionId)?.lastAttemptAt, undefined);
});

test("a-trace-with-no-complete-line-at-all-ships-nothing-and-does-not-advance", async () => {
  const dir = freshDir("no-line");
  const sessionId = "s-partial-only";
  ensureShipBaseline(dir, sessionId);
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{"v":1,"event":{"kind":"fro', "utf8");

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 0);
  assert.deepEqual(store.appends, []);
  assert.equal(readShipCursor(dir, sessionId)?.offset, 0);
});

test("an-unusable-line-is-counted-and-stepped-past-never-wedging-the-queue-behind-one-bad-byte", async () => {
  const dir = freshDir("garbage");
  const sessionId = "s-garbage";
  const trace = path.join(dir, `${sessionId}.jsonl`);
  capture(dir, sessionId, 1);
  // Four ways a line can be unusable, one of each: not JSON, a wrong `v`, an unreadable event, and
  // a JSON value that is not an object at all.
  fs.appendFileSync(trace, "not json at all\n", "utf8");
  fs.appendFileSync(trace, '{"v":99,"event":{}}\n', "utf8");
  fs.appendFileSync(trace, '{"v":1,"event":{"kind":"nope"}}\n', "utf8");
  fs.appendFileSync(trace, "17\n", "utf8");
  // A BLANK line is not unusable — it is not a line. Counting it would make `unshippable` a measure
  // of formatting rather than of loss.
  fs.appendFileSync(trace, "   \n\n", "utf8");
  capture(dir, sessionId, 2);

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 2);
  assert.equal(outcome.unshippable, 4);
  assert.equal(readShipCursor(dir, sessionId)?.unshippable, 4);
  assert.equal(hasUnshippedEvents(dir, sessionId), false, "the cursor must clear the bad lines, not stop on them");
});

test("a-one-byte-unusable-line-still-advances-the-cursor: the end-of-slice sentinel is -1, not an index", async () => {
  const dir = freshDir("one-byte");
  const sessionId = "s-one-byte";
  ensureShipBaseline(dir, sessionId);
  // The pending slice is exactly `x\n`, so its last newline sits at index 1. A reader that compared
  // that sentinel against 1 rather than -1 would read this as "no complete line", ship nothing, and
  // leave the cursor parked forever on a line that can never become valid.
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), "x\n", "utf8");

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.unshippable, 1);
  assert.equal(readShipCursor(dir, sessionId)?.offset, 2);
  assert.equal(hasUnshippedEvents(dir, sessionId), false);
});

test("a-line-with-windows-line-endings-still-ships: a trailing carriage return is not corruption", async () => {
  const dir = freshDir("crlf");
  const sessionId = "s-crlf";
  ensureShipBaseline(dir, sessionId);
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), `${JSON.stringify({ v: 1, event: visit(sessionId, 1) })}\r\n`, "utf8");

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 1);
  assert.equal(outcome.unshippable, 0);
});

test("a-line-whose-grade-is-unrecognised-still-ships-as-an-unstated-one: the event is never the casualty", async () => {
  const dir = freshDir("odd-grade");
  const sessionId = "s-odd-grade";
  ensureShipBaseline(dir, sessionId);
  fs.writeFileSync(
    path.join(dir, `${sessionId}.jsonl`),
    `${JSON.stringify({ v: 1, event: visit(sessionId, 1), grade: "from-the-future", slot: 42 })}\n`,
    "utf8",
  );

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 1);
  assert.equal(outcome.unshippable, 0);
  assert.equal(store.appends[0]?.location.grade, undefined, "unrecognised is unstated, never coerced");
  assert.equal(store.appends[0]?.location.slot, null, "a slot that is not a string names no worktree");
});

test("a-cursor-that-is-unreadable-as-a-cursor-re-ships-from-the-start-rather-than-being-trusted", async () => {
  const dir = freshDir("bad-cursor");
  const sessionId = "s-bad-cursor";
  capture(dir, sessionId, 1);
  capture(dir, sessionId, 2);
  // Three shapes that are not a cursor: unparseable, a wrong type, an impossible offset. Each must
  // degrade to the EMPTY cursor — never to `null`, which would mean "pre-landing history".
  for (const corrupt of ["{not json", '{"v":1,"offset":"lots"}', '{"v":1,"offset":-5,"shipped":0,"unshippable":0,"consecutiveFailures":0}']) {
    fs.writeFileSync(path.join(dir, `${sessionId}.ship.json`), corrupt, "utf8");
    assert.equal(readShipCursor(dir, sessionId)?.offset, 0, `expected the empty cursor for ${corrupt}`);
  }

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 2, "an unreadable cursor re-ships; the store's idempotence absorbs it");
});

test("a-cursor-pointing-past-the-end-of-a-replaced-file-is-clamped-not-used-as-an-offset", async () => {
  const dir = freshDir("clamped");
  const sessionId = "s-clamped";
  capture(dir, sessionId, 1);
  // A trace is append-only (ADR-0241 D7), so this only happens when something outside the system
  // replaced the file. The bytes the cursor covered are gone; the shipper must not read whatever now
  // occupies those offsets, and must not report a negative backlog.
  writeShipCursor(dir, sessionId, { v: 1, offset: 10_000, shipped: 0, unshippable: 0, consecutiveFailures: 0 });

  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 0);
  assert.equal(traversalShipBacklog(dir).waiting.length, 0);
  assert.equal(hasUnshippedEvents(dir, sessionId), false);
});

// ---------------------------------------------------------------------------
// Identity runs
// ---------------------------------------------------------------------------

test("line-identity-changes-mid-trace-are-shipped-as-separate-appends-never-smeared-across-neighbours", async () => {
  const dir = freshDir("identity-runs");
  const sessionId = "s-moved";
  capture(dir, sessionId, 1, { grade: "window", slot: "worktree-alpha" });
  capture(dir, sessionId, 2, { grade: "window", slot: "worktree-alpha" });
  capture(dir, sessionId, 3, { grade: "window", slot: "worktree-beta" });
  // The SLOT is unchanged here and only the GRADE moves, so a grouping rule that compared slots
  // alone would fold this into the run above it.
  capture(dir, sessionId, 4, { grade: "declared", slot: "worktree-beta" });
  capture(dir, sessionId, 5);

  const store = new RecordingStore();
  await shipTraversalSession(sessionId, { dir, store, now });

  // FOUR appends, not five and not one: consecutive lines sharing an identity are batched, and a
  // change — of slot, then of grade, then to none — starts a new one each time. Order is preserved
  // across all of them.
  assert.deepEqual(
    store.appends.map((entry) => [entry.location.grade, entry.location.slot, entry.eventIds.length]),
    [
      ["window", "worktree-alpha", 2],
      ["window", "worktree-beta", 1],
      ["declared", "worktree-beta", 1],
      [undefined, null, 1],
    ],
  );
  // An unstated grade is an ABSENT key, not an explicit `undefined` — the same distinction the sink
  // makes when it stamps a line, and the reason a legacy line stays legible as one.
  assert.equal("grade" in (store.appends[3]?.location ?? {}), false);
  assert.deepEqual(store.shippedIds, [
    `${sessionId}-e1`,
    `${sessionId}-e2`,
    `${sessionId}-e3`,
    `${sessionId}-e4`,
    `${sessionId}-e5`,
  ]);
});

// ---------------------------------------------------------------------------
// The backlog report
// ---------------------------------------------------------------------------

test("the-backlog-reports-how-many-and-since-when-and-which-sessions-are-failing", async () => {
  const dir = freshDir("backlog");
  capture(dir, "s-waiting", 1);
  capture(dir, "s-waiting", 2);
  capture(dir, "s-later", 3);
  capture(dir, "s-clean", 1);

  const store = new RecordingStore();
  await shipTraversalSession("s-clean", { dir, store, now });

  store.mode = "refuse";
  await shipTraversalSession("s-waiting", { dir, store, now });

  const backlog = traversalShipBacklog(dir);
  assert.equal(backlog.tracked, 3, "every session carrying a cursor is tracked, shipped or not");
  assert.equal(backlog.totalUnshippedEvents, 3, "two on s-waiting plus one on s-later");
  assert.equal(backlog.oldestUnshippedAt, "2026-08-30T00:00:01.000Z");
  // Oldest-waiting FIRST — `s-waiting`'s oldest event predates `s-later`'s, so it leads even though
  // `s-later` was never attempted.
  assert.deepEqual(
    backlog.waiting.map((row) => row.sessionId),
    ["s-waiting", "s-later"],
  );
  assert.equal(backlog.waiting[0]?.unshippedEvents, 2);
  assert.ok((backlog.waiting[0]?.unshippedBytes ?? 0) > 0);

  // "We have no data" stays distinguishable from "nothing happened": the failing set is named, with
  // the reason the last attempt gave, and a session simply WAITING is not in it.
  assert.deepEqual(
    backlog.failing.map((row) => row.sessionId),
    ["s-waiting"],
  );
  assert.equal(backlog.failing[0]?.lastError, "the store refused the batch");
  assert.equal(backlog.failing[0]?.consecutiveFailures, 1);
});

test("a-waiting-session-with-no-readable-event-still-appears-in-the-backlog: bytes waiting is the fact", async () => {
  const dir = freshDir("bytes-only");
  ensureShipBaseline(dir, "s-unreadable");
  fs.writeFileSync(path.join(dir, "s-unreadable.jsonl"), "garbage\n", "utf8");
  capture(dir, "s-normal", 1);

  const backlog = traversalShipBacklog(dir);
  // Both are WAITING — one with an event to name and one without. A report that dropped the row it
  // could not date would lose the session in the WORSE state, so the undateable one is kept; and
  // because a reader scans from the top, it sorts LAST rather than ahead of a real backlog.
  assert.deepEqual(
    backlog.waiting.map((row) => [row.sessionId, row.unshippedEvents, row.oldestUnshippedAt]),
    [
      ["s-normal", 1, "2026-08-30T00:00:01.000Z"],
      ["s-unreadable", 0, undefined],
    ],
  );
  assert.equal(backlog.totalUnshippedEvents, 1, "bytes are not events; only what parsed is counted");
});

test("the-backlog-is-ordered-oldest-first-and-an-undateable-row-never-jumps-the-queue", () => {
  const dir = freshDir("ordering");
  // Three waiting sessions: two dateable and one not. Written youngest-first so the ORDER asserted
  // below cannot be the insertion order by accident.
  capture(dir, "s-young", 5);
  ensureShipBaseline(dir, "s-undated");
  fs.writeFileSync(path.join(dir, "s-undated.jsonl"), "garbage\n", "utf8");
  capture(dir, "s-old", 1);

  assert.deepEqual(
    traversalShipBacklog(dir).waiting.map((row) => row.sessionId),
    ["s-old", "s-young", "s-undated"],
  );
});

test("an-empty-backlog-is-an-answer-not-an-absence: a fully-shipped machine reports tracked sessions and zero waiting", async () => {
  const dir = freshDir("empty-backlog");
  capture(dir, "s-only", 1);
  const store = new RecordingStore();
  await shipTraversalBacklog({ dir, store, now });

  const backlog = traversalShipBacklog(dir);
  assert.equal(backlog.tracked, 1);
  assert.equal(backlog.totalUnshippedEvents, 0);
  assert.deepEqual(backlog.waiting, []);
  assert.deepEqual(backlog.failing, []);
  assert.equal(backlog.oldestUnshippedAt, undefined);
});

test("a-backlog-over-a-directory-that-does-not-exist-is-empty-never-a-throw", () => {
  // Asked of the enumerator DIRECTLY as well: the backlog's own filter would hide an enumerator that
  // invented a session id for an unreadable directory, and every sweep starts from this list.
  assert.deepEqual(shippableSessions(path.join(os.tmpdir(), "traversal-ship-nowhere-at-all")), []);
  const backlog = traversalShipBacklog(path.join(os.tmpdir(), "traversal-ship-nowhere-at-all"));
  assert.equal(backlog.tracked, 0);
  assert.equal(backlog.totalUnshippedEvents, 0);
  assert.deepEqual(backlog.waiting, []);
});

// ---------------------------------------------------------------------------
// The whole-machine sweep
// ---------------------------------------------------------------------------

test("the-sweep-reports-only-the-sessions-that-moved-and-one-failure-never-stops-the-others", async () => {
  const dir = freshDir("sweep");
  capture(dir, "s-one", 1);
  capture(dir, "s-two", 2);
  capture(dir, "s-done", 3);

  const store = new RecordingStore();
  await shipTraversalSession("s-done", { dir, store, now });

  const report = await shipTraversalBacklog({ dir, store, now });
  assert.equal(report.shipped, 2, "the two waiting sessions ship; the up-to-date one contributes nothing");
  assert.equal(report.failed, 0);
  assert.deepEqual(
    report.sessions.map((outcome) => outcome.sessionId).sort(),
    ["s-one", "s-two"],
    "an already-shipped session is not a row in the report",
  );
});

test("the-sweep-reports-a-session-that-only-skipped-lines: doing nothing and losing something differ", async () => {
  const dir = freshDir("sweep-skips");
  ensureShipBaseline(dir, "s-skips");
  fs.writeFileSync(path.join(dir, "s-skips.jsonl"), "garbage\nmore garbage\n", "utf8");
  capture(dir, "s-quiet", 1);
  const store = new RecordingStore();
  await shipTraversalSession("s-quiet", { dir, store, now });

  const report = await shipTraversalBacklog({ dir, store, now });
  assert.equal(report.shipped, 0, "nothing was shippable");
  assert.equal(report.unshippable, 2, "but two lines were LOST, and the sweep says so");
  assert.deepEqual(
    report.sessions.map((outcome) => outcome.sessionId),
    ["s-skips"],
    "a session that skipped lines moved; the up-to-date one did not",
  );
});

test("the-sweep-counts-a-failing-session-and-keeps-going", async () => {
  const dir = freshDir("sweep-fail");
  capture(dir, "s-a", 1);
  capture(dir, "s-b", 2);

  const store = new RecordingStore();
  store.mode = "refuse";
  const report = await shipTraversalBacklog({ dir, store, now });

  assert.equal(report.failed, 2, "both sessions were attempted — the first failure stops neither");
  assert.equal(report.shipped, 0);
  assert.equal(report.sessions.length, 2);
});

// ---------------------------------------------------------------------------
// The trigger's two cheap questions
// ---------------------------------------------------------------------------

test("the-local-write-completes-with-the-database-down-and-the-events-are-still-there-afterwards", async () => {
  const dir = freshDir("db-down");
  const sessionId = "s-offline";
  // No store is reachable at all here — this is the whole of what the capture path does.
  capture(dir, sessionId, 1);
  capture(dir, sessionId, 2);

  assert.equal(traceLines(dir, sessionId).length, 2);
  assert.equal(hasUnshippedEvents(dir, sessionId), true);

  // Later, once a store exists again, the same bytes ship. Nothing was lost by the outage, and
  // nothing about the outage reached the command that wrote them.
  const store = new RecordingStore();
  const outcome = await shipTraversalSession(sessionId, { dir, store, now });
  assert.equal(outcome.shipped, 2);
});

test("has-unshipped-events-is-false-for-a-session-with-no-cursor: the trigger never wakes for pure history", () => {
  const dir = freshDir("trigger");
  appendTraversalEvents([visit("s-old", 1)], { dir, sessionId: "s-old" });
  assert.equal(hasUnshippedEvents(dir, "s-old"), false);

  capture(dir, "s-new", 1);
  assert.equal(hasUnshippedEvents(dir, "s-new"), true);

  // A baselined session whose trace file is not there yet: a cursor exists, so this is not history —
  // but there is nothing past the offset either, so there is nothing to wake for.
  ensureShipBaseline(dir, "s-empty");
  assert.equal(hasUnshippedEvents(dir, "s-empty"), false);
});

test("a-ship-with-no-injected-clock-stamps-a-real-timestamp: the default is a clock, not a blank", async () => {
  const dir = freshDir("real-clock");
  const sessionId = "s-real-clock";
  capture(dir, sessionId, 1);

  const before = Date.now();
  await shipTraversalSession(sessionId, { dir, store: new RecordingStore() });
  const stamped = readShipCursor(dir, sessionId)?.lastShippedAt;

  assert.ok(stamped !== undefined, "a successful ship always records WHEN");
  const parsed = Date.parse(stamped ?? "");
  assert.equal(Number.isNaN(parsed), false, "and it records a real instant, not an empty string");
  assert.ok(parsed >= before - 1000);
});

test("an-unwritable-cursor-is-a-false-not-a-throw: the ship still reports what it did", () => {
  const dir = freshDir("unwritable");
  const sessionId = "s-unwritable";
  // The control: a writable target answers TRUE. Without it, the refusal below is equally
  // consistent with a writer that never reports success at all.
  assert.equal(
    writeShipCursor(dir, "s-writable", { v: 1, offset: 7, shipped: 0, unshippable: 0, consecutiveFailures: 0 }),
    true,
  );
  assert.equal(readShipCursor(dir, "s-writable")?.offset, 7);
  // A DIRECTORY where the cursor file belongs — the shape an unwritable target takes without needing
  // permissions this suite cannot portably set.
  fs.mkdirSync(path.join(dir, `${sessionId}.ship.json`), { recursive: true });
  assert.equal(
    writeShipCursor(dir, sessionId, { v: 1, offset: 0, shipped: 0, unshippable: 0, consecutiveFailures: 0 }),
    false,
  );
});

test("the-throttle-is-per-machine-and-keyed-on-the-attempt-so-a-down-database-costs-one-try-per-window", () => {
  const dir = freshDir("throttle");
  assert.equal(shouldAttemptShip(dir, NOW, 300_000), true, "a machine that has never tried may try");

  markShipAttempt(dir, NOW);
  assert.equal(shouldAttemptShip(dir, NOW, 300_000), false);
  assert.equal(shouldAttemptShip(dir, new Date(NOW.getTime() + 299_999), 300_000), false);
  assert.equal(shouldAttemptShip(dir, new Date(NOW.getTime() + 300_000), 300_000), true);

  // An unreadable marker is treated as NO marker: the safe direction is attempting, because an extra
  // attempt costs one bounded process and never attempting costs silence.
  fs.writeFileSync(path.join(dir, ".ship-attempt"), "whenever", "utf8");
  assert.equal(shouldAttemptShip(dir, NOW, 300_000), true);
});

test("the-throttle-marker-is-not-mistaken-for-a-session: only cursors name a shippable session", () => {
  const dir = freshDir("marker");
  capture(dir, "s-real", 1);
  markShipAttempt(dir, NOW);
  assert.deepEqual(shippableSessions(dir), ["s-real"]);
});

// ---------------------------------------------------------------------------
// Whether to start the out-of-band shipper at all
// ---------------------------------------------------------------------------

/** The state an ordinary invocation is in: a real session with something to ship, nothing overridden. */
function readyToShip(dir: string, sessionId: string) {
  return { sessionId, env: {} as Record<string, string | undefined>, dir, now: NOW, captureEnabled: true };
}

test("the-ship-trigger-fires-only-when-every-rule-passes: each one refuses on its own", () => {
  const dir = freshDir("trigger-rules");
  const sessionId = "s-trigger";
  capture(dir, sessionId, 1);

  // The control. Without it every refusal below is equally consistent with a trigger that never
  // fires at all, which is the shape that would leave the shared log permanently empty.
  assert.equal(shouldStartShip(readyToShip(dir, sessionId)), true);

  assert.equal(shouldStartShip({ ...readyToShip(dir, sessionId), sessionId: null }), false, "no identity");
  assert.equal(
    shouldStartShip({ ...readyToShip(dir, sessionId), env: { [SHIP_CHILD_ENV]: "1" } }),
    false,
    "the shipper must never start another shipper",
  );
  assert.equal(
    shouldStartShip({ ...readyToShip(dir, sessionId), captureEnabled: false }),
    false,
    "capture is off, so there is nothing this run may record OR ship",
  );
  assert.equal(
    shouldStartShip({ ...readyToShip(dir, sessionId), env: { [TRAVERSAL_DIR_ENV]: dir } }),
    false,
    "an overridden trace directory is never swept ambiently",
  );
  assert.equal(
    shouldStartShip({ ...readyToShip(dir, "s-never-captured") }),
    false,
    "a session with no cursor is pre-landing history",
  );

  // And the throttle, which is the only rule that is about TIME rather than about identity.
  markShipAttempt(dir, NOW);
  assert.equal(shouldStartShip(readyToShip(dir, sessionId)), false, "inside the throttle window");
  assert.equal(
    shouldStartShip({ ...readyToShip(dir, sessionId), now: new Date(NOW.getTime() + SHIP_THROTTLE_MS) }),
    true,
    "and true again once the window has passed",
  );
});

test("the-child-flag-is-recognised-by-its-exact-value-only: a stray or empty value is not the shipper", () => {
  assert.equal(isShipChildProcess({ [SHIP_CHILD_ENV]: "1" }), true);
  assert.equal(isShipChildProcess({}), false);
  assert.equal(isShipChildProcess({ [SHIP_CHILD_ENV]: "" }), false);
  assert.equal(isShipChildProcess({ [SHIP_CHILD_ENV]: "0" }), false);
});

test("the-override-guard-watches-the-variable-the-sink-actually-reads: one name, two modules", () => {
  const dir = freshDir("env-agreement");
  const sessionId = "s-env";
  capture(dir, sessionId, 1);

  // The guard and the directory resolver must name the SAME environment variable. If they drift,
  // the trigger goes on firing for a directory a caller redirected — the case it exists to refuse —
  // and nothing would say so, because both halves would keep working in isolation.
  const previous = process.env[TRAVERSAL_DIR_ENV];
  try {
    process.env[TRAVERSAL_DIR_ENV] = dir;
    assert.equal(resolveTraversalDir(), dir, "the sink reads this name");
    assert.equal(shouldStartShip({ ...readyToShip(dir, sessionId), env: process.env }), false, "and so does the guard");
  } finally {
    if (previous === undefined) delete process.env[TRAVERSAL_DIR_ENV];
    else process.env[TRAVERSAL_DIR_ENV] = previous;
  }
});

test("the-child-flag-is-a-real-environment-variable-name: an empty name can never be set or read", () => {
  // `process.env[""]` is undefined for every process, so an empty flag name would make
  // `isShipChildProcess` permanently false — and a shipper that cannot recognise itself spawns
  // another shipper on every invocation it makes.
  assert.ok(SHIP_CHILD_ENV.length > 0);
  assert.ok(SHIP_CHILD_ENV.startsWith("STORYTREE_"));
  assert.ok(TRAVERSAL_DIR_ENV.startsWith("STORYTREE_"));
});

test("the-two-windows-are-sized-for-what-they-wait-on: a throttle in minutes, a watchdog past a cold handshake", () => {
  // Both are plain numbers a reader could mistype into uselessness, and neither has a test that
  // would notice: a throttle of milliseconds spawns a shipper per invocation, and a watchdog under
  // a cold Cloud SQL handshake kills every ship before it can start one — while the backlog report
  // would say only that attempts keep failing.
  assert.ok(SHIP_THROTTLE_MS >= 60_000, "a throttle shorter than a minute is a process per command");
  assert.ok(SHIP_THROTTLE_MS <= 60 * 60_000, "and one longer than an hour is not a live log");
  assert.ok(SHIP_WATCHDOG_MS >= 60_000, "a watchdog under a cold connector handshake kills every ship");
});
