import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import {
  DEFAULT_PROOF_TIMEOUT_MS,
  SHELL_COMMAND_MAX_BUFFER_BYTES,
  ShellCommandMaxBufferError,
  ShellCommandTreeTerminationError,
  ShellTestExecutor,
  defaultClassifyKind,
  isScrubbedEnvKey,
  nodeEvalExecutor,
  runShellCommand,
  runShellCommandWithRuntime,
  shellObserveCommand,
} from "./shell-test-executor.js";

// These spawn the SAME Node binary running this test — fully offline, no files, no network.

test("nodeEvalExecutor: a green script (exit 0) is observed as green", async () => {
  const exec = nodeEvalExecutor({ ok: "process.exit(0)" });
  const obs = await exec.run("ok");
  assert.equal(obs.result, "green");
  assert.equal(obs.testId, "ok");
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

// ── The classifier told the truth about Node's own errors (`gate-the-right-kind-red`) ────────────

test("defaultClassifyKind reads Node's REAL module-resolution errors as compile, not runtime", () => {
  // THE bug. The alternatives were TypeScript's wording (`cannot find name`, `no such module`), and
  // matched none of what Node prints — so a net-new node's unresolved import, the single most common
  // structural red in the corpus, classified as `runtime` and was stamped that way on every verdict's
  // evidence. Nothing consumed the answer, so nothing ever went red over it.
  const asCompile = [
    "Error: Cannot find module './thing.js'\nERR_MODULE_NOT_FOUND",
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nope' imported from /x/y.ts",
    "TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension \".ts\"",
    "SyntaxError: Unexpected token",
    "src/x.ts(3,5): error TS2304: cannot find name 'Foo'",
  ];
  for (const text of asCompile) {
    assert.equal(
      defaultClassifyKind({ stdout: "", stderr: text, code: 1 }),
      "compile",
      `should be compile: ${text.split("\n")[0]}`,
    );
  }
  // ...and a real assertion failure is still runtime — the widening must not swallow everything.
  assert.equal(
    defaultClassifyKind({
      stdout: "",
      stderr: "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n1 !== 2",
      code: 1,
    }),
    "runtime",
  );
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

// ── runShellCommand: the shared runner (CONFIRM observations + the leaf's feedback tools) ──

test("runShellCommand captures stdout, stderr, and a non-zero exit code as DATA", async () => {
  const out = await runShellCommand({
    file: process.execPath,
    args: ["-e", "console.log('out-line'); console.error('err-line'); process.exit(3)"],
  });
  assert.equal(out.code, 3);
  assert.match(out.stdout, /out-line/);
  assert.match(out.stderr, /err-line/);
});

test("runShellCommand rejects on a genuine spawn failure (the command never ran)", async () => {
  await assert.rejects(
    () => runShellCommand({ file: "definitely-not-a-real-binary-xyz", args: [] }),
    /failed to spawn/,
  );
});

test("ENV HONESTY: secret-shaped vars never reach the spawned process (output flows to the leaf)", async () => {
  // The leaf authors the test file the proof command executes, and the feedback tool returns the
  // command's OUTPUT to the model — a test that prints process.env must find no credentials.
  process.env["STORYTREE_FAKE_TOKEN"] = "leak-me";
  process.env["STORYTREE_FAKE_PLAIN"] = "pass-through";
  try {
    const out = await runShellCommand({
      file: process.execPath,
      args: [
        "-e",
        "process.stdout.write(`${process.env.STORYTREE_FAKE_TOKEN ?? 'absent'}|${process.env.STORYTREE_FAKE_PLAIN ?? 'absent'}`)",
      ],
    });
    assert.equal(out.stdout, "absent|pass-through");
  } finally {
    delete process.env["STORYTREE_FAKE_TOKEN"];
    delete process.env["STORYTREE_FAKE_PLAIN"];
  }
});

test("ADR-0064 ENV FORCE: cmd.env is merged LAST and OVERRIDES an inherited (prod) value", async () => {
  // The DB-backed proof honesty wall: the spine forces STORYTREE_DB_NAME to the disposable test DB,
  // and that value must WIN even when the parent process points at production — so a db-backed proof
  // can never reach prod through an inherited env.
  process.env["STORYTREE_DB_NAME"] = "storytree"; // the parent points at PRODUCTION
  try {
    const out = await runShellCommand({
      file: process.execPath,
      args: ["-e", "process.stdout.write(process.env.STORYTREE_DB_NAME ?? 'absent')"],
      env: { STORYTREE_DB_NAME: "storytree_test" }, // the spine forces the disposable DB
    });
    assert.equal(out.stdout, "storytree_test", "cmd.env must override the inherited prod value");
  } finally {
    delete process.env["STORYTREE_DB_NAME"];
  }
});

test("ADR-0064 ENV FORCE: cmd.env injects a var the parent never set", async () => {
  assert.equal(process.env["STORYTREE_INJECTED_ONLY"], undefined, "precondition: unset in parent");
  const out = await runShellCommand({
    file: process.execPath,
    args: ["-e", "process.stdout.write(process.env.STORYTREE_INJECTED_ONLY ?? 'absent')"],
    env: { STORYTREE_INJECTED_ONLY: "from-spine" },
  });
  assert.equal(out.stdout, "from-spine");
});

test("isScrubbedEnvKey: the real credential names are scrubbed; benign names are not", () => {
  for (const key of [
    "CLAUDE_CODE_OAUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "AWS_SECRET_ACCESS_KEY",
    "MY_PASSWORD",
    "NODE_TEST_CONTEXT",
  ]) {
    assert.equal(isScrubbedEnvKey(key), true, `${key} must be scrubbed`);
  }
  for (const key of ["PATH", "HOME", "USERPROFILE", "STORYTREE_STUDIO_STORE", "ComSpec"]) {
    assert.equal(isScrubbedEnvKey(key), false, `${key} must pass through`);
  }
});

// ── runShellCommand: the fail-closed timeout (a hung proof must never wedge the gate) ──
// The spine OBSERVES red/green by spawning a proof command through this ONE runner. If a proof leaks
// an OS handle (a DB connector/socket/timer) and never exits, an UNBOUNDED spawn hangs the CONFIRM
// observation INDEFINITELY — wedging the whole gate drive (hit driving library#gate-5, 2026-06-25).
// A bounded timeout + scope-aware force-stop makes a hung proof fail CLOSED: its owned POSIX process
// group or taskkill-reachable Windows tree is stopped → observed red.
// The probe sleeps far longer than the injected timeout but SELF-TERMINATES (exit 0) if never killed,
// so the test itself never leaks a handle (the very `real-test-must-not-leak-a-handle` discipline this
// backstop enforces) and a regression FAILS fast instead of hanging the suite forever.

test("runShellCommand: a command that outruns its timeout is force-stopped and observed as red (code null), not a reject", async () => {
  const out = await runShellCommand({
    file: process.execPath,
    // `setInterval(() => {}, 1000)` would hang FOREVER (the real bug shape); a finite over-long sleep
    // proves the SAME kill path while keeping THIS test leak-free + regression-fast.
    args: ["-e", "setTimeout(() => {}, 4000)"],
    timeoutMs: 200,
  });
  // Deadline termination → no exit code: `code` is null (ShellRunResult.code is `number | null`
  // for exactly this). null !== 0, so a consumer reads it as RED — never a green, never a
  // spawn-failure reject. Before the fix the timeout is ignored, the sleep runs to exit 0, and this
  // asserts red→fail.
  assert.equal(out.code, null);
});

test("timeout-stops-owned-process-scope: ShellTestExecutor transports timeout as a null original exit code", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      args: ["-e", "setTimeout(() => {}, 4000)"],
      timeoutMs: 200,
    }),
  });
  const obs = await exec.run("hang");
  assert.equal(obs.result, "red");
  assert.deepEqual(obs.originalProcessResult, { stdout: "", stderr: "", exitCode: null });
});

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function assertProcessExits(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!processIsAlive(pid)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`descendant process ${pid} survived the proof timeout`);
}

test(
  "timeout-stops-owned-process-scope: native timeout stops a ready wrapper and its same-scope descendants while preserving partial output",
  // The outer watchdog must leave room for the 4s proof deadline, bounded native tree delivery,
  // pipe drain, and the postcondition probe. It remains independent of the fixture's longer natural
  // lifetime, so passing still proves force-stop rather than eventual self-exit.
  { timeout: 20_000 },
  async () => {
    // Every fixture descendant stays in the detached POSIX process group or the taskkill-reachable
    // Windows tree and inherits stdout/stderr. An explicitly detached/setsid descendant would be
    // outside this owned scope and is deliberately not claimed by this contract.
    const dir = await mkdtemp(join(tmpdir(), "storytree-shell-tree-timeout-"));
    const naturalLifetimeMs = 30_000;
    const grandchildFile = join(dir, "grandchild.cjs");
    const childFile = join(dir, "child.cjs");
    const wrapperFile = join(dir, "wrapper.cjs");
    await writeFile(
      grandchildFile,
      [
        "process.stdout.write('scope-grandchild-ready-pid=' + process.pid + '\\n')",
        "process.stderr.write('scope-grandchild-ready-stderr\\n')",
        `setTimeout(() => {}, ${naturalLifetimeMs})`,
      ].join("; "),
    );
    await writeFile(
      childFile,
      [
        "const { spawn } = require('node:child_process')",
        `const grandchild = spawn(process.execPath, [${JSON.stringify(grandchildFile)}], { stdio: ['ignore', 'inherit', 'inherit'] })`,
        "grandchild.once('spawn', () => process.stdout.write('scope-child-ready-pid=' + process.pid + '\\n'))",
        "process.stderr.write('scope-child-stderr\\n')",
        `setTimeout(() => {}, ${naturalLifetimeMs})`,
      ].join("; "),
    );
    await writeFile(
      wrapperFile,
      [
        "const { spawn } = require('node:child_process')",
        `const child = spawn(process.execPath, [${JSON.stringify(childFile)}], { stdio: ['ignore', 'inherit', 'inherit'] })`,
        "child.once('spawn', () => process.stdout.write('scope-wrapper-ready-pid=' + process.pid + '\\n'))",
        "process.stderr.write('scope-wrapper-stderr\\n')",
        `setTimeout(() => {}, ${naturalLifetimeMs})`,
      ].join("; "),
    );

    try {
      const out = await runShellCommand({
        file: process.execPath,
        args: [wrapperFile],
        timeoutMs: 4_000,
      });

      assert.equal(out.code, null, "a scope timeout is a fail-closed red, never a numeric exit");
      assert.match(out.stdout, /scope-wrapper-ready-pid=\d+/);
      assert.match(out.stdout, /scope-child-ready-pid=\d+/);
      assert.match(out.stdout, /scope-grandchild-ready-pid=\d+/);
      assert.match(out.stderr, /scope-wrapper-stderr/);
      assert.match(out.stderr, /scope-child-stderr/);
      assert.match(out.stderr, /scope-grandchild-ready-stderr/);

      const pids = [...out.stdout.matchAll(/scope-(?:wrapper|child|grandchild)-ready-pid=(\d+)/g)]
        .map((match) => Number(match[1]));
      assert.equal(pids.length, 3, "all three fixtures must report ready before the deadline");
      await Promise.all(pids.map(assertProcessExits));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "timeout-stops-owned-process-scope: an already-observed exited Windows root is not handed to taskkill",
  { timeout: 1_000 },
  async () => {
    // Model the exact cross-platform lifecycle that is intermittent with real wrappers: `exit` has
    // been observed but inherited stdout/stderr are still open, so `close` has not arrived. A fake
    // ChildProcess makes that ordering deterministic on Windows too, where stdio inheritance varies
    // by wrapper. There is no safe stdlib handle for the orphan tree at this point: the old numeric
    // PID is no longer ownership evidence and may already name an unrelated process. There is still
    // an unavoidable check-to-taskkill race while a root appears live; this case proves only the
    // stronger no-signal rule once Node has already observed exit.
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let unrefCalls = 0;
    const fakeChild = Object.assign(new EventEmitter(), {
      stdin,
      stdout,
      stderr,
      pid: 42_424,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      unref: () => {
        unrefCalls += 1;
      },
    });
    const signalledPids: number[] = [];
    const observed = runShellCommandWithRuntime(
      { file: "fixture", args: [], timeoutMs: 100 },
      {
        maxBufferBytes: SHELL_COMMAND_MAX_BUFFER_BYTES,
        platform: "win32",
        terminateProcessTree: (pid) => {
          signalledPids.push(pid);
          return { delivered: true };
        },
        spawnCommand: (_file, _args, options) => {
          assert.equal(options.detached, false, "Windows must keep a taskkill-reachable live root");
          return fakeChild;
        },
      },
    );
    queueMicrotask(() => {
      fakeChild.emit("spawn");
      stdout.write("root-partial-out");
      stderr.write("descendant-pipe-still-open");
      fakeChild.exitCode = 0;
      fakeChild.emit("exit", 0, null);
      // Deliberately never emit `close`: the inherited pipes outlive the exited root.
    });

    const out = await observed;
    assert.deepEqual(out, {
      stdout: "root-partial-out",
      stderr: "descendant-pipe-still-open",
      code: null,
    });
    assert.deepEqual(
      signalledPids,
      [],
      "once ChildProcess observed root exit, its numeric PID must never be handed to a terminator",
    );
    assert.equal(unrefCalls, 1, "bounded abandonment releases the exited root's process handle");
    assert.equal(stdin.destroyed, true);
    assert.equal(stdout.destroyed, true);
    assert.equal(stderr.destroyed, true);
  },
);

test(
  "timeout-stops-owned-process-scope: an undelivered live POSIX group stop rejects distinctly after bounded handle release",
  { timeout: 1_000 },
  async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let unrefCalls = 0;
    const fakeChild = Object.assign(new EventEmitter(), {
      stdin,
      stdout,
      stderr,
      pid: 43_434,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      unref: () => {
        unrefCalls += 1;
      },
    });
    const signalledGroups: number[] = [];
    const observed = runShellCommandWithRuntime(
      { file: "fixture", args: [], timeoutMs: 100 },
      {
        maxBufferBytes: SHELL_COMMAND_MAX_BUFFER_BYTES,
        platform: "linux",
        terminateProcessTree: (pid) => {
          signalledGroups.push(pid);
          return { delivered: false, cause: new Error("fixture refused group signal") };
        },
        terminationDrainMs: 0,
        spawnCommand: (_file, _args, options) => {
          assert.equal(options.detached, true, "POSIX must create an owned process group");
          return fakeChild;
        },
      },
    );
    queueMicrotask(() => {
      fakeChild.emit("spawn");
      stdout.write("live-group-pipes-open");
    });

    await assert.rejects(observed, (error: unknown) => {
      assert.ok(error instanceof ShellCommandTreeTerminationError);
      assert.equal(error.code, "ERR_CHILD_PROCESS_TREE_TERMINATION");
      assert.equal(error.target, "posix-process-group");
      assert.equal(error.pid, 43_434);
      assert.equal(error.stdout, "live-group-pipes-open");
      assert.equal(error.stderr, "");
      assert.match(error.message, /force-stop delivery .* was not confirmed/);
      assert.match((error.cause as Error).message, /fixture refused group signal/);
      return true;
    });
    assert.deepEqual(
      signalledGroups,
      [43_434],
      "a still-live detached POSIX leader provides the owned PGID termination target",
    );
    assert.equal(unrefCalls, 1, "forced drain releases event-loop ownership after a failed stop");
    assert.equal(stdin.destroyed, true);
    assert.equal(stdout.destroyed, true);
    assert.equal(stderr.destroyed, true);
  },
);

test(
  "timeout-stops-owned-process-scope: a thrown termination helper failure is surfaced after bounded release",
  { timeout: 1_000 },
  async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let unrefCalls = 0;
    const fakeChild = Object.assign(new EventEmitter(), {
      stdin,
      stdout,
      stderr,
      pid: 44_444,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      unref: () => {
        unrefCalls += 1;
      },
    });
    const observed = runShellCommandWithRuntime(
      { file: "fixture", args: [], timeoutMs: 20 },
      {
        maxBufferBytes: 64,
        platform: "linux",
        terminateProcessTree: () => {
          throw new Error("native helper exploded");
        },
        terminationDrainMs: 0,
        spawnCommand: () => fakeChild,
      },
    );
    queueMicrotask(() => {
      fakeChild.emit("spawn");
      stderr.write("termination-diagnostic");
    });

    await assert.rejects(observed, (error: unknown) => {
      assert.ok(error instanceof ShellCommandTreeTerminationError);
      assert.equal(error.stderr, "termination-diagnostic");
      assert.match((error.cause as Error).message, /native helper exploded/);
      return true;
    });
    assert.equal(unrefCalls, 1);
    assert.equal(stdin.destroyed, true);
    assert.equal(stdout.destroyed, true);
    assert.equal(stderr.destroyed, true);
  },
);

test(
  "timeout-stops-owned-process-scope: after real POSIX leader exit the stale PGID is not signalled",
  {
    timeout: 7_000,
    skip: process.platform === "win32" ? "POSIX process-group semantics" : false,
  },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "storytree-shell-exited-leader-"));
    const childFile = join(dir, "same-group-child.cjs");
    const leaderFile = join(dir, "exiting-leader.cjs");
    const childPidFile = join(dir, "same-group-child.pid");
    await writeFile(
      childFile,
      [
        "const { writeFileSync } = require('node:fs')",
        `writeFileSync(${JSON.stringify(childPidFile)}, String(process.pid))`,
        "process.stdout.write('same-group-child-ready-pid=' + process.pid + '\\n')",
        "setTimeout(() => {}, 15000)",
      ].join("; "),
    );
    await writeFile(
      leaderFile,
      [
        "const { spawn } = require('node:child_process')",
        `const child = spawn(process.execPath, [${JSON.stringify(childFile)}], { stdio: ['ignore', 'inherit', 'inherit'] })`,
        "child.once('spawn', () => { process.stdout.write('same-group-leader-exiting-pid=' + process.pid + '\\n'); setTimeout(() => process.exit(0), 100) })",
      ].join("; "),
    );

    let childPid: number | undefined;
    try {
      const out = await runShellCommand({
        file: process.execPath,
        args: [leaderFile],
        timeoutMs: 2_000,
      });
      assert.equal(out.code, null);
      assert.match(out.stdout, /same-group-leader-exiting-pid=\d+/);
      const childPidMatch = out.stdout.match(/same-group-child-ready-pid=(\d+)/);
      assert.ok(childPidMatch, "same-group child must report ready before timeout");
      childPid = Number(childPidMatch[1]);
      assert.ok(Number.isSafeInteger(childPid), "same-group child must report ready before timeout");
      assert.equal(
        processIsAlive(childPid),
        true,
        "observed leader exit removes safe PGID ownership, so the runner must not signal that number",
      );
    } finally {
      // The runner deliberately left this now-orphan fixture outside its safe ownership. The test
      // still owns the freshly reported long-lived child PID and reaps it explicitly.
      if (childPid === undefined) {
        try {
          childPid = Number(await readFile(childPidFile, "utf8"));
        } catch {
          // The fixture never reached ready, so there is no process id to reap.
        }
      }
      if (childPid !== undefined && Number.isSafeInteger(childPid) && processIsAlive(childPid)) {
        process.kill(childPid, "SIGKILL");
        await assertProcessExits(childPid);
      }
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("timeout-stops-owned-process-scope: in-budget green and explicit red exits stay numeric", async () => {
  const green = await runShellCommand({
    file: process.execPath,
    args: [
      "-e",
      "process.stdout.write('ordinary-green-out'); process.stderr.write('ordinary-green-err')",
    ],
    timeoutMs: 10_000,
  });
  const red = await runShellCommand({
    file: process.execPath,
    args: [
      "-e",
      "process.stdout.write('ordinary-red-out'); process.stderr.write('ordinary-red-err'); process.exit(7)",
    ],
    timeoutMs: 10_000,
  });

  assert.deepEqual(green, {
    stdout: "ordinary-green-out",
    stderr: "ordinary-green-err",
    code: 0,
  });
  assert.deepEqual(red, {
    stdout: "ordinary-red-out",
    stderr: "ordinary-red-err",
    code: 7,
  });
});

test("timeout-stops-owned-process-scope: maxBuffer is byte-accurate and independent per stream", async () => {
  assert.equal(SHELL_COMMAND_MAX_BUFFER_BYTES, 64 * 1024 * 1024);
  const fourByteOutput = "€x";
  assert.equal(Buffer.byteLength(fourByteOutput, "utf8"), 4);
  const exactBoundary = await runShellCommandWithRuntime(
    {
      file: process.execPath,
      args: [
        "-e",
        `process.stdout.write(${JSON.stringify(fourByteOutput)}); process.stderr.write(${JSON.stringify(fourByteOutput)})`,
      ],
      timeoutMs: 2_000,
    },
    {
      maxBufferBytes: 4,
      platform: process.platform,
      terminateProcessTree: () => assert.fail("exact per-stream boundaries must not be stopped"),
    },
  );
  assert.deepEqual(exactBoundary, { stdout: fourByteOutput, stderr: fourByteOutput, code: 0 });

  const terminated: number[] = [];
  await assert.rejects(
    () =>
      runShellCommandWithRuntime(
        {
          file: process.execPath,
          args: [
            "-e",
            `process.stdout.write(${JSON.stringify(fourByteOutput)}); setTimeout(() => {}, 10000)`,
          ],
          timeoutMs: 2_000,
        },
        {
          maxBufferBytes: 3,
          platform: process.platform,
          terminateProcessTree: (pid) => {
            terminated.push(pid);
            process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
            return { delivered: true };
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ShellCommandMaxBufferError);
      assert.equal(error.code, "ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
      assert.equal(error.stream, "stdout");
      assert.equal(error.limitBytes, 3);
      assert.equal(error.stdout, "€");
      assert.equal(error.stderr, "");
      assert.match(error.message, /command ran/);
      assert.doesNotMatch(error.message, /command did not run/);
      return true;
    },
  );
  assert.equal(terminated.length, 1, "overflow still stops the live producer exactly once");
  await assertProcessExits(terminated[0]!);
});

test("timeout-stops-owned-process-scope: stderr overflow preserves stdout and reports stderr structurally", async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const fakeChild = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    pid: 45_454,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    unref: () => undefined,
  });
  const observed = runShellCommandWithRuntime(
    { file: "fixture", args: [], timeoutMs: 1_000 },
    {
      maxBufferBytes: 3,
      platform: "linux",
      terminateProcessTree: () => ({ delivered: true }),
      spawnCommand: () => fakeChild,
    },
  );
  queueMicrotask(() => {
    fakeChild.emit("spawn");
    stdout.write("ok");
    stderr.write("four");
  });

  await assert.rejects(observed, (error: unknown) => {
    assert.ok(error instanceof ShellCommandMaxBufferError);
    assert.equal(error.code, "ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
    assert.equal(error.stream, "stderr");
    assert.equal(error.stdout, "ok");
    assert.equal(error.stderr, "fou");
    return true;
  });
});

test("timeout-stops-owned-process-scope: deadline, close, and maxBuffer have deterministic first-event precedence", async () => {
  const timeoutFirstStdin = new PassThrough();
  const timeoutFirstStdout = new PassThrough();
  const timeoutFirstStderr = new PassThrough();
  const timeoutFirstChild = Object.assign(new EventEmitter(), {
    stdin: timeoutFirstStdin,
    stdout: timeoutFirstStdout,
    stderr: timeoutFirstStderr,
    pid: 46_464,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    unref: () => undefined,
  });
  const timeoutFirst = runShellCommandWithRuntime(
    { file: "fixture", args: [], timeoutMs: 10 },
    {
      maxBufferBytes: 3,
      platform: "linux",
      terminateProcessTree: () => {
        // Re-entrant output and close model a last burst caused by native termination. The already
        // expired deadline must own the result even though this burst crosses maxBuffer.
        timeoutFirstStdout.write("four");
        timeoutFirstChild.emit("close", 0, null);
        return { delivered: true };
      },
      terminationDrainMs: 0,
      spawnCommand: () => timeoutFirstChild,
    },
  );
  queueMicrotask(() => timeoutFirstChild.emit("spawn"));
  assert.deepEqual(await timeoutFirst, { stdout: "fou", stderr: "", code: null });

  const overflowFirstStdin = new PassThrough();
  const overflowFirstStdout = new PassThrough();
  const overflowFirstStderr = new PassThrough();
  const overflowFirstChild = Object.assign(new EventEmitter(), {
    stdin: overflowFirstStdin,
    stdout: overflowFirstStdout,
    stderr: overflowFirstStderr,
    pid: 47_474,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    unref: () => undefined,
  });
  let overflowFirstTerminationCalls = 0;
  const overflowFirst = runShellCommandWithRuntime(
    { file: "fixture", args: [], timeoutMs: 30 },
    {
      maxBufferBytes: 3,
      platform: "linux",
      terminateProcessTree: () => {
        overflowFirstTerminationCalls += 1;
        // A synchronous terminator can make the process close before it returns. The overflow was
        // observed first, so this re-entrant numeric close must not overwrite its infrastructure
        // error with a forged green.
        overflowFirstChild.exitCode = 0;
        overflowFirstChild.emit("close", 0, null);
        return { delivered: true };
      },
      spawnCommand: () => overflowFirstChild,
    },
  );
  queueMicrotask(() => {
    overflowFirstChild.emit("spawn");
    overflowFirstStdout.write("four");
  });
  await assert.rejects(overflowFirst, (error: unknown) => {
    assert.ok(error instanceof ShellCommandMaxBufferError);
    assert.equal(error.code, "ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
    assert.equal(error.stdout, "fou");
    return true;
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  assert.equal(
    overflowFirstTerminationCalls,
    1,
    "the cleared deadline must not add a second termination after pre-deadline overflow",
  );

  const closeFirstStdin = new PassThrough();
  const closeFirstStdout = new PassThrough();
  const closeFirstStderr = new PassThrough();
  const closeFirstChild = Object.assign(new EventEmitter(), {
    stdin: closeFirstStdin,
    stdout: closeFirstStdout,
    stderr: closeFirstStderr,
    pid: 48_484,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    unref: () => undefined,
  });
  let closeFirstTerminationCalls = 0;
  const closeFirst = runShellCommandWithRuntime(
    { file: "fixture", args: [], timeoutMs: 20 },
    {
      maxBufferBytes: 3,
      platform: "linux",
      terminateProcessTree: () => {
        closeFirstTerminationCalls += 1;
        return { delivered: true };
      },
      spawnCommand: () => closeFirstChild,
    },
  );
  queueMicrotask(() => {
    closeFirstChild.emit("spawn");
    closeFirstStdout.write("red");
    closeFirstChild.exitCode = 7;
    closeFirstChild.emit("exit", 7, null);
    closeFirstChild.emit("close", 7, null);
  });
  assert.deepEqual(await closeFirst, { stdout: "red", stderr: "", code: 7 });
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  assert.equal(closeFirstTerminationCalls, 0, "a numeric close clears the later deadline");
});

test("DEFAULT_PROOF_TIMEOUT_MS is a positive, finite production default (the backstop is always armed)", () => {
  // The spine-wide fallback must be a positive finite duration; otherwise an absent cmd.timeoutMs
  // would disable the fail-closed backstop or schedule a meaningless immediate timeout.
  assert.equal(Number.isFinite(DEFAULT_PROOF_TIMEOUT_MS), true);
  assert.ok(DEFAULT_PROOF_TIMEOUT_MS > 0);
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

test("original-shell-result-is-preserved-without-a-rerun: every spawned observation retains its original process result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "storytree-original-shell-result-"));
  const marker = join(dir, "children.log");
  const command = (name: string, exit: string) => ({
    file: process.execPath,
    args: [
      "-e",
      [
        "const fs = require('node:fs')",
        `fs.appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(`${name}\n`)})`,
        `process.stdout.write(${JSON.stringify(`${name}-stdout`)})`,
        `process.stderr.write(${JSON.stringify(`${name}-stderr`)})`,
        exit,
      ].join("; "),
    ],
    timeoutMs: 3_000,
  });

  try {
    const green = await new ShellTestExecutor({ command: () => command("green", "process.exit(0)") }).run(
      "green",
    );
    const red = await new ShellTestExecutor({ command: () => command("red", "process.exit(7)") }).run("red");
    const terminated = await new ShellTestExecutor({
      command: () =>
        command("signal", "setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100)"),
    }).run("signal");

    assert.deepEqual(green.originalProcessResult, {
      stdout: "green-stdout",
      stderr: "green-stderr",
      exitCode: 0,
    });
    assert.deepEqual(red.originalProcessResult, {
      stdout: "red-stdout",
      stderr: "red-stderr",
      exitCode: 7,
    });
    assert.deepEqual(terminated.originalProcessResult, {
      stdout: "signal-stdout",
      stderr: "signal-stderr",
      // What this contract asserts is that the ORIGINAL result is PRESERVED without a rerun — not
      // which exit code a signalled child produces, which is the PLATFORM's call and differs.
      // POSIX delivers the signal, so the child reports `exitCode: null` (with `signal: SIGTERM`).
      // Windows has no signal delivery: Node emulates `process.kill(self, 'SIGTERM')` by terminating
      // the process, which surfaces as `exitCode: 1` and no signal. Hardcoding the POSIX value made
      // this the one test that could never pass on a Windows checkout — it red every Windows
      // session's gate on a file that session had not touched, while CI stayed green on Linux.
      exitCode: process.platform === "win32" ? 1 : null,
    });

    assert.deepEqual(
      (await readFile(marker, "utf8")).trim().split("\n").sort(),
      ["green", "red", "signal"],
      "each assertion is backed by exactly one child-written marker, not resolver-call counts",
    );

    await assert.rejects(
      () =>
        new ShellTestExecutor({
          command: () => ({ file: "definitely-not-a-real-binary-xyz", args: [] }),
        }).run("enoent"),
      /failed to spawn/,
      "an ENOENT command supplies no observation from which to fabricate process detail",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── shellObserveCommand: the OBSERVE path runs the AUTHORED command line (ADR-0421) ──
//
// These are the two shapes the old whitespace-split-into-execFile runner could NEVER observe green,
// and they are the reason six `ci-cd` gates sat unobservable from the day they were authored: a
// quoted argument was shredded into stray argv entries, and `&&` was handed to the first command as
// a literal. Both spawn the SAME Node binary running this test — offline, no files, no network.

test("shellObserveCommand: an authored command with a QUOTED argument is observed green", async () => {
  const command = `"${process.execPath}" -e "const s = 'a b c'; if (s !== 'a b c') process.exit(9)"`;
  const out = await runShellCommand(shellObserveCommand(command, tmpdir()));
  assert.equal(out.code, 0);
});

test("shellObserveCommand: an authored command joined with && is observed green", async () => {
  const node = `"${process.execPath}"`;
  const command = `${node} -e "process.exit(0)" && ${node} -e "process.exit(0)"`;
  const out = await runShellCommand(shellObserveCommand(command, tmpdir()));
  assert.equal(out.code, 0);
});

test("shellObserveCommand: a RED stays red — the shell reports the failing exit code as DATA", async () => {
  const command = `"${process.execPath}" -e "process.exit(4)"`;
  const out = await runShellCommand(shellObserveCommand(command, tmpdir()));
  assert.equal(out.code, 4);
});

// NON-VACUITY CONTROL: the same two command strings through the OLD vector path (whitespace-split,
// no shell) do NOT exit 0. Without this the tests above would pass even if `shell` were ignored.
test("NON-VACUITY: the same commands through the no-shell vector path are NOT green", async () => {
  const quoted = `"${process.execPath}" -e "const s = 'a b c'; if (s !== 'a b c') process.exit(9)"`;
  const parts = quoted.trim().split(/\s+/);
  const viaVector = await runShellCommand({ file: process.execPath, args: parts.slice(1), cwd: tmpdir() });
  assert.notEqual(viaVector.code, 0);
});

test("shellObserveCommand builds a shell command carrying the WHOLE line, with no argument vector", () => {
  const built = shellObserveCommand("pnpm --filter studio test", "/repo");
  assert.equal(built.shell, true);
  assert.equal(built.file, "pnpm --filter studio test");
  assert.deepEqual(built.args, []);
  assert.equal(built.cwd, "/repo");
});
