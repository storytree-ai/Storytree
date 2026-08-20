// land-shadow.test.ts — the shadow FIELD's geometry, proved without a browser.
//
// Every assertion here is about WHERE the shadow falls and HOW LONG it is, which are the two
// things a plausible-looking wrong picture gets wrong silently. A shadow thrown toward the
// light instead of away from it looks completely normal until you notice the whole island is
// lit from the wrong side, and this arc has already paid for one render on exactly that
// class of sign error.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LAND_CAMERA_ELEVATION_DEG, groundFlattening, uprightForeshortening } from '@storytree/forest-world';

import { groundBounds, groundCellsFrom } from './island-descriptors.js';
import { islandScene } from './island-fixture.js';
import { LAND_RELIEF_AMPLITUDE, landHeight } from './land-definition.js';
import { plantsFrom } from './plant-descriptors.js';
import { treesFrom } from './tree-descriptors.js';
import {
  SHADOW_GRES,
  buildShadowField,
  lightSlope,
  maxTerrainCast,
  maxTerrainSlope,
  terrainSelfShadows,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  type ShadowCaster,
} from './land-shadow.js';
import { LIGHT_DIRECTION } from './palette-band.js';

const BOUNDS = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

test('the shadow points AWAY from the light, and is derived from the one authored direction', () => {
  const dir = shadowDirection();
  assert.ok(Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-9, 'not a unit vector');
  // The sign check that matters: the ground projection of the light and the shadow must
  // point in opposite directions. Getting this backwards is invisible in code review and
  // obvious only in a picture nobody has rendered yet.
  const lightGround = { x: LIGHT_DIRECTION.x, z: LIGHT_DIRECTION.z };
  assert.ok(dir.x * lightGround.x + dir.z * lightGround.z < 0);
});

test('shadow length per unit of height is cot(light elevation), not something adjacent to it', () => {
  const perUnit = shadowOffsetPerUnitHeight();
  const elevation = Math.atan2(
    LIGHT_DIRECTION.y,
    Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z),
  );
  assert.ok(Math.abs(perUnit - 1 / Math.tan(elevation)) < 1e-9);
  // The two foreshortenings this package has confused before are 0.342 and 0.940; this is
  // neither, and the assertion is here so a "fix" that reached for one of them fails loudly.
  assert.ok(Math.abs(perUnit - 0.342) > 0.1);
  assert.ok(Math.abs(perUnit - 0.94) > 0.1);
});

test('a single caster on FLAT land throws its shadow the analytic distance, in the right place', () => {
  const caster: ShadowCaster = { x: 0, z: 0, radius: 2, height: 10 };
  const field = buildShadowField({ bounds: BOUNDS, relief: 0, casters: [caster], terrain: false });
  const dir = shadowDirection();
  const reach = caster.height * shadowOffsetPerUnitHeight();

  // At the caster's own foot: a contact shadow.
  assert.ok(sampleShadowField(field, 0, 0) > 0.5);
  // Just short of the tip's landing point: still shadowed.
  const nearTip = { x: dir.x * (reach - 0.5), z: dir.z * (reach - 0.5) };
  assert.ok(sampleShadowField(field, nearTip.x, nearTip.z) > 0.5, 'the shadow is too short');
  // Well past it: not.
  const pastTip = { x: dir.x * (reach + 4), z: dir.z * (reach + 4) };
  assert.ok(sampleShadowField(field, pastTip.x, pastTip.z) < 0.5, 'the shadow is too long');
  // And on the LIGHT side of the caster there is no shadow at all, at any distance.
  for (const d of [1, 3, reach, reach + 4]) {
    assert.equal(
      sampleShadowField(field, -dir.x * d, -dir.z * d) > 0.5,
      false,
      `shadow ${d} units toward the light`,
    );
  }
});

test('a taller caster throws a proportionally longer shadow', () => {
  const short = buildShadowField({
    bounds: BOUNDS,
    relief: 0,
    casters: [{ x: 0, z: 0, radius: 2, height: 5 }],
    terrain: false,
  });
  const tall = buildShadowField({
    bounds: BOUNDS,
    relief: 0,
    casters: [{ x: 0, z: 0, radius: 2, height: 15 }],
    terrain: false,
  });
  const dir = shadowDirection();
  const at = (f: typeof short, d: number) => sampleShadowField(f, dir.x * d, dir.z * d) > 0.5;
  assert.equal(at(short, 2), true);
  assert.equal(at(short, 9), false, '5 units of height reaches 3.5 ground units, not 9');
  assert.equal(at(tall, 9), true, '15 units of height reaches 10.4 ground units');
  assert.ok(shadowCoverage(tall) > shadowCoverage(short) * 2);
});

test('FLAT land with no casters is unshadowed — the control that keeps every other test honest', () => {
  const field = buildShadowField({ bounds: BOUNDS, relief: 0, casters: [] });
  assert.equal(shadowCoverage(field), 0);
  assert.equal(
    field.data.reduce((s, v) => s + v, 0),
    0,
    'a plane cannot shade itself and nothing else is present',
  );
});

test('THE FINDING: at the SHIPPED amplitude the land cannot shadow itself AT ALL', () => {
  // Not "small". Zero. A height field self-shadows only where it is steeper than the light,
  // and the authored light comes in at 55.2 degrees while the relief's steepest slope at
  // amplitude 2.2 is 24.4. The terrain march below runs and finds nothing, every time.
  assert.equal(terrainSelfShadows(LAND_RELIEF_AMPLITUDE), false);
  assert.ok(maxTerrainSlope(LAND_RELIEF_AMPLITUDE) < lightSlope() / 3);
  const field = buildShadowField({
    bounds: BOUNDS,
    relief: LAND_RELIEF_AMPLITUDE,
    casters: [],
    canopy: false,
  });
  assert.equal(shadowCoverage(field), 0);
  assert.equal(field.data.reduce((s, v) => s + v, 0), 0);
  // AND IT IS NOT A NEAR MISS, which is the part that makes this a decision rather than a
  // tuning note. Peak slope is linear in amplitude, so reaching the light needs about 7.0 —
  // over three times the shipped 2.2 and over twice the 3.2 the previous increment already
  // rejected for churning the island's silhouette.
  assert.equal(terrainSelfShadows(3.2), false, '3.2 was already rejected and still would not');
  assert.equal(terrainSelfShadows(6.0), false);
});

test('NON-VACUITY: the terrain term DOES fire on land steep enough to cast', () => {
  // Without this, "the terrain casts nothing" would be indistinguishable from a march that
  // is simply broken — which is the exact shape of a check that passes for the wrong reason.
  const steep = 9;
  assert.equal(terrainSelfShadows(steep), true);
  const field = buildShadowField({ bounds: BOUNDS, relief: steep, casters: [], canopy: false });
  const coverage = shadowCoverage(field);
  assert.ok(coverage > 0.01, `a ${steep}-amplitude field shadows nothing: coverage ${coverage}`);
  assert.ok(coverage < 0.5, `it shadows over half of itself: coverage ${coverage}`);
  // The reach bound the march is allowed to assume.
  assert.ok(maxTerrainCast(steep) > 0);
  assert.equal(maxTerrainCast(0), 0, 'a flat field has no cast at all');
});

test('a shadowed sample really is downhill-of-a-ridge, checked against the height field', () => {
  // The field is built by a march; this re-derives the SAME claim from `landHeight` directly,
  // so a march that quietly walked the wrong way could not agree with it. Run at the STEEP
  // amplitude, because the shipped one produces no terrain shadow to check (see above) and a
  // check with nothing to check is not a check. 12 rather than the 9 the test above uses,
  // because at 9 only six samples on this grid are shadowed and six is not a sample.
  const RELIEF = 12;
  const field = buildShadowField({ bounds: BOUNDS, relief: RELIEF, casters: [], canopy: false });
  const dir = shadowDirection();
  const perUnit = shadowOffsetPerUnitHeight();
  // THE MARCH TAKES ITS TAPS ON THE LATTICE, so a tap sits up to half a texel away from the
  // exact ray and reads a height up to `halfTexel x slope` off. That is the discretisation
  // the field IS, so the re-derivation grants exactly that much slack and no more — which
  // still leaves the check with all its teeth, since a march walking the wrong way finds
  // nothing at any slack at all.
  const slack = (0.5 / field.gres) * maxTerrainSlope(RELIEF);
  let checked = 0;
  // WALK THE FIELD'S OWN LATTICE, not arbitrary ground points. `sampleShadowField`
  // interpolates, so a point sitting between a shadowed texel and a lit one reads above the
  // threshold while the exact ground position under it is genuinely unoccluded — and a test
  // that chased that would be re-deriving the interpolator rather than the march.
  for (let j = 0; j < field.h; j += 2) {
    for (let i = 0; i < field.w; i += 2) {
      if (field.data[j * field.w + i]! / 255 <= 0.5) continue;
      const x = field.minX + i / field.gres;
      const z = field.minZ + j / field.gres;
      const y0 = landHeight(x, z, RELIEF);
      let blocked = false;
      for (let d = 0.1; d <= maxTerrainCast(RELIEF); d += 0.1) {
        // TOWARD the light — the opposite of the shadow's own direction.
        if (landHeight(x - dir.x * d, z - dir.z * d, RELIEF) > y0 + d / perUnit - slack) {
          blocked = true;
          break;
        }
      }
      assert.ok(blocked, `(${x}, ${z}) is shadowed but nothing between it and the light is higher`);
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} shadowed samples on the grid — too few to prove anything`);
});

test('the field covers the requested bounds with margin, at the declared resolution', () => {
  const field = buildShadowField({ bounds: BOUNDS, relief: 0, casters: [] });
  assert.equal(field.gres, SHADOW_GRES);
  assert.ok(field.minX <= BOUNDS.minX && field.minZ <= BOUNDS.minZ);
  assert.ok(field.minX + field.w / field.gres >= BOUNDS.maxX);
  assert.ok(field.minZ + field.h / field.gres >= BOUNDS.maxZ);
  // Sampling outside clamps rather than wrapping: a wrap would teleport a shadow from one
  // coast to the other and read as a stray dark band at the rim.
  assert.equal(sampleShadowField(field, -9999, -9999), 0);
  assert.equal(sampleShadowField(field, 9999, 9999), 0);
});

test('the two terms are SEPARABLE, and together are the union of the two', () => {
  const casters: ShadowCaster[] = [{ x: 5, z: -5, radius: 3, height: 12 }];
  // Steep enough that the terrain term has something to contribute — at the shipped
  // amplitude it contributes nothing and the union would be trivially the canopy.
  const opts = { bounds: BOUNDS, relief: 9, casters };
  const terrain = buildShadowField({ ...opts, canopy: false });
  const canopy = buildShadowField({ ...opts, terrain: false });
  const both = buildShadowField(opts);
  assert.ok(shadowCoverage(terrain) > 0);
  assert.ok(shadowCoverage(canopy) > 0);
  // `max` composition, so the union is exactly the pointwise maximum — no double-darkening
  // where the two overlap. On a one-rung ladder there is nowhere for a second darkening to
  // go, so a term that could compound would only be able to lie about its own strength.
  for (let p = 0; p < both.data.length; p++) {
    assert.equal(both.data[p], Math.max(terrain.data[p]!, canopy.data[p]!));
  }
});

test('ON THE REAL FIXTURE: the hero tree throws as much shadow as all 144 plants together', () => {
  // The sequencing finding, and it is a MEASUREMENT now rather than a projection: the hero
  // story tree landed on the island while this pass was in flight (PR #1451), so the tall
  // caster the shadow was waiting for is actually here.
  const scene = islandScene({});
  const cells = groundCellsFrom(scene);
  const b = groundBounds(cells);
  const bounds = { minX: b.minX, maxX: b.maxX, minZ: b.minY, maxZ: b.maxY };
  const flat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const up = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
  const asCaster = (p: {
    transform: { x: number; z: number };
    footprint: { w: number; h: number };
  }): ShadowCaster => ({
    x: p.transform.x,
    z: p.transform.z / flat,
    radius: Math.max(1.5, p.footprint.w) / 2,
    height: Math.max(1.2, p.footprint.h / up),
  });
  const plants = plantsFrom(scene).map(asCaster);
  const trees = treesFrom(scene).map(asCaster);
  assert.ok(plants.length > 120, `only ${plants.length} plants — the fixture changed`);
  assert.equal(trees.length, 1, 'one hero story tree');
  assert.ok(trees[0]!.height > 90, `the hero tree is only ${trees[0]!.height.toFixed(1)} units tall`);

  const insideIsland = (x: number, z: number): boolean => {
    for (const c of cells) {
      const pts = c.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i]!.x;
        const zi = pts[i]!.y;
        const xj = pts[j]!.x;
        const zj = pts[j]!.y;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
  const groundCoverage = (casters: ShadowCaster[]): number => {
    const f = buildShadowField({
      bounds,
      relief: LAND_RELIEF_AMPLITUDE,
      casters,
      terrain: false,
    });
    let on = 0;
    let total = 0;
    for (let j = 0; j < f.h; j += 2) {
      for (let i = 0; i < f.w; i += 2) {
        if (!insideIsland(f.minX + i / f.gres, f.minZ + j / f.gres)) continue;
        total++;
        if (f.data[j * f.w + i]! / 255 > 0.5) on++;
      }
    }
    return on / total;
  };

  const canopy = groundCoverage(plants);
  const hero = groundCoverage(trees);
  assert.ok(canopy > 0.1, `144 plants shadow only ${(canopy * 100).toFixed(1)}% of the ground`);
  // ONE prop against a hundred and forty-four. This is why the shadow's payoff moved the
  // moment the tree landed, and it is the whole argument for measuring the island rather than
  // the component.
  assert.ok(
    hero > canopy * 0.5,
    `the hero tree shadows ${(hero * 100).toFixed(1)}% against the canopy's ${(canopy * 100).toFixed(1)}%`,
  );
  // ...and its cast crosses a serious fraction of the island, which is why one prop can do that.
  const cast = trees[0]!.height * shadowOffsetPerUnitHeight();
  assert.ok(cast > (bounds.maxX - bounds.minX) / 5, `cast ${cast.toFixed(0)} units`);
});
