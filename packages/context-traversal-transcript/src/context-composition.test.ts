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
  CHARS_PER_TOKEN,
  categoryLabel,
  MANDATORY_CATEGORIES,
  readWindowComposition,
  type CompositionCategory,
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
