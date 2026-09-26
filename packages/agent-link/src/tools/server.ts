/**
 * Capability 6 · Agent tools, the MCP server (stories/agent-link.md): the toolbox the agent calls
 * to plan work, see the plan and who is on what, claim, report red, green and landed, and search,
 * read and write notes. Each tool is a thin wrapper over the library's API and the claims, and
 * answers in a short plain sentence the agent can act on, with what it made or found as data too.
 *
 * Every call, whatever the tool:
 * - is routed from the folder the server works in (capability 1), afresh each time, so a project
 *   set up mid-session is found, and a storytree that has stopped is noticed;
 * - answers "storytree isn't running, carry on without it" while it is not;
 * - is recorded in the agent activity log as a `tool-called` line on the calling session: Claude
 *   Code names it in the server's environment (`CLAUDE_CODE_SESSION_ID`), Codex on each call's
 *   `_meta` (`sessionId`, or `threadId` before Codex 0.155), the same ids their hooks see;
 * - turns a refusal from the library or the claims into a readable answer marked as an error,
 *   never a crash.
 */
import { randomUUID } from "node:crypto";

import { McpServer, type CallToolResult, type ServerContext } from "@modelcontextprotocol/server";
import {
  ConnectionError,
  DependencyLoopError,
  MissingReferenceError,
  NewerSchemaError,
  ProjectNameError,
  SchemaError,
  UnknownTypeError,
  type Library,
} from "@storytree/library";
import type { z } from "zod";

import type { ActivityLog } from "../activity/index.js";
import { route } from "../routing/index.js";
import { QUIET_MS } from "../sessions/index.js";
import { registerClaimTools } from "./claim-tools.js";
import { Connections } from "./connections.js";
import { registerNoteTools } from "./note-tools.js";
import { registerPlanTools } from "./plan-tools.js";

/** What the tool server needs to know about where it runs. */
export interface AgentToolOptions {
  /** The folder the agent works in: where the harness started the server. */
  readonly folder: string;
  /** The app's Postgres data directory, beside which its owner record is kept (as project routing reads it). */
  readonly dataDir?: string;
  /** The server's environment, where Claude Code puts its session id. By default, the process's. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** How long a claim's holder may be quiet before it can be taken over. By default, sessions' quiet time. */
  readonly quietMs?: number;
}

/** A tool server, and how to close it with every connection it opened. */
export interface AgentTools {
  readonly server: McpServer;
  close(): Promise<void>;
}

/** What every tool answers while storytree is not running. */
export const NOT_RUNNING_ANSWER = "storytree isn't running, carry on without it";
/** What every tool answers in a folder that is not a storytree project. */
export const NOT_A_PROJECT_ANSWER = "this folder isn't a storytree project, so storytree has nothing to keep here; carry on without it";

/** The session calling, as the harness names it. */
export interface Caller {
  readonly session: string;
  readonly harness?: string;
}

/** What a tool has to work with for one call. */
export interface Call {
  readonly library: Library;
  readonly log: ActivityLog;
  readonly project: string;
  readonly caller: Caller;
  /** The folder the agent works in. */
  readonly folder: string;
  readonly quietMs: number;
}

/** A tool's answer: one plain sentence (or a few lines), what it made or found as data, and whether it refused. */
export interface Answer {
  readonly text: string;
  readonly data?: Record<string, unknown>;
  readonly refused?: boolean;
}

/** Registers one tool: its name, what it is for, its arguments, and what it does with them. */
export type Define = <S extends z.ZodObject>(name: string, description: string, input: S, act: (args: z.output<S>, call: Call) => Promise<Answer>) => void;

export function createAgentTools(options: AgentToolOptions): AgentTools {
  const server = new McpServer({ name: "storytree", version: "0.3.0" });
  const connections = new Connections();
  const env = options.env ?? process.env;
  const quietMs = options.quietMs ?? QUIET_MS;
  // A session id of its own, for a harness that names none: one server process serves one session.
  const ownSession = `storytree-mcp-${randomUUID()}`;
  const locate = options.dataDir === undefined ? {} : { dataDir: options.dataDir };

  const define: Define = (name, description, input, act) => {
    const handle = async (args: unknown, context: ServerContext): Promise<CallToolResult> => {
      const where = route(options.folder, locate);
      if (where.status === "not-running") return result({ text: NOT_RUNNING_ANSWER });
      if (where.status === "not-a-project") return result({ text: NOT_A_PROJECT_ANSWER });
      const caller = callerOf(server, context, env, ownSession);
      try {
        const { library, log } = await connections.reach(where.url, where.project);
        await log.append(where.project, { ...lineOf(caller), source: "tool", folder: options.folder, kind: "tool-called", tool: name });
        return result(await act(args as never, { library, log, project: where.project, caller, folder: options.folder, quietMs }));
      } catch (error) {
        if (isUnreachable(error)) {
          await connections.close();
          return result({ text: NOT_RUNNING_ANSWER });
        }
        return result({ text: refusalOf(error), refused: true });
      }
    };
    // The SDK checks the arguments against `input` before `handle` runs; its callback type is
    // written per schema, which a wrapper serving every tool cannot name, hence the cast.
    server.registerTool(name, { description, inputSchema: input }, handle as never);
  };

  registerPlanTools(define);
  registerClaimTools(define);
  registerNoteTools(define);

  return {
    server,
    async close() {
      await server.close();
      await connections.close();
    },
  };
}

/** A line's own "who": the session and, when known, its harness. */
export function lineOf(caller: Caller): { session: string; harness?: string } {
  return caller.harness === undefined ? { session: caller.session } : { session: caller.session, harness: caller.harness };
}

/**
 * Who is calling. The harness from the client's name (Claude Code calls itself `claude-code`, Codex
 * `codex-mcp-client`); the session from where that harness puts it.
 */
function callerOf(server: McpServer, context: ServerContext, env: Readonly<Record<string, string | undefined>>, ownSession: string): Caller {
  const client = server.server.getClientVersion()?.name;
  const harness = client === "codex-mcp-client" ? "codex" : client;
  const meta = (context.mcpReq._meta ?? {}) as Record<string, unknown>;
  const fromMeta = text(meta.sessionId) ?? text(meta.threadId);
  const fromEnv = text(env.CLAUDE_CODE_SESSION_ID);
  const session = (harness === "claude-code" ? (fromEnv ?? fromMeta) : (fromMeta ?? fromEnv)) ?? ownSession;
  return harness === undefined ? { session } : { session, harness };
}

function result(answer: Answer): CallToolResult {
  return {
    content: [{ type: "text", text: answer.text }],
    ...(answer.data === undefined ? {} : { structuredContent: answer.data }),
    ...(answer.refused === true ? { isError: true } : {}),
  };
}

/** A refusal the agent can read: the library's own message for the refusals it makes, said plainly otherwise. */
function refusalOf(error: unknown): string {
  const refusals = [MissingReferenceError, SchemaError, DependencyLoopError, UnknownTypeError, NewerSchemaError, ProjectNameError, ConnectionError];
  if (refusals.some((kind) => error instanceof kind)) return `storytree refused that: ${(error as Error).message}`;
  return `storytree could not do that: ${error instanceof Error ? error.message : String(error)}`;
}

/** Storytree could not be reached, or went away: the connection failed, dropped or timed out. */
function isUnreachable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const codes = ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006"];
  return (typeof code === "string" && codes.includes(code)) || (typeof message === "string" && /Connection terminated|timeout exceeded when trying to connect/.test(message));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
