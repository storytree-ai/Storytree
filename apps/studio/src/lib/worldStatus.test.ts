// Presentation rules: retired never renders, building wears proposed
// (ADR-0038), and hue derives from the signed verdict — authored status can
// never paint green (ADR-0040). Display-level — the payload/schema keep the
// full vocabulary, so these tests pin the prune/fold seam every world surface
// sits behind.

import { describe, it, expect } from 'vitest';
import { presentStories, provenStatus, worldStatus } from './worldStatus';
import type { TreeCapability, TreeStory, TreeVerdict, WorkStatus } from '../types';

const pass: TreeVerdict = { outcome: 'pass', at: '2026-06-14T00:00:00.000Z' };
const fail: TreeVerdict = { outcome: 'fail', at: '2026-06-14T00:00:00.000Z' };

const cap = (
  id: string,
  status: WorkStatus | null,
  verdict?: TreeVerdict,
): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'red-green',
  dependsOn: [],
  ...(verdict ? { verdict } : {}),
});

const story = (
  id: string,
  status: WorkStatus | null,
  capabilities: TreeCapability[] = [],
  verdict?: TreeVerdict,
): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'UAT',
  uatWitness: 'human',
  dependsOn: [],
  capabilities,
  ...(verdict ? { verdict } : {}),
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
