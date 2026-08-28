import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDecisionReadBaseline,
  decisionNumberOfObservedId,
  decisionReadBaselineVacuity,
  longestReadChain,
  observedIdSpelling,
  supportAdjacency,
  SupportGraphCycleError,
  trailingWindowSlice,
  type DecisionReadObservation,
  type DecisionSupportGraph,
} from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A three-rung `amends` ladder plus one isolate: 10 -> 11 -> 12, and 20 standing alone. */
function ladder(overrides: Partial<DecisionSupportGraph> = {}): DecisionSupportGraph {
  return {
    decisions: [10, 11, 12, 20],
    amends: [
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
    dependsOn: [],
    decisionsCarryingDependsOn: 0,
    dependsOnNonDecisionTargets: 0,
    ...overrides,
  };
}

function read(
  partial: Partial<DecisionReadObservation> & Pick<DecisionReadObservation, "nodeId">,
): DecisionReadObservation {
  return {
    slotId: "slot-a",
    windowId: "win-1",
    at: "2026-08-01T00:00:00.000Z",
    surface: "host-transcript-file-read",
    ...partial,
  };
}


function baseline(
  reads: readonly DecisionReadObservation[],
  support: DecisionSupportGraph = ladder(),
  window: { from?: string; to?: string } = {},
) {
  return computeDecisionReadBaseline({
    reads,
    support,
    declaredFrom: window.from,
    declaredTo: window.to,
  });
}

// ---------------------------------------------------------------------------
// Id resolution — the join key
// ---------------------------------------------------------------------------

test("decision-read-baseline: every live spelling on both sides resolves to the same number", () => {
  // The reads arrive as `doc:decisions/…` and bare `adr-NNNN`; the offers as the same two plus
  // `asset:`. A resolver that knew only the pointer forms would drop the bare ids on BOTH sides of
  // one join and report a confident, low follow rate.
  assert.equal(decisionNumberOfObservedId("adr-0419"), 419);
  assert.equal(decisionNumberOfObservedId("asset:adr-0419"), 419);
  assert.equal(decisionNumberOfObservedId("doc:decisions/0419-support-edges.md"), 419);
  assert.equal(decisionNumberOfObservedId("doc:docs/decisions/0419-support-edges.md"), 419);
});

test("decision-read-baseline: an id naming something else resolves to null, never to a number", () => {
  assert.equal(decisionNumberOfObservedId("merge-ceremony"), null);
  assert.equal(decisionNumberOfObservedId("doc:docs/research/some-note.md"), null);
  // `adr-health-notes` is a legal artifact id and must never round to a decision.
  assert.equal(decisionNumberOfObservedId("adr-health-notes"), null);
  assert.equal(decisionNumberOfObservedId("asset:adr-health-notes"), null);
});

test("decision-read-baseline: the spelling census names each live form apart", () => {
  // The spelling names are the CORPUS'S OWN (`DecisionIdSpelling`), not this module's — it delegates
  // to `resolveDecisionId` rather than keeping a second table that could drift from it.
  assert.equal(observedIdSpelling("adr-0419"), "row");
  assert.equal(observedIdSpelling("asset:adr-0419"), "asset");
  assert.equal(observedIdSpelling("doc:decisions/0419-x.md"), "decisions");
  assert.equal(observedIdSpelling("doc:docs/decisions/0419-x.md"), "docs/decisions");
  assert.equal(observedIdSpelling("merge-ceremony"), null);
});

// ---------------------------------------------------------------------------
// The support adjacency — both edges walked, never summed, `supersedes` unreachable
// ---------------------------------------------------------------------------

test("decision-read-baseline: the adjacency unions both support edges, so a rehome is neutral", () => {
  // ADR-0419 D2's drain moves an edge from a source's `amends` to its `dependsOn`. The from/to pair
  // is unchanged, so the adjacency the chain walk sees must be identical — otherwise every rehomed
  // batch would silently shorten this arc's own baseline.
  const asAmends = supportAdjacency(ladder());
  const asDependsOn = supportAdjacency(
    ladder({
      amends: [{ from: 11, to: 12 }],
      dependsOn: [{ from: 10, to: 11 }],
      decisionsCarryingDependsOn: 1,
    }),
  );
  assert.deepEqual([...asAmends.entries()].sort(), [...asDependsOn.entries()].sort());
});

test("decision-read-baseline: the two edge populations are reported apart, never as one figure", () => {
  const result = baseline([], ladder({ dependsOn: [{ from: 20, to: 12 }], decisionsCarryingDependsOn: 1 }));
  assert.equal(result.amendsEdges, 2);
  assert.equal(result.dependsOnEdges, 1);
  // The shape itself is the fence: there is no field on the baseline that sums them.
  assert.equal(Object.keys(result).includes("supportEdges"), false);
});

// ---------------------------------------------------------------------------
// Chain depth — the arc's load-bearing number
// ---------------------------------------------------------------------------

test("decision-read-baseline: chain depth counts only edges whose BOTH ends were read", () => {
  // Reading 10 and 12 is not walking the 10 -> 11 -> 12 chain: 11 was never read, so the session
  // crossed no edge. Two chains of 1, not one of 2 — this is what makes the number behavioural.
  const adjacency = supportAdjacency(ladder());
  assert.equal(longestReadChain(new Set([10, 12]), adjacency).depth, 1);
  assert.equal(longestReadChain(new Set([10, 11]), adjacency).depth, 2);
  assert.deepEqual(longestReadChain(new Set([10, 11, 12]), adjacency).path, [10, 11, 12]);
});

test("decision-read-baseline: the OPTIONAL root leaves the unrooted answer exactly as it was", () => {
  // ADR-0428's trial needs a chain ROOTED at a frontier; the frozen baseline needs the unrooted
  // answer it already froze. This pins that adding the parameter changed neither number — the
  // frozen figures are a published record, so "no existing caller passes it" is not enough on its own.
  const adjacency = supportAdjacency(ladder());
  const readSet = new Set([10, 11, 12]);
  assert.deepEqual(longestReadChain(readSet, adjacency), longestReadChain(readSet, adjacency, undefined));
  assert.equal(longestReadChain(readSet, adjacency).depth, 3);
});

test("decision-read-baseline: a ROOTED chain starts where it is asked to, not at the deepest node", () => {
  const adjacency = supportAdjacency(ladder());
  const readSet = new Set([10, 11, 12]);
  assert.deepEqual(longestReadChain(readSet, adjacency, 11).path, [11, 12]);
  assert.equal(longestReadChain(readSet, adjacency, 12).depth, 1);
  // A root the session never read is not a walk it took — 0, never the unrooted longest.
  assert.equal(longestReadChain(new Set([11, 12]), adjacency, 10).depth, 0);
});

test("decision-read-baseline: an empty read set is depth 0, and one unrelated read is depth 1", () => {
  const adjacency = supportAdjacency(ladder());
  assert.equal(longestReadChain(new Set(), adjacency).depth, 0);
  assert.equal(longestReadChain(new Set([20]), adjacency).depth, 1);
});

test("decision-read-baseline: a cyclic support graph THROWS naming the loop, never truncates", () => {
  // A truncated walk returns a plausible smaller number and nothing says so.
  const cyclic = supportAdjacency(
    ladder({ amends: [{ from: 10, to: 11 }, { from: 11, to: 10 }] }),
  );
  assert.throws(
    () => longestReadChain(new Set([10, 11]), cyclic),
    (err: unknown) => err instanceof SupportGraphCycleError && err.loop.length > 0,
  );
});

test("decision-read-baseline: chain depth is a distribution over sessions, never a mean", () => {
  const result = baseline([
    read({ windowId: "w1", nodeId: "adr-0010" }),
    read({ windowId: "w1", nodeId: "adr-0011" }),
    read({ windowId: "w1", nodeId: "adr-0012" }),
    read({ windowId: "w2", nodeId: "adr-0020" }),
    read({ windowId: "w3", nodeId: "adr-0010" }),
    read({ windowId: "w3", nodeId: "adr-0011" }),
  ]);
  assert.deepEqual(result.chainDepthByWindow.histogram, [
    { depth: 1, sessions: 1 },
    { depth: 2, sessions: 1 },
    { depth: 3, sessions: 1 },
  ]);
  assert.equal(result.chainDepthByWindow.sessionsWalkingAChain, 2);
  assert.equal(result.chainDepthByWindow.maxDepth, 3);
  assert.equal(result.chainDepthByWindow.deepestSessionId, "w1");
  assert.deepEqual(result.chainDepthByWindow.deepestChain, [10, 11, 12]);
});

test("decision-read-baseline: slot pooling INFLATES chain depth, and both grains prove it", () => {
  // THE MEASUREMENT THAT JUSTIFIES CARRYING A WINDOW ID AT ALL. Three windows each read ONE decision
  // — nobody walked anything — but they shared one pooled worktree slot, so the slot-grained view
  // unions them into a single three-rung sitting that never happened.
  const result = baseline([
    read({ slotId: "slot-x", windowId: "w1", nodeId: "adr-0010" }),
    read({ slotId: "slot-x", windowId: "w2", nodeId: "adr-0011" }),
    read({ slotId: "slot-x", windowId: "w3", nodeId: "adr-0012" }),
  ]);
  assert.equal(result.chainDepthByWindow.maxDepth, 1);
  assert.equal(result.chainDepthByWindow.sessionsWalkingAChain, 0);
  assert.equal(result.chainDepthBySlot.maxDepth, 3);
  assert.equal(result.chainDepthBySlot.sessionsWalkingAChain, 1);
  assert.equal(result.poolingFactor, 3);
});

test("decision-read-baseline: a read with no window id is counted, never folded into the slot", () => {
  const result = baseline([
    read({ slotId: "slot-x", windowId: undefined, nodeId: "adr-0010" }),
    read({ slotId: "slot-x", windowId: undefined, nodeId: "adr-0011" }),
  ]);
  assert.equal(result.readsWithWindowId, 0);
  assert.equal(result.readsWithoutWindowId, 2);
  assert.equal(result.chainDepthByWindow.sessionsWithAnyDecisionRead, 0);
  assert.equal(result.chainDepthByWindow.maxDepth, 0);
  // ...and the vacuity reason says the window-grained figure measured nothing, rather than letting
  // a depth of 0 read as "no session walks chains".
  assert.ok(result.vacuity.some((reason) => reason.includes("host context window id")));
});

// ---------------------------------------------------------------------------
// Reach — ranked by distinct sessions, never by raw reads
// ---------------------------------------------------------------------------

test("decision-read-baseline: one session grinding a decision cannot outrank two sessions reading another", () => {
  const result = baseline([
    ...Array.from({ length: 20 }, () => read({ windowId: "w1", nodeId: "adr-0010" })),
    read({ windowId: "w2", nodeId: "adr-0011" }),
    read({ windowId: "w3", nodeId: "adr-0011" }),
  ]);
  assert.deepEqual(result.reachByWindow[0], { decision: 11, sessions: 2, reads: 2 });
  assert.deepEqual(result.reachByWindow[1], { decision: 10, sessions: 1, reads: 20 });
});

test("decision-read-baseline: decisions nobody read are reported, not merely absent", () => {
  const result = baseline([read({ nodeId: "adr-0010" })]);
  assert.equal(result.decisionsInLog, 4);
  assert.equal(result.decisionsReachedBySlot, 1);
  assert.equal(result.decisionsNeverRead, 3);
});

test("decision-read-baseline: a read onto a decision the log does not hold is reported, not counted as reach", () => {
  const result = baseline([read({ nodeId: "adr-0999" })]);
  assert.equal(result.readsResolved, 1);
  assert.equal(result.readsOntoUnknownDecisions, 1);
  assert.equal(result.decisionsReachedBySlot, 0);
});

// ---------------------------------------------------------------------------
// Offer-to-follow
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The declared window
// ---------------------------------------------------------------------------

test("decision-read-baseline: the declared window bounds the reads it counts", () => {
  // Was "bounds reads and offers alike" until ADR-0464 D7 retired the offer half. The claim about
  // reads is unchanged and is asserted on the same two timestamps.
  const result = baseline(
    [
      read({ nodeId: "adr-0010", at: "2026-07-01T00:00:00.000Z" }),
      read({ nodeId: "adr-0011", at: "2026-08-15T00:00:00.000Z" }),
    ],
    ladder(),
    { from: "2026-08-01T00:00:00.000Z" },
  );
  assert.equal(result.readsObserved, 1);
  assert.equal(result.observedFrom, "2026-08-15T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Vacuity — "nothing was deep" must never print like "nothing was measured"
// ---------------------------------------------------------------------------

test("decision-read-baseline: a healthy reading reports no vacuity reason", () => {
  const result = baseline(
    [read({ windowId: "w1", nodeId: "adr-0010" }), read({ windowId: "w1", nodeId: "adr-0011" })],
  );
  assert.deepEqual(result.vacuity, []);
});

test("decision-read-baseline: an EMPTY decision log is a vacuity reason, not a clean census", () => {
  const empty: DecisionSupportGraph = {
    decisions: [],
    amends: [],
    dependsOn: [],
    decisionsCarryingDependsOn: 0,
    dependsOnNonDecisionTargets: 0,
  };
  const result = baseline([read({ nodeId: "adr-0010" })], empty);
  assert.ok(result.vacuity.some((reason) => reason.includes("0 decisions")));
});

test("decision-read-baseline: vacuity ANDs the two support edges and never tests `amends` alone", () => {
  // THE FAILURE THIS EXISTS TO PREVENT: ADR-0419 D2's drain moves edges off `amends`, so a fully
  // drained log has ZERO of them by design. An `amends`-only emptiness test would declare that
  // healthy log vacuous exactly as the migration succeeded.
  const drained = ladder({
    amends: [],
    dependsOn: [{ from: 10, to: 11 }, { from: 11, to: 12 }],
    decisionsCarryingDependsOn: 4,
  });
  const result = baseline([read({ nodeId: "adr-0010" })], drained);
  assert.equal(result.amendsEdges, 0);
  assert.ok(
    !result.vacuity.some((reason) => reason.includes("support edges")),
    "a drained log is healthy, not vacuous",
  );

  // ...and a log with NEITHER edge does fire it.
  const edgeless = ladder({ amends: [], dependsOn: [] });
  const blind = baseline([read({ nodeId: "adr-0010" })], edgeless);
  assert.ok(blind.vacuity.some((reason) => reason.includes("support edges")));
});

test("decision-read-baseline: zero reads names itself as a vacuity reason", () => {
  // The offer half of this test went with the figure (ADR-0464 D7): there is no longer a
  // "0 decision offers were recorded" reason to assert, because nothing records offers and a reason
  // that fired on every run would report the instrument as broken rather than the corpus as quiet.
  const noReads = baseline([]);
  assert.ok(noReads.vacuity.some((reason) => reason.includes("0 decision reads were observed")));
});

test("decision-read-baseline: reads that all fail to resolve are a JOIN failure, not a quiet corpus", () => {
  // The pointer-spelling regression, wearing a new coat: numbers that compute and are wrong.
  const result = baseline(
    [read({ nodeId: "0419" }), read({ nodeId: "ADR-0419" })],
  );
  assert.equal(result.readsObserved, 2);
  assert.equal(result.readsResolved, 0);
  assert.ok(result.vacuity.some((reason) => reason.includes("NONE resolved")));
});

test("decision-read-baseline: the vacuity function is total over its own output", () => {
  const result = baseline([read({ windowId: "w1", nodeId: "adr-0010" })]);
  // Recomputing over the returned baseline must agree with what the baseline already carries —
  // otherwise the reported reasons and the computed ones could drift apart silently.
  assert.deepEqual(decisionReadBaselineVacuity(result), result.vacuity);
});

// ---------------------------------------------------------------------------
// The observable-branch denominator — ADR-0312's rule, honoured without discarding the rest
// ---------------------------------------------------------------------------

test("decision-read-baseline: observedFrom/To are the window's EXTREMES, so the timestamps must be sorted", () => {
  // Pins the `.sort()` on the observed-window bounds. Fed OUT OF ORDER deliberately: without the
  // sort, `observedFrom` is whichever read happened to come first in the input array and
  // `observedTo` whichever came last, so a baseline would report a window narrower than the reads it
  // actually saw — and would do it silently, since both fields would still hold real timestamps.
  const result = baseline([
    read({ nodeId: "adr-0011", at: "2026-08-15T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z" }),
    read({ nodeId: "adr-0012", at: "2026-08-30T00:00:00.000Z" }),
  ]);
  assert.equal(result.observedFrom, "2026-08-01T00:00:00.000Z", "the EARLIEST read, not the first one handed in");
  assert.equal(result.observedTo, "2026-08-30T00:00:00.000Z", "the LATEST read, not the last one handed in");
});

// ---------------------------------------------------------------------------
// The trailing fixed-COUNT window slice (`decision-discovery-kpi-arc-inc-02`)
// ---------------------------------------------------------------------------

/** `n` windows, each reading decision 10 once, one minute apart and oldest first. */
function windows(n: number, first = 0): DecisionReadObservation[] {
  return Array.from({ length: n }, (_, i) =>
    read({
      nodeId: "adr-0010",
      windowId: `win-${String(first + i).padStart(4, "0")}`,
      at: new Date(Date.UTC(2026, 7, 1, 0, first + i)).toISOString(),
    }),
  );
}

test("trailingWindowSlice: REFUSES rather than shortening when the history is too thin", () => {
  // A slice of 3 windows compared against a 401-window reference is the very comparison the slice
  // exists to prevent, and a silently-shortened one would look exactly like a reading.
  const slice = trailingWindowSlice({ reads: windows(3), support: ladder(), count: 401 });
  assert.equal(slice.windowsAvailable, 3, "the DISTANCE to the gate is reported, not just the refusal");
  assert.equal(slice.windowsKept, 0);
  assert.deepEqual(slice.reads, []);
  assert.equal(slice.observedFrom, undefined);
});

test("trailingWindowSlice: takes the MOST RECENT n windows and every read belonging to them", () => {
  const slice = trailingWindowSlice({ reads: windows(10), support: ladder(), count: 4 });
  assert.equal(slice.windowsAvailable, 10);
  assert.equal(slice.windowsKept, 4);
  assert.deepEqual(slice.windowIds, ["win-0006", "win-0007", "win-0008", "win-0009"]);
  assert.equal(slice.reads.length, 4);
  assert.equal(slice.observedFrom, "2026-08-01T00:06:00.000Z", "the SLICE's extent, never the input's");
});

test("trailingWindowSlice: a window's UNRESOLVED reads travel with it once it qualifies", () => {
  // A qualifying window's other reads are still that window's reads; dropping them would make the
  // sliced baseline disagree with the slice about how much the same windows did.
  const reads = [
    ...windows(2),
    read({ nodeId: "story:not-a-decision", windowId: "win-0001", at: "2026-08-01T00:05:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 1 });
  assert.deepEqual(slice.windowIds, ["win-0001"]);
  assert.equal(slice.reads.length, 2, "the qualifying window brought its unresolved read with it");
});

test("trailingWindowSlice: a window whose only read resolves to nothing never occupies a slot", () => {
  // Counting windows on RAW reads would let this one take a slot, and the sliced baseline would then
  // report fewer windows than the slice claimed to take — a discrepancy no caller could see.
  const reads = [
    ...windows(2),
    read({ nodeId: "asset:merge-ceremony", windowId: "win-9999", at: "2026-08-01T23:00:00.000Z" }),
    read({ nodeId: "adr-0099", windowId: "win-9998", at: "2026-08-01T22:00:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 2 });
  assert.equal(slice.windowsAvailable, 2, "neither the unresolvable id nor the unheld decision qualifies");
  assert.deepEqual(slice.windowIds, ["win-0000", "win-0001"]);
});

test("trailingWindowSlice: the sliced baseline reports EXACTLY the windows the slice took", () => {
  // The invariant the reach gate rests on: `windowsKept` and the baseline's own
  // `sessionsWithAnyDecisionRead` must agree, or the gate is comparing a count to a different count.
  const slice = trailingWindowSlice({ reads: windows(25), support: ladder(), count: 9 });
  const sliced = baseline(slice.reads);
  assert.equal(slice.windowsKept, 9);
  assert.equal(sliced.chainDepthByWindow.sessionsWithAnyDecisionRead, slice.windowsKept);
});

test("trailingWindowSlice: a count of zero refuses, and is not read as \"take none, successfully\"", () => {
  // `<= 0` rather than `< 0`: a caller asking for zero windows is asking for a slice that cannot be
  // compared to anything, and returning an empty-but-formed slice would report `windowsKept: 0`
  // beside a figure that believed itself comparable.
  const slice = trailingWindowSlice({ reads: windows(5), support: ladder(), count: 0 });
  assert.equal(slice.windowsKept, 0);
  assert.deepEqual(slice.windowIds, [], "a refused slice names no windows");
  assert.deepEqual(slice.reads, []);
  assert.equal(slice.windowsAvailable, 5, "what was AVAILABLE is still reported, even on a refusal");
});

test("trailingWindowSlice: a NEGATIVE count refuses, and never silently drops a window instead", () => {
  // The arm the `<= 0` guard exists for, and the one a `< 0` spelling would get wrong in the worst
  // possible way: without the guard the negative falls through to `ordered.slice(0, -1)`, which
  // DROPS the last window and returns a formed-looking slice of n-1. A refusal is loud; a slice
  // quietly one window short of what was asked for is the shortened comparison this whole function
  // exists to prevent, wearing a successful slice's clothes.
  const slice = trailingWindowSlice({ reads: windows(5), support: ladder(), count: -1 });
  assert.equal(slice.windowsKept, 0, "a negative count is refused, not honoured as 'all but one'");
  assert.deepEqual(slice.windowIds, []);
  assert.deepEqual(slice.reads, []);
  assert.equal(slice.windowsAvailable, 5);
});

test("trailingWindowSlice: 'most recent' is a window's GREATEST read, not the first one handed in", () => {
  // The sibling of the out-of-order test below, and the case it cannot see. That one proves the
  // tracker does not keep the LAST value it saw; this proves it does not keep the FIRST one either.
  // `long` is handed in ASCENDING order, so a tracker that only ever wrote once would answer
  // 2026-08-01 for it, rank it below `short`, and cut the wrong window out of the slice.
  const reads = [
    read({ nodeId: "adr-0010", windowId: "long", at: "2026-08-01T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "short", at: "2026-08-05T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "long", at: "2026-08-09T00:00:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 1 });
  assert.deepEqual(slice.windowIds, ["long"], "long's LAST read is the 9th, so it outranks short's 5th");
});

test("trailingWindowSlice: the slice's extent is the MIN and MAX of its reads, not their file order", () => {
  // Reads arrive in whatever order the transcript sweep yielded them, which is not chronological.
  // Taking the first and last as read would report an extent narrower or wider than the truth.
  const reads = [
    read({ nodeId: "adr-0010", windowId: "w", at: "2026-08-03T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "w", at: "2026-08-01T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "w", at: "2026-08-02T00:00:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 1 });
  assert.equal(slice.observedFrom, "2026-08-01T00:00:00.000Z", "the EARLIEST read, not the first one handed in");
  assert.equal(slice.observedTo, "2026-08-03T00:00:00.000Z", "the LATEST read, not the last one handed in");
});

test("trailingWindowSlice: windows that STOPPED at the same instant are ordered by when they started", () => {
  // The tiebreak, which nothing else reaches. Two windows whose last read lands on the same instant
  // are not interchangeable: the one that STARTED later is the more recent, and without a total
  // order the slice's membership would depend on Set iteration order.
  // ⚠ THE IDS ARE CHOSEN SO ID ORDER AND START ORDER DISAGREE. `a-late` starts later but sorts
  // FIRST descending by id, so a comparator that skipped the start tiebreak would answer `z-early`.
  // With the ids the other way round this test passes whether or not the tiebreak exists at all.
  const reads = [
    read({ nodeId: "adr-0010", windowId: "z-early", at: "2026-08-01T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "z-early", at: "2026-08-09T00:00:00.000Z" }),
    read({ nodeId: "adr-0011", windowId: "a-late", at: "2026-08-08T00:00:00.000Z" }),
    read({ nodeId: "adr-0011", windowId: "a-late", at: "2026-08-09T00:00:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 1 });
  assert.deepEqual(slice.windowIds, ["a-late"], "same last read, so the later START wins — not the higher id");
  assert.deepEqual(
    trailingWindowSlice({ reads: [...reads].reverse(), support: ladder(), count: 1 }).windowIds,
    ["a-late"],
    "and the answer does not depend on the order the reads were handed in",
  );
  // The id is the LAST resort, and it must still be there: two windows alike in both instants.
  const identical = [
    read({ nodeId: "adr-0010", windowId: "aaa", at: "2026-08-09T00:00:00.000Z" }),
    read({ nodeId: "adr-0011", windowId: "zzz", at: "2026-08-09T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    trailingWindowSlice({ reads: identical, support: ladder(), count: 1 }).windowIds,
    ["zzz"],
    "alike in both instants, the cut is still total rather than left to Set iteration order",
  );
});

test("trailingWindowSlice: the cut is deterministic and ordered by a window's LAST read", () => {
  // A window is an interval, so "recent" is a choice; it is its last read, tiebroken to its id, so a
  // frozen comparison selects the same windows on every run over the same input.
  // Handed OUT OF ORDER, deliberately: a tracker that kept the last value it SAW rather than the
  // greatest would answer `long` -> 2026-08-01 here and pick the wrong window.
  const reads = [
    read({ nodeId: "adr-0010", windowId: "long", at: "2026-08-09T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "short", at: "2026-08-05T00:00:00.000Z" }),
    read({ nodeId: "adr-0010", windowId: "long", at: "2026-08-01T00:00:00.000Z" }),
  ];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 1 });
  assert.deepEqual(slice.windowIds, ["long"], "last read at the 9th beats a window that stopped on the 5th");
  assert.deepEqual(trailingWindowSlice({ reads, support: ladder(), count: 1 }).windowIds, slice.windowIds);
});

test("trailingWindowSlice: reads carrying no window id can never occupy a slot or ride along", () => {
  const reads = [...windows(2), read({ nodeId: "adr-0010", windowId: undefined, at: "2026-08-01T23:00:00.000Z" })];
  const slice = trailingWindowSlice({ reads, support: ladder(), count: 2 });
  assert.equal(slice.windowsAvailable, 2);
  assert.equal(slice.reads.length, 2);
});
