// pine-asset.ts — THE COMPARISON'S OWN ARITHMETIC, pure and provable.
//
// The browser half is `pine-scene.ts`; this is everything about the first-textured-asset
// comparison that can be decided without a GPU: where the trees stand, how big the bought pine
// has to be to stand in for the grown one, and how many draw calls each arm is allowed.
//
// ⚠ WHY THE DRAW-CALL EXPECTATIONS ARE HAND-AUTHORED HERE RATHER THAN READ OFF THE SCENE. A
// count derived from the thing it checks vanishes at the moment the thing does
// (`an-expectation-derived-from-its-subject-cannot-fail`). If the glTF arm silently stopped
// drawing its leaves, a self-derived expectation would drop to 2 alongside it and the run would
// pass. So the manifest is UPSTREAM of the builder, and removing a mesh is a visible two-place
// edit.
//
// ⚠ AND WHY THE COMPARISON IS BUILT AT ALL RATHER THAN SWAPPING A TREE INSIDE `IslandView`.
// Everything on the island wears `createBandedMaterial`, a custom shader that ignores lights;
// a glTF pine wears `MeshStandardMaterial`, which is black without them. Putting the two on one
// island means adding lights, and lights are a SECOND thing that differs. The way out is not to
// avoid the lights but to prove they change nothing: the lights are present in EVERY arm, and
// `pine-measure.mjs` refuses the run unless the procedural arm is pixel-identical with them
// removed. That is the same premise refusal ADR-0462's status page uses — the arms must differ
// only where the variant says they do.

import { LAND_CAMERA_ELEVATION_DEG, uprightForeshortening } from '@storytree/forest-world';

import { islandScene } from './island-fixture.js';
import { treeWorldHeight } from './tree-geometry.js';
import { treesFrom } from './tree-descriptors.js';
import type { TreeInstance } from './tree-descriptors.js';

/**
 * THE FOUR ARMS. `bare` is the ground alone — the control every frame cost is stated against.
 *
 * ⚠ `gltf-untextured` EXISTS BECAUSE A MUTATION SURVIVED WITHOUT IT, and it is worth recording
 * why rather than quietly adding an arm. The first version of the "did it actually draw
 * textured?" check compared the glTF arm's delivered colour count against the PROCEDURAL arm's.
 * Stripping every map off the asset and re-running was supposed to refuse; it passed — 48
 * distinct colours against the banded arm's 5 — because a `MeshStandardMaterial` shading curved
 * geometry continuously delivers a smooth gradient whether or not it carries a texture. The
 * check was measuring CONTINUOUS SHADING, not texturing, and it would have gone green for an
 * asset whose maps failed to bind: the cheapest possible way to pass a frame-cost measurement.
 *
 * So the same asset with its maps stripped is now an ARM, drawn in the same run, and the bar is
 * ITS OWN colour count. It also earns its place twice over: it separates what the TEXTURE costs
 * per frame from what the GEOMETRY costs, which nothing else here can do.
 */
export type PineVariant = 'bare' | 'procedural' | 'gltf-untextured' | 'gltf';

export const PINE_VARIANTS: readonly PineVariant[] = [
  'bare',
  'procedural',
  'gltf-untextured',
  'gltf',
];

/**
 * HOW MANY DRAW CALLS EACH ARM MUST ISSUE, authored upstream of the builder.
 *
 *  - `bare`: the ground plane. One.
 *  - `procedural`: the ground, plus one merged mesh per authored token the tree wears — a
 *    trunk token and a crown token. Three. Merging is how `IslandView` already draws trees, so
 *    the count does not move with the number of trees.
 *  - `gltf`: the ground, plus one `InstancedMesh` per glTF primitive — the trunk's material and
 *    the leaves'. Three as well, and also independent of the tree count.
 *
 * ⚠ THE TWO ARMS COST THE SAME NUMBER OF DRAW CALLS, AND THAT IS THE POINT OF THE COMPARISON.
 * `hardware-floor.mjs` measured this renderer DRAW-CALL bound, so an arm that quietly issued
 * more calls would be measured as more expensive for a reason that has nothing to do with
 * being textured. Holding the count equal is what makes the frame-cost difference attributable
 * to the texture and the triangles.
 */
export const EXPECTED_DRAW_CALLS = {
  bare: 1,
  procedural: 3,
  'gltf-untextured': 3,
  gltf: 3,
} as const satisfies Record<PineVariant, number>;

/**
 * WHERE THE TREES STAND — nine ground points, authored, identical in both arms.
 *
 * Nine rather than one: a single tree measures a triangle count and nothing about whether the
 * idiom holds up as a stand, and the owner's own direction on this arc was "many small trees so
 * it actually looks like a forest" (2026-08-21). Nine also puts enough textured fragments on
 * screen for the GPU clock to have something to resolve — one 60-pixel tree at the overview
 * zoom would sit under the noise floor and the report would say so rather than say anything.
 *
 * The spacing is authored rather than random: `Math.random` is forbidden on this surface
 * (ADR-0380 D6 fence 2) and a scatter that moved between arms would be the difference the
 * measurement attributed to the texture.
 */
export const TREE_GROUND_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-72, -48],
  [0, -56],
  [70, -44],
  [-84, 6],
  [-8, 0],
  [78, 10],
  [-64, 52],
  [4, 60],
  [72, 50],
];

/**
 * The flat ground the comparison stands on, in world units.
 *
 * ⚠ IT IS SIZED BY THE FRAME, NOT BY THE TREES. At the overview zoom a 1440x960 buffer at 2
 * device pixels per ground unit shows 720 x 480 world units, and a ground that did not reach the
 * frame's edges would leave part of every frame uncovered — which under-reports every per-frame
 * cost by exactly the uncovered fraction, silently. 1,200 units covers the widest frame at both
 * zooms with the 50-degree camera's depth foreshortening applied, and the driver CHECKS it
 * rather than trusting this arithmetic.
 */
export const GROUND_SPAN = 1200;

/** The camera elevation every land picture on this arc is taken at. */
export const RENDER_ELEV_DEG = 50;

/**
 * THE PROCEDURAL TREE THE BOUGHT ONE STANDS IN FOR — the island fixture's own hero tree, read
 * off the scene rather than transcribed. Transcribing it would be a second copy of the shape
 * that could drift from the one the island draws, and then the comparison would be against a
 * tree the product does not have.
 */
export function referenceTree(): TreeInstance {
  const trees = treesFrom(islandScene());
  const first = trees[0];
  if (!first) throw new Error('pine-asset: the island fixture drew no hero tree to compare against');
  return first;
}

/** `cos` of the elevation the fixture's SVG was PROJECTED at — what `growTree` un-projects by. */
export function sceneUpright(): number {
  return uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
}

/**
 * HOW TALL THE COMPARISON'S TREES ARE, in world units. Both arms use this one number: the grown
 * tree is this tall because its geometry says so, and the bought pine is SCALED to it.
 *
 * ⚠ THE HERO TREE IS TOO BIG TO BE A STAND. `treeWorldHeight` on the fixture's hero comes back
 * near a hundred units against a 234-unit island — it is one tree in the middle of a map, which
 * is exactly the composition the owner rejected. So the comparison draws the hero's SHAPE at a
 * canopy tree's SIZE, and the scale factor is stated rather than hidden inside a magic height.
 */
export const CANOPY_TREE_HEIGHT = 30;

/** What `growTree`'s output must be multiplied by to stand `CANOPY_TREE_HEIGHT` tall. */
export function proceduralScale(): number {
  const grown = treeWorldHeight(referenceTree(), sceneUpright());
  if (!(grown > 0)) throw new Error('pine-asset: the reference tree has no height');
  return CANOPY_TREE_HEIGHT / grown;
}

/**
 * What the loaded glTF must be multiplied by to stand the same height. The kit authors its pine
 * about four Blender units tall; the caller passes the measured bounding-box height so nothing
 * here has to know the asset's internals.
 */
export function gltfScale(assetHeightUnits: number): number {
  if (!(assetHeightUnits > 0)) throw new Error('pine-asset: the glTF asset has no height');
  return CANOPY_TREE_HEIGHT / assetHeightUnits;
}

/**
 * THE DELIVERED EXTENT of one tree, in device pixels, at a given zoom — the number
 * `asset-payload.ts`'s rung verdict is read against.
 *
 * A tree's height is an UPRIGHT travel, so at a camera elevation of 50 degrees it lands on
 * screen foreshortened by `cos(50°)`. Its ground footprint foreshortens by `sin`, and is
 * smaller than the height here, so the height is what bounds the extent.
 */
export function deliveredTreeExtentPx(pxPerUnit: number): number {
  const elev = (RENDER_ELEV_DEG * Math.PI) / 180;
  return CANOPY_TREE_HEIGHT * Math.cos(elev) * pxPerUnit;
}

/** The two zooms every land measurement on this arc is taken at (2.08 and 8.33 device px per
 *  ground unit in the committed Cycles frames; 2 and 8 here, within 4%). */
export const ZOOMS: readonly number[] = [2, 8];
