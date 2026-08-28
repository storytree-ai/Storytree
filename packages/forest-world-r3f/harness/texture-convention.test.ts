import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSET_MATERIALS,
  CONVENTION_TOLERANCE,
  COLOUR_MAP_SLOTS,
  DATA_MAP_SLOTS,
  MIN_HYPOTHESIS_SEPARATION,
  RAW_COLOUR_SPACE,
  applyRawColourConvention,
  checkAssetMaterials,
  judgeColourConvention,
  srgbToLinearByte,
  srgbToLinearUnit,
} from './texture-convention.js';
import type {
  ConventionMaterial,
  ConventionObservation,
  ConventionTexture,
  Rgb,
} from './texture-convention.js';

const HARNESS = fileURLToPath(new URL('.', import.meta.url));

function texture(): ConventionTexture {
  return { colorSpace: 'srgb', needsUpdate: false };
}

// ------------------------------------------------------------------ the transfer function

test('srgbToLinear reproduces the curve three applies to a texel it believes is sRGB', () => {
  assert.equal(srgbToLinearUnit(0), 0);
  assert.equal(srgbToLinearUnit(1), 1);
  // The linear segment below the knee, exactly.
  assert.ok(Math.abs(srgbToLinearUnit(0.04) - 0.04 / 12.92) < 1e-12);
  // Mid grey is the case the whole hazard turns on: it darkens by a factor of ~2.6 at 128 and
  // more further down, which is why a whole picture reads as a moody art choice rather than a bug.
  assert.ok(srgbToLinearUnit(0.5) < 0.25);
  // Monotone — a non-monotone curve would let two different source means predict one delivery.
  let prev = -1;
  for (let i = 0; i <= 255; i++) {
    const v = srgbToLinearUnit(i / 255);
    assert.ok(v > prev, `not monotone at ${i}`);
    prev = v;
  }
});

test('the measured hazard reproduces: rgb(70,90,69) linearises to the rgb(15,26,15) that was delivered', () => {
  // `docs/research/chapter2-textured-asset-2026-08-28/` §5 — the source map's own mean, and what
  // the first live render actually put on screen. If this ever stops holding, the mechanism this
  // whole module is built on has changed and the check is guarding the wrong thing.
  //
  // ⚠ WITHIN ONE BYTE, AND THE SLACK IS NOT LAZINESS. That README states the prediction as
  // (14.7, 25.4, 14.3), which is the PURE 2.2 GAMMA approximation. three's shader applies the
  // exact IEC piecewise curve (`sRGBTransferEOTF`, 1/1.055 and 0.055/1.055 spelled out in its
  // GLSL), which is what this module reproduces and which answers (15.6, 26.1, 15.2). The
  // delivered frame's own bytes were (15, 26, 15). So the exact curve predicts the MEASUREMENT
  // to within a byte on every channel and the approximation is the thing that is one off — the
  // slack absorbs the frame's own rounding, not a disagreement about the curve.
  for (const [source, delivered] of [
    [70, 15],
    [90, 26],
    [69, 15],
  ] as const) {
    assert.ok(
      Math.abs(srgbToLinearByte(source) - delivered) <= 1,
      `srgbToLinear(${source}) = ${srgbToLinearByte(source).toFixed(2)}, delivered was ${delivered}`,
    );
  }
});

// ------------------------------------------------------------------ the convention itself

test('applyRawColourConvention puts colour maps raw and leaves data maps alone', () => {
  const material: ConventionMaterial = {
    map: texture(),
    emissiveMap: texture(),
    normalMap: texture(),
    roughnessMap: texture(),
    metalnessMap: null,
    aoMap: texture(),
  };
  const applied = applyRawColourConvention(material);

  assert.deepEqual(applied.colourSlots, ['map', 'emissiveMap']);
  assert.deepEqual(applied.dataSlots, ['normalMap', 'roughnessMap', 'aoMap']);

  for (const slot of COLOUR_MAP_SLOTS) {
    // ⚠ THE LITERAL, NOT `RAW_COLOUR_SPACE`. Asserting against the constant the subject uses is
    // the shape `an-expectation-derived-from-its-subject-cannot-fail` warns about, and it is not
    // hypothetical here: a mutation changing that constant to 'srgb' — the whole defect, in one
    // token — left this test green, because both sides moved together.
    assert.equal(material[slot]!.colorSpace, '', `${slot} was not put raw`);
    assert.equal(material[slot]!.needsUpdate, true, `${slot} was changed without needsUpdate`);
  }
  for (const slot of ['normalMap', 'roughnessMap', 'aoMap'] as const) {
    assert.equal(
      material[slot]!.colorSpace,
      'srgb',
      `${slot} carries linear DATA and forcing it raw would be a second, opposite bug`,
    );
  }
});

test('applyRawColourConvention is a no-op on a material with no maps, and says so', () => {
  const applied = applyRawColourConvention({});
  assert.deepEqual(applied.colourSlots, []);
  assert.deepEqual(applied.dataSlots, []);
});

test('RAW_COLOUR_SPACE is three\'s own NoColorSpace, captured rather than transcribed', () => {
  // The convention this module enforces is three's, not ours, so the value is pinned to the
  // library's own constant. A hand-typed copy that drifted from a three upgrade would enforce a
  // colour space nothing decodes — and every test written against our copy would still pass.
  assert.equal(RAW_COLOUR_SPACE, THREE.NoColorSpace);
  assert.notEqual(RAW_COLOUR_SPACE, THREE.SRGBColorSpace);
});

test('the two slot lists do not overlap — a slot cannot be both colour and data', () => {
  const colour = new Set<string>(COLOUR_MAP_SLOTS);
  for (const slot of DATA_MAP_SLOTS) assert.ok(!colour.has(slot), `${slot} is in both lists`);
});

// ------------------------------------------------------------------ the delivered-pixel verdict

/** A clean run: the frame lands on the raw control. Numbers are shaped like a real observation —
 *  a mid-green foliage map, and its linearisation, both as rendered flat swatches. */
function greenObservation(delivered: Rgb): ConventionObservation {
  return {
    material: 'Pine_Branches',
    delivered,
    rawControl: { r: 70, g: 90, b: 69 },
    managedControl: { r: 15, g: 26, b: 15 },
  };
}

test('a frame delivering the map\'s own colours is judged RAW and passes', () => {
  const j = judgeColourConvention(greenObservation({ r: 70, g: 90, b: 69 }));
  assert.equal(j.verdict, 'RAW');
  assert.equal(j.ok, true);
  assert.equal(j.rawError, 0);
});

test('THE DEFECT: a frame delivering the linearised colours is judged COLOUR-MANAGED and REFUSED', () => {
  const j = judgeColourConvention(greenObservation({ r: 15, g: 26, b: 15 }));
  assert.equal(j.verdict, 'COLOUR-MANAGED');
  assert.equal(j.ok, false);
  assert.match(j.detail, /base-colour map is being decoded as sRGB/);
  assert.match(j.detail, /applyRawColourConvention/);
});

test('a frame matching NEITHER control is refused rather than rounded to the nearer one', () => {
  // Half way between the two hypotheses is not evidence for either, and a check that picked the
  // nearer would report a confident answer about a frame it did not understand.
  const j = judgeColourConvention(greenObservation({ r: 42, g: 58, b: 42 }));
  assert.equal(j.verdict, 'NEITHER');
  assert.equal(j.ok, false);
});

test('the tolerance admits filtering noise and nothing like the distance to the other answer', () => {
  const inside = judgeColourConvention(greenObservation({ r: 74, g: 95, b: 73 }));
  assert.equal(inside.verdict, 'RAW');
  assert.ok(inside.rawError < CONVENTION_TOLERANCE);

  const outside = judgeColourConvention(greenObservation({ r: 90, g: 116, b: 89 }));
  assert.notEqual(outside.verdict, 'RAW');
});

test('NON-VACUITY: a map whose two hypotheses nearly coincide is refused as INDISCRIMINATE', () => {
  // A near-black map linearises to nearly itself, so no frame of it can say which convention
  // produced it. The check must refuse rather than pass — passing there would be reporting its
  // own blindness as a green.
  const j = judgeColourConvention({
    material: 'Nearly_Black',
    delivered: { r: 4, g: 4, b: 4 },
    rawControl: { r: 5, g: 5, b: 5 },
    managedControl: { r: 4, g: 4, b: 4 },
  });
  assert.equal(j.verdict, 'INDISCRIMINATE');
  assert.equal(j.ok, false);
  assert.ok(j.separation < MIN_HYPOTHESIS_SEPARATION);
  assert.match(j.detail, /refuses rather than reporting its own blindness/);
});

test('a separation exactly at the floor is admitted, and the verdict is then decided on pixels', () => {
  const j = judgeColourConvention({
    material: 'Exactly_At_The_Floor',
    delivered: { r: 100, g: 100, b: 100 },
    rawControl: { r: 100, g: 100, b: 100 },
    managedControl: { r: 50, g: 50, b: 50 },
  });
  assert.equal(j.separation, MIN_HYPOTHESIS_SEPARATION);
  assert.equal(j.verdict, 'RAW');
});

// ------------------------------------------------------------------ what must be there at all

test('checkAssetMaterials refuses an asset whose materials are not the declared ones', () => {
  const url = '/assets/pine-01.glb';
  assert.equal(checkAssetMaterials(url, ['Pine_Trunks', 'Pine_Branches']), null);
  assert.equal(checkAssetMaterials(url, ['Pine_Branches', 'Pine_Trunks']), null, 'order is not the claim');

  // The vacuity this exists to catch: an asset whose materials failed to load carries none, and
  // every per-material judgement then passes trivially over an empty set.
  const none = checkAssetMaterials(url, []);
  assert.ok(none && none.includes('ASSET_MATERIALS declares'));

  const extra = checkAssetMaterials(url, ['Pine_Trunks', 'Pine_Branches', 'Pine_Rocks_01']);
  assert.ok(extra && extra.includes('Pine_Rocks_01'));
});

test('an undeclared asset is refused rather than skipped', () => {
  const msg = checkAssetMaterials('/assets/not-declared.glb', ['Whatever']);
  assert.ok(msg && msg.includes('an undeclared asset is an unchecked one'));
});

test('every declared asset names at least one material', () => {
  const entries = Object.entries(ASSET_MATERIALS);
  assert.ok(entries.length > 0, 'ASSET_MATERIALS is empty — nothing is being checked');
  for (const [url, materials] of entries) {
    assert.ok(materials.length > 0, `${url} declares no materials, which checks nothing`);
  }
});

// ------------------------------------------------------------------ COVERAGE OF THE CONVENTION

/**
 * ⚠ THE LEG THAT CATCHES THE HAZARD THIS MODULE ACTUALLY EXISTS FOR.
 *
 * Everything above proves the convention is correct where it is applied. None of it notices a
 * NEW loading path that never applies it — which is exactly how the hazard returns: a different
 * session, a different page, a fresh `new GLTFLoader()`, and a picture that comes out dark and
 * looks deliberate.
 *
 * So the subject list is scraped off the DIRECTORY rather than declared, and every module that
 * reaches for a loader must also reach for the convention. A page cannot opt out by not being
 * on a list, because there is no list to be off.
 *
 * ⚠ WHY IMPORTS AND CONSTRUCTOR CALLS RATHER THAN THE BARE WORD. `asset-payload.ts` discusses
 * `GLTFLoader` in prose and loads nothing; a check keyed on the word would demand the convention
 * of a comment. Lines that are plainly comments are dropped and the match is on code shapes.
 * This is a text scan, so a loader reached by a computed name would slip past it — the runtime
 * probe in `colour-convention-measure.mjs` is what covers that, by judging delivered pixels.
 */
const LOADER_IMPORT = /^\s*import[^;]*\b(GLTFLoader|TextureLoader|KTX2Loader|DRACOLoader|useGLTF)\b/;
const LOADER_CALL = /\bnew\s+(?:THREE\.)?(GLTFLoader|TextureLoader|KTX2Loader|DRACOLoader)\s*\(/;
/**
 * ⚠ A CALL, NOT THE NAME. The first version of this scan asked whether the module MENTIONED
 * `applyRawColourConvention`, and a mutation deleting the call left the import behind — so the
 * scan stayed green over the exact pre-fix state it exists to refuse. An import is not a use.
 */
const CONVENTION_CALL = /\bapplyRawColourConvention\s*\(/;

/** The convention's own module and its own test, which necessarily name it without loading. */
const NOT_SUBJECTS = new Set(['texture-convention.ts', 'texture-convention.test.ts']);

function codeLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
}

test('every module in harness/ that reaches for a texture loader routes through the convention', () => {
  const files = readdirSync(HARNESS).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.mjs')) && !NOT_SUBJECTS.has(f),
  );
  assert.ok(files.length > 40, `only ${files.length} harness modules found — the scan lost its subject`);

  const loaders: string[] = [];
  const unrouted: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(HARNESS, file), 'utf8');
    const lines = codeLines(source);
    const loads = lines.some((l) => LOADER_IMPORT.test(l)) || lines.some((l) => LOADER_CALL.test(l));
    if (!loads) continue;
    loaders.push(file);
    if (!codeLines(source).some((l) => CONVENTION_CALL.test(l))) unrouted.push(file);
  }

  // Non-vacuity: if the scan finds NO loader at all it has stopped matching anything, and it
  // would keep reporting green for every future page. There is at least one loader here today.
  assert.ok(
    loaders.length > 0,
    'the scan matched no loader anywhere in harness/ — its patterns have stopped matching code, ' +
      'so it is passing without checking anything',
  );

  assert.deepEqual(
    unrouted,
    [],
    `these modules load textures without routing through applyRawColourConvention(): ${unrouted.join(', ')}. ` +
      'A texture loaded the ordinary way is decoded as sRGB and renders about 3.5x dark on this ' +
      'renderer, which looks like a deliberate art choice rather than a bug — see ' +
      'texture-convention.ts.',
  );
});

test('the scan reads code, not prose — a module that only DISCUSSES a loader is not a subject', () => {
  // `asset-payload.ts` names GLTFLoader in a comment and loads nothing. If the scan demanded the
  // convention of it, the honest fix would be to weaken the scan, and the next real defect would
  // walk through the weakened version.
  const source = readFileSync(join(HARNESS, 'asset-payload.ts'), 'utf8');
  assert.ok(source.includes('GLTFLoader'), 'asset-payload.ts no longer mentions a loader in prose');
  const lines = codeLines(source);
  assert.ok(!lines.some((l) => LOADER_IMPORT.test(l) || LOADER_CALL.test(l)));
});
