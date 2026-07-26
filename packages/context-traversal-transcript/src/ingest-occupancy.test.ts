/**
 * Turns a session's correlated host-transcript windows into validated `model_context` occupancy
 * events on disk, idempotently (ADR-0235 clause 6 / ADR-0241 D4 / ADR-0248 D1-D3), story
 * `context-traversal-transcript`, capability `transcript-occupancy-ingest`.
 *
 * Every fixture writes real transcript JSONL into a unique temporary directory (never the real
 * `~/.claude/projects`) and ingests into a unique temporary trace directory (never the real
 * `~/.storytree/traces`), then reads the trace back through a brand-new `readTraversalSession` call
 * — there is no in-process object shared between "ingest" and "verify", so this proves durability
 * through the real sink, not an in-memory shortcut.
 *
 * Covers the five contracts declared in the node spec, in this order:
 *   1. ingest-writes-validated-model-context-events-to-disk
 *   2. cumulative-is-the-running-billing-total-per-window
 *   3. capacity-is-absent-because-a-transcript-declares-none
 *   4. re-ingesting-appends-no-bytes
 *   5. the-adapter-declares-its-own-exhaustive-coverage
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { readTraversalSession } from "@storytree/context-traversal-capture";
import { ContextTraversalCoverage, ContextTraversalEvent, CoverageFeature } from "@storytree/context-traversal-telemetry";

import { HOST_TRANSCRIPT_COVERAGE, ingestTranscriptOccupancy } from "./ingest-occupancy.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ingest-occupancy-${prefix}-`));
}

/** A `.claude/worktrees/<sessionId>` cwd, exactly the shape `correlateTranscripts` matches on. */
function worktreeCwd(sessionId: string): string {
  return `/home/dev/code/storytree/.claude/worktrees/${sessionId}`;
}

function traceFilePath(traceDir: string, sessionId: string): string {
  return path.join(traceDir, `${sessionId}.jsonl`);
}

interface FixtureLineOpts {
  /** Omitted entirely (never written) for a line that must not enter transcript correlation. */
  readonly cwd?: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly id: string;
  readonly isSidechain?: boolean;
  readonly model?: string;
  readonly usage?: Record<string, number>;
  readonly omitUsage?: boolean;
}

function assistantLine(opts: FixtureLineOpts): string {
  const message: Record<string, unknown> = {
    id: opts.id,
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.omitUsage === true ? {} : { usage: opts.usage ?? {} }),
  };
  return JSON.stringify({
    type: "assistant",
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    isSidechain: opts.isSidechain ?? false,
    message,
  });
}

function writeFile(filePath: string, lines: readonly string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("ingest-writes-validated-model-context-events-to-disk: a session's correlated windows land on disk as validated model_context events, in window order then request order, alongside honest scan/skip/sidechain counts", () => {
  const sessionId = "session-ingest-basic";
  const cwd = worktreeCwd(sessionId);
  const transcriptDir = freshDir("basic-transcripts");
  const traceDir = freshDir("basic-trace");

  writeFile(path.join(transcriptDir, "window-a.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-w1",
      timestamp: "2026-07-20T00:00:00.000Z",
      id: "msg_1",
      model: "model-a",
      usage: { input_tokens: 60, cache_read_input_tokens: 40 },
    }),
    // Assistant-shaped but unusable (no usage at all): correlates the file to the window, but
    // contributes neither an observation nor a written event — only the honest skip count.
    assistantLine({
      cwd,
      sessionId: "host-w1",
      timestamp: "2026-07-20T00:00:30.000Z",
      id: "msg_bad",
      omitUsage: true,
    }),
    assistantLine({
      cwd,
      sessionId: "host-w1",
      timestamp: "2026-07-20T00:01:00.000Z",
      id: "msg_2",
      usage: { input_tokens: 50 },
    }),
  ]);

  writeFile(path.join(transcriptDir, "window-b.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-w2",
      timestamp: "2026-07-20T01:00:00.000Z",
      id: "msg_3",
      model: "model-b",
      usage: { input_tokens: 30 },
    }),
    // A subagent request, deliberately carrying NO cwd (a sidechain line's cwd never enters
    // transcript correlation) so it cannot make this file's window identity ambiguous. Excluded
    // from the parent occupancy series, but counted.
    assistantLine({
      sessionId: "host-w2-child",
      timestamp: "2026-07-20T01:00:01.000Z",
      id: "msg_sub1",
      isSidechain: true,
      usage: { input_tokens: 999 },
    }),
  ]);

  const result = ingestTranscriptOccupancy({ sessionId, traceDir, transcriptDir });

  assert.equal(result.sessionId, sessionId);
  assert.equal(result.scannedFiles, 2);
  assert.deepEqual(result.windows, [
    { windowId: "host-w1", observed: 2, appended: 2 },
    { windowId: "host-w2", observed: 1, appended: 1 },
  ]);
  assert.equal(result.appended, 3);
  assert.equal(result.skippedLines, 1);
  assert.equal(result.sidechainRequests, 1);

  // A brand-new reader call — no state carried over from the ingest above.
  const { replay, skipped } = readTraversalSession({ dir: traceDir, sessionId });
  assert.equal(skipped, 0);
  assert.equal(replay.events.length, 3);

  const [first, second, third] = replay.events;

  assert.ok(first?.kind === "model_context");
  if (first?.kind === "model_context") {
    assert.equal(first.eventId, "host-transcript:host-w1:msg_1");
    assert.equal(first.sessionId, sessionId);
    assert.equal(first.at, "2026-07-20T00:00:00.000Z");
    assert.equal(first.windowId, "host-w1");
    assert.equal(first.modelId, "model-a");
    assert.equal(first.residentInputTokens, 100);
    assert.equal(first.cumulativeInputTokens, 100);
    assert.equal(first.addedInputTokens, 100);
    assert.equal(Object.prototype.hasOwnProperty.call(first, "contextWindowCapacity"), false);
  }

  assert.ok(second?.kind === "model_context");
  if (second?.kind === "model_context") {
    assert.equal(second.eventId, "host-transcript:host-w1:msg_2");
    assert.equal(second.sessionId, sessionId);
    assert.equal(second.windowId, "host-w1");
    assert.equal(Object.prototype.hasOwnProperty.call(second, "modelId"), false);
    assert.equal(second.residentInputTokens, 50);
    // Running sum WITHIN the window: 100 (msg_1) + 50 (msg_2).
    assert.equal(second.cumulativeInputTokens, 150);
    assert.equal(second.addedInputTokens, 150);
  }

  assert.ok(third?.kind === "model_context");
  if (third?.kind === "model_context") {
    assert.equal(third.eventId, "host-transcript:host-w2:msg_3");
    assert.equal(third.sessionId, sessionId);
    assert.equal(third.windowId, "host-w2");
    assert.equal(third.modelId, "model-b");
    assert.equal(third.residentInputTokens, 30);
    // A NEW window: the running total starts fresh, never continuing host-w1's 150.
    assert.equal(third.cumulativeInputTokens, 30);
    assert.equal(third.addedInputTokens, 30);
    assert.equal(Object.prototype.hasOwnProperty.call(third, "contextWindowCapacity"), false);
  }

  // Real-collaborator validation: every event that reached disk independently satisfies the
  // published ADR-0235 vocabulary (strict — an extra/leaked field would fail this parse).
  for (const event of replay.events) ContextTraversalEvent.parse(event);
});

test("cumulative-is-the-running-billing-total-per-window: cumulativeInputTokens is the running sum of residentInputTokens up to and including each request, resetting fresh at the first request of every new window — never continuing the prior window's total, and never equal to a naive per-request delta", () => {
  const sessionId = "session-cumulative";
  const cwd = worktreeCwd(sessionId);
  const transcriptDir = freshDir("cumulative-transcripts");
  const traceDir = freshDir("cumulative-trace");

  writeFile(path.join(transcriptDir, "window-a.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-cum-a",
      timestamp: "2026-08-01T00:00:00.000Z",
      id: "c_a1",
      usage: { input_tokens: 100 },
    }),
    // Resident FALLS (100 -> 40): occupancy can fall while the billing total keeps climbing.
    assistantLine({
      cwd,
      sessionId: "host-cum-a",
      timestamp: "2026-08-01T00:01:00.000Z",
      id: "c_a2",
      usage: { input_tokens: 40 },
    }),
    assistantLine({
      cwd,
      sessionId: "host-cum-a",
      timestamp: "2026-08-01T00:02:00.000Z",
      id: "c_a3",
      usage: { input_tokens: 70 },
    }),
  ]);

  writeFile(path.join(transcriptDir, "window-b.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-cum-b",
      timestamp: "2026-08-01T01:00:00.000Z",
      id: "c_b1",
      usage: { input_tokens: 5 },
    }),
    assistantLine({
      cwd,
      sessionId: "host-cum-b",
      timestamp: "2026-08-01T01:01:00.000Z",
      id: "c_b2",
      usage: { input_tokens: 15 },
    }),
  ]);

  const result = ingestTranscriptOccupancy({ sessionId, traceDir, transcriptDir });
  assert.equal(result.appended, 5);

  const { replay } = readTraversalSession({ dir: traceDir, sessionId });
  assert.equal(replay.events.length, 5);

  const windowAEvents = replay.events.filter(
    (event): event is Extract<typeof event, { kind: "model_context" }> =>
      event.kind === "model_context" && event.windowId === "host-cum-a",
  );
  const windowBEvents = replay.events.filter(
    (event): event is Extract<typeof event, { kind: "model_context" }> =>
      event.kind === "model_context" && event.windowId === "host-cum-b",
  );

  assert.deepEqual(
    windowAEvents.map((event) => event.residentInputTokens),
    [100, 40, 70],
  );
  // Running SUM, not a per-request echo: 100, 100+40, 100+40+70.
  assert.deepEqual(
    windowAEvents.map((event) => event.cumulativeInputTokens),
    [100, 140, 210],
  );
  assert.deepEqual(
    windowAEvents.map((event) => event.addedInputTokens),
    [100, 140, 210],
  );
  // The occupancy quantity fell (100 -> 40) while the billing total kept climbing (100 -> 140) —
  // proof the two are computed independently, never one derived from the other.
  const [firstA, secondA] = windowAEvents;
  assert.ok(firstA !== undefined && secondA !== undefined);
  if (firstA !== undefined && secondA !== undefined) {
    assert.ok(secondA.residentInputTokens < firstA.residentInputTokens);
    assert.ok(secondA.cumulativeInputTokens > firstA.cumulativeInputTokens);
  }

  assert.deepEqual(
    windowBEvents.map((event) => event.residentInputTokens),
    [5, 15],
  );
  // A NEW window: the running total starts fresh at its own first request (5), never continuing
  // window A's final total (210).
  assert.deepEqual(
    windowBEvents.map((event) => event.cumulativeInputTokens),
    [5, 20],
  );
  assert.deepEqual(
    windowBEvents.map((event) => event.addedInputTokens),
    [5, 20],
  );
});

test("capacity-is-absent-because-a-transcript-declares-none: contextWindowCapacity never appears on a written model_context event, because the host transcript surface declares no window size at all", () => {
  const sessionId = "session-no-capacity";
  const cwd = worktreeCwd(sessionId);
  const transcriptDir = freshDir("no-capacity-transcripts");
  const traceDir = freshDir("no-capacity-trace");

  writeFile(path.join(transcriptDir, "window.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-nc",
      timestamp: "2026-08-05T00:00:00.000Z",
      id: "nc_1",
      model: "model-rich",
      usage: { input_tokens: 5_000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 1_000 },
    }),
    assistantLine({
      cwd,
      sessionId: "host-nc",
      timestamp: "2026-08-05T00:01:00.000Z",
      id: "nc_2",
      usage: { input_tokens: 10 },
    }),
  ]);

  const result = ingestTranscriptOccupancy({ sessionId, traceDir, transcriptDir });
  assert.equal(result.appended, 2);

  const { replay } = readTraversalSession({ dir: traceDir, sessionId });
  assert.equal(replay.events.length, 2);
  for (const event of replay.events) {
    assert.equal(event.kind, "model_context");
    assert.equal(Object.prototype.hasOwnProperty.call(event, "contextWindowCapacity"), false);
  }

  // The strongest form of this check: the substring never reaches the bytes on disk at all, not
  // merely "the parsed object happens to read as undefined".
  const raw = fs.readFileSync(traceFilePath(traceDir, sessionId), "utf8");
  assert.equal(raw.includes("contextWindowCapacity"), false);
});

test("re-ingesting-appends-no-bytes: a second ingest over unchanged transcripts appends zero events and writes zero new bytes to the trace file", () => {
  const sessionId = "session-reingest";
  const cwd = worktreeCwd(sessionId);
  const transcriptDir = freshDir("reingest-transcripts");
  const traceDir = freshDir("reingest-trace");

  writeFile(path.join(transcriptDir, "window.jsonl"), [
    assistantLine({
      cwd,
      sessionId: "host-re",
      timestamp: "2026-08-10T00:00:00.000Z",
      id: "re_1",
      usage: { input_tokens: 20 },
    }),
    assistantLine({
      cwd,
      sessionId: "host-re",
      timestamp: "2026-08-10T00:01:00.000Z",
      id: "re_2",
      usage: { input_tokens: 30 },
    }),
  ]);

  const first = ingestTranscriptOccupancy({ sessionId, traceDir, transcriptDir });
  assert.equal(first.appended, 2);
  assert.deepEqual(first.windows, [{ windowId: "host-re", observed: 2, appended: 2 }]);

  const rawAfterFirst = fs.readFileSync(traceFilePath(traceDir, sessionId), "utf8");

  const second = ingestTranscriptOccupancy({ sessionId, traceDir, transcriptDir });
  assert.equal(second.sessionId, sessionId);
  assert.equal(second.appended, 0);
  // "observed" reports what the window YIELDED, independent of what was already durable — only
  // "appended" collapses to zero on a re-ingest.
  assert.deepEqual(second.windows, [{ windowId: "host-re", observed: 2, appended: 0 }]);

  const rawAfterSecond = fs.readFileSync(traceFilePath(traceDir, sessionId), "utf8");
  assert.equal(rawAfterSecond, rawAfterFirst);

  const { replay } = readTraversalSession({ dir: traceDir, sessionId });
  assert.equal(replay.events.length, 2);
});

test("the-adapter-declares-its-own-exhaustive-coverage: HOST_TRANSCRIPT_COVERAGE names exactly the five features this adapter supports and derives every omission from the closed vocabulary, so a future feature can never go silently unnamed", () => {
  const parsed = ContextTraversalCoverage.parse(HOST_TRANSCRIPT_COVERAGE);

  assert.equal(parsed.adapterId, "host-transcript");

  const expectedSupported = [
    "surface:host_transcript",
    "event:model_context",
    "field:model_tokens",
    "field:resident_input_tokens",
    "field:window_id",
  ];
  assert.deepEqual([...parsed.supported].sort(), [...expectedSupported].sort());

  // The transcript surface declares no window size, and this adapter observes model requests
  // only — capacity, and every visit/search/candidate/followed-edge/spawn/return feature, is
  // explicitly omitted rather than silently absent.
  assert.ok(parsed.omitted.includes("field:context_window_capacity"));
  assert.ok(parsed.omitted.includes("event:front_matter_read"));
  assert.ok(parsed.omitted.includes("event:full_payload_read"));
  assert.ok(parsed.omitted.includes("event:search"));
  assert.ok(parsed.omitted.includes("event:candidate_set"));
  assert.ok(parsed.omitted.includes("event:followed_edge"));
  assert.ok(parsed.omitted.includes("event:spawn_handoff"));
  assert.ok(parsed.omitted.includes("event:result_return"));

  // Deletion check on the coverage export itself: every feature in the closed domain sits on
  // exactly one side, so a future vocabulary addition can never leave a silent gap.
  for (const feature of CoverageFeature.options) {
    const onSupported = parsed.supported.includes(feature);
    const onOmitted = parsed.omitted.includes(feature);
    assert.notEqual(onSupported, onOmitted);
  }
  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});
