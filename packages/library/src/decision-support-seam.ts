/**
 * THE EDGE-RESOLUTION SEAM (ADR-0403 dec 3) — where a decision's own outbound support edges come from.
 *
 * `adrs-into-the-dag-arc` increment 09; collapsed to one edge by
 * `decision-read-measurement-arc-inc-19` (ADR-0431 D1). Formerly `decision-amends-seam.ts`, renamed
 * for the role it performs rather than the edge it started on (ADR-0078).
 *
 * The owner sequenced the decisions INTO the graph first and the storage migration second, so the
 * depth walk gets built while decisions are still FILES. ADR-0403 dec 3 prices the obvious mistake
 * up front: *"a walk that hard-codes file parsing is rework this decision has already priced"*. So
 * the walk never learns where an edge came from. It asks this interface, and the interface is
 * satisfied today by a pure function over rows already in hand and tomorrow by a store read, with no
 * change to the walk at all.
 *
 * ## ONE SUPPORT EDGE NOW, AND THAT IS WHY THERE IS ONE VERB
 *
 * `amends` is RETIRED (ADR-0431 D1). It used to reach this seam beside `dependsOn` as a second
 * support edge meaning "that decision still stands, this one rests on it, AND reading the target
 * alone is now insufficient"; the extra half was a READ OBLIGATION on the target's prose, never a
 * different direction of travel, which is why the walk always traversed both. All 517 edges were
 * migrated onto `dependsOn` in place, so what remains is the single edge {@link
 * DecisionSupportResolver.dependsOnOf} reports. The obligation survives as ADR-0139 D4 — an in-place
 * annotation in the target naming the clause that moved — and after the field's removal that
 * annotation is the ONLY record of an amendment (ADR-0431 D3/D6d).
 *
 * ## `supersedes` NEVER, AND THE SEAM IS STILL WHERE THAT IS ENFORCED
 *
 * `supersedes` is the edge that is NOT support: "this replaced that" — archaeology, a chain of
 * length 2, and a count of how often we changed our minds. It is never summed with support
 * (ADR-0403 dec 6, restated by ADR-0431 D6b), and the exclusion lives in the SHAPE of the code
 * rather than in a comment:
 *
 *   - {@link DecisionSupportResolver} exposes ONE VERB, naming its own edge in its own name. There
 *     is no `supersedesOf`, and there is NO EDGE-TYPE PARAMETER anywhere — a resolver that took a
 *     flag would eventually be called with the wrong one. Collapsing two verbs into one on the way
 *     past ADR-0431 is what KEEPS that: the moment a "which edge?" argument appeared instead, the
 *     guarantee would be gone.
 *   - {@link SupportOnlyDecision} does not carry `supersedes`, so {@link decisionSupportResolver}
 *     cannot read it even by mistake. `AdrMeta` is assignable to it (it has the field), which is the
 *     point: the caller hands over the whole record and the PARAMETER TYPE performs the exclusion.
 *     This is `probe:adr-graph`'s row discipline, reused rather than re-derived.
 *
 * A future store-backed implementation inherits the same fence for free: to satisfy this interface
 * it must expose `dependsOnOf`, and there is nowhere to put a second edge type.
 *
 * ## THE DENOMINATOR IS PART OF THE INTERFACE, NOT AN AFTERTHOUGHT
 *
 * {@link DecisionSupportResolver.decisions} enumerates every decision the resolver can see. It is
 * required rather than convenient: a walk holding a resolver that answers for nothing can report a
 * depth of 2 and look exactly like a corpus whose wiring is shallow. The count is what lets the
 * caller tell "the decisions were walked and are shallow" from "no decision was ever seen" — the
 * same distinction `evaluateDependsOnAcyclicity` reports its denominators for.
 *
 * {@link DecisionSupportResolver.decisionsCarryingDependsOn} is the SECOND denominator, and it
 * outlived the migration that motivated it. Zero resolvable `dependsOn` edges has two utterly
 * different causes — a reader that does not supply the field at all, and a decision log that
 * genuinely carries none — and on 2026-08-23 BOTH were true at once (zero of 412 rows carried the
 * field, and the frontmatter-shaped reader had no field to carry). An edge count alone cannot
 * separate them; a count of how many rows arrived with the FIELD PRESENT can. Now that `dependsOn`
 * is the only support edge, this denominator is the whole graph's observability, not a migration aid.
 *
 * Pure and browser-safe: no filesystem, no store, no zod.
 */

/**
 * The ONLY view of a decision this seam is allowed to see.
 *
 * `supersedes` is absent from the type, so {@link decisionSupportResolver} cannot read it — see the
 * header. Structurally satisfied by `AdrMeta` from `@storytree/drive`, and by a store row, without
 * either of them being imported here.
 */
export interface SupportOnlyDecision {
  readonly number: number;
  /**
   * The decision's own `dependsOn` pointers, EXACTLY AS STORED — the one support edge (ADR-0431 D1).
   *
   * POINTERS, not decision numbers. `dependsOn` arrives from `buildKindSchema` like every other
   * kind's and may name a Library artifact or any repository file as readily as a decision.
   * Resolving which is which is the WALK's job, through the one parser in `decision-pointer.ts` —
   * this seam reports where the edges came from and never learns what they mean.
   *
   * OPTIONAL, deliberately. A frontmatter-shaped row has no such field, and making it required would
   * break assignability for every reader that has not been widened. ABSENT means "this reader cannot
   * see the edge", which is a different fact from "this decision has none", and
   * {@link DecisionSupportResolver.decisionsCarryingDependsOn} is what keeps the two apart.
   */
  readonly dependsOn?: readonly string[];
}

/**
 * Where the depth walk gets a decision's outbound support edges — and the walk never learns whether
 * they arrived from a row in hand or from a store.
 */
export interface DecisionSupportResolver {
  /**
   * Every decision this resolver can see, in no guaranteed order.
   *
   * The walk's denominator. See the header: without it, a resolver that sees nothing is
   * indistinguishable from a decision log that is genuinely shallow.
   */
  readonly decisions: readonly number[];
  /**
   * How many of {@link decisions} arrived with a `dependsOn` FIELD AT ALL — present, even if empty.
   *
   * PRESENCE, not non-emptiness, and that is the whole point: it answers "was the support graph
   * READ?", which no edge count can.
   */
  readonly decisionsCarryingDependsOn: number;
  /**
   * The `dependsOn` POINTERS `decisionNumber` carries, unparsed — never the ones it supersedes.
   *
   * Returning raw pointers keeps the resolution of "is this target a decision?" in the walk, where
   * `decision-pointer.ts` is already the single parser for all three live spellings.
   *
   * TOTAL: a decision this resolver does not hold answers with an empty list rather than throwing,
   * because the walk resolves pointers authored by a corpus this resolver did not author. EMPTY FOR
   * TWO DIFFERENT REASONS — a decision that carries no `dependsOn`, and a reader that supplies no
   * such field. {@link decisionsCarryingDependsOn} separates them; this verb deliberately does not.
   */
  dependsOnOf(decisionNumber: number): readonly string[];
}

/**
 * PURE: a resolver over decision rows already in hand.
 *
 * THIS FUNCTION NEVER SEES `supersedes`: its parameter type does not carry the field, so the
 * exclusion survives a later edit that has forgotten why it mattered.
 *
 * The FIRST row wins on a duplicate number, matching `findDependsOnCycles` and
 * `evaluateDepthFromWork`: re-pointing a number at a later row would silently re-parent everything
 * beneath it. The winning row wins WHOLESALE — both its edge list and its field presence.
 *
 * Targets naming a decision this resolver does not hold are left in place and reported as dangling
 * by the WALK, which is the only layer that knows what "held" means for its own graph.
 */
export function decisionSupportResolver(
  rows: readonly SupportOnlyDecision[],
): DecisionSupportResolver {
  const dependsOnByNumber = new Map<number, readonly string[]>();
  const order: number[] = [];
  const seen = new Set<number>();
  let decisionsCarryingDependsOn = 0;
  for (const row of rows) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    order.push(row.number);
    // PRESENCE is what is counted, so an empty-but-present list still says "this reader can see the
    // field" — the distinction the header exists for. Absent stays absent rather than being
    // defaulted to `[]`, because defaulting is precisely what would erase it.
    if (row.dependsOn !== undefined) {
      decisionsCarryingDependsOn += 1;
      dependsOnByNumber.set(row.number, [...row.dependsOn]);
    }
  }
  return {
    decisions: order,
    decisionsCarryingDependsOn,
    dependsOnOf: (decisionNumber: number): readonly string[] =>
      dependsOnByNumber.get(decisionNumber) ?? [],
  };
}
