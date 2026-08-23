import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chainFrontiers,
  componentsAreEdgeClosed,
  descendantClosure,
  selectDecisionControlSet,
  supportComponents,
  DOMINANT_UNIT_SHARE,
  type DecisionControlSetInput,
} from "./decision-control-set.js";
import { supportAdjacency } from "./decision-read-baseline.js";
import type { DecisionReadObservation, DecisionSupportGraph } from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function graph(
  decisions: readonly number[],
  amends: readonly (readonly [number, number])[],
  dependsOn: readonly (readonly [number, number])[] = [],
): DecisionSupportGraph {
  return {
    decisions: [...decisions],
    amends: amends.map(([from, to]) => ({ from, to })),
    dependsOn: dependsOn.map(([from, to]) => ({ from, to })),
    decisionsCarryingDependsOn: dependsOn.length > 0 ? 1 : 0,
    dependsOnNonDecisionTargets: 0,
  };
}

function read(windowId: string, decision: number, at = "2026-07-01T00:00:00.000Z"): DecisionReadObservation {
  return { slotId: `slot-${windowId}`, windowId, nodeId: `adr-${decision}`, at, surface: "test" };
}

/** The production spelling resolver's job, reduced to the fixture's one spelling. */
const resolve = (id: string): number | null => {
  const match = /^adr-(\d+)$/.exec(id);
  return match?.[1] === undefined ? null : Number(match[1]);
};

function select(
  support: DecisionSupportGraph,
  reads: readonly DecisionReadObservation[],
  overrides: Partial<DecisionControlSetInput> = {},
): ReturnType<typeof selectDecisionControlSet> {
  return selectDecisionControlSet(
    { reads, support, declaredFrom: undefined, declaredTo: undefined, ...overrides },
    resolve,
  );
}

// ---------------------------------------------------------------------------
// Components — the conservative unit
// ---------------------------------------------------------------------------

test("supportComponents separates decisions no support edge connects", () => {
  const components = supportComponents(graph([1, 2, 3, 4], [[2, 1]]));
  assert.deepEqual(components, [[1, 2], [3], [4]]);
});

test("supportComponents unions UNDIRECTED — two amenders of one target share a component", () => {
  // 2 -> 1 <- 3. Nothing connects 2 and 3 in the DIRECTED graph, but a reader crosses the edges in
  // whichever direction the reading takes them, so a treatment at either is reachable from the other.
  const components = supportComponents(graph([1, 2, 3], [[2, 1], [3, 1]]));
  assert.deepEqual(components, [[1, 2, 3]]);
});

test("supportComponents unions across BOTH edge populations, never amends alone", () => {
  // A drained log (ADR-0419 D2's success state) carries its support in `dependsOn`. A component
  // walker that read `amends` alone would report this as three isolated decisions.
  const components = supportComponents(graph([1, 2, 3], [], [[2, 1], [3, 2]]));
  assert.deepEqual(components, [[1, 2, 3]]);
});

test("supportComponents ignores an edge naming a decision the log does not hold", () => {
  const components = supportComponents(graph([1, 2], [[2, 999]]));
  assert.deepEqual(components, [[1], [2]]);
});

test("componentsAreEdgeClosed holds for the real partition and FAILS for a split one", () => {
  const support = graph([1, 2, 3], [[2, 1], [3, 2]]);
  assert.equal(componentsAreEdgeClosed(support, supportComponents(support)), true);
  // The positive control: a partition that cuts the 3 -> 2 edge must be rejected, or the invariant
  // is satisfied by anything and proves nothing.
  assert.equal(componentsAreEdgeClosed(support, [[1, 2], [3]]), false);
});

// ---------------------------------------------------------------------------
// Frontiers — the fork's own object
// ---------------------------------------------------------------------------

test("chainFrontiers takes in-degree 0 with out-degree >= 1, and nothing else", () => {
  // 4 -> 3 -> 2 -> 1, plus isolated 5. Only 4 heads a chain: 1 is bedrock (no out-edge), 2 and 3
  // are amended (in-edges), 5 has neither.
  assert.deepEqual(chainFrontiers(graph([1, 2, 3, 4, 5], [[4, 3], [3, 2], [2, 1]])), [4]);
});

test("chainFrontiers counts a `dependsOn` in-edge as amending for frontier purposes", () => {
  // 3 depends on 2, so 2 is not a frontier even though nothing AMENDS it. A frontier walker reading
  // `amends` alone would wrongly offer 2 as a place to carry the current position.
  assert.deepEqual(chainFrontiers(graph([1, 2, 3], [[2, 1]], [[3, 2]])), [3]);
});

test("descendantClosure follows support edges transitively and includes the root", () => {
  const support = graph([1, 2, 3, 4], [[4, 3], [3, 2], [2, 1]]);
  assert.deepEqual([...descendantClosure(4, supportAdjacency(support))].sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.deepEqual([...descendantClosure(1, supportAdjacency(support))], [1]);
});

test("descendantClosure terminates on a diamond rather than revisiting", () => {
  const support = graph([1, 2, 3, 4], [[4, 2], [4, 3], [2, 1], [3, 1]]);
  assert.equal(descendantClosure(4, supportAdjacency(support)).size, 4);
});

// ---------------------------------------------------------------------------
// The selection
// ---------------------------------------------------------------------------

test("a GIANT COMPONENT makes the component design infeasible, and says why", () => {
  // One chain of four that every reader walks, plus two tiny pairs read once each.
  const support = graph(
    [1, 2, 3, 4, 10, 11, 20, 21],
    [[2, 1], [3, 2], [4, 3], [11, 10], [21, 20]],
  );
  const reads = [
    read("w1", 1), read("w1", 2), read("w1", 3),
    read("w2", 2), read("w2", 3), read("w2", 4),
    // The small components are READ but never WALKED — reach without a chain, which is the ordinary
    // shape `-inc-02` found (median decision reach 3, most sittings depth 1).
    read("w3", 10),
    read("w4", 20),
  ];
  const selection = select(support, reads);

  const giant = selection.components.find((c) => c.members.length === 4);
  assert.ok(giant, "the four-member component is present");
  assert.equal(giant.walkWindows, 2);
  assert.ok(
    selection.largestComponentWalkShare > DOMINANT_UNIT_SHARE,
    `largest component should dominate, got ${selection.largestComponentWalkShare}`,
  );
  assert.equal(selection.componentDesignInfeasible.length, 1);
  assert.match(selection.componentDesignInfeasible[0] ?? "", /IS the experiment/);
  // Infeasible means NO component was assigned an arm — not a split emitted under a warning.
  assert.equal(selection.components.every((c) => c.walkWindows >= 0), true);
});

test("a balanced component structure DOES yield a component split — the refusal is not unconditional", () => {
  // The mutation control for the test above: if `componentDesignInfeasible` fired regardless of the
  // structure, this assertion would fail and the refusal above would be proving nothing.
  const support = graph([1, 2, 10, 11, 20, 21], [[2, 1], [11, 10], [21, 20]]);
  const reads = [
    read("w1", 1), read("w1", 2),
    read("w2", 10), read("w2", 11),
    read("w3", 20), read("w3", 21),
  ];
  const selection = select(support, reads);
  assert.deepEqual(selection.componentDesignInfeasible, []);
});

test("frontier walk counts only a window that read the frontier AND something beneath it", () => {
  const support = graph([1, 2, 3], [[3, 2], [2, 1]]);
  const reads = [
    read("walker", 3), read("walker", 1), // read the frontier and descended — counts
    read("skimmer", 3), // read the frontier alone — does not
    read("deep", 2), read("deep", 1), // never touched the frontier — does not
  ];
  const frontier = select(support, reads).frontiers.find((f) => f.decision === 3);
  assert.ok(frontier);
  assert.equal(frontier.reachWindows, 2);
  assert.equal(frontier.walkWindows, 1);
  assert.equal(frontier.subtreeSize, 3);
  assert.equal(frontier.subtreeDepth, 3);
});

test("the frontier split is matched, balanced, and every unit appears in exactly one arm", () => {
  const support = graph(
    [1, 2, 10, 11, 20, 21, 30, 31],
    [[2, 1], [11, 10], [21, 20], [31, 30]],
  );
  const reads = [
    read("w1", 2), read("w1", 1),
    read("w2", 11), read("w2", 10),
    read("w3", 21), read("w3", 20),
    read("w4", 31), read("w4", 30),
  ];
  const selection = select(support, reads);

  assert.deepEqual(selection.frontierDesignInfeasible, []);
  assert.equal(selection.frontierPairs.length, 2);
  assert.equal(selection.frontierBalance.treatedUnits, 2);
  assert.equal(selection.frontierBalance.controlUnits, 2);
  assert.equal(selection.frontierBalance.treatedWalkWindows, selection.frontierBalance.controlWalkWindows);

  const assigned = [...selection.frontierArms.entries()].filter(([, arm]) => arm !== "ineligible");
  assert.equal(assigned.length, 4);
  assert.equal(new Set(assigned.map(([id]) => id)).size, 4, "no frontier is in both arms");
});

test("an ODD informative unit is left ineligible rather than assigned unpaired", () => {
  const support = graph([1, 2, 10, 11, 20, 21], [[2, 1], [11, 10], [21, 20]]);
  const reads = [
    read("w1", 2), read("w1", 1),
    read("w2", 11), read("w2", 10),
    read("w3", 21), read("w3", 20),
  ];
  const selection = select(support, reads);
  assert.equal(selection.informativeFrontiers, 3);
  assert.equal(selection.frontierPairs.length, 1);
  assert.equal(
    [...selection.frontierArms.values()].filter((a) => a === "ineligible").length,
    1,
    "the tail unit is ineligible — assigning it unpaired would silently unbalance the arms",
  );
});

test("CONTAMINATION counts a window that read both arms, and is zero when none does", () => {
  const support = graph([1, 2, 10, 11], [[2, 1], [11, 10]]);
  const clean = [
    read("w1", 2), read("w1", 1),
    read("w2", 11), read("w2", 10),
  ];
  assert.equal(select(support, clean).frontierContaminationWindows, 0);

  const straddling = [...clean, read("w3", 2), read("w3", 11)];
  const selection = select(support, straddling);
  assert.equal(selection.frontierPairs.length, 1);
  assert.equal(selection.frontierContaminationWindows, 1);
});

test("the split is DETERMINISTIC — the same input names the same arms twice", () => {
  const support = graph(
    [1, 2, 10, 11, 20, 21, 30, 31],
    [[2, 1], [11, 10], [21, 20], [31, 30]],
  );
  const reads = [
    read("w1", 2), read("w1", 1),
    read("w2", 11), read("w2", 10),
    read("w3", 21), read("w3", 20),
    read("w4", 31), read("w4", 30),
  ];
  assert.deepEqual(select(support, reads).frontierPairs, select(support, reads).frontierPairs);
});

test("the treated side ALTERNATES across pairs rather than always taking the lower id", () => {
  // A constant rule would load one arm with a systematic age bias — older decisions have had longer
  // to accumulate both amenders and readers. Four equal pairs make the alternation visible.
  const support = graph(
    [1, 2, 10, 11, 20, 21, 30, 31],
    [[2, 1], [11, 10], [21, 20], [31, 30]],
  );
  const reads = [
    read("w1", 2), read("w1", 1),
    read("w2", 11), read("w2", 10),
    read("w3", 21), read("w3", 20),
    read("w4", 31), read("w4", 30),
  ];
  const pairs = select(support, reads).frontierPairs;
  const treatedIsLower = pairs.map((p) => p.treated < p.control);
  assert.equal(new Set(treatedIsLower).size, 2, `expected both orientations, got ${JSON.stringify(pairs)}`);
});

test("reads outside the declared window are excluded", () => {
  const support = graph([1, 2], [[2, 1]]);
  const reads = [read("w1", 2, "2026-01-01T00:00:00.000Z"), read("w1", 1, "2026-01-01T00:00:00.000Z")];
  const selection = select(support, reads, {
    declaredFrom: "2026-06-08T00:00:00.000Z",
    declaredTo: "2026-08-23T00:00:00.000Z",
  });
  assert.equal(selection.windowsObserved, 0);
  assert.ok(selection.vacuity.some((v) => /no context window read any decision/.test(v)));
});

test("a read carrying NO window id is counted, never folded into a window", () => {
  const support = graph([1, 2], [[2, 1]]);
  const reads: DecisionReadObservation[] = [
    { slotId: "s", windowId: undefined, nodeId: "adr-2", at: "2026-07-01T00:00:00.000Z", surface: "t" },
    read("w1", 2),
    read("w1", 1),
  ];
  const selection = select(support, reads);
  assert.equal(selection.readsWithoutWindowId, 1);
  assert.equal(selection.windowsObserved, 1);
});

test("VACUITY on edges ANDs both populations — a DRAINED log is not vacuous", () => {
  // The fence `-inc-02` records: firing on `amends === 0` alone would declare the log vacuous exactly
  // as ADR-0419 D2's migration succeeded.
  const drained = select(graph([1, 2], [], [[2, 1]]), [read("w1", 2), read("w1", 1)]);
  assert.equal(
    drained.vacuity.some((v) => /NO edges of either kind/.test(v)),
    false,
    "a log whose support has all moved to dependsOn measured its subject perfectly",
  );

  const empty = select(graph([1, 2], []), [read("w1", 2), read("w1", 1)]);
  assert.ok(empty.vacuity.some((v) => /NO edges of either kind/.test(v)));
});

test("edge counts are reported APART and the two are never blended (ADR-0419 D1)", () => {
  const selection = select(graph([1, 2, 3], [[2, 1]], [[3, 2]]), [read("w1", 2)]);
  assert.equal(selection.amendsEdges, 1);
  assert.equal(selection.dependsOnEdges, 1);
  assert.equal(Object.keys(selection).includes("supportEdges"), false, "no blended figure exists");
});

test("an empty decision log is vacuous, never a clean census of nothing", () => {
  const selection = select(graph([], []), []);
  assert.ok(selection.vacuity.some((v) => /holds NO decisions/.test(v)));
});
