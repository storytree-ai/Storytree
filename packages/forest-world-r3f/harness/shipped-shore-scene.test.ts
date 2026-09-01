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
  SHORE_WIDTH_ARMS,
  SHORE_RING_ARMS,
  RING_REFERENCE_ARM,
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

test('⚠⚠ EVERY WIDTH ARM IS EXACTLY FREE — no triangle, no ring vertex, no byte, no square unit', () => {
  // THE CLAIM THE SHORE FALL LED WITH, and the one most likely to be believed rather than checked.
  // A vertical fall moves vertices in Y and creates none, so a moving column here is a BUG and not
  // a cost. The driver refuses a run in which any of these differ; this is the same assertion off
  // the GPU, where it costs a few milliseconds instead of a browser.
  //
  // ⚠⚠ SCOPED TO THE WIDTH AXIS, AND THE NARROWING IS THE NEXT INCREMENT RATHER THAN A WEAKENING.
  // The RING arms divide the mesh, so they are supposed to spend triangles — the test below is
  // theirs, and it is stricter about the one thing a division must not move.
  const control = planOf(REFERENCE_ARM);
  for (const arm of SHORE_WIDTH_ARMS.filter((a) => a !== REFERENCE_ARM)) {
    const plan = planOf(arm);
    assert.equal(plan.triangles, control.triangles, `${arm} moved the triangle count`);
    assert.equal(plan.ringVertices, control.ringVertices, `${arm} moved the ring-vertex count`);
    assert.equal(plan.attributeBytes, control.attributeBytes, `${arm} moved the attribute bytes`);
    assert.equal(plan.vertices, control.vertices, `${arm} moved the distinct-vertex count`);
    assert.equal(plan.dividedParcels, 0, `${arm} divided a parcel — it has no ring`);
    assert.ok(
      Math.abs(plan.groundArea - control.groundArea) < 1e-9,
      `${arm} changed how much land there is: ${plan.groundArea} against ${control.groundArea}`,
    );
  }
});

test('⚠⚠ A RING BUYS ITS SHAPE WITH TRIANGLES AND WITH NOTHING ELSE — the land itself is conserved', () => {
  // THE CLAIM THE INSET RING LEADS WITH, and it is two claims that have to hold together. A
  // division that lost or double-counted ground would move `groundArea` by exactly the ground it
  // got wrong — and on a map whose colour reports a capability's status, ground drawn twice is one
  // capability's status painted over another's (ADR-0392 D5 / ADR-0398 D7). So the area is the
  // check, and the triangles are the price.
  const control = planOf(RING_REFERENCE_ARM);
  for (const arm of SHORE_RING_ARMS) {
    const plan = planOf(arm);
    assert.ok(plan.triangles > control.triangles, `${arm} divided nothing — it cost no triangles`);
    assert.ok(plan.ringVertices > control.ringVertices, `${arm} inserted no wall vertices`);
    assert.ok(plan.dividedParcels > 0, `${arm} divided no parcel at all`);
    assert.equal(
      plan.insertedVertices,
      plan.ringVertices - control.ringVertices,
      `${arm}'s census disagrees with the wall rings it actually produced`,
    );
    // ⚠ THE AREA IS ASSERTED EXACTLY, not within a tolerance of the arm's own size: the sub-faces
    // share their vertices with the wall ring, so in exact arithmetic the sum IS the whole, and
    // the only slack admitted is the shoelace's own accumulated rounding.
    assert.ok(
      Math.abs(plan.groundArea - control.groundArea) < 1e-6,
      `${arm} changed how much land there is: ${plan.groundArea} against ${control.groundArea}`,
    );
    assert.equal(plan.foldedParcels, 0, `${arm} folded a parcel`);
  }
});

test('⚠⚠⚠ THE RING IS WHAT MAKES THE FALLOFF’S SHAPE DELIVERABLE — the sag falls, and by how much', () => {
  // THE INCREMENT'S OWN QUESTION, asked as a property of the SURFACE rather than of a picture.
  // `shoreRelief` is analytic — it answers the smoothstep at every point — but what the map DRAWS
  // is a triangulation that samples it at vertices and interpolates flat between them. With no
  // vertex between the coastline and the first interior corner 8.66 units inland, the drawn shore
  // is a straight ramp and the falloff's shape is not coarse but ABSENT. The sag is that gap.
  //
  // ⚠ A RING THAT COST TRIANGLES AND DID NOT MOVE THIS BOUGHT NOTHING, which is the answer this
  // increment was chartered to be willing to give. It did not have to come out this way.
  const control = planOf(RING_REFERENCE_ARM);
  assert.ok(control.bandTriangles > 0, 'the control has no band to be wrong about');
  assert.ok(control.maxSag > 1, 'the undivided band already tracks the land — nothing to fix');
  for (const arm of SHORE_RING_ARMS) {
    const plan = planOf(arm);
    assert.ok(
      plan.bandTriangles > control.bandTriangles,
      `${arm} put no extra triangles inside the band`,
    );
    assert.ok(plan.meanSag < control.meanSag, `${arm} did not reduce the mean sag`);
    assert.ok(plan.maxSag < control.maxSag, `${arm} did not reduce the worst sag`);
  }
  // And a SECOND ring keeps paying — the question `ring-pair` exists to answer, and the reason the
  // page shows both rather than arguing from one.
  assert.ok(planOf('ring-pair').meanSag < planOf('ring').meanSag);
});

test('⚠⚠ THE SAG SEPARATES TWO ARMS THAT DELIVER THE IDENTICAL LAND — and that is the point of it', () => {
  // ⚠ THE FIXED REGION IS WHAT MAKES THIS READABLE, and its first draft was not. Measured over each
  // arm's OWN band, `authored` (3.1 units) came back with a LOWER mean sag than `beach` (7) and read
  // as the better arm; only the denominator had moved. Over a FIXED region the comparison is real.
  //
  // ⚠⚠ AND WHAT IT THEN SHOWS IS SHARPER THAN EQUALITY. These two arms deliver the BIT-IDENTICAL
  // land — same mesh, same vertices, same heights, the void finding — and yet their sags differ,
  // because the sag is measured against each arm's own ANALYTIC field and those fields are not the
  // same function. `authored`'s smoothstep finishes in 3.1 units where `beach`'s takes 7, so the
  // straight ramp this mesh is forced to draw departs from it FURTHER. The narrower the authored
  // band, the more of its shape the mesh fails to carry. That is the void finding stated as a
  // quantity rather than as an identity, and it is the reason the ring exists.
  const authored = planOf('authored');
  const beach = planOf('beach');
  // The MESH is the same, over the same fixed region.
  assert.equal(authored.bandTriangles, beach.bandTriangles);
  assert.equal(authored.movedVertices, beach.movedVertices);
  assert.equal(authored.maxDrop, beach.maxDrop);
  assert.equal(authored.rungFlips, beach.rungFlips);
  // The SHAPE it is failing to carry is not.
  assert.ok(
    authored.maxSag > beach.maxSag,
    `authored's sharper band should be harder to carry: ${authored.maxSag} against ${beach.maxSag}`,
  );
  // And the CONTROL has a sag of its own there — the sine relief's own chordal error over the same
  // ground. An empty control row would make every other number unreadable as an improvement.
  const control = planOf(REFERENCE_ARM);
  assert.ok(control.bandTriangles > 0, 'the control covers none of the region — it is not a baseline');
  assert.ok(control.meanSag > 0, 'the control tracks the land exactly, which the sine sum does not');
});

test('the ladder’s cap is REPORTED, never silent — a coast can turn tighter than its ring', () => {
  // `coastCapping`'s own argument, one dimension over: a cap nobody can see is indistinguishable
  // from a shore that never needed one. An inward offset self-intersects as soon as it exceeds the
  // curve's radius of curvature, and this coast is noise-perturbed, so some headlands do.
  for (const arm of SHORE_RING_ARMS) {
    const plan = planOf(arm);
    assert.ok(plan.cappedParcels > 0, `${arm} capped nothing — has the coast stopped turning?`);
    assert.ok(plan.cappedParcels < plan.dividedParcels, `${arm} capped every parcel it divided`);
    assert.ok(plan.leastScale > 0, `${arm} kept a parcel at zero depth — that band draws nothing`);
    assert.ok(plan.leastScale < 1, `${arm} reports a cap it did not apply`);
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
  for (const arm of SHORE_TREATMENT_ARMS) {
    const plan = planOf(arm);
    assert.ok(plan.movedVertices > 0, `${arm} moved nothing`);
    // ⚠ AGAINST ITS OWN VERTEX COUNT, never the control's. A ring arm has a finer mesh, so holding
    // it to the control's total would report a mesh with more vertices as a band that reaches
    // further — the two numbers would not be about the same thing.
    assert.ok(
      plan.movedVertices < plan.vertices,
      `${arm} moved all ${plan.vertices} of its vertices — that is a global scaling, not a shore`,
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

test('the SHIPPED arm draws the beach’s own width, and now has vertices inside it', () => {
  // ⚠ THE WIDTH IS STILL `COAST_OUTSET`, and that half has not moved: the fall covers exactly the
  // land the coast clip added and stops at the pre-coast boundary, where the ground carries props.
  // What changed is that the mesh can now CARRY that band's shape.
  assert.equal(SHIPPED_SHORE, 'ring');
  assert.equal(SHORE_ARM_WIDTH[SHIPPED_SHORE], 7);
  assert.equal(SHORE_ARM_WIDTH[SHIPPED_SHORE], SHORE_ARM_WIDTH[RING_REFERENCE_ARM]);
  assert.ok(SHORE_RING_ARMS.includes(SHIPPED_SHORE), 'the shipped arm draws no ring');
});

test('⚠⚠ THE SHIPPED ARM REACHES MOST OF THE SHORE — which is why it is not `ring-pair`', () => {
  // THE ADOPTION ARGUMENT, ASSERTED RATHER THAN WRITTEN DOWN. `ring-pair` has the better average by
  // a distance and its cost is nowhere near a hardware floor, which is the only ground ADR-0415 D1
  // leaves for rejecting detail. What it loses is COVERAGE: its outer chain folds on coasts that
  // turn tighter than 4.67 units, so it leaves a fifth of the shore with no band at all, and a
  // band that keeps stopping reads worse than one that is uniformly gentler.
  //
  // ⚠ THIS IS A PROPERTY OF THE LADDER RATHER THAN OF TWO RINGS. It degrades a chain's DEPTH and
  // not the ring COUNT, so a parcel that cannot carry the outer chain falls back to no chain
  // instead of to the inner one. Fixing that would very likely invert this test, which is the point
  // of stating the reason: the refusal is revisitable, not final.
  const shipped = planOf(SHIPPED_SHORE);
  const pair = planOf('ring-pair');
  assert.equal(shipped.coastalParcels, pair.coastalParcels, 'the shore is the same shore');
  assert.ok(
    shipped.dividedParcels > pair.dividedParcels,
    `the shipped arm reaches less of the shore than ring-pair: ${shipped.dividedParcels} against ` +
      `${pair.dividedParcels} of ${shipped.coastalParcels}`,
  );
  assert.ok(
    shipped.dividedParcels > shipped.coastalParcels * 0.8,
    `the shipped arm banded ${shipped.dividedParcels} of ${shipped.coastalParcels} coastal parcels`,
  );
  // And `ring-pair` still wins on the average, which is what makes this a trade rather than a
  // dominance — if it ever stopped winning there, the coverage argument would be moot.
  assert.ok(pair.meanSag < shipped.meanSag);
});

test('every arm is captioned, control first, and nothing is offered without being explained', () => {
  assert.deepEqual(
    [...ALL_SHORE_ARMS],
    ['none', 'authored', 'beach', 'shelf', 'ring', 'ring-pair'],
  );
  // The two axes partition the arms: every arm is on exactly one of them, and they meet at
  // `beach`, which is the width axis's last rung and the ring axis's control.
  assert.deepEqual([...SHORE_WIDTH_ARMS], ['none', 'authored', 'beach', 'shelf']);
  assert.deepEqual([...SHORE_RING_ARMS], ['ring', 'ring-pair']);
  assert.ok(SHORE_WIDTH_ARMS.includes(RING_REFERENCE_ARM));
  assert.equal(ALL_SHORE_ARMS[0], REFERENCE_ARM);
  for (const arm of ALL_SHORE_ARMS) {
    assert.ok(SHORE_ARM_CAPTION[arm].length > 20, `${arm} has no caption worth reading`);
  }
  assert.match(SHORE_ARM_CAPTION[REFERENCE_ARM], /CONTROL/);
});
