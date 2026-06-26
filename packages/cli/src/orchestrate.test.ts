/**
 * Integration tests for the orchestrator composition (packages/cli/src/orchestrate.ts).
 *
 * Pins:
 *   1. The composition renders the REAL `session-orchestrator` agent from the seed corpus —
 *      never a hard-coded prompt (ADR-0108 decision 2 / ADR-0051).
 *   2. The rendered system prompt is fed to `runHeadlessOrchestrator`; the proposal is surfaced.
 *   3. Fail-closed when the `session-orchestrator` agent is absent from the injected store.
 *   4. Fail-closed when the headless session fails (the SDK yields no result message).
 *
 * All tests are OFFLINE: the `queryFn` seam is injected, so no live SDK spend. The live run
 * is the Story UAT human-witness leg (ADR-0010 §5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

// RED: orchestrate.ts does not exist yet — module-not-found is the right-kind red.
import { orchestrate } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 2,
  total_cost_usd: 0.01,
  result: "I propose: build the 'orchestrate-composition' capability next (Phase 1 focus).",
};

// ---------------------------------------------------------------------------
// 1. Renders the REAL session-orchestrator from the seed corpus;
//    the rendered system prompt is fed to the runner
// ---------------------------------------------------------------------------

test(
  "orchestrate: renders the real session-orchestrator from the seed corpus and feeds it to the runner as the system prompt",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    let capturedSystemPrompt: string | undefined;
    const capturingQuery: SdkQueryFn = ({ options }) => {
      // options.systemPrompt is a union (string | string[] | preset); orchestrate passes a string —
      // narrow to it (a non-string would leave capturedSystemPrompt undefined and fail the assert below).
      capturedSystemPrompt =
        typeof options.systemPrompt === "string" ? options.systemPrompt : undefined;
      return (async function* () {
        yield OK_RESULT;
      })();
    };

    const r = await orchestrate({
      intent: "Orient and propose the next unit.",
      store,
      queryFn: capturingQuery,
    });

    assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);

    // The system prompt must be the RENDERED session-orchestrator — its agent header line appears
    // in every rendered prompt (renderAgentPrompt always emits `# <title>   (agent: <id>)`).
    assert.ok(
      capturedSystemPrompt !== undefined,
      "the runner must have been called with a system prompt",
    );
    assert.match(
      capturedSystemPrompt ?? "",
      /session-orchestrator/,
      "the system prompt must name 'session-orchestrator' — it is the rendered Library agent, " +
        "not a hard-coded prompt (ADR-0108 decision 2 / ADR-0051)",
    );

    // The proposal must be what the scripted runner returned in its result message.
    assert.equal(
      r.proposal,
      OK_RESULT.result,
      "the proposal must be extracted from the SDK result message's result field",
    );
  },
);

// ---------------------------------------------------------------------------
// 2. Cost and turns are surfaced from the SDK result
// ---------------------------------------------------------------------------

test("orchestrate: surfaces cost and turns from the headless session result", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);

  const r = await orchestrate({
    intent: "Orient and propose.",
    store,
    queryFn: queryYielding([OK_RESULT]),
  });

  assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);
  assert.equal(r.costUsd, OK_RESULT.total_cost_usd, "costUsd must be read from total_cost_usd");
  assert.equal(r.turns, OK_RESULT.num_turns, "turns must be read from num_turns");
});

// ---------------------------------------------------------------------------
// 3. Fail-closed when session-orchestrator is absent from the store
// ---------------------------------------------------------------------------

test(
  "orchestrate: fails closed when the session-orchestrator agent is absent from the store",
  async () => {
    const store = new InMemoryStore(); // empty — no agents seeded

    let runnerCalled = false;
    const sentinelQuery: SdkQueryFn = () => {
      runnerCalled = true;
      return (async function* () {
        yield OK_RESULT;
      })();
    };

    const r = await orchestrate({
      intent: "Orient and propose.",
      store,
      queryFn: sentinelQuery,
    });

    assert.equal(r.ok, false, "must fail closed when session-orchestrator is missing");
    assert.ok(
      !runnerCalled,
      "the SDK runner must NOT be called when the agent render fails (fail before spending)",
    );
    assert.ok(
      typeof r.error === "string" && r.error.length > 0,
      "a descriptive error must be present when the agent is absent",
    );
  },
);

// ---------------------------------------------------------------------------
// 4. Fail-closed when the headless session returns no result message
// ---------------------------------------------------------------------------

test("orchestrate: fails closed when the headless session yields no result message", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);

  const r = await orchestrate({
    intent: "Orient.",
    store,
    queryFn: queryYielding([{ type: "assistant" }]), // stream with no result message
  });

  assert.equal(r.ok, false, "must fail closed when the SDK session returns no result message");
  assert.match(
    r.error ?? "",
    /without a result|no result|result message/i,
    "error must describe the missing result message",
  );
});
