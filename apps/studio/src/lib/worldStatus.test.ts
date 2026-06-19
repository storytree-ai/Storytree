// Presentation rules: retired never renders, building wears proposed
// (ADR-0038), and hue derives from the signed verdict — authored status can
// never paint green (ADR-0040). Display-level — the payload/schema keep the
// full vocabulary, so these tests pin the prune/fold seam every world surface
// sits behind.

import { describe, it, expect } from 'vitest';
import { driftBadge, presentStories, provenStatus, worldStatus } from './worldStatus';
import type { DriftState, TreeCapability, TreeStory, TreeVerdict, WorkStatus } from '../types';

const pass: TreeVerdict = { outcome: 'pass', at: '2026-06-14T00:00:00.000Z' };
const fail: TreeVerdict = { outcome: 'fail', at: '2026-06-14T00:00:00.000Z' };

const cap = (
  id: string,
  status: WorkStatus | null,
  verdict?: TreeVerdict,
  drift?: DriftState,
): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'red-green',
  dependsOn: [],
  ...(verdict ? { verdict } : {}),
  ...(drift ? { drift } : {}),
});

const story = (
  id: string,
  status: WorkStatus | null,
  capabilities: TreeCapability[] = [],
  verdict?: TreeVerdict,
  drift?: DriftState,
): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'UAT',
  uatWitness: 'human',
  dependsOn: [],
  consumedBy: [],
  capabilities,
  ...(verdict ? { verdict } : {}),
  ...(drift ? { drift } : {}),
});

describe('worldStatus', () => {
  it('folds building into proposed and passes everything else through', () => {
    expect(worldStatus('building')).toBe('proposed');
    for (const st of ['proposed', 'mapped', 'healthy', 'unhealthy', 'retired', null] as const) {
      expect(worldStatus(st)).toBe(st);
    }
  });
});

describe('provenStatus (ADR-0040: hue is the verdict)', () => {
  it('a signed pass is the ONLY green source — it overrides any authored rung', () => {
    for (const st of ['proposed', 'building', 'mapped', 'healthy', null] as const) {
      expect(provenStatus(st, pass)).toBe('healthy');
    }
  });

  it('authored healthy without a signed pass under-claims to mapped', () => {
    expect(provenStatus('healthy', undefined)).toBe('mapped');
  });

  it('wither is unchanged: signed fail OR authored unhealthy', () => {
    for (const st of ['proposed', 'mapped', 'healthy', null] as const) {
      expect(provenStatus(st, fail)).toBe('unhealthy');
    }
    expect(provenStatus('unhealthy', undefined)).toBe('unhealthy');
  });

  it('authored unhealthy wins even over a signed pass (the disagreement never greens)', () => {
    expect(provenStatus('unhealthy', pass)).toBe('unhealthy');
  });

  it('offline (no verdict) falls back to the authored ladder — never over-claims', () => {
    expect(provenStatus('proposed', undefined)).toBe('proposed');
    expect(provenStatus('building', undefined)).toBe('proposed');
    expect(provenStatus('mapped', undefined)).toBe('mapped');
    expect(provenStatus(null, undefined)).toBeNull();
  });
});

describe('presentStories', () => {
  it('prunes retired stories entirely', () => {
    const out = presentStories([story('alive', 'mapped'), story('gone', 'retired')]);
    expect(out.map((s) => s.id)).toEqual(['alive']);
  });

  it('prunes retired capabilities from surviving stories', () => {
    const out = presentStories([
      story('s', 'mapped', [cap('keep', 'mapped'), cap('drop', 'retired')]),
    ]);
    expect(out[0]?.capabilities.map((c) => c.id)).toEqual(['keep']);
  });

  it('folds building into proposed on both tiers', () => {
    const out = presentStories([story('s', 'building', [cap('c', 'building')])]);
    expect(out[0]?.status).toBe('proposed');
    expect(out[0]?.capabilities[0]?.status).toBe('proposed');
  });

  it('a signed pass greens a capability; the story crown only greens from its OWN UAT verdict', () => {
    const out = presentStories([
      story('s', 'proposed', [cap('proven', 'proposed', pass), cap('pending', 'proposed')]),
    ]);
    expect(out[0]?.capabilities[0]?.status).toBe('healthy');
    expect(out[0]?.capabilities[1]?.status).toBe('proposed');
    // six green plants never roll up into a green crown (ADR-0033 d.4)
    expect(out[0]?.status).toBe('proposed');
  });

  it('a story UAT pass greens the crown; a UAT fail withers it', () => {
    expect(presentStories([story('s', 'proposed', [], pass)])[0]?.status).toBe('healthy');
    expect(presentStories([story('s', 'proposed', [], fail)])[0]?.status).toBe('unhealthy');
  });

  it('authored healthy stops painting green on both tiers (the hand-painting door stays shut)', () => {
    const out = presentStories([story('s', 'healthy', [cap('c', 'healthy')])]);
    expect(out[0]?.status).toBe('mapped');
    expect(out[0]?.capabilities[0]?.status).toBe('mapped');
  });

  it('leaves null status (spec error) and the rest of the shape untouched', () => {
    const input = [story('s', null, [cap('c', 'mapped')])];
    const out = presentStories(input);
    expect(out[0]?.status).toBeNull();
    expect(out[0]?.capabilities[0]?.status).toBe('mapped');
    // uatWitness rides the presentation untouched (the signpost rule reads it)
    expect(out[0]?.uatWitness).toBe('human');
    // and never mutates its input
    expect(input[0]?.capabilities).toHaveLength(1);
  });
});

describe('driftBadge (ADR-0016 §3: the distinct, additive drift marker)', () => {
  it('fresh and absent wear NO badge (a current proof renders as its plain proven hue)', () => {
    expect(driftBadge('fresh')).toBeUndefined();
    expect(driftBadge(undefined)).toBeUndefined();
  });

  it('stale and drifted-undescribed each wear their OWN distinct badge (never collapsed)', () => {
    expect(driftBadge('stale')).toBe('stale');
    expect(driftBadge('drifted-undescribed')).toBe('drifted-undescribed');
  });
});

describe('presentStories: drift rides ALONGSIDE the proven hue (ADR-0040 §7, never a silent green→brown)', () => {
  it('a signed-green capability that drifts STAYS green and wears the stale badge — never reverts to brown', () => {
    const out = presentStories([story('s', 'proposed', [cap('proven', 'proposed', pass, 'stale')])]);
    const c = out[0]?.capabilities[0];
    // the proven hue is preserved (the "proven once, at commit X" record), NOT downgraded to mapped
    expect(c?.status).toBe('healthy');
    // and the distinct stale marker rides alongside it
    expect(c?.drift).toBe('stale');
  });

  it('drifted-undescribed is surfaced DISTINCTLY (demoted, but never silently green) on a proven unit', () => {
    const out = presentStories([
      story('s', 'proposed', [cap('proven', 'proposed', pass, 'drifted-undescribed')]),
    ]);
    const c = out[0]?.capabilities[0];
    expect(c?.status).toBe('healthy');
    expect(c?.drift).toBe('drifted-undescribed');
  });

  it('a fresh proof wears no badge — the drift field is normalised away', () => {
    const out = presentStories([story('s', 'proposed', [cap('proven', 'proposed', pass, 'fresh')])]);
    const c = out[0]?.capabilities[0];
    expect(c?.status).toBe('healthy');
    expect(c?.drift).toBeUndefined();
  });

  it('a story crown carries its own drift badge alongside its UAT-pass green', () => {
    const out = presentStories([story('s', 'proposed', [], pass, 'stale')]);
    expect(out[0]?.status).toBe('healthy');
    expect(out[0]?.drift).toBe('stale');
  });

  it('drift never resurrects a retired unit (prune still wins) and never mutates its input', () => {
    const input = [story('gone', 'retired', [], pass, 'stale'), story('s', 'mapped', [cap('c', 'mapped', undefined, 'stale')])];
    const out = presentStories(input);
    expect(out.map((s) => s.id)).toEqual(['s']);
    // a non-proven (mapped) unit still surfaces its drift marker, status untouched
    expect(out[0]?.capabilities[0]?.status).toBe('mapped');
    expect(out[0]?.capabilities[0]?.drift).toBe('stale');
    // input untouched (the raw drift is read, not mutated)
    expect(input[1]?.capabilities[0]?.drift).toBe('stale');
  });
});
