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
 *      refuse (ADR-0316 D2). See {@link REACH_NOT_COMPARABLE}.
 *   2. POWER — could this window have detected the smallest fall we declared worth detecting, at the
 *      floor set by the LEAST sensitive figure in the same report? See {@link reportWideFloor}.
 *   3. DIRECTION — only now may a figure say it fell, held or improved.
 *
 * ## WHICH FIGURES ALARM TODAY, AND WHY THE OTHERS DO NOT
 *
 * CHAIN DEPTH alarms. It is a PER-WINDOW rate by construction — "of the context windows that read a
 * decision, what share walked a support chain" — so it means the same thing over two days as over
 * eleven weeks, and it is computed from host transcripts, an append-only record that reproduces
 * byte-for-byte. It is the only one of the four that is both window-comparable and sitting on a
 * stable substrate, which is why it is the one the rail rests on today.
 *
 * REACH is REPORTED and does not alarm, because it is CUMULATIVE COVERAGE rather than a rate:
 * "how many of the log's decisions were read by at least one window in this window". Fewer windows
 * can only ever cover fewer decisions, so it falls mechanically as the window shortens, with no
 * change in discovery at all. Modelled against the reference's own shape, a 20-window sample reads
 * 11.4% against a reference of 89.4% — and the Bernoulli power check does NOT catch it, because
 * reach's denominator is the 414 decisions rather than the windows, so an arm of 414 clears every
 * floor while measuring something else entirely. Left in the alarm it would have printed a
 * catastrophic TRIPWIRE on every run for months, which is worse than silence: a red that measures
 * nothing teaches a reader to ignore the instrument. See {@link REACH_NOT_COMPARABLE} for the
 * condition under which it rejoins.
 *
 * ALTITUDE is a NULL, not a rate. The frozen finding is that reads do NOT cluster by altitude, under
 * two independent classifiers. A null has no worse direction to move in, so it is reported with both
 * p-values and never alarmed. It is not recomputed either — its own probe needs a committed label
 * file and a prior baseline JSON, and re-deriving a null to print it unchanged would buy nothing.
 *
 * OFFER-TO-FOLLOW is DEFERRED, and the reason is substrate rather than preference: it is the only
 * figure joining against the TRAVERSAL TRACE STORE, keyed on worktree slot — the subsystem currently
 * being rebuilt. The trace instrument's identity semantics were repaired on 2026-08-22, ONE DAY
 * before this reference was frozen, and pre-repair traces are explicitly not retrofittable, so the
 * frozen 4.7% rests on a substrate that already moved once inside its own measurement window.
 * Re-freezing against a substrate still in motion is the failure D7 exists to forbid. It also never
 * reaches this file: the section computes no offer figure, so the trace store is never read at all.
 */
import {
  compareAmendsReach,
  sessionsToDetect,
  type AmendsReachComparison,
} from "./amends-reach.js";

import type { DecisionReadBaseline } from "./decision-read-baseline.js";

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

/** The named condition under which REACH stops refusing — printed beside it, never inferred. */
export const REACH_NOT_COMPARABLE =
  "REACH is cumulative COVERAGE, not a rate: fewer context windows can only cover fewer decisions, " +
  "so it falls as the window shortens with no change in discovery. It is comparable only against a " +
  "window carrying at least as many context windows as the reference did " +
  `(${String(FROZEN_WINDOWS_READING_A_DECISION)}). It rejoins the alarm when the reading is sliced ` +
  "by a trailing fixed COUNT of windows rather than by a fixed span of time.";

/** Why altitude carries no verdict, printed beside it rather than left to be inferred. */
export const ALTITUDE_IS_A_NULL =
  "ALTITUDE is not a rate. The frozen finding is a NULL — reads do not cluster by " +
  "strategic-vs-operational — under two independent classifiers. A null has no worse direction to " +
  "move in, so it is reported and never alarmed.";

/** Why the fourth figure is absent, so its absence is a stated decision and not an oversight. */
export const OFFER_TO_FOLLOW_DEFERRAL =
  "OFFER-TO-FOLLOW is deferred, not missing. It is the only figure joining against the traversal " +
  "trace store, whose identity semantics were repaired one day before this reference was frozen; " +
  "re-freezing it against a substrate still in motion is the failure ADR-0444 D7 forbids. It " +
  "rejoins as its own increment once the traversal work has settled.";

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

export type DecisionFigureKey = "chain-depth" | "reach";

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
export function computeDecisionDiscovery(baseline: DecisionReadBaseline): DecisionDiscoveryReading {
  const refusals = decisionDiscoveryRefusals(baseline);
  const measuredNothing = refusals.length > 0;
  const chain = baseline.chainDepthByWindow;

  // GATE 1 — COMPARABILITY. Decided per MEASURE, here, with its reason stated, and never per run:
  // a figure that could declare itself incomparable when a window went against it would be a
  // cherry-pick wearing a refusal's clothes.
  const reachComparable = chain.sessionsWithAnyDecisionRead >= FROZEN_WINDOWS_READING_A_DECISION;

  // GATE 2 — POWER, over the ALARMED figures only. Chain depth alone today, so this is a one-element
  // maximum; the machinery is what reach and offer-to-follow rejoin through, not scaffolding.
  const minimumArm = reportWideFloor([FROZEN_WINDOWS_WALKING_A_CHAIN / FROZEN_WINDOWS_READING_A_DECISION]);

  const chainFigure = alarmedFigure({
    key: "chain-depth",
    label: "chain depth",
    beforeCount: FROZEN_WINDOWS_WALKING_A_CHAIN,
    beforeTotal: FROZEN_WINDOWS_READING_A_DECISION,
    afterCount: chain.sessionsWalkingAChain,
    afterTotal: chain.sessionsWithAnyDecisionRead,
    minimumArm,
    measuredNothing,
  });

  // REACH — reported, never alarmed. It is given a rate to print only when the window is comparable,
  // because a number printed beside a reference it cannot be compared to WILL be compared to it.
  const reachFigure: DecisionDiscoveryFigure = {
    key: "reach",
    label: "reach",
    alarmed: false,
    comparison: null,
    currentRate:
      reachComparable && !measuredNothing && baseline.decisionsInLog > 0
        ? baseline.decisionsReachedByWindow / baseline.decisionsInLog
        : null,
    referenceRate: FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG,
    movement: null,
    status: "not-comparable",
    condition: REACH_NOT_COMPARABLE,
  };

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
      : `this window carries ${String(input.afterTotal)} context window(s); ${String(input.minimumArm)} are needed to resolve a ${String(DETECTABLE_FALL * 100)}% relative fall from the reference`,
  };
}
