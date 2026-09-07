// frozen-drawing.ts — THE COMMITTED SCENE EXPORTS ARE 2D DRAWINGS, AND SINCE ADR-0546 THE MAPPER
// DOES NOT REPAIR ONE. This is the one-way conversion that lets them keep standing.
//
// WHY IT EXISTS. Five comparison pages — spacing, the island floor, the shadow scale, the wheat,
// the tile — stand on scene graphs read off the RUNNING studio by Playwright and committed under
// `docs/research/` (`apps/studio/scripts/export-spacing-scenes.mjs` and its tile sibling). Those
// exports are the 2D map's own drawing: every ground depth in them is already multiplied by
// `sin 20°` = 0.342, because that is what the page they were read off draws. Until 2026-09-08
// `worldTo3D` un-projected whatever it was handed, so a frozen drawing came out as an island;
// ADR-0546 D1 deleted that repair and made the 3D forest stand on ground the SCENE supplies. A
// frozen export cannot supply it — it was written before the decision — so fed straight through it
// is a squashed ribbon. Measured on the 35-island export: an island 33.1 x 38.5 through the old
// repair reads 56.5 x 22.5 unconverted.
//
// ⚠⚠ THIS IS NOT `restoreTrueFootprint` UNDER ANOTHER NAME, AND THE DIFFERENCE IS THE WHOLE OF
// ADR-0546. The deleted repair stretched each island ABOUT ITS OWN CENTRE, which un-squashed the
// islands and deliberately held the forest's ARRANGEMENT still. This un-projects the whole stream
// ABOUT THE ORIGIN, which is what un-projecting a drawing actually means: the gaps come back with
// the islands and the forest becomes the corridor the owner accepted. It is a legacy INPUT
// ADAPTER — the same move PR #1856 made for the website's frozen coast loops — not a second path
// from a drawing to a surface, and it is applied at the file reader rather than inside the mapper,
// so the pipeline still has exactly one way of reaching the ground (ADR-0546 D5).
//
// ⚠ IT IS ALSO THE THING TO DELETE FIRST. Re-export these scenes from a studio asked for a
// plan-view map and every caller here becomes a bare `worldTo3D`; nothing else in the package
// imports this file. Until then the pages show the corridor, which is what the live pipeline
// draws — never the squash, which is what nobody decided.

import { LAND_CAMERA_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';

import { scaledBearing } from '../src/true-footprint.js';
import type { Descriptor3D, InstanceDescriptor } from '../src/world-to-3d.js';

/**
 * A FROZEN DRAWING'S DESCRIPTORS, ON TRUE GROUND: every ground z divided by `sin(elevationDeg)`
 * about the origin, x and y untouched, and a cave's bearing turned with its rim exactly as any
 * anisotropic scale turns it (`scaledBearing`). Skipped descriptors pass through.
 *
 * Apply it to a stream mapped with `landAreaPerCapability: null` and size the result afterwards:
 * the land-per-capability ratio reads each island's AREA, which this changes, so sizing first
 * would measure the squash.
 */
export function trueGroundFromDrawing<T extends Descriptor3D>(
  descriptors: readonly T[],
  elevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): T[] {
  const factor = 1 / groundFlattening(elevationDeg);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`frozen-drawing: elevation ${elevationDeg}° gives a factor of ${factor}, which is not a scale`);
  }
  return descriptors.map((d): T => {
    if (d.kind === 'skipped') return d;
    const moved: InstanceDescriptor = { ...d, transform: { ...d.transform, z: d.transform.z * factor } };
    if (d.points !== undefined) moved.points = d.points.map((p) => ({ ...p, z: p.z * factor }));
    if (d.bearing !== undefined) moved.bearing = scaledBearing(d.bearing, { x: 1, z: factor });
    return moved as T;
  });
}
