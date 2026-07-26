/**
 * The host transcript as the orchestrator's own context-window occupancy (ADR-0235 / ADR-0241 /
 * ADR-0248 D1), story `context-traversal-transcript`, capability `transcript-occupancy-extraction`.
 *
 * Every fixture writes a fresh JSONL transcript into a unique temporary directory (never the real
 * `~/.claude/projects`) and reads it back through a brand-new call to `readTranscriptWindow`.
 *
 * Covers the six contracts declared in the node spec, in this order:
 *   1. occupancy-is-the-per-request-resident-total
 *   2. the-occupancy-series-can-fall
 *   3. one-observation-per-request-not-per-line
 *   4. subagent-requests-never-enter-the-parent-window
 *   5. an-unusable-transcript-reads-partially-and-never-throws
 *   6. no-transcript-content-reaches-an-observation
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readTranscriptWindow } from "./transcript-occupancy.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `transcript-occupancy-${prefix}-`));
}

interface LineOpts {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly id: string;
  readonly isSidechain?: boolean;
  readonly model?: string;
  readonly usage?: Record<string, unknown>;
  readonly type?: string;
  readonly messageExtra?: Record<string, unknown>;
  readonly rootExtra?: Record<string, unknown>;
  readonly omitUsage?: boolean;
  readonly omitMessage?: boolean;
}

function assistantLine(opts: LineOpts): string {
  const message: Record<string, unknown> = {
    id: opts.id,
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.omitUsage === true ? {} : { usage: opts.usage ?? {} }),
    ...(opts.messageExtra ?? {}),
  };
  return JSON.stringify({
    type: opts.type ?? "assistant",
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    isSidechain: opts.isSidechain ?? false,
    ...(opts.rootExtra ?? {}),
    ...(opts.omitMessage === true ? {} : { message }),
  });
}

test("occupancy-is-the-per-request-resident-total: the observation sums input + cache-read + cache-creation for that one request, and a missing axis reads as 0", () => {
  const dir = freshDir("total");
  const filePath = path.join(dir, "session.jsonl");
  const lines = [
    assistantLine({
      sessionId: "session-total",
      timestamp: "2026-07-17T22:38:44.720Z",
      id: "msg_1",
      model: "claude-opus-4-8",
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: 32920,
        cache_creation_input_tokens: 34801,
        output_tokens: 692,
      },
    }),
    assistantLine({
      sessionId: "session-total",
      timestamp: "2026-07-17T22:39:00.000Z",
      id: "msg_2",
      model: "claude-opus-4-8",
      // no cache_read_input_tokens, no cache_creation_input_tokens: missing axes must read as 0
      usage: { input_tokens: 100, output_tokens: 10 },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);

  const result = readTranscriptWindow(filePath);

  assert.equal(result.windowId, "session-total");
  assert.equal(result.observations.length, 2);
  assert.equal(result.observations[0]?.requestId, "msg_1");
  assert.equal(result.observations[0]?.at, "2026-07-17T22:38:44.720Z");
  assert.equal(result.observations[0]?.residentInputTokens, 2 + 32920 + 34801);
  assert.equal(result.observations[0]?.modelId, "claude-opus-4-8");
  assert.equal(result.observations[1]?.requestId, "msg_2");
  assert.equal(result.observations[1]?.residentInputTokens, 100);
  assert.equal(result.skippedLines, 0);
  assert.equal(result.sidechainRequests, 0);
});

test("the-occupancy-series-can-fall: a later request's resident total can be lower than an earlier one's, because cache-read reports what actually replayed", () => {
  const dir = freshDir("falls");
  const filePath = path.join(dir, "session.jsonl");
  const lines = [
    assistantLine({
      sessionId: "session-falls",
      timestamp: "2026-07-17T23:00:00.000Z",
      id: "msg_a",
      usage: { input_tokens: 1000, cache_read_input_tokens: 49000, cache_creation_input_tokens: 0 },
    }),
    // A compaction (or a shorter prompt) drops resident context — the series must fall, not climb.
    assistantLine({
      sessionId: "session-falls",
      timestamp: "2026-07-17T23:05:00.000Z",
      id: "msg_b",
      usage: { input_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);

  const result = readTranscriptWindow(filePath);

  assert.equal(result.observations.length, 2);
  assert.equal(result.observations[0]?.residentInputTokens, 50000);
  assert.equal(result.observations[1]?.residentInputTokens, 500);
  assert.ok(
    result.observations[1]!.residentInputTokens < result.observations[0]!.residentInputTokens,
    "the occupancy series must be able to fall between consecutive requests",
  );
});

test("one-observation-per-request-not-per-line: several lines sharing one message.id produce exactly one observation, taken from the first line", () => {
  const dir = freshDir("dedupe");
  const filePath = path.join(dir, "session.jsonl");
  const lines = [
    // Three lines for the SAME request (a streaming write) — only the first must count.
    assistantLine({
      sessionId: "session-onereq",
      timestamp: "2026-07-17T23:10:00.000Z",
      id: "msg_dup",
      usage: { input_tokens: 10, cache_read_input_tokens: 20 },
    }),
    assistantLine({
      sessionId: "session-onereq",
      timestamp: "2026-07-17T23:10:01.000Z",
      id: "msg_dup",
      usage: { input_tokens: 999, cache_read_input_tokens: 999 },
    }),
    assistantLine({
      sessionId: "session-onereq",
      timestamp: "2026-07-17T23:10:02.000Z",
      id: "msg_dup",
      usage: { input_tokens: 1234, cache_read_input_tokens: 1234 },
    }),
    // A genuinely new request must still produce its own observation.
    assistantLine({
      sessionId: "session-onereq",
      timestamp: "2026-07-17T23:11:00.000Z",
      id: "msg_next2",
      usage: { input_tokens: 5 },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);

  const result = readTranscriptWindow(filePath);

  assert.equal(result.windowId, "session-onereq");
  assert.equal(result.observations.length, 2);
  assert.equal(result.observations[0]?.requestId, "msg_dup");
  // The value must come from the FIRST line's usage, never a later line's.
  assert.equal(result.observations[0]?.residentInputTokens, 10 + 20);
  assert.equal(result.observations[1]?.requestId, "msg_next2");
  assert.equal(result.observations[1]?.residentInputTokens, 5);
  // Repeat lines for an already-seen request are neither observations nor skips.
  assert.equal(result.skippedLines, 0);
  assert.equal(result.sidechainRequests, 0);
});

test("subagent-requests-never-enter-the-parent-window: sidechain requests are excluded from the series and counted separately, deduped like any other request", () => {
  const dir = freshDir("sidechain");
  const filePath = path.join(dir, "session.jsonl");
  const lines = [
    assistantLine({
      sessionId: "parent-session",
      timestamp: "2026-07-17T23:20:00.000Z",
      id: "msg_p1",
      usage: { input_tokens: 100 },
    }),
    // A subagent's own window — a different sessionId, must not affect the parent's windowId.
    assistantLine({
      sessionId: "child-session-xyz",
      timestamp: "2026-07-17T23:20:01.000Z",
      id: "msg_sub1",
      isSidechain: true,
      usage: { input_tokens: 5000 },
    }),
    // Repeated line for the same sidechain request — dedupe by message.id applies here too.
    assistantLine({
      sessionId: "child-session-xyz",
      timestamp: "2026-07-17T23:20:02.000Z",
      id: "msg_sub1",
      isSidechain: true,
      usage: { input_tokens: 5000 },
    }),
    // A second, distinct sidechain request.
    assistantLine({
      sessionId: "child-session-xyz",
      timestamp: "2026-07-17T23:20:03.000Z",
      id: "msg_sub2",
      isSidechain: true,
      usage: { input_tokens: 6000 },
    }),
    assistantLine({
      sessionId: "parent-session",
      timestamp: "2026-07-17T23:20:04.000Z",
      id: "msg_p2",
      usage: { input_tokens: 200 },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);

  const result = readTranscriptWindow(filePath);

  assert.equal(result.windowId, "parent-session");
  assert.deepEqual(
    result.observations.map((o) => o.requestId),
    ["msg_p1", "msg_p2"],
  );
  assert.equal(result.sidechainRequests, 2);
  assert.equal(result.skippedLines, 0);
});

test("an-unusable-transcript-reads-partially-and-never-throws: a missing file, an empty file, unusable assistant lines, a crash-truncated line, and an ambiguous window all read partially and never throw", () => {
  // A missing file: no throw, no usable line at all -> windowId undefined, everything empty.
  const missingDir = freshDir("missing");
  const missingPath = path.join(missingDir, "does-not-exist.jsonl");
  let threwOnMissing = false;
  let missingResult;
  try {
    missingResult = readTranscriptWindow(missingPath);
  } catch {
    threwOnMissing = true;
  }
  assert.equal(threwOnMissing, false, "a missing file must never throw");
  assert.equal(missingResult?.windowId, undefined);
  assert.deepEqual(missingResult?.observations, []);
  assert.equal(missingResult?.skippedLines, 0);
  assert.equal(missingResult?.sidechainRequests, 0);

  // An empty file: no usable line at all -> the same honest empty shape.
  const emptyDir = freshDir("empty");
  const emptyPath = path.join(emptyDir, "session.jsonl");
  fs.writeFileSync(emptyPath, "");
  const emptyResult = readTranscriptWindow(emptyPath);
  assert.equal(emptyResult.windowId, undefined);
  assert.deepEqual(emptyResult.observations, []);
  assert.equal(emptyResult.skippedLines, 0);

  // A mixed file: good requests survive, non-assistant lines are ignored (not skipped-with-a-count),
  // unusable assistant-shaped lines are skipped and counted, and a crash-truncated final line is too.
  const mixedDir = freshDir("mixed");
  const mixedPath = path.join(mixedDir, "session.jsonl");
  const good1 = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:00.000Z",
    id: "msg_good1",
    usage: { input_tokens: 10 },
  });
  const notAModelRequest = JSON.stringify({
    type: "user",
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:01.000Z",
    message: { content: "hi" },
  });
  const missingUsage = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:02.000Z",
    id: "msg_bad1",
    omitUsage: true,
  });
  const good2 = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:03.000Z",
    id: "msg_good2",
    usage: { input_tokens: 20 },
  });
  const negativeAxis = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:04.000Z",
    id: "msg_bad2",
    usage: { input_tokens: -5 },
  });
  const summaryLine = JSON.stringify({
    type: "summary",
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:05.000Z",
  });
  const nonIntegerAxis = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:06.000Z",
    id: "msg_bad3",
    usage: { cache_read_input_tokens: 12.5 },
  });
  const usageNotAnObject = assistantLine({
    sessionId: "session-partial",
    timestamp: "2026-07-17T23:30:07.000Z",
    id: "msg_bad4",
    usage: "not-an-object" as unknown as Record<string, unknown>,
  });
  // The classic crash-mid-write shape: recognizably an assistant line, but truncated at EOF.
  const truncatedFinalLine =
    '{"type":"assistant","sessionId":"session-partial","timestamp":"2026-07-17T23:30:08.000Z",' +
    '"isSidechain":false,"message":{"id":"msg_trunc","usage":{"input_tokens":5';

  const mixedLines = [good1, notAModelRequest, missingUsage, good2, negativeAxis, summaryLine, nonIntegerAxis, usageNotAnObject];
  fs.writeFileSync(mixedPath, `${mixedLines.join("\n")}\n${truncatedFinalLine}`);

  let threwOnMixed = false;
  let mixedResult;
  try {
    mixedResult = readTranscriptWindow(mixedPath);
  } catch {
    threwOnMixed = true;
  }
  assert.equal(threwOnMixed, false, "an unusable assistant line must never throw");
  assert.equal(mixedResult?.windowId, "session-partial");
  assert.deepEqual(
    mixedResult?.observations.map((o) => o.requestId),
    ["msg_good1", "msg_good2"],
  );
  // 4 unusable assistant-shaped lines (missing usage, negative axis, non-integer axis, usage not an
  // object) + 1 crash-truncated final line = 5. The user/summary lines are not counted at all.
  assert.equal(mixedResult?.skippedLines, 5);
  assert.equal(mixedResult?.sidechainRequests, 0);

  // Usable lines that disagree about sessionId: the window identity is refused, not guessed at.
  const ambiguousDir = freshDir("ambiguous");
  const ambiguousPath = path.join(ambiguousDir, "session.jsonl");
  const ambiguousLines = [
    assistantLine({
      sessionId: "session-x",
      timestamp: "2026-07-17T23:40:00.000Z",
      id: "msg_x",
      usage: { input_tokens: 1 },
    }),
    assistantLine({
      sessionId: "session-y",
      timestamp: "2026-07-17T23:40:01.000Z",
      id: "msg_y",
      usage: { input_tokens: 1 },
    }),
  ];
  fs.writeFileSync(ambiguousPath, `${ambiguousLines.join("\n")}\n`);
  const ambiguousResult = readTranscriptWindow(ambiguousPath);
  assert.equal(ambiguousResult.windowId, undefined);
  assert.deepEqual(ambiguousResult.observations, []);
});

test("no-transcript-content-reaches-an-observation: an observation carries only requestId, at, residentInputTokens, and an optional modelId — nothing else", () => {
  const dir = freshDir("noleak");
  const filePath = path.join(dir, "session.jsonl");
  const lines = [
    assistantLine({
      sessionId: "session-noleak",
      timestamp: "2026-07-17T23:50:00.000Z",
      id: "msg_rich",
      model: "claude-opus-4-8",
      usage: { input_tokens: 7, cache_read_input_tokens: 3 },
      messageExtra: {
        content: [{ type: "text", text: "SECRET-CANARY do not leak me into an observation" }],
        stop_reason: "end_turn",
      },
      rootExtra: {
        cwd: "/Users/example/CANARY-CWD-PATH",
        gitBranch: "CANARY-BRANCH-main",
        uuid: "CANARY-UUID-1234",
      },
    }),
    // A request that declares no model at all: modelId must be ABSENT, never an empty string.
    assistantLine({
      sessionId: "session-noleak",
      timestamp: "2026-07-17T23:50:01.000Z",
      id: "msg_nomodel",
      usage: { input_tokens: 1 },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);

  const result = readTranscriptWindow(filePath);

  assert.equal(result.observations.length, 2);
  const rich = result.observations[0]!;
  const noModel = result.observations[1]!;

  assert.deepEqual(Object.keys(rich).sort(), ["at", "modelId", "requestId", "residentInputTokens"]);
  assert.equal(rich.requestId, "msg_rich");
  assert.equal(rich.residentInputTokens, 10);
  assert.equal(rich.modelId, "claude-opus-4-8");

  const serializedRich = JSON.stringify(rich);
  assert.equal(serializedRich.includes("CANARY"), false);
  assert.equal(serializedRich.includes("SECRET"), false);
  assert.equal(serializedRich.includes("end_turn"), false);

  assert.deepEqual(Object.keys(noModel).sort(), ["at", "requestId", "residentInputTokens"]);
  assert.equal(Object.prototype.hasOwnProperty.call(noModel, "modelId"), false);
});
