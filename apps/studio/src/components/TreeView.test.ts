// TreeView's pure claim-layer helpers (ADR-0200 D7): the `?claims=` mode reader (now LIVE by
// default — the flag retires as a default-OFF gate, not as machinery), the DB-free demo seam
// (all three grades + a departure), and the waiting-order contract the scene path leans on.
// Stage-1 red-green of the geometry/behaviour layer (ADR-0070); the LOOK is operator-attested.

import { describe, it, expect } from 'vitest';
import { demoClaims, demoDepartures, orderClaimsForScene, readClaimsMode } from './TreeView.js';
import type { ClaimActivity, TreeStory } from '../types';

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
