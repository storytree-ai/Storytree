/**
 * PURE: the DECISION DISCOVERY reading — decision-read figures held against their FROZEN reference,
 * so that a factory change made on instinct can be told it made discovery worse (ADR-0444 D1/D2,
 * `decision-discovery-kpi-arc`).
 *
 * ## THE QUESTION IS DELIBERATELY THE WEAKER ONE
 *
 * "Did we make things WORSE?" — never "did we make things BETTER?" (D2). The weaker question needs
 * no matched arms, no attribution and no control set, which is exactly why it is answerable over the
 * whole corpus today when `decision-read-measurement-arc` spent weeks failing to answer the stronger
 * one. A figure HOLDING is a pass. A figure improving is reported and is welcome, and justifies no
 * work, because nothing here can show that any particular change caused it (D5).
 *
 * ## WHAT THIS IS BLIND TO, STATED SO A GREEN READING CANNOT BE OVER-READ
 *
 * A read is not comprehension. This sees that a session OPENED a decision, never that it understood
 * it or acted on it. Decision discovery is ONE axis of factory health and a narrow one — it cannot
 * see correctness, cost, or whether the decisions being found are the right ones. A green section
 * means "this did not get worse", never "agents are fine", and {@link BLINDNESS} is rendered with
 * every reading rather than left to a reader's memory.
 *
 * ## THREE GATES, IN THIS ORDER, AND THE ORDER IS THE WHOLE GUARD
 *
 * COMPARABILITY, then POWER, then DIRECTION. Reverse any pair and the report finds a direction first
 * and then looks for a reason to believe it.
 *
 *   1. COMPARABILITY — is this figure the same measurement over this window as it was over the
 *      reference window? A figure that is not rate-normalised against window LENGTH is not, and must
 *      refuse (ADR-0316 D2). Chain depth is a per-window rate and passes by construction; reach is
 *      cumulative and passes only when both of its axes are pinned. See {@link reachComparability}.
 *   2. POWER — could this window have detected the smallest fall we declared worth detecting, at the
 *      floor set by the LEAST sensitive figure in the same report? See {@link reportWideFloor}.
 *   3. DIRECTION — only now may a figure say it fell, held or improved.
 *
 * ## THE FLOOR IS IN WINDOW UNITS, AND REACH'S ARM IS NOT — SO REACH IS FENCED SOMEWHERE ELSE
 *
 * `minimumArm` is a count of CONTEXT WINDOWS, and reach's arm is a count of DECISIONS. A maximum
 * taken across those is not a floor, it is a number, so reach's comparison is handed no floor at all
 * and its Bernoulli sizing (6 decisions to resolve a halving from 89.4%, against an arm fixed at
 * 414) never binds. What fences reach instead is its COMPARABILITY gate, which demands the full 401
 * context windows — 13.8x the 29 chain depth needs. That is why reach cannot speak over a thinner
 * window than its sibling: whenever reach is comparable, chain depth is powered by construction,
 * because both count the same population of windows. Pinned by a test rather than left as an
 * argument in a comment.
 *
 * ## WHICH FIGURES ALARM TODAY, AND WHY THE OTHERS DO NOT
 *
 * CHAIN DEPTH alarms. It is a PER-WINDOW rate by construction — "of the context windows that read a
 * decision, what share walked a support chain" — so it means the same thing over two days as over
 * eleven weeks, and it is computed from host transcripts, an append-only record that reproduces
 * byte-for-byte. It is the only one of the four that is both window-comparable and sitting on a
 * stable substrate, which is why it is the one the rail rests on today.
 *
 * REACH ALARMS TOO SINCE `-inc-02`, AND ONLY BECAUSE BOTH OF ITS AXES ARE NOW PINNED. It is
 * CUMULATIVE COVERAGE rather than a rate — "how many of the log's decisions were read by at least
 * one window in this window" — so it is comparable only against a reading matched on the two things
 * coverage is a function of, and it refuses unless BOTH hold:
 *
 *   - **HOW MANY WINDOWS LOOKED.** Fewer windows can only ever cover fewer decisions, so a
 *     time-sliced reach falls mechanically as the window shortens with no change in discovery at
 *     all: modelled against the reference's own shape, a 20-window sample reads 11.4% against a
 *     reference of 89.4%. The fix is the increment's own — slice by a trailing fixed COUNT of
 *     context windows, N = the reference's own 401 ({@link trailingWindowSlice}) — and the reason it
 *     had to be a refusal rather than a caveat is that the Bernoulli power check cannot catch this:
 *     reach's arm is the 414 DECISIONS rather than the windows, so an arm of 414 clears every floor
 *     while measuring something else entirely. Left unpinned it would have printed a catastrophic
 *     TRIPWIRE on every run for months, and a red that measures nothing teaches a reader to ignore
 *     the instrument.
 *   - **HOW MANY DECISIONS THERE WERE TO COVER.** This one is NOT in the increment's body — it was
 *     found while building it, and it is the same fault one axis over. Reach's denominator is the
 *     decision log, and the log GROWS: 414 at the freeze, 464 on 2026-08-28. Read against a live
 *     denominator, the same 370 decisions being found reads as 79.7% against a reference of 89.4%,
 *     which is outside the reference's own interval and would have fired a TRIPWIRE on the day the
 *     slice landed — a fall manufactured by DECIDING MORE THINGS. So the denominator is pinned to
 *     the {@link reachCohort}: the {@link FROZEN_DECISIONS_IN_LOG} lowest-numbered decisions in the
 *     current log, which are the oldest, because the store's allocator reserves numbers strictly
 *     ascending (ADR-0050). Both arms are then over one fixed population of 414.
 *
 * WHAT THE PINNED COHORT COSTS, stated because it is a real blind spot and not a technicality: reach
 * now says NOTHING about whether decisions made AFTER the freeze are being found, and it cannot tell
 * "harder to find" apart from "deliberately consolidated away" (ADR-0139's consolidation pass exists
 * to shrink the set worth reading, and would show here as a fall). The cohort's highest number is
 * printed with every reading so the population it names is auditable rather than assumed.
 *
 * ⚠ WHAT THIS COSTS IN WALL CLOCK, AND THE ONE REPAIR THAT IS NOT ALLOWED. The slice needs 401
 * context windows accumulated SINCE the freeze, on the machine doing the reading. On 2026-08-28 this
 * machine carried 17, so reach refuses today and will keep refusing for months — a figure that is in
 * the alarm and silent, not one that alarms. That is the honest state and it is why the refusal
 * prints its own distance ("17 of 401") rather than a bare word: it is a condition a reader can
 * watch, and it closes on its own.
 *
 * The tempting repair is to shorten the slice until the figure speaks. THAT IS THE FAULT THIS WHOLE
 * INCREMENT EXISTS TO PREVENT — a shorter slice against a 401-window reference reports a fall it
 * manufactured itself, which is the catastrophic false TRIPWIRE `-inc-01` found and refused to ship.
 * If the wait proves too long to be useful, the legitimate move is a DELIBERATE RE-FREEZE of the
 * reference at a smaller N, with its own increment and its own recorded reason (ADR-0444 D7) — both
 * arms moving together, never one of them. A reference that is quietly re-cut to fit the window
 * available can never show a regression, because the yardstick moves with the thing being measured.
 *
 * ALTITUDE is a NULL, not a rate. The frozen finding is that reads do NOT cluster by altitude, under
 * two independent classifiers. A null has no worse direction to move in, so it is reported with both
 * p-values and never alarmed. It is not recomputed either — its own probe needs a committed label
 * file and a prior baseline JSON, and re-deriving a null to print it unchanged would buy nothing.
 *
 * OFFER-TO-FOLLOW is RETIRED, and the distinction from DEFERRED is the whole point. It was deferred
 * for a substrate reason — the only figure joining against the TRAVERSAL TRACE STORE, whose identity
 * semantics were repaired ONE DAY before this reference was frozen. ADR-0464 then deleted the
 * citation-derived offer surface itself (D1), so the figure lost its SUBJECT rather than its
 * stability, and D7 removed it without re-freezing: there are no offers to follow, so there is
 * nothing to re-baseline and nothing to compare across. It reaches this file by no path at all — the
 * section computes no offer figure, and the trace store is never read.
 */
import {
  compareAmendsReach,
  sessionsToDetect,
  type AmendsReachComparison,
} from "./amends-reach.js";
import {
  computeDecisionReadBaseline,
  trailingWindowSlice,
  withinWindow,
} from "./decision-read-baseline.js";

import type {
  DecisionReadBaseline,
  DecisionReadObservation,
  DecisionSupportGraph,
} from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// The frozen reference
// ---------------------------------------------------------------------------

/**
 * WORLD: the reference this section is read against, frozen 2026-08-23 and re-frozen ONLY as a
 * deliberate act with its own increment and its own recorded reason (ADR-0444 D7).
 *
 * The reason that rule exists is worth restating where the constants are, because recomputing them
 * would look tidier: a reference re-derived from the current corpus can never show a regression,
 * because the yardstick moves with the thing being measured. These are therefore LITERALS, and a
 * disagreement between them and a fresh `probe:decision-baseline` run over the same window means one
 * of the two instruments has drifted — a finding, never a number to quietly update.
 *
 * Source: `docs/research/decision-read-baseline-2026-08-23.md` §1 (window, denominators) and §2
 * (chain depth). The altitude p-values come from its companion,
 * `docs/research/decision-altitude-2026-08-23.md`, because §7 of the baseline says outright that it
 * decides nothing about altitude.
 */
export const REFERENCE_DECLARED_FROM = "2026-06-08T00:00:00.000Z";
/** @see REFERENCE_DECLARED_FROM */
export const REFERENCE_DECLARED_TO = "2026-08-23T00:00:00.000Z";

/** §2: context windows that read at least one decision — the chain-depth denominator. */
export const FROZEN_WINDOWS_READING_A_DECISION = 401;
/** §2: of those, the ones that read two or more decisions on one support chain. 50.6%. */
export const FROZEN_WINDOWS_WALKING_A_CHAIN = 203;

/** §3: decisions in the log at the freeze — the reach denominator. Reported, never alarmed. */
export const FROZEN_DECISIONS_IN_LOG = 414;
/** §3: of those, the ones read by at least one context window. 89.4%. Reported, never alarmed. */
export const FROZEN_DECISIONS_REACHED = 370;

/**
 * The altitude NULL, under two independent classifiers. Reported, never alarmed.
 *
 * Pass A is the editorial labelling (Kruskal-Wallis H = 4.025, permutation over 20,000 shuffles);
 * Pass B is the committed deterministic lexical classifier (H = 0.133). Two classifiers that
 * disagree about everything except the conclusion is what makes the null worth carrying.
 */
export const FROZEN_ALTITUDE_P_EDITORIAL = 0.1322;
/** @see FROZEN_ALTITUDE_P_EDITORIAL */
export const FROZEN_ALTITUDE_P_LEXICAL = 0.9381;

/**
 * The smallest RELATIVE fall this section is sized to detect — a halving.
 *
 * A constant rather than a parameter, because a report-wide floor is only meaningful if every figure
 * in one reading was sized against the same effect. A caller free to vary it per run could tune the
 * floor until a figure spoke, which is the cherry-pick the gate ordering exists to prevent.
 */
export const DETECTABLE_FALL = 0.5;

/** Rendered with every reading (ADR-0444's Consequences): a narrow instrument that reads as broad. */
export const BLINDNESS =
  "blind to: comprehension, correctness, cost, and whether the decisions being found are the " +
  'right ones. A read is not comprehension. A green reading means "this did not get worse", ' +
  'never "agents are fine".';

/**
 * The standing explanation of what reach IS — printed with the figure whether it spoke or refused,
 * because a coverage figure read as a rate is mis-read in the same way every time.
 */
export const REACH_IS_COVERAGE =
  "REACH is cumulative COVERAGE, not a rate: it is a function of HOW MANY windows looked and HOW " +
  "MANY decisions there were to cover, never of how long the window was. So it is read over a " +
  `trailing fixed COUNT of ${String(FROZEN_WINDOWS_READING_A_DECISION)} context window(s) — the ` +
  "reference's own — against a denominator pinned to the " +
  `${String(FROZEN_DECISIONS_IN_LOG)} lowest-numbered (oldest) decisions in the log, so that neither ` +
  "a shorter window nor a longer decision log can manufacture a fall.";

/**
 * What reach is BLIND to once its denominator is pinned — printed with the figure, never inferred.
 *
 * Separate from {@link BLINDNESS} because it is a property of THIS figure's construction rather than
 * of the section, and a reader deciding whether to act on a reach tripwire needs it at the figure.
 */
export const REACH_COHORT_BLINDNESS =
  "Pinning the denominator costs two things, stated rather than discovered: reach says NOTHING " +
  "about whether decisions made AFTER the freeze are being found, and it cannot tell \"harder to " +
  'find" apart from "deliberately consolidated away" — ADR-0139\'s consolidation pass exists to ' +
  "shrink the set worth reading, and would show here as a fall.";

/** Why altitude carries no verdict, printed beside it rather than left to be inferred. */
export const ALTITUDE_IS_A_NULL =
  "ALTITUDE is not a rate. The frozen finding is a NULL — reads do not cluster by " +
  "strategic-vs-operational — under two independent classifiers. A null has no worse direction to " +
  "move in, so it is reported and never alarmed.";

/**
 * Why the fourth figure is absent, so its absence is a stated decision and not an oversight.
 *
 * CORRECTED IN PLACE 2026-08-28 (`-inc-02`). This said the figure was DEFERRED and would "rejoin as
 * its own increment once the traversal work has settled" — which ADR-0464 D7 has since made false in
 * both halves. The figure is RETIRED, and its subject is gone rather than moving: ADR-0464 D1 deleted
 * the citation-derived offer surface, so nothing records an offer to follow. A surface that kept
 * advertising a rejoin would be sending a future session to wait for a substrate to settle that has
 * instead been removed — which is how a worklist starts lying.
 */
export const OFFER_TO_FOLLOW_RETIRED =
  "OFFER-TO-FOLLOW is RETIRED, not missing and no longer deferred (ADR-0464 D7). Its subject is " +
  "gone: ADR-0464 D1 deleted the citation-derived offer surface — the follow-up block, the " +
  "`--from-offer` flag and the candidate-set recording — so there are no offers to follow and " +
  "nothing to re-freeze. It was NOT re-baselined first, deliberately, because re-freezing against a " +
  "substrate in motion is the failure ADR-0444 D7 forbids. CHAIN DEPTH is the surviving falsifier " +
  "for that deletion: it reads host transcripts, never the trace store, so if sessions stop finding " +
  "decisions they needed now that the offer surface is gone, it shows there.";

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

export type DecisionFigureKey = "chain-depth" | "reach";

/**
 * What a figure's arm COUNTS, carried so a refusal can name its own units.
 *
 * Not cosmetic: chain depth is short of CONTEXT WINDOWS and reach is short of DECISIONS, and a
 * refusal that said "this window carries 14 context windows" under a figure whose arm is decisions
 * would send a reader to accumulate the wrong thing.
 */
export type FigureArm = "context window" | "decision";

/**
 * What the reach figure is computed from — supplied by the caller, because every part of it needs
 * the world (the live decision log, and a second pass over this machine's transcripts).
 *
 * Kept out of {@link DecisionReadBaseline} deliberately. The baseline is a reading of ONE population
 * and knows nothing about references; reach needs a SECOND population (the trailing slice) held
 * against a THIRD (the frozen cohort), and folding that into the baseline would make every other
 * consumer of it carry this section's reference.
 */
export interface DecisionReachArm {
  /**
   * Every decision number the log holds. The cohort is the lowest {@link FROZEN_DECISIONS_IN_LOG} of
   * them — NUMBERS rather than a count, because the cohort must be an identifiable population a
   * reader can audit, not an arithmetic on two totals.
   */
  readonly decisionNumbers: readonly number[];
  /**
   * Context windows the declared window offered to slice from. Carried even when no slice was
   * formed, so the output can print the DISTANCE to the gate — "14 of 401" is a condition a reader
   * can watch, where a bare refusal is one they can only take on faith.
   */
  readonly windowsAvailable: number;
  /**
   * The trailing-count slice's own baseline, or NULL when this machine's history could not form one.
   * A baseline rather than a read list, so the slice's reach rows come from the SAME arithmetic the
   * unsliced reading uses and cannot drift from it.
   */
  readonly slice: DecisionReadBaseline | null;
}

/** The reach arm as it was actually read — every number the render needs, and no rate. */
export interface ReachArmReading {
  /** Context windows the reference carried; the count the slice must match EXACTLY. */
  readonly windowsRequired: number;
  /** Context windows available to slice from — printed either way. */
  readonly windowsAvailable: number;
  /** Windows the slice kept: `windowsRequired`, or 0 when none could be formed. */
  readonly windowsKept: number;
  /** The SLICE's own observed extent — never the declared window's, which it sits inside. */
  readonly observedFrom: string | undefined;
  readonly observedTo: string | undefined;
  /** Decisions in the pinned cohort, and the highest number in it — the population, auditable. */
  readonly cohortDecisions: number;
  readonly cohortHighestNumber: number | null;
  /** Of the cohort, how many the slice's windows read. NULL when the figure never spoke. */
  readonly cohortReached: number | null;
}

/**
 * What one figure is entitled to say about this window.
 *
 * The three refusing states are NOT interchangeable and are never collapsed into one "no data" flag:
 * `not-comparable` means the measurement does not mean the same thing here, `underpowered` means it
 * does but this window is too small, and each has a different remedy.
 */
export type FigureStatus = "tripwire" | "holds" | "improved" | "underpowered" | "not-comparable";

export interface DecisionDiscoveryFigure {
  readonly key: DecisionFigureKey;
  readonly label: string;
  /** What this figure's arm counts — so a refusal names the right units. */
  readonly arm: FigureArm;
  /** Is this figure in the alarm at all? False means REPORTED-ONLY — see the header. */
  readonly alarmed: boolean;
  /**
   * The proportion comparison, frozen reference as the BEFORE arm and this window as the AFTER arm.
   * NULL when the figure refused at the comparability gate, because a comparison that does not mean
   * the same thing on both sides is not a weak comparison — it is not one.
   *
   * `compareAmendsReach` is a generic proportion comparison carrying the name of its first caller;
   * nothing in its input or output is `amends`-shaped (`measure` is a free string). Reusing it is
   * deliberate: a second copy of the power-before-direction ordering is a second chance to get that
   * ordering wrong, and it is the one piece here that must not be re-derived.
   */
  readonly comparison: AmendsReachComparison | null;
  /** This window's rate, or NULL when the figure never reached the point of having one to report. */
  readonly currentRate: number | null;
  /** The frozen reference rate, always available — it is a literal. */
  readonly referenceRate: number;
  /**
   * The movement against the reference in percentage points, or NULL when this window could not
   * support one.
   *
   * NULLABLE BY DESIGN, and the type is the guard (ADR-0444 D6). A mean of zero over zero
   * observations is zero by convention; subtracting that from a real figure manufactures a
   * full-record fall out of nobody having looked, which is what `depth -1.00` was on the closing
   * arc. `number | null` moves that obligation off a reviewer's attention and onto the compiler.
   */
  readonly movement: number | null;
  readonly status: FigureStatus;
  /** The condition that failed, when the figure refused. NULL when it did not. */
  readonly condition: string | null;
}

export interface DecisionDiscoveryReading {
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
  readonly observedFrom: string | undefined;
  readonly observedTo: string | undefined;

  /** What this window actually carried — printed with every figure (ADR-0316 D2). */
  readonly windowsReadingADecision: number;
  readonly readsResolved: number;
  readonly decisionsInLog: number;

  readonly figures: readonly DecisionDiscoveryFigure[];

  /** How the reach figure was read — its slice, its cohort, and the distance to its gate. */
  readonly reachArm: ReachArmReading;

  /**
   * The floor every ALARMED figure had to clear before any of them could return a direction — the
   * largest per-figure sizing among them. See {@link reportWideFloor}.
   */
  readonly minimumArm: number;
  /** Did any alarmed figure return a direction? False means the whole alarm is silent this run. */
  readonly powered: boolean;
  /**
   * Why this reading measured nothing at all, if it did not. EMPTY is the healthy case.
   *
   * Reasons rather than a boolean, for the reason `decisionReadBaselineVacuity` gives: causes with
   * different remedies must not collapse into one flag a caller reports as "no data".
   */
  readonly refusals: readonly string[];

  readonly altitudePEditorial: number;
  readonly altitudePLexical: number;
}

/**
 * PURE: the reach COHORT — the {@link FROZEN_DECISIONS_IN_LOG} lowest-numbered decisions the log
 * holds, ascending.
 *
 * ## WHY THE LOWEST NUMBERS ARE THE RIGHT POPULATION, AND NOT MERELY A CONVENIENT ONE
 *
 * The store's ADR allocator reserves numbers STRICTLY ASCENDING and atomically (ADR-0050), so a
 * decision's number is a total order on when it was decided. The 414 lowest-numbered decisions in
 * today's log are therefore the 414 OLDEST — which is the population the reference measured, without
 * needing a historical census nobody took. Verified on 2026-08-28: the 414th lowest is 0421 and the
 * 415th is 0422, so the cohort is exactly "decisions numbered at or below 421", 414 of them, with
 * the seven unallocated numbers in the range accounted for.
 *
 * ⚠ THE ONE ASSUMPTION, AND WHY IT IS AUDITABLE RATHER THAN HIDDEN: if a decision were ever REMOVED
 * from the log, the cohort would silently extend past 421 and admit a post-freeze decision. Nothing
 * here can detect that from today's log alone — so the cohort's highest number is REPORTED with
 * every reading ({@link ReachArmReading.cohortHighestNumber}). A reader who sees it climb knows the
 * population moved, which is the difference between a stated assumption and an unstated one.
 *
 * Returns SHORT of the frozen count when the log holds fewer — the caller refuses on that, rather
 * than this silently returning a smaller cohort that would read as a full one.
 */
export function reachCohort(decisionNumbers: readonly number[]): readonly number[] {
  // Stryker disable next-line all: KILLED EVERYWHERE, NAMEABLE ONLY LOCALLY — a runner defect, not a
  // coverage gap, and disabled here rather than left to red every CI run on a line whose behaviour
  // IS tested. `check:mutation-diff` kills every mutant on this line in both environments; on CI it
  // then reports them UNPROVEN, whose own wording is "killed, but the report named no test". That is
  // Defect B of `docs/research/stryker-bun-attribution-2026-08-26.md`: the bun runner derives the
  // dry-run's test names from the Inspector Protocol (absolute sandbox paths) and the mutant run's
  // from the run output (relative paths), so `resolveKilledBy` discards a killer it has already
  // found. The vendored patch repairs the common case by suffix-matching and deliberately resolves
  // NOTHING when a name is ambiguous, which is the arm this line lands in — it is exercised by most
  // of the section's tests at once, so every killer's name arrives unresolvable together.
  //
  // What holds the behaviour instead, and why this is not a hole: `reachCohort` is directly tested
  // for the ordering these mutants break — that the cohort is the LOWEST-numbered decisions, that a
  // growing log cannot manufacture a fall, and that post-freeze decisions cannot flatter reach. Any
  // of those reds if this sort changes. Revisit when the plugin's attribution is fixed upstream.
  return [...decisionNumbers].sort((a, b) => a - b).slice(0, FROZEN_DECISIONS_IN_LOG);
}

/**
 * PURE: GATE 1 for reach — is this reading the same measurement the reference took?
 *
 * Returns NULL when it is, or the failed condition when it is not. Both axes are checked and the
 * FIRST failure is named with its own numbers, because "not comparable" without the distance to the
 * gate is a refusal a reader can only take on faith; "14 of 401" is one they can watch.
 *
 * Decided per MEASURE, here, and never per run: a figure that could declare itself incomparable when
 * a window went against it would be a cherry-pick wearing a refusal's clothes.
 */
export function reachComparability(input: {
  readonly windowsAvailable: number;
  readonly windowsKept: number;
  readonly cohortDecisions: number;
}): string | null {
  if (input.cohortDecisions < FROZEN_DECISIONS_IN_LOG) {
    return (
      `the decision log holds ${String(input.cohortDecisions)} decision(s); the frozen cohort needs ` +
      `${String(FROZEN_DECISIONS_IN_LOG)}, so the population the reference measured cannot be formed`
    );
  }
  if (input.windowsKept !== FROZEN_WINDOWS_READING_A_DECISION) {
    return (
      `this machine's history carries ${String(input.windowsAvailable)} context window(s) that read ` +
      `a decision since the freeze; reach is read over a trailing ${String(FROZEN_WINDOWS_READING_A_DECISION)}, ` +
      "the reference's own count, and a shorter slice would report a fall it manufactured itself"
    );
  }
  return null;
}

/**
 * PURE: the report-wide power floor — the largest per-figure sizing across the ALARMED figures in
 * one reading, so no figure returns a direction until the window could carry the least sensitive of
 * them.
 *
 * ## WHY A PER-FIGURE SIZING IS NOT ENOUGH
 *
 * `sessionsToDetect` falls as a base rate moves away from 50%, so a HIGH-base-rate figure sizes
 * itself cheaply: at 89.4% a halving is a 44.7-point effect that SIX observations resolve, against
 * 29 for a figure sitting at 50.6%. Left unfloored, the cheap figure returns a confident direction
 * beside an underpowered sibling — and beside a quiet sibling, that one line becomes the whole
 * finding and is the number a reader quotes.
 *
 * The floor costs a true positive on the cheap figure. It buys the removal of the ability to
 * cherry-pick whichever figure this window happens to be big enough for, which is the error that
 * actually gets published.
 *
 * ## IT IS COMPUTED OVER THE ALARMED SET ONLY, AND THAT IS NOT A LOOPHOLE
 *
 * A figure that refused at the COMPARABILITY gate contributes no sizing, because its sizing would be
 * in different units — reach's arm is decisions, chain depth's is context windows — and a maximum
 * taken across mixed units is not a floor, it is a number. The guard against a figure escaping the
 * floor by declaring itself incomparable is that comparability is a property of the measure, decided
 * once in this file with its reason stated, and never per run.
 */
export function reportWideFloor(baseRates: readonly number[]): number {
  const sizings = baseRates
    .map((rate) => sessionsToDetect(rate, rate * (1 - DETECTABLE_FALL)))
    .filter((n) => Number.isFinite(n));
  return sizings.length === 0 ? 0 : Math.max(...sizings);
}

/**
 * PURE: why this reading measured nothing, or an empty list when it measured something.
 *
 * ## THIS IS DELIBERATELY *NOT* `decisionReadBaselineVacuity`, AND THE DIFFERENCE IS LOAD-BEARING
 *
 * That function reports two OFFER-side reasons — `offersObserved === 0` and `offersResolved === 0`.
 * This section computes no offer figure at all (see the header), so it is handed an offer population
 * of zero BY CONSTRUCTION on every run. Reusing the shared check wholesale would make this section
 * report itself vacuous forever while looking maximally careful — and a refusal that fires on every
 * input is indistinguishable from an instrument that never worked.
 *
 * So the offer pair is dropped and every other reason is kept, checked against the same fields in
 * the same way. Pinned by a test: an offer-free baseline must NOT be vacuous here.
 */
export function decisionDiscoveryRefusals(baseline: DecisionReadBaseline): readonly string[] {
  const reasons: string[] = [];
  if (baseline.decisionsInLog === 0) {
    reasons.push("the decision log read as EMPTY — the subject was invisible, not absent");
  } else if (baseline.amendsEdges === 0 && baseline.dependsOnEdges === 0) {
    // ANDed, never `amends`-alone: the two support populations are counted apart (ADR-0419 D1) and a
    // migration that empties one while filling the other is not a blind reader.
    reasons.push("both support-edge populations read as empty — a chain cannot be walked");
  }
  if (baseline.readsObserved === 0) {
    reasons.push("no decision reads were observed in this window");
  } else if (baseline.readsResolved === 0) {
    reasons.push("no observed read resolved to a decision in the log");
  }
  if (baseline.chainDepthByWindow.sessionsIdentified === 0) {
    reasons.push("no read carried a context-window id — chain depth has no sittings to count");
  }
  return reasons;
}

/**
 * PURE: hold a freshly computed baseline against the frozen reference.
 *
 * One function rather than a figure-shaped loop a caller assembles, because the GATE ORDERING is the
 * guard: comparability, then power over the whole report, then direction. A caller free to reorder
 * them could find a direction and then look for a reason to believe it.
 */
export function computeDecisionDiscovery(
  baseline: DecisionReadBaseline,
  reach: DecisionReachArm,
): DecisionDiscoveryReading {
  const refusals = decisionDiscoveryRefusals(baseline);
  const measuredNothing = refusals.length > 0;
  const chain = baseline.chainDepthByWindow;

  // GATE 1 — COMPARABILITY, per figure. Chain depth is a per-window RATE and passes by construction.
  // Reach is cumulative and is checked on both of the axes coverage is a function of.
  const cohort = reachCohort(reach.decisionNumbers);
  const cohortSet = new Set(cohort);
  const slice = reach.slice;
  const windowsKept = slice?.chainDepthByWindow.sessionsWithAnyDecisionRead ?? 0;
  const reachFailed = reachComparability({
    windowsAvailable: reach.windowsAvailable,
    windowsKept,
    cohortDecisions: cohort.length,
  });

  // GATE 2 — POWER, in CONTEXT WINDOWS, over the alarmed figures whose arm is counted in them.
  //
  // Reach contributes its COMPARABILITY requirement rather than a Bernoulli sizing, and the two
  // terms are deliberately not mixed by `reportWideFloor`: one is derived from a base rate and one
  // is the reference's own window count, and both are windows. When reach is not comparable it
  // contributes nothing, so chain depth keeps the 29-window floor it alarms at today; when reach IS
  // comparable there are at least 401 windows by construction, so nothing is silenced either way.
  const minimumArm = Math.max(
    reportWideFloor([FROZEN_WINDOWS_WALKING_A_CHAIN / FROZEN_WINDOWS_READING_A_DECISION]),
    reachFailed === null ? FROZEN_WINDOWS_READING_A_DECISION : 0,
  );

  const chainFigure = alarmedFigure({
    key: "chain-depth",
    label: "chain depth",
    arm: "context window",
    beforeCount: FROZEN_WINDOWS_WALKING_A_CHAIN,
    beforeTotal: FROZEN_WINDOWS_READING_A_DECISION,
    afterCount: chain.sessionsWalkingAChain,
    afterTotal: chain.sessionsWithAnyDecisionRead,
    minimumArm,
    measuredNothing,
  });

  // REACH — alarmed since `-inc-02`, over the trailing slice and the pinned cohort. It is handed NO
  // floor: `minimumArm` counts context windows and this arm counts decisions (see the header), and
  // its window requirement was already enforced at the comparability gate above.
  const cohortReached =
    slice === null ? null : slice.reachByWindow.filter((row) => cohortSet.has(row.decision)).length;

  const reachFigure: DecisionDiscoveryFigure =
    // Stryker disable next-line ConditionalExpression: the THIRD disjunct is unreachable on its own
    // and is a TYPE NARROWING, not a runtime guard. `cohortReached` is null exactly when `slice` is
    // null; a null slice makes `windowsKept` 0; and 0 is not 401, so `reachComparability` has
    // already returned non-null and the FIRST disjunct fired. It stays because it is what proves to
    // the compiler that `cohortReached` is a number in the else branch, which is a fence worth more
    // than the mutant it costs.
    reachFailed !== null || measuredNothing || cohortReached === null
      ? {
          key: "reach",
          label: "reach",
          arm: "decision",
          alarmed: true,
          comparison: null,
          // NO RATE when the figure refused. A number printed beside a reference it cannot be
          // compared to WILL be compared to it, whatever the next line says.
          currentRate: null,
          referenceRate: FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG,
          movement: null,
          status: measuredNothing && reachFailed === null ? "underpowered" : "not-comparable",
          condition: reachFailed ?? "this reading measured nothing — see the refusals above",
        }
      : alarmedFigure({
          key: "reach",
          label: "reach",
          arm: "decision",
          beforeCount: FROZEN_DECISIONS_REACHED,
          beforeTotal: FROZEN_DECISIONS_IN_LOG,
          afterCount: cohortReached,
          afterTotal: cohort.length,
          minimumArm: 0,
          measuredNothing,
        });

  const figures = [chainFigure, reachFigure];
  return {
    declaredFrom: baseline.declaredFrom,
    declaredTo: baseline.declaredTo,
    observedFrom: baseline.observedFrom,
    observedTo: baseline.observedTo,
    windowsReadingADecision: chain.sessionsWithAnyDecisionRead,
    readsResolved: baseline.readsResolved,
    decisionsInLog: baseline.decisionsInLog,
    figures,
    reachArm: {
      windowsRequired: FROZEN_WINDOWS_READING_A_DECISION,
      windowsAvailable: reach.windowsAvailable,
      windowsKept,
      observedFrom: slice?.observedFrom,
      observedTo: slice?.observedTo,
      cohortDecisions: cohort.length,
      // `?? null` alone, with no length check in front of it: `cohort[-1]` on an empty cohort is
      // already `undefined`, so an emptiness branch here would be a second spelling of the same
      // answer — and a branch whose two arms agree is a mutant no test can ever kill.
      cohortHighestNumber: cohort[cohort.length - 1] ?? null,
      // "the figure SPOKE" is exactly `movement !== null` (see `alarmedFigure`, and the refusing
      // branch above which sets it null), so it is asked once rather than by listing the three
      // speaking statuses — a list that has to be kept in sync with `FigureStatus` by hand.
      cohortReached: reachFigure.movement === null ? null : cohortReached,
    },
    minimumArm,
    powered: figures.some((f) => f.alarmed && f.movement !== null),
    refusals,
    altitudePEditorial: FROZEN_ALTITUDE_P_EDITORIAL,
    altitudePLexical: FROZEN_ALTITUDE_P_LEXICAL,
  };
}

/** GATE 2 and GATE 3 for one alarmed figure — power decided first, direction only after. */
function alarmedFigure(input: {
  readonly key: DecisionFigureKey;
  readonly label: string;
  readonly arm: FigureArm;
  readonly beforeCount: number;
  readonly beforeTotal: number;
  readonly afterCount: number;
  readonly afterTotal: number;
  readonly minimumArm: number;
  readonly measuredNothing: boolean;
}): DecisionDiscoveryFigure {
  const comparison = compareAmendsReach({
    measure: input.label,
    beforeCount: input.beforeCount,
    beforeTotal: input.beforeTotal,
    afterCount: input.afterCount,
    afterTotal: input.afterTotal,
    detectableFall: DETECTABLE_FALL,
    minimumArm: input.minimumArm,
  });

  const spoke = !input.measuredNothing && comparison.verdict !== "UNDERPOWERED";
  const status: FigureStatus = !spoke
    ? "underpowered"
    : comparison.verdict === "FALL"
      ? "tripwire"
      : comparison.verdict === "RISE"
        ? "improved"
        : "holds";

  return {
    key: input.key,
    label: input.label,
    arm: input.arm,
    alarmed: true,
    comparison,
    // A rate exists for any proportion, including one over an arm of zero — so it is reported only
    // once the figure has earned the right to be read as a measurement.
    currentRate: spoke ? comparison.after.rate : null,
    referenceRate: comparison.before.rate,
    // NULL unless a direction was actually returned. An UNDERPOWERED arm HAS a distance from the
    // reference, and printing it is exactly the reassuring number D2 refuses, dressed as arithmetic.
    movement: spoke ? (comparison.after.rate - comparison.before.rate) * 100 : null,
    status,
    condition: spoke
      ? null
      : `this window carries ${String(input.afterTotal)} ${input.arm}(s); ${String(Math.max(comparison.sessionsNeeded, input.minimumArm))} are needed to resolve a ${String(DETECTABLE_FALL * 100)}% relative fall from the reference`,
  };
}

// ---------------------------------------------------------------------------
// The composition — pure, so the two-arm assembly is not a thing only a live run executes
// ---------------------------------------------------------------------------

/**
 * PURE: assemble the whole reading from gathered reads and a support graph — BOTH arms, in one
 * place, so the assembly is testable without a disk or a database.
 *
 * ## WHY THIS IS NOT LEFT IN THE GATHERER
 *
 * It was, for exactly one gate run. The diff-scoped mutation rung then reported the entire two-arm
 * assembly as NO COVERAGE — no test reached it — because the gatherer sweeps this machine's
 * transcripts and dials the live store, so nothing credential-free can execute it, and the section's
 * own render tests stub the whole reader out. That is this repo's standing fault class arriving in
 * the one place it must not: the composition that produces every real reading, executed by nothing.
 * Splitting it out is the same pure/world line the rest of the section already draws.
 *
 * ## THE SLICE IS TAKEN INSIDE THE DECLARED WINDOW, AND THE FILTER ORDER IS WHAT MAKES THAT TRUE
 *
 * The declared window starts where the frozen reference ENDS, so a slice free to reach further back
 * would pull the reference's own context windows into the arm being compared against it — measuring
 * the reference against itself. `withinWindow` therefore runs FIRST and the trailing count is taken
 * from the survivors, never from the whole read population.
 *
 * ONE READ POPULATION, TWO PURE COMPUTES: both arms go through `computeDecisionReadBaseline`, so the
 * sliced arm cannot drift from the unsliced one — a second arithmetic would be a second experiment.
 */
export function composeDecisionDiscoveryReading(input: {
  readonly reads: readonly DecisionReadObservation[];
  readonly support: DecisionSupportGraph;
  readonly declaredFrom: string | undefined;
  readonly declaredTo: string | undefined;
}): DecisionDiscoveryReading {
  const { reads, support, declaredFrom, declaredTo } = input;
  const baseline = computeDecisionReadBaseline({ reads, support, declaredFrom, declaredTo });

  const inWindow = reads.filter((read) => withinWindow(read.at, declaredFrom, declaredTo));
  const slice = trailingWindowSlice({
    reads: inWindow,
    support,
    count: FROZEN_WINDOWS_READING_A_DECISION,
  });

  return computeDecisionDiscovery(baseline, {
    decisionNumbers: support.decisions,
    windowsAvailable: slice.windowsAvailable,
    slice:
      // Stryker disable next-line ConditionalExpression: EQUIVALENT, and worth saying why rather
      // than deleting. Computing the baseline anyway over a REFUSED slice produces a reading with
      // zero windows and an empty reach list, which drives every downstream branch exactly as the
      // null does — `windowsKept` is 0 either way, so the comparability gate refuses either way, and
      // `reachArm.observedFrom` is undefined either way. Nothing a caller can read distinguishes
      // them. The null is kept because it is the honest VALUE for "no slice was formed", and because
      // `DecisionReachArm.slice` is public: a caller constructing this arm by hand needs the shape
      // that says no slice exists, and the tests use it.
      slice.windowsKept === 0
        ? null
        : computeDecisionReadBaseline({
            reads: slice.reads,
            support,
            declaredFrom: slice.observedFrom,
            declaredTo: slice.observedTo,
          }),
  });
}
