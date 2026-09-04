import assert from "node:assert/strict";
import test from "node:test";

import {
  ADJACENCY_GAP,
  authoredPairKeys,
  computeCoReadEdges,
  type CoReadObservation,
} from "./co-read-edges.js";
import type { DecisionEdge } from "./decision-read-baseline.js";

/** `adr-NNNN` → NNNN, and null for anything else — a stand-in for the real one-door resolver. */
const resolve = (id: string): number | null => {
  const match = /^adr-(\d{1,4})$/.exec(id);
  if (match === null) return null;
  const [, digits] = match;
  return digits === undefined ? null : Number(digits);
};

const read = (windowId: string | undefined, nodeId: string): CoReadObservation => ({ windowId, nodeId });
const edge = (from: number, to: number): DecisionEdge => ({ from, to });

// ---------------------------------------------------------------------------
// The session key — the one that would manufacture the finding if it were wrong
// ---------------------------------------------------------------------------

test("co-read: two decisions in ONE window make a pair", () => {
  const reading = computeCoReadEdges([read("w1", "adr-10"), read("w1", "adr-20")], [], [], resolve);
  assert.equal(reading.pairs.length, 1);
  assert.deepEqual(
    reading.pairs[0],
    { low: 10, high: 20, windows: 1, authored: false },
  );
});

test("co-read: the SAME two decisions in DIFFERENT windows make NO pair", () => {
  // This is the whole reason the key is `windowId` and not the pooled slot. If this ever passes with
  // a pair, a slot-keyed join has crept back in and every headline number is inflated.
  const reading = computeCoReadEdges([read("w1", "adr-10"), read("w2", "adr-20")], [], [], resolve);
  assert.equal(reading.pairs.length, 0);
  assert.equal(reading.windows, 2);
  assert.equal(reading.windowsYieldingPairs, 0);
});

test("co-read: a read with NO window id is counted and dropped, never folded", () => {
  const reading = computeCoReadEdges(
    [read(undefined, "adr-10"), read(undefined, "adr-20"), read("w1", "adr-30")],
    [],
    [],
    resolve,
  );
  assert.equal(reading.readsWithoutWindow, 2);
  assert.equal(reading.resolvedReads, 1);
  // The two windowless reads must NOT have joined each other into a pair.
  assert.equal(reading.pairs.length, 0);
});

// ---------------------------------------------------------------------------
// Resolution, and what "not a decision" means
// ---------------------------------------------------------------------------

test("co-read: ids that name something other than a decision are counted apart, not dropped silently", () => {
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "merge-ceremony"), read("w1", "--help")],
    [],
    [],
    resolve,
  );
  assert.equal(reading.resolvedReads, 1);
  assert.equal(reading.unresolvedReads, 2);
  assert.equal(reading.pairs.length, 0);
});

test("co-read: one window reading the same decision twice yields no self-pair", () => {
  const reading = computeCoReadEdges([read("w1", "adr-10"), read("w1", "adr-10")], [], [], resolve);
  assert.equal(reading.resolvedReads, 2);
  assert.equal(reading.pairs.length, 0);
});

// ---------------------------------------------------------------------------
// Authored classification — union for the predicate, either direction
// ---------------------------------------------------------------------------

test("co-read: an authored edge is matched in EITHER direction", () => {
  const forward = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-20")],
    [],
    [edge(10, 20)],
    resolve,
  );
  const backward = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-20")],
    [],
    [edge(20, 10)],
    resolve,
  );
  assert.equal(forward.pairs[0]?.authored, true);
  assert.equal(backward.pairs[0]?.authored, true, "direction must not decide connectedness");
});

test("co-read: both support populations feed the predicate, and neither is summed into a total", () => {
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-20"), read("w2", "adr-30"), read("w2", "adr-40")],
    [edge(10, 20)],
    [edge(30, 40)],
    resolve,
  );
  assert.equal(reading.authoredPairs, 2, "an amends edge and a dependsOn edge both connect");
  assert.equal(reading.novelPairs, 0);
  // ADR-0419 D1: the two are carried apart. A reading that only exposed a sum would fail here.
  assert.equal(reading.amendsEdges, 1);
  assert.equal(reading.dependsOnEdges, 1);
});

test("authoredPairKeys: a self-edge is not a pair", () => {
  assert.equal(authoredPairKeys([edge(7, 7)], []).size, 0);
});

// ---------------------------------------------------------------------------
// The denominators a reader needs to not over-read the headline
// ---------------------------------------------------------------------------

test("co-read: pair count is quadratic, and the worst single window is reported", () => {
  // Four distinct decisions in one window = 6 pairs. Without this figure a reader cannot tell a
  // broad signal from one long sitting's wandering.
  const reading = computeCoReadEdges(
    ["adr-1", "adr-2", "adr-3", "adr-4"].map((id) => read("w1", id)),
    [],
    [],
    resolve,
  );
  assert.equal(reading.pairs.length, 6);
  assert.equal(reading.maxPairsFromOneWindow, 6);
  assert.equal(reading.windowsYieldingPairs, 1);
});

test("co-read: a pair seen in two windows counts twice and sorts first", () => {
  const reading = computeCoReadEdges(
    [
      read("w1", "adr-10"),
      read("w1", "adr-20"),
      read("w2", "adr-10"),
      read("w2", "adr-20"),
      read("w3", "adr-30"),
      read("w3", "adr-40"),
    ],
    [],
    [],
    resolve,
  );
  assert.equal(reading.pairs[0]?.windows, 2);
  assert.deepEqual([reading.pairs[0]?.low, reading.pairs[0]?.high], [10, 20]);
  assert.equal(reading.novelPairs, 2);
  assert.equal(reading.novelPairsInMultipleWindows, 1);
});

test("co-read: authored-edge recall counts only edges whose BOTH ends were read", () => {
  // 10-20 was co-read. 30-40 has an authored edge but neither end was ever read, so scoring it
  // would report a low recall that says nothing about co-reading.
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-20"), read("w2", "adr-50")],
    [],
    [edge(10, 20), edge(30, 40)],
    resolve,
  );
  assert.equal(reading.authoredEdgesWithBothEndsRead, 1);
  assert.equal(reading.authoredEdgesCoRead, 1);
});

test("co-read: an authored edge whose ends were read in DIFFERENT windows is not co-read", () => {
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w2", "adr-20")],
    [],
    [edge(10, 20)],
    resolve,
  );
  assert.equal(reading.authoredEdgesWithBothEndsRead, 1);
  assert.equal(reading.authoredEdgesCoRead, 0, "reading both ends apart is not co-reading them");
});

// ---------------------------------------------------------------------------
// The two figures that make the headline readable rather than merely large
// ---------------------------------------------------------------------------

test("co-read: the chance null scales with observed density, so recall can be judged", () => {
  // Four decisions read => 6 possible pairs. One window reads 3 of them => 3 observed pairs, so
  // density is 1/2 and an authored edge whose ends were both read is recovered 50% of the time by
  // chance. Without this the recall figure cannot be distinguished from arithmetic.
  const reading = computeCoReadEdges(
    [read("w1", "adr-1"), read("w1", "adr-2"), read("w1", "adr-3"), read("w2", "adr-4")],
    [],
    [edge(1, 2)],
    resolve,
  );
  assert.equal(reading.distinctDecisionsRead, 4);
  assert.equal(reading.possiblePairs, 6);
  // The n < 2 guard must fire ONLY below two: at exactly two decisions there is one possible pair,
  // and a guard that swallowed that case would report a zero universe for a real population.
  const twoRead = computeCoReadEdges(
    [read("w1", "adr-1"), read("w2", "adr-2")],
    [],
    [],
    resolve,
  );
  assert.equal(twoRead.distinctDecisionsRead, 2);
  assert.equal(twoRead.possiblePairs, 1);
  assert.equal(reading.pairs.length, 3);
  assert.equal(reading.authoredEdgesWithBothEndsRead, 1);
  assert.equal(reading.authoredCoReadExpectedByChance, 0.5);
});

test("co-read: a saturated population makes the chance null equal the recall — the unreadable case", () => {
  // One window reads everything, so every possible pair is observed. Recall is 100% and so is
  // chance: the recall figure carries NO evidence here, and the null is what says so.
  const reading = computeCoReadEdges(
    [read("w1", "adr-1"), read("w1", "adr-2"), read("w1", "adr-3")],
    [],
    [edge(1, 3)],
    resolve,
  );
  assert.equal(reading.pairs.length, reading.possiblePairs);
  assert.equal(reading.authoredEdgesCoRead, 1);
  assert.equal(reading.authoredCoReadExpectedByChance, 1);
});

test("co-read: numerically adjacent novel pairs are counted apart as the confound they are", () => {
  // 10+12 is within the gap (consecutive-ish numbering already implies relatedness); 10+300 is not.
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-12"), read("w2", "adr-10"), read("w2", "adr-300")],
    [],
    [],
    resolve,
  );
  assert.equal(reading.novelPairs, 2);
  assert.equal(reading.novelPairsNumericallyAdjacent, 1);
});

test("co-read: a pair exactly at the adjacency gap counts as adjacent, one past it does not", () => {
  const at = computeCoReadEdges([read("w1", "adr-10"), read("w1", "adr-15")], [], [], resolve);
  const past = computeCoReadEdges([read("w1", "adr-10"), read("w1", "adr-16")], [], [], resolve);
  assert.equal(ADJACENCY_GAP, 5, "the boundary cases below are written against this value");
  assert.equal(at.novelPairsNumericallyAdjacent, 1);
  assert.equal(past.novelPairsNumericallyAdjacent, 0);
});

test("co-read: empty input is a legible zero reading, never a throw", () => {
  const reading = computeCoReadEdges([], [], [], resolve);
  assert.equal(reading.pairs.length, 0);
  assert.equal(reading.windows, 0);
  assert.equal(reading.resolvedReads, 0);
  assert.equal(reading.maxPairsFromOneWindow, 0);
  assert.equal(reading.authoredEdgesWithBothEndsRead, 0);
  assert.equal(reading.possiblePairs, 0);
  // The zero-denominator guard: without it this is 0/0 = NaN, and a NaN printed as a chance
  // baseline reads as a broken instrument rather than as "nothing was observed".
  assert.equal(reading.authoredCoReadExpectedByChance, 0);
  assert.ok(!Number.isNaN(reading.authoredCoReadExpectedByChance));
});

// ---------------------------------------------------------------------------
// The comparator, discriminated on every tie-break level it claims to have
// ---------------------------------------------------------------------------

/**
 * Four pairs chosen so EVERY level of the sort ACTUALLY DISCRIMINATES somewhere:
 *   (50,60) in two windows · (10,20) in one · (10,30) in one · (70,80) in one.
 *
 * ⚠ The three-pair version of this was not enough, and mutation testing is what said so. Its only
 * equal-window pairs both had `low = 10`, so `a.low - b.low` was evaluated as ZERO every time and a
 * mutant replacing it with `a.low + b.low` survived: a level that never separates two rows cannot
 * detect a comparator that dropped it. `(70,80)` is here purely to make the middle level do work.
 */
const FOUR_LEVEL_POPULATION: CoReadObservation[] = [
  // ⚠ DELIBERATELY IN THE WRONG ORDER — the windows are named so that the pairs enter the map
  // REVERSED at every level, and mutation testing is what forced this too. With the population
  // already in its final order the sort only ever asks "does this row stay put?", and both
  // `a.low - b.low` and `a.low + b.low` answer yes; two mutants survived on an assertion that
  // looked exact. A sort test over pre-sorted input tests nothing.
  read("w1", "adr-70"), // (70,80) — belongs LAST, enters FIRST
  read("w1", "adr-80"),
  read("w2", "adr-10"), // (10,30) — belongs after (10,20), enters before it
  read("w2", "adr-30"),
  read("w3", "adr-10"), // (10,20)
  read("w3", "adr-20"),
  read("w4", "adr-50"), // (50,60) — belongs FIRST on two windows, enters LAST
  read("w4", "adr-60"),
  read("w5", "adr-50"),
  read("w5", "adr-60"),
];

test("co-read: pairs sort by windows first, then low, then high — each level discriminates", () => {
  const { pairs } = computeCoReadEdges(FOUR_LEVEL_POPULATION, [], [], resolve);
  assert.deepEqual(
    pairs.map((pair) => [pair.windows, pair.low, pair.high]),
    [
      [2, 50, 60], // most windows wins outright, despite mid-range numbers
      [1, 10, 20], // equal windows AND equal low — separated only by `high`
      [1, 10, 30],
      [1, 70, 80], // equal windows, larger low — separated by `low` alone
    ],
  );
});

test("co-read: multi-window novel pairs are the ones above 1, not the ones at or below it", () => {
  // Deliberately 1 pair above and 2 at/below, so a flipped comparison yields a DIFFERENT count
  // rather than the same one by symmetry.
  const reading = computeCoReadEdges(FOUR_LEVEL_POPULATION, [], [], resolve);
  assert.equal(reading.novelPairs, 4);
  assert.equal(reading.novelPairsInMultipleWindows, 1);
});

test("co-read: authoredPairs counts the authored SUBSET, not every pair", () => {
  // One of the three pairs is authored. A count that forgot to filter would report 3.
  const reading = computeCoReadEdges(FOUR_LEVEL_POPULATION, [], [edge(10, 20)], resolve);
  assert.equal(reading.pairs.length, 4);
  assert.equal(reading.authoredPairs, 1);
  assert.equal(reading.novelPairs, 3);
});

test("co-read: an authored edge with only ONE end read is outside the recall denominator", () => {
  // 10 was read, 900 never was. The edge cannot possibly have been co-read, so counting it would
  // deflate recall for a reason that has nothing to do with co-reading.
  const reading = computeCoReadEdges(
    [read("w1", "adr-10"), read("w1", "adr-20")],
    [],
    [edge(10, 900)],
    resolve,
  );
  assert.equal(reading.authoredEdgesWithBothEndsRead, 0);
  assert.equal(reading.authoredEdgesCoRead, 0);
});

test("co-read: the pair order is total, so the report is byte-stable across runs", () => {
  // Same multiset of observations, different arrival order — the emitted order must be identical.
  const a: CoReadObservation[] = [
    read("w1", "adr-30"),
    read("w1", "adr-10"),
    read("w2", "adr-10"),
    read("w2", "adr-30"),
    read("w3", "adr-20"),
    read("w3", "adr-40"),
  ];
  const b: CoReadObservation[] = [...a].reverse();
  const left = computeCoReadEdges(a, [], [], resolve).pairs;
  const right = computeCoReadEdges(b, [], [], resolve).pairs;
  assert.deepEqual(left, right);
  // And the tie between equal-strength pairs breaks on the pair itself, not on insertion order.
  assert.deepEqual([left[0]?.low, left[0]?.high], [10, 30]);
});
