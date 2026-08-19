// hardware-floor.test.ts — the part of the D2 measurement that can be proved without a GPU.
//
// The timing itself cannot be asserted here and deliberately is not: a frame time is a
// property of the machine running it, and a threshold baked into a unit test would either
// pass everywhere (useless) or fail on whichever box is slowest that week (noise). What CAN
// be proved without a browser is that the thing being timed is the scene the experiment
// claims — the right plant count, the arc's signed camera, and a seeded layout that does not
// move between runs. A benchmark whose scene varies between rungs measures its own noise.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { buildLand } from './hardware-floor.js';

/** Every mesh in the scene except the ground plane. */
function plantMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  // The ground is the one PlaneGeometry; everything else is a grown plant.
  return out.filter((m) => m.geometry.type !== 'PlaneGeometry');
}

test('the requested plant count is what actually reaches the scene', () => {
  for (const n of [0, 1, 50, 171]) {
    const { scene } = buildLand(n);
    assert.equal(
      plantMeshes(scene).length,
      n,
      `asked for ${n} plants — a sweep whose rungs do not carry the counts they are labelled ` +
        'with produces a curve of something else entirely',
    );
  }
});

test('the ground plane is always present, so no rung measures plants floating in a void', () => {
  const { scene } = buildLand(0);
  const planes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.type === 'PlaneGeometry') planes.push(m);
  });
  assert.equal(planes.length, 1);
});

test('the layout is DETERMINISTIC — ADR-0380 D6 fence 2', () => {
  // Two builds of the same rung must agree position-for-position. If they did not, the
  // difference between two rungs would contain a reshuffle as well as a count.
  const a = plantMeshes(buildLand(40).scene).map((m) => m.position.toArray().join(','));
  const b = plantMeshes(buildLand(40).scene).map((m) => m.position.toArray().join(','));
  assert.deepEqual(a, b);
});

test('NON-VACUITY: different rungs really do lay out different scenes', () => {
  // Without this, a determinism check would still pass if `buildLand` ignored its argument
  // and returned one frozen scene — the failure mode that makes the sweep flat.
  const a = plantMeshes(buildLand(40).scene).length;
  const b = plantMeshes(buildLand(120).scene).length;
  assert.notEqual(a, b);
});

test('the camera is orthographic at the arc\'s signed 50 degrees — D6 fence 4', () => {
  const { camera } = buildLand(10);
  assert.ok(camera.isOrthographicCamera, 'D6 fence 4: the projection does not move');

  // Recover the elevation from the camera's own position rather than from the constant, so
  // this fails if the placement stops matching the declared angle.
  const { x, y, z } = camera.position;
  const horizontal = Math.hypot(x, z);
  const elevationDeg = (Math.atan2(y, horizontal) * 180) / Math.PI;
  assert.ok(
    Math.abs(elevationDeg - 50) < 0.001,
    `camera elevation is ${elevationDeg.toFixed(3)} degrees, not the arc's signed 50`,
  );
});

test('no Math.random reaches the layout — the seeded generator is the only source', async () => {
  const raw = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('./hardware-floor.ts', import.meta.url), 'utf8'),
  );
  // COMMENTS ARE STRIPPED FIRST, and that is not tidiness. The module's own header states in
  // prose that it uses no `Math.random`, so a check reading raw source matches the promise
  // rather than the code and fails on a module that is entirely correct — which is exactly
  // what happened when this test was first written. Same class as the self-referential grep
  // that matched its own committed report (PR #1412).
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/Math\.random/.test(code),
    'Math.random in the benchmark scene would make every rung a different land',
  );
  // NON-VACUITY: the stripper must not have eaten the code along with the comments.
  assert.ok(/mulberry32/.test(code), 'comment stripping removed the code too — check vacuous');
});
