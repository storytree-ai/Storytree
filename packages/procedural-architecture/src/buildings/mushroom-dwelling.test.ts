// mushroom-dwelling.test.ts — the proof.
//
// One lucky build proves nothing: the sweep below builds the whole declared
// parameter space and asserts the physics checker is silent for EVERY point in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../invariants.js';
import { apertureQuad, centroid, depthKey, facePoints } from '../procedural-utils.js';
import type { Aperture, BuildingModel, Part } from '../procedural-utils.js';
import { render, THEMES } from '../render-svg.js';
import { mushroomDwelling, expectedPartCount, DEFAULTS } from './mushroom-dwelling.js';

const FLOORS = [1, 2, 3];
const WIDTHS = [11, 15, 22];
const THEME_KEYS = Object.keys(THEMES);
const SEEDS = [1, 7, 42, 1337];

/** Look-ups that must hit: a miss is a broken model, so it fails loudly here rather
 *  than reading as an `undefined` the assertions below would quietly swallow. */
function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to exist`);
  return value;
}
const partsById = (m: BuildingModel): Map<string, Part> => new Map(m.parts.map((p) => [p.id, p]));
const quadOf = (m: BuildingModel, ap: Aperture) => must(apertureQuad(m, ap), `aperture quad for '${ap.id}'`);

// ---------------------------------------------------------------------------
// the sweep — the whole space must be physically sound
// ---------------------------------------------------------------------------

test('SWEEP — every combination of floors x footprint x theme x seed is physically sound', () => {
  let combos = 0;
  const failures: string[] = [];
  for (const floors of FLOORS) {
    for (const width_x of WIDTHS) {
      for (const width_y of WIDTHS) {
        for (const style_theme of THEME_KEYS) {
          for (const seed of SEEDS) {
            const params = { floors, width_x, width_y, style_theme, seed, light_angle: 40 + (seed % 300) };
            const model = mushroomDwelling(params);
            const v = check(model);
            combos++;
            if (v.length) {
              failures.push(
                `${JSON.stringify(params)}\n` +
                  v.map((x) => `    [${x.rule}] ${x.part ?? x.aperture}: ${x.detail}`).join('\n'),
              );
            }
          }
        }
      }
    }
  }
  assert.equal(failures.length, 0, `${failures.length}/${combos} combinations red:\n${failures.slice(0, 6).join('\n')}`);
  assert.ok(combos >= 500, `sweep should be broad, covered ${combos}`);
});

test('SWEEP — the mushroom-specific knobs stay sound across their ranges', () => {
  const failures: string[] = [];
  let combos = 0;
  for (const capSpread of [1.4, 1.78, 2.4]) {
    for (const capBulge of [0, 0.3, 0.55]) {
      for (const capRise of [0.45, 0.6, 0.85]) {
        for (const stemLean of [0, 0.55, 1]) {
          for (const spotCount of [0, 4, 11]) {
            for (const windowsPerFloor of [1, 2, 3]) {
              for (const storeyHeight of [4.2, 6.4, 9]) {
                const params = { capSpread, capBulge, capRise, stemLean, spotCount, windowsPerFloor, storeyHeight, floors: 3, seed: 5 };
                const v = check(mushroomDwelling(params));
                combos++;
                if (v.length) failures.push(`${JSON.stringify(params)} -> ${v.map((x) => `${x.rule}:${x.detail}`).join('; ')}`);
              }
            }
          }
        }
      }
    }
  }
  assert.equal(failures.length, 0, `${failures.length}/${combos} red:\n${failures.slice(0, 6).join('\n')}`);
});

// ---------------------------------------------------------------------------
// the structure is really there
// ---------------------------------------------------------------------------

test('part count scales with floors and spot count', () => {
  for (const floors of FLOORS) {
    for (const spotCount of [0, 3, 9]) {
      const m = mushroomDwelling({ floors, spotCount });
      assert.equal(m.parts.length, expectedPartCount({ floors, spotCount }), `floors=${floors} spots=${spotCount}`);
      assert.equal(m.parts.filter((p) => p.id.startsWith('stem-')).length, floors);
      assert.equal(m.parts.filter((p) => p.id.startsWith('spot-')).length, spotCount);
    }
  }
});

test('every storey gets its own window band, and there is exactly one door', () => {
  for (const floors of FLOORS) {
    for (const windowsPerFloor of [1, 2, 3]) {
      const m = mushroomDwelling({ floors, windowsPerFloor });
      const windows = m.apertures.filter((a) => a.kind === 'window');
      const doors = m.apertures.filter((a) => a.kind === 'door');
      assert.equal(windows.length, floors * windowsPerFloor);
      assert.equal(doors.length, 1);
      for (let k = 0; k < floors; k++) {
        assert.equal(windows.filter((a) => a.host === `stem-${k}`).length, windowsPerFloor, `storey ${k} band`);
      }
      // the door never shares a facet with a window
      const d = must(doors[0], 'the door');
      assert.ok(!windows.some((w) => w.host === d.host && w.facet === d.facet));
    }
  }
});

test('it is a mushroom — the cap genuinely overhangs the stem it stands on', () => {
  for (const width_x of WIDTHS) {
    for (const floors of FLOORS) {
      const m = mushroomDwelling({ floors, width_x, width_y: width_x });
      const cap = must(m.parts.find((p) => p.id === 'cap'), 'the cap');
      const foot = must(m.parts.find((p) => p.id === 'threshold'), 'the threshold');
      const collar = must(m.parts.find((p) => p.id === 'collar'), 'the collar');
      assert.ok(cap.shape.radius > foot.shape.radius * 1.25, `cap ${cap.shape.radius} vs foot ${foot.shape.radius}`);
      assert.ok(cap.shape.radius > collar.shape.radius * 1.3, 'cap overhangs the collar it sits on');
      // and it sits on the stack, not beside it
      assert.equal(cap.relation, 'on');
      assert.equal(cap.parentId, 'collar');
      assert.equal(collar.parentId, `stem-${floors - 1}`);
    }
  }
});

// The checker CANNOT see this one: rule 3 measures bbox overlap against the
// SMALLER footprint, so a cap much wider than its collar can slide a long way
// off and still score >55%. Centring is held by construction (no lateral offset
// is ever passed to the cap) — this test is what guards it.
test('the cap is concentric with the support it stands on', () => {
  for (const floors of FLOORS) {
    for (const seed of SEEDS) {
      for (const stemLean of [0, 1]) {
        const m = mushroomDwelling({ floors, seed, stemLean });
        const by = partsById(m);
        const cap = must(by.get('cap'), 'the cap');
        const collar = must(by.get('collar'), 'the collar');
        assert.equal(cap.origin.x, collar.origin.x, 'cap must not drift off its collar in x');
        assert.equal(cap.origin.y, collar.origin.y, 'cap must not drift off its collar in y');
        const top = must(by.get(`stem-${floors - 1}`), 'the top storey');
        assert.equal(collar.origin.x, top.origin.x);
        assert.equal(collar.origin.y, top.origin.y);
        // and the stem's own wobble stays inside the taper it is carried by
        const chain = ['threshold', ...Array.from({ length: floors }, (_, k) => `stem-${k}`)];
        for (let k = 1; k < chain.length; k++) {
          const child = must(by.get(must(chain[k], `chain[${k}]`)), `part ${chain[k]}`);
          const parent = must(by.get(must(chain[k - 1], `chain[${k - 1}]`)), `part ${chain[k - 1]}`);
          const drift = Math.hypot(child.origin.x - parent.origin.x, child.origin.y - parent.origin.y);
          assert.ok(drift < parent.shape.radius - child.shape.radius + 1e-9, `storey ${k} leans past its support`);
        }
      }
    }
  }
});

test('the stack is derived — every course inherits the top of the one below', () => {
  const m = mushroomDwelling({ floors: 3 });
  const by = partsById(m);
  assert.equal(must(by.get('threshold'), 'threshold').baseZ, 0);
  assert.equal(must(by.get('stem-0'), 'stem-0').baseZ, must(by.get('threshold'), 'threshold').topZ);
  for (const k of [1, 2]) {
    assert.equal(must(by.get(`stem-${k}`), `stem-${k}`).baseZ, must(by.get(`stem-${k - 1}`), `stem-${k - 1}`).topZ);
  }
  assert.equal(must(by.get('collar'), 'collar').baseZ, must(by.get('stem-2'), 'stem-2').topZ);
  assert.equal(must(by.get('cap'), 'cap').baseZ, must(by.get('collar'), 'collar').topZ);
  // the gills hang flush under the cap, derived from the cap's own base
  assert.ok(Math.abs(must(by.get('gills'), 'gills').topZ - must(by.get('cap'), 'cap').baseZ) < 1e-9);
});

test("the door's threshold is on the ground", () => {
  for (const floors of FLOORS) {
    for (const width_x of WIDTHS) {
      const m = mushroomDwelling({ floors, width_x, width_y: width_x });
      const door = must(m.apertures.find((a) => a.kind === 'door'), 'the door');
      const q = quadOf(m, door);
      assert.ok(Math.min(q.pts[0].z, q.pts[1].z) <= 0.001, 'threshold at grade');
      assert.ok(q.pts[3].z > 1.5, 'and the head is a person-height above it');
    }
  }
});

// Another one the physics checker is blind to, and the one that actually bit:
// render-svg.ts is a painter's algorithm keyed on centroid depth, and depth
// grows with height. A wall polygon's centroid sits at mid-facet, so an aperture
// low on a TALL facet is painted OVER by the very wall it is cut into — the
// model is sound, the picture just silently loses the door. Every aperture must
// win its own wall.
const PANE_BIAS = 0.24; // mirrors render-svg.ts
const PANE_NUDGE = 0.11;

test('no aperture is buried behind the wall it is cut into', () => {
  const buried: string[] = [];
  for (const floors of FLOORS) {
    for (const width_x of WIDTHS) {
      for (const storeyHeight of [4.2, 5.4, 9]) {
        for (const doorHeight of [2.2, 4, 6]) {
          const m = mushroomDwelling({ floors, width_x, width_y: width_x, storeyHeight, doorHeight });
          const by = partsById(m);
          for (const ap of m.apertures) {
            const host = must(by.get(ap.host), `host '${ap.host}'`);
            const q = quadOf(m, ap);
            const n = q.facet.normal;
            const pane = q.pts.map((p) => ({ x: p.x + n.x * PANE_NUDGE, y: p.y + n.y * PANE_NUDGE, z: p.z + n.z * PANE_NUDGE }));
            const paneDepth = depthKey(centroid(pane)) + PANE_BIAS;
            // the frustum emits one wall face per facet, in facet order
            const wall = facePoints(host.world, must(host.shape.faces[ap.facet], `wall face ${ap.facet}`));
            const wallDepth = depthKey(centroid(wall));
            if (paneDepth <= wallDepth) {
              buried.push(`${ap.id} on ${ap.host} (floors=${floors} storeyH=${storeyHeight} doorH=${doorHeight}): pane ${paneDepth.toFixed(3)} <= wall ${wallDepth.toFixed(3)}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual(buried, [], `apertures painted over by their own wall:\n  ${buried.slice(0, 8).join('\n  ')}`);
});

test('jitter is deterministic in `seed` and nowhere near the load path', () => {
  const a = mushroomDwelling({ seed: 3 });
  const b = mushroomDwelling({ seed: 3 });
  const c = mushroomDwelling({ seed: 4 });
  const zs = (m: BuildingModel): number[] =>
    m.parts.filter((p) => p.id.startsWith('stem-') || p.id === 'cap').map((p) => p.baseZ);
  assert.deepEqual(JSON.stringify(a.parts.map((p) => p.origin)), JSON.stringify(b.parts.map((p) => p.origin)));
  assert.notEqual(JSON.stringify(a.parts.map((p) => p.origin)), JSON.stringify(c.parts.map((p) => p.origin)));
  // derived heights are identical: the seed moves the lean and the spots, not the load path
  assert.deepEqual(zs(a), zs(c));
});

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

test('render emits clean SVG for every theme', () => {
  for (const theme of THEME_KEYS) {
    for (const floors of FLOORS) {
      const svg = render(mushroomDwelling({ floors, style_theme: theme }), { width: 640 });
      assert.ok(svg.startsWith('<svg'), 'is an svg');
      assert.ok(!/NaN|Infinity|undefined/.test(svg), `${theme}/${floors}: degenerate output`);
      assert.ok(svg.split('<polygon').length > 100, 'drew a real building');
    }
  }
});

test('the defaults are the shipped shape', () => {
  assert.equal(DEFAULTS.style_theme, 'mushroom');
  assert.equal(DEFAULTS.floors, 1, 'the shipped dwelling is the single-storey one');
  assert.deepEqual(check(mushroomDwelling()), []);
});
