import { test } from "node:test";
import assert from "node:assert/strict";

import { citedAssetIds } from "./asset-citation.js";
import {
  evaluateArcProposalDrain,
  type ArcProposalRecord,
  type FrictionRecord,
} from "./arc-proposal-drain.js";

/** A parked entry on an arc, with the timestamp `arc proposal add` actually stamps. */
function parked(
  id: string,
  parkedAt: string,
  frictionRefs: readonly string[] = [],
  extra: Partial<ArcProposalRecord> = {},
): ArcProposalRecord {
  return { arcId: "an-arc", id, title: `the ${id} remedy`, parked: parkedAt, frictionRefs, ...extra };
}

/** A friction item reinforced on each of `days`. */
function friction(id: string, days: readonly string[] = [], extra: Partial<FrictionRecord> = {}): FrictionRecord {
  return { id, reinforcedBy: days.map((date, i) => ({ branch: `branch-${i}`, date })), ...extra };
}

// ---------------------------------------------------------------------------
// The shared citation token rule (asset-citation.ts)
// ---------------------------------------------------------------------------

test("citedAssetIds parses the asset: token and nothing else", () => {
  assert.deepEqual(citedAssetIds(["asset:one", "asset:two"]), ["one", "two"]);
  // Other ref tokens are not corpus-artifact refs (ADR-0107 D2's `node:`, and `doc:`).
  assert.deepEqual(citedAssetIds(["doc:x", "node:cap-1", "asset:real"]), ["real"]);
  // Order is authored order — a report naming "the first citation" must mean it.
  assert.deepEqual(citedAssetIds(["asset:b", "asset:a"]), ["b", "a"]);
});

test("citedAssetIds is defensive about every shape a stored doc can carry", () => {
  assert.deepEqual(citedAssetIds(undefined), []);
  assert.deepEqual(citedAssetIds(null), []);
  assert.deepEqual(citedAssetIds("asset:not-an-array"), []);
  assert.deepEqual(citedAssetIds({ 0: "asset:x" }), []);
  assert.deepEqual(citedAssetIds([42, null, { id: "asset:x" }, "asset:kept"]), ["kept"]);
  // A bare prefix names nothing — it must never resolve to the empty id.
  assert.deepEqual(citedAssetIds(["asset:", "asset:   "]), []);
  assert.deepEqual(citedAssetIds(["asset: padded "]), ["padded"]);
});

// ---------------------------------------------------------------------------
// The quiet cases — a parked entry nobody is hitting never reds
// ---------------------------------------------------------------------------

test("an empty parked list is OK — nothing parked, nothing owed", () => {
  const v = evaluateArcProposalDrain([], []);
  assert.equal(v.level, "ok");
  assert.equal(v.total, 0);
  assert.equal(v.openCount, 0);
  assert.deepEqual(v.recurrences, []);
});

test("an entry naming NO friction is quiet — unreachable by the recurrence signal, and counted", () => {
  const v = evaluateArcProposalDrain([parked("p1", "2026-07-01T09:00:00Z")], [friction("f1", ["2026-08-03"])]);
  assert.equal(v.level, "ok");
  assert.equal(v.uncitedCount, 1);
  assert.equal(v.deliveredCount, 0);
});

test("an entry naming a friction the corpus does NOT hold is uncited, not silently cited", () => {
  // A retired source leaves a dangling ref. Counting it as cited would make the entry look reachable
  // while nothing could ever red it — the exact shape ADR-0095's no-silent-caps rule is about.
  const v = evaluateArcProposalDrain([parked("p1", "2026-07-01T09:00:00Z", ["gone"])], [friction("other", ["2026-08-03"])]);
  assert.equal(v.level, "ok");
  assert.equal(v.uncitedCount, 1);
});

test("an entry whose friction has no reinforcements at all is quiet (parked, never re-hit)", () => {
  const v = evaluateArcProposalDrain([parked("p1", "2026-07-01T09:00:00Z", ["f1"])], [friction("f1")]);
  assert.equal(v.level, "ok");
  assert.equal(v.uncitedCount, 0);
  assert.deepEqual(v.recurrences, []);
});

test("reinforcements PREDATING the entry are quiet — that is the rehoming/backfill case", () => {
  // ADR-0298 D7 rehomes entries for items that ALREADY carry reinforcements. Those recurrences are
  // the evidence that justified parking it; redding on them would red every rehomed entry on arrival.
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [friction("f1", ["2026-07-28", "2026-08-01", "2026-08-01"])],
  );
  assert.equal(v.level, "ok");
  assert.deepEqual(v.recurrences, []);
  assert.deepEqual(v.sameDay, []);
});

// ---------------------------------------------------------------------------
// The breach — the trap demonstrably bit someone again
// ---------------------------------------------------------------------------

test("a reinforcement dated AFTER the entry reds the gate (ADR-0298 D3, ADR-0287 D3's rule verbatim)", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"], { title: "Build the corpus gate as one unit" })],
    [friction("f1", ["2026-08-03"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.deepEqual(v.recurrences[0], {
    arcId: "an-arc",
    entryId: "p1",
    entryTitle: "Build the corpus gate as one unit",
    parkedDay: "2026-08-02",
    frictionId: "f1",
    day: "2026-08-03",
    branch: "branch-0",
  });
});

test("only the post-dating reinforcements become hits — the historical ones stay quiet", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [friction("f1", ["2026-07-28", "2026-08-03", "2026-08-05"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 2);
  assert.deepEqual(
    v.recurrences.map((h) => h.day),
    ["2026-08-03", "2026-08-05"],
  );
});

test("recurrences across SEVERAL named frictions all land on the one entry (the cluster case)", () => {
  // The worked example: five corpus-gate items adjudicated to one remedy. Each is a separate source.
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1", "f2", "f3"])],
    [friction("f1", ["2026-08-03"]), friction("f2", ["2026-08-04"]), friction("f3")],
  );
  assert.equal(v.level, "red");
  assert.deepEqual(
    v.recurrences.map((h) => h.frictionId),
    ["f1", "f2"],
  );
  assert.equal(v.uncitedCount, 0);
});

test("one entry's recurrence does not disturb another parked entry", () => {
  const v = evaluateArcProposalDrain(
    [parked("hot", "2026-08-02T14:00:00Z", ["f1"]), parked("cold", "2026-08-02T14:00:00Z", ["f2"])],
    [friction("f1", ["2026-08-03"]), friction("f2", ["2026-07-01"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.equal(v.recurrences[0]!.entryId, "hot");
});

test("entries on DIFFERENT arcs are distinguished — the id alone is not the identity (ADR-0298 D1)", () => {
  // Entry ids are arc-scoped, so two arcs may legitimately carry the same slug. A report that keyed
  // on the entry id alone would merge them and name the wrong arc as the one to go and build.
  const v = evaluateArcProposalDrain(
    [
      { arcId: "arc-a", id: "same-slug", parked: "2026-08-02T14:00:00Z", frictionRefs: ["f1"] },
      { arcId: "arc-b", id: "same-slug", parked: "2026-08-02T14:00:00Z", frictionRefs: ["f2"] },
    ],
    [friction("f1", ["2026-08-03"]), friction("f2", ["2026-08-04"])],
  );
  assert.equal(v.level, "red");
  assert.deepEqual(
    v.recurrences.map((h) => `${h.arcId}/${h.entryId}`),
    ["arc-a/same-slug", "arc-b/same-slug"],
  );
});

// ---------------------------------------------------------------------------
// The discharges — `realized` (structural) and `dischargedBy` (the pre-fold stamp)
// ---------------------------------------------------------------------------

test("a REALIZED entry stops pressing — the ceiling's structural discharge (ADR-0298 D3)", () => {
  // The improvement over the retired tier, whose only discharge was a manual stamp measured at
  // 6-of-125. `arc proposal realize` rides the closing leg that already appends the increment.
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"], { realized: { date: "2026-08-04", pr: "#1130" } })],
    [friction("f1", ["2026-08-03"])],
  );
  assert.equal(v.level, "ok");
  assert.equal(v.realizedCount, 1);
  assert.equal(v.openCount, 0);
  assert.deepEqual(v.recurrences, []);
});

test("a dischargedBy-stamped source friction stops pressing (the remedy LANDED without an entry)", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [friction("f1", ["2026-08-03"], { dischargedBy: "#1088" })],
  );
  assert.equal(v.level, "ok");
  assert.equal(v.deliveredCount, 1);
  assert.deepEqual(v.recurrences, []);
});

test("an EMPTY dischargedBy is not a delivery — a blank stamp cannot silence the gate", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [friction("f1", ["2026-08-03"], { dischargedBy: "   " })],
  );
  assert.equal(v.level, "red");
  assert.equal(v.deliveredCount, 0);
});

test("a PARTIALLY discharged cluster still reds on its pending sources only", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["done", "pending"])],
    [friction("done", ["2026-08-03"], { dischargedBy: "#1088" }), friction("pending", ["2026-08-04"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.equal(v.recurrences[0]!.frictionId, "pending");
  assert.equal(v.deliveredCount, 0); // not delivered: one source is still owed
});

// ---------------------------------------------------------------------------
// Day granularity — the deliberate WARN band, and why it is not a red
// ---------------------------------------------------------------------------

test("a SAME-DAY reinforcement WARNs, never reds — a day stamp cannot order the two", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [friction("f1", ["2026-08-02"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.sameDay.length, 1);
  assert.equal(v.sameDay[0]!.day, "2026-08-02");
});

test("granularity is the DAY even when the entry was parked at the very end of it", () => {
  // 23:59 vs a bare `2026-08-02` day stamp: by timestamp the reinforcement "predates" the entry, but
  // the two are not comparable at that resolution. Same day ⇒ WARN, in both directions.
  const late = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T23:59:59Z", ["f1"])],
    [friction("f1", ["2026-08-02"])],
  );
  assert.equal(late.level, "warn");
  const early = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T00:00:01Z", ["f1"])],
    [friction("f1", ["2026-08-02"])],
  );
  assert.equal(early.level, "warn");
});

test("the parking session can never red itself — its own reinforcements are same-day at the latest", () => {
  // The structural replacement for `friction-drain`'s branch-based "own homework" exclusion: a
  // session parks an entry and reinforces its source in the same session, so both stamps share a day
  // and the strict `>` cannot fire.
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-03T10:00:00Z", ["f1"])],
    [friction("f1", ["2026-08-03", "2026-08-03"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.sameDay.length, 2);
});

// ---------------------------------------------------------------------------
// Fail-open on the substrate — an unevaluable row is never a breach
// ---------------------------------------------------------------------------

test("an entry with no usable `parked` date WARNs and is named, never red", () => {
  const v = evaluateArcProposalDrain(
    [
      { arcId: "an-arc", id: "p1", title: "t", frictionRefs: ["f1"] },
      { arcId: "an-arc", id: "p2", parked: "not-a-date", frictionRefs: ["f2"] },
    ],
    [friction("f1", ["2026-08-03"]), friction("f2", ["2026-08-03"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.undated.length, 2);
  assert.match(v.undated[0]!, /entry an-arc\/p1 carries no usable `parked` date/);
});

test("a reinforcement with no usable date WARNs and is named, never red", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [{ id: "f1", reinforcedBy: [{ branch: "b" }, { date: "soon" }] }],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.undated.length, 2);
  assert.match(v.undated[0]!, /friction f1 carries a reinforcement with no usable date/);
});

test("an undated row does not mask a real breach elsewhere — red still wins", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"]), { arcId: "an-arc", id: "p2", frictionRefs: ["f2"] }],
    [friction("f1", ["2026-08-03"]), friction("f2", ["2026-08-03"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.equal(v.undated.length, 1);
});

test("a reinforcement entry carrying neither field does not throw", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [{ id: "f1", reinforcedBy: [{}] }],
  );
  assert.equal(v.level, "warn");
  assert.equal(v.undated.length, 1);
});

test("a missing branch on a hit degrades to '?' rather than dropping the recurrence", () => {
  const v = evaluateArcProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", ["f1"])],
    [{ id: "f1", reinforcedBy: [{ date: "2026-08-03" }] }],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences[0]!.branch, "?");
});

// ---------------------------------------------------------------------------
// The tally — an empty signal must be visibly an empty signal (ADR-0095: no silent caps)
// ---------------------------------------------------------------------------

test("the tally accounts for every parked entry read", () => {
  const v = evaluateArcProposalDrain(
    [
      parked("uncited", "2026-08-01T00:00:00Z"),
      parked("done", "2026-08-01T00:00:00Z", ["f1"]),
      parked("live", "2026-08-01T00:00:00Z", ["f2"]),
      parked("shipped", "2026-08-01T00:00:00Z", ["f2"], { realized: { date: "2026-08-02" } }),
    ],
    [friction("f1", ["2026-08-03"], { dischargedBy: "#1" }), friction("f2")],
  );
  assert.equal(v.total, 4);
  assert.equal(v.openCount, 3);
  assert.equal(v.realizedCount, 1);
  assert.equal(v.uncitedCount, 1);
  assert.equal(v.deliveredCount, 1);
  assert.equal(v.level, "ok");
});
