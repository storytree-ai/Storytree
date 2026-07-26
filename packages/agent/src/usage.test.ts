import test from "node:test";
import assert from "node:assert/strict";

import { usageFromApi } from "./model.js";
import { ClaudeAgentAuthor, usageFromSdkResult } from "./sdk-author.js";

/**
 * Token-usage CAPTURE at both leaf paths (the mapping half of the usage pipeline: API/SDK result
 * in → TokenUsage out). The persistence half (usage doc → store write) is proven in
 * @storytree/drive and the pg work store's routing tests.
 */

test("usageFromApi maps the Messages API usage block, normalizing absent cache fields to 0", () => {
  assert.deepEqual(
    usageFromApi({
      input_tokens: 11,
      output_tokens: 22,
      cache_creation_input_tokens: 33,
      cache_read_input_tokens: 44,
    }),
    { inputTokens: 11, cacheCreationInputTokens: 33, cacheReadInputTokens: 44, outputTokens: 22 },
  );
  // The cache fields are nullable API-side (caching off) — 0 is what absent means.
  assert.deepEqual(
    usageFromApi({ input_tokens: 5, output_tokens: 6, cache_creation_input_tokens: null, cache_read_input_tokens: null }),
    { inputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 6 },
  );
});

test("usageFromSdkResult reads the SDK result's snake_case usage + camelCase modelUsage", () => {
  const out = usageFromSdkResult({
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300_000,
      output_tokens: 400,
    },
    modelUsage: {
      "claude-sonnet-5": {
        inputTokens: 100,
        outputTokens: 400,
        cacheReadInputTokens: 300_000,
        cacheCreationInputTokens: 200,
        webSearchRequests: 0,
        costUSD: 0.1234,
        contextWindow: 200_000,
        maxOutputTokens: 64_000,
      },
    },
  });
  assert.deepEqual(out.usage, {
    inputTokens: 100,
    cacheCreationInputTokens: 200,
    cacheReadInputTokens: 300_000,
    outputTokens: 400,
  });
  assert.deepEqual(out.byModel, {
    "claude-sonnet-5": {
      inputTokens: 100,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 300_000,
      outputTokens: 400,
      costUsd: 0.1234,
      // The runtime-DECLARED context window (ADR-0235 clause 4) — carried verbatim off the SDK's
      // `ModelUsage`, never a default and never a model-id → capacity lookup. This is the only
      // source of a declared capacity in the whole pipeline.
      contextWindow: 200_000,
    },
  });
});

test("a declared context window is carried only when it is genuinely declared and positive", () => {
  const windowOf = (raw: Record<string, unknown>): number | undefined =>
    usageFromSdkResult({ modelUsage: { "claude-sonnet-5": { inputTokens: 1, outputTokens: 2, ...raw } } })
      .byModel?.["claude-sonnet-5"]?.contextWindow;

  // Declared and positive: carried verbatim.
  assert.equal(windowOf({ contextWindow: 1_000_000 }), 1_000_000);
  // Not declared at all (an old SDK, a scripted double): ABSENT, never defaulted or estimated.
  assert.equal(windowOf({}), undefined);
  // Zero is not a window. Token COUNTS legitimately read 0, but `contextWindowCapacity` is a
  // positive count downstream, so a 0 carried forward would fail its zod parse instead of
  // degrading to "unknown". It must become absent here, at the first opportunity.
  assert.equal(windowOf({ contextWindow: 0 }), undefined);
  // Garbage is skipped like every other usage field — additive, never fail-closed.
  assert.equal(windowOf({ contextWindow: -1 }), undefined);
  assert.equal(windowOf({ contextWindow: "200k" }), undefined);
  assert.equal(windowOf({ contextWindow: null }), undefined);
});

test("usageFromSdkResult is additive, never fail-closed: unreadable usage yields nothing", () => {
  // No usage at all (an old SDK / a scripted double): the slice still lands, just without tokens.
  assert.deepEqual(usageFromSdkResult({}), {});
  // Malformed aggregate (missing the required axes) is skipped, not thrown.
  assert.deepEqual(usageFromSdkResult({ usage: { input_tokens: "lots" } }), {});
  // A malformed per-model entry is skipped while readable ones survive.
  const out = usageFromSdkResult({
    modelUsage: {
      broken: { inputTokens: "NaN" },
      "claude-haiku-4-5": { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 },
    },
  });
  assert.deepEqual(Object.keys(out.byModel ?? {}), ["claude-haiku-4-5"]);
});

test("ClaudeAgentAuthor records the slice's token breakdown on runs[] when the result carries one", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: process.cwd(),
    isWriteAllowed: () => true,
    queryFn: async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 40,
        },
        modelUsage: {
          "claude-sonnet-5": {
            inputTokens: 10,
            outputTokens: 40,
            cacheReadInputTokens: 30,
            cacheCreationInputTokens: 20,
            costUSD: 0.05,
          },
        },
      };
    },
  });
  const result = await author.author("AUTHOR_TEST", "write the failing test");
  assert.equal(result.ok, true);
  assert.equal(author.runs.length, 1);
  const run = author.runs[0]!;
  assert.deepEqual(run.usage, {
    inputTokens: 10,
    cacheCreationInputTokens: 20,
    cacheReadInputTokens: 30,
    outputTokens: 40,
  });
  assert.deepEqual(run.byModel, {
    "claude-sonnet-5": {
      inputTokens: 10,
      cacheCreationInputTokens: 20,
      cacheReadInputTokens: 30,
      outputTokens: 40,
      costUsd: 0.05,
    },
  });
});

test("a result with no usage keeps the pre-usage runs[] shape (capture is additive)", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: process.cwd(),
    isWriteAllowed: () => true,
    queryFn: async function* () {
      yield { type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0 };
    },
  });
  const result = await author.author("IMPLEMENT", "implement");
  assert.equal(result.ok, true);
  assert.equal(author.runs[0]!.usage, undefined);
  assert.equal(author.runs[0]!.byModel, undefined);
});
