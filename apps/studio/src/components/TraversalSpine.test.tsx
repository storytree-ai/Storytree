// @vitest-environment jsdom
//
// Red-green on the traversal picture's BEHAVIOUR (`traversal-panel-arc`, increment
// `traversal-panel-spine-render`) — what it draws from a given trace, and what it refuses to draw.
//
// Nothing here asserts appearance. The owner's LOOK against the canonical mock is the separate parked
// increment `traversal-panel-attestation`, and self-signing it here is the one thing the proof route
// forbids. What these pin instead are the claims a screenshot cannot check:
//
//   • the marks appear as the playhead reaches them, and not before;
//   • a full payload read and a front-matter read draw DIFFERENT edges, discriminated by event kind;
//   • a search is its own mark;
//   • the occupancy bar colours each portion past its own mark (ADR-0411 D3's 400k and 500k), holds
//     its reading, prefers the window's own HOST TRANSCRIPT over the replayed trace (ADR-0456 D2),
//     and SAYS SO when there is no series rather than drawing a flat zero;
//   • the events this increment defers are named on the surface rather than silently omitted.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type {
  GuidanceAsset,
  TraversalDecisionPointReport,
  TraversalEventEnvelope,
  TraversalProvenanceDeclaration,
  TraversalProvenanceSurface,
  TraversalReplayPayload,
} from '../types';
import { buildKnowledgeDepth } from '../lib/knowledgeDepth';
import { buildTranscriptOccupancySeries } from '../lib/traversalOccupancy';
import { buildTraversalSpine } from '../lib/traversalSpine';
import {
  TraversalSpine,
  TRAVERSAL_SPINE_GEOMETRY,
  computeTraversalGeometry,
} from './TraversalSpine';

afterEach(cleanup);

const SESSION = 'kind-hamilton-e938be';
const T0 = Date.parse('2026-08-11T08:00:00.000Z');
const MIN = 60_000;

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function visit(
  kind: 'full_payload_read' | 'front_matter_read',
  offsetMs: number,
  nodeId: string,
  visitId: string = `visit:${nodeId}:${offsetMs}`,
  parentVisitId?: string,
): TraversalEventEnvelope {
  const event = {
    kind,
    eventId: `event:${nodeId}:${offsetMs}`,
    sessionId: SESSION,
    at: at(offsetMs),
    visitId,
    nodeId,
  };
  return parentVisitId === undefined ? event : { ...event, parentVisitId };
}

function search(offsetMs: number): TraversalEventEnvelope {
  return {
    kind: 'search',
    eventId: `event:search:${offsetMs}`,
    sessionId: SESSION,
    at: at(offsetMs),
    searchId: `search:${offsetMs}`,
    surfaceId: 'library-artifact',
    operation: 'library_artifact_list',
    resultNodeIds: [],
  };
}

function occupancyEvent(offsetMs: number, resident?: number): TraversalEventEnvelope {
  const event = {
    kind: 'model_context' as const,
    eventId: `occupancy:${offsetMs}`,
    sessionId: SESSION,
    at: at(offsetMs),
    cumulativeInputTokens: 4_000_000,
    addedInputTokens: 4_000_000,
  };
  return resident === undefined ? event : { ...event, residentInputTokens: resident };
}

function handoff(
  edgeId: string,
  offsetMs: number,
  over: Partial<{ agentType: string; model: string; runtime: 'sdk-leaf' | 'codex-leaf' | 'owned-loop' }> = {},
): TraversalEventEnvelope {
  return {
    kind: 'spawn_handoff',
    eventId: `event:spawn:${edgeId}`,
    sessionId: SESSION,
    at: at(offsetMs),
    edgeId,
    parentSessionId: SESSION,
    childSessionId: `child-${edgeId}`,
    agentType: 'Explore',
    ...over,
  };
}

function result(edgeId: string, offsetMs: number, ok = true): TraversalEventEnvelope {
  return {
    kind: 'result_return',
    eventId: `event:return:${edgeId}`,
    sessionId: SESSION,
    at: at(offsetMs),
    edgeId,
    parentSessionId: SESSION,
    childSessionId: `child-${edgeId}`,
    ok,
  };
}

/**
 * The provenance declaration the server folds (ADR-0484 D5). EMPTY by default rather than derived
 * from the events: a fixture that classified surfaces itself would be a second copy of the server's
 * table, which is exactly the drift the payload-carried classification exists to prevent.
 */
function provenance(
  surfaces: TraversalProvenanceSurface[] = [],
  ingestRan = false,
): TraversalProvenanceDeclaration {
  const own = surfaces.filter((s) => s.provenance === 'storytree-own').reduce((n, s) => n + s.count, 0);
  const harness = surfaces.filter((s) => s.provenance === 'harness-derived').reduce((n, s) => n + s.count, 0);
  const unclassified = surfaces.filter((s) => s.provenance === 'unclassified').reduce((n, s) => n + s.count, 0);
  return {
    census: { total: own + harness + unclassified, own, harness, unclassified, withoutSurface: 0, surfaces },
    precedence: 'the storytree log is authoritative',
    ingestRan,
    ingestNote: ingestRan ? 'harness ingest: ran' : 'harness ingest: NEVER RUN',
  };
}

function replay(
  events: TraversalEventEnvelope[],
  decisionPoints: TraversalDecisionPointReport = { points: [], orphanFollows: [] },
  provenanceDeclaration: TraversalProvenanceDeclaration = provenance(),
): TraversalReplayPayload {
  return {
    sessionId: SESSION,
    events,
    relationships: [],
    coverage: [],
    coverageCaveats: [],
    skipped: 0,
    partial: false,
    occupancy: {
      seriesProvenance: 'harness-derived',
      modelContextCount: 0,
      observationCount: 0,
      declared: false,
      note: 'note',
    },
    decisionPoints,
    provenance: provenanceDeclaration,
  };
}

/**
 * Every x a coordinate could paint at, harvested from the rendered SVG.
 *
 * This is the 340px guard in the only form a test can honestly make it: the SVG scales to its block
 * through `viewBox="0 0 360 H"` with `width: 100%`, so a coordinate inside the box is inside the block
 * at EVERY width and one outside it is clipped at every width. Holding every drawn x to [0, 360] is
 * therefore exactly the claim "nothing paints past the block's right edge", at 340px and at 1400px.
 */
function drawnXs(): number[] {
  const svg = screen.getByTestId('traversal-spine-map');
  const xs: number[] = [];
  const push = (value: string | null, pad = 0): void => {
    if (value === null) return;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) xs.push(parsed + pad, parsed - pad);
  };
  for (const node of svg.querySelectorAll('*')) {
    const element = node as SVGElement;
    push(element.getAttribute('x1'));
    push(element.getAttribute('x2'));
    push(element.getAttribute('cx'), Number.parseFloat(element.getAttribute('r') ?? '0') || 0);
    const x = element.getAttribute('x');
    const width = Number.parseFloat(element.getAttribute('width') ?? '0') || 0;
    push(x);
    if (x !== null) push(String(Number.parseFloat(x) + width));
    // Path data: every numeric pair in a `d` is (x, y), so the even-indexed values are x's.
    const d = element.getAttribute('d');
    if (d !== null) {
      const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
      numbers.forEach((value, index) => {
        if (index % 2 === 0) xs.push(Number.parseFloat(value));
      });
    }
  }
  return xs;
}

/**
 * The same sweep down the OTHER axis. It exists because the rotation (ADR-0354 D3) made the vertical
 * the scarce dimension, where before nothing could overflow downward at all. What shares it has
 * changed twice since — the lane rows went (ADR-0393 D2) and the upward offer band went with the
 * rays (ADR-0482 D4) — but the depth rows kept the room and now reach 16 (ADR-0482 D1).
 */
function drawnYs(): number[] {
  const svg = screen.getByTestId('traversal-spine-map');
  const ys: number[] = [];
  const push = (value: string | null, pad = 0): void => {
    if (value === null) return;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) ys.push(parsed + pad, parsed - pad);
  };
  for (const node of svg.querySelectorAll('*')) {
    const element = node as SVGElement;
    push(element.getAttribute('y1'));
    push(element.getAttribute('y2'));
    push(element.getAttribute('cy'), Number.parseFloat(element.getAttribute('r') ?? '0') || 0);
    const y = element.getAttribute('y');
    const height = Number.parseFloat(element.getAttribute('height') ?? '0') || 0;
    push(y);
    if (y !== null) push(String(Number.parseFloat(y) + height));
    // Odd-indexed numbers in a `d` are the y's. A `rotate(...)` transform on the fold label carries
    // its own coordinates and is deliberately not swept — it re-frames a point already counted.
    const d = element.getAttribute('d');
    if (d !== null) {
      const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
      numbers.forEach((value, index) => {
        if (index % 2 === 1) ys.push(Number.parseFloat(value));
      });
    }
  }
  return ys;
}

/** Drag the scrubber to a fraction of its range — the transport's only synchronous entry point. */
function scrubTo(fraction: number): void {
  const scrubber = screen.getByTestId('traversal-scrubber') as HTMLInputElement;
  fireEvent.change(scrubber, { target: { value: String(Number(scrubber.max) * fraction) } });
}

describe('the picture draws the signed grammar', () => {
  it('discriminates edges by read strength, and gives search its own mark', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'arc'),
          visit('front_matter_read', 30_000, 'plan'),
          search(60_000),
        ])}
      />,
    );
    scrubTo(1);

    const strengths = screen.getAllByTestId('traversal-mark').map((mark) => mark.getAttribute('data-strength'));
    expect(strengths).toEqual(['full', 'front-matter', 'search']);

    // The magnifying glass is the only non-circular mark: the search mark carries a lens + handle,
    // the read marks carry a plain dot and nothing else.
    const searchMark = screen.getAllByTestId('traversal-mark')[2]!;
    expect(searchMark.querySelector('.traversal-search-lens')).not.toBeNull();
    expect(searchMark.querySelector('.traversal-mark-dot')).toBeNull();
    const readMark = screen.getAllByTestId('traversal-mark')[0]!;
    expect(readMark.querySelector('.traversal-mark-dot')).not.toBeNull();
    // …and no gauge ring or per-visit readout anywhere on it (the 2026-07-27 revision retired both).
    expect(readMark.querySelector('text')).toBeNull();
  });

  it('draws a fold mark carrying the duration it stands for, for every confirmed idle span', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 20_000, 'b'),
          // …then three hours of nothing, then two more reads.
          visit('full_payload_read', 198 * MIN, 'c'),
          visit('full_payload_read', 198 * MIN + 20_000, 'd'),
        ])}
      />,
    );

    const folds = screen.getAllByTestId('traversal-fold');
    expect(folds).toHaveLength(1);
    // The gap is neither removed nor unlabelled — a reader can see how much time it hid.
    expect(folds[0]?.textContent).toBe('3h18');
  });

  it('reveals marks as the playhead reaches them, and not before', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 20_000, 'b'),
          visit('full_payload_read', 40_000, 'c'),
        ])}
      />,
    );

    const visibleCount = (): number =>
      screen.getAllByTestId('traversal-mark').filter((mark) => mark.classList.contains('is-visible')).length;

    scrubTo(0);
    expect(visibleCount()).toBe(1); // only the first, which sits at the very top of the axis
    scrubTo(1);
    expect(visibleCount()).toBe(3);
  });

  it('reads the clock in real elapsed wall clock even though the axis is density-weighted', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 20_000, 'b'),
          visit('full_payload_read', 8 * 60 * MIN, 'c'),
        ])}
      />,
    );

    scrubTo(1);
    // Eight hours of wall clock, however few pixels the fold gave it.
    expect(screen.getByTestId('traversal-clock').textContent).toContain('8:00:00 / 8:00:00');
  });
});

describe('the one playhead occupancy bar', () => {
  it('SAYS there is no series rather than drawing a flat zero', () => {
    render(
      // A trace with model requests, none of which carried a resident figure — the ordinary state of
      // a session that was never `traversal ingest`ed.
      <TraversalSpine
        replay={replay([visit('full_payload_read', 0, 'a'), occupancyEvent(1_000), occupancyEvent(2_000)])}
      />,
    );

    expect(screen.queryByTestId('traversal-occupancy')).toBeNull();
    // The TRACK is what says it now (ADR-0393 D1 deleted the sentence that used to sit below the
    // picture). It keeps its column, goes dashed, and draws NO FILL — a flat zero bar would say the
    // window was empty, which is a claim about the session rather than about the observation.
    const track = document.querySelector('.traversal-occupancy.is-unobserved');
    expect(track).not.toBeNull();
    const absentLabel = track?.querySelector('[role="img"]')?.getAttribute('aria-label');
    expect(absentLabel).toContain('no context occupancy was observed for this session');
    // …and it says WHOSE observation is missing (ADR-0484 D5): the series has one producer, the host
    // harness transcript, so the absence is an absence in a SECONDARY source and not in our own log.
    expect(absentLabel).toContain('HARNESS-DERIVED');
    expect(track?.textContent).toContain('none');
    expect(track?.textContent).toContain('observed');
    // And the deleted paragraph really is deleted, not merely hidden.
    expect(screen.queryByTestId('traversal-occupancy-absent')).toBeNull();
  });

  it('holds the reading at the playhead and colours each portion past its own mark', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 900_000),
          visit('full_payload_read', 20_000, 'b'),
          visit('full_payload_read', 40_000, 'c'),
        ])}
      />,
    );

    scrubTo(1);
    // Scale is the base 1M ceiling — chosen ABOVE the hard mark so at-the-limit and past-it cannot
    // draw alike (ADR-0499 D1 moved it up with the marks). 700k calm + 150k soft + 50k hard, as
    // fractions of 1M.
    expect((screen.getByTestId('traversal-occupancy-calm') as HTMLElement).style.height).toBe(
      `${(700_000 / 1_000_000) * 100}%`,
    );
    const soft = screen.getByTestId('traversal-occupancy-soft') as HTMLElement;
    expect(soft.style.height).toBe(`${(150_000 / 1_000_000) * 100}%`);
    expect(soft.style.bottom).toBe(`${(700_000 / 1_000_000) * 100}%`);
    const hard = screen.getByTestId('traversal-occupancy-hard') as HTMLElement;
    expect(hard.style.height).toBe(`${(50_000 / 1_000_000) * 100}%`);
    expect(hard.style.bottom).toBe(`${(850_000 / 1_000_000) * 100}%`);
    // The word "resident" caps the track above the readout in the vertical composition, so the claim
    // is read off the whole block rather than the numeric line alone.
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('900.0k');
    expect(screen.getByTestId('traversal-occupancy').textContent).toContain('resident');
  });

  it('draws NOTHING at either mark — the colour is the whole signal (ADR-0393 D1 / ADR-0456 D4)', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 550_000),
          visit('full_payload_read', 20_000, 'b'),
        ])}
      />,
    );

    scrubTo(1);
    // Every child of the track is a FILL. A marker, tick, or danger arc at 400k or 500k is the one
    // thing the signed grammar rules out, and it would arrive here as a fourth kind of child.
    const track = document.querySelector('.traversal-occupancy-track') as HTMLElement;
    const kinds = [...track.children].map((child) => child.className);
    expect(kinds).toEqual([
      'traversal-occupancy-fill is-calm',
      'traversal-occupancy-fill is-soft',
      'traversal-occupancy-fill is-hard',
    ]);
  });

  it('has no soft portion at exactly the soft mark, and no hard portion at exactly the hard one', () => {
    const { unmount } = render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 700_000),
          visit('full_payload_read', 20_000, 'b'),
        ])}
      />,
    );

    scrubTo(1);
    expect((screen.getByTestId('traversal-occupancy-soft') as HTMLElement).style.height).toBe('0%');
    expect((screen.getByTestId('traversal-occupancy-hard') as HTMLElement).style.height).toBe('0%');
    unmount();

    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 850_000),
          visit('full_payload_read', 20_000, 'b'),
        ])}
      />,
    );

    scrubTo(1);
    expect((screen.getByTestId('traversal-occupancy-hard') as HTMLElement).style.height).toBe('0%');
    expect((screen.getByTestId('traversal-occupancy-soft') as HTMLElement).style.height).toBe(
      `${(150_000 / 1_000_000) * 100}%`,
    );
  });

  it('prefers the window\u2019s own HOST TRANSCRIPT over the replayed trace (ADR-0456 D2)', () => {
    // The whole repoint, in one assertion. The trace carries nothing — the ordinary state, since
    // occupancy reaches a trace only through an explicit `storytree traversal ingest` (2 of 697 local
    // traces on this machine). Before this, the bar drew its honest "none observed" here. The host
    // transcript is ambient and answers for 25 of the 30 most recent traces.
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000),
          visit('full_payload_read', 20_000, 'b'),
        ])}
        transcriptOccupancy={buildTranscriptOccupancySeries({
          windowId: 'the-session',
          scan: { root: '/transcripts', windowFilesFound: 9, file: '/transcripts/the-session.jsonl' },
          observations: [{ at: at(1_000), residentTokens: 781_000 }],
          peakTokens: 781_000,
          syntheticObservations: 0,
          sidechainRequests: 0,
          absence: null,
          note: '1 reading(s) from this window’s own host transcript',
        })}
      />,
    );

    scrubTo(1);
    expect(document.querySelector('.traversal-occupancy.is-unobserved')).toBeNull();
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('781.0k');
    // Past the soft mark, short of the hard one: the middle band is coloured and the top is not.
    expect(
      Number.parseFloat((screen.getByTestId('traversal-occupancy-soft') as HTMLElement).style.height),
    ).toBeGreaterThan(0);
    expect((screen.getByTestId('traversal-occupancy-hard') as HTMLElement).style.height).toBe('0%');
  });

  it('keeps the TRACE series when the transcript answered an absence — the ingested case must not regress', () => {
    // The 2-in-697 shape: this trace really was ingested and carries the series, while the window's
    // transcript is gone (a project directory removed, say). An empty transcript answer overwriting
    // a real trace series would silently delete the only reading that exists.
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 240_900),
          visit('full_payload_read', 20_000, 'b'),
        ])}
        transcriptOccupancy={buildTranscriptOccupancySeries({
          windowId: 'the-session',
          scan: { root: '/transcripts', windowFilesFound: 9, file: null },
          observations: [],
          peakTokens: 0,
          syntheticObservations: 0,
          sidechainRequests: 0,
          absence: 'no-window-transcript',
          note: 'no host transcript named "the-session"',
        })}
      />,
    );

    scrubTo(1);
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('240.9k');
  });

  it('carries the source\u2019s own absence sentence into the track\u2019s label rather than losing it', () => {
    render(
      <TraversalSpine
        replay={replay([visit('full_payload_read', 0, 'a'), visit('full_payload_read', 20_000, 'b')])}
        transcriptOccupancy={buildTranscriptOccupancySeries({
          windowId: 'sweet-lovelace-f6a3fa',
          scan: { root: '/transcripts', windowFilesFound: 9, file: null },
          observations: [],
          peakTokens: 0,
          syntheticObservations: 0,
          sidechainRequests: 0,
          absence: 'no-window-transcript',
          note: 'a trace keyed by a worktree slot pools every window that ran in it',
        })}
      />,
    );

    // ADR-0393 D1 deleted the prose under the picture; the REASON still has to reach a reader who
    // asks, so it rides the label rather than returning as a paragraph.
    const track = document.querySelector('.traversal-occupancy-track.is-unobserved');
    expect(track?.getAttribute('aria-label')).toContain('worktree slot');
  });

  it('reads "— resident" before the first observation rather than zero', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 20_000, 'b'),
          occupancyEvent(40_000, 300_000),
        ])}
      />,
    );

    scrubTo(0);
    // An em dash, never a zero: "nothing observed YET at this playhead" is not "the window was
    // empty". The word "resident" caps the vertical track above this readout.
    const readout = screen.getByTestId('traversal-occupancy-readout');
    expect(readout.textContent).toContain('—');
    expect(readout.textContent).not.toMatch(/\b0\b/);
    expect(screen.getByTestId('traversal-occupancy').textContent).toContain('resident');
  });

  it('falls when the series recedes — the quantity is resident context, not a billing total', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 240_900),
          visit('full_payload_read', 20_000, 'b'),
          occupancyEvent(21_000, 228_100),
          visit('full_payload_read', 40_000, 'c'),
        ])}
      />,
    );

    // The bar is a VERTICAL track since the rotation, so its fill is a height. The claim is
    // unchanged: the plotted quantity is resident context and it must be free to FALL.
    const safeFill = (): number =>
      Number.parseFloat((screen.getByTestId('traversal-occupancy-calm') as HTMLElement).style.height);

    scrubTo(0.5);
    const first = safeFill();
    scrubTo(1);
    const second = safeFill();
    // The billing total rose across those two events; the plotted bar FELL.
    expect(second).toBeLessThan(first);
  });
});

/**
 * SUBAGENT LANES ARE NOT DRAWN (ADR-0393 D2). The owner removed them at the LOOK — "we just show the
 * orchestrator traversal in the chart, having builder and tester subagents on there isn't valuable,
 * we can think how and if to show these later".
 *
 * These tests assert the REMOVAL rather than leaving it untested, because an untested removal is one
 * a later session restores by accident. They also pin the half that did NOT change: the telemetry.
 * `spawn_handoff` / `result_return` keep their optional model + runtime (PR #1272), the pure lane
 * fold still runs, and the axis still counts a spawn as activity — so "later" stays cheap.
 */
describe("the picture is the ORCHESTRATOR's own walk — no subagent lanes", () => {
  const WITH_LANES: TraversalEventEnvelope[] = [
    visit('full_payload_read', 0, 'a'),
    handoff('e1', 10_000, { agentType: 'Explore', model: 'claude-opus-5', runtime: 'sdk-leaf' }),
    result('e1', 40_000),
    handoff('e2', 12_000, { agentType: 'frontend-builder' }),
    result('e2', 50_000),
    visit('full_payload_read', 60_000, 'b'),
  ];

  it('draws no lane, no handoff or return edge, and no agent-type chip', () => {
    render(<TraversalSpine replay={replay(WITH_LANES)} />);
    scrubTo(1);

    expect(screen.queryAllByTestId('traversal-lane')).toHaveLength(0);
    expect(screen.queryAllByTestId('traversal-lane-handoff')).toHaveLength(0);
    expect(screen.queryAllByTestId('traversal-lane-return')).toHaveLength(0);
    expect(screen.queryAllByTestId('traversal-lane-chip')).toHaveLength(0);
    // The lane row labels go with them — the gutter names the spine and the depth rows only.
    const labels = screen.getByTestId('traversal-row-labels').textContent ?? '';
    expect(labels).not.toContain('Explore');
    expect(labels).not.toContain('frontend-builder');
    expect(labels).not.toContain('lane');
  });

  it('gives the reclaimed vertical to the walk itself', () => {
    // The point of the removal, made mechanical: at a fixed box the marks must not be pushed into a
    // sliver by rows nobody asked for. With no lane rows the spine sits where a one-row picture puts
    // it, exactly as it would for the same trace carrying no spawn events at all.
    const withLanes = computeTraversalGeometry({
      box: { width: 900, height: 240 },
      totalPx: 600,
      hasOffers: false,
      // Rows below the spine. Since ADR-0482 D1 these come from the knowledge axis (one depth row
      // plus its unmeasured row), not from the `parentVisitId` descent that used to feed them.
      rows: 2,
    });
    expect(withLanes.step).toBeGreaterThan(11);
    // The geometry no longer has a lane concept to compute at all.
    expect('laneY' in withLanes).toBe(false);
    expect('laneRows' in withLanes).toBe(false);
  });

  it('KEEPS the telemetry — the fold still runs and still carries the recorded model', () => {
    // "we can think how and if to show these later" is a drawing decision, not a capture retraction.
    // Whoever brings lanes back must find the data waiting rather than a capture to rebuild.
    const model = buildTraversalSpine(replay(WITH_LANES));
    expect(model.lanes.lanes).toHaveLength(2);
    expect(model.lanes.lanes[0]?.model).toBe('claude-opus-5');
    expect(model.lanes.lanes[1]?.model).toBeNull();
    expect(model.lanes.agentTypes).toContain('frontend-builder');
  });

  it('still counts a spawn as ACTIVITY on the axis, which is a claim about the parent', () => {
    // The density weighting reads lane instants, and that survives the removal on its own merits: a
    // parent waiting on a child is busy, so that span is not idle. Dropping it would silently fold
    // real elapsed work into an idle stub.
    const withSpawns = buildTraversalSpine(replay(WITH_LANES));
    const withoutSpawns = buildTraversalSpine(
      replay([visit('full_payload_read', 0, 'a'), visit('full_payload_read', 60_000, 'b')]),
    );
    expect(withSpawns.scale.totalPx).toBeGreaterThan(withoutSpawns.scale.totalPx);
  });

  it('says a trace holding ONLY spawn events has nothing plottable', () => {
    // It used to draw lanes and nothing else. Now there is genuinely nothing to draw, and the empty
    // state must say so rather than render a bare axis.
    render(<TraversalSpine replay={replay([handoff('e1', 0), result('e1', 1_000)])} />);
    expect(screen.queryByTestId('traversal-spine-map')).toBeNull();
    expect(screen.getByTestId('traversal-spine-empty').textContent).toContain('nothing plottable');
  });
});

describe('the session descent is KEPT as telemetry and no longer drawn (ADR-0482 D5)', () => {
  it('still resolves a parentVisitId chain, and no longer moves the picture with it', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'agent', 'visit:agent'),
          visit('full_payload_read', 10_000, 'ref', 'visit:ref', 'visit:agent'),
          visit('full_payload_read', 20_000, 'back', 'visit:back'),
        ])}
      />,
    );
    scrubTo(1);

    // THE FOLD IS UNTOUCHED. `traversalDepth.ts` still resolves the chain and the reading still rides
    // `data-depth`, exactly as ADR-0393 kept the subagent lane fields after it stopped drawing lanes:
    // the recording was never the problem, and a session-descent drawing stays cheap to restore.
    const depths = screen.getAllByTestId('traversal-mark').map((mark) => mark.getAttribute('data-depth'));
    expect(depths).toEqual(['0', '1', '0']);

    // AND THE DRAWING NO LONGER FOLLOWS IT. With no corpus supplied there is no axis, so the picture
    // is one flat row — including across the descent the field above still records. That divergence
    // between `data-depth` and `data-row` IS the decision, made mechanical.
    const rows = screen.getAllByTestId('traversal-mark').map((mark) => mark.getAttribute('data-row'));
    expect(rows).toEqual(['0', '0', '0']);
    const moves = [...screen.getByTestId('traversal-spine-map').querySelectorAll('.traversal-edge')].map(
      (edge) => edge.getAttribute('data-depth-move'),
    );
    expect(moves).toEqual(['level', 'level']);
    // The axis says which case this is rather than drawing an empty scale.
    expect(screen.getByTestId('traversal-depth-axis-note').getAttribute('data-axis-measured')).toBe('false');
    expect(screen.queryByTestId('traversal-depth-note')).toBeNull();
  });

  it('renders a SINGLE COLUMN where no parent link resolves, and says why', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 10_000, 'b'),
          visit('full_payload_read', 20_000, 'c'),
        ])}
      />,
    );
    scrubTo(1);

    // RE-POINTED BY THE ROTATION (ADR-0354 D3/D4): depth is the VERTICAL now, so a trace with no
    // resolvable parent link is one flat ROW — every mark shares a single `cy` while its `cx` walks
    // the time axis. The claim is identical to the one this test made when the axis ran downward;
    // only which coordinate carries it moved.
    const ys = new Set(
      screen.getAllByTestId('traversal-mark').map((mark) => mark.querySelector('circle')?.getAttribute('cy')),
    );
    expect(ys.size).toBe(1);

    const xs = new Set(
      screen.getAllByTestId('traversal-mark').map((mark) => mark.querySelector('circle')?.getAttribute('cx')),
    );
    expect(xs.size).toBe(3);

    // The single row IS the honest picture wherever parent links are absent, and the sentence that
    // used to say so under the graph is deleted (ADR-0393 D1). What must never happen is the tree
    // being INFERRED instead — that is what the one shared `cy` above proves, and it proves it
    // whether or not any prose explains it.
    expect(screen.queryByTestId('traversal-depth-note')).toBeNull();
  });
});

describe('offer fans are rings around the mark that printed them', () => {
  // The RECORDED convention, and the whole reason the rings can find their mark: a `candidate_set`
  // is written under `candidate-set:<visitId>`. Measured 2026-08-30 across all 759 local traces,
  // 2,106 of 2,106 sets carry it and the visit it names is present every time. A fixture using an
  // arbitrary id — as these did — would test a shape no producer emits.
  const PRINTER = 'visit:printer';
  const CANDIDATE_SET = `candidate-set:${PRINTER}`;

  const OFFER_EVENTS: TraversalEventEnvelope[] = [
    visit('full_payload_read', 0, 'a', PRINTER),
    {
      kind: 'candidate_set',
      eventId: 'event:cs',
      sessionId: SESSION,
      // DELIBERATELY LATER THAN THE VISIT. Only 1,363 of the 2,106 measured sets share their exact
      // millisecond with the visit that printed them, so a fixture where the two agree would pass
      // against a nearest-instant anchor — the plausible wrong implementation — and prove nothing.
      at: at(20_000),
      candidateSetId: CANDIDATE_SET,
      surfaceId: 'library-artifact',
      candidateNodeIds: ['arc', 'plan', 'doc:decisions/0183-x.md'],
    },
    visit('full_payload_read', 40_000, 'b'),
  ];

  const OFFER_REPORT: TraversalDecisionPointReport = {
    points: [
      {
        candidateSetId: CANDIDATE_SET,
        surfaceId: 'library-artifact',
        candidates: [
          { nodeId: 'arc', outcome: { status: 'followed', toVisitId: 'v', edgeId: 'e' } },
          { nodeId: 'plan', outcome: { status: 'not-followed' } },
          { nodeId: 'doc:decisions/0183-x.md', outcome: { status: 'unobservable', reason: 'scheme prefix' } },
        ],
        unresolved: [],
      },
    ],
    orphanFollows: [],
  };

  it('draws NO ring for an unobservable branch, and keeps recorded order innermost-first', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    // ADR-0393 D3: the owner removed these at the earlier LOOK. They were branches no read could
    // ever have followed — an ADR file pointer — so what is left is only what the agent could
    // actually have taken. ADR-0482 D4 changed the SHAPE and reopened nothing else.
    const rings = screen.getAllByTestId('traversal-offer-ring');
    expect(rings).toHaveLength(2);
    // Recorded order among the survivors, never sorted (ADR-0318 D3): filtering must not re-order.
    expect(rings.map((ring) => ring.getAttribute('data-status'))).toEqual([
      'followed',
      'not-followed',
    ]);
    expect(document.querySelectorAll('.traversal-offer-ring.status-unobservable')).toHaveLength(0);
    // Rings, and strictly outward: the first offered is the innermost, the analogy's own direction.
    const radii = rings.map((ring) => Number(ring.getAttribute('r')));
    expect(radii[1] as number).toBeGreaterThan(radii[0] as number);
    // And they are RINGS, not a dial: an unfilled circle is what keeps the drawing off clause 5's
    // no-per-node-gauge rule. `fill: none` is on the class, so the tag is the assertable half.
    expect(rings.every((ring) => ring.tagName.toLowerCase() === 'circle')).toBe(true);
  });

  it('centres the rings on the MARK NAMED BY THE RECORDED ID, not on the offer’s own instant', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    // THE PLAUSIBLE WRONG IMPLEMENTATION IS A TIME MATCH, and this is the assertion that kills it:
    // the offer is recorded 20s after the visit that printed it, so a ring centred on the offer's
    // own instant lands between the two marks and rings neither. It must sit exactly on mark 'a'.
    const marks = screen.getAllByTestId('traversal-mark');
    const printer = marks[0] as Element;
    const dot = printer.querySelector('circle') as SVGCircleElement;
    const rings = screen.getAllByTestId('traversal-offer-ring');
    for (const ring of rings) {
      expect(ring.getAttribute('cx')).toBe(dot.getAttribute('cx'));
      expect(ring.getAttribute('cy')).toBe(dot.getAttribute('cy'));
    }
    // Every radius clears the mark, so the mark itself is never covered by its own fan.
    const markRadius = Number(dot.getAttribute('r'));
    for (const ring of rings) expect(Number(ring.getAttribute('r'))).toBeGreaterThan(markRadius);
  });

  it('follows the mark DOWN the depth axis rather than staying on the spine', () => {
    // ADR-0482 D1 moved the marks off one line; this is what makes the anchor load-bearing rather
    // than cosmetic. The printing read sits at corpus depth 1, so its rings must sit there with it.
    const corpus: GuidanceAsset[] = [
      {
        id: 'anchor',
        category: 'principle',
        title: 'anchor',
        description: '',
        body: '',
        cites: ['story:studio'],
        dependsOn: ['asset:a'],
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
      {
        id: 'a',
        category: 'pattern',
        title: 'a',
        description: '',
        body: '',
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    ];
    const knowledge = buildKnowledgeDepth({
      assets: corpus,
      assetsStatus: 'ready',
      assetsError: '',
    });
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} knowledge={knowledge} />);
    scrubTo(1);

    const fan = screen.getByTestId('traversal-offer');
    const printer = screen
      .getAllByTestId('traversal-mark')
      .find((mark) => (mark.querySelector('title')?.textContent ?? '').startsWith('a ·')) as Element;
    expect(fan.getAttribute('data-row')).toBe(printer.getAttribute('data-row'));
    expect(fan.getAttribute('data-row')).not.toBe('0');
  });

  it('KEEPS the raw `M of N` denominator, and still never a percentage', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    // ADR-0312 D6 is NOT repealed by dropping the dashed rays and the note (ADR-0393 D3), nor by
    // redrawing the fan as rings (ADR-0482 D4): the fan still carries the full denominator, on hover
    // and on its data attributes. What narrowed is the denominator's SURFACE. A change that drops
    // THESE too would be the repeal.
    const fan = screen.getByTestId('traversal-offer');
    expect(fan.getAttribute('data-offered')).toBe('3');
    expect(fan.getAttribute('data-observable')).toBe('2');
    expect(fan.getAttribute('data-followed')).toBe('1');
    expect(fan.getAttribute('data-drawn')).toBe('2');
    const title = fan.querySelector('title')?.textContent ?? '';
    expect(title).toContain('offered 3, observable 2 of 3');
    expect(title).not.toMatch(/%/);
    // And the deleted paragraph is deleted, not hidden.
    expect(screen.queryByTestId('traversal-offer-note')).toBeNull();
  });

  it('draws a nearly-empty fork picture honestly rather than making it look fuller', () => {
    // The measured shape on this machine: many offers, nothing followed. That is the signal.
    render(
      <TraversalSpine
        replay={replay(OFFER_EVENTS, {
          points: [
            {
              candidateSetId: CANDIDATE_SET,
              surfaceId: 'library-artifact',
              candidates: [
                { nodeId: 'arc', outcome: { status: 'not-followed' } },
                { nodeId: 'plan', outcome: { status: 'not-followed' } },
                { nodeId: 'doc:decisions/0183-x.md', outcome: { status: 'unobservable', reason: 'x' } },
              ],
              unresolved: [],
            },
          ],
          orphanFollows: [],
        })}
      />,
    );
    scrubTo(1);

    // Two drawn (the unobservable one is not), and nothing followed — the measured shape on this
    // machine, drawn as the sparse signal it is rather than padded to look fuller.
    const rings = screen.getAllByTestId('traversal-offer-ring');
    expect(rings).toHaveLength(2);
    expect(screen.getByTestId('traversal-offer').getAttribute('data-followed')).toBe('0');
    expect(screen.getByTestId('traversal-offer').getAttribute('data-observable')).toBe('2');

    // ⚠ THE ADR-0393 DEFECT, PINNED AS A NUMBER. Nothing is ever followed in practice, so an
    // all-not-followed fan is the ONLY fan anyone sees. Every ring in it must be drawn at the base
    // weight — not thinned, not dashed away — or the picture reads as texture again.
    const widths = rings.map((ring) => Number(ring.getAttribute('stroke-width')));
    expect(new Set(widths).size).toBe(1);
    expect(widths[0] as number).toBeGreaterThan(0);
  });

  it('draws the FOLLOWED ring heavier — the departure is on the rare state, never on the common one', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);
    const rings = screen.getAllByTestId('traversal-offer-ring');
    const followed = rings.find((ring) => ring.getAttribute('data-status') === 'followed') as Element;
    const plain = rings.find((ring) => ring.getAttribute('data-status') === 'not-followed') as Element;
    expect(Number(followed.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(plain.getAttribute('stroke-width')),
    );
  });

  it('DRAWS NOTHING, and says how many, for an offer whose printing visit the trace does not hold', () => {
    // FAIL CLOSED (ADR-0482 D3/D4). Measured at 0 of 2,106 real sets, so this is a guard rather than
    // a fallback — but the wrong answer is cheap and tempting: park it on the spine. The spine is
    // row 0, and row 0 now means "at the graph's surface", so parking it there states a depth
    // nothing measured. It is dropped from the drawing and COUNTED on the layer.
    const orphan: TraversalEventEnvelope[] = [
      visit('full_payload_read', 0, 'a', PRINTER),
      {
        kind: 'candidate_set',
        eventId: 'event:cs',
        sessionId: SESSION,
        at: at(20_000),
        candidateSetId: 'candidate-set:visit:nobody-recorded-this',
        surfaceId: 'library-artifact',
        candidateNodeIds: ['arc', 'plan'],
      },
    ];
    render(
      <TraversalSpine
        replay={replay(orphan, {
          points: [
            {
              candidateSetId: 'candidate-set:visit:nobody-recorded-this',
              surfaceId: 'library-artifact',
              candidates: [
                { nodeId: 'arc', outcome: { status: 'not-followed' } },
                { nodeId: 'plan', outcome: { status: 'not-followed' } },
              ],
              unresolved: [],
            },
          ],
          orphanFollows: [],
        })}
      />,
    );
    scrubTo(1);

    expect(screen.queryAllByTestId('traversal-offer-ring')).toHaveLength(0);
    expect(screen.queryAllByTestId('traversal-offer')).toHaveLength(0);
    expect(screen.getByTestId('traversal-offer-layer').getAttribute('data-unanchored')).toBe('1');
    // The picture is still drawn — a dropped fan is not an empty trace.
    expect(screen.getAllByTestId('traversal-mark').length).toBeGreaterThan(0);
  });
});

describe('the legend and the stylesheet say the same thing', () => {
  // ⚠ THIS IS THE ADR-0393 DEFECT'S OWN TRIPWIRE, and the increment asked for it by name. That
  // defect was a legend reading "solid ray not followed" over a stylesheet drawing that state
  // DASHED. It survived review because nothing is ever followed in practice, so the state that
  // disagreed was the only state anyone ever saw — the picture looked like a texture and nobody
  // could tell it was lying. The pair is pinned here rather than left to a reader's eye.
  const css = readFileSync(resolve(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'src', 'index.css'), 'utf8');

  function ruleBody(selector: string): string | null {
    const at = css.indexOf(`${selector} {`);
    if (at === -1) return null;
    return css.slice(at, css.indexOf('}', at));
  }

  it('draws every state SOLID, so a fan of the near-universal state is not a texture', () => {
    for (const selector of [
      '.traversal-offer-ring',
      '.traversal-offer-ring.status-followed',
      '.traversal-offer-ring.status-not-followed',
      '.traversal-offer-ring.status-ambiguous',
    ]) {
      const body = ruleBody(selector);
      expect(body, `${selector} must exist`).not.toBeNull();
      expect(body as string).not.toContain('dasharray');
    }
  });

  it('leaves the WEIGHT to the geometry, so a dense fan cannot be fused into a disc by CSS', () => {
    // `offerRingGeometry` thins the stroke with the spacing; a `stroke-width` in the stylesheet
    // would win over that and put the filled disc — the per-node gauge — straight back.
    for (const selector of [
      '.traversal-offer-ring',
      '.traversal-offer-ring.status-followed',
      '.traversal-offer-ring.status-not-followed',
      '.traversal-offer-ring.status-ambiguous',
    ]) {
      expect(ruleBody(selector) as string).not.toContain('stroke-width');
    }
    // And rings are rings: a filled ring set IS the gauge clause 5 forbids.
    expect(ruleBody('.traversal-offer-ring') as string).toContain('fill: none');
  });

  it('styles no state the picture no longer draws', () => {
    // ADR-0393 D3 removed unobservable candidates from the drawing. A rule for them would style
    // nothing — and would read to the next editor as evidence they are still drawn.
    expect(ruleBody('.traversal-offer-ring.status-unobservable')).toBeNull();
    // The rays are GONE, not renamed around. A surviving ray rule is the shape this pair fails at.
    expect(css).not.toContain('.traversal-offer-ray');
  });

  it('says RINGS where a reader meets the picture, and no longer says rays', () => {
    render(<TraversalSpine replay={replay([visit('full_payload_read', 0, 'a')])} />);
    const legend = screen.getByTestId('traversal-legend').textContent ?? '';
    expect(legend).toContain('offer rings');
    expect(legend).toContain('one solid ring per branch');
    expect(legend).not.toMatch(/\bray\b/);
  });
});

describe('nothing paints past the block’s right edge', () => {
  it('keeps every drawn coordinate inside the viewBox, lanes and fans and depth included', () => {
    // A deliberately hostile trace: a descent deeper than the drawn cap, six concurrent children, and
    // a wide offer fan — all at once, at the panel's minimized width.
    const events: TraversalEventEnvelope[] = [visit('full_payload_read', 0, 'root', 'visit:0')];
    for (let level = 1; level <= 7; level += 1) {
      events.push(visit('full_payload_read', level * 1_000, `n${level}`, `visit:${level}`, `visit:${level - 1}`));
    }
    for (let lane = 0; lane < 6; lane += 1) {
      events.push(handoff(`e${lane}`, 20_000 + lane * 100));
      events.push(result(`e${lane}`, 90_000));
    }
    // Hung on the DEEPEST visit — `visit:7`, past the drawn cap — so the widest fan in the picture
    // is also the one furthest down the axis, which is where a ring set would overflow the block if
    // it were bounded by anything other than its own row.
    events.push({
      kind: 'candidate_set',
      eventId: 'event:cs',
      sessionId: SESSION,
      at: at(30_000),
      candidateSetId: 'candidate-set:visit:7',
      surfaceId: 'library-artifact',
      candidateNodeIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    render(
      <TraversalSpine
        replay={replay(events, {
          points: [
            {
              candidateSetId: 'candidate-set:visit:7',
              surfaceId: 'library-artifact',
              candidates: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((nodeId) => ({
                nodeId,
                outcome: { status: 'not-followed' as const },
              })),
              unresolved: [],
            },
          ],
          orphanFollows: [],
        })}
      />,
    );
    scrubTo(1);

    // The guard is not passing on an empty picture: a descent past the drawn cap and an eight-way
    // fan really are drawn. The six spawn pairs are still IN the trace and still stretch the axis —
    // they are simply no longer drawn as rows (ADR-0393 D2).
    expect(screen.getAllByTestId('traversal-mark').length).toBeGreaterThan(7);
    expect(screen.getAllByTestId('traversal-offer-ring')).toHaveLength(8);
    expect(screen.queryAllByTestId('traversal-lane')).toHaveLength(0);

    // RE-POINTED, NOT DELETED (the increment's own instruction). The claim is unchanged — a
    // coordinate inside the viewBox is inside the block at every rendered size, and one outside it is
    // clipped at every size — but the box is no longer the constant 360: the rotation made the axis
    // the stretching dimension, so the bound is now the COMPUTED viewBox itself, read off the render.
    // This is still only half of a two-part shape: a jsdom bounds test cannot see CSS overflow in the
    // text blocks, which is what the browser probe over real markup + real `index.css` is for.
    const svg = screen.getByTestId('traversal-spine-map');
    const viewBox = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
    expect(viewBox).toHaveLength(4);
    const [, , boxWidth, boxHeight] = viewBox as [number, number, number, number];
    expect(boxWidth).toBeGreaterThan(0);
    expect(boxHeight).toBeGreaterThan(0);

    const xs = drawnXs();
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(boxWidth);

    // The VERTICAL is the scarce axis, so it is bounded here. It got materially less crowded when
    // the six lane rows went (ADR-0393 D2) and again when the upward offer band went with the rays
    // (ADR-0482 D4), but the bound is asserted rather than assumed either way. `drawnYs` pads every
    // `cy` by its own `r`, so a ring set's full extent is swept — which is what makes this the
    // containment proof for the widest fan as well as for the deepest mark.
    const ys = drawnYs();
    expect(ys.length).toBeGreaterThan(20);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(boxHeight);
  });
});

describe('an empty trace says so rather than drawing an empty axis', () => {
  it('names nothing plottable and disables the transport', () => {
    render(<TraversalSpine replay={replay([occupancyEvent(0)])} />);
    expect(screen.queryByTestId('traversal-spine-map')).toBeNull();
    expect(screen.getByTestId('traversal-spine-empty').textContent).toContain('nothing plottable');
    expect((screen.getByTestId('traversal-play') as HTMLButtonElement).disabled).toBe(true);
  });

  it('no longer prints the unplaced-events note under the picture', () => {
    // ADR-0393 D1. A result_return naming an edge no handoff opened is still COUNTED by the pure
    // fold — `model.lanes.unpairedReturns` — and `storytree traversal show` still reports it. The
    // panel stopped saying it, which is the cost the owner accepted along with the rest of the prose.
    const payload = replay([visit('full_payload_read', 0, 'a'), result('ghost', 10_000)]);
    render(<TraversalSpine replay={payload} />);
    expect(screen.queryByTestId('traversal-spine-deferred')).toBeNull();
    expect(buildTraversalSpine(payload).lanes.unpairedReturns).toBe(1);
  });
});

describe('the transport', () => {
  it('toggles play and pause', () => {
    render(
      <TraversalSpine
        replay={replay([visit('full_payload_read', 0, 'a'), visit('full_payload_read', 20_000, 'b')])}
      />,
    );

    const button = screen.getByTestId('traversal-play');
    expect(button.textContent).toBe('Play');
    fireEvent.click(button);
    expect(button.textContent).toBe('Pause');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(button.textContent).toBe('Play');
  });
});

/**
 * THE SECOND DEPTH (ADR-0363 D2, increment `standson-depth-from-work-join`) — knowledge depth from
 * the work, joined onto the picture at render time.
 *
 * `lib/knowledgeDepth.test.ts` proves the join itself. What is under test here is the wiring, and
 * every case is one where the picture would otherwise make a confident wrong claim: an unread corpus
 * rendering as "nothing was reached", an unreachable artifact rendering as a deep one, and the
 * per-trace figure printing without the corpus-wide anchor line that makes it readable.
 *
 * Nothing here touches the SIGNED GRAMMAR: the reading rides the hover label and a data attribute,
 * never a drawn readout on the mark (ADR-0354 clause 5 keeps marks plain, with no per-node gauge).
 */
describe('knowledge depth from the surface is a SECOND axis, joined read-only at render time', () => {
  const CORPUS: GuidanceAsset[] = [
    {
      id: 'inc-one',
      category: 'principle',
      title: 'inc-one',
      description: '',
      body: '',
      cites: ['story:studio', 'asset:ceremony'],
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    {
      id: 'ceremony',
      category: 'pattern',
      title: 'ceremony',
      description: '',
      body: '',
      dependsOn: ['asset:principle'],
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    {
      id: 'principle',
      category: 'principle',
      title: 'principle',
      description: '',
      body: '',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    {
      id: 'orphan',
      category: 'principle',
      title: 'orphan',
      description: '',
      body: '',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ];

  const READY = buildKnowledgeDepth({ assets: CORPUS, assetsStatus: 'ready', assetsError: '' });

  const WALK = replay([
    visit('full_payload_read', 0, 'ceremony'),
    visit('full_payload_read', 20_000, 'principle'),
    visit('front_matter_read', 40_000, 'orphan'),
    visit('full_payload_read', 60_000, 'forest-world'),
  ]);

  it('draws exactly what it drew before when no corpus is supplied', () => {
    // Absent-by-default: the join is the mount's to supply, and a picture with no corpus to join
    // against says nothing about knowledge depth rather than reporting an empty verdict.
    render(<TraversalSpine replay={WALK} />);
    expect(screen.queryByTestId('traversal-knowledge-chip')).toBeNull();
    expect(
      screen.getAllByTestId('traversal-mark').every((mark) => !mark.hasAttribute('data-knowledge-depth')),
    ).toBe(true);
  });

  it('annotates each placed artifact with its hop count, on the hover label and never as a gauge', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const attrs = screen
      .getAllByTestId('traversal-mark')
      .map((mark) => mark.getAttribute('data-knowledge-depth'));
    expect(attrs).toEqual(['1', '2', 'unlinked', 'absent']);

    const titles = screen.getAllByTestId('traversal-mark').map((mark) => mark.querySelector('title')?.textContent);
    // The knowledge reading leads, and the ADR-0484 D5 recorder clause follows it. These fixture
    // visits record NO surface, so the clause says exactly that rather than naming a tier — the
    // shorter of the two unclassified readings, kept apart from the drift one on purpose.
    expect(titles[0]).toBe(
      'ceremony · full payload · knowledge depth 1 — 1 hop below the surface' +
        ' · recorder unrecorded — this observation carries no surface, so nothing attributes it to one',
    );
    // The grammar clause survives every trim: the mark itself stays plain. Identity and read
    // strength are all it draws.
    expect(screen.getAllByTestId('traversal-mark')[0]?.querySelectorAll('text')).toHaveLength(0);
  });

  it('never renders an UNLINKED artifact as one sitting at the surface', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const orphan = screen.getAllByTestId('traversal-mark')[2];
    expect(orphan?.getAttribute('data-knowledge-depth')).toBe('unlinked');
    // Not a number — and specifically not the 0 that a naive indegree-0 seeding would hand it, which
    // would say "at the surface" about an artifact nothing links to. Absence of measurement, not a
    // measurement of distance (ADR-0476 D5).
    expect(orphan?.querySelector('title')?.textContent).toContain('unmeasured');
    // The reading moved to the counts chip above the picture when the prose went (ADR-0393 D1); the
    // state distinction it protects did NOT move.
    expect(screen.getByTestId('traversal-knowledge-chip').getAttribute('data-unlinked')).toBe('1');
    expect(screen.getByTestId('traversal-knowledge-chip').getAttribute('title')).toContain(
      'unmeasured, NOT at the surface',
    );
  });

  it('counts the trace and carries the corpus-wide linkage figure beside it', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const chip = screen.getByTestId('traversal-knowledge-chip');
    expect(chip.textContent).toContain('knowledge 2/4 placed');
    expect(chip.textContent).toContain('deepest 2');
    // WITHOUT THE LINKAGE FIGURE a reader blames the SESSION for a thin count that is really a fact
    // about how much of the corpus is wired. It is the reason the chip is worth its width.
    expect(chip.textContent).toContain('3/4 linked');
    expect(chip.getAttribute('data-unlinked')).toBe('1');
    expect(chip.getAttribute('data-absent')).toBe('1');
    // The accepted risk stays on the surface, not only in a comment (ADR-0363 D2).
    expect(chip.getAttribute('title')).toContain('never a guarantee');
  });

  it('says an unread corpus was NOT MEASURED rather than reporting nothing placed', () => {
    const loading = buildKnowledgeDepth({ assets: [], assetsStatus: 'loading', assetsError: '' });
    render(<TraversalSpine replay={WALK} knowledge={loading} />);

    const chip = screen.getByTestId('traversal-knowledge-chip').textContent ?? '';
    expect(chip).toContain('not measured');
    expect(chip).not.toContain('0/');
    // And no mark claims a reading the join never made.
    expect(
      screen.getAllByTestId('traversal-mark').every((mark) => !mark.hasAttribute('data-knowledge-depth')),
    ).toBe(true);
  });

  it('keeps the two depths apart — the recorded session descent and the drawn corpus distance', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    // `data-depth` is the route this session actually walked, from `parentVisitId`. `data-row` is the
    // corpus distance now drawn on the vertical (ADR-0482 D1) — a property of the CORPUS, the same for
    // every session that reads the artifact. TWO NUMBERS ON TWO ATTRIBUTES, never one: this trace
    // resolves no parent link, so every `data-depth` is 0 while the rows walk 1, 2, unmeasured — and
    // an implementation that collapsed them would make that impossible to see.
    expect(screen.getByTestId('traversal-knowledge-chip').textContent).toContain('knowledge');
    const sessionDepths = screen.getAllByTestId('traversal-mark').map((m) => m.getAttribute('data-depth'));
    expect(new Set(sessionDepths)).toEqual(new Set(['0']));
    const knowledge = screen.getAllByTestId('traversal-mark').map((m) => m.getAttribute('data-knowledge-depth'));
    expect(knowledge).toEqual(['1', '2', 'unlinked', 'absent']);
  });

  // ── THE DRAWN AXIS (`traversal-panel-depth-on-the-axis`, ADR-0482 D1–D3) ────────────────────────

  it('draws each placed read on the row its corpus depth names', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const rows = screen.getAllByTestId('traversal-mark').map((m) => m.getAttribute('data-row'));
    // `ceremony` 1 hop down, `principle` 2. The axis and the chip read ONE model, so the row and the
    // hover reading cannot disagree — which is the whole reason the axis is not computed twice.
    expect(rows.slice(0, 2)).toEqual(['1', '2']);
    const cys = screen
      .getAllByTestId('traversal-mark')
      .map((m) => Number(m.querySelector('circle')?.getAttribute('cy') ?? '0'));
    // Not merely different attributes: different PIXELS. A row attribute nothing positioned would be
    // a green assertion over a flat picture.
    expect(cys[1]).toBeGreaterThan(cys[0] as number);
  });

  it('NEVER draws an unmeasured read at the surface, and puts it below every depth row', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const marks = screen.getAllByTestId('traversal-mark');
    const rowOf = (index: number): number => Number(marks[index]?.getAttribute('data-row') ?? '-1');
    // `orphan` is unlinked and `forest-world` is absent. Both are the ABSENCE of a reading, and
    // `reading.depth ?? 0` would file both at row 0 beside genuine surfaces — the picture would then
    // say "everything is at the surface", which reads as health (ADR-0482 D3).
    expect(rowOf(2)).not.toBe(0);
    expect(rowOf(3)).not.toBe(0);
    expect(rowOf(2)).toBe(rowOf(3));
    expect(rowOf(2)).toBeGreaterThan(rowOf(1));
    // And the row says what it is where a reader meets it.
    const labels = [...screen.getByTestId('traversal-row-labels').querySelectorAll('text')].map(
      (t) => t.textContent,
    );
    expect(labels).toContain('surface');
    expect(labels).toContain('unmeasured');
    expect(labels).not.toContain('depth 1');
  });

  it('states that the vertical is CORPUS distance and not the route this session took', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    // ADR-0482 D2: the reversed clause's intent is preserved BY LABELLING, so this is a contract and
    // not a wording preference. An unlabelled axis re-creates the claim ADR-0354 clause 5 forbade.
    const note = screen.getByTestId('traversal-depth-axis-note');
    expect(note.getAttribute('data-axis-measured')).toBe('true');
    expect(note.getAttribute('data-axis-deepest')).toBe('2');
    expect(note.getAttribute('title')).toContain('CORPUS distance');
    expect(note.getAttribute('title')).toContain('never the route this session took');
  });

  it('moves the drawn edge with the CORPUS distance, not with the session descent', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    scrubTo(1);
    const moves = [...screen.getByTestId('traversal-spine-map').querySelectorAll('.traversal-edge')].map(
      (edge) => edge.getAttribute('data-depth-move'),
    );
    // 1 → 2 → unmeasured → unmeasured. This trace resolves NO parent link, so under the old rule every
    // one of these was `level`; the moves are evidence the edges follow the same rows the marks do.
    expect(moves).toEqual(['descend', 'descend', 'level']);
  });
});

describe('the picture says which recorder wrote what it draws (ADR-0484 D5)', () => {
  const HARNESS: TraversalProvenanceSurface = {
    surfaceId: 'host-transcript-file-read',
    count: 2,
    provenance: 'harness-derived',
    scope: 'a DECISION RECORD opened with the harness file tool, and NOTHING ELSE — not general file capture',
  };
  const OWN: TraversalProvenanceSurface = {
    surfaceId: 'library-artifact',
    count: 1,
    provenance: 'storytree-own',
    scope: 'one storytree read verb, recorded as it ran',
  };

  function onSurface(surfaceId: string, offsetMs: number, nodeId: string): TraversalEventEnvelope {
    return {
      kind: 'full_payload_read',
      eventId: `event:${nodeId}:${offsetMs}`,
      sessionId: SESSION,
      at: at(offsetMs),
      visitId: `visit:${nodeId}:${offsetMs}`,
      nodeId,
      surfaceId,
    };
  }

  const MIXED = replay(
    [
      onSurface('library-artifact', 0, 'adr-0484'),
      onSurface('host-transcript-file-read', 30_000, 'doc:decisions/0403-a.md'),
      onSurface('host-transcript-file-read', 60_000, 'doc:decisions/0139-c.md'),
    ],
    { points: [], orphanFollows: [] },
    provenance([OWN, HARNESS], true),
  );

  it('stamps each mark with its tier, so a harness reading is never drawn as one of ours', () => {
    render(<TraversalSpine replay={MIXED} />);
    fireEvent.click(screen.getByTestId('traversal-play'));
    const tiers = screen.getAllByTestId('traversal-mark').map((mark) => mark.getAttribute('data-provenance'));
    expect(tiers).toEqual(['storytree-own', 'harness-derived', 'harness-derived']);
  });

  it('puts the tier and its narrowness on the hover of a harness mark, and leaves our own plain', () => {
    render(<TraversalSpine replay={MIXED} />);
    const titles = screen.getAllByTestId('traversal-mark').map((mark) => mark.querySelector('title')?.textContent);

    // Ours carries identity and nothing else — stamping the default tier on every circle would bury
    // the marks that are not ours.
    expect(titles[0]).toBe('adr-0484 · full payload');
    expect(titles[1]).toContain('HARNESS-DERIVED');
    expect(titles[1]).toContain('SECONDARY source');
    // Deliverable 3: the surface that reads most like "files the agent read" says what it really is.
    expect(titles[1]).toContain('not general file capture');
  });

  it('counts the two recorders apart in the meta chip, and never sums them', () => {
    render(<TraversalSpine replay={MIXED} />);
    const chip = screen.getByTestId('traversal-provenance-chip');
    expect(chip.getAttribute('data-own')).toBe('1');
    expect(chip.getAttribute('data-harness')).toBe('2');
    expect(chip.textContent).toContain('1 own');
    expect(chip.textContent).toContain('2 harness-derived');
    // Three observations of which two are secondary must never read as three of ours.
    expect(chip.textContent).not.toContain('3 own');
    expect(chip.getAttribute('title')).toContain('the storytree log is authoritative');
  });

  it('says the harness ingest was never run rather than letting an unmeasured absence read as zero', () => {
    const ownOnly = replay(
      [onSurface('library-artifact', 0, 'adr-0484')],
      { points: [], orphanFollows: [] },
      provenance([OWN], false),
    );
    render(<TraversalSpine replay={ownOnly} />);
    const chip = screen.getByTestId('traversal-provenance-chip');
    expect(chip.getAttribute('data-ingest-ran')).toBe('false');
    expect(chip.textContent).toContain('harness ingest never run');
    expect(chip.getAttribute('title')).toContain('NEVER RUN');
  });

  it('grows no chip on a trace that is wholly our own AND has been ingested — nothing left to qualify', () => {
    const clean = replay(
      [onSurface('library-artifact', 0, 'adr-0484')],
      { points: [], orphanFollows: [] },
      provenance([OWN], true),
    );
    render(<TraversalSpine replay={clean} />);
    expect(screen.queryByTestId('traversal-provenance-chip')).toBeNull();
  });
});

describe('the occupancy bar names its own recorder (ADR-0484 D5)', () => {
  it('says the reading is harness-derived, on the reading itself', () => {
    // The bar is the panel's most prominent number and it is harness-derived whichever way it was
    // filled: `residentInputTokens` has one producer, and the window's own transcript the mount
    // prefers (ADR-0456 D2) is the SAME harness file. Nothing storytree records can fill it.
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'arc'),
          occupancyEvent(1_000, 120_000),
          visit('full_payload_read', 20_000, 'plan'),
        ])}
      />,
    );
    scrubTo(1);
    const label = document.querySelector('.traversal-occupancy-track')?.getAttribute('aria-label');
    expect(label).toContain('HARNESS-DERIVED');
    expect(label).toContain('not');
    expect(label).toContain('recorded by storytree');
  });
});
