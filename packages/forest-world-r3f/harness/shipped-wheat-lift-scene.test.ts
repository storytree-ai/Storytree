// shipped-wheat-lift-scene.test.ts — the paleness page's ARMS and its NUMBERS, held without a
// browser: the arms vary exactly the lift on the shipped anchor, the control is the wheat as it
// shipped after the yellowness ladder, the flat reference is the pre-wheat map, the shipped arm
// is a rung of the ladder, and the canvas's lift is what the source says it is.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SHIPPED_SHADOW_DEPTH,
  SHIPPED_WHEAT,
  SHIPPED_WHEAT_ANCHOR,
  SHIPPED_WHEAT_LIFT,
  SHIPPED_WHEAT_MIX,
  WHEAT_GATE_ROWS,
} from '../src/ForestWorldCanvas.js';
import { WHEAT_LIFTS, wheatAnchor } from '../src/land-wheat.js';
import { groundSanity } from './ground-sanity.js';
import {
  FLAT_ARM,
  LIFT_ANCHOR,
  LIFT_ARMS,
  LIFT_CONTROL_ARM,
  LIFT_LADDER_ARMS,
  LIFT_SHIPPED_ARM,
  PALENESS_TABLE,
  liftArmCaption,
  liftArmDepth,
  liftArmId,
  liftArmSpec,
  liftArmWheat,
  liftArmsFor,
  liftMargins,
  liftNeighbourArm,
  sameLiftArm,
} from './shipped-wheat-lift-scene.js';
import { TODAY_SHADOW_DEPTH, WHEAT_PICTURES, YELLOWNESS_TABLE } from './shipped-wheat-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

groundSanity();

// ---------------------------------------------------------------- the canvas's constants

test('the shipped lift is one rung of the paleness ladder, on the shipped anchor, in the shipped wheat', () => {
  assert.ok(WHEAT_LIFTS.some((l) => l.lift === SHIPPED_WHEAT_LIFT), 'the pick is not a rung of the ladder');
  assert.ok(SHIPPED_WHEAT_LIFT >= 1, 'the ladder runs from the derivation upward');
  assert.equal(SHIPPED_WHEAT.lift, SHIPPED_WHEAT_LIFT);
  assert.equal(LIFT_ANCHOR, SHIPPED_WHEAT_ANCHOR, 'the anchor this ladder holds fixed IS the shipped one');
  assert.equal(LIFT_ANCHOR, wheatAnchor('mustard').hex);
  // Read off the source rather than the value: the pick is `wheatLift('<rung>').lift`, never a
  // bare number a scale-back could leave off the ladder.
  const canvas = source('../src/ForestWorldCanvas.tsx');
  assert.match(canvas, /export const SHIPPED_WHEAT_LIFT = wheatLift\('\d\.\d\d'\)\.lift;/);
  assert.match(canvas, /lift: SHIPPED_WHEAT_LIFT,/);
});

// ---------------------------------------------------------------- the arms

test('the arms: the flat reference first, one rung per lift in ladder order, the shipped arm last — the lift the only moving part', () => {
  assert.equal(LIFT_ARMS[0]!.id, FLAT_ARM);
  assert.equal(LIFT_ARMS[LIFT_ARMS.length - 1]!.id, LIFT_SHIPPED_ARM);
  assert.deepEqual(LIFT_LADDER_ARMS, WHEAT_LIFTS.map((l) => liftArmId(l.id)));
  assert.equal(LIFT_CONTROL_ARM, 'lift-1.00', 'the control is the derivation as shipped');
  assert.equal(LIFT_LADDER_ARMS[0], LIFT_CONTROL_ARM, 'and it is the first rung');
  assert.deepEqual(liftArmSpec(FLAT_ARM), { id: FLAT_ARM, lift: null, rung: null });
  for (const l of WHEAT_LIFTS) assert.deepEqual(liftArmSpec(liftArmId(l.id)), { id: liftArmId(l.id), lift: l.lift, rung: l.id });
  const shipped = liftArmSpec(LIFT_SHIPPED_ARM);
  assert.equal(shipped.lift, SHIPPED_WHEAT_LIFT);
  const twins = LIFT_LADDER_ARMS.filter((id) => sameLiftArm(liftArmSpec(id), shipped));
  assert.equal(twins.length, 1, `the shipped arm coincides with ${twins.length} rungs`);
  assert.equal(shipped.rung, liftArmSpec(twins[0]!).rung);
  assert.throws(() => liftArmSpec('lift-1.25'), /no arm "lift-1.25"/);
  for (const a of LIFT_ARMS) assert.ok(liftArmCaption(a.id).length > 40, `${a.id} has no caption`);
  assert.ok(liftArmCaption(FLAT_ARM).includes('REFERENCE'));
  assert.ok(liftArmCaption(LIFT_CONTROL_ARM).endsWith('(CONTROL)'));
  assert.ok(liftArmCaption(LIFT_SHIPPED_ARM).endsWith('(SHIPS)'));
  assert.ok(liftArmCaption(liftArmId('2.00')).includes('lift 2.00'));
  assert.ok(liftArmCaption(liftArmId('2.00')).includes('#b0b040'), 'every caption names the anchor held fixed');
  assert.ok(!sameLiftArm(shipped, { ...shipped, lift: 7 }));
});

test('liftArmWheat: null on the flat reference; the SHIPPED anchor, rows and factor on every rung — only the lift differs', () => {
  assert.equal(liftArmWheat(FLAT_ARM), null);
  for (const id of [...LIFT_LADDER_ARMS, LIFT_SHIPPED_ARM]) {
    const w = liftArmWheat(id);
    assert.ok(w !== null);
    assert.equal(w.mix, SHIPPED_WHEAT_MIX);
    assert.deepEqual([...w.rows], [...WHEAT_GATE_ROWS]);
    assert.equal(w.anchor, SHIPPED_WHEAT_ANCHOR);
    assert.equal(w.lift, liftArmSpec(id).lift);
  }
  assert.deepEqual(liftArmWheat(LIFT_SHIPPED_ARM), SHIPPED_WHEAT);
  // The control is the yellowness page's SHIPPED arm at the derivation's lift — the same wheat
  // the map wore between the two landings, stated on both pages.
  const control = liftArmWheat(LIFT_CONTROL_ARM);
  assert.ok(control !== null);
  assert.equal(control.lift, 1);
  assert.deepEqual({ ...control, lift: SHIPPED_WHEAT_LIFT }, YELLOWNESS_TABLE.wheat('shipped'));
});

test('liftArmDepth: the flat reference wears the pre-wheat depth, every wheat arm the shipped one', () => {
  assert.deepEqual(liftArmDepth(FLAT_ARM), TODAY_SHADOW_DEPTH);
  for (const id of [...LIFT_LADDER_ARMS, LIFT_SHIPPED_ARM]) assert.deepEqual(liftArmDepth(id), SHIPPED_SHADOW_DEPTH);
});

test('liftNeighbourArm isolates ONE step of the lift: none for the flat reference and the control, the rung below otherwise', () => {
  assert.equal(liftNeighbourArm(FLAT_ARM), null);
  assert.equal(liftNeighbourArm(LIFT_CONTROL_ARM), null);
  for (let i = 1; i < LIFT_LADDER_ARMS.length; i += 1) assert.equal(liftNeighbourArm(LIFT_LADDER_ARMS[i]!), LIFT_LADDER_ARMS[i - 1]!);
  const twin = LIFT_LADDER_ARMS.find((id) => sameLiftArm(liftArmSpec(id), liftArmSpec(LIFT_SHIPPED_ARM)))!;
  assert.equal(liftNeighbourArm(LIFT_SHIPPED_ARM), liftNeighbourArm(twin));
});

// ---------------------------------------------------------------- the pictures and the table

test('the same three pictures: the green proof carries control and shipped only; the yellow and the forest carry the flat reference and the whole ladder', () => {
  assert.deepEqual(WHEAT_PICTURES.map((p) => p.id), ['green', 'yellow', 'forest']);
  assert.deepEqual([...liftArmsFor('green')], [LIFT_CONTROL_ARM, LIFT_SHIPPED_ARM]);
  assert.deepEqual([...liftArmsFor('yellow')], LIFT_ARMS.map((a) => a.id));
  assert.deepEqual([...liftArmsFor('forest')], LIFT_ARMS.map((a) => a.id));
  assert.equal(liftArmsFor('yellow')[0], FLAT_ARM, 'the flat token stands first, as the reference');
});

test('the table hands the shared runner exactly this page`s arms', () => {
  assert.equal(PALENESS_TABLE.control, LIFT_CONTROL_ARM);
  assert.equal(PALENESS_TABLE.shipped, LIFT_SHIPPED_ARM);
  assert.equal(PALENESS_TABLE.armsFor, liftArmsFor);
  assert.equal(PALENESS_TABLE.wheat, liftArmWheat);
  assert.equal(PALENESS_TABLE.depth, liftArmDepth);
  assert.equal(PALENESS_TABLE.neighbour, liftNeighbourArm);
  assert.equal(PALENESS_TABLE.caption, liftArmCaption);
  // And it is a DIFFERENT table from the yellowness page's over the SAME runner: the two vary
  // different levers and share everything else.
  assert.notEqual(PALENESS_TABLE.wheat, YELLOWNESS_TABLE.wheat);
  assert.equal(YELLOWNESS_TABLE.depth('shipped').deep, PALENESS_TABLE.depth(LIFT_SHIPPED_ARM).deep);
});

// ---------------------------------------------------------------- the readings

test('liftMargins reports every rung on the shipped anchor at the shipped strength, with the two findings as numbers', () => {
  const m = liftMargins(0.002);
  assert.equal(m.anchor, SHIPPED_WHEAT_ANCHOR);
  assert.equal(m.fac, SHIPPED_WHEAT_MIX);
  assert.equal(m.step, 0.002);
  assert.deepEqual(m.rungs.map((r) => r.id), WHEAT_LIFTS.map((l) => l.id));
  for (const r of m.rungs) {
    assert.equal(r.anchor, SHIPPED_WHEAT_ANCHOR);
    assert.equal(r.ceiling.step, 0.002);
    assert.ok(r.worstMargin < 0, `${r.id}: the reader reads the wheat foreign somewhere, and the report says so`);
    assert.ok(r.luma.ratio > 0.7 && r.luma.ratio < 1.2);
    assert.ok(r.stops.warmLight.hue > 35 && r.stops.warmLight.hue <= 60, `${r.id}: the warm light stop reads ${r.stops.warmLight.hue}° — a gold or a lemon, never a peach`);
  }
  assert.ok(m.green.worstMargin < 0);
  assert.ok(m.shadow.marginDeep < 0);
  assert.ok(m.shadow.marginDerived > 0);
});

// ---------------------------------------------------------------- the page reads the shipped builder

test('the page composes NO material of its own — it is a table over the yellowness page`s runner', () => {
  const page = source('shipped-wheat-lift-scene.ts');
  assert.ok(!page.includes('buildGroundMaterial('), 'the material is built once, in shipped-wheat-scene.ts');
  assert.ok(!page.includes('shippedGroundBuild('), 'and so is the ground');
  assert.ok(page.includes('createWheatRunner(PALENESS_TABLE)'));
  assert.ok(page.includes('mountWheatPage(root, runner, PALENESS_TABLE)'));
  // The page's html mounts THIS module.
  const html = source('shipped-wheat-lift.html');
  assert.ok(html.includes("import { mountShippedWheatLift } from './shipped-wheat-lift-scene.ts';"));
});
