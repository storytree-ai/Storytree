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
 * STREAMS TOKENS AS THEY GENERATE (the responsiveness fix): instead of awaiting the whole multi-turn
 * session and emitting one terminal proposal, the adapter forwards each assistant text fragment as a
 * `delta` event AS IT ARRIVES, then a terminal `done` carrying the authoritative proposal + metrics.
 * It bridges `orchestrate`'s `onDelta` callback (which fires DURING the awaited session) into yielded
 * `delta` events via a small FIFO queue drained interleaved with the session completing — so a thin
 * client renders tokens live (feels instant) rather than spinning until the session ends.
 *
 * REUSES THE PHASE-1 COMPOSITION (ADR-0108 d.2): calls `orchestrate()` — the same composition
 * the programmatic entry and the terminal `orchestrate` command use. The adapter adapts the
 * composition's result into a stream; it does not re-render the prompt, re-wire the orientation
 * tools, or re-implement the session.
 *
 * OFFLINE-TESTABLE BY INJECTION: the `queryFn` seam is forwarded to `orchestrate()` so the
 * intake → session → stream (deltas included) is proven without live SDK spend (ADR-0010 §5).
 */

import type { Store } from "@storytree/storage-protocol";
import type { SdkQueryFn, OrientationRunner } from "@storytree/agent";

import type { OrchestrateResult } from "./orchestrate.js";
import { orchestrate } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/**
 * A NON-terminal streaming event — one assistant text fragment as it generates. Zero or more `delta`
 * events precede the single terminal event (`done`/`error`/`refused`). A thin client appends each
 * `text` to a live render so the operator sees tokens stream (the responsiveness fix). The fragments
 * are a live preview; the authoritative final answer is the terminal `done` event's `proposal`.
 */
export interface ChatStreamDeltaEvent {
  type: "delta";
  text: string;
}

/** A terminal done event — the proposal text plus session metrics. */
export interface ChatStreamDoneEvent {
  type: "done";
  proposal: string;
  costUsd: number | undefined;
  turns: number | undefined;
  /**
   * The unit id the agent declared via the `propose_unit` tool during the session (ADR-0108 d.3).
   * Threaded from `HeadlessOrchestratorResult.proposedUnitId` through `OrchestrateResult` and onto
   * this event. `undefined` when the agent did not call `propose_unit`.
   */
  proposedUnitId?: string;
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

/** All events the chat stream can emit (discriminated by `type`). The terminal event is always one
 *  of done/error/refused; zero or more non-terminal `delta` events may precede it. */
export type ChatStreamEvent =
  | ChatStreamDeltaEvent
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

/** The session's settled outcome — a success carrying the orchestrate result, or a failure carrying
 *  the thrown value. The session promise resolves to this and NEVER rejects, so the terminal branch
 *  reads it via `await` (closure-assigned narrowing is unreliable across the delta bridge). */
type SessionOutcome =
  | { ok: true; result: OrchestrateResult }
  | { ok: false; error: unknown };

/**
 * Start an orchestrate session and yield its outcome as a typed event stream.
 *
 * STREAMING: zero or more non-terminal `delta` events (assistant text fragments, forwarded as they
 * generate) precede a single terminal event. The stream always terminates — with a `done` event
 * carrying the authoritative proposal text + session metrics, a `refused` event when the
 * single-session guard (ADR-0108 d.6) declines a concurrent session, or an `error` event when the
 * session fails. The stream NEVER throws; any failure (agent absent, SDK error, unexpected
 * exception) is emitted as a typed `error` event so the caller can forward it directly to the SSE
 * client.
 *
 * The delta bridge: `orchestrate`'s `onDelta` callback fires SYNCHRONOUSLY-WITH the awaited session,
 * but a generator can only yield when control returns to it. So deltas land in a FIFO queue that this
 * generator drains interleaved with the session completing — yielding each as a `delta` event in
 * arrival order, then the terminal event once the session settles. No delta is dropped and no
 * terminal event races ahead of a buffered delta.
 */
export async function* startChatStream(
  args: StartChatStreamArgs,
): AsyncGenerator<ChatStreamEvent> {
  // The bridge: buffered text fragments + a single-slot "wake" so the drain loop can park when the
  // queue is empty and the session hasn't settled, and resume the instant either changes.
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  const signal = (): void => {
    const w = wake;
    wake = null;
    if (w !== null) w();
  };

  // The session resolves to a typed outcome and NEVER rejects (orchestrate never throws, and the
  // .catch keeps us robust regardless) — so the terminal branch reads the value via `await session`
  // rather than a closure-assigned variable (which TS control-flow cannot narrow across the bridge).
  // A plain `done` boolean drives the drain loop; it flips in the .finally closure.
  let done = false;
  const session: Promise<SessionOutcome> = orchestrate({
    intent: args.intent,
    store: args.store,
    onDelta: (text: string) => {
      if (text.length === 0) return;
      queue.push(text);
      signal();
    },
    ...(args.queryFn !== undefined ? { queryFn: args.queryFn } : {}),
    ...(args.runner !== undefined ? { runner: args.runner } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
    ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
  })
    .then((result): SessionOutcome => ({ ok: true, result }))
    .catch((error: unknown): SessionOutcome => ({ ok: false, error }))
    .finally(() => {
      done = true;
      signal();
    });

  // Drain deltas as they arrive, interleaved with the session completing. The loop exits only once
  // the session is done AND the queue is fully drained — so no buffered delta is lost.
  while (!done || queue.length > 0) {
    const next = queue.shift();
    if (next !== undefined) {
      yield { type: "delta", text: next };
      continue;
    }
    // Queue empty and session not done: park until a delta is pushed or the session settles.
    // The check and the `wake` assignment run synchronously (no await between), so the settle/push
    // microtask cannot slip in unsignalled — no lost wakeup.
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  // The session has settled — read its typed outcome (the promise is already resolved).
  const outcome = await session;
  if (!outcome.ok) {
    yield {
      type: "error",
      error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    };
    return;
  }

  const result = outcome.result;
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
    ...(result.proposedUnitId !== undefined ? { proposedUnitId: result.proposedUnitId } : {}),
  };
}
