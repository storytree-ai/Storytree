// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, render } from '@testing-library/react';
import type { SceneNode } from '@storytree/forest-world';
import { describe, expect, it } from 'vitest';

import {
  CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK,
  CHAPTER2_HERO_TREE_KEYPOSE_TRACK,
  organicKeyPoseBlendAtProgress,
  organicProgressInWindow,
  validateOrganicKeyPoseTrack,
} from './organic-growth-track.js';
import {
  SemanticGrowthWorldView,
  type SemanticGrowthFrame,
  type SemanticGrowthOrganicComposition,
} from './SemanticGrowthWorldView.js';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';

const SOURCE_DIR = resolve(process.cwd(), 'src');
const ASSET_DIR = join(SOURCE_DIR, 'assets', 'chapter2-organic-keypose');

const EMPTY_LAYER = (kind: NonNullable<SceneNode['kind']>): SceneNode => ({
  el: 'g',
  kind,
  children: [],
});

const SCENE: SceneNode = {
  el: 'g',
  kind: 'world',
  transform: 'translate(12 8)',
  children: [
    EMPTY_LAYER('empties-layer'),
    EMPTY_LAYER('coast-layer'),
    EMPTY_LAYER('ground-mesh'),
    EMPTY_LAYER('trails-layer'),
    EMPTY_LAYER('flora-layer'),
    EMPTY_LAYER('hits-layer'),
  ],
};

const KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;
const FRAMES: readonly SemanticGrowthFrame[] = KEYS.map((key) => ({
  key,
  model: normalizeWorldPresentationModel({ scene: SCENE }),
}));

const ORGANIC: SemanticGrowthOrganicComposition = {
  placements: [
    {
      instanceId: 'hero-tree',
      track: CHAPTER2_HERO_TREE_KEYPOSE_TRACK,
      worldAnchor: { x: 100, y: 80 },
      scale: 0.34,
      depthSlot: 'organic-tree-back',
      progressWindow: { start: 0.2, end: 0.92 },
    },
    {
      instanceId: 'plant-alpha',
      track: CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK,
      worldAnchor: { x: 78, y: 91 },
      scale: 0.18,
      depthSlot: 'organic-ground-front',
      progressWindow: { start: 0.5, end: 0.88 },
    },
    {
      instanceId: 'plant-beta',
      track: CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK,
      worldAnchor: { x: 123, y: 93 },
      scale: 0.16,
      mirrorX: true,
      depthSlot: 'organic-ground-front',
      progressWindow: { start: 0.68, end: 1 },
    },
  ],
};

function poseSnapshot(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('image[data-organic-instance]')).map((image) =>
    [
      image.getAttribute('data-organic-instance'),
      image.getAttribute('data-organic-pose'),
      image.getAttribute('data-blend-role'),
      image.getAttribute('data-blend-weight'),
      image.getAttribute('data-world-anchor-x'),
      image.getAttribute('data-world-anchor-y'),
      image.getAttribute('transform'),
    ].join('|'),
  );
}

function navButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll('nav[aria-label="Semantic growth controls"] button'),
  ).find((candidate) => candidate.textContent === label);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing ${label} button`);
  return button;
}

describe('registered organic key-pose tracks', () => {
  it('pogt-assets-are-transparent-local-and-provenanced: normalized local RGBA poses and budgets match the author report', () => {
    const report = JSON.parse(
      readFileSync(join(ASSET_DIR, 'normalization-report.json'), 'utf8'),
    ) as {
      runtimeEncodedPoseBytes: number;
      runtimeDecodedRgbaBytes: number;
      tracks: Array<{
        id: string;
        poseCount: number;
        canvas: { width: number; height: number };
        targetAnchor: { x: number; y: number };
        poses: Array<{
          file: string;
          normalizedAnchor: { x: number; y: number };
          normalizedFootprint: { width: number; height: number };
          removedMattePixels: number;
          removedGroundPixels: number;
        }>;
      }>;
    };
    expect(validateOrganicKeyPoseTrack(CHAPTER2_HERO_TREE_KEYPOSE_TRACK)).toBe(
      CHAPTER2_HERO_TREE_KEYPOSE_TRACK,
    );
    expect(validateOrganicKeyPoseTrack(CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK)).toBe(
      CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK,
    );
    expect(report.runtimeEncodedPoseBytes).toBe(149_482);
    expect(report.runtimeDecodedRgbaBytes).toBe(1_245_184);
    expect(report.runtimeEncodedPoseBytes).toBeLessThanOrEqual(180_000);
    expect(report.runtimeDecodedRgbaBytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);

    for (const track of report.tracks) {
      expect(track.poses).toHaveLength(track.poseCount);
      for (const pose of track.poses) {
        expect(pose.normalizedAnchor).toEqual(track.targetAnchor);
        expect(pose.normalizedFootprint.width).toBeLessThan(track.canvas.width);
        expect(pose.normalizedFootprint.height).toBeLessThan(track.canvas.height);
        const bytes = readFileSync(
          join(ASSET_DIR, track.id === 'hero-tree' ? 'tree' : 'plant', pose.file),
        );
        expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
        expect(bytes.readUInt32BE(16)).toBe(track.canvas.width);
        expect(bytes.readUInt32BE(20)).toBe(track.canvas.height);
        expect(bytes[25], 'PNG IHDR colour type must be RGBA').toBe(6);
      }
    }
    expect(report.tracks[0]?.poses.some((pose) => pose.removedMattePixels > 0)).toBe(true);
    expect(
      report.tracks
        .flatMap((track) => track.poses)
        .some((pose) => pose.removedGroundPixels > 0),
    ).toBe(true);
  });

  it('pogt-provenance-manifest-is-complete: every shipped pose has a PixelLab prompt, job, crop contract and bounded runtime budget', () => {
    const manifestText = readFileSync(join(ASSET_DIR, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText) as {
      experiment: {
        status: string;
        queryGate: string;
        rendererCount: number;
      };
      authoring: {
        provider: string;
        runtimeDependency: boolean;
        referencePlate: {
          file: string;
          submittedToModel: boolean;
          honestyNote: string;
        };
        normalization: { report: string; script: string };
      };
      tracks: Array<{
        id: string;
        rootAnchor: { x: number; y: number };
        poseCount: number;
        poseOrder: string[];
        blendRegion: string;
        poses: Array<{
          index: number;
          jobId: string;
          seed: number;
          prompt: string;
          request: { width: number; height: number; no_background: boolean };
          source: { file: string; encodedBytes: number; sha256: string };
          runtime: { file: string; encodedBytes: number; sha256: string };
        }>;
      }>;
      budget: {
        runtimePoseCount: number;
        runtimeEncodedPoseBytes: number;
        runtimeDecodedRgbaBytes: number;
        runtimeEncodedLimitBytes: number;
        runtimeDecodedLimitBytes: number;
        maximumSimultaneousImageElements: number;
      };
    };

    expect(manifest.experiment).toMatchObject({
      status: 'comparison-only-awaiting-owner-LOOK',
      queryGate: 'organicGrowth=organic-keypose-blend',
      rendererCount: 1,
    });
    expect(manifest.authoring.provider).toBe('PixelLab');
    expect(manifest.authoring.runtimeDependency).toBe(false);
    expect(manifest.authoring.referencePlate.submittedToModel).toBe(false);
    expect(manifest.authoring.referencePlate.honestyNote).toMatch(/not falsely reported/iu);
    expect(
      readFileSync(join(ASSET_DIR, manifest.authoring.referencePlate.file)),
    ).not.toHaveLength(0);
    expect(manifest.authoring.normalization).toMatchObject({
      report: 'normalization-report.json',
      script: '../../../../art-authoring/scripts/register-organic-keyposes.mts',
    });

    const poses = manifest.tracks.flatMap((track) => {
      expect(track.poses).toHaveLength(track.poseCount);
      expect(track.poseOrder).toEqual(track.poses.map((pose) => pose.runtime.file));
      expect(track.blendRegion).toMatch(/local-canvas/iu);
      for (const pose of track.poses) {
        expect(pose.index).toBeGreaterThanOrEqual(0);
        expect(pose.jobId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
        );
        expect(pose.seed).toBeGreaterThan(0);
        expect(pose.prompt.length).toBeGreaterThan(120);
        expect(pose.prompt).toMatch(/transparent cutout only/iu);
        expect(pose.prompt).toMatch(/no (?:grass tile|base)/iu);
        expect(pose.request.no_background).toBe(true);
        expect(pose.source.sha256).toMatch(/^[0-9a-f]{64}$/u);
        expect(pose.runtime.sha256).toMatch(/^[0-9a-f]{64}$/u);
        expect(readFileSync(join(ASSET_DIR, pose.source.file))).toHaveLength(
          pose.source.encodedBytes,
        );
        expect(readFileSync(join(ASSET_DIR, pose.runtime.file))).toHaveLength(
          pose.runtime.encodedBytes,
        );
      }
      return track.poses;
    });
    expect(poses).toHaveLength(manifest.budget.runtimePoseCount);
    expect(manifest.budget.runtimeEncodedPoseBytes).toBeLessThanOrEqual(
      manifest.budget.runtimeEncodedLimitBytes,
    );
    expect(manifest.budget.runtimeDecodedRgbaBytes).toBeLessThanOrEqual(
      manifest.budget.runtimeDecodedLimitBytes,
    );
    expect(manifest.budget.maximumSimultaneousImageElements).toBeLessThanOrEqual(6);
    expect(manifestText).not.toMatch(
      /(?:api[_-]?key|authorization|bearer|password|secret)\s*[:=]\s*["'][^"']+/iu,
    );
  });

  it('pogt-progress-selects-organic-frames-deterministically: blend math is clamped, adjacent, eased and bounded to two poses', () => {
    expect(organicProgressInWindow(-1, { start: 0.2, end: 0.8 })).toBe(0);
    expect(organicProgressInWindow(0.5, { start: 0.2, end: 0.8 })).toBeCloseTo(0.5);
    expect(organicProgressInWindow(2, { start: 0.2, end: 0.8 })).toBe(1);

    for (const progress of [-1, 0, 0.1, 1 / 3, 0.5, 2 / 3, 0.9, 1, 3]) {
      const first = organicKeyPoseBlendAtProgress(
        CHAPTER2_HERO_TREE_KEYPOSE_TRACK,
        progress,
      );
      const second = organicKeyPoseBlendAtProgress(
        CHAPTER2_HERO_TREE_KEYPOSE_TRACK,
        progress,
      );
      expect(second).toEqual(first);
      expect(first.to.index - first.from.index).toBeGreaterThanOrEqual(0);
      expect(first.to.index - first.from.index).toBeLessThanOrEqual(1);
      expect(first.fromOpacity).toBeGreaterThanOrEqual(0);
      expect(first.toOpacity).toBeGreaterThanOrEqual(0);
      expect(first.fromOpacity + first.toOpacity).toBeLessThanOrEqual(1);
      expect(first.fromScale).toBeGreaterThanOrEqual(1);
      expect(first.fromScale).toBeLessThanOrEqual(1.015);
      expect(first.toScale).toBeGreaterThanOrEqual(0.985);
      expect(first.toScale).toBeLessThanOrEqual(1);
    }
    const final = organicKeyPoseBlendAtProgress(CHAPTER2_HERO_TREE_KEYPOSE_TRACK, 1);
    expect(final.from.index).toBe(3);
    expect(final.to.index).toBe(3);
    expect(final.fromOpacity).toBe(1);
    expect(final.toOpacity).toBe(0);
  });

  it('pogt-reference-camera-and-sockets-are-invariant: local transform and both blend sides share one planted world root', async () => {
    const view = render(
      <SemanticGrowthWorldView frames={FRAMES} organicGrowth={ORGANIC} reducedMotion />,
    );
    await act(async () => navButton(view.container, 'Next').click());
    await act(async () => navButton(view.container, 'Next').click());
    const hero = Array.from(
      view.container.querySelectorAll('image[data-organic-instance="hero-tree"]'),
    );
    expect(hero).toHaveLength(2);
    for (const image of hero) {
      expect(image.getAttribute('data-world-anchor-x')).toBe('100.0');
      expect(image.getAttribute('data-world-anchor-y')).toBe('80.0');
      expect(image.getAttribute('transform')).toMatch(
        /^translate\(100\.0 80\.0\) scale\([^)]*\) translate\(-128\.0 -240\.0\)$/u,
      );
    }
    const weights = hero.map((image) => Number(image.getAttribute('data-blend-weight')));
    expect(weights[0]! + weights[1]!).toBeCloseTo(1, 3);
    expect(view.container.querySelector('svg')?.getAttribute('opacity')).toBeNull();
    expect(
      view.container.querySelector('.coast-fill-group')?.getAttribute('opacity'),
    ).toBeUndefined();
  });

  it('pogt-navigation-and-reduced-motion-settle-equivalently: Back/Next and Replay retain the same final poses without remounting', async () => {
    const view = render(
      <SemanticGrowthWorldView frames={FRAMES} organicGrowth={ORGANIC} reducedMotion />,
    );
    const next = navButton(view.container, 'Next');
    const back = navButton(view.container, 'Back');
    const replay = navButton(view.container, 'Replay');

    for (let index = 1; index < KEYS.length; index += 1) {
      await act(async () => next.click());
    }
    const finalA = poseSnapshot(view.container);
    expect(finalA).toHaveLength(3);
    expect(
      view.container
        .querySelector('[data-semantic-growth-frame]')
        ?.getAttribute('data-organic-growth-progress'),
    ).toBe('1.0000');

    await act(async () => back.click());
    await act(async () => next.click());
    expect(poseSnapshot(view.container)).toEqual(finalA);

    await act(async () => replay.click());
    expect(poseSnapshot(view.container)).toEqual([]);
    for (let index = 1; index < KEYS.length; index += 1) {
      await act(async () => next.click());
    }
    expect(poseSnapshot(view.container)).toEqual(finalA);
  });

  it('pogt-layers-compose-over-retained-svg-in-one-scene-order: every instance contributes at most two local images and no scene snapshot', async () => {
    const view = render(
      <SemanticGrowthWorldView frames={FRAMES} organicGrowth={ORGANIC} reducedMotion />,
    );
    const next = navButton(view.container, 'Next');
    for (let index = 1; index <= 3; index += 1) {
      await act(async () => next.click());
    }
    const images = Array.from(view.container.querySelectorAll('image[data-organic-instance]'));
    const counts = new Map<string, number>();
    for (const image of images) {
      const instance = image.getAttribute('data-organic-instance') ?? '';
      counts.set(instance, (counts.get(instance) ?? 0) + 1);
      expect(image.getAttribute('data-blend-region')).toBe(`${instance}-local-canvas`);
      expect(image.getAttribute('data-depth-slot')).toMatch(/^organic-/u);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect(view.container.querySelector('[data-depth-slot="island-growth-composite"]')).toBeNull();
    expect(view.container.querySelectorAll('image[data-organic-instance]').length).toBeLessThanOrEqual(
      ORGANIC.placements.length * 2,
    );
  });

  it('pogt-runtime-and-capability-seams-stay-bounded: runtime source contains no vendor call, remote asset or credential seam', () => {
    const runtimeSources = [
      'organic-growth-track.ts',
      'SemanticGrowthWorldView.tsx',
      'SceneView.tsx',
    ]
      .map((name) => readFileSync(join(SOURCE_DIR, name), 'utf8'))
      .join('\n');
    const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
    expect(runtimeSources).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|api\.pixellab\.ai/iu);
    expect(packageJson).not.toMatch(/pixellab/iu);
    expect(CHAPTER2_HERO_TREE_KEYPOSE_TRACK.poseCount).toBeLessThanOrEqual(4);
    expect(CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK.poseCount).toBeLessThanOrEqual(3);
    expect(ORGANIC.placements).toHaveLength(3);
    expect(ASSET_DIR).not.toMatch(/https?:/u);
  });
});
