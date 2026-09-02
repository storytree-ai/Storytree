import assert from 'node:assert/strict';
import test from 'node:test';

import { GRASS_COOL, GRASS_WARM } from '../src/land-grass.js';
import { deliveredForLevel, parseHex, toHex } from '../src/shade-ladder.js';
import { shippedLadder } from './grain-status-reading.js';
import {
  GRASS_REACH_D_STEPS,
  GRASS_REACH_T_STEPS,
  admissibleGrassLevelBand,
  admissibleGrassMixCeiling,
  admissibleGrassMixCeilingLit,
  grassCeilingByStatus,
  grassLayerReadings,
  grassLayerVerdict,
  grassMixedColour,
  grassReachableColours,
  grassSeaSeparation,
  rampChannelSpan,
  reachStepBound,
  statusToken,
} from './grass-status-reading.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { SHIPPED_GRASS_MIX } from '../src/ForestWorldCanvas.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { VISIBLE_DELTA } from './visible-delta.js';

// ---------------------------------------------------------------- the walk is an enumeration

test('the walk is fine enough that consecutive samples cannot skip a channel unit', () => {
  // ⚠ THIS IS WHAT MAKES THE ANSWER EXHAUSTIVE RATHER THAN A SURVEY. A coarser grid could step
  // over the one colour that breaks a reading and report an admissible factor that is not.
  assert.ok(
    reachStepBound(GRASS_COOL, GRASS_REACH_T_STEPS) < 1,
    `the t axis steps ${reachStepBound(GRASS_COOL, GRASS_REACH_T_STEPS)} channel units`,
  );
  assert.ok(reachStepBound(GRASS_WARM, GRASS_REACH_T_STEPS) < 1);
  // The d axis only has to cover the distance BETWEEN the ramps at a fixed t, which is far less
  // than either ramp's own span — so bounding it by the whole span is the conservative reading.
  assert.ok(reachStepBound(GRASS_WARM, GRASS_REACH_D_STEPS) < 1);
});

test('the ramp span is measured in DELIVERED units, not linear ones', () => {
  // The cool ramp runs 0.052 -> 0.432 in green. In LINEAR that is a span of 0.38; delivered, the
  // transfer expands the dark end and the real span is ~115 units. Sizing the walk against the
  // linear number would make it ~300x too coarse while looking careful.
  const span = rampChannelSpan(GRASS_COOL);
  assert.ok(span > 60, `the cool ramp spans only ${span} delivered units`);
  assert.ok(span < 255);
});

test('the reachable set is many distinct colours, and every one of them is a real grass colour', () => {
  const reach = grassReachableColours();
  assert.ok(reach.length > 500, `only ${reach.length} reachable colours`);
  for (const c of reach) {
    assert.ok(c.r >= 0 && c.r <= 255 && c.g >= 0 && c.g <= 255 && c.b >= 0 && c.b <= 255);
  }
});

// ---------------------------------------------------------------- the mix

test('the mix returns the base at 0 and the grass at 1', () => {
  const base = { r: 200, g: 100, b: 50 };
  const grass = { r: 64, g: 99, b: 64 };
  assert.deepEqual(grassMixedColour(base, grass, 0), base);
  assert.deepEqual(grassMixedColour(base, grass, 1), grass);
});

test('an unknown status is REFUSED rather than resolving to black', () => {
  assert.throws(() => statusToken('not-a-status'), /unknown status/);
});

// ---------------------------------------------------------------- the finding

test('THE FINDING: the shipped ladder admits far less grass than the lit ladder alone', () => {
  // ⚠⚠ THE WHOLE POINT OF REPORTING BOTH. What binds is how far the LADDER REACHES, not how far
  // apart the colours sit: the reader holds one reference per token at flat ground, so a rung's
  // margin is spent by its distance from 0.90 in both directions, and the shadow rung is the
  // furthest. A single ceiling cannot tell "the palette is too tight" from "the shading is too
  // deep", and those have completely different remedies.
  const shipped = admissibleGrassMixCeiling();
  const lit = admissibleGrassMixCeilingLit();
  assert.ok(shipped > 0, 'some grass must be admissible, or the instrument is measuring nothing');
  assert.ok(lit > shipped * 5, `lit ${lit} is not meaningfully above shipped ${shipped}`);
});

test('THE FINDING: the binding break is the shadowed yellow reading as healthy green', () => {
  const v = grassLayerVerdict(0.1);
  assert.equal(v.admissible, false);
  const worstRung = shippedLadder()[0]!;
  assert.equal(v.worstAt.endsWith(`@${worstRung}`), true, `worst was ${v.worstAt}`);
  // The yellow's own base at that rung, spelled out so the break is a colour a reader can look up
  // rather than a status name.
  const base = deliveredForLevel(statusToken('building'), worstRung);
  assert.equal(toHex(base), '#a69451');
  const broken = v.breaks.find((b) => b.status === 'building' && b.level === worstRung);
  assert.ok(broken !== undefined, 'building at the darkest rung must be among the breaks');
  assert.ok(broken.baseMargin > 0, 'and it must READ CORRECTLY before the grass is added');
  assert.ok(broken.worstMargin < 0, 'and incorrectly after');
});

test('the ungrassed ground already reads correctly at every rung — the layer is what breaks it', () => {
  // ⚠ WITHOUT THIS THE FINDING ABOVE IS UNATTRIBUTABLE. If the shipped ladder already misread
  // somewhere, "the grass breaks the reading" would be describing a fault the grass inherited.
  for (const r of grassLayerReadings(0)) {
    assert.ok(r.baseMargin > 0, `${r.status}@${r.level} already misreads before any grass`);
  }
});

test('THE FINDING: the ladder a grassed ground may use shrinks as the mix grows, then vanishes', () => {
  const at005 = admissibleGrassLevelBand(0.005);
  const at20 = admissibleGrassLevelBand(0.2);
  const at35 = admissibleGrassLevelBand(0.35);
  assert.ok(at005 !== null && at20 !== null, 'both of the lower factors must leave a ladder');
  assert.ok(
    at005[0] < at20[0],
    `the band floor must RISE with the mix: ${at005[0]} then ${at20[0]}`,
  );
  assert.equal(at35, null, 'and at the first visible factor no contiguous ladder survives');
  // The shipped ladder's own floor, so the cost is stated as rungs rather than as a number.
  assert.ok(
    at005[0] <= shippedLadder()[0]!,
    'the smallest factor must leave the SHIPPED ladder intact, or the control itself is failing',
  );
  assert.ok(
    at20[0] > shippedLadder()[0]!,
    'and 0.20 must cost the shadow rung, which is the whole trade this page shows',
  );
});

test('THE PER-TOKEN ARM: the whole-map ceiling is ONE token`s property, not the layer`s', () => {
  // ⚠⚠ THIS IS THE FINDING ADR-0492 RESTS ON, AND UNTIL NOW IT WAS BACKED BY NOTHING COMMITTED.
  // Every function here took the minimum over all six tokens, so asking the instrument about
  // `healthy` returned the whole-map answer — a superseded number wearing a clean run. The arm
  // makes the question askable; this pins the answer.
  // ⚠ THE DEFAULT 0.005 GRID, NOT THE 0.0005 ONE THE EVIDENCE SHEET QUOTES. The claim here is a
  // RATIO between tokens — forty-fold — which no grid this side of absurd can blur, and the fine
  // walk costs 34 s for a digit no assertion below reads. The evidence run states its own step.
  const STEP = 0.005;
  const perToken = grassCeilingByStatus(STEP, 0.6);
  const whole = admissibleGrassMixCeiling(STEP, 0.6);
  const healthy = perToken.get('healthy')!;
  const yellow = perToken.get('building')!;

  // The whole-map figure is exactly the tightest token's, and nothing else's.
  assert.equal(whole, Math.min(...perToken.values()));
  assert.equal(whole, yellow, 'the binding token is the building/proposed yellow');
  // ⚠ AND THE SPREAD IS THE POINT: green admits FORTY TIMES what the yellow does. A layer read
  // off the minimum is a layer judged entirely by its worst token.
  assert.ok(healthy > yellow * 20, `healthy ${healthy} is not far above the yellow's ${yellow}`);
  // `building` and `proposed` are ONE authored token (ADR-0462), so they cannot disagree.
  assert.equal(perToken.get('proposed'), yellow);
});

/** The factor ADR-0492 measured its gate on — layer 1's strength from PR #1798 until ADR-0506.
 *  A literal, because the claim below is about the INSTRUMENT (the gate admits a visible factor
 *  the whole map does not) and must not move with the shipped constant, which ADR-0506 took past
 *  this instrument's ceiling on purpose. */
const ADR0492_FACTOR = 0.32;

test('THE PER-TOKEN ARM: narrowing to the gate admits a VISIBLE factor, ungated admits none', () => {
  // The two halves of ADR-0492 D1's whole claim, side by side on one instrument.
  const gated = grassLayerVerdict(ADR0492_FACTOR, undefined, undefined, GRASS_STATUS_GATE);
  const ungated = grassLayerVerdict(ADR0492_FACTOR);
  assert.equal(gated.admissible, true, 'the measured factor must hold on the gated token');
  assert.equal(ungated.admissible, false, 'and must NOT hold on the whole map — hence the gate');
  // ⚠ AND THE READER TABLE IS NOT NARROWED WITH THE STATUSES. If it were, the walk would ask
  // whether grassed-healthy is distinguishable from itself — vacuously true, and every factor up
  // to 1.0 would report as admissible. That the gated ceiling is FINITE is what proves it isn't.
  const ceiling = admissibleGrassMixCeiling(0.005, 1.0, shippedLadder(), GRASS_STATUS_GATE);
  assert.ok(ceiling < 1, 'a gated ceiling of 1.0 means the reader table was narrowed too');
  assert.ok(ADR0492_FACTOR < ceiling, `ADR-0492's factor ${ADR0492_FACTOR} sat under its fence ${ceiling}`);
});

test('ADR-0506: the SHIPPED factor is above this instrument`s ceiling, and the instrument SAYS SO', () => {
  // ⚠⚠ THIS USED TO ASSERT `SHIPPED_GRASS_MIX < ceiling`, AND THAT ASSERTION WAS THE FENCE THAT
  // KEPT THE GROUND FROM MATCHING THE RENDER THE OWNER STAMPED. ADR-0503 D1 demoted the per-pixel
  // reader model to an instrument for layers 2–6; ADR-0506 does the same for layer 1, after the
  // owner looked at the finished stack (2026-09-03) and said it was not the picture he approved.
  // The fence is the LOOK (ADR-0489 D3); what this instrument owes is an honest REPORT — a
  // finite ceiling, a negative margin, and the rungs that break, printed rather than hidden.
  const ceiling = admissibleGrassMixCeiling(0.005, 1.0, shippedLadder(), GRASS_STATUS_GATE);
  assert.ok(SHIPPED_GRASS_MIX > ceiling, `the shipped factor ${SHIPPED_GRASS_MIX} is a look pick, above ${ceiling}`);
  const verdict = grassLayerVerdict(SHIPPED_GRASS_MIX, undefined, undefined, GRASS_STATUS_GATE);
  assert.equal(verdict.admissible, false, 'the instrument must report, not flatter, the shipped factor');
  assert.ok(verdict.worstMargin < 0, 'a negative margin is the report, and it is printed on the sheet');
  assert.ok(verdict.breaks.length > 0, 'and it names the rungs that break rather than only a number');
  // ⚠ NEVER 1.0 — ADR-0490 D5's seam (modulate, never replace) is kept literally.
  assert.ok(SHIPPED_GRASS_MIX < 1, 'the grass may not REPLACE the status colour');
});

test('THE SHIPPED FACTOR IS VISIBLE, which the recipe`s own factor provably is not', () => {
  // ⚠⚠ THE ARC'S NAMED FAILURE SHAPE: a clean landing that changes nothing. At the authored 0.13
  // the MAXIMUM channel shift on green is under ADR-0490 D6's 20/255 bar, so no pixel anywhere
  // can move — this is a hard result about the reachable set, independent of how the noise falls.
  const shiftAt = (fac: number): number => {
    let widest = 0;
    for (const level of shippedLadder()) {
      const base = deliveredForLevel(statusToken('healthy'), level);
      for (const grass of grassReachableColours()) {
        const m = grassMixedColour(base, grass, fac);
        widest = Math.max(
          widest,
          Math.abs(m.r - base.r),
          Math.abs(m.g - base.g),
          Math.abs(m.b - base.b),
        );
      }
    }
    return widest;
  };
  assert.ok(shiftAt(0.13) <= VISIBLE_DELTA, 'the authored factor must be provably invisible');
  assert.ok(
    shiftAt(SHIPPED_GRASS_MIX) > VISIBLE_DELTA,
    'and the shipped factor must be able to move a pixel a viewer can see',
  );
});

test('THE SEA FENCE: no green this layer delivers walks toward the background', () => {
  // ⚠⚠ THE METRIC CANNOT ASK THIS AND REWARDS GETTING IT WRONG — `imageStats` anchors on the 2nd
  // percentile of the island's OWN pixels, background excluded by colour, so a surface painted
  // darker scores BETTER right up to invisibility. The cliff's second rock token was reported as
  // halving the error against the approved render while merging two thirds of the cliff into the
  // sea (PR #1792). This layer clears it by a wide margin; the fence is here for layers 2, 3 and
  // 4, which composite through this same seam and are the darkening ones.
  const bg = parseHex(SHIPPED_LIGHTING.background);
  const clear = grassSeaSeparation(SHIPPED_GRASS_MIX, bg, shippedLadder(), GRASS_STATUS_GATE);
  assert.ok(clear > VISIBLE_DELTA, `the darkest grassed green clears the sea by only ${clear}`);
  // ⚠ AND IT DARKENS THE GROUND, which is why the fence is not vacuous: the separation must FALL
  // as the factor rises, or this function is not measuring what it claims to.
  const atZero = grassSeaSeparation(0, bg, shippedLadder(), GRASS_STATUS_GATE);
  assert.ok(clear < atZero, 'the layer must darken the ground, or the fence tests nothing');
});
