import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";

import type { ToolUseBlock } from "./model-events.js";

import { FileToolExecutor } from "./fs-tools.js";

let rootDir: string;
let exec: FileToolExecutor;

before(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-fs-tools-replace-all-"));
  exec = new FileToolExecutor({ rootDir });
});

after(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

let nextId = 0;
function call(name: string, input: unknown): ToolUseBlock {
  return { type: "tool_use", id: `id-${nextId++}`, name, input };
}

test("edit_file with replace_all:true replaces every occurrence", async () => {
  // Write a file whose content contains the same token three times.
  await exec.execute(call("write_file", { path: "multi.txt", content: "x and x and x" }));

  // Execute edit_file with replace_all: true — should replace all three occurrences.
  const e = await exec.execute(
    call("edit_file", { path: "multi.txt", old_str: "x", new_str: "y", replace_all: true }),
  );

  // Must NOT be an error.
  assert.equal(e.is_error, undefined, `expected success but got is_error: ${e.content}`);

  // Read the file back and verify ALL three occurrences were replaced.
  const r = await exec.execute(call("read_file", { path: "multi.txt" }));
  assert.equal(r.content, "y and y and y");
});

test("edit_file without replace_all still refuses an ambiguous (multi-occurrence) match", async () => {
  // Write a file with three occurrences of the same token.
  await exec.execute(call("write_file", { path: "ambig2.txt", content: "x and x and x" }));

  // Without replace_all, this must still fail as an ambiguous edit.
  const e = await exec.execute(
    call("edit_file", { path: "ambig2.txt", old_str: "x", new_str: "y" }),
  );
  assert.equal(e.is_error, true);
  assert.match(e.content, /more than once/);

  // File must be unchanged.
  const r = await exec.execute(call("read_file", { path: "ambig2.txt" }));
  assert.equal(r.content, "x and x and x");
});
