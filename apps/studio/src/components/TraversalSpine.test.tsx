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
  GuidanceAsset,
  TraversalDecisionPointReport,
  TraversalEventEnvelope,
  TraversalReplayPayload,
} from '../types';
import { buildKnowledgeDepth } from '../lib/knowledgeDepth';
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
    // The TRACK is what says it now (ADR-0393 D1 deleted the sentence that used to sit below the
    // picture). It keeps its column, goes dashed, and draws NO FILL — a flat zero bar would say the
    // window was empty, which is a claim about the session rather than about the observation.
    const track = document.querySelector('.traversal-occupancy.is-unobserved');
    expect(track).not.toBeNull();
    expect(track?.querySelector('[aria-label="no context occupancy was observed for this session"]')).not.toBeNull();
    expect(track?.textContent).toContain('none');
    expect(track?.textContent).toContain('observed');
    // And the deleted paragraph really is deleted, not merely hidden.
    expect(screen.queryByTestId('traversal-occupancy-absent')).toBeNull();
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
      maxDepth: 1,
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
    // The paragraph that used to restate this in words is DELETED (ADR-0393 D1). The indentation and
    // the two typed moves are the claim now, and they are what a screenshot could not have checked.
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

  it('draws NO ray for an unobservable branch, and keeps recorded order among the rest', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    // ADR-0393 D3: the owner removed the faint dashed rays at the LOOK. They were branches no read
    // could ever have followed — an ADR file pointer — so what is left is only what the agent could
    // actually have taken.
    const rays = screen.getAllByTestId('traversal-offer-ray');
    expect(rays).toHaveLength(2);
    expect(rays.map((ray) => ray.getAttribute('data-status'))).toEqual(['followed', 'not-followed']);
    // Recorded order among the survivors, never sorted (ADR-0318 D3): filtering must not re-order.
    expect(document.querySelectorAll('.traversal-offer-ray.status-unobservable')).toHaveLength(0);
  });

  it('KEEPS the raw `M of N` denominator, and still never a percentage', () => {
    render(<TraversalSpine replay={replay(OFFER_EVENTS, OFFER_REPORT)} />);
    scrubTo(1);

    // ADR-0312 D6 is NOT repealed by dropping the dashed rays and the note (ADR-0393 D3): the fan
    // still carries the full denominator, on hover and on its data attributes. What narrowed is the
    // denominator's SURFACE. A change that drops THESE too would be the repeal.
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

    // Two drawn (the unobservable one is not), and nothing followed — the measured shape on this
    // machine, drawn as the sparse signal it is rather than padded to look fuller.
    expect(screen.getAllByTestId('traversal-offer-ray')).toHaveLength(2);
    expect(screen.getByTestId('traversal-offer').getAttribute('data-followed')).toBe('0');
    expect(screen.getByTestId('traversal-offer').getAttribute('data-observable')).toBe('2');
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

    // The guard is not passing on an empty picture: a descent past the drawn cap and an eight-way
    // fan really are drawn. The six spawn pairs are still IN the trace and still stretch the axis —
    // they are simply no longer drawn as rows (ADR-0393 D2).
    expect(screen.getAllByTestId('traversal-mark').length).toBeGreaterThan(7);
    expect(screen.getAllByTestId('traversal-offer-ray')).toHaveLength(8);
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

    // The VERTICAL is the scarce axis — the depth rows and the offer band share it — so it is
    // bounded here. It got materially less crowded when the six lane rows went (ADR-0393 D2), which
    // is the point of the removal, but the bound is asserted rather than assumed either way.
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
describe('knowledge depth from the work is a SECOND axis, joined read-only at render time', () => {
  const CORPUS: GuidanceAsset[] = [
    {
      id: 'inc-one',
      category: 'principle',
      title: 'inc-one',
      description: '',
      body: '',
      references: [],
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
      references: [],
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
      references: [],
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
    {
      id: 'orphan',
      category: 'principle',
      title: 'orphan',
      description: '',
      body: '',
      references: [],
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

  it('annotates each reached artifact with its hop count, on the hover label and never as a gauge', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const attrs = screen
      .getAllByTestId('traversal-mark')
      .map((mark) => mark.getAttribute('data-knowledge-depth'));
    expect(attrs).toEqual(['1', '2', 'unreachable', 'absent']);

    const titles = screen.getAllByTestId('traversal-mark').map((mark) => mark.querySelector('title')?.textContent);
    expect(titles[0]).toBe('ceremony · full payload · knowledge depth 1 from the work');
    // The grammar clause survives every trim: the mark itself stays plain. Identity and read
    // strength are all it draws.
    expect(screen.getAllByTestId('traversal-mark')[0]?.querySelectorAll('text')).toHaveLength(0);
  });

  it('never renders an UNREACHABLE artifact as a deep one', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const orphan = screen.getAllByTestId('traversal-mark')[2];
    expect(orphan?.getAttribute('data-knowledge-depth')).toBe('unreachable');
    // Not a number, and the word "unmeasured" rather than "deep": no chain reaches it, which is an
    // absence of measurement, not a measurement of distance.
    expect(orphan?.querySelector('title')?.textContent).toContain('unmeasured');
    // The reading moved to the counts chip above the picture when the prose went (ADR-0393 D1); the
    // three-state distinction it protects did NOT move.
    expect(screen.getByTestId('traversal-knowledge-chip').getAttribute('data-unreachable')).toBe('1');
    expect(screen.getByTestId('traversal-knowledge-chip').getAttribute('title')).toContain('unmeasured, NOT deep');
  });

  it('counts the trace and carries the corpus-wide anchor figure beside it', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    const chip = screen.getByTestId('traversal-knowledge-chip');
    expect(chip.textContent).toContain('knowledge 2/4 on-chain');
    expect(chip.textContent).toContain('deepest 2');
    // WITHOUT THE ANCHOR FIGURE a reader blames the SESSION for a thin count that is really a fact
    // about how little of the corpus names any work. It is the reason the chip is worth its width.
    expect(chip.textContent).toContain('1/4 anchored');
    expect(chip.getAttribute('data-unreachable')).toBe('1');
    expect(chip.getAttribute('data-absent')).toBe('1');
    // The accepted risk stays on the surface, not only in a comment (ADR-0363 D2).
    expect(chip.getAttribute('title')).toContain('never a guarantee');
  });

  it('says an unread corpus was NOT MEASURED rather than reporting nothing reached', () => {
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

  it('keeps the two depths apart — the drawn indentation and the counted knowledge depth', () => {
    render(<TraversalSpine replay={WALK} knowledge={READY} />);
    // The picture's indentation is depth from `parentVisitId`; the chip is depth from the work. Both
    // paragraphs that used to name the difference are deleted (ADR-0393 D1), so the separation now
    // rests on their being two different SURFACES carrying two different numbers — which is exactly
    // why the chip must never be labelled "depth" alone.
    expect(screen.getByTestId('traversal-knowledge-chip').textContent).toContain('knowledge');
    const drawnDepths = screen.getAllByTestId('traversal-mark').map((m) => m.getAttribute('data-depth'));
    expect(new Set(drawnDepths)).toEqual(new Set(['0']));
    const knowledge = screen.getAllByTestId('traversal-mark').map((m) => m.getAttribute('data-knowledge-depth'));
    expect(knowledge).toEqual(['1', '2', 'unreachable', 'absent']);
  });
});
