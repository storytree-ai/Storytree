// The traversal spine's TIME MODEL (`traversal-panel-arc`, increment `traversal-panel-spine-render`).
//
// The one hard problem in the signed design: "confirmed idle spans are folded explicitly rather than
// removed or visually stretched", and active spans get "room in proportion to how much happened in
// them rather than to their wall-clock length" (docs/design/context-traversal/README.md).
//
// WHY minutes-to-pixels cannot draw this, measured rather than assumed: of this machine's 323 recorded
// traces the largest spans 12,952 minutes for 203 events, and one spans 7,454 minutes for 215. A linear
// map puts nearly the whole picture inside gaps where nothing happened and crushes every burst into a
// few pixels — the 8h-trace legibility clause fails on real data, not on a hypothetical.
//
// So the axis is piecewise:
//
//   • an ACTIVE RUN — events separated by less than `idleThresholdMs` — takes height in proportion to
//     its EVENT COUNT, out of a bounded total budget. Density, not duration.
//   • an IDLE SPAN — a gap at or beyond the threshold — folds to `foldPx`, a CONSTANT stub. Constant is
//     the whole point: it is neither removed (the stub is strictly positive and carries a duration
//     label a reader can see) nor stretched (a three-hour gap and a six-minute gap occupy the same
//     pixels, so neither can dominate the picture).
//
// Every value here is geometry over timestamps. It derives nothing about what an event MEANS, holds no
// React, and touches no DOM — which is what lets the fold rule and the density rule be proved red-green
// in isolation, per the increment's proof route.

/** How the axis trades pixels for time. Every field is a display choice, never a claim about a trace. */
export interface TraversalTimeConfig {
  /** A gap at or beyond this is a CONFIRMED idle span and folds. Below it, time flows inside a run. */
  readonly idleThresholdMs: number;
  /** The density weight: the active budget aims for this many pixels per plotted event. */
  readonly pxPerEvent: number;
  /** A ceiling on the total active height, so a 200-event trace stays a panel and not a scroll marathon. */
  readonly maxActivePx: number;
  /** A floor per run, so a run holding a single event is still a place a reader can point at. */
  readonly minActiveRunPx: number;
  /** The BOUNDED stub an idle span folds to — constant by design, independent of the gap's duration. */
  readonly foldPx: number;
}

export const TRAVERSAL_TIME_DEFAULTS: TraversalTimeConfig = {
  idleThresholdMs: 5 * 60_000,
  pxPerEvent: 8,
  maxActivePx: 720,
  minActiveRunPx: 12,
  foldPx: 16,
};

export type TraversalSegmentKind = 'active' | 'fold';

/** One piece of the axis: a half-open span of time mapped linearly onto a span of pixels. */
export interface TraversalSegment {
  readonly kind: TraversalSegmentKind;
  readonly fromMs: number;
  readonly toMs: number;
  readonly yStart: number;
  readonly yEnd: number;
  /** Events inside this segment. A fold holds none by construction — that is what made it a fold. */
  readonly eventCount: number;
}

/** A folded idle span, carried separately because the picture DRAWS it: a mark plus its duration. */
export interface TraversalFold {
  readonly fromMs: number;
  readonly toMs: number;
  readonly durationMs: number;
  readonly yStart: number;
  readonly yEnd: number;
  /** The duration as a reader sees it — "3h18", "31m". The fold is never silent about what it hid. */
  readonly label: string;
}

export interface TraversalTimeScale {
  readonly segments: readonly TraversalSegment[];
  readonly folds: readonly TraversalFold[];
  readonly startMs: number;
  readonly endMs: number;
  /** Total height. `0` only when there is nothing to plot at all. */
  readonly totalPx: number;
  /** Wall-clock the trace really covers — the number the clock reads against, folds and all. */
  readonly elapsedMs: number;
}

const EMPTY_SCALE: TraversalTimeScale = {
  segments: [],
  folds: [],
  startMs: 0,
  endMs: 0,
  totalPx: 0,
  elapsedMs: 0,
};

/**
 * Build the axis from the plotted events' timestamps.
 *
 * `timesMs` need not be sorted and may repeat; a repeated instant is a real thing (two reads inside the
 * same millisecond) and is kept, because dropping it would under-count the density it contributes.
 */
export function buildTraversalTimeScale(
  timesMs: readonly number[],
  config: TraversalTimeConfig = TRAVERSAL_TIME_DEFAULTS,
): TraversalTimeScale {
  const times = [...timesMs].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (times.length === 0) return EMPTY_SCALE;

  const startMs = times[0] as number;
  const endMs = times[times.length - 1] as number;

  // 1. Cut the ordered instants into active runs at every gap that reaches the idle threshold.
  const runs: { fromMs: number; toMs: number; eventCount: number }[] = [];
  let run = { fromMs: startMs, toMs: startMs, eventCount: 0 };
  let previous: number | null = null;
  for (const time of times) {
    if (previous !== null && time - previous >= config.idleThresholdMs) {
      runs.push(run);
      run = { fromMs: time, toMs: time, eventCount: 0 };
    }
    run.toMs = time;
    run.eventCount += 1;
    previous = time;
  }
  runs.push(run);

  // 2. Share a BOUNDED active budget out by event count. The per-run floor may push the total past the
  //    budget on a trace of many tiny runs, and it is allowed to: legibility of a run a reader must be
  //    able to click beats holding an arbitrary ceiling exactly.
  const activeBudgetPx = Math.min(config.maxActivePx, Math.max(config.minActiveRunPx, config.pxPerEvent * times.length));
  const heights = runs.map((item) =>
    Math.max(config.minActiveRunPx, (activeBudgetPx * item.eventCount) / times.length),
  );

  // 3. Lay the runs and the folds between them out down the axis.
  const segments: TraversalSegment[] = [];
  const folds: TraversalFold[] = [];
  let y = 0;
  runs.forEach((item, index) => {
    if (index > 0) {
      const previousRun = runs[index - 1] as { toMs: number };
      const foldFrom = previousRun.toMs;
      const foldTo = item.fromMs;
      const fold: TraversalFold = {
        fromMs: foldFrom,
        toMs: foldTo,
        durationMs: foldTo - foldFrom,
        yStart: y,
        yEnd: y + config.foldPx,
        label: formatDuration(foldTo - foldFrom),
      };
      folds.push(fold);
      segments.push({
        kind: 'fold',
        fromMs: foldFrom,
        toMs: foldTo,
        yStart: y,
        yEnd: y + config.foldPx,
        eventCount: 0,
      });
      y += config.foldPx;
    }
    const height = heights[index] as number;
    segments.push({
      kind: 'active',
      fromMs: item.fromMs,
      toMs: item.toMs,
      yStart: y,
      yEnd: y + height,
      eventCount: item.eventCount,
    });
    y += height;
  });

  return { segments, folds, startMs, endMs, totalPx: y, elapsedMs: endMs - startMs };
}

/**
 * Where an instant sits on the axis. Clamped at both ends, and non-decreasing everywhere — time never
 * runs backwards in the playback (the design's own words), so nor may this.
 */
export function yAt(scale: TraversalTimeScale, atMs: number): number {
  if (scale.segments.length === 0) return 0;
  if (atMs <= scale.startMs) return 0;
  if (atMs >= scale.endMs) return scale.totalPx;
  for (const segment of scale.segments) {
    if (atMs > segment.toMs) continue;
    const span = segment.toMs - segment.fromMs;
    if (span <= 0) return segment.yStart;
    const ratio = Math.min(1, Math.max(0, (atMs - segment.fromMs) / span));
    return segment.yStart + ratio * (segment.yEnd - segment.yStart);
  }
  return scale.totalPx;
}

/**
 * The inverse: which instant a pixel row stands for.
 *
 * The transport SCRUBS IN PIXELS rather than in minutes, and that follows from the fold: a playhead
 * advancing at constant wall-clock speed would sit inside a three-hour fold for most of the playback,
 * staring at a stub. Advancing at constant PIXEL speed spends the viewer's attention where the density
 * weighting already said the trace spent its work. The clock still reads real elapsed time, so nothing
 * about the wall clock is hidden — only the rate at which the picture is walked.
 */
export function timeAt(scale: TraversalTimeScale, y: number): number {
  if (scale.segments.length === 0) return 0;
  if (y <= 0) return scale.startMs;
  if (y >= scale.totalPx) return scale.endMs;
  for (const segment of scale.segments) {
    if (y > segment.yEnd) continue;
    const span = segment.yEnd - segment.yStart;
    if (span <= 0) return segment.fromMs;
    const ratio = Math.min(1, Math.max(0, (y - segment.yStart) / span));
    return segment.fromMs + ratio * (segment.toMs - segment.fromMs);
  }
  return scale.endMs;
}

/** A duration as a fold label or a clock reads it: "48s", "31m", "3h18", "2d 4h". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h${minutes.toString().padStart(2, '0')}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Elapsed time on the transport clock — `h:mm:ss` under a day, `Nd h:mm` past it. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours < 24) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${Math.floor(hours / 24)}d ${(hours % 24).toString()}:${minutes.toString().padStart(2, '0')}`;
}
