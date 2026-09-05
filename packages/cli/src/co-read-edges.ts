/**
 * CO-READ EDGES — the relation nobody authored, observed rather than guessed.
 *
 * `follow-the-research-arc-inc-04`. Every traversal in this system follows an AUTHORED edge —
 * `library tree focus`, the depth walk, `adr list`'s back-edges, the calibrate-set closure — so all
 * of them are blind to the same thing: the decision that bears on your subject and that nobody
 * linked. The only existing answers, `library search` and `library related --unlinked`, rank by TEXT
 * SIMILARITY, which is a guess about relatedness.
 *
 * A CO-READ IS AN OBSERVATION INSTEAD OF A GUESS: two decisions read in one sitting were, by
 * someone's working judgment at the time, relevant to the same problem. The precedent is Hebbian
 * co-activation (HeLa-Mem, arXiv 2604.16839), where edge weight strengthens on co-retrieval — but
 * this module deliberately stops SHORT of weighting. See "what this does not do" below.
 *
 * PURE and TOTAL: no filesystem, no clock, no store, no `process.env`, no randomness. Every input is
 * injected by {@link import("./probe-co-read-edges.js")}, which is the half that reads transcripts.
 *
 * ## THE SESSION KEY IS `windowId`, AND `slotId` WOULD MANUFACTURE THE FINDING
 *
 * A pair is co-read when ONE CONTEXT WINDOW read both. It is emphatically NOT "one worktree slot",
 * because slots are POOLED — shared by a parent session, every subagent it spawns, and every later
 * session the pool hands the same slot to. `clever-mestorf-1041a3` alone hosted 11 parent sessions
 * over 15 days plus ~70 short ones plus 18 subagent windows. Keying on the slot would join decisions
 * read WEEKS APART BY DIFFERENT SESSIONS into a "co-read", and it would do so in the flattering
 * direction: it inflates exactly the number this module exists to report.
 *
 * Observations carrying no window id are therefore COUNTED AND DROPPED, never folded onto their
 * slot — the same posture `computeDecisionReadBaseline` takes, and for the same reason.
 *
 * ## IDS RESOLVE THROUGH THE ONE DOOR
 *
 * Callers pass a resolver ({@link decisionNumberOfObservedId}). A raw-string join was measured on
 * this population at **31 of 3,391 (0.9%)** against **1,098 of 3,391 (32.4%)** once both sides
 * resolve to a decision number — a ~35x under-count that reports no error and prints as a confident
 * low number (ADR-0403 dec 7). Nothing here re-implements a spelling.
 *
 * ## UNION FOR THE PREDICATE, APART FOR THE COUNTS
 *
 * "Is this pair already connected?" is a REACHABILITY question, so it is asked over `amends` ∪
 * `dependsOn` — the same union the baseline's chain walk uses, and for the same reason: both mean
 * "rests on". ADR-0419 D1's never-sum fence is about never REPORTING a summed edge count, and it is
 * honoured: {@link CoReadReading} carries the two populations' sizes separately and never adds them.
 *
 * ## ⚠ WHAT THIS DOES NOT DO, ON PURPOSE
 *
 * It does not weight, rank, decay or surface anything. A co-read edge is a HYPOTHESIS about
 * relatedness, not a relation — two decisions read in one sitting may share nothing but that
 * session's own wandering. Weighting is `-inc-06/07/08`, which ADR-0513 D6 requires to land as one
 * unit with its exposure-bias correction, precisely because a frequency-weighted edge on a corpus
 * that is 89% long tail reproduces the Matthew effect. This module reports; it does not promote.
 */

import type { DecisionEdge } from "./decision-read-baseline.js";

/** The read half this module needs — structurally a `DecisionReadObservation`, named by its use. */
export interface CoReadObservation {
  readonly windowId: string | undefined;
  readonly nodeId: string;
}

/** Resolves an observed id to a decision number, or null when it names something else. */
export type CoReadIdResolver = (id: string) => number | null;

/** One unordered pair of decisions observed in the same window at least once. */
export interface CoReadPair {
  /** The lower decision number — pairs are unordered and always stored `low, high`. */
  readonly low: number;
  readonly high: number;
  /** Distinct context windows that read BOTH. The only strength signal reported. */
  readonly windows: number;
  /** True when the support graph already connects them, in EITHER direction. */
  readonly authored: boolean;
}

/** What a co-read derivation found, with every denominator it rests on. */
export interface CoReadReading {
  /** Observations that carried a window id and resolved to a decision — the working population. */
  readonly resolvedReads: number;
  /** Carried a window id but named something that is not a decision. Expected, not an error. */
  readonly unresolvedReads: number;
  /** Carried NO window id. Counted and dropped — never folded onto a slot. */
  readonly readsWithoutWindow: number;
  /** Distinct windows holding at least one resolved decision read. */
  readonly windows: number;
  /** Windows that read two or more DISTINCT decisions — the only ones that can yield a pair. */
  readonly windowsYieldingPairs: number;
  /**
   * Pairs produced by the single most prolific window. Reported because pair count is QUADRATIC in
   * a window's distinct reads, so one long sitting can dominate the whole population — a reader who
   * cannot see this figure cannot tell a broad signal from one session's wandering.
   */
  readonly maxPairsFromOneWindow: number;
  /** Every distinct pair, descending by `windows` then ascending by `low`/`high` — total order. */
  readonly pairs: readonly CoReadPair[];
  /** Pairs the support graph already connects. */
  readonly authoredPairs: number;
  /** Pairs no authored edge reaches — the candidate discoveries. */
  readonly novelPairs: number;
  /** Novel pairs seen in more than one window — coincidence is far less likely here. */
  readonly novelPairsInMultipleWindows: number;
  /** Authored edges that were ever co-read, over the authored edges whose BOTH ends were read. */
  readonly authoredEdgesCoRead: number;
  readonly authoredEdgesWithBothEndsRead: number;
  /** Distinct decisions read at least once in some window — the universe pairs are drawn from. */
  readonly distinctDecisionsRead: number;
  /** Every pair that COULD have been observed, `n(n-1)/2` over {@link distinctDecisionsRead}. */
  readonly possiblePairs: number;
  /**
   * Authored edges a co-read set THIS DENSE would recover by chance alone.
   *
   * ⚠ WITHOUT THIS THE RECALL FIGURE IS UNREADABLE. "63.5% of authored edges were co-read" sounds
   * like a finding and is meaningless alone: if the observed pairs covered most of the possible
   * pairs, that recall would be arithmetic rather than evidence. This is the null the reader needs —
   * `authoredEdgesWithBothEndsRead × (pairs / possiblePairs)` — and the ratio of observed recall to
   * it is the whole claim.
   */
  readonly authoredCoReadExpectedByChance: number;
  /**
   * Novel pairs whose decision numbers are within {@link ADJACENCY_GAP} of each other.
   *
   * ⚠ THE CONFOUND THAT HAND INSPECTION FOUND. Consecutively numbered decisions are usually authored
   * in ONE sitting about ONE subject, so a session reading both has discovered nothing — the
   * numbering already said they were related. A novel-pair count that does not separate these
   * overstates what co-reading found.
   */
  readonly novelPairsNumericallyAdjacent: number;
  /** The two support populations, carried apart and never summed (ADR-0419 D1). */
  readonly amendsEdges: number;
  readonly dependsOnEdges: number;
}

/**
 * How close two decision numbers must be to count as "adjacent" for the confound above.
 *
 * Five, not one: decisions land in bursts, so a session settling one subject commonly allocates
 * several numbers with an unrelated decision or two interleaved from a concurrent session. A gap of
 * 1 would under-count the confound it exists to expose, which is the direction that flatters.
 */
export const ADJACENCY_GAP = 5;

/** Stable key for an unordered pair. */
const pairKey = (low: number, high: number): string => `${low}:${high}`;

/**
 * PURE: the undirected adjacency of `amends` ∪ `dependsOn`, as pair keys.
 *
 * Union is correct for the "already connected?" predicate — see the module header.
 */
export function authoredPairKeys(
  amends: readonly DecisionEdge[],
  dependsOn: readonly DecisionEdge[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const edge of [...amends, ...dependsOn]) {
    if (edge.from === edge.to) continue;
    const low = Math.min(edge.from, edge.to);
    const high = Math.max(edge.from, edge.to);
    keys.add(pairKey(low, high));
  }
  return keys;
}

/**
 * PURE and TOTAL: derive co-read pairs from observations and classify each against the support graph.
 *
 * TOTAL over an empty input: zero reads yields a reading whose every count is 0 and whose `pairs` is
 * empty. That is a legible answer ("nothing was observed"), never a throw — a probe over a machine
 * with no history must be able to say so.
 */
export function computeCoReadEdges(
  observations: readonly CoReadObservation[],
  amends: readonly DecisionEdge[],
  dependsOn: readonly DecisionEdge[],
  resolve: CoReadIdResolver,
): CoReadReading {
  const byWindow = new Map<string, Set<number>>();
  let resolvedReads = 0;
  let unresolvedReads = 0;
  let readsWithoutWindow = 0;

  for (const observation of observations) {
    if (observation.windowId === undefined) {
      readsWithoutWindow += 1;
      continue;
    }
    const decision = resolve(observation.nodeId);
    if (decision === null) {
      unresolvedReads += 1;
      continue;
    }
    resolvedReads += 1;
    const seen = byWindow.get(observation.windowId);
    if (seen === undefined) byWindow.set(observation.windowId, new Set([decision]));
    else seen.add(decision);
  }

  const authored = authoredPairKeys(amends, dependsOn);
  const counts = new Map<string, { low: number; high: number; windows: number }>();
  const readDecisions = new Set<number>();
  let windowsYieldingPairs = 0;
  let maxPairsFromOneWindow = 0;

  for (const decisions of byWindow.values()) {
    for (const decision of decisions) readDecisions.add(decision);
    if (decisions.size < 2) continue;
    windowsYieldingPairs += 1;
    // `Math.max` rather than `if (pairsHere > max) max = pairsHere`: for a running maximum, `>` and
    // `>=` are behaviourally IDENTICAL on every input, so that conditional carried a mutant no test
    // could ever kill. Removing the branch removes the un-killable mutant with it.
    maxPairsFromOneWindow = Math.max(
      maxPairsFromOneWindow,
      (decisions.size * (decisions.size - 1)) / 2,
    );

    // VALUE iteration, not index iteration. `forEach` hands `low` as a number and `slice` hands every
    // `high` as a number, so there is no indexed access to guard. The manual `for (let i …; let j …)`
    // form this replaces needed an `if (low === undefined) continue` that was DEAD BY CONSTRUCTION —
    // and a dead guard does not catch an off-by-one, it MASKS one: mutating `j < len` to `j <= len`
    // read past the end, hit the guard, and continued silently. Four surviving mutants and three
    // timeouts lived in those two lines; none of them survive this shape.
    const sorted = [...decisions].sort((a, b) => a - b);
    sorted.forEach((low, index) => {
      for (const high of sorted.slice(index + 1)) {
        const key = pairKey(low, high);
        const existing = counts.get(key);
        if (existing === undefined) counts.set(key, { low, high, windows: 1 });
        else existing.windows += 1;
      }
    });
  }

  const pairs: CoReadPair[] = [...counts.values()]
    .map((entry) => ({
      low: entry.low,
      high: entry.high,
      windows: entry.windows,
      authored: authored.has(pairKey(entry.low, entry.high)),
    }))
    // TOTAL ORDER, so the report is byte-stable across runs: strength, then the pair itself.
    .sort((a, b) => b.windows - a.windows || a.low - b.low || a.high - b.high);

  const authoredPairs = pairs.filter((pair) => pair.authored).length;
  const novel = pairs.filter((pair) => !pair.authored);

  // The authored-edge recall denominator: only edges whose BOTH ends were read could POSSIBLY have
  // been co-read, so scoring against every authored edge would report a low number that says
  // nothing about co-reading and everything about what went unread.
  let authoredEdgesWithBothEndsRead = 0;
  let authoredEdgesCoRead = 0;
  for (const key of authored) {
    const [lowText, highText] = key.split(":");
    const low = Number(lowText);
    const high = Number(highText);
    if (!readDecisions.has(low) || !readDecisions.has(high)) continue;
    authoredEdgesWithBothEndsRead += 1;
    if (counts.has(key)) authoredEdgesCoRead += 1;
  }

  const distinctDecisionsRead = readDecisions.size;
  // Guard at n < 2 rather than computing and correcting: with n = 0 the formula is (0 * -1) / 2,
  // which is NEGATIVE ZERO — equal to 0 under `==` and `===` but rendered as `-0`, so an empty
  // population would print a denominator that reads as a broken instrument.
  const possiblePairs =
    distinctDecisionsRead < 2 ? 0 : (distinctDecisionsRead * (distinctDecisionsRead - 1)) / 2;
  const density = possiblePairs === 0 ? 0 : pairs.length / possiblePairs;

  return {
    resolvedReads,
    unresolvedReads,
    readsWithoutWindow,
    windows: byWindow.size,
    windowsYieldingPairs,
    maxPairsFromOneWindow,
    pairs,
    authoredPairs,
    novelPairs: novel.length,
    novelPairsInMultipleWindows: novel.filter((pair) => pair.windows > 1).length,
    authoredEdgesCoRead,
    authoredEdgesWithBothEndsRead,
    distinctDecisionsRead,
    possiblePairs,
    authoredCoReadExpectedByChance: authoredEdgesWithBothEndsRead * density,
    novelPairsNumericallyAdjacent: novel.filter((pair) => pair.high - pair.low <= ADJACENCY_GAP).length,
    amendsEdges: amends.length,
    dependsOnEdges: dependsOn.length,
  };
}
