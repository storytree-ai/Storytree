import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";

import { openCodexFeedbackEndpoint } from "./codex-feedback-endpoint.js";
import { formatFeedbackOutput } from "./sdk-author.js";
import type { FeedbackRunOutput } from "./sdk-author.js";
import type { AuthoringPhase } from "./phase-author.js";

/**
 * OFFLINE tests for the loopback MCP feedback endpoint (ADR-0570): a token-gated
 * `http://127.0.0.1:<port>/mcp` server that exposes the spine's registered feedback commands to
 * Codex as argument-free MCP tools and runs them itself, inside one shared per-phase budget.
 *
 * Every request is a REAL HTTP request made with `fetch` against the handle's own `url` — no mock
 * transport. Endpoints are always closed in `finally` so a failed assertion never leaves a listener
 * holding the test process open (`packages/agent` sits inside the mutation rung, and CI's Linux run
 * once found a survivor that only Windows had killed).
 */

/** One spine-registered feedback command as the endpoint declares the shape: `{ name, description,
 * run(replicaRoot) }`. Declared locally because `codex-feedback-endpoint.ts` owns this shape — it is
 * not re-exported from `sdk-author.ts`. */
interface CodexFeedbackCommand {
  name: string;
  description: string;
  run: (replicaRoot: string) => Promise<FeedbackRunOutput>;
}

/** What `record` receives for every budget-consuming run (ADR-0570 D5). */
interface RecordedFeedbackRun {
  phase: AuthoringPhase;
  tool: string;
  code: number | null;
}

/** One JSON-RPC 2.0 tool-result content item, as the endpoint must return it. */
interface McpTextContent {
  type: string;
  text: string;
}

/** The `tools/call` result shape. */
interface ToolCallResult {
  content: McpTextContent[];
  isError?: boolean;
}

/** The `initialize` result shape. */
interface InitializeResult {
  protocolVersion: string;
  capabilities: { tools: unknown };
  serverInfo: { name: string };
}

/** One `tools/list` entry. */
interface ToolListEntry {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
}

interface ToolsListResult {
  tools: ToolListEntry[];
}

/** A successful JSON-RPC 2.0 response envelope. */
interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

/** An erroring JSON-RPC 2.0 response envelope. */
interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number | null;
  error: { code: number; message: string };
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

/** One raw HTTP POST against the endpoint's own `/mcp` url. Returns status + raw body text so a
 * 401/405/202 (which may carry no JSON body at all) never fails on an eager `JSON.parse`. */
async function postRaw(
  url: string,
  token: string | undefined,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== undefined) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: an authenticated loopback endpoint " +
    "runs only the spine's registered commands, inside one shared budget",
  async () => {
    const replicaRoot = path.join(os.tmpdir(), "storytree-codex-feedback-endpoint-fixture");

    const runProofLog: string[] = [];
    const runTypecheckLog: string[] = [];
    const records: RecordedFeedbackRun[] = [];

    const runProofOutput: FeedbackRunOutput = { code: 0, stdout: "proof ok", stderr: "" };
    const runProofCommand: CodexFeedbackCommand = {
      name: "run_proof",
      description: "Run the package proof suite.",
      run: async (root) => {
        runProofLog.push(root);
        return runProofOutput;
      },
    };
    const runTypecheckOutput: FeedbackRunOutput = { code: 1, stdout: "", stderr: "typecheck failed" };
    const runTypecheckCommand: CodexFeedbackCommand = {
      name: "run_typecheck",
      description: "Run the package typecheck.",
      run: async (root) => {
        runTypecheckLog.push(root);
        return runTypecheckOutput;
      },
    };

    const secondRunProofLog: string[] = [];
    const secondRecords: RecordedFeedbackRun[] = [];
    const secondRunProofCommand: CodexFeedbackCommand = {
      name: "run_proof",
      description: "Run the package proof suite.",
      run: async (root) => {
        secondRunProofLog.push(root);
        throw new Error("spawn exploded");
      },
    };

    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot,
        commands: [runProofCommand, runTypecheckCommand],
        maxRuns: 2,
        record: (run: RecordedFeedbackRun) => records.push(run),
      }),
    );
    const secondHandle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot,
        commands: [secondRunProofCommand],
        maxRuns: 2,
        record: (run: RecordedFeedbackRun) => secondRecords.push(run),
      }),
    );

    try {
      // Step 1: the handle shape — a real ephemeral loopback port, a fresh token per endpoint, and
      // the fixed environment-variable name Codex is told to read the token from.
      assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      assert.equal(handle.tokenEnvVar, "STORYTREE_SPINE_MCP_TOKEN");
      assert.equal(typeof handle.token, "string");
      assert.ok(handle.token.length > 0);
      assert.notEqual(handle.token, secondHandle.token);

      // Step 2: no Authorization / wrong bearer token -> 401, nothing runs; a non-POST -> 405.
      const noAuth = await within(
        postRaw(handle.url, undefined, {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "run_proof", arguments: {} },
        }),
      );
      assert.equal(noAuth.status, 401);
      assert.equal(runProofLog.length, 0);

      const wrongAuth = await within(
        postRaw(handle.url, "not-the-right-token", {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "run_proof", arguments: {} },
        }),
      );
      assert.equal(wrongAuth.status, 401);
      assert.equal(runProofLog.length, 0);

      const getWithToken = await within(
        fetch(handle.url, { method: "GET", headers: { Authorization: `Bearer ${handle.token}` } }),
      );
      assert.equal(getWithToken.status, 405);
      assert.equal(runProofLog.length, 0);

      // Step 3: `initialize` echoes the client's protocol version and names the server `spine`;
      // a JSON-RPC notification (no `id`) is answered 202.
      const init = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 3,
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
      assert.equal(initResult.protocolVersion, "2025-06-18");
      assert.notEqual(initResult.capabilities.tools, undefined);
      assert.equal(initResult.serverInfo.name, "spine");

      const initialized = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      );
      assert.equal(initialized.status, 202);

      // Step 4: `tools/list` lists exactly one tool per registered command, each with the command's
      // own name/description and an input schema that accepts no properties.
      const list = await within(
        postRaw(handle.url, handle.token, { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
      );
      assert.equal(list.status, 200);
      const listBody = parseJson<JsonRpcSuccess>(list.text);
      const listResult = listBody.result as ToolsListResult;
      assert.equal(listResult.tools.length, 2);
      const toolsByName = new Map(listResult.tools.map((entry) => [entry.name, entry]));
      const runProofTool = toolsByName.get("run_proof");
      const runTypecheckTool = toolsByName.get("run_typecheck");
      assert.notEqual(runProofTool, undefined);
      assert.notEqual(runTypecheckTool, undefined);
      assert.equal(runProofTool!.description, runProofCommand.description);
      assert.deepEqual(runProofTool!.inputSchema, {
        type: "object",
        properties: {},
        additionalProperties: false,
      });
      assert.equal(runTypecheckTool!.description, runTypecheckCommand.description);
      assert.deepEqual(runTypecheckTool!.inputSchema, {
        type: "object",
        properties: {},
        additionalProperties: false,
      });

      // Step 5: `tools/call run_proof` runs the command once, with the replica root, ignoring the
      // arguments the caller sent, and returns `formatFeedbackOutput` as MCP text content. Calling
      // an unregistered tool, then an unserved method, each answers a JSON-RPC error and runs nothing.
      const call1 = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "run_proof", arguments: { command: "echo injected" } },
        }),
      );
      assert.equal(call1.status, 200);
      assert.equal(runProofLog.length, 1);
      assert.equal(runProofLog[0], replicaRoot);
      const call1Body = parseJson<JsonRpcSuccess>(call1.text);
      const call1Result = call1Body.result as ToolCallResult;
      assert.equal(call1Result.isError, undefined);
      assert.equal(call1Result.content.length, 1);
      assert.equal(call1Result.content[0]!.type, "text");
      assert.equal(call1Result.content[0]!.text, formatFeedbackOutput(runProofOutput));

      const unknownTool = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "not_a_registered_tool", arguments: {} },
        }),
      );
      const unknownToolBody = parseJson<JsonRpcFailure>(unknownTool.text);
      assert.notEqual(unknownToolBody.error, undefined);
      assert.equal((unknownToolBody as unknown as JsonRpcSuccess).result, undefined);
      assert.equal(runProofLog.length, 1);

      const unknownMethod = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 7,
          method: "not/a/served/method",
          params: {},
        }),
      );
      const unknownMethodBody = parseJson<JsonRpcFailure>(unknownMethod.text);
      assert.notEqual(unknownMethodBody.error, undefined);
      assert.equal((unknownMethodBody as unknown as JsonRpcSuccess).result, undefined);
      assert.equal(runProofLog.length, 1);
      assert.equal(runTypecheckLog.length, 0);

      // Step 6: `run_typecheck` runs (the second of two budgeted runs); a third call past the shared
      // cap is refused without running, and `record` saw exactly the two runs it made.
      const call2 = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "run_typecheck", arguments: {} },
        }),
      );
      assert.equal(runTypecheckLog.length, 1);
      assert.equal(runTypecheckLog[0], replicaRoot);
      const call2Body = parseJson<JsonRpcSuccess>(call2.text);
      const call2Result = call2Body.result as ToolCallResult;
      assert.equal(call2Result.isError, undefined);
      assert.equal(call2Result.content[0]!.text, formatFeedbackOutput(runTypecheckOutput));

      const call3 = await within(
        postRaw(handle.url, handle.token, {
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "run_proof", arguments: {} },
        }),
      );
      const call3Body = parseJson<JsonRpcSuccess>(call3.text);
      const call3Result = call3Body.result as ToolCallResult;
      assert.equal(call3Result.isError, true);
      assert.equal(runProofLog.length, 1);

      assert.deepEqual(records, [
        { phase: "IMPLEMENT", tool: "run_proof", code: 0 },
        { phase: "IMPLEMENT", tool: "run_typecheck", code: 1 },
      ]);

      // Step 7: the SECOND endpoint's `run_proof` rejects; the result carries `isError` and the run
      // is recorded with `code: null`.
      const secondCall = await within(
        postRaw(secondHandle.url, secondHandle.token, {
          jsonrpc: "2.0",
          id: 10,
          method: "tools/call",
          params: { name: "run_proof", arguments: {} },
        }),
      );
      const secondCallBody = parseJson<JsonRpcSuccess>(secondCall.text);
      const secondCallResult = secondCallBody.result as ToolCallResult;
      assert.equal(secondCallResult.isError, true);
      assert.equal(secondRunProofLog.length, 1);
      assert.deepEqual(secondRecords, [{ phase: "IMPLEMENT", tool: "run_proof", code: null }]);
    } finally {
      // Step 8 (part 1): close every endpoint before asserting anything further, so a failed
      // assertion above never leaves a listener holding the test process open.
      await handle.close();
      await secondHandle.close();
    }

    // Step 8 (part 2): after close(), a further request to either url cannot connect.
    await assert.rejects(
      within(
        fetch(handle.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 11, method: "tools/list", params: {} }),
        }),
      ),
    );
    await assert.rejects(
      within(
        fetch(secondHandle.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} }),
        }),
      ),
    );
  },
);
