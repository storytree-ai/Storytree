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

/**
 * Where the sprite's registered ground socket actually LANDS on screen, read back out of the box
 * the renderer emits rather than restated from `worldAnchor`. This is the point that has to fall on
 * the land cell the object is anchored to.
 */
export function organicLayerGroundContact(layer: OrganicLayerPlacement): {
  readonly x: number;
  readonly y: number;
} {
  const box = organicLayerBox(layer);
  const projection = layer.projection ?? 1;
  return {
    x: box.x + layer.assetAnchor.x * layer.scale,
    y: box.y + layer.assetAnchor.y * layer.scale * projection,
  };
}

/**
 * The vertical reconciliation a sprite track needs to stand on the land, derived from the land's
 * ONE declared camera and the camera the track was authored at.
 *
 * `null` means the track declares no camera at all — the hand-authored 2D candidates, which were
 * never rendered through one. There is nothing to reconcile against, so they take 1 and any
 * apparent plantedness is the artist's, not the projection's.
 */
export function spriteUprightReconciliation(
  authoredCameraElevationDeg: number | null,
  landElevationDeg: number = LAND_CAMERA_ELEVATION_DEG,
): number {
  if (authoredCameraElevationDeg === null) return 1;
  return spriteUprightScale(authoredCameraElevationDeg, landElevationDeg);
}
