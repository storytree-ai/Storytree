// Red-green on depth resolution (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`).
//
// The increment's proof route: "a trace with parent links renders indented and one without renders a
// single column". The single-column case is the one that matters most, because it is the one a reader
// is likeliest to mistake for a bug — the design's honesty clause makes it the CORRECT picture wherever
// parent links are absent, and an inferred tree is the one thing it forbids.
//
// So the refusals are asserted directly: not from order, not from time, not from the node graph.

import { describe, it, expect } from 'vitest';
import type { TraversalEventEnvelope } from '../types';
import { computeTraversalDepth, drawnDepth, TRAVERSAL_MAX_DRAWN_DEPTH } from './traversalDepth';

const SESSION = 'bold-dhawan-b6970b';
const T0 = Date.parse('2026-08-12T09:00:00.000Z');

function visit(visitId: string, offsetMs: number, parentVisitId?: string): TraversalEventEnvelope {
  const event = {
    kind: 'full_payload_read' as const,
    eventId: `event:${visitId}`,
    sessionId: SESSION,
    at: new Date(T0 + offsetMs).toISOString(),
    visitId,
    nodeId: visitId.replace('visit:', ''),
  };
  return parentVisitId === undefined ? event : { ...event, parentVisitId };
}

describe('depth comes from parentVisitId and from nothing else', () => {
  it('indents a descent and comes back on a return to a shallower node', () => {
    // The shape `storytree agents <name>` really produces: the agent visit, its resolved floor refs
    // one level down, then a return to the top level.
    const model = computeTraversalDepth([
      visit('visit:agent', 0),
      visit('visit:ref-a', 1_000, 'visit:agent'),
      visit('visit:ref-a-child', 2_000, 'visit:ref-a'),
      visit('visit:ref-b', 3_000, 'visit:agent'),
      visit('visit:next-top', 4_000),
    ]);

    expect(model.depthByVisitId.get('visit:agent')).toBe(0);
    expect(model.depthByVisitId.get('visit:ref-a')).toBe(1);
    expect(model.depthByVisitId.get('visit:ref-a-child')).toBe(2);
    // The return: a sibling at depth 1, then back to the spine.
    expect(model.depthByVisitId.get('visit:ref-b')).toBe(1);
    expect(model.depthByVisitId.get('visit:next-top')).toBe(0);
    expect(model.maxDepth).toBe(2);
    expect(model.linkedVisits).toBe(3);
  });

  it('renders a SINGLE COLUMN when nothing carries a parent link', () => {
    const model = computeTraversalDepth([
      visit('visit:a', 0),
      visit('visit:b', 1_000),
      visit('visit:c', 2_000),
    ]);

    expect(model.maxDepth).toBe(0);
    expect(model.linkedVisits).toBe(0);
    // Not from ORDER: the second visit is not the first's child.
    expect(model.depthByVisitId.get('visit:b')).toBe(0);
  });

  it('does not indent on a parent link naming a visit this trace does not contain', () => {
    // The partial-trace case (ADR-0241 D5) and the pre-producer case both land here: the link is real,
    // its target is simply not here, and indenting would place a child under a parent nobody can point at.
    const model = computeTraversalDepth([visit('visit:a', 0, 'visit:elsewhere'), visit('visit:b', 1_000)]);

    expect(model.depthByVisitId.get('visit:a')).toBe(0);
    expect(model.maxDepth).toBe(0);
    expect(model.unresolvedParents).toBe(1);
  });

  it('never reads containment out of temporal proximity', () => {
    // Two visits one millisecond apart, neither carrying a link. Proximity is not evidence (ADR-0235
    // clause 3), so this is a single column however tight the timing is.
    const model = computeTraversalDepth([visit('visit:a', 0), visit('visit:b', 1)]);
    expect(model.maxDepth).toBe(0);
  });

  it('survives a parent chain that closes on itself, and indents none of it', () => {
    const model = computeTraversalDepth([
      visit('visit:a', 0, 'visit:b'),
      visit('visit:b', 1_000, 'visit:a'),
    ]);

    expect(model.maxDepth).toBe(0);
    expect(model.cyclicParents).toBeGreaterThan(0);
  });

  it('keeps the first event for a duplicated visit id rather than re-parenting the subtree', () => {
    const model = computeTraversalDepth([
      visit('visit:root', 0),
      visit('visit:x', 1_000, 'visit:root'),
      visit('visit:x', 2_000),
    ]);

    expect(model.depthByVisitId.get('visit:x')).toBe(1);
  });
});

describe('the drawn depth is clamped, and the clamp is a display choice rather than the data', () => {
  it('stacks a deeper descent at the last drawn column while reporting the real depth', () => {
    const events: TraversalEventEnvelope[] = [visit('visit:0', 0)];
    for (let level = 1; level <= TRAVERSAL_MAX_DRAWN_DEPTH + 2; level += 1) {
      events.push(visit(`visit:${level}`, level * 1_000, `visit:${level - 1}`));
    }
    const model = computeTraversalDepth(events);

    expect(model.maxDepth).toBe(TRAVERSAL_MAX_DRAWN_DEPTH + 2);
    expect(drawnDepth(model, `visit:${TRAVERSAL_MAX_DRAWN_DEPTH + 2}`)).toBe(TRAVERSAL_MAX_DRAWN_DEPTH);
    expect(drawnDepth(model, 'visit:1')).toBe(1);
  });

  it('draws an unknown visit id on the spine', () => {
    const model = computeTraversalDepth([visit('visit:a', 0)]);
    expect(drawnDepth(model, 'visit:never-recorded')).toBe(0);
  });
});
