// canvasRegistration.ts — THE ONE CAMERA, TWO LAYERS. What the 3D land canvas must be told so that
// it and the SVG label layer resolve the same world point to the same screen pixel.
//
// WHY IT EXISTS. ADR-0530's route C is a SANDWICH: a WebGL canvas draws the land, and the existing
// SVG layer stays on top carrying nameplates, hit targets, wisps, blooms, lit lanes and the
// selection ring — which is the shape ADR-0380 D6's accessibility fence requires. The two layers
// must therefore agree about where every island is, to the pixel, and not only at rest: a label
// that drifts two pixels off its island during a drag is worse than the flat map, because the map's
// whole job is to say which island you are looking at.
//
// ⚠⚠ THE ANSWER IS DERIVED HERE, ONCE, FROM THE SVG LAYER'S OWN CAMERA — never transcribed. The
// fault class this repo repeats most is a check that computes its expectation from a hand-copied
// duplicate of its own subject and therefore cannot fail; `crowd-layout.ts` names it in terms. So
// this module takes the studio's `Camera` — the same object `worldToScreen` projects with — and
// returns what the canvas needs. Neither layer gets a second copy of the arithmetic.
//
// ⚠⚠ AND IT REFUSES RATHER THAN APPROXIMATING, because the two layers CANNOT be registered at two
// different camera elevations and no amount of scale or pan changes that. Measured 2026-09-08 over
// the studio's real 35-island scene, comparing the screen separation of the first and last island
// in each layer:
//
//     SVG drawing separation   dx -220.0   dy  -914.0
//     canvas delivered sep     du -220.0   dv -2047.1
//     ratio                     x  1.0000   y   2.2398
//     closed form  sin(RENDER_ELEV_DEG) / sin(LAND_CAMERA_ELEVATION_DEG) = sin 50° / sin 20°
//                = 2.2398
//
// The x axis agrees EXACTLY and the y axis is out by exactly the ratio of the two cameras' ground
// foreshortening. That is anisotropic, so there is no uniform scale that removes it — see
// {@link registrationCamera}'s derivation. Today the studio's map draws at
// `LAND_CAMERA_ELEVATION_DEG` (20°, ADR-0367 D1) and the approved land renders are taken at
// `RENDER_ELEV_DEG` (50°, ADR-0517 D2), so a sandwich built today would be out of register by that
// factor on the depth axis. Which elevation the two SHARE is not this module's decision.
//
// WHAT THIS MODULE IS NOT. It does not mount anything, does not choose an elevation, and draws no
// conclusion about whether route C is achievable — it states the condition and computes the camera
// when the condition holds. A caller that wants the land under the labels asks it and finds out.

import type { Camera } from './worldCamera.js';

/** A pixel on the frame, CSS px from its top-left — what BOTH layers must agree on, which is the
 *  whole subject here. Named rather than returned anonymously so the two projections below have one
 *  contract between them rather than two structurally-identical anonymous ones. */
export interface ScreenPx {
  x: number;
  y: number;
}

/** A point on the GROUND plane, world units — the canvas's own coordinate space. */
export interface GroundPoint {
  x: number;
  z: number;
}

/** A viewport in CSS px — the frame both layers are delivered into. */
export interface RegistrationFrame {
  readonly width: number;
  readonly height: number;
}

/** The two elevations that have to agree, in degrees above the ground plane. Named separately
 *  rather than assumed equal, because the whole point is that today they are not. */
export interface RegistrationCameras {
  /** The camera the SVG layer's own world coordinates are already projected at. */
  readonly mapElevationDeg: number;
  /** The camera the 3D canvas looks from. */
  readonly canvasElevationDeg: number;
}

/** What the orthographic canvas must be set to. `zoom` is R3F's own — delivered CSS px per world
 *  unit, one number for the whole frame, which is the substance of ADR-0380 D6's fence 4. */
export interface RegistrationCamera {
  readonly zoom: number;
  /** The MapControls target, in the canvas's own GROUND coordinates. `y` is 0: the target is a
   *  point on the ground plane. */
  readonly target: { readonly x: number; readonly y: number; readonly z: number };
}

/** Why a registration could not be computed — never a silent approximation. */
export interface RegistrationRefusal {
  readonly ok: false;
  readonly reason: string;
  /** How far apart the two layers' DEPTH scales are, as a ratio. 1 would be agreement. */
  readonly depthScaleRatio: number;
}

export interface RegistrationOk {
  readonly ok: true;
  readonly camera: RegistrationCamera;
}

export type RegistrationResult = RegistrationOk | RegistrationRefusal;

const RAD = Math.PI / 180;

/**
 * THE CANVAS CAMERA THAT REGISTERS WITH `svg`, or a refusal naming why it cannot.
 *
 * THE DERIVATION, written out because a reader must be able to disagree with it rather than
 * reverse-engineer it. The SVG layer puts a drawing point `(wx, wy)` at
 * `(tx + s·wx, ty + s·wy)`. The canvas is orthographic with its azimuth fixed, so its right axis is
 * world +x and its up axis is `(0, cos e, −sin e)`; a ground point `(gx, 0, gz)` therefore lands at
 *
 *     screen x = W/2 + Z·(gx − Tx)
 *     screen y = H/2 + Z·sin(e)·(gz − Tz)
 *
 * and the drawing and the ground are the same world seen at the map's own camera, so `gx = wx` and
 * `gz = wy / sin(mapElevation)`. Substituting and matching the two layers term by term:
 *
 *     x:  Z = s                     and   Tx = (W/2 − tx) / s
 *     y:  Z·sin(e)/sin(map) = s     and   Tz = (H/2 − ty) / (s·sin(e))
 *
 * The x row fixes `Z = s`. The y row then requires `sin(e) = sin(map)` — with both elevations in
 * (0°, 90°], `e = map`. **That is the whole condition, and it is why this function can refuse:
 * every other term has a solution and this one has none.**
 *
 * ⚠ IT TAKES THE SVG CAMERA WHOLE. During a gesture the studio freezes the SVG's own
 * `<g class="world-camera">` and delivers the difference on a CSS transform
 * (`worldCameraFrameDelivery.ts`, ADR-0272 D2). A canvas mounted INSIDE that same wrapper inherits
 * the identical transform, so passing the FROZEN BASE here keeps both layers registered through the
 * whole drag with neither re-rendering — and passing the DESIRED camera registers them at commit.
 * Both are correct; they are the same function asked about different cameras.
 */
export function registrationCamera(
  svg: Camera,
  frame: RegistrationFrame,
  cameras: RegistrationCameras,
): RegistrationResult {
  const map = Math.sin(cameras.mapElevationDeg * RAD);
  const canvas = Math.sin(cameras.canvasElevationDeg * RAD);
  const depthScaleRatio = map === 0 ? Infinity : canvas / map;
  if (!(map > 0) || !(canvas > 0)) {
    return {
      ok: false,
      depthScaleRatio,
      reason:
        `an elevation of ${cameras.mapElevationDeg}° / ${cameras.canvasElevationDeg}° flattens the ` +
        'ground plane to a line, so there is no depth scale to match',
    };
  }
  if (Math.abs(depthScaleRatio - 1) > 1e-12) {
    return {
      ok: false,
      depthScaleRatio,
      reason:
        `the layers are drawn at ${cameras.mapElevationDeg}° and ${cameras.canvasElevationDeg}°, so ` +
        `the canvas delivers ${depthScaleRatio.toFixed(4)}x the depth the SVG layer does for the same ` +
        'ground. The x axis agrees exactly and the depth axis does not, and an anisotropic ' +
        'disagreement cannot be removed by any uniform scale, pan or zoom — the two must share one ' +
        'elevation before they can share a screen.',
    };
  }
  if (!(svg.scale > 0) || !(frame.width > 0) || !(frame.height > 0)) {
    return {
      ok: false,
      depthScaleRatio,
      reason: 'a camera with no scale, or a frame with no size, projects nothing to register against',
    };
  }
  return {
    ok: true,
    camera: {
      zoom: svg.scale,
      target: {
        x: (frame.width / 2 - svg.tx) / svg.scale,
        y: 0,
        z: (frame.height / 2 - svg.ty) / (svg.scale * canvas),
      },
    },
  };
}

/**
 * WHERE THE CANVAS PUTS A GROUND POINT, in CSS px from the frame's top-left — the canvas's half of
 * the comparison, so a test can put the two layers' answers side by side rather than trusting that
 * the derivation above was applied.
 *
 * ⚠ IT IS DELIBERATELY NOT THE INVERSE OF {@link registrationCamera}. That function solves for a
 * camera; this one projects through whatever camera it is handed. A test that used one to check the
 * other would be checking an algebraic rearrangement of itself.
 */
export function canvasScreenOf(
  camera: RegistrationCamera,
  frame: RegistrationFrame,
  ground: GroundPoint,
  canvasElevationDeg: number,
): ScreenPx {
  const sinE = Math.sin(canvasElevationDeg * RAD);
  return {
    x: frame.width / 2 + camera.zoom * (ground.x - camera.target.x),
    y: frame.height / 2 + camera.zoom * sinE * (ground.z - camera.target.z),
  };
}

/**
 * THE GROUND POINT A DRAWING POINT IS, at the camera the drawing was made at — the one conversion
 * between the two layers' coordinate spaces, so neither side spells it twice.
 *
 * `x` is untouched by the projection; the drawing's `y` is the ground's depth foreshortened by
 * `sin(mapElevation)`, which is `groundFlattening`'s own definition (ADR-0367 D1).
 */
export function groundOfDrawing(
  drawing: ScreenPx,
  mapElevationDeg: number,
): GroundPoint {
  return { x: drawing.x, z: drawing.y / Math.sin(mapElevationDeg * RAD) };
}
