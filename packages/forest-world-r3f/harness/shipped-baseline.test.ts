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

import { worldTo3D } from '../src/world-to-3d.js';
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
  authoredTriangles,
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

/* ── ⚠⚠ THE FINDING THIS BASELINE EXISTS FOR ─────────────────────────────────────────────────
   The shipped canvas's ground case keys on a scene node of kind `tile` (`world-to-3d.ts:207`),
   which is the CLASSIC extruded-hex ground. The substrate the studio actually ships is the
   RELAXED MESH (`scene.ts:658`: "Mesh substrate cells; null => the classic extruded-hex
   ground"), whose ground arrives as `cell` nodes — and the mapper has no case for those, so
   they fall to the default skip.

   The consequence, measured on an RTX 2060 on 2026-08-28: for an island of the shape the
   studio ships, `<ForestWorldCanvas>` draws NO GROUND AT ALL. One story tree, 144 triangles,
   two draw calls. The land this whole arc is about does not currently reach the shipped
   renderer in any form.

   BOTH tests below are needed and neither is sufficient. The first states the finding; on its
   own it is satisfied by a mapper that is simply broken for everything. The second is the
   non-vacuity control — the SAME mapper, the SAME fixture shape, the classic substrate — and
   it draws ground. Together they say the mapper works and is pointed at a representation the
   product no longer produces. ────────────────────────────────────────────────────────────── */

test('⚠ the shipped mapper emits NO ground for the mesh substrate the studio ships', () => {
  const ds = worldTo3D(islandScene());
  const ground = ds.filter((d) => d.kind === 'hex-ground');
  assert.equal(ground.length, 0, 'if this ever becomes non-zero the finding has been FIXED — say so, do not delete the test');
  const skippedCells = ds.filter((d) => d.kind === 'skipped' && d.sceneKind === 'cell');
  assert.ok(
    skippedCells.length > 100,
    `the island's ground cells should be arriving and being skipped; got ${skippedCells.length}`,
  );
});

test('NON-VACUITY: the same mapper DOES draw ground for the classic hex substrate', () => {
  // Without this control the test above is satisfied by a mapper that draws nothing ever.
  const scene = classicHexScene(buildScene as never, hexCentre) as SceneG;
  const ground = worldTo3D(scene).filter((d) => d.kind === 'hex-ground');
  assert.equal(ground.length, CLASSIC_TILES.length, 'the classic substrate maps one hex-ground per tile');
});

test('the shipped canvas costs what the authored count says, for the scene it CAN draw', () => {
  // The 2026-08-28 GPU run measured 144 triangles across 2 draw calls for the mesh-substrate
  // island — the story tree alone. Recorded as an assertion so a change to the shipped
  // primitives is caught here rather than in a report nobody re-runs.
  const ds = worldTo3D(islandScene());
  const c: Record<string, number> = {};
  for (const d of ds) c[d.kind] = (c[d.kind] ?? 0) + 1;
  assert.equal(authoredTriangles(c).triangles, 144);
});
