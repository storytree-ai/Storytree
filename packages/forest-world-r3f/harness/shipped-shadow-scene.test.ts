// shipped-shadow-scene.test.ts — the remedy comparison's own arithmetic, without a GPU.
//
// ⚠ EVERY CLAIM HERE IS ABOUT THE PLAN, NEVER ABOUT A FIELD, and that is a mutation-rung
// requirement rather than a shortcut. `check:mutation-diff` runs the covering tests ONCE PER
// MUTANT against a per-mutant timeout and scores a timeout as UNPROVEN in the same words an
// attribution gap produces — and the `raised` arm allocates 72 MB three times over to build one
// field. `shadowPlan` is pure arithmetic on bounds and a packing, which is what the whole
// comparison actually reports, so it is both the cheap witness and the right one.
//
// ⚠ AND THE PREMISE IS TESTED, NOT ASSUMED. The first test below is that the control really is
// clamped at forest scale and really is not at one island. Without it every "the remedy delivers
// the authored resolution" assertion under it is satisfied by a map that never had the defect.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SHADOW_GRES, SHADOW_TEXTURE_MAX } from '../src/land-shadow.js';
import { islandGroundBounds, packShadowAtlas } from '../src/shadow-atlas.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { landRelief } from '../src/land-relief.js';
import {
  CLOSE_ZOOM,
  POOL_GROUND_WIDTH,
  RAISED_TEXTURE_MAX,
  SHADOW_ARMS,
  SHADOW_ARM_CAPTION,
  SHADOW_SIZES,
  SHADOW_ZOOMS,
  castersWithin,
  cellsByIsland,
  groundVertices,
  shadowPlan,
  type ShadowArm,
} from './shipped-shadow-scene.js';
import { crowdCasters, crowdCells, crowdSize } from './shipped-crowd-scene.js';
import { SHIPPED_GROVE_ARM, armCasters } from './shipped-canopy-scene.js';
import { linearColourOf } from './shipped-land-scene.js';

const FOREST = crowdSize('forest');
const ONE = crowdSize('one');

/** ⚠ MEMOISED. `crowdCells(FOREST)` copies 164 parcels and their rings thirty-five times; called
 *  once per assertion it turns this file into the slow suite the header warns about. */
const forestCells: InstanceDescriptor[] = crowdCells(FOREST);
const oneCells: InstanceDescriptor[] = crowdCells(ONE);

/** The forest's triangle count, built ONCE. Only the atlas arm's vertex cost needs it, and the
 *  number has to be the real one or that cost is a guess. */
const forestTriangles: number = cellGroundGeometry({
  cells: forestCells,
  resolve: linearColourOf,
  relief: landRelief,
}).triangles;

const plan = (arm: ShadowArm, cells: readonly InstanceDescriptor[], triangles = 0): ReturnType<typeof shadowPlan> =>
  shadowPlan(arm, cells, triangles);

test('⚠⚠ THE PREMISE: the control IS clamped on a forest and is NOT on one island', () => {
  // Without this, every "the remedy restores the resolution" assertion below is satisfied by a
  // map that never lost it. The defect is the whole reason the increment exists, so it is the
  // first thing measured rather than the thing assumed.
  const forest = plan('clamped', forestCells);
  const one = plan('clamped', oneCells);
  assert.equal(one.gres, SHADOW_GRES, 'one island already gets the authored resolution');
  assert.ok(forest.gres < SHADOW_GRES, `the forest must be clamped, got ${forest.gres}`);
  // And by roughly the factor the increment recorded, so a change in the crowd's own layout that
  // quietly shrank the forest would show up here rather than as a comparison of nothing.
  const coarser = SHADOW_GRES / forest.gres;
  assert.ok(coarser > 4, `the clamp must actually bite: only ${coarser.toFixed(2)}x coarser`);
  assert.equal(forest.widestEdge, SHADOW_TEXTURE_MAX, 'the clamp is the texture cap, in terms');
});

test('EVERY remedy delivers the AUTHORED resolution on the forest', () => {
  for (const arm of SHADOW_ARMS) {
    if (arm === 'clamped') continue;
    assert.equal(
      plan(arm, forestCells, forestTriangles).gres,
      SHADOW_GRES,
      `${arm} must restore the authored resolution`,
    );
  }
});

test('⚠⚠ THE MEMORY, AND THE EXPECTATION IT REFUTES', () => {
  // ⚠ THE OBVIOUS GUESS IS WRONG AND WAS CAUGHT HERE. "The atlas leaves out the sea, so it must
  // cost less than the map already spends" is false: the map already spends little BECAUSE it is
  // coarse. The honest comparison is at EQUAL RESOLUTION, and there the atlas is 7.4x cheaper than
  // raising the cap. Against today's clamped field it is a modest multiple for 5x the resolution.
  //
  // ⚠ RE-MEASURED 2026-09-05 ON THE TRUE FOOTPRINT (ADR-0517 D1) and corrected in place. Every
  // island's land is 2.92x what the squashed ribbon held, and the atlas allocates LAND at the
  // authored resolution, so it grew with it: 10.4 MB against the clamped field's 2.7 MB (3.85x,
  // was under 2x) for 5.3x the resolution; raising the cap now asks for a 10,908-texel edge and
  // 76.9 MB, so the atlas is 7.4x under it (was 19x). The ORDER of the three arms is unchanged
  // and so is the decision; the margins are what the footprint moved.
  const clamped = plan('clamped', forestCells);
  const raised = plan('raised', forestCells);
  const atlas = plan('atlas', forestCells, forestTriangles);
  const perIsland = plan('per-island', forestCells);

  // A: the cap was written to refuse exactly this, and the arm is what says so as a number.
  assert.ok(
    raised.textureBytes > clamped.textureBytes * 20,
    `raised is only ${(raised.textureBytes / clamped.textureBytes).toFixed(1)}x clamped`,
  );
  // B and C allocate the SAME LAND at the SAME resolution, so their texture cost is the same to
  // within the packing's waste — which is what makes the fork between them about the draw call
  // rather than about memory.
  const spread = Math.abs(atlas.textureBytes - perIsland.textureBytes) / perIsland.textureBytes;
  assert.ok(spread < 0.1, `atlas and per-island differ by ${(spread * 100).toFixed(1)}% of texture`);
  // And both are several times under A (an order of magnitude on the ribbon; 7.4x on the true footprint).
  assert.ok(atlas.textureBytes < raised.textureBytes / 5);
  assert.ok(perIsland.textureBytes < raised.textureBytes / 5);
  // Against the map as it stands, the packed field is a small multiple for a larger gain — stated
  // as the two numbers together, because either alone is a half-truth.
  const costRatio = atlas.textureBytes / clamped.textureBytes;
  const gainRatio = atlas.gres / clamped.gres;
  assert.ok(costRatio < 5, `the atlas costs ${costRatio.toFixed(2)}x the clamped field`);
  assert.ok(gainRatio > 4, `for only ${gainRatio.toFixed(2)}x the resolution`);
  assert.ok(gainRatio > costRatio, 'the gain must still outrun the cost');
});

test('⚠ THE ATLAS EDGE IS A HARDWARE ASK TOO — smaller than A’s, and it degrades where A cannot', () => {
  // WebGL 2 guarantees only 2048 texels. The atlas asks for a 4096-class texture, which every
  // desktop and current mobile GPU has; option A asks for a 16384-class one. What matters more is
  // what happens where the ask is not met: the packing goes COARSER, and even on the guaranteed
  // minimum it lands far nearer the authored resolution than the rect form does at any size.
  const atlas = plan('atlas', forestCells, forestTriangles);
  const raised = plan('raised', forestCells);
  assert.ok(atlas.widestEdge > 2048, 'if it fitted the guaranteed minimum this test is stale');
  assert.ok(atlas.widestEdge <= 4096);
  assert.ok(raised.widestEdge > atlas.widestEdge * 2, 'A must ask for far more than C');

  const floor = packShadowAtlas(islandGroundBounds(forestCells), SHADOW_GRES, 2048);
  assert.ok(floor.w <= 2048 && floor.h <= 2048, 'the packing must land inside the minimum');
  const clamped = plan('clamped', forestCells);
  // 3.05x on the true footprint (2026-09-05; it was over 4x on the ribbon, whose islands packed
  // 2.92x less land into the same guaranteed edge).
  assert.ok(
    floor.gres > clamped.gres * 2.5,
    `on a 2048-only device the atlas delivers ${floor.gres.toFixed(3)} samples/unit against the ` +
      `rect form's ${clamped.gres.toFixed(3)}`,
  );
});

test('the atlas is the ONLY arm that costs vertex bytes, and it is a vec2 per vertex', () => {
  const atlas = plan('atlas', forestCells, forestTriangles);
  assert.equal(atlas.attributeBytes, groundVertices(forestTriangles) * 2 * 4);
  for (const arm of ['clamped', 'raised', 'per-island'] as const) {
    assert.equal(plan(arm, forestCells, forestTriangles).attributeBytes, 0);
  }
  // ⚠⚠ AND IT IS COUNTED IN THE TOTAL, because it is exactly what C pays over B. The two arms
  // allocate the same texture; C moves the per-island lookup onto the mesh and buys back
  // thirty-four draw calls with it. Stating the vertex cost as a footnote would flatter C and
  // hide the only thing the fork between B and C actually turns on.
  const perIsland = plan('per-island', forestCells, forestTriangles);
  assert.ok(
    atlas.textureBytes + atlas.attributeBytes > perIsland.textureBytes,
    'C must cost MORE total memory than B \u2014 if it did not, B would have no case at all',
  );
  // And it is still several times under A (6.5x with the attribute on the true footprint; an
  // order of magnitude on the ribbon), which is what keeps C in the comparison.
  const raised = plan('raised', forestCells, forestTriangles);
  assert.ok(atlas.textureBytes + atlas.attributeBytes < raised.textureBytes / 5);
});

test('⚠ THE EXCHANGE OPTION B ASKS FOR: one draw call becomes one per island', () => {
  assert.equal(plan('per-island', forestCells).meshes, FOREST.islands);
  assert.equal(plan('per-island', forestCells).textures, FOREST.islands);
  for (const arm of ['clamped', 'raised', 'atlas'] as const) {
    const p = plan(arm, forestCells, forestTriangles);
    assert.equal(p.meshes, 1, `${arm} must stay one draw call`);
    assert.equal(p.textures, 1, `${arm} must stay one texture`);
  }
  // NON-VACUITY: the forest really does hold many islands, so "one per island" is a real cost.
  assert.ok(FOREST.islands > 30, `${FOREST.islands} islands is not a crowd`);
});

test('option A asks for a texture edge only some hardware has', () => {
  const raised = plan('raised', forestCells);
  assert.ok(
    raised.widestEdge > SHADOW_TEXTURE_MAX,
    'if the raised arm fits inside the shipped cap then the cap is not what clamped anything',
  );
  assert.ok(
    raised.widestEdge <= RAISED_TEXTURE_MAX,
    `the raised arm needs ${raised.widestEdge} texels, past the cap it is given`,
  );
  // The number that makes it a hardware finding rather than a budget one: WebGL 2 guarantees only
  // 2048, and this edge is many times that.
  assert.ok(raised.widestEdge > 2048 * 4);
});

test('every arm on ONE island is the map exactly as it ships — same resolution, one draw', () => {
  // The narrowness claim. A remedy that changed the single-island case would be changing the
  // surface every committed figure on this arc was measured on.
  for (const arm of SHADOW_ARMS) {
    const p = plan(arm, oneCells, 0);
    assert.equal(p.gres, SHADOW_GRES, `${arm} must not move a single island's resolution`);
    assert.equal(p.meshes, 1, `${arm} must draw one island in one call`);
    assert.equal(p.textures, 1);
  }
});

test('cellsByIsland partitions the stream — nothing lost, nothing counted twice', () => {
  const grouped = cellsByIsland(forestCells);
  assert.equal(grouped.size, FOREST.islands);
  let total = 0;
  const seen = new Set<InstanceDescriptor>();
  for (const [island, cells] of grouped) {
    assert.ok(cells.length > 0, `${island} got no cells`);
    for (const c of cells) {
      assert.equal(c.island, island, 'a cell landed in a group that is not its own island');
      assert.ok(!seen.has(c), 'a cell was placed in two groups');
      seen.add(c);
      total += 1;
    }
  }
  assert.equal(total, forestCells.filter((c) => (c.points ?? []).length > 0).length);
});

test('castersWithin gives every caster to exactly one island — none lost, none shared', () => {
  // ⚠ THE INPUT IS THE PAGE'S OWN CASTER LIST, and since ADR-0508 that is the union
  // `buildShadowScene` uses rather than `crowdCasters` — which is now EMPTY, the placeholder story
  // tree having been the only thing an island's descriptor stream stood. Asking this of
  // `crowdCasters` would leave every assertion below quantified over nothing: `counts.size === 0`
  // and a `for` loop that never runs is a green test of an empty set.
  const casters = armCasters(SHIPPED_GROVE_ARM, FOREST);
  assert.ok(casters.length > 0, 'the forest must stand something, or there is no shadow at all');
  assert.equal(crowdCasters(FOREST).length, 0, 'and none of it comes from the descriptor stream any more');
  const counts = new Map<number, number>();
  for (const island of islandGroundBounds(forestCells)) {
    for (const c of castersWithin(island.bounds, casters)) {
      const i = casters.indexOf(c);
      counts.set(i, (counts.get(i) ?? 0) + 1);
    }
  }
  assert.equal(counts.size, casters.length, 'some caster stood on no island');
  for (const [i, n] of counts) {
    assert.equal(n, 1, `caster ${i} was claimed by ${n} islands`);
  }
});

test('⚠⚠ THE ZOOM THE COMPARISON TURNS ON — a pool is photographable there and sub-pixel elsewhere', () => {
  // The trap, as an assertion. This arc has already committed two byte-identical files taken at a
  // zoom where the object under comparison was a third of a pixel wide.
  assert.ok(SHADOW_ZOOMS.includes(CLOSE_ZOOM), 'the close zoom must actually be rendered');
  assert.ok(
    POOL_GROUND_WIDTH * CLOSE_ZOOM > 200,
    'a contact pool must be hundreds of pixels wide at the zoom the arms are compared at',
  );
  // And the forest fitted to a laptop screen is where it is NOT — ~3,500 ground units into 1,280
  // px is about 0.37 px/unit, so the same pool is under ten pixels and its EDGE, which is what
  // the remedies move, is under one.
  const fittedPxPerUnit = 1280 / 3500;
  assert.ok(POOL_GROUND_WIDTH * fittedPxPerUnit < 10);
});

test('the page names four arms, captions all four, and renders two sizes', () => {
  assert.deepEqual([...SHADOW_ARMS], ['clamped', 'raised', 'per-island', 'atlas']);
  for (const arm of SHADOW_ARMS) {
    assert.ok(SHADOW_ARM_CAPTION[arm].length > 0, `${arm} has no caption`);
  }
  assert.deepEqual(
    SHADOW_SIZES.map((s) => s.id),
    ['one', 'forest'],
  );
});
