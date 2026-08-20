import test from "node:test";
import assert from "node:assert/strict";

import {
  depthFromWorkNodes,
  depthFromWorkOf,
  evaluateDepthFromWork,
  type DepthFromWorkSource,
} from "./knowledge-depth.js";

/**
 * ADR-0363 D2's read-only depth-from-work join, as a pure function over stored rows.
 *
 * Hermetic by construction — literal rows, no store, no credential (ADR-0302 D3). The live-corpus
 * reads are `apps/studio`'s render and the `probe:depth-from-work` diagnostic; neither decides
 * anything these tests do not.
 */

function row(
  id: string,
  fields: { standsOn?: unknown; cites?: unknown } = {},
): DepthFromWorkSource {
  return { id, doc: { kind: "principle", id, ...fields } };
}

function verdictOf(rows: readonly DepthFromWorkSource[]): ReturnType<typeof evaluateDepthFromWork> {
  return evaluateDepthFromWork(depthFromWorkNodes(rows));
}

test("depth-from-work-seeds-on-work-pointers-only: a `story:`/`capability:` cite anchors, an `asset:` cite does not", () => {
  const verdict = verdictOf([
    row("touches-a-story", { cites: ["story:studio"] }),
    row("touches-a-capability", { cites: ["capability:library-dag-canvas"] }),
    // Cites guidance but names no work unit: it is a STEP on the walk, never a starting point.
    row("cites-guidance-only", { cites: ["asset:touches-a-story"] }),
    row("cites-nothing"),
  ]);

  assert.equal(verdict.anchors, 2);
  assert.equal(verdict.depthById.get("touches-a-story"), 0);
  assert.equal(verdict.depthById.get("touches-a-capability"), 0);
  // Anchoring on an `asset:` cite would put the whole guidance tier at depth 0 and flatten the axis.
  assert.equal(verdict.depthById.has("cites-guidance-only"), false);
  assert.equal(verdict.depthById.has("cites-nothing"), false);
});

test("depth-from-work-walks-standson-down-tier: each authored hop away from the work is one level deeper", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:ceremony"] }),
    row("ceremony", { standsOn: ["asset:principle"] }),
    row("principle", { standsOn: ["asset:bedrock-idea"] }),
    row("bedrock-idea"),
  ]);

  assert.equal(verdict.depthById.get("anchor"), 0);
  assert.equal(verdict.depthById.get("ceremony"), 1);
  assert.equal(verdict.depthById.get("principle"), 2);
  assert.equal(verdict.depthById.get("bedrock-idea"), 3);
  assert.equal(verdict.maxDepth, 3);
  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 1 },
    { depth: 1, count: 1 },
    { depth: 2, count: 1 },
    { depth: 3, count: 1 },
  ]);
});

test("depth-from-work-never-walks-standson-in-reverse: a stander on a reached artifact is NOT two steps deep", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:ceremony"] }),
    row("ceremony"),
    // `session-agent` STANDS ON the ceremony — it is the surface layer an operator meets first, not a
    // foundation the agent had to dig for. Walking the edge in reverse would render it "deeper than
    // the work", inverting the very signal the depth exists to give.
    row("session-agent", { standsOn: ["asset:ceremony"] }),
  ]);

  assert.equal(verdict.depthById.get("ceremony"), 1);
  assert.equal(depthFromWorkOf(verdict, "session-agent").state, "unreachable");
});

test("depth-from-work-takes-the-shortest-chain: several routes in, and the distance is the nearest one", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:near", "asset:long-way"] }),
    row("near", { standsOn: ["asset:target"] }),
    row("long-way", { standsOn: ["asset:middle"] }),
    row("middle", { standsOn: ["asset:target"] }),
    row("target"),
  ]);

  // Reachable at 2 via `near` and at 3 via `long-way → middle`. Depth is "how far away", so the long
  // way round is not the distance.
  assert.equal(verdict.depthById.get("target"), 2);
});

test("depth-from-work-terminates-on-a-cycle: a ring keeps its first depth and is never re-queued", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:a"] }),
    row("a", { standsOn: ["asset:b"] }),
    row("b", { standsOn: ["asset:a"] }),
  ]);

  assert.equal(verdict.depthById.get("a"), 1);
  assert.equal(verdict.depthById.get("b"), 2);
  assert.equal(verdict.reached, 3);
});

test("depth-from-work-keeps-unreachable-apart-from-deep: the two must never read alike", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:reached"] }),
    row("reached"),
    row("orphan"),
  ]);

  assert.deepEqual(depthFromWorkOf(verdict, "reached"), { state: "reached", depth: 1 });
  // NOT `{ depth: Infinity }`, NOT a large number: an artifact no chain connects to the work was not
  // measured at all, and rendering that as "very deep" reports the opposite of the health signal.
  assert.deepEqual(depthFromWorkOf(verdict, "orphan"), { state: "unreachable" });
  // A third state again: a nodeId that is not a Library artifact (a story id, a retired artifact).
  assert.deepEqual(depthFromWorkOf(verdict, "forest-world"), { state: "absent" });

  assert.equal(verdict.reached, 2);
  assert.equal(verdict.unreachable, 1);
  assert.equal(verdict.artifactsScanned, 3);
});

test("depth-from-work-reports-its-denominators: nothing-was-deep and nothing-was-measured cannot print the same", () => {
  const empty = evaluateDepthFromWork([]);
  assert.equal(empty.artifactsScanned, 0);
  assert.equal(empty.anchors, 0);
  assert.equal(empty.reached, 0);
  assert.equal(empty.unreachable, 0);
  assert.deepEqual(empty.histogram, []);

  // A corpus that WAS read and holds no anchor: same zero reached, and every other number differs.
  const anchorless = verdictOf([row("a", { standsOn: ["asset:b"] }), row("b")]);
  assert.equal(anchorless.artifactsScanned, 2);
  assert.equal(anchorless.anchors, 0);
  assert.equal(anchorless.reached, 0);
  assert.equal(anchorless.unreachable, 2);
  assert.equal(anchorless.edgesScanned, 1);
});

test("depth-from-work-counts-the-anchors-own-way-out: `asset:` cites are the seed's only outbound edge", () => {
  // Measured on the live corpus 2026-08-20: 0 of 42 anchors carry a literal `standsOn`, so without
  // this the walk cannot move — 42 reached, all at depth 0, forever.
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "capability:library-dag-canvas", "asset:guidance"] }),
    row("guidance"),
  ]);

  assert.equal(verdict.anchors, 1);
  assert.equal(verdict.anchorEdges, 1);
  assert.equal(verdict.depthById.get("guidance"), 1);
});

test("depth-from-work-treats-a-doc-target-as-bedrock: an ADR pointer is a sink, counted not walked", () => {
  // ADR-0223 D4: ADRs are tier 0 — not Library artifacts, carrying no `standsOn` of their own.
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:principle"] }),
    row("principle", { standsOn: ["doc:decisions/0363-the-knowledge-dag.md"] }),
  ]);

  assert.equal(verdict.bedrockTargets, 1);
  assert.equal(verdict.edgesScanned, 1);
  assert.equal(verdict.reached, 2);
  assert.equal(verdict.depthById.has("doc:decisions/0363-the-knowledge-dag.md"), false);
});

test("depth-from-work-counts-a-dangling-pointer: a target no artifact answers is reported, never dropped", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:gone"] }),
    row("present", { standsOn: ["asset:also-gone"] }),
  ]);

  assert.equal(verdict.danglingTargets, 2);
  assert.equal(verdict.edgesScanned, 0);
  assert.equal(verdict.reached, 1);
});

test("depth-from-work-projects-defensively: a row shaped by another branch's schema contributes no edges", () => {
  // The read side of a live-corpus projection must not be where a surprise row takes a surface down.
  const nodes = depthFromWorkNodes([
    { id: "null-doc", doc: null },
    { id: "string-doc", doc: "not an object" },
    { id: "wrong-types", doc: { standsOn: "asset:a", cites: [42, null, "story:studio"] } },
  ]);

  assert.deepEqual(nodes, [
    { id: "null-doc", standsOn: [], cites: [] },
    { id: "string-doc", standsOn: [], cites: [] },
    { id: "wrong-types", standsOn: [], cites: ["story:studio"] },
  ]);
  assert.equal(evaluateDepthFromWork(nodes).anchors, 1);
});

test("depth-from-work-parses-through-parseCiteRef: an unprefixed or unknown-scheme pointer never resolves", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:real"] }),
    // Bare ids and unknown schemes are what a hand-rolled `split(':')` would happily resolve.
    row("real", { standsOn: ["real-target", "node:real-target", "asset:real-target"] }),
    row("real-target"),
  ]);

  assert.equal(verdict.depthById.get("real-target"), 2);
  // The bare id and the `node:` pointer are refused by parseCiteRef and counted as bedrock/noise —
  // not silently resolved onto `real-target` a second and third time.
  assert.equal(verdict.bedrockTargets, 2);
  assert.equal(verdict.edgesScanned, 2);
});
