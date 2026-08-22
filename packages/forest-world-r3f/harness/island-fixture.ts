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
//     what a mixed island does to the banded material. It is labelled where it appears;
//   - the ten UAT criteria are the real story's — its OWN ten criterion ids, transcribed from
//     `stories/context-traversal-capture/story.md`, because ADR-0226 D4 makes the flower count
//     1:1 with criteria and an invented count would draw the wrong island. Their default STATE
//     is `proven`, which is the same claim the fixture already makes for the ground: this is the
//     all-healthy research surface, and under ADR-0040 green comes from a signed verdict. A
//     MIXED set (`criteriaStates`) shows all three authored verdict forms on one island and is
//     labelled where it appears, exactly like the foreign-status capability.

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
  type SceneVegetationInput,
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

/** The real story's ten UAT criterion ids, in the order `story.md` numbers them. They are here
 *  verbatim rather than as `uat-0..9` because ADR-0226 D4's flower is 1:1 with a CRITERION, and
 *  the scatter seeds each marker's placement and jitter on `hash(storyId:marker:criterionId)` —
 *  so invented ids would place the flowers somewhere the real island never puts them. */
const CRITERIA = [
  'uatc_7d2fd64553fdd66d3d23248c',
  'uatc_6e39dfcc18d5caa4aa3c64a5',
  'uatc_411c5b920d3cc42fc2fb2a4f',
  'uatc_65130d5b0ef6482a5b443cf7',
  'uatc_11abf3bd67912119d765e77a',
  'uatc_6b22fe35e0d9d416355d515a',
  'uatc_cb75462a2561f8db0825a9a2',
  'uatc_4bbb8909ea3e832c7033ae7a',
  'uatc_c52578cfeae287b056726977',
  'uatc_413f00cf1ff8cd520194c4c4',
] as const;

/** A UAT criterion's proof state. Structurally `scene.ts`'s `MarkerState`, restated here
 *  because the core's barrel does not export the type and widening a package the website syncs
 *  is not a harness's call to make. A literal union cannot drift from a literal union. */
export type CriterionState = 'proven' | 'pending' | 'failing';

export interface IslandOptions {
  /** Give ONE capability a foreign status, to show a mixed island. Index into CAP_TESTS. */
  oddOneOut?: { index: number; status: SceneStatus };
  /** Override the UAT criteria's proof states, positionally. Short arrays fill from the front
   *  and the rest stay `proven`. The MIXED panel's control — a labelled deviation, never the
   *  default, because a default that showed unsigned criteria as failing would be the art
   *  asserting a state the work does not hold (ADR-0367 D5). */
  criteriaStates?: CriterionState[];
  /** Draw the UAT flowers at all. `false` is the pre-flowers control the 2026-08-19 island was,
   *  which is what makes "what did the flowers add" answerable rather than remembered. */
  flowers?: boolean;
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
  // ADR-0226 D4: one flower per UAT criterion, 1:1, verdict read from the FORM. `flowers: false`
  // leaves `uatCriteria` ABSENT, which is what suppresses the markers entirely.
  if (opts.flowers !== false) {
    territory.uatCriteria = CRITERIA.map((id, i) => ({
      id,
      state: opts.criteriaStates?.[i] ?? ('proven' as CriterionState),
    }));
  }

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
    // Presence alone selects the ADR-0226 unified vocabulary: SMALL meadow flowers folded into
    // the grass rather than the pre-ADR-0226 tall markers, and the human-witness signpost
    // retired as redundant with them. `heroTrees` is absent, so the island keeps its own
    // procedural central tree — which is the tree this experiment grows as a solid.
    vegetation: {} satisfies SceneVegetationInput,
  };
  return buildScene(input);
}
