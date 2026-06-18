import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";

import type { ToolUseBlock } from "./model-events.js";

import {
  FILE_TOOLS,
  FILE_WRITE_TOOLS,
  FileToolExecutor,
} from "./fs-tools.js";

let rootDir: string;
let exec: FileToolExecutor;

before(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-fs-tools-"));
  exec = new FileToolExecutor({ rootDir });
});

after(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

let nextId = 0;
function call(name: string, input: unknown): ToolUseBlock {
  return { type: "tool_use", id: `id-${nextId++}`, name, input };
}

test("write_file then read_file round-trips", async () => {
  const w = await exec.execute(call("write_file", { path: "a/b.txt", content: "hello" }));
  assert.equal(w.is_error, undefined);
  assert.match(w.content, /5 bytes/);

  const r = await exec.execute(call("read_file", { path: "a/b.txt" }));
  assert.equal(r.is_error, undefined);
  assert.equal(r.content, "hello");

  // Parent dirs were created on disk.
  const onDisk = await fs.readFile(path.join(rootDir, "a", "b.txt"), "utf8");
  assert.equal(onDisk, "hello");
});

test("read_file on a missing file is is_error (no throw)", async () => {
  const r = await exec.execute(call("read_file", { path: "nope.txt" }));
  assert.equal(r.is_error, true);
});

test("edit_file replaces a unique occurrence", async () => {
  await exec.execute(call("write_file", { path: "edit.txt", content: "one TWO three" }));
  const e = await exec.execute(
    call("edit_file", { path: "edit.txt", old_str: "TWO", new_str: "2" }),
  );
  assert.equal(e.is_error, undefined);
  const r = await exec.execute(call("read_file", { path: "edit.txt" }));
  assert.equal(r.content, "one 2 three");
});

test("edit_file fails when old_str is absent", async () => {
  await exec.execute(call("write_file", { path: "absent.txt", content: "abc" }));
  const e = await exec.execute(
    call("edit_file", { path: "absent.txt", old_str: "zzz", new_str: "q" }),
  );
  assert.equal(e.is_error, true);
  assert.match(e.content, /not found/);
  // File unchanged.
  const r = await exec.execute(call("read_file", { path: "absent.txt" }));
  assert.equal(r.content, "abc");
});

test("edit_file fails on an ambiguous (multi-occurrence) match", async () => {
  await exec.execute(call("write_file", { path: "ambig.txt", content: "x x x" }));
  const e = await exec.execute(
    call("edit_file", { path: "ambig.txt", old_str: "x", new_str: "y" }),
  );
  assert.equal(e.is_error, true);
  assert.match(e.content, /more than once/);
  // File unchanged.
  const r = await exec.execute(call("read_file", { path: "ambig.txt" }));
  assert.equal(r.content, "x x x");
});

test("list_dir reports entries with dir/file kind", async () => {
  await exec.execute(call("write_file", { path: "ld/file1.txt", content: "f" }));
  await exec.execute(call("write_file", { path: "ld/sub/file2.txt", content: "f" }));
  const r = await exec.execute(call("list_dir", { path: "ld" }));
  assert.equal(r.is_error, undefined);
  const lines = r.content.split("\n").sort();
  assert.deepEqual(lines, ["dir\tsub", "file\tfile1.txt"]);
});

test("run_command runs Node green (exit 0) as data", async () => {
  const r = await exec.execute(
    call("run_command", { command: process.execPath, args: ["-e", "process.exit(0)"] }),
  );
  assert.equal(r.is_error, undefined);
  assert.match(r.content, /exit_code: 0/);
});

test("run_command non-zero exit is DATA, not a throw", async () => {
  const r = await exec.execute(
    call("run_command", { command: process.execPath, args: ["-e", "process.exit(3)"] }),
  );
  assert.equal(r.is_error, undefined);
  assert.match(r.content, /exit_code: 3/);
});

test("run_command captures stdout/stderr", async () => {
  const r = await exec.execute(
    call("run_command", {
      command: process.execPath,
      args: ["-e", "process.stdout.write('OUT');process.stderr.write('ERR')"],
    }),
  );
  assert.match(r.content, /stdout:\nOUT/);
  assert.match(r.content, /stderr:\nERR/);
});

test("run_command on a nonexistent binary is is_error (spawn failure)", async () => {
  const r = await exec.execute(
    call("run_command", { command: "definitely-not-a-real-binary-xyz", args: [] }),
  );
  assert.equal(r.is_error, true);
});

test("traversal path (../outside) is refused and writes nothing outside root", async () => {
  const outsideMarker = path.join(path.dirname(rootDir), "ESCAPED.txt");
  const w = await exec.execute(
    call("write_file", { path: "../ESCAPED.txt", content: "leak" }),
  );
  assert.equal(w.is_error, true);
  assert.match(w.content, /escapes rootDir/);
  // Nothing was written outside the root.
  await assert.rejects(fs.access(outsideMarker));
});

test("absolute path outside root is refused", async () => {
  const abs = path.join(os.tmpdir(), "storytree-abs-escape.txt");
  const w = await exec.execute(call("write_file", { path: abs, content: "leak" }));
  assert.equal(w.is_error, true);
});

test("unknown tool name is a clear is_error", async () => {
  const r = await exec.execute(call("frobnicate", { path: "x" }));
  assert.equal(r.is_error, true);
  assert.match(r.content, /no such tool/);
});

test("malformed input is is_error (no throw)", async () => {
  const r = await exec.execute(call("read_file", { wrong: "shape" }));
  assert.equal(r.is_error, true);
});

test("resolveInRoot returns a path inside root for a safe relative path", () => {
  const resolved = exec.resolveInRoot("sub/dir/file.txt");
  assert.ok(resolved.startsWith(rootDir));
});

test("FILE_TOOLS declares the five tools with input schemas", () => {
  const names = FILE_TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, ["edit_file", "list_dir", "read_file", "run_command", "write_file"]);
  for (const t of FILE_TOOLS) {
    assert.equal(typeof t.inputSchema, "object");
  }
});

test("FILE_WRITE_TOOLS extracts paths for write/edit and omits non-writes", () => {
  assert.equal(FILE_WRITE_TOOLS.write_file?.({ path: "p.txt", content: "c" }), "p.txt");
  assert.equal(FILE_WRITE_TOOLS.edit_file?.({ path: "q.txt", old_str: "a", new_str: "b" }), "q.txt");
  // No path on input -> null (passes through the scope check as "no scoped path").
  assert.equal(FILE_WRITE_TOOLS.write_file?.({ content: "c" }), null);
  // Read/list/run are not write tools.
  assert.equal(FILE_WRITE_TOOLS.read_file, undefined);
  assert.equal(FILE_WRITE_TOOLS.run_command, undefined);
});
