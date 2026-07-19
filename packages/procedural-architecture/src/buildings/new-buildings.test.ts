// new-buildings.test.ts — houses re-authored through the finished factory.
//
// `tiered-pagoda` was picked from the nineteen hand-drawn houses in
// docs/research/forest-house-art/ because it stresses the part of the machinery the
// first two did not: it is a stack of deliberate overhangs, which is the occlusion case.
//
// A `coastal-stilt-house` was authored alongside it and then DROPPED (owner call,
// 2026-07-19): a house on stilts hides its own understructure and would occlude its
// neighbours, so it wastes tile area in a top-down map. What it bought survives it —
// the `door-reachable` rule below used to check only a threshold's HEIGHT, so a door
// onto any raised deck, veranda or jetty was a violation. Those tests are the durable
// residue of a building that is no longer shipped, and they stand on their own minimal
// models rather than on the house that exposed the gap.

import test from 'node:test';
import assert from 'node:assert/strict';

import { building, box, gable, flaredRoof, frustum } from '../procedural-utils.js';
import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { tieredPagoda, DEFAULTS as PAGODA } from './tiered-pagoda.js';

// ---------------------------------------------------------------------------
// end to end. The list is a list because the next building joins it here.
// ---------------------------------------------------------------------------

for (const [label, build] of [['tiered-pagoda', tieredPagoda]] as const) {
  test(`${label} is physically sound and orders without inversion`, () => {
    const model = build();
    assert.deepEqual(check(model), []);
    const detail = renderDetailed(model, { showGround: false });
    assert.deepEqual(findDepthConflicts(detail.polys), []);
    assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
  });

  test(`${label} stays sound across its parameter space, not just at its defaults`, () => {
    // A building that is only green at one point is a lucky build, not a factory.
    for (const floors of [2, 3, 4]) {
      for (const width of [8, 11, 15]) {
        for (const light of [45, 135, 225]) {
          const model = build({ floors, width_x: width, width_y: width * 0.9, light_angle: light });
          assert.deepEqual(check(model), [], `${label} floors=${floors} width=${width} light=${light}`);
        }
      }
    }
  });

  test(`${label} is deterministic — same parameters, byte-identical SVG`, () => {
    assert.equal(renderDetailed(build()).svg, renderDetailed(build()).svg);
  });
}

test('the pagoda really is a stack of overhangs — station 3 has work to do', () => {
  // If this ever stops splitting, the model has stopped exercising the thing it was
  // chosen for and the "hardest occlusion test in the gallery" claim is stale.
  const detail = renderDetailed(tieredPagoda(), { showGround: false });
  assert.ok(detail.order.splits > 10, `only ${detail.order.splits} splits — is it still overhanging?`);
  assert.deepEqual(findDepthConflicts(detail.polys), []);
});

test('every pagoda tier is carried by the one below it', () => {
  const model = tieredPagoda({ floors: 4 });
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  for (let k = 1; k < 4; k++) {
    const wall = byId.get(`tier-${k}-wall`);
    assert.ok(wall, `tier ${k} exists`);
    assert.equal(wall.relation, 'on');
    assert.equal(wall.parentId, `tier-${k - 1}-roof`, 'a storey stands on the roof below it');
    const below = byId.get(`tier-${k - 1}-wall`);
    assert.ok(below && wall.baseZ > below.topZ, 'and strictly above that storey');
  }
});

// ---------------------------------------------------------------------------
// the checker gap the stilt house found
// ---------------------------------------------------------------------------

test('RED: a door opening into mid-air is still refused', () => {
  // The rule must not have been loosened into uselessness by teaching it about decks.
  const b = building({ name: 'no landing' });
  b.add('post', box({ w: 2, d: 2, h: 6 }), { ground: true });
  b.add('cabin', box({ w: 6, d: 6, h: 4 }), { on: 'post' });
  b.aperture('door', { host: 'cabin', facet: 0, cu: 0, sill: 0, w: 2, h: 3, kind: 'door' });
  const v = check(b.model());
  assert.equal(v.length, 1);
  assert.equal(v[0]?.rule, 'door-reachable');
});

test('GREEN: the same door is fine once there is a deck to stand on', () => {
  const b = building({ name: 'landing' });
  b.add('post', box({ w: 2, d: 2, h: 6 }), { ground: true });
  b.add('deck', box({ w: 12, d: 12, h: 0.5 }), { on: 'post' });
  b.add('cabin', box({ w: 6, d: 6, h: 4 }), { on: 'deck' });
  b.aperture('door', { host: 'cabin', facet: 0, cu: 0, sill: 0, w: 2, h: 3, kind: 'door' });
  assert.deepEqual(check(b.model()), []);
});

test('a deck that does not reach the doorway is not a landing', () => {
  // The rule looks for floor at the THRESHOLD, not merely for a deck somewhere in the
  // model — otherwise any raised platform would launder every door in the building.
  const b = building({ name: 'short deck' });
  b.add('post', box({ w: 2, d: 2, h: 6 }), { ground: true });
  b.add('deck', box({ w: 6, d: 6, h: 0.5 }), { on: 'post', at: { dx: -6 } });
  b.add('cabin', box({ w: 6, d: 6, h: 4 }), { on: 'post' });
  b.aperture('door', { host: 'cabin', facet: 0, cu: 0, sill: 0, w: 2, h: 3, kind: 'door' });
  assert.ok(check(b.model()).some((v) => v.rule === 'door-reachable'));
});

test('a ground-level door still needs no landing at all', () => {
  const b = building({ name: 'plain' });
  b.add('wall', box({ w: 8, d: 8, h: 6 }), { ground: true });
  b.aperture('door', { host: 'wall', facet: 0, cu: 0, sill: 0, w: 2, h: 3, kind: 'door' });
  assert.deepEqual(check(b.model()), []);
});

// ---------------------------------------------------------------------------
// the kit addition
// ---------------------------------------------------------------------------

test('flaredRoof overhangs, narrows upward, and never inverts', () => {
  const r = flaredRoof({ sides: 4, r0: 8, r1: 2, h: 3, rings: 5 });
  assert.equal(r.height, 3);
  assert.equal(r.radius, 8);
  // Sampling the profile: radius must fall monotonically from eave to ridge, or the
  // roof bulges outward partway up and reads as a mushroom.
  const ringRadius = (ring: number): number => {
    const pts = r.verts.slice(ring * 4, ring * 4 + 4);
    return Math.max(...pts.map((p) => Math.hypot(p.x, p.y)));
  };
  for (let ring = 1; ring <= 5; ring++) {
    assert.ok(ringRadius(ring) < ringRadius(ring - 1) + 1e-9, `ring ${ring} is no wider than the one below`);
  }
  assert.ok(Math.abs(ringRadius(0) - 8) < 1e-9, 'the eave is the declared radius');
});

test('flaredRoof at sweep 1 is a straight hip roof', () => {
  const straight = flaredRoof({ sides: 4, r0: 6, r1: 2, h: 4, rings: 4, sweep: 1 });
  const radiusAtRing = (ring: number): number => Math.hypot(straight.verts[ring * 4]!.x, straight.verts[ring * 4]!.y);
  // Linear interpolation from 6 to 2 over four rings: 6, 5, 4, 3, 2.
  for (const [ring, want] of [6, 5, 4, 3, 2].entries()) {
    assert.ok(Math.abs(radiusAtRing(ring) - want) < 1e-9, `ring ${ring} is ${want}`);
  }
});

test('a flared roof does not stroke the seams between its profile rings', () => {
  // Those seams are an artefact of sampling a curve. Outlining them bands the roof like
  // a stack of trays — the same defect class as a split fragment outlining its cut.
  const b = building({ name: 'roofed' });
  b.add('wall', box({ w: 8, d: 8, h: 5 }), { ground: true });
  b.add('cap', flaredRoof({ sides: 4, rot: 45, r0: 7, r1: 2, h: 3 }), { on: 'wall' });
  const svg = renderDetailed(b.model(), { showGround: false }).svg;
  const roofFills = [...svg.matchAll(/<polygon points="[^"]*" fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})"/g)];
  assert.ok(roofFills.some(([, fill, stroke]) => fill === stroke), 'the swept faces stroke in their own colour');
});

// ---------------------------------------------------------------------------
// the defaults are the thing the owner is looking at
// ---------------------------------------------------------------------------

test('the shipped defaults are the ones under test', () => {
  assert.equal(PAGODA.floors, 3);
  assert.equal(PAGODA.style_theme, 'temple');
});

test('a gable roof and a flared roof compose without inversion', () => {
  const b = building({ name: 'mixed' });
  b.add('wall', box({ w: 9, d: 9, h: 5 }), { ground: true });
  b.add('skirt', flaredRoof({ sides: 4, rot: 45, r0: 8, r1: 4, h: 1.6 }), { on: 'wall' });
  b.add('upper', box({ w: 5, d: 5, h: 3 }), { on: 'skirt' });
  b.add('cap', gable({ w: 5.6, d: 5.4, h: 2.6 }), { on: 'upper' });
  b.add('flue', frustum({ sides: 6, r0: 0.5, r1: 0.42, h: 4 }), { on: 'upper', at: { dx: 1.4 }, material: 'stone' });
  const model = b.model();
  assert.deepEqual(check(model), []);
  assert.deepEqual(findDepthConflicts(renderDetailed(model, { showGround: false }).polys), []);
});
