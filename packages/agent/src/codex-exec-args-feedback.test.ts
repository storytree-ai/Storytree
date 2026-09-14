import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexExecArgs, DEFAULT_CODEX_MODEL } from "./codex-author.js";

const CWD = process.platform === "win32" ? "C:\\work\\tree" : "/work/tree";

/**
 * The optional `feedback` option `buildCodexExecArgs` does not yet accept. Declared locally, and the
 * call sites below reach it through an `unknown` cast, so this test compiles under the CURRENT
 * two-field signature (AUTHOR_TEST scope forbids touching `codex-author.ts`) and stays compiling once
 * IMPLEMENT widens that signature to match.
 */
interface CodexExecFeedbackOption {
  url: string;
  tokenEnvVar: string;
  toolTimeoutSec: number;
  /** Deliberately not part of the contract — asserted below to reach no argument. */
  token?: string;
}

interface CodexExecArgsWithFeedback {
  model: string;
  cwd: string;
  feedback?: CodexExecFeedbackOption;
}

const buildArgsWithFeedback = buildCodexExecArgs as unknown as (
  args: CodexExecArgsWithFeedback,
) => string[];

/** Today's exact command, written out literally — never produced by calling the builder again. */
const TODAYS_ARGS = [
  "exec",
  "--json",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--strict-config",
  "--sandbox",
  "danger-full-access",
  "--model",
  DEFAULT_CODEX_MODEL,
  "--cd",
  CWD,
  "--config",
  'approval_policy="never"',
  "--config",
  'web_search="disabled"',
  "--config",
  'forced_login_method="chatgpt"',
  "--config",
  'model_provider="openai"',
  "--config",
  "mcp_servers={}",
  "--config",
  "agents.enabled=false",
  "--config",
  "features.hooks=false",
  "--config",
  "features.apps=false",
  "--config",
  "features.remote_plugin=false",
  "--config",
  "features.multi_agent=false",
  "--config",
  "features.shell_tool=true",
  "--config",
  "features.unified_exec=false",
  "-",
];

/**
 * Today's command with the single `--config mcp_servers={}` pair replaced, at its own position, by
 * four loopback-spine pairs — every other flag, and the trailing `-`, unchanged. Written out
 * literally, matching the walkthrough's step 2.
 */
const FEEDBACK_ARGS = [
  "exec",
  "--json",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--strict-config",
  "--sandbox",
  "danger-full-access",
  "--model",
  DEFAULT_CODEX_MODEL,
  "--cd",
  CWD,
  "--config",
  'approval_policy="never"',
  "--config",
  'web_search="disabled"',
  "--config",
  'forced_login_method="chatgpt"',
  "--config",
  'model_provider="openai"',
  "--config",
  'mcp_servers.spine.url="http://127.0.0.1:43123/mcp"',
  "--config",
  'mcp_servers.spine.bearer_token_env_var="STORYTREE_SPINE_MCP_TOKEN"',
  "--config",
  "mcp_servers.spine.tool_timeout_sec=660",
  "--config",
  "mcp_servers.spine.startup_timeout_sec=660",
  "--config",
  "agents.enabled=false",
  "--config",
  "features.hooks=false",
  "--config",
  "features.apps=false",
  "--config",
  "features.remote_plugin=false",
  "--config",
  "features.multi_agent=false",
  "--config",
  "features.shell_tool=true",
  "--config",
  "features.unified_exec=false",
  "-",
];

test("feedback-swaps-empty-mcp-servers-for-a-loopback-spine: without a feedback option the command is exactly today's array", () => {
  const args = buildCodexExecArgs({ model: DEFAULT_CODEX_MODEL, cwd: CWD });
  assert.deepEqual(args, TODAYS_ARGS);
});

test("feedback-swaps-empty-mcp-servers-for-a-loopback-spine: a feedback phase swaps the empty mcp_servers pair for four loopback pairs in place", () => {
  const args = buildArgsWithFeedback({
    model: DEFAULT_CODEX_MODEL,
    cwd: CWD,
    feedback: {
      url: "http://127.0.0.1:43123/mcp",
      tokenEnvVar: "STORYTREE_SPINE_MCP_TOKEN",
      toolTimeoutSec: 660,
    },
  });
  assert.deepEqual(args, FEEDBACK_ARGS);
});

test("feedback-swaps-empty-mcp-servers-for-a-loopback-spine: a non-loopback or non-http feedback endpoint throws", () => {
  const nonLocalUrls = [
    "https://127.0.0.1:43123/mcp",
    "http://localhost:43123/mcp",
    "http://0.0.0.0:43123/mcp",
  ];
  for (const url of nonLocalUrls) {
    assert.throws(() =>
      buildArgsWithFeedback({
        model: DEFAULT_CODEX_MODEL,
        cwd: CWD,
        feedback: { url, tokenEnvVar: "STORYTREE_SPINE_MCP_TOKEN", toolTimeoutSec: 660 },
      }),
      `expected a throw for feedback url ${url}`,
    );
  }
});

test("feedback-swaps-empty-mcp-servers-for-a-loopback-spine: a non-positive-integer tool timeout throws", () => {
  const badTimeouts = [0, -1, 1.5];
  for (const toolTimeoutSec of badTimeouts) {
    assert.throws(() =>
      buildArgsWithFeedback({
        model: DEFAULT_CODEX_MODEL,
        cwd: CWD,
        feedback: {
          url: "http://127.0.0.1:43123/mcp",
          tokenEnvVar: "STORYTREE_SPINE_MCP_TOKEN",
          toolTimeoutSec,
        },
      }),
      `expected a throw for tool timeout ${toolTimeoutSec}`,
    );
  }
});

test("feedback-swaps-empty-mcp-servers-for-a-loopback-spine: the builder accepts no token value, so a forced token property reaches no argument", () => {
  const args = buildArgsWithFeedback({
    model: DEFAULT_CODEX_MODEL,
    cwd: CWD,
    feedback: {
      url: "http://127.0.0.1:43123/mcp",
      tokenEnvVar: "STORYTREE_SPINE_MCP_TOKEN",
      toolTimeoutSec: 660,
      token: "MARKER_TOKEN_VALUE_MUST_NOT_APPEAR",
    },
  });
  assert.deepEqual(args, FEEDBACK_ARGS);
  assert.equal(
    args.some((arg) => arg.includes("MARKER_TOKEN_VALUE_MUST_NOT_APPEAR")),
    false,
  );
});
