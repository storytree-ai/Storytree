// tree-geometry.ts — the hero story tree as a SOLID. Pure, deterministic, browser-free,
// node:test-provable, inside the ADR-0123 provability firewall.
//
// THE JOB IS COMPOSITING, NOT AUTHORING, and the difference is worth being exact about because
// the increment is explicit that nine versions of crown tuning are SPENT. Nothing here decides
// what a crown looks like. The lobe count, every centre, every radius and every per-lobe jitter
// come from `buildTree`'s output via `tree-descriptors.ts`, keyed by the story's own id exactly
// as the surface keyed them. What this module adds is the ONE thing a planar drawing could not
// carry — depth — and the fork decision that put a live tree here rather than a re-rendered
// raster is recorded at the top of `tree-descriptors.ts`.
//
// THIS FILE MAKES NO APPEARANCE CALL, AND IT USED TO MAKE ONE. See CROWN DEPTH below: the call
// was made, rendered, measured against the render, and WITHDRAWN. Recording a withdrawal is as
// much of ADR-0392 D2's obligation as recording a choice — arguably more, since a reader can see
// what is on the island but not what was tried and taken back out.

import {
  addLobe,
  addTube,
  emptyRaw,
  finishRaw,
  type GeneratedMesh,
  type Raw,
  type Vec3,
} from './mesh-kit.js';
import { SHARED_TOKENS, TREE_TOKENS } from './palette-band.js';
import type { TreeInstance } from './tree-descriptors.js';

/**
 * CROWN DEPTH — AN APPEARANCE CALL MADE, MEASURED, AND WITHDRAWN. There is no constant here any
 * more, and the absence is the record.
 *
 * THE CALL. The SVG crown is eight overlapping circles laid out in a plane, because a plane is
 * all a flat renderer has. That looked like it had to mean a cardboard cut-out in 3D, so the
 * first version gave each lobe a seeded depth offset of up to 0.62 of the crown's widest radius,
 * keyed on the story id — enough, on the arithmetic, to make the crown "roughly as deep as it is
 * wide".
 *
 * WHAT THE RENDER SAID. The tree came out a floating balloon with NO VISIBLE BOLE. The reason is
 * a fact about this projection that the arithmetic never touched: at an elevation camera, moving
 * a lobe toward the viewer by `dz` also moves it DOWN the screen by `dz * sin(elev)`. At 50° a
 * 19.8-unit push drops a lobe 15.2 screen units, and the crown's lowest blob sits only 16.4 above
 * the tree's own ground contact. So the offsets did not merely add depth: they dragged the crown's
 * near side down over the whole trunk. Measured on the delivered render, not reasoned about.
 *
 * WHY IT IS WITHDRAWN RATHER THAN TUNED. Because the premise was wrong. The authored lobes are
 * SPHERES, of radii 11 to 32 — a union of spheres whose CENTRES share a plane is already a
 * volume, and this crown is 64 units deep against 76 wide before anything is offset at all. There
 * was no cut-out to fix. And the offsets cost something real: they moved the authored crown around
 * in screen space, which is precisely the re-authoring this increment says is not on the table
 * (nine versions of crown tuning are spent).
 *
 * So lobe centres sit at z = 0, exactly where the surface put them, and the crown's silhouette is
 * the authored one at EVERY camera rather than at one. The tree is still deterministic and still
 * identity-keyed — it simply has nothing left to key.
 */

/** How many sides the bole is swept with. Seven reads round at every rung the evidence page
 *  publishes and costs nothing worth counting against 162 ground cells. */
const TRUNK_SIDES = 7;

/** Geodesic subdivision per crown lobe. Two is the vegetation's own delivered rung, and the
 *  crown is the largest object on the island — the one place fine structure survives to
 *  delivery, which is precisely the live path's claim. */
const CROWN_DETAIL = 2;

/** The tree, as one mesh per authored TOKEN — the same shape `growFlower` returns, so a caller
 *  merges both families the same way and no mesh can ever wear two colours. */
export type TreeParts = Map<string, GeneratedMesh>;

function raw(parts: Map<string, Raw>, token: string): Raw {
  const hit = parts.get(token);
  if (hit) return hit;
  const fresh = emptyRaw();
  parts.set(token, fresh);
  return fresh;
}

/**
 * Build the hero story tree as world-space geometry standing on `y = 0` at its own planted base
 * (the caller translates it to the tree's ground point, which is where the ground foreshortening
 * lives).
 *
 * `uprightForeshortening` is `cos` of the elevation the SCENE was projected at — NOT the one it
 * will be rendered at. The tree is the biggest thing on the island, so getting this wrong is the
 * most visible version of the silent 2.75x error: the tree would tower or squat and the picture
 * would look deliberate.
 */
export function growTree(tree: TreeInstance, uprightForeshortening: number): TreeParts {
  const parts = new Map<string, Raw>();
  const crownToken = (TREE_TOKENS.get(tree.status) ?? TREE_TOKENS.get('unknown')!).crown;

  // SVG y runs DOWN and is an upright travel; x is a horizontal span and takes no correction.
  const wy = (y: number): number => -y / uprightForeshortening;

  // ---- the bole ----------------------------------------------------------------------------
  if (tree.trunk) {
    const { baseHalfWidth, topHalfWidth, topY } = tree.trunk;
    const top = wy(topY);
    const spine: Vec3[] = [];
    const radii: number[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      spine.push([0, top * t, 0]);
      // The authored outline tapers linearly between its two half-widths, so the sweep does too.
      radii.push(baseHalfWidth + (topHalfWidth - baseHalfWidth) * t);
    }
    addTube(raw(parts, SHARED_TOKENS.storyTrunk), spine, radii, TRUNK_SIDES);
  }

  // ---- the crown ---------------------------------------------------------------------------
  //
  // BOTH authored groups are grown, and both wear the crown token. The `-hi` blobs are real
  // silhouette the surface authored; their lighter FILL was the flat renderer standing in for a
  // light it did not have, and a live crown has the light. Painting them lighter as well would
  // be the highlight said twice — see `TREE_TOKENS` in palette-band.ts.
  const crown = raw(parts, crownToken);
  for (const lobe of tree.lobes) {
    // z = 0: the authored centre, untouched. The lobe is a sphere, so it carries its own depth.
    addLobe(crown, [lobe.x, wy(lobe.y), 0], [lobe.r, lobe.r, lobe.r], CROWN_DETAIL);
  }

  const out: TreeParts = new Map();
  for (const [token, r] of parts) if (r.idx.length) out.set(token, finishRaw(r));
  return out;
}

/** The tree's true WORLD height, once its drawn height is recovered through the scene's own
 *  foreshortening — the number a caller frames a camera on, and the one a test asserts against
 *  so a dropped or doubled recovery is a RED rather than a plausible picture. */
export function treeWorldHeight(tree: TreeInstance, uprightForeshortening: number): number {
  // ⚠ A LOBE'S RADIUS TAKES NO CORRECTION, AND ITS CENTRE HEIGHT DOES. A sphere projects to a
  // circle of its own radius at every elevation, so the authored radius is already a world
  // radius; only the centre's HEIGHT above the base is an upright travel. An earlier version
  // recovered `-(y - r)` as one quantity and so foreshortened the radius too — a 6% error at
  // this camera, which is exactly the size that never looks wrong and quietly mis-frames a
  // crown. `growTree` always had it right; this helper did not, and the disagreement is what
  // the test compares.
  let top = 0;
  if (tree.trunk) top = Math.max(top, -tree.trunk.topY / uprightForeshortening);
  for (const lobe of tree.lobes) top = Math.max(top, -lobe.y / uprightForeshortening + lobe.r);
  return top;
}
