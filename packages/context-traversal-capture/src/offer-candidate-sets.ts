/**
 * Story `context-traversal-capture`, capability `artifact-offer-candidate-sets`
 * (ADR-0235 / ADR-0260), story spec
 * `stories/context-traversal-capture/artifact-offer-candidate-sets.md`.
 *
 * `storytree library artifact <id>` runs `viewArtifact` (`packages/cli/src/commands.ts:269`),
 * which renders the doc through `renderStoredDoc` and then prints a **Sources** block from
 * `groupSources(a.references, …)` (`commands.ts:282-294`). Every `renderStoredDoc` branch sets
 * `references` from `asStringArray(doc.references)`, so the doc's own `references` array IS the
 * printed offer list, unconditionally — nothing here is inferred or re-derived beyond that array.
 *
 * {@link resolveArtifactOffers} re-derives that same list from argv + a store, restricted to the
 * exact bare-id dispatch shape `observeCliInvocation` already observes a visit for
 * (`observe-cli.ts:95-103`) — a candidate set with no rendering visit to join to would be an orphan.
 *
 * {@link emitCandidateSet} is a pure function of the render's own visit plus the offered ids: it is
 * handed no future events and can consult none, so an offer is recorded at RENDER time whether or
 * not anything ever follows it (ADR-0260 D2). It is idempotent per rendering visit — re-running it
 * over its own output never appends a second, duplicate candidate set — and never mutates or
 * replaces the passed-through visit event.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextVisitEvent,
} from "@storytree/context-traversal-telemetry";

import { AGENT_DESCENT_COVERAGE } from "./descend-agent-refs.js";
import type { AgentDocStore } from "./descend-agent-refs.js";
import type { ObserveCliDeps } from "./observe-cli.js";

/** The structural store port this module reads through — `AgentDocStore` (== `@storytree/storage-protocol`'s `Store`) satisfies it as-is. Add no package. */
export type OfferDocStore = AgentDocStore;

/** The identity + clock this producer needs to mint a candidate-set event. */
export type OfferDeps = Pick<ObserveCliDeps, "sessionId" | "nextVisitId" | "now">;

/** One ADR-0260 D7 gap this adapter's coverage carries alongside it, machine-id keyed. */
export interface CoverageCaveat {
  readonly id: string;
  readonly note: string;
}

const ASSET_PREFIX = "asset:";

/** The surface id a `library artifact <id>` render's visit carries (`observe-cli.ts:21`). */
export const LIBRARY_ARTIFACT_SURFACE = "library-artifact";

/**
 * The prefix every candidate-set id carries. The id shape is `candidate-set:<rendering visitId>`,
 * and that is load-bearing rather than cosmetic: `CandidateSetEvent` has no `visitId` field, so the
 * id is the ONLY carrier of which visit made the offer — which is what lets a later answering read
 * name the edge's `fromVisitId` from the id alone, with no trace lookup (ADR-0260 D3).
 */
export const CANDIDATE_SET_PREFIX = "candidate-set:";

/** The candidate-set id for a render whose visit is `visitId`. The one place the shape is minted. */
export function candidateSetIdOf(visitId: string): string {
  return `${CANDIDATE_SET_PREFIX}${visitId}`;
}

/**
 * Does this argv match the bare `library artifact <id>` dispatch shape `observeCliInvocation`
 * already observes a visit for (`observe-cli.ts:95-103`)? Mirrored exactly, never widened: the
 * `list` sub-verb, a missing id, and any trailing token (flags, sub-verbs) all observe no visit.
 */
export function isOfferableArtifactRead(argv: readonly string[]): argv is readonly [string, string, string] {
  if (argv.length !== 3) return false;
  const [area, sub, id] = argv;
  return area === "library" && sub === "artifact" && id !== "list";
}

/** The offer id for one raw reference: `asset:` stripped, everything else kept verbatim. */
export function offerIdOf(ref: string): string {
  if (ref.startsWith(ASSET_PREFIX)) return ref.slice(ASSET_PREFIX.length);
  return ref;
}

/**
 * Re-derive, from argv + a store, exactly the ref ids `viewArtifact`'s Sources block would print
 * for that argv, in authored order. Total: a non-bare dispatch shape, a missing doc, a store
 * rejection, or an odd `references` shape (absent, non-array, holding non-string entries) all
 * resolve to `[]`, never a thrown error — telemetry must never break a command.
 */
export async function resolveArtifactOffers(
  argv: readonly string[],
  store: OfferDocStore,
): Promise<readonly string[]> {
  if (!isOfferableArtifactRead(argv)) return [];
  const [, , id] = argv;

  let found: { readonly id: string; readonly kind: string; readonly doc: unknown } | null;
  try {
    found = await store.getDoc(id);
  } catch {
    return [];
  }
  if (found === null) return [];

  const doc = found.doc;
  if (typeof doc !== "object" || doc === null) return [];
  const refsRaw = (doc as Record<string, unknown>).references;
  if (!Array.isArray(refsRaw)) return [];

  const offered: string[] = [];
  for (const ref of refsRaw) {
    if (typeof ref !== "string") continue;
    offered.push(offerIdOf(ref));
  }
  return offered;
}

/**
 * Locate the rendering visit within `observed` — the `library-artifact` surface visit
 * `observeCliInvocation` emits for a bare `library artifact <id>` read.
 */
function findRenderVisit(
  observed: readonly ContextTraversalEvent[],
): (ContextVisitEvent & { surfaceId: string }) | undefined {
  return observed.find(
    (event): event is ContextVisitEvent & { surfaceId: string } =>
      isContextVisitEvent(event) && event.surfaceId === LIBRARY_ARTIFACT_SURFACE,
  );
}

/**
 * Turn one render's offered ids into a `candidate_set` event naming that render's own visit — at
 * RENDER time, regardless of whether anything ever follows any of them (ADR-0260 D2). A no-op —
 * `observed` passes through unchanged, never mutated — when no library-artifact render visit is
 * present, or when there is nothing offered. Idempotent per rendering visit: re-running this over
 * its own output appends nothing new, it never replaces the recorded offer.
 */
export function emitCandidateSet(
  observed: readonly ContextTraversalEvent[],
  offeredIds: readonly string[],
  deps: OfferDeps,
): ContextTraversalEvent[] {
  const renderVisit = findRenderVisit(observed);
  if (renderVisit === undefined) return [...observed];
  if (offeredIds.length === 0) return [...observed];

  const candidateSetId = candidateSetIdOf(renderVisit.visitId);
  const alreadyRecorded = observed.some(
    (event) => event.kind === "candidate_set" && event.candidateSetId === candidateSetId,
  );
  if (alreadyRecorded) return [...observed];

  const [firstId, ...restIds] = offeredIds;
  if (firstId === undefined) return [...observed];
  const candidateNodeIds: [string, ...string[]] = [firstId, ...restIds];

  const candidateEvent: ContextTraversalEvent = {
    kind: "candidate_set",
    eventId: `event:${candidateSetId}`,
    sessionId: deps.sessionId,
    at: deps.now().toISOString(),
    candidateSetId,
    surfaceId: renderVisit.surfaceId,
    candidateNodeIds,
  };

  return [...observed, candidateEvent];
}

/**
 * The `terminal-cli-dispatch` coverage, composed: `event:candidate_set` moves from `omitted` to
 * `supported` because this module wires render-time offer recording onto that adapter's `library
 * artifact` output. Every other feature stays exactly where `AGENT_DESCENT_COVERAGE` put it —
 * composition, never a rewrite. `event:followed_edge` and `field:candidate_follow_causality` stay
 * omitted: this adapter records the offer and nothing whatever about which offer was answered.
 */
export const OFFER_CANDIDATE_SET_COVERAGE: ContextTraversalCoverage = {
  adapterId: AGENT_DESCENT_COVERAGE.adapterId,
  supported: [...AGENT_DESCENT_COVERAGE.supported, "event:candidate_set"],
  omitted: AGENT_DESCENT_COVERAGE.omitted.filter((feature) => feature !== "event:candidate_set"),
};

/**
 * The two ADR-0260 D7 gaps this adapter's coverage must stay visible alongside, not silently paper
 * over: `doc:` refs are offered but a follow of one is unobservable, and follow-completeness
 * depends on the agent re-using the offered command form.
 */
export const OFFER_CANDIDATE_SET_CAVEATS: readonly CoverageCaveat[] = [
  {
    id: "doc-refs-are-offered-but-follows-are-unobservable",
    note:
      "`doc:` refs (e.g. ADR files) are recorded as offered because the Sources block really does " +
      "print them, but this adapter can never observe whether one was followed — a `doc:` ref has " +
      "no canonical Library node, so there is no visit for a follow to land on.",
  },
  {
    id: "follow-completeness-depends-on-the-offered-command-form",
    note:
      "A follow is only observable when the agent re-invokes the exact bare `library artifact <id>` " +
      "read form this adapter dispatches on; any other path to the same content (a different " +
      "command shape, a direct file read) is invisible to this telemetry.",
  },
];

/** Render a caveat list as lines of `<id>: <note>`, for surfacing alongside a coverage report. */
export function renderCoverageCaveats(caveats: readonly CoverageCaveat[]): string {
  return caveats.map((caveat) => `${caveat.id}: ${caveat.note}`).join("\n");
}
