// DEPTH FROM THE SURFACE (ADR-0476) — how far down its own rabbit hole an artifact sits, as a pure
// function over the corpus.
//
// The sibling of `knowledge-depth.ts`, sharing its adjacency and differing only in where the walk
// starts and how it measures. Both are read-only render-time projections under ADR-0363 D2's fence:
// the graphs are not merged, nothing is written to the corpus, and no gate enforces either.
//
// ## THE OWNER'S MODEL, WHICH IS WHY THIS EXISTS
//
// Stated 2026-08-29: the library is a set of rabbit holes; artifacts are linked in `dependsOn`
// chains; some sit at the surface; **the surface need not be a story or any particular kind and may
// well be an ADR**; and the number worth having is how far down a hole a session had to go.
//
// `evaluateDepthFromWork` answers a narrower question — distance from a WORK ANCHOR, an artifact
// whose `cites` names a `story:` or `capability:`. There are 135 of those in 2,633 artifacts, so
// 258 of 3,101 joined nodes got any reading at all and the traversal panel printed `deepest 1` on
// essentially every real trace. The instrument was honest and standing somewhere it could see almost
// nothing. Seeded from the graph's own surface the same corpus runs **17 levels deep** across **701
// surfaces, 110 of them decisions** (measured 2026-08-29). BOTH READINGS ARE KEPT and neither is a
// correction of the other: they measure different distances and summing or collapsing them produces
// a number that means nothing in either system, for the same reason `amends` and `supersedes` are
// never summed (ADR-0403 dec 6).
//
// ## A SURFACE IS STRUCTURAL, AND UNLINKED IS NOT A SURFACE
//
// A surface is a node **nothing points at that points at something**. The second half is the clause
// that carries the honesty, and it is the single easiest thing to lose here: 1,945 of 3,101 nodes
// carry no edge in either direction, and a naive "seed every node with indegree 0" puts every one of
// them at depth 0 and then reports `3101 of 3101 have a depth`. They do not. An artifact nothing
// links to is UNMEASURED — not deep, not shallow — exactly as `knowledge-depth.ts` refuses to render
// an unreachable artifact as a distant one. Rendering it as a shallow one is the same failure with
// the sign flipped, and it is worse, because "everything is at the surface" reads as health.
//
// ## LONGEST CHAIN, NOT SHORTEST (ADR-0476 D2)
//
// `evaluateDepthFromWork` takes the SHORTEST path, which is right for "how far away is this from the
// work". It is wrong here: with 701 surfaces scattered through the graph, nearest-opening distance
// collapses every node to <= 3 and destroys the signal — measured, not assumed. The depth of a hole
// is how far down it goes, so a node's depth is the LONGEST chain from any surface down to it.
//
// ⚠ **A DEPTH IS THEREFORE A PROPERTY OF THE CORPUS, NEVER A RECORD OF THE ROUTE A SESSION TOOK.**
// An artifact at the bottom of a 17-chain reads 17 even when some other pointer offers a one-hop
// shortcut a session may well have used. The route actually walked is the traversal panel's OTHER
// axis (`parentVisitId`, `lib/traversalDepth.ts`), and conflating the two produces a figure that
// means nothing in either system — the same trap the panel's two "depth" words already carry.
//
// ## THE DENOMINATOR EXCLUDES THE RECORD TIERS (ADR-0476 D3)
//
// `135/2623 anchored` — the figure this replaces — divided by 1,880 record rows that were never
// candidates for an edge. Measured 2026-08-29: friction 568/568, open-question 22/23, increment
// 1,068/1,178 and arc 100/111 carry no edge in either direction, while pattern is 96% linked,
// definition 92%, principle 84%, guardrail 77% and adr 76%. Reporting one denominator over both
// populations states a fact about our record-keeping as though it were a fact about our knowledge,
// and it reads as an indictment of the latter.
//
// ## A DECISION IS ONE NODE HERE, NOT TWO
//
// Since ADR-0403 dec 1 a decision is an ordinary Library row, so the corpus holds `adr-NNNN` as an
// artifact AND `decision:NNNN` as a walk node — the same decision, twice. `evaluateDepthFromWork`
// keeps both apart on purpose (its `knownIds` holds each so it can tell an UNREACHABLE decision from
// an absent one), and for a shortest-path reading seeded at the work that costs nothing.
//
// It is NOT free here, and the failure is silent and severe. Every pointer at a decision resolves to
// `decision:NNNN`, so nothing ever points at the `adr-NNNN` twin: measured over the live corpus, all
// 468 twins came back indegree 0, which made every ADR carrying a `dependsOn` its OWN SURFACE at
// depth 0 and every ADR without one `unlinked`. A panel asking about the id a session actually read —
// `adr-0012`, never `decision:0012` — would have been told "depth 0, at the surface" about a decision
// sitting at the bottom of a 17-hop chain. The reading would have been exactly inverted, and it would
// have looked healthy.
//
// So the twins are COLLAPSED into their decision nodes before the walk: edges are unioned, inbound
// pointers redirect, the twin leaves the population (which is also what makes the denominator count
// 468 decisions once rather than twice), and {@link surfaceDepthOf} resolves an `adr-NNNN` query onto
// the surviving node through {@link SurfaceDepthVerdict.canonicalIds}.
//
// {@link RECORD_KINDS} is therefore a DECLARED list, not a heuristic: adding a kind to it changes
// what the corpus figure means, so it is a decision someone makes on purpose. An UNKNOWN kind counts
// as knowledge — failing toward the larger denominator, so a new tier can never silently improve the
// score.

import {
  buildDependencyGraph,
  type DepthFromWorkNode,
  type DependencyGraph,
} from "./knowledge-depth.js";
import { type DecisionSupportResolver } from "./decision-support-seam.js";
import { resolveDecisionSpelling } from "./decision-pointer.js";

/** One bucket of the reached-depth distribution. */
export interface SurfaceDepthBucket {
  readonly depth: number;
  readonly count: number;
}

/**
 * The kinds that are LOG ROWS rather than knowledge nodes, excluded from the corpus denominator.
 *
 * Declared, never inferred — see the header. `proposal` is included although ADR-0298 / ADR-0305 D1
 * retired the kind: a corpus row written before that retirement must not silently re-enter the
 * knowledge denominator, and a name that matches nothing costs nothing.
 */
export const RECORD_KINDS: ReadonlySet<string> = new Set([
  "increment",
  "friction",
  "arc",
  "open-question",
  "template",
  "proposal",
]);

/** The walk's input: the depth-from-work node plus the kind the denominator splits on. */
export interface SurfaceDepthNode extends DepthFromWorkNode {
  /**
   * The artifact's kind / category, as {@link kindOfDoc} reads it. REQUIRED, and `""` is the honest
   * value for a row that declares none — an unknown kind counts as knowledge (see the header).
   *
   * Required rather than optional on purpose: every caller already knows the kind (the studio has
   * `category` on the wire, the probe has the stored row), and an optional field here bought only a
   * default that no input could reach and no test could ever pin.
   */
  readonly kind: string;
}

/**
 * What one id's surface-depth reading came to.
 *
 * FOUR states, and collapsing any two of them is the bug. Three are the ordinary readings; `cyclic`
 * is a VACUITY state — see {@link SurfaceDepthVerdict.cyclicNodes}.
 */
export type SurfaceDepthReading =
  /** In the linked graph: the longest chain from a surface down to it is `depth` hops. */
  | { readonly state: "placed"; readonly depth: number }
  /** In the corpus with NO edge in either direction. Not deep, not shallow — unmeasured. */
  | { readonly state: "unlinked" }
  /** It has edges, but a cycle above it means no longest chain exists. Provably empty today. */
  | { readonly state: "cyclic" }
  /** Not a node of this graph at all — a story/capability id, a retired artifact, a CLI token. */
  | { readonly state: "absent" };

/** The corpus-wide surface-depth projection, denominators and all. */
export interface SurfaceDepthVerdict {
  /** Longest-chain depth per node id. An id ABSENT here was not placed — never read it as 0. */
  readonly depthById: ReadonlyMap<string, number>;
  /** Every id this graph holds, artifacts and decisions — separates `unlinked` from `absent`. */
  readonly knownIds: ReadonlySet<string>;
  /** Ids with no edge in either direction. The 63% — unmeasured, never shallow. */
  readonly unlinkedIds: ReadonlySet<string>;
  /**
   * `adr-NNNN` -> `decision:NNNN` for every decision twin collapsed away — see the header.
   *
   * Empty when no resolver was supplied, which is what keeps a resolver-less caller's node
   * population exactly the one it handed in.
   */
  readonly canonicalIds: ReadonlyMap<string, string>;

  /** Nodes judged, artifacts and decisions together. A reading of 0 is "nothing was measured". */
  readonly nodesScanned: number;
  readonly artifactsScanned: number;
  readonly decisionsScanned: number;
  /**
   * How many decisions arrived carrying a `dependsOn` FIELD AT ALL — present, even if empty.
   *
   * The denominator that separates a BLIND READER from an unwired decision log: zero resolvable
   * support edges is ambiguous between the two, and on 2026-08-23 both were true at once.
   */
  readonly decisionsCarryingDependsOn: number;
  /** Resolved edges the walk traversed. 0 over a non-trivial corpus means the reader is blind. */
  readonly edgesScanned: number;
  /**
   * Edges resolved from an AGENT MANIFEST refList (ADR-0481 D1), as the SHARED BUILDER counted them.
   *
   * ⚠ Counted BEFORE the decision twins collapse, so it is not a strict subset of
   * {@link edgesScanned} the way it is on `DepthFromWorkVerdict` — a manifest naming an `adr-NNNN`
   * is re-pointed by the collapse rather than dropped. Reported anyway, and reported separately,
   * because this reading is the one the manifest edge MOVES most: an artifact an agent injects
   * stops being a surface and stops being `unlinked`, and folding the count anonymously into
   * `edgesScanned` would make that shift unattributable.
   */
  readonly manifestEdges: number;

  /** Nodes nothing points at that point at something — the seed. */
  readonly surfaces: number;
  /** How many of those are decisions. The owner's "the surface could be an ADR", counted. */
  readonly surfaceDecisions: number;

  /** Nodes with at least one edge AND a longest-chain depth. */
  readonly placed: number;
  /** Nodes with no edge in either direction. `placed + unlinked + cyclicNodes === nodesScanned`. */
  readonly unlinked: number;
  /**
   * Nodes with edges that no topological order could reach — a cycle sits above them.
   *
   * PROVABLY EMPTY TODAY: `probe:combined-dag` reports the joined artifact + decision graph acyclic,
   * and ADR-0403 dec 5 rests on that proof. It is a state rather than an assertion so that a cycle
   * regression reads as an ABSENCE OF MEASUREMENT rather than as a depth — a walk that silently
   * assigned cycle members a first-seen depth would return a confident number nobody could audit.
   */
  readonly cyclicNodes: number;

  /** The deepest node placed. `0` means every placed node is itself a surface. */
  readonly maxDepth: number;
  /** The deepest node's id, or `null` when nothing was placed below a surface. */
  readonly deepestId: string | null;
  /** The placed distribution, ascending by depth. Empty iff `placed` is 0. */
  readonly histogram: readonly SurfaceDepthBucket[];

  // --- THE DENOMINATOR SPLIT (ADR-0476 D3) --------------------------------------------------

  /** Nodes whose kind is NOT in {@link RECORD_KINDS} — the honest corpus denominator. */
  readonly knowledgeScanned: number;
  /** Knowledge-tier nodes that are placed. The numerator the panel prints. */
  readonly knowledgeLinked: number;
  /** Record-tier nodes. Reported so the exclusion is visible rather than silently applied. */
  readonly recordScanned: number;
  /** Record-tier nodes that are placed — an increment CAN carry an `asset:` cite. */
  readonly recordLinked: number;
}

/**
 * The kind a stored row declares, or `""` when it declares none this reader can use.
 *
 * `""` rather than `undefined`, so the denominator split has exactly one shape to handle and an
 * unknown kind always lands on the knowledge side (see the header) rather than on a branch.
 * `kind` wins over `category`: both spellings are live on the wire and the row's own field is the
 * authority when it has one.
 */
export function kindOfDoc(doc: unknown): string {
  const payload = doc as { kind?: unknown; category?: unknown } | null | undefined;
  const declared = payload?.kind ?? payload?.category;
  return typeof declared === "string" ? declared : "";
}

/** A decision node id carries a colon; an artifact id cannot. The two id spaces are disjoint. */
function isDecisionNode(id: string): boolean {
  return id.includes(":");
}

/**
 * The artifact id of the row a decision node was ALSO stored as — `decision:0012` -> `adr-0012`.
 *
 * Both halves go through `decision-pointer.ts` rather than through string surgery here, so the one
 * place that knows how a decision is spelled stays the one place.
 */
function artifactIdOfDecisionNode(node: string): string {
  return `adr-${node.slice(node.indexOf(":") + 1)}`;
}

/**
 * PURE: compute every node's longest-chain depth from the graph's own surface, plus the
 * denominators that make the answer readable.
 *
 * ## THE ORDER IS KAHN'S, AND THAT IS WHAT MAKES THE CYCLE CASE HONEST
 *
 * Relaxing `depth[target] = max(depth[target], depth[node] + 1)` in topological order is what
 * computes a LONGEST path in one pass. Kahn's algorithm emits exactly the nodes no cycle sits above,
 * so the nodes it CANNOT emit are precisely the ones with no well-defined longest chain — they fall
 * out of the algorithm rather than needing to be detected, and they are reported as
 * {@link SurfaceDepthVerdict.cyclicNodes} instead of being handed a plausible first-seen number.
 *
 * A DFS with a "first depth wins" cycle guard would have been shorter and would have returned a
 * confident wrong answer on the same input. That is the trade this shape refuses.
 */
export function evaluateSurfaceDepth(
  nodes: readonly SurfaceDepthNode[],
  decisions?: DecisionSupportResolver,
): SurfaceDepthVerdict {
  const graph: DependencyGraph = buildDependencyGraph(nodes, decisions);
  const { byId, decisionIds } = graph;

  // FIRST ID WINS on a duplicate, matching `buildDependencyGraph` — a second row for the same id
  // must not silently re-label the node the graph was built from.
  // FIRST ID WINS on a duplicate, matching `buildDependencyGraph` — a second row for the same id
  // must not silently re-label the node the graph was built from. Held as the ANSWER (is this a
  // record tier?) rather than as the kind, so the denominator split below is a set membership and
  // not a lookup with a default nothing can reach.
  const recordIds = new Set<string>();
  const seenIds = new Set<string>();
  for (const node of nodes) {
    if (seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    if (RECORD_KINDS.has(node.kind)) recordIds.add(node.id);
  }

  // COLLAPSE THE DECISION TWINS FIRST — see the header. `adr-0012` and `decision:0012` are one
  // decision, and leaving them apart inverts the reading rather than merely coarsening it.
  //
  // Driven from the DECISIONS the graph holds rather than from every artifact id: a decision node id
  // is always well formed, so there is no "is this decision-shaped?" branch to get wrong, and an
  // artifact whose id merely BEGINS `adr-` is never a candidate because no decision names it.
  const canonicalIds = new Map<string, string>();
  for (const node of decisionIds) {
    const twin = artifactIdOfDecisionNode(node);
    if (graph.outbound.has(twin)) canonicalIds.set(twin, node);
  }
  const canonical = (id: string): string => canonicalIds.get(id) ?? id;

  // `outbound` holds ONLY the nodes that point at something, and `allIds` is tracked apart. A map
  // keyed by every node with an empty array for the sinks would make `get(id) ?? []` a fallback no
  // input can take — a line nobody can test, on the hottest path in the walk.
  const allIds: string[] = [];
  const outbound = new Map<string, string[]>();
  for (const [id, targets] of graph.outbound) {
    const from = canonical(id);
    if (!allIds.includes(from)) allIds.push(from);
    const merged = outbound.get(from) ?? [];
    for (const target of targets) {
      const to = canonical(target);
      // A self-edge is what a twin's own pointer at its decision becomes; it is not a hop.
      if (to !== from && !merged.includes(to)) merged.push(to);
    }
    if (merged.length > 0) outbound.set(from, merged);
  }

  const indegree = new Map<string, number>();
  let edgesScanned = 0;
  // EVERY TARGET IS A NODE OF THIS GRAPH, so there is no "unknown target" branch here to test or to
  // rot: `buildDependencyGraph` already drops an `asset:` pointer naming no artifact (it counts it
  // as `danglingTargets`) and a decision pointer the resolver does not hold, and it adds every
  // decision it DOES hold as a key. `canonical()` only ever rewrites one node id to another.
  for (const [, targets] of outbound) {
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
      edgesScanned += 1;
    }
  }

  // A SURFACE POINTS AT SOMETHING. Without that clause every edge-free node is a surface, and the
  // 1,945 unlinked nodes would report as depth 0 — see the header.
  const surfaceIds: string[] = [];
  const unlinkedIds = new Set<string>();
  for (const id of allIds) {
    const hasOut = outbound.has(id);
    const hasIn = (indegree.get(id) ?? 0) > 0;
    if (!hasIn && hasOut) surfaceIds.push(id);
    else if (!hasIn && !hasOut) unlinkedIds.add(id);
  }

  // KAHN'S ORDER, AS ONE PASS OVER A QUEUE THAT GROWS BEHIND THE CURSOR.
  //
  // `for…of` over a Set reads it live, so a node added here is visited later in this same loop.
  // That is deliberate and it is not merely style: the obvious `while (frontier.length)` shape
  // cannot be proved, because mutating its exit test to `>= 0` hangs the suite instead of failing an
  // assertion — a hang names no test and so can never be credited to this branch. A queue whose
  // every entry is admitted at most once is bounded by the node count no matter what any single
  // condition does, so every mutant here terminates and is answerable by an assertion — and the SET
  // is what makes that sentence true rather than merely intended (see below).
  const depthById = new Map<string, number>();
  const remaining = new Map(indegree);
  // A SET, NOT AN ARRAY, AND THAT IS WHAT MAKES THE ADMISSION RULE PROVABLE RATHER THAN MERELY
  // ASSERTED. Both hold the same entries in the same order under the correct rule, because
  // `left === 0` fires exactly once per node — so this is not a behaviour change. What it changes
  // is what a BROKEN admission rule can do: `Set.add` is idempotent and a set of node ids can never
  // hold more than `allIds.length` of them, so the walk terminates on ANY condition here, including
  // one mutated to a constant. Over an array the same mutation re-admits a node once per inbound
  // traversal and spins forever on the first cycle it meets — a HANG, which names no test and can
  // therefore never be credited to this branch. The bound must be structural for the rule above it
  // to be testable at all; a cap or an `already queued?` guard cannot supply it, because both are
  // lines the correct run never takes (VERIFIED: a cap was written here, its counter mutated by
  // hand, and all 37 tests passed).
  const queue = new Set(surfaceIds);
  for (const id of surfaceIds) depthById.set(id, 0);
  for (const id of queue) {
    const depth = depthById.get(id) ?? 0;
    for (const target of outbound.get(id) ?? []) {
      // MAX, not assignment: a node accumulates from every predecessor before it is queued, and the
      // LONGEST of those chains is its depth (ADR-0476 D2).
      depthById.set(target, Math.max(depthById.get(target) ?? 0, depth + 1));
      const left = (remaining.get(target) ?? 0) - 1;
      remaining.set(target, left);
      // Admitted only once every inbound edge has been consumed — that is what makes this a
      // topological order, and what makes the accumulated maximum final when it is read. Admitting
      // a node EARLY does not merely reorder the walk: the set visits it once, so the depth its own
      // successors read is whatever partial maximum it had at that moment, and a longer chain
      // arriving afterwards raises the node and never reaches past it.
      if (left === 0) queue.add(target);
    }
  }

  // Every node with an edge that Kahn could not emit still carries inbound edges it never consumed,
  // which means a cycle sits above it. Its partial depth is DISCARDED — a partial longest chain is
  // not a longest chain, and reporting one would be a confident number nobody could audit.
  // An UNLINKED node needs no exclusion here: it has no inbound edge to leave unconsumed, so its
  // remainder is 0 and it cannot be swept in. Excluding it explicitly would be a branch no input
  // can take, which reads as care and is a line nobody can ever test.
  const cyclic = new Set<string>();
  for (const id of allIds) {
    if ((remaining.get(id) ?? 0) > 0) {
      cyclic.add(id);
      depthById.delete(id);
    }
  }

  const counts = new Map<number, number>();
  let maxDepth = 0;
  let deepestId: string | null = null;
  for (const [id, depth] of depthById) {
    counts.set(depth, (counts.get(depth) ?? 0) + 1);
    // Ties break toward the FIRST id seen so the named witness is stable run to run.
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestId = id;
    }
  }

  let knowledgeScanned = 0;
  let knowledgeLinked = 0;
  let recordScanned = 0;
  let recordLinked = 0;
  for (const id of allIds) {
    // A DECISION IS NEVER A RECORD TIER, whatever the artifact twin's kind field said — the twin is
    // collapsed away and the surviving node is a decision, which no decision id can be a member of
    // `recordIds` to contradict.
    const isRecord = recordIds.has(id);
    const placed = depthById.has(id);
    if (isRecord) {
      recordScanned += 1;
      if (placed) recordLinked += 1;
    } else {
      knowledgeScanned += 1;
      if (placed) knowledgeLinked += 1;
    }
  }

  return {
    depthById,
    knownIds: new Set(allIds),
    unlinkedIds,
    canonicalIds,
    nodesScanned: allIds.length,
    artifactsScanned: byId.size - canonicalIds.size,
    decisionsScanned: decisionIds.length,
    decisionsCarryingDependsOn: graph.decisionsCarryingDependsOn,
    edgesScanned,
    manifestEdges: graph.manifestEdges,
    surfaces: surfaceIds.length,
    surfaceDecisions: surfaceIds.filter(isDecisionNode).length,
    placed: depthById.size,
    unlinked: unlinkedIds.size,
    cyclicNodes: cyclic.size,
    maxDepth,
    deepestId,
    histogram: [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([depth, count]) => ({ depth, count })),
    knowledgeScanned,
    knowledgeLinked,
    recordScanned,
    recordLinked,
  };
}

/**
 * One id's reading. FOUR states — see {@link SurfaceDepthReading}; collapsing any two is the bug.
 *
 * ## IT ANSWERS FOR EVERY SPELLING OF A DECISION, INCLUDING THE ONE THAT PREDATES THE ROW
 *
 * A caller asks about the id a session READ, and a session that read a decision BEFORE ADR-0403 dec 1
 * recorded the FILE it opened — `doc:decisions/0311-….md` — where a session today records `adr-0311`.
 * {@link resolveDecisionSpelling} folds the file spellings onto the row id first, so one decision has
 * one reading here no matter which era's trace is asking. Without it a historical read is answered
 * ABSENT, and a decision's entire subtree of depth is withheld from every trace older than the
 * migration (`traversal-panel-legacy-decision-reads-resolve` — measured on the richest local trace,
 * `placed 16/77 · deepest 2` became `placed 60/74 · deepest 12`).
 *
 * It is a no-op on every id that is not a decision spelling, so a caller handing in ordinary artifact
 * ids — which is every caller that reads the corpus rather than a trace — is unaffected byte for byte.
 */
export function surfaceDepthOf(verdict: SurfaceDepthVerdict, id: string): SurfaceDepthReading {
  // A caller asks about the id a session READ — `adr-0012`, never `decision:0012`. See the header.
  const spelled = resolveDecisionSpelling(id);
  const canonical = verdict.canonicalIds.get(spelled) ?? spelled;
  const depth = verdict.depthById.get(canonical);
  if (depth !== undefined) return { state: "placed", depth };
  if (verdict.unlinkedIds.has(canonical)) return { state: "unlinked" };
  if (verdict.knownIds.has(canonical)) return { state: "cyclic" };
  return { state: "absent" };
}

/**
 * The corpus size at or above which a surface walk that resolved NO edge can only mean the READER is
 * blind. Shares `VACUOUS_DECISION_WALK_FLOOR`'s calibration, for its reason.
 */
export const VACUOUS_SURFACE_WALK_FLOOR = 100;

/**
 * PURE: the ways a surface reading could be a number that measured nothing. EMPTY means the walk saw
 * its subject; each entry names one thing it could not see.
 *
 * **ASK WHAT INPUT WOULD MAKE THIS RED.** A walk over a corpus whose edges all failed to resolve
 * reports every node unlinked and `maxDepth 0` — which reads as "the corpus is flat", a plausible
 * finding, rather than as "the reader is blind". That is the failure `check:library-dag-acyclic`
 * once shipped as `PASS — no dependsOn cycle across 1701 artifacts (0 authored edges)`.
 *
 * Reasons rather than a boolean, because the causes have different remedies.
 */
export function surfaceWalkVacuity(verdict: SurfaceDepthVerdict): readonly string[] {
  const reasons: string[] = [];
  if (verdict.nodesScanned === 0) {
    reasons.push("no nodes were scanned — the corpus was not read");
    return reasons;
  }
  if (verdict.nodesScanned >= VACUOUS_SURFACE_WALK_FLOOR && verdict.edgesScanned === 0) {
    reasons.push(
      `${verdict.nodesScanned} nodes carried 0 resolvable edges between them — the reader is blind, ` +
        "not the corpus flat (suspect a pointer-spelling regression in `decision-pointer.ts`)",
    );
  }
  if (verdict.surfaces === 0 && verdict.edgesScanned > 0) {
    reasons.push(
      `${verdict.edgesScanned} edges resolved but no node has indegree 0 — every node is pointed at, ` +
        "which is impossible over an acyclic graph, so either every node is in a cycle or the " +
        "adjacency is wrong",
    );
  }
  if (verdict.cyclicNodes > 0) {
    reasons.push(
      `${verdict.cyclicNodes} nodes sit under a cycle and have no longest chain — ` +
        "`probe:combined-dag` proves this graph acyclic, so this is a regression, not a corpus fact",
    );
  }
  return reasons;
}
