// frame-cost.test.ts — the arithmetic that decides whether a GPU-clock reading may be believed.
//
// Every case here is a way the instrument could report a plausible number about nothing. That
// is the failure this arc keeps meeting: a draw-call-bound floor that returned 0.02 ms for a
// full-frame quad, a single sample that published a 21% speed-up from strictly more work, an
// A/B whose arms were suspected of being the same scene. None of them looked broken.

import assert from 'node:assert/strict';
import test from 'node:test';

import { frameBudgetVerdict, type FrameCostReport } from './frame-budget.js';
import {
  GPU_TIMER_EXTENSION,
  MIN_ACCEPTED_SAMPLES,
  ORDER_OF_MAGNITUDE,
  acceptSamples,
  costBoundProse,
  costChartSvg,
  finishRouteVerdict,
  integrityVerdict,
  isInterleaved,
  roundRobinPlan,
  type TimingSample,
} from './frame-cost.js';

const sample = (gpu: number | null, wall: number, disjoint = false): TimingSample => ({
  gpuMsPerFrame: gpu,
  wallMsPerFrame: wall,
  disjoint,
});

const sound = (label: string, gpu: number[], wall: number[]) => ({
  label,
  accepted: acceptSamples(gpu.map((g, i) => sample(g, wall[i] ?? g))),
});

// ---------------------------------------------------------------- acceptance

test('a disjoint sample is DISCARDED, never averaged in', () => {
  const a = acceptSamples([
    sample(1.0, 1.1),
    sample(999, 1.1, true), // the GPU says this duration is garbage
    sample(1.2, 1.3),
  ]);
  assert.deepEqual(a.gpu, [1.0, 1.2]);
  assert.equal(a.discardedDisjoint, 1);
  assert.equal(a.attempted, 3);
  assert.ok(!a.gpu.includes(999), 'a disjoint reading reached the accepted set');
});

test('a disjoint sample takes its WALL half with it, so the two routes stay paired', () => {
  // The cross-check compares the two routes on the same work. Keeping the wall half of a
  // disturbed sample would bias one route against the other — the exact comparison at issue.
  const a = acceptSamples([sample(1.0, 5.0), sample(2.0, 900, true)]);
  assert.deepEqual(a.gpu, [1.0]);
  assert.deepEqual(a.wall, [5.0]);
});

test('a query that never returned counts as unavailable, not as zero', () => {
  const a = acceptSamples([sample(null, 1.0), sample(1.5, 1.6)]);
  assert.equal(a.discardedUnavailable, 1);
  assert.deepEqual(a.gpu, [1.5]);
  // A null read as 0 would drag a median toward zero and read as a very fast frame.
  assert.ok(!a.gpu.includes(0));
});

test('a non-finite GPU figure is discarded too', () => {
  const a = acceptSamples([sample(Number.NaN, 1), sample(Number.POSITIVE_INFINITY, 1), sample(2, 2)]);
  assert.deepEqual(a.gpu, [2]);
  assert.equal(a.discardedUnavailable, 2);
});

// ---------------------------------------------------------------- integrity

const identity = {
  extensionAvailable: true,
  renderer: 'NVIDIA GeForce RTX 2060/PCIe/SSE2',
  vendor: 'NVIDIA Corporation',
  software: false,
  hidden: false,
};

test('a clean run with enough samples is SOUND', () => {
  const v = integrityVerdict({
    ...identity,
    rows: [sound('none', [1, 1.1, 1.2, 1.15], [1, 1, 1, 1])],
  });
  assert.equal(v.status, 'SOUND');
  assert.deepEqual(v.reasons, []);
  assert.match(v.prose, /RTX 2060/);
});

test('no timer extension is UNVERIFIED — there is no GPU clock in that run', () => {
  const v = integrityVerdict({
    ...identity,
    extensionAvailable: false,
    rows: [sound('none', [1, 1, 1, 1], [1, 1, 1, 1])],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.reasons.join(' '), new RegExp(GPU_TIMER_EXTENSION));
});

test('a software rasteriser is UNVERIFIED, not a slow PASS', () => {
  const v = integrityVerdict({
    ...identity,
    renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    software: true,
    rows: [sound('none', [9, 9.1, 9.2, 9.05], [9, 9, 9, 9])],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.prose, /NOT a pass/);
});

test('a hidden page is UNVERIFIED', () => {
  const v = integrityVerdict({
    ...identity,
    hidden: true,
    rows: [sound('none', [1, 1, 1, 1], [1, 1, 1, 1])],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.reasons.join(' '), /hidden/);
});

test(`fewer than ${MIN_ACCEPTED_SAMPLES} accepted samples is UNVERIFIED — a zero spread would make every delta RESOLVED`, () => {
  const v = integrityVerdict({
    ...identity,
    rows: [
      {
        label: 'normal',
        accepted: acceptSamples([sample(1, 1), sample(9, 9, true), sample(9, 9, true)]),
      },
    ],
  });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.reasons.join(' '), /kept only 1 of 3/);
});

test('a MINORITY of samples surviving is UNVERIFIED even when the count clears the floor', () => {
  // 3 of 8 clears MIN_ACCEPTED_SAMPLES but is the quiet part of a disturbed run, selected by
  // the GPU's own interruptions rather than at random.
  const samples: TimingSample[] = [
    sample(1, 1),
    sample(1.1, 1),
    sample(1.2, 1),
    ...Array.from({ length: 5 }, () => sample(9, 9, true)),
  ];
  const v = integrityVerdict({ ...identity, rows: [{ label: 'both', accepted: acceptSamples(samples) }] });
  assert.equal(v.status, 'UNVERIFIED');
  assert.match(v.reasons.join(' '), /MINORITY/);
});

test('a bare majority survives', () => {
  const samples: TimingSample[] = [
    sample(1, 1),
    sample(1.1, 1),
    sample(1.2, 1),
    sample(1.3, 1),
    sample(9, 9, true),
    sample(9, 9, true),
    sample(9, 9, true),
  ];
  const v = integrityVerdict({ ...identity, rows: [{ label: 'both', accepted: acceptSamples(samples) }] });
  assert.equal(v.status, 'SOUND');
});

test('no configurations at all is UNVERIFIED', () => {
  assert.equal(integrityVerdict({ ...identity, rows: [] }).status, 'UNVERIFIED');
});

// ---------------------------------------------------------------- the gl.finish() cross-check

test('routes agreeing within the run\'s own noise REFUTES the finish() hypothesis', () => {
  const v = finishRouteVerdict({
    label: 'none @ 2px',
    gpu: [1.02, 1.05, 1.1, 1.08],
    wall: [1.04, 1.07, 1.12, 1.06],
  });
  assert.equal(v.hypothesis, 'REFUTED');
  assert.match(v.prose, /IS blocking/);
});

test('a GPU clock an order of magnitude above the wall clock ESTABLISHES it', () => {
  // The shape the standing hypothesis predicts: gl.finish() returns before the GPU has retired
  // the work, so the wall-clock route reports submission time only.
  const v = finishRouteVerdict({
    label: 'both @ 8px',
    gpu: [2.0, 2.1, 2.05, 2.2],
    wall: [0.02, 0.021, 0.019, 0.02],
  });
  assert.equal(v.hypothesis, 'ESTABLISHED');
  assert.ok(v.ratio >= ORDER_OF_MAGNITUDE);
  assert.match(v.prose, /timing CPU submission/);
});

test('a real but sub-order-of-magnitude gap is INCONCLUSIVE, and says why', () => {
  const v = finishRouteVerdict({
    label: 'normal @ 2px',
    gpu: [2.0, 2.02, 2.01, 2.03],
    wall: [1.0, 1.01, 1.02, 1.0],
  });
  assert.equal(v.hypothesis, 'INCONCLUSIVE');
  // Some gap is EXPECTED — the wall route also carries CPU submission and the finish()
  // round-trip — so a 2x gap must not be reported as either outcome.
  assert.match(v.prose, /Neither established nor refuted/);
});

test('the agreement bar is read off THIS run, not committed', () => {
  const tight = finishRouteVerdict({ label: 'a', gpu: [1.0, 1.0, 1.0], wall: [1.4, 1.4, 1.4] });
  const noisy = finishRouteVerdict({ label: 'a', gpu: [0.5, 1.0, 1.5], wall: [1.4, 1.4, 1.4] });
  // Identical medians, different in-run spreads: the noisy run cannot resolve what the tight
  // one can. A committed threshold would have called both the same.
  assert.equal(tight.hypothesis, 'INCONCLUSIVE');
  assert.equal(noisy.hypothesis, 'REFUTED');
});

test('unpaired samples cannot be compared', () => {
  const v = finishRouteVerdict({ label: 'x', gpu: [], wall: [1, 2] });
  assert.equal(v.hypothesis, 'INCONCLUSIVE');
  assert.match(v.prose, /no paired samples/);
});

// ---------------------------------------------------------------- how a cost is stated

/** Build a real report row through `frameBudgetVerdict` rather than hand-forging one. */
function rowsFor(base: number[], arm: number[]): FrameCostReport[] {
  return frameBudgetVerdict({
    rows: [
      { label: 'none', samples: base, software: false, hidden: false },
      { label: 'normal', samples: arm, software: false, hidden: false },
    ],
    baselineLabel: 'none',
  }).rows;
}

test('an UNRESOLVED cost is stated as the FLOOR, never as the measured delta', () => {
  const rows = rowsFor([1.0, 1.4, 1.2], [1.05, 1.45, 1.25]);
  const arm = rows.find((r) => r.label === 'normal')!;
  assert.equal(arm.resolution, 'BELOW_NOISE');
  const prose = costBoundProse(arm);
  // The bound is the noise floor (0.4 here), NOT the 0.05 delta the run happened to see.
  assert.match(prose, /at most 0\.400 ms/);
  assert.match(prose, /is NOT zero/);
  assert.doesNotMatch(prose, /0\.05/);
});

test('a RESOLVED cost is stated as the delta and its share of a frame', () => {
  const rows = rowsFor([1.0, 1.01, 1.02], [3.0, 3.01, 3.02]);
  const arm = rows.find((r) => r.label === 'normal')!;
  assert.equal(arm.resolution, 'RESOLVED');
  assert.match(costBoundProse(arm), /\+2\.000 ms\/frame/);
  assert.match(costBoundProse(arm), /2\.98x the control/);
});

test('an IMPOSSIBLE row is named as an instrument fault, not a saving', () => {
  const rows = rowsFor([3.0, 3.01, 3.02], [1.0, 1.01, 1.02]);
  const arm = rows.find((r) => r.label === 'normal')!;
  assert.equal(arm.resolution, 'IMPOSSIBLE');
  assert.match(costBoundProse(arm), /IMPOSSIBLE/);
});

test('the control row says so', () => {
  const rows = rowsFor([1, 1.1, 1.2], [1, 1.1, 1.2]);
  assert.equal(costBoundProse(rows[0]!), 'the control');
});

// ---------------------------------------------------------------- the sweep order

test('the sweep is round-robin, not repeats grouped by configuration', () => {
  const configs = ['none', 'normal', 'colour', 'both'];
  const plan = roundRobinPlan(configs, 3);
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.slice(0, 4), configs);
  assert.ok(isInterleaved(plan, configs));
});

test('grouped repeats are REJECTED by the interleaving check', () => {
  // The degenerate order this arc has to avoid: a GPU drifts over a run, so grouping aliases
  // that drift onto the variable and whichever arm went last always looks dearest.
  const configs = ['a', 'b'];
  const grouped = ['a', 'a', 'a', 'b', 'b', 'b'];
  assert.ok(!isInterleaved(grouped, configs));
});

test('a plan that lost a configuration is rejected', () => {
  assert.ok(!isInterleaved(['a', 'b', 'a'], ['a', 'b']));
});

test('a single configuration is trivially interleaved', () => {
  assert.ok(isInterleaved(['a', 'a'], ['a']));
});

// ---------------------------------------------------------------- the picture

const chart = () =>
  costChartSvg({
    title: 'What the land grain costs per frame',
    subtitles: ['RTX 2060', '2880x1920'],
    seriesLabels: ['2 px / ground unit', '8 px / ground unit'],
    rows: [
      { variant: 'none', sinCalls: 0, values: [0.098, 0.098] },
      { variant: 'normal', sinCalls: 32, values: [0.7, 0.699] },
      { variant: 'both', sinCalls: 40, values: [0.861, 0.85] },
    ],
  });

test('the chart carries every measured value as text, not only as a bar length', () => {
  // Direct labels on every mark: identity and magnitude are never carried by colour alone, and
  // a reader quoting the picture quotes a number the run actually produced.
  const svg = chart();
  for (const v of ['0.098', '0.700', '0.699', '0.861', '0.850']) {
    assert.ok(svg.includes(v), `the chart does not state ${v}`);
  }
});

test('the chart names both series and every variant', () => {
  const svg = chart();
  assert.ok(svg.includes('2 px / ground unit'));
  assert.ok(svg.includes('8 px / ground unit'));
  for (const v of ['none', 'normal', 'both']) assert.ok(svg.includes(`>${v}<`));
  // The arithmetic the measurement is read against travels with the picture.
  assert.ok(svg.includes('32 sin/fragment'));
});

test('bar length is monotonic in the measured value', () => {
  // A chart whose bars did not track its numbers would be the hand-written-sentence failure
  // with a wider blast radius: a reader checks a sentence and eyeballs a chart.
  const svg = chart();
  const widths = [...svg.matchAll(/<rect x="168" y="\d+" width="([\d.]+)" height="15" rx="4"/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(widths.length, 6, 'expected six bars');
  assert.ok(widths[0]! < widths[2]!, 'the control should be the shortest bar');
  assert.ok(widths[2]! < widths[4]!, 'both halves should be the longest bar');
});

test('the chart is a single-axis SVG with an accessible label', () => {
  const svg = chart();
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /aria-label="What the land grain costs per frame\./);
  assert.ok(svg.includes('one 60 Hz frame is 16.7 ms'));
});
