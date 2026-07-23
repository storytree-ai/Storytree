// crown-recolor.test.ts — the crown recolour is offline-provable on a synthetic tree: a green crown block
// over a brown trunk over a transparent field. Only the crown is recoloured (target hue, kept lightness);
// trunk, transparent field and the silhouette (alpha) are untouched.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { RgbaImage } from './cutout.js';
import {
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  isCrownPixel,
  recolorCrown,
  countCrownPixels,
  TREE_STATUS_PALETTE,
} from './crown-recolor.js';

const GREEN: [number, number, number] = [90, 164, 110]; // ≈ #5aa46e, a lush crown
const BROWN: [number, number, number] = [110, 74, 42]; // a warm timber trunk
const GREY: [number, number, number] = [128, 128, 128]; // a neutral ground shadow

/** A 10×14 tree: transparent field, a green crown block (rows 0-8), a brown trunk (rows 9-13, cols 4-5). */
function treeRaster(): RgbaImage {
  const w = 10;
  const h = 14;
  const data = new Uint8Array(w * h * 4); // all zero → fully transparent
  const set = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    const o = (y * w + x) * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  };
  for (let y = 0; y <= 8; y++) for (let x = 2; x <= 7; x++) set(x, y, GREEN);
  for (let y = 9; y <= 13; y++) for (let x = 4; x <= 5; x++) set(x, y, BROWN);
  return { width: w, height: h, data };
}

test('hexToRgb parses #rrggbb and #rgb', () => {
  assert.deepEqual(hexToRgb('#5aa46e'), { r: 90, g: 164, b: 110 });
  assert.deepEqual(hexToRgb('5aa46e'), { r: 90, g: 164, b: 110 });
  assert.deepEqual(hexToRgb('#0f0'), { r: 0, g: 255, b: 0 });
  assert.throws(() => hexToRgb('nope'), /not a hex/);
});

test('rgb↔hsl round-trips within rounding', () => {
  for (const c of [GREEN, BROWN, [200, 40, 40] as [number, number, number]]) {
    const back = hslToRgb(rgbToHsl({ r: c[0], g: c[1], b: c[2] }));
    assert.ok(Math.abs(back.r - c[0]) <= 2 && Math.abs(back.g - c[1]) <= 2 && Math.abs(back.b - c[2]) <= 2);
  }
});

test('isCrownPixel accepts green foliage, rejects brown trunk / grey shadow / transparent', () => {
  assert.equal(isCrownPixel(GREEN[0], GREEN[1], GREEN[2], 255), true);
  assert.equal(isCrownPixel(BROWN[0], BROWN[1], BROWN[2], 255), false, 'brown trunk is not crown');
  assert.equal(isCrownPixel(GREY[0], GREY[1], GREY[2], 255), false, 'grey shadow is not crown');
  assert.equal(isCrownPixel(GREEN[0], GREEN[1], GREEN[2], 0), false, 'transparent is not crown');
});

test('recolorCrown recolours the crown to the target hue, leaving trunk + alpha + field untouched', () => {
  const tree = treeRaster();
  const out = recolorCrown(tree, '#b05a48'); // muted brick-red (unhealthy)
  const w = out.width;
  const px = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    return { r: out.data[o]!, g: out.data[o + 1]!, b: out.data[o + 2]!, a: out.data[o + 3]! };
  };
  // a crown pixel is now red-dominant (was green-dominant) and still opaque
  const crown = px(4, 4);
  assert.ok(crown.r > crown.g && crown.r > crown.b, 'crown recoloured toward red');
  assert.equal(crown.a, 255, 'crown alpha (silhouette) unchanged');
  // a trunk pixel is byte-identical
  const trunk = px(4, 11);
  assert.deepEqual([trunk.r, trunk.g, trunk.b], BROWN, 'trunk untouched');
  // a transparent field pixel is still fully transparent
  assert.equal(px(0, 0).a, 0, 'transparent field untouched');
});

test('recolorCrown preserves crown texture (per-pixel lightness variation survives)', () => {
  const tree = treeRaster();
  // darken one crown pixel so the crown has a light/dark variation to preserve
  const darkIdx = (2 * tree.width + 3) * 4;
  tree.data[darkIdx] = 40;
  tree.data[darkIdx + 1] = 80;
  tree.data[darkIdx + 2] = 55;
  const out = recolorCrown(tree, '#b05a48');
  const lightO = (4 * out.width + 4) * 4;
  const darkO = (2 * out.width + 3) * 4;
  const lum = (o: number) => 0.3 * out.data[o]! + 0.59 * out.data[o + 1]! + 0.11 * out.data[o + 2]!;
  assert.ok(lum(darkO) < lum(lightO), 'the darker crown pixel stays darker after recolour (texture kept)');
});

test('recolorCrown fails closed when the master has no green crown', () => {
  const w = 6;
  const h = 6;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = BROWN[0];
    data[i * 4 + 1] = BROWN[1];
    data[i * 4 + 2] = BROWN[2];
    data[i * 4 + 3] = 255;
  }
  assert.throws(() => recolorCrown({ width: w, height: h, data }, '#b05a48'), /no crown pixels/);
});

test('countCrownPixels counts the crown block (60 px) of the synthetic tree', () => {
  // crown block is rows 0-8 (9 rows) × cols 2-7 (6 cols) = 54 px
  assert.equal(countCrownPixels(treeRaster()), 54);
});

test('the palette is the five ADR-0227 statuses with valid hexes', () => {
  const statuses = TREE_STATUS_PALETTE.map((p) => p.status);
  assert.deepEqual(statuses, ['healthy', 'unhealthy', 'proposed', 'mapped', 'unknown']);
  for (const { hex } of TREE_STATUS_PALETTE) assert.doesNotThrow(() => hexToRgb(hex));
  assert.equal(TREE_STATUS_PALETTE.find((p) => p.status === 'healthy')?.hex, '#5aa46e');
});
