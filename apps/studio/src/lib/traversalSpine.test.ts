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
  TraversalProvenanceDeclaration,
  TraversalProvenanceSurface,
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

/**
 * The provenance declaration the server folds (ADR-0484 D5). EMPTY by default rather than derived
 * from the events: a fixture that classified surfaces itself would be a second copy of the server's
 * table, which is precisely the drift the payload-carried classification exists to prevent. With no
 * declaration, every mark reads `unclassified`, which is the honest answer for a payload that made
 * no claim — the tests that care pass their own census.
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
      note: 'no occupancy observed',
    },
    decisionPoints,
    provenance: provenanceDeclaration,
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

describe('a mark carries the RECORDED visit id, so an offer fan can find the mark that printed it', () => {
  // ADR-0482 D4. A `candidate_set` is recorded under `candidate-set:<visitId>`, and that id is the
  // only evidence linking an offer to the read that printed it — a time match agrees for only 1,363
  // of the 2,106 offer sets on this machine. The field is carried rather than parsed back out of
  // `TraversalMark.id`, which is a composite display handle this module mints for itself.
  it('carries it for BOTH read kinds, verbatim', () => {
    const model = buildTraversalSpine(
      replay([visit('full_payload_read', 0, 'arc'), visit('front_matter_read', 10_000, 'plan')]),
    );
    expect(model.marks.map((mark) => mark.visitId)).toEqual(['visit:arc:0', 'visit:plan:10000']);
    // Verbatim, and NOT the mark's own id — the two differ by the `#index` suffix, and an offer
    // looking a mark up by the recorded id would miss every one of them if this returned the handle.
    expect(model.marks[0]?.visitId).not.toBe(model.marks[0]?.id);
  });

  it('answers null for a SEARCH, which is not a visit and prints no offers', () => {
    const model = buildTraversalSpine(replay([search(0), visit('full_payload_read', 10_000, 'arc')]));
    expect(model.marks.map((mark) => mark.visitId)).toEqual([null, 'visit:arc:10000']);
    // A search's own `searchId` must never leak into this field: it would key the offer lookup on an
    // id no `candidate_set` can ever name, which is a silent miss rather than an honest null.
    expect(model.marks[0]?.visitId).toBeNull();
  });
});

describe('which recorder wrote each observation rides the mark (ADR-0484 D5)', () => {
  const OWN: TraversalProvenanceSurface = {
    surfaceId: 'library-artifact',
    count: 1,
    provenance: 'storytree-own',
    scope: 'one storytree read verb, recorded as it ran',
  };
  const HARNESS: TraversalProvenanceSurface = {
    surfaceId: 'host-transcript-file-read',
    count: 1,
    provenance: 'harness-derived',
    scope: 'a DECISION RECORD opened with the harness file tool, and NOTHING ELSE',
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

  it('labels each mark from the payload it was handed, never from a table of its own', () => {
    const model = buildTraversalSpine(
      replay(
        [onSurface('library-artifact', 0, 'adr-0484'), onSurface('host-transcript-file-read', 30_000, 'doc:decisions/0403-a.md')],
        { points: [], orphanFollows: [] },
        provenance([OWN, HARNESS]),
      ),
    );

    expect(model.marks.map((mark) => mark.provenance)).toEqual(['storytree-own', 'harness-derived']);
    // The narrowness travels with it, so a hover can say what that surface can observe at all.
    expect(model.marks[1]?.provenanceScope).toContain('DECISION RECORD');
    expect(model.marks[1]?.surfaceId).toBe('host-transcript-file-read');
  });

  it('falls to unclassified for a surface the payload did not classify, never to our own log', () => {
    // THE SAFE DIRECTION. A surface an adapter minted and nobody declared must read as a tier a
    // reader cannot weigh — drawing it as storytree's own log is the exact collapse D5 prevents.
    const model = buildTraversalSpine(
      replay([onSurface('some-new-adapter-surface', 0, 'x')], { points: [], orphanFollows: [] }, provenance([OWN])),
    );
    expect(model.marks[0]?.provenance).toBe('unclassified');
    expect(model.marks[0]?.surfaceId).toBe('some-new-adapter-surface');
    expect(model.marks[0]?.provenanceScope).toBeNull();
  });

  it('separates an event that recorded NO surface from one carrying an unclassified surface', () => {
    // Both are `unclassified`, and only the second is a drift: the first is an old event from before
    // surfaces were stamped, and nothing about it can be attributed either way.
    const model = buildTraversalSpine(
      replay([visit('full_payload_read', 0, 'arc')], { points: [], orphanFollows: [] }, provenance([OWN])),
    );
    expect(model.marks[0]?.provenance).toBe('unclassified');
    expect(model.marks[0]?.surfaceId).toBeNull();
  });

  it('labels a search from its own surface too — it is an observation like any other', () => {
    const model = buildTraversalSpine(
      replay([search(0)], { points: [], orphanFollows: [] }, provenance([OWN])),
    );
    expect(model.marks[0]?.strength).toBe('search');
    expect(model.marks[0]?.provenance).toBe('storytree-own');
  });
});
