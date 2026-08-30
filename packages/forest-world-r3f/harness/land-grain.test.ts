// land-grain.test.ts — the grain octave's HARNESS wiring: the experiment's own material, and the
// separation from the experiment's regional field.
//
// ⚠ THE MODULE ITSELF IS IN `src/` NOW and its arithmetic is proved beside it, in
// `src/land-grain.test.ts`. What is left here is what genuinely belongs to the experiment: how
// `harness/banded-material.ts` wires the grain's two halves into a shader, and the claim that the
// grain is a GRAIN rather than `harness/ground-variation.ts`'s regional field under a new name.
// Both reach for harness modules that must not cross, so the split is by dependency rather than
// by taste.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createBandedMaterial } from './banded-material.js';
import { REGION_WAVELENGTHS } from './ground-variation.js';
import {
  GRAIN_COLOUR_MIX,
  GRAIN_LATTICE,
  GRAIN_NORMAL_STRENGTH,
  grainFeaturePeriod,
  grainField,
  grainKeepsPaletteClosed,
} from './land-grain.js';
import { landTokens } from './palette-band.js';

const HEALTHY = landTokens()[0]!;

test('the grain is GRAIN, not the regional field under a new name', () => {
  // `ground-variation.ts` runs at 96 and 61 units precisely so that neighbouring CELLS agree.
  // This field has the opposite job, and the distinction is the one the 2026-08-16 rejection
  // turned on. Stated as a comparison against that module's own constants so it cannot drift
  // if either is retuned.
  const shortestRegional = Math.min(...REGION_WAVELENGTHS);
  assert.ok(
    grainFeaturePeriod() < shortestRegional / 5,
    `a ${grainFeaturePeriod().toFixed(1)}-unit grain feature is not clearly below the ` +
      `regional field's ${shortestRegional}-unit wavelength`,
  );
  // ...and it must vary WITHIN one cell. The island's measured mean cell pitch is ~16.5 units;
  // a field that is constant across a cell is regional variation however short its wavelength
  // is claimed to be.
  let varied = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const x = i * 1.7;
    const z = i * 0.9;
    const a = grainField(x, z);
    const b = grainField(x + GRAIN_LATTICE / 2, z);
    if (Math.abs(a - b) > 0.05) varied++;
  }
  assert.ok(varied > trials * 0.5, `only ${varied}/${trials} half-wavelength steps changed the field`);
});

test('an UNGRAINED material compiles the source it always did', () => {
  const m = createBandedMaterial({ token: HEALTHY });
  // Not one grain identifier reaches a material that did not ask for grain. This is what makes
  // "absent means bit-identical" a property of the code rather than a promise in a comment —
  // the same argument the `shadow` option already makes.
  assert.doesNotMatch(m.fragmentShader, /st_grain/);
  assert.doesNotMatch(m.fragmentShader, /uGrain/);
  assert.equal(Object.keys(m.uniforms).some((k) => k.startsWith('uGrain')), false);
  assert.equal(grainKeepsPaletteClosed(m.fragmentShader), true);
});

test('the NORMAL half is palette-closed and the COLOUR half is not', () => {
  // THE FINDING. Both halves are the approved treatment; only one of them can be captured by
  // the instrument this project currently has.
  const normal = createBandedMaterial({ token: HEALTHY, grain: { mode: 'normal' } });
  assert.match(normal.fragmentShader, /st_grainGradient\(vWorld\.xz\)/);
  // ⚠ The DEFINITIONS are always emitted by grainGlsl(); what distinguishes the two halves is
  // which one main() CALLS. Matching the bare identifier here reported a false failure.
  assert.doesNotMatch(normal.fragmentShader, /st_grainRamped\(vWorld/);
  assert.equal(
    grainKeepsPaletteClosed(normal.fragmentShader),
    true,
    'normal-domain grain perturbs the lambert BEFORE quantisation and must stay closed',
  );

  const colour = createBandedMaterial({ token: HEALTHY, grain: { mode: 'colour' } });
  assert.match(colour.fragmentShader, /st_grainRamped\(vWorld\.xz\)/);
  assert.doesNotMatch(colour.fragmentShader, /st_grainGradient\(vWorld/);
  assert.equal(
    grainKeepsPaletteClosed(colour.fragmentShader),
    false,
    'colour-domain grain mixes into the output and CANNOT be closed — see ADR-0418 D4',
  );

  const both = createBandedMaterial({ token: HEALTHY, grain: { mode: 'both' } });
  assert.match(both.fragmentShader, /st_grainGradient\(vWorld/);
  assert.match(both.fragmentShader, /st_grainRamped\(vWorld/);
  assert.equal(grainKeepsPaletteClosed(both.fragmentShader), false);
});

test('the grain strengths reach the material as uniforms it can sweep', () => {
  const m = createBandedMaterial({
    token: HEALTHY,
    grain: { mode: 'both', normalStrength: 0.42, colourMix: 0.07 },
  });
  assert.equal(m.uniforms['uGrainNormalStrength']?.value, 0.42);
  assert.equal(m.uniforms['uGrainColourMix']?.value, 0.07);
  const d = createBandedMaterial({ token: HEALTHY, grain: { mode: 'both' } });
  assert.equal(d.uniforms['uGrainNormalStrength']?.value, GRAIN_NORMAL_STRENGTH);
  assert.equal(d.uniforms['uGrainColourMix']?.value, GRAIN_COLOUR_MIX);
});

test('grain composes with the shadow field rather than replacing it', () => {
  // The shadow adds a fifth ramp entry; the grain must not knock it out, or a grained land
  // would silently lose its shadows and read as a lighting regression.
  const tex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
  const m = createBandedMaterial({
    token: HEALTHY,
    grain: { mode: 'normal' },
    shadow: { texture: tex, minX: 0, minZ: 0, spanX: 1, spanZ: 1 },
  });
  assert.match(m.fragmentShader, /uShadowTex/);
  assert.match(m.fragmentShader, /st_grainGradient\(vWorld/);
  assert.equal(grainKeepsPaletteClosed(m.fragmentShader), true);
});
