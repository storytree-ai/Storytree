import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER2_ISLAND_GROWTH_TRACK,
  ISLAND_GROWTH_CUE_TARGETS,
  advanceIslandGrowthPlayback,
  initialIslandGrowthPlayback,
  islandGrowthFrameAtProgress,
  replayIslandGrowth,
  selectIslandGrowthCue,
  validateIslandGrowthTrack,
} from './island-growth-track.js';

const ASSET_DIR = new URL('./assets/chapter2-island-growth/', import.meta.url);

function pngDimensions(bytes: Uint8Array): readonly [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

describe('registered Chapter 2 island growth track', () => {
  it('validates one local, fixed registered nine-frame track with the declared budget', () => {
    const track = validateIslandGrowthTrack(CHAPTER2_ISLAND_GROWTH_TRACK);
    expect(track.canvas).toEqual({ width: 256, height: 256 });
    expect(track.frameCount).toBe(9);
    expect(track.islandAnchor).toEqual({ x: 128, y: 239 });
    expect(track.treeRoot).toEqual({ x: 128, y: 170 });
    expect(track.matureFootprint).toEqual({ x: 36, y: 12, width: 182, height: 228 });
    expect(track.depthSlot).toBe('island-growth-composite');
    expect(track.encodedFrameBytes).toBe(191_480);
    expect(track.decodedRgbaBytes).toBe(2_359_296);
    expect(track.frames).toHaveLength(9);

    let encodedBytes = 0;
    for (const [index, frame] of track.frames.entries()) {
      expect(frame.index).toBe(index);
      expect(frame.normalizedAnchor).toEqual(track.islandAnchor);
      expect(frame.src).toMatch(/^file:|^\/|^[A-Za-z]:|^https?:\/\/localhost/);
      expect(frame.src).not.toContain('pixellab');
      const path = fileURLToPath(new URL(`frame-${String(index).padStart(2, '0')}.png`, ASSET_DIR));
      const bytes = readFileSync(path);
      expect(pngDimensions(bytes)).toEqual([256, 256]);
      encodedBytes += statSync(path).size;
    }
    expect(encodedBytes).toBe(track.encodedFrameBytes);
  });

  it('maps clamped normalized progress to deterministic bounded frame indices', () => {
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, -1).index).toBe(0);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 0).index).toBe(0);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 1 / 9 - Number.EPSILON).index).toBe(0);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 1 / 9).index).toBe(1);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 0.5).index).toBe(4);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 1).index).toBe(8);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, 9).index).toBe(8);
    expect(ISLAND_GROWTH_CUE_TARGETS).toEqual([0, 0.18, 0.38, 0.6, 0.8, 1]);
  });

  it('keeps the inspection contact sheet outside the runtime frame registry', () => {
    expect(CHAPTER2_ISLAND_GROWTH_TRACK.frames.every((frame) => !frame.src.includes('contact-sheet'))).toBe(true);
    const runtimeSource = [
      'island-growth-track.ts',
      'SemanticGrowthWorldView.tsx',
      'WorldSceneView.tsx',
      'SceneView.tsx',
    ].map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')).join('\n');
    expect(runtimeSource.match(/new URL\('\.\/assets\/chapter2-island-growth\/frame-\d\d\.png',\s*import\.meta\.url\)/g))
      .toHaveLength(9);
    expect(runtimeSource).not.toMatch(/contact-sheet\.png|pixellab\.ai|XMLHttpRequest|WebSocket|fetch\s*\(/i);
    expect(runtimeSource).not.toMatch(/API[_-]?KEY|SECRET|TOKEN/i);
  });

  it('produces the same cue/progress/frame trace after Back and after Replay without regeneration', () => {
    const settle = (state: ReturnType<typeof initialIslandGrowthPlayback>) =>
      advanceIslandGrowthPlayback(state, 10_000);
    const forward = [1, 2, 3, 4, 5].map((cue) => {
      const settled = settle(selectIslandGrowthCue(initialIslandGrowthPlayback(), cue, false));
      return [settled.cueIndex, settled.progress, islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, settled.progress).index];
    });

    let walked = initialIslandGrowthPlayback();
    walked = settle(selectIslandGrowthCue(walked, 1, false));
    walked = settle(selectIslandGrowthCue(walked, 2, false));
    walked = settle(selectIslandGrowthCue(walked, 3, false));
    const backed = settle(selectIslandGrowthCue(walked, 2, false));
    expect([backed.cueIndex, backed.progress, islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, backed.progress).index])
      .toEqual(forward[1]);

    let replayed = replayIslandGrowth(walked);
    expect(replayed.progress).toBe(0);
    const replayTrace = [1, 2, 3, 4, 5].map((cue) => {
      replayed = settle(selectIslandGrowthCue(replayed, cue, false));
      return [replayed.cueIndex, replayed.progress, islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, replayed.progress).index];
    });
    expect(replayTrace).toEqual(forward);
  });

  it('settles reduced motion immediately on the same mature endpoint retained by full motion', () => {
    const full = advanceIslandGrowthPlayback(
      selectIslandGrowthCue(initialIslandGrowthPlayback(), 5, false),
      10_000,
    );
    const reduced = selectIslandGrowthCue(initialIslandGrowthPlayback(), 5, true);
    expect(reduced.playing).toBe(false);
    expect(reduced.progress).toBe(1);
    expect(reduced.progress).toBe(full.progress);
    expect(islandGrowthFrameAtProgress(CHAPTER2_ISLAND_GROWTH_TRACK, reduced.progress).index).toBe(8);
  });
});
