// shipped-footprint-scene.test.ts — the footprint page's own arithmetic, without a GPU.
//
// ⚠ THE PICTURES ON THAT PAGE ARE FOR THE OWNER'S EYE; what a test can hold is that the arms are
// the SHIPPED composition with the density as the only thing moving between the true arms, that
// the control is what shipped until this landing (the true island re-projected by exactly the
// drawing's projection, from the historical 45°, at the historical rung), that every true arm is
// judged from the camera the canvas actually looks down (read off `frameWorld`, and it is the
// signed 50°), and that the two numbers under each picture count what they claim to.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLAN_VIEW_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import { SHIPPED_ELEVATION_DEG, shippedElevationDeg } from '../src/camera-framing.js';
import { GROVE_DENSITY, GROVE_DENSITY_RUNGS, RECIPE_ISLAND_AREA, groveStandCount } from '../src/grove-dressing.js';
import { RENDER_ELEV_DEG, isGrovePlacement } from '../src/kit-vocabulary.js';
import { parcelCellsFrom } from '../src/parcel-cells.js';
import { islandCentres } from '../src/true-footprint.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';
import { armDescriptors } from './shipped-canopy-scene.js';
import { crowdSize, orientedCamera } from './shipped-crowd-scene.js';
import {
  CONTROL_ARM,
  DENSITY_LADDER,
  FIT_MARGIN,
  FOOTPRINT_ARMS,
  FOOTPRINT_PICTURE_ZOOMS,
  FOOTPRINT_SIZES,
  PREVIOUS_DENSITY,
  PREVIOUS_ELEVATION_DEG,
  PREVIOUS_RECIPE_ISLAND_AREA,
  SHIPPED_ARM,
  armCamera,
  armCaption,
  armPlacements,
  armSpec,
  cameraAgreement,
  cameraElevationDeg,
  countsCaption,
  deliveredPineHeightPx,
  dressingCounts,
  elevatedCamera,
  fitPxPerUnitFor,
  footprintCells,
  footprintDescriptors,
  groundDepth,
  islandDepth,
  landBox,
  leanerArm,
  screenExtent,
  trueArmId,
} from './shipped-footprint-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

const cells = (ds: readonly Descriptor3D[]): InstanceDescriptor[] =>
  ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');

const ONE = crowdSize('one');

test('⚠⚠ the shipped camera IS the signed 50° — read off frameWorld through the crowd camera, never typed here', () => {
  assert.deepEqual(cameraAgreement(), []);
  assert.equal(SHIPPED_ELEVATION_DEG, RENDER_ELEV_DEG);
  assert.equal(RENDER_ELEV_DEG, 50);
  assert.ok(Math.abs(shippedElevationDeg() - 50) < 1e-9, `frameWorld looks down at ${shippedElevationDeg()}°`);
  assert.ok(Math.abs(cameraElevationDeg(orientedCamera({ x: 0, z: 0 }, 1)) - 50) < 1e-9);
  // The control is HISTORY and says so: 45° and rung 2 are what shipped until 2026-09-05.
  assert.equal(PREVIOUS_ELEVATION_DEG, 45);
  assert.equal(PREVIOUS_DENSITY, 2);
  assert.notEqual(PREVIOUS_ELEVATION_DEG, SHIPPED_ELEVATION_DEG, 'a control at the shipped elevation is not "before"');
  const page = source('shipped-footprint-scene.ts');
  assert.ok(!/elevationDeg: 50\b/.test(page), 'the shipped elevation is derived, never typed');
});

test('the arms: the control first, then the true footprint up the declared density ladder; the shipped arm is the shipped rung', () => {
  assert.deepEqual([...DENSITY_LADDER], [...GROVE_DENSITY_RUNGS]);
  assert.deepEqual(
    FOOTPRINT_ARMS.map((a) => a.id),
    [CONTROL_ARM, ...GROVE_DENSITY_RUNGS.map((r) => `true-x${r}`)],
  );
  assert.equal(CONTROL_ARM, 'before');
  assert.deepEqual(armSpec(CONTROL_ARM), {
    id: 'before',
    footprint: 'drawn',
    elevationDeg: 45,
    density: 2,
    recipeIslandArea: PREVIOUS_RECIPE_ISLAND_AREA,
  });
  // ⚠ THE CONTROL IS PROPORTIONED IN THE BASIS IT SHIPPED IN, so it stands what shipped: on the
  // drawn island (8,424.6 in area) rung 2 against 8,424.6 is exactly the 26 stands it stood
  // yesterday — and rung 2 on the true island against today's constant is the same 26.
  assert.equal(PREVIOUS_RECIPE_ISLAND_AREA, 8424.6);
  assert.ok(Math.abs(RECIPE_ISLAND_AREA / PREVIOUS_RECIPE_ISLAND_AREA - 1 / groundFlattening()) < 1e-3, 'the constant moved by exactly the projection');
  assert.equal(groveStandCount(parcelCellsFrom(footprintDescriptors('drawn', ONE)), 2, PREVIOUS_RECIPE_ISLAND_AREA), 26);
  assert.equal(groveStandCount(parcelCellsFrom(footprintDescriptors('true', ONE)), 2), 26);
  assert.equal(groveStandCount(parcelCellsFrom(footprintDescriptors('true', ONE)), 1), 13, 'rung 1 is the recipe’s own thirteen');
  assert.equal(SHIPPED_ARM, trueArmId(GROVE_DENSITY));
  assert.ok(GROVE_DENSITY_RUNGS.includes(GROVE_DENSITY as (typeof GROVE_DENSITY_RUNGS)[number]), 'the shipped pick is a rendered rung');
  for (const arm of FOOTPRINT_ARMS) {
    if (arm.id === CONTROL_ARM) continue;
    assert.equal(arm.footprint, 'true');
    assert.equal(arm.elevationDeg, SHIPPED_ELEVATION_DEG);
    assert.equal(arm.recipeIslandArea, RECIPE_ISLAND_AREA, 'a true arm is proportioned against today’s constant');
    assert.ok(armCaption(arm.id).length > 40, `${arm.id} has no caption a reader could use`);
  }
  assert.ok(/BEFORE \(CONTROL\)/.test(armCaption(CONTROL_ARM)));
  assert.ok(/THE SHIPPED PICK/.test(armCaption(SHIPPED_ARM)));
  assert.ok(/RECIPE’S OWN/.test(armCaption(trueArmId(1))));
  assert.throws(() => armSpec('true-x9'), /no arm/);
  // The leaner arm walks the ladder down on the true footprint only.
  assert.equal(leanerArm(CONTROL_ARM), null);
  assert.equal(leanerArm(trueArmId(DENSITY_LADDER[0]!)), null);
  assert.equal(leanerArm(trueArmId(DENSITY_LADDER[1]!)), trueArmId(DENSITY_LADDER[0]!));
  assert.deepEqual(
    FOOTPRINT_SIZES.map((s) => s.id),
    ['one', 'forest'],
  );
  assert.deepEqual([...FOOTPRINT_PICTURE_ZOOMS], [8, 'fit']);
});

test('⚠⚠ the control stands on the true island RE-PROJECTED by exactly the drawing’s projection — yesterday’s ground, not a third island', () => {
  const tru = footprintDescriptors('true', ONE);
  const drawn = footprintDescriptors('drawn', ONE);
  assert.equal(footprintDescriptors('true', ONE), tru, 'memoised');
  assert.equal(footprintDescriptors('drawn', ONE), drawn, 'memoised');
  assert.equal(tru, armDescriptors(ONE), 'the true footprint IS the canopy page’s stream — what the mapper delivers now');
  assert.equal(drawn.length, tru.length);
  const flatten = groundFlattening();
  const cz = [...islandCentres(tru).values()][0]!.z;
  for (const [i, d] of drawn.entries()) {
    const t = tru[i]!;
    assert.equal(d.kind, t.kind);
    assert.equal(d.transform.x, t.transform.x, 'x never moves');
    if (d.kind === 'cell-ground') {
      assert.ok(Math.abs(d.transform.z - cz - (t.transform.z - cz) * flatten) < 1e-9);
    }
  }
  const before = groundDepth(cells(drawn));
  const after = groundDepth(cells(tru));
  assert.ok(Math.abs(before.w - after.w) < 1e-9, 'width untouched');
  assert.ok(Math.abs(before.d - after.d * flatten) < 1e-9, 'depth re-projected by exactly sin 20°');
  assert.ok(before.d > 40 && before.d < 55, `drawn depth ${before.d} — the ribbon`);
  assert.ok(after.d > 125 && after.d < 145, `true depth ${after.d} — the recipe’s cluster`);
  assert.ok(Math.abs(islandDepth(cells(tru)).d - after.d) < 1e-9, 'one island: the island depth is the ground depth');
  // And the drawn stream IS the drawing: the same cells the mapper emits when told the scene is
  // already true — an independent route to yesterday's ground, compared relative to the centre.
  const raw = cells(worldTo3D(islandScene(), { cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG }));
  const rawDepth = groundDepth(raw);
  assert.ok(Math.abs(rawDepth.d - before.d) < 1e-6 && Math.abs(rawDepth.w - before.w) < 1e-6);
});

test('⚠ the two numbers count what they claim: capability trees are the vocabulary, grove pines are the grove, and the rung reaches only the grove', () => {
  const stream = footprintDescriptors('true', ONE);
  const counts = DENSITY_LADDER.map((d) => dressingCounts(armPlacements(trueArmId(d), ONE), stream));
  // The fixture island: eleven capabilities, ten signed criteria, one green island.
  for (const c of counts) {
    assert.equal(c.capabilityTrees, 11, 'one tree per capability');
    assert.equal(c.blooms, 10, 'one bloom per signed criterion');
    assert.equal(c.islands, 1);
    assert.equal(c.healthyIslands, 1);
    assert.equal(c.placements, c.capabilityTrees + c.blooms + c.grovePines + c.cover);
    assert.ok(Math.abs(c.pinesPerCapability - c.grovePines / 11) < 1e-12);
    assert.equal(c.capabilityTreesPerHealthyIsland, 11);
    assert.equal(c.grovePinesPerHealthyIsland, c.grovePines);
  }
  // The ladder rises in grove pines and in nothing else.
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i]!.grovePines > counts[i - 1]!.grovePines, `rung ${DENSITY_LADDER[i]} does not stand more pines than rung ${DENSITY_LADDER[i - 1]}`);
  }
  const vocabulary = (arm: string) => armPlacements(arm, ONE).filter((p) => !isGrovePlacement(p) && p.role !== 'bush' && p.role !== 'tuft' && p.role !== 'flowerPatch');
  for (const d of DENSITY_LADDER) assert.deepEqual(vocabulary(trueArmId(d)), vocabulary(trueArmId(DENSITY_LADDER[0]!)), `rung ${d} moved the vocabulary`);
  // Memoised: the forest's dressing is thirty-five islands' worth of placement.
  assert.equal(armPlacements(SHIPPED_ARM, ONE), armPlacements(SHIPPED_ARM, ONE));
  // The control's counts are the squashed island's at the historical rung — the 81 pines the
  // canopy landing measured (26 stands, ~3 members each: a 3:1 stand cannot hold the recipe's
  // 4–8) — fewer than the same rung on the true footprint, where the stands are round.
  const before = dressingCounts(armPlacements(CONTROL_ARM, ONE), footprintDescriptors('drawn', ONE));
  assert.equal(before.capabilityTrees, 11);
  assert.ok(before.grovePines >= 70 && before.grovePines <= 95, `${before.grovePines} grove pines on the control — not yesterday’s 81`);
  assert.equal(before.cover, 216, 'the control wears the recipe’s own cover counts, as it did');
  assert.equal(counts[0]!.cover, 216, 'and so does the true island — the same thirteen hexes');
  assert.ok(before.grovePines < dressingCounts(armPlacements(trueArmId(PREVIOUS_DENSITY), ONE), stream).grovePines);
  // The caption carries both numbers and the ratio.
  const cap = countsCaption(counts[0]!, 'one');
  assert.ok(cap.includes('11 capability trees') && cap.includes(`${counts[0]!.grovePines} grove pines`) && /per capability/.test(cap));
  assert.ok(/islands/.test(countsCaption(counts[0]!, 'forest')));
});

test('⚠ every true arm is judged from the SHIPPED crowd camera; the control from the historical 45°', () => {
  for (const spec of FOOTPRINT_ARMS) {
    const cam = armCamera(spec, 1);
    assert.ok(Math.abs(cameraElevationDeg(cam) - spec.elevationDeg) < 1e-9, `${spec.id} looks down at ${cameraElevationDeg(cam)}°`);
    assert.ok(Math.abs(cam.position.x) < 1e-12, 'azimuth fixed at +z, like frameWorld');
  }
  const shipped = armCamera(armSpec(SHIPPED_ARM), 1);
  const theirs = orientedCamera({ x: 0, z: 0 }, 1);
  assert.ok(shipped.position.clone().normalize().distanceTo(theirs.position.clone().normalize()) < 1e-9);
  for (const e of [45, 50, 60]) {
    assert.ok(Math.abs(cameraElevationDeg(elevatedCamera({ x: 0, z: 0 }, 1, e)) - e) < 1e-9);
  }
});

test('screenExtent foreshortens ground depth by sin(elevation) and leaves width alone; the fit binds on the tighter side', () => {
  const pts: number[] = [];
  for (const x of [-100, 100]) for (const z of [-50, 50]) pts.push(x, 0, z);
  for (const e of [45, 50, 60]) {
    const ext = screenExtent(pts, elevatedCamera({ x: 0, z: 0 }, 1, e));
    assert.ok(Math.abs(ext.w - 200) < 1e-9);
    assert.ok(Math.abs(ext.h - 100 * Math.sin((e * Math.PI) / 180)) < 1e-9, `${e}°: h ${ext.h}`);
  }
  // Width-bound at the control's 45°: 2560/2/(100+40).
  assert.ok(Math.abs(fitPxPerUnitFor(pts, armSpec(CONTROL_ARM)) - 2560 / 2 / (100 + FIT_MARGIN)) < 1e-9);
  // A deep rectangle is height-bound, and the higher shipped camera makes it MORE so.
  const deep: number[] = [];
  for (const x of [-100, 100]) for (const z of [-400, 400]) deep.push(x, 0, z);
  const at45 = fitPxPerUnitFor(deep, armSpec(CONTROL_ARM));
  const at50 = fitPxPerUnitFor(deep, armSpec(SHIPPED_ARM));
  assert.ok(Math.abs(at45 - 1600 / 2 / (400 * Math.SQRT1_2 + FIT_MARGIN)) < 1e-9);
  assert.ok(at50 < at45);
});

test('a pine stands 18 units and its delivered height is cos(elevation) of that — the signed camera costs 9% of it', () => {
  assert.ok(Math.abs(deliveredPineHeightPx(45, 8) - 18 * Math.SQRT1_2 * 8) < 1e-9);
  assert.ok(Math.abs(deliveredPineHeightPx(50, 8) - 18 * Math.cos((50 * Math.PI) / 180) * 8) < 1e-9);
  assert.ok(deliveredPineHeightPx(50, 8) / deliveredPineHeightPx(45, 8) > 0.9);
  assert.ok(deliveredPineHeightPx(50, 8) < deliveredPineHeightPx(45, 8));
});

test('landBox finds the delivered island against a byte background, and the reference against alpha', () => {
  const w = 6;
  const h = 4;
  const bg: readonly [number, number, number] = [16, 20, 24];
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf[i * 4] = bg[0];
    buf[i * 4 + 1] = bg[1];
    buf[i * 4 + 2] = bg[2];
    buf[i * 4 + 3] = 255;
  }
  const paint = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    buf[i] = 90;
    buf[i + 1] = 140;
    buf[i + 2] = 60;
  };
  paint(1, 1);
  paint(4, 1);
  paint(2, 2);
  assert.deepEqual(landBox(buf, w, h, bg), { w: 4, h: 2, x0: 1, y0: 1, pixels: 3 });
  const alpha = new Uint8ClampedArray(w * h * 4);
  alpha[(2 * w + 3) * 4 + 3] = 255;
  alpha[(3 * w + 5) * 4 + 3] = 255;
  alpha[(0 * w + 0) * 4 + 3] = 100;
  assert.deepEqual(landBox(alpha, w, h, null), { w: 3, h: 2, x0: 3, y0: 2, pixels: 2 });
  assert.deepEqual(landBox(new Uint8ClampedArray(w * h * 4), w, h, null), { w: 0, h: 0, x0: 0, y0: 0, pixels: 0 });
});

test('⚠ every arm is built by the shipped composition root, and the page assembles no scene of its own', () => {
  const page = source('shipped-footprint-scene.ts');
  assert.ok(/shippedGroundBuild\(/.test(page), 'the ground is the builder’s');
  assert.ok(
    /dressMapWithCover\(footprintDescriptors\(spec\.footprint, size\), \{\s*relief: LAND_RELIEF_AMPLITUDE,\s*footprint: KIT_FOOTPRINTS_2026_08_29,\s*density: spec\.density,\s*recipeIslandArea: spec\.recipeIslandArea,\s*\}\)/.test(page),
    'the dressing is the canvas’s own call plus the rung',
  );
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  assert.ok(!/dressGroves\(|dressCover\(/.test(page), 'the props are placed by map-dressing, never re-derived here');
  // The true footprint is the mapper's, not the page's: no stretch by 1/sin here, only the
  // inverse for the control.
  assert.ok(/stretchAboutIslands\(base, groundFlattening\(\)\)/.test(page), 'the control re-projects by sin 20°');
  assert.ok(!/1 \/ groundFlattening/.test(page), 'the page does not unproject — the mapper does');
  // Frame cost is on this page, as a REPORT.
  assert.ok(/TIME_ELAPSED_EXT/.test(page) && /awaitQuery\(/.test(page), 'the GPU clock is the shared instrument');
  assert.ok(/ADR-0517 D4/.test(page), 'the page says the cost reports and does not gate');
});
