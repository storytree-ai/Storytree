// Red-green on the knowledge-depth JOIN (`traversal-panel-arc`, increment
// `standson-depth-from-work-join`; ADR-0363 D2).
//
// The judge itself is proved next door in `@storytree/library` (`knowledge-depth.test.ts`) — the
// walk, the shortest-path rule, the cycle, the denominators. What is under test HERE is the studio's
// half, and every case is one where a collapse would produce a confident wrong reading:
//
//   • an UNMEASURED corpus renders as unmeasured, never as "nothing was reached";
//   • the three readings stay three — reached / unreachable / not-an-artifact;
//   • the per-trace count is over DISTINCT artifacts, so a hot artifact cannot skew the distribution;
//   • the anchor line travels with every per-trace figure, so a thin count is read as a fact about
//     the corpus's wiring rather than about the session.

import { describe, it, expect } from 'vitest';
import type { GuidanceAsset, TraversalEventEnvelope } from '../types';
import {
  anchorSummary,
  buildKnowledgeDepth,
  markKnowledgeDepth,
  reportKnowledgeDepth,
} from './knowledgeDepth';

const SESSION = 'elegant-rosalind-2b9a05';
const T0 = Date.parse('2026-08-20T09:00:00.000Z');

function asset(
  id: string,
  extra: { standsOn?: string[]; cites?: string[] } = {},
): GuidanceAsset {
  return {
    id,
    category: 'principle',
    title: id,
    description: id,
    body: '',
    references: [],
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...(extra.standsOn ? { standsOn: extra.standsOn } : {}),
    ...(extra.cites ? { cites: extra.cites } : {}),
  } as GuidanceAsset;
}

function visit(nodeId: string, offsetMs: number): TraversalEventEnvelope {
  return {
    kind: 'full_payload_read',
    eventId: `event:${nodeId}:${offsetMs}`,
    sessionId: SESSION,
    at: new Date(T0 + offsetMs).toISOString(),
    visitId: `visit:${nodeId}:${offsetMs}`,
    nodeId,
  };
}

/** anchor → ceremony → principle, plus an artifact no chain reaches. */
const CORPUS: GuidanceAsset[] = [
  asset('inc-one', { cites: ['story:studio', 'asset:ceremony'] }),
  asset('ceremony', { standsOn: ['asset:principle'] }),
  asset('principle', { standsOn: ['doc:decisions/0363-the-knowledge-dag.md'] }),
  asset('orphan'),
];

const READY = { assets: CORPUS, assetsStatus: 'ready' as const, assetsError: '' };

describe('an unread corpus is UNMEASURED, never an empty verdict', () => {
  it('says so while /api/assets is still in flight', () => {
    const model = buildKnowledgeDepth({ assets: [], assetsStatus: 'loading', assetsError: '' });
    expect(model.status).toBe('unmeasured');
    // The trap: judging the empty in-flight collection would report every artifact unreachable over a
    // corpus of nothing, and the panel would render a real-looking verdict about a corpus it never saw.
    expect(reportKnowledgeDepth([visit('ceremony', 0)], model)).toBeNull();
    expect(markKnowledgeDepth(model, 'ceremony')).toBeNull();
    expect(anchorSummary(model)).toBeNull();
  });

  it('carries the failure reason verbatim when the read failed', () => {
    const model = buildKnowledgeDepth({
      assets: [],
      assetsStatus: 'error',
      assetsError: 'HTTP 503',
    });
    expect(model).toEqual({
      status: 'unmeasured',
      reason: 'the Library corpus could not be read — HTTP 503',
    });
  });

  it('distinguishes a resolved-and-genuinely-empty corpus from an unread one', () => {
    const model = buildKnowledgeDepth({ assets: [], assetsStatus: 'ready', assetsError: '' });
    expect(model.status).toBe('measured');
    // Measured, and the denominators say what was measured: nothing. A reader can tell this from a
    // corpus that was read and held no anchors, and from one that was never read at all.
    expect(anchorSummary(model)).toBe(
      '0 of 0 artifacts name a story or capability and anchor the walk; 0 artifacts have a depth at all',
    );
  });
});

describe('the three readings stay three', () => {
  const model = buildKnowledgeDepth(READY);

  it('annotates a reached artifact with its hop count', () => {
    expect(markKnowledgeDepth(model, 'ceremony')).toEqual({
      state: 'reached',
      depth: 1,
      attr: '1',
      label: 'knowledge depth 1 from the work',
    });
    expect(markKnowledgeDepth(model, 'principle')?.depth).toBe(2);
  });

  it('says depth 0 names the work itself rather than printing a bare 0', () => {
    expect(markKnowledgeDepth(model, 'inc-one')).toEqual({
      state: 'reached',
      depth: 0,
      attr: '0',
      label: 'knowledge depth 0 — this artifact names the work itself',
    });
  });

  it('never renders an UNREACHABLE artifact as a deep one', () => {
    const reading = markKnowledgeDepth(model, 'orphan');
    expect(reading?.state).toBe('unreachable');
    // No number at all — not Infinity, not maxDepth + 1. Rendering an unmeasured artifact as very
    // deep reports the exact opposite of the health signal this join exists to give.
    expect(reading?.depth).toBeNull();
    expect(reading?.attr).toBe('unreachable');
    expect(reading?.label).toContain('unmeasured');
  });

  it('keeps a non-artifact id apart from an unreachable artifact', () => {
    // Measured across this machine's whole trace index: 96 of 402 distinct visited ids are not
    // Library artifacts at all — story/capability ids, retired artifacts, CLI tokens.
    const reading = markKnowledgeDepth(model, 'forest-world');
    expect(reading?.state).toBe('absent');
    expect(reading?.attr).toBe('absent');
    expect(reading?.label).toBe('not a Library artifact — no knowledge depth');
  });

  it('has nothing to say about a mark carrying no node id', () => {
    expect(markKnowledgeDepth(model, null)).toBeNull();
  });
});

describe('the per-trace report counts DISTINCT artifacts', () => {
  const model = buildKnowledgeDepth(READY);

  it('counts each artifact once however often the session re-read it', () => {
    const report = reportKnowledgeDepth(
      [
        visit('ceremony', 0),
        visit('ceremony', 1_000),
        visit('ceremony', 2_000),
        visit('principle', 3_000),
        visit('orphan', 4_000),
        visit('forest-world', 5_000),
      ],
      model,
    );

    expect(report).toEqual({
      visited: 4,
      reached: 2,
      unreachable: 1,
      absent: 1,
      maxDepth: 2,
      buckets: [
        { depth: 1, count: 1 },
        { depth: 2, count: 1 },
      ],
    });
  });

  it('reports no maxDepth at all when nothing was reached, rather than a 0 that reads as shallow', () => {
    const report = reportKnowledgeDepth([visit('orphan', 0), visit('forest-world', 1)], model);
    expect(report?.reached).toBe(0);
    expect(report?.maxDepth).toBeNull();
    expect(report?.buckets).toEqual([]);
  });

  it('ignores events that are not context visits', () => {
    const search: TraversalEventEnvelope = {
      kind: 'search',
      eventId: 'event:search',
      sessionId: SESSION,
      at: new Date(T0).toISOString(),
      searchId: 'search:1',
      surfaceId: 'library-artifact',
      operation: 'library_artifact_list',
      resultNodeIds: ['ceremony'],
    };
    // A search RESULT is not a read: the ids it printed were offered, not visited, and counting them
    // would inflate the denominator with artifacts the session never opened.
    expect(reportKnowledgeDepth([search], model)?.visited).toBe(0);
  });
});

describe('the anchor line travels with every per-trace figure', () => {
  it('states how much of the corpus can anchor the walk at all', () => {
    expect(anchorSummary(buildKnowledgeDepth(READY))).toBe(
      '1 of 4 artifacts name a story or capability and anchor the walk; 3 artifacts have a depth at all',
    );
  });

  it('separates a corpus with no anchors from one that was never read', () => {
    const anchorless = buildKnowledgeDepth({
      assets: [asset('a', { standsOn: ['asset:b'] }), asset('b')],
      assetsStatus: 'ready',
      assetsError: '',
    });
    expect(anchorSummary(anchorless)).toBe(
      '0 of 2 artifacts name a story or capability and anchor the walk; 0 artifacts have a depth at all',
    );
    expect(anchorSummary(buildKnowledgeDepth({ assets: [], assetsStatus: 'loading', assetsError: '' }))).toBeNull();
  });
});
