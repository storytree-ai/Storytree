import assert from 'node:assert/strict';
import test from 'node:test';

import { FRAME_BUDGET_60HZ_MS } from './frame-budget.js';
import { MIN_ACCEPTED_SAMPLES } from './frame-cost.js';
import {
  APPROVED_STACK_LAYERS,
  COVERAGE_MATCH_TOLERANCE_PCT,
  GROUND_FRAME_SHARE,
  MIN_GROUND_COVERAGE_PCT,
  isolationReasons,
  landFloorVerdict,
  sensitivityReasons,
  stackProse,
  voidnessReasons,
  type LandArmSamples,
  type LandFloorInput,
} from './land-floor.js';

// ---------------------------------------------------------------- fixtures
//
// A sound arm: real GPU clock, visible tab, hardware renderer, ground filling most of the frame.
// Every test below starts from THIS and breaks exactly one thing, so a failure names its cause.

function arm(
  label: string,
  samples: readonly number[],
  over: Partial<LandArmSamples> = {},
): LandArmSamples {
  return {
    label,
    samples,
    triangles: 2962,
    drawCalls: 1,
    octaves: 0,
    software: false,
    hidden: false,
    timerQueryAvailable: true,
    groundCoveragePct: 42,
    ...over,
  };
}

/** A run whose instrument is provably sighted and whose layer is cheap. The baseline every
 *  single-fault test perturbs. */
function soundRun(over: Partial<LandFloorInput> = {}): LandFloorInput {
  return {
    arms: [
      arm('flat', [1.0, 1.01, 0.99]),
      arm('grass', [1.2, 1.21, 1.19], { octaves: 23 }),
      arm('grass-amplified', [3.0, 3.01, 2.99], { octaves: 184 }),
    ],
    controlLabel: 'flat',
    layerLabel: 'grass',
    amplifiedLabel: 'grass-amplified',
    amplifyFactor: 8,
    ...over,
  };
}

// ---------------------------------------------------------------- ⚠ THE RUNG CAN GO RED
//
// The reason this whole module exists. `land-cost-instrument-arc-inc-01` asks for "a frame-time
// threshold that FAILS rather than describes", and the instrument it was written against has one
// that cannot fire — it scores a number measured blind to fragment work, on a scene costing under
// 1 ms against a 16.67 ms bar. A threshold that cannot go red is a vacuous green, so the first
// thing asserted here is that this one does.

test('a layer whose stack does not fit the frame FAILS the run', () => {
  // Control 1.0 ms, layer +2.5 ms. Seven layers at that cost come to 18.5 ms — over a 16.67 ms
  // frame — even though the ONE measured layer sits comfortably inside it.
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [3.5, 3.51, 3.49], { octaves: 23 }),
        arm('grass-amplified', [9.0, 9.01, 8.99], { octaves: 184 }),
      ],
    }),
  );
  assert.equal(verdict.status, 'FAIL');
  assert.equal(verdict.rung, 'BUDGET');
  assert.equal(verdict.failures.length, 1);
  assert.match(verdict.failures[0]!, /7 layers/);
  assert.ok(verdict.stackMsPerFrame !== null);
  assert.ok(verdict.stackMsPerFrame! > FRAME_BUDGET_60HZ_MS);
  assert.match(verdict.prose, /^FAIL/);
});

test('the same run passes when the layer is cheap enough for the stack to fit', () => {
  const verdict = landFloorVerdict(soundRun());
  assert.equal(verdict.status, 'PASS');
  assert.equal(verdict.rung, 'BUDGET');
  assert.deepEqual(verdict.failures, []);
  // 1.0 + 7 * 0.2 = 2.4 ms.
  assert.ok(Math.abs(verdict.stackMsPerFrame! - 2.4) < 1e-9);
});

test('the FAIL is produced by the layer cost alone — nothing else about the two runs differs', () => {
  // The pair above differ ONLY in the layer arm's samples. If the rung could fire for any other
  // reason this assertion would not hold, and the "it can go red" test would prove nothing.
  const cheap = landFloorVerdict(soundRun());
  const dear = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [3.5, 3.51, 3.49], { octaves: 23 }),
        arm('grass-amplified', [9.0, 9.01, 8.99], { octaves: 184 }),
      ],
    }),
  );
  assert.equal(cheap.status, 'PASS');
  assert.equal(dear.status, 'FAIL');
  assert.equal(cheap.rung, dear.rung);
  assert.equal(cheap.layers, dear.layers);
  assert.equal(cheap.budgetMs, dear.budgetMs);
});

test('an arm that cannot fit a frame on its own fails the ABSOLUTE rung too', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [20.0, 20.1, 19.9], { octaves: 23 }),
        arm('grass-amplified', [40.0, 40.1, 39.9], { octaves: 184 }),
      ],
    }),
  );
  assert.equal(verdict.status, 'FAIL');
  // Both the over-budget arms AND the stack extrapolation are named, not just the first.
  assert.ok(verdict.failures.some((f) => /"grass" costs/.test(f)));
  assert.ok(verdict.failures.some((f) => /"grass-amplified" costs/.test(f)));
  assert.ok(verdict.failures.some((f) => /7 layers/.test(f)));
});

// ---------------------------------------------------------------- rung 1: voidness

test('a software rasteriser voids the run rather than producing a verdict', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99], { software: true }),
        arm('grass', [1.2, 1.21, 1.19]),
        arm('grass-amplified', [3.0, 3.01, 2.99]),
      ],
    }),
  );
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'VOIDNESS');
  assert.match(verdict.unverified.join('\n'), /software rasteriser/);
  assert.deepEqual(verdict.costs, []);
  assert.equal(verdict.stackMsPerFrame, null);
});

test('a hidden tab, an absent GPU clock and an empty arm each void the run', () => {
  for (const broken of [
    { hidden: true },
    { timerQueryAvailable: false },
    { samples: [] as readonly number[] },
  ]) {
    const reasons = voidnessReasons(
      soundRun({
        arms: [
          arm('flat', [1.0, 1.01, 0.99], broken),
          arm('grass', [1.2, 1.21, 1.19]),
          arm('grass-amplified', [3.0, 3.01, 2.99]),
        ],
      }),
    );
    assert.ok(reasons.length > 0, `${JSON.stringify(broken)} must void the run`);
  }
});

test('a ground that barely drew voids the run — the timing would be of clearing the buffer', () => {
  const reasons = voidnessReasons(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99], { groundCoveragePct: MIN_GROUND_COVERAGE_PCT - 1 }),
        arm('grass', [1.2, 1.21, 1.19], { groundCoveragePct: MIN_GROUND_COVERAGE_PCT - 1 }),
        arm('grass-amplified', [3.0, 3.01, 2.99], { groundCoveragePct: MIN_GROUND_COVERAGE_PCT - 1 }),
      ],
    }),
  );
  assert.ok(reasons.some((r) => /essentially all sea/.test(r)));
});

test('SHIPPED framing is not a defect — an island on a sea clears the coverage floor', () => {
  // ⚠ THE RULE THIS PINS. The sibling instrument demands the ground FILL the frame because it
  // draws a synthetic fragment bed. This one draws the shipped map, where the sea is most of the
  // picture, and a floor inherited from the sibling would void every honest run.
  assert.ok(MIN_GROUND_COVERAGE_PCT < 50, 'a shipped-framing floor must admit a map that is mostly sea');
  assert.deepEqual(voidnessReasons(soundRun()), []);
});

test('a run too short to have a noise floor is void, not confidently resolved', () => {
  // ⚠⚠ CAUGHT ON THIS INSTRUMENT'S OWN FIRST REAL RUN. `spread()` is 0 below two samples, so a
  // one-repeat sweep reports a ZERO noise floor and every delta resolves against it — the
  // instrument getting MORE confident as the measurement got worse. A single-sample probe on the
  // dev box produced confident resolved deltas at every view before this rung existed.
  const oneShot = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0]),
        arm('grass', [9.0]),
        arm('grass-amplified', [20.0]),
      ],
    }),
  );
  assert.equal(oneShot.status, 'UNVERIFIED');
  assert.equal(oneShot.rung, 'VOIDNESS');
  assert.match(oneShot.unverified.join('\n'), /accepted sample/);
  // And it must NOT have produced the FAIL those numbers would otherwise justify.
  assert.deepEqual(oneShot.failures, []);
  assert.equal(oneShot.stackMsPerFrame, null);
});

test('the sample bar is the sibling instrument’s, imported rather than restated', () => {
  assert.equal(MIN_ACCEPTED_SAMPLES, 3);
  // Two samples give a range consisting of exactly one interval — a difference, not a distribution.
  assert.ok(
    voidnessReasons(
      soundRun({
        arms: [
          arm('flat', [1.0, 1.01]),
          arm('grass', [1.2, 1.21]),
          arm('grass-amplified', [3.0, 3.01]),
        ],
      }),
    ).length > 0,
  );
});

test('a run that names an arm it never measured is void, not silently short', () => {
  const reasons = voidnessReasons(
    soundRun({ arms: [arm('flat', [1.0, 1.01, 0.99]), arm('grass', [1.2, 1.21, 1.19])] }),
  );
  assert.ok(reasons.some((r) => /never measured it/.test(r)));
});

// ---------------------------------------------------------------- rung 2: isolation

test('arms differing in GEOMETRY cannot be judged as a fragment cost', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [1.2, 1.21, 1.19], { triangles: 2963 }),
        arm('grass-amplified', [3.0, 3.01, 2.99]),
      ],
    }),
  );
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'ISOLATION');
  assert.match(verdict.unverified.join('\n'), /differ in GEOMETRY/);
});

test('arms differing in SUBMISSION cannot be judged as a fragment cost', () => {
  const reasons = isolationReasons(
    [arm('flat', [1]), arm('grass', [1], { drawCalls: 2 })],
    'flat',
  );
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /differ in SUBMISSION/);
});

test('arms covering different fractions of the frame are paying for different pixels', () => {
  const reasons = isolationReasons(
    [
      arm('flat', [1], { groundCoveragePct: 42 }),
      arm('grass', [1], { groundCoveragePct: 42 + COVERAGE_MATCH_TOLERANCE_PCT + 0.01 }),
    ],
    'flat',
  );
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /different number of ground pixels/);
});

test('coverage within the tolerance is not a difference', () => {
  assert.deepEqual(
    isolationReasons(
      [
        arm('flat', [1], { groundCoveragePct: 42 }),
        arm('grass', [1], { groundCoveragePct: 42 + COVERAGE_MATCH_TOLERANCE_PCT - 0.01 }),
      ],
      'flat',
    ),
    [],
  );
});

// ---------------------------------------------------------------- rung 3: sensitivity
//
// ⚠⚠ THE RUNG THE REPLACED INSTRUMENT DID NOT HAVE. Without it, "this layer is cheap" and "this
// instrument cannot see shaders" are the same report, and the second reads as reassurance.

test('an amplified arm that did not move means the run CANNOT SEE fragment cost', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [1.0, 1.01, 0.99], { octaves: 23 }),
        // 8x the fragment work, and the clock did not notice.
        arm('grass-amplified', [1.0, 1.01, 0.99], { octaves: 184 }),
      ],
    }),
  );
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'SENSITIVITY');
  assert.match(verdict.unverified.join('\n'), /CANNOT\s+SEE fragment cost/);
});

test('a blind run is never reported as a cheap layer — the two must not collapse', () => {
  const blind = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [1.0, 1.01, 0.99]),
        arm('grass-amplified', [1.0, 1.01, 0.99]),
      ],
    }),
  );
  // A SIGHTED run whose layer happens to be too cheap to resolve: same null delta, different verdict.
  const sighted = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [1.0, 1.01, 0.99]),
        arm('grass-amplified', [3.0, 3.01, 2.99]),
      ],
    }),
  );
  assert.equal(blind.status, 'UNVERIFIED');
  assert.equal(sighted.status, 'PASS');
  assert.equal(sighted.stackMsPerFrame, null, 'an unresolved delta extrapolates to nothing');
  assert.match(sighted.prose, /NOT thereby shown to be cheap/);
});

test('the sensitivity rung is ONE-SIDED — it asks that the arm moved, never that it moved 8x', () => {
  // 8x the fragment work moving the FRAME by 1.5x is entirely honest: fragment cost is not the
  // only per-frame cost. Demanding the factor would red honest runs.
  assert.deepEqual(
    sensitivityReasons(
      soundRun({
        arms: [
          arm('flat', [1.0, 1.01, 0.99]),
          arm('grass', [1.05, 1.06, 1.04]),
          arm('grass-amplified', [1.5, 1.51, 1.49]),
        ],
      }),
    ),
    [],
  );
});

// ---------------------------------------------------------------- the order of the rungs
//
// Each rung outranks the next. A verdict from a lower rung would rest on a measurement a higher
// rung has already declared meaningless.

test('voidness outranks isolation, sensitivity and the budget', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99], { software: true }),
        // Also geometrically broken, also blind, and also far over budget.
        arm('grass', [40.0, 40.1, 39.9], { triangles: 99 }),
        arm('grass-amplified', [40.0, 40.1, 39.9], { triangles: 99 }),
      ],
    }),
  );
  assert.equal(verdict.rung, 'VOIDNESS');
});

test('isolation outranks sensitivity and the budget', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [40.0, 40.1, 39.9], { triangles: 99 }),
        arm('grass-amplified', [40.0, 40.1, 39.9]),
      ],
    }),
  );
  assert.equal(verdict.rung, 'ISOLATION');
});

test('sensitivity outranks the budget — a blind run may not even FAIL', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [40.0, 40.1, 39.9]),
        arm('grass', [40.0, 40.1, 39.9]),
        arm('grass-amplified', [40.0, 40.1, 39.9]),
      ],
    }),
  );
  // Every arm is far over a 16.67 ms frame, so the budget rung WOULD fail. It is not reached.
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'SENSITIVITY');
  assert.deepEqual(verdict.failures, []);
});

// ---------------------------------------------------------------- the authored constants

test('the stack multiplier is the approved ground’s seven layers', () => {
  assert.equal(APPROVED_STACK_LAYERS, 7);
  assert.equal(landFloorVerdict(soundRun()).layers, APPROVED_STACK_LAYERS);
});

test('the budget is the WHOLE frame — no chosen fraction', () => {
  // ⚠ The file this instrument replaces scored rungs against `16.7 * 1.35` and its own comment
  // calls 1.35 "a number picked to make the answer come out". Any fraction here would be that
  // move wearing a different digit.
  assert.equal(GROUND_FRAME_SHARE, 1);
  assert.equal(landFloorVerdict(soundRun()).budgetMs, FRAME_BUDGET_60HZ_MS);
});

test('the layer count and the budget are overridable, and the verdict follows them', () => {
  const input = soundRun({ layers: 100 });
  const verdict = landFloorVerdict(input);
  assert.equal(verdict.layers, 100);
  // 1.0 + 100 * 0.2 = 21 ms, over the frame.
  assert.equal(verdict.status, 'FAIL');
});

// ---------------------------------------------------------------- the prose

test('a PASS is stated as a NECESSARY condition, never as "affordable"', () => {
  const prose = stackProse('PASS', 2.4, FRAME_BUDGET_60HZ_MS, 7);
  assert.match(prose, /NECESSARY condition and not a sufficient one/);
  assert.doesNotMatch(prose, /affordable/);
});

test('a FAIL names the arithmetic rather than asserting a conclusion', () => {
  const prose = stackProse('FAIL', 18.5, FRAME_BUDGET_60HZ_MS, 7);
  assert.match(prose, /7 layers/);
  assert.match(prose, /18\.500 ms\/frame/);
});

test('an UNVERIFIED prose refuses to be read as a pass', () => {
  assert.match(
    stackProse('UNVERIFIED', null, FRAME_BUDGET_60HZ_MS, 7),
    /including that it passed/,
  );
});

test('the FAIL message names the extrapolation as an extrapolation', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        arm('flat', [1.0, 1.01, 0.99]),
        arm('grass', [3.5, 3.51, 3.49]),
        arm('grass-amplified', [9.0, 9.01, 8.99]),
      ],
    }),
  );
  const stackFailure = verdict.failures.find((f) => /7 layers/.test(f));
  assert.ok(stackFailure !== undefined);
  assert.match(stackFailure!, /EXTRAPOLATION/);
  assert.match(stackFailure!, /overstates/);
});

// ---------------------------------------------------------------- the costs table

test('every arm gets a cost row, and the control’s delta is null', () => {
  const verdict = landFloorVerdict(soundRun());
  assert.equal(verdict.costs.length, 3);
  const control = verdict.costs.find((c) => c.label === 'flat');
  assert.equal(control!.deltaMs, null);
  assert.equal(control!.resolved, false);
  const layer = verdict.costs.find((c) => c.label === 'grass');
  assert.ok(Math.abs(layer!.deltaMs! - 0.2) < 1e-9);
  assert.equal(layer!.resolved, true);
  assert.equal(layer!.octaves, 23);
});

test('a delta inside the noise floor is not resolved, and does not reach the stack', () => {
  const verdict = landFloorVerdict(
    soundRun({
      arms: [
        // A wide control: its own spread is 0.5 ms, so a 0.2 ms delta is not a measurement.
        arm('flat', [0.8, 1.0, 1.3]),
        arm('grass', [1.2, 1.21, 1.19]),
        arm('grass-amplified', [3.0, 3.01, 2.99]),
      ],
    }),
  );
  const layer = verdict.costs.find((c) => c.label === 'grass');
  assert.equal(layer!.resolved, false);
  assert.equal(verdict.stackMsPerFrame, null);
  assert.equal(verdict.status, 'PASS');
});
