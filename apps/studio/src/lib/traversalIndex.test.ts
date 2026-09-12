// The trace index list's proof (`traversal-panel-arc`, increment `traversal-panel-trace-index-list`).
//
// The claim-join is withdrawn (ADR-0354 D2), so what is under test here is that the HONESTY the join
// carried survived the withdrawal — that is the whole risk of this increment. Four things:
//
//   1. PENDING, FAILED and EMPTY stay three distinct states, never collapsed into each other;
//   2. an empty index is a real, confident observation and says where it looked;
//   3. ordering is newest-observed-first and TOTAL, so it cannot churn between two reads;
//   4. a row with no usable timestamp is OFFERED AND EXPLAINED, not dropped and not back-dated to
//      the epoch — the failure mode the nullable `lastObservedAt` exists to prevent.

import { describe, it, expect } from 'vitest';
import {
  buildTraversalTraceList,
  traceAgeLabel,
  traceArcLabel,
  traceArcState,
  traceArcTitle,
  type TraversalIndexState,
  type TraversalTraceRow,
} from './traversalIndex';
import type { TraversalSessionEntry, TraversalSessionsPayload } from '../types';

const TRACE_DIR = '/home/op/.storytree/traces';

function read(
  sessions: TraversalSessionsPayload['sessions'],
  arcsResolved = true,
): TraversalIndexState {
  return { status: 'read', payload: { dir: TRACE_DIR, arcsResolved, sessions } };
}

function entry(
  sessionId: string,
  lastObservedAt: string | null,
  eventCount = 10,
): TraversalSessionsPayload['sessions'][number] {
  return { sessionId, eventCount, lastObservedAt, units: [], arcs: [] };
}

describe('buildTraversalTraceList — the three absences stay three', () => {
  it('reports a read still in flight as PENDING, which is not an answer about traces', () => {
    const list = buildTraversalTraceList({ status: 'pending' });
    if (list.state !== 'pending') throw new Error('expected a pending index');
    expect(list.note).toMatch(/reading/i);
    // The one thing it must never do: present an unfinished read as an empty machine.
    expect(list.note).not.toMatch(/no traces/i);
  });

  it('reports a refused route as FAILED, and disclaims any statement about the trace dir', () => {
    const list = buildTraversalTraceList({ status: 'failed', message: 'HTTP 500' });
    if (list.state !== 'failed') throw new Error('expected a failed index');
    expect(list.note).toContain('HTTP 500');
    // Blaming the trace dir for the server's silence sends an operator to the wrong place.
    expect(list.note).toMatch(/says nothing about whether traces exist/i);
  });

  it('reports an index that answered `{sessions: []}` as EMPTY — a real observation, naming the dir', () => {
    const list = buildTraversalTraceList(read([]));
    expect(list.state).toBe('empty');
    if (list.state !== 'empty') throw new Error('unreachable');
    // `dir` travels with the answer: "no traces" and "no traces HERE" are different facts, and only
    // the second gives an operator something to check.
    expect(list.dir).toBe(TRACE_DIR);
    expect(list.note).toContain(TRACE_DIR);
  });

  it('never renders the hosted studio’s legitimately empty answer as an error', () => {
    const list = buildTraversalTraceList(read([]));
    expect(list.state).not.toBe('failed');
  });
});

describe('buildTraversalTraceList — newest observed first, and stable', () => {
  it('orders by last observation, newest first, with no claim and no story involved', () => {
    const list = buildTraversalTraceList(
      read([
        entry('older', '2026-08-01T10:00:00.000Z'),
        entry('newest', '2026-08-12T10:00:00.000Z'),
        entry('middle', '2026-08-06T10:00:00.000Z'),
      ]),
    );
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.rows.map((row) => row.sessionId)).toEqual(['newest', 'middle', 'older']);
  });

  it('heads the rail with the count, singular and plural', () => {
    const many = buildTraversalTraceList(read([entry('a', null), entry('b', null)]));
    const one = buildTraversalTraceList(read([entry('a', null)]));
    if (many.state !== 'listed' || one.state !== 'listed') throw new Error('expected listed');
    expect(many.heading).toBe('2 local traces');
    expect(one.heading).toBe('1 local trace');
  });

  it('breaks ties on session id, so re-reading the same directory cannot reshuffle the rail', () => {
    const sessions = [
      entry('charlie', '2026-08-12T10:00:00.000Z'),
      entry('alpha', '2026-08-12T10:00:00.000Z'),
      entry('bravo', '2026-08-12T10:00:00.000Z'),
    ];
    const first = buildTraversalTraceList(read(sessions));
    // The route answers from an incremental index (PR #1288), so the ARRIVAL order of equal-stamped
    // entries is not guaranteed stable — the ordering must be total, not merely mostly-decided.
    const second = buildTraversalTraceList(read([...sessions].reverse()));
    if (first.state !== 'listed' || second.state !== 'listed') throw new Error('expected listed');
    expect(first.rows.map((r) => r.sessionId)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(second.rows.map((r) => r.sessionId)).toEqual(first.rows.map((r) => r.sessionId));
  });

  it('OFFERS a trace with no usable timestamp, sorted last rather than dropped or back-dated', () => {
    const list = buildTraversalTraceList(
      read([entry('undated', null), entry('dated', '2026-08-12T10:00:00.000Z')]),
    );
    if (list.state !== 'listed') throw new Error('expected a listed index');
    // Offered — the operator can SEE it is here. Last — it cannot be placed on the axis the order
    // is about. Never first, which is what sorting `null` to the epoch would eventually produce.
    expect(list.rows.map((r) => r.sessionId)).toEqual(['dated', 'undated']);
  });

  it('treats an unparseable timestamp exactly like a missing one, never as 1970', () => {
    const list = buildTraversalTraceList(
      read([entry('broken', 'not-a-date'), entry('dated', '2026-08-12T10:00:00.000Z')]),
    );
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.rows.map((r) => r.sessionId)).toEqual(['dated', 'broken']);
  });

  it('carries the index’s own event counts through without re-counting them', () => {
    const list = buildTraversalTraceList(read([entry('a', '2026-08-12T10:00:00.000Z', 386)]));
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.rows[0]?.eventCount).toBe(386);
  });
});

describe('traceAgeLabel — relative to the newest trace, never to the wall clock', () => {
  const newest: TraversalTraceRow = {
    sessionId: 'newest',
    eventCount: 1,
    lastObservedAt: '2026-08-12T10:00:00.000Z',
    units: [],
    arcs: [],
  };

  function rowAt(at: string | null): TraversalTraceRow {
    return { sessionId: 'row', eventCount: 1, lastObservedAt: at, units: [], arcs: [] };
  }

  it('labels the newest row as such rather than "0s earlier"', () => {
    expect(traceAgeLabel(newest, newest)).toBe('newest');
  });

  it('measures each row against the newest trace, so an all-old machine still reads its ordering', () => {
    expect(traceAgeLabel(rowAt('2026-08-12T09:55:00.000Z'), newest)).toBe('5m earlier');
    expect(traceAgeLabel(rowAt('2026-08-12T09:59:15.000Z'), newest)).toBe('45s earlier');
    expect(traceAgeLabel(rowAt('2026-08-12T06:40:00.000Z'), newest)).toBe('3h20m earlier');
    expect(traceAgeLabel(rowAt('2026-07-31T10:00:00.000Z'), newest)).toBe('12d earlier');
  });

  it('drops the minutes from a whole-hour span rather than printing "3h00m"', () => {
    expect(traceAgeLabel(rowAt('2026-08-12T07:00:00.000Z'), newest)).toBe('3h earlier');
  });

  it('says a row has no timestamp instead of borrowing the neighbour’s', () => {
    expect(traceAgeLabel(rowAt(null), newest)).toBe('no timestamp recorded');
    expect(traceAgeLabel(rowAt('not-a-date'), newest)).toBe('no timestamp recorded');
  });

  it('never produces a negative span if a row somehow post-dates the head of the list', () => {
    expect(traceAgeLabel(rowAt('2026-08-12T11:00:00.000Z'), newest)).toBe('newest');
  });
});

describe('traceArcState — the four honest answers, and the two that must never collapse', () => {
  function row(units: string[], arcs: string[]): TraversalTraceRow {
    return { sessionId: 's', eventCount: 1, lastObservedAt: null, units, arcs };
  }

  it('ONE arc reads as that arc', () => {
    expect(traceArcState(row(['map-arc-inc-01'], ['map-arc']), true)).toEqual({
      state: 'arcs',
      arcs: ['map-arc'],
    });
    expect(traceArcLabel(row(['map-arc-inc-01'], ['map-arc']), true)).toBe('map-arc');
  });

  it('SEVERAL arcs are LISTED, never reduced to one', () => {
    const several = row(['inc-a', 'inc-b'], ['map-arc', 'art-arc']);
    expect(traceArcState(several, true)).toEqual({ state: 'arcs', arcs: ['map-arc', 'art-arc'] });
    // Both names reach the label. A rail that showed the first and dropped the second would be
    // making an editorial call the record does not support.
    expect(traceArcLabel(several, true)).toContain('map-arc');
    expect(traceArcLabel(several, true)).toContain('art-arc');
    expect(traceArcTitle(several, true)).toMatch(/2 arcs/);
  });

  it('WORKED ON NO ARC and ARC NOT RECORDED never collapse — different states, different words', () => {
    // ⚠ The load-bearing case (ADR-0541 D4). Both have an empty arc list. Collapsing them reports
    // known work as unknown and inflates September's apparent unknown share from 13% to 33%.
    const noArc = row(['forest-rendering-engine'], []);
    const unrecorded = row([], []);

    expect(traceArcState(noArc, true).state).toBe('no-arc');
    expect(traceArcState(unrecorded, true).state).toBe('unrecorded');

    expect(traceArcLabel(noArc, true)).toMatch(/no arc/);
    // And it NAMES the unit, so the claim is checkable rather than merely asserted.
    expect(traceArcLabel(noArc, true)).toContain('forest-rendering-engine');
    expect(traceArcLabel(unrecorded, true)).toBe('arc not recorded');
    expect(traceArcLabel(noArc, true)).not.toBe(traceArcLabel(unrecorded, true));

    // The long forms differ too — an operator hovering either one is told which fact they have.
    expect(traceArcTitle(noArc, true)).toMatch(/recorded fact about the work/);
    expect(traceArcTitle(unrecorded, true)).toMatch(/never recorded/);
  });

  it('a silent corpus is UNRESOLVED, never "worked on no arc"', () => {
    // The offline json backend holds no arcs at all. Reporting that absence as a fact about the
    // work would be a positive claim made on the strength of a store that never answered.
    const claimed = row(['some-capability'], []);
    expect(traceArcState(claimed, false)).toEqual({
      state: 'unresolved',
      units: ['some-capability'],
    });
    expect(traceArcLabel(claimed, false)).toMatch(/unresolved/);
    expect(traceArcLabel(claimed, false)).not.toMatch(/no arc/);
  });

  it('a session that recorded NOTHING reads the same however the corpus answered', () => {
    // A silent store changes nothing about an absence that is the session's own — blaming the store
    // for it would send an operator to check the wrong thing.
    expect(traceArcState(row([], []), false).state).toBe('unrecorded');
    expect(traceArcState(row([], []), true).state).toBe('unrecorded');
  });

  it('the unrecorded title says WHY it is blank, and that nothing will be inferred to fill it', () => {
    // The older two-thirds of the list reads blank permanently and by choice (ADR-0541 D5). An
    // operator who is not told that reasonably assumes it is a defect awaiting a fix.
    expect(traceArcTitle(row([], []), true)).toMatch(/going forward/i);
    expect(traceArcTitle(row([], []), true)).toMatch(/pooled worktree slot/i);
  });
});

describe('buildTraversalTraceList — the arc fields survive the fold', () => {
  it('carries units and arcs onto every row, and the payload flag onto the list', () => {
    const list = buildTraversalTraceList(
      read([
        {
          sessionId: 'a',
          eventCount: 3,
          lastObservedAt: '2026-09-05T10:00:00.000Z',
          units: ['map-arc-inc-01'],
          arcs: ['map-arc'],
        },
      ]),
    );
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.arcsResolved).toBe(true);
    expect(list.rows[0]?.units).toEqual(['map-arc-inc-01']);
    expect(list.rows[0]?.arcs).toEqual(['map-arc']);
  });

  it('an unflagged payload is treated as UNRESOLVED, not as a resolved empty', () => {
    // The safe direction for an unknown is the one that refuses to print a positive claim.
    const list = buildTraversalTraceList(read([entry('a', null)], false));
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.arcsResolved).toBe(false);
  });
});

describe('traceArcLabel / traceArcTitle — the exact words, because the words ARE the distinction', () => {
  function row(units: string[], arcs: string[]): TraversalTraceRow {
    return { sessionId: 's', eventCount: 1, lastObservedAt: null, units, arcs };
  }

  it('ONE arc: the label is the arc name alone, and the title names the unit that placed it there', () => {
    const r = row(['map-arc-inc-01'], ['map-arc']);
    expect(traceArcLabel(r, true)).toBe('map-arc');
    expect(traceArcTitle(r, true)).toBe(
      'Worked on the arc map-arc — recorded by the session itself (map-arc-inc-01).',
    );
  });

  it('ONE arc reached by TWO units names both, separated — the arc is one, the work was not', () => {
    // The ordinary shape once `noticeboard declare` records at claim time: a session claims two
    // capabilities that live on the same arc. The label is still one arc; the title must not run the
    // two units together into a name nobody can look up.
    const r = row(['cap-a', 'cap-b'], ['map-arc']);
    expect(traceArcLabel(r, true)).toBe('map-arc');
    expect(traceArcTitle(r, true)).toBe(
      'Worked on the arc map-arc — recorded by the session itself (cap-a, cap-b).',
    );
  });

  it('SEVERAL arcs: both names, separated, and the title says none was picked as the winner', () => {
    const r = row(['inc-a', 'inc-b'], ['map-arc', 'art-arc']);
    expect(traceArcLabel(r, true)).toBe('map-arc · art-arc');
    expect(traceArcTitle(r, true)).toBe(
      'Worked across 2 arcs: map-arc, art-arc — every one listed, none picked as the winner.',
    );
  });

  it('NO ARC: the label says so AND names the units, so the claim is checkable', () => {
    const r = row(['forest-rendering-engine', 'terminal-capture-activation'], []);
    expect(traceArcLabel(r, true)).toBe('no arc · forest-rendering-engine · terminal-capture-activation');
    expect(traceArcTitle(r, true)).toBe(
      'Claimed real work belonging to NO arc: forest-rendering-engine, terminal-capture-activation. ' +
        'That is a recorded fact about the work, not missing data.',
    );
  });

  it('NOT RECORDED: a fixed sentence that says the blank is permanent and will not be inferred away', () => {
    const r = row([], []);
    expect(traceArcLabel(r, true)).toBe('arc not recorded');
    expect(traceArcTitle(r, true)).toBe(
      'This session never recorded what it was working on. Traces are attributed going forward ' +
        'only — no arc is ever inferred from a pooled worktree slot (ADR-0541 D3).',
    );
  });

  it('UNRESOLVED: the store, not the work, is what could not answer — and the units still show', () => {
    const r = row(['some-capability', 'another-one'], []);
    expect(traceArcLabel(r, false)).toBe('arc unresolved · some-capability · another-one');
    expect(traceArcTitle(r, false)).toBe(
      'Recorded some-capability, another-one, but the corpus could not be consulted, so these are ' +
        'unresolved rather than unhomed.',
    );
  });

  it('the separators are real: two units do not run together into one name', () => {
    // The label's join is the only thing keeping `no arc · a · b` from reading as one unit `ab`,
    // and the title's is the only thing keeping `a, b` from reading as `ab`.
    expect(traceArcLabel(row(['a', 'b'], []), true)).toContain('a · b');
    expect(traceArcTitle(row(['a', 'b'], []), true)).toContain('a, b');
    expect(traceArcLabel(row(['x'], ['a', 'b']), true)).toBe('a · b');
    expect(traceArcTitle(row(['x'], ['a', 'b']), true)).toContain('a, b');
  });

  it('a row is classified before it is worded — an unrecorded row ignores the corpus flag entirely', () => {
    expect(traceArcState(row([], []), false)).toEqual({ state: 'unrecorded' });
    expect(traceArcLabel(row([], []), false)).toBe('arc not recorded');
  });
});

describe('buildTraversalTraceList — a payload from before these fields still reads honestly', () => {
  it('an entry with no units/arcs keys reads as recording nothing, never as undefined', () => {
    // A server that predates ADR-0541 (or a desktop mirror mid-deploy) sends the old shape. The row
    // must come back with real empty arrays: `traceArcState` reads `.length` on both, so an
    // undefined here is a crash in the rail rather than an honest "not recorded".
    const legacy = { sessionId: 'old', eventCount: 3, lastObservedAt: null } as TraversalSessionEntry;
    const list = buildTraversalTraceList({
      status: 'read',
      payload: { dir: TRACE_DIR, sessions: [legacy] } as TraversalSessionsPayload,
    });
    if (list.state !== 'listed') throw new Error('expected a listed index');
    expect(list.rows[0]?.units).toEqual([]);
    expect(list.rows[0]?.arcs).toEqual([]);
    // ⚠ And the LIST's flag defaults to FALSE, not true: a payload that says nothing about the
    // corpus must not license "worked on no arc", which is a positive claim about the work.
    expect(list.arcsResolved).toBe(false);
    expect(traceArcLabel(list.rows[0]!, list.arcsResolved)).toBe('arc not recorded');
  });
});
