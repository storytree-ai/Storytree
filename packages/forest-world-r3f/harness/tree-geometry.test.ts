// tree-geometry.test.ts — the hero story tree, read off the scene and grown as a solid.
//
// THE PROPERTY THAT MATTERS MOST IS THE ONE ABOUT AUTHORSHIP. The increment is explicit that
// nine versions of crown tuning are SPENT and that this work is compositing rather than
// authoring, so the assertions below are mostly about the tree being the SCENE'S: same lobe
// count, same centres, same radii, same jitter identity. A test that only checked "a tree came
// out" would pass over a generator that had quietly invented a nicer one.
//
// The second cluster is the pair of traps that produce plausible-looking wrong pictures on this
// island: the two foreshortenings (2.75x, silent) and a crown grown flat in z (a cardboard
// cut-out, which reads as an art choice rather than as a bug).

import assert from 'node:assert/strict';
import test from 'node:test';

import { islandScene } from './island-fixture.js';
import { SHARED_TOKENS, TREE_TOKENS, landTokens } from './palette-band.js';
import { treesFrom, type TreeInstance } from './tree-descriptors.js';
import { growTree, treeWorldHeight } from './tree-geometry.js';

const UPRIGHT = Math.cos((20 * Math.PI) / 180);
const GROUND = Math.sin((20 * Math.PI) / 180);

function theTree(): TreeInstance {
  const trees = treesFrom(islandScene({}));
  assert.equal(trees.length, 1, 'one hero tree per territory');
  return trees[0]!;
}

interface BoundsResult {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function bounds(positions: Float32Array): BoundsResult {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]!);
    maxX = Math.max(maxX, positions[i]!);
    minY = Math.min(minY, positions[i + 1]!);
    maxY = Math.max(maxY, positions[i + 1]!);
    minZ = Math.min(minZ, positions[i + 2]!);
    maxZ = Math.max(maxZ, positions[i + 2]!);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

test('the tree is the SCENE’S tree: its crown is read, never invented', () => {
  const tree = theTree();
  // `buildTree` authors five `crown-lo` blobs and three `crown-hi` ones. Both groups are grown,
  // because both carry real silhouette — see `TREE_TOKENS` for why only the lighter FILL is
  // dropped. If this number ever changes, the surface changed, and that is a `forest-world`
  // decision rather than a harness one.
  assert.equal(tree.lobes.length, 8, 'five crown-lo blobs and three crown-hi');
  assert.equal(tree.lobes.filter((l) => l.group === 'lo').length, 5);
  assert.equal(tree.lobes.filter((l) => l.group === 'hi').length, 3);
  for (const lobe of tree.lobes) {
    assert.ok(lobe.r > 0, 'a zero-radius blob is a read that failed');
    assert.ok(lobe.y < 0, 'the crown is above the planted base (SVG y runs down)');
  }
  assert.ok(tree.trunk, 'and a bole was read');
  assert.ok(
    tree.trunk!.baseHalfWidth > tree.trunk!.topHalfWidth,
    'the authored bole tapers — a trunk that widened toward the crown is a misread outline',
  );
  assert.ok(tree.trunk!.topY < 0, 'the crown sits above the ground');
  assert.equal(tree.status, 'healthy');
  assert.equal(tree.storyId, 'context-traversal-capture', 'the jitter identity is the story’s');
});

test('the tree stands at its own planted base, on the ground plane', () => {
  const tree = theTree();
  assert.equal(tree.transform.y, 0, 'planted, never floating half a crown up');
  assert.ok(tree.footprint.w > 0 && tree.footprint.h > 0);
  assert.ok(tree.marks > 0, 'the SVG surface’s own budget is reported, shadow included');
});

test('every colour the tree can emit is an AUTHORED palette token', () => {
  const authored = new Set(landTokens());
  const parts = growTree(theTree(), UPRIGHT);
  for (const token of parts.keys()) assert.ok(authored.has(token), `${token} is not authored`);
  assert.ok(parts.has(SHARED_TOKENS.storyTrunk), 'the bole wears the shared trunk token');
  assert.ok(parts.has(TREE_TOKENS.get('healthy')!.crown), 'a healthy crown wears healthy’s crown token');
});

test('the crown is ONE token — the highlight is said once, by the light', () => {
  // The SVG paints its three `crown-hi` blobs a lighter flat fill because a flat renderer has no
  // light. A live crown has one, and `LIGHT_DIR` comes from up-left-forward, which is where those
  // blobs already sit. Painting them lighter AS WELL would be the highlight said twice — and it
  // would put a palette entry on the island that means nothing.
  const parts = growTree(theTree(), UPRIGHT);
  assert.equal(parts.size, 2, 'a bole and a crown, and nothing else');
});

test('the CROWN IS A VOLUME — because the authored lobes are SPHERES, not discs', () => {
  // The claim this replaced was that eight circles in a plane must be a cardboard cut-out and
  // therefore need seeded depth offsets. It is false, and the render proved it false: a union of
  // SPHERES whose centres share a plane is already about as deep as it is wide, and the offsets
  // that were supposed to fix a non-existent problem dragged the crown's near side down over the
  // whole bole (see CROWN DEPTH in tree-geometry.ts). This asserts the property that was actually
  // true all along, so nobody re-derives the wrong premise from an untested picture.
  const tree = theTree();
  const crown = bounds(growTree(tree, UPRIGHT).get(TREE_TOKENS.get('healthy')!.crown)!.positions);
  const w = crown.maxX - crown.minX;
  const d = crown.maxZ - crown.minZ;
  assert.ok(d > w * 0.6, `the crown is only ${d.toFixed(1)} deep against ${w.toFixed(1)} wide`);
  // And it is depth the LOBES supply, not an offset: the crown's z extent is exactly twice the
  // widest lobe's radius, which is only true if every centre sits at z = 0.
  const widest = Math.max(...tree.lobes.map((l) => l.r));
  assert.ok(
    Math.abs(d - widest * 2) < 1e-3,
    `the crown's depth should be exactly 2x its widest lobe (${(widest * 2).toFixed(2)}), got ${d.toFixed(2)} ` +
      '— a centre has been pushed off the authored plane, which moves the crown on SCREEN too',
  );
});

test('the crown leaves the BOLE EXPOSED, as the authored crown does', () => {
  // The defect the withdrawn depth call produced, made falsifiable. At an elevation camera a lobe
  // pushed toward the viewer also moves DOWN the screen, so depth offsets big enough to matter
  // are depth offsets big enough to hide the trunk — and a hidden trunk is a floating balloon.
  const tree = theTree();
  const elev = (50 * Math.PI) / 180;
  // Screen height, relative to the tree's own ground contact: an upright travel foreshortens by
  // cos, a depth offset moves by -sin.
  const screen = (y: number, z: number): number => -z * Math.sin(elev) + y * Math.cos(elev);
  const crownFloor = Math.min(
    ...tree.lobes.map((l) => screen(-l.y / UPRIGHT - l.r, 0)),
  );
  assert.ok(
    crownFloor > 8,
    `the crown hangs to ${crownFloor.toFixed(1)} above the tree's ground contact — there is no bole left to see`,
  );
});

test('HEIGHTS recover through the UPRIGHT foreshortening, not the GROUND one', () => {
  // The same 2.75x trap the plants fell into, on the biggest object on the island — where getting
  // it wrong produces a tree that towers or squats and looks entirely deliberate.
  const tree = theTree();
  const right = treeWorldHeight(tree, UPRIGHT);
  const wrong = treeWorldHeight(tree, GROUND);
  // Near 2.75 rather than exactly it, and the gap is the POINT rather than slack: a crown blob's
  // RADIUS is a world radius that takes no correction, so it survives the swap unscaled and drags
  // the ratio a little below the pure figure. A helper that recovered the radius too would land
  // this at exactly 2.75 — which is how the bug this test caught used to look.
  const ratio = wrong / right;
  assert.ok(
    ratio > 2.2 && ratio < UPRIGHT / GROUND,
    `swapping the foreshortenings must change the tree by a bit under ${(UPRIGHT / GROUND).toFixed(2)}x, got ${ratio.toFixed(3)}x`,
  );
  // And the recovered height is TALLER than the drawn one, never shorter: an upright travel
  // foreshortens on the way out, so recovering it lengthens.
  assert.ok(right > -tree.trunk!.topY, 'recovering an upright travel LENGTHENS it');

  const parts = growTree(tree, UPRIGHT);
  const crown = bounds(parts.get(TREE_TOKENS.get('healthy')!.crown)!.positions);
  // 1e-4 rather than exact because the mesh is stored in Float32Array and 90 world units carries
  // about 1e-6 of representation error there. The claim is an identity, not an approximation:
  // the helper and the geometry must agree to storage precision, which is what makes the helper
  // safe to frame a camera on.
  assert.ok(
    Math.abs(crown.maxY - right) < 1e-4,
    `the grown crown reaches ${crown.maxY} but the helper reports ${right} — a camera framed on the helper would crop it`,
  );
});

test('the bole stands ON the ground and reaches the crown', () => {
  const tree = theTree();
  const parts = growTree(tree, UPRIGHT);
  const trunk = bounds(parts.get(SHARED_TOKENS.storyTrunk)!.positions);
  assert.ok(Math.abs(trunk.minY) < tree.trunk!.baseHalfWidth * 1.01, 'the bole starts at y = 0');
  // The lowest point any crown blob reaches: centre height (an upright travel, recovered) minus
  // its own radius (a world radius, untouched). The bole must pass that, or the crown floats.
  const crownFloor = Math.min(...tree.lobes.map((l) => -l.y / UPRIGHT - l.r));
  assert.ok(
    trunk.maxY > crownFloor,
    `the bole tops out at ${trunk.maxY.toFixed(1)} and the crown starts at ${crownFloor.toFixed(1)} — it floats`,
  );
});

test('DETERMINISM: the same tree grows the same solid, byte for byte', () => {
  // ADR-0380 D6 fence 2. The generator now holds no seeded draw at all — the withdrawn depth call
  // was the only one — so determinism is total rather than merely keyed. Two DIFFERENT stories
  // grow different trees because `buildTree` already jitters their crowns by story id upstream;
  // that variation is the surface's and this module neither adds to it nor flattens it.
  const tree = theTree();
  const a = growTree(tree, UPRIGHT);
  const b = growTree(tree, UPRIGHT);
  for (const [token, mesh] of a) {
    assert.deepEqual(Array.from(mesh.positions), Array.from(b.get(token)!.positions));
  }
  // The story ID is no longer an input to the geometry, and saying so here stops a later reader
  // assuming it still is.
  const renamed = growTree({ ...tree, storyId: 'some-other-story' }, UPRIGHT);
  assert.deepEqual(
    Array.from(a.get(TREE_TOKENS.get('healthy')!.crown)!.positions),
    Array.from(renamed.get(TREE_TOKENS.get('healthy')!.crown)!.positions),
  );
});

test('normals are unit length — the banded material’s rungs depend on it', () => {
  for (const [, mesh] of growTree(theTree(), UPRIGHT)) {
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const l = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
      assert.ok(Math.abs(l - 1) < 1e-4, `normal length ${l}`);
    }
  }
});

test('an island’s status picks the crown’s family, and an unknown status never throws', () => {
  const tree = theTree();
  for (const status of [...TREE_TOKENS.keys()]) {
    const parts = growTree({ ...tree, status }, UPRIGHT);
    assert.ok(parts.has(TREE_TOKENS.get(status)!.crown));
  }
  const odd = growTree({ ...tree, status: 'not-a-status' }, UPRIGHT);
  assert.ok(
    odd.has(TREE_TOKENS.get('unknown')!.crown),
    'an unrecognised status falls back to unknown rather than emitting an unauthored colour',
  );
});
