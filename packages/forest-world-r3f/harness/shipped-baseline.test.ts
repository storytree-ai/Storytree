// shipped-baseline.test.ts — hold the AUTHORED baseline to the two things that can make it lie.
//
// 1. THE FORMULAS ARE CHECKED AGAINST THREE ITSELF. Geometry generation is pure JavaScript and
//    needs no WebGL, so the counts this module claims for `cylinderGeometry(9, 9, 3, 6)` and
//    friends are asserted against the real `CylinderGeometry` here rather than against memory.
//    A formula derived from the docs and never run is how an authored count acquires the calm
//    authority of a measurement while being wrong.
// 2. THE PALETTE TRANSCRIPTION IS PARSED OUT OF THE SHIPPED FILE. `SHIPPED_STATUS_COLOUR` is a
//    copy, and this repo already carries three disagreeing copies of the status palette — a
//    fourth that nobody checks would be strictly worse than none.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CircleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { buildScene, hexCenter as hexCentre, type SceneG } from '@storytree/forest-world';

import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { cellGroundTriangles } from '../src/cell-ground-geometry.js';
import { islandScene } from './island-fixture.js';
import type { BufferGeometry } from 'three';

import {
  SHIPPED_HEX_RADIUS,
  SHIPPED_PRIMITIVES,
  SHIPPED_STATUSES,
  SHIPPED_STATUS_COLOUR,
  SHIPPED_TILE_HEIGHT,
  SHIPPED_UNDRAWN,
  CLASSIC_TILES,
  BEFORE_THE_CELL_CASE,
  authoredTriangles,
  cellGroundTrianglesFor,
  circleTriangles,
  classicHexScene,
  cylinderTriangles,
  sphereTriangles,
} from './shipped-baseline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = join(HERE, '..', 'src', 'ForestWorldCanvas.tsx');

/** Triangles three actually generated. Non-indexed geometry has no index buffer, so both
 *  cases are handled rather than assumed. */
function realTriangles(g: BufferGeometry): number {
  const positions = g.getAttribute('position');
  return (g.index ? g.index.count : positions.count) / 3;
}

test('the hex-ground formula matches what three generates for the shipped primitive', () => {
  const g = new CylinderGeometry(9, 9, 3, 6);
  assert.equal(cylinderTriangles(6, 1, 9, 9), realTriangles(g));
  assert.equal(cylinderTriangles(6, 1, 9, 9), 24, 'the shipped hex prism is 24 triangles');
});

test('the story-tree trunk formula matches three (default 32 radial segments)', () => {
  const g = new CylinderGeometry(1.2, 1.6, 8);
  assert.equal(cylinderTriangles(32, 1, 1.2, 1.6), realTriangles(g));
});

test('the crown formula matches three — a CONE is not a zero-radius cylinder by count', () => {
  const g = new ConeGeometry(7, 14, 8);
  assert.equal(cylinderTriangles(8, 1, 0, 7), realTriangles(g));
  // NON-VACUITY on the degenerate-row rule: treating the tip as a full row would over-count.
  assert.notEqual(cylinderTriangles(8, 1, 0, 7), 8 * 2 + 8);
});

test('the cave-arch and wisp formulas match three', () => {
  assert.equal(circleTriangles(24), realTriangles(new CircleGeometry(5, 24)));
  assert.equal(sphereTriangles(12, 12), realTriangles(new SphereGeometry(2.2, 12, 12)));
});

test('authoredTriangles sums a census, and reports a family the canvas draws none of', () => {
  const census = { 'hex-ground': 13, 'story-tree': 1, 'cave-arch': 2, 'wisp-sprite': 0 };
  const got = authoredTriangles(census);
  // 13 x 24 ground + one tree (trunk 128 + crown 16) + 2 x 24 arch + 0 wisp
  assert.equal(got.triangles, 13 * 24 + 128 + 16 + 2 * 24);
  const wisp = got.byKind.find((k) => k.kind === 'wisp-sprite');
  assert.ok(wisp, 'a kind with zero drawables is REPORTED, not dropped');
  assert.equal(wisp.triangles, 0);
});

test('an empty census is zero, and every primitive still appears in the breakdown', () => {
  const got = authoredTriangles({});
  assert.equal(got.triangles, 0);
  assert.equal(got.byKind.length, SHIPPED_PRIMITIVES.length);
});

test('the transcribed palette is what the shipped canvas actually holds', () => {
  const src = readFileSync(SHIPPED, 'utf8');
  const block = /STATUS_COLOUR[^=]*=\s*new Map\(\[([\s\S]*?)\]\)/.exec(src);
  assert.ok(block, 'could not find STATUS_COLOUR in src/ForestWorldCanvas.tsx');
  const parsed = new Map<string, string>();
  for (const m of block[1]!.matchAll(/\[\s*'([a-z]+)'\s*,\s*'(#[0-9a-fA-F]{6})'\s*\]/g)) {
    parsed.set(m[1]!, m[2]!);
  }
  assert.equal(parsed.size, 6, 'the shipped canvas should carry six status entries');
  assert.deepEqual(
    [...parsed.entries()].sort(),
    [...SHIPPED_STATUS_COLOUR.entries()].sort(),
    'SHIPPED_STATUS_COLOUR has drifted from src/ForestWorldCanvas.tsx — re-transcribe it',
  );
});

test('the six statuses are the six the semantic layer can produce', () => {
  assert.equal(SHIPPED_STATUSES.length, 6);
  for (const s of SHIPPED_STATUSES) assert.ok(SHIPPED_STATUS_COLOUR.has(s), `${s} has no shipped colour`);
});

test('the shipped size constants are what the shipped canvas holds', () => {
  const src = readFileSync(SHIPPED, 'utf8');
  assert.match(src, new RegExp(`HEX_RADIUS\\s*=\\s*${SHIPPED_HEX_RADIUS}\\b`));
  assert.match(src, new RegExp(`TILE_HEIGHT\\s*=\\s*${SHIPPED_TILE_HEIGHT}\\b`));
});

test('trails are UNDRAWN by default, and the shipped file says so', () => {
  const src = readFileSync(SHIPPED, 'utf8');
  assert.match(src, /showTrails\s*=\s*false/, 'the default that makes trail-strip undrawn');
  assert.ok(SHIPPED_UNDRAWN.some((u) => u.kind === 'trail-strip'));
  assert.ok(SHIPPED_UNDRAWN.some((u) => u.kind === 'trail-ghost-strip'));
});

test('every primitive names the shipped file it was read off', () => {
  for (const p of SHIPPED_PRIMITIVES) {
    assert.match(p.source, /^ForestWorldCanvas\.tsx:\d+$/, `${p.kind} must cite its source line`);
    assert.ok(p.triangles > 0, `${p.kind} must carry a real count`);
  }
});

/* ── ⚠⚠ THE FINDING THIS BASELINE EXISTED FOR — AND ITS FIX ─────────────────────────────────
   ⚠ READ THE HISTORY BEFORE CHANGING THESE. As of PR #1679 (2026-08-28) the shipped canvas's
   ground case keyed on a scene node of kind `tile` (the CLASSIC extruded-hex ground) only. The
   substrate the studio actually ships is the RELAXED MESH (`scene.ts:658`), whose ground arrives
   as `cell` nodes — and the mapper had no case for those, so they fell to the default skip.
   Measured on an RTX 2060 that day: for an island of the shape the studio ships,
   `<ForestWorldCanvas>` drew NO GROUND AT ALL. One story tree, 144 triangles, two draw calls.

   `the-shipped-map-draws-its-ground-again` closed that gap by teaching the mapper the `cell` /
   `cell-wheat` representation. The tests below now pin the FIX, and the ORIGINAL numbers are
   kept in `BEFORE_THE_CELL_CASE` so the size of the change stays checkable rather than
   remembered — a before/after that only lives in a report is one nobody can re-run.

   THREE tests, and none is sufficient alone. The first says the ground arrives. The second is
   the non-vacuity control — the SAME mapper on the classic substrate still draws its hexes, so
   the fix ADDED a representation rather than swapping one for another. The third says nothing
   falls through to a skip any more, which is what the original finding actually was.
   ────────────────────────────────────────────────────────────────────────────────────────── */


test('the shipped mapper NOW draws the mesh substrate the studio ships', () => {
  const ds = worldTo3D(islandScene());
  const cells = ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  assert.equal(
    cells.length,
    BEFORE_THE_CELL_CASE.skippedCells,
    'every parcel that used to be skipped should now be a drawable',
  );
  // Each one carries a ring it is possible to build a face from, and a status to colour it by.
  for (const c of cells) {
    assert.ok((c.points?.length ?? 0) >= 3, 'a parcel needs a ring');
    assert.equal(typeof c.material, 'string', 'a parcel needs a status');
  }
});

test('NON-VACUITY: the same mapper STILL draws ground for the classic hex substrate', () => {
  // Without this control the test above is satisfied by a mapper that swapped one substrate for
  // the other — which would trade the reported defect for the same defect facing the other way.
  const scene = classicHexScene(buildScene as never, hexCentre) as SceneG;
  const ds = worldTo3D(scene);
  assert.equal(
    ds.filter((d) => d.kind === 'hex-ground').length,
    CLASSIC_TILES.length,
    'the classic substrate maps one hex-ground per tile',
  );
  assert.equal(ds.filter((d) => d.kind === 'cell-ground').length, 0, 'and emits no parcels');
});

test('no ground cell falls through to a skip any more — the original finding, inverted', () => {
  const ds = worldTo3D(islandScene());
  const skippedCells = ds.filter((d) => d.kind === 'skipped' && (d.sceneKind === 'cell' || d.sceneKind === 'cell-wheat'));
  assert.equal(skippedCells.length, 0, `${skippedCells.length} ground cells are still being skipped`);
});

test('a parcel wears its territory status, which the cell itself does not carry', () => {
  // ⚠ THE INHERITANCE IS THE LOAD-BEARING PART. On the relaxed mesh a plain `cell` has no status
  // of its own — the core puts it on the `<g kind="ground" status=…>` above it (`scene.ts:3252`
  // vs `:3254`). Read the cell alone and every parcel draws `unknown`, which is a map that has
  // stopped REPORTING (ADR-0392 D5 / ADR-0398 D7) rather than one that merely looks wrong. So a
  // test that only counted parcels would pass on exactly the version that lies.
  const ds = worldTo3D(islandScene());
  const materials = new Set(
    ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground').map((d) => d.material),
  );
  assert.ok(materials.size > 0, 'no parcels at all');
  assert.ok(!materials.has('unknown'), 'a parcel fell back to `unknown` — the status did not reach it');
});

test('the shipped canvas costs what the authored count says — parcels included', () => {
  // ⚠ THE PARCEL TOTAL MUST BE PASSED IN, and this test is where that is enforced. Calling
  // `authoredTriangles(census)` alone still returns a number, and before the `cell` case existed
  // that number was RIGHT — 144, the story tree alone. It is now an undercount by the entire
  // ground, and it would go on being reported with the same calm authority. So the assertion is
  // that the two forms DISAGREE, which is the only way a defaulted argument can be held to
  // being supplied.
  const ds = worldTo3D(islandScene());
  const c: Record<string, number> = {};
  for (const d of ds) c[d.kind] = (c[d.kind] ?? 0) + 1;

  const parcelTriangles = cellGroundTrianglesFor(ds);
  assert.ok(parcelTriangles > 0, 'the fixture draws no parcels — the fixture, not the count, is wrong');

  const treeOnly = authoredTriangles(c).triangles;
  assert.equal(treeOnly, BEFORE_THE_CELL_CASE.triangles, 'the story tree alone is still 144');

  const whole = authoredTriangles(c, parcelTriangles).triangles;
  assert.equal(whole, treeOnly + parcelTriangles);
  assert.ok(whole > treeOnly, 'the ground contributed nothing — the parcel total was dropped');

  // And the per-kind breakdown names the parcels rather than folding them into a total.
  const row = authoredTriangles(c, parcelTriangles).byKind.find((k) => k.kind === 'cell-ground');
  assert.ok(row, 'cell-ground must appear in the breakdown');
  assert.equal(row.drawables, BEFORE_THE_CELL_CASE.skippedCells);
  assert.equal(row.triangles, parcelTriangles);
});

test('EVERY parcel of the shipped substrate is a QUADRILATERAL — recorded, not assumed', () => {
  // ⚠ Worth knowing before sizing anything on this geometry: `buildRelaxedCells` produces
  // four-vertex parcels uniformly — 164 of them, all rings of 4. It is the same figure the
  // harness records from the other side ("164 cells x 4-pt fan"), reached independently here.
  // It is a property of TODAY'S generator, not a guarantee, which is why the triangle total is
  // still summed per ring rather than shortcut to `164 * 10`.
  const ds = worldTo3D(islandScene());
  const rings = ds
    .filter((d): d is InstanceDescriptor => d.kind === 'cell-ground')
    .map((d) => d.points?.length ?? 0);
  assert.deepEqual([...new Set(rings)], [4]);
  assert.equal(rings.length, BEFORE_THE_CELL_CASE.skippedCells);
  assert.equal(cellGroundTrianglesFor(ds), rings.length * cellGroundTriangles(4));
});

test('the parcel total reads each ring’s OWN length, not the quad the fixture happens to be', () => {
  // ⚠ A CLAIM THIS TEST WAS FIRST WRITTEN TO MAKE IS FALSE, and it is recorded rather than
  // quietly dropped. `cellGroundTriangles` is AFFINE in the ring length (3n - 2), so a
  // count-times-MEAN estimate is not an approximation at all — it is exactly equal, and an
  // implementation that averaged would pass every check here. The real hazard is narrower and
  // this is what the test now pins: a ring length ASSUMED to be 4, which is what today's
  // generator uniformly produces (above) and what a reader sizing this geometry would most
  // naturally hardcode. `baseline-measure.mjs` refuses a run in which the authored and GL counts
  // differ by ANY amount, so on a future non-quad island that assumption is a refused run.
  const ring = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      x: Math.cos((i / n) * Math.PI * 2) * 10,
      y: 0,
      z: Math.sin((i / n) * Math.PI * 2) * 10,
    }));
  const mixed: Descriptor3D[] = [3, 4, 9].map((n) => ({
    kind: 'cell-ground' as const,
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    material: 'healthy',
    points: ring(n),
  }));
  const summed = cellGroundTriangles(3) + cellGroundTriangles(4) + cellGroundTriangles(9);
  assert.equal(cellGroundTrianglesFor(mixed), summed);
  // What an implementation that assumed the fixture's quad would report, shown to differ.
  assert.notEqual(summed, mixed.length * cellGroundTriangles(4));
});
