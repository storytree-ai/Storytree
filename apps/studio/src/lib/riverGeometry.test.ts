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
  euclideanMST,
  treeDrainage,
  routeAround,
  confluenceTree,
  distributaryChains,
  bearingClusters,
  meanderPath,
  angularDistance,
  circularMeanAngle,
  pondRadiusForDegree,
  embayCoast,
  crescentApplies,
  edgePathBundle,
  segmentKey,
  nearestRimDock,
  fusedMouthPath,
  type BundleEdge,
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

describe('distributaryChains', () => {
  const straight = (a: Vec2, b: Vec2): Vec2[] => [a, b]; // identity router (no islands)
  const source: Vec2 = { x: 0, y: 0 };

  it('a lone dest runs straight from the source to that dest', () => {
    const dest: Vec2 = { x: 100, y: 0 };
    const { chains, trunks } = distributaryChains(source, [dest], 0.3, straight);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.[0]).toEqual(source);
    expect(chains[0]?.at(-1)).toEqual(dest);
    // one trunk edge carrying the single distributary
    expect(trunks.map((t) => t.flow)).toEqual([1]);
  });

  it('EVERY dest chain is pinned EXACTLY on the source and its own dest (the endpoint guard)', () => {
    // a fan of five dests around the top — the library-style delta. No island skip
    // needed for the contract: the router is identity, so we test the assembly.
    const dests: Vec2[] = [
      { x: -80, y: 200 },
      { x: -30, y: 220 },
      { x: 20, y: 215 },
      { x: 70, y: 205 },
      { x: 120, y: 190 },
    ];
    const { chains } = distributaryChains(source, dests, 0.28, straight);
    expect(chains).toHaveLength(dests.length);
    dests.forEach((d, i) => {
      const chain = chains[i] as Vec2[];
      expect(chain.length).toBeGreaterThanOrEqual(2);
      expect(chain[0]).toEqual(source); // leaves the source
      expect(chain.at(-1)).toEqual(d); // and reaches its OWN dest, not a hub
    });
  });

  it('merges near the source: the fattest trunk carries every distributary', () => {
    const dests: Vec2[] = [
      { x: -50, y: 160 },
      { x: -46, y: 168 },
      { x: 60, y: 150 },
    ];
    const { trunks } = distributaryChains(source, dests, 0.3, straight);
    // the stem nearest the source gathers all three dests (Shreve count == 3)
    expect(Math.max(...trunks.map((t) => t.flow))).toBe(dests.length);
    // and leaf distributaries stay at flow 1
    expect(trunks.some((t) => t.flow === 1)).toBe(true);
  });

  it('the trunk and the tributaries braiding through it share IDENTICAL geometry', () => {
    const dests: Vec2[] = [
      { x: -40, y: 180 },
      { x: 40, y: 180 },
    ];
    const { chains, trunks } = distributaryChains(source, dests, 0.3, straight);
    // the fat (flow 2) trunk is the source→confluence stem; both chains begin with
    // exactly that stem's points, so a trunk drawn on top covers them.
    const trunk = trunks.find((t) => t.flow === 2);
    expect(trunk).toBeDefined();
    const stem = trunk?.pts ?? [];
    for (const chain of chains) {
      stem.forEach((p, i) => expect(chain[i]).toEqual(p));
    }
  });

  it('tells the router each segment’s dock role (leaf → its dest, root → the source)', () => {
    const dests: Vec2[] = [{ x: -40, y: 160 }, { x: 40, y: 160 }];
    const calls: { aDestIndex: number; bIsSource: boolean }[] = [];
    distributaryChains(source, dests, 0.3, (a, b, seg) => {
      calls.push(seg);
      return [a, b];
    });
    // exactly one segment is the trunk root that reaches the source
    expect(calls.filter((c) => c.bIsSource).length).toBe(1);
    // each dest has exactly one leaf segment that names it (so only ITS island is skipped)
    expect(calls.filter((c) => c.aDestIndex === 0).length).toBe(1);
    expect(calls.filter((c) => c.aDestIndex === 1).length).toBe(1);
    // a leaf segment is never also reported as the source root (distinct dock roles)
    expect(calls.some((c) => c.aDestIndex >= 0 && c.bIsSource)).toBe(false);
  });

  it('honours the injected router (an island detour reaches the dest with a waypoint)', () => {
    const dest: Vec2 = { x: 200, y: 0 };
    const island: Disk[] = [{ x: 100, y: 0, r: 30 }];
    const routed = distributaryChains(source, [dest], 0.3, (a, b) =>
      routeAround(a, b, island),
    );
    const chain = routed.chains[0] as Vec2[];
    expect(chain.length).toBeGreaterThan(2); // a detour waypoint was inserted
    expect(chain[0]).toEqual(source); // still pinned at both ends
    expect(chain.at(-1)).toEqual(dest);
  });

  it('is deterministic and handles no dests', () => {
    expect(distributaryChains(source, [], 0.3, straight)).toEqual({ chains: [], trunks: [] });
    const dests: Vec2[] = [{ x: -30, y: 90 }, { x: 40, y: 100 }, { x: 5, y: 130 }];
    expect(distributaryChains(source, dests, 0.3, straight)).toEqual(
      distributaryChains(source, dests, 0.3, straight),
    );
  });

  it('a LOW pull bundles same-direction dests into a fat trunk; pull≈1.0 forks at the source', () => {
    // The within-sector contract behind ?deltaConePull: a directional cluster of dests
    // (all heading the same way) must merge into a real shared stem (flow ≥ 2 with
    // length) when the fork is late, and degenerate to one strand per dest when the fork
    // sits at the source. This is the exact regression a deltaPull=1.0 default introduced:
    // clustering by direction is useless if the per-sector delta still forks at the source.
    const dests: Vec2[] = [
      { x: -30, y: 300 },
      { x: 0, y: 310 },
      { x: 30, y: 300 },
    ];
    const len = (pts: Vec2[]): number => {
      let s = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] as Vec2;
        const b = pts[i] as Vec2;
        s += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return s;
    };
    // The total length of the SHARED (flow ≥ 2) stems — the visible "fat trunk" the
    // bundle reads as. Zero ⇒ no bundle, just leaves.
    const fatLen = (trunks: { pts: Vec2[]; flow: number }[]): number =>
      trunks.filter((t) => t.flow >= 2).reduce((s, t) => s + len(t.pts), 0);

    const late = distributaryChains(source, dests, 0.1, straight);
    const atSource = distributaryChains(source, dests, 1.0, straight);
    // Late fork → a substantial shared trunk gathers the cluster.
    expect(fatLen(late.trunks)).toBeGreaterThan(20);
    // Fork at the source → every confluence collapses onto the source, so the shared
    // stems have ~no length and the delta reads as one thin strand per dest.
    expect(fatLen(atSource.trunks)).toBeLessThan(1);
    // Either way every dependency stays traceable end to end.
    [late, atSource].forEach((d) => {
      d.chains.forEach((chain, i) => {
        expect(chain[0]).toEqual(source);
        expect(chain.at(-1)).toEqual(dests[i]);
      });
    });
  });
});

describe('bearingClusters', () => {
  const origin: Vec2 = { x: 0, y: 0 };
  const cone = (deg: number): number => (deg * Math.PI) / 180;
  /** A dest at `deg` degrees and `r` px from the origin (atan2 uses screen-y, so this
   *  is just polar placement — the radius never affects the bearing). */
  const at = (deg: number, r = 100): Vec2 => ({
    x: r * Math.cos(cone(deg)),
    y: r * Math.sin(cone(deg)),
  });
  /** Re-key a cluster partition to the SET of bearings (deg) so a test reads by
   *  direction, not by raw index — bearingClusters returns original indices. */
  const byDirection = (dests: Vec2[], groups: number[][]): number[][] =>
    groups.map((g) =>
      g
        .map((i) => {
          const d = dests[i] as Vec2;
          return Math.round((Math.atan2(d.y, d.x) * 180) / Math.PI);
        })
        .sort((a, b) => a - b),
    );

  it('empty dests → no clusters; a lone dest → one cluster', () => {
    expect(bearingClusters(origin, [], cone(30))).toEqual([]);
    expect(bearingClusters(origin, [at(40)], cone(30))).toEqual([[0]]);
  });

  it('dests all in one tight direction collapse to a SINGLE cluster', () => {
    // five dependents fanned within a ~16° arc — one fat trunk, not five strands.
    const dests = [at(40), at(44), at(48), at(52), at(56)];
    const clusters = bearingClusters(origin, dests, cone(30));
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual([0, 1, 2, 3, 4]); // every dest, ascending
  });

  it('dests in 3 well-separated directions yield 3 clusters', () => {
    // three sectors ~120° apart, each a tight pair → three trunks.
    // atan2 reports 240°/248° as their −120°/−112° equivalents (range −180…180).
    const dests = [at(0), at(8), at(120), at(126), at(240), at(248)];
    const clusters = bearingClusters(origin, dests, cone(30));
    expect(clusters).toHaveLength(3);
    // each cluster is one of the three direction-pairs (read by bearing, not index)
    const dirs = byDirection(dests, clusters).sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    expect(dirs).toEqual([
      [-120, -112],
      [0, 8],
      [120, 126],
    ]);
  });

  it('WRAPAROUND: dests near +350° and +10° join the SAME cluster (across ±π)', () => {
    // atan2 maps these to ~−10° and ~+10°: a plain sort would split them at the ±π
    // seam; the ring cut at the widest gap keeps them together.
    const dests = [at(350), at(10), at(180)];
    const clusters = bearingClusters(origin, dests, cone(30));
    expect(clusters).toHaveLength(2); // {350,10} together, 180 alone
    const dirs = byDirection(dests, clusters);
    // the wrap pair lands in one cluster (−10 and +10 by atan2), 180 in the other
    const wrapCluster = dirs.find((g) => g.length === 2);
    expect(wrapCluster).toBeDefined();
    expect(new Set(wrapCluster)).toEqual(new Set([-10, 10]));
    expect(dirs.some((g) => g.length === 1 && Math.abs(g[0] ?? 0) === 180)).toBe(true);
  });

  it('a single wide cone keeps everything in ONE cluster regardless of spread', () => {
    const dests = [at(0), at(90), at(180), at(270)];
    // 95° gaps, cone 100° > every gap → one cluster
    expect(bearingClusters(origin, dests, cone(100))).toEqual([[0, 1, 2, 3]]);
  });

  it('coneRad <= 0 splits to per-direction clusters (maximally split)', () => {
    const dests = [at(0), at(90), at(200)];
    const clusters = bearingClusters(origin, dests, 0);
    expect(clusters).toHaveLength(3);
    // every dest is its own cluster
    expect(clusters.map((c) => c.length)).toEqual([1, 1, 1]);
  });

  it('is deterministic and breaks bearing ties by the lower index', () => {
    const dests = [at(40), at(120), at(40), at(122)];
    const a = bearingClusters(origin, dests, cone(30));
    const b = bearingClusters(origin, dests, cone(30));
    expect(a).toEqual(b); // same input → same partition
    // the two exactly-collinear dests (indices 0 and 2) share a cluster, listed ascending
    const together = a.find((g) => g.includes(0));
    expect(together).toEqual([0, 2]);
  });

  it('every dest appears in EXACTLY one cluster (a partition, no drops or dupes)', () => {
    const dests = [at(5), at(15), at(70), at(75), at(200), at(330)];
    const clusters = bearingClusters(origin, dests, cone(25));
    const all = clusters.flat().sort((x, y) => x - y);
    expect(all).toEqual(dests.map((_, i) => i));
  });

  it('per-cluster distributaryChains keeps every chain pinned to the TRUE source and dest', () => {
    // The whole point: clustering must NOT break traceability. Run the production
    // assembly — bearingClusters then distributaryChains per cluster — and assert each
    // dest's chain still starts EXACTLY at the source and ends EXACTLY at that dest.
    const straight = (a: Vec2, b: Vec2): Vec2[] => [a, b];
    const src: Vec2 = { x: 0, y: 0 };
    const dests = [at(40, 200), at(48, 220), at(150, 210), at(158, 190), at(265, 205)];
    const clusters = bearingClusters(src, dests, cone(30));
    expect(clusters.length).toBeGreaterThan(1); // genuinely multi-sector
    for (const cluster of clusters) {
      const destDocks = cluster.map((i) => dests[i] as Vec2);
      const { chains } = distributaryChains(src, destDocks, 0.05, straight);
      expect(chains).toHaveLength(cluster.length);
      cluster.forEach((destIdx, ci) => {
        const chain = chains[ci] as Vec2[];
        expect(chain.length).toBeGreaterThanOrEqual(2);
        expect(chain[0]).toEqual(src); // leaves the TRUE source
        expect(chain.at(-1)).toEqual(dests[destIdx]); // reaches its TRUE dest
      });
    }
  });
});

describe('euclideanMST', () => {
  it('returns n−1 edges and connects every node', () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    const mst = euclideanMST(pts);
    expect(mst).toHaveLength(3);
    const touched = new Set(mst.flat());
    expect(touched.size).toBe(4); // every node appears
  });
  it('links nearest neighbours (a collinear chain links adjacent points)', () => {
    const mst = euclideanMST([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 21, y: 0 }]);
    // expect 0-1 and 1-2, never the long 0-2
    const has = (a: number, b: number): boolean => mst.some(([x, y]) => x === a && y === b);
    expect(has(0, 1)).toBe(true);
    expect(has(1, 2)).toBe(true);
    expect(has(0, 2)).toBe(false);
  });
  it('is empty for <2 points and deterministic', () => {
    expect(euclideanMST([])).toEqual([]);
    expect(euclideanMST([{ x: 1, y: 1 }])).toEqual([]);
    const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 9, y: 1 }, { x: 2, y: 7 }];
    expect(euclideanMST(pts)).toEqual(euclideanMST(pts));
  });
});

describe('treeDrainage', () => {
  // a 4-node path tree: 0—1—2—3 (edges indexed 0,1,2)
  const path: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
  ];
  it('accumulates monotonically toward the root', () => {
    // rooted at 0: edge 0 (0—1) drains nodes {1,2,3}=3, edge 1 drains {2,3}=2, edge 2 drains {3}=1
    const f = treeDrainage(4, path, 0);
    expect(f.map((e) => e.flow)).toEqual([3, 2, 1]);
  });
  it('a star root drains every leaf at one unit', () => {
    // 0 is the centre joined to 1,2,3; every spoke drains its single leaf
    const star: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const f = treeDrainage(4, star, 0);
    expect(f.map((e) => e.flow)).toEqual([1, 1, 1]);
  });
  it('a branching tree sums its sub-branches at the trunk', () => {
    // 3 is the root; 3—2 trunk drains {2,0,1}=3; 2—0 and 2—1 each drain one leaf
    const tree: Array<[number, number]> = [
      [0, 2],
      [1, 2],
      [2, 3],
    ];
    const f = treeDrainage(4, tree, 3);
    expect(f[2]?.flow).toBe(3); // 2—3 trunk carries the whole basin above it
    expect(f[0]?.flow).toBe(1);
    expect(f[1]?.flow).toBe(1);
  });
  it('is deterministic', () => {
    expect(treeDrainage(4, path, 0)).toEqual(treeDrainage(4, path, 0));
  });
});

describe('meanderPath', () => {
  // a straight horizontal river — the cleanest case to reason about displacement.
  const line: Vec2[] = [
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];

  it('pins both endpoints exactly (a river still starts on its dock, ends on its mouth)', () => {
    const out = meanderPath(line, 7, 12, 1.6, 24);
    expect(out[0]).toEqual({ x: 0, y: 100 });
    const last = out[out.length - 1];
    expect(last?.x).toBeCloseTo(200, 6);
    expect(last?.y).toBeCloseTo(100, 6);
  });

  it('is a no-op when amplitude is zero or non-positive', () => {
    expect(meanderPath(line, 7, 0)).toBe(line);
    expect(meanderPath(line, 7, -5)).toBe(line);
  });

  it('is a no-op for fewer than two points', () => {
    const one: Vec2[] = [{ x: 1, y: 2 }];
    expect(meanderPath(one, 7, 12)).toBe(one);
  });

  it('is deterministic — same (geometry, seed) gives an identical path', () => {
    expect(meanderPath(line, 42, 10, 2, 20)).toEqual(meanderPath(line, 42, 10, 2, 20));
  });

  it('keeps every displaced point within amplitude of the centreline', () => {
    const amp = 9;
    const out = meanderPath(line, 3, amp, 2.2, 24);
    // tangent is horizontal ⇒ all displacement is in y; bound it by amp (+ε).
    for (const p of out) expect(Math.abs(p.y - 100)).toBeLessThanOrEqual(amp + 1e-6);
  });

  it('actually moves the interior (the wiggle is non-trivial)', () => {
    const out = meanderPath(line, 5, 10, 2, 24);
    const maxOff = Math.max(...out.map((p) => Math.abs(p.y - 100)));
    expect(maxOff).toBeGreaterThan(1);
  });

  it('a different seed gives a different wiggle', () => {
    const a = meanderPath(line, 1, 10, 2, 24);
    const b = meanderPath(line, 2, 10, 2, 24);
    expect(a).not.toEqual(b);
  });
});

describe('angularDistance', () => {
  it('is zero for equal bearings', () => {
    expect(angularDistance(1.2, 1.2)).toBeCloseTo(0, 9);
  });

  it('wraps across ±π (the short way round)', () => {
    // 170° and -170° are 20° apart, not 340°.
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    expect(angularDistance(a, b)).toBeCloseTo((20 * Math.PI) / 180, 9);
  });

  it('never exceeds π and is symmetric', () => {
    for (const [a, b] of [
      [0, Math.PI],
      [0.3, 4.1],
      [-2, 2],
    ]) {
      const d = angularDistance(a as number, b as number);
      expect(d).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(d).toBeCloseTo(angularDistance(b as number, a as number), 9);
    }
  });
});

describe('circularMeanAngle', () => {
  it('averages two bearings straddling +x without ±π cancellation', () => {
    // +80° and -80° mean 0°, not 180° (which a naive arithmetic mean of wrapped
    // values could give).
    const m = circularMeanAngle([(80 * Math.PI) / 180, (-80 * Math.PI) / 180]);
    expect(m).toBeCloseTo(0, 9);
  });

  it('points at a lone bearing', () => {
    expect(circularMeanAngle([1.3])).toBeCloseTo(1.3, 9);
  });

  it('returns 0 for no angles', () => {
    expect(circularMeanAngle([])).toBe(0);
  });
});

describe('pondRadiusForDegree', () => {
  it('returns the base floor at degree 0', () => {
    expect(pondRadiusForDegree(0, 10, 5, 100)).toBeCloseTo(10, 9);
  });

  it('grows with sqrt(degree) — a degree-9 hub is 3·gain over base, not 9·', () => {
    const base = 10;
    const gain = 5;
    expect(pondRadiusForDegree(9, base, gain, 100)).toBeCloseTo(base + gain * 3, 9);
    expect(pondRadiusForDegree(4, base, gain, 100)).toBeCloseTo(base + gain * 2, 9);
  });

  it('is monotonic and clamps to max', () => {
    expect(pondRadiusForDegree(3, 10, 5, 100)).toBeGreaterThan(pondRadiusForDegree(1, 10, 5, 100));
    expect(pondRadiusForDegree(100, 10, 5, 18)).toBe(18); // capped
  });
});

describe('crescentApplies', () => {
  it('only hubs at/above the threshold embay (the library, not small islands)', () => {
    const minDegree = 5;
    expect(crescentApplies(7, minDegree)).toBe(true); // the library (dep-degree 7)
    expect(crescentApplies(6, minDegree)).toBe(true); // studio (dep-degree 6)
    expect(crescentApplies(5, minDegree)).toBe(true); // exactly the threshold
    expect(crescentApplies(4, minDegree)).toBe(false); // a degree-4 mid node — plain pond
    expect(crescentApplies(2, minDegree)).toBe(false); // a small island
    expect(crescentApplies(1, minDegree)).toBe(false); // a leaf island
  });

  it('never embays a degree-0 island, even at minDegree 0', () => {
    expect(crescentApplies(0, 5)).toBe(false);
    expect(crescentApplies(0, 0)).toBe(false);
  });

  it('minDegree 0 means every connected island (the pre-threshold behaviour)', () => {
    expect(crescentApplies(1, 0)).toBe(true);
    expect(crescentApplies(2, 0)).toBe(true);
  });
});

describe('embayCoast', () => {
  // A circular coast of radius 50 centred at the origin; a lake centred to its +x
  // side at (60,0) — so the lake pokes PAST the shore and the coast must grow to
  // wrap it, opening a mouth toward +x.
  const N = 64;
  const R = 50;
  const ring: Vec2[] = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });
  const pondCenter: Vec2 = { x: 60, y: 0 };
  const pondR = 30;
  const beach = 6;
  const distToPond = (p: Vec2): number => Math.hypot(p.x - pondCenter.x, p.y - pondCenter.y);

  it('wraps the coast out to pondR+beach where land intrudes on the lake', () => {
    // The flank vertices (above/below the lake, NOT in the +x mouth) must be pushed
    // out so no land sits closer than pondR+beach to the lake centre.
    const out = embayCoast(ring, pondCenter, pondR, beach, 0, Math.PI / 4);
    for (const p of out) {
      const bearing = Math.atan2(p.y - pondCenter.y, p.x - pondCenter.x);
      if (angularDistance(bearing, 0) < Math.PI / 4) continue; // mouth — left open
      expect(distToPond(p)).toBeGreaterThanOrEqual(pondR + beach - 1e-6);
    }
  });

  it('leaves the seaward mouth open (does not wrap toward θ_bay)', () => {
    const open = embayCoast(ring, pondCenter, pondR, beach, 0, Math.PI / 3);
    // A vertex on the +x side of the original ring (bearing ~π from the lake) sits
    // in the mouth sector and stays at the original shore — unchanged.
    const mouthVert = ring[0] as Vec2; // (50,0): bearing from lake = π, NOT in mouth
    void mouthVert;
    // The original ring vertex nearest +x as seen from the lake is (50,0) at bearing
    // π — that's the FAR side, untouched anyway. Assert the mouth instead via a
    // synthetic vertex placed inside the lake on the +x (seaward) side.
    const probe: Vec2[] = [{ x: 75, y: 0 }]; // 15 from lake centre, bearing 0 = mouth
    const res = embayCoast(probe, pondCenter, pondR, beach, 0, Math.PI / 3);
    expect(res[0]).toEqual({ x: 75, y: 0 }); // untouched — in the mouth
  });

  it('leaves vertices already clear of the lake untouched', () => {
    // Far-side vertices (−x) are well outside pondR+beach → unchanged.
    const out = embayCoast(ring, pondCenter, pondR, beach, 0, Math.PI / 4);
    const farIdx = Math.round(N / 2); // (−50,0)
    expect(out[farIdx]).toEqual(ring[farIdx]);
  });

  it('a zero want (pondR+beach) is a faithful copy', () => {
    expect(embayCoast(ring, pondCenter, 0, 0, 0, Math.PI / 4)).toEqual(ring);
  });

  it('is deterministic — same inputs, same loop', () => {
    const a = embayCoast(ring, pondCenter, pondR, beach, 0.2, Math.PI / 4);
    const b = embayCoast(ring, pondCenter, pondR, beach, 0.2, Math.PI / 4);
    expect(a).toEqual(b);
  });
});

describe('edgePathBundle', () => {
  // A star around a "library" hub at the origin: three dependents hug it, and a
  // LONG A–B edge spans across it. The long edge should reroute (bundle) through
  // the hub, fattening the hub's two incident segments, while the short direct
  // edges stay as their own straight channels — the exact "merge when close but
  // keep the direct signal" the basin MST destroyed.
  const nodes: Vec2[] = [
    { x: 0, y: 0 }, // 0 library (hub)
    { x: -10, y: 0 }, // 1 A
    { x: 10, y: 0 }, // 2 B (opposite A)
    { x: 0, y: 10 }, // 3 C
  ];
  const edges: BundleEdge[] = [
    { a: 1, b: 0 }, // e0 A→library  (len 10)
    { a: 2, b: 0 }, // e1 B→library  (len 10)
    { a: 3, b: 0 }, // e2 C→library  (len 10)
    { a: 1, b: 2 }, // e3 A→B        (len 20, long — bundles via library)
  ];

  it('reroutes the long edge through the hub but keeps the short edges straight', () => {
    const { paths, bundled } = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    // short edges: straight, exactly their own two endpoints
    expect(paths[0]).toEqual([1, 0]);
    expect(paths[1]).toEqual([2, 0]);
    expect(paths[2]).toEqual([3, 0]);
    expect(bundled.slice(0, 3)).toEqual([false, false, false]);
    // long edge: bundled through the hub, still ENDING at its own A and B
    expect(bundled[3]).toBe(true);
    expect(paths[3]).toEqual([1, 0, 2]);
  });

  it('EVERY real edge keeps its true endpoints — no edge is dropped (the MST guard)', () => {
    const { paths } = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    expect(paths).toHaveLength(edges.length);
    edges.forEach((e, i) => {
      const p = paths[i] as number[];
      expect(p.length).toBeGreaterThanOrEqual(2);
      expect(p[0]).toBe(e.a);
      expect(p[p.length - 1]).toBe(e.b);
    });
  });

  it('accumulates Shreve-like flow: the hub trunk fattens, twigs stay thin', () => {
    const { segments } = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    const flowOf = new Map(segments.map((s) => [segmentKey(s.a, s.b), s.flow]));
    // A–library and B–library each carry the direct dep PLUS the bundled A→B
    expect(flowOf.get(segmentKey(1, 0))).toBe(2);
    expect(flowOf.get(segmentKey(2, 0))).toBe(2);
    // C–library is a lone twig
    expect(flowOf.get(segmentKey(3, 0))).toBe(1);
    // the absorbed long edge leaves NO direct A–B segment behind
    expect(flowOf.has(segmentKey(1, 2))).toBe(false);
  });

  it('is deterministic — same graph yields identical paths and flows', () => {
    const a = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    const b = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    expect(a).toEqual(b);
  });

  it('the bundle/straight decision is stable under the dMax threshold', () => {
    // A tight detour budget refuses the reroute: the long edge stays straight.
    const tight = edgePathBundle(nodes, edges, { d: 2, dMax: 0.4 });
    expect(tight.bundled[3]).toBe(false);
    expect(tight.paths[3]).toEqual([1, 2]);
    // A generous budget bundles it.
    const loose = edgePathBundle(nodes, edges, { d: 2, dMax: 2 });
    expect(loose.bundled[3]).toBe(true);
  });

  it('leaves an edge straight when its endpoints have no alternate path', () => {
    // Add a pendant node E reachable ONLY via A: excluding the E–A edge, E is
    // unreachable, so Dijkstra finds no detour and the edge stays direct.
    const withPendant: Vec2[] = [...nodes, { x: -100, y: 100 }]; // 4 = E
    const pendantEdges: BundleEdge[] = [...edges, { a: 4, b: 1 }]; // e4 E→A
    const { paths, bundled } = edgePathBundle(withPendant, pendantEdges, { d: 2, dMax: 5 });
    expect(bundled[4]).toBe(false);
    expect(paths[4]).toEqual([4, 1]);
  });

  it('returns empty for an empty edge set', () => {
    const { paths, segments } = edgePathBundle(nodes, [], { d: 2, dMax: 2 });
    expect(paths).toEqual([]);
    expect(segments).toEqual([]);
  });
});

// nearestRimDock + fusedMouthPath are the FUSED-POND-MOUTH primitives
// (`?pondMouth=fused`): they replace the two-stroke stub-mouth wiring (an over-sea
// edge ending at the coast dock + a SEPARATE in-pond channel rayed through the pond
// CENTRE, stopping dead ON the rim) with ONE continuous channel that departs the
// coast along the river's own arrival bearing (no kink) and overshoots PAST the rim
// into the pool body (reads as flowing in). These tests pin that contract.
describe('nearestRimDock', () => {
  // A square pond centred on the origin, vertices CCW.
  const square: Vec2[] = [
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ];

  it('docks along the ARRIVAL BEARING, not through the pond centre', () => {
    // A coast dock OFF the centre axis, arriving heading straight DOWN (+y). The
    // bearing ray must hit the TOP edge directly below the dock (x ≈ dock.x), which
    // is NOT where a ray through the centre would land (that one fans toward x=0).
    const coastDock: Vec2 = { x: 12, y: -60 };
    const arrivalDir: Vec2 = { x: 0, y: 1 }; // inward, straight down
    const hit = nearestRimDock(coastDock, arrivalDir, square);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeCloseTo(-20, 5); // on the top rim
    expect(hit!.x).toBeCloseTo(12, 5); // straight below the dock, NOT pulled to x=0

    const throughCentre = rayPolyIntersect(coastDock, { x: 0, y: 0 }, square);
    expect(throughCentre).not.toBeNull();
    // The two strategies must genuinely disagree for an off-axis dock.
    expect(Math.abs(hit!.x - throughCentre!.x)).toBeGreaterThan(2);
  });

  it('returns a rim point that lies ON the pond loop', () => {
    const coastDock: Vec2 = { x: -8, y: -50 };
    const hit = nearestRimDock(coastDock, { x: 0, y: 1 }, square);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeCloseTo(-20, 5); // exactly on the top edge
    expect(Math.abs(hit!.x)).toBeLessThanOrEqual(20 + 1e-6); // within the edge span
  });

  it('falls back to the nearest rim VERTEX when the bearing ray misses the loop', () => {
    // A dock to the upper-right, arriving heading AWAY from the pond (up-right): the
    // ray never crosses the loop, so the helper falls back to the nearest rim point.
    const coastDock: Vec2 = { x: 60, y: -60 };
    const hit = nearestRimDock(coastDock, { x: 1, y: -1 }, square); // away from pond
    expect(hit).not.toBeNull();
    // nearest square vertex to (60,-60) is the top-right corner (20,-20).
    expect(hit!.x).toBeCloseTo(20, 5);
    expect(hit!.y).toBeCloseTo(-20, 5);
  });

  it("orients the dock normal OUTWARD from the pond (back toward the coast dock)", () => {
    const coastDock: Vec2 = { x: 0, y: -60 };
    const hit = nearestRimDock(coastDock, { x: 0, y: 1 }, square);
    expect(hit).not.toBeNull();
    // top edge: outward normal points up (-y), i.e. back toward the coast dock above.
    expect(hit!.ny).toBeLessThan(0);
    expect(Math.abs(hit!.nx)).toBeLessThan(1e-6);
  });
});

describe('fusedMouthPath', () => {
  const square: Vec2[] = [
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ];
  const pond = { center: { x: 0, y: 0 } as Vec2, loop: square };
  const coastDock: Vec2 = { x: 8, y: -60 };
  const arrivalDir: Vec2 = { x: 0, y: 1 }; // inward (straight down)

  it('starts EXACTLY at the coast dock', () => {
    const d = fusedMouthPath(coastDock, arrivalDir, pond, { overshoot: 6, flare: 12, startLen: 10 });
    expect(d).not.toBeNull();
    const pts = coords(d!);
    expect(pts[0]!.x).toBeCloseTo(coastDock.x, 1);
    expect(pts[0]!.y).toBeCloseTo(coastDock.y, 1);
  });

  it('departs the coast along the river ARRIVAL TANGENT (no kink at the seam)', () => {
    const d = fusedMouthPath(coastDock, arrivalDir, pond, { overshoot: 6, flare: 12, startLen: 10 });
    const pts = coords(d!); // M a C c1 c2 end  ⇒ [a, c1, c2, end]
    const a = pts[0]!;
    const c1 = pts[1]!;
    // departure tangent = c1 - a; must align with arrivalDir (dot ≈ 1, cross ≈ 0).
    let tx = c1.x - a.x;
    let ty = c1.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const dot = tx * arrivalDir.x + ty * arrivalDir.y;
    const cross = tx * arrivalDir.y - ty * arrivalDir.x;
    expect(dot).toBeCloseTo(1, 5);
    expect(cross).toBeCloseTo(0, 5);
  });

  it('OVERSHOOTS past the rim — its final point is INSIDE the pond loop', () => {
    const d = fusedMouthPath(coastDock, arrivalDir, pond, { overshoot: 6, flare: 12, startLen: 10 });
    const pts = coords(d!);
    const end = pts[pts.length - 1]!;
    expect(pointInPoly(end, square)).toBe(true); // past the rim, not butting on it
  });

  it('is deterministic — identical inputs give an identical d-string', () => {
    const a = fusedMouthPath(coastDock, arrivalDir, pond, { overshoot: 6, flare: 12, startLen: 10 });
    const b = fusedMouthPath(coastDock, arrivalDir, pond, { overshoot: 6, flare: 12, startLen: 10 });
    expect(a).toEqual(b);
  });

  it('returns null when no rim can be found (degenerate loop)', () => {
    expect(fusedMouthPath(coastDock, arrivalDir, { center: { x: 0, y: 0 }, loop: [] }, { overshoot: 6 })).toBeNull();
  });
});
