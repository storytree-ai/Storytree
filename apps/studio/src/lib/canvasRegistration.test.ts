// canvasRegistration.test.ts — do the two map layers resolve the same world point to the same
// screen pixel?
//
// ⚠ THE COMPARISON IS BETWEEN TWO REAL PROJECTIONS, not between a projection and a rearrangement of
// itself. The SVG side is `worldToScreen` — the studio's own shipped function, imported, never
// transcribed — and the canvas side is `canvasScreenOf`, which projects through whatever camera it
// is handed rather than inverting the solver. A check that computed its expectation from a copy of
// its own subject could not fail, and that is this repo's most-repeated fault class.
//
// ⚠ THE GESTURE IS EXERCISED THROUGH THE SHIPPED SPLIT, not simulated. `deliverWorldCameraFrame` is
// what actually runs during a drag: the SVG's own `<g>` freezes and the difference is delivered as
// a CSS transform on the wrapper (ADR-0272 D2). A canvas inside that wrapper inherits the identical
// transform, so what has to hold mid-drag is that the FROZEN BASE registers — which is the same
// question asked about a different camera, and is asserted as such below.

import { describe, it, expect } from 'vitest';

import { LAND_CAMERA_ELEVATION_DEG, SHIPPED_ELEVATION_DEG } from './canvasRegistration.constants.js';

import {
  canvasScreenOf,
  groundOfDrawing,
  registrationCamera,
  type RegistrationFrame,
} from './canvasRegistration.js';
import { worldToScreen, zoomAt, type Camera } from './worldCamera.js';
import { deliverWorldCameraFrame } from './worldCameraFrameDelivery.js';

const FRAME: RegistrationFrame = { width: 1600, height: 900 };

/** Drawing-space points spread across a forest the shape of the real one (661 x 3524 projected). */
const DRAWING_POINTS = [
  { x: 63, y: 140 },
  { x: 400, y: 900 },
  { x: 724, y: 2200 },
  { x: 200, y: 3664 },
  { x: -50, y: -20 },
];

/** Both layers' answers for one drawing point, at one shared elevation. */
function bothLayers(svg: Camera, elevationDeg: number, point: { x: number; y: number }) {
  const solved = registrationCamera(svg, FRAME, {
    mapElevationDeg: elevationDeg,
    canvasElevationDeg: elevationDeg,
  });
  if (!solved.ok) throw new Error(`expected a registration: ${solved.reason}`);
  return {
    svg: worldToScreen(svg, point.x, point.y),
    canvas: canvasScreenOf(solved.camera, FRAME, groundOfDrawing(point, elevationDeg), elevationDeg),
    zoom: solved.camera.zoom,
  };
}

describe('the canvas and the labels stay registered', () => {
  it('resolves the same world point to the same screen pixel AT REST', () => {
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    for (const point of DRAWING_POINTS) {
      const { svg: a, canvas: b } = bothLayers(svg, LAND_CAMERA_ELEVATION_DEG, point);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
  });

  it('stays registered MID-ZOOM, at every scale the map reaches', () => {
    // Zoom is where a wrong `zoom = scale` would show: the two layers would drift apart
    // proportionally, so a fixture at one scale cannot see it.
    let svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    for (let step = 0; step < 6; step += 1) {
      svg = zoomAt(svg, 1.4, 800, 450, { min: 0.05, max: 20 });
      for (const point of DRAWING_POINTS) {
        const { svg: a, canvas: b } = bothLayers(svg, LAND_CAMERA_ELEVATION_DEG, point);
        expect(b.x).toBeCloseTo(a.x, 8);
        expect(b.y).toBeCloseTo(a.y, 8);
      }
    }
    expect(svg.scale).toBeGreaterThan(3);
  });

  it('stays registered MID-DRAG — through the shipped frozen-base / compositor split', () => {
    // ⚠ THIS IS THE ONE THAT MATTERS AND THE ONE A NAIVE TEST GETS WRONG. During a gesture the SVG
    // layer is NOT re-projected: `deliverWorldCameraFrame` keeps the base frozen and puts the whole
    // difference on a CSS transform. A canvas inside the same wrapper inherits that transform
    // exactly, so registration mid-drag is registration of the FROZEN BASE — the compositor cannot
    // separate them because it moves both by construction.
    const identity = ['world', 'layers'] as const;
    const base: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    let delivery = deliverWorldCameraFrame(null, base, identity);
    expect(delivery.svgCamera).toBe(base);

    for (const [dx, dy] of [[-40, 15], [-180, 90], [320, -260]] as const) {
      const desired: Camera = { tx: base.tx + dx, ty: base.ty + dy, scale: base.scale };
      delivery = deliverWorldCameraFrame(delivery, desired, identity);
      // The SVG base really is frozen — otherwise this test is about a drag that does not happen.
      expect(delivery.svgCamera).toBe(base);
      expect(delivery.compositor.tx).toBeCloseTo(dx, 9);
      expect(delivery.compositor.ty).toBeCloseTo(dy, 9);
      expect(delivery.compositor.scale).toBeCloseTo(1, 12);

      // Both layers are drawn at the frozen base, and the wrapper adds the same delta to each.
      for (const point of DRAWING_POINTS) {
        const { svg: a, canvas: b } = bothLayers(delivery.svgCamera, LAND_CAMERA_ELEVATION_DEG, point);
        const composited = (p: { x: number; y: number }) => ({
          x: delivery.compositor.tx + delivery.compositor.scale * p.x,
          y: delivery.compositor.ty + delivery.compositor.scale * p.y,
        });
        const svgLive = composited(a);
        const canvasLive = composited(b);
        expect(canvasLive.x).toBeCloseTo(svgLive.x, 9);
        expect(canvasLive.y).toBeCloseTo(svgLive.y, 9);
        // …and the composited position is the DESIRED camera's own answer, which is the identity
        // `worldCameraFrameDelivery` exists to guarantee — restated here because a drag that
        // registered two layers at the WRONG place would satisfy every assertion above.
        const want = worldToScreen(desired, point.x, point.y);
        expect(svgLive.x).toBeCloseTo(want.x, 9);
        expect(svgLive.y).toBeCloseTo(want.y, 9);
      }
    }
  });

  it('stays registered AT GESTURE COMMIT, when the base folds to the desired camera', () => {
    const identity = ['world', 'layers'] as const;
    const base: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const committed: Camera = { tx: -92.5, ty: -126.75, scale: 0.6528 };
    // A commit is a CHANGED picture, so the delivery resets: the base takes the whole camera and
    // the compositor returns to identity. Both layers re-project together.
    const after = deliverWorldCameraFrame(
      deliverWorldCameraFrame(null, base, identity),
      committed,
      ['world', 'moved'],
    );
    expect(after.svgCamera).toBe(committed);
    expect(after.compositor).toEqual({ tx: 0, ty: 0, scale: 1 });
    for (const point of DRAWING_POINTS) {
      const { svg: a, canvas: b } = bothLayers(after.svgCamera, LAND_CAMERA_ELEVATION_DEG, point);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.y).toBeCloseTo(a.y, 9);
    }
  });

  it('drives the canvas from the SVG camera’s OWN scale, never a second number', () => {
    const svg: Camera = { tx: 11, ty: -7, scale: 1.379 };
    const { zoom } = bothLayers(svg, LAND_CAMERA_ELEVATION_DEG, DRAWING_POINTS[0]!);
    expect(zoom).toBe(svg.scale);
  });
});

describe('the condition, and it is not met today', () => {
  it('REFUSES two different elevations, because the disagreement is anisotropic', () => {
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const solved = registrationCamera(svg, FRAME, {
      mapElevationDeg: LAND_CAMERA_ELEVATION_DEG,
      canvasElevationDeg: SHIPPED_ELEVATION_DEG,
    });
    expect(solved.ok).toBe(false);
    if (solved.ok) return;
    // The measured figure, re-derived from the two constants rather than recalled: the canvas
    // delivers 2.2398x the depth the SVG layer does for the same ground.
    const want = Math.sin((SHIPPED_ELEVATION_DEG * Math.PI) / 180) / Math.sin((LAND_CAMERA_ELEVATION_DEG * Math.PI) / 180);
    expect(solved.depthScaleRatio).toBeCloseTo(want, 12);
    expect(solved.depthScaleRatio).toBeCloseTo(2.2398, 4);
    expect(solved.reason).toMatch(/anisotropic|share one\s+elevation/);
  });

  it('is a DEPTH-only disagreement — the x axis already agrees, which is why no scale fixes it', () => {
    // ⚠ THE HALF THAT MAKES THE REFUSAL NECESSARY RATHER THAN FUSSY. If BOTH axes were out by the
    // same factor, one uniform zoom would register the layers and there would be nothing to refuse.
    // They are not: x is exact and depth is out by sin(50°)/sin(20°).
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const mapCamera = registrationCamera(svg, FRAME, {
      mapElevationDeg: LAND_CAMERA_ELEVATION_DEG,
      canvasElevationDeg: LAND_CAMERA_ELEVATION_DEG,
    });
    expect(mapCamera.ok).toBe(true);
    if (!mapCamera.ok) return;

    const a = { x: 63, y: 140 };
    const b = { x: 724, y: 2200 };
    const svgSep = {
      x: worldToScreen(svg, b.x, b.y).x - worldToScreen(svg, a.x, a.y).x,
      y: worldToScreen(svg, b.x, b.y).y - worldToScreen(svg, a.x, a.y).y,
    };
    // The SAME ground, projected by a canvas looking from 50° with the map's own zoom.
    const at = (p: { x: number; y: number }) =>
      canvasScreenOf(mapCamera.camera, FRAME, groundOfDrawing(p, LAND_CAMERA_ELEVATION_DEG), SHIPPED_ELEVATION_DEG);
    const canvasSep = { x: at(b).x - at(a).x, y: at(b).y - at(a).y };

    expect(canvasSep.x / svgSep.x).toBeCloseTo(1, 12);
    expect(canvasSep.y / svgSep.y).toBeCloseTo(2.2398, 4);
  });

  it('refuses an edge-on camera for the RIGHT reason — a flattened ground, not a mismatch', () => {
    // ⚠ EVERY REFUSAL HERE ALSO REFUSES FOR THE OTHER REASON, so `ok === false` acquits all of them
    // and proves nothing about which guard ran. `check:mutation-diff` scored eight survivors on
    // exactly that: the edge-on guard could be deleted outright and every `.ok` assertion still
    // passed, because the mismatch check refuses an infinite ratio too. What a caller ACTS on is the
    // sentence, so the sentence is what is asserted.
    const svg: Camera = { tx: 0, ty: 0, scale: 1 };
    for (const cameras of [
      // The MAP edge-on: its own depth scale is zero, so the ratio is reported as infinite rather
      // than divided by. `0 / 0` (both flat) is the case that would otherwise answer `NaN`.
      { mapElevationDeg: 0, canvasElevationDeg: 0, ratio: Infinity },
      { mapElevationDeg: 0, canvasElevationDeg: 20, ratio: Infinity },
      // The CANVAS edge-on: an ordinary division, and the answer is honestly zero.
      { mapElevationDeg: 20, canvasElevationDeg: 0, ratio: 0 },
    ]) {
      const solved = registrationCamera(svg, FRAME, cameras);
      expect(solved.ok).toBe(false);
      if (solved.ok) continue;
      expect(solved.reason).toContain('flattens the ground plane to a line');
      expect(solved.reason).toContain('no depth scale to match');
      expect(solved.reason).toContain(`${cameras.mapElevationDeg}°`);
      // …and NOT the mismatch sentence, which is the other branch and would be a different remedy.
      expect(solved.reason).not.toContain('must share one elevation');
      // ⚠ AND THE REPORTED RATIO IS INFINITE, NEVER `NaN`. With the map edge-on the plain division
      // is `0 / 0` for a both-flat pair, and `NaN` compares false against everything — so a caller
      // guarding on `ratio > 1.01` would be satisfied by the most broken input there is. A refusal's
      // number has to fail every comparison a reader makes.
      expect(solved.depthScaleRatio).toBe(cameras.ratio);
      expect(Number.isNaN(solved.depthScaleRatio)).toBe(false);
    }
  });

  it('names the MISMATCH in terms a reader can act on, including the ratio and both angles', () => {
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const solved = registrationCamera(svg, FRAME, {
      mapElevationDeg: LAND_CAMERA_ELEVATION_DEG,
      canvasElevationDeg: SHIPPED_ELEVATION_DEG,
    });
    expect(solved.ok).toBe(false);
    if (solved.ok) return;
    expect(solved.reason).toContain(`${LAND_CAMERA_ELEVATION_DEG}°`);
    expect(solved.reason).toContain(`${SHIPPED_ELEVATION_DEG}°`);
    expect(solved.reason).toContain('2.2398x the depth');
    expect(solved.reason).toContain('The x axis agrees exactly and the depth axis does not');
    expect(solved.reason).toContain('cannot be removed by any uniform scale, pan or zoom');
    expect(solved.reason).toContain('must share one elevation before they can share a screen');
    expect(solved.reason).not.toContain('flattens the ground plane');
  });

  it('refuses a NEAR MISS instead of absorbing it in a tolerance', () => {
    // ⚠ A factor of 1.0000000017 reads like agreement and is not: the requirement is registration to
    // the pixel across a forest thousands of units deep, so a near-1 ratio still walks the labels off
    // their islands at the far end. Asserting the near miss is also what makes the exactness a
    // DECISION rather than an accident nobody would notice if a tolerance crept back in.
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const solved = registrationCamera(svg, FRAME, {
      mapElevationDeg: 20,
      canvasElevationDeg: 20.0000001,
    });
    expect(solved.ok).toBe(false);
    if (solved.ok) return;
    expect(solved.depthScaleRatio).toBeCloseTo(1, 8);
    expect(solved.depthScaleRatio).not.toBe(1);
    expect(solved.reason).toContain('must share one elevation before they can share a screen');
  });

  it('registers the same elevation with itself, so the refusal above is about the MISS', () => {
    const svg: Camera = { tx: -412.5, ty: 133.25, scale: 0.6528 };
    const solved = registrationCamera(svg, FRAME, { mapElevationDeg: 20, canvasElevationDeg: 20 });
    expect(solved.ok).toBe(true);
  });

  it('refuses a camera or a frame with no size, and says which', () => {
    const cameras = { mapElevationDeg: 20, canvasElevationDeg: 20 };
    for (const [svg, frame] of [
      [{ tx: 0, ty: 0, scale: 0 }, FRAME],
      [{ tx: 0, ty: 0, scale: 1 }, { width: 0, height: 900 }],
      [{ tx: 0, ty: 0, scale: 1 }, { width: 1600, height: 0 }],
    ] as const) {
      const solved = registrationCamera(svg, frame, cameras);
      expect(solved.ok).toBe(false);
      if (solved.ok) continue;
      expect(solved.reason).toContain('projects nothing to register against');
      expect(solved.depthScaleRatio).toBeCloseTo(1, 12);
    }
  });
});
