// shipped-tile-scene.test.ts — the tile page's own arithmetic, without a GPU and without the
// exported scenes. The instrument is the spacing page's (held by `shipped-spacing-scene.test.ts`);
// what this holds is the manifest the tile ladder is REFUSED without, and the loader that carries it
// through the shared runner's seam.

import assert from 'node:assert/strict';
import test from 'node:test';

import { islandScene } from './island-fixture.js';
import { SPACING_CONTROL_ARM } from './shipped-spacing-scene.js';
import {
  TILE_CONTROL_ARM,
  loadTileArms,
  tileArmCaption,
  tileArmId,
  validateTileManifest,
  type TileArmRecord,
  type TileManifest,
} from './shipped-tile-scene.js';

const DERIVED = { hexR: 11.06, quota: 'max(1, capabilities) hexes', tilesPerCapability: 1 };
const CONTROL_TILE = { hexR: 27, quota: 'max(3, capabilities + 2) hexes' };
const trails = { edges: 0, segments: 0, caves: 0, dropped: [] as Array<{ from: string; to: string }> };
const source = { head: 'abc', branch: 'claude/tile-footprint', generatedAt: '2026-09-06T00:00:00.000Z' };
const arm = (id: string, ratio: number, tile: { hexR: number; quota: string }): TileArmRecord => ({
  id,
  spacing: { ratio },
  tile,
  source,
  file: `${id}.json`,
  islands: 1,
  world: { width: 1, height: 1 },
  trails,
  bytes: 1,
});

const manifest = (): TileManifest => ({
  generatedAt: '2026-09-06T00:00:00.000Z',
  studio: { url: 'http://127.0.0.1:5397', head: 'abc', branch: 'claude/tile-footprint' },
  shippedRatio: 0,
  rungs: [0.5, 0.2, 0],
  control: TILE_CONTROL_ARM,
  tile: DERIVED,
  controlTile: CONTROL_TILE,
  arms: [arm(TILE_CONTROL_ARM, 0, CONTROL_TILE), arm(tileArmId(0.5), 0.5, DERIVED), arm(tileArmId(0.2), 0.2, DERIVED), arm(tileArmId(0), 0, DERIVED)],
});

test('the tile control is the spacing page’s control arm id — one ruler, the same "today"', () => {
  assert.equal(TILE_CONTROL_ARM, SPACING_CONTROL_ARM);
  assert.equal(tileArmId(0.35), 'tile-spacing-0.35');
});

test('validateTileManifest: accepts a control on the OLD tile plus a descending ladder on the DERIVED tile', () => {
  const m = validateTileManifest(manifest());
  assert.equal(m.arms.length, 4);
  assert.equal(m.tile.tilesPerCapability, 1);
});

test('validateTileManifest refuses: no control, a derived tile no smaller than the control’s, an arm on the wrong tile, a rising ladder, an arm with no source', () => {
  const noControl = manifest();
  noControl.control = 'nope';
  assert.throws(() => validateTileManifest(noControl), /no control arm/);
  const notSmaller = manifest();
  notSmaller.tile = { ...DERIVED, hexR: 27 };
  notSmaller.arms = notSmaller.arms.map((a) => (a.id === TILE_CONTROL_ARM ? a : { ...a, tile: notSmaller.tile }));
  assert.throws(() => validateTileManifest(notSmaller), /not smaller than the control/);
  const wrongTile = manifest();
  wrongTile.arms[2] = { ...wrongTile.arms[2]!, tile: CONTROL_TILE };
  assert.throws(() => validateTileManifest(wrongTile), /does not stand on the derived tile/);
  const controlOnDerived = manifest();
  controlOnDerived.arms[0] = { ...controlOnDerived.arms[0]!, tile: DERIVED };
  assert.throws(() => validateTileManifest(controlOnDerived), /control does not stand on the control tile/);
  const rising = manifest();
  rising.arms = [rising.arms[0]!, rising.arms[3]!, rising.arms[1]!];
  assert.throws(() => validateTileManifest(rising), /does not descend/);
  // `validateTileManifest` takes `unknown`, so the arm without a source is built as the plain
  // object it is rather than asserted into a type it does not satisfy.
  const withoutSource = manifest().arms.map(({ source: _source, ...rest }, i): unknown => (i === 1 ? rest : { source: _source, ...rest }));
  const noSource = { ...manifest(), arms: withoutSource };
  assert.throws(() => validateTileManifest(noSource), /carries no source head/);
  assert.throws(() => validateTileManifest(null), /not an object/);
});

test('loadTileArms fetches the manifest then every arm through the one route, and refuses a file with no scene', async () => {
  const fetched: string[] = [];
  const file = { scene: islandScene(), spacing: { ratio: 0 }, world: { width: 1, height: 1, offset: { x: 0, y: 0 }, islands: [] }, trails };
  const files = new Map<string, unknown>([['/t/manifest.json', manifest()], ...manifest().arms.map((a): [string, unknown] => [`/t/${a.file}`, file])]);
  const { manifest: m, arms } = await loadTileArms(async (url) => {
    fetched.push(url);
    return files.get(url);
  }, '/t');
  assert.equal(m.control, TILE_CONTROL_ARM);
  assert.deepEqual(
    arms.map((a) => a.record.id),
    [TILE_CONTROL_ARM, 'tile-spacing-0.5', 'tile-spacing-0.2', 'tile-spacing-0'],
  );
  assert.equal(fetched[0], '/t/manifest.json');
  await assert.rejects(loadTileArms(async (url) => (url.endsWith('manifest.json') ? manifest() : { nope: true }), '/t'), /carries no scene graph/);
});

test('tileArmCaption names the tile on every arm, marks the control and the shipped pick, and never calls the control the pick', () => {
  const m = manifest();
  const control = tileArmCaption(m.arms[0]!, m);
  assert.match(control, /SHIPPED before this landing/);
  assert.match(control, /hex radius 27\.00/);
  assert.doesNotMatch(control, /SHIPPED PICK/);
  const pick = tileArmCaption(m.arms[3]!, m);
  assert.match(pick, /THE SHIPPED PICK/);
  assert.match(pick, /hex radius 11\.06/);
  assert.match(tileArmCaption(m.arms[1]!, m), /every gap 0\.5 ×/);
});
