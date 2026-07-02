/**
 * The story-author spawn runner: a write-scoped SDK session fenced to the work-hierarchy
 * surface (stories/**). The caller injects the rendered story-author system prompt; this
 * module does NOT render it (rendering is spawn-deps-composition's contract — keeping this
 * module library-free and the agent package's boundary clean).
 *
 * Write fence: a fail-closed PreToolUse hook denies every Write/Edit whose workspace-relative
 * path falls outside the injectable isWriteAllowed predicate (default: stories/**) BEFORE the
 * write lands. Bash is never in the tool surface — a shell write would bypass the fence.
 *
 * Result: { ok: true, summary, turns?, costUsd? } or { ok: false, error } — NEVER a verdict
 * (ADR-0091: the shape is the wall; there is nothing verdict-like to hand in).
 *
 * Turn cap (default 16) is the runaway brake; no USD ceiling by default (ADR-0130/0131).
 */

import * as path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { SdkQueryFn } from "./sdk-author.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The tool surface: read/search + scoped writes. NO Bash (a shell write bypasses the fence). */
const LEAF_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

/** The PreToolUse hook pattern: gate every Write and Edit call. */
const WRITE_TOOL_MATCHER = "Write|Edit";

/** Default write-scope predicate: the work-hierarchy surface only (stories/**). */
const DEFAULT_IS_WRITE_ALLOWED = (relPath: string): boolean =>
  relPath.startsWith("stories/");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Constructor args for {@link runSpawnStoryAuthor}. */
export interface SpawnStoryAuthorArgs {
  /**
   * The rendered story-author agent system prompt — injected by the caller
   * (rendering is spawn-deps-composition's contract, not this module's).
   */
  systemPrompt: string;
  /** The task prompt for this session. */
  userPrompt: string;
  /** Working directory for the SDK session. */
  cwd: string;
  /**
   * Write-ownership predicate over workspace-relative paths.
   * Default: (relPath) => relPath.startsWith("stories/") — the work-hierarchy surface.
   * Injectable so the test drives both arms offline.
   */
  isWriteAllowed?: (relPath: string) => boolean;
  /** Model for the session. Default: claude-sonnet-4-6. */
  model?: string;
  /**
   * Per-session turn ceiling — the runaway brake (ADR-0130). Default: 16.
   * The caller may override via maxTurns for short/long sessions.
   */
  maxTurns?: number;
  /**
   * OPTIONAL hard budget ceiling in USD (the SDK aborts past it). Default: NONE (ADR-0130).
   * The session is subscription-funded (ADR-0030), so the SDK's metered total_cost_usd is a
   * phantom; maxTurns is the genuine runaway brake. Pass only when the operator opts in.
   */
  maxBudgetUsd?: number;
  /** Injected for offline tests; defaults to the real SDK query(). */
  queryFn?: SdkQueryFn;
}

/**
 * The spawn result — never a verdict (ADR-0091: the shape is the wall).
 * { ok: true }  — session succeeded; summary is the SDK result.result field.
 * { ok: false } — session failed/ended early; error describes what happened.
 */
export type SpawnStoryAuthorResult =
  | { ok: true; summary: string; turns?: number; costUsd?: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The SDK result-message fields this runner consumes (structural; full union stays SDK-side). */
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

/** Pull the write target out of a Write/Edit tool input. `null` when unreadable. */
function extractFilePath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const fp = (input as { file_path?: unknown }).file_path;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a write-scoped story-author SDK session. Never throws — a failed session returns
 * { ok: false, error } so the caller can decide how to handle it.
 *
 * The write fence is a fail-closed PreToolUse hook: every Write/Edit whose resolved
 * workspace-relative path fails `isWriteAllowed` is DENIED before the write lands.
 * Bash is not in the tool surface (a shell write would bypass the hook).
 */
export async function runSpawnStoryAuthor(
  args: SpawnStoryAuthorArgs,
): Promise<SpawnStoryAuthorResult> {
  const queryFn: SdkQueryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));
  const isWriteAllowed = args.isWriteAllowed ?? DEFAULT_IS_WRITE_ALLOWED;
  const cwd = args.cwd;

  const options: Options = {
    cwd,
    model: args.model ?? "claude-sonnet-4-6",
    maxTurns: args.maxTurns ?? 16,
    // No USD ceiling by default (ADR-0130): subscription-funded (ADR-0030), so a metered dollar
    // cap is a phantom — maxTurns above is the runaway brake. Pass maxBudgetUsd ONLY when set.
    ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
    tools: LEAF_TOOLS,
    allowedTools: LEAF_TOOLS,
    permissionMode: "bypassPermissions",
    systemPrompt: args.systemPrompt,
    hooks: {
      PreToolUse: [
        {
          matcher: WRITE_TOOL_MATCHER,
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PreToolUse") return {};

              const filePath = extractFilePath(input.tool_input);
              if (filePath === null) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `write refused: '${input.tool_name}' call carries no readable file_path (fail-closed)`,
                  },
                };
              }

              const rel = path
                .relative(cwd, path.resolve(cwd, filePath))
                .replace(/\\/g, "/");

              if (rel.startsWith("..") || path.isAbsolute(rel)) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `write refused: '${filePath}' resolves outside the workspace`,
                  },
                };
              }

              if (!isWriteAllowed(rel)) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `write refused by scope: '${input.tool_name}' may not write '${rel}' (outside stories/**)`,
                  },
                };
              }

              return {};
            },
          ],
        },
      ],
    },
  };

  let result: ResultLike | undefined;
  try {
    for await (const message of queryFn({ prompt: args.userPrompt, options })) {
      if (isResult(message)) result = message;
    }
  } catch (e) {
    return { ok: false, error: `SDK session failed: ${(e as Error).message}` };
  }

  if (result === undefined) {
    return {
      ok: false,
      error: "SDK session ended without a result message (fail-closed)",
    };
  }

  if (result.subtype !== "success" || result.is_error) {
    const detail =
      result.errors !== undefined && result.errors.length > 0
        ? `: ${result.errors.join("; ")}`
        : "";
    return { ok: false, error: `SDK session ${result.subtype}${detail}` };
  }

  return {
    ok: true,
    summary: result.result ?? "",
    turns: result.num_turns,
    costUsd: result.total_cost_usd,
  };
}
