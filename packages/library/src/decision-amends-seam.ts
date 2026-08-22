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
 * ## `supersedes` NEVER, AND THE SEAM IS WHERE THAT IS ENFORCED
 *
 * TWO edges reach this seam, and both are SUPPORT — distance from the work, which is what a depth
 * measures. `amends` means "that decision still stands, this one rests on it, AND reading the target
 * alone is now insufficient"; a decision's own `dependsOn` means just "rests on" (ADR-0419 D1). The
 * extra half of `amends` is a READ OBLIGATION on the target's prose, not a different direction of
 * travel, so the walk traverses both — see {@link DecisionAmendsResolver.dependsOnOf}.
 *
 * `supersedes` is the one that is NOT support: "this replaced that" — archaeology, a chain of length
 * 2, and a count of how often we changed our minds. It is never summed with either support edge
 * (ADR-0403 dec 6, untouched by ADR-0419), and the exclusion lives in the SHAPE of the code rather
 * than in a comment:
 *
 *   - {@link DecisionAmendsResolver} exposes ONE VERB PER EDGE, each naming its own edge in its own
 *     name. There is no `supersedesOf`, and there is NO EDGE-TYPE PARAMETER anywhere — a resolver
 *     that took a flag would eventually be called with the wrong one, and adding a SECOND support
 *     edge is exactly the moment such a flag would otherwise have been born.
 *   - {@link AmendsOnlyDecision} does not carry `supersedes`, so {@link decisionAmendsResolver}
 *     cannot read it even by mistake. `AdrMeta` is assignable to it (it has the field), which is the
 *     point: the caller hands over the whole record and the PARAMETER TYPE performs the exclusion.
 *     This is `probe:adr-graph`'s `AmendsRow` discipline, reused rather than re-derived.
 *
 * A future store-backed implementation inherits the same fence for free: to satisfy this interface
 * it must expose `amendsOf` and `dependsOnOf`, and there is nowhere to put a third edge type.
 *
 * The NAMES still say `Amends` because that is where the seam started, and they are deliberately not
 * churned mid-drain: what they have always guaranteed is the `supersedes` exclusion above, and
 * ADR-0419 leaves that guarantee exactly as it found it.
 *
 * ## THE DENOMINATOR IS PART OF THE INTERFACE, NOT AN AFTERTHOUGHT
 *
 * {@link DecisionAmendsResolver.decisions} enumerates every decision the resolver can see. It is
 * required rather than convenient: a walk holding a resolver that answers `amendsOf` for nothing can
 * report a depth of 2 and look exactly like a corpus whose wiring is shallow. The count is what lets
 * the caller tell "the decisions were walked and are shallow" from "no decision was ever seen"
 * — the same distinction `evaluateDependsOnAcyclicity` reports its denominators for.
 *
 * {@link DecisionAmendsResolver.decisionsCarryingDependsOn} is the SECOND denominator, and it exists
 * because the new edge arrives during a migration that is deliberately long (ADR-0419 D3: teach the
 * readers, then deprecate the authoring, then chip at the backlog). Zero resolvable `dependsOn`
 * edges has two utterly different causes — a reader that does not supply the field at all, and a
 * decision log that genuinely carries none — and on 2026-08-23 BOTH were true at once (zero of 412
 * rows carried the field, and the frontmatter-shaped reader has no field to carry). An edge count
 * alone cannot separate them; a count of how many rows arrived with the FIELD PRESENT can.
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
  /** The decisions this one still rests on AND cannot be read alone (ADR-0419 D1). Numbers. */
  readonly amends: readonly number[];
  /**
   * The decision's own `dependsOn` pointers, EXACTLY AS STORED — plain support (ADR-0419 D1).
   *
   * POINTERS, not numbers, and that asymmetry with `amends` is the storage's, not a choice made
   * here: `amends` is a list of decision numbers on the `adr` schema, while `dependsOn` arrives from
   * `buildKindSchema` like every other kind's and may name a Library artifact or any repository file
   * as readily as a decision. Resolving which is which is the WALK's job, through the one parser in
   * `decision-pointer.ts` — this seam reports where the edges came from and never learns what they
   * mean, which is the same division of labour that keeps `amendsOf` free of graph knowledge.
   *
   * OPTIONAL, deliberately. A frontmatter-shaped row (`AdrMeta`) has no such field, and making it
   * required would break assignability for every reader that has not yet been widened — during a
   * migration ADR-0419 D3 fixes as reader-first and explicitly long, an un-widened reader is an
   * expected state rather than a defect. ABSENT means "this reader cannot see the edge", which is a
   * different fact from "this decision has none", and
   * {@link DecisionAmendsResolver.decisionsCarryingDependsOn} is what keeps the two apart.
   */
  readonly dependsOn?: readonly string[];
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
   * How many of {@link decisions} arrived with a `dependsOn` FIELD AT ALL — present, even if empty.
   *
   * PRESENCE, not non-emptiness, and that is the whole point: it answers "was this half of the
   * support graph READ?", which no edge count can. See the header — 0 here across a large decision
   * log means the reader is blind to ADR-0419 D1's edge, and reads identically to a log that
   * genuinely carries none.
   */
  readonly decisionsCarryingDependsOn: number;
  /**
   * The decisions `decisionNumber` AMENDS — never the ones it supersedes.
   *
   * TOTAL: a decision this resolver does not hold answers with an empty list rather than throwing,
   * because the walk resolves pointers authored by a corpus this resolver did not author.
   */
  amendsOf(decisionNumber: number): readonly number[];
  /**
   * The `dependsOn` POINTERS `decisionNumber` carries, unparsed — never the ones it supersedes.
   *
   * A SECOND VERB rather than a second argument to the first (see the header): `amendsOf` and
   * `dependsOnOf` each name exactly one edge, so there is no call site at which the wrong edge can
   * be requested. Returning raw pointers keeps the resolution of "is this target a decision?" in the
   * walk, where `decision-pointer.ts` is already the single parser for all three live spellings.
   *
   * TOTAL for `amendsOf`'s reason, and EMPTY FOR TWO DIFFERENT REASONS — a decision that carries no
   * `dependsOn`, and a reader that supplies no such field. {@link decisionsCarryingDependsOn}
   * separates them; this verb deliberately does not try to.
   */
  dependsOnOf(decisionNumber: number): readonly string[];
}

/**
 * PURE: a resolver over decision rows already in hand — today's file-backed half of the seam.
 *
 * THIS FUNCTION NEVER SEES `supersedes`: its parameter type does not carry the field, so the
 * exclusion survives a later edit that has forgotten why it mattered.
 *
 * The FIRST row wins on a duplicate number, matching `findDependsOnCycles` and
 * `evaluateDepthFromWork`: re-pointing a number at a later row would silently re-parent everything
 * beneath it. The winning row wins WHOLESALE — both its edge lists and its field presence — so a
 * later row cannot contribute a `dependsOn` to an earlier row's `amends`, which would be a
 * half-merged decision no author ever wrote.
 *
 * Targets naming a decision this resolver does not hold are left in place and reported as dangling
 * by the WALK, which is the only layer that knows what "held" means for its own graph.
 */
export function decisionAmendsResolver(
  rows: readonly AmendsOnlyDecision[],
): DecisionAmendsResolver {
  const amendsByNumber = new Map<number, readonly number[]>();
  const dependsOnByNumber = new Map<number, readonly string[]>();
  let decisionsCarryingDependsOn = 0;
  for (const row of rows) {
    if (amendsByNumber.has(row.number)) continue;
    amendsByNumber.set(row.number, [...row.amends]);
    // PRESENCE is what is counted, so an empty-but-present list still says "this reader can see the
    // field" — the distinction the header exists for. Absent stays absent rather than being
    // defaulted to `[]`, because defaulting is precisely what would erase it.
    if (row.dependsOn !== undefined) {
      decisionsCarryingDependsOn += 1;
      dependsOnByNumber.set(row.number, [...row.dependsOn]);
    }
  }
  const decisions = [...amendsByNumber.keys()];
  return {
    decisions,
    decisionsCarryingDependsOn,
    amendsOf: (decisionNumber: number): readonly number[] =>
      amendsByNumber.get(decisionNumber) ?? [],
    dependsOnOf: (decisionNumber: number): readonly string[] =>
      dependsOnByNumber.get(decisionNumber) ?? [],
  };
}
