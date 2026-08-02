import { test } from "node:test";
import assert from "node:assert/strict";

import { lifecycleOf } from "@storytree/library";

import { citedAssetIds, ASSET_REF_PREFIX } from "./proposal-citation.js";
import {
  evaluateProposalDrain,
  type FrictionCitation,
  type ProposalRecord,
} from "./proposal-drain.js";

/** A proposal parked on `createdAt`, with the timestamp `proposal new` actually stamps. */
function parked(id: string, createdAt: string, title = `the ${id} remedy`): ProposalRecord {
  return { id, title, createdAt };
}

/** A friction item citing `proposalId`, reinforced on each of `days`. */
function cites(
  id: string,
  proposalId: string,
  days: readonly string[] = [],
  extra: Partial<FrictionCitation> = {},
): FrictionCitation {
  return {
    id,
    references: [`${ASSET_REF_PREFIX}${proposalId}`],
    reinforcedBy: days.map((date, i) => ({ branch: `branch-${i}`, date })),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// The shared citation edge (proposal-citation.ts) — the token rule both sides use
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
// The lifecycle projection this core routes through (ADR-0196 D4)
// ---------------------------------------------------------------------------

test("every proposal is OPEN today — the tier carries no closure state (pinned, ADR-0196 D4)", () => {
  // ADR-0287 D3 says "an OPEN proposal goes RED"; today that means every one of them, because the
  // universal projection returns `open` for this kind unconditionally. Pinned as a DIFFERENTIAL
  // assertion: the day a closure state lands, this test fails and the change is deliberate rather
  // than a silently-widened gate.
  assert.equal(lifecycleOf("proposal", {}), "open");
  assert.equal(lifecycleOf("proposal", { status: "consumed" }), "open");
  assert.equal(lifecycleOf("proposal", { lifecycle: "closed" }), "open");

  const v = evaluateProposalDrain([{ id: "p1", createdAt: "2026-08-01T00:00:00Z", status: "consumed" }], []);
  assert.equal(v.openCount, 1);
  assert.equal(v.closedCount, 0);
});

// ---------------------------------------------------------------------------
// The quiet cases — a parked proposal nobody is hitting never reds
// ---------------------------------------------------------------------------

test("an empty tier is OK — nothing parked, nothing owed", () => {
  const v = evaluateProposalDrain([], []);
  assert.equal(v.level, "ok");
  assert.equal(v.total, 0);
  assert.equal(v.openCount, 0);
  assert.deepEqual(v.recurrences, []);
});

test("a proposal NO friction cites is quiet — unreachable by the recurrence signal", () => {
  const v = evaluateProposalDrain([parked("p1", "2026-07-01T09:00:00Z")], [
    // A friction citing something else entirely, plus one citing an id that is not a proposal.
    { id: "f1", references: ["asset:some-principle", "doc:x"] },
  ]);
  assert.equal(v.level, "ok");
  assert.equal(v.uncitedCount, 1);
  assert.equal(v.deliveredCount, 0);
});

test("a cited proposal with no reinforcements at all is quiet (parked, never re-hit)", () => {
  const v = evaluateProposalDrain([parked("p1", "2026-07-01T09:00:00Z")], [cites("f1", "p1")]);
  assert.equal(v.level, "ok");
  assert.equal(v.uncitedCount, 0);
  assert.deepEqual(v.recurrences, []);
});

test("reinforcements PREDATING the proposal are quiet — that is the ADR-0287 D4 backfill case", () => {
  // D4 backfills proposals for tool items that ALREADY carry reinforcements. Those recurrences are
  // the evidence that justified parking it; redding on them would red the backfill on arrival.
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-07-28", "2026-08-01", "2026-08-01"])],
  );
  assert.equal(v.level, "ok");
  assert.deepEqual(v.recurrences, []);
  assert.deepEqual(v.sameDay, []);
});

// ---------------------------------------------------------------------------
// The breach — the trap demonstrably bit someone again
// ---------------------------------------------------------------------------

test("a reinforcement dated AFTER the proposal reds the gate (ADR-0287 D3)", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z", "Build the corpus gate as one unit")],
    [cites("f1", "p1", ["2026-08-03"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.deepEqual(v.recurrences[0], {
    proposalId: "p1",
    proposalTitle: "Build the corpus gate as one unit",
    createdDay: "2026-08-02",
    frictionId: "f1",
    day: "2026-08-03",
    branch: "branch-0",
  });
});

test("only the post-dating reinforcements become hits — the historical ones stay quiet", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-07-28", "2026-08-03", "2026-08-05"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 2);
  assert.deepEqual(
    v.recurrences.map((h) => h.day),
    ["2026-08-03", "2026-08-05"],
  );
});

test("recurrences across SEVERAL source frictions all land on the one proposal (the cluster case)", () => {
  // The worked example: five corpus-gate items adjudicated to one remedy. Each is a separate source.
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-08-03"]), cites("f2", "p1", ["2026-08-04"]), cites("f3", "p1")],
  );
  assert.equal(v.level, "red");
  assert.deepEqual(
    v.recurrences.map((h) => h.frictionId),
    ["f1", "f2"],
  );
  assert.equal(v.uncitedCount, 0);
});

test("one proposal's recurrence does not disturb another parked proposal", () => {
  const v = evaluateProposalDrain(
    [parked("hot", "2026-08-02T14:00:00Z"), parked("cold", "2026-08-02T14:00:00Z")],
    [cites("f1", "hot", ["2026-08-03"]), cites("f2", "cold", ["2026-07-01"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.equal(v.recurrences[0]!.proposalId, "hot");
});

// ---------------------------------------------------------------------------
// The discharge — an existing verb, not a new one
// ---------------------------------------------------------------------------

test("a dischargedBy-stamped source friction stops pressing (the remedy LANDED)", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-08-03"], { dischargedBy: "#1088" })],
  );
  assert.equal(v.level, "ok");
  assert.equal(v.deliveredCount, 1);
  assert.deepEqual(v.recurrences, []);
});

test("an EMPTY dischargedBy is not a delivery — a blank stamp cannot silence the gate", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-08-03"], { dischargedBy: "   " })],
  );
  assert.equal(v.level, "red");
  assert.equal(v.deliveredCount, 0);
});

test("a PARTIALLY discharged cluster still reds on its pending sources only", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [
      cites("done", "p1", ["2026-08-03"], { dischargedBy: "#1088" }),
      cites("pending", "p1", ["2026-08-04"]),
    ],
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
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [cites("f1", "p1", ["2026-08-02"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.sameDay.length, 1);
  assert.equal(v.sameDay[0]!.day, "2026-08-02");
});

test("granularity is the DAY even when the proposal was parked at the very end of it", () => {
  // 23:59 vs a bare `2026-08-02` day stamp: by timestamp the reinforcement "predates" the proposal,
  // but the two are not comparable at that resolution. Same day ⇒ WARN, in both directions.
  const late = evaluateProposalDrain(
    [parked("p1", "2026-08-02T23:59:59Z")],
    [cites("f1", "p1", ["2026-08-02"])],
  );
  assert.equal(late.level, "warn");
  const early = evaluateProposalDrain(
    [parked("p1", "2026-08-02T00:00:01Z")],
    [cites("f1", "p1", ["2026-08-02"])],
  );
  assert.equal(early.level, "warn");
});

test("the creating session can never red itself — its own reinforcements are same-day at the latest", () => {
  // The structural replacement for `friction-drain`'s branch-based "own homework" exclusion: a
  // session parks a proposal and reinforces its source in the same session, so both stamps share a
  // day and the strict `>` cannot fire.
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-03T10:00:00Z")],
    [cites("f1", "p1", ["2026-08-03", "2026-08-03"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.sameDay.length, 2);
});

// ---------------------------------------------------------------------------
// Fail-open on the substrate — an unevaluable row is never a breach
// ---------------------------------------------------------------------------

test("a proposal with no usable createdAt WARNs and is named, never red", () => {
  const v = evaluateProposalDrain(
    [{ id: "p1", title: "t" }, { id: "p2", createdAt: "not-a-date" }],
    [cites("f1", "p1", ["2026-08-03"]), cites("f2", "p2", ["2026-08-03"])],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.undated.length, 2);
  assert.match(v.undated[0]!, /proposal p1 carries no usable createdAt/);
});

test("a reinforcement with no usable date WARNs and is named, never red", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [{ id: "f1", references: ["asset:p1"], reinforcedBy: [{ branch: "b" }, { date: "soon" }] }],
  );
  assert.equal(v.level, "warn");
  assert.deepEqual(v.recurrences, []);
  assert.equal(v.undated.length, 2);
  assert.match(v.undated[0]!, /friction f1 carries a reinforcement with no usable date/);
});

test("an undated row does not mask a real breach elsewhere — red still wins", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z"), { id: "p2" }],
    [cites("f1", "p1", ["2026-08-03"]), cites("f2", "p2", ["2026-08-03"])],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences.length, 1);
  assert.equal(v.undated.length, 1);
});

test("a reinforcement entry that is not an object at all does not throw", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [{ id: "f1", references: ["asset:p1"], reinforcedBy: [{}] }],
  );
  assert.equal(v.level, "warn");
  assert.equal(v.undated.length, 1);
});

test("a missing branch on a hit degrades to '?' rather than dropping the recurrence", () => {
  const v = evaluateProposalDrain(
    [parked("p1", "2026-08-02T14:00:00Z")],
    [{ id: "f1", references: ["asset:p1"], reinforcedBy: [{ date: "2026-08-03" }] }],
  );
  assert.equal(v.level, "red");
  assert.equal(v.recurrences[0]!.branch, "?");
});

// ---------------------------------------------------------------------------
// The tally — an empty signal must be visibly an empty signal (ADR-0095: no silent caps)
// ---------------------------------------------------------------------------

test("the tally accounts for every proposal read", () => {
  const v = evaluateProposalDrain(
    [parked("uncited", "2026-08-01T00:00:00Z"), parked("done", "2026-08-01T00:00:00Z"), parked("live", "2026-08-01T00:00:00Z")],
    [cites("f1", "done", ["2026-08-03"], { dischargedBy: "#1" }), cites("f2", "live")],
  );
  assert.equal(v.total, 3);
  assert.equal(v.openCount, 3);
  assert.equal(v.uncitedCount, 1);
  assert.equal(v.deliveredCount, 1);
  assert.equal(v.level, "ok");
});
