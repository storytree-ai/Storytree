// Unit test for the per-test UAT crown roll-up wiring (ADR-0082, apiRouter.applyUatCrowns): a story
// that declares per-test UAT tests greens from the AND-roll-up of those tests' SIGNED verdicts, NOT
// its own unit-id verdict — healthy ⇒ a pass crown, unhealthy ⇒ a fail crown, unproven ⇒ NO verdict
// (the world under-claims, never a stale green). Fed the REAL `rollupStoryUat` + real verdict events,
// so the studio crown derivation is held to the same compute the CLI/`storytree tree` uses.

import { describe, it, expect } from 'vitest';
import { SIGNING_EVENT_KIND } from '@storytree/proof-protocol';
import { rollupStoryUat } from '@storytree/orchestrator';

import { applyUatCrowns } from './apiRouter.js';
import type { TreeStory } from '../src/types';

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
  it('greens a story crown when every per-test verdict passes', () => {
    const stories = [story('demo', { capabilities: [] })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [
      verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z'),
      verdictEvent(2, 'demo#uat-2', 'pass', '2026-06-20T02:00:00.000Z'),
    ];
    applyUatCrowns(stories, map, events, rollupStoryUat);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: '2026-06-20T02:00:00.000Z' });
  });

  it('under-claims (no crown verdict) when a test is still unproven', () => {
    // A pre-existing own-unit verdict must be DROPPED — the per-test rollup is authoritative.
    const stories = [story('demo', { verdict: { outcome: 'pass', at: 'stale' } })];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-06-20T01:00:00.000Z')];
    applyUatCrowns(stories, map, events, rollupStoryUat);
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
    applyUatCrowns(stories, map, events, rollupStoryUat);
    expect(stories[0]!.verdict).toEqual({ outcome: 'fail', at: '2026-06-20T03:00:00.000Z' });
  });

  it('leaves a story with no per-test tests untouched (its own-unit verdict stands)', () => {
    const stories = [story('legacy', { verdict: { outcome: 'pass', at: 'own-unit' } })];
    const map = new Map<string, { id: string }[]>(); // legacy declares no per-test tests
    applyUatCrowns(stories, map, [], rollupStoryUat);
    expect(stories[0]!.verdict).toEqual({ outcome: 'pass', at: 'own-unit' });
  });
});
