import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG,
  CUTOUT_PUPPET_CUE_TARGETS,
  advanceCutoutPuppetPlayback,
  cutoutPuppetLayerAtProgress,
  cutoutPuppetPosesAtProgress,
  initialCutoutPuppetPlayback,
  replayCutoutPuppet,
  selectCutoutPuppetCue,
  validateCutoutPuppetRig,
} from './cutout-puppet-rig.js';

const ASSET_DIR = new URL(
  './assets/chapter2-organic-cutout-puppet/v1/',
  import.meta.url,
);

function pngDimensions(bytes: Uint8Array): readonly [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

describe('registered Chapter 2 organic cutout puppet rig', () => {
  it('registers eight local transparent components within the encoded/decode budget', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    expect(validateCutoutPuppetRig(rig)).toEqual([]);
    expect(rig.parts).toHaveLength(8);
    expect(rig.matureFootprint).toEqual({ x: -84, y: -211, width: 170, height: 221 });
    expect(rig.encodedComponentBytes).toBe(28_885);
    expect(rig.decodedRgbaBytes).toBe(321_536);

    let encodedBytes = 0;
    for (const part of rig.parts) {
      expect(part.src).toMatch(/^file:|^\/|^[A-Za-z]:|^https?:\/\/localhost/);
      expect(part.src).not.toContain('pixellab');
      const path = fileURLToPath(new URL(part.modulePath.split('/').at(-1)!, ASSET_DIR));
      const bytes = readFileSync(path);
      expect(pngDimensions(bytes)).toEqual([part.canvas.width, part.canvas.height]);
      expect(bytes[25], `${part.id} must be an RGBA PNG`).toBe(6);
      encodedBytes += statSync(path).size;
    }
    expect(encodedBytes).toBe(rig.encodedComponentBytes);
  });

  it('keeps shipped provenance, registration and budgets in lockstep with the executable rig', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    const manifest = JSON.parse(
      readFileSync(new URL('manifest.json', ASSET_DIR), 'utf8'),
    ) as {
      authorTimeOnly: boolean;
      runtimePixelLabDependency: boolean;
      runtimeCredentialRequired: boolean;
      rig: {
        matureFootprint: typeof rig.matureFootprint;
        components: Array<{
          id: string;
          pivot: readonly [number, number];
          socket: readonly [number, number];
          layerDepth: number;
        }>;
      };
      budgets: {
        encodedRuntimeBytes: number;
        decodedRgbaBytes: number;
      };
      provenance: {
        jobs: string[];
        credentialsPrintedOrCommitted: boolean;
      };
    };
    const prompts = JSON.parse(
      readFileSync(new URL('prompts.json', ASSET_DIR), 'utf8'),
    ) as {
      components: Array<{ id: string; jobId: string; prompt: string }>;
    };
    const registration = JSON.parse(
      readFileSync(new URL('registration-report.json', ASSET_DIR), 'utf8'),
    ) as {
      components: Array<{
        file: string;
        normalizedPivot: { x: number; y: number };
      }>;
      encodedComponentBytes: number;
      decodedRgbaBytes: number;
    };

    expect(manifest.authorTimeOnly).toBe(true);
    expect(manifest.runtimePixelLabDependency).toBe(false);
    expect(manifest.runtimeCredentialRequired).toBe(false);
    expect(manifest.provenance.credentialsPrintedOrCommitted).toBe(false);
    expect(manifest.rig.matureFootprint).toEqual(rig.matureFootprint);
    expect(manifest.budgets).toMatchObject({
      encodedRuntimeBytes: rig.encodedComponentBytes,
      decodedRgbaBytes: rig.decodedRgbaBytes,
    });
    expect(registration).toMatchObject({
      encodedComponentBytes: rig.encodedComponentBytes,
      decodedRgbaBytes: rig.decodedRgbaBytes,
    });
    expect(manifest.rig.components).toEqual(
      rig.parts.map((part) => ({
        id: part.id,
        kind: part.kind,
        file: part.modulePath.split('/').at(-1),
        canvas: [part.canvas.width, part.canvas.height],
        pivot: [part.assetPivot.x, part.assetPivot.y],
        socket: [part.socket.x, part.socket.y],
        layerDepth: part.layerDepth,
        stage: [part.stage.start, part.stage.end],
        matureFootprint: [
          part.normalizedFootprint.x,
          part.normalizedFootprint.y,
          part.normalizedFootprint.width,
          part.normalizedFootprint.height,
        ],
        encodedBytes: part.encodedBytes,
      })),
    );
    expect(
      registration.components
        .map(({ file, normalizedPivot }) => ({
          id: file.replace(/\.png$/, ''),
          targetPivot: [normalizedPivot.x, normalizedPivot.y],
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      rig.parts
        .map((part) => ({
          id: part.id,
          targetPivot: [part.assetPivot.x, part.assetPivot.y],
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(prompts.components).toHaveLength(rig.parts.length);
    expect(prompts.components.every((component) => component.prompt.length > 40)).toBe(true);
    expect(prompts.components.map((component) => component.jobId)).toEqual(
      manifest.provenance.jobs,
    );
  });

  it('maps equal normalized progress to equal local transforms while every socket stays invariant', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    const first = cutoutPuppetPosesAtProgress(rig, 0.61);
    const second = cutoutPuppetPosesAtProgress(rig, 0.61);
    expect(second).toEqual(first);
    expect(first.map((pose) => pose.part.socket)).toEqual(rig.parts.map((part) => part.socket));

    const start = cutoutPuppetPosesAtProgress(rig, -1);
    const mature = cutoutPuppetPosesAtProgress(rig, 9);
    expect(start.every((pose) => pose.reveal === 0)).toBe(true);
    expect(mature.every((pose) => pose.reveal === 1)).toBe(true);
    expect(mature.every((pose) => pose.angleDeg === 0)).toBe(true);
    expect(mature.every((pose) => pose.scaleX === 1 && pose.scaleY === 1)).toBe(true);
    expect(CUTOUT_PUPPET_CUE_TARGETS).toEqual([0, 0.16, 0.38, 0.58, 0.78, 1]);
  });

  it('stagger reveals structure before canopy and bounded ground plants', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    const byId = (progress: number) =>
      new Map(
        cutoutPuppetPosesAtProgress(rig, progress).map((pose) => [
          pose.part.id,
          pose.reveal,
        ]),
      );
    const proposed = byId(0.38);
    expect(proposed.get('trunk-root')).toBeGreaterThan(0);
    expect(proposed.get('canopy-crown')).toBe(0);
    expect(proposed.get('fern-tuft')).toBe(0);

    const signed = byId(0.78);
    expect(signed.get('trunk-root')).toBe(1);
    expect(signed.get('branch-left')).toBe(1);
    expect(signed.get('canopy-left')).toBeGreaterThan(0);
    expect(signed.get('fern-tuft')).toBe(0);
  });

  it('keeps the rig root and mature footprint planted while painter depth remains explicit', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    const root = { x: 381.25, y: 205.5 };
    const start = cutoutPuppetLayerAtProgress(rig, 0, root, 0.55);
    const mature = cutoutPuppetLayerAtProgress(rig, 1, root, 0.55);
    expect(start.worldRoot).toEqual(root);
    expect(mature.worldRoot).toEqual(root);
    expect(mature.matureFootprint).toEqual(rig.matureFootprint);
    expect(mature.poses.map((pose) => pose.part.layerDepth)).toEqual(
      [...mature.poses.map((pose) => pose.part.layerDepth)].sort((a, b) => a - b),
    );
    const rooted = mature.poses.find((pose) => pose.part.kind === 'rooted-trunk');
    expect(rooted?.part.socket).toEqual({ x: 0, y: 0 });
  });

  it('settles Back and Replay on equivalent cue/progress/pose output', () => {
    const rig = CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG;
    const settle = (state: ReturnType<typeof initialCutoutPuppetPlayback>) =>
      advanceCutoutPuppetPlayback(state, 10_000);
    const snapshot = (state: ReturnType<typeof initialCutoutPuppetPlayback>) => ({
      cue: state.cueIndex,
      progress: state.progress,
      poses: cutoutPuppetPosesAtProgress(rig, state.progress),
    });

    const direct = settle(selectCutoutPuppetCue(initialCutoutPuppetPlayback(), 3, false));
    let walked = initialCutoutPuppetPlayback();
    for (const cue of [1, 2, 3, 4, 5]) {
      walked = settle(selectCutoutPuppetCue(walked, cue, false));
    }
    const backed = settle(selectCutoutPuppetCue(walked, 3, false));
    expect(snapshot(backed)).toEqual(snapshot(direct));

    let replayed = replayCutoutPuppet(walked);
    expect(snapshot(replayed)).toEqual(snapshot(initialCutoutPuppetPlayback()));
    for (const cue of [1, 2, 3, 4, 5]) {
      replayed = settle(selectCutoutPuppetCue(replayed, cue, false));
    }
    expect(snapshot(replayed)).toEqual(snapshot(walked));
  });

  it('settles reduced motion immediately on the same retained mature scene', () => {
    const full = advanceCutoutPuppetPlayback(
      selectCutoutPuppetCue(initialCutoutPuppetPlayback(), 5, false),
      10_000,
    );
    const reduced = selectCutoutPuppetCue(initialCutoutPuppetPlayback(), 5, true);
    expect(reduced.playing).toBe(false);
    expect(reduced.transitionMs).toBe(0);
    expect(reduced.holdMs).toBe(0);
    expect(reduced.progress).toBe(full.progress);
    expect(
      cutoutPuppetPosesAtProgress(CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG, reduced.progress),
    ).toEqual(
      cutoutPuppetPosesAtProgress(CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG, full.progress),
    );
  });

  it('keeps author-time inspection and PixelLab calls outside runtime source', () => {
    const runtimeSource = [
      'cutout-puppet-rig.ts',
      'SemanticGrowthWorldView.tsx',
      'WorldSceneView.tsx',
      'SceneView.tsx',
    ]
      .map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
      .join('\n');
    expect(runtimeSource).not.toMatch(
      /contact-sheet\.png|reference-plate\.png|sources\/|pixellab\.ai|XMLHttpRequest|WebSocket|fetch\s*\(/i,
    );
    expect(runtimeSource).not.toMatch(/API[_-]?KEY|SECRET|TOKEN/i);
    expect(runtimeSource.match(/chapter2-organic-cutout-puppet\/v1\/[\w-]+\.png/g)).toHaveLength(16);
  });
});
