// projection-probe.test.ts — the fence instrument, held to the standard a fence instrument has to
// meet: it must be able to REFUSE, and it must not be satisfiable by the thing it is checking.
//
// ⚠ THE MATRICES COME FROM three.js ITSELF, never from a transcription of what a projection
// matrix looks like. That is the same discipline `shipped-baseline.test.ts` uses for triangle
// counts, and it is the difference between checking the classifier and checking my own reading of
// the OpenGL spec. If three ever changed its convention, these tests go red — which is correct,
// because the shipped canvas would be uploading something else too.

import assert from 'node:assert/strict';
import test from 'node:test';
import { OrthographicCamera, PerspectiveCamera } from 'three';

import {
  classifyProjection,
  deliveredScale,
  perspectiveSpreadPct,
  pxPerUnitFrom,
  viewDepthOf,
  type Footprint,
} from './projection-probe.js';

/** The shipped canvas's own framing, at the reference island's measured extent. `frameWorld`
 *  backs the eye off `spread * 2.6` up and along +z — a 45° elevation — and looks at the
 *  centroid. Both cameras below sit exactly there, so the ONLY difference between them is the
 *  projection, which is the whole comparison. */
const SPREAD = 111;
const BACK = SPREAD * 2.6;
const ISLAND: Footprint = { minX: -SPREAD, maxX: SPREAD, minZ: -SPREAD, maxZ: SPREAD, cx: 0, cz: 0 };
const VIEWPORT_H = 1200;

function shippedView(): number[] {
  const cam = new PerspectiveCamera();
  cam.position.set(0, BACK, BACK);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return [...cam.matrixWorldInverse.elements];
}

/** The camera that SHIPPED until 2026-08-28: `fov: 45` under R3F's default, i.e. perspective. */
function retiredPerspective(): number[] {
  const cam = new PerspectiveCamera(45, 1900 / VIEWPORT_H, 1, 4000);
  cam.updateProjectionMatrix();
  return [...cam.projectionMatrix.elements];
}

/** The camera that ships now: R3F's default orthographic frustum in CSS pixels, scaled by zoom. */
function shippedOrthographic(zoom = 3.5): number[] {
  const cam = new OrthographicCamera(-1900 / 2, 1900 / 2, VIEWPORT_H / 2, -VIEWPORT_H / 2, 1, 4000);
  cam.zoom = zoom;
  cam.updateProjectionMatrix();
  return [...cam.projectionMatrix.elements];
}

test('classifyProjection names three\'s own perspective matrix', () => {
  assert.equal(classifyProjection(retiredPerspective()), 'perspective');
});

test('classifyProjection names three\'s own orthographic matrix', () => {
  assert.equal(classifyProjection(shippedOrthographic()), 'orthographic');
});

// ⚠ NON-VACUITY. A classifier that answered 'orthographic' unconditionally would pass the test
// above, and this fence exists precisely to catch a canvas that went on being perspective.
test('the two matrices classify DIFFERENTLY — the classifier is not a constant', () => {
  assert.notEqual(classifyProjection(retiredPerspective()), classifyProjection(shippedOrthographic()));
});

test('a matrix that is neither is INDETERMINATE, never folded into one of the two', () => {
  const zeroes = new Array<number>(16).fill(0);
  assert.equal(classifyProjection(zeroes), 'indeterminate');
  const wrongLength = [1, 0, 0, 1];
  assert.equal(classifyProjection(wrongLength), 'indeterminate');
  const nan = [...shippedOrthographic()];
  nan[5] = Number.NaN;
  assert.equal(classifyProjection(nan), 'indeterminate');
});

test('viewDepthOf agrees with three about how far the island corners are', () => {
  const view = shippedView();
  const eyeToCentre = Math.hypot(BACK, BACK);
  // The eye looks at the origin from (0, BACK, BACK), so the centroid sits exactly that far down
  // the view axis.
  assert.ok(Math.abs(viewDepthOf(view, 0, 0, 0) - eyeToCentre) < 1e-3);
  // The +z corner is NEARER the eye than the −z one — which is the asymmetry the whole fence is
  // about. If this ever came back equal, the near/far pair below would be measuring nothing.
  assert.ok(viewDepthOf(view, 0, 0, ISLAND.maxZ) < viewDepthOf(view, 0, 0, ISLAND.minZ));
});

test('THE FENCE: the retired perspective camera delivers a SPREAD across the island', () => {
  const s = deliveredScale(retiredPerspective(), shippedView(), ISLAND, VIEWPORT_H);
  assert.equal(s.kind, 'perspective');
  const pct = perspectiveSpreadPct(s);
  // Not pinned to a figure: the panel geometry here is not the harness's. What is asserted is that
  // it is REAL and points the right way — the near edge gets MORE pixels per world unit.
  assert.ok(pct > 1, `expected a real perspective spread, got ${pct.toFixed(3)}%`);
  assert.ok(s.near > s.far);
});

test('THE FENCE: the orthographic camera delivers ONE scale — measured, not assumed', () => {
  const s = deliveredScale(shippedOrthographic(), shippedView(), ISLAND, VIEWPORT_H);
  assert.equal(s.kind, 'orthographic');
  assert.equal(s.near, s.far);
  assert.equal(s.target, s.near);
  assert.equal(perspectiveSpreadPct(s), 0);
  // …and the one scale is the zoom itself, in device px per world unit: R3F's frustum is sized in
  // CSS pixels, so `zoom` IS the delivered scale. This is what makes `orthographicZoomFor` in the
  // shipped file checkable at all.
  assert.ok(Math.abs(s.target - 3.5) < 1e-4, `delivered ${s.target}`);
});

// ⚠ THE MUTATION THAT MATTERS. If `pxPerUnitFrom` silently ignored the depth argument, the
// orthographic test above would still pass and so would every number in the report — the
// instrument would certify a perspective canvas as compliant. So the depth term is asserted to
// BITE on the perspective branch.
test('depth is honoured on the perspective branch — the ignore-it mutation is caught', () => {
  const p = retiredPerspective();
  assert.notEqual(pxPerUnitFrom(p, VIEWPORT_H, 300), pxPerUnitFrom(p, VIEWPORT_H, 600));
  assert.ok(Number.isNaN(pxPerUnitFrom(p, VIEWPORT_H, 0)));
});

// ⚠ THE REGRESSION THIS PINS actually happened, on the run that was meant to demonstrate the
// fence going red: a perspective matrix was read off the wire perfectly (m[11] = −1, m[15] = 0,
// m[5] = 2.4142), classified correctly, and then thrown away because no view matrix stood beside
// it — so the refusal announced "the page captured no matrix at all" about a page that had.
// A classification and a spread are different claims and fail independently.
test('a PERSPECTIVE matrix with no view matrix stays PERSPECTIVE — only the spread is lost', () => {
  const s = deliveredScale(retiredPerspective(), null, ISLAND, VIEWPORT_H);
  assert.equal(s.kind, 'perspective');
  assert.ok(Number.isNaN(s.target));
  assert.ok(Number.isNaN(perspectiveSpreadPct(s)));
});

// …while an ORTHOGRAPHIC matrix needs no view matrix at all, which is the property being
// established rather than a convenience: `clip.w` is constant, so there is no depth to know.
test('an ORTHOGRAPHIC matrix delivers its one scale with NO view matrix', () => {
  const s = deliveredScale(shippedOrthographic(2.25), null, ISLAND, VIEWPORT_H);
  assert.equal(s.kind, 'orthographic');
  assert.equal(s.near, s.far);
  assert.ok(Math.abs(s.target - 2.25) < 1e-4);
});

test('no matrices means INDETERMINATE and NaN, never a plausible number', () => {
  const s = deliveredScale(null, shippedView(), ISLAND, VIEWPORT_H);
  // ⚠ `indeterminate` is reserved for "the MATRIX could not be classified", never used as a
  // stand-in for "a downstream number was unavailable" — see the perspective case above.
  assert.equal(s.kind, 'indeterminate');
  assert.ok(Number.isNaN(s.target));
  assert.ok(Number.isNaN(perspectiveSpreadPct(s)));
});
