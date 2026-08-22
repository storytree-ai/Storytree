// laneLayout — the PURE geometry behind the two-lane selection highlight: given the routed
// trail network and the one-hop plan, where each relation's lane runs.
//
// Why this exists as its own pure module, and why it works on ROUTES rather than segments:
// a segment is an artefact of the routing merge (ADR-0169 pulls later edges onto existing
// roads), invisible to whoever reads the map. Anything decided per segment — how far off
// centre a lane sits, which side of the road it rides, when it starts drawing — therefore
// surfaces as an artefact exactly at a junction, where a reader sees a lane step sideways or
// light up out of nowhere. Both faults were reported from the mock round and both had that
// one cause. So a route is laid out ONCE, end to end, as a single polyline.
//
// Three decisions live here, and all three are taken for the whole picture at SELECTION time
// rather than per segment:
//
//   1. THE HAND. A lane rides one side of its own direction of travel. Upstream and
//      downstream must take the SAME hand — that is what puts them on opposite sides of a
//      trunk carrying both — so there is exactly ONE bit to choose for the entire selection.
//      Keeping a fixed hand is right on a straight road and wrong at a corner, where it puts
//      the lane on the OUTSIDE of every turn and reads as swinging across the road. So the
//      bit is chosen from the shape of the lit routes: whichever hand lands on the INSIDE of
//      the corners they actually turn.
//   2. THE OFFSET. How far off centre depends on how wide each road is, so it varies along a
//      route. Applied per segment that is a step; smoothed along the route it is a widening.
//   3. THE ROUNDABOUT. Optional: a junction island a lane bends around rather than cuts
//      through.
//
// Pure and deterministic — no DOM, no time, no store. It reads `TrailSegment.points` (the
// smoothed polyline the router already emits) so it never has to measure a rendered path,
// which is what keeps it unit-testable and browser-safe.

import { trailFillWidth, type TrailNetwork, type TrailSegment } from '@storytree/forest-world';
import type { NeighbourHighlightPlan, NeighbourRoute } from './neighbourHighlight.js';

/** A point in world units. */
export interface LanePoint {
  x: number;
  y: number;
}

/** One relation's lane: a single path from island to island. */
export interface Lane {
  /** Stable key — direction plus the neighbour at the far end. */
  key: string;
  dir: 'up' | 'down';
  /** The neighbour island this route runs to (`down`) or from (`up`). */
  other: string;
  /** The lane centreline as an SVG polyline path. */
  d: string;
  /** Stroke width — the narrowest its route's roads allow, so it never outgrows one. */
  width: number;
  /** Arc length in world units, for scaling a draw-on so every lane travels at one speed. */
  length: number;
}

/** A roundabout island: a junction a lane bends around instead of cutting through. */
export interface LaneHub {
  x: number;
  y: number;
  /** The radius lanes are pushed out to. */
  r: number;
}

export interface LaneLayout {
  /** +1 = lanes ride the right of their travel, -1 = the left. */
  hand: 1 | -1;
  /** Net signed turn of the lit routes, in radians (positive = clockwise on screen).
   *  What `hand: 'auto'` decided from, surfaced so the decision is inspectable. */
  netTurn: number;
  lanes: readonly Lane[];
  hubs: readonly LaneHub[];
}

export interface LaneLayoutOptions {
  /** `auto` (default) picks the hand from {@link LaneLayout.netTurn}; the others force it. */
  hand?: 'auto' | 'left' | 'right';
  /** Bend lanes around a junction island where a route changes segment. Default false. */
  roundabouts?: boolean;
  /** Resample spacing in world units. Smaller = smoother and more points. Default 2. */
  step?: number;
}

/** The clear road left between the two lanes of a two-way trunk.
 *  Deliberately generous: at the zoom the map is read at, a sub-unit gap is sub-pixel and the
 *  two hues antialias into a muddy seam instead of reading as two lanes. */
const LANE_GAP = 1.2;
/** A lane never narrower than this, however thin its road. */
const MIN_LANE_W = 0.9;
/** The share of a road a lane (or a lane pair) may occupy — the rest is the RIM that keeps a
 *  merged trunk honest, so a road shared with strangers never reads as exclusively yours. */
const ROAD_SHARE = 0.8;
/** Moving-average half-window for the offset smoothing, in world units of arc length. */
const SMOOTH_SPAN = 16;

export interface LaneGeometryResult { width: number; offset: number }

/**
 * How wide one lane may be on this segment, and how far off the centreline it may sit.
 *
 * `twoWay` — this segment carries an upstream AND a downstream route at once, so it must
 * hold two lanes plus the gap plus the rim, and each lane shrinks only when the road cannot
 * afford a full one. A one-way segment gets a full lane; its offset then falls out of what
 * is left, which means a thin road (where a lane already fills it) centres its lane and only
 * a fat trunk pushes it to one side.
 */
export function laneGeometry(usage: number, twoWay: boolean): LaneGeometryResult {
  const road = trailFillWidth(usage);
  const budget = road * ROAD_SHARE;
  const full = Math.min(trailFillWidth(1), budget);
  const width = twoWay ? Math.max(MIN_LANE_W, Math.min(full, (budget - LANE_GAP) / 2)) : full;
  const maxOffset = Math.max(0, (budget - width) / 2);
  return { width, offset: Math.min((width + LANE_GAP) / 2, maxOffset) };
}

/** Resample a polyline to roughly uniform spacing so smoothing windows are length-based. */
function densify(points: readonly LanePoint[], step: number): LanePoint[] {
  const out: LanePoint[] = [];
  if (points.length === 0) return out;
  const first = points[0]!;
  out.push({ x: first.x, y: first.y });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

/**
 * Signed total turn of a polyline in radians. Positive = turns clockwise on SCREEN (y down),
 * which is a right turn for anyone travelling it — so the inside of those corners is the
 * right hand.
 */
export function netTurnOf(points: readonly LanePoint[]): number {
  let sum = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const r = points[i + 1]!;
    const ax = q.x - p.x;
    const ay = q.y - p.y;
    const bx = r.x - q.x;
    const by = r.y - q.y;
    if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) continue;
    sum += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  return sum;
}

/** A route's centreline: each segment's polyline, walked in travel order and concatenated.
 *  `owner[i]` is the segment the i-th point came from, so per-point geometry is a lookup
 *  rather than a re-walk. */
function routeCentre(
  route: NeighbourRoute,
  byId: ReadonlyMap<string, TrailSegment>,
  step: number,
) {
  const pts: LanePoint[] = [];
  const owner: string[] = [];
  for (const s of route.steps) {
    const seg = byId.get(s.id);
    if (!seg || seg.points.length < 2) continue;
    const dense = densify(seg.points, step);
    const walk = s.forward ? dense : dense.slice().reverse();
    // drop the duplicated joint so the concatenated line has no zero-length step
    const from = pts.length > 0 ? 1 : 0;
    for (let i = from; i < walk.length; i++) {
      pts.push(walk[i]!);
      owner.push(s.id);
    }
  }
  return { pts, owner };
}

/** Arc length of a polyline. */
function lengthOf(pts: readonly LanePoint[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return n;
}

/** Render a polyline as an SVG path, rounded so the DOM string stays short and stable. */
function toPath(pts: readonly LanePoint[]): string {
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i]!.x.toFixed(2)} ${pts[i]!.y.toFixed(2)}`;
  return d;
}

/**
 * Lay out every lit route's lane.
 *
 * Returns null when there is nothing selected, no network, or no incident edge — the caller
 * then draws no lanes at all, byte-identical to an unselected map.
 */
export function laneLayout(
  network: TrailNetwork | null | undefined,
  plan: NeighbourHighlightPlan | null | undefined,
  options: LaneLayoutOptions = {},
): LaneLayout | null {
  if (!network || !plan || plan.routes.length === 0) return null;
  const step = options.step && options.step > 0 ? options.step : 2;
  const byId = new Map<string, TrailSegment>(network.segments.map((s) => [s.id, s]));

  // Which segments carry BOTH directions — the trunks that have to hold two lanes.
  const dirsBySeg = new Map<string, { up: boolean; down: boolean }>();
  for (const route of plan.routes) {
    for (const s of route.steps) {
      const e = dirsBySeg.get(s.id) ?? { up: false, down: false };
      if (route.dir === 'up') e.up = true;
      else e.down = true;
      dirsBySeg.set(s.id, e);
    }
  }

  const centres = plan.routes.map((route) => ({ route, ...routeCentre(route, byId, step) }));

  // ── decision 1: the hand, for the whole picture, once ──
  const netTurn = centres.reduce((sum, c) => sum + netTurnOf(c.pts), 0);
  const hand: 1 | -1 =
    options.hand === 'left' ? -1 : options.hand === 'right' ? 1 : netTurn > 0 ? 1 : -1;

  // ── the roundabout islands ──
  // ONLY where roads genuinely FORK. A route changes segment far more often than it meets a
  // junction: the router splits a road wherever a chain joins or leaves it, so most segment
  // boundaries are mid-road cuts with exactly two segments continuing through them. Putting
  // an island on every one of those scatters furniture down a straight road — the same
  // merge artefact this module exists to hide, in a new costume. A real fork has THREE or
  // more segment ends meeting, and that is the only place a roundabout means anything.
  const hubs: LaneHub[] = [];
  if (options.roundabouts) {
    const degree = new Map<string, number>();
    for (const s of network.segments) {
      if (s.points.length < 2) continue;
      for (const p of [s.points[0]!, s.points[s.points.length - 1]!]) {
        const k = endKey(p);
        degree.set(k, (degree.get(k) ?? 0) + 1);
      }
    }
    const seen = new Set<string>();
    for (const { route } of centres) {
      for (let i = 1; i < route.steps.length; i++) {
        const a = byId.get(route.steps[i - 1]!.id);
        const b = byId.get(route.steps[i]!.id);
        const j = sharedEnd(a, b);
        if (!j || !a || !b) continue;
        const key = endKey(j);
        if (seen.has(key)) continue;
        if ((degree.get(key) ?? 0) < 3) continue; // a mid-road cut, not a fork
        seen.add(key);
        const wide = Math.max(trailFillWidth(a.usage), trailFillWidth(b.usage));
        hubs.push({ x: j.x, y: j.y, r: Math.max(4, wide * 0.7) });
      }
    }
  }

  const lanes: Lane[] = [];
  for (const { route, pts, owner } of centres) {
    if (pts.length < 2) continue;

    // ── decision 2: the offset, laid out along the WHOLE route and then smoothed ──
    let width = Infinity;
    const target: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const seg = byId.get(owner[i]!);
      const dirs = dirsBySeg.get(owner[i]!);
      const g = laneGeometry(seg?.usage ?? 1, !!dirs && dirs.up && dirs.down);
      width = Math.min(width, g.width);
      target.push(g.offset * hand);
    }
    const win = Math.max(1, Math.round(SMOOTH_SPAN / step));
    const offset: number[] = [];
    for (let i = 0; i < target.length; i++) {
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(target.length - 1, i + win); k++) {
        sum += target[k]!;
        n++;
      }
      offset.push(sum / n);
    }

    const out: LanePoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[Math.max(0, i - 1)]!;
      const q = pts[Math.min(pts.length - 1, i + 1)]!;
      const tx = q.x - p.x;
      const ty = q.y - p.y;
      const len = Math.hypot(tx, ty) || 1;
      // (-ty, tx) normalised is the RIGHT of travel with screen y pointing down
      out.push({ x: pts[i]!.x - (ty / len) * offset[i]!, y: pts[i]!.y + (tx / len) * offset[i]! });
    }

    // ── decision 3: bend the lane out around any roundabout island it would cut through ──
    for (const hub of hubs) {
      for (const pt of out) {
        const dx = pt.x - hub.x;
        const dy = pt.y - hub.y;
        const d = Math.hypot(dx, dy);
        if (d < hub.r && d > 1e-6) {
          pt.x = hub.x + (dx / d) * hub.r;
          pt.y = hub.y + (dy / d) * hub.r;
        }
      }
    }

    lanes.push({
      key: `${route.dir}:${route.other}`,
      dir: route.dir,
      other: route.other,
      d: toPath(out),
      width: Number.isFinite(width) ? width : trailFillWidth(1),
      length: lengthOf(out),
    });
  }

  return { hand, netTurn, lanes, hubs };
}

/** Quantised endpoint key, so two segments that meet are counted at ONE junction. */
function endKey(p: LanePoint): string {
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}

/** The point two segments meet at, or null when they do not share an endpoint. */
function sharedEnd(a: TrailSegment | undefined, b: TrailSegment | undefined): LanePoint | null {
  if (!a || !b || a.points.length === 0 || b.points.length === 0) return null;
  const ends = [a.points[0]!, a.points[a.points.length - 1]!];
  const other = [b.points[0]!, b.points[b.points.length - 1]!];
  for (const p of ends) {
    for (const q of other) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < 0.75) return { x: p.x, y: p.y };
    }
  }
  return null;
}
