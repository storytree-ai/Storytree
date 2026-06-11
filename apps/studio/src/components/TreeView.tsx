// TreeView — the story world (#/tree).
//
// A Dorfromantik-style hex-tile world: every story claims a TERRITORY of
// extruded hexagonal tiles on a shared island board (pale empty hexes fade out
// at the coast). The territory grows with the story — one tile quota per
// capability plus a margin — and every capability is planted as a low-poly
// TREE whose foliage is its status color (proposed reads as autumn orange,
// healthy as deep green with a verdict badge); capless tiles grow decorative
// forest clumps and wheat fields, so a story's land visibly ripens as its
// capabilities move through the gate. Story-level `depends_on` renders as
// roads between territories; hovering a territory lights its upstream chain
// (gold) vs downstream dependents (red) — the focus interaction carried from
// V1's visualisations/storytree. Clicking opens the side panel with the
// story's capability sub-DAG (dagre layout, status-strip cards).
//
// Data is /api/tree — offline, straight from stories/ frontmatter; verdict
// glyphs and presence wisps are advisory layers that appear only when the
// live store answers. All "randomness" (tile growth, tree jitter, road bows)
// is hashed from ids so the world renders identically every time.

import { useEffect, useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { api } from '../api';
import { navigate, treeFocusHref, treeHref } from '../lib/route';
import type { TreeCapability, TreeSession, TreeStory, TreeVerdict, WorkStatus } from '../types';

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

const CELL_W = 360; // seed-spacing in px before snapping to hexes
const CELL_H = 320;
const MARGIN = 60;

interface CapSpot {
  cap: TreeCapability;
  x: number;
  y: number;
}

interface DecorSpot {
  x: number;
  y: number;
  kind: 'forest' | 'wheat';
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

/** A curved road from the dependency territory to the dependent one. */
function roadPath(a: Territory, b: Territory): string {
  const dx = b.centroid.x - a.centroid.x;
  const dy = b.centroid.y - a.centroid.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const sx = a.centroid.x + ux * (a.radius * 0.55);
  const sy = a.centroid.y + uy * (a.radius * 0.55);
  const ex = b.centroid.x - ux * (b.radius * 0.7);
  const ey = b.centroid.y - uy * (b.radius * 0.7);
  const bow = (rand01(hash(`${a.story.id}->${b.story.id}`)) - 0.5) * 0.4 * dist;
  const mx = (sx + ex) / 2 - uy * bow;
  const my = (sy + ey) / 2 + ux * bow;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function buildWorld(stories: TreeStory[]): HexWorld {
  const n = Math.max(stories.length, 1);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));

  // Seed hex per story: jittered cell grid in px, snapped to the hex lattice.
  const seeds: Axial[] = [];
  const taken = new Set<string>();
  stories.forEach((story, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seedH = hash(story.id);
    const stagger = row % 2 === 1 ? CELL_W / 2 : 0;
    const px = {
      x: (col + 0.5) * CELL_W + stagger + (rand01(seedH) - 0.5) * CELL_W * 0.3,
      y: (row + 0.5) * CELL_H + (rand01(seedH + 1) - 0.5) * CELL_H * 0.3,
    };
    let h = pixelToHex(px);
    while (taken.has(axialKey(h))) h = { q: h.q + 1, r: h.r };
    taken.add(axialKey(h));
    seeds.push(h);
  });

  // Grow territories round-robin: each story claims its cheapest frontier hex
  // (closest to seed, hash-jittered for organic coastlines) until its quota —
  // a tile per capability plus breathing room — is met.
  const owner = new Map<string, number>();
  const tilesByStory: Axial[][] = stories.map(() => []);
  const quotas = stories.map((s) => Math.max(3, s.capabilities.length + 2));
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

    // Capabilities land on tiles nearest the seed first, one per tile while
    // they last; leftover tiles grow decoration.
    const ordered = [...tiles].sort(
      (a, b) =>
        hexDist(seed, a) - hexDist(seed, b) ||
        rand01(hash(`${story.id}:${axialKey(a)}`)) - rand01(hash(`${story.id}:${axialKey(b)}`)),
    );
    const caps: CapSpot[] = story.capabilities.map((cap, j) => {
      const tile = ordered[j % Math.max(ordered.length, 1)] ?? seed;
      const c = hexCenter(tile);
      const k = hash(`${story.id}:${cap.id}`);
      const spread = j < ordered.length ? 5 : 11; // jitter more when tiles are shared
      return {
        cap,
        x: c.x + (rand01(k) - 0.5) * spread * 2,
        y: c.y + (rand01(k + 3) - 0.5) * spread + 3,
      };
    });
    const capTileKeys = new Set(
      story.capabilities.map((_, j) => axialKey(ordered[j % Math.max(ordered.length, 1)] ?? seed)),
    );

    const decor: DecorSpot[] = [];
    const wheatTiles = new Set<string>();
    for (const tile of tiles) {
      const key = axialKey(tile);
      if (capTileKeys.has(key)) continue;
      const roll = rand01(hash(`${story.id}:decor:${key}`));
      const c = hexCenter(tile);
      if (roll < 0.5) {
        decor.push({ x: c.x, y: c.y, kind: 'forest', seed: hash(`${key}:f`) });
      } else if (roll < 0.78) {
        wheatTiles.add(key);
        decor.push({ x: c.x, y: c.y, kind: 'wheat', seed: hash(`${key}:w`) });
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
    return { story, tiles, centroid, radius, caps, decor, wheatTiles, boundary, labelY };
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

  // Story-level edges: declared depends_on plus capability deps that cross a story boundary.
  const byId = new Map(territories.map((t, i) => [t.story.id, i]));
  const capOwner = new Map<string, string>();
  for (const s of stories) for (const c of s.capabilities) capOwner.set(c.id, s.id);
  const edgeMap = new Map<string, { from: string; to: string; via: string[] }>();
  for (const s of stories) {
    for (const dep of s.dependsOn) {
      if (dep !== s.id && byId.has(dep)) edgeMap.set(`${dep}->${s.id}`, { from: dep, to: s.id, via: [] });
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
  const edges: WorldEdge[] = [...edgeMap.values()].flatMap((e) => {
    const a = territories[byId.get(e.from) ?? -1];
    const b = territories[byId.get(e.to) ?? -1];
    return a && b ? [{ ...e, d: roadPath(a, b) }] : [];
  });

  // Scene bounds over every tile (claimed + coast), plus label space.
  const allCenters = [...drawTiles.map((t) => hexCenter(t.h)), ...empties.map(hexCenter)];
  const minX = Math.min(...allCenters.map((p) => p.x)) - HEX_W / 2 - MARGIN;
  const maxX = Math.max(...allCenters.map((p) => p.x)) + HEX_W / 2 + MARGIN;
  const minY = Math.min(...allCenters.map((p) => p.y)) - HEX_R - MARGIN;
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

const STATUS_ORDER: (WorkStatus | 'unknown')[] = [
  'healthy',
  'building',
  'mapped',
  'proposed',
  'unhealthy',
  'retired',
  'unknown',
];

/** Age since lastSeenAt, compact ("12m" / "3h"). */
function formatAge(lastSeenAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

export function TreeView({ focus }: { focus: string | null }): React.JSX.Element {
  const [stories, setStories] = useState<TreeStory[] | null>(null);
  const [sessions, setSessions] = useState<TreeSession[]>([]);
  const [loadError, setLoadError] = useState('');
  // Selection lives in the URL (#/tree/<storyId>) so a focused territory is
  // deep-linkable; the route's `focus` IS the selected story.
  const selectedStory = focus;
  const [hoverStory, setHoverStory] = useState<string | null>(null);
  const [selectedCap, setSelectedCap] = useState<string | null>(null);
  const [hoverCap, setHoverCap] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    api
      .tree()
      .then((p) => {
        setStories(p.stories);
        setSessions(p.sessions ?? []);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const world = useMemo(() => (stories ? buildWorld(stories) : null), [stories]);

  const focusStoryId = hoverStory ?? selectedStory;
  const storyRelations = useMemo(
    () => (stories && focusStoryId ? relationsFor(stories, focusStoryId) : null),
    [stories, focusStoryId],
  );

  const sessionsByStory = useMemo(() => {
    const capOwner = new Map<string, string>();
    for (const s of stories ?? []) for (const c of s.capabilities) capOwner.set(c.id, s.id);
    const byStory = new Map<string, TreeSession[]>();
    for (const session of sessions) {
      const storyIds = new Set<string>();
      for (const node of session.nodes) {
        if (stories?.some((s) => s.id === node)) storyIds.add(node);
        const ownerId = capOwner.get(node);
        if (ownerId) storyIds.add(ownerId);
      }
      for (const id of storyIds) {
        const list = byStory.get(id);
        if (list) list.push(session);
        else byStory.set(id, [session]);
      }
    }
    return byStory;
  }, [stories, sessions]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stories ?? []) {
      for (const c of s.capabilities) {
        const key = c.status ?? 'unknown';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [stories]);

  if (loadError) {
    return (
      <div className="pad">
        <h2>Story world</h2>
        <p className="muted">Couldn’t load the tree: {loadError}</p>
      </div>
    );
  }
  if (!stories || !world) return <p className="muted pad">Growing the world…</p>;

  const capCount = stories.reduce((n, s) => n + s.capabilities.length, 0);
  const selected = selectedStory ? stories.find((s) => s.id === selectedStory) : undefined;

  const toggleStatus = (st: string): void => {
    const next = new Set(hidden);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    setHidden(next);
  };

  const territoryClass = (story: TreeStory): string => {
    const cls = ['hex-territory', `st-${story.status ?? 'unknown'}`];
    if (story.status === 'retired') cls.push('is-ghost');
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
          {sessions.length > 0 &&
            ` · ${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}{' '}
          — every story holds a territory; its capabilities grow as trees. Click a territory
          for the capability DAG.
        </span>
        <span className="tree-toolbar-chips">
          {STATUS_ORDER.filter((st) => (statusCounts.get(st) ?? 0) > 0).map((st) => (
            <button
              key={st}
              type="button"
              className={`tree-chip${hidden.has(st) ? ' off' : ''}`}
              onClick={() => toggleStatus(st)}
              title={hidden.has(st) ? `show ${st}` : `fade ${st}`}
            >
              <span className={`tree-dot st-${st}`} />
              {st} {statusCounts.get(st)}
            </button>
          ))}
        </span>
      </div>

      <div className={`tree-layout${selected ? ' has-detail' : ''}`}>
        <div className="world-frame">
          <svg
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
                  sessions={sessionsByStory.get(t.story.id) ?? []}
                  onHover={(on) => setHoverStory(on ? t.story.id : null)}
                  onSelect={(capId) => selectStory(t.story.id, capId)}
                />
              ))}
            </g>
          </svg>
        </div>

        {selected && (
          <StoryPanel
            story={selected}
            sessions={sessionsByStory.get(selected.id) ?? []}
            selectedCap={selectedCap}
            hoverCap={hoverCap}
            hidden={hidden}
            onSelectCap={setSelectedCap}
            onHoverCap={setHoverCap}
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

/** A capability tree: low-poly, foliage colored by status, verdict badge on top. */
function CapTree({
  spot,
  hidden,
  onSelect,
}: {
  spot: CapSpot;
  hidden: ReadonlySet<string>;
  onSelect: () => void;
}): React.JSX.Element {
  const { cap, x, y } = spot;
  const st = cap.status ?? 'unknown';
  const verdictNote = cap.verdict
    ? ` · ${cap.verdict.outcome === 'pass' ? '✓ proven' : '✗ last run failed'}`
    : '';
  return (
    <g
      className={`hex-captree st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <title>{`${cap.id} — ${cap.error ? 'spec error' : st}${verdictNote}`}</title>
      <ellipse className="flora-shadow" cx={1.5} cy={1.5} rx={8} ry={3} />
      <rect className="captree-trunk" x={-1.6} y={-5} width={3.2} height={7} rx={1.4} />
      <path className="captree-lower" d="M 0 -23 L 9 -4 L -9 -4 Z" />
      <path className="captree-upper" d="M 0 -30 L 6.6 -14 L -6.6 -14 Z" />
      {cap.verdict && (
        <g className={`captree-verdict verdict-${cap.verdict.outcome}`} transform="translate(0 -34)">
          <circle r={5} />
          <text textAnchor="middle" y={2.6}>
            {cap.verdict.outcome === 'pass' ? '✓' : '✗'}
          </text>
        </g>
      )}
    </g>
  );
}

function TerritoryFlora({
  territory: t,
  className,
  hidden,
  sessions,
  onHover,
  onSelect,
}: {
  territory: Territory;
  className: string;
  hidden: ReadonlySet<string>;
  sessions: TreeSession[];
  onHover: (on: boolean) => void;
  onSelect: (capId: string | null) => void;
}): React.JSX.Element {
  const story = t.story;
  const statusKey = story.status ?? 'unknown';
  const plateW = Math.max(96, story.id.length * 7.2 + 28);

  // Forest clumps: 3–5 small conifers per forest tile, drawn before cap trees.
  const forests = t.decor.filter((d) => d.kind === 'forest');

  // Draw flora top-down by y so taller southern trees overlap correctly.
  const drawables: { y: number; el: React.JSX.Element }[] = [];
  forests.forEach((f) => {
    const count = 3 + (f.seed % 3);
    for (let i = 0; i < count; i++) {
      const a = rand01(f.seed + i * 7) * Math.PI * 2;
      const rr = rand01(f.seed + i * 13) * HEX_R * 0.55;
      const x = f.x + Math.cos(a) * rr;
      const y = f.y + Math.sin(a) * rr * 0.8 + 4;
      drawables.push({
        y,
        el: (
          <DecorTree key={`f:${f.seed}:${i}`} x={x} y={y} h={9 + rand01(f.seed + i) * 7} seed={f.seed + i} />
        ),
      });
    }
  });
  t.caps.forEach((spot) => {
    drawables.push({
      y: spot.y,
      el: (
        <CapTree
          key={`c:${spot.cap.id}`}
          spot={spot}
          hidden={hidden}
          onSelect={() => onSelect(spot.cap.id)}
        />
      ),
    });
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
            : `${statusKey} · ${story.capabilities.length} caps${
                story.verdict ? ` · UAT ${story.verdict.outcome === 'pass' ? '✓' : '✗'}` : ''
              }`}
        </text>
      </g>

      <g transform={`translate(${t.centroid.x} ${t.centroid.y})`}>
        {sessions.map((s, i) => {
          const phase = (i * 360) / sessions.length + rand01(hash(s.sessionId)) * 90;
          return (
            <g key={s.sessionId} className={`world-wisp band-${s.band satisfies Band}`}>
              <title>{`${s.sessionId} [${s.band}] ${formatAge(s.lastSeenAt)} — ${s.workingOn}`}</title>
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${phase} 0 0`}
                to={`${phase + 360} 0 0`}
                dur={`${s.band === 'fresh' ? 9 : 16}s`}
                repeatCount="indefinite"
              />
              <g transform={`translate(${t.radius * 0.72 + 10} 0)`}>
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
 * One verdict, ADR-0033 d.3 vocabulary: ✓ proven / ✗ last run failed / – never built.
 * "Never built" is also what an OFFLINE session sees — glyphs are advisory and the
 * payload omits them when no live store answered.
 */
function VerdictLine({ verdict }: { verdict: TreeVerdict | undefined }): React.JSX.Element {
  if (!verdict) return <span className="muted">– never built</span>;
  const when = new Date(verdict.at).toLocaleString();
  return verdict.outcome === 'pass' ? (
    <span className="verdict-pass">✓ proven · {when}</span>
  ) : (
    <span className="verdict-fail">✗ last run failed · {when}</span>
  );
}

function StoryPanel({
  story,
  sessions,
  selectedCap,
  hoverCap,
  hidden,
  onSelectCap,
  onHoverCap,
  onClose,
}: {
  story: TreeStory;
  sessions: TreeSession[];
  selectedCap: string | null;
  hoverCap: string | null;
  hidden: ReadonlySet<string>;
  onSelectCap: (id: string | null) => void;
  onHoverCap: (id: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const layout = useMemo(() => layoutSubdag(story), [story]);
  const focusCap = hoverCap ?? selectedCap;
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
    if (c.status === 'retired') cls.push('is-ghost');
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
    <aside className="tree-detail">
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
      </p>
      {story.dependsOn.length > 0 && (
        <p className="small">
          <span className="muted">depends on </span>
          {story.dependsOn.map((d) => (
            <code key={d}>{d} </code>
          ))}
        </p>
      )}

      {sessions.length > 0 && (
        <div className="tree-sessions">
          <h4 className="tree-subdag-title">sessions here ({sessions.length})</h4>
          {sessions.map((s) => (
            <p key={s.sessionId} className="tree-session small">
              <span className={`tree-session-band band-${s.band}`} title={s.band} />
              <code>{s.sessionId}</code>
              <span className="muted"> {formatAge(s.lastSeenAt)} · </span>
              {s.workingOn}
            </p>
          ))}
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
