/**
 * Story `context-traversal-capture`, capability `decision-point-playback` (ADR-0235 / ADR-0260),
 * story spec `stories/context-traversal-capture/decision-point-playback.md`.
 *
 * `artifact-offer-candidate-sets` records what a render OFFERED; `offer-follow-edges` records which
 * offer a later read ANSWERED. This capability is the READ side that joins the two into a decision
 * tree: for each recorded `candidate_set`, every offered candidate renders what the trace
 * deterministically says happened to it (followed / not-followed / unobservable / ambiguous), and
 * every `followed_edge` this batch cannot resolve is surfaced rather than dropped. It emits nothing.
 *
 * THE JOIN IS ALREADY DETERMINISTIC (`FollowedEdgeEvent.candidateSetId` names the offer exactly,
 * `toVisitId` names the answering visit, that visit carries `nodeId`) — no matching, no scoring, no
 * proximity. `nodeId` equality alone is NEVER a join: a visit reading a node a set happened to offer
 * is not "followed" unless a recorded edge naming THAT set actually resolves onto it.
 *
 * Every fixture here is hand-built in memory — no filesystem, no real store, no real CLI dispatch, no
 * clock. No `as` cast narrows anything: composed events are annotated with their OWN member type
 * (`ContextVisitEvent`, `CandidateSetEvent`, `FollowedEdgeEvent`), and every `CandidateOutcome` read
 * back from `computeDecisionPoints` is narrowed via an explicit `status` check + `assert.equal` +
 * `if (... !== "...") throw`, mirroring `follow-offer-edges.test.ts`.
 *
 * Covers the seven contracts declared in `stories/context-traversal-capture/decision-point-playback.md`:
 *   1. a-decision-point-renders-the-branch-taken-and-the-branches-not-taken
 *   2. the-join-is-the-recorded-edge-and-never-a-node-name-or-a-recency-match
 *   3. an-edge-that-answered-something-the-offer-did-not-contain-is-never-snapped-to-a-candidate
 *   4. an-unresolvable-follow-is-surfaced-rather-than-dropped
 *   5. a-repeated-offer-is-ambiguous-only-when-an-edge-actually-lands-on-it
 *   6. an-unfollowable-offer-renders-unobservable-and-never-as-a-declined-branch
 *   7. a-replay-with-no-recorded-offer-renders-no-decision-section-at-all
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CandidateSetEvent,
  ContextTraversalEvent,
  ContextVisitEvent,
  FollowedEdgeEvent,
} from "@storytree/context-traversal-telemetry";

import { candidateSetIdOf, offerIdOf } from "./offer-candidate-sets.js";
import { renderOfferFollowUps } from "./follow-offer-edges.js";
import {
  computeDecisionPoints,
  isFollowableOfferId,
  renderDecisionPoints,
} from "./decision-point-playback.js";
import type { CandidateOutcome } from "./decision-point-playback.js";

const AT = "2026-07-29T00:00:00.000Z";
const SURFACE = "test-surface";

// ---------------------------------------------------------------------------
// Fixtures — each typed with its OWN member type, never the whole union.
// ---------------------------------------------------------------------------

function visitEvent(overrides: {
  visitId: string;
  nodeId: string;
  sessionId?: string;
  at?: string;
}): ContextVisitEvent {
  const base: ContextVisitEvent = {
    kind: "full_payload_read",
    eventId: `event:${overrides.visitId}`,
    sessionId: overrides.sessionId ?? "session-a",
    at: overrides.at ?? AT,
    visitId: overrides.visitId,
    nodeId: overrides.nodeId,
  };
  return base;
}

function candidateSetEvent(
  candidateSetId: string,
  candidateNodeIds: [string, ...string[]],
  overrides: { surfaceId?: string; sessionId?: string; at?: string } = {},
): CandidateSetEvent {
  return {
    kind: "candidate_set",
    eventId: `event:${candidateSetId}`,
    sessionId: overrides.sessionId ?? "session-a",
    at: overrides.at ?? AT,
    candidateSetId,
    surfaceId: overrides.surfaceId ?? SURFACE,
    candidateNodeIds,
  };
}

function followedEdgeEvent(params: {
  edgeId: string;
  candidateSetId: string;
  fromVisitId: string;
  toVisitId: string;
  sessionId?: string;
  at?: string;
}): FollowedEdgeEvent {
  return {
    kind: "followed_edge",
    eventId: `event:${params.edgeId}`,
    sessionId: params.sessionId ?? "session-a",
    at: params.at ?? AT,
    edgeId: params.edgeId,
    candidateSetId: params.candidateSetId,
    fromVisitId: params.fromVisitId,
    toVisitId: params.toVisitId,
  };
}

// ---------------------------------------------------------------------------
// Narrowing helpers for `CandidateOutcome` — status check + assert + control-flow narrow, no `as`.
// ---------------------------------------------------------------------------

function expectFollowed(
  outcome: CandidateOutcome,
  context: string,
): Extract<CandidateOutcome, { status: "followed" }> {
  assert.equal(outcome.status, "followed", `${context}: expected followed, got ${outcome.status}`);
  if (outcome.status !== "followed") throw new Error("unreachable");
  return outcome;
}

function expectNotFollowed(outcome: CandidateOutcome, context: string): void {
  assert.equal(outcome.status, "not-followed", `${context}: expected not-followed, got ${outcome.status}`);
}

function expectUnobservable(
  outcome: CandidateOutcome,
  context: string,
): Extract<CandidateOutcome, { status: "unobservable" }> {
  assert.equal(outcome.status, "unobservable", `${context}: expected unobservable, got ${outcome.status}`);
  if (outcome.status !== "unobservable") throw new Error("unreachable");
  return outcome;
}

function expectAmbiguous(
  outcome: CandidateOutcome,
  context: string,
): Extract<CandidateOutcome, { status: "ambiguous" }> {
  assert.equal(outcome.status, "ambiguous", `${context}: expected ambiguous, got ${outcome.status}`);
  if (outcome.status !== "ambiguous") throw new Error("unreachable");
  return outcome;
}

// ---------------------------------------------------------------------------
// 1. a-decision-point-renders-the-branch-taken-and-the-branches-not-taken
// ---------------------------------------------------------------------------

test("a-decision-point-renders-the-branch-taken-and-the-branches-not-taken", () => {
  const candidateSetId = candidateSetIdOf("visit-render-1");
  const answeringVisit = visitEvent({ visitId: "visit-answer-1", nodeId: "alpha" });
  const edge = followedEdgeEvent({
    edgeId: "edge-1",
    candidateSetId,
    fromVisitId: "visit-render-1",
    toVisitId: "visit-answer-1",
  });
  const offer = candidateSetEvent(candidateSetId, ["alpha", "bravo", "charlie"]);

  const events: ContextTraversalEvent[] = [offer, answeringVisit, edge];
  const report = computeDecisionPoints(events);

  assert.equal(report.points.length, 1);
  assert.equal(report.orphanFollows.length, 0);

  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");
  assert.equal(point.candidateSetId, candidateSetId);
  assert.equal(point.surfaceId, SURFACE);
  assert.equal(point.candidates.length, 3);
  assert.equal(point.unresolved.length, 0);

  const [taken, notTaken1, notTaken2] = point.candidates;
  assert.notEqual(taken, undefined);
  assert.notEqual(notTaken1, undefined);
  assert.notEqual(notTaken2, undefined);
  if (taken === undefined || notTaken1 === undefined || notTaken2 === undefined) {
    throw new Error("unreachable");
  }

  assert.equal(taken.nodeId, "alpha");
  const followedOutcome = expectFollowed(taken.outcome, "the taken branch");
  assert.equal(followedOutcome.toVisitId, "visit-answer-1");
  assert.equal(followedOutcome.edgeId, "edge-1");

  assert.equal(notTaken1.nodeId, "bravo");
  expectNotFollowed(notTaken1.outcome, "bravo, a branch not taken");

  assert.equal(notTaken2.nodeId, "charlie");
  expectNotFollowed(notTaken2.outcome, "charlie, a branch not taken");

  const rendered = renderDecisionPoints(report);
  const lines = rendered.split("\n");
  assert.equal(lines[0], "decision points:");
  assert.ok(
    lines.includes(`  ${candidateSetId} (surface=${SURFACE}) — offered 3: followed 1, not followed 2`),
    `expected the summary line to omit zero-valued terms in:\n${rendered}`,
  );

  const idxAlpha = lines.findIndex((line) => /\[followed\]\s+alpha \(visit=visit-answer-1, edge=edge-1\)/.test(line));
  const idxBravo = lines.findIndex((line) => /\[not-followed\]\s+bravo\s*$/.test(line));
  const idxCharlie = lines.findIndex((line) => /\[not-followed\]\s+charlie\s*$/.test(line));
  assert.ok(idxAlpha !== -1, `expected a followed line for alpha in:\n${rendered}`);
  assert.ok(idxBravo !== -1, `expected a not-followed line for bravo in:\n${rendered}`);
  assert.ok(idxCharlie !== -1, `expected a not-followed line for charlie in:\n${rendered}`);
  assert.ok(idxAlpha < idxBravo && idxBravo < idxCharlie, "candidates must render in authored order, never re-sorted");
});

// ---------------------------------------------------------------------------
// 2. the-join-is-the-recorded-edge-and-never-a-node-name-or-a-recency-match
// ---------------------------------------------------------------------------

test("the-join-is-the-recorded-edge-and-never-a-node-name-or-a-recency-match", () => {
  const candidateSetId = candidateSetIdOf("visit-render-2");
  const offer = candidateSetEvent(candidateSetId, ["xray", "zulu"]);
  // A visit reads node "xray" — exactly what a recency-joining implementation would seize on — but
  // NO followed_edge event names this candidate set anywhere in the batch. The join must come solely
  // from a recorded edge, never from scanning visits for a matching nodeId.
  const temptingVisit = visitEvent({ visitId: "visit-tempt", nodeId: "xray" });

  const events: ContextTraversalEvent[] = [offer, temptingVisit];
  const report = computeDecisionPoints(events);

  assert.equal(report.points.length, 1);
  assert.equal(report.orphanFollows.length, 0);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");
  assert.equal(point.unresolved.length, 0);

  const [xrayCandidate, zuluCandidate] = point.candidates;
  assert.notEqual(xrayCandidate, undefined);
  assert.notEqual(zuluCandidate, undefined);
  if (xrayCandidate === undefined || zuluCandidate === undefined) throw new Error("unreachable");

  assert.equal(xrayCandidate.nodeId, "xray");
  expectNotFollowed(
    xrayCandidate.outcome,
    "a visit reading the offered node, with no recorded edge naming this set, must never read as followed",
  );
  assert.equal(zuluCandidate.nodeId, "zulu");
  expectNotFollowed(zuluCandidate.outcome, "zulu");

  // Sharpen further: a SECOND candidate set + a followed_edge that genuinely answers THAT set,
  // resolving to a visit whose nodeId also happens to be "xray" — proving a real edge elsewhere never
  // leaks a followed status onto the first set's same-named candidate.
  const otherSetId = candidateSetIdOf("visit-render-3");
  const otherOffer = candidateSetEvent(otherSetId, ["xray"]);
  const otherAnswer = visitEvent({ visitId: "visit-answer-3", nodeId: "xray" });
  const otherEdge = followedEdgeEvent({
    edgeId: "edge-3",
    candidateSetId: otherSetId,
    fromVisitId: "visit-render-3",
    toVisitId: "visit-answer-3",
  });

  const combined: ContextTraversalEvent[] = [offer, temptingVisit, otherOffer, otherAnswer, otherEdge];
  const combinedReport = computeDecisionPoints(combined);
  assert.equal(combinedReport.points.length, 2);

  const firstPoint = combinedReport.points.find((p) => p.candidateSetId === candidateSetId);
  assert.notEqual(firstPoint, undefined);
  if (firstPoint === undefined) throw new Error("unreachable");
  const firstXray = firstPoint.candidates.find((c) => c.nodeId === "xray");
  assert.notEqual(firstXray, undefined);
  if (firstXray === undefined) throw new Error("unreachable");
  expectNotFollowed(
    firstXray.outcome,
    "an edge answering a DIFFERENT candidate set must never mark this set's same-named candidate as followed",
  );

  const secondPoint = combinedReport.points.find((p) => p.candidateSetId === otherSetId);
  assert.notEqual(secondPoint, undefined);
  if (secondPoint === undefined) throw new Error("unreachable");
  const secondXray = secondPoint.candidates.find((c) => c.nodeId === "xray");
  assert.notEqual(secondXray, undefined);
  if (secondXray === undefined) throw new Error("unreachable");
  const followedOutcome = expectFollowed(secondXray.outcome, "the set the edge actually names");
  assert.equal(followedOutcome.toVisitId, "visit-answer-3");
  assert.equal(followedOutcome.edgeId, "edge-3");
});

// ---------------------------------------------------------------------------
// 3. an-edge-that-answered-something-the-offer-did-not-contain-is-never-snapped-to-a-candidate
// ---------------------------------------------------------------------------

test("an-edge-that-answered-something-the-offer-did-not-contain-is-never-snapped-to-a-candidate", () => {
  const candidateSetId = candidateSetIdOf("visit-render-4");
  const offer = candidateSetEvent(candidateSetId, ["alpha", "bravo"]);
  // "delta" was NEVER offered by this set.
  const strayVisit = visitEvent({ visitId: "visit-answer-4", nodeId: "delta" });
  const strayEdge = followedEdgeEvent({
    edgeId: "edge-4",
    candidateSetId,
    fromVisitId: "visit-render-4",
    toVisitId: "visit-answer-4",
  });

  const events: ContextTraversalEvent[] = [offer, strayVisit, strayEdge];
  const report = computeDecisionPoints(events);

  assert.equal(report.points.length, 1);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");

  // neither offered candidate may absorb an edge that answered a different node.
  const [alphaCandidate, bravoCandidate] = point.candidates;
  assert.notEqual(alphaCandidate, undefined);
  assert.notEqual(bravoCandidate, undefined);
  if (alphaCandidate === undefined || bravoCandidate === undefined) throw new Error("unreachable");
  expectNotFollowed(alphaCandidate.outcome, "alpha must not absorb an edge that answered delta");
  expectNotFollowed(bravoCandidate.outcome, "bravo must not absorb an edge that answered delta");

  // the edge is surfaced, not dropped, carrying the exact declared reason.
  assert.equal(point.unresolved.length, 1);
  const unresolved = point.unresolved[0];
  assert.notEqual(unresolved, undefined);
  if (unresolved === undefined) throw new Error("unreachable");
  assert.equal(unresolved.edgeId, "edge-4");
  assert.equal(unresolved.candidateSetId, candidateSetId);
  assert.equal(unresolved.toVisitId, "visit-answer-4");
  assert.equal(unresolved.reason, "answered-a-node-the-offer-did-not-contain");

  assert.equal(report.orphanFollows.length, 0);

  const rendered = renderDecisionPoints(report);
  assert.ok(
    /\[unresolved\]\s+edge=edge-4 to=visit-answer-4 — answered-a-node-the-offer-did-not-contain/.test(rendered),
    `expected the unresolved edge to render in:\n${rendered}`,
  );
});

// ---------------------------------------------------------------------------
// 4. an-unresolvable-follow-is-surfaced-rather-than-dropped
// ---------------------------------------------------------------------------

test("an-unresolvable-follow-is-surfaced-rather-than-dropped", () => {
  const candidateSetId = candidateSetIdOf("visit-render-5");
  const offer = candidateSetEvent(candidateSetId, ["alpha"]);
  // Names this set, but no visit anywhere in the batch carries this visitId.
  const ghostEdge = followedEdgeEvent({
    edgeId: "edge-5",
    candidateSetId,
    fromVisitId: "visit-render-5",
    toVisitId: "visit-nonexistent",
  });

  // Names a set that is never offered in this batch at all — a genuine orphan.
  const orphanSetId = candidateSetIdOf("visit-render-6");
  const orphanEdge = followedEdgeEvent({
    edgeId: "edge-6",
    candidateSetId: orphanSetId,
    fromVisitId: "visit-render-6",
    toVisitId: "visit-answer-6",
  });

  const events: ContextTraversalEvent[] = [offer, ghostEdge, orphanEdge];
  const report = computeDecisionPoints(events);

  assert.equal(report.points.length, 1);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");

  assert.equal(point.unresolved.length, 1);
  const ghostUnresolved = point.unresolved[0];
  assert.notEqual(ghostUnresolved, undefined);
  if (ghostUnresolved === undefined) throw new Error("unreachable");
  assert.equal(ghostUnresolved.edgeId, "edge-5");
  assert.equal(ghostUnresolved.toVisitId, "visit-nonexistent");
  assert.equal(ghostUnresolved.reason, "answering-visit-absent");

  assert.equal(report.orphanFollows.length, 1);
  const orphan = report.orphanFollows[0];
  assert.notEqual(orphan, undefined);
  if (orphan === undefined) throw new Error("unreachable");
  assert.equal(orphan.edgeId, "edge-6");
  assert.equal(orphan.candidateSetId, orphanSetId);
  assert.equal(orphan.toVisitId, "visit-answer-6");
  assert.equal(orphan.reason, "offer-absent-from-this-trace");

  const rendered = renderDecisionPoints(report);
  assert.ok(
    /\[unresolved\]\s+edge=edge-5 to=visit-nonexistent — answering-visit-absent/.test(rendered),
    `expected the ghost edge to render inside its own point in:\n${rendered}`,
  );
  assert.ok(
    rendered.includes("follows whose offer is absent from this trace:"),
    `expected the orphan section header in:\n${rendered}`,
  );
  assert.ok(
    new RegExp(
      `\\[unresolved\\]\\s+edge=edge-6 set=${orphanSetId} to=visit-answer-6 — offer-absent-from-this-trace`,
    ).test(rendered),
    `expected the orphan edge to render in:\n${rendered}`,
  );

  // A batch holding ONLY the orphan — no candidate_set at all: the point list is empty but the
  // follow is still surfaced, never silently dropped for lack of a point to attach to.
  const onlyOrphanEvents: ContextTraversalEvent[] = [orphanEdge];
  const onlyOrphanReport = computeDecisionPoints(onlyOrphanEvents);
  assert.equal(onlyOrphanReport.points.length, 0);
  assert.equal(onlyOrphanReport.orphanFollows.length, 1);
  const onlyOrphanRendered = renderDecisionPoints(onlyOrphanReport);
  assert.notEqual(onlyOrphanRendered, "", "an orphan follow alone must still render, never collapse to nothing");
  assert.ok(onlyOrphanRendered.startsWith("decision points:"));
  assert.ok(onlyOrphanRendered.includes("follows whose offer is absent from this trace:"));
  assert.ok(onlyOrphanRendered.includes("edge=edge-6"));
});

// ---------------------------------------------------------------------------
// 5. a-repeated-offer-is-ambiguous-only-when-an-edge-actually-lands-on-it
// ---------------------------------------------------------------------------

test("a-repeated-offer-is-ambiguous-only-when-an-edge-actually-lands-on-it", () => {
  // (a) a duplicated offer with NO edge resolving onto it at all -> both entries render
  // not-followed, never ambiguous. Duplication alone is not the trigger.
  const dupOnlySetId = candidateSetIdOf("visit-render-7");
  const dupOnlyOffer = candidateSetEvent(dupOnlySetId, ["alpha", "alpha", "bravo"]);
  const dupOnlyReport = computeDecisionPoints([dupOnlyOffer]);
  assert.equal(dupOnlyReport.points.length, 1);
  const dupOnlyPoint = dupOnlyReport.points[0];
  assert.notEqual(dupOnlyPoint, undefined);
  if (dupOnlyPoint === undefined) throw new Error("unreachable");
  assert.equal(dupOnlyPoint.candidates.length, 3);
  const [dup1, dup2, bravoOnly] = dupOnlyPoint.candidates;
  assert.notEqual(dup1, undefined);
  assert.notEqual(dup2, undefined);
  assert.notEqual(bravoOnly, undefined);
  if (dup1 === undefined || dup2 === undefined || bravoOnly === undefined) throw new Error("unreachable");
  assert.equal(dup1.nodeId, "alpha");
  assert.equal(dup2.nodeId, "alpha");
  expectNotFollowed(dup1.outcome, "a duplicated offer with no resolving edge is not-followed, not ambiguous (1)");
  expectNotFollowed(dup2.outcome, "a duplicated offer with no resolving edge is not-followed, not ambiguous (2)");
  expectNotFollowed(bravoOnly.outcome, "bravo, untouched");

  // (b) a duplicated offer with exactly ONE edge resolving onto it -> BOTH duplicate entries turn
  // ambiguous, each carrying every resolving edge's id.
  const oneEdgeSetId = candidateSetIdOf("visit-render-8");
  const oneEdgeOffer = candidateSetEvent(oneEdgeSetId, ["alpha", "alpha", "bravo"]);
  const oneEdgeVisit = visitEvent({ visitId: "visit-answer-8", nodeId: "alpha" });
  const oneEdge = followedEdgeEvent({
    edgeId: "edge-8",
    candidateSetId: oneEdgeSetId,
    fromVisitId: "visit-render-8",
    toVisitId: "visit-answer-8",
  });
  const oneEdgeReport = computeDecisionPoints([oneEdgeOffer, oneEdgeVisit, oneEdge]);
  assert.equal(oneEdgeReport.points.length, 1);
  const oneEdgePoint = oneEdgeReport.points[0];
  assert.notEqual(oneEdgePoint, undefined);
  if (oneEdgePoint === undefined) throw new Error("unreachable");
  const [a1, a2, b1] = oneEdgePoint.candidates;
  assert.notEqual(a1, undefined);
  assert.notEqual(a2, undefined);
  assert.notEqual(b1, undefined);
  if (a1 === undefined || a2 === undefined || b1 === undefined) throw new Error("unreachable");
  const ambiguous1 = expectAmbiguous(a1.outcome, "first alpha entry");
  const ambiguous2 = expectAmbiguous(a2.outcome, "second alpha entry");
  assert.ok(ambiguous1.reason.trim().length > 0);
  assert.ok(ambiguous2.reason.trim().length > 0);
  assert.deepEqual([...ambiguous1.edgeIds], ["edge-8"]);
  assert.deepEqual([...ambiguous2.edgeIds], ["edge-8"]);
  expectNotFollowed(b1.outcome, "bravo, untouched by the ambiguity");

  // (c) TWO edges both resolve onto the duplicated node -> both duplicate entries carry BOTH
  // resolving edge ids.
  const twoEdgeSetId = candidateSetIdOf("visit-render-9");
  const twoEdgeOffer = candidateSetEvent(twoEdgeSetId, ["alpha", "alpha"]);
  const answerOne = visitEvent({ visitId: "visit-answer-9a", nodeId: "alpha" });
  const answerTwo = visitEvent({ visitId: "visit-answer-9b", nodeId: "alpha" });
  const edgeOne = followedEdgeEvent({
    edgeId: "edge-9a",
    candidateSetId: twoEdgeSetId,
    fromVisitId: "visit-render-9",
    toVisitId: "visit-answer-9a",
  });
  const edgeTwo = followedEdgeEvent({
    edgeId: "edge-9b",
    candidateSetId: twoEdgeSetId,
    fromVisitId: "visit-render-9",
    toVisitId: "visit-answer-9b",
  });
  const twoEdgeReport = computeDecisionPoints([twoEdgeOffer, answerOne, answerTwo, edgeOne, edgeTwo]);
  assert.equal(twoEdgeReport.points.length, 1);
  const twoEdgePoint = twoEdgeReport.points[0];
  assert.notEqual(twoEdgePoint, undefined);
  if (twoEdgePoint === undefined) throw new Error("unreachable");
  const [t1, t2] = twoEdgePoint.candidates;
  assert.notEqual(t1, undefined);
  assert.notEqual(t2, undefined);
  if (t1 === undefined || t2 === undefined) throw new Error("unreachable");
  const tAmbiguous1 = expectAmbiguous(t1.outcome, "first entry, two resolving edges");
  const tAmbiguous2 = expectAmbiguous(t2.outcome, "second entry, two resolving edges");
  assert.deepEqual([...tAmbiguous1.edgeIds].sort(), ["edge-9a", "edge-9b"]);
  assert.deepEqual([...tAmbiguous2.edgeIds].sort(), ["edge-9a", "edge-9b"]);

  const rendered = renderDecisionPoints(oneEdgeReport);
  assert.ok(/\[ambiguous\]\s+alpha — /.test(rendered), `expected an ambiguous line for alpha in:\n${rendered}`);
});

// ---------------------------------------------------------------------------
// 6. an-unfollowable-offer-renders-unobservable-and-never-as-a-declined-branch
// ---------------------------------------------------------------------------

test("an-unfollowable-offer-renders-unobservable-and-never-as-a-declined-branch", () => {
  // isFollowableOfferId must agree byte-for-byte with renderOfferFollowUps's own skip rule: an id
  // carrying a scheme prefix (containing ":") has no CLI read to follow, on either side.
  const refs = ["asset:alpha", "doc:decisions/0001-z.md", "asset:bravo", "bare-thing"];
  const ids = refs.map(offerIdOf);
  const [firstId, ...restIds] = ids;
  assert.notEqual(firstId, undefined);
  if (firstId === undefined) throw new Error("unreachable");
  const candidateNodeIds: [string, ...string[]] = [firstId, ...restIds];

  const candidateSetId = candidateSetIdOf("visit-render-10");
  const offer = candidateSetEvent(candidateSetId, candidateNodeIds);
  const report = computeDecisionPoints([offer]);
  assert.equal(report.points.length, 1);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");

  const followUpLines = renderOfferFollowUps(candidateSetId, refs);

  for (const id of ids) {
    const commandPrinted = followUpLines.some((line) => line.includes(`artifact ${id} `));
    const candidate = point.candidates.find((entry) => entry.nodeId === id);
    assert.notEqual(candidate, undefined, `expected a candidate for ${id}`);
    if (candidate === undefined) throw new Error("unreachable");

    assert.equal(
      isFollowableOfferId(id),
      commandPrinted,
      `isFollowableOfferId(${id}) must agree with renderOfferFollowUps's own skip rule`,
    );

    if (commandPrinted) {
      expectNotFollowed(candidate.outcome, `${id} is followable and was never followed`);
    } else {
      const unobservable = expectUnobservable(candidate.outcome, `${id} is unfollowable and must render unobservable`);
      assert.ok(unobservable.reason.trim().length > 0);
    }
  }

  assert.equal(isFollowableOfferId("doc:decisions/0001-z.md"), false);
  assert.equal(isFollowableOfferId("bare-thing"), true);

  const rendered = renderDecisionPoints(report);
  assert.ok(
    /\[unobservable\]\s+doc:decisions\/0001-z\.md — /.test(rendered),
    `expected the doc: offer to render as unobservable in:\n${rendered}`,
  );
  assert.equal(
    /\[not-followed\]\s+doc:decisions\/0001-z\.md/.test(rendered),
    false,
    "an unfollowable offer must never render as a declined (not-followed) branch",
  );
});

// ---------------------------------------------------------------------------
// 7. a-replay-with-no-recorded-offer-renders-no-decision-section-at-all
// ---------------------------------------------------------------------------

test("a-replay-with-no-recorded-offer-renders-no-decision-section-at-all", () => {
  const emptyReport = computeDecisionPoints([]);
  assert.deepEqual(emptyReport.points, []);
  assert.deepEqual(emptyReport.orphanFollows, []);
  assert.equal(renderDecisionPoints(emptyReport), "");

  // events that carry visits and other kinds, but never a candidate_set and never a followed_edge —
  // still no decision section, because nothing was ever recorded as offered.
  const bystanderVisit = visitEvent({ visitId: "visit-1", nodeId: "alpha" });
  const noOfferEvents: ContextTraversalEvent[] = [bystanderVisit];
  const noOfferReport = computeDecisionPoints(noOfferEvents);
  assert.deepEqual(noOfferReport.points, []);
  assert.deepEqual(noOfferReport.orphanFollows, []);
  assert.equal(renderDecisionPoints(noOfferReport), "");
});
