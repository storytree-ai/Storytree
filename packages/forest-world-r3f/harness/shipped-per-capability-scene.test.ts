// shipped-per-capability-scene.test.ts — the one-tree-per-capability page's own arithmetic, without
// a GPU.
//
// ⚠ THE PICTURES ON THAT PAGE ARE FOR THE OWNER'S EYE; what a test can hold is that the arms are
// the SHIPPED composition with the cover's count as the only thing moving between the ladder arms,
// that no ladder arm stands anything tree-shaped a capability did not put there (ADR-0518 D1/D4),
// that the control is what shipped until this landing (the grove, composed from the harness's
// history module), that every arm is judged from the camera the canvas actually looks down, and that
// the numbers under each picture count what they claim to — the TREE count above all.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SHIPPED_ELEVATION_DEG, shippedElevationDeg } from '../src/camera-framing.js';
import { COVER_DENSITY, COVER_DENSITY_RUNGS, COVER_SIZE } from '../src/cover-dressing.js';
import { RENDER_ELEV_DEG, isDressingRole } from '../src/kit-vocabulary.js';
import { dressMapWithCover } from '../src/map-dressing.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { KIT_FOOTPRINTS_2026_08_29 } from '../src/kit-vocabulary.js';
import { groundSanity } from './ground-sanity.js';
import { isGroveHistoryPlacement } from './grove-history.js';
import { armDescriptors } from './shipped-canopy-scene.js';
import { crowdSize, orientedCamera } from './shipped-crowd-scene.js';
import {
  CONTROL_ARM,
  DENSITY_LADDER,
  FIT_MARGIN,
  LADDER_ARMS,
  PER_CAPABILITY_ARMS,
  PER_CAPABILITY_PICTURE_ZOOMS,
  PER_CAPABILITY_SIZES,
  PREVIOUS_COVER_DENSITY,
  PREVIOUS_GROVE_DENSITY,
  SHIPPED_ARM,
  armCaption,
  armCasters,
  armGroundBuild,
  armPlacements,
  armSpec,
  cameraAgreement,
  cameraElevationDeg,
  countsCaption,
  coverArmId,
  deliveredPineHeightPx,
  dressingCounts,
  fitPxPerUnitFor,
  groundDepth,
  islandDepth,
  landBox,
  leanerArm,
  screenExtent,
} from './shipped-per-capability-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

const ONE = crowdSize('one');

test('⚠⚠ every arm is judged from the signed 50° — read off frameWorld through the crowd camera, never typed here', () => {
  groundSanity();
  assert.deepEqual(cameraAgreement(), []);
  assert.equal(SHIPPED_ELEVATION_DEG, RENDER_ELEV_DEG);
  assert.equal(RENDER_ELEV_DEG, 50);
  assert.ok(Math.abs(shippedElevationDeg() - 50) < 1e-9, `frameWorld looks down at ${shippedElevationDeg()}°`);
  assert.ok(Math.abs(cameraElevationDeg(orientedCamera({ x: 0, z: 0 }, 1)) - 50) < 1e-9);
  const page = source('shipped-per-capability-scene.ts');
  assert.ok(!/elevationDeg: 50\b/.test(page), 'the shipped elevation is derived, never typed');
  assert.ok(!/elevatedCamera|stretchAboutIslands/.test(page), 'no historical camera and no re-projection: the control is today’s footprint and camera');
});

test('the arms: the control first, then one tree per capability up the declared count ladder; the shipped arm is the shipped rung', () => {
  groundSanity();
  assert.deepEqual([...DENSITY_LADDER], [...COVER_DENSITY_RUNGS]);
  assert.deepEqual(
    PER_CAPABILITY_ARMS.map((a) => a.id),
    [CONTROL_ARM, ...COVER_DENSITY_RUNGS.map((r) => `cover-x${r}`)],
  );
  assert.equal(CONTROL_ARM, 'today');
  assert.deepEqual(armSpec(CONTROL_ARM), { id: 'today', coverDensity: PREVIOUS_COVER_DENSITY, grove: true });
  // The control is HISTORY and says so: the grove at rung 1 and the cover at the recipe's count are
  // what shipped until 2026-09-05.
  assert.equal(PREVIOUS_GROVE_DENSITY, 1);
  assert.equal(PREVIOUS_COVER_DENSITY, 1);
  assert.equal(SHIPPED_ARM, coverArmId(COVER_DENSITY));
  assert.ok(COVER_DENSITY_RUNGS.includes(COVER_DENSITY as (typeof COVER_DENSITY_RUNGS)[number]), 'the shipped pick is a rendered rung');
  assert.notEqual(SHIPPED_ARM, CONTROL_ARM);
  assert.deepEqual([...LADDER_ARMS], COVER_DENSITY_RUNGS.map((r) => coverArmId(r)));
  for (const arm of PER_CAPABILITY_ARMS) {
    if (arm.id === CONTROL_ARM) continue;
    assert.equal(arm.grove, false, 'a ladder arm stands the grove');
    assert.ok(armCaption(arm.id).length > 40, `${arm.id} has no caption a reader could use`);
    assert.ok(/ONE TREE PER CAPABILITY/.test(armCaption(arm.id)));
  }
  assert.ok(/TODAY \(CONTROL\)/.test(armCaption(CONTROL_ARM)));
  assert.ok(/THE SHIPPED PICK/.test(armCaption(SHIPPED_ARM)));
  assert.ok(/RECIPE’S OWN/.test(armCaption(coverArmId(1))));
  assert.throws(() => armSpec('cover-x9'), /no arm/);
  assert.equal(leanerArm(CONTROL_ARM), null);
  assert.equal(leanerArm(coverArmId(DENSITY_LADDER[0]!)), null);
  assert.equal(leanerArm(coverArmId(DENSITY_LADDER[1]!)), coverArmId(DENSITY_LADDER[0]!));
  assert.deepEqual(PER_CAPABILITY_SIZES.map((s) => s.id), ['one', 'forest']);
  assert.deepEqual([...PER_CAPABILITY_PICTURE_ZOOMS], [8, 'fit']);
});

test('⚠⚠ THE TREE COUNT IS THE CAPABILITY COUNT on every ladder arm, and nothing else tree-shaped stands (ADR-0518 D1/D4)', () => {
  groundSanity();
  const stream = armDescriptors(ONE);
  const counts = LADDER_ARMS.map((arm) => dressingCounts(armPlacements(arm, ONE), stream));
  // The fixture island: eleven capabilities, ten signed criteria, one green island.
  for (const [i, c] of counts.entries()) {
    assert.equal(c.capabilityTrees, 11, 'one tree per capability');
    assert.equal(c.grovePines, 0, `${LADDER_ARMS[i]} stands dressing pines — the count is being padded back`);
    assert.equal(c.blooms, 10, 'one bloom per signed criterion');
    assert.equal(c.islands, 1);
    assert.equal(c.healthyIslands, 1);
    assert.equal(c.placements, c.capabilityTrees + c.blooms + c.cover);
    assert.equal(c.cover, c.bushes + c.tufts + c.flowerPatches);
    assert.equal(c.capabilityTreesPerHealthyIsland, 11);
    assert.equal(c.coverPerHealthyIsland, c.cover);
    // Every `tree` placement on a ladder arm is a capability's own, at the role's full size.
    for (const p of armPlacements(LADDER_ARMS[i]!, ONE)) {
      if (p.role !== 'tree' && p.role !== 'deadTree') continue;
      assert.equal(p.scale, 1, `a tree at ${p.scale} on ${LADDER_ARMS[i]}`);
      assert.ok(!isGroveHistoryPlacement(p));
    }
  }
  // The ladder rises in cover and in nothing else.
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i]!.cover > counts[i - 1]!.cover, `rung ${DENSITY_LADDER[i]} does not wear more cover than rung ${DENSITY_LADDER[i - 1]}`);
  }
  assert.equal(counts[0]!.cover, 216, 'rung 1 is the recipe’s own 216 on the fixture island');
  const vocabulary = (arm: string) => armPlacements(arm, ONE).filter((p) => !isDressingRole(p.role));
  for (const arm of LADDER_ARMS) assert.deepEqual(vocabulary(arm), vocabulary(LADDER_ARMS[0]!), `${arm} moved the vocabulary`);
  // And the shipped arm IS the canvas's own call: the same placements `dressMapWithCover` returns
  // with the canvas's options and no rung passed.
  assert.deepEqual(
    armPlacements(SHIPPED_ARM, ONE),
    dressMapWithCover(stream, { relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29 }),
    'the shipped arm is not what the canvas stands',
  );
  // Memoised: the forest's dressing is thirty-five islands' worth of placement.
  assert.equal(armPlacements(SHIPPED_ARM, ONE), armPlacements(SHIPPED_ARM, ONE));
});

test('⚠⚠ the control is TODAY’S map: the same vocabulary, the same cover count as rung 1, PLUS the retired grove', () => {
  groundSanity();
  const stream = armDescriptors(ONE);
  const before = dressingCounts(armPlacements(CONTROL_ARM, ONE), stream);
  const bottom = dressingCounts(armPlacements(LADDER_ARMS[0]!, ONE), stream);
  assert.equal(before.capabilityTrees, 11);
  assert.equal(before.blooms, 10);
  assert.equal(before.cover, bottom.cover, 'the control wears the recipe’s own cover, as it did');
  // The grove it stood: the recipe's 13 stands × 4–8 = 52–104 pines, minus exclusions — 61
  // measured 2026-09-05 on this island. 5.5 dressing pines per capability is the owner's complaint.
  assert.ok(before.grovePines >= 40 && before.grovePines <= 104, `${before.grovePines} dressing pines on the control — not yesterday’s grove`);
  assert.equal(before.grovePinesPerHealthyIsland, before.grovePines);
  for (const p of armPlacements(CONTROL_ARM, ONE).filter(isGroveHistoryPlacement)) {
    assert.equal(p.role, 'tree');
    assert.ok(p.scale >= 0.55 && p.scale < 0.8, 'a grove pine outside the retired band');
    assert.equal(p.tint, null);
  }
  // The control's vocabulary is the ladder's vocabulary: the grove was placed AFTER it and moved nothing.
  const vocabulary = (arm: string) => armPlacements(arm, ONE).filter((p) => !isDressingRole(p.role) && !isGroveHistoryPlacement(p));
  assert.deepEqual(vocabulary(CONTROL_ARM), vocabulary(LADDER_ARMS[0]!));
  // The caption leads with the tree count, and says which pines are dressing.
  const cap = countsCaption(before, 'one');
  assert.ok(cap.startsWith('11 trees (one per capability)'), cap);
  assert.ok(cap.includes(`${before.grovePines} dressing pines`));
  assert.ok(countsCaption(bottom, 'one').includes('no dressing pines'));
  assert.ok(/islands/.test(countsCaption(bottom, 'forest')));
});

test('⚠ the ladder arms share ONE ground build and one caster set; the control’s ground is its own, because the grove cast', () => {
  groundSanity();
  const bottom = armGroundBuild(LADDER_ARMS[0]!, ONE);
  for (const arm of LADDER_ARMS) {
    assert.equal(armGroundBuild(arm, ONE), bottom, `${arm} built its own ground`);
    assert.deepEqual(armCasters(arm, ONE), armCasters(LADDER_ARMS[0]!, ONE), `${arm} casts differently — ground cover has started casting`);
  }
  assert.notEqual(armGroundBuild(CONTROL_ARM, ONE), bottom);
  assert.ok(armCasters(CONTROL_ARM, ONE).length > armCasters(LADDER_ARMS[0]!, ONE).length, 'the control casts no more than the ladder — it stands no grove');
  // NON-VACUITY: the ladder's casters are exactly the vocabulary's — trees and blooms, 21 on the fixture.
  assert.equal(armCasters(LADDER_ARMS[0]!, ONE).length, 21);
});

test('screenExtent foreshortens ground depth by sin(elevation) and leaves width alone; the fit binds on the tighter side', () => {
  groundSanity();
  const pts: number[] = [];
  for (const x of [-100, 100]) for (const z of [-50, 50]) pts.push(x, 0, z);
  const ext = screenExtent(pts, orientedCamera({ x: 0, z: 0 }, 1));
  assert.ok(Math.abs(ext.w - 200) < 1e-9);
  assert.ok(Math.abs(ext.h - 100 * Math.sin((50 * Math.PI) / 180)) < 1e-9, `h ${ext.h}`);
  // Width-bound: 2560/2/(100+40).
  assert.ok(Math.abs(fitPxPerUnitFor(pts) - 2560 / 2 / (100 + FIT_MARGIN)) < 1e-9);
  // A deep rectangle is height-bound.
  const deep: number[] = [];
  for (const x of [-100, 100]) for (const z of [-400, 400]) deep.push(x, 0, z);
  assert.ok(Math.abs(fitPxPerUnitFor(deep) - 1600 / 2 / (400 * Math.sin((50 * Math.PI) / 180) + FIT_MARGIN)) < 1e-9);
});

test('a pine stands 18 units and its delivered height is cos(50°) of that; the island depths are the true footprint’s', () => {
  groundSanity();
  assert.ok(Math.abs(deliveredPineHeightPx(8) - 18 * Math.cos((50 * Math.PI) / 180) * 8) < 1e-9);
  const cells = armDescriptors(ONE).filter((d) => d.kind === 'cell-ground');
  const depth = groundDepth(cells);
  assert.ok(depth.d > 125 && depth.d < 145, `true depth ${depth.d} — the recipe’s cluster`);
  assert.ok(depth.w > 225 && depth.w < 245, `width ${depth.w}`);
  assert.ok(Math.abs(islandDepth(cells).d - depth.d) < 1e-9, 'one island: the island depth is the ground depth');
});

test('landBox finds the delivered island against a byte background, and the reference against alpha', () => {
  groundSanity();
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

test('⚠ every ladder arm is built by the shipped composition root; the control alone reaches the harness’s history', () => {
  groundSanity();
  const page = source('shipped-per-capability-scene.ts');
  assert.ok(/shippedGroundBuild\(/.test(page), 'the ground is the builder’s');
  assert.ok(
    /dressMapWithCover\(armDescriptors\(size\), \{ \.\.\.CANVAS_OPTIONS, coverDensity: spec\.coverDensity \}\)/.test(page),
    'the dressing is the canvas’s own call plus the rung',
  );
  assert.ok(/relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29/.test(page), 'the canvas’s own options');
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  // The grove reaches this page through ONE function, in the control's composition, and the ladder
  // arms are typed `grove: false` — there is no density knob for it and no arm that could take one.
  assert.equal((page.match(/dressGrovesHistory\(/g) ?? []).length, 1, 'the grove is composed once, for the control');
  assert.ok(!/grove-dressing/.test(page), 'the deleted src module is not imported');
  assert.equal(COVER_SIZE, 4.5, 'the ladder is rendered at the settled size rung');
  // Frame cost is on this page, as a REPORT.
  assert.ok(/TIME_ELAPSED_EXT/.test(page) && /awaitQuery\(/.test(page), 'the GPU clock is the shared instrument');
  assert.ok(/ADR-0517 D4/.test(page), 'the page says the cost reports and does not gate');
});
