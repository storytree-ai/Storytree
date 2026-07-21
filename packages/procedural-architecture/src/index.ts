// The procedural-architecture organism — buildings grown from declared structural
// relations rather than typed coordinates.
//
// The stations of ADR-0217's building factory, each layer ignorant of the next:
//   procedural-utils  station 1's surface — vectors, shapes, the builder, the projection
//   invariants        station 2's gate: check(model) -> Violation[]
//   apertures         an opening is a HOLE — facade cutting and the reveal
//   draw-order        station 3: the explicit deterministic draw order (BSP)
//   bake              station 3's output as DRAWABLES — the pipeline, minus the document
//   render-svg        the ONE file that knows what an SVG DOCUMENT is
//   refine            station 4: the bounded render→look→refine loop + revert-only quorum judge
//
// A building module (./buildings/*) composes the first and is judged by the second.
// There is ONE bake and two printers: `render-svg` prints a contact sheet, a surface
// composes the same baked nodes into a larger scene. Swapping the renderer for a
// three.js backend replaces render-svg and nothing else; draw-order is projection-aware
// but SVG-ignorant, so it survives that swap too.

export * from './procedural-utils.js';
export * from './invariants.js';
export * from './apertures.js';
export * from './draw-order.js';
export * from './refine.js';
export * from './render-svg.js';

// Named rather than `export *`, because render-svg re-exports the palette surface and a
// second star would make those names ambiguous.
export { bakeBuilding } from './bake.js';
export type { BakedNode, BakedBuilding, BakeOptions, Paint } from './bake.js';

// Every building names its parameter block `DEFAULTS`; the barrel disambiguates
// rather than picking a winner.
export {
  mushroomDwelling,
  expectedPartCount,
  DEFAULTS as MUSHROOM_DEFAULTS,
  MARGIN as MUSHROOM_MARGIN,
} from './buildings/mushroom-dwelling.js';
export type { MushroomParams } from './buildings/mushroom-dwelling.js';

export { forestWindmill, DEFAULTS as WINDMILL_DEFAULTS } from './buildings/forest-windmill.js';
export type { WindmillParams } from './buildings/forest-windmill.js';

export { tieredPagoda, DEFAULTS as PAGODA_DEFAULTS } from './buildings/tiered-pagoda.js';
export type { PagodaParams } from './buildings/tiered-pagoda.js';

// The first landscape object type (ADR-0218). A stone is its own factory module (ADR-0217 D1);
// `bakeStone` + `STONE_DEF_ID` are the build-time asset the shared scene composes.
export {
  standingStone,
  bakeStone,
  STONE_DEF_ID,
  DEFAULTS as STANDING_STONE_DEFAULTS,
} from './landscape/standing-stone.js';
export type { StandingStoneParams, BakedStone } from './landscape/standing-stone.js';

// The cosy-island hero pieces (grounded-art inc 10) — the fixed garden set the concept
// island is composed from (increment 11). Each is its own factory module (ADR-0217 D1);
// `HERO_KIT` / `bakeHeroKit` are the build-time roster, baked into `kit.json` under `heroes`.
export { cottage, DEFAULTS as COTTAGE_DEFAULTS } from './buildings/cottage.js';
export type { CottageParams } from './buildings/cottage.js';
export { gazebo, DEFAULTS as GAZEBO_DEFAULTS } from './buildings/gazebo.js';
export type { GazeboParams } from './buildings/gazebo.js';
export { autumnTree, expectedTreePartCount, DEFAULTS as AUTUMN_TREE_DEFAULTS } from './landscape/autumn-tree.js';
export type { AutumnTreeParams } from './landscape/autumn-tree.js';
export { steppingStone, DEFAULTS as STEPPING_STONE_DEFAULTS } from './landscape/stepping-stone.js';
export type { SteppingStoneParams } from './landscape/stepping-stone.js';
export { HERO_KIT, bakeHeroKit } from './hero-kit.js';
export type { HeroEntry, BakedHeroEntry } from './hero-kit.js';

