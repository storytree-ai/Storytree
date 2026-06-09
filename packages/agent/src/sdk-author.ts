/**
 * The Claude Agent SDK leaf (ADR-0030): the LIVE {@link PhaseAuthor}. Each authoring slice is one
 * SDK `query()` — the SDK runs the inner loop (subscription-funded, harness-tuned), while the
 * spine keeps every honesty property OUTSIDE it (ADR-0020): write scope is enforced fail-closed by
 * a PreToolUse hook BEFORE any write lands, Bash is not in the tool surface (a shell write would
 * bypass the scope hook), and red/green is never this runtime's to report.
 *
 * Pivot-out posture (ADR-0030 §2): this file is the ONLY place the Agent SDK is imported
 * (ADR-0004's single-import-site rule, widened to this package). The scope predicate is a plain
 * structural function so the orchestrator's `WriteScope` plugs in without an import cycle, and
 * `queryFn` is injectable so every decision in this file is offline-testable.
 */

import * as path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { AuthoringPhase, AuthorResult, PhaseAuthor } from "./phase-author.js";

/** The injectable query seam: the real SDK `query()` or an offline scripted double. */
export type SdkQueryFn = (args: {
  prompt: string;
  options: Options;
}) => AsyncIterable<unknown>;

/** A fail-closed write refusal the hook recorded (mirrors the owned loop's WriteViolation). */
export interface SdkWriteViolation {
  phase: AuthoringPhase;
  tool: string;
  path: string;
  reason: string;
}

/** Per-slice run accounting read off the SDK result message. */
export interface SdkRunInfo {
  phase: AuthoringPhase;
  subtype: string;
  turns: number;
  costUsd: number;
}

/** Constructor args for {@link ClaudeAgentAuthor}. */
export interface ClaudeAgentAuthorArgs {
  /** The workspace the leaf works in — `cwd` for the SDK session; writes outside it are denied. */
  cwd: string;
  /**
   * The per-phase write-ownership predicate (ADR-0020 §2) over WORKSPACE-RELATIVE paths.
   * Structurally compatible with the orchestrator's `WriteScope.isWriteAllowed`.
   */
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
  /** Model for the SDK session. Default: claude-sonnet-4-6. */
  model?: string;
  /** Per-slice turn ceiling. Default: 16. */
  maxTurns?: number;
  /** Per-slice hard budget ceiling in USD (the SDK aborts past it). Default: 1. */
  maxBudgetUsd?: number;
  /** Injected for offline tests; defaults to the real SDK `query()`. */
  queryFn?: SdkQueryFn;
}

/** The tool surface the leaf gets: read/search + scoped writes. NO Bash — see module doc. */
const LEAF_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

/** Tools the PreToolUse scope hook gates (everything that takes a `file_path` write target). */
const WRITE_TOOL_MATCHER = "Write|Edit";

const SYSTEM_PROMPT =
  "You are the leaf agent inside storytree's prove-it gate (red-green honesty loop). Work only " +
  "inside the workspace. Write ONLY the file(s) the phase brief allows — out-of-scope writes are " +
  "refused by policy, and that refusal is final for this phase. You cannot run tests or shell " +
  "commands; the spine observes test results itself. When the brief's deliverable is written, stop.";

/**
 * The pure scope decision the PreToolUse hook applies (exported for offline tests). Fail-closed:
 * a write-shaped call with no extractable path, a path outside `cwd`, or a path the scope denies
 * for this phase is refused without reaching the tool.
 */
export function decideWrite(args: {
  phase: AuthoringPhase;
  cwd: string;
  toolName: string;
  toolInput: unknown;
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
}): { allow: true; relPath: string } | { allow: false; relPath: string; reason: string } {
  const filePath = extractFilePath(args.toolInput);
  if (filePath === null) {
    return {
      allow: false,
      relPath: "(no path)",
      reason: `write refused: '${args.toolName}' call carries no readable file_path (fail-closed)`,
    };
  }
  const rel = path.relative(args.cwd, path.resolve(args.cwd, filePath)).replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return {
      allow: false,
      relPath: rel,
      reason: `write refused: '${filePath}' resolves outside the workspace`,
    };
  }
  if (!args.isWriteAllowed(args.phase, rel)) {
    return {
      allow: false,
      relPath: rel,
      reason: `write refused by phase scope: '${args.toolName}' may not write ${rel} in phase ${args.phase}`,
    };
  }
  return { allow: true, relPath: rel };
}

/** Pull the write target out of a Write/Edit tool input. `null` when unreadable. */
function extractFilePath(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const fp = (input as { file_path?: unknown }).file_path;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

/** The SDK result message fields this author consumes (structural; full union stays SDK-side). */
interface ResultLike {
  type: "result";
  subtype: string;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  errors?: string[];
}

/** Narrow an SDK stream message to the result message. */
function isResult(message: unknown): message is ResultLike {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "result"
  );
}

/**
 * The live {@link PhaseAuthor} on the Claude Agent SDK (ADR-0030). One `query()` per authoring
 * slice; auth is ambient (CLAUDE_CODE_OAUTH_TOKEN / Claude Code login — subscription-funded).
 */
export class ClaudeAgentAuthor implements PhaseAuthor {
  readonly #args: ClaudeAgentAuthorArgs;
  readonly #queryFn: SdkQueryFn;

  /** Every fail-closed refusal the scope hook made, in order (the wall held). */
  readonly violations: SdkWriteViolation[] = [];

  /** Per-slice accounting (subtype/turns/cost) read off each SDK result message. */
  readonly runs: SdkRunInfo[] = [];

  constructor(args: ClaudeAgentAuthorArgs) {
    this.#args = args;
    this.#queryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));
  }

  /** Total SDK-reported cost across slices (USD). Subscription-billed, but always surfaced. */
  get totalCostUsd(): number {
    return this.runs.reduce((sum, r) => sum + r.costUsd, 0);
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
    const options: Options = {
      cwd: this.#args.cwd,
      model: this.#args.model ?? "claude-sonnet-4-6",
      maxTurns: this.#args.maxTurns ?? 16,
      maxBudgetUsd: this.#args.maxBudgetUsd ?? 1,
      tools: LEAF_TOOLS,
      allowedTools: LEAF_TOOLS,
      permissionMode: "bypassPermissions",
      systemPrompt: SYSTEM_PROMPT,
      hooks: {
        PreToolUse: [
          {
            matcher: WRITE_TOOL_MATCHER,
            hooks: [
              async (input) => {
                if (input.hook_event_name !== "PreToolUse") {
                  return {};
                }
                const decision = decideWrite({
                  phase,
                  cwd: this.#args.cwd,
                  toolName: input.tool_name,
                  toolInput: input.tool_input,
                  isWriteAllowed: this.#args.isWriteAllowed,
                });
                if (decision.allow) {
                  return {};
                }
                this.violations.push({
                  phase,
                  tool: input.tool_name,
                  path: decision.relPath,
                  reason: decision.reason,
                });
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: decision.reason,
                  },
                };
              },
            ],
          },
        ],
      },
    };

    let result: ResultLike | undefined;
    try {
      for await (const message of this.#queryFn({ prompt, options })) {
        if (isResult(message)) {
          result = message;
        }
      }
    } catch (e) {
      return { ok: false, error: `SDK session failed: ${(e as Error).message}` };
    }

    if (result === undefined) {
      return { ok: false, error: "SDK session ended without a result message (fail-closed)" };
    }
    this.runs.push({
      phase,
      subtype: result.subtype,
      turns: result.num_turns,
      costUsd: result.total_cost_usd,
    });
    if (result.subtype !== "success" || result.is_error) {
      const detail = result.errors !== undefined && result.errors.length > 0
        ? `: ${result.errors.join("; ")}`
        : "";
      return { ok: false, error: `SDK session ${result.subtype}${detail}` };
    }
    return { ok: true };
  }
}
