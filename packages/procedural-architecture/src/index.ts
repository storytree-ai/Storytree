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

