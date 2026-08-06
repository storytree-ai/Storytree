// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyCameraRasterisationTransform,
  assessCameraRasterisationRun,
  cameraRasterisationStablePictureFailureReason,
  cameraRasterisationTransformAtCursor,
  formatCameraRasterisationComparisonTable,
  formatCameraRasterisationStablePictureTable,
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
  pictureRevision: 1,
  pictureChangedSincePreviousFrame: true,
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
const stableFrames = (deltaMs: number, count: number, mapNodeCount = 15_000) =>
  Array.from({ length: count }, (_, index) => ({
    ...frame(deltaMs, mapNodeCount),
    timestamp: index * deltaMs,
    growthNodeCount: 0,
    pictureChangedSincePreviousFrame: false,
  }));

describe('camera-raster-probe-reuses-the-regrow-cursor', () => {
  it('accepts only the exact diagnostic flag and a named variant', () => {
    expect(readCameraRasterisationRoute('?cameraRasterisation=probe&cameraVariant=growth-only')).toEqual({ variant: 'growth-only' });
    expect(readCameraRasterisationRoute('?cameraRasterisation=probe&cameraVariant=final-product')).toEqual({ variant: 'final-product' });
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

  it('separates committed-picture stability from the live-accretion painting predicate', () => {
    const changedWithoutAccretion = { ...frame(999, 5_000), growthNodeCount: 0 };
    const unchangedWithAccretion = {
      ...frame(20, 20_500),
      pictureChangedSincePreviousFrame: false,
    };
    const summary = summariseCameraRasterisationRuns([
      { ...run('b', 'growth-only', 20), frames: [changedWithoutAccretion, unchangedWithAccretion] },
      {
        ...run('s', 'svg-camera', 30),
        frames: [
          changedWithoutAccretion,
          { ...unchangedWithAccretion, deltaMs: 30 },
        ],
      },
    ]);
    expect(summary.comparisons).toEqual([
      expect.objectContaining({
        variant: 'svg-camera',
        bucket: '20k+',
        baselineFrameMs: 20,
        variantFrameMs: 30,
      }),
    ]);
    expect(
      summary.stablePictureComparisons.find(
        (row) => row.variant === 'svg-camera' && row.bucket === '4-8k',
      ),
    ).toMatchObject({ baselineFrameMs: null, variantFrameMs: null, baselineSamples: 0, variantSamples: 0 });
    expect(
      summary.stablePictureComparisons.find(
        (row) => row.variant === 'svg-camera' && row.bucket === '20k+',
      ),
    ).toMatchObject({ baselineFrameMs: 20, variantFrameMs: 30, baselineSamples: 1, variantSamples: 1 });
  });

  it('uses the historical 12-20k proxy counts only as diagnostic calibration', () => {
    const summary = summariseCameraRasterisationRuns([
      { ...run('growth-gap', 'growth-only', 1), frames: stableFrames(16.7, 987) },
      { ...run('product-gap', 'final-product', 1), frames: stableFrames(83.3, 216) },
    ]);

    expect(summary.stablePictureTarget).toMatchObject({
      variant: 'final-product',
      bucket: '12-20k',
      baselineSamples: 987,
      variantSamples: 216,
      minimumSamplesPerArm: 100,
      observedDeltaMs: expect.closeTo(66.6, 10),
      verdict: 'fail',
    });
    expect(formatCameraRasterisationStablePictureTable(summary)).toContain(
      '| final-product | 12-20k | 16.70 ms | 83.30 ms | +66.60 ms | 987/216; min 100 | adequate | fail |',
    );
    expect(cameraRasterisationStablePictureFailureReason(summary.stablePictureTarget)).toBe(
      'stable-picture-target-regression',
    );
  });

  it('act2-camera-production-gap-closes-without-regression', () => {
    const adequate = summariseCameraRasterisationRuns([
      {
        ...run('growth-adequate', 'growth-only', 1),
        frames: [...stableFrames(16.7, 2), ...stableFrames(16.7, 716, 20_500)],
      },
      {
        ...run('product-adequate', 'final-product', 1),
        frames: [...stableFrames(33.4, 4), ...stableFrames(33.4, 398, 20_500)],
      },
    ]);
    expect(adequate.stablePictureTarget).toMatchObject({
      bucket: '20k+',
      baselineSamples: 716,
      variantSamples: 398,
      observedDeltaMs: expect.closeTo(16.7, 10),
      verdict: 'pass',
    });
    expect(formatCameraRasterisationStablePictureTable(adequate)).toContain(
      '| final-product | 20k+ | 16.70 ms | 33.40 ms | +16.70 ms | 716/398; min 100 | adequate | pass |',
    );
    expect(cameraRasterisationStablePictureFailureReason(adequate.stablePictureTarget)).toBeNull();
    expect(
      adequate.stablePictureComparisons.find(
        (row) => row.variant === 'final-product' && row.bucket === '12-20k',
      ),
    ).toMatchObject({ baselineSamples: 2, variantSamples: 4, adequacy: 'inadequate' });
  });

  it('fails closed with an explicit null target when no bucket has two adequate arms', () => {
    const inadequate = summariseCameraRasterisationRuns([
      { ...run('growth-short', 'growth-only', 1), frames: stableFrames(16.7, 99) },
      { ...run('product-enough', 'final-product', 1), frames: stableFrames(20, 100) },
    ]);
    expect(inadequate.stablePictureTarget).toEqual({
      variant: 'final-product',
      bucket: null,
      maximumDeltaMs: 16.7,
      baselineSamples: null,
      variantSamples: null,
      minimumSamplesPerArm: 100,
      observedDeltaMs: null,
      verdict: 'insufficient-samples',
    });
    expect(formatCameraRasterisationStablePictureTable(inadequate)).toContain(
      '| final-product target | no adequate bucket | — | — | — | —/—; min 100 | inadequate | insufficient-samples |',
    );
    expect(cameraRasterisationStablePictureFailureReason(inadequate.stablePictureTarget)).toBe(
      'stable-picture-target-insufficient-samples',
    );
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

    const product = 'translate(20 30) scale(1.25)';
    const restoreProduct = applyCameraRasterisationTransform(
      { svgCamera, htmlCompositor },
      'final-product',
      0.5,
      fit,
      product,
    );
    expect(svgCamera.getAttribute('transform')).toBe(product);
    expect(svgCamera.style.transition).toBe('none');
    restoreProduct();
    expect(svgCamera.getAttribute('transform')).toBe(fit);
  });
});
