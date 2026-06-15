// offsetCurve is the metro-lane primitive — it must offset a centreline along its
// normal deterministically and without cusps. These tests pin that contract so
// the forest map can't silently drift when the river geometry is refactored.

import { describe, it, expect } from 'vitest';
import { offsetCurve, quadPt, smoothOpenPath, type Vec2 } from './riverGeometry';

/** Pull every coordinate pair out of an SVG path d-string. */
function coords(d: string): Vec2[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x !== undefined && y !== undefined) out.push({ x, y });
  }
  return out;
}

describe('offsetCurve', () => {
  const horizontal = (t: number): Vec2 => ({ x: t * 100, y: 50 });

  it('a zero offset reproduces the centreline (exact endpoints)', () => {
    const d = offsetCurve(horizontal, () => 0, 16);
    const pts = coords(d);
    expect(pts.length).toBeGreaterThan(2);
    for (const p of pts) expect(p.y).toBeCloseTo(50, 5);
    expect(pts[0]).toEqual({ x: 0, y: 50 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 50 });
  });

  it('offsets a straight centreline along its (left) normal by a constant', () => {
    // tangent = (1,0) ⇒ left normal = (0,1); a +10 offset lands the line at y=60.
    const d = offsetCurve(horizontal, () => 10, 16);
    for (const p of coords(d)) expect(p.y).toBeCloseTo(60, 5);
  });

  it('signs the offset so ±d straddle the centreline symmetrically', () => {
    const up = coords(offsetCurve(horizontal, () => 8, 12));
    const down = coords(offsetCurve(horizontal, () => -8, 12));
    expect(up.length).toEqual(down.length);
    for (let i = 0; i < up.length; i++) {
      const u = up[i];
      const dn = down[i];
      if (!u || !dn) continue;
      expect((u.y + dn.y) / 2).toBeCloseTo(50, 5); // midline is the centreline
    }
  });

  it('is deterministic — identical inputs give an identical path', () => {
    const a = offsetCurve(horizontal, (t) => 5 * Math.sin(Math.PI * t), 18);
    const b = offsetCurve(horizontal, (t) => 5 * Math.sin(Math.PI * t), 18);
    expect(a).toEqual(b);
  });

  it('clamps the offset on a tight bend so it never folds into a cusp', () => {
    // a near-right-angle elbow has a small radius of curvature at the corner;
    // a large requested offset on the concave side must be clamped, so the
    // offset path stays monotone-ish rather than looping back on itself.
    const elbow = (t: number): Vec2 =>
      t < 0.5 ? { x: t * 200, y: 0 } : { x: 100, y: (t - 0.5) * 200 };
    const d = offsetCurve(elbow, () => -60, 24);
    expect(d).toContain('M'); // produced a path at all
    const pts = coords(d);
    // no sample is flung implausibly far from the elbow's bounding region
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeLessThan(260);
      expect(Math.abs(p.y)).toBeLessThan(260);
    }
  });
});

describe('quadPt', () => {
  it('hits the endpoints and the bézier midpoint', () => {
    const p0 = { x: 0, y: 0 };
    const c = { x: 10, y: 20 };
    const p1 = { x: 20, y: 0 };
    expect(quadPt(p0, c, p1, 0)).toEqual(p0);
    expect(quadPt(p0, c, p1, 1)).toEqual(p1);
    // midpoint of a quadratic = 0.25·P0 + 0.5·C + 0.25·P1
    expect(quadPt(p0, c, p1, 0.5)).toEqual({ x: 10, y: 10 });
  });
});

describe('smoothOpenPath', () => {
  it('pins the exact first and last point', () => {
    const d = smoothOpenPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ]);
    const pts = coords(d);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 30, y: 10 });
  });

  it('degenerates gracefully', () => {
    expect(smoothOpenPath([])).toEqual('');
    expect(smoothOpenPath([{ x: 1, y: 2 }])).toEqual('M 1.0 2.0');
    expect(smoothOpenPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual('M 1.0 2.0 L 3.0 4.0');
  });
});
