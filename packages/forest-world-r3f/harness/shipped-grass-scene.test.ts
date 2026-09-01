import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GRASS_OCTAVES } from '../src/land-grass.js';
import { GRASS_GATE_ROWS, SHIPPED_GRASS_MIX } from '../src/ForestWorldCanvas.js';
import {
  ARC_FAMILY_TARGET,
  CONTROL_ARM,
  FAMILY_FLOOR,
  GRASS_ARMS,
  GRASS_ARM_CAPTION,
  GRASS_ARM_MIX,
  VISIBLE_DELTA,
  armGrass,
  backgroundBytes,
  colourFamily,
  familyCensus,
  referenceFamilies,
} from './shipped-grass-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

// ---------------------------------------------------------------- the control arm is the map
//
// ⚠⚠ THE HAZARD THIS FILE EXISTS FOR. `comparison-baseline-moves-under-the-page`: the skirt's
// comparison page built its own scene, so when a sibling landed its CONTROL arm quietly became
// the map as it stood an hour earlier — and the symptom was byte-identical numbers on a re-run,
// which reads as reassurance. This arc parks FIVE layers landing onto one composition root, so
// the remedy has to be structural rather than a habit.

test('the page builds its ground with the SHIPPED builder and constructs no scene of its own', () => {
  const page = source('shipped-grass-scene.ts');
  assert.ok(
    /shippedGroundBuild\(cells, casters\)/.test(page),
    'the arms must call the function CellGround calls',
  );
  // ⚠ AND IT MUST NOT ALSO HAND-ROLL ONE. A page that called the builder AND assembled its own
  // input would look correct and use whichever the scene function happened to read.
  assert.ok(
    !/const input: CellGroundGeometryInput/.test(page),
    'the page must not assemble a geometry input of its own',
  );
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s, not the page’s');
  assert.ok(!/shoreRelief\(/.test(page), 'the shore fall is the builder’s, not the page’s');
  assert.ok(!/shoreArmRingPlan\(/.test(page), 'the inset ring is the builder’s, not the page’s');
});

test('the SHIPPED canvas holds exactly one geometry-input construction, inside that builder', () => {
  const canvas = readFileSync(join(HERE, '..', 'src', 'ForestWorldCanvas.tsx'), 'utf8');
  const literals = [...canvas.matchAll(/const input: CellGroundGeometryInput = \{/g)];
  assert.equal(
    literals.length,
    1,
    'a second construction is how a control arm and the map stop being the same scene',
  );
  const builderAt = canvas.indexOf('export function shippedGroundBuild(');
  assert.ok(builderAt > 0, 'the builder must be exported for a harness arm to reach it');
  const cellGroundAt = canvas.indexOf('function CellGround({');
  assert.ok(literals[0]!.index! > builderAt, 'the one construction lives inside the builder');
  assert.ok(literals[0]!.index! < cellGroundAt, 'and therefore not inside CellGround');
  // And CellGround must actually CALL it rather than keeping a copy.
  assert.ok(/shippedGroundBuild\(cells, casters\)/.test(canvas.slice(cellGroundAt)));
});

// ---------------------------------------------------------------- the arms

test('the control arm asks for NO grass, rather than for grass at zero', () => {
  assert.equal(GRASS_ARM_MIX[CONTROL_ARM], null);
  assert.equal(
    armGrass(CONTROL_ARM),
    undefined,
    'absent is what keeps the control material byte-identical to the shipped one',
  );
});

test('every non-control arm carries a mix, and they are ordered and distinct', () => {
  const mixes = GRASS_ARMS.filter((a) => a !== CONTROL_ARM).map((a) => GRASS_ARM_MIX[a]);
  assert.deepEqual(mixes, [0.13, 0.32, 0.4065]);
  // ⚠ THE SHIPPED ARM IS THE SHIPPED CONSTANT, not a copy of its value. An arm captioned "what
  // ships" that has come to be an arm that once did is the comparison failure this arc names —
  // a page reporting a layer the map does not draw, with nothing in the frames to reveal it.
  assert.equal(GRASS_ARM_MIX.adopted, SHIPPED_GRASS_MIX);
  for (const arm of GRASS_ARMS) {
    assert.ok(GRASS_ARM_CAPTION[arm].length > 20, `arm ${arm} has no caption a reader can use`);
  }
});

test('an arm`s grass option is the mix and the SHIPPED gate — arms differ in exactly one thing', () => {
  assert.deepEqual(armGrass('ceiling'), { mix: 0.4065, rows: GRASS_GATE_ROWS });
  assert.deepEqual(armGrass('authored'), { mix: 0.13, rows: GRASS_GATE_ROWS });
  // ⚠ AND THE CONTROL CARRIES NO OPTION AT ALL rather than a mix of zero, which is what makes its
  // material byte-identical to the pre-layer-1 one instead of "the new one, turned down".
  assert.equal(armGrass(CONTROL_ARM), undefined);
  // Every grassed arm gates the SAME rows, so the only moving part between arms is the factor.
  const gates = GRASS_ARMS.filter((a) => a !== CONTROL_ARM).map((a) => armGrass(a)?.rows);
  for (const g of gates) assert.deepEqual(g, GRASS_GATE_ROWS);
});

test('the verdict threshold is ADR-0490 D6`s, not the touched count', () => {
  assert.equal(VISIBLE_DELTA, 20);
});

test('the arc`s own family figures are carried as WRITTEN, to be compared against a fresh run', () => {
  assert.deepEqual({ ...ARC_FAMILY_TARGET }, { shippedAsWritten: 9, approvedAsWritten: 36 });
});

// ---------------------------------------------------------------- the census

test('the family key is five bits per channel', () => {
  assert.equal(colourFamily(0, 0, 0), 0);
  assert.equal(colourFamily(255, 255, 255), (31 << 10) | (31 << 5) | 31);
  // Two colours within one 8-value bucket per channel are ONE family.
  assert.equal(colourFamily(8, 16, 24), colourFamily(15, 23, 31));
  assert.notEqual(colourFamily(8, 16, 24), colourFamily(16, 16, 24));
});

test('the census masks on the BACKGROUND COLOUR, not on alpha', () => {
  // ⚠ THE MEASURED BUG THIS ENCODES. The frames are opaque — the sea is painted — so an alpha
  // mask selects the whole frame, a large perfectly flat region dominates every statistic, and
  // every arm looks identical: a null result manufactured by the instrument.
  const bg = backgroundBytes();
  const px: number[] = [];
  const push = (r: number, g: number, b: number): void => {
    px.push(r, g, b, 255);
  };
  // Four background pixels and four land pixels, all fully opaque.
  for (let i = 0; i < 4; i += 1) push(bg[0], bg[1], bg[2]);
  for (let i = 0; i < 4; i += 1) push(120, 180, 90);
  const census = familyCensus(new Uint8ClampedArray(px), bg);
  assert.equal(census.land, 4, 'the sea must not count as land');
  assert.equal(census.families, 1);
  assert.equal(census.largestShare, 1);
});

test('the census counts only families holding at least the floor', () => {
  const bg = backgroundBytes();
  const px: number[] = [];
  // 199 pixels of one colour and 1 of another: the singleton is 0.5% exactly, so it counts;
  // shrink it and it does not.
  for (let i = 0; i < 199; i += 1) px.push(10, 20, 30, 255);
  px.push(200, 210, 220, 255);
  assert.equal(familyCensus(new Uint8ClampedArray(px), bg).families, 2);
  for (let i = 0; i < 200; i += 1) px.push(10, 20, 30, 255);
  assert.equal(familyCensus(new Uint8ClampedArray(px), bg).families, 1);
  assert.equal(FAMILY_FLOOR, 0.005);
});

test('an all-background frame reports zero land rather than a family count', () => {
  const bg = backgroundBytes();
  const px = [bg[0], bg[1], bg[2], 255, bg[0], bg[1], bg[2], 255];
  const census = familyCensus(new Uint8ClampedArray(px), bg);
  assert.equal(census.land, 0);
  assert.equal(census.families, 0);
});

test('the REFERENCE is masked on alpha, because a Cycles render has a transparent sea', () => {
  const px = [
    0, 0, 0, 0, // transparent — the sea
    120, 180, 90, 255,
    121, 181, 91, 255,
  ];
  const r = referenceFamilies(new Uint8ClampedArray(px));
  assert.equal(r.families, 1, 'the two land pixels fall in one 5-bit family');
  assert.equal(r.largestShare, 1, 'and the transparent pixel is not land');
});

test('the background is parsed from the authored hex, never through THREE.Color', () => {
  const hex = SHIPPED_LIGHTING.background.replace('#', '');
  assert.deepEqual(
    [...backgroundBytes()],
    [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ],
  );
  // ⚠ The trap, stated as a number: `new THREE.Color('#101418').r * 255` is 6, not 16, because
  // three linearises sRGB on construction. A mask built that way matches nothing.
  assert.ok(!/new THREE\.Color\(SHIPPED_LIGHTING\.background\)[\s\S]{0,80}mask/.test(
    source('shipped-grass-scene.ts'),
  ));
});

// ---------------------------------------------------------------- the cost this layer names

test('the octave load is carried on the arm, so the frame-cost question has a number', () => {
  const page = source('shipped-grass-scene.ts');
  assert.ok(/octaves: grass === undefined \? 0 : GRASS_OCTAVES/.test(page));
  assert.equal(GRASS_OCTAVES, 23, 'eight broad, eight mid, four fine, three drift');
});
