/**
 * The terminal CLI dispatch boundary (adapter id `terminal-cli-dispatch`, ADR-0235/ADR-0241).
 *
 * A terminal invocation's argv becomes a context-traversal observation ONLY when it matches an
 * allowlisted read shape below. The default answer for any invocation is zero events: this is an
 * allowlist, not a translation of argv. Write/unknown commands, and any failed invocation
 * (`ok: false`), observe nothing.
 */
import { CoverageFeature } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalCoverage, ContextTraversalEvent } from "@storytree/context-traversal-telemetry";

/** Identity and time originate at the runtime adapter, never ambiently, so this stays pure. */
export interface ObserveCliDeps {
  readonly ok: boolean;
  readonly sessionId: string;
  readonly nextVisitId: () => string;
  readonly now: () => Date;
}

const TREE_SURFACE = "tree";
const LIBRARY_ARTIFACT_SURFACE = "library-artifact";
const LIBRARY_DASHBOARD_SURFACE = "library-dashboard";
const AGENTS_SURFACE = "agents";

const TERMINAL_CLI_DISPATCH_SUPPORTED = [
  "surface:direct_cli",
  "event:front_matter_read",
  "event:full_payload_read",
  "event:search",
  "field:surface_id",
] satisfies ContextTraversalCoverage["supported"];

export const TERMINAL_CLI_DISPATCH_COVERAGE: ContextTraversalCoverage = {
  adapterId: "terminal-cli-dispatch",
  supported: TERMINAL_CLI_DISPATCH_SUPPORTED,
  omitted: CoverageFeature.options.filter(
    (feature) => !(TERMINAL_CLI_DISPATCH_SUPPORTED as readonly string[]).includes(feature),
  ),
};

function visitEvent(
  kind: "front_matter_read" | "full_payload_read",
  nodeId: string,
  surfaceId: string,
  deps: ObserveCliDeps,
): ContextTraversalEvent {
  const visitId = deps.nextVisitId();
  return {
    kind,
    eventId: `event:${visitId}`,
    sessionId: deps.sessionId,
    visitId,
    nodeId,
    surfaceId,
    at: deps.now().toISOString(),
  };
}

function searchEvent(deps: ObserveCliDeps): ContextTraversalEvent {
  const searchId = deps.nextVisitId();
  return {
    kind: "search",
    eventId: `event:${searchId}`,
    sessionId: deps.sessionId,
    searchId: `search:${searchId}`,
    surfaceId: LIBRARY_ARTIFACT_SURFACE,
    operation: "library_artifact_list",
    resultNodeIds: [],
    at: deps.now().toISOString(),
  };
}

/**
 * Observe one terminal CLI invocation. Pure: no clock, no id generation, no filesystem — identity
 * and time are injected via `deps`. Observation is success-only: `ok: false` emits zero events.
 */
export function observeCliInvocation(argv: readonly string[], deps: ObserveCliDeps): ContextTraversalEvent[] {
  if (!deps.ok) return [];

  const [area, sub, third] = argv;

  if (area === "tree") {
    if (sub === "spec") {
      if (third === undefined) return [];
      return [visitEvent("full_payload_read", third, TREE_SURFACE, deps)];
    }
    if (sub === undefined) return [];
    return [visitEvent("front_matter_read", sub, TREE_SURFACE, deps)];
  }

  if (area === "library") {
    if (sub === undefined) {
      return [visitEvent("front_matter_read", "library", LIBRARY_DASHBOARD_SURFACE, deps)];
    }
    if (sub === "artifact") {
      if (third === undefined) return [];
      if (third === "list") return [searchEvent(deps)];
      // any trailing token beyond the bare id (flags, sub-verbs like `edit`) makes this a write
      // or otherwise non-read shape, which observes nothing.
      if (argv.length !== 3) return [];
      return [visitEvent("full_payload_read", third, LIBRARY_ARTIFACT_SURFACE, deps)];
    }
    return [];
  }

  if (area === "agents") {
    if (sub === undefined) return [];
    return [visitEvent("full_payload_read", sub, AGENTS_SURFACE, deps)];
  }

  return [];
}
