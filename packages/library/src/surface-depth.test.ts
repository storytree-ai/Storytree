import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateSurfaceDepth,
  kindOfDoc,
  surfaceDepthOf,
  surfaceWalkVacuity,
  RECORD_KINDS,
  VACUOUS_SURFACE_WALK_FLOOR,
  type SurfaceDepthNode,
  type SurfaceDepthVerdict,
} from "./surface-depth.js";
import { decisionSupportResolver } from "./decision-support-seam.js";
import { depthFromWorkNodes, type DepthFromWorkSource } from "./knowledge-depth.js";

/**
 * ADR-0476's surface-depth reading, as a pure function over stored rows.
 *
 * Hermetic by construction — literal rows, no store, no credential (ADR-0302 D3). Every assertion
 * below is written so that the OPPOSITE implementation would fail it: the point of most of these is
 * that a plausible shortcut (seed every indegree-0 node, take the shortest path, count every row in
 * the denominator, assign cycle members a first-seen depth) returns a confident wrong number rather
 * than an error.
 */

function row(
  id: string,
  // Open on purpose: a real stored row carries its kind's own fields too, and the agent tier's
  // manifest refLists (ADR-0481 D1) are read off exactly those rather than off `dependsOn`.
  fields: { dependsOn?: unknown; cites?: unknown; kind?: string; [field: string]: unknown } = {},
): DepthFromWorkSource {
  const { kind = "principle", ...rest } = fields;
  return { id, doc: { kind, id, ...rest } };
}

/**
 * The projection a real caller performs — the studio from `GuidanceAsset.category`, the probe from
 * the stored row — done here the same way rather than through a test-only helper.
 */
function nodesOf(rows: readonly DepthFromWorkSource[]): SurfaceDepthNode[] {
  const kinds = new Map(rows.map((r) => [r.id, kindOfDoc(r.doc)] as const));
  return depthFromWorkNodes(rows).map((node) => ({ ...node, kind: kinds.get(node.id) ?? "" }));
}

function verdictOf(rows: readonly DepthFromWorkSource[]): SurfaceDepthVerdict {
  return evaluateSurfaceDepth(nodesOf(rows));
}

test("surface-is-a-node-that-points-at-something: an edge-free row is UNLINKED, never a surface at depth 0", () => {
  const verdict = verdictOf([
    row("opening", { dependsOn: ["asset:floor"] }),
    row("floor"),
    row("floating-alone"),
    row("also-floating"),
  ]);

  // The seed clause. Dropping "and points at something" makes both floaters surfaces, and the walk
  // then reports 4 of 4 placed — the exact failure ADR-0476 D5 exists to prevent, and the one that
  // reads as health because "everything is at the surface" sounds like a well-linked corpus.
  assert.equal(verdict.surfaces, 1);
  assert.deepEqual(surfaceDepthOf(verdict, "opening"), { state: "placed", depth: 0 });
  assert.deepEqual(surfaceDepthOf(verdict, "floor"), { state: "placed", depth: 1 });
  assert.deepEqual(surfaceDepthOf(verdict, "floating-alone"), { state: "unlinked" });
  assert.deepEqual(surfaceDepthOf(verdict, "also-floating"), { state: "unlinked" });

  assert.equal(verdict.placed, 2);
  assert.equal(verdict.unlinked, 2);
  assert.equal(verdict.placed + verdict.unlinked + verdict.cyclicNodes, verdict.nodesScanned);
});

test("surface-depth-is-the-longest-chain: a diamond takes the LONG side, not the short one", () => {
  //   top ──> quick ─────────────┐
  //    └───> slow-a ─> slow-b ─> bottom
  const verdict = verdictOf([
    row("top", { dependsOn: ["asset:quick", "asset:slow-a"] }),
    row("quick", { dependsOn: ["asset:bottom"] }),
    row("slow-a", { dependsOn: ["asset:slow-b"] }),
    row("slow-b", { dependsOn: ["asset:bottom"] }),
    row("bottom"),
  ]);

  // Shortest-path (what `evaluateDepthFromWork` correctly does for ITS question) answers 2 here.
  // ADR-0476 D2: the depth of a hole is how far down it goes.
  assert.deepEqual(surfaceDepthOf(verdict, "bottom"), { state: "placed", depth: 3 });
  assert.equal(verdict.maxDepth, 3);
  assert.equal(verdict.deepestId, "bottom");
});

test("surface-depth-does-not-need-a-work-anchor: a corpus citing no story at all still has depth", () => {
  // The whole reason this reading exists. `evaluateDepthFromWork` returns 0 anchors and 0 reached
  // over exactly these rows; this one must not.
  const verdict = verdictOf([
    row("a", { dependsOn: ["asset:b"] }),
    row("b", { dependsOn: ["asset:c"] }),
    row("c"),
  ]);

  assert.equal(verdict.surfaces, 1);
  assert.equal(verdict.placed, 3);
  assert.equal(verdict.maxDepth, 2);
});

test("surface-depth-counts-decisions-as-nodes: a decision may BE a surface and may be a floor", () => {
  const rows = [
    row("adr-0002", { kind: "adr", dependsOn: ["doc:decisions/0001-first.md"] }),
    row("adr-0001", { kind: "adr" }),
    row("guidance", { dependsOn: ["asset:adr-0002"] }),
  ];
  const verdict = evaluateSurfaceDepth(
    nodesOf(rows),
    decisionSupportResolver([
      { number: 1, dependsOn: [] },
      { number: 2, dependsOn: ["doc:decisions/0001-first.md"] },
    ]),
  );

  // The owner's "the surface doesn't need to be a story, it could be an ADR", asserted rather than
  // assumed: `guidance` opens the hole, and the chain runs down through both decisions.
  assert.equal(verdict.surfaces, 1);
  assert.deepEqual(surfaceDepthOf(verdict, "guidance"), { state: "placed", depth: 0 });
  assert.deepEqual(surfaceDepthOf(verdict, "decision:0002"), { state: "placed", depth: 1 });
  assert.deepEqual(surfaceDepthOf(verdict, "decision:0001"), { state: "placed", depth: 2 });
  assert.equal(verdict.decisionsScanned, 2);

  // THE TWIN COLLAPSE, and it is the whole reading: a session reads `adr-0001`, never
  // `decision:0001`. Left uncollapsed, nothing points at the twin, so it is its own indegree-0
  // node and answers `depth 0 — at the surface` about the floor of the chain. Exactly inverted.
  assert.deepEqual(surfaceDepthOf(verdict, "adr-0002"), { state: "placed", depth: 1 });
  assert.deepEqual(surfaceDepthOf(verdict, "adr-0001"), { state: "placed", depth: 2 });
  // And the population counts each decision ONCE — three nodes, not five.
  assert.equal(verdict.nodesScanned, 3);
  assert.equal(verdict.artifactsScanned, 1);
});

test("surface-decisions-are-counted: a decision nothing points at is reported as a surface", () => {
  const verdict = evaluateSurfaceDepth(
    nodesOf([row("adr-0009", { kind: "adr" }), row("adr-0008", { kind: "adr" })]),
    decisionSupportResolver([
      { number: 9, dependsOn: ["doc:decisions/0008-x.md"] },
      { number: 8, dependsOn: [] },
    ]),
  );

  assert.equal(verdict.surfaces, 1);
  assert.equal(verdict.surfaceDecisions, 1);
});

test("record-tiers-leave-the-denominator: an increment is not counted against the knowledge corpus", () => {
  const verdict = verdictOf([
    row("a-pattern", { kind: "pattern", dependsOn: ["asset:a-definition"] }),
    row("a-definition", { kind: "definition" }),
    row("inc-01", { kind: "increment" }),
    row("inc-02", { kind: "increment" }),
    row("some-friction", { kind: "friction" }),
    row("an-arc", { kind: "arc" }),
  ]);

  // The `135/2623 anchored` failure, in miniature: counting all six rows reports 2/6 = 33% linked
  // and reads as an indictment of the knowledge tiers. The honest figure is 2/2.
  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.knowledgeLinked, 2);
  assert.equal(verdict.recordScanned, 4);
  assert.equal(verdict.recordLinked, 0);
  assert.equal(verdict.knowledgeScanned + verdict.recordScanned, verdict.nodesScanned);
});

test("record-tiers-can-still-be-linked: an increment citing guidance is counted as record-linked", () => {
  const verdict = verdictOf([
    row("inc-01", { kind: "increment", cites: ["asset:a-pattern"] }),
    row("a-pattern", { kind: "pattern" }),
  ]);

  // Excluded from the KNOWLEDGE denominator is not the same as unwalked: the increment is a real
  // surface and its `asset:` cite is a real edge, which is what gives `a-pattern` a depth at all.
  assert.equal(verdict.recordLinked, 1);
  assert.deepEqual(surfaceDepthOf(verdict, "a-pattern"), { state: "placed", depth: 1 });
});

test("unknown-kind-counts-as-knowledge: a new tier can never silently improve the score", () => {
  const verdict = verdictOf([
    row("mystery", { kind: "kind-nobody-has-declared", dependsOn: ["asset:target"] }),
    row("target", { kind: "definition" }),
  ]);

  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.recordScanned, 0);
});

test("a-cycle-reads-cyclic-not-a-depth: no member of a loop is handed a plausible number", () => {
  const verdict = verdictOf([
    row("opening", { dependsOn: ["asset:loop-a"] }),
    row("loop-a", { dependsOn: ["asset:loop-b"] }),
    row("loop-b", { dependsOn: ["asset:loop-a"] }),
  ]);

  // A DFS with a first-depth-wins guard would answer `loop-a: 1` and `loop-b: 2` — confident, and
  // meaningless, since a longest chain does not exist through a cycle. See ADR-0403 dec 5: the
  // joined graph is PROVEN acyclic, so this state is a regression detector, not a corpus fact.
  assert.deepEqual(surfaceDepthOf(verdict, "opening"), { state: "placed", depth: 0 });
  assert.deepEqual(surfaceDepthOf(verdict, "loop-a"), { state: "cyclic" });
  assert.deepEqual(surfaceDepthOf(verdict, "loop-b"), { state: "cyclic" });
  assert.equal(verdict.cyclicNodes, 2);
  assert.match(surfaceWalkVacuity(verdict).join(" "), /sit under a cycle/);
});

test("an-unknown-id-is-absent: a story id or a CLI token is not an unlinked artifact", () => {
  const verdict = verdictOf([row("known", { dependsOn: ["asset:also-known"] }), row("also-known")]);

  // Filing a non-artifact under `unlinked` would blame the corpus for ids it was never asked to hold
  // — 96 of 402 distinct visited ids on this machine's trace index were exactly that.
  assert.deepEqual(surfaceDepthOf(verdict, "studio"), { state: "absent" });
  assert.deepEqual(surfaceDepthOf(verdict, "library artifact"), { state: "absent" });
});

test("vacuity-names-a-blind-reader: a big corpus with no resolvable edge is not a flat corpus", () => {
  const rows = Array.from({ length: 120 }, (unused, index) =>
    // Every pointer names a repository file, which is bedrock: nothing resolves, so nothing links.
    row(`row-${index}`, { dependsOn: ["doc:some/other/file.md"] }),
  );
  const verdict = verdictOf(rows);

  assert.equal(verdict.edgesScanned, 0);
  assert.equal(verdict.placed, 0);
  assert.match(surfaceWalkVacuity(verdict).join(" "), /the reader is blind/);
});

test("vacuity-is-empty-on-a-healthy-read: the diagnostic does not cry wolf over an ordinary corpus", () => {
  const verdict = verdictOf([
    row("a", { dependsOn: ["asset:b"] }),
    row("b", { dependsOn: ["asset:c"] }),
    row("c"),
    row("unlinked-and-fine"),
  ]);

  assert.deepEqual(surfaceWalkVacuity(verdict), []);
});

test("an-empty-corpus-says-so: zero nodes is never rendered as a measured flat graph", () => {
  const verdict = verdictOf([]);

  assert.equal(verdict.nodesScanned, 0);
  assert.equal(verdict.maxDepth, 0);
  assert.equal(verdict.deepestId, null);
  assert.match(surfaceWalkVacuity(verdict).join(" "), /the corpus was not read/);
});

test("the-histogram-is-the-placed-distribution: unlinked rows appear in no bucket", () => {
  const verdict = verdictOf([
    row("top", { dependsOn: ["asset:mid"] }),
    row("mid", { dependsOn: ["asset:low"] }),
    row("low"),
    row("floater-one"),
    row("floater-two"),
  ]);

  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 1 },
    { depth: 1, count: 1 },
    { depth: 2, count: 1 },
  ]);
  const placed = verdict.histogram.reduce((total, bucket) => total + bucket.count, 0);
  assert.equal(placed, verdict.placed);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CASES `check:mutation-diff` NAMED. Each block below exists because a mutant of the line it
// covers SURVIVED the first version of this file — i.e. the behaviour was real but unpinned, and a
// later edit could have removed it in silence. They are grouped by what they protect, not by line.

test("kind-of-doc-is-total: kind wins over category, and anything unusable reads as the empty kind", () => {
  assert.equal(kindOfDoc({ kind: "pattern" }), "pattern");
  assert.equal(kindOfDoc({ category: "increment" }), "increment");
  // `kind` is the row's own field and wins; `category` is the wire's name for the same thing.
  assert.equal(kindOfDoc({ kind: "pattern", category: "increment" }), "pattern");
  // TOTAL over untrusted input — a read-side projection is not where a surprise row throws.
  assert.equal(kindOfDoc(null), "");
  assert.equal(kindOfDoc(undefined), "");
  assert.equal(kindOfDoc({}), "");
  assert.equal(kindOfDoc({ kind: 7 }), "");
  assert.equal(kindOfDoc("not-an-object"), "");
});

test("an-unusable-kind-lands-on-the-knowledge-side: it never silently improves the score", () => {
  const verdict = evaluateSurfaceDepth(
    nodesOf([
      { id: "a", doc: { dependsOn: ["asset:b"] } }, // no kind at all
      { id: "b", doc: { kind: 42 } }, // a kind this reader cannot use
    ]),
  );
  // Both fall to the KNOWLEDGE denominator. Falling to the record side would let an unreadable row
  // quietly leave the population the panel divides by.
  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.recordScanned, 0);
});

test("every-record-kind-is-excluded: the list is asserted member by member, not in aggregate", () => {
  // An aggregate count passes if the SET is right and any one member is wrong. This walks it.
  for (const kind of RECORD_KINDS) {
    const verdict = verdictOf([
      row("record-row", { kind, dependsOn: ["asset:knowledge-row"] }),
      row("knowledge-row", { kind: "definition" }),
    ]);
    assert.equal(verdict.recordScanned, 1, `${kind} should be a record tier`);
    assert.equal(verdict.knowledgeScanned, 1, `${kind} should not count as knowledge`);
    // Excluded from the denominator, still walked: the edge is real and gives its target a depth.
    assert.equal(verdict.recordLinked, 1, `${kind} should still be walked`);
    assert.deepEqual(surfaceDepthOf(verdict, "knowledge-row"), { state: "placed", depth: 1 });
  }
});

test("a-decision-node-counts-as-knowledge-whatever-its-twin-said", () => {
  const verdict = evaluateSurfaceDepth(
    // The twin row is deliberately mislabelled a record kind. The decision is still knowledge: the
    // node that survives the collapse is a DECISION, and `adr` is a knowledge tier.
    nodesOf([{ id: "adr-0007", doc: { kind: "increment" } }]),
    decisionSupportResolver([{ number: 7, dependsOn: [] }]),
  );
  assert.equal(verdict.knowledgeScanned, 1);
  assert.equal(verdict.recordScanned, 0);
});

test("edges-are-counted-and-a-target-outside-the-node-set-is-not", () => {
  const verdict = verdictOf([
    row("a", { dependsOn: ["asset:b", "asset:nowhere"] }),
    row("b", { dependsOn: ["asset:c"] }),
    row("c"),
  ]);
  // TWO edges, not three: `asset:nowhere` names no node, so it is not walked and not counted.
  // Asserting a POSITIVE count is what stops the counter being removed or inverted in silence.
  assert.equal(verdict.edgesScanned, 2);
  assert.equal(verdict.placed, 3);
  assert.deepEqual(surfaceDepthOf(verdict, "nowhere"), { state: "absent" });
});

test("the-collapse-drops-a-self-edge-and-deduplicates: a twin pointing at its own decision is not a hop", () => {
  const verdict = evaluateSurfaceDepth(
    nodesOf([
      // The twin points AT ITS OWN DECISION. After collapsing, that is a self-edge.
      { id: "adr-0005", doc: { kind: "adr", dependsOn: ["doc:decisions/0005-self.md"] } },
      // And two pointers at the same decision, one through each live spelling: ONE edge, not two.
      { id: "guidance", doc: { kind: "principle", dependsOn: ["asset:adr-0005", "doc:decisions/0005-self.md"] } },
    ]),
    decisionSupportResolver([{ number: 5, dependsOn: [] }]),
  );
  // Without the self-edge drop, `decision:0005` points at itself, its own indegree is 1, and it is
  // neither a surface nor reachable — the whole chain disappears into a phantom cycle.
  assert.equal(verdict.cyclicNodes, 0);
  assert.equal(verdict.edgesScanned, 1);
  assert.deepEqual(surfaceDepthOf(verdict, "guidance"), { state: "placed", depth: 0 });
  assert.deepEqual(surfaceDepthOf(verdict, "adr-0005"), { state: "placed", depth: 1 });
});

test("a-duplicate-row-does-not-relabel-the-node: first id wins, matching the graph builder", () => {
  const verdict = evaluateSurfaceDepth([
    { id: "dup", kind: "definition", dependsOn: ["asset:target"], cites: [], manifest: []  },
    // A second row for the same id, claiming a record kind. The graph was built from the first.
    { id: "dup", kind: "increment", dependsOn: [], cites: [], manifest: []  },
    { id: "target", kind: "definition", dependsOn: [], cites: [], manifest: []  },
  ]);
  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.recordScanned, 0);
});

test("the-collapse-only-fires-for-a-decision-the-resolver-HOLDS", () => {
  const verdict = evaluateSurfaceDepth(
    nodesOf([
      row("adr-0404", { kind: "adr", dependsOn: ["asset:plain"] }),
      row("plain", { kind: "principle" }),
    ]),
    // The resolver holds a DIFFERENT decision. `adr-0404` has a well-formed decision id and is still
    // not collapsed, because no `decision:0404` node exists to collapse it onto.
    decisionSupportResolver([{ number: 1, dependsOn: [] }]),
  );
  assert.equal(verdict.canonicalIds.size, 0);
  assert.deepEqual(surfaceDepthOf(verdict, "adr-0404"), { state: "placed", depth: 0 });
  // And an id that is not decision-shaped is never a collapse candidate at all.
  const notADecision = verdictOf([
    row("adr-health-notes", { dependsOn: ["asset:plain"] }),
    row("plain"),
  ]);
  assert.equal(notADecision.canonicalIds.size, 0);
});

test("surface-decisions-counts-only-the-decisions-among-the-surfaces", () => {
  const verdict = evaluateSurfaceDepth(
    nodesOf([
      row("an-artifact-surface", { dependsOn: ["asset:floor"] }),
      row("floor"),
      row("adr-0011", { kind: "adr", dependsOn: ["doc:decisions/0012-x.md"] }),
      row("adr-0012", { kind: "adr" }),
    ]),
    decisionSupportResolver([
      { number: 11, dependsOn: ["doc:decisions/0012-x.md"] },
      { number: 12, dependsOn: [] },
    ]),
  );
  // TWO surfaces, ONE of them a decision. Dropping the filter reports 2 and reads as "every opening
  // is a decision", which is the claim the owner's model turns on.
  assert.equal(verdict.surfaces, 2);
  assert.equal(verdict.surfaceDecisions, 1);
});

test("the-histogram-is-SORTED-ascending-however-the-depths-were-discovered", () => {
  // The deep chain is authored FIRST, so depth 3 is recorded before depth 1. An unsorted histogram
  // passes every count assertion and prints the buckets in discovery order.
  const verdict = verdictOf([
    row("deep-top", { dependsOn: ["asset:deep-mid"] }),
    row("deep-mid", { dependsOn: ["asset:deep-low"] }),
    row("deep-low", { dependsOn: ["asset:deep-floor"] }),
    row("deep-floor"),
    row("shallow-top", { dependsOn: ["asset:shallow-floor"] }),
    row("shallow-floor"),
  ]);
  assert.deepEqual(
    verdict.histogram.map((bucket) => bucket.depth),
    [0, 1, 2, 3],
  );
  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 2 },
    { depth: 1, count: 2 },
    { depth: 2, count: 1 },
    { depth: 3, count: 1 },
  ]);
});

test("vacuity-blindness-fires-AT-the-floor-and-not-below-it", () => {
  const blind = (count: number): readonly string[] =>
    surfaceWalkVacuity(
      verdictOf(
        Array.from({ length: count }, (unused, index) =>
          row(`row-${index}`, { dependsOn: ["doc:some/other/file.md"] }),
        ),
      ),
    );
  // BELOW the floor a corpus with no resolvable edge is an ordinary small corpus, not a blind read.
  assert.deepEqual(blind(VACUOUS_SURFACE_WALK_FLOOR - 1), []);
  // AT the floor it is a finding. `>` rather than `>=` here would move the boundary by one silently.
  assert.match(blind(VACUOUS_SURFACE_WALK_FLOOR).join(" "), /the reader is blind/);
});

test("vacuity-names-an-all-cycle-graph: edges resolved but nothing has indegree 0", () => {
  // EVERY node is in the cycle, so there is no surface at all — the one shape that reaches this
  // branch. It is unreachable over an acyclic graph, which is why nothing else covers it.
  const verdict = verdictOf([
    row("a", { dependsOn: ["asset:b"] }),
    row("b", { dependsOn: ["asset:a"] }),
  ]);
  assert.equal(verdict.surfaces, 0);
  assert.equal(verdict.edgesScanned, 2);
  assert.equal(verdict.placed, 0);
  const reasons = surfaceWalkVacuity(verdict).join(" ");
  assert.match(reasons, /no node has indegree 0/);
  assert.match(reasons, /every node is in a cycle or the adjacency is wrong/);
  // And the cycle reason travels with it — two different things went wrong and both are named.
  assert.match(reasons, /sit under a cycle/);
});

test("an-unlinked-node-is-never-swept-into-the-cyclic-population", () => {
  const verdict = verdictOf([
    row("cycle-a", { dependsOn: ["asset:cycle-b"] }),
    row("cycle-b", { dependsOn: ["asset:cycle-a"] }),
    row("floating"),
  ]);
  // `floating` has no inbound edge left unconsumed because it has none at all. Sweeping it into
  // `cyclic` would report a dependency cycle above an artifact with no dependencies.
  assert.deepEqual(surfaceDepthOf(verdict, "floating"), { state: "unlinked" });
  assert.equal(verdict.cyclicNodes, 2);
  assert.equal(verdict.unlinked, 1);
});

test("the-histogram-is-sorted-even-when-DISCOVERY-order-is-not: the diamond is the case", () => {
  // `depthById` records a node the FIRST time it is relaxed, not at its final depth — so on a
  // diamond `bottom` is inserted at 2 (from the short side) and later raised to 3. Iterating the
  // map therefore yields depths 0, 1, 3, 2, and an UNSORTED histogram prints them in that order
  // while every count assertion still passes. This is the shape that makes the sort observable.
  const verdict = verdictOf([
    row("top", { dependsOn: ["asset:quick", "asset:slow-a"] }),
    row("quick", { dependsOn: ["asset:bottom"] }),
    row("slow-a", { dependsOn: ["asset:slow-b"] }),
    row("slow-b", { dependsOn: ["asset:bottom"] }),
    row("bottom"),
  ]);
  assert.deepEqual([...verdict.depthById.values()], [0, 1, 1, 3, 2], "discovery order is not sorted");
  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 1 },
    { depth: 1, count: 2 },
    { depth: 2, count: 1 },
    { depth: 3, count: 1 },
  ]);
});

test("the-deepest-witness-breaks-ties-toward-the-FIRST-id-seen: it is stable run to run", () => {
  // Two nodes at the same maximum depth. Whichever is named must not depend on iteration luck, or
  // the same corpus reports a different witness on two runs and nobody can reproduce a reading.
  const verdict = verdictOf([
    row("top", { dependsOn: ["asset:first-floor", "asset:second-floor"] }),
    row("first-floor"),
    row("second-floor"),
  ]);
  assert.equal(verdict.maxDepth, 1);
  assert.equal(verdict.deepestId, "first-floor");
});

test("knowledge-linked-counts-only-the-PLACED-knowledge: an unlinked one is scanned, not linked", () => {
  const verdict = verdictOf([
    row("opening", { kind: "pattern", dependsOn: ["asset:floor"] }),
    row("floor", { kind: "definition" }),
    row("floating", { kind: "principle" }),
  ]);
  // 3 scanned, 2 linked. Counting every scanned node as linked reports a fully-wired corpus, which
  // is the number the panel prints and the one it would be most damaging to overstate.
  assert.equal(verdict.knowledgeScanned, 3);
  assert.equal(verdict.knowledgeLinked, 2);
});

test("vacuity-does-NOT-cry-blind-over-a-large-corpus-that-does-have-edges", () => {
  // Above the floor AND wired. The blindness reason must turn on the edge count, not on size —
  // firing here would red the honest case, which is the failure mode that gets a rung disabled.
  const rows = [
    row("opening", { dependsOn: ["asset:floor"] }),
    row("floor"),
    ...Array.from({ length: VACUOUS_SURFACE_WALK_FLOOR, }, (unused, index) => row(`spare-${index}`)),
  ];
  const verdict = verdictOf(rows);
  assert.ok(verdict.nodesScanned > VACUOUS_SURFACE_WALK_FLOOR);
  assert.equal(verdict.edgesScanned, 1);
  assert.deepEqual(surfaceWalkVacuity(verdict), []);
});

test("the-vacuity-reasons-say-what-to-suspect, not merely that something is wrong", () => {
  // The whole point of a reason string is the remedy it names. Asserted in full because an empty
  // second half still matches a loose regex on the first, and reads as a complete finding.
  const blind = surfaceWalkVacuity(
    verdictOf(
      Array.from({ length: VACUOUS_SURFACE_WALK_FLOOR }, (unused, index) =>
        row(`row-${index}`, { dependsOn: ["doc:some/other/file.md"] }),
      ),
    ),
  ).join(" ");
  assert.match(blind, /nodes carried 0 resolvable edges between them/);
  assert.match(blind, /the reader is blind, not the corpus flat/);
  assert.match(blind, /suspect a pointer-spelling regression in `decision-pointer\.ts`/);

  const cyclic = surfaceWalkVacuity(
    verdictOf([row("a", { dependsOn: ["asset:b"] }), row("b", { dependsOn: ["asset:a"] })]),
  ).join(" ");
  assert.match(cyclic, /sit under a cycle and have no longest chain/);
  assert.match(cyclic, /`probe:combined-dag` proves this graph acyclic, so this is a regression/);
});

test("a-duplicate-id-is-classified-once, from the FIRST row the walk was built from", () => {
  const verdict = evaluateSurfaceDepth([
    { id: "dup", kind: "definition", dependsOn: ["asset:target"], cites: [], manifest: []  },
    { id: "dup", kind: "increment", dependsOn: [], cites: [], manifest: []  },
    { id: "target", kind: "definition", dependsOn: [], cites: [], manifest: []  },
  ]);
  // Taking the LAST row's kind would move `dup` to the record tier and shrink the denominator the
  // panel prints — silently, since both readings are internally consistent.
  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.recordScanned, 0);
});

test("a-node-whose-kind-is-EMPTY-lands-on-the-knowledge-side", () => {
  // `""` is what `kindOfDoc` returns for a row declaring no usable kind, and it is a real value the
  // walk receives rather than a missing field. It must not fall to the record side.
  const verdict = evaluateSurfaceDepth([
    { id: "no-kind-declared", kind: "", dependsOn: ["asset:target"], cites: [], manifest: []  },
    { id: "target", kind: "definition", dependsOn: [], cites: [], manifest: []  },
  ]);
  assert.equal(verdict.knowledgeScanned, 2);
  assert.equal(verdict.recordScanned, 0);
  assert.equal(verdict.knowledgeLinked, 2);
});

test("a-SINK-carries-no-edges: the edge count is exact, not merely non-zero", () => {
  // Three nodes, two of them sinks, and exactly two edges. An adjacency that gave every node a
  // phantom target would inflate this — which is the shape a fallback for the sinks invites.
  const verdict = verdictOf([
    row("opening", { dependsOn: ["asset:sink-one", "asset:sink-two"] }),
    row("sink-one"),
    row("sink-two"),
  ]);
  assert.equal(verdict.edgesScanned, 2);
  assert.equal(verdict.surfaces, 1);
  assert.equal(verdict.placed, 3);
  assert.equal(verdict.maxDepth, 1);
});

test("a-node-is-processed-only-AFTER-every-predecessor: an early admission shortens what is below it", () => {
  //   top ──> quick ─────────────┐
  //    └───> slow-a ─> slow-b ─> bottom ──> sink
  //
  // `bottom` is REACHED from the short side first. If it were admitted to the queue then — rather
  // than once its last inbound edge is consumed — it would propagate depth 2 to `sink` and never be
  // revisited, so `sink` would read 3 instead of 4. The diamond alone cannot catch this, because
  // `bottom` has nothing below it to carry the error into.
  const verdict = verdictOf([
    row("top", { dependsOn: ["asset:quick", "asset:slow-a"] }),
    row("quick", { dependsOn: ["asset:bottom"] }),
    row("slow-a", { dependsOn: ["asset:slow-b"] }),
    row("slow-b", { dependsOn: ["asset:bottom"] }),
    row("bottom", { dependsOn: ["asset:sink"] }),
    row("sink"),
  ]);
  assert.deepEqual(surfaceDepthOf(verdict, "bottom"), { state: "placed", depth: 3 });
  assert.deepEqual(surfaceDepthOf(verdict, "sink"), { state: "placed", depth: 4 });
  assert.equal(verdict.maxDepth, 4);
});

test("nothing-is-admitted-to-the-queue-twice: the walk terminates and each node is placed once", () => {
  // A node with several inbound edges reaches `left === 0` once, and the bound holds even if that
  // ever stopped being true. Counting the placed nodes is what would catch a double admission.
  const verdict = verdictOf([
    row("one", { dependsOn: ["asset:shared"] }),
    row("two", { dependsOn: ["asset:shared"] }),
    row("three", { dependsOn: ["asset:shared"] }),
    row("shared", { dependsOn: ["asset:below"] }),
    row("below"),
  ]);
  assert.equal(verdict.placed, 5);
  assert.equal(verdict.histogram.reduce((total, bucket) => total + bucket.count, 0), 5);
  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 3 },
    { depth: 1, count: 1 },
    { depth: 2, count: 1 },
  ]);
});

// ── THE AGENT MANIFEST (ADR-0481 D1) ─────────────────────────────────────────────────────────────
//
// This is the reading the manifest edge moves MOST: an artifact an agent injects stops being
// `unlinked` and the agent becomes a surface. Ten artifacts this walk reported `unlinked` on
// 2026-08-29 — including all five anti-slop guardrails and `register-follows-audience` — were
// reached by the system's single most reliable delivery path the whole time.

test("manifest-edge-un-orphans-what-an-agent-injects: `unlinked` becomes placed, and the agent is the surface", () => {
  const verdict = verdictOf([
    row("the-agent", { kind: "agent", rules: ["asset:a-guardrail"] }),
    row("a-guardrail", { kind: "guardrail" }),
  ]);

  // Before the manifest was read, BOTH rows were unlinked — the agent pointed at nothing the walk
  // could see, so it was not a surface either, and "nothing was measured" was reported over a pair
  // the corpus genuinely connects.
  assert.equal(verdict.unlinked, 0);
  assert.equal(verdict.surfaces, 1);
  assert.deepEqual(surfaceDepthOf(verdict, "the-agent"), { state: "placed", depth: 0 });
  assert.deepEqual(surfaceDepthOf(verdict, "a-guardrail"), { state: "placed", depth: 1 });
  assert.equal(verdict.manifestEdges, 1);
  // Both are knowledge-tier kinds, so the denominator the panel prints moves with them.
  assert.equal(verdict.knowledgeLinked, 2);
});

test("manifest-edges-are-counted-apart-from-the-rest, so the shift stays attributable", () => {
  const verdict = verdictOf([
    row("the-agent", { kind: "agent", rules: ["asset:a-guardrail"], dependsOn: ["asset:a-principle"] }),
    row("a-guardrail", { kind: "guardrail" }),
    row("a-principle", { kind: "principle" }),
  ]);

  assert.equal(verdict.edgesScanned, 2);
  // Folding this into `edgesScanned` would make a reader unable to tell which half of a moved
  // denominator came from the manifest — and a 0 here over a corpus holding agents is the reader
  // going blind, which is a different fact from agents that inject nothing.
  assert.equal(verdict.manifestEdges, 1);
});
