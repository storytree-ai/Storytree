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
 * THE PARENT LANE IS THE SESSION'S OWN LANE, so it is keyed, labelled and shipped exactly as that
 * session's CLI reads are (`session-harness-and-host-arc`, `build-lane-ships-with-its-session`). The
 * caller keys it by the same trace identity every CLI read uses — one context WINDOW, resolved by
 * `resolveTraceIdentity` and mapped through {@link buildSpawnParentOf} — and supplies the attributes
 * a read's lines already carry beside that id (grade, slot, harness, host). This composition stamps
 * them on the parent lane's lines and stamps the forward-only ship baseline for the parent session
 * before its append (ADR-0484 D6), which is what enrols the lane in the out-of-band shipper. Before
 * this, the lane was keyed by the pooled worktree SLOT, so a session's reads and its build lane sat
 * in two different files; the lane's lines carried no grade, slot, harness or host; and a lane file
 * never received a ship cursor, so no build lane ever reached the shared store, from any harness.
 *
 * Additive and fail-silent (ADR-0241 D3), never fail-closed: a null, empty, or unresolvable
 * `parentSessionId` is a total no-op (no directory resolved, no file created, no error); so is
 * `enabled: false` and `STORYTREE_TRAVERSAL=off`. Nothing here throws, adds an await, touches the
 * network, or touches a database — capture must never change a caller's exit code, envelope,
 * verdict, or control flow, the same advisory posture `appendSliceUsage` already holds. Stamping the
 * ship baseline is a small LOCAL file write beside the trace; the ship itself happens out of band,
 * in a process this composition never starts and never waits for.
 */
import { randomUUID } from "node:crypto";

import {
  appendTraversalEvents,
  captureIdentityOf,
  resolveTraversalDir,
} from "@storytree/context-traversal-capture";
import type { TraceIdentity, TraversalLineIdentity } from "@storytree/context-traversal-capture";
// The ONE function a capture path reaches in the store half (its barrel says so): it stamps a local
// cursor file and nothing else. The subpath carries no `pg` — its pool is duck-typed — so this adds
// no dependency the package does not already have.
import { ensureShipBaseline } from "@storytree/context-traversal-capture/store";
import type { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

import { observeLeafSlices } from "./observe-leaf-slices.js";
import type { LeafSliceRun } from "./observe-leaf-slices.js";

const TRAVERSAL_OFF_ENV = "STORYTREE_TRAVERSAL";
const TRAVERSAL_OFF_VALUE = "off";

/**
 * The identity attributes a build's PARENT lane is stamped with — the four a CLI read's lines carry
 * beside the same session id, in the sink's own {@link TraversalLineIdentity} shape.
 *
 * `origin` / `cutBy` / `cutFor` are deliberately NOT here. A read's lines resolve those from the
 * session's origin declaration, and a line WITHOUT them reads as undeclared rather than as a
 * competing claim (`classifySessionOrigin`), so the lane leaves the session's origin reading exactly
 * where its reads put it. The grade is the one attribute whose absence WOULD change the reading: an
 * ungraded line is read as the legacy slot era, which would turn a window trace `mixed`.
 */
export type BuildSpawnParentIdentity = Pick<TraversalLineIdentity, "grade" | "slot" | "harness" | "host">;

export interface CaptureBuildSpawnArgs {
  /** Supplied by the caller — never derived here (ADR-0241 D9). A falsy/blank id is a total no-op. */
  parentSessionId: string | null | undefined;
  /**
   * The parent lane's identity attributes, stamped on the PARENT lane's lines only. Supplied by the
   * caller with the id, never derived here; absent stamps nothing, and each attribute follows the
   * sink's own rule (stamped when it names something, omitted otherwise).
   */
  parentIdentity?: BuildSpawnParentIdentity;
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

/** The parent-lane half of a {@link CaptureBuildSpawnArgs}. See {@link buildSpawnParentOf}. */
export interface BuildSpawnParent {
  readonly parentSessionId: string | null;
  readonly parentIdentity: BuildSpawnParentIdentity;
}

/**
 * The parent-lane half of a build's capture, drawn from ONE resolved trace identity — or from none.
 *
 * THE SAME MAPPING A CLI READ USES, BY CONSTRUCTION: it goes through `captureIdentityOf`, the one
 * place that decides which of a trace identity's attributes are stamped and which stay ABSENT (a
 * `null` harness or host becomes no key). A second copy of that decision here would be the shape
 * that lets a session's reads and its build lane start describing the same window differently.
 *
 * Exported and tested here rather than inlined in the CLI for `captureIdentityOf`'s own reason: the
 * CLI's build wiring is reached only by a `--real`/`--live` build, so a branch left there is one no
 * suite reaches. A null identity maps to a null `parentSessionId`, which {@link captureBuildSpawn}
 * treats as a total no-op — an uninstrumented run records nothing, and that is not an error.
 */
export function buildSpawnParentOf(trace: TraceIdentity | null): BuildSpawnParent {
  const { sessionId, ...parentIdentity } = captureIdentityOf(trace);
  return { parentSessionId: sessionId, parentIdentity };
}

/**
 * Observe one build's authoring slices and append the resulting parent/child lanes to their own
 * per-session traces. Additive and fail-silent throughout — see the module doc for the full
 * no-op/failure contract. Always returns `undefined`.
 */
export function captureBuildSpawn(args: CaptureBuildSpawnArgs): void {
  const { parentSessionId, parentIdentity, runId, unitId, runs, dir, enabled, now, nextId } = args;

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

    // A transparent carrier: the events are routed exactly as `observeLeafSlices` emitted them,
    // `modelId` included. This composition used to attach `modelId` itself, correlating events to
    // runs POSITIONALLY, because contract 8 was unimplemented in the observer; that workaround was
    // also narrower than the contract, firing only when a capacity was present. Contract 8 now
    // lives where it belongs, so nothing is re-derived here.
    const eventsBySession = new Map<string, ContextTraversalEvent[]>();
    for (const event of observed) {
      const bucket = eventsBySession.get(event.sessionId);
      if (bucket !== undefined) {
        bucket.push(event);
      } else {
        eventsBySession.set(event.sessionId, [event]);
      }
    }

    const targetDir = dir ?? resolveTraversalDir();
    for (const [sessionId, sessionEvents] of eventsBySession) {
      if (sessionId === parentSessionId) {
        // THE PARENT LANE: the session's own trace. The forward-only ship baseline is stamped BEFORE
        // the append, on `captureCliInvocation`'s own rule (ADR-0484 D6), so the events appended now
        // are the first this lane can ever ship. It is a no-op when the session already carries a
        // cursor — the ordinary case, since the session's own reads stamped one.
        ensureShipBaseline(targetDir, sessionId);
        appendTraversalEvents(sessionEvents, { dir: targetDir, sessionId, ...parentIdentity });
      } else {
        // A CHILD lane (`<parent>__build__<run>__<unit>__<phase>`) is left exactly as it was: no
        // identity stamps and no ship cursor. Its window belongs to the LEAF runtime the build
        // spawned, not to the session that ran the build, so stamping the session's harness, host or
        // grade here would describe the child as something it is not.
        appendTraversalEvents(sessionEvents, { dir: targetDir, sessionId });
      }
    }
  } catch {
    // Fail-silent (ADR-0241 D3): capture must never change a caller's control flow, exit code, or
    // verdict, regardless of what goes wrong beneath this composition.
  }
}
