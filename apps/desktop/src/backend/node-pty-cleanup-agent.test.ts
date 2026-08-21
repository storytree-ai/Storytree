// Windows regression for the real node-pty helper Electron invokes while disposing a ConPTY.
// node-pty starts this helper and immediately tears the pseudoconsole down; when the shell wins that
// race, AttachConsole sees an absent pid. The helper must answer with the same shell-pid fallback its
// parent uses on timeout instead of throwing an unhandled error onto Electron's stderr.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test(
  "node-pty cleanup: an already-gone Windows shell falls back without AttachConsole stderr",
  { timeout: 10_000 },
  async () => {
    if (process.platform !== "win32") {
      assert.notEqual(process.platform, "win32");
      return;
    }

    const nodePtyEntry = require.resolve("node-pty");
    const agentPath = join(dirname(nodePtyEntry), "conpty_console_list_agent.js");
    // Windows process ids are currently bounded well below this value, so AttachConsole must take
    // the same absent-shell path seen when Electron closes the live terminal before this helper runs.
    const absentShellPid = 2_147_483_647;

    const result = await new Promise<{
      code: number | null;
      message: unknown;
      stderr: string;
    }>((resolve, reject) => {
      const child = fork(agentPath, [String(absentShellPid)], { silent: true });
      let message: unknown;
      let stderr = "";
      child.on("message", (value) => {
        message = value;
      });
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, message, stderr }));
    });

    assert.equal(result.code, 0, `cleanup helper stderr:\n${result.stderr}`);
    assert.deepEqual(result.message, { consoleProcessList: [absentShellPid] });
    assert.doesNotMatch(result.stderr, /AttachConsole failed/);
  },
);
