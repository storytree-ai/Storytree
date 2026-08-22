import assert from "node:assert/strict";
import test from "node:test";

import { decisionAmendsResolver, type AmendsOnlyDecision } from "./decision-amends-seam.js";
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

/**
 * A decision row as the seam reads it. `supersedes` is carried in order to prove it is IGNORED.
 *
 * It deliberately omits `dependsOn` ENTIRELY rather than defaulting it to `[]`: that is the shape a
 * frontmatter-backed reader hands over, and it is what makes `decisionsCarryingDependsOn` read 0 in
 * every test that does not opt in — the blind-reader state ADR-0419 D3 expects throughout the drain.
 */
function adr(
  decisionNumber: number,
  amends: readonly number[] = [],
  supersedes: readonly number[] = [],
) {
  return { number: decisionNumber, amends, supersedes };
}

/** A decision row from a reader that CAN see ADR-0419 D1's support edge. Pointers, not numbers. */
function adrSupporting(
  decisionNumber: number,
  dependsOn: readonly string[],
  amends: readonly number[] = [],
  supersedes: readonly number[] = [],
) {
  return { number: decisionNumber, amends, supersedes, dependsOn };
}

function withDecisions(
  rows: readonly DepthFromWorkSource[],
  decisions: readonly AmendsOnlyDecision[],
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
  // ADR-0419 D1's half is fenced by the same switch, and reads zero for the same reason.
  assert.equal(sink.amendsEdges, 0);
  assert.equal(sink.decisionDependsOnEdges, 0);
  assert.equal(sink.decisionDependsOnUnwalkedTargets, 0);
  assert.equal(sink.decisionsCarryingDependsOn, 0);
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

// ---------------------------------------------------------------------------------------------
// ADR-0419 D1 — A DECISION'S OWN `dependsOn` IS A SUPPORT EDGE, AND THE WALK TRAVERSES IT
// ---------------------------------------------------------------------------------------------
// `decision-read-measurement-arc` increment 05. Settled by EXERCISE before it was built: with the
// seam answering `amendsOf` alone, ADR-0419's own `dependsOn` at ADR-0403 left `decision:0403`
// UNREACHED while `decision:0419` sat at depth 2 — and it stayed unreached even when both decisions
// were ALSO present as ordinary `adr-NNNN` artifact rows, because the artifact node and the decision
// node are two disconnected representations of one decision. The edge fell between the two halves of
// the walk and moved nothing. These tests are that probe, kept.

test("depth-from-work-walks-a-decisions-own-dependsOn: plain support is a hop, not a sink (ADR-0419 D1)", () => {
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, ["doc:decisions/0403-a-title.md"]),
      adrSupporting(403, ["doc:decisions/0223-a-title.md"]),
      adr(223),
    ],
  );

  assert.equal(verdict.depthById.get("decision:0419"), 2);
  assert.equal(verdict.depthById.get("decision:0403"), 3, "the edge that used to move nothing");
  assert.equal(verdict.depthById.get("decision:0223"), 4);
  assert.equal(verdict.maxDepth, 4);
  assert.equal(verdict.maxArtifactDepth, 1, "and the artifact half is untouched");
  assert.equal(verdict.decisionDependsOnEdges, 2);
  assert.equal(verdict.amendsEdges, 0, "no `amends` edge was authored, and none is invented");
});

test("depth-from-work-walks-every-spelling-of-a-decisions-own-dependsOn: none is dropped", () => {
  // ADR-0403 dec 7's rule applies to the new half verbatim, through the SAME parser. A walk that
  // resolved `doc:decisions/…` and not `doc:docs/decisions/…` drops 19 of the corpus's 390 crossing
  // pointers; the `asset:adr-NNNN` form is the third live spelling and must resolve here too.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, [
        "doc:decisions/0403-a-title.md",
        "doc:docs/decisions/0139-a-title.md",
        "asset:adr-0223",
      ]),
      adr(403),
      adr(139),
      adr(223),
    ],
  );

  assert.equal(verdict.decisionDependsOnEdges, 3, "all three spellings, or the number is a lie");
  assert.equal(verdict.depthById.get("decision:0403"), 3);
  assert.equal(verdict.depthById.get("decision:0139"), 3);
  assert.equal(verdict.depthById.get("decision:0223"), 3);
  assert.equal(verdict.decisionDependsOnUnwalkedTargets, 0);
});

test("depth-from-work-reports-the-two-support-edge-kinds-apart: never one summed figure", () => {
  // They are the same AXIS and different CLAIMS — `amends` adds a read obligation on its target,
  // plain support does not — and ADR-0419 D5 defers retiring the deprecated usage until the reach
  // into amended decisions can be measured. That question is unanswerable to anyone who can no
  // longer tell which edge kind produced the depth, so the verdict must never fold them into one.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, ["doc:decisions/0403-a-title.md"], [139]),
      adr(403),
      adr(139),
    ],
  );

  assert.equal(verdict.amendsEdges, 1, "the read-obligation edge");
  assert.equal(verdict.decisionDependsOnEdges, 1, "the plain support edge");
  assert.equal(verdict.depthById.get("decision:0403"), 3);
  assert.equal(verdict.depthById.get("decision:0139"), 3);
  // The two counters exist SEPARATELY on the verdict — there is no combined field to read instead.
  assert.equal(
    Object.keys(verdict).some((key) => /^supportEdges$|^decisionSupportEdges$/.test(key)),
    false,
    "no pre-summed field for a reader to quote in place of the two",
  );
});

test("depth-from-work-counts-a-decisions-non-decision-dependsOn-target: a declared floor", () => {
  // A decision's `dependsOn` may name a Library artifact or a research note as readily as another
  // decision. The decision half of this graph is decision-to-decision, exactly as `amends` always
  // was, so those are NOT walked — and they are counted, which is what makes the boundary a declared
  // floor rather than a silent drop that returns a confident short number.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
      row("merge-ceremony"),
    ],
    [
      adrSupporting(419, [
        "asset:merge-ceremony",
        "doc:research/a-survey.md",
        "story:library",
        "doc:decisions/0403-a-title.md",
      ]),
      adr(403),
    ],
  );

  assert.equal(verdict.decisionDependsOnUnwalkedTargets, 3, "the artifact, the note, the work unit");
  assert.equal(verdict.decisionDependsOnEdges, 1, "and only the decision pointer is an edge");
  assert.equal(
    verdict.depthById.has("merge-ceremony"),
    false,
    "an artifact is not reached THROUGH a decision, so the artifact denominators are unmoved",
  );
  assert.equal(verdict.unreachable, 1, "and it is honestly reported as unreachable, not as deep");
});

test("depth-from-work-counts-a-dangling-dependsOn-target-on-a-decision: named, never dropped", () => {
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [adrSupporting(419, ["doc:decisions/9999-no-such-decision.md"], [404])],
  );

  assert.equal(verdict.decisionDanglingTargets, 2, "the missing dependsOn AND the missing amends");
  assert.equal(verdict.decisionDependsOnEdges, 0);
  assert.equal(verdict.amendsEdges, 0);
  assert.equal(verdict.maxDepth, 2, "reached the decision, and could go no further");
});

test("depth-from-work-never-walks-supersedes-even-with-two-support-edges-in-play", () => {
  // The fence has to survive ADR-0419 D1. `supersedes` is unreachable through the seam — no
  // `supersedesOf`, and no edge-type parameter that `dependsOnOf` could have been folded into — so
  // what is asserted is the consequence: a superseded decision gains no depth from either edge.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, ["doc:decisions/0403-a-title.md"], [], [86]),
      adrSupporting(403, [], [], [139]),
      adr(139),
      adr(86),
    ],
  );

  assert.equal(verdict.depthById.get("decision:0403"), 3, "support moved the walk");
  assert.equal(verdict.depthById.has("decision:0086"), false, "and archaeology did not");
  assert.equal(verdict.depthById.has("decision:0139"), false);
  assert.equal(verdict.maxDepth, 3);
  assert.equal(verdict.decisionDependsOnUnwalkedTargets, 0, "supersedes is not even SEEN here");
});

test("depth-from-work-separates-a-blind-reader-from-an-unwired-decision-log (ADR-0419 D3)", () => {
  // 0 resolvable support edges has two causes with opposite remedies — widen the reader, or wire the
  // corpus — and on 2026-08-23 both were true at once. The edge count cannot tell them apart; the
  // count of rows that arrived with the FIELD PRESENT can.
  const rows = [
    row("anchor", { cites: ["story:library", "asset:guidance"] }),
    row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
  ];

  const blind = withDecisions(rows, [adr(419), adr(403)]);
  assert.equal(blind.decisionDependsOnEdges, 0);
  assert.equal(blind.decisionsCarryingDependsOn, 0, "the reader cannot see the field at all");

  const sighted = withDecisions(rows, [adrSupporting(419, []), adrSupporting(403, [])]);
  assert.equal(sighted.decisionDependsOnEdges, 0, "the same edge count …");
  assert.equal(sighted.decisionsCarryingDependsOn, 2, "… and a different, readable state");
});

test("decision-walk-vacuity-does-not-fire-once-dependsOn-carries-the-support-graph", () => {
  // THE MUTATION THAT WOULD HAVE MADE THIS RED, AND THE FALSE RED IT PREVENTS. ADR-0419 D2
  // deprecates `amends` for plain support, so a corpus part-way through the drain has FEWER `amends`
  // edges BY DESIGN and a fully-drained one could have none. A vacuity test on `amends` alone would
  // then declare a healthy, well-wired decision log vacuous — arriving precisely as the work
  // succeeded, which is the mirror of the failure the check exists to catch.
  const many = Array.from({ length: VACUOUS_DECISION_WALK_FLOOR }, (_unused, index) =>
    row(`pad-${index}`),
  );
  const reached = [
    ...many,
    row("anchor", { cites: ["story:library", "asset:guidance"] }),
    row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
  ];
  const padDecisions = Array.from({ length: VACUOUS_DECISION_WALK_FLOOR }, (_unused, index) =>
    adr(1000 + index),
  );

  const drained = withDecisions(reached, [
    adrSupporting(419, ["doc:decisions/0403-a-title.md"]),
    adr(403),
    ...padDecisions,
  ]);
  assert.equal(drained.amendsEdges, 0, "the drain moved every support edge off `amends` …");
  assert.equal(drained.decisionDependsOnEdges, 1);
  assert.deepEqual(decisionWalkVacuity(drained), [], "… and the walk is NOT vacuous");

  // And the reason still fires when NEITHER support edge resolves, which is the real blindness.
  const stuck = withDecisions(reached, [adr(419), adr(403), ...padDecisions]);
  assert.match(decisionWalkVacuity(stuck).join(" "), /0 resolvable `amends` edges and 0 resolvable/);
});
