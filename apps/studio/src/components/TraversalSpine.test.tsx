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
import type {
  TraversalDecisionPointReport,
  TraversalEventEnvelope,
  TraversalReplayPayload,
} from '../types';
import { TraversalSpine, TRAVERSAL_SPINE_GEOMETRY } from './TraversalSpine';

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

function replay(
  events: TraversalEventEnvelope[],
  decisionPoints: TraversalDecisionPointReport = { points: [], orphanFollows: [] },
): TraversalReplayPayload {
  return {
    sessionId: SESSION,
    events,
    relationships: [],
    coverage: [],
    coverageCaveats: [],
    skipped: 0,
    partial: false,
    occupancy: { modelContextCount: 0, observationCount: 0, declared: false, note: 'note' },
    decisionPoints,
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
 * the scarce dimension: depth rows, lane rows and the offer band now share the dock's height, where
 * before nothing could overflow downward at all.
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
    expect((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.height).toBe('50%');
    const over = screen.getByTestId('traversal-occupancy-over') as HTMLElement;
    expect(over.style.height).toBe('10%');
    expect(over.style.bottom).toBe('50%');
    // The word "resident" caps the track above the readout in the vertical composition, so the claim
    // is read off the whole block rather than the numeric line alone.
    expect(screen.getByTestId('traversal-occupancy-readout').textContent).toContain('600.0k');
    expect(screen.getByTestId('traversal-occupancy').textContent).toContain('resident');
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
    expect((screen.getByTestId('traversal-occupancy-over') as HTMLElement).style.height).toBe('0%');
    expect((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.height).toBe('50%');
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
      Number.parseFloat((screen.getByTestId('traversal-occupancy-safe') as HTMLElement).style.height);

    scrubTo(0.5);
    const first = safeFill();
    scrubTo(1);
    const second = safeFill();
    // The billing total rose across those two events; the plotted bar FELL.
    expect(second).toBeLessThan(first);
  });
});

describe('subagent lanes name their agent type and the model they ran on', () => {
  it('draws a band with a handoff and a return edge, badged with the recorded model', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          handoff('e1', 10_000, { agentType: 'Explore', model: 'claude-opus-5', runtime: 'sdk-leaf' }),
          result('e1', 40_000),
          visit('full_payload_read', 60_000, 'b'),
        ])}
      />,
    );
    scrubTo(1);

    const lanes = screen.getAllByTestId('traversal-lane');
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.getAttribute('data-agent-type')).toBe('Explore');
    expect(lanes[0]?.getAttribute('data-model')).toBe('claude-opus-5');
    expect(lanes[0]?.getAttribute('data-open')).toBe('false');
    // Both linking edges: the payload out and the result back.
    expect(screen.getAllByTestId('traversal-lane-handoff')).toHaveLength(1);
    expect(screen.getAllByTestId('traversal-lane-return')).toHaveLength(1);

    const badge = screen.getByTestId('traversal-lane-chip');
    expect(badge.textContent).toContain('Explore');
    expect(badge.textContent).toContain('claude-opus-5');

    // The band is the span the PARENT observed. The child's own steps live in a different trace file
    // (`childSessionId` is its own session id) and are not read here — said out loud, so an empty
    // band is never taken for a child that did nothing.
    expect(screen.getByTestId('traversal-lane-note').textContent).toContain(
      'own steps are in its own trace and are not read here',
    );
  });

  it('SAYS a lane whose model was not recorded, rather than guessing one', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          // The runtime IS recorded. It still must not become a model.
          handoff('e1', 10_000, { agentType: 'general-purpose', runtime: 'sdk-leaf' }),
          result('e1', 40_000),
        ])}
      />,
    );
    scrubTo(1);

    const badge = screen.getByTestId('traversal-lane-chip');
    expect(badge.textContent).toContain('model not recorded');
    expect(screen.getAllByTestId('traversal-lane')[0]?.getAttribute('data-model')).toBe('not-recorded');
    // No model name of any kind leaked into the badge.
    expect(badge.textContent).not.toMatch(/claude|gpt|opus|sonnet/i);
  });

  it('leaves a lane with no recorded return OPEN, and draws no return edge for it', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          handoff('e1', 10_000),
          visit('full_payload_read', 60_000, 'b'),
        ])}
      />,
    );
    scrubTo(1);

    const lane = screen.getAllByTestId('traversal-lane')[0];
    expect(lane?.getAttribute('data-open')).toBe('true');
    expect(screen.queryAllByTestId('traversal-lane-return')).toHaveLength(0);
    // RE-POINTED: the chip carries the MODEL now (clause 7), so openness is read where it is stated
    // — the lane's own hover identity, which names the absence rather than a guessed end.
    expect(lane?.querySelector('title')?.textContent).toContain('the lane is open');
    expect(screen.getByTestId('traversal-spine-deferred').textContent).toContain('left open');
  });

  it('reveals a lane as the playhead reaches its handoff, and not before', () => {
    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          visit('full_payload_read', 20_000, 'b'),
          handoff('e1', 40_000),
          result('e1', 50_000),
          visit('full_payload_read', 60_000, 'c'),
        ])}
      />,
    );

    scrubTo(0);
    expect(screen.getAllByTestId('traversal-lane')[0]?.classList.contains('is-visible')).toBe(false);
    scrubTo(1);
    expect(screen.getAllByTestId('traversal-lane')[0]?.classList.contains('is-visible')).toBe(true);
  });

  it('puts two overlapping children in different columns and two sequential ones in the same column', () => {
    const { unmount } = render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          handoff('e1', 10_000),
          handoff('e2', 20_000),
          result('e1', 80_000),
          result('e2', 90_000),
        ])}
      />,
    );
    scrubTo(1);
    // RE-POINTED BY THE ROTATION: a packed column is a ROW now, so the discriminator is `y`, not `x`
    // — `x` carries TIME and would differ for two lanes even if the packing had collapsed them onto
    // one another, which is exactly the failure this test exists to catch.
    const concurrentYs = new Set(
      screen.getAllByTestId('traversal-lane').map((lane) => lane.querySelector('rect')?.getAttribute('y')),
    );
    expect(concurrentYs.size).toBe(2);
    unmount();

    render(
      <TraversalSpine
        replay={replay([
          visit('full_payload_read', 0, 'a'),
          handoff('e1', 10_000),
          result('e1', 20_000),
          handoff('e2', 60_000),
          result('e2', 80_000),
        ])}
      />,
    );
    scrubTo(1);
    const sequentialYs = new Set(
      screen.getAllByTestId('traversal-lane').map((lane) => lane.querySelector('rect')?.getAttribute('y')),
    );
    expect(sequentialYs.size).toBe(1);
  });
});

describe('depth indents only where parent links exist', () => {
  it('indents a descent and comes back, drawing each move as the move it was', () => {
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

    const depths = screen.getAllByTestId('traversal-mark').map((mark) => mark.getAttribute('data-depth'));
    expect(depths).toEqual(['0', '1', '0']);

    const moves = [...screen.getByTestId('traversal-spine-map').querySelectorAll('.traversal-edge')].map(
      (edge) => edge.getAttribute('data-depth-move'),
    );
    expect(moves).toEqual(['descend', 'return']);
    expect(screen.getByTestId('traversal-depth-note').textContent).toContain('1 visit indented');
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

    const note = screen.getByTestId('traversal-depth-note');
    expect(note.textContent).toContain('single row');
    expect(note.textContent).toContain('never inferred');
  });
});

describe('offer fans carry their raw denominator', () => {
  const OFFER_EVENTS: TraversalEventEnvelope[] = [
    visit('full_payload_read', 0, 'a'),
    {
      kind: 'candidate_set',
      eventId: 'event:cs',
      sessionId: SESSION,
      at: at(20_000),
      candidateSetId: 'cs:1',
      surfaceId: 'library-artifact',
      candidateNodeIds: ['arc', 'plan', 'doc:decisions/0183-x.md'],
    },
    visit('full_payload_read', 40_000, 'b'),
  ];

  const OFFER_REPORT: TraversalDecisionPointReport = {
    points: [
      {
        candidateSetId: 'cs:1',
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

  it('draws one ray per recorded candidate, in recorded order, with its outcome', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    const rays = screen.getAllByTestId('traversal-offer-ray');
    expect(rays).toHaveLength(3);
    // Recorded order, never sorted (ADR-0318 D3).
    expect(rays.map((ray) => ray.getAttribute('data-status'))).toEqual([
      'followed',
      'not-followed',
      'unobservable',
    ]);
  });

  it('states `M of N` and never a percentage', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    const note = screen.getByTestId('traversal-offer-note');
    expect(note.textContent).toContain('offered 3, observable 2 of 3');
    expect(note.textContent).toContain('followed 1 of 2 observable');
    expect(note.textContent).not.toMatch(/%/);
    // An unobservable branch must never read as a declined one.
    expect(note.textContent).toContain('never a declined one');
  });

  it('draws a nearly-empty fork picture honestly rather than making it look fuller', () => {
    // The measured shape on this machine: many offers, nothing followed. That is the signal.
    render(
      <TraversalSpine
        replay={replay(OFFER_EVENTS, {
          points: [
            {
              candidateSetId: 'cs:1',
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

    expect(screen.getAllByTestId('traversal-offer-ray')).toHaveLength(3);
    expect(screen.getByTestId('traversal-offer-note').textContent).toContain('followed 0 of 2 observable');
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
    events.push({
      kind: 'candidate_set',
      eventId: 'event:cs',
      sessionId: SESSION,
      at: at(30_000),
      candidateSetId: 'cs:1',
      surfaceId: 'library-artifact',
      candidateNodeIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    render(
      <TraversalSpine
        replay={replay(events, {
          points: [
            {
              candidateSetId: 'cs:1',
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

    // Six concurrent lanes and an eight-way fan really are drawn — the guard is not passing on an
    // empty picture.
    expect(screen.getAllByTestId('traversal-lane')).toHaveLength(6);
    expect(screen.getAllByTestId('traversal-offer-ray')).toHaveLength(8);

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

    // The VERTICAL is now the scarce axis — depth rows, six lane rows and the offer band all share
    // it — so it is bounded here for the first time. Before the rotation nothing could overflow
    // downward; now it is the direction most likely to.
    const ys = drawnYs();
    expect(ys.length).toBeGreaterThan(20);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(boxHeight);
  });
});

describe('what could not be placed is said out loud', () => {
  it('names a return with no handoff rather than dropping it', () => {
    render(
      <TraversalSpine replay={replay([visit('full_payload_read', 0, 'a'), result('ghost', 10_000)])} />,
    );

    expect(screen.getByTestId('traversal-spine-deferred').textContent).toContain(
      'naming an edge no handoff in this trace opened',
    );
  });

  it('renders no note when nothing was left unplaced', () => {
    render(<TraversalSpine replay={replay([visit('full_payload_read', 0, 'a')])} />);
    expect(screen.queryByTestId('traversal-spine-deferred')).toBeNull();
  });

  it('says a trace with nothing drawable is empty rather than drawing an empty axis', () => {
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
