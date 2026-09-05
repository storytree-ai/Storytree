import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPprGraph,
  buildRetrievalCases,
  chanceRecallAtK,
  DEFAULT_ALPHA,
  DEFAULT_MAX_ITERATIONS,
  hopDistances,
  pairedDifference,
  personalizedPageRank,
  rankFromScores,
  recallAtK,
  splitWindowsByHash,
  type DecisionReadForPpr,
} from "./ppr.js";

const edge = (from: number, to: number) => ({ from, to });

/** Floating-point comparison at a tolerance far tighter than any effect being measured. */
function assertClose(actual: number, expected: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

test("buildPprGraph carries an undirected edge in both adjacency lists", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2)]);
  assert.deepEqual(graph.neighbours[0], [1]);
  assert.deepEqual(graph.neighbours[1], [0]);
  assert.equal(graph.edgeCount, 1);
  assert.equal(graph.directed, false);
});

test("buildPprGraph honours direction when asked, leaving the target a dangling node", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2)], { directed: true });
  assert.deepEqual(graph.neighbours[0], [1]);
  assert.deepEqual(graph.neighbours[1], []);
  assert.equal(graph.danglingNodes, 1);
});

test("buildPprGraph COUNTS an edge naming a decision outside the node list rather than dropping it silently", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2), edge(1, 999), edge(404, 2)]);
  assert.equal(graph.droppedEndpoints, 2);
  assert.equal(graph.edgeCount, 1);
});

test("buildPprGraph folds a repeated pair and a self-loop into the duplicate count", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2), edge(2, 1), edge(1, 1)]);
  // Undirected: 1->2 and 2->1 are the same edge, and a self-loop spreads nothing.
  assert.equal(graph.edgeCount, 1);
  assert.equal(graph.duplicateEdges, 2);
});

test("buildPprGraph keeps both directions of a pair distinct when directed", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2), edge(2, 1)], { directed: true });
  assert.equal(graph.edgeCount, 2);
  assert.equal(graph.duplicateEdges, 0);
});

test("personalizedPageRank matches the closed form on a two-node chain", () => {
  // r_A = alpha*r_B + (1-alpha); r_B = alpha*r_A  =>  r_A = 1/(1+alpha), r_B = alpha/(1+alpha).
  const graph = buildPprGraph([1, 2], [edge(1, 2)]);
  const result = personalizedPageRank(graph, [1], { alpha: DEFAULT_ALPHA });
  assert.ok(result.converged, "power iteration should converge on a two-node chain");
  assertClose(result.scores[0] ?? 0, 1 / (1 + DEFAULT_ALPHA), "seed score");
  assertClose(result.scores[1] ?? 0, DEFAULT_ALPHA / (1 + DEFAULT_ALPHA), "neighbour score");
});

test("personalizedPageRank conserves total probability", () => {
  const graph = buildPprGraph([1, 2, 3, 4, 5], [edge(1, 2), edge(2, 3), edge(3, 4), edge(1, 5)]);
  const result = personalizedPageRank(graph, [1]);
  const total = result.scores.reduce((sum, value) => sum + value, 0);
  assertClose(total, 1, "scores should sum to one");
});

test("personalizedPageRank returns dangling mass to the SEEDS, not to the corpus", () => {
  // Two nodes, no edges at all: every step is a restart, so the seed must keep all the mass.
  const graph = buildPprGraph([1, 2], []);
  const result = personalizedPageRank(graph, [1]);
  assertClose(result.scores[0] ?? 0, 1, "isolated seed keeps all mass");
  assertClose(result.scores[1] ?? 0, 0, "an unconnected node earns nothing");
});

test("personalizedPageRank at alpha 0 is the restart vector exactly", () => {
  const graph = buildPprGraph([1, 2, 3], [edge(1, 2), edge(2, 3)]);
  const result = personalizedPageRank(graph, [2], { alpha: 0 });
  assertClose(result.scores[1] ?? 0, 1, "all mass stays on the seed");
  assertClose(result.scores[0] ?? 0, 0, "no mass spreads at alpha 0");
});

test("personalizedPageRank splits the restart vector evenly across several seeds", () => {
  const graph = buildPprGraph([1, 2], []);
  const result = personalizedPageRank(graph, [1, 2]);
  assertClose(result.scores[0] ?? 0, 0.5, "first seed");
  assertClose(result.scores[1] ?? 0, 0.5, "second seed");
});

test("personalizedPageRank decays with distance from the seed", () => {
  const graph = buildPprGraph([1, 2, 3, 4], [edge(1, 2), edge(2, 3), edge(3, 4)]);
  const result = personalizedPageRank(graph, [1]);
  const [, b, c, d] = result.scores;
  assert.ok((b ?? 0) > (c ?? 0), "one hop outranks two");
  assert.ok((c ?? 0) > (d ?? 0), "two hops outrank three");
});

/**
 * ⚠ PINNED BECAUSE IT IS COUNTER-INTUITIVE AND IT DROVE THE ALPHA SWEEP.
 *
 * On an UNDIRECTED graph a random walk's stationary distribution is proportional to DEGREE, and at
 * alpha 0.85 the walk dominates the restart — so a degree-2 neighbour genuinely outscores a degree-1
 * seed. This is correct PPR, not a defect, and it is the concrete reason HippoRAG damps nearer 0.5:
 * a high alpha turns "what is near my query" into "what is central in the corpus". A trial that
 * reported only alpha 0.85 would be measuring popularity and calling it relevance.
 */
test("at a high alpha an undirected walk favours DEGREE over the seed itself", () => {
  const graph = buildPprGraph([1, 2, 3, 4], [edge(1, 2), edge(2, 3), edge(3, 4)]);
  const hot = personalizedPageRank(graph, [1], { alpha: 0.85 });
  assert.ok(
    (hot.scores[1] ?? 0) > (hot.scores[0] ?? 0),
    "at alpha 0.85 the degree-2 neighbour overtakes the degree-1 seed",
  );

  const cool = personalizedPageRank(graph, [1], { alpha: 0.4 });
  assert.ok(
    (cool.scores[0] ?? 0) > (cool.scores[1] ?? 0),
    "at alpha 0.4 the restart holds the seed on top",
  );
});

test("personalizedPageRank actually CONVERGES at the shipped defaults", () => {
  // The whole point of DEFAULT_MAX_ITERATIONS being 500: at alpha 0.85 the residual falls as
  // 0.85^k, so 100 iterations returned an unconverged answer that still looked plausible.
  const graph = buildPprGraph([1, 2, 3, 4, 5], [edge(1, 2), edge(2, 3), edge(3, 4), edge(4, 5)]);
  const result = personalizedPageRank(graph, [1]);
  assert.ok(result.converged, `expected convergence, stopped after ${result.iterations} iterations`);
  assert.ok(result.iterations < DEFAULT_MAX_ITERATIONS, "should not need the whole budget");
});

test("personalizedPageRank REFUSES a seed the graph does not hold", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2)]);
  assert.throws(() => personalizedPageRank(graph, [77]), /seed 77 is not a node/);
});

test("personalizedPageRank REFUSES an empty seed set and an out-of-range alpha", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2)]);
  assert.throws(() => personalizedPageRank(graph, []), /at least one seed/);
  assert.throws(() => personalizedPageRank(graph, [1], { alpha: 1 }), /alpha must be in/);
  assert.throws(() => personalizedPageRank(graph, [1], { alpha: -0.1 }), /alpha must be in/);
});

test("rankFromScores excludes the seed and orders best first, ties by decision number", () => {
  const graph = buildPprGraph([10, 20, 30], []);
  const ranked = rankFromScores(graph, [0.5, 0.25, 0.25], [10]);
  assert.deepEqual(ranked, [20, 30]);
});

test("rankFromScores drops nodes that earned no mass at all", () => {
  const graph = buildPprGraph([10, 20, 30], []);
  const ranked = rankFromScores(graph, [0.9, 0.1, 0], [10]);
  assert.deepEqual(ranked, [20]);
});

test("recallAtK counts only the gold inside the cut", () => {
  const gold = new Set([2, 4]);
  assert.equal(recallAtK([1, 2, 3, 4], gold, 2), 0.5);
  assert.equal(recallAtK([1, 2, 3, 4], gold, 4), 1);
  assert.equal(recallAtK([1, 3, 5], gold, 3), 0);
});

test("recallAtK REFUSES an empty gold set rather than scoring it either way", () => {
  assert.throws(() => recallAtK([1], new Set(), 5), /gold set is empty/);
  assert.throws(() => recallAtK([1], new Set([1]), 0), /k must be positive/);
});

test("chanceRecallAtK is k over the pool, clamped at one", () => {
  assertClose(chanceRecallAtK(20, 463), 20 / 463, "expected recall under random ranking");
  assert.equal(chanceRecallAtK(500, 463), 1);
  assert.throws(() => chanceRecallAtK(5, 0), /poolSize must be positive/);
});

const read = (windowId: string | undefined, nodeId: string, at: string): DecisionReadForPpr => ({
  windowId,
  nodeId,
  at,
});
const numeric = (nodeId: string): number | null => {
  const match = /^adr-(\d+)$/.exec(nodeId);
  return match?.[1] === undefined ? null : Number(match[1]);
};

test("buildRetrievalCases takes the FIRST read as the seed and the rest as gold", () => {
  const reading = buildRetrievalCases(
    [
      read("w1", "adr-0100", "2026-09-01T10:00:00Z"),
      read("w1", "adr-0200", "2026-09-01T10:05:00Z"),
      read("w1", "adr-0300", "2026-09-01T10:09:00Z"),
    ],
    numeric,
  );
  assert.equal(reading.cases.length, 1);
  assert.equal(reading.cases[0]?.seed, 100);
  assert.deepEqual(reading.cases[0]?.gold, [200, 300]);
});

test("buildRetrievalCases drops a window that read one decision — there is no forward prediction", () => {
  const reading = buildRetrievalCases(
    [
      read("w1", "adr-0100", "2026-09-01T10:00:00Z"),
      read("w1", "adr-0100", "2026-09-01T10:04:00Z"),
    ],
    numeric,
  );
  assert.deepEqual(reading.cases, []);
  assert.equal(reading.windowsWithoutGold, 1);
});

test("buildRetrievalCases counts, and never folds, a read carrying no window id", () => {
  const reading = buildRetrievalCases(
    [
      read(undefined, "adr-0100", "2026-09-01T10:00:00Z"),
      read("", "adr-0200", "2026-09-01T10:01:00Z"),
      read("w1", "adr-0300", "2026-09-01T10:02:00Z"),
      read("w1", "adr-0400", "2026-09-01T10:03:00Z"),
    ],
    numeric,
  );
  assert.equal(reading.readsWithoutWindow, 2);
  assert.equal(reading.cases.length, 1);
  assert.equal(reading.cases[0]?.seed, 300);
});

test("buildRetrievalCases counts a read whose id resolves to no decision", () => {
  const reading = buildRetrievalCases(
    [
      read("w1", "merge-ceremony", "2026-09-01T10:00:00Z"),
      read("w1", "adr-0100", "2026-09-01T10:01:00Z"),
      read("w1", "adr-0200", "2026-09-01T10:02:00Z"),
    ],
    numeric,
  );
  assert.equal(reading.unresolvedReads, 1);
  assert.equal(reading.cases[0]?.seed, 100);
});

test("buildRetrievalCases de-duplicates a re-read rather than counting it twice in the gold", () => {
  const reading = buildRetrievalCases(
    [
      read("w1", "adr-0100", "2026-09-01T10:00:00Z"),
      read("w1", "adr-0200", "2026-09-01T10:01:00Z"),
      read("w1", "adr-0200", "2026-09-01T10:06:00Z"),
    ],
    numeric,
  );
  assert.deepEqual(reading.cases[0]?.gold, [200]);
});

test("buildRetrievalCases breaks a timestamp tie deterministically", () => {
  const same = "2026-09-01T10:00:00Z";
  const forward = buildRetrievalCases(
    [read("w1", "adr-0300", same), read("w1", "adr-0100", same)],
    numeric,
  );
  const reversed = buildRetrievalCases(
    [read("w1", "adr-0100", same), read("w1", "adr-0300", same)],
    numeric,
  );
  assert.equal(forward.cases[0]?.seed, 100);
  assert.equal(reversed.cases[0]?.seed, 100);
});

test("splitWindowsByHash partitions completely and repeats itself exactly", () => {
  const cases = Array.from({ length: 200 }, (_, index) => ({
    windowId: `window-${index}`,
    seed: 1,
    gold: [2],
  }));
  const first = splitWindowsByHash(cases, 0.3);
  const second = splitWindowsByHash(cases, 0.3);
  assert.equal(first.train.length + first.test.length, cases.length);
  assert.deepEqual(
    first.test.map((entry) => entry.windowId),
    second.test.map((entry) => entry.windowId),
  );
  // A hash split will not land exactly on the share; it must land near it on a population this size.
  assert.ok(
    first.test.length > 40 && first.test.length < 80,
    `expected roughly 60 test windows, got ${first.test.length}`,
  );
});

test("splitWindowsByHash puts no window in both halves", () => {
  const cases = Array.from({ length: 50 }, (_, index) => ({
    windowId: `w${index}`,
    seed: 1,
    gold: [2],
  }));
  const split = splitWindowsByHash(cases, 0.5);
  const trainIds = new Set(split.train.map((entry) => entry.windowId));
  for (const entry of split.test) {
    assert.ok(!trainIds.has(entry.windowId), `${entry.windowId} appeared in both halves`);
  }
});

test("splitWindowsByHash REFUSES a share that would empty a half", () => {
  assert.throws(() => splitWindowsByHash([], 0), /testShare must be in/);
  assert.throws(() => splitWindowsByHash([], 1), /testShare must be in/);
});

test("hopDistances separates the trivially adjacent gold from the gold that needs spreading", () => {
  const graph = buildPprGraph([1, 2, 3, 4], [edge(1, 2), edge(2, 3)]);
  const distances = hopDistances(graph, 1, [2, 3, 4]);
  assert.equal(distances.get(2), 1);
  assert.equal(distances.get(3), 2);
  assert.equal(distances.get(4), Number.POSITIVE_INFINITY);
});

test("hopDistances reports every target as unreachable when the seed is not in the graph", () => {
  const graph = buildPprGraph([1, 2], [edge(1, 2)]);
  const distances = hopDistances(graph, 99, [1, 2]);
  assert.equal(distances.get(1), Number.POSITIVE_INFINITY);
  assert.equal(distances.get(2), Number.POSITIVE_INFINITY);
});

test("pairedDifference finds no separation between two identical arms", () => {
  const scores = [0.2, 0.5, 0.8, 0.1, 0.9, 0.3];
  const paired = pairedDifference(scores, scores);
  assertClose(paired.meanDifference, 0, "identical arms differ by nothing");
  assert.equal(paired.separates, false);
  assert.equal(paired.n, 6);
});

test("pairedDifference separates a consistently better arm", () => {
  const worse = [0.2, 0.4, 0.6, 0.1, 0.3, 0.5];
  const better = worse.map((value) => value + 0.2);
  const paired = pairedDifference(better, worse);
  assertClose(paired.meanDifference, 0.2, "constant lead");
  assert.equal(paired.separates, true);
});

/**
 * ⚠ THE CASE THIS FUNCTION EXISTS FOR: a mean gap that looks like a result and is noise.
 *
 * The arms differ by about a point on average while individual cases swing by tens of points — the
 * exact shape of the bake-off's top three arms. The interval must straddle zero, or the write-up
 * reports a winner the data does not have.
 */
test("pairedDifference REFUSES to separate a one-point gap under heavy per-case swing", () => {
  const a = [0.9, 0.1, 0.8, 0.0, 0.7, 0.2, 0.6, 0.3, 1.0, 0.4];
  const b = [0.8, 0.2, 0.9, 0.1, 0.5, 0.4, 0.7, 0.2, 0.9, 0.4];
  const paired = pairedDifference(a, b);
  assert.ok(Math.abs(paired.meanDifference) < 0.05, "the means are close");
  assert.equal(paired.separates, false, "a small gap under large swing must not separate");
  assert.ok(paired.ci95[0] < 0 && paired.ci95[1] > 0, "the interval straddles zero");
});

test("pairedDifference REFUSES unpaired or too-short input", () => {
  assert.throws(() => pairedDifference([0.1, 0.2], [0.1]), /same cases/);
  assert.throws(() => pairedDifference([0.1], [0.2]), /at least two paired cases/);
});
