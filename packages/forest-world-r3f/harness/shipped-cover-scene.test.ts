// shipped-cover-scene.test.ts — the cover page's arms, its ground, and the two width readings,
// proved without a GPU.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { COVER_SIZE, COVER_SIZE_RUNGS } from '../src/cover-dressing.js';
import { KIT_FOOTPRINTS_2026_08_29, KIT_ROLE_SIZE, type KitPlacement } from '../src/kit-vocabulary.js';
import {
  CONTROL_ARM,
  COVER_ARMS,
  COVER_ARM_CAPTION,
  COVER_ARM_SIZE,
  COVER_LADDER,
  COVER_PICTURE_ZOOMS,
  COVER_SIZES,
  COVER_ZOOMS,
  DRESSED_ARMS,
  MASK_ARM,
  SHIPPED_COVER_ARM,
  coverCensus,
  leanerArm,
  widestCoverWidth,
  widestFlowerPatchWidth,
} from './shipped-cover-scene.js';
import { FIT_ZOOM } from './shipped-crowd-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

const placed = (role: KitPlacement['role'], scale: number): KitPlacement => ({
  role,
  assembly: 'plant-a',
  capId: 'cover',
  tint: null,
  at: { x: 0, z: 0 },
  y: 0,
  yaw: 0,
  scale,
});

test('every arm stands on the SHIPPED casting arm’s ground, from the canopy module’s own builder, and builds no scene of its own', () => {
  const page = source('shipped-cover-scene.ts');
  assert.ok(/canopyGroundBuild\(SHIPPED_CANOPY_ARM, size\)/.test(page), 'the ground is the shipped casting arm’s');
  assert.ok(!/const input: CellGroundGeometryInput/.test(page), 'no geometry input of its own');
  assert.ok(!/clipToCoast\(/.test(page), 'the coast clip is the builder’s');
  assert.ok(!/shoreRelief\(/.test(page), 'the shore fall is the builder’s');
  assert.ok(!/buildAtlasOcclusion\(/.test(page), 'the occlusion field is the builder’s');
  assert.ok(!/dressGroves\(|grove-history|grove-dressing/.test(page), 'no grove reaches this page (ADR-0518)');
  assert.ok(/coverDensity: COVER_DENSITY_RUNGS\[0\]!/.test(page), 'the count is held at the recipe’s own, so only size moves here');
  assert.ok(/buildGroundMaterial\(build\.field, SHIPPED_GRASS, build\.shore\(\), SHIPPED_SAND_MIX, extras\)/.test(page));
  assert.ok(/configureExactColour\(renderer\)/.test(page) && /calibrateLights\(renderer\)/.test(page));
});

test('five arms: the mask first, the control is TODAY’s canopy, every arm captioned', () => {
  assert.equal(COVER_ARMS.length, 5);
  assert.equal(COVER_ARMS[0], MASK_ARM);
  assert.equal(MASK_ARM, 'bare');
  assert.equal(CONTROL_ARM, 'canopy');
  // ⚠ THE CONTROL IS THE CANOPY, NOT THE BARE GROUND, and the distinction is the whole point of
  // this page: the question is what the COVER adds to the map that already ships, not what the
  // whole kit adds to bare land. Reading it against `bare` would credit the trees to this row.
  assert.equal(COVER_ARM_SIZE[CONTROL_ARM], null, 'the control wears cover');
  assert.equal(COVER_ARM_SIZE[MASK_ARM], null, 'the mask wears cover');
  for (const arm of COVER_ARMS) {
    assert.ok((COVER_ARM_CAPTION[arm] ?? '').length > 30, `${arm} has no caption a reader could use`);
  }
  assert.deepEqual([...DRESSED_ARMS], COVER_ARMS.filter((a) => a !== MASK_ARM));
});

test('the ladder is COVER_SIZE_RUNGS in order, read from the constant and never restated', () => {
  assert.equal(COVER_LADDER.length, COVER_SIZE_RUNGS.length);
  for (const [i, arm] of COVER_LADDER.entries()) {
    assert.equal(COVER_ARM_SIZE[arm], COVER_SIZE_RUNGS[i], `${arm} is not rung ${i} of the ladder`);
  }
  // The page must not carry its own copy of the rungs — the whole reason a scale-back is two
  // constants is that the arms READ them.
  const page = source('shipped-cover-scene.ts');
  assert.ok(/COVER_SIZE_RUNGS\[0\]!/.test(page) && /COVER_SIZE_RUNGS\[2\]!/.test(page));
});

test('⚠ the shipped pick is ON the ladder, and its rung IS the constant the shipped map reads', () => {
  assert.ok(COVER_LADDER.includes(SHIPPED_COVER_ARM), 'the shipped arm is not a rung anybody was shown');
  assert.equal(COVER_ARM_SIZE[SHIPPED_COVER_ARM], COVER_SIZE, 'the shipped arm draws a rung the map does not stand');
});

test('leanerArm walks the ladder one rung down and answers null at the leanest and off the ladder', () => {
  assert.equal(leanerArm(COVER_LADDER[0]!), null);
  for (const [i, arm] of COVER_LADDER.entries()) {
    if (i === 0) continue;
    assert.equal(leanerArm(arm), COVER_LADDER[i - 1]);
  }
  assert.equal(leanerArm(MASK_ARM), null);
  assert.equal(leanerArm(CONTROL_ARM), null);
});

test('both sizes, the read zoom and the fitted view', () => {
  assert.deepEqual(
    COVER_SIZES.map((s) => s.id),
    ['one', 'forest'],
  );
  assert.deepEqual([...COVER_ZOOMS], [8]);
  assert.deepEqual([...COVER_PICTURE_ZOOMS], [8, FIT_ZOOM]);
});

test('the census counts only DRESSING roles as cover', () => {
  const list: KitPlacement[] = [
    { ...placed('tree', 1), capId: 'cap-a', assembly: 'pine-a' },
    { ...placed('tree', 1), capId: 'cap-b', assembly: 'pine-b' },
    { ...placed('bloom', 1), capId: 'cap-a', assembly: 'flower' },
    placed('bush', 1),
    placed('bush', 1),
    placed('tuft', 1),
  ];
  const c = coverCensus(list);
  assert.equal(c.objects, 6);
  assert.equal(c.cover, 3);
  assert.deepEqual(c.byRole, { bush: 2, tuft: 1 });
  // ⚠ AN EMPTY LIST REPORTS ZEROS RATHER THAN NOTHING — the mask arm goes through here.
  assert.deepEqual(coverCensus([]), { objects: 0, cover: 0, byRole: {} });
});

test('⚠⚠ THE TWO WIDTH READINGS ARE DIFFERENT QUESTIONS, and the marker’s bound is on the FLOWER one', () => {
  // The bound the row states is flower-against-flower: the marker stays "the only red flower and
  // the only one at its size". A BUSH at the boldest rung is wider than the marker and is not
  // confusable with it — and the driver's first run refused a perfectly good arm over a 3.4-unit
  // bush before this distinction existed, which would have scaled the whole layer back to protect
  // a claim nobody made.
  const foot = KIT_FOOTPRINTS_2026_08_29;
  const list = [placed('bush', 4), placed('flowerPatch', 1)];
  assert.ok(widestCoverWidth(list, foot) > widestFlowerPatchWidth(list, foot), 'the two readings cannot be the same number');
  assert.equal(widestCoverWidth(list, foot), foot.bush * 4);
  assert.equal(widestFlowerPatchWidth(list, foot), foot.flowerPatch);
  // A list with no flower reports zero rather than falling back to the widest prop — a fallback
  // would make the bound pass by measuring a bush.
  assert.equal(widestFlowerPatchWidth([placed('bush', 4)], foot), 0);
  // Neither reading counts a SCENE role: the bloom itself is not ground cover.
  const bloom = [{ ...placed('bloom', 1), assembly: 'flower' as const, capId: 'cap-a' }];
  assert.equal(widestCoverWidth(bloom, foot), 0);
  assert.equal(widestFlowerPatchWidth(bloom, foot), 0);
});

test('the flower patch stays under half the marker at EVERY rung, read through the page’s own function', () => {
  // The same claim `kit-vocabulary.test.ts` makes about the tables, made here about what the page
  // would actually DELIVER — so a rung added to the ladder fails on both surfaces.
  const foot = KIT_FOOTPRINTS_2026_08_29;
  const limit = KIT_ROLE_SIZE.bloom.units * 0.5;
  for (const rung of COVER_SIZE_RUNGS) {
    // The widest a patch can be drawn: its role width times the top of its scale range times the rung.
    const widest = widestFlowerPatchWidth([placed('flowerPatch', 1.304 * rung)], foot);
    assert.ok(widest < limit, `at rung ${rung} a flower patch reaches ${widest.toFixed(3)} against the bound ${limit}`);
  }
});
