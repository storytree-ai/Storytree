import assert from 'node:assert/strict';
import test from 'node:test';

import { GRASS_COOL, GRASS_WARM } from '../src/land-grass.js';
import { deliveredForLevel, toHex } from '../src/shade-ladder.js';
import { shippedLadder } from './grain-status-reading.js';
import {
  GRASS_REACH_D_STEPS,
  GRASS_REACH_T_STEPS,
  admissibleGrassLevelBand,
  admissibleGrassMixCeiling,
  admissibleGrassMixCeilingLit,
  grassLayerReadings,
  grassLayerVerdict,
  grassMixedColour,
  grassReachableColours,
  rampChannelSpan,
  reachStepBound,
  statusToken,
} from './grass-status-reading.js';

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
