import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER2_ORGANIC_MASK_REVEAL_TRACK,
  MASK_REVEAL_CUE_TARGETS,
  advanceMaskRevealPlayback,
  buildOrganicMaskRevealLayer,
  fullMaskCoverageBounds,
  initialMaskRevealPlayback,
  maskRevealStateAtProgress,
  replayMaskReveal,
  selectMaskRevealCue,
  strokeRevealAtProgress,
  validateOrganicMaskRevealTrack,
} from './organic-mask-reveal.js';

describe('texture-under-mask organic growth', () => {
  it('maps normalized semantic progress continuously onto bounded structural masks', () => {
    expect(strokeRevealAtProgress(-1)).toEqual({ dashArray: 1, dashOffset: 1 });
    expect(strokeRevealAtProgress(0.5)).toEqual({ dashArray: 1, dashOffset: 0.5 });
    expect(strokeRevealAtProgress(2)).toEqual({ dashArray: 1, dashOffset: 0 });

    expect(maskRevealStateAtProgress(0)).toEqual({
      progress: 0,
      land: 0,
      trunk: 0,
      branches: 0,
      foliage: 0,
      plants: 0,
    });
    expect(maskRevealStateAtProgress(1)).toEqual({
      progress: 1,
      land: 1,
      trunk: 1,
      branches: 1,
      foliage: 1,
      plants: 1,
    });

    const before = maskRevealStateAtProgress(0.51);
    const after = maskRevealStateAtProgress(0.52);
    expect(after.trunk).toBeGreaterThan(before.trunk);
    expect(after.branches).toBeGreaterThan(before.branches);
    expect(after.foliage).toBeGreaterThanOrEqual(before.foliage);
    expect('frameIndex' in after).toBe(false);
    expect(MASK_REVEAL_CUE_TARGETS).toEqual([0, 0.22, 0.52, 0.72, 0.9, 1]);
  });

  it('registers two mature transparent local assets in one bounded painter order', () => {
    const track = validateOrganicMaskRevealTrack(CHAPTER2_ORGANIC_MASK_REVEAL_TRACK);
    expect(track.layers.map((layer) => layer.depthSlot)).toEqual([
      'ground-plants',
      'hero-tree',
    ]);
    expect(track.layers.map((layer) => layer.modulePath)).toEqual([
      './assets/chapter2-organic-growth/mask-reveal-v1/plant-cluster-mature.png',
      './assets/chapter2-organic-growth/mask-reveal-v1/hero-tree-mature.png',
    ]);
    expect(track.layers[0]).toMatchObject({
      canvas: { width: 512, height: 256 },
      assetAnchor: { x: 256, y: 230 },
      matureBounds: { x: 212, y: 132, width: 91, height: 99 },
      scale: 0.22,
    });
    expect(track.layers[1]).toMatchObject({
      canvas: { width: 512, height: 512 },
      assetAnchor: { x: 256, y: 480 },
      matureBounds: { x: 128, y: 223, width: 250, height: 258 },
      scale: 0.38,
    });
    expect(track.budget.layerCount).toBe(2);
    expect(track.budget.encodedBytes).toBe(25_164);
    expect(track.budget.decodedRgbaBytes).toBe(1_572_864);
    expect(track.budget.maxEncodedBytes).toBe(65_536);
    expect(track.budget.maxDecodedRgbaBytes).toBe(3_145_728);

    let encodedBytes = 0;
    let decodedBytes = 0;
    for (const layer of track.layers) {
      const file = fileURLToPath(new URL(layer.modulePath.slice(2), import.meta.url));
      const bytes = readFileSync(file);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([
        layer.canvas.width,
        layer.canvas.height,
      ]);
      expect(bytes[25], `${layer.kind} PNG must carry an alpha channel`).toBe(6);
      encodedBytes += statSync(file).size;
      decodedBytes += layer.canvas.width * layer.canvas.height * 4;

      const coverage = fullMaskCoverageBounds(layer);
      expect(coverage.x).toBeLessThanOrEqual(layer.matureBounds.x);
      expect(coverage.y).toBeLessThanOrEqual(layer.matureBounds.y);
      expect(coverage.x + coverage.width).toBeGreaterThanOrEqual(
        layer.matureBounds.x + layer.matureBounds.width,
      );
      expect(coverage.y + coverage.height).toBeGreaterThanOrEqual(
        layer.matureBounds.y + layer.matureBounds.height,
      );
    }
    expect(encodedBytes).toBe(track.budget.encodedBytes);
    expect(encodedBytes).toBeLessThanOrEqual(track.budget.maxEncodedBytes);
    expect(decodedBytes).toBe(track.budget.decodedRgbaBytes);
    expect(decodedBytes * 2).toBe(track.budget.maxDecodedRgbaBytes);
  });

  it('keeps the checked-in authoring manifest aligned with the runtime registry', () => {
    interface ManifestAsset {
      readonly id: string;
      readonly canvas: readonly number[];
      readonly encodedBytes: number;
      readonly decodedRgbaBytes: number;
      readonly normalization: {
        readonly normalizedAnchor: readonly number[];
        readonly normalizedAlphaBounds: readonly number[];
      };
      readonly registration: {
        readonly worldSocket: string;
        readonly depthSlot: string;
        readonly runtimeScale: number;
      };
      readonly provenance: {
        readonly model: string;
        readonly objectId: string;
        readonly prompt: string;
      };
    }
    interface MaskManifest {
      readonly authorTimeOnly: boolean;
      readonly runtimePixelLabDependency: boolean;
      readonly referencePlate: {
        readonly runtimeImported: boolean;
        readonly providerInput: { readonly runtimeImported: boolean };
        readonly rejectedTrialPalette: { readonly runtimeImported: boolean };
      };
      readonly assets: readonly ManifestAsset[];
      readonly budget: {
        readonly runtimeAssetCount: number;
        readonly runtimeRequestCount: number;
        readonly runtimeEncodedBytes: number;
        readonly runtimeEncodedCeilingBytes: number;
        readonly runtimeDecodedRgbaBytes: number;
        readonly decodePlusUploadDuplicateCeilingBytes: number;
        readonly authoringReferencesImportedAtRuntime: boolean;
        readonly animationAssetFrameCount: number;
        readonly generatedStagePlateCount: number;
        readonly runtimeLayerCount: number;
      };
    }
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            './assets/chapter2-organic-growth/mask-reveal-v1/manifest.json',
            import.meta.url,
          ),
        ),
        'utf8',
      ),
    ) as MaskManifest;

    expect(manifest.authorTimeOnly).toBe(true);
    expect(manifest.runtimePixelLabDependency).toBe(false);
    expect(manifest.referencePlate.runtimeImported).toBe(false);
    expect(manifest.referencePlate.providerInput.runtimeImported).toBe(false);
    expect(manifest.referencePlate.rejectedTrialPalette.runtimeImported).toBe(false);
    expect(manifest.budget.authoringReferencesImportedAtRuntime).toBe(false);
    expect(manifest.budget).toMatchObject({
      runtimeAssetCount: 2,
      runtimeRequestCount: 2,
      runtimeEncodedBytes: CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.budget.encodedBytes,
      runtimeEncodedCeilingBytes:
        CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.budget.maxEncodedBytes,
      runtimeDecodedRgbaBytes:
        CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.budget.decodedRgbaBytes,
      decodePlusUploadDuplicateCeilingBytes:
        CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.budget.maxDecodedRgbaBytes,
      animationAssetFrameCount: 0,
      generatedStagePlateCount: 0,
      runtimeLayerCount: 2,
    });

    const runtimeByKind = new Map(
      CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.layers.map((layer) => [layer.kind, layer]),
    );
    for (const asset of manifest.assets) {
      const kind = asset.id === 'hero-tree-mature' ? 'hero-tree' : 'plants';
      const runtime = runtimeByKind.get(kind);
      expect(runtime).toBeTruthy();
      expect(asset.provenance.objectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(asset.provenance.model.length).toBeGreaterThan(0);
      expect(asset.provenance.prompt.length).toBeGreaterThan(20);
      expect(asset.canvas).toEqual([runtime!.canvas.width, runtime!.canvas.height]);
      expect(asset.normalization.normalizedAnchor).toEqual([
        runtime!.assetAnchor.x,
        runtime!.assetAnchor.y,
      ]);
      expect(asset.normalization.normalizedAlphaBounds).toEqual([
        runtime!.matureBounds.x,
        runtime!.matureBounds.y,
        runtime!.matureBounds.width,
        runtime!.matureBounds.height,
      ]);
      expect(asset.registration).toMatchObject({
        worldSocket: runtime!.worldSocket,
        depthSlot: runtime!.depthSlot,
        runtimeScale: runtime!.scale,
      });
      expect(asset.decodedRgbaBytes).toBe(
        runtime!.canvas.width * runtime!.canvas.height * 4,
      );
    }
    expect(manifest.assets.reduce((sum, asset) => sum + asset.encodedBytes, 0)).toBe(
      CHAPTER2_ORGANIC_MASK_REVEAL_TRACK.budget.encodedBytes,
    );
  });

  it('keeps root and ground sockets invariant while mask progress changes', () => {
    const sockets = {
      root: { x: 128, y: 170 },
      plants: { x: 93, y: 196 },
    } as const;
    const early = buildOrganicMaskRevealLayer(
      CHAPTER2_ORGANIC_MASK_REVEAL_TRACK,
      sockets,
      0.31,
      'semantic-growth-demo',
    );
    const mature = buildOrganicMaskRevealLayer(
      CHAPTER2_ORGANIC_MASK_REVEAL_TRACK,
      sockets,
      0.96,
      'semantic-growth-demo',
    );

    expect(early.layers.map(({ x, y, worldSocket, scale }) => ({ x, y, worldSocket, scale })))
      .toEqual(mature.layers.map(({ x, y, worldSocket, scale }) => ({ x, y, worldSocket, scale })));
    expect(early.layers[0]?.reveal).toBeLessThan(mature.layers[0]!.reveal);
    expect(early.layers[1]?.reveal).toBeLessThan(mature.layers[1]!.reveal);
    expect(early.nativeLand.worldAnchor).toEqual(mature.nativeLand.worldAnchor);
  });

  it('settles Back and Replay to the same app-owned progress trace', () => {
    const settle = (state: ReturnType<typeof initialMaskRevealPlayback>) =>
      advanceMaskRevealPlayback(state, 10_000);
    let forwardState = initialMaskRevealPlayback();
    const forward = [1, 2, 3, 4, 5].map((cue) => {
      forwardState = settle(selectMaskRevealCue(forwardState, cue, false));
      return [forwardState.cueIndex, forwardState.progress, maskRevealStateAtProgress(forwardState.progress)];
    });

    let walked = initialMaskRevealPlayback();
    walked = settle(selectMaskRevealCue(walked, 1, false));
    walked = settle(selectMaskRevealCue(walked, 2, false));
    walked = settle(selectMaskRevealCue(walked, 3, false));
    const backed = settle(selectMaskRevealCue(walked, 2, false));
    expect([backed.cueIndex, backed.progress, maskRevealStateAtProgress(backed.progress)])
      .toEqual(forward[1]);

    let replayed = replayMaskReveal(walked);
    expect(replayed.progress).toBe(0);
    const replayTrace = [1, 2, 3, 4, 5].map((cue) => {
      replayed = settle(selectMaskRevealCue(replayed, cue, false));
      return [replayed.cueIndex, replayed.progress, maskRevealStateAtProgress(replayed.progress)];
    });
    expect(replayTrace).toEqual(forward);
  });

  it('settles reduced motion immediately on the same retained mature scene', () => {
    const full = advanceMaskRevealPlayback(
      selectMaskRevealCue(initialMaskRevealPlayback(), 5, false),
      10_000,
    );
    const reduced = selectMaskRevealCue(initialMaskRevealPlayback(), 5, true);
    expect(reduced).toMatchObject({ cueIndex: 5, progress: 1, playing: false });
    expect(reduced.progress).toBe(full.progress);
    expect(maskRevealStateAtProgress(reduced.progress)).toEqual(
      maskRevealStateAtProgress(full.progress),
    );
  });

  it('keeps PixelLab author-time only and ships no generated island dependency', () => {
    const runtimeSource = [
      'organic-mask-reveal.ts',
      'SemanticGrowthWorldView.tsx',
      'WorldSceneView.tsx',
      'SceneView.tsx',
    ]
      .map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
      .join('\n');
    expect(runtimeSource).not.toMatch(
      /pixellab\.ai|api\.pixellab|PixelLabClient|XMLHttpRequest|WebSocket|fetch\s*\(/i,
    );
    expect(runtimeSource).not.toMatch(/API[_-]?KEY|SECRET|TOKEN/i);
    expect(runtimeSource).not.toMatch(
      /chapter2-island-growth|generated-island|island-composite|contact-sheet|\.gif|\.webp|\.mp4/i,
    );
  });
});
