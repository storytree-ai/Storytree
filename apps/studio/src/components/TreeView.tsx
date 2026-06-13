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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { api } from '../api';
import { verdictBloom, type VerdictBloom } from '../lib/activity.js';
import { formatAge, isOrbitingBand, splitSessions, usePresence } from '../lib/presence';
import { navigate, treeFocusHref, treeHref } from '../lib/route';
import { presentStories } from '../lib/worldStatus.js';
import { WorldLegend } from './WorldLegend.js';
import type { TreeCapability, TreeSession, TreeStory, TreeVerdict } from '../types';

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
const RANK_GAP = 58; // vertical clearance between grown territories of adjacent ranks
const ISLAND_GAP = 72; // horizontal clearance between territories sharing a rank
const RANK_SWING = 235; // lateral swing for a lone island, so its roads read as diagonals

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
  boundary: BoundarySeg[];
  labelY: number;
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
  edges: WorldEdge[];
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

/**
 * A curved road from the dependency territory to the dependent one. Docks at
 * the coast (the central story tree owns the centroid now); an edge spanning
 * ≥2 ranks takes a guaranteed outward bow so it hugs the outside of the fan
 * instead of piercing the territories between.
 */
function roadPath(a: Territory, b: Territory, rankSpan: number): string {
  const dx = b.centroid.x - a.centroid.x;
  const dy = b.centroid.y - a.centroid.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const sx = a.centroid.x + ux * (a.radius * 0.8);
  const sy = a.centroid.y + uy * (a.radius * 0.8);
  const ex = b.centroid.x - ux * (b.radius * 0.85);
  const ey = b.centroid.y - uy * (b.radius * 0.85);
  const r = rand01(hash(`${a.story.id}->${b.story.id}`));
  let bow: number;
  if (rankSpan >= 2) {
    // Span-scaled: intermediate islands swing up to ~RANK_SWING off the trunk,
    // so the apex must clear that far out on the leaning side.
    const side = Math.sign((a.centroid.x + b.centroid.x) / 2) || (r < 0.5 ? -1 : 1);
    bow = side * Math.min(0.45, 0.18 + 0.07 * rankSpan + 0.06 * r) * dist;
  } else {
    bow = (r - 0.5) * 0.4 * dist;
  }
  const mx = (sx + ex) / 2 - uy * bow;
  const my = (sy + ey) / 2 + ux * bow;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function buildWorld(stories: TreeStory[]): HexWorld {
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
      const jitterA = (rand01(hash(`${story.id}:${cap.id}:a`)) - 0.5) * (ARC / n) * 0.5;
      const angle = -Math.PI / 6 + ((j + 0.5) / n) * ARC + jitterA;
      const rr = ringR + (rand01(hash(`${story.id}:${cap.id}:r`)) - 0.5) * 10;
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
    return { story, tiles, centroid, radius, treeSpot, caps, decor, wheatTiles, boundary, labelY };
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

  // Roads render the SAME edge set the ranking used (declared ∪ derived).
  const byId = new Map(territories.map((t, i) => [t.story.id, i]));
  const edges: WorldEdge[] = edgeList.flatMap((e) => {
    const a = territories[byId.get(e.from) ?? -1];
    const b = territories[byId.get(e.to) ?? -1];
    if (!a || !b) return [];
    const span = Math.abs((ranks.get(e.to) ?? 0) - (ranks.get(e.from) ?? 0));
    return [{ ...e, d: roadPath(a, b, span) }];
  });

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
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
    offset: { x: -minX, y: -minY },
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
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const world = useMemo(() => (stories ? buildWorld(stories) : null), [stories]);

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

  if (loadError) {
    return (
      <div className="pad">
        <h2>Story world</h2>
        <p className="muted">Couldn’t load the tree: {loadError}</p>
      </div>
    );
  }
  if (!stories || !world) return <p className="muted pad">Growing the world…</p>;
  if (stories.length === 0) {
    return (
      <div className="pad">
        <h2>Story world</h2>
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
        <h2>Story world</h2>
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
          — foundations at the bottom, dependents fan upward. Every story grows one tree on
          its island; its capabilities garden around it. Click an island for the capability DAG.
        </span>
      </div>

      <div className="tree-layout">
        <div className="world-frame">
          <div
            className="world-scroll"
            ref={frameRef}
            tabIndex={0}
            aria-label="story world map (scrollable)"
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection(); // gutters beside the capped scene
            }}
          >
          <svg
            ref={svgRef}
            className="world-scene"
            viewBox={`0 0 ${world.width} ${world.height}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            <defs>
              <marker
                id="trail-arrow"
                viewBox="0 0 10 10"
                refX="7.5"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 8 5 L 0 8.8 z" fill="context-stroke" />
              </marker>
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

              {/* claimed land, back-to-front so extrusions layer */}
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

              {/* roads between dependent territories */}
              {world.edges.map((e) => (
                <g key={`${e.from}->${e.to}`} className={roadClass(e)}>
                  <title>
                    {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                  </title>
                  <path className="world-trail-bed" d={e.d} />
                  <path className="world-trail-line" d={e.d} markerEnd="url(#trail-arrow)" />
                </g>
              ))}

              {/* territory borders (focus-aware) */}
              {world.territories.map((t) => (
                <g key={t.story.id} className={`hex-border ${territoryClass(t.story)}`}>
                  {t.boundary.map((s, i) => (
                    <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
                  ))}
                </g>
              ))}

              {/* trees, decoration, nameplates, wisps — per territory */}
              {world.territories.map((t) => (
                <TerritoryFlora
                  key={t.story.id}
                  territory={t}
                  className={territoryClass(t.story)}
                  hidden={hidden}
                  // Wisps orbit for fresh/stale only (ADR-0041) — the band is the
                  // client-recomputed one, so a session crossing 4 h vanishes on
                  // the reband tick, not at the next fetch. Parked sessions stay
                  // reachable in the dock and the story panel.
                  sessions={(sessionsByStory.get(t.story.id) ?? []).filter((s) =>
                    isOrbitingBand(s.band),
                  )}
                  now={now}
                  selectedSessionId={sessionDock?.kind === 'detail' ? sessionDock.id : null}
                  onHover={(on) => setHoverStory(on ? t.story.id : null)}
                  onSelect={(capId) => selectStory(t.story.id, capId)}
                  onSelectSession={(id) => setSessionDock({ kind: 'detail', id })}
                />
              ))}
            </g>
          </svg>
          </div>
          <WorldLegend
            stories={stories}
            sessions={sessions}
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
  sessions,
  now,
  selectedSessionId,
  onHover,
  onSelect,
  onSelectSession,
}: {
  territory: Territory;
  className: string;
  hidden: ReadonlySet<string>;
  sessions: TreeSession[];
  now: Date;
  selectedSessionId: string | null;
  onHover: (on: boolean) => void;
  onSelect: (capId: string | null) => void;
  onSelectSession: (sessionId: string) => void;
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

      <g transform={`translate(${t.centroid.x} ${t.centroid.y})`}>
        {sessions.map((s) => {
          // Orbit phase is a pure function of the session's identity — NEVER of
          // the array index or length, or every poll-driven set change would
          // make the surviving wisps jump orbit mid-flight.
          const phase = rand01(hash(s.sessionId)) * 360;
          const isSelected = s.sessionId === selectedSessionId;
          return (
            <g
              key={s.sessionId}
              className={`world-wisp band-${s.band satisfies Band}${isSelected ? ' is-selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation(); // the territory click would select the story instead
                onSelectSession(s.sessionId);
              }}
            >
              <title>{`${s.sessionId} [${s.band}] ${formatAge(s.lastSeenAt, now)} — ${s.workingOn}`}</title>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${phase} 0 0`}
                to={`${phase + 360} 0 0`}
                dur={`${s.band === 'fresh' ? 9 : 16}s`}
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
    </aside>
  );
}
