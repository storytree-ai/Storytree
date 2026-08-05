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
export const CAMERA_RASTERISATION_PROTOCOL = 1;

export const CAMERA_RASTERISATION_VARIANTS = [
  'growth-only',
  'svg-camera',
  'html-compositor',
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
): () => void {
  // The control must be the shipped growth-only path: no camera attribute/style writes at all.
  // Reassigning the same SVG transform can itself invalidate the paint artifact, which would make
  // the baseline measure the very camera cost it is meant to exclude.
  if (variant === 'growth-only') return () => {};

  const oldSvgTransform = targets.svgCamera.getAttribute('transform');
  const oldSvgTransition = targets.svgCamera.style.transition;
  const oldHtmlTransform = targets.htmlCompositor.style.transform;
  const oldHtmlWillChange = targets.htmlCompositor.style.willChange;
  const transform = cameraRasterisationTransformAtCursor(cursor);

  if (variant === 'svg-camera') {
    // A CSS transition would be an independent clock. The diagnostic always writes sampled values.
    targets.svgCamera.style.transition = 'none';
    targets.svgCamera.setAttribute(
      'transform',
      `translate(${transform.dx} ${transform.dy}) scale(${transform.scale}) ${fitTransform}`,
    );
  }

  if (variant === 'html-compositor') {
    targets.htmlCompositor.style.transform = `translate3d(${transform.dx}px, ${transform.dy}px, 0)`;
    targets.htmlCompositor.style.willChange = 'transform';
  }

  return () => {
    if (variant === 'svg-camera') {
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

export interface CameraRasterisationComparisonRow {
  readonly variant: Exclude<CameraRasterisationVariant, 'growth-only'>;
  readonly bucket: string;
  readonly baselineFrameMs: number;
  readonly variantFrameMs: number;
  readonly deltaMs: number;
  readonly baselineSamples: number;
  readonly variantSamples: number;
}

export interface CameraRasterisationSummary {
  readonly acceptedRunIds: readonly string[];
  readonly rejected: readonly { runId: string; reason: Admissibility['reason'] }[];
  readonly comparisons: readonly CameraRasterisationComparisonRow[];
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
  const samples = new Map<string, number[]>();
  for (const run of accepted) {
    for (const frame of run.frames) {
      // ADR-0286: only a frame with live accretion is a painting frame. The bucket is the total
      // number of nodes then present on the map; conflating these two counts floods the first bucket
      // with idle wave gaps and makes the raster cost look like the 16.7 ms idle floor.
      if (frame.growthNodeCount <= 0) continue;
      const bucket = bucketFor(frame.mapNodeCount);
      if (!bucket || !Number.isFinite(frame.deltaMs) || frame.deltaMs < 0) continue;
      const key = `${run.variant}:${bucket.key}`;
      const values = samples.get(key);
      if (values) values.push(frame.deltaMs);
      else samples.set(key, [frame.deltaMs]);
    }
  }

  const comparisons: CameraRasterisationComparisonRow[] = [];
  for (const variant of CAMERA_RASTERISATION_VARIANTS) {
    if (variant === 'growth-only') continue;
    for (const bucket of CAMERA_RASTERISATION_BUCKETS) {
      const baseline = samples.get(`growth-only:${bucket.key}`) ?? [];
      const measured = samples.get(`${variant}:${bucket.key}`) ?? [];
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

  return {
    acceptedRunIds: accepted.map((run) => run.runId),
    rejected: runs
      .map((run) => ({ runId: run.runId, reason: assessCameraRasterisationRun(run).reason }))
      .filter((run) => run.reason !== 'accepted'),
    comparisons,
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
