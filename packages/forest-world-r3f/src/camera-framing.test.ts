// camera-framing.test.ts — the shipped map's framing, provable for the first time.
//
// ⚠ WHY IT COULD NOT BE TESTED BEFORE, and why that mattered. `frameWorld` lived inside
// `ForestWorldCanvas.tsx` next to the JSX, so no test could reach it without pulling React, three
// and drei into a headless runner. What filled the gap instead was a TRANSCRIPTION in the harness's
// evidence page — which is how the shipped map's delivered scale came to be reported off a copy of
// its camera rather than off its camera.
//
// The framing is asserted as a RELATION here, not against remembered numbers: what has to hold is
// that the orthographic camera frames the SAME amount of world the retired perspective one did, so
// the before/after pictures differ in projection and in nothing else.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRAME_HALF_HEIGHT_PER_BACK,
  frameWorld,
  orthographicZoomFor,
  type CameraFraming,
} from './camera-framing.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/** A point-like instance at a ground position — `frameWorld` reads only `transform`, so the family
 *  is a stand-in and nothing here depends on which one it is. It was `story-tree` until that
 *  family was retired (ADR-0508). */
function at(x: number, z: number): InstanceDescriptor {
  return { kind: 'uat-bloom', transform: { x, y: 0, z }, material: 'healthy' } as InstanceDescriptor;
}

/** A square-ish island of half-extent `spread` about the origin. */
function island(spread: number): InstanceDescriptor[] {
  return [at(-spread, -spread), at(spread, -spread), at(-spread, spread), at(spread, spread), at(0, 0)];
}

/** What the RETIRED perspective camera framed, derived from its own parameters rather than from
 *  the module under test: it sat `back` up and `back` along +z (so `back * √2` from the target)
 *  and showed `distance * tan(fov / 2)` of world at the target plane, at fov 45.
 *
 *  ⚠ THIS IS THE ONE PLACE THE OLD CAMERA IS RESTATED, and it is restated as an INDEPENDENT
 *  derivation on purpose — if the module simply exported its own constant and the test read it
 *  back, the assertion could not fail. */
function retiredPerspectiveHalfHeight(back: number): number {
  return back * Math.SQRT2 * Math.tan((45 * Math.PI) / 360);
}

test('the framed half-height is what the retired perspective camera framed', () => {
  for (const spread of [40, 111, 300, 1000]) {
    const back = Math.max(260, spread * 2.6);
    const f = frameWorld(island(spread));
    assert.ok(
      Math.abs(f.halfHeight - retiredPerspectiveHalfHeight(back)) < 1e-9,
      `spread ${spread}: framed ${f.halfHeight}, perspective framed ${retiredPerspectiveHalfHeight(back)}`,
    );
  }
});

test('the constant is the retired camera\'s, derived rather than remembered', () => {
  assert.ok(Math.abs(FRAME_HALF_HEIGHT_PER_BACK - Math.SQRT2 * Math.tan(Math.PI / 8)) < 1e-12);
  // ⚠ NON-VACUITY: a constant of 1 would make the test above assert `back === back * 1` for a
  // camera that framed something else entirely.
  assert.ok(FRAME_HALF_HEIGHT_PER_BACK > 0.5 && FRAME_HALF_HEIGHT_PER_BACK < 0.7);
});

test('the eye keeps the 45-degree view DIRECTION — only the projection changed', () => {
  const f = frameWorld(island(111));
  const [tx, , tz] = f.target;
  const [px, py, pz] = f.position;
  assert.equal(px, tx, 'the eye stays on the target\'s x');
  assert.ok(Math.abs(py - (pz - tz)) < 1e-9, 'up and along by the same amount is a 45 degree elevation');
});

test('an empty world still frames as much as it always did', () => {
  const f: CameraFraming = frameWorld([]);
  assert.ok(Math.abs(f.halfHeight - retiredPerspectiveHalfHeight(260)) < 1e-9);
  assert.deepEqual(f.target, [0, 0, 0]);
});

test('framing grows with the world, past the floor and not before it', () => {
  // ⚠ Below the floor the framing must NOT shrink — the retired camera's `max(260, …)` is what
  // keeps a one-island world from being framed so tightly it fills the canvas.
  assert.equal(frameWorld(island(10)).halfHeight, frameWorld(island(50)).halfHeight);
  assert.ok(frameWorld(island(400)).halfHeight > frameWorld(island(200)).halfHeight);
});

/* ── the zoom ────────────────────────────────────────────────────────────────────────────────
   R3F sizes a default orthographic frustum in CSS pixels and divides by `zoom`, so `zoom` IS the
   delivered CSS-px per world unit. That identity is what `harness/projection-probe.ts` measures
   off the uploaded matrix, so it is worth asserting on both sides. */

test('the zoom IS the delivered px per world unit', () => {
  // 400 px of viewport showing 100 units of world above and below the target: 400 / 200 = 2.
  assert.equal(orthographicZoomFor(100, 400), 2);
  assert.equal(orthographicZoomFor(50, 400), 4);
});

test('a bigger canvas delivers more px per unit — which is what makes the panels a ZOOM', () => {
  const f = frameWorld(island(111));
  const small = orthographicZoomFor(f.halfHeight, 420);
  const big = orthographicZoomFor(f.halfHeight, 840);
  assert.ok(Math.abs(big / small - 2) < 1e-9, 'twice the short side, twice the delivered scale');
});

test('degenerate inputs do not divide by zero', () => {
  assert.ok(Number.isFinite(orthographicZoomFor(0, 400)));
  assert.ok(Number.isFinite(orthographicZoomFor(100, 0)));
  assert.ok(orthographicZoomFor(100, 0) > 0);
});

/* ── ⚠⚠ THE ASYMMETRIC CASES — added because the symmetric ones proved nothing ────────────────
   `check:mutation-diff` caught this, and the miss is worth naming rather than quietly fixing.
   Every test above frames an island centred on the ORIGIN, so `sx += x` and `sx -= x` both give a
   centroid of zero, `sx / n` and `sx * n` both give zero, deleting the summing loop gives zero,
   and `|x - cx|` and `|x + cx|` are the same number. Eight mutants survived: the centroid was
   never actually tested, only its symmetry.

   ⚠ THE EXPECTED VALUES BELOW ARE DERIVED IN THE TEST, from the definition of a centroid and a
   half-extent, never read back off the module. A fixture whose answer comes from its subject
   cannot fail. */

/** The framing these instances SHOULD get, worked out here rather than asked for. */
function expectedFraming(pts: readonly [number, number][]) {
  const cx = pts.reduce((s, [x]) => s + x, 0) / pts.length;
  const cz = pts.reduce((s, [, z]) => s + z, 0) / pts.length;
  const spread = Math.max(...pts.map(([x, z]) => Math.max(Math.abs(x - cx), Math.abs(z - cz))));
  const back = Math.max(260, spread * 2.6);
  return { cx, cz, spread, back, halfHeight: back * (Math.SQRT2 * Math.tan(Math.PI / 8)) };
}

test('the target IS the centroid — not the origin, and not a multiple of it', () => {
  const pts: [number, number][] = [
    [0, 0],
    [10, 20],
    [400, 30],
  ];
  const want = expectedFraming(pts);
  // ⚠ NON-VACUITY: a centroid at the origin is what made the symmetric tests blind.
  assert.ok(want.cx !== 0 && want.cz !== 0, 'the fixture must be off-centre or it tests nothing');
  const f = frameWorld(pts.map(([x, z]) => at(x, z)));
  assert.ok(Math.abs(f.target[0] - want.cx) < 1e-9, `target x ${f.target[0]} vs centroid ${want.cx}`);
  assert.ok(Math.abs(f.target[2] - want.cz) < 1e-9, `target z ${f.target[2]} vs centroid ${want.cz}`);
  assert.equal(f.target[1], 0, 'the target sits on the ground plane');
});

test('spread is measured from the CENTROID, on the x axis', () => {
  // x dominates here, so a `|x + cx|` mutation changes the answer and a `|z + cz|` one cannot.
  const pts: [number, number][] = [
    [0, 0],
    [10, 20],
    [400, 30],
  ];
  const want = expectedFraming(pts);
  assert.ok(want.spread > 100, 'the fixture must clear the 260-unit floor or the framing is pinned');
  assert.ok(
    Math.abs(frameWorld(pts.map(([x, z]) => at(x, z))).halfHeight - want.halfHeight) < 1e-9,
  );
});

test('spread is measured from the CENTROID, on the z axis', () => {
  // The mirror image: z dominates, so this is the case the x-dominant fixture is blind to.
  const pts: [number, number][] = [
    [0, 0],
    [20, 10],
    [30, 400],
  ];
  const want = expectedFraming(pts);
  assert.ok(want.spread > 100);
  assert.ok(
    Math.abs(frameWorld(pts.map(([x, z]) => at(x, z))).halfHeight - want.halfHeight) < 1e-9,
  );
});

test('the empty world\'s CAMERA POSITION is pinned too, not just its target', () => {
  // ⚠ `position` was the one field the empty-world test never looked at, so replacing the whole
  // triple with `[]` went unnoticed — and an empty position is a camera at the origin looking at
  // itself.
  assert.deepEqual(frameWorld([]).position, [0, 260, 260]);
});
