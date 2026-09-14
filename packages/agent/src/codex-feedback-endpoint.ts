/**
 * The token-gated loopback MCP feedback endpoint (ADR-0570): serves the spine's registered
 * feedback commands to Codex as argument-free MCP tools, over JSON-RPC 2.0 on plain HTTP POST
 * (answered with `application/json` — codex-cli 0.145.0 accepted that without opening an event
 * stream, so no event stream is served here).
 *
 * Local only: listens on `127.0.0.1` with port 0 (never `localhost`, never every interface). The
 * bearer token is fresh per endpoint, and a request without the right `Authorization: Bearer
 * <token>` header runs nothing. The leaf controls zero arguments — every tool's input schema
 * accepts no properties, and a call's `arguments` are never read.
 *
 * One budget decision for both leaves: every run is adapted to the Claude leaf's own
 * `FeedbackCommand` shape (closing over the replica root) and executed through `executeFeedback`
 * (`./sdk-author.js`) — the same refuse-past-cap / error-as-result / `record` accounting
 * `ClaudeAgentAuthor` uses (ADR-0570 D5). Importing it is the whole of this module's use of
 * `sdk-author.ts`.
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { executeFeedback } from "./sdk-author.js";
import type { FeedbackCommand, FeedbackRunOutput, SdkFeedbackRun } from "./sdk-author.js";
import type { AuthoringPhase } from "./phase-author.js";

/**
 * One spine-registered feedback command as this endpoint declares the shape: `{ name,
 * description, run(replicaRoot) }`. Declared here — not re-exported from `sdk-author.ts` — because
 * `codex-author.ts` (which owns the real command registry) is outside this contract's write scope.
 */
export interface CodexFeedbackCommand {
  /** Tool name (e.g. `run_proof`, `run_typecheck`). */
  name: string;
  /** What the model is told the tool does. */
  description: string;
  /** Spawn the fixed registered command against the disposable replica (never throws on a red exit — a genuine spawn failure is still allowed to throw and is caught by `executeFeedback`). */
  run: (replicaRoot: string) => Promise<FeedbackRunOutput>;
}

export interface OpenCodexFeedbackEndpointArgs {
  /** The authoring phase this endpoint's runs are recorded against. */
  phase: AuthoringPhase;
  /** The disposable replica the leaf is authoring in — passed to every command's `run`. */
  replicaRoot: string;
  /** The spine's registered feedback commands, exposed one-to-one as MCP tools. */
  commands: CodexFeedbackCommand[];
  /** The shared per-phase run cap (ADR-0570 D5), enforced across every command on this endpoint. */
  maxRuns: number;
  /** Called once per run that actually executed (never on a budget refusal). */
  record: (run: SdkFeedbackRun) => void;
}

export interface CodexFeedbackEndpointHandle {
  /** The endpoint's own `http://127.0.0.1:<port>/mcp` URL. */
  url: string;
  /** The fresh per-endpoint bearer token; a request without it runs nothing. */
  token: string;
  /** The fixed environment-variable name Codex is told to read the token from. */
  tokenEnvVar: string;
  /** Stop listening; a request made after this rejects to connect. */
  close: () => Promise<void>;
}

/** The env var name the leaf is told to read the bearer token from. */
const TOKEN_ENV_VAR = "STORYTREE_SPINE_MCP_TOKEN";
/** The only path this endpoint serves. */
const MCP_PATH = "/mcp";
/** The MCP server name reported in `initialize`. */
const SERVER_NAME = "spine";
/**
 * The MCP server version reported beside the name in `initialize` (ADR-0570): codex-cli 0.145.0
 * was measured to drop a server whose `serverInfo` carried no `version` at all — no protocol
 * requirement pins this value beyond non-empty, so it is not read from `package.json`.
 */
const SERVER_VERSION = "1";
/** Every tool's input schema: the leaf controls zero arguments. */
const EMPTY_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

interface JsonRpcRequestBody {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function rpcError(id: unknown, code: number, message: string): unknown {
  const rpcId = typeof id === "number" || typeof id === "string" || id === null ? id : null;
  return { jsonrpc: "2.0", id: rpcId, error: { code, message } };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Open one loopback MCP feedback endpoint. Resolves once the server is listening.
 */
export async function openCodexFeedbackEndpoint(
  args: OpenCodexFeedbackEndpointArgs,
): Promise<CodexFeedbackEndpointHandle> {
  const { phase, replicaRoot, commands, maxRuns, record } = args;
  const token = randomBytes(24).toString("hex");
  // The per-endpoint feedback budget: a fresh counter shared across every command this endpoint
  // serves, exactly as ClaudeAgentAuthor.author() tracks it per slice.
  let feedbackUsed = 0;

  const commandMap = new Map<string, FeedbackCommand>(
    commands.map((c) => [
      c.name,
      { name: c.name, description: c.description, run: () => c.run(replicaRoot) },
    ]),
  );

  async function handleToolCall(id: unknown, params: unknown, res: ServerResponse): Promise<void> {
    const rawName = (params as { name?: unknown } | undefined)?.name;
    const name = typeof rawName === "string" ? rawName : "";
    const command = commandMap.get(name);
    if (command === undefined) {
      sendJson(res, 200, rpcError(id, -32602, `unknown tool: ${name}`));
      return;
    }
    // The leaf controls zero arguments: `params.arguments` is deliberately never read.
    const outcome = await executeFeedback({
      phase,
      command,
      used: feedbackUsed,
      max: maxRuns,
      record: (run) => {
        feedbackUsed += 1;
        record(run);
      },
    });
    const result: { content: { type: "text"; text: string }[]; isError?: true } = {
      content: [{ type: "text", text: outcome.text }],
    };
    if (outcome.isError) result.isError = true;
    sendJson(res, 200, { jsonrpc: "2.0", id, result });
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404);
      res.end();
      return;
    }
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    let payload: JsonRpcRequestBody;
    try {
      payload = raw.length > 0 ? (JSON.parse(raw) as JsonRpcRequestBody) : {};
    } catch {
      sendJson(res, 200, rpcError(null, -32700, "parse error"));
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, "id")) {
      // A JSON-RPC notification (no `id`): acknowledged, nothing further to do.
      res.writeHead(202);
      res.end();
      return;
    }

    const id = payload.id;
    const method = typeof payload.method === "string" ? payload.method : "";
    switch (method) {
      case "initialize": {
        const params = payload.params as { protocolVersion?: unknown } | undefined;
        const protocolVersion =
          typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18";
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        });
        return;
      }
      case "tools/list": {
        sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            tools: commands.map((c) => ({
              name: c.name,
              description: c.description,
              inputSchema: EMPTY_INPUT_SCHEMA,
            })),
          },
        });
        return;
      }
      case "tools/call": {
        await handleToolCall(id, payload.params, res);
        return;
      }
      default: {
        sendJson(res, 200, rpcError(id, -32601, `method not found: ${method}`));
        return;
      }
    }
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}${MCP_PATH}`,
    token,
    tokenEnvVar: TOKEN_ENV_VAR,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
