import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  growOpaqueIslandContour,
  growOpaqueIslandContours,
  opaqueContourGrowthPhase,
  parseOpaqueClosedQuadraticContour,
} from './opaque-island-contour-growth.js';

const MATURE =
  'M 0 5 Q 0 0 5 0 Q 10 0 10 5 Q 10 10 5 10 Q 0 10 0 5 Z';
const ANCHOR = Object.freeze({ x: 5, y: 5 });

function contourPoints(path: string) {
  const parsed = parseOpaqueClosedQuadraticContour(path);
  return [
    parsed.start,
    ...parsed.segments.flatMap((segment) => [segment.control, segment.end]),
  ];
}

describe('Experiment 10 opaque fixed-topology island contour growth', () => {
  it('begins at a true zero-area seed and settles to the exact existing SVG coast', () => {
    const seed = growOpaqueIslandContour(MATURE, ANCHOR, 0);
    expect(contourPoints(seed).every((point) => point.x === 5 && point.y === 5)).toBe(true);
    expect(opaqueContourGrowthPhase(0)).toBe('zero-area-seed');
    expect(growOpaqueIslandContour(MATURE, ANCHOR, 1)).toBe(MATURE);
    expect(opaqueContourGrowthPhase(1)).toBe('mature');
  });

  it('interpolates coordinates deterministically without changing contour topology or order', () => {
    const first = growOpaqueIslandContour(MATURE, ANCHOR, 0.52);
    const second = growOpaqueIslandContour(MATURE, ANCHOR, 0.52);
    expect(first).toBe(second);
    expect(parseOpaqueClosedQuadraticContour(first).segments).toHaveLength(4);
    expect(first).not.toBe(MATURE);
    expect(contourPoints(first).some((point) => point.x !== 5 || point.y !== 5)).toBe(true);

    const paths = [MATURE, MATURE.replaceAll('10', '12')];
    const grown = growOpaqueIslandContours(paths, ANCHOR, 0.7);
    expect(grown).toHaveLength(paths.length);
    expect(growOpaqueIslandContours(paths, ANCHOR, 1)).toEqual(paths);
  });

  it('contains no opacity, raster, clock, random, or whole-scene transform mechanism', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./opaque-island-contour-growth.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/opacity\s*[:=]|\.png|\.webp|Date\.now|performance\.now|Math\.random/);
    expect(source).not.toMatch(/scale\(|translate\(|rotate\(/);
  });
});
