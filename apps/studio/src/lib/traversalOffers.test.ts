// Red-green on the offer fans (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`).
//
// The increment's proof route: "an offer set renders `M of N` and never a percentage". Two further
// rules with teeth are pinned here because a renderer would break them silently:
//
//   • ORDER IS PRESERVED EXACTLY (ADR-0318 D3). Two renders of the same offer diverge on order in 63%
//     of multi-ref artifacts, so a sorted fan is a stable-looking sequence that is not what the agent
//     saw — a worse lie than the arbitrary one.
//   • AN UNOBSERVABLE BRANCH IS NEVER A DECLINED ONE (ADR-0312). A `doc:` ref no read could ever follow
//     must not be counted among the branches something chose not to take.

import { describe, it, expect } from 'vitest';
import type { TraversalDecisionPointReport, TraversalEventEnvelope } from '../types';
import { buildTraversalOffers, formatDenominator, offerInstants } from './traversalOffers';
import { buildTraversalTimeScale } from './traversalTime';

const SESSION = 'bold-dhawan-b6970b';
const T0 = Date.parse('2026-08-12T09:00:00.000Z');

function candidateSet(id: string, offsetMs: number, nodeIds: string[]): TraversalEventEnvelope {
  return {
    kind: 'candidate_set',
    eventId: `event:${id}`,
    sessionId: SESSION,
    at: new Date(T0 + offsetMs).toISOString(),
    candidateSetId: id,
    surfaceId: 'library-artifact',
    candidateNodeIds: nodeIds,
  };
}

function build(events: TraversalEventEnvelope[], report: TraversalDecisionPointReport) {
  return buildTraversalOffers(events, report, buildTraversalTimeScale(offerInstants(events)));
}

describe('every fan states its raw denominator, and never a ratio', () => {
  it('renders `offered N, observable M of N` from the recorded outcomes', () => {
    const model = build(
      [candidateSet('cs:1', 0, ['arc', 'plan', 'doc:decisions/0183-x.md'])],
      {
        points: [
          {
            candidateSetId: 'cs:1',
            surfaceId: 'library-artifact',
            candidates: [
              { nodeId: 'arc', outcome: { status: 'followed', toVisitId: 'v1', edgeId: 'e1' } },
              { nodeId: 'plan', outcome: { status: 'not-followed' } },
              {
                nodeId: 'doc:decisions/0183-x.md',
                outcome: { status: 'unobservable', reason: 'scheme prefix' },
              },
            ],
            unresolved: [],
          },
        ],
        orphanFollows: [],
      },
    );

    expect(model.offers).toHaveLength(1);
    expect(model.offers[0]?.denominator).toBe('offered 3, observable 2 of 3');
    expect(model.offers[0]?.offered).toBe(3);
    expect(model.offers[0]?.observable).toBe(2);
    expect(model.offers[0]?.followed).toBe(1);
    // No percentage, anywhere, in the sentence a reader is shown.
    expect(model.offers[0]?.denominator).not.toMatch(/%/);
  });

  it('never renders a percentage even where one would divide cleanly', () => {
    expect(formatDenominator(4, 2)).toBe('offered 4, observable 2 of 4');
    expect(formatDenominator(4, 2)).not.toMatch(/%|50/);
  });

  it('keeps an offer set with NOTHING observable at observable 0 rather than dropping it', () => {
    // 25.8% of offer sets have nothing observable at all (ADR-0312). A set that vanished from the
    // picture would take its own denominator with it.
    const model = build([candidateSet('cs:1', 0, ['doc:a.md', 'doc:b.md'])], {
      points: [
        {
          candidateSetId: 'cs:1',
          surfaceId: 'library-artifact',
          candidates: [
            { nodeId: 'doc:a.md', outcome: { status: 'unobservable', reason: 'scheme prefix' } },
            { nodeId: 'doc:b.md', outcome: { status: 'unobservable', reason: 'scheme prefix' } },
          ],
          unresolved: [],
        },
      ],
      orphanFollows: [],
    });

    expect(model.offers).toHaveLength(1);
    expect(model.offers[0]?.denominator).toBe('offered 2, observable 0 of 2');
    // And none of them is a declined branch.
    expect(model.offers[0]?.candidates.every((candidate) => candidate.status === 'unobservable')).toBe(true);
  });

  it('totals the trace in the same raw form, with follows counted over the OBSERVABLE branches', () => {
    const model = build(
      [candidateSet('cs:1', 0, ['a', 'doc:x.md']), candidateSet('cs:2', 10_000, ['b', 'c'])],
      {
        points: [
          {
            candidateSetId: 'cs:1',
            surfaceId: 'library-artifact',
            candidates: [
              { nodeId: 'a', outcome: { status: 'followed', toVisitId: 'v', edgeId: 'e' } },
              { nodeId: 'doc:x.md', outcome: { status: 'unobservable', reason: 'scheme prefix' } },
            ],
            unresolved: [],
          },
          {
            candidateSetId: 'cs:2',
            surfaceId: 'library-artifact',
            candidates: [
              { nodeId: 'b', outcome: { status: 'not-followed' } },
              { nodeId: 'c', outcome: { status: 'not-followed' } },
            ],
            unresolved: [],
          },
        ],
        orphanFollows: [],
      },
    );

    expect(model.totalOffered).toBe(4);
    expect(model.totalObservable).toBe(3);
    expect(model.totalFollowed).toBe(1);
  });
});

describe('the fan never re-orders and never re-classifies', () => {
  it('preserves the recorded order exactly, including a set already out of alphabetical order', () => {
    const model = build([candidateSet('cs:1', 0, ['zebra', 'alpha', 'monkey'])], {
      points: [
        {
          candidateSetId: 'cs:1',
          surfaceId: 'library-artifact',
          candidates: [
            { nodeId: 'zebra', outcome: { status: 'not-followed' } },
            { nodeId: 'alpha', outcome: { status: 'not-followed' } },
            { nodeId: 'monkey', outcome: { status: 'not-followed' } },
          ],
          unresolved: [],
        },
      ],
      orphanFollows: [],
    });

    expect(model.offers[0]?.candidates.map((candidate) => candidate.nodeId)).toEqual([
      'zebra',
      'alpha',
      'monkey',
    ]);
  });

  it('takes the status from the server-side join, never from the id it is looking at', () => {
    // A followable-looking id the join called unobservable stays unobservable, and a `doc:` id the
    // join resolved stays resolved. Re-deriving either here would be the second classifier the
    // shared report exists to prevent.
    const model = build([candidateSet('cs:1', 0, ['plain-id', 'doc:x.md'])], {
      points: [
        {
          candidateSetId: 'cs:1',
          surfaceId: 'library-artifact',
          candidates: [
            { nodeId: 'plain-id', outcome: { status: 'unobservable', reason: 'as recorded' } },
            { nodeId: 'doc:x.md', outcome: { status: 'followed', toVisitId: 'v', edgeId: 'e' } },
          ],
          unresolved: [],
        },
      ],
      orphanFollows: [],
    });

    expect(model.offers[0]?.candidates[0]?.status).toBe('unobservable');
    expect(model.offers[0]?.candidates[1]?.status).toBe('followed');
    expect(model.offers[0]?.denominator).toBe('offered 2, observable 1 of 2');
  });

  it('carries an ambiguous outcome through with its reason rather than collapsing it', () => {
    const model = build([candidateSet('cs:1', 0, ['dup', 'dup'])], {
      points: [
        {
          candidateSetId: 'cs:1',
          surfaceId: 'library-artifact',
          candidates: [
            { nodeId: 'dup', outcome: { status: 'ambiguous', reason: 'offered twice', edgeIds: ['e'] } },
            { nodeId: 'dup', outcome: { status: 'ambiguous', reason: 'offered twice', edgeIds: ['e'] } },
          ],
          unresolved: [],
        },
      ],
      orphanFollows: [],
    });

    expect(model.offers[0]?.candidates.map((candidate) => candidate.status)).toEqual([
      'ambiguous',
      'ambiguous',
    ]);
    expect(model.offers[0]?.candidates[0]?.reason).toBe('offered twice');
    // Ambiguous is not followed: it is the honest gap between "answered" and "which slot".
    expect(model.offers[0]?.followed).toBe(0);
  });
});

describe('an offer with no instant is counted rather than placed', () => {
  it('reports an offer whose candidate_set is absent from this trace', () => {
    const model = build([], {
      points: [
        {
          candidateSetId: 'cs:orphan',
          surfaceId: 'library-artifact',
          candidates: [{ nodeId: 'a', outcome: { status: 'not-followed' } }],
          unresolved: [],
        },
      ],
      orphanFollows: [],
    });

    expect(model.offers).toHaveLength(0);
    expect(model.unplaced).toBe(1);
    // Its counts still land in the totals — the offer is real; only its row is unknown.
    expect(model.totalOffered).toBe(1);
  });

  it('answers empty for a trace the server sent no join for', () => {
    const model = buildTraversalOffers([], undefined, buildTraversalTimeScale([]));
    expect(model.offers).toHaveLength(0);
    expect(model.totalOffered).toBe(0);
  });
});
