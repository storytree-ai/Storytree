// Red-green on the ONE playhead occupancy bar (`traversal-panel-arc`, increment
// `traversal-panel-spine-render`; REPOINTED at the host transcripts by ADR-0456 D2).
//
// The rules asserted here each fail silently and PLAUSIBLY if they are wrong — a wrong bar is still
// a bar, which is exactly why they are asserted rather than looked at:
//
//   1. the plotted quantity is `residentInputTokens` and never the monotonic billing total, so a
//      RECEDING series must render a FALLING bar (the signed reference trace recedes twice; ADR-0248);
//   2. occupancy is HELD at the last observation at-or-before the playhead, never interpolated;
//   3. the fill splits at EXACTLY each of ADR-0411 D3's two marks, and only the excess above a mark
//      is ever coloured for it (ADR-0456 D4 — three portions, nothing drawn AT either boundary);
//   4. a helper's window is never summed into the parent's figure (ADR-0413 D2, permanent);
//   5. the two sources build ONE shape, and the transcript's readings are not re-parsed here.
//
// Plus the absence rule: a window with no readings has none, and that is `observationCount: 0` — the
// surface says so rather than drawing a flat zero.

import { describe, it, expect } from 'vitest';
import type { ContextWindowSeriesPayload, TraversalEventEnvelope } from '../types';
import {
  buildOccupancySeries,
  buildTranscriptOccupancySeries,
  formatTokens,
  HARD_MARK_TOKENS,
  occupancyAt,
  occupancyFill,
  preferredOccupancy,
  SOFT_MARK_TOKENS,
} from './traversalOccupancy';

const SESSION = 'kind-hamilton-e938be';
const T0 = Date.parse('2026-08-11T08:00:00.000Z');
const MIN = 60_000;

function modelContext(
  over: {
    atMs: number;
    resident?: number;
    cumulative?: number;
    added?: number;
    sessionId?: string;
    windowId?: string;
  },
): TraversalEventEnvelope {
  const base = {
    kind: 'model_context' as const,
    eventId: `occupancy:${over.atMs}`,
    sessionId: over.sessionId ?? SESSION,
    at: new Date(over.atMs).toISOString(),
    cumulativeInputTokens: over.cumulative ?? 5_000_000,
    addedInputTokens: over.added ?? 5_000_000,
  };
  const event = over.windowId === undefined ? base : { ...base, windowId: over.windowId };
  return over.resident === undefined ? event : { ...event, residentInputTokens: over.resident };
}

function seriesPayload(
  over: Partial<ContextWindowSeriesPayload> = {},
): ContextWindowSeriesPayload {
  return {
    windowId: SESSION,
    scan: { root: '/transcripts', windowFilesFound: 3, file: `/transcripts/${SESSION}.jsonl` },
    observations: [],
    peakTokens: 0,
    syntheticObservations: 0,
    sidechainRequests: 0,
    absence: null,
    note: '',
    ...over,
  };
}

describe('the quantity is the resident figure, and it can fall', () => {
  it('renders a FALLING bar for the reference trace’s receding series', () => {
    // The two recessions the signed design cites as its evidence, in tokens.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 240_900 }),
        modelContext({ atMs: T0 + MIN, resident: 228_100 }),
        modelContext({ atMs: T0 + 2 * MIN, resident: 239_800 }),
        modelContext({ atMs: T0 + 3 * MIN, resident: 229_600 }),
      ],
      SESSION,
    );

    const fills = series.observations.map(
      (observation) => occupancyFill(observation.residentTokens, series.scaleTokens).calmFraction,
    );
    expect(fills[1]).toBeLessThan(fills[0] as number);
    expect(fills[3]).toBeLessThan(fills[2] as number);
  });

  it('ignores the monotonic billing total and the dead `addedInputTokens` duplicate', () => {
    // Both billing fields are enormous and both are RISING; the resident figure is absent. Reading
    // either one would draw a bar; the honest answer is that nothing was observed.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, cumulative: 1_200_000, added: 1_200_000 }),
        modelContext({ atMs: T0 + MIN, cumulative: 2_400_000, added: 2_400_000 }),
      ],
      SESSION,
    );

    expect(series.modelContextCount).toBe(2);
    expect(series.observationCount).toBe(0);
    expect(series.observations).toEqual([]);
    expect(series.maxResidentTokens).toBe(0);
  });

  it('reports a session with no readings as unobserved rather than as an empty window', () => {
    const series = buildOccupancySeries([], SESSION);
    expect(series.observationCount).toBe(0);
    expect(occupancyAt(series, T0)).toBeNull();
  });
});

describe('occupancy is held at the playhead, never interpolated', () => {
  // ⚠ BUILT INSIDE EACH TEST, never at describe scope. A describe body runs at COLLECTION time, so a
  // series built there is executed by no test — and `check:mutation-diff`'s per-test coverage then
  // attributes the builder's lines to nothing, marks every mutant in them `static`, and reports them
  // as SURVIVED even though the suite kills all of them. Four phantom survivors were traced to
  // exactly this on 2026-08-30 and hand-checked away; a factory costs nothing and keeps the rung
  // able to see which test kills what.
  const heldSeries = (): ReturnType<typeof buildOccupancySeries> =>
    buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000 }),
        modelContext({ atMs: T0 + 100 * MIN, resident: 200_000 }),
      ],
      SESSION,
    );

  it('holds the last observation through the gap', () => {
    const series = heldSeries();
    // Halfway between the two: an interpolating bar would read 150k. The window's occupancy between
    // requests is simply the last thing observed.
    expect(occupancyAt(series, T0 + 50 * MIN)?.residentTokens).toBe(100_000);
    expect(occupancyAt(series, T0 + 99 * MIN)?.residentTokens).toBe(100_000);
    expect(occupancyAt(series, T0 + 100 * MIN)?.residentTokens).toBe(200_000);
  });

  it('answers null BEFORE the first observation — unobserved is not zero', () => {
    expect(occupancyAt(heldSeries(), T0 - MIN)).toBeNull();
  });

  it('holds the final observation past the end of the series', () => {
    expect(occupancyAt(heldSeries(), T0 + 10_000 * MIN)?.residentTokens).toBe(200_000);
  });
});

describe('the fill splits at each of the two marks, and only the excess above one is coloured', () => {
  const SCALE = 1_000_000;

  it('has NO soft portion at exactly the soft mark, and no hard portion at exactly the hard one', () => {
    const atSoft = occupancyFill(SOFT_MARK_TOKENS, SCALE);
    expect(atSoft.softFraction).toBe(0);
    expect(atSoft.hardFraction).toBe(0);
    expect(atSoft.calmFraction).toBe(0.4);

    const atHard = occupancyFill(HARD_MARK_TOKENS, SCALE);
    expect(atHard.hardFraction).toBe(0);
    expect(atHard.calmFraction).toBe(0.4);
    expect(atHard.softFraction).toBeCloseTo(0.1, 10);
  });

  it('colours the middle band between the marks and nothing above it', () => {
    const fill = occupancyFill(450_000, SCALE);
    expect(fill.calmFraction).toBe(0.4);
    expect(fill.softFraction).toBeCloseTo(0.05, 10);
    expect(fill.hardFraction).toBe(0);
    expect(fill.softStartFraction).toBe(0.4);
  });

  it('reddens only the portion past the hard mark', () => {
    const fill = occupancyFill(600_000, SCALE);
    expect(fill.calmFraction).toBe(0.4);
    expect(fill.softFraction).toBeCloseTo(0.1, 10);
    expect(fill.hardFraction).toBeCloseTo(0.1, 10);
    expect(fill.hardStartFraction).toBe(0.5);
  });

  it('leaves a reading under the soft mark entirely calm', () => {
    const fill = occupancyFill(240_900, SCALE);
    expect(fill.softFraction).toBe(0);
    expect(fill.hardFraction).toBe(0);
    expect(fill.calmFraction).toBeCloseTo(0.2409, 10);
  });

  it('the three portions sum to the reading — no band double-counts another', () => {
    const fill = occupancyFill(575_000, SCALE);
    expect(fill.calmFraction + fill.softFraction + fill.hardFraction).toBeCloseTo(0.575, 10);
  });

  it('keeps a typical window legible against the base ceiling rather than scaled for nothing', () => {
    // The measured peaks this bar now plots run 149k–616k (30 newest traces, 2026-08-26). A ceiling
    // chosen for a figure real work never reaches would draw every one of them as a sliver.
    const series = buildOccupancySeries([modelContext({ atMs: T0, resident: 250_000 })], SESSION);
    const fill = occupancyFill(250_000, series.scaleTokens);
    expect(fill.calmFraction).toBeGreaterThan(0.4);
  });

  it('grows the track ceiling STRICTLY past a series that runs above the base scale', () => {
    const series = buildOccupancySeries([modelContext({ atMs: T0, resident: 1_300_000 })], SESSION);
    expect(series.scaleTokens).toBeGreaterThan(1_300_000);

    const fill = occupancyFill(1_300_000, series.scaleTokens);
    const filled = fill.calmFraction + fill.softFraction + fill.hardFraction;
    // The whole reading is represented — nothing is clipped off the end of the track…
    expect(filled).toBeCloseTo(1_300_000 / series.scaleTokens, 10);
    // …and the ceiling keeps headroom above the peak, so a bar at its maximum is not a full bar.
    // A peak landing exactly on a step boundary is the case that would otherwise fill the track.
    expect(filled).toBeLessThan(1);
  });
});

describe('one series is ONE context window — a series that would span two is refused, not spliced', () => {
  // The 98-window shape at legible scale (`traversal-panel-one-trace-one-session`).
  //
  // ⚠ A SINGLE-WINDOW FIXTURE PASSES THE BUG THIS SUITE EXISTS FOR, which is why every case here is
  // built from `THREE_WINDOWS`: three conversations that ran under one worktree-slot session id,
  // each RISING monotonically, each starting below where the previous one ended. That is the real
  // shape — measured over `recursing-neumann-3a74d7`'s 1,077 readings, all 44 falls sit exactly on a
  // window boundary and ZERO occur inside a window.
  const WIN_A = 'e43dc90f-c2b9-4e7a-87a4-9db9ec05c954';
  const WIN_B = '842415b0-f164-4f2a-8113-6049b90f330a';
  const WIN_C = '1fcc3fd5-37da-4a54-8674-cf6e9beca6d2';

  const THREE_WINDOWS: readonly { atMs: number; resident: number; windowId: string }[] = [
    { atMs: T0 + 0 * MIN, resident: 82_800, windowId: WIN_A },
    { atMs: T0 + 1 * MIN, resident: 210_000, windowId: WIN_A },
    { atMs: T0 + 2 * MIN, resident: 430_616, windowId: WIN_A },
    { atMs: T0 + 3 * MIN, resident: 60_700, windowId: WIN_B },
    { atMs: T0 + 4 * MIN, resident: 141_700, windowId: WIN_B },
    { atMs: T0 + 5 * MIN, resident: 73_500, windowId: WIN_C },
    { atMs: T0 + 6 * MIN, resident: 309_262, windowId: WIN_C },
  ];

  const threeWindowEvents = THREE_WINDOWS.map((reading) => modelContext(reading));
  /** Which window each instant belongs to — how a rendered reading is traced back to its source. */
  const windowAt = new Map(THREE_WINDOWS.map((reading) => [reading.atMs, reading.windowId]));

  /** Consecutive decreases in a rendered series — the falls an operator actually sees. */
  function fallsIn(series: { observations: readonly { residentTokens: number }[] }): number {
    let falls = 0;
    for (let i = 1; i < series.observations.length; i += 1) {
      const previous = series.observations[i - 1] as { residentTokens: number };
      const current = series.observations[i] as { residentTokens: number };
      if (current.residentTokens < previous.residentTokens) falls += 1;
    }
    return falls;
  }

  it('the fixture really is the bug’s shape — spliced it falls, and only at the boundaries', () => {
    // A control, so nothing below can pass vacuously: this asserts the RED existed. Laid end to end
    // the seven readings fall twice, and each fall is a change of conversation rather than anything
    // the window did.
    let falls = 0;
    let fallsInsideOneWindow = 0;
    for (let i = 1; i < THREE_WINDOWS.length; i += 1) {
      const previous = THREE_WINDOWS[i - 1] as { resident: number; windowId: string };
      const current = THREE_WINDOWS[i] as { resident: number; windowId: string };
      if (current.resident >= previous.resident) continue;
      falls += 1;
      if (current.windowId === previous.windowId) fallsInsideOneWindow += 1;
    }
    expect(falls).toBe(2);
    expect(fallsInsideOneWindow).toBe(0);
  });

  it('NO RENDERED SERIES MIXES TWO WINDOW IDS', () => {
    // The invariant stated directly on what is drawn, rather than on a count that stands in for it:
    // trace every rendered reading back to the window it came from and there must be at most one.
    const series = buildOccupancySeries(threeWindowEvents, SESSION);
    const rendered = new Set(
      series.observations.map((observation) => windowAt.get(observation.atMs)),
    );
    expect(rendered.size).toBeLessThanOrEqual(1);
  });

  it('draws nothing, and says how many windows it found rather than going blank', () => {
    const series = buildOccupancySeries(threeWindowEvents, SESSION);
    expect(series.observationCount).toBe(0);
    expect(series.spannedWindowCount).toBe(3);
    // "none observed" must not read as "this session was never observed" — it was, seven times.
    expect(series.note).toContain('3 context windows');
    expect(series.note).toContain('7 reading(s)');
    // The denominator survives the refusal: the readings were seen, they are just not plottable as
    // one line.
    expect(series.modelContextCount).toBe(7);
  });

  it('a fall the panel draws is a fall the window really had', () => {
    // The owner's requirement, asserted on the rendered series: "the context window should never go
    // down unless i did a compaction".
    const series = buildOccupancySeries(threeWindowEvents, SESSION);
    expect(fallsIn(series)).toBe(0);
  });

  it('the refusal’s reason reaches the reader when the transcript could not be read at all', () => {
    // `null` is "not read yet or unreadable", the branch where the trace series is what renders. Its
    // absence must carry the reason rather than a silent blank.
    const refused = buildOccupancySeries(threeWindowEvents, SESSION);
    const preferred = preferredOccupancy(refused, null);
    expect(preferred.observationCount).toBe(0);
    expect(preferred.note).toContain('3 context windows');
  });

  it('still draws a trace whose readings all name ONE window — no regression', () => {
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000, windowId: WIN_A }),
        modelContext({ atMs: T0 + MIN, resident: 240_900, windowId: WIN_A }),
        modelContext({ atMs: T0 + 2 * MIN, resident: 228_100, windowId: WIN_A }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(3);
    expect(series.spannedWindowCount).toBe(1);
    expect(series.note).toBe('');
    // Rule 1 is untouched by rule 5: a real recession inside one window is still drawn as a fall.
    expect(fallsIn(series)).toBe(1);
  });

  it('still draws a trace whose readings carry NO window id — absence of evidence is not a splice', () => {
    // `windowId` is optional on the wire. Counting an unstamped reading as its own window would
    // refuse every trace written before the stamp existed.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000 }),
        modelContext({ atMs: T0 + MIN, resident: 200_000 }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(2);
    expect(series.spannedWindowCount).toBe(0);
  });

  it('counts only STAMPED ids, so one window plus unstamped readings still draws', () => {
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000, windowId: WIN_A }),
        modelContext({ atMs: T0 + MIN, resident: 200_000 }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(2);
    expect(series.spannedWindowCount).toBe(1);
  });

  it('a second window that would draw NOTHING does not refuse the series', () => {
    // The refusal is about what the LINE would be built from, never about what the trace contains.
    // Window B's requests carry no resident figure, so they were never going to be plotted.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000, windowId: WIN_A }),
        modelContext({ atMs: T0 + MIN, windowId: WIN_B }),
        modelContext({ atMs: T0 + 2 * MIN, resident: 150_000, windowId: WIN_A }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(2);
    expect(series.spannedWindowCount).toBe(1);
    expect(series.modelContextCount).toBe(3);
  });

  it('the transcript source answers the same invariant — one window with readings, none without', () => {
    // It satisfies rule 5 by construction (one window's transcript, found by its own id), but it
    // states the field so a reader can assert the invariant without knowing which source it got.
    const drawn = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [{ at: new Date(T0).toISOString(), residentTokens: 240_900 }],
      }),
    );
    expect(drawn.spannedWindowCount).toBe(1);

    const empty = buildTranscriptOccupancySeries(
      seriesPayload({ absence: 'no-window-transcript', note: 'nothing named for this window' }),
    );
    expect(empty.spannedWindowCount).toBe(0);
  });
});

describe('child windows are never summed into the parent figure', () => {
  it('excludes an observation belonging to another session’s window, and counts the exclusion', () => {
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000 }),
        modelContext({ atMs: T0 + MIN, resident: 90_000, sessionId: 'some-child-agent' }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(1);
    expect(series.foreignWindowCount).toBe(1);
    // 190_000 would be the merged figure the design's anti-goals forbid.
    expect(occupancyAt(series, T0 + 2 * MIN)?.residentTokens).toBe(100_000);
  });

  it('carries the transcript source’s own helper exclusion through as the same fact', () => {
    // The server excluded them (`sidechainRequests`); this must arrive as a counted exclusion rather
    // than as an absence of helpers — and it must never be added to anything.
    const series = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [{ at: new Date(T0).toISOString(), residentTokens: 100_000 }],
        sidechainRequests: 4,
      }),
    );

    expect(series.foreignWindowCount).toBe(4);
    expect(series.maxResidentTokens).toBe(100_000);
  });
});

describe('the transcript source builds the same shape, and re-parses nothing', () => {
  it('plots the readings in time order with their own instants', () => {
    const series = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [
          { at: new Date(T0 + 2 * MIN).toISOString(), residentTokens: 431_000 },
          { at: new Date(T0).toISOString(), residentTokens: 240_900 },
          { at: new Date(T0 + MIN).toISOString(), residentTokens: 228_100 },
        ],
        peakTokens: 431_000,
        note: '3 reading(s) from this window’s own host transcript',
      }),
    );

    expect(series.source).toBe('transcript');
    expect(series.observations.map((o) => o.residentTokens)).toEqual([240_900, 228_100, 431_000]);
    expect(occupancyAt(series, T0 + 90_000)?.residentTokens).toBe(228_100);
    expect(series.note).toContain('host transcript');
  });

  it('counts an excluded synthetic reading in the denominator, never in the series', () => {
    // A `<synthetic>` zero-token line ENDS 2 of 125 windows on this machine, at 437k and 429k. The
    // server drops it from the readings; dropping it from the denominator too would report a window
    // that made 2 requests as having made 1, which quietly overstates how complete the series is.
    const series = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [{ at: new Date(T0).toISOString(), residentTokens: 429_276 }],
        syntheticObservations: 1,
      }),
    );

    expect(series.observationCount).toBe(1);
    expect(series.modelContextCount).toBe(2);
    expect(series.maxResidentTokens).toBe(429_276);
  });

  it('reports a stated absence as unobserved, never as a zero-token window', () => {
    const series = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [],
        absence: 'no-window-transcript',
        note: 'no host transcript named "sweet-lovelace-f6a3fa" — a trace keyed by a worktree slot names no single window',
      }),
    );

    expect(series.observationCount).toBe(0);
    expect(occupancyAt(series, T0)).toBeNull();
    expect(series.note).toContain('worktree slot');
  });

  it('drops a reading the playhead cannot place, and keeps it in the denominator', () => {
    const series = buildTranscriptOccupancySeries(
      seriesPayload({
        observations: [
          { at: 'not-a-timestamp', residentTokens: 900_000 },
          { at: new Date(T0).toISOString(), residentTokens: 120_000 },
        ],
      }),
    );

    expect(series.observationCount).toBe(1);
    expect(series.modelContextCount).toBe(2);
    // The unplaceable reading must not set the ceiling either — nothing plots it.
    expect(series.maxResidentTokens).toBe(120_000);
  });
});

describe('one bar, two sources, a stated preference', () => {
  // Factories, not describe-scope values — see the note on `heldSeries` above: a series built in a
  // describe body is executed at collection time and covered by no test, which turns every mutant in
  // the builder into a phantom `static` survivor for `check:mutation-diff`.
  const withReadings = (tokens: number): ReturnType<typeof buildTranscriptOccupancySeries> =>
    buildTranscriptOccupancySeries(
      seriesPayload({ observations: [{ at: new Date(T0).toISOString(), residentTokens: tokens }] }),
    );
  const empty = (): ReturnType<typeof buildTranscriptOccupancySeries> =>
    buildTranscriptOccupancySeries(
      seriesPayload({ absence: 'no-window-transcript', note: 'a worktree slot names no single window' }),
    );
  const tracePlot = (): ReturnType<typeof buildOccupancySeries> =>
    buildOccupancySeries([modelContext({ atMs: T0, resident: 240_900 })], SESSION);
  const traceEmpty = (): ReturnType<typeof buildOccupancySeries> =>
    buildOccupancySeries([modelContext({ atMs: T0 })], SESSION);

  it('draws the AMBIENT transcript when it has readings, even over an ingested trace', () => {
    expect(preferredOccupancy(tracePlot(), withReadings(431_000)).source).toBe('transcript');
  });

  it('keeps the trace when the transcript came back empty — the 2-in-697 case must not regress', () => {
    expect(preferredOccupancy(tracePlot(), empty()).source).toBe('trace');
    expect(preferredOccupancy(tracePlot(), empty()).maxResidentTokens).toBe(240_900);
  });

  it('prefers the transcript when NEITHER has readings, because only it says WHY', () => {
    // The commonest state on this machine by far, and the one a naive "trace unless transcript has
    // data" rule gets wrong: it would trade a stated absence for a silent one.
    const chosen = preferredOccupancy(traceEmpty(), empty());
    expect(chosen.observationCount).toBe(0);
    expect(chosen.note).toContain('worktree slot');
  });

  it('treats an UNREAD transcript as unread — never as an observation of absence', () => {
    expect(preferredOccupancy(tracePlot(), null).source).toBe('trace');
    expect(preferredOccupancy(traceEmpty(), null).source).toBe('trace');
  });
});

describe('the readout', () => {
  it('formats thousands and millions', () => {
    expect(formatTokens(240_900)).toBe('240.9k');
    expect(formatTokens(1_300_000)).toBe('1.30M');
  });

  it('reads the marks from the one shared copy, never a second declaration', () => {
    // ADR-0411 D8 says the marks may be TUNED. Two copies of a tunable constant is how one surface
    // comes to say "soft" while the other says "calm" about the same window.
    expect(SOFT_MARK_TOKENS).toBe(400_000);
    expect(HARD_MARK_TOKENS).toBe(500_000);
  });
});
