import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateSurfaceDepth,
  surfaceDepthNodes,
  surfaceDepthOf,
  surfaceWalkVacuity,
  type SurfaceDepthVerdict,
} from "./surface-depth.js";
import { decisionSupportResolver } from "./decision-support-seam.js";
import { type DepthFromWorkSource } from "./knowledge-depth.js";

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
  fields: { dependsOn?: unknown; cites?: unknown; kind?: string } = {},
): DepthFromWorkSource {
  const { kind = "principle", ...rest } = fields;
  return { id, doc: { kind, id, ...rest } };
}

function verdictOf(rows: readonly DepthFromWorkSource[]): SurfaceDepthVerdict {
  return evaluateSurfaceDepth(surfaceDepthNodes(rows));
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
    surfaceDepthNodes(rows),
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
    surfaceDepthNodes([row("adr-0009", { kind: "adr" }), row("adr-0008", { kind: "adr" })]),
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
