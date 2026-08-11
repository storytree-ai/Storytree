// The ONE playhead occupancy bar's quantity (`traversal-panel-arc`, increment
// `traversal-panel-spine-render`), and the four honesty rules that come with it.
//
// 1. THE QUANTITY IS `residentInputTokens`, and nothing else (ADR-0248 D1). `cumulativeInputTokens` is
//    a BILLING TOTAL: monotonic by construction, and measured at 613% and 504% of a declared 200,000
//    window on two real builds. A bar built from it reads six times full with a negative remainder. The
//    signed reference trace RECEDES twice — 240.9k → 228.1k and 239.8k → 229.6k — and that recession is
//    the evidence the whole decision rests on, so the plotted quantity must be one that can FALL.
//    `addedInputTokens` is a dead duplicate of the billing total (ADR-0248 D3, pending removal by the
//    increment owning its emitters): it is never plotted here, and never read.
//
// 2. THE SERIES IS OPTIONAL, and its absence is an ABSENCE. `residentInputTokens` is populated only by
//    the host-transcript adapter, which is not ambient — it needs an explicit
//    `storytree traversal ingest <sessionId>`. Measured on this machine 2026-08-11: of 323 recorded
//    traces, ZERO carry the field, so the unobserved path is the ordinary one and not an edge case. A
//    session with no observations yields `observationCount: 0` and the surface must SAY so. Drawing a
//    flat zero would assert an empty window, which is a claim nobody made.
//
// 3. OCCUPANCY IS HELD, never interpolated. Between two model requests the window's occupancy is simply
//    the last thing observed; a line drawn between them would invent readings at instants no request
//    was made.
//
// 4. CHILD WINDOWS ARE NEVER SUMMED INTO THE PARENT FIGURE ("no merged parent/child token accounting").
//    A child runs an independent context window; adding it to the parent's would draw a bar for a window
//    that does not exist. Observations whose `sessionId` is not the replayed session's are counted and
//    excluded, never folded in.

import type { TraversalEventEnvelope } from '../types';

/** The owner-selected display threshold. Display-only — never a runtime cutoff or a window claim. */
export const OCCUPANCY_THRESHOLD_TOKENS = 500_000;

/** The bar's default ceiling: twice the threshold, so the red is half the track when it appears. */
const BASE_SCALE_TOKENS = 2 * OCCUPANCY_THRESHOLD_TOKENS;

/** Ceiling growth granularity, so a series peaking above the base scale still gets a stable track. */
const SCALE_STEP_TOKENS = 250_000;

export interface OccupancyObservation {
  readonly atMs: number;
  /** Tokens RESIDENT in the window at one model request. Not monotonic — it falls on compaction. */
  readonly residentTokens: number;
}

export interface OccupancySeries {
  /** Sorted, parent-session-only, and only those requests that actually reported a resident figure. */
  readonly observations: readonly OccupancyObservation[];
  /** How many `model_context` events were seen at all — the denominator behind "unobserved". */
  readonly modelContextCount: number;
  /** How many of them carried the plottable field. `0` is the "say so" path, never a zero bar. */
  readonly observationCount: number;
  /** `model_context` events belonging to another session's window — excluded, never summed (rule 4). */
  readonly foreignWindowCount: number;
  readonly maxResidentTokens: number;
  /**
   * The track's ceiling. A DISPLAY scale chosen from the series, never a claim about any model's
   * context window — the design says the same of the threshold, and for the same reason.
   */
  readonly scaleTokens: number;
}

/**
 * Build the plottable series from a replay's events.
 *
 * `sessionId` is the REPLAYED session — the parent. It is required rather than inferred so rule 4 is
 * enforced by construction: an observation can only join the series by naming the same window.
 */
export function buildOccupancySeries(
  events: readonly TraversalEventEnvelope[],
  sessionId: string,
): OccupancySeries {
  const observations: OccupancyObservation[] = [];
  let modelContextCount = 0;
  let foreignWindowCount = 0;

  for (const event of events) {
    if (event.kind !== 'model_context') continue;
    modelContextCount += 1;
    if (event.sessionId !== sessionId) {
      foreignWindowCount += 1;
      continue;
    }
    // Rule 1: the resident figure or nothing. `cumulativeInputTokens` is present on every one of these
    // events and is deliberately not consulted — falling back to it would silently swap a billing total
    // in for an occupancy reading, which is the exact confusion ADR-0248 was written to end.
    const resident = event.residentInputTokens;
    if (resident === undefined) continue;
    const atMs = parseAt(event.at);
    if (atMs === null) continue;
    observations.push({ atMs, residentTokens: resident });
  }

  observations.sort((a, b) => a.atMs - b.atMs);
  const maxResidentTokens = observations.reduce((max, item) => Math.max(max, item.residentTokens), 0);

  return {
    observations,
    modelContextCount,
    observationCount: observations.length,
    foreignWindowCount,
    maxResidentTokens,
    scaleTokens: scaleFor(maxResidentTokens),
  };
}

/**
 * Occupancy AT the playhead: the most recent observation at or before `atMs`, HELD (rule 3).
 *
 * `null` before the first observation — which is "nothing has been observed yet", not "the window is
 * empty". The caller renders the two differently.
 */
export function occupancyAt(series: OccupancySeries, atMs: number): OccupancyObservation | null {
  let current: OccupancyObservation | null = null;
  for (const observation of series.observations) {
    if (observation.atMs > atMs) break;
    current = observation;
  }
  return current;
}

/** How the track splits at one reading: a safe head, and the over-threshold tail that renders red. */
export interface OccupancyFill {
  /** Fraction of the track filled by the portion at or below the threshold. */
  readonly safeFraction: number;
  /** Fraction filled by the portion PAST the threshold — the red. `0` at exactly the threshold. */
  readonly overFraction: number;
  /** Where the red starts. Fixed at threshold/scale — it is where the fill splits, not a marker. */
  readonly overStartFraction: number;
}

/**
 * Split one reading into its safe and over-threshold portions.
 *
 * The split is at EXACTLY {@link OCCUPANCY_THRESHOLD_TOKENS}: a reading of exactly 500,000 has no red at
 * all, and only the excess above it is ever red. Nothing here draws a marker, tick, or arc for the
 * threshold — the red IS the whole signal, and `overStartFraction` exists only so the red segment knows
 * where to begin.
 */
export function occupancyFill(residentTokens: number, scaleTokens: number): OccupancyFill {
  const scale = scaleTokens > 0 ? scaleTokens : BASE_SCALE_TOKENS;
  const clamped = Math.max(0, Math.min(residentTokens, scale));
  const safe = Math.min(clamped, OCCUPANCY_THRESHOLD_TOKENS);
  const over = Math.max(0, clamped - OCCUPANCY_THRESHOLD_TOKENS);
  return {
    safeFraction: safe / scale,
    overFraction: over / scale,
    overStartFraction: Math.min(1, OCCUPANCY_THRESHOLD_TOKENS / scale),
  };
}

/** "240.9k", "1.2M" — the readout beside the bar. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

function scaleFor(maxResidentTokens: number): number {
  if (maxResidentTokens <= BASE_SCALE_TOKENS) return BASE_SCALE_TOKENS;
  return Math.ceil(maxResidentTokens / SCALE_STEP_TOKENS) * SCALE_STEP_TOKENS;
}

function parseAt(at: string | undefined): number | null {
  if (at === undefined) return null;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? null : parsed;
}
