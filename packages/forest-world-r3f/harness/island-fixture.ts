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
export const ISLAND_TILES: Axial[] = [
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
  /**
   * Put EVERY capability, and the territory itself, in one status — the whole island as one
   * state.
   *
   * It is the comparison the colour vocabulary needs (ADR-0462) and nothing else can give: a
   * mixed island shows five colours at five different sizes, in five different neighbourhoods,
   * against five different neighbours, so a reader comparing two of them is comparing shape and
   * placement as much as colour. One state per island holds everything else fixed.
   *
   * ⚠ IT IS A LABELLED DEVIATION, never a default, for the same reason `criteriaStates` is: an
   * island that shipped `unhealthy` as its resting state would be the art asserting a proof state
   * the work does not hold (ADR-0367 D5). `oddOneOut` wins over it where both are given, so the
   * mixed panel keeps working unchanged.
   */
  status?: SceneStatus;
  /** Give ONE capability a foreign status, to show a mixed island. Index into CAP_TESTS. */
  oddOneOut?: { index: number; status: SceneStatus };
  /**
   * Give SEVERAL capabilities foreign statuses. Applied after `oddOneOut`, so the two compose
   * and every existing caller is unchanged.
   *
   * ⚠ IT EXISTS BECAUSE ONE DEVIATION CANNOT SHOW A VOCABULARY. A dressing whose props are
   * chosen BY status needs more than one status on the island to be visible at all — with a
   * single odd one out, the arms for the other states are tested and never seen. Like
   * `oddOneOut` it is a LABELLED deviation and never a default: an island that shipped mixed
   * statuses as its resting state would be the art asserting a proof state the work does not
   * hold (ADR-0367 D5).
   */
  oddOnesOut?: ReadonlyArray<{ index: number; status: SceneStatus }>;
  /** Override the UAT criteria's proof states, positionally. Short arrays fill from the front
   *  and the rest stay `proven`. The MIXED panel's control — a labelled deviation, never the
   *  default, because a default that showed unsigned criteria as failing would be the art
   *  asserting a state the work does not hold (ADR-0367 D5). */
  criteriaStates?: CriterionState[];
  /** Draw the UAT flowers at all. `false` is the pre-flowers control the 2026-08-19 island was,
   *  which is what makes "what did the flowers add" answerable rather than remembered. */
  flowers?: boolean;
}

/**
 * ONE CAPABILITY'S FACTS, as the fixture holds them.
 *
 * ⚠ EXPORTED BECAUSE `buildScene`'s OUTPUT CANNOT ANSWER THIS. `SceneG` is a drawing — groups,
 * paths and circles — so a consumer that needs to know how many contracts a capability holds
 * cannot read it back off the scene, and counting the parcel's ground CELLS would be a measure
 * of AREA wearing a contract count's name. `islandScene` builds its parcels from this list, so
 * the two cannot drift.
 */
export interface FixtureCapability {
  capId: string;
  status: SceneStatus;
  testCount: number;
  theme: SurfaceTheme;
}

/** The island's eleven capabilities, with whatever status the options put them in. */
export function islandCapabilities(opts: IslandOptions = {}): FixtureCapability[] {
  return CAP_TESTS.map((tests, i) => ({
    capId: `cap-${i}`,
    status:
      opts.oddOnesOut?.find((o) => o.index === i)?.status ??
      (opts.oddOneOut?.index === i
        ? opts.oddOneOut.status
        : (opts.status ?? ('healthy' as SceneStatus))),
    testCount: tests,
    theme: THEMES[i % THEMES.length]!,
  }));
}

/**
 * THE ISLAND'S OWN STATE — the STORY's, not a roll-up of its capabilities.
 *
 * ⚠ THIS IS THE RULE, NOT A HARNESS SHORTCUT, and it is worth knowing which. On the shipped map a
 * story's status is its OWN UAT node's signed verdict and never a child roll-up (ADR-0033 d.4,
 * restated in `apps/studio/src/lib/worldStatus.ts`: green derives from the signed verdict, and a
 * story's verdict is its own). So "the island as a whole is tinted by its rolled-up state"
 * (ADR-0475 D2) already has an answer in this codebase and does not need one invented: it is the
 * territory's status, which is exactly what `islandScene` stamps on the territory below.
 *
 * It is a function rather than an inlined `?? 'healthy'` in two places because it now has two
 * callers — the scene builder and the ground's uniform tint — and two copies of a default is how
 * a land and the story it draws come to disagree.
 */
export function islandStatus(opts: IslandOptions = {}): SceneStatus {
  return opts.status ?? 'healthy';
}

/**
 * The story's ten UAT criteria and their proof states — the same list the flowers ride on.
 *
 * ⚠⚠ THE DEFAULT FOLLOWS THE ISLAND'S OWN STATE, and that is a correctness fix rather than a
 * tidy-up. It used to default every criterion to `proven` whatever the island was, which is
 * coherent for the all-healthy research surface this fixture is shaped after and INCOHERENT for
 * any other: a story's status IS its own signed UAT verdict (ADR-0033 d.4, and
 * `apps/studio/src/lib/worldStatus.ts` — a signed pass renders the unit healthy), so a story
 * carrying ten signed criteria cannot be `unknown`.
 *
 * Measured on the 2026-08-29 crowd before this changed: all 35 islands drew ten blooms each,
 * INCLUDING the `unknown` one and the `unhealthy` one — the picture asserting the owner had
 * signed ten criteria on a story nobody has checked. That is the one way this arc can do real
 * harm (ADR-0392 D5 / ADR-0398 D7), arriving through the fixture rather than through the
 * vocabulary.
 *
 * `criteriaStates` still overrides positionally, so the MIXED panel — a labelled deviation — is
 * unchanged, and so is every panel that does not name a status (the default island is healthy).
 */
export function islandCriteria(opts: IslandOptions = {}): Array<{ id: string; state: CriterionState }> {
  const fallback: CriterionState = islandStatus(opts) === 'healthy' ? 'proven' : 'pending';
  return CRITERIA.map((id, i) => ({ id, state: opts.criteriaStates?.[i] ?? fallback }));
}

export function islandScene(opts: IslandOptions = {}): SceneG {
  const centres = ISLAND_TILES.map((h) => hexCenter(h));
  const cx = centres.reduce((s, c) => s + c.x, 0) / centres.length;
  const cy = centres.reduce((s, c) => s + c.y, 0) / centres.length;
  const drawTiles = ISLAND_TILES.map((h) => ({ h, owner: 0 }));
  // 'mesh' is the shipped studio substrate — the relaxed decomposition the parcels ride on.
  const relaxed: RelaxedCell[] = buildRelaxedCells(drawTiles, [new Set<string>()], 'mesh');

  const parcels: SceneParcelInput[] = islandCapabilities(opts).map((cap, i) => ({
    ...cap,
    // Seeds spread over the tiles so the Voronoi sub-partition gives every capability a
    // real parcel rather than slivers.
    seed: hexCenter(ISLAND_TILES[i % ISLAND_TILES.length]!),
  }));

  const territory: SceneTerritoryInput = {
    id: 'context-traversal-capture',
    status: islandStatus(opts),
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
    territory.uatCriteria = islandCriteria(opts);
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
