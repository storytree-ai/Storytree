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
//   • the occupancy bar reddens only past 500k, holds its reading, and SAYS SO when there is no series
//     rather than drawing a flat zero;
//   • the events this increment defers are named on the surface rather than silently omitted.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { TraversalEventEnvelope, TraversalReplayPayload } from '../types';
import { TraversalSpine } from './TraversalSpine';

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
): TraversalEventEnvelope {
  return {
    kind,
    eventId: `event:${nodeId}:${offsetMs}`,
    sessionId: SESSION,
    at: at(offsetMs),
    visitId: `visit:${nodeId}:${offsetMs}`,
    nodeId,
  };
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

function replay(events: TraversalEventEnvelope[]): TraversalReplayPayload {
  return {
    sessionId: SESSION,
    events,
    relationships: [],
    coverage: [],
    coverageCaveats: [],
    skipped: 0,
    partial: false,
    occupancy: { modelContextCount: 0, observationCount: 0, declared: false, note: 'note' },
  };
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
    const absent = screen.getByTestId('traversal-occupancy-absent');
    expect(absent.textContent).toContain('no occupancy series to plot');
    expect(absent.textContent).toContain('traversal ingest');
    // It does NOT recompute what was observed: the route's declaration is rendered verbatim by the
    // mount, and a second account here could disagree with it.
    expect(absent.textContent).not.toContain('2 model requests');
  });

  it('holds the reading at the playhead and reddens only the portion past 500k', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 600_000),
          visit('full_payload_read', 20_000, 'b'),
          visit('full_payload_read', 40_000, 'c'),
        ])}
      />,
    );

    scrubTo(1);
    // Scale is the base 1M ceiling: 500k safe + 100k over.
    expect((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.width).toBe('50%');
    const over = screen.getByTestId('traversal-occupancy-over') as HTMLElement;
    expect(over.style.width).toBe('10%');
    expect(over.style.left).toBe('50%');
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('600.0k resident');
  });

  it('has no red at all at exactly the threshold', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          occupancyEvent(1_000, 500_000),
          visit('full_payload_read', 20_000, 'b'),
        ])}
      />,
    );

    scrubTo(1);
    expect((screen.getByTestId('traversal-occupancy-over') as HTMLElement).style.width).toBe('0%');
    expect((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.width).toBe('50%');
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
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('— resident');
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

    const safeWidth = (): number =>
      Number.parseFloat((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.width);

    scrubTo(0.5);
    const first = safeWidth();
    scrubTo(1);
    const second = safeWidth();
    // The billing total rose across those two events; the plotted bar FELL.
    expect(second).toBeLessThan(first);
  });
});

describe('what is not drawn is said out loud', () => {
  it('names the deferred lane and offer events and the increment that draws them', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          {
            kind: 'spawn_handoff',
            eventId: 'event:spawn',
            sessionId: SESSION,
            at: at(10_000),
            edgeId: 'edge:1',
            parentSessionId: SESSION,
            childSessionId: 'child',
            agentType: 'Explore',
          },
          {
            kind: 'candidate_set',
            eventId: 'event:cs',
            sessionId: SESSION,
            at: at(20_000),
            candidateSetId: 'cs:1',
            surfaceId: 'library-artifact',
            candidateNodeIds: ['x'],
          },
        ])}
      />,
    );

    const note = screen.getByTestId('traversal-spine-deferred');
    expect(note.textContent).toContain('1 subagent lane event');
    expect(note.textContent).toContain('1 offer event');
    expect(note.textContent).toContain('traversal-panel-lanes-and-depth');
  });

  it('renders no deferred note when there is nothing being held back', () => {
    render(<TraversalSpine replay={replay([visit('full_payload_read', 0, 'a')])} />);
    expect(screen.queryByTestId('traversal-spine-deferred')).toBeNull();
  });

  it('says a trace with nothing plottable is empty rather than drawing an empty axis', () => {
    render(<TraversalSpine replay={replay([occupancyEvent(0)])} />);
    expect(screen.queryByTestId('traversal-spine-map')).toBeNull();
    expect(screen.getByTestId('traversal-spine-empty').textContent).toContain('nothing plottable');
    expect((screen.getByTestId('traversal-play') as HTMLButtonElement).disabled).toBe(true);
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
