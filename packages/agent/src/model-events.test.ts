import test from "node:test";
import assert from "node:assert/strict";
import {
  parseContentBlock,
  isTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  StopReason,
  ContentBlock,
} from "./model-events.js";

test("parseContentBlock parses a text block", () => {
  const block = parseContentBlock({ type: "text", text: "hello" });
  assert.ok(isTextBlock(block));
  if (isTextBlock(block)) assert.equal(block.text, "hello");
});

test("parseContentBlock parses a tool_use block with arbitrary input", () => {
  const block = parseContentBlock({
    type: "tool_use",
    id: "tu_1",
    name: "Bash",
    input: { command: "ls", nested: { x: 1 } },
  });
  assert.ok(isToolUseBlock(block));
  assert.equal(isTextBlock(block), false);
});

test("parseContentBlock parses a tool_result block with is_error", () => {
  const block = parseContentBlock({
    type: "tool_result",
    tool_use_id: "tu_1",
    content: "boom",
    is_error: true,
  });
  assert.ok(isToolResultBlock(block));
  if (isToolResultBlock(block)) assert.equal(block.is_error, true);
});

test("parseContentBlock is LOUD on unknown type (no silent fallback)", () => {
  assert.throws(
    () => parseContentBlock({ type: "thinking", text: "x" }),
    /malformed model content block/,
  );
});

test("parseContentBlock is LOUD on malformed shape", () => {
  assert.throws(
    () => parseContentBlock({ type: "tool_use", name: "missing-id" }),
    /malformed model content block/,
  );
});

test("ContentBlock rejects extra keys (strict)", () => {
  assert.equal(
    ContentBlock.safeParse({ type: "text", text: "a", extra: 1 }).success,
    false,
  );
});

test("StopReason enumerates the Messages API stop reasons", () => {
  for (const r of ["end_turn", "tool_use", "max_tokens", "stop_sequence"]) {
    assert.equal(StopReason.parse(r), r);
  }
  assert.throws(() => StopReason.parse("done"));
});
