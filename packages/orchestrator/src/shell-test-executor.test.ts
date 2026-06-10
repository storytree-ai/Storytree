import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";

import {
  ShellTestExecutor,
  defaultClassifyKind,
  nodeEvalExecutor,
} from "./shell-test-executor.js";

// These spawn the SAME Node binary running this test — fully offline, no files, no network.

test("nodeEvalExecutor: a green script (exit 0) is observed as green", async () => {
  const exec = nodeEvalExecutor({ ok: "process.exit(0)" });
  const obs = await exec.run("ok");
  assert.deepEqual(obs, { result: "green", testId: "ok" });
});

test("nodeEvalExecutor: an exit-1 script is a red with kind 'runtime'", async () => {
  const exec = nodeEvalExecutor({ bad: "process.exit(1)" });
  const obs = await exec.run("bad");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "runtime");
  assert.equal(obs.testId, "bad");
});

test("nodeEvalExecutor: a compile-shaped message + exit 1 is a red with kind 'compile'", async () => {
  const exec = nodeEvalExecutor({
    compile: 'console.error("error: cannot find name X"); process.exit(1)',
  });
  const obs = await exec.run("compile");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "compile");
});

test("ENV HONESTY: the spawned observer never inherits NODE_TEST* (the forged-green channel)", async () => {
  // THIS process runs under `node --test`, so NODE_TEST_CONTEXT is set right now. A spawned
  // `node --test <file>` that inherited it would act as a runner child and could exit 0 without
  // running the file — a forged green. The executor must scrub every NODE_TEST* var.
  assert.ok(
    Object.keys(process.env).some((k) => k.startsWith("NODE_TEST")),
    "precondition: the suite itself runs under node --test",
  );
  const exec = nodeEvalExecutor({
    scrubbed:
      "process.exit(Object.keys(process.env).some((k) => k.startsWith('NODE_TEST')) ? 1 : 0)",
  });
  const obs = await exec.run("scrubbed");
  assert.equal(obs.result, "green", "the child saw a NODE_TEST* variable — the scrub failed");
});

test("ShellTestExecutor: a red is DATA — run resolves, does not throw", async () => {
  const exec = nodeEvalExecutor({ bad: "process.exit(2)" });
  // Must not reject: a non-zero exit is a red observation, not a spawn error.
  const obs = await exec.run("bad");
  assert.equal(obs.result, "red");
});

test("ShellTestExecutor: stdout-only compile shape classifies as compile", async () => {
  const exec = nodeEvalExecutor({
    c: 'console.log("SyntaxError: unexpected token"); process.exit(1)',
  });
  const obs = await exec.run("c");
  assert.equal(obs.kind, "compile");
});

test("ShellTestExecutor: a custom classifyKind overrides the default heuristic", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(1)"] }),
    classifyKind: () => "compile",
  });
  const obs = await exec.run("any");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "compile");
});

test("ShellTestExecutor: a genuine spawn failure (ENOENT) rejects, not a silent green", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: "definitely-not-a-real-binary-xyz", args: [] }),
  });
  await assert.rejects(() => exec.run("nope"), /failed to spawn/);
});

test("ShellTestExecutor: passes cwd through to the spawned process", async () => {
  const target = tmpdir();
  const exec = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      // Print the child's resolved cwd so we can assert it matches what we passed.
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd: target,
    }),
  });
  // Capture via the same machinery: green means exit 0; we verify cwd via a second probe.
  const obs = await exec.run("cwd");
  assert.equal(obs.result, "green");
  // Second probe: child exits 0 only if its cwd resolves to the same realpath as `target`.
  const check = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      args: [
        "-e",
        `process.exit(require('fs').realpathSync(process.cwd()) === require('fs').realpathSync(${JSON.stringify(target)}) ? 0 : 1)`,
      ],
      cwd: target,
    }),
  });
  assert.equal((await check.run("cwd2")).result, "green");
});

test("defaultClassifyKind: classifies TS-diagnostic and missing-symbol shapes as compile", () => {
  assert.equal(
    defaultClassifyKind({ stdout: "", stderr: "TS2304: blah", code: 1 }),
    "compile",
  );
  assert.equal(
    defaultClassifyKind({ stdout: "x is not defined", stderr: "", code: 1 }),
    "compile",
  );
  assert.equal(
    defaultClassifyKind({ stdout: "AssertionError", stderr: "", code: 1 }),
    "runtime",
  );
});
