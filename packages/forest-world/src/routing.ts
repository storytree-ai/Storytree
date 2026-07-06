// Deterministic cost-grid trail router (ADR-0169 §1). Every story edge routes
// over ONE shared scalar cost field on a coarse world grid: island discs
// hard-blocked (inflated by a clearance margin), a soft falloff ring beyond it,
// seeded value noise, a turn penalty — searched by 8-connected A* with stable
// tie-breaking (f, then g, then cell index). Edges route in canonical
// longest-chord-first order; after each route the traversed cells earn a reuse
// discount so later routes snap onto existing trails and trunks EMERGE, the way
// footpaths form in a field. An edge that cannot route with islands blocked
// re-routes with interiors passable at high cost — the under-island runs come
// out hidden, with cave portals emitted at the rim crossings. The output is a
// shared-SEGMENT network (a trunk is one segment rendered once; each edge keeps
// its ordered chain of segment refs) smoothed to centripetal Catmull-Rom
// cubics. A pure function of (islands, edges, seed): hash/rand01 only, no
// Math.random, no clock — same input, byte-identical output.

import type { Pt } from './hex.js';
import { HEX_R } from './hex.js';
import { hash, rand01 } from './rng.js';

export interface TrailIsland {
  id: string;
  x: number; // world px
  y: number;
  r: number; // obstacle disc radius
}

export interface TrailEdgeIn {
  from: string;
  to: string;
  title?: string;
}

export interface TrailTuning {
  cellSize: number; // grid cell in world px
  clearance: number; // hard inflation margin beyond island r
  falloff: number; // soft-penalty band beyond clearance
  falloffCost: number; // peak soft penalty at the clearance boundary
  noiseAmp: number; // cost-noise amplitude
  turnPenalty: number; // per-direction-change cost
  reuseDiscount: number; // multiplier applied to routed cells
  discountFloor: number; // min cell cost after discounts
  interiorCost: number; // island-interior cost for the cave fallback pass
  meanderAmp: number; // perpendicular displacement amplitude (MUST stay < clearance)
  meanderWavelength: number; // arc-length period of the meander noise
}

export interface TrailSegment {
  id: string; // stable content-derived id (hash of its cell run, collision-extended)
  d: string; // SVG path, M + cubic C segments, r2-rounded coords
  points: readonly { x: number; y: number }[]; // the smoothed polyline d was built from
  usage: number; // distinct edges routed through this segment
  hidden: boolean; // true = under-island ghost run
}

export interface TrailCave {
  islandId: string;
  x: number; // portal point on the island rim
  y: number;
  bearing: number; // radians, outward normal from island centre
  width: number; // trail fill width at the portal (from the usage rule)
  edgeIds: string[]; // "from->to" keys passing through this portal
}

export interface TrailEdgeOut {
  from: string;
  to: string;
  title?: string;
  segments: readonly { id: string; reversed: boolean }[]; // ordered chain from -> to
}

export interface TrailNetwork {
  segments: TrailSegment[];
  edges: TrailEdgeOut[];
  caves: TrailCave[];
  /** Edges that could not be routed — unknown endpoint island (a filtered-out
   *  fold) or an unroutable grid. The §5 honesty signal: an edge this network
   *  does not draw is at least observable. Self-edges and exact duplicates are
   *  not drops (nothing distinct to draw). Sorted by from, then to; deduped. */
  dropped: { from: string; to: string }[];
}

/** The ONE width rule every surface shares: fill width from segment usage. */
export function trailFillWidth(usage: number): number {
  return 2 + 2.5 * Math.sqrt(Math.max(0, usage));
}

function resolveTuning(o?: Partial<TrailTuning>): TrailTuning {
  const clearance = o?.clearance ?? 0.6 * HEX_R;
  return {
    cellSize: o?.cellSize ?? HEX_R / 2,
    clearance,
    falloff: o?.falloff ?? 2.5 * HEX_R,
    falloffCost: o?.falloffCost ?? 6,
    noiseAmp: o?.noiseAmp ?? 0.35,
    turnPenalty: o?.turnPenalty ?? 0.35,
    reuseDiscount: o?.reuseDiscount ?? 0.4,
    discountFloor: o?.discountFloor ?? 0.25,
    interiorCost: o?.interiorCost ?? 40,
    // derived from the RESOLVED clearance so the amp<clearance invariant holds
    // under a clearance override too; an EXPLICIT amp is clamped below clearance
    // for the same reason — meander must never be able to push a path into an
    // island, whatever the caller asks for.
    meanderAmp: Math.min(o?.meanderAmp ?? 0.45 * clearance, 0.95 * clearance),
    meanderWavelength: o?.meanderWavelength ?? 4 * HEX_R,
  };
}

// ---------- cost grid ----------

interface Grid {
  ox: number;
  oy: number;
  cs: number;
  cols: number;
  rows: number;
  cost: Float64Array; // soft cost (base + falloff + noise); the reuse discount mutates it
  blockA: Int32Array; // nearest hard-blocking island index (within r + clearance), -1 = none
  blockB: Int32Array; // second-nearest hard-blocking island index
  blockC: Int32Array; // third-nearest — endpoint masking needs THREE: an edge's own two
  // islands can consume two slots in a pinch, so any foreign blocker must still hold one
  interior: Int32Array; // island index whose r covers the cell centre, -1 = none
}

// Hard blocking is carried as island INDICES (blockA/B/C), not Infinity in the
// cost array: the per-edge endpoint mask and the cave fallback both re-interpret
// the same field per edge without a rebuild, and the reuse discount stays finite.
function buildGrid(islands: readonly TrailIsland[], seed: string, t: TrailTuning): Grid {
  const margin = t.clearance + t.falloff + 2 * t.cellSize;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const isl of islands) {
    minX = Math.min(minX, isl.x - isl.r);
    minY = Math.min(minY, isl.y - isl.r);
    maxX = Math.max(maxX, isl.x + isl.r);
    maxY = Math.max(maxY, isl.y + isl.r);
  }
  const ox = minX - margin;
  const oy = minY - margin;
  const cols = Math.max(1, Math.ceil((maxX + margin - ox) / t.cellSize));
  const rows = Math.max(1, Math.ceil((maxY + margin - oy) / t.cellSize));
  const n = cols * rows;
  const cost = new Float64Array(n);
  const blockA = new Int32Array(n).fill(-1);
  const blockB = new Int32Array(n).fill(-1);
  const blockC = new Int32Array(n).fill(-1);
  const interior = new Int32Array(n).fill(-1);
  for (let iy = 0; iy < rows; iy++) {
    const cy = oy + (iy + 0.5) * t.cellSize;
    for (let ix = 0; ix < cols; ix++) {
      const idx = iy * cols + ix;
      const cx = ox + (ix + 0.5) * t.cellSize;
      let surplusMin = Infinity; // distance beyond the nearest inflated rim
      let bA = -1;
      let bAd = Infinity;
      let bB = -1;
      let bBd = Infinity;
      let bC = -1;
      let bCd = Infinity;
      let intIdx = -1;
      let intD = Infinity;
      for (let k = 0; k < islands.length; k++) {
        const isl = islands[k];
        if (!isl) continue;
        const rim = Math.hypot(cx - isl.x, cy - isl.y) - isl.r;
        surplusMin = Math.min(surplusMin, rim - t.clearance);
        if (rim <= t.clearance) {
          if (rim < bAd) {
            bC = bB;
            bCd = bBd;
            bB = bA;
            bBd = bAd;
            bA = k;
            bAd = rim;
          } else if (rim < bBd) {
            bC = bB;
            bCd = bBd;
            bB = k;
            bBd = rim;
          } else if (rim < bCd) {
            bC = k;
            bCd = rim;
          }
        }
        if (rim < 0 && rim < intD) {
          intIdx = k;
          intD = rim;
        }
      }
      let c = 1 + t.noiseAmp * rand01(hash(`${seed}:c:${idx}`));
      if (surplusMin < t.falloff) {
        const f = 1 - Math.max(0, surplusMin) / t.falloff;
        c += t.falloffCost * f * f;
      }
      cost[idx] = c;
      blockA[idx] = bA;
      blockB[idx] = bB;
      blockC[idx] = bC;
      interior[idx] = intIdx;
    }
  }
  return { ox, oy, cs: t.cellSize, cols, rows, cost, blockA, blockB, blockC, interior };
}

/**
 * Hard-blocked for the edge whose own islands are fi/ti: any of the three
 * nearest clearance blockers is FOREIGN, or the cell is INTERIOR to an own
 * island. Own clearance rings stay open (paths must dock and leave), but own
 * interiors are cave territory like anyone else's — under an island is a cave,
 * never a surface trail (ADR-0169 §1/§2), and pass 1 must not shortcut it.
 */
function blockedFor(grid: Grid, idx: number, fi: number, ti: number): boolean {
  const a = grid.blockA[idx] ?? -1;
  const b = grid.blockB[idx] ?? -1;
  const c = grid.blockC[idx] ?? -1;
  if (
    (a !== -1 && a !== fi && a !== ti) ||
    (b !== -1 && b !== fi && b !== ti) ||
    (c !== -1 && c !== fi && c !== ti)
  ) {
    return true;
  }
  const ii = grid.interior[idx] ?? -1;
  return ii !== -1 && (ii === fi || ii === ti);
}

// ---------- A* ----------

const SQRT2 = Math.SQRT2;

const DIRS: readonly { dx: number; dy: number; len: number }[] = [
  { dx: 1, dy: 0, len: 1 },
  { dx: -1, dy: 0, len: 1 },
  { dx: 0, dy: 1, len: 1 },
  { dx: 0, dy: -1, len: 1 },
  { dx: 1, dy: 1, len: SQRT2 },
  { dx: 1, dy: -1, len: SQRT2 },
  { dx: -1, dy: 1, len: SQRT2 },
  { dx: -1, dy: -1, len: SQRT2 },
];

interface HeapEntry {
  f: number;
  g: number;
  i: number;
}

/** Stable ordering: f, then g, then cell index — the determinism anchor. */
function heapLess(a: HeapEntry, b: HeapEntry): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.g !== b.g) return a.g < b.g;
  return a.i < b.i;
}

function heapPush(h: HeapEntry[], e: HeapEntry): void {
  h.push(e);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    const hp = h[p]!;
    if (!heapLess(e, hp)) break;
    h[i] = hp;
    h[p] = e;
    i = p;
  }
}

function heapPop(h: HeapEntry[]): HeapEntry | undefined {
  const top = h[0];
  const last = h.pop();
  if (top === undefined || last === undefined || h.length === 0) return top;
  h[0] = last;
  let i = 0;
  for (;;) {
    const l = 2 * i + 1;
    const r = l + 1;
    let m = i;
    const hl = h[l];
    if (l < h.length && hl !== undefined && heapLess(hl, h[m]!)) m = l;
    const hr = h[r];
    if (r < h.length && hr !== undefined && heapLess(hr, h[m]!)) m = r;
    if (m === i) break;
    const tmp = h[m]!;
    h[m] = h[i]!;
    h[i] = tmp;
    i = m;
  }
  return top;
}

interface AstarState {
  g: Float64Array;
  parent: Int32Array;
  dirAt: Int8Array; // arrival direction of the best-known g (per-parent turn approximation)
  seen: Int32Array; // generation stamps — reuse the arrays across edges without clearing
  closed: Int32Array;
  gen: number;
}

function runAstar(
  grid: Grid,
  st: AstarState,
  t: TrailTuning,
  start: number,
  goal: number,
  fi: number,
  ti: number,
  cave: boolean,
): number[] | null {
  st.gen++;
  const gen = st.gen;
  const { cols, rows, cost } = grid;
  // The edge's own clearance rings are never obstacles for it (paths must
  // leave/enter them); in cave mode a blocked cell is passable at interiorCost.
  const cellCost = (idx: number): number => {
    if (!blockedFor(grid, idx, fi, ti)) return cost[idx] ?? 1;
    return cave ? t.interiorCost : Infinity;
  };
  if (cellCost(start) === Infinity || cellCost(goal) === Infinity) return null;
  if (start === goal) return [start];
  const gx = goal % cols;
  const gy = (goal / cols) | 0;
  const hScale = Math.min(1, t.discountFloor); // min possible cell cost — keeps h admissible
  const hOf = (ix: number, iy: number): number => {
    const dx = Math.abs(ix - gx);
    const dy = Math.abs(iy - gy);
    const mn = Math.min(dx, dy);
    return (Math.max(dx, dy) + (SQRT2 - 1) * mn) * hScale;
  };
  const open: HeapEntry[] = [];
  st.seen[start] = gen;
  st.closed[start] = 0;
  st.g[start] = 0;
  st.parent[start] = -1;
  st.dirAt[start] = -1;
  heapPush(open, { f: hOf(start % cols, (start / cols) | 0), g: 0, i: start });
  let found = false;
  for (;;) {
    const e = heapPop(open);
    if (e === undefined) break;
    const cur = e.i;
    if (st.closed[cur] === gen) continue;
    if (e.g !== st.g[cur]) continue; // stale entry — a better g was pushed later
    st.closed[cur] = gen;
    if (cur === goal) {
      found = true;
      break;
    }
    const cx = cur % cols;
    const cyi = (cur / cols) | 0;
    const cCur = cellCost(cur);
    const inDir = st.dirAt[cur] ?? -1;
    for (let di = 0; di < DIRS.length; di++) {
      const dd = DIRS[di]!;
      const nx = cx + dd.dx;
      const ny = cyi + dd.dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (st.closed[ni] === gen) continue;
      const cNb = cellCost(ni);
      if (cNb === Infinity) continue;
      // no corner cutting: a diagonal step needs both orthogonal shoulders open
      if (dd.dx !== 0 && dd.dy !== 0) {
        if (cellCost(cyi * cols + nx) === Infinity || cellCost(ny * cols + cx) === Infinity) continue;
      }
      const turn = inDir !== -1 && inDir !== di ? t.turnPenalty : 0;
      const ng = (st.g[cur] ?? 0) + dd.len * 0.5 * (cCur + cNb) + turn;
      if (st.seen[ni] === gen && ng >= (st.g[ni] ?? Infinity)) continue;
      st.seen[ni] = gen;
      st.g[ni] = ng;
      st.parent[ni] = cur;
      st.dirAt[ni] = di;
      heapPush(open, { f: ng + hOf(nx, ny), g: ng, i: ni });
    }
  }
  if (!found) return null;
  const path: number[] = [];
  for (let cur = goal; cur !== -1; cur = st.parent[cur] ?? -1) path.push(cur);
  path.reverse();
  return path;
}

// ---------- smoothing ----------

/** r2-rounded coordinate for the `d` string (no trailing zeros, no -0). */
function r2(v: number): string {
  const n = Math.round(v * 100) / 100;
  return (n === 0 ? 0 : n).toString();
}

/** Centripetal Catmull-Rom (alpha 0.5) through the points, as M + cubic C `d`. */
function crPathD(pts: readonly Pt[]): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M ${r2(first.x)} ${r2(first.y)}`;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const d1 = Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y));
    const d2 = Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const d3 = Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y));
    if (d2 < 1e-9) continue; // duplicate points — nothing to draw
    let m1x: number;
    let m1y: number;
    let m2x: number;
    let m2y: number;
    if (d1 < 1e-6) {
      m1x = p2.x - p1.x;
      m1y = p2.y - p1.y;
    } else {
      m1x = d2 * ((p1.x - p0.x) / d1 - (p2.x - p0.x) / (d1 + d2) + (p2.x - p1.x) / d2);
      m1y = d2 * ((p1.y - p0.y) / d1 - (p2.y - p0.y) / (d1 + d2) + (p2.y - p1.y) / d2);
    }
    if (d3 < 1e-6) {
      m2x = p2.x - p1.x;
      m2y = p2.y - p1.y;
    } else {
      m2x = d2 * ((p2.x - p1.x) / d2 - (p3.x - p1.x) / (d2 + d3) + (p3.x - p2.x) / d3);
      m2y = d2 * ((p2.y - p1.y) / d2 - (p3.y - p1.y) / (d2 + d3) + (p3.y - p2.y) / d3);
    }
    const c1x = p1.x + m1x / 3;
    const c1y = p1.y + m1y / 3;
    const c2x = p2.x - m2x / 3;
    const c2y = p2.y - m2y / 3;
    d += ` C ${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return d;
}

/**
 * Collinear decimation → resample → seeded perpendicular meander → CR spline.
 * First/last points are junction nodes SHARED with neighbouring segments and
 * are never moved, so edge chains stay connected. Meander skips points within
 * clearance of any island (and hidden runs entirely) — its amplitude is below
 * the clearance margin, so it can never push a trail inside an island.
 */
function smoothSegment(
  rawPts: readonly Pt[],
  hidden: boolean,
  segId: string,
  islands: readonly TrailIsland[],
  seed: string,
  t: TrailTuning,
): { points: Pt[]; d: string } {
  // 1. drop duplicates, then exactly-collinear interior points
  const dedup: Pt[] = [];
  for (const p of rawPts) {
    const prev = dedup[dedup.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-9) continue;
    dedup.push({ x: p.x, y: p.y });
  }
  const dec: Pt[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const p = dedup[i]!;
    if (i > 0 && i < dedup.length - 1) {
      const q = dec[dec.length - 1]!;
      const nxt = dedup[i + 1]!;
      const cross = (p.x - q.x) * (nxt.y - p.y) - (p.y - q.y) * (nxt.x - p.x);
      if (Math.abs(cross) < 1e-6) continue;
    }
    dec.push(p);
  }
  // 2. resample long straight spans so the meander has vertices to bend
  //    (decimation alone would leave a straight run with no interior points)
  const step = Math.max(t.meanderWavelength / 3, t.cellSize);
  const pts: Pt[] = [{ x: dec[0]!.x, y: dec[0]!.y }];
  for (let i = 0; i + 1 < dec.length; i++) {
    const a = dec[i]!;
    const b = dec[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nSub = Math.max(1, Math.round(len / step));
    for (let k = 1; k < nSub; k++) {
      const f = k / nSub;
      pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    pts.push({ x: b.x, y: b.y }); // exact endpoint — junction continuity
  }
  // 3. seeded value-noise meander along arc length (visible segments only)
  if (!hidden && pts.length > 2) {
    const s: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      s.push((s[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
    }
    for (let i = 1; i + 1 < pts.length; i++) {
      const p = pts[i]!;
      let nearIsland = false;
      for (const isl of islands) {
        if (Math.hypot(p.x - isl.x, p.y - isl.y) < isl.r + t.clearance) {
          nearIsland = true;
          break;
        }
      }
      if (nearIsland) continue;
      const ph = (s[i] ?? 0) / t.meanderWavelength;
      const k0 = Math.floor(ph);
      const f = ph - k0;
      const u = f * f * (3 - 2 * f);
      const n0 = rand01(hash(`${seed}:w:${segId}:${k0}`)) * 2 - 1;
      const n1 = rand01(hash(`${seed}:w:${segId}:${k0 + 1}`)) * 2 - 1;
      const off = t.meanderAmp * (n0 + (n1 - n0) * u);
      const pa = pts[i - 1]!;
      const pb = pts[i + 1]!;
      const tx = pb.x - pa.x;
      const ty = pb.y - pa.y;
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-9) continue;
      p.x += (-ty / tl) * off;
      p.y += (tx / tl) * off;
    }
  }
  return { points: pts, d: crPathD(pts) };
}

// ---------- the router ----------

interface NodeRec {
  key: string; // shared node identity — cell index or island rim point
  x: number;
  y: number;
  underOf: number; // island index whose interior this node sits UNDER (any island,
  // own included — own interiors are pass-1 blocked, so only a forced cave run
  // ever enters one), -1 = surface
}

interface RoutedEdge {
  key: string;
  from: string;
  to: string;
  title: string | undefined;
  nodes: NodeRec[];
}

// Non-printable separators/markers, so ids containing ':', '|', '->' etc. can
// never collide inside link keys or signatures.
const SEP = '\u0000';
const HIDDEN_MARK = '\u0001';
const SIG_JOIN = '\u0002';

function linkKeyOf(a: NodeRec, b: NodeRec): string {
  return a.key < b.key ? `${a.key}${SEP}${b.key}` : `${b.key}${SEP}${a.key}`;
}

/** Segment-circle crossing point (the t in [0,1] where the rim is crossed). */
function circleCrossing(a: NodeRec, b: NodeRec, isl: TrailIsland): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - isl.x;
  const fy = a.y - isl.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - isl.r * isl.r;
  const disc = qb * qb - 4 * qa * qc;
  let tt = 0.5;
  if (qa > 1e-12 && disc >= 0) {
    const sq = Math.sqrt(disc);
    const t1 = (-qb - sq) / (2 * qa);
    const t2 = (-qb + sq) / (2 * qa);
    tt = t1 >= 0 && t1 <= 1 ? t1 : Math.min(1, Math.max(0, t2));
  }
  return { x: a.x + dx * tt, y: a.y + dy * tt };
}

/**
 * Route every edge over one shared cost field and emit the shared-segment trail
 * network (ADR-0169 §1). Self-edges and duplicate from->to pairs are folded
 * away (nothing distinct to draw); edges with unknown endpoints or no routable
 * path are dropped AND surfaced on `network.dropped` (§5 — never hide an edge
 * silently). The rest route in canonical order (descending chord, then
 * lexicographic key), so the result is independent of input order.
 */
export function routeTrails(
  islands: readonly TrailIsland[],
  edges: readonly TrailEdgeIn[],
  seed: string,
  tuning?: Partial<TrailTuning>,
): TrailNetwork {
  const t = resolveTuning(tuning);
  const byId = new Map<string, number>();
  islands.forEach((isl, i) => {
    if (!byId.has(isl.id)) byId.set(isl.id, i);
  });

  interface Cand {
    key: string;
    from: string;
    to: string;
    title: string | undefined;
    fi: number;
    ti: number;
    chord: number;
  }
  const cands: Cand[] = [];
  const dropped: { from: string; to: string }[] = [];
  // dedupe + sort so `dropped` is input-order independent like everything else
  const finishDropped = (): { from: string; to: string }[] => {
    const seen = new Set<string>();
    const out: { from: string; to: string }[] = [];
    for (const d of dropped) {
      const k = `${d.from}${SEP}${d.to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
    out.sort((p, q) =>
      p.from !== q.from ? (p.from < q.from ? -1 : 1) : p.to < q.to ? -1 : p.to > q.to ? 1 : 0,
    );
    return out;
  };
  for (const e of edges) {
    const fi = byId.get(e.from);
    const ti = byId.get(e.to);
    if (fi === undefined || ti === undefined) {
      dropped.push({ from: e.from, to: e.to }); // unknown endpoint — observable, not silent
      continue;
    }
    if (fi === ti) continue; // self-edge: nothing to draw by design
    const a = islands[fi]!;
    const b = islands[ti]!;
    cands.push({
      // the INTERNAL key joins with the non-printable SEP so ids containing
      // '->' can never make two distinct edges collide; the display key
      // (`from->to`, on caves and scene metadata) is built where it is shown
      key: `${e.from}${SEP}${e.to}`,
      from: e.from,
      to: e.to,
      title: e.title,
      fi,
      ti,
      chord: Math.hypot(b.x - a.x, b.y - a.y),
    });
  }
  // canonical order: longest chord first, then key, then title (total order so
  // dedupe below is input-order independent)
  cands.sort((p, q) => {
    if (p.chord !== q.chord) return q.chord - p.chord;
    if (p.key !== q.key) return p.key < q.key ? -1 : 1;
    const pt = p.title ?? '';
    const qt = q.title ?? '';
    return pt < qt ? -1 : pt > qt ? 1 : 0;
  });
  const canon: Cand[] = [];
  for (const c of cands) {
    const prev = canon[canon.length - 1];
    if (prev && prev.key === c.key) continue;
    canon.push(c);
  }
  if (islands.length === 0 || canon.length === 0) {
    return { segments: [], edges: [], caves: [], dropped: finishDropped() };
  }

  const grid = buildGrid(islands, seed, t);
  const nCells = grid.cols * grid.rows;
  const st: AstarState = {
    g: new Float64Array(nCells),
    parent: new Int32Array(nCells),
    dirAt: new Int8Array(nCells),
    seen: new Int32Array(nCells),
    closed: new Int32Array(nCells),
    gen: 0,
  };
  const cellIndexAt = (x: number, y: number): number => {
    const ix = Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.ox) / grid.cs)));
    const iy = Math.min(grid.rows - 1, Math.max(0, Math.floor((y - grid.oy) / grid.cs)));
    return iy * grid.cols + ix;
  };
  const centerOf = (idx: number): Pt => ({
    x: grid.ox + ((idx % grid.cols) + 0.5) * grid.cs,
    y: grid.oy + (((idx / grid.cols) | 0) + 0.5) * grid.cs,
  });
  // Dock just outside the rim on the preferred bearing; when a THIRD island's
  // inflated ring covers that one cell (a decor islet sitting over the dock),
  // scan alternate bearings nearest-first around the rim instead of letting
  // pass 1 abort — cave mode is for WALLED-IN edges, never a blocked doorstep
  // (ADR-0169 §1: caves only when forced).
  const dockCellAt = (isl: TrailIsland, bx: number, by: number, fi: number, ti: number): number => {
    const rad = isl.r + 0.75 * grid.cs;
    const idx0 = cellIndexAt(isl.x + bx * rad, isl.y + by * rad);
    if (!blockedFor(grid, idx0, fi, ti)) return idx0;
    const base = Math.atan2(by, bx);
    // step ≈ one cell of arc so no opening between candidates is skipped
    const steps = Math.max(16, Math.ceil((2 * Math.PI * rad) / grid.cs));
    for (let k = 1; k <= steps >> 1; k++) {
      for (const s of [1, -1] as const) {
        const ang = base + (s * k * 2 * Math.PI) / steps;
        const idx = cellIndexAt(isl.x + Math.cos(ang) * rad, isl.y + Math.sin(ang) * rad);
        if (!blockedFor(grid, idx, fi, ti)) return idx;
      }
    }
    return idx0; // fully enclosed — the cave fallback takes it from here
  };

  const routed: RoutedEdge[] = [];
  for (const c of canon) {
    const A = islands[c.fi]!;
    const B = islands[c.ti]!;
    let ux = B.x - A.x;
    let uy = B.y - A.y;
    const chordLen = Math.hypot(ux, uy);
    if (chordLen < 1e-9) {
      ux = 1;
      uy = 0;
    } else {
      ux /= chordLen;
      uy /= chordLen;
    }
    // dock just outside each rim, toward the other island (re-bearing if blocked)
    const start = dockCellAt(A, ux, uy, c.fi, c.ti);
    const goal = dockCellAt(B, -ux, -uy, c.fi, c.ti);
    // cave fallback ONLY when the island-blocked route is impossible
    let path = runAstar(grid, st, t, start, goal, c.fi, c.ti, false);
    if (!path) path = runAstar(grid, st, t, start, goal, c.fi, c.ti, true);
    if (!path) {
      dropped.push({ from: c.from, to: c.to }); // degenerate grid — observable, not silent
      continue;
    }

    // reuse discount: traversed cells snap later routes on; the 1-cell halo
    // gets a WEAKER discount so the exact trail cells stay strictly cheapest
    // (an equal halo discount would let later routes ride a parallel lane and
    // never share cells — no merging).
    const haloDiscount = Math.min(1, (1 + t.reuseDiscount) / 2);
    const onPath = new Set<number>(path);
    const halo = new Set<number>();
    for (const ci of path) {
      const ix = ci % grid.cols;
      const iy = (ci / grid.cols) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ix + dx;
          const ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
          const ni = ny * grid.cols + nx;
          if (!onPath.has(ni)) halo.add(ni);
        }
      }
    }
    for (const ci of onPath) grid.cost[ci] = Math.max(t.discountFloor, (grid.cost[ci] ?? 1) * t.reuseDiscount);
    for (const ci of halo) grid.cost[ci] = Math.max(t.discountFloor, (grid.cost[ci] ?? 1) * haloDiscount);

    // node sequence: exact rim point → cells → exact rim point, so trails dock
    // on the coast at the final approach bearing
    const nodes: NodeRec[] = [];
    const firstCell = path[0]!;
    const lastCell = path[path.length - 1]!;
    const pF = centerOf(firstCell);
    let bfx = pF.x - A.x;
    let bfy = pF.y - A.y;
    const lf = Math.hypot(bfx, bfy);
    if (lf < 1e-9) {
      bfx = ux;
      bfy = uy;
    } else {
      bfx /= lf;
      bfy /= lf;
    }
    nodes.push({ key: `r:${A.id}:${firstCell}`, x: A.x + bfx * A.r, y: A.y + bfy * A.r, underOf: -1 });
    for (const ci of path) {
      const p = centerOf(ci);
      nodes.push({
        key: `c:${ci}`,
        x: p.x,
        y: p.y,
        // ABSOLUTE island interior, own islands included: every edge through the
        // cell agrees a run under an island is hidden, so a shared link can never
        // render as one edge's surface trail across another edge's cave
        underOf: grid.interior[ci] ?? -1,
      });
    }
    const pL = centerOf(lastCell);
    let btx = pL.x - B.x;
    let bty = pL.y - B.y;
    const lt = Math.hypot(btx, bty);
    if (lt < 1e-9) {
      btx = -ux;
      bty = -uy;
    } else {
      btx /= lt;
      bty /= lt;
    }
    nodes.push({ key: `r:${B.id}:${lastCell}`, x: B.x + btx * B.r, y: B.y + bty * B.r, underOf: -1 });
    routed.push({ key: c.key, from: c.from, to: c.to, title: c.title, nodes });
  }

  // ---------- segmentization: split where the co-travelling edge set changes ----------
  // Each undirected link (node pair) carries a signature = the sorted set of
  // edges using it (hidden-flagged per edge). A segment is a maximal run of
  // links with one signature — junctions and hidden/visible transitions both
  // change the signature, so both split.
  const linkEntries = new Map<string, Set<string>>();
  for (const re of routed) {
    for (let i = 0; i + 1 < re.nodes.length; i++) {
      const a = re.nodes[i]!;
      const b = re.nodes[i + 1]!;
      const entry = re.key + (a.underOf !== -1 || b.underOf !== -1 ? HIDDEN_MARK : '');
      const lk = linkKeyOf(a, b);
      let set = linkEntries.get(lk);
      if (!set) {
        set = new Set();
        linkEntries.set(lk, set);
      }
      set.add(entry);
    }
  }
  const sigOf = new Map<string, string>();
  for (const [lk, set] of linkEntries) sigOf.set(lk, [...set].sort().join(SIG_JOIN));

  interface SegRec {
    id: string;
    pts: Pt[];
    hidden: boolean;
    usage: number;
  }
  const segByCanon = new Map<string, SegRec>();
  const segOrder: SegRec[] = [];
  const segIdCount = new Map<string, number>(); // 32-bit hash collision guard
  const outEdges: TrailEdgeOut[] = [];
  for (const re of routed) {
    const linkCount = re.nodes.length - 1;
    const sigs: string[] = [];
    for (let l = 0; l < linkCount; l++) {
      sigs.push(sigOf.get(linkKeyOf(re.nodes[l]!, re.nodes[l + 1]!)) ?? '');
    }
    const chain: { id: string; reversed: boolean }[] = [];
    const emitRun = (from: number, to: number): void => {
      const run = re.nodes.slice(from, to + 1);
      const keys = run.map((nd) => nd.key);
      const fwd = keys.join(SEP);
      const rev = [...keys].reverse().join(SEP);
      const reversed = rev < fwd; // canonical orientation: lexicographically smaller key run
      const canonKey = reversed ? rev : fwd;
      let rec = segByCanon.get(canonKey);
      if (!rec) {
        const entries = (sigs[from] ?? '').split(SIG_JOIN).filter((x) => x.length > 0);
        // two distinct cell runs CAN share a 32-bit FNV hash — a shared id would
        // corrupt edge chains and reveal targeting, so extend, never share
        const base = `t${hash(canonKey).toString(36)}`;
        const nth = segIdCount.get(base) ?? 0;
        segIdCount.set(base, nth + 1);
        rec = {
          id: nth === 0 ? base : `${base}-${nth + 1}`,
          pts: (reversed ? [...run].reverse() : run).map((nd) => ({ x: nd.x, y: nd.y })),
          hidden: entries.length > 0 && entries.every((x) => x.endsWith(HIDDEN_MARK)),
          usage: entries.length,
        };
        segByCanon.set(canonKey, rec);
        segOrder.push(rec);
      }
      chain.push({ id: rec.id, reversed });
    };
    let runStart = 0;
    for (let l = 1; l < linkCount; l++) {
      if (sigs[l] !== sigs[l - 1]) {
        emitRun(runStart, l);
        runStart = l;
      }
    }
    emitRun(runStart, linkCount);
    outEdges.push({
      from: re.from,
      to: re.to,
      ...(re.title !== undefined ? { title: re.title } : {}),
      segments: chain,
    });
  }

  // ---------- cave portals: rim crossings of the hidden runs ----------
  interface CaveAcc {
    islandId: string;
    x: number;
    y: number;
    bearing: number;
    edgeIds: Set<string>;
  }
  const caveMap = new Map<string, CaveAcc>();
  const addPortal = (isl: TrailIsland, a: NodeRec, b: NodeRec, edgeKey: string): void => {
    const key = `${isl.id}${SEP}${linkKeyOf(a, b)}`;
    let acc = caveMap.get(key);
    if (!acc) {
      const p = circleCrossing(a, b, isl);
      acc = {
        islandId: isl.id,
        x: p.x,
        y: p.y,
        bearing: Math.atan2(p.y - isl.y, p.x - isl.x),
        edgeIds: new Set(),
      };
      caveMap.set(key, acc);
    }
    acc.edgeIds.add(edgeKey);
  };
  for (const re of routed) {
    const displayKey = `${re.from}->${re.to}`; // the PUBLIC edge key (docs on TrailCave)
    for (let i = 0; i + 1 < re.nodes.length; i++) {
      const a = re.nodes[i]!;
      const b = re.nodes[i + 1]!;
      if (a.underOf === b.underOf) continue;
      if (a.underOf !== -1) addPortal(islands[a.underOf]!, a, b, displayKey); // exit portal
      if (b.underOf !== -1) addPortal(islands[b.underOf]!, a, b, displayKey); // entry portal
    }
  }
  const caves: TrailCave[] = [...caveMap.values()].map((acc) => ({
    islandId: acc.islandId,
    x: acc.x,
    y: acc.y,
    bearing: acc.bearing,
    width: trailFillWidth(acc.edgeIds.size),
    edgeIds: [...acc.edgeIds].sort(),
  }));

  const segments: TrailSegment[] = segOrder.map((rec) => {
    const sm = smoothSegment(rec.pts, rec.hidden, rec.id, islands, seed, t);
    return { id: rec.id, d: sm.d, points: sm.points, usage: rec.usage, hidden: rec.hidden };
  });
  return { segments, edges: outEdges, caves, dropped: finishDropped() };
}
