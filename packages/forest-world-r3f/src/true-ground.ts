// true-ground.ts — A 2D DRAWING'S DESCRIPTORS, PUT BACK ON TRUE GROUND. The one-way legacy input
// adapter every caller that cannot supply a plan-view scene has to come through.
//
// WHY IT EXISTS. Since ADR-0546 D1 the 3D map stands on ground the SCENE supplies: `worldTo3D`
// lays each (x, y) it walks straight onto the ground plane and no longer un-squashes anything. A
// scene built at the declared land camera is therefore a DRAWING — every ground depth in it is
// already multiplied by `sin 20°` = 0.342 — and fed straight through it is a squashed ribbon.
// Measured on the frozen 35-island export: an island 33.1 x 38.5 through the retired repair reads
// 56.5 x 22.5 unconverted.
//
// ⚠⚠ THIS IS NOT `restoreTrueFootprint` UNDER ANOTHER NAME, AND THE DIFFERENCE IS THE WHOLE OF
// ADR-0546. The deleted repair stretched each island ABOUT ITS OWN CENTRE, which un-squashed the
// islands and deliberately held the forest's ARRANGEMENT still. This un-projects the whole stream
// ABOUT THE ORIGIN, which is what un-projecting a drawing actually means: the gaps come back with
// the islands and the forest becomes the corridor the owner accepted sight-unseen (ADR-0546 D3)
// and then looked at (ADR-0550). It is applied at the READER rather than inside the mapper, so the
// pipeline still has exactly one way of reaching the ground (ADR-0546 D5).
//
// WHO COMES THROUGH IT — TWO KINDS OF CALLER, AND THE SECOND IS WHY IT LIVES IN `src/`.
//   · FROZEN EXPORTS. Five comparison pages stand on scene graphs read off the running studio by
//     Playwright and committed under `docs/research/`. They were written before the decision and
//     cannot supply true ground. `harness/frozen-drawing.ts` re-exports this for them.
//   · THE LIVE STUDIO (2026-09-08). `apps/studio`'s LAND VIEW draws the map's own scene graph
//     through the 3D pipeline, and that scene is a drawing for the same reason: `buildWorld` packs
//     the islands so they do not overlap ON SCREEN and snaps that packing to the lattice through
//     `pixelToHex`, so the studio's tile set is legitimately a function of its camera and asking
//     `buildScene` for plan view would be asking for a DIFFERENT LAYOUT, not the same one upright.
//     Teaching the caller to hand over ground coordinates is `forest-geometry-rebuild-arc`'s item 1
//     and is not this adapter's to pre-empt.
//
// ⚠ IT IS STILL THE THING TO DELETE FIRST. When the studio's layout hands over ground coordinates,
// every caller here becomes a bare `worldTo3D` and this module goes. Until then the surfaces show
// the corridor, which is what the live pipeline draws — never the squash, which is what nobody
// decided.

import { LAND_CAMERA_ELEVATION_DEG, groundFlattening, type SceneG } from '@storytree/forest-world';

import { LAND_AREA_PER_CAPABILITY, sizeIslandsByCapability } from './land-per-capability.js';
import { scaledBearing } from './true-footprint.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from './world-to-3d.js';

/**
 * A DRAWING'S DESCRIPTORS, ON TRUE GROUND: every ground z divided by `sin(elevationDeg)` about the
 * origin, x and y untouched, and a cave's bearing turned with its rim exactly as any anisotropic
 * scale turns it (`scaledBearing`). Skipped descriptors pass through.
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
  // The two ways an elevation fails to name a scale, and they are different failures: EDGE-ON
  // (0°, or 180°) flattens the ground plane to a line, so the inverse is infinite and nothing
  // recovers the depth; BELOW THE HORIZON (a negative elevation) inverts it, which would mirror
  // the whole forest front-to-back while looking exactly like a scale.
  // Stryker disable next-line EqualityOperator: EQUIVALENT — `<= 0` and `< 0` cannot be separated
  // here. `factor` is `1 / sin θ` and `Math.sin` is finite for every finite input, so `factor` is
  // never exactly 0; the only input that could reach it is an infinite sine, which does not exist.
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`true-ground: elevation ${elevationDeg}° gives a factor of ${factor}, which is not a scale`);
  }
  return descriptors.map((d): T => {
    if (d.kind === 'skipped') return d;
    const moved: InstanceDescriptor = { ...d, transform: { ...d.transform, z: d.transform.z * factor } };
    if (d.points !== undefined) moved.points = d.points.map((p) => ({ ...p, z: p.z * factor }));
    if (d.bearing !== undefined) moved.bearing = scaledBearing(d.bearing, { x: 1, z: factor });
    return moved as T;
  });
}

/**
 * THE SHIPPED 3D STREAM FROM A 2D DRAWING — the three steps every surface that starts from a
 * declared-camera scene performs, in the ONE order that is correct, so no caller has to remember it.
 *
 * ⚠ THE ORDER IS THE SUBSTANCE, and getting it wrong produces a plausible forest rather than an
 * error. `sizeIslandsByCapability` reads each island's AREA, so sizing BEFORE the un-projection
 * measures the squash: every island's area is understated by `sin 20°` = 0.342, so every island is
 * grown to compensate and the whole forest arrives too big by the same factor. That is why the
 * mapper is asked for `landAreaPerCapability: null` — "leave every island at the size the drawing
 * gave it" — and the sizing is applied afterwards.
 *
 * The elevation is the camera the DRAWING was made at, defaulting to the land's declared one, which
 * is what every 2D surface here draws with.
 */
export function landStreamFromDrawing(scene: SceneG, elevationDeg: number = LAND_CAMERA_ELEVATION_DEG): Descriptor3D[] {
  return sizeIslandsByCapability(
    trueGroundFromDrawing(worldTo3D(scene, { landAreaPerCapability: null }), elevationDeg),
    LAND_AREA_PER_CAPABILITY,
  );
}
