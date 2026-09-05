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
  isGated,
  laneBars,
  laneCounts,
  landedSummary,
  lastActivityAt,
  parseOptionCards,
  questionFields,
  questionRowStats,
  questionWordBudget,
  wordCount,
  BLOCKED_IS_DERIVABLE,
  QUESTION_WORD_BUDGET_FIELDS,
  type ArcSurfaceState,
} from './arcSurface';
import type {
  ArcRollup,
  ArcRollupIncrement,
  ArcRollupQuestion,
  ArcRollupSummary,
  GuidanceAsset,
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
function lane(
  over: Partial<ArcRollup> & { id: string; gates?: ArcRollupSummary['gates'] },
): ArcRollupSummary {
  // `gates` (ADR-0523) is a SUMMARY-only field — the full `ArcRollup` fixture type above carries no
  // such property — so it is pulled off `over` before building the rollup rather than spread into
  // it, matching how the production wire never widens the full rollup for this.
  const { gates, ...rollupOver } = over;
  const rollup = arc(rollupOver);
  // OPEN questions only — the narrowing `summariseArcRollup` performs since ADR-0434 D3. Counting
  // the whole array here would let a settled question light a lane the server leaves quiet, which
  // is a state the wire cannot produce and would make the fence below vacuous.
  const openQuestions = rollup.questions.filter((q) => q.lifecycle === 'open');
  return {
    id: rollup.id,
    title: rollup.title,
    lifecycle: rollup.lifecycle,
    waiting: openQuestions.length > 0,
    openQuestions: openQuestions.length,
    // ADR-0523 — empty by default, matching the server's own "ungated arc costs nothing" property.
    gates: gates ?? [],
    increments: rollup.increments.map((inc) => {
      const row: ArcRollupSummary['increments'][number] = {
        id: inc.id,
        title: inc.title,
        status: inc.status,
      };
      if (inc.parked !== undefined) row.parked = inc.parked;
      if (inc.cites !== undefined) row.cites = inc.cites;
      if (typeof inc.outcome?.date === 'string') row.landedOn = inc.outcome.date;
      return row;
    }),
  };
}

function question(id: string): ArcRollupQuestion {
  // ADR-0434 D1 — OPEN by default; a settled fixture states it, so nothing waits by omission.
  return { id, title: `Q ${id}`, description: `description ${id}`, stakes: `stakes ${id}`, lifecycle: 'open' };
}
/** A question that ENDED by recording its answer (ADR-0434 D2) — spelled out, never defaulted. */
function settledQuestion(id: string, answer = `answer ${id}`): ArcRollupQuestion {
  return { ...question(id), lifecycle: 'settled', answer, settledAt: '2026-08-24T09:00:00Z' };
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

  it('draws GATED, not queued, for not-yet-landed work when `gated` is passed (ADR-0523)', () => {
    const rollup = lane({
      id: 'a',
      increments: [parked('p1', '2026-08-01'), landed('c1', '2026-07-01')],
    });
    const bars = laneBars(rollup, true);
    expect(bars.map((b) => b.tone)).toEqual(['landed', 'gated']);
  });

  it('a LANDED increment stays landed even when the arc is gated — finished work is not waiting', () => {
    const rollup = lane({ id: 'a', increments: [landed('c1', '2026-07-01')] });
    expect(laneBars(rollup, true).map((b) => b.tone)).toEqual(['landed']);
  });

  it('defaults to `queued`, unchanged, when `gated` is omitted', () => {
    const rollup = lane({ id: 'a', increments: [parked('p1', '2026-08-01')] });
    expect(laneBars(rollup).map((b) => b.tone)).toEqual(['queued']);
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

describe('arcState — waiting / blocked / claimed / quiet (ADR-0314 D4, ADR-0374 D4, ADR-0523)', () => {
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

  it('NONE of the mock round’s rejected shapes produce `blocked` — only a shut gate does (ADR-0523)', () => {
    // `BLOCKED_IS_DERIVABLE` FLIPPED to true this increment (a gate is now one of its two named
    // sources) — but the three REJECTED substitutes (B1 undecided ADR, B2 never-started, B3
    // gone-quiet) are exactly as rejected as before: none of them became a source, so a shape
    // carrying one of THEM and no gate must still read something other than `blocked`.
    expect(BLOCKED_IS_DERIVABLE).toBe(true);
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

  it('a SHUT gate lights `blocked` — the one source ADR-0523 actually supplies', () => {
    const rollup = lane({ id: 'gated', gates: [{ id: 'blocker', shut: true }], increments: [landed('c', '2026-08-01')] });
    expect(arcState(rollup, NOW)).toBe('blocked');
  });

  it('a RESOLVED gate (shut: false) no longer reads `blocked` — nobody has to run `arc ungate` first', () => {
    const rollup = lane({ id: 'released', gates: [{ id: 'blocker', shut: false }], increments: [landed('c', '2026-08-01')] });
    expect(arcState(rollup, NOW)).toBe('quiet');
  });

  it('`waiting` still outranks `blocked` — a gate must never bury a question (ADR-0314 D3)', () => {
    const rollup = lane({
      id: 'both',
      gates: [{ id: 'blocker', shut: true }],
      questions: [question('q')],
    });
    expect(arcState(rollup, NOW)).toBe('waiting');
  });

  it('`blocked` outranks `claimed` — an external fact about the gate outranks a busy signal', () => {
    const rollup = lane({ id: 'gated-and-held', gates: [{ id: 'blocker', shut: true }] });
    expect(arcState(rollup, NOW, [claimGroup('s1', 'gated-and-held')])).toBe('blocked');
  });
});

describe('isGated — reads the arc’s OWN gates, independent of reachability (ADR-0523)', () => {
  it('is false with no gates at all — the common case, and the property the wire preserves', () => {
    expect(isGated(lane({ id: 'a' }))).toBe(false);
  });

  it('is true with at least one SHUT gate', () => {
    expect(isGated(lane({ id: 'a', gates: [{ id: 'b', shut: true }] }))).toBe(true);
  });

  it('is false when every gate has resolved (shut: false)', () => {
    expect(isGated(lane({ id: 'a', gates: [{ id: 'b', shut: false }] }))).toBe(false);
  });

  it('is true when ANY of several gates is still shut', () => {
    expect(isGated(lane({ id: 'a', gates: [{ id: 'b', shut: false }, { id: 'c', shut: true }] }))).toBe(true);
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

describe('arcLanes — nesting a queued arc under its blocker (ADR-0523, inc-05)', () => {
  it('an UNGATED arc carries no queued children — the density property the wire must preserve', () => {
    const lanes = arcLanes([lane({ id: 'a' }), lane({ id: 'b' })], NOW);
    expect(lanes.every((l) => l.queued.length === 0)).toBe(true);
  });

  it('a gating arc carries the RIGHT COUNT of arcs queued behind it', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'blocker' }),
        lane({ id: 'queued-1', gates: [{ id: 'blocker', shut: true }] }),
        lane({ id: 'queued-2', gates: [{ id: 'blocker', shut: true }] }),
        lane({ id: 'unrelated' }),
      ],
      NOW,
    );
    const blocker = lanes.find((l) => l.arc.id === 'blocker');
    expect(blocker?.queued.map((q) => q.arc.id).sort()).toEqual(['queued-1', 'queued-2']);
  });

  it('a queued arc does NOT appear at the top level — reachable only through its blocker', () => {
    const lanes = arcLanes(
      [lane({ id: 'blocker' }), lane({ id: 'queued', gates: [{ id: 'blocker', shut: true }] })],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['blocker']);
  });

  it('a queued arc carrying an OPEN QUESTION appears at the top level anyway (ADR-0314 D3)', () => {
    // The one exception, and the reason the tree cannot be allowed to bury a question: a gate is a
    // schedule, not a licence to hide the one thing this surface exists to surface.
    const lanes = arcLanes(
      [
        lane({ id: 'blocker' }),
        lane({ id: 'queued-and-waiting', gates: [{ id: 'blocker', shut: true }], questions: [question('q')] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id).sort()).toEqual(['blocker', 'queued-and-waiting']);
    // …and it is state `waiting`, not `blocked` — arcState's own precedence, read as reachability.
    const promoted = lanes.find((l) => l.arc.id === 'queued-and-waiting');
    expect(promoted?.state).toBe('waiting');
    // It must not ALSO be nested under its blocker — reachable at the top or through one
    // disclosure, never both.
    const blocker = lanes.find((l) => l.arc.id === 'blocker');
    expect(blocker?.queued).toEqual([]);
  });

  it('a gate whose blocker has closed (shut: false) no longer nests its arc', () => {
    // Nobody has to run `arc ungate` for the promotion to take effect here — the DATA already says
    // the gate is resolved, and the tree reads that directly.
    const lanes = arcLanes(
      [lane({ id: 'blocker' }), lane({ id: 'released', gates: [{ id: 'blocker', shut: false }] })],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id).sort()).toEqual(['blocker', 'released']);
    expect(lanes.find((l) => l.arc.id === 'blocker')?.queued).toEqual([]);
  });

  it('an open increment behind a shut gate draws GATED bars, not merely grey ones', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'blocker' }),
        lane({
          id: 'gated-arc',
          gates: [{ id: 'blocker', shut: true }],
          increments: [parked('p1', '2026-08-01')],
        }),
      ],
      NOW,
    );
    const gated = lanes.find((l) => l.arc.id === 'blocker')?.queued.find((q) => q.arc.id === 'gated-arc');
    expect(gated?.bars.map((b) => b.tone)).toEqual(['gated']);
    expect(gated?.state).toBe('blocked');
  });

  it('DEPTH IS PERMITTED — a queued arc that itself gates another keeps its own caret', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'root' }),
        lane({ id: 'middle', gates: [{ id: 'root', shut: true }] }),
        lane({ id: 'grandchild', gates: [{ id: 'middle', shut: true }] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['root']);
    const middle = lanes[0]?.queued.find((q) => q.arc.id === 'middle');
    expect(middle?.queued.map((q) => q.arc.id)).toEqual(['grandchild']);
  });

  it('nesting resolves only WITHIN the current scope — a blocker outside scope never orphans its arc', () => {
    // A `parked` blocker has no visible row under the `active` scope this call draws, so the
    // dependent falls back to an ordinary top-level lane rather than becoming unreachable — and
    // still reads `blocked`, since its OWN gate is genuinely still shut.
    const lanes = arcLanes(
      [lane({ id: 'blocker', lifecycle: 'parked' }), lane({ id: 'dependent', gates: [{ id: 'blocker', shut: true }] })],
      NOW,
      'active',
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['dependent']);
    expect(lanes[0]?.state).toBe('blocked');
  });

  it('STATE_RANK places `blocked` between `waiting` and `claimed`', () => {
    // The one way to get a `blocked` arc INTO a top-level sort next to the other states: an
    // out-of-scope blocker (see the test above) promotes it without releasing the gate.
    const lanes = arcLanes(
      [
        lane({ id: 'blocker', lifecycle: 'parked' }),
        lane({ id: 'blocked-one', gates: [{ id: 'blocker', shut: true }] }),
        lane({ id: 'claimed-one', increments: [landed('c', '2026-08-05')] }),
        lane({ id: 'quiet-one', increments: [landed('c', '2026-08-05')] }),
        lane({ id: 'waiting-one', questions: [question('q')] }),
      ],
      NOW,
      'active',
      [claimGroup('s1', 'claimed-one')],
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['waiting-one', 'blocked-one', 'claimed-one', 'quiet-one']);
  });

  it('nests an arc under ITS OWN blocker only — a shut gate on a DIFFERENT arc does not borrow it', () => {
    const lanes = arcLanes(
      [
        lane({ id: 'blocker-a' }),
        lane({ id: 'blocker-b' }),
        lane({ id: 'queued', gates: [{ id: 'blocker-a', shut: true }] }),
      ],
      NOW,
    );
    const a = lanes.find((l) => l.arc.id === 'blocker-a');
    const b = lanes.find((l) => l.arc.id === 'blocker-b');
    expect(a?.queued.map((q) => q.arc.id)).toEqual(['queued']);
    expect(b?.queued).toEqual([]);
  });

  it('nests under a blocker it names EVEN WHILE gated by another — `some`, not `every`, over its gates', () => {
    // An arc with TWO gates, only one of which points at the parent being asked about. `.some` finds
    // the match and nests it there regardless of the other entry; `.every` would demand every gate
    // name this parent and wrongly drop it, since a resolved gate to a DIFFERENT blocker is present.
    const lanes = arcLanes(
      [
        lane({ id: 'blocker-a' }),
        lane({
          id: 'multi-gated',
          gates: [
            { id: 'blocker-a', shut: true },
            { id: 'blocker-c', shut: false },
          ],
        }),
      ],
      NOW,
    );
    expect(lanes.find((l) => l.arc.id === 'blocker-a')?.queued.map((q) => q.arc.id)).toEqual(['multi-gated']);
  });

  it('a CYCLE in the wire data (past write-time refusal) terminates rather than recursing forever', () => {
    // Genuine production data can never contain a `gatedBy` cycle — `storytree arc gate` refuses one
    // at write time (ADR-0523 D4) — but this derivation has no write path of its own to trust, and a
    // tree walk with no bound is one bad row (or one write path that bypassed the refusal) away from
    // hanging the tab. `root` gates `a`; `a` and `b` gate EACH OTHER, so walking root -> a -> b meets
    // `a` again on the way back down.
    const lanes = arcLanes(
      [
        lane({ id: 'root' }),
        lane({
          id: 'a',
          gates: [
            { id: 'root', shut: true },
            { id: 'b', shut: true },
          ],
        }),
        lane({ id: 'b', gates: [{ id: 'a', shut: true }] }),
      ],
      NOW,
    );
    expect(lanes.map((l) => l.arc.id)).toEqual(['root']);
    const underRoot = lanes[0]?.queued;
    expect(underRoot?.map((l) => l.arc.id)).toEqual(['a']);
    const underA = underRoot?.[0]?.queued;
    expect(underA?.map((l) => l.arc.id)).toEqual(['b']);
    // The SECOND visit to `a` — met again while walking `b`'s own children — renders with NO further
    // children rather than recursing back into `b` a second time.
    const underB = underA?.[0]?.queued;
    expect(underB?.map((l) => l.arc.id)).toEqual(['a']);
    expect(underB?.[0]?.queued).toEqual([]);
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

describe('arcBriefing — a settled question MOVES, it is never deleted (ADR-0434 D3)', () => {
  it('splits the questions by lifecycle: open ones wait, settled ones carry their answers', () => {
    // The defect ADR-0434 removed: `waiting` was every question this arc had, so one that had been
    // ANSWERED still read as something the owner owed an answer to, and the only way to clear it
    // was to delete the question along with the answer.
    const rollup = arc({ id: 'a', questions: [question('q-open'), settledQuestion('q-done')] });
    const briefing = arcBriefing(rollup);
    expect(briefing.waiting.map((q) => q.id)).toEqual(['q-open']);
    expect(briefing.settled.map((q) => q.id)).toEqual(['q-done']);
    // The ANSWER rides along — a settled question with no answer on the panel would be the same
    // loss as deleting it, one layer up.
    expect(briefing.settled[0]?.answer).toBe('answer q-done');
    expect(briefing.settled[0]?.settledAt).toBe('2026-08-24T09:00:00Z');
    // DISJOINT: no question is ever briefed in both blocks.
    expect(briefing.waiting.some((q) => briefing.settled.includes(q))).toBe(false);
  });

  it('an arc whose ONLY question is settled is waiting on nobody, and keeps the answer visible', () => {
    const briefing = arcBriefing(arc({ id: 'a', questions: [settledQuestion('q-done')] }));
    expect(briefing.waiting).toEqual([]);
    expect(briefing.settled.map((q) => q.id)).toEqual(['q-done']);
  });

  it('THE FENCE: a settled question never lights the LANE state, at either width', () => {
    // The same shape as ADR-0359 D4's proposal fence, and asserted across ONE fixture at BOTH
    // widths for the same reason: the panel reads the whole rollup off `/api/arcs/<id>` and the
    // lane reads the summary row off `/api/arcs`, so a divergence only shows when both are read
    // from the same declaration. `decision-read-measurement-arc` reported a false wait for a day
    // because a settled question still counted; a lane that lit on one would restore that report
    // in the strip.
    const fixture = { id: 'a', questions: [settledQuestion('q-done')] };
    expect(arcBriefing(arc(fixture)).settled).toHaveLength(1);
    expect(arcState(lane(fixture), NOW)).toBe('quiet');
    // …and an OPEN question on the same arc still does light it, so the fence is not just an
    // assertion that this lane never lights.
    expect(arcState(lane({ id: 'b', questions: [question('q-open')] }), NOW)).toBe('waiting');
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

// ---------- inc-01/inc-02 (arc-queue-and-question-legibility-arc): the question's own reading ----------

/** A structured `open-question` asset, the way `GuidanceAsset.fields` carries it off the wire. */
function questionAsset(id: string, fields: Record<string, string>): GuidanceAsset {
  return {
    id,
    category: 'open-question',
    title: `Q ${id}`,
    description: `description ${id}`,
    body: '',
    fields,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('wordCount — the crude whitespace measure the arc’s own corpus sweep used', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('one two three')).toBe(3);
  });

  it('is 0 for undefined, empty, and whitespace-only text', () => {
    expect(wordCount(undefined)).toBe(0);
    expect(wordCount('')).toBe(0);
    expect(wordCount('   \n\t  ')).toBe(0);
  });

  it('collapses runs of whitespace rather than counting empty tokens', () => {
    expect(wordCount('one   two\n\nthree')).toBe(3);
  });
});

describe('questionFields — the structured fields ArcRollupQuestion does not carry', () => {
  it('reads a question’s fields off the matching asset', () => {
    const assets = [questionAsset('q1', { statement: 'Should we?', context: 'Some context.' })];
    expect(questionFields(assets, 'q1')).toEqual({ statement: 'Should we?', context: 'Some context.' });
  });

  it('is {} when no asset matches, or the corpus is empty — never throws', () => {
    expect(questionFields([], 'q1')).toEqual({});
    expect(questionFields([questionAsset('other', { statement: 'x' })], 'q1')).toEqual({});
  });
});

describe('questionRowStats — the flat list’s word count + no-diagram flag (inc-01)', () => {
  it('sums word count over exactly the seven readable fields, never `answer`', () => {
    const fields = {
      stakes: 'a b',
      statement: 'c d e',
      context: 'f',
      options: 'g h',
      analogy: 'i',
      diagram: 'j k',
      recommendation: 'l',
      // `answer` only exists on a SETTLED question and is a different reading job — it must not
      // inflate an open question's reading cost.
      answer: 'm n o p q r s t u v',
    };
    expect(QUESTION_WORD_BUDGET_FIELDS).toHaveLength(7);
    expect(questionRowStats(fields).wordTotal).toBe(12); // 2+3+1+2+1+2+1, not +10 for `answer`
  });

  it('flags `noDiagram` exactly when the diagram field is absent or blank', () => {
    expect(questionRowStats({ diagram: '' }).noDiagram).toBe(true);
    expect(questionRowStats({}).noDiagram).toBe(true);
    expect(questionRowStats({ diagram: '   ' }).noDiagram).toBe(true);
    expect(questionRowStats({ diagram: 'a picture' }).noDiagram).toBe(false);
  });
});

describe('parseOptionCards — the FOR:/AGAINST: convention, split into cards (inc-02)', () => {
  it('splits blank-line-separated paragraphs into summary/for/against', () => {
    const options = parseOptionCards(
      'A — do the small thing. FOR: cheap and reversible. AGAINST: does not solve it.\n\n' +
        'B — do the big thing. FOR: solves it for good. AGAINST: expensive.',
    );
    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({
      summary: 'A — do the small thing.',
      forText: 'cheap and reversible.',
      againstText: 'does not solve it.',
    });
    expect(options[1]?.summary).toBe('B — do the big thing.');
    expect(options[1]?.forText).toBe('solves it for good.');
    expect(options[1]?.againstText).toBe('expensive.');
  });

  it('is [] for undefined or blank text', () => {
    expect(parseOptionCards(undefined)).toEqual([]);
    expect(parseOptionCards('   ')).toEqual([]);
  });

  it('a paragraph with no FOR:/AGAINST: marker survives whole, never dropped', () => {
    const options = parseOptionCards('Just some prose with no markers at all.');
    expect(options).toEqual([{ summary: 'Just some prose with no markers at all.', forText: '', againstText: '' }]);
  });
});

describe('questionWordBudget — total / above the fold / folded, always arithmetically consistent', () => {
  it('folds exactly analogy + context; everything else counts as above the fold', () => {
    const fields = {
      stakes: 'a b', // 2
      statement: 'c d e', // 3
      context: 'f g h i', // 4 — folded
      options: 'j k', // 2
      analogy: 'l m n', // 3 — folded
      diagram: 'o', // 1
      recommendation: 'p q', // 2
    };
    const budget = questionWordBudget(fields);
    expect(budget.total).toBe(17); // 2+3+4+2+3+1+2
    expect(budget.folded).toBe(7); // analogy(3) + context(4)
    expect(budget.aboveFold).toBe(10); // stakes(2) + statement(3) + options(2) + diagram(1) + recommendation(2)
    // The arithmetic invariant holds BY CONSTRUCTION (`aboveFold` is defined as `total - folded`),
    // so a reader never has to wonder where a fourth, uncounted bucket of words went.
    expect(budget.aboveFold + budget.folded).toBe(budget.total);
  });

  it('is all zero for an empty field set', () => {
    expect(questionWordBudget({})).toEqual({ total: 0, aboveFold: 0, folded: 0 });
  });
});


describe('parseOptionCards — the parsing edges the happy path cannot reach', () => {
  it('splits on BLANK LINES, one card per option, and trims each', () => {
    const cards = parseOptionCards('  Option A. FOR: cheap AGAINST: slow  \n\n\n  Option B. FOR: fast AGAINST: dear ');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ summary: 'Option A.', forText: 'cheap', againstText: 'slow' });
    expect(cards[1]).toEqual({ summary: 'Option B.', forText: 'fast', againstText: 'dear' });
  });

  it('a SINGLE newline does not start a new card — options run to several lines', () => {
    // The separator is a BLANK line. Splitting on any newline would shred a multi-line option into
    // one card per line, each losing the FOR:/AGAINST: pair that spans them.
    const cards = parseOptionCards('Option A,\nwhich continues on this line.\nFOR: cheap\nAGAINST: slow');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.summary).toBe('Option A,\nwhich continues on this line.');
    expect(cards[0]?.forText).toBe('cheap');
    expect(cards[0]?.againstText).toBe('slow');
  });

  it('a blank line carrying WHITESPACE still separates two cards', () => {
    const cards = parseOptionCards('Option A. FOR: a AGAINST: b\n   \t  \nOption B. FOR: c AGAINST: d');
    expect(cards).toHaveLength(2);
    expect(cards[1]?.summary).toBe('Option B.');
  });

  it('EMPTY input yields no cards, and so does whitespace-only input', () => {
    expect(parseOptionCards(undefined)).toEqual([]);
    expect(parseOptionCards('')).toEqual([]);
    expect(parseOptionCards('   \n\n  \t ')).toEqual([]);
  });

  it('a paragraph with NEITHER marker survives whole — it is not a parse failure', () => {
    // A question predating the convention, or one that phrases the trade-off differently. Dropping
    // it would silently delete an option from the owner's view, which is the one outcome a read
    // surface must never produce.
    const cards = parseOptionCards('Option C, described in prose with no markers at all.');
    expect(cards).toEqual([{ summary: 'Option C, described in prose with no markers at all.', forText: '', againstText: '' }]);
  });

  it('a paragraph with FOR: but no AGAINST: survives whole, rather than half-parsed', () => {
    const cards = parseOptionCards('Option D. FOR: it is cheap');
    expect(cards[0]).toEqual({ summary: 'Option D. FOR: it is cheap', forText: '', againstText: '' });
  });

  it('AGAINST: BEFORE FOR: is not a pair — the paragraph survives whole', () => {
    // `indexOf('AGAINST:', forIdx)` searches only AFTER the FOR: marker, so a reversed pair reads as
    // no pair at all rather than slicing a negative range and inventing two empty halves.
    const cards = parseOptionCards('Option E. AGAINST: slow FOR: cheap');
    expect(cards[0]?.summary).toBe('Option E. AGAINST: slow FOR: cheap');
    expect(cards[0]?.forText).toBe('');
    expect(cards[0]?.againstText).toBe('');
  });

  it('a marker at position ZERO is still a marker — the summary is simply empty', () => {
    // `forIdx === -1` is the absent test, NOT falsiness: a `FOR:` at index 0 is real, and a check
    // that treated 0 as absent would drop the pair on exactly the shortest, most-marked-up option.
    const cards = parseOptionCards('FOR: cheap AGAINST: slow');
    expect(cards[0]).toEqual({ summary: '', forText: 'cheap', againstText: 'slow' });
  });

  it('only the FIRST FOR: and the AGAINST: after it are markers — later ones stay in the text', () => {
    const cards = parseOptionCards('Option F. FOR: cheap AGAINST: slow, and AGAINST: fiddly');
    expect(cards[0]?.forText).toBe('cheap');
    expect(cards[0]?.againstText).toBe('slow, and AGAINST: fiddly');
  });
});

describe('parseOptionCards — the whitespace and sentinel edges', () => {
  it('leading and trailing blank lines produce no empty cards', () => {
    // The split yields empty strings at both ends. Without the filter each becomes a card with an
    // empty summary — a blank option box in the owner's face, between the real ones.
    const cards = parseOptionCards('\n\nOption A. FOR: a AGAINST: b\n\n');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.summary).toBe('Option A.');
  });

  it('a marker-less paragraph is TRIMMED, not carried with its surrounding whitespace', () => {
    // The marker-less path returns the paragraph as the summary verbatim, so if paragraphs were not
    // trimmed on the way in, this card alone would keep its indentation while every parsed card
    // lost it — the one shape where the per-paragraph trim is observable.
    const cards = parseOptionCards('Option A. FOR: a AGAINST: b\n\n   Option B in plain prose.   ');
    expect(cards[1]?.summary).toBe('Option B in plain prose.');
  });

  it('finds a FOR: marker wherever it sits, including one character in', () => {
    // `forIdx === -1` is the ABSENT test. Comparing against any other position instead would drop
    // the pair for options whose marker happens to land at that index — silently, and only for them.
    const cards = parseOptionCards('A FOR: cheap AGAINST: slow');
    expect(cards[0]).toEqual({ summary: 'A', forText: 'cheap', againstText: 'slow' });
    const oneIn = parseOptionCards('AFOR: cheap AGAINST: slow');
    expect(oneIn[0]).toEqual({ summary: 'A', forText: 'cheap', againstText: 'slow' });
  });

  it('an AGAINST: with no FOR: at all is not a pair', () => {
    const cards = parseOptionCards('Option A, described without a FOR half. AGAINST: it is slow.');
    expect(cards[0]?.forText).toBe('');
    expect(cards[0]?.againstText).toBe('');
    expect(cards[0]?.summary).toBe('Option A, described without a FOR half. AGAINST: it is slow.');
  });
});
