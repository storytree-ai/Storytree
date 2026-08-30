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
  indices,
  occlusionGres,
  occlusionGrid,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  stampBox,
  span,
  cappedEdge,
  axisSpan,
  peakSlopeAt,
  PEAK_SLOPE_PER_UNIT_AMPLITUDE,
  terrainSelfShadows,
  type ShadowCaster,
  type ShadowField,
  type GroundBounds,
  type OcclusionGrid,
} from './land-shadow.js';

const BOUNDS = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

/**
 * The grid for a fixture, REFUSED if it is not the small one this file's numbers assume.
 *
 * ⚠⚠ IT IS A FAIL-FAST GUARD RATHER THAN AN EXTRA ASSERTION, and it is here because of how the
 * mutation rung scores a hang. A field over these fixtures is ten thousand samples; under a broken
 * resolution cap it is four million, and a suite that grinds through fifteen of those is reported
 * as a TIMEOUT — which `check:mutation-diff` counts as UNPROVEN, credited to no test, neither a
 * pass nor a survivor. Asked FIRST, a wrong grid is reported as a wrong grid.
 */
function smallGrid(bounds: GroundBounds): OcclusionGrid {
  const grid = occlusionGrid(bounds);
  assert.ok(
    grid.w <= 300 && grid.h <= 300,
    `this fixture's grid is ${grid.w}x${grid.h} — the resolution cap is not capping`,
  );
  return grid;
}


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
  smallGrid(BOUNDS);
  const field = emptyField(occlusionGrid(BOUNDS));
  assert.equal(field.data.length, field.w * field.h);
  assert.equal(shadowCoverage(field), 0);
  assert.ok(field.data.every((v) => v === 0));
});

test('FLAT land with no casters is unshadowed — the control that keeps every other test honest', () => {
  smallGrid(BOUNDS);
  const field = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [] });
  assert.equal(shadowCoverage(field), 0);
  // And with the relief on, still nothing: the terrain term is not in this function at all.
  const relieved = buildCanopyShadowField({ bounds: BOUNDS, relief: 12, casters: [] });
  assert.equal(shadowCoverage(relieved), 0);
});

test('a single caster on FLAT land throws its shadow the analytic distance, in the right place', () => {
  smallGrid(BOUNDS);
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
  smallGrid(BOUNDS);
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
  smallGrid(BOUNDS);
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
  smallGrid(BOUNDS);
  const a: ShadowCaster = { x: 0, z: 0, radius: 3, height: 10 };
  const b: ShadowCaster = { x: 1, z: 1, radius: 3, height: 10 };
  const both = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [a, b] });
  assert.ok(both.data.every((v) => v <= 255));
  const dir = shadowDirection();
  assert.ok(sampleShadowField(both, dir.x * 3, dir.z * 3) <= 1);
});

test('the relief moves the shadow — the ground it lands on is part of the answer', () => {
  smallGrid(BOUNDS);
  const caster: ShadowCaster = { x: 0, z: 0, radius: 2, height: 10 };
  const flat = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [caster] });
  const hilly = buildCanopyShadowField({ bounds: BOUNDS, relief: 8, casters: [caster] });
  assert.notEqual(shadowCoverage(flat), shadowCoverage(hilly));
  // And the relief really is the field this module reads, not a number it ignores.
  assert.notEqual(landHeight(3, 3, 8), landHeight(3, 3, 0));
});

test('sampling is bilinear, exact at texel centres, and clamps outside the field', () => {
  smallGrid(BOUNDS);
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
  smallGrid(GOLD_BOUNDS);
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

// ---------------------------------------------------------------------------
// THE GOLDENS, and why they sit beside the properties above rather than replacing them.
//
// ⚠ A PROPERTY TEST SAYS THE CODE IS CORRECT; IT DOES NOT PIN WHICH IMPLEMENTATION IS RUNNING.
// "The shadow lengthens with height" and "the pool falls away with distance" are both satisfied by
// a dozen wrong formulas, and the mutation rung charges a crossed module its whole file. So the
// arithmetic below is pinned to numbers read off one run and committed — the properties carry the
// argument, the goldens say which code is making it.
//
// ⚠ AND THE FIXTURE IS DELIBERATELY ASYMMETRIC. A ±40 box makes `maxX - minX` and `maxX + minX`
// deliver 0 and 80, which sounds like a difference and is not: the clamp then reads the OTHER
// axis, which is identical, and the mutant survives. Bounds with four different numbers make each
// span independently observable.
// ---------------------------------------------------------------------------

/** Bounds whose four edges are four different numbers, so no two spans coincide. */
const GOLD_BOUNDS = { minX: -13, maxX: 21, minZ: -7, maxZ: 11 };
const GOLD_CASTER: ShadowCaster = { x: 1, z: 2, radius: 2, height: 10 };

/** A field's exact content, as numbers a mutant cannot slip past. Duplicated in
 *  `contact-shade.test.ts` rather than exported from `src/`: it is a test's summary of a field,
 *  and shipping it would be shipped code only a test calls. */
function fieldSignature(f: ShadowField) {
  let nonZero = 0;
  let sum = 0;
  let max = 0;
  let first = -1;
  let last = -1;
  for (let p = 0; p < f.data.length; p += 1) {
    const v = f.data[p]!;
    if (v === 0) continue;
    nonZero += 1;
    sum += v;
    if (v > max) max = v;
    if (first < 0) first = p;
    last = p;
  }
  return { w: f.w, h: f.h, gres: f.gres, minX: f.minX, minZ: f.minZ, nonZero, sum, max, first, last };
}

test('GOLDEN: the authored light’s two derivations, to full precision', () => {
  // ⚠ A TOLERANCE OF 1e-12 RATHER THAN `equal`, and it is still a golden. These are ratios of
  // transcendental-looking constants, and the exact double a build produces is not something a
  // test should depend on; every mutant that could reach them (a `/` for a `*`, a dropped
  // `Math.hypot`) moves the answer by orders of magnitude, not by an ulp.
  assert.ok(Math.abs(lightSlope() - 1.4383751516635277) < 1e-12, `${lightSlope()}`);
  assert.ok(
    Math.abs(shadowOffsetPerUnitHeight() - 0.6952289177433769) < 1e-12,
    `${shadowOffsetPerUnitHeight()}`,
  );
});

test('GOLDEN: the terrain cast bound and the sampled peak slope', () => {
  assert.ok(Math.abs(maxTerrainCast(2.2) - 5.873293897096049) < 1e-12, `${maxTerrainCast(2.2)}`);
  assert.ok(Math.abs(maxTerrainSlope(2.2) - 0.4546385098147919) < 1e-12, `${maxTerrainSlope(2.2)}`);
  // ⚠ THE SWEEP'S OWN PARAMETERS MATTER, and a fixed-patch sampler that ignored them would pass
  // every property above. A patch nine units wide sees a fraction of one wavelength; a coarser
  // step misses the crest it lands between.
  assert.ok(Math.abs(maxTerrainSlope(2.2, 9) - 0.2717702818871019) < 1e-12);
  assert.ok(Math.abs(maxTerrainSlope(2.2, 200, 3) - 0.45284160144482843) < 1e-12);
});

test('GOLDEN: the grid over an asymmetric rect', () => {
  assert.deepEqual(occlusionGrid(GOLD_BOUNDS), {
    minX: -15,
    minZ: -9,
    w: 114,
    h: 66,
    gres: 3,
  });
});

test('GOLDEN: the clamp reads the WIDEST axis, and each span is its own arithmetic', () => {
  // A rect 3010 units across and 14 deep. Both spans go into `Math.max`, so a mutant in either
  // one moves the answer — which a square fixture hides, because the surviving axis carries it.
  const wide = { minX: -10, maxX: 3000, minZ: -5, maxZ: 5 };
  assert.ok(Math.abs(occlusionGres(wide) - 0.6794956867949569) < 1e-15, `${occlusionGres(wide)}`);
  const wideGrid = occlusionGrid(wide);
  assert.equal(wideGrid.minX, -12);
  assert.equal(wideGrid.minZ, -7);
  assert.equal(wideGrid.w, 2048);
  assert.equal(wideGrid.h, 10);
  assert.equal(wideGrid.gres, occlusionGres(wide));
  // The clamp is exactly the cap, not merely under it — `max / widest` and nothing else.
  assert.ok(
    Math.abs(occlusionGres(wide) * (3010 + OCCLUSION_PAD * 2) - SHADOW_TEXTURE_MAX) < 1e-9,
  );
});

test('GOLDEN: the cast field on flat land, byte for byte', () => {
  smallGrid(GOLD_BOUNDS);
  assert.deepEqual(
    fieldSignature(buildCanopyShadowField({ bounds: GOLD_BOUNDS, relief: 0, casters: [GOLD_CASTER] })),
    { w: 114, h: 66, gres: 3, minX: -15, minZ: -9, nonZero: 400, sum: 63854, max: 255, first: 1653, last: 4614 },
  );
});

test('GOLDEN: the relief moves it, and by exactly this much', () => {
  smallGrid(GOLD_BOUNDS);
  // ⚠ THE PAIR IS THE POINT. The flat golden alone is satisfied by a builder that ignores its
  // relief argument; the relieved one alone is satisfied by one that ignores the caster. Together
  // they say the ground the shadow lands on is part of the answer.
  assert.deepEqual(
    fieldSignature(
      buildCanopyShadowField({ bounds: GOLD_BOUNDS, relief: 2.2, casters: [GOLD_CASTER] }),
    ),
    { w: 114, h: 66, gres: 3, minX: -15, minZ: -9, nonZero: 362, sum: 58006, max: 255, first: 1653, last: 4614 },
  );
});

test('an EXPLICIT gres is honoured rather than falling through to the default', () => {
  smallGrid(GOLD_BOUNDS);
  // `opts.gres ?? SHADOW_GRES` and `opts.gres && SHADOW_GRES` agree whenever `gres` is absent —
  // which is every call the shipped canvas makes. Only an explicit value separates them.
  const coarse = buildCanopyShadowField({
    bounds: GOLD_BOUNDS,
    relief: 0,
    casters: [GOLD_CASTER],
    gres: 1,
  });
  assert.equal(coarse.gres, 1);
  assert.equal(coarse.w, 38);
  assert.equal(coarse.h, 22);
});

test('bilinear sampling interpolates in Z as well as in X', () => {
  smallGrid(GOLD_BOUNDS);
  // The X half is asserted above. Without this, `at(i0, j0 + 1)` could read `j0 - 1` and every
  // shadow would sample two thirds of a unit north of where it was stamped.
  const grid = occlusionGrid(GOLD_BOUNDS);
  const field = emptyField(grid);
  const at = (i: number, j: number): number => j * field.w + i;
  field.data[at(10, 10)] = 255;
  field.data[at(11, 10)] = 255;
  const x = grid.minX + 10.5 / grid.gres;
  const z = grid.minZ + 10 / grid.gres;
  assert.ok(Math.abs(sampleShadowField(field, x, z) - 1) < 1e-9, 'on the lit row');
  const half = sampleShadowField(field, x, z + 0.5 / grid.gres);
  assert.ok(Math.abs(half - 0.5) < 1e-6, `halfway to the empty row below: ${half}`);
  const north = sampleShadowField(field, x, z - 0.5 / grid.gres);
  assert.ok(Math.abs(north - 0.5) < 1e-6, `halfway to the empty row above: ${north}`);
});

test('the fence NAMES the two numbers it compared, so the failure is readable', () => {
  // ⚠ AN ERROR MESSAGE IS SOURCE TOO. Blanked to an empty template it still throws, still passes a
  // `assert.throws(fn)`, and tells whoever hits it nothing about which constant moved.
  assert.throws(
    () => assertTerrainDoesNotSelfShadow(12),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, /amplitude 12/);
      assert.match(message, /2\.480/, 'the peak slope at that amplitude');
      assert.match(message, /1\.438/, "the authored light's own slope");
      assert.match(message, /harness\/land-shadow\.ts/, 'where the missing term lives');
      return true;
    },
  );
});

test('coverage counts strictly PAST the threshold, and the material tests `> 0.5`', () => {
  smallGrid(GOLD_BOUNDS);
  const grid = occlusionGrid(GOLD_BOUNDS);
  const exact = emptyField(grid);
  // 128/255 = 0.50196…, which is past 0.5; 127/255 = 0.498…, which is not. The boundary is
  // where a `>=` mutant would differ, so it is asked at the two bytes that straddle it.
  exact.data.fill(128);
  assert.equal(shadowCoverage(exact), 1);
  const under = emptyField(grid);
  under.data.fill(127);
  assert.equal(shadowCoverage(under), 0);
  // And at the threshold exactly: `v / 255 > threshold` must be false.
  const onIt = emptyField(grid);
  onIt.data.fill(128);
  assert.equal(shadowCoverage(onIt, 128 / 255), 0, 'a sample AT the threshold does not count');
});

test('GOLDEN: the sweep’s own BOUNDARY row is sampled, not stopped one short of', () => {
  // ⚠ A PATCH WHOSE LAST ROW IS THE PEAK, found by searching for one rather than hoped for. At
  // span 47 the steepest gradient in the patch lies exactly on `z = +span/2`, so `z <= span/2`
  // and `z < span/2` give different answers — which is the only way to tell a sampler that
  // covers its stated patch from one that covers all but the edge of it.
  assert.ok(Math.abs(maxTerrainSlope(2.2, 47, 1) - 0.3959299914294673) < 1e-12,
    `${maxTerrainSlope(2.2, 47, 1)}`);
  // And it really is the boundary that carries it: one step narrower and the peak is gone.
  assert.ok(maxTerrainSlope(2.2, 46, 1) < 0.3959299914294673);
});

test('THE BOX, asserted directly — because a delivered field cannot see it', () => {
  // ⚠ THE SUBJECT IS THE BOX, NOT THE FIELD. Every sample inside a stamp box is tested again
  // against the caster's own geometry, so a box that is too wide delivers an identical field and
  // costs only time — which makes half of its arithmetic invisible to any assertion about pixels.
  // Named and returned, it is a value with four numbers in it.
  const grid = occlusionGrid({ minX: 100, maxX: 141, minZ: 60, maxZ: 89 });
  assert.equal(grid.minX, 98);
  assert.equal(grid.minZ, 58);
  assert.equal(grid.w, 135);
  assert.equal(grid.h, 99);
  // An interior rect: all four edges land where the arithmetic puts them.
  const box = stampBox(grid, 110, 120, 70, 80);
  assert.equal(box.i0, 36);
  assert.equal(box.i1, 66);
  assert.equal(box.j0, 36);
  assert.equal(box.j1, 66);
  // ⚠ AND THE RANGES IT WILL WALK, which is the half a delivered field cannot show: a box one row
  // short usually loses a row that was going to be rejected anyway.
  assert.equal(box.rows.length, 31);
  assert.equal(box.cols.length, 31);
  assert.equal(box.rows[0], 36);
  assert.equal(box.rows.at(-1), 66);
  assert.deepEqual(box.cols, box.rows, 'a square rect on a square grid walks the same two ranges');
  // ⚠ THE ORIGIN IS SUBTRACTED, NOT ADDED, AND THE RESOLUTION MULTIPLIES, NOT DIVIDES. With a
  // ground origin of 98 those are three different boxes, which is why this fixture sits far from
  // zero: at the origin, `- minX` and `+ minX` are the same thing.
  assert.notDeepEqual(
    stampBox(grid, 110, 120, 70, 80).cols,
    stampBox(grid, 110 + 98, 120 + 98, 70, 80).cols,
  );
});

test('the box CLAMPS to the buffer on all four sides', () => {
  const grid = occlusionGrid({ minX: 100, maxX: 141, minZ: 60, maxZ: 89 });
  // A rect running off every edge is clamped to the buffer rather than addressing outside it.
  const all = stampBox(grid, -500, 500, -500, 500);
  assert.equal(all.i0, 0);
  assert.equal(all.i1, 134);
  assert.equal(all.j0, 0);
  assert.equal(all.j1, 98);
  assert.equal(all.cols.length, 135);
  assert.equal(all.rows.length, 99);
  // A rect entirely OFF the buffer comes back EMPTY rather than clamped to its first sample:
  // `i1 < i0`, so the stamp loop runs zero times. Clamping it to {0,0} instead would darken the
  // island's corner for every caster that missed the field entirely.
  const off = stampBox(grid, 90, 95, 50, 55);
  assert.equal(off.i1, -9);
  assert.equal(off.j1, -9);
  assert.deepEqual(off.cols, [], 'an empty box walks no columns');
  assert.deepEqual(off.rows, [], 'and no rows');
  // ⚠ THE COLUMN CLAMP IS THE ONE THAT PREVENTS A VISIBLE DEFECT: an `i` past `w - 1` wraps onto
  // the next row and writes a caster's shadow on the far side of the island. A `j` past `h - 1`
  // addresses past the end of the buffer, where a typed array drops the write — harmless, and
  // still clamped, because a clamp that happens to be harmless is not the same as one that is
  // not there.
  const wide = stampBox(grid, 100, 400, 60, 400);
  assert.equal(wide.i1, grid.w - 1);
  assert.equal(wide.j1, grid.h - 1);
});

test('the padded span is ONE function, so neither axis carries an unobservable copy', () => {
  assert.equal(axisSpan(100, 141), 45);
  assert.equal(axisSpan(-13, 21), 38);
  assert.equal(axisSpan(0, 0), OCCLUSION_PAD * 2);
  // And the clamp reads the TALLER axis as readily as the wider one — asked with a rect whose
  // depth dominates, so a mutant in the Z span cannot hide behind the X span carrying the answer.
  const tall = { minX: -5, maxX: 5, minZ: -10, maxZ: 3000 };
  assert.ok(Math.abs(occlusionGres(tall) - SHADOW_TEXTURE_MAX / axisSpan(-10, 3000)) < 1e-15);
  assert.ok(occlusionGres(tall) < SHADOW_GRES);
  assert.equal(occlusionGrid(tall).h, SHADOW_TEXTURE_MAX);
  // ⚠ AND THE CAP IS THE GRID'S OWN, not merely the resolution helper's: whatever resolution it is
  // handed, the buffer it describes stays inside the budget.
  assert.equal(cappedEdge(1e9), SHADOW_TEXTURE_MAX);
  assert.equal(cappedEdge(0), 1, 'and never smaller than one sample');
  assert.equal(cappedEdge(41.2), 42, 'a partial sample still needs a whole one');
  assert.ok(occlusionGrid(tall, 1000).w <= SHADOW_TEXTURE_MAX);
  assert.ok(occlusionGrid(tall, 1000).h <= SHADOW_TEXTURE_MAX);
});

test('THE LINEAR LAW the fence rests on — both halves, because either alone is satisfiable', () => {
  // ⚠ THE FENCE IS A MULTIPLY RATHER THAN A 160,801-POINT SWEEP, because it runs on every field
  // build and a canvas that re-derived a constant before drawing would be a real defect hiding
  // inside a correctness check. That is only honest if BOTH of these hold.
  //
  // (a) the constant IS what the sampler returns at amplitude 1 —
  assert.equal(maxTerrainSlope(1), PEAK_SLOPE_PER_UNIT_AMPLITUDE);
  // (b) and the sampler really is linear in the amplitude, across the whole range this land could
  //     ever wear. The relief is a sum of waves scaled by the amplitude, so its gradient scales
  //     with it exactly — asserted rather than argued, at seven amplitudes.
  for (const relief of [0.5, 2.2, 3.2, 4.4, 7, 12, 40]) {
    const sampled = maxTerrainSlope(relief);
    assert.ok(
      Math.abs(sampled - peakSlopeAt(relief)) < 1e-12,
      `at amplitude ${relief} the sampler says ${sampled} and the law says ${peakSlopeAt(relief)}`,
    );
  }
  // And the law is not vacuously flat: it really does rise with the amplitude.
  assert.ok(peakSlopeAt(4.4) > peakSlopeAt(2.2));
  assert.equal(peakSlopeAt(0), 0);
});

test('a range runs LO to HI inclusive, and an inverted one is empty', () => {
  assert.deepEqual(span(3, 7), [3, 4, 5, 6, 7]);
  assert.deepEqual(span(0, 0), [0]);
  assert.deepEqual(span(5, 4), [], 'hi below lo is a box with nothing in it');
  assert.deepEqual(span(-2, 1), [-2, -1, 0, 1]);
  assert.deepEqual(indices(4), [0, 1, 2, 3]);
  assert.deepEqual(indices(0), []);
  assert.deepEqual(indices(-9), [], 'a negative count is no samples, not a throw');
});
