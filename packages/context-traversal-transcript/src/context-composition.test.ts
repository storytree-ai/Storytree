/**
 * The composition fold (`context-window-composition-arc` increment 1, ADR-0516 D3/D4).
 *
 * Every fixture writes real JSONL into a fresh temporary file — never `~/.claude/projects` — and
 * reads it back through the fold. The shapes are the ones measured on this machine on 2026-09-05
 * (40 newest transcripts, 4,403 attachments across 13 declared types).
 *
 * THE CASES THAT ARE NOT DECORATION, each one a way the composition could lie:
 *   • an attachment type the table does not know must land UNCLASSIFIED under its own name, never
 *     inside a named category and never dropped — the review left 8.4% there rather than guess;
 *   • the residual must be an ABSENCE when no request can be read, never a zero, because zero says
 *     the harness's preamble costs nothing;
 *   • the residual's visible half must close at the FIRST COUNTED request — bytes after it are the
 *     window's later intake, and folding them in would wipe the residual out;
 *   • a `<synthetic>` opener must not be the request the residual is read from (its usage is zero);
 *   • helper (sidechain) lines and the harness's bookkeeping records must be set aside, counted, and
 *     named — an exclusion nobody can see reads exactly like an absence of the thing excluded.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildCompositionBar,
  CHARS_PER_TOKEN,
  categoryLabel,
  COMPOSITION_SEGMENT_ORDER,
  MANDATORY_CATEGORIES,
  readWindowComposition,
  readWindowSeriesWithComposition,
  segmentLabel,
  type CompositionCategory,
  type CompositionSegmentKey,
} from "./context-composition.js";

const WINDOW = "1b2c3d4e-0000-4000-8000-000000000001";
const CWD = "/home/me/.claude/worktrees/some-session";

function line(record: Record<string, unknown>): string {
  return JSON.stringify({ sessionId: WINDOW, cwd: CWD, timestamp: "2026-09-05T07:00:00.000Z", ...record });
}

function attachment(body: Record<string, unknown>): string {
  return line({ type: "attachment", attachment: body });
}

function assistant(id: string, blocks: readonly Record<string, unknown>[], tokens: number, model = "claude-fable-5-1"): string {
  return line({
    type: "assistant",
    message: { id, model, content: blocks, usage: { input_tokens: tokens, cache_read_input_tokens: 0 } },
  });
}

function user(content: unknown, extra: Record<string, unknown> = {}): string {
  return line({ type: "user", message: { role: "user", content }, ...extra });
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function writeTranscript(lines: readonly string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-composition-"));
  const file = path.join(dir, `${WINDOW}.jsonl`);
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return file;
}

function slice(file: string, category: CompositionCategory) {
  return readWindowComposition(file).slices.find((s) => s.category === category);
}

test("every declared attachment type lands in its category, measured in the bytes the transcript recorded", () => {
  const skills = { type: "skill_listing", content: "- dataviz: …", skillCount: 1, isInitial: true, names: ["dataviz"] };
  const hook = { type: "hook_success", hookName: "SessionStart", stdout: "ok", stderr: "", exitCode: 0 };
  const memory = { type: "nested_memory", displayPath: "../../CLAUDE.md", content: "# storytree" };
  const reminder = { type: "total_tokens_reminder", text: "<total_tokens>15000000 tokens left</total_tokens>" };
  const edited = { type: "edited_text_file", filename: "a.ts", snippet: "x" };
  const queued = { type: "queued_command", prompt: "and also do this", commandMode: "prompt" };
  const file = writeTranscript([
    attachment(skills),
    attachment({ type: "agent_listing_delta", addedTypes: ["Explore"], addedLines: ["- Explore"] }),
    attachment(hook),
    attachment(memory),
    attachment(reminder),
    attachment(edited),
    attachment(queued),
  ]);

  const composition = readWindowComposition(file);
  const byCategory = new Map(composition.slices.map((s) => [s.category, s]));

  assert.equal(byCategory.get("project-guidance")?.bytes, bytesOf(memory));
  assert.equal(byCategory.get("hook-injection")?.bytes, bytesOf(hook));
  assert.equal(byCategory.get("harness-reminder")?.bytes, bytesOf(reminder));
  assert.equal(byCategory.get("file-change-notice")?.bytes, bytesOf(edited));
  assert.equal(byCategory.get("human-prompt")?.bytes, bytesOf(queued));
  // Two catalogue attachments fold into one slice, and the record count says so.
  const catalogue = byCategory.get("harness-catalogue");
  assert.equal(catalogue?.records, 2);
  assert.ok((catalogue?.bytes ?? 0) > bytesOf(skills));

  // No model request in this fixture, so `readTranscriptWindow` names no window — the fold echoes
  // that rather than inventing one from the file name.
  assert.equal(composition.windowId, undefined);
  assert.deepEqual(composition.unclassifiedLabels, []);
  assert.equal(
    composition.accountedBytes,
    composition.slices.reduce((sum, s) => sum + s.bytes, 0),
  );
});

test("every declared attachment type maps to its category — the table, pinned row by row", () => {
  const table: readonly (readonly [string, CompositionCategory])[] = [
    ["nested_memory", "project-guidance"],
    ["skill_listing", "harness-catalogue"],
    ["agent_listing_delta", "harness-catalogue"],
    ["deferred_tools_delta", "harness-catalogue"],
    ["mcp_instructions_delta", "harness-catalogue"],
    ["command_permissions", "harness-catalogue"],
    ["hook_success", "hook-injection"],
    ["hook_additional_context", "hook-injection"],
    ["hook_non_blocking_error", "hook-injection"],
    ["total_tokens_reminder", "harness-reminder"],
    ["batching_reminder_sent", "harness-reminder"],
    ["silent_turn_reminder", "harness-reminder"],
    ["date_change", "harness-reminder"],
    ["auto_mode", "harness-reminder"],
    ["edited_text_file", "file-change-notice"],
    ["queued_command", "human-prompt"],
  ];
  for (const [type, category] of table) {
    const file = writeTranscript([attachment({ type, payload: "p" })]);
    const composition = readWindowComposition(file);
    assert.deepEqual(
      composition.slices,
      [{ category, bytes: bytesOf({ type, payload: "p" }), records: 1 }],
      `${type} → ${category}`,
    );
    assert.deepEqual(composition.unclassifiedLabels, [], type);
  }
});

test("message blocks split by their own type: tool output, tool calls, prose, thinking, the human's words", () => {
  const prompt = "Please build the thing.";
  const toolUse = { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls -la" } };
  const result = { type: "tool_result", tool_use_id: "t1", content: "total 0\n".repeat(40) };
  const prose = { type: "text", text: "Done." };
  const thinking = { type: "thinking", thinking: "…" };
  const redacted = { type: "redacted_thinking", data: "opaque" };
  const file = writeTranscript([
    user(prompt),
    assistant("m1", [thinking], 100),
    assistant("m1", [redacted], 100),
    assistant("m1", [toolUse], 100),
    user([result], { toolUseResult: { stdout: "DUPLICATE STRUCTURED COPY — must not be counted" } }),
    assistant("m2", [prose], 200),
  ]);

  assert.equal(slice(file, "human-prompt")?.bytes, Buffer.byteLength(JSON.stringify(prompt), "utf8"));
  assert.equal(slice(file, "tool-calls")?.bytes, bytesOf(toolUse));
  assert.equal(slice(file, "tool-output")?.bytes, bytesOf(result));
  assert.equal(slice(file, "assistant-text")?.bytes, bytesOf(prose));
  assert.deepEqual(slice(file, "assistant-thinking"), {
    category: "assistant-thinking",
    bytes: bytesOf(thinking) + bytesOf(redacted),
    records: 2,
  });
  assert.equal(readWindowComposition(file).slices[0]?.category, "tool-output", "largest first");
});

test("a harness-authored user message (isMeta) is not the human's words, in either message shape", () => {
  const file = writeTranscript([
    user("<local-command-stdout>…</local-command-stdout>", { isMeta: true }),
    user([{ type: "text", text: "<command-name>/foo</command-name>" }], { isMeta: true }),
    user("mine"),
    user([{ type: "text", text: "also mine" }]),
  ]);
  assert.equal(slice(file, "harness-message")?.records, 2);
  assert.equal(slice(file, "human-prompt")?.records, 2);
  assert.equal(
    slice(file, "human-prompt")?.bytes,
    Buffer.byteLength(JSON.stringify("mine"), "utf8") + bytesOf({ type: "text", text: "also mine" }),
  );
});

test("two categories of equal size order by name, so a render is stable across runs", () => {
  const hook = { type: "hook_success", stdout: "abcdefghij" };
  const reminder = { type: "date_change", newDate: "2026-09-06" };
  assert.equal(bytesOf(hook), bytesOf(reminder), "fixture sanity: the two records tie on bytes");
  const file = writeTranscript([attachment(hook), attachment(reminder)]);
  assert.deepEqual(
    readWindowComposition(file).slices.map((s) => s.category),
    ["harness-reminder", "hook-injection"],
  );
});

test("an attachment or block type the table does not know is reported under its own name, never distributed and never dropped", () => {
  const novel = { type: "brand_new_injection", payload: "x".repeat(500) };
  const oddBlock = { type: "document", source: { data: "y".repeat(300) } };
  const file = writeTranscript([
    attachment(novel),
    user([oddBlock]),
    attachment({ noType: true }),
    line({ type: "attachment" }),
    line({ type: "attachment", attachment: null }),
    user(["a bare string where a block should be", { type: 5 }]),
  ]);

  const composition = readWindowComposition(file);
  const unclassified = composition.slices.find((s) => s.category === "unclassified");
  // Seven records: the novel type, the odd block, the untyped attachment, an attachment line
  // carrying no attachment at all (weighs nothing, still a record), a `null` attachment, a bare
  // string in a content array, and a block whose `type` is not a string.
  assert.equal(unclassified?.records, 7);
  assert.equal(
    unclassified?.bytes,
    bytesOf(novel) + bytesOf(oddBlock) + bytesOf({ noType: true }) + bytesOf(null) + bytesOf("a bare string where a block should be") + bytesOf({ type: 5 }),
  );
  assert.deepEqual(composition.unclassifiedLabels, [
    "attachment:<untyped>",
    "attachment:brand_new_injection",
    "block:<untyped>",
    "block:document",
  ]);
  // Nothing leaked into a named category.
  assert.equal(composition.slices.length, 1);
});

test("a message line with no message, or a message whose content is not text or blocks, classifies nothing and throws nothing", () => {
  const file = writeTranscript([
    line({ type: "user" }),
    line({ type: "assistant", message: { id: "m", model: "x", usage: { input_tokens: 1 } } }),
    line({ type: "user", message: { content: 42 } }),
    user("counted"),
  ]);
  const composition = readWindowComposition(file);
  assert.deepEqual(composition.slices, [{ category: "human-prompt", bytes: bytesOf("counted"), records: 1 }]);
  assert.equal(composition.unparseableLines, 0);
  assert.equal(composition.nonRecordLines, 0);
});

test("the harness's bookkeeping records are set aside, counted and named — not in the composition", () => {
  const enqueue = { type: "queue-operation", operation: "enqueue", content: "the prompt, logged" };
  const lastPrompt = { type: "last-prompt", lastPrompt: "the prompt, logged again" };
  const file = writeTranscript([
    line(enqueue),
    line(lastPrompt),
    line({ type: "atis-latch", atis: "" }),
    line({ type: 7 }),
    line({ untyped: true }),
    user("the prompt"),
  ]);

  const composition = readWindowComposition(file);
  assert.equal(composition.bookkeeping.records, 5);
  // A record whose `type` is missing or not a string is bookkeeping under one shared name.
  assert.deepEqual(composition.bookkeeping.kinds, ["<untyped>", "atis-latch", "last-prompt", "queue-operation"]);
  // The whole line, wrapper and all — bookkeeping is measured as the record, since no part of it is content.
  assert.equal(
    composition.bookkeeping.bytes,
    Buffer.byteLength(line(enqueue), "utf8") +
      Buffer.byteLength(line(lastPrompt), "utf8") +
      Buffer.byteLength(line({ type: "atis-latch", atis: "" }), "utf8") +
      Buffer.byteLength(line({ type: 7 }), "utf8") +
      Buffer.byteLength(line({ untyped: true }), "utf8"),
  );
  assert.equal(composition.accountedBytes, Buffer.byteLength(JSON.stringify("the prompt"), "utf8"));
});

test("helper (sidechain) lines are excluded from the parent's composition and the exclusion is counted", () => {
  const big = { type: "tool_result", tool_use_id: "h1", content: "z".repeat(10_000) };
  const file = writeTranscript([
    user("parent prompt"),
    line({ type: "assistant", isSidechain: true, message: { id: "h", model: "m", content: [{ type: "text", text: "helper" }], usage: { input_tokens: 5 } } }),
    line({ type: "user", isSidechain: true, message: { content: [big] } }),
  ]);

  const composition = readWindowComposition(file);
  assert.equal(composition.sidechainLinesExcluded, 2);
  assert.equal(composition.slices.find((s) => s.category === "tool-output"), undefined);
  assert.equal(composition.accountedBytes, Buffer.byteLength(JSON.stringify("parent prompt"), "utf8"));
});

test("the residual is the first counted request's resident tokens minus what the transcript saw BEFORE it, at the named calibration", () => {
  // The visible half is one prompt of 3,799 characters, serialised with its two quotes: 3,801 bytes.
  // At 3.8 chars/token that is 1000.26 tokens, which CEILS to 1,001 — floor would say 1,000 and
  // overstate the residual by one; the numbers below are literals so that difference is asserted.
  const later = { type: "tool_result", tool_use_id: "t1", content: "later intake ".repeat(5_000) };
  const file = writeTranscript([
    user("x".repeat(3_799)),
    assistant("first", [{ type: "tool_use", id: "t1", name: "Bash", input: {} }], 106_000),
    user([later]),
    assistant("second", [{ type: "text", text: "ok" }], 150_000),
  ]);

  const composition = readWindowComposition(file);
  assert.equal(composition.residualAbsence, null);
  assert.equal(composition.windowId, WINDOW, "the window id is readTranscriptWindow's, not the file name's");
  assert.deepEqual(composition.residual, {
    firstRequestResidentTokens: 106_000,
    visibleBytesBeforeFirstRequest: 3_801,
    visibleTokensEstimate: 1_001,
    residualTokens: 104_999,
    charsPerToken: CHARS_PER_TOKEN,
  });
  assert.equal(CHARS_PER_TOKEN, 3.8, "ADR-0330 D1's calibration");
  // The later tool output is in the composition and NOT in the residual's visible half.
  assert.ok((slice(file, "tool-output")?.bytes ?? 0) > 60_000);
});

test("only the first counted request's OWN line closes the visible half — a user line naming that id does not", () => {
  const before = { type: "tool_result", tool_use_id: "t0", content: "b".repeat(1_000) };
  const file = writeTranscript([
    user("go"),
    // A user-role line whose message carries the same id: a request is an assistant line, so this
    // must still be counted as visible rather than closing the half early.
    line({ type: "user", message: { id: "first", content: [before] } }),
    assistant("first", [{ type: "text", text: "hi" }], 50_000),
  ]);
  assert.equal(
    readWindowComposition(file).residual?.visibleBytesBeforeFirstRequest,
    bytesOf("go") + bytesOf(before),
  );
});

test("a <synthetic> opener is not the request the residual is read from", () => {
  const file = writeTranscript([
    user("go"),
    assistant("syn", [{ type: "text", text: "" }], 0, "<synthetic>"),
    user("more"),
    assistant("real", [{ type: "text", text: "hi" }], 90_000),
  ]);

  const residual = readWindowComposition(file).residual;
  assert.equal(residual?.firstRequestResidentTokens, 90_000);
  // Both user turns precede the real request, so both are in its visible half.
  assert.equal(
    residual?.visibleBytesBeforeFirstRequest,
    Buffer.byteLength(JSON.stringify("go"), "utf8") +
      bytesOf({ type: "text", text: "" }) +
      Buffer.byteLength(JSON.stringify("more"), "utf8"),
  );
});

test("the residual floors at zero rather than going negative when the visible half out-weighs the resident figure", () => {
  const file = writeTranscript([
    user("x".repeat(100_000)),
    assistant("first", [{ type: "text", text: "ok" }], 10),
  ]);
  assert.equal(readWindowComposition(file).residual?.residualTokens, 0);
});

test("no readable request means the residual is an ABSENCE, never a zero", () => {
  const file = writeTranscript([
    attachment({ type: "skill_listing", content: "…", skillCount: 0, isInitial: true, names: [] }),
    user("go"),
    assistant("syn", [{ type: "text", text: "" }], 0, "<synthetic>"),
  ]);

  const composition = readWindowComposition(file);
  assert.equal(composition.residual, null);
  assert.equal(composition.residualAbsence, "no-readable-request");
  // The composition itself is still read — an absent residual does not blank the categories.
  assert.ok(composition.accountedBytes > 0);
});

test("an unreadable file is an empty composition with its own absence, and never a throw", () => {
  const file = path.join(os.tmpdir(), "storytree-composition-does-not-exist", "nope.jsonl");
  assert.deepEqual(readWindowComposition(file), {
    file,
    windowId: undefined,
    slices: [],
    accountedBytes: 0,
    toolSubjects: [],
    otherToolNames: [],
    knowledgeSurfaces: [],
    unclassifiedLabels: [],
    bookkeeping: { bytes: 0, records: 0, kinds: [] },
    sidechainLinesExcluded: 0,
    unparseableLines: 0,
    nonRecordLines: 0,
    residual: null,
    residualAbsence: "unreadable-file",
  });
});

test("a line that is not JSON and a line that is JSON but no record are counted apart, and the rest of the file is still read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-composition-"));
  const file = path.join(dir, `${WINDOW}.jsonl`);
  fs.writeFileSync(
    file,
    [user("ok"), '{"type":"assistant","message":{"id":"cut', "[1,2]", "null", "   ", "", user("still read")].join("\n") + "\n",
    "utf8",
  );

  const composition = readWindowComposition(file);
  // The truncated line is not JSON; the array and `null` are JSON that is not a record. Counted
  // apart. Whitespace-only and empty lines are skipped, not counted.
  assert.equal(composition.unparseableLines, 1);
  assert.equal(composition.nonRecordLines, 2);
  assert.equal(composition.slices.find((s) => s.category === "human-prompt")?.records, 2);
});

test("every category has a plain-language label, and the mandatory set names only what a session cannot trim", () => {
  const all: CompositionCategory[] = [
    "tool-output",
    "tool-calls",
    "assistant-text",
    "assistant-thinking",
    "human-prompt",
    "harness-message",
    "project-guidance",
    "harness-catalogue",
    "hook-injection",
    "harness-reminder",
    "file-change-notice",
    "unclassified",
  ];
  for (const category of all) assert.ok(categoryLabel(category).length > 0, category);
  assert.ok(categoryLabel("assistant-thinking").includes("not all of it stays resident"), "the thinking caveat is on its label");
  assert.deepEqual(MANDATORY_CATEGORIES, [
    "project-guidance",
    "harness-catalogue",
    "hook-injection",
    "harness-reminder",
    "file-change-notice",
  ]);
});

// ── THE SECOND CUT (ADR-0524) ────────────────────────────────────────────────────────────────────
//
// The subject cut re-slices `tool-output` alone. The cases below are the ways it could lie:
//   • it must SUM to the `tool-output` slice — a re-cut that does not is a second quantity, and a
//     bar drawing both cuts at once would double-count;
//   • a result whose call was never seen must land under `unattributed`, never be distributed;
//   • the record-type cut must be UNCHANGED by its presence — `storytree context`'s remedy line
//     rests on that cut and this increment does not get to move it.

// Inference, not an open dictionary: the anti-slop rule refuses widening a known shape to
// `Record<string, unknown>`, and the inferred literal type carries an implicit index signature that
// satisfies every caller here anyway.
function toolUse(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input };
}

function toolResult(id: string, text: string) {
  return { type: "tool_result", tool_use_id: id, content: text };
}

test("the subject cut splits tool output by what the call was ABOUT, and SUMS to the tool-output slice", () => {
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "pnpm storytree library artifact adr-0524 --pg" })], 1000),
    user([toolResult("t1", "the decision document, at length".repeat(20))]),
    assistant("a2", [toolUse("t2", "Read", { file_path: "/repo/src/x.ts" })], 1200),
    user([toolResult("t2", "file contents".repeat(40))]),
    assistant("a3", [toolUse("t3", "Bash", { command: "pnpm gate --scope" })], 1400),
    user([toolResult("t3", "gate output".repeat(10))]),
    assistant("a4", [toolUse("t4", "WebFetch", { url: "https://example.test" })], 1600),
    user([toolResult("t4", "page text")]),
  ]);

  const composition = readWindowComposition(file);
  const subjects = new Map(composition.toolSubjects.map((s) => [s.subject, s]));

  assert.equal(subjects.get("knowledge-graph")?.records, 1);
  assert.equal(subjects.get("file-read")?.records, 1);
  assert.equal(subjects.get("shell")?.records, 1);
  assert.equal(subjects.get("other-tool")?.records, 1);
  assert.deepEqual(composition.otherToolNames, ["WebFetch"], "the other-tool residual names its tools");

  // THE INVARIANT. A re-cut of one slice sums to that slice — anything else is a second quantity.
  const toolOutput = composition.slices.find((s) => s.category === "tool-output");
  assert.equal(
    composition.toolSubjects.reduce((sum, s) => sum + s.bytes, 0),
    toolOutput?.bytes,
  );
  assert.equal(
    composition.toolSubjects.reduce((sum, s) => sum + s.records, 0),
    toolOutput?.records,
  );

  // The knowledge-graph surface breakdown is by LABEL, exactly — never a threshold (ADR-0524 D5).
  assert.deepEqual(
    composition.knowledgeSurfaces.map((s) => s.surface),
    ["library-artifact"],
  );
  assert.equal(composition.knowledgeSurfaces[0]?.bytes, subjects.get("knowledge-graph")?.bytes);
});

test("a tool result whose call was never seen is UNATTRIBUTED, never distributed into a named subject", () => {
  // Its call sits before a compaction boundary, or in a transcript that begins mid-conversation.
  // Charging it to a subject would inflate whichever one the guess favoured — the same posture the
  // record-type cut takes with an attachment label it does not know.
  const file = writeTranscript([
    user([toolResult("orphan", "output whose call this transcript never recorded")]),
    assistant("a1", [toolUse("t1", "Read", { file_path: "/x" })], 900),
    user([toolResult("t1", "contents")]),
  ]);

  const composition = readWindowComposition(file);
  const subjects = new Map(composition.toolSubjects.map((s) => [s.subject, s]));
  assert.equal(subjects.get("unattributed")?.records, 1);
  assert.equal(subjects.get("file-read")?.records, 1);
  assert.equal(subjects.get("knowledge-graph"), undefined, "nothing is invented for the orphan");
  assert.equal(
    composition.toolSubjects.reduce((sum, s) => sum + s.bytes, 0),
    composition.slices.find((s) => s.category === "tool-output")?.bytes,
  );
});

test("the RECORD-TYPE cut is unchanged by the subject cut — the call's own bytes stay in tool-calls", () => {
  const call = toolUse("t1", "Bash", { command: "pnpm storytree arc show my-arc --pg" });
  const result = toolResult("t1", "the arc, at length".repeat(30));
  const file = writeTranscript([assistant("a1", [call], 1000), user([result])]);

  const composition = readWindowComposition(file);
  // A knowledge-graph CALL is `tool-calls` and its OUTPUT is `tool-output`: the subject axis never
  // moves a byte between record types, which is what keeps `storytree context`'s reading intact.
  assert.equal(composition.slices.find((s) => s.category === "tool-calls")?.bytes, bytesOf(call));
  assert.equal(composition.slices.find((s) => s.category === "tool-output")?.bytes, bytesOf(result));
  assert.equal(composition.toolSubjects.length, 1);
  assert.equal(composition.toolSubjects[0]?.subject, "knowledge-graph");
});

test("a window with no tool traffic has an EMPTY subject cut, not a zeroed one", () => {
  const file = writeTranscript([user("just a prompt"), assistant("a1", [{ type: "text", text: "an answer" }], 800)]);
  const composition = readWindowComposition(file);
  assert.deepEqual(composition.toolSubjects, []);
  assert.deepEqual(composition.otherToolNames, []);
  assert.deepEqual(composition.knowledgeSurfaces, []);
});

// ── THE BAR (ADR-0524 D1/D2) ─────────────────────────────────────────────────────────────────────
//
// The ways a bar could lie about the window it claims to be:
//   • drawing BOTH `tool-output` and its subject slices would double-count 56% of the window;
//   • a size-sorted order would reshuffle between windows and destroy the one reading a bar is good
//     at — comparing two of them;
//   • a harness floor drawn as ZERO when it cannot be read would say the preamble is free;
//   • the segments must SUM to the stated total, or every share drawn against it is wrong.

test("the bar replaces tool-output with its subjects and never draws both — the 56% double-count", () => {
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "storytree library artifact adr-0524" })], 1000),
    user([toolResult("t1", "the decision".repeat(50))]),
    assistant("a2", [toolUse("t2", "Read", { file_path: "/x.ts" })], 1100),
    user([toolResult("t2", "contents".repeat(50))]),
  ]);

  const composition = readWindowComposition(file);
  const bar = buildCompositionBar(composition);
  const keys = bar.segments.map((s) => s.key);

  assert.ok(!keys.includes("tool-output" as CompositionSegmentKey), "the record-type slice is not drawn");
  assert.ok(keys.includes("knowledge-graph") && keys.includes("file-read"), "its subjects are");
  assert.equal(
    bar.segments.reduce((sum, s) => sum + s.tokens, 0),
    bar.totalTokens,
    "the segments sum to the stated total",
  );
  // The knowledge graph leads, because it is what the traversal below the bar draws.
  assert.equal(keys[0], "knowledge-graph");
});

test("the order is DECLARED, not size-sorted — a bigger segment does not jump the queue", () => {
  // File reads dwarf the knowledge-graph read here. A size-sorted bar would put them first and
  // reshuffle the moment a window's mix changed.
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "storytree arc show a" })], 1000),
    user([toolResult("t1", "short")]),
    assistant("a2", [toolUse("t2", "Read", { file_path: "/x.ts" })], 1100),
    user([toolResult("t2", "an enormous file".repeat(500))]),
  ]);

  const bar = buildCompositionBar(readWindowComposition(file));
  const keys = bar.segments.map((s) => s.key);
  assert.equal(keys.indexOf("knowledge-graph") < keys.indexOf("file-read"), true);
  const fileReads = bar.segments.find((s) => s.key === "file-read");
  const knowledge = bar.segments.find((s) => s.key === "knowledge-graph");
  assert.ok((fileReads?.tokens ?? 0) > (knowledge?.tokens ?? 0), "and it is genuinely the bigger one");
});

test("the harness floor is a segment when it can be read, and ABSENT — never zero — when it cannot", () => {
  // A window whose only request is `<synthetic>` carries an all-zero usage: no floor can be read.
  const synthetic = writeTranscript([
    user("hello"),
    assistant("syn", [{ type: "text", text: "" }], 0, "<synthetic>"),
  ]);
  const absent = buildCompositionBar(readWindowComposition(synthetic));
  assert.equal(absent.residualTokens, null);
  assert.equal(absent.residualAbsence, "no-readable-request");
  assert.ok(!absent.segments.some((s) => s.key === "harness-floor"), "no zero-width floor is drawn");

  // A window with a real request has one, read off that request's own usage.
  const real = writeTranscript([
    user("hello"),
    assistant("m1", [{ type: "text", text: "hi" }], 90_000),
  ]);
  const bar = buildCompositionBar(readWindowComposition(real));
  const floor = bar.segments.find((s) => s.key === "harness-floor");
  assert.ok((floor?.tokens ?? 0) > 80_000, "the floor is the largest thing in a fresh window");
  assert.equal(floor?.bytes, null, "it is a subtraction, not a byte count");
  assert.equal(floor?.records, null);
  assert.equal(bar.segments.at(-1)?.key, "harness-floor", "and it is drawn last");
});

test("a category with no bytes is OMITTED, so the bar names only what this window actually held", () => {
  const bar = buildCompositionBar(readWindowComposition(writeTranscript([user("just a prompt")])));
  assert.deepEqual(
    bar.segments.map((s) => s.key),
    ["human-prompt"],
  );
});

test("every declared key has a label and appears exactly once — a render cannot invent its own order", () => {
  assert.equal(new Set(COMPOSITION_SEGMENT_ORDER).size, COMPOSITION_SEGMENT_ORDER.length);
  for (const key of COMPOSITION_SEGMENT_ORDER) assert.ok(segmentLabel(key).length > 0, key);
  assert.equal(segmentLabel("knowledge-graph"), "knowledge graph", "ADR-0524 D3's naming");
  assert.ok(segmentLabel("harness-floor").includes("system prompt"));
  // `tool-output` is deliberately not a segment key: its subjects are the segments.
  assert.ok(!(COMPOSITION_SEGMENT_ORDER as readonly string[]).includes("tool-output"));
});

test("the bar converts bytes at the fold's OWN calibration, never a second estimator", () => {
  const result = toolResult("t1", "x".repeat(3800));
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Read", { file_path: "/x" })], 5_000),
    user([result]),
  ]);
  const composition = readWindowComposition(file);
  const bar = buildCompositionBar(composition);
  assert.equal(bar.charsPerToken, CHARS_PER_TOKEN);
  const fileReads = bar.segments.find((s) => s.key === "file-read");
  assert.equal(fileReads?.tokens, Math.round(bytesOf(result) / CHARS_PER_TOKEN));
  assert.equal(fileReads?.bytes, bytesOf(result));
  // …and the RECORD-TYPE half of the bar carries its measurements too. The two halves reach a
  // segment by different routes — one through the subject cut, one through the category slices — so
  // asserting one says nothing about the other.
  const calls = bar.segments.find((s) => s.key === "tool-calls");
  assert.equal(calls?.bytes, bytesOf(toolUse("t1", "Read", { file_path: "/x" })));
  assert.equal(calls?.tokens, Math.round((calls?.bytes ?? 0) / CHARS_PER_TOKEN));
  assert.equal(calls?.records, 1);
});

test("the subject slices and the surface rows are ordered LARGEST FIRST, ties by name", () => {
  // ⚠ THE FIXTURE HAS TO DEFEAT THREE WRONG ANSWERS AT ONCE, and each one is a live mutant:
  //   (a) ALPHABETICAL — so byte order and name order must disagree;
  //   (b) NO SORT AT ALL — a tally is a Map and a Map keeps first-insertion order, so the emission
  //       order must differ from the answer too;
  //   (c) THE REVERSE of insertion order — and this one is not obvious. Under bun/JSC a comparator
  //       mutated to return `false` REVERSES the array (`[1,3,2]` → `[2,3,1]`), where the same
  //       comparator under node/V8 leaves it alone. A fixture emitted smallest-first therefore
  //       passes a reversing mutant by coincidence, which is exactly how this test read green while
  //       proving nothing.
  // The arrangement that beats all three is MIDDLE-OUT: emit the middle-sized thing first. Three
  // items minimum — with two, the reverse of insertion IS the sorted answer and (c) is unreachable.
  //
  // Subjects — emitted kg (middle), file-read (smallest), shell (largest):
  //   sorted  [shell, knowledge-graph, file-read]   insertion [knowledge-graph, file-read, shell]
  //   reverse [shell, file-read, knowledge-graph]   alpha     [file-read, knowledge-graph, shell]
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "storytree adr list" })], 1000),
    user([toolResult("t1", "decisions".repeat(34))]),
    assistant("a2", [toolUse("t2", "Bash", { command: "storytree arc show a" })], 1050),
    user([toolResult("t2", "arc".repeat(20))]),
    assistant("a3", [toolUse("t3", "Bash", { command: "storytree library artifact x" })], 1100),
    user([toolResult("t3", "artifact".repeat(120))]),
    assistant("a4", [toolUse("t4", "Read", { file_path: "/x" })], 1150),
    user([toolResult("t4", "file")]),
    assistant("a5", [toolUse("t5", "Bash", { command: "pnpm gate" })], 1200),
    user([toolResult("t5", "gate".repeat(900))]),
  ]);

  const composition = readWindowComposition(file);
  assert.deepEqual(
    composition.toolSubjects.map((s) => s.subject),
    ["shell", "knowledge-graph", "file-read"],
    "descending by bytes — not alphabetical, not insertion order, not its reverse",
  );
  const bytes = composition.toolSubjects.map((s) => s.bytes);
  assert.ok((bytes[0] ?? 0) > (bytes[1] ?? 0) && (bytes[1] ?? 0) > (bytes[2] ?? 0));

  // Same three traps, same middle-out arrangement — emitted adr (middle), arc (smallest),
  // library-artifact (largest):
  //   sorted  [library-artifact, adr, arc]   insertion [adr, arc, library-artifact]
  //   reverse [library-artifact, arc, adr]   alpha     [adr, arc, library-artifact]
  assert.deepEqual(
    composition.knowledgeSurfaces.map((s) => s.surface),
    ["library-artifact", "adr", "arc"],
  );
  const surfaceBytes = composition.knowledgeSurfaces.map((s) => s.bytes);
  assert.ok((surfaceBytes[0] ?? 0) > (surfaceBytes[1] ?? 0) && (surfaceBytes[1] ?? 0) > (surfaceBytes[2] ?? 0));
});

test("the other-tool names come back SORTED, whatever order the window used them in", () => {
  // The residual is only actionable if a reader can scan it, and a set preserves insertion order —
  // so an unsorted list is stable, plausible, and different for every window.
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "WebFetch", { url: "u" })], 1000),
    user([toolResult("t1", "a")]),
    assistant("a2", [toolUse("t2", "Edit", { file_path: "/x" })], 1100),
    user([toolResult("t2", "b")]),
    assistant("a3", [toolUse("t3", "TodoWrite", {})], 1200),
    user([toolResult("t3", "c")]),
  ]);
  assert.deepEqual(readWindowComposition(file).otherToolNames, ["Edit", "TodoWrite", "WebFetch"]);
});

test("a surface read TWICE counts two records and sums both payloads", () => {
  // The per-surface tally is an accumulation, and an accumulation that only ever sees one item is
  // indistinguishable from an assignment.
  const first = toolResult("t1", "one");
  const second = toolResult("t2", "two".repeat(30));
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "storytree adr list" })], 1000),
    user([first]),
    assistant("a2", [toolUse("t2", "Bash", { command: "storytree adr pull 524" })], 1100),
    user([second]),
  ]);

  const composition = readWindowComposition(file);
  assert.deepEqual(composition.knowledgeSurfaces, [
    { surface: "adr", bytes: bytesOf(first) + bytesOf(second), records: 2 },
  ]);
  assert.equal(composition.toolSubjects[0]?.records, 2);
});

test("a tool_use with NO usable id is remembered for nothing — its result is unattributed", () => {
  // A malformed or truncated call. Remembering it under some fallback key would let the NEXT
  // unidentifiable result inherit a subject that was never its own.
  const file = writeTranscript([
    assistant("a1", [{ type: "tool_use", name: "Bash", input: { command: "storytree arc show a" } }], 1000),
    user([toolResult("t1", "output whose call named no id")]),
  ]);
  const composition = readWindowComposition(file);
  assert.deepEqual(
    composition.toolSubjects.map((s) => s.subject),
    ["unattributed"],
  );
  assert.deepEqual(composition.knowledgeSurfaces, []);
});

test("two malformed records do not JOIN each other — an idless call and an idless result stay apart", () => {
  // THE CASE THE ONE REMAINING GUARD EXISTS FOR. The call/result map is keyed by `unknown` so the
  // lookup needs no guard of its own; what that buys is a single guard on the WRITE side, and this
  // is what it prevents. Without it the idless call is stored under `undefined`, the idless result
  // looks `undefined` up, and the two MATCH — charging a knowledge-graph subject to output that had
  // nothing to do with it. Both records are malformed; neither says they belong together.
  const file = writeTranscript([
    assistant("a1", [{ type: "tool_use", name: "Bash", input: { command: "storytree arc show a" } }], 1000),
    user([{ type: "tool_result", content: "output that named no call" }]),
  ]);
  const composition = readWindowComposition(file);
  assert.deepEqual(
    composition.toolSubjects.map((s) => s.subject),
    ["unattributed"],
  );
  assert.deepEqual(composition.knowledgeSurfaces, [], "and no surface is credited");
});

test("a tool_result with NO tool_use_id is unattributed, not charged to the last call seen", () => {
  const file = writeTranscript([
    assistant("a1", [toolUse("t1", "Bash", { command: "storytree arc show a" })], 1000),
    user([{ type: "tool_result", content: "output naming no call" }]),
  ]);
  const composition = readWindowComposition(file);
  assert.deepEqual(
    composition.toolSubjects.map((s) => s.subject),
    ["unattributed"],
    "the open knowledge-graph call is not a default",
  );
});

test("an UNNAMED tool is other-tool and is named as `<unnamed>` rather than dropped", () => {
  // The `other-tool` residual is only useful if it can be acted on, which means every tool behind it
  // has a name — including the one the transcript failed to give.
  const file = writeTranscript([
    assistant("a1", [{ type: "tool_use", id: "t1", input: { url: "u" } }], 1000),
    user([toolResult("t1", "output")]),
  ]);
  const composition = readWindowComposition(file);
  assert.deepEqual(composition.otherToolNames, ["<unnamed>"]);
  assert.equal(composition.toolSubjects[0]?.subject, "other-tool");
});

test("the bar OMITS a zero-byte category and keeps a floor of zero out too", () => {
  // Two different zeroes, and both are omissions rather than segments: a category with no bytes
  // contributed nothing, and a floor of zero means the visible bytes already accounted for the whole
  // first request — never that the harness is free.
  const file = writeTranscript([
    user("a prompt long enough that the visible half exceeds the request's own resident figure"),
    assistant("m1", [{ type: "text", text: "hi" }], 1),
  ]);
  const bar = buildCompositionBar(readWindowComposition(file));
  assert.ok(!bar.segments.some((s) => s.key === "harness-floor"));
  assert.equal(bar.residualTokens, 0, "read, and it is zero — which is not the same as unreadable");
  assert.equal(bar.residualAbsence, null);
});

// ── THE SHARED WIRE (ADR-0524 D1) ────────────────────────────────────────────────────────────────
//
// `readWindowSeriesWithComposition` is what the studio route AND the desktop backend's copy of that
// route both call. `check:mirror-conformance` holds their answers byte-identical; this pins the
// answer itself, so a field silently dropped from the wire fails HERE rather than as a cross-surface
// divergence with no owner.

test("the shared wire carries the occupancy series AND the composition, from ONE window resolution", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-wire-"));
  const dir = path.join(root, "some-project");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${WINDOW}.jsonl`),
    [
      assistant("m1", [toolUse("t1", "Bash", { command: "storytree library artifact adr-0524 --pg" })], 120_000),
      user([toolResult("t1", "the decision".repeat(40))]),
      assistant("m2", [toolUse("t2", "Bash", { command: "pnpm gate" })], 130_000),
      user([toolResult("t2", "gate output".repeat(100))]),
      // An other-tool and an unknown attachment label, so the wire's two pass-through lists have
      // something to carry. Asserting only their KEYS would let an emptied array through.
      assistant("m3", [toolUse("t3", "WebFetch", { url: "https://example.test" })], 140_000),
      user([toolResult("t3", "page")]),
      attachment({ type: "some_future_attachment", payload: "p" }),
    ].join("\n") + "\n",
    "utf8",
  );

  const read = readWindowSeriesWithComposition({ windowId: WINDOW, root });
  assert.equal(read.windowId, WINDOW);
  assert.ok(read.observations.length > 0, "the occupancy half still answers");

  const wire = read.composition;
  assert.ok(wire !== null);
  // EVERY field, named. A wire assembled field-by-field in two places is how two surfaces drift; the
  // remedy was one function, and this is what stops a field being dropped from it silently.
  assert.deepEqual(Object.keys(wire).sort(), [
    "charsPerToken",
    "knowledgeSurfaces",
    "otherToolNames",
    "residualAbsence",
    "residualTokens",
    "segments",
    "totalTokens",
    "unclassifiedLabels",
  ]);
  assert.equal(wire.charsPerToken, CHARS_PER_TOKEN);
  assert.equal(wire.residualAbsence, null);
  assert.ok((wire.residualTokens ?? 0) > 0, "the harness floor is read, not guessed");
  assert.deepEqual(
    wire.segments.map((s) => s.key),
    ["knowledge-graph", "shell", "other-tool", "tool-calls", "unclassified", "harness-floor"],
  );
  assert.equal(
    wire.totalTokens,
    wire.segments.reduce((sum, s) => sum + s.tokens, 0),
  );
  assert.deepEqual(wire.knowledgeSurfaces.map((s) => s.surface), ["library-artifact"]);
  assert.deepEqual(wire.otherToolNames, ["WebFetch"], "the residual's tools reach the wire");
  assert.deepEqual(
    wire.unclassifiedLabels,
    ["attachment:some_future_attachment"],
    "and so does the remedy for an unknown label",
  );
  const first = wire.segments[0];
  assert.deepEqual(Object.keys(first ?? {}).sort(), ["bytes", "key", "label", "records", "tokens"]);
  assert.equal(first?.label, "knowledge graph");
});

test("the shared wire answers `composition: null` when the window matched no transcript", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-wire-"));
  fs.mkdirSync(path.join(root, "some-project"), { recursive: true });
  const read = readWindowSeriesWithComposition({ windowId: WINDOW, root });
  // Never an empty bar: there is nothing to compose, and zero-width segments would assert an empty
  // window. The occupancy half says the same thing its own way.
  assert.equal(read.composition, null);
  assert.equal(read.absence, "no-transcript-root");
});
