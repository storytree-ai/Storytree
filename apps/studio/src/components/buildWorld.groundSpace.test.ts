// The studio map's island layout takes its two geometry decisions ON THE GROUND, not on the screen
// (`studio-island-layout-moves-to-ground-space`, the last increment of `ground-space-truth-arc`;
// ADR-0367 D1's declared camera is what exposed the class).
//
// THE TWO DECISIONS. `buildWorld` chooses the tile the story's own tree stands on, and it seats each
// capability's garden plant on a ring around that tree. Both used to be taken in PROJECTED
// coordinates, where a ground separation running away from the viewer covers only `sin 20° ≈ 0.342`
// of the screen it covers in plan view — so the hero-tile argmin preferred tiles displaced along the
// depth axis, and a "ring" of screen radius `r` squashed by a hand-picked `0.66` was a 1.93x ELLIPSE
// on the land. Each cap spot is its capability's parcel seed (`capToParcel`), so the second one was
// skewing the Voronoi partition that decides which ground each capability owns — and under ADR-0226
// a plant's presence and health report that capability's proof state, so the partition is what every
// plant's claim rests on.
//
// WHY THESE ARE VALUE ASSERTIONS AND NOT A CAMERA SWEEP. The obvious proof — build the world at two
// elevations and assert the layout agrees — is a SELF-COMPARISON: it proves equivariance and nothing
// about the value, and is blind to anything wrong the same way at every elevation (measured on this
// arc's own `substrate-camera.test.ts`, where a diff-scoped mutation run found 17 of 33 mutants
// surviving exactly such a suite). It is also not even expressible end-to-end here: `buildWorld`
// packs its islands so they do not overlap ON SCREEN and snaps that packing to the lattice through
// `pixelToHex`, so the TILE SET is legitimately a function of the camera. So each decision is pinned
// against a value instead, every fixture carries the RETIRED formula replayed on it as a control,
// and the layout the fixture produces carries one deliberate digest.

import { describe, it, expect } from 'vitest';
import {
  hexCenter,
  unprojectGround,
  groundFlattening,
  axialKey,
  pixelToHex,
  HEX_R,
  PLAN_VIEW_ELEVATION_DEG,
  LAND_CAMERA_ELEVATION_DEG,
  hash,
  rand01,
  type Axial,
  type Pt,
} from '@storytree/forest-world';
import { buildWorld, groundHeroTile, groundPolarOffset } from './TreeView.js';
import type { TreeCapability, TreeStory } from '../types';

// ---------------------------------------------------------------------------------------------
// The RETIRED formulae, replayed as controls. If either of these ever stops disagreeing with the
// shipped answer on the fixture below, the FIXTURE has stopped describing the defect — fix the
// fixture, never the assertion.
// ---------------------------------------------------------------------------------------------

/** The screen-space argmin `groundHeroTile` replaced: nearest-to-centroid on PROJECTED centres. */
function retiredScreenHeroTile(tiles: readonly Axial[]): Axial | undefined {
  const centers = tiles.map((h) => hexCenter(h));
  const centroid: Pt = {
    x: centers.reduce((s, p) => s + p.x, 0) / Math.max(centers.length, 1),
    y: centers.reduce((s, p) => s + p.y, 0) / Math.max(centers.length, 1),
  };
  return [...tiles].sort((a, b) => {
    const ca = hexCenter(a);
    const cb = hexCenter(b);
    return (
      Math.hypot(ca.x - centroid.x, ca.y - centroid.y) -
      Math.hypot(cb.x - centroid.x, cb.y - centroid.y)
    );
  })[0];
}

/** The hand-picked `0.66` top-down squash `groundPolarOffset` replaced. */
function retiredSquashOffset(ang: number, r: number): Pt {
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.66 };
}

// ---------------------------------------------------------------------------------------------
// THE HERO TILE
// ---------------------------------------------------------------------------------------------

/**
 * A four-tile hook, chosen because BOTH argmins are strict on it (no tie decides the answer) and
 * they pick different tiles. Verified by hand, at `HEX_R = 27`, `HEX_W = 46.765…`:
 *
 *   tile      ground centre        ground gap    screen centre         screen gap
 *   (0,0)     (  0.00,  0.00)          60.75     (  0.00,  0.00)           53.63
 *   (1,0)     ( 46.77,  0.00)          30.93     ( 46.77,  0.00)        →  11.92   ← screen picks
 *   (1,1)     ( 70.15, 40.50)       →  20.25     ( 70.15, 13.85)           17.88
 *   (1,2)     ( 93.53, 81.00)          65.09     ( 93.53, 27.70)           44.43
 *      ↑ ground picks
 *
 * (1,1) is genuinely the middle of the hook. (1,0) only LOOKS nearest, because the camera flattens
 * the depth axis the hook runs along — which is the whole defect, in four tiles.
 */
const HOOK: Axial[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 1, r: 1 },
  { q: 1, r: 2 },
];

describe('groundHeroTile — the story tree stands where the GROUND says the middle is', () => {
  it('picks the ground-nearest tile, not the projection-nearest one', () => {
    expect(groundHeroTile(HOOK)).toEqual({ q: 1, r: 1 });
  });

  it('CONTROL: the retired screen argmin picks a DIFFERENT tile on this same fixture', () => {
    // The fixture must still exhibit the defect, or the assertion above verifies nothing.
    expect(retiredScreenHeroTile(HOOK)).toEqual({ q: 1, r: 0 });
    expect(retiredScreenHeroTile(HOOK)).not.toEqual(groundHeroTile(HOOK));
  });

  it('CONTROL: the fixture really is foreshortened — the camera is declared and active', () => {
    // A sweep over an unchanged picture passes with any implementation. Pin that this lattice
    // genuinely projects: the hook's deepest tile loses ~66% of its ground depth on screen.
    const deep = HOOK[3]!;
    const ground = hexCenter(deep, { elevationDeg: PLAN_VIEW_ELEVATION_DEG });
    const screen = hexCenter(deep);
    expect(ground.y).toBeCloseTo(81, 6);
    expect(screen.y).toBeCloseTo(81 * groundFlattening(LAND_CAMERA_ELEVATION_DEG), 6);
    expect(screen.x).toBeCloseTo(ground.x, 6); // the across-screen axis is untouched
  });

  it('pins the winning ground gap, so a drifted fixture is caught rather than absorbed', () => {
    const centers = HOOK.map((h) => hexCenter(h, { elevationDeg: PLAN_VIEW_ELEVATION_DEG }));
    const centroid = {
      x: centers.reduce((s, p) => s + p.x, 0) / centers.length,
      y: centers.reduce((s, p) => s + p.y, 0) / centers.length,
    };
    const gaps = centers.map((p) => Math.hypot(p.x - centroid.x, p.y - centroid.y)).sort((a, b) => a - b);
    expect(gaps[0]).toBeCloseTo(20.25, 2);
    expect(gaps[1]).toBeCloseTo(30.93, 2); // a 10.68 px margin — no tie is deciding this
  });

  it('breaks an exact tie toward the earliest tile in input order (the retired sort was stable)', () => {
    // Three mutually adjacent tiles put every centre the same distance from the centroid.
    const equilateral: Axial[] = [
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 0 },
    ];
    expect(groundHeroTile(equilateral)).toEqual({ q: 0, r: 0 });
    expect(groundHeroTile([...equilateral].reverse())).toEqual({ q: 1, r: 0 });
  });

  it('returns undefined for an empty tile set (buildWorld falls back to the island seed)', () => {
    expect(groundHeroTile([])).toBeUndefined();
  });

  it('is a function of the TILE SET alone — translating an island cannot change which tile wins', () => {
    // Not a camera sweep: a pure-translation control. `hexCenter` is affine in (q, r), so shifting
    // every tile shifts the centroid with it; a hero tile that moved under translation would mean
    // the argmin had picked up a dependence on absolute position.
    const shifted = HOOK.map((h) => ({ q: h.q - 3, r: h.r + 2 }));
    expect(groundHeroTile(shifted)).toEqual({ q: 1 - 3, r: 1 + 2 });
  });
});

// ---------------------------------------------------------------------------------------------
// THE CAPABILITY RING
// ---------------------------------------------------------------------------------------------

describe('groundPolarOffset — a GROUND circle, projected once', () => {
  const sin = groundFlattening(LAND_CAMERA_ELEVATION_DEG); // 0.3420201…

  it('leaves the across-screen axis alone and foreshortens the depth axis by sin θ', () => {
    // Literal values, not a round trip through the function's own inverse.
    expect(groundPolarOffset(0, 100)).toEqual({ x: 100, y: 0 });
    const east = groundPolarOffset(0, 100);
    expect(east.x).toBeCloseTo(100, 9);
    expect(east.y).toBeCloseTo(0, 9);

    const south = groundPolarOffset(Math.PI / 2, 100);
    expect(south.x).toBeCloseTo(0, 9);
    expect(south.y).toBeCloseTo(34.2020143, 6); // 100 · sin 20°, NOT 100 · 0.66

    const west = groundPolarOffset(Math.PI, 100);
    expect(west.x).toBeCloseTo(-100, 9);
    expect(west.y).toBeCloseTo(0, 9);

    const north = groundPolarOffset(-Math.PI / 2, 100);
    expect(north.y).toBeCloseTo(-34.2020143, 6); // the sign survives

    const se = groundPolarOffset(Math.PI / 4, 100);
    expect(se.x).toBeCloseTo(70.7106781, 6);
    expect(se.y).toBeCloseTo(70.7106781 * sin, 6);
  });

  it('CONTROL: the retired 0.66 squash disagrees by the measured 1.93x on the depth axis', () => {
    const fixed = groundPolarOffset(Math.PI / 2, 100);
    const retired = retiredSquashOffset(Math.PI / 2, 100);
    expect(retired.y).toBeCloseTo(66, 9);
    expect(retired.y / fixed.y).toBeCloseTo(1.9297, 4); // 0.66 / sin 20°
  });

  it('a ground circle projects to a screen ellipse of the camera\'s own aspect', () => {
    const rs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const o = groundPolarOffset((k / 8) * Math.PI * 2, 60);
      return Math.hypot(o.x, o.y);
    });
    expect(Math.max(...rs)).toBeCloseTo(60, 6); // across the screen: untouched
    expect(Math.min(...rs)).toBeCloseTo(60 * sin, 6); // into the depth: sin θ
  });
});

const cap = (id: string): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'red-green',
  dependsOn: [],
  testCount: 3,
});

/**
 * An eight-capability island — a ten-tile territory, big enough that no plant is walked inward by
 * the keep-IN loop, so every cap spot below is the ring's own answer rather than the walk's.
 * `crownRadius(8) = min(32, 18 + 17.6) = 32`, so `ringR = min(32 + 18, groundRadius − HEX_R·0.55)
 * = min(50, 112.85 − 14.85) = 50`, and each plant's own radius wobbles ±5 around it.
 */
const RING_FIXTURE: TreeStory = {
  id: 'ring-fixture',
  title: 'ring-fixture',
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  capabilities: Array.from({ length: 8 }, (_, j) => cap(`ring-fixture-c${j}`)),
};

/** Every capability's offset from the story tree, measured back on the GROUND PLANE. */
function capGroundOffsets(): { r: number; screenR: number }[] {
  const world = buildWorld([RING_FIXTURE], { buildings: false });
  const t = world.territories[0]!;
  return t.caps.map((c) => {
    const dx = c.x - t.treeSpot.x;
    const dy = c.y - t.treeSpot.y;
    const g = unprojectGround({ x: dx, y: dy });
    return { r: Math.hypot(g.x, g.y), screenR: Math.hypot(dx, dy) };
  });
}

describe('the capability ring is a CIRCLE on the ground', () => {
  it('seats every plant at the SAME ground radius, within its own ±5 wobble', () => {
    const rs = capGroundOffsets().map((o) => o.r);
    expect(rs).toHaveLength(8);
    // The value, not merely the shape: `ringR` is 50 here and the per-plant wobble is ±5, so a
    // ground radius outside this band means either the squash is back or `ringR` read the wrong
    // radius. Under the retired formula these ran from 45 to 106.
    for (const r of rs) {
      expect(r).toBeGreaterThanOrEqual(45);
      expect(r).toBeLessThanOrEqual(55);
    }
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThanOrEqual(10);
  });

  it('CONTROL: the retired squash, replayed on this fixture, breaks that band', () => {
    // Same angles and same radii, differing only in how the offset reaches the screen.
    const ARC = (Math.PI * 4) / 3;
    const n = RING_FIXTURE.capabilities.length;
    const ringR = 50;
    const retired = RING_FIXTURE.capabilities.map((c, j) => {
      const slot = -Math.PI / 6 + ((j + 0.5) / n) * ARC;
      const angle = slot + (rand01(hash(`${RING_FIXTURE.id}:${c.id}:a`)) - 0.5) * (ARC / n) * 0.5;
      const rr = ringR + (rand01(hash(`${RING_FIXTURE.id}:${c.id}:r`)) - 0.5) * 10;
      const g = unprojectGround(retiredSquashOffset(angle, rr));
      return Math.hypot(g.x, g.y);
    });
    expect(Math.max(...retired)).toBeGreaterThan(55);
    expect(Math.max(...retired) - Math.min(...retired)).toBeGreaterThan(10);
  });

  it('CONTROL: the ring is deliberately NOT a circle on the SCREEN — the camera is doing work', () => {
    // If this ratio were ~1 the fixture would be in plan view, and the assertion above would hold
    // for a squash of any value. A ground circle at 20° must read as a markedly flattened ellipse.
    const screenRs = capGroundOffsets().map((o) => o.screenR);
    expect(Math.max(...screenRs) / Math.min(...screenRs)).toBeGreaterThan(1.8);
  });

  it('SNAPSHOT: the layout this fixture produces', () => {
    // Deliberate, and next to the properties above rather than instead of them: nobody eyeballs
    // this ring, and moving it moves the per-capability PARCEL PARTITION downstream (each spot is
    // that capability's Voronoi seed). WHEN THIS GOES RED: establish what moved and say so in the
    // landing — the studio's accretion wave and forest-world-r3f's parcel outlines both read from
    // this partition — and only THEN re-record. Never re-record reflexively.
    const world = buildWorld([RING_FIXTURE], { buildings: false });
    const t = world.territories[0]!;
    const digest = [
      `tree ${t.treeSpot.x.toFixed(2)},${t.treeSpot.y.toFixed(2)}`,
      ...t.caps.map((c) => `${c.cap.id.slice(-2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`),
    ].join(' | ');
    expect(digest).toBe(
      'tree 0.00,-138.52 | c0 45.08,-141.39 | c1 51.25,-134.21 | c2 32.31,-125.76' +
        ' | c3 20.21,-121.75 | c4 -17.78,-122.41 | c5 -34.87,-125.40 | c6 -46.37,-133.79' +
        ' | c7 -49.18,-140.84',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// THE CONSEQUENCE — a parcel seed that stands on somebody else's ground
// ---------------------------------------------------------------------------------------------

/** A synthetic story set with the shape the real map has, deterministic per `worldSeed`. */
function synthWorld(worldSeed: number, n: number): TreeStory[] {
  const out: TreeStory[] = [];
  for (let i = 0; i < n; i++) {
    const id = `w${worldSeed}-s${i}`;
    const capCount = 1 + (hash(`${id}:caps`) % 8);
    const deps: string[] = [];
    if (i > 0) deps.push(`w${worldSeed}-s${hash(`${id}:d1`) % i}`);
    out.push({
      id,
      title: id,
      outcome: '',
      status: 'mapped',
      proofMode: 'UAT',
      uatWitness: 'machine',
      dependsOn: deps,
      consumedBy: [],
      capabilities: Array.from({ length: capCount }, (_, j) => cap(`${id}-c${j}`)),
    });
  }
  return out;
}

describe('buildWorld actually TAKES the ground answer', () => {
  it('every island\'s tree stands on the ground-nearest tile, and on some islands that differs', () => {
    // The helper's own value pins above prove the ground answer is right; this proves `buildWorld`
    // is the thing asking for it. The second assertion is what keeps the first non-vacuous: if the
    // sweep contained no island where the two answers differ, a `buildWorld` still running the
    // retired argmin would satisfy this test.
    let islands = 0;
    let differsFromRetired = 0;
    for (let w = 0; w < 5; w++) {
      for (const t of buildWorld(synthWorld(w, 40), { buildings: false }).territories) {
        islands++;
        const ground = groundHeroTile(t.tiles);
        expect(ground).toBeDefined();
        const seat = hexCenter(ground!);
        expect(t.treeSpot.x).toBeCloseTo(seat.x, 9);
        expect(t.treeSpot.y).toBeCloseTo(seat.y, 9);
        if (axialKey(retiredScreenHeroTile(t.tiles)!) !== axialKey(ground!)) differsFromRetired++;
      }
    }
    expect(islands).toBe(200);
    // Measured on this branch: 14.00% over 1,600 synthetic islands, 5 of the shipped corpus's 35.
    expect(differsFromRetired).toBeGreaterThan(islands * 0.05);
  });
});

describe('every capability parcel seed stands on its OWN island', () => {
  it('across a 200-island sweep, no cap spot resolves to foreign soil or open water', () => {
    // Not a restatement of the ring's shape: this is the CONSEQUENCE the ellipse had. The retired
    // ring over-reached the island's own projected height by roughly two, so the keep-IN walk ran
    // on 49.01% of plants and still left 3.41% of them off their island — a Voronoi seed outside
    // the land it is meant to partition. Measured on this branch: 15.00% walk, 0.00% escape.
    let caps = 0;
    let escaped = 0;
    let walkedOrWorse = 0;
    for (let w = 0; w < 5; w++) {
      const world = buildWorld(synthWorld(w, 40), { buildings: false });
      const owner = new Map<string, number>();
      world.drawTiles.forEach((d) => owner.set(axialKey(d.h), d.owner));
      world.territories.forEach((t, ti) => {
        for (const c of t.caps) {
          caps++;
          if (owner.get(axialKey(pixelToHex({ x: c.x, y: c.y }))) !== ti) escaped++;
          const g = unprojectGround({ x: c.x - t.treeSpot.x, y: c.y - t.treeSpot.y });
          // A walked plant is pulled inward in 25% steps, so its ground radius drops below the
          // ring band. Counting them keeps the walk's load visible rather than merely bounded.
          if (Math.hypot(g.x, g.y) < t.groundRadius * 0.2) walkedOrWorse++;
        }
      });
    }
    expect(caps).toBeGreaterThan(800);
    expect(escaped).toBe(0);
    // A regression that pushed plants back off the island would show here first, as a walk load
    // climbing back toward the retired formula's 49%.
    expect(walkedOrWorse / caps).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------------------------
// `HEX_R` is referenced in the fixture's own arithmetic above; keep the import honest.
// ---------------------------------------------------------------------------------------------
describe('fixture arithmetic', () => {
  it('states the constants the ring band above is derived from', () => {
    expect(HEX_R).toBe(27);
    const world = buildWorld([RING_FIXTURE], { buildings: false });
    const t = world.territories[0]!;
    expect(t.tiles).toHaveLength(10);
    expect(t.groundRadius).toBeCloseTo(112.85, 2);
    // ringR = min(crownRadius(8) + 18, groundRadius − HEX_R·0.55) = min(50, 98) = 50
    expect(Math.min(50, t.groundRadius - HEX_R * 0.55)).toBeCloseTo(50, 6);
  });
});
