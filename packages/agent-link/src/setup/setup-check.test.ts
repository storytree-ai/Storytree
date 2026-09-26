/**
 * Capability 8 · Setup check: one test per contract 8.1-8.5 in stories/agent-link.md. Contract 8.6,
 * the live check with a real Claude Code and a real Codex, is subscription-billed, and is run once
 * by hand as the story's final proof rather than here.
 *
 * Each test works in a throwaway home: its own Claude Code config folder and Codex home, holding
 * settings of the user's own that the setup check must leave alone, and a storytree home that says
 * where storytree listens (a copy of the test Postgres's owner record) or how to open it.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect as connectTo, createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { connect } from "@storytree/library";

import { buildBins } from "../bins/build.js";
import { locateStorytree, MARKER_FILE } from "../routing/index.js";
import { claudeCode, codex, withAgent } from "../testing/agent.js";
import { withTempDir } from "../testing/folders.js";
import { dropTestProjects, testServerDataDir, testServerUrl, uniqueProjectName } from "../testing/pg.js";
import { registerHooks, removeHooks, runSetupCheck, type HookCommand, type Homes } from "./index.js";

const STUB_APP = fileURLToPath(new URL("../testing/stub-app.mjs", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../hooks/fixtures/", import.meta.url));

/** A hook command as the setup check registers it: registering never runs it. */
const HOOK: HookCommand = { node: process.execPath, script: path.join(tmpdir(), "storytree", "dist", "storytree-hook.mjs") };

let bins: string;
let hookScript: string;

before(async () => {
  bins = mkdtempSync(path.join(tmpdir(), "storytree-link-bins-"));
  hookScript = (await buildBins(bins))["storytree-hook"]!;
});

after(() => {
  rmSync(bins, { recursive: true, force: true });
});

/** The user's own settings, which the setup check must leave as they are. */
const CLAUDE_SETTINGS = {
  permissions: { allow: ["Bash(npm test:*)"] },
  model: "opus",
  hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] }] },
};
const CODEX_CONFIG = 'model = "gpt-5"\n\n[mcp_servers.storytree]\ncommand = "node"\nargs = ["storytree-mcp.mjs"]\n';

interface Home {
  homes: Required<Homes>;
  claudeSettings: string;
  codexConfig: string;
  codexHooks: string;
  /** A storytree home whose owner record says storytree listens where the test Postgres does. */
  storytreeHome: string;
}

/** A throwaway home with only the storytree tool server installed, and storytree running. */
function throwawayHome(dir: string): Home {
  const claude = path.join(dir, ".claude");
  const codexHome = path.join(dir, ".codex");
  const storytreeHome = path.join(dir, ".storytree", "0.3");
  for (const folder of [claude, codexHome, storytreeHome]) mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(claude, "settings.json"), `${JSON.stringify(CLAUDE_SETTINGS, null, 2)}\n`);
  writeFileSync(path.join(codexHome, "config.toml"), CODEX_CONFIG);
  copyFileSync(`${testServerDataDir()}.owner.json`, path.join(storytreeHome, "pgdata.owner.json"));
  return {
    homes: { claude, codex: codexHome },
    claudeSettings: path.join(claude, "settings.json"),
    codexConfig: path.join(codexHome, "config.toml"),
    codexHooks: path.join(codexHome, "hooks.json"),
    storytreeHome,
  };
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

interface HookEntry {
  matcher?: string;
  hooks: { type: string; command: string; args?: string[] }[];
}

/**
 * The events for which `settings` runs storytree's hook `script` for `harness`, each with its
 * matcher: Claude Code runs it as a command with arguments, Codex as one command line.
 */
function storytreeHooks(settings: Record<string, unknown>, script: string, harness: string): Record<string, string> {
  const events = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  const found: Record<string, string> = {};
  for (const [event, entries] of Object.entries(events)) {
    for (const entry of entries) {
      const runsIt = entry.hooks.some((hook) =>
        hook.args !== undefined ? hook.args[0] === script && hook.args.includes(harness) : hook.command.includes(script) && hook.command.includes(harness),
      );
      if (runsIt) found[event] = entry.matcher ?? "";
    }
  }
  return found;
}

test("8.1 in a throwaway home with only the tool server installed, the first session start registers the hooks for Claude Code and for Codex without touching any other setting", async () => {
  await withTempDir(async (dir) => {
    const home = throwawayHome(dir);
    const report = await runSetupCheck({ folder: dir, hook: HOOK, homes: home.homes, storytreeHome: home.storytreeHome });
    assert.deepEqual(report.hooks, { "claude-code": "registered", codex: "registered" });

    const claude = readJson(home.claudeSettings);
    assert.deepEqual({ ...claude, hooks: undefined }, { ...CLAUDE_SETTINGS, hooks: undefined }, "Claude Code's other settings are as they were");
    assert.deepEqual((claude.hooks as Record<string, unknown>).PreToolUse, CLAUDE_SETTINGS.hooks.PreToolUse, "and so is the user's own hook");
    const claudeEvents = storytreeHooks(claude, HOOK.script, "claude-code");
    assert.deepEqual(Object.keys(claudeEvents).sort(), ["PostToolUse", "SessionEnd", "SessionStart"]);
    for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"]) assert.match(tool, new RegExp(`^(${claudeEvents.PostToolUse})$`), `after ${tool}`);

    const codexEvents = storytreeHooks(readJson(home.codexHooks), HOOK.script, "codex");
    assert.deepEqual(Object.keys(codexEvents).sort(), ["PostToolUse", "SessionEnd", "SessionStart"]);
    for (const tool of ["apply_patch", "Bash"]) assert.match(tool, new RegExp(codexEvents.PostToolUse!), `after ${tool}`);
    assert.equal(readFileSync(home.codexConfig, "utf8"), CODEX_CONFIG, "Codex's config is untouched");
  });
});

test("8.2 a second start changes nothing, and removing storytree takes out exactly what it added", async () => {
  await withTempDir(async (dir) => {
    const home = throwawayHome(dir);
    await runSetupCheck({ folder: dir, hook: HOOK, homes: home.homes, storytreeHome: home.storytreeHome });
    const first = { claude: readFileSync(home.claudeSettings, "utf8"), codex: readFileSync(home.codexHooks, "utf8") };

    const again = await runSetupCheck({ folder: dir, hook: HOOK, homes: home.homes, storytreeHome: home.storytreeHome });
    assert.deepEqual(again.hooks, { "claude-code": "already registered", codex: "already registered" });
    assert.deepEqual({ claude: readFileSync(home.claudeSettings, "utf8"), codex: readFileSync(home.codexHooks, "utf8") }, first, "not a byte changed");

    assert.deepEqual(removeHooks(home.homes), { "claude-code": "removed", codex: "removed" });
    assert.deepEqual(readJson(home.claudeSettings), CLAUDE_SETTINGS, "Claude Code's settings are as they were before storytree");
    assert.equal(existsSync(home.codexHooks), false, "the hooks file storytree made is gone");
    assert.equal(readFileSync(home.codexConfig, "utf8"), CODEX_CONFIG);
    assert.deepEqual(removeHooks(home.homes), { "claude-code": "none", codex: "none" }, "and removing again finds nothing");

    // A registration from an older install, at another path, is replaced rather than doubled.
    registerHooks(home.homes, { ...HOOK, script: path.join(dir, "old", "storytree-hook.mjs") });
    registerHooks(home.homes, HOOK);
    assert.deepEqual(Object.keys(storytreeHooks(readJson(home.claudeSettings), path.join(dir, "old", "storytree-hook.mjs"), "claude-code")), []);
    assert.equal(Object.keys(storytreeHooks(readJson(home.claudeSettings), HOOK.script, "claude-code")).length, 3);
  });
});

test("8.3 with storytree closed, a session start opens it", async () => {
  await withTempDir(async (dir) => {
    const storytreeHome = path.join(dir, "storytree-home");
    mkdirSync(storytreeHome);
    const dataDir = path.join(storytreeHome, "pgdata");
    // How to open storytree, as the app records it: here, a stand-in that says where the test Postgres listens.
    const port = new URL(testServerUrl()).port;
    writeFileSync(path.join(storytreeHome, "app.json"), JSON.stringify({ command: process.execPath, args: [STUB_APP, dataDir, port] }));
    assert.equal(locateStorytree({ dataDir }).running, false, "closed to begin with");
    try {
      const report = await runSetupCheck({ folder: dir, homes: {}, storytreeHome, openWaitMs: 20_000 });
      assert.deepEqual(report.storytree, { state: "opened", url: testServerUrl() });
      assert.deepEqual(locateStorytree({ dataDir }), { running: true, url: testServerUrl() });
    } finally {
      const record = `${dataDir}.owner.json`;
      const { pid } = existsSync(record) ? (readJson(record) as { pid?: number }) : {};
      if (pid !== undefined) await stop(pid);
    }

    // With nothing saying how to open it, it says so rather than waiting.
    const unopenable = path.join(dir, "no-app");
    mkdirSync(unopenable);
    const report = await runSetupCheck({ folder: dir, homes: {}, storytreeHome: unopenable, openWaitMs: 20_000 });
    assert.equal(report.storytree.state, "not running");
  });
});

test("opening storytree waits until it accepts connections, not only until it has said where it will listen (regression: the agent link's live check, 2026-09-26)", async () => {
  await withTempDir(async (dir) => {
    const storytreeHome = path.join(dir, "storytree-home");
    mkdirSync(storytreeHome);
    const dataDir = path.join(storytreeHome, "pgdata");
    const port = await freePort();
    // The stand-in says where it listens at once, and starts listening only 1.5 s later.
    writeFileSync(path.join(storytreeHome, "app.json"), JSON.stringify({ command: process.execPath, args: [STUB_APP, dataDir, String(port), "1500"] }));
    try {
      const report = await runSetupCheck({ folder: dir, homes: {}, storytreeHome, openWaitMs: 20_000 });
      assert.equal(report.storytree.state, "opened");
      assert.equal(await accepts(port), true, "it accepts a connection the moment it is reported opened");
    } finally {
      const record = `${dataDir}.owner.json`;
      const { pid } = existsSync(record) ? (readJson(record) as { pid?: number }) : {};
      if (pid !== undefined) await stop(pid);
    }
  });
});

test("8.4 in a folder that isn't a project, the agent is told to ask the user, and nothing is created until the user says yes", async () => {
  await withTempDir(async (dir) => {
    const home = throwawayHome(dir);
    const name = uniqueProjectName();
    const folder = path.join(dir, name);
    mkdirSync(folder);
    const storytree = await connect({ url: testServerUrl() });
    try {
      await withAgent(folder, claudeCode("claude-1", { dataDir: path.join(home.storytreeHome, "pgdata"), setup: { homes: home.homes, storytreeHome: home.storytreeHome } }), async (agent) => {
        const checked = await agent.call("check_setup");
        assert.equal(checked.isError, false, checked.text);
        assert.deepEqual(checked.data.project, { status: "ask", suggestion: name });
        assert.equal(existsSync(path.join(folder, MARKER_FILE)), false, "no marker before a yes");
        assert.equal((await storytree.listProjects()).includes(name), false, "no project before a yes");

        const yes = await agent.call("set_up_project", { name });
        assert.equal(yes.isError, false, yes.text);
        assert.deepEqual(readJson(path.join(folder, MARKER_FILE)), { project: name });
        assert.ok((await storytree.listProjects()).includes(name), "the project, once the user said yes");
        assert.deepEqual((await agent.call("check_setup")).data.project, { status: "set up", name });
      });
    } finally {
      await storytree.close();
      await dropTestProjects([name]);
    }
  });
});

test("8.5 the agent fires a test of each hook, and the connection shows as verified only when storytree has received every one; until then it names the missing hook and the fix", async () => {
  const project = uniqueProjectName();
  await withTempDir(async (dir) => {
    const home = throwawayHome(dir);
    const folder = path.join(dir, "site");
    mkdirSync(folder);
    writeFileSync(path.join(folder, MARKER_FILE), `${JSON.stringify({ project })}\n`);
    const setup = { dataDir: path.join(home.storytreeHome, "pgdata"), setup: { homes: home.homes, storytreeHome: home.storytreeHome } };
    try {
      await withAgent(folder, claudeCode("claude-1", setup), async (agent) => {
        const check = async () => {
          const { verified, missing, fixes } = (await agent.call("check_setup")).data as { verified: boolean; missing: string[]; fixes: string[] };
          return { verified, missing, fixes };
        };
        assert.deepEqual(await check(), { verified: false, missing: ["session start", "file edit", "command"], fixes: ["new-session", "edit-check-file", "run-check-command"] });

        // The hooks fire, as Claude Code runs them for this session in this folder.
        await fireHook(home.storytreeHome, "claude-code", "session-start-startup", folder, "claude-1");
        assert.deepEqual((await check()).missing, ["file edit", "command"]);
        await fireHook(home.storytreeHome, "claude-code", "post-tool-use-write", folder, "claude-1");
        assert.deepEqual((await check()).missing, ["command"]);
        await fireHook(home.storytreeHome, "claude-code", "post-tool-use-bash", folder, "claude-1");
        assert.deepEqual(await check(), { verified: true, missing: [], fixes: [] });
      });

      // A Codex session whose hooks have not run is told the one fix that is Codex's own: its one-time approval.
      await withAgent(folder, codex("codex-1", setup), async (agent) => {
        const { verified, missing, fixes } = (await agent.call("check_setup")).data as { verified: boolean; missing: string[]; fixes: string[] };
        assert.deepEqual({ verified, missing }, { verified: false, missing: ["session start", "file edit", "command"] });
        assert.ok(fixes.includes("codex-approval"), `the fixes name Codex's approval: ${fixes.join(", ")}`);
      });
    } finally {
      await dropTestProjects([project]);
    }
  });
});

/** A port nothing on 127.0.0.1 listens on just now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** Whether something on 127.0.0.1:`port` accepts a connection within half a second. */
function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectTo({ port, host: "127.0.0.1", timeout: 500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Kill process `pid`, and wait until it has gone. */
async function stop(pid: number): Promise<void> {
  try {
    process.kill(pid);
  } catch {
    return; // already gone
  }
  for (let waited = 0; waited < 5_000; waited += 100) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Run the built hook as `harness` runs it, with a recorded input moved to `folder` and `session`. */
function fireHook(storytreeHome: string, harness: string, fixture: string, folder: string, session: string): Promise<void> {
  const input = { ...(readJson(path.join(FIXTURES, harness, `${fixture}.json`)) as object), cwd: folder, session_id: session };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript, harness], { env: { ...process.env, STORYTREE_HOME: storytreeHome }, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("exit", () => resolve());
    child.stdin.end(JSON.stringify(input));
  });
}
