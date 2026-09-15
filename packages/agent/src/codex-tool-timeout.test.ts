/**
 * inner-loop-exit-arc / codex-tool-timeout-follows-the-proof-bound (ADR-0570 D4): Codex's own
 * MCP tool-call timeout for a feedback run (`mcp_servers.spine.tool_timeout_sec`) must exceed the
 * longest `timeoutMs` bound any of its registered feedback commands carries, so Codex never
 * abandons a run the spine is still executing. See
 * `stories/agent/codex-tool-timeout-follows-the-proof-bound.md`.
 *
 * `CodexFeedbackCommand` (`codex-feedback-endpoint.ts`) is expected to gain an optional
 * `timeoutMs?: number` — the wall-clock bound the spine applies to that command's run, read but
 * never enforced by the endpoint itself. `CodexPhaseAuthor` (`codex-author.ts`) is expected to set
 * the tool timeout it hands `buildCodexExecArgs` to `max(900, ceil(longest / 1000) + 60)` seconds,
 * where `longest` is the largest `timeoutMs` among its feedback commands that is a positive finite
 * number, and `900` when no command carries one. Neither exists in source today:
 * `codex-author.ts` hardcodes `FEEDBACK_TOOL_TIMEOUT_SEC = 900` regardless of any command's
 * `timeoutMs`. Every assertion below reaches that hardcoded behaviour through the EXISTING,
 * exported `CodexPhaseAuthor` class and its already-existing `feedbackCommands` constructor field,
 * never through a symbol that does not exist yet, so the red is a genuine assertion failure rather
 * than a missing-export import failure.
 *
 * `commandWithTimeout` attaches the not-yet-declared `timeoutMs` field on a *non-literal* value (an
 * object spread returned from a function, not a fresh object literal handed straight to a typed
 * parameter), so no excess-property check fires today, and the same call keeps typechecking once
 * `CodexFeedbackCommand` actually declares the field (mirrors the `argsWithFeedback` trick in
 * `codex-author-feedback.test.ts`).
 *
 * `packages/agent` sits inside the mutation rung, so every expected config value is asserted by its
 * LITERAL string (e.g. `mcp_servers.spine.tool_timeout_sec=1260`), never computed in the test from
 * the rule under test. The runner need not call the endpoint — this contract cares only about the
 * exec arguments Codex is launched with, not about a live round trip through it.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { CodexPhaseAuthor } from "./codex-author.js";
import type { CodexCommand, CodexCommandResult, CodexRunner } from "./codex-author.js";
import type { CodexFeedbackCommand } from "./codex-feedback-endpoint.js";

const WRITE_GLOBS = {
  AUTHOR_TEST: ["packages/widget/src/**/*.test.ts"],
  IMPLEMENT: ["packages/widget/src/widget.ts"],
};
const PROMOTION_MANIFESTS = {
  AUTHOR_TEST: {
    allowedTargets: ["packages/widget/src/widget.test.ts"],
    requiredTargets: ["packages/widget/src/widget.test.ts"],
  },
  IMPLEMENT: {
    allowedTargets: ["packages/widget/src/widget.ts"],
    requiredTargets: ["packages/widget/src/widget.ts"],
  },
};

/** Real temp workspace: a source file to edit, plus a real `node_modules` for the link check. */
async function withFeedbackWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-tool-timeout-test-"));
  try {
    const sourceDir = path.join(root, "packages", "widget", "src");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "widget.ts"), "widget before\n");
    await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "marker.txt"), "installed dependency\n");
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function jsonl(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function successJsonl(): string {
  return jsonl(
    { type: "turn.started" },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
  );
}

function loginSuccess(): CodexCommandResult {
  return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
}

/**
 * Await under the test's OWN bound, as `within` does in `codex-author.test.ts`, so a change that
 * makes the author hang fails the test instead of hanging it.
 */
async function within<T>(pending: Promise<T>, ms = 10_000): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`did not settle within ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

function proofCommand(name: string): CodexFeedbackCommand {
  return {
    name,
    description: `Run ${name} against the replica.`,
    run: async () => ({ code: 0, stdout: "ok", stderr: "" }),
  };
}

/**
 * Attaches the not-yet-declared `timeoutMs` field onto a *non-literal* value, so it typechecks
 * today (structural assignability, no excess-property check on a function's return value) and keeps
 * typechecking once `CodexFeedbackCommand` declares the field with this exact shape.
 */
function commandWithTimeout(
  command: CodexFeedbackCommand,
  timeoutMs: number,
): CodexFeedbackCommand & { timeoutMs: number } {
  return { ...command, timeoutMs };
}

/**
 * Author one IMPLEMENT phase over `root` with the given feedback commands, and return the exec
 * command's full argv (never the login probe's) so a test can assert the literal
 * `mcp_servers.spine.tool_timeout_sec=<n>` config string itself.
 */
async function execArgsWithFeedbackCommands(
  root: string,
  commands: CodexFeedbackCommand[],
): Promise<string[]> {
  let execArgs: string[] | undefined;
  const runner: CodexRunner = async (command: CodexCommand) => {
    if (command.args[0] === "login") return loginSuccess();
    execArgs = command.args;
    await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
    return { code: 0, stdout: successJsonl(), stderr: "" };
  };

  const author = new CodexPhaseAuthor({
    cwd: root,
    writeGlobs: WRITE_GLOBS,
    promotionManifests: PROMOTION_MANIFESTS,
    isWriteAllowed: () => true,
    runner,
    feedbackCommands: commands,
  });

  const result = await within(author.author("IMPLEMENT", "Implement the widget."));
  assert.deepEqual(result, { ok: true }, "the phase authors and promotes successfully");
  assert.notEqual(execArgs, undefined, "the exec runner was invoked");
  return execArgs!;
}

test(
  "tool-timeout-exceeds-the-longest-proof-bound: a feedback command's declared timeoutMs raises " +
    "Codex's tool timeout to that bound (rounded up to whole seconds) plus 60 seconds of headroom",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        commandWithTimeout(proofCommand("run_proof"), 1_200_000),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=1260"),
        true,
        "a 1,200,000ms (1,200s) command bound raises the tool timeout to 1,200 + 60 = 1,260 seconds",
      );
    });
  },
);

test(
  "tool-timeout-exceeds-the-longest-proof-bound: the tool timeout tracks the LONGEST timeoutMs " +
    "among several feedback commands, not the first or the shortest one registered",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        commandWithTimeout(proofCommand("run_typecheck"), 300_000),
        commandWithTimeout(proofCommand("run_proof"), 1_200_000),
        commandWithTimeout(proofCommand("run_lint"), 600_000),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=1260"),
        true,
        "the longest of 300s/1,200s/600s bounds (1,200s) drives the tool timeout to 1,260 seconds",
      );
    });
  },
);

test(
  "tool-timeout-exceeds-the-longest-proof-bound: with no feedback command carrying a timeoutMs, " +
    "the tool timeout stays at the 900-second default",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        proofCommand("run_proof"),
        proofCommand("run_typecheck"),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=900"),
        true,
        "no command declares a timeoutMs, so the tool timeout is the 900-second default",
      );
    });
  },
);

test(
  "tool-timeout-exceeds-the-longest-proof-bound: a timeoutMs shorter than 900 seconds does not " +
    "lower the tool timeout below the 900-second floor",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        commandWithTimeout(proofCommand("run_proof"), 60_000),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=900"),
        true,
        "a 60,000ms (60s) command bound would compute to 60 + 60 = 120 seconds, well under the " +
          "900-second floor, so the floor value is used instead",
      );
    });
  },
);

test(
  "tool-timeout-exceeds-the-longest-proof-bound: a non-finite, zero or negative timeoutMs is " +
    "ignored rather than counted toward the longest bound",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        commandWithTimeout(proofCommand("run_zero"), 0),
        commandWithTimeout(proofCommand("run_negative"), -100),
        commandWithTimeout(proofCommand("run_nan"), Number.NaN),
        commandWithTimeout(proofCommand("run_infinite"), Number.POSITIVE_INFINITY),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=900"),
        true,
        "every declared timeoutMs is non-positive or non-finite, so none counts and the 900-second " +
          "default is used",
      );
    });
  },
);

test(
  "tool-timeout-exceeds-the-longest-proof-bound: a fractional-second timeoutMs is rounded UP to " +
    "whole seconds before the 60-second headroom is added",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const args = await execArgsWithFeedbackCommands(root, [
        commandWithTimeout(proofCommand("run_proof"), 900_001),
      ]);
      assert.equal(
        args.includes("mcp_servers.spine.tool_timeout_sec=961"),
        true,
        "900,001ms is 900.001s, which rounds UP to 901s; 901 + 60 = 961 seconds",
      );
    });
  },
);
