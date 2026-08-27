// frame-budget.ts — THE RUNG THAT CAN REFUSE. Pure, browser-free, node:test-provable; fenced
// into `harness/` with the rest of the experiment.
//
// WHY THIS EXISTS. ADR-0415 D1 retired "it's only twelve pixels" as an argument and left exactly
// two constraints that bind how much detail the land may carry: ACCESSIBILITY and PERFORMANCE.
// Accessibility has a real instrument. Performance did not — `hardware-floor.mjs` swept draw-call
// and object count and hard-failed ONLY on renderer identity (no WebGL, a software rasteriser, a
// throttled tab). Its timings were descriptive JSON, so **a change that halved the frame rate
// would have been recorded and reported green**. Every detail decision on this arc was being
// argued against a constraint that could not refuse anything.
//
// ⚠⚠ THE THRESHOLD IS THE FLOOR ITSELF, NOT A CHOSEN TOLERANCE, AND THAT IS THIS MODULE'S WHOLE
// DESIGN CONSTRAINT. `hardware-floor.mjs` already carries the lesson in its own comments: an
// earlier version scored each rung against `16.7 * 1.35`, and "1.35 was a number picked to make
// the answer come out". So the budget here is 60 Hz — the cadence ADR-0380 D2 names — and the
// grain's cost is reported against a CONTROL (the same scene with the grain off) rather than
// against a tolerance someone chose. A ratio ceiling would have been a picked number wearing a
// ratio's clothes.
//
// ⚠⚠ AND THE SECOND DESIGN CONSTRAINT: A VOID MEASUREMENT MUST NOT READ AS A PASS. A software
// rasteriser's frame time is not a hardware verdict — that is why PR #1417 declined to answer
// this question from a headless capture at all, and why `hardware-floor.mjs` is a HEADED tool.
// A hidden tab throttles rAF to ~1 Hz. In both cases the honest answer is UNVERIFIED, which is a
// third outcome and not a flavour of PASS. It also OUTRANKS FAIL: you cannot fail a run on a
// number you have just declared meaningless, and reporting FAIL from a software rasteriser would
// train a reader to ignore the rung.

/**
 * One whole frame at 60 Hz, in milliseconds.
 *
 * ⚠ `hardware-floor.mjs` carried `16.7` as a local literal before this module existed. The exact
 * value is 16.666…, so the headroom figures that script reports move by 0.2% — stated here rather
 * than left for someone to notice as an unexplained drift in a committed report. There is now one
 * definition and the script imports it.
 */
export const FRAME_BUDGET_60HZ_MS = 1000 / 60;

/** PASS / FAIL are verdicts about the scene. UNVERIFIED is a verdict about the MEASUREMENT. */
export type FrameBudgetStatus = 'PASS' | 'FAIL' | 'UNVERIFIED';

/** One measured configuration. `label` is what the report calls it; the rest comes off a
 *  `FloorReading`. */
export interface FrameCostRow {
  label: string;
  /**
   * EVERY REPEAT of the GPU-bound cost of one render, ms — the `gl.finish()`-closed batch
   * figures, NOT the vsync-capped rAF cadence. Substituting one for the other is the habit
   * `hardware-floor.ts` says this arc has had to correct five times.
   *
   * ⚠⚠ A LIST RATHER THAN A NUMBER, AND THE FIRST RUN OF THIS RUNG IS WHY. Measured on real
   * hardware (Adreno X1-85) at the island's plant count, one sample per configuration reported
   * the grain as making rendering **faster** — `both halves` at 0.97 ms against an ungrained
   * 1.23 ms. That is physically impossible: the grain adds fragment work and cannot subtract
   * cost. Two readings of the IDENTICAL 171-plant configuration in the same run differed by 43%
   * (0.86 vs 1.23), so run-to-run variance simply dwarfed the effect. A single sample would have
   * published that impossibility as a measurement, and it would have looked like a finding.
   *
   * So the row carries its repeats, the reported figure is their MEDIAN, and their SPREAD
   * becomes the noise floor every delta has to clear before it is allowed to be called a cost.
   */
  samples: readonly number[];
  /** The renderer was a software rasteriser. Voids the row as a hardware verdict. */
  software: boolean;
  /** The tab was hidden while this row was measured. Voids the row outright. */
  hidden: boolean;
}

/** Median of a sample list. Even counts take the mean of the middle pair. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Full spread of a sample list — max minus min. Deliberately the WIDEST reading of the noise
 *  rather than a standard deviation: with a handful of repeats an SD understates the range a
 *  single sample could have landed anywhere in, and this number's job is to say what a delta
 *  must beat before it counts. */
export function spread(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  return Math.max(...xs) - Math.min(...xs);
}

/** Whether a row's cost against the baseline can be believed. */
export type CostResolution =
  /** The delta clears the noise floor: a real, quotable cost. */
  | 'RESOLVED'
  /** The delta is smaller than the run-to-run variance. The cost is not zero — it is UNKNOWN,
   *  and quoting it either way would be quoting noise. */
  | 'BELOW_NOISE'
  /** The delta is negative by MORE than the noise floor: this configuration measured
   *  meaningfully CHEAPER while doing strictly more work. That is not a finding, it is an
   *  instrument fault, and it is named rather than reported as a saving. */
  | 'IMPOSSIBLE'
  /** The baseline row itself, which has no delta against itself. */
  | 'BASELINE';

export interface FrameCostReport {
  label: string;
  /** The MEDIAN of the row's repeats. */
  gpuMsPerFrame: number;
  /** Max minus min across the repeats — this row's own noise. */
  spreadMs: number;
  samples: number;
  /** Share of one 60 Hz frame this configuration spends, as a percentage. */
  sharePct: number;
  /** Cost above the baseline, ms. `null` on the baseline row itself. */
  deltaVsBaselineMs: number | null;
  /** Multiple of the baseline. `null` on the baseline row itself. */
  factorVsBaseline: number | null;
  /** The delta as a share of one whole frame — the number a detail decision actually spends. */
  deltaSharePct: number | null;
  /** Whether that delta may be quoted at all. */
  resolution: CostResolution;
  /** The bar this row's delta had to clear: the wider of the baseline's spread and its own. */
  noiseFloorMs: number;
}

export interface FrameBudgetVerdict {
  status: FrameBudgetStatus;
  budgetMs: number;
  baselineLabel: string;
  rows: FrameCostReport[];
  /** Why it failed — one entry per row over budget. Empty unless status is FAIL. */
  failures: string[];
  /** Why nothing could be concluded. Empty unless status is UNVERIFIED. */
  unverified: string[];
  /** The sentence the report prints, DERIVED rather than typed. `cadence-verdict.ts` exists
   *  because a hand-written sentence in this same report was once false while every computed
   *  number in it held up; this follows that correction rather than repeating the mistake. */
  prose: string;
}

export interface FrameBudgetInput {
  /** The measured configurations. The first is the baseline unless `baselineLabel` names another. */
  rows: readonly FrameCostRow[];
  /** Which row is the control. Defaults to the first. */
  baselineLabel?: string;
  /** One frame's budget, ms. Defaults to 60 Hz. */
  budgetMs?: number;
}

/**
 * Judge a set of measured configurations against the frame budget.
 *
 * THE ORDER OF THE CHECKS IS THE POINT, so it is stated rather than left to the reader:
 *
 *   1. VOIDNESS FIRST. A hidden tab or a software rasteriser means no row can be believed, so the
 *      verdict is UNVERIFIED and no PASS or FAIL is issued. This outranks being over budget.
 *   2. THE BASELINE MUST BE REAL. Without a positive control there is no delta to attribute the
 *      grain's cost to, and a zero baseline would make every factor infinite. UNVERIFIED.
 *   3. ONLY THEN the budget. Any row over it FAILS, and the failure names the row and the number.
 */
export function frameBudgetVerdict(input: FrameBudgetInput): FrameBudgetVerdict {
  const budgetMs = input.budgetMs ?? FRAME_BUDGET_60HZ_MS;
  const rows = input.rows;
  const baselineLabel = input.baselineLabel ?? rows[0]?.label ?? '';

  const unverified: string[] = [];
  if (rows.length === 0) unverified.push('no configurations were measured at all');
  for (const r of rows) {
    if (r.hidden) {
      unverified.push(`"${r.label}" was measured with the tab hidden — rAF is throttled to ~1 Hz`);
    }
    if (r.software) {
      unverified.push(
        `"${r.label}" reported a software rasteriser — a software frame time is not a hardware verdict`,
      );
    }
    if (r.samples.length === 0) unverified.push(`"${r.label}" carries no samples at all`);
  }

  const baseline = rows.find((r) => r.label === baselineLabel);
  if (rows.length > 0 && !baseline) {
    unverified.push(`the baseline "${baselineLabel}" is not among the measured configurations`);
  }
  const base = baseline ? median(baseline.samples) : 0;
  if (baseline && !(base > 0)) {
    unverified.push(
      `the baseline "${baselineLabel}" measured ${base} ms — there is no control to attribute a ` +
        'cost against',
    );
  }

  const baseSpread = baseline ? spread(baseline.samples) : 0;
  const report: FrameCostReport[] = rows.map((r) => {
    const isBaseline = r.label === baselineLabel;
    const value = median(r.samples);
    const ownSpread = spread(r.samples);
    // THE BAR A DELTA MUST CLEAR: the wider of the two rows' own variances. A delta smaller than
    // the range a single reading could have landed in is not a small cost, it is no measurement.
    const noiseFloorMs = Math.max(baseSpread, ownSpread);
    const usable = base > 0 && !isBaseline;
    const delta = usable ? value - base : null;

    let resolution: CostResolution = 'BASELINE';
    if (usable && delta !== null) {
      if (delta < -noiseFloorMs) resolution = 'IMPOSSIBLE';
      else if (Math.abs(delta) <= noiseFloorMs) resolution = 'BELOW_NOISE';
      else resolution = 'RESOLVED';
    }

    return {
      label: r.label,
      gpuMsPerFrame: value,
      spreadMs: ownSpread,
      samples: r.samples.length,
      sharePct: (value / budgetMs) * 100,
      // ⚠ THE DELTA IS WITHHELD UNLESS IT RESOLVED. Reporting "+0.03 ms" beside a noise floor of
      // 0.30 ms invites it to be quoted as the grain's cost, and a reader who quotes it is not
      // being careless — the number was right there. Withholding is the only presentation that
      // cannot be misread.
      deltaVsBaselineMs: resolution === 'RESOLVED' ? delta : null,
      factorVsBaseline: resolution === 'RESOLVED' ? value / base : null,
      deltaSharePct: resolution === 'RESOLVED' && delta !== null ? (delta / budgetMs) * 100 : null,
      resolution,
      noiseFloorMs,
    };
  });

  if (unverified.length > 0) {
    return {
      status: 'UNVERIFIED',
      budgetMs,
      baselineLabel,
      rows: report,
      failures: [],
      unverified,
      prose:
        `UNVERIFIED — nothing was concluded about the frame budget. ${unverified[0]!}` +
        (unverified.length > 1 ? ` (and ${unverified.length - 1} more)` : '') +
        '. This is NOT a pass.',
    };
  }

  const failures = report
    .filter((r) => r.gpuMsPerFrame > budgetMs)
    .map(
      (r) =>
        `"${r.label}" spends ${r.gpuMsPerFrame.toFixed(2)} ms of a ${budgetMs.toFixed(2)} ms frame ` +
        `(${r.sharePct.toFixed(0)}% of the budget)`,
    );

  // AN IMPOSSIBLE ROW IS AN INSTRUMENT FAULT, NOT A SCENE VERDICT, so it lands with the other
  // things that make a run unbelievable rather than being reported as a saving. It is checked
  // after the void guards because it is a weaker claim than "this run was software-rasterised":
  // it says the numbers contradict physics, which can only be judged once they are real numbers.
  const impossible = report.filter((r) => r.resolution === 'IMPOSSIBLE');
  if (impossible.length > 0) {
    const why = impossible.map(
      (r) =>
        `"${r.label}" measured ${r.gpuMsPerFrame.toFixed(2)} ms against the control's ` +
        `${base.toFixed(2)} ms while doing strictly MORE fragment work, by more than the ` +
        `${r.noiseFloorMs.toFixed(2)} ms noise floor`,
    );
    return {
      status: 'UNVERIFIED',
      budgetMs,
      baselineLabel,
      rows: report,
      failures: [],
      unverified: why,
      prose:
        `UNVERIFIED — the measurement contradicts itself. ${why[0]!}. Adding work cannot subtract ` +
        'cost, so this is the instrument failing, not a saving. Raise the repeat count or the ' +
        'batch size until the effect clears the noise. This is NOT a pass.',
    };
  }

  if (failures.length > 0) {
    return {
      status: 'FAIL',
      budgetMs,
      baselineLabel,
      rows: report,
      failures,
      unverified: [],
      prose: `FAIL — ${failures.length} configuration(s) do not fit in one 60 Hz frame: ${failures.join('; ')}.`,
    };
  }

  const worst = report.reduce((a, b) => (b.sharePct > a.sharePct ? b : a), report[0]!);
  const dearest = report
    .filter((r) => r.deltaSharePct !== null)
    .reduce<FrameCostReport | null>(
      (a, b) => (a === null || b.deltaSharePct! > a.deltaSharePct! ? b : a),
      null,
    );
  const unresolved = report.filter((r) => r.resolution === 'BELOW_NOISE');
  return {
    status: 'PASS',
    budgetMs,
    baselineLabel,
    rows: report,
    failures: [],
    unverified: [],
    prose:
      `PASS — every configuration fits in one ${budgetMs.toFixed(2)} ms frame. The dearest is ` +
      `"${worst.label}" at ${worst.gpuMsPerFrame.toFixed(2)} ms (${worst.sharePct.toFixed(1)}% of ` +
      `the budget)` +
      (dearest
        ? `, and the costliest RESOLVED addition over "${baselineLabel}" is "${dearest.label}" at ` +
          `+${dearest.deltaVsBaselineMs!.toFixed(2)} ms (${dearest.deltaSharePct!.toFixed(1)} ` +
          `percentage points of the frame, ${dearest.factorVsBaseline!.toFixed(2)}x the control)`
        : '') +
      '.' +
      // PASSING THE BUDGET AND MEASURING THE COST ARE TWO DIFFERENT CLAIMS, and the second can
      // fail while the first holds. Saying so in the same sentence is what stops "PASS" being
      // read as "and we know what the grain costs".
      (unresolved.length > 0
        ? ` ⚠ ${unresolved.length} configuration(s) — ` +
          `${unresolved.map((r) => `"${r.label}"`).join(', ')} — moved the frame by LESS than the ` +
          `${unresolved[0]!.noiseFloorMs.toFixed(2)} ms run-to-run noise, so their cost is ` +
          'UNRESOLVED rather than zero: this run fits the budget but does not say what they cost.'
        : ''),
  };
}
