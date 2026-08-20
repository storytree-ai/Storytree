// flower-descriptors.test.ts — the UAT flowers are READ off the scene, not invented.
//
// The property under test is narrower and sharper than "the extractor works". ADR-0226 D4 makes
// the flower 1:1 with a UAT criterion and puts the VERDICT IN THE FORM, so the thing that must
// never drift is the correspondence between what the surface authored and what a live renderer
// will draw. A test that only checked "ten flowers came out" would pass just as happily over an
// extractor that gave every one of them a bloom.

import assert from 'node:assert/strict';
import test from 'node:test';

import { flowersFrom } from './flower-descriptors.js';
import { islandScene, type CriterionState } from './island-fixture.js';

const ALL = (state: CriterionState): CriterionState[] => Array.from({ length: 10 }, () => state);

test('one flower per UAT criterion, 1:1, carrying the criterion id (ADR-0226 D4)', () => {
  const flowers = flowersFrom(islandScene({}));
  assert.equal(flowers.length, 10, 'the fixture carries the real story’s ten criteria');
  const ids = new Set(flowers.map((f) => f.criterion));
  assert.equal(ids.size, 10, 'every marker carries its OWN criterion id — a 1:1 map, not a count');
  for (const f of flowers) assert.match(f.criterion, /^uatc_[0-9a-f]{24}$/);
});

test('the verdict is read from the wrapper kind, and every state round-trips', () => {
  for (const state of ['proven', 'pending', 'failing'] as const) {
    const flowers = flowersFrom(islandScene({ criteriaStates: ALL(state) }));
    assert.equal(flowers.length, 10);
    for (const f of flowers) assert.equal(f.state, state);
  }
});

test('the THREE FORMS are structurally distinct — a bud is never a bloom', () => {
  // This is the ADR-0045 honesty wall expressed as a property of the data a renderer receives.
  // If a pending flower ever arrived carrying petals, or a proven one arrived with no bloom at
  // all, the island would say something about a proof state that the work does not hold — and
  // it would say it in the one channel ADR-0226 D4 reserved for exactly that claim.
  const proven = flowersFrom(islandScene({ criteriaStates: ALL('proven') }));
  const pending = flowersFrom(islandScene({ criteriaStates: ALL('pending') }));
  const failing = flowersFrom(islandScene({ criteriaStates: ALL('failing') }));

  for (const f of proven) {
    assert.ok(f.petals.length >= 6, 'a bloom radiates petals');
    assert.ok(f.centreRadius > 0, 'a bloom has a centre disc');
    assert.equal(f.bud, null, 'a bloom is not also a bud');
  }
  for (const f of pending) {
    assert.equal(f.petals.length, 0, 'a closed bud has NO petals — dormant reads as the absence');
    assert.equal(f.centreRadius, 0, 'and no centre disc');
    assert.ok(f.bud, 'a pending flower is a bud');
  }
  for (const f of failing) {
    assert.ok(f.petals.length >= 5, 'a wilted head still has petals');
    assert.ok(f.centreRadius > 0);
    assert.equal(f.bud, null);
  }
});

test('a failing head NODS: it sits lower and off to one side of the upright it replaced', () => {
  // The wilt is a geometric claim, so it is asserted geometrically rather than trusted to the
  // kind string. Same criteria, same seeds, same island — only the state differs, so any
  // difference in the head's placement is the wilt and nothing else.
  const proven = flowersFrom(islandScene({ criteriaStates: ALL('proven') }));
  const failing = flowersFrom(islandScene({ criteriaStates: ALL('failing') }));
  const byId = new Map(proven.map((f) => [f.criterion, f]));

  let nodded = 0;
  for (const f of failing) {
    const up = byId.get(f.criterion)!;
    // SVG y runs DOWN, so a SUNKEN head has a LARGER y than the upright one it replaced.
    assert.ok(f.head.y > up.head.y, `${f.criterion}: a failing head sinks`);
    if (Math.abs(f.head.x - up.head.x) > 1) nodded++;
  }
  assert.equal(nodded, failing.length, 'every failing head also leans off the stalk’s true line');
});

test('the petals a bloom carries are the ones the surface authored — angles and all', () => {
  const flowers = flowersFrom(islandScene({ criteriaStates: ALL('proven') }));
  for (const f of flowers) {
    // The surface spaces a daisy's petals evenly around the full circle with a small seeded
    // jitter; a wilted head confines its petals to the lower arc. If the extractor ever lost the
    // rotate term, every angle would read 0 and the two forms would become the same ring.
    const angles = f.petals.map((p) => p.angleDeg);
    assert.equal(new Set(angles).size, angles.length, 'no two petals share an angle');
    assert.ok(Math.max(...angles) - Math.min(...angles) > 180, 'a bloom radiates all the way round');
    for (const p of f.petals) {
      assert.ok(p.length > 0 && p.halfWidth > 0);
      assert.ok(p.halfWidth < p.length, 'a petal is longer than it is broad');
    }
  }
});

test('a WILTED head’s petals hang: they occupy the lower arc, never the full circle', () => {
  const flowers = flowersFrom(islandScene({ criteriaStates: ALL('failing') }));
  for (const f of flowers) {
    for (const p of f.petals) {
      // `scene.ts` confines them to 112°–248° plus a ±6° jitter. Asserting the BAND rather than
      // the exact numbers is what lets the surface re-jitter without this test lying, while
      // still failing the moment a wilted head starts radiating like a bloom.
      assert.ok(
        p.angleDeg > 100 && p.angleDeg < 260,
        `${f.criterion}: a wilted petal at ${p.angleDeg}° is not hanging`,
      );
    }
  }
});

test('every flower stands ON the island, at its own planted base', () => {
  const flowers = flowersFrom(islandScene({}));
  for (const f of flowers) {
    assert.equal(f.transform.y, 0, 'a flower is planted on the ground plane, never floating');
    assert.ok(Number.isFinite(f.transform.x) && Number.isFinite(f.transform.z));
    assert.ok(f.footprint.w > 0 && f.footprint.h > 0, 'a zero-extent flower is a delivery lie');
    assert.ok(f.marks > 0);
  }
  // The scatter's keep-outs mean no two markers share a spot; a collapse to one point is the
  // failure mode the scatter's own exhaustion path can produce, so it is checked here too.
  const spots = new Set(flowers.map((f) => `${f.transform.x.toFixed(2)},${f.transform.z.toFixed(2)}`));
  assert.equal(spots.size, flowers.length, 'every flower has its own ground spot');
});

test('the stalk and the bud arrive as CURVES, not as bounding boxes', () => {
  // The bud's silhouette IS the pending verdict, and the control-point hull is a third wider
  // than the curve it controls (2.9 against 2.14 on the authored small bud). Reading the box
  // would fatten every bud on the island for a reason no picture would ever explain.
  const pending = flowersFrom(islandScene({ criteriaStates: ALL('pending') }));
  for (const f of pending) {
    assert.ok(f.bud, 'a pending flower carries a bud');
    const { p0, c1, c2, p3 } = f.bud!;
    assert.ok(p0.y < p3.y, 'the bud runs from its TIP down to the planted head point');
    const widest = Math.max(Math.abs(c1.x - p3.x), Math.abs(c2.x - p3.x));
    assert.ok(widest > 0, 'the controls bow the bud out from the stalk');
    assert.ok(f.stem, 'and the stalk it sits on is a curve too');
    assert.equal(f.stem!.p0.x, 0, 'the stalk starts at the marker’s own planted origin');
    assert.equal(f.stem!.p0.y, 0);
  }
});

test('DETERMINISM: the same island yields byte-identical flowers', () => {
  // ADR-0380 D6 fence 2: determinism MOVES to the scene graph rather than disappearing. If the
  // extraction were not deterministic, nothing downstream could be.
  const a = flowersFrom(islandScene({ criteriaStates: ALL('proven') }));
  const b = flowersFrom(islandScene({ criteriaStates: ALL('proven') }));
  assert.deepEqual(a, b);
});

test('no flowers when the island declares none — the absence lock holds', () => {
  assert.deepEqual(flowersFrom(islandScene({ flowers: false })), []);
});
