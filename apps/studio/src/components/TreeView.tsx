// TreeView — the story world (#/tree).
//
// A Dorfromantik-style hex-tile world that READS AS A TREE (ADR-0036 d.6):
// islands are dependency-ranked — the most-depended-upon stories sit at the
// bottom centre and dependents fan upward and outward, so the eye traces the
// load-bearing foundation up through the canopy. Every story claims a
// TERRITORY of extruded hexagonal tiles (one tile quota per capability plus a
// margin) and grows ONE central story tree — the story itself, crown sized by
// capability count, GROWTH and foliage carrying the lifecycle (ADR-0038): a
// young amber tree while proposed or claimed-but-empty (building wears proposed
// too — wisps carry live work), a full brownfield tree when mapped, deep green
// when healthy, withered to bare branches when unhealthy. Retired units don't
// render at all (worldStatus.ts). HUE CARRIES
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
import { WorldLegend } from './WorldLegend.js';
import {
  controlByKey,
  readControlValue,
  type ControlSpec,
} from '../lib/worldSettings.js';
import {
  solarSeeds,
  spokeEdges,
  dockedEdgePath,
  dockedRoads,
  orbitRings,
  type SolarNode,
  type DockNode,
} from '../lib/solarLayout.js';
import { fullConnectionSet } from '../lib/connectionSet.js';
import { bookshelfConsumers, shelfBooks } from '../lib/buildingLayout.js';
import { ConnectionsSection } from './ConnectionsSection.js';
import { WorldSettingsPanel } from './WorldSettingsPanel.js';
import type { BuildActivity, TreeCapability, TreeSession, TreeStory, TreeVerdict, UatTestRow } from '../types';

// The current `?…` search string, SSR-guarded ('' when there is no window). The
// panel-exposed readers default to this so non-panel call sites (and SSR) keep
// working unchanged; the panel threads a state-held search string instead so the
// world re-renders live without a reload.
function defaultSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

// Resolve the panel-exposed controls ONCE from the worldSettings schema (the single
// source of truth for their defaults + clamps). The readers above consume these so
// the literals live in exactly one place. `controlByKey` is total over these keys —
// they are declared in CONTROLS — so a miss is a programmer error, surfaced loudly.
function requireControl(key: string): ControlSpec {
  const c = controlByKey(key);
  if (!c) throw new Error(`worldSettings: missing control "${key}"`);
  return c;
}
const SUBSTRATE_CTL = requireControl('substrate');
const LAYOUT_CTL = requireControl('layout');
const BUILDING_ISLAND_CTL = requireControl('buildingIsland');

/** Shared empty id-set (the DAG path passes no hub ids). */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();

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
  /** Stamp a BUILDING icon on this island (ADR-0076 §2, distributed model): true when this
   *  story CONSUMES a building-tagged story (e.g. `library`) AND the buildings flag is on.
   *  The building (library) itself is not laid out as an island — its icon is distributed
   *  onto every consumer instead. False for a normal island with no building dependency. */
  bookshelf: boolean;
  /** Where the building icon sits on the island (beside the central tree, on owned land);
   *  present iff {@link bookshelf} is true. */
  bookshelfSpot?: Pt;
  /** This island IS a building (owner pivot 2026-06-21, `buildingIsland` mode): a
   *  building-tagged story rendered as a real on-map island with its EDGES suppressed and a
   *  bookshelf glyph beside its nameplate. True only in `buildingIsland` mode for a tagged
   *  story; false otherwise (the distributed-stamp world never sets it). */
  buildingGlyph: boolean;
}

interface WorldEdge {
  from: string;
  to: string;
  via: string[];
  d: string;
}

interface HexWorld {
  territories: Territory[];
  /** Pale coast tiles (1–2 rings beyond claimed land). */
  empties: Axial[];
  /** Claimed tiles in global back-to-front draw order, with territory index. */
  drawTiles: { h: Axial; owner: number }[];
  /** DAG/tree world: the `depends_on` roads as thin, no-arrow, PERIMETER-DOCKED lines
   *  (`dockedEdgePath` / `dockedRoads`) — the ONE road rendering since the river-trail
   *  system was retired (ADR-0076; owner steer 2026-06-20). Absent in solar mode, which
   *  draws its own `solar.roads`. */
  lineRoads?: WorldEdge[];
  /** Solar mode only (ADR-0074 §6 + the 2026-06-20 path refresh): the concentric orbit
   *  GRID + perimeter-docked thin connections that REPLACE the river-trail roads and
   *  centre-to-centre spokes in solar mode. Absent in the DAG world (byte-identical). */
  solar?: {
    /** The hub-cluster centre the orbit rings are concentric about. */
    center: Pt;
    /** Faint orbit-ring radii, inner → outer — the circle grid the islands sit on. */
    rings: number[];
    /** `depends_on` edges as perimeter-docked, gently-bowed thin curves. */
    roads: WorldEdge[];
    /** Provider-side `consumed_by` wiring (hub → organism), perimeter-docked + straight. */
    spokes: { from: string; to: string; d: string }[];
  };
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

/** A nameplate's resolved box + text/glyph anchors (px, plate-local). */
export interface NameplateLayout {
  /** Plate width. */
  w: number;
  /** Plate height. */
  h: number;
  /** Corner radius. */
  rx: number;
  /** Baseline y of the id (the bigger top line). */
  idY: number;
  /** Baseline y of the sub line. */
  subY: number;
  /** Leading bookshelf-glyph anchor (building plates only; ignored otherwise). */
  glyphX: number;
  glyphY: number;
  glyphScale: number;
}

/**
 * Nameplate geometry (owner ask 2026-06-22 — bigger name cards + bigger leading bookshelf).
 * A pure function of the id length and the building flag, so the box and its anchors are
 * unit-testable (Stage-1 of ADR-0070; the final look is owner-attested). Two sizes:
 *   • NORMAL — a modest global bump over the old 30px plate (height 33, id ~12px), leaving the
 *     positioning geometry (still centred on the centroid, drawn below the island) unchanged.
 *   • BUILDING — a distinctly larger landmark card (taller, wider min, larger id) with a big
 *     leading bookshelf glyph, so the root library reads as a landmark on the foundation row.
 * Building plates reserve a left gutter for the glyph and widen to keep the centred id clear
 * of it.
 */
export function nameplateLayout(idLen: number, building: boolean): NameplateLayout {
  if (building) {
    const glyphGutter = 30; // left band the enlarged bookshelf occupies
    const w = Math.max(132, idLen * 8.6 + 36 + glyphGutter);
    const h = 42;
    return {
      w,
      h,
      rx: 9,
      idY: 18,
      subY: 32,
      glyphX: 16,
      glyphY: h - 6,
      glyphScale: 0.92,
    };
  }
  const w = Math.max(100, idLen * 7.4 + 30);
  const h = 33;
  return { w, h, rx: 7, idY: 14, subY: 27, glyphX: 0, glyphY: 0, glyphScale: 1 };
}

/** ADR-0033 d.3 vocabulary — the one source for every verdict phrase. */
function verdictPhrase(v: TreeVerdict): string {
  return v.outcome === 'pass' ? '✓ proven' : '✗ last run failed';
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

/**
 * EDGELESS building island (owner pivot 2026-06-21, `buildingIsland` mode): a building-tagged
 * story (today just `library`) is laid out as a REAL on-map island — ranked/positioned by its
 * full dependency relationships like any island — but with NO roads/spokes drawn to it, so its
 * many inbound edges don't flood the map. A pure predicate so the edge filter below and the
 * `buildingGlyph` mark stay in lockstep and are unit-testable.
 */
export function isEdgeless(story: TreeStory, buildingIsland: boolean): boolean {
  return buildingIsland && story.building === true;
}

export function buildWorld(
  allStories: TreeStory[],
  opts?: {
    plantsScatter?: boolean;
    /** ADR-0074 §6: `solar` seeds islands on rank-keyed orbits around the hubs;
     *  `dag` (default) keeps the bottom-up dependency rows. */
    layoutMode?: LayoutMode;
    /** ADR-0076 §2: distribute stories tagged `render: building` as a BUILDING ICON stamped on
     *  every island that connects to them (e.g. `library` → a bookshelf on each consumer). The
     *  DEFAULT since the owner attested it (the component passes `readBuildings`, default true /
     *  escape `?buildings=off`); `false` here is only the bare-call fallback. In the
     *  DISTRIBUTED-only world (this on, `buildingIsland` off) the building drops out of the
     *  layout; in `buildingIsland` mode the building KEEPS its island AND its consumers keep the
     *  stamp (the two are decoupled, owner steer 2026-06-22). */
    buildings?: boolean;
    /** Owner pivot 2026-06-21 (DEFAULT ON since 2026-06-22): render each building-tagged story
     *  as a REAL on-map island (clickable, health tree) PINNED to the foundation row (rank 0,
     *  near `cli`), with its incident edges SUPPRESSED from the rendered road lists and a
     *  bookshelf glyph beside its nameplate. Coexists with the distributed `buildings` stamp on
     *  consumers (decoupled, not precedence). Default false here = the bare-call fallback ⇒ a
     *  plain connected-island world. */
    buildingIsland?: boolean;
    /** Ids of the synthetic central hubs in `stories` (solar mode only). */
    hubIds?: ReadonlySet<string>;
  },
): HexWorld {
  const plantsScatter = opts?.plantsScatter ?? false;
  const layoutMode = opts?.layoutMode ?? 'dag';
  const buildingIsland = opts?.buildingIsland ?? false;
  const buildings = opts?.buildings ?? false;
  const hubIds = opts?.hubIds ?? EMPTY_ID_SET;

  // Edgeless building-tagged stories (buildingIsland mode): they stay in the LAYOUT (ranked,
  // positioned, gardened) but every edge touching them is dropped from the RENDERED road
  // lists below, and their layout rank is pinned to the foundation row (see `rankOf`). The
  // set is empty unless buildingIsland is on.
  const edgelessIds = new Set(
    buildingIsland ? allStories.filter((s) => isEdgeless(s, true)).map((s) => s.id) : [],
  );
  const edgeIsDrawn = (e: { from: string; to: string }): boolean =>
    !edgelessIds.has(e.from) && !edgelessIds.has(e.to);

  // ADR-0076 §2 (distributed-bookshelf STAMP, owner steer 2026-06-20): a story tagged
  // `render: building` (e.g. `library`) has its icon stamped on every island that CONNECTS to
  // it. Independent of buildingIsland mode — the owner steer (2026-06-22) DECOUPLED the two:
  // even when the building keeps its own (edgeless) island, its consumers still carry the
  // "uses the library" stamp. The consumer set is computed from the FULL list (so the
  // building's inbound edges are visible). `buildings` off ⇒ no consumers, no stamps.
  const buildingIds = new Set(
    buildings ? allStories.filter((s) => s.building === true).map((s) => s.id) : [],
  );
  const bookshelfIds: ReadonlySet<string> = buildingIds.size
    ? bookshelfConsumers(
        allStories.map((s) => ({ id: s.id, dependsOn: s.dependsOn, consumedBy: s.consumedBy })),
        buildingIds,
      )
    : EMPTY_ID_SET;
  // EXCLUDE a building from the laid-out territories ONLY in the DISTRIBUTED-only world
  // (`buildings` on AND buildingIsland OFF): there it has no island, just the stamps. In
  // buildingIsland mode the building KEEPS its island (edgeless), so it stays in `stories`.
  const excludedIds: ReadonlySet<string> =
    buildingIds.size && !buildingIsland ? buildingIds : EMPTY_ID_SET;
  const stories = excludedIds.size
    ? allStories.filter((s) => !excludedIds.has(s.id))
    : allStories;

  // Hubs are sized like any other island (owner call 2026-06-19 — "make them like any
  // other island; work out the look later"). Their hub-ness is carried by the LAYOUT
  // (centred, everything orbits + spokes converge), not by a distinct size/skin.
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
  const naturalRanks = rankStories(stories, depsOf);
  // Owner steer 2026-06-22: PIN every edgeless (building-class) island to the ROOT/foundation
  // row (rank 0), decoupled from its dependency depth — its edges are suppressed anyway, so it
  // need not float up to sit above its dependencies, and the owner expects buildings at the
  // bottom with `cli`. A no-op when buildingIsland is off (`edgelessIds` is empty).
  const rankOf = (id: string): number => (edgelessIds.has(id) ? 0 : naturalRanks.get(id) ?? 0);
  const ranks = new Map<string, number>(stories.map((s) => [s.id, rankOf(s.id)]));
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
  if (layoutMode === 'solar') {
    // ADR-0074 §6: hubs at the centre, organisms on rank-keyed orbits. Seeds flow
    // into the SAME snap/grow/coast/edge pipeline below, so the islands and roads
    // read as the existing forest world — only WHERE they sit changes.
    const solarNodes: SolarNode[] = stories.map((s, i) => ({
      id: s.id,
      rank: ranks.get(s.id) ?? 0,
      hub: hubIds.has(s.id),
      radius: estRadius(quotas[i] ?? 3),
    }));
    for (const [i, p] of solarSeeds(solarNodes)) seedPx.set(i, p);
  } else for (let r = 0; r <= maxRank; r++) {
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

    // ADR-0076 §2: a CONSUMER of a building-tagged story carries the building's icon. Seat it
    // beside the tree (a deterministic side), then walk inward until it sits on owned land —
    // the same land-snap the garden plants use, so it never floats over the sea.
    const carriesBookshelf = bookshelfIds.has(story.id);
    let bookshelfSpot: Pt | undefined;
    if (carriesBookshelf) {
      const side = rand01(hash(`${story.id}:shelf-side`)) < 0.5 ? -1 : 1;
      let bx = treeSpot.x + side * (crownR + 17);
      let by = treeSpot.y + 7; // a touch in front of the trunk base so it reads as on the ground
      for (let k = 0; k < 5 && owner.get(axialKey(pixelToHex({ x: bx, y: by }))) !== i; k++) {
        bx += (treeSpot.x - bx) * 0.3;
        by += (treeSpot.y - by) * 0.3;
      }
      bookshelfSpot = { x: bx, y: by };
    }
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
      bookshelf: carriesBookshelf,
      ...(bookshelfSpot ? { bookshelfSpot } : {}),
      // buildingIsland mode (owner pivot 2026-06-21): a building-tagged story laid out as a
      // real on-map island carries the bookshelf glyph by its nameplate (and has its edges
      // suppressed below). Empty set ⇒ false everywhere when the flag is off.
      buildingGlyph: edgelessIds.has(story.id),
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

  // Connections are thin, no-arrow curves docked on each island's PERIMETER in the
  // bearing of its neighbour, NOT centre-to-centre (the website road model,
  // web/src/lib/world.ts), so a hub's many edges fan around its rim instead of converging
  // on one point. This is the ONE connection style for BOTH layouts since the river-trail
  // road system was retired (ADR-0076): the DAG/tree world draws `lineRoads`; solar adds a
  // faint orbit GRID + provider-side `consumed_by` hub spokes (disjoint — a spoke is never
  // also a road, ADR-0074 §4).
  // Perimeter-dock node for every island, keyed by story id — the rim point + dock radius
  // an edge meets (a touch INSIDE the bounding radius so the line lands on the coast).
  // Building-tagged stories (ADR-0076 §2) aren't in `territories` at all (filtered out of
  // the layout above), so they have no dock and never appear as a road endpoint — `dockedRoads`
  // would also drop any edge to a missing dock, but with the building gone from `stories` the
  // edge never even enters `edgeList`.
  const dockById = new Map<string, DockNode>(
    territories.map((t) => [t.story.id, { x: t.centroid.x, y: t.centroid.y, r: t.radius * 0.82 }]),
  );
  let solar: HexWorld['solar'];
  if (layoutMode === 'solar') {
    // hub centre = mean of the central hub islands' centroids (fallback: all islands)
    const orbiting = territories.filter((t) => !hubIds.has(t.story.id));
    const ref = territories.filter((t) => hubIds.has(t.story.id));
    const refSet = ref.length ? ref : territories;
    const center: Pt = {
      x: refSet.reduce((s, t) => s + t.centroid.x, 0) / refSet.length,
      y: refSet.reduce((s, t) => s + t.centroid.y, 0) / refSet.length,
    };
    // the orbit grid: one faint ring per rank, at that rank's mean island distance
    const rings = orbitRings(
      orbiting.map((t) => ({
        rank: ranks.get(t.story.id) ?? 0,
        dist: Math.hypot(t.centroid.x - center.x, t.centroid.y - center.y),
      })),
    ).map((r) => r.radius);
    // `depends_on` roads: thin, gently-bowed, perimeter-docked lines (the shared helper).
    // buildingIsland mode (owner pivot 2026-06-21): drop every road incident to an EDGELESS
    // building island — it stays positioned (it's still in `edgeList`/the rank graph) but no
    // road is painted to it, so its many inbound edges don't flood the map.
    const roads = dockedRoads(edgeList, dockById, 0.08).filter(edgeIsDrawn);
    // provider-side `consumed_by` wiring as straight, low-salience hub spokes.
    const spokeLines: { from: string; to: string; d: string }[] = [];
    for (const e of spokeEdges(stories.map((s) => ({ id: s.id, consumedBy: s.consumedBy })))) {
      if (!edgeIsDrawn(e)) continue; // edgeless building island: suppress its spokes too
      const a = dockById.get(e.from);
      const b = dockById.get(e.to);
      if (a && b) spokeLines.push({ from: e.from, to: e.to, d: dockedEdgePath(a, b, 0) });
    }
    solar = { center, rings, roads, spokes: spokeLines };
  }

  // DAG/tree world: the `depends_on` roads as thin, gently-bowed, perimeter-docked lines
  // (ADR-0076 — the one road rendering since the river-trail system was retired). Solar
  // draws its own `solar.roads` (above), so this is DAG-only.
  const lineRoads: WorldEdge[] | undefined =
    layoutMode !== 'solar'
      ? // buildingIsland mode (owner pivot 2026-06-21): suppress every road touching an
        // EDGELESS building island while leaving the layout/ranking untouched (no-op off).
        dockedRoads(edgeList, dockById, 0.08).filter(edgeIsDrawn)
      : undefined;

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
    ...(lineRoads ? { lineRoads } : {}),
    ...(solar ? { solar } : {}),
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
function readSubstrateMode(search: string = defaultSearch()): SubstrateMode | null {
  // SINGLE SOURCE OF TRUTH: the panel + this reader both resolve `substrate` through
  // worldSettings (its normalize mirrors the historical aliases). `hex` ⇒ null (the
  // classic-world escape); every other canonical value maps straight through.
  const v = readControlValue(search, SUBSTRATE_CTL) as string;
  if (v === 'hex') return null;
  if (v === 'relaxed-hex') return 'relaxed-hex';
  if (v === 'relaxed-quad') return 'relaxed-quad';
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

/** `?plants=scatter` disperses the capability garden off its rigid front arc. */
function readPlantsScatter(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('plants') === 'scatter';
}

/** Stories tagged `render: building` (ADR-0076 §2) are DISTRIBUTED as an icon on every island
 *  that connects to them (`library` → a bookshelf on each consumer; the building's own island
 *  drops out). This is the DEFAULT since the owner attested the look (2026-06-20); the escape
 *  `?buildings=off` restores the old world where a building is a normal connected island. */
function readBuildings(search: string = defaultSearch()): boolean {
  const v = new URLSearchParams(search).get('buildings');
  return v !== 'off' && v !== '0' && v !== 'false';
}

/** `buildingIsland` (gear toggle, owner pivot 2026-06-21, DEFAULT ON since 2026-06-22)
 *  renders each building-tagged story (today just `library`) as a REAL on-map island —
 *  clickable, with a health tree like any island, pinned to the ROOT/foundation row near
 *  `cli` — but with its EDGES suppressed (so its many inbound roads don't flood the map) and
 *  a bookshelf glyph by its nameplate. Its consumers still carry the distributed bookshelf
 *  STAMP. DEFAULT ON (the param is absent ⇒ the converged building-island world); the escape
 *  hatch `?buildingIsland=off` returns to a plain connected-island world. Gear-panel managed
 *  via worldSettings (the single source of truth), so the panel + this reader never drift;
 *  reactive on `search`. */
function readBuildingIsland(search: string = defaultSearch()): boolean {
  return readControlValue(search, BUILDING_ISLAND_CTL) as boolean;
}

// ---------- solar-system layout (ADR-0074 §6 / `solar-system-world`) ----------

type LayoutMode = 'dag' | 'solar';

/** `?layout=solar` ⇒ the RADIAL hub-and-spoke world; default `dag` = the current
 *  world (byte-identical — the param is absent). Gear-panel managed (worldSettings,
 *  the single source of truth for the default), so the panel + this reader never drift. */
function readLayoutMode(search: string = defaultSearch()): LayoutMode {
  return readControlValue(search, LAYOUT_CTL) === 'solar' ? 'solar' : 'dag';
}

/**
 * The central wiring hubs everything orbits in solar mode (ADR-0074 §2 — the wiring
 * layer is VISIBLE, not exempt: hiding the most-connected nodes hides the most
 * architecturally important relationships). `cli` / `store` are now FIRST-CLASS hub
 * organisms with real stories + capabilities + lightweight UATs (ADR-0074 §3, landed
 * PR #234), so `/api/tree` returns them like any island — they render with their real
 * capability trees and are fully selectable. `HUB_IDS` is used only to LAY THEM OUT
 * centrally; the synthetic `makeHubStory` below is a fallback for the edge case where
 * a hub story is absent from the payload (offline / pre-#234), kept so the radial world
 * still has a centre.
 */
const HUB_DEFS: readonly { id: string; title: string }[] = [
  { id: 'store', title: 'store' },
  { id: 'cli', title: 'cli' },
];
const HUB_IDS: ReadonlySet<string> = new Set(HUB_DEFS.map((h) => h.id));

/** A synthetic FALLBACK hub story — a bare central island, used only when the real
 *  cli/store story is missing from the payload (normally they come from /api/tree). */
function makeHubStory(def: { id: string; title: string }): TreeStory {
  return {
    id: def.id,
    title: def.title,
    outcome: 'wiring hub — every organism connects here',
    status: null,
    proofMode: '',
    uatWitness: 'human',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
  };
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

  // The one-shot tree load, extracted so a per-test UAT verdict signature (UatTestsSection) can
  // RE-PULL it — the crown greens from the per-test roll-up server-side (ADR-0082), so after a
  // signature the world must re-fetch to repaint the island.
  const reloadTree = useCallback((): void => {
    api
      .tree()
      .then((p) => {
        setStories(presentStories(p.stories));
        setSeedSessions(p.sessions ?? []);
        setSeedBuilds(p.builds ?? []);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    reloadTree();
  }, [reloadTree]);

  // Road routing LAYOUT (`?rivers=`, NOT water vs roads — roads is the only world now,
  // ADR-0073): the default `bundle` vs the `merge`/`confluence`/`strands` alternates.
  // Read once (URL constant), threaded into buildWorld AND its memo deps.
  const plantsScatter = useMemo(() => readPlantsScatter(), []);
  // The REACTIVE seam: the gear panel (WorldSettingsPanel) writes the gear dials into
  // the URL query string (params BEFORE the #hash) and updates this state, so the world
  // re-renders LIVE without a full reload. Seeded from the URL at mount (SSR-guarded).
  // Only the gear-exposed readers (substrate / layout) are keyed on it; plants the panel
  // never touches, so it stays mount-once.
  const [search, setSearch] = useState<string>(() => defaultSearch());
  // ADR-0074 §6: `?layout=solar` reskins the world radially with cli/store hubs at the
  // centre. Gear-panel managed, so it's reactive on `search` (live, no reload). In solar
  // mode the synthetic hub islands are injected ONLY into buildWorld's input — the
  // component's `stories` state (panel / selection / verdicts) stays clean.
  const layoutMode = useMemo(() => readLayoutMode(search), [search]);
  // ADR-0076 §2: distribute `render: building` stories (e.g. library) as a bookshelf STAMP on
  // every island that uses them. Default ON since the owner attested it; `?buildings=off`
  // drops the stamps. In buildingIsland mode (the default) the building keeps its own island
  // AND its consumers keep the stamp — decoupled in buildWorld. Reactive on `search`.
  const buildings = useMemo(() => readBuildings(search), [search]);
  // Owner pivot 2026-06-21 (DEFAULT ON since 2026-06-22): the building ISLAND. Building-tagged
  // stories (today just `library`) render as REAL on-map islands pinned to the root row, with
  // their edges suppressed and a bookshelf glyph by the nameplate; their consumers still carry
  // the distributed bookshelf stamp. Reactive on `search` (gear toggle, live, no reload).
  const buildingIsland = useMemo(() => readBuildingIsland(search), [search]);
  const worldStories = useMemo(() => {
    if (layoutMode !== 'solar' || !stories) return stories;
    const present = new Set(stories.map((s) => s.id));
    const hubs = HUB_DEFS.filter((h) => !present.has(h.id)).map(makeHubStory);
    return [...stories, ...hubs];
  }, [stories, layoutMode]);
  const world = useMemo(
    () =>
      worldStories
        ? buildWorld(worldStories, {
            plantsScatter,
            layoutMode,
            buildings,
            buildingIsland,
            hubIds: HUB_IDS,
          })
        : null,
    [worldStories, plantsScatter, layoutMode, buildings, buildingIsland],
  );

  // The gear panel commits a new search string here: write it into the URL with the
  // params placed BEFORE the #hash (replaceState — never pushState, so dragging a
  // slider doesn't spam history), then push it into state so the world re-renders
  // live. SSR-guarded (no window ⇒ state-only). The panel itself debounces slider
  // drags before calling this, so buildWorld doesn't rebuild on every pixel.
  const commitSearch = useCallback((nextSearch: string): void => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    }
    setSearch(nextSearch);
  }, []);

  // VISUAL SPIKE (do not land): swap the regular hex interiors for an irregular
  // relaxed grid when `?substrate=…` is set. Null = the default hex world.
  // Tuning (`jitter`/`iters`/`relax`/`wheatScatter`) is read from the URL so the
  // owner can dial the look in live without a rebuild.
  const substrateMode = useMemo(() => readSubstrateMode(search), [search]);
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
    if (HUB_IDS.has(story.id)) cls.push('is-hub'); // solar-mode central wiring hub
    if (focusStoryId && storyRelations) {
      if (story.id === focusStoryId) cls.push('is-focus');
      else if (storyRelations.ancestors.has(story.id)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(story.id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (story.id === selectedStory) cls.push('is-selected');
    return cls.join(' ');
  };

  // The wrapping class for a docked road/spoke: `world-trail` (the focus-dimming CSS keys
  // on it) plus the upstream-gold / downstream-red / dimmed tint when a story is focused.
  const roadClass = (e: WorldEdge): string => {
    const cls = ['world-trail'];
    if (focusStoryId && storyRelations) {
      const anc = (id: string): boolean => id === focusStoryId || storyRelations.ancestors.has(id);
      const desc = (id: string): boolean =>
        id === focusStoryId || storyRelations.descendants.has(id);
      if (storyRelations.ancestors.has(e.from) && anc(e.to)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(e.to) && desc(e.from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };

  const clearSelection = (): void => {
    setSelectedCap(null);
    navigate(treeHref);
  };
  const selectStory = (storyId: string, capId: string | null): void => {
    // Real cli/store stories (ADR-0074 §3) are selectable like any island and show their
    // capability trees. Only a SYNTHETIC fallback hub (absent from the story payload) has
    // no panel to open, so guard that case alone.
    if (HUB_IDS.has(storyId) && !stories?.some((s) => s.id === storyId)) return;
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
            className="world-scene world-roads"
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
              {/* SOLAR ORBIT GRID — the rings are still COMPUTED (`world.solar.rings` /
                  `.center`, machinery kept) but NOT DRAWN: the owner's steer (2026-06-20)
                  is to keep the orbit structure invisible and the islands loosely placed.
                  Re-enable by mapping `world.solar.rings` to faint `.solar-orbit-ring`
                  circles centred on `world.solar.center`. */}

              {/* the pale coast */}
              <g className="hex-coast">
                {world.empties.map((h) => {
                  const c = hexCenter(h);
                  return <path key={axialKey(h)} className="hex-empty" d={hexPath(c.x, c.y, HEX_R - 0.6)} />;
                })}
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

              {/* SOLAR connections (solar mode) — thin, no-arrow, PERIMETER-DOCKED curves
                  the website-way (web/src/lib/world.ts): spokes first (the de-noised
                  hub→organism `consumed_by` wiring, low salience), then the `depends_on`
                  roads above them. Both dock on each island's rim by bearing, so a hub's
                  edges fan around it instead of piling on one point (the owner's steer). */}
              {world.solar && (
                <>
                  <g className="solar-spoke-net">
                    {world.solar.spokes.map((s) => (
                      <path
                        key={`${s.from}->${s.to}`}
                        className="solar-spoke"
                        d={s.d}
                      />
                    ))}
                  </g>
                  <g className="solar-road-net">
                    {world.solar.roads.map((e) => (
                      <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                        <title>
                          {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                        </title>
                        <path className="solar-road" d={e.d} />
                      </g>
                    ))}
                  </g>
                </>
              )}

              {/* DAG/tree docked-line roads — thin, no-arrow, PERIMETER-DOCKED curves
                  (the ONE road rendering since the river-trail system was retired, ADR-0076;
                  the same style the solar world uses). Drawn ABOVE the land. */}
              {world.lineRoads && (
                <g className="dag-road-net">
                  {world.lineRoads.map((e) => (
                    <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                      <title>
                        {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                      </title>
                      <path className="dag-road" d={e.d} />
                    </g>
                  ))}
                </g>
              )}

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
          {/* The bottom "building legend" (ADR-0076 §2): the on-island building icons →
              their meaning, docked at the foot of the frame. Shown whenever buildings are
              distributed (the default) AND at least one bookshelf stamp is on the map;
              `?buildings=off` ⇒ absent. In buildingIsland mode (the default) the consumers
              still carry stamps, so the legend stays. */}
          {buildings && world.territories.some((t) => t.bookshelf) && <BuildingLegend />}
          {/* The world-tuning gear (bottom-right): sliders/toggles/selects bound to
              the URL dials. Closed by default ⇒ no params written ⇒ today's world is
              byte-identical. */}
          <WorldSettingsPanel search={search} onCommit={commitSearch} />
        </div>

        {selected && (
          <StoryPanel
            story={selected}
            stories={stories}
            storyIds={storyIds}
            sessions={sessionsByStory.get(selected.id) ?? []}
            now={now}
            selectedCap={selectedCap}
            hoverCap={hoverCap}
            hidden={hidden}
            onSelectCap={setSelectedCap}
            onHoverCap={setHoverCap}
            onSelectSession={(id) => setSessionDock({ kind: 'detail', id })}
            onCrownRefresh={reloadTree}
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
 * and foliage carry the lifecycle: `proposed` (which `building` wears in the
 * world) grows a not-yet-full young tree — as does a claimed-but-empty story
 * (zero capabilities), which renders the same small form in its status hue
 * rather than a distinct sapling stage (owner 2026-06-21); `mapped` is the
 * full brownfield canopy, `healthy` the full green one; `unhealthy`
 * withers it to a sparse drooped crown with bare branches and leaf-fall.
 * Retired stories never reach this component (worldStatus.ts prunes them),
 * and the status arrives PROVEN (provenStatus): a green or withered crown is
 * the story's OWN UAT verdict speaking, never a child roll-up. The signpost
 * is the human-witness mark (ADR-0040): only uat_witness-human stories carry
 * one — dashed-blank until their UAT verdict is signed, a filled seal after
 * (the seal echoes the crown's hue; the FILL is the new bit).
 */
// The bookshelf icon geometry (ADR-0076 §2): a tall, narrow, weathered case of ~4 shelves
// crammed with old leather books — many upright at varied heights, a few leaning, a couple
// stacked flat (the "old chaotic library shelf" the owner referenced). Base sits at y=0 and
// it grows upward (negative y), like the trees, so y-sorting layers it correctly. Sized
// small enough to sit on an island. The spine layout is the deterministic, unit-tested
// `shelfBooks` (buildingLayout.ts) — geometry red-green; the PALETTE/appearance is
// owner-attested (ADR-0070), carried by CSS (`.bookshelf-*`).
const BOOKSHELF = {
  W: 22, // case outer width
  H: 30, // case outer height (base at y=0, top at y=-H)
  wall: 1.8, // side-panel thickness
  plinth: 3, // plinth height at the base
  topMargin: 1.4, // gap above the top shelf, under the top board
  shelves: 4,
  board: 1, // shelf-board thickness
};

/**
 * The bookshelf art as a `<g>` centred horizontally at the origin with its base on y=0 —
 * shared by the on-island {@link StoryBookshelf} and the bottom {@link BuildingLegend}, so the
 * two can never drift. Pure geometry off `shelfBooks(seed)`; deterministic per `seed`.
 */
function BookshelfGlyph({ seed }: { seed: number }): React.JSX.Element {
  const B = BOOKSHELF;
  const interiorW = B.W - 2 * B.wall;
  const usable = B.H - B.plinth - B.topMargin;
  const comp = usable / B.shelves; // one compartment's height
  const shelfInteriorH = comp - B.board - 0.4; // headroom for books under the next board
  const rows = Array.from({ length: B.shelves }, (_, k) => {
    const boardY = -(B.plinth + k * comp); // the surface this shelf's books rest on
    // every 3rd shelf swaps a few upright spines for a small flat stack — the lived-in look
    const flat = k === 1;
    const books = shelfBooks(seed * 31 + k * 7 + 13, interiorW * (flat ? 0.66 : 1), shelfInteriorH);
    return { k, boardY, books, flat };
  });
  // a couple of books piled flat on TOP of the case (the overflow pile)
  const topPile = shelfBooks(seed * 53 + 5, interiorW * 0.7, 2.6).slice(0, 3);

  return (
    <g className="story-bookshelf-art">
      {/* plinth */}
      <rect className="bookshelf-plinth" x={-B.W / 2 - 1} y={-B.plinth} width={B.W + 2} height={B.plinth} rx={0.6} />
      {/* the dark case interior (books sit against it) */}
      <rect className="bookshelf-case" x={-B.W / 2} y={-B.H} width={B.W} height={B.H - B.plinth} rx={1} />
      {/* shelf boards */}
      {rows.map(({ k, boardY }) => (
        <rect
          key={`b${k}`}
          className="bookshelf-board"
          x={-B.W / 2 + B.wall * 0.5}
          y={boardY}
          width={B.W - B.wall}
          height={B.board}
        />
      ))}
      {/* book spines (upright) + occasional flat stack, per shelf */}
      {rows.map(({ k, boardY, books, flat }) => (
        <g key={`s${k}`}>
          {books.map((bk, i) => {
            const x = -interiorW / 2 + bk.x;
            const cx = x + bk.w / 2;
            return (
              <rect
                key={i}
                className={`bookshelf-book bk-${bk.variant}`}
                x={x.toFixed(2)}
                y={(boardY - bk.h).toFixed(2)}
                width={bk.w.toFixed(2)}
                height={bk.h.toFixed(2)}
                rx={0.4}
                {...(bk.tilt
                  ? { transform: `rotate(${bk.tilt.toFixed(1)} ${cx.toFixed(2)} ${boardY.toFixed(2)})` }
                  : {})}
              />
            );
          })}
          {flat &&
            // a small flat stack to the side of this shelf's spines (varied lengths)
            [0, 1, 2].map((j) => {
              const sw = interiorW * (0.26 - j * 0.02);
              const sx = interiorW / 2 - sw - 0.5;
              const sy = boardY - 1.3 * (j + 1);
              return (
                <rect
                  key={`f${j}`}
                  className={`bookshelf-book bk-${(seed + j + k) % 5}`}
                  x={sx.toFixed(2)}
                  y={sy.toFixed(2)}
                  width={sw.toFixed(2)}
                  height={1.2}
                  rx={0.3}
                />
              );
            })}
        </g>
      ))}
      {/* top board */}
      <rect className="bookshelf-board" x={-B.W / 2} y={-B.H} width={B.W} height={B.board + 0.4} rx={0.6} />
      {/* the overflow pile on top */}
      {topPile.map((bk, i) => {
        const x = -interiorW / 2 + bk.x;
        return (
          <rect
            key={`t${i}`}
            className={`bookshelf-book bk-${(bk.variant + 2) % 5}`}
            x={x.toFixed(2)}
            y={(-B.H - 2.6 + (i % 2)).toFixed(2)}
            width={(bk.w * 1.9).toFixed(2)}
            height={2.2}
            rx={0.3}
          />
        );
      })}
      {/* side panels (over the book side-edges) */}
      <rect className="bookshelf-side" x={-B.W / 2} y={-B.H} width={B.wall} height={B.H - B.plinth} rx={0.8} />
      <rect className="bookshelf-side" x={B.W / 2 - B.wall} y={-B.H} width={B.wall} height={B.H - B.plinth} rx={0.8} />
    </g>
  );
}

/**
 * The library-as-a-building icon (ADR-0076 §2) stamped on an island that CONSUMES the
 * library — a small weathered bookshelf beside the story tree, NOT a replacement for it: the
 * "this island uses the library" marker. In buildingIsland mode (the default since 2026-06-22)
 * the library ALSO has its own root island, and the stamp coexists with it. The wrapping flora
 * group keeps the island clickable; the tooltip names what it means.
 * Appearance is owner-attested (ADR-0070) — geometry only here.
 */
function StoryBookshelf({
  territory: t,
  hidden,
}: {
  territory: Territory;
  hidden: ReadonlySet<string>;
}): React.JSX.Element {
  const story = t.story;
  const st = story.status ?? 'unknown';
  const spot = t.bookshelfSpot ?? t.treeSpot;
  return (
    <g
      className={`story-bookshelf${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${spot.x.toFixed(1)} ${spot.y.toFixed(1)}) scale(1.18)`}
    >
      <title>{`library — used by ${story.id}`}</title>
      <ellipse className="flora-shadow" cx={1} cy={1.6} rx={12.5} ry={3.1} />
      <BookshelfGlyph seed={hash(`${story.id}:shelf`)} />
    </g>
  );
}

/**
 * The bottom "building legend" (ADR-0076 §2): maps each on-island building ICON to what it
 * means, docked at the foot of the forest frame — SEPARATE from the top {@link WorldLegend}
 * (the plant/tree vocabulary). Data-driven so future buildings are one row each. Shown only
 * when the buildings flag is on and at least one icon is on the map.
 */
const BUILDING_LEGEND: { key: string; title: string; note: string; glyph: () => React.JSX.Element }[] = [
  {
    key: 'library',
    title: 'library',
    note: 'the shared library — shown on every island that uses it',
    glyph: () => <BookshelfGlyph seed={1} />,
  },
];

function BuildingLegend(): React.JSX.Element {
  return (
    <div className="building-legend-dock">
      <div className="building-legend-bar" role="group" aria-label="building legend">
        <span className="building-legend-head">buildings</span>
        {BUILDING_LEGEND.map((b) => (
          <div key={b.key} className="building-legend-item" title={b.note}>
            <span className="building-legend-icon">
              <svg viewBox="-15 -35 30 38" aria-hidden="true">
                {b.glyph()}
              </svg>
            </span>
            <span className="building-legend-text">
              <span className="building-legend-title">{b.title}</span>
              <span className="building-legend-note">{b.note}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  // The recently-landed bloom (ADR-0045): only a PASS within the window blooms,
  // and never on a withered crown (the rare authored-unhealthy-over-a-pass
  // disagreement renders the result, not a green announcement).
  const bloom = withered ? null : verdictBloom(story.verdict, now);
  // The not-yet-full form: a small tree in the status hue. `proposed` hasn't earned
  // full growth, and a claimed-but-empty story (zero capabilities) renders the SAME
  // small form rather than a distinct sapling stage (owner 2026-06-21 — the sapling
  // state was visually identical to a zero-cap proposed tree, so it was folded in).
  const young = !withered && (st === 'proposed' || caps === 0);
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
        rx={(R * 0.78).toFixed(1)}
        ry={(R * 0.2).toFixed(1)}
      />
      {withered ? (
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
          cy={cy}
          r={R * 1.18}
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
  // Nameplate box + anchors (owner ask 2026-06-22: bigger cards; building cards are landmarks).
  const plate = nameplateLayout(story.id.length, t.buildingGlyph);

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
  // ADR-0076 §2: a consumer of the library carries a small bookshelf BESIDE its tree — the
  // "this island uses the library" marker. In buildingIsland mode (the default) the library
  // ALSO has its own root island; the stamp and the island coexist (owner steer 2026-06-22).
  if (t.bookshelf && t.bookshelfSpot) {
    drawables.push({
      y: t.bookshelfSpot.y,
      el: <StoryBookshelf key="story-bookshelf" territory={t} hidden={hidden} />,
    });
  }
  drawables.sort((a, b) => a.y - b.y);

  return (
    <g
      className={`hex-flora ${className}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={() => onSelect(null)}
    >
      {drawables.map((d) => d.el)}

      <g
        className={`world-plate${t.buildingGlyph ? ' is-building' : ''}`}
        transform={`translate(${t.centroid.x - plate.w / 2} ${t.labelY})`}
      >
        <title>{story.error ? `${story.id} — ${story.error}` : story.title}</title>
        <rect className="world-plate-bg" width={plate.w} height={plate.h} rx={plate.rx} />
        {/* buildingIsland mode (owner pivot 2026-06-21): a bookshelf glyph WITHIN the
            nameplate, left of the name, marks this island AS a building (the library). Enlarged
            2026-06-22 (owner ask: bigger cards + icons) and seated as a leading marker on the
            larger building plate. The look (size/placement/side) is owner-attested (ADR-0070). */}
        {t.buildingGlyph && (
          <g
            className="world-plate-building"
            transform={`translate(${plate.glyphX} ${plate.glyphY}) scale(${plate.glyphScale})`}
            aria-hidden="true"
          >
            <BookshelfGlyph seed={hash(`${story.id}:plate-shelf`)} />
          </g>
        )}
        <text className="world-plate-id" x={plate.w / 2} y={plate.idY} textAnchor="middle">
          {story.id}
        </text>
        <text className="world-plate-sub" x={plate.w / 2} y={plate.subY} textAnchor="middle">
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
 * The story detail's "UAT tests" table (ADR-0082 attestation-surface): each addressable UAT test
 * (parsed from the story's `## Story UAT` prose) as a row carrying TWO deliberately-distinct marks,
 * mirroring the CLI `uat list` / `storytree tree`:
 *  - PROVEN (✓/✗/–) — the SIGNED verdict in `events.verdict`, the REAL gate state that greens the
 *    story crown via the per-test AND-roll-up (ADR-0082 d.3). For a human/`either` test an admin has
 *    not yet proven, the ✓ is a clickable **"I saw it work"** button that signs an `operator-attested`
 *    verdict (ADR-0044 §4's in-UI signature, now a real green path) — the server stamps the signer
 *    from the verified identity and REFUSES a machine-witness test (a click is not a machine proof).
 *  - the VOUCH flag (⚑/⚐) — the lower-rigor `events.attestation` "I also eyeballed it" mark, kept
 *    intact; GREEN for a pass vouch, amber when an admin may add one, muted otherwise. A vouch is
 *    NOT a proof — it never greens the crown (ADR-0044 d.2/d.3).
 * Signing re-pulls this panel (the proven glyph) AND the world tree (the crown). Fetched per-story
 * on open; silently absent when the live store is down.
 */
function UatTestsSection({
  storyId,
  onCrownRefresh,
}: {
  storyId: string;
  onCrownRefresh: () => void;
}): React.JSX.Element | null {
  const { me } = useAppData();
  const isAdmin = me.role === 'admin';
  const [tests, setTests] = useState<UatTestRow[] | null>(null);
  const [storyUat, setStoryUat] = useState<'healthy' | 'unhealthy' | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.attestations(storyId);
      setTests(payload.tests);
      setStoryUat(payload.storyUat);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [storyId]);

  useEffect(() => {
    setTests(null);
    void load();
  }, [load]);

  // The lower-rigor VOUCH (events.attestation) — kept intact (ADR-0044 d.2): an "I also eyeballed it"
  // mark that NEVER greens the crown.
  const recordVouch = async (testId: string): Promise<void> => {
    setBusy(`vouch:${testId}`);
    try {
      await api.recordAttestation({ testId, outcome: 'pass' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // The "I saw it work" operator-attested VERDICT (events.verdict) — the higher-rigor signature that
  // greens the story crown (ADR-0082). Refreshes the per-test proven glyph AND re-pulls the world.
  const signVerdict = async (testId: string): Promise<void> => {
    setBusy(`sign:${testId}`);
    try {
      await api.signUat({ testId, outcome: 'pass' });
      await load();
      onCrownRefresh();
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
            // PROVEN — the SIGNED verdict (events.verdict): the real gate state that greens the crown.
            const proven = t.proven; // 'pass' | 'fail' | undefined
            // An admin signs a human/`either` test not yet proven; a machine test refuses a click.
            const canSign = isAdmin && proven !== 'pass' && t.witness !== 'machine';
            const signBusy = busy === `sign:${t.id}`;
            // A faint ✓ INVITES the signature (signable); a solid ✓ / ✗ is the recorded verdict; – is
            // an un-provable-by-click (machine) or not-yet-proven test.
            const provenGlyph =
              proven === 'pass' ? '✓' : proven === 'fail' ? '✗' : canSign ? '✓' : '–';
            const provenTitle =
              proven === 'pass'
                ? 'PROVEN — a signed operator-attested verdict (greens the story crown when every test passes, ADR-0082)'
                : proven === 'fail'
                  ? 'a signed FAIL verdict for this test'
                  : canSign
                    ? 'I saw it work — sign an operator-attested verdict (a REAL gate verdict, not a vouch)'
                    : t.witness === 'machine'
                      ? 'awaiting a machine proof — a click cannot green a machine-witness test'
                      : 'not yet proven';

            // VOUCH — the existing lower-rigor events.attestation mark, intact.
            const mark = t.human ?? t.machine;
            const vouchState = mark ? mark.outcome : 'none'; // 'pass' | 'fail' | 'none'
            const canVouch = isAdmin && vouchState === 'none' && t.witness !== 'machine';
            const vouchBusy = busy === `vouch:${t.id}`;
            const who = mark
              ? mark.relayedBy
                ? `${mark.signer} · relayed by ${mark.relayedBy}`
                : mark.signer
              : null;
            const vouchTitle = mark
              ? `${mark.witness} vouch — ${mark.outcome}${who ? ` · ${who}` : ''}${mark.note ? ` · ${mark.note}` : ''}`
              : canVouch
                ? 'flag — record that you also eyeballed this (a vouch, NEVER a gate verdict)'
                : t.witness === 'machine'
                  ? 'awaiting a machine run'
                  : 'no vouch yet';

            return (
              <tr key={t.id} className="uat-row">
                {/* PROVEN — the signed verdict; a clickable "I saw it work" button when signable. */}
                <td className="uat-proven-cell">
                  <button
                    type="button"
                    className={`uat-proven proven-${proven ?? 'none'}${canSign ? ' is-signable' : ''}`}
                    disabled={!canSign || signBusy}
                    onClick={canSign ? () => void signVerdict(t.id) : undefined}
                    title={provenTitle}
                    aria-label={
                      proven
                        ? `${t.title}: ${proven === 'pass' ? 'proven' : 'failed'}`
                        : canSign
                          ? `I saw ${t.title} work — sign a verdict`
                          : `${t.title}: not proven`
                    }
                  >
                    {signBusy ? '…' : provenGlyph}
                  </button>
                </td>
                <td className="uat-test-cell">
                  <span className="uat-test-title">{t.title}</span>
                  {who && (
                    <span className="uat-test-who muted">
                      vouch: {mark?.witness} · {who}
                    </span>
                  )}
                </td>
                {/* VOUCH — the lower-rigor mark, intact. */}
                <td className="uat-flag-cell">
                  <button
                    type="button"
                    className={`uat-flag state-${vouchState}${canVouch ? ' is-clickable' : ''}`}
                    disabled={!canVouch || vouchBusy}
                    onClick={canVouch ? () => void recordVouch(t.id) : undefined}
                    title={vouchTitle}
                    aria-label={mark ? `${mark.witness} vouch: ${mark.outcome}` : `vouch ${t.title}`}
                  >
                    {vouchBusy ? '…' : mark ? '⚑' : '⚐'}
                  </button>
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
        <strong>✓/✗/–</strong> = the SIGNED verdict (<code>events.verdict</code>), which greens the
        crown; <strong>⚑/⚐</strong> = the lower-rigor vouch (<code>events.attestation</code>), which
        never does (ADR-0082/ADR-0044).
        {storyUat !== undefined && (
          <>
            {' '}
            <span className={`uat-story-rollup rollup-${storyUat ?? 'none'}`}>
              Story UAT:{' '}
              {storyUat === 'healthy'
                ? 'GREEN — every test proven'
                : storyUat === 'unhealthy'
                  ? 'WITHERED — a proven test failed'
                  : 'unproven — not every test has a signed pass'}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function StoryPanel({
  story,
  stories,
  storyIds,
  sessions,
  now,
  selectedCap,
  hoverCap,
  hidden,
  onSelectCap,
  onHoverCap,
  onSelectSession,
  onCrownRefresh,
  onClose,
}: {
  story: TreeStory;
  stories: TreeStory[];
  storyIds: ReadonlySet<string>;
  sessions: TreeSession[];
  now: Date;
  selectedCap: string | null;
  hoverCap: string | null;
  hidden: ReadonlySet<string>;
  onSelectCap: (id: string | null) => void;
  onHoverCap: (id: string | null) => void;
  onSelectSession: (sessionId: string) => void;
  /** Re-pull the world tree after a per-test UAT verdict is signed, so the crown repaints. */
  onCrownRefresh: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const layout = useMemo(() => layoutSubdag(story), [story]);
  // The node's FULL declared connection set (ADR-0074 §4): outbound depends_on AND
  // the unioned/derived inbound — own consumed_by ∪ every story whose depends_on
  // names it. Resolved from the whole story list so the inverse is recovered (the
  // de-noised cli hub declares none of its own spokes). See lib/connectionSet.ts.
  const connections = useMemo(() => fullConnectionSet(stories, story.id), [stories, story.id]);
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
      {/* The node's full two-way wiring (ADR-0074 §4): depends_on (outbound) AND
          consumed_by ∪ derived-inverse (inbound) — so a reader sees how the organism
          is wired without leaving the panel. */}
      <ConnectionsSection
        connections={connections}
        storyIds={storyIds}
        onNavigate={(d) => navigate(treeFocusHref(d))}
      />

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
      <UatTestsSection storyId={story.id} onCrownRefresh={onCrownRefresh} />
    </aside>
  );
}
