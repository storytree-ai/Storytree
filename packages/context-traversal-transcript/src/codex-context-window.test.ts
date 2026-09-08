/**
 * The current Codex task's raw context-window reading, story
 * `context-traversal-transcript`, capability `codex-own-window-reading`.
 *
 * Every rollout in this test lives under a fresh temporary Codex sessions root. No real Codex
 * home, task, credential, model call, or transcript participates.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";

import { readCodexContextWindow as readCodexContextWindowFromBarrel } from "./index.js";
import { readCodexContextWindow, type CodexContextWindowAvailable } from "./codex-context-window.js";

function withSessionsRoot(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-context-window-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeRollout(root: string, relativeFile: string, lines: readonly unknown[]): string {
  const file = path.join(root, relativeFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`);
  return file;
}

function sessionMeta(threadId: unknown, extra: Record<string, unknown> = {}) {
  return { type: "session_meta", payload: { id: threadId, ...extra } };
}

function usageRecord(
  threadId: string,
  responseId: unknown,
  inputTokens: unknown,
  cachedInputTokens: unknown = 0,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "token_usage_record",
    payload: {
      thread_id: threadId,
      response_id: responseId,
      usage: {
        input_tokens: inputTokens,
        cached_input_tokens: cachedInputTokens,
        output_tokens: 9_999,
        ...extra,
      },
    },
  };
}

interface TokenCountInfoFixture {
  readonly last_token_usage: {
    readonly input_tokens: unknown;
    readonly cached_input_tokens: unknown;
    readonly output_tokens: number;
  };
  readonly total_token_usage: { readonly input_tokens: unknown };
  model_context_window?: unknown;
}

function tokenCount(
  inputTokens: unknown,
  cachedInputTokens: unknown = 0,
  modelContextWindow?: unknown,
  totalInputTokens: unknown = 9_999_999,
) {
  const info: TokenCountInfoFixture = {
    last_token_usage: {
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: 8_888,
    },
    total_token_usage: { input_tokens: totalInputTokens },
  };
  if (modelContextWindow !== undefined) info.model_context_window = modelContextWindow;
  return { type: "event_msg", payload: { type: "token_count", info } };
}

function available(result: ReturnType<typeof readCodexContextWindow>): CodexContextWindowAvailable {
  assert.equal(result.status, "available");
  return result as CodexContextWindowAvailable;
}

test("codex-rollout-selection-uses-the-exact-thread-identity: only one rollout whose session_meta exactly names CODEX_THREAD_ID can win", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/06/rollout-000-thread-target.jsonl", [
      null,
      [],
      7,
      "   ",
      { type: "session_meta", payload: null },
      { type: "session_meta", payload: [] },
      { type: "not-session-meta", payload: { id: "foreign-type" } },
      sessionMeta(""),
      sessionMeta(7),
      sessionMeta({ length: 1 }),
      sessionMeta("thread-target", { cwd: "C:/same/checkout" }),
      { type: "token_usage_record", payload: null },
      usageRecord("thread-target", "resp-target", 41_000),
    ]);
    writeRollout(root, "2026/09/07/rollout-100-thread-target-extra.jsonl", [
      sessionMeta("thread-target-extra", { cwd: "C:/same/checkout" }),
      usageRecord("thread-target-extra", "resp-prefix", 99_001),
    ]);
    writeRollout(root, "2026/09/08/rollout-200-thread-target.jsonl", [
      // The filename is an exact-looking near miss; metadata is authoritative.
      sessionMeta("newest-foreign", { cwd: "C:/same/checkout" }),
      usageRecord("newest-foreign", "resp-foreign", 99_002),
    ]);
    writeRollout(root, "2026/09/08/rollout-300-target.jsonl", [
      sessionMeta("prefix-thread-target-suffix", { cwd: "C:/same/checkout" }),
      usageRecord("prefix-thread-target-suffix", "resp-substring", 99_003),
    ]);
    writeRollout(root, "2026/09/08/ignored.txt", [
      sessionMeta("thread-target"),
      usageRecord("thread-target", "resp-text", 99_004),
    ]);
    writeRollout(root, "2026/09/08/rollout-mixed-identities.jsonl", [
      sessionMeta("thread-target"),
      sessionMeta("foreign-in-same-file"),
      usageRecord("thread-target", "resp-mixed", 99_005),
    ]);

    fs.symlinkSync(path.join(root, "2026", "09", "06"), path.join(root, "linked-sessions"), "junction");

    const result = available(
      readCodexContextWindow(root, {
        CODEX_THREAD_ID: "  thread-target  ",
        CODEX_SESSION_ID: "newest-foreign",
        PWD: "C:/same/checkout",
      }),
    );

    assert.equal(result.threadId, "thread-target");
    assert.equal(result.residentInputTokens, 41_000);
    assert.equal(result.peakInputTokens, 41_000);
    assert.equal(readCodexContextWindowFromBarrel, readCodexContextWindow);
  });
});

test("codex-token-usage-record-is-authoritative-with-legacy-fallback: one vocabulary supplies the whole occupancy series", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-authoritative.jsonl", [
      sessionMeta("thread-authoritative"),
      tokenCount(700_001),
      usageRecord("another-thread", "resp-wrong-thread", 800_001),
      usageRecord("thread-authoritative", "", 800_002),
      usageRecord("thread-authoritative", "   ", 800_003),
      usageRecord("thread-authoritative", 42, 800_004),
      { type: "token_usage_record", payload: { thread_id: "thread-authoritative", response_id: "resp-null-usage", usage: null } },
      { type: "token_usage_record", payload: { thread_id: "thread-authoritative", response_id: "resp-array-usage", usage: [] } },
      usageRecord("thread-authoritative", "resp-1", 110_000),
      usageRecord("thread-authoritative", "resp-1", 900_001),
      tokenCount(700_002),
      usageRecord("thread-authoritative", "resp-2", 125_000),
      { type: "not-event-msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 900_002 } } } },
      { type: "event_msg", payload: { type: "not-token-count", info: { last_token_usage: { input_tokens: 900_003 } } } },
    ]);
    writeRollout(root, "2026/09/08/rollout-legacy.jsonl", [
      sessionMeta("thread-legacy"),
      { type: "not-event-msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 910_001 } } } },
      { type: "event_msg", payload: { type: "not-token-count", info: { last_token_usage: { input_tokens: 910_002 } } } },
      tokenCount(51_000, 49_000, 258_400, 999_999),
      tokenCount(62_000, 60_000, 258_400, 1_999_999),
    ]);

    const authoritative = available(
      readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-authoritative" }),
    );
    assert.equal(authoritative.usageSource, "token_usage_record");
    assert.equal(authoritative.residentInputTokens, 125_000);
    assert.equal(authoritative.peakInputTokens, 125_000);

    const legacy = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-legacy" }));
    assert.equal(legacy.usageSource, "event_msg.token_count");
    assert.equal(legacy.residentInputTokens, 62_000);
    assert.equal(legacy.peakInputTokens, 62_000);
  });
});

test("codex-cached-input-is-a-subset-never-an-addend: cached and output tokens cannot inflate input occupancy", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-cached.jsonl", [
      sessionMeta("thread-cached"),
      usageRecord("thread-cached", "resp-cached", 120_000, 110_000),
    ]);
    writeRollout(root, "2026/09/08/rollout-cached-legacy.jsonl", [
      sessionMeta("thread-cached-legacy"),
      tokenCount(120_000, 110_000),
    ]);

    const authoritative = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-cached" }));
    const fallback = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-cached-legacy" }));

    assert.equal(authoritative.residentInputTokens, 120_000);
    assert.equal(authoritative.peakInputTokens, 120_000);
    assert.equal(fallback.residentInputTokens, 120_000);
    assert.equal(fallback.peakInputTokens, 120_000);
  });
});

test("codex-usage-validation-refuses-non-integers-and-keeps-zero: malformed numeric metadata never becomes occupancy or capacity", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-numeric-validation.jsonl", [
      sessionMeta("thread-numeric"),
      usageRecord("thread-numeric", "resp-string", "4"),
      usageRecord("thread-numeric", "resp-fraction", 1.5),
      usageRecord("thread-numeric", "resp-negative", -1),
      usageRecord("thread-numeric", "resp-unsafe", Number.MAX_SAFE_INTEGER + 1),
      usageRecord("thread-numeric", "resp-zero", 0),
      tokenCount("8", 0, "258400"),
      tokenCount(1.5, 0, 1.5),
      tokenCount(-1, 0, 0),
      tokenCount(Number.MAX_SAFE_INTEGER + 1, 0, Number.MAX_SAFE_INTEGER + 1),
      { type: "event_msg", payload: null },
      { type: "event_msg", payload: { type: "token_count", info: null } },
      { type: "event_msg", payload: { type: "token_count", info: [] } },
      { type: "event_msg", payload: { type: "token_count", info: { last_token_usage: null } } },
      { type: "event_msg", payload: { type: "token_count", info: { last_token_usage: [] } } },
    ]);

    const result = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-numeric" }));
    assert.equal(result.residentInputTokens, 0);
    assert.equal(result.peakInputTokens, 0);
    assert.deepEqual(result.modelContextWindow, { status: "unavailable", reason: "not-declared" });
  });
});

test("codex-an-unreadable-candidate-is-declined-without-throwing: a sibling exact rollout remains usable", () => {
  withSessionsRoot((root) => {
    const unreadable = writeRollout(root, "2026/09/08/rollout-unreadable.jsonl", [
      sessionMeta("thread-unreadable"),
      usageRecord("thread-unreadable", "resp-unreadable", 91_000),
    ]);
    writeRollout(root, "2026/09/08/rollout-readable.jsonl", [
      sessionMeta("thread-readable"),
      usageRecord("thread-readable", "resp-readable", 92_000),
    ]);

    const originalReadFileSync = fs.readFileSync;
    const patched = mock.method(fs, "readFileSync", (file: fs.PathOrFileDescriptor, options: BufferEncoding) => {
      if (file === unreadable) throw new Error("fixture denies this one read");
      return originalReadFileSync(file, options);
    });
    try {
      assert.deepEqual(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-unreadable" }), {
        status: "unavailable",
        reason: "rollout-unavailable",
      });
      assert.equal(
        available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-readable" })).residentInputTokens,
        92_000,
      );
    } finally {
      patched.mock.restore();
    }
  });
});

test("codex-resident-is-latest-and-peak-is-max-across-compactions: rollout order survives a falling resident series", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-compaction.jsonl", [
      sessionMeta("thread-compaction"),
      usageRecord("thread-compaction", "resp-1", 223_965),
      usageRecord("thread-compaction", "resp-2", 234_228),
      usageRecord("thread-compaction", "resp-3", 38_871),
      usageRecord("thread-compaction", "resp-4", 167_204),
    ]);

    const result = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-compaction" }));

    assert.equal(result.residentInputTokens, 167_204);
    assert.equal(result.peakInputTokens, 234_228);
  });
});

test("codex-model-context-window-is-reported-only-when-declared: latest valid runtime capacity is independent from occupancy", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-capacity.jsonl", [
      sessionMeta("thread-capacity"),
      tokenCount(10, 0, 128_000),
      tokenCount(11, 0, -1),
      usageRecord("thread-capacity", "resp-capacity", 75_000),
      tokenCount(12, 0, 258_400),
      tokenCount(13, 0, 0),
    ]);
    writeRollout(root, "2026/09/08/rollout-no-capacity.jsonl", [
      sessionMeta("thread-no-capacity"),
      usageRecord("thread-no-capacity", "resp-no-capacity", 63_000),
    ]);

    const declared = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-capacity" }));
    assert.deepEqual(declared.modelContextWindow, { status: "available", tokens: 258_400 });

    const absent = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-no-capacity" }));
    assert.deepEqual(absent.modelContextWindow, { status: "unavailable", reason: "not-declared" });
    assert.equal(absent.residentInputTokens, 63_000);
  });
});

test("codex-missing-identity-rollout-and-usage-have-distinct-absences: malformed input is partial and every unavailable read is named", () => {
  withSessionsRoot((root) => {
    writeRollout(root, "2026/09/08/rollout-no-usage.jsonl", [
      sessionMeta("thread-no-usage"),
      "{ malformed json",
      usageRecord("thread-no-usage", "resp-bad", "seventy"),
      tokenCount(-1),
    ]);
    writeRollout(root, "2026/09/08/rollout-partial.jsonl", [
      sessionMeta("thread-partial"),
      "{ malformed json",
      usageRecord("thread-partial", "resp-bad", "seventy"),
      usageRecord("thread-partial", "resp-good", 77_000),
    ]);
    writeRollout(root, "2026/09/08/a-rollout-ambiguous.jsonl", [
      sessionMeta("thread-ambiguous"),
      usageRecord("thread-ambiguous", "resp-a", 1),
    ]);
    writeRollout(root, "2026/09/08/b-rollout-ambiguous.jsonl", [
      sessionMeta("thread-ambiguous"),
      usageRecord("thread-ambiguous", "resp-b", 2),
    ]);

    assert.deepEqual(readCodexContextWindow(root, {}), {
      status: "unavailable",
      reason: "identity-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(root, { CODEX_THREAD_ID: "  " }), {
      status: "unavailable",
      reason: "identity-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(root, { CODEX_SESSION_ID: "thread-partial" }), {
      status: "unavailable",
      reason: "identity-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(root, { CODEX_THREAD_ID: "missing" }), {
      status: "unavailable",
      reason: "rollout-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(path.join(root, "missing-root"), { CODEX_THREAD_ID: "missing" }), {
      status: "unavailable",
      reason: "rollout-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-no-usage" }), {
      status: "unavailable",
      reason: "usage-unavailable",
    });
    assert.deepEqual(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-ambiguous" }), {
      status: "unavailable",
      reason: "rollout-unavailable",
    });
    assert.equal(
      available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-partial" })).residentInputTokens,
      77_000,
    );
  });
});

test("codex-composition-and-scheduling-band-remain-explicitly-unavailable: raw usage cannot become a fabricated continuation verdict", () => {
  withSessionsRoot((root) => {
    const canary = "ROLLOUT_PRIVATE_CONTENT_CANARY";
    writeRollout(root, "2026/09/08/rollout-raw-only.jsonl", [
      sessionMeta("thread-raw-only"),
      { type: "user_message", payload: { message: canary } },
      { type: "response_item", payload: { reasoning: canary, tool_input: canary, tool_result: canary } },
      usageRecord("thread-raw-only", "resp-raw", 80_000),
    ]);

    const result = available(readCodexContextWindow(root, { CODEX_THREAD_ID: "thread-raw-only" }));

    assert.deepEqual(result.composition, { status: "unavailable", reason: "not-exposed" });
    assert.deepEqual(result.schedulingBand, { status: "unavailable", reason: "policy-unsettled" });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(canary), false);
    assert.doesNotMatch(serialized, /\b(?:calm|soft|hard)\b/);
  });
});
