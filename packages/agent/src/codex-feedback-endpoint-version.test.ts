import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";

import { openCodexFeedbackEndpoint } from "./codex-feedback-endpoint.js";
import type { FeedbackRunOutput } from "./sdk-author.js";
import type { AuthoringPhase } from "./phase-author.js";

/**
 * ADR-0570: codex-cli 0.145.0 was measured to drop an MCP server whose `initialize` answer names it
 * with no `version` beside its `name` — the request log showed `initialize` and nothing after it, no
 * `tools/call` ever reached the leaf's tools. This pins that `initialize` reports a non-empty server
 * version beside the name spine, leaving the protocol-version echo unchanged.
 *
 * A REAL HTTP request made with `fetch` against the handle's own `url` — no mock transport. The
 * endpoint is always closed in `finally` so a failed assertion never leaves a listener holding the
 * test process open (`packages/agent` sits inside the mutation rung, and CI's Linux run once found a
 * survivor that only Windows had killed).
 */

/** One spine-registered feedback command as the endpoint declares the shape: `{ name, description,
 * run(replicaRoot) }`. Declared locally because `codex-feedback-endpoint.ts` owns this shape — it is
 * not re-exported from `sdk-author.ts`. */
interface CodexFeedbackCommand {
  name: string;
  description: string;
  run: (replicaRoot: string) => Promise<FeedbackRunOutput>;
}

/** The `initialize` result shape, including the `serverInfo.version` this contract adds. */
interface InitializeResult {
  protocolVersion: string;
  capabilities: { tools: unknown };
  serverInfo: { name: string; version?: string };
}

/** A successful JSON-RPC 2.0 response envelope. */
interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

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

/** One raw HTTP POST against the endpoint's own `/mcp` url. */
async function postRaw(
  url: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

test(
  "initialize-names-spine-with-a-non-empty-version: initialize reports a server version beside " +
    "the name spine, leaving the protocol-version echo unchanged",
  async () => {
    const replicaRoot = path.join(os.tmpdir(), "storytree-codex-feedback-endpoint-version-fixture");
    const runProofCommand: CodexFeedbackCommand = {
      name: "run_proof",
      description: "Run the package proof suite.",
      run: async () => ({ code: 0, stdout: "", stderr: "" }),
    };

    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT" as AuthoringPhase,
        replicaRoot,
        commands: [runProofCommand],
        maxRuns: 1,
        record: () => undefined,
      }),
    );

    try {
      const init = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "codex", version: "0.145.0" },
          },
        }),
      );
      assert.equal(init.status, 200);
      const initBody = parseJson<JsonRpcSuccess>(init.text);
      const initResult = initBody.result as InitializeResult;

      // The protocol-version echo is unchanged.
      assert.equal(initResult.protocolVersion, "2025-06-18");
      // The server is still named `spine` ...
      assert.equal(initResult.serverInfo.name, "spine");
      // ... and now also reports a non-empty version beside it.
      assert.equal(typeof initResult.serverInfo.version, "string");
      assert.ok((initResult.serverInfo.version ?? "").length > 0);
    } finally {
      await within(handle.close());
    }
  },
);
