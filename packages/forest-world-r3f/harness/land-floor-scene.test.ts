import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GRASS_OCTAVES } from '../src/land-grass.js';
import { GRASS_ARM_MIX } from './shipped-grass-scene.js';
import {
  AMPLIFY_FACTOR,
  GRASS_CALL,
  LAND_FLOOR_AMPLIFIED,
  LAND_FLOOR_ARMS,
  LAND_FLOOR_ARM_MIX,
  LAND_FLOOR_ARM_OCTAVES,
  LAND_FLOOR_CONTROL,
  LAND_FLOOR_LAYER,
  LAYER_ARM_MIX,
  amplifyGrass,
  buildLandFloorScene,
  grassArmFor,
} from './land-floor-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

// ---------------------------------------------------------------- the arms are the SHIPPED map
//
// ⚠⚠ THE HAZARD `comparison-baseline-moves-under-the-page` NAMES, and the reason this instrument
// exists at all rather than a threshold being bolted onto `hardware-floor.ts`: that file's
// `buildLand` hand-assembles a ground plane and some shrubs, so its control is not the map and
// silently stops being it whenever a sibling lands.

test('every arm is built through the shipped scene builder, not assembled here', () => {
  const page = source('land-floor-scene.ts');
  assert.ok(/buildGrassScene\(/.test(page), 'the arms must come from the shipped-grass builder');
  // And this file must not construct a scene of its own by any of the routes that would let it.
  assert.ok(!/new THREE\.Scene\(/.test(page), 'this page must not build a scene of its own');
  assert.ok(!/cellGroundGeometry\(/.test(page), 'the geometry is the builder’s, not this page’s');
  assert.ok(!/shippedGroundBuild\(/.test(page), 'reached through buildGrassScene, never directly');
  assert.ok(!/buildGroundMaterial\(/.test(page), 'the material is the builder’s, not this page’s');
});

test('this instrument reads the GPU clock and carries no gl.finish() timing route', () => {
  // ⚠ THE ROUTE THIS FILE EXISTS TO REPLACE. `hardware-floor.ts`'s cost number is a wall clock
  // around `gl.finish()`, measured 29x–255x adrift of the GPU clock and BLIND to an 8.7x change
  // in real GPU work. Carrying it here would invite a reader to quote the familiar number.
  const page = source('land-floor-scene.ts');
  assert.ok(/TIME_ELAPSED_EXT/.test(page), 'the GPU clock is the only timing route');
  assert.ok(
    !/performance\.now\(\)/.test(page),
    'a wall-clock route must not exist here at all — its absence is the guarantee',
  );
});

// ---------------------------------------------------------------- the amplifier

test('amplifyGrass multiplies the grass call and nothing else', () => {
  const src = `  vec3 c = base;\n  c = mix(c, ${GRASS_CALL}, uGrassMix);\n  gl_FragColor = vec4(c, 1.0);`;
  const out = amplifyGrass(src, 4);
  assert.equal(count(out, 'st_grassColour('), 4);
  // The surrounding shader is untouched: same statements, same order.
  assert.ok(out.includes('vec3 c = base;'));
  assert.ok(out.includes('gl_FragColor = vec4(c, 1.0);'));
  assert.ok(out.includes('uGrassMix'));
});

test('the amplified calls carry DISTINCT arguments — identical ones would collapse to one', () => {
  // ⚠ THE FAILURE THIS PREVENTS IS SILENT AND SELF-CONFIRMING. `factor` copies of an identical
  // call are ONE call after common-subexpression elimination, so the arm would be equivalent to
  // the layer arm while claiming to be eight times dearer — and the sensitivity rung would then
  // report the instrument as blind, in every run, forever.
  const out = amplifyGrass(`x = ${GRASS_CALL};`, AMPLIFY_FACTOR);
  const args = [...out.matchAll(/st_grassColour\(([^)]*\))\)/g)].map((m) => m[1]);
  assert.equal(args.length, AMPLIFY_FACTOR);
  assert.equal(new Set(args).size, AMPLIFY_FACTOR, 'every evaluation must have its own offset');
});

test('amplifyGrass REFUSES a shader without the anchor rather than returning it unchanged', () => {
  // ⚠⚠ THE WHOLE SAFETY OF THE SENSITIVITY RUNG. A silent miss makes the amplified arm identical
  // to the layer arm; the rung then correctly reports blindness and a reader blames the box.
  assert.throws(
    () => amplifyGrass('gl_FragColor = vec4(1.0);', 8),
    /does not contain/,
  );
  assert.throws(() => amplifyGrass('gl_FragColor = vec4(1.0);', 8), /REFUSED/);
});

test('amplifyGrass refuses a factor that is not a positive integer', () => {
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => amplifyGrass(`x = ${GRASS_CALL};`, bad), /positive integer/);
  }
});

test('a factor of one is the identity — the layer arm is not secretly amplified', () => {
  const src = `c = mix(c, ${GRASS_CALL}, uGrassMix);`;
  assert.equal(amplifyGrass(src, 1), src);
});

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ------------------------------------------------- the anchor is the REAL shipped shader's
//
// ⚠⚠ THE SEAM THAT WOULD OTHERWISE ROT. `GRASS_CALL` is a string in this file describing a line
// emitted by `src/banded-ground-material.ts`. Nothing but this test connects the two, so a rename
// there would leave the amplifier throwing at run time — on the Mint box, mid-measurement — rather
// than here. The arm is BUILT, so the assertion is about the shader that actually ships.

test('the real shipped grassed material contains the anchor amplifyGrass looks for', () => {
  const layer = buildLandFloorScene(LAND_FLOOR_LAYER, 'one', 8);
  const fragment = fragmentOf(layer);
  assert.ok(
    fragment.includes(GRASS_CALL),
    `src/banded-ground-material.ts no longer emits "${GRASS_CALL}" — the amplifier's anchor moved`,
  );
});

test('the CONTROL arm’s shader carries no grass at all — it is the map as it draws today', () => {
  const fragment = fragmentOf(buildLandFloorScene(LAND_FLOOR_CONTROL, 'one', 8));
  assert.ok(!fragment.includes('st_grassColour'), 'the control must be the ungrassed shader');
  assert.equal(LAND_FLOOR_ARM_MIX.flat, null);
});

test('the amplified arm really does evaluate the layer AMPLIFY_FACTOR times over', () => {
  const layer = fragmentOf(buildLandFloorScene(LAND_FLOOR_LAYER, 'one', 8));
  const amplified = fragmentOf(buildLandFloorScene(LAND_FLOOR_AMPLIFIED, 'one', 8));
  const layerCalls = count(layer, 'st_grassColour(vWorld');
  const amplifiedCalls = count(amplified, 'st_grassColour(vWorld');
  assert.equal(layerCalls, 1, 'the shipped shader evaluates the grass once');
  assert.equal(amplifiedCalls, AMPLIFY_FACTOR);
  assert.notEqual(layer, amplified, 'the sensitivity control must not be the layer arm');
});

// ---------------------------------------------------- the isolation is geometric, and checked here
//
// The pure half REFUSES a run whose arms differ in triangles or draw calls. This asserts the arms
// this file builds satisfy that by construction, so the rung is a backstop rather than the only
// thing standing between the report and a geometry delta wearing the layer's name.

test('all three arms draw byte-identical geometry — layer 1 adds no triangles', () => {
  const built = LAND_FLOOR_ARMS.map((a) => buildLandFloorScene(a, 'one', 8));
  const first = built[0]!;
  for (const s of built) {
    assert.equal(s.triangles, first.triangles, `${s.width}x${s.height}: triangle counts must match`);
    assert.equal(s.width, first.width);
    assert.equal(s.height, first.height);
    assert.equal(s.pxPerUnit, first.pxPerUnit);
  }
  assert.ok(first.triangles > 0, 'the arms must actually draw ground');
});

// ---------------------------------------------------------------- the arithmetic the clock is read against

test('the octave counts are derived from the layer, never typed', () => {
  assert.equal(LAND_FLOOR_ARM_OCTAVES.flat, 0);
  assert.equal(LAND_FLOOR_ARM_OCTAVES.grass, GRASS_OCTAVES);
  assert.equal(LAND_FLOOR_ARM_OCTAVES['grass-amplified'], GRASS_OCTAVES * AMPLIFY_FACTOR);
});

test('the layer really is the 23-octave one the arc asks about — re-derived, not inherited', () => {
  // ⚠ RE-MEASURED RATHER THAN QUOTED. `comparison-baseline-moves-under-the-page`: a figure in a
  // parked row is a figure as at the day it was parked. This reads the constant the SHADER is
  // generated from, so if the transcription changes, this number changes with it.
  assert.equal(GRASS_OCTAVES, 23);
  assert.equal(buildLandFloorScene(LAND_FLOOR_LAYER, 'one', 8).octaves, 23);
  assert.equal(buildLandFloorScene(LAND_FLOOR_CONTROL, 'one', 8).octaves, 0);
});

test('the amplified arm reports its multiplied octave count, not the layer’s', () => {
  assert.equal(
    buildLandFloorScene(LAND_FLOOR_AMPLIFIED, 'one', 8).octaves,
    GRASS_OCTAVES * AMPLIFY_FACTOR,
  );
});

// ---------------------------------------------------------------- the arms' identities

test('the layer and the sensitivity control wear the SAME mix — only the evaluation count differs', () => {
  assert.equal(LAND_FLOOR_ARM_MIX.grass, LAND_FLOOR_ARM_MIX['grass-amplified']);
  assert.equal(LAND_FLOOR_ARM_MIX.grass, GRASS_ARM_MIX[LAYER_ARM_MIX]);
  assert.equal(grassArmFor(LAND_FLOOR_LAYER), grassArmFor(LAND_FLOOR_AMPLIFIED));
  assert.equal(grassArmFor(LAND_FLOOR_CONTROL), 'flat');
});

test('the three arms are distinct and the control is one of them', () => {
  assert.equal(new Set(LAND_FLOOR_ARMS).size, 3);
  assert.ok(LAND_FLOOR_ARMS.includes(LAND_FLOOR_CONTROL));
  assert.ok(LAND_FLOOR_ARMS.includes(LAND_FLOOR_LAYER));
  assert.ok(LAND_FLOOR_ARMS.includes(LAND_FLOOR_AMPLIFIED));
});

test('the amplification is at least as large as the blindness it tests for', () => {
  // The route this instrument replaces was measured blind to an 8.7x change in real GPU work. An
  // amplification smaller than the failure would not settle the question.
  assert.ok(AMPLIFY_FACTOR >= 8);
});

/** The fragment shader one built arm would compile. */
function fragmentOf(scene: { scene: { children: unknown[] } }): string {
  for (const child of scene.scene.children) {
    const mesh = child as { material?: { fragmentShader?: string } };
    if (mesh.material?.fragmentShader !== undefined) return mesh.material.fragmentShader;
  }
  throw new Error('no shader material in the built arm');
}
