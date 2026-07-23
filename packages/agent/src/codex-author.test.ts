import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCodexExecArgs,
  CodexPhaseAuthor,
  DEFAULT_CODEX_MODEL,
  isChatGptManagedLogin,
  parseCodexJsonl,
  scrubMeteredCodexAuth,
} from "./codex-author.js";
import type {
  CodexCommand,
  CodexCommandResult,
  CodexRunner,
} from "./codex-author.js";
import { decideCodexToolUse } from "./codex-scope-hook.mjs";

const CWD = process.platform === "win32" ? "C:\\work\\tree" : "/work/tree";
const WRITE_GLOBS = {
  AUTHOR_TEST: ["packages/widget/src/**/*.test.ts"],
  IMPLEMENT: [
    "packages/widget/src/widget.ts",
    "packages/widget/src/helper.ts",
  ],
};
const PERMISSION_PATHS = {
  AUTHOR_TEST: ["packages/widget/src/widget.test.ts"],
  IMPLEMENT: ["packages/widget/src/widget.ts", "packages/widget/src/helper.ts"],
};

function jsonl(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function successJsonl(): string {
  return jsonl(
    { type: "thread.started", thread_id: "thread_1" },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: { id: "reason_1", type: "reasoning", text: "kept separate" },
    },
    {
      type: "item.completed",
      item: {
        id: "change_1",
        type: "file_change",
        changes: [{ path: "packages/widget/src/widget.test.ts", kind: "update" }],
        status: "completed",
      },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 120,
        cached_input_tokens: 80,
        cache_write_input_tokens: 7,
        output_tokens: 31,
        reasoning_output_tokens: 11,
      },
    },
  );
}

function captureRunner(results: CodexCommandResult[]): {
  runner: CodexRunner;
  commands: CodexCommand[];
} {
  const commands: CodexCommand[] = [];
  return {
    commands,
    runner: async (command) => {
      commands.push(command);
      const result = results.shift();
      assert.ok(result, "runner received an unexpected command");
      return result;
    },
  };
}

const chatGpt = (): CodexCommandResult => ({
  code: 0,
  stdout: "Logged in using ChatGPT\n",
  stderr: "",
});

const completed = (stdout = successJsonl()): CodexCommandResult => ({
  code: 0,
  stdout,
  stderr: "",
});

test("auth proof accepts only the exact ChatGPT-managed status", () => {
  assert.equal(isChatGptManagedLogin(chatGpt()), true);
  assert.equal(
    isChatGptManagedLogin({ code: 0, stdout: "", stderr: "Logged in using ChatGPT\n" }),
    true,
  );
  assert.equal(
    isChatGptManagedLogin({ code: 0, stdout: "Logged in using an API key\n", stderr: "" }),
    false,
  );
  assert.equal(
    isChatGptManagedLogin({ code: 0, stdout: "Not logged in\n", stderr: "" }),
    false,
  );
  assert.equal(
    isChatGptManagedLogin({
      code: 0,
      stdout: "Logged in using ChatGPT\nextra",
      stderr: "",
    }),
    false,
  );
  assert.equal(
    isChatGptManagedLogin({ code: 1, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    false,
  );
});

test("metered and access-token auth variables are scrubbed case-insensitively", () => {
  const env = scrubMeteredCodexAuth({
    PATH: "safe",
    OPENAI_API_KEY: "metered",
    codex_api_key: "metered-too",
    CoDeX_AcCeSs_ToKeN: "non-persisted",
    STORYTREE_OK: "yes",
  });
  assert.deepEqual(env, { PATH: "safe", STORYTREE_OK: "yes" });
});

test("API-key and unlogged states fail before codex exec with no fallback", async () => {
  for (const status of ["Logged in using an API key\n", "Not logged in\n"]) {
    const cap = captureRunner([{ code: 0, stdout: status, stderr: "" }]);
    const author = new CodexPhaseAuthor({
      cwd: CWD,
      writeGlobs: WRITE_GLOBS,
      isWriteAllowed: () => true,
      runner: cap.runner,
    });
    const result = await author.author("AUTHOR_TEST", "Write the red test.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /subscription auth required/);
    assert.equal(cap.commands.length, 1);
    assert.deepEqual(cap.commands[0]?.args, ["login", "status"]);
    assert.equal(author.runs.length, 0);
  }
});

test("exec selects Terra, one ephemeral JSON turn, and the replica-only OS sandbox", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    permissionPaths: PERMISSION_PATHS,
    isWriteAllowed: (_phase, rel) => rel === "packages/widget/src/widget.test.ts",
    runner: cap.runner,
    env: {
      PATH: process.env.PATH,
      OPENAI_API_KEY: "must-not-leak",
      CODEX_API_KEY: "must-not-leak",
      CODEX_ACCESS_TOKEN: "must-not-leak",
    },
  });

  assert.deepEqual(await author.author("AUTHOR_TEST", "Write the red test."), { ok: true });
  assert.equal(cap.commands.length, 2);
  for (const command of cap.commands) {
    assert.equal(command.env.OPENAI_API_KEY, undefined);
    assert.equal(command.env.CODEX_API_KEY, undefined);
    assert.equal(command.env.CODEX_ACCESS_TOKEN, undefined);
  }
  const exec = cap.commands[1];
  assert.ok(exec);
  assert.equal(exec.args[0], "exec");
  for (const required of [
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--dangerously-bypass-hook-trust",
  ]) {
    assert.ok(exec.args.includes(required), `missing ${required}`);
  }
  assert.equal(exec.args[exec.args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(exec.args.at(-1), "-");
  assert.equal(exec.args[exec.args.indexOf("--model") + 1], DEFAULT_CODEX_MODEL);
  assert.ok(exec.args.includes("--strict-config"));
  assert.ok(exec.args.includes('approval_policy="never"'));
  assert.ok(exec.args.some((arg) => arg === 'web_search="disabled"'));
  assert.ok(exec.args.some((arg) => arg === 'forced_login_method="chatgpt"'));
  assert.ok(exec.args.includes("sandbox_workspace_write.network_access=false"));
  if (process.platform === "win32") {
    assert.ok(exec.args.includes('windows.sandbox="elevated"'));
  }
  assert.ok(exec.args.some((arg) => arg.includes("hooks.PreToolUse=")));
  assert.match(exec.stdin ?? "", /Write the red test/);
  assert.match(exec.stdin ?? "", /deterministic spine/);
  assert.equal(author.runtime, "codex");
  assert.deepEqual(author.feedbackRuns, []);
});

test("custom model remains explicit and injected rendered phase prompt leads the brief", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    permissionPaths: PERMISSION_PATHS,
    isWriteAllowed: () => true,
    model: "gpt-5.6-terra-test",
    phasePrompts: {
      AUTHOR_TEST: "RENDERED RED BUILDER",
      IMPLEMENT: "RENDERED GREEN BUILDER",
    },
    runner: cap.runner,
  });
  await author.author("AUTHOR_TEST", "specific brief");
  const exec = cap.commands[1];
  assert.ok(exec);
  assert.equal(exec.args[exec.args.indexOf("--model") + 1], "gpt-5.6-terra-test");
  assert.ok(exec.stdin?.startsWith("RENDERED RED BUILDER\n\n## Phase brief\nspecific brief"));
});

test("real CLI path refuses a missing rendered phase prompt before auth or model", async () => {
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    permissionPaths: PERMISSION_PATHS,
    isWriteAllowed: () => true,
  });
  const result = await author.author("IMPLEMENT", "Implement it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /requires an injected rendered IMPLEMENT phase prompt/);
  assert.equal(author.runs.length, 0);
});

test("real CLI path also refuses an empty rendered phase prompt", async () => {
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    isWriteAllowed: () => true,
    phasePrompts: { AUTHOR_TEST: "red", IMPLEMENT: "   " },
  });
  const result = await author.author("IMPLEMENT", "Implement it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /requires an injected rendered IMPLEMENT phase prompt/);
});

test("real CLI path requires exact OS permission paths in addition to hook globs", async () => {
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    isWriteAllowed: () => true,
    phasePrompts: { AUTHOR_TEST: "red", IMPLEMENT: "green" },
  });
  const result = await author.author("AUTHOR_TEST", "Write it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /requires exact injected AUTHOR_TEST permission paths/);
});

test("command builder disables network, web, MCP, and agents inside the replica sandbox", () => {
  const args = buildCodexExecArgs({
    model: DEFAULT_CODEX_MODEL,
    cwd: CWD,
    hookPath: `${CWD}${pathSeparator()}scope-hook.mjs`,
  });
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(args.includes("--add-dir"), false);
  assert.ok(args.includes("sandbox_workspace_write.network_access=false"));
  assert.ok(args.includes("mcp_servers={}"));
  assert.ok(args.includes("agents.enabled=false"));
  assert.ok(args.includes("features.hooks=true"));
  assert.ok(args.includes("features.apps=false"));
  assert.ok(args.includes("features.remote_plugin=false"));
  assert.ok(args.includes("features.multi_agent=false"));
  assert.ok(args.includes("features.shell_tool=true"));
  assert.ok(args.includes("features.unified_exec=false"));
});

function pathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function hook(
  phase: "AUTHOR_TEST" | "IMPLEMENT",
  tool_name: string,
  tool_input: unknown,
) {
  return decideCodexToolUse({
    phase,
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    event: { hook_event_name: "PreToolUse", tool_name, tool_input },
  });
}

test("scope hook denies Bash, unified exec, MCP, Agent, and unknown local tools", () => {
  for (const tool of [
    "Bash",
    "exec_command",
    "unified_exec",
    "mcp__filesystem__write_file",
    "Agent",
    "update_plan",
  ]) {
    const decision = hook("AUTHOR_TEST", tool, {});
    assert.equal(decision.allow, false, `${tool} should be denied`);
  }
});

test("scope hook process exits 2 and emits its deny reason", () => {
  const hookPath = fileURLToPath(new URL("./codex-scope-hook.mjs", import.meta.url));
  const policy = Buffer.from(
    JSON.stringify({
      phase: "AUTHOR_TEST",
      cwd: process.cwd(),
      writeGlobs: WRITE_GLOBS,
    }),
  ).toString("base64url");
  const result = spawnSync(process.execPath, [hookPath], {
    cwd: process.cwd(),
    env: { ...process.env, STORYTREE_CODEX_HOOK_POLICY: policy },
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo no" },
    }),
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /shell and unified execution are unavailable/);
});

test("scope hook allows only its small explicit read-only allowlist", () => {
  for (const tool of ["Read", "Glob", "Grep", "read_file", "list_dir", "list_files"]) {
    assert.deepEqual(hook("IMPLEMENT", tool, {}), { allow: true, tool, paths: [] });
  }
});

test("scope hook inspects every apply_patch path and enforces the active phase", () => {
  const allowed = hook("AUTHOR_TEST", "apply_patch", {
    patch:
      "*** Begin Patch\n" +
      "*** Add File: packages/widget/src/new.test.ts\n" +
      "+test\n" +
      "*** Update File: packages/widget/src/widget.test.ts\n" +
      "@@\n" +
      "-old\n" +
      "+new\n" +
      "*** End Patch",
  });
  assert.equal(allowed.allow, true);

  const wrongPhase = hook("IMPLEMENT", "apply_patch", {
    patch:
      "*** Begin Patch\n" +
      "*** Update File: packages/widget/src/widget.test.ts\n" +
      "@@\n-old\n+new\n" +
      "*** End Patch",
  });
  assert.equal(wrongPhase.allow, false);

  const mixed = hook("AUTHOR_TEST", "apply_patch", {
    patch:
      "*** Begin Patch\n" +
      "*** Update File: packages/widget/src/widget.test.ts\n" +
      "@@\n-old\n+new\n" +
      "*** Update File: packages/widget/src/widget.ts\n" +
      "@@\n-old\n+new\n" +
      "*** End Patch",
  });
  assert.equal(mixed.allow, false);
  assert.match(mixed.allow ? "" : mixed.reason, /widget\.ts/);
});

test("scope hook handles Write/Edit and fails closed on malformed, outside, and ambiguous paths", () => {
  assert.equal(
    hook("IMPLEMENT", "Write", { file_path: "packages/widget/src/widget.ts" }).allow,
    true,
  );
  assert.equal(
    hook("IMPLEMENT", "Edit", { path: "packages/widget/src/helper.ts" }).allow,
    true,
  );
  assert.equal(hook("IMPLEMENT", "Write", {}).allow, false);
  assert.equal(hook("IMPLEMENT", "Write", { path: "../outside.ts" }).allow, false);
  assert.equal(
    hook("IMPLEMENT", "apply_patch", {
      patch: "--- a/packages/widget/src/widget.ts\n+++ b/packages/widget/src/widget.ts",
    }).allow,
    false,
  );
  assert.equal(
    decideCodexToolUse({
      phase: "IMPLEMENT",
      cwd: CWD,
      writeGlobs: WRITE_GLOBS,
      event: "not an event",
    }).allow,
    false,
  );
});

test("successful JSONL maps usage and reasoning without a price field", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    permissionPaths: PERMISSION_PATHS,
    isWriteAllowed: () => true,
    runner: cap.runner,
  });
  assert.deepEqual(await author.author("AUTHOR_TEST", "Write it."), { ok: true });
  assert.deepEqual(author.runs, [
    {
      source: "codex-leaf",
      phase: "AUTHOR_TEST",
      subtype: "success",
      turns: 1,
      model: DEFAULT_CODEX_MODEL,
      usage: {
        inputTokens: 120,
        cacheCreationInputTokens: 7,
        cacheReadInputTokens: 80,
        outputTokens: 31,
      },
      reasoningOutputTokens: 11,
      reasoning: ["kept separate"],
      changedPaths: ["packages/widget/src/widget.test.ts"],
    },
  ]);
  assert.equal("costUsd" in (author.runs[0] ?? {}), false);
});

test("quota and auth failures are ordinary fail-closed errors with no API fallback", async () => {
  const quota = jsonl(
    { type: "thread.started", thread_id: "thread_1" },
    { type: "turn.started" },
    { type: "turn.failed", error: { message: "subscription quota exhausted" } },
  );
  const cap = captureRunner([
    chatGpt(),
    { code: 1, stdout: quota, stderr: "subscription quota exhausted" },
  ]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    isWriteAllowed: () => true,
    runner: cap.runner,
  });
  const result = await author.author("IMPLEMENT", "Implement it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /subscription quota exhausted/);
  assert.equal(result.ok ? undefined : result.exhausted, undefined);
  assert.equal(cap.commands.length, 2);
  assert.equal(author.runs[0]?.subtype, "error");
});

test("malformed/multiple/missing JSONL turns fail closed", () => {
  assert.match(parseCodexJsonl("not-json\n").error ?? "", /malformed Codex JSONL/);
  assert.match(
    parseCodexJsonl(jsonl({ type: "turn.started" })).error ?? "",
    /exactly one turn/,
  );
  assert.match(
    parseCodexJsonl(
      jsonl(
        { type: "turn.started" },
        { type: "turn.started" },
        {
          type: "turn.completed",
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      ),
    ).error ?? "",
    /exactly one turn/,
  );
});

test("injected predicate catches an unexpected reported write as defense in depth", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    permissionPaths: PERMISSION_PATHS,
    isWriteAllowed: () => false,
    runner: cap.runner,
  });
  const result = await author.author("AUTHOR_TEST", "Write it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /scope was violated/);
  assert.equal(author.violations[0]?.tool, "file_change");
  assert.equal(author.runs[0]?.subtype, "error");
});
