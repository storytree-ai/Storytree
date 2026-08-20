// land-definition.test.ts — the contract of the land's own interior definition.
//
// WHAT THESE CHECKS ARE FOR, AND WHAT THEY DELIBERATELY REFUSE TO DO. Appearance is the
// operator's (ADR-0070; ADR-0392 D1 moves WHEN, never WHO), so nothing here asserts that
// the land looks good, and nothing here scores the treatment. This arc has already declined
// once to ship a metric invented after the fact and tuned until it agreed with the
// conclusion someone wanted, and that refusal is the standard being kept.
//
// What IS provable, and is what a later edit would silently break:
//
//   1. the relief field is a deterministic, continuous function of POSITION ONLY — so it
//      asserts nothing about any unit's proof state (ADR-0367 D5);
//   2. the normal the shader is handed really is that field's normal, checked against an
//      independent finite difference rather than against the same formula;
//   3. amplitude 0 is EXACTLY the old flat land, so the control on the evidence page is a
//      real control and not a slightly-different picture;
//   4. definition goes to CAPABILITY boundaries and to no other seam — the one thing that
//      distinguishes this from the per-cell noise the owner rejected;
//   5. the inset keeps the ground WATERTIGHT, which is the failure that would look like a
//      rendering artefact and get chased as one;
//   6. and the degeneracy guard actually fires on geometry that needs it, instead of being
//      an unexercised branch that reads like a safety net.

import assert from 'node:assert/strict';
import test from 'node:test';

import { groundCellsFrom } from './island-descriptors.js';
import { islandScene } from './island-fixture.js';
import {
  LAND_CELL_DEPTH,
  LAND_RELIEF_AMPLITUDE,
  PARCEL_BEVEL_DROP,
  PARCEL_BEVEL_WIDTH,
  landGradient,
  landHeight,
  landHeightRange,
  landNormal,
  planLandDefinition,
  signedArea2,
  wallFootY,
  type PlaceableCell,
} from './land-definition.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, rungOfNormal } from './palette-band.js';

const CELLS = groundCellsFrom(islandScene());

// ---------------------------------------------------------------------------
// 1. THE FIELD
// ---------------------------------------------------------------------------

test('the relief field is deterministic and a function of POSITION ONLY', () => {
  // The semantics fence, stated as a test rather than as a comment: nothing about a
  // capability, a status or a test count can reach this function, so the land it draws
  // cannot assert a proof state the work does not hold (ADR-0367 D5).
  for (const [x, z] of [
    [0, 0],
    [17.5, -42.25],
    [-113, 66],
  ] as const) {
    assert.equal(landHeight(x, z), landHeight(x, z));
    assert.equal(landNormal(x, z).y, landNormal(x, z).y);
  }
});

test('AMPLITUDE 0 IS EXACTLY THE OLD FLAT LAND — the control is a real control', () => {
  // If this drifts, the evidence page's before/after compares two different afters and the
  // difference a reader attributes to the treatment is partly something else.
  for (let x = -140; x <= 140; x += 11) {
    for (let z = -90; z <= 90; z += 7) {
      // `=== 0` rather than a strict-equal: a negative wave sum times a zero amplitude is
      // -0, and `assert/strict` holds -0 and 0 apart while every consumer of a height or a
      // normal does not. The claim being made is "numerically zero", not "the same bit
      // pattern as the literal 0".
      assert.ok(landHeight(x, z, 0) === 0, `flat land came back at ${landHeight(x, z, 0)}`);
      const n = landNormal(x, z, 0);
      assert.ok(n.x === 0 && n.z === 0 && n.y === 1, `flat normal came back ${JSON.stringify(n)}`);
    }
  }
});

test('the NORMAL handed to the shader is the field’s own, to a finite difference', () => {
  // Checked against an INDEPENDENT instrument rather than against the analytic formula it
  // came from. On a banded material a slightly-wrong normal is not a slightly-wrong colour
  // — it is a different rung — so "close enough" is not a defensible standard here.
  const h = 1e-4;
  let worst = 0;
  for (let x = -120; x <= 120; x += 13) {
    for (let z = -80; z <= 80; z += 9) {
      const g = landGradient(x, z);
      const fdX = (landHeight(x + h, z) - landHeight(x - h, z)) / (2 * h);
      const fdZ = (landHeight(x, z + h) - landHeight(x, z - h)) / (2 * h);
      worst = Math.max(worst, Math.abs(g.dx - fdX), Math.abs(g.dz - fdZ));
      const n = landNormal(x, z);
      assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9, 'normal is not unit length');
      assert.ok(n.y > 0, 'a ground normal must point up');
    }
  }
  assert.ok(worst < 1e-5, `analytic gradient disagrees with a finite difference by ${worst}`);
});

test('landHeightRange really bounds the field — a camera framing on it cannot crop', () => {
  const bound = landHeightRange();
  let peak = 0;
  for (let x = -200; x <= 200; x += 0.7) {
    for (let z = -120; z <= 120; z += 1.3) peak = Math.max(peak, Math.abs(landHeight(x, z)));
  }
  assert.ok(peak <= bound + 1e-9, `field reached ${peak}, bound claims ${bound}`);
  // NON-VACUITY: a bound of a thousand would also pass the line above.
  assert.ok(peak > bound * 0.5, `bound ${bound} is loose — the field only reaches ${peak}`);
});

// ---------------------------------------------------------------------------
// 2. DOES THE TREATMENT ACTUALLY DELIVER? — mechanism, not taste
// ---------------------------------------------------------------------------

/** The rung a normal lands on. Taken from `palette-band.ts` rather than restated here: a
 *  test carrying its own copy of the shader's arithmetic proves only that the two copies
 *  agree, which is the mistake `bandGlsl` was written to avoid. */
const rungOf = rungOfNormal;

test('the authored light is a unit direction the pure half can reason with', () => {
  const l = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z);
  assert.ok(Math.abs(l - 1) < 1e-12, `light direction is not normalised (${l})`);
  assert.ok(LIGHT_DIRECTION.y > 0, 'the land is lit from above');
});

/** The share of a dense ground sample that leaves the flat land's single rung. */
function offBaseShare(amplitude: number): number {
  const base = rungOf(landNormal(0, 0, 0));
  let off = 0;
  let total = 0;
  for (let x = -115; x <= 115; x += 2) {
    for (let z = -67; z <= 67; z += 2) {
      total++;
      if (rungOf(landNormal(x, z, amplitude)) !== base) off++;
    }
  }
  return off / total;
}

test('THE FLAT LAND IS ONE RUNG, AND THAT IS THE WHOLE FINDING', () => {
  // The 2026-08-19 island was a single flat green field because every top face carried the
  // same straight-up normal, so the whole island quantised onto one rung of a four-rung
  // ladder. Stated here as a measurement so the "after" below has a real "before".
  const rungs = new Set<number>();
  for (let x = -115; x <= 115; x += 3) {
    for (let z = -67; z <= 67; z += 3) rungs.add(rungOf(landNormal(x, z, 0)));
  }
  assert.equal(rungs.size, 1, `flat land reached ${rungs.size} rungs — the premise has moved`);
  assert.equal(offBaseShare(0), 0);
});

test('at the authored amplitude the land reaches every rung of the ladder', () => {
  const rungs = new Set<number>();
  for (let x = -115; x <= 115; x += 2) {
    for (let z = -67; z <= 67; z += 2) rungs.add(rungOf(landNormal(x, z, LAND_RELIEF_AMPLITUDE)));
  }
  assert.equal(
    rungs.size,
    SHADE_LEVELS.length,
    `the land reached ${rungs.size} of ${SHADE_LEVELS.length} rungs at amplitude ` +
      `${LAND_RELIEF_AMPLITUDE} — definition an eye can read is the point, and a treatment ` +
      'that never leaves the base rung delivers exactly nothing',
  );
});

test('more amplitude means more of the land off the base rung, monotonically', () => {
  // The claim the evidence page's ladder rests on, and it is a MECHANICAL claim about
  // quantisation rather than a claim about which one looks better. That verdict is the
  // owner's, once, on a whole island (ADR-0392 D1).
  const ladder = [0, 1.2, 2.2, 3.2].map((a) => ({ a, share: offBaseShare(a) }));
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(
      ladder[i]!.share > ladder[i - 1]!.share,
      `amplitude ${ladder[i]!.a} put ${ladder[i]!.share} off-base, ` +
        `less than ${ladder[i - 1]!.a}'s ${ladder[i - 1]!.share}`,
    );
  }
  // And the chosen amplitude is not a rounding error away from the flat control: the 1.2
  // rung on the evidence page is there because it measurably ISN'T enough.
  assert.ok(
    ladder[2]!.share > 4 * ladder[1]!.share,
    `amplitude ${LAND_RELIEF_AMPLITUDE} is barely distinguishable from 1.2`,
  );
});

// ---------------------------------------------------------------------------
// 3. THE EDGE CLASSIFICATION
// ---------------------------------------------------------------------------

test('NON-VACUITY: the island really is partitioned into capabilities', () => {
  const parcels = new Set(CELLS.map((c) => c.parcel ?? '(none)'));
  assert.ok(
    parcels.size > 5 && !parcels.has('(none)'),
    `${parcels.size} parcels, containing ${[...parcels].join(', ')} — if the capability id ` +
      'never reached the extractor, every "no boundary here" below would pass for the ' +
      'wrong reason and the land would come out with no definition at all',
  );
});

test('every role appears on the real island, in believable proportions', () => {
  const { counts } = planLandDefinition(CELLS);
  assert.ok(counts.interior > 0 && counts.parcel > 0 && counts.rim > 0, JSON.stringify(counts));
  // Interior seams must DOMINATE. If they did not, "definition at parcel boundaries only"
  // would be a distinction without a difference — the treatment would be everywhere, which
  // is the thing that was rejected by looking.
  const drawn = counts.parcel + counts.rim;
  assert.ok(
    counts.interior > drawn,
    `${drawn} drawn edges against ${counts.interior} left undrawn — definition is supposed ` +
      'to be placed, not sprayed',
  );
});

test('A SEAM BETWEEN TWO CELLS OF THE SAME CAPABILITY IS NEVER DRAWN', () => {
  // The fence, checked directly against the cells rather than through the plan's own
  // bookkeeping: for every shared edge, the role must be `parcel` exactly when the two
  // owners differ.
  const plan = planLandDefinition(CELLS);
  const key = (p: { x: number; y: number }) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const seen = new Map<string, { ci: number; ei: number }[]>();
  CELLS.forEach((c, ci) => {
    for (let ei = 0; ei < c.points.length; ei++) {
      const a = key(c.points[ei]!);
      const b = key(c.points[(ei + 1) % c.points.length]!);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      seen.set(k, [...(seen.get(k) ?? []), { ci, ei }]);
    }
  });
  let sameOwnerShared = 0;
  for (const [, list] of seen) {
    if (list.length !== 2) continue;
    const [p, q] = list as [{ ci: number; ei: number }, { ci: number; ei: number }];
    const same = CELLS[p.ci]!.parcel === CELLS[q.ci]!.parcel;
    const role = plan.edgeRole(p.ci, p.ei);
    if (same) {
      sameOwnerShared++;
      assert.equal(role, 'interior', `a same-capability seam was classified ${role}`);
    } else {
      assert.equal(role, 'parcel', `a cross-capability boundary was classified ${role}`);
    }
    assert.equal(role, plan.edgeRole(q.ci, q.ei), 'the two sides disagree about the edge');
  }
  assert.ok(sameOwnerShared > 100, `only ${sameOwnerShared} same-capability seams to check`);
});

test('a rim edge is an edge no second cell shares', () => {
  const plan = planLandDefinition(CELLS);
  const key = (p: { x: number; y: number }) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const count = new Map<string, number>();
  for (const c of CELLS) {
    for (let ei = 0; ei < c.points.length; ei++) {
      const a = key(c.points[ei]!);
      const b = key(c.points[(ei + 1) % c.points.length]!);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  CELLS.forEach((c, ci) => {
    for (let ei = 0; ei < c.points.length; ei++) {
      const a = key(c.points[ei]!);
      const b = key(c.points[(ei + 1) % c.points.length]!);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      const isRim = plan.edgeRole(ci, ei) === 'rim';
      assert.equal(isRim, count.get(k) === 1, `rim classification disagrees with incidence`);
    }
  });
});

test('an UNPARCELLED island invents no boundaries at all', () => {
  // The degenerate case that would otherwise draw a seam around every cell: if the capId
  // never arrives, every cell is `undefined` and every shared edge must stay interior.
  const bare: PlaceableCell[] = CELLS.map((c) => ({ points: c.points }));
  const { counts } = planLandDefinition(bare);
  assert.equal(counts.parcel, 0, 'a boundary was invented between two unowned cells');
  assert.ok(counts.rim > 0, 'the island still has an outer edge');
});

// ---------------------------------------------------------------------------
// 4. THE INSET — watertightness, and the guard
// ---------------------------------------------------------------------------

test('WATERTIGHT: cells of one capability agree on every shared vertex', () => {
  // The crack this prevents would present as a hairline of background inside the island —
  // a rendering artefact that gets chased as one. It happens the moment the inset is keyed
  // by CELL instead of by PARCEL, which is the obvious way to write it.
  const plan = planLandDefinition(CELLS);
  const key = (p: { x: number; y: number }) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const placed = new Map<string, { x: number; y: number }>();
  let shared = 0;
  CELLS.forEach((c, ci) => {
    c.points.forEach((p, k) => {
      const id = `${c.parcel ?? ''}@${key(p)}`;
      const at = plan.insetPoint(ci, k);
      const prior = placed.get(id);
      if (prior) {
        shared++;
        assert.ok(
          Math.hypot(prior.x - at.x, prior.y - at.y) < 1e-9,
          `two cells of ${c.parcel} placed a shared vertex differently — the ground is torn`,
        );
      } else placed.set(id, at);
    });
  });
  assert.ok(shared > 200, `only ${shared} shared placements checked — too few to mean much`);
});

test('the inset moves boundary vertices by the bevel width, and interior ones not at all', () => {
  const plan = planLandDefinition(CELLS);
  let moved = 0;
  let still = 0;
  CELLS.forEach((c, ci) => {
    const onBoundary = c.points.map(() => false);
    for (let ei = 0; ei < c.points.length; ei++) {
      if (plan.edgeRole(ci, ei) === 'interior') continue;
      onBoundary[ei] = true;
      onBoundary[(ei + 1) % c.points.length] = true;
    }
    c.points.forEach((p, k) => {
      const d = Math.hypot(plan.insetPoint(ci, k).x - p.x, plan.insetPoint(ci, k).y - p.y);
      if (onBoundary[k]) {
        moved++;
        assert.ok(
          d <= PARCEL_BEVEL_WIDTH + 1e-9,
          `a vertex travelled ${d}, past the ${PARCEL_BEVEL_WIDTH} bevel width`,
        );
      } else if (d > 1e-9) {
        // A vertex may be pulled by a boundary edge belonging to a SIBLING cell of the same
        // parcel — that is the watertightness rule doing its job, not a leak.
        moved++;
      } else still++;
    });
  });
  assert.ok(moved > 100 && still > 20, `moved ${moved}, still ${still}`);
});

test('NO CELL TURNS INSIDE OUT — the whole ground survives its own inset', () => {
  // An inverted cell renders with reversed winding and vanishes under front-face culling.
  // That is precisely how the first island render lost its entire ground and looked like a
  // design failure rather than a bug, so it is checked rather than reasoned about.
  const plan = planLandDefinition(CELLS);
  CELLS.forEach((c, ci) => {
    const inner = c.points.map((_, k) => plan.insetPoint(ci, k));
    const before = signedArea2(c.points);
    const after = signedArea2(inner);
    assert.equal(Math.sign(after), Math.sign(before), `cell ${ci} inverted`);
    assert.ok(Math.abs(after) / Math.abs(before) >= 0.35, `cell ${ci} collapsed`);
  });
});

test('THE GUARD FIRES: a parcel too small to carry a bevel gives one up', () => {
  // Without this the guard is an unexercised branch that reads exactly like a safety net
  // and is not one. A 2-unit square cannot survive a 1.6-unit inset from all four sides.
  const tiny: PlaceableCell[] = [
    {
      parcel: 'small',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    },
  ];
  const plan = planLandDefinition(tiny);
  const inner = tiny[0]!.points.map((_, k) => plan.insetPoint(0, k));
  const before = signedArea2(tiny[0]!.points);
  const after = signedArea2(inner);
  assert.equal(Math.sign(after), Math.sign(before), 'the guard let a cell invert');
  assert.ok(Math.abs(after) / Math.abs(before) >= 0.35, 'the guard let a cell collapse');
  // A large neighbour in its OWN parcel is untouched by the small one's climb-down.
  const mixed: PlaceableCell[] = [
    ...tiny,
    {
      parcel: 'big',
      points: [
        { x: 20, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
        { x: 20, y: 40 },
      ],
    },
  ];
  const plan2 = planLandDefinition(mixed);
  const bigInner = mixed[1]!.points.map((_, k) => plan2.insetPoint(1, k));
  const shift = Math.hypot(bigInner[0]!.x - 20, bigInner[0]!.y - 0);
  // Exactly the bevel width along the corner's bisector — the deliberate UNDER-mitre. The
  // exact mitre would be `width / sin(half-angle)`, which blows up at a sharp corner and
  // shoots the vertex across the parcel; the faces still meet either way, because both end
  // on the same inset vertex whatever its distance.
  assert.ok(
    Math.abs(shift - PARCEL_BEVEL_WIDTH) < 1e-9,
    `the big parcel's corner moved ${shift}, not the ${PARCEL_BEVEL_WIDTH} bevel width`,
  );
});

test('a two-parcel strip is classified exactly as drawn', () => {
  // The smallest case where every answer is known by inspection, so a regression in the
  // real-island counts above can be localised instead of merely observed.
  const strip: PlaceableCell[] = [
    { parcel: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    { parcel: 'a', points: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }] },
    { parcel: 'b', points: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }] },
  ];
  const plan = planLandDefinition(strip);
  // cell 0 edge 1 is x=10, shared with cell 1 in the SAME parcel.
  assert.equal(plan.edgeRole(0, 1), 'interior');
  // cell 1 edge 1 is x=20, shared with cell 2 in a DIFFERENT parcel.
  assert.equal(plan.edgeRole(1, 1), 'parcel');
  assert.equal(plan.edgeRole(2, 3), 'parcel');
  // everything on the outside is rim.
  assert.equal(plan.edgeRole(0, 0), 'rim');
  assert.equal(plan.edgeRole(0, 3), 'rim');
  assert.deepEqual(plan.counts, { interior: 2, parcel: 2, rim: 8 });
});

// ---------------------------------------------------------------------------
// 5. THE RIM WALL — the bug a flat plane hides
// ---------------------------------------------------------------------------

test('THE RELIEF REACHES DEEPER THAN THE WALL IS TALL — so a fixed floor inverts it', () => {
  // This is the PREMISE of `wallFootY`, checked rather than asserted in prose. If the
  // amplitude ever drops far enough that the rim can no longer sink below a fixed floor,
  // the function stops being load-bearing and this test says so out loud instead of leaving
  // a comment describing a hazard that no longer exists.
  const reach = landHeightRange(LAND_RELIEF_AMPLITUDE) + PARCEL_BEVEL_DROP;
  assert.ok(
    reach > LAND_CELL_DEPTH,
    `the rim reaches ${reach} below zero against a ${LAND_CELL_DEPTH} wall — a fixed floor ` +
      'would no longer invert, and `wallFootY` would be guarding nothing',
  );
});

test('the rim wall NEVER inverts, at any height the coast can reach', () => {
  // The bug, stated as the invariant that excludes it: the foot is below the top, always.
  // A constant floor at -LAND_CELL_DEPTH fails this for 30 of the island fixture's 104 rim
  // endpoints, and the failure renders as a band of wall standing UP out of the land — a
  // picture that looks like an art problem rather than like a geometry bug.
  const reach = landHeightRange(LAND_RELIEF_AMPLITUDE);
  let checked = 0;
  for (let top = -reach - PARCEL_BEVEL_DROP; top <= reach; top += 0.05) {
    checked++;
    assert.ok(wallFootY(top) < top, `wall foot ${wallFootY(top)} is not below its top ${top}`);
    assert.ok(
      Math.abs(top - wallFootY(top) - LAND_CELL_DEPTH) < 1e-9,
      'the wall lost its authored thickness',
    );
  }
  assert.ok(checked > 100, `only ${checked} heights swept`);

  // And the counter-case, so this is not a test of a tautology: the FIXED floor the code
  // used to have really does invert on this island's own rim.
  const plan = planLandDefinition(CELLS);
  let wouldInvert = 0;
  let rimEndpoints = 0;
  CELLS.forEach((c, ci) => {
    for (let i = 0; i < c.points.length; i++) {
      if (plan.edgeRole(ci, i) !== 'rim') continue;
      for (const p of [c.points[i]!, c.points[(i + 1) % c.points.length]!]) {
        rimEndpoints++;
        const top = landHeight(p.x, p.y, LAND_RELIEF_AMPLITUDE) - PARCEL_BEVEL_DROP;
        if (top < -LAND_CELL_DEPTH) wouldInvert++;
      }
    }
  });
  assert.ok(
    wouldInvert > 0,
    `a fixed floor would invert 0 of ${rimEndpoints} rim endpoints — the counter-case is ` +
      'gone, so the test above proves only that subtraction works',
  );
});
