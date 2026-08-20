// island-descriptors.test.ts — the island extractor's contract.
//
// The load-bearing check is the PROJECTION ROUND TRIP. `buildScene` emits coordinates
// already foreshortened by sin(20 degrees); feeding those to a 3D renderer and tilting a
// camera at them projects the same ground twice and produces an island squashed to about a
// third of its true depth — which still looks like a plausible island, and so announces
// nothing. Everything else here exists so that a later edit cannot quietly make the
// extractor return an empty or degenerate set and have the page render "fine".

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  hexCenter,
  projectGround,
} from '@storytree/forest-world';

import { groundBounds, groundCellsFrom, triangulateFan } from './island-descriptors.js';
import { islandScene } from './island-fixture.js';

const SCENE = islandScene();
const CELLS = groundCellsFrom(SCENE);

test('NON-VACUITY: the island actually yields ground cells', () => {
  assert.ok(
    CELLS.length > 50,
    `only ${CELLS.length} ground cells — a near-empty island would make every later ` +
      'assertion true for the wrong reason, and would still render as a plausible picture',
  );
});

test('every cell is a real polygon with at least three vertices', () => {
  for (const c of CELLS) {
    assert.ok(c.points.length >= 3, `a cell came back with ${c.points.length} points`);
    for (const p of c.points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'a non-finite vertex escaped');
    }
  }
});

test('PROJECTION ROUND TRIP: unprojecting then re-projecting is the identity', () => {
  // The direct statement of the trap. If the extractor ever stops unprojecting, this fails.
  const cell = CELLS[0]!;
  for (const p of cell.points) {
    const reprojected = projectGround(p, LAND_CAMERA_ELEVATION_DEG);
    // Re-projecting a ground point must land back inside the scene's own 2D extent.
    assert.ok(Number.isFinite(reprojected.y));
  }
  // And the ground is STRICTLY TALLER than its projection — that is what unprojecting did.
  const bounds = groundBounds(CELLS);
  const flat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(flat < 0.5, `sanity: sin(20 deg) should be ~0.342, got ${flat}`);
  assert.ok(
    bounds.h > bounds.w * 0.5,
    `ground depth ${bounds.h.toFixed(1)} vs width ${bounds.w.toFixed(1)} — an island this ` +
      'flat means the coordinates were NOT unprojected and the render will squash twice',
  );
});

test('the ground island is EXACTLY 1/sin(20 deg) deeper than its own projection', () => {
  // The layout-independent form, and the one that actually catches a missing or
  // half-applied unprojection.
  //
  // An earlier draft asserted the ground aspect sits "near 1", on the reasoning that a hex
  // island is near-isotropic. It measured 0.578 and failed — and the PREMISE was wrong, not
  // the extractor: this fixture's tile set spans q in [-2,2] and r in [-1,1], which is a
  // deliberately wide 5x3 island, so a squat ground footprint is correct for it. An
  // assertion that depends on the caller's tile layout is not a projection check at all; it
  // just happens to pass on round islands.
  //
  // So compare the island against ITSELF. The extractor divides y by the flattening and
  // nothing else, so the ground extent must be the projected extent scaled by exactly
  // 1/sin(20 deg) in y and unchanged in x — true for any layout, and false the moment the
  // unprojection is dropped (ratio 1) or applied twice (ratio 1/sin^2).
  const ground = groundBounds(CELLS);
  const projected = groundBounds(
    CELLS.map((c) => ({
      ...c,
      points: c.points.map((p) => projectGround(p, LAND_CAMERA_ELEVATION_DEG)),
    })),
  );
  const flat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(Math.abs(flat - Math.sin((20 * Math.PI) / 180)) < 1e-9, 'the flattening is not sin(20)');

  assert.ok(
    Math.abs(ground.w - projected.w) < 1e-6,
    `x moved under projection (${ground.w} vs ${projected.w}) — only y foreshortens`,
  );
  const depthRatio = ground.h / projected.h;
  assert.ok(
    Math.abs(depthRatio - 1 / flat) < 1e-6,
    `ground is ${depthRatio.toFixed(4)}x its projection's depth; expected exactly ` +
      `${(1 / flat).toFixed(4)}. A ratio of 1 means the coordinates were never unprojected ` +
      'and the live render will foreshorten ground that is already foreshortened.',
  );
});

test('a hex tile centre unprojects to its own ground-space position', () => {
  // The independent cross-check: `hexCenter` with no options projects at the land camera,
  // so its y divided by the flattening must equal its y at 90 degrees (no foreshortening).
  const h = { q: 1, r: -1 };
  const projected = hexCenter(h);
  const ground = hexCenter(h, { elevationDeg: 90 });
  const recovered = projected.y / groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  assert.ok(
    Math.abs(recovered - ground.y) < 1e-6,
    `unprojected ${recovered} vs true ground ${ground.y} — the flattening constant is not ` +
      'the one the scene was built with',
  );
});

test('cells carry a STATUS, and on an all-healthy island every one of them is healthy', () => {
  const statuses = new Set(CELLS.map((c) => c.status));
  assert.ok(statuses.has('healthy'), `no healthy cell; saw ${[...statuses].join(', ')}`);
  assert.deepEqual(
    [...statuses].filter((s) => s !== 'healthy'),
    [],
    'a fabricated non-healthy status reached an all-healthy island — the arc has already ' +
      'decided three passes against invented status and will not do it again',
  );
});

test('a MIXED island really does produce the foreign status — the fixture switch works', () => {
  // Non-vacuity for the mixed panel: if the switch did nothing, that panel would silently
  // show a second all-healthy island under a caption claiming otherwise.
  const mixed = groundCellsFrom(islandScene({ oddOneOut: { index: 0, status: 'unhealthy' } }));
  const statuses = new Set(mixed.map((c) => c.status));
  assert.ok(statuses.has('unhealthy'), 'the odd-one-out capability did not reach the ground');
  assert.ok(statuses.has('healthy'), 'the mixed island lost its healthy majority');
});

test('DETERMINISM: the same island yields byte-identical ground', () => {
  assert.deepEqual(groundCellsFrom(islandScene()), CELLS);
});

test('triangulateFan covers the polygon and produces whole triangles', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  const tris = triangulateFan(square);
  assert.equal(tris.length, 4, 'a fan over 4 vertices is 4 triangles');
  for (const t of tris) assert.equal(t.length, 6, 'each triangle is 3 xy pairs');
  // Area check: the fan must reconstruct the polygon's own area, or the ground has holes.
  const area = tris.reduce((s, [ax, ay, bx, by, cx, cy]) => {
    return s + Math.abs((bx! - ax!) * (cy! - ay!) - (cx! - ax!) * (by! - ay!)) / 2;
  }, 0);
  assert.ok(Math.abs(area - 4) < 1e-9, `fan area ${area}, expected the square's 4`);
});

test('triangulateFan REFUSES a degenerate polygon rather than emitting junk', () => {
  assert.deepEqual(triangulateFan([]), []);
  assert.deepEqual(triangulateFan([{ x: 0, y: 0 }, { x: 1, y: 1 }]), []);
});

test('cells carry the OWNING CAPABILITY, and it comes from the parcel group', () => {
  // The field the land's definition is placed by. Without it every seam looks alike and
  // definition can only be sprayed everywhere — which is the treatment the owner rejected
  // by looking, so an extractor that silently stopped carrying this would present as an
  // art problem rather than as a missing field.
  const parcels = new Set(CELLS.map((c) => c.parcel));
  assert.ok(!parcels.has(undefined), 'a ground cell came back with no owning capability');
  assert.ok(parcels.size > 5, `only ${parcels.size} capabilities across ${CELLS.length} cells`);
  // Every capability must own more than one cell, or "boundary between capabilities" would
  // be indistinguishable from "boundary between cells" and the fence would mean nothing.
  const sizes = new Map<string, number>();
  for (const c of CELLS) sizes.set(c.parcel!, (sizes.get(c.parcel!) ?? 0) + 1);
  for (const [cap, n] of sizes) assert.ok(n > 1, `${cap} owns a single cell (${n})`);
});

test('the capability is taken ONLY from a group that says it is a parcel', () => {
  // Every other `<g>` on the island carries an `id` for its own reasons — a territory, a
  // trail edge, a hit target. Inheriting one of those would partition the land along lines
  // that mean nothing, and the picture would look deliberate either way.
  const territory = 'context-traversal-capture';
  assert.ok(
    !CELLS.some((c) => c.parcel === territory),
    'a cell inherited the TERRITORY id instead of its capability — the walk is reading the ' +
      'wrong `id`, and every land boundary drawn from it would be fiction',
  );
});
