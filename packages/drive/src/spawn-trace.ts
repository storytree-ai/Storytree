/**
 * The typed spawn-boundary trace (chat-spawn-trace-events capability, ADR-0137 Phase 3 / ADR-0112).
 *
 * TYPE THE TRACE, NARROW ON THE WAY OUT (ADR-0112): the spawn handlers in `spawn-deps.ts` fire a
 * boundary trace at each spawn's edges (`spawn_started` / `spawn_finished`) into the claim gate's
 * `onTrace(msg: unknown)` sink — which bumps the claim heartbeat (ADR-0138 §4) and otherwise drops
 * the message. This union is that trace's SHAPE. Its home is `packages/drive` — beside its emitter
 * (`spawn-deps.ts`) and its consumer (`chat-stream.ts`) — so the agent-side `claimGatedSpawn` stays
 * trace-AGNOSTIC (`onTrace: (msg: unknown) => void`, unchanged): it bumps the heartbeat off ANY
 * signal and never needs to know the shape. Drive narrows the `unknown` back to `SpawnTrace` when it
 * intercepts the trace on the way out to the chat stream — never a coupling of the agent seam to a
 * drive concept it should not know (ADR-0112: drive reaches agent, not the reverse).
 */

/** The role of the spawned subagent the trace describes. */
export type SpawnTraceRole = "story-author" | "builder" | "glue-worker";

/**
 * The spawn-boundary trace union — the two edges of a claim-gated spawn. Matches the object
 * literals `spawn-deps.ts` already emits into the gate's `onTrace`.
 */
export type SpawnTrace =
  | { type: "spawn_started"; role: SpawnTraceRole; unitId: string }
  | { type: "spawn_finished"; role: SpawnTraceRole; unitId: string; ok: boolean };

/**
 * Narrow an untyped `onTrace` message to a {@link SpawnTrace}, or `null` when it is not one.
 * Structural type-guard (mirrors the SDK-message narrowing in the agent runner) so the drive-side
 * interception only surfaces the two spawn-boundary shapes and ignores any other signal on the sink.
 */
export function asSpawnTrace(msg: unknown): SpawnTrace | null {
  if (typeof msg !== "object" || msg === null) return null;
  const type = (msg as { type?: unknown }).type;
  const role = (msg as { role?: unknown }).role;
  const unitId = (msg as { unitId?: unknown }).unitId;
  if (typeof unitId !== "string") return null;
  if (role !== "story-author" && role !== "builder" && role !== "glue-worker") return null;
  if (type === "spawn_started") {
    return { type: "spawn_started", role, unitId };
  }
  if (type === "spawn_finished") {
    const ok = (msg as { ok?: unknown }).ok;
    if (typeof ok !== "boolean") return null;
    return { type: "spawn_finished", role, unitId, ok };
  }
  return null;
}
