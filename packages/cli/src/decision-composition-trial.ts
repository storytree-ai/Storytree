import {
  decisionNumberOfObservedId,
  longestReadChain,
  supportAdjacency,
  type DecisionIdResolver,
  type DecisionReadObservation,
  type DecisionSupportGraph,
} from "./decision-read-baseline.js";
import { ALTITUDE_CLASSES, type AltitudeClass } from "./decision-altitude.js";

/**
 * THE COMPOSITION TRIAL'S READING — DEPTH BY ALTITUDE, BY ARM (ADR-0428 D5).
 *
 * `decision-read-measurement-arc` / `compose-the-treated-arm-with-a-staleness-marker`.
 *
 * ## THE METRIC IS PROPORTIONALITY, NOT SHORTENING — and that is owner-directed
 *
 * *"we are not trying to universally shorten the agents walk, as a whole maybe but I imagine
 * sometimes it structurally makes sense for some things to take a while to reach."*
 *
 * A fall in MEAN CHAIN DEPTH is, from that number alone, indistinguishable from readers ceasing to
 * read what they needed. So this module never reports a single mean as the result. It reports depth
 * BY ALTITUDE, in each arm, using `probe:decision-altitude`'s committed classification — the question
 * being *did depth fall where the question was shallow, and HOLD where it was deep?* Same shape as
 * `the-gate-costs-what-the-change-risks-arc`: the walk costs what the question is worth.
 *
 * Two depths are reported per cell, and reporting only one would hide half the movement:
 *
 *   - DEPTH OVER READERS — every window that read the frontier, a window that read it alone counting
 *     as 1. This is the primary outcome, because a composed statement's success case is turning a
 *     walk into a single read, which only this denominator can see.
 *   - DEPTH OVER WALKERS — windows that went at least one record deeper. This separates "fewer walks"
 *     from "shallower walks", which are different behaviours with the same effect on the first number.
 *
 * ## THE ARMS ARE READ FROM THE FROZEN WRITE-UP, NEVER RE-DERIVED
 *
 * `docs/research/decision-composition-control-set-2026-08-23.md` is frozen as MEMBER LISTS rather
 * than as a rule for recomputing them (ADR-0428 D6), precisely so a later trial reports against these
 * names. The corpus has moved since the freeze — 416 decisions then, more now — so re-running
 * `probe:decision-control-set` produces a DIFFERENT experiment, not a refreshed one.
 *
 * {@link parseFrozenArms} therefore reads the committed table itself rather than holding a second
 * copy of the membership. A transcribed copy is a thing that can be transcribed wrongly and a thing
 * that can drift; the table is the record, so the record is what is parsed. It FAILS LOUD on a table
 * it cannot recognise, because a silently-empty arm would produce a beautifully-formatted reading of
 * nothing.
 *
 * ## WHAT THIS IS NOT
 *
 * NOT a gate rung, for `probe:decision-baseline`'s stated reason: its read half is a property of ONE
 * LAPTOP's transcript history, so nothing it prints is a repo invariant. And NOT a quality check over
 * composed statements — it measures reading behaviour and grades no prose (ADR-0428 D7 / ADR-0427).
 *
 * Pure: no filesystem, no store, no clock. The probe supplies the text, the reads and the graph.
 */

/** The frozen arm assignment, as the committed write-up records it. */
export interface FrozenArms {
  readonly treated: readonly number[];
  readonly control: readonly number[];
  /** The pairs in table order, so a later reading can report per-pair as well as per-arm. */
  readonly pairs: readonly FrozenPair[];
}

export interface FrozenPair {
  readonly rank: number;
  readonly treated: number;
  readonly control: number;
}

/** The committed write-up the arms are read from (repo-relative). */
export const FROZEN_ARMS_PATH = "docs/research/decision-composition-control-set-2026-08-23.md";

/** How many matched pairs the freeze recorded. A parse yielding any other count is refused. */
export const FROZEN_PAIR_COUNT = 54;

const ADR_CELL = /^ADR-(\d{4})$/;

/**
 * PURE: the frozen matched pairs, read out of the write-up's own table.
 *
 * FAIL-LOUD on anything it does not recognise. The failure this guards against is not a malformed
 * file — it is a file that parses to FEWER rows than it holds, which would quietly shrink an arm and
 * report a comparison nobody ran. So the pair count is asserted against {@link FROZEN_PAIR_COUNT},
 * and a decision appearing in both arms is refused outright.
 */
export function parseFrozenArms(markdown: string): FrozenArms {
  const pairs: FrozenPair[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    // A markdown row splits to ["", …cells…, ""]; the frozen table has 13 columns.
    if (cells.length !== 15) continue;
    const rank = Number(cells[1]);
    const treated = ADR_CELL.exec(cells[2] ?? "");
    const control = ADR_CELL.exec(cells[7] ?? "");
    if (!Number.isInteger(rank) || rank <= 0 || treated?.[1] === undefined || control?.[1] === undefined) {
      continue;
    }
    pairs.push({ rank, treated: Number(treated[1]), control: Number(control[1]) });
  }

  if (pairs.length !== FROZEN_PAIR_COUNT) {
    throw new Error(
      `${FROZEN_ARMS_PATH}: parsed ${pairs.length} matched pairs, expected ${FROZEN_PAIR_COUNT}. ` +
        "The frozen table is the instrument (ADR-0428 D6) — a partial parse would report a comparison " +
        "over an arm nobody assigned. Refused rather than measured.",
    );
  }
  const treated = pairs.map((p) => p.treated);
  const control = pairs.map((p) => p.control);
  const overlap = treated.filter((n) => control.includes(n));
  if (overlap.length > 0) {
    throw new Error(
      `${FROZEN_ARMS_PATH}: ${overlap.map((n) => `ADR-${String(n).padStart(4, "0")}`).join(", ")} ` +
        "appears in BOTH arms. The comparison is meaningless if a unit is treated and control at once.",
    );
  }
  return { treated, control, pairs };
}

/** One arm's reading at one altitude class. */
export interface TrialCell {
  readonly arm: TrialArm;
  /** `null` is the honest label for a frontier the committed classification does not cover. */
  readonly altitude: AltitudeClass | null;
  readonly frontiers: number;
  /** Distinct (frontier, window) pairs where the window read the frontier. The reader denominator. */
  readonly readings: number;
  /** Readings that went at least one record deeper — the walk. */
  readonly walks: number;
  /** Mean rooted depth over READINGS (a lone read counts 1). The primary outcome. */
  readonly meanDepthOverReaders: number;
  /** Mean rooted depth over WALKS alone. Separates "fewer walks" from "shallower walks". */
  readonly meanDepthOverWalkers: number;
  readonly maxDepth: number;
}

export type TrialArm = "treated" | "control";

/** One altitude class, both arms side by side, with the treated−control difference stated. */
export interface TrialContrast {
  readonly altitude: AltitudeClass | null;
  readonly treated: TrialCell;
  readonly control: TrialCell;
  /** treated − control on {@link TrialCell.meanDepthOverReaders}. Negative = treated reads shallower. */
  readonly depthDifference: number;
  /** treated − control on the share of readings that walked. */
  readonly walkShareDifference: number;
}

export interface CompositionTrialInput {
  readonly arms: FrozenArms;
  readonly reads: readonly DecisionReadObservation[];
  readonly support: DecisionSupportGraph;
  /** The committed altitude classification, decision number → class. Partial coverage is expected. */
  readonly altitude: ReadonlyMap<number, AltitudeClass>;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /**
   * How an observed id becomes a decision number. Defaults to {@link decisionNumberOfObservedId},
   * which delegates to the corpus's ONE resolver — never a raw-string join, which `-inc-01` measured
   * at a ~35x under-count that reports no error.
   */
  readonly resolve?: DecisionIdResolver | undefined;
}

export interface CompositionTrialReading {
  readonly windowsObserved: number;
  readonly readsInWindow: number;
  readonly cells: readonly TrialCell[];
  readonly contrasts: readonly TrialContrast[];
  /** Frontiers in an arm that no window read at all in this period — a stated denominator. */
  readonly unreadFrontiers: readonly number[];
  /** Frontiers in an arm the committed classification does not label — stated, never dropped. */
  readonly unlabelledFrontiers: readonly number[];
  /** Why this reading measured nothing, when it did. Empty means it measured something. */
  readonly vacuity: readonly string[];
}

function withinWindow(at: string, from: string | undefined, to: string | undefined): boolean {
  if (from !== undefined && at < from) return false;
  if (to !== undefined && at > to) return false;
  return true;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * PURE: the trial's reading over one observation period.
 *
 * Ordering of the altitude axis follows {@link ALTITUDE_CLASSES} and puts the unlabelled bucket last,
 * so two runs print comparable tables.
 */
export function computeCompositionTrial(input: CompositionTrialInput): CompositionTrialReading {
  const adjacency = supportAdjacency(input.support);
  const inLog = new Set(input.support.decisions);

  // Per context WINDOW, not per pooled worktree slot: "how far down a chain did a session walk in one
  // sitting" is a question about a window, and `-inc-02` measured the pooling correction at 1.42.
  const resolve = input.resolve ?? decisionNumberOfObservedId;
  const byWindow = new Map<string, Set<number>>();
  let readsInWindow = 0;
  for (const read of input.reads) {
    if (!withinWindow(read.at, input.from, input.to)) continue;
    const decision = resolve(read.nodeId);
    if (decision === null || !inLog.has(decision)) continue;
    readsInWindow += 1;
    const key = read.windowId ?? read.slotId;
    const existing = byWindow.get(key);
    if (existing === undefined) byWindow.set(key, new Set([decision]));
    else existing.add(decision);
  }

  const armOf = new Map<number, TrialArm>();
  for (const n of input.arms.treated) armOf.set(n, "treated");
  for (const n of input.arms.control) armOf.set(n, "control");

  interface Sample {
    readonly arm: TrialArm;
    readonly altitude: AltitudeClass | null;
    readonly frontier: number;
    readonly depth: number;
  }
  const samples: Sample[] = [];
  const readFrontiers = new Set<number>();
  for (const readSet of byWindow.values()) {
    for (const [frontier, arm] of [...armOf].sort((a, b) => a[0] - b[0])) {
      if (!readSet.has(frontier)) continue;
      readFrontiers.add(frontier);
      const { depth } = longestReadChain(readSet, adjacency, frontier);
      samples.push({ arm, altitude: input.altitude.get(frontier) ?? null, frontier, depth });
    }
  }

  const axis: (AltitudeClass | null)[] = [...ALTITUDE_CLASSES, null];
  const cells: TrialCell[] = [];
  for (const altitude of axis) {
    for (const arm of ["treated", "control"] as const) {
      const mine = samples.filter((s) => s.arm === arm && s.altitude === altitude);
      const depths = mine.map((s) => s.depth);
      const walkDepths = depths.filter((d) => d >= 2);
      cells.push({
        arm,
        altitude,
        frontiers: new Set(mine.map((s) => s.frontier)).size,
        readings: mine.length,
        walks: walkDepths.length,
        meanDepthOverReaders: mean(depths),
        meanDepthOverWalkers: mean(walkDepths),
        maxDepth: depths.reduce((max, d) => Math.max(max, d), 0),
      });
    }
  }

  const contrasts: TrialContrast[] = axis.map((altitude) => {
    const treated = cells.find((c) => c.altitude === altitude && c.arm === "treated");
    const control = cells.find((c) => c.altitude === altitude && c.arm === "control");
    // Both are always present — one cell per (altitude, arm) is emitted above — but the lookup is
    // typed as possibly-missing, so the fallbacks below are a type obligation rather than a guess.
    const t = treated ?? emptyCell("treated", altitude);
    const c = control ?? emptyCell("control", altitude);
    const share = (cell: TrialCell): number => (cell.readings === 0 ? 0 : cell.walks / cell.readings);
    return {
      altitude,
      treated: t,
      control: c,
      depthDifference: t.meanDepthOverReaders - c.meanDepthOverReaders,
      walkShareDifference: share(t) - share(c),
    };
  });

  const allFrontiers = [...input.arms.treated, ...input.arms.control].sort((a, b) => a - b);
  const vacuity: string[] = [];
  if (byWindow.size === 0) {
    vacuity.push(
      "no context window read any decision in the observation period — there is nothing to compare, " +
        "and a table of zeros must not read as 'composition changed nothing'",
    );
  }
  if (samples.length === 0 && byWindow.size > 0) {
    vacuity.push(
      "decisions were read, but none of them was a frontier in either arm — the reading is about a " +
        "population the trial does not cover",
    );
  }

  return {
    windowsObserved: byWindow.size,
    readsInWindow,
    cells,
    contrasts,
    unreadFrontiers: allFrontiers.filter((n) => !readFrontiers.has(n)),
    unlabelledFrontiers: allFrontiers.filter((n) => !input.altitude.has(n)),
    vacuity,
  };
}

function emptyCell(arm: TrialArm, altitude: AltitudeClass | null): TrialCell {
  return {
    arm,
    altitude,
    frontiers: 0,
    readings: 0,
    walks: 0,
    meanDepthOverReaders: 0,
    meanDepthOverWalkers: 0,
    maxDepth: 0,
  };
}
