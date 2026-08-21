/**
 * THE EDGE-RESOLUTION SEAM (ADR-0403 dec 3) — where a decision's own outbound edges come from.
 *
 * `adrs-into-the-dag-arc` increment 09.
 *
 * The owner sequenced the decisions INTO the graph first and the storage migration second, so the
 * depth walk gets built while decisions are still FILES. ADR-0403 dec 3 prices the obvious mistake
 * up front: *"a walk that hard-codes file parsing is rework this decision has already priced"*. So
 * the walk never learns where an edge came from. It asks this interface, and the interface is
 * satisfied today by a pure function over parsed frontmatter rows and tomorrow by a store read, with
 * no change to the walk at all.
 *
 * ## `amends` ONLY, AND THE SEAM IS WHERE THAT IS ENFORCED
 *
 * `amends` means "that decision still stands, and this one rests on it" — distance from the work,
 * which is what a depth measures. `supersedes` means "this replaced that" — archaeology, a chain of
 * length 2, and a count of how often we changed our minds. They are never summed (ADR-0403 dec 6),
 * and the exclusion lives in the SHAPE of the code rather than in a comment:
 *
 *   - {@link DecisionAmendsResolver} exposes ONE verb, {@link DecisionAmendsResolver.amendsOf}.
 *     There is no `supersedesOf`, and there is NO EDGE-TYPE PARAMETER anywhere — a resolver that
 *     took a flag would eventually be called with the wrong one.
 *   - {@link AmendsOnlyDecision} does not carry `supersedes`, so {@link decisionAmendsResolver}
 *     cannot read it even by mistake. `AdrMeta` is assignable to it (it has the field), which is the
 *     point: the caller hands over the whole record and the PARAMETER TYPE performs the exclusion.
 *     This is `probe:adr-graph`'s `AmendsRow` discipline, reused rather than re-derived.
 *
 * A future store-backed implementation inherits the same fence for free: to satisfy this interface
 * it must expose `amendsOf`, and there is nowhere to put a second edge type.
 *
 * ## THE DENOMINATOR IS PART OF THE INTERFACE, NOT AN AFTERTHOUGHT
 *
 * {@link DecisionAmendsResolver.decisions} enumerates every decision the resolver can see. It is
 * required rather than convenient: a walk holding a resolver that answers `amendsOf` for nothing can
 * report a depth of 2 and look exactly like a corpus whose wiring is shallow. The count is what lets
 * the caller tell "the decisions were walked and are shallow" from "no decision was ever seen"
 * — the same distinction `evaluateDependsOnAcyclicity` reports its denominators for.
 *
 * Pure and browser-safe: no filesystem, no store, no zod.
 */

/**
 * The ONLY view of a decision this seam is allowed to see.
 *
 * `supersedes` is absent from the type, so {@link decisionAmendsResolver} cannot read it — see the
 * header. Structurally satisfied by `AdrMeta` from `@storytree/drive`, and by a store row after the
 * migration, without either of them being imported here.
 */
export interface AmendsOnlyDecision {
  readonly number: number;
  /** The decisions this one still rests on. */
  readonly amends: readonly number[];
}

/**
 * Where the depth walk gets a decision's outbound edges. FILE-BACKED today
 * ({@link decisionAmendsResolver} over parsed frontmatter), store-backed after
 * `decision-log-home-arc`'s migration — and the walk never learns which.
 */
export interface DecisionAmendsResolver {
  /**
   * Every decision this resolver can see, in no guaranteed order.
   *
   * The walk's denominator. See the header: without it, a resolver that sees nothing is
   * indistinguishable from a decision log that is genuinely shallow.
   */
  readonly decisions: readonly number[];
  /**
   * The decisions `decisionNumber` AMENDS — never the ones it supersedes.
   *
   * TOTAL: a decision this resolver does not hold answers with an empty list rather than throwing,
   * because the walk resolves pointers authored by a corpus this resolver did not author.
   */
  amendsOf(decisionNumber: number): readonly number[];
}

/**
 * PURE: a resolver over decision rows already in hand — today's file-backed half of the seam.
 *
 * THIS FUNCTION NEVER SEES `supersedes`: its parameter type does not carry the field, so the
 * exclusion survives a later edit that has forgotten why it mattered.
 *
 * The FIRST row wins on a duplicate number, matching `findDependsOnCycles` and
 * `evaluateDepthFromWork`: re-pointing a number at a later row would silently re-parent everything
 * beneath it. Targets naming a decision this resolver does not hold are left in place and reported
 * as dangling by the WALK, which is the only layer that knows what "held" means for its own graph.
 */
export function decisionAmendsResolver(
  rows: readonly AmendsOnlyDecision[],
): DecisionAmendsResolver {
  const amendsByNumber = new Map<number, readonly number[]>();
  for (const row of rows) {
    if (amendsByNumber.has(row.number)) continue;
    amendsByNumber.set(row.number, [...row.amends]);
  }
  const decisions = [...amendsByNumber.keys()];
  return {
    decisions,
    amendsOf: (decisionNumber: number): readonly number[] =>
      amendsByNumber.get(decisionNumber) ?? [],
  };
}
