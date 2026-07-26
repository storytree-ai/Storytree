/**
 * Contract tests for the strict metadata-only context-traversal event vocabulary and its
 * deterministic record/replay trace (story `context-traversal-telemetry`, capability
 * `traversal-event-vocabulary`, ADR-0235 / ADR-0192).
 *
 * Covers the six contracts declared in
 * `stories/context-traversal-telemetry/traversal-event-vocabulary.md`:
 *   1. canonical-and-chronological-identity-stay-separate
 *   2. read-strength-is-an-event-kind
 *   3. capacity-is-runtime-declared-or-unknown
 *   4. spawn-edge-schemas-link-independent-sessions
 *   5. adapter-coverage-names-omissions
 *   6. replay-does-not-infer-relationships
 *
 * Every assertion is made against a value that came back OUT of a schema `.parse()`/`.safeParse()`
 * call or a trace's `append`/`replay`, never against the literal object a test composed — per the
 * story's own falsifiability bar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextTraversalEvent,
  FrontMatterReadEvent,
  FullPayloadReadEvent,
  SearchEvent,
  CandidateSetEvent,
  FollowedEdgeEvent,
  ModelContextEvent,
  SpawnHandoffEvent,
  ResultReturnEvent,
  CoverageFeature,
  ContextTraversalCoverage,
  isContextVisitEvent,
} from "./traversal-events.js";

import { createContextTraversalTrace } from "./traversal-trace.js";

const AT = "2026-07-26T00:00:00.000Z";

// ---------------------------------------------------------------------------
// 1. canonical-and-chronological-identity-stay-separate
// ---------------------------------------------------------------------------

test("canonical-and-chronological-identity-stay-separate: sessionId/visitId/nodeId are separate identities, a revisit needs a new visitId and may name priorVisitId, a duplicate visitId throws, and a blank sessionId/nodeId fails to parse", () => {
  const trace = createContextTraversalTrace();
  const sessionId = "session-identity";

  trace.append({
    kind: "front_matter_read",
    eventId: "event:visit-1",
    sessionId,
    at: AT,
    visitId: "visit-1",
    nodeId: "node-a",
  });
  trace.append({
    kind: "front_matter_read",
    eventId: "event:visit-2",
    sessionId,
    at: "2026-07-26T00:00:01.000Z",
    visitId: "visit-2",
    nodeId: "node-a",
    priorVisitId: "visit-1",
  });

  const replay = trace.replay(sessionId);
  assert.equal(replay.events.length, 2);
  const [first, second] = replay.events;
  assert.ok(first !== undefined && "visitId" in first);
  assert.ok(second !== undefined && "visitId" in second);
  if (first !== undefined && "visitId" in first && second !== undefined && "visitId" in second) {
    // canonical nodeId is shared across a revisit, but chronological visitId is never reused
    assert.equal(first.nodeId, "node-a");
    assert.equal(second.nodeId, "node-a");
    assert.notEqual(first.visitId, second.visitId);
    assert.equal(first.sessionId.length > 0, true);
    assert.equal(second.sessionId.length > 0, true);
    assert.equal(second.priorVisitId, "visit-1");
    assert.equal(first.priorVisitId, undefined);
  }

  // a duplicate visitId must throw, never dedupe silently
  assert.throws(() => {
    trace.append({
      kind: "full_payload_read",
      eventId: "event:visit-3",
      sessionId,
      at: "2026-07-26T00:00:02.000Z",
      visitId: "visit-1",
      nodeId: "node-b",
    });
  });

  // a duplicate eventId must also throw, even with a fresh visitId
  assert.throws(() => {
    trace.append({
      kind: "full_payload_read",
      eventId: "event:visit-1",
      sessionId,
      at: "2026-07-26T00:00:03.000Z",
      visitId: "visit-4",
      nodeId: "node-c",
    });
  });

  // a blank or whitespace-only sessionId must fail to parse
  assert.equal(
    FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: "event:blank-session",
      sessionId: "",
      at: AT,
      visitId: "visit-blank-session",
      nodeId: "node-blank-session",
    }).success,
    false,
  );
  assert.equal(
    FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: "event:blank-session-ws",
      sessionId: "   ",
      at: AT,
      visitId: "visit-blank-session-ws",
      nodeId: "node-blank-session-ws",
    }).success,
    false,
  );

  // a blank or whitespace-only nodeId must fail to parse
  assert.equal(
    FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: "event:blank-node",
      sessionId,
      at: AT,
      visitId: "visit-blank-node",
      nodeId: "",
    }).success,
    false,
  );
  assert.equal(
    FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: "event:blank-node-ws",
      sessionId,
      at: AT,
      visitId: "visit-blank-node-ws",
      nodeId: "   ",
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 2. read-strength-is-an-event-kind
// ---------------------------------------------------------------------------

test("read-strength-is-an-event-kind: front-matter and full-payload parse as distinct kinds carrying identity metadata only, and any content-bearing or unknown field is refused", () => {
  const frontMatter = FrontMatterReadEvent.parse({
    kind: "front_matter_read",
    eventId: "event:fm-1",
    sessionId: "session-strength",
    at: AT,
    visitId: "visit-fm-1",
    nodeId: "node-fm",
    surfaceId: "surface-fm",
  });
  assert.equal(frontMatter.kind, "front_matter_read");

  const fullPayload = FullPayloadReadEvent.parse({
    kind: "full_payload_read",
    eventId: "event:fp-1",
    sessionId: "session-strength",
    at: AT,
    visitId: "visit-fp-1",
    nodeId: "node-fp",
  });
  assert.equal(fullPayload.kind, "full_payload_read");
  assert.notEqual(frontMatter.kind, fullPayload.kind);

  // both kinds parse through the union too, keeping the discriminant intact
  assert.equal(ContextTraversalEvent.parse(frontMatter).kind, "front_matter_read");
  assert.equal(ContextTraversalEvent.parse(fullPayload).kind, "full_payload_read");

  // any content-bearing field is refused on either kind — the negative case carries this contract
  const contentBearingKeys = ["body", "text", "metadata", "prompt", "reasoning"];
  for (const key of contentBearingKeys) {
    const withBody = FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: `event:fm-${key}`,
      sessionId: "session-strength",
      at: AT,
      visitId: `visit-fm-${key}`,
      nodeId: "node-fm",
      [key]: "some content this schema must refuse",
    });
    assert.equal(withBody.success, false, `front_matter_read must refuse an extra "${key}" field`);

    const withBodyFull = FullPayloadReadEvent.safeParse({
      kind: "full_payload_read",
      eventId: `event:fp-${key}`,
      sessionId: "session-strength",
      at: AT,
      visitId: `visit-fp-${key}`,
      nodeId: "node-fp",
      [key]: "some content this schema must refuse",
    });
    assert.equal(withBodyFull.success, false, `full_payload_read must refuse an extra "${key}" field`);
  }

  // an entirely unknown key is refused too, not just the plausible content-bearing names
  assert.equal(
    FrontMatterReadEvent.safeParse({
      kind: "front_matter_read",
      eventId: "event:fm-unknown",
      sessionId: "session-strength",
      at: AT,
      visitId: "visit-fm-unknown",
      nodeId: "node-fm",
      totallyUnrecognisedField: 42,
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 3. capacity-is-runtime-declared-or-unknown
// ---------------------------------------------------------------------------

test("capacity-is-runtime-declared-or-unknown: non-negative token observations parse, absent capacity stays absent as a key, a supplied positive capacity is retained verbatim, and a negative token count or a zero/negative capacity is refused", () => {
  const noCapacity = ModelContextEvent.parse({
    kind: "model_context",
    eventId: "event:mc-no-capacity",
    sessionId: "session-capacity",
    at: AT,
    cumulativeInputTokens: 1_000,
    addedInputTokens: 400,
  });
  // absence asserted as an absent KEY, not a falsy value — a default of 0/null would leave the key present
  assert.equal("contextWindowCapacity" in noCapacity, false);
  assert.equal(Object.hasOwn(noCapacity, "contextWindowCapacity"), false);

  const withCapacity = ModelContextEvent.parse({
    kind: "model_context",
    eventId: "event:mc-with-capacity",
    sessionId: "session-capacity",
    at: AT,
    modelId: "claude-opus-5",
    cumulativeInputTokens: 1_000,
    addedInputTokens: 400,
    contextWindowCapacity: 200_000,
  });
  assert.equal(withCapacity.contextWindowCapacity, 200_000);
  assert.equal(withCapacity.modelId, "claude-opus-5");

  // zero token observations are a legal non-negative value
  const zeroTokens = ModelContextEvent.parse({
    kind: "model_context",
    eventId: "event:mc-zero",
    sessionId: "session-capacity",
    at: AT,
    cumulativeInputTokens: 0,
    addedInputTokens: 0,
  });
  assert.equal(zeroTokens.cumulativeInputTokens, 0);
  assert.equal(zeroTokens.addedInputTokens, 0);

  // a negative cumulative or added token count is refused
  assert.equal(
    ModelContextEvent.safeParse({
      kind: "model_context",
      eventId: "event:mc-neg-cum",
      sessionId: "session-capacity",
      at: AT,
      cumulativeInputTokens: -1,
      addedInputTokens: 0,
    }).success,
    false,
  );
  assert.equal(
    ModelContextEvent.safeParse({
      kind: "model_context",
      eventId: "event:mc-neg-added",
      sessionId: "session-capacity",
      at: AT,
      cumulativeInputTokens: 0,
      addedInputTokens: -1,
    }).success,
    false,
  );

  // a zero or negative capacity is never a legal capacity — it must be refused, not coerced to absent
  assert.equal(
    ModelContextEvent.safeParse({
      kind: "model_context",
      eventId: "event:mc-zero-capacity",
      sessionId: "session-capacity",
      at: AT,
      cumulativeInputTokens: 10,
      addedInputTokens: 10,
      contextWindowCapacity: 0,
    }).success,
    false,
  );
  assert.equal(
    ModelContextEvent.safeParse({
      kind: "model_context",
      eventId: "event:mc-negative-capacity",
      sessionId: "session-capacity",
      at: AT,
      cumulativeInputTokens: 10,
      addedInputTokens: 10,
      contextWindowCapacity: -5,
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 4. spawn-edge-schemas-link-independent-sessions
// ---------------------------------------------------------------------------

test("spawn-edge-schemas-link-independent-sessions: handoff/return schemas require explicit parent+child session ids and an edge id, expose metadata counts at most, and refuse a self-referencing parent/child pair, a mismatched sessionId, or a payload/result body", () => {
  const validHandoff = SpawnHandoffEvent.parse({
    kind: "spawn_handoff",
    eventId: "event:spawn-1",
    sessionId: "session-parent",
    at: AT,
    edgeId: "edge-1",
    parentSessionId: "session-parent",
    childSessionId: "session-child",
    agentType: "red-builder",
  });
  assert.equal(validHandoff.parentSessionId, "session-parent");
  assert.equal(validHandoff.childSessionId, "session-child");
  assert.equal(validHandoff.sessionId, validHandoff.parentSessionId);
  // no payload token count supplied — must stay an absent key, not a fabricated zero
  assert.equal(Object.hasOwn(validHandoff, "payloadTokenCount"), false);

  const handoffWithCount = SpawnHandoffEvent.parse({
    kind: "spawn_handoff",
    eventId: "event:spawn-2",
    sessionId: "session-parent",
    at: AT,
    edgeId: "edge-2",
    parentSessionId: "session-parent",
    childSessionId: "session-child-2",
    agentType: "green-builder",
    payloadTokenCount: 250,
  });
  assert.equal(handoffWithCount.payloadTokenCount, 250);

  const validReturn = ResultReturnEvent.parse({
    kind: "result_return",
    eventId: "event:result-1",
    sessionId: "session-parent",
    at: AT,
    edgeId: "edge-1",
    parentSessionId: "session-parent",
    childSessionId: "session-child",
    ok: true,
  });
  assert.equal(validReturn.parentSessionId, "session-parent");
  assert.equal(validReturn.childSessionId, "session-child");
  assert.equal(Object.hasOwn(validReturn, "resultTokenCount"), false);

  const returnWithCount = ResultReturnEvent.parse({
    kind: "result_return",
    eventId: "event:result-2",
    sessionId: "session-parent",
    at: AT,
    edgeId: "edge-2",
    parentSessionId: "session-parent",
    childSessionId: "session-child-2",
    ok: false,
    resultTokenCount: 90,
  });
  assert.equal(returnWithCount.resultTokenCount, 90);
  assert.equal(returnWithCount.ok, false);

  // both kinds parse through the union too
  assert.equal(ContextTraversalEvent.parse(validHandoff).kind, "spawn_handoff");
  assert.equal(ContextTraversalEvent.parse(validReturn).kind, "result_return");

  // a self-referencing parent/child pair must be refused on both handoff and return
  assert.equal(
    SpawnHandoffEvent.safeParse({
      kind: "spawn_handoff",
      eventId: "event:spawn-self",
      sessionId: "session-x",
      at: AT,
      edgeId: "edge-self",
      parentSessionId: "session-x",
      childSessionId: "session-x",
      agentType: "red-builder",
    }).success,
    false,
  );
  assert.equal(
    ResultReturnEvent.safeParse({
      kind: "result_return",
      eventId: "event:result-self",
      sessionId: "session-x",
      at: AT,
      edgeId: "edge-self",
      parentSessionId: "session-x",
      childSessionId: "session-x",
      ok: true,
    }).success,
    false,
  );

  // sessionId that is not the parent must be refused on both handoff and return
  assert.equal(
    SpawnHandoffEvent.safeParse({
      kind: "spawn_handoff",
      eventId: "event:spawn-mismatch",
      sessionId: "session-someone-else",
      at: AT,
      edgeId: "edge-mismatch",
      parentSessionId: "session-parent",
      childSessionId: "session-child",
      agentType: "red-builder",
    }).success,
    false,
  );
  assert.equal(
    ResultReturnEvent.safeParse({
      kind: "result_return",
      eventId: "event:result-mismatch",
      sessionId: "session-someone-else",
      at: AT,
      edgeId: "edge-mismatch",
      parentSessionId: "session-parent",
      childSessionId: "session-child",
      ok: true,
    }).success,
    false,
  );

  // a payload or result body must fail to parse — this increment proves only the vocabulary
  assert.equal(
    SpawnHandoffEvent.safeParse({
      kind: "spawn_handoff",
      eventId: "event:spawn-payload",
      sessionId: "session-parent",
      at: AT,
      edgeId: "edge-payload",
      parentSessionId: "session-parent",
      childSessionId: "session-child",
      agentType: "red-builder",
      payload: "the actual prompt text",
    }).success,
    false,
  );
  assert.equal(
    ResultReturnEvent.safeParse({
      kind: "result_return",
      eventId: "event:result-body",
      sessionId: "session-parent",
      at: AT,
      edgeId: "edge-body",
      parentSessionId: "session-parent",
      childSessionId: "session-child",
      ok: true,
      result: "the actual result content",
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 5. adapter-coverage-names-omissions
// ---------------------------------------------------------------------------

test("adapter-coverage-names-omissions: coverage requires every feature named exactly once across supported/omitted, and refuses a feature missing from both, a feature on both, an unknown feature literal, or a content-bearing extra field", () => {
  const features = CoverageFeature.options;
  assert.ok(features.length > 0);

  const exhaustive = ContextTraversalCoverage.parse({
    adapterId: "adapter-exhaustive",
    supported: features,
    omitted: [],
  });
  assert.deepEqual([...exhaustive.supported], [...features]);
  assert.deepEqual(exhaustive.omitted, []);

  // a feature omitted from BOTH lists must be refused — exhaustiveness is checked over
  // CoverageFeature.options itself, not a hand-listed subset
  const missingFeature = features[0];
  assert.ok(missingFeature !== undefined);
  const rest = features.slice(1);
  const half = Math.floor(rest.length / 2);
  const partialSupported = rest.slice(0, half);
  const partialOmitted = rest.slice(half);
  assert.equal(
    ContextTraversalCoverage.safeParse({
      adapterId: "adapter-missing-one",
      supported: partialSupported,
      omitted: partialOmitted,
    }).success,
    false,
    `omitting ${String(missingFeature)} from both lists must be refused`,
  );

  // a feature named on BOTH lists must be refused, even though every feature is technically covered
  assert.equal(
    ContextTraversalCoverage.safeParse({
      adapterId: "adapter-duplicate",
      supported: features,
      omitted: [missingFeature],
    }).success,
    false,
  );

  // an unknown feature literal must be refused — the domain is closed
  assert.equal(
    ContextTraversalCoverage.safeParse({
      adapterId: "adapter-unknown-feature",
      supported: ["surface:not_a_real_surface"],
      omitted: features,
    }).success,
    false,
  );

  // a content-bearing or otherwise unrecognised extra field must be refused — strict, no side door
  assert.equal(
    ContextTraversalCoverage.safeParse({
      adapterId: "adapter-extra-field",
      supported: features,
      omitted: [],
      notes: "free text describing this adapter",
    }).success,
    false,
  );

  // a blank adapterId must be refused, same identity discipline as sessionId/nodeId above
  assert.equal(
    ContextTraversalCoverage.safeParse({
      adapterId: "",
      supported: features,
      omitted: [],
    }).success,
    false,
  );

  // append-time duplicate refusal: declareCoverage refuses a duplicate adapterId
  const trace = createContextTraversalTrace();
  trace.declareCoverage({ adapterId: "adapter-once", supported: features, omitted: [] });
  assert.throws(() => {
    trace.declareCoverage({ adapterId: "adapter-once", supported: [], omitted: features });
  });
});

// ---------------------------------------------------------------------------
// 6. replay-does-not-infer-relationships
// ---------------------------------------------------------------------------

test("replay-does-not-infer-relationships: replay orders events by their own timestamp (not insertion order), two adjacent-in-time visits with no explicit id create no relationship, an explicit priorVisitId does, and parent/child token windows stay separate", () => {
  const trace = createContextTraversalTrace();

  // --- ordering + no-inference leg -----------------------------------------------------------
  const adjacentSessionId = "session-adjacent";
  trace.append({
    kind: "full_payload_read",
    eventId: "event:adj-b",
    sessionId: adjacentSessionId,
    at: "2026-07-26T00:00:05.000Z",
    visitId: "visit-adj-b",
    nodeId: "node-b",
  });
  trace.append({
    kind: "front_matter_read",
    eventId: "event:adj-a",
    sessionId: adjacentSessionId,
    at: "2026-07-26T00:00:01.000Z",
    visitId: "visit-adj-a",
    nodeId: "node-a",
  });

  const adjacentReplay = trace.replay(adjacentSessionId);
  assert.equal(adjacentReplay.events.length, 2);
  const visitIds = adjacentReplay.events.map((event) => ("visitId" in event ? event.visitId : undefined));
  // ordered by `at`, not by the order the two were appended in
  assert.deepEqual(visitIds, ["visit-adj-a", "visit-adj-b"]);
  // two visits that merely happen to be adjacent in time, with no priorVisitId/followedEdgeId,
  // must produce NO relationship at all
  assert.deepEqual(adjacentReplay.relationships, []);

  // --- explicit-id leg -------------------------------------------------------------------------
  const linkedSessionId = "session-linked";
  trace.append({
    kind: "front_matter_read",
    eventId: "event:linked-1",
    sessionId: linkedSessionId,
    at: AT,
    visitId: "visit-linked-1",
    nodeId: "node-linked",
  });
  trace.append({
    kind: "front_matter_read",
    eventId: "event:linked-2",
    sessionId: linkedSessionId,
    at: "2026-07-26T00:00:01.000Z",
    visitId: "visit-linked-2",
    nodeId: "node-linked",
    priorVisitId: "visit-linked-1",
  });

  const linkedReplay = trace.replay(linkedSessionId);
  assert.equal(linkedReplay.events.length, 2);
  assert.equal(linkedReplay.relationships.length, 1);
  const [relationship] = linkedReplay.relationships;
  assert.ok(relationship !== undefined);
  if (relationship !== undefined) {
    assert.equal(relationship.fromId, "visit-linked-1");
    assert.equal(relationship.toId, "visit-linked-2");
  }

  // --- independent parent/child token windows -------------------------------------------------
  const parentSessionId = "session-parent-window";
  const childSessionId = "session-child-window";
  trace.append({
    kind: "model_context",
    eventId: "event:window-parent",
    sessionId: parentSessionId,
    at: AT,
    cumulativeInputTokens: 111,
    addedInputTokens: 111,
  });
  trace.append({
    kind: "model_context",
    eventId: "event:window-child",
    sessionId: childSessionId,
    at: AT,
    cumulativeInputTokens: 999,
    addedInputTokens: 999,
  });

  const parentReplay = trace.replay(parentSessionId);
  const childReplay = trace.replay(childSessionId);

  // each session's own replay carries only its own window, never the other's
  for (const event of parentReplay.events) {
    assert.equal(event.sessionId, parentSessionId);
  }
  for (const event of childReplay.events) {
    assert.equal(event.sessionId, childSessionId);
  }
  const parentContext = parentReplay.events.find((event) => event.kind === "model_context");
  const childContext = childReplay.events.find((event) => event.kind === "model_context");
  assert.ok(parentContext?.kind === "model_context" && childContext?.kind === "model_context");
  if (parentContext?.kind === "model_context" && childContext?.kind === "model_context") {
    assert.equal(parentContext.cumulativeInputTokens, 111);
    assert.equal(childContext.cumulativeInputTokens, 999);
  }

  // the `sessions` lane view mirrors the same separation: querying the parent session never
  // surfaces the child's own modelContext observation, and vice versa
  assert.ok(Array.isArray(parentReplay.sessions));
  assert.ok(Array.isArray(childReplay.sessions));
  const parentLane = parentReplay.sessions.find((lane) => lane.sessionId === parentSessionId);
  const childLane = childReplay.sessions.find((lane) => lane.sessionId === childSessionId);
  assert.ok(parentLane !== undefined);
  assert.ok(childLane !== undefined);
  if (parentLane !== undefined && childLane !== undefined) {
    assert.equal(parentLane.modelContext.length, 1);
    assert.equal(parentLane.modelContext[0]?.cumulativeInputTokens, 111);
    assert.equal(childLane.modelContext.length, 1);
    assert.equal(childLane.modelContext[0]?.cumulativeInputTokens, 999);
  }
});

// ---------------------------------------------------------------------------
// Published-surface smoke: the remaining exported members compile and behave, so the two
// downstream packages that import this package by name keep working.
// ---------------------------------------------------------------------------

test("published-surface-smoke: SearchEvent, CandidateSetEvent, FollowedEdgeEvent parse, and isContextVisitEvent narrows only the two visit kinds", () => {
  const search = SearchEvent.parse({
    kind: "search",
    eventId: "event:search-1",
    sessionId: "session-smoke",
    at: AT,
    searchId: "search-1",
    surfaceId: "library-artifact",
    operation: "library_artifact_list",
    resultNodeIds: ["node-1", "node-2"],
  });
  assert.deepEqual(search.resultNodeIds, ["node-1", "node-2"]);
  assert.equal(
    SearchEvent.safeParse({
      kind: "search",
      eventId: "event:search-bad-op",
      sessionId: "session-smoke",
      at: AT,
      searchId: "search-bad",
      surfaceId: "library-artifact",
      operation: "not_a_real_operation",
      resultNodeIds: [],
    }).success,
    false,
  );

  const candidateSet = CandidateSetEvent.parse({
    kind: "candidate_set",
    eventId: "event:candidates-1",
    sessionId: "session-smoke",
    at: AT,
    candidateSetId: "candidates-1",
    surfaceId: "library-artifact",
    candidateNodeIds: ["node-1"],
  });
  assert.equal(candidateSet.candidateNodeIds.length, 1);
  // a non-empty candidateNodeIds list is required
  assert.equal(
    CandidateSetEvent.safeParse({
      kind: "candidate_set",
      eventId: "event:candidates-empty",
      sessionId: "session-smoke",
      at: AT,
      candidateSetId: "candidates-empty",
      surfaceId: "library-artifact",
      candidateNodeIds: [],
    }).success,
    false,
  );

  const followedEdge = FollowedEdgeEvent.parse({
    kind: "followed_edge",
    eventId: "event:edge-1",
    sessionId: "session-smoke",
    at: AT,
    edgeId: "edge-1",
    candidateSetId: "candidates-1",
    fromVisitId: "visit-from",
    toVisitId: "visit-to",
  });
  assert.equal(followedEdge.fromVisitId, "visit-from");
  assert.equal(followedEdge.toVisitId, "visit-to");

  const visit = FrontMatterReadEvent.parse({
    kind: "front_matter_read",
    eventId: "event:visit-narrow",
    sessionId: "session-smoke",
    at: AT,
    visitId: "visit-narrow",
    nodeId: "node-narrow",
  });
  assert.equal(isContextVisitEvent(visit), true);
  assert.equal(isContextVisitEvent(search), false);
  assert.equal(isContextVisitEvent(candidateSet), false);
  assert.equal(isContextVisitEvent(followedEdge), false);
});
