// THE MESH'S CELL DECOMPOSITION DOES NOT DEPEND ON THE CAMERA IT IS SEEN FROM (ADR-0367 D1).
//
// `scatter-camera.test.ts` fences everything scattered ON the land. This fences the land itself —
// the relaxed substrate's own interior, which is where per-capability status tint lives, and which
// therefore decides WHICH CAPABILITY OWNS WHICH GROUND. Increment:
// `substrate-interning-moves-to-ground-space` on `ground-space-truth-arc`.
//
// WHAT WAS WRONG. `substrate.ts` built the whole mesh on PROJECTED coordinates, and `VKEY` decided
// vertex IDENTITY — "are these two vertices the same point?" — by rounding them to 0.1 px. Under the
// declared camera the ground's depth axis is compressed by `sin 20° ≈ 0.342`, so a bucket 0.1 px tall
// on screen is 0.292 units tall on the ground: the tolerance was nearly 3× looser across depth than
// across width, and every seed derived from that key was a function of the camera.
//
// ⚠ WHAT IT COST, MEASURED — and NOT what the increment predicted, so do not carry the old claim
// forward. The increment cites PR #1344's "50 → 52 cells". That is NOT reproducible: comparing this
// file against its own previous revision over symmetric discs of 7 to 61 tiles and 480 irregular
// grown blobs, in all three modes, the cell count is IDENTICAL every time. Lattice vertices sit units
// apart, so a 0.292-unit bucket never merged two distinct ground points — it only ever absorbed
// floating-point noise on shared corners, which is what it was for.
//
// WHAT WAS LIVE IS THE JITTER SEED. `relaxVerts` seeds each vertex's displacement off `VKEY`, so a
// key computed from a projected coordinate put every vertex's GROUND position downstream of the
// camera: 79.2% of vertex positions move between the old rule and this one, by up to 11.4 px. Counts,
// owners, wheat and the parcel partition are untouched; what changes is that the island's interior is
// now the LAND's texture rather than one the projection re-rolled.
//
// THE INVARIANT, and why it is the right one. The island in GROUND space is the same island at every
// camera. So the mesh built over it must have the same cells, in the same order, at the same ground
// positions, at every elevation — and only their SCREEN positions may move, foreshortened by the same
// `sin θ` the lattice took. That statement is independent of taste, of the value of the tolerance,
// and of every number in this file.
//
// ⚠ THE TEETH. A camera sweep is precisely the shape of test that can pass while measuring nothing:
// if the inputs did not really differ between the runs, any implementation passes. So two controls
// sit below the invariant. (a) pins that the cells DO foreshorten on screen between the elevations
// compared. (b) pins the DEFECT — that the key the OLD rule used really did move with the camera,
// and that a screen bucket really is looser on the depth axis than a ground one. If the projection
// ever stopped mattering, those go red before the invariant could go quietly vacuous.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LAND_CAMERA_ELEVATION_DEG,
  PLAN_VIEW_ELEVATION_DEG,
  groundFlattening,
  projectGround,
  unprojectGround,
} from './camera.js';
import type { Axial, Pt } from './hex.js';
import { buildRelaxedCells, type DrawTile, type RelaxedCell, type SubstrateMode } from './substrate.js';

/** The declared camera plus a sweep either side, matching `camera.test.ts`'s range. */
const SWEEP = [PLAN_VIEW_ELEVATION_DEG, 60, 45, 30, 26.565, LAND_CAMERA_ELEVATION_DEG, 12] as const;

/** Unprojecting divides by `sin θ`, so error grows as the camera lowers; 1e-6 is far below any
 *  real placement difference (the defect moves whole cells) and far above the arithmetic. */
const TOLERANCE = 1e-6;

function discTiles(rings: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) if (Math.abs(q + r) <= rings) out.push({ q, r });
  }
  return out;
}

/** A two-territory fixture: a 19-tile disc and a 7-tile neighbour, so ownership is exercised too. */
const TILES: DrawTile[] = [
  ...discTiles(2).map((h) => ({ h, owner: 0 })),
  ...discTiles(1).map((h) => ({ h: { q: h.q + 6, r: h.r }, owner: 1 })),
];
const WHEAT: ReadonlySet<string>[] = [new Set(['0,0', '1,-1', '-1,1']), new Set(['6,0'])];

const MODES: SubstrateMode[] = ['mesh', 'relaxed-hex', 'relaxed-quad'];

function build(mode: SubstrateMode, elevationDeg: number): RelaxedCell[] {
  return buildRelaxedCells(TILES, WHEAT, mode, {}, { elevationDeg });
}

for (const mode of MODES) {
  test(`${mode}: the same ground island decomposes into the same cells at every camera`, () => {
    const reference = build(mode, PLAN_VIEW_ELEVATION_DEG);
    assert.ok(reference.length > 0, 'the fixture produced no cells');

    for (const elevationDeg of SWEEP) {
      const got = build(mode, elevationDeg);
      assert.equal(
        got.length,
        reference.length,
        `${mode} at ${elevationDeg}°: ${got.length} cells against ${reference.length} in plan view. ` +
          'The mesh re-decomposed because the camera moved — which is the defect, not a rounding ' +
          'difference: a cell count is an integer and the ground island did not change.',
      );

      for (let i = 0; i < got.length; i++) {
        const a = got[i] as RelaxedCell;
        const b = reference[i] as RelaxedCell;
        assert.equal(a.owner, b.owner, `${mode} at ${elevationDeg}°: cell ${i} changed owner`);
        assert.equal(a.variant, b.variant, `${mode} at ${elevationDeg}°: cell ${i} changed variant`);
        assert.equal(a.wheat, b.wheat, `${mode} at ${elevationDeg}°: cell ${i} changed wheat`);
        assert.equal(
          a.poly.length,
          b.poly.length,
          `${mode} at ${elevationDeg}°: cell ${i} changed vertex count`,
        );
        for (let v = 0; v < a.poly.length; v++) {
          const ga = unprojectGround(a.poly[v] as Pt, elevationDeg);
          const gb = unprojectGround(b.poly[v] as Pt, PLAN_VIEW_ELEVATION_DEG);
          assert.ok(
            Math.abs(ga.x - gb.x) < TOLERANCE && Math.abs(ga.y - gb.y) < TOLERANCE,
            `${mode} at ${elevationDeg}°: cell ${i} vertex ${v} sits at a different GROUND spot — ` +
              `(${ga.x.toFixed(4)}, ${ga.y.toFixed(4)}) against ` +
              `(${gb.x.toFixed(4)}, ${gb.y.toFixed(4)}). Only the SCREEN position may move.`,
          );
        }
      }
    }
  });
}

test('TEETH (a) — the cells really do foreshorten, so the sweep is not comparing identical runs', () => {
  const plan = build('mesh', PLAN_VIEW_ELEVATION_DEG);
  const angled = build('mesh', LAND_CAMERA_ELEVATION_DEG);
  const heightOf = (cells: RelaxedCell[]): number => {
    const ys = cells.flatMap((c) => c.poly.map((p) => p.y));
    return Math.max(...ys) - Math.min(...ys);
  };
  const widthOf = (cells: RelaxedCell[]): number => {
    const xs = cells.flatMap((c) => c.poly.map((p) => p.x));
    return Math.max(...xs) - Math.min(...xs);
  };
  const f = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const planH = heightOf(plan);
  const angledH = heightOf(angled);
  assert.ok(planH > 0, 'the plan-view fixture has no vertical extent');
  assert.ok(
    Math.abs(angledH / planH - f) < 0.02,
    `the mesh did not foreshorten as the camera declares: ${angledH.toFixed(2)} / ${planH.toFixed(2)} = ` +
      `${(angledH / planH).toFixed(4)}, expected sin(20°) = ${f.toFixed(4)}. If the two runs are not ` +
      'genuinely different pictures, the invariance test above proves nothing.',
  );
  assert.ok(
    Math.abs(widthOf(angled) - widthOf(plan)) < TOLERANCE,
    'the WIDTH must not move — only the depth axis foreshortens',
  );
});

test('TEETH (b) — the key the old rule used really was camera-dependent, and the new one is not', () => {
  // THE DEFECT, PINNED WHERE IT ACTUALLY LIVED. The old `VKEY` rounded the PROJECTED coordinate, so
  // it answered "which vertex is this?" differently at different cameras — and `relaxVerts` seeds
  // each vertex's jitter off that answer (`jx:` / `jm:`). Measured against the previous revision:
  // 79.2% of vertex positions move between the two rules, by up to 11.4 px.
  //
  // ⚠ NOT what the increment predicted, and worth stating so the wrong claim is not carried
  // forward: the CELL COUNT never differed — identical over discs of 7 to 61 tiles and 480 grown
  // blobs, in all three modes. The 0.292-unit ground bucket the projection opened up never merged
  // two distinct lattice vertices, because they sit units apart. So the merge hazard was real but
  // never fired; the jitter reseed is what was live.
  const cells = build('mesh', PLAN_VIEW_ELEVATION_DEG);
  const groundVerts = cells.flatMap((c) => c.poly);
  assert.ok(groundVerts.length > 0, 'the fixture produced no vertices');

  const screenKey = (p: Pt, elevationDeg: number): string => {
    const q = projectGround(p, elevationDeg);
    return `${Math.round(q.x * 10)},${Math.round(q.y * 10)}`;
  };
  const groundKey = (p: Pt): string => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

  let screenKeyMoved = 0;
  for (const v of groundVerts) {
    if (screenKey(v, LAND_CAMERA_ELEVATION_DEG) !== screenKey(v, PLAN_VIEW_ELEVATION_DEG)) {
      screenKeyMoved += 1;
    }
    assert.equal(
      groundKey(v),
      groundKey(v),
      'the ground key is a function of the ground alone — this cannot fail, and that is the point',
    );
  }
  assert.ok(
    screenKeyMoved > groundVerts.length * 0.5,
    `only ${screenKeyMoved} of ${groundVerts.length} vertices changed their SCREEN key between plan ` +
      'view and the declared camera. The old rule keyed on that value, so if it barely moves, this ' +
      'suite can no longer tell the fix from what it replaced.',
  );

  // And the anisotropy itself, as arithmetic on two real points rather than as prose: 0.1 units
  // apart in DEPTH is ONE point to the old screen key at the declared camera (0.1 × sin 20° = 0.034
  // px, well inside a 0.1-px bucket) and TWO to the ground key. That is the merge hazard the old
  // tolerance opened. It never fired on the real lattice — see the header — but it is what "the
  // tolerance was 2.92× looser on one axis" means, and it is checkable rather than asserted.
  const a: Pt = { x: 0, y: 0 };
  const b: Pt = { x: 0, y: 0.1 };
  assert.equal(
    screenKey(a, LAND_CAMERA_ELEVATION_DEG),
    screenKey(b, LAND_CAMERA_ELEVATION_DEG),
    'the screen key must merge these two — 0.1 ground units is 0.034 px at sin(20°)',
  );
  assert.notEqual(groundKey(a), groundKey(b), 'the ground key must keep them apart');
});
