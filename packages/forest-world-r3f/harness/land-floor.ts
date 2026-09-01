// land-floor.ts — the PURE half of the LAND FRAME FLOOR: the arithmetic that decides whether a
// ground LAYER may be called affordable, and the rungs that REFUSE a run rather than describing it.
// Browser-free and bun/node-test-provable, fenced into `harness/` with the rest of the experiment.
//
// ⚠⚠ WHY A THIRD FRAME INSTRUMENT EXISTS, WHEN `hardware-floor.*` ALREADY HAS A THRESHOLD AND A
// MATERIAL SWAP. Because `land-cost-instrument-arc-inc-01` was parked against a reading of that
// file that its own source refutes, AND the direction it was pointing is still right. Both halves
// of the parked premise are false as written, and the real gap underneath them is sharper:
//
//   "no threshold reds a run"        FALSE. `hardware-floor.mjs` computes `frameBudgetVerdict`
//                                    and `fail()`s on FAIL. Its own comment says so.
//   "it swaps in no alternate        FALSE. `FloorRunSpec.grain` swaps the GROUND material only,
//    material"                       and the driver runs a four-arm interleaved grain A/B.
//
// WHAT IS ACTUALLY BROKEN, and neither sentence reaches it:
//
//   1. THE THRESHOLD IS VACUOUS FOR FRAGMENT COST, because the number it judges cannot see
//      fragment cost. It scores `FloorReading.gpuMsPerFrame`, whose own type says: *not GPU
//      time* — 29x to 255x disagreement against `EXT_disjoint_timer_query_webgl2` over 12/12
//      configurations, and BLIND TO AN 8.7x CHANGE IN REAL GPU WORK. A ground shader made ten
//      times dearer per fragment moves it by approximately nothing and the rung reports green.
//      A rung that cannot fail for the thing it is pointed at is a vacuous green, which is this
//      repository's commonest fault class.
//   2. AND IT COULD NOT FAIL ON THE ABSOLUTE NUMBER EITHER: FAIL needs a row over 16.67 ms, and
//      that whole scene costs under 1 ms. The rung is unreachable from both directions at once.
//   3. THE MATERIAL SWAP CANNOT REACH THE LAYER THE ARC IS ABOUT. `hardware-floor.ts`'s
//      `buildLand` dresses its ground with `harness/banded-material.ts`, which has NO grass
//      option at all. The 23-octave grass layer lives on `src/banded-ground-material.ts` and is
//      reachable only through `buildGroundMaterial` — so the layer whose affordability is the
//      arc's sharpest question is STRUCTURALLY unreachable by the instrument meant to price it.
//   4. AND ITS CONTROL CAN GO STALE. `buildLand` hand-assembles a scene instead of calling
//      `shippedGroundBuild`, which is `comparison-baseline-moves-under-the-page` exactly: the
//      skirt's page built its own scene and its CONTROL arm quietly became the map as it stood
//      an hour earlier.
//
// SO THIS MODULE OWNS THE FOUR RUNGS, AND THEIR ORDER IS THE POINT rather than an implementation
// detail. Each one outranks the next, because a verdict from a lower rung would be a statement
// about a measurement the higher rung has already said means nothing:
//
//   1. VOIDNESS      — software rasteriser, hidden tab, no GPU clock, no samples, a ground that
//                      did not fill the frame. Nothing may be concluded. UNVERIFIED.
//   2. ISOLATION     — the arms must differ in the FRAGMENT STAGE AND NOWHERE ELSE. Identical
//                      triangles and identical draw calls, or the delta is not fragment cost and
//                      cannot be judged as fragment cost. UNVERIFIED.
//   3. SENSITIVITY   — the instrument must PROVE, in this same run, that it can see fragment
//                      cost at all, by measuring an arm deliberately made dearer. If that arm
//                      does not move beyond the noise floor, the instrument is BLIND and a cheap
//                      reading on the real layer means nothing. UNVERIFIED.
//   4. THE BUDGET    — only now. PASS or FAIL.
//
// ⚠⚠ RUNG 3 IS THE ONE THAT MAKES THE OTHER THREE WORTH HAVING, and it is what `hardware-floor`
// never had. Without it, "this layer costs less than the noise floor" and "this instrument cannot
// see shaders" produce the SAME report, and the second one reads as reassurance. The grain A/B on
// `hardware-floor.mjs` returned exactly that null and its own header records the ambiguity:
// a cost "below the noise floor, which is indistinguishable from the `grain` option never
// reaching the material at all". Rung 3 makes those two outcomes different by construction.

import {
  FRAME_BUDGET_60HZ_MS,
  median,
  spread,
  type FrameBudgetStatus,
} from './frame-budget.js';
import { MIN_ACCEPTED_SAMPLES } from './frame-cost.js';

/**
 * HOW MANY LAYERS THE APPROVED GROUND STACKS — the multiplier the stack rung extrapolates by.
 *
 * ⚠ IT IS CITED, NOT CHOSEN. ADR-0490 D3 makes layer 1 the floor "every other layer of the
 * approved ground composites over", and the approved render is measured as the composite of all
 * of them — `docs/research/chapter2-shipped-grass-2026-09-01/README.md` prints its reference row
 * as *"the approved render — (all 7 layers)"*. This is that seven. The whole stack has to ship
 * together or the picture is not the approved picture, which is what makes a per-layer cost a
 * statement about the stack rather than about one layer.
 */
export const APPROVED_STACK_LAYERS = 7;

/**
 * THE SHARE OF THE FRAME THE GROUND MAY SPEND.
 *
 * ⚠⚠ ONE, AND DELIBERATELY NOT A FRACTION. The file this one exists to correct has already paid
 * for a chosen tolerance: an earlier `hardware-floor.mjs` scored rungs against `16.7 * 1.35` and
 * its own comment calls 1.35 *"a number picked to make the answer come out"*. Any fraction here
 * would be the same move wearing a different digit — there is no measurement that says the ground
 * may have 40% or 70% of a frame.
 *
 * So the bound is the WHOLE frame, and it is deliberately the most GENEROUS bound available: a
 * stack that fails against the whole frame has left no room for the plants, the props, the water,
 * the UI or the compositor, and is unaffordable on any accounting. A stack that PASSES here has
 * cleared a necessary condition and not a sufficient one, and {@link stackProse} says so in the
 * sentence it hands the report rather than leaving a reader to infer it.
 */
export const GROUND_FRAME_SHARE = 1;

/** One arm, as the driver hands it over: the repeats it collected and what was on screen. */
export interface LandArmSamples {
  label: string;
  /** GPU-CLOCK ms per frame, one entry per accepted repeat. The `EXT_disjoint_timer_query_webgl2`
   *  route — never the `gl.finish()` wall clock, which is what rung 1 of this file's header is
   *  about. */
  samples: readonly number[];
  /** Triangles submitted per frame. Must match the control's, or rung 2 refuses. */
  triangles: number;
  /** Draw calls per frame. Must match the control's, or rung 2 refuses. */
  drawCalls: number;
  /** Lattice-noise octaves this arm evaluates per ground fragment, over the control's. Reported
   *  beside the measured cost so a reader can see whether the arithmetic and the clock agree. */
  octaves: number;
  software: boolean;
  hidden: boolean;
  timerQueryAvailable: boolean;
  /** Percentage of the frame the ground actually covered, or `null` when not measured. A layer
   *  costed on a frame the ground half-filled is costed at half price. */
  groundCoveragePct: number | null;
}

/** What the whole run needs to know about the two special arms besides the control. */
export interface LandFloorInput {
  arms: readonly LandArmSamples[];
  /** The control: the shipped ground exactly as it draws today. */
  controlLabel: string;
  /** The arm under test — the layer whose cost is the question. */
  layerLabel: string;
  /** The SENSITIVITY CONTROL: the same layer, deliberately made dearer by a known factor. */
  amplifiedLabel: string;
  /** How much dearer the amplified arm's fragment work is, by construction. */
  amplifyFactor: number;
  /** Layers in the stack this layer belongs to. Defaults to {@link APPROVED_STACK_LAYERS}. */
  layers?: number;
  /** One frame's budget, ms. Defaults to 60 Hz. */
  budgetMs?: number;
  /** The lowest ground coverage a timing may be quoted at, percent. */
  minCoveragePct?: number;
}

/**
 * THE COVERAGE FLOOR a timing must clear — and it is deliberately LOW, which is the opposite of
 * the sibling instrument's rule and is a considered difference rather than a slackening.
 *
 * `frame-cost-scene.ts` demands the ground fill the frame, because it draws a synthetic quad
 * whose only purpose is to be a fragment bed: there, anything short of full coverage means the
 * scene was built wrong. THIS instrument draws the SHIPPED map — islands on a painted sea — so
 * the ground covers what the map actually shows, and that is not a defect to be corrected but
 * THE MEASUREMENT. A layer only costs on the pixels the land occupies, so the delta taken at
 * shipped framing IS the per-frame cost the shipped map pays for the layer. Demanding 100% here
 * would replace the question "what does this cost the map" with "what would it cost a map made
 * entirely of land", and then void every honest run for failing to be that.
 *
 * So the floor catches one thing only: a scene that did not draw. Below it the frame is
 * essentially all sea and the timing is a measurement of clearing the buffer.
 *
 * ⚠ WHAT CARRIES THE ISOLATION IS NOT THIS FLOOR BUT {@link isolationReasons}' EQUALITY CHECK.
 * The arms must cover the SAME fraction of the frame as each other; a layer that changed how much
 * ground was drawn would be paying for different pixels, and the delta would not be its shader.
 */
export const MIN_GROUND_COVERAGE_PCT = 5;

/**
 * How far two arms' ground coverage may differ before the isolation rung refuses, in percentage
 * points of the frame.
 *
 * The arms draw byte-identical geometry through one camera, so the honest expectation is that
 * this is ZERO. It is not asserted at zero because coverage is measured by "this pixel is not the
 * background colour", and a layer that tinted a land pixel to exactly the sea's bytes would move
 * the count by a pixel or two without changing what was drawn. Half a percentage point is far
 * below any real difference in drawn ground and far above that.
 */
export const COVERAGE_MATCH_TOLERANCE_PCT = 0.5;

/** One arm's measured cost, after the run has been judged sound enough to quote. */
export interface LandArmCost {
  label: string;
  /** Median of this arm's repeats, ms/frame on the GPU clock. */
  gpuMsPerFrame: number;
  /** Max minus min across the repeats — this arm's own noise. */
  spreadMs: number;
  samples: number;
  octaves: number;
  /** Cost above the control. `null` on the control itself. */
  deltaMs: number | null;
  /** Whether that delta cleared the noise floor and may be quoted at all. */
  resolved: boolean;
  /** The bar the delta had to clear: the wider of the control's spread and this arm's. */
  noiseFloorMs: number;
}

export interface LandFloorVerdict {
  status: FrameBudgetStatus;
  /** Which rung produced the status. `BUDGET` means the run got all the way to the question. */
  rung: 'VOIDNESS' | 'ISOLATION' | 'SENSITIVITY' | 'BUDGET';
  budgetMs: number;
  layers: number;
  costs: LandArmCost[];
  /** What the whole stack would cost if every layer cost what this one did. `null` when the
   *  layer's own delta never resolved, because an unresolved delta extrapolates to nothing. */
  stackMsPerFrame: number | null;
  /** Why nothing may be concluded. Empty unless UNVERIFIED. */
  unverified: string[];
  /** Why it failed. Empty unless FAIL. */
  failures: string[];
  /** The sentence the report prints, DERIVED rather than typed — `cadence-verdict.ts` exists
   *  because a hand-written sentence in a sibling report was false while every computed number
   *  in it held up. */
  prose: string;
}

/** Find one arm by label, or `undefined`. Named rather than inlined: the mutation rung cannot
 *  attribute a mutant inside an inline arrow body to the test that kills it. */
function armNamed(
  arms: readonly LandArmSamples[],
  label: string,
): LandArmSamples | undefined {
  for (const a of arms) {
    if (a.label === label) return a;
  }
  return undefined;
}

/**
 * RUNG 1 — may anything here be believed at all?
 *
 * Every entry is a property of the MEASUREMENT rather than of the land, which is why it outranks
 * both the isolation rung and the budget: a software rasteriser's frame time is not a hardware
 * verdict however well isolated it is, and a run that could not read the GPU clock has no cost
 * figure to judge in the first place.
 */
export function voidnessReasons(input: LandFloorInput): string[] {
  const out: string[] = [];
  const minCoverage = input.minCoveragePct ?? MIN_GROUND_COVERAGE_PCT;
  if (input.arms.length === 0) {
    out.push('no arms were measured at all');
    return out;
  }
  for (const label of [input.controlLabel, input.layerLabel, input.amplifiedLabel]) {
    if (armNamed(input.arms, label) === undefined) {
      out.push(`the run names "${label}" as an arm but never measured it`);
    }
  }
  for (const a of input.arms) {
    if (a.software) {
      out.push(
        `"${a.label}" reported a software rasteriser — a software frame time is not a hardware ` +
          'verdict, and this rung exists so it can never be quoted as one',
      );
    }
    if (a.hidden) {
      out.push(`"${a.label}" was measured with the tab hidden — every timing on it is void`);
    }
    if (!a.timerQueryAvailable) {
      out.push(
        `"${a.label}" had no ${'EXT_disjoint_timer_query_webgl2'} — without the GPU's own clock ` +
          'this instrument is the one it was built to replace',
      );
    }
    // ⚠⚠ A SAMPLE COUNT, NOT A TOLERANCE, AND THE DIFFERENCE IS THE WHOLE POINT. `spread()`
    // returns 0 for fewer than two samples, so a row down to ONE accepted reading reports a noise
    // floor of ZERO and every delta against it resolves, however small — the instrument would get
    // MORE confident as the measurement got worse. Caught on this instrument's own first real run:
    // a one-repeat probe produced confident resolved deltas at every view. The bar is
    // `frame-cost.ts`'s, imported rather than restated so the two instruments cannot drift apart.
    //
    // The test of an honest bar is where a number picked to PASS would have sat: at 1 — accept
    // whatever came back — which is the configuration that cannot fail.
    if (a.samples.length < MIN_ACCEPTED_SAMPLES) {
      out.push(
        `"${a.label}" carries ${a.samples.length} accepted sample(s), under the ` +
          `${MIN_ACCEPTED_SAMPLES} a noise floor needs to be a statement about the run rather ` +
          'than zero',
      );
    }
    if (a.groundCoveragePct !== null && a.groundCoveragePct < minCoverage) {
      out.push(
        `"${a.label}" drew ground over only ${a.groundCoveragePct.toFixed(1)}% of the frame ` +
          `(floor ${minCoverage}%) — at that coverage the frame is essentially all sea and the ` +
          'timing measures clearing the buffer rather than shading the land',
      );
    }
  }
  return out;
}

/**
 * RUNG 2 — do the arms differ in the FRAGMENT STAGE AND NOWHERE ELSE?
 *
 * ⚠ THIS IS THE WHOLE ISOLATION CLAIM, AND IT IS CHECKED RATHER THAN COMMENTED. Layer 1 adds no
 * geometry: `shipped-grass-scene.ts` already records that its correct triangle delta is ZERO and
 * that an arm whose count differs "is a page that changed something else and called it the
 * grass". The same is true of draw calls — a second call would be a second submission, and
 * submission is precisely the cost that swamped the instrument this one replaces.
 *
 * So an arm that differs geometrically does not FAIL: its delta is simply not a fragment cost,
 * and a number that is not the quantity under test can neither pass nor fail a test of it.
 */
export function isolationReasons(
  arms: readonly LandArmSamples[],
  controlLabel: string,
): string[] {
  const out: string[] = [];
  const control = armNamed(arms, controlLabel);
  if (control === undefined) return out;
  for (const a of arms) {
    if (a.label === controlLabel) continue;
    if (a.triangles !== control.triangles) {
      out.push(
        `"${a.label}" submits ${a.triangles} triangles against the control's ${control.triangles} ` +
          '— the arms differ in GEOMETRY, so their delta is not fragment cost',
      );
    }
    if (a.drawCalls !== control.drawCalls) {
      out.push(
        `"${a.label}" makes ${a.drawCalls} draw calls against the control's ${control.drawCalls} ` +
          '— the arms differ in SUBMISSION, so their delta is not fragment cost',
      );
    }
    if (a.groundCoveragePct !== null && control.groundCoveragePct !== null) {
      const gap = Math.abs(a.groundCoveragePct - control.groundCoveragePct);
      if (gap > COVERAGE_MATCH_TOLERANCE_PCT) {
        out.push(
          `"${a.label}" covers ${a.groundCoveragePct.toFixed(2)}% of the frame against the ` +
            `control's ${control.groundCoveragePct.toFixed(2)}% — the arms are paying for a ` +
            'different number of ground pixels, so their delta is not this layer\'s shader',
        );
      }
    }
  }
  return out;
}

/**
 * RUNG 3 — CAN THIS INSTRUMENT SEE FRAGMENT COST AT ALL, in this run, on this box?
 *
 * ⚠⚠ THE RUNG THE INSTRUMENT THIS ONE REPLACES DID NOT HAVE, and the reason it is not optional.
 * "The layer cost less than the noise floor" and "the material swap never reached the shader" and
 * "this route cannot see shaders" all produce the SAME report — a null — and a null reads as
 * reassurance. `hardware-floor.mjs`'s grain A/B published exactly that null, and `frame-cost.ts`'s
 * header records that it was "indistinguishable from the `grain` option never reaching the
 * material at all".
 *
 * The amplified arm is the same layer with its fragment work multiplied by a known factor and its
 * GEOMETRY untouched, so its delta MUST resolve. When it does not, the honest report is that this
 * run could not have seen the layer either — which is UNVERIFIED, not a cheap layer.
 *
 * ⚠ AND IT IS A ONE-SIDED CHECK ON PURPOSE. It asks that the amplified arm moved, never that it
 * moved by the factor: fragment cost is not the only per-frame cost, so a shader made 8x dearer
 * moves the FRAME by less than 8x and demanding otherwise would fail honest runs.
 */
export function sensitivityReasons(input: LandFloorInput): string[] {
  const out: string[] = [];
  const control = armNamed(input.arms, input.controlLabel);
  const amplified = armNamed(input.arms, input.amplifiedLabel);
  if (control === undefined || amplified === undefined) return out;
  if (control.samples.length === 0 || amplified.samples.length === 0) return out;

  const base = median(control.samples);
  const amp = median(amplified.samples);
  const floor = Math.max(spread(control.samples), spread(amplified.samples));
  const delta = amp - base;
  if (delta <= floor) {
    out.push(
      `the sensitivity control "${input.amplifiedLabel}" evaluates the layer ` +
        `${input.amplifyFactor}x over and still measured only ${delta.toFixed(4)} ms above the ` +
        `control, inside this run's ${floor.toFixed(4)} ms noise floor. This run therefore CANNOT ` +
        'SEE fragment cost, and a small reading on the real layer is not evidence that the layer ' +
        'is cheap — it is the same null a blind instrument returns',
    );
  }
  return out;
}

/** One arm's cost against the control. */
function costOf(
  arm: LandArmSamples,
  base: number,
  baseSpread: number,
  isControl: boolean,
): LandArmCost {
  const value = median(arm.samples);
  const ownSpread = spread(arm.samples);
  const noiseFloorMs = Math.max(baseSpread, ownSpread);
  const deltaMs = isControl ? null : value - base;
  return {
    label: arm.label,
    gpuMsPerFrame: value,
    spreadMs: ownSpread,
    samples: arm.samples.length,
    octaves: arm.octaves,
    deltaMs,
    resolved: deltaMs !== null && Math.abs(deltaMs) > noiseFloorMs,
    noiseFloorMs,
  };
}

/**
 * THE SENTENCE the report prints for a judged run.
 *
 * ⚠ A PASS IS STATED AS THE NECESSARY CONDITION IT IS. The budget is the WHOLE frame
 * ({@link GROUND_FRAME_SHARE}), so clearing it means the ground stack alone would fit in a frame
 * that also has to draw the plants, the props, the water and the UI. Writing that as "affordable"
 * would be the reassuring half of a two-sided fact.
 */
export function stackProse(
  status: FrameBudgetStatus,
  stackMs: number | null,
  budgetMs: number,
  layers: number,
): string {
  if (status === 'UNVERIFIED') {
    return 'UNVERIFIED — nothing may be concluded from this run, including that it passed.';
  }
  if (stackMs === null) {
    return (
      `PASS on the absolute rung, but the layer's own cost never cleared this run's noise floor, ` +
      'so the stack could not be extrapolated. The layer is NOT thereby shown to be cheap: its ' +
      'cost is unknown below the floor and is not zero.'
    );
  }
  const sharePct = (stackMs / budgetMs) * 100;
  if (status === 'FAIL') {
    return (
      `FAIL — ${layers} layers at this layer's measured cost come to ${stackMs.toFixed(3)} ms/frame, ` +
      `which is ${sharePct.toFixed(1)}% of a ${budgetMs.toFixed(2)} ms frame. The stack does not fit ` +
      'the frame even before anything that is not the ground is drawn.'
    );
  }
  return (
    `PASS — ${layers} layers at this layer's measured cost come to ${stackMs.toFixed(3)} ms/frame, ` +
    `${sharePct.toFixed(1)}% of a ${budgetMs.toFixed(2)} ms frame. That is a NECESSARY condition and ` +
    'not a sufficient one: the budget compared against is the WHOLE frame, which still has to draw ' +
    'the plants, the props, the water and the UI.'
  );
}

/**
 * Judge one land-floor run.
 *
 * THE FOUR RUNGS IN ORDER, each outranking the next. Nothing below a tripped rung is computed
 * into a verdict, because a verdict resting on a measurement already declared meaningless is the
 * failure this whole module exists to make impossible.
 *
 * ⚠ THE STACK EXTRAPOLATION IS AN EXTRAPOLATION AND THE FAILURE MESSAGE SAYS SO. The seven layers
 * are not identical and this one is the heaviest described so far — 23 octaves against the grain's
 * two — so multiplying by seven most likely OVERSTATES the stack. That is the direction a budget
 * rung should err in, and it is named rather than hidden: a FAIL here is a statement that the
 * stack is unaffordable IF its layers cost what this one does, which is the only stack figure
 * available until the other six are built.
 */
export function landFloorVerdict(input: LandFloorInput): LandFloorVerdict {
  const budgetMs = (input.budgetMs ?? FRAME_BUDGET_60HZ_MS) * GROUND_FRAME_SHARE;
  const layers = input.layers ?? APPROVED_STACK_LAYERS;

  const voidness = voidnessReasons(input);
  if (voidness.length > 0) {
    return {
      status: 'UNVERIFIED',
      rung: 'VOIDNESS',
      budgetMs,
      layers,
      costs: [],
      stackMsPerFrame: null,
      unverified: voidness,
      failures: [],
      prose: stackProse('UNVERIFIED', null, budgetMs, layers),
    };
  }

  const isolation = isolationReasons(input.arms, input.controlLabel);
  if (isolation.length > 0) {
    return {
      status: 'UNVERIFIED',
      rung: 'ISOLATION',
      budgetMs,
      layers,
      costs: [],
      stackMsPerFrame: null,
      unverified: isolation,
      failures: [],
      prose: stackProse('UNVERIFIED', null, budgetMs, layers),
    };
  }

  const sensitivity = sensitivityReasons(input);
  if (sensitivity.length > 0) {
    return {
      status: 'UNVERIFIED',
      rung: 'SENSITIVITY',
      budgetMs,
      layers,
      costs: [],
      stackMsPerFrame: null,
      unverified: sensitivity,
      failures: [],
      prose: stackProse('UNVERIFIED', null, budgetMs, layers),
    };
  }

  // Every arm is real, isolated, and the run has proved it can see fragment cost. Now the cost.
  const control = armNamed(input.arms, input.controlLabel)!;
  const base = median(control.samples);
  const baseSpread = spread(control.samples);
  const costs = input.arms.map(function costRow(a: LandArmSamples): LandArmCost {
    return costOf(a, base, baseSpread, a.label === input.controlLabel);
  });

  const layerCost = costs.find(function isLayer(c: LandArmCost): boolean {
    return c.label === input.layerLabel;
  });
  const layerDelta = layerCost !== undefined && layerCost.resolved ? layerCost.deltaMs : null;
  const stackMsPerFrame = layerDelta === null ? null : base + layers * layerDelta;

  const failures: string[] = [];
  // RUNG 4a — the ABSOLUTE bound. The measured arm itself has to fit a frame. This cannot be
  // argued with and it is the one that would catch a layer that is catastrophic on its own.
  for (const c of costs) {
    if (c.gpuMsPerFrame > budgetMs) {
      failures.push(
        `"${c.label}" costs ${c.gpuMsPerFrame.toFixed(3)} ms/frame on its own, over the ` +
          `${budgetMs.toFixed(2)} ms frame`,
      );
    }
  }
  // RUNG 4b — THE STACK. The arc's actual question, and the rung that can realistically fire:
  // a layer far under a frame on its own is still unaffordable if seven of it are not.
  if (stackMsPerFrame !== null && stackMsPerFrame > budgetMs) {
    failures.push(
      `${layers} layers at "${input.layerLabel}"'s measured ` +
        `+${layerDelta!.toFixed(4)} ms come to ${stackMsPerFrame.toFixed(3)} ms/frame, over the ` +
        `${budgetMs.toFixed(2)} ms frame. This is an EXTRAPOLATION from one layer — the other six ` +
        'are not built, and this one is the heaviest described so far, so it most likely ' +
        'overstates the stack',
    );
  }

  const status: FrameBudgetStatus = failures.length > 0 ? 'FAIL' : 'PASS';
  return {
    status,
    rung: 'BUDGET',
    budgetMs,
    layers,
    costs,
    stackMsPerFrame,
    unverified: [],
    failures,
    prose: stackProse(status, stackMsPerFrame, budgetMs, layers),
  };
}
