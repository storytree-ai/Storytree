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
  skyOcclusionAt,
} from './contact-shade.js';
import {
  buildCanopyShadowField,
  emptyField,
  occlusionGrid,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  type ShadowCaster,
} from './land-shadow.js';

const BOUNDS = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

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

test('THE SHIPPED CASTERS: the story tree pools 9.7 units, its trunk alone 2.3', () => {
  // The numbers the increment's evidence quotes. The crown's pool is barely wider than the crown
  // itself, which is why contact darkening delivers so little on a map that draws ONE object.
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
  const field = buildContactField({ bounds: BOUNDS, casters: [] });
  assert.equal(field.data.length, field.w * field.h);
  assert.equal(contactCoverage(field), 0);
});

test('the pool SURROUNDS the prop — it lands on the LIT side too, which a cast shadow never does', () => {
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
  const a = emptyField(occlusionGrid(BOUNDS));
  const b = emptyField(occlusionGrid({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }));
  assert.throws(() => mergeOcclusion(a, b), /different grids/);
});

test('spread widens the pool without lifting the whole field toward the threshold', () => {
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
  // The fence that keeps the omission honest: `src/land-shadow.ts` carries the canopy stamp only,
  // and that is only correct while the land is nowhere steeper than the light.
  assert.throws(
    () => buildGroundOcclusion({ bounds: BOUNDS, relief: 12, casters: [] }),
    /shadows itself/,
  );
  assert.doesNotThrow(() => buildGroundOcclusion({ bounds: BOUNDS, relief: 2.2, casters: [] }));
});
