// The drawn vertical axis (`traversal-panel-depth-on-the-axis`, ADR-0482 D1–D3).
//
// Every assertion here is written so the PLAUSIBLE WRONG implementation fails it. The wrong one is
// short and type-checks: `reading?.depth ?? 0`. It draws every unlinked, cyclic and absent read at the
// surface, and the picture then says "everything is at the surface" — which reads as health and is
// the exact inversion `surface-depth.ts` refuses.

import { describe, expect, it } from 'vitest';

import type { KnowledgeDepthReport, MarkKnowledgeDepth } from './knowledgeDepth';
import {
  axisCaption,
  axisRowLabel,
  buildKnowledgeAxis,
  knowledgeAxisRow,
  TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH,
} from './traversalKnowledgeAxis';

function report(over: Partial<KnowledgeDepthReport> = {}): KnowledgeDepthReport {
  return {
    visited: 0,
    placed: 0,
    unlinked: 0,
    cyclic: 0,
    absent: 0,
    maxDepth: null,
    buckets: [],
    ...over,
  };
}

const placed = (depth: number): MarkKnowledgeDepth => ({
  state: 'placed',
  depth,
  attr: String(depth),
  label: `knowledge depth ${String(depth)}`,
});

const unmeasured = (state: 'unlinked' | 'cyclic' | 'absent'): MarkKnowledgeDepth => ({
  state,
  depth: null,
  attr: state,
  label: `knowledge depth unmeasured — ${state}`,
});

describe('the axis extent', () => {
  it('sizes to the trace`s own deepest reading, plus one row for the unmeasured', () => {
    const axis = buildKnowledgeAxis(report({ visited: 40, placed: 30, absent: 10, maxDepth: 5 }));
    expect(axis).toMatchObject({ depthRows: 5, deepest: 5, clamped: false, measured: true });
    // Rows BELOW the surface: five depth rows and the unmeasured row under them. The surface itself
    // is the spine and is not counted here — it is the picture's own baseline.
    expect(axis.unmeasuredRow).toBe(6);
    expect(axis.rows).toBe(6);
  });

  it('reports a trace that placed NOTHING as deepest null, never as deepest 0', () => {
    const axis = buildKnowledgeAxis(report({ visited: 12, absent: 12, maxDepth: null }));
    // `0` here would read as "every read sat at the surface" about a trace where no read was placed
    // at all. The two are different facts and the panel prints them differently.
    expect(axis.deepest).toBeNull();
    expect(axis.depthRows).toBe(0);
    // The unmeasured row still exists — it is where all twelve of those reads draw.
    expect(axis.unmeasuredRow).toBe(1);
  });

  it('collapses to a SINGLE COLUMN when the corpus was not read, and says which case that is', () => {
    const axis = buildKnowledgeAxis(null);
    expect(axis).toEqual({
      depthRows: 0,
      deepest: null,
      clamped: false,
      measured: false,
      unmeasuredRow: 0,
      rows: 0,
    });
    expect(axisCaption(axis)).toContain('the Library corpus was not read');
  });

  it('clamps the DRAWN rows and still reports the real depth, so the clamp is never the ceiling', () => {
    const deep = TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH + 1;
    const axis = buildKnowledgeAxis(report({ visited: 3, placed: 3, maxDepth: deep }));
    expect(axis.depthRows).toBe(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH);
    expect(axis.deepest).toBe(deep);
    expect(axis.clamped).toBe(true);
    // The reachability of this case is not hypothetical: the live corpus measured 17 deep on
    // 2026-08-30, one below which the clamp deliberately sits.
    expect(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH).toBeLessThan(17);
  });

  it('does not report a clamp that did not bite', () => {
    const axis = buildKnowledgeAxis(
      report({ visited: 3, placed: 3, maxDepth: TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH }),
    );
    expect(axis.clamped).toBe(false);
    expect(axis.depthRows).toBe(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH);
  });
});

describe('which row a read draws on', () => {
  const axis = buildKnowledgeAxis(report({ visited: 20, placed: 12, absent: 8, maxDepth: 4 }));

  it('draws a placed read at its own depth', () => {
    expect(knowledgeAxisRow(axis, placed(0))).toBe(0);
    expect(knowledgeAxisRow(axis, placed(3))).toBe(3);
    expect(knowledgeAxisRow(axis, placed(4))).toBe(4);
  });

  it('NEVER draws an unmeasured read at row 0 — that is the whole rule (ADR-0482 D3)', () => {
    // The three states are not shallow, they are the absence of a reading. `reading.depth ?? 0` files
    // all three at the surface, type-checks, and inverts what the picture says.
    for (const state of ['unlinked', 'cyclic', 'absent'] as const) {
      const row = knowledgeAxisRow(axis, unmeasured(state));
      expect(row).not.toBe(0);
      expect(row).toBe(axis.unmeasuredRow);
    }
  });

  it('puts the unmeasured row BELOW every depth row, not among them', () => {
    expect(axis.unmeasuredRow).toBeGreaterThan(axis.depthRows);
    expect(knowledgeAxisRow(axis, unmeasured('absent'))).toBeGreaterThan(knowledgeAxisRow(axis, placed(4)));
  });

  it('stacks a read deeper than the clamp on the last DEPTH row, never on the unmeasured one', () => {
    const row = knowledgeAxisRow(axis, placed(99));
    expect(row).toBe(axis.depthRows);
    // The distinction that matters: a very deep read is measured. Letting the clamp push it onto the
    // unmeasured row would turn "deeper than we draw" into "we have no reading", which is a different
    // and much worse claim.
    expect(row).not.toBe(axis.unmeasuredRow);
  });

  it('sends a PLACED reading carrying no number to the unmeasured row, never to the surface', () => {
    // `MarkKnowledgeDepth` is a flat record, so `depth` is `number | null` on every state — the shape
    // permits `placed` with no number even though `markKnowledgeDepth` never produces one. The guard
    // exists so that if such a reading ever arrives it falls to UNMEASURED, which is the direction
    // that does not read as health. `Math.min(rows, null)` is 0, so dropping the guard files it at
    // the surface silently.
    const malformed = { state: 'placed', depth: null, attr: '?', label: '?' } as const;
    expect(knowledgeAxisRow(axis, malformed)).toBe(axis.unmeasuredRow);
    expect(knowledgeAxisRow(axis, malformed)).not.toBe(0);
  });

  it('sits a read with no reading at all on the spine — a search, or an unread corpus', () => {
    // `markKnowledgeDepth` answers null for a search (it reads no single node) and for an unmeasured
    // model. Both sat on the spine before this axis existed and still do.
    expect(knowledgeAxisRow(axis, null)).toBe(0);
    expect(knowledgeAxisRow(buildKnowledgeAxis(null), null)).toBe(0);
  });
});

describe('the axis says what it is', () => {
  const axis = buildKnowledgeAxis(report({ visited: 20, placed: 12, absent: 8, maxDepth: 4 }));

  it('names row 0 the surface, never `depth 0`', () => {
    // ADR-0482 D2: naming the top row with a number invites reading the column as a session descent
    // from nowhere, which is the claim the reversed clause exists to prevent.
    expect(axisRowLabel(axis, 0)).toBe('surface');
    expect(axisRowLabel(axis, 1)).toBe('1 hop');
    expect(axisRowLabel(axis, 4)).toBe('4 hops');
    expect(axisRowLabel(axis, axis.unmeasuredRow)).toBe('unmeasured');
  });

  it('marks the last drawn row as open-ended when the clamp bit', () => {
    const clamped = buildKnowledgeAxis(
      report({ visited: 3, placed: 3, maxDepth: TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH + 5 }),
    );
    expect(axisRowLabel(clamped, clamped.depthRows)).toBe(
      `${String(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH)}+ hops`,
    );
  });

  it('states CORPUS distance and disclaims the session`s own route', () => {
    // The labelling IS the preserved intent of ADR-0354 clause 5 (ADR-0482 D2), so this assertion is
    // a contract and not a wording preference.
    const caption = axisCaption(axis);
    expect(caption).toContain('CORPUS distance');
    expect(caption).toContain('never the route this session took');
    expect(caption).toContain('this session reached 4');
  });

  it('states the real depth beside the drawn one when they differ', () => {
    const clamped = buildKnowledgeAxis(
      report({ visited: 3, placed: 3, maxDepth: TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH + 5 }),
    );
    expect(axisCaption(clamped)).toContain(
      `drawn to ${String(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH)} hops, this session reached ${String(
        TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH + 5,
      )}`,
    );
  });

  it('says a trace with nothing placed has no depth, rather than reporting a depth of 0', () => {
    expect(axisCaption(buildKnowledgeAxis(report({ visited: 5, absent: 5 })))).toContain(
      'nothing this session read has a depth',
    );
  });
});
