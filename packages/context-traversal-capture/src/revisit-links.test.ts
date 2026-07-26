/**
 * Revisit-link metadata (ADR-0235, ADR-0241), story `context-traversal-capture`, capability
 * `revisit-link-metadata`.
 *
 * Every fixture here is hand-built in memory — no filesystem, no clock, no id generation — because
 * `linkRevisits` is a total, pure function over already-observed events. Every assertion reads the
 * events `linkRevisits` RETURNED (never a value the test composed), and the absent-key claim is made
 * on the JSON round-trip so it describes the bytes the sink will actually write.
 *
 * Covers the five contracts declared in `stories/context-traversal-capture/revisit-link-metadata.md`:
 *   1. prior-visit-id-names-the-latest-earlier-visit-to-the-same-node
 *   2. a-first-visit-carries-no-prior-link
 *   3. links-never-cross-a-node-or-a-session
 *   4. linking-is-idempotent-and-never-self-referential
 *   5. composed-coverage-declares-prior-visit-links-and-stays-exhaustive
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ContextTraversalCoverage, ContextTraversalEvent, CoverageFeature } from "@storytree/context-traversal-telemetry";

import { TERMINAL_CLI_DISPATCH_COVERAGE } from "./observe-cli.js";
import { linkRevisits, REVISIT_LINK_COVERAGE } from "./revisit-links.js";

const AT = "2026-07-26T00:00:00.000Z";

/** A minimal, schema-valid visit event — no optional fields set, so absence stays absence. */
function visit(
  kind: "front_matter_read" | "full_payload_read",
  eventId: string,
  sessionId: string,
  visitId: string,
  nodeId: string,
): ContextTraversalEvent {
  return {
    kind,
    eventId,
    sessionId,
    at: AT,
    visitId,
    nodeId,
  };
}

function priorVisitIdOf(event: ContextTraversalEvent): string | undefined {
  return "priorVisitId" in event ? event.priorVisitId : undefined;
}

function assertParses(event: unknown): void {
  const parsed = ContextTraversalEvent.safeParse(event);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
}

test("prior-visit-id-names-the-latest-earlier-visit-to-the-same-node", () => {
  const priorEvents: ContextTraversalEvent[] = [
    visit("front_matter_read", "event:v1", "session-a", "v1", "node-x"),
    visit("full_payload_read", "event:v2", "session-a", "v2", "node-x"),
  ];
  const observed: ContextTraversalEvent[] = [visit("front_matter_read", "event:v3", "session-a", "v3", "node-x")];

  const result = linkRevisits(observed, priorEvents);
  assert.equal(result.length, 1);
  const [linked] = result;
  assert.ok(linked);
  assertParses(linked);
  // must name the LATEST earlier visit (v2), never the first one (v1), and never come back unlinked.
  assert.equal(priorVisitIdOf(linked), "v2");
});

test("a-first-visit-carries-no-prior-link", () => {
  const observed: ContextTraversalEvent[] = [visit("front_matter_read", "event:only", "session-a", "only", "node-x")];

  const result = linkRevisits(observed, []);
  assert.equal(result.length, 1);
  const [linked] = result;
  assert.ok(linked);
  assertParses(linked);

  // The claim is about the bytes the sink will write, not an in-memory `undefined` — round-trip it.
  const roundTripped = JSON.parse(JSON.stringify(linked)) as Record<string, unknown>;
  assert.equal("priorVisitId" in roundTripped, false);
});

test("links-never-cross-a-node-or-a-session", () => {
  // Case A: an earlier visit exists, but to a DIFFERENT node — must never become a prior link.
  const differentNodePrior: ContextTraversalEvent[] = [
    visit("front_matter_read", "event:y1", "session-a", "y1", "node-y"),
  ];
  const observedX: ContextTraversalEvent[] = [visit("front_matter_read", "event:x1", "session-a", "x1", "node-x")];
  const resultA = linkRevisits(observedX, differentNodePrior);
  assert.equal(resultA.length, 1);
  const [linkedA] = resultA;
  assert.ok(linkedA);
  assertParses(linkedA);
  assert.equal(priorVisitIdOf(linkedA), undefined);

  // Case B: an earlier visit exists with the SAME node, but a DIFFERENT session — still no link.
  const differentSessionPrior: ContextTraversalEvent[] = [
    visit("front_matter_read", "event:x0", "session-b", "x0", "node-x"),
  ];
  const observedSessionA: ContextTraversalEvent[] = [
    visit("full_payload_read", "event:x2", "session-a", "x2", "node-x"),
  ];
  const resultB = linkRevisits(observedSessionA, differentSessionPrior);
  assert.equal(resultB.length, 1);
  const [linkedB] = resultB;
  assert.ok(linkedB);
  assertParses(linkedB);
  assert.equal(priorVisitIdOf(linkedB), undefined);
});

test("linking-is-idempotent-and-never-self-referential", () => {
  // A batch carrying two visits to the same node links internally — the second must find the first,
  // never itself.
  const observed: ContextTraversalEvent[] = [
    visit("front_matter_read", "event:i1", "session-a", "i1", "node-x"),
    visit("full_payload_read", "event:i2", "session-a", "i2", "node-x"),
  ];

  const firstPass = linkRevisits(observed, []);
  assert.equal(firstPass.length, 2);
  for (const event of firstPass) {
    assertParses(event);
    assert.notEqual(priorVisitIdOf(event), "visitId" in event ? event.visitId : undefined);
  }
  const [firstLinked, secondLinked] = firstPass;
  assert.ok(firstLinked && secondLinked);
  assert.equal(priorVisitIdOf(firstLinked), undefined);
  assert.equal(priorVisitIdOf(secondLinked), "i1");

  // Re-running over the already-linked batch must return the SAME links, never a self-reference —
  // this is the falsifiability case: an implementation that appends `observed` to its own prior list
  // before searching would make a single visit (or a re-run) link to itself.
  const secondPass = linkRevisits(firstPass, []);
  assert.deepEqual(
    secondPass.map((event) => priorVisitIdOf(event)),
    firstPass.map((event) => priorVisitIdOf(event)),
  );
  for (const event of secondPass) {
    assertParses(event);
    assert.notEqual(priorVisitIdOf(event), "visitId" in event ? event.visitId : undefined);
  }
});

test("composed-coverage-declares-prior-visit-links-and-stays-exhaustive", () => {
  const parsed = ContextTraversalCoverage.parse(REVISIT_LINK_COVERAGE);
  assert.equal(parsed.adapterId, "terminal-cli-dispatch");

  assert.ok(parsed.supported.includes("field:prior_visit_id"));
  assert.equal(parsed.omitted.includes("field:prior_visit_id"), false);

  // every feature the base declared supported is still supported — composition, never a rewrite.
  for (const feature of TERMINAL_CLI_DISPATCH_COVERAGE.supported) {
    assert.ok(parsed.supported.includes(feature), `expected base-supported ${feature} to remain supported`);
  }

  // this increment ships no causality claim — those stay omitted.
  const stillOmitted: CoverageFeature[] = ["event:followed_edge", "field:candidate_follow_causality"];
  for (const feature of stillOmitted) {
    assert.ok(parsed.omitted.includes(feature), `expected ${feature} to remain omitted`);
  }

  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});
