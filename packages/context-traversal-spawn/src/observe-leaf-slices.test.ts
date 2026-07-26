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

  const childSessionId = `${PARENT_SESSION_ID}__build__${RUN_ID}__${UNIT_ID}__AUTHOR_TEST`;
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

    assert.equal(secondSpawn.childSessionId, `${PARENT_SESSION_ID}__build__${RUN_ID}__${UNIT_ID}__IMPLEMENT`);
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
      `${PARENT_SESSION_ID}__build__${RUN_ID}__${UNIT_ID}__AUTHOR_TEST`,
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

test("child session id is legal as a path segment on every supported platform (regression: a colon-separated id silently drops the sink's write)", () => {
  const { nextId, now } = harness();
  const runs: LeafSliceRun[] = [
    { phase: "AUTHOR_TEST", subtype: "success", turns: 1 },
    { phase: "IMPLEMENT", subtype: "success", turns: 5 },
  ];

  const events = observeLeafSlices({
    parentSessionId: PARENT_SESSION_ID,
    runId: RUN_ID,
    unitId: UNIT_ID,
    runs,
    now,
    nextId,
  });

  // The sink names one file per session, `<sessionId>.jsonl`, and swallows a failed write
  // (`catch { return false }`) — a character illegal in a path segment on ANY supported platform
  // (measured: Windows rejects `:`) makes that child's lane silently unpersistable. This is the
  // deletion check for that regression: strip every character this exact id set contains that is
  // reserved on Windows, POSIX, or macOS path segments, and demand nothing was stripped.
  const illegalPathSegmentChars = /[<>:"/\\|?*\x00-\x1f]/;

  const spawnHandoffs = events.filter((event) => event.kind === "spawn_handoff");
  assert.equal(spawnHandoffs.length, 2);
  for (const spawn of spawnHandoffs) {
    assert.ok(spawn.kind === "spawn_handoff");
    if (spawn.kind === "spawn_handoff") {
      assert.equal(
        illegalPathSegmentChars.test(spawn.childSessionId),
        false,
        `childSessionId ${JSON.stringify(spawn.childSessionId)} contains a character illegal in a path segment`,
      );
      // The id must still be composed from the declared build identity alone — never a bare
      // opaque token — so a reader can still see which parent/run/unit/phase it names.
      assert.ok(spawn.childSessionId.includes(PARENT_SESSION_ID));
      assert.ok(spawn.childSessionId.includes(RUN_ID));
      assert.ok(spawn.childSessionId.includes(UNIT_ID));
    }
  }

  const resultReturns = events.filter((event) => event.kind === "result_return");
  assert.equal(resultReturns.length, 2);
  for (const result of resultReturns) {
    assert.ok(result.kind === "result_return");
    if (result.kind === "result_return") {
      assert.equal(illegalPathSegmentChars.test(result.childSessionId), false);
    }
  }
});
