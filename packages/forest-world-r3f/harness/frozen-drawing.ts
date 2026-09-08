// frozen-drawing.ts — THE COMMITTED SCENE EXPORTS ARE 2D DRAWINGS, AND SINCE ADR-0546 THE MAPPER
// DOES NOT REPAIR ONE. This file is the harness's door onto the conversion that lets them keep
// standing; the conversion itself CROSSED INTO `src/` on 2026-09-08 and lives at
// `../src/true-ground.ts`, which carries the whole argument.
//
// ⚠ IT CROSSED BECAUSE A SHIPPED SURFACE NEEDED IT, not because the harness outgrew it. The
// studio's LAND VIEW draws the map's own scene graph through the 3D pipeline, and that scene is a
// drawing for exactly the reason a committed export is. A copy here and a copy there would be two
// implementations of the same one-way adapter, which is how this package once acquired three
// disagreeing status palettes — so this is a RE-EXPORT and its twenty-odd consumers are untouched.
//
// ⚠ `src/` MODULES MAY NOT IMPORT THE HARNESS (`scope-fence.test.ts`), so the direction is forced:
// the shared thing lives in `src/` and the experiment reaches in, never the other way round.

export { trueGroundFromDrawing } from '../src/true-ground.js';
