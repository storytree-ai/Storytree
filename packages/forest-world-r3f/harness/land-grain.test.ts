// land-grain.test.ts — the grain octave's pure half, and the one property of the shader that
// a picture can never establish.
//
// THE TEST THIS FILE IS REALLY FOR is `grain keeps the palette closed`. Everything else here
// is ordinary field arithmetic; that one carries the increment's finding, because the palette
// closure is the property `capture.mjs` can only ever SAMPLE. A capture proves the pixels it
// photographed were on-palette; it can never prove no reachable pixel is off it. The generated
// SOURCE carries the stronger claim, and the two halves of the grain sit on opposite sides of
// it — which is the whole reason they are separate options.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createBandedMaterial } from './banded-material.js';
import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  GRAIN_OCTAVES,
  GRAIN_RAMP,
  GRAIN_ROUGHNESS,
  GRAIN_LATTICE,
  GRAIN_FEATURE_RATIO,
  grainColourAt,
  grainFeaturePeriod,
  grainField,
  grainGlsl,
  grainGradient,
  grainKeepsPaletteClosed,
  grainPerturbNormal,
  grainRamped,
  grainStopHexes,
  grainStops,
  linearToSrgb255,
} from './land-grain.js';
import { REGION_WAVELENGTHS } from './ground-variation.js';
import { landTokens, rungOfNormal, toHex } from './palette-band.js';

const HEALTHY = landTokens()[0]!;

test('linearToSrgb255 round-trips every byte through the INVERSE transfer', () => {
  // Stated as a round trip against the inverse rather than against a table of expected
  // outputs, because a table is only ever a second copy of the implementation and goes green
  // for exactly as long as the implementation is stable — including while it is wrong. The
  // inverse below is an independent statement of what sRGB IS, so agreeing with it is a real
  // constraint. (It also catches the whole class of "someone replaced this with a multiply":
  // a linear transfer round-trips only at 0 and 1.)
  const srgbToLinear = (s: number): number =>
    s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  for (let b = 0; b <= 255; b++) {
    assert.equal(linearToSrgb255(srgbToLinear(b / 255)), b, `byte ${b} did not survive the round trip`);
  }
  assert.equal(linearToSrgb255(0), 0);
  assert.equal(linearToSrgb255(1), 255);
  // Out of range is clamped rather than allowed to produce a bogus byte.
  assert.equal(linearToSrgb255(-1), 0);
  assert.equal(linearToSrgb255(5), 255);
});

test('the grain stops are CONVERTED from linear, not transcribed', () => {
  const [dark, light] = grainStops();
  // The trap this guards: dropping Blender's linear numbers straight in. `0.055 * 255` is 14;
  // the correct sRGB byte is 66. A dark stop near 14 would read as dirt, not as grain, and
  // would look like an amplitude mistake rather than a colour-space one.
  assert.ok(dark.r > 50, `dark stop r=${dark.r} looks like a raw linear value, not sRGB`);
  assert.ok(dark.r < 90);
  assert.ok(light.r > 180, `light stop r=${light.r} is too dark to be the 0.560 stop in sRGB`);
  // The two stops must be genuinely far apart or the ramp delivers no grain at all.
  assert.ok(light.r - dark.r > 100);
  // And the pair round-trips to hex, which is the form the evidence sheets print.
  assert.deepEqual(grainStopHexes(), [toHex(dark), toHex(light)]);
});

test('the field stays in [0,1] and is deterministic', () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = -120; x <= 120; x += 0.37) {
    for (let z = -70; z <= 70; z += 0.53) {
      const v = grainField(x, z);
      assert.ok(Number.isFinite(v), `field is ${v} at (${x}, ${z})`);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  assert.ok(lo >= 0 && hi <= 1, `field range [${lo}, ${hi}] escapes [0,1]`);
  // A normalised fbm should actually USE its range; one that spans 0.48..0.52 is a constant
  // wearing a noise function's name and would deliver no grain.
  assert.ok(hi - lo > 0.4, `field only spans ${(hi - lo).toFixed(3)} — too flat to grain anything`);
  assert.equal(grainField(11.25, -4.5), grainField(11.25, -4.5));
});

test('a delivered feature is GRAIN_FEATURE_RATIO times the lattice, and that ratio is pinned', () => {
  // ⚠ THIS TEST FOUND A REAL DEFECT AND ITS FIRST VERSION ASSERTED THE WRONG MODEL. It was
  // written expecting the delivered period to BE the lattice spacing, and measured 6.3 against
  // an authored 2.5. The field was not wrong — the model was: successive hash sites are
  // independent, so a smoothstep value-noise field crosses its mean about once every 1.3
  // cells, giving a period of ~2.6 spacings. That factor decides whether the grain lands at
  // the pixel scale or up beside the `fine` octave, so it is a named constant with a test
  // under it rather than a fact about noise someone is expected to know.
  //
  // THE INVERSION IT STILL CATCHES: a spacing used where a frequency belongs (or the other way
  // round) produces either a flat wash or pure per-pixel static, and both look like an
  // amplitude problem rather than the frequency problem they are.
  const span = 2000;
  const step = 0.05;
  const periods: number[] = [];
  for (const line of [3.75, -11.2, 40.1]) {
    const samples: number[] = [];
    for (let x = 0; x < span; x += step) samples.push(grainField(x, line));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1]! < mean !== (samples[i]! < mean)) crossings++;
    }
    periods.push(span / (crossings / 2)); // two crossings per period
  }
  const measured = periods.reduce((a, b) => a + b, 0) / periods.length;
  const ratio = measured / GRAIN_LATTICE;
  console.log(
    `  delivered feature period ${measured.toFixed(2)} ground units = ` +
      `${ratio.toFixed(2)} x the ${GRAIN_LATTICE}-unit lattice`,
  );
  assert.ok(
    Math.abs(ratio - GRAIN_FEATURE_RATIO) < 0.35,
    `measured ratio ${ratio.toFixed(2)} disagrees with the declared GRAIN_FEATURE_RATIO ` +
      `${GRAIN_FEATURE_RATIO} — grainFeaturePeriod() is now lying to every caller that sizes ` +
      'the grain against the cell pitch or the pixel budget',
  );
  assert.ok(Math.abs(grainFeaturePeriod() - GRAIN_LATTICE * GRAIN_FEATURE_RATIO) < 1e-9);
});

test('the delivered feature clears both floors it has to clear', () => {
  // Below ~1 ground unit a feature is aliasing shimmer at the overview zoom; above the
  // ~16.5-unit mean cell pitch it is regional variation rather than grain. Both are previously
  // measured constraints, and the grain has to sit between them or it is a different lever.
  const feature = grainFeaturePeriod();
  assert.ok(feature > 1, `a ${feature.toFixed(2)}-unit feature is aliasing shimmer, not grain`);
  assert.ok(feature < 16.5, `a ${feature.toFixed(2)}-unit feature spans a cell — that is regional drift`);
});

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

test('the ramp clamps outside its authored span', () => {
  const [lo, hi] = GRAIN_RAMP;
  assert.ok(lo < hi);
  for (let x = 0; x < 200; x += 0.31) {
    const t = grainRamped(x, 12.5);
    assert.ok(t >= 0 && t <= 1, `ramped value ${t} escapes [0,1]`);
  }
});

test('the normal half moves SOME ground between rungs and not all of it', () => {
  // THE MEASUREMENT THIS INCREMENT TURNS ON, stated as a requirement rather than as an
  // observation. `SHADE_LEVELS` is [0.78, 0.80, 0.90, 1.00] and flat ground sits at rung 2
  // (half-lambert 0.9105 under the authored light), so grain on flat ground can only express
  // itself as a rung FLIP. Two ways it can fail, and both are silent:
  //   - flips nothing, and the component is invisible however good the field is;
  //   - flips most of the ground, and it is a repaint rather than a grain.
  // The bounds below come from those two failure modes, NOT from a number this run produced.
  const flat = { x: 0, y: 1, z: 0 };
  const base = rungOfNormal(flat);
  let flipped = 0;
  let total = 0;
  for (let x = -100; x <= 100; x += 1.3) {
    for (let z = -60; z <= 60; z += 1.1) {
      total++;
      if (rungOfNormal(grainPerturbNormal(flat, x, z)) !== base) flipped++;
    }
  }
  const fraction = flipped / total;
  // Reported, because the research note quotes it and a number in a log beats one in prose.
  console.log(
    `  grain rung-flip fraction on flat ground at strength ${GRAIN_NORMAL_STRENGTH}: ` +
      `${(fraction * 100).toFixed(1)}% (${flipped}/${total})`,
  );
  assert.ok(fraction > 0.001, `grain flips ${(fraction * 100).toFixed(3)}% of flat ground — invisible`);
  assert.ok(fraction < 0.5, `grain flips ${(fraction * 100).toFixed(1)}% of flat ground — a repaint`);
});

test('a stronger bump flips strictly more ground', () => {
  // Monotonicity in the strength knob. Without it the measurement sweep cannot be read as a
  // sweep, and a sign error in the gradient would still satisfy the band above.
  const flat = { x: 0, y: 1, z: 0 };
  const base = rungOfNormal(flat);
  const flips = (strength: number): number => {
    let n = 0;
    for (let x = -80; x <= 80; x += 1.7) {
      for (let z = -50; z <= 50; z += 1.3) {
        if (rungOfNormal(grainPerturbNormal(flat, x, z, strength)) !== base) n++;
      }
    }
    return n;
  };
  assert.equal(flips(0), 0, 'zero strength must be a no-op');
  assert.ok(flips(0.6) > flips(0.3), 'doubling the bump strength did not flip more ground');
});

test('the gradient is a central difference of the field', () => {
  // Not tautological: it asserts the SIGN convention, which is the half that a bump gets
  // wrong silently. `addGableRoof` shipped with its normal components swapped and shaded every
  // roof as its own complement — caught by measuring, never by reading.
  for (const [x, z] of [
    [3.1, 7.2],
    [-18.4, 22.9],
    [64.0, -11.5],
  ] as const) {
    const [dx, dz] = grainGradient(x, z);
    const e = 0.01;
    // Step ALONG the reported gradient and the field must rise.
    const mag = Math.hypot(dx, dz);
    if (mag < 1e-6) continue;
    const up = grainField(x + (dx / mag) * e, z + (dz / mag) * e);
    const down = grainField(x - (dx / mag) * e, z - (dz / mag) * e);
    assert.ok(up > down, `field falls along its own gradient at (${x}, ${z})`);
  }
});

test('the colour half produces a colour that is NOT the base token', () => {
  // The mirror of the closure test below, in the pure half: if the mix is a no-op then the
  // "off-palette by construction" claim is false and the whole fork this increment reports
  // would be wrong.
  let differing = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const c = grainColourAt(HEALTHY, i * 1.9, i * 0.7);
    if (toHex(c) !== HEALTHY) differing++;
  }
  assert.ok(
    differing > trials * 0.9,
    `only ${differing}/${trials} points moved off the base token at mix ${GRAIN_COLOUR_MIX}`,
  );
});

test('the GLSL carries the authored constants rather than a private copy', () => {
  // The `bandGlsl` argument, restated where it is executed: a shader and a test holding
  // private copies of the same numbers prove nothing about each other.
  const src = grainGlsl();
  assert.match(src, new RegExp((1 / GRAIN_LATTICE).toFixed(6).replace('.', '\\.')));
  assert.match(src, new RegExp(GRAIN_RAMP[0].toFixed(6).replace('.', '\\.')));
  assert.match(src, new RegExp(GRAIN_RAMP[1].toFixed(6).replace('.', '\\.')));
  // The octaves are unrolled at generation time, so the count is visible in the source.
  const octaveCalls = [...src.matchAll(/st_grainOctave\(p \*/g)];
  assert.equal(octaveCalls.length, GRAIN_OCTAVES, 'unrolled octave count disagrees with GRAIN_OCTAVES');
  // The second octave's amplitude IS the roughness, so a retune cannot leave the shader behind.
  assert.match(src, new RegExp(GRAIN_ROUGHNESS.toFixed(6).replace('.', '\\.')));
  // GLSL ES 1.0 has no dynamic loop bounds and no integer bit ops — neither may appear.
  assert.doesNotMatch(src, /for\s*\(/, 'a loop in the grain GLSL will not compile on GLSL ES 1.0');
  assert.doesNotMatch(src, /[^<>]>>[^>]|<<|\^|&(?!&)/, 'bit operators are not available on GLSL ES 1.0');
});

// ---------------------------------------------------------------- the closure

test('grainKeepsPaletteClosed is not vacuous', () => {
  // A check that cannot fail certifies nothing. Both directions, on hand-written sources, so
  // the discriminating power is established before it is pointed at the real shader.
  assert.equal(
    grainKeepsPaletteClosed('void main() { vec3 c = uRamp[0]; gl_FragColor = vec4(c, 1.0); }'),
    true,
  );
  assert.equal(
    grainKeepsPaletteClosed(
      'void main() { vec3 c = uRamp[0]; c = mix(c, vec3(1.0), 0.1); gl_FragColor = vec4(c, 1.0); }',
    ),
    false,
    'a mix into the written colour must be reported as OPEN',
  );
  assert.equal(
    grainKeepsPaletteClosed('void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'),
    false,
    'a literal colour is not a ramp entry',
  );
  assert.equal(grainKeepsPaletteClosed('nothing that assigns gl_FragColor at all'), false);
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
