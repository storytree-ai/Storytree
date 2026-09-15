/**
 * codex-feedback-commands-run-in-the-replica (contract: codex-feedback-runs-in-the-replica)
 *
 * Pins two exports on `resolve-prove-spec.ts` that do not exist at HEAD:
 *
 *  - `retargetShellCommand(cmd, workspace, replicaRoot)` — move any absolute `cwd`/argument that
 *    sits inside `workspace` to the same relative place under `replicaRoot`; keep everything else
 *    (`file`, non-moving arguments, `env`, `timeoutMs`, `shell`) exactly, and never mutate the
 *    command it was given.
 *  - `codexFeedbackCommandsFor(proofCmd, proofDisplay, workspace, typecheckCmd?)` — the Codex
 *    leaf's feedback commands (`run_proof` always, `run_typecheck` only when given), each of whose
 *    `run(replicaRoot)` runs `runShellCommand(retargetShellCommand(cmd, workspace, replicaRoot))`.
 *
 * Neither export exists yet, so importing either BY NAME would fail to load the whole module and
 * run no assertion at all — a structural red, not a behavioural one. Imported as a namespace
 * instead, and every test opens by asserting `typeof resolver.<fn> === "function"` before calling
 * it, so the red this authors is a genuine failed assertion.
 *
 * Self-contained: no repo spec, no store, no worktree, no author. Every probe spawns
 * `process.execPath` against real temporary directories and is cleaned up in `finally`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import * as resolver from "./resolve-prove-spec.js";
import { DEFAULT_PROOF_TIMEOUT_MS } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";

async function tempDir(prefix: string): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeNestedFile(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

/** Both new exports must exist as functions before any test calls either — the red-authoring rule. */
function assertBothExist(): void {
  assert.equal(typeof resolver.retargetShellCommand, "function");
  assert.equal(typeof resolver.codexFeedbackCommandsFor, "function");
}

// ── retargetShellCommand: pure path arithmetic ──────────────────────────────

test("codex-feedback-runs-in-the-replica: retargetShellCommand moves a cwd nested inside the workspace to the same relative place under the replica", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const nestedCwd = path.join(workspace, "nested", "dir");
    const cmd: ShellCommand = { file: process.execPath, args: [], cwd: nestedCwd };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal(retargeted.cwd, path.join(replicaRoot, "nested", "dir"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand moves a cwd equal to the workspace root itself to the replica root", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const cmd: ShellCommand = { file: process.execPath, args: [], cwd: workspace };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal(retargeted.cwd, replicaRoot);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand leaves an absent cwd absent", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const cmd: ShellCommand = { file: process.execPath, args: [] };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal("cwd" in retargeted, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand moves each absolute argument inside the workspace independently and leaves a non-absolute argument untouched", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const insideArg = path.join(workspace, "src", "thing.test.ts");
    const cmd: ShellCommand = {
      file: process.execPath,
      args: ["--test", insideArg, "--reporter=tap"],
    };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.deepEqual(retargeted.args, [
      "--test",
      path.join(replicaRoot, "src", "thing.test.ts"),
      "--reporter=tap",
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand never moves a sibling path that merely shares the workspace's string prefix", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    // Deliberately NOT path.join: this appends a suffix onto the workspace's own final path
    // component, the exact shape a naive `value.startsWith(workspace)` check would misclassify as
    // "inside" — `path.relative` must answer this correctly instead (its answer here starts with
    // `..`), which is the trap this test exists to catch.
    const sibling = `${workspace}-sibling`;
    const siblingArg = path.join(sibling, "file.js");
    const cmd: ShellCommand = { file: process.execPath, args: [siblingArg], cwd: sibling };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal(retargeted.args[0], siblingArg);
    assert.equal(retargeted.cwd, sibling);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand never moves `file`, even when it is an absolute path inside the workspace", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const fileInside = path.join(workspace, "node_modules", ".bin", "tsc");
    const cmd: ShellCommand = { file: fileInside, args: [] };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal(retargeted.file, fileInside);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand never moves a `file:` URL argument, even when it names a location inside the workspace", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const fileUrl = pathToFileURL(path.join(workspace, "guard.mjs")).href;
    const cmd: ShellCommand = { file: process.execPath, args: ["--import", fileUrl] };
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.equal(retargeted.args[1], fileUrl);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: retargetShellCommand keeps env, timeoutMs and shell exactly, and never mutates the command it was given", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const cmd: ShellCommand = {
      file: process.execPath,
      args: [path.join(workspace, "a.js")],
      cwd: workspace,
      env: { STORYTREE_DB_NAME: "storytree_test" },
      timeoutMs: 12_345,
      shell: false,
    };
    const before = JSON.parse(JSON.stringify(cmd)) as ShellCommand;
    const retargeted = resolver.retargetShellCommand(cmd, workspace, replicaRoot);
    assert.notEqual(retargeted, cmd);
    assert.notEqual(retargeted.args, cmd.args);
    assert.deepEqual(cmd, before, "the input command must not be mutated");
    assert.deepEqual(retargeted.env, { STORYTREE_DB_NAME: "storytree_test" });
    assert.equal(retargeted.timeoutMs, 12_345);
    assert.equal(retargeted.shell, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

// ── codexFeedbackCommandsFor: shape, timeout and description ────────────────

test("codex-feedback-runs-in-the-replica: codexFeedbackCommandsFor returns only run_proof when no typecheckCmd is given, timed at the default proof budget", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  try {
    const proofCmd: ShellCommand = { file: process.execPath, args: ["-e", "0"], cwd: workspace };
    const commands = resolver.codexFeedbackCommandsFor(proofCmd, "node -e 0", workspace);
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.name, "run_proof");
    assert.equal(commands[0]?.timeoutMs, DEFAULT_PROOF_TIMEOUT_MS);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: codexFeedbackCommandsFor honours a declared per-command timeoutMs instead of the default", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  try {
    const proofCmd: ShellCommand = {
      file: process.execPath,
      args: ["-e", "0"],
      cwd: workspace,
      timeoutMs: 5_000,
    };
    const commands = resolver.codexFeedbackCommandsFor(proofCmd, "node -e 0", workspace);
    assert.equal(commands[0]?.timeoutMs, 5_000);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: codexFeedbackCommandsFor returns run_proof then run_typecheck, in order, only when a typecheckCmd is given", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  try {
    const proofCmd: ShellCommand = { file: process.execPath, args: ["-e", "0"], cwd: workspace };
    const typecheckCmd: ShellCommand = {
      file: process.execPath,
      args: ["-e", "0"],
      cwd: workspace,
    };
    const commands = resolver.codexFeedbackCommandsFor(
      proofCmd,
      "node -e 0",
      workspace,
      typecheckCmd,
    );
    assert.deepEqual(
      commands.map((c) => c.name),
      ["run_proof", "run_typecheck"],
    );
    assert.equal(commands[1]?.timeoutMs, DEFAULT_PROOF_TIMEOUT_MS);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: run_proof's description names the proof display, marks itself FEEDBACK ONLY, and says the run is against the replica", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  try {
    const proofCmd: ShellCommand = { file: process.execPath, args: ["-e", "0"], cwd: workspace };
    const display = "node --import tsx --test packages/orchestrator/src/thing.test.ts";
    const commands = resolver.codexFeedbackCommandsFor(proofCmd, display, workspace);
    const description = commands[0]?.description ?? "";
    assert.ok(description.includes(display));
    assert.ok(description.includes("FEEDBACK ONLY"));
    assert.ok(description.includes("replica"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: run_typecheck's description also says the run is against the replica", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  try {
    const proofCmd: ShellCommand = { file: process.execPath, args: ["-e", "0"], cwd: workspace };
    const typecheckCmd: ShellCommand = {
      file: process.execPath,
      args: ["-e", "0"],
      cwd: workspace,
    };
    const commands = resolver.codexFeedbackCommandsFor(
      proofCmd,
      "node -e 0",
      workspace,
      typecheckCmd,
    );
    assert.ok(commands[1]?.description.includes("replica"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

// ── run(replicaRoot): a real spawn against the replica, never the workspace ─

test("codex-feedback-runs-in-the-replica: run_proof's run(replicaRoot) spawns the command with its cwd retargeted to the replica, not the workspace", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const proofCmd: ShellCommand = {
      file: process.execPath,
      args: ["-e", "console.log(process.cwd())"],
      cwd: workspace,
    };
    const commands = resolver.codexFeedbackCommandsFor(proofCmd, "node -e cwd", workspace);
    const runProof = commands[0];
    assert.ok(runProof !== undefined);
    const result = await runProof.run(replicaRoot);
    assert.equal(result.code, 0);
    // Compared through realpathSync on both sides: a temp directory can be spelled differently
    // from inside the spawned child (e.g. a resolved symlink), so a bare string comparison would
    // be a false negative.
    const reportedCwd = fs.realpathSync(result.stdout.trim());
    const expectedCwd = fs.realpathSync(replicaRoot);
    assert.equal(reportedCwd, expectedCwd);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: run_proof's run(replicaRoot) spawns the command with an absolute file argument retargeted to the replica's own copy, not the workspace's", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const probeRelPath = path.join("nested", "probe.mjs");
    // Written ONLY into the replica — deliberately absent from the workspace, so a run that
    // reaches this file at all proves the argument was moved rather than merely resolved.
    await writeNestedFile(replicaRoot, probeRelPath, 'console.log("ran-from-replica");\n');
    const proofCmd: ShellCommand = {
      file: process.execPath,
      args: [path.join(workspace, probeRelPath)],
      cwd: workspace,
    };
    const commands = resolver.codexFeedbackCommandsFor(proofCmd, "node probe.mjs", workspace);
    const runProof = commands[0];
    assert.ok(runProof !== undefined);
    const result = await runProof.run(replicaRoot);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes("ran-from-replica"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});

test("codex-feedback-runs-in-the-replica: run_typecheck's run(replicaRoot) also spawns against the replica, retargeted independently of run_proof's own command", async () => {
  assertBothExist();
  const workspace = await tempDir("codex-fb-ws-");
  const replicaRoot = await tempDir("codex-fb-replica-");
  try {
    const proofCmd: ShellCommand = { file: process.execPath, args: ["-e", "0"], cwd: workspace };
    const typecheckCmd: ShellCommand = {
      file: process.execPath,
      args: ["-e", "console.log(process.cwd())"],
      cwd: workspace,
    };
    const commands = resolver.codexFeedbackCommandsFor(
      proofCmd,
      "node -e 0",
      workspace,
      typecheckCmd,
    );
    const runTypecheck = commands[1];
    assert.ok(runTypecheck !== undefined);
    const result = await runTypecheck.run(replicaRoot);
    assert.equal(result.code, 0);
    const reportedCwd = fs.realpathSync(result.stdout.trim());
    const expectedCwd = fs.realpathSync(replicaRoot);
    assert.equal(reportedCwd, expectedCwd);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(replicaRoot, { recursive: true, force: true });
  }
});
