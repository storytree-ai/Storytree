/**
 * The `resteer` tier's PURE compute (ADR-0515) — the partition that makes the taste exclusion
 * structural, the figures the rows can honestly support, and the agreement statistic the adopted
 * failure frame was validated with.
 *
 * WHY THE PARTITION IS A TYPE AND NOT A FILTER. ADR-0513 D4: "Re-steers the owner marks as TASTE are
 * excluded from any error rate by construction." A `rows.filter(r => r.disposition !== "taste")` at
 * each call site satisfies the words and not the requirement — it is a convention, and the first
 * reader who forgets it produces a number that is wrong in the flattering direction with nothing to
 * catch it. Here {@link partitionResteers} is the only way to obtain a {@link DefectResteer}, every
 * error figure accepts only that narrowed type, and `readonly Resteer[]` is NOT assignable to
 * `readonly DefectResteer[]`. Passing an unpartitioned list to an error figure does not compile.
 *
 * NO DATABASE, NO CLOCK, NO `node:` IMPORT — the caller supplies the rows, so every figure here is
 * testable without a store, and the studio could render the same numbers the CLI prints.
 */

import type { MastCategory, Resteer, ResteerMode } from "./knowledge.js";
import { MAST_CATEGORY } from "./knowledge.js";

/**
 * A re-steer the disposition says was a DEFECT — the only rows any error figure may count.
 *
 * An intersection rather than `Extract<Resteer, …>`: `Resteer` is a single object type whose
 * `disposition` is the whole `"defect" | "taste"` union, not a discriminated union of two members, so
 * `Extract` would collapse to `never` and silently make every figure below uncallable.
 */
export type DefectResteer = Resteer & { readonly disposition: "defect" };

/** A re-steer the disposition says was the owner's PREFERENCE. Never an error, by construction. */
export type TasteResteer = Resteer & { readonly disposition: "taste" };

/** The two halves, and the only route from a raw row list to a countable defect list. */
export interface ResteerPartition {
  readonly defects: readonly DefectResteer[];
  readonly taste: readonly TasteResteer[];
}

/** Split rows on `disposition`. The ONLY constructor of {@link DefectResteer}. */
export function partitionResteers(rows: readonly Resteer[]): ResteerPartition {
  const defects: DefectResteer[] = [];
  const taste: TasteResteer[] = [];
  for (const row of rows) {
    if (row.disposition === "defect") defects.push(row as DefectResteer);
    else taste.push(row as TasteResteer);
  }
  return { defects, taste };
}

/** One session's load: which branch, on what date, and how many of each kind of intervention. */
export interface SessionLoad {
  readonly branch: string;
  readonly defects: number;
  readonly taste: number;
}

/**
 * The figures a set of re-steer rows can honestly support.
 *
 * READ {@link ResteerReport.notComputable} BEFORE QUOTING ANYTHING FROM THIS. Two of the three
 * metrics `follow-the-research-arc` inc 1 named — HUMAN INTERVENTION RATE and TCR@k — need a
 * denominator these rows do not contain, and the reason is a design choice rather than an oversight:
 * "no re-steers this session" is a first-class, FREE, UNMARKED outcome (ADR-0513, consequences), so a
 * session that was never re-steered files nothing and is invisible here. Counting only the sessions
 * that filed would divide by the wrong denominator and overstate the intervention rate by exactly the
 * sessions that went cleanly. The report therefore states what it cannot compute rather than
 * computing it wrong.
 */
export interface ResteerReport {
  /** Every row considered. */
  readonly total: number;
  /** Rows whose disposition is `defect`. */
  readonly defects: number;
  /** Rows whose disposition is `taste` — excluded from every figure below by construction. */
  readonly taste: number;
  /**
   * Of the interventions recorded, the share that were defects rather than preference — `defects /
   * total`. `undefined` on an empty set, never a silent 0 (a 0% error rate over no data reads as a
   * clean factory). This is the "error rate" the increment's done-when refers to, and its numerator
   * cannot contain a taste row because {@link countDefects} will not accept one.
   */
  readonly defectShare: number | undefined;
  /**
   * The self-characterisation gap (ADR-0515 D3). `taste` rows split by WHO called them taste. A
   * healthy log has most taste marked by the owner; a growing `agent` share is the system excusing
   * itself, and it is visible here rather than buried in the aggregate.
   */
  readonly tasteByOwner: number;
  readonly tasteByAgent: number;
  /**
   * The defect share computed the STRICTER way: only owner-marked taste is excluded, and
   * agent-marked taste counts as a defect. The gap between this and {@link defectShare} bounds how
   * much agent self-characterisation is moving the headline number.
   */
  readonly defectShareOwnerTasteOnly: number | undefined;
  /** HITL LOAD per session that filed anything, descending by defect count. */
  readonly perSession: readonly SessionLoad[];
  /** MAST mode distribution over DEFECTS ONLY. Modes never reached are absent, not zero-filled. */
  readonly modeDistribution: ReadonlyMap<ResteerMode, number>;
  /** The same, rolled up to MAST's three categories plus `unhoused`. */
  readonly categoryDistribution: ReadonlyMap<MastCategory, number>;
  /**
   * The intervention RATE, when the caller supplied a session population; `undefined` when it did
   * not. Absent by default on purpose — the rows alone cannot produce it, and a report that
   * fabricated one from the filing sessions would divide by the wrong denominator.
   */
  readonly interventionRate: InterventionRateReading | undefined;
  /** Figures these rows structurally cannot support, and why. Always non-empty — see the interface doc. */
  readonly notComputable: readonly string[];
}

/**
 * Count defects. Accepts ONLY {@link DefectResteer}, which is the fence: a caller holding raw rows
 * must go through {@link partitionResteers} first, and `readonly Resteer[]` does not satisfy this
 * signature.
 */
export function countDefects(defects: readonly DefectResteer[]): number {
  return defects.length;
}

/** The stated limits of this instrument. Constant prose, so every caller reports the same caveat. */
export const RESTEER_NOT_COMPUTABLE: readonly string[] = [
  "HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. " +
    "Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row " +
    "and cannot be counted from this tier.",
  "TCR@k — needs the same session denominator, plus each session's completion outcome, neither of " +
    "which is a field on this tier.",
];

/**
 * What stays uncomputable once a {@link SessionPopulation} IS supplied.
 *
 * TCR@k does not become answerable just because a denominator arrived — its reason NARROWS, and the
 * narrowed reason is the more interesting one. The population is drawn from sessions that LANDED, so
 * every member of it completed by construction; a completion rate over that set would read near 100%
 * as a selection artifact rather than a finding.
 */
export const RESTEER_NOT_COMPUTABLE_WITH_DENOMINATOR: readonly string[] = [
  "TCR@k — the session denominator SELECTS ON LANDING, so every session in it completed by " +
    "construction and a completion rate over that population would read ~100% as a selection " +
    "artifact. It needs a population that includes the sessions which never landed.",
];

/**
 * The date the `resteer` capture landed (ADR-0515, `follow-the-research-arc` inc 1) — and therefore
 * the earliest date a session could possibly have filed a row.
 *
 * ⚠ THIS IS THE FLOOR OF EVERY HONEST WINDOW, not a default anyone should widen for a bigger sample.
 * Sessions before it could not file, so including them only inflates the denominator and drives the
 * rate toward zero. Move this only if the capture's own start moves.
 */
export const RESTEER_CAPTURE_START = "2026-09-05";

/**
 * Branch stamps that name no session. `(unstamped)` is {@link resteerReport}'s own fallback for a row
 * with no provenance; `HEAD` is what `git rev-parse --abbrev-ref HEAD` returns from a DETACHED
 * checkout, so a row carrying it was captured somewhere that could not say which branch it was on.
 *
 * Neither may enter either side of the ratio. Counting them in the numerator asserts an attribution
 * nothing supports; counting them in the denominator is not even possible, since the population is
 * built from branch names. They are reported on their own.
 */
export const UNATTRIBUTABLE_BRANCHES: ReadonlySet<string> = new Set(["(unstamped)", "HEAD"]);

/**
 * The session population a rate is computed over. SUPPLIED by the caller and never derived here —
 * this module has no clock, no filesystem and no git, and obtaining the population needs all three.
 */
export interface SessionPopulation {
  /** Distinct session branch names observed in the window, in the SAME naming the rows are stamped with. */
  readonly branches: readonly string[];
  /** ISO date the window opens. The CAPTURE's start date, never the repository's — see {@link interventionRate}. */
  readonly since: string;
  /** How the branches were obtained, printed beside the rate so the selection bias stays legible. */
  readonly source: string;
}

/** An intervention rate, with everything a reader needs to know how far to trust it. */
export interface InterventionRateReading {
  /** Distinct branches that filed at least one re-steer AND appear in the population. */
  readonly interveneSessions: number;
  /** Size of the population — the denominator. */
  readonly totalSessions: number;
  /**
   * `interveneSessions / totalSessions`. `undefined` on an empty population, never a silent 0: a 0%
   * intervention rate over no sessions reads as a factory nobody ever had to correct.
   */
  readonly rate: number | undefined;
  /** Rows whose branch stamp names no session ({@link UNATTRIBUTABLE_BRANCHES}). Never in either side. */
  readonly unattributableRows: number;
  /**
   * Filing branches with a real name that are NOT in the population — a session that filed a re-steer
   * and never landed, or landed outside the window. Excluded from the numerator so the rate cannot
   * exceed 1, and REPORTED so the exclusion is visible rather than silent.
   */
  readonly outsidePopulation: readonly string[];
  /** Echoed from the population so a quoted rate carries its window and source. */
  readonly since: string;
  readonly source: string;
}

/**
 * The HUMAN INTERVENTION RATE — what share of sessions the owner had to redirect.
 *
 * ⚠ THE WINDOW IS LOAD-BEARING, AND GETTING IT WRONG PRODUCES A REASSURING LIE. The capture landed
 * 2026-09-05. `main` carries ~1,856 merged PRs across its whole history against ~60 session branches
 * merged since that date. A rate computed over ALL history divides today's handful of rows by
 * ~1,600 sessions that COULD NOT have filed one — the arithmetic is valid and the number is
 * meaningless, and it errs toward "almost nothing needs correcting". The caller must open the window
 * at the capture's own start; this function only reports what it was given.
 *
 * THE UNIT MUST MATCH. {@link ResteerReport.perSession} keys on `provenance.branch`, so the
 * population must be branches too. Counting the denominator in context windows, worktree slots or
 * traces produces a ratio whose halves are different objects — and the claim ledger specifically is
 * NOT a candidate, since its `session_id` is the pooled, reused worktree SLOT.
 */
export function interventionRate(
  rows: readonly Resteer[],
  population: SessionPopulation,
): InterventionRateReading {
  const inPopulation = new Set(population.branches);

  const filed = new Set<string>();
  let unattributableRows = 0;
  for (const row of rows) {
    const branch = row.provenance?.branch ?? "(unstamped)";
    if (UNATTRIBUTABLE_BRANCHES.has(branch)) unattributableRows += 1;
    else filed.add(branch);
  }

  const intervened: string[] = [];
  const outside: string[] = [];
  for (const branch of filed) {
    if (inPopulation.has(branch)) intervened.push(branch);
    else outside.push(branch);
  }

  const totalSessions = inPopulation.size;
  return {
    interveneSessions: intervened.length,
    totalSessions,
    rate: totalSessions === 0 ? undefined : intervened.length / totalSessions,
    unattributableRows,
    outsidePopulation: outside.sort(),
    since: population.since,
    source: population.source,
  };
}

/**
 * Compose the report. Pure: no store, no clock.
 *
 * `population` is OPTIONAL and the report is honest either way: given one, it reports an
 * {@link interventionRate} and drops the no-denominator caveat; without one it behaves exactly as it
 * did before the denominator existed, stating that the rate is not computable rather than guessing.
 */
export function resteerReport(
  rows: readonly Resteer[],
  population?: SessionPopulation,
): ResteerReport {
  const { defects, taste } = partitionResteers(rows);
  const total = rows.length;
  const defectCount = countDefects(defects);

  const tasteByOwner = taste.filter((r) => r.dispositionBy === "owner").length;
  const tasteByAgent = taste.length - tasteByOwner;

  const perBranch = new Map<string, { defects: number; taste: number }>();
  for (const row of rows) {
    const branch = row.provenance?.branch ?? "(unstamped)";
    const entry = perBranch.get(branch) ?? { defects: 0, taste: 0 };
    if (row.disposition === "defect") entry.defects += 1;
    else entry.taste += 1;
    perBranch.set(branch, entry);
  }
  const perSession: SessionLoad[] = [...perBranch.entries()]
    .map(([branch, counts]) => ({ branch, defects: counts.defects, taste: counts.taste }))
    .sort((a, b) => b.defects - a.defects || a.branch.localeCompare(b.branch));

  const modeDistribution = new Map<ResteerMode, number>();
  const categoryDistribution = new Map<MastCategory, number>();
  for (const row of defects) {
    // `assertResteerInvariants` requires a mode on a defect; a row that reached here without one was
    // written around the capture verb, and is skipped rather than bucketed under a guessed mode.
    if (row.mode === undefined) continue;
    modeDistribution.set(row.mode, (modeDistribution.get(row.mode) ?? 0) + 1);
    const category = MAST_CATEGORY[row.mode];
    categoryDistribution.set(category, (categoryDistribution.get(category) ?? 0) + 1);
  }

  const strictDefects = defectCount + tasteByAgent;
  return {
    total,
    defects: defectCount,
    taste: taste.length,
    defectShare: total === 0 ? undefined : defectCount / total,
    tasteByOwner,
    tasteByAgent,
    defectShareOwnerTasteOnly: total === 0 ? undefined : strictDefects / total,
    perSession,
    modeDistribution,
    categoryDistribution,
    interventionRate: population === undefined ? undefined : interventionRate(rows, population),
    notComputable:
      population === undefined ? RESTEER_NOT_COMPUTABLE : RESTEER_NOT_COMPUTABLE_WITH_DENOMINATOR,
  };
}

/* ------------------------------------------------------------------------------------------------
 * The frame-validation instrument.
 * ---------------------------------------------------------------------------------------------- */

/** One annotator's label for one item. */
export interface Annotation {
  readonly id: string;
  readonly label: string;
}

/** A measured agreement figure, with the raw agreement it was derived from. */
export interface AgreementReading {
  /** Items both annotators labelled. */
  readonly n: number;
  /** Raw / observed agreement — the share of items where the two labels are identical. */
  readonly observed: number;
  /** Agreement expected by chance, from the two annotators' own marginal distributions. */
  readonly expected: number;
  /**
   * Cohen's kappa — `(observed - expected) / (1 - expected)`.
   *
   * `undefined` when `expected` is 1: with one category used for everything, chance agreement is
   * total, kappa is 0/0, and the honest answer is that the statistic is undefined rather than a
   * fabricated 0 or 1. ALWAYS read it beside {@link observed}: on a distribution dominated by one
   * category, kappa is depressed even where raw agreement is high (the kappa paradox), so quoting
   * kappa alone can understate a frame that is in fact being applied consistently.
   */
  readonly kappa: number | undefined;
  /** Labels used by either annotator, so a reader can see how many categories were actually in play. */
  readonly categories: readonly string[];
}

/**
 * Cohen's kappa between two annotators over the items they BOTH labelled.
 *
 * Items present in only one list are dropped and excluded from `n` — an unlabelled item is not a
 * disagreement, and silently scoring it as one would understate agreement.
 *
 * This is the instrument `follow-the-research-arc` inc 2 requires ("MEASURE OUR OWN AGREEMENT"). It
 * is a tested library function rather than a throwaway script on purpose: a number produced by an
 * untypechecked one-shot is a number nothing ever re-derives.
 */
export function cohensKappa(a: readonly Annotation[], b: readonly Annotation[]): AgreementReading {
  const bById = new Map(b.map((x) => [x.id, x.label]));
  const pairs: Array<readonly [string, string]> = [];
  for (const item of a) {
    const other = bById.get(item.id);
    if (other !== undefined) pairs.push([item.label, other]);
  }
  const n = pairs.length;
  const categories = [...new Set(pairs.flatMap(([x, y]) => [x, y]))].sort();
  if (n === 0) return { n: 0, observed: 0, expected: 0, kappa: undefined, categories };

  const agreed = pairs.filter(([x, y]) => x === y).length;
  const observed = agreed / n;

  const marginalA = new Map<string, number>();
  const marginalB = new Map<string, number>();
  for (const [x, y] of pairs) {
    marginalA.set(x, (marginalA.get(x) ?? 0) + 1);
    marginalB.set(y, (marginalB.get(y) ?? 0) + 1);
  }
  let expected = 0;
  for (const category of categories) {
    expected += ((marginalA.get(category) ?? 0) / n) * ((marginalB.get(category) ?? 0) / n);
  }

  const kappa = expected === 1 ? undefined : (observed - expected) / (1 - expected);
  return { n, observed, expected, kappa, categories };
}
