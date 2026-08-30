// Red-green on the knowledge-depth JOIN (`traversal-panel-arc`, increment
// `traversal-panel-depth-from-surface`; ADR-0476, inside ADR-0363 D2's fence).
//
// The judge itself is proved next door in `@storytree/library` (`surface-depth.test.ts`) — the walk,
// the longest-chain rule, the surface clause, the cycle, the twin collapse, the denominators. What is
// under test HERE is the studio's half, and every case is one where a collapse would produce a
// confident wrong reading:
//
//   • an UNMEASURED corpus renders as unmeasured, never as "nothing was placed";
//   • the readings stay four — placed / unlinked / cyclic / not-an-artifact;
//   • the per-trace count is over DISTINCT artifacts, so a hot artifact cannot skew the distribution;
//   • the linkage line travels with every per-trace figure, so a thin count is read as a fact about
//     the corpus's wiring rather than about the session.

import { describe, it, expect } from 'vitest';
import { surfaceDepthOf } from '@storytree/library/surface-depth';
import type { GuidanceAsset, TraversalEventEnvelope } from '../types';
import {
  buildKnowledgeDepth,
  markKnowledgeDepth,
  linkageSummary,
  reportKnowledgeDepth,
} from './knowledgeDepth';

const SESSION = 'elegant-rosalind-2b9a05';
const T0 = Date.parse('2026-08-20T09:00:00.000Z');

function asset(
  id: string,
  extra: { dependsOn?: string[]; cites?: string[] } = {},
): GuidanceAsset {
  const doc: GuidanceAsset = {
    id,
    category: 'principle',
    title: id,
    description: id,
    body: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
  if (extra.dependsOn) doc.dependsOn = extra.dependsOn;
  if (extra.cites) doc.cites = extra.cites;
  return doc;
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

/** surface → ceremony → principle, plus an artifact no edge touches. */
const CORPUS: GuidanceAsset[] = [
  asset('inc-one', { cites: ['story:studio', 'asset:ceremony'] }),
  asset('ceremony', { dependsOn: ['asset:principle'] }),
  asset('principle', { dependsOn: ['doc:decisions/0363-the-knowledge-dag.md'] }),
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
    expect(linkageSummary(model)).toBeNull();
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
    // corpus that was read and held no edges, and from one that was never read at all.
    expect(linkageSummary(model)).toContain('0 of 0 knowledge artifacts sit in the dependency graph');
  });
});

describe('the four readings stay four', () => {
  const model = buildKnowledgeDepth(READY);

  it('annotates a placed artifact with its hop count', () => {
    expect(markKnowledgeDepth(model, 'ceremony')).toEqual({
      state: 'placed',
      depth: 1,
      attr: '1',
      label: 'knowledge depth 1 — 1 hop below the surface',
    });
    expect(markKnowledgeDepth(model, 'principle')?.depth).toBe(2);
  });

  it('says depth 0 names the surface itself rather than printing a bare 0', () => {
    expect(markKnowledgeDepth(model, 'inc-one')).toEqual({
      state: 'placed',
      depth: 0,
      attr: '0',
      label: 'knowledge depth 0 — this artifact sits at the surface, nothing points at it',
    });
  });

  it('never renders an UNLINKED artifact as one at the surface', () => {
    const reading = markKnowledgeDepth(model, 'orphan');
    expect(reading?.state).toBe('unlinked');
    // No number at all — not 0, not Infinity, not maxDepth + 1. `orphan` has no edge in either
    // direction, and rendering that as depth 0 would say "at the surface", which reads as health
    // and is the exact opposite of the signal this join exists to give (ADR-0476 D5).
    expect(reading?.depth).toBeNull();
    expect(reading?.attr).toBe('unlinked');
    expect(reading?.label).toContain('unmeasured');
  });

  it('keeps a non-artifact id apart from an unlinked artifact', () => {
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
      placed: 2,
      unlinked: 1,
      cyclic: 0,
      absent: 1,
      maxDepth: 2,
      buckets: [
        { depth: 1, count: 1 },
        { depth: 2, count: 1 },
      ],
    });
  });

  it('reports no maxDepth at all when nothing was placed, rather than a 0 that reads as at-the-surface', () => {
    const report = reportKnowledgeDepth([visit('orphan', 0), visit('forest-world', 1)], model);
    expect(report?.placed).toBe(0);
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

describe('the linkage line travels with every per-trace figure', () => {
  it('states how much of the KNOWLEDGE corpus sits in the graph at all', () => {
    expect(linkageSummary(buildKnowledgeDepth(READY))).toBe(
      '3 of 4 knowledge artifacts sit in the dependency graph; 1 surface opens a chain ' +
        '(0 of them decisions); 1 node carries no edge either way and has no depth at all. ' +
        '0 record rows (increments, friction, arcs, questions, templates) are excluded from that denominator.',
    );
  });

  it('excludes the record tiers from the denominator it prints (ADR-0476 D3)', () => {
    // THE `135/2623 anchored` FAILURE IN MINIATURE. Counting all five rows reports 3 of 5 and reads
    // as an indictment of the knowledge tiers; the honest figure is 3 of 4 with the log row named
    // separately. An increment is a record of work, not a node of the knowledge graph.
    const withRecords = buildKnowledgeDepth({
      assets: [...CORPUS, { ...asset('inc-99'), category: 'increment' as const }],
      assetsStatus: 'ready',
      assetsError: '',
    });
    const summary = linkageSummary(withRecords);
    expect(summary).toContain('3 of 4 knowledge artifacts sit in the dependency graph');
    expect(summary).toContain('1 record row');
  });

  it('separates a corpus with no edges from one that was never read', () => {
    const flat = buildKnowledgeDepth({
      assets: [asset('a'), asset('b')],
      assetsStatus: 'ready',
      assetsError: '',
    });
    expect(linkageSummary(flat)).toContain('0 of 2 knowledge artifacts sit in the dependency graph');
    expect(linkageSummary(flat)).toContain('2 nodes carry no edge either way');
    expect(linkageSummary(buildKnowledgeDepth({ assets: [], assetsStatus: 'loading', assetsError: '' }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DECISION LAYER (`traversal-panel-arc`, increments
// `traversal-panel-draws-the-decision-depth` and `traversal-panel-depth-from-surface`;
// ADR-0403 dec 4, ADR-0431 D1, ADR-0476).
//
// Two collapses, each of which produces a CONFIDENT WRONG reading rather than a missing one:
//
//   • the walk must continue THROUGH a decision, so depth stops being capped at the first `doc:`;
//   • a visited `adr-NNNN` must read its DECISION's depth. It is on the wire twice — once as the
//     artifact row `/api/assets` serves like any other, once as the walk's `decision:NNNN` node —
//     and every pointer at the decision resolves to the NODE, so nothing ever points at the twin.
//     Under a surface reading that is worse than it was under a work reading: an uncollapsed twin
//     has indegree 0 and therefore reads `placed, depth 0 — at the surface` about a decision at the
//     bottom of the chain. Exactly inverted, and it looks healthy.

/** An `adr` row exactly as `/api/assets` serves it — the artifact twin of a decision. */
function decisionAsset(number: number, dependsOn: string[] = []): GuidanceAsset {
  const id = `adr-${String(number).padStart(4, '0')}`;
  const doc: GuidanceAsset = {
    id,
    category: 'adr',
    title: `ADR-${String(number).padStart(4, '0')}`,
    description: id,
    body: '',
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
  if (dependsOn.length > 0) doc.dependsOn = dependsOn;
  return doc;
}

/**
 * surface(0) → ceremony(1) → ADR-0403(2) → ADR-0363(3).
 *
 * The chain crosses the artifact/decision boundary ONCE and then runs decision-to-decision, which is
 * the shape the live corpus has: half its dependency pointers terminate at a decision.
 */
const DECISION_CORPUS: GuidanceAsset[] = [
  asset('inc-one', { cites: ['story:studio', 'asset:ceremony'] }),
  asset('ceremony', { dependsOn: ['doc:decisions/0403-decisions-are-artifacts.md'] }),
  decisionAsset(403, ['doc:decisions/0363-the-knowledge-dag.md']),
  decisionAsset(363),
];

const DECISIONS_READY = {
  assets: DECISION_CORPUS,
  assetsStatus: 'ready' as const,
  assetsError: '',
};

describe('the walk continues THROUGH a decision', () => {
  it('does not stop at the first `doc:` pointer', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    expect(model.status).toBe('measured');
    if (model.status !== 'measured') return;
    // Artifact-only, this corpus is 1 node deep and the chain dies at `ceremony`. Walking the
    // decisions is what takes it to 3.
    expect(model.verdict.maxDepth).toBe(3);
    expect(model.verdict.decisionsScanned).toBe(2);
  });

  it('reports the decision denominators, so a resolver that sees nothing is not mistaken for a shallow log', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    // ASSERT the precondition before narrowing on it — the sibling above already does. Without this
    // line the early `return` makes the whole test VACUOUS whenever the model is not measured, which
    // is silent: it reports a pass having asserted nothing. Confirmed 2026-08-29 — with the builder
    // forced to measure nothing, 16 of this file's tests failed and this one passed.
    expect(model.status).toBe('measured');
    if (model.status !== 'measured') return;
    expect(model.verdict.decisionsScanned).toBe(2);
    // PRESENCE, not non-emptiness: ADR-0363 carries no `dependsOn` field at all, ADR-0403 does.
    expect(model.verdict.decisionsCarryingDependsOn).toBe(1);
  });

  it('counts each decision ONCE — the twin does not inflate the population', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    expect(model.status).toBe('measured');
    if (model.status !== 'measured') return;
    // Four rows on the wire, four nodes in the graph — not six. Leaving the twins in would add 468
    // phantom nodes to the live denominator and 468 phantom surfaces to the seed.
    expect(model.verdict.nodesScanned).toBe(4);
    expect(model.verdict.surfaces).toBe(1);
  });
});

describe('a visited decision reads its own depth, not its artifact twin`s', () => {
  it('reads `adr-NNNN` at the depth its DECISION node sits at', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    // The regression this guards: `adr-0403` IS on the wire as an ordinary artifact row, and nothing
    // points at that row, so an uncollapsed lookup answers `depth 0 — at the surface` about a
    // decision two hops down.
    expect(markKnowledgeDepth(model, 'adr-0403')).toMatchObject({ state: 'placed', depth: 2 });
    expect(markKnowledgeDepth(model, 'adr-0363')).toMatchObject({ state: 'placed', depth: 3 });
  });

  it('counts a trace`s decision reads as placed, and carries them into the deepest figure', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    const report = reportKnowledgeDepth(
      [visit('ceremony', 0), visit('adr-0403', 10), visit('adr-0363', 20)],
      model,
    );
    expect(report).toMatchObject({ visited: 3, placed: 3, unlinked: 0, absent: 0, maxDepth: 3 });
  });

  // A TRACE OLDER THAN ADR-0403 RECORDS THE DECISION FILE IT OPENED
  // (`traversal-panel-legacy-decision-reads-resolve`). 601 of this machine's 750 traces are that
  // era, and their decision reads were the largest single population reading ABSENT — 51 of one
  // trace's 77. The decision number is in the filename, so nothing about this is a guess.
  it('places a read recorded as the pre-ADR-0403 decision FILE at the same depth as the row id', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    // The exact shape the recorder wrote when an agent opened the decision with the file tool.
    expect(markKnowledgeDepth(model, 'doc:decisions/0403-decisions-are-artifacts.md')).toMatchObject({
      state: 'placed',
      depth: 2,
    });
    expect(
      markKnowledgeDepth(model, 'doc:docs/decisions/0363-the-knowledge-dag.md'),
    ).toMatchObject({ state: 'placed', depth: 3 });
    // IDENTICAL to the modern read, label and all — a decision's depth must not depend on how old
    // the trace asking about it is.
    expect(markKnowledgeDepth(model, 'doc:decisions/0403-decisions-are-artifacts.md')).toEqual(
      markKnowledgeDepth(model, 'adr-0403'),
    );
  });

  it('counts one decision ONCE when a trace read it under both spellings', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    const report = reportKnowledgeDepth(
      [
        visit('ceremony', 0),
        // A session spanning the migration: the same decision opened as a file, then as a row.
        visit('doc:decisions/0403-decisions-are-artifacts.md', 10),
        visit('adr-0403', 20),
      ],
      model,
    );
    // TWO distinct artifacts, not three. This report's contract is DISTINCT ARTIFACTS, so folding
    // after the dedup would count one decision twice — once placed and once absent — and inflate
    // the very denominator the panel prints its placed count over.
    expect(report).toMatchObject({ visited: 2, placed: 2, absent: 0, maxDepth: 2 });
  });

  it('leaves an unresolvable legacy path ABSENT rather than guessing it onto a decision', () => {
    const model = buildKnowledgeDepth(DECISIONS_READY);
    const report = reportKnowledgeDepth(
      [
        visit('doc:decisions/no-number-in-this-name.md', 0),
        visit('doc:docs/research/a-note.md', 10),
        // Well formed, and this corpus does not hold ADR-0009. Absent is not depth 0.
        visit('doc:decisions/0009-not-in-this-corpus.md', 20),
      ],
      model,
    );
    expect(report).toMatchObject({ visited: 3, placed: 0, absent: 3, maxDepth: null });
  });

  it('still says UNLINKED for a decision no edge touches — the readings stay four', () => {
    const model = buildKnowledgeDepth({
      assets: [...DECISION_CORPUS, decisionAsset(9999)],
      assetsStatus: 'ready',
      assetsError: '',
    });
    // In the corpus, touched by nothing. Never rendered as at-the-surface, and never as absent.
    expect(markKnowledgeDepth(model, 'adr-9999')).toMatchObject({ state: 'unlinked' });
    // And a decision the corpus does not hold at all is ABSENT, not unlinked — a fact about the
    // id, not about the wiring.
    expect(markKnowledgeDepth(model, 'adr-0001')).toMatchObject({ state: 'absent' });
  });

  it('leaves a non-decision `adr-`prefixed id alone', () => {
    const model = buildKnowledgeDepth({
      assets: [...DECISION_CORPUS, asset('adr-health-notes')],
      assetsStatus: 'ready',
      assetsError: '',
    });
    // `adr-health-notes` is a legal artifact id that is NOT a decision. Rounding it to the nearest
    // decision number is the confident-wrong-answer failure `adrNumberOfArtifactId` guards.
    expect(markKnowledgeDepth(model, 'adr-health-notes')).toMatchObject({ state: 'unlinked' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CASES `check:mutation-diff` NAMED. Each block covers a line whose mutant survived the first
// version of this adapter — behaviour that was real but unpinned. The `cyclic` reading in
// particular had NO COVERAGE at all: it is provably empty over the live corpus, so nothing
// exercised it, and a state nothing exercises is a state that can be deleted in silence.

/** Two artifacts pointing at each other — the one shape that produces a `cyclic` reading. */
const CYCLIC_CORPUS: GuidanceAsset[] = [
  asset('loop-a', { dependsOn: ['asset:loop-b'] }),
  asset('loop-b', { dependsOn: ['asset:loop-a'] }),
  asset('opening', { dependsOn: ['asset:loop-a'] }),
];

describe('the CYCLIC reading is rendered, not silently folded into another state', () => {
  const model = buildKnowledgeDepth({
    assets: CYCLIC_CORPUS,
    assetsStatus: 'ready',
    assetsError: '',
  });

  it('marks a node under a cycle as cyclic — not placed, not unlinked', () => {
    const reading = markKnowledgeDepth(model, 'loop-a');
    expect(reading?.state).toBe('cyclic');
    // No number. A cycle has no longest chain, so any depth here would be a fabrication — and
    // folding it into `unlinked` would report "nothing links to this" about an artifact two
    // pointers reach.
    expect(reading?.depth).toBeNull();
    expect(reading?.attr).toBe('cyclic');
    expect(reading?.label).toContain('cycle');
    expect(reading?.label).toContain('unmeasured');
  });

  it('counts cyclic reads in their own column of the per-trace report', () => {
    const report = reportKnowledgeDepth(
      [visit('opening', 0), visit('loop-a', 10), visit('loop-b', 20), visit('forest-world', 30)],
      model,
    );
    expect(report).toEqual({
      visited: 4,
      placed: 1,
      unlinked: 0,
      cyclic: 2,
      absent: 1,
      maxDepth: 0,
      buckets: [{ depth: 0, count: 1 }],
    });
  });
});

describe('the per-trace states are counted into the RIGHT columns', () => {
  it('keeps unlinked, cyclic and absent in three separate columns', () => {
    // One of each, plus a placed one. A single mis-routed branch shows up as a 2 in one column and
    // a 0 in another, which every aggregate assertion would still pass.
    const model = buildKnowledgeDepth({
      assets: [...CYCLIC_CORPUS, asset('floater'), asset('floor')],
      assetsStatus: 'ready',
      assetsError: '',
    });
    const report = reportKnowledgeDepth(
      [visit('opening', 0), visit('floater', 10), visit('loop-a', 20), visit('not-an-artifact', 30)],
      model,
    );
    expect(report?.placed).toBe(1);
    expect(report?.unlinked).toBe(1);
    expect(report?.cyclic).toBe(1);
    expect(report?.absent).toBe(1);
  });
});

describe('the hover label agrees in number with the depth it reports', () => {
  const model = buildKnowledgeDepth(READY);

  it('says one hop for depth 1 and hops for anything else', () => {
    expect(markKnowledgeDepth(model, 'ceremony')?.label).toBe(
      'knowledge depth 1 — 1 hop below the surface',
    );
    expect(markKnowledgeDepth(model, 'principle')?.label).toBe(
      'knowledge depth 2 — 2 hops below the surface',
    );
  });
});

describe('the linkage line agrees in number with the counts it reports', () => {
  it('reads in the singular when every count is one', () => {
    // One knowledge artifact linked of one, one surface, one unlinked node, one record row.
    const model = buildKnowledgeDepth({
      assets: [
        // The record row sits INSIDE the chain — pointed at, and pointing on — so it is neither a
        // surface nor unlinked, and each count below isolates exactly one node.
        asset('opening', { dependsOn: ['asset:inc-1'] }),
        { ...asset('inc-1', { dependsOn: ['asset:floor'] }), category: 'increment' as const },
        asset('floor'),
        asset('lonely'),
      ],
      assetsStatus: 'ready',
      assetsError: '',
    });
    const summary = linkageSummary(model) ?? '';
    expect(summary).toContain('2 of 3 knowledge artifacts sit in');
    expect(summary).toContain('1 surface opens a chain');
    expect(summary).toContain('1 node carries no edge either way and has no depth at all');
    expect(summary).toContain('1 record row');
    expect(summary).toContain('is excluded from that denominator');
  });

  it('reads in the plural when the counts are not one', () => {
    const model = buildKnowledgeDepth({
      assets: [
        asset('opening-a', { dependsOn: ['asset:inc-1'] }),
        { ...asset('inc-1', { dependsOn: ['asset:floor-a'] }), category: 'increment' as const },
        asset('floor-a'),
        asset('opening-b', { dependsOn: ['asset:inc-2'] }),
        { ...asset('inc-2', { dependsOn: ['asset:floor-b'] }), category: 'increment' as const },
        asset('floor-b'),
        asset('lonely-one'),
        asset('lonely-two'),
      ],
      assetsStatus: 'ready',
      assetsError: '',
    });
    const summary = linkageSummary(model) ?? '';
    expect(summary).toContain('4 of 6 knowledge artifacts sit in');
    expect(summary).toContain('2 surfaces open a chain');
    expect(summary).toContain('2 nodes carry no edge either way and have no depth at all');
    expect(summary).toContain('2 record rows');
    expect(summary).toContain('are excluded from that denominator');
  });
});

describe('the linkage line agrees in number with a ONE-artifact knowledge corpus', () => {
  it('says "artifact sits" when the knowledge denominator itself is one', () => {
    // Every earlier case has two or more knowledge rows, so the singular half of THIS clause — the
    // denominator's own noun — was never rendered. One knowledge artifact, one record row.
    const model = buildKnowledgeDepth({
      assets: [
        { ...asset('inc-1', { dependsOn: ['asset:only-one'] }), category: 'increment' as const },
        asset('only-one'),
      ],
      assetsStatus: 'ready',
      assetsError: '',
    });
    expect(linkageSummary(model)).toContain('1 of 1 knowledge artifact sits in the dependency graph');
  });
});

// ── THE AGENT MANIFEST ON THE WIRE (ADR-0481 D1) ─────────────────────────────────────────────────
//
// The half most able to regress in silence. The panel is handed `renderStoredDoc` output, where an
// agent's refLists arrive NESTED under `fields` and JOINED into one newline-delimited string — a
// shape nothing else on this wire wears. A reader that took the wire's top level found ZERO of the
// 116 live manifest targets and reported a confident, plausible, wrong answer.
//
// So this asserts the PANEL's model over the PANEL's input shape. `agent-manifest.test.ts` already
// covers the reader itself; covering it twice at that altitude would leave exactly this seam — the
// studio's own projection from `GuidanceAsset` — untested.
describe('an agent manifest is an edge of the panel`s reading', () => {
  const agentAsset: GuidanceAsset = {
    id: 'session-orchestrator',
    category: 'agent',
    title: 'session-orchestrator',
    description: 'the session agent',
    body: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    // The live wire shape, transcribed rather than invented: newline-joined, `asset:`-prefixed,
    // under `fields`. Typed `Record<string, string>` there, which is exactly why the reader must
    // accept a string as readily as an array.
    fields: { rules: 'asset:register-follows-audience\nasset:never-bypass-the-gate' },
  };

  it('links what the agent injects, read off the nested `fields`', () => {
    const model = buildKnowledgeDepth({
      assets: [agentAsset, asset('register-follows-audience'), asset('never-bypass-the-gate')],
      assetsStatus: 'ready',
      assetsError: '',
    });

    expect(model.status).toBe('measured');
    if (model.status !== 'measured') return;
    // Before ADR-0481 all three read `unlinked`: the agent pointed at nothing the walk could see, so
    // it was not even a surface, and the panel reported "nothing was measured" over a wired triple.
    expect(model.verdict.unlinked).toBe(0);
    expect(model.verdict.manifestEdges).toBe(2);
    expect(model.verdict.surfaces).toBe(1);
    expect(surfaceDepthOf(model.verdict, 'session-orchestrator')).toEqual({ state: 'placed', depth: 0 });
    expect(surfaceDepthOf(model.verdict, 'register-follows-audience')).toEqual({ state: 'placed', depth: 1 });
  });

  it('does not read a manifest-shaped field on a row that is not an agent', () => {
    // 26 `open-question` rows carry a `context` field of prose. Splitting that on newlines without
    // the kind gate manufactures pointers out of English sentences.
    const question: GuidanceAsset = {
      ...agentAsset,
      id: 'oq-something',
      category: 'open-question',
      fields: { context: 'asset:register-follows-audience' },
    };
    const model = buildKnowledgeDepth({
      assets: [question, asset('register-follows-audience')],
      assetsStatus: 'ready',
      assetsError: '',
    });

    expect(model.status).toBe('measured');
    if (model.status !== 'measured') return;
    expect(model.verdict.manifestEdges).toBe(0);
    expect(model.verdict.unlinked).toBe(2);
  });
});
