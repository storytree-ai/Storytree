// world-to-3d.test.ts — ADR-0123 THIRD forest-world mapper: node:test-provable
// descriptor mapping (scene semantic layer → typed 3D instance descriptors).
//
// The import of `./world-to-3d.js` is the RED anchor: the module does not exist
// yet. All tests fail with a "Cannot find module" error — the RIGHT-kind red
// (missing implementation, not a syntax error in the test).
//
// When the implementation lands, these tests pin:
//   • core kind-family mapping: tile hex ground → hex-ground, story tree →
//     story-tree, road → road-strip, in-flight wisp → wisp-sprite
//   • total coverage: non-core / structural SceneKinds yield an explicit
//     { kind: 'skipped', sceneKind: string } — never a throw, never a silent drop
//   • material variant flows from the territory's folded SceneStatus
//   • all instance descriptors carry a 3D transform { x, y, z } and an instancing
//     group string
//   • determinism: same scene → byte-identical descriptor array
//
// The fixtures use a real buildScene over @storytree/forest-world's SceneInput
// contract — not hand-rolled scene shapes — exercising the mapper end-to-end
// against the real core (ADR-0123 provability firewall).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScene,
  type SceneInput,
  type SceneTerritoryInput,
} from '@storytree/forest-world';

import {
  worldTo3D,
  type Descriptor3D,
  type InstanceDescriptor,
  type SkippedDescriptor,
} from './world-to-3d.js';

// ---------------------------------------------------------------------------
// fixtures — real SceneInput, not a hand-rolled scene shape
// ---------------------------------------------------------------------------

function mkTerritory(over: Partial<SceneTerritoryInput> = {}): SceneTerritoryInput {
  return {
    id: 'library',
    status: 'healthy',
    caps: 3,
    centroid: { x: 100, y: 200 },
    radius: 60,
    treeSpot: { x: 100, y: 190 },
    labelY: 260,
    coastPaths: [],
    decor: [],
    plants: [],
    treeTitle: 'library — healthy',
    wisps: [],
    plate: {
      w: 120,
      h: 33,
      rx: 7,
      idY: 14,
      subY: 27,
      idText: 'library',
      subText: 'healthy · 3 caps',
      title: 'The library',
    },
    ...over,
  };
}

/** Classic hex-ground mode (relaxedCells: null) so the scene contains `tile`
 *  groups — the ground family the mapper must classify as hex-ground. */
function mkInput(over: Partial<SceneInput> = {}): SceneInput {
  return {
    offset: { x: 0, y: 0 },
    width: 1200,
    height: 900,
    empties: [],
    relaxedCells: null,
    drawTiles: [
      { h: { q: 0, r: 0 }, owner: 0 },
      { h: { q: 1, r: 0 }, owner: 0 },
    ],
    wheatSets: [new Set()],
    roads: [
      { from: 'library', to: 'cli', d: 'M 0 0 L 100 100', title: 'cli depends on library' },
    ],
    territories: [mkTerritory()],
    ...over,
  };
}

// type-guard helpers — TypeScript narrows through the discriminated union
const asInstance = (d: Descriptor3D): d is InstanceDescriptor => d.kind !== 'skipped';
const asSkipped = (d: Descriptor3D): d is SkippedDescriptor => d.kind === 'skipped';

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

test('worldTo3D is deterministic — same scene → byte-identical descriptor array', () => {
  const scene = buildScene(mkInput());
  assert.deepEqual(worldTo3D(scene), worldTo3D(scene));
});

// ---------------------------------------------------------------------------
// core kind families → typed instance descriptors
// ---------------------------------------------------------------------------

test('worldTo3D maps hex tile ground to hex-ground descriptors — one per draw tile', () => {
  // mkInput has relaxedCells: null + 2 drawTiles → 2 tile groups in the scene
  const descs = worldTo3D(buildScene(mkInput()));
  const grounds = descs.filter((d): d is InstanceDescriptor => d.kind === 'hex-ground');
  assert.equal(grounds.length, 2, 'one hex-ground descriptor per draw tile');
});

test('worldTo3D maps the story tree to a story-tree descriptor — one per territory', () => {
  // mkInput has 1 territory → 1 tree group in the scene
  const descs = worldTo3D(buildScene(mkInput()));
  const trees = descs.filter((d): d is InstanceDescriptor => d.kind === 'story-tree');
  assert.equal(trees.length, 1, 'one story-tree descriptor per territory');
});

test('worldTo3D maps a road to a road-strip descriptor — one per road in the scene', () => {
  // mkInput has 1 road
  const descs = worldTo3D(buildScene(mkInput()));
  const roads = descs.filter((d): d is InstanceDescriptor => d.kind === 'road-strip');
  assert.equal(roads.length, 1, 'one road-strip descriptor per road');
});

test('worldTo3D maps in-flight build wisps to wisp-sprite descriptors — one per wisp', () => {
  const scene = buildScene(
    mkInput({
      territories: [
        mkTerritory({
          wisps: [
            { runId: 'run-1', title: 'building unit-a' },
            { runId: 'run-2', title: 'building unit-b' },
          ],
        }),
      ],
    }),
  );
  const sprites = worldTo3D(scene).filter((d): d is InstanceDescriptor => d.kind === 'wisp-sprite');
  assert.equal(sprites.length, 2, 'one wisp-sprite descriptor per in-flight wisp');
});

// ---------------------------------------------------------------------------
// non-core / unknown kinds → explicit skip, never a throw
// ---------------------------------------------------------------------------

test('worldTo3D emits skipped descriptors for non-core SceneKinds — never a throw', () => {
  // The real buildScene output contains many non-core structural kinds:
  // world, ground-hex, tile-side, tile-top, roads-layer, road-line, flora-layer,
  // territory, shadow, trunk, crown-lo, crown-hi, plate, plate-bg, plate-id,
  // plate-sub, hits-layer, hit, …  Each must produce { kind: 'skipped', sceneKind }
  // rather than throwing or silently disappearing.
  const descs = worldTo3D(buildScene(mkInput()));
  const skipped = descs.filter(asSkipped);
  assert.ok(skipped.length > 0, 'structural / non-core nodes must produce skipped descriptors');
  for (const s of skipped) {
    assert.equal(typeof s.sceneKind, 'string', 'each skipped descriptor carries the original SceneKind');
    assert.ok(s.sceneKind.length > 0, 'sceneKind is non-empty');
  }
});

// ---------------------------------------------------------------------------
// folded status flows to the material variant
// ---------------------------------------------------------------------------

test('worldTo3D folds the territory status into the material on hex-ground descriptors', () => {
  for (const status of ['healthy', 'unhealthy', 'proposed'] as const) {
    const descs = worldTo3D(
      buildScene(mkInput({ territories: [mkTerritory({ status })] })),
    );
    const grounds = descs.filter((d): d is InstanceDescriptor => d.kind === 'hex-ground');
    assert.ok(grounds.length > 0, `${status}: expected at least one hex-ground descriptor`);
    for (const g of grounds) {
      assert.equal(g.material, status, `hex-ground material must reflect '${status}' territory`);
    }
  }
});

test('worldTo3D folds the territory status into the material on the story-tree descriptor', () => {
  for (const status of ['healthy', 'unhealthy', 'proposed'] as const) {
    const descs = worldTo3D(
      buildScene(mkInput({ territories: [mkTerritory({ status })] })),
    );
    const trees = descs.filter((d): d is InstanceDescriptor => d.kind === 'story-tree');
    assert.equal(trees.length, 1, `${status}: expected exactly one story-tree descriptor`);
    assert.equal(trees[0]!.material, status, `story-tree material must reflect '${status}'`);
  }
});

// ---------------------------------------------------------------------------
// instance descriptor shape: 3D transform + instancing group
// ---------------------------------------------------------------------------

test('all instance descriptors carry a 3D transform with numeric x, y, z coordinates', () => {
  // Use a scene that exercises all four core families (ground, tree, road, wisp)
  const scene = buildScene(
    mkInput({
      territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building' }] })],
    }),
  );
  const instances = worldTo3D(scene).filter(asInstance);
  assert.ok(instances.length > 0, 'at least one instance descriptor in a full scene');
  for (const inst of instances) {
    const { transform } = inst;
    assert.ok(transform != null, 'transform is present');
    assert.equal(typeof transform.x, 'number', 'transform.x is a number');
    assert.equal(typeof transform.y, 'number', 'transform.y is a number');
    assert.equal(typeof transform.z, 'number', 'transform.z is a number');
    assert.ok(
      Number.isFinite(transform.x) && Number.isFinite(transform.y) && Number.isFinite(transform.z),
      'transform coordinates are finite',
    );
  }
});

test('all instance descriptors carry a non-empty instancing group string', () => {
  const descs = worldTo3D(buildScene(mkInput()));
  const instances = descs.filter(asInstance);
  assert.ok(instances.length > 0, 'at least one instance descriptor');
  for (const inst of instances) {
    assert.equal(typeof inst.group, 'string', 'group is a string');
    assert.ok(inst.group.length > 0, 'group is non-empty');
  }
});
