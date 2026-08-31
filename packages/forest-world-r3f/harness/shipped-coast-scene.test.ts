// shipped-coast-scene.test.ts — the coast comparison's own arithmetic, without a GPU.
//
// ⚠ THIS FILE IS WHERE THE REAL ISLAND IS ASSERTED, and that is a division of labour rather than a
// duplication. `src/coast-clip.test.ts` proves the module against a four-parcel block it can reason
// about by hand; the fixture the product actually draws lives in `harness/`, so a `src/` test
// cannot see it. Everything below is about THAT island and the thirty-five-island forest built from
// it — the numbers the evidence quotes.
//
// ⚠⚠ AND THE PREMISE IS TESTED, NOT ASSUMED. The first tests are that the control really is the
// raw hex-union silhouette and that its coast really does fold. Without them, every "the cap keeps
// every parcel simple" assertion below is satisfied by a map that never needed a cap.
//
// ⚠ NO SCENE IS BUILT HERE. `buildCoastScene` needs a WebGL context; every claim below is about
// `coastPlan` and `clipToCoast`, which are pure arithmetic over descriptors — the cheap witness and
// the right one, for the reason the shadow page's own tests give (`check:mutation-diff` runs the
// covering tests once per mutant against a timeout, and scores a slow one as unproven).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COAST_MODES,
  clipToCoast,
  coastCapping,
  coastCurve,
  isSimpleRing,
  rimLoops,
  vertexKey,
  type CoastMode,
  type CoastPoint,
} from '../src/coast-clip.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { ALL_COAST_ARMS, COAST_ARMS, REFERENCE_ARM, coastPlan } from './shipped-coast-scene.js';
import { crowdCells, crowdSize } from './shipped-crowd-scene.js';
import { shippedParcels } from './shipped-land-scene.js';

/** The island the studio actually ships, as the mapper emits it. */
const ISLAND: InstanceDescriptor[] = shippedParcels();
/** The thirty-five-island forest, each copy re-stamped with its own island id. */
const FOREST: InstanceDescriptor[] = crowdCells(crowdSize('forest'));

function ringsOf(cells: readonly InstanceDescriptor[]): CoastPoint[][] {
  return cells.map((c) => (c.points ?? []).map((p) => ({ x: p.x, z: p.z })));
}

// ---------------------------------------------------------------------------
// The premise
// ---------------------------------------------------------------------------

test('the shipped island ends in ONE rim loop of 52 vertices', () => {
  const loops = rimLoops(ringsOf(ISLAND));
  assert.equal(ISLAND.length, 164);
  assert.equal(loops.length, 1);
  assert.equal(loops[0]!.length, 52);
});

test('⚠ THE PREMISE: the coast this map already draws SELF-INTERSECTS', () => {
  // `coast.ts` says the offset "can never self-intersect" because only the outset MAGNITUDE is
  // perturbed, along the normal. On the island the studio ships, it crosses itself twice. The 2D
  // panel draws that loop as an SVG fill and the nonzero rule hides it; a triangulated ground
  // cannot, which is the whole reason `coastDisplacement` carries a fold cap.
  const rim = rimLoops(ringsOf(ISLAND))[0]!;
  assert.equal(isSimpleRing(rim), true, 'the raw hex silhouette should be simple');
  const curve = coastCurve(rim, 'context-traversal-capture');
  assert.equal(isSimpleRing(curve.outset), false, 'the outset coast should fold — the cap exists for this');
  assert.equal(isSimpleRing(curve.smooth), false);
});

test('the control is the map with no coast at all', () => {
  const plan = coastPlan(ISLAND, REFERENCE_ARM);
  assert.equal(plan.capRim, 0);
  assert.equal(plan.capBound, 0);
  assert.equal(plan.foldedParcels, 0);
  assert.deepEqual(clipToCoast(ISLAND, REFERENCE_ARM), ISLAND);
});

// ---------------------------------------------------------------------------
// The claim the map's honesty rests on
// ---------------------------------------------------------------------------

test('⚠⚠ NO PARCEL FOLDS, on any arm, on the island OR the forest', () => {
  // A folded parcel paints one capability's status colour over ground belonging to another. This
  // is the assertion the driver's first refusal reads, and it is the reason the cap exists.
  for (const arm of ALL_COAST_ARMS) {
    assert.equal(coastPlan(ISLAND, arm).foldedParcels, 0, `${arm} folded a parcel on one island`);
    assert.equal(coastPlan(FOREST, arm).foldedParcels, 0, `${arm} folded a parcel on the forest`);
  }
});

test('the fold cap binds on a handful of rim vertices, and says so', () => {
  // Pinned rather than bounded: the cap is a visible notch in the shore, so a change that made it
  // bind on twice as many vertices is a change to the picture and has to be looked at.
  assert.deepEqual(coastCapping(ISLAND, 'outset'), { rim: 52, bound: 4, least: 0.7 });
  assert.deepEqual(coastCapping(ISLAND, 'project'), { rim: 52, bound: 2, least: 0.9 });
  assert.deepEqual(coastCapping(ISLAND, 'subdivide'), { rim: 52, bound: 3, least: 0.6 });
});

test('every island of the forest is capped, not just the first', () => {
  const cap = coastCapping(FOREST, 'outset');
  assert.equal(cap.rim, 52 * 35, 'the forest should carry thirty-five rims');
  assert.ok(cap.bound > 0, 'the forest coast should bind the cap somewhere');
});

// ---------------------------------------------------------------------------
// What each arm costs
// ---------------------------------------------------------------------------

test('the free arms are free — no triangle, no ring vertex', () => {
  const control = coastPlan(ISLAND, REFERENCE_ARM);
  for (const arm of ['outset', 'project'] as const) {
    const plan = coastPlan(ISLAND, arm);
    assert.equal(plan.triangles, control.triangles, arm);
    assert.equal(plan.ringVertices, control.ringVertices, arm);
    assert.equal(plan.attributeBytes, control.attributeBytes, arm);
  }
});

test('subdivide spends exactly the curve — four points per rim vertex, once', () => {
  const control = coastPlan(ISLAND, REFERENCE_ARM);
  const plan = coastPlan(ISLAND, 'subdivide');
  const rim = rimLoops(ringsOf(ISLAND))[0]!.length;
  assert.equal(plan.ringVertices - control.ringVertices, rim * 4);
  // Every parcel prism is `ringLength * 3 - 2` triangles, so the extra vertices cost three each.
  assert.equal(plan.triangles - control.triangles, rim * 4 * 3);
});

test('every arm GROWS the island, and the three grow it by different amounts', () => {
  const areas = new Map(COAST_MODES.map((m) => [m, coastPlan(ISLAND, m).groundArea]));
  const control = areas.get(REFERENCE_ARM)!;
  for (const arm of COAST_ARMS) {
    assert.ok(areas.get(arm)! > control, `${arm} added no land`);
  }
  assert.equal(new Set([...areas.values()].map((a) => a.toFixed(3))).size, COAST_MODES.length);
});

// ---------------------------------------------------------------------------
// The forest's own finding
// ---------------------------------------------------------------------------

test('⚠ thirty-five copies of ONE island wear thirty-five DIFFERENT coasts', () => {
  // The wave is seeded on the island id and `crowdCells` re-stamps that per copy, so the forest
  // stops being a tiled repetition of one silhouette at the moment the coast lands. Before the
  // clip every island is the same shape translated; after it, none of them are.
  const shapeOf = (cells: readonly InstanceDescriptor[], mode: CoastMode): Set<string> => {
    const byIsland = new Map<string, string[]>();
    const clipped = clipToCoast(cells, mode);
    for (const c of clipped) {
      const island = c.island;
      if (island === undefined) continue;
      const offset = clipped.find((d) => d.island === island)!;
      const ox = offset.transform.x;
      const oz = offset.transform.z;
      const rel = (c.points ?? []).map((p) => vertexKey({ x: p.x - ox, z: p.z - oz })).join(';');
      const list = byIsland.get(island);
      if (list) list.push(rel);
      else byIsland.set(island, [rel]);
    }
    return new Set([...byIsland.values()].map((r) => r.join('|')));
  };
  assert.equal(shapeOf(FOREST, REFERENCE_ARM).size, 1, 'before the clip the forest is one shape');
  assert.equal(shapeOf(FOREST, 'outset').size, 35, 'after it, thirty-five');
});

test('a coast never reaches into a neighbouring island', () => {
  // The beach is capped well inside the inter-island gap by `jitteredOutset`'s own amplitude, and
  // the fold cap only ever shortens it — so no island's ground may end up inside another's bounds.
  const boxes = (cells: readonly InstanceDescriptor[]): Map<string, [number, number, number, number]> => {
    const out = new Map<string, [number, number, number, number]>();
    for (const c of cells) {
      const island = c.island;
      if (island === undefined) continue;
      const found = out.get(island) ?? [Infinity, -Infinity, Infinity, -Infinity];
      for (const p of c.points ?? []) {
        found[0] = Math.min(found[0], p.x);
        found[1] = Math.max(found[1], p.x);
        found[2] = Math.min(found[2], p.z);
        found[3] = Math.max(found[3], p.z);
      }
      out.set(island, found);
    }
    return out;
  };
  const before = boxes(FOREST);
  for (const arm of COAST_ARMS) {
    const after = boxes(clipToCoast(FOREST, arm));
    const ids = [...after.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = after.get(ids[i]!)!;
        const b = after.get(ids[j]!)!;
        const overlaps = a[0] <= b[1] && b[0] <= a[1] && a[2] <= b[3] && b[2] <= a[3];
        const overlappedBefore = (() => {
          const p = before.get(ids[i]!)!;
          const q = before.get(ids[j]!)!;
          return p[0] <= q[1] && q[0] <= p[1] && p[2] <= q[3] && q[2] <= p[3];
        })();
        assert.equal(
          overlaps,
          overlappedBefore,
          `${arm}: ${ids[i]} and ${ids[j]} changed whether their bounds overlap`,
        );
      }
    }
  }
});
