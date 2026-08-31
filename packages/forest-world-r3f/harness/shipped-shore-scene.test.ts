// shipped-shore-scene.test.ts — the claims about the REAL island, beside the instrument that
// measures it.
//
// ⚠ THE DIVISION OF LABOUR THIS FILE INHERITS FROM ITS COAST SIBLING. `src/shore-fall.test.ts`
// asserts the FIELD — the falloff, the distance, the product rule — on rings written out in that
// file, so it needs no fixture. This file asserts what the field does to the island the studio
// actually ships: how far the band reaches into it, how much ground it moves, and whether that
// reaches the delivered colour. Both are cheap arithmetic over descriptors; neither renders.
//
// ⚠⚠ AND THE FIXTURES ARE LAZY AND THE PLANS MEMOISED, WHICH IS A MUTATION-RUNG REQUIREMENT
// MEASURED RATHER THAN GUESSED. `check:mutation-diff` re-imports this module once PER MUTANT, and
// `shorePlan` walks every distinct vertex of the island evaluating two relief fields and two
// normals at each. Paying that at module scope, or twice per test, multiplies the rung's whole
// wall clock by the mutant count — the difference the coast increment measured between a 9m10s
// rung and a 1m51s one.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SHIPPED_COAST, clipToCoast } from '../src/coast-clip.js';
import {
  AUTHORED_SHORE_WIDTH,
  SHIPPED_SHORE,
  SHORE_ARM_WIDTH,
  SHORE_DIP,
} from '../src/shore-fall.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import {
  ALL_SHORE_ARMS,
  REFERENCE_ARM,
  SHORE_ARM_CAPTION,
  SHORE_TREATMENT_ARMS,
  shorePlan,
  type ShorePlan,
} from './shipped-shore-scene.js';
import { shippedParcels } from './shipped-land-scene.js';

/** The island the studio actually ships, built lazily — see the note at the top of this file. */
let island: InstanceDescriptor[] | null = null;
function shippedIsland(): InstanceDescriptor[] {
  island ??= shippedParcels();
  return island;
}

/** `shorePlan` memoised per arm. The tests below ask for the same plans repeatedly, and each one
 *  evaluates two relief fields over every distinct vertex of a 164-parcel island. */
const PLANS = new Map<string, ShorePlan>();
function planOf(arm: (typeof ALL_SHORE_ARMS)[number]): ShorePlan {
  let plan = PLANS.get(arm);
  if (plan === undefined) {
    plan = shorePlan(shippedIsland(), arm);
    PLANS.set(arm, plan);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// The premise
// ---------------------------------------------------------------------------

test('⚠ THE PREMISE: the map as it ships does NOT fall to its shore', () => {
  // The control moves nothing against itself, which is what makes every figure below a difference
  // from a real starting point rather than from an assumption about one. If this ever fails the
  // component has already landed somewhere else and this whole page is measuring a solved problem.
  const control = planOf(REFERENCE_ARM);
  assert.equal(control.movedVertices, 0);
  assert.equal(control.rungFlips, 0);
  assert.equal(control.maxDrop, 0);
  assert.equal(control.meanDrop, 0);
});

test('the island the band is measured on is the one the mapper emits', () => {
  assert.equal(shippedIsland().length, 164);
  // The coast clip subdivides, so the CLIPPED island carries more ring vertices than the raw one.
  // The shore is measured to the clipped rim, so this is the population the band works over.
  const clipped = clipToCoast(shippedIsland(), SHIPPED_COAST);
  assert.equal(clipped.length, 164);
  assert.ok(planOf(REFERENCE_ARM).vertices > 0);
});

// ---------------------------------------------------------------------------
// ⚠⚠ The headline: the component is exactly free
// ---------------------------------------------------------------------------

test('⚠⚠ EVERY ARM IS EXACTLY FREE — no triangle, no ring vertex, no byte, no square unit', () => {
  // THE CLAIM THIS INCREMENT LEADS WITH, and the one most likely to be believed rather than
  // checked. A vertical fall moves vertices in Y and creates none, so a moving column here is a BUG
  // and not a cost. The driver refuses a run in which any of these differ; this is the same
  // assertion off the GPU, where it costs a few milliseconds instead of a browser.
  const control = planOf(REFERENCE_ARM);
  for (const arm of SHORE_TREATMENT_ARMS) {
    const plan = planOf(arm);
    assert.equal(plan.triangles, control.triangles, `${arm} moved the triangle count`);
    assert.equal(plan.ringVertices, control.ringVertices, `${arm} moved the ring-vertex count`);
    assert.equal(plan.attributeBytes, control.attributeBytes, `${arm} moved the attribute bytes`);
    assert.equal(plan.vertices, control.vertices, `${arm} moved the distinct-vertex count`);
    assert.ok(
      Math.abs(plan.groundArea - control.groundArea) < 1e-9,
      `${arm} changed how much land there is: ${plan.groundArea} against ${control.groundArea}`,
    );
  }
});

test('no parcel folds on any arm — the coast clip’s cap survives the fall', () => {
  // The shore is measured to the rim of exactly these parcels, so a folded parcel would be a folded
  // SHORE as well as the misreport the coast increment capped for. Carried forward deliberately
  // rather than assumed to still hold.
  for (const arm of ALL_SHORE_ARMS) {
    assert.equal(planOf(arm).foldedParcels, 0, `${arm} folded a parcel`);
  }
});

// ---------------------------------------------------------------------------
// What the band actually does to this island
// ---------------------------------------------------------------------------

test('⚠⚠⚠ THE MESH CANNOT READ A BAND NARROWER THAN 8.66 UNITS — the increment’s finding', () => {
  // ⚠ THIS TEST REPLACED ONE THAT ASSERTED THE OPPOSITE, and the correction is the increment. It
  // said "a wider band moves more vertices" — the assertion that catches a falloff wired up
  // backwards — and it FAILED, because `authored` (3.1) and `beach` (7) move the identical set.
  //
  // The measurement, on the shipped island: 253 of 392 distinct ground vertices lie EXACTLY on the
  // coast, and the nearest interior vertex is 8.66 ground units away. There is not one vertex at
  // any distance in between. So every band narrower than 8.66 acts on the rim ALONE and delivers
  // the bit-identical land — the smoothstep never gets a sample to curve through.
  //
  // WHY IT IS STRUCTURAL: the reference generator displaces a 0.55-unit GRID, so its 3.1-unit band
  // spans six samples. This ground is parcels ~16.5 units across whose only vertices are corners,
  // and 8.66 is the lattice's half-pitch. The mesh is ~30x coarser than the surface the component
  // was authored on. `src/shore-fall.ts` carries the full note and the remedy.
  const authored = planOf('authored');
  const beach = planOf('beach');
  assert.equal(authored.movedVertices, beach.movedVertices);
  assert.equal(authored.maxDrop, beach.maxDrop);
  assert.equal(authored.meanDrop, beach.meanDrop);
  assert.equal(authored.rungFlips, beach.rungFlips);
  assert.ok(
    SHORE_ARM_WIDTH.authored < SHORE_ARM_WIDTH.beach,
    'the two arms are no longer different widths, so their equality has stopped being a finding',
  );
});

test('⚠ AND THE FIRST WIDTH IT CAN READ DOES REACH FURTHER — the void has an outer edge', () => {
  // The other half, and what stops the test above from being satisfied by a falloff that ignores
  // its width entirely: `shelf` at 16.5 units is past the void, and it moves strictly more ground.
  // Without this the module could hard-code a single band and pass.
  const beach = planOf('beach');
  const shelf = planOf('shelf');
  assert.ok(
    shelf.movedVertices > beach.movedVertices,
    `shelf moved ${shelf.movedVertices}, no more than beach's ${beach.movedVertices}`,
  );
  assert.ok(shelf.rungFlips > beach.rungFlips, 'the wider band changed no more delivered colour');
});

test('every arm moves ground, and none of them moves all of it', () => {
  // A band that touched EVERY vertex would not be a shore band, it would be a global scaling — and
  // it would silently lower the ground under every prop on the island.
  const total = planOf(REFERENCE_ARM).vertices;
  for (const arm of SHORE_TREATMENT_ARMS) {
    const plan = planOf(arm);
    assert.ok(plan.movedVertices > 0, `${arm} moved nothing`);
    assert.ok(
      plan.movedVertices < total,
      `${arm} moved all ${total} vertices — that is a global scaling, not a shore`,
    );
  }
});

test('⚠ THE ISLAND’S LOWEST GROUND IS ITS SWELL, NOT ITS WATERLINE — the dip does not deepen it', () => {
  // ⚠ THIS TEST REPLACED ONE THAT ASSERTED `minHeight` DROPS, and the old one was simply wrong
  // about the numbers rather than about the component. The waterline sits at -0.62; the sine sum's
  // own trough on this island is -3.912, six times deeper. So the dip cannot lower the island's
  // MINIMUM, and asserting that it does would have pinned a relationship between two unrelated
  // constants — a test that goes red the day somebody retunes the swell.
  //
  // What IS true is sharper, and it is the scaling identity showing up on the real island: the fall
  // moves ground TOWARD the waterline, so where a band reaches a trough DEEPER than the waterline
  // it RAISES it. The island's floor therefore never gets deeper, whatever the band does — so no
  // camera framing constant and no shadow reach moves in this increment.
  const control = planOf(REFERENCE_ARM);
  assert.ok(control.minHeight < -SHORE_DIP, 'the swell is no longer deeper than the waterline');
  for (const arm of SHORE_TREATMENT_ARMS) {
    assert.ok(
      planOf(arm).minHeight >= control.minHeight,
      `${arm} deepened the island's floor to ${planOf(arm).minHeight} — the fall only ever pulls toward the waterline`,
    );
  }
  // And which arms reach the trough at all is the void again, from the other end: the two bands
  // inside it leave the floor untouched to the last bit, and only `shelf` is wide enough to lift it.
  assert.equal(planOf('authored').minHeight, control.minHeight);
  assert.equal(planOf('beach').minHeight, control.minHeight);
  assert.ok(planOf('shelf').minHeight > control.minHeight);
});

test('⚠⚠ THE SHIPPED ARM LOWERS NO GROUND A PROP STANDS ON — and `shelf` does', () => {
  // THE MEASURED REASON `beach` SHIPS. `dressMapFromKit` still reads the MAPPER's descriptors, so
  // a tree stands where its parcel put it and the beach grows underneath — the coast clip's own
  // deliberate scoping, inherited here. That only stays honest while the band stops at the
  // pre-coast boundary, and `COAST_OUTSET` is exactly where that boundary now is.
  //
  // The tell is the island's HIGHEST ground: the peak of the swell is deep in the interior, so an
  // arm that lowers it has reached ground that existed before the coast — and props stand there.
  const control = planOf(REFERENCE_ARM);
  assert.equal(
    planOf(SHIPPED_SHORE).maxHeight,
    control.maxHeight,
    'the shipped band reached inland of the pre-coast boundary — it is now moving ground under props',
  );
  assert.ok(
    planOf('shelf').maxHeight < control.maxHeight,
    'shelf no longer reaches inland — the contrast this arm exists to show has gone',
  );
});

test('⚠ THE FALL REACHES THE DELIVERED COLOUR — it flips shade rungs, it is not only geometry', () => {
  // THE CHECK THAT SEPARATES "the land moved" FROM "the map looks different", which are not the
  // same claim. The banded material quantises `dot(n, L)` onto the authored ladder, so a band that
  // moved a lot of ground but flipped no rung would be INVISIBLE on the shipped material however
  // deep its drop — and every free-ness figure above would still read as a success.
  for (const arm of SHORE_TREATMENT_ARMS) {
    assert.ok(planOf(arm).rungFlips > 0, `${arm} moved ground but changed no delivered colour`);
  }
});

// ---------------------------------------------------------------------------
// ⚠ The fork the owner is being shown
// ---------------------------------------------------------------------------

test('⚠ THE CONSTANTS ARE THE APPROVED RENDER’S OWN, transcribed rather than tuned', () => {
  // ⚠ THIS TEST REPLACED ONE THAT ASSERTED THE AUTHORED BAND REACHES LESS FAR THAN OURS. It was
  // the right question and the mesh dissolved it: below 8.66 units the two widths are the same
  // land. What survives is the provenance — these are the generator's numbers, not this session's,
  // and a later session that retunes one should have to change this line to do it.
  assert.equal(AUTHORED_SHORE_WIDTH, 3.1, "build_land.py's own BEACH");
  assert.equal(SHORE_DIP, 0.62, "build_land.py's own beach dip");
  assert.equal(SHORE_ARM_WIDTH.beach, 7, 'COAST_OUTSET — the beach this map draws');
  assert.ok(
    SHORE_ARM_WIDTH.authored < SHORE_ARM_WIDTH.beach,
    'the two widths have converged — their equal DELIVERY is only a finding while they differ',
  );
});

test('the SHIPPED arm is the one whose band matches the beach the coast draws', () => {
  assert.equal(SHIPPED_SHORE, 'beach');
  assert.equal(SHORE_ARM_WIDTH[SHIPPED_SHORE], 7);
});

test('every arm is captioned, control first, and nothing is offered without being explained', () => {
  assert.deepEqual([...ALL_SHORE_ARMS], ['none', 'authored', 'beach', 'shelf']);
  assert.equal(ALL_SHORE_ARMS[0], REFERENCE_ARM);
  for (const arm of ALL_SHORE_ARMS) {
    assert.ok(SHORE_ARM_CAPTION[arm].length > 20, `${arm} has no caption worth reading`);
  }
  assert.match(SHORE_ARM_CAPTION[REFERENCE_ARM], /CONTROL/);
});
