// island-fixture.ts — ONE island scene, shared by the evidence page and its tests.
//
// It is deliberately shaped after `context-traversal-capture`, the arc's chosen research
// surface (11 capabilities, 13 hexes, all healthy): the arc learned the hard way that
// judging colour on an invented fixture is how three passes came to be decided against
// fabricated status. This is still a fixture rather than the live corpus — a harness page
// must render with no database — but its SHAPE and its status distribution are taken from
// the real island rather than made up, and the ways it is NOT the real thing are written
// down here rather than discovered later:
//
//   - every capability is `healthy`, which is true of the real research surface and is the
//     whole reason that surface was chosen (ADR-0040: green comes from a signed verdict);
//   - test counts are the real spread's shape (a few large, most small), not the real
//     numbers, so plant DENSITY is representative but not a corpus reading;
//   - one capability is deliberately given a foreign status further down the page, to show
//     what a mixed island does to the banded material. It is labelled where it appears.

import {
  buildRelaxedCells,
  buildScene,
  hexCenter,
  type Axial,
  type RelaxedCell,
  type SceneG,
  type SceneInput,
  type SceneParcelInput,
  type SceneStatus,
  type SceneTerritoryInput,
  type SurfaceTheme,
} from '@storytree/forest-world';

/** A 13-hex island: a centre, its six neighbours, and a second ring stub — the shape a
 *  real mid-sized story tends to take once its capabilities are laid out. */
const TILES: Axial[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
  { q: 2, r: -1 },
  { q: -2, r: 1 },
  { q: 1, r: 1 },
  { q: -1, r: -1 },
  { q: 2, r: 0 },
  { q: -2, r: 0 },
];

/** Eleven capabilities. Test counts follow the real spread's SHAPE — one heavy, a couple
 *  mid, most light — because vegetation density is `2 + tests * 1.9` (ADR-0226 D2) and a
 *  flat distribution would draw an island that reads as uniform when the real one does not. */
const CAP_TESTS = [14, 9, 7, 6, 5, 4, 4, 3, 3, 2, 2];
const THEMES: SurfaceTheme[] = ['meadow', 'woodland', 'heath'];

export interface IslandOptions {
  /** Give ONE capability a foreign status, to show a mixed island. Index into CAP_TESTS. */
  oddOneOut?: { index: number; status: SceneStatus };
}

export function islandScene(opts: IslandOptions = {}): SceneG {
  const centres = TILES.map((h) => hexCenter(h));
  const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const cy = centres.reduce((s, c) => s + c.y, 0) / centres.length;
  const drawTiles = TILES.map((h) => ({ h, owner: 0 }));
  // 'mesh' is the shipped studio substrate — the relaxed decomposition the parcels ride on.
  const relaxed: RelaxedCell[] = buildRelaxedCells(drawTiles, [new Set<string>()], 'mesh');

  const parcels: SceneParcelInput[] = CAP_TESTS.map((tests, i) => ({
    capId: `cap-${i}`,
    status: opts.oddOneOut?.index === i ? opts.oddOneOut.status : ('healthy' as SceneStatus),
    testCount: tests,
    theme: THEMES[i % THEMES.length]!,
    // Seeds spread over the tiles so the Voronoi sub-partition gives every capability a
    // real parcel rather than slivers.
    seed: hexCenter(TILES[i % TILES.length]!),
  }));

  const territory: SceneTerritoryInput = {
    id: 'context-traversal-capture',
    status: 'healthy',
    caps: parcels.length,
    centroid: { x: cx, y: cy },
    groundRadius: 70,
    screenRadius: 70 * Math.sin((20 * Math.PI) / 180),
    treeSpot: { x: cx, y: cy - 6 },
    labelY: cy + 46,
    coastPaths: [],
    decor: [],
    plants: [],
    treeTitle: 'context-traversal-capture',
    wisps: [],
    parcels,
    plate: {
      w: 120,
      h: 33,
      rx: 7,
      idY: 14,
      subY: 27,
      idText: 'context-traversal-capture',
      subText: `healthy · ${parcels.length} caps`,
      title: 'context-traversal-capture',
    },
  };

  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 1200,
    height: 900,
    empties: [],
    relaxedCells: relaxed,
    drawTiles,
    wheatSets: [new Set<string>()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [territory],
  };
  return buildScene(input);
}
