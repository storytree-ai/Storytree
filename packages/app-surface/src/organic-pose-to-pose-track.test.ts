import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORGANIC_POSE_CUE_TARGETS,
  ORGANIC_POSE_PLAYBACK_POLICY,
  advanceOrganicPosePlayback,
  backOrganicPoseCue,
  initialOrganicPosePlayback,
  nextOrganicPoseCue,
  organicPoseFrameAtProgress,
  replayOrganicPosePlayback,
  selectOrganicPoseCue,
  validateOrganicPoseRegistry,
  type OrganicPoseTrack,
  type RegisteredOrganicPoseRegistry,
} from './organic-pose-to-pose-track.js';

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function makeTrack(
  kind: OrganicPoseTrack['kind'],
  groundAnchor: OrganicPoseTrack['groundAnchor'],
): Mutable<OrganicPoseTrack> {
  const id = kind === 'hero-tree' ? 'experiment-1-hero-tree' : 'experiment-1-plant-sample';
  const depthSlot =
    kind === 'hero-tree' ? 'hero-tree-organic' : 'ground-plant-organic';
  const moduleDirectory =
    kind === 'hero-tree' ? 'placeholder-hero' : 'placeholder-plant';
  const thresholds = [0, 0.2, 0.5, 0.8] as const;
  const holdUntil = [0.2, 0.5, 0.8, 1] as const;
  const frames = thresholds.map((_, index) => {
    const sourceAnchor = {
      x: groundAnchor.x + index - 2,
      y: groundAnchor.y - index - 1,
    };
    const normalizationOffset = {
      x: groundAnchor.x - sourceAnchor.x,
      y: groundAnchor.y - sourceAnchor.y,
    };
    return {
      index,
      modulePath: `./assets/${moduleDirectory}/frame-${index}.png` as const,
      src: `/assets/${moduleDirectory}/frame-${index}.png`,
      sourceAnchor,
      normalizationOffset,
      normalizedAnchor: groundAnchor,
    };
  });

  return {
    id,
    kind,
    assetOrigin: 'checked-in-module-url',
    transparent: true,
    canvas: { width: 256, height: 256 },
    frameDimensions: { width: 256, height: 256 },
    frameCount: frames.length,
    frames,
    poses: thresholds.map((threshold, index) => ({
      frameIndex: index,
      threshold,
      holdUntil: holdUntil[index]!,
    })),
    groundAnchor,
    normalizationMode: 'author-import-time-only',
    depthSlot,
    matureFootprint: { x: 32, y: 16, width: 192, height: 224 },
    encodedBytes: kind === 'hero-tree' ? 400 : 240,
    decodedRgbaBytes: 1_048_576,
    provenance: {
      prompt: `transparent ${kind} pose sequence`,
      modelId: 'authoring-model-placeholder',
      generationId: 'authoring-generation-placeholder',
      licence: 'project-approved-placeholder',
      notes: 'Experiment 1 fixture metadata, not a runtime vendor request.',
      referencePlateId: 'real-svg-island-camera-reference',
    },
  };
}

function makeRegistry(): Mutable<RegisteredOrganicPoseRegistry> {
  return {
    id: 'experiment-1-pose-to-pose',
    tracks: [
      makeTrack('hero-tree', { x: 128, y: 211 }),
      makeTrack('plant-sample', { x: 79, y: 223 }),
    ],
    budget: {
      maxEncodedBytes: 700,
      maxDecodedRgbaBytes: 2_100_000,
      maxFrameCount: 8,
      maxLayerCount: 2,
    },
  };
}

function settle(
  state: ReturnType<typeof initialOrganicPosePlayback>,
): ReturnType<typeof initialOrganicPosePlayback> {
  return advanceOrganicPosePlayback(state, 10_000);
}

describe('Experiment 1 organic pose-to-pose tracks', () => {
  it('registers separate transparent local hero-tree and bounded plant tracks with costs', () => {
    const registry = validateOrganicPoseRegistry(makeRegistry());
    expect(registry.tracks.map((track) => track.kind)).toEqual([
      'hero-tree',
      'plant-sample',
    ]);
    expect(registry.tracks.every((track) => track.transparent)).toBe(true);
    expect(registry.tracks.every((track) => track.assetOrigin === 'checked-in-module-url'))
      .toBe(true);
    expect(registry.tracks.flatMap((track) => track.frames))
      .toHaveLength(registry.budget.maxFrameCount);
    expect(registry.budget).toEqual({
      maxEncodedBytes: 700,
      maxDecodedRgbaBytes: 2_100_000,
      maxFrameCount: 8,
      maxLayerCount: 2,
    });
  });

  it('maps normalized semantic progress through explicit deterministic pose holds', () => {
    const [hero] = validateOrganicPoseRegistry(makeRegistry()).tracks;
    expect(hero?.poses).toEqual([
      { frameIndex: 0, threshold: 0, holdUntil: 0.2 },
      { frameIndex: 1, threshold: 0.2, holdUntil: 0.5 },
      { frameIndex: 2, threshold: 0.5, holdUntil: 0.8 },
      { frameIndex: 3, threshold: 0.8, holdUntil: 1 },
    ]);
    expect(organicPoseFrameAtProgress(hero!, -1).index).toBe(0);
    expect(organicPoseFrameAtProgress(hero!, 0.199_999).index).toBe(0);
    expect(organicPoseFrameAtProgress(hero!, 0.2).index).toBe(1);
    expect(organicPoseFrameAtProgress(hero!, 0.5).index).toBe(2);
    expect(organicPoseFrameAtProgress(hero!, 0.799_999).index).toBe(2);
    expect(organicPoseFrameAtProgress(hero!, 0.8).index).toBe(3);
    expect(organicPoseFrameAtProgress(hero!, 1).index).toBe(3);
    expect(organicPoseFrameAtProgress(hero!, Number.POSITIVE_INFINITY).index).toBe(3);
  });

  it('owns six cue transitions, smoothstep easing, and holds in app state', () => {
    expect(ORGANIC_POSE_CUE_TARGETS).toEqual([0, 0.18, 0.38, 0.6, 0.8, 1]);
    expect(ORGANIC_POSE_PLAYBACK_POLICY.easing).toBe('smoothstep');
    expect(ORGANIC_POSE_PLAYBACK_POLICY.transitionMs).toHaveLength(6);
    expect(ORGANIC_POSE_PLAYBACK_POLICY.holdMs).toHaveLength(6);

    const selected = selectOrganicPoseCue(initialOrganicPosePlayback(), 3, false);
    const quarter = advanceOrganicPosePlayback(selected, selected.transitionMs / 4);
    expect(quarter.phase).toBe('transitioning');
    expect(quarter.progress).toBeCloseTo(selected.targetProgress * 0.15625);

    const atTarget = advanceOrganicPosePlayback(selected, selected.transitionMs);
    expect(atTarget.progress).toBe(selected.targetProgress);
    expect(atTarget.phase).toBe('holding');
    const settled = advanceOrganicPosePlayback(
      selected,
      selected.transitionMs + selected.holdMs,
    );
    expect(settled.phase).toBe('settled');
    expect(settled.playing).toBe(false);
  });

  it('makes Next, Back, and Replay select equivalent cue, progress, and frames', () => {
    const registry = validateOrganicPoseRegistry(makeRegistry());
    let walked = initialOrganicPosePlayback();
    walked = settle(nextOrganicPoseCue(walked, false));
    walked = settle(nextOrganicPoseCue(walked, false));
    walked = settle(nextOrganicPoseCue(walked, false));

    const backed = settle(backOrganicPoseCue(walked, false));
    const direct = settle(selectOrganicPoseCue(initialOrganicPosePlayback(), 2, false));
    expect([backed.cueIndex, backed.progress]).toEqual([direct.cueIndex, direct.progress]);
    expect(
      registry.tracks.map((track) =>
        organicPoseFrameAtProgress(track, backed.progress).index),
    ).toEqual(
      registry.tracks.map((track) =>
        organicPoseFrameAtProgress(track, direct.progress).index),
    );

    let replayed = replayOrganicPosePlayback(walked);
    const replayTrace = [1, 2, 3, 4, 5].map(() => {
      replayed = settle(nextOrganicPoseCue(replayed, false));
      return [
        replayed.cueIndex,
        replayed.progress,
        ...registry.tracks.map((track) =>
          organicPoseFrameAtProgress(track, replayed.progress).index),
      ];
    });
    const directTrace = [1, 2, 3, 4, 5].map((cueIndex) => {
      const state = settle(
        selectOrganicPoseCue(initialOrganicPosePlayback(), cueIndex, false),
      );
      return [
        state.cueIndex,
        state.progress,
        ...registry.tracks.map((track) =>
          organicPoseFrameAtProgress(track, state.progress).index),
      ];
    });
    expect(replayTrace).toEqual(directTrace);
  });

  it('settles reduced motion immediately on the same cue endpoints and frames', () => {
    const registry = validateOrganicPoseRegistry(makeRegistry());
    const full = settle(selectOrganicPoseCue(initialOrganicPosePlayback(), 5, false));
    const reduced = selectOrganicPoseCue(initialOrganicPosePlayback(), 5, true);
    expect(reduced).toMatchObject({
      cueIndex: 5,
      progress: 1,
      targetProgress: 1,
      transitionMs: 0,
      holdMs: 0,
      phase: 'settled',
      playing: false,
    });
    expect(reduced.progress).toBe(full.progress);
    expect(
      registry.tracks.map((track) =>
        organicPoseFrameAtProgress(track, reduced.progress).index),
    ).toEqual(
      registry.tracks.map((track) =>
        organicPoseFrameAtProgress(track, full.progress).index),
    );
  });

  it('requires registered anchors normalized only by recorded author-time offsets', () => {
    const registry = validateOrganicPoseRegistry(makeRegistry());
    for (const track of registry.tracks) {
      expect(track.normalizationMode).toBe('author-import-time-only');
      for (const frame of track.frames) {
        expect({
          x: frame.sourceAnchor.x + frame.normalizationOffset.x,
          y: frame.sourceAnchor.y + frame.normalizationOffset.y,
        }).toEqual(track.groundAnchor);
        expect(frame.normalizedAnchor).toEqual(track.groundAnchor);
      }
    }

    const drifting = makeRegistry();
    drifting.tracks[0]!.frames[1]!.normalizedAnchor = { x: 130, y: 211 };
    expect(() => validateOrganicPoseRegistry(drifting)).toThrow(/anchor/i);
  });

  it('rejects remote/runtime vendor, credential, client, and asset-clock fields', () => {
    const remote = makeRegistry();
    remote.tracks[0]!.frames[0]!.src =
      'https://api.pixellab.ai/organic/frame-0.png';
    expect(() => validateOrganicPoseRegistry(remote)).toThrow(
      /runtime PixelLab URL|local module URL/i,
    );

    for (const field of ['pixelLabClient', 'apiKey', 'credential', 'assetClock']) {
      const unsafe = makeRegistry() as Mutable<RegisteredOrganicPoseRegistry> &
        Record<string, unknown>;
      unsafe[field] = 'must-not-enter-runtime';
      expect(() => validateOrganicPoseRegistry(unsafe)).toThrow(/runtime field/i);
    }

    const overBudget = makeRegistry();
    overBudget.budget.maxLayerCount = 1;
    expect(() => validateOrganicPoseRegistry(overBudget)).toThrow(/layer budget/i);

    const source = readFileSync(
      fileURLToPath(new URL('./organic-pose-to-pose-track.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/Date\.now|performance\.now|Math\.random|fetch\s*\(/);
    expect(source).not.toMatch(/pixellab\.ai|WebSocket|XMLHttpRequest/i);
  });
});
