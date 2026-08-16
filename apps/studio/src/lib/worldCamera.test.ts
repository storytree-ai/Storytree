import { describe, it, expect } from 'vitest';
import {
  clampScale,
  worldToScreen,
  screenToWorld,
  panBy,
  zoomAt,
  centerOn,
  fitWorld,
  limitsForFit,
  act2RegrowCamera,
  ACT2_REGROW_OPENING_SCALE,
  type Camera,
  type ScaleLimits,
} from './worldCamera.js';

const EPS = 1e-9;
const limits: ScaleLimits = { min: 0.5, max: 4 };

describe('clampScale', () => {
  it('clamps below min', () => {
    expect(clampScale(0.1, limits)).toBe(0.5);
  });
  it('clamps above max', () => {
    expect(clampScale(99, limits)).toBe(4);
  });
  it('passes through in-range', () => {
    expect(clampScale(2, limits)).toBe(2);
  });
});

describe('worldToScreen / screenToWorld', () => {
  const cam: Camera = { tx: 120, ty: -40, scale: 1.5 };
  it('worldToScreen applies translate + scale', () => {
    expect(worldToScreen(cam, 10, 20)).toEqual({ x: 120 + 1.5 * 10, y: -40 + 1.5 * 20 });
  });
  it('round-trips a point (inverses)', () => {
    const p = screenToWorld(cam, 333, 217);
    const back = worldToScreen(cam, p.x, p.y);
    expect(back.x).toBeCloseTo(333, 9);
    expect(back.y).toBeCloseTo(217, 9);
  });
});

describe('panBy', () => {
  it('adds the delta and leaves scale unchanged', () => {
    const cam: Camera = { tx: 5, ty: 7, scale: 2 };
    expect(panBy(cam, 3, -4)).toEqual({ tx: 8, ty: 3, scale: 2 });
  });
});

describe('zoomAt', () => {
  const cam: Camera = { tx: 30, ty: 50, scale: 2 };
  const px = 400;
  const py = 250;

  it('scales by factor when in-range', () => {
    expect(zoomAt(cam, px, py, 1.5, limits).scale).toBeCloseTo(3, 9);
  });

  it('keeps the world point under the cursor invariant', () => {
    const before = screenToWorld(cam, px, py);
    const after = screenToWorld(zoomAt(cam, px, py, 1.5, limits), px, py);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps at max and STILL keeps the cursor world-point invariant', () => {
    const z = zoomAt(cam, px, py, 1000, limits);
    expect(z.scale).toBe(limits.max);
    const before = screenToWorld(cam, px, py);
    const after = screenToWorld(z, px, py);
    expect(Math.abs(after.x - before.x)).toBeLessThan(EPS);
    expect(Math.abs(after.y - before.y)).toBeLessThan(EPS);
  });

  it('clamps at min and STILL keeps the cursor world-point invariant', () => {
    const z = zoomAt(cam, px, py, 0.0001, limits);
    expect(z.scale).toBe(limits.min);
    const before = screenToWorld(cam, px, py);
    const after = screenToWorld(z, px, py);
    expect(Math.abs(after.x - before.x)).toBeLessThan(EPS);
    expect(Math.abs(after.y - before.y)).toBeLessThan(EPS);
  });
});

describe('centerOn', () => {
  it('places the world point at the frame centre', () => {
    const cam = centerOn(200, 300, 800, 600, 1.5, limits);
    const s = worldToScreen(cam, 200, 300);
    expect(s.x).toBeCloseTo(400, 9);
    expect(s.y).toBeCloseTo(300, 9);
  });
  it('clamps the scale into limits', () => {
    expect(centerOn(0, 0, 800, 600, 99, limits).scale).toBe(limits.max);
  });
});

describe('fitWorld', () => {
  it('bottom-align: world bottom maps to ~frameH - padding, horizontally centred', () => {
    const worldW = 1000;
    const worldH = 2000;
    const frameW = 600;
    const frameH = 900;
    const pad = 20;
    const cam = fitWorld(worldW, worldH, frameW, frameH, { padding: pad, align: 'bottom' });
    // fit to width: scale = (600 - 40) / 1000
    expect(cam.scale).toBeCloseTo((frameW - 2 * pad) / worldW, 9);
    // world bottom (wy=worldH) lands near the frame bottom
    expect(worldToScreen(cam, worldW / 2, worldH).y).toBeCloseTo(frameH - pad, 9);
    // horizontally centred: world centre maps to frame centre x
    expect(worldToScreen(cam, worldW / 2, 0).x).toBeCloseTo(frameW / 2, 9);
  });

  it('respects maxScale: when the cap binds, content is centred (not full-width)', () => {
    const worldW = 100;
    const frameW = 600;
    const cam = fitWorld(worldW, 200, frameW, 900, { padding: 0, maxScale: 2, align: 'center' });
    expect(cam.scale).toBe(2); // (600/100)=6 capped to 2
    // centred horizontally rather than spanning the full width
    expect(worldToScreen(cam, worldW / 2, 0).x).toBeCloseTo(frameW / 2, 9);
    expect(cam.tx).toBeCloseTo((frameW - worldW * 2) / 2, 9);
  });

  it('center-align centres vertically', () => {
    const cam = fitWorld(1000, 2000, 600, 900, { padding: 0, align: 'center' });
    expect(worldToScreen(cam, 500, 1000).y).toBeCloseTo(900 / 2, 9);
  });

  it('guards non-positive dimensions with a safe camera', () => {
    expect(fitWorld(0, 100, 600, 900, { maxScale: 3 })).toEqual({ tx: 0, ty: 0, scale: 3 });
    expect(fitWorld(100, 100, 0, 900)).toEqual({ tx: 0, ty: 0, scale: 1 });
  });

  it('contain: a portrait world fits FULLY inside a landscape frame (height-limited)', () => {
    const worldW = 1000;
    const worldH = 2000;
    const frameW = 1600;
    const frameH = 900;
    const cam = fitWorld(worldW, worldH, frameW, frameH, { padding: 0, align: 'bottom', fit: 'contain' });
    // height is the binding dimension: scale = frameH/worldH, smaller than the width fit (1.6)
    expect(cam.scale).toBeCloseTo(frameH / worldH, 9);
    // the WHOLE world is visible: top edge >= 0 and bottom edge <= frameH
    expect(worldToScreen(cam, 0, 0).y).toBeGreaterThanOrEqual(-1e-6);
    expect(worldToScreen(cam, 0, worldH).y).toBeLessThanOrEqual(frameH + 1e-6);
  });

  it('contain: a wide world is width-limited (equals the default width fit)', () => {
    const contain = fitWorld(2000, 500, 600, 900, { padding: 0, fit: 'contain' });
    const width = fitWorld(2000, 500, 600, 900, { padding: 0 });
    expect(contain.scale).toBeCloseTo(width.scale, 9); // width binds, so contain == the width fit
  });

  it("default fit ('width') is unchanged, with or without the explicit option", () => {
    const implicit = fitWorld(1000, 2000, 600, 900, { padding: 20, align: 'bottom' });
    const explicit = fitWorld(1000, 2000, 600, 900, { padding: 20, align: 'bottom', fit: 'width' });
    expect(explicit).toEqual(implicit);
  });

  // resting-view-still-clips-five-islands: the studio permanently docks two overlays over the map at
  // rest — the collapsed library-drawer handle (top-centre) and the folded terminal-dock bar (bottom,
  // full width) — that a flat symmetric `padding` never reserved room for. A height-bound contain fit
  // guarantees only `padding` px of headroom at whichever edge isn't pinned by `align`, so a portrait
  // world whose own bounds happen to sit snug against that edge lands its tallest content AT that edge,
  // behind the chrome (this is what a blind visual eval measured off the live corpus: three islands
  // entirely above y=0, two more grazing the drawer handle).
  describe('paddingTop / paddingBottom (resting-view-still-clips-five-islands)', () => {
    it('defaults both to `padding` — an unchanged caller sees identical output', () => {
      const withFlat = fitWorld(1000, 2000, 1600, 1000, {
        padding: 16,
        align: 'bottom',
        fit: 'contain',
      });
      const withBoth = fitWorld(1000, 2000, 1600, 1000, {
        padding: 16,
        paddingTop: 16,
        paddingBottom: 16,
        align: 'bottom',
        fit: 'contain',
      });
      expect(withBoth).toEqual(withFlat);
    });

    it('contain + bottom-align: a taller paddingTop pushes the WHOLE world down, clearing top chrome', () => {
      const worldW = 600;
      const worldH = 900; // height-bound at this frame, so paddingTop directly sets top headroom
      const frameW = 1600;
      const frameH = 1000;
      const flat = fitWorld(worldW, worldH, frameW, frameH, {
        padding: 16,
        align: 'bottom',
        fit: 'contain',
      });
      // With only the flat 16px pad, the guaranteed top gap is exactly `padding` (no slack to spare).
      expect(worldToScreen(flat, 0, 0).y).toBeCloseTo(16, 6);

      const reserved = fitWorld(worldW, worldH, frameW, frameH, {
        padding: 16,
        paddingTop: 40, // clears a ~27px docked handle plus a buffer
        paddingBottom: 48, // clears a ~35px docked terminal bar plus a buffer
        align: 'bottom',
        fit: 'contain',
      });
      // The top of the world now sits at (at least) paddingTop, not the flat padding.
      expect(worldToScreen(reserved, 0, 0).y).toBeCloseTo(40, 6);
      // The bottom of the world sits at frameH - paddingBottom, not frameH - padding.
      expect(worldToScreen(reserved, 0, worldH).y).toBeCloseTo(frameH - 48, 6);
      // The whole world is still fully contained (both edges within the frame).
      expect(worldToScreen(reserved, 0, 0).y).toBeGreaterThanOrEqual(0);
      expect(worldToScreen(reserved, 0, worldH).y).toBeLessThanOrEqual(frameH);
      // Reserving more vertical room can only shrink (never grow) the resulting scale.
      expect(reserved.scale).toBeLessThanOrEqual(flat.scale);
    });

    it('stays horizontally centred at whatever scale the extra vertical reserve produces', () => {
      const worldW = 600;
      const frameW = 1600;
      const withReserve = fitWorld(worldW, 900, frameW, 1000, {
        padding: 16,
        paddingTop: 40,
        paddingBottom: 48,
        align: 'bottom',
        fit: 'contain',
      });
      expect(withReserve.tx).toBeCloseTo((frameW - worldW * withReserve.scale) / 2, 9);
      expect(worldToScreen(withReserve, worldW / 2, 0).x).toBeCloseTo(frameW / 2, 9);
    });

    it("align: 'center' ignores paddingTop/paddingBottom exactly as it already ignores padding", () => {
      const cam = fitWorld(1000, 2000, 600, 900, {
        padding: 0,
        paddingTop: 200,
        paddingBottom: 200,
        align: 'center',
      });
      expect(worldToScreen(cam, 500, 1000).y).toBeCloseTo(900 / 2, 9);
    });

    it("fit: 'width' (the non-contain default) is unaffected by paddingTop/paddingBottom", () => {
      const flat = fitWorld(1000, 2000, 600, 900, { padding: 20, align: 'bottom' });
      const withReserve = fitWorld(1000, 2000, 600, 900, {
        padding: 20,
        paddingTop: 60,
        paddingBottom: 80,
        align: 'bottom',
      });
      // scale (width-bound) is identical — paddingTop/paddingBottom only ever narrow the CONTAIN scale.
      expect(withReserve.scale).toBeCloseTo(flat.scale, 9);
    });
  });
});

describe('limitsForFit', () => {
  it('returns the expected min/max multiples of the fit scale', () => {
    expect(limitsForFit(2)).toEqual({ min: 2 * 0.4, max: 2 * 5 });
  });
});

describe('act2RegrowCamera', () => {
  const fitted: Camera = { tx: 120, ty: 40, scale: 0.5 };
  const frame = { width: 1600, height: 1000 };

  it('opens at one fixed close framing and zooms monotonically outward from the fitted bottom centre', () => {
    const opening = act2RegrowCamera(fitted, frame, 0);
    const quarter = act2RegrowCamera(fitted, frame, 0.25);
    const halfway = act2RegrowCamera(fitted, frame, 0.5);
    const anchor = screenToWorld(fitted, frame.width / 2, frame.height);

    expect(opening.scale).toBe(fitted.scale * ACT2_REGROW_OPENING_SCALE);
    expect(opening.scale).toBeGreaterThan(quarter.scale);
    expect(quarter.scale).toBeGreaterThan(halfway.scale);
    for (const camera of [opening, quarter, halfway]) {
      expect(worldToScreen(camera, anchor.x, anchor.y)).toEqual({
        x: frame.width / 2,
        y: frame.height,
      });
    }
    expect(act2RegrowCamera(fitted, frame, 0.25)).toEqual(quarter);
  });

  it('returns the ordinary fitted camera exactly at settle and whenever motion is reduced', () => {
    expect(act2RegrowCamera(fitted, frame, 1)).toEqual(fitted);
    expect(act2RegrowCamera(fitted, frame, 9)).toEqual(fitted);
    expect(act2RegrowCamera(fitted, frame, 0.25, true)).toEqual(fitted);
  });
});
