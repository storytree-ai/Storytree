import test from "node:test";
import assert from "node:assert/strict";
import {
  act2RegrowCamera,
  ACT2_REGROW_OPENING_SCALE,
  fitWorld,
  screenToWorld,
  worldToScreen,
  type Camera,
  type CameraFrame,
} from "./worldCamera.js";

/**
 * `act2-regrow-camera-zoom-out` (stories/studio/act2-regrow-camera-zoom-out.md), contract
 * `act2-regrow-camera-projects-the-existing-cursor`:
 *
 * "cursor `0` is a closer opening anchored to the forest's bottom growth origin, each intermediate
 * camera monotonically expands the visible bounds upward to contain the growth envelope revealed at
 * that cursor while retaining the bottom anchor, and cursor `1` equals the ordinary fitted
 * whole-forest camera exactly."
 *
 * The current `act2RegrowCamera` anchors its opening on the world point under the FRAME'S SCREEN
 * CENTRE (`frame.width / 2, frame.height / 2`), not the forest's bottom growth origin (the world
 * point under the frame's bottom edge at the ordinary fitted camera, `frame.width / 2, frame.height`).
 * This is a regression pin against that centre-anchored behaviour: the world point that sits at the
 * frame's bottom-centre pixel under the fitted camera must stay pinned to that SAME bottom-centre
 * screen pixel for every sample of the pull-back, not just at cursor 1.
 */
test(
  "act2-regrow-camera-projects-the-existing-cursor: the opening and every intermediate sample stay anchored to the forest's bottom growth origin, not the frame centre",
  () => {
    const fitted: Camera = { tx: 120, ty: 40, scale: 0.5 };
    const frame: CameraFrame = { width: 1600, height: 1000 };

    // The forest's bottom growth origin: the world point that lands at the frame's bottom-centre
    // pixel under the ordinary fitted (settled, cursor === 1) camera.
    const bottomAnchor = screenToWorld(fitted, frame.width / 2, frame.height);

    const opening = act2RegrowCamera(fitted, frame, 0);
    const quarter = act2RegrowCamera(fitted, frame, 0.25);
    const halfway = act2RegrowCamera(fitted, frame, 0.5);

    assert.equal(opening.scale, fitted.scale * ACT2_REGROW_OPENING_SCALE);

    for (const camera of [opening, quarter, halfway]) {
      const projected = worldToScreen(camera, bottomAnchor.x, bottomAnchor.y);
      assert.equal(
        projected.x,
        frame.width / 2,
        `bottom anchor x drifted at scale ${camera.scale}: got ${projected.x}, want ${frame.width / 2}`,
      );
      assert.equal(
        projected.y,
        frame.height,
        `bottom anchor y drifted at scale ${camera.scale}: got ${projected.y}, want ${frame.height} (frame bottom)`,
      );
    }
  },
);

/**
 * `act2-regrow-camera-zoom-out`, contract `act2-regrow-camera-projects-the-existing-cursor`:
 *
 * "cursor `0` is a closer opening anchored to the forest's bottom growth origin ... while retaining
 * the bottom anchor."
 *
 * TreeView's real fitted camera is never built with zero padding — production calls
 * `fitWorld(world.width, world.height, fw, fh, { padding: 16, align: 'bottom', fit: 'contain' })`
 * (`apps/studio/src/components/TreeView.tsx`). Under that real, padded fit the world's own
 * bottom-centre point (the forest's actual growth origin, `(worldW / 2, worldH)`) projects to
 * `frame.height - padding` under the settled fitted camera, NOT to the raw `frame.height` pixel.
 * `act2RegrowCamera` computes its internal opening anchor via
 * `screenToWorld(fitted, frame.width / 2, frame.height)` — the UNPADDED frame bottom — so the point it
 * actually keeps fixed is offset from the real growth origin by `padding / fitted.scale` in world
 * units. That offset is invisible when a hand-built `fitted` (as above) stands in for a zero-padding
 * fit, but under the real padded production fit it makes the true bottom-growth-origin DRIFT on
 * screen across the pull-back instead of staying pinned, breaking "retaining the bottom anchor".
 */
test(
  "act2-regrow-camera-projects-the-existing-cursor: the forest's real bottom growth-origin world point stays pinned to its settled screen position under a production-shaped padded fit",
  () => {
    const worldW = 800;
    const worldH = 3000;
    const frame: CameraFrame = { width: 1600, height: 1000 };
    const fitted = fitWorld(worldW, worldH, frame.width, frame.height, {
      padding: 16,
      align: "bottom",
    });

    // The forest's bottom growth origin is a WORLD coordinate: the bottom-centre of the world's own
    // bounding box. It is not derived from act2RegrowCamera's internal anchor computation, so this is
    // an independent reference, not a tautology against the code under test.
    const groundWorldX = worldW / 2;
    const groundWorldY = worldH;
    const settledScreen = worldToScreen(fitted, groundWorldX, groundWorldY);

    for (const cursor of [0, 0.25, 0.5, 0.75]) {
      const camera = act2RegrowCamera(fitted, frame, cursor);
      const projected = worldToScreen(camera, groundWorldX, groundWorldY);
      assert.deepEqual(
        projected,
        settledScreen,
        `forest bottom growth origin drifted at cursor ${cursor}: got ${JSON.stringify(projected)}, want ${JSON.stringify(settledScreen)} (the settled fitted projection)`,
      );
    }
  },
);
