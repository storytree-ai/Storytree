// run-agreement.ts — DOES THIS MEASUREMENT REPRODUCE? The between-run half of the land frame
// floor, kept pure and browser-free so it is provable without a GPU.
//
// ⚠⚠ WHY IT EXISTS. `land-cost-instrument-arc` end-state item 3: the reproducibility rule must be
// ENFORCED BY THE TOOL rather than remembered by the session. On the land increment before this
// one the forest rows came back 170–530% apart between runs and were dropped rather than averaged;
// only two rows reproduced. An instrument that reports a single run's number is reporting noise,
// and until now nothing stopped one being quoted. `land-floor-measure.mjs` inherited exactly that
// gap and said so in its own header: two runs were taken and diffed BY HAND.
//
// WHAT IS ALREADY DONE ELSEWHERE, so that it is not rebuilt here. The WITHIN-run half is
// `frame-cost.ts` and `land-floor.ts`: `acceptSamples` drops disjoint and unavailable readings,
// `MIN_ACCEPTED_SAMPLES` refuses a run too short to have a noise floor at all, and `spread()` is
// the bar a delta must clear inside one run. None of that compares run A to run B. This does, and
// only that.
//
// ⚠⚠ THE TOLERANCE IS DERIVED, NEVER AUTHORED, and this file's own neighbourhood is why. An
// earlier `hardware-floor.mjs` scored rungs against `16.7 * 1.35` and its comment records 1.35 as
// "a number picked to make the answer come out". A percentage here would be that move wearing a
// different digit. Instead: two runs of the same configuration should agree WITHIN THE NOISE THEY
// THEMSELVES MEASURED. Each run already reports that row's own spread, so the bar is the wider of
// them — the same "wider of the two" rule `frame-budget.ts` uses for a delta's noise floor, so the
// instrument holds one idea of noise rather than two.
//
// ⚠⚠ WHAT THIS CANNOT SEE: DRIFT BETWEEN INVOCATIONS. It compares runs taken minutes apart inside
// ONE invocation, which is where the 170-530% failure lived. It says nothing about the same box an
// hour later, and that gap is MEASURED rather than hypothetical — three invocations on the RTX
// 2060 on 2026-09-01:
//
//   flat@one@8    0.1644 · 0.1644 · 0.1460      grass@one@8   0.5862 · 0.5862 · 0.5178
//
// Every pair reproduced tightly WITHIN its own invocation and the third sat ~12% below the first
// two. The cause is the device's clock state, not the shader: the control moved by the same
// fraction as the treatment, so the RATIO held — grass/flat was 3.57 then 3.55, and the layer's
// delta was 2.57x then 2.55x the control. So an ABSOLUTE ms figure carries the box's clock state
// with it and must be quoted with the invocation that produced it; a ratio against the control
// travels. `forest@8`'s delta was the most stable figure of all (0.4205 · 0.4212 · 0.4212),
// which is worth knowing when choosing a view to quote: the larger scene appears to hold the GPU
// in a steadier clock state than the tiny one-island one.
//
// ⚠⚠ AGREEMENT IS NOT A STRENGTH CLAIM ON ITS OWN, AND MUST BE READ BESIDE THE COST RUNG. Because
// the bar is the runs' own noise, a NOISY run clears it trivially: measured on the Adreno dev box,
// a control arm whose within-run spread was 1.48 ms "reproduced" a between-run gap of 11.3%. That
// is not a hole — it is the two rungs composing correctly. A run loose enough to agree with
// anything is also too loose to RESOLVE anything, so `land-floor.ts` reports its delta as
// UNRESOLVED and no cost is quoted either way. What this rung removes is the opposite case: a
// TIGHT run whose second sweep lands somewhere else entirely, which looks authoritative and is the
// shape the 170-530% rows had.
//
// ⚠⚠ AND BYTE-IDENTICAL IS A WARNING SIGN, NOT THE BEST POSSIBLE OUTCOME. On this arc a control
// arm going stale under a sibling merge produces exactly that symptom
// (`comparison-baseline-moves-under-the-page`). For a GPU CLOCK over two independent sweeps, bit
// -identical medians are not "very reproducible" — they are near-impossible, and the likely cause
// is that the second sweep never ran. A verdict that scored equality highest would rank its own
// worst failure mode top, so {@link runAgreement} reports it as a SUSPICION instead.

/** One configuration's result within ONE run. */
export interface RunRow {
  /** The configuration this row measured — the same key in every run, or it is not the same row. */
  key: string;
  /** The median of that run's accepted repeats, ms/frame. */
  medianMs: number;
  /** That run's own within-run noise for this row: max minus min across its repeats. */
  spreadMs: number;
}

/** How many runs a reproducibility claim needs. Two is not a convention: one run has nothing to
 *  be compared against, so "it reproduced" is not a statement that can be made about it. */
export const MIN_RUNS_FOR_AGREEMENT = 2;

export type AgreementStatus =
  /** Every row reproduced within the noise the runs themselves measured. */
  | 'AGREED'
  /** At least one row did not, and is named. The surviving rows may still be quoted. */
  | 'ROWS_DROPPED'
  /** Fewer than {@link MIN_RUNS_FOR_AGREEMENT} runs. This is NOT a pass — it is the absence of
   *  the question having been asked. */
  | 'SINGLE_RUN'
  /** Nothing was measured at all. */
  | 'NO_RUNS';

export interface AgreementRow {
  key: string;
  /** This row's median in each run, in run order. */
  medians: number[];
  /** This row's within-run spread in each run, in run order. */
  spreads: number[];
  /** The widest disagreement between runs: max median minus min median. */
  gapMs: number;
  /** As a percentage of the smallest median — the figure the arc's 170–530% is quoted in. */
  gapPct: number;
  /** The bar the gap had to clear, DERIVED: the widest within-run spread across the runs. */
  toleranceMs: number;
  /** Did it reproduce? */
  agreed: boolean;
  /** Every run reported the IDENTICAL median. For a GPU clock this is a suspicion, not a triumph
   *  — see this file's header. */
  identical: boolean;
}

export interface AgreementVerdict {
  status: AgreementStatus;
  runs: number;
  rows: AgreementRow[];
  /** The keys that did not reproduce and may NOT be quoted. */
  droppedKeys: string[];
  /** One sentence per dropped row, naming the numbers rather than asserting a conclusion. */
  dropped: string[];
  /** Every row was bit-identical across runs — for a timing, evidence the second sweep did not
   *  happen rather than evidence of stability. Empty-safe: false when there are no rows. */
  suspectIdentical: boolean;
  /** The sentence the report prints, DERIVED rather than typed. */
  prose: string;
}

/** Largest minus smallest. Named rather than inlined: the mutation rung cannot attribute a mutant
 *  inside an inline arrow body to the test that kills it. */
function range(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let lo = xs[0]!;
  let hi = xs[0]!;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return hi - lo;
}

function largest(xs: readonly number[]): number {
  let hi = 0;
  for (const x of xs) {
    if (x > hi) hi = x;
  }
  return hi;
}

function smallest(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let lo = xs[0]!;
  for (const x of xs) {
    if (x < lo) lo = x;
  }
  return lo;
}

function allEqual(xs: readonly number[]): boolean {
  if (xs.length < 2) return false;
  const first = xs[0]!;
  for (const x of xs) {
    if (x !== first) return false;
  }
  return true;
}

/**
 * THE KEYS EVERY RUN MEASURED.
 *
 * ⚠ INTERSECTION, NOT UNION, AND THE DIFFERENCE IS REPORTED RATHER THAN SILENT. A row present in
 * one run and absent from another has not been shown to reproduce — there is nothing to compare
 * it against — so it is DROPPED for the same reason a disagreeing row is, and named. A union
 * would let a row measured once ride into the report on the reproducibility of its neighbours.
 */
export function sharedKeys(runs: readonly (readonly RunRow[])[]): string[] {
  const first = runs[0];
  if (first === undefined) return [];
  const out: string[] = [];
  for (const row of first) {
    let inAll = true;
    for (const run of runs) {
      if (!run.some(function hasKey(r: RunRow): boolean {
        return r.key === row.key;
      })) {
        inAll = false;
        break;
      }
    }
    if (inAll) out.push(row.key);
  }
  return out;
}

/**
 * Judge whether a set of runs reproduced each other, row by row.
 *
 * A row AGREES when the gap between the runs' medians is no wider than the widest within-run
 * spread any of them reported for it — i.e. when the difference between runs is explainable by the
 * noise the runs themselves measured. Anything wider is a real difference between two
 * measurements of the same thing, which is the definition of a figure that must not be quoted.
 *
 * ⚠ IT DOES NOT AVERAGE, AND WILL NOT. Averaging two readings that disagree by 500% produces a
 * number that describes neither, and the arc's rule is explicit that such rows are DROPPED and
 * SAID to be dropped. A silent drop is the same defect as a silent average.
 */
export function runAgreement(runs: readonly (readonly RunRow[])[]): AgreementVerdict {
  if (runs.length === 0) {
    return {
      status: 'NO_RUNS',
      runs: 0,
      rows: [],
      droppedKeys: [],
      dropped: [],
      suspectIdentical: false,
      prose: 'NO RUNS — nothing was measured, so nothing reproduced.',
    };
  }

  const keys = sharedKeys(runs);
  const rows: AgreementRow[] = [];
  const dropped: string[] = [];
  const droppedKeys: string[] = [];

  // A row measured by some runs but not all cannot be compared, so it is dropped and NAMED rather
  // than quietly carried on its neighbours' reproducibility.
  for (const run of runs) {
    for (const row of run) {
      if (!keys.includes(row.key) && !droppedKeys.includes(row.key)) {
        droppedKeys.push(row.key);
        dropped.push(
          `"${row.key}" was not measured by every run, so it has nothing to reproduce against`,
        );
      }
    }
  }

  for (const key of keys) {
    const medians: number[] = [];
    const spreads: number[] = [];
    for (const run of runs) {
      const row = run.find(function byKey(r: RunRow): boolean {
        return r.key === key;
      })!;
      medians.push(row.medianMs);
      spreads.push(row.spreadMs);
    }
    const gapMs = range(medians);
    const toleranceMs = largest(spreads);
    const base = smallest(medians);
    const gapPct = base === 0 ? 0 : (gapMs / base) * 100;
    const agreed = runs.length < MIN_RUNS_FOR_AGREEMENT ? false : gapMs <= toleranceMs;
    const row: AgreementRow = {
      key,
      medians,
      spreads,
      gapMs,
      gapPct,
      toleranceMs,
      agreed,
      identical: allEqual(medians),
    };
    rows.push(row);
    if (runs.length >= MIN_RUNS_FOR_AGREEMENT && !agreed) {
      droppedKeys.push(key);
      dropped.push(
        `"${key}" measured ${medians.map(function fmt(m: number): string {
          return m.toFixed(4);
        }).join(' vs ')} ms — a gap of ${gapMs.toFixed(4)} ms (${gapPct.toFixed(1)}%) against a ` +
          `${toleranceMs.toFixed(4)} ms tolerance derived from the runs' own within-run spread. ` +
          'DROPPED, not averaged',
      );
    }
  }

  const suspectIdentical =
    rows.length > 0 &&
    runs.length >= MIN_RUNS_FOR_AGREEMENT &&
    rows.every(function isIdentical(r: AgreementRow): boolean {
      return r.identical;
    });

  if (runs.length < MIN_RUNS_FOR_AGREEMENT) {
    return {
      status: 'SINGLE_RUN',
      runs: runs.length,
      rows,
      droppedKeys,
      dropped,
      suspectIdentical: false,
      prose:
        `SINGLE RUN — ${runs.length} run, so nothing here has been shown to reproduce. This is NOT ` +
        'a pass and NOT a tolerance that was met: it is the absence of the question having been ' +
        'asked. On the last land increment rows measured 170–530% apart between runs, so a ' +
        'single-run figure is not a slightly weaker number — it is one with no claim on being real.',
    };
  }

  if (droppedKeys.length > 0) {
    // Every distinct configuration any run touched — the honest denominator. `rows` holds only the
    // ones every run measured, so a row dropped for ABSENCE is not in it and would otherwise
    // vanish from the count as well as from the report.
    const considered = new Set<string>(droppedKeys);
    for (const r of rows) considered.add(r.key);
    return {
      status: 'ROWS_DROPPED',
      runs: runs.length,
      rows,
      droppedKeys,
      dropped,
      suspectIdentical,
      prose:
        `${droppedKeys.length} of ${considered.size} row(s) did not reproduce across ` +
        `${runs.length} runs and were DROPPED rather than averaged. The surviving rows may be ` +
        'quoted; the dropped ones may not, and each is named with its own numbers.',
    };
  }

  return {
    status: 'AGREED',
    runs: runs.length,
    rows,
    droppedKeys: [],
    dropped: [],
    suspectIdentical,
    prose: suspectIdentical
      ? `Every row reproduced across ${runs.length} runs — but every row is also BIT-IDENTICAL, ` +
        'which for a GPU clock over independent sweeps is near-impossible. Suspect the second ' +
        'sweep did not run, or that both runs read one cached result.'
      : `Every row reproduced across ${runs.length} runs, within the noise the runs themselves ` +
        'measured. Nothing was dropped.',
  };
}
