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
import { z } from "zod";

import type { SdkQueryFn } from "./sdk-author.js";
import { buildOrientationTools } from "./orientation-tools.js";
import type { OrientationRunner } from "./orientation-tools.js";
import { buildSpawnTools, SPAWN_SERVER } from "./spawn-tool-surface.js";
import type { SpawnSurfaceDeps } from "./spawn-tool-surface.js";

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
   * Injectable runner for the orientation tools (the real CLI `run(argv, deps)`). The orientation
   * tool surface is wired ONLY when a runner is present (ADR-0108 §7 scale-down): with no runner,
   * NO orientation tools are advertised — wiring them to a dead stub just invited the agent to make
   * useless tool calls (a wasted turn + a "runner not configured" line that leaked into the reply).
   * Absent → a plain conversational session over the system prompt, no orientation surface.
   */
  runner?: OrientationRunner;
  /** Model for the session. Default: claude-opus-4-8 (the orchestrator runs on the most capable
   *  model — the §7 scale-down removed the per-message bloat, so Opus's latency is acceptable). */
  model?: string;
  /**
   * Turn ceiling for the orchestrator session — the runaway brake.
   *
   * Default: NONE — the session runs UNBOUNDED (ADR-0151, re-deciding ADR-0130 for the
   * orchestrator-session path). The orchestrator session is the HUMAN-WATCHED loop (the desktop chat
   * and the terminal `orchestrate` command): the owner sees it stream and can stop a genuine hang, so
   * a fixed turn cap that false-fails a long-but-healthy orient/propose (the spawn-visibility symptom)
   * costs more than it protects. Pass a positive value ONLY to RE-impose a cap (debugging / a
   * bounded run); absent, no `maxTurns` is handed to the SDK. This lifts the cap for the orchestrator
   * SESSION only — the inner-loop builder leaf (`sdk-author.ts`) and the spawned story-author keep
   * their own runaway brakes (ADR-0130 unchanged there).
   */
  maxTurns?: number;
  /**
   * OPTIONAL hard budget ceiling in USD (the SDK aborts past it). Default: NONE — no USD ceiling unless
   * an explicit value is set (ADR-0131, completing ADR-0130). The session is subscription-funded
   * (ADR-0030), so the SDK's metered `total_cost_usd` is a phantom; the {@link maxTurns} cap is the
   * runaway brake. The per-session budget control ADR-0108 deferred is resolved here in the no-ceiling
   * direction — an operator may still opt into a cap via `orchestrate --budget`.
   */
  maxBudgetUsd?: number;
  /**
   * Optional sink for assistant TEXT DELTAS as they stream from the SDK (ADR-0108 Phase 2 streaming).
   * When provided, the session enables `includePartialMessages` and forwards each
   * `content_block_delta`/`text_delta` fragment here AS IT ARRIVES — so a consuming surface (the chat
   * panel) can render tokens live instead of waiting for the whole multi-turn session to finish. Omit
   * for a non-streaming consumer (the terminal `orchestrate` command) — partial messages stay off.
   * The AUTHORITATIVE final proposal is still the result message's `result`; deltas are a live preview,
   * never the verdict.
   */
  onDelta?: (text: string) => void;
  /**
   * Optional sink for EVERY SDK message as it streams (the trace seam, ADR-0108 §7). Unlike
   * `onDelta` (assistant prose only), this fires for the whole conversation — system init, each
   * assistant turn (text + tool_use), each tool_result, and the terminal result — so a caller can
   * capture/surface what the agent actually DID each turn (the phase/tool trail), not just its answer.
   * Raw SDK message shape (the consumer narrows structurally); never throws into the loop. Omit when
   * no trace is needed (the default).
   */
  onMessage?: (message: unknown) => void;
  /** Injected for offline tests; defaults to the real SDK `query()`. */
  queryFn?: SdkQueryFn;
  /**
   * OPTIONAL spawn surface deps: when present, the session mounts `spawn_story_author`
   * and `spawn_builder` as claim-gated MCP tools. Absent → the session is byte-identical
   * to the propose-only surface — no spawn tools are advertised (§7 scale-down mirror).
   *
   * The chat keeps `tools: []` regardless — spawn power, not write power (ADR-0137 d.1).
   * Writes happen inside the SPAWNED sessions under their own per-scope fences.
   */
  spawn?: SpawnSurfaceDeps;
}

export interface HeadlessOrchestratorResult {
  ok: boolean;
  /**
   * The agent's final proposal text — the `result` field of the SDK success result message.
   * Present only when `ok` is true.
   */
  proposal?: string;
  /**
   * The unit id the agent declared via a `propose_unit` tool_use message (ADR-0108 d.3).
   * This is a structural declaration captured from the streamed `tool_use` block — not a
   * regex over the proposal text — and is therefore non-spoofable. Present only when the
   * agent actually called `propose_unit` during the session. `undefined` when no call was
   * made; the human's ACCEPT is a separate subsequent act.
   */
  proposedUnitId?: string;
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

/**
 * Pull the assistant text fragment out of a streaming partial message, or `null` when the message
 * is not a text delta. Structural narrowing (mirrors {@link isResult}) over the SDK's
 * `SDKPartialAssistantMessage` shape — `{ type: "stream_event", event: <BetaRawMessageStreamEvent> }`
 * — drilling to a `content_block_delta` event carrying a `text_delta`. Non-text deltas (tool-input
 * JSON, thinking, signatures) and every non-partial message return `null`, so only assistant prose
 * streams to `onDelta`. Kept structural (no SDK type import beyond what this file already pins) so a
 * partial-message reshape surfaces in the delta tests, not as a silent stream that stops flowing.
 */
function extractTextDelta(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null;
  if ((message as { type?: unknown }).type !== "stream_event") return null;
  const event = (message as { event?: unknown }).event;
  if (typeof event !== "object" || event === null) return null;
  if ((event as { type?: unknown }).type !== "content_block_delta") return null;
  const delta = (event as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return null;
  if ((delta as { type?: unknown }).type !== "text_delta") return null;
  const text = (delta as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

/**
 * Extract the `unitId` from an assistant message carrying a `propose_unit` tool_use block,
 * or `null` when the message is not a `propose_unit` call.
 * Structural narrowing over the complete SDK assistant message shape
 * (`{ type: "assistant", message: { content: [ { type: "tool_use", name: "mcp__proposal__propose_unit", input: { unitId } } ] } }`).
 * Distinct from {@link extractTextDelta} which handles streaming partial messages.
 */
function extractProposedUnit(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null;
  if ((message as { type?: unknown }).type !== "assistant") return null;
  const inner = (message as { message?: unknown }).message;
  if (typeof inner !== "object" || inner === null) return null;
  const content = (inner as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (typeof item !== "object" || item === null) continue;
    if ((item as { type?: unknown }).type !== "tool_use") continue;
    if ((item as { name?: unknown }).name !== `mcp__${PROPOSAL_SERVER}__propose_unit`) continue;
    const input = (item as { input?: unknown }).input;
    if (typeof input !== "object" || input === null) continue;
    const unitId = (input as { unitId?: unknown }).unitId;
    if (typeof unitId === "string") return unitId;
  }
  return null;
}

/** The in-process MCP server name the orientation tools live under (`mcp__orientation__<tool>`). */
const ORIENTATION_SERVER = "orientation";

/** The in-process MCP server name the proposal tool lives under (`mcp__proposal__propose_unit`). */
const PROPOSAL_SERVER = "proposal";

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
    // Orientation tools are wired ONLY when a real runner is present (ADR-0108 §7 scale-down). With
    // no runner there is nothing for them to read, so advertising them to a dead stub just burned a
    // turn on useless calls and leaked "(orientation runner not configured)" into the reply. No
    // runner → no orientation surface → a plain conversational turn over the system prompt.
    const orientationTools =
      args.runner !== undefined ? buildOrientationTools(args.runner, { store: null }) : [];

    // Spawn tools are wired ONLY when spawn deps are present (same §7 scale-down mirror as
    // orientation tools). Absent deps → no spawn tools advertised → byte-identical to Phase-1/2.
    const spawnTools = args.spawn !== undefined ? buildSpawnTools(args.spawn) : [];

    // MCP tool names follow the mcp__<server>__<tool> convention so the model can call them.
    // The propose_unit tool is always available (it is the non-spoofable declaration surface).
    const allowedTools = [
      `mcp__${PROPOSAL_SERVER}__propose_unit`,
      ...orientationTools.map((t) => `mcp__${ORIENTATION_SERVER}__${t.name}`),
      ...spawnTools.map((t) => `mcp__${SPAWN_SERVER}__${t.name}`),
    ];

    const queryFn: SdkQueryFn = args.queryFn ?? ((q): AsyncIterable<unknown> => query(q));

    // Streaming is opt-in per consumer: only enable partial messages when a delta sink is wired
    // (the chat panel). The terminal `orchestrate` command omits onDelta and pays no streaming cost.
    const wantsDeltas = args.onDelta !== undefined;

    const options: Options = {
      cwd: args.cwd ?? process.cwd(),
      model: args.model ?? "claude-opus-4-8",
      // No turn ceiling by default (ADR-0151, re-deciding ADR-0130 for the orchestrator-session path):
      // the orchestrator session is the human-watched loop, so a fixed cap that false-fails a healthy
      // long orient/propose costs more than it protects. Pass maxTurns ONLY to RE-impose a cap.
      ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
      // No USD ceiling by default (ADR-0131, completing ADR-0130): subscription-funded (ADR-0030), so a
      // metered dollar cap is a phantom. Pass maxBudgetUsd ONLY when set.
      ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
      // Surface assistant token deltas as they generate (live chat) — see onDelta/extractTextDelta.
      ...(wantsDeltas ? { includePartialMessages: true } : {}),
      // Read-only by construction: no Write/Edit/Bash in tools or allowedTools (Phase 1).
      tools: [],
      allowedTools,
      permissionMode: "bypassPermissions",
      systemPrompt: args.systemPrompt,
      // The proposal MCP server is always mounted (the non-spoofable propose_unit tool).
      // The orientation MCP server is only mounted when a runner is present (§7 scale-down).
      // The spawn MCP server is only mounted when spawn deps are present (same §7 mirror).
      mcpServers: {
        [PROPOSAL_SERVER]: createSdkMcpServer({
          name: PROPOSAL_SERVER,
          version: "1.0.0",
          tools: [
            tool(
              "propose_unit",
              "Declare the proposed next unit id. Call this once to signal which unit you are " +
                "proposing as the next work item. Read-only: performs no build, sign, or land " +
                "action — this is the agent's PROPOSAL; the human's ACCEPT is a separate act " +
                "(ADR-0108 d.3).",
              { unitId: z.string().describe("The unit id to propose as the next work item.") },
              async ({ unitId }) => ({
                content: [{ type: "text" as const, text: `Recorded proposed unit: ${unitId}` }],
              }),
            ),
          ],
        }),
        ...(orientationTools.length > 0
          ? {
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
            }
          : {}),
        ...(spawnTools.length > 0
          ? {
              [SPAWN_SERVER]: createSdkMcpServer({
                name: SPAWN_SERVER,
                version: "1.0.0",
                tools: spawnTools,
              }),
            }
          : {}),
      },
    };

    let result: ResultLike | undefined;
    let proposedUnitId: string | undefined;
    try {
      for await (const message of queryFn({ prompt: args.userPrompt, options })) {
        // The trace seam (ADR-0108 §7): surface every message so a caller can capture the agent's
        // turn/tool trail. Guarded so a throwing sink can never break the session loop.
        if (args.onMessage !== undefined) {
          try {
            args.onMessage(message);
          } catch {
            /* a trace sink must never break the session */
          }
        }
        // Capture the proposed unit id from a propose_unit tool_use block (ADR-0108 d.3).
        // Loop-level inspection (not the MCP handler) so this works for both the scripted
        // offline test and the live SDK — both stream the assistant's tool_use through here.
        const pid = extractProposedUnit(message);
        if (pid !== null) proposedUnitId = pid;
        if (isResult(message)) {
          result = message;
        } else if (wantsDeltas) {
          // Forward each streamed assistant text fragment as it arrives (live token streaming).
          const delta = extractTextDelta(message);
          if (delta !== null && delta.length > 0) args.onDelta?.(delta);
        }
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
      ...(proposedUnitId !== undefined ? { proposedUnitId } : {}),
    };
  } finally {
    inFlight = false;
  }
}
