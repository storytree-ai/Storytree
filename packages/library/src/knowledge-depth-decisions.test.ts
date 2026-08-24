import assert from "node:assert/strict";
import test from "node:test";

import { decisionSupportResolver, type SupportOnlyDecision } from "./decision-support-seam.js";
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
 * With NO support argument it omits `dependsOn` ENTIRELY rather than defaulting it to `[]`: that is
 * the shape a frontmatter-backed reader hands over, and it is what makes `decisionsCarryingDependsOn`
 * read 0 in every test that does not opt in — the blind-reader state the seam's second denominator
 * exists to tell apart from a genuinely unwired log.
 *
 * `supports` takes decision NUMBERS for the fixtures' ergonomics and stores `asset:adr-NNNN`, which
 * is what the corpus actually holds since ADR-0431 D1 migrated the retired `amends` field's 517
 * edges onto `dependsOn`. Passing any makes the row a SIGHTED reader, because there is no longer a
 * support edge that a blind reader could carry.
 */
function adr(
  decisionNumber: number,
  supports: readonly number[] = [],
  supersedes: readonly number[] = [],
) {
  if (supports.length === 0) return { number: decisionNumber, supersedes };
  return {
    number: decisionNumber,
    supersedes,
    dependsOn: supports.map((n) => `asset:adr-${String(n).padStart(4, "0")}`),
  };
}

/** A decision row whose support edges are written as RAW POINTERS — all three live spellings. */
function adrSupporting(
  decisionNumber: number,
  dependsOn: readonly string[],
  supersedes: readonly number[] = [],
) {
  return { number: decisionNumber, supersedes, dependsOn };
}

function withDecisions(
  rows: readonly DepthFromWorkSource[],
  decisions: readonly SupportOnlyDecision[],
): ReturnType<typeof evaluateDepthFromWork> {
  return evaluateDepthFromWork(depthFromWorkNodes(rows), decisionSupportResolver(decisions));
}

test("depth-from-work-walks-past-a-decision-on-support: a decision pointer is a hop, not a sink", () => {
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
  assert.equal(verdict.decisionDependsOnEdges, 2);
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
  // The support half is fenced by the same switch, and reads zero for the same reason.
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
  // exclusion is structural (`DecisionSupportResolver` has no `supersedesOf` and no edge-type
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
  assert.equal(verdict.decisionDependsOnEdges, 0);
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

  assert.equal(verdict.decisionDanglingTargets, 2, "the missing artifact pointer AND the missing decision target");
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
// seam answering the retired `amends` edge alone, ADR-0419's own `dependsOn` at ADR-0403 left `decision:0403`
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

test("depth-from-work-reports-ONE-support-edge-count-and-no-dead-second-one", () => {
  // This test used to assert that TWO support counters were reported apart and never summed, because
  // `amends` added a read obligation its plain sibling did not and ADR-0419 D5's question was
  // unanswerable to anyone who could not tell which edge produced the depth. ADR-0431 D1 retired
  // `amends`, so what has to hold now is the opposite and is worth pinning just as hard: there is
  // ONE counter, and the retired one is GONE rather than left reporting a permanent 0. A counter
  // that cannot move is read as a collapse the moment anyone compares it to a frozen figure — which
  // is exactly how `probe:amends-reach` came to report 203 chain-walkers as 0 on 2026-08-24.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, ["doc:decisions/0403-a-title.md", "asset:adr-0139"]),
      adr(403),
      adr(139),
    ],
  );

  assert.equal(verdict.decisionDependsOnEdges, 2, "both support edges, on the one counter");
  assert.equal(verdict.depthById.get("decision:0403"), 3);
  assert.equal(verdict.depthById.get("decision:0139"), 3);
  assert.equal(
    Object.keys(verdict).some((key) => /amends/i.test(key)),
    false,
    "no retired counter survives to be quoted as a zero",
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
    [adrSupporting(419, ["doc:decisions/9999-no-such-decision.md", "asset:adr-0404"])],
  );

  assert.equal(verdict.decisionDanglingTargets, 2, "BOTH missing targets, in both spellings");
  assert.equal(verdict.decisionDependsOnEdges, 0);
  assert.equal(verdict.maxDepth, 2, "reached the decision, and could go no further");
});

test("depth-from-work-never-walks-supersedes-even-with-two-support-edges-in-play", () => {
  // The fence had to survive ADR-0419 D1 adding a second support edge, and it had to survive
  // ADR-0431 D1 taking one away. `supersedes` is unreachable through the seam — no `supersedesOf`,
  // and no edge-type parameter that `dependsOnOf` could have been folded into on the way past
  // either change — so what is asserted is the consequence: a superseded decision gains no depth.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["doc:decisions/0419-a-title.md"] }),
    ],
    [
      adrSupporting(419, ["doc:decisions/0403-a-title.md"], [86]),
      adrSupporting(403, [], [139]),
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
  // THE MUTATION THAT WOULD HAVE MADE THIS RED, AND THE FALSE RED IT PREVENTS. ADR-0419 D2 first
  // deprecated the old `amends` edge for plain support, so a corpus part-way through the drain had
  // FEWER of them BY DESIGN and a fully-drained one could have none; a vacuity test on that edge
  // alone would have declared a healthy, well-wired decision log vacuous, arriving precisely as the
  // work succeeded. ADR-0431 D1 then retired the edge outright and migrated all 517 onto
  // `dependsOn`, so the surviving half is the one that carries the graph — and the trap is the same
  // one inverted: a term that can only read 0 must never re-enter this predicate.
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
  assert.equal(drained.decisionDependsOnEdges, 1, "the migration put every support edge here …");
  assert.deepEqual(decisionWalkVacuity(drained), [], "… and the walk is NOT vacuous");

  // And the reason still fires when the support edge resolves NOWHERE, which is the real blindness.
  const stuck = withDecisions(reached, [adr(419), adr(403), ...padDecisions]);
  assert.match(decisionWalkVacuity(stuck).join(" "), /0 resolvable `dependsOn` edges/);
});

// ---------------------------------------------------------------------------------------------
// `-inc-08` — THE ARTIFACT HALF RESOLVES `asset:adr-NNNN` AS A DECISION POINTER TOO
// ---------------------------------------------------------------------------------------------
// `decision-read-measurement-arc` increment 08, fixing a defect ADR-0419 D1's increment found and
// deliberately left alone. The artifact half tried `parseCiteRef` FIRST, so the third live spelling
// — `asset:adr-NNNN`, ADR-0403 dec 1's — was claimed as an ordinary artifact pointer and never
// reached `parseDecisionPointer`. The decision half parsed the decision pointer first and resolved
// all three. The two halves disagreed about the SAME pointer.
//
// IT FAILED IN TWO SHAPES, AND BOTH ARE PINNED BELOW, because which one takes is decided by the
// CALLER's node set rather than by anything in the walk:
//
//   • twin PRESENT — `probe:depth-from-work` passes every stored row, and the live corpus holds 413
//     `adr-NNNN` artifact rows. The pointer resolved onto that twin, which carries none of the
//     decision's edges (0 of 413 carry `dependsOn`), so the chain stopped one hop in with NO counter
//     moving at all. This is the shape the live corpus was actually in, and the quiet one.
//   • twin ABSENT — a caller that filters decisions out counted it as `danglingTargets`.
//
// Both make chains read SHORTER than they are. A test that cannot tell resolved from dangling is the
// fault class this arc has already hit twice, so each test below asserts the POSITIVE (which node id
// was reached, at what depth, on which counter) and not merely that a total moved.

/** A decision's ARTIFACT twin — the `adr-NNNN` row ADR-0403 dec 1 mints, as the live corpus holds it. */
function adrTwinRow(decisionNumber: number): DepthFromWorkSource {
  const id = `adr-${String(decisionNumber).padStart(4, "0")}`;
  // Deliberately edge-less: 0 of the live corpus's 413 decision rows carry `dependsOn`, which is
  // exactly why landing on the twin is a dead end rather than a detour.
  return { id, doc: { kind: "adr", id } };
}

test("depth-from-work-resolves-an-artifacts-asset-adr-pointer-as-a-decision: the twin is not the target", () => {
  // THE LIVE SHAPE. The decision is present BOTH ways — as `decision:0419` through the resolver and
  // as the `adr-0419` artifact row — and the pointer must land on the one carrying the edges.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["asset:adr-0419"] }),
      adrTwinRow(419),
    ],
    [adrSupporting(419, ["doc:decisions/0403-a-title.md"]), adr(403, [223]), adr(223)],
  );

  assert.equal(verdict.depthById.get("guidance"), 1);
  assert.equal(verdict.depthById.get("decision:0419"), 2, "the decision node, NOT the artifact twin");
  assert.equal(verdict.depthById.get("decision:0403"), 3, "and the chain CONTINUES past it …");
  assert.equal(verdict.depthById.get("decision:0223"), 4, "… on both support edges, as ever");
  assert.equal(verdict.maxDepth, 4);
  assert.equal(verdict.decisionEdges, 1, "counted as the artifact-to-decision join it is");
  assert.equal(verdict.danglingTargets, 0, "and never as a dangling artifact pointer");
  assert.equal(
    verdict.depthById.has("adr-0419"),
    false,
    "the edge-less twin is not reached, and is honestly unreachable rather than a silent dead end",
  );
  // THE MUTATION GUARD. With `parseCiteRef` first the pointer lands on `adr-0419` at depth 1, the
  // decision chain is never entered, and `danglingTargets` still reads a plausible zero — so the
  // depth assertions are the only thing that can tell the two readings apart. Pinned as arithmetic
  // so the failure names the bias rather than an opaque number: 4 hops against the pre-fix 1.
  assert.ok(verdict.maxDepth > 1, "the pre-fix reading stopped at the twin, three hops short");
});

test("depth-from-work-counts-an-asset-adr-pointer-at-no-held-decision as decision-dangling, not artifact-dangling", () => {
  // THE OTHER SHAPE: a caller that filters decision rows out of `nodes` — which the end-to-end tests
  // in `@storytree/drive` do, and which is how the defect was first described. The pointer used to
  // land on `danglingTargets`, inflating the one counter `-inc-02` reads as "pointers at nothing".
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:guidance"] }),
      row("guidance", { dependsOn: ["asset:adr-9999", "asset:no-such-artifact"] }),
    ],
    [adr(419)],
  );

  assert.equal(verdict.decisionDanglingTargets, 1, "0-9999 IS a decision pointer, at nothing held");
  assert.equal(verdict.danglingTargets, 1, "and ONLY the genuine artifact miss is counted here");
  assert.equal(verdict.decisionEdges, 0);
  assert.equal(verdict.bedrockTargets, 0, "neither is bedrock — both were parsed and classified");
});

test("depth-from-work-resolves-an-asset-adr-pointer-in-cites: where the corpus actually carries it", () => {
  // ALL EIGHT live `asset:adr-NNNN` pointers sit in `cites`, not `dependsOn` — an increment naming
  // the decision that governs it (measured against the live store, 2026-08-23). The `cites` loop had
  // the identical precedence bug, and fixing only `dependsOn` would have left every live instance
  // unfixed while the tests read green.
  const verdict = withDecisions(
    [row("increment", { cites: ["story:library", "asset:adr-0419"] }), adrTwinRow(419)],
    [adrSupporting(419, ["doc:decisions/0403-a-title.md"]), adr(403)],
  );

  assert.equal(verdict.anchors, 1, "the story: cite still makes it an anchor");
  assert.equal(verdict.anchorEdges, 1, "and the decision pointer is still a way OUT of the seed");
  assert.equal(verdict.depthById.get("increment"), 0);
  assert.equal(verdict.depthById.get("decision:0419"), 1, "reached from `cites`, not from the twin");
  assert.equal(verdict.depthById.get("decision:0403"), 2, "and the chain continues");
  assert.equal(verdict.decisionEdges, 1);
  assert.equal(verdict.danglingTargets, 0);
  assert.equal(verdict.depthById.has("adr-0419"), false, "the twin is still not the target");
});

test("depth-from-work-agrees-with-itself-across-all-three-spellings: the two halves cannot diverge again", () => {
  // THE DISAGREEMENT ITSELF, AS AN ASSERTION. Three artifacts, one spelling each, at three
  // decisions that are otherwise identical — so any spelling the artifact half stops resolving
  // shows up as one missing depth rather than as a shifted total.
  const verdict = withDecisions(
    [
      row("anchor", { cites: ["story:library", "asset:bare", "asset:prefixed", "asset:row"] }),
      row("bare", { dependsOn: ["doc:decisions/0223-a-title.md"] }),
      row("prefixed", { dependsOn: ["doc:docs/decisions/0139-a-title.md"] }),
      row("row", { dependsOn: ["asset:adr-0403"] }),
      adrTwinRow(403),
    ],
    [adr(223), adr(139), adr(403)],
  );

  assert.equal(verdict.decisionEdges, 3, "all three spellings, or the number is a lie");
  assert.equal(verdict.depthById.get("decision:0223"), 2);
  assert.equal(verdict.depthById.get("decision:0139"), 2);
  assert.equal(verdict.depthById.get("decision:0403"), 2, "the spelling that used to be dropped");
  assert.equal(verdict.decisionsReached, 3);
  assert.equal(verdict.danglingTargets, 0);
});

test("depth-from-work-without-a-resolver-still-reads-an-asset-adr-pointer-as-an-ordinary-artifact-one", () => {
  // THE FENCE, AND THE LIMIT OF THIS FIX. Passing no resolver mints no decision nodes, so there is
  // nothing for the pointer to land on and it stays what it has always been: an `asset:` pointer at
  // an ordinary artifact row. The studio panel takes this path (`traversal-panel-arc` is parked and
  // its owner LOOK is fenced), so a change here would move a surface nobody decided to move.
  const rows = [
    row("anchor", { cites: ["story:library", "asset:guidance"] }),
    row("guidance", { dependsOn: ["asset:adr-0419"] }),
    adrTwinRow(419),
  ];
  const sink = evaluateDepthFromWork(depthFromWorkNodes(rows));

  assert.equal(sink.depthById.get("adr-0419"), 2, "the twin IS the target when there is no other");
  assert.equal(sink.depthById.has("decision:0419"), false);
  assert.equal(sink.decisionEdges, 0);
  assert.equal(sink.danglingTargets, 0);
  assert.equal(sink.bedrockTargets, 0, "an `asset:` pointer at a row that exists is not bedrock");
});
