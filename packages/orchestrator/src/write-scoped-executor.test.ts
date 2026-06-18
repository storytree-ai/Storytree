import { test } from "node:test";
import assert from "node:assert/strict";

import { MapToolExecutor } from "@storytree/agent";
import type { ToolExecutor } from "@storytree/agent";
import type { ToolResultBlock, ToolUseBlock } from "@storytree/agent";

import { PathWriteScope } from "./phase-machine.js";
import type { Phase } from "./phase-machine.js";
import {
  WriteScopedToolExecutor,
  type WriteToolSpec,
} from "./write-scoped-executor.js";

/** A scope: tests live under **\/*.test.ts, source under packages\/**\/src\/*.ts (non-test). */
const scope = () =>
  new PathWriteScope({
    testGlobs: ["**/*.test.ts"],
    sourceGlobs: ["packages/**/src/*.ts"],
  });

/** Write tools whose first arg is a `{ path }` (write/edit) or `{ file_path }` (str_replace). */
const writeTools: WriteToolSpec = {
  write: (input) => (input as { path: string }).path,
  edit: (input) => (input as { path: string }).path,
  str_replace: (input) => (input as { file_path: string }).file_path,
};

/** A spy executor that counts delegated calls, wrapping a MapToolExecutor. */
class SpyExecutor implements ToolExecutor {
  calls = 0;
  readonly inner: MapToolExecutor;
  constructor(inner: MapToolExecutor) {
    this.inner = inner;
  }
  async execute(call: ToolUseBlock): Promise<ToolResultBlock> {
    this.calls += 1;
    return this.inner.execute(call);
  }
}

const mkInner = () =>
  new SpyExecutor(
    new MapToolExecutor({
      write: () => "wrote",
      edit: () => "edited",
      str_replace: () => "replaced",
      read: () => "contents",
    }),
  );

const writeCall = (
  tool: string,
  pathKey: "path" | "file_path",
  path: string,
): ToolUseBlock => ({
  type: "tool_use",
  id: `id-${tool}`,
  name: tool,
  input: { [pathKey]: path },
});

const TEST_PATH = "packages/orchestrator/src/foo.test.ts";
const SOURCE_PATH = "packages/orchestrator/src/foo.ts";

const mk = (phase: Phase, inner = mkInner()) => ({
  inner,
  exec: new WriteScopedToolExecutor({
    inner,
    scope: scope(),
    writeTools,
    phase,
  }),
});

test("write to a TEST path is ALLOWED in AUTHOR_TEST (delegates to inner)", async () => {
  const { inner, exec } = mk("AUTHOR_TEST");
  const res = await exec.execute(writeCall("write", "path", TEST_PATH));
  assert.equal(res.is_error, undefined);
  assert.equal(res.content, "wrote");
  assert.equal(inner.calls, 1);
  assert.equal(exec.violations.length, 0);
});

test("write to a TEST path is DENIED in IMPLEMENT (is_error, recorded, inner NOT called)", async () => {
  const { inner, exec } = mk("IMPLEMENT");
  const res = await exec.execute(writeCall("write", "path", TEST_PATH));
  assert.equal(res.is_error, true);
  assert.match(res.content, /write refused by phase scope/);
  assert.match(res.content, /IMPLEMENT/);
  assert.match(res.content, /foo\.test\.ts/);
  assert.equal(inner.calls, 0);
  assert.deepEqual(exec.violations, [
    { phase: "IMPLEMENT", tool: "write", path: TEST_PATH },
  ]);
});

test("write to a SOURCE path is ALLOWED in IMPLEMENT", async () => {
  const { inner, exec } = mk("IMPLEMENT");
  const res = await exec.execute(writeCall("edit", "path", SOURCE_PATH));
  assert.equal(res.is_error, undefined);
  assert.equal(res.content, "edited");
  assert.equal(inner.calls, 1);
  assert.equal(exec.violations.length, 0);
});

test("write to a SOURCE path is DENIED in AUTHOR_TEST / CONFIRM_RED / GATE", async () => {
  for (const phase of ["AUTHOR_TEST", "CONFIRM_RED", "GATE"] as const) {
    const { inner, exec } = mk(phase);
    const res = await exec.execute(
      writeCall("str_replace", "file_path", SOURCE_PATH),
    );
    assert.equal(res.is_error, true, `${phase} should deny a source write`);
    assert.equal(inner.calls, 0, `${phase} must not reach inner`);
    assert.deepEqual(exec.violations, [
      { phase, tool: "str_replace", path: SOURCE_PATH },
    ]);
  }
});

test("a non-write tool always passes through (any phase, no scope check)", async () => {
  for (const phase of [
    "AUTHOR_TEST",
    "CONFIRM_RED",
    "IMPLEMENT",
    "CONFIRM_GREEN",
    "GATE",
  ] as const) {
    const { inner, exec } = mk(phase);
    const res = await exec.execute({
      type: "tool_use",
      id: "r1",
      name: "read",
      input: { path: SOURCE_PATH },
    });
    assert.equal(res.is_error, undefined);
    assert.equal(res.content, "contents");
    assert.equal(inner.calls, 1);
    assert.equal(exec.violations.length, 0);
  }
});

test("setPhase flips the wall: same write denied then allowed", async () => {
  const inner = mkInner();
  const exec = new WriteScopedToolExecutor({
    inner,
    scope: scope(),
    writeTools,
    phase: "IMPLEMENT",
  });

  // TEST path denied in IMPLEMENT...
  const denied = await exec.execute(writeCall("write", "path", TEST_PATH));
  assert.equal(denied.is_error, true);
  assert.equal(inner.calls, 0);

  // ...flip to AUTHOR_TEST and the same write is allowed.
  exec.setPhase("AUTHOR_TEST");
  assert.equal(exec.phase, "AUTHOR_TEST");
  const allowed = await exec.execute(writeCall("write", "path", TEST_PATH));
  assert.equal(allowed.is_error, undefined);
  assert.equal(inner.calls, 1);
  assert.equal(exec.violations.length, 1); // only the first (denied) write recorded
});

test("inner executor is never invoked on a denied write (spy counter stays 0)", async () => {
  const { inner, exec } = mk("GATE");
  await exec.execute(writeCall("write", "path", TEST_PATH));
  await exec.execute(writeCall("edit", "path", SOURCE_PATH));
  await exec.execute(writeCall("str_replace", "file_path", SOURCE_PATH));
  assert.equal(inner.calls, 0);
  assert.equal(exec.violations.length, 3);
});

test("a multi-path write is denied if ANY path is out of scope", async () => {
  const multiTools: WriteToolSpec = {
    multi_write: (input) => (input as { paths: string[] }).paths,
  };
  const inner = mkInner();
  const exec = new WriteScopedToolExecutor({
    inner,
    scope: scope(),
    writeTools: multiTools,
    phase: "AUTHOR_TEST",
  });
  const res = await exec.execute({
    type: "tool_use",
    id: "m1",
    name: "multi_write",
    // one allowed test path, one disallowed source path -> whole call refused
    input: { paths: [TEST_PATH, SOURCE_PATH] },
  });
  assert.equal(res.is_error, true);
  assert.equal(inner.calls, 0);
  assert.deepEqual(exec.violations, [
    { phase: "AUTHOR_TEST", tool: "multi_write", path: SOURCE_PATH },
  ]);
});

test("an extractor returning null passes through and is noted (no scoped path)", async () => {
  const nullTools: WriteToolSpec = { write: () => null };
  const inner = mkInner();
  const exec = new WriteScopedToolExecutor({
    inner,
    scope: scope(),
    writeTools: nullTools,
    phase: "GATE",
  });
  const res = await exec.execute(writeCall("write", "path", SOURCE_PATH));
  assert.equal(res.is_error, undefined);
  assert.equal(inner.calls, 1);
  assert.equal(exec.violations.length, 0);
  assert.deepEqual(exec.noPathCalls, [{ phase: "GATE", tool: "write" }]);
});
