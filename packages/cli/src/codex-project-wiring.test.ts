import test from "node:test";
import assert from "node:assert/strict";

import * as fs from "node:fs";
import path from "node:path";

import { auditHookConfig, repoRoot } from "@storytree/drive";

type CommandHook = {
  type?: string;
  command?: string;
  commandWindows?: string;
  timeout?: number;
  async?: boolean;
};

type HookConfig = {
  hooks?: Record<string, Array<{ hooks?: CommandHook[] }>>;
  statusLine?: unknown;
};

const root = repoRoot();
const configFile = path.join(root, ".codex", "config.toml");
const hooksFile = path.join(root, ".codex", "hooks.json");
const agentsFile = path.join(root, "AGENTS.md");
const guideFile = path.join(root, "docs", "codex-onboarding.md");
const ambientHookFile = path.join(root, "packages", "cli", "ambient-hook.mjs");

function hooksFor(config: HookConfig, event: string): CommandHook[] {
  return (config.hooks?.[event] ?? []).flatMap((entry) => entry.hooks ?? []);
}

test("Codex's project instruction budget contains the whole generated AGENTS.md", () => {
  const config = fs.readFileSync(configFile, "utf8");
  const budgetMatch = /^project_doc_max_bytes\s*=\s*(\d+)\s*$/m.exec(config);
  assert.ok(budgetMatch, "the project config must set project_doc_max_bytes explicitly");

  const budget = Number(budgetMatch[1]);
  const guidanceBytes = fs.statSync(agentsFile).size;
  assert.ok(
    budget >= guidanceBytes,
    `Codex would truncate AGENTS.md: ${guidanceBytes} bytes of guidance exceed the ${budget}-byte project budget`,
  );
  assert.match(
    config,
    /^\[features\]\r?\nhooks\s*=\s*true\s*$/m,
    "the repository's reviewed lifecycle hooks must be explicitly enabled",
  );
});

test("Codex carries the compatible session-start mechanics without taking ownership of Claude surfaces", () => {
  const text = fs.readFileSync(hooksFile, "utf8");
  const config = JSON.parse(text) as HookConfig;
  const start = hooksFor(config, "SessionStart");

  assert.deepEqual(
    auditHookConfig(text),
    [],
    "notice-board automation must remain off blocking-capable hook events",
  );

  const expected: Array<[fragment: string, ceiling: number]> = [
    ["provision-worktree.mjs --hook", 300],
    ["ambient-hook.mjs start", 60],
    ["ambient-hook.mjs sweep", 60],
  ];
  for (const [fragment, ceiling] of expected) {
    const matches = start.filter((hook) => (hook.command ?? "").includes(fragment));
    assert.equal(matches.length, 1, `SessionStart must carry exactly one ${fragment} hook`);
    assert.ok(
      matches.every((hook) => typeof hook.timeout === "number" && hook.timeout <= ceiling),
      `${fragment} must keep its bounded timeout`,
    );
  }

  const forbiddenClaudeOnly = ["remote-session-setup", "worktree-health", "worktree-prune"];
  for (const fragment of forbiddenClaudeOnly) {
    assert.ok(
      start.every((hook) => !(hook.command ?? "").includes(fragment)),
      `${fragment} is Claude-owned and must not be copied into Codex's project hooks`,
    );
  }

  assert.ok(
    start.every((hook) => hook.commandWindows === undefined),
    "project hooks must resolve portable commands from PATH, not bake in one Windows installation path",
  );
  assert.ok(
    start.every((hook) => !(hook.command ?? "").startsWith("bash ")),
    "Codex hooks must not require a Unix shell on Windows",
  );
  assert.ok(fs.existsSync(ambientHookFile), "the portable ambient-hook launcher must be committed");
  const sweep = start.find((hook) => (hook.command ?? "").includes("ambient-hook.mjs sweep"));
  assert.equal(sweep?.async, true, "the activity sweep must use Codex's native background hook mode");
  assert.equal(config.statusLine, undefined, "Codex has no project status-line counterpart to copy");
});

test("Codex injects prompt-keyed Library definitions through UserPromptSubmit", () => {
  const config = JSON.parse(fs.readFileSync(hooksFile, "utf8")) as HookConfig;
  const promptHooks = hooksFor(config, "UserPromptSubmit");
  const definitions = promptHooks.filter((hook) =>
    (hook.command ?? "").includes("definition-injection.mjs"),
  );

  assert.equal(definitions.length, 1, "UserPromptSubmit must carry exactly one definition injector");
  assert.ok(
    definitions.every((hook) => typeof hook.timeout === "number" && hook.timeout <= 10),
    "prompt-time definition injection must stay fail-silent and tightly bounded",
  );
});

test("the single Codex journey documents native hooks and no longer claims they are unavailable", () => {
  const guide = fs.readFileSync(guideFile, "utf8");
  assert.doesNotMatch(guide, /Codex has no such hook|hooks that Codex has no equivalent of/);
  assert.match(guide, /\.codex\/hooks\.json/);
  assert.match(guide, /review and trust the project\s+hooks with `\/hooks`/);
});
