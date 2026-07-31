import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
  ORGANIC_CANOPY_CUE_TARGETS,
  advanceOrganicCanopyPlayback,
  backOrganicCanopyCue,
  initialOrganicCanopyPlayback,
  nextOrganicCanopyCue,
  organicCanopyLayerAtProgress,
  organicCanopyPoseAtProgress,
  replayOrganicCanopyPlayback,
  selectOrganicCanopyCue,
  validateOrganicCanopyOcclusionTrack,
  type RegisteredOrganicCanopyOcclusionTrack,
} from './organic-canopy-occlusion-track.js';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function settle(
  state: ReturnType<typeof initialOrganicCanopyPlayback>,
): ReturnType<typeof initialOrganicCanopyPlayback> {
  return advanceOrganicCanopyPlayback(state, 10_000);
}

describe('Experiment 8 organic canopy occlusion track', () => {
  it('registers only the inherited wood/plants plus nine connected canopy poses on invariant sockets', () => {
    const track = validateOrganicCanopyOcclusionTrack(
      CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
    );
    expect(track.rigRootSocket).toEqual({ x: 0, y: 0 });
    expect(track.rigCrownSocket).toEqual({ x: 0, y: -98 });
    expect(track.parts.map((part) => part.id)).toEqual([
      'branch-left',
      'branch-right',
      'trunk-root',
      'flower-tuft',
      'fern-tuft',
    ]);
    expect(track.parts.map((part) => part.painterSlot)).toEqual([
      'branch-behind-canopy',
      'branch-behind-canopy',
      'trunk-front',
      'plant-foreground',
      'plant-foreground',
    ]);
    expect(track.canopy).toMatchObject({
      frameCount: 9,
      canvas: { width: 192, height: 176 },
      assetCrownSocket: { x: 96, y: 112 },
      collarBounds: { x: 72, y: 101, width: 49, height: 31 },
      collarCore: { x: 91, y: 105, width: 11, height: 18 },
      minimumOpaqueCollarPixels: 1100,
      painterSlot: 'canopy-collar',
    });
    expect(track.canopy.poses.map((pose) => pose.modulePath)).toEqual(
      Array.from(
        { length: 9 },
        (_, index) =>
          `./assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-${String(index).padStart(2, '0')}.png`,
      ),
    );
    expect(
      track.canopy.poses.every(
        (pose) =>
          pose.opaqueCollarPixels >= 1100 && pose.collarCoreMinimumAlpha === 255,
      ),
    ).toBe(true);
    expect(track.authoringEvidence.runtimeExcluded).toBe(true);
    expect(track.canopy.poses.map((pose) => pose.modulePath).join(' ')).not.toMatch(
      /canopy-(?:left|right|crown)/,
    );
  });

  it('selects canopy poses and cutout transforms deterministically without moving either socket', () => {
    const track = CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK;
    expect(organicCanopyPoseAtProgress(track, -1).index).toBe(0);
    expect(organicCanopyPoseAtProgress(track, 0.38).index).toBe(0);
    expect(organicCanopyPoseAtProgress(track, 0.66).index).toBe(4);
    expect(organicCanopyPoseAtProgress(track, 0.94).index).toBe(8);
    expect(organicCanopyPoseAtProgress(track, 1).index).toBe(8);

    const root = { x: 72.25, y: 91.5 };
    const young = organicCanopyLayerAtProgress(track, 0.38, root, 0.5);
    const mature = organicCanopyLayerAtProgress(track, 1, root, 0.5);
    const repeated = organicCanopyLayerAtProgress(track, 1, root, 0.5);
    expect(mature).toEqual(repeated);
    expect([young.worldRoot, mature.worldRoot]).toEqual([root, root]);
    expect([young.rigCrownSocket, mature.rigCrownSocket]).toEqual([
      { x: 0, y: -98 },
      { x: 0, y: -98 },
    ]);
    expect({
      x: mature.rigCrownSocket.x - mature.canopyPose.assetCrownSocket.x,
      y: mature.rigCrownSocket.y - mature.canopyPose.assetCrownSocket.y,
    }).toEqual({ x: -96, y: -210 });
    expect(mature.canopyPose.index).toBe(8);
    expect(mature.partPoses.every((pose) => pose.reveal === 1)).toBe(true);
    expect(mature.partPoses.find((pose) => pose.part.id === 'trunk-root')).toMatchObject({
      angleDeg: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('makes Back, Replay, and reduced settlement select equivalent app-owned progress and poses', () => {
    expect(ORGANIC_CANOPY_CUE_TARGETS).toEqual([0, 0.16, 0.38, 0.58, 0.78, 1]);
    let walked = initialOrganicCanopyPlayback();
    walked = settle(nextOrganicCanopyCue(walked, false));
    walked = settle(nextOrganicCanopyCue(walked, false));
    walked = settle(nextOrganicCanopyCue(walked, false));

    const backed = settle(backOrganicCanopyCue(walked, false));
    const direct = settle(selectOrganicCanopyCue(initialOrganicCanopyPlayback(), 2, false));
    expect(backed).toMatchObject({ cueIndex: direct.cueIndex, progress: direct.progress });
    expect(
      organicCanopyPoseAtProgress(CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK, backed.progress).index,
    ).toBe(
      organicCanopyPoseAtProgress(CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK, direct.progress).index,
    );

    let replayed = replayOrganicCanopyPlayback(walked);
    const replayTrace = [1, 2, 3, 4, 5].map(() => {
      replayed = settle(nextOrganicCanopyCue(replayed, false));
      return [
        replayed.cueIndex,
        replayed.progress,
        organicCanopyPoseAtProgress(
          CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
          replayed.progress,
        ).index,
      ];
    });
    const directTrace = [1, 2, 3, 4, 5].map((cueIndex) => {
      const state = settle(
        selectOrganicCanopyCue(initialOrganicCanopyPlayback(), cueIndex, false),
      );
      return [
        state.cueIndex,
        state.progress,
        organicCanopyPoseAtProgress(
          CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
          state.progress,
        ).index,
      ];
    });
    expect(replayTrace).toEqual(directTrace);

    const reduced = selectOrganicCanopyCue(initialOrganicCanopyPlayback(), 5, true);
    expect(reduced).toMatchObject({
      cueIndex: 5,
      progress: 1,
      targetProgress: 1,
      transitionMs: 0,
      holdMs: 0,
      playing: false,
    });
    expect(reduced.progress).toBe(settle(
      selectOrganicCanopyCue(initialOrganicCanopyPlayback(), 5, false),
    ).progress);
  });

  it('rejects broken collar evidence and has no runtime vendor, clock, or correction path', () => {
    const broken = structuredClone(
      CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
    ) as Mutable<RegisteredOrganicCanopyOcclusionTrack>;
    broken.canopy.poses[3]!.opaqueCollarPixels = 1099;
    expect(() =>
      validateOrganicCanopyOcclusionTrack(
        broken as RegisteredOrganicCanopyOcclusionTrack,
      ),
    ).toThrow(/collar registration/i);

    const source = readFileSync(
      fileURLToPath(new URL('./organic-canopy-occlusion-track.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/Date\.now|performance\.now|Math\.random|fetch\s*\(/);
    expect(source).not.toMatch(/pixellab|WebSocket|XMLHttpRequest/i);
    expect(source).not.toMatch(/positionCorrection|runtimeCorrection|correct(?:ed|ion)Offset/i);
    expect(source).not.toMatch(
      /new URL\([\s\S]{0,120}(?:crown-registration-plate|canopy-registration-report)/i,
    );
  });

  it('accepts a checked-in PNG that Vite inlines below its asset threshold', () => {
    const bundled = structuredClone(
      CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK,
    ) as Mutable<RegisteredOrganicCanopyOcclusionTrack>;
    bundled.canopy.poses[0]!.src = 'data:image/png;base64,iVBORw0KGgo=';

    expect(() =>
      validateOrganicCanopyOcclusionTrack(
        bundled as RegisteredOrganicCanopyOcclusionTrack,
      ),
    ).not.toThrow();
  });

  it('records the rejected low ellipse exclusion and the exact runtime-relative join offsets', () => {
    const report = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            './assets/chapter2-organic-canopy-occlusion/v1/canopy-registration-report.json',
            import.meta.url,
          ),
        ),
        'utf8',
      ),
    ) as {
      schemaVersion: number;
      crownSocket: { x: number; y: number };
      legacyCollarExclusion: { yFrom: number };
      runtimeRelativeOffsets: Record<string, { x: number; y: number }>;
      frames: Array<{
        registeredCrownSocket: { x: number; y: number };
        registeredFootprint: { x: number; y: number; width: number; height: number };
        legacyCollarPixelsExcluded: number;
        opaqueCollarPixels: number;
        collarCoreMinimumAlpha: number;
      }>;
    };

    expect(report.schemaVersion).toBe(2);
    expect(report.crownSocket).toEqual({ x: 96, y: 112 });
    expect(report.legacyCollarExclusion).toEqual({
      yFrom: 141,
      reason: expect.stringMatching(/disconnected and blob-like/i),
    });
    expect(report.runtimeRelativeOffsets).toEqual({
      branchLeft: { x: -11, y: 46 },
      branchRight: { x: 76, y: 36 },
      trunk: { x: 48, y: 56 },
    });
    expect(report.frames).toHaveLength(9);
    expect(
      report.frames.every(
        (frame) =>
          frame.registeredCrownSocket.x === 96 &&
          frame.registeredCrownSocket.y === 112 &&
          frame.legacyCollarPixelsExcluded > 0 &&
          frame.registeredFootprint.y + frame.registeredFootprint.height <= 141 &&
          frame.opaqueCollarPixels >= 1100 &&
          frame.collarCoreMinimumAlpha === 255,
      ),
    ).toBe(true);
  });
});
