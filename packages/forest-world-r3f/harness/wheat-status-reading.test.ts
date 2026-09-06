import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIPPED_GRASS_MIX, SHIPPED_WHEAT_MIX } from '../src/ForestWorldCanvas.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { WHEAT_ANCHORS, WHEAT_STATUS_GATE, wheatColourOf } from '../src/land-wheat.js';
import { SHADOW_DEPTH, deepestAdmissibleRung } from '../src/shadow-rung.js';
import { toHex } from '../src/shade-ladder.js';
import { SHIPPED_TOKENS } from './grain-status-reading.js';
import { grassReachableColours } from './grass-status-reading.js';
import {
  greenReferenceMargin,
  wheatCeiling,
  wheatLadderReports,
  wheatRampSpan,
  wheatReachStepBound,
  wheatReachableColours,
  wheatRungReport,
  wheatShadowMargin,
} from './wheat-status-reading.js';

test('the wheat walk is EXHAUSTIVE on every anchor — consecutive samples cannot skip a channel unit', () => {
  for (const a of WHEAT_ANCHORS) {
    const bound = wheatReachStepBound(a.hex);
    assert.ok(bound < 1, `${a.id}: the t-step is ${bound.toFixed(3)} delivered units, so the walk is a survey`);
    const span = wheatRampSpan(a.hex);
    assert.ok(span.cool > 0 && span.warm > 0);
    assert.ok(span.greenCool > 0 && span.greenWarm > 0);
  }
  // The reach set is the deduplicated image of the walk: thousands of distinct colours, and every
  // one of them a colour the ramps can deliver.
  const reach = wheatReachableColours('#b0b040');
  assert.ok(reach.length > 1000, `only ${reach.length} reachable colours`);
  const hexes = new Set(reach.map(toHex));
  assert.equal(hexes.size, reach.length, 'the set is deduplicated');
  assert.ok(hexes.has(toHex(wheatColourOf('#b0b040', 0.28, 0))), 'the cool dark stop is reachable');
  assert.ok(hexes.has(toHex(wheatColourOf('#b0b040', 0.74, 1))), 'the warm light stop is reachable');
});

test('the ceiling carries its STEP, and a coarser step never reports a LARGER ceiling', () => {
  const fine = wheatCeiling('#b0b040', 0.0005, 0.2);
  const coarse = wheatCeiling('#b0b040', 0.002, 0.2);
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
  assert.throws(() => wheatRungReport('gold', 0.5), /no wheat anchor "gold"/);
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
