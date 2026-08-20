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
  type TraversalIndexState,
  type TraversalTraceRow,
} from './traversalIndex';
import type { TraversalSessionsPayload } from '../types';

const TRACE_DIR = '/home/op/.storytree/traces';

function read(sessions: TraversalSessionsPayload['sessions']): TraversalIndexState {
  return { status: 'read', payload: { dir: TRACE_DIR, sessions } };
}

function entry(
  sessionId: string,
  lastObservedAt: string | null,
  eventCount = 10,
): TraversalSessionsPayload['sessions'][number] {
  return { sessionId, eventCount, lastObservedAt };
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
  };

  function rowAt(at: string | null): TraversalTraceRow {
    return { sessionId: 'row', eventCount: 1, lastObservedAt: at };
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
