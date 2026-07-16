import test from "node:test";
import assert from "node:assert/strict";

import {
  ModelTokenUsage,
  TokenUsage,
  USAGE_EVENT_KIND,
  UsageEventDoc,
} from "./index.js";

/**
 * The token-usage wire shapes: the runtime-cost sibling stream to the signed verdict. Round-trip
 * + reject, the shapes.test.ts discipline — a reader `.safeParse()`s usage-DATA across the
 * boundary, so drift must fail loudly here, never silently downstream.
 */

const USAGE: TokenUsage = {
  inputTokens: 12,
  cacheCreationInputTokens: 3_456,
  cacheReadInputTokens: 210_000,
  outputTokens: 987,
};

test("TokenUsage round-trips and keeps the four billing axes apart", () => {
  assert.deepEqual(TokenUsage.parse(USAGE), USAGE);
  // A collapsed single-number shape must not validate — the axes bill at different rates.
  assert.equal(TokenUsage.safeParse({ tokens: 42 }).success, false);
  // Negative and fractional counts are malformed accounting.
  assert.equal(TokenUsage.safeParse({ ...USAGE, outputTokens: -1 }).success, false);
  assert.equal(TokenUsage.safeParse({ ...USAGE, inputTokens: 1.5 }).success, false);
  // Strict: an unknown field is drift, not data.
  assert.equal(TokenUsage.safeParse({ ...USAGE, rogue: 1 }).success, false);
});

test("UsageEventDoc round-trips a full doc and a minimal one", () => {
  const full: UsageEventDoc = {
    unitId: "u1",
    runId: "real-abc",
    phase: "AUTHOR_TEST",
    source: "sdk-leaf",
    usage: USAGE,
    model: "claude-sonnet-5",
    turns: 7,
    costUsd: 0.42,
    byModel: {
      "claude-sonnet-5": { ...USAGE, costUsd: 0.4 },
      "claude-haiku-4-5": { ...USAGE, costUsd: 0.02 },
    },
  };
  assert.deepEqual(UsageEventDoc.parse(full), full);

  const minimal: UsageEventDoc = {
    unitId: "u1",
    runId: "real-abc",
    phase: "IMPLEMENT",
    source: "owned-loop",
    usage: USAGE,
  };
  assert.deepEqual(UsageEventDoc.parse(minimal), minimal);
});

test("UsageEventDoc rejects malformed docs fail-closed", () => {
  const minimal = {
    unitId: "u1",
    runId: "r",
    phase: "IMPLEMENT",
    source: "sdk-leaf",
    usage: USAGE,
  };
  // The phase vocabulary is BuildPhase — an invented word is drift.
  assert.equal(UsageEventDoc.safeParse({ ...minimal, phase: "SHIPPING" }).success, false);
  // The source names one of the two leaf runtimes, nothing else.
  assert.equal(UsageEventDoc.safeParse({ ...minimal, source: "mystery" }).success, false);
  // No usage breakdown = nothing to persist; the field is required.
  const { usage: _dropped, ...withoutUsage } = minimal;
  assert.equal(UsageEventDoc.safeParse(withoutUsage).success, false);
  // Strict: unknown fields are rejected.
  assert.equal(UsageEventDoc.safeParse({ ...minimal, rogue: true }).success, false);
});

test("ModelTokenUsage carries the optional metered per-model cost", () => {
  assert.deepEqual(ModelTokenUsage.parse({ ...USAGE, costUsd: 0.1 }), { ...USAGE, costUsd: 0.1 });
  assert.deepEqual(ModelTokenUsage.parse(USAGE), USAGE);
  assert.equal(ModelTokenUsage.safeParse({ ...USAGE, costUsd: -0.1 }).success, false);
});

test("the usage kind literal is stable wire vocabulary", () => {
  assert.equal(USAGE_EVENT_KIND, "usage");
});
