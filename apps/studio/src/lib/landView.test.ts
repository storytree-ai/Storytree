// landView.test.ts — the land view's gate and its scene→land conversion.
//
// ⚠ THE TWO THINGS WORTH PROVING HERE ARE BOTH ABOUT NOT BREAKING THE MAP. The gate must be EXACT,
// because the component behind it drags ~1.7 MB of renderer onto a route a member opens every day;
// and the conversion must return a FAILURE rather than throwing, because an uncaught throw in a
// sibling panel unmounts the working map with it.

import { describe, it, expect } from 'vitest';

import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  type SceneG,
} from '@storytree/forest-world';

import { LAND_VIEW_PARAM, landViewStream, readLandView } from './landView.js';

/** One island's ground group as `buildScene` emits it, in the DRAWING's already-squashed
 *  coordinates — which is what the studio's map actually hands over. */
function drawnIsland(island: string, capability: string, halfWidth: number, halfDepth: number): SceneG {
  const s = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const ring = [
    [-halfWidth, -halfDepth * s],
    [halfWidth, -halfDepth * s],
    [halfWidth, halfDepth * s],
    [-halfWidth, halfDepth * s],
  ];
  return {
    el: 'g',
    kind: 'ground',
    id: island,
    status: 'healthy',
    children: [
      {
        el: 'g',
        kind: 'parcel',
        id: capability,
        children: [{ el: 'path', kind: 'cell', d: `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z` }],
      },
    ],
  };
}

describe('readLandView', () => {
  it('opens on the three affirmative spellings and NOTHING else', () => {
    for (const yes of ['?landView=1', '?landView=on', '?landView=true']) {
      expect(readLandView(yes)).toBe(true);
    }
    // ⚠ Every one of these leaves the map route byte-for-byte the one that shipped. A loose
    // truthiness gate would open the panel — and fetch the renderer chunk — on all of them.
    for (const no of ['', '?landView=', '?landView=0', '?landView=off', '?landView=yes', '?landview=1', '?landViewX=1', '?focus=agent']) {
      expect(readLandView(no)).toBe(false);
    }
  });

  it('names its own query key, so a caller cannot spell it a second way', () => {
    expect(readLandView(`?${LAND_VIEW_PARAM}=1`)).toBe(true);
  });
});

describe('landViewStream', () => {
  it('converts the map’s drawing into land standing on TRUE ground', () => {
    const scene: SceneG = { el: 'g', children: [drawnIsland('alpha', 'cap-a', 50, 50)] };
    const out = landViewStream(scene);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const cells = out.descriptors.filter((d) => d.kind === 'cell-ground');
    expect(cells).toHaveLength(1);
    const ring = cells[0]!.kind === 'cell-ground' ? cells[0]!.points ?? [] : [];
    const width = Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x));
    const depth = Math.max(...ring.map((p) => p.z)) - Math.min(...ring.map((p) => p.z));
    // The island is drawn as a 2.92:1 letterbox and stands square. Feeding the drawing straight
    // through — the defect ADR-0546 D1 made possible by deleting the mapper's own repair — leaves
    // that ratio in place, so this is the assertion that chooses between the two.
    expect(width / depth).toBeCloseTo(1, 9);
    expect(ring.length).toBeGreaterThan(2);
  });

  it('carries the owning island and capability through, so the land can still say whose it is', () => {
    const scene: SceneG = { el: 'g', children: [drawnIsland('alpha', 'cap-a', 30, 30)] };
    const out = landViewStream(scene);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const cell = out.descriptors.find((d) => d.kind === 'cell-ground');
    expect(cell?.kind === 'cell-ground' ? cell.island : undefined).toBe('alpha');
    expect(cell?.kind === 'cell-ground' ? cell.parcel : undefined).toBe('cap-a');
  });

  it('REPORTS a refusal instead of throwing — the map must survive a land view that cannot build', () => {
    // A `tile` group is the retired classic substrate, and the mapper refuses it outright rather
    // than drawing an island with no ground. That refusal is correct; letting it escape this
    // function would take the working map's whole route down with the panel.
    const classic: SceneG = {
      el: 'g',
      children: [{ el: 'g', kind: 'tile', id: 'alpha', children: [] }],
    };
    const out = landViewStream(classic);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/relaxed-mesh|tile/i);
  });

  it('says so when the scene carries no land at all, rather than reporting an empty success', () => {
    const empty: SceneG = { el: 'g', children: [{ el: 'g', kind: 'tree', id: 'alpha', children: [] }] };
    const out = landViewStream(empty);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/no land/i);
  });
});
