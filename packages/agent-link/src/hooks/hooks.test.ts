/**
 * Capability 3 · Hooks: one test per contract 3.1-3.4 in stories/agent-link.md.
 *
 * The hook runs the way a harness runs it: the built command (`storytree-hook.mjs`, a plain Node
 * script) started directly, with no shell, the hook's input on its stdin. The inputs are real ones,
 * recorded from Claude Code 2.1.212 and Codex on 2026-09-26 (their paths rewritten to a neutral
 * folder); each test points the input's working folder at a throwaway folder set up as a project.
 *
 * "Storytree running" is the test Postgres: a throwaway storytree home holds a copy of its owner
 * record, where the app's would be.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { openActivityLog, type Line } from "../activity/index.js";
import { buildBins } from "../bins/build.js";
import { MARKER_FILE } from "../routing/index.js";
import { withTempDir } from "../testing/folders.js";
import { testServerDataDir, testServerUrl, uniqueProjectName } from "../testing/pg.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
/** "Under half a second", as the tests hold it. */
const QUICK_MS = 500;

let bins: string;
let hook: string;

before(async () => {
  bins = mkdtempSync(path.join(tmpdir(), "storytree-link-bins-"));
  hook = (await buildBins(bins))["storytree-hook"]!;
});

after(() => {
  rmSync(bins, { recursive: true, force: true });
});

/** A recorded hook input, with its working folder moved to `folder`. */
function recorded(harness: "claude-code" | "codex", name: string, folder: string): string {
  const input = JSON.parse(readFileSync(path.join(FIXTURES, harness, `${name}.json`), "utf8")) as Record<string, unknown>;
  return JSON.stringify({ ...input, cwd: folder });
}

interface Ran {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

/** Run the built hook as a harness does: directly, no shell, `input` on stdin, the storytree home given. */
function runHook(harness: string, input: string, storytreeHome: string): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [hook, harness], {
      env: { ...process.env, STORYTREE_HOME: storytreeHome },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr, ms: performance.now() - started }));
    child.stdin.end(input);
  });
}

/** A throwaway storytree home: where the app's owner record would be, a copy of the test server's when `running`. */
function storytreeHome(dir: string, running: boolean): string {
  const home = path.join(dir, "storytree-home");
  mkdirSync(home, { recursive: true });
  if (running) copyFileSync(`${testServerDataDir()}.owner.json`, path.join(home, "pgdata.owner.json"));
  return home;
}

/** A folder under `dir` set up as `project`. */
function projectFolder(dir: string, project: string): string {
  const folder = path.join(dir, "site");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, MARKER_FILE), `${JSON.stringify({ project })}\n`);
  return folder;
}

async function linesOf(project: string): Promise<Line[]> {
  const log = await openActivityLog(testServerUrl());
  try {
    return (await log.since(project, 0)).lines;
  } finally {
    await log.close();
  }
}

/** How many lines any project's log holds for `session`: none, for a hook that wrote nothing. */
async function linesAnywhereFor(session: string): Promise<number> {
  const url = new URL(testServerUrl());
  url.pathname = "/storytree-activity";
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: string }>("SELECT count(*) FROM activity WHERE session = $1", [session]);
    return Number(rows[0]!.count);
  } finally {
    await client.end();
  }
}

/** The line's own fields, without the number and time the log gives it. */
function written(line: Line): Omit<Line, "seq" | "at"> {
  const { seq: _seq, at: _at, ...rest } = line;
  return rest;
}

test("3.1 recorded Claude Code hook inputs (a start, a file edit, a shell command, an end) make four lines on that session, carrying the file path and the command", async () => {
  const project = uniqueProjectName();
  await withTempDir(async (dir) => {
    const folder = projectFolder(dir, project);
    const home = storytreeHome(dir, true);
    for (const name of ["session-start-startup", "post-tool-use-write", "post-tool-use-bash", "session-end"]) {
      const ran = await runHook("claude-code", recorded("claude-code", name, folder), home);
      assert.deepEqual({ code: ran.code, stdout: ran.stdout, stderr: ran.stderr }, { code: 0, stdout: "", stderr: "" }, name);
    }
    const session = "b2ef2128-23c1-4a1e-b126-4fa79b2c2a97";
    const common = { project, session, harness: "claude-code", source: "hook", folder } as const;
    assert.deepEqual((await linesOf(project)).map(written), [
      { ...common, kind: "session-started", how: "startup" },
      { ...common, kind: "file-edited", files: ["C:\\Users\\dev\\projects\\site\\hello.txt"] },
      { ...common, kind: "command-run", command: "echo probe-command" },
      { ...common, kind: "session-ended", reason: "other" },
    ]);
  });
});

test("3.2 recorded Codex hook inputs make the same four lines, with the edited files read out of its patch text", async () => {
  const project = uniqueProjectName();
  await withTempDir(async (dir) => {
    const folder = projectFolder(dir, project);
    const home = storytreeHome(dir, true);
    for (const name of ["session-start-startup", "post-tool-use-apply-patch", "post-tool-use-bash", "session-end"]) {
      const ran = await runHook("codex", recorded("codex", name, folder), home);
      assert.deepEqual({ code: ran.code, stdout: ran.stdout, stderr: ran.stderr }, { code: 0, stdout: "", stderr: "" }, name);
    }
    const session = "01a0dc55-55fe-7b01-a0ea-cebc2d4a4267";
    const common = { project, session, harness: "codex", source: "hook", folder } as const;
    assert.deepEqual((await linesOf(project)).map(written), [
      { ...common, kind: "session-started", how: "startup" },
      { ...common, kind: "file-edited", files: ["hello.txt"] },
      { ...common, kind: "command-run", command: "echo probe-command" },
      { ...common, kind: "session-ended", reason: "other" },
    ]);

    // One patch touching several files names them all: the one it updates, where it moves it, and the one it adds.
    const before = (await linesOf(project)).length;
    await runHook("codex", recorded("codex", "post-tool-use-apply-patch-move", folder), home);
    // The same patch run through the shell (`apply_patch <<'EOF'`) reaches the hook as a Bash command.
    const patch = (JSON.parse(recorded("codex", "post-tool-use-apply-patch-move", folder)) as { tool_input: { command: string } }).tool_input.command;
    const shell = { ...JSON.parse(recorded("codex", "post-tool-use-bash", folder)), tool_input: { command: `apply_patch <<'EOF'\n${patch}\nEOF` } };
    await runHook("codex", JSON.stringify(shell), home);
    assert.deepEqual((await linesOf(project)).slice(before).map(written), [
      { ...common, kind: "file-edited", files: ["hello.txt", "greeting.txt", "notes.txt"] },
      { ...common, kind: "file-edited", files: ["hello.txt", "greeting.txt", "notes.txt"] },
    ]);
  });
});

test("3.3 with storytree stopped, with garbage input, or outside a storytree project, the command exits cleanly in under half a second and writes nothing", async () => {
  const project = uniqueProjectName();
  await withTempDir(async (dir) => {
    const folder = projectFolder(dir, project);
    const outside = path.join(dir, "not-a-project");
    mkdirSync(outside);
    const stopped = storytreeHome(path.join(dir, "stopped"), false);
    const running = storytreeHome(path.join(dir, "running"), true);
    const session = `session-${project}`;
    const start = (cwd: string): string => JSON.stringify({ ...JSON.parse(recorded("claude-code", "session-start-startup", cwd)), session_id: session });

    const cases: [string, string, string][] = [
      ["storytree stopped", start(folder), stopped],
      ["garbage input", "{ this is not a hook's input", running],
      ["an empty input", "", running],
      ["input of the wrong shape", JSON.stringify({ hook_event_name: 42, cwd: [folder] }), running],
      ["outside a storytree project", start(outside), running],
    ];
    for (const [what, input, home] of cases) {
      const ran = await runHook("claude-code", input, home);
      assert.deepEqual({ code: ran.code, stdout: ran.stdout, stderr: ran.stderr }, { code: 0, stdout: "", stderr: "" }, what);
      assert.ok(ran.ms < QUICK_MS, `${what}: exited in ${ran.ms.toFixed(0)} ms`);
    }
    assert.deepEqual(await linesOf(project), [], "nothing written for the project");
    assert.equal(await linesAnywhereFor(session), 0, "nothing written anywhere for the session");
  });
});

test("3.4 it runs on Windows without a Unix shell, and it never prints anything the agent would see, even when storytree cannot be reached", async () => {
  const project = uniqueProjectName();
  // Storytree "running" whose address never answers: a live process in the owner record, and on
  // its port something that accepts a connection and says nothing.
  const silent = createServer(() => {});
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  try {
    await withTempDir(async (dir) => {
      const folder = projectFolder(dir, project);
      const home = path.join(dir, "unanswering-home");
      mkdirSync(home);
      const { port } = silent.address() as AddressInfo;
      writeFileSync(path.join(home, "pgdata.owner.json"), JSON.stringify({ pid: process.pid, token: "t", port, startedAt: new Date().toISOString() }));
      for (const harness of ["claude-code", "codex", "a harness it does not know"]) {
        const ran = await runHook(harness, recorded("claude-code", "post-tool-use-bash", folder), home);
        assert.deepEqual({ code: ran.code, stdout: ran.stdout, stderr: ran.stderr }, { code: 0, stdout: "", stderr: "" }, harness);
      }
    });
  } finally {
    silent.close();
  }
});
