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
  STORY_TREE_CROWN,
  STORY_TREE_TRUNK,
  caveArchCaster,
  caveMouthHalfWidth,
  groundBounds,
  groundCasters,
  storyTreeCaster,
  storyTreeTop,
} from './ground-casters.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

const at = (kind: InstanceDescriptor['kind'], x: number, z: number): InstanceDescriptor => ({
  kind,
  transform: { x, y: 0, z },
  group: kind,
});

test('the tree’s dimensions are the MESH’s own, so a caster cannot outgrow its object', () => {
  // `ForestWorldCanvas`'s `StoryTree` builds its cylinder and cone from these very constants. A
  // tree that grew and a shadow that did not would read as a rendering bug.
  assert.deepEqual({ ...STORY_TREE_TRUNK }, { radiusTop: 1.2, radiusBottom: 1.6, height: 8 });
  assert.deepEqual({ ...STORY_TREE_CROWN }, { radius: 7, height: 14, segments: 8, centreY: 12 });
});

test('the tree reaches 19 units — the crown’s TIP, not its centre and not the trunk', () => {
  assert.equal(storyTreeTop(), 19);
  assert.equal(storyTreeTop(), STORY_TREE_CROWN.centreY + STORY_TREE_CROWN.height / 2);
  assert.ok(storyTreeTop() > STORY_TREE_TRUNK.height, 'the crown is what reaches, not the trunk');
});

test('the story tree becomes the CROWN’s cylinder, standing at the descriptor’s own ground point', () => {
  const caster = storyTreeCaster(at('story-tree', 30, -6));
  assert.deepEqual(caster, { x: 30, z: -6, radius: 7, height: 19 });
  // Its y is deliberately not read: the caster's height is measured from the land at its own foot,
  // and the descriptor's y is already that land.
});

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
  const casters = groundCasters([
    at('story-tree', 0, 0),
    at('wisp-sprite', 10, 10),
    at('trail-strip', 20, 20),
    at('cell-ground', 30, 30),
    at('hex-ground', 40, 40),
    { kind: 'skipped', sceneKind: 'parcel-blade' },
  ]);
  assert.equal(casters.length, 1);
  assert.equal(casters[0]!.x, 0);
});

test('trees and portals both cast, in descriptor order', () => {
  const casters = groundCasters([
    at('story-tree', 1, 1),
    { ...at('cave-arch', 2, 2), width: 4 },
    at('story-tree', 3, 3),
  ]);
  assert.deepEqual(
    casters.map((c) => [c.x, c.radius]),
    [
      [1, 7],
      [2, 3.2],
      [3, 7],
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
    at('story-tree', 500, 500),
    { ...at('cell-ground', 0, 0), points: [{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }] },
  ];
  const cells = mixed.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');
  assert.deepEqual(groundBounds(cells), { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
});
