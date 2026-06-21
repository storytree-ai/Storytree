// Unit test for the story-green crown roll-up wiring (ADR-0083 Fork A, refining ADR-0082,
// apiRouter.applyUatCrowns): a story that declares per-test UAT tests greens from the AND of (all
// capabilities proven healthy) AND (the per-test UAT AND-roll-up), NOT its own unit-id verdict —
// healthy ⇒ a pass crown, unhealthy ⇒ a fail crown (a red plant or a UAT regression), unproven ⇒ NO
// verdict (the world under-claims, never a stale green). Fed the REAL `rollupStoryGreen` + real
// verdict events, so the studio crown derivation is held to the same compute the CLI/`storytree tree`
// uses.

import { describe, it, expect } from 'vitest';
import { SIGNING_EVENT_KIND } from '@storytree/proof-protocol';
import { rollupStoryGreen } from '@storytree/orchestrator';

import { applyUatCrowns } from './apiRouter.js';
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
  return { id, title: id, outcome: '', status: null, proofMode: '', dependsOn: [] };
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
    applyUatCrowns(stories, map, events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-20T02:00:00.000Z' });
  });

  it('a foundational port (zero capabilities) greens on its UAT alone (vacuous capability clause)', () => {
    const stories = [story('proof-protocol', { capabilities: [] })];
    const map = new Map([['proof-protocol', [{ id: 'proof-protocol#uat-1' }]]]);
    const events = [verdictEvent(1, 'proof-protocol#uat-1', 'pass', '2026-06-20T02:00:00.000Z')];
    applyUatCrowns(stories, map, events, rollupStoryGreen);
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
    applyUatCrowns(stories, map, events, rollupStoryGreen);
    expect(stories[0]!.verdict).toBeUndefined();
  });

  it('under-claims (no crown verdict) when a per-test verdict is still unproven', () => {
    const stories = [story('demo', { verdict: { outcome: 'pass', at: 'stale' } })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, events, rollupStoryGreen);
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
    applyUatCrowns(stories, map, events, rollupStoryGreen);
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
    applyUatCrowns(stories, map, events, rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: '2026-06-20T03:00:00.000Z' });
  });

  it('leaves a story with no per-test tests untouched (its own-unit verdict stands)', () => {
    const stories = [story('legacy', { verdict: { outcome: 'pass', at: 'own-unit' } })];
    const map = new Map<string, { id: string }[]>(); // legacy declares no per-test tests
    applyUatCrowns(stories, map, [], rollupStoryGreen);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: 'own-unit' });
  });
});
