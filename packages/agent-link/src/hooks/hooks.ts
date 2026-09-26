/**
 * Capability 3 · Hooks (stories/agent-link.md): the commands Claude Code and Codex run by
 * themselves when a session starts, after every file edit and shell command, and when it ends, each
 * adding one line about that session to the agent activity log, so an agent that never calls
 * storytree still shows up. They always exit cleanly and never print, so they can never break the
 * agent, and when storytree isn't running they do nothing. Two more name the session's agents
 * (ADR-0629 D2): one after a subagent is started, and one just before each call to storytree's own
 * tools, which the harness waits for.
 *
 * A hook's input is the harness's own JSON on stdin. hookLines() turns it into lines, and knows
 * nothing of storytree's state; runHook() routes the session's folder (capability 1) and, only when
 * it is a project on a running storytree, opens the log and writes them. Everything a hook does is
 * inside one try: a failure anywhere means nothing is written, never an error the agent sees.
 */
import type { NewLine } from "../activity/index.js";
import { route } from "../routing/index.js";
import { claudeCodeLines } from "./claude-code.js";
import { codexLines } from "./codex.js";

/** What a hook is run with: the command's arguments (the harness first) and its stdin. */
export interface HookInput {
  readonly argv: readonly string[];
  readonly input: string;
}

/** The lines one hook's input makes, and the folder the session was working in. */
export interface HookLines {
  readonly folder: string;
  readonly lines: NewLine[];
}

/** How long a hook waits to reach storytree's database before giving up and writing nothing. */
const CONNECT_TIMEOUT_MS = 2_000;

/**
 * The lines a hook input from `harness` makes, or undefined when it makes none: an event or a tool
 * the log does not record, or input that is not what that harness sends.
 */
export function hookLines(harness: string, input: unknown): HookLines | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  switch (harness) {
    case "claude-code":
      return claudeCodeLines(input as Record<string, unknown>);
    case "codex":
      return codexLines(input as Record<string, unknown>);
    default:
      return undefined;
  }
}

/**
 * Run one hook: read its input, and write its lines to the log of the project its folder belongs
 * to, if storytree is running. Never throws, and never prints.
 */
export async function runHook({ argv, input }: HookInput): Promise<void> {
  try {
    const [harness = ""] = argv;
    const made = hookLines(harness, parse(input));
    if (made === undefined || made.lines.length === 0) return;
    const where = route(made.folder);
    if (where.status !== "routed") return;
    // Only now, with lines to write and somewhere to write them, is the database reached.
    const { openActivityLog } = await import("../activity/index.js");
    const log = await openActivityLog(where.url, { connectTimeoutMs: CONNECT_TIMEOUT_MS });
    try {
      for (const line of made.lines) await log.append(where.project, line);
    } finally {
      await log.close();
    }
  } catch {
    // A hook never breaks the agent: whatever went wrong, nothing is written and nothing is said.
  }
}

function parse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}
