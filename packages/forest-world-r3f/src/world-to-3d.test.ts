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
  type SceneNode,
  type SceneStatus,
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
    groundRadius: 60,
    screenRadius: 60,
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

// ---------------------------------------------------------------------------
// The RELAXED-MESH ground — the substrate the studio actually ships
// ---------------------------------------------------------------------------
//
// ⚠ Between ADR-0123 and 2026-08-28 the mapper had a case for the classic `tile` hex only, so an
// island of the shape the product draws produced NO GROUND AT ALL — every parcel fell through to
// the default skip (`docs/research/chapter2-shipped-baseline-2026-08-28/`). These tests hold the
// `cell` case that closed it. They are hand-built scene fragments rather than a `buildScene`
// round trip on purpose: what has to be pinned is the mapper's reading of a SHAPE — a status
// stamped one level above its cells — and a fixture that happens to carry that shape today would
// stop testing it the day the core changed, silently.

/** A relaxed-mesh ground fragment: a `ground` group carrying the status, with plain `cell` paths
 *  under it carrying NONE — exactly what `scene.ts:3252` emits. */
function meshGround(
  rings: readonly (readonly (readonly [number, number])[])[],
  over: { status?: SceneStatus; kind?: SceneKind; transform?: string } = {},
): SceneG {
  const d = (r: readonly (readonly [number, number])[]) =>
    r.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
  const cells: SceneNode[] = rings.map((r) => ({ el: 'path', kind: over.kind ?? 'cell', d: d(r) }));
  // ANNOTATED local, then guarded assignments — the shape `anti-slop`'s
  // no-conditional-empty-object-spread and no-known-value-widening both want, and it keeps the
  // fixture a real `SceneG` rather than something asserted into one.
  const group: SceneG = { el: 'g', kind: 'ground', children: cells };
  if (over.status !== undefined) group.status = over.status;
  if (over.transform !== undefined) group.transform = over.transform;
  return group;
}

const UNIT_SQUARE = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
] as const;

test('worldTo3D maps relaxed-mesh cells to cell-ground descriptors — one per parcel', () => {
  const ds = worldTo3D(meshGround([UNIT_SQUARE, UNIT_SQUARE, UNIT_SQUARE], { status: 'healthy' }));
  const cells = ds.filter(asInstance).filter((d) => d.kind === 'cell-ground');
  assert.equal(cells.length, 3);
  for (const c of cells) {
    assert.equal(c.group, 'cell-ground', 'the instancing group names the family');
    assert.equal(c.material, 'healthy');
    assert.equal(c.points?.length, 4, 'the ring, each vertex once — polyPath closes with Z');
  }
  // No parcel is left as a skip.
  assert.equal(ds.filter(asSkipped).filter((s) => s.sceneKind === 'cell').length, 0);
});

test('a cell-wheat parcel is the SAME ground, not a third drawable', () => {
  // The classic case already folds its own `tile-top-wheat` into one `hex-ground`; folding here
  // keeps the two substrates telling the same story rather than inventing a family this surface
  // has no idea what to do with.
  const ds = worldTo3D(meshGround([UNIT_SQUARE], { status: 'mapped', kind: 'cell-wheat' }));
  const cells = ds.filter(asInstance).filter((d) => d.kind === 'cell-ground');
  assert.equal(cells.length, 1);
  assert.equal(cells[0]!.material, 'mapped');
  assert.equal(ds.filter(asSkipped).filter((s) => s.sceneKind === 'cell-wheat').length, 0);
});

test('⚠ a parcel INHERITS its territory status — reading the cell alone draws every parcel unknown', () => {
  // ⚠ THE LOAD-BEARING ONE. A plain relaxed `cell` carries NO status of its own; the core puts it
  // on the `<g kind="ground" status=…>` one level up. A mapper that read the cell would draw the
  // whole shipped map `unknown` — a map that has STOPPED REPORTING (ADR-0392 D5 / ADR-0398 D7),
  // not one that merely looks wrong.
  for (const status of ['healthy', 'unhealthy', 'proposed', 'mapped'] as const) {
    const cells = worldTo3D(meshGround([UNIT_SQUARE], { status }))
      .filter(asInstance)
      .filter((d) => d.kind === 'cell-ground');
    assert.equal(cells[0]!.material, status, `a parcel under a ${status} ground did not inherit it`);
  }
});

test('a cell’s OWN status wins over the inherited one — the parcels-present shape', () => {
  // `scene.ts:1718` stamps per-CAPABILITY status on each cell when parcels are present, which is
  // finer than the territory's and must not be overwritten by it.
  const scene: SceneG = {
    el: 'g',
    kind: 'ground',
    status: 'healthy',
    children: [
      { el: 'path', kind: 'cell', d: 'M 0.0 0.0 L 0.0 10.0 L 10.0 10.0 L 10.0 0.0 Z' },
      { el: 'path', kind: 'cell', status: 'unhealthy', d: 'M 0.0 0.0 L 0.0 10.0 L 10.0 10.0 L 10.0 0.0 Z' },
    ],
  };
  const materials = worldTo3D(scene)
    .filter(asInstance)
    .filter((d) => d.kind === 'cell-ground')
    .map((d) => d.material);
  assert.deepEqual(materials, ['healthy', 'unhealthy']);
});

test('a parcel with no status anywhere falls back to unknown, never to undefined', () => {
  const cells = worldTo3D(meshGround([UNIT_SQUARE]))
    .filter(asInstance)
    .filter((d) => d.kind === 'cell-ground');
  assert.equal(cells[0]!.material, 'unknown');
});

test('a parcel’s ring and centre carry the ancestor translate', () => {
  // ⚠ The ring is in the scene's own coordinates; an ancestor `<g translate(...)>` has to reach
  // it or the island draws in the wrong place — off-by-a-translate is invisible on a single
  // island and obvious the moment there are two.
  const ds = worldTo3D(meshGround([UNIT_SQUARE], { status: 'healthy', transform: 'translate(100 200)' }));
  const cell = ds.filter(asInstance).find((d) => d.kind === 'cell-ground')!;
  assert.deepEqual(
    cell.points?.map((p) => [p.x, p.y, p.z]),
    [
      [100, 0, 200],
      [100, 0, 210],
      [110, 0, 210],
      [110, 0, 200],
    ],
  );
  // The transform is the ring's centroid, on the ground plane.
  closeTo(cell.transform.x, 105, 'parcel centre x');
  closeTo(cell.transform.y, 0, 'a parcel sits on the ground plane');
  closeTo(cell.transform.z, 205, 'parcel centre z');
});

test('a ring bounding no area is SKIPPED, not emitted as a degenerate parcel', () => {
  // ⚠ Two vertices bound no area. Emitting one would put a parcel in the drawable set that no
  // consumer can build a face from; skipping it keeps `cell-ground` a family whose members are
  // always drawable, and the skip is still an audit record rather than a silent drop.
  const ds = worldTo3D(
    meshGround(
      [
        [
          [0, 0],
          [10, 10],
        ],
        UNIT_SQUARE,
      ],
      { status: 'healthy' },
    ),
  );
  assert.equal(ds.filter(asInstance).filter((d) => d.kind === 'cell-ground').length, 1);
  const skips = ds.filter(asSkipped).filter((s) => s.sceneKind === 'cell');
  assert.equal(skips.length, 1, 'the degenerate parcel must still be recorded as a skip');
});

test('the classic hex substrate is UNAFFECTED — the cell case ADDED a representation', () => {
  // Without this the tests above are satisfied by a mapper re-pointed from `tile` to `cell`,
  // which is the same defect facing the other way.
  const ds = worldTo3D(buildScene(mkInput()));
  assert.ok(ds.filter(asInstance).filter((d) => d.kind === 'hex-ground').length > 0);
  assert.equal(ds.filter(asInstance).filter((d) => d.kind === 'cell-ground').length, 0);
});

test('a TRIANGULAR parcel is drawn — three vertices bound an area', () => {
  // ⚠ The degeneracy guard is `< 3`, and `<= 3` would throw away every triangular parcel while
  // still passing every test built on quads. The relaxed mesh gives quads today, but a parcel
  // clipped against an island boundary is not obliged to keep four corners.
  const ds = worldTo3D(
    meshGround(
      [
        [
          [0, 0],
          [10, 0],
          [5, 8],
        ],
      ],
      { status: 'healthy' },
    ),
  );
  const cells = ds.filter(asInstance).filter((d) => d.kind === 'cell-ground');
  assert.equal(cells.length, 1, 'a triangular parcel was dropped');
  assert.equal(cells[0]!.points?.length, 3);
});

test('a non-cell leaf NEVER becomes a parcel — the guard is on the kind, not on being a path', () => {
  // ⚠ Widen that guard and every kinded leaf in the scene turns into ground: the classic tile's
  // own `tile-top` and `tile-side` paths are the ones immediately in reach, so a whole hex island
  // would draw twice, once as prisms and once as flat parcels.
  const scene: SceneG = {
    el: 'g',
    kind: 'ground',
    status: 'healthy',
    children: [
      { el: 'path', kind: 'tile-side', d: 'M 0.0 0.0 L 0.0 10.0 L 10.0 10.0 L 10.0 0.0 Z' },
      { el: 'path', kind: 'parcel-blade', d: 'M 0.0 0.0 L 0.0 10.0 L 10.0 10.0 Z' },
      // ⚠ A `cell` KIND on a non-path element — the guard is on both, and this is the arm that
      // says so.
      { el: 'circle', kind: 'cell', cx: 0, cy: 0, r: 5 },
    ],
  };
  const ds = worldTo3D(scene);
  assert.equal(ds.filter(asInstance).filter((d) => d.kind === 'cell-ground').length, 0);
  // They are still recorded as skips — total coverage, never a silent drop. (The enclosing
  // `ground` group is kinded too, so it contributes a fourth skip of its own.)
  const skipped = ds.filter(asSkipped).map((s) => s.sceneKind).sort();
  assert.deepEqual(skipped, ['cell', 'ground', 'parcel-blade', 'tile-side']);
});

test('every status-bearing family falls back to `unknown` when nothing above it carries a status', () => {
  // ⚠ Each family writes its own `status ?? 'unknown'`, so each is its own chance to fall back to
  // the empty string — a material no palette has an entry for, which draws as whatever the
  // canvas's own default happens to be rather than as an honest "this asserts nothing".
  const noStatus: SceneTerritoryInput = mkTerritory();
  delete (noStatus as Partial<SceneTerritoryInput>).status;
  const statusless = buildScene(mkInput({ territories: [noStatus] }));
  for (const d of worldTo3D(statusless).filter(asInstance)) {
    if (d.material === undefined) continue;
    assert.notEqual(d.material, '', `${d.kind} fell back to the empty string`);
    assert.equal(typeof d.material, 'string');
  }
  const parcels = worldTo3D(meshGround([UNIT_SQUARE])).filter(asInstance);
  assert.equal(parcels[0]!.material, 'unknown');
});

test('a status-bearing family reports ITS OWN status, never a constant', () => {
  // ⚠ `status ?? 'unknown'` mutated to `status && 'unknown'` reads identically until a status IS
  // present — and then every family on the map reports `unknown` while the code still looks like
  // it consults the status. That is the map lying, which ADR-0392 D5 / ADR-0398 D7 put beyond an
  // art call, so it is asserted per family rather than once.
  for (const status of ['healthy', 'unhealthy', 'mapped'] as const) {
    const ds = worldTo3D(buildScene(mkInput({ territories: [mkTerritory({ status })] })));
    const bearing = ds.filter(asInstance).filter((d) => d.material !== undefined);
    assert.ok(bearing.length > 0, 'no status-bearing family in the scene');
    for (const d of bearing) {
      assert.equal(d.material, status, `${d.kind} did not report the territory's own status`);
    }
    const parcel = worldTo3D(meshGround([UNIT_SQUARE], { status })).filter(asInstance)[0]!;
    assert.equal(parcel.material, status, 'a parcel did not report its own status');
  }
});

test('a CAVE PORTAL reports its island’s status too, and falls back to unknown without one', () => {
  // ⚠ The cave arch writes its own `status ?? 'unknown'`, and the existing portal test only ever
  // exercises the fallback (its fixture has no territory for the island). So the ?? has never had
  // a status to prefer, and `status && 'unknown'` — which makes every portal report `unknown`
  // whatever the island holds — reads identically on that fixture.
  const walled = mkInput({ trails: CAVE_TRAILS });
  assert.ok(CAVE_TRAILS.caves.length > 0, 'the walled-in fixture forces cave portals');
  for (const status of ['healthy', 'unhealthy'] as const) {
    const withTerritory = mkInput({
      ...walled,
      territories: [mkTerritory({ id: CAVE_TRAILS.caves[0]!.islandId, status })],
    });
    const arches = worldTo3D(buildScene(withTerritory)).filter(asInstance).filter((d) => d.kind === 'cave-arch');
    assert.ok(arches.length > 0, 'no portal in the scene');
    const own = arches.filter((a) => a.island === CAVE_TRAILS.caves[0]!.islandId);
    assert.ok(own.length > 0, 'the portal on the territory we gave a status is missing');
    for (const a of own) assert.equal(a.material, status, 'a portal did not report its island status');
  }
});

test('a cave portal with NO status ANYWHERE above it falls back to `unknown`', () => {
  // ⚠ THE EXISTING PORTAL TEST NO LONGER REACHES THIS, and the mutation sweep is what said so.
  // Its fixture has no territory for the island, so the portal used to see `undefined` — but
  // since parcels made the walk inherit an ancestor's status, the portal now inherits `unknown`
  // from a group above it and the `?? 'unknown'` literal is never evaluated. It still asserts
  // `unknown` and still passes, while testing a different thing than it used to. The fallback
  // needs a scene with no status anywhere in the ancestry to be exercised at all.
  const scene: SceneG = {
    el: 'g',
    children: [
      {
        el: 'g',
        kind: 'cave',
        transform: 'translate(10 20) rotate(0)',
        children: [{ el: 'path', kind: 'cave-arch', d: 'M 0 -8 A 8 8 0 0 1 0 8' }],
      },
    ],
  };
  const arches = worldTo3D(scene).filter(asInstance).filter((d) => d.kind === 'cave-arch');
  assert.equal(arches.length, 1);
  assert.equal(arches[0]!.material, 'unknown', 'the portal fell back to something other than unknown');
});
