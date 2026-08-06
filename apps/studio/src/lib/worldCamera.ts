// Pixel-space pan/zoom camera for the forest map (owner UX feedback: the map
// pans + zooms instead of scrolling). The SVG carries NO viewBox, so 1 SVG
// user-unit == 1 CSS pixel; the camera transforms world-unit content into that
// pixel space via `<g transform="translate(tx ty) scale(scale)">`. A world
// point (wx,wy) lands on screen at (tx + scale*wx, ty + scale*wy). Keeping the
// math here pure (no DOM) lets the geometry be proven red-green in isolation;
// TreeView.tsx owns the DOM wiring (wheel/drag/keys) on top of these functions.

export interface Camera {
  tx: number;
  ty: number;
  scale: number;
}

export interface ScaleLimits {
  min: number;
  max: number;
}

export interface CameraFrame {
  readonly width: number;
  readonly height: number;
}

/**
 * The deliberately small Act 2 opening reveal. It is a product parameter rather than a hidden
 * animation state: the operator-attested leg judges this amount and the cursor projection below.
 */
export const ACT2_REGROW_OPENING_SCALE = 2.25;

/**
 * Project the existing Act 2 regrow cursor onto one fixed camera framing.
 *
 * The world point under the fitted viewport's BOTTOM-CENTRE pixel — the forest's bottom growth
 * origin — stays fixed for the whole pull-back; only scale changes. There is no tracker, tween,
 * clock or retained camera progress here. Returning the fitted value at the settled boundary is
 * explicit so cursor 1 is exact identity, not merely close after floating-point interpolation.
 * Reduced motion takes that same identity path for every sample.
 */
export function act2RegrowCamera(
  fitted: Camera,
  frame: CameraFrame,
  cursor: number,
  reducedMotion = false,
): Camera {
  const progress = Number.isFinite(cursor) ? Math.max(0, Math.min(1, cursor)) : 0;
  if (reducedMotion || progress === 1 || frame.width <= 0 || frame.height <= 0) return { ...fitted };

  const anchor = screenToWorld(fitted, frame.width / 2, frame.height);
  const scale = fitted.scale * (1 + (ACT2_REGROW_OPENING_SCALE - 1) * (1 - progress));
  return {
    scale,
    tx: frame.width / 2 - scale * anchor.x,
    ty: frame.height - scale * anchor.y,
  };
}

/** Clamp a scale into [min, max]. */
export function clampScale(scale: number, limits: ScaleLimits): number {
  return Math.min(limits.max, Math.max(limits.min, scale));
}

/** World point → screen pixel under the camera. */
export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: cam.tx + cam.scale * wx, y: cam.ty + cam.scale * wy };
}

/** Screen pixel → world point (the inverse of worldToScreen). */
export function screenToWorld(cam: Camera, px: number, py: number): { x: number; y: number } {
  return { x: (px - cam.tx) / cam.scale, y: (py - cam.ty) / cam.scale };
}

/** Translate the camera by a pixel delta (scale unchanged). */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { scale: cam.scale, tx: cam.tx + dx, ty: cam.ty + dy };
}

/**
 * Zoom by `factor` about the screen pixel (px,py), keeping the world point
 * currently under that pixel fixed (zoom-to-cursor). The new scale is clamped
 * to `limits`, and the cursor invariant holds AFTER clamping (k is derived from
 * the clamped scale, not the requested one).
 */
export function zoomAt(
  cam: Camera,
  px: number,
  py: number,
  factor: number,
  limits: ScaleLimits,
): Camera {
  const next = clampScale(cam.scale * factor, limits);
  const k = next / cam.scale;
  return { scale: next, tx: px - (px - cam.tx) * k, ty: py - (py - cam.ty) * k };
}

/**
 * Frame so the world point (wx,wy) sits at the centre of a frameW×frameH
 * viewport, at the given scale (clamped to limits).
 */
export function centerOn(
  wx: number,
  wy: number,
  frameW: number,
  frameH: number,
  scale: number,
  limits: ScaleLimits,
): Camera {
  const s = clampScale(scale, limits);
  return { scale: s, tx: frameW / 2 - s * wx, ty: frameH / 2 - s * wy };
}

export interface FitOpts {
  padding?: number;
  maxScale?: number;
  align?: 'bottom' | 'center';
  /** 'width' (default) fits the world to the frame WIDTH (a tall forest overflows vertically and is
   *  panned through); 'contain' fits the WHOLE world inside the frame (the smaller of the width/height
   *  fit), so a portrait forest shows in full on a large/maximized window. */
  fit?: 'width' | 'contain';
}

/**
 * Fit the world to the frame. `fit` (default 'width') fits to the frame WIDTH — the forest reads as a
 * tall portrait column that overflows vertically and is panned through; 'contain' fits the WHOLE world
 * inside the frame (the smaller of the width/height fit), so a portrait forest shows IN FULL on a
 * large/maximized window. Horizontally centred. `align` pins the vertical: 'bottom' (default) lands the
 * world's bottom near the frame bottom — the foundation, where the world reads from; 'center' centres
 * it. A non-positive dimension yields a safe identity-ish camera rather than NaN.
 */
export function fitWorld(
  worldW: number,
  worldH: number,
  frameW: number,
  frameH: number,
  opts?: FitOpts,
): Camera {
  const pad = opts?.padding ?? 0;
  if (worldW <= 0 || worldH <= 0 || frameW <= 0 || frameH <= 0) {
    return { tx: 0, ty: 0, scale: opts?.maxScale ?? 1 };
  }
  const widthScale = (frameW - 2 * pad) / worldW;
  let scale =
    opts?.fit === 'contain' ? Math.min(widthScale, (frameH - 2 * pad) / worldH) : widthScale;
  if (opts?.maxScale !== undefined) scale = Math.min(scale, opts.maxScale);
  const tx = (frameW - worldW * scale) / 2;
  const ty =
    (opts?.align ?? 'bottom') === 'bottom'
      ? frameH - pad - worldH * scale
      : (frameH - worldH * scale) / 2;
  return { tx, ty, scale };
}

/** Zoom range derived from the fit scale, so it adapts to world size. */
export function limitsForFit(fitScale: number): ScaleLimits {
  return { min: fitScale * 0.4, max: fitScale * 5 };
}
