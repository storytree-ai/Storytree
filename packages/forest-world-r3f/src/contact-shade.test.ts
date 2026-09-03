// contact-shade.test.ts — the contact pool's arithmetic, proved without a browser.
//
// THE TEST THIS FILE IS REALLY FOR is `the pool SCALES with the occluder`. A tuned radial blob
// would satisfy every other assertion here; what makes this module defensible is that a hero tree
// pools far more ground than a shrub because it hides far more sky, not because someone chose a
// bigger number. That property is the derivation, and it is the thing a later pass would quietly
// lose by replacing the formula with a lookup that happened to match one still picture.
//
// ⚠ IT LIVES BESIDE THE MODULE IN `src/` BECAUSE THAT IS WHERE THE MODULE LIVES NOW
// (`crossing-a-module-into-src-reds-two-rungs`): the mutation rung mutates a project's `src/`
// only, so a crossed module whose tests stayed in `harness/` is a crossed module with no witness.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTACT_SPREAD,
  buildContactField,
  buildGroundOcclusion,
  contactCoverage,
  contactReach,
  mergeOcclusion,
  sameGrid,
  skyOcclusionAt,
} from './contact-shade.js';
import {
  buildCanopyShadowField,
  emptyField,
  occlusionGrid,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  SHADOW_PENUMBRA,
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


test('occlusion is total at the occluder and falls away from it', () => {
  assert.equal(skyOcclusionAt(2, 2, 10), 1, 'touching the flank hides everything on that side');
  assert.equal(skyOcclusionAt(1, 2, 10), 1, 'inside the footprint too');
  assert.ok(skyOcclusionAt(40, 2, 10) < 0.02, 'far away it is essentially nothing');
});

test('occlusion decreases monotonically with distance — the property the bisection needs', () => {
  let prev = Infinity;
  for (let d = 2; d < 40; d += 0.25) {
    const v = skyOcclusionAt(d, 2, 10);
    assert.ok(v <= prev, `occlusion rose at d=${d}`);
    prev = v;
  }
});

test('a zero-height occluder occludes nothing — a flower with no head casts no pool', () => {
  assert.equal(skyOcclusionAt(1, 2, 0), 0);
  assert.equal(skyOcclusionAt(0.1, 2, -5), 0);
});

test('THE DERIVATION: the pool scales with the occluder, and by the right amounts', () => {
  // A hero tree against a shrub, at the same distance. This is the property a tuned blob loses.
  const tree = skyOcclusionAt(6, 7, 19);
  const shrub = skyOcclusionAt(6, 0.5, 2);
  assert.ok(tree > shrub * 10, `tree ${tree} vs shrub ${shrub}`);
  // Both factors matter independently: taller at the same radius occludes more, wider at the same
  // height occludes more.
  assert.ok(skyOcclusionAt(4, 2, 20) > skyOcclusionAt(4, 2, 5));
  assert.ok(skyOcclusionAt(4, 3, 10) > skyOcclusionAt(4, 1, 10));
});

test('THE 2026-08-30 CASTERS: the story tree pooled 9.7 units, its trunk alone 2.3', () => {
  // The numbers that increment's evidence quotes. The crown's pool is barely wider than the crown
  // itself, which is why contact darkening delivered so little on a map that drew ONE object.
  //
  // ⚠ THESE ARE NO LONGER THE SHIPPED CASTERS, and the test is kept as an exercise of
  // `contactReach` rather than renamed away. The story tree was retired on 2026-09-04 (ADR-0508)
  // and the shipped map's casters are the grove's placements; the arithmetic below is about the
  // FUNCTION, and its two inputs — a 7x19 crown and a 1.6x8 trunk — are a case worth holding to a
  // published figure whether or not anything currently on the map has those dimensions.
  assert.ok(Math.abs(contactReach(7, 19) - 9.74) < 0.02, `crown reach: ${contactReach(7, 19)}`);
  assert.ok(Math.abs(contactReach(1.6, 8) - 2.25) < 0.02, `trunk reach: ${contactReach(1.6, 8)}`);
});

test('contactReach lands ON the threshold it was asked for, from both sides', () => {
  const reach = contactReach(2, 10, 0.5);
  assert.ok(skyOcclusionAt(reach * 0.99, 2, 10) >= 0.5, 'just inside must be occluded');
  assert.ok(skyOcclusionAt(reach * 1.01, 2, 10) <= 0.5, 'just outside must not be');
  // A different threshold gives a different reach, in the right direction.
  assert.ok(contactReach(2, 10, 0.2) > reach);
  assert.ok(contactReach(2, 10, 0.8) < reach);
});

test('a caster already below the threshold at its own flank reaches only its own radius', () => {
  // The early return, which the bisection would otherwise bracket wrongly.
  assert.equal(contactReach(2, 0), 2);
});

test('an empty caster set delivers an identically-zero field, not an absent one', () => {
  smallGrid(BOUNDS);
  const field = buildContactField({ bounds: BOUNDS, casters: [] });
  assert.equal(field.data.length, field.w * field.h);
  assert.equal(contactCoverage(field), 0);
});

test('the pool SURROUNDS the prop — it lands on the LIT side too, which a cast shadow never does', () => {
  smallGrid(BOUNDS);
  const caster: ShadowCaster = { x: 0, z: 0, radius: 3, height: 12 };
  const contact = buildContactField({ bounds: BOUNDS, casters: [caster] });
  const cast = buildCanopyShadowField({ bounds: BOUNDS, relief: 0, casters: [caster] });
  const dir = shadowDirection();
  // Three units TOWARD the light: the contact pool is there, the cast shadow is not. That is the
  // whole reason these are two terms rather than one.
  const towardX = -dir.x * 3;
  const towardZ = -dir.z * 3;
  assert.ok(sampleShadowField(contact, towardX, towardZ) > 0.5);
  assert.equal(sampleShadowField(cast, towardX, towardZ), 0);
});

test('the contact grid matches the cast grid exactly, so the two can be merged', () => {
  smallGrid(BOUNDS);
  const casters: ShadowCaster[] = [{ x: 0, z: 0, radius: 3, height: 12 }];
  const contact = buildContactField({ bounds: BOUNDS, casters });
  const cast = buildCanopyShadowField({ bounds: BOUNDS, relief: 2.2, casters });
  assert.equal(contact.w, cast.w);
  assert.equal(contact.h, cast.h);
  assert.equal(contact.gres, cast.gres);
  assert.equal(contact.minX, cast.minX);
  assert.equal(contact.minZ, cast.minZ);
  assert.doesNotThrow(() => mergeOcclusion(contact, cast));
});

test('mergeOcclusion takes the greater occlusion and never invents one', () => {
  smallGrid(BOUNDS);
  const grid = occlusionGrid(BOUNDS);
  const a = emptyField(grid);
  const b = emptyField(grid);
  a.data[5] = 200;
  b.data[5] = 100;
  b.data[6] = 250;
  const merged = mergeOcclusion(a, b);
  assert.equal(merged.data[5], 200);
  assert.equal(merged.data[6], 250);
  assert.equal(merged.data[7], 0, 'a merge must not lift a sample neither field touched');
  // A max, not a sum: 200 + 100 would be 300 and clamp to 255.
  assert.notEqual(merged.data[5], 255);
});

test('mergeOcclusion REFUSES a grid mismatch rather than resampling one onto the other', () => {
  smallGrid(BOUNDS);
  const a = emptyField(occlusionGrid(BOUNDS));
  const b = emptyField(occlusionGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }));
  assert.throws(() => mergeOcclusion(a, b), /different grids/);
});

test('spread widens the pool without lifting the whole field toward the threshold', () => {
  smallGrid(BOUNDS);
  const casters: ShadowCaster[] = [{ x: 0, z: 0, radius: 2, height: 10 }];
  assert.equal(CONTACT_SPREAD, 1);
  const tight = buildContactField({ bounds: BOUNDS, casters });
  const wide = buildContactField({ bounds: BOUNDS, casters, spread: 2 });
  assert.ok(contactCoverage(wide) > contactCoverage(tight));
  // The value AT the prop is unchanged — a widening moves the edge outward, it does not brighten
  // and then darken everything at once.
  assert.equal(sampleShadowField(wide, 0, 0), sampleShadowField(tight, 0, 0));
});

test('THE ONE FIELD: buildGroundOcclusion is exactly the merge of the two terms', () => {
  smallGrid(BOUNDS);
  const casters: ShadowCaster[] = [{ x: 0, z: 0, radius: 7, height: 19 }];
  const merged = buildGroundOcclusion({ bounds: BOUNDS, relief: 2.2, casters });
  const expected = mergeOcclusion(
    buildCanopyShadowField({ bounds: BOUNDS, relief: 2.2, casters }),
    buildContactField({ bounds: BOUNDS, casters }),
  );
  assert.deepEqual(merged.data, expected.data);
  assert.equal(merged.w, expected.w);
  // And it really is more than either alone — the union, not one of them wearing a merge's name.
  assert.ok(shadowCoverage(merged) > shadowCoverage(buildCanopyShadowField({ bounds: BOUNDS, relief: 2.2, casters })));
  assert.ok(shadowCoverage(merged) > contactCoverage(buildContactField({ bounds: BOUNDS, casters })));
});

test('buildGroundOcclusion REFUSES a land steep enough for the missing terrain term to matter', () => {
  smallGrid(GOLD_BOUNDS);
  // The fence that keeps the omission honest: `src/land-shadow.ts` carries the canopy stamp only,
  // and that is only correct while the land is nowhere steeper than the light.
  assert.throws(
    () => buildGroundOcclusion({ bounds: BOUNDS, relief: 12, casters: [] }),
    /shadows itself/,
  );
  assert.doesNotThrow(() => buildGroundOcclusion({ bounds: BOUNDS, relief: 2.2, casters: [] }));
});

// ---------------------------------------------------------------------------
// THE GOLDENS. See `land-shadow.test.ts`'s own golden block for why they sit beside the
// properties rather than replacing them: a property says the code is CORRECT, a golden says which
// implementation is making the claim, and the mutation rung charges a crossed module its whole
// file.
// ---------------------------------------------------------------------------

/** Bounds whose four edges are four different numbers, so no two spans coincide. */
const GOLD_BOUNDS = { minX: -13, maxX: 21, minZ: -7, maxZ: 11 };
const GOLD_CASTER: ShadowCaster = { x: 1, z: 2, radius: 2, height: 10 };

/** A field's exact content, as numbers a mutant cannot slip past. Duplicated from
 *  `land-shadow.test.ts` rather than exported from `src/`: it is a test's summary of a field, and
 *  shipping it would be shipped code only a test calls. */
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

test('GOLDEN: the sky-occlusion formula, at four points along its own curve', () => {
  assert.ok(Math.abs(skyOcclusionAt(3, 2, 10) - 0.4599594597995445) < 1e-12, `${skyOcclusionAt(3, 2, 10)}`);
  assert.ok(Math.abs(skyOcclusionAt(6, 2, 10) - 0.18650594477481502) < 1e-12);
  assert.ok(Math.abs(skyOcclusionAt(6, 7, 19) - 1) < 1e-12, 'inside the crown, saturated');
  assert.ok(Math.abs(skyOcclusionAt(12, 7, 19) - 0.37082342634621157) < 1e-12);
});

test('GOLDEN: the contact reach of the two casters this map actually has', () => {
  assert.ok(Math.abs(contactReach(7, 19) - 9.741513797378273) < 1e-9, `${contactReach(7, 19)}`);
  assert.ok(Math.abs(contactReach(1.6, 8) - 2.2510625841608207) < 1e-9, `${contactReach(1.6, 8)}`);
  assert.ok(Math.abs(contactReach(2, 10) - 2.8138282302010253) < 1e-9, `${contactReach(2, 10)}`);
});

test('the EARLY RETURN fires on a prop too short to reach the threshold at its own flank', () => {
  // ⚠ `r * 1.0001` and `r / 1.0001` sit on opposite sides of the `d <= r` guard, so the mutant
  // that flips the multiply falls through to the bisection and returns a hair MORE than `r`. Asked
  // with an exact equality, at a height small enough for the guard to be the branch that decides.
  assert.equal(contactReach(2, 0.0001), 2);
  assert.equal(contactReach(2, 0), 2, 'a prop with no height at all reaches only its own radius');
});

test('the BRACKET GROWS when the guess does not contain the root', () => {
  // ⚠ THE LOOP IS UNREACHABLE AT THE DEFAULT THRESHOLD, which is why it came back with no
  // coverage at all. `hi` starts at `r + max(4, h) * 4`, and at that distance a cylinder's
  // elevation factor is already `sin^2(atan(1/4)) = 0.059` — so 0.5 can never be met. A SMALL
  // threshold is the only thing that reaches it, and a bisection over a bracket that does not
  // contain the root converges confidently to the wrong answer.
  const deep = contactReach(2, 10, 0.001);
  assert.ok(deep > 2 + Math.max(4, 10) * 4, `the answer must lie past the first bracket: ${deep}`);
  assert.ok(Math.abs(deep - 50.97406918000331) < 1e-9, `${deep}`);
  assert.ok(skyOcclusionAt(deep * 0.99, 2, 10) >= 0.001);
  assert.ok(skyOcclusionAt(deep * 1.01, 2, 10) <= 0.001);
});

test('GOLDEN: the contact field, byte for byte', () => {
  smallGrid(GOLD_BOUNDS);
  assert.deepEqual(fieldSignature(buildContactField({ bounds: GOLD_BOUNDS, casters: [GOLD_CASTER] })), {
    w: 114,
    h: 66,
    gres: 3,
    minX: -15,
    minZ: -9,
    nonZero: 221,
    sum: 46535,
    max: 255,
    first: 2896,
    last: 4724,
  });
});

test('GOLDEN: the merged field is the union, and neither term alone', () => {
  smallGrid(GOLD_BOUNDS);
  const merged = fieldSignature(buildGroundOcclusion({ bounds: GOLD_BOUNDS, relief: 2.2, casters: [GOLD_CASTER] }));
  assert.deepEqual(merged, {
    w: 114,
    h: 66,
    gres: 3,
    minX: -15,
    minZ: -9,
    nonZero: 476,
    sum: 84714,
    max: 255,
    first: 1653,
    last: 4724,
  });
  // Its extent runs from the CAST field's first sample to the CONTACT field's last — which is what
  // a union of two differently-placed stamps looks like and what neither alone could be.
  assert.equal(
    merged.first,
    fieldSignature(buildCanopyShadowField({ bounds: GOLD_BOUNDS, relief: 2.2, casters: [GOLD_CASTER] })).first,
  );
  assert.equal(
    merged.last,
    fieldSignature(buildContactField({ bounds: GOLD_BOUNDS, casters: [GOLD_CASTER] })).last,
  );
});

test('an EXPLICIT gres reaches the contact stamp too', () => {
  smallGrid(GOLD_BOUNDS);
  // `opts.gres ?? SHADOW_GRES` and `opts.gres && SHADOW_GRES` agree on every absent value.
  const coarse = buildContactField({ bounds: GOLD_BOUNDS, casters: [GOLD_CASTER], gres: 1 });
  assert.deepEqual(fieldSignature(coarse), {
    w: 38,
    h: 22,
    gres: 1,
    minX: -15,
    minZ: -9,
    nonZero: 21,
    sum: 4755,
    max: 255,
    first: 357,
    last: 511,
  });
});

test('sameGrid asks FIVE separate questions, and each one alone can refuse', () => {
  smallGrid(GOLD_BOUNDS);
  // ⚠ FOLDED INTO ONE `||` CHAIN, A DROPPED CLAUSE HIDES BEHIND THE FOUR THAT REMAIN. Each field
  // is moved on its own here, so a comparison that stopped being made has nowhere to hide.
  const base = emptyField(occlusionGrid(GOLD_BOUNDS));
  const moved = (patch: Partial<ShadowField>): ShadowField => ({ ...base, ...patch });
  assert.equal(sameGrid(base, base), true);
  assert.equal(sameGrid(base, moved({ w: base.w + 1 })), false, 'width');
  assert.equal(sameGrid(base, moved({ h: base.h + 1 })), false, 'height');
  assert.equal(sameGrid(base, moved({ gres: base.gres + 1 })), false, 'resolution');
  assert.equal(sameGrid(base, moved({ minX: base.minX + 1 })), false, 'origin x');
  assert.equal(sameGrid(base, moved({ minZ: base.minZ + 1 })), false, 'origin z');
  // And the refusal really is wired to it, on every one of the five.
  for (const patch of [{ w: 1 }, { h: 1 }, { gres: 9 }, { minX: 0 }, { minZ: 0 }]) {
    assert.throws(() => mergeOcclusion(base, moved(patch)), /different grids/);
  }
});

test('the merge refusal NAMES both grids, so the failure is readable', () => {
  smallGrid(GOLD_BOUNDS);
  // An error message is source too: blanked to an empty template it still throws and still tells
  // whoever hits it nothing about which of the two fields moved.
  const a = emptyField(occlusionGrid(GOLD_BOUNDS));
  const b = emptyField(occlusionGrid({ minX: -1, maxX: 2, minZ: -3, maxZ: 4 }));
  assert.throws(
    () => mergeOcclusion(a, b),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, /114x66@3 from -15,-9/, "the first field's grid");
      assert.match(message, /21x33@3 from -3,-5/, "the second field's grid");
      return true;
    },
  );
});

test('the merge writes a NEW buffer and leaves both inputs alone', () => {
  smallGrid(GOLD_BOUNDS);
  const grid = occlusionGrid(GOLD_BOUNDS);
  const a = emptyField(grid);
  const b = emptyField(grid);
  a.data[7] = 200;
  b.data[7] = 100;
  const merged = mergeOcclusion(a, b);
  assert.notEqual(merged.data, a.data, 'the merge must not alias either input');
  assert.equal(a.data[7], 200, 'the first input is unchanged');
  assert.equal(b.data[7], 100, 'the second input is unchanged');
  assert.equal(merged.data.length, a.data.length);
});

test('contact coverage counts strictly PAST the threshold, like the material does', () => {
  smallGrid(GOLD_BOUNDS);
  const grid = occlusionGrid(GOLD_BOUNDS);
  const f = emptyField(grid);
  f.data.fill(128);
  assert.equal(contactCoverage(f), 1);
  assert.equal(contactCoverage(f, 128 / 255), 0, 'a sample AT the threshold does not count');
  const under = emptyField(grid);
  under.data.fill(127);
  assert.equal(contactCoverage(under), 0);
});

// ---------------------------------------------------------------------------
// THE EDGE FIXTURE — and it exists because a comfortably-interior caster proves almost nothing
// about the rasterisation box.
//
// ⚠⚠ THE BOX IS A BOUND, NOT A SHAPE. Every sample inside it is tested against the caster's own
// geometry, so a box that is too WIDE delivers exactly the same field and merely costs time —
// which makes half of its arithmetic unobservable on an island whose casters sit in the middle.
// What a test CAN see is a box in the WRONG PLACE (an origin added instead of subtracted, a span
// divided instead of multiplied) and a clamp that stops binding: with `Math.min(w - 1, …)` turned
// into `Math.max(w - 1, …)`, a caster at the right-hand edge writes past the end of its row and
// its shadow reappears wrapped onto the next one.
//
// So the fixture is FAR FROM THE ORIGIN — every coordinate positive, so `minX` and `-minX` are
// different numbers — and its two casters sit ON the first and last texel.
// ---------------------------------------------------------------------------

const EDGE_BOUNDS = { minX: 100, maxX: 141, minZ: 60, maxZ: 89 };
const EDGE_CASTERS: ShadowCaster[] = [
  { x: 101, z: 61, radius: 3, height: 12 },
  { x: 140, z: 88, radius: 3, height: 12 },
];

test('GOLDEN: the CAST field with casters on the first and last texel', () => {
  smallGrid(EDGE_BOUNDS);
  const f = buildCanopyShadowField({ bounds: EDGE_BOUNDS, relief: 2.2, casters: EDGE_CASTERS });
  assert.deepEqual(fieldSignature(f), {
    w: 135, h: 99, gres: 3, minX: 98, minZ: 58,
    nonZero: 629, sum: 117894, max: 255, first: 4, last: 13364,
  });
  // The clamps really are binding: the shadow reaches the very last sample of the buffer, and
  // within four of the first. A box that stopped short would lose those; one that ran past the
  // row would wrap them onto the next.
  assert.equal(f.data.length, 13365);
  assert.ok(f.data[13364]! > 0, 'the last texel is written');
});

test('GOLDEN: the CONTACT field on the same edge fixture', () => {
  smallGrid(EDGE_BOUNDS);
  assert.deepEqual(fieldSignature(buildContactField({ bounds: EDGE_BOUNDS, casters: EDGE_CASTERS })), {
    w: 135, h: 99, gres: 3, minX: 98, minZ: 58,
    nonZero: 820, sum: 181896, max: 255, first: 1, last: 13364,
  });
});

test('GOLDEN: and the merged field, which is what the material receives', () => {
  smallGrid(EDGE_BOUNDS);
  assert.deepEqual(
    fieldSignature(buildGroundOcclusion({ bounds: EDGE_BOUNDS, relief: 2.2, casters: EDGE_CASTERS })),
    {
      w: 135, h: 99, gres: 3, minX: 98, minZ: 58,
      nonZero: 1048, sum: 219068, max: 255, first: 1, last: 13364,
    },
  );
});

test('no stamp WRAPS onto a neighbouring row — the failure a clamp exists to prevent', () => {
  smallGrid(EDGE_BOUNDS);
  // ⚠ A ROW-WRAP IS THE ONE DEFECT THIS SHAPE OF CODE PRODUCES AND A COARSE ASSERTION MISSES. It
  // does not change the field's coverage much; it moves a slice of one caster's pool to the far
  // side of the island, where it reads as a rendering artefact rather than as an index bug. Every
  // written sample must lie within its own caster's reach of that caster — checked in GROUND
  // coordinates, so a wrapped write lands nowhere near either of them.
  const f = buildGroundOcclusion({ bounds: EDGE_BOUNDS, relief: 2.2, casters: EDGE_CASTERS });
  const far = 3 + SHADOW_PENUMBRA + 12 * shadowOffsetPerUnitHeight() + 1;
  let written = 0;
  for (let p = 0; p < f.data.length; p += 1) {
    if (f.data[p] === 0) continue;
    written += 1;
    const gx = f.minX + (p % f.w) / f.gres;
    const gz = f.minZ + Math.floor(p / f.w) / f.gres;
    const near = EDGE_CASTERS.some((c) => Math.hypot(gx - c.x, gz - c.z) <= far);
    assert.ok(near, `a sample at ${gx},${gz} is not within ${far} of any caster — it wrapped`);
  }
  assert.equal(written, 1048, 'and the sweep really looked at every written sample');
});

test('an explicit gres reaches BOTH terms through buildGroundOcclusion', () => {
  smallGrid(EDGE_BOUNDS);
  // `opts.gres ?? SHADOW_GRES` and `opts.gres && SHADOW_GRES` agree on every absent value, and
  // this is the one call that hands the resolved value to two builders at once.
  const coarse = buildGroundOcclusion({
    bounds: EDGE_BOUNDS, relief: 2.2, casters: EDGE_CASTERS, gres: 1,
  });
  assert.equal(coarse.gres, 1);
  assert.equal(coarse.w, 45);
  assert.equal(coarse.h, 33);
});

test('a bracket that cannot catch the root REFUSES rather than bisecting anyway', () => {
  // The refusal that replaced a comment. A threshold at or below zero can never be crossed, so no
  // amount of doubling brackets it — and a bisection run anyway converges confidently to a wrong
  // answer, which is the whole failure the bracket-growing loop exists to avoid.
  assert.throws(() => contactReach(2, 10, 0), /no bracket contains the reach/);
  assert.throws(() => contactReach(2, 10, 0), /radius 2 and height 10/);
  // NON-VACUITY: a reachable threshold does not refuse.
  assert.doesNotThrow(() => contactReach(2, 10, 0.001));
});

test('the refusal names the DOUBLINGS it tried and the distance it reached', () => {
  // The second half of the same message. A blanked template still throws and still matches the
  // first half; what it loses is the two numbers that say WHY no bracket was found.
  assert.throws(
    () => contactReach(2, 10, 0),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, /at threshold 0/);
      assert.match(message, /40 doublings reached /);
      assert.match(message, /the occlusion there is still above it/);
      return true;
    },
  );
});

test('⚠ THE TEXTURE BUDGET REACHES BOTH TERMS, or the merge would refuse', () => {
  // `buildGroundOcclusion` resolves the cap ONCE and hands it to both the cast and the contact
  // field, for the same reason it resolves the resolution once: the merge is index-for-index, and
  // two fields built under different caps are two different grids. A mutant that dropped it from
  // either term would not produce a wrong picture — it would produce a REFUSAL, which is the
  // failure this arrangement is chosen for.
  // ⚠⚠ THIN, NOT SQUARE, AND THAT IS A MUTATION-RUNG REQUIREMENT. A CLAMPED field is
  // {@link SHADOW_TEXTURE_MAX} texels on its widest edge whatever the bounds — so a 3000 x 3000
  // fixture allocates 4.2 million samples three times over, per mutant, and the rung reports the
  // resulting timeout as UNPROVEN in the same words an attribution gap produces. Long in x and ten
  // units deep clamps exactly as hard and costs 74 thousand.
  const wide: GroundBounds = { minX: 0, maxX: 800, minZ: 0, maxZ: 10 };
  const casters = [{ x: 400, z: 5, radius: 7, height: 19 }];
  const merged = buildGroundOcclusion({ bounds: wide, relief: 2.2, casters, max: 512 });
  assert.ok(merged.w <= 512 && merged.h <= 512, 'the explicit cap must bound the merged field');
  const authored = buildGroundOcclusion({ bounds: wide, relief: 2.2, casters });
  assert.ok(authored.w > merged.w, 'and the default really is a different, larger grid');

  // The contact term alone takes it too, and a field built under a different cap is a different
  // grid — which is exactly what `sameGrid` refuses to merge.
  const contact = buildContactField({ bounds: wide, casters, max: 512 });
  assert.equal(contact.w, merged.w);
  assert.ok(!sameGrid(contact, authored));
});
