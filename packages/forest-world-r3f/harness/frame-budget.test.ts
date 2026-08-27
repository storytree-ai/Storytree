// frame-budget.test.ts — the rung, held to the one standard that matters for a rung: it must be
// able to REFUSE.
//
// ADR-0418 D4 bought back a weaker instrument than the one it retired and said so out loud. This
// module is the other half of that trade — a check that can fail a build on frame time, where
// before there was none. A check that cannot fail certifies nothing, so the tests below are
// written first as REFUSALS and only then as passes, and the UNVERIFIED path is tested hardest
// because it is the one that could silently become a pass.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRAME_BUDGET_60HZ_MS,
  frameBudgetVerdict,
  median,
  spread,
  type FrameCostRow,
} from './frame-budget.js';

/** A healthy row: real hardware, visible tab, and REPEATS that agree exactly — so the noise
 *  floor is zero and any delta resolves. Cases that care about noise pass their own samples. */
function row(label: string, gpuMsPerFrame: number, over: Partial<FrameCostRow> = {}): FrameCostRow {
  return {
    label,
    samples: [gpuMsPerFrame, gpuMsPerFrame, gpuMsPerFrame],
    software: false,
    hidden: false,
    ...over,
  };
}

/** A row carrying real, disagreeing repeats. */
function noisy(label: string, samples: number[], over: Partial<FrameCostRow> = {}): FrameCostRow {
  return { label, samples, software: false, hidden: false, ...over };
}

test('the budget is one whole frame at 60 Hz, not a rounded one', () => {
  assert.ok(Math.abs(FRAME_BUDGET_60HZ_MS - 16.6667) < 0.001);
  // The literal `hardware-floor.mjs` used to carry. Asserting they DIFFER is the point: if
  // someone "tidies" this back to 16.7 the drift becomes silent again.
  assert.notEqual(FRAME_BUDGET_60HZ_MS, 16.7);
});

test('a configuration over the budget FAILS', () => {
  // THE NON-VACUITY TEST. Before this module the same reading was recorded and reported green.
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), row('both halves', 20)] });
  assert.equal(v.status, 'FAIL');
  assert.equal(v.failures.length, 1);
  assert.match(v.failures[0]!, /both halves/);
  assert.match(v.failures[0]!, /20\.00 ms/);
  assert.match(v.prose, /^FAIL/);
});

test('a configuration inside the budget PASSES', () => {
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), row('normal half', 6)] });
  assert.equal(v.status, 'PASS');
  assert.deepEqual(v.failures, []);
  assert.match(v.prose, /^PASS/);
});

test('the boundary is exclusive — exactly one frame still fits', () => {
  // A frame that lands exactly on the budget has spent the budget, not exceeded it. Pinned
  // because an off-by-one here would make the rung fire on a scene that is precisely at 60 Hz.
  assert.equal(frameBudgetVerdict({ rows: [row('exact', FRAME_BUDGET_60HZ_MS)] }).status, 'PASS');
  assert.equal(
    frameBudgetVerdict({ rows: [row('over', FRAME_BUDGET_60HZ_MS + 0.001)] }).status,
    'FAIL',
  );
});

test('a SOFTWARE rasteriser is UNVERIFIED and never a pass', () => {
  // The trap this exists for: headless Chromium on the dev box rasterises through
  // ANGLE-on-SwiftShader, and a software frame time is not a hardware verdict — which is why
  // `hardware-floor.mjs` is a HEADED tool. A run that quietly passed here would report the
  // hardware floor as cleared on evidence containing no hardware.
  const v = frameBudgetVerdict({ rows: [row('no grain', 2, { software: true })] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified[0]!, /software/);
  assert.match(v.prose, /NOT a pass/);
});

test('UNVERIFIED OUTRANKS FAIL — a meaningless number cannot fail a run either', () => {
  // Both would-be failures are on a software rasteriser. Reporting FAIL here would be a verdict
  // about the scene drawn from a measurement already declared void, and it would train a reader
  // to ignore the rung.
  const v = frameBudgetVerdict({
    rows: [row('no grain', 40, { software: true }), row('both halves', 900, { software: true })],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.deepEqual(v.failures, []);
});

test('a HIDDEN tab is UNVERIFIED', () => {
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), row('normal half', 6, { hidden: true })] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified[0]!, /hidden/);
});

test('a ZERO baseline is UNVERIFIED rather than an infinite factor', () => {
  const v = frameBudgetVerdict({ rows: [row('no grain', 0), row('normal half', 6)] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified[0]!, /no control/);
});

test('a row with NO samples is UNVERIFIED', () => {
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), noisy('normal half', [])] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified.join(' '), /no samples/);
});

test('a missing baseline is UNVERIFIED', () => {
  const v = frameBudgetVerdict({
    rows: [row('no grain', 4), row('normal half', 6)],
    baselineLabel: 'a row that was never measured',
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified[0]!, /not among the measured/);
});

test('measuring nothing is UNVERIFIED, not a vacuous pass', () => {
  // The shape this arc has been bitten by twice: an empty run reading as a clean one.
  const v = frameBudgetVerdict({ rows: [] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.unverified[0]!, /no configurations/);
});

test('the cost of an addition is reported against the CONTROL, not against a tolerance', () => {
  // The arithmetic a detail decision actually spends. `hardware-floor.mjs` records that an
  // earlier version scored rungs against `16.7 * 1.35` and that "1.35 was a number picked to
  // make the answer come out" — so the delta is stated against the same scene with the feature
  // off, and the only fixed number in the verdict is the frame itself.
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), row('normal half', 6)] });
  const baseline = v.rows.find((r) => r.label === 'no grain')!;
  const grained = v.rows.find((r) => r.label === 'normal half')!;

  // The baseline has no delta against itself — reporting 0 would read as "measured, and free".
  assert.equal(baseline.deltaVsBaselineMs, null);
  assert.equal(baseline.factorVsBaseline, null);
  assert.equal(baseline.deltaSharePct, null);

  assert.equal(grained.deltaVsBaselineMs, 2);
  assert.equal(grained.factorVsBaseline, 1.5);
  assert.ok(Math.abs(grained.sharePct - (6 / FRAME_BUDGET_60HZ_MS) * 100) < 1e-9);
  assert.ok(Math.abs(grained.deltaSharePct! - (2 / FRAME_BUDGET_60HZ_MS) * 100) < 1e-9);
});

test('the prose is DERIVED and names the dearest addition', () => {
  // `cadence-verdict.ts` exists because a hand-typed sentence in this same report was once
  // false while every computed number in it held up. This follows that correction.
  const v = frameBudgetVerdict({
    rows: [row('no grain', 4), row('normal half', 6), row('both halves', 9)],
  });
  assert.equal(v.status, 'PASS');
  assert.match(v.prose, /both halves/);
  assert.match(v.prose, /\+5\.00 ms/);
  assert.match(v.prose, /2\.25x the control/);
});

test('a custom budget is honoured, so a stricter floor can be asserted', () => {
  const v = frameBudgetVerdict({ rows: [row('no grain', 4), row('normal half', 6)], budgetMs: 5 });
  assert.equal(v.status, 'FAIL');
  assert.equal(v.failures.length, 1);
  assert.match(v.failures[0]!, /normal half/);
});

// ---------------------------------------------------------------- resolution
//
// THESE FOUR ARE THE ONES THIS MODULE EXISTS FOR, AND THEY COME FROM A REAL RUN. The first
// version of this rung took ONE sample per configuration and reported, on real hardware
// (Adreno X1-85, 171 plants, 2880x1920), that the grain made rendering FASTER: `both halves` at
// 0.97 ms against an ungrained 1.23 ms. Two readings of the IDENTICAL configuration in the same
// run differed by 43%. A single sample published a physical impossibility as a measurement.

test('median and spread are the plain arithmetic, including the even case', () => {
  assert.equal(median([3]), 3);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
  assert.equal(spread([1, 5, 3]), 4);
  // One sample has no spread to report — and that is not the same as "no noise", which is why
  // a single-sample row can never RESOLVE a delta smaller than itself.
  assert.equal(spread([7]), 0);
  assert.equal(spread([]), 0);
});

test('a delta SMALLER than the run-to-run noise is withheld, not reported as a small cost', () => {
  // The exact shape of the real run: a ~0.03 ms difference sitting inside a ~0.3 ms spread.
  const v = frameBudgetVerdict({
    rows: [noisy('no grain', [1.0, 1.3, 1.15]), noisy('colour half', [1.05, 1.35, 1.18])],
  });
  assert.equal(v.status, 'PASS', 'the budget claim still holds — it is the COST claim that fails');
  const grained = v.rows.find((r) => r.label === 'colour half')!;
  assert.equal(grained.resolution, 'BELOW_NOISE');
  // WITHHELD. A number printed beside a wider noise floor gets quoted, and the reader who quotes
  // it is not being careless — it was right there.
  assert.equal(grained.deltaVsBaselineMs, null);
  assert.equal(grained.factorVsBaseline, null);
  assert.equal(grained.deltaSharePct, null);
  assert.ok(grained.noiseFloorMs > 0);
  // ...and the pass says so, so "PASS" cannot be read as "and we know what it costs".
  assert.match(v.prose, /UNRESOLVED rather than zero/);
});

test('a configuration that measures CHEAPER while doing more work is UNVERIFIED', () => {
  // THE ONE THAT CAUGHT THE REAL RUN. Adding fragment work cannot subtract cost, so this is the
  // instrument failing — reporting it as a saving would have published an impossibility.
  const v = frameBudgetVerdict({
    rows: [noisy('no grain', [1.23, 1.24, 1.23]), noisy('both halves', [0.97, 0.96, 0.97])],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.equal(v.rows.find((r) => r.label === 'both halves')!.resolution, 'IMPOSSIBLE');
  assert.match(v.prose, /contradicts itself/);
  assert.match(v.prose, /cannot subtract cost/);
  assert.match(v.prose, /NOT a pass/);
  assert.deepEqual(v.failures, [], 'an instrument fault is not a verdict about the scene');
});

test('a delta that CLEARS the noise floor resolves and is quotable', () => {
  const v = frameBudgetVerdict({
    rows: [noisy('no grain', [1.0, 1.1, 1.05]), noisy('normal half', [3.0, 3.1, 3.05])],
  });
  assert.equal(v.status, 'PASS');
  const grained = v.rows.find((r) => r.label === 'normal half')!;
  assert.equal(grained.resolution, 'RESOLVED');
  assert.ok(Math.abs(grained.deltaVsBaselineMs! - 2) < 1e-9);
  assert.ok(grained.factorVsBaseline! > 2.8);
  assert.doesNotMatch(v.prose, /UNRESOLVED/);
});

test('the noise floor is the WIDER of the two rows, not just the baseline', () => {
  // A steady control does not license quoting a delta from a wildly variable row.
  const v = frameBudgetVerdict({
    rows: [noisy('no grain', [1.0, 1.0, 1.0]), noisy('normal half', [1.1, 3.0, 1.2])],
  });
  const grained = v.rows.find((r) => r.label === 'normal half')!;
  assert.ok(grained.noiseFloorMs >= 1.9, `noise floor ${grained.noiseFloorMs} ignored the row itself`);
  assert.equal(grained.resolution, 'BELOW_NOISE');
});
