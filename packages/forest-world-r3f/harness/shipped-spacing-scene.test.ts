// shipped-spacing-scene.test.ts — the spacing page's own arithmetic, without a GPU and without the
// exported scenes.
//
// ⚠ THE PICTURES ON THAT PAGE ARE FOR THE OWNER'S EYE; what a test can hold is that the arms are the
// SHIPPED composition with only the layout moving (every island at the shipped land ratio); that the
// manifest is refused unless it is a descending ladder with a control; that the fit is CENTRED on
// the forest rather than on the origin (the real layout sits wherever the drawing put it); that the
// nearest-pair water is the geometry it claims; and that the read island is found by id.

import assert from 'node:assert/strict';
import test from 'node:test';

import { shippedElevationDeg } from '../src/camera-framing.js';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.js';
import { islandScene } from './island-fixture.js';
import { orientedCamera } from './shipped-crowd-scene.js';
import { screenExtent } from './shipped-land-ratio-scene.js';
import {
  READ_ISLAND,
  SPACING_CONTROL_ARM,
  SPACING_SHOTS,
  armStream,
  fitCamera,
  forestBounds,
  islandFootprints,
  loadSpacingArms,
  nearestPair,
  neighbourArm,
  validateManifest,
  viewElevationDeg,
  type IslandFootprint,
  type SpacingArm,
  type SpacingManifest,
} from './shipped-spacing-scene.js';

const manifest = (): SpacingManifest => ({
  generatedAt: '2026-09-06T00:00:00.000Z',
  studio: { url: 'http://127.0.0.1:5391', head: 'abc', branch: 'claude/forest-spacing' },
  shippedRatio: 0.1,
  rungs: [0.5, 0.2, 0.1, 0],
  control: SPACING_CONTROL_ARM,
  arms: [
    { id: SPACING_CONTROL_ARM, spacing: { legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } }, file: 'today.json', islands: 1, world: { width: 1, height: 1 }, trails: { edges: 0, segments: 0, caves: 0, dropped: [] }, bytes: 1 },
    { id: 'spacing-0.5', spacing: { ratio: 0.5 }, file: 'spacing-0.5.json', islands: 1, world: { width: 1, height: 1 }, trails: { edges: 0, segments: 0, caves: 0, dropped: [] }, bytes: 1 },
    { id: 'spacing-0.2', spacing: { ratio: 0.2 }, file: 'spacing-0.2.json', islands: 1, world: { width: 1, height: 1 }, trails: { edges: 0, segments: 0, caves: 0, dropped: [] }, bytes: 1 },
    { id: 'spacing-0', spacing: { ratio: 0 }, file: 'spacing-0.json', islands: 1, world: { width: 1, height: 1 }, trails: { edges: 0, segments: 0, caves: 0, dropped: [] }, bytes: 1 },
  ],
});

/** A fake export: the fixture island's scene under every arm, which is enough to hold the pipeline. */
const fixtureArm = (id: string, ratio: number | null): SpacingArm => ({
  record: manifest().arms.find((a) => a.id === id) ?? { id, spacing: ratio === null ? { legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } } : { ratio }, file: `${id}.json`, islands: 1, world: { width: 1, height: 1 }, trails: { edges: 0, segments: 0, caves: 0, dropped: [] }, bytes: 1 },
  file: {
    scene: islandScene(),
    spacing: ratio === null ? { legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } } : { ratio },
    world: { width: 1, height: 1, offset: { x: 0, y: 0 }, islands: [] },
    trails: { edges: 0, segments: 0, caves: 0, dropped: [] },
  },
});

test('validateManifest: accepts a descending ladder with a control; refuses a missing control, a rising ladder, an arm without a ratio', () => {
  assert.equal(validateManifest(manifest()).arms.length, 4);
  const noControl = manifest();
  noControl.control = 'nope';
  assert.throws(() => validateManifest(noControl), /no control arm/);
  const rising = manifest();
  rising.arms = [rising.arms[0]!, rising.arms[3]!, rising.arms[1]!];
  assert.throws(() => validateManifest(rising), /does not descend/);
  const noRatio = manifest();
  noRatio.arms[1] = { ...noRatio.arms[1]!, spacing: {} };
  assert.throws(() => validateManifest(noRatio), /carries no ratio/);
  assert.throws(() => validateManifest(null), /not an object/);
});

test('loadSpacingArms fetches the manifest then every arm through the one route, and refuses a file with no scene', async () => {
  const fetched: string[] = [];
  const files = new Map<string, unknown>([
    ['/r/manifest.json', manifest()],
    ...manifest().arms.map((a): [string, unknown] => [`/r/${a.file}`, fixtureArm(a.id, a.spacing.ratio ?? null).file]),
  ]);
  const { manifest: m, arms } = await loadSpacingArms(
    async (url) => {
      fetched.push(url);
      return files.get(url);
    },
    '/r',
  );
  assert.equal(m.control, SPACING_CONTROL_ARM);
  assert.deepEqual(
    arms.map((a) => a.record.id),
    [SPACING_CONTROL_ARM, 'spacing-0.5', 'spacing-0.2', 'spacing-0'],
  );
  assert.equal(fetched[0], '/r/manifest.json');
  await assert.rejects(
    loadSpacingArms(async (url) => (url.endsWith('manifest.json') ? manifest() : { nope: true }), '/r'),
    /carries no scene graph/,
  );
});

test('neighbourArm: the control has none; every rung’s neighbour is the arm one step UP the ladder', async () => {
  const arms = manifest().arms.map((a) => fixtureArm(a.id, a.spacing.ratio ?? null));
  assert.equal(neighbourArm(arms, SPACING_CONTROL_ARM), null);
  assert.equal(neighbourArm(arms, 'spacing-0.5'), SPACING_CONTROL_ARM);
  assert.equal(neighbourArm(arms, 'spacing-0'), 'spacing-0.2');
});

test('⚠⚠ every arm is the SHIPPED composition: worldTo3D at the shipped land ratio, so land per capability is exact and identical on every arm', () => {
  for (const id of [SPACING_CONTROL_ARM, 'spacing-0']) {
    const stream = armStream(fixtureArm(id, id === SPACING_CONTROL_ARM ? null : 0));
    const b = forestBounds(stream);
    assert.equal(b.islands, 1);
    assert.ok(Math.abs(b.unitsPerCapability.min - LAND_AREA_PER_CAPABILITY) < 1e-6, `${id}: ${b.unitsPerCapability.min}`);
    assert.ok(Math.abs(b.unitsPerCapability.max - LAND_AREA_PER_CAPABILITY) < 1e-6);
    const fp = islandFootprints(stream);
    assert.equal(fp[0]?.id, READ_ISLAND);
    assert.ok(fp[0]!.halfW > 0 && fp[0]!.halfD > 0);
  }
});

test('nearestPair: centre distance and the open water between the two extents along their own line', () => {
  const fp = (id: string, x: number, z: number, halfW: number, halfD: number): IslandFootprint => ({
    id,
    centre: { x, z },
    halfW,
    halfD,
    land: { island: id, capabilities: 1, area: 1 },
  });
  // three islands on a line: a—b are 100 apart with half-widths 20 and 30 → 50 of water; c is far
  const near = nearestPair([fp('a', 0, 0, 20, 5), fp('b', 100, 0, 30, 5), fp('c', 1000, 0, 10, 10)]);
  assert.deepEqual([near.a, near.b], ['a', 'b']);
  assert.equal(near.distance, 100);
  assert.equal(near.water, 50);
  // along z the DEPTH half-extents bind, not the widths
  const deep = nearestPair([fp('a', 0, 0, 100, 10), fp('b', 0, 60, 100, 20)]);
  assert.equal(deep.distance, 60);
  assert.equal(deep.water, 30);
  assert.throws(() => nearestPair([fp('a', 0, 0, 1, 1)]), /fewer than two/);
});

test('fitCamera is CENTRED on the ground, not the origin — an off-origin forest lands mid-frame at the tighter side’s fit', () => {
  // a 400 × 200 slab of ground, far from the origin
  const corners: ReadonlyArray<readonly [number, number]> = [
    [3000, -5000],
    [3400, -5000],
    [3400, -4800],
    [3000, -4800],
  ];
  const pts: number[] = corners.flatMap(([x, z]) => [x, 0, z]);
  const fit = fitCamera(pts);
  const e = screenExtent(pts, orientedCamera(fit.centre, fit.pxPerUnit));
  assert.ok(Math.abs(e.minX + e.maxX) < 1e-6, `x not centred: ${e.minX} ${e.maxX}`);
  assert.ok(Math.abs(e.minY + e.maxY) < 1e-6, `y not centred: ${e.minY} ${e.maxY}`);
  // 400 wide + 2 × 40 margin = 480 ground units across 2560 px, or the (foreshortened) depth across 1600 px — whichever binds
  const byWidth = 2560 / (e.maxX - e.minX + 80);
  const byHeight = 1600 / (e.maxY - e.minY + 80);
  assert.ok(Math.abs(fit.pxPerUnit - Math.min(byWidth, byHeight)) < 1e-9);
  assert.ok(fit.pxPerUnit > 0 && Number.isFinite(fit.pxPerUnit));
});

test('the shots: the forest fitted and the read island at 8 px/unit — the two pictures the increment owes', () => {
  assert.deepEqual(
    SPACING_SHOTS.map((s) => `${s.picture}@${String(s.zoom)}`),
    ['forest@fit', 'one@8'],
  );
});

test('⚠⚠ viewElevationDeg reads the signed elevation at ANY target — the position-normalising reader next door does not, off the origin', () => {
  const origin = orientedCamera({ x: 0, z: 0 }, 1);
  const away = orientedCamera({ x: 3000, z: -5000 }, 1);
  assert.ok(Math.abs(viewElevationDeg(origin) - shippedElevationDeg()) < 1e-6, `origin ${viewElevationDeg(origin)}`);
  assert.ok(Math.abs(viewElevationDeg(away) - viewElevationDeg(origin)) < 1e-6, `away ${viewElevationDeg(away)} vs origin ${viewElevationDeg(origin)}`);
});
