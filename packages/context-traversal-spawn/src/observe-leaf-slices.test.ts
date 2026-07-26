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

test("one-slice-emits-handoff-context-return-in-order, payload-token-count-is-always-absent: one authoring slice with usage emits a linked spawn_handoff / model_context / result_return triple, and the handoff never carries a payload token count", () => {
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
          contextWindow: 200_000,
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
    // Pass-through, never a lookup/estimate: the runtime declared exactly one distinct positive
    // window on this slice's sole model, so it is carried onto the child's aggregate observation
    // verbatim.
    assert.equal(context.contextWindowCapacity, 200_000);
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

test("context-window-capacity-is-never-inferred, a-single-declared-window-is-carried-verbatim-onto-the-child-context, an-undeclared-ambiguous-or-non-positive-window-yields-absent-capacity, child-window-is-one-aggregate-observation: context window capacity is a pass-through of the runtime's OWN declaration, present only when byModel declares exactly one distinct positive window, and no slice's window accumulates into another's", () => {
  const { nextId, now } = harness();

  const BASE_USAGE = {
    inputTokens: 10,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 5,
  };

  function slice(
    phase: string,
    byModel?: Record<string, { contextWindow?: number }>,
  ): LeafSliceRun {
    return {
      phase,
      subtype: "success",
      turns: 1,
      usage: { ...BASE_USAGE },
      ...(byModel === undefined
        ? {}
        : {
            byModel: Object.fromEntries(
              Object.entries(byModel).map(([modelId, override]) => [
                modelId,
                { ...BASE_USAGE, ...override },
              ]),
            ),
          }),
    } as LeafSliceRun;
  }

  const runs: LeafSliceRun[] = [
    slice("CAP_SINGLE", { "model-a": { contextWindow: 200_000 } }),
    slice("CAP_SAME_TWO_MODELS", {
      "model-a": { contextWindow: 200_000 },
      "model-b": { contextWindow: 200_000 },
    }),
    slice("CAP_DIFFERENT_WINDOWS", {
      "model-a": { contextWindow: 200_000 },
      "model-b": { contextWindow: 1_000_000 },
    }),
    slice("CAP_ZERO", { "model-a": { contextWindow: 0 } }),
    slice("CAP_NEGATIVE", { "model-a": { contextWindow: -5 } }),
    slice("CAP_UNDECLARED", { "model-a": {} }),
    slice("CAP_NO_BYMODEL"),
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

  const modelContextEvents = events.filter((event) => event.kind === "model_context");
  assert.equal(modelContextEvents.length, runs.length);

  const capacities = modelContextEvents.map((event) =>
    event.kind === "model_context" ? event.contextWindowCapacity : "wrong-kind",
  );

  assert.deepEqual(capacities, [
    200_000, // exactly one distinct positive window declared
    200_000, // two models declare the SAME window — still unambiguous
    undefined, // two models declare DIFFERENT windows — ambiguous, never guessed
    undefined, // a declared 0 is not a capacity
    undefined, // a declared negative value is not a capacity
    undefined, // byModel present but no model declared a window
    undefined, // byModel entirely absent — nothing to attribute
  ]);

  // `child-window-is-one-aggregate-observation`, second half: each authoring slice is its own
  // independent query with its own window (ADR-0235 clause 5), so two slices' windows must never
  // accumulate into each other. Every slice here reports the identical BASE_USAGE (10 + 0 + 0), so
  // each child's observation must read a flat 10 — a running total across slices would read
  // 10, 20, 30, ... instead. Asserted on both fields, which are EQUAL by the same clause.
  const expectedFlat = runs.map(() => 10);
  assert.deepEqual(
    modelContextEvents.map((event) => (event.kind === "model_context" ? event.cumulativeInputTokens : -1)),
    expectedFlat,
  );
  assert.deepEqual(
    modelContextEvents.map((event) => (event.kind === "model_context" ? event.addedInputTokens : -1)),
    expectedFlat,
  );
});

test("model-and-agent-type-come-from-the-runtime: a slice declaring exactly one byModel key emits that key as modelId on the child's model_context observation, and none when several or no keys are declared", () => {
  const { nextId, now } = harness();

  const BASE_USAGE = {
    inputTokens: 10,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    outputTokens: 5,
  };

  function slice(
    phase: string,
    byModel?: Record<string, { contextWindow?: number }>,
  ): LeafSliceRun {
    return {
      phase,
      subtype: "success",
      turns: 1,
      usage: { ...BASE_USAGE },
      ...(byModel === undefined
        ? {}
        : {
            byModel: Object.fromEntries(
              Object.entries(byModel).map(([modelId, override]) => [
                modelId,
                { ...BASE_USAGE, ...override },
              ]),
            ),
          }),
    } as LeafSliceRun;
  }

  const runs: LeafSliceRun[] = [
    // Exactly one declared byModel key, with a valid capacity — modelId is that key.
    slice("MODEL_SINGLE_WITH_WINDOW", { "claude-sonnet-5": { contextWindow: 200_000 } }),
    // Exactly one declared byModel key, but its window is not a capacity (0) — the key is still
    // unambiguous, so modelId is emitted independently of whether a capacity was also attributed.
    slice("MODEL_SINGLE_ZERO_WINDOW", { "claude-sonnet-5": { contextWindow: 0 } }),
    // Exactly one declared byModel key with no window declared at all — still unambiguous.
    slice("MODEL_SINGLE_NO_WINDOW", { "claude-sonnet-5": {} }),
    // Two declared byModel keys — which one produced the observation is ambiguous, never guessed.
    slice("MODEL_TWO_KEYS", {
      "model-a": { contextWindow: 200_000 },
      "model-b": { contextWindow: 200_000 },
    }),
    // byModel entirely absent — nothing to attribute.
    slice("MODEL_NO_BYMODEL"),
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

  const modelContextEvents = events.filter((event) => event.kind === "model_context");
  assert.equal(modelContextEvents.length, runs.length);

  const modelIds = modelContextEvents.map((event) =>
    event.kind === "model_context" ? event.modelId : "wrong-kind",
  );

  assert.deepEqual(modelIds, [
    "claude-sonnet-5",
    "claude-sonnet-5",
    "claude-sonnet-5",
    undefined,
    undefined,
  ]);
});

test("a-slice-without-usage-emits-no-model-context, result-return-carries-output-tokens-and-outcome: a slice with no usage skips model_context but still links its own spawn/return edge, and a failed slice reports ok:false with no result token count", () => {
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

test("child-session-id-is-explicit-and-deterministic: child session identity is composed from declared build identity alone, never from id/clock injection or array position", () => {
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

test("zero-slices-emit-nothing-and-every-event-parses: no authoring slices means no traversal at all", () => {
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

test("coverage-is-exhaustive-over-the-closed-feature-enum: BUILD_SPAWN_BOUNDARY_COVERAGE names exactly what this adapter emits and derives every omission from the closed vocabulary", () => {
  const parsed = ContextTraversalCoverage.parse(BUILD_SPAWN_BOUNDARY_COVERAGE);

  assert.deepEqual(
    [...parsed.supported].sort(),
    [
      "event:model_context",
      "event:result_return",
      "event:spawn_handoff",
      "field:child_context_window",
      "field:context_window_capacity",
      "field:model_tokens",
      "surface:claude_sdk",
      "surface:spawned_agent",
    ].sort(),
  );

  // The capacity pass-through MOVED this feature from omitted to supported: coverage declares what
  // the adapter CAN observe, not what any one trace happens to contain — the runtime-declared window
  // is carried through whenever attribution is unambiguous, even though many individual slices still
  // carry no capacity at all.
  assert.ok(parsed.supported.includes("field:context_window_capacity"));
  // Still explicitly omitted: no causality is ever inferred from time or ordering.
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

test("child-session-id-is-a-legal-filename-segment: child session id is legal as a path segment on every supported platform (regression: a colon-separated id silently drops the sink's write)", () => {
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
