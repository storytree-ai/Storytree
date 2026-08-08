// TreeView's pure claim-layer helpers (ADR-0200 D7): the `?claims=` mode reader (now LIVE by
// default — the flag retires as a default-OFF gate, not as machinery), the DB-free demo seam
// (all three grades + a departure), and the waiting-order contract the scene path leans on.
// Stage-1 red-green of the geometry/behaviour layer (ADR-0070); the LOOK is operator-attested.

import { describe, it, expect } from 'vitest';
import {
  demoClaims,
  demoDepartures,
  foldBuildOntoClaims,
  nextSceneNow,
  orderClaimsForScene,
  readClaimsMode,
  resolveBuildPhase,
} from './TreeView.js';
import type { BuildActivity, ClaimActivity, TreeStory } from '../types';

const story = (id: string): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  capabilities: [],
});

const claim = (over: Partial<ClaimActivity> = {}): ClaimActivity => ({
  unitId: 'a',
  kind: 'claim',
  sessionId: 's1',
  branch: 'claude/x',
  intent: 'edit',
  at: '2026-07-16T00:00:00.000Z',
  ...over,
});

describe('readClaimsMode (ADR-0200 D7 — the flag retires LIVE by default)', () => {
  it('absent `?claims=` reads live (the D7 default flip)', () => {
    expect(readClaimsMode('')).toBe('live');
    expect(readClaimsMode('?substrate=hex')).toBe('live');
  });

  it('every legacy "on" spelling still reads live', () => {
    expect(readClaimsMode('?claims=on')).toBe('live');
    expect(readClaimsMode('?claims=live')).toBe('live');
    expect(readClaimsMode('?claims=1')).toBe('live');
    expect(readClaimsMode('?claims=true')).toBe('live');
  });

  it('an unrecognised value also falls through to live (never a silent off)', () => {
    expect(readClaimsMode('?claims=wat')).toBe('live');
  });

  it('`demo` selects the DB-free preview seam', () => {
    expect(readClaimsMode('?claims=demo')).toBe('demo');
  });

  it('`off`/`0`/`false` are the one remaining explicit escape hatch', () => {
    expect(readClaimsMode('?claims=off')).toBe('off');
    expect(readClaimsMode('?claims=0')).toBe('off');
    expect(readClaimsMode('?claims=false')).toBe('off');
  });
});

describe('demoClaims / demoDepartures (ADR-0200 D7 DB-free preview seam)', () => {
  const stories = [story('a'), story('b'), story('c'), story('d')];

  it('seeds all three grades across the first three visible stories', () => {
    const claims = demoClaims(stories);
    expect(claims).toHaveLength(3);
    expect(claims.map((c) => c.grade).sort()).toEqual(['exploring', 'waiting', 'work']);
    // every demo claim is honestly typed — never anything but the claim discriminator.
    for (const c of claims) expect(c.kind).toBe('claim');
  });

  it('seeds a fading departure on the NEXT story after the three live-grade demos', () => {
    const departures = demoDepartures(stories);
    expect(departures).toHaveLength(1);
    expect(departures[0]?.unitId).toBe('d');
    expect(departures[0]?.ageMs).toBeGreaterThan(0);
  });

  it('demoDepartures degrades to empty when the world has too few stories to spare a fourth', () => {
    expect(demoDepartures(stories.slice(0, 3))).toEqual([]);
    expect(demoDepartures([])).toEqual([]);
  });
});

describe('orderClaimsForScene (ADR-0200 D7 waiting-order contract)', () => {
  it('sorts claims ascending by `at` — oldest first', () => {
    const c1 = claim({ sessionId: 's1', at: '2026-07-16T00:03:00.000Z' });
    const c2 = claim({ sessionId: 's2', at: '2026-07-16T00:01:00.000Z' });
    const c3 = claim({ sessionId: 's3', at: '2026-07-16T00:02:00.000Z' });
    expect(orderClaimsForScene([c1, c2, c3]).map((c) => c.sessionId)).toEqual(['s2', 's3', 's1']);
  });

  it('is pure — never mutates its input array', () => {
    const input = [claim({ sessionId: 's1', at: '2026-07-16T00:03:00.000Z' }), claim({ sessionId: 's2', at: '2026-07-16T00:01:00.000Z' })];
    const before = input.map((c) => c.sessionId);
    orderClaimsForScene(input);
    expect(input.map((c) => c.sessionId)).toEqual(before);
  });

  it('empty in, empty out', () => {
    expect(orderClaimsForScene([])).toEqual([]);
  });
});

// ADR-0212's multi-run collapse rule. The build wisp was keyed by runId, so N concurrent runs drew
// N bodies; merged onto the ONE session body they collapse to one, which forces a resolution rule.
describe('resolveBuildPhase (ADR-0212 — RED WINS)', () => {
  const build = (over: Partial<BuildActivity> = {}): BuildActivity => ({
    unitId: 'a',
    tier: 'capability',
    runId: 'r1',
    at: '2026-07-19T00:00:00.000Z',
    ...over,
  });

  it('no builds → no phase, so the claim body carries no band at all', () => {
    expect(resolveBuildPhase([])).toBeUndefined();
  });

  it('a single build resolves to its own phase', () => {
    expect(resolveBuildPhase([build({ phase: 'CONFIRM_GREEN' })])).toBe('CONFIRM_GREEN');
  });

  it('a RED run beats a green one — a green elsewhere must never mask a failing run', () => {
    // the whole reason the rule exists: collapsing to one body could otherwise hide the red.
    expect(
      resolveBuildPhase([
        build({ runId: 'r1', phase: 'GATE' }),
        build({ runId: 'r2', phase: 'CONFIRM_RED' }),
      ]),
    ).toBe('CONFIRM_RED');
    // and order-independently — not an artefact of which run happened to be read first.
    expect(
      resolveBuildPhase([
        build({ runId: 'r1', phase: 'CONFIRM_RED' }),
        build({ runId: 'r2', phase: 'GATE' }),
      ]),
    ).toBe('CONFIRM_RED');
  });

  it('ranks red < building < green — implementing beats green, red beats implementing', () => {
    expect(
      resolveBuildPhase([build({ phase: 'GATE' }), build({ runId: 'r2', phase: 'IMPLEMENT' })]),
    ).toBe('IMPLEMENT');
    expect(
      resolveBuildPhase([build({ phase: 'IMPLEMENT' }), build({ runId: 'r2', phase: 'AUTHOR_TEST' })]),
    ).toBe('AUTHOR_TEST');
  });

  it('a LIVE build whose row never stamped a phase still reads as building, never as nothing', () => {
    // a pre-ADR-0048 mark or the json read: dropping it would silently lose "someone is building
    // here" on those rows. IMPLEMENT is the phase that folds to the neutral `building` band.
    expect(resolveBuildPhase([build()])).toBe('IMPLEMENT');
    // a phase-less run alongside a red one still loses to the red.
    expect(resolveBuildPhase([build(), build({ runId: 'r2', phase: 'CONFIRM_RED' })])).toBe(
      'CONFIRM_RED',
    );
  });
});

// ADR-0326: the build→claim join is at the CLAIMED UNIT, not the story.
//
// Both layers arrive here already grouped to the story (buildsByStory / claimsByStory resolve a
// member id up to its owning story), so "same group" says nothing about "same session". ADR-0212
// joined at that group and argued it was sound from the ADR-0200 D2 mutex — but the mutex is per
// UNIT ID, so story grain is the one grain at which it guarantees nothing. Two shapes break it, and
// the second predates PR #1220: a member build (which never claimed the story) landing in the group
// of a story-grain claim, and two legitimate ADR-0270 D1 work claims on disjoint capabilities of one
// story, where `find` returned whichever sorted first rather than the building one.
describe('foldBuildOntoClaims (ADR-0326 — join at the claimed unit)', () => {
  const now = new Date('2026-08-08T00:10:00.000Z');
  const at = '2026-08-08T00:00:00.000Z';
  const build = (over: Partial<BuildActivity> = {}): BuildActivity => ({
    unitId: 'cap-a',
    tier: 'capability',
    runId: 'r1',
    at,
    ...over,
  });
  /** What the assertions care about: whose body it is, at what grade, wearing which band. */
  const shape = (
    folded: ReturnType<typeof foldBuildOntoClaims>,
  ): { key: string; grade: string | undefined; phase: string | undefined }[] =>
    folded.map((f) => ({ key: f.key, grade: f.grade, phase: f.phase }));

  it("a member build does NOT paint a story-grain claim held by a DIFFERENT session", () => {
    // The shape PR #1220 exposed: session A legitimately holds S at story grain (ADR-0270 D1
    // cross-capability work) while session B drives `story build S --real`, which since aa293a0d
    // claims the MEMBERS and not S. Both land in S's group; only B is building.
    const folded = foldBuildOntoClaims(
      [claim({ unitId: 'story-s', sessionId: 'session-a', at })],
      [build({ unitId: 'cap-a', phase: 'CONFIRM_RED', runId: 'run-b' })],
      now,
    );
    // A's body is a CLAIM, not a build — it must carry no band at all.
    expect(shape(folded)[0]).toEqual({ key: 'session-a', grade: 'work', phase: undefined });
    // and the unclaimed build still renders as ITSELF (ADR-0212's claim-less fallback), rather than
    // vanishing into A's body — one body per actor, and there are two actors here.
    expect(shape(folded)[1]).toEqual({ key: 'run-b', grade: 'work', phase: 'CONFIRM_RED' });
    expect(folded).toHaveLength(2);
  });

  it('the same mis-join through the OLDER door: `node build cap-of-S` beside a story claim', () => {
    // Establishes the defect predates PR #1220 — a single-node build never took the story id
    // either, and buildsByStory has always rolled it up to the parent.
    const folded = foldBuildOntoClaims(
      [claim({ unitId: 'story-s', sessionId: 'session-a', at })],
      [build({ unitId: 'cap-of-s', tier: 'capability', phase: 'IMPLEMENT', runId: 'run-old' })],
      now,
    );
    expect(shape(folded)).toEqual([
      { key: 'session-a', grade: 'work', phase: undefined },
      { key: 'run-old', grade: 'work', phase: 'IMPLEMENT' },
    ]);
  });

  it('with two ADR-0270 D1 work claims on one story, the BUILDING one gets the band', () => {
    // The mutex is per unit id, so two sessions on disjoint capabilities of one story is legitimate
    // and both roll up here. The old `claims.find(work)` returned the oldest, not the builder.
    const folded = foldBuildOntoClaims(
      [
        claim({ unitId: 'cap-a', sessionId: 'session-a', at: '2026-08-08T00:00:00.000Z' }),
        claim({ unitId: 'cap-b', sessionId: 'session-b', at: '2026-08-08T00:05:00.000Z' }),
      ],
      [build({ unitId: 'cap-b', phase: 'CONFIRM_GREEN', runId: 'run-b' })],
      now,
    );
    expect(shape(folded)).toEqual([
      { key: 'session-a', grade: 'work', phase: undefined },
      { key: 'session-b', grade: 'work', phase: 'CONFIRM_GREEN' },
    ]);
  });

  it('RED WINS is resolved PER UNIT — one unit’s red never smears onto another’s body', () => {
    // ADR-0212's collapse rule is about N runs on ONE body; applying it story-wide painted an
    // unrelated session's body red. Each unit resolves its own.
    const folded = foldBuildOntoClaims(
      [
        claim({ unitId: 'cap-a', sessionId: 'session-a', at }),
        claim({ unitId: 'cap-b', sessionId: 'session-b', at }),
      ],
      [
        build({ unitId: 'cap-a', phase: 'CONFIRM_RED', runId: 'ra' }),
        build({ unitId: 'cap-b', phase: 'GATE', runId: 'rb' }),
      ],
      now,
    );
    expect(shape(folded)).toEqual([
      { key: 'session-a', grade: 'work', phase: 'CONFIRM_RED' },
      { key: 'session-b', grade: 'work', phase: 'GATE' },
    ]);
  });

  it('RED WINS still collapses MULTIPLE runs on the SAME unit (the ADR-0212 rule, intact)', () => {
    const folded = foldBuildOntoClaims(
      [claim({ unitId: 'cap-a', sessionId: 'session-a', at })],
      [
        build({ unitId: 'cap-a', phase: 'GATE', runId: 'r1' }),
        build({ unitId: 'cap-a', phase: 'CONFIRM_RED', runId: 'r2' }),
      ],
      now,
    );
    expect(shape(folded)).toEqual([{ key: 'session-a', grade: 'work', phase: 'CONFIRM_RED' }]);
  });

  // --- the regression locks: every shape the story-grain join already got RIGHT stays byte-identical.

  it('a work claim on the unit being built still gets the band (the sound case, unchanged)', () => {
    const folded = foldBuildOntoClaims(
      [claim({ unitId: 'story-s', sessionId: 'session-a', at })],
      [build({ unitId: 'story-s', tier: 'story', phase: 'CONFIRM_GREEN', runId: 'run-a' })],
      now,
    );
    expect(shape(folded)).toEqual([{ key: 'session-a', grade: 'work', phase: 'CONFIRM_GREEN' }]);
  });

  it('no claims at all → the claim-less manufactured body, exactly as before', () => {
    const folded = foldBuildOntoClaims([], [build({ phase: 'IMPLEMENT', runId: 'run-ci' })], now);
    expect(shape(folded)).toEqual([{ key: 'run-ci', grade: 'work', phase: 'IMPLEMENT' }]);
    expect(folded[0]?.title).toContain('a build, not a proof');
    // never green, even claim-less (the ADR-0138 §5 honesty wall).
    expect(folded[0]?.colourState).toBe('proving');
  });

  it('no builds → every claim body is bandless and nothing is manufactured', () => {
    const folded = foldBuildOntoClaims(
      [claim({ unitId: 'cap-a', sessionId: 'session-a', at })],
      [],
      now,
    );
    expect(shape(folded)).toEqual([{ key: 'session-a', grade: 'work', phase: undefined }]);
  });

  it('exploring and waiting never carry a band, even with a build on their OWN unit', () => {
    // Window shopping and queueing are not building — the band is a work-stage channel (ADR-0212).
    const folded = foldBuildOntoClaims(
      [
        claim({ unitId: 'cap-a', sessionId: 'session-a', grade: 'exploring', at }),
        claim({ unitId: 'cap-a', sessionId: 'session-b', grade: 'waiting', at }),
      ],
      [build({ unitId: 'cap-a', phase: 'CONFIRM_RED', runId: 'run-x' })],
      now,
    );
    expect(shape(folded).slice(0, 2)).toEqual([
      { key: 'session-a', grade: 'exploring', phase: undefined },
      { key: 'session-b', grade: 'waiting', phase: undefined },
    ]);
    // the build is claimed by NEITHER (a claim that is not `work` is not a builder), so it is an
    // orphan and draws its own body — the same answer the story-grain fold gave.
    expect(shape(folded)[2]).toEqual({ key: 'run-x', grade: 'work', phase: 'CONFIRM_RED' });
  });

  it('claim input order is preserved, so the core’s waiting-queue index contract survives', () => {
    const folded = foldBuildOntoClaims(
      [
        claim({ unitId: 'cap-a', sessionId: 's1', grade: 'waiting', at }),
        claim({ unitId: 'cap-b', sessionId: 's2', grade: 'waiting', at }),
        claim({ unitId: 'cap-c', sessionId: 's3', grade: 'waiting', at }),
      ],
      [],
      now,
    );
    expect(folded.map((f) => f.key)).toEqual(['s1', 's2', 's3']);
  });
});

// The idle-freeze of the scene's `now` (studio-map idle-rebuild, ADR-0069 / memory
// `studio-map-svg-scaling-wall`): while nothing on the map ages with `now`, the 60s ticker must not
// advance the value the scene memo reads — else it rebuilds a byte-identical scene every minute.
describe('nextSceneNow (studio-map idle-freeze of the age ticker)', () => {
  const t0 = new Date('2026-07-22T00:00:00.000Z'); // the frozen previous scene-now
  const t1 = new Date('2026-07-22T00:01:00.000Z'); // one 60s tick later (live now)

  it('idle (no wisps, no bloom, was not blooming) → FREEZES at the previous scene-now', () => {
    expect(nextSceneNow(t1, t0, false, false, false)).toBe(t0);
  });

  it('any wisp present → advances to the live now (a title ages every minute)', () => {
    expect(nextSceneNow(t1, t0, true, false, false)).toBe(t1);
  });

  it('a bloom in-window now → advances to the live now (the bloom is fading)', () => {
    expect(nextSceneNow(t1, t0, false, true, false)).toBe(t1);
  });

  it('the falling edge: not blooming now but WAS last tick → one final advance so the bloom clears', () => {
    // The bloom just aged past its window — a now-driven change no poll reports. Without this extra
    // advance the scene would freeze one tick early and keep a ghost bloom.
    expect(nextSceneNow(t1, t0, false, false, true)).toBe(t1);
  });

  it('after the falling edge, a fully-idle tick freezes again (no perpetual advance)', () => {
    // wasBlooming is false now (cleared last tick), and nothing else ages → frozen.
    expect(nextSceneNow(t1, t0, false, false, false)).toBe(t0);
  });
});
