// Unit test for the story-green crown roll-up wiring (ADR-0083 Fork A, refining ADR-0082,
// apiRouter.applyUatCrowns): a story that declares per-test UAT tests greens from the AND of (all
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
  applyStoryGoGreenProof,
} from './apiRouter.js';
import type { AdoptionPlan, AdoptGate, TreeCapability, TreeStory } from '../src/types';

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
  return { id, title: id, outcome: '', status: null, proofMode: '', dependsOn: [] };
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

describe('applyUatCrowns', () => {
  it('greens a story crown when every capability AND per-test verdict passes', () => {
    const stories = [story('demo', { capabilities: [cap('demo.cap-a')] })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-06-20T00:30:00.000Z'),
      verdictEvent(2, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z'),
      verdictEvent(3, 'demo#uat-2', 'pass', '2026-06-20T02:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-20T02:00:00.000Z' });
  });

  it('a foundational port (zero capabilities) greens on its UAT alone (vacuous capability clause)', () => {
    const stories = [story('proof-protocol', { capabilities: [] })];
    const map = new Map([['proof-protocol', [{ id: 'proof-protocol#uat-1' }]]]);
    const events = [verdictEvent(1, 'proof-protocol#uat-1', 'pass', '2026-06-20T02:00:00.000Z')];
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
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    // The UAT is proven, but demo.cap-a never earned a signed pass.
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('under-claims (no crown verdict) when a per-test verdict is still unproven', () => {
    const stories = [story('demo', { verdict: { outcome: 'pass', at: 'stale' } })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('withers a story crown to fail when a proven test regressed', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [
      verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z'),
      verdictEvent(2, 'demo#uat-2', 'pass', '2026-06-20T02:00:00.000Z'),
      verdictEvent(3, 'demo#uat-2', 'fail', '2026-06-20T03:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, noCoverage(), events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: '2026-06-20T03:00:00.000Z' });
  });

  it('withers a story crown to fail when a CAPABILITY regressed, even with green UAT (the at spans both clauses)', () => {
    const stories = [story('demo', { capabilities: [cap('demo.cap-a')] })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [
      verdictEvent(1, 'demo.cap-a', 'pass', '2026-06-20T01:00:00.000Z'),
      verdictEvent(2, 'demo#uat-1', 'pass', '2026-06-20T02:00:00.000Z'),
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

// ── ADR-0040 / ADR-0094 d.1: a PROVEN story offers NO go-green action (the storage-protocol bug) ──
// applyStoryGoGreenProof reads the just-settled crown verdict and drops a stale Adopt/Build the file-only
// assembly set from authored status — proof, not authored `status:`, is the source of truth for "done".
// It is the panel-side reading of the SAME rule the spine predicate `storyGoGreen(…, proven)` enforces
// for the adopt-POST worker, so the button and the worker can't diverge.
describe('applyStoryGoGreenProof', () => {
  const gates: AdoptGate[] = [
    { id: 'storage-protocol#gate-1', kind: 'observe', command: 'pnpm --filter @storytree/storage-protocol test' },
  ];
  const adoption: AdoptionPlan = { capabilities: [], covered: [], uncovered: [] };

  it('drops Adopt to none for a PROVEN brownfield port, clearing its adoptGates/adoption (the storage-protocol bug)', () => {
    // mapped + gates ⇒ the assembly set goGreen 'adopt'; the crown then proved it green (signed pass).
    const stories = [
      story('storage-protocol', {
        status: 'mapped',
        goGreen: 'adopt',
        adoptGates: gates,
        adoption,
        verdict: { outcome: 'pass', at: '2026-06-27T00:00:00.000Z' },
      }),
    ];
    applyStoryGoGreenProof(stories);
    expect(stories[0]!.goGreen).toBe('none'); // proven ⇒ no go-green action (Adopt button gone)
    expect(stories[0]!.adoptGates).toBeUndefined(); // lean-wire invariant: gates ride only with 'adopt'
    expect(stories[0]!.adoption).toBeUndefined();
  });

  it('drops Build to none for a PROVEN proposed story too (proof outranks the drive affordance)', () => {
    const stories = [
      story('nb', { goGreen: 'build', verdict: { outcome: 'pass', at: 'green-at' } }),
    ];
    applyStoryGoGreenProof(stories);
    expect(stories[0]!.goGreen).toBe('none');
  });

  it('leaves an UNPROVEN story untouched — no crown verdict ⇒ Adopt stays (the not-yet-adopted state)', () => {
    const stories = [
      story('storage-protocol', { status: 'mapped', goGreen: 'adopt', adoptGates: gates }),
    ];
    applyStoryGoGreenProof(stories); // no verdict on the story
    expect(stories[0]!.goGreen).toBe('adopt');
    expect(stories[0]!.adoptGates).toEqual(gates);
  });

  it('only a PASS downgrades — a withered (fail) story keeps its affordance (recovery is the agent loop, not this pass)', () => {
    const stories = [
      story('red', { status: 'mapped', goGreen: 'adopt', adoptGates: gates, verdict: { outcome: 'fail', at: 'red-at' } }),
    ];
    applyStoryGoGreenProof(stories);
    expect(stories[0]!.goGreen).toBe('adopt');
  });

  it('is a no-op for a proven story already at none (never throws, nothing to clear)', () => {
    const stories = [story('done', { goGreen: 'none', verdict: { outcome: 'pass', at: 'green-at' } })];
    applyStoryGoGreenProof(stories);
    expect(stories[0]!.goGreen).toBe('none');
  });
});
