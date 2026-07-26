// laneLayout — Stage-1 red-green of the two-lane selection geometry. The LOOK is
// owner-attested (ADR-0070 stage 2) and is never asserted here; what IS asserted is the set
// of properties the treatment is only correct because of, each of which was a reported
// visual fault before it was pinned:
//
//   • one lane per ROUTE, running island to island — not one per segment (the draw-on used
//     to restart at every junction because it was per segment)
//   • both directions take the SAME hand, which is what puts them on opposite sides of a
//     trunk that carries both
//   • the hand is one decision for the whole selection, taken from the net turn, so lanes
//     land on the INSIDE of the corners they turn rather than swinging wide
//   • a lane pair always fits inside its road, so the merge stays honest (ADR-0242's rim)

import { describe, it, expect } from 'vitest';
import type { TrailNetwork, TrailSegment } from '@storytree/forest-world';
import { trailFillWidth } from '@storytree/forest-world';
import { neighbourHighlightPlan } from './neighbourHighlight.js';
import { laneLayout, laneGeometry, netTurnOf } from './laneLayout.js';

/** A straight segment from a to b, sampled at its two ends (densify fills the rest). */
const seg = (
  id: string,
  a: [number, number],
  b: [number, number],
  usage = 1,
): TrailSegment => ({
  id,
  d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
  usage,
  hidden: false,
});

/**
 * The crux shape, straight out of the mock round. An edge `from → to` means "`to` depends
 * on `from`", so the chain runs dependency → dependent.
 *
 *   library ──sA──▶ J ──sB──▶ orchestrator        (orchestrator stands on library)
 *   orchestrator ──sB──▶ J ──sM──▶ agent          (agent stands on orchestrator)
 *
 * sB therefore carries an UPSTREAM and a DOWNSTREAM route at once — the trunk the whole
 * treatment exists to answer. sA runs east, sB turns north-east, sM heads south.
 */
function network(): TrailNetwork {
  return {
    segments: [
      seg('sA', [0, 100], [100, 100], 2),
      seg('sB', [100, 100], [160, 40], 4),
      seg('sM', [100, 100], [100, 220], 2),
    ],
    edges: [
      // orchestrator stands on library: dependency library → dependent orchestrator
      {
        from: 'library',
        to: 'orchestrator',
        segments: [
          { id: 'sA', reversed: false },
          { id: 'sB', reversed: false },
        ],
      },
      // agent stands on orchestrator: dependency orchestrator → dependent agent.
      // Travelling orchestrator → agent runs BACK down sB, hence reversed.
      {
        from: 'orchestrator',
        to: 'agent',
        segments: [
          { id: 'sB', reversed: true },
          { id: 'sM', reversed: false },
        ],
      },
    ],
    caves: [],
    dropped: [],
  };
}

const layoutFor = (id: string, opts = {}) => {
  const net = network();
  return laneLayout(net, neighbourHighlightPlan(net, id), opts);
};

describe('neighbourHighlightPlan routes', () => {
  it('keeps each incident edge as an ordered route in DEPENDENCY order', () => {
    const net = network();
    const plan = neighbourHighlightPlan(net, 'orchestrator')!;
    expect(plan.routes).toHaveLength(2);

    const up = plan.routes.find((r) => r.dir === 'up')!;
    expect(up.other).toBe('library');
    // dependency → dependent: library, then the trunk into orchestrator
    expect(up.steps.map((s) => s.id)).toEqual(['sA', 'sB']);
    expect(up.steps.map((s) => s.forward)).toEqual([true, true]);

    const down = plan.routes.find((r) => r.dir === 'down')!;
    expect(down.other).toBe('agent');
    // leaves orchestrator back down the trunk, so the first step runs AGAINST its drawn path
    expect(down.steps.map((s) => s.id)).toEqual(['sB', 'sM']);
    expect(down.steps.map((s) => s.forward)).toEqual([false, true]);
  });

  it('is empty for a story with no incident edges, and null with nothing selected', () => {
    expect(neighbourHighlightPlan(network(), 'nobody')!.routes).toEqual([]);
    expect(neighbourHighlightPlan(network(), null)).toBeNull();
  });
});

describe('laneLayout', () => {
  it('emits ONE lane per route, island to island — never one per segment', () => {
    const out = layoutFor('orchestrator')!;
    expect(out.lanes).toHaveLength(2);
    expect(out.lanes.map((l) => l.key).sort()).toEqual(['down:agent', 'up:library']);
    // each lane spans its whole route, so it is longer than either segment alone
    for (const lane of out.lanes) expect(lane.length).toBeGreaterThan(100);
  });

  it('puts the two directions on OPPOSITE sides of the trunk they share', () => {
    const out = layoutFor('orchestrator')!;
    const up = out.lanes.find((l) => l.dir === 'up')!;
    const down = out.lanes.find((l) => l.dir === 'down')!;
    // sB runs (100,100) → (160,40). Sample each lane where it crosses that segment and
    // measure which side of the segment's own centreline it sits.
    const sideOf = (lane: { d: string }) => {
      const pts = parse(lane.d).filter((p) => p.x > 105 && p.x < 155);
      expect(pts.length).toBeGreaterThan(0);
      const p = pts[Math.floor(pts.length / 2)]!;
      // cross product of the segment direction with (point - segment start)
      const dx = 60;
      const dy = -60;
      return Math.sign(dx * (p.y - 100) - dy * (p.x - 100));
    };
    const a = sideOf(up);
    const b = sideOf(down);
    expect(a).not.toBe(0);
    expect(b).not.toBe(0);
    expect(a).toBe(-b);
  });

  it('takes ONE hand for the whole selection, so a forced hand flips both lanes together', () => {
    const left = layoutFor('orchestrator', { hand: 'left' })!;
    const right = layoutFor('orchestrator', { hand: 'right' })!;
    expect(left.hand).toBe(-1);
    expect(right.hand).toBe(1);
    // every lane moves when the hand does — none of them is decided independently
    for (const lane of left.lanes) {
      const other = right.lanes.find((l) => l.key === lane.key)!;
      expect(other.d).not.toBe(lane.d);
    }
  });

  it('auto picks the hand on the INSIDE of the corners the routes actually turn', () => {
    const out = layoutFor('orchestrator')!;
    // this shape turns net anticlockwise on screen, so the inside is the left hand
    expect(out.netTurn).toBeLessThan(0);
    expect(out.hand).toBe(-1);
    expect(out.hand).toBe(layoutFor('orchestrator', { hand: 'left' })!.hand);
  });

  it('keeps a lane pair inside its road, so a shared trunk keeps its rim', () => {
    for (const usage of [1, 2, 3, 6, 12, 30]) {
      const road = trailFillWidth(usage);
      const two = laneGeometry(usage, true);
      const one = laneGeometry(usage, false);
      // the pair — both lanes plus the gap between them — never exceeds the road's share
      expect(two.offset * 2 + two.width).toBeLessThanOrEqual(road * 0.8 + 1e-9);
      // a single lane likewise, and it never outgrows one edge's worth of road
      expect(one.offset * 2 + one.width).toBeLessThanOrEqual(road * 0.8 + 1e-9);
      expect(one.width).toBeLessThanOrEqual(trailFillWidth(1) + 1e-9);
      // and there is always un-lit road left either side
      expect(two.offset * 2 + two.width).toBeLessThan(road);
    }
  });

  it('centres a lone lane on a thin road and pushes it aside only on a fat trunk', () => {
    expect(laneGeometry(1, false).offset).toBe(0); // a spur its lane already fills
    expect(laneGeometry(30, false).offset).toBeGreaterThan(1);
  });

  it('smooths the offset across a junction instead of stepping it', () => {
    // sA (usage 2) meets sB (usage 4): the allowances differ, so an unsmoothed layout would
    // jump sideways at (100,100). Assert the lane's lateral movement stays gradual.
    const up = layoutFor('orchestrator')!.lanes.find((l) => l.dir === 'up')!;
    const pts = parse(up.d);
    let biggest = 0;
    for (let i = 1; i < pts.length; i++) {
      biggest = Math.max(biggest, Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
    }
    // no single step may exceed the resample spacing by much — a sideways jump would blow this
    expect(biggest).toBeLessThan(4);
  });

  it('bends lanes out around a roundabout island when asked, and adds none otherwise', () => {
    expect(layoutFor('orchestrator')!.hubs).toEqual([]);
    const round = layoutFor('orchestrator', { roundabouts: true })!;
    expect(round.hubs).toHaveLength(1);
    expect(round.hubs[0]!.x).toBeCloseTo(100, 1);
    expect(round.hubs[0]!.y).toBeCloseTo(100, 1);
    // No lane point may sit inside the island it is supposed to bend around. Read back
    // through the path's own 2-dp rounding, which can pull a point up to √2·0.005 inward.
    const hub = round.hubs[0]!;
    const quantisation = Math.SQRT2 * 0.005;
    for (const lane of round.lanes) {
      for (const p of parse(lane.d)) {
        expect(Math.hypot(p.x - hub.x, p.y - hub.y)).toBeGreaterThanOrEqual(hub.r - quantisation);
      }
    }
  });

  it('puts a roundabout only where roads FORK, never at a mid-road segment cut', () => {
    // The router splits a road wherever a chain joins or leaves it, so a route changes
    // segment far more often than it meets a junction. On the live forest that difference is
    // 39 islands versus a handful: without this rule the map scatters furniture down
    // straight roads — the same merge artefact the layout exists to hide.
    //
    // Here sA|sB|sM all meet at (100,100) — three ends, a real fork. Add a fourth segment
    // that merely CONTINUES sM southward, and its joint must get no island.
    const net = network();
    net.segments.push(seg('sX', [100, 220], [100, 320], 2));
    net.edges = net.edges.map((e) =>
      e.to === 'agent'
        ? { ...e, segments: [...e.segments, { id: 'sX', reversed: false }] }
        : e,
    );
    const out = laneLayout(net, neighbourHighlightPlan(net, 'orchestrator'), {
      roundabouts: true,
    })!;
    // the fork is hubbed; the two-segment continuation at (100,220) is not
    expect(out.hubs).toHaveLength(1);
    expect(out.hubs[0]!.x).toBeCloseTo(100, 1);
    expect(out.hubs[0]!.y).toBeCloseTo(100, 1);
  });

  it('returns null when there is nothing to draw', () => {
    expect(laneLayout(network(), neighbourHighlightPlan(network(), null))).toBeNull();
    expect(laneLayout(null, neighbourHighlightPlan(network(), 'orchestrator'))).toBeNull();
    // a story with no incident edges yields a plan, but no lanes to lay out
    expect(laneLayout(network(), neighbourHighlightPlan(network(), 'nobody'))).toBeNull();
  });

  it('netTurnOf signs a turn by which way it bends on screen', () => {
    // y grows downward, so this right-then-down bend is clockwise = positive
    expect(netTurnOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeGreaterThan(0);
    expect(netTurnOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 }])).toBeLessThan(0);
    expect(netTurnOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBeCloseTo(0, 9);
  });
});

/** Read a polyline path back into points. */
function parse(d: string): { x: number; y: number }[] {
  return d
    .split(/(?=[ML])/)
    .map((c) => c.trim().slice(1).trim().split(/\s+/).map(Number))
    .filter((n) => n.length === 2 && n.every((v) => Number.isFinite(v)))
    .map(([x, y]) => ({ x: x!, y: y! }));
}
