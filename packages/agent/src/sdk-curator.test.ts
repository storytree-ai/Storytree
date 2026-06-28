import assert from "node:assert/strict";
import { test } from "node:test";

import { runSdkCurator } from "./sdk-curator.js";
import type { SdkQueryFn } from "./sdk-author.js";

/**
 * runSdkCurator's query-loop + result handling, offline through the injectable `queryFn` seam
 * (the same double pattern sdk-author uses). The live SDK is never touched.
 */

function queryYielding(messages: unknown[]): SdkQueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

const okResult = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 2,
  total_cost_usd: 0.0123,
  result: "```json\n[]\n```",
};

test("runSdkCurator returns the final text + cost on a successful result", async () => {
  const r = await runSdkCurator({
    systemPrompt: "SYS",
    userPrompt: "judge this",
    queryFn: queryYielding([{ type: "assistant" }, okResult]),
  });
  assert.equal(r.ok, true);
  assert.equal(r.text, "```json\n[]\n```");
  assert.equal(r.costUsd, 0.0123);
  assert.equal(r.turns, 2);
});

test("runSdkCurator fails closed when the stream carries no result message", async () => {
  const r = await runSdkCurator({
    systemPrompt: "SYS",
    userPrompt: "x",
    queryFn: queryYielding([{ type: "assistant" }]),
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /without a result/);
});

test("runSdkCurator fails closed on a non-success / error result, surfacing cost", async () => {
  const r = await runSdkCurator({
    systemPrompt: "SYS",
    userPrompt: "x",
    queryFn: queryYielding([
      { type: "result", subtype: "error_max_turns", is_error: true, num_turns: 6, total_cost_usd: 0.5, errors: ["hit the cap"] },
    ]),
  });
  assert.equal(r.ok, false);
  assert.equal(r.costUsd, 0.5, "cost is still reported on a failed session");
  assert.match(r.error ?? "", /error_max_turns/);
});

test("runSdkCurator runs with NO USD budget ceiling by default — the turn cap is the brake (ADR-0131)", async () => {
  let opts: { maxBudgetUsd?: number; maxTurns?: number } | undefined;
  const queryFn: SdkQueryFn = (q) => {
    opts = (q as { options: { maxBudgetUsd?: number; maxTurns?: number } }).options;
    return (async function* () {
      yield okResult;
    })();
  };
  const r = await runSdkCurator({ systemPrompt: "SYS", userPrompt: "judge", queryFn });
  assert.equal(r.ok, true);
  // Subscription-funded (ADR-0067/0030) → no phantom dollar wall by default…
  assert.equal(opts?.maxBudgetUsd, undefined, "no maxBudgetUsd unless one is explicitly set");
  // …but the single-shot turn cap (6) is still in force.
  assert.equal(opts?.maxTurns, 6, "the curator turn cap (6) remains the runaway brake");
});

test("runSdkCurator passes an explicit maxBudgetUsd through (the opt-in cap survives, ADR-0131)", async () => {
  let opts: { maxBudgetUsd?: number } | undefined;
  const queryFn: SdkQueryFn = (q) => {
    opts = (q as { options: { maxBudgetUsd?: number } }).options;
    return (async function* () {
      yield okResult;
    })();
  };
  await runSdkCurator({ systemPrompt: "SYS", userPrompt: "judge", maxBudgetUsd: 0.5, queryFn });
  assert.equal(opts?.maxBudgetUsd, 0.5, "an operator-set budget is still honoured as a ceiling");
});

test("runSdkCurator never throws — a throwing query is returned as an error result", async () => {
  const throwing: SdkQueryFn = () =>
    (async function* () {
      throw new Error("network down");
      // eslint-disable-next-line no-unreachable
      yield {};
    })();
  const r = await runSdkCurator({ systemPrompt: "SYS", userPrompt: "x", queryFn: throwing });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /SDK session failed: network down/);
});
