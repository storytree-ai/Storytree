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
    const events = observeLeafSlices({
      parentSessionId,
      runId,
      unitId,
      runs,
      now: now ?? (() => new Date()),
      nextId: nextId ?? (() => randomUUID()),
    });

    if (events.length === 0) return;

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
