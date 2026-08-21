import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContactField,
  contactCoverage,
  contactReach,
  mergeOcclusion,
  skyOcclusionAt,
} from './contact-shade.js';
import { buildShadowField, type ShadowCaster } from './land-shadow.js';

const PLANT: ShadowCaster = { x: 0, z: 0, radius: 2.5, height: 6.2 };
const TREE: ShadowCaster = { x: 0, z: 0, radius: 15, height: 94 };

test('occlusion is total at the occluder and falls to nothing away from it', () => {
  assert.equal(skyOcclusionAt(PLANT.radius, PLANT.radius, PLANT.height), 1);
  assert.equal(skyOcclusionAt(0, PLANT.radius, PLANT.height), 1);
  assert.ok(skyOcclusionAt(1000, PLANT.radius, PLANT.height) < 0.01);
});

test('occlusion decreases monotonically with distance — the property the reach bisection needs', () => {
  let last = Infinity;
  for (let d = 2.5; d < 200; d += 0.25) {
    const v = skyOcclusionAt(d, PLANT.radius, PLANT.height);
    assert.ok(v <= last + 1e-12, `not monotone at d=${d}: ${v} > ${last}`);
    last = v;
  }
});

test('a zero-height occluder occludes nothing — a flower with no head casts no pool', () => {
  assert.equal(skyOcclusionAt(1, 2, 0), 0);
});

test('THE POOL SCALES WITH THE OCCLUDER: the hero tree pools far more ground than a shrub', () => {
  // The whole reason the falloff is derived rather than dialled. A constant blob would give
  // these two the same pool, which is exactly what the references do not do.
  const plant = contactReach(PLANT.radius, PLANT.height);
  const tree = contactReach(TREE.radius, TREE.height);
  assert.ok(tree > plant * 3, `tree reach ${tree.toFixed(2)} vs plant ${plant.toFixed(2)}`);
  // ...and it is a CONTACT pool, not a shadow: it hugs the base rather than streaming away.
  // The tree's cast shadow is 94 * 0.695 = 65 ground units; its contact pool is far shorter.
  assert.ok(tree < 65, `contact reach ${tree.toFixed(2)} should be well under the 65-unit cast`);
});

test('contactReach lands on the threshold it was asked for', () => {
  for (const c of [PLANT, TREE, { x: 0, z: 0, radius: 0.5, height: 1.2 }]) {
    const r = contactReach(c.radius, c.height, 0.5);
    assert.ok(skyOcclusionAt(r * 0.999, c.radius, c.height) >= 0.5 - 1e-3);
    assert.ok(skyOcclusionAt(r * 1.001, c.radius, c.height) <= 0.5 + 1e-3);
  }
});

test('an empty caster set delivers an identically-zero field, not an absent one', () => {
  const f = buildContactField({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    casters: [],
  });
  assert.ok(f.data.length > 0);
  assert.equal(contactCoverage(f), 0);
});

test('the pool surrounds the prop — it lands on the LIT side too, which is what a cast shadow never does', () => {
  const f = buildContactField({
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    casters: [TREE],
  });
  const at = (x: number, z: number): number => {
    const i = Math.round((x - f.minX) * f.gres);
    const j = Math.round((z - f.minZ) * f.gres);
    return f.data[j * f.w + i]! / 255;
  };
  // The authored light comes from -x/+z, so the cast shadow falls toward +x/-z. A contact
  // pool has to be present on BOTH sides at the same radius or it is just a short shadow.
  const r = TREE.radius + 2;
  assert.ok(at(r, 0) > 0.5, 'no pool on the +x side');
  assert.ok(at(-r, 0) > 0.5, 'no pool on the -x side');
  assert.ok(at(0, r) > 0.5, 'no pool on the +z side');
  assert.ok(at(0, -r) > 0.5, 'no pool on the -z side');
});

test('the contact grid matches buildShadowField exactly, so the two can be merged', () => {
  const bounds = { minX: -70, maxX: 70, minZ: -40, maxZ: 40 };
  const shadow = buildShadowField({ bounds, relief: 2.2, casters: [PLANT, TREE] });
  const contact = buildContactField({ bounds, casters: [PLANT, TREE] });
  assert.equal(contact.w, shadow.w);
  assert.equal(contact.h, shadow.h);
  assert.equal(contact.gres, shadow.gres);
  assert.equal(contact.minX, shadow.minX);
  assert.equal(contact.minZ, shadow.minZ);
});

test('mergeOcclusion takes the greater occlusion and never invents one', () => {
  const bounds = { minX: -70, maxX: 70, minZ: -40, maxZ: 40 };
  const shadow = buildShadowField({ bounds, relief: 2.2, casters: [TREE] });
  const contact = buildContactField({ bounds, casters: [TREE] });
  const merged = mergeOcclusion(shadow, contact);
  for (let p = 0; p < merged.data.length; p++) {
    assert.equal(merged.data[p], Math.max(shadow.data[p]!, contact.data[p]!));
  }
  // The merge can only ADD occlusion — a contact pool must never erase a cast shadow.
  assert.ok(contactCoverage(merged) >= contactCoverage(shadow));
  assert.ok(contactCoverage(merged) >= contactCoverage(contact));
});

test('mergeOcclusion REFUSES a grid mismatch rather than resampling one onto the other', () => {
  const a = buildContactField({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, casters: [] });
  const b = buildContactField({ bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 10 }, casters: [] });
  assert.throws(() => mergeOcclusion(a, b), /different grids/);
});

test('spread widens the pool without lifting the whole field toward the threshold', () => {
  const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
  const narrow = buildContactField({ bounds, casters: [PLANT] });
  const wide = buildContactField({ bounds, casters: [PLANT], spread: 2 });
  assert.ok(contactCoverage(wide) > contactCoverage(narrow));
  // Contact value at the foot stays saturated: widening moves the EDGE outward, it does not
  // brighten-then-darken everything at once.
  const at = (f: typeof narrow): number => {
    const i = Math.round((PLANT.x - f.minX) * f.gres);
    const j = Math.round((PLANT.z - f.minZ) * f.gres);
    return f.data[j * f.w + i]!;
  };
  assert.equal(at(wide), 255);
  assert.equal(at(narrow), 255);
});
