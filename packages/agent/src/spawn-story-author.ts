/**
 * The write-scoped spawn runner: a role-neutral SDK session whose writes are fenced fail-closed
 * to a CALLER-DECLARED scope. The caller injects the rendered agent system prompt AND the
 * `isWriteAllowed` predicate; this module does NOT render prompts or pick a scope (rendering +
 * scope-building are spawn-deps-composition's contract — keeping this module library-free and the
 * agent package's boundary clean).
 *
 * ONE CORE, TWO ROLES (ADR-0160 D2 — generalise, never fork): `runSpawnWriteScoped` is the shared
 * write-fence core. `runSpawnStoryAuthor` is the thin wrapper defaulting the scope to the
 * work-hierarchy surface (stories/**); the glue-worker spawn (glue-deps-composition) calls the SAME
 * core with a caller-declared PATH predicate. There is no second fence and no copy of the hook.
 *
 * Write fence: a fail-closed PreToolUse hook denies every Write/Edit whose workspace-relative
 * path fails the injected `isWriteAllowed` predicate BEFORE the write lands. Bash is never in the
 * tool surface — a shell write would bypass the fence.
 *
 * Result: { ok: true, summary, turns?, costUsd?, violations } or { ok: false, error, violations }
 * — NEVER a verdict (ADR-0091: the shape is the wall; there is nothing verdict-like to hand in).
 * Every denied write is recorded as a typed violation on the result, so the caller can see the
 * fence held without the denial ever having landed.
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

/** Constructor args for the role-neutral core {@link runSpawnWriteScoped}. */
export interface SpawnWriteScopedArgs {
  /**
   * The rendered agent system prompt — injected by the caller
   * (rendering is spawn-deps-composition's contract, not this module's).
   */
  systemPrompt: string;
  /** The task prompt for this session — threaded to the SDK session verbatim. */
  userPrompt: string;
  /** Working directory for the SDK session. */
  cwd: string;
  /**
   * Write-ownership predicate over workspace-relative paths — REQUIRED (the core takes no
   * default; each role injects its own scope: stories/** for the story-author wrapper, the
   * caller-declared path fence for the glue worker). A Write/Edit whose resolved
   * workspace-relative path fails this predicate is DENIED fail-closed before it lands.
   */
  isWriteAllowed: (relPath: string) => boolean;
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
 * Constructor args for {@link runSpawnStoryAuthor} — the story-author wrapper. Same shape as the
 * core but with the `isWriteAllowed` predicate OPTIONAL: absent → the work-hierarchy default
 * (stories/**). Kept as its own type so the existing story-author callers/tests are unchanged.
 */
export interface SpawnStoryAuthorArgs extends Omit<SpawnWriteScopedArgs, "isWriteAllowed"> {
  /**
   * Write-ownership predicate over workspace-relative paths.
   * Default: (relPath) => relPath.startsWith("stories/") — the work-hierarchy surface.
   * Injectable so the test drives both arms offline.
   */
  isWriteAllowed?: (relPath: string) => boolean;
}

/** A write the fence denied — recorded on the result, never landed. */
export interface ScopeViolation {
  /** The tool that attempted the write (Write | Edit). */
  tool: string;
  /** The path as the tool call carried it ("" when unreadable — the fail-closed arm). */
  path: string;
  /** The denial reason the hook returned. */
  reason: string;
}

/**
 * The spawn result — never a verdict (ADR-0091: the shape is the wall).
 * { ok: true }  — session succeeded; summary is the SDK result.result field.
 * { ok: false } — session failed/ended early; error describes what happened.
 * Both arms carry the fence's denied writes as typed violations (empty when the scope held).
 */
export type SpawnWriteScopedResult =
  | {
      ok: true;
      summary: string;
      turns?: number;
      costUsd?: number;
      violations: ScopeViolation[];
    }
  | { ok: false; error: string; violations: ScopeViolation[] };

/** The story-author spawn result — the core result shape (kept as a named alias for callers). */
export type SpawnStoryAuthorResult = SpawnWriteScopedResult;

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
 * Run a write-scoped SDK session against a CALLER-DECLARED write fence (the role-neutral core,
 * ADR-0160 D2). Never throws — a failed session returns { ok: false, error } so the caller can
 * decide how to handle it.
 *
 * The write fence is a fail-closed PreToolUse hook: every Write/Edit whose resolved
 * workspace-relative path fails the injected `isWriteAllowed` is DENIED before the write lands.
 * Bash is not in the tool surface (a shell write would bypass the hook).
 *
 * Both spawn roles call this ONE core: the story-author wrapper below (stories/** default) and the
 * glue-worker spawn (a caller-declared path fence, built in spawn-deps-composition).
 */
export async function runSpawnWriteScoped(
  args: SpawnWriteScopedArgs,
): Promise<SpawnWriteScopedResult> {
  const queryFn: SdkQueryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));
  const isWriteAllowed = args.isWriteAllowed;
  const cwd = args.cwd;
  const violations: ScopeViolation[] = [];

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

              // Record the denial on the result AND return the deny decision — the write
              // never lands, and the caller can see the fence held (the typed violation).
              const deny = (violationPath: string, reason: string): object => {
                violations.push({ tool: input.tool_name, path: violationPath, reason });
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: reason,
                  },
                };
              };

              const filePath = extractFilePath(input.tool_input);
              if (filePath === null) {
                return deny(
                  "",
                  `write refused: '${input.tool_name}' call carries no readable file_path (fail-closed)`,
                );
              }

              const rel = path
                .relative(cwd, path.resolve(cwd, filePath))
                .replace(/\\/g, "/");

              if (rel.startsWith("..") || path.isAbsolute(rel)) {
                return deny(
                  filePath,
                  `write refused: '${filePath}' resolves outside the workspace`,
                );
              }

              if (!isWriteAllowed(rel)) {
                return deny(
                  rel,
                  `write refused by scope: '${input.tool_name}' may not write '${rel}' (outside stories/**)`,
                );
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
    return {
      ok: false,
      error: `SDK session failed: ${(e as Error).message}`,
      violations,
    };
  }

  if (result === undefined) {
    return {
      ok: false,
      error: "SDK session ended without a result message (fail-closed)",
      violations,
    };
  }

  if (result.subtype !== "success" || result.is_error) {
    const detail =
      result.errors !== undefined && result.errors.length > 0
        ? `: ${result.errors.join("; ")}`
        : "";
    return {
      ok: false,
      error: `SDK session ${result.subtype}${detail}`,
      violations,
    };
  }

  return {
    ok: true,
    summary: result.result ?? "",
    turns: result.num_turns,
    costUsd: result.total_cost_usd,
    violations,
  };
}

/**
 * Run a write-scoped STORY-AUTHOR SDK session — a thin wrapper over {@link runSpawnWriteScoped}
 * that defaults the write fence to the work-hierarchy surface (stories/**). One of the two callers
 * of the shared core (ADR-0160 D2): the generalisation kept this entry byte-compatible, so the
 * existing story-author spawn (and its tests) are unchanged. The glue-worker spawn is the other
 * caller (a caller-declared path fence, built in spawn-deps-composition).
 */
export async function runSpawnStoryAuthor(
  args: SpawnStoryAuthorArgs,
): Promise<SpawnStoryAuthorResult> {
  return runSpawnWriteScoped({
    ...args,
    isWriteAllowed: args.isWriteAllowed ?? DEFAULT_IS_WRITE_ALLOWED,
  });
}
