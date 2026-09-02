import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GRASS_OCTAVES } from '../src/land-grass.js';
import {
  GRASS_GATE_ROWS,
  SHIPPED_GRASS_MIX,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
} from '../src/ForestWorldCanvas.js';
import {
  ARC_FAMILY_TARGET,
  CONTROL_ARM,
  FAMILY_FLOOR,
  GRASS_ARMS,
  GRASS_ARM_CAPTION,
  GRASS_ARM_LAYERS,
  GRASS_ARM_MIX,
  GRASS_ARM_SAND,
  GRASS_ARM_SAND_MIX,
  type GrassArm,
  VISIBLE_DELTA,
  armGrass,
  armWearsSand,
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
    /shippedGroundBuild\(cells, casters, strips\)/.test(page),
    'the arms must call the function CellGround calls, strips included (layer 3`s docks)',
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
  // And CellGround must actually CALL it rather than keeping a copy — with the strips, so the
  // shipped ground's worn paths come from the map's own trails and not from a default of none.
  assert.ok(/shippedGroundBuild\(cells, casters, strips\)/.test(canvas.slice(cellGroundAt)));
});

// ---------------------------------------------------------------- the arms

test('the control arm asks for NO SAND, rather than for sand at zero', () => {
  // ⚠ THE BYTE-IDENTITY CLAIM MOVED UP A LAYER WITH THE CONTROL. It used to be about the grass;
  // layer 1 now SHIPS, so what the control must be byte-identical to is the map as it draws today
  // — layer 1 present, layer 2 absent. Absent means no `sand` key at all rather than a sand option
  // the shader multiplies by zero: the second still emits `sandGlsl()`, still declares `uShoreTex`
  // and still costs six octaves a fragment, so it is not the ground the map is drawing.
  assert.equal(armWearsSand(CONTROL_ARM), false);
  assert.equal(GRASS_ARM_SAND[CONTROL_ARM], false);
  // And it DOES wear layer 1, at exactly the shipped strength — read from the constant, so the
  // control cannot come apart from the map it is standing in for.
  assert.deepEqual(armGrass(CONTROL_ARM), { mix: SHIPPED_GRASS_MIX, rows: GRASS_GATE_ROWS });
});

test('the CONTROL is the map as it ships, and every arm carries a caption', () => {
  // ⚠ THE CONTROL IS NO LONGER "no grass". Layer 1 SHIPS (PR #1798), so the thing layer 2 is
  // measured against is the map WITH layer 1 — a control of bare ground would report layer 1's
  // effect as layer 2's, which is this arc's second named hazard arriving through the arms.
  assert.equal(GRASS_ARM_MIX[CONTROL_ARM], SHIPPED_GRASS_MIX);
  assert.equal(GRASS_ARM_SAND[CONTROL_ARM], false, 'the control must wear no sand');
  for (const arm of GRASS_ARMS) {
    assert.ok(GRASS_ARM_CAPTION[arm].length > 20, `arm ${arm} has no caption a reader can use`);
  }
});

test('⚠ `flat` and `authored` differ in EXACTLY the sand — same factor, opposite sand', () => {
  // The attributable pair. Any pixel between these two arms is layer 2 and nothing else; if they
  // drifted apart on the mix factor as well, every difference would be unattributable and the page
  // would be reporting a sum while captioning it as a component.
  assert.equal(GRASS_ARM_MIX.authored, GRASS_ARM_MIX.flat);
  assert.equal(GRASS_ARM_MIX.authored, SHIPPED_GRASS_MIX);
  assert.notEqual(GRASS_ARM_SAND.authored, GRASS_ARM_SAND.flat);
  // ⚠ THE PAGE IS THE PAIR PLUS A STRENGTH LADDER (owner-directed 2026-09-02): every arm wears
  // layer 1 at the shipped factor, so the ONLY thing that varies across the row is layer 2's
  // strength, and the control is the one arm with none.
  for (const arm of GRASS_ARMS) assert.equal(GRASS_ARM_MIX[arm], SHIPPED_GRASS_MIX);
  assert.deepEqual(GRASS_ARMS.filter((arm) => !GRASS_ARM_SAND[arm]), ['flat']);
  // The shipped arm reads the constant; the ladder is ascending and fixed.
  assert.equal(GRASS_ARM_SAND_MIX.authored, SHIPPED_SAND_MIX);
  const ladder = GRASS_ARMS.filter((arm) => arm.startsWith('sand-')).map((arm) => GRASS_ARM_SAND_MIX[arm]);
  assert.deepEqual(ladder, [0.16, 0.4, 0.65, 0.9]);
});

test('an arm`s grass option is the mix and the SHIPPED gate — the gate never varies', () => {
  assert.deepEqual(armGrass('authored'), { mix: SHIPPED_GRASS_MIX, rows: GRASS_GATE_ROWS });
  assert.deepEqual(armGrass('flat'), { mix: SHIPPED_GRASS_MIX, rows: GRASS_GATE_ROWS });
  // Every arm gates the SAME rows, control included — the gate is not a variable on this page.
  for (const arm of GRASS_ARMS) assert.deepEqual(armGrass(arm)?.rows, GRASS_GATE_ROWS);
  // And the sand flags are the control alone off, every other arm on — the path, rock and detail
  // ladders all hold the SHIPPED sand under the rung they vary.
  assert.deepEqual(
    GRASS_ARMS.map(armWearsSand),
    GRASS_ARMS.map((arm) => arm !== 'flat'),
  );
  for (const arm of GRASS_ARMS) {
    if (arm.startsWith('path-') || arm.startsWith('rock-') || arm.startsWith('detail-')) {
      assert.equal(GRASS_ARM_LAYERS[arm].sand, SHIPPED_SAND_MIX, `${arm} must hold the shipped sand`);
    }
  }
});

test('every ladder above the sand varies ONE thing and holds the layers below it at what ships', () => {
  // The path ladder: shipped sand, a path strength, no rock, no detail.
  for (const arm of ['path-50', 'path-80', 'path-100'] as const) {
    const l = GRASS_ARM_LAYERS[arm];
    assert.equal(l.rock, null);
    assert.equal(l.detail, null);
    assert.ok(l.wear !== null && l.wear > 0);
  }
  assert.deepEqual(['path-50', 'path-80', 'path-100'].map((a) => GRASS_ARM_LAYERS[a as GrassArm].wear), [0.5, 0.8, 1]);
  // The rock ladder: shipped sand AND shipped path, a rock rung, no detail; the recipe's own ends
  // are the first rung and the departures are ABOVE them on the up-component.
  for (const arm of ['rock-recipe', 'rock-88-95', 'rock-92-98'] as const) {
    const l = GRASS_ARM_LAYERS[arm];
    assert.equal(l.wear, SHIPPED_LAYERS.wearMix);
    assert.equal(l.detail, null);
    assert.ok(l.rock !== null);
  }
  assert.deepEqual(GRASS_ARM_LAYERS['rock-recipe'].rock?.slope, [0.72, 0.9]);
  assert.deepEqual(GRASS_ARM_LAYERS['rock-88-95'].rock?.slope, [0.88, 0.95]);
  assert.deepEqual(GRASS_ARM_LAYERS['rock-92-98'].rock?.slope, [0.92, 0.98]);
  // The detail ladder: the whole shipped stack under a detail strength.
  for (const arm of ['detail-30', 'detail-60', 'detail-100'] as const) {
    const l = GRASS_ARM_LAYERS[arm];
    assert.equal(l.wear, SHIPPED_LAYERS.wearMix);
    assert.deepEqual(l.rock, SHIPPED_LAYERS.rock);
  }
  assert.deepEqual(['detail-30', 'detail-60', 'detail-100'].map((a) => GRASS_ARM_LAYERS[a as GrassArm].detail), [0.3, 0.6, 1]);
  // And `authored` IS the shipped stack, read from the canvas's constants.
  assert.deepEqual(GRASS_ARM_LAYERS.authored, {
    sand: SHIPPED_SAND_MIX,
    wear: SHIPPED_LAYERS.wearMix,
    rock: SHIPPED_LAYERS.rock,
    detail: SHIPPED_LAYERS.detail.strength,
  });
  assert.deepEqual(GRASS_ARM_LAYERS.flat, { sand: null, wear: null, rock: null, detail: null });
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
