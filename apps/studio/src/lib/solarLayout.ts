// solarLayout — the pure geometry for the RADIAL "solar-system" #/tree layout
// (ADR-0074 §6 + the live-library proposal `solar-system-world`), built behind the
// default-OFF `?layout=solar` gear control. The wiring hubs (cli/store) sit at the
// centre as a small cluster; every other organism orbits on a concentric ring keyed
// to its dependency rank, so the dependency roads run radially toward the central
// clearing ("roads converging on the hubs", the hub-layout-within-the-forest fork).
//
// Why a standalone, framework-free module (mirrors worldSettings):
//   • Pure number math (no React, no DOM) → unit-testable in the node-env vitest
//     suite (solarLayout.test.ts) — Stage-1 red-green of the layout GEOMETRY
//     (ADR-0070 two-stage proof; the APPEARANCE is owner-attested, never self-signed).
//   • buildWorld consumes `solarSeeds` to seed island positions ONLY in solar mode;
//     the DAG seed block is untouched, so the default world stays byte-identical.
//   • The signal vocabulary (ADR-0062 one-element-per-signal) is preserved upstream —
//     this module changes only WHERE islands sit, never what they encode.

export interface Pt {
  x: number;
  y: number;
}

/** One node to place: a story island or a central wiring hub. */
export interface SolarNode {
  /** Stable id (story id, or a hub id like `cli` / `store`). */
  id: string;
  /** Longest-path dependency rank (0 = foundation). Ignored for hubs. */
  rank: number;
  /** A central wiring hub (cli / store) — placed at the centre, not on a ring. */
  hub: boolean;
  /** Rough island pixel radius (buildWorld's `estRadius`) — sizes ring spacing so
   *  a crowded ring's islands don't collide. */
  radius: number;
}

export interface SolarOpts {
  /** Radius of the small circle the hubs sit on (a single hub lands at the origin). */
  hubRadius: number;
  /** Radius of the innermost orbit (the lowest rank present), clearing the hub cluster. */
  innerRadius: number;
  /** Added radius per ring step outward. */
  ringStep: number;
  /** Minimum arc gap between adjacent islands on a ring (grows a crowded ring outward). */
  ringPad: number;
}

/** The default dials — mirrored by the buildWorld solar branch. */
export const SOLAR_OPTS: SolarOpts = {
  hubRadius: 96,
  innerRadius: 320,
  ringStep: 168,
  ringPad: 52,
};

// ---------- deterministic pseudo-random (self-contained; no Math.random) ----------

/** FNV-1a → uint32. Stable across runs so the layout never reshuffles. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A uint32 seed → [0,1). xorshift, deterministic. */
function rand01(seed: number): number {
  let x = (seed || 1) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 4294967296;
}

/** Round to 2dp for compact, stable SVG path strings. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- the layout ----------

/**
 * Seed every node's island centre, keyed by its index in `nodes` (which is exactly
 * the story-index buildWorld's downstream arrays use). Hubs form a small central
 * cluster; every other node orbits on a concentric ring chosen by its rank. A ring's
 * radius is its rank's base radius, GROWN to fit its members so a crowded ring never
 * collides; members spread evenly by angle with a small deterministic wobble so the
 * ring never reads as a rigid clock-face.
 *
 * Pure + deterministic and ORDER-INDEPENDENT: each id lands in the same place
 * regardless of the input array order (ring members are sorted by id-hash).
 */
export function solarSeeds(nodes: SolarNode[], opts: SolarOpts = SOLAR_OPTS): Map<number, Pt> {
  const out = new Map<number, Pt>();

  // --- hubs: a small central cluster (the "sun"); one hub sits at the origin ---
  const hubs = nodes.map((n, i) => ({ n, i })).filter((e) => e.n.hub);
  hubs.sort((a, b) => idOrder(a.n.id, b.n.id));
  hubs.forEach(({ i }, k) => {
    if (hubs.length <= 1) {
      out.set(i, { x: 0, y: 0 });
      return;
    }
    const a = (2 * Math.PI * k) / hubs.length - Math.PI / 2;
    out.set(i, { x: r2(Math.cos(a) * opts.hubRadius), y: r2(Math.sin(a) * opts.hubRadius) });
  });

  // --- orbits: one ring per distinct rank, innermost = lowest rank present ---
  const byRank = new Map<number, { n: SolarNode; i: number }[]>();
  nodes.forEach((n, i) => {
    if (n.hub) return;
    const list = byRank.get(n.rank);
    if (list) list.push({ n, i });
    else byRank.set(n.rank, [{ n, i }]);
  });
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  ranks.forEach((rank, ringIndex) => {
    const members = byRank.get(rank) ?? [];
    members.sort((a, b) => idOrder(a.n.id, b.n.id));
    const count = members.length;
    const base = opts.innerRadius + ringIndex * opts.ringStep;
    const widest = Math.max(0, ...members.map((m) => m.n.radius));
    // circumference needed to seat `count` islands of width 2·widest + a pad
    const needed = count > 1 ? (count * (2 * widest + opts.ringPad)) / (2 * Math.PI) : 0;
    const radius = Math.max(base, needed);
    // Rotate each ring by a deterministic per-rank offset so single-member rings
    // (a lone rank-N node) don't all stack at the same angle — that would read as a
    // vertical fan instead of a scattered orbit.
    const ringRot = rand01(hash(`solar-ring:${rank}`)) * 2 * Math.PI;
    members.forEach((m, k) => {
      const a0 = count > 0 ? (2 * Math.PI * k) / count : 0;
      const wobble =
        count > 1 ? (rand01(hash(m.n.id)) - 0.5) * ((2 * Math.PI) / count) * 0.34 : 0;
      const a = a0 + ringRot + wobble;
      out.set(m.i, { x: r2(Math.cos(a) * radius), y: r2(Math.sin(a) * radius) });
    });
  });

  return out;
}

/** Stable id ordering: hash first (spreads visually), id string as the tiebreak. */
function idOrder(a: string, b: string): number {
  const d = hash(a) - hash(b);
  if (d !== 0) return d;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One node's wiring declaration: its id + the ids that CONSUME it (ADR-0074 §4). */
export interface SpokeNode {
  id: string;
  /** Provider-side inbound edges: the story ids that import/consume this organism. */
  consumedBy: string[];
}

/**
 * The provider-side wiring edges (ADR-0074 §4) the radial world draws as faint hub
 * SPOKES: for each node, one `consumer → node` edge per entry in its `consumedBy`. This
 * is the REAL cross-package wiring the forest's `depends_on` roads omit (Gap B) — e.g.
 * every organism that declares `consumed_by: [cli]` yields a `cli → organism` spoke, so
 * the dense cli hub is rendered VISIBLE but low-salience, never dropped (§1). The
 * complement of `depends_on`, so a spoke is never also a road. Deterministic, pure.
 */
export function spokeEdges(nodes: SpokeNode[]): { from: string; to: string }[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: { from: string; to: string }[] = [];
  for (const n of nodes) {
    for (const c of n.consumedBy) {
      if (c !== n.id && ids.has(c)) out.push({ from: c, to: n.id });
    }
  }
  return out;
}

/**
 * A faint hub SPOKE path from a central hub to the organism it wires — a gentle cubic
 * bowed perpendicular to the chord so neighbouring spokes don't stack into one hard
 * line. Low-salience by CSS; NEVER dropped (ADR-0074 §1 — density is de-noised, not
 * hidden). Returns an SVG path `d`. Pure.
 */
export function spokePath(from: Pt, to: Pt): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(38, len * 0.12);
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (from.x + to.x) / 2 + nx * bow;
  const cy = (from.y + to.y) / 2 + ny * bow;
  return `M ${r2(from.x)} ${r2(from.y)} Q ${r2(cx)} ${r2(cy)} ${r2(to.x)} ${r2(to.y)}`;
}

// ---------- the solar "circle-grid" refresh (perimeter docking + orbit rings) ----------
//
// The owner's steer (2026-06-20): the solar world's connections all converge on each
// island's CENTRE ("forced to a single point"), and the pathways read messy. The
// website (web/src/lib/world.ts) docks each road at a point on the island PERIMETER in
// the DIRECTION of its neighbour and draws thin, bowed curves with no arrowheads — so a
// hub's many edges fan around its rim instead of piling on one point. We adopt that
// model here, plus a faint concentric ORBIT GRID the islands sit on.

/** An island as an edge endpoint: its centre and the radius to dock an edge at. */
export interface DockNode {
  x: number;
  y: number;
  /** The dock radius — where an edge meets this island (its rim, usually inset a touch). */
  r: number;
}

/**
 * A thin, no-arrow connection between two islands, docked at each PERIMETER in the
 * direction of the other (NOT centre-to-centre) — the website's road model. A hub's
 * edges therefore leave/arrive at different rim points by bearing, so they fan out
 * instead of converging on one point. `bowFrac` bows the midpoint perpendicular to the
 * chord (0 ⇒ a straight rim-to-rim line, e.g. radial hub spokes); a small fraction
 * gives organism↔organism roads a gentle curve so parallel edges separate. Returns an
 * SVG path `d`. Pure + deterministic.
 */
export function dockedEdgePath(from: DockNode, to: DockNode, bowFrac = 0): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // dock on each rim, in the bearing of the other island
  const sx = from.x + ux * from.r;
  const sy = from.y + uy * from.r;
  const ex = to.x - ux * to.r;
  const ey = to.y - uy * to.r;
  // perpendicular bow at the midpoint (0 ⇒ the control point sits on the chord = straight)
  const bow = bowFrac * len;
  const mx = (sx + ex) / 2 - uy * bow;
  const my = (sy + ey) / 2 + ux * bow;
  return `M ${r2(sx)} ${r2(sy)} Q ${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`;
}

/** One DAG-world dependency edge to render as a thin docked line. */
export interface RoadEdge {
  from: string;
  to: string;
  via: string[];
}

/**
 * The DAG/tree world's `depends_on` roads rendered as the website's thin, no-arrow,
 * PERIMETER-DOCKED curves — the SAME `dockedEdgePath` model the solar world uses,
 * brought onto the default tree layout (owner steer 2026-06-20: "go back to the tree
 * structure, however I like the updated lines"). One line per edge, docked on each
 * island's rim in the bearing of the other; `bowFrac` bows it as in `dockedEdgePath`.
 *
 * An edge whose endpoint id is absent from `dockById` is DROPPED — which is also how a
 * de-connected "building" (e.g. library, the 2026-06-20 follow-on) sheds its roads:
 * simply omit it from `dockById` and every edge touching it disappears. Pure +
 * deterministic (the geometry is `dockedEdgePath`'s; nothing hashed/random here).
 */
export function dockedRoads(
  edges: readonly RoadEdge[],
  dockById: ReadonlyMap<string, DockNode>,
  bowFrac = 0,
): { from: string; to: string; via: string[]; d: string }[] {
  const out: { from: string; to: string; via: string[]; d: string }[] = [];
  for (const e of edges) {
    const a = dockById.get(e.from);
    const b = dockById.get(e.to);
    if (a && b) out.push({ from: e.from, to: e.to, via: e.via, d: dockedEdgePath(a, b, bowFrac) });
  }
  return out;
}

/** One orbit of the circle grid: a dependency rank and the radius the ring is drawn at. */
export interface OrbitRing {
  rank: number;
  radius: number;
}

/**
 * The concentric ORBIT GRID radii, derived from where the islands ACTUALLY landed
 * (centroid distance from the hub centre) rather than the pre-snap seed radii — so each
 * faint ring passes through its rank's islands after the hex snap/grow shifts them. One
 * ring per distinct rank present, at that rank's MEAN island distance, sorted inner →
 * outer. Pass only the orbiting (non-hub) islands; an empty input yields no rings. Pure.
 */
export function orbitRings(items: { rank: number; dist: number }[]): OrbitRing[] {
  const byRank = new Map<number, number[]>();
  for (const it of items) {
    const list = byRank.get(it.rank);
    if (list) list.push(it.dist);
    else byRank.set(it.rank, [it.dist]);
  }
  return [...byRank.entries()]
    .map(([rank, ds]) => ({ rank, radius: r2(ds.reduce((a, b) => a + b, 0) / ds.length) }))
    .sort((a, b) => a.rank - b.rank);
}
