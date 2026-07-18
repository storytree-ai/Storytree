// forest-windmill.test.ts — the proof.
//
// One green build proves nothing; the sweep below proves the PARAMETER SPACE is
// sound. The sail tests are separated out because the sails are the part whose
// worst case (a blade pointing straight down) only exists at some angles.

import test from 'node:test';
import assert from 'node:assert/strict';
import { forestWindmill, DEFAULTS } from './forest-windmill.js';
import { check, assertSound } from '../invariants.js';
import { bbox, building, box, frustum, dome } from '../procedural-utils.js';
import type { Aperture, BuildingModel, Part, Rotation } from '../procedural-utils.js';
import { render, THEMES } from '../render-svg.js';

const THEME_KEYS = Object.keys(THEMES);

const spars = (m: BuildingModel): Part[] => m.parts.filter((p) => /^sail-spar-\d+$/.test(p.id));
const windows = (m: BuildingModel): Aperture[] => m.apertures.filter((a) => a.kind !== 'door');

/** Look-ups that must hit: a miss is a broken model, so it fails loudly here rather
 *  than reading as an `undefined` the assertions below would quietly swallow. */
function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to exist`);
  return value;
}
const partsById = (m: BuildingModel): Map<string, Part> => new Map(m.parts.map((p) => [p.id, p]));
/** A sail part is always spun about its blade axis — the rotation is the relation. */
const spinOf = (p: Part): Rotation => must(p.rotate, `a rotation on '${p.id}'`);

// ---------------------------------------------------------------------------
// the sweep
// ---------------------------------------------------------------------------

test('SWEEP — every combination of the parameter surface is physically sound', () => {
  const widths = [9, 12, 16];
  const sailAngles = [0, 22, 45, 90, 137, 250];
  let combos = 0;
  const failures: string[] = [];

  for (const floors of [2, 3, 4, 5]) {
    for (const width_x of widths) {
      for (const width_y of widths) {
        for (const bladeCount of [4, 5, 6]) {
          for (const sailAngle of sailAngles) {
            for (const style_theme of THEME_KEYS) {
              const params = { floors, width_x, width_y, bladeCount, sailAngle, style_theme };
              const v = check(forestWindmill(params));
              combos++;
              if (v.length) failures.push(`${JSON.stringify(params)} -> ${v.map((x) => `[${x.rule}] ${x.part ?? x.aperture}: ${x.detail}`).join('; ')}`);
            }
          }
        }
      }
    }
  }

  assert.equal(failures.length, 0, `${failures.length}/${combos} combinations violated physics:\n` + failures.slice(0, 8).join('\n'));
  assert.ok(combos >= 2000, `sweep must be broad, only covered ${combos}`);
});

test('SWEEP — the awkward corners: extreme taper, blade length, seed, light angle', () => {
  for (const taper of [0.42, 0.5, 0.6, 0.7, 0.8]) {
    for (const bladeLength of [4, 8, 13, 20, 30]) {
      for (const floors of [2, 5]) {
        for (const seed of [1, 7, 99, 4242]) {
          for (const slatsPerBlade of [0, 2, 4]) {
            for (const tailAngle of [95, 118, 150]) {
              const params = { taper, bladeLength, floors, seed, slatsPerBlade, tailAngle, width_x: 9, width_y: 14, light_angle: 20 };
              assertSound(forestWindmill(params));
            }
          }
        }
      }
    }
  }
});

test('the raked tail is shortened to fit its mounting height, never buried', () => {
  // The tail leans PAST horizontal, so it has the sails' problem in miniature.
  for (const tailAngle of [95, 110, 125, 140, 150]) {
    for (const floors of [2, 5]) {
      for (const width_x of [9, 16]) {
        const m = forestWindmill({ tailAngle, floors, width_x, width_y: width_x, bladeLength: 6 });
        const tail = m.parts.filter((p) => p.id.startsWith('tail-'));
        assert.equal(tail.length, 2);
        for (const part of tail) {
          assert.ok(bbox(part).min.z >= 0, `${part.id} dipped to ${bbox(part).min.z.toFixed(2)}`);
        }
        assert.deepEqual(check(m), []);
      }
    }
  }
});

test('out-of-range parameters are clamped, not obeyed into a violation', () => {
  for (const params of [
    { floors: 0 }, { floors: 99 }, { taper: 0.01 }, { taper: 5 },
    { bladeCount: 1 }, { bladeCount: 40 }, { bladeLength: 0 },
    { width_x: 1, width_y: 1 }, { style_theme: 'not-a-theme' }, { tailAngle: 5 }, { tailAngle: 175 },
  ]) {
    assertSound(forestWindmill(params));
  }
});

// ---------------------------------------------------------------------------
// the sails
// ---------------------------------------------------------------------------

test('blade count matches the parameter', () => {
  for (const bladeCount of [3, 4, 5, 6, 8]) {
    assert.equal(spars(forestWindmill({ bladeCount })).length, bladeCount);
  }
});

test('blades are evenly spaced in angle, offset by sailAngle', () => {
  for (const bladeCount of [4, 5, 6]) {
    for (const sailAngle of [0, 17, 200]) {
      const m = forestWindmill({ bladeCount, sailAngle });
      const angles = spars(m)
        .map((p) => (((spinOf(p).deg - sailAngle) % 360) + 360) % 360)
        .sort((a, b) => a - b);
      const step = 360 / bladeCount;
      angles.forEach((a, i) => {
        assert.ok(Math.abs(a - i * step) < 1e-9, `blade ${i} at ${a}, expected ${i * step}`);
      });
      // and each blade really is rotated about a single axis
      assert.ok(spars(m).every((p) => spinOf(p).axis === 'y'));
    }
  }
});

test('no sail geometry dips below z=0 at ANY sail angle, on the shortest tower', () => {
  for (const bladeCount of [4, 5, 6]) {
    for (const bladeLength of [8, 13, 22, 30]) {
      let lowest = Infinity;
      for (let sailAngle = 0; sailAngle < 360; sailAngle += 3) {
        const m = forestWindmill({ floors: 2, width_x: 9, width_y: 9, bladeCount, bladeLength, sailAngle });
        for (const part of m.parts) {
          if (!part.id.startsWith('sail-')) continue;
          lowest = Math.min(lowest, bbox(part).min.z);
        }
        assert.equal(check(m).length, 0, `sailAngle=${sailAngle} bladeLength=${bladeLength} went red`);
      }
      assert.ok(lowest >= 0, `bladeLength=${bladeLength}: a sail reached z=${lowest.toFixed(3)}`);
      // When the blade is what sets the tower height, the derivation must land
      // ON the declared clearance — not pad it. A padded fix hides the bug.
      if (bladeLength >= 22) {
        assert.ok(
          Math.abs(lowest - 1.5) < 0.1,
          `bladeLength=${bladeLength}: swept low point is z=${lowest.toFixed(3)}, expected the declared 1.5 clearance`,
        );
      }
    }
  }
});

test('RED — the same mill with a hand-picked hub height is caught below grade', () => {
  // The guard for the guard: if this ever passes, the sweep above has stopped
  // proving anything, because a mill built WITHOUT the derivation would be green.
  const naive = (bladeLength: number, sailAngle: number): BuildingModel => {
    const b = building({ name: 'undrived mill' });
    b.add('tower', frustum({ sides: 8, r0: 4, r1: 2.4, h: 12 }), { ground: true });
    b.add('cap', dome({ r: 2.9, h: 3 }), { on: 'tower' });
    b.add('hub', frustum({ sides: 10, r0: 0.7, r1: 0.6, h: 2.6 }), {
      attached: 'cap', dz: 1.65, at: { dx: 0, dy: 1.45 }, rotate: { axis: 'x', deg: -90 },
    });
    for (let i = 0; i < 4; i++) {
      b.add(`sail-spar-${i}`, box({ w: 0.7, d: 0.6, h: bladeLength }), {
        attached: 'hub', dz: 0, at: { dx: 0, dy: 2.3 }, rotate: { axis: 'y', deg: i * 90 + sailAngle },
      });
    }
    return b.model();
  };
  for (let sailAngle = 0; sailAngle < 360; sailAngle += 15) {
    assert.ok(
      check(naive(20, sailAngle)).some((v) => v.rule === 'below-grade'),
      `a 20-unit blade on a 12-unit tower must be caught at sailAngle=${sailAngle}`,
    );
  }
  // and the derived mill, same blade, is green at every one of those angles
  for (let sailAngle = 0; sailAngle < 360; sailAngle += 15) {
    assert.deepEqual(check(forestWindmill({ bladeLength: 20, bladeCount: 4, floors: 2, sailAngle })), []);
  }
});

test('a longer blade lifts the hub rather than burying the sail', () => {
  const hubZ = (bladeLength: number): number =>
    must(forestWindmill({ floors: 2, bladeLength }).parts.find((p) => p.id === 'hub'), 'the hub').baseZ;
  assert.ok(hubZ(30) > hubZ(13), 'a 30-unit blade must raise the axle');
  assert.ok(hubZ(30) >= 30, 'the axle clears the blade it carries');
});

test('every sail part hangs off a real hub, transitively', () => {
  const m = forestWindmill({ bladeCount: 6, slatsPerBlade: 3 });
  const byId = partsById(m);
  for (const part of m.parts.filter((p) => p.id.startsWith('sail-'))) {
    let cur: Part | undefined = part;
    let seen = 0;
    while (cur && cur.relation !== 'ground') {
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
      assert.ok(++seen < 20, 'sail support chain must terminate');
    }
    assert.ok(cur, `${part.id} has no path to the ground`);
  }
  assert.ok(m.parts.some((p) => p.id === 'hub' && p.relation === 'attached'));
});

// ---------------------------------------------------------------------------
// openings
// ---------------------------------------------------------------------------

test('window bands scale with floors, one band per stacked storey', () => {
  let prev = 0;
  for (const floors of [2, 3, 4, 5]) {
    const m = forestWindmill({ floors });
    const wins = windows(m);
    assert.equal(wins.length, floors * 2, `floors=${floors}`);
    const storeys = m.parts.filter((p) => /^tower-\d+$/.test(p.id));
    assert.equal(storeys.length, floors, `the shaft is ${floors} stacked segments`);
    const hosts = [...new Set(wins.map((w) => w.host))];
    assert.equal(hosts.length, floors, `each storey gets its own band (floors=${floors})`);
    // the bands really are at different heights in the world
    const byId = partsById(m);
    const heights = [...new Set(wins.map((w) => Number((must(byId.get(w.host), `host '${w.host}'`).baseZ + w.sill).toFixed(6))))];
    assert.equal(heights.length, floors, 'bands are at distinct world heights');
    // and the columns line up vertically
    assert.equal(new Set(wins.map((w) => w.facet)).size, 2, 'two aligned window columns');
    assert.ok(wins.length > prev);
    prev = wins.length;
  }
});

test('the stack carries continuously — base, then each storey on the one below', () => {
  const m = forestWindmill({ floors: 5 });
  const byId = partsById(m);
  const base = must(byId.get('base'), 'the base');
  assert.equal(base.relation, 'ground');
  assert.equal(base.baseZ, 0);

  const segs = m.parts.filter((p) => /^tower-\d+$/.test(p.id)).sort((a, b) => a.baseZ - b.baseZ);
  let below = base;
  for (const seg of segs) {
    assert.equal(seg.relation, 'on');
    assert.equal(seg.parentId, below.id);
    assert.ok(Math.abs(seg.baseZ - below.topZ) < 1e-9, `${seg.id}: no gap, no overlap`);
    assert.ok(seg.shape.radius <= below.shape.radius + 1e-9, 'and it keeps tapering');
    below = seg;
  }
  // the cap crowns the topmost storey, derived — never a typed height
  const cap = must(byId.get('cap'), 'the cap');
  const top = must(segs[segs.length - 1], 'the topmost storey');
  assert.equal(cap.parentId, top.id);
  assert.ok(Math.abs(cap.baseZ - top.topZ) < 1e-9);
});

test('the door sits on the ground and never shares a facet with a window', () => {
  for (const floors of [2, 3, 4, 5]) {
    for (const seed of [1, 7, 99]) {
      const m = forestWindmill({ floors, seed });
      const door = must(m.apertures.find((a) => a.kind === 'door'), 'a door');
      assert.equal(door.sill, 0, 'its threshold is at ground level');
      assert.equal(door.host, 'base', 'and it is cut into the ground-relation base course');
      const base = must(m.parts.find((p) => p.id === 'base'), 'the base');
      assert.equal(base.relation, 'ground');
      assert.equal(base.baseZ, 0);
      // the base course is sized to the door — just the checker's margin taller,
      // which is what keeps the door drawing in front of its own wall
      assert.ok(Math.abs(base.shape.height - door.h - 0.6) < 1e-9, 'base course is door + margin');
      assert.ok(!windows(m).some((w) => w.facet === door.facet), 'no window shares the door facet');
      assert.ok(!check(m).some((v) => v.rule === 'door-reachable'));
    }
  }
});

test('windows shrink to fit the tapering facet rather than overrunning it', () => {
  const m = forestWindmill({ floors: 5, taper: 0.45, width_x: 9, width_y: 9 });
  const byId = partsById(m);
  const wins = windows(m).sort(
    (a, b) => must(byId.get(a.host), `host '${a.host}'`).baseZ - must(byId.get(b.host), `host '${b.host}'`).baseZ,
  );
  assert.ok(wins.every((w) => w.w > 0), 'every window has positive width');
  const lowest = must(wins[0], 'the lowest window');
  const highest = must(wins[wins.length - 1], 'the highest window');
  assert.ok(highest.w < lowest.w, 'higher windows are narrower, following the taper');
  assert.deepEqual(check(m), []);
});

// ---------------------------------------------------------------------------
// determinism + render
// ---------------------------------------------------------------------------

test('the same seed builds the same mill; a different seed does not', () => {
  const a = JSON.stringify(forestWindmill({ seed: 5 }));
  const b = JSON.stringify(forestWindmill({ seed: 5 }));
  const c = JSON.stringify(forestWindmill({ seed: 6 }));
  assert.equal(a, b, 'seeded jitter is deterministic');
  assert.notEqual(a, c, 'the seed actually perturbs something');
});

test('render produces SVG with no degenerate coordinates, in every theme', () => {
  for (const style_theme of THEME_KEYS) {
    for (const light_angle of [0, 90, 135, 300]) {
      const svg = render(forestWindmill({ style_theme, light_angle }), { width: 640 });
      assert.ok(svg.startsWith('<svg'));
      assert.ok(!/NaN|Infinity|undefined/.test(svg), `${style_theme}@${light_angle} emitted a bad coordinate`);
      assert.ok(svg.split('<polygon').length > 40, 'a mill is not three polygons');
    }
  }
});

test('the light angle changes the shading', () => {
  const m = forestWindmill({});
  assert.notEqual(render(m, { lightAngle: 10 }), render(m, { lightAngle: 190 }));
});

test('the defaults are themselves green', () => {
  assert.equal(DEFAULTS.floors, 2, 'the shipped mill is the two-storey one');
  assert.equal(DEFAULTS.style_theme, 'brick');
  assertSound(forestWindmill());
  assert.deepEqual(check(forestWindmill(DEFAULTS)), []);
});
