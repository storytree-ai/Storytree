import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contourMorphPhase,
  morphOrganicIslandContour,
  morphOrganicIslandContours,
  parseClosedQuadraticContour,
} from './organic-island-contour-morph.js';

const MATURE =
  'M 0.0 10.0 Q 0.0 0.0 10.0 0.0 Q 20.0 0.0 20.0 10.0 Q 20.0 20.0 10.0 20.0 Q 0.0 20.0 0.0 10.0 Z';
const SECOND =
  'M 4.0 10.0 Q 4.0 4.0 10.0 4.0 Q 16.0 4.0 16.0 10.0 Q 16.0 16.0 10.0 16.0 Q 4.0 16.0 4.0 10.0 Z';
const ANCHOR = Object.freeze({ x: 10, y: 10 });

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('Experiment 7 organic island contour morph geometry', () => {
  it('starts as one tiny deterministic opaque blob centered on the mature island world anchor', () => {
    const seedA = morphOrganicIslandContour(MATURE, ANCHOR, 0);
    const seedB = morphOrganicIslandContour(MATURE, ANCHOR, 0);
    expect(seedA).toBe(seedB);
    expect(seedA).not.toBe(MATURE);

    const parsed = parseClosedQuadraticContour(seedA);
    expect(mean(parsed.segments.map((segment) => segment.control.x))).toBeCloseTo(ANCHOR.x, 4);
    expect(mean(parsed.segments.map((segment) => segment.control.y))).toBeCloseTo(ANCHOR.y, 4);
    expect(
      Math.max(
        ...parsed.segments.map((segment) =>
          Math.hypot(segment.control.x - ANCHOR.x, segment.control.y - ANCHOR.y),
        ),
      ),
    ).toBeLessThan(2.5);
    expect(seedA).not.toMatch(/opacity|transform|scale|ellipse|clip/i);
  });

  it('continuously interpolates path geometry without snapshot scaling and returns the exact mature coast', () => {
    const seed = parseClosedQuadraticContour(
      morphOrganicIslandContour(MATURE, ANCHOR, 0),
    );
    const mature = parseClosedQuadraticContour(MATURE);
    const midway = morphOrganicIslandContour(MATURE, ANCHOR, 0.5);
    expect(midway).not.toBe(morphOrganicIslandContour(MATURE, ANCHOR, 0));
    expect(midway).not.toBe(MATURE);
    expect(parseClosedQuadraticContour(midway).segments).toHaveLength(mature.segments.length);

    // A whole-island snapshot scale would preserve each mature point's radial angle. The seed is
    // an independent indexed blob, so at least one corresponding point is deliberately not radial.
    const angularDifferences = seed.segments.map((segment, index) => {
      const maturePoint = mature.segments[index]!.control;
      const seedAngle = Math.atan2(segment.control.y - ANCHOR.y, segment.control.x - ANCHOR.x);
      const matureAngle = Math.atan2(maturePoint.y - ANCHOR.y, maturePoint.x - ANCHOR.x);
      return Math.abs(Math.atan2(Math.sin(seedAngle - matureAngle), Math.cos(seedAngle - matureAngle)));
    });
    expect(Math.max(...angularDifferences)).toBeGreaterThan(0.2);

    const before = parseClosedQuadraticContour(
      morphOrganicIslandContour(MATURE, ANCHOR, 0.4999),
    );
    const after = parseClosedQuadraticContour(
      morphOrganicIslandContour(MATURE, ANCHOR, 0.5001),
    );
    const largestStep = Math.max(
      ...before.segments.flatMap((segment, index) => {
        const next = after.segments[index]!;
        return [
          Math.hypot(segment.control.x - next.control.x, segment.control.y - next.control.y),
          Math.hypot(segment.end.x - next.end.x, segment.end.y - next.end.y),
        ];
      }),
    );
    expect(largestStep).toBeLessThan(0.05);
    expect(morphOrganicIslandContour(MATURE, ANCHOR, 1)).toBe(MATURE);
    expect(morphOrganicIslandContour(MATURE, ANCHOR, 9)).toBe(MATURE);
  });

  it('preserves multiple contour topology and deterministic source order through coast settle', () => {
    const one = morphOrganicIslandContours([MATURE, SECOND], ANCHOR, 0.91);
    const two = morphOrganicIslandContours([MATURE, SECOND], ANCHOR, 0.91);
    expect(one).toEqual(two);
    expect(one).toHaveLength(2);
    expect(one[0]).not.toBe(one[1]);
    expect(morphOrganicIslandContours([MATURE, SECOND], ANCHOR, 1)).toEqual([
      MATURE,
      SECOND,
    ]);
    expect(contourMorphPhase(0)).toBe('seed');
    expect(contourMorphPhase(0.5)).toBe('path-interpolation');
    expect(contourMorphPhase(0.9)).toBe('coast-settle');
    expect(contourMorphPhase(1)).toBe('mature');
  });

  it('has no random, wall-clock, runtime PixelLab, network, secret, fade, wipe, or scale authority', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./organic-island-contour-morph.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/Math\.random|Date\.|performance\.|requestAnimationFrame/);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|pixellab\.ai|PIXELLAB_(?:API_KEY|TOKEN)/i);
    expect(source).not.toMatch(/opacity|cross-?fade|radial\s+(?:clip|wipe)|transform\s*:|scale\s*\(/i);
  });
});
