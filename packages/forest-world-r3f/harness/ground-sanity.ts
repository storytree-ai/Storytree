// ground-sanity.ts — FAIL FAST BEFORE THE EXPENSIVE CALL: a few microseconds of assertions over
// `dressing-ground.ts`'s ray cast and exclusion, for any test that is about to scatter ground cover.
//
// ⚠⚠ WHY THIS EXISTS, MEASURED (2026-09-05, `mutation-rung-scores-a-hang-as-unproven` §3). The
// cover's sampler offers a prop 400 points and keeps the first one the ray cast puts on a parcel
// and the exclusion lets through. A mutant that makes `insideRing` refuse every point — or the
// exclusion refuse every point — does not fail an assertion there; it makes EVERY prop burn all
// 400 tries and get dropped, and a test that then scatters a four-rung ladder over a forest grinds
// past Stryker's per-mutant budget before any assertion speaks. `check:mutation-diff` scores that
// as UNPROVEN (never a pass, never a survivor) and reds: 17 such mutants on the first run of this
// landing, every one of them killable in under a millisecond by `dressing-ground.test.ts`.
//
// So every test that scatters cover calls this FIRST. Under any of those mutants it fails here, in
// microseconds, and the grind never starts. Unmutated it costs nothing a test can notice.
//
// ⚠ IT IS NOT A SECOND TEST SUITE for the ray cast — `dressing-ground.test.ts` is, with the
// hostile fixtures that separate the ray cast from its plausible variants. These are the CHEAPEST
// probes that each hot-loop mutant fails, and nothing more.

import assert from 'node:assert/strict';

import {
  DRESSING_BEACH,
  beachClear,
  crossingIsRight,
  crossingX,
  dressingExclusion,
  insideRing,
  pathClear,
  straddles,
} from '../src/dressing-ground.js';
import type { GPoint } from '../src/parcel-cells.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';

const SQUARE: readonly GPoint[] = [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }];
const ELL: readonly GPoint[] = [
  { x: 10, z: 10 },
  { x: 20, z: 10 },
  { x: 20, z: 15 },
  { x: 15, z: 15 },
  { x: 15, z: 20 },
  { x: 10, z: 20 },
];
const RIM: InstanceDescriptor = {
  kind: 'cell-ground',
  transform: { x: 100, y: 0, z: 50 },
  group: 'cell-ground',
  material: 'healthy',
  island: 'sanity',
  parcel: 'sanity-cap',
  points: [
    { x: 0, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: 0, z: 100 },
    { x: 0, y: 0, z: 100 },
  ],
};

/** The ray cast and the exclusion answer the obvious cases — or this test stops here. */
export function groundSanity(): void {
  assert.equal(insideRing(SQUARE, { x: 15, z: 15 }), true, 'ground-sanity: the ray cast refuses the middle of a square');
  assert.equal(insideRing(SQUARE, { x: 25, z: 15 }), false, 'ground-sanity: the ray cast admits a point outside');
  assert.equal(insideRing(ELL, { x: 18, z: 18 }), false, 'ground-sanity: the ray cast admits the notch');
  assert.equal(straddles({ x: 0, z: 8 }, { x: 10, z: 2 }, 5), true, 'ground-sanity: straddles');
  assert.equal(crossingX({ x: 100, z: -2 }, { x: 107, z: 5 }, 0), 102, 'ground-sanity: crossingX');
  assert.equal(crossingIsRight(1, 2) && !crossingIsRight(3, 2), true, 'ground-sanity: crossingIsRight');
  assert.equal(beachClear(DRESSING_BEACH) && !beachClear(0), true, 'ground-sanity: beachClear');
  assert.equal(pathClear(100) && !pathClear(0), true, 'ground-sanity: pathClear');
  const ex = dressingExclusion([RIM], [[{ x: 20, z: 50 }, { x: 180, z: 50 }]]);
  assert.equal(ex.clear(100, 20), true, 'ground-sanity: the exclusion refuses clear ground');
  assert.equal(ex.clear(DRESSING_BEACH / 2, 50) || ex.clear(100, 50), false, 'ground-sanity: the exclusion admits the beach or the path');
}
