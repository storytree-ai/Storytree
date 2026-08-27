// hardware-floor-grain.test.ts — does the benchmark's ground ACTUALLY wear the grain it was
// asked for?
//
// ⚠⚠ WHY THIS TEST EXISTS, AND IT IS NOT A FORMALITY. The first interleaved run of the grain A/B
// on real hardware (Adreno X1-85, 171 plants, 2880x1920) reported the grain's cost as BELOW THE
// NOISE FLOOR — a median of 0.65-0.68 ms against an ungrained 0.69 ms, inside a 0.22 ms spread.
// That is a perfectly plausible physical result AND a perfectly plausible symptom of the `grain`
// option never reaching the material at all. The two are indistinguishable from the timings.
//
// An A/B whose two arms are secretly the same scene will always report "no measurable
// difference", and it will do so with the calm authority of a real measurement. That is the
// worst failure available to this module, because the honest-looking UNRESOLVED verdict it
// produces is exactly what a genuine sub-noise cost also looks like. So the arms are proved
// DIFFERENT here, structurally, where a timing cannot be mistaken for a proof.
//
// No GL context is needed: `createBandedMaterial` builds its source at construction time.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildLand } from './hardware-floor.js';

/** Every material in the scene, in traversal order. */
function materials(scene: THREE.Scene): THREE.ShaderMaterial[] {
  const out: THREE.ShaderMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m && !Array.isArray(m) && (m as THREE.ShaderMaterial).fragmentShader !== undefined) {
      out.push(m as THREE.ShaderMaterial);
    }
  });
  return out;
}

/** The ground is the FIRST mesh `buildLand` adds, before any plant. */
function groundMaterial(scene: THREE.Scene): THREE.ShaderMaterial {
  const m = materials(scene)[0];
  assert.ok(m, 'buildLand added no materials at all');
  return m;
}

test('an ungrained benchmark compiles the shader it always compiled', () => {
  const { scene } = buildLand(8);
  for (const m of materials(scene)) {
    assert.doesNotMatch(m.fragmentShader, /st_grain/);
    assert.doesNotMatch(m.fragmentShader, /uGrain/);
  }
});

test('a grained benchmark ACTUALLY grains the ground — the A/B arms differ', () => {
  // THE ASSERTION THE UNRESOLVED VERDICT RESTS ON. Without it, "no measurable difference" could
  // mean the two arms were the same scene.
  const plain = groundMaterial(buildLand(8).scene);
  for (const mode of ['normal', 'colour', 'both'] as const) {
    const grained = groundMaterial(buildLand(8, mode).scene);
    assert.match(grained.fragmentShader, /st_grainField/, `${mode} carries no grain field`);
    assert.notEqual(
      grained.fragmentShader,
      plain.fragmentShader,
      `${mode} compiled the SAME source as the ungrained control — the A/B measures nothing`,
    );
  }
});

test('each mode calls the half it names, and only that half', () => {
  // The two halves are separately costed, so mislabelling one would attribute the wrong
  // fragment work to the wrong mechanism — the arithmetic is 32 `sin` calls for the normal
  // half's central-difference gradient against 8 for the colour half.
  const normal = groundMaterial(buildLand(8, 'normal').scene).fragmentShader;
  assert.match(normal, /st_grainGradient\(vWorld/);
  assert.doesNotMatch(normal, /st_grainRamped\(vWorld/);

  const colour = groundMaterial(buildLand(8, 'colour').scene).fragmentShader;
  assert.match(colour, /st_grainRamped\(vWorld/);
  assert.doesNotMatch(colour, /st_grainGradient\(vWorld/);

  const both = groundMaterial(buildLand(8, 'both').scene).fragmentShader;
  assert.match(both, /st_grainGradient\(vWorld/);
  assert.match(both, /st_grainRamped\(vWorld/);
});

test('the grain reaches the GROUND ONLY — the plants are the fixed half of the A/B', () => {
  // What makes this an isolation rather than "the scene got dearer": the plants keep the
  // ungrained material, so the two arms differ in exactly one fragment shader over identical
  // geometry, draw calls and buffer size.
  const { scene } = buildLand(12, 'both');
  const all = materials(scene);
  assert.ok(all.length > 1, 'the benchmark built no plants, so there is nothing to hold fixed');
  assert.match(all[0]!.fragmentShader, /st_grainField/);
  for (const m of all.slice(1)) {
    assert.doesNotMatch(m.fragmentShader, /st_grain/, 'a plant wore the grain');
  }
});

test('the two arms carry the same GEOMETRY, so only the shader varies', () => {
  const plain = buildLand(24);
  const grained = buildLand(24, 'both');
  const count = (s: THREE.Scene): number => {
    let n = 0;
    s.traverse(() => n++);
    return n;
  };
  assert.equal(count(plain.scene), count(grained.scene));
  assert.equal(
    (materials(plain.scene)[0]!.uniforms['uRamp']!.value as unknown[]).length,
    (materials(grained.scene)[0]!.uniforms['uRamp']!.value as unknown[]).length,
    'the grained ground took a different ramp length — that is a palette change, not a shader A/B',
  );
});
