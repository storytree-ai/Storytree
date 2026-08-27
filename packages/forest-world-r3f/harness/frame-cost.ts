// frame-cost.ts — the PURE half of the GPU-CLOCK frame-cost instrument. Browser-free,
// node:test-provable, fenced into `harness/` with the rest of the experiment.
//
// ⚠⚠ WHY A SECOND FRAME INSTRUMENT EXISTS AT ALL, WHEN `hardware-floor.*` ALREADY MEASURES
// FRAME TIME. Because that one CANNOT COST A SHADER, and it does not say so — it returns a
// plausible number. Measured 2026-08-27 on real hardware, varying one thing per run:
//
//   171 plants, 2880x1920                    172 draw calls   0.76 ms
//   171 plants, 5760x3840 (4x the fragments) 172 draw calls   0.62 ms
//   0 plants,   2880x1920                      1 draw call    0.02 ms
//
// Quadrupling the FRAGMENTS moved it 0%; removing the PLANTS dropped it 97%. That scene draws
// one call per plant, so submission dominates and any fragment-stage change is invisible
// underneath it. A grain A/B run there reported the cost as "below the noise floor", which is
// indistinguishable from the `grain` option never reaching the material at all.
//
// AND THERE IS A SECOND, WORSE SUSPICION THIS MODULE EXISTS TO SETTLE. One full-frame quad at
// 2880x1920 measuring 0.02 ms implies ~275 Gfragment/s on an integrated GPU, which is not a
// plausible fill rate. So `gl.finish()` may not be blocking until the GPU retires the work at
// all — i.e. that instrument's "GPU-bound cost" may be timing CPU submission. That was a
// LEADING HYPOTHESIS with no way to test it. `EXT_disjoint_timer_query_webgl2` is a clock on
// the GPU itself, so running the SAME scene through both routes in the same run either
// establishes the hypothesis or refutes it. Both outcomes are results; see `finishRouteVerdict`.
//
// WHAT THIS MODULE OWNS: the arithmetic that decides whether a set of readings may be believed
// at all. The scene lives in `frame-cost-scene.ts` (it needs three.js and a GL context); the
// driver `frame-cost-measure.mjs` stays thin. The three-verdict vocabulary — PASS / FAIL /
// UNVERIFIED, with UNVERIFIED a verdict about the MEASUREMENT that OUTRANKS a fail — is
// `frame-budget.ts`'s and is reused rather than re-invented.

import {
  FRAME_BUDGET_60HZ_MS,
  median,
  spread,
  type FrameCostReport,
} from './frame-budget.js';

/** The WebGL2 GPU-clock extension. Named once so the page, the driver and the report agree. */
export const GPU_TIMER_EXTENSION = 'EXT_disjoint_timer_query_webgl2';

/**
 * One attempted reading of one configuration, carrying BOTH timing routes.
 *
 * They are taken as one sample rather than as two runs on purpose: the whole point of the
 * cross-check is that the two numbers describe the SAME work on the SAME scene at the SAME
 * moment. Two separate sweeps could disagree because the box drifted between them, which is
 * exactly the confound that would let a real disagreement be waved away.
 */
export interface TimingSample {
  /**
   * The GPU's own clock, ms per frame — `TIME_ELAPSED_EXT` over a batch of renders divided by
   * the batch size. `null` when the query never became available.
   */
  gpuMsPerFrame: number | null;
  /**
   * `GL_GPU_DISJOINT_EXT` was set while this sample was in flight. The GPU clock was
   * interrupted — a context switch, a power event, a clock change — and the driver is telling
   * you the elapsed figure is GARBAGE rather than merely noisy.
   */
  disjoint: boolean;
  /** Wall clock around a `gl.finish()`-closed batch, ms per frame — the route
   *  `hardware-floor.ts` has always used, run here on the identical scene. */
  wallMsPerFrame: number;
}

/** What survived the discard rules, and what did not. */
export interface AcceptedSamples {
  /** GPU-clock figures that may be believed. */
  gpu: number[];
  /** Wall-clock figures from the SAME accepted samples, so the two lists are paired. */
  wall: number[];
  attempted: number;
  discardedDisjoint: number;
  discardedUnavailable: number;
}

/**
 * The minimum number of ACCEPTED samples a row needs before its figures may be quoted.
 *
 * ⚠ THIS IS ARITHMETIC, NOT A TOLERANCE, AND THE DIFFERENCE IS THE WHOLE POINT. `spread()`
 * returns 0 for fewer than two samples — so a row down to one accepted reading would report a
 * noise floor of ZERO and every delta against it would be classified RESOLVED, however small.
 * The instrument would get MORE confident as the measurement got worse. Two samples give a
 * range consisting of exactly one interval, which is a difference rather than a distribution.
 * Three is the first count at which "the range a single reading could have landed in" is a
 * statement about the run.
 *
 * The test of an honest bar is where a number picked to PASS would have sat. It would have sat
 * at 1 — accept whatever came back — which is the configuration that cannot fail.
 */
export const MIN_ACCEPTED_SAMPLES = 3;

/**
 * Drop the samples the GPU itself declared garbage.
 *
 * ⚠ A DISJOINT SAMPLE IS DISCARDED, NEVER AVERAGED IN. Averaging it would be averaging in a
 * number the driver has explicitly said is not a duration. And the WHOLE sample goes, not just
 * its GPU half: `GPU_DISJOINT_EXT` reports that something interrupted the device during this
 * measurement, and the wall-clock batch was taken on the same scene moments earlier under the
 * same disturbance. Keeping the wall half of a disturbed sample would quietly bias the one
 * route against the other — which is the exact comparison this instrument exists to make.
 */
export function acceptSamples(samples: readonly TimingSample[]): AcceptedSamples {
  const out: AcceptedSamples = {
    gpu: [],
    wall: [],
    attempted: samples.length,
    discardedDisjoint: 0,
    discardedUnavailable: 0,
  };
  for (const s of samples) {
    if (s.disjoint) {
      out.discardedDisjoint++;
      continue;
    }
    if (s.gpuMsPerFrame === null || !Number.isFinite(s.gpuMsPerFrame)) {
      out.discardedUnavailable++;
      continue;
    }
    out.gpu.push(s.gpuMsPerFrame);
    out.wall.push(s.wallMsPerFrame);
  }
  return out;
}

/** One measured configuration, after acceptance. */
export interface FrameCostRowInput {
  label: string;
  accepted: AcceptedSamples;
}

/** SOUND means the readings may be judged. UNVERIFIED means nothing may be concluded from
 *  them — including that they passed. */
export type MeasurementIntegrity = 'SOUND' | 'UNVERIFIED';

export interface IntegrityVerdict {
  status: MeasurementIntegrity;
  reasons: string[];
  prose: string;
}

export interface IntegrityInput {
  rows: readonly FrameCostRowInput[];
  /** `EXT_disjoint_timer_query_webgl2` was present. Without it there is no GPU clock and this
   *  instrument is `hardware-floor.mjs` with extra steps. */
  extensionAvailable: boolean;
  /** The unmasked renderer string, recorded on every run (a browser figure that does not say
   *  which renderer produced it can be quoted later as a GPU result — every browser figure this
   *  project published before 2026-08-27 came off SwiftShader and no report said so). */
  renderer: string;
  vendor: string;
  software: boolean;
  hidden: boolean;
}

/**
 * Can these readings be believed AT ALL?
 *
 * THE ORDER OF THE CHECKS IS THE POINT, and it follows `frameBudgetVerdict`'s:
 *
 *   1. THE INSTRUMENT. No timer-query extension means there is no GPU clock in this run.
 *   2. THE MACHINE. A software rasteriser or a hidden tab voids every row.
 *   3. THE SAMPLES. A row whose accepted count fell below `MIN_ACCEPTED_SAMPLES`, or whose
 *      accepted samples are no longer a MAJORITY of what was attempted, is not a measurement:
 *      what is left is the subset the GPU's own interruptions happened to spare, which is not
 *      a random subsample of anything.
 */
export function integrityVerdict(input: IntegrityInput): IntegrityVerdict {
  const reasons: string[] = [];

  if (!input.extensionAvailable) {
    reasons.push(
      `${GPU_TIMER_EXTENSION} is not available on this context — there is no GPU clock in this ` +
        'run, so every figure below is the wall-clock route this instrument exists to check',
    );
  }
  if (input.software) {
    reasons.push(
      `the context came up on a SOFTWARE rasteriser (${input.renderer}) — a software frame time ` +
        'is not a hardware verdict',
    );
  }
  if (input.hidden) {
    reasons.push('the page was hidden while measuring — the compositor throttles a hidden tab');
  }
  if (input.rows.length === 0) reasons.push('no configurations were measured at all');

  for (const r of input.rows) {
    const a = r.accepted;
    const kept = a.gpu.length;
    if (kept < MIN_ACCEPTED_SAMPLES) {
      reasons.push(
        `"${r.label}" kept only ${kept} of ${a.attempted} samples (${a.discardedDisjoint} ` +
          `disjoint, ${a.discardedUnavailable} never returned) — below the ` +
          `${MIN_ACCEPTED_SAMPLES} a run-to-run range needs to mean anything`,
      );
    } else if (kept * 2 <= a.attempted) {
      reasons.push(
        `"${r.label}" kept ${kept} of ${a.attempted} samples — a MINORITY, selected by the GPU's ` +
          'own interruptions rather than at random, so the median describes the quiet part of a ' +
          'disturbed run',
      );
    }
  }

  if (reasons.length === 0) {
    return {
      status: 'SOUND',
      reasons: [],
      prose:
        `SOUND — the GPU clock was available and undisturbed on ${input.renderer} ` +
        `(${input.vendor}); every row kept at least ${MIN_ACCEPTED_SAMPLES} samples and a ` +
        'majority of what it attempted.',
    };
  }
  return {
    status: 'UNVERIFIED',
    reasons,
    prose:
      `UNVERIFIED — nothing was concluded from these readings. ${reasons[0]!}` +
      (reasons.length > 1 ? ` (and ${reasons.length - 1} more)` : '') +
      '. This is NOT a pass, and it outranks one.',
  };
}

// ---------------------------------------------------------------- the gl.finish() cross-check

/**
 * ESTABLISHED — the GPU clock reports at least an ORDER OF MAGNITUDE more time than the
 * wall clock around `gl.finish()`, so `finish()` returned before the GPU had retired the work
 * and the wall-clock route was timing submission.
 *
 * REFUTED — the two routes agree to within this run's own noise. `finish()` does block, and
 * `hardware-floor.ts`'s numbers are timing the GPU after all.
 *
 * INCONCLUSIVE — they differ by more than the noise but less than an order of magnitude. That
 * is neither outcome and is reported as neither: some gap is EXPECTED, since the wall-clock
 * route also carries CPU submission and the `finish()` round-trip, which the GPU clock does not.
 */
export type FinishHypothesis = 'ESTABLISHED' | 'REFUTED' | 'INCONCLUSIVE';

/**
 * The bar for "an order of magnitude", which is the bar the hypothesis was STATED at rather
 * than one chosen here to make an answer come out: the suspicion on record is that a
 * 0.02 ms reading implied ~275 Gfragment/s, i.e. wrong by orders of magnitude, not by a factor
 * anyone would argue about.
 */
export const ORDER_OF_MAGNITUDE = 10;

export interface FinishRouteVerdict {
  label: string;
  hypothesis: FinishHypothesis;
  gpuMedianMs: number;
  wallMedianMs: number;
  /** GPU clock ÷ wall clock. Above 1 means `finish()` under-reports. */
  ratio: number;
  /** The bar the difference had to clear before it counted: the wider of the two routes'
   *  own spreads, read off THIS run rather than committed. */
  noiseFloorMs: number;
  gpuSpreadMs: number;
  wallSpreadMs: number;
  samples: number;
  prose: string;
}

/**
 * Judge the two timing routes against each other on one configuration.
 *
 * ⚠ THE BAR IS READ OFF A CONTROL IN THE SAME RUN, which is this repo's house pattern rather
 * than a new invention: the two routes' own spreads ARE the control, because they are two
 * readings of the identical work. A committed threshold would be one machine's threshold, and
 * an earlier version of `hardware-floor.mjs` scored against `16.7 * 1.35` — "a number picked to
 * make the answer come out".
 */
export function finishRouteVerdict(input: {
  label: string;
  gpu: readonly number[];
  wall: readonly number[];
}): FinishRouteVerdict {
  const gpuMedianMs = median(input.gpu);
  const wallMedianMs = median(input.wall);
  const gpuSpreadMs = spread(input.gpu);
  const wallSpreadMs = spread(input.wall);
  const noiseFloorMs = Math.max(gpuSpreadMs, wallSpreadMs);
  const ratio = wallMedianMs > 0 ? gpuMedianMs / wallMedianMs : Number.POSITIVE_INFINITY;
  const gap = Math.abs(gpuMedianMs - wallMedianMs);

  let hypothesis: FinishHypothesis;
  let prose: string;
  if (input.gpu.length === 0 || input.wall.length === 0) {
    hypothesis = 'INCONCLUSIVE';
    prose = `"${input.label}" carries no paired samples, so the two routes cannot be compared.`;
  } else if (gap <= noiseFloorMs) {
    hypothesis = 'REFUTED';
    prose =
      `REFUTED on "${input.label}": the GPU clock reads ${gpuMedianMs.toFixed(3)} ms/frame and ` +
      `the wall clock around gl.finish() reads ${wallMedianMs.toFixed(3)} ms/frame — a gap of ` +
      `${gap.toFixed(3)} ms, inside this run's own ${noiseFloorMs.toFixed(3)} ms noise. ` +
      'gl.finish() IS blocking until the GPU retires the work here, so the wall-clock route ' +
      'was measuring the GPU after all.';
  } else if (ratio >= ORDER_OF_MAGNITUDE) {
    hypothesis = 'ESTABLISHED';
    prose =
      `ESTABLISHED on "${input.label}": the GPU clock reads ${gpuMedianMs.toFixed(3)} ms/frame ` +
      `against ${wallMedianMs.toFixed(3)} ms/frame from the wall clock around gl.finish() — ` +
      `${ratio.toFixed(1)}x, at or past the ${ORDER_OF_MAGNITUDE}x order-of-magnitude bar and ` +
      `far outside the ${noiseFloorMs.toFixed(3)} ms noise. gl.finish() returned before the GPU ` +
      'had retired the work, so every figure taken through that route is timing CPU submission.';
  } else {
    hypothesis = 'INCONCLUSIVE';
    prose =
      `INCONCLUSIVE on "${input.label}": the GPU clock reads ${gpuMedianMs.toFixed(3)} ms/frame ` +
      `against ${wallMedianMs.toFixed(3)} ms/frame (${ratio.toFixed(2)}x). The gap of ` +
      `${gap.toFixed(3)} ms clears the ${noiseFloorMs.toFixed(3)} ms noise but falls short of ` +
      `${ORDER_OF_MAGNITUDE}x, and some gap is EXPECTED — the wall-clock route also carries CPU ` +
      'submission and the finish() round-trip. Neither established nor refuted.';
  }

  return {
    label: input.label,
    hypothesis,
    gpuMedianMs,
    wallMedianMs,
    ratio,
    noiseFloorMs,
    gpuSpreadMs,
    wallSpreadMs,
    samples: Math.min(input.gpu.length, input.wall.length),
    prose,
  };
}

// ---------------------------------------------------------------- how a cost may be stated

/**
 * The one sentence a row's cost may be quoted as.
 *
 * ⚠⚠ "BELOW THE NOISE FLOOR" IS NOT AN UPPER BOUND ON THE COST AND MUST NEVER BE WRITTEN AS
 * ONE. It bounds what the INSTRUMENT CAN SEE. The honest statement for an unresolved row names
 * the FLOOR as the bound — "at most this much, because that is the smallest thing this run
 * could have detected" — and says outright that the true cost is unknown below it. The
 * difference matters because the two read identically to a later quoter and only one of them
 * is defensible.
 */
export function costBoundProse(row: FrameCostReport, budgetMs = FRAME_BUDGET_60HZ_MS): string {
  if (row.resolution === 'BASELINE') return 'the control';
  if (row.resolution === 'RESOLVED') {
    return (
      `+${row.deltaVsBaselineMs!.toFixed(3)} ms/frame (${row.deltaSharePct!.toFixed(2)}% of a ` +
      `${budgetMs.toFixed(2)} ms frame, ${row.factorVsBaseline!.toFixed(2)}x the control)`
    );
  }
  if (row.resolution === 'IMPOSSIBLE') {
    return 'IMPOSSIBLE — measured cheaper than the control while doing strictly more work';
  }
  return (
    `UNRESOLVED — at most ${row.noiseFloorMs.toFixed(3)} ms/frame ` +
    `(${((row.noiseFloorMs / budgetMs) * 100).toFixed(2)}% of a frame), which is this run's ` +
    'noise floor and therefore the smallest cost it could have SEEN. The true cost is unknown ' +
    'below that and is NOT zero'
  );
}

// ---------------------------------------------------------------- the interleaved sweep order

/**
 * The order the configurations are measured in: ROUND-ROBIN, one pass at a time.
 *
 * ⚠ NOT REPEATS-GROUPED-BY-CONFIGURATION, and this arc has already paid for learning why. A GPU
 * drifts over a run — thermal, clock and power state all move — so measuring all of arm A and
 * then all of arm B aliases that drift onto the variable, and whichever arm went last always
 * looks dearest. Round-robin spreads the drift evenly across every arm.
 *
 * The first interleaved run of the older grain A/B is the other half of the lesson: a SINGLE
 * sample per configuration published `both halves` at 0.97 ms against an ungrained 1.23 ms — 21%
 * FASTER while doing strictly more work — and two readings of the IDENTICAL configuration in
 * that run differed by 43%.
 */
export function roundRobinPlan<T>(configs: readonly T[], repeats: number): T[] {
  const out: T[] = [];
  for (let pass = 0; pass < repeats; pass++) {
    for (const c of configs) out.push(c);
  }
  return out;
}

/**
 * Does an interleaved plan actually interleave?
 *
 * A sweep that silently degenerated to grouped repeats would still produce numbers, and they
 * would still look like a measurement — the same failure class as an A/B whose arms are
 * secretly the same scene. So the property is asserted rather than assumed.
 */
export function isInterleaved<T>(plan: readonly T[], configs: readonly T[]): boolean {
  if (configs.length < 2) return true;
  if (plan.length % configs.length !== 0) return false;
  for (let i = 0; i < plan.length; i++) {
    if (plan[i] !== configs[i % configs.length]) return false;
  }
  return true;
}

// ---------------------------------------------------------------- the picture for the owner

/** One bar group: a variant, and its measured cost at each zoom. */
export interface CostChartRow {
  variant: string;
  /** ms per frame, one per series, in `seriesLabels` order. */
  values: readonly number[];
  /** `sin` calls per fragment — the arithmetic the measurement is read against. */
  sinCalls: number;
}

export interface CostChartInput {
  rows: readonly CostChartRow[];
  /** One label per series. Two here: the two zooms. */
  seriesLabels: readonly string[];
  title: string;
  /** One line each. A LIST rather than a sentence because the renderer identity has to travel
   *  with the picture in full — a truncated one is the failure this arc corrected in 2026-08. */
  subtitles: readonly string[];
  budgetMs?: number;
}

/**
 * The measured table as a horizontal grouped bar chart — DERIVED from the same numbers the
 * report prints, never hand-typed.
 *
 * ⚠ THE NUMBERS ARE GENERATED, AND THAT IS THE POINT. This arc has already committed a report
 * whose every computed figure held up while the one HAND-WRITTEN sentence in it was false. A
 * picture with hand-copied bar lengths is that failure with a wider blast radius, because a
 * reader checks a sentence and eyeballs a chart.
 *
 * Colour does one job here — IDENTITY, two series, two categorical hues assigned in fixed order
 * (blue then orange, ΔE 24.7 under protanopia, 33.6 unsimulated, both ≥ 3:1 on the surface).
 * Every bar is also DIRECTLY LABELLED with its value and every group is named on the axis, so
 * identity is never carried by colour alone. Text wears ink tokens, never a series colour.
 */
export function costChartSvg(input: CostChartInput): string {
  const SURFACE = '#fcfcfb';
  const INK = '#0b0b0b';
  const INK_2 = '#52514e';
  const GRID = '#e4e3df';
  const SERIES = ['#2a78d6', '#eb6834'];

  const LEFT = 168;
  const RIGHT = 96;
  const WIDTH = 900;
  const TOP = 60 + input.subtitles.length * 16 + 28;
  const BAR = 15;
  const BAR_GAP = 2;
  const GROUP_GAP = 17;
  const plotW = WIDTH - LEFT - RIGHT;

  const seriesCount = input.seriesLabels.length;
  const groupH = seriesCount * BAR + (seriesCount - 1) * BAR_GAP;
  const height = TOP + input.rows.length * (groupH + GROUP_GAP) + 56;

  const maxValue = Math.max(0.0001, ...input.rows.flatMap((r) => [...r.values]));
  // A round upper bound at or above the tallest bar, so the axis reads in tenths of a
  // millisecond rather than in whatever the maximum happened to be.
  const axisMax = Math.ceil(maxValue * 10) / 10;
  const x = (v: number): number => LEFT + (v / axisMax) * plotW;
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
      `viewBox="0 0 ${WIDTH} ${height}" role="img" ` +
      `aria-label="${esc(input.title)}. ${esc(input.subtitles.join('. '))}">`,
  );
  parts.push(`<rect width="${WIDTH}" height="${height}" fill="${SURFACE}"/>`);
  parts.push(
    `<text x="24" y="32" fill="${INK}" font-family="system-ui, sans-serif" font-size="17" ` +
      `font-weight="600">${esc(input.title)}</text>`,
  );
  input.subtitles.forEach((line, i) => {
    parts.push(
      `<text x="24" y="${54 + i * 16}" fill="${INK_2}" font-family="system-ui, sans-serif" ` +
        `font-size="12">${esc(line)}</text>`,
    );
  });

  // LEGEND — always present for two or more series, so identity never rests on colour alone.
  let legendX = LEFT;
  for (let s = 0; s < seriesCount; s++) {
    parts.push(
      `<rect x="${legendX}" y="${TOP - 26}" width="11" height="11" rx="2" fill="${SERIES[s]}"/>`,
    );
    parts.push(
      `<text x="${legendX + 17}" y="${TOP - 16}" fill="${INK_2}" ` +
        `font-family="system-ui, sans-serif" font-size="12">${esc(input.seriesLabels[s]!)}</text>`,
    );
    legendX += 24 + esc(input.seriesLabels[s]!).length * 6.6;
  }

  // Recessive gridlines and one axis. Never two scales.
  const plotBottom = TOP + input.rows.length * (groupH + GROUP_GAP) - GROUP_GAP + 6;
  for (let t = 0; t <= 10; t++) {
    const v = (axisMax * t) / 10;
    if (t % 2 !== 0) continue;
    parts.push(
      `<line x1="${x(v).toFixed(1)}" y1="${TOP - 6}" x2="${x(v).toFixed(1)}" ` +
        `y2="${plotBottom}" stroke="${GRID}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${x(v).toFixed(1)}" y="${plotBottom + 18}" fill="${INK_2}" text-anchor="middle" ` +
        `font-family="system-ui, sans-serif" font-size="11">${v.toFixed(1)}</text>`,
    );
  }
  parts.push(
    `<text x="${LEFT}" y="${plotBottom + 36}" fill="${INK_2}" ` +
      `font-family="system-ui, sans-serif" font-size="11">milliseconds of GPU time per frame ` +
      `(one 60 Hz frame is ${(input.budgetMs ?? FRAME_BUDGET_60HZ_MS).toFixed(1)} ms)</text>`,
  );

  input.rows.forEach((row, i) => {
    const top = TOP + i * (groupH + GROUP_GAP);
    parts.push(
      `<text x="${LEFT - 12}" y="${top + groupH / 2 - 1}" fill="${INK}" text-anchor="end" ` +
        `font-family="ui-monospace, monospace" font-size="12.5">${esc(row.variant)}</text>`,
    );
    parts.push(
      `<text x="${LEFT - 12}" y="${top + groupH / 2 + 13}" fill="${INK_2}" text-anchor="end" ` +
        `font-family="system-ui, sans-serif" font-size="10.5">${row.sinCalls} sin/fragment</text>`,
    );
    row.values.forEach((v, s) => {
      const y = top + s * (BAR + BAR_GAP);
      const w = Math.max(1, x(v) - LEFT);
      parts.push(
        `<rect x="${LEFT}" y="${y}" width="${w.toFixed(1)}" height="${BAR}" rx="4" ` +
          `fill="${SERIES[s]}"><title>${esc(row.variant)} at ${esc(input.seriesLabels[s]!)}: ` +
          `${v.toFixed(3)} ms/frame</title></rect>`,
      );
      // DIRECT LABELS on every bar: six groups is few enough that a legend plus a value beside
      // each mark is more readable than a hover a committed SVG cannot offer anyway.
      parts.push(
        `<text x="${(LEFT + w + 8).toFixed(1)}" y="${y + BAR - 3}" fill="${INK_2}" ` +
          `font-family="ui-monospace, monospace" font-size="11">${v.toFixed(3)}</text>`,
      );
    });
  });

  parts.push('</svg>');
  return parts.join('\n');
}
