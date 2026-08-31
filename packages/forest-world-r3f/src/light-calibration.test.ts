// light-calibration.test.ts — THE PROBE'S ARITHMETIC, AND THE PREMISE OF ITS REFUSAL.
//
// THE TEST THIS FILE IS REALLY FOR is `the one-shot solve is EXACT through a linear transfer and
// MISSES through ACES`. Everything else supports it. `calibrateLights` returns `target / probe` and
// applies it once; that is a correct solve only where the delivered value is linear in intensity,
// and `assertExactColourForCalibration` is the fence that says so. A fence whose premise lives only
// in a comment is a fence a later session removes — so the premise is HELD HERE, with a reference
// implementation of the transform the fence exists to keep the calibration away from.
//
// ⚠ THE ACES REFERENCE BELOW IS A TEST FIXTURE AND NOT A SECOND IMPLEMENTATION OF ANYTHING. It is
// transcribed from three's own `tonemapping_pars_fragment.glsl.js` so this file can state what a
// tone-mapped canvas does to the probe. Nothing in `src/` reads it, and nothing should: the product
// does not tone-map, which is the whole point.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { configureExactColour } from './exact-colour.js';
import {
  PROBE_SIZE,
  buildProbeRig,
  calibrateLights,
  calibrationFrom,
  intensitiesFor,
  probeTexel,
  probeValueOf,
  type ProbeRig,
} from './light-calibration.js';
import { LEGACY_SHADE_LEVELS, SHADE_LEVELS } from './shade-ladder.js';

// ─────────────────────────────────────────────────────────────── the two transfer functions

/**
 * What a white, fully-rough, fully-lit standard face radiates at these intensities, in LINEAR
 * units — three's own model: direct diffuse `dotNL * intensity / PI`, indirect `ambient / PI`.
 *
 * ⚠ THE SPECULAR TERM IS ABSENT HERE ON PURPOSE. This models the transfer's SHAPE — is the
 * delivered value proportional to intensity? — which is the only question the refusal turns on. The
 * real specular term is exactly what the live probe is for, and modelling it would make this file
 * a second renderer.
 */
function litWhite(ambient: number, directional: number): number {
  return (ambient + directional) / Math.PI;
}

/** three's `ACESFilmicToneMapping`, transcribed from its shader chunk (exposure 1). */
function acesFilmic(x: number): number {
  // Columns, exactly as three's `mat3` constructor takes them.
  const IN: readonly (readonly number[])[] = [
    [0.59719, 0.076, 0.0284],
    [0.35458, 0.90834, 0.13383],
    [0.04823, 0.01566, 0.83777],
  ];
  const OUT: readonly (readonly number[])[] = [
    [1.60475, -0.10208, -0.00327],
    [-0.53108, 1.10813, -0.07276],
    [-0.07367, -0.00605, 1.07602],
  ];
  const mul = (m: readonly (readonly number[])[], v: readonly number[]): number[] =>
    [0, 1, 2].map((r) => m[0]![r]! * v[0]! + m[1]![r]! * v[1]! + m[2]![r]! * v[2]!);
  const scaled = [x / 0.6, x / 0.6, x / 0.6];
  const fit = mul(IN, scaled).map((v) => {
    const a = v * (v + 0.0245786) - 0.000090537;
    const b = v * (0.983729 * v + 0.432951) + 0.238081;
    return a / b;
  });
  return Math.min(1, Math.max(0, mul(OUT, fit)[0]!));
}

/** The sRGB output encode a colour-managed canvas applies on the way to the framebuffer. */
function srgbEncode(x: number): number {
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** Exact-colour mode: the shader's value reaches the framebuffer untouched. */
const deliverExact = (linear: number): number => linear;
/** @react-three/fiber's default canvas: a filmic curve, then an sRGB encode. */
const deliverAces = (linear: number): number => srgbEncode(acesFilmic(linear));

/** Run the whole calibration loop against a modelled transfer, and report what it lands on. */
function calibrateThrough(
  deliver: (linear: number) => number,
  levels: readonly number[] = SHADE_LEVELS,
): { probe: number; scale: number; delivered: number; target: number } {
  const floor = levels[0]!;
  const target = levels[levels.length - 1]!;
  const probe = deliver(litWhite(floor, target - floor));
  const { scale } = calibrationFrom(probe, levels);
  const lit = intensitiesFor({ probe, scale, target, floor });
  return { probe, scale, delivered: deliver(litWhite(lit.ambient, lit.directional)), target };
}

// ─────────────────────────────────────────────────────────────── the premise of the refusal

test('through a LINEAR transfer the one-shot solve lands exactly on the ladder top', () => {
  const run = calibrateThrough(deliverExact);
  assert.ok(Math.abs(run.delivered - run.target) < 1e-12, `delivered ${run.delivered}`);
  // And the scale it derives is pi, which is the reciprocal-pi in three's own Lambert BRDF
  // arriving back out. Pinned because it is the number a reader will want to sanity-check the
  // live probe against — the live one differs from it only by the specular term.
  assert.ok(Math.abs(run.scale - Math.PI) < 1e-9, `scale ${run.scale}`);
});

test('through ACES + an sRGB encode the SAME solve misses, and iterating does not rescue it', () => {
  const run = calibrateThrough(deliverAces);
  // ⚠ THIS IS THE FENCE'S WHOLE JUSTIFICATION. The calibration reports success and delivers ~0.76
  // of the rung it aimed at — a 24% miss wearing a measurement's clothes.
  assert.ok(run.delivered < run.target * 0.8, `delivered ${run.delivered} of ${run.target}`);
  assert.ok(run.delivered > run.target * 0.7, `delivered ${run.delivered} of ${run.target}`);
  // ⚠ AND IT IS NOT A CONVERGENCE PROBLEM. The curve asymptotes: a hundredfold scale still does
  // not reach the rung, so no number of iterations of `target / probe` gets there.
  const floor = SHADE_LEVELS[0]!;
  const target = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;
  const at = (s: number): number => deliverAces(litWhite(floor * s, (target - floor) * s));
  assert.ok(at(100) < target, `even a 100x scale delivers ${at(100)}`);
  // NON-VACUITY: the two transfers really are different functions, so the test above is not
  // comparing a thing with itself.
  assert.notEqual(deliverAces(0.3), deliverExact(0.3));
});

// ─────────────────────────────────────────────────────────────── the arithmetic

test('calibrationFrom reads the ladder ends, and scales onto the top rung', () => {
  const cal = calibrationFrom(0.25);
  assert.equal(cal.probe, 0.25);
  assert.equal(cal.floor, SHADE_LEVELS[0]);
  assert.equal(cal.target, SHADE_LEVELS[SHADE_LEVELS.length - 1]);
  assert.equal(cal.scale, cal.target / 0.25);
  // ⚠ THE ENDS ARE THE FIRST AND LAST RUNG, NOT `0.8` AND `1.0`. A frozen arm hands the ladder it
  // was measured on; the nine-rung adoption moved the floor from 0.78 and would silently move any
  // literal written here.
  const legacy = calibrationFrom(0.25, LEGACY_SHADE_LEVELS);
  assert.equal(legacy.floor, LEGACY_SHADE_LEVELS[0]);
  assert.equal(legacy.target, LEGACY_SHADE_LEVELS[LEGACY_SHADE_LEVELS.length - 1]);
  assert.notEqual(legacy.floor, cal.floor);
});

test('a probe that saw nothing is REFUSED, not quietly treated as an identity', () => {
  // ⚠ EACH OF THESE IS A DIFFERENT WAY FOR A LIVE PROBE TO FAIL, and none of them may return. A
  // calibration that came back `scale: 1` on a black readback would ship a map 3.14x too dark
  // while reporting success — indistinguishable, from the outside, from a correction that happened
  // to be 1.
  for (const bad of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calibrationFrom(bad), /cannot see its own control/, `probe ${bad}`);
  }
  // The smallest readable byte is fine — 1/255 is a measurement, not a failure.
  assert.ok(calibrationFrom(1 / 255).scale > 0);
});

test('a ladder with no rungs cannot say what "lit" means', () => {
  assert.throws(() => calibrationFrom(0.25, []), /no rungs/);
});

test('intensitiesFor splits the ladder across the two lights, and scale multiplies both', () => {
  const floor = SHADE_LEVELS[0]!;
  const target = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;
  const plain = intensitiesFor({ probe: 1, scale: 1, target, floor });
  // At scale 1 this is EXACTLY the pair the canvas hung before the crossing, which is what makes
  // "with and without the probe" a comparison of one thing.
  assert.equal(plain.ambient, floor);
  assert.equal(plain.directional, target - floor);
  // ⚠ NON-VACUITY: an unlit face lands on the FLOOR and a lit one on the TOP. A pair that summed
  // to 1.8 satisfied "the two agree" and saturated every texture put in front of it.
  assert.equal(plain.ambient + plain.directional, target);
  assert.ok(plain.ambient > 0 && plain.directional > 0);

  const scaled = intensitiesFor({ probe: 0.25, scale: 4, target, floor });
  assert.equal(scaled.ambient, floor * 4);
  assert.equal(scaled.directional, (target - floor) * 4);
  // ⚠ AND THE SCALE REACHES BOTH. A correction applied to only the key light moves the CONTRAST
  // as well as the exposure — the picture changes in two ways and the probe still reads right.
  assert.equal(scaled.ambient / plain.ambient, scaled.directional / plain.directional);
});

// ─────────────────────────────────────────────────────────────── the rig

test('the probe rig is a white fully-rough face lit straight down its own normal', () => {
  const rig = buildProbeRig({ floor: 0.8, target: 1 });
  try {
    const mesh = rig.scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    assert.ok(mesh, 'the rig must contain the face it is measuring');
    const material = mesh.material;
    assert.ok(material instanceof THREE.MeshStandardMaterial, 'it must be the standard material');
    // ⚠ THE MATERIAL IS THE SUBJECT. The whole reason for a live probe is that a
    // `MeshStandardMaterial` carries a specular term the arithmetic here does not predict; a rig
    // that measured a basic material would return a number about nothing.
    assert.equal(material.roughness, 1);
    assert.equal(material.metalness, 0);
    assert.equal(material.color.getHex(), 0xffffff);

    const ambient = rig.scene.children.find(
      (c): c is THREE.AmbientLight => c instanceof THREE.AmbientLight,
    );
    const key = rig.scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    );
    assert.ok(ambient && key);
    assert.equal(ambient.intensity, 0.8);
    assert.equal(key.intensity, 1 - 0.8);
    // ⚠ STRAIGHT DOWN THE NORMAL, so `dot(n, L)` is 1 and the reading is about the material rather
    // than about an angle. The plane faces +z and the light sits on +z.
    assert.deepEqual(key.position.toArray(), [0, 0, 1]);
    assert.deepEqual(rig.camera.position.toArray(), [0, 0, 2]);
  } finally {
    rig.dispose();
  }
});

test('the rig disposes what it allocated', () => {
  const rig = buildProbeRig({ floor: 0.8, target: 1 });
  const mesh = rig.scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
  const disposed: string[] = [];
  const geo = THREE.BufferGeometry.prototype.dispose;
  const mat = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function disposeGeometry(this: THREE.BufferGeometry) {
    disposed.push('geometry');
    geo.call(this);
  };
  THREE.Material.prototype.dispose = function disposeMaterial(this: THREE.Material) {
    disposed.push('material');
    mat.call(this);
  };
  try {
    rig.dispose();
  } finally {
    THREE.BufferGeometry.prototype.dispose = geo;
    THREE.Material.prototype.dispose = mat;
  }
  assert.deepEqual(disposed.sort(), ['geometry', 'material']);
  assert.ok(mesh, 'the mesh the rig built is what those belonged to');
});

test('the texel read is the centre of the probe frame, and a frame with no centre is refused', () => {
  assert.deepEqual(probeTexel(8), { x: 4, y: 4 });
  assert.deepEqual(probeTexel(1), { x: 0, y: 0 });
  assert.deepEqual(probeTexel(9), { x: 4, y: 4 });
  assert.deepEqual(probeTexel(), probeTexel(PROBE_SIZE));
  // ⚠ THE CENTRE HAS TO BE INSIDE THE FRAME. `size / 2` un-floored reads texel 4 of a 9-wide
  // frame correctly and texel 4.5 of an 8-wide one, which WebGL rounds somewhere unstated.
  for (const size of [1, 2, 3, 8, 9, 64]) {
    const { x, y } = probeTexel(size);
    assert.ok(Number.isInteger(x) && x >= 0 && x < size, `x ${x} of ${size}`);
    assert.ok(Number.isInteger(y) && y >= 0 && y < size, `y ${y} of ${size}`);
  }
  for (const bad of [0, -8, 1.5, Number.NaN]) {
    assert.throws(() => probeTexel(bad), /no centre to read/, `size ${bad}`);
  }
});

test('a read-back byte becomes the [0, 1] value the arithmetic is over', () => {
  assert.equal(probeValueOf(255), 1);
  assert.equal(probeValueOf(0), 0);
  assert.equal(probeValueOf(51), 0.2);
  // ⚠ AN ABSENT BYTE READS AS ZERO AND IS THEN REFUSED BY `calibrationFrom`, which is the intended
  // route: a readback that produced nothing must not become a silent identity.
  assert.equal(probeValueOf(undefined), 0);
  assert.throws(() => calibrationFrom(probeValueOf(undefined)), /cannot see its own control/);
});

// ─────────────────────────────────────────────────────────────── the composition

/** A renderer stub. Only the fields `calibrateLights` reads before reaching its seam. */
function stubRenderer(): THREE.WebGLRenderer {
  return { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping } as
    unknown as THREE.WebGLRenderer;
}

test('calibrateLights REFUSES a renderer that is not in exact-colour mode', () => {
  const before = THREE.ColorManagement.enabled;
  try {
    THREE.ColorManagement.enabled = true;
    let read = 0;
    assert.throws(
      () =>
        calibrateLights(stubRenderer(), SHADE_LEVELS, () => {
          read += 1;
          return 0.25;
        }),
      /not in exact-colour mode/,
    );
    // ⚠ IT REFUSES BEFORE IT PROBES. A calibration that rendered first and then complained would
    // still have resized the canvas that is about to draw the map.
    assert.equal(read, 0);
  } finally {
    THREE.ColorManagement.enabled = before;
  }
});

test('calibrateLights composes the rig, the seam and the arithmetic — and disposes the rig', () => {
  const before = THREE.ColorManagement.enabled;
  const renderer = stubRenderer();
  configureExactColour(renderer);
  try {
    const seen: ProbeRig[] = [];
    const cal = calibrateLights(renderer, SHADE_LEVELS, (_gl, rig) => {
      seen.push(rig);
      return 0.32;
    });
    assert.equal(cal.probe, 0.32);
    assert.equal(cal.scale, SHADE_LEVELS[SHADE_LEVELS.length - 1]! / 0.32);
    assert.equal(seen.length, 1, 'exactly one rig is built and read');
    // The rig it handed the seam is the one built from THIS ladder's ends.
    const key = seen[0]!.scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    )!;
    assert.ok(
      Math.abs(key.intensity - (SHADE_LEVELS[SHADE_LEVELS.length - 1]! - SHADE_LEVELS[0]!)) < 1e-12,
    );
    // ⚠ AND A THROWING SEAM STILL DISPOSES. The probe runs on the canvas the map draws on; a rig
    // leaked on the error path is GPU memory held for the life of the page.
    assert.throws(
      () =>
        calibrateLights(renderer, SHADE_LEVELS, () => {
          throw new Error('the context went away');
        }),
      /the context went away/,
    );
  } finally {
    THREE.ColorManagement.enabled = before;
  }
});

test('calibrateLights carries the ladder it was given all the way through', () => {
  const before = THREE.ColorManagement.enabled;
  const renderer = stubRenderer();
  configureExactColour(renderer);
  try {
    const cal = calibrateLights(renderer, LEGACY_SHADE_LEVELS, () => 0.25);
    assert.equal(cal.floor, LEGACY_SHADE_LEVELS[0]);
    assert.equal(cal.target, LEGACY_SHADE_LEVELS[LEGACY_SHADE_LEVELS.length - 1]);
    assert.throws(() => calibrateLights(renderer, [], () => 0.25), /no rungs/);
  } finally {
    THREE.ColorManagement.enabled = before;
  }
});
