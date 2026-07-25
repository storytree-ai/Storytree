/**
 * Pure replay renderers (ADR-0023 envelope shape, ADR-0235 clause 3/4/7, ADR-0241 D5), story
 * `context-traversal-capture`, capability `traversal-session-query`.
 *
 * No filesystem, no clock, no store: these functions take the values `traversal-trace-sink`'s
 * reader already returns (a session summary list, or one session's `ContextTraversalReplay`) and
 * produce envelope-shaped bodies with ADR-0023 `next:` pointers. The thin CLI dispatch that calls
 * these belongs to `terminal-capture-activation`, not here.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextTraversalReplay,
  ContextVisitEvent,
} from "@storytree/context-traversal-telemetry";

import type { TraversalSessionSummary } from "./sink.js";

/** The local envelope shape (ADR-0023): a body plus optional `next:` pointers. */
export interface TraversalRenderEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly next?: readonly string[];
}

function readStrengthLabel(kind: ContextVisitEvent["kind"]): string {
  return kind === "front_matter_read" ? "front-matter" : "full-payload";
}

/**
 * One line for a visit event. Read strength (front-matter vs full-payload) stays visibly distinct
 * (ADR-0235 clause 3). A revisit is rendered as a NEW forward visit that names the earlier visit it
 * links to ONLY because `priorVisitId` is actually present on this event — never inferred from
 * adjacency, ordering, or timestamp proximity.
 */
function renderVisitLine(event: ContextVisitEvent): string {
  const strength = readStrengthLabel(event.kind);
  const surface = event.surfaceId ?? "unknown-surface";
  const base = `  [${strength}] visit=${event.visitId} node=${event.nodeId} surface=${surface}`;
  if (event.priorVisitId !== undefined) {
    return `${base} (revisit of visit=${event.priorVisitId})`;
  }
  return base;
}

function renderEventLine(event: ContextTraversalEvent): string {
  if (isContextVisitEvent(event)) {
    return renderVisitLine(event);
  }
  switch (event.kind) {
    case "search":
      return `  [search] search=${event.searchId} surface=${event.surfaceId} operation=${event.operation}`;
    case "candidate_set":
      return `  [candidate-set] set=${event.candidateSetId} surface=${event.surfaceId} candidates=${event.candidateNodeIds.length}`;
    case "followed_edge":
      return `  [followed-edge] edge=${event.edgeId} from=${event.fromVisitId} to=${event.toVisitId}`;
    case "model_context":
      return `  [model-context] model=${event.modelId ?? "unknown"} cumulative=${event.cumulativeInputTokens}`;
    case "spawn_handoff":
      return `  [spawn-handoff] edge=${event.edgeId} child=${event.childSessionId}`;
    case "result_return":
      return `  [result-return] edge=${event.edgeId} child=${event.childSessionId}`;
    default:
      return "  [unknown-event]";
  }
}

/**
 * Finds the chronologically-last `model_context` event in an already-ordered event list. Capacity
 * is a property of the LATEST observation, not an aggregate.
 */
function findLatestModelContext(
  events: readonly ContextTraversalEvent[],
): Extract<ContextTraversalEvent, { kind: "model_context" }> | undefined {
  let latest: Extract<ContextTraversalEvent, { kind: "model_context" }> | undefined;
  for (const event of events) {
    if (event.kind === "model_context") latest = event;
  }
  return latest;
}

/**
 * Capacity is UNKNOWN unless a `model_context` event actually carried a capacity — the CLI boundary
 * observes no model tokens, so this is honest here rather than a default, a fabricated gauge, or the
 * owner-selected 500k display-only threshold (ADR-0235 clause 4/7).
 */
function renderCapacityLine(events: readonly ContextTraversalEvent[]): string {
  const latest = findLatestModelContext(events);
  if (latest === undefined || latest.contextWindowCapacity === undefined) {
    return "capacity: unknown (no model_context observation at this boundary)";
  }
  return `capacity: ${latest.contextWindowCapacity} tokens (model=${latest.modelId ?? "unknown"})`;
}

/** Always prints every declared coverage — supported AND omitted — never just one side. */
function renderCoverageBlock(coverage: readonly ContextTraversalCoverage[]): string {
  if (coverage.length === 0) {
    return "coverage: none declared";
  }
  return coverage
    .map(
      (declaration) =>
        `coverage: adapter=${declaration.adapterId} supported=[${declaration.supported.join(", ")}] omitted=[${declaration.omitted.join(", ")}]`,
    )
    .join("\n");
}

/**
 * Renders the session index: session ids with their event counts and last-observed time, newest
 * first, so an owner can find the session they just ran without knowing its id.
 */
export function renderTraversalSessions(list: readonly TraversalSessionSummary[]): TraversalRenderEnvelope {
  if (list.length === 0) {
    return { ok: true, body: "No captured sessions found." };
  }

  const sorted = [...list].sort((a, b) => {
    if (a.lastObservedAt === undefined && b.lastObservedAt === undefined) return 0;
    if (a.lastObservedAt === undefined) return 1;
    if (b.lastObservedAt === undefined) return -1;
    return b.lastObservedAt.localeCompare(a.lastObservedAt);
  });

  const lines = sorted.map((session) => {
    const observed = session.lastObservedAt ?? "unknown";
    return `- ${session.sessionId} — ${session.eventCount} event(s) — last observed ${observed}`;
  });

  const body = ["Captured sessions (newest observed first):", "", ...lines].join("\n");
  const next = sorted.map(
    (session) => `storytree context-traversal session ${session.sessionId} — replay this session`,
  );

  return { ok: true, body, next };
}

/**
 * Renders one session's chronological replay: one line per event (read strength visibly distinct
 * for visits, a revisit named only when `priorVisitId` is present), the coverage block the adapter
 * declared, an honest capacity line, and — whenever the reader skipped anything — an explicit
 * partial-read notice. Always succeeds: a corrupt or crash-truncated trace still renders, it never
 * throws (ADR-0241 D5).
 */
export function renderTraversalSession(
  replay: ContextTraversalReplay,
  opts: { readonly skipped: number },
): TraversalRenderEnvelope {
  const lines: string[] = [];

  const sessionIds = [...new Set(replay.events.map((event) => event.sessionId))];
  const sessionLabel = sessionIds.length > 0 ? sessionIds.join(", ") : "unknown";
  lines.push(`session: ${sessionLabel}`);

  if (opts.skipped > 0) {
    lines.push(`partial replay: ${opts.skipped} event line(s) skipped (unreadable or corrupt)`);
  }

  lines.push(renderCapacityLine(replay.events));
  lines.push(renderCoverageBlock(replay.coverage));

  lines.push("");
  lines.push("visits:");
  if (replay.events.length === 0) {
    lines.push("  (no events observed)");
  } else {
    for (const event of replay.events) {
      lines.push(renderEventLine(event));
    }
  }

  return { ok: true, body: lines.join("\n") };
}
