// shipped-detail-scene.test.ts — the detail page's arms, its ground, and the prop-mask arithmetic,
// proved without a GPU.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { KIT_PROP_INDIRECT_FRACTION, PROP_INDIRECT_FRACTION_RUNGS } from '../src/prop-lighting.js';
import { KIT_ASSET_URL } from './kit-scene.js';
import {
  CONTROL_ARM,
  CROWN_ARMS,
  DETAIL_ARMS,
  DETAIL_ARM_CAPTION,
  DETAIL_ARM_FRACTION,
  DETAIL_ARM_KIT,
  DETAIL_PICTURE_ZOOMS,
  DETAIL_SIZES,
  DETAIL_ZOOMS,
  DRESSED_ARMS,
  KIT_128_URL,
  MASK_ARM,
  SHIPPED_DETAIL_ARM,
  dataSlotsOf,
  kitFacts,
  leanerArm,
  lumaOf,
  percentileOf,
  propMaskStats,
} from './shipped-detail-scene.js';
import { FIT_ZOOM } from './shipped-crowd-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

test('every arm stands on the SHIPPED grove arm’s ground, from the canopy page’s own builder, and builds no scene of its own', () => {
  const page = source('shipped-detail-scene.ts');
  assert.ok(/canopyGroundBuild\(SHIPPED_GROVE_ARM, size\)/.test(page), 'the ground is the shipped grove arm’s');
  assert.ok(/armPlacements\(SHIPPED_GROVE_ARM, size\)/.test(page), 'the placements are the shipped grove arm’s');
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  assert.ok(!/shoreRelief\(/.test(page), 'the shore fall is the builder’s');
  assert.ok(!/buildAtlasOcclusion\(/.test(page), 'the occlusion field is the builder’s');
  assert.ok(!/dressMapWithGroves\(/.test(page) && !/dressGroves\(/.test(page), 'the placement is memoised upstream, never re-derived here');
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
});

test('six arms: the mask first, the control is today’s 128-texel kit at the ladder floor, every arm captioned', () => {
  assert.equal(DETAIL_ARMS.length, 6);
  assert.equal(DETAIL_ARMS[0], MASK_ARM);
  assert.equal(MASK_ARM, 'bare');
  assert.equal(CONTROL_ARM, 'texture-128');
  assert.equal(DETAIL_ARM_KIT[CONTROL_ARM], KIT_128_URL);
  assert.equal(DETAIL_ARM_FRACTION[CONTROL_ARM], KIT_PROP_INDIRECT_FRACTION);
  assert.equal(DETAIL_ARM_KIT[MASK_ARM], null);
  assert.equal(DETAIL_ARM_FRACTION[MASK_ARM], null);
  for (const arm of DETAIL_ARMS) {
    assert.ok(DETAIL_ARM_CAPTION[arm].length > 20, `${arm} is captioned`);
    assert.equal(DETAIL_ARM_KIT[arm] === null, DETAIL_ARM_FRACTION[arm] === null, `${arm}: a kit and a fraction go together`);
  }
  assert.notEqual(KIT_128_URL, KIT_ASSET_URL, 'the control parses a DIFFERENT file from the shipped kit');
});

test('the crown ladder is the native kit at every rung of PROP_INDIRECT_FRACTION_RUNGS, floor first', () => {
  assert.equal(CROWN_ARMS.length, PROP_INDIRECT_FRACTION_RUNGS.length);
  for (const [i, arm] of CROWN_ARMS.entries()) {
    assert.equal(DETAIL_ARM_KIT[arm], KIT_ASSET_URL, `${arm} parses the shipped (native) kit`);
    assert.equal(DETAIL_ARM_FRACTION[arm], PROP_INDIRECT_FRACTION_RUNGS[i], `${arm} sits on rung ${i}`);
  }
  assert.equal(CROWN_ARMS[0], 'texture-native');
  assert.deepEqual(DRESSED_ARMS, DETAIL_ARMS.filter((a) => a !== MASK_ARM));
});

test('⚠ the shipped pick is on the ladder, and its fraction IS the constant the shipped map reads', () => {
  assert.ok(CROWN_ARMS.includes(SHIPPED_DETAIL_ARM), 'the pick is a rendered rung');
  assert.equal(DETAIL_ARM_FRACTION[SHIPPED_DETAIL_ARM], KIT_PROP_INDIRECT_FRACTION, 'the page and src/prop-lighting.ts agree');
  assert.equal(DETAIL_ARM_KIT[SHIPPED_DETAIL_ARM], KIT_ASSET_URL);
});

test('leanerArm walks the ladder one rung up and answers null at the floor and off the ladder', () => {
  assert.equal(leanerArm('texture-native'), null);
  assert.equal(leanerArm('crown-60'), 'texture-native');
  assert.equal(leanerArm('crown-45'), 'crown-60');
  assert.equal(leanerArm('crown-30'), 'crown-45');
  assert.equal(leanerArm('bare'), null);
  assert.equal(leanerArm('texture-128'), null);
});

test('both sizes, the read zoom and the fitted view', () => {
  assert.deepEqual(
    DETAIL_SIZES.map((s) => s.id),
    ['one', 'forest'],
  );
  assert.deepEqual(DETAIL_ZOOMS, [8]);
  assert.deepEqual(DETAIL_PICTURE_ZOOMS, [8, FIT_ZOOM]);
});

/** A frame of `n` RGBA pixels, every one `rgb`. */
function frame(n: number, rgb: readonly [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

test('the prop mask is exactly the pixels that differ from the mask arm, with no threshold', () => {
  const mask = frame(10, [40, 80, 40]);
  const arm = frame(10, [40, 80, 40]);
  // three prop pixels: one dark, one mid, one one-byte-off (still a prop pixel — no threshold)
  arm.set([10, 10, 10, 255], 0);
  arm.set([120, 120, 120, 255], 4);
  arm.set([40, 81, 40, 255], 8);
  const stats = propMaskStats(arm, mask);
  assert.equal(stats.pixels, 3);
  const lumas = [lumaOf(10, 10, 10), lumaOf(120, 120, 120), lumaOf(40, 81, 40)].sort((a, b) => a - b);
  assert.ok(Math.abs(stats.meanLuma - (lumas[0]! + lumas[1]! + lumas[2]!) / 3) < 1e-9);
  assert.equal(stats.p10, Math.round(lumas[0]!));
  assert.equal(stats.p50, Math.round(lumas[1]!));
  assert.equal(stats.p90, Math.round(lumas[2]!));
  assert.equal(stats.spread, stats.p90 - stats.p10);
});

test('an arm identical to the mask has NO prop pixels and reports zeros, never NaN', () => {
  const mask = frame(5, [1, 2, 3]);
  assert.deepEqual(propMaskStats(frame(5, [1, 2, 3]), mask), { pixels: 0, meanLuma: 0, p10: 0, p50: 0, p90: 0, spread: 0 });
});

test('two frames of different sizes are refused rather than compared as far as the shorter goes', () => {
  assert.throws(() => propMaskStats(frame(4, [0, 0, 0]), frame(5, [0, 0, 0])), /different frames/);
});

test('a percentile is the smallest bin at which the cumulative count reaches the quantile', () => {
  const bins = new Uint32Array(256);
  bins[10] = 5;
  bins[100] = 5;
  bins[200] = 10;
  assert.equal(percentileOf(bins, 20, 0.1), 10);
  assert.equal(percentileOf(bins, 20, 0.25), 10);
  assert.equal(percentileOf(bins, 20, 0.5), 100);
  assert.equal(percentileOf(bins, 20, 0.9), 200);
  assert.equal(percentileOf(bins, 20, 1), 200);
  assert.equal(percentileOf(new Uint32Array(256), 0, 0.5), 255, 'an empty histogram answers the top bin');
});

test('luma is Rec. 709 — green weighs most, and white is 255', () => {
  assert.ok(Math.abs(lumaOf(255, 255, 255) - 255) < 1e-9);
  assert.ok(lumaOf(0, 100, 0) > lumaOf(100, 0, 0));
  assert.ok(lumaOf(100, 0, 0) > lumaOf(0, 0, 100));
});

test('the kit facts name the data slots the textures carry, and the distinct texture edges, sorted', () => {
  const kit = {
    textures: [
      { name: 'map:Pine_Branches', width: 2048, height: 2048 },
      { name: 'normalMap:Pine_Branches', width: 2048, height: 2048 },
      { name: 'roughnessMap:Pine_Trunks', width: 128, height: 128 },
      { name: 'metalnessMap:Pine_Trunks', width: 128, height: 128 },
      { name: 'map:Pine_Trunks', width: 512, height: 256 },
    ],
  };
  assert.deepEqual(dataSlotsOf(kit), ['metalnessMap', 'normalMap', 'roughnessMap']);
  assert.deepEqual(dataSlotsOf({ textures: [] }), []);
  const facts = kitFacts(
    { ...kit, assemblies: new Map(), materials: [], leafMeans: new Map(), triangles: 7, wireBytes: 99, gpuBytes: 1234 },
    '/assets/x.glb',
    42,
  );
  assert.deepEqual(facts, {
    url: '/assets/x.glb',
    wireBytes: 99,
    gpuBytes: 1234,
    textures: 5,
    textureEdges: [128, 512, 2048],
    dataSlots: ['metalnessMap', 'normalMap', 'roughnessMap'],
    triangles: 7,
    loadMs: 42,
  });
});
