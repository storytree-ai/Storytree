// Stage-1 red-green for the two SHARED growth tracks (ADR-0292 D2/D4) and the placement selector.
//
// The load-bearing assertion in here is `growthTrackPlacement`'s MONOTONE DRAWN HEIGHT. ADR-0292's
// consequences flag exp-16's non-monotone height as the composition's one measured hazard, unmeasured
// at map scale across 40 simultaneous trees. This suite proves the hazard is real in the raw track
// AND that it cannot reach the screen through the selector — so a future change that drops the height
// normalisation goes red here rather than shipping jitter to the owner's LOOK.
//
// The VISUAL verdict stays the owner's (ADR-0070). Nothing here claims the growth looks right.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXP16_TREE_GROWTH_TRACK,
  POSE_PLANT_GROWTH_TRACK,
  SHARED_GROWTH_TRACKS,
  growthTrackFrameIndex,
  growthTrackPlacement,
  type SharedGrowthTrack,
} from './shared-growth-tracks.js';
import { CHAPTER2_ROUND3_EXP16_REGISTRY } from './chapter2-round3-tree-candidates.js';
import { CHAPTER2_PLANT_SAMPLE_TRACK } from './organic-pose-to-pose-assets.js';

interface RegistrationFrame {
  readonly file: string;
  readonly normalizedAnchor: { readonly x: number; readonly y: number };
  readonly normalizedFootprint: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
interface Registration {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly frameCount: number;
  readonly targetAnchor: { readonly x: number; readonly y: number };
  readonly frames: readonly RegistrationFrame[];
}

function registration(relative: string): Registration {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'),
  ) as Registration;
}

const EXP16_REGISTRATION = registration('./assets/exp-16/tree-registration.json');
const PLANT_REGISTRATION = registration(
  './assets/chapter2-organic-pose-to-pose/plant-registration.json',
);

const CASES: readonly (readonly [string, SharedGrowthTrack, Registration])[] = [
  ['exp-16 tree', EXP16_TREE_GROWTH_TRACK, EXP16_REGISTRATION],
  ['pose-to-pose plant', POSE_PLANT_GROWTH_TRACK, PLANT_REGISTRATION],
];

describe('shared growth tracks are the registered assets, not a second copy of them', () => {
  it.each(CASES)('%s matches its registration file on disk', (_name, track, reg) => {
    expect(track.frames.length).toBe(reg.frameCount);
    expect(track.canvas).toEqual(reg.canvas.width ? { width: reg.canvas.width, height: reg.canvas.height } : track.canvas);
    expect(track.groundAnchor).toEqual(reg.targetAnchor);
    track.frames.forEach((frame, index) => {
      const measured = reg.frames[index]!;
      // The registration's own numbers, re-derived: opaque pixels standing above the ground contact.
      expect(frame.heightAboveAnchor).toBe(
        measured.normalizedAnchor.y - measured.normalizedFootprint.y,
      );
      expect(frame.width).toBe(measured.normalizedFootprint.width);
      // Every frame is registered to the SAME anchor — that is what lets one scale pin the contact.
      expect(measured.normalizedAnchor).toEqual(reg.targetAnchor);
      expect(frame.src.endsWith(measured.file)).toBe(true);
    });
    expect(track.matureHeightAboveAnchor).toBe(track.frames[track.frames.length - 1]!.heightAboveAnchor);
    expect(track.matureWidth).toBe(track.frames[track.frames.length - 1]!.width);
  });

  // The product path declares its own frame URLs rather than importing the round-3 comparison lab,
  // which would emit every REJECTED candidate's PNGs into the studio bundle. This is the guard that
  // keeps the two lists from drifting apart while they stay decoupled at runtime.
  it('carries exactly the frame URLs the round-3 registries publish', () => {
    expect(EXP16_TREE_GROWTH_TRACK.frames.map((f) => f.src)).toEqual(
      CHAPTER2_ROUND3_EXP16_REGISTRY.tracks[0]!.frames.map((f) => f.src),
    );
    expect(POSE_PLANT_GROWTH_TRACK.frames.map((f) => f.src)).toEqual(
      CHAPTER2_PLANT_SAMPLE_TRACK.frames.map((f) => f.src),
    );
    expect(EXP16_TREE_GROWTH_TRACK.groundAnchor).toEqual(
      CHAPTER2_ROUND3_EXP16_REGISTRY.tracks[0]!.groundAnchor,
    );
    expect(POSE_PLANT_GROWTH_TRACK.groundAnchor).toEqual(CHAPTER2_PLANT_SAMPLE_TRACK.groundAnchor);
  });

  it('is ONE decode set for the whole forest — 24 frames total, whatever the story count', () => {
    // ADR-0292 D2's cost argument, pinned: adding the 41st island adds no images. If a per-territory
    // track ever creeps back in, this is where it shows up.
    expect(SHARED_GROWTH_TRACKS.flatMap((t) => t.frames).length).toBe(24);
    expect(new Set(SHARED_GROWTH_TRACKS.flatMap((t) => t.frames.map((f) => f.src))).size).toBe(24);
  });
});

describe('the tracks really are non-monotone in height — the hazard the selector exists to absorb', () => {
  // The RED half of the red-green. If a future re-cut of either track happens to become monotone,
  // this fails and the normalisation below can be revisited on evidence rather than on this comment.
  it.each(CASES)('%s shrinks at least once between consecutive frames', (_name, track) => {
    const heights = track.frames.map((f) => f.heightAboveAnchor);
    const shrinks = heights.filter((h, i) => i > 0 && h < heights[i - 1]!);
    expect(shrinks.length).toBeGreaterThan(0);
  });

  it('exp-16 is already at 98% of mature height by frame 03, and dips to 86% after it', () => {
    const heights = EXP16_TREE_GROWTH_TRACK.frames.map((f) => f.heightAboveAnchor);
    const mature = EXP16_TREE_GROWTH_TRACK.matureHeightAboveAnchor;
    expect(heights[3]! / mature).toBeGreaterThan(0.97);
    expect(Math.min(...heights.slice(3)) / mature).toBeLessThan(0.87);
  });
});

describe('growthTrackPlacement', () => {
  it.each(CASES)('%s: drawn height never decreases across the whole 0→1 sweep', (_name, track) => {
    // Sampled at 4x the frame count so every frame boundary is crossed — a boundary is exactly where
    // the raw track's shrink would surface as a hitch.
    const steps = track.frames.length * 40;
    let previous = -1;
    for (let i = 0; i <= steps; i++) {
      const grown = i / steps;
      const place = growthTrackPlacement(track, { grown, matureHeight: 100 });
      expect(place.drawnHeight).toBeGreaterThanOrEqual(previous - 1e-9);
      // The app owns the curve outright: drawn height is the ramp, exactly, whatever frame is up.
      expect(place.drawnHeight).toBeCloseTo(100 * grown, 9);
      previous = place.drawnHeight;
    }
  });

  it.each(CASES)('%s: the registered ground contact stays pinned at the local origin', (_name, track) => {
    for (let i = 0; i <= 20; i++) {
      const place = growthTrackPlacement(track, { grown: i / 20, matureHeight: 60 });
      // y is the box top; the anchor sits `groundAnchor.y * scale` below it, which must land on 0 —
      // the spot the scene already placed the object at.
      expect(place.y + track.groundAnchor.y * place.scale).toBeCloseTo(0, 9);
      expect(place.x + track.groundAnchor.x * place.scale).toBeCloseTo(0, 9);
      // Uniform scale — a frame is never stretched to hit its height.
      expect(place.width / track.canvas.width).toBeCloseTo(place.scale, 9);
      expect(place.height / track.canvas.height).toBeCloseTo(place.scale, 9);
    }
  });

  it('draws nothing at all at zero growth, and the mature frame at one', () => {
    const zero = growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, { grown: 0, matureHeight: 60 });
    expect(zero.frameIndex).toBe(0);
    expect(zero.width).toBe(0);
    expect(zero.drawnHeight).toBe(0);
    const full = growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, { grown: 1, matureHeight: 60 });
    expect(full.frameIndex).toBe(18);
    expect(full.drawnHeight).toBeCloseTo(60, 9);
  });

  it('clamps a nonsense cursor rather than drawing a negative tree', () => {
    for (const grown of [Number.NaN, Number.POSITIVE_INFINITY, -3, 4]) {
      const place = growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, { grown, matureHeight: 60 });
      expect(place.scale).toBeGreaterThanOrEqual(0);
      expect(place.drawnHeight).toBeGreaterThanOrEqual(0);
      expect(place.frameIndex).toBeGreaterThanOrEqual(0);
      expect(place.frameIndex).toBeLessThanOrEqual(18);
    }
  });

  it('mirrors only when asked, and the mirror never moves the trunk', () => {
    const plain = growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, { grown: 1, matureHeight: 60 });
    const flipped = growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, {
      grown: 1,
      matureHeight: 60,
      flipped: true,
    });
    expect(plain.flipped).toBe(false);
    expect(flipped.flipped).toBe(true);
    // The mirror is a `scale(-1 1)` about the LOCAL origin, which is the ground contact — so the box
    // itself is identical and nothing about where the object stands changes.
    expect({ ...flipped, flipped: false }).toEqual(plain);
  });
});

describe('growthTrackFrameIndex', () => {
  it('spreads the whole cursor across the frames below the ceiling', () => {
    // A ceiling is a VARIATION channel (ADR-0292 D3): a low ceiling means a slower walk over fewer
    // frames, never an early finish followed by a hold on the last one.
    const seen = new Set<number>();
    for (let i = 0; i <= 100; i++) seen.add(growthTrackFrameIndex(EXP16_TREE_GROWTH_TRACK, i / 100, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    expect(growthTrackFrameIndex(EXP16_TREE_GROWTH_TRACK, 1, 2)).toBe(2);
  });

  it('never leaves the track, whatever ceiling it is handed', () => {
    for (const ceiling of [-5, 0, 18, 99]) {
      for (const grown of [0, 0.5, 1]) {
        const index = growthTrackFrameIndex(EXP16_TREE_GROWTH_TRACK, grown, ceiling);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(18);
      }
    }
  });

  it('defaults to the whole track when no ceiling is given', () => {
    expect(growthTrackFrameIndex(EXP16_TREE_GROWTH_TRACK, 1)).toBe(18);
    expect(growthTrackFrameIndex(POSE_PLANT_GROWTH_TRACK, 1)).toBe(4);
  });
});
