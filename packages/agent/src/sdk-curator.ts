/**
 * The live librarian-curator on the Claude Agent SDK (ADR-0067): a SINGLE read-only `query()` that
 * judges a story's open-question / proposal neighbourhood and emits its decisions as a STRUCTURED
 * JSON array in its final message — it has NO write tools at all. The spine (packages/cli) parses
 * that output and enacts it kind-fenced; the curator's judgment is never itself a Library mutation.
 *
 * This mirrors the corpus-investigator's structured-final-message contract rather than the leaf's
 * write-tool surface: the curator only READS (its whole neighbourhood is serialized into the user
 * prompt) and proposes — so there is no file-write path to gate, no PreToolUse hook, and the whole
 * decision is offline-testable through the injectable {@link SdkQueryFn} seam (a scripted double
 * yields the JSON + a result message, exactly as the live SDK would).
 *
 * Per ADR-0004/0030 the Agent SDK is imported ONLY in packages/agent — this is the curator's single
 * import site, alongside sdk-author.ts.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

import type { SdkQueryFn } from "./sdk-author.js";

export interface SdkCuratorArgs {
  /** The assembled `librarian-curator` system prompt (rendered from the Library by the caller). */
  systemPrompt: string;
  /** The serialized neighbourhood + the JSON output contract (built by the caller). */
  userPrompt: string;
  /** Working directory for the SDK session. The curator writes nothing; defaults to process.cwd(). */
  cwd?: string;
  /** Model for the session. Default: claude-sonnet-4-6. */
  model?: string;
  /** Turn ceiling — the runaway brake (the curator is single-shot — a low default suffices). Default: 6. */
  maxTurns?: number;
  /**
   * OPTIONAL hard budget ceiling in USD (the SDK aborts past it). Default: NONE — no USD ceiling unless
   * an explicit value is set (ADR-0131, completing ADR-0130). The curator is subscription-funded
   * (ADR-0030/0067), so the SDK's metered `total_cost_usd` is a phantom; the {@link maxTurns} cap (6,
   * single-shot) is the runaway brake.
   */
  maxBudgetUsd?: number;
  /** Injected for offline tests; defaults to the real SDK `query()`. */
  queryFn?: SdkQueryFn;
}

export interface SdkCuratorResult {
  /** True iff the SDK session succeeded; the caller parses {@link text} into curation actions. */
  ok: boolean;
  /** The curator's final message text (the JSON array of intents, on success). */
  text: string;
  costUsd: number;
  turns: number;
  /** Set when `ok` is false — the session never ran clean. */
  error?: string;
}

/** The SDK result-message fields this runner consumes (structural; the full union stays SDK-side). */
interface ResultLike {
  type: "result";
  subtype: string;
  is_error: boolean;
  num_turns: number;
  total_cost_usd: number;
  /** The final assistant text the SDK carries on a successful result. */
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

/**
 * Run the curator's single read-only SDK session. Never throws — a failed session returns
 * `{ ok: false, error }` so the enclosing curation pass stays best-effort (ADR-0067: curation can
 * never fail the build).
 */
export async function runSdkCurator(args: SdkCuratorArgs): Promise<SdkCuratorResult> {
  const queryFn: SdkQueryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));
  const options: Options = {
    cwd: args.cwd ?? process.cwd(),
    model: args.model ?? "claude-sonnet-4-6",
    maxTurns: args.maxTurns ?? 6,
    // No USD ceiling by default (ADR-0131, completing ADR-0130): subscription-funded (ADR-0030/0067), so
    // a metered dollar cap is a phantom — maxTurns above is the brake. Pass maxBudgetUsd ONLY when set.
    ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
    // Read-only by construction: the neighbourhood is in the prompt, the curator only emits JSON.
    tools: [],
    allowedTools: [],
    permissionMode: "bypassPermissions",
    systemPrompt: args.systemPrompt,
  };

  let result: ResultLike | undefined;
  try {
    for await (const message of queryFn({ prompt: args.userPrompt, options })) {
      if (isResult(message)) result = message;
    }
  } catch (e) {
    return { ok: false, text: "", costUsd: 0, turns: 0, error: `SDK session failed: ${(e as Error).message}` };
  }

  if (result === undefined) {
    return { ok: false, text: "", costUsd: 0, turns: 0, error: "SDK session ended without a result message" };
  }
  const costUsd = result.total_cost_usd;
  const turns = result.num_turns;
  if (result.subtype !== "success" || result.is_error) {
    const detail =
      result.errors !== undefined && result.errors.length > 0 ? `: ${result.errors.join("; ")}` : "";
    return { ok: false, text: "", costUsd, turns, error: `SDK session ${result.subtype}${detail}` };
  }
  return { ok: true, text: result.result ?? "", costUsd, turns };
}
