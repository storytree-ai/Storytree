/**
 * Capability 6 · Agent tools, the MCP server (stories/agent-link.md). Not built yet: this stub
 * serves no tools, so the contracts' tests have something to fail against.
 */
import { McpServer } from "@modelcontextprotocol/server";

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

export function createAgentTools(_options: AgentToolOptions): AgentTools {
  const server = new McpServer({ name: "storytree", version: "0.3.0" });
  return { server, close: () => server.close() };
}
