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
