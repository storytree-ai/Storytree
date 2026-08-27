// frame-cost-scene.test.ts — are the A/B arms actually different scenes, and is the scene
// actually fragment-bound?
//
// ⚠⚠ WHY THIS IS NOT A FORMALITY. An A/B whose two arms compile the SAME shader always reports
// "no measurable difference", and it does so with the calm authority of a real measurement —
// indistinguishable from a genuine sub-noise cost. That is the worst failure available to a
// cost instrument, because the honest-looking UNRESOLVED verdict it produces is exactly what a
// real sub-noise result also looks like. `hardware-floor-grain.test.ts` set this precedent for
// the older A/B after a run reported the grain as free; this is the same guard on the new one.
//
// The second claim proved here is the one that made a new instrument necessary at all: the
// scene must be FRAGMENT-bound, not draw-call bound. One draw call, two triangles, ground
// filling the frame. The old floor draws one call per plant and quadrupling its fragments moved
// its number 0%.
//
// No GL context is needed for any of it: `createBandedMaterial` builds its source at
// construction time, and the frustum arithmetic is arithmetic.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ELEVATION_DEG,
  GRAIN_VARIANTS,
  REDUCTION_VARIANTS,
  SIN_CALLS_PER_FRAGMENT,
  buildGroundScene,
  reduceGradient,
  variantMaterial,
  type FrameCostSpec,
  type FrameCostVariant,
} from './frame-cost-scene.js';

const spec = (variant: FrameCostVariant, pxPerUnit = 2): FrameCostSpec => ({
  variant,
  pxPerUnit,
  width: 2880,
  height: 1920,
  batch: 30,
});

// ---------------------------------------------------------------- the arms differ

test('the control compiles the shader the land has always compiled', () => {
  const m = variantMaterial('none');
  assert.doesNotMatch(m.fragmentShader, /st_grain/);
  assert.doesNotMatch(m.fragmentShader, /uGrain/);
});

test('EVERY grained arm compiles a source DIFFERENT from the control', () => {
  // The assertion an UNRESOLVED verdict rests on. Without it, "no measurable difference" could
  // mean the arms were the same scene.
  const control = variantMaterial('none').fragmentShader;
  for (const v of [...GRAIN_VARIANTS, ...REDUCTION_VARIANTS]) {
    if (v === 'none') continue;
    const armSource = variantMaterial(v).fragmentShader;
    assert.match(armSource, /st_grainField/, `${v} carries no grain field at all`);
    assert.notEqual(armSource, control, `${v} compiled the SAME source as the control`);
  }
});

test('every arm compiles a source different from EVERY OTHER arm', () => {
  // Pairwise, not just against the control: two arms that collapsed onto each other would
  // report identical costs and read as a reproducible measurement.
  const all = [...GRAIN_VARIANTS, ...REDUCTION_VARIANTS];
  const seen = new Map<string, FrameCostVariant>();
  for (const v of all) {
    const src = variantMaterial(v).fragmentShader;
    const clash = seen.get(src);
    assert.equal(clash, undefined, `${v} and ${String(clash)} compile byte-identical sources`);
    seen.set(src, v);
  }
  assert.equal(seen.size, all.length);
});

test('each variant calls the half it names, and only that half', () => {
  // Mislabelling a half would attribute the wrong fragment work to the wrong mechanism: the
  // arithmetic is 32 sin calls for the normal half's central-difference gradient against 8
  // for the colour half.
  const normal = variantMaterial('normal').fragmentShader;
  assert.match(normal, /st_grainGradient\(vWorld/);
  assert.doesNotMatch(normal, /st_grainRamped\(vWorld/);

  const colour = variantMaterial('colour').fragmentShader;
  assert.match(colour, /st_grainRamped\(vWorld/);
  assert.doesNotMatch(colour, /st_grainGradient\(vWorld/);

  const both = variantMaterial('both').fragmentShader;
  assert.match(both, /st_grainGradient\(vWorld/);
  assert.match(both, /st_grainRamped\(vWorld/);
});

// ---------------------------------------------------------------- the reductions

test('the forward difference drops one field evaluation and keeps the authored step', () => {
  const full = variantMaterial('normal').fragmentShader;
  const fwd = variantMaterial('normal-forward').fragmentShader;
  const evaluations = (s: string): number => {
    const fn = /vec2 st_grainGradient\(vec2 p\) \{[\s\S]*?\n\}/.exec(s.replace(/^\s+/gm, ''));
    assert.ok(fn, 'no gradient function found');
    return [...fn[0].matchAll(/st_grainField\(/g)].length;
  };
  assert.equal(evaluations(full), 4, 'the authored gradient is a four-sample central difference');
  assert.equal(evaluations(fwd), 3, 'the forward difference should take three samples');
  // -25% of the normal half's sin calls, which is what the arithmetic in the report claims.
  assert.equal(
    SIN_CALLS_PER_FRAGMENT['normal-forward'] / SIN_CALLS_PER_FRAGMENT.normal,
    0.75,
  );
  // The step is LIFTED from the generated source, so a retune of GRAIN_GRAD_STEP cannot leave
  // the reduction measuring against a stale one.
  const step = (s: string): string => /float e = ([0-9.]+);/.exec(s)![1]!;
  assert.equal(step(fwd), step(full));
});

test('the derivative variant takes ONE field evaluation and uses screen-space derivatives', () => {
  const dfd = variantMaterial('normal-dfd').fragmentShader;
  assert.match(dfd, /dFdx\(/);
  assert.match(dfd, /dFdy\(/);
  const fn = /vec2 st_grainGradient\(vec2 p\) \{[\s\S]*?\n\}/.exec(dfd.replace(/^\s+/gm, ''))!;
  assert.equal([...fn[0].matchAll(/st_grainField\(/g)].length, 1);
  assert.equal(SIN_CALLS_PER_FRAGMENT['normal-dfd'], 8);
});

test('the substitution REFUSES rather than silently no-opping', () => {
  // A reduction arm that quietly kept the full gradient is the "arms are secretly the same
  // scene" failure wearing a different hat, so the surgery fails loudly when its target moves.
  assert.throws(
    () => reduceGradient('void main() { gl_FragColor = vec4(1.0); }', 'forward'),
    /carries no st_grainGradient/,
  );
});

test('the reductions only touch the gradient — the rest of the shader is untouched', () => {
  const full = variantMaterial('normal').fragmentShader;
  const fwd = variantMaterial('normal-forward').fragmentShader;
  const strip = (s: string): string => s.replace(/vec2 st_grainGradient\(vec2 p\) \{[\s\S]*?\n\s*\}/, '');
  assert.equal(strip(fwd), strip(full));
});

// ---------------------------------------------------------------- the scene is fragment-bound

test('the scene submits exactly ONE draw call worth of geometry', () => {
  // The whole reason this instrument exists. The old floor scene draws 172 calls at the
  // island's plant count and is measured draw-call bound.
  const { scene } = buildGroundScene(spec('both'));
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  assert.equal(meshes.length, 1, 'more than one mesh means more than one draw call');
  const index = meshes[0]!.geometry.getIndex();
  assert.ok(index, 'the ground quad should be indexed');
  assert.equal(index.count / 3, 2, 'a quad is two triangles');
});

test('the ground plane covers the whole frustum at both zooms', () => {
  // A ground covering 60% of the frame would report 60% of the cost with nothing in the report
  // able to tell. The runtime `measureCoverage` check is the real proof; this is the geometry
  // that has to be right for it to pass.
  const elev = (ELEVATION_DEG * Math.PI) / 180;
  for (const pxPerUnit of [2, 8]) {
    const s = spec('none', pxPerUnit);
    const { scene, camera } = buildGroundScene(s);
    const mesh = scene.children[0] as THREE.Mesh;
    const params = (mesh.geometry as THREE.PlaneGeometry).parameters;
    const frustumW = camera.right - camera.left;
    const frustumH = camera.top - camera.bottom;
    assert.equal(frustumW, s.width / pxPerUnit, 'the frustum width should be width/pxPerUnit');
    assert.equal(frustumH, s.height / pxPerUnit);
    assert.ok(params.width >= frustumW, `plane too narrow at ${pxPerUnit} px/unit`);
    // World Z is foreshortened by sin(elevation) on screen, so the plane needs that much more
    // depth than the frustum's world height.
    assert.ok(
      params.height * Math.sin(elev) >= frustumH,
      `plane too shallow at ${pxPerUnit} px/unit — the frame would not fill`,
    );
  }
});

test('the two zooms differ ONLY in how much world is under the same fragments', () => {
  // Stated because it is easy to misread: the grain is sampled in world coordinates, so at a
  // fixed buffer size both zooms shade the same number of fragments. Any cost difference
  // between them is a property of the FIELD, not of the fragment count.
  const two = buildGroundScene(spec('both', 2));
  const eight = buildGroundScene(spec('both', 8));
  assert.equal(two.material.fragmentShader, eight.material.fragmentShader);
  assert.equal(
    (eight.camera.right - eight.camera.left) * 4,
    two.camera.right - two.camera.left,
    '8 px/unit should put a quarter of the world under the same frame',
  );
});

test('the arms carry identical geometry and identical palette length', () => {
  const control = buildGroundScene(spec('none'));
  const grained = buildGroundScene(spec('both'));
  const count = (s: THREE.Scene): number => {
    let n = 0;
    s.traverse(() => n++);
    return n;
  };
  assert.equal(count(control.scene), count(grained.scene));
  assert.equal(
    (control.material.uniforms['uRamp']!.value as unknown[]).length,
    (grained.material.uniforms['uRamp']!.value as unknown[]).length,
    'a different ramp length is a palette change, not a shader A/B',
  );
});

test('the projection does not move between arms', () => {
  // ADR-0380 D6 fence 4. If the camera moved, the arms would differ in more than the shader.
  const a = buildGroundScene(spec('none'));
  const b = buildGroundScene(spec('normal'));
  assert.deepEqual(a.camera.position.toArray(), b.camera.position.toArray());
  assert.deepEqual(
    a.camera.projectionMatrix.toArray(),
    b.camera.projectionMatrix.toArray(),
  );
});
