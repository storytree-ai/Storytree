/**
 * The orientation-runner telemetry adapter (story `context-traversal-telemetry`, capability
 * `orientation-runner-telemetry`, ADR-0235 / ADR-0192).
 *
 * A wrapper/decorator over an injected `OrientationRunner` (the same shape
 * `@storytree/drive`'s `createOrientationRunner` and `@storytree/agent`'s orientation tools
 * share structurally): it delegates every call UNCHANGED — the returned envelope is never
 * touched — and records an observation only after a successful (`ok: true`) response. This
 * module owns no drive source and never alters `createOrientationRunner`; it is proven against
 * the real factory in its own UAT, a real-boundary integration seam rather than a stub of it.
 *
 * Dispatch → observation:
 *   - focused tree read (`["tree", <story-id>]`)               → front_matter_read
 *   - the bare library dashboard (`["library"]`)                → front_matter_read
 *   - the full spec (`["tree", "spec", <node-id>]`)              → full_payload_read
 *   - one Library artifact (`["library", "artifact", <id>]`)     → full_payload_read
 *   - a Library artifact listing
 *     (`["library", "artifact", "list", <category>]`)            → search
 *
 * The envelope carries only rendered text, never the canonical result ids a listing needs for
 * an honest `search` observation — so the adapter is handed a SEPARATE, read-only
 * `OrientationNodeStore` (the same underlying knowledge store the runner itself reads over) to
 * resolve those ids directly, without ever touching titles/bodies/envelope text.
 *
 * Every other candidate observation this adapter's package vocabulary can express — model-token
 * usage/capacity, explicit followed-edge identity, spawn handoff/return, independent child
 * windows, and every other runtime surface (direct CLI, the Claude/Codex SDK leaves, the owned
 * loop, a spawned agent, `agents`, the noticeboard) — is structurally unobservable from this
 * runner-decorator boundary, and `ORIENTATION_RUNNER_ADAPTER_COVERAGE` declares them omitted
 * rather than silently absent.
 */

import { CoverageFeature, type ContextTraversalCoverage } from "./traversal-events.js";
import type { ContextTraversalTrace } from "./traversal-trace.js";

// ---------------------------------------------------------------------------
// Types — the published seam this adapter decorates
// ---------------------------------------------------------------------------

/** Minimal envelope shape the runner must return (structurally matches drive's `Envelope`). */
export interface OrientationEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly doctrine?: readonly string[];
  readonly next?: readonly string[];
}

/**
 * Injectable runner seam: the real production `createOrientationRunner` result
 * (`@storytree/drive`), the owned loop's orientation runner, or an offline stub — `deps` is
 * `unknown` because the runner is contravariant in its parameter type; accepting `unknown` is
 * wider than any concrete deps shape a caller might pass.
 */
export type OrientationRunner = (
  argv: readonly string[],
  deps: unknown,
) => Promise<OrientationEnvelope>;

/**
 * The read-only view into the underlying knowledge store the adapter needs to resolve a Library
 * artifact listing's CANONICAL result ids — the envelope itself carries only rendered text.
 * Structurally satisfied by `@storytree/storage-protocol`'s `Store` (its `queryDocs`), so the
 * SAME store instance the production runner reads over can be injected here unchanged.
 */
export interface OrientationNodeStore {
  queryDocs(filter?: { kind?: string }): Promise<readonly { readonly id: string }[]>;
}

/**
 * Everything the adapter needs beyond the runner itself: stable session identity, the structured
 * trace to record into, the read-only node store to resolve search result ids, and two injected
 * seams — `nextVisitId()` and `now()` — so the adapter never reaches for an ambient clock or
 * generates an id of its own.
 */
export interface OrientationRunnerTelemetry {
  readonly sessionId: string;
  readonly trace: ContextTraversalTrace;
  readonly nodeStore: OrientationNodeStore;
  nextVisitId(): string;
  now(): Date;
}

// ---------------------------------------------------------------------------
// Coverage — computed from the live enum, never hand-listed
// ---------------------------------------------------------------------------

const SUPPORTED_FEATURES: CoverageFeature[] = [
  "event:front_matter_read",
  "event:full_payload_read",
  "event:search",
  "field:surface_id",
];

const OMITTED_FEATURES: CoverageFeature[] = CoverageFeature.options.filter(
  (feature) => !SUPPORTED_FEATURES.includes(feature),
);

/**
 * This adapter's honest coverage declaration: exactly the four features it can genuinely
 * observe from a runner-decorator boundary, and every other `CoverageFeature` explicitly named
 * omitted (computed from the enum, so a future feature addition can never silently go unnamed).
 */
export const ORIENTATION_RUNNER_ADAPTER_COVERAGE: ContextTraversalCoverage = {
  adapterId: "orientation-runner-decorator",
  supported: SUPPORTED_FEATURES,
  omitted: OMITTED_FEATURES,
};

// ---------------------------------------------------------------------------
// Recording — one observation per successful call, never touching the envelope
// ---------------------------------------------------------------------------

function appendVisit(
  telemetry: OrientationRunnerTelemetry,
  kind: "front_matter_read" | "full_payload_read",
  nodeId: string,
  surfaceId: string,
): void {
  telemetry.trace.append({
    kind,
    eventId: telemetry.nextVisitId(),
    sessionId: telemetry.sessionId,
    at: telemetry.now().toISOString(),
    visitId: telemetry.nextVisitId(),
    nodeId,
    surfaceId,
  });
}

function appendSearch(
  telemetry: OrientationRunnerTelemetry,
  operation: "library_artifact_list" | "library_dashboard",
  resultNodeIds: readonly string[],
  surfaceId: string,
): void {
  telemetry.trace.append({
    kind: "search",
    eventId: telemetry.nextVisitId(),
    sessionId: telemetry.sessionId,
    at: telemetry.now().toISOString(),
    searchId: telemetry.nextVisitId(),
    surfaceId,
    operation,
    resultNodeIds,
  });
}

/**
 * Record the one observation (if any) a successful dispatch of `argv` earns. Only ever called
 * after the wrapped runner has already returned `ok: true` — a miss earns no observation.
 */
async function recordObservation(
  argv: readonly string[],
  telemetry: OrientationRunnerTelemetry,
): Promise<void> {
  const [area, sub, third, fourth] = argv;

  if (area === "tree" && sub === "spec") {
    if (third === undefined) return;
    appendVisit(telemetry, "full_payload_read", third, "tree");
    return;
  }

  if (area === "tree") {
    if (sub === undefined) return;
    appendVisit(telemetry, "front_matter_read", sub, "tree");
    return;
  }

  if (area === "library" && sub === undefined) {
    appendVisit(telemetry, "front_matter_read", "library", "library");
    return;
  }

  if (area === "library" && sub === "artifact" && third === "list") {
    if (fourth === undefined) return;
    const docs = await telemetry.nodeStore.queryDocs({ kind: fourth });
    appendSearch(
      telemetry,
      "library_artifact_list",
      docs.map((doc) => doc.id),
      "library",
    );
    return;
  }

  if (area === "library" && sub === "artifact") {
    if (third === undefined) return;
    appendVisit(telemetry, "full_payload_read", third, "library");
    return;
  }
}

// ---------------------------------------------------------------------------
// The decorator itself
// ---------------------------------------------------------------------------

/**
 * Wrap `runner` so every successful call also earns an honest telemetry observation. Declares
 * `ORIENTATION_RUNNER_ADAPTER_COVERAGE` to the injected trace immediately, on decoration — not
 * lazily on first use. Delegation is additive: the returned envelope is exactly the wrapped
 * runner's, unmodified; only the observation is new, and only on a genuine hit.
 */
export function withContextTraversalTelemetry(
  runner: OrientationRunner,
  telemetry: OrientationRunnerTelemetry,
): OrientationRunner {
  telemetry.trace.declareCoverage(ORIENTATION_RUNNER_ADAPTER_COVERAGE);

  return async (argv: readonly string[], deps: unknown): Promise<OrientationEnvelope> => {
    const envelope = await runner(argv, deps);
    if (envelope.ok) {
      await recordObservation(argv, telemetry);
    }
    return envelope;
  };
}
