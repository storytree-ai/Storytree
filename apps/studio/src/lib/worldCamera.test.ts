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
});

describe('limitsForFit', () => {
  it('returns the expected min/max multiples of the fit scale', () => {
    expect(limitsForFit(2)).toEqual({ min: 2 * 0.4, max: 2 * 5 });
  });
});
