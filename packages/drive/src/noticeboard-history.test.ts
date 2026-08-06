import test from "node:test";
import assert from "node:assert/strict";

import type { ClaimAuditQuery, ClaimAuditRow } from "@storytree/notice-board";

import {
  claimHistoryCommand,
  formatDuration,
  formatStamp,
  isClaimHistoryVerb,
  parseHistoryDays,
  parseHistoryLimit,
  DEFAULT_HISTORY_DAYS,
  DEFAULT_HISTORY_LIMIT,
  type ClaimHistoryStoreLike,
} from "./noticeboard-history.js";

/**
 * `storytree noticeboard history` — the audit-log read verb (ADR-0310 D1). Envelope-level, so every
 * assertion is on what an agent actually READS, driven through a fake store that records the query.
 *
 * THE HEADLINE RED→GREEN: `--refusals` names the refusal AND the holder that blocked it. That is the
 * transition the board could not see on 2026-08-04 — a state snapshot showed two running sessions
 * with no claim, was reported to the owner as the dispatch wave going silent, and had to be retracted;
 * the sessions were mid-refusal. No widening of a STATE read can fix that, because a refusal leaves
 * no state behind.
 *
 * The rest are honesty invariants: the header always states what was really read, a capped read says
 * so rather than presenting a tail as the window, an empty read is a real answer rather than a
 * missing one, and a bad flag is REFUSED rather than silently defaulted (a typo'd --days that quietly
 * read 30 days would be reported as a 30-day answer).
 */

const NOW = new Date("2026-08-04T03:00:00.000Z");
const nowFn = () => NOW;
const MS_PER_DAY = 86_400_000;

function row(
  seq: number,
  unitId: string,
  type: string,
  sessionId: string,
  at: string,
  doc: unknown = null,
): ClaimAuditRow {
  return { seq, unitId, type, sessionId, doc, at };
}

/** The fake store: records every query, returns canned rows. */
function fakeStore(rows: ClaimAuditRow[]): ClaimHistoryStoreLike & { queries: ClaimAuditQuery[] } {
  const self = {
    queries: [] as ClaimAuditQuery[],
    async auditHistory(query: ClaimAuditQuery): Promise<ClaimAuditRow[]> {
      self.queries.push(query);
      return rows;
    },
  };
  return self;
}

/** The 2026-08-04 incident: a work claim, a refusal against it, then the queueing two minutes later. */
const INCIDENT: ClaimAuditRow[] = [
  row(1, "cli", "claimed", "wt-first", "2026-08-04T02:00:00.000Z", {
    sessionId: "wt-first",
    grade: "work",
    branch: "claude/first",
    intent: "landing the gate runner",
  }),
  row(2, "cli", "conflict-refused", "wt-second", "2026-08-04T02:02:00.000Z", {
    sessionId: "wt-first",
    grade: "work",
    branch: "claude/first",
    intent: "landing the gate runner",
  }),
  row(3, "cli", "queued", "wt-second", "2026-08-04T02:04:00.000Z", {
    sessionId: "wt-second",
    grade: "waiting",
    branch: "claude/second",
    intent: "",
  }),
];

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

test("--refusals: names the refused session AND the holder that blocked it", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand(undefined, { refusals: true }, { history: store, now: nowFn });

  assert.equal(env.ok, true);
  // The would-be holder is the one refused; the doc's session is the obstacle. Swapping them would
  // report the victim as the blocker.
  assert.match(env.body, /wt-second REFUSED — held by wt-first \[work\] branch=claude\/first/);
  assert.match(env.body, /"landing the gate runner"/);
  assert.match(env.body, /2026-08-04 02:02/, "the refusal's own timestamp, to the minute");
  // The store is asked for exactly the refusals — the filter is pushed down, not folded in memory.
  assert.equal(store.queries[0]?.type, "conflict-refused");
});

test("--refusals: a state read's blind spot, stated — the refusal and its queueing are both visible", async () => {
  const env = await claimHistoryCommand(
    "cli",
    {},
    { history: fakeStore(INCIDENT), now: nowFn },
  );
  // The unit timeline holds BOTH transitions, in order. A board read at 02:03 would have shown
  // wt-second with no claim at all — indistinguishable from never having tried.
  const refusedAt = env.body.indexOf("conflict-refused");
  const queuedAt = env.body.indexOf("queued");
  assert.ok(refusedAt > -1, "the refusal is in the timeline");
  assert.ok(queuedAt > refusedAt, "and the queueing that followed it, after it");
});

// ---------------------------------------------------------------------------
// The four views
// ---------------------------------------------------------------------------

test("bare: the whole-window summary — totals, type breakdown, hot spots", async () => {
  const env = await claimHistoryCommand(undefined, {}, { history: fakeStore(INCIDENT), now: nowFn });
  assert.equal(env.ok, true);
  assert.match(env.body, /3 events over the last 30d/);
  assert.match(env.body, /units:\s+1 distinct claimed ids/);
  assert.match(env.body, /sessions:\s+2 distinct/);
  assert.match(env.body, /refusals:\s+1/);
  assert.match(env.body, /By transition:/);
  assert.match(env.body, /Contention hot spots \(units by refusal\):\n {2}- cli {2}1/);
  // The phantom-id caveat rides the summary: the counts include ids that resolve to nothing.
  assert.match(env.body, /free TEXT with no foreign key/);
});

test("<unit-id>: the transition timeline oldest-first, with the unit's hold spans as a tail", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand("cli", {}, { history: store, now: nowFn });
  assert.equal(env.ok, true);
  assert.equal(store.queries[0]?.unitId, "cli", "the unit filter is pushed down to SQL");
  assert.match(env.body, /Transitions on "cli", oldest first:/);
  assert.match(env.body, /#1 {2}claimed {2}wt-first/);
  assert.match(env.body, /Hold spans:/);
  assert.match(env.body, /\[work\] {2}wt-first/);
});

test("--holdings: durations, and a still-open span measured to the supplied now", async () => {
  const env = await claimHistoryCommand(
    undefined,
    { holdings: true },
    { history: fakeStore(INCIDENT), now: nowFn },
  );
  assert.equal(env.ok, true);
  // wt-first took the work claim at 02:00 and never released it: 1h to the 03:00 clock.
  assert.match(env.body, /wt-first {2}2026-08-04 02:00 claimed → 1h \(still held\)/);
  assert.match(env.body, /\[waiting\] {2}wt-second/);
});

test("--holdings: a close whose open predates the read is announced, not back-dated", async () => {
  const env = await claimHistoryCommand(
    undefined,
    { holdings: true, days: "1" },
    { history: fakeStore([row(9, "cli", "released", "wt-old", "2026-08-04T02:00:00.000Z", null)]), now: nowFn },
  );
  assert.match(env.body, /1 release had no opening transition in this read/);
  assert.match(env.body, /NOT shown rather than back-dated/);
});

// ---------------------------------------------------------------------------
// Honesty of the header
// ---------------------------------------------------------------------------

test("the header states the real window and every filter, so no answer overstates itself", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand(
    "cli",
    { session: "wt-second", type: "released", days: "7" },
    { history: store, now: nowFn },
  );
  assert.match(env.body, /3 events over the last 7d, unit=cli session=wt-second type=released/);
  assert.deepEqual(store.queries[0], {
    unitId: "cli",
    sessionId: "wt-second",
    type: "released",
    sinceMs: 7 * MS_PER_DAY,
    limit: DEFAULT_HISTORY_LIMIT,
  });
});

test("a read that HIT its cap says so — a tail is never presented as the whole window", async () => {
  const env = await claimHistoryCommand(
    undefined,
    { limit: "3" },
    { history: fakeStore(INCIDENT), now: nowFn },
  );
  assert.match(env.body, /⚠ the 3-row cap was hit/);
  assert.match(env.body, /MOST RECENT 3 events in the window, not all of them/);
});

test("a read UNDER its cap carries no warning (the note must not cry wolf)", async () => {
  const env = await claimHistoryCommand(
    undefined,
    { limit: "500" },
    { history: fakeStore(INCIDENT), now: nowFn },
  );
  assert.doesNotMatch(env.body, /cap was hit/);
});

test("--days all reads the whole log and says so", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand(undefined, { days: "all" }, { history: store, now: nowFn });
  assert.match(env.body, /over the whole log/);
  assert.equal(store.queries[0]?.sinceMs, undefined, "no `at` filter at all");
});

test("an empty read is a REAL answer, with the widen-before-concluding caveat", async () => {
  const env = await claimHistoryCommand("never-claimed", {}, { history: fakeStore([]), now: nowFn });
  assert.equal(env.ok, true, "nothing to report is not a failure");
  assert.match(env.body, /0 events over the last 30d, unit=never-claimed/);
  assert.match(env.body, /EMPTY history is a real answer, not a missing one/);
  assert.match(env.body, /Widen it with --days all before reading/);
});

// ---------------------------------------------------------------------------
// Refusals over silent defaults
// ---------------------------------------------------------------------------

test("offline (no --pg): refuses with the db:up guidance, and never pretends the log is empty", async () => {
  const env = await claimHistoryCommand(undefined, {}, { history: null, now: nowFn });
  assert.equal(env.ok, false, "an unreadable log must not render as an empty one");
  assert.match(env.body, /requires the live store \(--pg\)/);
  assert.deepEqual(env.next, ["pnpm db:up", "storytree noticeboard history --pg"]);
});

test("a junk --days is REFUSED, not silently defaulted to 30", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand(undefined, { days: "last week" }, { history: store, now: nowFn });
  assert.equal(env.ok, false);
  assert.match(env.body, /--days must be a non-negative number of days/);
  assert.equal(store.queries.length, 0, "and no query is issued on a refused flag");
});

test("a junk --limit is REFUSED, not silently defaulted", async () => {
  const env = await claimHistoryCommand(
    undefined,
    { limit: "-4" },
    { history: fakeStore(INCIDENT), now: nowFn },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /--limit must be a non-negative whole number/);
});

test("an explicit --type WINS over --refusals, so the two never disagree silently", async () => {
  const store = fakeStore(INCIDENT);
  const env = await claimHistoryCommand(
    undefined,
    { refusals: true, type: "released" },
    { history: store, now: nowFn },
  );
  assert.equal(store.queries[0]?.type, "released");
  assert.doesNotMatch(env.body, /Refusals \(/, "the refusal VIEW yields to the explicit type too");
});

// ---------------------------------------------------------------------------
// The flag parsers + formatters
// ---------------------------------------------------------------------------

test("parseHistoryDays: default, `all`, 0, and the refusals", () => {
  assert.deepEqual(parseHistoryDays(undefined), {
    ok: true,
    value: DEFAULT_HISTORY_DAYS * MS_PER_DAY,
  });
  assert.deepEqual(parseHistoryDays("all"), { ok: true, value: undefined });
  assert.deepEqual(parseHistoryDays("ALL"), { ok: true, value: undefined }, "case-insensitive");
  assert.deepEqual(parseHistoryDays("0"), { ok: true, value: undefined }, "0 days ⇒ the whole log");
  assert.deepEqual(parseHistoryDays("1.5"), { ok: true, value: 129_600_000 }, "fractional days allowed");
  assert.equal(parseHistoryDays("-1").ok, false);
  // BLANK is a refusal, not `all`: `Number("")` is 0, so without the guard an empty --days would
  // widen the read to the whole log and be reported as a deliberate choice.
  assert.equal(parseHistoryDays("").ok, false);
  assert.equal(parseHistoryDays("   ").ok, false);
});

test("parseHistoryLimit: default, `all`, and the refusals (a fraction is not a row count)", () => {
  assert.deepEqual(parseHistoryLimit(undefined), { ok: true, value: DEFAULT_HISTORY_LIMIT });
  assert.deepEqual(parseHistoryLimit("all"), { ok: true, value: undefined });
  assert.deepEqual(parseHistoryLimit("0"), { ok: true, value: undefined });
  assert.deepEqual(parseHistoryLimit("50"), { ok: true, value: 50 });
  assert.equal(parseHistoryLimit("2.5").ok, false);
  assert.equal(parseHistoryLimit("-1").ok, false);
  assert.equal(parseHistoryLimit("").ok, false, "blank is a refusal, not an uncapped read");
});

test("formatDuration: minutes, then hours, then days past 48h", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(59 * 60_000), "59m");
  assert.equal(formatDuration(60 * 60_000), "1h");
  assert.equal(formatDuration(47 * 3_600_000), "47h");
  assert.equal(formatDuration(72 * 3_600_000), "3d");
});

test("formatStamp: minute precision, and an unparseable stamp prints as stored", () => {
  assert.equal(formatStamp("2026-08-04T02:11:43.000Z"), "2026-08-04 02:11");
  assert.equal(formatStamp("not a date"), "not a date", "never 'Invalid Date'");
});

test("isClaimHistoryVerb: `history` only — it must not swallow a sibling verb", () => {
  assert.equal(isClaimHistoryVerb("history"), true);
  assert.equal(isClaimHistoryVerb("claims"), false);
  assert.equal(isClaimHistoryVerb(undefined), false);
});
