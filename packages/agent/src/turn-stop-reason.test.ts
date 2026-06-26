import test from "node:test";
import assert from "node:assert/strict";
import { ScriptedModel } from "./model.js";
import type { ModelRequest } from "./model.js";
import { runTurn } from "./run-turn.js";

function userText(text: string): ModelRequest {
  return { model: "test", messages: [{ role: "user", content: text }] };
}

test("runTurn: stopReason is 'max_tokens' when the model stops with max_tokens", async () => {
  const model = new ScriptedModel([
    { content: [{ type: "text", text: "truncated" }], stopReason: "max_tokens" },
  ]);
  const result = await runTurn({ model, request: userText("hello") });
  // TurnResult currently has no stopReason field — this assertion is the RED.
  assert.equal(result.stopReason, "max_tokens");
});

test("runTurn: stopReason is 'end_turn' on a clean terminal stop", async () => {
  const model = new ScriptedModel([
    { content: [{ type: "text", text: "done" }], stopReason: "end_turn" },
  ]);
  const result = await runTurn({ model, request: userText("hello") });
  assert.equal(result.stopReason, "end_turn");
});
