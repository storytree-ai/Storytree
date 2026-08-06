import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIM_REFUSED_TYPE,
  foldHoldings,
  foldRefusals,
  summarizeClaimHistory,
  type ClaimAuditRow,
} from "./claim-history.js";

/**
 * The PURE folds over the claim audit log (ADR-0310 D1).
 *
 * THE HEADLINE RED→GREEN: a refused claim followed minutes later by its queueing is INDISTINGUISHABLE
 * from "never claimed" in a state read — that gap produced a wrong report to the owner on 2026-08-04
 * which had to be retracted. `foldRefusals` sees it; the state-shaped `foldHoldings` deliberately
 * does not (a refusal is not a hold), which is exactly the distinction the arc needed an instrument
 * for. Both are asserted below on the SAME rows.
 *
 * The other invariants under test are the honesty ones: nothing is silently dropped (unknown
 * transition types, unresolvable unit ids, thin refusal docs, closes whose open predates the window),
 * and no duration is fabricated for a span this read cannot see whole.
 */

const NOW = new Date("2026-08-04T03:00:00.000Z");

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

function claimDoc(
  sessionId: string,
  grade: string,
  branch = "claude/x",
  intent = "",
): Record<string, unknown> {
  return { unitId: "u", sessionId, grade, branch, intent, claimedAt: "", heartbeatAt: "" };
}

// ---------------------------------------------------------------------------
// The headline: refusal-then-queue vs never-claimed
// ---------------------------------------------------------------------------

/**
 * The 2026-08-04 incident, reconstructed. Two sessions were RUNNING with no live claim row; the
 * board read that as "no claim taken" and the owner was told the dispatch wave had gone silent. The
 * audit log holds the refusal AND the queueing that followed it two minutes later.
 */
const INCIDENT: ClaimAuditRow[] = [
  row(1, "cli", "claimed", "wt-first", "2026-08-04T02:00:00.000Z", claimDoc("wt-first", "work")),
  row(
    2,
    "cli",
    CLAIM_REFUSED_TYPE,
    "wt-second",
    "2026-08-04T02:02:00.000Z",
    claimDoc("wt-first", "work", "claude/first", "landing the gate runner"),
  ),
  row(3, "cli", "queued", "wt-second", "2026-08-04T02:04:00.000Z", claimDoc("wt-second", "waiting")),
];

test("foldRefusals: sees the refusal a state read cannot — with the blocking holder named", () => {
  const refusals = foldRefusals(INCIDENT);
  assert.equal(refusals.length, 1);
  const [refusal] = refusals;
  assert.ok(refusal);
  assert.equal(refusal.unitId, "cli");
  // The session that ACTED is the would-be holder; the blocker comes off the doc. Confusing the two
  // would report the victim as the obstacle.
  assert.equal(refusal.sessionId, "wt-second");
  assert.equal(refusal.blockedBy?.sessionId, "wt-first");
  assert.equal(refusal.blockedBy?.grade, "work");
  assert.equal(refusal.blockedBy?.intent, "landing the gate runner");
});

test("foldHoldings: a refusal is NOT a hold — the refused session's only span is its queue join", () => {
  const { holdings } = foldHoldings(INCIDENT, NOW);
  const second = holdings.filter((h) => h.sessionId === "wt-second");
  assert.equal(second.length, 1, "the refusal must not become a span");
  assert.equal(second[0]?.openedBy, "queued");
  assert.equal(second[0]?.grade, "waiting");
  // And the first session's work span is still open at the end of the log.
  const first = holdings.filter((h) => h.sessionId === "wt-first");
  assert.equal(first.length, 1);
  assert.equal(first[0]?.stillHeld, true);
  assert.equal(first[0]?.durationMs, 60 * 60_000, "held from 02:00 to the supplied now (03:00)");
});

test("summarizeClaimHistory: the incident's shape — 1 refusal on 1 unit, 2 sessions", () => {
  const summary = summarizeClaimHistory(INCIDENT);
  assert.equal(summary.total, 3);
  assert.equal(summary.refusals, 1);
  assert.equal(summary.distinctUnits, 1);
  assert.equal(summary.distinctSessions, 2);
  assert.deepEqual(summary.hottestByRefusal, [{ name: "cli", count: 1 }]);
  assert.equal(summary.firstAt, "2026-08-04T02:00:00.000Z");
  assert.equal(summary.lastAt, "2026-08-04T02:04:00.000Z");
});

// ---------------------------------------------------------------------------
// Holdings — durations, grade changes, ordering
// ---------------------------------------------------------------------------

test("foldHoldings: a closed span carries the real duration and what closed it", () => {
  const rows = [
    row(1, "library", "claimed", "wt-a", "2026-08-04T01:00:00.000Z", claimDoc("wt-a", "work")),
    row(2, "library", "released", "wt-a", "2026-08-04T01:45:00.000Z", claimDoc("wt-a", "work")),
  ];
  const { holdings, unmatchedCloses } = foldHoldings(rows, NOW);
  assert.equal(unmatchedCloses, 0);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.durationMs, 45 * 60_000);
  assert.equal(holdings[0]?.closedBy, "released");
  assert.equal(holdings[0]?.stillHeld, false, "a closed span must never read as still held");
});

test("foldHoldings: a grade change reads as TWO adjacent spans, not one blurred one", () => {
  const rows = [
    row(1, "forest-world", "claimed", "wt-b", "2026-08-04T01:00:00.000Z", claimDoc("wt-b", "exploring")),
    row(2, "forest-world", "upgraded", "wt-b", "2026-08-04T01:30:00.000Z", claimDoc("wt-b", "work")),
    row(3, "forest-world", "released", "wt-b", "2026-08-04T02:00:00.000Z", claimDoc("wt-b", "work")),
  ];
  const { holdings } = foldHoldings(rows, NOW);
  assert.equal(holdings.length, 2);
  // Newest-opened first.
  assert.equal(holdings[0]?.grade, "work");
  assert.equal(holdings[0]?.openedBy, "upgraded");
  assert.equal(holdings[0]?.durationMs, 30 * 60_000);
  assert.equal(holdings[1]?.grade, "exploring");
  assert.equal(holdings[1]?.closedBy, "upgraded", "the upgrade is what ended the exploring span");
  assert.equal(holdings[1]?.durationMs, 30 * 60_000);
});

test("foldHoldings: two sessions on the same unit never blur into one span", () => {
  const rows = [
    row(1, "cli", "claimed", "wt-a", "2026-08-04T01:00:00.000Z", claimDoc("wt-a", "work")),
    row(2, "cli", "claimed", "wt-b", "2026-08-04T01:10:00.000Z", claimDoc("wt-b", "exploring")),
    row(3, "cli", "released", "wt-a", "2026-08-04T01:20:00.000Z", claimDoc("wt-a", "work")),
  ];
  const { holdings } = foldHoldings(rows, NOW);
  assert.equal(holdings.length, 2);
  const a = holdings.find((h) => h.sessionId === "wt-a");
  const b = holdings.find((h) => h.sessionId === "wt-b");
  assert.equal(a?.durationMs, 20 * 60_000);
  assert.equal(a?.stillHeld, false);
  assert.equal(b?.stillHeld, true, "wt-b's exploring row was never released");
});

test("foldHoldings: rows out of `at`/seq order still fold correctly — seq is the total order", () => {
  const rows = [
    row(2, "cli", "released", "wt-a", "2026-08-04T01:30:00.000Z", claimDoc("wt-a", "work")),
    row(1, "cli", "claimed", "wt-a", "2026-08-04T01:00:00.000Z", claimDoc("wt-a", "work")),
  ];
  const { holdings, unmatchedCloses } = foldHoldings(rows, NOW);
  assert.equal(unmatchedCloses, 0, "the close must pair with the open despite the input order");
  assert.equal(holdings[0]?.durationMs, 30 * 60_000);
});

test("foldHoldings: a close whose open predates the read is COUNTED, never back-dated", () => {
  // The window cut off the `claimed`. Inventing an openedAt at the window edge would print a
  // plausible, wrong duration — so the span is not emitted and the caller is told to widen.
  const rows = [row(9, "cli", "released", "wt-old", "2026-08-04T02:00:00.000Z", claimDoc("wt-old", "work"))];
  const { holdings, unmatchedCloses } = foldHoldings(rows, NOW);
  assert.deepEqual(holdings, []);
  assert.equal(unmatchedCloses, 1);
});

test("foldHoldings: an unknown transition type is neither open nor close, and breaks nothing", () => {
  const rows = [
    row(1, "cli", "claimed", "wt-a", "2026-08-04T01:00:00.000Z", claimDoc("wt-a", "work")),
    row(2, "cli", "teleported", "wt-a", "2026-08-04T01:10:00.000Z", claimDoc("wt-a", "work")),
    row(3, "cli", "released", "wt-a", "2026-08-04T01:20:00.000Z", claimDoc("wt-a", "work")),
  ];
  const { holdings } = foldHoldings(rows, NOW);
  assert.equal(holdings.length, 1, "the unknown row must not split or drop the span");
  assert.equal(holdings[0]?.durationMs, 20 * 60_000);
  // But it IS counted — a type nobody recognises is evidence, not noise.
  assert.deepEqual(
    summarizeClaimHistory(rows).byType.find((t) => t.name === "teleported"),
    { name: "teleported", count: 1 },
  );
});

test("foldHoldings: empty in → empty out, and no clock read of its own", () => {
  assert.deepEqual(foldHoldings([], NOW), { holdings: [], unmatchedCloses: 0 });
});

// ---------------------------------------------------------------------------
// Tolerant lifts — a thin or odd doc is reported, never dropped or thrown on
// ---------------------------------------------------------------------------

test("foldHoldings: a null/odd doc degrades to the work grade rather than throwing", () => {
  const rows = [
    row(1, "cli", "claimed", "wt-a", "2026-08-04T01:00:00.000Z", null),
    row(2, "mystery", "claimed", "wt-b", "2026-08-04T01:00:00.000Z", "not an object"),
    row(3, "cli", "queued", "wt-c", "2026-08-04T01:00:00.000Z", { grade: "nonsense" }),
  ];
  const { holdings } = foldHoldings(rows, NOW);
  assert.equal(holdings.length, 3);
  assert.equal(holdings.find((h) => h.sessionId === "wt-a")?.grade, "work");
  assert.equal(holdings.find((h) => h.sessionId === "wt-b")?.grade, "work");
  // An unreadable grade on a `queued` row falls back to the TYPE's own evidence, not to work.
  assert.equal(holdings.find((h) => h.sessionId === "wt-c")?.grade, "waiting");
});

test("foldRefusals: a refusal whose doc carries nothing readable is still reported", () => {
  const refusals = foldRefusals([row(1, "cli", CLAIM_REFUSED_TYPE, "wt-a", "2026-08-04T01:00:00.000Z", null)]);
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0]?.blockedBy, null, "thin, but present — never filtered for being thin");
});

test("foldRefusals: newest first, and non-refusal rows are excluded", () => {
  const rows = [
    row(1, "a", CLAIM_REFUSED_TYPE, "wt-1", "2026-08-04T01:00:00.000Z"),
    row(2, "b", "claimed", "wt-2", "2026-08-04T01:01:00.000Z"),
    row(3, "c", CLAIM_REFUSED_TYPE, "wt-3", "2026-08-04T01:02:00.000Z"),
  ];
  assert.deepEqual(
    foldRefusals(rows).map((r) => r.seq),
    [3, 1],
  );
});

// ---------------------------------------------------------------------------
// Summary — the counts, and the phantom ids it must NOT hide
// ---------------------------------------------------------------------------

test("summarizeClaimHistory: unit ids resolving to nothing are counted like any other", () => {
  // `whoami` and `stories/studio` are two of the 26 phantom ids measured 2026-08-05 (one of them a
  // PATH pasted where an id belonged). Hiding them would hide increment 2's whole evidence base.
  const rows = [
    row(1, "whoami", "claimed", "wt-a", "2026-08-04T01:00:00.000Z"),
    row(2, "stories/studio", "claimed", "wt-b", "2026-08-04T01:01:00.000Z"),
    row(3, "cli", "claimed", "wt-c", "2026-08-04T01:02:00.000Z"),
  ];
  const summary = summarizeClaimHistory(rows);
  assert.equal(summary.distinctUnits, 3);
  assert.deepEqual(
    summary.hottestByEvent.map((t) => t.name),
    ["cli", "stories/studio", "whoami"],
    "count-descending then alphabetical — a deterministic order, ties broken by name",
  );
});

test("summarizeClaimHistory: byType is count-descending then alphabetical", () => {
  const rows = [
    row(1, "a", "released", "wt-1", "2026-08-04T01:00:00.000Z"),
    row(2, "a", "claimed", "wt-1", "2026-08-04T01:01:00.000Z"),
    row(3, "b", "claimed", "wt-2", "2026-08-04T01:02:00.000Z"),
    row(4, "c", "promoted", "wt-3", "2026-08-04T01:03:00.000Z"),
  ];
  assert.deepEqual(summarizeClaimHistory(rows).byType, [
    { name: "claimed", count: 2 },
    { name: "promoted", count: 1 },
    { name: "released", count: 1 },
  ]);
});

test("summarizeClaimHistory: an empty read is a real answer with null bounds", () => {
  const summary = summarizeClaimHistory([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.refusals, 0);
  assert.equal(summary.firstAt, null);
  assert.equal(summary.lastAt, null);
  assert.deepEqual(summary.byType, []);
});
