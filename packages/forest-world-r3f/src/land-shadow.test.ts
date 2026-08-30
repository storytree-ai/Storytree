// land-shadow.test.ts — the cast shadow's geometry, proved without a browser.
//
// Every assertion here is about WHERE the shadow falls and HOW LONG it is, which are the two
// things a plausible-looking wrong picture gets wrong silently. A shadow thrown TOWARD the light
// instead of away from it looks completely normal until you notice the whole island is lit from
// the wrong side, and this arc has already paid for one render on exactly that class of sign
// error.
//
// ⚠ IT LIVES BESIDE THE MODULE IN `src/` BECAUSE THAT IS WHERE THE MODULE LIVES NOW, and the
// mutation rung mutates a project's `src/` only. When the relief crossed, its tests stayed in
// `harness/` and the rung came back with three survivors and four uncovered lines — the sharpest
// of them the wave table itself, which could be emptied for a perfectly flat land in silence
// (`crossing-a-module-into-src-reds-two-rungs`).
//
// The tests that need the harness's own island fixture, its plant descriptors or its terrain
// march stayed behind in `harness/land-shadow.test.ts`. A `src/` test cannot import `harness/` —
// `scope-fence.test.ts` refuses it, and the synced public copy would carry a dangling import.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LAND_RELIEF_AMPLITUDE, landHeight } from './land-relief.js';
import { LIGHT_DIRECTION } from './shade-ladder.js';
import {
  OCCLUSION_PAD,
  SHADOW_GRES,
  SHADOW_PENUMBRA,
  SHADOW_TEXTURE_MAX,
  assertTerrainDoesNotSelfShadow,
  buildCanopyShadowField,
  emptyField,
  lightSlope,
  maxTerrainCast,
  maxTerrainSlope,
  occlusionGres,
  occlusionGrid,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  terrainSelfShadows,
  type ShadowCaster,
} from './land-shadow.js';

const BOUNDS = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

test('the shadow points AWAY from the light, and is derived from the ONE authored direction', () => {
  const dir = shadowDirection();
  assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-9, 'not a unit vector');
  // The sign check that matters. Getting this backwards is invisible in code review and produces
  // a picture that is lit and shaded in exactly the wrong places while looking entirely plausible.
  assert.ok(dir.x * LIGHT_DIRECTION.x + dir.z * LIGHT_DIRECTION.z < 0, 'shadow points at the light');
  const ground = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z);
  assert.ok(Math.abs(dir.x + LIGHT_DIRECTION.x / ground) < 1e-12);
  assert.ok(Math.abs(dir.z + LIGHT_DIRECTION.z / ground) < 1e-12);
});

test('shadow length per unit of height is cot(the light’s elevation) — 0.6952, not something adjacent', () => {
  const per = shadowOffsetPerUnitHeight();
  assert.ok(Math.abs(per - 0.6952) < 0.0005, `offset per unit height moved: ${per}`);
  // And it is the exact reciprocal of the light's slope: the two are the same fact read two ways,
  // so a mutant that changes one and not the other cannot survive both assertions.
  assert.ok(Math.abs(per * lightSlope() - 1) < 1e-12);
});

test('the light climbs 1.438 units per ground unit — 55.2 degrees above the horizon', () => {
  const slope = lightSlope();
  assert.ok(Math.abs(slope - 1.4382) < 0.0005, `light slope moved: ${slope}`);
  assert.ok(Math.abs((Math.atan(slope) * 180) / Math.PI - 55.2) < 0.1);
});

test('THE FINDING: at the SHIPPED amplitude the land cannot shadow itself AT ALL', () => {
  // Not small — zero. The relief's steepest slope is nowhere near the light's, so the terrain
  // term contributes nothing to any shipped frame, which is why it did not cross.
  const peak = maxTerrainSlope(LAND_RELIEF_AMPLITUDE);
  assert.ok(Math.abs(peak - 0.455) < 0.005, `peak slope moved: ${peak}`);
  assert.ok(peak < lightSlope());
  assert.equal(terrainSelfShadows(LAND_RELIEF_AMPLITUDE), false);
  assert.doesNotThrow(() => assertTerrainDoesNotSelfShadow());
});

test('NON-VACUITY: a steep enough land DOES self-shadow, and the fence then fires', () => {
  // Without this, the finding above is equally satisfied by a predicate that always returns false
  // and an assertion that never throws. Peak slope is linear in amplitude (~0.207 per unit), so
  // the amplitude that reaches the light is about 7 — more than three times what ships.
  assert.equal(terrainSelfShadows(12), true);
  assert.throws(() => assertTerrainDoesNotSelfShadow(12), /shadows itself/);
  assert.ok(maxTerrainSlope(4.4) > maxTerrainSlope(2.2), 'peak slope must grow with amplitude');
});

test('the terrain cast bound grows with amplitude and is zero on flat land', () => {
  assert.equal(maxTerrainCast(0), 0);
  assert.ok(maxTerrainCast(2.2) > 0);
  assert.ok(maxTerrainCast(4.4) > maxTerrainCast(2.2));
});

test('the grid pads the bounds, is sized at the declared resolution, and is shared', () => {
  const grid = occlusionGrid(BOUNDS);
  assert.equal(OCCLUSION_PAD, 2);
  assert.equal(SHADOW_GRES, 3);
  assert.equal(grid.minX, BOUNDS.minX - OCCLUSION_PAD);
  assert.equal(grid.minZ, BOUNDS.minZ - OCCLUSION_PAD);
  assert.equal(grid.gres, SHADOW_GRES);
  // 80 units + 2 x 2 pad, at 3 samples per unit.
  assert.equal(grid.w, 252);
  assert.equal(grid.h, 252);
  // The island the studio ships, so the number in the evidence is the one a test holds.
  const island = occlusionGrid({ minX: -116.9, maxX: 116.9, minZ: -23.1, maxZ: 23.1 });
  assert.equal(island.w, 714);
  assert.equal(island.h, 151);
  assert.equal(island.w * island.h, 107814);
});

test('THE PAYLOAD FENCE: a huge scene coarsens rather than allocating a 36 MB texture', () => {
  const wide = { minX: -1500, maxX: 1500, minZ: -1500, maxZ: 1500 };
  const gres = occlusionGres(wide);
  assert.ok(gres < SHADOW_GRES, 'a 3000-unit span must not be sampled at full resolution');
  const grid = occlusionGrid(wide);
  assert.ok(grid.w <= SHADOW_TEXTURE_MAX, `w ${grid.w} exceeds the texture cap`);
  assert.ok(grid.h <= SHADOW_TEXTURE_MAX, `h ${grid.h} exceeds the texture cap`);
  // NON-VACUITY: one island is nowhere near the cap, so the clamp is not simply always on.
  assert.equal(occlusionGres(BOUNDS), SHADOW_GRES);
});

test('an empty field is the right size and identically zero', () => {
  const field = emptyField(occlusionGrid(BOUNDS));
  assert.equal(field.data.length, field.w * field.h);
  assert.equal(shadowCoverage(field), 0);
  assert.ok(field.data.every((v) => v === 0));
});

test('FLAT land with no casters is unshadowed — the control that keeps every other test honest', () => {
  const field = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [] });
  assert.equal(shadowCoverage(field), 0);
  // And with the relief on, still nothing: the terrain term is not in this function at all.
  const relieved = buildCanopyShadowField({ bounds: BOUNDS, relief: 12, casters: [] });
  assert.equal(shadowCoverage(relieved), 0);
});

test('a single caster on FLAT land throws its shadow the analytic distance, in the right place', () => {
  const caster: ShadowCaster = { x: 0, z: 0, radius: 2, height: 10 };
  const field = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [caster] });
  const dir = shadowDirection();
  const reach = caster.height * shadowOffsetPerUnitHeight();
  // Just inside the tip: shadowed. Well past it: not.
  const inX = dir.x * reach * 0.9;
  const inZ = dir.z * reach * 0.9;
  assert.ok(sampleShadowField(field, inX, inZ) > 0.5, 'the shadow does not reach its own tip');
  const outX = dir.x * reach * 1.4;
  const outZ = dir.z * reach * 1.4;
  assert.ok(sampleShadowField(field, outX, outZ) < 0.5, 'the shadow overshoots its analytic tip');
  // TOWARD the light there is never a shadow, whatever the caster.
  assert.equal(sampleShadowField(field, -dir.x * 6, -dir.z * 6), 0);
});

test('a taller caster throws a proportionally longer shadow', () => {
  const short = buildCanopyShadowField({
    bounds: BOUNDS,
    relief: 0,
    casters: [{ x: 0, z: 0, radius: 2, height: 6 }],
  });
  const tall = buildCanopyShadowField({
    bounds: BOUNDS,
    relief: 0,
    casters: [{ x: 0, z: 0, radius: 2, height: 18 }],
  });
  assert.ok(shadowCoverage(tall) > shadowCoverage(short) * 2, 'height must lengthen the shadow');
  const dir = shadowDirection();
  const far = 12 * shadowOffsetPerUnitHeight();
  assert.equal(sampleShadowField(short, dir.x * far, dir.z * far), 0);
  assert.ok(sampleShadowField(tall, dir.x * far, dir.z * far) > 0.5);
});

test('the penumbra softens the EDGE and nothing else — the core is fully occluded', () => {
  assert.equal(SHADOW_PENUMBRA, 1.2);
  const caster: ShadowCaster = { x: 0, z: 0, radius: 4, height: 10 };
  const field = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [caster] });
  const dir = shadowDirection();
  const alongX = dir.x * 4;
  const alongZ = dir.z * 4;
  // On the axis, well inside the radius: full occlusion.
  assert.ok(sampleShadowField(field, alongX, alongZ) > 0.95);
  // Across the shadow, past the radius but inside the penumbra: partial.
  const acrossX = alongX + -dir.z * (caster.radius + SHADOW_PENUMBRA * 0.5);
  const acrossZ = alongZ + dir.x * (caster.radius + SHADOW_PENUMBRA * 0.5);
  const edge = sampleShadowField(field, acrossX, acrossZ);
  assert.ok(edge > 0 && edge < 1, `the edge should be soft, got ${edge}`);
});

test('two casters take the GREATER occlusion — a stack never doubles into a slab', () => {
  const a: ShadowCaster = { x: 0, z: 0, radius: 3, height: 10 };
  const b: ShadowCaster = { x: 1, z: 1, radius: 3, height: 10 };
  const both = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [a, b] });
  assert.ok(both.data.every((v) => v <= 255));
  const dir = shadowDirection();
  assert.ok(sampleShadowField(both, dir.x * 3, dir.z * 3) <= 1);
});

test('the relief moves the shadow — the ground it lands on is part of the answer', () => {
  const caster: ShadowCaster = { x: 0, z: 0, radius: 2, height: 10 };
  const flat = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [caster] });
  const hilly = buildCanopyShadowField({ bounds: BOUNDS, relief: 8, casters: [caster] });
  assert.notEqual(shadowCoverage(flat), shadowCoverage(hilly));
  // And the relief really is the field this module reads, not a number it ignores.
  assert.notEqual(landHeight(3, 3, 8), landHeight(3, 3, 0));
});

test('sampling is bilinear, exact at texel centres, and clamps outside the field', () => {
  const grid = occlusionGrid(BOUNDS);
  const field = emptyField(grid);
  const at = (i: number, j: number): number => j * field.w + i;
  field.data[at(10, 10)] = 255;
  field.data[at(11, 10)] = 255;
  field.data[at(10, 11)] = 255;
  field.data[at(11, 11)] = 255;
  const x = grid.minX + 10 / grid.gres;
  const z = grid.minZ + 10 / grid.gres;
  assert.ok(Math.abs(sampleShadowField(field, x, z) - 1) < 1e-9, 'exact at a texel centre');
  // Halfway to a zero neighbour: half.
  const half = sampleShadowField(field, x - 0.5 / grid.gres, z);
  assert.ok(Math.abs(half - 0.5) < 1e-6, `bilinear midpoint was ${half}`);
  // Far outside: clamped to the edge texel, not an out-of-bounds read.
  assert.equal(sampleShadowField(field, -1e6, -1e6), 0);
  assert.equal(sampleShadowField(field, 1e6, 1e6), 0);
});

test('coverage is a FRACTION past the material’s own 0.5 threshold', () => {
  const grid = occlusionGrid(BOUNDS);
  const field = emptyField(grid);
  const total = field.data.length;
  for (let i = 0; i < total / 4; i += 1) field.data[i] = 255;
  assert.ok(Math.abs(shadowCoverage(field) - 0.25) < 1e-9);
  // The threshold is the material's, and a value at it does not count — the shader tests `> 0.5`.
  const halfLit = emptyField(grid);
  halfLit.data.fill(128);
  assert.equal(shadowCoverage(halfLit, 0.9), 0);
  assert.equal(shadowCoverage(halfLit, 0.4), 1);
});
