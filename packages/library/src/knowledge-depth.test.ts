import test from "node:test";
import assert from "node:assert/strict";

import {
  depthFromWorkNodes,
  depthFromWorkOf,
  evaluateDepthFromWork,
  type DepthFromWorkSource,
} from "./knowledge-depth.js";
import { decisionSupportResolver } from "./decision-support-seam.js";

/**
 * ADR-0363 D2's read-only depth-from-work join, as a pure function over stored rows.
 *
 * Hermetic by construction — literal rows, no store, no credential (ADR-0302 D3). The live-corpus
 * reads are `apps/studio`'s render and the `probe:depth-from-work` diagnostic; neither decides
 * anything these tests do not.
 */

function row(
  id: string,
  fields: { dependsOn?: unknown; cites?: unknown } = {},
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
    row("ceremony", { dependsOn: ["asset:principle"] }),
    row("principle", { dependsOn: ["asset:bedrock-idea"] }),
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
    row("session-agent", { dependsOn: ["asset:ceremony"] }),
  ]);

  assert.equal(verdict.depthById.get("ceremony"), 1);
  assert.equal(depthFromWorkOf(verdict, "session-agent").state, "unreachable");
});

test("depth-from-work-takes-the-shortest-chain: several routes in, and the distance is the nearest one", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:near", "asset:long-way"] }),
    row("near", { dependsOn: ["asset:target"] }),
    row("long-way", { dependsOn: ["asset:middle"] }),
    row("middle", { dependsOn: ["asset:target"] }),
    row("target"),
  ]);

  // Reachable at 2 via `near` and at 3 via `long-way → middle`. Depth is "how far away", so the long
  // way round is not the distance.
  assert.equal(verdict.depthById.get("target"), 2);
});

test("depth-from-work-terminates-on-a-cycle: a ring keeps its first depth and is never re-queued", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:a"] }),
    row("a", { dependsOn: ["asset:b"] }),
    row("b", { dependsOn: ["asset:a"] }),
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
  const anchorless = verdictOf([row("a", { dependsOn: ["asset:b"] }), row("b")]);
  assert.equal(anchorless.artifactsScanned, 2);
  assert.equal(anchorless.anchors, 0);
  assert.equal(anchorless.reached, 0);
  assert.equal(anchorless.unreachable, 2);
  assert.equal(anchorless.edgesScanned, 1);
});

test("depth-from-work-counts-the-anchors-own-way-out: `asset:` cites are the seed's only outbound edge", () => {
  // Measured on the live corpus 2026-08-20: 0 of 42 anchors carry a literal `dependsOn`, so without
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
  // ADR-0223 D4: ADRs are tier 0 — not Library artifacts, carrying no `dependsOn` of their own.
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:principle"] }),
    row("principle", { dependsOn: ["doc:decisions/0363-the-knowledge-dag.md"] }),
  ]);

  assert.equal(verdict.bedrockTargets, 1);
  assert.equal(verdict.edgesScanned, 1);
  assert.equal(verdict.reached, 2);
  assert.equal(verdict.depthById.has("doc:decisions/0363-the-knowledge-dag.md"), false);
});

test("depth-from-work-counts-a-dangling-pointer: a target no artifact answers is reported, never dropped", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:gone"] }),
    row("present", { dependsOn: ["asset:also-gone"] }),
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
    { id: "wrong-types", doc: { dependsOn: "asset:a", cites: [42, null, "story:studio"] } },
    // An agent-shaped row whose manifest fields are the wrong types, for the same reason.
    { id: "odd-agent", doc: { kind: "agent", rules: 7, stepRefs: "not-a-list" } },
  ]);

  assert.deepEqual(nodes, [
    { id: "null-doc", dependsOn: [], cites: [], manifest: [] },
    { id: "string-doc", dependsOn: [], cites: [], manifest: [] },
    { id: "wrong-types", dependsOn: [], cites: ["story:studio"], manifest: [] },
    { id: "odd-agent", dependsOn: [], cites: [], manifest: [] },
  ]);
  assert.equal(evaluateDepthFromWork(nodes).anchors, 1);
});

test("depth-from-work-parses-through-parseCiteRef: an unprefixed or unknown-scheme pointer never resolves", () => {
  const verdict = verdictOf([
    row("anchor", { cites: ["story:studio", "asset:real"] }),
    // Bare ids and unknown schemes are what a hand-rolled `split(':')` would happily resolve.
    row("real", { dependsOn: ["real-target", "node:real-target", "asset:real-target"] }),
    row("real-target"),
  ]);

  assert.equal(verdict.depthById.get("real-target"), 2);
  // The bare id and the `node:` pointer are refused by parseCiteRef and counted as bedrock/noise —
  // not silently resolved onto `real-target` a second and third time.
  assert.equal(verdict.bedrockTargets, 2);
  assert.equal(verdict.edgesScanned, 2);
});

/**
 * A DECISION IS IN THE GRAPH TWICE ONCE ITS ROWS ARE IN HAND, AND ONLY ONE TWIN CARRIES ITS EDGES.
 *
 * Since ADR-0403 dec 1 a decision is an ordinary Library artifact, so any caller handing over a
 * corpus listing hands over `adr-NNNN` ROWS — while the walk mints `decision:NNNN` for the same
 * decision whenever a pointer resolves onto it. Both land in `knownIds`, and `decisionTarget` routes
 * every decision pointer to the `decision:` node, so the artifact twin is left with none of the
 * decision's support edges.
 *
 * Reading the twin therefore answered UNREACHABLE — "no authored chain reaches this" — about a
 * decision one hop from the work. That is the confident-wrong-answer shape, not a missing reading,
 * and it is what the studio's replay panel rendered for every ADR a session read
 * (`traversal-panel-arc`, increment `traversal-panel-draws-the-decision-depth`).
 */
function decisionRow(number: number, dependsOn?: readonly string[]): DepthFromWorkSource {
  const id = `adr-${String(number).padStart(4, "0")}`;
  return {
    id,
    doc: dependsOn === undefined ? { kind: "adr", id } : { kind: "adr", id, dependsOn },
  };
}

const DECISION_ROWS = [
  row("anchor", { cites: ["story:studio"], dependsOn: ["doc:decisions/0403-artifacts.md"] }),
  decisionRow(403, ["doc:decisions/0363-the-knowledge-dag.md"]),
  decisionRow(363),
] as const;

const DECISION_RESOLVER = decisionSupportResolver([
  { number: 403, dependsOn: ["doc:decisions/0363-the-knowledge-dag.md"] },
  { number: 363 },
]);

test("depth-from-work-reads-a-decision-through-its-artifact-twin: an `adr-NNNN` id answers with its DECISION's depth", () => {
  const verdict = evaluateDepthFromWork(depthFromWorkNodes(DECISION_ROWS), DECISION_RESOLVER);

  // The chain runs anchor(0) → ADR-0403(1) → ADR-0363(2), crossing the artifact/decision boundary
  // once and then running decision-to-decision — the shape the live corpus has.
  assert.deepEqual(depthFromWorkOf(verdict, "adr-0403"), { state: "reached", depth: 1 });
  assert.deepEqual(depthFromWorkOf(verdict, "adr-0363"), { state: "reached", depth: 2 });
  // The decision's own node id keeps answering identically — the twin is resolved ONTO it, never
  // instead of it.
  assert.deepEqual(depthFromWorkOf(verdict, "decision:0403"), { state: "reached", depth: 1 });
});

test("depth-from-work-reads-a-decision-through-its-artifact-twin: an unreached decision is UNREACHABLE, and one outside the log is ABSENT", () => {
  const verdict = evaluateDepthFromWork(
    depthFromWorkNodes([...DECISION_ROWS, decisionRow(9999)]),
    decisionSupportResolver([
      { number: 403, dependsOn: ["doc:decisions/0363-the-knowledge-dag.md"] },
      { number: 363 },
      { number: 9999 },
    ]),
  );

  // Held by the resolver, reached by nothing: unmeasured, and never rendered as "very deep".
  assert.deepEqual(depthFromWorkOf(verdict, "adr-9999"), { state: "unreachable" });
  // Not in the log at all: a fact about the id, not about the wiring. Collapsing these two is the bug.
  assert.deepEqual(depthFromWorkOf(verdict, "adr-0001"), { state: "absent" });
});

test("depth-from-work-reads-a-decision-through-its-artifact-twin: with no resolver the answer is byte-identical to the pre-ADR-0403 reading", () => {
  const verdict = evaluateDepthFromWork(depthFromWorkNodes(DECISION_ROWS));

  // THE FENCE. No resolver means no decision nodes exist, so the new branch cannot fire and the
  // `doc:` pointer is bedrock again — the twin is an ordinary unreached artifact row.
  assert.deepEqual(depthFromWorkOf(verdict, "adr-0403"), { state: "unreachable" });
  assert.deepEqual(depthFromWorkOf(verdict, "decision:0403"), { state: "absent" });
});

test("depth-from-work-reads-a-decision-through-its-artifact-twin: an id that merely begins `adr-` is not rounded to a decision", () => {
  const verdict = evaluateDepthFromWork(
    depthFromWorkNodes([...DECISION_ROWS, row("adr-health-notes")]),
    DECISION_RESOLVER,
  );

  // `adrNumberOfArtifactId` is strict about the four-digit shape precisely so this legal artifact id
  // reads as "not a decision" instead of resolving to NaN and answering for some other row.
  assert.deepEqual(depthFromWorkOf(verdict, "adr-health-notes"), { state: "unreachable" });
});

test("depth-from-work-carries-the-decision-blindness-denominator: 0 means blind OR unwired, never both silently", () => {
  // `decisionsCarryingDependsOn` is PRESENCE, not non-emptiness. It is the only thing separating a
  // reader that cannot see the support field from a decision log that has none — and on 2026-08-23
  // both were true at once, which is why a count that could not be quoted was worse than useless.
  const verdict = evaluateDepthFromWork(
    depthFromWorkNodes([
      { id: "inc", doc: { kind: "increment", cites: ["story:studio", "asset:adr-0403"] } },
    ]),
    decisionSupportResolver([
      { number: 403, dependsOn: ["doc:decisions/0363-x.md"] },
      { number: 363, dependsOn: [] },
      { number: 1 }, // no field at all — present-ness is what is counted
    ]),
  );
  assert.equal(verdict.decisionsScanned, 3);
  assert.equal(verdict.decisionsCarryingDependsOn, 2);
});

// ── THE AGENT MANIFEST (ADR-0481 D1) ─────────────────────────────────────────────────────────────
//
// The edge source no walk read until 2026-08-30, while 116 artifacts were being assembled into an
// agent's system prompt on every run of that agent. These four pin the edge, its direction, its
// effect on the SEED, and its dangling case — the last three being the ways admitting it could have
// gone wrong quietly.

/** An `agent` row carrying a manifest, shaped as the raw store holds one. */
function agentRow(
  id: string,
  fields: { context?: string[]; rules?: string[]; antiPatterns?: string[]; cites?: unknown },
): DepthFromWorkSource {
  return { id, doc: { kind: "agent", id, ...fields } };
}

test("manifest-edge-is-walked: an artifact an agent INJECTS is reached through the agent", () => {
  const verdict = verdictOf([
    // The anchor names a work unit and stands on the agent.
    row("an-increment", { cites: ["story:studio", "asset:the-agent"] }),
    agentRow("the-agent", { rules: ["asset:a-guardrail"] }),
    row("a-guardrail"),
  ]);

  assert.equal(verdict.depthById.get("an-increment"), 0);
  assert.equal(verdict.depthById.get("the-agent"), 1);
  // THE ASSERTION THIS EXISTS FOR. Before the manifest was read this was `undefined` — the guardrail
  // was an orphan the graph could not see, while the agent injected it on every run.
  assert.equal(verdict.depthById.get("a-guardrail"), 2);
  assert.equal(verdict.manifestEdges, 1);
  assert.equal(verdict.manifestDanglingTargets, 0);
});

test("manifest-does-not-anchor: injecting artifacts never puts an agent in the SEED", () => {
  // The seed is `cites` naming a `story:`/`capability:` and nothing else. An agent that injects a
  // hundred artifacts and names no work unit is a STEP on the walk, never a starting point — the
  // same rule an `asset:` cite already obeys. Widening the seed here would put the whole agent tier
  // at depth 0 and flatten the axis, which is the failure mode with the largest silent blast radius.
  const verdict = verdictOf([
    agentRow("the-agent", { rules: ["asset:a-guardrail"] }),
    row("a-guardrail"),
  ]);

  assert.equal(verdict.anchors, 0);
  assert.equal(verdict.reached, 0);
  // The edge was still RESOLVED — it is the seed that did not move, not the reader that went blind.
  assert.equal(verdict.manifestEdges, 1);
});

test("manifest-runs-down-tier-only: the injected artifact never reaches back up to the agent", () => {
  // ADR-0363's direction argument, applied to this edge. `dependsOn` points from the stander to the
  // stood-on and an agent standing on a guardrail points the same way. A reader that also walked it
  // in REVERSE would let a work-touching guardrail hand the agent a depth — making the surface layer
  // an operator meets first read as DEEPER than the work, which inverts the health signal.
  const verdict = verdictOf([
    row("an-increment", { cites: ["story:studio", "asset:a-guardrail"] }),
    row("a-guardrail"),
    agentRow("the-agent", { rules: ["asset:a-guardrail"] }),
  ]);

  assert.equal(verdict.depthById.get("a-guardrail"), 1);
  assert.equal(verdict.depthById.has("the-agent"), false);
  assert.deepEqual(depthFromWorkOf(verdict, "the-agent"), { state: "unreachable" });
});

test("manifest-dangling-target-is-counted, never walked and never silently dropped", () => {
  const verdict = verdictOf([
    row("an-increment", { cites: ["story:studio", "asset:the-agent"] }),
    agentRow("the-agent", { rules: ["asset:a-guardrail", "asset:never-written"] }),
    row("a-guardrail"),
  ]);

  assert.equal(verdict.manifestEdges, 1);
  assert.equal(verdict.manifestDanglingTargets, 1);
  // A dangling manifest pointer is NOT an artifact dangling target: the two are counted apart so a
  // reader can tell an unwritten guardrail from a broken `dependsOn`.
  assert.equal(verdict.danglingTargets, 0);
});
