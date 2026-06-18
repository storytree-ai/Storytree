import test from "node:test";
import assert from "node:assert/strict";
import type { ToolUseBlock } from "./model-events.js";
import { MapToolExecutor } from "./tool-executor.js";

function call(name: string, input: unknown, id = "c1"): ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

test("MapToolExecutor dispatches to the registered handler", async () => {
  const exec = new MapToolExecutor({ upper: (i) => String(i).toUpperCase() });
  const res = await exec.execute(call("upper", "hi"));
  assert.equal(res.content, "HI");
  assert.equal(res.tool_use_id, "c1");
  assert.equal(res.is_error, undefined);
});

test("MapToolExecutor awaits async handlers", async () => {
  const exec = new MapToolExecutor().register("a", async () => "async-ok");
  const res = await exec.execute(call("a", null));
  assert.equal(res.content, "async-ok");
});

test("MapToolExecutor returns is_error for an unknown tool", async () => {
  const exec = new MapToolExecutor();
  const res = await exec.execute(call("ghost", {}));
  assert.equal(res.is_error, true);
  assert.match(res.content, /no such tool/);
});

test("MapToolExecutor catches a throwing handler into is_error", async () => {
  const exec = new MapToolExecutor().register("boom", () => {
    throw new Error("kaboom");
  });
  const res = await exec.execute(call("boom", {}));
  assert.equal(res.is_error, true);
  assert.equal(res.content, "kaboom");
});
