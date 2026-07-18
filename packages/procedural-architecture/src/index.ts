// The procedural-architecture organism — buildings grown from declared structural
// relations rather than typed coordinates.
//
// Three layers, each ignorant of the next:
//   procedural-utils  the pure core — vectors, shapes, the builder, the projection
//   invariants        the physics gate: check(model) -> Violation[]
//   render-svg        the ONE file that knows what SVG is
//
// A building module (./buildings/*) composes the first and is judged by the second.
// Swapping the renderer for a three.js backend replaces render-svg and nothing else.

export * from './procedural-utils.js';
export * from './invariants.js';
export * from './render-svg.js';

// Both buildings name their parameter block `DEFAULTS`; the barrel disambiguates
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
