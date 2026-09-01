// stepped-skirt.test.ts — the claims the shipped island's CLIFF rests on.
//
// ⚠⚠ THE TEST THIS FILE EXISTS FOR IS {@link the transcription one}. Every constant in
// `stepped-skirt.ts` is read off the approved render's own build script, and the whole value of the
// component is that the cliff is THAT cliff rather than a plausible re-authoring of it. A profile
// that drifted would still produce a stepped edge, still render, still pass a shape test, and be a
// different cliff wearing the approved one's name — which is exactly the failure this arc has
// already paid for once (`START ORDER` on the arc: a note priced against a repository that had
// moved under it). So the insets are asserted against a SECOND, independent arithmetic rather than
// against a copy of the first.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_GROUND_DEPTH,
  cellGroundGeometry,
  cellGroundTriangles,
  normalisedRing,
  signedRingArea2,
  type CellGroundGeometryInput,
  type LinearRgb,
  type P2,
} from './cell-ground-geometry.js';
import {
  SKIRT_INSET_IN,
  SKIRT_INSET_OUT,
  SKIRT_INSET_PERIOD,
  SKIRT_INSET_SEED,
  SKIRT_JITTER_BASE,
  SKIRT_JITTER_SPAN,
  SKIRT_ROCK,
  SKIRT_ROWS,
  flatSkirt,
  insetPoint,
  isRimEdge,
  outwardNormal,
  rimEdgeKeys,
  skirtExtraTriangles,
  skirtInset,
  skirtLedges,
} from './stepped-skirt.js';
import type { InstanceDescriptor } from './world-to-3d.js';

const square = (x0: number, z0: number): P2[] => [
  { x: x0, z: z0 },
  { x: x0 + 1, z: z0 },
  { x: x0 + 1, z: z0 + 1 },
  { x: x0, z: z0 + 1 },
];

const cell = (points: readonly P2[]): InstanceDescriptor => ({
  kind: 'cell-ground',
  group: 'cell-ground',
  material: 'healthy',
  transform: { x: 0, y: 0, z: 0 },
  points: points.map((p) => ({ x: p.x, y: 0, z: p.z })),
});

/** A parcel whose ring bounds no area — the shape the census must ignore rather than count. */
const ringless = (points: readonly P2[]): InstanceDescriptor => {
  const d = cell(points);
  return { ...d, points: points.map((p) => ({ x: p.x, y: 0, z: p.z })) };
};

test('the approved treatment cuts the edge into SIX ledges', () => {
  assert.equal(SKIRT_ROWS, 6);
  assert.equal(skirtLedges().length, 6);
});

test('THE TRANSCRIPTION: every inset matches `build_land.py`, computed a second way', () => {
  // ⚠ THE SECOND ROUTE IS THE POINT. `7919 % 13 === 2`, so for any row the source's
  // `(row * 7919) % 13` is `(row * 2) % 13` — a different expression of the same number, written
  // out here rather than importing the one under test. A test that re-spelled the implementation
  // would pass for a profile that had drifted, which is the whole failure being guarded.
  assert.equal(SKIRT_INSET_SEED % SKIRT_INSET_PERIOD, 2);
  for (let row = 1; row <= SKIRT_ROWS; row += 1) {
    const side = row % 2 === 1 ? SKIRT_INSET_IN : SKIRT_INSET_OUT;
    const expected =
      side * (SKIRT_JITTER_BASE + (SKIRT_JITTER_SPAN * ((row * 2) % SKIRT_INSET_PERIOD)) / SKIRT_INSET_PERIOD);
    assert.equal(skirtInset(row), expected, `row ${row}`);
  }
});

test('the ledges ALTERNATE: odd rows cut in, even rows stand proud', () => {
  for (let row = 1; row <= SKIRT_ROWS; row += 1) {
    const inset = skirtInset(row);
    if (row % 2 === 1) assert.ok(inset > 0, `row ${row} should cut inward, got ${inset}`);
    else assert.ok(inset < 0, `row ${row} should stand proud, got ${inset}`);
  }
});

test('the BASE COURSE stands proud of the parcel outline — a plinth, not a taper', () => {
  const ledges = skirtLedges();
  const base = ledges[ledges.length - 1]!;
  assert.ok(base.inset < 0, `the last ledge insets ${base.inset}, so the island tapers`);
  // and the deepest undercut is above it, which is what reads as a bedding plane
  const deepest = Math.max(...ledges.map((l) => l.inset));
  assert.ok(deepest > Math.abs(base.inset), 'no ledge cuts back further than the base stands out');
});

test('row 0 is the parcel ring itself, not a ledge, so it takes no inset', () => {
  assert.equal(skirtInset(0), 0);
  assert.equal(skirtInset(-1), 0);
});

test('ONE ledge is the shipped wall EXACTLY — same code path, no inset, full drop', () => {
  assert.deepEqual(skirtLedges(1), [{ row: 1, inset: 0, drop: 1 }]);
  assert.deepEqual(skirtLedges(0), []);
});

test('the ledges descend to exactly the prism depth and never past it', () => {
  const ledges = skirtLedges();
  assert.equal(ledges[ledges.length - 1]!.drop, 1);
  for (let i = 1; i < ledges.length; i += 1) {
    assert.ok(ledges[i]!.drop > ledges[i - 1]!.drop, `drop is not monotone at ledge ${i}`);
  }
  for (const l of ledges) assert.ok(l.drop > 0 && l.drop <= 1, `drop ${l.drop} leaves the prism`);
});

test('the outward normal is UNIT, PERPENDICULAR, and points away from a normalised ring', () => {
  const ring = normalisedRing(square(0, 0));
  assert.ok(signedRingArea2(ring) < 0, 'the fixture is not in the module orientation');
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = outwardNormal(a, b);
    assert.ok(Math.abs(Math.hypot(n.x, n.z) - 1) < 1e-12, 'not a unit vector');
    assert.ok(Math.abs(n.x * (b.x - a.x) + n.z * (b.z - a.z)) < 1e-12, 'not perpendicular');
    // OUTWARD: stepping off the edge midpoint along the normal must leave the unit square.
    const mx = (a.x + b.x) / 2 + n.x * 0.25;
    const mz = (a.z + b.z) / 2 + n.z * 0.25;
    assert.ok(mx < 0 || mx > 1 || mz < 0 || mz > 1, `normal at edge ${i} points inward`);
  }
});

test('a degenerate edge has no direction, and the zero vector is the honest answer', () => {
  assert.deepEqual(outwardNormal({ x: 3, z: 4 }, { x: 3, z: 4 }), { x: 0, z: 0 });
});

test('a POSITIVE inset cuts INWARD — the sign `build_land.py` subtracts with', () => {
  const ring = normalisedRing(square(0, 0));
  const a = ring[0]!;
  const b = ring[1]!;
  const n = outwardNormal(a, b);
  const cut = insetPoint(a, n, 0.25);
  // the cut point is a quarter unit back along the normal, i.e. toward the square's inside
  assert.ok(Math.abs(cut.x - (a.x - 0.25 * n.x)) < 1e-12);
  assert.ok(Math.abs(cut.z - (a.z - 0.25 * n.z)) < 1e-12);
  const inside = (p: P2) => p.x >= 0 && p.x <= 1 && p.z >= 0 && p.z <= 1;
  assert.ok(inside(cut), 'a positive inset left the parcel');
  assert.ok(!inside(insetPoint(a, n, -0.25)), 'a negative inset did not stand proud');
});

test('THE RIM CENSUS: a shared seam is not rim, and every outer edge is', () => {
  const cells = [cell(square(0, 0)), cell(square(1, 0))];
  const rim = rimEdgeKeys(cells);
  // two unit squares side by side: 7 distinct edges, 1 shared, 6 on the rim
  assert.equal(rim.size, 6);
  assert.equal(isRimEdge(rim, { x: 1, z: 0 }, { x: 1, z: 1 }), false, 'the shared seam is not rim');
  assert.equal(isRimEdge(rim, { x: 1, z: 1 }, { x: 1, z: 0 }), false, 'nor is it, reversed');
  assert.equal(isRimEdge(rim, { x: 0, z: 0 }, { x: 1, z: 0 }), true);
  assert.equal(isRimEdge(rim, { x: 2, z: 0 }, { x: 2, z: 1 }), true);
});

test('the rim census ignores rings that bound no area', () => {
  const degenerate = ringless([{ x: 0, z: 0 }]);
  const none: InstanceDescriptor = {
    kind: 'cell-ground',
    group: 'cell-ground',
    material: 'healthy',
    transform: { x: 0, y: 0, z: 0 },
  };
  assert.equal(rimEdgeKeys([degenerate, none]).size, 0);
  assert.equal(rimEdgeKeys([cell(square(0, 0)), degenerate, none]).size, 4);
});

test('a lone parcel is ALL rim — nothing is buried when there is no neighbour', () => {
  assert.equal(rimEdgeKeys([cell(square(0, 0))]).size, 4);
});

test('the skirt costs the RIM only, as a delta over the wall already drawn', () => {
  // 52 rim edges at six rows: the arc's own ~624-triangle sizing for this component.
  assert.equal(skirtExtraTriangles(52, SKIRT_ROWS), 520);
  assert.equal(52 * SKIRT_ROWS * 2, 624, 'the rim skirt itself is 624 triangles');
  assert.equal(skirtExtraTriangles(52, 1), 0, 'one row is the wall, so it adds nothing');
  assert.equal(skirtExtraTriangles(0, SKIRT_ROWS), 0);
  assert.equal(skirtExtraTriangles(-1, SKIRT_ROWS), 0);
});

test('the ROCK is the approved render`s own median skirt colour, and it is off the status axis', () => {
  assert.equal(SKIRT_ROCK, '#4d4d4f');
  const r = Number.parseInt(SKIRT_ROCK.slice(1, 3), 16);
  const g = Number.parseInt(SKIRT_ROCK.slice(3, 5), 16);
  const b = Number.parseInt(SKIRT_ROCK.slice(5, 7), 16);
  assert.deepEqual([r, g, b], [77, 77, 79], 'the measured median is rgb(77, 77, 79)');
  // NEUTRAL: the status families all sit on the green/ochre/brown axis, so the rock's defence
  // against being read as one of them is that it has almost no hue at all.
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 4, 'the rock has acquired a hue');
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// THE BUILDER'S HALF: what the ledges do once `cellGroundGeometry` writes them.

const ROCK: LinearRgb = { r: 0.25, g: 0.25, b: 0.26 };
const SOIL: LinearRgb = { r: 0.5, g: 0.7, b: 0.3 };
const ROCK_ROW = 9;
const SOIL_ROW = 0;

/** Two parcels side by side, with the relief field left flat so the only thing moving is the
 *  skirt. `index` is supplied so the status buffer is written and the rock's ROW is checkable. */
function build(skirt?: CellGroundGeometryInput['skirt']) {
  const cells = [cell(square(0, 0)), cell(square(1, 0))];
  const input: CellGroundGeometryInput = {
    cells,
    resolve: () => SOIL,
    index: () => SOIL_ROW,
  };
  if (skirt !== undefined) input.skirt = skirt;
  return cellGroundGeometry(input);
}

const rimOf = (): ((a: P2, b: P2) => boolean) => {
  const rim = rimEdgeKeys([cell(square(0, 0)), cell(square(1, 0))]);
  return (a, b) => isRimEdge(rim, a, b);
};

test('⚠ A ONE-LEDGE SKIRT AND NO SKIRT AT ALL EMIT THE SAME BYTES', () => {
  // The control arm on the comparison page is the shipped map itself, not a reconstruction of it,
  // and this is what makes that true. `flatSkirt` runs the LEDGE loop; `undefined` runs it with the
  // module's own `FLAT_WALL`. Both must land on the very floats every pre-skirt figure was taken on.
  const none = build();
  const flat = build(flatSkirt({ row: ROCK_ROW, colour: ROCK, isRim: rimOf() }));
  assert.equal(flat.triangles, none.triangles);
  assert.deepEqual([...flat.positions], [...none.positions], 'a flat skirt moved a vertex');
  assert.deepEqual([...flat.normals], [...none.normals], 'a flat skirt turned a face');
  assert.deepEqual([...flat.colors], [...none.colors], 'a flat skirt delivered a rock pixel');
  assert.deepEqual([...flat.statuses], [...none.statuses], 'a flat skirt moved a ramp row');
});

test('the buffer is SIZED for exactly what is written — no overrun, no zeroed tail', () => {
  const stepped = build({
    rows: SKIRT_ROWS,
    row: ROCK_ROW,
    colour: ROCK,
    soilLedges: 0,
    isRim: rimOf(),
  });
  // ⚠ `cellGroundTriangles` IS THE WHOLE UNDIVIDED PRISM — top face AND its four wall quads —
  // which is why the skirt's cost is stated as a DELTA. Adding the walls again here is exactly the
  // double-count `skirtExtraTriangles` exists to make impossible in the builder.
  const prisms = 2 * cellGroundTriangles(4);
  assert.equal(prisms, 20);
  assert.equal(stepped.triangles, prisms + skirtExtraTriangles(6, SKIRT_ROWS));
  assert.equal(stepped.positions.length, stepped.triangles * 9);
  // ⚠ THE TAIL IS THE POINT. A buffer sized for more than was written ends in zeroed vertices,
  // which draw as a triangle collapsed at the origin — invisible in a screenshot of an island that
  // does not contain the origin, and exactly the kind of defect a shape assertion sails past.
  const last = stepped.positions.slice(-9);
  assert.ok([...last].some((v) => v !== 0), 'the buffer ends in a zeroed vertex');
});

test('the ledges are CONTINUOUS — each hangs from the one above, so the cliff has no crack', () => {
  const ledges = skirtLedges();
  const outward = { x: 1, z: 0 };
  const a: P2 = { x: 0, z: 0 };
  let prev = a;
  for (const ledge of ledges) {
    const here = insetPoint(a, outward, ledge.inset);
    // every ledge is measured from the RING, never from its predecessor: an accumulating inset
    // would walk the base ~1.2 units inboard instead of leaving it 0.16 proud.
    assert.ok(Math.abs(here.x - (a.x - ledge.inset)) < 1e-12);
    prev = here;
  }
  assert.ok(Math.abs(prev.x) > 0.15, 'the base course did not end up proud of the ring');
});

test('the ROCK reaches the RIM and nothing else — a buried seam keeps its status colour', () => {
  const stepped = build({
    rows: SKIRT_ROWS,
    row: ROCK_ROW,
    colour: ROCK,
    soilLedges: 0,
    isRim: rimOf(),
  });
  const rows = [...stepped.statuses];
  const rockVerts = rows.filter((r) => r === ROCK_ROW).length;
  // 6 rim edges x 6 ledges x 2 triangles x 3 vertices
  assert.equal(rockVerts, 6 * SKIRT_ROWS * 2 * 3);
  // and the shared seam kept its own row: the two buried walls are 2 quads = 4 triangles.
  const soilVerts = rows.filter((r) => r === SOIL_ROW).length;
  assert.equal(soilVerts + rockVerts, rows.length, 'a vertex wears neither row');
});

test('`soilLedges` is the owner`s option B: the top ledge keeps the health tint', () => {
  const b = build({ rows: SKIRT_ROWS, row: ROCK_ROW, colour: ROCK, soilLedges: 1, isRim: rimOf() });
  const rockVerts = [...b.statuses].filter((r) => r === ROCK_ROW).length;
  assert.equal(rockVerts, 6 * (SKIRT_ROWS - 1) * 2 * 3, 'the top ledge is not soil');
  const a = build({ rows: SKIRT_ROWS, row: ROCK_ROW, colour: ROCK, soilLedges: 0, isRim: rimOf() });
  assert.ok(
    [...a.statuses].filter((r) => r === ROCK_ROW).length > rockVerts,
    'option A delivers no more rock than option B',
  );
});

test('the cliff ends exactly at the prism depth — the two substrates stay the same thickness', () => {
  const stepped = build({
    rows: SKIRT_ROWS,
    row: ROCK_ROW,
    colour: ROCK,
    soilLedges: 0,
    isRim: rimOf(),
  });
  let lowest = 0;
  for (let i = 1; i < stepped.positions.length; i += 3) lowest = Math.min(lowest, stepped.positions[i]!);
  assert.equal(lowest, -CELL_GROUND_DEPTH, `the cliff bottoms out at ${lowest}`);
});

test('the FLAT skirt changes nothing — one ledge, no rock, no inset', () => {
  const flat = flatSkirt({
    row: 3,
    colour: { r: 0, g: 0, b: 0 },
    isRim: () => true,
  });
  assert.equal(flat.rows, 1);
  assert.equal(flat.soilLedges, 1, 'the one ledge keeps the parcel tint, so no rock is delivered');
  assert.deepEqual(skirtLedges(flat.rows), [{ row: 1, inset: 0, drop: 1 }]);
});
