// The RELOCATION FIXTURE — the deterministic corpus and the canonical projection that prove the
// island packing produced the SAME map before and after it moved out of this file
// (`the-packing-moves-to-its-own-package`, ADR-0537 D1).
//
// ⚠ THIS FILE AND ITS GOLDEN ARE THE INSTRUMENT, NOT THE SUBJECT. The golden
// (`buildWorld.relocation.golden.json`) was captured from the layout as it stood INSIDE
// `TreeView.tsx`, and committed in its own commit BEFORE a single line moved — so "the move changed
// nothing" is checkable from the history (`git log -p` on the golden shows one commit, the capture)
// and not merely asserted by a test that could have been regenerated alongside the change.
//
// The projection below keeps EVERY layout-derived number and drops only the caller's own inputs
// echoed back (`Territory.story`, `CapSpot.cap` — reduced to their ids). Dropping a derived field
// here would be a green check that verified nothing, so the reduction is deliberately shallow: it
// names each field it keeps, and a new derived field on `Territory` is one this projection does not
// see until someone adds it here.

import type { TreeCapability, TreeStory } from '../types';
import type { HexWorld } from './TreeView.js';

const cap = (id: string, dependsOn: string[] = []): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'red-green',
  dependsOn,
  testCount: 0,
});

const story = (
  id: string,
  capIds: readonly (readonly [string, string[]])[],
  dependsOn: string[],
  extra: { building?: boolean; consumedBy?: string[] } = {},
): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'machine',
  dependsOn,
  consumedBy: extra.consumedBy ?? [],
  // Always stated, never omitted: the packer's own test is `building === true`, so a declared
  // `false` and an absent key are the same input to it — and stating it keeps the fixture free of
  // a conditional spread that hides which stories are buildings.
  building: extra.building ?? false,
  capabilities: capIds.map(([cid, deps]) => cap(cid, [...deps])),
});

/**
 * Fourteen stories over four dependency ranks, chosen to exercise every branch the packer has:
 * a wide foundation row (load-bearing ordering + centre-out interleave), a LONE island on rank 2
 * (`loneSwing`, and the alternating side that depends on rank parity), quotas from 1 to 9
 * capabilities (so `gapBetween` sees pairs of unequal radii and the growth floor has both tight and
 * roomy neighbours), two `render: building` stories (the exclusion AND the ADR-0102 stamp promotion,
 * and `mid-c` carrying BOTH, so the two-sided stamp fan and its per-tier radius step run), and a derived cross-story
 * capability edge that no `depends_on` declares (`deep-b1` → `mid-a`), so `storyEdges`' union is
 * exercised rather than just the declared half.
 */
export function relocationCorpus(): TreeStory[] {
  return [
    story('root-a', [['root-a1', []], ['root-a2', []], ['root-a3', []]], []),
    story('root-b', [['root-b1', []]], []),
    story('root-c', [['root-c1', []], ['root-c2', []]], []),
    story('root-d', [
      ['root-d1', []], ['root-d2', []], ['root-d3', []], ['root-d4', []],
      ['root-d5', []], ['root-d6', []], ['root-d7', []], ['root-d8', []], ['root-d9', []],
    ], []),
    story('lib', [['lib-1', []], ['lib-2', []], ['lib-3', []]], [], {
      building: true,
      consumedBy: ['mid-a', 'mid-b'],
    }),
    story('toolbelt', [['toolbelt-1', []], ['toolbelt-2', []]], ['root-a'], { building: true }),
    story('mid-a', [['mid-a1', []], ['mid-a2', []]], ['root-a', 'root-b', 'lib']),
    story('mid-b', [['mid-b1', []], ['mid-b2', []], ['mid-b3', []], ['mid-b4', []]], ['root-c', 'lib']),
    story('mid-c', [['mid-c1', []]], ['root-d', 'toolbelt', 'lib']),
    story('mid-d', [['mid-d1', []], ['mid-d2', []], ['mid-d3', []]], ['root-d']),
    story('solo', [['solo-1', []], ['solo-2', []], ['solo-3', []], ['solo-4', []], ['solo-5', []]], [
      'mid-a', 'mid-b', 'mid-c',
    ]),
    story('deep-a', [['deep-a1', []], ['deep-a2', []]], ['solo']),
    story('deep-b', [['deep-b1', ['mid-a2']], ['deep-b2', []]], ['solo']),
    story('deep-c', [['deep-c1', []], ['deep-c2', []], ['deep-c3', []], ['deep-c4', []]], ['solo', 'deep-a']),
  ];
}

/** The layout-derived shape of one world, with the caller's echoed inputs reduced to ids. */
export interface WorldProjection {
  width: number;
  height: number;
  offset: { x: number; y: number };
  empties: unknown[];
  drawTiles: unknown[];
  trails: unknown;
  territories: unknown[];
}

/** Everything the packer DERIVED, in a stable order — the comparison surface of the relocation. */
export function projectWorld(world: HexWorld): WorldProjection {
  return {
    width: world.width,
    height: world.height,
    offset: world.offset,
    empties: world.empties.map((e) => ({ q: e.q, r: e.r, owner: e.owner })),
    drawTiles: world.drawTiles.map((t) => ({ q: t.h.q, r: t.h.r, owner: t.owner })),
    trails: world.trails,
    territories: world.territories.map((t) => ({
      story: t.story.id,
      tiles: t.tiles.map((h) => ({ q: h.q, r: h.r })),
      centroid: t.centroid,
      radius: t.radius,
      groundRadius: t.groundRadius,
      treeSpot: t.treeSpot,
      groundCentroid: t.groundCentroid,
      groundTreeSpot: t.groundTreeSpot,
      caps: t.caps.map((c) => ({ cap: c.cap.id, x: c.x, y: c.y, groundSpot: c.groundSpot })),
      decor: t.decor,
      wheatTiles: [...t.wheatTiles].sort(),
      coastGroundLoops: t.coastGroundLoops,
      labelY: t.labelY,
      stamps: t.stamps,
      buildingGlyph: t.buildingGlyph,
    })),
  };
}
