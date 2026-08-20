// Presentation rules: retired never renders, signed pass is the sole source of
// green, and brown is reserved for genuine mapped brownfield provenance
// (ADR-0395). Display-level only: the payload/schema keep the full authored and
// proof vocabulary, so these tests pin the prune/fold seam every world surface
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
  testCount: 0,
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
  it('keeps authored greenfield work proposed and genuine mapped provenance brown', () => {
    expect(worldStatus('proposed')).toBe('proposed');
    expect(worldStatus('building')).toBe('proposed');
    expect(worldStatus('mapped')).toBe('mapped');
    expect(worldStatus('healthy')).toBe('proposed');
    expect(worldStatus('unhealthy')).toBe('proposed');
    expect(worldStatus('retired')).toBe('retired');
    expect(worldStatus(null)).toBeNull();
  });
});

describe('provenStatus (ADR-0395: provenance before proof)', () => {
  const matrix: Array<{
    authored: WorkStatus | null;
    pass: WorkStatus | null;
    fail: WorkStatus | null;
    missing: WorkStatus | null;
  }> = [
    { authored: 'proposed', pass: 'healthy', fail: 'proposed', missing: 'proposed' },
    { authored: 'building', pass: 'healthy', fail: 'proposed', missing: 'proposed' },
    { authored: 'mapped', pass: 'healthy', fail: 'mapped', missing: 'mapped' },
    { authored: 'healthy', pass: 'healthy', fail: 'proposed', missing: 'proposed' },
    { authored: 'unhealthy', pass: 'healthy', fail: 'proposed', missing: 'proposed' },
    { authored: null, pass: 'healthy', fail: null, missing: null },
  ];

  it.each(matrix)(
    'folds authored=$authored across pass, fail, and missing proof',
    ({ authored, pass: passed, fail: failed, missing }) => {
      expect(provenStatus(authored, pass)).toBe(passed);
      expect(provenStatus(authored, fail)).toBe(failed);
      expect(provenStatus(authored, undefined)).toBe(missing);
    },
  );

  it('never emits unhealthy', () => {
    for (const row of matrix) {
      for (const verdict of [pass, fail, undefined]) {
        expect(provenStatus(row.authored, verdict)).not.toBe('unhealthy');
      }
    }
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

  it('a story UAT pass greens the crown; a UAT fail leaves it on the authored rung', () => {
    expect(presentStories([story('s', 'proposed', [], pass)])[0]?.status).toBe('healthy');
    // ADR-0296: the fail no longer withers the crown — it simply fails to green it.
    expect(presentStories([story('s', 'proposed', [], fail)])[0]?.status).toBe('proposed');
  });

  it('applies provenance-before-proof to both tiers', () => {
    const scenarios: Array<{
      authored: WorkStatus | null;
      verdict: TreeVerdict | undefined;
      expected: WorkStatus | null;
    }> = [
      { authored: 'proposed', verdict: pass, expected: 'healthy' },
      { authored: 'proposed', verdict: fail, expected: 'proposed' },
      { authored: 'proposed', verdict: undefined, expected: 'proposed' },
      { authored: 'building', verdict: pass, expected: 'healthy' },
      { authored: 'building', verdict: fail, expected: 'proposed' },
      { authored: 'building', verdict: undefined, expected: 'proposed' },
      { authored: 'mapped', verdict: pass, expected: 'healthy' },
      { authored: 'mapped', verdict: fail, expected: 'mapped' },
      { authored: 'mapped', verdict: undefined, expected: 'mapped' },
      { authored: 'healthy', verdict: pass, expected: 'healthy' },
      { authored: 'healthy', verdict: fail, expected: 'proposed' },
      { authored: 'healthy', verdict: undefined, expected: 'proposed' },
      { authored: 'unhealthy', verdict: pass, expected: 'healthy' },
      { authored: 'unhealthy', verdict: fail, expected: 'proposed' },
      { authored: 'unhealthy', verdict: undefined, expected: 'proposed' },
      { authored: null, verdict: pass, expected: 'healthy' },
      { authored: null, verdict: fail, expected: null },
      { authored: null, verdict: undefined, expected: null },
    ];
    const out = presentStories(
      scenarios.map(({ authored, verdict }, index) =>
        story(`story-${index}`, authored, [cap(`cap-${index}`, authored, verdict)], verdict),
      ),
    );

    expect(out.map((s) => s.status)).toEqual(scenarios.map((s) => s.expected));
    expect(out.map((s) => s.capabilities[0]?.status)).toEqual(
      scenarios.map((s) => s.expected),
    );
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
