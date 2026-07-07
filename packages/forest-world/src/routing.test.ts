// The trail router's inner-loop dogfood (ADR-0169 §1): the cost-grid engine is
// DETERMINISTIC (same input → deep-equal network, byte-identical d strings),
// island-avoiding, trunk-MERGING under the reuse discount, cave-forced only
// when walled in, meander-bounded by clearance, and chain-continuous from rim
// to rim. The LOOK is operator-attested (ADR-0070) — these pin the geometry.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  routeTrails,
  trailFillWidth,
  type TrailIsland,
  type TrailEdgeIn,
  type TrailEdgeOut,
  type TrailNetwork,
  type TrailSegment,
} from './routing.js';
import { hash, rand01 } from './rng.js';

// ---------- helpers ----------

function isle(id: string, x: number, y: number, r: number): TrailIsland {
  return { id, x, y, r };
}

function segById(net: TrailNetwork, id: string): TrailSegment {
  const seg = net.segments.find((s) => s.id === id);
  assert.ok(seg, `segment ${id} exists`);
  return seg;
}

function orientedPoints(net: TrailNetwork, ref: { id: string; reversed: boolean }): { x: number; y: number }[] {
  const pts = [...segById(net, ref.id).points];
  return ref.reversed ? pts.reverse() : pts;
}

/** Walk an edge's segment chain: consecutive endpoints must coincide, and the
 *  chain must dock exactly on the from/to island rims. */
function assertChainContinuous(net: TrailNetwork, islands: readonly TrailIsland[], edge: TrailEdgeOut): void {
  const byId = new Map(islands.map((i) => [i.id, i]));
  assert.ok(edge.segments.length > 0, `${edge.from}->${edge.to} has segments`);
  let prev: { x: number; y: number } | undefined;
  for (const ref of edge.segments) {
    const pts = orientedPoints(net, ref);
    assert.ok(pts.length >= 2, 'segment has at least two points');
    const first = pts[0]!;
    if (prev) {
      assert.ok(
        Math.hypot(first.x - prev.x, first.y - prev.y) < 1e-9,
        `${edge.from}->${edge.to}: chain connects at ${ref.id}`,
      );
    } else {
      const from = byId.get(edge.from)!;
      assert.ok(
        Math.abs(Math.hypot(first.x - from.x, first.y - from.y) - from.r) < 1e-6,
        `${edge.from}->${edge.to}: docks on the from rim`,
      );
    }
    prev = pts[pts.length - 1]!;
  }
  const to = byId.get(edge.to)!;
  assert.ok(
    prev !== undefined && Math.abs(Math.hypot(prev.x - to.x, prev.y - to.y) - to.r) < 1e-6,
    `${edge.from}->${edge.to}: docks on the to rim`,
  );
}

/** Islands that are NOT an endpoint of any edge routed through the segment. */
function foreignIslandsOf(net: TrailNetwork, segId: string, islands: readonly TrailIsland[]): TrailIsland[] {
  const endpoints = new Set<string>();
  for (const e of net.edges) {
    if (e.segments.some((r) => r.id === segId)) {
      endpoints.add(e.from);
      endpoints.add(e.to);
    }
  }
  return islands.filter((i) => !endpoints.has(i.id));
}

// ---------- determinism ----------

test('routeTrails is deterministic: same input, deep-equal network + byte-identical d', () => {
  const islands = [isle('A', 0, 0, 40), isle('B', 520, 0, 40), isle('O', 260, 10, 55)];
  const edges: TrailEdgeIn[] = [
    { from: 'A', to: 'B', title: 'a to b' },
    { from: 'A', to: 'O' },
    { from: 'O', to: 'B' },
  ];
  const n1 = routeTrails(islands, edges, 'seed-1');
  const n2 = routeTrails(islands, edges, 'seed-1');
  assert.deepEqual(n1, n2);
  assert.deepEqual(
    n1.segments.map((s) => s.d),
    n2.segments.map((s) => s.d),
  );
  assert.ok(n1.segments.length > 0);
  for (const s of n1.segments) assert.match(s.d, /^M -?\d/);
});

// ---------- avoidance + meander bound ----------

test('visible trails avoid foreign islands and the meander never enters one', () => {
  const islands = [isle('A', 0, 0, 40), isle('B', 520, 0, 40), isle('O', 260, 0, 55)];
  const net = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-2');
  assert.equal(net.caves.length, 0, 'no cave when a route around exists');
  for (const seg of net.segments) {
    assert.equal(seg.hidden, false, 'no hidden segment when a route around exists');
    const foreign = foreignIslandsOf(net, seg.id, islands);
    for (const p of seg.points) {
      for (const isl of foreign) {
        const d = Math.hypot(p.x - isl.x, p.y - isl.y);
        assert.ok(d > isl.r, `point (${p.x},${p.y}) stays outside ${isl.id} (${d} <= ${isl.r})`);
      }
    }
  }
});

test('an explicit meanderAmp override is clamped below clearance — never into an island', () => {
  const islands = [isle('A', 0, 0, 40), isle('B', 520, 0, 40), isle('O', 260, 0, 55)];
  // an absurd amplitude must not break the invariant the default derivation keeps
  const net = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-amp', { meanderAmp: 500 });
  assert.equal(net.caves.length, 0);
  for (const seg of net.segments) {
    for (const p of seg.points) {
      const d = Math.hypot(p.x - 260, p.y - 0);
      assert.ok(d > 55, `meander point (${p.x},${p.y}) stays outside O (${d} <= 55)`);
    }
  }
});

test('a pinched-out third island keeps its hard clearance (three block slots, not two)', () => {
  // A and B are the edge's OWN islands and the two nearest blockers throughout the
  // pinch, so a 2-slot mask would drop X entirely and let the trail hug its coast.
  const X = isle('X', 45, 24, 10);
  const islands = [isle('A', 0, 0, 40), isle('B', 90, 0, 40), X];
  const net = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-pinch');
  assert.equal(net.caves.length, 0, 'the pinch routes around, never under');
  const clearance = 0.6 * 27; // resolveTuning default from HEX_R
  for (const seg of net.segments) {
    for (const p of seg.points) {
      const d = Math.hypot(p.x - X.x, p.y - X.y);
      assert.ok(d > X.r + clearance, `point (${p.x},${p.y}) honours X's clearance (${d} <= ${X.r + clearance})`);
    }
  }
});

// ---------- merge emergence ----------

test('near-parallel edges to one destination share a trunk segment (usage >= 2)', () => {
  const islands = [isle('A', -800, -60, 35), isle('B', -800, 60, 35), isle('C', 0, 0, 45)];
  const net = routeTrails(
    islands,
    [
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' },
    ],
    'seed-3',
  );
  const ac = net.edges.find((e) => e.from === 'A')!;
  const bc = net.edges.find((e) => e.from === 'B')!;
  const acIds = new Set(ac.segments.map((r) => r.id));
  const shared = bc.segments.filter((r) => acIds.has(r.id));
  assert.ok(shared.length > 0, 'the two edges share at least one segment');
  for (const r of shared) assert.ok(segById(net, r.id).usage >= 2, 'shared segment counts both edges');
  // spur segments stay usage 1
  assert.ok(net.segments.some((s) => s.usage === 1), 'each edge keeps its own spur');
});

/** Total length of a segment-chain's polylines. */
function chainLength(net: TrailNetwork, edge: TrailEdgeOut): number {
  let L = 0;
  for (const ref of edge.segments) {
    const pts = segById(net, ref.id).points;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return L;
}
function sharedLength(net: TrailNetwork, edge: TrailEdgeOut): number {
  let L = 0;
  for (const ref of edge.segments) {
    const seg = segById(net, ref.id);
    if (seg.usage < 2) continue;
    for (let i = 1; i < seg.points.length; i++)
      L += Math.hypot(seg.points[i]!.x - seg.points[i - 1]!.x, seg.points[i]!.y - seg.points[i - 1]!.y);
  }
  return L;
}

test('near-parallel edges MERGE onto one trunk for most of their length (no side-by-side lanes)', () => {
  // Owner feedback 2026-07-06: the map showed unnecessary side-by-side parallel trails.
  // Two edges from near-adjacent sources to a common destination must SHARE one trunk
  // for the dominant part of the run — only a short spur peels off at each source, they
  // do not run a cell apart the whole way. The reuse-discount funnel is what merges them.
  const islands = [isle('A', -800, -40, 35), isle('B', -800, 40, 35), isle('C', 0, 0, 45)];
  const net = routeTrails(
    islands,
    [
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' },
    ],
    'seed-merge',
  );
  for (const edge of net.edges) {
    const frac = sharedLength(net, edge) / chainLength(net, edge);
    assert.ok(frac > 0.6, `${edge.from}->${edge.to} shares the trunk for most of its length (${frac.toFixed(2)})`);
  }
});

// ---------- single-dock: converging approaches merge into ONE trunk (item 1, 2026-07-07) ----------

/** The point where an edge's chain lands on the given island's rim. */
function dockPointOn(net: TrailNetwork, edge: TrailEdgeOut, isl: TrailIsland): { x: number; y: number } {
  // the chain is ordered from -> to; the endpoint on `isl` is whichever rim it docks
  const firstRef = edge.segments[0]!;
  const lastRef = edge.segments[edge.segments.length - 1]!;
  const firstPts = orientedPoints(net, firstRef);
  const lastPts = orientedPoints(net, lastRef);
  const head = firstPts[0]!;
  const tail = lastPts[lastPts.length - 1]!;
  const onRim = (p: { x: number; y: number }): boolean =>
    Math.abs(Math.hypot(p.x - isl.x, p.y - isl.y) - isl.r) < 1e-6;
  if (edge.to === isl.id) {
    assert.ok(onRim(tail), `${edge.from}->${edge.to} docks on ${isl.id} rim`);
    return tail;
  }
  assert.ok(onRim(head), `${edge.from}->${edge.to} docks on ${isl.id} rim`);
  return head;
}

test('near-coincident approaches to one island share ONE dock trunk, not separate lines', () => {
  // Owner feedback 2026-07-07: trails fanned into 2+ separate lines right at the island
  // rim. Three sources left of C at near-coincident bearings must merge into ONE dock on
  // C's rim (a single thicker trunk), never three parallel approach lines.
  const C = isle('C', 0, 0, 45);
  const islands = [isle('A', -800, -50, 30), isle('B', -800, 0, 30), isle('D', -800, 50, 30), C];
  const net = routeTrails(
    islands,
    [
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' },
      { from: 'D', to: 'C' },
    ],
    'seed-single-dock',
  );
  const docks = new Set<string>();
  for (const e of net.edges) {
    const p = dockPointOn(net, e, C);
    docks.add(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
  }
  assert.equal(docks.size, 1, 'the three edges share exactly ONE dock point into C');
  // and the shared docking trunk carries all three edges — the width IS the merge signal
  assert.ok(
    net.segments.some((s) => s.usage === 3),
    'a usage-3 trunk exists where the three approaches merge',
  );
  // §5 honesty: every real edge is still drawn — nothing dropped by the merge
  assert.equal(net.edges.length, 3);
  assert.equal(net.dropped.length, 0);
});

test('opposite-side approaches keep their own dock — merging never forces a detour', () => {
  // The anti-chaining guard: an approach from the far side of the island is NOT pulled
  // into the near-side cluster. Three sources left of C merge; one to the RIGHT stays put.
  const C = isle('C', 0, 0, 45);
  const islands = [
    isle('A', -800, -50, 30),
    isle('B', -800, 0, 30),
    isle('D', -800, 50, 30),
    isle('E', 800, 0, 30),
    C,
  ];
  const net = routeTrails(
    islands,
    [
      { from: 'A', to: 'C' },
      { from: 'B', to: 'C' },
      { from: 'D', to: 'C' },
      { from: 'E', to: 'C' },
    ],
    'seed-two-dock',
  );
  const docks = new Set<string>();
  for (const e of net.edges) {
    const p = dockPointOn(net, e, C);
    docks.add(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
  }
  assert.equal(docks.size, 2, 'left trio shares one dock; the right edge keeps its own');
  // E's approach is its own spur (usage 1); the left trio still forms a usage-3 trunk
  const ec = net.edges.find((e) => e.from === 'E')!;
  const eDock = dockPointOn(net, ec, C);
  const eSeg = orientedPoints(net, ec.segments[ec.segments.length - 1]!);
  assert.ok(
    Math.hypot(eSeg[eSeg.length - 1]!.x - eDock.x, eSeg[eSeg.length - 1]!.y - eDock.y) < 1e-9,
    'E docks on its own bearing (right side)',
  );
  assert.ok(net.segments.some((s) => s.usage === 3), 'the left trio still merges into a usage-3 trunk');
  for (const edge of net.edges) assertChainContinuous(net, islands, edge);
});

test('the reuse-halo MOAT knob threads through — routes join the trunk or clear it, no 1-cell lane (item 4)', () => {
  // Owner feedback re-pushed 2026-07-07: still too many side-by-side parallel trails a
  // cell apart. The default halo is now a MOAT (reuseHaloInner > 1): the ring beside a
  // laid trail costs MORE than base, so a nearby route can't settle into a comfortable
  // parallel lane — it either shares the trunk's exact cells or stays well clear. Three
  // near-adjacent sources fanning to one destination exercise it.
  const islands = [
    isle('A', -800, -70, 32),
    isle('B', -800, 0, 32),
    isle('C', -800, 70, 32),
    isle('D', 0, 0, 45),
  ];
  const edges: TrailEdgeIn[] = [
    { from: 'A', to: 'D' },
    { from: 'B', to: 'D' },
    { from: 'C', to: 'D' },
  ];
  // dock-merge OFF here (dockMergeGap 0) so this test isolates the HALO knob: with the
  // shared single-dock (item 1) on, this near-coincident fan collapses onto one dock and
  // the halo shaping no longer changes the pinned route. Dock-merge has its own tests above.
  const moatOpts = { dockMergeGap: 0 } as const;
  const cheapOpts = { dockMergeGap: 0, reuseHaloInner: 0.4, reuseHaloOuter: 0.7, discountFloor: 0.25 } as const;
  const moat = routeTrails(islands, edges, 'seed-moat', moatOpts); // default halo = moat
  // the pre-item-4 cheap-halo shaping, as an explicit override: proves the knob is wired
  const cheap = routeTrails(islands, edges, 'seed-moat', cheapOpts);
  // the knob changes routing (not a silently-ignored param)
  assert.notDeepEqual(
    moat.segments.map((s) => s.d),
    cheap.segments.map((s) => s.d),
    'the halo shaping actually changes the routed network',
  );
  // both stay deterministic, continuous, and still MERGE (a shared trunk exists)
  for (const net of [moat, cheap]) {
    assert.deepEqual(net, routeTrails(islands, edges, 'seed-moat', net === cheap ? cheapOpts : moatOpts));
    assert.equal(net.dropped.length, 0);
    assert.equal(net.caves.length, 0, 'a moat only raises cost — it never forces a cave');
    for (const edge of net.edges) assertChainContinuous(net, islands, edge);
    assert.ok(net.segments.some((s) => s.usage >= 2), 'the fan still merges onto a shared trunk');
  }
});

// ---------- caves only when forced ----------

test('a walled-in edge routes under the wall: hidden segments + cave portal pair', () => {
  const islands: TrailIsland[] = [isle('A', 0, 0, 30), isle('B', 600, 0, 30)];
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k;
    islands.push(isle(`ring${k}`, 150 * Math.cos(a), 150 * Math.sin(a), 60));
  }
  const net = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-4');
  const edge = net.edges[0]!;
  const hiddenRefs = edge.segments.filter((r) => segById(net, r.id).hidden);
  assert.ok(hiddenRefs.length > 0, 'the forced route has an under-island ghost run');
  assert.ok(net.caves.length >= 2, 'entry + exit portals on the blocking island');
  for (const cave of net.caves) {
    assert.match(cave.islandId, /^ring/, 'portals sit on wall islands, never endpoints');
    assert.deepEqual(cave.edgeIds, ['A->B']);
    assert.equal(cave.width, trailFillWidth(1));
    const isl = islands.find((i) => i.id === cave.islandId)!;
    const rim = Math.hypot(cave.x - isl.x, cave.y - isl.y);
    assert.ok(Math.abs(rim - isl.r) < 1.5, `portal sits on the rim (${rim} vs r ${isl.r})`);
    // bearing is the outward normal at the portal point
    const bx = Math.cos(cave.bearing);
    const by = Math.sin(cave.bearing);
    assert.ok(Math.hypot(isl.x + bx * rim - cave.x, isl.y + by * rim - cave.y) < 1e-6);
  }
  // the surface/under split is geometric and edge-independent: a VISIBLE segment
  // never runs inside ANY island's r — own endpoints included (rim contact only),
  // so no surface trail can cross an island another edge caves under
  for (const seg of net.segments.filter((s) => !s.hidden)) {
    for (const p of seg.points) {
      for (const isl of islands) {
        const d = Math.hypot(p.x - isl.x, p.y - isl.y);
        assert.ok(d >= isl.r - 1e-6, `visible point (${p.x},${p.y}) not inside ${isl.id}`);
      }
    }
  }
  assertChainContinuous(net, islands, edge);
});

test('an unobstructed edge produces zero caves and zero hidden segments', () => {
  const islands = [isle('A', 0, 0, 40), isle('B', 400, 0, 40)];
  const net = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-5');
  assert.equal(net.caves.length, 0);
  assert.ok(net.segments.every((s) => !s.hidden));
  assert.equal(net.edges.length, 1);
});

test('a blocked dock cell re-bearings around the blocker instead of flipping into cave mode', () => {
  // A long thin wall a route AROUND exists for — pass 1 must keep finding it.
  const islands: TrailIsland[] = [isle('A', 0, 0, 40), isle('B', 1200, 0, 40)];
  for (let k = -66; k <= 66; k++) islands.push(isle(`w${k}`, 600, k * 30, 20));
  const open = routeTrails(islands, [{ from: 'A', to: 'B' }], 'seed-dock');
  assert.equal(open.caves.length, 0, 'a route around the wall exists');
  // A decor islet whose inflated ring covers A's chord-bearing dock cell must not
  // abort pass 1 and tunnel the wall the open route avoids (§1: caves only when
  // FORCED, never because the doorstep was covered).
  const withIslet = [...islands, isle('X', 70, 0, 12)];
  const net = routeTrails(withIslet, [{ from: 'A', to: 'B' }], 'seed-dock');
  assert.equal(net.caves.length, 0, 'the dock scans to an unblocked bearing — no cave');
  assert.ok(net.segments.every((s) => !s.hidden), 'no hidden run either');
  assert.equal(net.dropped.length, 0);
  assertChainContinuous(net, withIslet, net.edges[0]!);
});

// ---------- chain continuity ----------

test('every edge chain is continuous from the from-rim to the to-rim', () => {
  const islands = [
    isle('A', -800, -60, 35),
    isle('B', -800, 60, 35),
    isle('C', 0, 0, 45),
    isle('O', -400, 0, 50),
  ];
  const edges: TrailEdgeIn[] = [
    { from: 'A', to: 'C' },
    { from: 'B', to: 'C' },
    { from: 'A', to: 'B' },
    { from: 'C', to: 'O' },
  ];
  const net = routeTrails(islands, edges, 'seed-6');
  assert.equal(net.edges.length, edges.length);
  for (const edge of net.edges) assertChainContinuous(net, islands, edge);
});

// ---------- canonical order: input order must not matter ----------

test('shuffling the input edge array yields the same network', () => {
  const islands = [
    isle('A', -800, -60, 35),
    isle('B', -800, 60, 35),
    isle('C', 0, 0, 45),
    isle('O', -400, 0, 50),
  ];
  const edges: TrailEdgeIn[] = [
    { from: 'A', to: 'C' },
    { from: 'B', to: 'C' },
    { from: 'A', to: 'B' },
    { from: 'C', to: 'O' },
  ];
  const shuffled = [edges[2]!, edges[3]!, edges[0]!, edges[1]!];
  assert.deepEqual(routeTrails(islands, edges, 'seed-7'), routeTrails(islands, shuffled, 'seed-7'));
});

// ---------- degenerate inputs ----------

test('unknown endpoints, self-edges and duplicates are dropped; empty input is empty', () => {
  const islands = [isle('A', 0, 0, 40), isle('B', 400, 0, 40)];
  const net = routeTrails(
    islands,
    [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'B' }, // duplicate
      { from: 'A', to: 'A' }, // self
      { from: 'A', to: 'ghost' }, // unknown island
    ],
    'seed-8',
  );
  assert.equal(net.edges.length, 1);
  // §5 honesty: the unknown-endpoint edge is OBSERVABLE on the network, never a
  // silent swallow; self/duplicate folds are not drops (nothing distinct to draw)
  assert.deepEqual(net.dropped, [{ from: 'A', to: 'ghost' }]);
  assert.deepEqual(routeTrails([], [{ from: 'A', to: 'B' }], 'seed-8'), {
    segments: [],
    edges: [],
    caves: [],
    dropped: [{ from: 'A', to: 'B' }],
  });
  assert.deepEqual(routeTrails(islands, [], 'seed-8'), {
    segments: [],
    edges: [],
    caves: [],
    dropped: [],
  });
});

test("island ids containing '->' never fold two distinct edges into one", () => {
  // both edges stringify to 'a->b->c'; the internal key must still tell them apart
  const islands = [
    isle('a->b', 0, 0, 30),
    isle('c', 400, 0, 30),
    isle('a', 0, 300, 30),
    isle('b->c', 400, 300, 30),
  ];
  const net = routeTrails(
    islands,
    [
      { from: 'a->b', to: 'c' },
      { from: 'a', to: 'b->c' },
    ],
    'seed-arrow',
  );
  assert.equal(net.edges.length, 2, 'no false duplicate-key drop');
  assert.equal(net.dropped.length, 0);
});

// ---------- the width rule ----------

test('trailFillWidth is 1.2 + 1.8*sqrt(n): a thin spur, a legible thin→thick trunk ladder', () => {
  // Owner feedback 2026-07-07: thinner overall so WIDTH ALONE reads the merge signal.
  assert.equal(trailFillWidth(1), 3.0); // a usage-1 spur is a thin line
  assert.equal(trailFillWidth(4), 4.8); // a shared trunk is clearly thicker
  assert.equal(trailFillWidth(0), 1.2);
  // strictly increasing with usage, and the spur is genuinely THINNER than the
  // pre-2026-07-07 width (4.5) so the retune actually slimmed the base line
  assert.ok(trailFillWidth(1) < 4.5, 'spur is thinner than before');
  assert.ok(trailFillWidth(2) > trailFillWidth(1), 'a shared trunk steps up');
  assert.ok(trailFillWidth(4) > trailFillWidth(2), 'more sharing, thicker still');
});

// ---------- perf sanity ----------

test('30 islands / 60 edges routes in under 2s', () => {
  const islands: TrailIsland[] = [];
  for (let i = 0; i < 30; i++) {
    const col = i % 6;
    const row = (i / 6) | 0;
    islands.push(
      isle(
        `i${i}`,
        col * 300 + 80 * (rand01(hash(`px${i}`)) - 0.5),
        row * 300 + 80 * (rand01(hash(`py${i}`)) - 0.5),
        25 + 20 * rand01(hash(`pr${i}`)),
      ),
    );
  }
  const edges: TrailEdgeIn[] = [];
  for (let k = 0; k < 60; k++) {
    const from = k % 30;
    const to = (from + 1 + (k % 7)) % 30;
    edges.push({ from: `i${from}`, to: `i${to}` });
  }
  const t0 = performance.now();
  const net = routeTrails(islands, edges, 'seed-perf');
  const elapsed = performance.now() - t0;
  assert.ok(net.edges.length > 0);
  assert.ok(elapsed < 2000, `routed in ${elapsed.toFixed(0)}ms`);
  // segment ids are unique even under 32-bit hash collisions (the -N extension)
  assert.equal(new Set(net.segments.map((s) => s.id)).size, net.segments.length);
  for (const edge of net.edges) assertChainContinuous(net, islands, edge);
});
