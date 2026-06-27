/**
 * The Claude Agent SDK leaf (ADR-0030): the LIVE {@link PhaseAuthor}. Each authoring slice is one
 * SDK `query()` — the SDK runs the inner loop (subscription-funded, harness-tuned), while the
 * spine keeps every honesty property OUTSIDE it (ADR-0020): write scope is enforced fail-closed by
 * a PreToolUse hook BEFORE any write lands, Bash is not in the tool surface (a shell write would
 * bypass the scope hook), and red/green is never this runtime's to report.
 *
 * Feedback tools (option A): the spine may expose its registered proof/typecheck commands as
 * bounded in-process MCP tools (`mcp__spine__run_proof` …) so the leaf can iterate
 * write→run→fix instead of authoring blind. The tools spawn FIXED commands (the leaf controls
 * zero arguments — not Bash, a doorbell), their output is feedback only, and the attested
 * red/green observations remain the spine's own out-of-band runs after the leaf stops.
 *
 * Pivot-out posture (ADR-0030 §2): this file is the ONLY place the Agent SDK is imported
 * (ADR-0004's single-import-site rule, widened to this package). The scope predicate is a plain
 * structural function so the orchestrator's `WriteScope` plugs in without an import cycle, and
 * `queryFn` is injectable so every decision in this file is offline-testable.
 */

import * as path from "node:path";

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
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

/** The captured outcome of one feedback run (the orchestrator's ShellRunResult, structurally). */
export interface FeedbackRunOutput {
  /** The process exit code, or `null` if it was killed / never ran. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * One spine-registered feedback command exposed to the leaf as an in-process MCP tool
 * (`mcp__spine__<name>`). FEEDBACK ONLY (the option-A seam): `run` spawns a FIXED command the
 * spine registered — the leaf controls zero arguments — and its captured output flows back to the
 * model so it can iterate write→run→fix before stopping. Nothing the leaf sees here is attested:
 * the spine re-runs the proof itself, out-of-band, at CONFIRM_RED/CONFIRM_GREEN (ADR-0020 §3).
 */
export interface FeedbackCommand {
  /** Tool name suffix (e.g. `run_proof`, `run_typecheck`). */
  name: string;
  /** What the model is told the tool does. */
  description: string;
  /** Spawn the fixed registered command and capture its outcome (never throws on a red exit). */
  run: () => Promise<FeedbackRunOutput>;
}

/** Accounting for one bounded feedback run the leaf made. */
export interface SdkFeedbackRun {
  phase: AuthoringPhase;
  tool: string;
  code: number | null;
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
  /**
   * Spine-registered feedback commands exposed to the leaf as bounded in-process MCP tools
   * (`mcp__spine__<name>`). Absent/empty = the pre-option-A blind leaf (no execution feedback).
   */
  feedbackCommands?: FeedbackCommand[];
  /** Per-authoring-slice cap on feedback runs, shared across commands. Default: 5. */
  maxFeedbackRuns?: number;
  /**
   * The per-phase system prompt the leaf runs on (ADR-0051 §4): the RENDERED `red-builder` agent
   * for AUTHOR_TEST, the RENDERED `green-builder` agent for IMPLEMENT, assembled by the CLI from
   * the Library and threaded down. When present it REPLACES the generic base (the feedback closing
   * is still composed on). On the live SDK path it is REQUIRED — see {@link author}: a live leaf
   * with no injected prompt fails closed rather than silently falling back to the generic base
   * (the anti-blindside guarantee). Absent is legal ONLY behind an injected `queryFn` (offline
   * test double), which keeps the generic fallback.
   */
  phasePrompts?: { AUTHOR_TEST: string; IMPLEMENT: string };
  /** Injected for offline tests; defaults to the real SDK `query()`. */
  queryFn?: SdkQueryFn;
}

/** The tool surface the leaf gets: read/search + scoped writes. NO Bash — see module doc. */
const LEAF_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

/** Tools the PreToolUse scope hook gates (everything that takes a `file_path` write target). */
const WRITE_TOOL_MATCHER = "Write|Edit";

/** The in-process MCP server name the feedback tools live under (`mcp__spine__<tool>`). */
const FEEDBACK_SERVER = "spine";

/**
 * SDK result subtypes that mean the leaf hit a COST CEILING (turn limit / USD budget), not a
 * genuine error — so usable work may already be on disk. These map to an `exhausted` {@link AuthorResult}
 * (ADR-0020: a ceiling is a cost guard, not a proof signal), letting the gate fall through to its own
 * observation instead of discarding the paid slice. The other error subtypes (`error_during_execution`,
 * `error_max_structured_output_retries`) are genuine failures with no salvageable work.
 */
const EXHAUSTION_SUBTYPES: ReadonlySet<string> = new Set([
  "error_max_turns",
  "error_max_budget_usd",
]);

/** Default per-slice feedback-run cap (shared across commands). */
const DEFAULT_MAX_FEEDBACK_RUNS = 5;

/** Per-stream character cap on feedback output returned to the model (tail-kept). */
const MAX_FEEDBACK_STREAM_CHARS = 8_000;

const SYSTEM_PROMPT_BASE =
  "You are the leaf agent inside storytree's prove-it gate (red-green honesty loop). Work only " +
  "inside the workspace. Write ONLY the file(s) the phase brief allows — out-of-scope writes are " +
  "refused by policy, and that refusal is final for this phase. ";

/** The blind-leaf closing (no feedback tools wired). */
const SYSTEM_PROMPT_NO_FEEDBACK =
  "You cannot run tests or shell " +
  "commands; the spine observes test results itself. When the brief's deliverable is written, stop.";

/** The option-A closing: bounded feedback runs exist, but the verdict never moves leaf-side. */
const SYSTEM_PROMPT_WITH_FEEDBACK =
  "You cannot run shell commands, but the spine exposes its registered command(s) as bounded " +
  `feedback tools (mcp__${FEEDBACK_SERVER}__*) — use them to check your work and iterate. Their ` +
  "output is FEEDBACK ONLY: the spine re-runs the command itself after you stop, and only that " +
  "observation counts — your own claim of green is never the proof. If you conclude a frozen " +
  "input is itself wrong (e.g. the test you must satisfy but may not edit), stop and say so " +
  "plainly instead of working around it. When the brief's deliverable is written and checked, stop.";

/** The runtime closing the leaf always gets (red/green is the spine's, feedback ≠ verdict). */
function leafClosing(hasFeedback: boolean): string {
  return hasFeedback ? SYSTEM_PROMPT_WITH_FEEDBACK : SYSTEM_PROMPT_NO_FEEDBACK;
}

/** The GENERIC per-slice system prompt (no library agent injected — the scripted/test fallback). */
export function leafSystemPrompt(hasFeedback: boolean): string {
  return SYSTEM_PROMPT_BASE + leafClosing(hasFeedback);
}

/**
 * Compose the per-slice system prompt from an INJECTED agent body (the rendered `red-builder` /
 * `green-builder`, ADR-0051 §4) plus the runtime closing. The agent body carries the role and the
 * write-scope discipline; the closing nails the runtime mechanic the body describes generically —
 * that the spine observes red/green out-of-band and the leaf's own claim is never the proof.
 */
export function composeLeafSystemPrompt(agentBody: string, hasFeedback: boolean): string {
  return `${agentBody.trim()}\n\n${leafClosing(hasFeedback)}`;
}

/**
 * Render one feedback run for the model: exit code first, then tail-truncated streams (failures
 * print last, so the tail is the diagnostic end). Pure — exported for offline tests.
 */
export function formatFeedbackOutput(
  out: FeedbackRunOutput,
  maxCharsPerStream: number = MAX_FEEDBACK_STREAM_CHARS,
): string {
  const clip = (s: string): string =>
    s.length <= maxCharsPerStream
      ? s
      : `[…${s.length - maxCharsPerStream} chars truncated]\n${s.slice(-maxCharsPerStream)}`;
  const verdictless = out.code === 0 ? "exit 0" : `exit ${out.code ?? "none (killed/not run)"}`;
  return [
    `${verdictless} — feedback only; the spine's own out-of-band observation is the verdict.`,
    "--- stdout ---",
    clip(out.stdout) || "(empty)",
    "--- stderr ---",
    clip(out.stderr) || "(empty)",
  ].join("\n");
}

/**
 * Execute one bounded feedback run (the tool handler's whole decision, pure-injectable for
 * offline tests). Budget-exhausted refuses WITHOUT spawning; a spawn failure is returned as an
 * error result (never thrown into the SDK); every run that consumed budget is recorded.
 */
export async function executeFeedback(args: {
  phase: AuthoringPhase;
  command: FeedbackCommand;
  used: number;
  max: number;
  record: (run: SdkFeedbackRun) => void;
}): Promise<{ text: string; isError: boolean }> {
  if (args.used >= args.max) {
    return {
      isError: true,
      text:
        `feedback run budget exhausted (${args.max} runs this slice): stop iterating — finish ` +
        "the deliverable and stop; the spine observes the official result itself.",
    };
  }
  let out: FeedbackRunOutput;
  try {
    out = await args.command.run();
  } catch (e) {
    args.record({ phase: args.phase, tool: args.command.name, code: null });
    return {
      isError: true,
      text: `feedback command failed to run: ${(e as Error).message}`,
    };
  }
  args.record({ phase: args.phase, tool: args.command.name, code: out.code });
  return { isError: false, text: formatFeedbackOutput(out) };
}

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
  /** True when no `queryFn` was injected — i.e. this leaf runs the REAL Agent SDK (live/real). */
  readonly #usesRealSdk: boolean;

  /** Every fail-closed refusal the scope hook made, in order (the wall held). */
  readonly violations: SdkWriteViolation[] = [];

  /** Per-slice accounting (subtype/turns/cost) read off each SDK result message. */
  readonly runs: SdkRunInfo[] = [];

  /** Every bounded feedback run the leaf made, in order (run_proof/run_typecheck, exit codes). */
  readonly feedbackRuns: SdkFeedbackRun[] = [];

  constructor(args: ClaudeAgentAuthorArgs) {
    this.#args = args;
    this.#usesRealSdk = args.queryFn === undefined;
    this.#queryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));
  }

  /**
   * The per-slice base system prompt: the INJECTED rendered agent for this phase (`red-builder` →
   * AUTHOR_TEST, `green-builder` → IMPLEMENT, ADR-0051 §4). Fail-loud on the real SDK path when the
   * injection is absent — the anti-blindside guarantee: a live leaf must run the library agent, NOT
   * a silent generic fallback. The generic base is allowed ONLY behind an injected `queryFn` (the
   * offline test double), so the scripted unit tests keep working without a Library.
   */
  #resolveBasePrompt(
    phase: AuthoringPhase,
  ): { ok: true; base: string } | { ok: false; error: string } {
    const injected = this.#args.phasePrompts?.[phase]?.trim();
    if (injected !== undefined && injected.length > 0) {
      return { ok: true, base: injected };
    }
    if (this.#usesRealSdk) {
      const agent = phase === "AUTHOR_TEST" ? "red-builder" : "green-builder";
      return {
        ok: false,
        error:
          `live leaf has no injected system prompt for phase ${phase}: the rendered ${agent} ` +
          `agent (ADR-0051 §4) was not threaded in. A live SDK leaf MUST run the Library agent, ` +
          `not a generic fallback — wire phasePrompts through resolveProveSpec (no silent fallback).`,
      };
    }
    return { ok: true, base: SYSTEM_PROMPT_BASE };
  }

  /** Total SDK-reported cost across slices (USD). Subscription-billed, but always surfaced. */
  get totalCostUsd(): number {
    return this.runs.reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** The fully-qualified feedback tool names this leaf exposes (empty = blind leaf). */
  get feedbackToolNames(): string[] {
    return (this.#args.feedbackCommands ?? []).map((c) => `mcp__${FEEDBACK_SERVER}__${c.name}`);
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
    const feedback = this.#args.feedbackCommands ?? [];
    const maxFeedbackRuns = this.#args.maxFeedbackRuns ?? DEFAULT_MAX_FEEDBACK_RUNS;
    // The per-SLICE feedback budget: a fresh counter per author() call, shared across commands.
    let feedbackUsed = 0;

    // The system prompt: the injected library agent for this phase + the runtime closing. Resolved
    // BEFORE the SDK loop so a live leaf with no injected prompt fails closed without any spend.
    const base = this.#resolveBasePrompt(phase);
    if (!base.ok) {
      return { ok: false, error: base.error };
    }

    const options: Options = {
      cwd: this.#args.cwd,
      model: this.#args.model ?? "claude-sonnet-4-6",
      maxTurns: this.#args.maxTurns ?? 16,
      maxBudgetUsd: this.#args.maxBudgetUsd ?? 1,
      tools: LEAF_TOOLS,
      allowedTools: [...LEAF_TOOLS, ...this.feedbackToolNames],
      permissionMode: "bypassPermissions",
      systemPrompt: composeLeafSystemPrompt(base.base, feedback.length > 0),
      ...(feedback.length > 0
        ? {
            mcpServers: {
              [FEEDBACK_SERVER]: createSdkMcpServer({
                name: FEEDBACK_SERVER,
                version: "1.0.0",
                tools: feedback.map((command) =>
                  tool(command.name, command.description, {}, async () => {
                    const r = await executeFeedback({
                      phase,
                      command,
                      used: feedbackUsed,
                      max: maxFeedbackRuns,
                      record: (run) => {
                        feedbackUsed += 1;
                        this.feedbackRuns.push(run);
                      },
                    });
                    return {
                      content: [{ type: "text" as const, text: r.text }],
                      ...(r.isError ? { isError: true } : {}),
                    };
                  }),
                ),
              }),
            },
          }
        : {}),
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
      const error = `SDK session ${result.subtype}${detail}`;
      // A turn/budget ceiling is a COST guard, not a proof signal: the leaf may have left usable work
      // on disk, so the gate falls through to its own observation rather than discard the slice
      // (the turn-ceiling cost-leak fix). A genuine error gets no `exhausted` flag — fail closed.
      return EXHAUSTION_SUBTYPES.has(result.subtype)
        ? { ok: false, exhausted: true, error }
        : { ok: false, error };
    }
    return { ok: true };
  }
}
