// TreeView — the story world (#/tree).
//
// An RTS-style top-down map: every story is a tree seen from above, standing on
// a shared field. The canopy GROWS with the story (radius scales with its
// capability count) and its capabilities show as fruit dotted around the trunk,
// colored by status — a story visibly ripens as its capabilities turn healthy.
// Story-level `depends_on` renders as ground trails between trees (plus any
// capability dependency that crosses a story boundary), so many-to-many story
// dependencies read at a glance; hovering a tree lights its upstream chain
// (gold) and downstream dependents (red) — the focus interaction carried over
// from V1's visualisations/storytree. Clicking a tree opens the side panel
// with the story's capability sub-DAG (dagre layout, status-strip cards).
//
// Data is /api/tree — offline, straight from stories/ frontmatter. All the
// "randomness" (canopy blobs, jitter, trail bows) is hashed from ids so the
// world renders identically every time.

import { useEffect, useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { api } from '../api';
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

// ---------- world geometry ----------

const FIELD_MIN_W = 960;
const CELL_W = 300;
const CELL_H = 260;
const MARGIN = 70;

/** Canopy radius — the tree grows as the story gains capabilities. */
function canopyRadius(capCount: number): number {
  return 26 + 6.5 * Math.sqrt(Math.max(capCount, 1));
}

interface WorldTree {
  story: TreeStory;
  x: number;
  y: number;
  r: number;
}

interface WorldEdge {
  from: string;
  to: string;
  /** Capability ids whose depends_on crossed the story boundary (derived edges). */
  via: string[];
  d: string;
}

interface World {
  trees: WorldTree[];
  edges: WorldEdge[];
  width: number;
  height: number;
}

/** A curved ground trail from the dependency tree to the dependent tree. */
function trailPath(a: WorldTree, b: WorldTree): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Inset the endpoints just outside each canopy.
  const sx = a.x + ux * (a.r + 8);
  const sy = a.y + uy * (a.r + 8);
  const ex = b.x - ux * (b.r + 12);
  const ey = b.y - uy * (b.r + 12);
  // Bow the trail perpendicular to the line, direction hashed for variety.
  const bow = (rand01(hash(`${a.story.id}->${b.story.id}`)) - 0.5) * 0.5 * dist;
  const mx = (sx + ex) / 2 - uy * bow;
  const my = (sy + ey) / 2 + ux * bow;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function buildWorld(stories: TreeStory[]): World {
  const n = Math.max(stories.length, 1);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  const rows = Math.ceil(n / cols);
  const width = Math.max(FIELD_MIN_W, cols * CELL_W + MARGIN * 2);
  const height = rows * CELL_H + MARGIN * 2;
  const innerW = width - MARGIN * 2;

  const trees: WorldTree[] = stories.map((story, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = hash(story.id);
    // Centre of the cell, jittered — a planted garden, not a chart.
    const jx = (rand01(seed) - 0.5) * CELL_W * 0.4;
    const jy = (rand01(seed + 1) - 0.5) * CELL_H * 0.34;
    // Odd rows shift half a cell for a staggered orchard look.
    const stagger = row % 2 === 1 ? CELL_W / 2 : 0;
    const x = MARGIN + ((col + 0.5) * innerW) / cols + jx + stagger * (innerW / (cols * CELL_W));
    const y = MARGIN + (row + 0.5) * CELL_H + jy;
    return { story, x, y, r: canopyRadius(story.capabilities.length) };
  });

  const byId = new Map(trees.map((t) => [t.story.id, t]));
  const capOwner = new Map<string, string>();
  for (const s of stories) for (const c of s.capabilities) capOwner.set(c.id, s.id);

  // Declared story-level depends_on, plus capability deps that cross a story boundary.
  const edgeMap = new Map<string, { from: string; to: string; via: string[] }>();
  for (const s of stories) {
    for (const dep of s.dependsOn) {
      if (dep !== s.id && byId.has(dep)) edgeMap.set(`${dep}->${s.id}`, { from: dep, to: s.id, via: [] });
    }
    for (const c of s.capabilities) {
      for (const d of c.dependsOn) {
        const owner = capOwner.get(d);
        if (!owner || owner === s.id) continue;
        const key = `${owner}->${s.id}`;
        const cur = edgeMap.get(key) ?? { from: owner, to: s.id, via: [] };
        cur.via.push(`${c.id} → ${d}`);
        edgeMap.set(key, cur);
      }
    }
  }
  const edges: WorldEdge[] = [...edgeMap.values()].flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    return a && b ? [{ ...e, d: trailPath(a, b) }] : [];
  });

  return { trees, edges, width, height };
}

// ---------- focus relations (V1's ancestor/descendant highlighting) ----------

interface Relations {
  ancestors: Set<string>;
  descendants: Set<string>;
}

function relationsFor(nodes: { id: string; dependsOn: string[] }[], focusId: string): Relations {
  const depsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const n of nodes) {
    depsOf.set(n.id, n.dependsOn);
    for (const d of n.dependsOn) {
      const list = dependentsOf.get(d);
      if (list) list.push(n.id);
      else dependentsOf.set(d, [n.id]);
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

// ---------- top-down tree drawing ----------

/** A closed organic blob around (cx, cy) — quadratic-smoothed through jittered spokes. */
function blobPath(cx: number, cy: number, r: number, seed: number, spokes = 9): string {
  const pts: Pt[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + (rand01(seed + i) - 0.5) * 0.4;
    const rr = r * (0.84 + 0.3 * rand01(seed * 31 + i));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return '';
  // Start at the midpoint of the closing segment, then quad through each spoke.
  let d = `M ${((last.x + first.x) / 2).toFixed(1)} ${((last.y + first.y) / 2).toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const nx = pts[(i + 1) % pts.length];
    if (!p || !nx) continue;
    d += ` Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${((p.x + nx.x) / 2).toFixed(1)} ${((p.y + nx.y) / 2).toFixed(1)}`;
  }
  return `${d} Z`;
}

/** Phyllotaxis placement of the i-th of n fruits within radius r (golden angle). */
function fruitPos(i: number, n: number, r: number, seed: number): Pt {
  const golden = 2.39996;
  const a = i * golden + rand01(seed) * Math.PI * 2;
  const rr = 0.66 * r * Math.sqrt((i + 0.62) / Math.max(n, 1));
  return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
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

const STATUS_ORDER: (WorkStatus | 'unknown')[] = [
  'healthy',
  'building',
  'mapped',
  'proposed',
  'unhealthy',
  'retired',
  'unknown',
];

export function TreeView(): React.JSX.Element {
  const [stories, setStories] = useState<TreeStory[] | null>(null);
  const [sessions, setSessions] = useState<TreeSession[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedStory, setSelectedStory] = useState<string | null>(null);
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

  // Which sessions sit at which tree: a session anchors to a story directly (node =
  // story id) or via any capability the story owns. Unanchored sessions still count
  // in the toolbar total — they just have no tree to orbit.
  const sessionsByStory = useMemo(() => {
    const capOwner = new Map<string, string>();
    for (const s of stories ?? []) for (const c of s.capabilities) capOwner.set(c.id, s.id);
    const byStory = new Map<string, TreeSession[]>();
    for (const session of sessions) {
      const storyIds = new Set<string>();
      for (const node of session.nodes) {
        if (stories?.some((s) => s.id === node)) storyIds.add(node);
        const owner = capOwner.get(node);
        if (owner) storyIds.add(owner);
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

  const treeClass = (t: WorldTree): string => {
    const cls = ['world-tree', `st-${t.story.status ?? 'unknown'}`];
    if (t.story.status === 'retired') cls.push('is-ghost');
    if (focusStoryId && storyRelations) {
      if (t.story.id === focusStoryId) cls.push('is-focus');
      else if (storyRelations.ancestors.has(t.story.id)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(t.story.id)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    if (t.story.id === selectedStory) cls.push('is-selected');
    return cls.join(' ');
  };

  const trailClass = (e: WorldEdge): string => {
    const cls = ['world-trail'];
    if (focusStoryId && storyRelations) {
      const anc = (id: string): boolean => id === focusStoryId || storyRelations.ancestors.has(id);
      const desc = (id: string): boolean => id === focusStoryId || storyRelations.descendants.has(id);
      if (storyRelations.ancestors.has(e.from) && anc(e.to)) cls.push('is-ancestor');
      else if (storyRelations.descendants.has(e.to) && desc(e.from)) cls.push('is-descendant');
      else cls.push('is-dim');
    }
    return cls.join(' ');
  };

  return (
    <div className="tree-wrap pad">
      <div className="tree-toolbar">
        <h2>Story world</h2>
        <span className="muted small">
          {stories.length} stories · {capCount} capabilities
          {sessions.length > 0 &&
            ` · ${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}{' '}
          — trees grow as stories gain capabilities; trails are story dependencies. Click a
          tree for its capability DAG.
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
              if (e.target === e.currentTarget) {
                setSelectedStory(null);
                setSelectedCap(null);
              }
            }}
          >
            <defs>
              <radialGradient id="world-field" cx="50%" cy="42%" r="75%">
                <stop offset="0%" stopColor="var(--field-light)" />
                <stop offset="100%" stopColor="var(--field-dark)" />
              </radialGradient>
              <marker
                id="trail-arrow"
                viewBox="0 0 10 10"
                refX="7.5"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
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

            <rect
              className="world-bg"
              x="0"
              y="0"
              width={world.width}
              height={world.height}
              rx="12"
              fill="url(#world-field)"
              onClick={() => {
                setSelectedStory(null);
                setSelectedCap(null);
              }}
            />
            <FieldTexture width={world.width} height={world.height} />

            {world.edges.map((e) => (
              <g key={`${e.from}->${e.to}`} className={trailClass(e)}>
                <title>
                  {`${e.to} depends on ${e.from}${e.via.length ? ` (via ${e.via.join(', ')})` : ''}`}
                </title>
                <path className="world-trail-bed" d={e.d} />
                <path className="world-trail-line" d={e.d} markerEnd="url(#trail-arrow)" />
              </g>
            ))}

            {world.trees.map((t) => (
              <TopDownTree
                key={t.story.id}
                tree={t}
                className={treeClass(t)}
                hidden={hidden}
                sessions={sessionsByStory.get(t.story.id) ?? []}
                onHover={(on) => setHoverStory(on ? t.story.id : null)}
                onSelect={() => {
                  setSelectedCap(null);
                  setSelectedStory((cur) => (cur === t.story.id ? null : t.story.id));
                }}
              />
            ))}
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
            onClose={() => {
              setSelectedStory(null);
              setSelectedCap(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Deterministic grass tufts + light patches so the field isn't a flat fill. */
function FieldTexture({ width, height }: { width: number; height: number }): React.JSX.Element {
  const tufts: Pt[] = [];
  const n = Math.round((width * height) / 26000);
  for (let i = 0; i < n; i++) {
    tufts.push({
      x: 14 + rand01(i * 7 + 1) * (width - 28),
      y: 14 + rand01(i * 7 + 4) * (height - 28),
    });
  }
  return (
    <g className="world-texture">
      {tufts.map((p, i) =>
        i % 4 === 0 ? (
          <ellipse key={i} className="world-patch" cx={p.x} cy={p.y} rx={26} ry={14} />
        ) : (
          <path
            key={i}
            className="world-tuft"
            d={`M ${p.x} ${p.y} l -2 -5 M ${p.x + 3} ${p.y} l 0 -6 M ${p.x + 6} ${p.y} l 2 -5`}
          />
        ),
      )}
    </g>
  );
}

/** Age since lastSeenAt, compact ("12m" / "3h"). */
function formatAge(lastSeenAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

function TopDownTree({
  tree: t,
  className,
  hidden,
  sessions,
  onHover,
  onSelect,
}: {
  tree: WorldTree;
  className: string;
  hidden: ReadonlySet<string>;
  sessions: TreeSession[];
  onHover: (on: boolean) => void;
  onSelect: () => void;
}): React.JSX.Element {
  const story = t.story;
  const seed = hash(story.id);
  const statusKey = story.status ?? 'unknown';
  const caps = story.capabilities;
  const plateW = Math.max(92, story.id.length * 7.2 + 24);

  return (
    <g
      className={className}
      transform={`translate(${t.x.toFixed(1)} ${t.y.toFixed(1)})`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onSelect}
    >
      <title>{story.error ? `${story.id} — ${story.error}` : story.title}</title>

      {/* shadow, status ring, canopy layers */}
      <ellipse className="world-shadow" cx={t.r * 0.18} cy={t.r * 0.22} rx={t.r * 1.04} ry={t.r * 0.9} />
      <circle className={`world-ring st-${statusKey}`} r={t.r + 6} />
      <path className="world-canopy-1" d={blobPath(0, 0, t.r, seed)} />
      <path className="world-canopy-2" d={blobPath(-t.r * 0.12, -t.r * 0.12, t.r * 0.74, seed + 5)} />
      <path className="world-canopy-3" d={blobPath(-t.r * 0.2, -t.r * 0.2, t.r * 0.44, seed + 11)} />

      {/* capability fruits — the story ripens as these turn green */}
      {caps.map((cap, i) => {
        const p = fruitPos(i, caps.length, t.r, seed + 17);
        const st = cap.status ?? 'unknown';
        const verdictNote = cap.verdict ? ` · ${cap.verdict.outcome === 'pass' ? '✓ proven' : '✗ last run failed'}` : '';
        return (
          <g
            key={cap.id}
            className={`world-fruit st-${st}${hidden.has(st) ? ' is-filtered' : ''}`}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
          >
            <title>{`${cap.id} — ${cap.error ? 'spec error' : st}${verdictNote}`}</title>
            {cap.status === 'healthy' &&
              [0, 1, 2, 3, 4].map((k) => (
                <circle
                  key={k}
                  className="world-petal"
                  cx={Math.cos((k / 5) * Math.PI * 2) * 5}
                  cy={Math.sin((k / 5) * Math.PI * 2) * 5}
                  r={2.6}
                />
              ))}
            <circle className="world-fruit-dot" r={4.6} />
            {cap.verdict?.outcome === 'pass' && (
              <path className="world-fruit-glyph" d="M -2.2 0.2 L -0.6 1.9 L 2.4 -1.9" />
            )}
            {cap.verdict?.outcome === 'fail' && (
              <path className="world-fruit-glyph" d="M -2 -2 L 2 2 M 2 -2 L -2 2" />
            )}
          </g>
        );
      })}

      {/* trunk peeking through the canopy centre */}
      <circle className="world-trunk" r={3.4} />

      {/* session wisps — live sessions from the notice board orbit the trees they work on */}
      {sessions.map((s, i) => {
        const phase = (i * 360) / sessions.length + rand01(hash(s.sessionId)) * 90;
        return (
          <g key={s.sessionId} className={`world-wisp band-${s.band}`}>
            <title>{`${s.sessionId} [${s.band}] ${formatAge(s.lastSeenAt)} — ${s.workingOn}`}</title>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`${phase} 0 0`}
              to={`${phase + 360} 0 0`}
              dur={`${s.band === 'fresh' ? 9 : 16}s`}
              repeatCount="indefinite"
            />
            <g transform={`translate(${t.r + 13} 0)`}>
              <circle className="world-wisp-glow" r={6.5} />
              <circle className="world-wisp-dot" r={2.8} />
            </g>
          </g>
        );
      })}

      {/* nameplate */}
      <g className="world-plate" transform={`translate(${-plateW / 2} ${t.r + 12})`}>
        <rect className="world-plate-bg" width={plateW} height={30} rx={7} />
        <text className="world-plate-id" x={plateW / 2} y={13} textAnchor="middle">
          {story.id}
        </text>
        <text className="world-plate-sub" x={plateW / 2} y={25} textAnchor="middle">
          {story.error
            ? 'story spec error'
            : `${statusKey} · ${caps.length} caps${
                story.verdict ? ` · UAT ${story.verdict.outcome === 'pass' ? '✓' : '✗'}` : ''
              }`}
        </text>
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
