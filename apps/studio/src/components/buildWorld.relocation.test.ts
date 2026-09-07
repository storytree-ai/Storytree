// THE RELOCATION PROOF (`the-packing-moves-to-its-own-package`, ADR-0537 D1).
//
// The island packing — `buildWorld`, the derived gaps, the ground polar offset — moved out of
// `TreeView.tsx` into `@storytree/forest-layout`. The increment's binding constraint is that the
// move changed the layout's OUTPUT by NOTHING: "this is a relocation; the map it produces must be
// provably the same."
//
// ⚠ WHAT MAKES THIS A PROOF RATHER THAN AN ASSERTION. `buildWorld.relocation.golden.json` was
// captured from the packer as it stood INSIDE `TreeView.tsx` and committed in its own commit before
// a single line moved. So the claim "the move changed nothing" is checkable from the history — the
// golden has exactly one commit, the capture, and the relocation commit does not touch it — rather
// than resting on a test that could have been regenerated alongside the change it was meant to
// police. A future edit that legitimately changes the map re-captures it, in ITS OWN commit, saying
// what moved and why.
//
// FIVE ARMS, chosen so no branch of the packer is unwitnessed: the SHIPPED map; the `plantsScatter`
// garden branch; the BARE call the Shared Islands panel makes (`buildings: false` — no exclusion, no
// stamps); the `legacy` control arm a comparison page stands (the three retired absolute gaps); and
// the TIGHTEST rung, ratio 0, where the hex growth floor and the one-hex moat are the only thing
// holding two islands apart. The corpus and the comparison surface are
// `buildWorld.relocation.fixture.ts`.
//
// ⚠ WHAT THIS INSTRUMENT CAN AND CANNOT SEE — calibrated by fault-seeding before the move, so the
// green is read at its true strength. Perturbing a CONTINUOUS quantity by one part in ten thousand
// (`ringR`'s `crownR * 0.9` → `0.9001`) reds all five arms; widening the moat by one hex reds four;
// taking the gap ratio 0.1 → 0.5 reds the three arms that read it (`legacy` and `tightest` declare
// their own gaps and are correctly untouched). But perturbing the gap ratio by 1e-5 reds NOTHING,
// and that is the packer being QUANTISED rather than the instrument being blind: every gap the
// ratio feeds ends up in a seed that `pixelToHex` snaps to the lattice, so a sub-hex change to a
// gap is not a change to the map. Continuous outputs — every garden spot, coast vertex and trail
// point — carry no such floor and are compared exactly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildWorld } from './TreeView.js';
import { PRE_ADR0521_SPACING } from '../lib/islandSpacing.js';
import { relocationCorpus, projectWorld, type WorldProjection } from './buildWorld.relocation.fixture.js';

const golden = JSON.parse(
  readFileSync(new URL('./buildWorld.relocation.golden.json', import.meta.url), 'utf8'),
) as Record<string, WorldProjection>;

const stories = relocationCorpus();

const arms = {
  shipped: () => projectWorld(buildWorld(stories, { buildings: true })),
  scatter: () => projectWorld(buildWorld(stories, { buildings: true, plantsScatter: true })),
  bare: () => projectWorld(buildWorld(stories, { buildings: false })),
  legacy: () =>
    projectWorld(buildWorld(stories, { buildings: true, spacing: { legacy: PRE_ADR0521_SPACING } })),
  tightest: () => projectWorld(buildWorld(stories, { buildings: true, spacing: { ratio: 0 } })),
} satisfies Record<string, () => WorldProjection>;

/**
 * The first path at which two JSON-serialisable values differ, or `undefined` when they agree —
 * so a broken relocation names the field and the island it broke on instead of dumping two
 * 70,000-line objects at the reader. A depth-first walk, arrays compared by length then by index.
 */
function firstDifference(a: unknown, b: unknown, path = ''): string | undefined {
  if (Object.is(a, b)) return undefined;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: array vs non-array`;
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return undefined;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join(',') !== kb.join(',')) return `${path}: keys ${ka.join(',')} vs ${kb.join(',')}`;
    for (const k of ka) {
      const d = firstDifference(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (d) return d;
    }
    return undefined;
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

describe('the island packing produces the same map after moving out of TreeView', () => {
  // A golden that lost an arm would pass every surviving comparison and prove less than it claims.
  it('covers every captured arm', () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(arms).sort());
  });

  for (const [arm, build] of Object.entries(arms)) {
    it(`reproduces the pre-move map exactly — ${arm}`, () => {
      const before = golden[arm];
      expect(before, `no golden captured for arm "${arm}"`).toBeDefined();
      const after = JSON.parse(JSON.stringify(build())) as WorldProjection;
      expect(firstDifference(before, after, arm)).toBeUndefined();
    });
  }

  // The projection is the comparison SURFACE: a derived field it forgets is a field the four
  // comparisons above cannot see move. Pin the shape so adding one to `Territory` without adding it
  // here reds rather than quietly narrowing the proof.
  it('compares every derived territory field', () => {
    const t = golden['shipped']?.territories?.[0] as Record<string, unknown> | undefined;
    expect(Object.keys(t ?? {}).sort()).toEqual(
      [
        'buildingGlyph',
        'caps',
        'centroid',
        'coastGroundLoops',
        'decor',
        'groundCentroid',
        'groundRadius',
        'groundTreeSpot',
        'labelY',
        'radius',
        'stamps',
        'story',
        'tiles',
        'treeSpot',
        'wheatTiles',
      ].sort(),
    );
  });
});
