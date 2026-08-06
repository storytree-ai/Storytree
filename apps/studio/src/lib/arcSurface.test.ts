// The arc surface's PURE derivation layer (ADR-0314). Node environment — no jsdom, no fetch, no
// clock of its own: `now` is injected into every recency judgement, so nothing here can pass on
// Tuesday and fail on Wednesday.
//
// The load-bearing assertions are the two REFUSALS, not the happy paths:
//   1. `blocked` is never returned, and none of the mock round's three rejected predicates (B1
//      undecided / B2 never-started / B3 gone-quiet) can sneak in as a substitute (ADR-0314 D4).
//   2. no derivation exposes a ratio or a percentage — an arc has no denominator (ADR-0314 D2).
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green).

import { describe, it, expect } from 'vitest';
import {
  arcBriefing,
  arcLanes,
  arcState,
  briefingLead,
  defaultLaneId,
  laneBars,
  laneCounts,
  lastActivityAt,
  BLOCKED_IS_DERIVABLE,
  QUIET_AFTER_DAYS,
  type ArcSurfaceState,
} from './arcSurface';
import type { ArcRollup, ArcRollupIncrement, ArcRollupQuestion } from '../types';

const NOW = new Date('2026-08-06T00:00:00Z');

function increment(over: Partial<ArcRollupIncrement> & { id: string }): ArcRollupIncrement {
  return { title: `title of ${over.id}`, objective: '', status: 'proposal', ...over };
}

function landed(id: string, date: string, pr?: string): ArcRollupIncrement {
  return increment({ id, status: 'closed', outcome: pr === undefined ? { date } : { date, pr } });
}

function parked(id: string, at: string, status = 'proposal'): ArcRollupIncrement {
  return increment({ id, status, parked: at });
}

function arc(over: Partial<ArcRollup> & { id: string }): ArcRollup {
  return {
    title: `The ${over.id}`,
    description: '',
    lifecycle: 'active',
    intent: `intent of ${over.id}`,
    endState: `end state of ${over.id}`,
    increments: [],
    adrs: [],
    stories: [],
    questions: [],
    waiting: false,
    ...over,
  };
}

function question(id: string): ArcRollupQuestion {
  return { id, title: `Q ${id}`, description: `description ${id}`, stakes: `stakes ${id}` };
}

describe('laneBars — bars are UNITS, green landed / grey queued (ADR-0314 D2)', () => {
  it('draws one bar per increment, landed green and everything-else grey', () => {
    const rollup = arc({
      id: 'a',
      increments: [
        parked('p1', '2026-08-01'),
        increment({ id: 'r1', status: 'ready' }),
        increment({ id: 'ac1', status: 'active' }),
        landed('c1', '2026-07-01'),
        landed('c2', '2026-07-20'),
      ],
    });

    const bars = laneBars(rollup);
    expect(bars).toHaveLength(5);
    expect(bars.filter((b) => b.tone === 'landed').map((b) => b.id)).toEqual(['c1', 'c2']);
    // `proposal`, `ready` and `active` are ALL grey — the other three quarters of ADR-0305 D2's
    // lifecycle, not just the parked ones.
    expect(bars.filter((b) => b.tone === 'queued').map((b) => b.id)).toEqual(['p1', 'r1', 'ac1']);
  });

  it('keeps the landed run and the queued run visibly apart, landed first (ADR-0305 D7)', () => {
    // Drive hands increments forward-looking FIRST; the lane re-reads them as history-then-future,
    // and the two runs must never interleave — a reader who saw them merged would take an unbuilt
    // intention for something that happened.
    const rollup = arc({
      id: 'a',
      increments: [parked('p1', '2026-08-01'), landed('c1', '2026-07-01'), parked('p2', '2026-08-02')],
    });
    expect(laneBars(rollup).map((b) => b.tone)).toEqual(['landed', 'queued', 'queued']);
  });

  it('an unrecognised status is grey, not landed — an unknown row is not a landing', () => {
    const rollup = arc({ id: 'a', increments: [increment({ id: 'weird', status: '?' })] });
    expect(laneBars(rollup)[0]?.tone).toBe('queued');
  });
});

describe('laneCounts — counts, never a ratio (ADR-0314 D2)', () => {
  it('reports landed and queued as counts', () => {
    const rollup = arc({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), landed('c2', '2026-07-02'), parked('p1', '2026-08-01')],
    });
    expect(laneCounts(rollup)).toEqual({ landed: 2, queued: 1 });
  });

  it('exposes NO percentage / ratio / denominator field — an arc has none', () => {
    // The fence ADR-0314 D2 asks for: "This is not the progress bar ADR-0267's Context rules out".
    // 2 landed of 3 known units is NOT "67% done" — the surface never asserts that 3 is all of them.
    const rollup = arc({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), landed('c2', '2026-07-02'), parked('p1', '2026-08-01')],
    });
    const counts = laneCounts(rollup);
    expect(Object.keys(counts).sort()).toEqual(['landed', 'queued']);
    for (const value of Object.values(counts)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('lastActivityAt — landings AND parkings both count as activity', () => {
  it('takes the latest of every landing date and parking stamp', () => {
    const rollup = arc({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), parked('p1', '2026-08-04T09:00:00Z')],
    });
    expect(lastActivityAt(rollup)).toBe(Date.parse('2026-08-04T09:00:00Z'));
  });

  it('counts a PARKING even when no landing followed it', () => {
    // An arc that gained four parked entries yesterday is not untouched. Reading landings alone
    // would report it as such.
    const rollup = arc({ id: 'a', increments: [parked('p1', '2026-08-05T00:00:00Z')] });
    expect(lastActivityAt(rollup)).toBe(Date.parse('2026-08-05T00:00:00Z'));
  });

  it('is null with no dated increment, and skips an unparseable date rather than reading epoch 0', () => {
    expect(lastActivityAt(arc({ id: 'a' }))).toBeNull();
    const messy = arc({
      id: 'a',
      increments: [increment({ id: 'x', status: 'closed', outcome: { date: 'not-a-date' } }), landed('c1', '2026-08-05')],
    });
    // One malformed row must not drag a live arc into `quiet`.
    expect(lastActivityAt(messy)).toBe(Date.parse('2026-08-05'));
  });
});

describe('arcState — waiting / running / quiet, and NEVER blocked (ADR-0314 D4)', () => {
  it('an arc with an authored open question is `waiting` — answerable right now', () => {
    const rollup = arc({ id: 'a', questions: [question('q1')], increments: [landed('c1', '2026-01-01')] });
    // `waiting` wins over recency: a stale arc the owner can unblock by replying is exactly what
    // this surface exists to surface, so it never hides behind a recency judgement.
    expect(arcState(rollup, NOW)).toBe('waiting');
  });

  it('recent activity reads `running`, older than the window reads `quiet`', () => {
    const recent = arc({ id: 'a', increments: [landed('c1', '2026-08-04')] });
    expect(arcState(recent, NOW)).toBe('running');

    const stale = arc({ id: 'b', increments: [landed('c1', '2026-07-01')] });
    expect(arcState(stale, NOW)).toBe('quiet');
    expect(QUIET_AFTER_DAYS).toBe(7);
  });

  it('an arc that never landed anything is `quiet`, NOT blocked (B2 is rejected by name)', () => {
    // ADR-0314 D4 rejects B2 "never started" as a `blocked` predicate: it measures the symptom.
    expect(arcState(arc({ id: 'fresh' }), NOW)).toBe('quiet');
  });

  it('an arc with a `proposed` ADR is not blocked either (B1 is rejected by name)', () => {
    const rollup = arc({
      id: 'a',
      adrs: [{ number: 316, status: 'proposed', title: 'undecided' }],
      increments: [landed('c1', '2026-08-05')],
    });
    expect(arcState(rollup, NOW)).toBe('running');
  });

  it('gone-quiet reads `quiet` and never `blocked` (B3 is rejected by name)', () => {
    // At 2026-08-05 density B3 lit 8 arcs and collapsed `blocked` and `quiet` into near-synonyms.
    // `quiet` now means what it says: moving slowly, nobody stuck.
    const rollup = arc({ id: 'a', increments: [landed('c1', '2026-06-01')] });
    expect(arcState(rollup, NOW)).toBe('quiet');
  });

  it('NO input produces `blocked` — the refusal is declared, and holds across every shape', () => {
    expect(BLOCKED_IS_DERIVABLE).toBe(false);
    const shapes: ArcRollup[] = [
      arc({ id: 'empty' }),
      arc({ id: 'questions', questions: [question('q')] }),
      arc({ id: 'stale', increments: [landed('c', '2020-01-01')] }),
      arc({ id: 'fresh', increments: [landed('c', '2026-08-06')] }),
      arc({ id: 'parked-only', increments: [parked('p', '2026-08-01')] }),
      arc({ id: 'proposed-adr', adrs: [{ number: 1, status: 'proposed', title: 't' }] }),
      arc({ id: 'no-stories', stories: [] }),
    ];
    const seen: ArcSurfaceState[] = shapes.map((s) => arcState(s, NOW));
    expect(seen).not.toContain('blocked');
  });
});

describe('arcLanes — active arcs only, waiting first (ADR-0239 D3 / ADR-0314 D3)', () => {
  it('drops closed arcs and orders waiting > running > quiet, most-recent first within a state', () => {
    const lanes = arcLanes(
      [
        arc({ id: 'quiet-one', increments: [landed('c', '2026-06-01')] }),
        arc({ id: 'closed-one', lifecycle: 'closed', increments: [landed('c', '2026-08-05')] }),
        arc({ id: 'running-old', increments: [landed('c', '2026-08-02')] }),
        arc({ id: 'waiting-one', questions: [question('q')], increments: [landed('c', '2026-01-01')] }),
        arc({ id: 'running-new', increments: [landed('c', '2026-08-05')] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual([
      'waiting-one',
      'running-new',
      'running-old',
      'quiet-one',
    ]);
  });

  it('carries each lane its bars, counts and state', () => {
    const lanes = arcLanes([arc({ id: 'a', increments: [landed('c', '2026-08-05'), parked('p', '2026-08-01')] })], NOW);
    expect(lanes[0]?.bars.map((b) => b.tone)).toEqual(['landed', 'queued']);
    expect(lanes[0]?.counts).toEqual({ landed: 1, queued: 1 });
    expect(lanes[0]?.state).toBe('running');
  });

  it('orders deterministically when two lanes share a state and an activity moment', () => {
    const lanes = arcLanes(
      [
        arc({ id: 'zulu', increments: [landed('c', '2026-08-05')] }),
        arc({ id: 'alpha', increments: [landed('c', '2026-08-05')] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['alpha', 'zulu']);
  });
});

describe('defaultLaneId — the panel opens where the owner is needed', () => {
  it('opens on the first waiting lane when there is one', () => {
    const lanes = arcLanes(
      [
        arc({ id: 'running', increments: [landed('c', '2026-08-05')] }),
        arc({ id: 'waiting', questions: [question('q')] }),
      ],
      NOW,
    );
    expect(defaultLaneId(lanes)).toBe('waiting');
  });

  it('falls back to the first lane, and is null with no lanes at all', () => {
    const lanes = arcLanes([arc({ id: 'only', increments: [landed('c', '2026-08-05')] })], NOW);
    expect(defaultLaneId(lanes)).toBe('only');
    expect(defaultLaneId([])).toBeNull();
  });
});

describe('arcBriefing — the panel payload (ADR-0314 D3)', () => {
  it('splits waiting / next / landed, with landed NEWEST first', () => {
    const rollup = arc({
      id: 'a',
      questions: [question('q1'), question('q2')],
      increments: [
        parked('p1', '2026-08-01'),
        landed('c1', '2026-07-01', '#900'),
        landed('c2', '2026-07-20', '#950'),
      ],
    });
    const briefing = arcBriefing(rollup);
    expect(briefing.waiting.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(briefing.next.map((i) => i.id)).toEqual(['p1']);
    // "Where it is up to" reads backwards from now.
    expect(briefing.landed.map((i) => i.id)).toEqual(['c2', 'c1']);
  });

  it('does not mutate the rollup it reads', () => {
    const rollup = arc({ id: 'a', increments: [landed('c1', '2026-07-01'), landed('c2', '2026-07-20')] });
    arcBriefing(rollup);
    expect(rollup.increments.map((i) => i.id)).toEqual(['c1', 'c2']);
  });

  it('briefingLead strips paired emphasis and backticks, and collapses whitespace', () => {
    // Arc `intent` is markdown in the store — real ones open `**The intent.**` — and the panel
    // renders text, so unstripped markers show through as literal asterisks.
    expect(briefingLead('**The intent.** Make arcs\n  the primary surface.')).toBe(
      'The intent. Make arcs the primary surface.',
    );
    expect(briefingLead('run `pnpm gate` first')).toBe('run pnpm gate first');
    expect(briefingLead('__loud__ and quiet')).toBe('loud and quiet');
  });

  it('briefingLead leaves single * and _ alone — an id is likelier than italics', () => {
    // Mangling `arc_id` or `packages/*/src` in a briefing is worse than one stray character, and
    // the formatted original is always one click away through the artifact link.
    expect(briefingLead('see packages/*/src and session_id')).toBe('see packages/*/src and session_id');
  });

  it('an arc with nothing waiting still briefs — intent and end state are always there', () => {
    const briefing = arcBriefing(arc({ id: 'a' }));
    expect(briefing.waiting).toEqual([]);
    expect(briefing.arc.intent).toBe('intent of a');
    expect(briefing.arc.endState).toBe('end state of a');
  });
});
