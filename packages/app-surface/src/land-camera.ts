/**
 * Where an object sprite STANDS on the land — the object half of the land's declared camera
 * (ADR-0367 D1).
 *
 * The land's camera lives in `@storytree/forest-world` (`LAND_CAMERA_ELEVATION_DEG`) because the
 * land's coordinate mapping is the thing that has to read it first. This module is the other side
 * of that one value: it says what camera a sprite track was AUTHORED at, and what — if anything — a
 * sprite therefore needs in order to sit on ground drawn at the land's camera.
 *
 * The answer, at the value the land now declares, is NOTHING: the hero-tree track is authored at
 * exactly the land's elevation, so its reconciliation is 1. That is the point of the shared value,
 * and it is what retires the round-3 lab's vertical squash dial as the reconciliation MECHANISM —
 * the dial stays as a comparison control, but it is no longer the thing making trees look planted.
 *
 * {@link organicLayerBox} is the SHIPPED placement rule, extracted here so `SceneView` and the
 * composition test read the SAME function. A test that re-implemented the arithmetic could not
 * falsify the renderer, only agree with itself.
 */
import { LAND_CAMERA_ELEVATION_DEG, spriteUprightScale } from '@storytree/forest-world';

/** The subset of an organic pose layer the placement rule reads. */
export interface OrganicLayerPlacement {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly assetAnchor: { readonly x: number; readonly y: number };
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly scale: number;
  readonly projection?: number;
}

export interface OrganicLayerBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The rendered box for one organic pose layer, anchored AT its registered ground socket: the
 * anchor's own offset is scaled by the same factor as the box, so `worldAnchor` is an exact fixed
 * point of the vertical transform and the root contact never moves as the factor changes.
 */
export function organicLayerBox(layer: OrganicLayerPlacement): OrganicLayerBox {
  const projection = layer.projection ?? 1;
  return {
    x: layer.worldAnchor.x - layer.assetAnchor.x * layer.scale,
    y: layer.worldAnchor.y - layer.assetAnchor.y * layer.scale * projection,
    width: layer.canvas.width * layer.scale,
    height: layer.canvas.height * layer.scale * projection,
  };
}

export interface OrganicLayerGroundContactResult {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the sprite's registered ground socket actually LANDS on screen, read back out of the box
 * the renderer emits rather than restated from `worldAnchor`. This is the point that has to fall on
 * the land cell the object is anchored to.
 */
export function organicLayerGroundContact(layer: OrganicLayerPlacement): OrganicLayerGroundContactResult {
  const box = organicLayerBox(layer);
  const projection = layer.projection ?? 1;
  return {
    x: box.x + layer.assetAnchor.x * layer.scale,
    y: box.y + layer.assetAnchor.y * layer.scale * projection,
  };
}

/**
 * The vertical reconciliation a sprite track needs to stand on the land, derived from the land's
 * ONE declared camera and the camera the track's frames were RENDERED at.
 *
 * `null` means the track declares no camera at all — the hand-authored 2D candidates, which were
 * never rendered through one. There is nothing to reconcile against, so they take 1 and any
 * apparent plantedness is the artist's, not the projection's.
 */
export function spriteUprightReconciliation(
  renderedCameraElevationDeg: number | null,
  landElevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): number {
  if (renderedCameraElevationDeg === null) return 1;
  return spriteUprightScale(renderedCameraElevationDeg, landElevationDeg);
}

/**
 * Two declared angles are the SAME camera. An exact comparison up to float representation: a
 * camera difference of 1e-9 degrees is not a difference, and anything a reader would call a
 * different angle is orders of magnitude larger than this.
 */
const SAME_CAMERA_EPSILON_DEG = 1e-9;

/**
 * IS THIS TRACK'S SHIPPED PIXELS STILL RENDERED AT THE LAND'S DECLARED CAMERA?
 *
 * THE HOLE THIS CLOSES. Until this existed, the `code-blender` registration declared its camera
 * AS `LAND_CAMERA_ELEVATION_DEG` — the land's own binding rather than a record of the render. So
 * the two sides could never be observed to disagree: bumping the constant moved the registration
 * with it, the app went on claiming the sprite was authored at the new angle, and the committed
 * PNG frames were still the old one. Every existing assertion kept passing, because both sides
 * read the same binding and nothing compared the binding to the pixels. The lie was silent and
 * the gate could not see it.
 *
 * So the registration now RECORDS the angle its frames were actually rendered at, as a literal
 * transcribed from the generator's own `camera_elevation_deg` metadata, and this is the
 * comparison. `false` means the shipped frames are STALE: the land is drawn at one camera and the
 * sprites standing on it were rendered at another, which is precisely the mismatch ADR-0367 D1
 * exists to end, only now wearing the constant's authority.
 *
 * `null` (a hand-authored 2D track, never rendered through a camera) is never stale — there is no
 * render to have gone out of date.
 *
 * The runtime counterpart is {@link spriteUprightReconciliation}, which returns something other
 * than 1 in exactly this case. That number is a WARNING a human might not read; this is the
 * build-time refusal, asserted over the real registry in `land-camera-composition.test.ts` so a
 * constant bump without a re-render is a RED rather than a lie.
 */
export function spriteRenderMatchesLandCamera(
  renderedCameraElevationDeg: number | null,
  landElevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): boolean {
  if (renderedCameraElevationDeg === null) return true;
  return Math.abs(renderedCameraElevationDeg - landElevationDeg) <= SAME_CAMERA_EPSILON_DEG;
}

/**
 * {@link spriteRenderMatchesLandCamera} as a refusal, naming what has to happen to clear it.
 *
 * The message states the re-render rather than the mismatch alone, because the mismatch is not
 * fixable from the app side at all: a sprite's own ground footprint was baked at the angle it was
 * rendered at, so no vertical dial can reconcile it (see {@link spriteUprightReconciliation}).
 * The only honest resolutions are to re-render the track or to put the constant back.
 */
export function assertSpriteRenderMatchesLandCamera(
  trackId: string,
  renderedCameraElevationDeg: number | null,
  landElevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): void {
  if (spriteRenderMatchesLandCamera(renderedCameraElevationDeg, landElevationDeg)) return;
  throw new Error(
    `STALE SPRITE RENDER: track "${trackId}" ships frames rendered at ` +
      `${renderedCameraElevationDeg} deg, but the land is declared at ${landElevationDeg} deg ` +
      `(LAND_CAMERA_ELEVATION_DEG). The committed pixels bake their own camera, so this cannot ` +
      `be reconciled by scaling — the sprite's ground footprint is wrong, not just its height. ` +
      `Either re-render the track at ${landElevationDeg} deg and re-record its elevation, or ` +
      `restore the constant. Re-render: blender --background --python blender_tree.py -- ` +
      `--elev ${landElevationDeg} --out raw --frames 19 --res 384 --samples 72 ` +
      `--shadow-samples 32 (docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1), ` +
      `then pixelise.py raw frames 128 and re-run register_track.py.`,
  );
}
