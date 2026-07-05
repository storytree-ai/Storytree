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
import type { SdkQueryFn, OrientationRunner, LandingSurfaceDeps } from "@storytree/agent";

import type { OrchestrateResult } from "./orchestrate.js";
import { orchestrate } from "./orchestrate.js";
import type { SpawnSurfaceDeps } from "./spawn-deps.js";
import { asSpawnTrace } from "./spawn-trace.js";

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

/**
 * A NON-terminal streaming event — a spawn-boundary trace surfaced as it fires (ADR-0137 Phase 3 /
 * chat-spawn-trace-events). When `startChatStream` is driven WITH spawn deps, the boundary traces
 * the claim gate would otherwise swallow are narrowed to {@link import("./spawn-trace.js").SpawnTrace}
 * and pushed onto the SAME FIFO the deltas use — interleaved and ordered, before the single terminal
 * event. `phase` maps `spawn_started`→`"started"` / `spawn_finished`→`"finished"`; `ok` is carried
 * only on `finished`. Absent spawn deps → no spawn events (byte-identical to the propose-only surface).
 * The trace ALSO still bumps the claim heartbeat (ADR-0138 §4): the interception is additive, never a
 * theft of the signal.
 */
export interface ChatStreamSpawnEvent {
  type: "spawn";
  phase: "started" | "finished";
  role: "story-author" | "builder";
  unitId: string;
  ok?: boolean;
}

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

/** All events the chat stream can emit (discriminated by `type`). The terminal event is always one
 *  of done/error/refused; zero or more non-terminal `delta` events may precede it. */
export type ChatStreamEvent =
  | ChatStreamDeltaEvent
  | ChatStreamSpawnEvent
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
  /**
   * OPTIONAL spawn surface deps (ADR-0137 Phase 3): when present, the underlying
   * `orchestrate()` session mounts `spawn_story_author` / `spawn_builder` as claim-gated MCP
   * tools so the chat can spawn the inner loop. Absent → the session is byte-identical to the
   * propose-only surface (the same additive threading as `runner`; no fork of the Phase-1/2 chain).
   * The desktop sidecar composes the real deps via `buildSpawnDeps` and passes them through the
   * chat mount; offline tests inject a scripted double.
   */
  spawn?: SpawnSurfaceDeps;
  /**
   * OPTIONAL landing surface deps (ADR-0152): when present, the underlying `orchestrate()` session
   * mounts `run_gate` / `open_landing_pr` as fail-closed MCP tools so the chat can run the merge
   * ceremony (gate → commit → push → NON-DRAFT PR). Absent → byte-identical to the propose/spawn
   * surface. Landing tools emit no spawn-trace events, so — unlike `spawn` — they are forwarded
   * straight through with no FIFO wrap. The desktop sidecar composes the real deps via
   * `buildLandingDeps`; offline tests inject a recording double.
   */
  landing?: LandingSurfaceDeps;
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
  // The bridge: a single FIFO of buffered non-terminal items (assistant text `delta`s and spawn
  // boundary `spawn` events) + a single-slot "wake" so the drain loop can park when the queue is
  // empty and the session hasn't settled, and resume the instant either changes. The queue holds a
  // discriminated item so deltas and spawn events interleave in arrival order on the ONE FIFO (no
  // second queue, no second drain loop — the buffered-push + single-slot-wake ordering discipline).
  type QueueItem =
    | { kind: "delta"; text: string }
    | { kind: "spawn"; event: ChatStreamSpawnEvent };
  const queue: QueueItem[] = [];
  let wake: (() => void) | null = null;
  const signal = (): void => {
    const w = wake;
    wake = null;
    if (w !== null) w();
  };

  // Wrap the injected spawn deps (when present) so their boundary traces surface OUT to the chat
  // stream as `spawn` events, WITHOUT stealing the claim heartbeat bump (ADR-0138 §4). The wrap
  // composes each spawn handler's `onTrace`: it still calls the ORIGINAL onTrace (the gate's
  // heartbeat sink, preserved) AND, when a message narrows to a SpawnTrace, pushes a
  // ChatStreamSpawnEvent onto the SAME FIFO and signals — exactly as `onDelta` does. Absent spawn
  // deps ⇒ no wrap ⇒ byte-identical to the propose-only surface (no `spawn` events).
  const wrappedSpawn: SpawnSurfaceDeps | undefined =
    args.spawn === undefined
      ? undefined
      : (() => {
          const original = args.spawn;
          const composeTrace =
            (onTrace: (msg: unknown) => void) =>
            (msg: unknown): void => {
              // Preserve the gate's heartbeat bump (and any other original behaviour) first.
              onTrace(msg);
              const trace = asSpawnTrace(msg);
              if (trace === null) return;
              const event: ChatStreamSpawnEvent =
                trace.type === "spawn_started"
                  ? { type: "spawn", phase: "started", role: trace.role, unitId: trace.unitId }
                  : {
                      type: "spawn",
                      phase: "finished",
                      role: trace.role,
                      unitId: trace.unitId,
                      ok: trace.ok,
                    };
              queue.push({ kind: "spawn", event });
              signal();
            };
          return {
            ...original,
            spawnStoryAuthor: (spawnArgs, onTrace) =>
              original.spawnStoryAuthor(spawnArgs, composeTrace(onTrace)),
            spawnBuilder: (spawnArgs, onTrace) =>
              original.spawnBuilder(spawnArgs, composeTrace(onTrace)),
          };
        })();

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
      queue.push({ kind: "delta", text });
      signal();
    },
    ...(args.queryFn !== undefined ? { queryFn: args.queryFn } : {}),
    ...(args.runner !== undefined ? { runner: args.runner } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
    ...(args.maxBudgetUsd !== undefined ? { maxBudgetUsd: args.maxBudgetUsd } : {}),
    ...(wrappedSpawn !== undefined ? { spawn: wrappedSpawn } : {}),
    ...(args.landing !== undefined ? { landing: args.landing } : {}),
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
      yield next.kind === "delta" ? { type: "delta", text: next.text } : next.event;
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
  };
}
