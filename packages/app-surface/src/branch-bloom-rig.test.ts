import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG } from './branch-bloom-assets.js';
import {
  branchBloomLayerAtProgress,
  branchBloomMatureBounds,
  clusterBloomPose,
  validateBranchBloomRig,
} from './branch-bloom-rig.js';
import {
  initialOrganicPosePlayback,
  replayOrganicPosePlayback,
  selectOrganicPoseCue,
} from './organic-pose-to-pose-track.js';

describe('branch-emitted leaf bloom hierarchical rig', () => {
  it('registers a bounded, reused family and attaches every cluster to an explicit branch-local socket after wood settles', () => {
    const rig = validateBranchBloomRig(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG);
    expect(rig.leafFamilyAssetIds).toHaveLength(3);
    expect(rig.clusters).toHaveLength(8);
    const reuse = Object.fromEntries(
      rig.leafFamilyAssetIds.map((assetId) => [
        assetId,
        rig.clusters.filter((cluster) => cluster.familyAssetId === assetId).length,
      ]),
    );
    expect(reuse).toEqual({
      'leaf-fan-spray': 3,
      'leaf-fork-rosette': 3,
      'leaf-tip-tuft': 2,
    });
    for (const cluster of rig.clusters) {
      const branch = rig.branches.find((candidate) => candidate.id === cluster.parentBranchId)!;
      const branchAsset = rig.assets.find((asset) => asset.id === branch.assetId)!;
      expect(cluster.bloom.start).toBeGreaterThanOrEqual(branch.settle.end);
      expect(cluster.branchLocalSocket.x).toBeGreaterThanOrEqual(0);
      expect(cluster.branchLocalSocket.x).toBeLessThan(branchAsset.canvas.width);
      expect(cluster.branchLocalSocket.y).toBeGreaterThanOrEqual(0);
      expect(cluster.branchLocalSocket.y).toBeLessThan(branchAsset.canvas.height);
    }
  });

  it('grows deterministically from zero, adds one bounded secondary settle, and retains the final scene', () => {
    const root = { x: 180, y: 140 };
    const initial = branchBloomLayerAtProgress(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, 0, root, 0.5);
    const mature = branchBloomLayerAtProgress(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, 1, root, 0.5);
    expect(initial.trunk.growScale).toBe(0);
    expect(initial.branches.every((branch) => branch.growScale === 0)).toBe(true);
    expect(initial.branches.flatMap((branch) => branch.clusters).every((leaf) => leaf.bloomScale === 0)).toBe(true);
    expect(mature.trunk.growScale).toBe(1);
    expect(mature.branches.every((branch) => branch.growScale === 1)).toBe(true);
    expect(mature.branches.flatMap((branch) => branch.clusters).every((leaf) => leaf.bloomScale > 0)).toBe(true);
    expect(branchBloomLayerAtProgress(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, 1, root, 0.5)).toEqual(mature);

    const cluster = CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG.clusters[0]!;
    const overshootProgress = cluster.bloom.start + (cluster.bloom.end - cluster.bloom.start) * 0.76;
    expect(clusterBloomPose(overshootProgress, cluster).scale).toBeGreaterThan(cluster.restScale);
    expect(clusterBloomPose(1, cluster).scale).toBeCloseTo(cluster.restScale, 12);
    expect(clusterBloomPose(1, cluster).rotation).toBe(cluster.restRotation);
  });

  it('keeps world root, branch sockets, painter order, camera bounds, Back and Replay deterministic', () => {
    const root = { x: 180, y: 140 };
    const layerAt = (progress: number) =>
      branchBloomLayerAtProgress(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, progress, root, 0.5);
    const proposed = layerAt(0.38);
    const healthy = layerAt(1);
    expect(proposed.worldRoot).toEqual(healthy.worldRoot);
    expect(proposed.branches.map((branch) => branch.trunkLocalSocket)).toEqual(
      healthy.branches.map((branch) => branch.trunkLocalSocket),
    );
    for (const branch of healthy.branches) {
      expect(branch.clusters.map((cluster) => cluster.painterOrder)).toEqual(
        [...branch.clusters].map((cluster) => cluster.painterOrder).sort((a, b) => a - b),
      );
    }
    expect(branchBloomMatureBounds(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, root, 0.5)).toEqual(
      branchBloomMatureBounds(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG, root, 0.5),
    );

    const finalCue = selectOrganicPoseCue(initialOrganicPosePlayback(), 5, true);
    const backCue = selectOrganicPoseCue(finalCue, 4, true);
    const forwardAgain = selectOrganicPoseCue(backCue, 5, true);
    expect(layerAt(forwardAgain.progress)).toEqual(layerAt(finalCue.progress));
    expect(layerAt(replayOrganicPosePlayback(finalCue).progress)).toEqual(layerAt(0));
  });

  it('stays within the registered asset/decode budget and contains no runtime vendor call path', () => {
    const rig = validateBranchBloomRig(CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG);
    const encoded = rig.assets.reduce((sum, asset) => sum + asset.encodedBytes, 0);
    const decoded = rig.assets.reduce((sum, asset) => sum + asset.decodedRgbaBytes, 0);
    expect(encoded).toBeLessThanOrEqual(rig.budget.maxEncodedBytes);
    expect(decoded).toBeLessThanOrEqual(rig.budget.maxDecodedRgbaBytes);

    const runtimeSources = ['branch-bloom-assets.ts', 'branch-bloom-rig.ts', 'SceneView.tsx']
      .map((name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'))
      .join('\n');
    expect(runtimeSources).not.toMatch(/fetch\s*\(|XMLHttpRequest|api\.pixellab\.ai/iu);
    const rigSources = ['branch-bloom-assets.ts', 'branch-bloom-rig.ts']
      .map((name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'))
      .join('\n');
    expect(rigSources).not.toMatch(/opacity\s*:/iu);

    const report = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('./assets/chapter2-organic-branch-bloom/v1/registration-report.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as {
      familySize: number;
      members: Array<{ socketAlpha: number }>;
      encodedLeafFamilyBytes: number;
      decodedLeafFamilyRgbaBytes: number;
    };
    expect(report.familySize).toBe(3);
    expect(report.members.every((member) => member.socketAlpha === 255)).toBe(true);
    expect(report.encodedLeafFamilyBytes).toBe(8_816);
    expect(report.decodedLeafFamilyRgbaBytes).toBe(49_152);
  });
});
