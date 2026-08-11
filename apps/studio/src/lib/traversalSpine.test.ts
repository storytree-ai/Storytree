// Red-green on the spine model (`traversal-panel-arc`, increment `traversal-panel-spine-render`).
//
// What the signed grammar makes assertable here: the edge into a visit carries THAT VISIT'S read
// strength and the discriminator is the event `kind` alone; a search is its own mark; and the events
// this increment does not draw are COUNTED under the increment that draws them, so an operator is never
// shown a picture that quietly omits a third of the trace.

import { describe, it, expect } from 'vitest';
import type {
  TraversalDecisionPointReport,
  TraversalEventEnvelope,
  TraversalReplayPayload,
} from '../types';
import { buildTraversalSpine } from './traversalSpine';

const SESSION = 'kind-hamilton-e938be';
const T0 = Date.parse('2026-08-11T08:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function visit(kind: 'full_payload_read' | 'front_matter_read', offsetMs: number, nodeId: string): TraversalEventEnvelope {
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
    occupancy: { modelContextCount: 0, observationCount: 0, declared: false, note: 'no occupancy observed' },
    decisionPoints,
  };
}

describe('read strength comes from the event kind, and rides the edge INTO the visit', () => {
  it('draws a solid edge into a full payload read and a front-matter edge into a front-matter read', () => {
    const model = buildTraversalSpine(
      replay([
        visit('full_payload_read', 0, 'arc'),
        visit('front_matter_read', 30_000, 'plan'),
        visit('full_payload_read', 60_000, 'increment'),
      ]),
    );

    expect(model.marks.map((mark) => mark.strength)).toEqual(['full', 'front-matter', 'full']);
    // Two edges, each carrying its TARGET's strength — the step's weight is what it actually pulled.
    expect(model.edges.map((edge) => edge.strength)).toEqual(['front-matter', 'full']);
  });

  it('marks a search as its own strength — the only non-circular mark in the grammar', () => {
    const model = buildTraversalSpine(replay([visit('full_payload_read', 0, 'arc'), search(20_000)]));
    expect(model.marks[1]?.strength).toBe('search');
    expect(model.edges[0]?.strength).toBe('search');
  });

  it('orders marks chronologically whatever order the trace was read in', () => {
    const model = buildTraversalSpine(
      replay([visit('full_payload_read', 60_000, 'late'), visit('full_payload_read', 0, 'early')]),
    );
    expect(model.marks.map((mark) => mark.label)).toEqual(['early · full payload', 'late · full payload']);
    expect(model.marks[0]!.y).toBeLessThanOrEqual(model.marks[1]!.y);
  });
});

describe('the spine now composes lanes, depth and offers rather than counting them as deferred', () => {
  it('folds a handoff/return pair into a lane, and reads its model off the recorded field', () => {
    const model = buildTraversalSpine(
      replay(
        [
          visit('full_payload_read', 0, 'arc'),
          {
            kind: 'spawn_handoff',
            eventId: 'event:spawn',
            sessionId: SESSION,
            at: at(10_000),
            edgeId: 'edge:1',
            parentSessionId: SESSION,
            childSessionId: 'child-agent',
            agentType: 'Explore',
            model: 'claude-opus-5',
            runtime: 'sdk-leaf',
          },
          {
            kind: 'result_return',
            eventId: 'event:return',
            sessionId: SESSION,
            at: at(20_000),
            edgeId: 'edge:1',
            parentSessionId: SESSION,
            childSessionId: 'child-agent',
            ok: true,
          },
          {
            kind: 'candidate_set',
            eventId: 'event:candidates',
            sessionId: SESSION,
            at: at(30_000),
            candidateSetId: 'cs:1',
            surfaceId: 'library-artifact',
            candidateNodeIds: ['a', 'doc:decisions/0001-z.md'],
          },
        ],
        {
          points: [
            {
              candidateSetId: 'cs:1',
              surfaceId: 'library-artifact',
              candidates: [
                { nodeId: 'a', outcome: { status: 'not-followed' } },
                {
                  nodeId: 'doc:decisions/0001-z.md',
                  outcome: { status: 'unobservable', reason: 'scheme prefix' },
                },
              ],
              unresolved: [],
            },
          ],
          orphanFollows: [],
        },
      ),
    );

    // A lane event is still not a MARK — the traversal's steps are visits and searches.
    expect(model.marks).toHaveLength(1);
    expect(model.lanes.lanes).toHaveLength(1);
    expect(model.lanes.lanes[0]?.model).toBe('claude-opus-5');
    expect(model.lanes.lanes[0]?.endMs).not.toBeNull();
    expect(model.offers.offers).toHaveLength(1);
    expect(model.offers.offers[0]?.denominator).toBe('offered 2, observable 1 of 2');
  });

  it('builds the axis over everything it draws, so a lane past the last mark is not clamped onto it', () => {
    // The handoff happens a full minute AFTER the last visit. Built from the marks alone, its row
    // would land exactly on the final mark and read as an observation at that time.
    const model = buildTraversalSpine(
      replay([
        visit('full_payload_read', 0, 'arc'),
        visit('full_payload_read', 30_000, 'plan'),
        {
          kind: 'spawn_handoff',
          eventId: 'event:spawn',
          sessionId: SESSION,
          at: at(90_000),
          edgeId: 'edge:late',
          parentSessionId: SESSION,
          childSessionId: 'child',
          agentType: 'general-purpose',
        },
      ]),
    );

    const lastMark = model.marks[model.marks.length - 1];
    expect(lastMark).toBeDefined();
    expect(model.lanes.lanes[0]!.y0).toBeGreaterThan(lastMark!.y);
  });

  it('counts an undatable event rather than placing it at a guessed instant', () => {
    const broken = { ...visit('full_payload_read', 0, 'arc'), at: 'not-a-timestamp' };
    const model = buildTraversalSpine(replay([broken, visit('full_payload_read', 10_000, 'plan')]));

    expect(model.undatable).toBe(1);
    expect(model.marks).toHaveLength(1);
  });
});

describe('the spine composes the axis and the occupancy series', () => {
  it('carries an empty axis and an unobserved series for a trace with nothing plottable', () => {
    const model = buildTraversalSpine(replay([]));
    expect(model.marks).toHaveLength(0);
    expect(model.edges).toHaveLength(0);
    expect(model.scale.totalPx).toBe(0);
    expect(model.occupancy.observationCount).toBe(0);
  });

  it('feeds the occupancy series from the replayed session’s own model_context events', () => {
    const model = buildTraversalSpine(
      replay([
        visit('full_payload_read', 0, 'arc'),
        {
          kind: 'model_context',
          eventId: 'occupancy:1',
          sessionId: SESSION,
          at: at(5_000),
          cumulativeInputTokens: 900_000,
          addedInputTokens: 900_000,
          residentInputTokens: 120_000,
        },
      ]),
    );

    expect(model.occupancy.observationCount).toBe(1);
    expect(model.occupancy.maxResidentTokens).toBe(120_000);
    // `model_context` is not a MARK — it feeds the bar, it is not a step in the traversal.
    expect(model.marks).toHaveLength(1);
  });
});
