/**
 * Production-only camera rasterisation diagnostic.
 *
 * This module deliberately contains no clock. The Act 2 player's semantic cursor is its only
 * changing input; the Playwright collector may observe browser frames, but nothing here schedules
 * or advances one.
 */

export const CAMERA_RASTERISATION_QUERY_KEY = 'cameraRasterisation';
export const CAMERA_RASTERISATION_QUERY_VALUE = 'probe';
export const CAMERA_RASTERISATION_VARIANT_KEY = 'cameraVariant';
export const CAMERA_RASTERISATION_EXPECTED_ISLANDS = 40;
export const CAMERA_RASTERISATION_PROTOCOL = 5;
/** Predeclared adequacy floor for each arm of a stable-picture bucket comparison. */
export const CAMERA_RASTERISATION_STABLE_PICTURE_MIN_SAMPLES_PER_ARM = 100;
/** One 60 Hz refresh interval: the maximum accepted final-product stable-picture penalty. */
export const CAMERA_RASTERISATION_STABLE_PICTURE_TARGET_DELTA_MS = 16.7;

export const CAMERA_RASTERISATION_VARIANTS = [
  'growth-only',
  'svg-camera',
  'html-compositor',
  'final-product',
] as const;

export type CameraRasterisationVariant = (typeof CAMERA_RASTERISATION_VARIANTS)[number];

export interface CameraRasterisationRoute {
  readonly variant: CameraRasterisationVariant;
}

/** Exact gate: both the diagnostic marker and a registered variant must be present. */
export function readCameraRasterisationRoute(search: string): CameraRasterisationRoute | null {
  const params = new URLSearchParams(search);
  if (params.get(CAMERA_RASTERISATION_QUERY_KEY) !== CAMERA_RASTERISATION_QUERY_VALUE) return null;
  const variant = params.get(CAMERA_RASTERISATION_VARIANT_KEY);
  return CAMERA_RASTERISATION_VARIANTS.includes(variant as CameraRasterisationVariant)
    ? { variant: variant as CameraRasterisationVariant }
    : null;
}

export interface CameraRasterisationTransform {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
}

const clampCursor = (cursor: number): number =>
  Number.isFinite(cursor) ? Math.max(0, Math.min(1, cursor)) : 0;

/**
 * A deterministic diagnostic motion shape. It begins and ends at identity, and is a pure function
 * of the EXISTING Act 2 cursor. The SVG arm uses translate + scale; the compositor arm consumes the
 * same translation and intentionally ignores scale so the two real browser paths can be compared.
 */
export function cameraRasterisationTransformAtCursor(cursor: number): CameraRasterisationTransform {
  const p = clampCursor(cursor);
  if (p === 0 || p === 1) return { dx: 0, dy: 0, scale: 1 };
  const envelope = Math.sin(Math.PI * p) ** 2;
  return {
    dx: 48 * Math.sin(Math.PI * 2 * p) * envelope,
    dy: -32 * envelope,
    scale: 1 + 0.08 * envelope,
  };
}

export interface CameraRasterisationTargets {
  readonly svgCamera: SVGGElement;
  readonly htmlCompositor: HTMLElement;
}

/**
 * Apply one cursor sample to the actual expensive SVG-camera or HTML compositor path. The returned
 * cleanup restores the exact attributes/styles it observed, including transition and will-change.
 */
export function applyCameraRasterisationTransform(
  targets: CameraRasterisationTargets,
  variant: CameraRasterisationVariant,
  cursor: number,
  fitTransform: string,
  finalProductTransform = fitTransform,
): () => void {
  // The diagnostic control must be growth-only: TreeView suppresses product motion on every probe
  // route, and this arm performs no camera attribute/style writes at all.
  // Reassigning the same SVG transform can itself invalidate the paint artifact, which would make
  // the baseline measure the very camera cost it is meant to exclude.
  if (variant === 'growth-only') return () => {};

  const oldSvgTransform = targets.svgCamera.getAttribute('transform');
  const oldSvgTransition = targets.svgCamera.style.transition;
  const oldHtmlTransform = targets.htmlCompositor.style.transform;
  const oldHtmlWillChange = targets.htmlCompositor.style.willChange;
  const transform = cameraRasterisationTransformAtCursor(cursor);

  if (variant === 'svg-camera' || variant === 'final-product') {
    // A CSS transition would be an independent clock. The diagnostic always writes sampled values.
    targets.svgCamera.style.transition = 'none';
    targets.svgCamera.setAttribute('transform',
      variant === 'final-product'
        ? finalProductTransform
        : `translate(${transform.dx} ${transform.dy}) scale(${transform.scale}) ${fitTransform}`,
    );
  }

  if (variant === 'html-compositor') {
    targets.htmlCompositor.style.transform = `translate3d(${transform.dx}px, ${transform.dy}px, 0)`;
    targets.htmlCompositor.style.willChange = 'transform';
  }

  return () => {
    if (variant === 'svg-camera' || variant === 'final-product') {
      if (oldSvgTransform === null) targets.svgCamera.removeAttribute('transform');
      else targets.svgCamera.setAttribute('transform', oldSvgTransform);
      targets.svgCamera.style.transition = oldSvgTransition;
    }
    if (variant === 'html-compositor') {
      targets.htmlCompositor.style.transform = oldHtmlTransform;
      targets.htmlCompositor.style.willChange = oldHtmlWillChange;
    }
  };
}

export interface IdleFloor {
  readonly frameDeltasMs: readonly number[];
}

export interface CameraRasterisationFrameSample {
  readonly timestamp: number;
  readonly deltaMs: number;
  readonly cursor: number;
  /** Live `[data-island-accretion-cell]` count: >0 is ADR-0286's "painting" predicate. */
  readonly growthNodeCount: number;
  /** Total elements currently present under `.world-camera`: the ADR-0286 bucket axis. */
  readonly mapNodeCount: number;
  /** Committed visual revision observed at the end of this browser-frame interval. */
  readonly pictureRevision: number;
  /** Exact stable-picture predicate: the committed visual revision did not change this interval. */
  readonly pictureChangedSincePreviousFrame: boolean;
  readonly svgTransform: string | null;
  readonly htmlTransform: string;
}

export interface CameraRasterisationRun {
  readonly runId: string;
  readonly ordinal: number;
  readonly variant: CameraRasterisationVariant;
  readonly preIdle: IdleFloor;
  readonly postIdle: IdleFloor;
  readonly frames: readonly CameraRasterisationFrameSample[];
}

export interface Admissibility {
  readonly accepted: boolean;
  readonly reason: 'accepted' | 'pre-idle-floor' | 'post-idle-floor' | 'both-idle-floors';
  readonly preMedianMs: number;
  readonly postMedianMs: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? Number.NaN);
}

export function idleFloorIsApproximatelyVsync(floor: IdleFloor): boolean {
  const value = median(floor.frameDeltasMs.filter(Number.isFinite));
  return value >= 15 && value <= 19.5;
}

export function assessCameraRasterisationRun(run: CameraRasterisationRun): Admissibility {
  const pre = idleFloorIsApproximatelyVsync(run.preIdle);
  const post = idleFloorIsApproximatelyVsync(run.postIdle);
  return {
    accepted: pre && post,
    reason: pre && post ? 'accepted' : !pre && !post ? 'both-idle-floors' : !pre ? 'pre-idle-floor' : 'post-idle-floor',
    preMedianMs: median(run.preIdle.frameDeltasMs),
    postMedianMs: median(run.postIdle.frameDeltasMs),
  };
}

export const CAMERA_RASTERISATION_BUCKETS = [
  { key: '0-4k', min: 0, max: 3_999 },
  { key: '4-8k', min: 4_000, max: 7_999 },
  { key: '8-12k', min: 8_000, max: 11_999 },
  { key: '12-20k', min: 12_000, max: 19_999 },
  { key: '20k+', min: 20_000, max: Number.POSITIVE_INFINITY },
] as const;

export type CameraRasterisationBucketKey = (typeof CAMERA_RASTERISATION_BUCKETS)[number]['key'];

export interface CameraRasterisationComparisonRow {
  readonly variant: Exclude<CameraRasterisationVariant, 'growth-only'>;
  readonly bucket: string;
  readonly baselineFrameMs: number;
  readonly variantFrameMs: number;
  readonly deltaMs: number;
  readonly baselineSamples: number;
  readonly variantSamples: number;
}

export type CameraRasterisationStablePictureAdequacy = 'adequate' | 'inadequate';
export type CameraRasterisationStablePictureVerdict = 'pass' | 'fail' | 'insufficient-samples';

export interface CameraRasterisationStablePictureComparisonRow {
  readonly variant: Exclude<CameraRasterisationVariant, 'growth-only'>;
  readonly bucket: CameraRasterisationBucketKey;
  readonly baselineFrameMs: number | null;
  readonly variantFrameMs: number | null;
  readonly deltaMs: number | null;
  readonly baselineSamples: number;
  readonly variantSamples: number;
  readonly minimumSamplesPerArm: number;
  readonly adequacy: CameraRasterisationStablePictureAdequacy;
}

export interface CameraRasterisationStablePictureTargetVerdict {
  readonly variant: 'final-product';
  /** Highest declared map-node bucket with an adequate control and product arm, or null. */
  readonly bucket: CameraRasterisationBucketKey | null;
  readonly maximumDeltaMs: number;
  readonly baselineSamples: number | null;
  readonly variantSamples: number | null;
  readonly minimumSamplesPerArm: number;
  readonly observedDeltaMs: number | null;
  readonly verdict: CameraRasterisationStablePictureVerdict;
}

export type CameraRasterisationStablePictureFailureReason =
  | 'stable-picture-target-regression'
  | 'stable-picture-target-insufficient-samples';

/** A passing target is the collector's only successful performance outcome. */
export function cameraRasterisationStablePictureFailureReason(
  target: CameraRasterisationStablePictureTargetVerdict,
): CameraRasterisationStablePictureFailureReason | null {
  if (target.verdict === 'pass') return null;
  return target.verdict === 'fail'
    ? 'stable-picture-target-regression'
    : 'stable-picture-target-insufficient-samples';
}

export interface CameraRasterisationSummary {
  readonly acceptedRunIds: readonly string[];
  readonly rejected: readonly { runId: string; reason: Admissibility['reason'] }[];
  readonly comparisons: readonly CameraRasterisationComparisonRow[];
  readonly stablePictureComparisons: readonly CameraRasterisationStablePictureComparisonRow[];
  readonly stablePictureTarget: CameraRasterisationStablePictureTargetVerdict;
}

const bucketFor = (growthNodeCount: number) =>
  CAMERA_RASTERISATION_BUCKETS.find(
    (bucket) => growthNodeCount >= bucket.min && growthNodeCount <= bucket.max,
  );

/** Order-independent comparison: only admissible runs contribute, grouped by identical buckets. */
export function summariseCameraRasterisationRuns(
  runs: readonly CameraRasterisationRun[],
): CameraRasterisationSummary {
  const accepted = runs.filter((run) => assessCameraRasterisationRun(run).accepted);
  const paintingSamples = new Map<string, number[]>();
  const stablePictureSamples = new Map<string, number[]>();
  for (const run of accepted) {
    for (const frame of run.frames) {
      // ADR-0286's painting predicate remains live accretion. Stable-picture evidence instead uses
      // the committed visual revision: zero accretion can still change paths or vegetation, while
      // an accretion cell can remain unchanged over one measured browser-frame interval.
      const bucket = bucketFor(frame.mapNodeCount);
      if (!bucket || !Number.isFinite(frame.deltaMs) || frame.deltaMs < 0) continue;
      const key = `${run.variant}:${bucket.key}`;
      if (frame.growthNodeCount > 0) {
        const values = paintingSamples.get(key);
        if (values) values.push(frame.deltaMs);
        else paintingSamples.set(key, [frame.deltaMs]);
      }
      if (frame.pictureChangedSincePreviousFrame === false) {
        const values = stablePictureSamples.get(key);
        if (values) values.push(frame.deltaMs);
        else stablePictureSamples.set(key, [frame.deltaMs]);
      }
    }
  }

  const comparisons: CameraRasterisationComparisonRow[] = [];
  for (const variant of CAMERA_RASTERISATION_VARIANTS) {
    if (variant === 'growth-only') continue;
    for (const bucket of CAMERA_RASTERISATION_BUCKETS) {
      const baseline = paintingSamples.get(`growth-only:${bucket.key}`) ?? [];
      const measured = paintingSamples.get(`${variant}:${bucket.key}`) ?? [];
      if (baseline.length === 0 || measured.length === 0) continue;
      const baselineFrameMs = median(baseline);
      const variantFrameMs = median(measured);
      comparisons.push({
        variant,
        bucket: bucket.key,
        baselineFrameMs,
        variantFrameMs,
        deltaMs: variantFrameMs - baselineFrameMs,
        baselineSamples: baseline.length,
        variantSamples: measured.length,
      });
    }
  }

  // Unlike painting comparisons, every stable-picture bucket is emitted even when it is empty.
  // This makes the predeclared sample floor observable and prevents missing target evidence from
  // being mistaken for a passing result.
  const stablePictureComparisons: CameraRasterisationStablePictureComparisonRow[] = [];
  for (const variant of CAMERA_RASTERISATION_VARIANTS) {
    if (variant === 'growth-only') continue;
    for (const bucket of CAMERA_RASTERISATION_BUCKETS) {
      const baseline = stablePictureSamples.get(`growth-only:${bucket.key}`) ?? [];
      const measured = stablePictureSamples.get(`${variant}:${bucket.key}`) ?? [];
      const baselineFrameMs = baseline.length > 0 ? median(baseline) : null;
      const variantFrameMs = measured.length > 0 ? median(measured) : null;
      const adequate =
        baseline.length >= CAMERA_RASTERISATION_STABLE_PICTURE_MIN_SAMPLES_PER_ARM &&
        measured.length >= CAMERA_RASTERISATION_STABLE_PICTURE_MIN_SAMPLES_PER_ARM;
      stablePictureComparisons.push({
        variant,
        bucket: bucket.key,
        baselineFrameMs,
        variantFrameMs,
        deltaMs:
          baselineFrameMs === null || variantFrameMs === null
            ? null
            : variantFrameMs - baselineFrameMs,
        baselineSamples: baseline.length,
        variantSamples: measured.length,
        minimumSamplesPerArm: CAMERA_RASTERISATION_STABLE_PICTURE_MIN_SAMPLES_PER_ARM,
        adequacy: adequate ? 'adequate' : 'inadequate',
      });
    }
  }

  const adequateTargetRows = stablePictureComparisons.filter(
    (row) => row.variant === 'final-product' && row.adequacy === 'adequate',
  );
  // Comparisons inherit CAMERA_RASTERISATION_BUCKETS order, so the last adequate row is the
  // highest-density map state the same-build control and product arms can both support.
  const targetRow = adequateTargetRows[adequateTargetRows.length - 1] ?? null;
  const stablePictureTarget: CameraRasterisationStablePictureTargetVerdict = {
    variant: 'final-product',
    bucket: targetRow?.bucket ?? null,
    maximumDeltaMs: CAMERA_RASTERISATION_STABLE_PICTURE_TARGET_DELTA_MS,
    baselineSamples: targetRow?.baselineSamples ?? null,
    variantSamples: targetRow?.variantSamples ?? null,
    minimumSamplesPerArm: CAMERA_RASTERISATION_STABLE_PICTURE_MIN_SAMPLES_PER_ARM,
    observedDeltaMs: targetRow?.deltaMs ?? null,
    verdict:
      targetRow === null
        ? 'insufficient-samples'
        : targetRow.deltaMs !== null &&
            targetRow.deltaMs <= CAMERA_RASTERISATION_STABLE_PICTURE_TARGET_DELTA_MS
          ? 'pass'
          : 'fail',
  };

  return {
    acceptedRunIds: accepted.map((run) => run.runId),
    rejected: runs
      .map((run) => ({ runId: run.runId, reason: assessCameraRasterisationRun(run).reason }))
      .filter((run) => run.reason !== 'accepted'),
    comparisons,
    stablePictureComparisons,
    stablePictureTarget,
  };
}

export function formatCameraRasterisationComparisonTable(
  summary: CameraRasterisationSummary,
): string {
  const lines = [
    '| variant | map nodes | baseline p50 | variant p50 | delta | samples (base/variant) |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of summary.comparisons) {
    lines.push(
      `| ${row.variant} | ${row.bucket} | ${row.baselineFrameMs.toFixed(2)} ms | ${row.variantFrameMs.toFixed(2)} ms | ${row.deltaMs >= 0 ? '+' : ''}${row.deltaMs.toFixed(2)} ms | ${row.baselineSamples}/${row.variantSamples} |`,
    );
  }
  if (summary.comparisons.length === 0) lines.push('| no admissible comparable samples | — | — | — | — | — |');
  return `${lines.join('\n')}\n`;
}

const formatNullableMilliseconds = (value: number | null): string =>
  value === null ? '—' : `${value.toFixed(2)} ms`;

export function formatCameraRasterisationStablePictureTable(
  summary: CameraRasterisationSummary,
): string {
  const lines = [
    '| variant | map nodes | control stable-picture p50 | variant stable-picture p50 | delta | samples (control/variant; min each) | adequacy | target verdict |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of summary.stablePictureComparisons) {
    const isTarget =
      summary.stablePictureTarget.bucket !== null &&
      row.variant === summary.stablePictureTarget.variant &&
      row.bucket === summary.stablePictureTarget.bucket;
    lines.push(
      `| ${row.variant} | ${row.bucket} | ${formatNullableMilliseconds(row.baselineFrameMs)} | ${formatNullableMilliseconds(row.variantFrameMs)} | ${row.deltaMs === null ? '—' : `${row.deltaMs >= 0 ? '+' : ''}${row.deltaMs.toFixed(2)} ms`} | ${row.baselineSamples}/${row.variantSamples}; min ${row.minimumSamplesPerArm} | ${row.adequacy} | ${isTarget ? summary.stablePictureTarget.verdict : '—'} |`,
    );
  }
  if (summary.stablePictureTarget.bucket === null) {
    lines.push(
      `| final-product target | no adequate bucket | — | — | — | —/—; min ${summary.stablePictureTarget.minimumSamplesPerArm} | inadequate | insufficient-samples |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export interface CameraRasterisationProbeSnapshot {
  readonly protocol: number;
  readonly ready: boolean;
  readonly rejectionReason: string | null;
  readonly variant: CameraRasterisationVariant;
  readonly corpus: { readonly storyCount: number; readonly mappedIslandCount: number };
  readonly settings: {
    readonly regrowSpeed: number;
    readonly reducedMotion: boolean;
    readonly durationMs: number | null;
    readonly schedule: readonly unknown[];
  };
  readonly player: { readonly cursor: number; readonly playing: boolean; readonly regrowing: boolean };
  readonly growthNodeCount: number;
  readonly mapNodeCount: number;
  readonly pictureRevision: number;
  readonly svgTransform: string | null;
  readonly htmlTransform: string;
  readonly fitTransform: string | null;
}

export interface CameraRasterisationProbeBridge {
  snapshot(): CameraRasterisationProbeSnapshot;
  start(): { ok: boolean; reason?: string };
  settle(): void;
  abort(): void;
}

declare global {
  interface Window {
    __storytreeCameraRasterisationProbe?: CameraRasterisationProbeBridge;
  }
}
