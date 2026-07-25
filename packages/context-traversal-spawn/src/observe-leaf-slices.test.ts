import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
} from "@storytree/context-traversal-telemetry";

import {
  BUILD_SPAWN_BOUNDARY_COVERAGE,
  observeLeafSlices,
} from "./observe-leaf-slices.js";
import type { LeafSliceRun } from "./observe-leaf-slices.js";

const PARENT_SESSION_ID = "session-parent";
const RUN_ID = "run-1";
const UNIT_ID = "unit-a";

/** A fresh deterministic id/clock pair per test — never a shared, order-coupled counter. */
function harness() {
  let idCounter = 0;
  const nextId = () => `id-${++idCounter}`;
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 6, 26, 10, 0, tick++));
  return { nextId, now };
}

test("one authoring slice with usage emits a linked spawn_handoff / model_context / result_return triple", () => {
  const { nextId, now } = harness();
  const runs: LeafSliceRun[] = [
    {
      phase: "AUTHOR_TEST",
      subtype: "success",
      turns: 3,
      costUsd: 0.12,
      usage: {
        inputTokens: 1_000,
        cacheCreationInputTokens: 200,
        cacheReadInputTokens: 300,
        outputTokens: 150,
      },
      byModel: {
        "claude-sonnet-5": {
          inputTokens: 1_000,
          cacheCreationInputTokens: 200,
          cacheReadInputTokens: 300,
          outputTokens: 150,
          costUsd: 0.12,
        },
      },
    },
  ];

  const events = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs,
    now,
    nextId,
  });

  // Real-collaborator validation: every emitted event must independently satisfy the published
  // ADR-0235 vocabulary (strict — an extra/leaked field fails this parse), not just this
  // package's own idea of its shape.
  for (const event of events) ContextTraversalEvent.parse(event);

  assert.deepEqual(
    events.map((event) => event.kind),
    ["spawn_handoff", "model_context", "result_return"],
  );

  const childSessionId = `${PARENT_SESSION_ID}:build:${RUN_ID}:${UNIT_ID}:AUTHOR_TEST`;
  const [spawn, context, result] = events;

  assert.ok(spawn?.kind === "spawn_handoff");
  if (spawn?.kind === "spawn_handoff") {
    assert.equal(spawn.sessionId, PARENT_SESSION_ID);
    assert.equal(spawn.parentSessionId, PARENT_SESSION_ID);
    assert.equal(spawn.childSessionId, childSessionId);
    assert.equal(spawn.agentType, "red-builder");
    // Fenced: the prompt handed to the child is never observable at this boundary.
    assert.equal(spawn.payloadTokenCount, undefined);
  }

  assert.ok(context?.kind === "model_context");
  if (context?.kind === "model_context") {
    assert.equal(context.sessionId, childSessionId);
    // One aggregate observation of an independent window: cumulative and added are EQUAL, both
    // the sum of the three reported input axes (never including output tokens).
    assert.equal(context.cumulativeInputTokens, 1_500);
    assert.equal(context.addedInputTokens, 1_500);
    // Fenced: nothing in the SDK result declares a window size at this boundary.
    assert.equal(context.contextWindowCapacity, undefined);
  }

  assert.ok(result?.kind === "result_return");
  if (result?.kind === "result_return") {
    assert.equal(result.sessionId, PARENT_SESSION_ID);
    assert.equal(result.parentSessionId, PARENT_SESSION_ID);
    assert.equal(result.childSessionId, childSessionId);
    assert.equal(result.resultTokenCount, 150);
    assert.equal(result.ok, true);
  }

  if (spawn?.kind === "spawn_handoff" && result?.kind === "result_return") {
    // The same edge identity joins the handoff and the return — the lanes link by id alone.
    assert.equal(spawn.edgeId, result.edgeId);
  }
});

test("a slice with no usage skips model_context but still links its own spawn/return edge, and a failed slice reports ok:false with no result token count", () => {
  const { nextId, now } = harness();
  const runs: LeafSliceRun[] = [
    {
      phase: "AUTHOR_TEST",
      subtype: "success",
      turns: 2,
      usage: {
        inputTokens: 400,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 100,
        outputTokens: 50,
      },
    },
    {
      phase: "IMPLEMENT",
      subtype: "error_max_turns",
      turns: 16,
    },
  ];

  const events = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs,
    now,
    nextId,
  });

  for (const event of events) ContextTraversalEvent.parse(event);

  assert.deepEqual(
    events.map((event) => event.kind),
    ["spawn_handoff", "model_context", "result_return", "spawn_handoff", "result_return"],
  );

  const [firstSpawn, , firstReturn, secondSpawn, secondReturn] = events;

  assert.ok(firstSpawn?.kind === "spawn_handoff" && firstReturn?.kind === "result_return");
  assert.ok(secondSpawn?.kind === "spawn_handoff" && secondReturn?.kind === "result_return");

  if (
    firstSpawn?.kind === "spawn_handoff" &&
    firstReturn?.kind === "result_return" &&
    secondSpawn?.kind === "spawn_handoff" &&
    secondReturn?.kind === "result_return"
  ) {
    assert.equal(firstSpawn.edgeId, firstReturn.edgeId);
    assert.equal(secondSpawn.edgeId, secondReturn.edgeId);
    // Distinct authoring slices never share an edge identity.
    assert.notEqual(firstSpawn.edgeId, secondSpawn.edgeId);

    assert.equal(secondSpawn.childSessionId, `${PARENT_SESSION_ID}:build:${RUN_ID}:${UNIT_ID}:IMPLEMENT`);
    assert.equal(secondSpawn.agentType, "green-builder");

    assert.equal(secondReturn.ok, false);
    // No usage was reported for this slice, so there is nothing honest to report as a result
    // token count either — never a fabricated zero.
    assert.equal(secondReturn.resultTokenCount, undefined);
  }

  // Chronological across slices, not merely within one: each event's own timestamp is
  // non-decreasing in emission order.
  const timestamps = events.map((event) => event.at);
  assert.deepEqual(timestamps, [...timestamps].sort());
});

test("child session identity is composed from declared build identity alone, never from id/clock injection or array position", () => {
  const runs: LeafSliceRun[] = [{ phase: "AUTHOR_TEST", subtype: "success", turns: 1 }];

  let counterA = 100;
  const eventsA = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs,
    now: () => new Date(Date.UTC(2020, 0, 1)),
    nextId: () => `A-${++counterA}`,
  });

  let counterB = 9_000;
  const eventsB = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs,
    now: () => new Date(Date.UTC(2099, 11, 31)),
    nextId: () => `B-${++counterB}`,
  });

  const spawnA = eventsA.find((event) => event.kind === "spawn_handoff");
  const spawnB = eventsB.find((event) => event.kind === "spawn_handoff");
  assert.ok(spawnA?.kind === "spawn_handoff" && spawnB?.kind === "spawn_handoff");
  if (spawnA?.kind === "spawn_handoff" && spawnB?.kind === "spawn_handoff") {
    assert.equal(spawnA.childSessionId, spawnB.childSessionId);
    assert.equal(
      spawnA.childSessionId,
      `${PARENT_SESSION_ID}:build:${RUN_ID}:${UNIT_ID}:AUTHOR_TEST`,
    );
  }
});

test("no authoring slices means no traversal at all", () => {
  const { nextId, now } = harness();
  const events = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs: [],
    now,
    nextId,
  });
  assert.deepEqual(events, []);
});

test("BUILD_SPAWN_BOUNDARY_COVERAGE names exactly what this adapter emits and derives every omission from the closed vocabulary", () => {
  const parsed = ContextTraversalCoverage.parse(BUILD_SPAWN_BOUNDARY_COVERAGE);

  assert.deepEqual(
    [...parsed.supported].sort(),
    [
      "event:model_context",
      "event:result_return",
      "event:spawn_handoff",
      "field:child_context_window",
      "field:model_tokens",
      "surface:claude_sdk",
      "surface:spawned_agent",
    ].sort(),
  );

  // Explicitly-named residual omissions the node spec calls out.
  assert.ok(parsed.omitted.includes("field:context_window_capacity"));
  assert.ok(parsed.omitted.includes("field:candidate_follow_causality"));

  // Deletion check on the coverage export itself: every feature in the closed domain sits on
  // exactly one side, so a future vocabulary addition cannot leave a silent gap.
  for (const feature of CoverageFeature.options) {
    const onSupported = parsed.supported.includes(feature);
    const onOmitted = parsed.omitted.includes(feature);
    assert.notEqual(onSupported, onOmitted);
  }
  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});
