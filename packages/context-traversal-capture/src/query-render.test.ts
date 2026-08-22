/**
 * Pure replay renderers (ADR-0023 envelope shape, ADR-0235 clause 3/4/7, ADR-0241 D5), story
 * `context-traversal-capture`, capability `traversal-session-query`.
 *
 * Every fixture here is built through `createContextTraversalTrace()` / `declareCoverage()` so it is
 * parsed through increment 1's own vocabulary — a fixture cannot silently drift from the shape the
 * real sink actually reads back. Both renderers are pure: no filesystem, no clock, no store — every
 * assertion is over a returned string.
 *
 * Covers the four contracts declared in
 * `stories/context-traversal-capture/traversal-session-query.md`:
 *   1. session-list-is-newest-first-with-counts
 *   2. replay-renders-chronological-visits-with-read-strength
 *   3. capacity-renders-unknown-without-a-model-observation
 *   4. a-partial-replay-states-its-skipped-count
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createContextTraversalTrace, CoverageFeature } from "@storytree/context-traversal-telemetry";

import type { TraversalSessionSummary } from "./sink.js";
import { REPLAY_PATHWAY_NOTE } from "./offer-observability-share.js";
import { renderTraversalSessions, renderTraversalSession } from "./query-render.js";

test("session-list-is-newest-first-with-counts: the session index orders newest-observed first with counts, and an empty index renders without error", () => {
  const list: TraversalSessionSummary[] = [
    { sessionId: "session-older", eventCount: 3, lastObservedAt: "2026-07-20T00:00:00.000Z", identity: "window", slots: [] },
    { sessionId: "session-newest", eventCount: 5, lastObservedAt: "2026-07-25T00:00:00.000Z", identity: "window", slots: [] },
    { sessionId: "session-unknown-time", eventCount: 1, lastObservedAt: undefined, identity: "window", slots: [] },
  ];

  const result = renderTraversalSessions(list);
  assert.equal(result.ok, true);

  const newestIdx = result.body.indexOf("session-newest");
  const olderIdx = result.body.indexOf("session-older");
  const unknownIdx = result.body.indexOf("session-unknown-time");
  assert.ok(newestIdx >= 0, "session-newest must be rendered");
  assert.ok(olderIdx >= 0, "session-older must be rendered");
  assert.ok(unknownIdx >= 0, "session-unknown-time must be rendered even with no observed time");
  assert.ok(newestIdx < olderIdx, "the most-recently-observed session renders first");
  assert.ok(olderIdx < unknownIdx, "a session with no observed time sorts after every timestamped session");

  // each session line carries its own event count, not a neighbour's
  assert.match(result.body, /session-newest[^\n]*5/);
  assert.match(result.body, /session-older[^\n]*3/);
  assert.match(result.body, /session-unknown-time[^\n]*1/);
  assert.ok(result.body.includes("2026-07-25T00:00:00.000Z"), "the last-observed time is rendered");

  // ADR-0023 next: pointers so an owner can jump straight to the session they just ran, without
  // knowing its id up front
  assert.ok(Array.isArray(result.next) && result.next.length > 0, "the index offers next: pointers");
  assert.ok(
    result.next?.some((n) => n.includes("session-newest")),
    "a next: pointer names the session so the owner can act on it",
  );

  const empty = renderTraversalSessions([]);
  assert.equal(empty.ok, true, "an empty index is a valid, ok render, never a missing surface");
  assert.match(empty.body, /no captured sessions|no sessions/i);
});

test("session-list-is-newest-first-with-counts: every index row states what its session id NAMES, and a legacy slot-keyed row is labelled rather than merged with window-keyed ones", () => {
  const withLegacy: TraversalSessionSummary[] = [
    {
      sessionId: "7d61a5bb-c2cb-466d-ab19-8165d9a1f936",
      eventCount: 4,
      lastObservedAt: "2026-08-22T00:00:00.000Z",
      identity: "window",
      slots: ["confident-brahmagupta-b5b8f2"],
    },
    {
      sessionId: "clever-mestorf-1041a3",
      eventCount: 137,
      lastObservedAt: "2026-08-14T00:00:00.000Z",
      identity: "slot",
      slots: [],
    },
  ];

  const result = renderTraversalSessions(withLegacy);
  const rows = result.body.split("\n");
  const windowRow = rows.find((line) => line.includes("7d61a5bb")) ?? "";
  const slotRow = rows.find((line) => line.includes("clever-mestorf")) ?? "";

  assert.match(windowRow, /identity: window/, "a window-keyed row says so on its own line");
  assert.match(windowRow, /confident-brahmagupta-b5b8f2/, "and names the slot it ran in, as a grouping attribute");
  assert.match(slotRow, /identity: slot/, "a legacy row is labelled, never left to be read as a session");

  // The notice states the fact the label alone cannot: those rows cannot be repaired into window
  // identity, so a count over them is not one session's.
  assert.match(result.body, /not\s*\n?\s*retrofittable|not[\s\S]{0,40}retrofittable/i);
  assert.ok(result.body.includes("1 of 2"), "the notice sizes the legacy rows rather than gesturing at them");

  // ...and it is CONDITIONAL: a clean index grows no paragraph announcing an absence.
  const cleanIndex = renderTraversalSessions([
    { sessionId: "window-a", eventCount: 1, lastObservedAt: "2026-08-22T00:00:00.000Z", identity: "window", slots: [] },
  ]);
  assert.doesNotMatch(cleanIndex.body, /retrofittable/i);
});

test("replay-renders-chronological-visits-with-read-strength: each visit renders on its own chronological line, front-matter and full-payload stay visibly distinct, and a revisit links back only when priorVisitId is present", () => {
  const sessionId = "session-chrono";
  const trace = createContextTraversalTrace();
  trace.declareCoverage({
    adapterId: "chrono-fixture-adapter",
    supported: CoverageFeature.options,
    omitted: [],
  });

  // visit-1: a first, front-matter visit to node-a
  trace.append({
    kind: "front_matter_read",
    eventId: "event:visit-1",
    sessionId,
    at: "2026-07-26T00:00:00.000Z",
    visitId: "visit-1",
    nodeId: "node-a",
    surfaceId: "surface-a",
  });
  // visit-2: an independent, full-payload visit to a different node — no priorVisitId, so this is a
  // forward visit even though it follows visit-1 in time
  trace.append({
    kind: "full_payload_read",
    eventId: "event:visit-2",
    sessionId,
    at: "2026-07-26T00:00:01.000Z",
    visitId: "visit-2",
    nodeId: "node-b",
    surfaceId: "surface-b",
  });
  // visit-3: a genuine revisit of node-a — carries an explicit priorVisitId back to visit-1
  trace.append({
    kind: "front_matter_read",
    eventId: "event:visit-3",
    sessionId,
    at: "2026-07-26T00:00:02.000Z",
    visitId: "visit-3",
    nodeId: "node-a",
    surfaceId: "surface-a",
    priorVisitId: "visit-1",
  });

  const replay = trace.replay(sessionId);
  const result = renderTraversalSession(replay, { skipped: 0 });
  assert.equal(result.ok, true);

  // The identity line is OMITTED when the reader supplied none, exactly as `capacity:` refuses to
  // fabricate a window it never observed — an absent classification is not a slot-era one.
  assert.doesNotMatch(result.body, /^identity:/m);

  const lines = result.body.split("\n");
  const visit1Line = lines.findIndex((l) => l.includes("visit-1") && l.includes("node-a") && l.includes("surface-a"));
  const visit2Line = lines.findIndex((l) => l.includes("visit-2") && l.includes("node-b") && l.includes("surface-b"));
  const visit3Line = lines.findIndex((l) => l.includes("visit-3") && l.includes("node-a") && l.includes("surface-a"));
  assert.ok(visit1Line >= 0, "visit-1 renders with its nodeId and surfaceId");
  assert.ok(visit2Line >= 0, "visit-2 renders with its nodeId and surfaceId");
  assert.ok(visit3Line >= 0, "visit-3 renders with its nodeId and surfaceId");

  // chronological order, one line per event
  assert.ok(visit1Line < visit2Line, "visit-1 renders before visit-2, in observed order");
  assert.ok(visit2Line < visit3Line, "visit-2 renders before visit-3, in observed order");

  // read strength stays visibly distinct — never flattened to a generic "read"
  assert.match(lines[visit1Line] ?? "", /front.?matter/i);
  assert.doesNotMatch(lines[visit1Line] ?? "", /full.?payload/i);
  assert.match(lines[visit2Line] ?? "", /full.?payload/i);
  assert.doesNotMatch(lines[visit2Line] ?? "", /front.?matter/i);

  // a revisit renders as a NEW forward visit that links back only because priorVisitId is present —
  // never inferred from adjacency, ordering, or timestamp proximity
  assert.match(lines[visit3Line] ?? "", /revisit/i);
  assert.ok(
    (lines[visit3Line] ?? "").includes("visit-1"),
    "the revisit line names the earlier visit it actually points at",
  );
  // visit-2 immediately follows visit-1 in time but carries no priorVisitId, so it must NOT be
  // rendered as a revisit of anything
  assert.doesNotMatch(lines[visit2Line] ?? "", /revisit/i);
  assert.doesNotMatch(lines[visit1Line] ?? "", /revisit/i);
});

test("capacity-renders-unknown-without-a-model-observation: the coverage block always prints, and capacity states unknown rather than a default, a fabricated gauge, or the 500k threshold", () => {
  const sessionId = "session-capacity";
  const trace = createContextTraversalTrace();
  const supported: CoverageFeature[] = ["surface:direct_cli", "event:front_matter_read"];
  const omitted = CoverageFeature.options.filter((feature) => !supported.includes(feature));
  trace.declareCoverage({ adapterId: "capacity-fixture-adapter", supported, omitted });

  trace.append({
    kind: "front_matter_read",
    eventId: "event:cap-visit",
    sessionId,
    at: "2026-07-26T00:00:00.000Z",
    visitId: "cap-visit",
    nodeId: "node-cap",
    surfaceId: "surface-cap",
  });

  const replay = trace.replay(sessionId);
  // this replay carries no model_context event at all
  assert.equal(replay.sessions[0]?.modelContext.length ?? 0, 0);

  const result = renderTraversalSession(replay, { skipped: 0 });
  assert.equal(result.ok, true);

  // the adapter's own coverage declaration is always printed — supported AND omitted
  assert.ok(result.body.includes("capacity-fixture-adapter"), "the coverage block names the adapter");
  assert.ok(result.body.includes("surface:direct_cli"), "a supported feature is printed");
  assert.ok(
    omitted.some((feature) => result.body.includes(feature)),
    "an omitted feature is printed",
  );

  // capacity is honestly unknown — never a default, a fabricated gauge, or the 500k display-only
  // threshold rendered as if it were a real limit
  assert.match(result.body, /capacity[^\n]*unknown/i);
  assert.doesNotMatch(result.body, /500\s?[,]?000/);
  assert.doesNotMatch(result.body, /500\s?k/i);

  // with genuinely NO observation, the render says so — this is the disjunct the sibling test below
  // proves must NOT be reused when an observation is actually present
  const noObservationLine = result.body.split("\n").find((line) => line.startsWith("capacity:"));
  assert.match(noObservationLine ?? "", /no model_context observation/i);
});

test("capacity-renders-unknown-without-a-model-observation: an observed model_context that declares no capacity renders unknown WITHOUT denying the observation it just made", () => {
  const sessionId = "session-capacity-observed";
  const trace = createContextTraversalTrace();
  const supported: CoverageFeature[] = ["surface:spawned_agent", "event:model_context"];
  const omitted = CoverageFeature.options.filter((feature) => !supported.includes(feature));
  trace.declareCoverage({ adapterId: "observed-capacity-fixture-adapter", supported, omitted });

  // A real window observation that carries no capacity — reachable whenever the observation's source
  // declares none, or declares nothing this render may honestly collapse into a single number. This
  // is a shape the render must handle on its own terms; it is nobody's permanent "always", so this
  // fixture is built as a literal event rather than borrowed from any one adapter's current output.
  trace.append({
    kind: "model_context",
    eventId: "event:child-window",
    sessionId,
    at: "2026-07-26T00:00:00.000Z",
    modelId: "claude-opus-5",
    cumulativeInputTokens: 4_200,
    addedInputTokens: 4_200,
  });

  const replay = trace.replay(sessionId);
  // the observation IS present; it simply carries no capacity
  assert.equal(replay.sessions[0]?.modelContext.length, 1);
  assert.equal(replay.sessions[0]?.modelContext[0]?.contextWindowCapacity, undefined);

  const result = renderTraversalSession(replay, { skipped: 0 });
  assert.equal(result.ok, true);

  const capacityLine = result.body.split("\n").find((line) => line.startsWith("capacity:"));
  assert.ok(capacityLine !== undefined, "a capacity line renders");
  // "capacity: unknown" stays the leading token, so readers keying on that prefix still hold
  assert.match(capacityLine ?? "", /^capacity: unknown/);
  // ...but the line must NOT claim there was no observation — one was made and rendered
  assert.doesNotMatch(capacityLine ?? "", /no model_context observation/i);
  assert.match(capacityLine ?? "", /observed/i);
  // and capacity is still never invented, defaulted, or estimated
  assert.doesNotMatch(result.body, /500\s?[,]?000/);
  assert.doesNotMatch(result.body, /500\s?k/i);
  assert.doesNotMatch(capacityLine ?? "", /\d/);
});

test("replay-renders-chronological-visits-with-read-strength: the replay states what its session id NAMES, and a slot-keyed one says outright that its counts are not one session's", () => {
  const sessionId = "clever-mestorf-1041a3";
  const trace = createContextTraversalTrace();
  trace.append({
    kind: "full_payload_read",
    eventId: "event:identity-1",
    sessionId,
    at: "2026-08-22T00:00:00.000Z",
    visitId: "visit-identity-1",
    nodeId: "plan",
    surfaceId: "library-artifact",
  });
  const replay = trace.replay(sessionId);

  const slotKeyed = renderTraversalSession(replay, { skipped: 0, identity: "slot", slots: [] });
  assert.match(slotKeyed.body, /^identity: slot —/m, "the classification leads, then what it means");
  assert.match(slotKeyed.body, /pools/i, "a slot pools every window that ran in it");
  assert.match(slotKeyed.body, /retrofittable/i, "and no line records which window wrote it");

  const windowKeyed = renderTraversalSession(replay, {
    skipped: 0,
    identity: "window",
    slots: ["confident-brahmagupta-b5b8f2"],
  });
  assert.match(windowKeyed.body, /^identity: window —/m);
  assert.doesNotMatch(windowKeyed.body, /retrofittable/i, "a window-keyed replay carries no legacy warning");
  assert.match(
    windowKeyed.body,
    /^worktree slot: confident-brahmagupta-b5b8f2 \(a grouping attribute, never the identity\)$/m,
    "the slot is rendered as what it is — a grouping attribute beside the identity, not the identity",
  );

  // An EMPTY replay has no lines to classify, so it is labelled with nothing rather than with an era.
  const emptyTrace = createContextTraversalTrace();
  const empty = renderTraversalSession(emptyTrace.replay("session-empty"), { skipped: 0, identity: "slot", slots: [] });
  assert.doesNotMatch(empty.body, /^identity:/m);
});

test("a-partial-replay-states-its-skipped-count: a non-zero skipped count renders an explicit partial-read notice, and the render still returns a complete body rather than throwing", () => {
  const sessionId = "session-partial";
  const trace = createContextTraversalTrace();
  trace.declareCoverage({
    adapterId: "partial-fixture-adapter",
    supported: [],
    omitted: CoverageFeature.options,
  });
  trace.append({
    kind: "front_matter_read",
    eventId: "event:partial-visit",
    sessionId,
    at: "2026-07-26T00:00:00.000Z",
    visitId: "partial-visit",
    nodeId: "node-partial",
    surfaceId: "surface-partial",
  });

  const replay = trace.replay(sessionId);

  const withSkips = renderTraversalSession(replay, { skipped: 7 });
  assert.equal(withSkips.ok, true, "a partial replay still renders ok — it exits 0, not throws");
  assert.match(withSkips.body, /7[^\n]*skip/i);
  // the rest of the replay still renders — a partial notice never replaces the body
  assert.ok(withSkips.body.includes("node-partial"));

  const noSkips = renderTraversalSession(replay, { skipped: 0 });
  assert.equal(noSkips.ok, true);
  assert.doesNotMatch(noSkips.body, /skip/i);
});

test("the-replay-states-its-own-pathway-even-with-no-offers: the whole-picture observability note renders unconditionally, including on the sparse traces the old block-scoped caveat went silent on", () => {
  // `adrs-into-the-dag-arc-inc-03`. Before this, the only statement anywhere that file reads are
  // unobserved was `PATHWAY_CAVEAT`, printed on the offer-observability block — and
  // `renderOfferObservability` returns the empty string when a replay recorded no offer. So on
  // exactly the sparse traces most likely to be misread as "this session read lightly", the
  // admission was absent. This fixture is that trace: one visit, zero offers.
  const sessionId = "session-no-offers";
  const trace = createContextTraversalTrace();
  trace.declareCoverage({
    adapterId: "pathway-fixture-adapter",
    supported: [],
    omitted: CoverageFeature.options,
  });
  trace.append({
    kind: "front_matter_read",
    eventId: "event:pathway-visit",
    sessionId,
    at: "2026-08-21T00:00:00.000Z",
    visitId: "pathway-visit",
    nodeId: "node-pathway",
    surfaceId: "surface-pathway",
  });

  const replay = trace.replay(sessionId);
  const result = renderTraversalSession(replay, { skipped: 0 });
  assert.equal(result.ok, true);

  // the precondition this test exists for: no offer block renders at all
  assert.equal(
    result.body.includes("pathway — offers are recorded"),
    false,
    "the block-scoped caveat is genuinely absent on this replay",
  );

  // ...and the whole-picture note is present anyway
  assert.ok(
    result.body.includes(REPLAY_PATHWAY_NOTE),
    "the replay states what it does and does not observe, with no offer block to carry it",
  );

  // it sits with the render's other honesty lines rather than trailing the event list, so a reader
  // meets the scope before the contents
  const lines = result.body.split("\n");
  const noteLine = lines.findIndex((line) => line === REPLAY_PATHWAY_NOTE);
  const visitsLine = lines.findIndex((line) => line === "visits:");
  assert.ok(noteLine >= 0 && visitsLine >= 0);
  assert.ok(noteLine < visitsLine, "the pathway note precedes the event list");

  // and it never displaces what was already there
  assert.ok(result.body.includes("node-pathway"), "the events still render");
  assert.match(result.body, /capacity:/);
  assert.match(result.body, /coverage:/);
});
