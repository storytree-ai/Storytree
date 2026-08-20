import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import {
  buildCodexExecArgs,
  CODEX_EXECUTABLE_ENV,
  CodexPhaseAuthor,
  codexProductionReplicaRoot,
  DEFAULT_CODEX_MODEL,
  genericPhasePrompt,
  isChatGptManagedLogin,
  parseCodexJsonl,
  prepareCodexDisposableReplica,
  runPinnedCodexCli,
  scrubMeteredCodexAuth,
} from "./codex-author.js";
import type {
  CodexCommand,
  CodexCommandResult,
  CodexRunner,
} from "./codex-author.js";

const CWD = process.platform === "win32" ? "C:\\work\\tree" : "/work/tree";
const WRITE_GLOBS = {
  AUTHOR_TEST: ["packages/widget/src/**/*.test.ts"],
  IMPLEMENT: [
    "packages/widget/src/widget.ts",
    "packages/widget/src/helper.ts",
  ],
};
const PROMOTION_MANIFESTS = {
  AUTHOR_TEST: {
    allowedTargets: ["packages/widget/src/widget.test.ts"],
    requiredTargets: ["packages/widget/src/widget.test.ts"],
  },
  IMPLEMENT: {
    allowedTargets: ["packages/widget/src/widget.ts", "packages/widget/src/helper.ts"],
    requiredTargets: ["packages/widget/src/widget.ts"],
  },
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

function completedJsonl(reportedPaths: string[] = []): string {
  return jsonl(
    { type: "thread.started", thread_id: "thread_1" },
    { type: "turn.started" },
    ...(
      reportedPaths.length === 0
        ? []
        : [{
            type: "item.completed",
            item: {
              id: "change_1",
              type: "file_change",
              changes: reportedPaths.map((reportedPath) => ({
                path: reportedPath,
                kind: "update",
              })),
              status: "completed",
            },
          }]
    ),
    {
      type: "turn.completed",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  );
}

test("the production generic phase prompt preserves spine-owned proof authority", () => {
  assert.match(genericPhasePrompt("AUTHOR_TEST"), /Do not run tests or claim a verdict/);
  assert.match(genericPhasePrompt("IMPLEMENT"), /IMPLEMENT phase leaf/);
});

test("the production pinned Codex runner reaches the repository-pinned executable", async () => {
  const result = await runPinnedCodexCli({
    args: ["--version"],
    cwd: process.cwd(),
    env: { ...process.env },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^codex-cli \d+\.\d+\.\d+/);
});

test("the production runner can select one absolute administrator-managed executable", async () => {
  const result = await runPinnedCodexCli({
    args: ["--version"],
    cwd: process.cwd(),
    env: { ...process.env, [CODEX_EXECUTABLE_ENV]: process.execPath },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^v\d+\./);
  await assert.rejects(
    runPinnedCodexCli({
      args: ["--version"],
      cwd: process.cwd(),
      env: { ...process.env, [CODEX_EXECUTABLE_ENV]: "relative/codex" },
    }),
    /must name an absolute executable/,
  );
});

test("production replica stays in the ignored claimed-worktree subtree without nested Git", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-production-replica-"));
  try {
    await fs.mkdir(path.join(root, ".git"));
    await fs.mkdir(path.join(root, ".gate-logs", "old-run"), { recursive: true });
    await fs.mkdir(path.join(root, "packages", "widget"), { recursive: true });
    await fs.writeFile(path.join(root, "packages", "widget", "index.ts"), "export {};\n");
    await fs.writeFile(path.join(root, ".gate-logs", "old-run", "gate.log"), "old\n");

    const replica = await prepareCodexDisposableReplica(root, false);
    try {
      assert.equal(path.dirname(replica.dir), codexProductionReplicaRoot(root));
      assert.equal(await fs.readFile(path.join(replica.dir, "packages", "widget", "index.ts"), "utf8"), "export {};\n");
      await assert.rejects(fs.stat(path.join(replica.dir, ".git")));
      await assert.rejects(fs.stat(path.join(replica.dir, ".gate-logs")));
    } finally {
      await fs.rm(replica.dir, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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

test("exec selects Terra and one ephemeral JSON turn without retired managed containment", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    promotionManifests: PROMOTION_MANIFESTS,
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
  ]) {
    assert.ok(exec.args.includes(required), `missing ${required}`);
  }
  assert.equal(exec.args[exec.args.indexOf("--sandbox") + 1], "danger-full-access");
  assert.equal(exec.args.includes("--dangerously-bypass-hook-trust"), false);
  assert.equal(exec.args.at(-1), "-");
  assert.equal(exec.args[exec.args.indexOf("--model") + 1], DEFAULT_CODEX_MODEL);
  assert.ok(exec.args.includes("--strict-config"));
  assert.ok(exec.args.includes('approval_policy="never"'));
  assert.ok(exec.args.some((arg) => arg === 'web_search="disabled"'));
  assert.ok(exec.args.some((arg) => arg === 'forced_login_method="chatgpt"'));
  assert.equal(exec.args.some((arg) => arg.startsWith("default_permissions=")), false);
  assert.equal(exec.args.some((arg) => arg.startsWith("sandbox_workspace_write.")), false);
  assert.equal(exec.args.some((arg) => arg.startsWith("hooks.PreToolUse=")), false);
  assert.equal(exec.args.includes("features.hooks=true"), false);
  assert.ok(exec.args.includes("features.hooks=false"));
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
    promotionManifests: PROMOTION_MANIFESTS,
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
    promotionManifests: PROMOTION_MANIFESTS,
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

test("real CLI path requires an exact promotion manifest in addition to hook globs", async () => {
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    isWriteAllowed: () => true,
    phasePrompts: { AUTHOR_TEST: "red", IMPLEMENT: "green" },
  });
  const result = await author.author("AUTHOR_TEST", "Write it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /requires an exact AUTHOR_TEST promotion manifest/);
});

test("promotion manifests reject wildcards, normalized duplicates, and required paths outside the allowed set", async () => {
  const malformed = [
    {
      allowedTargets: ["packages/widget/src/*.ts"],
      requiredTargets: ["packages/widget/src/widget.ts"],
    },
    {
      allowedTargets: ["packages/widget/src/widget.ts", "packages/widget/src/./widget.ts"],
      requiredTargets: ["packages/widget/src/widget.ts"],
    },
    {
      allowedTargets: ["packages/widget/src/helper.ts"],
      requiredTargets: ["packages/widget/src/widget.ts"],
    },
    {
      allowedTargets: ["packages/widget/src/Widget.ts", "packages/widget/src/widget.ts"],
      requiredTargets: ["packages/widget/src/widget.ts"],
    },
    {
      allowedTargets: ["packages/widget/src/widget.ts."],
      requiredTargets: ["packages/widget/src/widget.ts."],
    },
    {
      allowedTargets: ["packages/widget/src/helper.ts "],
      requiredTargets: ["packages/widget/src/helper.ts "],
    },
    {
      allowedTargets: ["packages/widget/src/COM1.log"],
      requiredTargets: ["packages/widget/src/COM1.log"],
    },
  ];
  for (const manifest of malformed) {
    const cap = captureRunner([]);
    const author = new CodexPhaseAuthor({
      cwd: CWD,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: {
        AUTHOR_TEST: PROMOTION_MANIFESTS.AUTHOR_TEST,
        IMPLEMENT: manifest,
      },
      isWriteAllowed: () => true,
      phasePrompts: { AUTHOR_TEST: "red", IMPLEMENT: "green" },
      runner: cap.runner,
    });
    const result = await author.author("IMPLEMENT", "Implement it.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /promotion manifest is malformed/);
    assert.equal(cap.commands.length, 0, "invalid manifests must refuse before auth");
  }
});

async function withReplicaWorkspace(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-author-test-"));
  try {
    const sourceDir = path.join(root, "packages", "widget", "src");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "widget.ts"), "widget before\n");
    await fs.writeFile(path.join(sourceDir, "helper.ts"), "helper before\n");
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function mutatingRunner(
  mutate: (replica: string) => Promise<void>,
  reportedPaths: string[] = [],
): CodexRunner {
  return async (command) => {
    if (command.args[0] === "login") return chatGpt();
    await mutate(command.cwd);
    return completed(completedJsonl(reportedPaths));
  };
}

test("filesystem-observed allowed changes promote as one multi-file phase even when Codex reports none", async () => {
  await withReplicaWorkspace(async (root) => {
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.writeFile(path.join(replica, "packages/widget/src/helper.ts"), "helper after\n");
      }),
    });

    assert.deepEqual(await author.author("IMPLEMENT", "Implement both files."), { ok: true });
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget after\n");
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/helper.ts"), "utf8"), "helper after\n");
    assert.deepEqual(author.runs[0]?.changedPaths, [
      "packages/widget/src/helper.ts",
      "packages/widget/src/widget.ts",
    ]);
  });
});

test("observed allowed additions and deletions promote while an unchanged declared target is untouched", async () => {
  await withReplicaWorkspace(async (root) => {
    const untouched = path.join(root, "packages/widget/src/untouched.ts");
    await fs.writeFile(untouched, "untouched\n");
    await fs.utimes(untouched, new Date(946684800000), new Date(946684800000));
    const before = await fs.stat(untouched);
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: {
        AUTHOR_TEST: PROMOTION_MANIFESTS.AUTHOR_TEST,
        IMPLEMENT: {
          allowedTargets: [
            "packages/widget/src/widget.ts",
            "packages/widget/src/helper.ts",
            "packages/widget/src/new.ts",
            "packages/widget/src/untouched.ts",
          ],
          requiredTargets: ["packages/widget/src/widget.ts"],
        },
      },
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.rm(path.join(replica, "packages/widget/src/helper.ts"));
        await fs.writeFile(path.join(replica, "packages/widget/src/new.ts"), "new\n");
      }),
    });

    assert.deepEqual(await author.author("IMPLEMENT", "Apply the bounded rename-shaped edit."), { ok: true });
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/new.ts"), "utf8"), "new\n");
    await assert.rejects(fs.readFile(path.join(root, "packages/widget/src/helper.ts")));
    assert.deepEqual(author.runs[0]?.changedPaths, [
      "packages/widget/src/helper.ts",
      "packages/widget/src/new.ts",
      "packages/widget/src/widget.ts",
    ]);
    const after = await fs.stat(untouched);
    assert.equal(after.mtimeMs, before.mtimeMs);
  });
});

test("one observed unlisted path refuses the whole phase before any allowed file is copied", async () => {
  await withReplicaWorkspace(async (root) => {
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(
        async (replica) => {
          await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
          await fs.writeFile(path.join(replica, "packages/widget/src/unlisted.ts"), "escape\n");
        },
        ["packages/widget/src/widget.ts"],
      ),
    });

    const result = await author.author("IMPLEMENT", "Attempt both files.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /unlisted\.ts/);
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget before\n");
    await assert.rejects(fs.readFile(path.join(root, "packages/widget/src/unlisted.ts")));
  });
});

test("case-distinct observed paths never inherit permission from a differently-cased manifest entry", async (t) => {
  await withReplicaWorkspace(async (root) => {
    const probe = path.join(root, "packages/widget/src/Widget.ts");
    await fs.writeFile(probe, "case probe\n");
    const lowerContent = await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8");
    if (lowerContent === "case probe\n") {
      t.skip("filesystem is case-insensitive; manifest collision refusal covers this platform");
      return;
    }
    await fs.rm(probe);
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.writeFile(path.join(replica, "packages/widget/src/Widget.ts"), "case escape\n");
      }),
    });

    const result = await author.author("IMPLEMENT", "Attempt a case-distinct extra path.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /Widget\.ts/);
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget before\n");
    await assert.rejects(fs.readFile(probe));
  });
});

test("a multiply-linked real target is refused before promotion can mutate its undeclared sibling", async () => {
  await withReplicaWorkspace(async (root) => {
    const target = path.join(root, "packages/widget/src/widget.ts");
    const sibling = path.join(root, "packages/widget/src/undeclared-sibling.ts");
    await fs.link(target, sibling);
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
      }),
    });

    const result = await author.author("IMPLEMENT", "Change the linked target.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /hard links/);
    assert.equal(await fs.readFile(target, "utf8"), "widget before\n");
    assert.equal(await fs.readFile(sibling, "utf8"), "widget before\n");
  });
});

test("partial apply attempts every rollback target and reports all restore failures honestly", async () => {
  await withReplicaWorkspace(async (root) => {
    const restoreAttempts: string[] = [];
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.writeFile(path.join(replica, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.writeFile(path.join(replica, "packages/widget/src/helper.ts"), "helper after\n");
      }),
      promotionFaults: {
        afterApply: (_relPath, appliedCount) => {
          if (appliedCount === 1) throw new Error("injected apply failure");
        },
        beforeRestore: (relPath) => {
          restoreAttempts.push(relPath);
          throw new Error(`injected restore failure for ${relPath}`);
        },
      },
    });

    const result = await author.author("IMPLEMENT", "Exercise atomic rollback.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /injected apply failure/);
    assert.match(result.ok ? "" : result.error, /rollback incomplete after attempting every target/);
    assert.match(result.ok ? "" : result.error, /helper\.ts: injected restore failure/);
    assert.match(result.ok ? "" : result.error, /widget\.ts: injected restore failure/);
    assert.deepEqual(restoreAttempts, [
      "packages/widget/src/widget.ts",
      "packages/widget/src/helper.ts",
    ]);
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/helper.ts"), "utf8"), "helper after\n");
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget before\n");
  });
});

test("a missing required output refuses the whole phase and preserves the real workspace", async () => {
  await withReplicaWorkspace(async (root) => {
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async (replica) => {
        await fs.rm(path.join(replica, "packages/widget/src/widget.ts"));
        await fs.writeFile(path.join(replica, "packages/widget/src/helper.ts"), "helper after\n");
      }),
    });

    const result = await author.author("IMPLEMENT", "Delete the required target.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /required target.*missing.*widget\.ts/i);
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget before\n");
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/helper.ts"), "utf8"), "helper before\n");
  });
});

test("reported changes without an observed replica diff are not promotion evidence", async () => {
  await withReplicaWorkspace(async (root) => {
    const author = new CodexPhaseAuthor({
      cwd: root,
      writeGlobs: WRITE_GLOBS,
      promotionManifests: PROMOTION_MANIFESTS,
      isWriteAllowed: () => true,
      runner: mutatingRunner(async () => undefined, ["packages/widget/src/widget.ts"]),
    });

    const result = await author.author("IMPLEMENT", "Claim a change without making one.");
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /without an observed required target change/);
    assert.equal(await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"), "widget before\n");
  });
});

test("command builder uses no managed profile or hook and disables optional surfaces", () => {
  const args = buildCodexExecArgs({
    model: DEFAULT_CODEX_MODEL,
    cwd: CWD,
  });
  assert.equal(args[args.indexOf("--sandbox") + 1], "danger-full-access");
  assert.equal(args.includes("--add-dir"), false);
  assert.equal(args.some((arg) => arg.startsWith("default_permissions=")), false);
  assert.equal(args.some((arg) => arg.startsWith("sandbox_workspace_write.")), false);
  assert.equal(args.some((arg) => arg.startsWith("hooks.")), false);
  assert.equal(args.includes("--dangerously-bypass-hook-trust"), false);
  assert.ok(args.includes("mcp_servers={}"));
  assert.ok(args.includes("agents.enabled=false"));
  assert.equal(args.includes("features.hooks=true"), false);
  assert.ok(args.includes("features.hooks=false"));
  assert.ok(args.includes("features.apps=false"));
  assert.ok(args.includes("features.remote_plugin=false"));
  assert.ok(args.includes("features.multi_agent=false"));
  assert.ok(args.includes("features.shell_tool=true"));
  assert.ok(args.includes("features.unified_exec=false"));
});

test("successful JSONL maps usage and reasoning without a price field", async () => {
  const cap = captureRunner([chatGpt(), completed()]);
  const author = new CodexPhaseAuthor({
    cwd: CWD,
    writeGlobs: WRITE_GLOBS,
    promotionManifests: PROMOTION_MANIFESTS,
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
    promotionManifests: PROMOTION_MANIFESTS,
    isWriteAllowed: () => false,
    runner: cap.runner,
  });
  const result = await author.author("AUTHOR_TEST", "Write it.");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /promotion refused in full/);
  assert.equal(author.violations[0]?.tool, "file_change");
  assert.equal(author.runs[0]?.subtype, "error");
});
