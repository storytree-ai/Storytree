// TreeView — the story world (#/tree).
//
// A Dorfromantik-style hex-tile world that READS AS A TREE (ADR-0036 d.6):
// islands are dependency-ranked — the most-depended-upon stories sit at the
// bottom centre and dependents fan upward and outward, so the eye traces the
// load-bearing foundation up through the canopy. Every story claims a
// TERRITORY of extruded hexagonal tiles (one tile quota per capability plus a
// margin) and grows ONE central story tree — the story itself, crown sized by
// capability count, GROWTH and foliage carrying the lifecycle (ADR-0038): a
// lone sapling when nothing is mapped yet, a young amber tree while proposed
// (building wears proposed too — wisps carry live work), a full brownfield
// tree when mapped, deep green when healthy, withered to bare branches when
// unhealthy. Retired units don't render at all (worldStatus.ts). HUE CARRIES
// PROOF (ADR-0040): deep green only ever derives from a signed pass in
// events.verdict — authored status can never paint it — and the crown greens
// only from the story's OWN UAT verdict, never a child roll-up (ADR-0033
// d.4). Capabilities garden around it as small flora (flower beds / berry
// bushes / saplings); one whose last signed run failed — or whose status is
// unhealthy — withers to a dead plant. There are no ✓/✗ badges in the world:
// the hue IS the verdict (precise facts stay in the panel and tooltips). A
// signpost marks a HUMAN-witnessed story (uat_witness absent or human):
// dashed-blank until the operator's UAT ceremony signs a verdict, a filled
// seal after; machine-witnessed stories carry none.
// Story-level `depends_on` (∪ derived cross-story capability deps) renders as
// roads; hovering a territory lights its upstream chain (gold) vs downstream
// dependents (red) — the focus interaction carried from V1's
// visualisations/storytree. Clicking opens the side panel with the story's
// capability sub-DAG (dagre layout, status-strip cards). A legend bar docked
// at the top of the frame maps the visual vocabulary, one entry per model
// with expandable state fans (WorldLegend.tsx); its status fan doubles as the
// status filter.
//
// Data is /api/tree — offline, straight from stories/ frontmatter; verdict
// glyphs and presence wisps are advisory layers that appear only when the
// live store answers. All "randomness" (tile growth, crown-blob jitter, road
// bows) is hashed from ids so the world renders identically every time.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { isBuildInFlight, verdictBloom, type VerdictBloom } from '../lib/activity.js';
import { useBuildActivity } from '../lib/buildActivity';
import { formatAge, isOrbitingBand, splitSessions, usePresence } from '../lib/presence';
import { navigate, treeFocusHref, treeHref } from '../lib/route';
import { presentStories } from '../lib/worldStatus.js';
import {
  offsetCurve,
  quadPt,
  rampWidth,
  smoothOpenPath,
  rayPolyIntersect,
  pointInPoly,
  distToLoop,
  euclideanMST,
  treeDrainage,
  routeAround,
  confluenceTree,
  meanderPath,
  circularMeanAngle,
  pondRadiusForDegree,
  embayCoast,
  edgePathBundle,
  segmentKey,
  type Disk,
  type LoopDock,
} from '../lib/riverGeometry.js';
import { WorldLegend } from './WorldLegend.js';
import type { BuildActivity, TreeCapability, TreeSession, TreeStory, TreeVerdict, UatTestRow } from '../types';

// ---------- deterministic pseudo-random ----------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One uniform [0,1) draw from an integer seed (mulberry32 single step). */
function rand01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

interface Pt {
  x: number;
  y: number;
}

// ---------- hex grid (pointy-top, axial coordinates) ----------

const HEX_R = 27; // centre → corner
const HEX_W = Math.sqrt(3) * HEX_R;
const TILE_DEPTH = 8; // extrusion below a claimed tile

interface Axial {
  q: number;
  r: number;
}

const axialKey = (h: Axial): string => `${h.q},${h.r}`;

/** Neighbour directions, indexed so AXIAL_DIRS[i] faces the edge corner i → i+1. */
const AXIAL_DIRS: Axial[] = [
  { q: 1, r: -1 }, // NE  (edge between corners 0 and 1)
  { q: 1, r: 0 }, //  E  (1 → 2)
  { q: 0, r: 1 }, //  SE (2 → 3)
  { q: -1, r: 1 }, // SW (3 → 4)
  { q: -1, r: 0 }, // W  (4 → 5)
  { q: 0, r: -1 }, // NW (5 → 0)
];

function hexCenter(h: Axial): Pt {
  return { x: HEX_W * (h.q + h.r / 2), y: 1.5 * HEX_R * h.r };
}

function pixelToHex(p: Pt): Axial {
  const rf = p.y / (1.5 * HEX_R);
  const qf = p.x / HEX_W - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

function hexDist(a: Axial, b: Axial): number {
  return (
    (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
  );
}

/** The six corners around (cx, cy), corner 0 at the top, clockwise. */
function hexCorners(cx: number, cy: number, R: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

function hexPath(cx: number, cy: number, R: number): string {
  return (
    hexCorners(cx, cy, R)
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ') + ' Z'
  );
}

// ---------- world building ----------

const MARGIN = 60;
const RANK_GAP = 78; // vertical clearance between grown territories of adjacent ranks (gives rivers room)
const ISLAND_GAP = 96; // horizontal clearance between territories sharing a rank (gives rivers room)
const RANK_SWING = 235; // lateral swing for a lone island, so its roads read as diagonals
const COAST_OUTSET = 7; // px the smoothed coast sits beyond the hex tiles — a thin sandy beach
const COAST_SMOOTH_ITERS = 2; // Chaikin passes: 2 rounds the hex silhouette into an organic blob
const COAST_NOISE_AMP = 0.5; // per-vertex outset wobble (fraction of COAST_OUTSET) — non-uniform coasts
const COAST_NOISE_WAVES = 3; // low-frequency lobes around the shore (gentle bays, not jaggedness)
const RIVER_FAN_STEP = 0.34; // rad (~19°) of shore between adjacent river mouths leaving one source
const RIVER_FAN_MAX = 2.5; // rad (~145°) widest arc a source's outgoing delta fans across
const LANE_GAP = 13; // px centre-to-centre between adjacent metro lanes sharing a corridor (a shared sand braid-bar)
const LANE_WINDOW = 0.4; // fraction of each river's length over which it blends from its true dock/mouth into the shared corridor
const MOUTH_FLARE = 14; // px offshore the merged trunk fuses before diving head-on into the single coast mouth

interface CapSpot {
  cap: TreeCapability;
  x: number;
  y: number;
}

/** A conifer-clump spot (wheat is a tile-top fill, tracked in wheatTiles). */
interface DecorSpot {
  x: number;
  y: number;
  seed: number;
}

interface BoundarySeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Territory {
  story: TreeStory;
  tiles: Axial[];
  centroid: Pt;
  /** px from centroid to the farthest tile centre, plus the tile radius. */
  radius: number;
  /** Where the central story tree stands (the tile nearest the centroid). */
  treeSpot: Pt;
  caps: CapSpot[];
  decor: DecorSpot[];
  wheatTiles: Set<string>;
  /** Smoothed organic coastline as closed `d` strings — the island's sand fill
   *  AND its water moat (one curve, filled then stroked). */
  coastPaths: string[];
  /** The smoothed coast as point loop(s), for docking river mouths to the shore. */
  coastLoops: Pt[][];
  labelY: number;
}

interface WorldEdge {
  from: string;
  to: string;
  via: string[];
  d: string;
  /** Tributary load this segment carries (merged-river mode): drives stroke width
   *  so a trunk fattens with the number of rivers it gathers. Unset = CSS default. */
  flow?: number;
  /** A synthetic shared TRUNK stub (merged-river mode) — the fat channel a source
   *  island's outgoing rivers leave through before they branch. Non-interactive. */
  kind?: 'trunk';
}

/** A small inland pond: a smoothed closed water shape sitting on an island,
 *  rendered ABOVE the tiles. `story` keys focus dimming; `loop` is kept so the
 *  substrate pass can tell which cells the pond covers (cells-become-water). */
interface PondShape {
  story: string;
  d: string;
  loop: Pt[];
}

/** Inland water carried by `?water=pond|through`: per-island ponds and/or the
 *  channels that carry rivers across the beach to the pond (or clear across the
 *  island). Empty when `?water=off`. Channels reuse WorldEdge so focus relations
 *  (ancestor/descendant dimming) work exactly like the over-sea rivers. */
interface InlandWater {
  ponds: PondShape[];
  channels: WorldEdge[];
}

interface HexWorld {
  territories: Territory[];
  /** Pale coast tiles (1–2 rings beyond claimed land). */
  empties: Axial[];
  /** Claimed tiles in global back-to-front draw order, with territory index. */
  drawTiles: { h: Axial; owner: number }[];
  edges: WorldEdge[];
  /** Inland water (`?water=pond|through`); empty arrays when off. */
  inland: InlandWater;
  width: number;
  height: number;
  offset: Pt;
}

/**
 * The story-level edge set the world renders as roads: declared `depends_on`
 * UNION derived cross-story capability deps. Ranking uses the SAME set so a
 * derived-only road can never point downward.
 */
function storyEdges(stories: TreeStory[]): { from: string; to: string; via: string[] }[] {
  const ids = new Set(stories.map((s) => s.id));
  const capOwner = new Map<string, string>();
  for (const s of stories) for (const c of s.capabilities) capOwner.set(c.id, s.id);
  const edgeMap = new Map<string, { from: string; to: string; via: string[] }>();
  for (const s of stories) {
    for (const dep of s.dependsOn) {
      if (dep !== s.id && ids.has(dep)) {
        edgeMap.set(`${dep}->${s.id}`, { from: dep, to: s.id, via: [] });
      }
    }
    for (const c of s.capabilities) {
      for (const d of c.dependsOn) {
        const ownerId = capOwner.get(d);
        if (!ownerId || ownerId === s.id) continue;
        const key = `${ownerId}->${s.id}`;
        const cur = edgeMap.get(key) ?? { from: ownerId, to: s.id, via: [] };
        cur.via.push(`${c.id} → ${d}`);
        edgeMap.set(key, cur);
      }
    }
  }
  return [...edgeMap.values()];
}

/**
 * Longest-path rank over the world's edge set (dep → dependent), cycle-safe.
 * Rank 0 = the most foundational stories; a dependent always ranks strictly
 * above every dependency, so the world reads bottom-up (ADR-0036 d.6a).
 */
function rankStories(
  stories: TreeStory[],
  depsOf: Map<string, string[]>,
): Map<string, number> {
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // cycle in bad frontmatter — break the edge, stay finite
    visiting.add(id);
    let r = 0;
    for (const d of depsOf.get(id) ?? []) r = Math.max(r, visit(d) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const s of stories) visit(s.id);
  return rank;
}

/** Transitive dependent count — how load-bearing a story is (centres the foundation row). */
function descendantCounts(
  stories: TreeStory[],
  dependentsOf: Map<string, string[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of stories) {
    const seen = new Set<string>();
    const stack = [...(dependentsOf.get(s.id) ?? [])];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(dependentsOf.get(id) ?? []));
    }
    counts.set(s.id, seen.size);
  }
  return counts;
}

/** Hex rings a territory of `quota` tiles roughly fills (1 / 7 / 19 / 37 centred counts). */
function ringsOf(quota: number): number {
  return quota <= 1 ? 0 : quota <= 7 ? 1 : quota <= 19 ? 2 : 3;
}

/** Rough px radius a territory will grow to from its tile quota. */
function estRadius(quota: number): number {
  return Math.sqrt(quota) * HEX_W * 0.62 + HEX_R;
}

/** Crown radius of the central story tree — grows with capability count. */
function crownRadius(capCount: number): number {
  return Math.min(32, 18 + 2.2 * capCount);
}

/**
 * How far above its base a story tree reaches, px — the withered bare
 * branches top out at 2.64·R and the canopy at ~2.7·R (StoryTree geometry);
 * +18 covers blob jitter and the signpost. buildWorld uses this for bounds.
 */
function storyTreeReach(capCount: number): number {
  return 2.72 * crownRadius(capCount) + 18;
}

/** ADR-0033 d.3 vocabulary — the one source for every verdict phrase. */
function verdictPhrase(v: TreeVerdict): string {
  return v.outcome === 'pass' ? '✓ proven' : '✗ last run failed';
}

/** A coast dock: a point on the shore plus the coast's outward unit normal
 *  there, so a river can be drawn meeting the shore head-on. (A `Dock` IS a
 *  `Pt`, so every existing reader that needs only x/y keeps working.) */
interface Dock extends Pt {
  nx: number;
  ny: number;
}

/**
 * Where the ray from `t`'s centroid toward `toward` first crosses the smoothed
 * coastline — the real shore point in that direction, with the coast's outward
 * normal there. This is what lets a river dock ON the organic coast instead of
 * on a circle around the centroid. Returns null for a degenerate loop with no
 * crossing (caller falls back to the circle estimate).
 */
function rayCoastIntersect(t: Territory, toward: Pt): Dock | null {
  const dirx = toward.x - t.centroid.x;
  const diry = toward.y - t.centroid.y;
  const dl = Math.hypot(dirx, diry) || 1;
  const ux = dirx / dl;
  const uy = diry / dl;
  let bestS = Infinity;
  let best: Dock | null = null;
  for (const loop of t.coastLoops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      if (!a || !b) continue;
      // ray C + s·U (s>0) vs segment a + r·E (E = b-a, r ∈ [0,1])
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const det = ex * uy - ux * ey;
      if (Math.abs(det) < 1e-6) continue; // parallel
      const wx = a.x - t.centroid.x;
      const wy = a.y - t.centroid.y;
      const s = (ex * wy - wx * ey) / det; // distance along the ray
      const r = (ux * wy - wx * uy) / det; // position along the segment
      if (s <= 0 || r < 0 || r > 1 || s >= bestS) continue;
      bestS = s;
      const el = Math.hypot(ex, ey) || 1;
      let nx = ey / el;
      let ny = -ex / el;
      if (nx * ux + ny * uy < 0) {
        nx = -nx;
        ny = -ny;
      } // orient outward (along the ray)
      best = { x: t.centroid.x + ux * s, y: t.centroid.y + uy * s, nx, ny };
    }
  }
  return best;
}

/** px the dock is tucked inside the coast so the mouth sits under the moat band. */
const MOUTH_INSET = 3.5;

/**
 * A river dock on territory `t`'s coast facing `toward`: the real shore point
 * where the centroid→toward ray meets the smoothed coastline, tucked just inside
 * the moat band so the moat (drawn on top) swallows the seam. Falls back to the
 * old circle estimate (frac·radius) when the coast yields no crossing.
 */
function coastDock(t: Territory, toward: Pt, frac: number, inset: number = MOUTH_INSET): Dock {
  const hit = rayCoastIntersect(t, toward);
  if (hit) {
    return {
      x: hit.x - hit.nx * inset,
      y: hit.y - hit.ny * inset,
      nx: hit.nx,
      ny: hit.ny,
    };
  }
  const dx = toward.x - t.centroid.x;
  const dy = toward.y - t.centroid.y;
  const d = Math.hypot(dx, dy) || 1;
  return {
    x: t.centroid.x + (dx / d) * t.radius * frac,
    y: t.centroid.y + (dy / d) * t.radius * frac,
    nx: dx / d,
    ny: dy / d,
  };
}

/**
 * How far, and which way, to bow a river so it sweeps AROUND any island sitting
 * in the corridor between its endpoints (the river replacement for ADR-0036's
 * span bow, now actively island-aware). Scans the middle stretch for the
 * worst-intruding territory and bows to the opposite side, clearing it plus a
 * margin; with nothing in the way it returns a gentle hashed meander so parallel
 * rivers stay visually distinct. Deterministic — no Math.random.
 */
function avoidanceBow(
  src: Pt,
  dst: Pt,
  territories: Territory[],
  skip: ReadonlySet<string>,
  seed: number,
): number {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  let worst = 0; // signed perpendicular of the most-intruding island
  for (const t of territories) {
    if (skip.has(t.story.id)) continue;
    const vx = t.centroid.x - src.x;
    const vy = t.centroid.y - src.y;
    const along = vx * ux + vy * uy;
    if (along < dist * 0.12 || along > dist * 0.88) continue; // only the middle stretch
    const perp = vx * -uy + vy * ux; // signed offset from the straight line
    const clearance = t.radius + HEX_W;
    const intrusion = clearance - Math.abs(perp);
    if (intrusion <= 0) continue; // already clear of this island
    if (intrusion > Math.abs(worst)) worst = (perp >= 0 ? 1 : -1) * intrusion;
  }
  if (worst === 0) return (rand01(seed) - 0.5) * 0.16 * dist;
  return -(worst >= 0 ? 1 : -1) * Math.min(dist * 0.5, Math.abs(worst) + HEX_W + 14);
}

/**
 * A cubic d-string from `a` to a coast `dock`, bowed `bow` px around any island
 * in the way but with its final handle aligned to the coast's outward normal — so
 * the river arrives PERPENDICULAR to the shore (head-on) and tucks under the moat,
 * instead of clipping the coast at a glancing angle. `flare` is the handle length:
 * longer = a gentler, more frontal approach.
 */
function rivermouthCubic(a: Pt, dock: Dock, bow: number, flare = 11): string {
  const dx = dock.x - a.x;
  const dy = dock.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // the bowed chord midpoint; the first handle reaches toward it so the river
  // still sweeps around an island sitting in the corridor.
  const mx = (a.x + dock.x) / 2 - uy * bow;
  const my = (a.y + dock.y) / 2 + ux * bow;
  const c1x = a.x + (mx - a.x) * 0.7;
  const c1y = a.y + (my - a.y) * 0.7;
  // the second handle sits OUTSIDE the dock along the coast's outward normal, so
  // the curve sweeps in and meets the shore square-on (tangent ‖ inward normal).
  const c2x = dock.x + dock.nx * flare;
  const c2y = dock.y + dock.ny * flare;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${dock.x.toFixed(1)} ${dock.y.toFixed(1)}`;
}

/** One rendered river, resolved in passes (mouth → source dock → path). */
interface RiverRec {
  edge: { from: string; to: string; via: string[] };
  srcT: Territory;
  dstT: Territory;
  aim: Pt; // the mouth — also orients the source-side fan
  mouth: Dock;
  seed: number;
  skip: Set<string>;
  srcDock: Dock; // filled in the source-fan pass (in merge mode, the TRUNK TIP)
  /** Merge mode only: the real coast dock the shared trunk leaves through. The
   *  trunk runs outDock → srcDock(tip); every river in the group then branches
   *  from the shared tip, so the source emits ONE fat channel, not a starburst. */
  outDock?: Dock;
}

/**
 * Build the parallel METRO LANES for a set of rivers that share a destination.
 * Instead of each crossing the map on its own diagonal, they run as evenly-spaced
 * lanes offset off ONE bowed corridor centreline (the sources' barycentre → the
 * mouth-cluster centre), blending out to each river's true source dock and
 * destination mouth at the ends. The lane spacing fans to zero at both ends (so
 * the source delta and the mouth delta are preserved) and opens to LANE_GAP
 * through the middle (so the corridor reads as a tidy braid, not a tangle). All
 * geometry is id-hashed — deterministic, no Math.random.
 */
function laneBundle(bundle: RiverRec[], territories: Territory[]): WorldEdge[] {
  const N = bundle.length;
  const C0: Pt = {
    x: bundle.reduce((s, r) => s + r.srcDock.x, 0) / N,
    y: bundle.reduce((s, r) => s + r.srcDock.y, 0) / N,
  };
  const C1: Pt = {
    x: bundle.reduce((s, r) => s + r.mouth.x, 0) / N,
    y: bundle.reduce((s, r) => s + r.mouth.y, 0) / N,
  };
  const dstId = bundle[0]?.dstT.story.id ?? '';
  const skip = new Set<string>([dstId, ...bundle.map((r) => r.srcT.story.id)]);
  const bow = avoidanceBow(C0, C1, territories, skip, hash(`bundle:${dstId}`));
  // corridor unit direction + its left normal (lane offset axis)
  let ux = C1.x - C0.x;
  let uy = C1.y - C0.y;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const nx = -uy;
  const ny = ux;
  const ctrl: Pt = { x: (C0.x + C1.x) / 2 + nx * bow, y: (C0.y + C1.y) / 2 + ny * bow };
  // Lane order = each river's perpendicular position at the mouth, so adjacent
  // lanes serve adjacent mouths and never cross at the destination.
  const perpAtMouth = (r: RiverRec): number => (r.mouth.x - C1.x) * nx + (r.mouth.y - C1.y) * ny;
  const ordered = [...bundle].sort((a, b) => perpAtMouth(a) - perpAtMouth(b));
  const smooth01 = (x: number): number => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };
  return ordered.map((r, i) => {
    const laneFactor = i - (N - 1) / 2;
    const dOf = (t: number): number => laneFactor * LANE_GAP * Math.sin(Math.PI * t);
    const base = (t: number): Pt => {
      const c = quadPt(C0, ctrl, C1, t);
      const wStart = t < LANE_WINDOW ? smooth01((LANE_WINDOW - t) / LANE_WINDOW) : 0;
      const wEnd = t > 1 - LANE_WINDOW ? smooth01((t - (1 - LANE_WINDOW)) / LANE_WINDOW) : 0;
      return {
        x: c.x + (r.srcDock.x - C0.x) * wStart + (r.mouth.x - C1.x) * wEnd,
        y: c.y + (r.srcDock.y - C0.y) * wStart + (r.mouth.y - C1.y) * wEnd,
      };
    };
    return { ...r.edge, d: offsetCurve(base, dOf, 18) };
  });
}

/**
 * Chain a territory's per-tile-edge boundary segments into ordered closed point
 * loop(s) — the raw, jagged hex-union silhouette. Endpoints are exact hex
 * corners, so we key on rounded coords and walk edge→edge until each loop
 * closes; territories are contiguous, so it's almost always exactly one loop.
 * The trailing point (== the first) is dropped, so callers get a clean ordered
 * ring ready to smooth into an organic coastline.
 */
function boundaryRingLoops(segs: BoundarySeg[]): Pt[][] {
  if (segs.length === 0) return [];
  const k = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
  const adj = new Map<string, BoundarySeg[]>();
  const push = (key: string, s: BoundarySeg): void => {
    const list = adj.get(key);
    if (list) list.push(s);
    else adj.set(key, [s]);
  };
  for (const s of segs) {
    push(k(s.x1, s.y1), s);
    push(k(s.x2, s.y2), s);
  }
  const used = new Set<BoundarySeg>();
  const loops: Pt[][] = [];
  for (const start of segs) {
    if (used.has(start)) continue;
    used.add(start);
    const startKey = k(start.x1, start.y1);
    const loop: Pt[] = [
      { x: start.x1, y: start.y1 },
      { x: start.x2, y: start.y2 },
    ];
    let endKey = k(start.x2, start.y2);
    for (let guard = 0; guard < segs.length && endKey !== startKey; guard++) {
      const next = (adj.get(endKey) ?? []).find((s) => !used.has(s));
      if (!next) break;
      used.add(next);
      const continues = k(next.x1, next.y1) === endKey;
      const nx = continues ? next.x2 : next.x1;
      const ny = continues ? next.y2 : next.y1;
      loop.push({ x: nx, y: ny });
      endKey = k(nx, ny);
    }
    const first = loop[0];
    const last = loop[loop.length - 1];
    if (first && last && Math.abs(first.x - last.x) < 0.5 && Math.abs(first.y - last.y) < 0.5) {
      loop.pop();
    }
    loops.push(loop);
  }
  return loops;
}

/** Signed area (shoelace); its sign carries the winding of an ordered loop. */
function loopSignedArea(loop: Pt[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    if (p && q) a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * The per-vertex beach width: COAST_OUTSET modulated by a deterministic, story-
 * seeded wave so each island gets its OWN gentle bays and headlands instead of a
 * uniform blob. A low-frequency sine (COAST_NOISE_WAVES lobes, phase-shifted per
 * story) carries the big shape; a tiny hashed wobble breaks any remaining
 * regularity. Amplitude is capped well inside the inter-island gap, so coasts
 * can never wander into a neighbour — and (perturbing only the outset MAGNITUDE
 * along the normal) the offset can never self-intersect.
 */
function jitteredOutset(storyId: string, i: number, n: number): number {
  const theta = (i / Math.max(n, 1)) * Math.PI * 2;
  const phase = rand01(hash(`${storyId}:coast:phase`)) * Math.PI * 2;
  const wave = Math.sin(theta * COAST_NOISE_WAVES + phase); // [-1,1], coherent
  const wobble = (rand01(hash(`${storyId}:coast:${i}`)) - 0.5) * 0.6;
  return COAST_OUTSET * (1 + COAST_NOISE_AMP * (0.7 * wave + wobble));
}

/**
 * Push every vertex of a closed loop outward along the average of its two
 * adjacent edge normals by `distOf(i)` px — a thin "beach" margin so the
 * smoothed coast encloses the outermost tiles instead of slicing their corners.
 * Winding-aware (the signed area orients the normal outward), so concave bays
 * stay outward too. The per-vertex distance lets the coast wave (jitteredOutset).
 */
function outsetLoop(loop: Pt[], distOf: (i: number) => number): Pt[] {
  const n = loop.length;
  if (n < 3) return loop;
  const sign = loopSignedArea(loop) > 0 ? 1 : -1;
  const edgeNormal = (a: Pt, b: Pt): Pt => {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: (sign * ey) / len, y: (-sign * ex) / len };
  };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const cur = loop[i];
    const nxt = loop[(i + 1) % n];
    if (!prev || !cur || !nxt) continue;
    const n1 = edgeNormal(prev, cur);
    const n2 = edgeNormal(cur, nxt);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    const dist = distOf(i);
    out.push({ x: cur.x + mx * dist, y: cur.y + my * dist });
  }
  return out;
}

/**
 * Chaikin corner-cutting on a closed loop: every edge contributes its 1/4 and
 * 3/4 points, so each sharp hex corner is replaced by two gentler ones. Two
 * passes turn the hexagonal silhouette into a smooth, organic, blobby coastline
 * (Stålberg/Townscaper-style rounding). Deterministic — pure geometry.
 */
function chaikinClosed(loop: Pt[], iterations: number): Pt[] {
  let cur = loop;
  for (let it = 0; it < iterations && cur.length >= 3; it++) {
    const n = cur.length;
    const next: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      if (!a || !b) continue;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

/**
 * A closed SVG path through a loop's edge MIDPOINTS, each vertex its quadratic
 * control point — a cusp-free curve that closes watertight with Z. After Chaikin
 * this reads as a soft, hand-drawn coastline. The same `d` serves the island's
 * sand fill and its water moat (fill vs stroke of one curve).
 */
function smoothLoopPath(loop: Pt[]): string {
  const n = loop.length;
  if (n < 3) return '';
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const last = loop[n - 1];
  const first = loop[0];
  if (!last || !first) return '';
  const m0 = mid(last, first);
  let d = `M ${m0.x.toFixed(1)} ${m0.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const c = loop[i];
    const nxt = loop[(i + 1) % n];
    if (!c || !nxt) continue;
    const m = mid(c, nxt);
    d += ` Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

/**
 * Turn a territory's raw hex-edge boundary loops into smooth organic coastlines:
 * outset a beach margin, Chaikin-round the corners, emit cusp-free `d` strings.
 * Returns the smoothed point loop(s) (for river docking) alongside the paths.
 */
function smoothCoast(segs: BoundarySeg[], storyId: string): { loops: Pt[][]; paths: string[] } {
  const loops = boundaryRingLoops(segs).map((l) =>
    chaikinClosed(
      outsetLoop(l, (i) => jitteredOutset(storyId, i, l.length)),
      COAST_SMOOTH_ITERS,
    ),
  );
  return { loops, paths: loops.map(smoothLoopPath) };
}

/** px a pond keeps clear of any capability plant on its island. */
const POND_PLANT_CLEAR = 7;
/** smallest visible pond radius (x) — the procedural placer never goes below this. */
const POND_RX_MIN = HEX_R * 0.52;
/** largest pond radius (x) a high-flow lake grows to when the land affords it. */
const POND_RX_MAX = HEX_R * 1.3;
/** points around a pond's raw rim before Chaikin-smoothing. */
const POND_RING_N = 14;

// ---- crescent-coast mode (`?coast=crescent`, owner call 2026-06-17) ----
// "the island pond should scale with the number of connections … create a c shape
// coastline." A busy hub's lake grows with its river DEGREE (√degree, so area ∝
// degree); when the lake outgrows the land we carve a C-shaped BAY into the coast
// that embraces it (cheaper + better-looking than just growing the landmass).
/** px the degree-sized lake grows per unit √degree above the floor. */
const POND_DEGREE_GAIN = HEX_R * 0.55;
/** the cap a degree-sized lake grows to in crescent mode (bigger than POND_RX_MAX —
 *  the grown C-headland gives a hub lake room the plain inland placer never had). */
const POND_RX_MAX_CRESCENT = HEX_R * 2.4;
/** px of beach the grown C-coast keeps between the lake rim and the new shore. */
const POND_BEACH = HEX_R * 0.32;

/**
 * Seat a degree-sized lake on the island's entry shore (crescent mode): a round
 * lake of radius `rxWant` (capped only so a tiny island doesn't get an absurd
 * lake), seated near the `thetaBay` shore so it pokes past the original coastline —
 * the coast is then GROWN around it (embayCoast) into a C that holds the lake with
 * the river-entry side left open. It's seated to clear the central tree crown
 * landward, so the wrapping headland grows seaward instead of drowning the tree.
 * Pure given the territory geometry (hash-seeded rim wobble only). Returns the
 * smoothed loop + centre + realised radius the caller needs to grow the matching C.
 */
function seatCrescentPond(
  t: Territory,
  thetaBay: number,
  rxWant: number,
): { center: Pt; loop: Pt[]; rx: number; shoreDist: number; cdist: number } {
  const crownR = crownRadius(t.story.capabilities.length);
  const dir = { x: Math.cos(thetaBay), y: Math.sin(thetaBay) };
  const far = rayCoastIntersect(t, {
    x: t.centroid.x + dir.x * 2000,
    y: t.centroid.y + dir.y * 2000,
  });
  const shoreDist = far ? Math.hypot(far.x - t.centroid.x, far.y - t.centroid.y) : t.radius;
  // Keep the lake proportionate to the island, but let a hub's lake be genuinely
  // big — the grown C holds whatever pokes past the shore.
  const rx = Math.min(rxWant, t.radius * 0.82);
  // Seat near the shore: enough inland that its landward arc clears the tree crown,
  // so it pokes seaward (and the coast grows out there), opening toward the rivers.
  const cdist = Math.max(shoreDist - rx * 0.35, rx + crownR + POND_PLANT_CLEAR);
  const center = { x: t.centroid.x + dir.x * cdist, y: t.centroid.y + dir.y * cdist };
  const loop = chaikinClosed(pondRing(center, rx, rx * 0.74, hash(t.story.id)), 2);
  return { center, loop, rx, shoreDist, cdist };
}

/**
 * A squashed, hash-jittered closed ring for an inland pond — the raw silhouette
 * fed through the SAME chaikinClosed + smoothLoopPath pipeline as the coastline so
 * a pond's shore reads as the same organic terrain (just smaller). `ry < rx` gives
 * the top-down squash the whole map uses. Deterministic — no Math.random.
 */
function pondRing(center: Pt, rx: number, ry: number, seed: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < POND_RING_N; i++) {
    const a = (i / POND_RING_N) * Math.PI * 2;
    const j = 0.8 + rand01(hash(`pond:${seed}:${i}`)) * 0.4; // 0.8‥1.2 radius wobble
    out.push({ x: center.x + Math.cos(a) * rx * j, y: center.y + Math.sin(a) * ry * j });
  }
  return out;
}

/**
 * PROCEDURAL POND PLACER — every island gets a lake, systematically, never an
 * ad-hoc null. The pond is seated on the side its rivers enter from (`aimDir`),
 * sized to the open water-able land found there: we scan a fan of candidate
 * centres on the entry side, and at each ON-LAND centre the largest pond that fits
 * is bounded by three obstacles — the nearest coast edge (`distToLoop`), the tree
 * crown, and the nearest capability plant. We keep the centre that affords the
 * BIGGEST pond, then grow toward `flow` (a hub gathering more rivers pools into a
 * larger lake) but never past what the land allows. If the island is so tight that
 * nothing roomy fits, we still seat a minimum pond at a guaranteed-on-land anchor
 * between the tree and the entry shore — shrink/relocate deterministically rather
 * than give up. Returns the smoothed loop + centre; null only for a degenerate
 * coastless territory (never happens for a grown island). Deterministic.
 */
function placePond(
  t: Territory,
  aimDir: Pt,
  flow: number,
  aimBias = 0,
): { center: Pt; loop: Pt[] } | null {
  const coast = t.coastLoops[0];
  if (!coast) return null;
  const baseAng = Math.atan2(aimDir.y, aimDir.x);
  const crownR = crownRadius(t.story.capabilities.length);
  const far = rayCoastIntersect(t, {
    x: t.treeSpot.x + aimDir.x * 2000,
    y: t.treeSpot.y + aimDir.y * 2000,
  });
  const maxD = far ? Math.hypot(far.x - t.treeSpot.x, far.y - t.treeSpot.y) : t.radius;
  // Desired radius grows with the flow this lake gathers, capped by POND_RX_MAX.
  const want = Math.min(POND_RX_MAX, HEX_R * (0.72 + Math.min(flow, 5) * 0.1));
  const fan = [0, 0.22, -0.22, 0.45, -0.45, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4];
  // The largest pond that fits at a candidate centre `c` (or ≤0 when `c` is off
  // land or too pinched between coast, crown and plants to hold any pool).
  const fitR = (c: Pt): number => {
    if (!pointInPoly(c, coast)) return -1;
    let r = Math.min(want, distToLoop(c, coast), Math.hypot(c.x - t.treeSpot.x, c.y - t.treeSpot.y) - crownR);
    for (const cap of t.caps) {
      r = Math.min(r, Math.hypot(cap.x - c.x, cap.y - c.y) - POND_PLANT_CLEAR);
      if (r <= 0) break;
    }
    return r;
  };
  // Pick the centre that affords the biggest pond. `aimBias` (px penalty per radian
  // off the entry direction) leans the lake toward where its streams actually dock,
  // so a river flows INTO the lake instead of blunt-ending at the coast while the
  // pool drifts to an empty corner; with aimBias 0 it's pure max-room (a visible
  // pool on every island, the only thing that matters for the no-stream nodes).
  let best: { c: Pt; r: number } | null = null;
  let bestScore = -Infinity;
  for (let d = Math.max(maxD - POND_RX_MIN, crownR); d >= crownR * 0.6; d -= 4) {
    for (const da of fan) {
      const ang = baseAng + da;
      const c = { x: t.treeSpot.x + Math.cos(ang) * d, y: t.treeSpot.y + Math.sin(ang) * d };
      const r = fitR(c);
      const score = r - Math.abs(da) * aimBias;
      if (score > bestScore) {
        bestScore = score;
        best = { c, r };
      }
    }
  }
  // Tight island: no candidate held a real pool. Seat a minimum pond at a point
  // between the tree and the entry shore (on land by construction), shrunk to
  // whatever the coast allows there — a sensible small lake, never a dropped node.
  if (!best || best.r < POND_RX_MIN) {
    const d = Math.max(crownR + POND_RX_MIN, (crownR + maxD) / 2);
    const c = { x: t.treeSpot.x + Math.cos(baseAng) * d, y: t.treeSpot.y + Math.sin(baseAng) * d };
    const rx = Math.max(POND_RX_MIN * 0.78, Math.min(want, pointInPoly(c, coast) ? distToLoop(c, coast) : POND_RX_MIN));
    return { center: c, loop: chaikinClosed(pondRing(c, rx, rx * 0.66, hash(t.story.id)), 2) };
  }
  const rx = Math.max(POND_RX_MIN, best.r);
  return { center: best.c, loop: chaikinClosed(pondRing(best.c, rx, rx * 0.66, hash(t.story.id)), 2) };
}

/** Unit vector a→b (zero-safe). */
function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/**
 * Build the global BASIN river network (the default `merge` mode). The skeleton is
 * a Euclidean MST over the island centroids; every dependency edge is routed along
 * its unique tree path and each MST segment's stroke fattens with how much flow it
 * carries — so the map reads as ONE connected watershed (thick trunks near the
 * foundations thinning to leaf twigs) instead of a tangle of parallel strands.
 * Each segment docks on each endpoint's coast facing the other island (so a stream
 * never cuts across its own island), routes AROUND every third-party island, and
 * ends exactly on a coast dock; every island gets a lake wired to each of its
 * incident streams — so there are no loose ends and no phantom near-misses.
 * Deterministic (hash/MST only, no Math.random).
 */
function buildBasin(
  territories: Territory[],
  opts: { mouthInset: number; tuning: RiverTuning; waterMode: WaterMode; coastMode: CoastMode },
): { edges: WorldEdge[]; inland: InlandWater } {
  const edges: WorldEdge[] = [];
  const inland: InlandWater = { ponds: [], channels: [] };
  const n = territories.length;
  if (n === 0) return { edges, inland };
  const centroids = territories.map((t) => t.centroid);
  const mst = euclideanMST(centroids);
  // Root the drainage at the foundation (the lowest island on the map, max y), so
  // the main stem is fattest at the base and thins to twigs at the leaf stories —
  // the watershed reads bottom-up, matching the dependency layout.
  let root = 0;
  let rootY = -Infinity;
  centroids.forEach((c, i) => {
    if (c.y > rootY) {
      rootY = c.y;
      root = i;
    }
  });
  const flowEdges = treeDrainage(n, mst, root);

  // Island keep-out disks: every stream routes around the third-party islands.
  const disks: Disk[] = territories.map((t) => ({
    x: t.centroid.x,
    y: t.centroid.y,
    r: t.radius + opts.tuning.routeMargin,
  }));
  const docksByIsland: { dock: Dock; flow: number }[][] = territories.map(() => []);
  for (const fe of flowEdges) {
    const ta = territories[fe.a];
    const tb = territories[fe.b];
    if (!ta || !tb) continue;
    const da = coastDock(ta, tb.centroid, 0.96, opts.mouthInset);
    const db = coastDock(tb, ta.centroid, 0.96, opts.mouthInset);
    // Remember each dock's trunk flow, so the inland channel that continues this
    // trunk past the coast carries the SAME flow-width — no pinch where a fat
    // over-sea trunk emerges from under the tiles into its lake.
    const chFlow = Math.max(1, fe.flow);
    docksByIsland[fe.a]?.push({ dock: da, flow: chFlow });
    docksByIsland[fe.b]?.push({ dock: db, flow: chFlow });
    const obstacles = disks.filter((_, i) => i !== fe.a && i !== fe.b);
    const pts = routeAround(da, db, obstacles);
    // Wander the routed centreline so the over-sea river meanders like a real
    // watercourse instead of reading as a routed pipe; seeded per-edge so every
    // river wiggles differently but identically on every render (endpoints pinned,
    // so the dock and mouth stay put). amp 0 ⇒ the old straight-smoothed path.
    const wander = meanderPath(
      pts,
      hash(`${ta.story.id}>${tb.story.id}`),
      opts.tuning.meanderAmp,
      opts.tuning.meanderFreq,
    );
    edges.push({
      from: ta.story.id,
      to: tb.story.id,
      via: [],
      d: smoothOpenPath(wander),
      flow: Math.max(1, fe.flow),
      kind: 'trunk',
    });
  }

  // A lake at every node, wired to each of its incident streams — water reads as
  // flowing lake → stream → lake through the whole basin. The pool sizes to the
  // flow it gathers (a busy junction pools into a bigger lake).
  if (opts.waterMode === 'pond') {
    territories.forEach((t, i) => {
      const ds = docksByIsland[i] ?? [];
      const aim =
        ds.length > 0
          ? unit(t.treeSpot, {
              x: ds.reduce((s, d) => s + d.dock.x, 0) / ds.length,
              y: ds.reduce((s, d) => s + d.dock.y, 0) / ds.length,
            })
          : { x: 0, y: 1 };
      let flow = 0;
      for (const fe of flowEdges) if (fe.a === i || fe.b === i) flow += Math.max(1, fe.flow);
      // CRESCENT MODE (`?coast=crescent`): size the lake by the island's river
      // DEGREE (its incident-stream count) and grow a C of land around it (a bay
      // open toward the rivers). An island with no rivers keeps the ordinary inland
      // pond — there's no entry direction to open a bay toward.
      let pond: { center: Pt; loop: Pt[] } | null;
      if (opts.coastMode === 'crescent' && ds.length > 0) {
        const degree = ds.length;
        const rxWant = pondRadiusForDegree(degree, POND_RX_MIN, POND_DEGREE_GAIN, POND_RX_MAX_CRESCENT);
        // θ_bay = circular mean of the dock bearings around the island centre, so
        // the bay opens toward where the rivers actually enter.
        const thetaBay = circularMeanAngle(
          ds.map((d) => Math.atan2(d.dock.y - t.centroid.y, d.dock.x - t.centroid.x)),
        );
        const seat = seatCrescentPond(t, thetaBay, rxWant);
        pond = { center: seat.center, loop: seat.loop };
        // Grow the C into THIS island's coast: bulge the shore out to wrap the lake
        // (with a beach margin) everywhere except the seaward mouth the rivers enter
        // through, then re-smooth so it reads hand-drawn. Mutates only this
        // territory's coast — edges/docks were already built above off the original
        // shore, and the channels still dock from those original mouths into the
        // lake.
        const coast = t.coastLoops[0];
        if (coast) {
          // The mouth opens toward θ_bay; its half-angle tracks how far the lake
          // pokes past the shore (a lake mostly inland needs only a slim mouth).
          const openHalf = Math.min(0.95, Math.max(0.5, Math.atan2(seat.rx, Math.max(1, seat.cdist)) * 1.05));
          const grown = chaikinClosed(
            embayCoast(coast, seat.center, seat.rx, POND_BEACH, thetaBay, openHalf),
            1,
          );
          if (grown.length >= 3) {
            t.coastLoops = [grown, ...t.coastLoops.slice(1)];
            t.coastPaths = [smoothLoopPath(grown), ...t.coastPaths.slice(1)];
          }
        }
      } else {
        // Bias the lake toward the stream-entry side so the rivers flow INTO it.
        pond = placePond(t, aim, flow, 4);
      }
      if (!pond) return;
      inland.ponds.push({ story: t.story.id, d: smoothLoopPath(pond.loop), loop: pond.loop });
      for (const dk of ds) {
        const dock = rayPolyIntersect(dk.dock, pond.center, pond.loop);
        if (!dock) continue;
        // Flare the channel into the lake (estuary mouth): a longer outward handle
        // at the pond rim so the stream widens and curls into the pool tangentially
        // instead of butting in head-on; flow carries the trunk width for continuity.
        inland.channels.push({
          from: t.story.id,
          to: t.story.id,
          via: [],
          d: rivermouthCubic(dk.dock, dock as Dock, 0, 14),
          flow: dk.flow,
        });
      }
    });
  }
  return { edges, inland };
}

/**
 * Build the EDGE-PATH-BUNDLED river network (`?rivers=bundle`). Unlike the basin
 * (an MST that keeps n−1 edges and discards every other real adjacency), this keeps
 * the WHOLE dependency graph: a long edge whose islands are also reachable via a
 * short hub chain is REROUTED to braid along that chain (so a hub like the library
 * fattens into a trunk many edges flow along), while a direct edge with no cheaper
 * detour stays its own straight channel. Two layers compose the look:
 *   • a THIN tributary per real edge — its endpoints are ALWAYS its own source and
 *     destination docks (the direct-connection signal the MST threw away), so a
 *     dependency can always be traced end to end; and
 *   • a FAT trunk over every shared segment (flow ≥ 2), drawn ON TOP so it covers
 *     the strands braiding along it — the "rivers merge when close" watershed look.
 * Both layers reuse ONE meandered, island-skirting polyline per shared segment, so a
 * trunk covers its tributaries exactly. Ponds are wired per node exactly as the
 * basin does (each coast seam docks into the node's lake). Deterministic.
 */
function buildBundle(
  territories: Territory[],
  edgeList: { from: string; to: string; via: string[] }[],
  opts: {
    mouthInset: number;
    tuning: RiverTuning;
    waterMode: WaterMode;
    bundleD: number;
    bundleDMax: number;
  },
): { edges: WorldEdge[]; inland: InlandWater } {
  const edges: WorldEdge[] = [];
  const inland: InlandWater = { ponds: [], channels: [] };
  const n = territories.length;
  if (n === 0) return { edges, inland };
  const byId = new Map(territories.map((t, i) => [t.story.id, i]));
  const centroids = territories.map((t) => t.centroid);

  // Real depends_on edges as node-index pairs (declared ∪ derived — NOT an MST, so
  // every adjacency survives, the property the basin skeleton destroyed).
  const idxEdges: { a: number; b: number; via: string[] }[] = [];
  for (const e of edgeList) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    idxEdges.push({ a, b, via: e.via });
  }
  if (idxEdges.length === 0) return { edges, inland };

  const bundle = edgePathBundle(
    centroids,
    idxEdges.map((e) => ({ a: e.a, b: e.b })),
    { d: opts.bundleD, dMax: opts.bundleDMax },
  );

  // Every channel skirts third-party islands (a river hugs the open water between).
  const disks: Disk[] = territories.map((t) => ({
    x: t.centroid.x,
    y: t.centroid.y,
    r: t.radius + opts.tuning.routeMargin,
  }));

  // ONE meandered, island-skirting polyline per shared graph segment, coast→coast
  // (stored low→high index). Both the tributary that runs through a segment and the
  // fat trunk that covers it read from this cache, so their geometry is IDENTICAL on
  // the shared stretch (the confluence-mode trick that makes the trunk cover the
  // braid). Coast docks are gathered here too, for the per-island ponds.
  const segGeom = new Map<string, Pt[]>();
  // Each dock remembers its segment's flow, so the inland channel that continues the
  // trunk past the coast carries the SAME flow-width — no pinch where a fat trunk
  // emerges into its lake (the estuary continuity #193 added to the basin).
  const flowByKey = new Map(bundle.segments.map((s) => [segmentKey(s.a, s.b), s.flow]));
  const docksByIsland: { dock: Dock; flow: number }[][] = territories.map(() => []);
  const segGeometry = (u: number, v: number): Pt[] => {
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const key = segmentKey(lo, hi);
    const cached = segGeom.get(key);
    if (cached) return cached;
    const tlo = territories[lo];
    const thi = territories[hi];
    if (!tlo || !thi) {
      segGeom.set(key, []);
      return [];
    }
    const dlo = coastDock(tlo, thi.centroid, 0.96, opts.mouthInset);
    const dhi = coastDock(thi, tlo.centroid, 0.96, opts.mouthInset);
    const chFlow = Math.max(1, flowByKey.get(key) ?? 1);
    docksByIsland[lo]?.push({ dock: dlo, flow: chFlow });
    docksByIsland[hi]?.push({ dock: dhi, flow: chFlow });
    const obstacles = disks.filter((_, i) => i !== lo && i !== hi);
    const routed = routeAround(dlo, dhi, obstacles);
    const wander = meanderPath(
      routed,
      hash(`seg:${tlo.story.id}~${thi.story.id}`),
      opts.tuning.meanderAmp,
      opts.tuning.meanderFreq,
    );
    segGeom.set(key, wander);
    return wander;
  };
  // Pre-route every shared segment so docks are gathered before the ponds are placed.
  for (const s of bundle.segments) segGeometry(s.a, s.b);

  // TRIBUTARY LAYER (one per real edge) — concatenate the routed segments along the
  // edge's path, bridging each interior hub through its centroid (water dips into the
  // hub and out the far side), so the edge reads as ONE channel from its true source
  // dock to its true destination dock: a dependency you can always trace end to end.
  idxEdges.forEach((e, i) => {
    const path = bundle.paths[i] ?? [e.a, e.b];
    const srcId = territories[e.a]?.story.id ?? '';
    const dstId = territories[e.b]?.story.id ?? '';
    const pts: Pt[] = [];
    for (let k = 0; k < path.length - 1; k++) {
      const u = path[k];
      const v = path[k + 1];
      if (u === undefined || v === undefined) continue;
      const geom = segGeometry(u, v);
      if (geom.length < 2) continue;
      const dir = u <= v ? geom : [...geom].reverse();
      if (k === 0) {
        pts.push(...dir);
      } else {
        const cu = centroids[u];
        if (cu) pts.push(cu); // bridge the hub junction through its centroid
        pts.push(...dir);
      }
    }
    if (pts.length < 2) return;
    edges.push({ from: srcId, to: dstId, via: e.via, d: smoothOpenPath(pts) });
  });

  // TRUNK LAYER — a fat channel over every shared segment (flow ≥ 2), pushed AFTER
  // the tributaries so it draws on top and covers the strands braiding along it. The
  // width ramps with the accumulated flow (clamped, so a busy hub trunk reads fat
  // without dwarfing the lone twigs).
  for (const s of bundle.segments) {
    if (s.flow < 2) continue;
    const geom = segGeometry(s.a, s.b);
    if (geom.length < 2) continue;
    edges.push({
      from: territories[s.a]?.story.id ?? '',
      to: territories[s.b]?.story.id ?? '',
      via: [],
      d: smoothOpenPath(geom),
      flow: s.flow,
      kind: 'trunk',
    });
  }

  // A lake at every node (the basin's pond wiring), each incident stream docking into
  // its rim — water reads as lake → stream → lake, and an edge's mouth docking at its
  // destination's pond is the unambiguous "A depends on this hub" signal.
  if (opts.waterMode === 'pond') {
    const islandFlow = new Array<number>(n).fill(0);
    for (const s of bundle.segments) {
      islandFlow[s.a] = (islandFlow[s.a] ?? 0) + s.flow;
      islandFlow[s.b] = (islandFlow[s.b] ?? 0) + s.flow;
    }
    territories.forEach((t, i) => {
      const ds = docksByIsland[i] ?? [];
      const aim =
        ds.length > 0
          ? unit(t.treeSpot, {
              x: ds.reduce((s, d) => s + d.dock.x, 0) / ds.length,
              y: ds.reduce((s, d) => s + d.dock.y, 0) / ds.length,
            })
          : { x: 0, y: 1 };
      const pond = placePond(t, aim, islandFlow[i] ?? 0, 4);
      if (!pond) return;
      inland.ponds.push({ story: t.story.id, d: smoothLoopPath(pond.loop), loop: pond.loop });
      for (const dk of ds) {
        const dock = rayPolyIntersect(dk.dock, pond.center, pond.loop);
        if (!dock) continue;
        // Flare into the lake and carry the trunk's flow-width for continuity (#193).
        inland.channels.push({
          from: t.story.id,
          to: t.story.id,
          via: [],
          d: rivermouthCubic(dk.dock, dock as Dock, 0, 14),
          flow: dk.flow,
        });
      }
    });
  }
  return { edges, inland };
}

function buildWorld(
  stories: TreeStory[],
  opts?: {
    riverMode?: RiverMode;
    moat?: boolean;
    tuning?: RiverTuning;
    waterMode?: WaterMode;
    plantsScatter?: boolean;
    coastMode?: CoastMode;
  },
): HexWorld {
  const riverMode = opts?.riverMode ?? 'strands';
  const moat = opts?.moat ?? true;
  const tuning = opts?.tuning ?? RIVER_TUNING;
  const waterMode = opts?.waterMode ?? 'off';
  const plantsScatter = opts?.plantsScatter ?? false;
  const coastMode = opts?.coastMode ?? 'default';
  const mouthInset = moat ? MOUTH_INSET : tuning.mouthInset;
  const quotas = stories.map((s) => Math.max(3, s.capabilities.length + 2));

  // One edge set drives BOTH the roads and the ranking (declared ∪ derived).
  const edgeList = storyEdges(stories);
  const depsOf = new Map<string, string[]>(stories.map((s) => [s.id, []]));
  const dependentsOf = new Map<string, string[]>(stories.map((s) => [s.id, []]));
  for (const e of edgeList) {
    depsOf.get(e.to)?.push(e.from);
    dependentsOf.get(e.from)?.push(e.to);
  }

  // Dependency-ranked seeds (ADR-0036 d.6a): the most-depended-upon stories sit
  // bottom-centre and dependents fan upward and outward. Rank rows stack from
  // the bottom; within a row, stories order by the barycenter of their already-
  // placed dependencies (load-bearing count for the foundation row).
  const ranks = rankStories(stories, depsOf);
  const loadBearing = descendantCounts(stories, dependentsOf);
  const maxRank = Math.max(0, ...ranks.values());
  const byRank: number[][] = Array.from({ length: maxRank + 1 }, () => []);
  stories.forEach((s, i) => byRank[ranks.get(s.id) ?? 0]?.push(i));

  // Row centre-lines, bottom-up: clearance for the tallest territory on each side.
  const rowY: number[] = [];
  let yCursor = 0;
  for (let r = 0; r <= maxRank; r++) {
    const tallest = Math.max(...(byRank[r] ?? []).map((i) => estRadius(quotas[i] ?? 3)), HEX_R);
    if (r === 0) yCursor = -tallest;
    else {
      const below = Math.max(
        ...(byRank[r - 1] ?? []).map((i) => estRadius(quotas[i] ?? 3)),
        HEX_R,
      );
      yCursor -= below + tallest + RANK_GAP;
    }
    rowY.push(yCursor);
  }

  const seedPx = new Map<number, Pt>();
  const baryOf = (idx: number): number => {
    const s = stories[idx];
    if (!s) return 0;
    const xs = (depsOf.get(s.id) ?? [])
      .map((d) => stories.findIndex((o) => o.id === d))
      .filter((j) => j >= 0 && seedPx.has(j))
      .map((j) => seedPx.get(j)?.x ?? 0);
    return xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0;
  };
  for (let r = 0; r <= maxRank; r++) {
    const row = byRank[r] ?? [];
    const ordered = [...row].sort((a, b) => {
      const sa = stories[a];
      const sb = stories[b];
      if (!sa || !sb) return 0;
      if (r === 0) {
        // Foundation row: most load-bearing in the middle, others outward.
        return (loadBearing.get(sb.id) ?? 0) - (loadBearing.get(sa.id) ?? 0);
      }
      return baryOf(a) - baryOf(b) || (hash(sa.id) % 997) - (hash(sb.id) % 997);
    });
    // Pack the row left-to-right around its dependency barycenter. The
    // foundation row interleaves centre-out (most load-bearing in the middle).
    let display = ordered;
    if (r === 0) {
      display = [];
      ordered.forEach((i, k) => {
        if (k % 2 === 0) display.push(i);
        else display.unshift(i);
      });
    }
    const sequence = display.map((idx) => ({ idx, w: estRadius(quotas[idx] ?? 3) }));
    const total =
      sequence.reduce((sum, s) => sum + 2 * s.w, 0) + ISLAND_GAP * Math.max(0, sequence.length - 1);
    // A lone island would otherwise sit directly on top of its dependencies,
    // stacking every road into one vertical corridor — swing it to an
    // alternating side so roads sweep as separated diagonals (the dbt-DAG read).
    let rowCenter =
      r === 0 ? 0 : display.reduce((sum, i) => sum + baryOf(i), 0) / Math.max(display.length, 1);
    if (r > 0 && sequence.length === 1) rowCenter += (r % 2 === 1 ? 1 : -1) * RANK_SWING;
    let xCursor = rowCenter - total / 2;
    for (const s of sequence) {
      const story = stories[s.idx];
      const seedH = hash(story?.id ?? String(s.idx));
      seedPx.set(s.idx, {
        x: xCursor + s.w + (rand01(seedH) - 0.5) * 44,
        y: (rowY[r] ?? 0) + (rand01(seedH + 1) - 0.5) * 30,
      });
      xCursor += 2 * s.w + ISLAND_GAP;
    }
  }

  // Snap seeds to the hex lattice, then enforce a growth floor: two seeds
  // closer than their combined ring reach would strangle each other's quota.
  const seeds: Axial[] = stories.map((_, i) => pixelToHex(seedPx.get(i) ?? { x: 0, y: 0 }));
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        const a = seeds[i];
        const b = seeds[j];
        if (!a || !b) continue;
        const floor = ringsOf(quotas[i] ?? 3) + ringsOf(quotas[j] ?? 3) + 1;
        if (hexDist(a, b) < floor) {
          seeds[j] = { q: b.q + 1, r: b.r }; // deterministic eastward nudge
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Grow territories round-robin: each story claims its cheapest frontier hex
  // (closest to seed, hash-jittered for organic coastlines) until its quota —
  // a tile per capability plus breathing room — is met.
  const owner = new Map<string, number>();
  const tilesByStory: Axial[][] = stories.map(() => []);
  seeds.forEach((seed, i) => {
    owner.set(axialKey(seed), i);
    tilesByStory[i]?.push(seed);
  });
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < stories.length; i++) {
      const mine = tilesByStory[i];
      const seed = seeds[i];
      const story = stories[i];
      const quota = quotas[i];
      if (!mine || !seed || !story || quota === undefined || mine.length >= quota) continue;
      let best: Axial | null = null;
      let bestCost = Infinity;
      for (const t of mine) {
        for (const d of AXIAL_DIRS) {
          const cand = { q: t.q + d.q, r: t.r + d.r };
          const key = axialKey(cand);
          if (owner.has(key)) continue;
          const cost = hexDist(seed, cand) + rand01(hash(`${story.id}:${key}`)) * 1.4;
          if (cost < bestCost) {
            bestCost = cost;
            best = cand;
          }
        }
      }
      if (best) {
        owner.set(axialKey(best), i);
        mine.push(best);
        progress = true;
      }
    }
  }

  // Per-territory contents.
  const territories: Territory[] = stories.map((story, i) => {
    const tiles = tilesByStory[i] ?? [];
    const seed = seeds[i] ?? { q: 0, r: 0 };
    const centers = tiles.map(hexCenter);
    const centroid: Pt = {
      x: centers.reduce((s, p) => s + p.x, 0) / Math.max(centers.length, 1),
      y: centers.reduce((s, p) => s + p.y, 0) / Math.max(centers.length, 1),
    };
    const radius =
      Math.max(0, ...centers.map((p) => Math.hypot(p.x - centroid.x, p.y - centroid.y))) +
      HEX_R;

    // The story's own tree takes the tile nearest the centroid; capabilities
    // garden in a squashed ring around it (walked inward until they sit on
    // owned land); leftover tiles grow sparser decoration so the big tree
    // dominates the island.
    const centerTile =
      [...tiles].sort((a, b) => {
        const ca = hexCenter(a);
        const cb = hexCenter(b);
        return (
          Math.hypot(ca.x - centroid.x, ca.y - centroid.y) -
          Math.hypot(cb.x - centroid.x, cb.y - centroid.y)
        );
      })[0] ?? seed;
    const treeSpot = hexCenter(centerTile);
    const crownR = crownRadius(story.capabilities.length);
    const ringR = Math.max(crownR * 0.9, Math.min(crownR + 18, radius - HEX_R * 0.55));
    // Front 240° arc only (centred south) — a plant behind the tree would
    // vanish under the canopy.
    const ARC = (Math.PI * 4) / 3;
    const caps: CapSpot[] = story.capabilities.map((cap, j) => {
      const n = story.capabilities.length;
      // `?plants=scatter` (VISUAL SPIKE): keep the rough angular slot (so plants
      // never clump) but widen the angle wobble and spread the radius across a
      // BAND rather than one ring, so the garden reads as an organic orchard
      // instead of a rigid arc — most visible on the high-cap islands. Plants stay
      // in the front arc (else they hide under the canopy) and clear of the trunk.
      const slot = -Math.PI / 6 + ((j + 0.5) / n) * ARC;
      const jitterA =
        (rand01(hash(`${story.id}:${cap.id}:a`)) - 0.5) * (ARC / n) * (plantsScatter ? 1.5 : 0.5);
      const angle = slot + jitterA;
      const rr = plantsScatter
        ? Math.max(
            crownR * 0.95,
            ringR * (0.62 + rand01(hash(`${story.id}:${cap.id}:rb`)) * 0.72),
          )
        : ringR + (rand01(hash(`${story.id}:${cap.id}:r`)) - 0.5) * 10;
      let x = treeSpot.x + Math.cos(angle) * rr;
      let y = treeSpot.y + Math.sin(angle) * rr * 0.66; // top-down squash
      for (let k = 0; k < 4 && owner.get(axialKey(pixelToHex({ x, y }))) !== i; k++) {
        x += (treeSpot.x - x) * 0.25;
        y += (treeSpot.y - y) * 0.25;
      }
      return { cap, x, y };
    });

    const decor: DecorSpot[] = [];
    const wheatTiles = new Set<string>();
    for (const tile of tiles) {
      const key = axialKey(tile);
      if (key === axialKey(centerTile)) continue; // the story tree's clearing
      const roll = rand01(hash(`${story.id}:decor:${key}`));
      const c = hexCenter(tile);
      const nearTree = Math.hypot(c.x - treeSpot.x, c.y - treeSpot.y) < crownR + 20;
      if (roll < 0.34 && !nearTree) {
        decor.push({ x: c.x, y: c.y, seed: hash(`${key}:f`) });
      } else if (roll >= 0.34 && roll < 0.62) {
        wheatTiles.add(key); // wheat is a tile-top fill, not a flora drawable
      }
    }

    // Territory boundary: every tile edge whose neighbour is foreign soil.
    const mineSet = new Set(tiles.map(axialKey));
    const boundary: BoundarySeg[] = [];
    for (const tile of tiles) {
      const c = hexCenter(tile);
      const corners = hexCorners(c.x, c.y, HEX_R);
      AXIAL_DIRS.forEach((d, e) => {
        if (mineSet.has(axialKey({ q: tile.q + d.q, r: tile.r + d.r }))) return;
        const a = corners[e];
        const b = corners[(e + 1) % 6];
        if (a && b) boundary.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      });
    }

    const labelY = Math.max(...centers.map((p) => p.y), centroid.y) + HEX_R + TILE_DEPTH + 8;
    const coast = smoothCoast(boundary, story.id);
    return {
      story,
      tiles,
      centroid,
      radius,
      treeSpot,
      caps,
      decor,
      wheatTiles,
      coastPaths: coast.paths,
      coastLoops: coast.loops,
      labelY,
    };
  });

  // The pale coast: up to two rings of unclaimed hexes around the land.
  const empties: Axial[] = [];
  const emptySet = new Set<string>();
  let ring: Axial[] = [...owner.keys()].map((k) => {
    const parts = k.split(',');
    return { q: Number(parts[0]), r: Number(parts[1]) };
  });
  for (let depth = 0; depth < 2; depth++) {
    const next: Axial[] = [];
    for (const t of ring) {
      for (const d of AXIAL_DIRS) {
        const cand = { q: t.q + d.q, r: t.r + d.r };
        const key = axialKey(cand);
        if (owner.has(key) || emptySet.has(key)) continue;
        // Thin the outer ring for an organic coastline.
        if (depth === 1 && rand01(hash(`coast:${key}`)) < 0.45) continue;
        emptySet.add(key);
        empties.push(cand);
        next.push(cand);
      }
    }
    ring = next;
  }

  // Global back-to-front tile order so extrusions layer correctly.
  const drawTiles = [...owner.entries()]
    .map(([key, idx]) => {
      const parts = key.split(',');
      return { h: { q: Number(parts[0]), r: Number(parts[1]) }, owner: idx };
    })
    .sort((a, b) => a.h.r - b.h.r || a.h.q - b.h.q);

  // Rivers render the SAME edge set the ranking used (declared ∪ derived). Each is
  // resolved in THREE passes so each builds on the one before:
  //   A — MOUTHS: several deps of one story do NOT merge into a trunk; they land
  //       as a fanned DELTA of separate mouths along the destination coast,
  //       ordered by approach angle.
  //   B — SOURCE DOCKS: a heavily-depended-upon island would otherwise dock all
  //       its outgoing rivers at nearly one northward point (an ugly starburst),
  //       so each source fans its docks across its own shore too.
  //   C — PATHS: a lone river meets its mouth head-on (rivermouthCubic); a group
  //       sharing a destination runs as parallel METRO LANES (laneBundle), so the
  //       central corridor reads as a tidy braid instead of a crossing tangle.
  const byId = new Map(territories.map((t, i) => [t.story.id, i]));
  const incomingByTo = new Map<string, { from: string; to: string; via: string[] }[]>();
  for (const e of edgeList) {
    const list = incomingByTo.get(e.to);
    if (list) list.push(e);
    else incomingByTo.set(e.to, [e]);
  }
  // RIVER NETWORK. DEFAULT (`merge`) = the global BASIN (MST skeleton + flow-weighted
  // trunks, built by buildBasin). The comparison modes (`confluence`, `strands`) build
  // one strand per dependency edge in the three passes below.
  let edges: WorldEdge[] = [];
  let inland: InlandWater = { ponds: [], channels: [] };

  if (riverMode === 'merge') {
    ({ edges, inland } = buildBasin(territories, { mouthInset, tuning, waterMode, coastMode }));
  } else if (riverMode === 'bundle') {
    ({ edges, inland } = buildBundle(territories, edgeList, {
      mouthInset,
      tuning,
      waterMode,
      bundleD: tuning.bundleD,
      bundleDMax: tuning.bundleDMax,
    }));
  }

  if (riverMode !== 'merge' && riverMode !== 'bundle') {
  const rivers: RiverRec[] = [];

  // Pass A — destination mouths.
  for (const [toId, incoming] of incomingByTo) {
    const b = territories[byId.get(toId) ?? -1];
    if (!b) continue;
    const sources = incoming
      .map((e) => ({ e, a: territories[byId.get(e.from) ?? -1] }))
      .filter((s): s is { e: (typeof incoming)[number]; a: Territory } => Boolean(s.a));
    if (sources.length === 0) continue;
    // The mouth cluster faces the barycentre of this story's deps.
    const bary: Pt = {
      x: sources.reduce((s, x) => s + x.a.centroid.x, 0) / sources.length,
      y: sources.reduce((s, x) => s + x.a.centroid.y, 0) / sources.length,
    };
    const record = (
      e: { from: string; to: string; via: string[] },
      a: Territory,
      mouth: Dock,
    ): void => {
      rivers.push({
        edge: e,
        srcT: a,
        dstT: b,
        aim: mouth,
        mouth,
        seed: hash(`${e.from}->${toId}`),
        skip: new Set([a.story.id, b.story.id]),
        srcDock: mouth, // placeholder until pass B fans the source dock
      });
    };
    if (sources.length === 1) {
      const only = sources[0];
      if (!only) continue;
      // Docks on the destination's REAL coast facing its dep.
      record(only.e, only.a, coastDock(b, bary, 0.96, mouthInset));
      continue;
    }
    if (riverMode === 'confluence') {
      // CONFLUENCE: the incoming rivers braid into ONE trunk offshore and land at a
      // SINGLE shared mouth (the confluence inlet), instead of a fanned delta of
      // separate mouths — so the destination reads as fed by one channel.
      const mouth = coastDock(b, bary, 0.96, mouthInset);
      for (const s of sources) record(s.e, s.a, mouth);
      continue;
    }
    // Fan a mouth per dep along the destination coast, ordered by approach angle.
    const c = b.centroid;
    const baryAng = Math.atan2(bary.y - c.y, bary.x - c.x);
    const angOf = (t: Territory): number => Math.atan2(t.centroid.y - c.y, t.centroid.x - c.x);
    const ordered = sources
      .map((s) => ({
        s,
        rel: Math.atan2(Math.sin(angOf(s.a) - baryAng), Math.cos(angOf(s.a) - baryAng)),
      }))
      .sort((x, y) => x.rel - y.rel);
    const n = ordered.length;
    const spread = Math.min(RIVER_FAN_MAX, (n - 1) * RIVER_FAN_STEP);
    ordered.forEach(({ s }, i) => {
      const ang = baryAng - spread / 2 + (spread * i) / (n - 1);
      const toward: Pt = {
        x: c.x + Math.cos(ang) * b.radius * 2,
        y: c.y + Math.sin(ang) * b.radius * 2,
      };
      record(s.e, s.a, coastDock(b, toward, 0.96, mouthInset));
    });
  }

  // Pass B — source docks: fan each source island's outgoing rivers along its
  // shore so the delta reads as separate strands instead of a starburst. Ordered
  // by aim angle around the circular mean. A lone outgoing river docks directly.
  const riversBySrc = new Map<string, RiverRec[]>();
  for (const r of rivers) {
    const list = riversBySrc.get(r.srcT.story.id);
    if (list) list.push(r);
    else riversBySrc.set(r.srcT.story.id, [r]);
  }
  for (const group of riversBySrc.values()) {
    const srcT = group[0]?.srcT;
    if (!srcT) continue;
    const c = srcT.centroid;
    if (group.length === 1) {
      const r = group[0];
      if (r) r.srcDock = coastDock(srcT, r.aim, 0.96);
      continue;
    }
    if (riverMode === 'confluence') {
      // CONFLUENCE: collapse the whole outgoing fan into ONE trunk. Leave through a
      // single dock aimed at the barycentre of the mouths, run out perpendicular
      // to the shore for a trunk length, and hand every river the SHARED tip as
      // its source — so they all branch from one fat channel instead of spraying
      // a dozen strands across the shore (the library starburst).
      const meanAim: Pt = {
        x: group.reduce((s, r) => s + r.aim.x, 0) / group.length,
        y: group.reduce((s, r) => s + r.aim.y, 0) / group.length,
      };
      const dock = coastDock(srcT, meanAim, 0.96);
      const dists = group.map((r) => Math.hypot(r.mouth.x - dock.x, r.mouth.y - dock.y));
      const meanDist = dists.reduce((s, d) => s + d, 0) / dists.length;
      const minDist = Math.min(...dists);
      // The trunk runs MOST of the way to the destinations and forks only near
      // them (a river splitting into a delta), instead of branching at the shore.
      // Never overshoot the nearest mouth (else its branch would U-turn back).
      const len = Math.max(HEX_W, Math.min(minDist * 0.9, meanDist * tuning.trunkFrac));
      const tip: Dock = { x: dock.x + dock.nx * len, y: dock.y + dock.ny * len, nx: dock.nx, ny: dock.ny };
      for (const r of group) {
        r.outDock = dock;
        r.srcDock = tip; // every downstream pass branches from the shared tip
      }
      continue;
    }
    const angs = group.map((r) => Math.atan2(r.aim.y - c.y, r.aim.x - c.x));
    const mean = Math.atan2(
      angs.reduce((p, a) => p + Math.sin(a), 0),
      angs.reduce((p, a) => p + Math.cos(a), 0),
    );
    const ordered = group
      .map((r, i) => ({
        r,
        rel: Math.atan2(Math.sin((angs[i] ?? 0) - mean), Math.cos((angs[i] ?? 0) - mean)),
      }))
      .sort((a, b) => a.rel - b.rel);
    const n = ordered.length;
    const spread = Math.min(RIVER_FAN_MAX, (n - 1) * RIVER_FAN_STEP);
    ordered.forEach(({ r }, i) => {
      const ang = mean - spread / 2 + (spread * i) / (n - 1);
      const toward: Pt = {
        x: c.x + Math.cos(ang) * srcT.radius * 2,
        y: c.y + Math.sin(ang) * srcT.radius * 2,
      };
      r.srcDock = coastDock(srcT, toward, 0.96);
    });
  }

  // Pass C — paths. STRANDS: a lone river meets its mouth head-on; a co-destination
  // group becomes parallel metro lanes (laneBundle). CONFLUENCE: a co-destination
  // group is fused into a CONFLUENCE TREE (tributaries braiding into one stem) and
  // every edge is routed AROUND third-party islands.
  edges = [];
  const riversByDst = new Map<string, RiverRec[]>();
  for (const r of rivers) {
    const list = riversByDst.get(r.dstT.story.id);
    if (list) list.push(r);
    else riversByDst.set(r.dstT.story.id, [r]);
  }
  // Island obstacles for the merge-mode router: each territory as a keep-out disk
  // (its hull radius plus a margin), minus a per-route skip set (a river never
  // avoids its OWN source or destination island).
  const diskOf = (t: Territory): Disk => ({
    x: t.centroid.x,
    y: t.centroid.y,
    r: t.radius + tuning.routeMargin,
  });
  const obstaclesExcept = (skip: ReadonlySet<string>): Disk[] =>
    territories.filter((t) => !skip.has(t.story.id)).map(diskOf);
  /** A point a short flare offshore of a coast mouth (along its outward normal),
   *  where the merged trunk fuses before diving head-on into the single mouth. */
  const offshore = (m: Dock): Pt => ({ x: m.x + m.nx * MOUTH_FLARE, y: m.y + m.ny * MOUTH_FLARE });

  if (riverMode === 'confluence') {
    for (const bundle of riversByDst.values()) {
      const b = bundle[0]?.dstT;
      if (!b || bundle.length === 0) continue;
      const mouth = bundle[0]?.mouth;
      if (!mouth) continue;
      const sink = offshore(mouth); // fuse just offshore, then one head-on dive
      if (bundle.length === 1) {
        const r = bundle[0];
        if (!r) continue;
        const pts = routeAround(r.srcDock, sink, obstaclesExcept(r.skip));
        edges.push({ ...r.edge, d: smoothOpenPath([...pts, mouth]) });
        continue;
      }
      const net = confluenceTree(
        bundle.map((r) => r.srcDock),
        sink,
        tuning.confluencePull,
      );
      // Which source islands share each tree edge (for obstacle exclusion).
      const edgeSrc: Set<string>[] = net.edges.map(() => new Set<string>());
      bundle.forEach((r, ri) => {
        for (const ei of net.routeOf[ri] ?? []) edgeSrc[ei]?.add(r.srcT.story.id);
      });
      // Route each tree edge around third-party islands ONCE, so the rivers and
      // the fat trunk that covers them share identical geometry on shared edges.
      const routed: Pt[][] = net.edges.map((e, ei) => {
        const skip = new Set<string>([b.story.id, ...(edgeSrc[ei] ?? [])]);
        return routeAround(e.a, e.b, obstaclesExcept(skip));
      });
      const rootIdx = net.edges.length - 1;
      // Each river: its head→sink chain of routed edges, then the head-on mouth.
      bundle.forEach((r, ri) => {
        const chain: Pt[] = [r.srcDock];
        for (const ei of net.routeOf[ri] ?? []) {
          const seg = routed[ei] ?? [];
          for (let k = 1; k < seg.length; k++) {
            const p = seg[k];
            if (p) chain.push(p);
          }
        }
        chain.push(mouth); // chain ends offshore at `sink`; dive into the mouth
        edges.push({ ...r.edge, d: smoothOpenPath(chain) });
      });
      // Confluence TRUNK stubs (flow ≥ 2) fatten the shared stems — drawn last so
      // a fat fused channel covers the base-width tributaries braiding into it.
      net.edges.forEach((e, ei) => {
        if (e.flow < 2) return;
        const seg = [...(routed[ei] ?? [e.a, e.b])];
        if (ei === rootIdx) seg.push(mouth); // the root trunk reaches the coast
        edges.push({
          from: b.story.id,
          to: `${b.story.id}#conf-${ei}`,
          via: [],
          d: smoothOpenPath(seg),
          flow: e.flow,
          kind: 'trunk',
        });
      });
    }
  } else {
    for (const bundle of riversByDst.values()) {
      if (bundle.length === 1) {
        const r = bundle[0];
        if (!r) continue;
        const bow = avoidanceBow(r.srcDock, r.mouth, territories, r.skip, r.seed);
        edges.push({ ...r.edge, d: rivermouthCubic(r.srcDock, r.mouth, bow) });
        continue;
      }
      edges.push(...laneBundle(bundle, territories));
    }
  }

  // Confluence mode — emit the shared TRUNK stubs LAST (drawn on top within each
  // water pass), so a source's fat trunk fuses over the tails of the rivers branching
  // from its tip: the island reads as emitting one channel that forks downstream,
  // not a starburst. flow = how many rivers the trunk gathers (drives its width).
  if (riverMode === 'confluence') {
    for (const group of riversBySrc.values()) {
      const r0 = group[0];
      if (!r0 || group.length < 2 || !r0.outDock) continue;
      // Route the source trunk (shore dock → offshore tip) around any island in
      // its corridor, the same router the confluence edges use.
      const skip = new Set<string>([r0.srcT.story.id, ...group.map((r) => r.dstT.story.id)]);
      const pts = routeAround(r0.outDock, r0.srcDock, obstaclesExcept(skip));
      edges.push({
        from: r0.srcT.story.id,
        to: `${r0.srcT.story.id}#trunk`,
        via: [],
        d: smoothOpenPath(pts),
        flow: group.length,
        kind: 'trunk',
      });
    }
  }

  // Inland water (`?water=pond|through`) — built AFTER the rivers so each river's
  // coast mouth is the seam the inland flow continues from. The over-sea river
  // edges are left untouched (they still bank into the beach below the tiles); the
  // inland geometry here is rendered in its own ABOVE-tiles passes.
  inland = { ponds: [], channels: [] };
  if (waterMode === 'pond') {
    // POND-JUNCTION NETWORK: every node a river touches gets ONE pond hub, and the
    // dependency rivers connect THROUGH it — incoming rivers end at the pond,
    // OUTGOING rivers leave from it — so the map reads as lakes linked by streams
    // (water flows in → pond → out) and the pond is where a node's flows gather.
    // Each coast seam (an incoming mouth or an outgoing trunk dock) is recorded
    // against its node; the channel that carries it inland keeps the river's real
    // from/to so focus dimming matches the over-sea rivers.
    interface CoastSeam {
      pt: Dock;
      from: string;
      to: string;
    }
    const seamsByNode = new Map<string, CoastSeam[]>();
    const addSeam = (id: string, seam: CoastSeam): void => {
      const list = seamsByNode.get(id);
      if (list) list.push(seam);
      else seamsByNode.set(id, [seam]);
    };
    // Incoming: each destination's mouth(s). Confluence shares ONE mouth per dest.
    for (const [dstId, bundle] of riversByDst) {
      const feeders = riverMode === 'confluence' ? bundle.slice(0, 1) : bundle;
      for (const r of feeders) addSeam(dstId, { pt: r.mouth, from: r.srcT.story.id, to: dstId });
    }
    // Outgoing: each source's coast outflow dock (the confluence trunk's outDock,
    // else the source dock). Confluence emits ONE outflow per source; strands one each.
    for (const [srcId, group] of riversBySrc) {
      if (riverMode === 'confluence') {
        const r0 = group[0];
        if (!r0) continue;
        addSeam(srcId, { pt: (r0.outDock ?? r0.srcDock) as Dock, from: srcId, to: r0.dstT.story.id });
      } else {
        for (const r of group) addSeam(srcId, { pt: r.srcDock, from: srcId, to: r.dstT.story.id });
      }
    }
    // EVERY territory gets a pond (the procedural placer never fails) — the map
    // reads as a network of lakes, one per node, linked by streams. A node's pond
    // is aimed at the mean of its coast seams (both incoming and outgoing sides) so
    // a mid-DAG junction pools where the water flows through; a node with no rivers
    // opens its lake toward the south shore (where the network generally enters).
    for (const t of territories) {
      const id = t.story.id;
      const seams = seamsByNode.get(id) ?? [];
      const mean: Pt = seams.length
        ? {
            x: seams.reduce((s, c) => s + c.pt.x, 0) / seams.length,
            y: seams.reduce((s, c) => s + c.pt.y, 0) / seams.length,
          }
        : { x: t.treeSpot.x, y: t.treeSpot.y + 100 };
      const pond = placePond(t, unit(t.treeSpot, mean), seams.length);
      if (!pond) continue;
      inland.ponds.push({ story: id, d: smoothLoopPath(pond.loop), loop: pond.loop });
      // Each seam continues from its coast point to the pond rim, head-on.
      for (const c of seams) {
        const dock = rayPolyIntersect(c.pt, pond.center, pond.loop);
        if (!dock) continue;
        inland.channels.push({
          from: c.from,
          to: c.to,
          via: [],
          d: rivermouthCubic(c.pt, dock as Dock, 0, 8),
        });
      }
    }
  } else if (waterMode === 'through') {
    // A single channel crosses each island that has incoming rivers: it enters on
    // the coast its rivers approach and exits the coast facing its dependents, bowed
    // around the crown so it skirts the tree rather than running through it.
    for (const [dstId, bundle] of riversByDst) {
      const b = bundle[0]?.dstT;
      if (!b || bundle.length === 0) continue;
      const meanMouth: Pt = {
        x: bundle.reduce((s, r) => s + r.mouth.x, 0) / bundle.length,
        y: bundle.reduce((s, r) => s + r.mouth.y, 0) / bundle.length,
      };
      const deps = bundle.map((r) => r.srcT);
      // exit faces the barycentre of this island's dependents; with none, it exits
      // straight opposite the entry (the channel reads as passing clean through).
      const dependents = (dependentsOf.get(dstId) ?? [])
        .map((id) => territories[byId.get(id) ?? -1])
        .filter((x): x is Territory => Boolean(x));
      const entry = coastDock(b, meanMouth, 0.96, mouthInset);
      const exitToward: Pt = dependents.length
        ? {
            x: dependents.reduce((s, t) => s + t.centroid.x, 0) / dependents.length,
            y: dependents.reduce((s, t) => s + t.centroid.y, 0) / dependents.length,
          }
        : { x: 2 * b.centroid.x - meanMouth.x, y: 2 * b.centroid.y - meanMouth.y };
      const exit = coastDock(b, exitToward, 0.96, mouthInset);
      // Bow the crossing to the side of the tree that keeps it clearest of plants.
      const mid: Pt = { x: (entry.x + exit.x) / 2, y: (entry.y + exit.y) / 2 };
      const ax = unit(entry, exit);
      const nrm: Pt = { x: -ax.y, y: ax.x };
      const crownR = crownRadius(b.story.capabilities.length);
      const sideClear = (sign: number): number => {
        const c = { x: mid.x + nrm.x * sign * (crownR + 10), y: mid.y + nrm.y * sign * (crownR + 10) };
        return Math.min(...b.caps.map((cap) => Math.hypot(cap.x - c.x, cap.y - c.y)), Infinity);
      };
      const sign = sideClear(1) >= sideClear(-1) ? 1 : -1;
      const ctrl: Pt = {
        x: mid.x + nrm.x * sign * (crownR + 12),
        y: mid.y + nrm.y * sign * (crownR + 12),
      };
      const seed = deps[0]?.story.id ?? dstId;
      inland.channels.push({
        from: seed,
        to: dstId,
        via: [],
        d: smoothOpenPath([entry, ctrl, exit]),
      });
    }
  }
  } // end comparison-mode (strands / confluence) river construction

  // Scene bounds over every tile (claimed + coast), plus label + tree space.
  const allCenters = [...drawTiles.map((t) => hexCenter(t.h)), ...empties.map(hexCenter)];
  const minX = Math.min(...allCenters.map((p) => p.x)) - HEX_W / 2 - MARGIN;
  const maxX = Math.max(...allCenters.map((p) => p.x)) + HEX_W / 2 + MARGIN;
  const minY =
    Math.min(
      ...allCenters.map((p) => p.y - HEX_R),
      ...territories.map((t) => t.treeSpot.y - storyTreeReach(t.story.capabilities.length)),
    ) - MARGIN;
  const maxY =
    Math.max(...allCenters.map((p) => p.y), ...territories.map((t) => t.labelY + 34)) +
    HEX_R +
    TILE_DEPTH +
    MARGIN / 2;

  return {
    territories,
    empties,
    drawTiles,
    edges,
    inland,
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
    offset: { x: -minX, y: -minY },
  };
}

// ---------- relaxed substrate (VISUAL SPIKE, ADR-pending) ----------
//
// Swaps the regular hex-tile interiors for an irregular, relaxed grid (Oskar
// Stålberg / Townscaper style) so each island reads as one organic landmass
// instead of a cluster of hexagons. `mesh` (path B) is now the DEFAULT world
// (owner look-decision 2026-06-16); `?substrate=hex` (aliases `none`/`default`/
// `classic`) returns the original extruded hex world, and `?substrate=…` selects
// any of the three relaxed techniques:
//
//   `relaxed-hex`  — cheap path: relax the SHARED hex-corner lattice (dedupe each
//                    unique corner, hash-jitter + Laplacian-relax the interior
//                    ones, rebuild each tile from its now-displaced shared corners
//                    so adjacent tiles stay gap-free). Wobbly irregular hexagons.
//   `relaxed-quad` — path A: subdivide every hex into 6 quads (centre →
//                    edge-midpoints → corners), then jitter + relax the shared
//                    vertex mesh. The Townscaper cobble look (`relaxed` aliases it).
//                    Residual "hexy" read: every hex contributes a fixed 6-quad
//                    fan meeting at a centre vertex → a pinwheel on a regular
//                    lattice of hex centres that jitter softens but can't erase.
//   `mesh`         — path B (`path-b` aliases it): the FAITHFUL Townscaper /
//                    Stålberg irregular-quad mesh (a port of
//                    kchapelier/hexagrid-relaxing). Triangulate the land, randomly
//                    (deterministically) MERGE adjacent triangle PAIRS into quads —
//                    crucially across hex boundaries — subdivide each quad → 4 /
//                    leftover tri → 3, then relax. The random cross-hex merge
//                    dissolves path A's pinwheel and the regular lattice of hex
//                    centres, so no cell topology survives to read as hexy.
//
// All keep the DAG-driven layout and the existing organic coastline; only the
// interior tile geometry changes. Deterministic throughout (hash/rand01, no
// Math.random). Boundary vertices (the outer silhouette the coastline was
// smoothed from) are PINNED so the shore still encloses the relaxed cells.

export type SubstrateMode = 'relaxed-hex' | 'relaxed-quad' | 'mesh';

/**
 * How wild the relaxed substrate is. `jitter` is the per-vertex displacement as
 * a fraction of HEX_R (the main "randomness" knob); `iters`/`relax` are the
 * Laplacian smoothing that untangles the jitter (more smoothing = cleaner but
 * more regular). `wheatScatter` breaks whole-hex wheat patches into a per-cell
 * scatter so the tan fields stop reading as hexagons. All overridable live via
 * the URL: `?substrate=relaxed-quad&jitter=0.8&iters=2&relax=0.28&wheatScatter=1`.
 */
interface SubstrateTuning {
  jitter: number;
  iters: number;
  relax: number;
  wheatScatter: boolean;
  /** mesh-only: extra quad-subdivision passes on the merge result (1 = the
   *  canonical hexagrid-relaxing density; 2 = finer cobbles). */
  subdiv?: number;
}

const QUAD_TUNING: SubstrateTuning = { jitter: 0.78, iters: 2, relax: 0.26, wheatScatter: true };
const HEX_TUNING: SubstrateTuning = { jitter: 0.7, iters: 2, relax: 0.28, wheatScatter: false };
// Path B's irregular topology carries the de-hexing, so jitter sits lower than
// path A (less needed; too much tangles the finer mesh); relax a touch firmer to
// settle the merged quads into clean Townscaper cells.
const MESH_TUNING: SubstrateTuning = {
  jitter: 0.42,
  iters: 3,
  relax: 0.34,
  wheatScatter: true,
  subdiv: 1,
};

/** One filled cell of the relaxed substrate: a polygon owned by a territory. */
interface RelaxedCell {
  owner: number;
  poly: Pt[];
  variant: number;
  wheat: boolean;
}

const VKEY = (p: Pt): string => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/**
 * Jitter (deterministically) then Laplacian-relax a vertex mesh in place.
 * Interior vertices wobble and smooth into organic cells; pinned (boundary)
 * vertices hold the silhouette. Light relaxation keeps the jittered character
 * — full convergence would regularise a regular-topology mesh back to a grid.
 */
function relaxVerts(
  verts: Pt[],
  adj: Set<number>[],
  pinned: Set<number>,
  opts: { jitterMag: number; iters: number; relax: number },
): void {
  const orig = verts.map((p) => VKEY(p));
  for (let i = 0; i < verts.length; i++) {
    if (pinned.has(i)) continue;
    const p = verts[i];
    if (!p) continue;
    const ang = rand01(hash(`jx:${orig[i]}`)) * Math.PI * 2;
    const mag = rand01(hash(`jm:${orig[i]}`)) * opts.jitterMag;
    p.x += Math.cos(ang) * mag;
    p.y += Math.sin(ang) * mag;
  }
  for (let it = 0; it < opts.iters; it++) {
    const next = verts.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < verts.length; i++) {
      if (pinned.has(i)) continue;
      const ns = adj[i];
      const cur = verts[i];
      const nx = next[i];
      if (!ns || !cur || !nx || ns.size === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const j of ns) {
        const q = verts[j];
        if (q) {
          sx += q.x;
          sy += q.y;
        }
      }
      nx.x = cur.x + (sx / ns.size - cur.x) * opts.relax;
      nx.y = cur.y + (sy / ns.size - cur.y) * opts.relax;
    }
    for (let i = 0; i < verts.length; i++) {
      const cur = verts[i];
      const nx = next[i];
      if (cur && nx) {
        cur.x = nx.x;
        cur.y = nx.y;
      }
    }
  }
}

/** Path A — relax the shared hex-corner lattice; rebuild irregular hexagons. */
function buildRelaxedHexCells(world: HexWorld, t: SubstrateTuning): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  // Each tile → its 6 shared corner ids; track hex-edge usage to find the shore.
  const tileCorners: { owner: number; key: string; ids: number[] }[] = [];
  const edgeUse = new Map<string, number>();
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const { h, owner } of world.drawTiles) {
    const c = hexCenter(h);
    const ids = hexCorners(c.x, c.y, HEX_R).map(intern);
    tileCorners.push({ owner, key: axialKey(h), ids });
    for (let i = 0; i < 6; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % 6];
      if (a === undefined || b === undefined) continue;
      adj[a]?.add(b);
      adj[b]?.add(a);
      const k = eKey(a, b);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });
  return tileCorners.map(({ owner, key, ids }) => ({
    owner,
    poly: ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
    variant: hash(`tile:${key}`) % 3,
    wheat: world.territories[owner]?.wheatTiles.has(key) ?? false,
  }));
}

/** Path B — subdivide each hex into 6 quads, relax the shared mesh (Townscaper). */
function buildRelaxedQuadCells(world: HexWorld, t: SubstrateTuning): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  interface Quad {
    owner: number;
    ids: number[];
    variant: number;
    wheat: boolean;
  }
  const quads: Quad[] = [];
  const edgeUse = new Map<string, number>();
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const link = (a: number, b: number): void => {
    adj[a]?.add(b);
    adj[b]?.add(a);
    const k = eKey(a, b);
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  };
  for (const { h, owner } of world.drawTiles) {
    const c = hexCenter(h);
    const corners = hexCorners(c.x, c.y, HEX_R);
    const oid = intern(c);
    const key = axialKey(h);
    const wheat = world.territories[owner]?.wheatTiles.has(key) ?? false;
    const cornerIds = corners.map(intern);
    const midIds = corners.map((cor, i) => {
      const nxt = corners[(i + 1) % 6] ?? cor;
      return intern({ x: (cor.x + nxt.x) / 2, y: (cor.y + nxt.y) / 2 });
    });
    for (let i = 0; i < 6; i++) {
      const ci = cornerIds[i];
      const mPrev = midIds[(i + 5) % 6];
      const mNext = midIds[i];
      if (ci === undefined || mPrev === undefined || mNext === undefined) continue;
      const ids = [oid, mPrev, ci, mNext];
      // wheatScatter: a wheat hex normally tints all 6 sub-cells — which reads as
      // a tan hexagon. Scatter it per-cell instead so the field stops being hexy
      // (grass cells mixed back in; ~70% of a wheat hex's cells stay wheat).
      const cellWheat = wheat && (!t.wheatScatter || rand01(hash(`wheat:${key}:${i}`)) < 0.7);
      quads.push({ owner, ids, variant: hash(`cell:${key}:${i}`) % 3, wheat: cellWheat });
      link(ids[0]!, ids[1]!);
      link(ids[1]!, ids[2]!);
      link(ids[2]!, ids[3]!);
      link(ids[3]!, ids[0]!);
    }
  }
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });
  return quads.map((q) => ({
    owner: q.owner,
    poly: q.ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
    variant: q.variant,
    wheat: q.wheat,
  }));
}

/**
 * Path B — the faithful Townscaper / Stålberg irregular-quad mesh (a port of
 * kchapelier/hexagrid-relaxing), in four steps over ONE shared, watertight
 * vertex pool:
 *   1. Triangulate: every claimed hex → 6 triangles (centre, corner_i,
 *      corner_{i+1}). Centres/corners are interned, so triangles of adjacent
 *      hexes share the rim edge between them.
 *   2. Merge adjacent triangle PAIRS into quads — greedily, ordered by a hash so
 *      it is identical every render, each triangle matched at most once. Pairs
 *      form ACROSS hex boundaries as readily as within a hex: this is what
 *      dissolves path A's fixed 6-quad fan (the residual pinwheel) and the
 *      regular lattice of hex centres.
 *   3. Subdivide: each merged quad → 4 sub-quads, each LEFTOVER triangle → 3
 *      sub-quads (the canonical "make it all quads" step). Midpoints/centroids
 *      are interned so neighbouring cells share them.
 *   4. Relax the shared mesh (reusing `relaxVerts`), boundary vertices pinned.
 *
 * Ownership is the source hex's territory — ISLAND_GAP keeps territories
 * non-adjacent, so a merge never spans two stories; the coastline is the
 * existing hex-silhouette one (outer vertices pinned), which still encloses the
 * relaxed cells and keeps river docking intact. Deterministic (hash/rand01).
 */
function buildMeshCells(world: HexWorld, t: SubstrateTuning): RelaxedCell[] {
  const verts: Pt[] = [];
  const vId = new Map<string, number>();
  const adj: Set<number>[] = [];
  const intern = (p: Pt): number => {
    const k = VKEY(p);
    let id = vId.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push({ x: p.x, y: p.y });
      vId.set(k, id);
      adj.push(new Set());
    }
    return id;
  };
  const eKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // 1. Triangulate every hex into 6 triangles over the shared vertex pool, and
  //    index each undirected edge → the triangles touching it (≤2).
  interface Tri {
    v: [number, number, number];
    owner: number;
  }
  const tris: Tri[] = [];
  const triEdges = new Map<string, number[]>();
  for (const { h, owner } of world.drawTiles) {
    const c = hexCenter(h);
    const oid = intern(c);
    const cornerIds = hexCorners(c.x, c.y, HEX_R).map(intern);
    for (let i = 0; i < 6; i++) {
      const a = cornerIds[i] ?? 0;
      const b = cornerIds[(i + 1) % 6] ?? 0;
      const ti = tris.length;
      tris.push({ v: [oid, a, b], owner });
      for (const [x, y] of [
        [oid, a],
        [a, b],
        [b, oid],
      ] as const) {
        const k = eKey(x, y);
        let arr = triEdges.get(k);
        if (!arr) {
          arr = [];
          triEdges.set(k, arr);
        }
        arr.push(ti);
      }
    }
  }

  // 2. Greedy deterministic pairing: every interior edge shared by two same-owner
  //    triangles is a merge candidate, ordered by a hash; match each triangle once.
  const partner = new Int32Array(tris.length).fill(-1);
  interface Cand {
    ti: number;
    tj: number;
    rank: number;
  }
  const cands: Cand[] = [];
  for (const [k, arr] of triEdges) {
    if (arr.length !== 2) continue;
    const ti = arr[0] ?? 0;
    const tj = arr[1] ?? 0;
    if ((tris[ti]?.owner ?? -1) !== (tris[tj]?.owner ?? -2)) continue;
    cands.push({ ti, tj, rank: hash(`merge:${k}`) });
  }
  cands.sort((p, q) => p.rank - q.rank || p.ti - q.ti || p.tj - q.tj);
  for (const cd of cands) {
    if (partner[cd.ti] === -1 && partner[cd.tj] === -1) {
      partner[cd.ti] = cd.tj;
      partner[cd.tj] = cd.ti;
    }
  }

  // 3. Subdivide into all-quads. Midpoints/centroids interned (shared → watertight);
  //    build the relax adjacency + boundary edge-use as each final cell is emitted.
  const levels = Math.max(1, Math.round(t.subdiv ?? 1));
  const edgeUse = new Map<string, number>();
  const link = (a: number, b: number): void => {
    adj[a]?.add(b);
    adj[b]?.add(a);
    const k = eKey(a, b);
    edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  };
  interface Cell {
    ids: number[];
    owner: number;
    hkey: string;
  }
  const cells: Cell[] = [];
  const mid = (a: number, b: number): number => {
    const pa = verts[a] ?? { x: 0, y: 0 };
    const pb = verts[b] ?? { x: 0, y: 0 };
    return intern({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
  };
  const centroidId = (ids: number[]): number => {
    let x = 0;
    let y = 0;
    for (const id of ids) {
      const p = verts[id] ?? { x: 0, y: 0 };
      x += p.x;
      y += p.y;
    }
    return intern({ x: x / ids.length, y: y / ids.length });
  };
  const emit = (ids: number[], owner: number): void => {
    let cx = 0;
    let cy = 0;
    for (const id of ids) {
      const p = verts[id] ?? { x: 0, y: 0 };
      cx += p.x;
      cy += p.y;
    }
    const hkey = axialKey(pixelToHex({ x: cx / ids.length, y: cy / ids.length }));
    cells.push({ ids, owner, hkey });
    for (let i = 0; i < ids.length; i++) link(ids[i] ?? 0, ids[(i + 1) % ids.length] ?? 0);
  };
  const subdivQuad = (q: number[], owner: number, lv: number): void => {
    if (lv <= 0) {
      emit(q, owner);
      return;
    }
    const [p0, p1, p2, p3] = q as [number, number, number, number];
    const g = centroidId(q);
    const m01 = mid(p0, p1);
    const m12 = mid(p1, p2);
    const m23 = mid(p2, p3);
    const m30 = mid(p3, p0);
    subdivQuad([p0, m01, g, m30], owner, lv - 1);
    subdivQuad([m01, p1, m12, g], owner, lv - 1);
    subdivQuad([g, m12, p2, m23], owner, lv - 1);
    subdivQuad([m30, g, m23, p3], owner, lv - 1);
  };
  const subdivTri = (tri: number[], owner: number, lv: number): void => {
    const [a, b, c] = tri as [number, number, number];
    const g = centroidId(tri);
    const mab = mid(a, b);
    const mbc = mid(b, c);
    const mca = mid(c, a);
    subdivQuad([a, mab, g, mca], owner, lv - 1);
    subdivQuad([b, mbc, g, mab], owner, lv - 1);
    subdivQuad([c, mca, g, mbc], owner, lv - 1);
  };
  for (let ti = 0; ti < tris.length; ti++) {
    const tA = tris[ti];
    if (!tA) continue;
    const pj = partner[ti] ?? -1;
    if (pj === -1) {
      subdivTri(tA.v, tA.owner, levels); // leftover triangle → 3 quads
    } else if (ti < pj) {
      // emit each merged pair once, as the quad p→a→q→b (a,b = shared edge).
      const tB = tris[pj];
      if (!tB) continue;
      const shared = tA.v.filter((x) => tB.v.includes(x));
      const a = shared[0] ?? 0;
      const b = shared[1] ?? 0;
      const p = tA.v.find((x) => x !== a && x !== b) ?? a;
      const q = tB.v.find((x) => x !== a && x !== b) ?? b;
      subdivQuad([p, a, q, b], tA.owner, levels);
    }
  }

  // 4. Pin the silhouette (edges used once), then jitter + relax the interior.
  const pinned = new Set<number>();
  for (const [k, n] of edgeUse) {
    if (n === 1) {
      const [a, b] = k.split('|');
      pinned.add(Number(a));
      pinned.add(Number(b));
    }
  }
  relaxVerts(verts, adj, pinned, { jitterMag: HEX_R * t.jitter, iters: t.iters, relax: t.relax });

  return cells.map((cell) => {
    const isWheatHex = world.territories[cell.owner]?.wheatTiles.has(cell.hkey) ?? false;
    const cellKey = cell.ids.join(',');
    const wheat =
      isWheatHex && (!t.wheatScatter || rand01(hash(`mesh-wheat:${cell.hkey}:${cellKey}`)) < 0.72);
    return {
      owner: cell.owner,
      poly: cell.ids.map((id) => verts[id] ?? { x: 0, y: 0 }),
      variant: hash(`mesh-cell:${cellKey}`) % 3,
      wheat,
    };
  });
}

function buildRelaxedCells(
  world: HexWorld,
  mode: SubstrateMode,
  override: Partial<SubstrateTuning>,
): RelaxedCell[] {
  if (mode === 'relaxed-hex') {
    return buildRelaxedHexCells(world, { ...HEX_TUNING, ...override });
  }
  if (mode === 'mesh') {
    return buildMeshCells(world, { ...MESH_TUNING, ...override });
  }
  return buildRelaxedQuadCells(world, { ...QUAD_TUNING, ...override });
}

/** A closed polygon `d` string. */
function polyPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  return (
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ') + ' Z'
  );
}

/**
 * Which substrate the forest map renders. The irregular Townscaper `mesh` is the
 * DEFAULT (owner look-decision 2026-06-16) — so no param renders mesh. Escapes:
 * `?substrate=hex` (aliases `none`/`default`/`classic`) → the original extruded
 * hex world (null); `?substrate=relaxed-quad|relaxed|relaxed-hex` → the earlier
 * spike modes. Returns null only for the explicit classic-world escape.
 */
function readSubstrateMode(): SubstrateMode | null {
  if (typeof window === 'undefined') return 'mesh';
  const raw = new URLSearchParams(window.location.search).get('substrate');
  if (raw === 'hex' || raw === 'none' || raw === 'default' || raw === 'classic') return null;
  if (raw === 'relaxed-hex') return 'relaxed-hex';
  if (raw === 'relaxed-quad' || raw === 'relaxed') return 'relaxed-quad';
  if (raw === 'mesh' || raw === 'path-b') return 'mesh';
  return 'mesh';
}

/** Live tuning overrides from the URL — let the owner dial the look in directly. */
function readSubstrateTuning(): Partial<SubstrateTuning> {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const out: Partial<SubstrateTuning> = {};
  const num = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const j = num('jitter');
  const it = num('iters');
  const rx = num('relax');
  const sd = num('subdiv');
  const ws = q.get('wheatScatter');
  if (j !== null) out.jitter = j;
  if (it !== null) out.iters = Math.max(0, Math.round(it));
  if (rx !== null) out.relax = rx;
  if (sd !== null) out.subdiv = Math.max(1, Math.min(2, Math.round(sd)));
  if (ws !== null) out.wheatScatter = ws === '1' || ws === 'true';
  return out;
}

// ---------- river network mode (DEFAULT as of the 2026-06-17 owner call) ----------
//
// The DEFAULT world now BRAIDS and MERGES the river network (owner: "go all in on
// rivers and ponds with no moats"):
//   • each SOURCE island's outgoing fan collapses into one shared TRUNK (fixes the
//     "library starburst" — a heavily-depended island spraying a dozen strands);
//   • each DESTINATION's incoming rivers fuse into a CONFLUENCE TREE (nearest
//     tributaries join first, braiding into one stem that lands at a single shared
//     mouth) instead of parallel lanes — the core fix for the mid-map tangle;
//   • every channel is ROUTED AROUND any third-party island (routeAround), so a
//     river hugs the open water between islands and never cuts across an island
//     that is neither its source nor its destination (where avoidanceBow's single
//     bow gave up on clusters).
// `?rivers=strands` restores the OLD look for comparison: one strand per dependency
// edge with co-destination strands as parallel METRO LANES. Moats are OFF by default
// (`?moat=on` restores the island water RINGS); when on, river mouths instead seat
// further onto the beach. Live knobs (`?trunkFrac=`, `?trunkW=`, `?mouthInset=`,
// `?confluencePull=`, `?routeMargin=`) dial the look without a rebuild.
//
// DEFAULT = `merge` = the global BASIN network (owner 2026-06-17, "merge ANY nearby
// rivers into a thicker river or even a lake; flow shown later by hover/animation"):
// a Euclidean MST over the island hubs is the river SKELETON, every dependency is
// routed along the unique tree path, and each skeleton segment's stroke fattens with
// the number of paths it carries — so the map reads as ONE connected watershed of
// thick trunks (near the foundations) thinning to leaf twigs, with a lake at every
// node, instead of a tangle of parallel strands. Comparison modes:
//   `?rivers=bundle`     — EDGE-PATH BUNDLING over the REAL graph (Wallinger 2021):
//                          a hub like the library becomes a fat trunk many edges flow
//                          ALONG, yet EVERY dependency keeps its own endpoints (a thin
//                          tributary you can trace end to end) — "merge when close, but
//                          still show the direct connection". `?bundleD=`/`?bundleDMax=`
//                          tune how aggressively long edges braid through a hub.
//   `?rivers=confluence` — the previous per-source-trunk + per-destination
//                          confluence merge (#187/#188), kept for A/B.
//   `?rivers=strands`    — the oldest one-strand-per-edge / metro-lane look.
type RiverMode = 'strands' | 'merge' | 'confluence' | 'bundle';

// Inland water (VISUAL SPIKE, flag-gated). The default world rings each island in a
// water MOAT (`?moat=on`). `?water=pond|through` instead carries the dependency
// rivers INLAND — independent of `?moat`, so the natural combo for review is
// `?moat=off&water=pond`:
//   `pond`    — a small organic pond sits just inside each island's shore on the
//               side its rivers enter from (clear of the capability plants); every
//               incoming river continues past the beach and ends AT the pond rim.
//   `through` — a single channel crosses each island from the coast its rivers
//               enter to the coast facing its dependents (water passes THROUGH).
// Inland water is drawn in dedicated passes ABOVE the island tiles (the sand-bank
// casing of the over-sea passes sits BENEATH the tiles, so an inland segment drawn
// there would render bankless — blue on grass).
type WaterMode = 'off' | 'pond' | 'through';

// Coast shaping (`?coast=`, owner call 2026-06-17 — flag-gated, default OFF so the
// world stays byte-identical until the owner nods on the hosted site):
//   `default`  — the procedural inland pond clamped to fit on land (current world).
//   `crescent` — each island's lake scales with its river DEGREE, and where the lake
//                outgrows the land a C-shaped BAY is carved into the coast to embrace
//                it (no river re-layout — pond + coast geometry only).
type CoastMode = 'default' | 'crescent';

interface RiverTuning {
  /** Trunk length as a fraction of the mean source→mouth distance (clamped). */
  trunkFrac: number;
  /** Multiplier on how fast a trunk fattens per gathered tributary. */
  trunkW: number;
  /** px a river mouth sits inside the coast when the moat is OFF (so the tip lands
   *  on the beach, not floating past the shore the moat used to cover). */
  mouthInset: number;
  /** How far toward the destination a confluence sits, as a fraction of the
   *  midpoint→sink distance (`?rivers=merge`). Lower = tributaries fuse EARLIER and
   *  share a longer trunk (more braid); higher = they fuse late (more parallel). */
  confluencePull: number;
  /** px a routed river keeps clear of a third-party island's hull (radius) when
   *  skirting it. Higher = wider berth; lower = threads tighter gaps. */
  routeMargin: number;
  /** px a basin trunk's centreline wanders sideways under the deterministic
   *  value-noise meander (Red Blob Games' river-meander idea) — so an over-sea
   *  river reads as a winding watercourse, not a routed pipe. 0 disables it. */
  meanderAmp: number;
  /** Roughly how many meander lobes run along one river (the noise frequency). */
  meanderFreq: number;
  /** Edge-path bundling (`?rivers=bundle`) — the length exponent `d`: higher
   *  penalises long edges more, so they prefer to braid through a hub. */
  bundleD: number;
  /** Edge-path bundling detour budget: an edge bundles through a hub when the
   *  detour's weight ≤ `bundleDMax · the edge's own weight`. Higher = more
   *  aggressive merging (more edges braid); lower = more edges stay direct. */
  bundleDMax: number;
}

const RIVER_TUNING: RiverTuning = {
  trunkFrac: 0.78,
  trunkW: 1,
  mouthInset: 7,
  confluencePull: 0.26,
  routeMargin: 20,
  meanderAmp: 18,
  meanderFreq: 3.5,
  bundleD: 2,
  bundleDMax: 2,
};

/** Per-water-layer stroke width as a function of accumulated flow. Tuned for the
 *  BASIN: a leaf twig (flow 1) is a delicate stream, and the main stem near the
 *  foundations (flow ≈ node count) fattens into a clear river — so the watershed
 *  reads as thick trunks gathering thin tributaries, the "thicker where flow
 *  accumulates" look. The confluence comparison mode reuses these at its lower
 *  flows (2–3), where they land close to its old slim widths. */
const FLOW_W = {
  land: { base: 5.5, step: 1.9, max: 19 },
  bank: { base: 3.4, step: 1.1, max: 11 },
  water: { base: 2.3, step: 0.8, max: 7.8 },
  glint: { base: 1.2, step: 0, max: 1.2 },
} as const;

// DEFAULTS FLIPPED (owner call 2026-06-17 — "go all in on rivers and ponds with no
// moats"): the merged river network, dropped moats and inland ponds are now the
// DEFAULT world. The flags remain as OVERRIDES so the old look is still reachable
// for comparison: `?rivers=strands` (one strand per edge / metro lanes),
// `?moat=on` (restore the island water rings), `?water=off` (no inland ponds).
function readRiverMode(): RiverMode {
  if (typeof window === 'undefined') return 'merge';
  const raw = new URLSearchParams(window.location.search).get('rivers');
  if (raw === 'strands') return 'strands';
  if (raw === 'confluence') return 'confluence';
  if (raw === 'bundle') return 'bundle';
  return 'merge';
}

function readMoat(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = new URLSearchParams(window.location.search).get('moat');
  return raw === 'on' || raw === '1' || raw === 'true';
}

function readWaterMode(): WaterMode {
  if (typeof window === 'undefined') return 'pond';
  const raw = new URLSearchParams(window.location.search).get('water');
  if (raw === 'off' || raw === 'none') return 'off';
  if (raw === 'through') return 'through';
  return 'pond';
}

/** `?coast=crescent` sizes each island's lake by its river degree and carves a
 *  C-shaped bay into the coast to hug it. Default OFF (byte-identical world). */
function readCoastMode(): CoastMode {
  if (typeof window === 'undefined') return 'default';
  return new URLSearchParams(window.location.search).get('coast') === 'crescent'
    ? 'crescent'
    : 'default';
}

/** `?plants=scatter` disperses the capability garden off its rigid front arc. */
function readPlantsScatter(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('plants') === 'scatter';
}

function readRiverTuning(): RiverTuning {
  if (typeof window === 'undefined') return RIVER_TUNING;
  const q = new URLSearchParams(window.location.search);
  const out: RiverTuning = { ...RIVER_TUNING };
  const num = (key: string): number | null => {
    const raw = q.get(key);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const tf = num('trunkFrac');
  const tw = num('trunkW');
  const mi = num('mouthInset');
  const cp = num('confluencePull');
  const rm = num('routeMargin');
  const ma = num('meanderAmp');
  const mf = num('meanderFreq');
  const bd = num('bundleD');
  const bdm = num('bundleDMax');
  if (tf !== null) out.trunkFrac = Math.max(0, tf);
  if (tw !== null) out.trunkW = Math.max(0, tw);
  if (mi !== null) out.mouthInset = mi;
  if (cp !== null) out.confluencePull = Math.max(0, Math.min(1, cp));
  if (rm !== null) out.routeMargin = Math.max(0, rm);
  if (ma !== null) out.meanderAmp = Math.max(0, ma);
  if (mf !== null) out.meanderFreq = Math.max(0, mf);
  if (bd !== null) out.bundleD = Math.max(0, bd);
  if (bdm !== null) out.bundleDMax = Math.max(0, bdm);
  return out;
}

// ---------- focus relations (V1's ancestor/descendant highlighting) ----------

interface Relations {
  ancestors: Set<string>;
  descendants: Set<string>;
}

function relationsFor(nodes: { id: string; dependsOn: string[] }[], focusId: string): Relations {
  const depsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const node of nodes) {
    depsOf.set(node.id, node.dependsOn);
    for (const d of node.dependsOn) {
      const list = dependentsOf.get(d);
      if (list) list.push(node.id);
      else dependentsOf.set(d, [node.id]);
    }
  }
  const walk = (start: string, next: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(next.get(start) ?? [])];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(next.get(id) ?? []));
    }
    return seen;
  };
  return { ancestors: walk(focusId, depsOf), descendants: walk(focusId, dependentsOf) };
}

// ---------- capability sub-DAG (side panel) ----------

const SUB_W = 134;
const SUB_H = 46;
const SUB_STRIP = 13;

/** Smooth path through dagre's edge waypoints (quadratic through the bends). */
function pathThrough(points: Pt[]): string {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) return '';
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const nx = points[i + 1];
    if (!p || !nx) continue;
    d += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${((p.x + nx.x) / 2).toFixed(1)} ${((p.y + nx.y) / 2).toFixed(1)}`;
  }
  if (points.length >= 2) d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/** Wrap a kebab-case id across up to two lines, breaking at a hyphen. */
function idLines(id: string, max = 19): string[] {
  if (id.length <= max) return [id];
  const head = id.slice(0, max);
  let cut = head.lastIndexOf('-');
  if (cut < Math.floor(max * 0.4)) cut = max;
  const line1 = id.slice(0, cut);
  const rest = id.slice(cut).replace(/^-/, '');
  if (!rest) return [line1];
  return [line1, rest.length > max ? `${rest.slice(0, max - 1)}…` : rest];
}

interface SubLayout {
  width: number;
  height: number;
  caps: { cap: TreeCapability; x: number; y: number }[];
  edges: { from: string; to: string; d: string }[];
}

function layoutSubdag(story: TreeStory): SubLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'BT', ranksep: 30, nodesep: 16, edgesep: 10, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of story.capabilities) g.setNode(c.id, { width: SUB_W, height: SUB_H });
  for (const c of story.capabilities) {
    for (const dep of c.dependsOn) {
      if (dep !== c.id && g.hasNode(dep)) g.setEdge(dep, c.id);
    }
  }
  dagre.layout(g);
  const meta = g.graph();
  const caps = story.capabilities.map((cap) => {
    const node = g.node(cap.id);
    return { cap, x: (node?.x ?? 0) - SUB_W / 2, y: (node?.y ?? 0) - SUB_H / 2 };
  });
  const edges: SubLayout['edges'] = [];
  for (const c of story.capabilities) {
    for (const dep of c.dependsOn) {
      if (dep === c.id || !g.hasNode(dep)) continue;
      const e = g.edge(dep, c.id) as { points?: Pt[] } | undefined;
      edges.push({ from: dep, to: c.id, d: pathThrough(e?.points ?? []) });
    }
  }
  return {
    width: Math.max(Math.ceil(meta.width ?? 0), SUB_W + 16),
    height: Math.max(Math.ceil(meta.height ?? 0), SUB_H + 16),
    caps,
    edges,
  };
}

// ---------- view ----------

type Band = TreeSession['band'];

/** What the session dock shows: the board-level list, or one session's detail. */
type SessionDockState = { kind: 'list' } | { kind: 'detail'; id: string };

export function TreeView({ focus }: { focus: string | null }): React.JSX.Element {
  const [stories, setStories] = useState<TreeStory[] | null>(null);
  // Sessions: seeded by the one-shot tree payload, then kept near-real-time by
  // the /api/presence poll; `now` ticks so wisps age between polls (lib/presence.ts).
  const [seedSessions, setSeedSessions] = useState<TreeSession[] | undefined>(undefined);
  const { sessions, now } = usePresence(seedSessions);
  // In-flight builds (ADR-0048): the harness signal the orbiting wisp is sourced
  // from. Seeded from the tree payload, then polled; aged by the SAME `now`
  // ticker usePresence publishes.
  const [seedBuilds, setSeedBuilds] = useState<BuildActivity[] | undefined>(undefined);
  const rawBuilds = useBuildActivity(seedBuilds);
  // The session dock: the board-level list (toolbar count click) or one session's
  // detail (wisp / row click). Sessions whose nodes anchor to no loaded story —
  // including nodes:[] hook declarations — are reachable ONLY through the list.
  const [sessionDock, setSessionDock] = useState<SessionDockState | null>(null);
  const [loadError, setLoadError] = useState('');
  // Selection lives in the URL (#/tree/<storyId>) so a focused territory is
  // deep-linkable; the route's `focus` IS the selected story — but only when
  // it names a real story, so a stale deep link renders the unfocused world
  // instead of dimming everything.
  const selectedStory = useMemo(
    () => (focus && stories?.some((s) => s.id === focus) ? focus : null),
    [focus, stories],
  );
  const [hoverStory, setHoverStory] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const [hoverCap, setHoverCap] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    api
      .tree()
      .then((p) => {
        setStories(presentStories(p.stories));
        setSeedSessions(p.sessions ?? []);
        setSeedBuilds(p.builds ?? []);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  // River network spike (flag-gated): `?rivers=merge` collapses each source's
  // outgoing fan into one trunk; `?moat=off` drops the island water ring. Read
  // once (URL constants), threaded into buildWorld AND its memo deps so the flag
  // never silently no-ops against the [stories]-only memo.
  const riverMode = useMemo(() => readRiverMode(), []);
  const moatOn = useMemo(() => readMoat(), []);
  const waterMode = useMemo(() => readWaterMode(), []);
  const plantsScatter = useMemo(() => readPlantsScatter(), []);
  const coastMode = useMemo(() => readCoastMode(), []);
  const riverTuning = useMemo(() => readRiverTuning(), []);
  const world = useMemo(
    () =>
      stories
        ? buildWorld(stories, {
            riverMode,
            moat: moatOn,
            tuning: riverTuning,
            waterMode,
            plantsScatter,
            coastMode,
          })
        : null,
    [stories, riverMode, moatOn, waterMode, plantsScatter, coastMode, riverTuning],
  );

  /** Merged-trunk stroke width per water layer, or undefined (CSS default). */
  const flowStyle = (e: WorldEdge, layer: keyof typeof FLOW_W): React.CSSProperties | undefined => {
    if (e.flow == null) return undefined;
    const c = FLOW_W[layer];
    return { strokeWidth: rampWidth(e.flow, c.base, c.step * riverTuning.trunkW, c.max) };
  };

  // VISUAL SPIKE (do not land): swap the regular hex interiors for an irregular
  // relaxed grid when `?substrate=…` is set. Null = the default hex world.
  // Tuning (`jitter`/`iters`/`relax`/`wheatScatter`) is read from the URL so the
  // owner can dial the look in live without a rebuild.
  const substrateMode = useMemo(() => readSubstrateMode(), []);
  const substrateTuning = useMemo(() => readSubstrateTuning(), []);
  const relaxedCells = useMemo(
    () => (world && substrateMode ? buildRelaxedCells(world, substrateMode, substrateTuning) : null),
    [world, substrateMode, substrateTuning],
  );

  // The world reads bottom-up (foundation at the bottom), so the frame opens
  // scrolled to the bottom; selecting / deep-linking a story scrolls its
  // territory into view. SVG elements have no offsetTop and the scene is
  // width-capped + centred, so the offset comes from rect deltas.
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollToStory = (storyId: string, smooth: boolean): void => {
    const frame = frameRef.current;
    const svg = svgRef.current;
    const territory = world?.territories.find((t) => t.story.id === storyId);
    if (!frame || !svg || !territory || !world) return;
    const scale = svg.clientWidth / world.width;
    const svgTop =
      svg.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop;
    const y = (territory.centroid.y + world.offset.y) * scale + svgTop;
    frame.scrollTo({ top: y - frame.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  // Mount: a deep link wins; otherwise land on the foundation (the bottom).
  useLayoutEffect(() => {
    if (!world) return;
    if (selectedStory) scrollToStory(selectedStory, false);
    else frameRef.current?.scrollTo({ top: frameRef.current.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  useEffect(() => {
    if (selectedStory && world) scrollToStory(selectedStory, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStory]);

  const focusStoryId = hoverStory ?? selectedStory;
  // Focus walks the SAME declared ∪ derived edge set the roads and ranking
  // use, so a derived-only road lights up like any declared one.
  const unionNodes = useMemo(() => {
    if (!stories) return null;
    const deps = new Map<string, string[]>(stories.map((s) => [s.id, []]));
    for (const e of storyEdges(stories)) deps.get(e.to)?.push(e.from);
    return stories.map((s) => ({ id: s.id, dependsOn: deps.get(s.id) ?? [] }));
  }, [stories]);
  const storyRelations = useMemo(
    () => (unionNodes && focusStoryId ? relationsFor(unionNodes, focusStoryId) : null),
    [unionNodes, focusStoryId],
  );
  const storyIds = useMemo(() => new Set((stories ?? []).map((s) => s.id)), [stories]);

  /** capability id → owning story id (resolves session node anchors). */
  const capOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stories ?? []) for (const c of s.capabilities) m.set(c.id, s.id);
    return m;
  }, [stories]);

  /** A declared node's territory: the story itself, or its capability's owner. */
  const storyForNode = (node: string): string | null =>
    storyIds.has(node) ? node : (capOwner.get(node) ?? null);

  /**
   * session → the story territories its nodes resolve to. A session that
   * resolves to NONE (nodes:[] hook declarations, or ids no loaded story
   * owns) anchors nowhere — no wisp, only the board-level list shows it.
   */
  const sessionAnchors = useMemo(() => {
    const anchors = new Map<string, string[]>();
    for (const session of sessions) {
      const ids = new Set<string>();
      for (const node of session.nodes) {
        if (storyIds.has(node)) ids.add(node);
        const ownerId = capOwner.get(node);
        if (ownerId) ids.add(ownerId);
      }
      anchors.set(session.sessionId, [...ids]);
    }
    return anchors;
  }, [storyIds, capOwner, sessions]);

  const sessionsByStory = useMemo(() => {
    const byStory = new Map<string, TreeSession[]>();
    for (const session of sessions) {
      for (const id of sessionAnchors.get(session.sessionId) ?? []) {
        const list = byStory.get(id);
        if (list) list.push(session);
        else byStory.set(id, [session]);
      }
    }
    return byStory;
  }, [sessions, sessionAnchors]);

  /**
   * In-flight builds grouped by the story territory their unit resolves to
   * (ADR-0048). TTL-aged against the shared `now` ticker so a build's wisp
   * vanishes the instant it crosses BUILD_IN_FLIGHT_TTL_MS, not at the next
   * poll. A build whose unit no loaded story owns anchors nowhere (no wisp).
   */
  const buildsByStory = useMemo(() => {
    const byStory = new Map<string, BuildActivity[]>();
    for (const b of rawBuilds) {
      if (!isBuildInFlight(b.at, now)) continue;
      const storyId = storyIds.has(b.unitId) ? b.unitId : capOwner.get(b.unitId);
      if (storyId === undefined) continue;
      const list = byStory.get(storyId);
      if (list) list.push(b);
      else byStory.set(storyId, [b]);
    }
    return byStory;
  }, [rawBuilds, now, storyIds, capOwner]);

  if (loadError) {
    return (
      <div className="pad">
        <h2>Story forest</h2>
        <p className="muted">Couldn’t load the tree: {loadError}</p>
      </div>
    );
  }
  if (!stories || !world) return <p className="muted pad">Growing the world…</p>;
  if (stories.length === 0) {
    return (
      <div className="pad">
        <h2>Story forest</h2>
        <p className="muted">No stories yet — the world appears once stories/ holds one.</p>
      </div>
    );
  }

  const capCount = stories.reduce((n, s) => n + s.capabilities.length, 0);
  const selected = selectedStory ? stories.find((s) => s.id === selectedStory) : undefined;
  // ADR-0041: only fresh/stale sessions count as "active" and orbit as wisps;
  // possibly-dead sessions park in the dock (the history/debugging surface).
  const { orbiting, parked } = splitSessions(sessions);

  const toggleStatus = (st: string): void => {
    const next = new Set(hidden);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    setHidden(next);
  };

  const territoryClass = (story: TreeStory): string => {
    const cls = ['hex-territory', `st-${story.status ?? 'unknown'}`];
    if (focusStoryId && storyRelations) {
      if (story.id === focusStoryId) cls.push('is-focus');
      else if (storyRelations.ancestors.has(story.id)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(story.id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (story.id === selectedStory) cls.push('is-selected');
    return cls.join(' ');
  };

  const roadClass = (e: WorldEdge): string => {
    const cls = ['world-trail'];
    if (e.kind === 'trunk') cls.push('is-trunk');
    if (focusStoryId && storyRelations) {
      const anc = (id: string): boolean => id === focusStoryId || storyRelations.ancestors.has(id);
      const desc = (id: string): boolean =>
        id === focusStoryId || storyRelations.descendants.has(id);
      if (e.kind === 'trunk') {
        // A merged trunk/basin segment carries many dependencies; light it when
        // EITHER island it joins is on the focus path (the confluence source-trunk
        // stub has from===to, so this still keys on its one island).
        if (anc(e.from) || anc(e.to)) cls.push('is-ancestor');
        else if (desc(e.from) || desc(e.to)) cls.push('is-descendant');
        else cls.push('is-dim');
      } else if (storyRelations.ancestors.has(e.from) && anc(e.to)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(e.to) && desc(e.from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };

  /** Dim an inland pond when a focus is set and its island is off the focus path. */
  const pondClass = (p: PondShape): string => {
    if (!focusStoryId || !storyRelations) return '';
    const id = p.story;
    if (id === focusStoryId || storyRelations.ancestors.has(id) || storyRelations.descendants.has(id))
      return '';
    return 'is-dim';
  };

  const clearSelection = (): void => {
    setSelectedCap(null);
    navigate(treeHref);
  };
  const selectStory = (storyId: string, capId: string | null): void => {
    if (selectedStory === storyId && capId === null) {
      clearSelection(); // second click on the selected territory toggles it off
      return;
    }
    setSelectedCap(capId);
    navigate(treeFocusHref(storyId));
  };

  return (
    <div className="tree-wrap pad">
      <div className="tree-toolbar">
        <h2>Story forest</h2>
        <span className="muted small">
          {stories.length} stories · {capCount} capabilities
          {sessions.length > 0 && (
            <>
              {' · '}
              <button
                type="button"
                className="tree-link"
                onClick={() => setSessionDock({ kind: 'list' })}
              >
                {orbiting.length > 0
                  ? `${orbiting.length} active session${orbiting.length === 1 ? '' : 's'}${
                      parked.length > 0 ? ` (+${parked.length} aged)` : ''
                    }`
                  : `${parked.length} aged session${parked.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}{' '}
          — foundations at the bottom, dependents fan upward. Each story is one tree in the forest;
          its capabilities garden around its island. Click an island for the capability DAG.
        </span>
      </div>

      <div className="tree-layout">
        <div className="world-frame">
          <div
            className="world-scroll"
            ref={frameRef}
            tabIndex={0}
            aria-label="story forest map (scrollable)"
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection(); // gutters beside the capped scene
            }}
          >
          <svg
            ref={svgRef}
            className={`world-scene${
              riverMode === 'merge' || riverMode === 'bundle' ? ' rivers-merge' : ''
            }${waterMode === 'pond' ? ' water-pond' : ''}`}
            viewBox={`0 0 ${world.width} ${world.height}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            <defs>
              <marker
                id="sub-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 8 5 L 0 8.8 z" fill="context-stroke" />
              </marker>
            </defs>

            <g transform={`translate(${world.offset.x} ${world.offset.y})`}>
              {/* the pale coast */}
              <g className="hex-coast">
                {world.empties.map((h) => {
                  const c = hexCenter(h);
                  return <path key={axialKey(h)} className="hex-empty" d={hexPath(c.x, c.y, HEX_R - 0.6)} />;
                })}
              </g>

              {/* WATER NETWORK pass 1/4 — sand banks (the land casing). Every river
                  and every island moat shares one sandy casing, drawn here BENEATH
                  the island land + tiles so a river bank fuses into the island beach
                  with no seam, and the banks of crossing/parallel rivers merge into
                  one continuous sandy coast. (The remaining passes — shallows, water,
                  glint — are drawn ABOVE the land, after the tiles.) */}
              <g className="water-net-land">
                {world.edges.map((e) => (
                  <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                    <path className="world-trail-land" d={e.d} style={flowStyle(e, 'land')} />
                  </g>
                ))}
                {moatOn &&
                  world.territories.map((t) => (
                    <g key={t.story.id} className={`hex-water-border ${territoryClass(t.story)}`}>
                      {t.coastPaths.map((d, i) => (
                        <path key={`ml${i}`} className="moat-land" d={d} />
                      ))}
                    </g>
                  ))}
              </g>

              {/* organic island land: the smoothed coast filled as sand, UNDER the
                  hex tiles, so each island reads as one solid blob with a beach
                  rim instead of loose tiles floating in a hexagonal moat. */}
              <g className="hex-coastland">
                {world.territories.map((t) => (
                  <g key={t.story.id} className={`coast-fill-group ${territoryClass(t.story)}`}>
                    {t.coastPaths.map((d, i) => (
                      <path key={`cf${i}`} className="coast-fill" d={d} />
                    ))}
                  </g>
                ))}
              </g>

              {/* claimed land, back-to-front so extrusions layer */}
              {relaxedCells ? (
                // VISUAL SPIKE: irregular relaxed substrate (flat cells, grouped
                // by territory for hover/focus). Replaces the extruded hex tiles.
                <g className="relaxed-land">
                  {world.territories.map((territory, owner) => {
                    const cells = relaxedCells.filter((c) => c.owner === owner);
                    if (cells.length === 0) return null;
                    return (
                      <g
                        key={territory.story.id}
                        className={`relaxed-tile ${territoryClass(territory.story)}`}
                        onMouseEnter={() => setHoverStory(territory.story.id)}
                        onMouseLeave={() => setHoverStory(null)}
                        onClick={() => selectStory(territory.story.id, null)}
                      >
                        {cells.map((cell, i) => (
                          <path
                            key={i}
                            className={`relaxed-cell ${cell.wheat ? 'is-wheat' : `v-${cell.variant}`}`}
                            d={polyPath(cell.poly)}
                          />
                        ))}
                      </g>
                    );
                  })}
                </g>
              ) : (
                <g className="hex-land">
                  {world.drawTiles.map(({ h, owner }) => {
                    const territory = world.territories[owner];
                    if (!territory) return null;
                    const c = hexCenter(h);
                    const key = axialKey(h);
                    const variant = hash(`tile:${key}`) % 3;
                    const wheat = territory.wheatTiles.has(key);
                    return (
                      <g
                        key={key}
                        className={`hex-tile ${territoryClass(territory.story)}`}
                        onMouseEnter={() => setHoverStory(territory.story.id)}
                        onMouseLeave={() => setHoverStory(null)}
                        onClick={() => selectStory(territory.story.id, null)}
                      >
                        <path className="hex-side" d={hexPath(c.x, c.y + TILE_DEPTH, HEX_R)} />
                        <path
                          className={`hex-top ${wheat ? 'is-wheat' : `v-${variant}`}`}
                          d={hexPath(c.x, c.y, HEX_R)}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* INLAND WATER (?water=pond|through) — drawn ABOVE the island tiles
                  so the sandy banks show on land (the over-sea casing pass sits
                  BENEATH the tiles, where an inland segment would render bankless).
                  Layered back-to-front like the over-sea passes — every sand bank
                  first, then water, then glint — so a channel fuses seamlessly into
                  the pond it feeds. */}
              {(world.inland.ponds.length > 0 || world.inland.channels.length > 0) && (
                <g className="inland-water">
                  {world.inland.channels.map((e, i) => (
                    <g key={`il-l-${i}-${e.from}->${e.to}`} className={roadClass(e)}>
                      <path className="world-trail-land" d={e.d} style={flowStyle(e, 'land')} />
                    </g>
                  ))}
                  {world.inland.ponds.map((p) => (
                    <path key={`p-l-${p.story}`} className={`inland-pond-sand ${pondClass(p)}`} d={p.d} />
                  ))}
                  {world.inland.channels.map((e, i) => (
                    <g key={`il-b-${i}-${e.from}->${e.to}`} className={roadClass(e)}>
                      <path className="world-trail-bank" d={e.d} style={flowStyle(e, 'bank')} />
                    </g>
                  ))}
                  {world.inland.channels.map((e, i) => (
                    <g key={`il-w-${i}-${e.from}->${e.to}`} className={roadClass(e)}>
                      <path className="world-trail-water" d={e.d} style={flowStyle(e, 'water')} />
                    </g>
                  ))}
                  {world.inland.ponds.map((p) => (
                    <path key={`p-w-${p.story}`} className={`inland-pond-water ${pondClass(p)}`} d={p.d} />
                  ))}
                  {world.inland.channels.map((e, i) => (
                    <g key={`il-g-${i}-${e.from}->${e.to}`} className={roadClass(e)}>
                      <path className="world-trail-glint" d={e.d} style={flowStyle(e, 'glint')} />
                    </g>
                  ))}
                  {world.inland.ponds.map((p) => (
                    <path key={`p-g-${p.story}`} className={`inland-pond-glint ${pondClass(p)}`} d={p.d} />
                  ))}
                </g>
              )}

              {/* WATER NETWORK pass 2/4 — pale shallows: the rim between the sand
                  bank and the open water, for every river and moat. */}
              <g className="water-net-shallow">
                {world.edges.map((e) => (
                  <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                    <path className="world-trail-bank" d={e.d} style={flowStyle(e, 'bank')} />
                  </g>
                ))}
                {moatOn &&
                  world.territories.map((t) => (
                    <g key={t.story.id} className={`hex-water-border ${territoryClass(t.story)}`}>
                      {t.coastPaths.map((d, i) => (
                        <path key={`mb${i}`} className="moat-bank" d={d} />
                      ))}
                    </g>
                  ))}
              </g>

              {/* WATER NETWORK pass 3/4 — the water body: river bodies AND island
                  moats share ONE colour in ONE layer, so a river mouth dissolves
                  into the moat with no seam (moats drawn last → they always cover a
                  river's tip). Dep → dependent; several deps land as a fanned delta,
                  never a merged trunk. */}
              <g className="water-net-water">
                {world.edges.map((e) =>
                  e.kind === 'trunk' ? (
                    <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                      <path className="world-trail-water" d={e.d} style={flowStyle(e, 'water')} />
                    </g>
                  ) : (
                    <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                      <title>
                        {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                      </title>
                      <path className="world-trail-water" d={e.d} style={flowStyle(e, 'water')} />
                    </g>
                  ),
                )}
                {moatOn &&
                  world.territories.map((t) => (
                    <g key={t.story.id} className={`hex-water-border ${territoryClass(t.story)}`}>
                      {t.coastPaths.map((d, i) => (
                        <path key={`mw${i}`} className="moat-water" d={d} />
                      ))}
                    </g>
                  ))}
              </g>

              {/* WATER NETWORK pass 4/4 — the flowing glint, on top of all water. */}
              <g className="water-net-glint">
                {world.edges.map((e) => (
                  <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                    <path className="world-trail-glint" d={e.d} style={flowStyle(e, 'glint')} />
                  </g>
                ))}
                {moatOn &&
                  world.territories.map((t) => (
                    <g key={t.story.id} className={`hex-water-border ${territoryClass(t.story)}`}>
                      {t.coastPaths.map((d, i) => (
                        <path key={`mg${i}`} className="moat-glint" d={d} />
                      ))}
                    </g>
                  ))}
              </g>

              {/* trees, decoration, nameplates, wisps — per territory */}
              {world.territories.map((t) => (
                <TerritoryFlora
                  key={t.story.id}
                  territory={t}
                  className={territoryClass(t.story)}
                  hidden={hidden}
                  // The world orbits the HARNESS now (ADR-0048 §5): in-flight
                  // builds only. Session presence lives in the dock / panel.
                  builds={buildsByStory.get(t.story.id) ?? []}
                  now={now}
                  onHover={(on) => setHoverStory(on ? t.story.id : null)}
                  onSelect={(capId) => selectStory(t.story.id, capId)}
                />
              ))}
            </g>
          </svg>
          </div>
          <WorldLegend
            stories={stories}
            builds={rawBuilds}
            now={now}
            hidden={hidden}
            onToggleStatus={toggleStatus}
            onResetHidden={() => setHidden(new Set())}
          />
          {sessionDock && (
            <SessionDock
              dock={sessionDock}
              sessions={sessions}
              anchors={sessionAnchors}
              now={now}
              storyForNode={storyForNode}
              onShowList={() => setSessionDock({ kind: 'list' })}
              onShowDetail={(id) => setSessionDock({ kind: 'detail', id })}
              onFocusStory={(id) => navigate(treeFocusHref(id))}
              onClose={() => setSessionDock(null)}
            />
          )}
        </div>

        {selected && (
          <StoryPanel
            story={selected}
            storyIds={storyIds}
            sessions={sessionsByStory.get(selected.id) ?? []}
            now={now}
            selectedCap={selectedCap}
            hoverCap={hoverCap}
            hidden={hidden}
            onSelectCap={setSelectedCap}
            onHoverCap={setHoverCap}
            onSelectSession={(id) => setSessionDock({ kind: 'detail', id })}
            onClose={clearSelection}
          />
        )}
      </div>
    </div>
  );
}

/** A decorative low-poly conifer (no status meaning). */
function DecorTree({ x, y, h, seed }: { x: number; y: number; h: number; seed: number }): React.JSX.Element {
  const lean = (rand01(seed) - 0.5) * 2;
  const w = h * 0.42;
  return (
    <g className="hex-conifer" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <ellipse className="flora-shadow" cx={1} cy={1} rx={w * 0.9} ry={2.4} />
      <path
        className={`conifer-body c-${seed % 3}`}
        d={`M ${lean} ${-h} L ${w} 0 L ${-w} 0 Z`}
      />
      <path className="conifer-snow" d={`M ${lean} ${-h} L ${lean + w * 0.45} ${-h * 0.45} L ${lean - w * 0.45} ${-h * 0.45} Z`} />
    </g>
  );
}

/**
 * The recently-landed bloom (ADR-0045): a transient, decaying halo + sparkle
 * announcing that a signed PASS landed on this territory inside BLOOM_WINDOW.
 * It is a pure decoration off `verdict.at` (already on the wire) — the durable
 * record stays the plant HUE (ADR-0040); this layer fades to nothing and never
 * re-encodes that bit (see lib/activity.ts for the through-line).
 *
 * Geometry is seeded by the unit id, so it never jitters between the now-ticker
 * re-renders (the same purity rule the wisp orbit phase obeys). The CSS pulse
 * lives on the INNER group; the outer group carries the translate AND the
 * age-decay opacity — in SVG a CSS transform/opacity replaces the matching
 * presentation attribute, so the animated and the positioned facts must sit on
 * different elements (else the scale keyframe would snap the bloom to the origin
 * and the opacity keyframe would clobber the decay).
 */
function LandingBloom({
  unitId,
  bloom,
  cx,
  cy,
  r,
  kind,
}: {
  unitId: string;
  bloom: VerdictBloom;
  cx: number;
  cy: number;
  r: number;
  kind: 'crown' | 'plant';
}): React.JSX.Element {
  // Bright when fresh, dimming with age — but never to zero here: verdictBloom
  // returns null at the window edge, which unmounts the whole layer.
  const ageOpacity = (0.3 + 0.65 * bloom.ageRatio).toFixed(2);
  const sparks = Array.from({ length: kind === 'crown' ? 4 : 3 }, (_, i) => {
    const a = rand01(hash(`${unitId}:bloom:a${i}`)) * Math.PI * 2;
    const rr = r * (0.78 + rand01(hash(`${unitId}:bloom:r${i}`)) * 0.5);
    return {
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr * 0.7, // top-down squash, same as the wisp orbit
      r: (kind === 'crown' ? 1.5 : 1) * (0.8 + rand01(hash(`${unitId}:bloom:s${i}`)) * 0.5),
    };
  });
  return (
    <g
      className="world-bloom-anchor"
      transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}
      opacity={ageOpacity}
      aria-hidden="true"
    >
      <g className={`world-bloom verdict-${bloom.outcome} bloom-${kind}`}>
        <circle className="bloom-ring" r={r.toFixed(1)} />
        {sparks.map((s, i) => (
          <circle
            key={i}
            className="bloom-spark"
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            r={s.r.toFixed(1)}
          />
        ))}
      </g>
    </g>
  );
}

/**
 * The central story tree — the story ITSELF (ADR-0036 d.6b, vocabulary
 * recalibrated by ADR-0038). Crown size grows with capability count; GROWTH
 * and foliage carry the lifecycle: zero capabilities grows only a sapling (the
 * claimed-but-empty authoring signal, ADR-0036 d.3), `proposed` (which
 * `building` wears in the world) grows a not-yet-full young tree, `mapped` is
 * the full brownfield canopy, `healthy` the full green one; `unhealthy`
 * withers it to a sparse drooped crown with bare branches and leaf-fall.
 * Retired stories never reach this component (worldStatus.ts prunes them),
 * and the status arrives PROVEN (provenStatus): a green or withered crown is
 * the story's OWN UAT verdict speaking, never a child roll-up. The signpost
 * is the human-witness mark (ADR-0040): only uat_witness-human stories carry
 * one — dashed-blank until their UAT verdict is signed, a filled seal after
 * (the seal echoes the crown's hue; the FILL is the new bit).
 */
function StoryTree({
  territory: t,
  hidden,
  now,
}: {
  territory: Territory;
  hidden: ReadonlySet<string>;
  now: Date;
}): React.JSX.Element {
  const story = t.story;
  const st = story.status ?? 'unknown';
  const caps = story.capabilities.length;
  const withered = st === 'unhealthy';
  const sapling = caps === 0 && !withered;
  // The recently-landed bloom (ADR-0045): only a PASS within the window blooms,
  // and never on a withered crown (the rare authored-unhealthy-over-a-pass
  // disagreement renders the result, not a green announcement).
  const bloom = withered ? null : verdictBloom(story.verdict, now);
  // Proposed hasn't earned full growth: a young tree, bigger than the
  // claimed-but-empty sapling, smaller than the mapped/healthy canopy.
  const young = st === 'proposed' && !sapling;
  const R = crownRadius(caps) * (young ? 0.62 : 1);
  const cy = -1.65 * R;
  const verdictNote = story.verdict
    ? ` · UAT ${verdictPhrase(story.verdict)}`
    : story.uatWitness === 'human'
      ? ' · UAT awaiting its human witness'
      : '';

  // Deterministic per-blob jitter so the five islands' trees aren't clones.
  const jb = (
    i: number,
    bcx: number,
    bcy: number,
    br: number,
  ): { cx: number; cy: number; r: number } => {
    const k = hash(`${story.id}:crown:${i}`);
    return {
      cx: bcx + (rand01(k) - 0.5) * 0.12 * R,
      cy: bcy + (rand01(k + 1) - 0.5) * 0.1 * R,
      r: br * (0.94 + rand01(k + 2) * 0.12),
    };
  };
  const base = [
    { cx: 0, cy, r: R }, // the central blob is never jittered
    jb(1, -0.62 * R, cy + 0.3 * R, 0.62 * R),
    jb(2, 0.62 * R, cy + 0.3 * R, 0.62 * R),
    jb(3, -0.4 * R, cy - 0.52 * R, 0.55 * R),
    jb(4, 0.42 * R, cy - 0.5 * R, 0.57 * R),
  ];
  const highlights = [
    jb(5, -0.15 * R, cy - 0.3 * R, 0.6 * R),
    jb(6, -0.55 * R, cy - 0.05 * R, 0.38 * R),
    jb(7, 0.3 * R, cy - 0.55 * R, 0.36 * R),
  ];
  const trunkD = `M -3.6 0 C -3.2 ${(0.3 * cy).toFixed(1)}, -2.4 ${(0.65 * cy).toFixed(1)}, -2.2 ${cy.toFixed(1)} L 2.2 ${cy.toFixed(1)} C 2.4 ${(0.65 * cy).toFixed(1)}, 3.2 ${(0.3 * cy).toFixed(1)}, 3.6 0 Q 0 2.4 -3.6 0 Z`;
  const bareBranches = [
    `M 0 ${(-1.65 * R).toFixed(1)} C 2 ${(-2.07 * R).toFixed(1)}, 1 ${(-2.36 * R).toFixed(1)}, ${(0.21 * R).toFixed(1)} ${(-2.64 * R).toFixed(1)}`,
    `M ${(0.12 * R).toFixed(1)} ${(-2.29 * R).toFixed(1)} L ${(0.32 * R).toFixed(1)} ${(-2.43 * R).toFixed(1)}`,
    `M -4 ${(-1.79 * R).toFixed(1)} C -9 ${(-2.07 * R).toFixed(1)}, -8 ${(-2.25 * R).toFixed(1)}, ${(-0.46 * R).toFixed(1)} ${(-2.43 * R).toFixed(1)}`,
    `M ${(-0.31 * R).toFixed(1)} ${(-2.14 * R).toFixed(1)} L ${(-0.5 * R).toFixed(1)} ${(-2.18 * R).toFixed(1)}`,
  ];

  return (
    <g
      className={`story-tree st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${t.treeSpot.x.toFixed(1)} ${t.treeSpot.y.toFixed(1)})`}
    >
      <title>{`${story.id} — ${story.error ? 'story spec error' : st}${verdictNote}`}</title>
      <ellipse
        className="flora-shadow"
        cx={2}
        cy={2}
        rx={(sapling ? 9 : R * 0.78).toFixed(1)}
        ry={(sapling ? 2.8 : R * 0.2).toFixed(1)}
      />
      {sapling ? (
        <>
          <rect className="story-trunk" x={-1.6} y={-12} width={3.2} height={13} rx={1.4} />
          <g className="crown-lo">
            <circle cx={0} cy={-17} r={8.5} />
            <circle cx={-4.5} cy={-14.5} r={5} />
            <circle cx={4.5} cy={-14.5} r={5} />
          </g>
          <g className="crown-hi">
            <circle cx={-1.5} cy={-18.5} r={4.6} />
          </g>
          <path className="grass-tuft" d="M -10 -1 l -2 -4 M -10 -1 l 0 -5 M -10 -1 l 2 -4" />
          <path className="grass-tuft" d="M 12 -2 l -2 -4 M 12 -2 l 0 -5 M 12 -2 l 2 -4" />
        </>
      ) : withered ? (
        <>
          <path className="story-trunk" d={trunkD} />
          <g className="crown-lo">
            <circle cx={0} cy={cy + 0.15 * R} r={0.78 * R} />
            <circle cx={-0.62 * R} cy={cy + 0.36 * R} r={0.49 * R} />
          </g>
          <g className="crown-hi" opacity={0.7}>
            <circle cx={-0.21 * R} cy={cy - 0.14 * R} r={0.32 * R} />
          </g>
          <g className="story-bare">
            {bareBranches.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {[-14, -6, 8, 16].map((lx, i) => (
            <circle key={i} className="leaf-litter" cx={lx} cy={[-2, 1, -1, -4][i]} r={1.3} />
          ))}
        </>
      ) : (
        <>
          <path className="story-trunk" d={trunkD} />
          <g className="crown-lo">
            {base.map((b, i) => (
              <circle key={i} cx={b.cx.toFixed(1)} cy={b.cy.toFixed(1)} r={b.r.toFixed(1)} />
            ))}
          </g>
          <g className="crown-hi">
            {highlights.map((b, i) => (
              <circle key={i} cx={b.cx.toFixed(1)} cy={b.cy.toFixed(1)} r={b.r.toFixed(1)} />
            ))}
          </g>
        </>
      )}
      {bloom && (
        <LandingBloom
          unitId={story.id}
          bloom={bloom}
          cx={0}
          cy={sapling ? -17 : cy}
          r={sapling ? 13 : R * 1.18}
          kind="crown"
        />
      )}
      {story.uatWitness === 'human' && (
        <g
          className={`story-sign ${
            story.verdict ? `sign-witnessed verdict-${story.verdict.outcome}` : 'sign-blank'
          }`}
          transform={`translate(${(R * 0.7 + 9).toFixed(1)} 0)`}
        >
          <ellipse className="flora-shadow" cx={0.6} cy={0.8} rx={4} ry={1.6} />
          <rect x={-1.3} y={-15} width={2.6} height={15} rx={1.1} />
          <circle cy={-18} r={6.5} />
        </g>
      )}
    </g>
  );
}

/**
 * A capability as garden flora (ADR-0036 d.6b/d): a flower bed, berry bush or
 * sapling (hash-picked), tinted by the PROVEN status (worldStatus.ts): deep
 * green means the last signed run passed — the hue IS the verdict (ADR-0040),
 * so there is no ✓/✗ badge. A failed last run or authored `unhealthy` arrives
 * here as `unhealthy` and withers it to the matching dead silhouette; absence
 * of a verdict stays silent (the authored ladder under-claims).
 */
function GardenPlant({
  spot,
  hidden,
  now,
  onSelect,
}: {
  spot: CapSpot;
  hidden: ReadonlySet<string>;
  now: Date;
  onSelect: () => void;
}): React.JSX.Element {
  const { cap, x, y } = spot;
  const st = cap.status ?? 'unknown';
  const variant = hash(`${cap.id}:variant`) % 3;
  // The presented status already folds the verdict in (provenStatus) — the
  // flora only ever reads the world it was handed.
  const dead = st === 'unhealthy';
  // Recently-landed bloom (ADR-0045): a PASS within the window, never on a
  // withered plant — a smaller sparkle than the crown's, at the plant base.
  const bloom = dead ? null : verdictBloom(cap.verdict, now);
  const verdictNote = cap.verdict ? ` · ${verdictPhrase(cap.verdict)}` : '';

  let body: React.JSX.Element;
  if (dead && variant === 0) {
    // dead flower bed — shepherd's-crook stems, hanging dried heads, fallen petals
    body = (
      <g>
        <ellipse className="flora-bed" cx={0} cy={0.4} rx={8.5} ry={3} opacity={0.7} />
        <path
          className="flora-dead-stem"
          strokeWidth={1.2}
          d="M 0.5 0 C 0.6 -6 0.4 -10 2.6 -11.4 C 4.4 -12.4 5.8 -10.8 5.6 -9.2"
        />
        <circle className="flora-dead-head flora-dead-accent" cx={5.6} cy={-8.2} r={1.7} />
        <path
          className="flora-dead-stem"
          strokeWidth={1.1}
          d="M -3.5 0 C -4 -5 -4.5 -8.5 -2.5 -10 C -1 -11 0.5 -10 0.8 -8.4"
        />
        <circle className="flora-dead-head" cx={0.8} cy={-7.6} r={1.4} />
        <path className="flora-dead-stem" strokeWidth={1.1} d="M 4.2 0 L 4.8 -5.2 L 7.6 -7.4" />
        <circle className="leaf-litter" cx={-7} cy={-0.5} r={1} />
        <circle className="leaf-litter" cx={2.5} cy={1.2} r={1} />
        <circle className="leaf-litter" cx={6.5} cy={0.2} r={1} />
      </g>
    );
  } else if (dead && variant === 1) {
    // dead bush — bare twig skeleton, clinging dead leaves
    body = (
      <g>
        <path
          className="flora-dead-twig"
          strokeWidth={1.1}
          d="M 0 0 L -1 -4.5 M -1 -4.5 L -5 -8.5 M -1 -4.5 L 1.5 -9.5 M 1.5 -9.5 L 4.5 -11.5 M 1.5 -9.5 L 0.5 -12.5 M 0 -2.5 L 4 -6"
        />
        <circle className="leaf-litter flora-dead-accent" cx={-4.5} cy={-8} r={1.1} />
        <circle className="leaf-litter" cx={4} cy={-11} r={1.1} />
        <circle className="leaf-litter" cx={-2.5} cy={0.8} r={1} />
      </g>
    );
  } else if (dead) {
    // dead sapling — leaning bare whip, leaf-fall at the base
    body = (
      <g>
        <path
          className="flora-dead-twig"
          strokeWidth={1.4}
          d="M 0 0 C 0.4 -5 1.5 -9 3.5 -13 M 2 -8.5 L -1.5 -12 M 3 -11 L 6 -13.5"
        />
        <circle className="leaf-litter" cx={-3} cy={0.8} r={1} />
        <circle className="leaf-litter" cx={1.5} cy={1.4} r={1} />
        <circle className="leaf-litter flora-dead-accent" cx={5} cy={0.4} r={1} />
      </g>
    );
  } else if (variant === 0) {
    // flower bed — leaf blades, three stems, rosette centre bloom
    body = (
      <g>
        <ellipse className="flora-bed" cx={0} cy={0.4} rx={8.5} ry={3} />
        <path className="flora-dark" d="M -1 0 Q -7 -3 -9 -7 Q -4.5 -5.5 -1 0 Z" />
        <path className="flora-dark" d="M 1.5 0 Q 7.5 -2.5 9 -6 Q 5 -5 1.5 0 Z" />
        <path className="flora-stem" d="M -4 0 C -4.4 -4 -4.8 -7 -5.2 -10" />
        <path className="flora-stem" d="M 0 0 C 0.2 -5 0.3 -9 0.2 -13" />
        <path className="flora-stem" d="M 4 0 C 4.5 -4 5 -6.5 5.6 -9" />
        <circle className="flora-light" cx={-5.2} cy={-10} r={2.6} />
        <circle className="flora-light" cx={5.6} cy={-9} r={2.3} />
        {[0, 1, 2, 3, 4].map((k) => {
          const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
          return (
            <circle
              key={k}
              className="flora-light"
              cx={(0.2 + Math.cos(a) * 2.3).toFixed(1)}
              cy={(-13 + Math.sin(a) * 2.3).toFixed(1)}
              r={1.5}
            />
          );
        })}
        <circle className="flora-core" cx={0.2} cy={-13} r={1.3} />
      </g>
    );
  } else if (variant === 1) {
    // berry bush
    body = (
      <g>
        <polygon
          className="flora-dark"
          points="0,-12.5 5.5,-10.5 8.5,-5.5 7,-1 0,0.8 -7,-1 -8.5,-5.5 -5.5,-10.5"
        />
        <polygon
          className="flora-light"
          points="-1,-12.5 4.5,-10.8 6,-7 0.5,-5.6 -4.8,-7.4 -4.6,-10.6"
        />
        <circle className="flora-core" cx={-3.5} cy={-4.5} r={1.5} />
        <circle className="flora-core" cx={2} cy={-7.5} r={1.5} />
        <circle className="flora-core" cx={4.5} cy={-3.5} r={1.4} />
      </g>
    );
  } else {
    // sapling — echoes the central tree
    body = (
      <g>
        <path
          className="sapling-trunk"
          d="M -1.2 0 C -1 -4 -0.8 -7 -0.6 -9.5 L 0.9 -9.5 C 1 -7 1.2 -4 1.4 0 Z"
        />
        <polygon
          className="flora-dark"
          points="0,-18.5 5.4,-15.4 6.6,-10.2 3.4,-7.2 -3.4,-7.2 -6.6,-10.2 -5.4,-15.4"
        />
        <polygon className="flora-light" points="-0.6,-18.3 3.8,-15.8 3.4,-12 -1.6,-11.4 -4.4,-14.2" />
      </g>
    );
  }

  return (
    <g
      className={`garden-flora st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <title>{`${cap.id} — ${cap.error ? 'spec error' : st}${verdictNote}`}</title>
      <circle className="flora-hit" r={9.5} fill="transparent" />
      {dead && <ellipse className="dead-ground" cx={0} cy={0.5} rx={8} ry={3.2} />}
      <ellipse className="flora-shadow" cx={1} cy={1} rx={dead ? 6 : 8} ry={dead ? 2.2 : 2.6} />
      {body}
      {bloom && <LandingBloom unitId={cap.id} bloom={bloom} cx={0} cy={-5} r={8} kind="plant" />}
    </g>
  );
}

function TerritoryFlora({
  territory: t,
  className,
  hidden,
  builds,
  now,
  onHover,
  onSelect,
}: {
  territory: Territory;
  className: string;
  hidden: ReadonlySet<string>;
  builds: BuildActivity[];
  now: Date;
  onHover: (on: boolean) => void;
  onSelect: (capId: string | null) => void;
}): React.JSX.Element {
  const story = t.story;
  const statusKey = story.status ?? 'unknown';
  const plateW = Math.max(96, story.id.length * 7.2 + 28);

  // Forest clumps: 2–3 small conifers per forest tile — deliberately small so
  // the central story tree is the only thing over ~25px on an island.
  // Draw flora top-down by y so taller southern trees overlap correctly.
  const drawables: { y: number; el: React.JSX.Element }[] = [];
  t.decor.forEach((f) => {
    const count = 2 + (f.seed % 2);
    for (let i = 0; i < count; i++) {
      const a = rand01(f.seed + i * 7) * Math.PI * 2;
      const rr = rand01(f.seed + i * 13) * HEX_R * 0.55;
      const x = f.x + Math.cos(a) * rr;
      const y = f.y + Math.sin(a) * rr * 0.8 + 4;
      drawables.push({
        y,
        el: (
          <DecorTree key={`f:${f.seed}:${i}`} x={x} y={y} h={7 + rand01(f.seed + i) * 4} seed={f.seed + i} />
        ),
      });
    }
  });
  t.caps.forEach((spot) => {
    drawables.push({
      y: spot.y,
      el: (
        <GardenPlant
          key={`c:${spot.cap.id}`}
          spot={spot}
          hidden={hidden}
          now={now}
          onSelect={() => onSelect(spot.cap.id)}
        />
      ),
    });
  });
  drawables.push({
    y: t.treeSpot.y,
    el: <StoryTree key="story-tree" territory={t} hidden={hidden} now={now} />,
  });
  drawables.sort((a, b) => a.y - b.y);

  return (
    <g
      className={`hex-flora ${className}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => onSelect(null)}
    >
      {drawables.map((d) => d.el)}

      <g className="world-plate" transform={`translate(${t.centroid.x - plateW / 2} ${t.labelY})`}>
        <title>{story.error ? `${story.id} — ${story.error}` : story.title}</title>
        <rect className="world-plate-bg" width={plateW} height={30} rx={7} />
        <text className="world-plate-id" x={plateW / 2} y={13} textAnchor="middle">
          {story.id}
        </text>
        <text className="world-plate-sub" x={plateW / 2} y={25} textAnchor="middle">
          {story.error
            ? 'story spec error'
            : // No ✓/✗ here — the crown's hue and the signpost carry proof (ADR-0040);
              // precise verdict facts live in the tooltip and the panel.
              `${statusKey} · ${story.capabilities.length} caps`}
        </text>
      </g>

      {/* The orbiting layer is the HARNESS (ADR-0048 §5): a wisp orbits a story
          only while a leaf agent is mechanically building one of its units.
          Session presence no longer orbits — it lives in the dock / toolbar /
          panel ("who's planning work" is re-homed to a quieter form later). This
          is what makes the layer self-cleaning: no SessionEnd dependency, no 4 h
          zombie window, no nodes:[] dead-ends. */}
      <g transform={`translate(${t.centroid.x} ${t.centroid.y})`}>
        {/* In-flight BUILD wisps: a leaf agent is mechanically building this unit
            right now. Teal pulse, faster orbit, keyed by runId (its own identity).
            Informational — the tooltip carries the unit + run; clicking falls
            through to selecting the story. */}
        {builds.map((b) => {
          const phase = rand01(hash(b.runId)) * 360;
          return (
            <g key={`build:${b.runId}`} className="world-wisp band-building">
              <title>{`${b.unitId} — building (${b.tier}) · ${formatAge(b.at, now)} · run ${b.runId}`}</title>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${phase} 0 0`}
                to={`${phase + 360} 0 0`}
                dur="6s"
                repeatCount="indefinite"
              />
              <g transform={`translate(${t.radius * 0.72 + 10} 0)`}>
                <circle className="world-wisp-hit" r={12} fill="transparent" />
                <circle className="world-wisp-glow" r={6.5} />
                <circle className="world-wisp-dot" r={2.8} />
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
}

/**
 * The session dock — a small overlay in the world frame (the wisps' detail
 * surface). List mode shows EVERY active session, including the ones whose
 * declared nodes resolve to no loaded story (nodes:[] hook declarations) and so
 * orbit nowhere; detail mode shows one session's identity, work, anchors, and a
 * live-updating age/band (the `now` ticker re-renders it between polls).
 * Possibly-dead sessions no longer orbit as wisps (ADR-0041) but stay listed
 * here, parked after the live ones — the dock is the history/debugging surface
 * (a worktree deleted before SessionEnd leaves a row that can never be marked
 * done). Advisory like the wisps: a session that vanishes from the poll renders
 * an honest "no longer active" note rather than a stale card.
 */
function SessionDock({
  dock,
  sessions,
  anchors,
  now,
  storyForNode,
  onShowList,
  onShowDetail,
  onFocusStory,
  onClose,
}: {
  dock: SessionDockState;
  sessions: TreeSession[];
  anchors: ReadonlyMap<string, string[]>;
  now: Date;
  storyForNode: (node: string) => string | null;
  onShowList: () => void;
  onShowDetail: (sessionId: string) => void;
  onFocusStory: (storyId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const detail =
    dock.kind === 'detail' ? sessions.find((s) => s.sessionId === dock.id) : undefined;
  const { orbiting, parked } = splitSessions(sessions);
  const row = (s: TreeSession): React.JSX.Element => {
    const anchored = anchors.get(s.sessionId) ?? [];
    return (
      <button
        key={s.sessionId}
        type="button"
        className={`session-row${isOrbitingBand(s.band) ? '' : ' is-parked'}`}
        onClick={() => {
          onShowDetail(s.sessionId);
          // A row that maps to a territory also focuses it on the map.
          const first = anchored[0];
          if (first) onFocusStory(first);
        }}
      >
        <span className={`tree-session-band band-${s.band}`} title={s.band} />
        <code>{s.sessionId}</code>
        <span className="muted small">
          {formatAge(s.lastSeenAt, now)}
          {anchored.length === 0 ? ' · no territory' : ''}
        </span>
      </button>
    );
  };
  return (
    <div className="session-dock" role="dialog" aria-label="active sessions">
      <header>
        <h4>{dock.kind === 'list' ? `active sessions (${orbiting.length})` : 'session'}</h4>
        <button type="button" className="btn" onClick={onClose} aria-label="close sessions">
          ✕
        </button>
      </header>
      {dock.kind === 'list' ? (
        sessions.length === 0 ? (
          <p className="muted small">No active sessions right now.</p>
        ) : (
          <>
            {orbiting.map(row)}
            {parked.length > 0 && (
              <>
                <p className="session-parked-label muted small">
                  possibly dead — quiet ≥ 4 h, no longer orbiting
                </p>
                {parked.map(row)}
              </>
            )}
          </>
        )
      ) : detail ? (
        <div className="session-detail">
          <p className="session-detail-id">
            <span className={`tree-session-band band-${detail.band}`} title={detail.band} />
            <code>{detail.sessionId}</code>
          </p>
          <dl>
            <dt>state</dt>
            <dd>
              {detail.band} · last seen {formatAge(detail.lastSeenAt, now)} ago
            </dd>
            <dt>branch</dt>
            <dd>
              <code>{detail.branch}</code>
            </dd>
            <dt>working on</dt>
            <dd>{detail.workingOn}</dd>
            <dt>nodes</dt>
            <dd>
              {detail.nodes.length === 0 ? (
                <span className="muted">none declared — anchored to no territory</span>
              ) : (
                detail.nodes.map((n) => {
                  const owner = storyForNode(n);
                  return owner ? (
                    <button
                      key={n}
                      type="button"
                      className="tree-link"
                      onClick={() => onFocusStory(owner)}
                    >
                      {n}
                    </button>
                  ) : (
                    <code key={n} title="resolves to no loaded story">
                      {n}{' '}
                    </code>
                  );
                })
              )}
            </dd>
          </dl>
          <button type="button" className="tree-link" onClick={onShowList}>
            all sessions
          </button>
        </div>
      ) : (
        <div className="session-detail">
          <p className="muted small">This session is no longer active.</p>
          <button type="button" className="tree-link" onClick={onShowList}>
            all sessions
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One verdict, ADR-0033 d.3 vocabulary: ✓ proven / ✗ last run failed / – never built.
 * "Never built" is also what an OFFLINE session sees — glyphs are advisory and the
 * payload omits them when no live store answered.
 */
function VerdictLine({ verdict }: { verdict: TreeVerdict | undefined }): React.JSX.Element {
  if (!verdict) return <span className="muted">– never built</span>;
  const when = new Date(verdict.at).toLocaleString();
  return (
    <span className={verdict.outcome === 'pass' ? 'verdict-pass' : 'verdict-fail'}>
      {verdictPhrase(verdict)} · {when}
    </span>
  );
}

// The detail panel OVERLAYS the world from the right edge (the world never
// reflows or rescales when it opens or resizes) and is drag-resizable from its
// left edge — wide enough by default to fit a capability sub-DAG.
const PANEL_MIN = 360;
const PANEL_MAX = 960;
const PANEL_DEFAULT = 520;
const PANEL_W_KEY = 'st-tree-panel-w';

function savedPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_W_KEY));
  return Number.isFinite(saved) && saved >= PANEL_MIN ? Math.min(saved, PANEL_MAX) : PANEL_DEFAULT;
}

/**
 * The story detail's "UAT tests" table (ADR-0044 attestation-surface): each addressable UAT test
 * (parsed from the story's `## Story UAT` prose) as a row carrying one click-to-flag-green control.
 * The flag's hue is the per-test attestation state — GREEN for a pass vouch (human or machine),
 * RED for a fail, amber for an un-flagged test an admin may vouch, muted for one awaiting a machine
 * run. Clicking an amber flag records a direct "I saw it work" human attestation (the higher-rigor
 * in-UI signature; d.4). CRUCIAL INVARIANT: this is a VOUCH, not a proof — the green flag lives in
 * this DETAIL row only and NEVER paints the crown/island hue (d.2/d.3); only a signed gate verdict
 * greens a story (ADR-0040). Fetched per-story on open; silently absent when the store is down.
 */
function UatTestsSection({ storyId }: { storyId: string }): React.JSX.Element | null {
  const { me } = useAppData();
  const isAdmin = me.role === 'admin';
  const [tests, setTests] = useState<UatTestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.attestations(storyId);
      setTests(payload.tests);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [storyId]);

  useEffect(() => {
    setTests(null);
    void load();
  }, [load]);

  const record = async (testId: string): Promise<void> => {
    setBusy(testId);
    try {
      await api.recordAttestation({ testId, outcome: 'pass' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="muted small">UAT tests unavailable: {error}</p>;
  if (tests === null || tests.length === 0) return null; // loading, or a story with no parsed UAT tests

  return (
    <div className="uat-tests">
      <h4 className="tree-subdag-title">UAT tests ({tests.length})</h4>
      <table className="uat-table">
        <tbody>
          {tests.map((t) => {
            const mark = t.human ?? t.machine; // the dominant recorded vouch, if any
            const state = mark ? mark.outcome : 'none'; // 'pass' | 'fail' | 'none'
            // An admin may flag an un-vouched test green — but only one the test PERMITS a human to
            // attest (witness ≠ machine). A machine-only test stays muted until a real run signs it.
            const canFlag = isAdmin && state === 'none' && t.witness !== 'machine';
            const who = mark
              ? mark.relayedBy
                ? `${mark.signer} · relayed by ${mark.relayedBy}`
                : mark.signer
              : null;
            const flagTitle = mark
              ? `${mark.witness} attestation — ${mark.outcome}${who ? ` · ${who}` : ''}${mark.note ? ` · ${mark.note}` : ''}`
              : canFlag
                ? 'flag green — records that you saw this test work (a signed vouch, never a gate verdict)'
                : t.witness === 'machine'
                  ? 'awaiting a machine run — only an automated attestation flags this one'
                  : 'no attestation yet';
            return (
              <tr key={t.id} className={`uat-row state-${state}`}>
                <td className="uat-flag-cell">
                  <button
                    type="button"
                    className={`uat-flag state-${state}${canFlag ? ' is-clickable' : ''}`}
                    disabled={!canFlag || busy === t.id}
                    onClick={canFlag ? () => void record(t.id) : undefined}
                    title={flagTitle}
                    aria-label={
                      mark
                        ? `${mark.witness} attestation: ${mark.outcome}`
                        : `flag ${t.title} as seen working`
                    }
                  >
                    {busy === t.id ? '…' : mark ? '⚑' : '⚐'}
                  </button>
                </td>
                <td className="uat-test-cell">
                  <span className="uat-test-title">{t.title}</span>
                  {who && (
                    <span className="uat-test-who muted">
                      {mark?.witness} · {who}
                    </span>
                  )}
                </td>
                <td className="uat-witness-cell muted" title="who may attest this test">
                  {t.witness}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted attest-note">
        A vouch, not a gate verdict — recorded in <code>events.attestation</code>, never green-ing
        the story (ADR-0044).
      </p>
    </div>
  );
}

function StoryPanel({
  story,
  storyIds,
  sessions,
  now,
  selectedCap,
  hoverCap,
  hidden,
  onSelectCap,
  onHoverCap,
  onSelectSession,
  onClose,
}: {
  story: TreeStory;
  storyIds: ReadonlySet<string>;
  sessions: TreeSession[];
  now: Date;
  selectedCap: string | null;
  hoverCap: string | null;
  hidden: ReadonlySet<string>;
  onSelectCap: (id: string | null) => void;
  onHoverCap: (id: string | null) => void;
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const layout = useMemo(() => layoutSubdag(story), [story]);
  const panelSessions = splitSessions(sessions);
  const sessionLine = (s: TreeSession): React.JSX.Element => (
    <p
      key={s.sessionId}
      className={`tree-session small${isOrbitingBand(s.band) ? '' : ' is-parked'}`}
    >
      <span className={`tree-session-band band-${s.band}`} title={s.band} />
      <button type="button" className="tree-link" onClick={() => onSelectSession(s.sessionId)}>
        <code>{s.sessionId}</code>
      </button>
      <span className="muted"> {formatAge(s.lastSeenAt, now)} · </span>
      {s.workingOn}
    </p>
  );
  const [panelW, setPanelW] = useState(savedPanelWidth);
  const [resizing, setResizing] = useState(false);
  const dragFrom = useRef<{ x: number; w: number } | null>(null);
  // The latest dragged width, read at pointerup — state can lag a render behind.
  const liveW = useRef(panelW);
  const clampW = (w: number): number =>
    Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.min(w, window.innerWidth - 220)));
  // A selectedCap can survive cross-story navigation (depends-on buttons) —
  // ignore ids that aren't in this story instead of dimming the whole sub-DAG.
  const rawFocus = hoverCap ?? selectedCap;
  const focusCap =
    rawFocus && story.capabilities.some((c) => c.id === rawFocus) ? rawFocus : null;
  const relations = useMemo(
    () => (focusCap ? relationsFor(story.capabilities, focusCap) : null),
    [story, focusCap],
  );
  const cap = selectedCap ? story.capabilities.find((c) => c.id === selectedCap) : undefined;
  const dependents = cap
    ? story.capabilities.filter((c) => c.dependsOn.includes(cap.id)).map((c) => c.id)
    : [];

  const capClass = (c: TreeCapability): string => {
    const cls = ['tree-card', 'sub-card', `st-${c.status ?? 'unknown'}`];
    if (hidden.has(c.status ?? 'unknown')) cls.push('is-filtered');
    if (focusCap && relations) {
      if (c.id === focusCap) cls.push('is-focus');
      else if (relations.ancestors.has(c.id)) cls.push('is-ancestor');
      else if (relations.descendants.has(c.id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (c.id === selectedCap) cls.push('is-selected');
    return cls.join(' ');
  };

  const edgeClass = (e: { from: string; to: string }): string => {
    const cls = ['tree-edge'];
    if (focusCap && relations) {
      const anc = (id: string): boolean => id === focusCap || relations.ancestors.has(id);
      const desc = (id: string): boolean => id === focusCap || relations.descendants.has(id);
      if (relations.ancestors.has(e.from) && anc(e.to)) cls.push('is-ancestor');
      else if (relations.descendants.has(e.to) && desc(e.from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };

  return (
    <aside
      className={`tree-detail${resizing ? ' is-resizing' : ''}`}
      style={{ width: panelW }}
    >
      <div
        className="tree-detail-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize detail panel (drag left to widen)"
        onPointerDown={(e) => {
          dragFrom.current = { x: e.clientX, w: panelW };
          setResizing(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // synthetic pointers (tests) have no active pointer to capture
          }
        }}
        onPointerMove={(e) => {
          const from = dragFrom.current;
          if (!from) return;
          liveW.current = clampW(from.w + (from.x - e.clientX));
          setPanelW(liveW.current);
        }}
        onPointerUp={() => {
          dragFrom.current = null;
          setResizing(false);
          localStorage.setItem(PANEL_W_KEY, String(liveW.current));
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
          setResizing(false);
        }}
      />
      <header>
        <span className={`tree-badge st-${story.status ?? 'unknown'}`}>
          {story.status ?? 'unknown'}
        </span>
        <button type="button" className="btn" onClick={onClose} aria-label="close detail">
          ✕
        </button>
      </header>
      <h3>{story.id}</h3>
      <p className="tree-detail-title">{story.title}</p>
      {story.error && <p className="tree-detail-error">{story.error}</p>}
      {story.outcome && <p className="muted small">{story.outcome}</p>}
      <p className="small">
        <span className="muted">UAT verdict </span>
        <VerdictLine verdict={story.verdict} />
        <span className="muted"> · witness: {story.uatWitness}</span>
      </p>
      {story.dependsOn.length > 0 && (
        <p className="small">
          <span className="muted">depends on </span>
          {story.dependsOn.map((d) =>
            storyIds.has(d) ? (
              <button
                key={d}
                type="button"
                className="tree-link"
                onClick={() => navigate(treeFocusHref(d))}
              >
                {d}
              </button>
            ) : (
              <code key={d} title="declared, but no such story in the world">
                {d}{' '}
              </code>
            ),
          )}
        </p>
      )}

      {sessions.length > 0 && (
        <div className="tree-sessions">
          {/* The panel is a detail surface like the dock (ADR-0041): the count
              speaks live sessions only; parked (possibly-dead) rows stay listed
              after them — they no longer orbit the territory as wisps. */}
          <h4 className="tree-subdag-title">sessions here ({panelSessions.orbiting.length})</h4>
          {panelSessions.orbiting.map(sessionLine)}
          {panelSessions.parked.length > 0 && (
            <>
              <p className="session-parked-label muted small">
                possibly dead — quiet ≥ 4 h, no longer orbiting
              </p>
              {panelSessions.parked.map(sessionLine)}
            </>
          )}
        </div>
      )}

      <h4 className="tree-subdag-title">capabilities ({story.capabilities.length})</h4>
      <div className="tree-subdag-frame">
        <svg
          className="tree-subdag"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
        >
          {layout.edges.map((e) => (
            <path
              key={`${e.from}->${e.to}`}
              className={edgeClass(e)}
              d={e.d}
              markerEnd="url(#sub-arrow)"
            />
          ))}
          {layout.caps.map(({ cap: c, x, y }) => {
            const lines = idLines(c.id);
            return (
              <g
                key={c.id}
                className={capClass(c)}
                transform={`translate(${x} ${y})`}
                onMouseEnter={() => onHoverCap(c.id)}
                onMouseLeave={() => onHoverCap(null)}
                onClick={() => onSelectCap(selectedCap === c.id ? null : c.id)}
              >
                <title>{c.error ? `${c.id} — ${c.error}` : c.title}</title>
                <rect className="tree-card-bg" width={SUB_W} height={SUB_H} rx={7} />
                <path
                  className="tree-card-strip"
                  d={`M 0 ${SUB_STRIP} L 0 7 Q 0 0 7 0 L ${SUB_W - 7} 0 Q ${SUB_W} 0 ${SUB_W} 7 L ${SUB_W} ${SUB_STRIP} Z`}
                />
                <text className="tree-card-status" x={7} y={10}>
                  {c.error ? 'spec error' : (c.status ?? 'unknown')}
                </text>
                {c.verdict && (
                  <text className="tree-card-verdict" x={SUB_W - 6} y={10} textAnchor="end">
                    {c.verdict.outcome === 'pass' ? '✓' : '✗'}
                  </text>
                )}
                {lines.map((line, i) => (
                  <text
                    key={i}
                    className="tree-card-id"
                    x={SUB_W / 2}
                    y={SUB_STRIP + 13 + i * 12}
                    textAnchor="middle"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {cap && (
        <div className="tree-cap-detail">
          <header>
            <span className={`tree-badge st-${cap.status ?? 'unknown'}`}>
              {cap.status ?? 'unknown'}
            </span>
          </header>
          <h3>{cap.id}</h3>
          <p className="tree-detail-title">{cap.title}</p>
          {cap.error && <p className="tree-detail-error">{cap.error}</p>}
          {cap.outcome && <p className="muted small">{cap.outcome}</p>}
          <dl>
            <dt>verdict</dt>
            <dd>
              <VerdictLine verdict={cap.verdict} />
            </dd>
            {cap.proofMode && (
              <>
                <dt>proof mode</dt>
                <dd>{cap.proofMode}</dd>
              </>
            )}
            {cap.dependsOn.length > 0 && (
              <>
                <dt>depends on</dt>
                <dd>
                  {cap.dependsOn.map((d) => (
                    <button key={d} type="button" className="tree-link" onClick={() => onSelectCap(d)}>
                      {d}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {dependents.length > 0 && (
              <>
                <dt>depended on by</dt>
                <dd>
                  {dependents.map((d) => (
                    <button key={d} type="button" className="tree-link" onClick={() => onSelectCap(d)}>
                      {d}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>spec</dt>
            <dd>
              <code>{`stories/${story.id}/${cap.id}.md`}</code>
            </dd>
          </dl>
        </div>
      )}

      {/* The per-UAT-test attestation table sits at the FOOT of the drill-down (the last thing
          you read once you've taken in the story + its capability DAG) — a vouch surface, never
          the gate-green hue (ADR-0044). */}
      <UatTestsSection storyId={story.id} />
    </aside>
  );
}
