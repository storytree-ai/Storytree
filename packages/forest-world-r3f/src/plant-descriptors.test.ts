// plant-descriptors.test.ts — the vegetation half of the live-render experiment, proved
// against a REAL `buildScene` output (the provability-firewall pattern: no hand-forged
// scene shapes, so the mapper is exercised against the core the app actually runs).
//
// The load-bearing checks are (a) plants are FOUND at all — a zero-plant extraction would
// make every later delivery statistic vacuously true, which is exactly the failure mode
// this arc has had to correct in two prior harnesses; (b) the FOOTPRINT is real and
// non-degenerate, because it is the matched-size contract every delivery claim rests on;
// and (c) the budget arithmetic is stated as arithmetic and asserted against the arc's own
// measured shrub, so nobody can quote it as a measurement later.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRelaxedCells,
  buildScene,
  hexCenter,
  type Axial,
  type RelaxedCell,
  type SceneG,
  type SceneInput,
  type SceneParcelInput,
  type SceneTerritoryInput,
} from '@storytree/forest-world';

import {
  livePixelBudget,
  plantsFrom,
  spritePixelBudget,
  type PlantInstance,
} from './plant-descriptors.js';

// ---------------------------------------------------------------------------
// fixture — one island wearing capability PARCELS (the shipped studio map's flora path)
// ---------------------------------------------------------------------------

const ring = (cq: number, cr: number): Axial[] => [
  { q: cq, r: cr },
  { q: cq + 1, r: cr },
  { q: cq - 1, r: cr },
  { q: cq, r: cr + 1 },
  { q: cq, r: cr - 1 },
  { q: cq + 1, r: cr - 1 },
  { q: cq - 1, r: cr + 1 },
];

const TILES = ring(0, 0);

const PARCELS: SceneParcelInput[] = [
  { capId: 'cap-a', status: 'healthy', testCount: 9, theme: 'meadow', seed: hexCenter(TILES[0]!) },
  { capId: 'cap-b', status: 'healthy', testCount: 4, theme: 'woodland', seed: hexCenter(TILES[1]!) },
  { capId: 'cap-c', status: 'unhealthy', testCount: 6, theme: 'heath', seed: hexCenter(TILES[2]!) },
];

function fixture(): SceneG {
  const centres = TILES.map((h) => hexCenter(h));
  const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const cy = centres.reduce((s, c) => s + c.y, 0) / centres.length;
  const drawTiles = TILES.map((h) => ({ h, owner: 0 }));
  // 'mesh' is the shipped studio substrate — the parcels path the flora rides on.
  const relaxed: RelaxedCell[] = buildRelaxedCells(drawTiles, [new Set<string>()], 'mesh');
  const territory: SceneTerritoryInput = {
    id: 'context-traversal-capture',
    status: 'healthy',
    caps: PARCELS.length,
    centroid: { x: cx, y: cy },
    // The seam carries the two radii SEPARATELY on purpose: `groundRadius` is a
    // camera-independent ground magnitude, `screenRadius` what is actually drawn.
    // Collapsing them is the exact bug the split exists to make unrepresentable.
    groundRadius: 40,
    screenRadius: 40 * Math.sin((50 * Math.PI) / 180),
    treeSpot: { x: cx, y: cy - 6 },
    labelY: cy + 46,
    coastPaths: [],
    decor: [],
    plants: [],
    treeTitle: 'context-traversal-capture',
    wisps: [],
    parcels: PARCELS,
    plate: {
      w: 120,
      h: 33,
      rx: 7,
      idY: 14,
      subY: 27,
      idText: 'context-traversal-capture',
      subText: 'healthy',
      title: 'context-traversal-capture',
    },
  };
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 900,
    height: 700,
    empties: [],
    relaxedCells: relaxed,
    drawTiles,
    wheatSets: [new Set<string>()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [territory],
  };
  return buildScene(input);
}

const PLANTS: PlantInstance[] = plantsFrom(fixture());

// ---------------------------------------------------------------------------

test('NON-VACUITY: the fixture actually grows plants — every later statistic depends on it', () => {
  assert.ok(
    PLANTS.length > 20,
    `only ${PLANTS.length} plants extracted; a near-empty set would make every delivery ` +
      'assertion below true for the wrong reason',
  );
});

test('a plant carries the parcel STATUS as its material token family', () => {
  const statuses = new Set(PLANTS.map((p) => p.material));
  assert.ok(statuses.has('healthy'), 'no healthy plant — the material is not flowing from the parcel');
  assert.ok(
    statuses.has('unhealthy'),
    'no unhealthy plant — a live material could not tint by proof state',
  );
});

test('a plant carries its parcel THEME, and all three shipped themes appear', () => {
  const themes = new Set(PLANTS.map((p) => p.theme));
  for (const t of ['meadow', 'woodland', 'heath']) {
    assert.ok(themes.has(t), `theme ${t} produced no plant — a mesh family would go undrawn`);
  }
});

test('FOOTPRINT is non-degenerate: every plant has real 2D extent', () => {
  for (const p of PLANTS) {
    assert.ok(
      p.footprint.w > 0 && p.footprint.h > 0,
      `plant ${p.group} has a ${p.footprint.w}x${p.footprint.h} footprint — a zero-extent ` +
        'plant would silently become a delivery statistic',
    );
    assert.ok(
      Number.isFinite(p.footprint.cx) && Number.isFinite(p.footprint.cy),
      'a non-finite footprint centre escaped the extractor',
    );
  }
});

test('FOOTPRINT is in the arc-measured size band — a shrub is a few world units across', () => {
  // The arc's measured shrub is ~6x3 world units (chapter2-high-frequency-options). A plant
  // an order of magnitude off that would mean the extractor is reading the wrong subtree —
  // e.g. a whole parcel group instead of one item — and the matched-footprint comparison
  // would be silently wrong in the flattering direction.
  const widths = PLANTS.map((p) => p.footprint.w).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  assert.ok(
    median > 0.5 && median < 40,
    `median plant width ${median.toFixed(2)} world units is outside any plausible plant band; ` +
      'the extractor is probably measuring the wrong node',
  );
});

test('a plant STANDS on the ground — its z is the south edge of its own marks, not the centre', () => {
  // A mesh planted at the footprint centroid floats above its own ground contact. This is
  // the whole difference between vegetation sitting in the land and hovering over it.
  for (const p of PLANTS) {
    assert.ok(
      p.transform.z >= p.footprint.cy,
      `plant at z=${p.transform.z} sits north of its own centre ${p.footprint.cy} — it would float`,
    );
    assert.equal(p.transform.y, 0, 'plants belong on the ground plane');
  }
});

test('the instancing GROUP splits by theme and form, so one draw call serves one mesh family', () => {
  const groups = new Set(PLANTS.map((p) => p.group));
  assert.ok(groups.size >= 3, `only ${groups.size} instancing groups — themes are not separating`);
  for (const g of groups) {
    assert.match(g, /^plant-(meadow|woodland|heath)-(blade|shrub|stem|flower|mixed)$/, `bad group ${g}`);
  }
});

test('MARK COUNT is recorded — the sprite path own complexity budget for the comparison', () => {
  for (const p of PLANTS) {
    assert.ok(p.marks > 0, 'a plant with no marks should not have been emitted at all');
  }
  const total = PLANTS.reduce((s, p) => s + p.marks, 0);
  assert.ok(total > PLANTS.length, 'every plant is a single mark — the extractor is not descending');
});

test('DETERMINISM: the same scene yields a byte-identical plant array', () => {
  assert.deepEqual(plantsFrom(fixture()), PLANTS);
});

// ---------------------------------------------------------------------------
// the budget arithmetic — stated as arithmetic, pinned against the arc's own number
// ---------------------------------------------------------------------------

test('the SPRITE budget reproduces the arc measured twelve-pixel shrub', () => {
  // chapter2-high-frequency-options: a shrub delivers 11-12 px in a 6x3 box. If this
  // arithmetic did not land there, the live comparison would be anchored to a fiction.
  const shrub = { cx: 0, cy: 0, w: 6, h: 3 };
  const px = spritePixelBudget(shrub);
  assert.ok(
    px >= 11 && px <= 13,
    `the sprite convention gives a 6x3 shrub ${px} px; the arc measured 11-12`,
  );
});

test('the LIVE budget grows with the SQUARE of device pixels per world unit', () => {
  // Asserted on an EXACTLY-REPRESENTABLE footprint. On the arc's real 6x3 shrub the ratio
  // measures 3.85x rather than 4x, and that is integer ROUNDING at a 13-pixel budget, not
  // a departure from the square law — which is itself the point the arc keeps re-learning:
  // at this size a single pixel is 8% of the whole plant. Proving the law on a footprint
  // where rounding cannot reach it, then pinning the small-shrub deviation separately, says
  // both true things instead of hiding one behind a loosened tolerance.
  const clean = { cx: 0, cy: 0, w: 10, h: 10 };
  assert.equal(livePixelBudget(clean, 1, 1), 100);
  assert.equal(livePixelBudget(clean, 2, 1), 400);
  assert.equal(livePixelBudget(clean, 4, 1), 1600);

  const shrub = { cx: 0, cy: 0, w: 6, h: 3 };
  assert.equal(
    livePixelBudget(shrub, 1),
    spritePixelBudget(shrub),
    'at 1 px/unit the live budget IS the sprite budget — the two conventions must agree there',
  );
  const ratio = livePixelBudget(shrub, 2) / livePixelBudget(shrub, 1);
  assert.ok(
    ratio > 3.5 && ratio < 4.0,
    `the 6x3 shrub 2x ratio is ${ratio.toFixed(2)}; expected just under 4 from rounding`,
  );
});

test('the budget functions REFUSE to invent pixels from a degenerate footprint', () => {
  const flat = { cx: 0, cy: 0, w: 0, h: 3 };
  assert.equal(spritePixelBudget(flat), 0);
  assert.equal(livePixelBudget(flat, 8), 0);
});
