// pine-asset.test.ts — the comparison's arithmetic, and the refusals that keep it a comparison.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANOPY_TREE_HEIGHT,
  EXPECTED_DRAW_CALLS,
  GROUND_SPAN,
  PINE_VARIANTS,
  RENDER_ELEV_DEG,
  TREE_GROUND_POINTS,
  ZOOMS,
  deliveredTreeExtentPx,
  gltfScale,
  proceduralScale,
  referenceTree,
  sceneUpright,
} from './pine-asset.js';
import { treeWorldHeight } from './tree-geometry.js';

test('the fixture really does carry a hero tree to compare against', () => {
  const tree = referenceTree();
  assert.equal(tree.kind, 'tree-instance');
  assert.ok(tree.lobes.length > 0, 'a tree with no crown is not a tree');
  assert.ok(tree.trunk, 'a tree with no bole is not a tree');
});

test('the grown tree is scaled DOWN to canopy size, and by a factor worth stating', () => {
  const grown = treeWorldHeight(referenceTree(), sceneUpright());
  // The hero tree is roughly three times a canopy tree, which is why it cannot be the stand.
  assert.ok(grown > CANOPY_TREE_HEIGHT * 2, `the hero tree is only ${grown.toFixed(1)} units tall`);
  assert.ok(Math.abs(proceduralScale() * grown - CANOPY_TREE_HEIGHT) < 1e-9);
});

test('the glTF is scaled to the SAME height, which is what makes the arms differ in one thing', () => {
  // The committed asset's bounding box is 4.004 Blender units tall (`bbox.mjs`, 2026-08-28).
  const assetHeight = 4.004;
  assert.ok(Math.abs(gltfScale(assetHeight) * assetHeight - CANOPY_TREE_HEIGHT) < 1e-9);
  // ...and the two scale factors are wildly different numbers reaching the same height, which
  // is exactly the confusion this function exists to remove.
  assert.notEqual(Math.round(gltfScale(assetHeight)), Math.round(proceduralScale()));
});

test('a height that cannot be scaled is refused rather than silently producing a zero-size tree', () => {
  assert.throws(() => gltfScale(0), /no height/);
  assert.throws(() => gltfScale(-1), /no height/);
});

test('every tree arm is allowed the same number of draw calls', () => {
  // The renderer is measured draw-call bound, so an arm with more calls would be measured as
  // more expensive for a reason unrelated to being textured.
  assert.equal(EXPECTED_DRAW_CALLS.procedural, EXPECTED_DRAW_CALLS.gltf);
  assert.equal(EXPECTED_DRAW_CALLS['gltf-untextured'], EXPECTED_DRAW_CALLS.gltf);
  assert.ok(EXPECTED_DRAW_CALLS.bare < EXPECTED_DRAW_CALLS.procedural, 'the control must be cheaper');
  for (const v of PINE_VARIANTS) {
    assert.ok(EXPECTED_DRAW_CALLS[v] >= 1, `${v} must draw something`);
  }
  // Every arm must be in the manifest and every manifest entry an arm — a variant the driver
  // can ask for but the manifest does not name would be measured with no expectation at all.
  assert.deepEqual([...PINE_VARIANTS].sort(), Object.keys(EXPECTED_DRAW_CALLS).sort());
});

test('the texture check has a control that is the asset itself, not the banded arm', () => {
  // A surviving mutation is why: stripping every map still beat the BANDED arm's colour count,
  // because a standard material shading curved geometry is continuous with or without a texture.
  assert.ok(PINE_VARIANTS.includes('gltf-untextured'), 'the texture check has no control');
});

test('the trees are authored, distinct, and inside the ground they stand on', () => {
  const half = GROUND_SPAN / 2;
  const seen = new Set<string>();
  for (const [x, z] of TREE_GROUND_POINTS) {
    assert.ok(Math.abs(x) < half - CANOPY_TREE_HEIGHT, `tree at x=${x} hangs off the ground`);
    assert.ok(Math.abs(z) < half - CANOPY_TREE_HEIGHT, `tree at z=${z} hangs off the ground`);
    seen.add(`${x},${z}`);
  }
  assert.equal(seen.size, TREE_GROUND_POINTS.length, 'two trees share a point');
  assert.equal(TREE_GROUND_POINTS.length, 9);
});

test('the delivered extent is the number the texture rung is read against, and it moves with zoom', () => {
  const [overview, zoomed] = ZOOMS;
  assert.ok(overview !== undefined && zoomed !== undefined);
  const small = deliveredTreeExtentPx(overview);
  const large = deliveredTreeExtentPx(zoomed);
  assert.ok(Math.abs(large / small - zoomed / overview) < 1e-9, 'extent must be linear in zoom');
  // Foreshortened by cos(50 degrees) — a tree is an upright travel, and using the ground's
  // sin() here instead is the silent 2.75x error `IslandView` already paid for once.
  const expected = CANOPY_TREE_HEIGHT * Math.cos((RENDER_ELEV_DEG * Math.PI) / 180) * overview;
  assert.ok(Math.abs(small - expected) < 1e-9);
  assert.ok(small < CANOPY_TREE_HEIGHT * overview, 'an upright travel must be foreshortened, not full height');
});
