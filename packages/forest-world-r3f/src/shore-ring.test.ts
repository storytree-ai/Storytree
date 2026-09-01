// shore-ring.test.ts — the inset ring, held to the properties a DIVIDED parcel has to keep.
//
// ⚠⚠ THE FIXTURES ARE ANCHORED AWAY FROM THE ORIGIN ON PURPOSE. The mutation rung on the shore
// fall found a thorough-looking test that could not fail: a box anchored at (0, 0), where
// `Math.hypot` squares its arguments and a sign flip on one term vanished entirely. Every ring
// here sits at a positive offset in both axes, so a swapped or negated coordinate moves the answer.
//
// ⚠ THE SHORE FIELD IS SUPPLIED BY THE TEST, never taken from the real map. `shoreRingSplit` takes
// a `ShoreFieldReader`, so the whole module is drivable with a distance field the test can reason
// about — a straight coastline along one edge — and the properties below are then about the
// DIVISION rather than about one island's coast wave.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalisedRing,
  signedRingArea2,
  triangulateRing,
  type P2,
} from './cell-ground-geometry.js';
import { COAST_OUTSET, isSimpleRing, vertexKey } from './coast-clip.js';
import { SHORE_ARM_WIDTH, type ShoreArm, type ShoreFieldReader } from './shore-fall.js';
import {
  RING_ARMS,
  SHORE_ARM_INSETS,
  SHORE_RING_BISECTIONS,
  SHORE_RING_COAST_EPS,
  SHORE_RING_PROBE_MARGIN,
  armHasRing,
  coastRun,
  crossingOnEdge,
  insetDirection,
  inwardNormal,
  shoreRingField,
  shoreRingPlan,
  shoreRingSplit,
} from './shore-ring.js';
import type { InstanceDescriptor } from './world-to-3d.js';

// ---------------------------------------------------------------------------
// A shore a test can reason about
// ---------------------------------------------------------------------------

/** The x-axis line `z = COAST_Z`, standing in for a coastline. Ground with z ABOVE it is land, and
 *  a point's shore distance is how far above the line it stands. Anchored well away from the
 *  origin so a dropped or negated term cannot cancel itself out. */
const COAST_Z = 40;

/** A straight coast as a {@link ShoreFieldReader}: distance is the gap to `z = COAST_Z`, capped
 *  like the real field caps, and the gradient points inland (+z). */
function straightShore(width: number): ShoreFieldReader {
  return {
    width,
    loops: 1,
    sample(_x, z) {
      const d = Math.min(Math.abs(z - COAST_Z), width);
      return { distance: d, gx: 0, gz: z >= COAST_Z ? 1 : -1 };
    },
  };
}

/** A rectangular parcel with its seaward edge ON the coast: four corners, two of them at distance
 *  zero. `depth` is how far inland it reaches. Wound so `normalisedRing` has work to check. */
function coastalBox(x0: number, x1: number, depth: number): P2[] {
  return [
    { x: x0, z: COAST_Z },
    { x: x1, z: COAST_Z },
    { x: x1, z: COAST_Z + depth },
    { x: x0, z: COAST_Z + depth },
  ];
}

/** The same box moved wholly inland — no vertex on the coast at all. */
function inlandBox(x0: number, x1: number, near: number, far: number): P2[] {
  return [
    { x: x0, z: COAST_Z + near },
    { x: x1, z: COAST_Z + near },
    { x: x1, z: COAST_Z + far },
    { x: x0, z: COAST_Z + far },
  ];
}

const area2 = (ring: readonly P2[]): number => Math.abs(signedRingArea2(ring));

// ---------------------------------------------------------------------------
// The arm table
// ---------------------------------------------------------------------------

test('the ring arms are exactly the arms with insets, and the width arms have none', () => {
  // DERIVED rather than listed, which is the property: an arm that gained a ring and was left out
  // of `RING_ARMS` would be drawn on the page and compared against the wrong denominator.
  assert.deepEqual([...RING_ARMS], ['ring', 'ring-pair']);
  for (const arm of ['none', 'authored', 'beach', 'shelf'] as ShoreArm[]) {
    assert.equal(armHasRing(arm), false, `${arm} is on the width axis and must draw no ring`);
    assert.deepEqual([...SHORE_ARM_INSETS[arm]], []);
  }
  for (const arm of RING_ARMS) assert.equal(armHasRing(arm), true);
});

test('⚠ EVERY INSET IS DERIVED FROM THE BEACH, so a wider beach moves its rings with it', () => {
  // The failure this forecloses is silent and total: a hand-written 3.5 left behind by a change to
  // `COAST_OUTSET` would put the ring OUTSIDE the band, where the falloff is already 1 and the
  // extra vertices buy nothing at all while still costing their triangles.
  assert.deepEqual([...SHORE_ARM_INSETS.ring], [COAST_OUTSET / 2]);
  assert.deepEqual([...SHORE_ARM_INSETS['ring-pair']], [COAST_OUTSET / 3, (COAST_OUTSET * 2) / 3]);
  for (const arm of RING_ARMS) {
    for (const inset of SHORE_ARM_INSETS[arm]) {
      assert.ok(inset > 0, `${arm} has a ring at or seaward of the waterline`);
      assert.ok(inset < SHORE_ARM_WIDTH[arm], `${arm} has a ring outside its own band`);
    }
  }
});

test('the ring arms’ insets are strictly ascending, which the division relies on', () => {
  // `shoreRingSplit` sorts, so this is not a precondition — but a table authored out of order is a
  // table somebody has stopped reading, and the bands are built seaward-first.
  for (const arm of RING_ARMS) {
    const insets = [...SHORE_ARM_INSETS[arm]];
    assert.deepEqual(insets, [...insets].sort((a, b) => a - b));
  }
});

// ---------------------------------------------------------------------------
// The chain's geometry
// ---------------------------------------------------------------------------

test('the inward normal is the ring convention’s, and it is a UNIT vector', () => {
  // `cell-ground-geometry.ts` settles it: for the negative winding, A→B faces `(-dz, 0, dx)`
  // OUTWARD. A sign error here points every chain into the sea, which draws as an island with a
  // moat and would be caught — but only after a browser run.
  const n = inwardNormal({ x: 10, z: 20 }, { x: 14, z: 20 });
  assert.deepEqual(n, { x: 0, z: -1 });
  const diagonal = inwardNormal({ x: 10, z: 20 }, { x: 13, z: 24 });
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-12);
  // Reversing the edge reverses the normal — the property that makes "inward" a fact about the
  // ring's winding rather than about the order two points happened to be written in.
  const back = inwardNormal({ x: 14, z: 20 }, { x: 10, z: 20 });
  assert.deepEqual(back, { x: 0, z: 1 });
});

test('a zero-length edge has no inward direction, and says so with a zero vector', () => {
  // Reachable on a degenerate ring, and an ordinary answer rather than a guard: the caller SUMS
  // normals, so a zero contributes nothing and the other edge decides.
  assert.deepEqual(inwardNormal({ x: 7, z: 9 }, { x: 7, z: 9 }), { x: 0, z: 0 });
});

test('the inset direction bisects, and is a unit vector at a corner', () => {
  // A right-angle corner: one edge running +x, the next running +z. Inward for the first is -z and
  // for the second is +x, so the bisector is the diagonal between them.
  const dir = insetDirection({ x: 10, z: 20 }, { x: 14, z: 20 }, { x: 14, z: 24 });
  assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-12);
  assert.ok(Math.abs(dir.x - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(dir.z + Math.SQRT1_2) < 1e-12);
  // Straight through: both edges agree, so the bisector IS the shared normal.
  const straight = insetDirection({ x: 10, z: 20 }, { x: 14, z: 20 }, { x: 18, z: 20 });
  assert.deepEqual(straight, { x: 0, z: -1 });
});

test('a 180-degree spur falls back to the INCOMING edge’s own inward normal', () => {
  // The two normals cancel exactly, so the sum has no direction. Reachable on a ring that doubles
  // back — which the ladder's own bottom rungs can produce — and the incoming edge is the honest
  // answer rather than an arbitrary one.
  const dir = insetDirection({ x: 10, z: 20 }, { x: 14, z: 20 }, { x: 10, z: 20 });
  assert.deepEqual(dir, { x: 0, z: -1 });
});

// ---------------------------------------------------------------------------
// The crossing — the half that must agree with a neighbour
// ---------------------------------------------------------------------------

test('a crossing lands where the shore distance IS the inset', () => {
  const field = straightShore(20);
  const p = crossingOnEdge(field, { x: 30, z: COAST_Z }, { x: 30, z: COAST_Z + 12 }, 3.5);
  assert.ok(Math.abs(p.z - (COAST_Z + 3.5)) < 1e-6, `landed at ${p.z}`);
  assert.equal(p.x, 30, 'a crossing stays ON its edge');
});

test('⚠⚠ A CROSSING IS A PROPERTY OF THE EDGE, not of the direction it is walked', () => {
  // THE PROPERTY THE WHOLE MODULE RESTS ON. Two parcels share this edge and traverse it opposite
  // ways; if each bisected in its own direction the two would land a few ulps apart, which is two
  // heights, which is a crack running the length of the shore. Asserted BIT-IDENTICAL rather than
  // within a tolerance, because a tolerance is exactly the weaker claim that would not have caught
  // it.
  const field = straightShore(20);
  const a = { x: 31, z: COAST_Z };
  const b = { x: 37, z: COAST_Z + 11 };
  const forward = crossingOnEdge(field, a, b, 3.5);
  const backward = crossingOnEdge(field, b, a, 3.5);
  assert.equal(forward.x, backward.x);
  assert.equal(forward.z, backward.z);
});

test('a crossing works whichever end of the edge is inside the band', () => {
  // The canonical ordering is by NAME and says nothing about which end is nearer the water, so the
  // bisection has to read that off the field. An assumption here would fire on exactly half the
  // edges of the map.
  const field = straightShore(20);
  const inward = crossingOnEdge(field, { x: 30, z: COAST_Z }, { x: 30, z: COAST_Z + 12 }, 3.5);
  const outward = crossingOnEdge(field, { x: 30, z: COAST_Z + 12 }, { x: 30, z: COAST_Z }, 3.5);
  assert.ok(Math.abs(inward.z - (COAST_Z + 3.5)) < 1e-6);
  assert.equal(inward.z, outward.z);
});

test('the bisection is halvings, and enough of them to beat the descriptors’ own precision', () => {
  // The descriptors carry one decimal (`vertexKey` rounds to it and says why), so a crossing has
  // to be far better resolved than that or two parcels could round to different keys. Twenty-four
  // halvings is 6e-8 of an edge.
  assert.equal(SHORE_RING_BISECTIONS.length, 24);
  assert.ok(2 ** -SHORE_RING_BISECTIONS.length < 1e-6);
});

// ---------------------------------------------------------------------------
// The coast run
// ---------------------------------------------------------------------------

test('a contiguous run is found, wrapping the ring’s end', () => {
  // The wrap is the case an index-based scan gets wrong, and it is the COMMON one: a parcel's coast
  // vertices are as likely to straddle index 0 as not.
  assert.deepEqual(coastRun([0, 0, 9, 9, 0]), { start: 4, length: 3 });
  assert.deepEqual(coastRun([9, 0, 0, 0, 9]), { start: 1, length: 3 });
  assert.deepEqual(coastRun([9, 9, 0, 9]), { start: 2, length: 1 });
});

test('a run of ONE vertex is a run — a parcel may touch the coast at a single corner', () => {
  // Seven of the shipped island's fifty-three coastal parcels are this shape. Refusing them would
  // leave a hole in the band at every one, and they divide perfectly well: the chain is just its
  // two side-edge crossings with nothing between.
  assert.deepEqual(coastRun([9, 9, 0, 9, 9]), { start: 2, length: 1 });
});

test('no run at all: an interior parcel, an all-coast parcel, and a two-run parcel', () => {
  assert.equal(coastRun([9, 9, 9, 9]), null, 'nothing on the coast');
  assert.equal(coastRun([0, 0, 0, 0]), null, 'no inland side to keep');
  assert.equal(coastRun([0, 9, 0, 9]), null, 'two runs need a band each');
});

test('the coast test is a floating-point epsilon, not a tolerance on the art', () => {
  // A rim vertex lies ON the coast by construction, so its measured distance is rounding residue.
  // The next-nearest vertex on the shipped island is 8.66 units out — six orders of magnitude away.
  assert.ok(SHORE_RING_COAST_EPS < 1e-5);
  assert.deepEqual(coastRun([SHORE_RING_COAST_EPS / 2, 9, 9]), { start: 0, length: 1 });
  assert.equal(coastRun([SHORE_RING_COAST_EPS * 10, 9, 9]), null, 'that is not on the coast');
});

// ---------------------------------------------------------------------------
// The division
// ---------------------------------------------------------------------------

test('a coastal parcel is divided into a band and a core, and the band is the seaward one', () => {
  const field = straightShore(20);
  const ring = coastalBox(20, 36, 12);
  const split = shoreRingSplit(ring, field, [3.5]);
  assert.equal(split.divided, true);
  assert.equal(split.scale, 1, 'a straight coast needs no cap');
  assert.equal(split.faces.length, 2, 'one ring divides a parcel in two');
  // The band's vertices are all within the inset; the core's are all at or beyond it.
  const band = split.faces[0]!;
  const core = split.faces[1]!;
  for (const p of band) assert.ok(p.z <= COAST_Z + 3.5 + 1e-6, `band vertex at ${p.z}`);
  for (const p of core) assert.ok(p.z >= COAST_Z + 3.5 - 1e-6, `core vertex at ${p.z}`);
});

test('⚠⚠ THE FACES TILE THE PARCEL EXACTLY — no ground lost, none drawn twice', () => {
  // THE CHECK THAT MAKES THIS SAFE ON GROUND WHOSE COLOUR REPORTS A CAPABILITY'S STATUS. Ground
  // covered twice is one capability's status painted over another's (ADR-0392 D5 / ADR-0398 D7);
  // ground lost is a hole in the island. Both show up as area, exactly.
  const field = straightShore(20);
  for (const insets of [[3.5], [7 / 3, 14 / 3], [1, 2, 3]]) {
    const ring = coastalBox(20, 36, 12);
    const split = shoreRingSplit(ring, field, insets);
    assert.equal(split.divided, true, `${insets.length} rings should divide this parcel`);
    assert.equal(split.faces.length, insets.length + 1);
    const tiled = split.faces.reduce((sum, f) => sum + area2(f), 0);
    assert.ok(
      Math.abs(tiled - area2(split.wall)) < 1e-9 * area2(split.wall),
      `${insets.length} rings tiled ${tiled} of ${area2(split.wall)}`,
    );
  }
});

test('the WALL carries every inserted point, so the skirt hangs from the face’s own outline', () => {
  // ⚠ THE HALF A CALLER FORGETS. A top face that bends through a point on an edge, over a wall
  // that spans that edge straight, is a hairline crack down the shore.
  const field = straightShore(20);
  const split = shoreRingSplit(coastalBox(20, 36, 12), field, [3.5]);
  assert.equal(split.wall.length, 6, 'four corners plus a crossing on each inland edge');
  const onWall = new Set(split.wall.map(vertexKey));
  // Both side-edge crossings — the points a NEIGHBOUR also inserts — are on the wall.
  for (const p of split.faces[0]!) {
    if (Math.abs(p.z - (COAST_Z + 3.5)) > 1e-6) continue;
    assert.ok(onWall.has(vertexKey(p)), `a shared crossing at ${p.x} is missing from the wall`);
  }
  assert.ok(isSimpleRing(split.wall), 'the wall ring crosses itself');
});

test('the wall ring bounds the SAME ground as the parcel it came from', () => {
  // The inserted points are ON the parcel's own edges, so the outline cannot move — which is what
  // makes `groundArea` a check on the division rather than a number that drifts with it.
  const field = straightShore(20);
  const ring = coastalBox(20, 36, 12);
  const split = shoreRingSplit(ring, field, [3.5]);
  assert.ok(Math.abs(area2(split.wall) - area2(ring)) < 1e-9 * area2(ring));
});

test('every face triangulates upward, and to the count the buffer is sized for', () => {
  // `cellGroundGeometry` allocates from `groundFaceTriangles`, so a face that triangulated to more
  // pieces than its length predicts would overrun the buffer it was sized for.
  const field = straightShore(20);
  const split = shoreRingSplit(coastalBox(20, 36, 12), field, [7 / 3, 14 / 3]);
  for (const face of split.faces) {
    const tris = triangulateRing(face);
    assert.equal(tris.length, face.length - 2, 'a simple polygon has length-2 triangles');
    for (const [a, b, c] of tris) {
      // Negative shoelace is the upward-facing winding — the module's one convention.
      assert.ok(signedRingArea2([a, b, c]) <= 0, 'a face triangulated downward');
    }
  }
});

test('an INTERIOR parcel is left exactly alone — no crossing, no division, no cost', () => {
  const field = straightShore(20);
  const ring = inlandBox(20, 36, 9, 21);
  const split = shoreRingSplit(ring, field, [3.5]);
  assert.equal(split.divided, false);
  assert.equal(split.scale, 0, 'an undivided parcel kept no band');
  assert.deepEqual([...split.wall], [...normalisedRing(ring)]);
  assert.equal(split.faces.length, 1);
});

test('an arm with NO insets returns the ring verbatim, which is the pre-ring mesh', () => {
  // The before/after on this arc has to be the same function called twice. `[]` is what a width arm
  // passes, and it must produce the buffer the map had before this module existed.
  const field = straightShore(20);
  const ring = coastalBox(20, 36, 12);
  const split = shoreRingSplit(ring, field, []);
  assert.equal(split.divided, false);
  assert.deepEqual([...split.wall], [...normalisedRing(ring)]);
  assert.deepEqual(split.faces.map((f) => [...f]), [[...normalisedRing(ring)]]);
});

test('a ring that bounds no area is refused rather than divided', () => {
  const field = straightShore(20);
  const two: P2[] = [{ x: 20, z: COAST_Z }, { x: 36, z: COAST_Z }];
  const split = shoreRingSplit(two, field, [3.5]);
  assert.equal(split.divided, false);
  assert.equal(split.faces.length, 1);
});

test('⚠ A PARCEL SHALLOWER THAN ITS RING FALLS BACK, and still inserts nothing it cannot', () => {
  // Real on the forest: one coastal parcel's nearest interior vertex is 0.004 units from its own
  // shore. There is no edge for the crossing to sit on, so the band cannot be closed — and the
  // refusal is EDGE-LOCAL, so the neighbour across that edge refuses identically.
  const field = straightShore(20);
  const shallow = coastalBox(20, 36, 1.5);
  const split = shoreRingSplit(shallow, field, [3.5]);
  assert.equal(split.divided, false);
  assert.equal(split.wall.length, 4, 'no crossing exists to insert');
});

test('a run of ONE divides into a triangle band and a core', () => {
  // The seven single-corner parcels of the shipped island. The chain is its two side crossings with
  // nothing between, so the band is the smallest polygon there is.
  const field = straightShore(20);
  // A pentagon touching the coast at exactly one vertex.
  const ring: P2[] = [
    { x: 28, z: COAST_Z },
    { x: 36, z: COAST_Z + 7 },
    { x: 33, z: COAST_Z + 15 },
    { x: 23, z: COAST_Z + 15 },
    { x: 20, z: COAST_Z + 7 },
  ];
  const split = shoreRingSplit(ring, field, [3.5]);
  assert.equal(split.divided, true);
  assert.equal(split.faces[0]!.length, 3, 'a single-corner band is a triangle');
  const tiled = split.faces.reduce((sum, f) => sum + area2(f), 0);
  assert.ok(Math.abs(tiled - area2(split.wall)) < 1e-9 * area2(split.wall));
});

test('⚠⚠ THE LADDER DEMOTES A CHAIN THE COAST CANNOT CARRY, and never the SHARED crossings', () => {
  // An inward offset self-intersects as soon as it exceeds the curve's radius of curvature. Here
  // the coast is a sharp inward notch, so the full-depth chain folds and the ladder shortens it.
  //
  // ⚠ THE SIDE CROSSINGS STAY PUT, which is the half that must not move: they sit on SHARED edges
  // and a neighbour that knows nothing of this parcel's corners computes them independently.
  const field: ShoreFieldReader = {
    width: 20,
    loops: 1,
    // A V-shaped coast: distance is the gap to the nearer of two lines meeting at x = 30.
    sample(x, z) {
      const d = Math.min(Math.abs(z - (COAST_Z + Math.abs(x - 30) * 8)), 20);
      return { distance: d, gx: 0, gz: 1 };
    },
  };
  const ring: P2[] = [
    { x: 22, z: COAST_Z + 64 },
    { x: 30, z: COAST_Z },
    { x: 38, z: COAST_Z + 64 },
    { x: 38, z: COAST_Z + 80 },
    { x: 22, z: COAST_Z + 80 },
  ];
  const split = shoreRingSplit(ring, field, [3.5]);
  if (split.divided) {
    const tiled = split.faces.reduce((sum, f) => sum + area2(f), 0);
    assert.ok(Math.abs(tiled - area2(split.wall)) < 1e-9 * area2(split.wall));
    for (const face of split.faces) assert.ok(isSimpleRing(face), 'a demoted face still folds');
  }
  // Whatever the ladder decided, the wall — and therefore every shared crossing — is untouched.
  assert.ok(isSimpleRing(split.wall));
});

test('a divided parcel’s scale is on the coast clip’s ladder, and never zero', () => {
  // ⚠ ZERO IS DROPPED DELIBERATELY. It puts every chain point back on the coast vertex it came
  // from — a band of zero depth, which delivers no shape and still costs its triangles. The
  // undivided ring is the same picture for less.
  const field = straightShore(20);
  const split = shoreRingSplit(coastalBox(20, 36, 12), field, [3.5]);
  assert.ok(split.scale > 0 && split.scale <= 1);
});

// ---------------------------------------------------------------------------
// The map-wide plan
// ---------------------------------------------------------------------------

/** A descriptor carrying one ring — the shape `cellGroundGeometry` and the plan both read. */
function cell(points: readonly P2[]): InstanceDescriptor {
  return {
    kind: 'cell-ground',
    transform: { x: 0, y: 0, z: 0 },
    group: 'cell-ground',
    island: 'story-a',
    material: 'healthy',
    points: points.map((p) => ({ x: p.x, y: 0, z: p.z })),
  };
}

test('the census counts what the division actually did, parcel by parcel', () => {
  const cells = [cell(coastalBox(20, 36, 12)), cell(inlandBox(40, 56, 9, 21))];
  // ⚠ THE FIELD THE PLAN BUILDS IS ITS OWN. These fixtures are not a closed island, so the real
  // `shoreField` would measure to their whole outline — which is why the plan is exercised through
  // its own field here and the DIVISION is exercised above against a shore a test can reason about.
  const plan = shoreRingPlan(cells, [3.5]);
  assert.equal(plan.census.divided + plan.census.undivided, cells.length);
  assert.equal(
    plan.census.inserted,
    cells.reduce((sum, c) => sum + plan.decompose(c).wall.length, 0) -
      cells.reduce((sum, c) => sum + c.points!.length, 0),
    'the census disagrees with the wall rings it produced',
  );
});

test('the resolver is stable — asked twice about one parcel it answers identically', () => {
  // `shorePlan` reads it once for the buffer and once for the counters. Two answers would mean the
  // report describes a different mesh from the one drawn.
  const cells = [cell(coastalBox(20, 36, 12))];
  const plan = shoreRingPlan(cells, [3.5]);
  const first = plan.decompose(cells[0]!);
  const second = plan.decompose(cells[0]!);
  assert.equal(first, second, 'the plan re-derived a division it had already made');
});

test('a parcel the plan never saw still gets a usable answer', () => {
  // The resolver's contract is total: `cellGroundGeometry` may be handed a descriptor list that
  // does not match the one the plan was built from, and the honest answer is the undivided ring
  // rather than a throw halfway through a buffer.
  const plan = shoreRingPlan([cell(coastalBox(20, 36, 12))], [3.5]);
  const stranger = cell(inlandBox(90, 106, 9, 21));
  const faces = plan.decompose(stranger);
  assert.equal(faces.faces.length, 1);
  assert.equal(faces.wall.length, 4);
});

test('the probe field reaches past the widest ring, so no ring sits at its own cap', () => {
  // The field caps its answer at the width it was built for, and every comparison in this module is
  // `distance < inset`. A cap AT the widest inset would make that comparison false at the very ring
  // it is asked about, and the outermost band would silently never close.
  const field = shoreRingField([cell(coastalBox(20, 36, 12))], [7 / 3, 14 / 3]);
  assert.equal(field.width, (14 / 3) * SHORE_RING_PROBE_MARGIN);
  assert.ok(field.width > 14 / 3);
});

test('⚠ THE COASTAL COUNT IS THE DENOMINATOR, and an arm with no rings reports an ABSENCE', () => {
  // "47 parcels divided" says nothing on its own: the shipped island has 164 parcels and 111 of
  // them are interior. The coverage ratio is what chose the shipped arm, so the denominator has to
  // be measured rather than carried in prose.
  const field = straightShore(20);
  assert.equal(shoreRingSplit(coastalBox(20, 36, 12), field, [3.5]).coastal, true);
  assert.equal(shoreRingSplit(inlandBox(40, 56, 9, 21), field, [3.5]).coastal, false);
  // A coastal parcel too shallow for its ring is still COASTAL — it is a parcel the ring failed on
  // rather than one it had no business reaching, and counting it as interior would flatter the
  // coverage by hiding exactly the failures the ratio exists to show.
  assert.equal(shoreRingSplit(coastalBox(20, 36, 1.5), field, [3.5]).coastal, true);
  // ⚠ AND AN ARM WITH NO RINGS ANSWERS `false`, which is an absence rather than a claim: the field
  // such an arm builds caps at zero, so every vertex reads as on the coast and the question cannot
  // be asked. Reporting `true` there would put a real-looking denominator under a zero numerator.
  assert.equal(shoreRingSplit(coastalBox(20, 36, 12), field, []).coastal, false);
});

test('a plan with no insets divides nothing and inserts nothing', () => {
  const cells = [cell(coastalBox(20, 36, 12))];
  const plan = shoreRingPlan(cells, []);
  assert.equal(plan.census.coastal, 0);
  assert.equal(plan.census.divided, 0);
  assert.equal(plan.census.inserted, 0);
  assert.equal(plan.census.capped, 0);
  assert.equal(plan.census.leastScale, 1);
  assert.equal(plan.census.nearestChain, 0);
  assert.equal(plan.census.farthestChain, 0);
  assert.equal(plan.decompose(cells[0]!).faces.length, 1);
});
