/**
 * inner-loop-exit-arc / codex-author-arms-feedback: a `CodexPhaseAuthor` constructed with feedback
 * commands lets the leaf run the spine's proof against its own disposable replica during a phase,
 * and leaves nothing open behind the phase. See
 * `stories/agent/codex-author-arms-feedback.md`.
 *
 * `CodexPhaseAuthorArgs` is expected to gain an optional `feedbackCommands` field (mirroring
 * `ClaudeAgentAuthorArgs.feedbackCommands` in `sdk-author.ts`) that wires:
 *   - a loopback MCP feedback endpoint (`openCodexFeedbackEndpoint`, already built),
 *   - the replica's linked dependencies (`linkReplicaDependencies`, already built), and
 *   - the exec command's bound suspended around each feedback run (`CodexCommand.bound`, already
 *     built).
 * None of that wiring exists in `codex-author.ts` yet — `feedbackRuns`/`feedbackToolNames` are
 * hardcoded empty-tuple fields today. Every assertion below reaches the missing behaviour through
 * the EXISTING, exported `CodexPhaseAuthor` class and its already-existing constructor, never
 * through a symbol that does not exist yet, so the red is a genuine assertion failure rather than a
 * missing-export import failure.
 *
 * `argsWithFeedback` attaches the not-yet-declared field on a *non-literal* value (a function
 * return, not a fresh object literal handed straight to `new CodexPhaseAuthor(...)`), so no excess
 * property check fires today, and the same call keeps typechecking once `CodexPhaseAuthorArgs`
 * actually declares the field (mirrors the `withBound` cast trick in `codex-bound-suspend.test.ts`,
 * but here structural typing alone suffices — no cast needed).
 *
 * `packages/agent` sits inside the mutation rung, so every operator-facing string is asserted by its
 * LITERAL value rather than through an exported constant: `mcp_servers={}`,
 * `mcp_servers.spine.url`, `mcp_servers.spine.bearer_token_env_var`, `STORYTREE_SPINE_MCP_TOKEN`,
 * the `spine` server name and `mcp__spine__run_proof`.
 *
 * Every assertion that could otherwise be swallowed by production's own try/catch (inside the
 * feedback command's `run`, or inside the injected exec runner) is deferred to the test body itself
 * — never thrown from inside those callbacks, where `executeFeedback`/`author()` would catch it and
 * turn it into a graceful error result instead of a failing test.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { CodexPhaseAuthor } from "./codex-author.js";
import type {
  CodexCommand,
  CodexCommandResult,
  CodexPhaseAuthorArgs,
  CodexRunner,
} from "./codex-author.js";
import type { CodexFeedbackCommand } from "./codex-feedback-endpoint.js";
import type { AuthorResult } from "./phase-author.js";

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-author-feedback-test-"));
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

/** Read one `--config key=value` pair out of a Codex exec argv, unwrapping a quoted value. */
function configValue(args: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === "--config" && value !== undefined && value.startsWith(prefix)) {
      const raw = value.slice(prefix.length);
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
  }
  return undefined;
}

function loginSuccess(): CodexCommandResult {
  return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
}

/**
 * Attaches the not-yet-declared `feedbackCommands` field onto a *non-literal* value, so it
 * typechecks today (structural assignability, no excess-property check on a call result) and keeps
 * typechecking once `CodexPhaseAuthorArgs` declares the field with this exact shape.
 */
function argsWithFeedback(
  args: CodexPhaseAuthorArgs,
  feedbackCommands: CodexFeedbackCommand[],
): CodexPhaseAuthorArgs & { feedbackCommands: CodexFeedbackCommand[] } {
  return { ...args, feedbackCommands };
}

/**
 * Await under the test's OWN bound, as `within` does in `codex-author.test.ts`, so a change that makes
 * the endpoint or the author hang fails the test instead of hanging it.
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

/** One real HTTP round trip a Codex `exec` process would make against the loopback endpoint. */
async function invokeRunProofOverHttp(url: string, token: string): Promise<void> {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  await within(
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    5_000,
  );
  await within(
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "run_proof", arguments: {} },
      }),
    }),
    5_000,
  );
}

/**
 * True once a POST to `url` can no longer connect (the endpoint has been closed), false if it is
 * answered. An endpoint that takes the connection and never answers fails the bound instead of
 * passing as closed.
 */
async function cannotConnect(url: string): Promise<boolean> {
  return await within(
    fetch(url, { method: "POST" }).then(
      () => false,
      () => true,
    ),
    5_000,
  );
}

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: a feedback command runs against the " +
    "replica's own root with the leaf's bound suspended for its duration, the leaf is exposed " +
    "exactly one mcp__spine__ tool, the run is recorded, only the required target is promoted, the " +
    "token never leaks into argv, and the endpoint is unreachable once author() returns",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const timeline: string[] = [];
      const runObservations: { root: string; nodeModulesIsLink: boolean }[] = [];
      const execCalls: CodexCommand[] = [];
      let capturedUrl: string | undefined;
      let capturedTokenEnvVar: string | undefined;
      let capturedToolTimeoutSec: number | undefined;

      const feedbackCommand: CodexFeedbackCommand = {
        name: "run_proof",
        description: "Run the spine's package proof against the replica.",
        run: async (replicaRoot) => {
          const stat = await fs.lstat(path.join(replicaRoot, "node_modules")).catch(() => undefined);
          runObservations.push({ root: replicaRoot, nodeModulesIsLink: stat?.isSymbolicLink() ?? false });
          timeline.push("feedback-run");
          return { code: 0, stdout: "proof ok", stderr: "" };
        },
      };

      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        execCalls.push(command);

        const url = configValue(command.args, "mcp_servers.spine.url");
        const tokenEnvVar = configValue(command.args, "mcp_servers.spine.bearer_token_env_var");
        const toolTimeoutSecRaw = configValue(command.args, "mcp_servers.spine.tool_timeout_sec");
        capturedUrl = url;
        capturedTokenEnvVar = tokenEnvVar;
        capturedToolTimeoutSec = toolTimeoutSecRaw === undefined ? undefined : Number(toolTimeoutSecRaw);

        if (url !== undefined) {
          if (command.bound !== undefined) {
            command.bound.suspend = () => timeline.push("suspend");
            command.bound.resume = () => timeline.push("resume");
          }
          const token = tokenEnvVar === undefined ? undefined : command.env[tokenEnvVar];
          if (token !== undefined) {
            await invokeRunProofOverHttp(url, token);
          }
        }

        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };

      const author = new CodexPhaseAuthor(
        argsWithFeedback(
          {
            cwd: root,
            writeGlobs: WRITE_GLOBS,
            promotionManifests: PROMOTION_MANIFESTS,
            isWriteAllowed: () => true,
            runner,
          },
          [feedbackCommand],
        ),
      );

      assert.deepEqual(
        author.feedbackToolNames,
        ["mcp__spine__run_proof"],
        "feedbackToolNames lists mcp__spine__<name> per registered feedback command",
      );

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true }, "the phase authors and promotes successfully");

      assert.equal(runObservations.length, 1, "the feedback command's run was invoked exactly once");
      const observed = runObservations[0];
      assert.notEqual(observed, undefined);
      assert.notEqual(
        observed?.root,
        root,
        "run() received the replica's root, never the real workspace",
      );
      assert.equal(
        observed?.nodeModulesIsLink,
        true,
        "the replica's node_modules was a link when the feedback command ran",
      );

      assert.deepEqual(
        timeline,
        ["suspend", "feedback-run", "resume"],
        "the leaf's bound was suspended for the run's duration and resumed after it",
      );

      assert.deepEqual(
        author.feedbackRuns,
        [{ phase: "IMPLEMENT", tool: "run_proof", code: 0 }],
        "feedbackRuns holds the one run with its phase, tool and exit code",
      );

      assert.equal(
        await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"),
        "widget after\n",
        "the phase promoted exactly its required target into the real workspace",
      );
      const changedPaths = author.runs[0]?.changedPaths ?? [];
      assert.equal(
        changedPaths.includes("node_modules"),
        false,
        "no node_modules path appears among the run record's changed paths",
      );

      assert.equal(
        capturedTokenEnvVar,
        "STORYTREE_SPINE_MCP_TOKEN",
        "the exec arguments name the fixed token environment variable",
      );
      const exec = execCalls[0];
      assert.notEqual(exec, undefined);
      const tokenValue = capturedTokenEnvVar === undefined ? undefined : exec?.env[capturedTokenEnvVar];
      assert.equal(typeof tokenValue, "string", "the token value appeared in the exec child's environment");
      const tokenInArgs = (exec?.args ?? []).some(
        (arg) => tokenValue !== undefined && arg.includes(tokenValue),
      );
      assert.equal(tokenInArgs, false, "the token value never appears in the exec command's arguments");

      assert.ok(
        capturedToolTimeoutSec !== undefined && capturedToolTimeoutSec > 600,
        "the tool timeout exceeds a feedback run's own ten-minute (600s) bound",
      );

      assert.notEqual(capturedUrl, undefined, "the exec call carried a feedback endpoint url");
      assert.equal(
        capturedUrl === undefined ? false : await cannotConnect(capturedUrl),
        true,
        "after author() returns, a request to the captured url cannot connect",
      );
    });
  },
);

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: the endpoint is closed after a refused " +
    "promotion, so a later request to it cannot connect",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      let capturedUrl: string | undefined;

      const feedbackCommand: CodexFeedbackCommand = {
        name: "run_proof",
        description: "Run the spine's package proof against the replica.",
        run: async () => ({ code: 0, stdout: "proof ok", stderr: "" }),
      };

      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const url = configValue(command.args, "mcp_servers.spine.url");
        const tokenEnvVar = configValue(command.args, "mcp_servers.spine.bearer_token_env_var");
        capturedUrl = url;
        if (url !== undefined) {
          const token = tokenEnvVar === undefined ? undefined : command.env[tokenEnvVar];
          if (token !== undefined) await invokeRunProofOverHttp(url, token);
        }
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/unlisted.ts"), "escape\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };

      const author = new CodexPhaseAuthor(
        argsWithFeedback(
          {
            cwd: root,
            writeGlobs: WRITE_GLOBS,
            promotionManifests: PROMOTION_MANIFESTS,
            isWriteAllowed: () => true,
            runner,
          },
          [feedbackCommand],
        ),
      );

      const result = await within(author.author("IMPLEMENT", "Attempt an unlisted extra file."));
      assert.equal(result.ok, false, "an observed unlisted path refuses the whole phase");

      assert.notEqual(capturedUrl, undefined, "the exec call carried a feedback endpoint url");
      assert.equal(
        capturedUrl === undefined ? false : await cannotConnect(capturedUrl),
        true,
        "the endpoint is closed even though the phase's promotion was refused",
      );
    });
  },
);

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: the endpoint is closed after the exec " +
    "runner throws, so a later request to it cannot connect",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      let capturedUrl: string | undefined;

      const feedbackCommand: CodexFeedbackCommand = {
        name: "run_proof",
        description: "Run the spine's package proof against the replica.",
        run: async () => ({ code: 0, stdout: "proof ok", stderr: "" }),
      };

      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        capturedUrl = configValue(command.args, "mcp_servers.spine.url");
        throw new Error("injected exec crash after reading the feedback endpoint url");
      };

      const author = new CodexPhaseAuthor(
        argsWithFeedback(
          {
            cwd: root,
            writeGlobs: WRITE_GLOBS,
            promotionManifests: PROMOTION_MANIFESTS,
            isWriteAllowed: () => true,
            runner,
          },
          [feedbackCommand],
        ),
      );

      const result = await within(author.author("IMPLEMENT", "Trigger a thrown exec."));
      assert.equal(result.ok, false, "a thrown exec runner fails the phase");

      assert.notEqual(capturedUrl, undefined, "the exec call carried a feedback endpoint url before it threw");
      assert.equal(
        capturedUrl === undefined ? false : await cannotConnect(capturedUrl),
        true,
        "the endpoint is closed even though the exec runner threw",
      );
    });
  },
);

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: an author constructed without feedback " +
    "commands issues today's exec arguments, opens no endpoint and makes no replica links",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const execCalls: CodexCommand[] = [];
      let replicaHadNodeModules: boolean | undefined;

      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        execCalls.push(command);
        try {
          await fs.lstat(path.join(command.cwd, "node_modules"));
          replicaHadNodeModules = true;
        } catch {
          replicaHadNodeModules = false;
        }
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };

      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
      });

      assert.deepEqual(
        author.feedbackToolNames,
        [],
        "no feedback commands were supplied, so no mcp__spine__ tools are exposed",
      );

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true });

      const exec = execCalls[0];
      assert.notEqual(exec, undefined);
      assert.equal(
        exec?.args.includes("mcp_servers={}"),
        true,
        "the exec arguments carry mcp_servers={} exactly as today",
      );
      assert.equal(
        exec?.bound,
        undefined,
        "the exec command carries no bound control, exactly as today",
      );
      assert.equal(
        (exec?.args ?? []).some((arg) => arg.startsWith("mcp_servers.spine.")),
        false,
        "no mcp_servers.spine.* config key is present",
      );
      assert.equal(
        "STORYTREE_SPINE_MCP_TOKEN" in (exec?.env ?? {}),
        false,
        "the environment carries no STORYTREE_SPINE_MCP_TOKEN",
      );
      assert.equal(
        replicaHadNodeModules,
        false,
        "the replica holds no node_modules when the runner runs, with no feedback commands",
      );
      assert.deepEqual(author.feedbackRuns, [], "feedbackRuns stays empty with no feedback commands");
    });
  },
);

// ── A runner owes the bound control nothing, and the replica is discarded on every exit ──

/** What one {@link authorOnce} phase returned, and the replica directory its runner was handed. */
interface ReplicaRun {
  result: AuthorResult;
  replicaDir: string | undefined;
}

/**
 * Author one IMPLEMENT phase over `root` with a single `run_proof` feedback command, answering `exec`
 * with `onExec` and capturing the replica directory the runner was handed.
 */
async function authorOnce(
  root: string,
  onExec: (command: CodexCommand) => Promise<CodexCommandResult>,
): Promise<ReplicaRun> {
  let replicaDir: string | undefined;
  const runner: CodexRunner = async (command) => {
    if (command.args[0] === "login") return loginSuccess();
    replicaDir = command.cwd;
    return await onExec(command);
  };
  const author = new CodexPhaseAuthor(
    argsWithFeedback(
      {
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
      },
      [
        {
          name: "run_proof",
          description: "Run the spine's package proof against the replica.",
          run: async () => ({ code: 0, stdout: "proof ok", stderr: "" }),
        },
      ],
    ),
  );
  const result = await within(author.author("IMPLEMENT", "Implement the widget."));
  return { result, replicaDir };
}

/**
 * Asserts that the replica `author()` handed its runner is gone once `author()` has returned, and that
 * removing it deleted nothing through its `node_modules` link into the workspace.
 */
async function assertReplicaRemoved(
  root: string,
  replicaDir: string | undefined,
  when: string,
): Promise<void> {
  assert.ok(replicaDir !== undefined, `the runner was handed a replica ${when}`);
  try {
    assert.equal(
      await fs.lstat(replicaDir).then(
        () => "still there",
        () => "gone",
      ),
      "gone",
      `the replica is gone once author() returns ${when}`,
    );
    assert.equal(
      await fs.readFile(path.join(root, "node_modules", "marker.txt"), "utf8"),
      "installed dependency\n",
      `removing the replica deleted nothing through its node_modules link ${when}`,
    );
  } finally {
    // Only a replica author() failed to remove is still here for this to clean up.
    await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: a runner that wires no suspend or resume " +
    "control still has its feedback run executed and recorded with the command's own exit code",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const ranIn: string[] = [];
      const feedbackCommand: CodexFeedbackCommand = {
        name: "run_proof",
        description: "Run the spine's package proof against the replica.",
        run: async (replicaRoot) => {
          ranIn.push(replicaRoot);
          return { code: 0, stdout: "proof ok", stderr: "" };
        },
      };

      // Unlike the pinned CLI runner, this runner never populates `command.bound`, so the bound control
      // the author hands it stays empty for the whole phase.
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const url = configValue(command.args, "mcp_servers.spine.url");
        const tokenEnvVar = configValue(command.args, "mcp_servers.spine.bearer_token_env_var");
        const token = tokenEnvVar === undefined ? undefined : command.env[tokenEnvVar];
        if (url !== undefined && token !== undefined) await invokeRunProofOverHttp(url, token);
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };

      const author = new CodexPhaseAuthor(
        argsWithFeedback(
          {
            cwd: root,
            writeGlobs: WRITE_GLOBS,
            promotionManifests: PROMOTION_MANIFESTS,
            isWriteAllowed: () => true,
            runner,
          },
          [feedbackCommand],
        ),
      );

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true }, "the phase authors and promotes successfully");
      assert.equal(ranIn.length, 1, "the feedback command ran once with no bound control wired");
      assert.deepEqual(
        author.feedbackRuns,
        [{ phase: "IMPLEMENT", tool: "run_proof", code: 0 }],
        "the run is recorded with the command's own exit code, not as a command that failed to run",
      );
    });
  },
);

test(
  "feedback-runs-in-the-replica-and-closes-with-the-phase: once author() returns the replica is gone — " +
    "after a completed phase, a refused promotion and a thrown runner — and removing it deletes nothing " +
    "through its dependency links",
  async () => {
    await withFeedbackWorkspace(async (root) => {
      const { result, replicaDir } = await authorOnce(root, async (command) => {
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      });
      assert.deepEqual(result, { ok: true }, "the phase authors and promotes successfully");
      await assertReplicaRemoved(root, replicaDir, "after a completed phase");
    });

    await withFeedbackWorkspace(async (root) => {
      const { result, replicaDir } = await authorOnce(root, async (command) => {
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/unlisted.ts"), "escape\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      });
      assert.equal(result.ok, false, "an observed unlisted path refuses the whole phase");
      await assertReplicaRemoved(root, replicaDir, "after a refused promotion");
    });

    await withFeedbackWorkspace(async (root) => {
      const { result, replicaDir } = await authorOnce(root, async () => {
        throw new Error("injected exec crash");
      });
      assert.deepEqual(
        result,
        { ok: false, error: "Codex exec failed to start: injected exec crash" },
        "a thrown runner fails the phase, naming what it threw",
      );
      await assertReplicaRemoved(root, replicaDir, "after a thrown runner");
    });
  },
);
