/**
 * THE FROZEN BASELINE'S ARITHMETIC — `decision-read-measurement-arc-inc-02`.
 *
 * Three numbers about how sessions actually consult the decision log, and every denominator each of
 * them rests on. PURE: no filesystem, no clock, no store, no `process.env`. Every input is injected
 * by {@link import("./probe-decision-baseline.js")}, which is the only half that touches the world —
 * so the whole computation is testable offline against a fixture and the frozen figures are
 * reproducible by anyone who can re-supply the same inputs.
 *
 * ## THE THREE NUMBERS, AND WHY EACH IS SHAPED THE WAY IT IS
 *
 * **REACH** ranks decisions by DISTINCT SESSIONS, never by raw read count. One session that re-reads
 * a decision twenty times is one session's evidence of heat, and a rank built on the raw count would
 * let a single grinding session manufacture the corpus's hottest decision.
 *
 * **CHAIN DEPTH** is the arc's load-bearing number: for one session in one sitting, how far down a
 * single support chain did it walk? An edge rollup at a chain frontier removes exactly the cost of
 * walking a chain, so if sessions do not walk chains the hypothesis is FALSIFIED and the arc must say
 * so plainly. It is reported as a DISTRIBUTION over sessions, never as a mean — a mean over a
 * population where almost every session reads one decision and one session reads a ladder describes
 * neither of them.
 *
 * **OFFER-TO-FOLLOW** joins reads to the offer record. A decision offered constantly and never
 * followed is NOISE, not heat, and a rank built on reads alone cannot tell the two apart.
 *
 * ## THE JOIN KEY IS THE DECISION NUMBER, AND NOTHING ELSE WOULD WORK
 *
 * The corpus names one decision in several spellings and rewrites none of them (ADR-0403 dec 7), and
 * BOTH sides of the offer-to-follow join carry more than one of them at once. `-inc-01` (PR #1570)
 * measured what a raw-string join costs on the live population: **31 of 3,391 (0.9%)** against
 * **1,098 of 3,391 (32.4%)** once both sides resolve to a decision number — a ~35x under-count that
 * reports no error and prints as a confident, low follow rate. That is the precise failure
 * `decision-pointer.ts` exists to prevent, and the one `-inc-01` names as "the numbers would compute
 * and be wrong".
 *
 * So every id on both sides is resolved to a NUMBER first, through the corpus's own single resolution
 * point ({@link decisionNumberOfObservedId} delegates to `resolveDecisionId`), and the SPELLING CENSUS
 * is reported beside the join so the resolution is auditable rather than assumed.
 *
 * ## TWO GRAINS OF "A SESSION", REPORTED SIDE BY SIDE BECAUSE THEY DISAGREE
 *
 * A trace's `sessionId` is the pooled WORKTREE SLOT for every line written before window identity
 * existed, and slots pool: the median holds 2 context windows, the p90 holds 8, one holds 137
 * (`session-identity.ts`). "What one session did in ONE SITTING" measured over a slot is therefore
 * inflated, and the same pooling has already published a wrong number once — "one document pulled 28
 * times in one session" was eleven-plus sessions over 15 days.
 *
 * This module refuses to pick one grain and hide the other. Chain depth and reach are computed at
 * BOTH — window grain from the transcript line's own id ({@link DecisionReadObservation.windowId}),
 * slot grain from the trace store — and the pair is reported so the pooling factor is a MEASUREMENT
 * in the frozen baseline rather than a caveat a later reader has to take on faith. The window-grained
 * figure is the arc's number; the slot-grained one is what the same arithmetic would have said, and
 * the gap between them is how much the identity axis was worth.
 *
 * ## "NOTHING WAS DEEP" AND "NOTHING WAS MEASURED" MUST NEVER PRINT THE SAME WAY
 *
 * {@link decisionReadBaselineVacuity} is `decisionWalkVacuity`'s discipline reused rather than
 * re-derived: it returns REASONS, not a boolean, because the causes have different remedies, and it
 * ANDs the two support edges rather than summing them (ADR-0419 D1) — a corpus part-way through the
 * `amends`-to-`dependsOn` drain has fewer `amends` edges BY DESIGN, so an `amends`-only emptiness
 * test would declare a healthy log vacuous exactly as the drain succeeded.
 *
 * ## EVERY FIGURE IS A FLOOR, AND THE BIAS IS TWO-SIDED
 *
 * Under-reporting is this arc's accepted failure mode. Capture blind spots REMOVE reads, and removing
 * a node from a read set can only shorten the longest chain contained in it — so capture loss pushes
 * chain depth DOWN. Slot pooling UNIONS several sittings into one, which can only lengthen it — so
 * pooling pushes the slot-grained figure UP. The two biases run in opposite directions, which is
 * exactly why reporting a single blended number would be dishonest and why both grains are printed.
 */
import { resolveDecisionId, type DecisionIdSpelling } from "@storytree/context-traversal-transcript";

// ---------------------------------------------------------------------------
// Inputs — every one injected, so this module has no world of its own
// ---------------------------------------------------------------------------

/** Which identity grain a session key names. Stated, never inferred from the key's shape. */
export type SessionGrain = "window" | "slot";

/** One observed read of a decision record, already attributed to a session key. */
export interface DecisionReadObservation {
  /** The pooled worktree slot the read happened in. Always present — it is what offers join on. */
  readonly slotId: string;
  /**
   * The host context window the read happened in, when the record carries one. Undefined is a real
   * and expected answer (a legacy line, or a line that recorded no id) and is COUNTED rather than
   * folded into the slot — see the header.
   */
  readonly windowId: string | undefined;
  /** The id exactly as the record carries it, in whichever live spelling. Resolved, never trusted. */
  readonly nodeId: string;
  /** ISO-8601, verbatim from the record. */
  readonly at: string;
  /** Which instrument shape saw it — reported as a denominator, never flattened away. */
  readonly surface: string;
}

/** One decision pointer offered to an agent inside one rendered candidate set. */
export interface DecisionOfferObservation {
  /** The pooled worktree slot the offer was rendered in. */
  readonly slotId: string;
  /** The candidate set this pointer was offered in — the unit an offer is counted per. */
  readonly candidateSetId: string;
  /** The id exactly as offered, in whichever live spelling. */
  readonly nodeId: string;
  /** ISO-8601, verbatim. A follow can only be a read at or after this instant. */
  readonly at: string;
  /**
   * Whether the CLI FOLLOW MACHINERY could ever have recorded a `followed_edge` for this offer —
   * `classifyOfferObservability`'s verdict, computed by the caller from the REAL allowlist and
   * injected, never restated here.
   *
   * IT IS A DENOMINATOR, NOT A DEFECT COUNT, and ADR-0312 settled that on 2026-08-05: a `doc:`-spelled
   * decision offer is never printed as a followable line, and making it one would render every
   * unanswered one `not-followed` — a declined branch nobody declined. ADR-0260's body records its own
   * "closing it is a candidate increment" expectation as WITHDRAWN. So it is measured, never fixed.
   *
   * THIS BASELINE'S FOLLOW IS NOT A `followed_edge`, WHICH IS WHY BOTH RATES ARE REPORTED. A follow
   * here is a READ of the offered decision in the same slot at or after the offer, recovered from the
   * read record — a route that exists for every spelling now that decision reads are captured at all,
   * and which therefore CAN see a follow of an offer the CLI machinery calls unobservable. Reporting
   * only the all-offers rate would ignore `decision-read-measurement-arc-inc-01`'s finding; reporting
   * only the observable-branch rate would discard most of what this instrument can genuinely see. Both
   * are printed, with the population each is over.
   */
  readonly observable: boolean;
}

/**
 * The decision log's SUPPORT graph, with the two edge populations kept APART.
 *
 * Never summed into one figure (ADR-0419 D1, the `never-sum` fence): they are traversed together
 * because both mean "rests on", and they are COUNTED separately because `amends` carries a read
 * obligation `dependsOn` does not, and the drain moves edges from the first to the second. A single
 * "support edges: N" figure would hide the entire migration it is meant to measure.
 */
export interface DecisionSupportGraph {
  /** Every decision number the log holds — the denominator that makes a zero reading legible. */
  readonly decisions: readonly number[];
  /** `amends` edges, as `from -> to` decision-number pairs. */
  readonly amends: readonly DecisionEdge[];
  /** A decision's own `dependsOn` edges that RESOLVE to another decision. */
  readonly dependsOn: readonly DecisionEdge[];
  /** Decision rows that arrived carrying the `dependsOn` FIELD at all — presence, not non-emptiness. */
  readonly decisionsCarryingDependsOn: number;
  /** `dependsOn` pointers on a decision that named something other than a decision. Not an error. */
  readonly dependsOnNonDecisionTargets: number;
}

export interface DecisionEdge {
  readonly from: number;
  readonly to: number;
}

export interface DecisionReadBaselineInput {
  readonly reads: readonly DecisionReadObservation[];
  readonly offers: readonly DecisionOfferObservation[];
  readonly support: DecisionSupportGraph;
  /** The declared observation window, inclusive, ISO-8601 — stated by the caller, never derived. */
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
}

// ---------------------------------------------------------------------------
// Id resolution — one door, and a census of what came through it
// ---------------------------------------------------------------------------

/**
 * PURE and TOTAL: the decision number an OBSERVED id names, or null when it names something else.
 *
 * DELEGATES to `resolveDecisionId` (`@storytree/context-traversal-transcript`) rather than restating
 * any spelling, and that is not tidiness. `decision-read-measurement-arc-inc-01` (PR #1570) measured
 * what a RAW-STRING join costs on the live population: **31 of 3,391 (0.9%) against 1,098 of 3,391
 * (32.4%)** once both sides resolve to a decision number — a ~35x under-count that reports no error
 * and prints as a confident, low follow rate. The corpus therefore keeps ONE resolution point
 * (ADR-0403 dec 7), and a baseline that grew a second copy would agree with itself whatever the
 * corpus did.
 */
export function decisionNumberOfObservedId(id: string): number | null {
  return resolveDecisionId(id)?.number ?? null;
}

/** PURE: which spelling an observed id used, or null when it names no decision. */
export function observedIdSpelling(id: string): DecisionIdSpelling | null {
  return resolveDecisionId(id)?.spelling ?? null;
}

/** A resolver a caller may substitute in a test. The production one is {@link decisionNumberOfObservedId}. */
export type DecisionIdResolver = (id: string) => number | null;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** One decision's reach, at one grain. */
export interface ReachRow {
  readonly decision: number;
  /** DISTINCT sessions that read it — the rank key. */
  readonly sessions: number;
  /** Raw reads, reported beside the rank key so the two can be compared, never as the rank key. */
  readonly reads: number;
}

/** One bucket of the chain-depth distribution: `sessions` sessions walked `depth` decisions deep. */
export interface ChainDepthBucket {
  readonly depth: number;
  readonly sessions: number;
}

/** The chain-depth reading at ONE grain. Both grains are computed; neither is hidden. */
export interface ChainDepthReading {
  readonly grain: SessionGrain;
  /** Sessions of this grain that this reading could identify at all — the outer denominator. */
  readonly sessionsIdentified: number;
  /** Of those, the ones that read at least one decision — the population the distribution is over. */
  readonly sessionsWithAnyDecisionRead: number;
  /** Of those, the ones whose read set contains at least one support EDGE (depth >= 2). THE NUMBER. */
  readonly sessionsWalkingAChain: number;
  /** The distribution, ascending by depth. Never reduced to a mean — see the header. */
  readonly histogram: readonly ChainDepthBucket[];
  /** The deepest single sitting observed, and whose it was. */
  readonly maxDepth: number;
  readonly deepestSessionId: string | null;
  /** The decisions on that deepest chain, in path order — so the claim can be checked by hand. */
  readonly deepestChain: readonly number[];
}

/** The offer-to-follow reading for one decision. */
export interface OfferFollowRow {
  readonly decision: number;
  /** Candidate sets this decision was offered in. */
  readonly offered: number;
  /** Of those offers, the ones followed by a read in the same slot at or after the offer. */
  readonly followed: number;
}

export interface DecisionReadBaseline {
  /** The declared window, echoed, and what was actually observed inside it. */
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
  readonly observedFrom: string | undefined;
  readonly observedTo: string | undefined;

  // --- denominators of the SUBJECT ---
  /** Decisions in the log. Zero means the graph was invisible, never a log that holds none. */
  readonly decisionsInLog: number;
  /** The two support edge populations, counted apart and NEVER summed (ADR-0419 D1). */
  readonly amendsEdges: number;
  readonly dependsOnEdges: number;
  readonly decisionsCarryingDependsOn: number;
  readonly dependsOnNonDecisionTargets: number;

  // --- denominators of the INSTRUMENT ---
  /** Read records handed in, before any resolution. */
  readonly readsObserved: number;
  /** Of those, the ones whose id resolved to a decision. The rest are counted, never dropped silently. */
  readonly readsResolved: number;
  readonly readsUnresolved: number;
  /** Reads whose id resolved to a number the decision log does not hold — a real, reportable state. */
  readonly readsOntoUnknownDecisions: number;
  /** Read id spellings, by spelling — the census that makes the join auditable. */
  readonly readSpellings: readonly SpellingCount[];
  /** Reads by instrument surface — which shape saw them. */
  readonly readSurfaces: readonly SurfaceCount[];
  /** Reads carrying a host window id, and reads carrying none. Both, always. */
  readonly readsWithWindowId: number;
  readonly readsWithoutWindowId: number;

  // --- REACH ---
  readonly reachByWindow: readonly ReachRow[];
  readonly reachBySlot: readonly ReachRow[];
  /** Distinct decisions read by at least one session, at each grain. */
  readonly decisionsReachedByWindow: number;
  readonly decisionsReachedBySlot: number;
  /** Decisions the log holds that NO observed session read. The other half of reach. */
  readonly decisionsNeverRead: number;

  // --- CHAIN DEPTH ---
  readonly chainDepthByWindow: ChainDepthReading;
  readonly chainDepthBySlot: ChainDepthReading;
  /**
   * How much the identity axis was worth on this number: slot-grained sessions per window-grained
   * session, over the sessions that read a decision. Null when either grain identified none.
   */
  readonly poolingFactor: number | null;

  // --- OFFER-TO-FOLLOW ---
  /** Offer records handed in, before resolution. */
  readonly offersObserved: number;
  readonly offersResolved: number;
  readonly offersUnresolved: number;
  /** Offer id spellings — the other side of the join, censused the same way. */
  readonly offerSpellings: readonly SpellingCount[];
  /** Distinct decisions offered at least once. */
  readonly decisionsOffered: number;
  /** Resolved offers followed by a read in the same slot at or after the offer. */
  readonly offersFollowed: number;
  /**
   * The SAME two figures restricted to the offers the CLI follow machinery could ever have recorded a
   * follow for — ADR-0312's rule, which `decision-read-measurement-arc-inc-01` states as: a decision
   * offer-to-follow rate must be reported over the OBSERVABLE branches, never over the offered ones.
   * Reported ALONGSIDE the all-offers pair rather than instead of it — see
   * {@link DecisionOfferObservation.observable} for why neither alone is honest here.
   */
  readonly offersObservable: number;
  readonly offersObservableFollowed: number;
  /** Decisions offered at least once and never read by any session — NOISE, not heat. */
  readonly decisionsOfferedNeverFollowed: number;
  readonly offerFollowRows: readonly OfferFollowRow[];

  /** Empty means every number above measured its subject; each entry names one that did not. */
  readonly vacuity: readonly string[];
}

export interface SpellingCount {
  readonly spelling: DecisionIdSpelling;
  readonly reads: number;
}

export interface SurfaceCount {
  readonly surface: string;
  readonly reads: number;
}

// ---------------------------------------------------------------------------
// The support graph, as an adjacency the chain walk can use
// ---------------------------------------------------------------------------

/**
 * PURE: the adjacency the chain walk traverses — BOTH support edges together (ADR-0419 D1), because
 * both mean "rests on" and the walk was widened to read both the day Decision 1 landed.
 *
 * TRAVERSING BOTH IS NOT SUMMING BOTH. The fence forbids reporting one blended edge FIGURE, and the
 * baseline reports `amendsEdges` and `dependsOnEdges` on their own lines for exactly that reason.
 * What it must not do is measure chain depth on `amends` alone: ADR-0419's own Consequences say a
 * chain-depth figure taken before the walk read both fields is NOT the same series as one taken
 * after, so an `amends`-only baseline would be split across two definitions and worthless as a prior
 * the moment the drain moved its first edge.
 *
 * `supersedes` reaches this function by no path at all: {@link DecisionSupportGraph} has no field for
 * it, which is `decision-amends-seam.ts`'s type fence reused rather than restated in a comment.
 */
export function supportAdjacency(support: DecisionSupportGraph): ReadonlyMap<number, readonly number[]> {
  const adjacency = new Map<number, number[]>();
  for (const edge of [...support.amends, ...support.dependsOn]) {
    const existing = adjacency.get(edge.from);
    if (existing === undefined) adjacency.set(edge.from, [edge.to]);
    else if (!existing.includes(edge.to)) existing.push(edge.to);
  }
  return adjacency;
}

/** A cycle in the support graph — thrown rather than truncated, so a loop can never read as a depth. */
export class SupportGraphCycleError extends Error {
  constructor(readonly loop: readonly number[]) {
    super(
      `the decision support graph contains a CYCLE: ${loop.map((n) => `ADR-${String(n).padStart(4, "0")}`).join(" -> ")}. ` +
        "Chain depth is undefined over a cyclic graph, so no baseline is taken. `pnpm probe:adr-graph` " +
        "proves acyclicity across the whole log and is where this should be diagnosed.",
    );
    this.name = "SupportGraphCycleError";
  }
}

/**
 * PURE: the longest chain, in NODES, that lies wholly inside `readSet`, and the path itself.
 *
 * THE INDUCED SUBGRAPH IS THE POINT. A session that read ADR-0139 and ADR-0402 where the first amends
 * the second walked a chain of 2; a session that read two unrelated decisions walked two chains of 1.
 * Only edges whose BOTH ends were read count, because an edge the session never crossed is not a
 * chain it walked — and that is what makes this number evidence about behaviour rather than about the
 * corpus's shape, which `probe:depth-from-work` already measures.
 *
 * Three-colour marking, and a cycle THROWS naming the loop rather than truncating — `probe:adr-graph`'s
 * discipline, reused. A truncated walk returns a plausible smaller number and nothing says so.
 */
export function longestReadChain(
  readSet: ReadonlySet<number>,
  adjacency: ReadonlyMap<number, readonly number[]>,
): { readonly depth: number; readonly path: readonly number[] } {
  if (readSet.size === 0) return { depth: 0, path: [] };

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<number, number>();
  const best = new Map<number, readonly number[]>();
  const stack: number[] = [];

  const visit = (node: number): readonly number[] => {
    const seen = colour.get(node) ?? WHITE;
    if (seen === BLACK) return best.get(node) ?? [node];
    if (seen === GREY) {
      const from = stack.indexOf(node);
      throw new SupportGraphCycleError([...stack.slice(from === -1 ? 0 : from), node]);
    }
    colour.set(node, GREY);
    stack.push(node);

    let longest: readonly number[] = [node];
    for (const next of adjacency.get(node) ?? []) {
      if (!readSet.has(next)) continue;
      const candidate = visit(next);
      if (candidate.length + 1 > longest.length) longest = [node, ...candidate];
    }

    stack.pop();
    colour.set(node, BLACK);
    best.set(node, longest);
    return longest;
  };

  let winner: readonly number[] = [];
  // Sorted so the reported deepest chain is deterministic when several tie — a frozen baseline that
  // named a different equally-deep chain on each run would read as drift.
  for (const node of [...readSet].sort((a, b) => a - b)) {
    const path = visit(node);
    if (path.length > winner.length) winner = path;
  }
  return { depth: winner.length, path: winner };
}

// ---------------------------------------------------------------------------
// The baseline
// ---------------------------------------------------------------------------

/** How many DISTINCT sessions must be missing before an empty reading is called vacuous. */
const VACUOUS_FLOOR = 1;

/**
 * PURE: is this instant inside the declared window, both bounds INCLUSIVE.
 *
 * Exported so `amends-reach.ts` filters its BEFORE and AFTER arms by the same rule this baseline
 * filtered by, rather than growing a second copy. That is the same reason `probe-decision-gather.ts`
 * exists one file over: these instruments are COMPARED AGAINST EACH OTHER across sessions, and an
 * arm that windowed even slightly differently from the frozen baseline would be compared to a number
 * nobody ever measured.
 */
export function withinWindow(at: string, from: string | undefined, to: string | undefined): boolean {
  if (from !== undefined && at < from) return false;
  if (to !== undefined && at > to) return false;
  return true;
}

function countBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function chainDepthAt(
  grain: SessionGrain,
  sessions: ReadonlyMap<string, ReadonlySet<number>>,
  sessionsIdentified: number,
  adjacency: ReadonlyMap<number, readonly number[]>,
): ChainDepthReading {
  const buckets = new Map<number, number>();
  let maxDepth = 0;
  let deepestSessionId: string | null = null;
  let deepestChain: readonly number[] = [];
  let walking = 0;

  // Sorted for determinism: a frozen baseline must name the same deepest sitting on every run.
  for (const sessionId of [...sessions.keys()].sort()) {
    const { depth, path } = longestReadChain(sessions.get(sessionId) ?? new Set(), adjacency);
    buckets.set(depth, (buckets.get(depth) ?? 0) + 1);
    if (depth >= 2) walking += 1;
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestSessionId = sessionId;
      deepestChain = path;
    }
  }

  return {
    grain,
    sessionsIdentified,
    sessionsWithAnyDecisionRead: sessions.size,
    sessionsWalkingAChain: walking,
    histogram: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, count]) => ({ depth, sessions: count })),
    maxDepth,
    deepestSessionId,
    deepestChain,
  };
}

/**
 * PURE: the whole baseline, from injected observations. Throws only {@link SupportGraphCycleError} —
 * a cyclic support graph makes chain depth undefined, and a probe that reported a number anyway would
 * be exactly the confident-wrong-answer this arc exists to stop producing.
 */
export function computeDecisionReadBaseline(
  input: DecisionReadBaselineInput,
  resolve: DecisionIdResolver = decisionNumberOfObservedId,
): DecisionReadBaseline {
  const { support, declaredFrom, declaredTo } = input;

  const reads = input.reads.filter((read) => withinWindow(read.at, declaredFrom, declaredTo));
  const offers = input.offers.filter((offer) => withinWindow(offer.at, declaredFrom, declaredTo));

  const known = new Set(support.decisions);
  const adjacency = supportAdjacency(support);

  // --- resolve the reads, counting every decline ---
  interface ResolvedRead extends DecisionReadObservation {
    readonly decision: number;
  }
  const resolvedReads: ResolvedRead[] = [];
  let readsUnresolved = 0;
  let readsOntoUnknownDecisions = 0;
  for (const read of reads) {
    const decision = resolve(read.nodeId);
    if (decision === null) {
      readsUnresolved += 1;
      continue;
    }
    // A read of a decision the log does not hold is REPORTED, not dropped and not counted as reach:
    // it is how a deleted or renumbered decision would show up, and silence would hide it.
    if (!known.has(decision)) readsOntoUnknownDecisions += 1;
    resolvedReads.push({ ...read, decision });
  }

  // --- resolve the offers the same way ---
  interface ResolvedOffer extends DecisionOfferObservation {
    readonly decision: number;
  }
  const resolvedOffers: ResolvedOffer[] = [];
  let offersUnresolved = 0;
  for (const offer of offers) {
    const decision = resolve(offer.nodeId);
    if (decision === null) {
      offersUnresolved += 1;
      continue;
    }
    resolvedOffers.push({ ...offer, decision });
  }

  // --- REACH, at both grains ---
  const reach = (keyOf: (read: ResolvedRead) => string | undefined): ReachRow[] => {
    const sessionsPer = new Map<number, Set<string>>();
    const readsPer = new Map<number, number>();
    for (const read of resolvedReads) {
      if (!known.has(read.decision)) continue;
      const key = keyOf(read);
      if (key === undefined) continue;
      const set = sessionsPer.get(read.decision) ?? new Set<string>();
      set.add(key);
      sessionsPer.set(read.decision, set);
      readsPer.set(read.decision, (readsPer.get(read.decision) ?? 0) + 1);
    }
    return [...sessionsPer.entries()]
      .map(([decision, set]) => ({ decision, sessions: set.size, reads: readsPer.get(decision) ?? 0 }))
      // Ranked by DISTINCT SESSIONS, with the decision number as a deterministic tiebreak — never by
      // raw reads, which is the whole point of the rank key.
      .sort((a, b) => b.sessions - a.sessions || b.reads - a.reads || a.decision - b.decision);
  };

  const reachByWindow = reach((read) => read.windowId);
  const reachBySlot = reach((read) => read.slotId);

  // --- CHAIN DEPTH, at both grains ---
  const readSets = (keyOf: (read: ResolvedRead) => string | undefined): Map<string, Set<number>> => {
    const sets = new Map<string, Set<number>>();
    for (const read of resolvedReads) {
      if (!known.has(read.decision)) continue;
      const key = keyOf(read);
      if (key === undefined) continue;
      const set = sets.get(key) ?? new Set<number>();
      set.add(read.decision);
      sets.set(key, set);
    }
    return sets;
  };

  const windowSets = readSets((read) => read.windowId);
  const slotSets = readSets((read) => read.slotId);
  const windowsIdentified = new Set(
    reads.map((read) => read.windowId).filter((id): id is string => id !== undefined),
  ).size;
  const slotsIdentified = new Set(reads.map((read) => read.slotId)).size;

  const chainDepthByWindow = chainDepthAt("window", windowSets, windowsIdentified, adjacency);
  const chainDepthBySlot = chainDepthAt("slot", slotSets, slotsIdentified, adjacency);
  const poolingFactor =
    windowSets.size > 0 && slotSets.size > 0
      ? Number((windowSets.size / slotSets.size).toFixed(3))
      : null;

  // --- OFFER-TO-FOLLOW ---
  // A FOLLOW is a read of that decision, IN THE SAME SLOT, at or after the offer. The slot is the
  // grain because that is the only grain BOTH sides carry: an offer is written by the live CLI
  // observer and a read may have been recovered from a transcript, so a window-grained join would
  // silently drop every crossing pair and report a follow rate far below the truth.
  const readsBySlotDecision = new Map<string, string[]>();
  for (const read of resolvedReads) {
    const key = `${read.slotId}::${read.decision}`;
    const list = readsBySlotDecision.get(key) ?? [];
    list.push(read.at);
    readsBySlotDecision.set(key, list);
  }
  const offeredPer = new Map<number, number>();
  const followedPer = new Map<number, number>();
  let offersFollowed = 0;
  let offersObservable = 0;
  let offersObservableFollowed = 0;
  for (const offer of resolvedOffers) {
    offeredPer.set(offer.decision, (offeredPer.get(offer.decision) ?? 0) + 1);
    if (offer.observable) offersObservable += 1;
    const reads_ = readsBySlotDecision.get(`${offer.slotId}::${offer.decision}`) ?? [];
    if (reads_.some((at) => at >= offer.at)) {
      followedPer.set(offer.decision, (followedPer.get(offer.decision) ?? 0) + 1);
      offersFollowed += 1;
      if (offer.observable) offersObservableFollowed += 1;
    }
  }
  const offerFollowRows: OfferFollowRow[] = [...offeredPer.entries()]
    .map(([decision, offered]) => ({ decision, offered, followed: followedPer.get(decision) ?? 0 }))
    .sort((a, b) => b.offered - a.offered || a.decision - b.decision);
  const decisionsOfferedNeverFollowed = offerFollowRows.filter((row) => row.followed === 0).length;

  // --- censuses ---
  const spellings = (ids: readonly string[]): SpellingCount[] => {
    const counts = countBy(
      ids.map((id) => observedIdSpelling(id)).filter((s): s is DecisionIdSpelling => s !== null),
      (s) => s,
    );
    return [...counts.entries()]
      .map(([spelling, reads_]) => ({ spelling, reads: reads_ }))
      .sort((a, b) => b.reads - a.reads || a.spelling.localeCompare(b.spelling));
  };
  const surfaceCounts = countBy(reads, (read) => read.surface);

  const timestamps = [...reads.map((r) => r.at), ...offers.map((o) => o.at)].sort();

  const baseline: DecisionReadBaseline = {
    declaredFrom,
    declaredTo,
    observedFrom: timestamps[0],
    observedTo: timestamps[timestamps.length - 1],

    decisionsInLog: support.decisions.length,
    amendsEdges: support.amends.length,
    dependsOnEdges: support.dependsOn.length,
    decisionsCarryingDependsOn: support.decisionsCarryingDependsOn,
    dependsOnNonDecisionTargets: support.dependsOnNonDecisionTargets,

    readsObserved: reads.length,
    readsResolved: resolvedReads.length,
    readsUnresolved,
    readsOntoUnknownDecisions,
    readSpellings: spellings(reads.map((read) => read.nodeId)),
    readSurfaces: [...surfaceCounts.entries()]
      .map(([surface, reads_]) => ({ surface, reads: reads_ }))
      .sort((a, b) => b.reads - a.reads || a.surface.localeCompare(b.surface)),
    readsWithWindowId: reads.filter((read) => read.windowId !== undefined).length,
    readsWithoutWindowId: reads.filter((read) => read.windowId === undefined).length,

    reachByWindow,
    reachBySlot,
    decisionsReachedByWindow: reachByWindow.length,
    decisionsReachedBySlot: reachBySlot.length,
    decisionsNeverRead:
      support.decisions.length - new Set(reachBySlot.map((row) => row.decision)).size,

    chainDepthByWindow,
    chainDepthBySlot,
    poolingFactor,

    offersObserved: offers.length,
    offersResolved: resolvedOffers.length,
    offersUnresolved,
    offerSpellings: spellings(offers.map((offer) => offer.nodeId)),
    decisionsOffered: offeredPer.size,
    offersFollowed,
    offersObservable,
    offersObservableFollowed,
    decisionsOfferedNeverFollowed,
    offerFollowRows,

    vacuity: [],
  };

  return { ...baseline, vacuity: decisionReadBaselineVacuity(baseline) };
}

/**
 * PURE: the ways this baseline could be a set of numbers that measured nothing. EMPTY means every
 * figure saw its subject; each entry names one that did not, with its remedy implied.
 *
 * **ASK WHAT INPUT WOULD MAKE THIS FIRE.** A baseline over an unreachable decision log reports a
 * chain depth of 0 and a follow rate of 0 — the same figures a corpus nobody consults would produce —
 * and freezing that as the arc's prior would falsify the edge-rollup hypothesis on the strength of a
 * broken instrument. Reasons rather than a boolean, because the causes have different remedies:
 * `decisionWalkVacuity`'s discipline, reused rather than re-derived.
 */
export function decisionReadBaselineVacuity(baseline: DecisionReadBaseline): readonly string[] {
  const reasons: string[] = [];

  if (baseline.decisionsInLog === 0) {
    reasons.push(
      "the decision log resolved to 0 decisions, so REACH, CHAIN DEPTH and OFFER-TO-FOLLOW are all " +
        "arithmetic over an empty subject — an unmigrated or unreachable store, never a log that holds none",
    );
  }

  // BOTH support edges, ANDed and never summed (ADR-0419 D1). An `amends`-only emptiness test would
  // declare a fully-drained log vacuous exactly as the drain succeeded — the mirror of the failure
  // this function exists to catch, arriving precisely as the work landed.
  if (baseline.decisionsInLog > 0 && baseline.amendsEdges === 0 && baseline.dependsOnEdges === 0) {
    reasons.push(
      `${baseline.decisionsInLog} decisions carry 0 resolvable \`amends\` edges and 0 resolvable ` +
        "`dependsOn` edges (the two support edges, counted apart and never summed — ADR-0419 D1), so " +
        "no read set can contain an edge and CHAIN DEPTH can only ever report 1",
    );
  }

  if (baseline.readsObserved === 0) {
    reasons.push(
      "0 decision reads were observed at all, so REACH and CHAIN DEPTH measured nothing — this is an " +
        "instrument reading, not a finding about how sessions behave (`pnpm probe:decision-reads` is " +
        "the ingest that fills the record, and it has its own blindness verdict)",
    );
  } else if (baseline.readsResolved === 0) {
    reasons.push(
      `${baseline.readsObserved} reads were observed and NONE resolved to a decision number, so the ` +
        "id spellings on the read side are ones this resolver does not know — the pointer-spelling " +
        "regression `decision-pointer.ts` exists to prevent, wearing a new coat",
    );
  }

  if (baseline.chainDepthByWindow.sessionsIdentified < VACUOUS_FLOOR) {
    reasons.push(
      "no read carried a host context window id, so CHAIN DEPTH at window grain measured nothing and " +
        "only the slot-grained figure exists — which pools several sittings into one and is inflated " +
        "in a direction nothing downstream can correct for",
    );
  }

  if (baseline.offersObserved === 0) {
    reasons.push(
      "0 decision offers were recorded, so OFFER-TO-FOLLOW measured nothing — a follow rate of 0 here " +
        "means the offer record was empty, never that agents ignore what they are offered",
    );
  } else if (baseline.offersResolved === 0) {
    reasons.push(
      `${baseline.offersObserved} offers were recorded and NONE resolved to a decision number, so the ` +
        "offer side of the join is blind and any follow rate computed from it is meaningless",
    );
  }

  return reasons;
}
