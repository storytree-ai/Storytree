// core.test.ts — the infrastructure gate.
//
// Half of these tests prove the checker goes RED on a deliberately broken building.
// A validator nobody has watched fail is not a validator.

import test from 'node:test';
import assert from 'node:assert/strict';
import { building, box, frustum, dome, gable, project, lightVector, shade, v3, DEG } from './procedural-utils.js';
import { check } from './invariants.js';
import { render } from './render-svg.js';

// ---------------------------------------------------------------------------
// projection + lighting
// ---------------------------------------------------------------------------

test('projection locks to strict 30-degree isometric', () => {
  const p = project(v3(1, 0, 0));
  assert.equal(Number(p.x.toFixed(6)), Number(Math.cos(30 * DEG).toFixed(6)));
  assert.equal(Number(p.y.toFixed(6)), Number(Math.sin(30 * DEG).toFixed(6)));
  // world +z rises on screen (SVG y grows downward)
  assert.ok(project(v3(0, 0, 5)).y < project(v3(0, 0, 0)).y);
});

test('parallel world lines stay parallel on screen', () => {
  const a0 = project(v3(0, 0, 0)),
    a1 = project(v3(10, 0, 0));
  const b0 = project(v3(0, 7, 3)),
    b1 = project(v3(10, 7, 3));
  const slopeA = (a1.y - a0.y) / (a1.x - a0.x);
  const slopeB = (b1.y - b0.y) / (b1.x - b0.x);
  assert.equal(Number(slopeA.toFixed(9)), Number(slopeB.toFixed(9)));
});

test('N dot L brightens the face that turns toward the light', () => {
  const light = lightVector(0, 0); // straight from +x
  assert.ok(shade(v3(1, 0, 0), light) > shade(v3(0, 1, 0), light));
  assert.ok(shade(v3(-1, 0, 0), light) >= 0.4, 'ambient floor keeps unlit faces readable');
});

// ---------------------------------------------------------------------------
// derived placement — the invariant that holds BY CONSTRUCTION
// ---------------------------------------------------------------------------

test('a part placed `on` another inherits its top exactly — no float is expressible', () => {
  const b = building({ name: 'stack' });
  b.add('base', box({ w: 10, d: 10, h: 6 }), { ground: true });
  b.add('mid', box({ w: 8, d: 8, h: 4 }), { on: 'base' });
  b.add('cap', gable({ w: 8, d: 8, h: 3 }), { on: 'mid' });
  assert.equal(b.part('mid').baseZ, 6);
  assert.equal(b.part('cap').baseZ, 10);
  assert.equal(check(b.model()).length, 0);
});

test('referencing an undeclared parent throws at author time, not render time', () => {
  const b = building({ name: 'bad' });
  assert.throws(() => b.add('roof', gable({ w: 4, d: 4, h: 2 }), { on: 'nope' }), /unknown part/);
});

// ---------------------------------------------------------------------------
// RED: the checker must catch what the relation cannot see
// ---------------------------------------------------------------------------

test('RED — a roof slid off its wall is reported', () => {
  const b = building({ name: 'sliding roof' });
  b.add('wall', box({ w: 10, d: 10, h: 8 }), { ground: true });
  b.add('roof', gable({ w: 10, d: 10, h: 4 }), { on: 'wall', at: { dx: 9, dy: 0 } });
  const v = check(b.model());
  assert.ok(v.some((x) => x.rule === 'support-overlap' && x.part === 'roof'), JSON.stringify(v));
});

test('RED — a window running past the end of its wall is reported', () => {
  const b = building({ name: 'overshoot' });
  b.add('wall', box({ w: 10, d: 10, h: 8 }), { ground: true });
  b.aperture('win', { host: 'wall', facet: 0, cu: 4.5, sill: 3, w: 3, h: 2 });
  const v = check(b.model());
  assert.ok(v.some((x) => x.rule === 'aperture-containment'), JSON.stringify(v));
});

test('RED — a window poking through the roofline is reported', () => {
  const b = building({ name: 'tall window' });
  b.add('wall', box({ w: 12, d: 12, h: 6 }), { ground: true });
  b.aperture('win', { host: 'wall', facet: 0, cu: 0, sill: 2, w: 3, h: 5 });
  assert.ok(check(b.model()).some((x) => x.rule === 'aperture-containment'));
});

test('RED — two overlapping windows are reported', () => {
  const b = building({ name: 'collide' });
  b.add('wall', box({ w: 20, d: 20, h: 10 }), { ground: true });
  b.aperture('a', { host: 'wall', facet: 0, cu: -1, sill: 3, w: 3, h: 3 });
  b.aperture('b', { host: 'wall', facet: 0, cu: 0.5, sill: 3, w: 3, h: 3 });
  assert.ok(check(b.model()).some((x) => x.rule === 'aperture-collision'));
});

test('RED — a door on an upper storey with nothing to stand on is reported', () => {
  const b = building({ name: 'sky door' });
  b.add('ground-floor', box({ w: 12, d: 12, h: 8 }), { ground: true });
  b.add('upper', box({ w: 12, d: 12, h: 8 }), { on: 'ground-floor' });
  b.aperture('door', { host: 'upper', facet: 0, cu: 0, sill: 0, w: 3, h: 5, kind: 'door' });
  assert.ok(check(b.model()).some((x) => x.rule === 'door-reachable'));
});

test('RED — an OVERHANGING part slid off its support is reported (the tipping test)', () => {
  // Regression: an area-fraction test alone passes this, because the wide cap keeps
  // the narrow collar fully covered even while hanging visibly off into space.
  const b = building({ name: 'sliding cap' });
  b.add('stem', frustum({ sides: 12, r0: 4, r1: 3.5, h: 14 }), { ground: true });
  b.add('cap', dome({ r: 13, h: 8, bulge: 2 }), { on: 'stem', at: { dx: 8, dy: 0 } });
  const v = check(b.model());
  assert.ok(
    v.some((x) => x.rule === 'support-overlap' && x.part === 'cap' && /tip/.test(x.detail)),
    'a cap whose centre leaves its stem must be caught: ' + JSON.stringify(v),
  );
});

test('GREEN — a concentric overhang is legitimate and passes', () => {
  const b = building({ name: 'toadstool' });
  b.add('stem', frustum({ sides: 12, r0: 4, r1: 3.5, h: 14 }), { ground: true });
  b.add('cap', dome({ r: 13, h: 8, bulge: 2 }), { on: 'stem' });
  assert.deepEqual(check(b.model()), []);
});

test('RED — a part claiming attachment while hanging clear is reported', () => {
  const b = building({ name: 'floating sign' });
  b.add('post', box({ w: 2, d: 2, h: 10 }), { ground: true });
  b.add('sign', box({ w: 3, d: 1, h: 2 }), { attached: 'post', dz: 6, at: { dx: 14, dy: 0 } });
  assert.ok(check(b.model()).some((x) => x.rule === 'attachment-contact'));
});

test('RED — geometry driven below the ground plane is reported', () => {
  const b = building({ name: 'sunken' });
  b.add('base', box({ w: 8, d: 8, h: 6 }), { ground: true, sink: 3 });
  assert.ok(check(b.model()).some((x) => x.rule === 'below-grade'));
});

// ---------------------------------------------------------------------------
// GREEN: the corrected forms pass
// ---------------------------------------------------------------------------

test('GREEN — the same building, correctly composed, is clean', () => {
  const b = building({ name: 'sound cottage', style: 'timber' });
  b.add('walls', box({ w: 14, d: 12, h: 9 }), { ground: true });
  b.add('roof', gable({ w: 14, d: 12, h: 5 }), { on: 'walls' });
  b.add('chimney', box({ w: 2, d: 2, h: 6 }), { on: 'walls', at: { dx: 4, dy: 0 } });
  b.aperture('door', { host: 'walls', facet: 0, cu: 0, sill: 0, w: 3, h: 5, kind: 'door' });
  b.aperture('w1', { host: 'walls', facet: 1, cu: -3, sill: 3.5, w: 2.4, h: 2.4 });
  b.aperture('w2', { host: 'walls', facet: 1, cu: 3, sill: 3.5, w: 2.4, h: 2.4 });
  assert.deepEqual(check(b.model()), []);
});

test('frustum facets taper, and the checker uses the NARROW end', () => {
  const b = building({ name: 'tower' });
  b.add('t', frustum({ sides: 8, r0: 8, r1: 4, h: 20 }), { ground: true });
  const f0 = b.part('t').shape.facets[0];
  assert.ok(f0, 'an 8-sided frustum has facets');
  assert.ok(f0.wTop < f0.wBottom, 'a tapered tower has narrower facets up top');
  // a window that fits at the sill but not at the head must still be caught
  b.aperture('w', { host: 't', facet: 0, cu: 0, sill: 14, w: f0.wBottom * 0.9, h: 3 });
  assert.ok(check(b.model()).some((x) => x.rule === 'aperture-containment'));
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

test('render emits sorted, culled SVG with no NaN', () => {
  const b = building({ name: 'render check', style: 'brick' });
  b.add('walls', box({ w: 12, d: 12, h: 9 }), { ground: true });
  b.add('cap', dome({ r: 9, h: 6 }), { on: 'walls' });
  b.aperture('door', { host: 'walls', facet: 0, cu: 0, sill: 0, w: 3, h: 5, kind: 'door' });
  const svg = render(b.model());
  assert.ok(svg.startsWith('<svg'), 'is an svg');
  assert.ok(!/NaN|Infinity/.test(svg), 'no degenerate coordinates');
  assert.ok(svg.split('<polygon').length > 8, 'drew a real number of faces');
});

test('backfaces are culled — a closed box shows 3 of its 6 sides', () => {
  const b = building({ name: 'cull' });
  b.add('c', box({ w: 6, d: 6, h: 6 }), { ground: true });
  const svg = render(b.model(), { showGround: false });
  assert.equal(svg.split('<polygon').length - 1, 3);
});

test('an aperture is never painted over by the wall it is cut into', () => {
  // Regression: the painter's algorithm keyed on each primitive's OWN centroid, so a
  // door pinned to the ground on a tall facet sorted BEHIND its own host wall and
  // vanished — while check() returned [] the whole time. Apertures now sort against
  // their host facet's depth. Swept over facet heights because the bug only appears
  // once the wall is tall enough for the centroid gap to exceed the outward nudge.
  for (const h of [4, 8, 14, 22, 30]) {
    const b = building({ name: `tall-${h}` });
    b.add('wall', box({ w: 12, d: 12, h }), { ground: true });
    b.aperture('door', { host: 'wall', facet: 0, cu: 0, sill: 0, w: 3, h: 3.2, kind: 'door' });
    const svg = render(b.model(), { showGround: false });
    const polys = svg.split('<polygon').slice(1);
    const wallIdx = polys.findIndex((p) => /fill="#[0-9a-f]{6}"/.test(p));
    const doorIdx = polys.length - 1;
    assert.ok(doorIdx > wallIdx, `at facet height ${h} the door must paint after its wall`);
    assert.equal(check(b.model()).length, 0);
  }
});

test('the light angle actually changes the shading', () => {
  const b = building({ name: 'lit' });
  b.add('c', box({ w: 6, d: 6, h: 6 }), { ground: true });
  const a = render(b.model(), { lightAngle: 0, showGround: false });
  const z = render(b.model(), { lightAngle: 180, showGround: false });
  assert.notEqual(a, z);
});
