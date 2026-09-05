// ground-casters.test.ts — what stands on the shipped map, and how big the shadow of it is.
//
// THE TEST THIS FILE IS REALLY FOR is `a wisp casts nothing`. The rest is dimension arithmetic; a
// wisp is the LIVE-WORK signal (ADR-0200 / ADR-0142), so a wisp that cast a shadow would make the
// LAND appear to change every time a session claimed or released a capability — the land asserting
// something about work that never touched it, which is the one direction this surface may not be
// wrong in (ADR-0392 D5 / ADR-0398 D7).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  caveArchCaster,
  caveMouthHalfWidth,
  groundBounds,
  groundCasters,
  placementCaster,
  placementCasters,
} from './ground-casters.js';
import { KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29, type KitPlacement } from './kit-vocabulary.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

const at = (kind: InstanceDescriptor['kind'], x: number, z: number): InstanceDescriptor => ({
  kind,
  transform: { x, y: 0, z },
  group: kind,
});

// ⚠⚠ THREE STORY-TREE TESTS WERE DELETED HERE (ADR-0508), AND THEY ARE NOT REPLACED BY WEAKER
// ONES. They pinned `STORY_TREE_TRUNK` / `STORY_TREE_CROWN` against the mesh, `storyTreeTop()` at
// 19 units, and `storyTreeCaster` to the crown's cylinder at the descriptor's own ground point.
// All four symbols are gone: `world-to-3d.ts` no longer emits a `story-tree` descriptor, so a test
// of a caster derived from one would construct a subject the map cannot produce, and pass forever
// over nothing. What the retirement is proved by instead is the mapper (`world-to-3d.test.ts`: a
// `tree` node yields a SKIP and no instance), the shipped island end to end
// (`harness/shipped-land-scene.test.ts`: the descriptor stream now casts nothing at all), and the
// shipped canvas's own source (`harness/shipped-baseline.test.ts`: no `<StoryTree>` is mounted).

test('the cave portal’s radius is the 2D prop’s own mouth rule', () => {
  const cave: InstanceDescriptor = { ...at('cave-arch', 5, 5), width: 4 };
  assert.equal(caveMouthHalfWidth(cave), 3.2);
  assert.deepEqual(caveArchCaster(cave), { x: 5, z: 5, radius: 3.2, height: 3.2 });
  // A wider mouth is a bigger occluder, and an ABSENT width takes the same default the mesh does.
  const wide: InstanceDescriptor = { ...at('cave-arch', 0, 0), width: 8 };
  assert.equal(caveMouthHalfWidth(wide), 6.4);
  assert.equal(caveMouthHalfWidth(at('cave-arch', 0, 0)), 3.2);
});

test('THE RULE: a wisp casts nothing, and neither does a trail', () => {
  // `uat-bloom` stands in for the retired classic `hex-ground` as the second non-casting ground
  // reading — `retire-the-old-land-path` dropped `hex-ground` from `InstanceKind` entirely, so a
  // literal of that kind no longer typechecks. The `story-tree` that used to open this set went
  // the same way (ADR-0508) and the CAVE now carries the "something does cast" half.
  const casters = groundCasters([
    { ...at('cave-arch', 0, 0), width: 4 },
    at('wisp-sprite', 10, 10),
    at('trail-strip', 20, 20),
    at('cell-ground', 30, 30),
    at('uat-bloom', 40, 40),
    { kind: 'skipped', sceneKind: 'parcel-blade' },
  ]);
  assert.equal(casters.length, 1);
  assert.equal(casters[0]!.x, 0);
});

test('portals cast, in descriptor order, and every OTHER family is passed over', () => {
  // ⚠ NON-VACUITY ON A ONE-CASE LOOP. `groundCasters` now has a single `if`, so a filter that
  // simply returned everything would still put a caster at 1 and at 3 — the interleaved
  // non-casting families are what separates the real rule from that, and the ORDER is what
  // separates it from a collect-then-sort.
  const casters = groundCasters([
    at('cell-ground', 1, 1),
    { ...at('cave-arch', 2, 2), width: 4 },
    at('uat-bloom', 3, 3),
    { ...at('cave-arch', 4, 4), width: 8 },
  ]);
  assert.deepEqual(
    casters.map((c) => [c.x, c.radius]),
    [
      [2, 3.2],
      [4, 6.4],
    ],
  );
});

test('a descriptor set with nothing standing on it yields no casters, not a fake one', () => {
  assert.deepEqual(groundCasters([]), []);
  assert.deepEqual(groundCasters([at('cell-ground', 0, 0)]), []);
});

test('the ground bounds are the parcels’ own ring extent', () => {
  const cells: InstanceDescriptor[] = [
    { ...at('cell-ground', 0, 0), points: [{ x: -5, y: 0, z: -3 }, { x: 4, y: 0, z: 2 }] },
    { ...at('cell-ground', 0, 0), points: [{ x: 9, y: 0, z: -8 }, { x: 1, y: 0, z: 6 }] },
  ];
  assert.deepEqual(groundBounds(cells), { minX: -5, maxX: 9, minZ: -8, maxZ: 6 });
});

test('bounds over nothing are NULL rather than a degenerate rect', () => {
  // A degenerate rect is the shape that reads as "the shadow just is not showing": a one-texel
  // field every fragment then samples. The caller has to decide not to build one.
  assert.equal(groundBounds([]), null);
  assert.equal(groundBounds([at('cell-ground', 0, 0)]), null, 'a parcel with no ring bounds nothing');
  // But a single ring IS bounds, even a degenerate one — that is a real parcel, not an absent set.
  const one: InstanceDescriptor = { ...at('cell-ground', 0, 0), points: [{ x: 2, y: 0, z: 3 }] };
  assert.deepEqual(groundBounds([one]), { minX: 2, maxX: 2, minZ: 3, maxZ: 3 });
});

test('a mixed descriptor set is read for parcels only when bounding the ground', () => {
  const mixed: Descriptor3D[] = [
    at('cave-arch', 500, 500),
    { ...at('cell-ground', 0, 0), points: [{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }] },
  ];
  const cells = mixed.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  assert.deepEqual(groundBounds(cells), { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
});

test('a parcel with NO RING is skipped rather than poisoning the bounds of the ones that have one', () => {
  // ⚠ THE MUTANT THIS EXISTS FOR replaces the `?? []` fallback with a one-element array of
  // rubbish. Asked only about a set of pointless cells, that mutant returns `null` exactly as the
  // real code does — because rubbish has no `.x` and every bound comes out NaN. It separates only
  // when a REAL parcel is in the same set: the real code returns that parcel's rect, the mutant
  // returns null, and an island would render with no shadow field at all.
  const real: InstanceDescriptor = {
    ...at('cell-ground', 0, 0),
    points: [
      { x: -4, y: 0, z: -2 },
      { x: 6, y: 0, z: 3 },
    ],
  };
  const pointless = at('cell-ground', 99, 99);
  assert.deepEqual(groundBounds([pointless, real]), { minX: -4, maxX: 6, minZ: -2, maxZ: 3 });
  assert.deepEqual(groundBounds([real, pointless]), { minX: -4, maxX: 6, minZ: -2, maxZ: 3 });
});

// ---------------------------------------------------------------------------
// the kit's placements, as occluders (2026-09-03)
// ---------------------------------------------------------------------------

const FOOT = KIT_FOOTPRINTS_2026_08_29;
const HEIGHTS = KIT_HEIGHTS_2026_08_29;

const placed = (role: KitPlacement['role'], x: number, z: number, scale: number): KitPlacement => ({
  role,
  assembly: role === 'bloom' ? 'flower' : role === 'deadTree' ? 'pine-dead' : 'pine-a',
  capId: 'cap-0',
  tint: null,
  at: { x, z },
  // ⚠ A NON-ZERO y, which the caster must NOT read: its height is measured from the land at its
  // own foot, and the placement's y already IS that land.
  y: 4.5,
  yaw: 1,
  scale,
});

test('a placement casts a cylinder of its role’s half-footprint and height, at its own point', () => {
  assert.deepEqual(placementCaster(placed('tree', 30, -6, 1), FOOT, HEIGHTS), {
    x: 30,
    z: -6,
    radius: FOOT.tree / 2,
    height: HEIGHTS.tree,
  });
  assert.deepEqual(placementCaster(placed('deadTree', 1, 2, 1), FOOT, HEIGHTS), {
    x: 1,
    z: 2,
    radius: FOOT.deadTree / 2,
    height: HEIGHTS.deadTree,
  });
  assert.deepEqual(placementCaster(placed('bloom', 1, 2, 1), FOOT, HEIGHTS), {
    x: 1,
    z: 2,
    radius: FOOT.bloom / 2,
    height: HEIGHTS.bloom,
  });
});

test('the placement’s scale reaches BOTH the radius and the height of its caster', () => {
  // ⚠ The kit scales uniformly, so a placement at 0.6 is 0.6 as wide as it is tall. A caster
  // that scaled one and not the other would throw a shadow the wrong size for its crown. (No
  // shipped `tree` stands below 1 since ADR-0518; the arithmetic still has to hold for any scale.)
  const half = placementCaster(placed('tree', 0, 0, 0.5), FOOT, HEIGHTS);
  assert.equal(half.radius, FOOT.tree / 4);
  assert.equal(half.height, HEIGHTS.tree / 2);
  const scaled = placementCaster(placed('tree', 0, 0, 0.6), FOOT, HEIGHTS);
  assert.ok(Math.abs(scaled.radius - (FOOT.tree / 2) * 0.6) < 1e-12);
  assert.ok(Math.abs(scaled.height - 18 * 0.6) < 1e-12);
});

test('every SCENE placement casts, in placement order, and none is dropped', () => {
  const list = [placed('tree', 1, 1, 1), placed('bloom', 2, 2, 1), placed('tree', 3, 3, 0.7)];
  const casters = placementCasters(list, FOOT, HEIGHTS);
  assert.equal(casters.length, list.length);
  assert.deepEqual(
    casters,
    list.map((p) => placementCaster(p, FOOT, HEIGHTS)),
  );
  assert.deepEqual(casters.map((c) => c.x), [1, 2, 3]);
  assert.deepEqual(placementCasters([], FOOT, HEIGHTS), []);
});

test('⚠⚠ GROUND COVER CASTS NOTHING — the dressing roles are dropped, and the scene roles beside them are not', () => {
  // The decision `cover-dressing.ts`'s header argues, asserted at the line that enforces it. Two
  // halves, and BOTH have to be here: a list of cover alone would pass on a function that dropped
  // everything, and a list of scene props alone would pass on one that dropped nothing.
  const scene = [placed('tree', 1, 1, 1), placed('bloom', 2, 2, 1)];
  const cover = [placed('bush', 3, 3, 4.5), placed('tuft', 4, 4, 4.5), placed('flowerPatch', 5, 5, 4.5)];
  const mixed = [scene[0]!, cover[0]!, scene[1]!, cover[1]!, cover[2]!];

  assert.deepEqual(placementCasters(cover, FOOT, HEIGHTS), [], 'ground cover cast a shadow');
  assert.equal(placementCasters(scene, FOOT, HEIGHTS).length, 2, 'a scene prop stopped casting');
  // ⚠ AND THE ORDER OF THE SURVIVORS IS THE SCENE PROPS' OWN — a drop that reordered the list
  // would put a shadow under the wrong tree, which is a defect no count can see.
  assert.deepEqual(
    placementCasters(mixed, FOOT, HEIGHTS),
    scene.map((p) => placementCaster(p, FOOT, HEIGHTS)),
  );

  // ⚠ IT IS A ROLE-CLASS TEST AND NOT A SIZE ONE. A threshold on the footprint would drop the
  // BLOOM (4 units) while keeping a boldest-rung BUSH (1.05 x 4.5 = 4.7 units) — the exact
  // inversion of what is wanted. Asserted by putting the two on either side of that number.
  const bigBush = placed('bush', 9, 9, 4.5);
  const bloom = placed('bloom', 8, 8, 1);
  assert.ok(
    FOOT.bush * bigBush.scale > FOOT.bloom * bloom.scale,
    'the fixture no longer separates the class test from a size test',
  );
  assert.deepEqual(placementCasters([bigBush, bloom], FOOT, HEIGHTS), [placementCaster(bloom, FOOT, HEIGHTS)]);
});
