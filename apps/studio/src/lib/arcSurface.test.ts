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
  arcClaimants,
  arcLanes,
  arcState,
  briefingLead,
  defaultLaneId,
  laneBars,
  laneCounts,
  landedSummary,
  lastActivityAt,
  BLOCKED_IS_DERIVABLE,
  type ArcSurfaceState,
} from './arcSurface';
import type {
  ArcRollup,
  ArcRollupIncrement,
  ArcRollupQuestion,
  ArcRollupSummary,
  SessionClaimGroup,
} from '../types';

const NOW = new Date('2026-08-06T00:00:00Z');

/** One session holding `unitIds` on the live ledger — the shape `GET /api/claims` folds to. */
function claimGroup(sessionId: string, ...unitIds: string[]): SessionClaimGroup {
  return {
    sessionId,
    branch: `claude/${sessionId}`,
    claims: unitIds.map((unitId) => ({
      unitId,
      grade: 'work' as const,
      intent: 'orchestrate',
      ageMs: 1000,
      claimedAt: '2026-08-06T00:00:00Z',
    })),
  };
}

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
    // ADR-0306 D4's store-resident story path, separate from the disk-scanned `stories` above.
    citedStories: [],
    questions: [],
    waiting: false,
    ...over,
  };
}

/**
 * THE LANE ROW THE WIRE ACTUALLY DELIVERS — `arc()` above, narrowed exactly the way the server's
 * `summariseArcRollup` narrows it (`packages/arc/src/arc-rollup.ts`).
 *
 * The lane half of this module takes `ArcRollupSummary`, not `ArcRollup`, because `GET /api/arcs`
 * stopped shipping every arc's prose to draw green and grey bars. Building the fixtures through
 * this rather than handing the lane functions a full rollup is what keeps these tests honest: a
 * lane function that started reading `intent`, a question's `stakes` or an increment's outcome
 * would not compile here, which is the same fence the production types carry.
 *
 * IT IS A FIXTURE, NOT THE CONTRACT. That the SERVER narrows this way is proven where it can be
 * proven against the producer — `apps/studio/server/arcsApi.integration.test.ts` asserts the served
 * list against `summariseArcRollup(loadArcRollup(...))` from @storytree/arc, and
 * `packages/arc/src/arc-rollup.test.ts` fences which fields the projection may carry. This module
 * cannot import either (the frontend rides the wire with locally-declared mirrors), so it declares
 * the shape it expects and those two prove the shape is what arrives.
 */
function lane(over: Partial<ArcRollup> & { id: string }): ArcRollupSummary {
  const rollup = arc(over);
  return {
    id: rollup.id,
    title: rollup.title,
    lifecycle: rollup.lifecycle,
    waiting: rollup.questions.length > 0,
    openQuestions: rollup.questions.length,
    increments: rollup.increments.map((inc) => ({
      id: inc.id,
      title: inc.title,
      status: inc.status,
      ...(inc.parked !== undefined ? { parked: inc.parked } : {}),
      ...(inc.cites !== undefined ? { cites: inc.cites } : {}),
      ...(typeof inc.outcome?.date === 'string' ? { landedOn: inc.outcome.date } : {}),
    })),
  };
}

function question(id: string): ArcRollupQuestion {
  return { id, title: `Q ${id}`, description: `description ${id}`, stakes: `stakes ${id}` };
}

describe('laneBars — bars are UNITS, green landed / grey queued (ADR-0314 D2)', () => {
  it('draws one bar per increment, landed green and everything-else grey', () => {
    const rollup = lane({
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
    const rollup = lane({
      id: 'a',
      increments: [parked('p1', '2026-08-01'), landed('c1', '2026-07-01'), parked('p2', '2026-08-02')],
    });
    expect(laneBars(rollup).map((b) => b.tone)).toEqual(['landed', 'queued', 'queued']);
  });

  it('an unrecognised status is grey, not landed — an unknown row is not a landing', () => {
    const rollup = lane({ id: 'a', increments: [increment({ id: 'weird', status: '?' })] });
    expect(laneBars(rollup)[0]?.tone).toBe('queued');
  });
});

describe('laneCounts — counts, never a ratio (ADR-0314 D2)', () => {
  it('reports landed and queued as counts', () => {
    const rollup = lane({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), landed('c2', '2026-07-02'), parked('p1', '2026-08-01')],
    });
    expect(laneCounts(rollup)).toEqual({ landed: 2, queued: 1 });
  });

  it('exposes NO percentage / ratio / denominator field — an arc has none', () => {
    // The fence ADR-0314 D2 asks for: "This is not the progress bar ADR-0267's Context rules out".
    // 2 landed of 3 known units is NOT "67% done" — the surface never asserts that 3 is all of them.
    const rollup = lane({
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
    const rollup = lane({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), parked('p1', '2026-08-04T09:00:00Z')],
    });
    expect(lastActivityAt(rollup)).toBe(Date.parse('2026-08-04T09:00:00Z'));
  });

  it('counts a PARKING even when no landing followed it', () => {
    // An arc that gained four parked entries yesterday is not untouched. Reading landings alone
    // would report it as such.
    const rollup = lane({ id: 'a', increments: [parked('p1', '2026-08-05T00:00:00Z')] });
    expect(lastActivityAt(rollup)).toBe(Date.parse('2026-08-05T00:00:00Z'));
  });

  it('is null with no dated increment, and skips an unparseable date rather than reading epoch 0', () => {
    expect(lastActivityAt(lane({ id: 'a' }))).toBeNull();
    const messy = lane({
      id: 'a',
      increments: [increment({ id: 'x', status: 'closed', outcome: { date: 'not-a-date' } }), landed('c1', '2026-08-05')],
    });
    // One malformed row must not drag a live arc into `quiet`.
    expect(lastActivityAt(messy)).toBe(Date.parse('2026-08-05'));
  });
});

describe('arcState — waiting / claimed / quiet, and NEVER blocked (ADR-0314 D4, ADR-0374 D4)', () => {
  it('an arc with an authored open question is `waiting` — answerable right now', () => {
    const rollup = lane({ id: 'a', questions: [question('q1')], increments: [landed('c1', '2026-01-01')] });
    // `waiting` outranks everything below it: an arc the owner can unblock by replying is exactly
    // what this surface exists to surface, so it never hides behind a judgement about activity.
    expect(arcState(rollup, NOW)).toBe('waiting');
  });

  it('RECENCY NO LONGER LIGHTS A STATE — a just-landed arc reads `quiet` like any other (ADR-0374 D4)', () => {
    // The fence on the deleted `moving` predicate. Yesterday's landing and last month's now read
    // IDENTICALLY, which is the decision rather than a rounding: an arc nobody is claiming, with
    // nothing waiting on the owner, is quiet whatever landed on it last week. A test that allowed
    // these two to differ would let a recency predicate back in under another name.
    expect(arcState(lane({ id: 'a', increments: [landed('c1', '2026-08-14')] }), NOW)).toBe('quiet');
    expect(arcState(lane({ id: 'b', increments: [landed('c1', '2026-07-01')] }), NOW)).toBe('quiet');
    expect(arcState(lane({ id: 'c', increments: [parked('p1', '2026-08-14T00:00:00Z')] }), NOW)).toBe('quiet');
  });

  it('the injected clock changes NO state — `now` orders lanes, it never labels one', () => {
    // `arcState` still takes `now` (published shape, every caller passes it), so the guarantee worth
    // holding is that moving the clock cannot move a verdict.
    const rollup = lane({ id: 'a', increments: [landed('c1', '2026-08-14')] });
    expect(arcState(rollup, new Date('2027-06-01T00:00:00Z'))).toBe('quiet');
    expect(arcState(rollup, new Date('2026-08-14T00:00:00Z'))).toBe('quiet');
  });

  it('a live claim on the arc id lights `claimed`, outranking the quiet fall-through', () => {
    const rollup = lane({ id: 'held-arc', increments: [landed('c1', '2026-08-04')] });
    expect(arcState(rollup, NOW, [claimGroup('s1', 'held-arc')])).toBe('claimed');
    // and without the ledger the very same arc reads `quiet` — the state is ADDITIVE
    expect(arcState(rollup, NOW)).toBe('quiet');
  });

  it('`waiting` outranks `claimed`: the owner-actionable state is never hidden by a busy session', () => {
    const rollup = lane({ id: 'a', questions: [question('q')], increments: [landed('c1', '2026-08-04')] });
    expect(arcState(rollup, NOW, [claimGroup('s1', 'a')])).toBe('waiting');
  });

  it('a claim that matches NOTHING falls through — absence is never evidence of absence', () => {
    // The join covers a measured minority of increments (5 of 613 carry a `capability:` cite), so a
    // non-match cannot support "nobody is working on this". It falls through to `quiet` instead,
    // which claims less: quiet says nothing is PROVEN to be happening, never that nothing is.
    const rollup = lane({ id: 'a', increments: [landed('c1', '2026-08-04')] });
    expect(arcState(rollup, NOW, [claimGroup('s1', 'a-totally-different-unit')])).toBe('quiet');
    expect(arcState(rollup, NOW, null)).toBe('quiet');
    expect(arcState(rollup, NOW, [])).toBe('quiet');
  });

  it('a parked arc reads `parked`, outranking `waiting` and `claimed` (ADR-0374 D1)', () => {
    // The two STORED lifecycles win over everything: an arc off the worklist is off it whatever else
    // is true of it, and `waiting` promises "answerable right now, IN FLIGHT".
    const rollup = lane({
      id: 'shelved',
      lifecycle: 'parked',
      questions: [question('q')],
      increments: [parked('p1', '2026-08-04T00:00:00Z')],
    });
    expect(arcState(rollup, NOW)).toBe('parked');
    expect(arcState(rollup, NOW, [claimGroup('s1', 'shelved')])).toBe('parked');
  });

  it('`parked` survives OPEN increments — that is the shape it exists for', () => {
    // The whole point: the mechanical rule reads open work as `active` (ADR-0335), and this surface
    // must not re-derive it. It reads the STORED lifecycle, so a parked arc full of open work stays
    // parked rather than being quietly promoted back onto the worklist.
    const rollup = lane({
      id: 'shelved',
      lifecycle: 'parked',
      increments: [parked('p1', '2026-08-04T00:00:00Z'), parked('p2', '2026-08-05T00:00:00Z')],
    });
    expect(arcState(rollup, NOW)).toBe('parked');
    expect(laneCounts(rollup)).toEqual({ landed: 0, queued: 2 });
  });
});

describe('arcClaimants — three real join paths, unioned, asserted positively only', () => {
  it('matches a claim taken directly on the arc id', () => {
    const rollup = lane({ id: 'my-arc' });
    expect(arcClaimants(rollup, [claimGroup('s1', 'my-arc')])).toEqual([
      { sessionId: 's1', branch: 'claude/s1', unitId: 'my-arc' },
    ]);
  });

  it('matches a claim on one of the arc’s own increment ids', () => {
    const rollup = lane({ id: 'my-arc', increments: [parked('some-increment', '2026-08-01')] });
    expect(arcClaimants(rollup, [claimGroup('s1', 'some-increment')]).map((c) => c.unitId)).toEqual([
      'some-increment',
    ]);
  });

  it('matches `<arc-id>-inc-NN` as a MEMBER of the rollup, not as a string prefix', () => {
    const rollup = lane({ id: 'my-arc', increments: [parked('my-arc-inc-04', '2026-08-01')] });
    expect(arcClaimants(rollup, [claimGroup('s1', 'my-arc-inc-04')]).map((c) => c.unitId)).toEqual([
      'my-arc-inc-04',
    ]);
  });

  it('matches a unit an increment CITES, with the ref scheme stripped', () => {
    // Claims are taken on BARE unit ids, while `cites` carries `story:` / `capability:` / `asset:`
    // (ADR-0306 D2) — so the scheme has to come off before comparing, or this path never fires.
    const rollup = lane({
      id: 'my-arc',
      increments: [{ ...parked('i1', '2026-08-01'), cites: ['capability:arc-orientation-lens', 'story:studio'] }],
    });
    expect(arcClaimants(rollup, [claimGroup('s1', 'arc-orientation-lens')]).map((c) => c.unitId)).toEqual([
      'arc-orientation-lens',
    ]);
    expect(arcClaimants(rollup, [claimGroup('s2', 'studio')]).map((c) => c.unitId)).toEqual(['studio']);
  });

  it('returns [] for a null ledger and for a genuine no-match — the SAME not-proven answer', () => {
    const rollup = lane({ id: 'my-arc' });
    expect(arcClaimants(rollup, null)).toEqual([]);
    expect(arcClaimants(rollup, [])).toEqual([]);
    expect(arcClaimants(rollup, [claimGroup('s1', 'unrelated')])).toEqual([]);
  });

  it('never matches on a shared id PREFIX — a false positive is the one thing this cannot afford', () => {
    // A `startsWith(<arc-id>-)` rule was tried and removed: it bought nothing path 2 did not already
    // cover, and it silently absorbed any unit whose id merely began with the arc's, reporting a
    // session onto an arc it had never touched. `claimed` asserts only the positive, so a false
    // positive corrupts the only thing it says.
    const rollup = lane({ id: 'a' });
    expect(arcClaimants(rollup, [claimGroup('s1', 'a-totally-different-unit')])).toEqual([]);
    expect(arcClaimants(lane({ id: 'my-arc' }), [claimGroup('s1', 'my-arc-two-inc-01')])).toEqual([]);
  });

  it('an arc that never landed anything is `quiet`, NOT blocked (B2 is rejected by name)', () => {
    // ADR-0314 D4 rejects B2 "never started" as a `blocked` predicate: it measures the symptom.
    expect(arcState(lane({ id: 'fresh' }), NOW)).toBe('quiet');
  });

  it('an arc with a `proposed` ADR is not blocked either (B1 is rejected by name)', () => {
    const rollup = lane({
      id: 'a',
      adrs: [{ number: 316, status: 'proposed', title: 'undecided' }],
      increments: [landed('c1', '2026-08-05')],
    });
    expect(arcState(rollup, NOW)).toBe('quiet');
  });

  it('gone-quiet reads `quiet` and never `blocked` (B3 is rejected by name)', () => {
    // At 2026-08-05 density B3 lit 8 arcs and collapsed `blocked` and `quiet` into near-synonyms.
    // Since ADR-0374 D4 `quiet` is the fall-through for everything not stored, waiting or claimed —
    // which makes B3's predicate not merely rejected but unrepresentable here.
    const rollup = lane({ id: 'a', increments: [landed('c1', '2026-06-01')] });
    expect(arcState(rollup, NOW)).toBe('quiet');
  });

  it('a closed arc reads `closed`, even over a stray unanswered question (ADR-0335)', () => {
    // `closed` wins over everything: `waiting` promises "answerable right now, in flight", and a
    // closed arc is not in flight even if it happens to still carry an unresolved question.
    const rollup = lane({ id: 'a', lifecycle: 'closed', questions: [question('q1')] });
    expect(arcState(rollup, NOW)).toBe('closed');
  });

  it('NO input produces `blocked` — the refusal is declared, and holds across every shape', () => {
    expect(BLOCKED_IS_DERIVABLE).toBe(false);
    const shapes: ArcRollupSummary[] = [
      lane({ id: 'empty' }),
      lane({ id: 'questions', questions: [question('q')] }),
      lane({ id: 'stale', increments: [landed('c', '2020-01-01')] }),
      lane({ id: 'fresh', increments: [landed('c', '2026-08-06')] }),
      lane({ id: 'parked-only', increments: [parked('p', '2026-08-01')] }),
      lane({ id: 'proposed-adr', adrs: [{ number: 1, status: 'proposed', title: 't' }] }),
      lane({ id: 'no-stories', stories: [] }),
    ];
    const seen: ArcSurfaceState[] = shapes.map((s) => arcState(s, NOW));
    expect(seen).not.toContain('blocked');
  });
});

describe('arcLanes — active arcs only, waiting first (ADR-0239 D3 / ADR-0314 D3)', () => {
  it('drops closed and parked arcs, orders waiting > claimed > quiet, most-recent first within a state', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'quiet-old', increments: [landed('c', '2026-06-01')] }),
        lane({ id: 'closed-one', lifecycle: 'closed', increments: [landed('c', '2026-08-05')] }),
        lane({ id: 'parked-one', lifecycle: 'parked', increments: [parked('p', '2026-08-05T00:00:00Z')] }),
        lane({ id: 'claimed-one', increments: [landed('c', '2026-08-02')] }),
        lane({ id: 'waiting-one', questions: [question('q')], increments: [landed('c', '2026-01-01')] }),
        lane({ id: 'quiet-new', increments: [landed('c', '2026-08-05')] }),
      ],
      NOW,
      'active',
      [claimGroup('s1', 'claimed-one')],
    );
    // Every lane below `waiting` is now sorted by STATE then recency — and with `moving` gone the
    // two quiet lanes are separated by recency alone, which is what `lastActivity` is still for.
    expect(lanes.map((l) => l.arc.id)).toEqual([
      'waiting-one',
      'claimed-one',
      'quiet-new',
      'quiet-old',
    ]);
  });

  it('carries each lane its bars, counts and state', () => {
    const lanes = arcLanes([lane({ id: 'a', increments: [landed('c', '2026-08-05'), parked('p', '2026-08-01')] })], NOW);
    expect(lanes[0]?.bars.map((b) => b.tone)).toEqual(['landed', 'queued']);
    expect(lanes[0]?.counts).toEqual({ landed: 1, queued: 1 });
    expect(lanes[0]?.state).toBe('quiet');
  });

  it('orders deterministically when two lanes share a state and an activity moment', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'zulu', increments: [landed('c', '2026-08-05')] }),
        lane({ id: 'alpha', increments: [landed('c', '2026-08-05')] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['alpha', 'zulu']);
  });

  describe('scope (ADR-0335, ADR-0374 D5) — three scopes, one per lifecycle, and no `all`', () => {
    const LIVE = lane({ id: 'live-one', increments: [landed('c', '2026-08-05')] });
    const DONE = lane({ id: 'done-one', lifecycle: 'closed', increments: [landed('c', '2026-07-01')] });
    const SHELVED = lane({
      id: 'shelved-one',
      lifecycle: 'parked',
      increments: [parked('p', '2026-08-04T00:00:00Z')],
    });

    it('defaults to `active` — unchanged from before the scope param existed', () => {
      expect(arcLanes([LIVE, DONE, SHELVED], NOW).map((l) => l.arc.id)).toEqual(['live-one']);
      expect(arcLanes([LIVE, DONE, SHELVED], NOW, 'active').map((l) => l.arc.id)).toEqual(['live-one']);
    });

    it('`closed` shows ONLY closed arcs, each reading state `closed`', () => {
      const lanes = arcLanes([LIVE, DONE, SHELVED], NOW, 'closed');
      expect(lanes.map((l) => l.arc.id)).toEqual(['done-one']);
      expect(lanes[0]?.state).toBe('closed');
    });

    it('`parked` shows ONLY parked arcs, each reading state `parked`', () => {
      const lanes = arcLanes([LIVE, DONE, SHELVED], NOW, 'parked');
      expect(lanes.map((l) => l.arc.id)).toEqual(['shelved-one']);
      expect(lanes[0]?.state).toBe('parked');
    });

    it('THE THREE SCOPES PARTITION every arc — each appears in exactly one, so nothing is lost', () => {
      // This is what makes removing `all` safe rather than merely tidy (ADR-0374 D5). If a fourth
      // lifecycle were ever added without a scope, this would catch it: the counts stop summing.
      const all = [LIVE, DONE, SHELVED];
      const drawn = (['active', 'parked', 'closed'] as const).flatMap((s) =>
        arcLanes(all, NOW, s).map((l) => l.arc.id),
      );
      expect(drawn.slice().sort()).toEqual(['done-one', 'live-one', 'shelved-one']);
      expect(new Set(drawn).size).toBe(all.length);
    });
  });
});

describe('defaultLaneId — the panel opens where the owner is needed', () => {
  it('opens on the first waiting lane when there is one', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'running', increments: [landed('c', '2026-08-05')] }),
        lane({ id: 'waiting', questions: [question('q')] }),
      ],
      NOW,
    );
    expect(defaultLaneId(lanes)).toBe('waiting');
  });

  it('falls back to the first lane, and is null with no lanes at all', () => {
    const lanes = arcLanes([lane({ id: 'only', increments: [landed('c', '2026-08-05')] })], NOW);
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
    // `p1` is a PROPOSAL, so since ADR-0359 D3 it briefs under `proposals`, not `next` — `next` is
    // decided work (`ready`/`active`) only. It MOVES rather than appearing in both.
    expect(briefing.proposals.map((i) => i.id)).toEqual(['p1']);
    expect(briefing.next).toEqual([]);
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

describe('arcBriefing — parked PROPOSALS are something waiting on the owner (ADR-0359 D2/D3)', () => {
  it('carries proposals beside the questions, and `waiting` still means questions', () => {
    // The defect: `waiting` was `rollup.questions` and nothing else, so 9 live proposals across 3
    // arcs on 2026-08-12 were reachable only from "What comes next", below the fold. `waiting`
    // KEEPS its meaning — the proposals arrive as a sibling field, so no existing reader of
    // `waiting` silently changes what it is looking at.
    const rollup = arc({
      id: 'a',
      questions: [question('q1')],
      increments: [parked('p1', '2026-08-01'), landed('c1', '2026-07-01')],
    });
    const briefing = arcBriefing(rollup);
    expect(briefing.waiting.map((q) => q.id)).toEqual(['q1']);
    expect(briefing.proposals.map((i) => i.id)).toEqual(['p1']);
  });

  it('`ready` and `active` are NOT waiting — decided work is not asking for a review (D3)', () => {
    // ADR-0305 D2's lifecycle is proposal → ready → active → closed. A `proposal` is work whose
    // shape is still open to the owner; `ready`/`active` are already dispatched. Promoting all
    // unlanded work would put every arc's whole queue in the block that means "this needs you".
    const rollup = arc({
      id: 'a',
      increments: [
        increment({ id: 'prop', status: 'proposal' }),
        increment({ id: 'rdy', status: 'ready' }),
        increment({ id: 'act', status: 'active' }),
      ],
    });
    const briefing = arcBriefing(rollup);
    expect(briefing.proposals.map((i) => i.id)).toEqual(['prop']);
    // …and they stay exactly where they were, so nothing is lost by not promoting them.
    expect(briefing.next.map((i) => i.id)).toEqual(['rdy', 'act']);
    // The two halves are DISJOINT — a proposal is never rendered twice on one panel.
    expect(briefing.next.some((i) => briefing.proposals.includes(i))).toBe(false);
  });

  it('THE FENCE (D4): a proposal never lights the LANE state', () => {
    // ADR-0351 D1 removed a state that lit on every visible lane and therefore discriminated
    // nothing. All 13 active arcs carried open increments on 2026-08-12, so deriving `waiting`
    // from proposals would recreate that degeneracy exactly. The panel shows them; the lane
    // does not. If this assertion is ever "fixed", read ADR-0359 D4 first — the divergence is
    // the design, and the honest widening is a DISTINCT chip, never `waiting`.
    // BOTH WIDTHS OF THE SAME ARC, which is what makes this a fence rather than two assertions:
    // the panel reads the whole rollup off `/api/arcs/<id>` and the lane reads the summary row off
    // `/api/arcs`, so the divergence has to be asserted across the same fixture at both widths.
    const fixture = { id: 'a', increments: [parked('p1', '2026-08-05')] };
    expect(arcBriefing(arc(fixture)).proposals).toHaveLength(1);
    expect(arcState(lane(fixture), NOW)).toBe('quiet');
    expect(arcState(lane(fixture), new Date('2026-09-30T00:00:00Z'))).toBe('quiet');
  });
});

describe('landedSummary — the log collapses to one line (ADR-0359 D1)', () => {
  it('names the count and the most recent landing, so the fold costs no information', () => {
    // The defect this replaces: the panel rendered one row per closed increment, which was 57 rows
    // on `verification-integrity-arc` against the live store on 2026-08-12.
    const rollup = arc({
      id: 'a',
      increments: [landed('c1', '2026-07-01', '#900'), landed('c2', '2026-08-12', '#1297')],
    });
    expect(landedSummary(rollup)).toBe('2 landed · last 2026-08-12 #1297');
  });

  it('omits what it does not know rather than inventing it', () => {
    expect(landedSummary(arc({ id: 'a', increments: [landed('c1', '2026-07-01')] }))).toBe(
      '1 landed · last 2026-07-01',
    );
    expect(
      landedSummary(arc({ id: 'a', increments: [increment({ id: 'c1', status: 'closed' })] })),
    ).toBe('1 landed');
  });

  it('says nothing has landed rather than "0 landed"', () => {
    expect(landedSummary(arc({ id: 'a', increments: [parked('p1', '2026-08-01')] }))).toBe(
      'Nothing has landed yet',
    );
  });

  it('is a COUNT and never a ratio — the ADR-0314 D2 denominator fence reaches here too', () => {
    const rollup = arc({
      id: 'a',
      increments: [landed('c1', '2026-07-01'), parked('p1', '2026-08-01')],
    });
    expect(landedSummary(rollup)).not.toMatch(/%|\bof \d|\d\s*\/\s*\d/);
  });
});
