// Unit test for the story-green crown roll-up wiring (ADR-0083 Fork A, refining ADR-0082,
// apiRouter.applyUatCrowns): a story that declares per-test UAT test criteria greens from the AND of (all
// capabilities proven healthy) AND (the per-test UAT AND-roll-up), NOT its own unit-id verdict —
// healthy ⇒ a pass crown, unhealthy ⇒ a fail crown (a red plant or a UAT regression), unproven ⇒ NO
// verdict (the world under-claims, never a stale green). Fed the REAL `rollupStoryGreen` + real
// verdict events, so the studio crown derivation is held to the same compute the CLI/`storytree tree`
// uses.

import { describe, it, expect } from 'vitest';
import { SIGNING_EVENT_KIND } from '@storytree/proof-protocol';
import { rollupStoryGreen, rollupCapStatus, gateStoryGreenOnOpenQuestions } from '@storytree/orchestrator';

import {
  applyUatCrowns,
  applyCapCoverage,
  applyOpenQuestionGate,
} from './apiRouter.js';
import type { TreeCapability, TreeStory } from '../src/types';

function story(id: string, over: Partial<TreeStory> = {}): TreeStory {
  return {
    id,
    title: id,
    outcome: '',
    status: 'proposed',
    proofMode: 'UAT',
    uatWitness: 'human',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
    ...over,
  };
}

function cap(id: string): TreeCapability {
  return { id, title: id, outcome: '', status: null, proofMode: '', dependsOn: [], testCount: 0 };
}

/** A typed empty coverage map (ADR-0097) — the greenfield default (each cap earns its own verdict). */
function noCoverage(): Map<string, { id: string; covers?: readonly string[] }[]> {
  return new Map();
}

function verdictEvent(seq: number, unitId: string, outcome: 'pass' | 'fail', at: string) {
  return {
    kind: SIGNING_EVENT_KIND,
    seq,
    doc: {
      unitId,
      proofMode: 'operator-attested',
      outcome,
      commitSha: 'cafebabe',
      signer: 'owner@example.com',
      runId: `run-${seq}`,
      at,
    },
  };
}

const C1 = { criterionId: 'uatc_111111111111111111111111', revisionId: 'uatr1:1111111111111111' };
const C2 = { criterionId: 'uatc_222222222222222222222222', revisionId: 'uatr1:2222222222222222' };

function criterionVerdictEvent(
  seq: number,
  criterion: typeof C1,
  outcome: 'pass' | 'fail',
  at: string,
) {
  const event = verdictEvent(seq, criterion.criterionId, outcome, at);
  return { ...event, doc: { ...event.doc, ...criterion } };
}

describe('applyUatCrowns', () => {
  it('greens a story crown when every capability AND per-test verdict passes', () => {
    const stories = [story('demo', { capabilities: [cap('demo.cap-a')] })];
    const map = new Map([['demo', [C1, C2]]]);
    const events = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-06-20T00:30:00.000Z'),
      criterionVerdictEvent(2, C1, 'pass', '2026-06-20T01:00:00.000Z'),
      criterionVerdictEvent(3, C2, 'pass', '2026-06-20T02:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-20T02:00:00.000Z' });
  });

  it('a foundational port (zero capabilities) greens on its UAT alone (vacuous capability clause)', () => {
    const stories = [story('proof-protocol', { capabilities: [] })];
    const map = new Map([['proof-protocol', [C1]]]);
    const events = [criterionVerdictEvent(1, C1, 'pass', '2026-06-20T02:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-20T02:00:00.000Z' });
  });

  it('under-claims (no crown verdict) when a capability is still unproven, even with green UAT', () => {
    // Fork A: capabilities-green is NECESSARY — a pre-existing own-unit verdict must be DROPPED.
    const stories = [
      story('demo', {
        capabilities: [cap('demo.cap-a')],
        verdict: { outcome: 'pass', at: 'stale' },
      }),
    ];
    const map = new Map([['demo', [C1]]]);
    // The UAT is proven, but demo.cap-a never earned a signed pass.
    const events = [criterionVerdictEvent(1, C1, 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('under-claims (no crown verdict) when a per-test verdict is still unproven', () => {
    const stories = [story('demo', { verdict: { outcome: 'pass', at: 'stale' } })];
    const map = new Map([['demo', [C1, C2]]]);
    const events = [criterionVerdictEvent(1, C1, 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('withers a story crown to fail when a proven test regressed', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [C1, C2]]]);
    const events = [
      criterionVerdictEvent(1, C1, 'pass', '2026-06-20T01:00:00.000Z'),
      criterionVerdictEvent(2, C2, 'pass', '2026-06-20T02:00:00.000Z'),
      criterionVerdictEvent(3, C2, 'fail', '2026-06-20T03:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: '2026-06-20T03:00:00.000Z' });
  });

  it('withers a story crown to fail when a CAPABILITY regressed, even with green UAT (the at spans both clauses)', () => {
    const stories = [story('demo', { capabilities: [cap('demo.cap-a')] })];
    const map = new Map([['demo', [C1]]]);
    const events = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-06-20T01:00:00.000Z'),
      criterionVerdictEvent(2, C1, 'pass', '2026-06-20T02:00:00.000Z'),
      verdictEvent(3, 'demo.cap-a', 'fail', '2026-06-20T03:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: '2026-06-20T03:00:00.000Z' });
  });

  it('leaves a story with no per-test tests untouched (its own-unit verdict stands)', () => {
    const stories = [story('legacy', { verdict: { outcome: 'pass', at: 'own-unit' } })];
    const map = new Map<string, { id: string }[]>(); // legacy declares no per-test tests
    applyUatCrowns(stories, map, noCoverage(), [], rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: 'own-unit' });
  });

  // ── ADR-0097: brownfield capability coverage via an adopted gate ──
  it('greens a brownfield crown when an adopted gate covers a cap, but holds it when a cap is uncovered', () => {
    const stories = [
      story('brown', { status: 'mapped', capabilities: [cap('covered-cap'), cap('pocket-cap')] }),
    ];
    // The gate is the only own-proof obligation; it covers covered-cap. pocket-cap is covered by no gate.
    const map = new Map([['brown', [{ id: 'brown#gate-1' }]]]);
    const coverage = new Map([['brown', [{ id: 'brown#gate-1', covers: ['covered-cap'] }]]]);

    // Only the gate is adopted → covered-cap greens via coverage, pocket-cap holds the crown unproven.
    const gateOnly = [verdictEvent(1, 'brown#gate-1', 'pass', '2026-06-23T01:00:00.000Z')];
    applyUatCrowns(stories, map, coverage, gateOnly, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();

    // Once pocket-cap also earns its own pass, every cap is satisfied and the crown greens.
    const stories2 = [
      story('brown', { status: 'mapped', capabilities: [cap('covered-cap'), cap('pocket-cap')] }),
    ];
    const both = [
      verdictEvent(1, 'brown#gate-1', 'pass', '2026-06-23T01:00:00.000Z'),
      verdictEvent(2, 'pocket-cap', 'pass', '2026-06-23T02:00:00.000Z'),
    ];
    applyUatCrowns(stories2, map, coverage, both, rollupStoryGreen);
    expect(stories2[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-23T02:00:00.000Z' });
  });
});

// ── ADR-0097 §5 / owner Option A (2026-06-25): the per-cap PLANT greens like the crown ──
// applyCapCoverage synthesizes a covered cap's verdict so the SHARED provenStatus fold paints it the
// SAME green as an own-driven cap — the world's plants stop reading brown under a covered/green crown.
// Fed the REAL rollupCapStatus, the same compute the crown's capability clause (rollupStoryGreen) uses.
describe('applyCapCoverage', () => {
  it('synthesizes a pass verdict (the covering gate\'s time) for a covered cap; leaves an uncovered cap untouched', () => {
    const stories = [
      story('brown', { status: 'mapped', capabilities: [cap('covered-cap'), cap('pocket-cap')] }),
    ];
    const coverage = new Map([['brown', [{ id: 'brown#gate-1', covers: ['covered-cap'] }]]]);
    const events = [verdictEvent(1, 'brown#gate-1', 'pass', '2026-06-23T01:00:00.000Z')];
    applyCapCoverage(stories, coverage, events, rollupCapStatus);
    // covered-cap greens via coverage, stamped with the gate's verdict time; pocket-cap stays unproven.
    expect(stories[0]!.capabilities[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-23T01:00:00.000Z' });
    expect(stories[0]!.capabilities[1]!.verdict).toBeUndefined();
  });

  it('never overrides a cap that already carries its own signed verdict (a regression stays red)', () => {
    const reg = cap('covered-cap');
    reg.verdict = { outcome: 'fail', at: 'own-fail' };
    const stories = [story('brown', { status: 'mapped', capabilities: [reg] })];
    const coverage = new Map([['brown', [{ id: 'brown#gate-1', covers: ['covered-cap'] }]]]);
    const events = [verdictEvent(1, 'brown#gate-1', 'pass', '2026-06-23T01:00:00.000Z')];
    applyCapCoverage(stories, coverage, events, rollupCapStatus);
    expect(stories[0]!.capabilities[0]!.verdict).toEqual({ outcome: 'fail', at: 'own-fail' });
  });

  it('a story with no coverage (greenfield) is left untouched', () => {
    const stories = [story('green', { capabilities: [cap('cap-a')] })];
    applyCapCoverage(stories, noCoverage(), [verdictEvent(1, 'cap-a', 'pass', 'x')], rollupCapStatus);
    expect(stories[0]!.capabilities[0]!.verdict).toBeUndefined();
  });
});

// ── ADR-0107 (generalising ADR-0106 d4): an OPEN question attached to a story's proving process ──
// WITHHOLDS the story's green until it is resolved. The world's crown must reflect this the same way
// the CLI/spine roll-up does — fed the REAL `gateStoryGreenOnOpenQuestions`, the one definition of the
// rule. A pass crown over an open fork drops to NO verdict (the world under-claims); red/absent untouched.
describe('applyOpenQuestionGate', () => {
  it('withholds a would-be-green crown while a gating OQ is open (pass crown → no verdict)', () => {
    const s = story('blocked', { capabilities: [cap('blocked.cap-a')] });
    s.verdict = { outcome: 'pass', at: '2026-06-25T00:00:00.000Z' }; // applyUatCrowns greened it
    const stories = [s];
    applyOpenQuestionGate(stories, new Map([['blocked', 1]]), gateStoryGreenOnOpenQuestions);
    expect(stories[0]!.verdict).toBeUndefined(); // the open fork withholds the green
  });

  it('resolving the OQ (count 0 / absent) leaves the green crown in place — unblocked', () => {
    const s = story('clear', { capabilities: [cap('clear.cap-a')] });
    s.verdict = { outcome: 'pass', at: 'green-at' };
    const stories = [s];
    applyOpenQuestionGate(stories, new Map(), gateStoryGreenOnOpenQuestions); // no gating OQs
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: 'green-at' });
  });

  it('never paints red — a fail crown with an open OQ is left as fail (a withheld green is not a regression)', () => {
    const s = story('red', { capabilities: [cap('red.cap-a')] });
    s.verdict = { outcome: 'fail', at: 'red-at' };
    const stories = [s];
    applyOpenQuestionGate(stories, new Map([['red', 2]]), gateStoryGreenOnOpenQuestions);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: 'red-at' });
  });

  it('an already-unproven story (no verdict) with an open OQ stays unproven, never throws', () => {
    const stories = [story('unproven')];
    applyOpenQuestionGate(stories, new Map([['unproven', 1]]), gateStoryGreenOnOpenQuestions);
    expect(stories[0]!.verdict).toBeUndefined();
  });
});

// ── ADR-0443: the crown reaches stories it used to skip, and the map agrees with the CLI ─────────

describe('applyUatCrowns — ADR-0443', () => {
  it('crowns a story whose obligation set is EMPTY, on its proven capabilities alone (D2/D3)', () => {
    // The state D2 unblocks: every acceptance step is unsignable, so `crownObligations` returns [].
    // Before ADR-0443 this story was SKIPPED here (`if (!tests || tests.length === 0) continue`) and
    // stayed grey forever — the defect, not the fix. It is also `binding-staleness`'s exact shape.
    const stories = [story('binding-staleness-ish', { capabilities: [cap('s.cap-a')] })];
    const map = new Map([['binding-staleness-ish', [] as never[]]]);
    const events = [verdictEvent(1, 's.cap-a', 'pass', '2026-08-25T00:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-08-25T00:00:00.000Z' });
  });

  it('does NOT green a story that declares nothing and proves nothing (D3 vacuity floor)', () => {
    // `website`: no capabilities, no obligations. Both clauses pass vacuously; only D3 holds it grey.
    const stories = [story('website-ish', { capabilities: [cap('s.cap-a')] })];
    const map = new Map([['website-ish', [] as never[]]]);
    applyUatCrowns(stories, map, noCoverage(), [], rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('leaves a legacy story with NOTHING to read untouched — its own-unit verdict stands', () => {
    const stories = [story('legacy', { capabilities: [], verdict: { outcome: 'pass', at: 'own' } })];
    const map = new Map([['legacy', [] as never[]]]);
    applyUatCrowns(stories, map, noCoverage(), [], rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: 'own' });
  });

  it('a `proposed` capability nobody began does not withhold a proven story crown (D1)', () => {
    // ADR-0416's `drive-machinery` defect: naming already-implemented behaviour at capability grain
    // used to remove the crown. Declaring intent must never take away an earned green.
    const stories = [
      story('demo', {
        capabilities: [
          { ...cap('demo.cap-a'), status: 'healthy' },
          { ...cap('demo.cap-new'), status: 'proposed' },
        ],
      }),
    ];
    const map = new Map([['demo', [C1]]]);
    const events = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-08-25T00:00:00.000Z'),
      criterionVerdictEvent(2, C1, 'pass', '2026-08-25T01:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-08-25T01:00:00.000Z' });
  });

  it('the map and the CLI agree on a capability proven then rebuilt (the measured divergence)', () => {
    // The studio reads `events.verdict` ALONE; the CLI reads a merged stream with lifecycle work
    // events in it. `rollupStatus` was last-event-wins, so a `building` mark after a signed pass
    // un-proved the capability for the CLI while the map still read it green — 12 islands green on
    // the map against 10 in `storytree tree`. Both readers must now land on the same crown.
    const verdictsOnly = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-08-25T00:00:00.000Z'),
      criterionVerdictEvent(2, C1, 'pass', '2026-08-25T01:00:00.000Z'),
    ];
    const merged = [
      ...verdictsOnly,
      { kind: 'work', seq: 3, doc: { unitId: 'demo.cap-a', event: 'building', runId: 'r2' } },
    ];
    const crowns = [verdictsOnly, merged].map((events) => {
      const stories = [story('demo', { capabilities: [cap('demo.cap-a')] })];
      applyUatCrowns(stories, new Map([['demo', [C1]]]), noCoverage(), events, rollupStoryGreen);
      return stories[0]!.verdict;
    });
    expect(crowns[0]).toEqual({ outcome: 'pass', at: '2026-08-25T01:00:00.000Z' });
    expect(crowns[1]).toEqual(crowns[0]);
    // …and the per-capability plant agrees with the crown, from either stream.
    expect(rollupCapStatus('demo.cap-a', verdictsOnly)).toBe('healthy');
    expect(rollupCapStatus('demo.cap-a', merged)).toBe('healthy');
  });
});
