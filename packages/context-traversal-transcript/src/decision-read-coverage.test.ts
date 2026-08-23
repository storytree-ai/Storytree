/**
 * Tests for `decision-read-coverage.ts` — the ADR-0419 / `decision-read-measurement-arc-inc-01`
 * finding, pinned.
 *
 * THE FINDING IS THE THING UNDER TEST, not the arithmetic. Every assertion below is written so that
 * the defect it guards would make it RED: the join test seeds a pair that spans the two spellings
 * and asserts the raw-id figure is STRICTLY SMALLER than the resolved one, so a "fix" that quietly
 * unified the id forms at write time, or a resolver that stopped recognising one of them, is caught
 * rather than absorbed. That is the `an-expectation-derived-from-its-subject-cannot-fail` discipline
 * applied here: the expectations are hand-authored literals, never computed from the summariser.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { classifyOfferObservability } from "@storytree/context-traversal-capture";
import type { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import {
  collectDecisionReadCoverage,
  renderDecisionReadCoverage,
  resolveDecisionId,
  routeOfSurface,
  summariseDecisionReadCoverage,
} from "./decision-read-coverage.js";

const LIVE_SURFACE = "library-artifact";

function visit(
  nodeId: string,
  surfaceId: string,
  visitId = `visit-${nodeId}-${surfaceId}`,
): ContextTraversalEvent {
  return {
    kind: "full_payload_read",
    eventId: `event:${visitId}`,
    sessionId: "s1",
    visitId,
    nodeId,
    surfaceId,
    at: "2026-08-23T00:00:00.000Z",
  };
}

function offers(...candidateNodeIds: [string, ...string[]]): ContextTraversalEvent {
  return {
    kind: "candidate_set",
    eventId: "event:candidate-set:v0",
    sessionId: "s1",
    candidateSetId: "candidate-set:v0",
    surfaceId: LIVE_SURFACE,
    candidateNodeIds,
    at: "2026-08-23T00:00:00.000Z",
  };
}

function followedEdge(toVisitId: string): ContextTraversalEvent {
  return {
    kind: "followed_edge",
    eventId: `event:edge:v0:${toVisitId}`,
    sessionId: "s1",
    edgeId: `edge:v0:${toVisitId}`,
    candidateSetId: "candidate-set:v0",
    fromVisitId: "v0",
    toVisitId,
    at: "2026-08-23T00:00:00.000Z",
  };
}

test("resolveDecisionId: all four live id forms resolve to the same decision NUMBER", () => {
  assert.deepEqual(resolveDecisionId("adr-0022"), { number: 22, spelling: "row" });
  assert.deepEqual(resolveDecisionId("asset:adr-0022"), { number: 22, spelling: "asset" });
  assert.deepEqual(resolveDecisionId("doc:decisions/0022-ci-green.md"), {
    number: 22,
    spelling: "decisions",
  });
  assert.deepEqual(resolveDecisionId("doc:docs/decisions/0022-ci-green.md"), {
    number: 22,
    spelling: "docs/decisions",
  });
});

test("resolveDecisionId: the row form is what a LIVE read mints, and parseDecisionPointer alone refuses it", () => {
  // The specific blindness this function exists to remove. A reader that used the corpus's pointer
  // parser alone — the obvious choice — would classify every post-ADR-0403 live read as "not a
  // decision", which is the shape of the very defect this arc keeps finding in its instruments.
  const events = [visit("adr-0419", LIVE_SURFACE)];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.decisionVisits, 1);
  assert.equal(coverage.decisionVisitsBySpelling.row, 1);
  assert.equal(coverage.decisionVisitsByRoute["live-cli"], 1);
});

test("resolveDecisionId: a non-decision id is null, and an `adr-` id that is not four digits is too", () => {
  assert.equal(resolveDecisionId("merge-ceremony"), null);
  assert.equal(resolveDecisionId("doc:docs/research/notes.md"), null);
  assert.equal(resolveDecisionId("asset:merge-ceremony"), null);
  // The collision `adrNumberOfArtifactId` guards: a legal artifact id merely beginning `adr-`.
  assert.equal(resolveDecisionId("adr-health-notes"), null);
  assert.equal(resolveDecisionId("adr-04031"), null);
});

test("THE JOIN: a raw-id join loses the pair that spans the two spellings, and the resolved one keeps it", () => {
  // The acceptance condition of `decision-read-measurement-arc-inc-01`, in one case: the corpus
  // OFFERS `doc:decisions/0022-….md` and the live CLI RECORDS the read as `adr-0022`. They are the
  // same decision, and a join on the id string cannot see it.
  const events = [
    offers("doc:decisions/0022-ci-green.md"),
    visit("adr-0022", LIVE_SURFACE),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);

  assert.equal(coverage.offeredDecisionIds, 1);
  assert.equal(coverage.decisionVisits, 1);
  assert.equal(coverage.joinableOnRawId, 0, "the raw id string does not match — this is the defect");
  assert.equal(coverage.joinableOnDecisionNumber, 1, "resolving both sides to a number recovers it");
  assert.ok(
    coverage.joinableOnDecisionNumber > coverage.joinableOnRawId,
    "the two figures MUST be able to differ, or this report cannot report the defect it exists for",
  );
});

test("THE JOIN: the raw-id figure is not vacuously zero — a same-spelling pair joins on it", () => {
  // The control for the test above. Without it, `joinableOnRawId: 0` would be consistent with a
  // summariser that never joins anything, and the finding would rest on a figure that cannot move.
  const events = [
    offers("doc:decisions/0022-ci-green.md"),
    visit("doc:decisions/0022-ci-green.md", "host-transcript-file-read"),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.joinableOnRawId, 1);
  assert.equal(coverage.joinableOnDecisionNumber, 1);
});

test("the two recorders are counted APART — a read seen by both is two events, never one", () => {
  // `decision-reads.ts` declares the overlap: the live observer fires as the command runs and the
  // transcript sweep recovers the same invocation afterwards, on different surfaces. Summing them
  // would double every post-migration read, so the report must keep them separable.
  const events = [
    visit("adr-0403", LIVE_SURFACE, "v-live"),
    visit("adr-0403", "host-transcript-cli-read", "v-transcript"),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.decisionVisits, 2);
  assert.equal(coverage.decisionVisitsByRoute["live-cli"], 1);
  assert.equal(coverage.decisionVisitsByRoute["host-transcript"], 1);
  assert.equal(coverage.distinctDecisionsRead, 1, "one decision, reached twice");
});

test("routeOfSurface names every host-transcript surface, and an unknown surface is `other`", () => {
  assert.equal(routeOfSurface(LIVE_SURFACE), "live-cli");
  assert.equal(routeOfSurface("host-transcript-file-read"), "host-transcript");
  assert.equal(routeOfSurface("host-transcript-grep"), "host-transcript");
  assert.equal(routeOfSurface("host-transcript-shell"), "host-transcript");
  assert.equal(routeOfSurface("host-transcript-cli-read"), "host-transcript");
  assert.equal(routeOfSurface("tree"), "other");
  assert.equal(routeOfSurface(undefined), "other");
});

test("the unobservable count is the REAL classifier's answer, never a restated prefix table", () => {
  // Pinned against `classifyOfferObservability` — the corpus's own machinery, which builds the argv
  // a follow would use and runs it through the actual allowlist. A local copy of the rule would
  // agree with the renderer whatever the renderer did; this figure's value is that it can disagree.
  const ids: [string, ...string[]] = [
    "doc:decisions/0022-ci-green.md",
    "adr-0022",
    "merge-ceremony",
    "doc:docs/decisions/0142-branch-dies.md",
  ];
  const expectedUnobservable = ids.filter(
    (id) => resolveDecisionId(id) !== null && !classifyOfferObservability(id).observable,
  ).length;

  const coverage = summariseDecisionReadCoverage([offers(...ids)], 1);
  assert.equal(coverage.offeredDecisionIds, 3, "three of the four ids name a decision");
  assert.equal(coverage.offeredDecisionsUnobservable, expectedUnobservable);
  assert.equal(
    coverage.offeredDecisionsUnobservable,
    2,
    "the two `doc:`-spelled decision offers are the unobservable ones",
  );
});

test("the render states the refusal, so the denominator cannot be mistaken for a worklist item", () => {
  // ADR-0312 (owner-directed, 2026-08-05) amends ADR-0260: the `doc:` blind spot is MEASURED, not
  // closed, because closing it would render every unanswered offer as a declined branch. A report
  // that printed the size without the refusal would invite exactly the repair that was refused.
  const coverage = summariseDecisionReadCoverage(
    [offers("doc:decisions/0022-ci-green.md"), visit("adr-0022", LIVE_SURFACE)],
    1,
  );
  const rendered = renderDecisionReadCoverage(coverage);
  assert.match(rendered, /NOT A WORKLIST ITEM/);
  assert.match(rendered, /ADR-0312/);
  assert.match(rendered, /UNOBSERVABLE/);
  assert.match(rendered, /over the OBSERVABLE branches/);
});

test("a followed edge is attributed to a decision only when its ANSWERING visit read one", () => {
  const events = [
    offers("doc:decisions/0022-ci-green.md", "trunk"),
    visit("adr-0022", LIVE_SURFACE, "v-decision"),
    followedEdge("v-decision"),
    visit("trunk", LIVE_SURFACE, "v-trunk"),
    followedEdge("v-trunk"),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.followedEdges, 2);
  assert.equal(coverage.followedEdgesToADecision, 1);
});

test("a followed edge naming a visit this record does not hold is not counted as a decision follow", () => {
  // Fail-closed over an incomplete record: a trace truncated mid-write, or an edge whose answering
  // visit landed in another session's file, must not be attributed to a decision on a guess.
  const coverage = summariseDecisionReadCoverage([followedEdge("v-absent")], 1);
  assert.equal(coverage.followedEdges, 1);
  assert.equal(coverage.followedEdgesToADecision, 0);
});

test("populations are counted independently: a non-decision offer and read touch no decision figure", () => {
  const events = [offers("trunk", "merge-ceremony"), visit("trunk", LIVE_SURFACE)];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.offeredIds, 2);
  assert.equal(coverage.offeredDecisionIds, 0);
  assert.equal(coverage.visits, 1);
  assert.equal(coverage.decisionVisits, 0);
  assert.equal(coverage.joinableOnRawId, 0);
  assert.equal(coverage.joinableOnDecisionNumber, 0);
});

test("the render states the join VERDICT, not just two numbers a reader could take either of", () => {
  const spanning = summariseDecisionReadCoverage(
    [offers("doc:decisions/0022-ci-green.md"), visit("adr-0022", LIVE_SURFACE)],
    1,
  );
  const rendered = renderDecisionReadCoverage(spanning);
  assert.match(rendered, /A RAW-ID JOIN LOSES 1 PAIR\(S\) AND REPORTS NO ERROR/);
  assert.match(rendered, /resolveDecisionId/);
  // The standing limit rides on every render, never only on the ingest above it.
  assert.match(rendered, /A READ COUNT IS NOT A SUFFICIENCY MEASURE/);
  // The named-but-unsized hole is NAMED, so a reader cannot take the sized list for the whole list.
  assert.match(rendered, /STUDIO/);
  assert.match(rendered, /adr pull/);
});

test("the render does NOT claim agreement licenses a raw-id join when nothing spans the spellings", () => {
  const agreeing = summariseDecisionReadCoverage(
    [offers("adr-0022"), visit("adr-0022", LIVE_SURFACE)],
    1,
  );
  const rendered = renderDecisionReadCoverage(agreeing);
  assert.doesNotMatch(rendered, /A RAW-ID JOIN LOSES/);
  assert.match(rendered, /not a licence to join on the raw id/);
});

test("an empty record renders zeroes rather than dividing by them", () => {
  const empty = summariseDecisionReadCoverage([], 0);
  assert.equal(empty.visits, 0);
  assert.equal(empty.offeredIds, 0);
  const rendered = renderDecisionReadCoverage(empty);
  assert.match(rendered, /n\/a/);
  assert.doesNotMatch(rendered, /NaN/);
});

test("collectDecisionReadCoverage over a missing directory is an empty corpus, never a throw", () => {
  const coverage = collectDecisionReadCoverage({
    traceDir: "./no-such-directory-decision-read-coverage",
  });
  assert.equal(coverage.sessions, 0);
  assert.equal(coverage.visits, 0);
});

test("THE JOIN, FORWARD-LOOKING: the historical half flatters the raw-id figure and the live-only pair does not", () => {
  // The trap this pair exists to remove. The whole-record raw join looks healthy purely because the
  // three historical file shapes mint the offers' own spelling — a population that can never grow
  // again, since `docs/decisions/` was deleted whole. Restricted to the live reads, the same offer
  // does not join on the raw id at all.
  const events = [
    offers("doc:decisions/0022-ci-green.md"),
    visit("doc:decisions/0022-ci-green.md", "host-transcript-file-read", "v-hist"),
    visit("adr-0022", LIVE_SURFACE, "v-live"),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);

  assert.equal(coverage.joinableOnRawId, 1, "whole record: the historical read matches the id string");
  assert.equal(
    coverage.joinableOnRawIdLiveReads,
    0,
    "live only: no live read carries the offer's spelling — this is the number that predicts",
  );
  assert.equal(coverage.joinableOnDecisionNumberLiveReads, 1, "resolving to a number recovers it");

  const rendered = renderDecisionReadCoverage(coverage);
  assert.match(rendered, /READ THESE, NOT THE PAIR ABOVE/);
  assert.match(rendered, /DECAYS/);
});

test("the live-only join is not vacuously zero — a live read of an `asset:`-spelled offer joins raw", () => {
  // The control. `offerIdOf` strips `asset:`, so an `asset:adr-0022` reference is OFFERED as
  // `adr-0022` — byte-identical to what a live read mints. That 2.7% of the offer surface is the
  // only part a raw join will still see once the historical half stops growing.
  const events = [offers("adr-0022"), visit("adr-0022", LIVE_SURFACE, "v-live")];
  const coverage = summariseDecisionReadCoverage(events, 1);
  assert.equal(coverage.joinableOnRawIdLiveReads, 1);
  assert.equal(coverage.joinableOnDecisionNumberLiveReads, 1);
});

test("a decision read ONLY by the transcript sweep counts for neither live-only figure", () => {
  // The case that separates the live-only sets from the whole-record ones. Without it, both
  // live-only figures could be fed by every route and still look right on a record where the live
  // observer happened to see the same decision — which is precisely the flattering-by-history error
  // the forward-looking pair exists to remove, reintroduced one level down.
  const events = [
    offers("doc:decisions/0022-ci-green.md"),
    visit("doc:decisions/0022-ci-green.md", "host-transcript-file-read", "v-hist"),
  ];
  const coverage = summariseDecisionReadCoverage(events, 1);

  assert.equal(coverage.joinableOnRawId, 1);
  assert.equal(coverage.joinableOnDecisionNumber, 1);
  assert.equal(coverage.joinableOnRawIdLiveReads, 0);
  assert.equal(
    coverage.joinableOnDecisionNumberLiveReads,
    0,
    "no LIVE read reached this decision, so no live-only figure may count it",
  );
});
