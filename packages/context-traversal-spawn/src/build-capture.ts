/**
 * The build spawn capture composition (story `context-traversal-spawn`, capability
 * `build-spawn-capture`, ADR-0235 / ADR-0241).
 *
 * The one entry point a `--real`/`--live` build composition site calls. It observes through
 * increment 1's `observeLeafSlices` (`leaf-slice-spawn-observations`), then routes each observed
 * event to the on-disk trace of the session it belongs to via increment 2's public barrel
 * (`@storytree/context-traversal-capture`) — one `appendTraversalEvents` call per distinct session
 * id, never one merged batch, so the parent's `spawn_handoff`/`result_return` lane and each child's
 * own `model_context` observation land in their own separate per-session files.
 *
 * Identity in, never derived (ADR-0241 D9): `parentSessionId` is supplied by the caller. This
 * package deliberately does not import `@storytree/drive` for `deriveIdentity()` — that would make
 * `drive -> spawn -> drive` a cycle. The resolution precedence belongs at the caller's resolution
 * site, not here.
 *
 * Additive and fail-silent (ADR-0241 D3), never fail-closed: a null, empty, or unresolvable
 * `parentSessionId` is a total no-op (no directory resolved, no file created, no error); so is
 * `enabled: false` and `STORYTREE_TRAVERSAL=off`. Nothing here throws, adds an await, touches the
 * network, or touches a database — capture must never change a caller's exit code, envelope,
 * verdict, or control flow, the same advisory posture `appendSliceUsage` already holds.
 */
import { randomUUID } from "node:crypto";

import { appendTraversalEvents, resolveTraversalDir } from "@storytree/context-traversal-capture";
import type { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import { observeLeafSlices } from "./observe-leaf-slices.js";
import type { LeafSliceRun } from "./observe-leaf-slices.js";

const TRAVERSAL_OFF_ENV = "STORYTREE_TRAVERSAL";
const TRAVERSAL_OFF_VALUE = "off";

export interface CaptureBuildSpawnArgs {
  /** Supplied by the caller — never derived here (ADR-0241 D9). A falsy/blank id is a total no-op. */
  parentSessionId: string | null | undefined;
  runId: string;
  unitId: string;
  runs: readonly LeafSliceRun[];
  /** Defaults to increment 2's `resolveTraversalDir()`; an explicit `dir` wins (tests only). */
  dir?: string;
  /** `false` is a total no-op, same as `STORYTREE_TRAVERSAL=off`. Defaults to enabled. */
  enabled?: boolean;
  /** Injected clock, forwarded to `observeLeafSlices`. Defaults to the wall clock. */
  now?: () => Date;
  /** Injected id generator, forwarded to `observeLeafSlices`. Defaults to `randomUUID()`. */
  nextId?: () => string;
}

function isTraversalOff(): boolean {
  return process.env[TRAVERSAL_OFF_ENV] === TRAVERSAL_OFF_VALUE;
}

function hasContent(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The `modelId` that declared a given capacity, when — and only when — exactly one entry in the
 * slice's `byModel` declared that exact positive window. Increment 1's own capacity derivation
 * already refuses to guess across ambiguous/ absent declarations (see `contextWindowCapacityFor` in
 * `observe-leaf-slices.ts`); this mirrors that same refusal for the id that goes with it, rather
 * than attributing a shared/ambiguous capacity to an arbitrary model.
 */
function modelIdForCapacity(byModel: LeafSliceRun["byModel"], capacity: number | undefined): string | undefined {
  if (byModel === undefined || capacity === undefined) return undefined;
  const matches = Object.entries(byModel).filter(([, model]) => model.contextWindow === capacity);
  return matches.length === 1 ? matches[0]?.[0] : undefined;
}

/**
 * Increment 1 (`observeLeafSlices`) emits the capacity number but never the model that declared it
 * — this composition attaches it, per `model_context` event, from the SAME `runs` this build's
 * caller supplied. Correlation walks `events` and `runs` in lockstep: every run contributes exactly
 * one `spawn_handoff` first, so each `spawn_handoff` marks the start of its run's block and any
 * `model_context` that follows before the next `spawn_handoff` belongs to that same run.
 */
function withModelIds(
  events: readonly ContextTraversalEvent[],
  runs: readonly LeafSliceRun[],
): ContextTraversalEvent[] {
  let runIndex = -1;
  return events.map((event) => {
    if (event.kind === "spawn_handoff") {
      runIndex += 1;
      return event;
    }
    if (event.kind === "model_context" && event.contextWindowCapacity !== undefined) {
      const run = runIndex >= 0 ? runs[runIndex] : undefined;
      const modelId = run !== undefined ? modelIdForCapacity(run.byModel, event.contextWindowCapacity) : undefined;
      return modelId !== undefined ? { ...event, modelId } : event;
    }
    return event;
  });
}

/**
 * Observe one build's authoring slices and append the resulting parent/child lanes to their own
 * per-session traces. Additive and fail-silent throughout — see the module doc for the full
 * no-op/failure contract. Always returns `undefined`.
 */
export function captureBuildSpawn(args: CaptureBuildSpawnArgs): void {
  const { parentSessionId, runId, unitId, runs, dir, enabled, now, nextId } = args;

  if (enabled === false) return;
  if (isTraversalOff()) return;
  if (!hasContent(parentSessionId)) return;

  try {
    const observed = observeLeafSlices({
      parentSessionId,
      runId,
      unitId,
      runs,
      now: now ?? (() => new Date()),
      nextId: nextId ?? (() => randomUUID()),
    });

    if (observed.length === 0) return;

    const events = withModelIds(observed, runs);

    const eventsBySession = new Map<string, ContextTraversalEvent[]>();
    for (const event of events) {
      const bucket = eventsBySession.get(event.sessionId);
      if (bucket !== undefined) {
        bucket.push(event);
      } else {
        eventsBySession.set(event.sessionId, [event]);
      }
    }

    const targetDir = dir ?? resolveTraversalDir();
    for (const [sessionId, sessionEvents] of eventsBySession) {
      appendTraversalEvents(sessionEvents, { dir: targetDir, sessionId });
    }
  } catch {
    // Fail-silent (ADR-0241 D3): capture must never change a caller's control flow, exit code, or
    // verdict, regardless of what goes wrong beneath this composition.
  }
}
