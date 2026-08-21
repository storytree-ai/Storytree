/**
 * Story `context-traversal-capture`, capability `offer-observability-share` (ADR-0235 / ADR-0260 /
 * ADR-0312), story spec `stories/context-traversal-capture/offer-observability-share.md`.
 *
 * `decision-point-playback` renders `followed` / `not-followed` / `unobservable` / `ambiguous` for
 * every recorded offer, but says nothing about how much of the OFFER SET the telemetry could ever
 * have seen a follow land on. This module states that denominator: for each recorded `candidate_set`,
 * every offered id is classified `observable` or `unobservable` (with a reason) by running the REAL
 * machinery — `followArgvFor` builds the argv a follow of that offer would use, `observeCliInvocation`
 * (the real allowlist) is run against it, and the resulting visit's `surfaceId` is checked against the
 * one surface `emitFollowedEdge` actually stamps (`LIBRARY_ARTIFACT_SURFACE`). It emits nothing and
 * consumes only the events it is handed — no filesystem, no clock, no store, no CLI dispatch.
 *
 * Every fixture here is hand-built in memory. No `as` cast narrows anything: composed events are
 * annotated with their OWN member type (`CandidateSetEvent`), and every `OfferObservability` read back
 * is narrowed via an explicit `observable` check + `assert.equal` + `if (... !== false) throw`,
 * mirroring `decision-point-playback.test.ts`.
 *
 * Covers the seven contracts declared in
 * `stories/context-traversal-capture/offer-observability-share.md`:
 *   1. an-offer-set-states-how-much-of-itself-the-telemetry-could-not-see
 *   2. an-unobservable-offer-carries-the-reason-a-follow-could-not-land-on-it
 *   3. the-verdict-is-derived-from-the-real-allowlist-and-never-a-restated-prefix-table
 *   4. a-node-ref-is-never-reported-as-having-no-cli-read-because-one-demonstrably-exists
 *   5. a-set-with-nothing-observable-renders-zero-and-never-a-hidden-division
 *   6. a-replay-with-no-recorded-offer-renders-no-observability-section-at-all
 *   7. the-denominator-covers-exactly-the-recorded-offers-with-none-dropped-or-added
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { CandidateSetEvent, ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import { candidateSetIdOf, LIBRARY_ARTIFACT_SURFACE } from "./offer-candidate-sets.js";
import { computeDecisionPoints, isFollowableOfferId } from "./decision-point-playback.js";
import { observeCliInvocation } from "./observe-cli.js";
import type { ObserveCliDeps } from "./observe-cli.js";
import {
  classifyOfferObservability,
  computeOfferObservability,
  followArgvFor,
  FILE_READS_OBSERVE_NOTHING,
  PATHWAY_CAVEAT,
  REPLAY_PATHWAY_NOTE,
  renderOfferObservability,
} from "./offer-observability-share.js";
import type { OfferObservability } from "./offer-observability-share.js";

const AT = "2026-08-05T00:00:00.000Z";
const SURFACE = "test-surface";

const REAL_CLI_DEPS: ObserveCliDeps = {
  ok: true,
  sessionId: "session-probe",
  nextVisitId: () => "visit-probe",
  now: () => new Date(AT),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Narrowing helper for `OfferObservability` — no `as` cast.
// ---------------------------------------------------------------------------

function expectUnobservable(
  entry: OfferObservability,
  context: string,
): Extract<OfferObservability, { observable: false }> {
  assert.equal(entry.observable, false, `${context}: expected unobservable, got ${JSON.stringify(entry)}`);
  if (entry.observable !== false) throw new Error("unreachable");
  return entry;
}

// ---------------------------------------------------------------------------
// 1. an-offer-set-states-how-much-of-itself-the-telemetry-could-not-see
// ---------------------------------------------------------------------------

test("an-offer-set-states-how-much-of-itself-the-telemetry-could-not-see", () => {
  const candidateSetId = candidateSetIdOf("visit-render-1");
  const offer = candidateSetEvent(candidateSetId, [
    "alpha",
    "doc:decisions/0001-z.md",
    "node:some-story",
    "bravo",
  ]);

  const events: ContextTraversalEvent[] = [offer];
  const report = computeOfferObservability(events);

  assert.equal(report.points.length, 1);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");

  assert.equal(point.candidateSetId, candidateSetId);
  assert.equal(point.offered, 4);
  assert.equal(point.observable, 2, "only alpha and bravo are observable; doc:/node: are not");
  assert.equal(point.offers.length, 4);

  assert.equal(report.offered, 4);
  assert.equal(report.observable, 2);

  const rendered = renderOfferObservability(report);
  const expected = [
    "offer observability:",
    `  ${candidateSetId} — offered 4, observable 2 of 4; unobservable 2: ` +
      "no-cli-read-shape-observes-a-visit-for-this-offer x1, " +
      "a-cli-read-exists-but-no-follow-producer-accepts-its-surface x1",
    "  trace total — offered 4, observable 2 of 4: the followed counts above are over 2 " +
      "observable branches, not 4 offered",
    // ADR-0360 D6: the denominator names the pathway it observes. Pinned through the exported
    // constant so a re-wording cannot silently drop the caveat while this stays green.
    `  ${PATHWAY_CAVEAT}`,
  ].join("\n");
  assert.equal(rendered, expected);
  assert.equal(rendered.includes("%"), false, "no percentage is ever rendered");
});

// ---------------------------------------------------------------------------
// 2. an-unobservable-offer-carries-the-reason-a-follow-could-not-land-on-it
// ---------------------------------------------------------------------------

test("an-unobservable-offer-carries-the-reason-a-follow-could-not-land-on-it", () => {
  const ALLOWED_REASONS = [
    "no-cli-read-shape-observes-a-visit-for-this-offer",
    "a-cli-read-exists-but-no-follow-producer-accepts-its-surface",
  ];

  const docEntry = classifyOfferObservability("doc:decisions/0001-z.md");
  const unobservableDoc = expectUnobservable(docEntry, "a doc: ref has no CLI read shape at all");
  assert.equal(unobservableDoc.nodeId, "doc:decisions/0001-z.md");
  assert.ok(unobservableDoc.reason.trim().length > 0);
  assert.ok(ALLOWED_REASONS.includes(unobservableDoc.reason));
  assert.equal(unobservableDoc.reason, "no-cli-read-shape-observes-a-visit-for-this-offer");

  const nodeEntry = classifyOfferObservability("node:some-story");
  const unobservableNode = expectUnobservable(nodeEntry, "a node: ref has a read but no follow producer");
  assert.equal(unobservableNode.nodeId, "node:some-story");
  assert.ok(unobservableNode.reason.trim().length > 0);
  assert.ok(ALLOWED_REASONS.includes(unobservableNode.reason));
  assert.equal(unobservableNode.reason, "a-cli-read-exists-but-no-follow-producer-accepts-its-surface");

  // The observable variant carries no `reason` field at all — the discriminated union, not a
  // boolean plus an optional reason.
  const observableEntry = classifyOfferObservability("alpha");
  assert.equal(observableEntry.observable, true);
  assert.equal("reason" in observableEntry, false, "an observable entry must carry no reason field");
  assert.equal("reason" in unobservableDoc, true, "an unobservable entry must always carry a reason field");
});

// ---------------------------------------------------------------------------
// 3. the-verdict-is-derived-from-the-real-allowlist-and-never-a-restated-prefix-table
// ---------------------------------------------------------------------------

test("the-verdict-is-derived-from-the-real-allowlist-and-never-a-restated-prefix-table", () => {
  // On every corpus-shaped id but one, the derived verdict agrees with `isFollowableOfferId`'s own
  // scheme-prefix rule.
  const AGREEING_IDS = ["alpha", "bravo-two", "doc:decisions/0001-z.md", "node:some-story", "unknown:thing"];
  for (const id of AGREEING_IDS) {
    const classified = classifyOfferObservability(id);
    assert.equal(
      classified.observable,
      isFollowableOfferId(id),
      `classifyOfferObservability(${id}).observable must agree with isFollowableOfferId(${id})`,
    );
  }

  // The one shape where the derived verdict is strictly more accurate: the bare id "list".
  // `isFollowableOfferId` sees no scheme prefix and calls it followable, but `list` dispatches to
  // the LIST SEARCH (`observeCliInvocation`'s own `library artifact list` branch), which observes a
  // `search` event and no visit — no follow could ever land there.
  assert.equal(isFollowableOfferId("list"), true);
  const listClassified = classifyOfferObservability("list");
  const unobservableList = expectUnobservable(
    listClassified,
    "list dispatches to search, not a visit, so no follow could ever land",
  );
  assert.equal(unobservableList.reason, "no-cli-read-shape-observes-a-visit-for-this-offer");

  // The derivation runs the real argv-building rule, never a restated prefix table: prove it by
  // checking `followArgvFor` itself produces the shape `observeCliInvocation` actually dispatches on.
  assert.deepEqual(followArgvFor("list"), ["library", "artifact", "list"]);
  assert.deepEqual(followArgvFor("alpha"), ["library", "artifact", "alpha"]);
  assert.deepEqual(followArgvFor("node:some-story"), ["tree", "some-story"]);
  assert.equal(followArgvFor("doc:decisions/0001-z.md"), null);
  assert.equal(followArgvFor("unknown:thing"), null);
});

// ---------------------------------------------------------------------------
// 4. a-node-ref-is-never-reported-as-having-no-cli-read-because-one-demonstrably-exists
// ---------------------------------------------------------------------------

test("a-node-ref-is-never-reported-as-having-no-cli-read-because-one-demonstrably-exists", () => {
  const argv = followArgvFor("node:some-story");
  assert.notEqual(argv, null);
  if (argv === null) throw new Error("unreachable");
  assert.deepEqual(argv, ["tree", "some-story"]);

  // Demonstrate the CLI read genuinely exists: run the real allowlisted dispatcher over that exact
  // argv and observe a visit come back.
  const observed = observeCliInvocation(argv, REAL_CLI_DEPS);
  assert.equal(observed.length, 1);
  const visit = observed[0];
  assert.notEqual(visit, undefined);
  if (visit === undefined) throw new Error("unreachable");
  assert.equal(isContextVisitEvent(visit), true, "storytree tree <id> is a real, allowlisted CLI read");
  if (!isContextVisitEvent(visit)) throw new Error("unreachable");
  assert.equal(visit.nodeId, "some-story");
  assert.notEqual(
    visit.surfaceId,
    LIBRARY_ARTIFACT_SURFACE,
    "the read exists but lands on the tree surface, not the one emitFollowedEdge stamps",
  );

  // The classification must therefore report the SHARPER reason — a read exists but no follow
  // producer accepts its surface — never the false "no CLI read could ever follow it".
  const classified = classifyOfferObservability("node:some-story");
  const unobservable = expectUnobservable(classified, "node: ref");
  assert.equal(unobservable.reason, "a-cli-read-exists-but-no-follow-producer-accepts-its-surface");
  assert.notEqual(
    unobservable.reason,
    "no-cli-read-shape-observes-a-visit-for-this-offer",
    "a node: ref must never be reported as having no CLI read when one demonstrably exists",
  );
});

// ---------------------------------------------------------------------------
// 5. a-set-with-nothing-observable-renders-zero-and-never-a-hidden-division
// ---------------------------------------------------------------------------

test("a-set-with-nothing-observable-renders-zero-and-never-a-hidden-division", () => {
  const candidateSetId = candidateSetIdOf("visit-render-5");
  const offer = candidateSetEvent(candidateSetId, ["doc:decisions/0001-z.md", "doc:decisions/0002-y.md"]);

  const report = computeOfferObservability([offer]);
  assert.equal(report.points.length, 1);
  const point = report.points[0];
  assert.notEqual(point, undefined);
  if (point === undefined) throw new Error("unreachable");

  assert.equal(point.offered, 2);
  assert.equal(point.observable, 0);
  assert.equal(report.offered, 2);
  assert.equal(report.observable, 0);

  const rendered = renderOfferObservability(report);
  const expected = [
    "offer observability:",
    `  ${candidateSetId} — offered 2, observable 0 of 2; unobservable 2: ` +
      "no-cli-read-shape-observes-a-visit-for-this-offer x2",
    "  trace total — offered 2, observable 0 of 2: the followed counts above are over 0 " +
      "observable branches, not 2 offered",
    `  ${PATHWAY_CAVEAT}`,
  ].join("\n");
  assert.equal(rendered, expected);

  assert.equal(rendered.includes("NaN"), false);
  assert.equal(rendered.includes("Infinity"), false);
  assert.equal(rendered.includes("%"), false);
});

// ---------------------------------------------------------------------------
// 6. a-replay-with-no-recorded-offer-renders-no-observability-section-at-all
// ---------------------------------------------------------------------------

test("a-replay-with-no-recorded-offer-renders-no-observability-section-at-all", () => {
  const emptyReport = computeOfferObservability([]);
  assert.deepEqual(emptyReport.points, []);
  assert.equal(emptyReport.offered, 0);
  assert.equal(emptyReport.observable, 0);
  assert.equal(renderOfferObservability(emptyReport), "");

  // Events that carry a visit and other kinds, but never a candidate_set — still nothing recorded
  // as offered, so still no section at all.
  const bystanderVisit: ContextTraversalEvent = {
    kind: "full_payload_read",
    eventId: "event:visit-1",
    sessionId: "session-a",
    at: AT,
    visitId: "visit-1",
    nodeId: "alpha",
  };
  const noOfferEvents: ContextTraversalEvent[] = [bystanderVisit];
  const noOfferReport = computeOfferObservability(noOfferEvents);
  assert.deepEqual(noOfferReport.points, []);
  assert.equal(noOfferReport.offered, 0);
  assert.equal(noOfferReport.observable, 0);
  assert.equal(renderOfferObservability(noOfferReport), "");
});

// ---------------------------------------------------------------------------
// 7. the-denominator-covers-exactly-the-recorded-offers-with-none-dropped-or-added
// ---------------------------------------------------------------------------

test("the-denominator-covers-exactly-the-recorded-offers-with-none-dropped-or-added", () => {
  const setAId = candidateSetIdOf("visit-render-7a");
  const setBId = candidateSetIdOf("visit-render-7b");
  // Set A carries a genuine duplicate — the denominator must keep both slots, never collapse them.
  const offerA = candidateSetEvent(setAId, ["alpha", "alpha", "node:x"]);
  const offerB = candidateSetEvent(setBId, ["bravo"]);

  const events: ContextTraversalEvent[] = [offerA, offerB];
  const report = computeOfferObservability(events);

  assert.equal(report.points.length, 2, "one point per recorded candidate_set, in observed order");
  const [pointA, pointB] = report.points;
  assert.notEqual(pointA, undefined);
  assert.notEqual(pointB, undefined);
  if (pointA === undefined || pointB === undefined) throw new Error("unreachable");

  assert.equal(pointA.candidateSetId, setAId);
  assert.equal(pointA.offered, 3, "none dropped: both alpha slots and node:x all counted");
  assert.equal(pointA.offers.length, 3, "none dropped or added: exactly as many offers as candidateNodeIds");
  assert.equal(pointA.offers[0]?.nodeId, "alpha");
  assert.equal(pointA.offers[1]?.nodeId, "alpha");
  assert.equal(pointA.offers[2]?.nodeId, "node:x");
  assert.equal(pointA.observable, 2, "both alpha slots observable, node:x is not");

  assert.equal(pointB.candidateSetId, setBId);
  assert.equal(pointB.offered, 1);
  assert.equal(pointB.offers.length, 1);
  assert.equal(pointB.offers[0]?.nodeId, "bravo");
  assert.equal(pointB.observable, 1);

  // The trace-level denominator is the exact sum across points — nothing dropped, nothing added
  // beyond what was actually recorded.
  assert.equal(report.offered, pointA.offered + pointB.offered);
  assert.equal(report.offered, 4);
  assert.equal(report.observable, pointA.observable + pointB.observable);
  assert.equal(report.observable, 3);

  // THE COMPOSITION PIN, derived from BOTH returned reports rather than from hand-matched literals:
  // this denominator and the `decision points:` view must never disagree about what was on the table.
  // A reader sees the two blocks side by side, so an observability point covering a different set of
  // offers than the decision point above it would state a denominator for a picture nobody is looking
  // at. Both sides are read off the compute functions' own output; nothing here is re-composed.
  const decisions = computeDecisionPoints(events);
  assert.equal(
    decisions.points.length,
    report.points.length,
    "one observability point per decision point — neither view may skip a recorded candidate_set",
  );
  for (const [index, decisionPoint] of decisions.points.entries()) {
    const observabilityPoint = report.points[index];
    assert.notEqual(observabilityPoint, undefined);
    if (observabilityPoint === undefined) throw new Error("unreachable");

    assert.equal(
      observabilityPoint.candidateSetId,
      decisionPoint.candidateSetId,
      "the two views must pair up in the same observed order, set for set",
    );
    assert.equal(
      observabilityPoint.offered,
      decisionPoint.candidates.length,
      "the denominator must be the count the decision view actually renders",
    );
    assert.deepEqual(
      observabilityPoint.offers.map((offer) => offer.nodeId),
      decisionPoint.candidates.map((candidate) => candidate.nodeId),
      "…over exactly the same ids in exactly the same authored order, duplicates included",
    );
  }

  const decisionOfferedTotal = decisions.points.reduce((sum, point) => sum + point.candidates.length, 0);
  assert.equal(
    report.offered,
    decisionOfferedTotal,
    "the trace-level denominator must cover exactly the offers the decision view renders",
  );
});

test("both-pathway-statements-share-one-clause: the offer caveat and the whole-replay note make different claims but cannot drift on the fact underneath them", () => {
  // `adrs-into-the-dag-arc-inc-03`. Two surfaces state the capture's pathway limit — one bounds the
  // offer ratio's denominator, one bounds the whole replay — so they are deliberately worded
  // differently. The FACT under both is a single shared constant, and this test is the binding: a
  // re-wording that drops it from either reds here rather than leaving the two surfaces quietly
  // disagreeing about what the capture can see.
  assert.ok(
    PATHWAY_CAVEAT.includes(FILE_READS_OBSERVE_NOTHING),
    "the offer-block caveat composes the shared clause",
  );
  assert.ok(
    REPLAY_PATHWAY_NOTE.includes(FILE_READS_OBSERVE_NOTHING),
    "the whole-replay note composes the same shared clause",
  );

  // They are NOT the same sentence — the whole-replay note must not be the offer caveat reprinted,
  // because "these counts" means nothing outside the block it qualifies.
  assert.notEqual(REPLAY_PATHWAY_NOTE, PATHWAY_CAVEAT);

  // The whole-replay note carries NO statistic, deliberately: a renderer that hard-codes a dated
  // corpus measurement starts rotting the day it ships. The numbers live on the arc, with their
  // date and population attached.
  assert.doesNotMatch(REPLAY_PATHWAY_NOTE, /\d/, "no figure is baked into the render");

  // It says what IS observed and what is NOT — a note that named only the gap would read as a
  // disclaimer rather than a scope.
  assert.match(REPLAY_PATHWAY_NOTE, /storytree/i);
  assert.match(REPLAY_PATHWAY_NOTE, /docs\/decisions/);
});
