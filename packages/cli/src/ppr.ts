/**
 * PERSONALIZED PAGERANK OVER THE DECISION GRAPH — the HippoRAG method, tried where it matters.
 *
 * `follow-the-research-arc-inc-03`. HippoRAG (NeurIPS 2024, arXiv 2405.14831) takes the hippocampal
 * indexing theory of memory as its design: a knowledge graph standing in for neocortex, Personalized
 * PageRank seeded from the query's entities standing in for hippocampal pattern completion.
 * Probability spreads from the seeds, so material several hops away surfaces in ONE retrieval rather
 * than in several. The method needs exactly one asset — a graph with real edges — which is the thing
 * we already have and every paper in the field has to fabricate by LLM extraction.
 *
 * PURE and TOTAL: no filesystem, no clock, no store, no `process.env`, no randomness. Every input is
 * injected by {@link import("./probe-ppr.js")}, which is the half that reads transcripts and the
 * live corpus. The window split below is a deterministic hash for exactly this reason — a seeded RNG
 * would still be state this module is not allowed to hold.
 *
 * ## ⚠ THE TAUTOLOGY THIS MODULE IS SHAPED TO AVOID (ADR-0513 D8)
 *
 * Generating queries from `dependsOn` and then scoring retrieval against `dependsOn` measures
 * whether a retriever can follow edges we told it about, and it passes trivially. That is a named,
 * studied failure — it is why MuSiQue exists, and why HotpotQA scores 68.8 on Disconnected Reasoning
 * against MuSiQue-Ans's 37.8.
 *
 * **So the gold set here is not authored at all: it is OBSERVED.** {@link buildRetrievalCases} reads
 * what decisions a real context window actually read in one sitting, takes the FIRST as the seed and
 * the rest as the gold. The edges PPR spreads over and the gold it is scored against then come from
 * two independent sources — authored structure on one side, recorded behaviour on the other — so a
 * win is a real prediction rather than a restatement of the input. The seed is the first read
 * specifically because that is the only information available *before* the rest of the window
 * happened; scoring a mid-window read as the seed would leak the answer's neighbourhood.
 *
 * ## AND THE SECOND TAUTOLOGY, WHICH IS SUBTLER AND IS WHY THE SPLIT EXISTS
 *
 * `co-read-edges-2026-09-05.md` §6 asks for this trial to be run BOTH ways — over authored edges
 * alone, and over authored-plus-co-read. But co-read edges are derived from the very reads that form
 * the gold, so scoring that arm on windows whose co-reads helped build its own edges is circular in
 * the flattering direction. {@link splitWindowsByHash} partitions the windows FIRST; the co-read arm
 * may only ever be built from the train half and scored on the test half. The split is by
 * `windowId` and is deterministic, so the two halves cannot drift between a build and its score.
 *
 * ## WHY A CHANCE NULL IS REPORTED BESIDE EVERY RECALL
 *
 * The same discipline the co-read census had to adopt: "63.5% of authored edges were co-read" means
 * nothing without the 4.8% density that makes chance predict 29.4 rather than 390. A recall@k figure
 * is likewise unreadable alone — with a pool of 463 decisions, recall@20 of 0.05 is not a finding
 * until it is set against the 0.043 a uniformly random ranking would score. {@link chanceRecallAtK}
 * is exact rather than simulated, so it cannot disagree with itself between runs.
 *
 * ## ⚠ WHAT THIS MODULE MAY NOT CONCLUDE
 *
 * Nothing here is comparable to a published result (ADR-0513 D3). No trial on this arc may claim
 * parity with, or improvement on, HippoRAG's reported 10-20x — different corpus, different queries,
 * different harness, and "Stop Comparing LLM Agents Without Disclosing the Harness" (arXiv
 * 2605.23950) argues such cross-setup scores are simply incomparable. The only claim available is an
 * internal bake-off against our own BM25 on our own queries.
 */

import type { DecisionEdge } from "./decision-read-baseline.js";

/**
 * The read half this module needs, named by its use rather than by its origin — structurally a
 * `DecisionReadObservation`, so the probe hands its own rows straight in.
 */
export interface DecisionReadForPpr {
  /** The HOST CONTEXT WINDOW, never the pooled worktree slot — see the co-read module's warning. */
  readonly windowId: string | undefined;
  readonly nodeId: string;
  /** ISO instant; ordering within a window decides which read is the seed. */
  readonly at: string;
}

/**
 * A graph PPR can walk: dense integer indices, adjacency, and the arithmetic that lets a caller see
 * what was dropped rather than infer it from a total that quietly shrank.
 */
export interface PprGraph {
  /** Decision numbers, ascending. Index into every other array here. */
  readonly nodes: readonly number[];
  readonly indexOf: ReadonlyMap<number, number>;
  /** Adjacency by index. Undirected graphs carry each edge in both lists. */
  readonly neighbours: readonly (readonly number[])[];
  readonly directed: boolean;
  /** Edges retained — after dropping endpoints outside `nodes` and after de-duplication. */
  readonly edgeCount: number;
  /** Edges naming a decision the node list does not hold. COUNTED, never silently dropped. */
  readonly droppedEndpoints: number;
  /** Edges that named the same pair twice (or a self-loop), folded into one. */
  readonly duplicateEdges: number;
  /** Nodes with no outgoing edge — their rank mass restarts rather than evaporating. */
  readonly danglingNodes: number;
}

export interface PprOptions {
  /**
   * Damping: the probability of following an edge rather than restarting at the seeds. The classic
   * PageRank value is 0.85; HippoRAG runs nearer 0.5, which concentrates mass close to the seed.
   * Both are reported by the probe rather than one being chosen here.
   */
  readonly alpha?: number;
  readonly maxIterations?: number;
  /** L1 convergence bound. */
  readonly tolerance?: number;
}

export interface PprResult {
  /** Score per node index; sums to 1 up to floating-point error. */
  readonly scores: readonly number[];
  readonly iterations: number;
  readonly converged: boolean;
}

export const DEFAULT_ALPHA = 0.85;
/**
 * ⚠ 500, NOT 100, AND THE OLD 100 SILENTLY RETURNED AN UNCONVERGED ANSWER.
 *
 * Power iteration for PageRank converges at rate `alpha`, not `alpha²`: after k steps the residual
 * is ~`alpha^k`, so at the default 0.85 a hundred iterations reaches only 0.85^100 ≈ 1.3e-7 — a
 * thousand times short of {@link DEFAULT_TOLERANCE} — and the function returned `converged: false`
 * with a ranking that looked entirely reasonable. Measured on the two-node closed form, which agreed
 * to 4e-8 rather than to the 1e-12 it reaches once the loop is allowed to finish. 500 clears 1e-10
 * at every alpha this probe uses (0.85 needs ~142), and at 463 nodes the whole walk is microseconds.
 *
 * The `converged` flag is still returned rather than thrown on, because the honest place to refuse is
 * the caller that would publish the number — {@link import("./probe-ppr.js")} treats it as fatal.
 */
export const DEFAULT_MAX_ITERATIONS = 500;
export const DEFAULT_TOLERANCE = 1e-10;

/**
 * Build the walkable graph.
 *
 * `directed: false` is the default because the retrieval question is symmetric — "what else bears on
 * this?" — while `dependsOn` is authored in one direction only, from the newer decision to the older
 * one it rests on. Spreading only forwards would make every recently-authored decision a sink and
 * every foundational one unreachable from its own dependents, which is the opposite of how the
 * corpus is actually read (agents land deep and climb back UP). The directed arm is still available
 * and the probe reports it, because "the direction does not matter" is a claim that should be
 * measured rather than assumed.
 */
export function buildPprGraph(
  nodes: readonly number[],
  edges: readonly DecisionEdge[],
  opts: { readonly directed?: boolean } = {},
): PprGraph {
  const directed = opts.directed ?? false;
  const ascending = [...new Set(nodes)].sort((a, b) => a - b);
  const indexOf = new Map<number, number>();
  ascending.forEach((node, index) => indexOf.set(node, index));

  const adjacency: number[][] = ascending.map(() => []);
  const seen = new Set<string>();
  let droppedEndpoints = 0;
  let duplicateEdges = 0;

  for (const edge of edges) {
    const from = indexOf.get(edge.from);
    const to = indexOf.get(edge.to);
    if (from === undefined || to === undefined) {
      droppedEndpoints += 1;
      continue;
    }
    // A self-loop carries no information for spreading and would inflate the retained count.
    if (from === to) {
      duplicateEdges += 1;
      continue;
    }
    const key = directed ? `${from}>${to}` : `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (seen.has(key)) {
      duplicateEdges += 1;
      continue;
    }
    seen.add(key);
    // Stryker disable next-line OptionalChaining: EQUIVALENT — `from` and `to` came from
    // `indexOf`, so both rows exist by construction; the `?.` is `noUncheckedIndexedAccess`
    // satisfying the compiler, and dropping it cannot change any answer a test could observe.
    adjacency[from]?.push(to);
    // Stryker disable next-line OptionalChaining: EQUIVALENT — as above.
    if (!directed) adjacency[to]?.push(from);
  }

  let danglingNodes = 0;
  for (const list of adjacency) if (list.length === 0) danglingNodes += 1;

  return {
    nodes: ascending,
    indexOf,
    neighbours: adjacency.map((list) => [...list].sort((a, b) => a - b)),
    directed,
    edgeCount: seen.size,
    droppedEndpoints,
    duplicateEdges,
    danglingNodes,
  };
}

/**
 * Personalized PageRank by power iteration.
 *
 * `r = alpha * (M r + dangling * e) + (1 - alpha) * e`, where `e` is the restart vector — uniform
 * over the seeds rather than over the whole corpus, which is the one line that makes it
 * *personalized*. Dangling mass is returned to the SEEDS rather than spread uniformly: a node with
 * no outgoing edge should not quietly promote the entire rest of the corpus.
 *
 * REFUSES rather than degrades on a seed the graph does not hold. A seed silently skipped would
 * report a confident ranking for a query that was never actually asked, and on an empty seed set the
 * restart vector is undefined — the result would be uniform noise wearing a score's clothes.
 */
export function personalizedPageRank(
  graph: PprGraph,
  seeds: readonly number[],
  opts: PprOptions = {},
): PprResult {
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;

  if (alpha < 0 || alpha >= 1) {
    throw new Error(`personalizedPageRank: alpha must be in [0, 1), got ${alpha}`);
  }
  const distinctSeeds = [...new Set(seeds)];
  if (distinctSeeds.length === 0) {
    throw new Error("personalizedPageRank: at least one seed is required");
  }

  const n = graph.nodes.length;
  const restart: number[] = Array.from({ length: n }, () => 0);
  const share = 1 / distinctSeeds.length;
  for (const seed of distinctSeeds) {
    const index = graph.indexOf.get(seed);
    if (index === undefined) {
      throw new Error(`personalizedPageRank: seed ${seed} is not a node in this graph`);
    }
    // Stryker disable next-line LogicalOperator: EQUIVALENT — `distinctSeeds` is de-duplicated, so
    // this slot is always still 0 when it is written; `?? 0` and `&& 0` both yield 0 here and no
    // seed list can distinguish them.
    restart[index] = (restart[index] ?? 0) + share;
  }

  let scores = [...restart];
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    const next: number[] = Array.from({ length: n }, () => 0);
    let dangling = 0;

    for (let i = 0; i < n; i += 1) {
      const mass = scores[i] ?? 0;
      // Stryker disable next-line ArrayDeclaration: EQUIVALENT — `i` ranges over `graph.nodes`
      // and `neighbours` is built one entry per node, so the fallback is unreachable.
      const out = graph.neighbours[i] ?? [];
      if (out.length === 0) {
        dangling += mass;
        continue;
      }
      const spread = mass / out.length;
      for (const j of out) next[j] = (next[j] ?? 0) + spread;
    }

    let delta = 0;
    for (let i = 0; i < n; i += 1) {
      const e = restart[i] ?? 0;
      const value = alpha * ((next[i] ?? 0) + dangling * e) + (1 - alpha) * e;
      delta += Math.abs(value - (scores[i] ?? 0));
      next[i] = value;
    }

    scores = next;
    if (delta < tolerance) {
      converged = true;
      iterations += 1;
      break;
    }
  }

  return { scores, iterations, converged };
}

/**
 * The ranking PPR implies: every node but the seeds, best first.
 *
 * The seeds are EXCLUDED because a retriever that returns the document you already have has
 * retrieved nothing — and by construction the seeds carry the largest scores, so leaving them in
 * would spend the top of every ranking on them. Ties break by decision number so a run is
 * reproducible; ordering by insertion would make the result depend on the adjacency build.
 */
export function rankFromScores(
  graph: PprGraph,
  scores: readonly number[],
  exclude: readonly number[],
): readonly number[] {
  const excluded = new Set(exclude);
  const ranked = graph.nodes
    .map((node, index) => ({ node, score: scores[index] ?? 0 }))
    .filter((entry) => !excluded.has(entry.node) && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.node - b.node);
  return ranked.map((entry) => entry.node);
}

/**
 * Recall@k — the share of the gold set the top `k` recovered.
 *
 * Throws on an empty gold set rather than returning 0 or 1: a case with nothing to find is not a
 * score of zero, it is a case that should never have been built, and averaging it in either
 * direction corrupts the mean. {@link buildRetrievalCases} guarantees the caller cannot produce one.
 */
export function recallAtK(
  ranked: readonly number[],
  gold: ReadonlySet<number>,
  k: number,
): number {
  if (gold.size === 0) throw new Error("recallAtK: the gold set is empty");
  if (k <= 0) throw new Error(`recallAtK: k must be positive, got ${k}`);
  let found = 0;
  for (const node of ranked.slice(0, k)) if (gold.has(node)) found += 1;
  return found / gold.size;
}

/**
 * The recall@k a uniformly random ranking would score, in expectation — EXACT, not simulated.
 *
 * By linearity of expectation each gold item lands in the top `k` with probability `k / poolSize`,
 * so the expected recall is `k / poolSize` regardless of how large the gold set is. Simulating this
 * would introduce the randomness this module is not allowed to hold, and would disagree with itself
 * between runs by a margin comparable to the effect being measured.
 */
export function chanceRecallAtK(k: number, poolSize: number): number {
  if (poolSize <= 0) throw new Error(`chanceRecallAtK: poolSize must be positive, got ${poolSize}`);
  if (k <= 0) throw new Error(`chanceRecallAtK: k must be positive, got ${k}`);
  return Math.min(1, k / poolSize);
}

export interface PairedComparison {
  /** Cases BOTH arms scored. A case only one arm could rank is not a comparison. */
  readonly n: number;
  readonly meanDifference: number;
  readonly standardError: number;
  readonly ci95: readonly [number, number];
  /** True when the 95% interval excludes zero — i.e. the arms are distinguishable at all. */
  readonly separates: boolean;
}

/**
 * A PAIRED comparison of two arms on the same cases — the difference between a finding and a mirage.
 *
 * Two arms scoring 58.3% and 57.2% look like a result and are not one: on ~140 cases a gap of about
 * a point is comfortably inside the noise, and reporting it as an improvement is how a bake-off
 * manufactures a winner. The pairing is what buys the power — the same windows are hard for every
 * arm, so differencing per case removes the case-to-case variance that dominates the raw means.
 *
 * A normal-approximation interval rather than a bootstrap, because a bootstrap needs randomness this
 * module is not allowed to hold, and at n ≈ 140 the two agree to more decimal places than any claim
 * here rests on.
 */
export function pairedDifference(
  a: readonly number[],
  b: readonly number[],
): PairedComparison {
  if (a.length !== b.length) {
    throw new Error(`pairedDifference: arms must be scored on the same cases (${a.length} vs ${b.length})`);
  }
  const n = a.length;
  if (n < 2) throw new Error(`pairedDifference: need at least two paired cases, got ${n}`);

  const differences = a.map((value, index) => value - (b[index] ?? 0));
  const mean = differences.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardError = Math.sqrt(variance / n);
  const half = 1.96 * standardError;
  const ci95: [number, number] = [mean - half, mean + half];
  return {
    n,
    meanDifference: mean,
    standardError,
    ci95,
    separates: ci95[0] > 0 || ci95[1] < 0,
  };
}

/** One scored retrieval case: what the window landed on first, and what it went on to read. */
export interface RetrievalCase {
  readonly windowId: string;
  readonly seed: number;
  /** Distinct, ascending, never containing the seed. Guaranteed non-empty. */
  readonly gold: readonly number[];
}

export interface RetrievalCaseReading {
  readonly cases: readonly RetrievalCase[];
  readonly windowsSeen: number;
  /** Windows dropped for reading fewer than two DISTINCT decisions — no forward prediction to make. */
  readonly windowsWithoutGold: number;
  /** Observations carrying no window id: counted and dropped, never folded onto a slot. */
  readonly readsWithoutWindow: number;
  /** Observations whose id the resolver could not turn into a decision number. */
  readonly unresolvedReads: number;
}

/**
 * Turn observed reads into scored cases: FIRST read is the seed, the rest of that window is the gold.
 *
 * ⚠ The window is the unit, and the slot would manufacture the finding — the same trap
 * `co-read-edges.ts` documents at length. Slots are POOLED across a parent session, its subagents,
 * and later sessions handed the same slot, so keying on one would join decisions read WEEKS apart by
 * DIFFERENT sessions into a single "sitting" and inflate exactly the number being reported.
 *
 * Ordering is by `at`, ties broken by node id so the seed choice is deterministic. A window whose
 * reads all carry the same instant still yields a stable seed rather than one that depends on
 * transcript scan order.
 */
export function buildRetrievalCases(
  observations: readonly DecisionReadForPpr[],
  resolve: (nodeId: string) => number | null,
): RetrievalCaseReading {
  const byWindow = new Map<string, { number: number; at: string; nodeId: string }[]>();
  let readsWithoutWindow = 0;
  let unresolvedReads = 0;

  for (const observation of observations) {
    if (observation.windowId === undefined || observation.windowId === "") {
      readsWithoutWindow += 1;
      continue;
    }
    const number = resolve(observation.nodeId);
    if (number === null) {
      unresolvedReads += 1;
      continue;
    }
    const list = byWindow.get(observation.windowId);
    const row = { number, at: observation.at, nodeId: observation.nodeId };
    if (list === undefined) byWindow.set(observation.windowId, [row]);
    else list.push(row);
  }

  const cases: RetrievalCase[] = [];
  let windowsWithoutGold = 0;

  for (const [windowId, rows] of [...byWindow.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const ordered = [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.number - b.number);
    const numbers = ordered.map((row) => row.number);
    const seed = numbers[0];
    const gold = [...new Set(numbers)].filter((number) => number !== seed).sort((a, b) => a - b);
    // ONE guard, not two. `byWindow` never holds an empty array, so a separate `seed === undefined`
    // branch was dead code that no test could reach and every mutation of which survived by
    // construction; folding it in here puts it on the same reachable path as the real case — a
    // window that read one decision and therefore offers nothing to predict.
    if (seed === undefined || gold.length === 0) {
      windowsWithoutGold += 1;
      continue;
    }
    cases.push({ windowId, seed, gold });
  }

  return {
    cases,
    windowsSeen: byWindow.size,
    windowsWithoutGold,
    readsWithoutWindow,
    unresolvedReads,
  };
}

/**
 * A deterministic FNV-1a over the window id — the split must be reproducible without holding a seed.
 *
 * A random split would make the co-read arm's edges and the half they are scored on drift between a
 * build and its score, which is precisely the circularity {@link splitWindowsByHash} exists to close.
 */
function hashWindowId(windowId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < windowId.length; i += 1) {
    hash ^= windowId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface WindowSplit {
  readonly train: readonly RetrievalCase[];
  readonly test: readonly RetrievalCase[];
}

/**
 * Partition cases by window into a train half (which may build derived edges) and a test half (which
 * scores them).
 *
 * `testShare` is the fraction routed to TEST. The authored-edge arms do not need this split — their
 * edges were authored by people, not derived from these reads — but they are scored on the SAME test
 * half regardless, because two arms compared on different case sets are not compared at all.
 */
export function splitWindowsByHash(
  cases: readonly RetrievalCase[],
  testShare: number,
): WindowSplit {
  if (testShare <= 0 || testShare >= 1) {
    throw new Error(`splitWindowsByHash: testShare must be in (0, 1), got ${testShare}`);
  }
  const cutoff = testShare * 0xffffffff;
  const train: RetrievalCase[] = [];
  const test: RetrievalCase[] = [];
  for (const entry of cases) {
    if (hashWindowId(entry.windowId) < cutoff) test.push(entry);
    else train.push(entry);
  }
  return { train, test };
}

/**
 * How far the gold sits from the seed through authored edges — the honest analogue of MuSiQue's
 * connectedness filter (ADR-0513 D8).
 *
 * The filter itself does not transfer literally: our queries are not composed from `dependsOn` at
 * all, so there is no intermediate to mask. What the filter was FOR does transfer — separating the
 * cases a retriever can win in one trivial hop from the ones that need real spreading. Reporting the
 * partition beats dropping the easy cases, because the share of gold that is one hop away is itself
 * a fact about how agents read: if most of it is adjacent, the walk we authored is the walk they do.
 *
 * `Infinity` means the gold is unreachable from the seed over authored edges at any distance — the
 * population no authored traversal can ever surface, and the one co-read edges exist to reach.
 */
export function hopDistances(
  graph: PprGraph,
  seed: number,
  targets: readonly number[],
): ReadonlyMap<number, number> {
  const start = graph.indexOf.get(seed);
  const distances = new Map<number, number>();
  for (const target of targets) distances.set(target, Number.POSITIVE_INFINITY);
  if (start === undefined) return distances;

  const depth: number[] = Array.from({ length: graph.nodes.length }, () => -1);
  depth[start] = 0;
  let frontier = [start];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const index of frontier) {
      // Stryker disable next-line LogicalOperator: EQUIVALENT — every index in the frontier was
      // written to `depth` before being queued, so the fallback is unreachable.
      const here = depth[index] ?? 0;
      // Stryker disable next-line ArrayDeclaration: EQUIVALENT — one adjacency row per node.
      for (const neighbour of graph.neighbours[index] ?? []) {
        // Stryker disable next-line UnaryOperator: EQUIVALENT — `depth` is initialised to -1 at
        // every slot, so the `?? -1` fallback cannot fire; the sentinel itself is asserted by
        // "hopDistances counts real distance along a chain and stops at the break".
        if ((depth[neighbour] ?? -1) !== -1) continue;
        depth[neighbour] = here + 1;
        next.push(neighbour);
      }
    }
    frontier = next;
  }

  for (const target of targets) {
    const index = graph.indexOf.get(target);
    if (index === undefined) continue;
    // Stryker disable next-line UnaryOperator: EQUIVALENT — `index` came from `indexOf`, so the
    // slot exists and the fallback is unreachable.
    const found = depth[index] ?? -1;
    if (found >= 0) distances.set(target, found);
  }
  return distances;
}
