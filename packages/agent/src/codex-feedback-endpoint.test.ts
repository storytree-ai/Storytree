import { test } from "node:test";
import assert from "node:assert/strict";
import * as net from "node:net";
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
  const headers =
    token === undefined
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
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
      assert.equal("result" in unknownToolBody, false);
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
      assert.equal("result" in unknownMethodBody, false);
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
      await within(handle.close());
      await within(secondHandle.close());
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

// ── The details a Codex client meets beyond the walkthrough: envelopes, refusals, path, bind, close ──

const FIXTURE_REPLICA_ROOT = path.join(os.tmpdir(), "storytree-codex-feedback-endpoint-fixture");

/** Status, content type and body text of one raw HTTP answer. */
interface RawReply {
  status: number;
  contentType: string | null;
  text: string;
}

/** A JSON-RPC 2.0 error envelope as it comes off the wire, whatever JSON type its id has. */
interface JsonRpcErrorReply {
  jsonrpc: string;
  id: number | string | boolean | null;
  error: { code: number; message: string };
}

/** A command whose `run` logs the root it was given and passes. */
function recordingCommand(name: string, log: string[]): CodexFeedbackCommand {
  return {
    name,
    description: `Run ${name}.`,
    run: async (root) => {
      log.push(root);
      return { code: 0, stdout: `${name} ok`, stderr: "" };
    },
  };
}

/** One POST of raw `bodyText` to `url`, carrying `Authorization: Bearer <token>`. */
async function postText(url: string, token: string, bodyText: string): Promise<RawReply> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: bodyText,
  });
  return { status: res.status, contentType: res.headers.get("content-type"), text: await res.text() };
}

/**
 * Whether a TCP connection to `host:port` is accepted. A refusal, an address this machine does not
 * have, and five seconds of silence all count as not accepted.
 */
async function acceptsConnection(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (accepted: boolean): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve(accepted);
    };
    const timer = setTimeout(() => settle(false), 5_000);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

/** A gate a test opens by hand: `opened` settles once `open()` has been called. */
interface Latch {
  readonly opened: Promise<void>;
  open(): void;
}

function latch(): Latch {
  let release = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { opened, open: () => release() };
}

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: every answer is an application/json JSON-RPC " +
    "2.0 envelope echoing the request's id, and initialize echoes a string protocol version or else " +
    "offers 2025-06-18",
  async () => {
    const ran: string[] = [];
    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot: FIXTURE_REPLICA_ROOT,
        commands: [recordingCommand("run_proof", ran)],
        maxRuns: 2,
        record: () => undefined,
      }),
      5_000,
    );
    try {
      const send = (body: Record<string, unknown>): Promise<RawReply> =>
        within(postText(handle.url, handle.token, JSON.stringify(body)), 5_000);

      const echoed = await send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      });
      assert.equal(echoed.status, 200);
      assert.equal(echoed.contentType, "application/json");
      const echoedBody = parseJson<JsonRpcSuccess>(echoed.text);
      assert.equal(echoedBody.jsonrpc, "2.0");
      assert.equal(echoedBody.id, 1);
      assert.equal((echoedBody.result as InitializeResult).protocolVersion, "2024-11-05");

      const noParams = await send({ jsonrpc: "2.0", id: 2, method: "initialize" });
      assert.equal(noParams.status, 200);
      assert.equal(
        (parseJson<JsonRpcSuccess>(noParams.text).result as InitializeResult).protocolVersion,
        "2025-06-18",
        "an initialize carrying no params is offered 2025-06-18",
      );

      const notAString = await send({
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: { protocolVersion: 20250618 },
      });
      assert.equal(notAString.status, 200);
      assert.equal(
        (parseJson<JsonRpcSuccess>(notAString.text).result as InitializeResult).protocolVersion,
        "2025-06-18",
        "a protocol version that is not a string is not echoed",
      );

      const list = await send({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
      assert.equal(list.status, 200);
      assert.equal(list.contentType, "application/json");
      const listBody = parseJson<JsonRpcSuccess>(list.text);
      assert.equal(listBody.jsonrpc, "2.0");
      assert.equal(listBody.id, 4);

      const call = await send({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "run_proof", arguments: {} },
      });
      assert.equal(call.status, 200);
      assert.equal(call.contentType, "application/json");
      const callBody = parseJson<JsonRpcSuccess>(call.text);
      assert.equal(callBody.jsonrpc, "2.0");
      assert.equal(callBody.id, 5);
      assert.deepEqual(ran, [FIXTURE_REPLICA_ROOT], "the one tools/call ran its command once");
    } finally {
      await within(handle.close(), 5_000);
    }
  },
);

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: a refusal is a JSON-RPC 2.0 error naming its " +
    "code and message, echoing a number or string id and answering any other id as null, and runs " +
    "nothing — an unknown or unnamed tool, an unknown or missing method, a body that is not JSON — while " +
    "an empty body is acknowledged like a notification",
  async () => {
    const ran: string[] = [];
    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot: FIXTURE_REPLICA_ROOT,
        commands: [recordingCommand("run_proof", ran)],
        maxRuns: 2,
        record: () => undefined,
      }),
      5_000,
    );
    try {
      const sendText = (bodyText: string): Promise<RawReply> =>
        within(postText(handle.url, handle.token, bodyText), 5_000);
      const refusalFor = async (body: Record<string, unknown>): Promise<JsonRpcErrorReply> => {
        const reply = await sendText(JSON.stringify(body));
        assert.equal(reply.status, 200);
        assert.equal(reply.contentType, "application/json");
        return parseJson<JsonRpcErrorReply>(reply.text);
      };

      assert.deepEqual(
        await refusalFor({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "not_a_registered_tool", arguments: {} },
        }),
        {
          jsonrpc: "2.0",
          id: 6,
          error: { code: -32602, message: "unknown tool: not_a_registered_tool" },
        },
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: 7, method: "tools/call" }),
        { jsonrpc: "2.0", id: 7, error: { code: -32602, message: "unknown tool: " } },
        "a tools/call carrying no params names no tool",
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: 42 } }),
        { jsonrpc: "2.0", id: 8, error: { code: -32602, message: "unknown tool: " } },
        "a tool name that is not a string names no tool",
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: "call-9", method: "not/a/served/method", params: {} }),
        {
          jsonrpc: "2.0",
          id: "call-9",
          error: { code: -32601, message: "method not found: not/a/served/method" },
        },
        "a string id is echoed",
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: true, method: "not/a/served/method", params: {} }),
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32601, message: "method not found: not/a/served/method" },
        },
        "an id that is neither a number nor a string is answered as null",
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: null, method: "not/a/served/method", params: {} }),
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32601, message: "method not found: not/a/served/method" },
        },
        "a null id is answered as null",
      );
      assert.deepEqual(
        await refusalFor({ jsonrpc: "2.0", id: 10 }),
        { jsonrpc: "2.0", id: 10, error: { code: -32601, message: "method not found: " } },
        "a request carrying no method names no method",
      );

      const notJson = await sendText("this is not json");
      assert.equal(notJson.status, 200);
      assert.equal(notJson.contentType, "application/json");
      assert.deepEqual(parseJson<JsonRpcErrorReply>(notJson.text), {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      });

      const empty = await sendText("");
      assert.equal(
        empty.status,
        202,
        "an empty body carries no id, so it is acknowledged like a notification",
      );

      assert.deepEqual(ran, [], "no refusal ran a command");
    } finally {
      await within(handle.close(), 5_000);
    }
  },
);

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: only /mcp is served — a POST to any other " +
    "path on the same port is answered 404 and runs nothing, even carrying the right token",
  async () => {
    const ran: string[] = [];
    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot: FIXTURE_REPLICA_ROOT,
        commands: [recordingCommand("run_proof", ran)],
        maxRuns: 2,
        record: () => undefined,
      }),
      5_000,
    );
    try {
      const otherPath = handle.url.replace(/\/mcp$/, "/not-mcp");
      assert.notEqual(otherPath, handle.url, "the probe addresses a different path on the same port");
      const reply = await within(
        postText(
          otherPath,
          handle.token,
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "run_proof", arguments: {} },
          }),
        ),
        5_000,
      );
      assert.equal(reply.status, 404);
      assert.deepEqual(ran, [], "nothing ran for a request to another path");
    } finally {
      await within(handle.close(), 5_000);
    }
  },
);

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: the endpoint listens on 127.0.0.1 alone — its " +
    "port accepts a connection there and none on ::1 or 127.0.0.2",
  async () => {
    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot: FIXTURE_REPLICA_ROOT,
        commands: [recordingCommand("run_proof", [])],
        maxRuns: 1,
        record: () => undefined,
      }),
      5_000,
    );
    try {
      const port = Number(new URL(handle.url).port);
      assert.equal(
        await acceptsConnection("127.0.0.1", port),
        true,
        "the probe reaches the endpoint where it listens",
      );
      assert.equal(
        await acceptsConnection("::1", port),
        false,
        "the IPv6 loopback reaches nothing on that port",
      );
      assert.equal(
        await acceptsConnection("127.0.0.2", port),
        false,
        "another loopback address reaches nothing on that port",
      );
    } finally {
      await within(handle.close(), 5_000);
    }
  },
);

test(
  "token-gated-loopback-mcp-runs-only-registered-commands: close() does not wait for a run still in " +
    "flight — it resolves while tools/call is running and cuts that request off unanswered",
  async () => {
    const started = latch();
    const finish = latch();
    const handle = await within(
      openCodexFeedbackEndpoint({
        phase: "IMPLEMENT",
        replicaRoot: FIXTURE_REPLICA_ROOT,
        commands: [
          {
            name: "run_proof",
            description: "Run the package proof suite.",
            run: async () => {
              started.open();
              await finish.opened;
              return { code: 0, stdout: "finished after close", stderr: "" };
            },
          },
        ],
        maxRuns: 1,
        record: () => undefined,
      }),
      5_000,
    );
    let closed = false;
    try {
      const inFlight = postText(
        handle.url,
        handle.token,
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "run_proof", arguments: {} },
        }),
      ).then(
        () => "answered",
        () => "cut off",
      );
      await within(started.opened, 5_000);
      await within(handle.close(), 5_000);
      closed = true;
      assert.equal(
        await within(inFlight, 5_000),
        "cut off",
        "the request whose run was still in flight got no answer",
      );
    } finally {
      finish.open();
      if (!closed) await within(handle.close(), 5_000).catch(() => undefined);
    }
  },
);
