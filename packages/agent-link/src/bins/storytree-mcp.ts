/**
 * `storytree-mcp`: the storytree tool server (capability 6 · Agent tools, stories/agent-link.md),
 * which Claude Code or Codex starts for each session and talks to over stdin and stdout. It works
 * in the session's folder: Claude Code names it in CLAUDE_PROJECT_DIR, and both harnesses start
 * the server there. Nothing but the protocol is ever written to stdout.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createAgentTools } from "../tools/index.js";

const folder = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const tools = createAgentTools({ folder, env: process.env });

let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  void tools.close().finally(() => process.exit(0));
}
process.stdin.on("close", stop);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);

await tools.server.connect(new StdioServerTransport());
