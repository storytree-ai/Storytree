/**
 * Chat-stream adapter (ADR-0108 Phase 2):
 * Wraps the Phase-1 `orchestrate()` composition in an async-generator event stream suitable
 * for SSE delivery. The adapter never throws — a failed session is a terminal `error` event, and
 * a single-session refusal (ADR-0108 d.6) is a distinct terminal `refused` event.
 *
 * Phase 2 surface shape (ADR-0108 d.1 / d.2):
 *   - intake: an HTTP POST body adapted by the route (the adapter itself is transport-agnostic)
 *   - stream: typed ChatStreamEvent values the route serialises as SSE
 *   - read/propose only — no signing, no building, no PR/gate/merge (ADR-0091 / Phase-2 wall)
 *
 * REUSES THE PHASE-1 COMPOSITION (ADR-0108 d.2): calls `orchestrate()` — the same composition
 * the programmatic entry and the terminal `orchestrate` command use. The adapter adapts the
 * composition's result into a stream; it does not re-render the prompt, re-wire the orientation
 * tools, or re-implement the session.
 *
 * OFFLINE-TESTABLE BY INJECTION: the `queryFn` seam is forwarded to `orchestrate()` so the
 * intake → session → stream is proven without live SDK spend (ADR-0010 §5).
 */

import type { Store } from "@storytree/storage-protocol";
import type { SdkQueryFn, OrientationRunner } from "@storytree/agent";

import { orchestrate } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** A terminal done event — the proposal text plus session metrics. */
export interface ChatStreamDoneEvent {
  type: "done";
  proposal: string;
  costUsd: number | undefined;
  turns: number | undefined;
}

/** A terminal error event — emitted instead of throwing when the session fails. */
export interface ChatStreamErrorEvent {
  type: "error";
  error: string;
}

/**
 * A terminal refused event — the single-session guard (ADR-0108 d.6) declined this session because
 * one is already in flight. Distinct from `error`: nothing failed and the session never started, so
 * a thin client can render a "busy — try again" signal rather than a failure. Carries the human
 * reason for the refusal.
 */
export interface ChatStreamRefusedEvent {
  type: "refused";
  reason: string;
}

/** All events the chat stream can emit (discriminated by `type`). */
export type ChatStreamEvent =
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent
  | ChatStreamRefusedEvent;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

/** Arguments for {@link startChatStream}. */
export interface StartChatStreamArgs {
  /** The session intent: what the orchestrator is asked to orient and propose for. */
  intent: string;
  /** The store to render the `session-orchestrator` agent from (seed corpus or live pg store). */
  store: Store;
  /**
   * Injectable SDK query function — an offline scripted double proves the adapter without live
   * spend (ADR-0010 §5). Omit for a live run.
   */
  queryFn?: SdkQueryFn;
  /**
   * The orientation runner the headless session's tools dispatch through. Required for a live run
   * with real orientation; omit for offline tests (the scripted queryFn never dispatches tools).
   */
  runner?: OrientationRunner;
  /** Live SDK leaf model (live run only). */
  model?: string;
  /** Turn ceiling for the live session (live run only). */
  maxTurns?: number;
  /** Hard USD budget ceiling for the live session (live run only). */
  maxBudgetUsd?: number;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Start an orchestrate session and yield its outcome as a typed event stream.
 *
 * The stream always terminates — with a `done` event carrying the proposal text and session
 * metrics, a `refused` event when the single-session guard (ADR-0108 d.6) declines a concurrent
 * session, or an `error` event when the session fails. The stream NEVER throws; any failure
 * (agent absent, SDK error, unexpected exception) is emitted as a typed `error` event so the
 * caller can forward it directly to the SSE client.
 */
export async function* startChatStream(
  args: StartChatStreamArgs,
): AsyncGenerator<ChatStreamEvent> {
  try {
    const result = await orchestrate({
      intent: args.intent,
      store: args.store,
      ...(args.queryFn !== undefined ? { queryFn: args.queryFn } : {}),
      ...(args.runner !== undefined ? { runner: args.runner } : {}),
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
      ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
    });

    if (!result.ok) {
      // The single-session guard (ADR-0108 d.6, inherited from runHeadlessOrchestrator's in-flight
      // flag) is a refusal, not a failure — surface it as a distinct `refused` event so a thin
      // client can show "busy — try again" rather than a generic error.
      if (result.refused) {
        yield {
          type: "refused",
          reason: result.error ?? "a session is already in progress",
        };
        return;
      }
      yield { type: "error", error: result.error ?? "orchestrate failed" };
      return;
    }

    yield {
      type: "done",
      proposal: result.proposal ?? "",
      costUsd: result.costUsd,
      turns: result.turns,
    };
  } catch (e) {
    yield {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
