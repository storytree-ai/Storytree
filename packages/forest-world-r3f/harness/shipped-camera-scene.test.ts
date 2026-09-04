// shipped-camera-scene.test.ts — the camera page's own arithmetic, without a GPU.
//
// ⚠ THE PICTURES ON THAT PAGE ARE FOR THE OWNER'S EYE; what a test can hold is that the arms are
// the SHIPPED composition with exactly two things moving between them — the camera's elevation
// and the ground's footprint — that the control is what ships TODAY (read, not transcribed), and
// that the "true footprint" is the same island unprojected and nothing else.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLAN_VIEW_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';
import {
  CAMERA_ARMS,
  CAMERA_PICTURE_ZOOMS,
  CAMERA_SIZES,
  CONTROL_ARM,
  ELEVATION_LADDER,
  FIT_MARGIN,
  FOOTPRINTS,
  REFERENCE_GEOMETRY_ARM,
  SHIPPED_ELEVATION_DEG,
  SIGNED_ELEVATION_DEG,
  armCaption,
  armId,
  armSpec,
  deliveredPineHeightPx,
  elevatedCamera,
  fitPxPerUnitFor,
  footprintCells,
  footprintDescriptors,
  groundDepth,
  landBox,
  lowerArm,
  otherFootprintArm,
  screenExtent,
  shippedCameraAgreement,
  shippedElevationDeg,
  unprojectDescriptors,
  viewDirectionOf,
} from './shipped-camera-scene.js';
import { FIT_ZOOM, crowdSize, orientedCamera } from './shipped-crowd-scene.js';
import { shippedParcels } from './shipped-land-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

const cells = (ds: readonly Descriptor3D[]): InstanceDescriptor[] =>
  ds.filter((d): d is InstanceDescriptor => d.kind === 'cell-ground');

test('⚠ the shipped elevation is READ off frameWorld and it is 45° — the fact the increment starts from', () => {
  // `frameWorld` sits the eye `back` up and `back` along +z: atan(1) = 45°. If the canvas ever
  // moves, this fails, which is right — the control arm must be today's view, and a `45` written
  // in the page would have stayed 45.
  assert.ok(Math.abs(shippedElevationDeg() - 45) < 1e-9, `frameWorld looks down at ${shippedElevationDeg()}°`);
  assert.equal(SHIPPED_ELEVATION_DEG, shippedElevationDeg());
  const page = source('shipped-camera-scene.ts');
  assert.ok(!/ELEVATION_LADDER: readonly number\[\] = \[45/.test(page), 'the shipped rung is derived, never typed');
});

test('the signed rung IS the owner-signed constant, and the ladder is the four the increment names, ascending', () => {
  assert.equal(SIGNED_ELEVATION_DEG, RENDER_ELEV_DEG);
  assert.equal(SIGNED_ELEVATION_DEG, 50);
  assert.deepEqual([...ELEVATION_LADDER], [45, 50, 55, 60]);
  for (let i = 1; i < ELEVATION_LADDER.length; i += 1) {
    assert.ok(ELEVATION_LADDER[i]! > ELEVATION_LADDER[i - 1]!, 'the ladder climbs');
  }
});

test('eight arms, footprint-major; the control is the shipped footprint at the shipped elevation; every arm captioned', () => {
  assert.deepEqual([...FOOTPRINTS], ['map', 'true']);
  assert.equal(CAMERA_ARMS.length, 8);
  assert.deepEqual(
    CAMERA_ARMS.map((a) => a.id),
    ['map-45', 'map-50', 'map-55', 'map-60', 'true-45', 'true-50', 'true-55', 'true-60'],
  );
  assert.equal(CONTROL_ARM, 'map-45');
  assert.equal(armSpec(CONTROL_ARM).footprint, 'map');
  assert.equal(armSpec(CONTROL_ARM).elevationDeg, SHIPPED_ELEVATION_DEG);
  // The approved render's own geometry — the arm the reference is compared against.
  assert.equal(REFERENCE_GEOMETRY_ARM, 'true-50');
  for (const arm of CAMERA_ARMS) {
    assert.ok(armCaption(arm.id).length > 40, `${arm.id} has no caption a reader could use`);
  }
  assert.ok(/TODAY \(CONTROL\)/.test(armCaption(CONTROL_ARM)));
  assert.ok(/approved render/.test(armCaption(REFERENCE_GEOMETRY_ARM)));
  assert.throws(() => armSpec('map-70'), /no arm/);
});

test('lowerArm walks the ladder down on the SAME footprint; otherFootprintArm swaps the ground at the same elevation', () => {
  assert.equal(lowerArm('map-45'), null);
  assert.equal(lowerArm('map-50'), 'map-45');
  assert.equal(lowerArm('true-60'), 'true-55');
  assert.equal(lowerArm('true-45'), null);
  assert.equal(otherFootprintArm('map-50'), 'true-50');
  assert.equal(otherFootprintArm('true-55'), 'map-55');
  assert.equal(armId('true', 50), 'true-50');
});

test('both sizes, the read zoom and the fitted view', () => {
  assert.deepEqual(
    CAMERA_SIZES.map((s) => s.id),
    ['one', 'forest'],
  );
  assert.deepEqual([...CAMERA_PICTURE_ZOOMS], [8, FIT_ZOOM]);
});

test('⚠⚠ unprojecting divides every ground z by sin of the land camera, touches no x, and reaches the points too', () => {
  const stretch = 1 / groundFlattening();
  assert.ok(Math.abs(stretch - 1 / Math.sin((20 * Math.PI) / 180)) < 1e-12, 'the land camera is 20°');
  const base = shippedParcels();
  const out = unprojectDescriptors(base);
  assert.equal(out.length, base.length);
  for (const [i, d] of out.entries()) {
    const b = base[i]!;
    assert.equal(d.transform.x, b.transform.x);
    assert.equal(d.transform.y, b.transform.y);
    assert.ok(Math.abs(d.transform.z - b.transform.z * stretch) < 1e-9);
    assert.equal(d.points?.length, b.points?.length);
    for (const [j, p] of (d.points ?? []).entries()) {
      const q = b.points![j]!;
      assert.equal(p.x, q.x);
      assert.ok(Math.abs(p.z - q.z * stretch) < 1e-9);
    }
  }
  // The shipped island is the squashed ribbon the increment describes; unprojected it is the
  // recipe's own cluster. Both figures are re-derived here rather than quoted.
  const before = groundDepth(base);
  const after = groundDepth(out);
  assert.ok(before.w > 220 && before.w < 250, `shipped width ${before.w}`);
  assert.ok(before.d > 40 && before.d < 55, `shipped depth ${before.d}`);
  assert.ok(Math.abs(after.w - before.w) < 1e-9, 'width untouched');
  assert.ok(Math.abs(after.d - before.d * stretch) < 1e-9, 'depth stretched by exactly the projection');
  assert.ok(after.d > 125 && after.d < 145, `true depth ${after.d}`);
  // The input is not mutated.
  assert.ok(Math.abs(groundDepth(base).d - before.d) < 1e-12);
});

test('⚠⚠ TWO ROUTES TO THE TRUE FOOTPRINT AGREE: the fixture built at plan view and the shipped stream unprojected', () => {
  // The scene has its own `cameraElevationDeg` seam (ADR-0367 D1); at 90° `projectGround` is the
  // identity and `worldTo3D` receives the unprojected outline directly. That is an independent
  // implementation of what `unprojectDescriptors` does arithmetically, so the two agreeing is the
  // assertion that the footprint arm is the same island unprojected — not a different island.
  const plan = cells(worldTo3D(islandScene({ cameraElevationDeg: PLAN_VIEW_ELEVATION_DEG })));
  const stretched = cells(unprojectDescriptors(cells(worldTo3D(islandScene()))));
  assert.equal(plan.length, stretched.length, 'the same number of cells');
  assert.ok(plan.length > 100, `a real decomposition (${plan.length} cells)`);
  // ⚠ THE TWO ROUTES AGREE TO THE DRAWING'S OWN ROUNDING AND NO CLOSER — and that bound is
  // derived, not chosen. The scene writes its path coordinates to ONE decimal, so each route
  // carries up to ±0.05 of rounding on the coordinate it rounds: the plan-view route on the
  // unprojected z itself, the stretched route on the PROJECTED z, which the stretch then
  // multiplies by 1/sin 20° ≈ 2.92. Measured 2026-09-05: worst vertex 0.181, worst centroid
  // 0.125, on 164 matched cells. A tolerance tighter than the rounding would fail on noise; one
  // looser than a cell would pass a different island.
  const rounding = 0.05;
  const tolerance = rounding * (1 + 1 / groundFlattening());
  assert.ok(tolerance > 0.18 && tolerance < 0.25, `tolerance ${tolerance}`);
  const centroid = (d: InstanceDescriptor): { x: number; z: number } => {
    const pts = d.points ?? [];
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
    };
  };
  let worstVertex = 0;
  for (const a of plan) {
    const ca = centroid(a);
    let best: InstanceDescriptor | null = null;
    let bestDist = Infinity;
    for (const b of stretched) {
      const cb = centroid(b);
      const dist = Math.hypot(ca.x - cb.x, ca.z - cb.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    assert.ok(best !== null && bestDist < tolerance, `a plan-view cell has no twin within ${tolerance} (nearest ${bestDist})`);
    assert.equal(best.points?.length, a.points?.length, 'the twin has the same ring');
    for (const p of a.points ?? []) {
      let nearest = Infinity;
      for (const q of best.points ?? []) nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.z - q.z));
      worstVertex = Math.max(worstVertex, nearest);
    }
  }
  assert.ok(worstVertex < tolerance, `worst vertex deviation ${worstVertex} against ${tolerance}`);
  // And it is not vacuous: the agreement is far tighter than the thing it distinguishes — a
  // cell of the shipped mesh is >= 8.66 units across.
  assert.ok(worstVertex > 0, 'two independent routes agreeing to the bit would mean one is the other');
  const a = groundDepth(plan);
  const b = groundDepth(stretched);
  assert.ok(Math.abs(a.w - b.w) < tolerance && Math.abs(a.d - b.d) < 2 * tolerance);
});

test('the map footprint IS the canopy page’s stream; the true footprint is that stream unprojected — and both memoise', () => {
  const size = crowdSize('one');
  const map = footprintDescriptors('map', size);
  const tru = footprintDescriptors('true', size);
  assert.equal(footprintDescriptors('map', size), map, 'memoised');
  assert.equal(footprintDescriptors('true', size), tru, 'memoised');
  assert.equal(map.length, tru.length);
  // The stream carries more than cells — the strips and blooms go through the same unprojection.
  assert.ok(map.some((d) => d.kind === 'trail-strip'), 'the stream carries strips');
  assert.ok(map.some((d) => d.kind === 'uat-bloom'), 'the stream carries signatures');
  const stretch = 1 / groundFlattening();
  for (const [i, d] of tru.entries()) {
    assert.equal(d.kind, map[i]!.kind);
    assert.ok(Math.abs(d.transform.z - map[i]!.transform.z * stretch) < 1e-9);
  }
  assert.equal(footprintCells('map', size).length, cells(map).length);
  assert.ok(footprintCells('true', size).every((d) => d.kind === 'cell-ground'));
});

test('⚠ the control looks along the SHIPPED crowd camera — the same direction, measured, not assumed', () => {
  assert.deepEqual(shippedCameraAgreement(), []);
  const ours = viewDirectionOf(elevatedCamera({ x: 0, z: 0 }, 1, SHIPPED_ELEVATION_DEG));
  const theirs = viewDirectionOf(orientedCamera({ x: 0, z: 0 }, 1));
  assert.ok(ours.distanceTo(theirs) < 1e-9);
  // And a different rung looks along a different direction, at exactly its own elevation.
  for (const e of ELEVATION_LADDER) {
    const dir = viewDirectionOf(elevatedCamera({ x: 0, z: 0 }, 1, e));
    const got = (Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 180) / Math.PI;
    assert.ok(Math.abs(got - e) < 1e-9, `${e}° camera looks down at ${got}°`);
    assert.ok(Math.abs(dir.x) < 1e-12, 'azimuth fixed at +z, like frameWorld');
  }
});

test('screenExtent foreshortens ground depth by sin(elevation) and leaves width alone; the fit binds on the tighter side', () => {
  // A flat 200 × 100 rectangle on the ground, centred on the origin.
  const pts: number[] = [];
  for (const x of [-100, 100]) for (const z of [-50, 50]) pts.push(x, 0, z);
  for (const e of ELEVATION_LADDER) {
    const ext = screenExtent(pts, elevatedCamera({ x: 0, z: 0 }, 1, e));
    assert.ok(Math.abs(ext.w - 200) < 1e-9);
    assert.ok(Math.abs(ext.h - 100 * Math.sin((e * Math.PI) / 180)) < 1e-9, `${e}°: h ${ext.h}`);
  }
  // The fit: 2560×1600 buffer, the rectangle is width-bound (240 > 1.6 × (50 sin e + 40)).
  const fit45 = fitPxPerUnitFor(pts, 45);
  assert.ok(Math.abs(fit45 - 2560 / 2 / (100 + FIT_MARGIN)) < 1e-9);
  // A deep rectangle is height-bound, and a higher camera makes it MORE so — the deep footprint's
  // fitted view shrinks as the camera rises, which is what the forest's fit rows show.
  const deep: number[] = [];
  for (const x of [-100, 100]) for (const z of [-400, 400]) deep.push(x, 0, z);
  const d45 = fitPxPerUnitFor(deep, 45);
  const d60 = fitPxPerUnitFor(deep, 60);
  assert.ok(Math.abs(d45 - 1600 / 2 / (400 * Math.SQRT1_2 + FIT_MARGIN)) < 1e-9);
  assert.ok(d60 < d45);
});

test('a pine stands 18 units and its delivered height is cos(elevation) of that — a higher camera costs the trees', () => {
  assert.ok(Math.abs(deliveredPineHeightPx(45, 8) - 18 * Math.SQRT1_2 * 8) < 1e-9);
  assert.ok(Math.abs(deliveredPineHeightPx(60, 8) - 18 * 0.5 * 8) < 1e-9);
  assert.ok(deliveredPineHeightPx(60, 8) < deliveredPineHeightPx(50, 8));
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
  const box = landBox(buf, w, h, bg);
  assert.deepEqual(box, { w: 4, h: 2, x0: 1, y0: 1, pixels: 3 });
  // Alpha mode: only opaque pixels count.
  const alpha = new Uint8ClampedArray(w * h * 4);
  alpha[(2 * w + 3) * 4 + 3] = 255;
  alpha[(3 * w + 5) * 4 + 3] = 255;
  alpha[(0 * w + 0) * 4 + 3] = 100; // below the 128 bar — transparent
  assert.deepEqual(landBox(alpha, w, h, null), { w: 3, h: 2, x0: 3, y0: 2, pixels: 2 });
  assert.deepEqual(landBox(new Uint8ClampedArray(w * h * 4), w, h, null), { w: 0, h: 0, x0: 0, y0: 0, pixels: 0 });
});

test('⚠ every arm is built by the shipped composition root, and the page assembles no scene of its own', () => {
  const page = source('shipped-camera-scene.ts');
  assert.ok(/shippedGroundBuild\(/.test(page), 'the ground is the builder’s');
  assert.ok(/dressMapWithCover\(footprintDescriptors\(footprint, size\), \{\s*relief: LAND_RELIEF_AMPLITUDE,\s*footprint: KIT_FOOTPRINTS_2026_08_29,\s*\}\)/.test(page), 'the dressing is the canvas’s own call');
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  assert.ok(!/shoreRelief\(/.test(page), 'the shore fall is the builder’s');
  assert.ok(!/buildAtlasOcclusion\(/.test(page), 'the occlusion field is the builder’s');
  assert.ok(!/dressGroves\(|dressCover\(/.test(page), 'the props are placed by map-dressing, never re-derived here');
  // No frame cost: the increment says the angle is not a layer.
  assert.ok(!/TIME_ELAPSED_EXT|gpuMsPerFrame/.test(page), 'no frame-cost instrument on this page');
  // The pick is not made here: nothing in src/ is written and no constant is shipped.
  assert.ok(!/SHIPPED_CAMERA_ARM|SHIPPED_PICK/.test(page), 'no shipped pick on a page whose row closes on the owner');
});
