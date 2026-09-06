import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIPPED_GRASS_MIX, SHIPPED_WHEAT_MIX } from '../src/ForestWorldCanvas.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { WHEAT_ANCHORS, WHEAT_LIFTS, WHEAT_STATUS_GATE, wheatColourOf } from '../src/land-wheat.js';
import { SHADOW_DEPTH, deepestAdmissibleRung } from '../src/shadow-rung.js';
import { toHex } from '../src/shade-ladder.js';
import { SHIPPED_TOKENS } from './grain-status-reading.js';
import { grassReachableColours } from './grass-status-reading.js';
import {
  greenReferenceMargin,
  hueDegrees,
  wheatCeiling,
  wheatFieldLuma,
  wheatLadderReports,
  wheatLiftReport,
  wheatLiftReports,
  wheatRampSpan,
  wheatReachStepBound,
  wheatReachableColours,
  wheatRungReport,
  wheatShadowMargin,
  wheatStopReport,
} from './wheat-status-reading.js';

test('the wheat walk is EXHAUSTIVE on every anchor — consecutive samples cannot skip a channel unit', () => {
  for (const a of WHEAT_ANCHORS) {
    const bound = wheatReachStepBound({ anchor: a.hex, lift: 1 });
    assert.ok(bound < 1, `${a.id}: the t-step is ${bound.toFixed(3)} delivered units, so the walk is a survey`);
    const span = wheatRampSpan({ anchor: a.hex, lift: 1 });
    assert.ok(span.cool > 0 && span.warm > 0);
    assert.ok(span.greenCool > 0 && span.greenWarm > 0);
  }
  // The reach set is the deduplicated image of the walk: thousands of distinct colours, and every
  // one of them a colour the ramps can deliver.
  const reach = wheatReachableColours({ anchor: '#b0b040', lift: 1 });
  assert.ok(reach.length > 1000, `only ${reach.length} reachable colours`);
  const hexes = new Set(reach.map(toHex));
  assert.equal(hexes.size, reach.length, 'the set is deduplicated');
  assert.ok(hexes.has(toHex(wheatColourOf({ anchor: '#b0b040', lift: 1 }, 0.28, 0))), 'the cool dark stop is reachable');
  assert.ok(hexes.has(toHex(wheatColourOf({ anchor: '#b0b040', lift: 1 }, 0.74, 1))), 'the warm light stop is reachable');
});

test('the ceiling carries its STEP, and a coarser step never reports a LARGER ceiling', () => {
  const fine = wheatCeiling({ anchor: '#b0b040', lift: 1 }, 0.0005, 0.2);
  const coarse = wheatCeiling({ anchor: '#b0b040', lift: 1 }, 0.002, 0.2);
  assert.equal(fine.step, 0.0005);
  assert.equal(coarse.step, 0.002);
  assert.ok(coarse.ceiling <= fine.ceiling, `coarse ${coarse.ceiling} above fine ${fine.ceiling}`);
  // The yellow admits a HUNDREDTH before its darkest rungs read foreign — the ADR-0492 finding,
  // re-derived on the wheat's own colours rather than inherited: invisible, and no fence.
  assert.ok(fine.ceiling > 0 && fine.ceiling < 0.05, `the wheat's ceiling is ${fine.ceiling}`);
});

test('every rung`s report is a REPORT — negative margin, named family, shares that sum to one', () => {
  const reports = wheatLadderReports(SHIPPED_WHEAT_MIX, 0.002);
  assert.equal(reports.length, WHEAT_ANCHORS.length);
  reports.forEach((r, i) => {
    assert.equal(r.id, WHEAT_ANCHORS[i]!.id);
    assert.equal(r.anchor, WHEAT_ANCHORS[i]!.hex);
    assert.equal(r.fac, SHIPPED_WHEAT_MIX);
    assert.ok(r.reach > 1000);
    assert.equal(r.ceiling.step, 0.002);
    // At the shipped strength the reader model reads the wheat as foreign somewhere — the whole
    // reason ADR-0492 parked the yellow, and the number this row prints rather than obeys.
    assert.ok(r.worstMargin < 0, `${r.id}: margin ${r.worstMargin}`);
    assert.ok(r.worstAt.startsWith(`${WHEAT_STATUS_GATE[0]}@`));
    assert.ok(/^#[0-9a-f]{6}$/.test(r.worstColour));
    assert.ok(SHIPPED_TOKENS.length > 0);
    assert.ok(!WHEAT_STATUS_GATE.includes(r.worstReadsAs), `${r.id}: the worst pixel reads as its own family`);
    const sum = Object.values(r.readsAs).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${r.id}: shares sum to ${sum}`);
    const flat = Object.values(r.readsAsFlat).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(flat - 1) < 1e-9);
    // The wheat's own family is the LARGEST share at flat ground on every rung but the boldest
    // is not asserted — it is what the sheet reports. What IS asserted: the yellow itself, unpainted,
    // reads positive (the ladder's spend is not the layer's).
    assert.ok(r.unpaintedWorstMargin > 0, `${r.id}: the flat yellow reads foreign before any paint`);
  });
  // The report's own worst matches a direct walk over the same rung.
  const direct = wheatRungReport('mustard', SHIPPED_WHEAT_MIX, 0.002);
  assert.equal(direct.worstMargin, reports[3]!.worstMargin);
  assert.equal(direct.lift, 1, 'the yellowness ladder reports at the derivation`s lift unless told otherwise');
  assert.throws(() => wheatRungReport('gold', 0.5), /no wheat anchor "gold"/);
  // Told a lift, every rung carries it — the yellowness page holds the SHIPPED lift fixed.
  const lifted = wheatLadderReports(SHIPPED_WHEAT_MIX, 0.002, 1.5);
  assert.ok(lifted.every((r) => r.lift === 1.5));
  assert.notEqual(lifted[3]!.worstMargin, reports[3]!.worstMargin, 'a lift moves the reach set, so it moves the margin');
});

// ---------------------------------------------------------------- the paleness ladder

test('the paleness ladder`s reports: one per lift on ONE anchor, the field brightening monotonically toward the flat token', () => {
  const reports = wheatLiftReports('#b0b040', SHIPPED_WHEAT_MIX, 0.002);
  assert.equal(reports.length, WHEAT_LIFTS.length);
  reports.forEach((r, i) => {
    assert.equal(r.id, WHEAT_LIFTS[i]!.id);
    assert.equal(r.lift, WHEAT_LIFTS[i]!.lift);
    assert.equal(r.anchor, '#b0b040', 'the anchor is held fixed');
    assert.equal(r.fac, SHIPPED_WHEAT_MIX);
    assert.ok(r.reach > 1000);
    assert.ok(r.worstMargin < 0, `${r.id}: margin ${r.worstMargin}`);
    assert.ok(r.unpaintedWorstMargin > 0);
    const sum = Object.values(r.readsAs).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    // The two findings travel with every rung.
    assert.equal(r.stops.cool.length, 3);
    assert.equal(r.stops.warm.length, 3);
    assert.equal(r.stops.warmLight.hex, r.stops.warm[2]!.hex);
    assert.ok(r.luma.flat > 0 && r.luma.field > 0);
    assert.ok(Math.abs(r.luma.ratio - r.luma.field / r.luma.flat) < 1e-12);
    if (i > 0) assert.ok(r.luma.field > reports[i - 1]!.luma.field, `${r.id} is not brighter than the rung below`);
  });
  // ⚠ THE FIRST FINDING, AS A NUMBER: as derived, the field is well below the flat token; at
  // 2.00 it reaches it; at 3.00 it overshoots. The literal bounds are the scratch walk's
  // (134 / 172 → 173 / 172 → 197 / 172).
  assert.ok(reports[0]!.luma.ratio < 0.8, `as derived the field reads ${reports[0]!.luma.ratio} of the flat token`);
  assert.ok(reports[2]!.luma.ratio > 0.98 && reports[2]!.luma.ratio < 1.05, `at 2.00 the field reads ${reports[2]!.luma.ratio} of the flat token`);
  assert.ok(reports[3]!.luma.ratio > 1.1, `at 3.00 the field reads ${reports[3]!.luma.ratio} of the flat token`);
  assert.ok(Math.abs(reports[0]!.luma.flat - reports[3]!.luma.flat) < 1e-12, 'the flat token does not move with the lift');
  // ⚠ THE SECOND FINDING, AS A NUMBER: the warm light stop's hue is UNMOVED until a channel
  // clamps — 1.00 and 1.50 read the same degree; 2.00 clamps its red and turns toward yellow;
  // 3.00 clamps five channels and both light stops are a pure lemon at 60°.
  const hue0 = reports[0]!.stops.warmLight.hue;
  assert.ok(hue0 > 39 && hue0 < 41.5, `the mustard's warm light stop reads ${hue0}°`);
  assert.ok(Math.abs(reports[1]!.stops.warmLight.hue - hue0) < 0.5);
  assert.equal(reports[0]!.stops.clampedChannels, 0);
  assert.equal(reports[1]!.stops.clampedChannels, 0);
  assert.equal(reports[2]!.stops.clampedChannels, 1, 'the 2.00 rung clamps exactly one channel');
  assert.ok(reports[2]!.stops.warmLight.hue > hue0 + 3, 'the clamp turns the warm light stop toward yellow, not toward peach');
  assert.equal(reports[3]!.stops.clampedChannels, 5);
  assert.ok(Math.abs(reports[3]!.stops.warmLight.hue - 60) < 0.01, 'the overshoot rung is a pure lemon');
  assert.throws(() => wheatLiftReport('1.25', '#b0b040', 0.5), /no wheat lift "1.25"/);
});

test('hueDegrees: HSV hue, 0 for a grey, the six primaries and secondaries at their degrees', () => {
  assert.equal(hueDegrees({ r: 128, g: 128, b: 128 }), 0);
  assert.equal(hueDegrees({ r: 255, g: 0, b: 0 }), 0);
  assert.equal(hueDegrees({ r: 255, g: 255, b: 0 }), 60);
  assert.equal(hueDegrees({ r: 0, g: 255, b: 0 }), 120);
  assert.equal(hueDegrees({ r: 0, g: 255, b: 255 }), 180);
  assert.equal(hueDegrees({ r: 0, g: 0, b: 255 }), 240);
  assert.equal(hueDegrees({ r: 255, g: 0, b: 255 }), 300);
  // A red with more blue than green wraps below 360 rather than going negative.
  assert.ok(Math.abs(hueDegrees({ r: 255, g: 0, b: 128 }) - 329.88) < 0.05);
  // The mustard's warm light stop, #cba049: a gold at ~40° as DELIVERED (the linear-space hue is
  // 32°; the transfer bends it, and the delivered one is what the eye reads).
  assert.ok(Math.abs(hueDegrees({ r: 0xcb, g: 0xa0, b: 0x49 }) - 40.15) < 0.05);
  // The straw's peach, #fabe9b, sits at 22° — the direction a lift must NOT head.
  assert.ok(Math.abs(hueDegrees({ r: 0xfa, g: 0xbe, b: 0x9b }) - 22.1) < 0.1);
});

test('wheatStopReport delivers the six stops with the pinned warm light stop, and counts the clamps', () => {
  const r = wheatStopReport({ anchor: '#b0b040', lift: 1 });
  assert.deepEqual(r.cool.map((s) => s.hex), ['#535f2b', '#7d8538', '#b2a848']);
  assert.deepEqual(r.warm.map((s) => s.hex), ['#6e5c25', '#9f8235', '#cba049']);
  assert.equal(r.warmLight.hex, '#cba049');
  assert.equal(r.clampedChannels, 0);
  const top = wheatStopReport({ anchor: '#b0b040', lift: 2 });
  assert.equal(top.warmLight.hex, '#ffda66');
  assert.equal(top.clampedChannels, 1);
  // A pale anchor at a big lift clamps more — the count is a count, not a flag.
  assert.ok(wheatStopReport({ anchor: '#d9d18a', lift: 2 }).clampedChannels > 1);
});

test('wheatFieldLuma is the WHOLE walk`s mean, mixed at the strength into the lit flat token — and the strength matters', () => {
  const at85 = wheatFieldLuma({ anchor: '#b0b040', lift: 1 }, 0.85);
  const at50 = wheatFieldLuma({ anchor: '#b0b040', lift: 1 }, 0.5);
  assert.equal(at85.flat, at50.flat);
  assert.ok(at50.field > at85.field, 'less wheat leaves more of the (brighter) flat token in the field');
  // The lit flat token @0.9 is #c2ad5f: its luma is the literal 171.8.
  assert.ok(Math.abs(at85.flat - 171.8) < 0.2, `flat ${at85.flat}`);
  assert.ok(Math.abs(at85.field - 134.0) < 1.0, `field ${at85.field}`);
  // At a strength of 0 the field IS the flat token.
  const at0 = wheatFieldLuma({ anchor: '#b0b040', lift: 1 }, 0);
  assert.ok(Math.abs(at0.ratio - 1) < 1e-9);
});

test('the green reads negative on the SAME instrument at the shipped strength — the comparison column', () => {
  const green = greenReferenceMargin(SHIPPED_GRASS_MIX, grassReachableColours(), GRASS_STATUS_GATE);
  assert.ok(green.worstMargin < 0, `the shipped green reads ${green.worstMargin}`);
  assert.ok(green.worstAt.startsWith('healthy@'));
});

test('the shadow margin on the yellow is printed at BOTH the derived rung and the deep rung', () => {
  const derived = deepestAdmissibleRung(SHIPPED_TOKENS);
  assert.ok(derived !== null);
  const m = wheatShadowMargin(SHIPPED_TOKENS, derived, SHADOW_DEPTH);
  assert.equal(m.token, '#d8c069');
  assert.equal(m.derived, derived);
  assert.equal(m.deep, SHADOW_DEPTH);
  assert.ok(m.marginDerived > 0, 'the derived rung is admissible by construction');
  assert.ok(m.marginDeep < 0, 'the deep rung is past the ceiling, and the report says so');
});
