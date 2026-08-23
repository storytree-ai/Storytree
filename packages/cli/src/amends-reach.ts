/**
 * ADR-0419 Decision 5's own test, as arithmetic: **have reaches into amended decisions fallen** now
 * that every amended decision self-describes?
 *
 * PURE — no clock, no filesystem, no store. The world half is `probe-amends-reach.ts`.
 *
 * ## WHY THIS IS NOT `probe:depth-from-work`, WHICH IS THE INSTRUMENT D5 HAS BEEN READ AS NAMING
 *
 * `probe:depth-from-work` measures the CORPUS'S SHAPE — how deep the artifact graph runs from a work
 * anchor. It observes no reader at all, so it cannot see a reach rise or fall; it would report the
 * same figure if every agent stopped reading the decision log tomorrow. "Reach" is defined by this
 * arc's own frozen baseline (`docs/research/decision-read-baseline-2026-08-23.md` §3) as DISTINCT
 * SESSIONS THAT READ A DECISION, which is a fact about behaviour. This module measures that, over the
 * same populations the baseline froze, so the two are comparable rather than merely adjacent.
 *
 * ## "REACH INTO AN AMENDED DECISION" IS AMBIGUOUS, SO ALL THREE READINGS ARE REPORTED
 *
 * D5's sentence does not say which it means, and silently picking one is how a measurement gets to
 * choose its own answer. So:
 *
 *   - **PLAIN REACH** — sessions that read an amended decision at all. The baseline §3 sense.
 *   - **CROSSING** — sessions that read BOTH ends of an `amends` edge in one sitting. This is the
 *     induced-subgraph rule `longestReadChain` already uses, and over the frozen window it must
 *     reproduce the baseline's own chain figure, because `dependsOn` was empty then and the support
 *     graph WAS the amends graph. That reproduction is this module's calibration against the freeze.
 *   - **DIRECTION** — a crossing split by which end the session reached FIRST. This is the one that
 *     carries D5's mechanism: the annotation is written ON THE TARGET, so what it is supposed to
 *     remove is the reader who lands on an amended decision and is sent onward to its amender.
 *     A session that read the AMENDER first and then its target was never doing the thing the
 *     annotation discharges, and folding the two together would dilute exactly the signal being
 *     tested.
 *
 * ## AND THE COMPARISON REFUSES TO CALL A SMALL SAMPLE A FALL
 *
 * The intervention finished on the same day the baseline was frozen, so an AFTER arm taken soon after
 * rests on a handful of sessions. A raw percentage over eight sessions will happily print "reaches
 * halved" and mean nothing. {@link compareAmendsReach} therefore reports a Wilson interval on the
 * after arm and returns `UNDERPOWERED` unless the arm is large enough to have detected the fall it is
 * looking for — `INSUFFICIENT DATA` is a first-class verdict here, not a failure to reach one.
 */

import {
  decisionNumberOfObservedId,
  withinWindow,
  type DecisionIdResolver,
  type DecisionReadObservation,
  type DecisionSupportGraph,
  type SessionGrain,
} from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface AmendsReachInput {
  readonly reads: readonly DecisionReadObservation[];
  readonly support: DecisionSupportGraph;
  /** The declared arm bounds, INCLUSIVE, ISO-8601. Stated by the caller, never derived from the data. */
  readonly from: string | undefined;
  readonly to: string | undefined;
  /** Which session key a "distinct session" is. The baseline reports both; so does this. */
  readonly grain: SessionGrain;
}

/** How a session crossed one `amends` edge, by which end it reached first. */
export interface CrossingDirections {
  /**
   * The session read the AMENDED decision first, then its amender — the read D5's annotation is
   * written to remove. The load-bearing direction.
   */
  readonly amendedFirst: number;
  /** The session read the AMENDER first, then the decision it amends. Never what the annotation touches. */
  readonly amenderFirst: number;
  /** Both ends first seen at the same instant — one tool call naming two decisions. Neither direction. */
  readonly simultaneous: number;
}

export interface AmendsReachReading {
  readonly grain: SessionGrain;
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
  /** The first and last read actually observed inside the arm — the arm's REAL extent. */
  readonly observedFrom: string | undefined;
  readonly observedTo: string | undefined;

  /** Reads inside the arm that resolved to a decision the log holds. */
  readonly reads: number;
  /** Distinct sessions that read any decision — the denominator every rate below is over. */
  readonly sessionsReadingADecision: number;

  // --- PLAIN REACH ---
  /** Distinct sessions that read at least one AMENDED decision. */
  readonly sessionsReadingAnAmendedDecision: number;
  /** Distinct amended decisions read by at least one session. */
  readonly amendedDecisionsRead: number;
  /** Distinct unamended decisions read by at least one session — the contrast arm. */
  readonly unamendedDecisionsRead: number;
  /** Median distinct-session reach across amended decisions THAT WERE READ. */
  readonly amendedReachMedian: number;
  /** Median distinct-session reach across unamended decisions that were read. */
  readonly unamendedReachMedian: number;

  // --- CROSSING ---
  /** Distinct sessions that read both ends of at least one `amends` edge in one sitting. */
  readonly sessionsCrossingAnAmendsEdge: number;
  /** Distinct `amends` edges crossed by at least one session. */
  readonly amendsEdgesCrossed: number;
  /** (session, edge) pairs — one session crossing three edges counts three. */
  readonly amendsCrossings: number;
  /** The same pairs, split by which end the session reached first. */
  readonly directions: CrossingDirections;
  /**
   * Distinct sessions that crossed a `dependsOn` edge, reported beside the amends figure and NEVER
   * summed with it (ADR-0419 D1's never-sum fence). At the freeze this was structurally zero.
   */
  readonly sessionsCrossingADependsOnEdge: number;

  /** Reasons this reading measured nothing. Non-empty means no rate below may be quoted. */
  readonly vacuity: readonly string[];
}

/** The corpus's own shape at reading time — the denominators every rate above is against. */
export interface AmendsCorpusShape {
  readonly decisions: number;
  readonly amendsEdges: number;
  readonly dependsOnEdges: number;
  /** Distinct decisions that are the TARGET of at least one `amends` edge. */
  readonly amendedDecisions: number;
  /** Distinct decisions that are the SOURCE of at least one `amends` edge. */
  readonly amenderDecisions: number;
  readonly decisionsCarryingDependsOn: number;
}

export type ComparisonVerdict = "FALL" | "RISE" | "NO CHANGE" | "UNDERPOWERED";

export interface ProportionInterval {
  readonly rate: number;
  readonly low: number;
  readonly high: number;
}

export interface AmendsReachComparison {
  readonly measure: string;
  readonly before: ProportionInterval;
  readonly beforeCount: number;
  readonly beforeTotal: number;
  readonly after: ProportionInterval;
  readonly afterCount: number;
  readonly afterTotal: number;
  /**
   * The verdict. `UNDERPOWERED` when the after arm could not have detected the smallest fall the
   * caller declared worth detecting — reported BEFORE any direction, so a small sample can never
   * print as a result.
   */
  readonly verdict: ComparisonVerdict;
  /** Sessions the after arm would need to detect `detectableFall`, at the declared power. */
  readonly sessionsNeeded: number;
  /**
   * The floor the arm must ALSO clear, whatever this measure's own sizing says. See
   * {@link compareAmendsReach} for why a per-measure sizing alone is not enough.
   */
  readonly minimumArm: number;
  /** The relative fall this comparison was sized to detect, e.g. 0.5 for "a halving". */
  readonly detectableFall: number;
}

// ---------------------------------------------------------------------------
// Statistics — kept here so the render invents none
// ---------------------------------------------------------------------------

/** Two-sided 95% z. Named rather than inlined, because the sample-size formula reuses it. */
const Z_ALPHA = 1.959_963_985;
/** One-sided z for 80% power. */
const Z_BETA = 0.841_621_234;

/**
 * PURE: the Wilson score interval for a proportion, at 95%.
 *
 * Wilson rather than the normal approximation because the after arm is SMALL and near-degenerate
 * counts are exactly where the textbook interval returns bounds outside [0, 1] and reads as
 * confidence it does not have.
 */
export function wilsonInterval(successes: number, total: number): ProportionInterval {
  if (total <= 0) return { rate: 0, low: 0, high: 1 };
  const p = successes / total;
  const z2 = Z_ALPHA * Z_ALPHA;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const spread = (Z_ALPHA * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return {
    rate: p,
    low: Math.max(0, centre - spread),
    high: Math.min(1, centre + spread),
  };
}

/**
 * PURE: sessions the after arm needs to detect a fall from `baseRate` to `targetRate`, at 95%
 * two-sided significance and 80% power, treating the baseline as KNOWN.
 *
 * Treating it as known is honest here and not a shortcut: the before arm holds 401 sessions against
 * an after arm of a handful, so the pooled variance is dominated by the small side, and a two-sample
 * formula would return a barely different number while implying the before arm were as uncertain.
 */
export function sessionsToDetect(baseRate: number, targetRate: number): number {
  if (baseRate === targetRate) return Number.POSITIVE_INFINITY;
  const numerator =
    Z_ALPHA * Math.sqrt(baseRate * (1 - baseRate)) + Z_BETA * Math.sqrt(targetRate * (1 - targetRate));
  return Math.ceil((numerator * numerator) / ((targetRate - baseRate) * (targetRate - baseRate)));
}

/** PURE: the median of a list, 0 for an empty one. Averaged across the middle pair when even. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

// ---------------------------------------------------------------------------
// The corpus shape
// ---------------------------------------------------------------------------

/** PURE: the amended / amender populations, counted apart and never summed. */
export function amendsCorpusShape(support: DecisionSupportGraph): AmendsCorpusShape {
  const amended = new Set<number>();
  const amenders = new Set<number>();
  for (const edge of support.amends) {
    amended.add(edge.to);
    amenders.add(edge.from);
  }
  return {
    decisions: support.decisions.length,
    amendsEdges: support.amends.length,
    dependsOnEdges: support.dependsOn.length,
    amendedDecisions: amended.size,
    amenderDecisions: amenders.size,
    decisionsCarryingDependsOn: support.decisionsCarryingDependsOn,
  };
}

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

/** The earliest read of each decision, per session — the ordering the direction split rests on. */
interface SessionReads {
  readonly firstSeen: Map<number, string>;
}

/**
 * PURE: one arm of the measurement.
 *
 * A read of a decision the log does not hold is dropped from reach exactly as the baseline drops it,
 * so the two agree on their population. A read carrying no key at the requested grain is dropped and
 * is why `sessionsReadingADecision` is reported rather than assumed equal to the read count.
 */
export function computeAmendsReach(
  input: AmendsReachInput,
  resolve: DecisionIdResolver = decisionNumberOfObservedId,
): AmendsReachReading {
  const { support, grain, from, to } = input;
  const known = new Set(support.decisions);

  const amended = new Set<number>();
  for (const edge of support.amends) amended.add(edge.to);

  const sessions = new Map<string, SessionReads>();
  const reachSessions = new Map<number, Set<string>>();
  let reads = 0;
  let observedFrom: string | undefined;
  let observedTo: string | undefined;

  for (const read of input.reads) {
    if (!withinWindow(read.at, from, to)) continue;
    const decision = resolve(read.nodeId);
    if (decision === null || !known.has(decision)) continue;
    const key = grain === "window" ? read.windowId : read.slotId;
    if (key === undefined) continue;

    reads += 1;
    if (observedFrom === undefined || read.at < observedFrom) observedFrom = read.at;
    if (observedTo === undefined || read.at > observedTo) observedTo = read.at;

    const session = sessions.get(key) ?? { firstSeen: new Map<number, string>() };
    const seen = session.firstSeen.get(decision);
    if (seen === undefined || read.at < seen) session.firstSeen.set(decision, read.at);
    sessions.set(key, session);

    const reachers = reachSessions.get(decision) ?? new Set<string>();
    reachers.add(key);
    reachSessions.set(decision, reachers);
  }

  // --- plain reach ---
  let sessionsReadingAnAmendedDecision = 0;
  for (const session of sessions.values()) {
    for (const decision of session.firstSeen.keys()) {
      if (amended.has(decision)) {
        sessionsReadingAnAmendedDecision += 1;
        break;
      }
    }
  }

  const amendedReach: number[] = [];
  const unamendedReach: number[] = [];
  for (const [decision, readers] of reachSessions) {
    if (amended.has(decision)) amendedReach.push(readers.size);
    else unamendedReach.push(readers.size);
  }

  // --- crossings, and the direction each was walked ---
  const crossingSessions = new Set<string>();
  const edgesCrossed = new Set<string>();
  const directions = { amendedFirst: 0, amenderFirst: 0, simultaneous: 0 };
  let amendsCrossings = 0;

  for (const [key, session] of sessions) {
    for (const edge of support.amends) {
      const atAmender = session.firstSeen.get(edge.from);
      const atAmended = session.firstSeen.get(edge.to);
      if (atAmender === undefined || atAmended === undefined) continue;
      crossingSessions.add(key);
      edgesCrossed.add(`${edge.from}->${edge.to}`);
      amendsCrossings += 1;
      if (atAmended < atAmender) directions.amendedFirst += 1;
      else if (atAmender < atAmended) directions.amenderFirst += 1;
      else directions.simultaneous += 1;
    }
  }

  const dependsOnCrossingSessions = new Set<string>();
  for (const [key, session] of sessions) {
    for (const edge of support.dependsOn) {
      if (session.firstSeen.has(edge.from) && session.firstSeen.has(edge.to)) {
        dependsOnCrossingSessions.add(key);
        break;
      }
    }
  }

  const vacuity: string[] = [];
  if (support.decisions.length === 0) vacuity.push("the decision log holds no decisions");
  if (support.amends.length === 0) vacuity.push("the decision log holds no `amends` edges to reach across");
  if (reads === 0) vacuity.push("no decision read fell inside the declared window");
  if (sessions.size === 0) vacuity.push("no session in the window carried a key at the requested grain");

  return {
    grain,
    declaredFrom: from,
    declaredTo: to,
    observedFrom,
    observedTo,
    reads,
    sessionsReadingADecision: sessions.size,
    sessionsReadingAnAmendedDecision,
    amendedDecisionsRead: amendedReach.length,
    unamendedDecisionsRead: unamendedReach.length,
    amendedReachMedian: median(amendedReach),
    unamendedReachMedian: median(unamendedReach),
    sessionsCrossingAnAmendsEdge: crossingSessions.size,
    amendsEdgesCrossed: edgesCrossed.size,
    amendsCrossings,
    directions,
    sessionsCrossingADependsOnEdge: dependsOnCrossingSessions.size,
    vacuity,
  };
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

/**
 * PURE: compare one rate across the two arms, and REFUSE to call it if the after arm is too small.
 *
 * The order matters and is deliberate: power is decided BEFORE direction. A three-session after arm
 * that happens to contain no crossing yields a rate of 0.0 and a difference of fifty points, and any
 * reporting that computes the direction first will have already written "reaches fell to zero" before
 * the caveat arrives. So `UNDERPOWERED` short-circuits, and the direction is never computed for an
 * arm that could not have supported one.
 *
 * ## WHY A PER-MEASURE SIZING IS NOT ENOUGH, AND `minimumArm` EXISTS
 *
 * `sessionsNeeded` falls as the base rate moves away from 50%, so a HIGH-base-rate measure sizes
 * itself cheaply: a 50% relative fall from 89% is a 44-point absolute effect, and eight sessions
 * suffice to detect one. Left alone, that is a real trap rather than a hypothetical — the first run
 * of this probe called a genuine `FALL` on 5 of 8 sessions, off a Wilson bound that cleared the
 * baseline by two and a half points and would have flipped had a single session read differently.
 * Reported beside five `UNDERPOWERED` siblings, that one line is the whole finding, and it is the
 * one number a reader would quote.
 *
 * So the caller passes a floor — in practice the LARGEST `sessionsNeeded` across every comparison in
 * the same report — and no measure may return a direction until the arm could carry the least
 * sensitive of them. It costs a true positive on the cheap measures and removes the ability to
 * cherry-pick whichever measure the arm happens to be big enough for, which is the error that
 * actually gets published.
 */
export function compareAmendsReach(options: {
  readonly measure: string;
  readonly beforeCount: number;
  readonly beforeTotal: number;
  readonly afterCount: number;
  readonly afterTotal: number;
  /** The smallest RELATIVE fall worth detecting, e.g. 0.5 = "would have caught a halving". */
  readonly detectableFall: number;
  /** A floor on the after arm, whatever this measure's own sizing says. Defaults to no floor. */
  readonly minimumArm?: number;
}): AmendsReachComparison {
  const { measure, beforeCount, beforeTotal, afterCount, afterTotal, detectableFall } = options;
  const before = wilsonInterval(beforeCount, beforeTotal);
  const after = wilsonInterval(afterCount, afterTotal);

  const sessionsNeeded =
    beforeTotal === 0 ? Number.POSITIVE_INFINITY : sessionsToDetect(before.rate, before.rate * (1 - detectableFall));
  const minimumArm = options.minimumArm ?? 0;
  const required = Math.max(sessionsNeeded, minimumArm);

  const verdict: ComparisonVerdict =
    afterTotal < required
      ? "UNDERPOWERED"
      : after.high < before.rate
        ? "FALL"
        : after.low > before.rate
          ? "RISE"
          : "NO CHANGE";

  return {
    measure,
    before,
    beforeCount,
    beforeTotal,
    after,
    afterCount,
    afterTotal,
    verdict,
    sessionsNeeded,
    minimumArm,
    detectableFall,
  };
}
