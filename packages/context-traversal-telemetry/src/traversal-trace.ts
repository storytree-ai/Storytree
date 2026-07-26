/**
 * The deterministic append/replay trace over the strict context-traversal event vocabulary
 * (story `context-traversal-telemetry`, capability `traversal-event-vocabulary`, ADR-0235 /
 * ADR-0192).
 *
 * The trace never calls a clock, generates an id, or derives causality — every identity and
 * timestamp originates at the calling adapter. `append`/`declareCoverage` parse their input as
 * `unknown`, refuse a duplicate `eventId`/`visitId`/`adapterId` by throwing, and mutate nothing
 * until every check has passed. `replay` orders a session's own events chronologically by their
 * own `at` timestamp and creates a relationship ONLY from an explicit id already present on an
 * event (`priorVisitId`/`parentVisitId`/`followedEdgeId`) — timestamp adjacency is never evidence.
 */
import {
  ContextTraversalEvent,
  ContextTraversalCoverage,
  isContextVisitEvent,
  type ModelContextEvent,
} from "./traversal-events.js";

export interface ContextTraversalRelationship {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: "prior_visit" | "parent_visit" | "followed_edge";
}

export interface ContextTraversalSessionLane {
  readonly sessionId: string;
  readonly events: readonly ContextTraversalEvent[];
  readonly modelContext: readonly ModelContextEvent[];
}

export interface ContextTraversalReplay {
  readonly events: readonly ContextTraversalEvent[];
  readonly coverage: readonly ContextTraversalCoverage[];
  readonly relationships: readonly ContextTraversalRelationship[];
  readonly sessions: readonly ContextTraversalSessionLane[];
}

export interface ContextTraversalTrace {
  append(input: unknown): ContextTraversalEvent;
  declareCoverage(input: unknown): ContextTraversalCoverage;
  replay(sessionId?: string): ContextTraversalReplay;
}

function eventTime(event: ContextTraversalEvent): number {
  return new Date(event.at).getTime();
}

function buildRelationships(events: readonly ContextTraversalEvent[]): ContextTraversalRelationship[] {
  const relationships: ContextTraversalRelationship[] = [];
  for (const event of events) {
    if (isContextVisitEvent(event)) {
      if (event.priorVisitId !== undefined) {
        relationships.push({ fromId: event.priorVisitId, toId: event.visitId, kind: "prior_visit" });
      }
      if (event.parentVisitId !== undefined) {
        relationships.push({ fromId: event.parentVisitId, toId: event.visitId, kind: "parent_visit" });
      }
    }
    if (event.kind === "followed_edge") {
      relationships.push({ fromId: event.fromVisitId, toId: event.toVisitId, kind: "followed_edge" });
    }
  }
  return relationships;
}

export function createContextTraversalTrace(): ContextTraversalTrace {
  const events: ContextTraversalEvent[] = [];
  const eventIds = new Set<string>();
  const visitIds = new Set<string>();
  const coverageByAdapterId = new Map<string, ContextTraversalCoverage>();

  return {
    append(input: unknown): ContextTraversalEvent {
      const event = ContextTraversalEvent.parse(input);

      if (eventIds.has(event.eventId)) {
        throw new Error(`duplicate eventId: ${event.eventId}`);
      }
      if (isContextVisitEvent(event) && visitIds.has(event.visitId)) {
        throw new Error(`duplicate visitId: ${event.visitId}`);
      }

      // every check has passed — now mutate.
      eventIds.add(event.eventId);
      if (isContextVisitEvent(event)) {
        visitIds.add(event.visitId);
      }
      events.push(event);
      return event;
    },

    declareCoverage(input: unknown): ContextTraversalCoverage {
      const coverage = ContextTraversalCoverage.parse(input);

      if (coverageByAdapterId.has(coverage.adapterId)) {
        throw new Error(`duplicate adapterId: ${coverage.adapterId}`);
      }

      coverageByAdapterId.set(coverage.adapterId, coverage);
      return coverage;
    },

    replay(sessionId?: string): ContextTraversalReplay {
      const scoped = sessionId === undefined ? events : events.filter((event) => event.sessionId === sessionId);
      const ordered = [...scoped].sort((a, b) => eventTime(a) - eventTime(b));
      const relationships = buildRelationships(ordered);
      const coverage = [...coverageByAdapterId.values()];

      const sessionIds = new Set(ordered.map((event) => event.sessionId));
      const sessions: ContextTraversalSessionLane[] = [...sessionIds].map((lane) => {
        const laneEvents = ordered.filter((event) => event.sessionId === lane);
        return {
          sessionId: lane,
          events: laneEvents,
          modelContext: laneEvents.filter((event): event is ModelContextEvent => event.kind === "model_context"),
        };
      });

      return { events: ordered, coverage, relationships, sessions };
    },
  };
}
