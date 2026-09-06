// land-per-capability.test.ts — the island's size from a declared ratio, held without a GPU.
//
// What has to hold: the constant carries its provenance in arithmetic (the recipe's own density
// agrees with the rung the owner's nicer picture gave, in the true basis); every island's scaled
// area is EXACTLY its capability count times the ratio; the scale is isotropic and about the
// island's own centre, so the layout holds still; an island with nothing to derive a size from is
// left as drawn; the mapper applies the shipped ratio by default and a `null` leaves the drawing's
// size; and the tuned reference is the fixture island the constants were judged on.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HEX_R, LAND_AREA_PER_CAPABILITY as ENGINE_RATIO, PRE_ADR0528_TILE } from '@storytree/forest-world';

import { RECIPE_ISLAND_AREA } from './dressing-ground.js';
import {
  HEX_TILE_AREA,
  LAND_AREA_PER_CAPABILITY,
  LAND_AREA_PER_CAPABILITY_RUNGS,
  LAND_SCALE,
  MAX_LAND_FACTOR,
  TUNED_FIXTURE,
  TUNED_LAND_AREA_PER_CAPABILITY,
  islandLand,
  landRatioFactor,
  ringArea,
  sizeIslandsByCapability,
} from './land-per-capability.js';
import { islandCentres } from './true-footprint.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

/** A square cell of side `side` centred at (cx, cz) on island `island`, in parcel `parcel`. */
function cell(island: string, parcel: string | undefined, cx: number, cz: number, side = 20): InstanceDescriptor {
  const h = side / 2;
  const d: InstanceDescriptor = {
    kind: 'cell-ground',
    transform: { x: cx, y: 0, z: cz },
    group: 'cell-ground',
    material: 'healthy',
    island,
    points: [
      { x: cx - h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz - h },
      { x: cx + h, y: 0, z: cz + h },
      { x: cx - h, y: 0, z: cz + h },
    ],
  };
  if (parcel !== undefined) d.parcel = parcel;
  return d;
}

const asInstance = (d: Descriptor3D): d is InstanceDescriptor => d.kind !== 'skipped';

/** The x/z extent of a set of descriptors' rings. */
function extent(ds: readonly InstanceDescriptor[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of ds) {
    for (const p of c.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { w: maxX - minX, d: maxZ - minZ };
}

test('⚠⚠ the constant carries its provenance: the approved render’s own density, in the TRUE basis, is the 318 rung — and the shipped pick is a rung of the declared ladder', () => {
  // Thirteen stands of 4–8 pines, mean six, on the recipe island as this map places it (true basis).
  const recipePines = 13 * 6;
  // `RECIPE_ISLAND_AREA` is the recipe island THROUGH the shipped mapper (× LAND_SCALE²); its
  // density is read on the island AS DRAWN, which is where the recipe's own 78 pines stood.
  assert.equal(RECIPE_ISLAND_AREA, TUNED_FIXTURE.capabilities * LAND_AREA_PER_CAPABILITY, 'the recipe island through the shipped mapper, exactly');
  const recipeDrawnArea = RECIPE_ISLAND_AREA / (LAND_SCALE * LAND_SCALE);
  assert.ok(Math.abs(recipeDrawnArea - 24631.8) / 24631.8 < 0.001, `${recipeDrawnArea} — the drawn island, to the coast's 0.04%`);
  const recipeDensity = recipeDrawnArea / recipePines;
  assert.ok(Math.abs(recipeDensity - 318) / 318 < 0.02, `the recipe stands a pine on ${recipeDensity.toFixed(1)} units²; the rung is 318`);
  // The increment's 108 is the same recipe read through the drawing's foreshortening (the squashed
  // basis, 8,424.6): stated so nobody promotes it to a second approved density.
  const squashedDensity = 8424.6 / recipePines;
  assert.ok(Math.abs(squashedDensity - 108) < 1, `${squashedDensity.toFixed(1)}`);
  assert.deepEqual([...LAND_AREA_PER_CAPABILITY_RUNGS], [318, 200, 108]);
  assert.ok((LAND_AREA_PER_CAPABILITY_RUNGS as readonly number[]).includes(LAND_AREA_PER_CAPABILITY), 'the shipped pick is a rendered rung');
  for (let i = 1; i < LAND_AREA_PER_CAPABILITY_RUNGS.length; i += 1) {
    assert.ok(LAND_AREA_PER_CAPABILITY_RUNGS[i]! < LAND_AREA_PER_CAPABILITY_RUNGS[i - 1]!, 'the ladder descends — each rung is less land per tree');
  }
});

test('the tuned reference is the fixture island: thirteen regular hexes of the PRE-ADR-0528 tile over eleven capabilities, ≈ 2,238.4 units² each — and LAND_SCALE is the edge-to-edge factor to the shipped rung', () => {
  // ⚠ The basis is FROZEN on the tile the constants were tuned on, not the engine's live tile: the
  // engine's HEX_R follows the ratio since ADR-0528 (≈ 11.06), and had this read it, LAND_SCALE
  // would have jumped to ~0.93 and every band on the shipped island with it.
  assert.equal(PRE_ADR0528_TILE.hexR, 27);
  assert.ok(HEX_R < PRE_ADR0528_TILE.hexR, `the engine's tile (${HEX_R}) is derived and smaller than the tuned one`);
  assert.equal(LAND_AREA_PER_CAPABILITY, ENGINE_RATIO, 'one ratio, declared in the engine and re-exported here');
  assert.ok(Math.abs(HEX_TILE_AREA - 1894.0) < 0.01, `${HEX_TILE_AREA}`);
  assert.deepEqual(TUNED_FIXTURE, { tiles: 13, capabilities: 11 });
  assert.ok(Math.abs(TUNED_LAND_AREA_PER_CAPABILITY - 2238.36) < 0.01, `${TUNED_LAND_AREA_PER_CAPABILITY}`);
  // Thirteen hexes IS the recipe island in this map's placement units (ADR-0517's consequences).
  assert.ok(Math.abs(HEX_TILE_AREA * 13 - 24631.8) / 24631.8 < 0.001, 'thirteen ideal hexes are the drawn recipe island to 0.04%');
  assert.ok(Math.abs(LAND_SCALE - Math.sqrt(LAND_AREA_PER_CAPABILITY / TUNED_LAND_AREA_PER_CAPABILITY)) < 1e-12);
  assert.ok(LAND_SCALE > 0 && LAND_SCALE < 1, `the shipped island is smaller than the tuned one, edge to edge: ${LAND_SCALE}`);
  assert.ok(Math.abs(LAND_SCALE - 0.3769) < 5e-4, `${LAND_SCALE}`);
});

test('ringArea is the shoelace, absolute, and zero under three points', () => {
  assert.equal(ringArea([]), 0);
  assert.equal(ringArea([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]), 0);
  const square = cell('i', 'p', 5, 5, 4).points!;
  assert.equal(ringArea(square), 16);
  assert.equal(ringArea([...square].reverse()), 16, 'winding does not sign it');
  const tri = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 3 }];
  assert.equal(ringArea(tri), 6);
});

test('islandLand counts DISTINCT parcels per island and sums the rings’ areas; a cell naming no parcel adds land and no capability', () => {
  const stream = [
    cell('a', 'a/p1', 0, 0),
    cell('a', 'a/p1', 20, 0),
    cell('a', 'a/p2', 40, 0),
    cell('a', undefined, 60, 0),
    cell('b', 'b/p1', 500, 0, 10),
    { kind: 'skipped', sceneKind: 'x' } as Descriptor3D,
    { kind: 'uat-bloom', transform: { x: 0, y: 0, z: 0 }, group: 'g', island: 'a' } as InstanceDescriptor,
  ];
  const land = islandLand(stream);
  assert.deepEqual([...land.keys()], ['a', 'b']);
  assert.deepEqual(land.get('a'), { island: 'a', capabilities: 2, area: 1600 });
  assert.deepEqual(land.get('b'), { island: 'b', capabilities: 1, area: 100 });
  const none = cell('c', undefined, 0, 0);
  assert.deepEqual(islandLand([none]).get('c'), { island: 'c', capabilities: 0, area: 400 });
  // ⚠ ONLY CELLS COUNT. A ribbon with a ring's worth of points and a stray `parcel` on island `a`
  // adds neither land nor a capability — the island's size is a reading of its ground alone.
  const ribbon: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 0, y: 0, z: 0 },
    group: 'g',
    island: 'a',
    parcel: 'a/not-a-parcel',
    points: cell('a', 'a/p9', 100, 100, 40).points!,
  };
  assert.deepEqual(islandLand([...stream, ribbon]).get('a'), { island: 'a', capabilities: 2, area: 1600 });
  // A cell that lost its ring still names its capability and adds no land.
  const ringless = { ...cell('d', 'd/p', 0, 0) };
  delete ringless.points;
  assert.deepEqual(islandLand([ringless]).get('d'), { island: 'd', capabilities: 1, area: 0 });
  assert.equal(islandLand([]).size, 0);
  const noIsland = { ...cell('x', 'x/p', 0, 0) };
  delete noIsland.island;
  assert.equal(islandLand([noIsland]).size, 0, 'a cell on no island contributes to no island');
});

test('landRatioFactor: √(capabilities × ratio / area), so the scaled area is exactly capabilities × ratio; nothing to derive from ⇒ 1; a bad ratio refuses', () => {
  const land = { island: 'a', capabilities: 4, area: 1600 };
  assert.equal(landRatioFactor(land, 400), 1, 'already at the ratio');
  assert.equal(landRatioFactor(land, 100), 0.5);
  assert.equal(landRatioFactor(land, 1600), 2);
  const f = landRatioFactor(land, 318);
  assert.ok(Math.abs(f * f * 1600 - 4 * 318) < 1e-9);
  assert.equal(landRatioFactor({ island: 'a', capabilities: 0, area: 1600 }, 318), 1);
  assert.equal(landRatioFactor({ island: 'a', capabilities: 3, area: 0 }, 318), 1);
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => landRatioFactor(land, bad), /positive finite number/);
  }
  // ⚠ A FACTOR PAST 100× EITHER WAY IS REFUSED AS ARITHMETIC, not drawn: the same 1600-unit²
  // island asked for 10,000,000 per capability, or for 0.01, is not a size.
  assert.ok(Math.abs(landRatioFactor(land, 1600 * 99 * 99 / 4) - 99) < 1e-9, 'ninety-nine times is still a size');
  // The cap is inclusive: EXACTLY a hundred times, either way, is still a size.
  assert.equal(landRatioFactor(land, (1600 * 100 * 100) / 4), 100);
  assert.equal(landRatioFactor(land, 1600 / (4 * 100 * 100)), 0.01);
  assert.throws(() => landRatioFactor(land, 1600 * 101 * 101 / 4), /past 100× either way/);
  assert.throws(() => landRatioFactor(land, 1600 / (4 * 101 * 101)), /past 100× either way/);
  assert.equal(MAX_LAND_FACTOR, 100);
});

test('⚠⚠ sizeIslandsByCapability: every island’s area becomes capabilities × ratio, isotropically, about its OWN centre — the centres (the layout) do not move', () => {
  // Island a: 3 parcels, 4 cells (1600 units²) around (30, 0). Island b: 1 parcel, 1 cell of 400
  // around (500, 300). At a ratio of 100: a → 300 units² (factor √(300/1600) = 0.433), b → 100
  // (factor 0.5). Different factors per island, from the same ratio.
  const a = [cell('a', 'a/p1', 0, 0), cell('a', 'a/p1', 20, 0), cell('a', 'a/p2', 40, 0), cell('a', 'a/p3', 60, 0)];
  const b = [cell('b', 'b/p1', 500, 300)];
  const before = [...a, ...b];
  const after = sizeIslandsByCapability(before, 100);
  const landAfter = islandLand(after);
  assert.ok(Math.abs(landAfter.get('a')!.area - 300) < 1e-9, `${landAfter.get('a')!.area}`);
  assert.ok(Math.abs(landAfter.get('b')!.area - 100) < 1e-9, `${landAfter.get('b')!.area}`);
  // Isotropic: a's extent was 80 × 20; both shrink by the same factor.
  const ea = extent(after.filter((d) => d.island === 'a'));
  const fa = Math.sqrt(300 / 1600);
  assert.ok(Math.abs(ea.w - 80 * fa) < 1e-9 && Math.abs(ea.d - 20 * fa) < 1e-9, `${ea.w} × ${ea.d}`);
  // The centres are invariant.
  const cBefore = islandCentres(before);
  const cAfter = islandCentres(after);
  for (const id of ['a', 'b']) {
    assert.ok(Math.abs(cBefore.get(id)!.x - cAfter.get(id)!.x) < 1e-9);
    assert.ok(Math.abs(cBefore.get(id)!.z - cAfter.get(id)!.z) < 1e-9);
  }
  // The transform moves with the ring: the cell at (60, 0) sits 30 from a's centre; scaled, 30·fa.
  const far = after.find((d) => d.parcel === 'a/p3')!;
  assert.ok(Math.abs(far.transform.x - (30 + 30 * fa)) < 1e-9);
  // y is never touched, and the input is not mutated.
  assert.ok(after.every((d) => d.transform.y === 0));
  assert.deepEqual(before[0], a[0]);
  assert.equal(extent(a).w, 80);
});

test('⚠ a ratio equal to an island’s own density leaves it byte-identical; the default ratio is the shipped constant; an island with no parcels stays as drawn while its neighbour scales', () => {
  const a = [cell('a', 'a/p1', 0, 0), cell('a', 'a/p2', 20, 0)];
  const same = sizeIslandsByCapability(a, 400);
  assert.deepEqual(same, a);
  const explicit = sizeIslandsByCapability(a, LAND_AREA_PER_CAPABILITY);
  assert.ok(Math.abs(islandLand(explicit).get('a')!.area - 2 * LAND_AREA_PER_CAPABILITY) < 1e-9);
  // There is NO default ratio here — the one caller that means the shipped one says so (`worldTo3D`),
  // and `world-to-3d.test.ts` holds that its default IS the shipped constant.
  const mixed = [cell('bare', undefined, 0, 0), cell('b', 'b/p', 300, 0)];
  const out = sizeIslandsByCapability(mixed, 100);
  assert.deepEqual(out[0], mixed[0], 'no capability, no reading, no change');
  assert.ok(Math.abs(islandLand(out).get('b')!.area - 100) < 1e-9);
  assert.deepEqual(sizeIslandsByCapability([], 100), []);
});

test('⚠ the whole stream follows the island: a bloom scales about its own island, a ribbon between two islands lands on both scaled coasts, and a cave keeps its bearing under the isotropic scale', () => {
  // Island a at (50, 30): one cell of 1600 units² → at 400 its factor is 0.5. Island b at (250, 30):
  // one cell of 400 units² → at 400 its factor is 1 (already at the ratio). Nothing sits at the
  // origin, so a shift computed against the wrong centre — or added where it should be subtracted —
  // is a number a test can see.
  const a = cell('a', 'a/p', 50, 30, 40);
  const b = cell('b', 'b/p', 250, 30, 20);
  const bloom: InstanceDescriptor = { kind: 'uat-bloom', transform: { x: 60, y: 0, z: 40 }, group: 'g', island: 'a' };
  const cave: InstanceDescriptor = { kind: 'cave-arch', transform: { x: 70, y: 0, z: 30 }, group: 'g', island: 'a', bearing: 0.7 };
  const strip: InstanceDescriptor = {
    kind: 'trail-strip',
    transform: { x: 155, y: 0, z: 30 },
    group: 'g',
    points: [
      { x: 70, y: 0, z: 30 },
      { x: 155, y: 0, z: 30 },
      { x: 240, y: 0, z: 30 },
    ],
  };
  const out = sizeIslandsByCapability([a, b, bloom, cave, strip], 400).filter(asInstance);
  const [, , bloomOut, caveOut, stripOut] = out as [InstanceDescriptor, InstanceDescriptor, InstanceDescriptor, InstanceDescriptor, InstanceDescriptor];
  assert.deepEqual(bloomOut.transform, { x: 55, y: 0, z: 35 });
  assert.deepEqual(caveOut.transform, { x: 60, y: 0, z: 30 });
  assert.ok(Math.abs((caveOut.bearing as number) - 0.7) < 1e-12, 'isotropic: the rim normal does not turn');
  // a's coast at x = 70 is now at 60 (20 from a's centre, halved); b's coast at x = 240 stays (factor 1).
  // The ribbon's first end shifts by −10, its last by 0, and the midpoint blends the two islands'
  // displacements OF ITSELF by arc length: ½·(155 − 50)·(−½) + ½·(155 − 250)·0 = −26.25.
  assert.ok(Math.abs(stripOut.points![0]!.x - 60) < 1e-9);
  assert.ok(Math.abs(stripOut.points![2]!.x - 240) < 1e-9);
  assert.ok(Math.abs(stripOut.points![1]!.x - 128.75) < 1e-9, `the midpoint: ${stripOut.points![1]!.x}`);
  assert.ok(stripOut.points!.every((q) => q.z === 30), 'nothing moved along z');
  // The ribbon's transform moves by the MEAN of its points' shifts: (−10 − 26.25 + 0) / 3.
  assert.ok(Math.abs(stripOut.transform.x - (155 - 36.25 / 3)) < 1e-9, `${stripOut.transform.x}`);
  assert.equal(stripOut.transform.z, 30);
});
