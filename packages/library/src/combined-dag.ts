/**
 * THE COMBINED DECISIONS-PLUS-LIBRARY ACYCLICITY PROOF (ADR-0403 dec 5) — the pure judge.
 *
 * `adrs-into-the-dag-arc` increment 08. `pnpm probe:combined-dag` is a thin read around this.
 *
 * ## WHY A THIRD ACYCLICITY JUDGE, WHEN TWO ALREADY PASS
 *
 * Both halves are separately clean and neither answers this question:
 *
 *   - `evaluateDependsOnAcyclicity` (`knowledge-dag.ts`) proves the LIBRARY graph acyclic, and
 *     treats every `doc:` pointer as a sink — which is ADR-0223 D4's bedrock rule expressed in data.
 *   - `pnpm probe:adr-graph` proved the DECISION graph acyclic on all three of its own readings
 *     (`amends` alone, `supersedes` alone, and their union), and never looked at the Library at all.
 *
 * ADR-0223 D4 made decisions sinks SO THAT the knowledge tree could not contain a loop. That is a
 * STRUCTURAL guarantee: nothing walked past a decision, so nothing could come back. ADR-0403 dec 4
 * retires the sink rule, and dec 5 is explicit that replacing a structural guarantee with a proved
 * property means proving it over THE GRAPH THAT WILL ACTUALLY BE WALKED — the union, joined at the
 * ~390 pointers that cross — rather than over a subgraph of it. That union is the new thing, and it
 * is the one nothing has ever looked at.
 *
 * ## THE UNION IS THE CORRECT READING FOR THE CYCLE QUESTION AND ONLY FOR IT
 *
 * A loop is a loop whichever edge closes it, so a cycle check that ignored `supersedes` could miss
 * one. A DEPTH reading over the same union would be meaningless: `amends` means "that decision still
 * stands and this one rests on it" (distance from the work) while `supersedes` means "this replaced
 * that" (archaeology), and summing them measures nothing. ADR-0403 dec 6.
 *
 * **That distinction is held by the SHAPE of this module, not by a comment.** {@link
 * CombinedDagVerdict} carries no depth, no maximum, and NO SINGLE EDGE TOTAL — every denominator is
 * reported split by class and by edge type, so there is no field a later reader could quote as
 * either a combined edge census or a depth. A summed figure is unrepresentable here rather than
 * merely discouraged, which is the same discipline `probe:adr-graph`'s `unionCycles` holds.
 *
 * ## THE FINDING THIS JUDGE IS SHAPED TO SURFACE, AND WHY IT IS NOT VACUOUS
 *
 * Today the crossing edges run ONE WAY. A Library artifact points at a decision; a decision's own
 * frontmatter offers only `amends` and `supersedes`, both of which name other decisions. With no
 * path back from the decision log into the Library, the union is acyclic whenever its two halves
 * are — so a proof that stopped there would be true, and would verify nothing that was in doubt.
 *
 * So the judge accepts an OUTBOUND LIBRARY POINTER on a decision
 * ({@link DecisionEdgeSource.dependsOn}) and reports how many exist
 * ({@link CombinedDagVerdict.decisionToLibraryEdges}). That count is 0 today and IT IS THE WHOLE
 * PROOF OBLIGATION: it is the one number whose rising makes a crossing cycle possible at all, and
 * ADR-0403 dec 1 is precisely the change that makes it able to rise — decisions become ORDINARY
 * artifacts with an ordinary `dependsOn`. Re-running this judge after that migration is therefore
 * not a formality; it is when the question first has teeth.
 *
 * ## AND THE THREE WAYS A GREEN HERE COULD BE A LIE
 *
 * {@link combinedReadVacuity} names them, in the tradition of `isVacuousDependsOnRead` — which
 * exists because this repo shipped `check:library-dag-acyclic PASS — no dependsOn cycle across 1701
 * artifacts (0 authored edges)` from a reader that had just stopped recognising its own field.
 * An instrument that cannot see its subject must not report success:
 *
 *   1. ZERO CROSSING EDGES over a real corpus. The join is the whole subject of this proof; without
 *      it this is just the two halves re-proved separately. The likeliest cause is a pointer-spelling
 *      regression, which is why {@link parseDecisionPointer} is the single resolution point.
 *   2. ZERO DECISIONS — no decision half to join.
 *   3. ZERO LIBRARY EDGES over a real corpus — the vacuum ADR-0402 D7 was written for.
 *
 * Vacuity is deliberately NOT folded into {@link CombinedDagVerdict.acyclic}: a graph with no edges
 * genuinely has no cycles, and saying otherwise would make the judge lie in the other direction.
 * It is a fact about the READ, and the caller decides what an unverifiable read costs it.
 *
 * Pure and browser-safe, like both of its siblings: it reads supplied rows and touches no filesystem
 * and no store.
 */

import {
  DECISION_NODE_PREFIX,
  decisionNodeId,
  isDecisionNodeId,
  parseDecisionPointer,
  renderCombinedNodeId,
} from "./decision-pointer.js";
import { readDependsOnPointers } from "./depends-on.js";
import { findDependsOnCycles, type DependsOnSource } from "./knowledge-dag.js";

/** The `asset:<id>` prefix a stored `dependsOn` entry carries; stripped to reach the node id. */
const ASSET_PREFIX = "asset:";

/** The `doc:` scheme, which names a repository file rather than a Library artifact. */
const DOC_PREFIX = "doc:";

/**
 * One decision as this judge reads it.
 *
 * `amends` and `supersedes` appear together HERE AND NOWHERE ELSE in this module, for the reason
 * `probe:adr-graph`'s `unionCycles` states: the union is a legitimate and different question from
 * either edge alone, and the safeguard is that nothing downstream can emit a count or a depth over
 * it. Structurally compatible with `AdrMeta` from `@storytree/drive`, so a caller passes the parsed
 * frontmatter straight through — but declared HERE so this package keeps no dependency on the file
 * parser, which is exactly the seam ADR-0403 dec 3 requires: a store-backed resolver replaces the
 * file-backed one after the migration without touching this judge.
 */
export interface DecisionEdgeSource {
  readonly number: number;
  /** Decisions this one replaced. */
  readonly supersedes: readonly number[];
  /**
   * Outbound pointers at LIBRARY ARTIFACTS — `asset:<id>`, the ordinary `dependsOn` spelling.
   *
   * Empty today: a decision's frontmatter offers no such field, so nothing can author one. It is
   * accepted anyway because ADR-0403 dec 1 turns decisions into ordinary artifacts that will have
   * one, and because the count of these edges is the single fact that decides whether a crossing
   * cycle is possible at all — see the header. A judge that could not represent the edge could not
   * report its absence as a measurement.
   */
  readonly dependsOn?: readonly string[];
}

/** Which side of the join a node sits on. */
export type CombinedNodeClass = "artifact" | "decision";

/** One cycle as an operator reads it. */
export interface CombinedCycleReport {
  /** The closed path in NODE IDS, first id === last id — the detector's output verbatim. */
  readonly path: readonly string[];
  /** The same path rendered for a human, decisions as `ADR-NNNN`. */
  readonly line: string;
  /**
   * True when the ring uses at least one node from each side.
   *
   * The distinction tells an operator which half to repair, and it is also the only shape of cycle
   * this proof adds over the two judges that already run: a ring wholly inside one half would have
   * been caught by that half's own judge already.
   */
  readonly crossesTheJoin: boolean;
}

/**
 * The combined verdict. Every denominator is SPLIT — there is deliberately no single edge total and
 * no depth anywhere in this type. See the header.
 */
export interface CombinedDagVerdict {
  /** True iff the combined graph holds no directed cycle. The proof ADR-0403 dec 5 asks for. */
  readonly acyclic: boolean;
  /** Every distinct cycle. Empty iff {@link acyclic}. */
  readonly cycles: readonly CombinedCycleReport[];

  /** How many Library artifacts were judged. */
  readonly artifactsScanned: number;
  /** How many decisions were judged. */
  readonly decisionsScanned: number;

  /** `asset:` edges from an artifact to an artifact this corpus holds. */
  readonly libraryEdges: number;
  /** `asset:` pointers naming no artifact here. Counted, never silently dropped. */
  readonly libraryDanglingEdges: number;

  /** THE JOIN: `doc:` pointers from an artifact onto a decision we hold. */
  readonly crossingEdges: number;
  /** Decision-shaped `doc:` pointers naming no decision we hold. */
  readonly crossingDanglingEdges: number;
  /** The two live spellings, counted separately (ADR-0403 dec 7) — never normalised away. */
  readonly crossingBySpelling: ReadonlyMap<string, number>;
  /** `doc:` pointers at some other repository file. A sink, and a legitimate thing to author. */
  readonly nonDecisionDocPointers: number;

  /**
   * SUPPORT edges between decisions we hold — a decision's own `dependsOn` naming another decision.
   * NEVER added to the next field.
   *
   * This used to count `amends`, a list of decision NUMBERS on the row. ADR-0431 D1 retired that
   * field and migrated its 517 edges onto `dependsOn`, so the same edges now arrive as `asset:`
   * POINTERS and are resolved through the one parser rather than read as numbers.
   */
  readonly decisionSupportEdges: number;
  /** `supersedes` edges between decisions we hold. NEVER added to the previous field. */
  readonly decisionSupersedesEdges: number;
  /** Decision edges of either type naming a decision we do not hold. */
  readonly decisionDanglingEdges: number;

  /**
   * Edges pointing OUT of the decision log and back into the Library.
   *
   * 0 today, and that zero is the structural reason the union cannot loop — see the header. The
   * count is reported rather than assumed, so a later reader learns it from the instrument instead
   * of from a comment that may have stopped being true.
   */
  readonly decisionToLibraryEdges: number;

  /** Artifact ids repeated in the corpus read. First row wins, matching `findDependsOnCycles`. */
  readonly duplicateArtifactIds: readonly string[];
  /** Decision numbers seen more than once. First row wins. */
  readonly duplicateDecisionNumbers: readonly number[];
  /**
   * Artifact ids that are ALSO decision node ids — a collision that would MERGE the two nodes.
   *
   * Structurally impossible while artifact ids exclude `:` (see `decision-pointer.ts`), and reported
   * anyway: a silent merge is exactly the class of failure this increment guards against, and
   * "impossible" is a claim about a schema that a raw store read does not enforce.
   */
  readonly collidingIds: readonly string[];
}

/** The corpus size at or above which a missing half can only mean the READER is blind. */
export const VACUOUS_COMBINED_READ_FLOOR = 100;

/**
 * PURE: the ways this verdict could be a green that verified nothing. EMPTY means the read saw its
 * subject; each entry names one thing it could not see.
 *
 * Returns reasons rather than a boolean because the three causes have three different remedies, and
 * an operator handed only `true` would have to re-derive which one it was.
 */
export function combinedReadVacuity(verdict: CombinedDagVerdict): readonly string[] {
  const reasons: string[] = [];
  const bigEnough = verdict.artifactsScanned >= VACUOUS_COMBINED_READ_FLOOR;
  if (verdict.decisionsScanned === 0) {
    reasons.push("no decisions were read, so there was no decision half to join");
  }
  if (bigEnough && verdict.libraryEdges === 0) {
    reasons.push(
      `${verdict.artifactsScanned} artifacts carry 0 resolvable asset: edges, so the library half ` +
        "was invisible (the usual cause is a field rename whose stored rows have not drained)",
    );
  }
  if (bigEnough && verdict.crossingEdges === 0) {
    reasons.push(
      `${verdict.artifactsScanned} artifacts carry 0 pointers onto a decision, so THE JOIN — the ` +
        "whole subject of this proof — was invisible (the usual cause is a pointer-spelling regression)",
    );
  }
  return reasons;
}

/**
 * PURE: judge the combined decisions-plus-Library graph for acyclicity.
 *
 * TOTAL over untrusted input, for `dependsOnNodes`' reason: this runs over the LIVE corpus, so a row
 * written by an older schema — or by a branch carrying a field this checkout does not — must project
 * as "no edges" rather than throw. A malformed doc is refused at the WRITE boundary
 * (`validateLibraryDoc`); the read side of a fail-closed proof must not be where a surprise row
 * takes the proof down, because that failure looks identical to a real cycle.
 */
export function evaluateCombinedAcyclicity(
  docs: readonly DependsOnSource[],
  decisions: readonly DecisionEdgeSource[],
): CombinedDagVerdict {
  const artifactIds = new Set<string>();
  const duplicateArtifactIds: string[] = [];
  const collidingIds: string[] = [];
  for (const row of docs) {
    if (artifactIds.has(row.id)) {
      duplicateArtifactIds.push(row.id);
      continue;
    }
    artifactIds.add(row.id);
    if (row.id.startsWith(DECISION_NODE_PREFIX)) collidingIds.push(row.id);
  }

  const decisionNumbers = new Set<number>();
  const duplicateDecisionNumbers: number[] = [];
  for (const decision of decisions) {
    if (decisionNumbers.has(decision.number)) {
      duplicateDecisionNumbers.push(decision.number);
      continue;
    }
    decisionNumbers.add(decision.number);
  }

  const nodes: { id: string; dependsOn: string[] }[] = [];
  const crossingBySpelling = new Map<string, number>();
  let libraryEdges = 0;
  let libraryDanglingEdges = 0;
  let crossingEdges = 0;
  let crossingDanglingEdges = 0;
  let nonDecisionDocPointers = 0;

  const seenArtifacts = new Set<string>();
  for (const row of docs) {
    if (seenArtifacts.has(row.id)) continue; // First row wins, matching `findDependsOnCycles`.
    seenArtifacts.add(row.id);

    const targets: string[] = [];
    for (const pointer of readDependsOnPointers(row.doc)) {
      if (pointer.startsWith(ASSET_PREFIX)) {
        const target = pointer.slice(ASSET_PREFIX.length);
        if (target === "") continue;
        if (!artifactIds.has(target)) {
          libraryDanglingEdges += 1;
          continue;
        }
        libraryEdges += 1;
        targets.push(target);
        continue;
      }
      const decision = parseDecisionPointer(pointer);
      if (decision === null) {
        // A `doc:` pointer at some other repository file, or a scheme this graph does not walk.
        // Both are sinks; only the `doc:` half is counted, because that is the population a
        // spelling regression would silently move into.
        if (pointer.startsWith(DOC_PREFIX)) nonDecisionDocPointers += 1;
        continue;
      }
      crossingBySpelling.set(decision.spelling, (crossingBySpelling.get(decision.spelling) ?? 0) + 1);
      if (!decisionNumbers.has(decision.number)) {
        crossingDanglingEdges += 1;
        continue;
      }
      crossingEdges += 1;
      targets.push(decisionNodeId(decision.number));
    }
    nodes.push({ id: row.id, dependsOn: targets });
  }

  let decisionSupportEdges = 0;
  let decisionSupersedesEdges = 0;
  let decisionDanglingEdges = 0;
  let decisionToLibraryEdges = 0;

  const seenDecisions = new Set<number>();
  for (const decision of decisions) {
    if (seenDecisions.has(decision.number)) continue; // First row wins.
    seenDecisions.add(decision.number);

    const targets: string[] = [];
    for (const target of decision.supersedes) {
      if (!decisionNumbers.has(target)) {
        decisionDanglingEdges += 1;
        continue;
      }
      decisionSupersedesEdges += 1;
      targets.push(decisionNodeId(target));
    }
    for (const pointer of decision.dependsOn ?? []) {
      // DECISION FIRST, and the order is load-bearing since ADR-0431 D1. A decision's `dependsOn`
      // now carries the support edges `amends` used to, spelled `asset:adr-NNNN` — and because
      // decisions are ordinary artifacts (ADR-0403 dec 1), those ids are ALSO in `artifactIds`.
      // Testing the artifact branch first would therefore book every decision-to-decision support
      // edge as a decision-to-LIBRARY edge, and `decisionToLibraryEdges` being 0 is the structural
      // fact this judge reports the union cannot loop on. That would not fail — it would report a
      // different graph, confidently.
      const asDecision = parseDecisionPointer(pointer);
      if (asDecision !== null) {
        if (!decisionNumbers.has(asDecision.number)) {
          decisionDanglingEdges += 1;
          continue;
        }
        decisionSupportEdges += 1;
        targets.push(decisionNodeId(asDecision.number));
        continue;
      }
      if (!pointer.startsWith(ASSET_PREFIX)) continue;
      const target = pointer.slice(ASSET_PREFIX.length);
      if (target === "" || !artifactIds.has(target)) {
        libraryDanglingEdges += 1;
        continue;
      }
      decisionToLibraryEdges += 1;
      targets.push(target);
    }
    nodes.push({ id: decisionNodeId(decision.number), dependsOn: targets });
  }

  const classOf = (id: string): CombinedNodeClass => (isDecisionNodeId(id) ? "decision" : "artifact");
  const cycles = findDependsOnCycles(nodes).map((path) => ({
    path,
    line: path.map(renderCombinedNodeId).join(" → "),
    crossesTheJoin: new Set(path.map(classOf)).size > 1,
  }));

  return {
    acyclic: cycles.length === 0,
    cycles,
    artifactsScanned: artifactIds.size,
    decisionsScanned: decisionNumbers.size,
    libraryEdges,
    libraryDanglingEdges,
    crossingEdges,
    crossingDanglingEdges,
    crossingBySpelling,
    nonDecisionDocPointers,
    decisionSupportEdges,
    decisionSupersedesEdges,
    decisionDanglingEdges,
    decisionToLibraryEdges,
    duplicateArtifactIds,
    duplicateDecisionNumbers,
    collidingIds,
  };
}
