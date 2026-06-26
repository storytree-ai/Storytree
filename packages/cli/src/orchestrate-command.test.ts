/**
 * Dispatch tests for the `storytree orchestrate <intent>` CLI command (ADR-0108 Phase 1).
 *
 * The command is the thin operator entry over the {@link orchestrate} composition: it parses the
 * intent, builds the read-only orientation runner (the same `run()` dispatch closed over the session
 * deps with `writable:false`), and drives the headless session. These tests pin the DISPATCH offline
 * by injecting a scripted `queryFn` through the `deps.orchestrate` test seam — no live SDK spend (the
 * real orientation/proposal against the live three surfaces is the operator-attested Story UAT leg).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { run } from "./commands.js";

const OK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 3,
  total_cost_usd: 0.02,
  result: "Proposal: build the next Phase-1 follow-on (the chat surface, ADR-0108 Phase 2).",
};

function scriptedQuery(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

test("orchestrate command: routes the intent to the headless runtime and surfaces the proposal (offline, scripted queryFn)", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);

  const env = await run(["orchestrate", "orient", "and", "propose", "the", "next", "unit"], {
    store,
    orchestrate: { queryFn: scriptedQuery([OK_RESULT]) },
  });

  assert.equal(env.ok, true, `expected an ok envelope; body: ${env.body}`);
  assert.match(env.body, /Proposal: build the next Phase-1 follow-on/, "the proposal text must be surfaced");
  assert.match(env.body, /read\/propose only/i, "the body must frame Phase 1 as read/propose only");
});

test("orchestrate command: a missing intent returns usage guidance and never calls the SDK", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);

  let called = false;
  const env = await run(["orchestrate"], {
    store,
    orchestrate: {
      queryFn: () => {
        called = true;
        return (async function* () {})();
      },
    },
  });

  assert.equal(env.ok, false, "a missing intent must be a usage failure");
  assert.match(env.body, /needs an intent/i, "the failure must name the missing intent");
  assert.equal(called, false, "no SDK session may start without an intent (fail before spend)");
});

test("orchestrate command: fails closed when the session-orchestrator agent is absent from the store", async () => {
  const store = new InMemoryStore(); // empty — no agents seeded

  const env = await run(["orchestrate", "orient and propose"], {
    store,
    orchestrate: { queryFn: scriptedQuery([OK_RESULT]) },
  });

  assert.equal(env.ok, false, "must fail closed when the agent cannot be rendered");
  assert.match(env.body, /orchestration failed/i, "the failure must be surfaced as guidance");
});
