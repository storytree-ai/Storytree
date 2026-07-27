/**
 * Agent-ref descent (ADR-0235/ADR-0241), story `context-traversal-capture`, capability
 * `agent-ref-descent`.
 *
 * `storytree agents <name>` renders the ESSENTIALS view (`renderAgentEssentials`,
 * `packages/library/src/store/render-agent.ts`), which walks the agent's `rules` then
 * `antiPatterns` floor refs and resolves each one via the store. This module makes that resolution
 * a context-traversal fact: `resolveAgentDescent` re-derives (from argv + the same store) exactly
 * the floor ref ids the render actually resolved, in render order; `descendAgentRefs` turns those
 * resolved ids into child `front_matter_read` visits naming the agent's own visit as `parentVisitId`
 * — never a correlation from ordering or timestamp proximity, an explicit id carried on the call.
 *
 * Every fixture here is hand-built in memory — no filesystem, no real store, no real CLI dispatch —
 * because both exported functions are pure/total over their inputs. No `as` cast narrows a
 * `ContextTraversalEvent`: every narrowing goes through the exported `isContextVisitEvent` plus an
 * explicit `assert.ok`, mirroring `terminal-capture.uat.test.ts`'s `expectVisit` helper.
 *
 * Covers the seven contracts declared in `stories/context-traversal-capture/agent-ref-descent.md`:
 *   1. descent-resolves-only-the-rendered-floor-refs-in-render-order
 *   2. only-the-bare-agents-name-shape-descends
 *   3. a-missing-or-non-agent-doc-descends-nothing-and-never-throws
 *   4. each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent
 *   5. descent-is-a-no-op-without-an-agent-visit-and-never-self-parents
 *   6. the-agent-visit-still-leads-its-children-in-a-replay-ordered-by-at
 *   7. composed-coverage-declares-parent-visit-links-and-stays-exhaustive
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
  createContextTraversalTrace,
  isContextVisitEvent,
} from "@storytree/context-traversal-telemetry";
import type { ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { REVISIT_LINK_COVERAGE } from "./revisit-links.js";
import {
  AGENT_DESCENT_COVERAGE,
  descendAgentRefs,
  resolveAgentDescent,
} from "./descend-agent-refs.js";
import type { AgentDescentDeps, AgentDocStore } from "./descend-agent-refs.js";

const AT = "2026-07-27T00:00:00.000Z";

/** Narrows a raw event to a visit event (front_matter_read | full_payload_read) or fails loudly. */
function expectVisit(event: ContextTraversalEvent | undefined, context: string): ContextVisitEvent {
  assert.notEqual(event, undefined, `${context}: expected an event, got none`);
  if (event === undefined) throw new Error("unreachable");
  assert.equal(isContextVisitEvent(event), true, `${context}: expected a visit event, got kind=${event.kind}`);
  if (!isContextVisitEvent(event)) throw new Error("unreachable");
  return event;
}

function assertParses(event: unknown): void {
  const parsed = ContextTraversalEvent.safeParse(event);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
}

/** A minimal in-memory fixture satisfying the structural `AgentDocStore` port. */
interface StoreFixtureDoc {
  readonly kind: string;
  readonly doc: unknown;
}

function fixtureStore(
  docs: ReadonlyMap<string, StoreFixtureDoc>,
  opts: { readonly throwOn?: ReadonlySet<string> } = {},
): AgentDocStore {
  return {
    async getDoc(id: string) {
      if (opts.throwOn?.has(id) === true) {
        throw new Error(`simulated store failure for ${id}`);
      }
      const found = docs.get(id);
      if (found === undefined) return null;
      return { id, kind: found.kind, doc: found.doc };
    },
  };
}

function agentVisitEvent(overrides: Partial<{ visitId: string; nodeId: string; sessionId: string; at: string }> = {}): ContextTraversalEvent {
  return {
    kind: "full_payload_read",
    eventId: `event:${overrides.visitId ?? "visit-agent"}`,
    sessionId: overrides.sessionId ?? "session-a",
    at: overrides.at ?? AT,
    visitId: overrides.visitId ?? "visit-agent",
    nodeId: overrides.nodeId ?? "my-agent",
    surfaceId: "agents",
  };
}

// ---------------------------------------------------------------------------
// 1. descent-resolves-only-the-rendered-floor-refs-in-render-order
// ---------------------------------------------------------------------------

test("descent-resolves-only-the-rendered-floor-refs-in-render-order", async () => {
  const docs = new Map<string, StoreFixtureDoc>([
    [
      "my-agent",
      {
        kind: "agent",
        doc: {
          rules: ["asset:rule-1", "asset:rule-dangling", "asset:rule-2"],
          antiPatterns: ["asset:anti-1"],
          context: ["asset:context-1"],
        },
      },
    ],
    ["rule-1", { kind: "principle", doc: {} }],
    ["rule-2", { kind: "principle", doc: {} }],
    ["anti-1", { kind: "pattern", doc: {} }],
    ["context-1", { kind: "principle", doc: {} }],
    // "rule-dangling" is deliberately absent — a dangling ref must never surface as resolved.
  ]);
  const store = fixtureStore(docs);

  const resolved = await resolveAgentDescent(["agents", "my-agent"], store);
  // rules before antiPatterns, dangling excluded, and the context ref (not a floor section) never
  // shows up even though it would resolve fine.
  assert.deepEqual(resolved, ["rule-1", "rule-2", "anti-1"]);
});

// ---------------------------------------------------------------------------
// 2. only-the-bare-agents-name-shape-descends
// ---------------------------------------------------------------------------

test("only-the-bare-agents-name-shape-descends", async () => {
  const docs = new Map<string, StoreFixtureDoc>([
    ["my-agent", { kind: "agent", doc: { rules: ["asset:rule-1"], antiPatterns: [] } }],
    ["rule-1", { kind: "principle", doc: {} }],
  ]);
  const store = fixtureStore(docs);

  const nonDescending: (readonly string[])[] = [
    [],
    ["agents"],
    ["agents", "my-agent", "--step", "3"],
    ["agents", "my-agent", "--help"],
    ["agents", "my-agent", "-h"],
    ["agents", "--step"],
    ["tree", "my-agent"],
    ["library", "artifact", "my-agent"],
  ];
  for (const argv of nonDescending) {
    const resolved = await resolveAgentDescent(argv, store);
    assert.deepEqual(resolved, [], `expected no descent for ${JSON.stringify(argv)}`);
  }

  // the bare form, and the bare form plus a trailing non-excluded flag, both still descend.
  const stillDescends: (readonly string[])[] = [
    ["agents", "my-agent"],
    ["agents", "my-agent", "--pg"],
  ];
  for (const argv of stillDescends) {
    const resolved = await resolveAgentDescent(argv, store);
    assert.deepEqual(resolved, ["rule-1"], `expected descent for ${JSON.stringify(argv)}`);
  }
});

// ---------------------------------------------------------------------------
// 3. a-missing-or-non-agent-doc-descends-nothing-and-never-throws
// ---------------------------------------------------------------------------

test("a-missing-or-non-agent-doc-descends-nothing-and-never-throws", async () => {
  const missingStore = fixtureStore(new Map());
  assert.deepEqual(await resolveAgentDescent(["agents", "ghost"], missingStore), []);

  const nonAgentDocs = new Map<string, StoreFixtureDoc>([
    ["not-an-agent", { kind: "principle", doc: { rules: ["asset:rule-1"] } }],
  ]);
  assert.deepEqual(await resolveAgentDescent(["agents", "not-an-agent"], fixtureStore(nonAgentDocs)), []);

  // a store that REJECTS resolving the agent doc must never propagate — the descent degrades to [].
  const throwingStore = fixtureStore(new Map(), { throwOn: new Set(["my-agent"]) });
  const result = await resolveAgentDescent(["agents", "my-agent"], throwingStore);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// 4. each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent
// ---------------------------------------------------------------------------

test("each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent", () => {
  const agentVisit = agentVisitEvent();

  let counter = 0;
  const deps: AgentDescentDeps = {
    sessionId: "session-a",
    nextVisitId: () => {
      counter += 1;
      return `visit-child-${counter}`;
    },
    now: () => new Date(AT),
  };

  const result = descendAgentRefs([agentVisit], ["rule-1", "rule-2"], deps);
  assert.equal(result.length, 3);

  const [parentBack, firstChildRaw, secondChildRaw] = result;
  const parentEvent = expectVisit(parentBack, "parent passthrough");
  assert.equal(parentEvent.visitId, "visit-agent");
  // the parent comes back UNCHANGED: same read strength, and no parent link stamped onto it. The
  // absence claim is made on the JSON round-trip, because that is the shape the sink writes — an
  // in-memory `undefined` would satisfy a key-presence check while still serialising the key away.
  assert.equal(parentEvent.kind, "full_payload_read");
  const parentOnDisk: unknown = JSON.parse(JSON.stringify(parentEvent));
  assert.equal(
    Object.prototype.hasOwnProperty.call(parentOnDisk, "parentVisitId"),
    false,
    "the agent's own visit must carry no parentVisitId key at all",
  );

  const one = expectVisit(firstChildRaw, "first child");
  assert.equal(one.kind, "front_matter_read");
  assert.equal(one.nodeId, "rule-1");
  assert.equal(one.sessionId, "session-a");
  assert.equal(one.parentVisitId, "visit-agent");
  // a child was read THROUGH the agents surface, so it reports that surface and not "unknown".
  assert.equal(one.surfaceId, "agents");
  assertParses(one);

  const two = expectVisit(secondChildRaw, "second child");
  assert.equal(two.kind, "front_matter_read");
  assert.equal(two.nodeId, "rule-2");
  assert.equal(two.sessionId, "session-a");
  assert.equal(two.parentVisitId, "visit-agent");
  assert.equal(two.surfaceId, "agents");
  assert.notEqual(two.visitId, one.visitId);
  assertParses(two);
});

test("each-resolved-ref-becomes-a-front-matter-child-naming-the-agent-visit-as-parent: the parent is found by SURFACE, not by being the first visit", () => {
  // The agent visit is identified by `surfaceId === "agents"`, never by position. A full-payload
  // visit on no surface at all is therefore NOT a parent — which is what separates this producer
  // from one that simply adopts the first visit event in the batch.
  const surfacelessParent: ContextTraversalEvent = {
    kind: "full_payload_read",
    eventId: "event:visit-agent",
    sessionId: "session-a",
    at: AT,
    visitId: "visit-agent",
    nodeId: "my-agent",
  };
  const deps: AgentDescentDeps = {
    sessionId: "session-a",
    nextVisitId: () => "visit-child-1",
    now: () => new Date(AT),
  };

  // no agents-surface visit is present, so nothing descends — the batch passes through untouched.
  assert.deepEqual(descendAgentRefs([surfacelessParent], ["rule-1"], deps), [surfacelessParent]);

  // and a visit on a DIFFERENT surface is likewise not an agent visit.
  const treeVisit: ContextTraversalEvent = { ...surfacelessParent, surfaceId: "tree" };
  assert.deepEqual(descendAgentRefs([treeVisit], ["rule-1"], deps), [treeVisit]);
});

// ---------------------------------------------------------------------------
// 5. descent-is-a-no-op-without-an-agent-visit-and-never-self-parents
// ---------------------------------------------------------------------------

test("descent-is-a-no-op-without-an-agent-visit-and-never-self-parents", () => {
  const deps: AgentDescentDeps = {
    sessionId: "session-a",
    nextVisitId: () => "visit-child-1",
    now: () => new Date(AT),
  };

  // no events observed at all — nothing to be a parent, so nothing is produced.
  assert.deepEqual(descendAgentRefs([], ["rule-1"], deps), []);

  // an observed batch with no VISIT event (only a search) is likewise a no-op.
  const searchOnly: ContextTraversalEvent = {
    kind: "search",
    eventId: "event:search-1",
    sessionId: "session-a",
    at: AT,
    searchId: "search:1",
    surfaceId: "library-artifact",
    operation: "library_artifact_list",
    resultNodeIds: [],
  };
  assert.deepEqual(descendAgentRefs([searchOnly], ["rule-1"], deps), [searchOnly]);

  // a ref list that names the AGENT's own node id must still never make a child self-parent: the
  // child's own visitId must differ from the parentVisitId it carries.
  const agentVisit = agentVisitEvent();
  const selfResult = descendAgentRefs([agentVisit], ["my-agent"], deps);
  assert.equal(selfResult.length, 2);
  const [, childBack] = selfResult;
  const child = expectVisit(childBack, "self-referential child");
  assert.equal(child.nodeId, "my-agent");
  assert.equal(child.parentVisitId, "visit-agent");
  assert.notEqual(child.visitId, child.parentVisitId);
});

// ---------------------------------------------------------------------------
// 6. the-agent-visit-still-leads-its-children-in-a-replay-ordered-by-at
// ---------------------------------------------------------------------------

test("the-agent-visit-still-leads-its-children-in-a-replay-ordered-by-at", () => {
  const agentVisit = agentVisitEvent();

  let counter = 0;
  const deps: AgentDescentDeps = {
    sessionId: "session-a",
    nextVisitId: () => {
      counter += 1;
      return `visit-child-${counter}`;
    },
    // every child shares the SAME `at` as the parent — the ordering must not rely on a clock that
    // advances, only on the append order a stable chronological sort preserves.
    now: () => new Date(AT),
  };

  const result = descendAgentRefs([agentVisit], ["rule-1", "rule-2"], deps);
  assert.equal(result.length, 3);

  const trace = createContextTraversalTrace();
  for (const event of result) trace.append(event);
  const replay = trace.replay("session-a");

  assert.equal(replay.events.length, 3);
  const [first, second, third] = replay.events;

  const firstVisit = expectVisit(first, "replay first");
  assert.equal(firstVisit.visitId, "visit-agent", "the agent's own visit must lead the replay");

  const secondVisit = expectVisit(second, "replay second");
  assert.equal(secondVisit.nodeId, "rule-1");
  assert.equal(secondVisit.parentVisitId, "visit-agent");

  const thirdVisit = expectVisit(third, "replay third");
  assert.equal(thirdVisit.nodeId, "rule-2");
  assert.equal(thirdVisit.parentVisitId, "visit-agent");
});

// ---------------------------------------------------------------------------
// 7. composed-coverage-declares-parent-visit-links-and-stays-exhaustive
// ---------------------------------------------------------------------------

test("composed-coverage-declares-parent-visit-links-and-stays-exhaustive", () => {
  const parsed = ContextTraversalCoverage.parse(AGENT_DESCENT_COVERAGE);
  assert.equal(parsed.adapterId, "terminal-cli-dispatch");

  assert.ok(parsed.supported.includes("field:parent_visit_id"));
  assert.equal(parsed.omitted.includes("field:parent_visit_id"), false);

  // every feature the revisit-link base declared supported (including field:prior_visit_id) stays
  // supported — composition, never a rewrite.
  for (const feature of REVISIT_LINK_COVERAGE.supported) {
    assert.ok(parsed.supported.includes(feature), `expected base-supported ${feature} to remain supported`);
  }

  // this increment ships no causality claim, no candidate sets, no followed edges.
  const stillOmitted: CoverageFeature[] = [
    "event:followed_edge",
    "event:candidate_set",
    "field:candidate_follow_causality",
  ];
  for (const feature of stillOmitted) {
    assert.ok(parsed.omitted.includes(feature), `expected ${feature} to remain omitted`);
  }

  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});
