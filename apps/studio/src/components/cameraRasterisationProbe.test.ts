// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyCameraRasterisationTransform,
  assessCameraRasterisationRun,
  cameraRasterisationTransformAtCursor,
  formatCameraRasterisationComparisonTable,
  readCameraRasterisationRoute,
  summariseCameraRasterisationRuns,
  type CameraRasterisationRun,
} from './cameraRasterisationProbe.js';

const clean = { frameDeltasMs: [16.6, 16.7, 16.8, 16.7] };
const frame = (deltaMs: number, growthNodeCount: number) => ({
  timestamp: 100,
  deltaMs,
  cursor: 0.5,
  growthNodeCount: 1,
  mapNodeCount: growthNodeCount,
  svgTransform: 'translate(1 2) scale(1)',
  htmlTransform: 'none',
});
const run = (
  runId: string,
  variant: CameraRasterisationRun['variant'],
  deltaMs: number,
  overrides: Partial<CameraRasterisationRun> = {},
): CameraRasterisationRun => ({
  runId,
  ordinal: 0,
  variant,
  preIdle: clean,
  postIdle: clean,
  frames: [frame(deltaMs, 5_000), frame(deltaMs, 5_100)],
  ...overrides,
});

describe('camera-raster-probe-reuses-the-regrow-cursor', () => {
  it('accepts only the exact diagnostic flag and a named variant', () => {
    expect(readCameraRasterisationRoute('?cameraRasterisation=probe&cameraVariant=growth-only')).toEqual({ variant: 'growth-only' });
    expect(readCameraRasterisationRoute('?cameraRasterisation=on&cameraVariant=growth-only')).toBeNull();
    expect(readCameraRasterisationRoute('?cameraRasterisation=probe&cameraVariant=unknown')).toBeNull();
    expect(readCameraRasterisationRoute('?cameraRasterisation=probe')).toBeNull();
    expect(readCameraRasterisationRoute('')).toBeNull();
  });

  it('maps equal cursor samples to equal transforms, with identity at both settled boundaries', () => {
    expect(cameraRasterisationTransformAtCursor(0.37)).toEqual(cameraRasterisationTransformAtCursor(0.37));
    expect(cameraRasterisationTransformAtCursor(0)).toEqual({ dx: 0, dy: 0, scale: 1 });
    const settled = cameraRasterisationTransformAtCursor(1);
    expect(settled.dx).toBeCloseTo(0, 10);
    expect(settled.dy).toBeCloseTo(0, 10);
    expect(settled.scale).toBeCloseTo(1, 10);
  });
});

describe('camera-raster-probe-brackets-every-production-run', () => {
  it('rejects either contended floor and names the failed bracket', () => {
    expect(assessCameraRasterisationRun(run('pre', 'growth-only', 16.7, { preIdle: { frameDeltasMs: [33, 34] } }))).toMatchObject({ accepted: false, reason: 'pre-idle-floor' });
    expect(assessCameraRasterisationRun(run('post', 'growth-only', 16.7, { postIdle: { frameDeltasMs: [50, 51] } }))).toMatchObject({ accepted: false, reason: 'post-idle-floor' });
    expect(assessCameraRasterisationRun(run('both', 'growth-only', 16.7, { preIdle: { frameDeltasMs: [33] }, postIdle: { frameDeltasMs: [50] } }))).toMatchObject({ accepted: false, reason: 'both-idle-floors' });
  });
});

describe('camera-raster-probe-reports-traceable-cost-deltas', () => {
  it('uses repeated admissible runs, excludes rejected runs, and is independent of alternating order', () => {
    const runs = [
      run('b1', 'growth-only', 16),
      run('s1', 'svg-camera', 24),
      run('b2', 'growth-only', 18),
      run('h1', 'html-compositor', 19),
      run('s-rejected', 'svg-camera', 200, { postIdle: { frameDeltasMs: [50] } }),
      run('s2', 'svg-camera', 22),
      run('h2', 'html-compositor', 21),
    ];
    const forward = summariseCameraRasterisationRuns(runs);
    const reversed = summariseCameraRasterisationRuns([...runs].reverse());
    expect(reversed.comparisons).toEqual(forward.comparisons);
    expect(forward.rejected).toEqual([{ runId: 's-rejected', reason: 'post-idle-floor' }]);
    expect(forward.comparisons.find((row) => row.variant === 'svg-camera')).toMatchObject({ baselineFrameMs: 17, variantFrameMs: 23, deltaMs: 6 });
    expect(formatCameraRasterisationComparisonTable(forward)).toContain('| svg-camera | 4-8k | 17.00 ms | 23.00 ms | +6.00 ms |');
  });

  it('excludes wave gaps and buckets painting frames by total map nodes, not live accretion cells', () => {
    const gap = { ...frame(999, 5_000), growthNodeCount: 0 };
    const summary = summariseCameraRasterisationRuns([
      { ...run('b', 'growth-only', 20), frames: [gap, frame(20, 20_500)] },
      { ...run('s', 'svg-camera', 30), frames: [gap, frame(30, 20_500)] },
    ]);
    expect(summary.comparisons).toEqual([
      expect.objectContaining({
        variant: 'svg-camera',
        bucket: '20k+',
        baselineFrameMs: 20,
        variantFrameMs: 30,
      }),
    ]);
  });
});

describe('camera-raster-probe-leaves-product-choreography-unchanged', () => {
  it('keeps the control write-free and isolates/restores the exact SVG and HTML variant paths', () => {
    document.body.innerHTML = '<div class="pan"><svg><g class="camera" transform="translate(7 8) scale(0.5)" style="transition: none"></g></svg></div>';
    const svgCamera = document.querySelector('.camera') as SVGGElement;
    const htmlCompositor = document.querySelector('.pan') as HTMLElement;
    htmlCompositor.style.transform = 'none';
    htmlCompositor.style.willChange = 'auto';
    const fit = svgCamera.getAttribute('transform')!;

    const controlRestore = applyCameraRasterisationTransform(
      { svgCamera, htmlCompositor },
      'growth-only',
      0.5,
      fit,
    );
    expect(svgCamera.getAttribute('transform')).toBe(fit);
    expect(htmlCompositor.style.transform).toBe('none');
    controlRestore();

    for (const variant of ['svg-camera', 'html-compositor'] as const) {
      const restore = applyCameraRasterisationTransform({ svgCamera, htmlCompositor }, variant, 0.5, fit);
      if (variant === 'svg-camera') {
        expect(svgCamera.style.transition).toBe('none');
        expect(svgCamera.getAttribute('transform')).not.toBe(fit);
        expect(htmlCompositor.style.transform).toBe('none');
      } else {
        expect(svgCamera.getAttribute('transform')).toBe(fit);
        expect(htmlCompositor.style.transform).toContain('translate3d');
      }
      restore();
      expect(svgCamera.getAttribute('transform')).toBe(fit);
      expect(htmlCompositor.style.transform).toBe('none');
      expect(htmlCompositor.style.willChange).toBe('auto');
    }
  });
});
