import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY } from './organic-pose-to-pose-assets.js';
import { validateOrganicPoseRegistry } from './organic-pose-to-pose-track.js';

function pngHeader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24]!,
    colourType: bytes[25]!,
  };
}

describe('Chapter 2 organic pose-to-pose assets', () => {
  it('ships exactly two fixed transparent local tracks within the recorded decode budget', () => {
    const registry = validateOrganicPoseRegistry(
      CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY,
    );
    expect(registry.tracks.map((track) => track.kind)).toEqual([
      'hero-tree',
      'plant-sample',
    ]);

    let encodedBytes = 0;
    let decodedBytes = 0;
    let frameCount = 0;
    for (const track of registry.tracks) {
      expect(track.frames).toHaveLength(track.frameCount);
      for (const frame of track.frames) {
        const path = fileURLToPath(new URL(frame.modulePath, import.meta.url));
        const bytes = readFileSync(path);
        expect(pngHeader(bytes)).toEqual({
          width: track.frameDimensions.width,
          height: track.frameDimensions.height,
          bitDepth: 8,
          colourType: 6,
        });
        expect(frame.normalizedAnchor).toEqual(track.groundAnchor);
        expect({
          x: frame.sourceAnchor.x + frame.normalizationOffset.x,
          y: frame.sourceAnchor.y + frame.normalizationOffset.y,
        }).toEqual(track.groundAnchor);
        expect(frame.src).not.toMatch(/pixellab\.ai|contact-sheet/i);
        encodedBytes += statSync(path).size;
      }
      decodedBytes += track.decodedRgbaBytes;
      frameCount += track.frameCount;
    }

    expect(encodedBytes).toBe(168_541);
    expect(decodedBytes).toBe(1_511_424);
    expect(frameCount).toBe(14);
    expect(encodedBytes).toBeLessThanOrEqual(registry.budget.maxEncodedBytes);
    expect(decodedBytes).toBeLessThanOrEqual(
      registry.budget.maxDecodedRgbaBytes,
    );
  });

  it('keeps authoring-only artifacts out of the runtime frame registry and has no runtime vendor call seam', () => {
    const runtimeSource = [
      'organic-pose-to-pose-assets.ts',
      'organic-pose-to-pose-track.ts',
      'SemanticGrowthWorldView.tsx',
      'WorldSceneView.tsx',
      'SceneView.tsx',
    ]
      .map((file) =>
        readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8'),
      )
      .join('\n');

    expect(
      runtimeSource.match(
        /new URL\('\.\/assets\/chapter2-organic-pose-to-pose\/(?:tree|plant)\/frame-\d\d\.png',\s*import\.meta\.url\)/g,
      ),
    ).toHaveLength(14);
    expect(runtimeSource).not.toMatch(
      /https?:\/\/(?:[^/]*\.)?pixellab\.ai|XMLHttpRequest|WebSocket|fetch\s*\(/i,
    );
    expect(runtimeSource).not.toMatch(
      /(?:api[-_]?key|secret|credential|bearer[-_]?token)\s*[:=]\s*['"][^'"]+/i,
    );
    for (const track of CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY.tracks) {
      expect(track.frames.every((frame) => !frame.modulePath.includes('contact-sheet'))).toBe(
        true,
      );
    }
  });
});
