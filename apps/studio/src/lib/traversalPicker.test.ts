// The picker join's proof (`traversal-panel-arc`, increment `traversal-panel-session-picker`).
//
// The assertions that matter are all about the SEAM between two independent facts — who claimed the
// story (shared, live, in the store) and what can be replayed here (per-machine, on local disk):
//
//   1. a claimed session with no local trace is OFFERED and DISABLED with its reason, never dropped
//      and never silently offered as though selecting it would show something;
//   2. "the index has not answered" is never collapsed into "there is no trace" — a pending or
//      failed read is its own state, because the two send an operator to different places;
//   3. an EMPTY index is a real observation (this machine captured nothing) and is allowed to
//      produce a confident no-trace answer, unlike (2);
//   4. one session holding several capability-grain claims on one story is ONE row.

import { describe, it, expect } from 'vitest';
import {
  buildTraversalPickerOptions,
  replayableCount,
  type TraversalIndexState,
} from './traversalPicker';
import type { ClaimActivity, TraversalSessionsPayload } from '../types';

const TRACE_DIR = '/home/op/.storytree/traces';

function claim(over: Partial<ClaimActivity> & { sessionId: string }): ClaimActivity {
  return {
    unitId: 'studio',
    kind: 'claim',
    branch: `claude/${over.sessionId}`,
    intent: 'orchestrate',
    grade: 'work',
    at: '2026-08-11T09:00:00.000Z',
    ...over,
  };
}

function read(sessions: TraversalSessionsPayload['sessions']): TraversalIndexState {
  return { status: 'read', payload: { dir: TRACE_DIR, sessions } };
}

describe('buildTraversalPickerOptions — the claimed × replayable join', () => {
  it('marks a claimed session with a readable trace available, carrying the index’s own counts', () => {
    const options = buildTraversalPickerOptions(
      [claim({ sessionId: 'elegant-rosalind' })],
      read([{ sessionId: 'elegant-rosalind', eventCount: 42, lastObservedAt: '2026-08-11T10:00:00.000Z' }]),
    );
    expect(options).toHaveLength(1);
    expect(options[0]?.availability).toEqual({
      state: 'available',
      eventCount: 42,
      lastObservedAt: '2026-08-11T10:00:00.000Z',
    });
  });

  it('OFFERS a claimed session with no local trace rather than dropping it, and says where it looked', () => {
    // Dropping the row would be the failure this join exists to prevent: the operator would be shown
    // a shorter list with no way to tell that a session is missing because of THIS machine.
    const options = buildTraversalPickerOptions([claim({ sessionId: 'ran-elsewhere' })], read([]));
    expect(options).toHaveLength(1);
    const availability = options[0]?.availability;
    expect(availability?.state).toBe('no-trace');
    expect(availability?.state === 'no-trace' && availability.reason).toContain(TRACE_DIR);
  });

  it('never offers a session that has a trace but did not claim this story', () => {
    const options = buildTraversalPickerOptions(
      [claim({ sessionId: 'claimed-here' })],
      read([
        { sessionId: 'claimed-here', eventCount: 3, lastObservedAt: null },
        { sessionId: 'traced-but-elsewhere', eventCount: 900, lastObservedAt: null },
      ]),
    );
    expect(options.map((o) => o.sessionId)).toEqual(['claimed-here']);
  });

  it('a session holding SEVERAL capability-grain claims on one story is ONE row, at its strongest grade', () => {
    const options = buildTraversalPickerOptions(
      [
        claim({ sessionId: 'multi', unitId: 'read-corpus', grade: 'exploring', at: '2026-08-11T09:30:00.000Z' }),
        claim({ sessionId: 'multi', unitId: 'chat-panel', grade: 'work', at: '2026-08-11T09:45:00.000Z' }),
      ],
      read([]),
    );
    expect(options).toHaveLength(1);
    expect(options[0]?.grade).toBe('work');
  });

  it('defaults a claim with no grade to `work` — the same back-compat default the ledger applies', () => {
    const bare: ClaimActivity = { ...claim({ sessionId: 'ungraded' }) };
    delete (bare as { grade?: unknown }).grade;
    expect(buildTraversalPickerOptions([bare], read([]))[0]?.grade).toBe('work');
  });

  it('renders NO options for a story nobody claims — the caller shows no picker, not an empty one', () => {
    expect(buildTraversalPickerOptions([], read([{ sessionId: 'x', eventCount: 1, lastObservedAt: null }]))).toEqual([]);
  });
});

describe('buildTraversalPickerOptions — an unread index is never a no-trace answer', () => {
  it('reports `unknown` while the index read is still in flight', () => {
    const options = buildTraversalPickerOptions([claim({ sessionId: 's' })], { status: 'pending' });
    expect(options[0]?.availability.state).toBe('unknown');
  });

  it('reports `unknown` — not `no-trace` — when the index read FAILED, and names the failure', () => {
    // The distinction is operational, not cosmetic: `no-trace` sends an operator to their trace dir,
    // `unknown` sends them to the studio server. Collapsing them sends them to the wrong one.
    const options = buildTraversalPickerOptions([claim({ sessionId: 's' })], {
      status: 'failed',
      message: '500 Internal Server Error',
    });
    const availability = options[0]?.availability;
    expect(availability?.state).toBe('unknown');
    expect(availability?.state === 'unknown' && availability.reason).toContain('500');
  });

  it('an EMPTY index IS an observation — it answers no-trace confidently, unlike a failed read', () => {
    expect(buildTraversalPickerOptions([claim({ sessionId: 's' })], read([]))[0]?.availability.state).toBe(
      'no-trace',
    );
  });
});

describe('buildTraversalPickerOptions — deterministic, availability-led ordering', () => {
  it('leads with replayable sessions, then orders each group oldest-claim-first', () => {
    const options = buildTraversalPickerOptions(
      [
        claim({ sessionId: 'no-trace-old', at: '2026-08-11T08:00:00.000Z' }),
        claim({ sessionId: 'traced-new', at: '2026-08-11T12:00:00.000Z' }),
        claim({ sessionId: 'traced-old', at: '2026-08-11T09:00:00.000Z' }),
      ],
      read([
        { sessionId: 'traced-new', eventCount: 1, lastObservedAt: null },
        { sessionId: 'traced-old', eventCount: 1, lastObservedAt: null },
      ]),
    );
    expect(options.map((o) => o.sessionId)).toEqual(['traced-old', 'traced-new', 'no-trace-old']);
  });

  it('breaks an exact claim-time tie on session id, so a poll cannot reshuffle the list', () => {
    const at = '2026-08-11T09:00:00.000Z';
    const first = buildTraversalPickerOptions(
      [claim({ sessionId: 'b', at }), claim({ sessionId: 'a', at })],
      read([]),
    );
    const reversed = buildTraversalPickerOptions(
      [claim({ sessionId: 'a', at }), claim({ sessionId: 'b', at })],
      read([]),
    );
    expect(first.map((o) => o.sessionId)).toEqual(['a', 'b']);
    expect(reversed.map((o) => o.sessionId)).toEqual(['a', 'b']);
  });
});

describe('replayableCount', () => {
  it('counts only the available rows, so a picker can say "none of these ran here"', () => {
    const options = buildTraversalPickerOptions(
      [claim({ sessionId: 'a' }), claim({ sessionId: 'b' })],
      read([{ sessionId: 'a', eventCount: 1, lastObservedAt: null }]),
    );
    expect(replayableCount(options)).toBe(1);
  });

  it('counts zero while the index is unread — an unknown row is not a replayable one', () => {
    const options = buildTraversalPickerOptions([claim({ sessionId: 'a' })], { status: 'pending' });
    expect(replayableCount(options)).toBe(0);
  });
});
