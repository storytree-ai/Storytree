import type { Camera } from './worldCamera.js';

export interface WorldCameraCompositorDelta {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

export interface WorldCameraFrameDelivery {
  /** Camera committed on the SVG root. It remains referentially stable across equal pictures. */
  readonly svgCamera: Camera;
  /** CSS transform applied outside the SVG, after the SVG camera has projected world points. */
  readonly compositor: WorldCameraCompositorDelta;
  readonly transformOrigin: '0 0';
  readonly visualIdentity: readonly unknown[];
}

const IDENTITY_COMPOSITOR: WorldCameraCompositorDelta = { tx: 0, ty: 0, scale: 1 };

/** Complete picture identity equality: fixed arity and Object.is at every render input seat. */
export function sameWorldCameraVisualIdentity(
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * Split one exact desired camera between a retained SVG base and its surrounding compositor.
 *
 * A rendered-picture change folds the desired camera into SVG and resets the wrapper. While every
 * complete visual input is identical, the SVG base stays frozen and only the wrapper changes. If
 * `b` is the retained base and `d` the desired camera, applying the wrapper after SVG projection is:
 *
 *   k = d.scale / b.scale
 *   dx = d.tx - k * b.tx
 *   dy = d.ty - k * b.ty
 *
 * Thus `dx + k * (b.tx + b.scale * worldX) === d.tx + d.scale * worldX` (and likewise Y).
 * No clock or interpolation lives here: callers deliver the existing cursor's exact desired value.
 */
export function deliverWorldCameraFrame(
  previous: WorldCameraFrameDelivery | null,
  desired: Camera,
  visualIdentity: readonly unknown[],
): WorldCameraFrameDelivery {
  if (!previous || !sameWorldCameraVisualIdentity(previous.visualIdentity, visualIdentity)) {
    return {
      svgCamera: desired,
      compositor: IDENTITY_COMPOSITOR,
      transformOrigin: '0 0',
      visualIdentity,
    };
  }

  const base = previous.svgCamera;
  const scale = desired.scale / base.scale;
  return {
    svgCamera: base,
    compositor: {
      scale,
      tx: desired.tx - scale * base.tx,
      ty: desired.ty - scale * base.ty,
    },
    transformOrigin: '0 0',
    visualIdentity,
  };
}

export function cameraCompositorTransform(delivery: WorldCameraFrameDelivery): string {
  const { tx, ty, scale } = delivery.compositor;
  return tx === 0 && ty === 0 && scale === 1
    ? 'none'
    : `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
}

export interface ProjectDeliveredWorldPointResult { x: number; y: number }

/** Test/proof seam for the composed transform, kept pure and DOM-independent. */
export function projectDeliveredWorldPoint(
  delivery: WorldCameraFrameDelivery,
  worldX: number,
  worldY: number,
): ProjectDeliveredWorldPointResult {
  const { svgCamera: base, compositor } = delivery;
  return {
    x: compositor.tx + compositor.scale * (base.tx + base.scale * worldX),
    y: compositor.ty + compositor.scale * (base.ty + base.scale * worldY),
  };
}
