// The ONE playhead occupancy bar's quantity (`traversal-panel-arc`, increment
// `traversal-panel-spine-render`; REPOINTED at the host transcripts by ADR-0456 D2), and the honesty
// rules that come with it.
//
// 1. THE QUANTITY IS `residentInputTokens`, and nothing else (ADR-0248 D1). `cumulativeInputTokens` is
//    a BILLING TOTAL: monotonic by construction, and measured at 613% and 504% of a declared 200,000
//    window on two real builds. A bar built from it reads six times full with a negative remainder. The
//    signed reference trace RECEDES twice — 240.9k → 228.1k and 239.8k → 229.6k — and that recession is
//    the evidence the whole decision rests on, so the plotted quantity must be one that can FALL.
//    `addedInputTokens` is a dead duplicate of the billing total (ADR-0248 D3, pending removal by the
//    increment owning its emitters): it is never plotted here, and never read.
//
// 2. THE SERIES IS OPTIONAL, and its absence is an ABSENCE. A session with no observations yields
//    `observationCount: 0` and the surface must SAY so. Drawing a flat zero would assert an empty
//    window, which is a claim nobody made.
//
// 3. OCCUPANCY IS HELD, never interpolated. Between two model requests the window's occupancy is simply
//    the last thing observed; a line drawn between them would invent readings at instants no request
//    was made.
//
// 4. CHILD WINDOWS ARE NEVER SUMMED INTO THE PARENT FIGURE ("no merged parent/child token accounting",
//    ADR-0413 D2, permanent and restated by ADR-0452 D4). A child runs an independent context window;
//    adding it to the parent's would draw a bar for a window that does not exist. Observations
//    belonging to another window are counted and excluded, never folded in.
//
// 5. ONE SERIES IS ONE CONTEXT WINDOW, and a series that would span two is REFUSED rather than
//    spliced (`traversal-panel-one-trace-one-session`; owner, 2026-08-30, looking at the panel: "we
//    want each one to represent a single orchestration session, the context window should never go
//    down unless i did a compaction"). Rule 4 was enforced against the replayed SESSION id, which is
//    the whole guard for a trace keyed by a window — but the legacy traces are keyed by a worktree
//    SLOT, and a slot pools every window that ran in it. `recursing-neumann-3a74d7` is 98 separate
//    conversations under one session id: measured over its 1,077 readings the spliced line falls 44
//    times, and ZERO of those falls occur inside a window — every one sits exactly on a boundary. No
//    number in it is wrong; the LINE is, because laying 98 windows end to end draws a fall the window
//    never had. So the readings themselves are checked for `windowId`, and where they name more than
//    one the bar says "none observed" with the count. THE STATED ABSENCE IS THE HOUSE PREFERENCE over
//    a fabricated line, and the alternatives were weighed: drawing ONE named window would hold a dead
//    window's last reading across the days of trace that follow it — trading this lie for a subtler
//    one — and drawing boundary marks would add grammar to a picture that is in front of the owner
//    for signature. Only TWO local traces can splice at all (the only two ever `traversal ingest`-ed;
//    the other 748 carry no readings), and trace identity is already fixed FORWARD — every trace
//    since 2026-08-26 is keyed by a window UUID. This is the code path, not a data repair: the two
//    legacy traces are the historical record and are not re-keyed.
//
// ★ THERE ARE TWO SOURCES FOR ONE BAR, AND THE PREFERENCE IS NOT A TASTE (ADR-0456 D2). The bar was
//   built on the replayed TRACE, and `residentInputTokens` reaches a trace only through an explicit
//   `storytree traversal ingest` — measured 2026-08-26, 2 of 697 local traces carry it. So the bar
//   that has been in the owner-signed design since the beginning renders its honest "none observed"
//   for effectively every trace on this machine. The HOST TRANSCRIPTS are ambient (the harness writes
//   one per window as the window runs) and answer for 25 of the 30 most recent traces. This module
//   therefore builds the SAME series shape from either source, {@link buildTranscriptOccupancySeries}
//   is preferred where it has readings, and the trace-sourced build stays as the fallback so the two
//   ingested traces do not regress. It is ONE bar with a stated source — never two displays of one
//   quantity, which is the duplication ADR-0456 exists to remove.
//
// ★★ THE MARKS ARE ADR-0411 D3'S, IMPORTED RATHER THAN DECLARED. The soft mark (~400K) is "take on no
//   NEW increment — finish what you hold, then hand over"; the hard mark (500K) is "land what is
//   green, write the handover, let a fresh session continue". They come from
//   `@storytree/context-traversal-transcript/marks`, the one copy `storytree context` also reads,
//   because ADR-0411 D8 says out loud they may be TUNED and two copies of a tunable constant is how
//   one surface comes to say "soft" while the other says "calm" about the same window.
//
// ★★★ THE MARKS ARE DRAWN AS COLOUR, NEVER AS A MARKER, TICK, OR ARC. That is the signed grammar
//   (`docs/design/context-traversal/README.md`, revision 2026-07-27, clause 3), which removed the
//   threshold marker and shows overflow by COLOURING the over-threshold portion instead. ADR-0456 D4
//   carries it across unchanged to TWO thresholds: three coloured portions, and nothing drawn at
//   either boundary. A future session reaching for a tick here is reaching for something already
//   decided against.

import {
  HARD_MARK_TOKENS,
  SOFT_MARK_TOKENS,
  bandGuidance,
  bandOf,
  type ContextBand,
} from '@storytree/context-traversal-transcript/marks';

import type { ContextWindowSeriesPayload, TraversalEventEnvelope } from '../types';

export { HARD_MARK_TOKENS, SOFT_MARK_TOKENS, bandGuidance, bandOf };
export type { ContextBand };

/**
 * The track's base ceiling.
 *
 * Deliberately ABOVE the hard mark rather than a multiple of it: at a ceiling of exactly 500K a
 * window that reached the hard mark fills the whole track, so "at the limit" and "past it" would draw
 * identically — and past-the-limit is the state the mark exists to make visible. At 600K the hard
 * mark sits at 83% with headroom left to see, and a typical 250K window still reads at 42% rather
 * than disappearing into the bottom of a track scaled for a figure nothing reaches. (It was 1M — two
 * times a single 500K threshold — while the bar had one mark and no real data to draw; the measured
 * peaks it now plots run 149K–616K.)
 */
const BASE_SCALE_TOKENS = 600_000;

/** Ceiling growth granularity, so a series peaking above the base still gets a stable track. */
const SCALE_STEP_TOKENS = 100_000;

/** Where a series came from — stated, because the two sources answer for very different populations. */
export type OccupancySource = 'transcript' | 'trace';

export interface OccupancyObservation {
  readonly atMs: number;
  /** Tokens RESIDENT in the window at one model request. Not monotonic — it falls on compaction. */
  readonly residentTokens: number;
}

export interface OccupancySeries {
  /** Sorted, one-window-only, and only those requests that actually reported a resident figure. */
  readonly observations: readonly OccupancyObservation[];
  /** How many requests were seen at all — the denominator behind "unobserved". */
  readonly modelContextCount: number;
  /** How many of them carried the plottable field. `0` is the "say so" path, never a zero bar. */
  readonly observationCount: number;
  /** Requests belonging to another window — excluded, never summed (rule 4). */
  readonly foreignWindowCount: number;
  /**
   * How many distinct context windows the PLOTTED readings named — rule 5 in mechanical form.
   *
   * Whenever `observations` is non-empty this is exactly 1: that is the invariant a reader may
   * assert instead of trusting the prose. A source whose readings would span more is refused, and
   * then this reports how many were found while `observations` stays empty — so the count survives
   * the refusal rather than being discarded with the line it would have drawn.
   *
   * `0` means no reading named a window: either there was nothing to plot, or the readings carry no
   * `windowId` at all. The field is optional on the wire, so an unstamped reading is the absence of
   * evidence and never evidence of a splice.
   */
  readonly spannedWindowCount: number;
  readonly maxResidentTokens: number;
  /**
   * The track's ceiling. A DISPLAY scale chosen from the series, never a claim about any model's
   * context window — the design says the same of the marks, and for the same reason.
   */
  readonly scaleTokens: number;
  /** Which source produced these readings. */
  readonly source: OccupancySource;
  /**
   * One line a reader may render VERBATIM — what was read, or what was looked for and not found.
   *
   * Empty for the trace-sourced build, whose own absence sentence is composed server-side and rides
   * the replay payload (`replay.occupancy.note`). The transcript source has no such payload, so its
   * reason travels here rather than being re-derived from a count in the renderer.
   */
  readonly note: string;
}

/**
 * Build the plottable series from a replay's events — the TRACE source (the fallback since ADR-0456 D2).
 *
 * `sessionId` is the REPLAYED session. It is required rather than inferred so rule 4 is enforced by
 * construction: an observation can only join the series by naming the same window.
 */
export function buildOccupancySeries(
  events: readonly TraversalEventEnvelope[],
  sessionId: string,
): OccupancySeries {
  const scan = scanTraceReadings(events, sessionId);
  const spannedWindowCount = scan.windowIds.size;
  const facts = {
    modelContextCount: scan.modelContextCount,
    foreignWindowCount: scan.foreignWindowCount,
    spannedWindowCount,
    source: 'trace' as const,
  };

  // Rule 5. The readings themselves name more than one window, so there is no single window whose
  // occupancy this could be — and the falls a spliced line draws are boundaries, not compactions.
  if (spannedWindowCount > 1) {
    return assemble([], { ...facts, note: splicedTraceNote(spannedWindowCount, scan.readings) });
  }

  return assemble(plottedObservations(scan.readings), { ...facts, note: '' });
}

/** One reading kept beside the window it named, so rule 5 can be decided on what would be PLOTTED. */
interface ScannedReading {
  readonly observation: OccupancyObservation;
  /** `undefined` where the event carried no `windowId` — it names no window, and is not evidence. */
  readonly windowId: string | undefined;
}

/** What one pass over a replay's events yields: the plottable readings, and the two denominators. */
interface TraceScan {
  readonly readings: readonly ScannedReading[];
  readonly modelContextCount: number;
  readonly foreignWindowCount: number;
  /** Distinct windows named by the readings ABOVE — never by events that would not be drawn. */
  readonly windowIds: ReadonlySet<string>;
}

/**
 * Walk a replay's events once for everything the series needs.
 *
 * ★ THE WINDOW IDS ARE COLLECTED FROM THE PLOTTABLE READINGS ONLY, and that is the load-bearing
 * choice. A `model_context` event carrying no resident figure would never be drawn, so a second
 * window that contributes nothing to the line is not a splice and must not refuse the series — the
 * question rule 5 asks is what the LINE would be built from, not what the trace happens to contain.
 */
function scanTraceReadings(
  events: readonly TraversalEventEnvelope[],
  sessionId: string,
): TraceScan {
  const readings: ScannedReading[] = [];
  const windowIds = new Set<string>();
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
    const windowId = event.windowId;
    if (windowId !== undefined) windowIds.add(windowId);
    readings.push({ observation: { atMs, residentTokens: resident }, windowId });
  }

  return { readings, modelContextCount, foreignWindowCount, windowIds };
}

/** Drop the window each reading named, once rule 5 has been decided on it. */
function plottedObservations(readings: readonly ScannedReading[]): OccupancyObservation[] {
  const observations: OccupancyObservation[] = [];
  for (const reading of readings) observations.push(reading.observation);
  return observations;
}

/**
 * The sentence a refused trace renders VERBATIM — the reason, never a blank.
 *
 * It names the window count because that is the fact an operator needs to recognise a slot-keyed
 * legacy trace for what it is, and the reading count because "none observed" would otherwise read as
 * "this session was never observed" when in truth it was observed 1,077 times across 98 conversations.
 */
function splicedTraceNote(windowCount: number, readings: readonly ScannedReading[]): string {
  return `${readings.length} reading(s) in this trace span ${windowCount} context windows — no single window’s occupancy to draw, and a line across them would fall at every boundary`;
}

/**
 * Build the same series from ONE window's host transcript — the PREFERRED source (ADR-0456 D2).
 *
 * It derives no parse rule of its own: every reading here was produced by
 * `readWindowOccupancySeries` over `readTranscriptWindow`, which is the same reader the ingest uses,
 * with the `<synthetic>` exclusion already applied server-side. A second copy of "what counts as a
 * resident total" in the browser is exactly how two surfaces come to describe one transcript
 * differently.
 *
 * An ABSENT payload is not the same as an absent series and is not passed here — the caller keeps
 * `null` for "not read yet" so a pending fetch never renders as "this window was never observed".
 */
export function buildTranscriptOccupancySeries(
  payload: ContextWindowSeriesPayload,
): OccupancySeries {
  const observations: OccupancyObservation[] = [];
  for (const reading of payload.observations) {
    const atMs = parseAt(reading.at);
    // A reading the playhead cannot place is not plottable. It still counted as a request, so it
    // stays in the denominator rather than vanishing from both sides of the ratio.
    if (atMs === null) continue;
    observations.push({ atMs, residentTokens: reading.residentTokens });
  }

  return assemble(observations, {
    // Synthetic lines were REQUESTS the harness recorded and readings this bar must not plot, so
    // they belong in the denominator exactly as an un-ingested `model_context` event does.
    modelContextCount: payload.observations.length + payload.syntheticObservations,
    // Helper requests, excluded upstream and counted. The trace source calls the same fact
    // `foreignWindowCount`; both mean "a request that belongs to another window" (ADR-0413 D2).
    foreignWindowCount: payload.sidechainRequests,
    spannedWindowCount: transcriptWindowCount(payload),
    source: 'transcript',
    note: payload.note,
  });
}

/**
 * Rule 5 for the transcript source, which satisfies it BY CONSTRUCTION rather than by checking.
 *
 * The route reads one window's own transcript, found by that window's id as a file name, so a series
 * it produced cannot have named a second window. It is stated here anyway so both sources answer the
 * same question with the same field — a reader asserting the invariant must not have to know which
 * source it got.
 */
function transcriptWindowCount(payload: ContextWindowSeriesPayload): number {
  return payload.observations.length > 0 ? 1 : 0;
}

interface SeriesFacts {
  readonly modelContextCount: number;
  readonly foreignWindowCount: number;
  readonly spannedWindowCount: number;
  readonly source: OccupancySource;
  readonly note: string;
}

/** Sort, peak, scale — the half both sources share, so neither can be scaled differently. */
function assemble(observations: OccupancyObservation[], facts: SeriesFacts): OccupancySeries {
  const sorted = [...observations].sort((a, b) => a.atMs - b.atMs);
  const maxResidentTokens = sorted.reduce((max, item) => Math.max(max, item.residentTokens), 0);
  return {
    observations: sorted,
    modelContextCount: facts.modelContextCount,
    observationCount: sorted.length,
    foreignWindowCount: facts.foreignWindowCount,
    spannedWindowCount: facts.spannedWindowCount,
    maxResidentTokens,
    scaleTokens: scaleFor(maxResidentTokens),
    source: facts.source,
    note: facts.note,
  };
}

/**
 * Which of the two sources the bar draws — ONE bar, a stated preference, never two displays.
 *
 * The transcript wins where it has readings, because it is the ambient source: the trace's series
 * exists only after an explicit `storytree traversal ingest`, which 2 of 697 local traces have had.
 * The trace wins where the transcript has none and it does, so the two genuinely-ingested traces do
 * not regress to "none observed" the moment the ambient read comes back empty.
 *
 * ★ WHEN NEITHER HAS READINGS THE TRANSCRIPT STILL WINS, and that is the case worth stating: what a
 * reader needs then is the REASON, and the transcript source always carries one. Its note says
 * whether the root was empty, whether nothing on this machine is named for that window (the legacy
 * slot-keyed traces, 601 of 704), or whether the window's own transcript held nothing usable —
 * absences about the MACHINE's transcripts, which is what a reader looking for a missing series
 * needs first. The trace-sourced build carries a note in exactly one case, rule 5's refusal, and
 * that case is precisely the one where the transcript's own sentence already says the same thing in
 * the same breath ("a trace keyed by a worktree slot pools every window that ran in it and names no
 * single window"). So the ordering is unchanged and neither branch is now a silent absence — the
 * refusal's own reason still reaches a reader wherever the transcript could not be read at all, the
 * `null` branch below.
 *
 * `null` for the transcript means NOT READ YET, never "nothing was observed", so it leaves the trace
 * series drawing exactly as it did before this preference existed.
 */
export function preferredOccupancy(
  trace: OccupancySeries,
  transcript: OccupancySeries | null,
): OccupancySeries {
  if (transcript === null) return trace;
  if (transcript.observationCount > 0) return transcript;
  if (trace.observationCount > 0) return trace;
  return transcript;
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

/**
 * How the track splits at one reading: three coloured portions, one per band (ADR-0456 D4).
 *
 * Nothing here draws a marker, tick, or arc at either mark — the colour IS the whole signal, and the
 * two `*StartFraction` values exist only so a segment knows where to begin.
 */
export interface OccupancyFill {
  /** Fraction of the track filled by the portion below the SOFT mark. */
  readonly calmFraction: number;
  /** Fraction filled by the portion between the marks. `0` below the soft mark. */
  readonly softFraction: number;
  /** Fraction filled by the portion PAST the hard mark. `0` at or below it. */
  readonly hardFraction: number;
  /** Where the soft segment begins — an offset, never a drawn marker. */
  readonly softStartFraction: number;
  /** Where the hard segment begins — likewise an offset, never a drawn marker. */
  readonly hardStartFraction: number;
}

/**
 * Split one reading into its three coloured portions.
 *
 * The splits are at EXACTLY the marks: a reading of exactly 400,000 has no soft portion, and one of
 * exactly 500,000 has no hard portion — only the excess ABOVE a mark is ever coloured for it. A
 * reading above the ceiling is clamped to it, which cannot happen when the scale came from
 * {@link OccupancySeries.scaleTokens} over the same readings, and is defended anyway because a caller
 * passing a stale scale must not draw a bar wider than its track.
 */
export function occupancyFill(residentTokens: number, scaleTokens: number): OccupancyFill {
  const scale = scaleTokens > 0 ? scaleTokens : BASE_SCALE_TOKENS;
  const clamped = Math.max(0, Math.min(residentTokens, scale));
  const calm = Math.min(clamped, SOFT_MARK_TOKENS);
  const soft = Math.max(0, Math.min(clamped, HARD_MARK_TOKENS) - SOFT_MARK_TOKENS);
  const hard = Math.max(0, clamped - HARD_MARK_TOKENS);
  return {
    calmFraction: calm / scale,
    softFraction: soft / scale,
    hardFraction: hard / scale,
    softStartFraction: Math.min(1, SOFT_MARK_TOKENS / scale),
    hardStartFraction: Math.min(1, HARD_MARK_TOKENS / scale),
  };
}

/** "240.9k", "1.2M" — the readout beside the bar. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

/**
 * The ceiling for a series, always STRICTLY above its peak.
 *
 * Rounding UP to the next step is not enough on its own: a peak that lands exactly on a step boundary
 * would take that boundary as its ceiling and fill the whole track, so a bar at its own maximum would
 * be indistinguishable from one that overflowed. Stepping past it costs one grid line and keeps
 * "the fullest reading in this series" visibly short of the top.
 */
function scaleFor(maxResidentTokens: number): number {
  if (maxResidentTokens < BASE_SCALE_TOKENS) return BASE_SCALE_TOKENS;
  return Math.floor(maxResidentTokens / SCALE_STEP_TOKENS) * SCALE_STEP_TOKENS + SCALE_STEP_TOKENS;
}

function parseAt(at: string | undefined): number | null {
  if (at === undefined) return null;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? null : parsed;
}
