/**
 * Story `context-traversal-capture`, capability `offer-set-render-agreement` (ADR-0260),
 * story spec `stories/context-traversal-capture/offer-set-render-agreement.md`.
 *
 * Every capability landed on this story so far verifies a read against ITS OWN recorded account —
 * against the traversal's own account of what it was shown. That is circular with respect to this
 * arc's end state, which asks for a trace whose offers are known INDEPENDENTLY of the traversal that
 * consumed them. This module breaks that circularity for one axis: it checks the recorded
 * `candidate_set` against an ORACLE that parses the CLI's own printed Sources block
 * (`packages/cli/src/commands.ts`, `viewArtifact`) — never against `doc.references`, and never by
 * importing the id rule from the sibling module that re-derives the recorded set. It applies that
 * module's documented rule (a leading `asset:` is stripped, every other prefix kept verbatim)
 * independently, inline.
 *
 * Measured 2026-08-06 over the live corpus: MEMBERSHIP agrees everywhere (zero divergences across
 * 357 referencing artifacts). ORDER diverges on 63% of multi-reference artifacts, because
 * `resolveArtifactOffers` records authored order while the render regroups by target type
 * (`SOURCE_GROUP_ORDER`). That divergence is PINNED here, not repaired — nothing in the repo joins on
 * offer position (ADR-0235 clause 3 bans ordering as evidence of causation), and reconciling the two
 * paths is a decision for the owner, not this module.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

/** Why a comparison could not be verified — never conflated with an actual agreement. */
export type UnverifiableReason =
  | "the-read-recorded-no-library-artifact-visit"
  | "the-render-and-the-trace-both-offered-nothing";

export interface OfferSetDisagreement {
  /** Printed by the render, absent from the recorded set. */
  readonly missingFromRecorded: readonly string[];
  /** Present in the recorded set, never printed by the render. */
  readonly extraInRecorded: readonly string[];
}

export type OfferSetAgreement =
  | { readonly verified: false; readonly reason: UnverifiableReason }
  | {
      readonly verified: true;
      readonly membershipAgrees: boolean;
      readonly orderAgrees: boolean;
      readonly rendered: readonly string[];
      readonly recorded: readonly string[];
      readonly disagreement: OfferSetDisagreement;
    };

const ASSET_PREFIX = "asset:";
const LIBRARY_ARTIFACT_SURFACE = "library-artifact";
const CANDIDATE_SET_PREFIX = "candidate-set:";

/** The offer-id rule, applied independently rather than imported: strip a leading `asset:`
 *  once, keep every other prefix verbatim. */
function stripAssetPrefix(ref: string): string {
  if (ref.startsWith(ASSET_PREFIX)) return ref.slice(ASSET_PREFIX.length);
  return ref;
}

/**
 * The oracle: parse the ids a real `viewArtifact` render printed under its `Sources:` block, in
 * printed order, duplicates kept. Total over any string — never throws.
 *
 * Mirrors the render exactly (`commands.ts`): `lines.push("", "Sources:")`, then per group
 * `  <Group>:`, then per item `    - <label>  (<ref>)`. An item line's ref is the content of the
 * LAST parenthesised group on the line, anchored at end of line — a label may legitimately carry its
 * own parentheses (an unresolvable pointer renders as `asset:foo (unknown asset)`), so a first-match
 * parse would wrongly return the label's own parenthetical instead of the trailing ref.
 */
export function parseRenderedSourcesOffers(stdout: string): readonly string[] {
  const lines = stdout.split("\n");
  const headerIndex = lines.findIndex((line) => line === "Sources:");
  if (headerIndex === -1) return [];

  const ids: string[] = [];
  const trailingParenRef = /\(([^()]*)\)\s*$/;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.startsWith("  ")) break;
    if (!line.startsWith("    - ")) continue; // a group-header line, e.g. "  Definitions:"
    const match = trailingParenRef.exec(line);
    if (match === undefined || match === null) continue;
    const ref = match[1];
    if (ref === undefined) continue;
    ids.push(stripAssetPrefix(ref));
  }
  return ids;
}

/** Sorted-copy multiset equality: same length, same elements, duplicates significant. */
function multisetsAgree(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function sequencesAgree(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/** Counts, by id, for computing multiset differences (duplicates significant). */
function countsOf(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Ids in `from` whose count exceeds their count in `against`, each repeated by the excess. */
function excessOf(from: readonly string[], against: readonly string[]): string[] {
  const fromCounts = countsOf(from);
  const againstCounts = countsOf(against);
  const excess: string[] = [];
  for (const id of from) {
    const remaining = (fromCounts.get(id) ?? 0) - (againstCounts.get(id) ?? 0);
    if (remaining <= 0) continue;
    // Emit this id once per unit of remaining excess, but only the first time we visit it in `from`
    // (fromCounts already reflects the full multiplicity), so track what's already been emitted.
    fromCounts.set(id, 0);
    for (let i = 0; i < remaining; i++) excess.push(id);
  }
  return excess;
}

/** The `library-artifact`-surface visit within `events`, if any — explicitly typed, no `as` cast. */
function findLibraryArtifactVisit(events: readonly ContextTraversalEvent[]): ContextVisitEvent | undefined {
  return events.find(
    (event): event is ContextVisitEvent =>
      isContextVisitEvent(event) && event.surfaceId === LIBRARY_ARTIFACT_SURFACE,
  );
}

/** The `candidate_set` event within `events` carrying exactly `candidateSetId`, if any. */
function findCandidateSet(
  events: readonly ContextTraversalEvent[],
  candidateSetId: string,
): Extract<ContextTraversalEvent, { kind: "candidate_set" }> | undefined {
  return events.find(
    (event): event is Extract<ContextTraversalEvent, { kind: "candidate_set" }> =>
      event.kind === "candidate_set" && event.candidateSetId === candidateSetId,
  );
}

/**
 * Compare a recorded `candidate_set` (joined by the visit that made it) against the CLI's own
 * rendered Sources block for that same run. Fail-closed: an absent visit or a doubly-empty offer are
 * both reported UNVERIFIED, never as agreement (`asset:unrun-check-is-unverified-not-refuted`).
 */
export function compareOfferSetToRender(
  stdout: string,
  events: readonly ContextTraversalEvent[],
): OfferSetAgreement {
  const visit = findLibraryArtifactVisit(events);
  if (visit === undefined) {
    return { verified: false, reason: "the-read-recorded-no-library-artifact-visit" };
  }

  const candidateSetId = `${CANDIDATE_SET_PREFIX}${visit.visitId}`;
  const candidateSetEvent = findCandidateSet(events, candidateSetId);
  const recorded: readonly string[] = candidateSetEvent?.candidateNodeIds ?? [];
  const rendered = parseRenderedSourcesOffers(stdout);

  if (recorded.length === 0 && rendered.length === 0) {
    return { verified: false, reason: "the-render-and-the-trace-both-offered-nothing" };
  }

  const membershipAgrees = multisetsAgree(rendered, recorded);
  const orderAgrees = membershipAgrees && sequencesAgree(rendered, recorded);

  const disagreement: OfferSetDisagreement = membershipAgrees
    ? { missingFromRecorded: [], extraInRecorded: [] }
    : {
        missingFromRecorded: excessOf(rendered, recorded),
        extraInRecorded: excessOf(recorded, rendered),
      };

  return {
    verified: true,
    membershipAgrees,
    orderAgrees,
    rendered,
    recorded,
    disagreement,
  };
}

/** A single-line summary for a human reading a check. Never throws. */
export function renderOfferSetAgreement(result: OfferSetAgreement): string {
  if (!result.verified) {
    return `offer-set agreement: unverified — ${result.reason}`;
  }
  const membershipWord = result.membershipAgrees ? "agrees" : "DISAGREES";
  const orderWord = result.orderAgrees ? "agrees" : "differs";
  return (
    `offer-set agreement: membership ${membershipWord}, order ${orderWord} ` +
    `(rendered ${result.rendered.length}, recorded ${result.recorded.length})`
  );
}
