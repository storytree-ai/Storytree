/**
 * inner-loop-exit-arc / codex-leaf-escalates: an armed `CodexPhaseAuthor` lets the leaf escalate
 * once per authoring slice through the spine's loopback MCP endpoint — an untestable contract in
 * AUTHOR_TEST, an unsatisfiable test in IMPLEMENT — exactly as the Claude SDK leaf already does
 * through `mcp__spine__escalate` (`sdk-author.ts`). See `stories/agent/codex-leaf-escalates.md`.
 *
 * Today `codex-feedback-endpoint.ts`'s `tools/list` exposes only the registered feedback commands,
 * `tools/call` answers an unknown "escalate" tool with a JSON-RPC `-32602` error (no `result`
 * field at all), and `codex-author.ts`'s `author()` carries no escalation slot — so every
 * assertion below reaches the missing behaviour through the EXISTING, exported `CodexPhaseAuthor`
 * class and its already-existing constructor, never through a symbol that does not exist yet: the
 * red is a genuine assertion failure, never a missing-export import failure.
 *
 * `packages/agent` sits inside the mutation rung, so every tool name, answer text, error string
 * and schema is written LITERALLY below, never read from an exported constant.
 *
 * Every assertion that could otherwise be swallowed by production's own try/catch (inside the
 * escalate tool handler, inside the injected exec runner, or inside `author()`'s own catch blocks)
 * is deferred to the test body itself: a runner captures what it observed into an outer-scoped
 * variable and returns or throws exactly as the scenario requires, and the test asserts on that
 * capture AFTER `author()` has settled — never inside the callback, where a thrown assertion would
 * be caught and turned into a graceful error result instead of a failing test.
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

/** The escalation closing an armed author's composed stdin must end with, written literally. */
const ESCALATION_CLOSING =
  "If a frozen input is itself wrong and the phase is genuinely impossible, raise it through the `escalate` tool on the spine MCP server instead of guessing or working around it: in AUTHOR_TEST you may report the contract itself is untestable; in IMPLEMENT you may report that no correct implementation can satisfy the authored test as written. Raising an escalation ends this slice without a verdict — it never moves the verdict; the spine alone observes red and green, out-of-band, just as it always does.";

/** Real temp workspace: a source file to edit, no `node_modules` (the dependency-link step no-ops without one). */
async function withWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-author-escalation-test-"));
  try {
    const sourceDir = path.join(root, "packages", "widget", "src");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "widget.ts"), "widget before\n");
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function jsonl(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function successJsonl(inputTokens = 3, outputTokens = 4): string {
  return jsonl(
    { type: "turn.started" },
    { type: "turn.completed", usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
  );
}

function loginSuccess(): CodexCommandResult {
  return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
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

interface McpEndpoint {
  url: string;
  token: string;
}

/** Pulls the armed feedback endpoint's url/token off one exec command's argv/env, or throws. */
function requireEndpoint(command: CodexCommand): McpEndpoint {
  const url = configValue(command.args, "mcp_servers.spine.url");
  const tokenEnvVar = configValue(command.args, "mcp_servers.spine.bearer_token_env_var");
  if (url === undefined || tokenEnvVar === undefined) {
    throw new Error("exec command carried no feedback endpoint configuration");
  }
  const token = command.env[tokenEnvVar];
  if (token === undefined) {
    throw new Error("exec command's environment carried no feedback endpoint token");
  }
  return { url, token };
}

interface JsonRpcToolCallResponse {
  result?: { content?: { type: string; text: string }[]; isError?: boolean };
}

interface JsonRpcToolListResponse {
  result?: { tools?: { name: string; description: string; inputSchema: unknown }[] };
}

let nextRequestId = 1;

async function postRpc<T>(endpoint: McpEndpoint, method: string, params?: unknown): Promise<T> {
  const id = nextRequestId;
  nextRequestId += 1;
  const res = await within(
    fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.token}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        ...(params === undefined ? {} : { params }),
      }),
    }),
    5_000,
  );
  return (await res.json()) as T;
}

async function listTools(
  endpoint: McpEndpoint,
): Promise<{ name: string; description: string; inputSchema: unknown }[]> {
  const response = await postRpc<JsonRpcToolListResponse>(endpoint, "tools/list");
  return response.result?.tools ?? [];
}

async function callTool(
  endpoint: McpEndpoint,
  name: string,
  args: unknown,
): Promise<{ text: string; isError: boolean }> {
  const response = await postRpc<JsonRpcToolCallResponse>(endpoint, "tools/call", {
    name,
    arguments: args,
  });
  return {
    text: response.result?.content?.[0]?.text ?? "",
    isError: response.result?.isError === true,
  };
}

async function callEscalate(
  endpoint: McpEndpoint,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  return callTool(endpoint, "escalate", args);
}

async function callRunProof(endpoint: McpEndpoint): Promise<{ text: string; isError: boolean }> {
  return callTool(endpoint, "run_proof", {});
}

async function fileExists(root: string, relPath: string): Promise<boolean> {
  return (await fs.stat(path.join(root, relPath)).catch(() => undefined)) !== undefined;
}

function runProofCommand(onRun?: () => void): CodexFeedbackCommand {
  return {
    name: "run_proof",
    description: "Run the spine's package proof against the replica.",
    run: async () => {
      onRun?.();
      return { code: 0, stdout: "proof ok", stderr: "" };
    },
  };
}

/** The escalation-wins shape expected once the runner escalated with `statement` in AUTHOR_TEST. */
function expectedAuthorTestEscalation(statement: string): AuthorResult {
  return {
    ok: false,
    error: `AUTHOR_TEST escalated (untestable-contract): ${statement}`,
    escalation: { phase: "AUTHOR_TEST", kind: "untestable-contract", statement },
  };
}

test(
  "codex-escalation-ends-the-slice: tools/list exposes escalate beside the feedback commands, with its declared input schema",
  async () => {
    await withWorkspace(async (root) => {
      let capturedTools: { name: string; description: string; inputSchema: unknown }[] = [];
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        capturedTools = await listTools(endpoint);
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true }, "the phase authors and promotes with no escalation");

      const names = capturedTools.map((tool) => tool.name).sort();
      assert.deepEqual(
        names,
        ["escalate", "run_proof"],
        "tools/list carries exactly run_proof and escalate",
      );
      const escalateTool = capturedTools.find((tool) => tool.name === "escalate");
      assert.notEqual(escalateTool, undefined, "escalate is listed among the tools");
      assert.deepEqual(
        escalateTool?.inputSchema,
        {
          type: "object",
          properties: { statement: { type: "string" }, assertion: { type: "string" } },
          required: ["statement"],
          additionalProperties: false,
        },
        "escalate's inputSchema matches the declared shape exactly",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: an AUTHOR_TEST escalation is recorded, answered, and wins over a successful turn with nothing promoted",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "the contract names no observable",
        });
        await fs.writeFile(
          path.join(command.cwd, "packages/widget/src/widget.test.ts"),
          "test escalated away\n",
        );
        return { code: 0, stdout: successJsonl(5, 7), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the first valid escalate call is answered as recorded",
      );

      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("the contract names no observable"),
        "author() resolves the recorded escalation in the Claude leaf's error format",
      );

      assert.equal(author.runs.length, 1, "the run record is still written for a completed turn");
      assert.deepEqual(
        author.runs[0]?.usage,
        { inputTokens: 5, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 7 },
        "the run record carries the turn's own token usage",
      );

      assert.equal(
        await fileExists(root, "packages/widget/src/widget.test.ts"),
        false,
        "the required target was not promoted into the real workspace",
      );
      assert.deepEqual(author.feedbackRuns, [], "no feedback command ran during this slice");
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a second valid escalate call in the same slice is refused, and the first escalation is what author() returns",
  async () => {
    await withWorkspace(async (root) => {
      let firstResponse: { text: string; isError: boolean } | undefined;
      let secondResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        firstResponse = await callEscalate(endpoint, { statement: "first reason" });
        secondResponse = await callEscalate(endpoint, { statement: "second reason" });
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        firstResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the first escalate call is recorded",
      );
      assert.deepEqual(
        secondResponse,
        {
          text:
            "an escalation was already recorded for this slice; this call is refused " +
            "(exactly one escalation may be recorded per slice).",
          isError: true,
        },
        "a second valid escalate call is refused with the fixed message",
      );

      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("first reason"),
        "the FIRST escalation is the one author() returns, not the second",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: an IMPLEMENT escalation carries kind unsatisfiable-test with the reported assertion",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "no implementation can satisfy it",
          assertion: "expects both 4 and 5 from add(2, 2)",
        });
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the IMPLEMENT escalate call is recorded",
      );
      assert.deepEqual(
        result,
        {
          ok: false,
          error: "IMPLEMENT escalated (unsatisfiable-test): no implementation can satisfy it",
          escalation: {
            phase: "IMPLEMENT",
            kind: "unsatisfiable-test",
            statement: "no implementation can satisfy it",
            assertion: "expects both 4 and 5 from add(2, 2)",
          },
        },
        "author() resolves the IMPLEMENT escalation carrying the assertion",
      );
      assert.equal(
        await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"),
        "widget before\n",
        "the real workspace's required target is untouched",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: an IMPLEMENT escalate call with no assertion is refused with parseAuthoringEscalation's reason, and the phase then promotes normally",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, { statement: "missing the assertion" });
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));

      assert.deepEqual(
        escalateResponse,
        { text: "an IMPLEMENT escalation requires a non-blank assertion", isError: true },
        "the invalid call is refused with parseAuthoringEscalation's own reason",
      );
      assert.deepEqual(
        result,
        { ok: true },
        "with nothing recorded, the phase completes and promotes normally",
      );
      assert.equal(
        await fs.readFile(path.join(root, "packages/widget/src/widget.ts"), "utf8"),
        "widget after\n",
        "the required target was promoted as an ordinary completed phase",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a blank statement is refused with parseAuthoringEscalation's own reason, and records nothing",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, { statement: "   " });
        await fs.writeFile(
          path.join(command.cwd, "packages/widget/src/widget.test.ts"),
          "authored test\n",
        );
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation requires a non-blank statement", isError: true },
        "a blank statement is refused with parseAuthoringEscalation's own reason",
      );
      assert.deepEqual(
        result,
        { ok: true },
        "with nothing recorded, the phase completes and promotes normally",
      );
      assert.equal(
        await fs.readFile(path.join(root, "packages/widget/src/widget.test.ts"), "utf8"),
        "authored test\n",
        "the required target was promoted as an ordinary completed phase",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a recorded escalation wins over a thrown runner, with no run record and nothing promoted",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, { statement: "throws after escalating" });
        throw new Error("injected exec crash after escalating");
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the escalate call was recorded before the runner threw",
      );
      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("throws after escalating"),
        "the escalation wins even though the runner then threw",
      );
      assert.equal(
        author.runs.length,
        0,
        "a thrown runner leaves no stream to parse, so no run record is written",
      );
      assert.equal(
        await fileExists(root, "packages/widget/src/widget.test.ts"),
        false,
        "nothing was promoted",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a recorded escalation wins over a timed-out runner, with no run record and nothing promoted",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "times out after escalating",
        });
        return { code: null, stdout: "", stderr: "", timedOut: true };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the escalate call was recorded before the runner timed out",
      );
      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("times out after escalating"),
        "the escalation wins even though the runner then timed out",
      );
      assert.equal(
        author.runs.length,
        0,
        "a timed-out runner leaves no stream to parse, so no run record is written",
      );
      assert.equal(
        await fileExists(root, "packages/widget/src/widget.test.ts"),
        false,
        "nothing was promoted",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a recorded escalation wins over a non-zero exit, with the run record still written and nothing promoted",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "exits non-zero after escalating",
        });
        return { code: 1, stdout: successJsonl(), stderr: "boom" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the escalate call was recorded before the runner exited non-zero",
      );
      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("exits non-zero after escalating"),
        "the escalation wins over a non-zero exit code",
      );
      assert.equal(
        author.runs.length,
        1,
        "the runner returned a stream, so the run record is still written",
      );
      assert.equal(
        await fileExists(root, "packages/widget/src/widget.test.ts"),
        false,
        "nothing was promoted",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: a recorded escalation wins over an unlisted write, with the run record still written and nothing promoted",
  async () => {
    await withWorkspace(async (root) => {
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "writes unlisted after escalating",
        });
        await fs.writeFile(
          path.join(command.cwd, "packages/widget/src/widget.test.ts"),
          "authored test\n",
        );
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/unlisted.ts"), "escape\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the escalate call was recorded before the runner wrote an unlisted file",
      );
      assert.deepEqual(
        result,
        expectedAuthorTestEscalation("writes unlisted after escalating"),
        "the escalation wins over an observed unlisted write that would otherwise refuse the phase",
      );
      assert.equal(
        author.runs.length,
        1,
        "the runner returned a stream, so the run record is still written",
      );
      assert.equal(
        await fileExists(root, "packages/widget/src/widget.test.ts"),
        false,
        "the required target was not promoted",
      );
      assert.equal(
        await fileExists(root, "packages/widget/src/unlisted.ts"),
        false,
        "the unlisted file was not promoted either",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: escalate never draws on the feedback budget — run_proof still runs its full five times, and escalate never appears in feedbackRuns",
  async () => {
    await withWorkspace(async (root) => {
      let runProofCalls = 0;
      let escalateResponse: { text: string; isError: boolean } | undefined;
      const responses: { text: string; isError: boolean }[] = [];
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        const endpoint = requireEndpoint(command);
        escalateResponse = await callEscalate(endpoint, {
          statement: "escalate before spending the feedback budget",
        });
        for (let i = 0; i < 6; i += 1) {
          responses.push(await callRunProof(endpoint));
        }
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand(() => (runProofCalls += 1))],
      } satisfies CodexPhaseAuthorArgs);

      await within(author.author("AUTHOR_TEST", "Author the test."));

      assert.deepEqual(
        escalateResponse,
        { text: "escalation recorded; this slice is ending — stop now.", isError: false },
        "the escalate call was recorded",
      );
      assert.equal(
        runProofCalls,
        5,
        "run_proof still ran its full five times, unaffected by the escalate call",
      );
      assert.deepEqual(
        responses.slice(0, 5).map((r) => r.isError),
        [false, false, false, false, false],
        "the first five run_proof calls succeeded",
      );
      assert.deepEqual(
        responses[5],
        {
          isError: true,
          text:
            "feedback run budget exhausted (5 runs this slice): stop iterating — finish " +
            "the deliverable and stop; the spine observes the official result itself.",
        },
        "the sixth run_proof call is refused for exceeding the budget",
      );
      assert.deepEqual(
        author.feedbackRuns,
        [
          { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
          { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
          { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
          { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
          { phase: "AUTHOR_TEST", tool: "run_proof", code: 0 },
        ],
        "feedbackRuns holds exactly the five run_proof runs, with no escalate entries",
      );
    });
  },
);

test(
  "codex-escalation-ends-the-slice: an armed author's composed stdin ends with the escalation closing; an unarmed author has neither the tool nor the closing",
  async () => {
    await withWorkspace(async (root) => {
      let armedStdin: string | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        armedStdin = command.stdin;
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
        feedbackCommands: [runProofCommand()],
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true });
      assert.notEqual(armedStdin, undefined, "the exec call carried a composed stdin");
      assert.equal(
        armedStdin?.trimEnd().endsWith(ESCALATION_CLOSING),
        true,
        "the composed stdin of an armed author ends with the escalation closing",
      );
    });

    await withWorkspace(async (root) => {
      let unarmedStdin: string | undefined;
      const runner: CodexRunner = async (command) => {
        if (command.args[0] === "login") return loginSuccess();
        unarmedStdin = command.stdin;
        await fs.writeFile(path.join(command.cwd, "packages/widget/src/widget.ts"), "widget after\n");
        return { code: 0, stdout: successJsonl(), stderr: "" };
      };
      const author = new CodexPhaseAuthor({
        cwd: root,
        writeGlobs: WRITE_GLOBS,
        promotionManifests: PROMOTION_MANIFESTS,
        isWriteAllowed: () => true,
        runner,
      } satisfies CodexPhaseAuthorArgs);

      const result = await within(author.author("IMPLEMENT", "Implement the widget."));
      assert.deepEqual(result, { ok: true });
      assert.notEqual(unarmedStdin, undefined, "the exec call carried a composed stdin");
      assert.equal(
        unarmedStdin?.includes(ESCALATION_CLOSING),
        false,
        "an unarmed author's stdin carries no escalation closing",
      );
      assert.equal(
        unarmedStdin?.includes("escalate"),
        false,
        "an unarmed author's stdin never mentions the escalate tool",
      );
    });
  },
);
