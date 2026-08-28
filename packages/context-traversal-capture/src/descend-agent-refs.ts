/**
 * Agent-ref descent (ADR-0235/ADR-0241), story `context-traversal-capture`, capability
 * `agent-ref-descent`.
 *
 * `storytree agents <name>` renders the ESSENTIALS view (`renderAgentEssentials`,
 * `packages/library/src/store/render-agent.ts`), which walks the agent's `rules` then
 * `antiPatterns` floor refs (`FLOOR_SECTIONS`) and resolves each one via the store. This module
 * makes that resolution a context-traversal fact:
 *
 *   - {@link resolveAgentDescent} re-derives, from the same argv + a store satisfying the same
 *     shape the render reads, exactly the floor ref ids the render actually resolved, in render
 *     order (rules then antiPatterns, dangling refs excluded) — but ONLY for the bare
 *     `agents <name>` dispatch shape; `--step`/`--help`/`-h` route elsewhere in the real CLI
 *     (`packages/cli/src/commands.ts`) and never reach the essentials render.
 *   - {@link descendAgentRefs} turns those resolved ids into child `front_matter_read` visits
 *     naming the agent's own visit as `parentVisitId` — an explicit id carried on the call, never a
 *     correlation from ordering or timestamp proximity (ADR-0235 clause 3).
 *
 * Both functions are total: a missing doc, a non-agent doc, or a rejecting store resolves to no
 * descent, never a thrown error — telemetry must never break a command.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextVisitEvent,
  FrontMatterReadEvent,
} from "@storytree/context-traversal-telemetry";

import type { ObserveCliDeps } from "./observe-cli.js";
import { REVISIT_LINK_COVERAGE } from "./revisit-links.js";

/** The floor sections of the essentials view, in render order (mirrors `FLOOR_SECTIONS`). */
const FLOOR_FIELDS: readonly ("rules" | "antiPatterns")[] = ["rules", "antiPatterns"];

const AGENTS_SURFACE = "agents";

/**
 * The structural shape `renderAgentEssentials` reads a doc through — `@storytree/storage-protocol`'s
 * `Store` satisfies this as-is. Declared locally so this module imports no new package.
 */
export interface AgentDocStore {
  getDoc(id: string): Promise<{ readonly id: string; readonly kind: string; readonly doc: unknown } | null>;
}

/** The identity + clock this producer needs to mint child visit events. */
export type AgentDescentDeps = Pick<ObserveCliDeps, "sessionId" | "nextVisitId" | "now">;

/** The `asset:<id>` ids of a ref-list field on a raw agent doc (empty for an absent/odd field). */
function refIdsOf(doc: Record<string, unknown>, field: string): string[] {
  const v = doc[field];
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/^asset:/, ""));
}

/**
 * Does this argv match the bare `agents <name>` dispatch shape (`packages/cli/src/commands.ts`)?
 * `--step` routes to `agentStepCommand`, `--help`/`-h` short-circuits to `agentsHelp()`, and either
 * one anywhere in argv means this is not the bare essentials render.
 */
function isBareAgentsDispatch(argv: readonly string[]): argv is readonly [string, string, ...string[]] {
  const [area, name] = argv;
  if (area !== "agents") return false;
  if (name === undefined || name.startsWith("-")) return false;
  return !argv.includes("--step") && !argv.includes("--help") && !argv.includes("-h");
}

/**
 * Re-derive exactly the floor ref ids `renderAgentEssentials` would resolve for this argv, in
 * render order. Total: any non-bare dispatch shape, missing/non-agent doc, or store rejection
 * resolves to `[]`, never a thrown error.
 */
export async function resolveAgentDescent(
  argv: readonly string[],
  store: AgentDocStore,
): Promise<readonly string[]> {
  if (!isBareAgentsDispatch(argv)) return [];
  const name = argv[1];

  let agentDoc: { readonly id: string; readonly kind: string; readonly doc: unknown } | null;
  try {
    agentDoc = await store.getDoc(name);
  } catch {
    return [];
  }
  if (agentDoc === null || agentDoc.kind !== "agent") return [];

  const doc = (agentDoc.doc ?? {}) as Record<string, unknown>;
  const resolved: string[] = [];
  for (const field of FLOOR_FIELDS) {
    for (const id of refIdsOf(doc, field)) {
      let refDoc: { readonly id: string; readonly kind: string; readonly doc: unknown } | null;
      try {
        refDoc = await store.getDoc(id);
      } catch {
        continue;
      }
      if (refDoc !== null) resolved.push(id);
    }
  }
  return resolved;
}

/**
 * Locate the agent's own visit within `observed` — the `full_payload_read` the `agents` surface
 * emits (`observe-cli.ts`'s `AGENTS_SURFACE`).
 */
function findAgentVisit(observed: readonly ContextTraversalEvent[]): ContextVisitEvent | undefined {
  return observed.find(
    (event): event is ContextVisitEvent => isContextVisitEvent(event) && event.surfaceId === AGENTS_SURFACE,
  );
}

/**
 * Turn each resolved floor-ref id into a `front_matter_read` child visit naming the agent's own
 * visit as `parentVisitId`. A no-op — `observed` passes through unchanged — when no agent visit is
 * present in `observed` (nothing to be a parent).
 *
 * A child inherits the agent visit's `surfaceId`: the ref was read THROUGH the agents surface, as
 * part of rendering that agent, so claiming any other surface (or none) would misreport where the
 * read happened — and `renderVisitLine` would print `surface=unknown-surface` for every child. It is
 * assigned only when the parent HAS one, so when the parent has no `surfaceId` the key is absent on
 * the child rather than written as `undefined` (`exactOptionalPropertyTypes`, and the sink writes
 * `JSON.stringify`).
 */
export function descendAgentRefs(
  observed: readonly ContextTraversalEvent[],
  refIds: readonly string[],
  deps: AgentDescentDeps,
): ContextTraversalEvent[] {
  const agentVisit = findAgentVisit(observed);
  if (agentVisit === undefined) return [...observed];

  const children: ContextTraversalEvent[] = refIds.map((nodeId) => {
    const visitId = deps.nextVisitId();
    // A surfaceless parent leaves `surfaceId` ABSENT on each child, exactly as before — the key is
    // never present-and-undefined, which is what keeps it out of the serialised line.
    const child: FrontMatterReadEvent = {
      kind: "front_matter_read",
      eventId: `event:${visitId}`,
      sessionId: deps.sessionId,
      at: deps.now().toISOString(),
      visitId,
      nodeId,
      parentVisitId: agentVisit.visitId,
    };
    if (agentVisit.surfaceId !== undefined) child.surfaceId = agentVisit.surfaceId;
    return child;
  });

  return [...observed, ...children];
}

/**
 * The `terminal-cli-dispatch` coverage, composed: `field:parent_visit_id` moves from `omitted` to
 * `supported` because this module wires parent-visit links onto that adapter's `agents` output.
 * Every other feature (including `field:prior_visit_id`, the revisit-link base's own addition)
 * stays exactly where the base put it — composition, never a rewrite.
 */
export const AGENT_DESCENT_COVERAGE: ContextTraversalCoverage = {
  adapterId: REVISIT_LINK_COVERAGE.adapterId,
  supported: [...REVISIT_LINK_COVERAGE.supported, "field:parent_visit_id"],
  omitted: REVISIT_LINK_COVERAGE.omitted.filter((feature) => feature !== "field:parent_visit_id"),
};

// ---------------------------------------------------------------------------
// Coverage caveats
// ---------------------------------------------------------------------------

/**
 * A named gap in what an adapter can observe, stated alongside its supported/omitted lists
 * (ADR-0235 clause 6). The closed feature enum says WHICH events an adapter emits; it cannot say
 * why the resulting picture is thin. A caveat says that, in prose, in the same body.
 *
 * Re-homed here by ADR-0464 D1, which deleted `offer-candidate-sets.ts` where it used to live.
 * Nothing about the type is offer-specific — it outlived the module that happened to introduce it,
 * and it now sits beside {@link AGENT_DESCENT_COVERAGE}, the outermost surviving composition.
 */
export interface CoverageCaveat {
  readonly id: string;
  readonly note: string;
}

/**
 * The `terminal-cli-dispatch` caveats after ADR-0464 D1.
 *
 * The three ADR-0260 D7 caveats this list replaces were all about the OFFER surface — that a `doc:`
 * ref is offered but its follow is unobservable, that follow-completeness depends on the agent
 * re-using the offered command form, and that an unanswered offer is indistinguishable from a
 * bypassed mechanism. All three described gaps in a mechanism that no longer exists, so carrying
 * them forward would describe a thinness in a picture this adapter no longer draws at all.
 *
 * What replaces them is the honest successor limit, and it is deliberately stated rather than left
 * as an empty block: this adapter records no `candidate_set` and no `followed_edge`, so the
 * offer→follow causality question cannot be asked of a trace captured after this landing. That is
 * ADR-0464 D5's accepted cost written where a coverage READER meets it — the push became a pull, and
 * no instrument survives that could say which offers were useful. ADR-0260 D4's standing refusal
 * carries through unchanged and now binds trivially: the gap is never repaired by inference, and a
 * reader must not join a read to a prior render and call the result a follow.
 */
export const AGENT_DESCENT_CAVEATS: readonly CoverageCaveat[] = [
  {
    id: "offers-and-follows-are-no-longer-recorded",
    note:
      "This adapter records no `candidate_set` and no `followed_edge` — the citation-derived offer " +
      "surface was retired by ADR-0464 D1, and both event kinds are declared `omitted` above. So a " +
      "trace captured after that landing can answer nothing about which onward pointer a render " +
      "offered or which one a later read answered. The gap is deliberate, not a defect, and it is " +
      "never repaired by inference (ADR-0260 D4): joining a read to an earlier render on node id " +
      "alone would manufacture the causality the retired mechanism declined to guess at.",
  },
];

/** Render a caveat list as lines of `<id>: <note>`, for surfacing alongside a coverage report. */
export function renderCoverageCaveats(caveats: readonly CoverageCaveat[]): string {
  return caveats.map((caveat) => `${caveat.id}: ${caveat.note}`).join("\n");
}
