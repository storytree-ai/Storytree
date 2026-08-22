import assert from "node:assert/strict";
import test from "node:test";

import { decisionAmendsResolver } from "./decision-amends-seam.js";
import {
  decisionWalkVacuity,
  depthFromWorkNodes,
  depthFromWorkOf,
  evaluateDepthFromWork,
  VACUOUS_DECISION_WALK_FLOOR,
  type DepthFromWorkSource,
} from "./knowledge-depth.js";

/**
 * THE WALK CONTINUES PAST A DECISION (ADR-0403, `adrs-into-the-dag-arc-inc-09`).
 *
 * Kept apart from `knowledge-depth.test.ts`, which pins the pre-ADR-0403 SINK reading and must keep
 * passing unchanged — that file IS the fence's other half. Hermetic by construction: literal rows and
 * a literal decision list, no store, no filesystem, no credential (ADR-0302 D3). The seam is what
 * makes that possible — the walk takes a resolver and never learns that the live one reads files.
 */

function row(
  id: string,
  fields: { dependsOn?: unknown; cites?: unknown } = {},
): DepthFromWorkSource {
  return { id, doc: { kind: "principle", id, ...fields } };
}

/** A decision row as the seam reads it. `supersedes` is carried in order to prove it is IGNORED. */
function adr(
  decisionNumber: number,
  amends: readonly number[] = [],
  supersedes: readonly number[] = [],
) {
  return { number: decisionNumber, amends, supersedes };
}

function withDecisions(
  rows: readonly DepthFromWorkSource[],
  decisions: readonly { number: number; amends: readonly number[] }[],
): ReturnType<typeof evaluateDepthFromWork> {
  return evaluateDepthFromWork(depthFromWorkNodes(rows), decisionAmendsResolver(decisions));
}

test("depth-from-work-walks-past-a-decision-on-amends: a decision pointer is a hop, not a sink", () => {
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
    ],
    [adr(223, [139]), adr(139, [86]), adr(86)],
  );

  assert.equal(verdict.depthById.get("guidance"), 1);
  assert.equal(verdict.depthById.get("decision:0223"), 2);
  assert.equal(verdict.depthById.get("decision:0139"), 3);
  assert.equal(verdict.depthById.get("decision:0086"), 4);
  assert.equal(verdict.maxDepth, 4, "THE ONE NUMBER runs over both populations");
  assert.equal(verdict.maxArtifactDepth, 1, "and the artifact-only reading is kept apart");
  assert.equal(verdict.deepestId, "decision:0086");
  assert.equal(verdict.decisionEdges, 1, "the join");
  assert.equal(verdict.amendsEdges, 2);
  assert.equal(verdict.bedrockTargets, 0, "the decision pointer was WALKED, so it is not bedrock");
});

test("depth-from-work-without-a-resolver-is-the-pre-ADR-0403-sink-reading, unchanged", () => {
  // THE FENCE, AS AN ASSERTION. `traversal-panel-arc` is parked and its remaining owner LOOK is
  // fenced, so the studio must keep drawing the old number until that arc unparks. Passing no
  // resolver has to reproduce ADR-0223 D4 exactly — if this ever diverges, the panel changed
  // without anyone deciding that it should.
  const rows = [
    row("anchor", { cites: ["story:library", "asset:guidance"] }),
    row("guidance", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
  ];
  const sink = evaluateDepthFromWork(depthFromWorkNodes(rows));

  assert.equal(sink.maxDepth, 1);
  assert.equal(sink.maxArtifactDepth, 1);
  assert.equal(sink.bedrockTargets, 1, "every doc: pointer is bedrock again");
  assert.equal(sink.decisionEdges, 0);
  assert.equal(sink.decisionsScanned, 0);
  assert.equal(sink.decisionsReached, 0);
  assert.deepEqual(sink.decisionHistogram, []);
  assert.equal(sink.depthById.has("decision:0223"), false);
  assert.equal(sink.knownIds.has("decision:0223"), false);
});

test("depth-from-work-walks-both-pointer-spellings-past-a-decision: neither form is dropped", () => {
  // ADR-0403 dec 7. A walk resolving `doc:decisions/...` and not `doc:docs/decisions/...` drops 19
  // of the corpus's 390 crossing pointers and returns a confident, plausible, wrong number.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:bare", "asset:prefixed"] }),
      row("bare", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
      row("prefixed", { dependsOn: ["doc:docs/decisions/0139-a-title.md"] }),
    ],
    [adr(223), adr(139)],
  );

  assert.equal(verdict.decisionEdges, 2);
  assert.equal(verdict.depthById.get("decision:0223"), 2);
  assert.equal(verdict.depthById.get("decision:0139"), 2);
});

test("depth-from-work-never-walks-supersedes: the seam offers no door for it", () => {
  // `supersedes` means "this replaced that" — archaeology, never a distance from the work. The
  // exclusion is structural (`DecisionAmendsResolver` has no `supersedesOf` and no edge-type
  // parameter), so what is asserted here is the CONSEQUENCE: a supersedes-only chain adds no depth.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
    ],
    [adr(223, [], [139]), adr(139, [], [86]), adr(86)],
  );

  assert.equal(verdict.depthById.get("decision:0223"), 2);
  assert.equal(verdict.depthById.has("decision:0139"), false, "a superseded decision is not deeper");
  assert.equal(verdict.amendsEdges, 0);
  assert.equal(verdict.maxDepth, 2);
});

test("depth-from-work-takes-the-shortest-route-into-the-decision-log: a long ladder collapses", () => {
  // THE MEASUREMENT THAT MADE THE LIVE NUMBER 6 RATHER THAN THE PROJECTED 10. `probe:adr-graph`'s
  // Candidate A is a LONGEST-path arithmetic; this walk is SHORTEST-path by ADR-0363's own rule —
  // "an artifact reachable by several chains takes the SHORTEST ... the long way round is not the
  // distance". With 390 pointers landing on 145 distinct decisions, a decision sitting deep in one
  // ladder is usually also cited directly by a shallower artifact, and the long chain collapses.
  // Pinning it here means a later switch to longest-path has to be a decision, not an accident.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:top", "asset:shortcut"] }),
      row("top", { dependsOn: ["doc:decisions/0001-a.md"] }),
      row("shortcut", { dependsOn: ["doc:decisions/0004-a.md"] }),
    ],
    [adr(1, [2]), adr(2, [3]), adr(3, [4]), adr(4)],
  );

  // The long way round is 0001 -> 0002 -> 0003 -> 0004, which would put ADR-0004 at depth 5.
  assert.equal(verdict.depthById.get("decision:0001"), 2);
  assert.equal(verdict.depthById.get("decision:0004"), 2, "reached directly, so it is NOT deep");
  assert.equal(verdict.maxDepth, 4, "0001 -> 0002 -> 0003, with 0004 short-circuited");
});

test("depth-from-work-counts-the-two-populations-apart: decisions never swamp `unreachable`", () => {
  // Folding 399 mostly-unreached decisions into `unreachable` would swamp the one denominator that
  // exists to say "nothing was measured" — the unreachable-is-not-deep rule, one level up.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
      row("orphan"),
    ],
    [adr(223), adr(999), adr(998)],
  );

  assert.equal(verdict.artifactsScanned, 3);
  assert.equal(verdict.reached, 2);
  assert.equal(verdict.unreachable, 1, "the orphan ARTIFACT, and nothing else");
  assert.equal(verdict.decisionsScanned, 3);
  assert.equal(verdict.decisionsReached, 1);
  assert.deepEqual(verdict.histogram, [
    { depth: 0, count: 1 },
    { depth: 1, count: 1 },
  ]);
  assert.deepEqual(verdict.decisionHistogram, [{ depth: 2, count: 1 }]);
});

test("depth-from-work-counts-a-dangling-decision-pointer: named, never silently dropped", () => {
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", {
        dependsOn: ["doc:decisions/9999-no-such-decision.md", "doc:research/a-survey.md"],
      }),
    ],
    [adr(223, [404])],
  );

  assert.equal(verdict.decisionDanglingTargets, 2, "the missing pointer AND the missing amends target");
  assert.equal(verdict.bedrockTargets, 1, "the research pointer is still an honest sink");
  assert.equal(verdict.decisionEdges, 0);
});

test("depth-from-work-keeps-an-unreached-decision-apart-from-an-absent-one", () => {
  const verdict = withDecisions([row("orphan")], [adr(223)]);

  assert.deepEqual(depthFromWorkOf(verdict, "decision:0223"), { state: "unreachable" });
  assert.deepEqual(depthFromWorkOf(verdict, "decision:0404"), { state: "absent" });
});

test("depth-from-work-declares-a-vacuous-decision-walk: a resolver that resolved no join", () => {
  // A walk handed a resolver that resolves nothing returns the SINK number wearing a new name, and
  // reads as "the ceiling did not move" rather than as "the join was invisible".
  const many = Array.from({ length: VACUOUS_DECISION_WALK_FLOOR }, (_unused, index) =>
    row(`pad-${index}`),
  );

  const blind = withDecisions(many, [adr(223)]);
  assert.match(decisionWalkVacuity(blind).join(" "), /the join was invisible/);

  const sighted = withDecisions(
    [
      ...many,
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
    ],
    [adr(223)],
  );
  assert.deepEqual(decisionWalkVacuity(sighted), []);

  // A walk given NO resolver is the deliberate pre-ADR-0403 reading, not a blind one.
  assert.deepEqual(decisionWalkVacuity(evaluateDepthFromWork(depthFromWorkNodes(many))), []);
});
