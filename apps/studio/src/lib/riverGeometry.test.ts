// offsetCurve is the metro-lane primitive — it must offset a centreline along its
// normal deterministically and without cusps. These tests pin that contract so
// the forest map can't silently drift when the river geometry is refactored.

import { describe, it, expect } from 'vitest';
import {
  offsetCurve,
  quadPt,
  rampWidth,
  smoothOpenPath,
  rayPolyIntersect,
  pointInPoly,
  polyCentroid,
  distToLoop,
  routeAround,
  confluenceTree,
  type Disk,
  type Vec2,
} from './riverGeometry';

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

/** Densely sample the SMOOTHED open curve through `points`, reconstructing the
 *  exact quadratic segments smoothOpenPath emits (control = interior vertex,
 *  on-curve points = the segment midpoints, pinned at the ends), so a test can
 *  assert the whole CURVE — not just the polyline vertices — clears an obstacle. */
function sampleSmoothed(points: Vec2[], per = 14): Vec2[] {
  const n = points.length;
  if (n < 2) return [...points];
  const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const out: Vec2[] = [];
  let start = points[0] as Vec2;
  for (let i = 1; i <= n - 2; i++) {
    const c = points[i] as Vec2;
    const nxt = points[i + 1] as Vec2;
    const end = i === n - 2 ? nxt : mid(c, nxt);
    for (let k = 0; k <= per; k++) out.push(quadPt(start, c, end, k / per));
    start = end;
  }
  if (n === 2) out.push(points[0] as Vec2, points[1] as Vec2);
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

describe('rampWidth', () => {
  it('returns the base width for a lone strand (flow ≤ 1)', () => {
    expect(rampWidth(1, 4, 1.5, 12)).toBe(4);
    expect(rampWidth(0, 4, 1.5, 12)).toBe(4); // flow never narrows below base
  });
  it('adds one step per extra unit of flow', () => {
    expect(rampWidth(3, 4, 1.5, 12)).toBeCloseTo(7); // 4 + 2·1.5
  });
  it('clamps a fat trunk at max so banks never run away', () => {
    expect(rampWidth(100, 4, 1.5, 12)).toBe(12);
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

describe('rayPolyIntersect', () => {
  // a unit-ish square pond centred at the origin
  const square: Vec2[] = [
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ];

  it('docks on the near edge a river entering from outside', () => {
    // origin to the left of the pond, aiming at its centre → hits x=-10 edge
    const dock = rayPolyIntersect({ x: -30, y: 0 }, { x: 0, y: 0 }, square);
    expect(dock).not.toBeNull();
    expect(dock!.x).toBeCloseTo(-10, 5);
    expect(dock!.y).toBeCloseTo(0, 5);
    // outward normal faces back toward the approaching river (−x)
    expect(dock!.nx).toBeCloseTo(-1, 5);
    expect(dock!.ny).toBeCloseTo(0, 5);
  });

  it('picks the NEAREST forward crossing, not the far edge', () => {
    const dock = rayPolyIntersect({ x: 0, y: -30 }, { x: 0, y: 0 }, square);
    expect(dock!.y).toBeCloseTo(-10, 5); // near edge, not +10
    expect(dock!.ny).toBeCloseTo(-1, 5); // outward normal faces the river (−y)
  });

  it('returns null when the ray misses the loop', () => {
    // aiming parallel to and well outside the square
    expect(rayPolyIntersect({ x: -30, y: 50 }, { x: 30, y: 50 }, square)).toBeNull();
  });

  it('is deterministic', () => {
    const a = rayPolyIntersect({ x: -30, y: 3 }, { x: 0, y: 0 }, square);
    const b = rayPolyIntersect({ x: -30, y: 3 }, { x: 0, y: 0 }, square);
    expect(a).toEqual(b);
  });
});

describe('pointInPoly', () => {
  const square: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('is true for an interior point', () => {
    expect(pointInPoly({ x: 5, y: 5 }, square)).toBe(true);
  });
  it('is false for an exterior point', () => {
    expect(pointInPoly({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPoly({ x: -1, y: 5 }, square)).toBe(false);
  });
  it('handles a concave loop', () => {
    // an L-shape: the notch corner is outside
    const L: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPoly({ x: 2, y: 2 }, L)).toBe(true);
    expect(pointInPoly({ x: 8, y: 8 }, L)).toBe(false); // in the notch
  });
});

describe('polyCentroid', () => {
  it('averages the vertices', () => {
    expect(polyCentroid([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])).toEqual({
      x: 2,
      y: 2,
    });
  });
  it('degenerates to the origin for an empty loop', () => {
    expect(polyCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe('distToLoop', () => {
  const square: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it('returns the distance to the nearest edge for an interior point', () => {
    // centre of a 10×10 square: nearest edge is 5 away on every side.
    expect(distToLoop({ x: 5, y: 5 }, square)).toBeCloseTo(5, 5);
  });
  it('is small near an edge', () => {
    expect(distToLoop({ x: 1, y: 5 }, square)).toBeCloseTo(1, 5);
    expect(distToLoop({ x: 5, y: 9 }, square)).toBeCloseTo(1, 5);
  });
  it('is deterministic', () => {
    expect(distToLoop({ x: 3, y: 7 }, square)).toBe(distToLoop({ x: 3, y: 7 }, square));
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

describe('routeAround', () => {
  const dist = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);

  it('returns the straight segment when nothing is in the way', () => {
    expect(routeAround({ x: 0, y: 0 }, { x: 100, y: 0 }, [])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    // an obstacle well off to the side is ignored
    const clear: Disk[] = [{ x: 50, y: 80, r: 20 }];
    expect(routeAround({ x: 0, y: 0 }, { x: 100, y: 0 }, clear)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('detours around an island straddling the line — the SMOOTHED curve clears it', () => {
    const island: Disk[] = [{ x: 50, y: 0, r: 22 }];
    const poly = routeAround({ x: 0, y: 0 }, { x: 100, y: 0 }, island);
    expect(poly.length).toBeGreaterThan(2); // a waypoint was inserted
    // endpoints preserved exactly
    expect(poly[0]).toEqual({ x: 0, y: 0 });
    expect(poly[poly.length - 1]).toEqual({ x: 100, y: 0 });
    // every sample of the smoothed river stays outside the keep-out radius
    for (const s of sampleSmoothed(poly)) {
      expect(dist(s, { x: 50, y: 0 })).toBeGreaterThanOrEqual(22 - 0.5);
    }
  });

  it('skirts a CLUSTER of islands (where a single bow would give up)', () => {
    const cluster: Disk[] = [
      { x: 30, y: 6, r: 16 },
      { x: 60, y: -6, r: 16 },
      { x: 85, y: 4, r: 14 },
    ];
    const poly = routeAround({ x: -10, y: 0 }, { x: 120, y: 0 }, cluster, 8);
    for (const s of sampleSmoothed(poly)) {
      for (const d of cluster) {
        expect(dist(s, d)).toBeGreaterThanOrEqual(d.r - 1.0);
      }
    }
  });

  it('detours a dead-centre obstacle on a stable (deterministic) side', () => {
    const thru: Disk[] = [{ x: 50, y: 0, r: 18 }];
    const a = routeAround({ x: 0, y: 0 }, { x: 100, y: 0 }, thru);
    const b = routeAround({ x: 0, y: 0 }, { x: 100, y: 0 }, thru);
    expect(a).toEqual(b); // deterministic, not a coin flip
    expect(a.length).toBeGreaterThan(2);
  });
});

describe('confluenceTree', () => {
  it('a lone head runs straight to the sink', () => {
    const net = confluenceTree([{ x: 0, y: 0 }], { x: 0, y: 100 });
    expect(net.edges).toHaveLength(1);
    expect(net.edges[0]).toMatchObject({ flow: 1, b: { x: 0, y: 100 } });
    expect(net.routeOf).toEqual([[0]]);
  });

  it('two heads fuse into one trunk to the sink', () => {
    const net = confluenceTree([{ x: -40, y: 0 }, { x: 40, y: 0 }], { x: 0, y: 120 });
    // two tributary edges + one trunk edge
    expect(net.edges).toHaveLength(3);
    const trunk = net.edges[2];
    expect(trunk?.flow).toBe(2); // the trunk carries BOTH rivers
    expect(trunk?.b).toEqual({ x: 0, y: 120 }); // and reaches the sink
    // each head's route ends on the shared trunk edge (index 2)
    expect(net.routeOf[0]?.at(-1)).toBe(2);
    expect(net.routeOf[1]?.at(-1)).toBe(2);
  });

  it('nearby heads MERGE first, so they share every downstream edge', () => {
    // two heads tight together on the left, one far to the right
    const net = confluenceTree(
      [{ x: -50, y: 0 }, { x: -46, y: 4 }, { x: 60, y: 0 }],
      { x: 0, y: 140 },
    );
    const [r0, r1, r2] = net.routeOf;
    // the two near heads (0,1) fuse before the far one (2) joins, so they share
    // a downstream edge that head 2 does NOT traverse at that depth.
    const shared0_1 = (r0 ?? []).filter((e) => (r1 ?? []).includes(e));
    expect(shared0_1.length).toBeGreaterThan(0);
    // all three meet at the final trunk into the sink
    const root = net.edges.length - 1;
    expect(r0?.includes(root)).toBe(true);
    expect(r1?.includes(root)).toBe(true);
    expect(r2?.includes(root)).toBe(true);
    expect(net.edges[root]?.flow).toBe(3); // root carries every tributary
  });

  it('places each confluence DOWNSTREAM (closer to the sink than the midpoint)', () => {
    const sink = { x: 0, y: 200 };
    const net = confluenceTree([{ x: -40, y: 0 }, { x: 40, y: 0 }], sink, 0.3);
    // the confluence point is where the two tributaries end (edges 0 and 1 .b)
    const conf = net.edges[0]?.b;
    expect(conf).toBeDefined();
    // midpoint of the heads is y=0; the confluence is pulled toward the sink (y>0)
    expect(conf!.y).toBeGreaterThan(0);
    expect(conf!.y).toBeCloseTo(60, 5); // 0 + (200-0)*0.3
  });

  it('is deterministic and handles no heads', () => {
    expect(confluenceTree([], { x: 0, y: 0 })).toEqual({ edges: [], routeOf: [] });
    const args: [Vec2[], Vec2] = [[{ x: 1, y: 2 }, { x: 9, y: 3 }, { x: 4, y: 8 }], { x: 5, y: 50 }];
    expect(confluenceTree(...args)).toEqual(confluenceTree(...args));
  });
});
