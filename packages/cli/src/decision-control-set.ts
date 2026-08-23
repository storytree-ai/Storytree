/**
 * PURE: the held-out CONTROL SET for a later trial of the composed-frontier design —
 * `decision-read-measurement-arc-inc-04`.
 *
 * ## What this is for, and why it is frozen before anything is built
 *
 * `decision-read-measurement-arc-inc-02` froze a PRIOR: reach, chain depth and offer-to-follow over a
 * declared window. A prior alone supports a before/after comparison, and a before/after comparison on
 * a corpus this active measures THE WEEK as readily as it measures the change. The owner's standing
 * finding (`ground-misled-reader-claims-with-blind-readers`) is that a prose fix must be argued
 * against a CONTROL, never against a drift number — so a later trial needs a set of decisions it
 * agrees NOW to leave uncomposed, matched to the ones it will compose.
 *
 * Selecting the control AFTER a composition exists is the failure this module exists to prevent: the
 * selector would already know which subtrees the intervention happened to help, and any split would
 * be a story told afterwards. So the selection is computed here, printed by
 * `probe:decision-control-set`, and recorded in `docs/research/`.
 *
 * ## TWO CANDIDATE ASSIGNMENT UNITS, AND THE COARSE ONE DOES NOT SURVIVE
 *
 * The obvious unit is "a chain". It fails immediately and structurally: CHAINS OVERLAP. One decision
 * lies on as many chains as there are paths through it, so composing at the frontier of one chain
 * changes what a reader walking another finds. An intervention assigned to overlapping units has no
 * control arm, only a contaminated one.
 *
 * **Unit A — the SUPPORT COMPONENT.** A weakly-connected component has the property that makes
 * assignment safe: NO SUPPORT EDGE CROSSES IT, so treatment cannot propagate along the graph to the
 * other arm. Components are the finest partition with that guarantee ({@link componentsAreEdgeClosed}
 * states it as a checkable invariant rather than a claim in a comment). It is the CONSERVATIVE unit:
 * zero graph-borne leakage, by construction.
 *
 * On this corpus it is also unusable, and that is this increment's first finding. The decision log is
 * not a forest of comparable families — it is ONE GIANT COMPONENT plus debris. Whichever arm receives
 * the giant component IS the experiment, and a difference between arms would be a fact about that one
 * component rather than about composition. So the conservative unit buys a guarantee at the price of
 * the entire design.
 *
 * **Unit B — the CHAIN FRONTIER.** The fork's own object: a decision nothing amends, which rests on
 * something. It is where a composed statement of the current position would be CARRIED, so it is the
 * thing a reader is or is not exposed to. Frontiers are numerous and their subtrees overlap, so
 * leakage is real — but leakage between frontiers is not structural, it is BEHAVIOURAL: it happens
 * only when one reader's sitting touches both arms. That is measurable, and this module measures it
 * ({@link DecisionControlSetSelection.frontierContaminationWindows}) rather than assuming it away.
 *
 * The honest summary a later trial inherits: the guaranteed-clean unit is unusable on this corpus, and
 * the usable unit carries a stated contamination rate. Reporting only the first would say "no trial is
 * possible"; reporting only the second would hide the reason the clean design was abandoned.
 *
 * ## MATCHING, AND WHY IT IS HARDER HERE THAN IT LOOKS
 *
 * `-inc-02` found reach BROAD AND THIN: 370 of 414 decisions read by at least one window, but the
 * hottest reaching only 31 of 401 and the MEDIAN reaching 3. Matching on a variable whose typical
 * value is 3 is matching on counting noise — two units with reach 4 and reach 2 differ by one reader
 * having had one more sitting, not by anything about the decisions. That is a real limit on what a
 * later trial can conclude, so every split is emitted WITH its imbalance ({@link ArmBalance}) rather
 * than as a bare list that reads as though the arms had been equated.
 *
 * ## AND IT CAN REFUSE
 *
 * A module that always emits a control set would be `an-expectation-derived-from-its-subject-cannot-fail`
 * wearing a new coat. Each layer states its own feasibility, and when a layer cannot carry a matched
 * design it emits no split for that layer and says why.
 *
 * Everything here is deterministic and seedless: sorted keys throughout, no RNG. A frozen selection
 * that named a different set on each run would not be frozen.
 */
import {
  longestReadChain,
  supportAdjacency,
  type DecisionReadObservation,
  type DecisionSupportGraph,
} from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** Which arm a unit was frozen into. `ineligible` never enters either. */
export type Arm = "treated" | "control" | "ineligible";

/** One weakly-connected component of the support graph — the CONSERVATIVE assignment unit. */
export interface ComponentStats {
  /**
   * The component's stable name: its LOWEST member decision number. Stable across runs and across
   * edge additions that do not merge components, which is what a frozen record needs.
   */
  readonly id: number;
  /** Members, ascending. The frozen record is these numbers, never an index into a sorted list. */
  readonly members: readonly number[];
  /** Internal support edges, counted APART and never summed (ADR-0419 D1). */
  readonly amendsEdges: number;
  readonly dependsOnEdges: number;
  /** Distinct context windows that read at least one member. The component's reach. */
  readonly reachWindows: number;
  /** Raw reads onto members — reported beside reach, never as the rank key. */
  readonly reads: number;
  /**
   * Distinct windows whose read set induces a chain of depth >= 2 INSIDE this component. THE
   * outcome-relevant figure: a composed frontier can only save the cost of a walk somebody made.
   */
  readonly walkWindows: number;
  /** The deepest induced chain observed inside this component, in nodes. */
  readonly maxDepthObserved: number;
  /** Median distinct-window reach across members — the thin-reach shape, per component. */
  readonly medianMemberReach: number;
}

/**
 * One CHAIN FRONTIER — a decision nothing rests on, which itself rests on something.
 *
 * This is the object the design fork is about: the place a composed statement of the current position
 * would be carried, and therefore the thing a reader is or is not exposed to.
 */
export interface FrontierStats {
  readonly decision: number;
  /** The component it belongs to, so a reader can see how much of the giant one these come from. */
  readonly componentId: number;
  /** Its descendant closure INCLUDING itself — everything a reader could walk down to from here. */
  readonly subtreeSize: number;
  /** The longest support path starting here, in nodes. The depth a composed statement would cover. */
  readonly subtreeDepth: number;
  /** Distinct windows that read the frontier decision itself. */
  readonly reachWindows: number;
  /** Raw reads onto the frontier decision. */
  readonly reads: number;
  /**
   * Distinct windows that read this frontier AND at least one decision beneath it — EXACTLY the
   * readers a composed statement here would have served, and the outcome a later trial measures.
   */
  readonly walkWindows: number;
}

/** How well two arms balance on the matching variables. Emitted so imbalance cannot hide. */
export interface ArmBalance {
  readonly treatedUnits: number;
  readonly controlUnits: number;
  readonly treatedReachWindows: number;
  readonly controlReachWindows: number;
  readonly treatedWalkWindows: number;
  readonly controlWalkWindows: number;
  /**
   * The largest within-pair gap on the primary matching key, in walk-windows. A design whose worst
   * pair differs by more than its arms do is matched in name only.
   */
  readonly worstPairWalkGap: number;
  /** The same on reach. */
  readonly worstPairReachGap: number;
}

/** One frozen matched pair, in the order the ranking produced them. */
export interface MatchedPair {
  readonly rank: number;
  readonly treated: number;
  readonly control: number;
  readonly walkGap: number;
  readonly reachGap: number;
}

export interface DecisionControlSetSelection {
  // --- the subject ---
  readonly decisionsInLog: number;
  readonly amendsEdges: number;
  readonly dependsOnEdges: number;

  // --- UNIT A: components (the conservative unit) ---
  /** Every component, largest first. The census the coarse split would have been drawn from. */
  readonly components: readonly ComponentStats[];
  readonly componentCount: number;
  /** Components of a single decision with no support edge — no frontier exists to compose. */
  readonly singletonComponents: number;
  /** >= 2 decisions and >= 1 internal support edge: a frontier could exist. */
  readonly structurallyEligibleComponents: number;
  /** Structurally eligible AND read by at least one window: an arm could learn something from it. */
  readonly informativeComponents: number;
  /** The largest informative component's share of all component walk-windows, 0..1. */
  readonly largestComponentWalkShare: number;
  /** ...and of all component reach-windows. */
  readonly largestComponentReachShare: number;
  /**
   * Empty means a matched design is constructible on components. Each entry names one reason it is
   * NOT — and on this corpus it is not, which is why {@link frontiers} exists.
   */
  readonly componentDesignInfeasible: readonly string[];

  // --- UNIT B: chain frontiers (the usable unit) ---
  /** Every frontier, by descending walk-windows then decision number. */
  readonly frontiers: readonly FrontierStats[];
  readonly frontierCount: number;
  /** Frontiers read by at least one window — the population a split is drawn from. */
  readonly informativeFrontiers: number;
  readonly largestFrontierWalkShare: number;
  /** The frozen assignment, by frontier decision number. */
  readonly frontierArms: ReadonlyMap<number, Arm>;
  readonly frontierPairs: readonly MatchedPair[];
  readonly frontierBalance: ArmBalance;
  /**
   * Windows reading BOTH a treated and a control frontier — MEASURED contamination, the price of
   * using the finer unit. Not removable by any choice of unit at this grain, and it biases toward
   * the null: a reader helped in one arm may simply stop reading, depressing the other arm too.
   */
  readonly frontierContaminationWindows: number;
  /** Empty means the frontier split stands. Each entry names one reason it does not. */
  readonly frontierDesignInfeasible: readonly string[];

  // --- instrument denominators ---
  /** Windows contributing to the reading at all (read >= 1 decision, carried a window id). */
  readonly windowsObserved: number;
  /** Reads that carried no host window id and so could not enter a window-grained figure. */
  readonly readsWithoutWindowId: number;

  /** Empty means every figure above measured its subject; each entry names one that did not. */
  readonly vacuity: readonly string[];
}

export interface DecisionControlSetInput {
  readonly reads: readonly DecisionReadObservation[];
  readonly support: DecisionSupportGraph;
  /** The declared window, inclusive, ISO-8601 — stated by the caller, never derived. */
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
}

/**
 * The share of the outcome one unit may hold before the arms stop being comparable.
 *
 * A JUDGMENT, stated in advance and with its number printed beside it so a reader may apply their
 * own. The reasoning, not the value, is the load-bearing part: if one unit holds a majority of all
 * walked chains then whichever arm receives it IS the experiment, the other arm is a rounding error,
 * and a difference between arms is a fact about that one unit rather than about composition. Half is
 * the point at which that becomes true by arithmetic.
 */
export const DOMINANT_UNIT_SHARE = 0.5;

/** Fewer informative units than this and there is not a single pair to match. */
export const MINIMUM_INFORMATIVE_UNITS = 2;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * PURE: the weakly-connected components of the support graph, each as an ascending member list, the
 * lists ordered by their lowest member so the census is stable across runs.
 *
 * Connectivity is UNDIRECTED even though the edges are directed, and that is the point: a reader
 * walking a chain crosses an edge in whichever direction the reading takes them — down from an
 * amender to what it amends, or up from a decision to what has since narrowed it. A treatment applied
 * anywhere in the component is reachable from anywhere else in it.
 */
export function supportComponents(support: DecisionSupportGraph): readonly (readonly number[])[] {
  const parent = new Map<number, number>();
  for (const decision of support.decisions) parent.set(decision, decision);

  const find = (node: number): number => {
    let root = node;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
    // Path compression, so a long amends chain does not make this quadratic.
    let walk = node;
    while ((parent.get(walk) ?? walk) !== walk) {
      const next = parent.get(walk) ?? walk;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };

  for (const edge of [...support.amends, ...support.dependsOn]) {
    // An edge naming a decision the log does not hold cannot merge anything — the caller already
    // drops those, and skipping here keeps this total rather than inventing a phantom member.
    if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
    const a = find(edge.from);
    const b = find(edge.to);
    if (a !== b) parent.set(a, b);
  }

  const grouped = new Map<number, number[]>();
  for (const decision of support.decisions) {
    const root = find(decision);
    const bucket = grouped.get(root);
    if (bucket === undefined) grouped.set(root, [decision]);
    else bucket.push(decision);
  }

  return [...grouped.values()]
    .map((members) => [...members].sort((a, b) => a - b))
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
}

/**
 * PURE: whether the partition is edge-closed — no support edge has its two ends in different parts.
 *
 * This is the property that makes a component a valid assignment unit, so it is CHECKED rather than
 * asserted in prose. A partition that failed it would leak treatment along the crossing edge, and the
 * control arm would silently be a partially-treated arm.
 */
export function componentsAreEdgeClosed(
  support: DecisionSupportGraph,
  components: readonly (readonly number[])[],
): boolean {
  const owner = new Map<number, number>();
  for (const [index, members] of components.entries()) {
    for (const member of members) owner.set(member, index);
  }
  for (const edge of [...support.amends, ...support.dependsOn]) {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    if (from === undefined || to === undefined) continue;
    if (from !== to) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Frontiers
// ---------------------------------------------------------------------------

/**
 * PURE: the CHAIN FRONTIERS — decisions nothing rests on, which themselves rest on something.
 *
 * In-degree 0 is what makes a decision a frontier: no later decision amends it or depends on it, so
 * it is the current end of its chain and the place a statement of the current position would live.
 * Out-degree >= 1 is what makes it a CHAIN frontier rather than an isolated decision: there is
 * something beneath it for a composed statement to be about.
 *
 * Returned ascending, so the census is stable across runs.
 */
export function chainFrontiers(support: DecisionSupportGraph): readonly number[] {
  const known = new Set(support.decisions);
  const hasIncoming = new Set<number>();
  const hasOutgoing = new Set<number>();
  for (const edge of [...support.amends, ...support.dependsOn]) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    hasIncoming.add(edge.to);
    hasOutgoing.add(edge.from);
  }
  return support.decisions
    .filter((decision) => hasOutgoing.has(decision) && !hasIncoming.has(decision))
    .sort((a, b) => a - b);
}

/** PURE: every decision reachable from `root` via support edges, including `root` itself. */
export function descendantClosure(
  root: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
): ReadonlySet<number> {
  const seen = new Set<number>([root]);
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function withinWindow(at: string, from: string | undefined, to: string | undefined): boolean {
  if (from !== undefined && at < from) return false;
  if (to !== undefined && at > to) return false;
  return true;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

interface Unit {
  readonly id: number;
  readonly reachWindows: number;
  readonly walkWindows: number;
  readonly size: number;
}

interface Split {
  readonly arms: Map<number, Arm>;
  readonly pairs: MatchedPair[];
  readonly balance: ArmBalance;
  readonly infeasible: string[];
}

/**
 * The shared matched-pairs procedure, run over whichever unit a layer uses.
 *
 * Rank on the primary matching key (walked chains — the outcome a composed frontier acts on), then
 * reach, then size, then id. Every tiebreak is total, so the ranking is deterministic. Adjacent
 * pairing on that ranking is what makes the pair MATCHED: neighbours in this order are the two most
 * similar units still unassigned.
 */
function matchedSplit(all: readonly Unit[], informative: readonly Unit[], label: string): Split {
  const arms = new Map<number, Arm>();
  for (const unit of all) arms.set(unit.id, "ineligible");

  const totalWalk = informative.reduce((sum, u) => sum + u.walkWindows, 0);
  const largestWalk = informative.reduce((max, u) => Math.max(max, u.walkWindows), 0);
  const share = totalWalk === 0 ? 0 : largestWalk / totalWalk;

  const infeasible: string[] = [];
  if (informative.length < MINIMUM_INFORMATIVE_UNITS) {
    infeasible.push(
      `only ${informative.length} informative ${label}(s) — a matched design needs at least ` +
        `${MINIMUM_INFORMATIVE_UNITS} to form one pair`,
    );
  }
  if (share > DOMINANT_UNIT_SHARE && totalWalk > 0) {
    infeasible.push(
      `one ${label} holds ${(share * 100).toFixed(1)}% of all walked chains (threshold ` +
        `${(DOMINANT_UNIT_SHARE * 100).toFixed(0)}%) — whichever arm receives it IS the experiment, ` +
        "so a difference between arms would be a fact about that one unit rather than about composition",
    );
  }

  const pairs: MatchedPair[] = [];
  if (infeasible.length === 0) {
    const ranked = [...informative].sort(
      (a, b) =>
        b.walkWindows - a.walkWindows ||
        b.reachWindows - a.reachWindows ||
        b.size - a.size ||
        a.id - b.id,
    );
    for (let index = 0; index + 1 < ranked.length; index += 2) {
      const first = ranked[index];
      const second = ranked[index + 1];
      if (first === undefined || second === undefined) continue;
      // Alternate which side of the pair is treated. Deterministic and seedless, but NOT a constant
      // rule like "lower id is always treated", which would load one arm with a systematic age bias
      // — older decisions have had longer to accumulate both amenders and readers.
      const treatedFirst = index % 4 === 0;
      const treated = treatedFirst ? first : second;
      const control = treatedFirst ? second : first;
      arms.set(treated.id, "treated");
      arms.set(control.id, "control");
      pairs.push({
        rank: pairs.length + 1,
        treated: treated.id,
        control: control.id,
        walkGap: Math.abs(first.walkWindows - second.walkWindows),
        reachGap: Math.abs(first.reachWindows - second.reachWindows),
      });
    }
    // An odd tail member is left ineligible rather than assigned unpaired, which would silently
    // unbalance the arms.
  }

  const sumWhere = (arm: Arm, pick: (u: Unit) => number): number =>
    all.filter((u) => arms.get(u.id) === arm).reduce((sum, u) => sum + pick(u), 0);

  return {
    arms,
    pairs,
    infeasible,
    balance: {
      treatedUnits: all.filter((u) => arms.get(u.id) === "treated").length,
      controlUnits: all.filter((u) => arms.get(u.id) === "control").length,
      treatedReachWindows: sumWhere("treated", (u) => u.reachWindows),
      controlReachWindows: sumWhere("control", (u) => u.reachWindows),
      treatedWalkWindows: sumWhere("treated", (u) => u.walkWindows),
      controlWalkWindows: sumWhere("control", (u) => u.walkWindows),
      worstPairWalkGap: pairs.reduce((max, p) => Math.max(max, p.walkGap), 0),
      worstPairReachGap: pairs.reduce((max, p) => Math.max(max, p.reachGap), 0),
    },
  };
}

/**
 * The frozen held-out control set, at both candidate units, each with its own feasibility verdict.
 *
 * `resolve` maps an observed read id to a decision number. Production passes
 * `decisionNumberOfObservedId`, which delegates to the ONE resolver (`resolveDecisionId`); a
 * raw-string join under-counts ~35x with no error (`-inc-01`), so this function never learns a
 * spelling.
 */
export function selectDecisionControlSet(
  input: DecisionControlSetInput,
  resolve: (id: string) => number | null,
): DecisionControlSetSelection {
  const { support, reads, declaredFrom, declaredTo } = input;
  const known = new Set(support.decisions);

  const components = supportComponents(support);
  const ownerOf = new Map<number, number>();
  for (const members of components) {
    const id = members[0] ?? 0;
    for (const member of members) ownerOf.set(member, id);
  }

  // --- reads, at WINDOW grain (the grain `-inc-02`'s headline is quoted at) ---
  const windowReads = new Map<string, Set<number>>();
  const rawReadsPerDecision = new Map<number, number>();
  const windowsPerDecision = new Map<number, Set<string>>();
  let readsWithoutWindowId = 0;

  for (const read of reads) {
    if (!withinWindow(read.at, declaredFrom, declaredTo)) continue;
    const decision = resolve(read.nodeId);
    if (decision === null || !known.has(decision)) continue;
    if (read.windowId === undefined) {
      readsWithoutWindowId += 1;
      continue;
    }
    rawReadsPerDecision.set(decision, (rawReadsPerDecision.get(decision) ?? 0) + 1);
    const seenIn = windowsPerDecision.get(decision) ?? new Set<string>();
    seenIn.add(read.windowId);
    windowsPerDecision.set(decision, seenIn);
    const set = windowReads.get(read.windowId) ?? new Set<number>();
    set.add(decision);
    windowReads.set(read.windowId, set);
  }

  const adjacency = supportAdjacency(support);

  // --- UNIT A: components ---
  const walkWindowsPerComponent = new Map<number, Set<string>>();
  const maxDepthPerComponent = new Map<number, number>();
  const reachWindowsPerComponent = new Map<number, Set<string>>();

  for (const [windowId, readSet] of windowReads) {
    const byComponent = new Map<number, Set<number>>();
    for (const decision of readSet) {
      const id = ownerOf.get(decision);
      if (id === undefined) continue;
      const bucket = byComponent.get(id) ?? new Set<number>();
      bucket.add(decision);
      byComponent.set(id, bucket);
    }
    for (const [id, subset] of byComponent) {
      const reached = reachWindowsPerComponent.get(id) ?? new Set<string>();
      reached.add(windowId);
      reachWindowsPerComponent.set(id, reached);
      // Restricted to the component, then the induced longest chain INSIDE it. A chain that leaves
      // the component cannot exist — no edge does.
      const { depth } = longestReadChain(subset, adjacency);
      if (depth > (maxDepthPerComponent.get(id) ?? 0)) maxDepthPerComponent.set(id, depth);
      if (depth >= 2) {
        const walked = walkWindowsPerComponent.get(id) ?? new Set<string>();
        walked.add(windowId);
        walkWindowsPerComponent.set(id, walked);
      }
    }
  }

  const internalAmends = new Map<number, number>();
  const internalDependsOn = new Map<number, number>();
  for (const edge of support.amends) {
    const id = ownerOf.get(edge.from);
    if (id !== undefined) internalAmends.set(id, (internalAmends.get(id) ?? 0) + 1);
  }
  for (const edge of support.dependsOn) {
    const id = ownerOf.get(edge.from);
    if (id !== undefined) internalDependsOn.set(id, (internalDependsOn.get(id) ?? 0) + 1);
  }

  const componentStats: ComponentStats[] = components.map((members) => {
    const id = members[0] ?? 0;
    return {
      id,
      members,
      amendsEdges: internalAmends.get(id) ?? 0,
      dependsOnEdges: internalDependsOn.get(id) ?? 0,
      reachWindows: reachWindowsPerComponent.get(id)?.size ?? 0,
      reads: members.reduce((sum, m) => sum + (rawReadsPerDecision.get(m) ?? 0), 0),
      walkWindows: walkWindowsPerComponent.get(id)?.size ?? 0,
      maxDepthObserved: maxDepthPerComponent.get(id) ?? 0,
      medianMemberReach: median(members.map((m) => windowsPerDecision.get(m)?.size ?? 0)),
    };
  });

  const componentStructurallyEligible = (c: ComponentStats): boolean =>
    c.members.length >= 2 && c.amendsEdges + c.dependsOnEdges >= 1;
  const componentInformative = (c: ComponentStats): boolean =>
    componentStructurallyEligible(c) && c.reachWindows >= 1;

  const informativeComponents = componentStats.filter(componentInformative);
  const componentUnits: Unit[] = componentStats.map((c) => ({
    id: c.id,
    reachWindows: c.reachWindows,
    walkWindows: c.walkWindows,
    size: c.members.length,
  }));
  const informativeComponentUnits = componentUnits.filter((u) =>
    informativeComponents.some((c) => c.id === u.id),
  );
  const componentSplit = matchedSplit(componentUnits, informativeComponentUnits, "component");

  const totalComponentWalk = informativeComponents.reduce((s, c) => s + c.walkWindows, 0);
  const totalComponentReach = informativeComponents.reduce((s, c) => s + c.reachWindows, 0);
  const largestComponentWalk = informativeComponents.reduce((m, c) => Math.max(m, c.walkWindows), 0);
  const largestComponentReach = informativeComponents.reduce((m, c) => Math.max(m, c.reachWindows), 0);

  // --- UNIT B: chain frontiers ---
  const frontierNumbers = chainFrontiers(support);
  const frontierStats: FrontierStats[] = frontierNumbers.map((decision) => {
    const closure = descendantClosure(decision, adjacency);
    let walkWindows = 0;
    for (const readSet of windowReads.values()) {
      if (!readSet.has(decision)) continue;
      // A reader this composition would have served: read the frontier AND something beneath it.
      let wentDeeper = false;
      for (const member of closure) {
        if (member !== decision && readSet.has(member)) {
          wentDeeper = true;
          break;
        }
      }
      if (wentDeeper) walkWindows += 1;
    }
    return {
      decision,
      componentId: ownerOf.get(decision) ?? decision,
      subtreeSize: closure.size,
      subtreeDepth: longestReadChain(closure, adjacency).depth,
      reachWindows: windowsPerDecision.get(decision)?.size ?? 0,
      reads: rawReadsPerDecision.get(decision) ?? 0,
      walkWindows,
    };
  });

  const frontierUnits: Unit[] = frontierStats.map((f) => ({
    id: f.decision,
    reachWindows: f.reachWindows,
    walkWindows: f.walkWindows,
    size: f.subtreeSize,
  }));
  const informativeFrontierUnits = frontierUnits.filter((u) => u.reachWindows >= 1);
  const frontierSplit = matchedSplit(frontierUnits, informativeFrontierUnits, "frontier");

  const totalFrontierWalk = informativeFrontierUnits.reduce((s, u) => s + u.walkWindows, 0);
  const largestFrontierWalk = informativeFrontierUnits.reduce((m, u) => Math.max(m, u.walkWindows), 0);

  // Contamination: windows touching both arms of the FRONTIER split. Measured, because it is the
  // price of the finer unit and a later trial should report it rather than meet it as a surprise.
  let frontierContaminationWindows = 0;
  for (const readSet of windowReads.values()) {
    let sawTreated = false;
    let sawControl = false;
    for (const decision of readSet) {
      const arm = frontierSplit.arms.get(decision);
      if (arm === "treated") sawTreated = true;
      else if (arm === "control") sawControl = true;
    }
    if (sawTreated && sawControl) frontierContaminationWindows += 1;
  }

  const vacuity: string[] = [];
  if (support.decisions.length === 0) {
    vacuity.push("the decision log holds NO decisions — an unreachable or wrong store, never a census");
  }
  if (support.amends.length === 0 && support.dependsOn.length === 0) {
    // ANDed, never either alone: a fully drained log (ADR-0419 D2's success state) has zero `amends`
    // and would declare itself vacuous exactly as the migration succeeded.
    vacuity.push("the support graph holds NO edges of either kind — nothing to compose or to control");
  }
  if (windowReads.size === 0) {
    vacuity.push(
      "no context window read any decision in the declared window — reach and walk are 0 by blindness, not by behaviour",
    );
  }
  if (!componentsAreEdgeClosed(support, components)) {
    vacuity.push(
      "the component partition is NOT edge-closed — assignment would leak treatment across a support edge",
    );
  }

  return {
    decisionsInLog: support.decisions.length,
    amendsEdges: support.amends.length,
    dependsOnEdges: support.dependsOn.length,

    components: [...componentStats].sort(
      (a, b) => b.members.length - a.members.length || a.id - b.id,
    ),
    componentCount: components.length,
    singletonComponents: componentStats.filter((c) => c.members.length === 1).length,
    structurallyEligibleComponents: componentStats.filter(componentStructurallyEligible).length,
    informativeComponents: informativeComponents.length,
    largestComponentWalkShare: totalComponentWalk === 0 ? 0 : largestComponentWalk / totalComponentWalk,
    largestComponentReachShare:
      totalComponentReach === 0 ? 0 : largestComponentReach / totalComponentReach,
    componentDesignInfeasible: componentSplit.infeasible,

    frontiers: [...frontierStats].sort(
      (a, b) => b.walkWindows - a.walkWindows || b.reachWindows - a.reachWindows || a.decision - b.decision,
    ),
    frontierCount: frontierStats.length,
    informativeFrontiers: informativeFrontierUnits.length,
    largestFrontierWalkShare: totalFrontierWalk === 0 ? 0 : largestFrontierWalk / totalFrontierWalk,
    frontierArms: frontierSplit.arms,
    frontierPairs: frontierSplit.pairs,
    frontierBalance: frontierSplit.balance,
    frontierContaminationWindows,
    frontierDesignInfeasible: frontierSplit.infeasible,

    windowsObserved: windowReads.size,
    readsWithoutWindowId,
    vacuity,
  };
}
