/**
 * The headless orchestrator runner (ADR-0108 Phase 1):
 * A single read-only SDK session that runs an injected system prompt with the orientation
 * tool surface wired (tree/library/noticeboard), surfaces the agent's final proposal text,
 * and fails closed on a dead or empty session — one session at a time.
 *
 * Mirrors `runSdkCurator` with one key difference: where the curator sets `tools: []`
 * (its neighbourhood is in the prompt), this runner wires the read-only orientation tool
 * surface via `createSdkMcpServer` and `allowedTools`.
 *
 * NO Write/Edit/Bash — Phase 1 is read/propose only.
 * ONE SESSION AT A TIME — a second concurrent run is refused (ADR-0108 decision 6).
 */

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { SdkQueryFn } from "./sdk-author.js";
import { buildOrientationTools } from "./orientation-tools.js";
import type { OrientationRunner } from "./orientation-tools.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeadlessOrchestratorArgs {
  /** The orchestrator agent system prompt (rendered from the Library by the caller). */
  systemPrompt: string;
  /** The user prompt: the session's task (orient and propose). */
  userPrompt: string;
  /** Working directory for the SDK session. Defaults to process.cwd(). */
  cwd?: string;
  /**
   * Injectable runner for the orientation tools (the real CLI `run(argv, deps)` or an offline
   * stub). Defaults to a no-op stub when absent (offline tests that don't exercise the runner).
   */
  runner?: OrientationRunner;
  /** Model for the session. Default: claude-sonnet-4-6. */
  model?: string;
  /** Turn ceiling. Default: 16. */
  maxTurns?: number;
  /** Hard budget ceiling in USD (the SDK aborts past it). Default: 1. */
  maxBudgetUsd?: number;
  /** Injected for offline tests; defaults to the real SDK `query()`. */
  queryFn?: SdkQueryFn;
}

export interface HeadlessOrchestratorResult {
  ok: boolean;
  /**
   * The agent's final proposal text — the `result` field of the SDK success result message.
   * Present only when `ok` is true.
   */
  proposal?: string;
  /** SDK-reported cost in USD (surfaced even on failure when a result message was received). */
  costUsd?: number;
  /** Number of turns the SDK ran (present on success). */
  turns?: number;
  /** Error description when `ok` is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Single-session guard (ADR-0108 decision 6)
// ---------------------------------------------------------------------------

/** True while one headless orchestrator session is in flight. */
let inFlight = false;

// ---------------------------------------------------------------------------
// SDK result-message type (structural; full union stays SDK-side)
// ---------------------------------------------------------------------------

interface ResultLike {
  type: "result";
  subtype: string;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  /** The final assistant text on a successful result. */
  result?: string;
  errors?: string[];
}

function isResult(message: unknown): message is ResultLike {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "result"
  );
}

// ---------------------------------------------------------------------------
// Default runner (offline no-op stub — returns a minimal envelope body)
// ---------------------------------------------------------------------------

const defaultRunner: OrientationRunner = async (_argv, _deps) => ({
  ok: false,
  body: "(orientation runner not configured — inject a runner for real orientation)",
});

/** The in-process MCP server name the orientation tools live under (`mcp__orientation__<tool>`). */
const ORIENTATION_SERVER = "orientation";

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run the headless orchestrator's single read-only SDK session. Never throws — a failed
 * session returns `{ ok: false, error }` so the enclosing composition stays robust.
 *
 * A second concurrent call while one session is in flight is refused with a typed result
 * (ADR-0108 decision 6: one session at a time; the refusal is never a thrown crash).
 */
export async function runHeadlessOrchestrator(
  args: HeadlessOrchestratorArgs,
): Promise<HeadlessOrchestratorResult> {
  // Single-session guard — checked and set synchronously BEFORE any await so it is visible
  // to any synchronously-following call on the same tick.
  if (inFlight) {
    return {
      ok: false,
      error: "session in-flight: a concurrent session is already running",
    };
  }
  inFlight = true;

  try {
    const runner = args.runner ?? defaultRunner;
    const orientationTools = buildOrientationTools(runner, { store: null });

    // MCP tool names follow the mcp__<server>__<tool> convention so the model can call them.
    const allowedTools = orientationTools.map(
      (t) => `mcp__${ORIENTATION_SERVER}__${t.name}`,
    );

    const queryFn: SdkQueryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));

    const options: Options = {
      cwd: args.cwd ?? process.cwd(),
      model: args.model ?? "claude-sonnet-4-6",
      maxTurns: args.maxTurns ?? 16,
      maxBudgetUsd: args.maxBudgetUsd ?? 1,
      // Read-only by construction: no Write/Edit/Bash in tools or allowedTools (Phase 1).
      tools: [],
      allowedTools,
      permissionMode: "bypassPermissions",
      systemPrompt: args.systemPrompt,
      mcpServers: {
        [ORIENTATION_SERVER]: createSdkMcpServer({
          name: ORIENTATION_SERVER,
          version: "1.0.0",
          tools: orientationTools.map((ot) =>
            tool(ot.name, `Read-only ${ot.name} orientation command.`, {}, async () => {
              const text = await ot.call();
              return { content: [{ type: "text" as const, text }] };
            }),
          ),
        }),
      },
    };

    let result: ResultLike | undefined;
    try {
      for await (const message of queryFn({ prompt: args.userPrompt, options })) {
        if (isResult(message)) result = message;
      }
    } catch (e) {
      return {
        ok: false,
        error: `SDK session failed: ${(e as Error).message}`,
      };
    }

    if (result === undefined) {
      return {
        ok: false,
        error: "SDK session ended without a result message",
      };
    }

    const costUsd = result.total_cost_usd;
    const turns = result.num_turns;

    if (result.subtype !== "success" || result.is_error) {
      const detail =
        result.errors !== undefined && result.errors.length > 0
          ? `: ${result.errors.join("; ")}`
          : "";
      return {
        ok: false,
        error: `SDK session ${result.subtype}${detail}`,
        costUsd,
      };
    }

    return {
      ok: true,
      proposal: result.result ?? "",
      costUsd,
      turns,
    };
  } finally {
    inFlight = false;
  }
}
