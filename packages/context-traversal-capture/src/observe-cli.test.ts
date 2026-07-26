import assert from "node:assert/strict";
import { test } from "node:test";

import { ContextTraversalCoverage, ContextTraversalEvent, CoverageFeature } from "@storytree/context-traversal-telemetry";

import { observeCliInvocation, TERMINAL_CLI_DISPATCH_COVERAGE } from "./observe-cli.js";

const AT = "2026-07-26T00:00:00.000Z";

/** A fresh, call-counting deps harness — identity/time are injected, never ambient. */
function harness(overrides: { ok?: boolean; sessionId?: string } = {}) {
  let counter = 0;
  const nextVisitIdCalls: string[] = [];
  const deps = {
    ok: overrides.ok ?? true,
    sessionId: overrides.sessionId ?? "session-a",
    nextVisitId: () => {
      counter += 1;
      const id = `visit-${counter}`;
      nextVisitIdCalls.push(id);
      return id;
    },
    now: () => new Date(AT),
  };
  return { deps, nextVisitIdCalls };
}

function assertValid(event: unknown): void {
  assert.equal(ContextTraversalEvent.safeParse(event).success, true);
}

test("tree <story-id> observes a front_matter_read keyed on the canonical story id", () => {
  const { deps, nextVisitIdCalls } = harness();
  const events = observeCliInvocation(["tree", "story-a"], deps);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event?.kind, "front_matter_read");
  assert.equal(event && "nodeId" in event ? event.nodeId : undefined, "story-a");
  assert.equal(event?.sessionId, "session-a");
  assert.equal(event?.at, AT);
  assert.deepEqual(nextVisitIdCalls, ["visit-1"]);
  assert.equal(event && "visitId" in event ? event.visitId : undefined, "visit-1");
  // canonical nodeId and chronological visitId stay separate identities
  assert.notEqual(event && "nodeId" in event ? event.nodeId : undefined, event && "visitId" in event ? event.visitId : undefined);
  assertValid(event);
});

test("tree spec <node-id> observes the full-payload strength, not the front-matter one", () => {
  const { deps } = harness();
  const events = observeCliInvocation(["tree", "spec", "node-x"], deps);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event?.kind, "full_payload_read");
  assert.equal(event && "nodeId" in event ? event.nodeId : undefined, "node-x");
  assertValid(event);
});

test("library artifact <id> observes a full_payload_read keyed on the artifact id", () => {
  const { deps } = harness();
  const events = observeCliInvocation(["library", "artifact", "artifact-1"], deps);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event?.kind, "full_payload_read");
  assert.equal(event && "nodeId" in event ? event.nodeId : undefined, "artifact-1");
  assertValid(event);
});

test("library artifact list [<category>] observes a search with an empty result list, never the category text", () => {
  const { deps } = harness();
  const bare = observeCliInvocation(["library", "artifact", "list"], deps);
  const categorised = observeCliInvocation(["library", "artifact", "list", "principle"], deps);

  for (const events of [bare, categorised]) {
    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal(event?.kind, "search");
    assert.equal(event && "operation" in event ? event.operation : undefined, "library_artifact_list");
    assert.deepEqual(event && "resultNodeIds" in event ? event.resultNodeIds : undefined, []);
    assertValid(event);
  }
  // the category argument never leaks into the observation
  assert.equal(JSON.stringify(categorised).includes("principle"), false);
});

test("agents <name> [--step <s>] observes a full_payload_read on a surface distinct from tree and library, never the step value", () => {
  const { deps } = harness();
  const bare = observeCliInvocation(["agents", "session-orchestrator"], deps);
  const stepped = observeCliInvocation(["agents", "session-orchestrator", "--step", "3"], deps);

  for (const events of [bare, stepped]) {
    assert.equal(events.length, 1);
    const [event] = events;
    assert.equal(event?.kind, "full_payload_read");
    assert.equal(event && "nodeId" in event ? event.nodeId : undefined, "session-orchestrator");
    assertValid(event);
  }
  assert.equal(JSON.stringify(stepped).includes("\"3\""), false);

  const treeSurface = (observeCliInvocation(["tree", "story-a"], deps)[0] as { surfaceId?: string }).surfaceId;
  const libraryArtifactSurface = (
    observeCliInvocation(["library", "artifact", "artifact-1"], deps)[0] as { surfaceId?: string }
  ).surfaceId;
  const agentSurface = (bare[0] as { surfaceId?: string }).surfaceId;
  assert.notEqual(agentSurface, treeSurface);
  assert.notEqual(agentSurface, libraryArtifactSurface);
});

test("bare library observes a front_matter_read on the dashboard surface only, distinct from the artifact surface", () => {
  const { deps } = harness();
  const events = observeCliInvocation(["library"], deps);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event?.kind, "front_matter_read");
  assertValid(event);

  const dashboardSurface = (event as { surfaceId?: string }).surfaceId;
  const artifactSurface = (
    observeCliInvocation(["library", "artifact", "artifact-1"], deps)[0] as { surfaceId?: string }
  ).surfaceId;
  assert.notEqual(dashboardSurface, artifactSurface);
});

test("no emitted event ever carries causality metadata — every visit is an independent forward visit", () => {
  const { deps } = harness();
  const samples = [
    observeCliInvocation(["tree", "story-a"], deps),
    observeCliInvocation(["tree", "spec", "node-x"], deps),
    observeCliInvocation(["library", "artifact", "artifact-1"], deps),
    observeCliInvocation(["library", "artifact", "list"], deps),
    observeCliInvocation(["agents", "session-orchestrator"], deps),
    observeCliInvocation(["library"], deps),
  ].flat();
  assert.ok(samples.length > 0);
  for (const event of samples) {
    assert.equal("parentVisitId" in event, false);
    assert.equal("priorVisitId" in event, false);
    assert.equal("followedEdgeId" in event, false);
    assertValid(event);
  }
});

test("unlisted and write invocations observe nothing — the default is zero events, never argv verbatim", () => {
  const { deps } = harness();
  const unobserved: readonly (readonly string[])[] = [
    [],
    ["db", "status"],
    ["library", "artifact"],
    ["noticeboard", "declare", "--working-on", "confidential session prose"],
    ["library", "artifact", "edit", "cap-77", "--set", "body=@file"],
    ["adr", "new", "--title", "A brand new decision"],
    ["arc", "increment", "add", "arc-1", "--outcome", "landed the thing"],
  ];
  for (const argv of unobserved) {
    const events = observeCliInvocation(argv, deps);
    assert.deepEqual(events, [], `expected zero events for ${JSON.stringify(argv)}`);
  }
});

test("ok: false observes nothing, even for an otherwise-matching read shape", () => {
  const { deps } = harness({ ok: false });
  const events = observeCliInvocation(["tree", "story-a"], deps);
  assert.deepEqual(events, []);
});

test("declares terminal-cli-dispatch coverage: exactly the emitted vocabulary supported, everything else explicitly omitted", () => {
  const parsed = ContextTraversalCoverage.parse(TERMINAL_CLI_DISPATCH_COVERAGE);
  assert.equal(parsed.adapterId, "terminal-cli-dispatch");

  const expectedSupported: CoverageFeature[] = [
    "surface:direct_cli",
    "event:front_matter_read",
    "event:full_payload_read",
    "event:search",
    "field:surface_id",
  ];
  for (const feature of expectedSupported) {
    assert.ok(parsed.supported.includes(feature), `expected ${feature} supported`);
  }

  const expectedOmitted: CoverageFeature[] = [
    "surface:create_orientation_runner",
    "surface:claude_sdk",
    "surface:codex",
    "surface:owned_loop",
    "surface:spawned_agent",
    "surface:agents",
    "surface:noticeboard",
    "event:candidate_set",
    "event:followed_edge",
    "event:model_context",
    "event:spawn_handoff",
    "event:result_return",
    "field:parent_visit_id",
    "field:prior_visit_id",
    "field:model_tokens",
    "field:context_window_capacity",
    "field:candidate_follow_causality",
    "field:child_context_window",
  ];
  for (const feature of expectedOmitted) {
    assert.ok(parsed.omitted.includes(feature), `expected ${feature} omitted`);
  }

  // exhaustive: every declared feature is accounted for exactly once, no silent gaps
  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});
