import assert from "node:assert/strict";
import test from "node:test";

import {
  amendsCorpusShape,
  compareAmendsReach,
  computeAmendsReach,
  median,
  sessionsToDetect,
  wilsonInterval,
  type AmendsReachInput,
} from "./amends-reach.js";
import type { DecisionReadObservation, DecisionSupportGraph } from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Fixtures — a tiny log whose shape every assertion below can be checked against by hand
// ---------------------------------------------------------------------------

/** 20 amends 10; 30 amends 10; 40 dependsOn 20. So 10 and 20 are AMENDED; 30 and 40 are not. */
function support(): DecisionSupportGraph {
  return {
    decisions: [10, 20, 30, 40],
    amends: [
      { from: 20, to: 10 },
      { from: 30, to: 10 },
    ],
    dependsOn: [{ from: 40, to: 20 }],
    decisionsCarryingDependsOn: 1,
    dependsOnNonDecisionTargets: 0,
  };
}

function read(
  windowId: string,
  decision: number,
  at: string,
  slotId = "slot-a",
): DecisionReadObservation {
  return { slotId, windowId, nodeId: `adr-${String(decision).padStart(4, "0")}`, at, surface: "test" };
}

function input(reads: readonly DecisionReadObservation[], over: Partial<AmendsReachInput> = {}): AmendsReachInput {
  return { reads, support: support(), from: undefined, to: undefined, grain: "window", ...over };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

test("the Wilson interval brackets the point estimate and stays inside [0, 1] at the extremes", () => {
  const half = wilsonInterval(50, 100);
  assert.equal(half.rate, 0.5);
  assert.ok(half.low < 0.5 && half.high > 0.5, "the interval must bracket the estimate");
  assert.ok(half.low > 0.39 && half.high < 0.61, `50/100 should be roughly +/-10pp, got ${half.low}..${half.high}`);

  // The failure the normal approximation has and this one must not: a degenerate count.
  const none = wilsonInterval(0, 3);
  assert.equal(none.rate, 0);
  assert.equal(none.low, 0, "a zero count cannot have a negative lower bound");
  assert.ok(none.high > 0.5, "0 of 3 must NOT read as a confident zero — that is the whole point");

  const empty = wilsonInterval(0, 0);
  assert.deepEqual(empty, { rate: 0, low: 0, high: 1 }, "an empty arm knows nothing, and must say so");
});

test("a narrower interval needs a bigger sample, which is the property the verdict rests on", () => {
  const small = wilsonInterval(5, 10);
  const large = wilsonInterval(500, 1000);
  assert.ok(large.high - large.low < small.high - small.low, "1000 samples must be tighter than 10");
});

test("sessionsToDetect sizes a halving of the frozen baseline's own chain rate at a few dozen sessions", () => {
  // The frozen baseline: 203 of 401 sessions walked a chain (50.6%).
  const halving = sessionsToDetect(0.506, 0.253);
  assert.ok(halving > 20 && halving < 40, `expected roughly 28 sessions to catch a halving, got ${halving}`);

  // A SMALLER effect must cost MORE data — if this inverts, the formula is upside down.
  const fifth = sessionsToDetect(0.506, 0.405);
  assert.ok(fifth > halving * 3, `a 20% fall must cost far more than a halving, got ${fifth} vs ${halving}`);

  assert.equal(sessionsToDetect(0.5, 0.5), Number.POSITIVE_INFINITY, "no sample can detect no difference");
});

test("median averages the middle pair on an even list and is 0 on an empty one", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

// ---------------------------------------------------------------------------
// Corpus shape
// ---------------------------------------------------------------------------

test("the corpus shape counts amended targets and amender sources apart, and never sums the edge types", () => {
  const shape = amendsCorpusShape(support());
  assert.equal(shape.amendsEdges, 2);
  assert.equal(shape.dependsOnEdges, 1);
  // Two edges, but they share a target — so one amended decision, two amenders.
  assert.equal(shape.amendedDecisions, 1, "20->10 and 30->10 amend the SAME decision");
  assert.equal(shape.amenderDecisions, 2);
  assert.equal(shape.decisions, 4);
});

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

test("a crossing needs BOTH ends read in one sitting — reading one end alone is not a chain walked", () => {
  const oneEnd = computeAmendsReach(input([read("w1", 20, "2026-08-01T00:00:00.000Z")]));
  assert.equal(oneEnd.sessionsCrossingAnAmendsEdge, 0, "the amender alone crosses nothing");
  assert.equal(oneEnd.sessionsReadingAnAmendedDecision, 0, "ADR-20 is an amender, not an amended decision");

  const bothEnds = computeAmendsReach(
    input([read("w1", 20, "2026-08-01T00:00:00.000Z"), read("w1", 10, "2026-08-01T00:00:01.000Z")]),
  );
  assert.equal(bothEnds.sessionsCrossingAnAmendsEdge, 1);
  assert.equal(bothEnds.amendsEdgesCrossed, 1);
  assert.equal(bothEnds.sessionsReadingAnAmendedDecision, 1);
});

test("two sessions each reading one end of the same edge cross nothing — the sitting is the unit", () => {
  const split = computeAmendsReach(
    input([read("w1", 20, "2026-08-01T00:00:00.000Z"), read("w2", 10, "2026-08-01T00:00:01.000Z")]),
  );
  assert.equal(split.sessionsReadingADecision, 2);
  assert.equal(split.sessionsCrossingAnAmendsEdge, 0, "an edge nobody walked in ONE sitting was not walked");
});

test("the direction split is decided by which end the session reached FIRST", () => {
  const amendedFirst = computeAmendsReach(
    input([read("w1", 10, "2026-08-01T00:00:00.000Z"), read("w1", 20, "2026-08-01T00:00:05.000Z")]),
  );
  assert.deepEqual(amendedFirst.directions, { amendedFirst: 1, amenderFirst: 0, simultaneous: 0 });

  const amenderFirst = computeAmendsReach(
    input([read("w1", 20, "2026-08-01T00:00:00.000Z"), read("w1", 10, "2026-08-01T00:00:05.000Z")]),
  );
  assert.deepEqual(amenderFirst.directions, { amendedFirst: 0, amenderFirst: 1, simultaneous: 0 });

  const together = computeAmendsReach(
    input([read("w1", 20, "2026-08-01T00:00:00.000Z"), read("w1", 10, "2026-08-01T00:00:00.000Z")]),
  );
  assert.deepEqual(together.directions, { amendedFirst: 0, amenderFirst: 0, simultaneous: 1 });
});

test("a re-read cannot move the direction — the FIRST sighting of each end is what orders them", () => {
  const reading = computeAmendsReach(
    input([
      read("w1", 10, "2026-08-01T00:00:00.000Z"),
      read("w1", 20, "2026-08-01T00:00:05.000Z"),
      // Landing back on the amended decision later must not turn this into amender-first.
      read("w1", 10, "2026-08-01T00:00:09.000Z"),
    ]),
  );
  assert.deepEqual(reading.directions, { amendedFirst: 1, amenderFirst: 0, simultaneous: 0 });
  assert.equal(reading.reads, 3, "every read is still counted, even though only the first orders the pair");
});

test("one session crossing two edges counts two crossings but one session", () => {
  const reading = computeAmendsReach(
    input([
      read("w1", 10, "2026-08-01T00:00:00.000Z"),
      read("w1", 20, "2026-08-01T00:00:01.000Z"),
      read("w1", 30, "2026-08-01T00:00:02.000Z"),
    ]),
  );
  assert.equal(reading.sessionsCrossingAnAmendsEdge, 1);
  assert.equal(reading.amendsCrossings, 2, "20->10 and 30->10 are two crossings");
  assert.equal(reading.amendsEdgesCrossed, 2);
});

test("a dependsOn crossing is reported on its own line and never folded into the amends figure", () => {
  const reading = computeAmendsReach(
    input([read("w1", 40, "2026-08-01T00:00:00.000Z"), read("w1", 20, "2026-08-01T00:00:01.000Z")]),
  );
  assert.equal(reading.sessionsCrossingADependsOnEdge, 1);
  assert.equal(reading.sessionsCrossingAnAmendsEdge, 0, "40->20 is dependsOn — it must not count as amends");
  assert.equal(reading.amendsCrossings, 0);
});

test("the declared window is inclusive at both ends and excludes what falls outside it", () => {
  const reads = [
    read("w0", 10, "2026-07-31T23:59:59.999Z"),
    read("w1", 10, "2026-08-01T00:00:00.000Z"),
    read("w2", 10, "2026-08-02T00:00:00.000Z"),
    read("w3", 10, "2026-08-02T00:00:00.001Z"),
  ];
  const reading = computeAmendsReach(
    input(reads, { from: "2026-08-01T00:00:00.000Z", to: "2026-08-02T00:00:00.000Z" }),
  );
  assert.equal(reading.reads, 2, "both bounds are inclusive, and neither neighbour leaks in");
  assert.equal(reading.observedFrom, "2026-08-01T00:00:00.000Z");
  assert.equal(reading.observedTo, "2026-08-02T00:00:00.000Z");
});

test("the grain decides what a distinct session is, and the two grains can disagree", () => {
  const reads = [
    read("w1", 10, "2026-08-01T00:00:00.000Z", "slot-a"),
    read("w2", 20, "2026-08-01T00:00:01.000Z", "slot-a"),
  ];
  const byWindow = computeAmendsReach(input(reads, { grain: "window" }));
  assert.equal(byWindow.sessionsReadingADecision, 2);
  assert.equal(byWindow.sessionsCrossingAnAmendsEdge, 0, "two sittings, so no edge was walked in one");

  const bySlot = computeAmendsReach(input(reads, { grain: "slot" }));
  assert.equal(bySlot.sessionsReadingADecision, 1);
  assert.equal(bySlot.sessionsCrossingAnAmendsEdge, 1, "pooling the slot UNIONS the sittings — the known bias");
});

test("a read of a decision the log does not hold is dropped from reach rather than inventing a node", () => {
  const reading = computeAmendsReach(input([read("w1", 999, "2026-08-01T00:00:00.000Z")]));
  assert.equal(reading.reads, 0);
  assert.ok(reading.vacuity.length > 0, "a window whose only read named an unknown decision measured nothing");
});

test("reach medians separate amended decisions from unamended ones", () => {
  const reading = computeAmendsReach(
    input([
      // ADR-10 (amended) read by three sessions; ADR-40 (unamended) read by one.
      read("w1", 10, "2026-08-01T00:00:00.000Z"),
      read("w2", 10, "2026-08-01T00:00:01.000Z"),
      read("w3", 10, "2026-08-01T00:00:02.000Z"),
      read("w1", 40, "2026-08-01T00:00:03.000Z"),
    ]),
  );
  assert.equal(reading.amendedDecisionsRead, 1);
  assert.equal(reading.unamendedDecisionsRead, 1);
  assert.equal(reading.amendedReachMedian, 3);
  assert.equal(reading.unamendedReachMedian, 1);
});

test("vacuity names every reason separately, so an empty table can never print under a result", () => {
  const noEdges = computeAmendsReach({
    reads: [read("w1", 10, "2026-08-01T00:00:00.000Z")],
    support: { ...support(), amends: [] },
    from: undefined,
    to: undefined,
    grain: "window",
  });
  assert.ok(
    noEdges.vacuity.some((reason) => reason.includes("`amends` edges")),
    "a log with no amends edges must say so rather than report a clean zero",
  );

  const noReads = computeAmendsReach(input([], { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" }));
  assert.ok(noReads.vacuity.some((reason) => reason.includes("no decision read")));
});

// ---------------------------------------------------------------------------
// The comparison — the part that must refuse to over-claim
// ---------------------------------------------------------------------------

test("a small after arm is UNDERPOWERED even when its rate is zero — power is decided before direction", () => {
  const comparison = compareAmendsReach({
    measure: "sessions crossing an amends edge",
    beforeCount: 203,
    beforeTotal: 401,
    // The shape this measurement actually landed in: a handful of sessions, none of which crossed.
    afterCount: 0,
    afterTotal: 4,
    detectableFall: 0.5,
  });
  assert.equal(comparison.verdict, "UNDERPOWERED", "0 of 4 must never print as a fall to zero");
  assert.ok(comparison.sessionsNeeded > 4);
  assert.ok(comparison.after.high > 0.4, "the after arm's own interval still admits the baseline rate");
});

test("a large after arm with a genuinely lower rate is called a FALL", () => {
  const comparison = compareAmendsReach({
    measure: "sessions crossing an amends edge",
    beforeCount: 203,
    beforeTotal: 401,
    afterCount: 20,
    afterTotal: 200,
    detectableFall: 0.5,
  });
  assert.equal(comparison.verdict, "FALL");
  assert.ok(comparison.after.high < comparison.before.rate);
});

test("a large after arm that matches the baseline is NO CHANGE, not a fall", () => {
  const comparison = compareAmendsReach({
    measure: "sessions crossing an amends edge",
    beforeCount: 203,
    beforeTotal: 401,
    afterCount: 101,
    afterTotal: 200,
    detectableFall: 0.5,
  });
  assert.equal(comparison.verdict, "NO CHANGE");
});

test("a large after arm above the baseline is a RISE — the instrument can return the opposite answer", () => {
  const comparison = compareAmendsReach({
    measure: "sessions crossing an amends edge",
    beforeCount: 203,
    beforeTotal: 401,
    afterCount: 180,
    afterTotal: 200,
    detectableFall: 0.5,
  });
  assert.equal(comparison.verdict, "RISE");
});

test("a HIGH base rate sizes itself cheaply, and the shared floor is what stops it answering alone", () => {
  // The exact shape that got through on this probe's first run: 5 of 8 sessions against an 89%
  // baseline. A 50% relative fall from 89% is a 44-point effect, so the measure's OWN sizing is
  // satisfied by eight sessions and the Wilson bound clears the baseline by ~2.5 points.
  const unfloored = compareAmendsReach({
    measure: "sessions that read an amended decision",
    beforeCount: 364,
    beforeTotal: 409,
    afterCount: 5,
    afterTotal: 8,
    detectableFall: 0.5,
  });
  assert.equal(unfloored.verdict, "FALL", "without a floor this measure does return a direction on 8 sessions");
  assert.ok(unfloored.sessionsNeeded <= 8, "which is only possible because its own sizing is that cheap");

  // The load-bearing measure over the same arm needs ~28, and that floor must silence this one.
  const floored = compareAmendsReach({
    measure: "sessions that read an amended decision",
    beforeCount: 364,
    beforeTotal: 409,
    afterCount: 5,
    afterTotal: 8,
    detectableFall: 0.5,
    minimumArm: 28,
  });
  assert.equal(floored.verdict, "UNDERPOWERED", "the report's floor outranks a cheap per-measure sizing");
  assert.equal(floored.minimumArm, 28, "the floor is carried out so the render can say WHY it refused");
});

test("the floor never manufactures a verdict — an arm that clears it still answers on its own numbers", () => {
  const floored = compareAmendsReach({
    measure: "sessions that read an amended decision",
    beforeCount: 364,
    beforeTotal: 409,
    afterCount: 100,
    afterTotal: 200,
    detectableFall: 0.5,
    minimumArm: 28,
  });
  assert.equal(floored.verdict, "FALL", "200 sessions clear the floor, and 50% really is below 89%");
});

test("a smaller detectable fall demands a bigger after arm, so the sizing cannot be gamed by asking for less", () => {
  const halving = compareAmendsReach({
    measure: "m",
    beforeCount: 203,
    beforeTotal: 401,
    afterCount: 0,
    afterTotal: 0,
    detectableFall: 0.5,
  });
  const fifth = compareAmendsReach({
    measure: "m",
    beforeCount: 203,
    beforeTotal: 401,
    afterCount: 0,
    afterTotal: 0,
    detectableFall: 0.2,
  });
  assert.ok(fifth.sessionsNeeded > halving.sessionsNeeded);
});
