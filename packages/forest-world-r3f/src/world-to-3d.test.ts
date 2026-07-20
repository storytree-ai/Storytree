// world-to-3d.test.ts — ADR-0123 THIRD forest-world mapper: node:test-provable
// descriptor mapping (scene semantic layer → typed 3D instance descriptors).
//
// The import of `./world-to-3d.js` is the RED anchor: the module does not exist
// yet. All tests fail with a "Cannot find module" error — the RIGHT-kind red
// (missing implementation, not a syntax error in the test).
//
// When the implementation lands, these tests pin:
//   • core kind-family mapping: tile hex ground → hex-ground, story tree →
//     story-tree, trail fill/ghost → trail-strip / trail-ghost-strip, cave →
//     cave-arch, in-flight wisp → wisp-sprite
//   • total coverage: non-core / structural SceneKinds yield an explicit
//     { kind: 'skipped', sceneKind: string } — never a throw, never a silent drop
//   • material variant flows from the territory's folded SceneStatus
//   • all instance descriptors carry a 3D transform { x, y, z } and an instancing
//     group string
//   • determinism: same scene → byte-identical descriptor array
//
// The fixtures use a real buildScene over @storytree/forest-world's SceneInput
// contract — trails are real `routeTrails` output on tiny island sets, not
// hand-forged shapes — exercising the mapper end-to-end against the real core
// (ADR-0123 provability firewall).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScene,
  hexCenter,
  routeTrails,
  trailFillWidth,
  type SceneG,
  type SceneInput,
  type SceneKind,
  type SceneTerritoryInput,
  type TrailIsland,
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

// Trail fixtures are ROUTED, not hand-forged (the scene.test.ts pattern): real
// `routeTrails` output on tiny island sets, computed once — pure function, safe to share.
const isle = (id: string, x: number, y: number, r: number): TrailIsland => ({ id, x, y, r });

// one unobstructed edge, matching the default territory (library → cli)
const BASE_TRAILS = routeTrails(
  [isle('library', 100, 200, 60), isle('cli', 300, 60, 50)],
  [{ from: 'library', to: 'cli', title: 'cli depends on library' }],
  'r3f-fixture',
);

// a walled-in edge — forced under the ring, so hidden ghost runs + cave portals exist
const CAVE_ISLANDS: TrailIsland[] = [isle('A', 0, 0, 30), isle('B', 600, 0, 30)];
for (let k = 0; k < 8; k++) {
  const a = (Math.PI / 4) * k;
  CAVE_ISLANDS.push(isle(`ring${k}`, 150 * Math.cos(a), 150 * Math.sin(a), 60));
}
const CAVE_TRAILS = routeTrails(CAVE_ISLANDS, [{ from: 'A', to: 'B' }], 'r3f-cave');

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
    trails: BASE_TRAILS,
    territories: [mkTerritory()],
    ...over,
  };
}

// type-guard helpers — TypeScript narrows through the discriminated union
const asInstance = (d: Descriptor3D): d is InstanceDescriptor => d.kind !== 'skipped';
const asSkipped = (d: Descriptor3D): d is SkippedDescriptor => d.kind === 'skipped';

/** Positional tolerance: the core rounds path coords to 0.1 (`toFixed(1)`), so a
 *  vertex-centroid recovery of a baked centre lands within ~0.05 per axis. */
const closeTo = (got: number, want: number, msg: string): void =>
  assert.ok(Math.abs(got - want) < 0.15, `${msg} (got ${got}, want ~${want})`);

// ---------------------------------------------------------------------------
// contract: r3f-mapping-is-deterministic
// ---------------------------------------------------------------------------

test('r3f-mapping-is-deterministic: same scene → deep-equal descriptor arrays, stable ordering', () => {
  const scene = buildScene(mkInput());
  assert.deepEqual(worldTo3D(scene), worldTo3D(scene));
  // A fresh scene from the same input maps identically too — the core's determinism
  // carried through the mapper end-to-end.
  assert.deepEqual(worldTo3D(buildScene(mkInput())), worldTo3D(scene));
});

// ---------------------------------------------------------------------------
// contract: r3f-semantic-layer-maps-faithfully
// ---------------------------------------------------------------------------

test('r3f-semantic-layer-maps-faithfully: kind → mesh family, position → transform, status → variant', () => {
  const scene = buildScene(
    mkInput({
      territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building unit-a' }] })],
    }),
  );
  const descs = worldTo3D(scene);

  // kind family → typed descriptor branch, transforms derived from the World geometry:
  // each hex-ground sits at ITS baked hex centre (distinct per tile, never collapsed).
  const grounds = descs.filter((d): d is InstanceDescriptor => d.kind === 'hex-ground');
  assert.equal(grounds.length, 2, 'one hex-ground per draw tile');
  const c0 = hexCenter({ q: 0, r: 0 });
  const c1 = hexCenter({ q: 1, r: 0 });
  closeTo(grounds[0]!.transform.x, c0.x, 'tile 0 x from its hex centre');
  closeTo(grounds[0]!.transform.z, c0.y, 'tile 0 z from its hex centre');
  closeTo(grounds[1]!.transform.x, c1.x, 'tile 1 x from its hex centre');
  closeTo(grounds[1]!.transform.z, c1.y, 'tile 1 z from its hex centre');
  assert.notDeepEqual(grounds[0]!.transform, grounds[1]!.transform, 'tiles do not collapse');

  // the story tree stands at its territory's treeSpot.
  const trees = descs.filter((d): d is InstanceDescriptor => d.kind === 'story-tree');
  assert.equal(trees.length, 1, 'one story-tree per territory');
  closeTo(trees[0]!.transform.x, 100, 'tree x = treeSpot.x');
  closeTo(trees[0]!.transform.z, 190, 'tree z = treeSpot.y');

  // each visible trail segment carries its routed polyline on the ground plane
  // (y = 0 throughout), width from the ONE shared rule, and its reveal metadata.
  const visible = BASE_TRAILS.segments.filter((s) => !s.hidden);
  const strips = descs.filter((d): d is InstanceDescriptor => d.kind === 'trail-strip');
  assert.equal(strips.length, visible.length, 'one trail-strip per visible segment');
  const byId = new Map(strips.map((s) => [s.segment, s]));
  for (const seg of visible) {
    const strip = byId.get(seg.id);
    assert.ok(strip, `a strip exists for segment ${seg.id}`);
    assert.ok(strip.points && strip.points.length >= 2, 'trail-strip carries its polyline');
    // the strip's endpoints are the segment's smoothed endpoints (the d's M / final C
    // anchor, r2-rounded by the core)
    const first = seg.points[0]!;
    const last = seg.points[seg.points.length - 1]!;
    closeTo(strip.points[0]!.x, first.x, 'strip start x from the routed segment');
    closeTo(strip.points[0]!.z, first.y, 'strip start z from the routed segment');
    closeTo(strip.points[strip.points.length - 1]!.x, last.x, 'strip end x');
    closeTo(strip.points[strip.points.length - 1]!.z, last.y, 'strip end z');
    for (const p of strip.points) assert.equal(p.y, 0, 'strips lie on the ground plane');
    assert.equal(strip.width, trailFillWidth(seg.usage), 'width = trailFillWidth(usage)');
    assert.equal(strip.usage, seg.usage, 'usage rides the descriptor');
    assert.equal(strip.hidden, false, 'a fill-pass strip is not hidden');
    assert.deepEqual(strip.edges, ['library->cli'], 'the edge keys ride the descriptor');
  }

  // the wisp orbits its territory's centroid.
  const sprites = descs.filter((d): d is InstanceDescriptor => d.kind === 'wisp-sprite');
  assert.equal(sprites.length, 1, 'one wisp-sprite per in-flight wisp');
  closeTo(sprites[0]!.transform.x, 100, 'wisp x = territory centroid.x');
  closeTo(sprites[0]!.transform.z, 200, 'wisp z = territory centroid.y');

  // folded SceneStatus → a distinct material variant per status.
  for (const status of ['healthy', 'unhealthy', 'proposed', 'building'] as const) {
    const ds = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({ status })] })));
    for (const gd of ds.filter((d): d is InstanceDescriptor => d.kind === 'hex-ground')) {
      assert.equal(gd.material, status, `hex-ground material reflects '${status}'`);
    }
    const tr = ds.filter((d): d is InstanceDescriptor => d.kind === 'story-tree');
    assert.equal(tr[0]!.material, status, `story-tree material reflects '${status}'`);
  }
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

test('worldTo3D maps visible trail segments to trail-strip descriptors — one per fill-pass segment', () => {
  const descs = worldTo3D(buildScene(mkInput()));
  const strips = descs.filter((d): d is InstanceDescriptor => d.kind === 'trail-strip');
  assert.equal(
    strips.length,
    BASE_TRAILS.segments.filter((s) => !s.hidden).length,
    'one trail-strip descriptor per visible segment',
  );
  // the shadow/casing passes contribute NO geometry — the ribbon supplies its own
  // look — but their paths still surface as explicit skips (total coverage).
  const skippedKinds = descs.filter(asSkipped).map((s) => s.sceneKind);
  assert.ok(skippedKinds.includes('trail-shadow'), 'shadow-pass paths skip explicitly');
  assert.ok(skippedKinds.includes('trail-casing'), 'casing-pass paths skip explicitly');
});

test('worldTo3D filters under-island runs into trail-ghost-strip — never a trail-strip (ADR-0169 §2)', () => {
  // the walled-in fixture forces the route under the ring: hidden ghost runs + caves
  const hidden = CAVE_TRAILS.segments.filter((s) => s.hidden);
  assert.ok(hidden.length > 0, 'the walled-in fixture forces hidden runs');
  const descs = worldTo3D(buildScene(mkInput({ trails: CAVE_TRAILS })));
  const ghosts = descs.filter((d): d is InstanceDescriptor => d.kind === 'trail-ghost-strip');
  assert.equal(ghosts.length, hidden.length, 'one ghost strip per hidden segment');
  for (const g of ghosts) {
    assert.equal(g.hidden, true, 'ghost strips are marked hidden');
    assert.ok(g.points && g.points.length >= 2, 'ghost strips still carry geometry');
  }
  // a hidden segment NEVER leaks into the visible strip family
  const stripIds = new Set(
    descs
      .filter((d): d is InstanceDescriptor => d.kind === 'trail-strip')
      .map((d) => d.segment),
  );
  for (const seg of hidden) {
    assert.ok(!stripIds.has(seg.id), `hidden segment ${seg.id} is not a visible strip`);
  }
});

test('worldTo3D maps cave portals to cave-arch descriptors — rim placement, bearing, mouth width', () => {
  assert.ok(CAVE_TRAILS.caves.length > 0, 'the walled-in fixture forces cave portals');
  const descs = worldTo3D(buildScene(mkInput({ trails: CAVE_TRAILS })));
  const arches = descs.filter((d): d is InstanceDescriptor => d.kind === 'cave-arch');
  assert.equal(arches.length, CAVE_TRAILS.caves.length, 'one cave-arch per portal');
  // match by island + edge set (portal order is preserved by buildScene)
  for (const [i, cave] of CAVE_TRAILS.caves.entries()) {
    const arch = arches[i]!;
    assert.equal(arch.island, cave.islandId, 'the portal knows its island');
    closeTo(arch.transform.x, cave.x, 'portal x from the rim translate');
    closeTo(arch.transform.z, cave.y, 'portal z from the rim translate');
    assert.equal(arch.transform.y, 0, 'portals sit on the ground plane');
    // bearing round-trips the core's 0.1°-rounded rotate (≤ ~0.001 rad error)
    assert.ok(
      Math.abs((arch.bearing ?? Infinity) - cave.bearing) < 0.01,
      `portal bearing (got ${arch.bearing}, want ~${cave.bearing})`,
    );
    // mouth width round-trips the baked half-disc (hw is 0.1-rounded → ≤ ~0.07 error)
    assert.ok(
      Math.abs((arch.width ?? Infinity) - cave.width) < 0.15,
      `portal width (got ${arch.width}, want ~${cave.width})`,
    );
    assert.deepEqual(arch.edges, cave.edgeIds, 'the portal carries its edge ids');
    assert.equal(arch.material, 'unknown', 'no territory for the island → unknown status');
  }
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

test('r3f-unknown-kind-skips-visibly: an unhandled SceneKind yields a named skip, never a throw', () => {
  // The real buildScene output contains many non-core structural kinds:
  // world, ground-hex, tile-side, tile-top, trails-layer, trail-shadow, trail-casing,
  // trail-edges, flora-layer, territory, shadow, trunk, crown-lo, crown-hi, plate,
  // plate-bg, plate-id, plate-sub, hits-layer, hit, …  Each must produce
  // { kind: 'skipped', sceneKind } rather than throwing or silently disappearing.
  const descs = worldTo3D(buildScene(mkInput()));
  const skipped = descs.filter(asSkipped);
  assert.ok(skipped.length > 0, 'structural / non-core nodes must produce skipped descriptors');
  for (const s of skipped) {
    assert.equal(typeof s.sceneKind, 'string', 'each skipped descriptor carries the original SceneKind');
    assert.ok(s.sceneKind.length > 0, 'sceneKind is non-empty');
  }

  // A kind this mapper has never heard of (a FUTURE core addition) degrades to an
  // explicit named skip — the mapper may lag the core, never crash the site's 3D island.
  const novel: SceneG = {
    el: 'g',
    children: [{ el: 'g', children: [], kind: 'lava-flow' as SceneKind }],
  };
  const out = worldTo3D(novel);
  assert.deepEqual(
    out.filter(asSkipped).map((s) => s.sceneKind),
    ['lava-flow'],
    'the unknown kind is skipped BY NAME — visible in output, not silently dropped',
  );
});

test('r3f UAT-marker flowers (grounded-art inc 7): tall-flower markers add ZERO 3D instances and skip by name', () => {
  // A flat tall-flower marker does not translate to a real 3D scene, so the whole tall-flower family is
  // skipped here — like the standing-stones it replaced, this is a no-op for the island (only
  // tile/tree/trail/cave/wisp become instances). The UAT markers therefore cannot change the R3F island.
  const uatCriteria = [
    { id: 'a', state: 'proven' as const },
    { id: 'b', state: 'pending' as const },
    { id: 'c', state: 'failing' as const },
  ];
  const bare = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({})] })));
  const withFlowers = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({ uatCriteria })] })));

  // The 3D INSTANCE set is identical whether or not the island carries UAT-marker flowers.
  assert.deepEqual(withFlowers.filter(asInstance), bare.filter(asInstance));

  // And the flower family degrades to explicit NAMED skips (total coverage) — never a throw, never a
  // silent drop, never a stray instance. Both the wrapper and the body marks skip by name.
  const skips = withFlowers.filter(asSkipped).map((s) => s.sceneKind);
  assert.ok(skips.includes('tall-flower-proven'), 'the proven wrapper skips by name');
  assert.ok(skips.includes('tall-flower-petal'), 'a flower body mark skips by name');
});

test('r3f garden composition (grounded-art inc 11, ADR-0221): baked heroes + flat accents add ZERO 3D instances and skip by name', () => {
  // The cosy-island garden is studio-only + flag-only; the website never sends `garden`, so R3F never
  // sees it in production. This test asserts that IF it did, every garden node is a NAMED skip (never a
  // stray 3D instance): the heroes ride the ADR-0218 baked-art family R3F already skips, and the new flat
  // accent kinds (lavender/grass) auto-skip via the mapper's default — the coverage the plan's Unit 5 asks.
  const gHero = (height: number) => ({
    nodes: [{ el: 'polygon' as const, points: '0,0 5,0 0,-5', fill: '#cba', stroke: '#210', strokeWidth: 0.3 }],
    width: 10,
    height,
  });
  const garden = {
    islandId: 'library',
    heroes: { cottage: gHero(21.8), gazebo: gHero(15.4), 'autumn-tree': gHero(20.6), 'stepping-stone': gHero(6.3) },
  };
  const uatCriteria = [{ id: 'a', state: 'proven' as const }];
  const bare = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({ uatCriteria })] })));
  const withGarden = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({ uatCriteria })], garden })));

  const skips = withGarden.filter(asSkipped).map((s) => s.sceneKind);
  assert.ok(skips.includes('baked-art'), 'the baked hero + stone placements skip by name');
  assert.ok(skips.includes('baked-defs'), 'the baked-defs layer skips by name');
  assert.ok(skips.includes('garden-lavender-stem'), 'the lavender accent skips by name');
  assert.ok(skips.includes('garden-grass-blade'), 'the grass accent skips by name');
  assert.ok(skips.includes('tall-flower-proven'), 'the UAT daisy-bed flowers still skip by name');

  // no garden node became a real instance, and the hero tree REPLACES the procedural story-tree on the
  // garden island (a baked skip, not a story-tree), so the garden island has no story-tree instance.
  for (const d of withGarden.filter(asInstance)) {
    const kind = String(d.kind);
    assert.ok(!kind.startsWith('garden-') && kind !== 'baked-art', `${kind} must not be a 3D instance`);
  }
  assert.equal(
    withGarden.filter(asInstance).filter((d) => d.kind === 'story-tree').length,
    0,
    'the hero tree replaces the story-tree on the garden island',
  );
  assert.ok(bare.filter(asInstance).some((d) => d.kind === 'story-tree'), 'the default (no-garden) island keeps its story-tree');
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
  // Use a scene that exercises the core families (ground, tree, trail, wisp)
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
