// Territory + tree sizing — the pure curves that turn a story's tile quota and
// capability count into pixel radii. The studio's CANONICAL numbers (ADR-0093):
// crown grows with capability count; island radius with the tile quota.
//
// `estRadius`/`crownRadius` stay GROUND/plan-view quantities deliberately: `estRadius` feeds the
// row/column LAYOUT spacing (a hex-lattice distance, projected the same way every other lattice
// distance is, by `hexCenter`/`pixelToHex`'s own round trip — ADR-0367 D1) and `crownRadius` feeds
// the story tree's own hand-drawn SVG geometry, an app-owned 2D icon that is not itself projected
// through the land camera (ADR-0367 D3). `storyTreeReach` is the one exception: it is added
// directly against an already-PROJECTED screen coordinate (`treeSpot.y`) to size the scene's
// vertical bounds, so — like `TILE_DEPTH` in `hex.ts` — it carries the camera's UPRIGHT
// foreshortening (cos θ) itself rather than leaving the call site to remember to apply it.

import { HEX_R, HEX_W } from './hex.js';
import { LAND_CAMERA_ELEVATION_DEG, uprightForeshortening } from './camera.js';

/** Hex rings a territory of `quota` tiles roughly fills (1 / 7 / 19 / 37 centred counts). */
export function ringsOf(quota: number): number {
  return quota <= 1 ? 0 : quota <= 7 ? 1 : quota <= 19 ? 2 : 3;
}

/** Rough px radius a territory will grow to from its tile quota. */
export function estRadius(quota: number): number {
  return Math.sqrt(quota) * HEX_W * 0.62 + HEX_R;
}

/** Crown radius of the central story tree — grows with capability count. */
export function crownRadius(capCount: number): number {
  return Math.min(32, 18 + 2.2 * capCount);
}

/**
 * How far above its base a story tree reaches ON SCREEN — the withered bare branches top out at
 * 2.64·R and the canopy at ~2.7·R (StoryTree geometry); +18 covers blob jitter and the signpost.
 * `buildWorld` subtracts this directly from an already-projected `treeSpot.y` for the scene's
 * vertical bounds, so it carries the land camera's upright foreshortening (cos θ) the same way
 * `TILE_DEPTH` does — an EXTRUSION/upright measure, not a ground-plane one (ADR-0367 D1).
 */
export function storyTreeReach(
  capCount: number,
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): number {
  return (2.72 * crownRadius(capCount) + 18) * uprightForeshortening(elevationDeg);
}
