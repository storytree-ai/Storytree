import test from "node:test";
import assert from "node:assert/strict";
import type { ContentBlock } from "./model-events.js";
import { ScriptedModel } from "./model.js";
import type { ModelRequest, ModelResponse } from "./model.js";
import { MapToolExecutor } from "./tool-executor.js";
import { runTurn } from "./run-turn.js";

function userText(text: string): ModelRequest {
  return { model: "test", messages: [{ role: "user", content: text }] };
}

function endTurn(text: string): ModelResponse {
  return { content: [{ type: "text", text }], stopReason: "end_turn" };
}

test("runTurn: terminates immediately on end_turn", async () => {
  const model = new ScriptedModel([endTurn("done")]);
  const result = await runTurn({ model, request: userText("hi") });
  assert.equal(result.finalText, "done");
  assert.equal(result.turns, 1);
  // transcript = original user + terminal assistant.
  assert.equal(result.transcript.length, 2);
  assert.equal(result.transcript[1]?.role, "assistant");
});

test("runTurn: tool_use -> tool_result round-trip then end_turn", async () => {
  const toolUse: ContentBlock = {
    type: "tool_use",
    id: "tu-1",
    name: "echo",
    input: { value: "ping" },
  };
  const model = new ScriptedModel([
    { content: [toolUse], stopReason: "tool_use" },
    endTurn("after tool"),
  ]);
  const tools = new MapToolExecutor().register("echo", (input) =>
    JSON.stringify(input),
  );

  const result = await runTurn({ model, tools, request: userText("call echo") });

  assert.equal(result.turns, 2);
  assert.equal(result.finalText, "after tool");
  // user, assistant(tool_use), user(tool_result), assistant(end_turn).
  assert.equal(result.transcript.length, 4);
  const toolResultMsg = result.transcript[2];
  assert.equal(toolResultMsg?.role, "user");
  assert.ok(Array.isArray(toolResultMsg?.content));
  const block = (toolResultMsg?.content as ContentBlock[])[0];
  assert.equal(block?.type, "tool_result");
  if (block?.type === "tool_result") {
    assert.equal(block.tool_use_id, "tu-1");
    assert.equal(block.content, JSON.stringify({ value: "ping" }));
  }
});

test("runTurn: enforces maxTurns fail-closed", async () => {
  // A model that always asks for a tool, never terminating.
  const model = new ScriptedModel(() => ({
    content: [{ type: "tool_use", id: "x", name: "noop", input: {} }],
    stopReason: "tool_use",
  }));
  const tools = new MapToolExecutor().register("noop", () => "ok");

  await assert.rejects(
    () => runTurn({ model, tools, request: userText("loop"), maxTurns: 3 }),
    /exceeded maxTurns=3/,
  );
});

test("runTurn: tool_use with no executor is a loud error", async () => {
  const model = new ScriptedModel([
    {
      content: [{ type: "tool_use", id: "x", name: "noop", input: {} }],
      stopReason: "tool_use",
    },
  ]);
  await assert.rejects(
    () => runTurn({ model, request: userText("x") }),
    /no ToolExecutor/,
  );
});

test("runTurn: unregistered tool yields an is_error tool_result, loop continues", async () => {
  const model = new ScriptedModel([
    {
      content: [{ type: "tool_use", id: "t1", name: "missing", input: {} }],
      stopReason: "tool_use",
    },
    endTurn("recovered"),
  ]);
  const tools = new MapToolExecutor();
  const result = await runTurn({ model, tools, request: userText("x") });
  assert.equal(result.finalText, "recovered");
  const toolResult = (result.transcript[2]?.content as ContentBlock[])[0];
  if (toolResult?.type === "tool_result") {
    assert.equal(toolResult.is_error, true);
  } else {
    assert.fail("expected tool_result block");
  }
});
