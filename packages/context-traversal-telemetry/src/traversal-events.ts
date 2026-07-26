/**
 * The strict, metadata-only context-traversal event vocabulary (story
 * `context-traversal-telemetry`, capability `traversal-event-vocabulary`, ADR-0235 / ADR-0192).
 *
 * Every event kind is a `.strict()` zod object: no arbitrary metadata bag, no content-bearing
 * field (prompt/body/text/result/etc). Identity is explicit — canonical `nodeId` is never
 * conflated with chronological `visitId`, and relationships (priorVisitId/parentVisitId/
 * followedEdgeId/spawn edges) are always named, never inferred from timestamp proximity.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** A non-blank identity string — refuses "", and whitespace-only. */
const identity = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: "identity must not be blank or whitespace-only",
});

/** An ISO-8601 timestamp carrying an explicit offset. */
const isoTimestamp = z.string().refine(
  (value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && /[Zz]|[+-]\d{2}:\d{2}$/.test(value);
  },
  { message: "at must be an ISO-8601 timestamp with an explicit offset" },
);

const nonNegativeInt = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();

const eventBase = {
  eventId: identity,
  sessionId: identity,
  at: isoTimestamp,
};

// ---------------------------------------------------------------------------
// Node-visit events — canonical nodeId vs. chronological visitId
// ---------------------------------------------------------------------------

const visitFields = {
  ...eventBase,
  visitId: identity,
  nodeId: identity,
  surfaceId: identity.optional(),
  parentVisitId: identity.optional(),
  priorVisitId: identity.optional(),
  followedEdgeId: identity.optional(),
};

export const FrontMatterReadEvent = z
  .object({
    kind: z.literal("front_matter_read"),
    ...visitFields,
  })
  .strict();
export type FrontMatterReadEvent = z.infer<typeof FrontMatterReadEvent>;

export const FullPayloadReadEvent = z
  .object({
    kind: z.literal("full_payload_read"),
    ...visitFields,
  })
  .strict();
export type FullPayloadReadEvent = z.infer<typeof FullPayloadReadEvent>;

// ---------------------------------------------------------------------------
// Search / candidate-set / followed-edge events
// ---------------------------------------------------------------------------

export const SearchEvent = z
  .object({
    kind: z.literal("search"),
    ...eventBase,
    searchId: identity,
    surfaceId: identity,
    operation: z.enum(["library_artifact_list", "library_dashboard"]),
    resultNodeIds: z.array(identity),
  })
  .strict();
export type SearchEvent = z.infer<typeof SearchEvent>;

export const CandidateSetEvent = z
  .object({
    kind: z.literal("candidate_set"),
    ...eventBase,
    candidateSetId: identity,
    surfaceId: identity,
    candidateNodeIds: z.array(identity).nonempty(),
  })
  .strict();
export type CandidateSetEvent = z.infer<typeof CandidateSetEvent>;

export const FollowedEdgeEvent = z
  .object({
    kind: z.literal("followed_edge"),
    ...eventBase,
    edgeId: identity,
    candidateSetId: identity,
    fromVisitId: identity,
    toVisitId: identity,
  })
  .strict();
export type FollowedEdgeEvent = z.infer<typeof FollowedEdgeEvent>;

// ---------------------------------------------------------------------------
// Model-context observations — capacity is runtime-declared, or absent
// ---------------------------------------------------------------------------

export const ModelContextEvent = z
  .object({
    kind: z.literal("model_context"),
    ...eventBase,
    modelId: identity.optional(),
    cumulativeInputTokens: nonNegativeInt,
    addedInputTokens: nonNegativeInt,
    contextWindowCapacity: positiveInt.optional(),
  })
  .strict();
export type ModelContextEvent = z.infer<typeof ModelContextEvent>;

// ---------------------------------------------------------------------------
// Spawn handoff / result return — explicit parent/child session identity + edge identity only
// ---------------------------------------------------------------------------

const spawnEdgeBase = {
  ...eventBase,
  edgeId: identity,
  parentSessionId: identity,
  childSessionId: identity,
};

const spawnEdgeInvariants = {
  message: "parentSessionId/childSessionId must differ, and sessionId must equal parentSessionId",
} as const;

function spawnEdgeIsValid(value: { sessionId: string; parentSessionId: string; childSessionId: string }): boolean {
  return value.parentSessionId !== value.childSessionId && value.sessionId === value.parentSessionId;
}

export const SpawnHandoffEvent = z
  .object({
    kind: z.literal("spawn_handoff"),
    ...spawnEdgeBase,
    agentType: identity,
    payloadTokenCount: nonNegativeInt.optional(),
  })
  .strict()
  .refine(spawnEdgeIsValid, spawnEdgeInvariants);
export type SpawnHandoffEvent = z.infer<typeof SpawnHandoffEvent>;

export const ResultReturnEvent = z
  .object({
    kind: z.literal("result_return"),
    ...spawnEdgeBase,
    ok: z.boolean(),
    resultTokenCount: nonNegativeInt.optional(),
  })
  .strict()
  .refine(spawnEdgeIsValid, spawnEdgeInvariants);
export type ResultReturnEvent = z.infer<typeof ResultReturnEvent>;

// ---------------------------------------------------------------------------
// The union
// ---------------------------------------------------------------------------

export const ContextTraversalEvent = z.union([
  FrontMatterReadEvent,
  FullPayloadReadEvent,
  SearchEvent,
  CandidateSetEvent,
  FollowedEdgeEvent,
  ModelContextEvent,
  SpawnHandoffEvent,
  ResultReturnEvent,
]);
export type ContextTraversalEvent = z.infer<typeof ContextTraversalEvent>;

export type ContextVisitEvent = FrontMatterReadEvent | FullPayloadReadEvent;
export type ContextModelEvent = ModelContextEvent;

export function isContextVisitEvent(event: ContextTraversalEvent): event is ContextVisitEvent {
  return event.kind === "front_matter_read" || event.kind === "full_payload_read";
}

// ---------------------------------------------------------------------------
// Adapter coverage — closed feature domain, exhaustively named across supported/omitted
// ---------------------------------------------------------------------------

export const CoverageFeature = z.enum([
  "surface:create_orientation_runner",
  "surface:direct_cli",
  "surface:claude_sdk",
  "surface:codex",
  "surface:owned_loop",
  "surface:spawned_agent",
  "surface:agents",
  "surface:noticeboard",
  "event:front_matter_read",
  "event:full_payload_read",
  "event:search",
  "event:candidate_set",
  "event:followed_edge",
  "event:model_context",
  "event:spawn_handoff",
  "event:result_return",
  "field:surface_id",
  "field:parent_visit_id",
  "field:prior_visit_id",
  "field:model_tokens",
  "field:context_window_capacity",
  "field:candidate_follow_causality",
  "field:child_context_window",
]);
export type CoverageFeature = z.infer<typeof CoverageFeature>;

export const ContextTraversalCoverage = z
  .object({
    adapterId: identity,
    supported: z.array(CoverageFeature),
    omitted: z.array(CoverageFeature),
  })
  .strict()
  .refine(
    (value) => {
      const all = new Set(value.supported);
      const combined = [...value.supported, ...value.omitted];
      if (combined.length !== new Set(combined).size) {
        // a feature named on both lists (or duplicated within one) is refused
        return false;
      }
      const named = new Set(combined);
      return CoverageFeature.options.every((feature) => named.has(feature)) && all.size === value.supported.length;
    },
    { message: "every CoverageFeature must be named exactly once across supported/omitted" },
  );
export type ContextTraversalCoverage = z.infer<typeof ContextTraversalCoverage>;
