import { readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER2_SOCKET_CHOREOGRAPHY,
  localClipProgress,
  organicGrowthLayersAtProgress,
  selectOrganicGrowthFrame,
  validateOrganicGrowthSet,
} from './organic-growth-track.js';
import {
  advanceOrganicPosePlayback,
  initialOrganicPosePlayback,
  replayOrganicPosePlayback,
  selectOrganicPoseCue,
} from './organic-pose-to-pose-track.js';

const ASSET_DIR = new URL('./assets/chapter2-organic-growth/', import.meta.url);

interface DecodedRgba {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Tiny dependency-free PNG reader for the committed RGBA/8-bit/non-interlaced proof assets. */
function decodeRgbaPng(bytes: Uint8Array): DecodedRgba {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  expect([...bytes.slice(0, 8)]).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4);
      expect(data[8]).toBe(8);
      expect(data[9]).toBe(6);
      expect(data[12]).toBe(0);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const compressed = new Uint8Array(idat.reduce((n, chunk) => n + chunk.length, 0));
  let cursor = 0;
  for (const chunk of idat) {
    compressed.set(chunk, cursor);
    cursor += chunk.length;
  }
  const raw = inflateSync(compressed);
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++]!;
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[source++]!;
      const left = x >= 4 ? row[x - 4]! : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4]! : 0;
      const predictor =
        filter === 0 ? 0
          : filter === 1 ? left
            : filter === 2 ? up
              : filter === 3 ? Math.floor((left + up) / 2)
                : filter === 4 ? paeth(left, up, upLeft)
                  : Number.NaN;
      if (!Number.isFinite(predictor)) throw new Error(`Unsupported PNG filter ${filter}.`);
      row[x] = (encoded + predictor) & 0xff;
    }
  }
  return { width, height, rgba };
}

function alphaAt(
  decoded: DecodedRgba,
  point: { readonly x: number; readonly y: number },
): number {
  return decoded.rgba[(point.y * decoded.width + point.x) * 4 + 3] ?? 0;
}

describe('staggered socket choreography registry', () => {
  it('keeps one hero track and two reusable support clips within the committed budget', () => {
    const set = validateOrganicGrowthSet(CHAPTER2_SOCKET_CHOREOGRAPHY);
    expect(set.id).toBe('chapter2-organic-socket-choreography-v1');
    expect(set.clips.map((clip) => [clip.id, clip.role, clip.frameCount])).toEqual([
      ['hero-tree', 'hero-tree', 8],
      ['fern', 'ground-plant', 4],
      ['wildflower', 'ground-flower', 4],
    ]);
    expect(set.sockets).toHaveLength(7);
    expect(set.sockets.map((socket) => socket.clipId)).toEqual([
      'hero-tree',
      'fern',
      'wildflower',
      'fern',
      'wildflower',
      'fern',
      'wildflower',
    ]);
    expect(set.capabilityCorrespondence).toEqual({
      seam: 'finite-story-order-sockets',
      maxSockets: 7,
      uniqueClipCount: 3,
      maxReusePerClip: 3,
    });

    let encodedBytes = 0;
    let decodedBytes = 0;
    for (const clip of set.clips) {
      expect(clip.frames).toHaveLength(clip.frameCount);
      for (const [index, frame] of clip.frames.entries()) {
        expect(frame.index).toBe(index);
        expect(frame.normalizedGroundAnchor).toEqual(clip.assetGroundAnchor);
        expect(frame.src).not.toMatch(/^https?:|api\.pixellab/i);
        const path = fileURLToPath(new URL(frame.modulePath.replace('./assets/chapter2-organic-growth/', ''), ASSET_DIR));
        const bytes = readFileSync(path);
        const decoded = decodeRgbaPng(bytes);
        expect([decoded.width, decoded.height]).toEqual([clip.canvas.width, clip.canvas.height]);
        expect(alphaAt(decoded, clip.assetGroundAnchor)).toBeGreaterThan(16);
        encodedBytes += statSync(path).size;
        decodedBytes += decoded.width * decoded.height * 4;
      }
    }
    expect(encodedBytes).toBe(set.budget.encodedBytes);
    expect(decodedBytes).toBe(set.budget.decodedRgbaBytes);
    expect(set.budget.uniqueFrameCount).toBe(16);
    expect(set.budget.maxRuntimeLayers).toBe(7);
    expect(set.budget.encodedBytes).toBeLessThanOrEqual(320_000);
    expect(set.budget.decodedRgbaBytes).toBeLessThanOrEqual(1_200_000);
  });

  it('maps global app progress onto each local clip without moving its socket', () => {
    expect(localClipProgress(0.4, 0.4, 0.2)).toBe(0);
    expect(localClipProgress(0.5, 0.4, 0.2)).toBeCloseTo(0.5);
    expect(localClipProgress(0.6, 0.4, 0.2)).toBe(1);
    expect(localClipProgress(-10, 0.4, 0.2)).toBe(0);
    expect(localClipProgress(10, 0.4, 0.2)).toBe(1);

    const atStart = organicGrowthLayersAtProgress(CHAPTER2_SOCKET_CHOREOGRAPHY, { x: 100, y: 80 }, 0);
    const midWave = organicGrowthLayersAtProgress(CHAPTER2_SOCKET_CHOREOGRAPHY, { x: 100, y: 80 }, 0.6);
    const mature = organicGrowthLayersAtProgress(CHAPTER2_SOCKET_CHOREOGRAPHY, { x: 100, y: 80 }, 1);
    expect(atStart).toHaveLength(7);
    expect(midWave).toHaveLength(7);
    expect(mature).toHaveLength(7);
    expect(atStart.map((layer) => layer.worldAnchor)).toEqual(midWave.map((layer) => layer.worldAnchor));
    expect(midWave.map((layer) => layer.worldAnchor)).toEqual(mature.map((layer) => layer.worldAnchor));
    expect(mature.map((layer) => layer.frameIndex)).toEqual([3, 3, 3, 7, 3, 3, 3]);
    expect(mature.map((layer) => layer.depthSlot)).toEqual([
      'organic-ground-back',
      'organic-ground-back',
      'organic-ground-back',
      'organic-hero-tree',
      'organic-ground-front',
      'organic-ground-front',
      'organic-ground-front',
    ]);
  });

  it('stages starts as a readable story-order wave rather than a simultaneous sweep', () => {
    const starts = CHAPTER2_SOCKET_CHOREOGRAPHY.sockets.map((socket) => socket.startProgress);
    expect(starts).toEqual([0.16, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68]);
    expect(new Set(starts).size).toBe(starts.length);
    const activeAtHalf = new Map(
      organicGrowthLayersAtProgress(
        CHAPTER2_SOCKET_CHOREOGRAPHY,
        { x: 100, y: 80 },
        0.5,
      ).map((layer) => [layer.socketId, layer.localProgress]),
    );
    expect(activeAtHalf.get('hero-root')).toBeGreaterThan(0);
    expect(activeAtHalf.get('fern-west')).toBeGreaterThan(0);
    expect(activeAtHalf.get('flower-east')).toBeGreaterThan(0);
    expect(activeAtHalf.get('fern-north')).toBe(0);
    expect(activeAtHalf.get('flower-south-east')).toBe(0);
    expect(activeAtHalf.get('fern-south-west')).toBe(0);
    expect(activeAtHalf.get('flower-south')).toBe(0);
  });

  it('selects deterministic frames and reproduces equal Back/Replay traces', () => {
    const fern = CHAPTER2_SOCKET_CHOREOGRAPHY.clips.find((clip) => clip.id === 'fern')!;
    expect(selectOrganicGrowthFrame(fern, -1).index).toBe(0);
    expect(selectOrganicGrowthFrame(fern, 0.5).index).toBe(2);
    expect(selectOrganicGrowthFrame(fern, 1).index).toBe(3);

    const settle = (state: ReturnType<typeof initialOrganicPosePlayback>) =>
      advanceOrganicPosePlayback(state, 10_000);
    const layerTrace = (progress: number) =>
      organicGrowthLayersAtProgress(
        CHAPTER2_SOCKET_CHOREOGRAPHY,
        { x: 100, y: 80 },
        progress,
      ).map((layer) => [layer.socketId, layer.frameIndex, layer.worldAnchor]);

    const expected = [1, 2, 3, 4, 5].map((cue) => {
      const state = settle(selectOrganicPoseCue(initialOrganicPosePlayback(), cue, false));
      return layerTrace(state.progress);
    });

    let walked = initialOrganicPosePlayback();
    walked = settle(selectOrganicPoseCue(walked, 1, false));
    walked = settle(selectOrganicPoseCue(walked, 2, false));
    walked = settle(selectOrganicPoseCue(walked, 3, false));
    const backed = settle(selectOrganicPoseCue(walked, 2, false));
    expect(layerTrace(backed.progress)).toEqual(expected[1]);

    let replayed = replayOrganicPosePlayback(walked);
    const replayTrace = [1, 2, 3, 4, 5].map((cue) => {
      replayed = settle(selectOrganicPoseCue(replayed, cue, false));
      return layerTrace(replayed.progress);
    });
    expect(replayTrace).toEqual(expected);
  });

  it('settles reduced motion at the same retained mature layers as full motion', () => {
    const full = advanceOrganicPosePlayback(
      selectOrganicPoseCue(initialOrganicPosePlayback(), 5, false),
      10_000,
    );
    const reduced = selectOrganicPoseCue(initialOrganicPosePlayback(), 5, true);
    expect(reduced.playing).toBe(false);
    expect(reduced.progress).toBe(full.progress);
    expect(
      organicGrowthLayersAtProgress(CHAPTER2_SOCKET_CHOREOGRAPHY, { x: 100, y: 80 }, reduced.progress),
    ).toEqual(
      organicGrowthLayersAtProgress(CHAPTER2_SOCKET_CHOREOGRAPHY, { x: 100, y: 80 }, full.progress),
    );
  });

  it('keeps PixelLab and credentials out of the browser/runtime source graph', () => {
    const runtimeSource = [
      'organic-growth-track.ts',
      'SemanticGrowthWorldView.tsx',
      'WorldSceneView.tsx',
      'SceneView.tsx',
      'index.ts',
    ].map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')).join('\n');
    expect(runtimeSource).not.toMatch(/pixellab\.ai|@pixellab|XMLHttpRequest|WebSocket|fetch\s*\(/i);
    expect(runtimeSource).not.toMatch(/API[_-]?KEY|SECRET|TOKEN|credential/i);
    const packageJson = readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8');
    expect(packageJson).not.toMatch(/pixellab/i);
  });
});
