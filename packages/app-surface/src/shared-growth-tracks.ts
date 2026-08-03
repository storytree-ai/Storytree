// shared-growth-tracks — the TWO authored raster tracks the whole forest grows from (ADR-0292 D2/D4),
// plus the frame-and-scale selector that turns a 0→1 growth cursor into one drawable placement.
//
// ONE track, referenced by every island. That is the whole cost argument, and it is worth stating
// plainly because ADR-0282 D2 refused the opposite: mounting a 23-frame authored track on 45
// territories is a decode and memory non-starter — but that reasoning assumed 45 DIFFERENT tracks.
// 19 frames decoded ONCE serve 5 islands or 400, because every island displays whichever of the same
// 19 frames its own cursor has reached. Tree + plants together are 24 decodes, ~99 KB encoded.
// Adding the 41st island adds zero images (ADR-0292 D2, upholding ADR-0282 D2's real subject).
//
// ─── why this module carries per-frame HEIGHTS ────────────────────────────────────────────────────
//
// exp-16's track is NOT monotone in height, and that is the one measured hazard in this composition.
// Measured from `assets/exp-16/tree-registration.json` (`normalizedAnchor.y - normalizedFootprint.y`,
// the opaque pixels standing above the registered ground contact):
//
//   frame  00  01  02  03  04  05  06  07  08  09  10  11  12  13  14  15  16  17  18
//   height 72  77  91 109 104 107 110 108 101 101 101  96  95  99 107 104 108 110 111
//
// The tree reaches 98% of its mature height at frame 03 — 16% of the way through the track — and then
// OSCILLATES between 85.6% and 99.1% for the remaining 84% before settling. ADR-0289 measured the same
// shape and ADR-0292's consequences flag it as unmeasured at map scale: on a 128 px hero it is
// character; on 40 simultaneous trees a repeated ±7% height wobble is jitter.
//
// {@link growthTrackPlacement} dissolves it rather than hoping: the APP owns the height curve (a
// monotone ramp off the island's own cursor) and the TRACK owns the form. Each frame is scaled by
// `matureHeight * ramp / frame.heightAboveAnchor`, so the drawn height above the ground anchor is
// EXACTLY `matureHeight * ramp` for every frame — monotone by construction, whatever the track does.
// The scale is uniform, so nothing is distorted; what still reads through is the silhouette, and there
// the track IS monotone where it matters — width climbs 46 → 95 px across the 19 frames.
//
// This is the ADR-0282 D6 division of labour (the app owns the clock, ordering, progress and easing;
// the asset owns appearance), not a new one.

import type { OrganicPosePoint } from './organic-pose-to-pose-track.js';

/** One frame of a shared growth track, with the two measurements the selector needs. */
export interface GrowthTrackFrame {
  readonly index: number;
  readonly src: string;
  /** Opaque pixels standing ABOVE the registered ground anchor. The normalisation unit. */
  readonly heightAboveAnchor: number;
  /** Opaque width in pixels — carried for tests and for the island-fit width cap. */
  readonly width: number;
}

/**
 * A registered raster growth track shared by every island on the map.
 *
 * Deliberately NOT `OrganicPoseTrack`: that type is the comparison lab's registry shape (poses, cue
 * holds, provenance, budgets) and importing the lab's module into the product path would emit every
 * rejected candidate's PNGs into the studio bundle. The frame URLs here are declared locally and
 * asserted equal to the lab registry's in `shared-growth-tracks.test.ts`, so the two cannot drift
 * without the gate saying so.
 */
export interface SharedGrowthTrack {
  readonly id: string;
  readonly canvas: { readonly width: number; readonly height: number };
  /** The registered ground contact, in asset pixels — the point pinned to the object's world spot. */
  readonly groundAnchor: OrganicPosePoint;
  readonly frames: readonly GrowthTrackFrame[];
  /** The last frame's height above the anchor — what `matureHeight` means in asset pixels. */
  readonly matureHeightAboveAnchor: number;
  /** The last frame's opaque width — the island-fit width cap reads it. */
  readonly matureWidth: number;
}

// ── exp-16, the owner's tree (ADR-0292 D2; ADR-0280 named it "the track the owner called his
//    favourite", and ADR-0292 D7 grandfathers it as accepted art). 19 frames, 128x128, anchor (64,122).

const EXP16_URLS: readonly string[] = Object.freeze([
  new URL('./assets/exp-16/tree/frame-00.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-01.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-02.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-03.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-04.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-05.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-06.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-07.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-08.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-09.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-10.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-11.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-12.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-13.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-14.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-15.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-16.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-17.png', import.meta.url).href,
  new URL('./assets/exp-16/tree/frame-18.png', import.meta.url).href,
]);

/** Measured from `assets/exp-16/tree-registration.json` — see the module header's table. */
const EXP16_HEIGHTS: readonly number[] = Object.freeze([
  72, 77, 91, 109, 104, 107, 110, 108, 101, 101, 101, 96, 95, 99, 107, 104, 108, 110, 111,
]);
const EXP16_WIDTHS: readonly number[] = Object.freeze([
  46, 45, 49, 53, 75, 76, 76, 76, 79, 82, 85, 79, 80, 84, 92, 95, 95, 95, 95,
]);

// ── the retained pose-to-pose plant (ADR-0292 D4; ADR-0277 D2 retained it because the small plants
//    "repeatedly passed the owner's visual comparison"). 5 frames, 96x96, anchor (48,92).

const PLANT_URLS: readonly string[] = Object.freeze([
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-03.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-04.png', import.meta.url).href,
]);

/** Measured from `assets/chapter2-organic-pose-to-pose/plant-registration.json`. Also non-monotone
 *  (frame 03 → 04 drops 86 → 79), so the plant rides exactly the same normalisation as the tree. */
const PLANT_HEIGHTS: readonly number[] = Object.freeze([75, 79, 85, 86, 79]);
const PLANT_WIDTHS: readonly number[] = Object.freeze([40, 47, 56, 56, 56]);

function track(
  id: string,
  canvas: { width: number; height: number },
  groundAnchor: OrganicPosePoint,
  urls: readonly string[],
  heights: readonly number[],
  widths: readonly number[],
): SharedGrowthTrack {
  const frames = Object.freeze(
    urls.map((src, index) =>
      Object.freeze({
        index,
        src,
        heightAboveAnchor: heights[index]!,
        width: widths[index]!,
      }),
    ),
  );
  return Object.freeze({
    id,
    canvas: Object.freeze(canvas),
    groundAnchor: Object.freeze(groundAnchor),
    frames,
    matureHeightAboveAnchor: heights[heights.length - 1]!,
    matureWidth: widths[widths.length - 1]!,
  });
}

export const EXP16_TREE_GROWTH_TRACK: SharedGrowthTrack = track(
  'act2-shared-tree-exp-16-v1',
  { width: 128, height: 128 },
  { x: 64, y: 122 },
  EXP16_URLS,
  EXP16_HEIGHTS,
  EXP16_WIDTHS,
);

export const POSE_PLANT_GROWTH_TRACK: SharedGrowthTrack = track(
  'act2-shared-plant-pose-to-pose-v1',
  { width: 96, height: 96 },
  { x: 48, y: 92 },
  PLANT_URLS,
  PLANT_HEIGHTS,
  PLANT_WIDTHS,
);

/** Every frame of every track this module publishes — what a preloader would warm, and what the
 *  "one shared decode set" claim is counted from. */
export const SHARED_GROWTH_TRACKS: readonly SharedGrowthTrack[] = Object.freeze([
  EXP16_TREE_GROWTH_TRACK,
  POSE_PLANT_GROWTH_TRACK,
]);

/**
 * The frame an object at growth `grown` shows, never past `ceiling`.
 *
 * `ceiling` is a per-island VARIATION channel (ADR-0292 D3), not a clamp for safety: an island whose
 * story is `unhealthy` walks only the track's bare early frames and stops there, which is how the
 * withered form the procedural tree drew for free survives one shared track. The whole 0→1 cursor is
 * spread across `ceiling + 1` frames, so a low ceiling means a SLOWER walk over fewer frames, never
 * an early finish followed by a hold.
 */
export function growthTrackFrameIndex(
  track: SharedGrowthTrack,
  grown: number,
  ceiling?: number,
): number {
  const last = Math.max(0, Math.min(track.frames.length - 1, ceiling ?? track.frames.length - 1));
  if (!Number.isFinite(grown) || grown <= 0) return 0;
  if (grown >= 1) return last;
  return Math.max(0, Math.min(last, Math.floor(grown * (last + 1))));
}

/** One drawable placement, in the LOCAL coordinates of the object's own ground anchor: an `<image>`
 *  box whose bottom-centre contact sits exactly on (0, 0), the spot the scene already placed. */
export interface GrowthTrackPlacement {
  readonly trackId: string;
  readonly src: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** World units per asset pixel. */
  readonly scale: number;
  /** Drawn height ABOVE the anchor — `matureHeight * ramp`, monotone in `grown` by construction. */
  readonly drawnHeight: number;
  /** Mirror about the anchor's vertical axis — a seeded per-story variation (ADR-0292 D3/D5). */
  readonly flipped: boolean;
}

export interface GrowthTrackPlacementInput {
  /** This object's own 0→1 growth. 0 draws nothing; 1 is mature. */
  readonly grown: number;
  /** The object's full-grown height above its ground anchor, in world units. */
  readonly matureHeight: number;
  /** The last frame this island's object ever reaches — a D3 variation channel. */
  readonly ceiling?: number;
  readonly flipped?: boolean;
}

/**
 * Select one frame AND the uniform scale that makes its drawn height exactly `matureHeight * grown`.
 *
 * The height normalisation is the point (see the module header): the app owns the growth curve, the
 * track owns the form, and the track's non-monotone height can no longer reach the screen as jitter.
 * `grown` is used verbatim as the ramp — the island's accretion cursor is already the easing, and a
 * second curve on top would distort the schedule ADR-0285 made legible.
 */
export function growthTrackPlacement(
  track: SharedGrowthTrack,
  input: GrowthTrackPlacementInput,
): GrowthTrackPlacement {
  const grown = Number.isFinite(input.grown) ? Math.max(0, Math.min(1, input.grown)) : 0;
  const frameIndex = growthTrackFrameIndex(track, grown, input.ceiling);
  const frame = track.frames[frameIndex]!;
  const drawnHeight = Math.max(0, input.matureHeight) * grown;
  const scale = frame.heightAboveAnchor > 0 ? drawnHeight / frame.heightAboveAnchor : 0;
  return {
    trackId: track.id,
    src: frame.src,
    frameIndex,
    x: -track.groundAnchor.x * scale,
    y: -track.groundAnchor.y * scale,
    width: track.canvas.width * scale,
    height: track.canvas.height * scale,
    scale,
    drawnHeight,
    flipped: input.flipped === true,
  };
}
