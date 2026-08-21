import assert from "node:assert/strict";
import test from "node:test";

import {
  combinedReadVacuity,
  evaluateCombinedAcyclicity,
  VACUOUS_COMBINED_READ_FLOOR,
  type DecisionEdgeSource,
} from "./combined-dag.js";
import { decisionNodeId } from "./decision-pointer.js";

/** A stored corpus row, as the store hands it over: an id plus an opaque payload. */
function artifact(id: string, dependsOn: readonly string[]): { id: string; doc: unknown } {
  return { id, doc: { dependsOn: [...dependsOn] } };
}

/** A decision with no edges of any kind — the shape most of the log has. */
function decision(
  decisionNumber: number,
  edges: Partial<Omit<DecisionEdgeSource, "number">> = {},
): DecisionEdgeSource {
  return {
    number: decisionNumber,
    amends: edges.amends ?? [],
    supersedes: edges.supersedes ?? [],
    ...(edges.dependsOn === undefined ? {} : { dependsOn: edges.dependsOn }),
  };
}

/** Enough artifacts to clear the vacuity floor, so a read can be judged as a real one. */
function padding(count: number): { id: string; doc: unknown }[] {
  return Array.from({ length: count }, (_unused, index) => artifact(`pad-${index}`, []));
}

test("combined-dag-joins-both-pointer-spellings-to-one-decision-node: neither form is dropped", () => {
  const verdict = evaluateCombinedAcyclicity(
    [
      artifact("bare-speller", ["doc:decisions/0223-a-title.md"]),
      artifact("prefixed-speller", ["doc:docs/decisions/0223-a-title.md"]),
    ],
    [decision(223)],
  );

  assert.equal(verdict.crossingEdges, 2, "both spellings resolve onto the decision");
  assert.equal(verdict.crossingBySpelling.get("decisions"), 1);
  assert.equal(verdict.crossingBySpelling.get("docs/decisions"), 1);
  assert.equal(verdict.crossingDanglingEdges, 0);
});

test("combined-dag-walks-the-minority-spelling-too: a ring closed only through `docs/decisions/` is found", () => {
  // The sharp end of ADR-0403 dec 7. A parser that accepted the majority spelling and quietly
  // dropped the other would report this graph ACYCLIC — a confident, plausible, wrong answer, and
  // exactly what the cycle census's own first parser did to 371 of 390 pointers.
  const verdict = evaluateCombinedAcyclicity(
    [artifact("stander", ["doc:docs/decisions/0223-a-title.md"])],
    [decision(223, { dependsOn: ["asset:stander"] })],
  );

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.cycles.length, 1);
  assert.equal(verdict.cycles[0]?.crossesTheJoin, true);
  assert.match(verdict.cycles[0]!.line, /ADR-0223/);
  assert.match(verdict.cycles[0]!.line, /stander/);
});

test("combined-dag-finds-a-cycle-that-crosses-the-join: an outbound decision edge closes the ring", () => {
  // THE NON-VACUITY CONTROL for this whole proof. Today no decision can point back into the Library,
  // which is the structural reason the union cannot loop — so the instrument has to be shown going
  // RED on the one input that will become possible when ADR-0403 dec 1 makes decisions ordinary
  // artifacts with an ordinary `dependsOn`. Without this test the probe passes on every input.
  const verdict = evaluateCombinedAcyclicity(
    [
      artifact("guidance", ["asset:pattern"]),
      artifact("pattern", ["doc:decisions/0223-a-title.md"]),
    ],
    [decision(223, { amends: [139] }), decision(139, { dependsOn: ["asset:guidance"] })],
  );

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.cycles.length, 1);
  const cycle = verdict.cycles[0]!;
  assert.equal(cycle.crossesTheJoin, true);
  assert.equal(cycle.path[0], cycle.path.at(-1), "the reported path is closed");
  assert.equal(cycle.line, "guidance → pattern → ADR-0223 → ADR-0139 → guidance");
  assert.equal(verdict.decisionToLibraryEdges, 1);
});

test("combined-dag-finds-a-library-only-cycle: and says it does NOT cross the join", () => {
  const verdict = evaluateCombinedAcyclicity(
    [artifact("left", ["asset:right"]), artifact("right", ["asset:left"])],
    [decision(223)],
  );

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.cycles.length, 1);
  assert.equal(
    verdict.cycles[0]?.crossesTheJoin,
    false,
    "a ring inside one half was already caught by that half's own judge",
  );
});

test("combined-dag-finds-a-decision-only-cycle-on-amends-alone", () => {
  const verdict = evaluateCombinedAcyclicity(
    [],
    [decision(1, { amends: [2] }), decision(2, { amends: [1] })],
  );

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.cycles[0]?.crossesTheJoin, false);
  assert.equal(verdict.decisionAmendsEdges, 2);
});

test("combined-dag-finds-a-ring-closed-ACROSS-the-two-edge-types: the union is the cycle reading", () => {
  // A loop is a loop whichever edge closes it, and this one exists in NEITHER per-type graph alone —
  // which is why the cycle question takes the union while the depth question never may (ADR-0403
  // dec 6). A judge that checked only `amends` would report this acyclic.
  const verdict = evaluateCombinedAcyclicity(
    [],
    [decision(1, { amends: [2] }), decision(2, { supersedes: [1] })],
  );

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.decisionAmendsEdges, 1);
  assert.equal(verdict.decisionSupersedesEdges, 1);
});

test("combined-dag-never-sums-the-two-edge-types: no field carries a combined total or a depth", () => {
  // The exclusion is held by the SHAPE of the verdict, not by a comment — so it is asserted over the
  // shape. Adding an `edgesScanned` total or a `maxDepth` to `CombinedDagVerdict` reds this, which
  // is the point: a summed figure must be unrepresentable, not merely discouraged.
  const verdict = evaluateCombinedAcyclicity(
    [],
    [decision(1, { amends: [2], supersedes: [3] }), decision(2), decision(3)],
  );

  assert.equal(verdict.decisionAmendsEdges, 1);
  assert.equal(verdict.decisionSupersedesEdges, 1);
  const forbidden = Object.keys(verdict).filter((key) => /depth|edgesScanned|totalEdges|edgeTotal/i.test(key));
  assert.deepEqual(forbidden, [], "no field a later reader could quote as a combined count or a depth");
});

test("combined-dag-reports-todays-one-way-join-as-a-measurement: 0 outbound decision edges", () => {
  // The zero is the whole proof obligation — see the module header. It is REPORTED rather than
  // assumed so a later reader learns it from the instrument, not from a comment that may have
  // stopped being true after the migration.
  const verdict = evaluateCombinedAcyclicity(
    [artifact("pattern", ["doc:decisions/0223-a-title.md"]), artifact("guidance", ["asset:pattern"])],
    [decision(223, { amends: [139] }), decision(139)],
  );

  assert.equal(verdict.acyclic, true);
  assert.equal(verdict.decisionToLibraryEdges, 0);
  assert.equal(verdict.crossingEdges, 1, "the join is real and walked, it just runs one way");
});

test("combined-dag-counts-dangling-pointers-never-drops-them", () => {
  const verdict = evaluateCombinedAcyclicity(
    [
      artifact("stander", [
        "asset:no-such-artifact",
        "doc:decisions/9999-no-such-decision.md",
        "doc:research/a-survey.md",
      ]),
    ],
    [decision(223, { amends: [404] })],
  );

  assert.equal(verdict.libraryDanglingEdges, 1);
  assert.equal(verdict.crossingDanglingEdges, 1);
  assert.equal(verdict.nonDecisionDocPointers, 1);
  assert.equal(verdict.decisionDanglingEdges, 1);
  assert.equal(verdict.crossingEdges, 0, "a dangling decision pointer is not a resolved join");
  assert.equal(
    verdict.crossingBySpelling.get("decisions"),
    1,
    "the spelling is counted even when the target is missing — a spelling regression must stay visible",
  );
});

test("combined-dag-declares-a-vacuous-read: the join, the library half, and the decision half", () => {
  const noJoin = evaluateCombinedAcyclicity(
    [...padding(VACUOUS_COMBINED_READ_FLOOR), artifact("a", ["asset:pad-0"])],
    [decision(223)],
  );
  assert.equal(noJoin.acyclic, true, "a graph with no crossing edge genuinely holds no cycle");
  assert.equal(
    combinedReadVacuity(noJoin).some((reason) => reason.includes("THE JOIN")),
    true,
    "…and the read still verified nothing about the union",
  );

  const noDecisions = evaluateCombinedAcyclicity(padding(VACUOUS_COMBINED_READ_FLOOR), []);
  assert.match(combinedReadVacuity(noDecisions).join(" "), /no decisions were read/);

  const noLibraryEdges = evaluateCombinedAcyclicity(padding(VACUOUS_COMBINED_READ_FLOOR), [decision(1)]);
  assert.match(combinedReadVacuity(noLibraryEdges).join(" "), /0 resolvable asset: edges/);
});

test("combined-dag-does-not-cry-vacuous-on-a-healthy-read, nor on a small hermetic one", () => {
  const healthy = evaluateCombinedAcyclicity(
    [
      ...padding(VACUOUS_COMBINED_READ_FLOOR),
      artifact("a", ["asset:pad-0", "doc:decisions/0223-a-title.md"]),
    ],
    [decision(223)],
  );
  assert.deepEqual(combinedReadVacuity(healthy), []);

  // Below the floor, "this corpus genuinely has no edges yet" is a plausible truth — a hermetic
  // fixture must not be reported as a blind read.
  const tiny = evaluateCombinedAcyclicity([artifact("a", [])], [decision(1)]);
  assert.deepEqual(combinedReadVacuity(tiny), []);
});

test("combined-dag-projects-defensively: a row shaped by another branch's schema contributes no edges", () => {
  const verdict = evaluateCombinedAcyclicity(
    [
      { id: "null-doc", doc: null },
      { id: "string-doc", doc: "not an object" },
      { id: "wrong-shape", doc: { dependsOn: "asset:a" } },
      { id: "mixed", doc: { dependsOn: ["asset:null-doc", 7, "", null] } },
    ],
    [decision(1)],
  );

  assert.equal(verdict.acyclic, true);
  assert.equal(verdict.artifactsScanned, 4);
  assert.equal(verdict.libraryEdges, 1, "only the one well-formed pointer resolved");
});

test("combined-dag-first-row-wins-on-a-duplicate: and the duplicate is named, not swallowed", () => {
  const verdict = evaluateCombinedAcyclicity(
    [artifact("twin", []), artifact("twin", ["asset:other"]), artifact("other", [])],
    [decision(1, { amends: [2] }), decision(1, { amends: [3] }), decision(2), decision(3)],
  );

  assert.deepEqual(verdict.duplicateArtifactIds, ["twin"]);
  assert.deepEqual(verdict.duplicateDecisionNumbers, [1]);
  assert.equal(verdict.artifactsScanned, 2);
  assert.equal(verdict.decisionsScanned, 3);
  assert.equal(verdict.libraryEdges, 0, "the SECOND `twin` row's edge is not adopted");
  assert.equal(verdict.decisionAmendsEdges, 1, "the second ADR-0001 row's edge is not adopted");
});

test("combined-dag-reports-an-id-collision-rather-than-merging-two-nodes", () => {
  // Structurally impossible while artifact ids exclude `:`, and reported anyway — a raw store read
  // does not enforce the schema, and a silent merge is the failure class this increment guards.
  const verdict = evaluateCombinedAcyclicity([artifact(decisionNodeId(223), [])], [decision(223)]);

  assert.deepEqual(verdict.collidingIds, ["decision:0223"]);
});
