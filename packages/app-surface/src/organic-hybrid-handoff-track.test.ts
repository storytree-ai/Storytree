import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  advanceOrganicPosePlayback,
  initialOrganicPosePlayback,
  replayOrganicPosePlayback,
  selectOrganicPoseCue,
} from './organic-pose-to-pose-track.js';
import {
  CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG,
  organicHybridHandoffAtProgress,
  validateOrganicHybridHandoffRig,
} from './organic-hybrid-handoff-track.js';

const ROOT = Object.freeze({ x: 318.25, y: 274.5 });

function settle(state: ReturnType<typeof initialOrganicPosePlayback>) {
  return advanceOrganicPosePlayback(state, 10_000);
}

describe('Experiment 10 registered hybrid handoff', () => {
  it('uses only the liked cutout trunk/plants and the preferred pose whole-tree track', () => {
    const rig = validateOrganicHybridHandoffRig(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG);
    expect(rig.cutoutParts.map((part) => [part.id, part.kind])).toEqual([
      ['trunk-root', 'rooted-trunk'],
      ['flower-tuft', 'ground-plant'],
      ['fern-tuft', 'ground-plant'],
    ]);
    expect(rig.cutoutParts.some((part) => part.id.includes('canopy'))).toBe(false);
    expect(rig.poseTreeTrack.kind).toBe('hero-tree');
    expect(rig.technique).toBe('registered-hybrid-handoff');
    expect(rig.matchCut).toBe(true);
    expect(rig.localBlend).toBe('none');
  });

  it('match-cuts one registered trunk into continuity pose 03 without a double trunk', () => {
    const rig = CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG;
    const before = organicHybridHandoffAtProgress(rig, rig.handoffAt - 0.0001, ROOT);
    const at = organicHybridHandoffAtProgress(rig, rig.handoffAt, ROOT);
    expect(before.phase).toBe('cutout-trunk');
    expect(before.cutoutLayer.poses.some((pose) => pose.part.id === 'trunk-root')).toBe(true);
    expect(before.poseTreeFrame).toBeNull();
    expect(at.phase).toBe('continuity-pose');
    expect(at.cutoutLayer.poses.some((pose) => pose.part.id === 'trunk-root')).toBe(false);
    expect(at.poseTreeFrame?.index).toBe(3);
    expect(at.handoff).toEqual({
      kind: 'match-cut',
      continuityPoseFrame: 3,
      localBlend: 'none',
      doubleTrunk: false,
    });
    expect(at.cutoutLayer.worldRoot).toEqual(ROOT);
    expect(rig.continuityPose.heightDeltaRatio).toBeLessThan(0.03);
  });

  it('keeps plants on the cutout choreography while the pose crown reaches its mature frame', () => {
    const state = organicHybridHandoffAtProgress(
      CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG,
      1,
      ROOT,
    );
    expect(state.phase).toBe('pose-to-pose-crown');
    expect(state.poseTreeFrame?.index).toBe(8);
    expect(state.cutoutLayer.poses.map((pose) => pose.part.id)).toEqual([
      'flower-tuft',
      'fern-tuft',
    ]);
    expect(state.cutoutLayer.poses.every((pose) => pose.reveal === 1)).toBe(true);
  });

  it('maps Back and Replay to the same registered handoff states and reduced-motion endpoints', () => {
    let walked = initialOrganicPosePlayback();
    walked = settle(selectOrganicPoseCue(walked, 4, false));
    const backed = settle(selectOrganicPoseCue(walked, 2, false));
    const direct = settle(selectOrganicPoseCue(initialOrganicPosePlayback(), 2, false));
    expect(
      organicHybridHandoffAtProgress(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG, backed.progress, ROOT),
    ).toEqual(
      organicHybridHandoffAtProgress(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG, direct.progress, ROOT),
    );

    const replayed = replayOrganicPosePlayback(walked);
    const replayEnd = settle(selectOrganicPoseCue(replayed, 5, false));
    const reducedEnd = selectOrganicPoseCue(initialOrganicPosePlayback(), 5, true);
    expect(reducedEnd.progress).toBe(replayEnd.progress);
    expect(
      organicHybridHandoffAtProgress(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG, reducedEnd.progress, ROOT),
    ).toEqual(
      organicHybridHandoffAtProgress(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG, replayEnd.progress, ROOT),
    );
  });

  it('keeps all runtime art local, budgeted, and free of a PixelLab call or secret', () => {
    const rig = validateOrganicHybridHandoffRig(CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG);
    expect(rig.budget.encodedBytes).toBeLessThanOrEqual(rig.budget.encodedByteLimit);
    expect(rig.budget.decodedRgbaBytes).toBeLessThanOrEqual(rig.budget.decodedRgbaByteLimit);
    const source = readFileSync(
      fileURLToPath(new URL('./organic-hybrid-handoff-track.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/fetch\s*\(|WebSocket|XMLHttpRequest|api[-_]?key|credentials?/i);
    expect(source).not.toMatch(/https?:\/\/(?:[^/]*\.)?pixellab\.ai/i);
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            './assets/chapter2-organic-hybrid-handoff/manifest.json',
            import.meta.url,
          ),
        ),
        'utf8',
      ),
    ) as { runtime: { pixelLabCalls: number; pixelLabCredentials: number } };
    expect(manifest.runtime).toEqual(expect.objectContaining({
      pixelLabCalls: 0,
      pixelLabCredentials: 0,
    }));
  });
});
