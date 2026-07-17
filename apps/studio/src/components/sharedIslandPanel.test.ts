// Stage-1 red-green (ADR-0070) for the two owner-directed Shared Islands panel tweaks
// (ADR-0088 follow-on, owner ask 2026-06-22):
//
//   1. the bookshelf landmark glyph moves OUT of the name card to sit to its RIGHT, bigger
//      — a pure anchor helper `bookshelfAnchorRight` places it beyond the plate's right edge,
//      vertically aligned with the plate;
//   2. the panel island gets the SAME ground/grid substrate the map paints under the coast —
//      so `buildRelaxedCells` over the panel's one-island world yields owned ground cells.
//
// The APPEARANCE (exact scale, margin, ground look in the small card) is owner-attested; this
// file pins only the testable geometry/behaviour.

import { describe, it, expect } from 'vitest';
import {
  buildWorld,
  nameplateLayout,
  bookshelfAnchorRight,
  buildRelaxedCells,
  cityStampSpots,
  MESH_TUNING,
} from './TreeView.js';
import { axialKey, crownRadius, pixelToHex } from '@storytree/forest-world';
import type { TreeStory } from '../types';

const cap = (id: string) => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped' as const,
  proofMode: 'red-green',
  dependsOn: [],
  testCount: 0,
});

const libraryStory = (): TreeStory => ({
  id: 'library',
  title: 'library',
  outcome: '',
  status: 'mapped',
  proofMode: 'red-green',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: ['cli', 'alpha'],
  building: true,
  capabilities: [cap('library-a'), cap('library-b'), cap('library-c')],
});

describe('bookshelfAnchorRight — the external (right-of-card) bookshelf landmark (tweak 1)', () => {
  // A representative normal nameplate for the library id, centred on a centroid.
  const plate = nameplateLayout('library'.length, false);
  const centroidX = 120;
  const labelY = 200;
  const margin = 8;

  it('anchors the glyph BEYOND the nameplate box right edge, by the margin', () => {
    const anchor = bookshelfAnchorRight(plate, centroidX, labelY, margin);
    const plateRight = centroidX + plate.w / 2;
    expect(anchor.x).toBeGreaterThan(plateRight);
    expect(anchor.x).toBeCloseTo(plateRight + margin, 5);
  });

  it('vertically aligns the glyph with the nameplate box (sits within the plate band)', () => {
    const anchor = bookshelfAnchorRight(plate, centroidX, labelY, margin);
    // the glyph baseline sits inside the plate's vertical span (labelY .. labelY+h),
    // i.e. it lines up with the card rather than floating above/below it.
    expect(anchor.y).toBeGreaterThanOrEqual(labelY);
    expect(anchor.y).toBeLessThanOrEqual(labelY + plate.h);
  });

  it('is a pure function of its inputs (deterministic — same in → same out)', () => {
    const a = bookshelfAnchorRight(plate, centroidX, labelY, margin);
    const b = bookshelfAnchorRight(plate, centroidX, labelY, margin);
    expect(a).toEqual(b);
  });

  it('moves right when the margin grows (the owner can nudge the gap)', () => {
    const near = bookshelfAnchorRight(plate, centroidX, labelY, 4);
    const far = bookshelfAnchorRight(plate, centroidX, labelY, 24);
    expect(far.x).toBeGreaterThan(near.x);
  });
});

describe('panel ground — the one-island world has a substrate to render (tweak 2)', () => {
  it('yields mesh ground cells for the panel one-island world (the default substrate)', () => {
    const world = buildWorld([libraryStory()], { buildings: false });
    const cells = buildRelaxedCells(world, 'mesh', MESH_TUNING);
    // the panel island now HAS a ground layer to paint under its coast + flora
    expect(cells.length).toBeGreaterThan(0);
  });

  it('every ground cell is owned by the single territory (owner 0)', () => {
    const world = buildWorld([libraryStory()], { buildings: false });
    expect(world.territories.length).toBe(1);
    const cells = buildRelaxedCells(world, 'mesh', MESH_TUNING);
    expect(cells.every((c) => c.owner === 0)).toBe(true);
  });

  it('each ground cell is a closed polygon (≥ 3 points)', () => {
    const world = buildWorld([libraryStory()], { buildings: false });
    const cells = buildRelaxedCells(world, 'mesh', MESH_TUNING);
    expect(cells.every((c) => c.poly.length >= 3)).toBe(true);
  });

  it('is deterministic (ADR-0069) — the same story yields the same ground twice', () => {
    const a = buildRelaxedCells(buildWorld([libraryStory()], { buildings: false }), 'mesh', MESH_TUNING);
    const b = buildRelaxedCells(buildWorld([libraryStory()], { buildings: false }), 'mesh', MESH_TUNING);
    expect(a.length).toBe(b.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ADR-0102 (owner ask 2026-06-25): the panel card's dependency CITY sits ON the island's land,
// mirroring the on-map stamp seating — NOT in a grid beside the card. `cityStampSpots` fans the
// dependency buildings around the central tree and snaps each onto an owned tile. Stage-1 red-green
// of WHERE each building lands; the look (density, spread, scale) is owner-attested.
describe('cityStampSpots — the dependency city seats ON the island land (ADR-0102 §3)', () => {
  // A realistic one-island world (what SharedIslandCard lays out) gives us the real owned-tile set
  // + tree spot the helper snaps against, so the test exercises the same geometry the card does.
  const island = (capCount: number): { treeSpot: { x: number; y: number }; ownedKeys: Set<string>; crownR: number } => {
    const story: TreeStory = {
      id: 'cli',
      title: 'cli',
      outcome: '',
      status: 'mapped',
      proofMode: 'red-green',
      uatWitness: 'machine',
      dependsOn: [],
      consumedBy: [],
      capabilities: Array.from({ length: capCount }, (_, i) => cap(`cli-${i}`)),
    };
    const world = buildWorld([story], { buildings: false });
    const t = world.territories[0]!;
    return {
      treeSpot: t.treeSpot,
      ownedKeys: new Set(t.tiles.map(axialKey)),
      crownR: crownRadius(capCount),
    };
  };

  // A dense (cli-like, 6) and a sparse (library-like, 2) city, both on a real island.
  const DENSE = ['agent', 'drive-machinery', 'library', 'notice-board', 'proof-protocol', 'storage-protocol'];
  const SPARSE = ['proof-protocol', 'storage-protocol'];

  it('places one stamp per dependency icon, preserving the icon ids', () => {
    const { treeSpot, ownedKeys, crownR } = island(8);
    const spots = cityStampSpots(treeSpot, crownR, DENSE, ownedKeys);
    expect(spots.map((s) => s.icon)).toEqual(DENSE);
  });

  it('seats EVERY city building on OWNED land (never floating over the sea) — dense city', () => {
    const { treeSpot, ownedKeys, crownR } = island(8);
    const spots = cityStampSpots(treeSpot, crownR, DENSE, ownedKeys);
    for (const s of spots) {
      expect(ownedKeys.has(axialKey(pixelToHex(s.spot)))).toBe(true);
    }
  });

  it('seats EVERY city building on OWNED land — sparse city too', () => {
    const { treeSpot, ownedKeys, crownR } = island(3);
    const spots = cityStampSpots(treeSpot, crownR, SPARSE, ownedKeys);
    for (const s of spots) {
      expect(ownedKeys.has(axialKey(pixelToHex(s.spot)))).toBe(true);
    }
  });

  it('is deterministic (ADR-0069) — the same inputs yield the same spots', () => {
    const { treeSpot, ownedKeys, crownR } = island(8);
    const a = cityStampSpots(treeSpot, crownR, DENSE, ownedKeys);
    const b = cityStampSpots(treeSpot, crownR, DENSE, ownedKeys);
    expect(a).toEqual(b);
  });

  it('spreads a dense city out (not all on one point) — distinct seats', () => {
    const { treeSpot, ownedKeys, crownR } = island(8);
    const spots = cityStampSpots(treeSpot, crownR, DENSE, ownedKeys);
    const distinct = new Set(spots.map((s) => `${s.spot.x.toFixed(1)},${s.spot.y.toFixed(1)}`));
    // a 6-building city should occupy several distinct seats, not collapse to one
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  it('is empty for an island that depends on nothing (no city)', () => {
    const { treeSpot, ownedKeys, crownR } = island(3);
    expect(cityStampSpots(treeSpot, crownR, [], ownedKeys)).toEqual([]);
  });
});
