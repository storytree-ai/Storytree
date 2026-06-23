// scene.ts — the framework-agnostic SCENE-GRAPH (ADR-0093, strategy C). The
// defining layer of the shared render core: a pure `buildScene(input)` that turns
// the structural per-island drawable data into a tree of typed *drawables* — `g`
// groups + resolved primitive shapes (`path`/`circle`/`ellipse`/`polygon`/`rect`/
// `text`). Both surfaces render FROM this through a thin per-surface mapper (the
// studio → React; the website → SVG strings).
//
// The boundary (ADR-0093 §4): the scene carries RESOLVED GEOMETRY plus an
// app-neutral semantic `kind` / `variant` / ALREADY-FOLDED visual `status`, and
// `data-id`/`data-from`/`data-to` hooks for the delegation surface — but **no app
// class strings, no live data, no React**. Each mapper owns the kind → class(es)
// translation and the behaviour (the studio binds per-node React handlers; the
// website uses `data-id` event delegation). Status arrives folded by the surface
// (the studio's `worldStatus.ts` provenStatus, etc.) — the data→visual-status fold
// never enters the core.
//
// Geometry is replicated FROM the studio's canonical drawables (TreeView.tsx:
// StoryTree / GardenPlant / DecorTree / LandingBloom / IslandGround / the signpost
// / the wisp orbit / the nameplate) — the studio wins where it diverges from the
// website's pure render (the seed of this extraction). Coordinates are formatted to
// one decimal place; the studio's inline JSX mixed raw + toFixed, so the mapper's
// output is VISUALLY identical (sub-pixel), not byte-identical — visual parity is
// operator-attested (ADR-0070), determinism + shape correctness is red-green here.

import { hash, rand01 } from './rng.js';
import {
  type Axial,
  type Pt,
  HEX_R,
  TILE_DEPTH,
  axialKey,
  hexCenter,
  hexPath,
  polyPath,
} from './hex.js';
import { crownRadius } from './sizing.js';
import type { DrawTile, RelaxedCell } from './substrate.js';

// ---------------------------------------------------------------------------
// The scene-graph IR
// ---------------------------------------------------------------------------

/** The visual status a drawable WEARS, already folded by the surface (the proof /
 *  live-data fold stays out of the core — ADR-0093 §4). */
export type SceneStatus =
  | 'healthy'
  | 'mapped'
  | 'proposed'
  | 'building'
  | 'unhealthy'
  | 'unknown';

/**
 * An app-neutral SEMANTIC role for a node — each mapper translates it to its own
 * class(es) (the studio's `story-tree`/`crown-lo`/…, the website's `tw-*`). The
 * core never names an app's classes; it names the ROLE the shape plays.
 */
export type SceneKind =
  // structural layers
  | 'world'
  | 'empties-layer'
  | 'coast-layer'
  | 'ground-mesh'
  | 'ground-hex'
  | 'roads-layer'
  | 'flora-layer'
  | 'hits-layer'
  // coast / ground
  | 'empty'
  | 'coast'
  | 'coast-shore'
  | 'ground'
  | 'cell'
  | 'cell-wheat'
  | 'tile'
  | 'tile-side'
  | 'tile-top'
  | 'tile-top-wheat'
  // roads
  | 'road'
  | 'road-line'
  // a whole island's flora group
  | 'territory'
  // the central story tree
  | 'tree'
  | 'shadow'
  | 'trunk'
  | 'crown-lo'
  | 'crown-hi'
  | 'bare'
  | 'litter'
  // the human-witness signpost
  | 'sign-blank'
  | 'sign-pass'
  | 'sign-fail'
  | 'sign-post'
  | 'sign-head'
  // a capability as garden flora
  | 'flora'
  | 'flora-hit'
  | 'dead-ground'
  | 'flora-bed'
  | 'flora-dark'
  | 'flora-light'
  | 'flora-core'
  | 'flora-stem'
  | 'flora-dead-stem'
  | 'flora-dead-head'
  | 'flora-dead-twig'
  | 'sapling-trunk'
  // conifer decor
  | 'conifer'
  | 'conifer-body'
  | 'conifer-snow'
  // the recently-landed bloom
  | 'bloom-anchor'
  | 'bloom-crown'
  | 'bloom-plant'
  | 'bloom-ring'
  | 'bloom-spark'
  // the in-flight build wisp orbit
  | 'wisps'
  | 'wisp'
  | 'wisp-hit'
  | 'wisp-glow'
  | 'wisp-dot'
  // the nameplate
  | 'plate'
  | 'plate-bg'
  | 'plate-id'
  | 'plate-sub'
  // the delegation hit area (website)
  | 'hit';

/** The fields every drawable may carry — all optional, set only where the node
 *  needs it (so the mapper translates exactly what's present). */
export interface SceneNodeBase {
  /** The semantic role; absent on a structural-only `<g>` or an unclassed child. */
  kind?: SceneKind;
  /** A numeric variant suffix the mapper formats per role (cell `v-N`, conifer `c-N`). */
  variant?: number;
  /** The folded visual status; the mapper appends its `st-<status>` etc. */
  status?: SceneStatus;
  /** `data-id` — the unit this node belongs to (focus / hover / delegation). */
  id?: string;
  /** `data-from` — a road's source story. */
  from?: string;
  /** `data-to` — a road's target story. */
  to?: string;
  /** A `<title>` tooltip child (surface vocabulary, folded in by the surface). */
  title?: string;
  /** A `transform` attribute (already-formatted). */
  transform?: string;
  /** A resolved opacity. */
  opacity?: number;
  /** A resolved `stroke-width` (the dead-flora strokes). */
  strokeWidth?: number;
  /** An additive accent modifier (a node that wears a second semantic class). */
  accent?: boolean;
  /** A bloom's verdict outcome (drives the mapper's `verdict-<outcome>`). */
  outcome?: 'pass' | 'fail';
  /** A wisp's orbit phase in degrees (the mapper drives the rotation from it). */
  phase?: number;
}

export interface SceneG extends SceneNodeBase {
  el: 'g';
  children: SceneNode[];
}
export interface ScenePath extends SceneNodeBase {
  el: 'path';
  d: string;
}
export interface SceneCircle extends SceneNodeBase {
  el: 'circle';
  cx: number;
  cy: number;
  r: number;
}
export interface SceneEllipse extends SceneNodeBase {
  el: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface ScenePolygon extends SceneNodeBase {
  el: 'polygon';
  points: string;
}
export interface SceneRect extends SceneNodeBase {
  el: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}
export interface SceneText extends SceneNodeBase {
  el: 'text';
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

export type SceneNode =
  | SceneG
  | ScenePath
  | SceneCircle
  | SceneEllipse
  | ScenePolygon
  | SceneRect
  | SceneText;

// ---------------------------------------------------------------------------
// The structural INPUT contract (ADR-0093 design fork → option b)
// ---------------------------------------------------------------------------
//
// `buildScene` takes its OWN minimal structural contract — NOT any surface's world
// type — so the core stays a foundational root that depends on nothing (the studio
// adapts its `HexWorld` into this; the website adapts its world). `buildWorld`
// itself stays surface-side: it is entangled with studio CHROME (solar layout,
// building stamps, bookshelf consumers) that must not enter the core, so option (a)
// (move `buildWorld` in) would drag the chrome with it. Option (b) keeps the
// boundary clean — the core owns the LOOK (shapes + hash-derived variants/jitter +
// layout of a drawable), the surface folds its data + chrome into this contract.

/** A `depends_on` road, already routed to a `d` path by the surface's layout. */
export interface SceneRoadInput {
  from: string;
  to: string;
  d: string;
  /** The road tooltip (surface vocabulary). */
  title: string;
}

/** A capability rendered as garden flora — its id (the core derives the variant +
 *  jitter), folded status, position, tooltip, and an already-folded bloom. */
export interface ScenePlantInput {
  id: string;
  status: SceneStatus;
  x: number;
  y: number;
  title: string;
  /** A recently-landed bloom, folded by the surface (verdict.at + now → ageRatio);
   *  omitted when there is nothing to announce or the plant is withered. */
  bloom?: { ageRatio: number; outcome: 'pass' | 'fail' };
}

/** One island's drawable data — geometry the surface computed (centroid / treeSpot
 *  / coast / decor seeds), folded status, and the surface's folded marks (signpost
 *  presence, crown bloom, in-flight wisps) + nameplate box & text. */
export interface SceneTerritoryInput {
  id: string;
  /** The folded visual status (provenStatus); drives every island hue. */
  status: SceneStatus;
  /** Capability count — the core derives crown size + young/withered from it + status. */
  caps: number;
  centroid: Pt;
  radius: number;
  treeSpot: Pt;
  /** The nameplate baseline y (also the delegation hit's bottom). */
  labelY: number;
  coastPaths: string[];
  /** Conifer-clump seeds; the core expands each into 2–3 deterministic conifers. */
  decor: { x: number; y: number; seed: number }[];
  plants: ScenePlantInput[];
  /** The crown tooltip (surface vocabulary). */
  treeTitle: string;
  /** Present only for a human-witness story; `outcome` null = a blank (unsigned) seal. */
  signpost?: { outcome: 'pass' | 'fail' | null };
  /** The crown bloom, folded by the surface; omitted when withered or none. */
  bloom?: { ageRatio: number; outcome: 'pass' | 'fail' };
  /** In-flight build wisps, folded from live builds (the core derives each phase
   *  from the runId — geometry, like the crown jitter). Empty when nothing builds. */
  wisps: { runId: string; title: string }[];
  /** The nameplate box (surface chrome: the studio's `nameplateLayout`, the web's
   *  own sizing) + the text the surface chose. */
  plate: {
    w: number;
    h: number;
    rx: number;
    idY: number;
    subY: number;
    idText: string;
    subText: string;
    title: string;
  };
}

/** The whole scene's structural input. `territories` is in OWNER order — the same
 *  index `relaxedCells[].owner` / `drawTiles[].owner` / `wheatSets[i]` key on. */
export interface SceneInput {
  offset: Pt;
  width: number;
  height: number;
  /** Pale coast tiles (1–2 rings beyond claimed land). */
  empties: Axial[];
  /** Mesh substrate cells; `null` ⇒ the classic extruded-hex ground (`drawTiles`). */
  relaxedCells: RelaxedCell[] | null;
  /** Claimed tiles + owning-territory index (used when `relaxedCells` is null). */
  drawTiles: DrawTile[];
  /** Per-territory wheat key-sets (used when `relaxedCells` is null). */
  wheatSets: ReadonlySet<string>[];
  roads: SceneRoadInput[];
  territories: SceneTerritoryInput[];
}

// ---------------------------------------------------------------------------
// node factories — terse, drop-undefined construction
// ---------------------------------------------------------------------------

const f = (n: number): string => n.toFixed(1);
const EMPTY_KEYS: ReadonlySet<string> = new Set();

function g(children: SceneNode[], a: SceneNodeBase = {}): SceneG {
  return { el: 'g', children, ...a };
}
function path(d: string, a: SceneNodeBase = {}): ScenePath {
  return { el: 'path', d, ...a };
}
function circle(cx: number, cy: number, r: number, a: SceneNodeBase = {}): SceneCircle {
  return { el: 'circle', cx, cy, r, ...a };
}
function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: SceneNodeBase = {},
): SceneEllipse {
  return { el: 'ellipse', cx, cy, rx, ry, ...a };
}
function polygon(points: string, a: SceneNodeBase = {}): ScenePolygon {
  return { el: 'polygon', points, ...a };
}
function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  a: SceneNodeBase = {},
): SceneRect {
  return { el: 'rect', x, y, width, height, rx, ...a };
}
function text(
  x: number,
  y: number,
  content: string,
  anchor: 'start' | 'middle' | 'end',
  a: SceneNodeBase = {},
): SceneText {
  return { el: 'text', x, y, text: content, anchor, ...a };
}

// ---------------------------------------------------------------------------
// the central story tree (StoryTree)
// ---------------------------------------------------------------------------

/** The central story tree — living canopy / withered skeleton / not-yet-full young
 *  form, with the crown blobs deterministically jittered by the story id. Includes
 *  the recently-landed crown bloom and the human-witness signpost as children
 *  (matching the studio's `story-tree` group). */
export function buildTree(t: SceneTerritoryInput): SceneG {
  const st = t.status;
  const caps = t.caps;
  const withered = st === 'unhealthy';
  // `proposed` hasn't earned full growth; a claimed-but-empty story (0 caps) wears
  // the SAME small form (owner 2026-06-21 — the sapling stage folded in).
  const young = !withered && (st === 'proposed' || caps === 0);
  const R = crownRadius(caps) * (young ? 0.62 : 1);
  const cy = -1.65 * R;

  const trunkD =
    `M -3.6 0 C -3.2 ${f(0.3 * cy)}, -2.4 ${f(0.65 * cy)}, -2.2 ${f(cy)} ` +
    `L 2.2 ${f(cy)} C 2.4 ${f(0.65 * cy)}, 3.2 ${f(0.3 * cy)}, 3.6 0 Q 0 2.4 -3.6 0 Z`;

  const children: SceneNode[] = [ellipse(2, 2, R * 0.78, R * 0.2, { kind: 'shadow' })];

  if (withered) {
    const bareBranches = [
      `M 0 ${f(-1.65 * R)} C 2 ${f(-2.07 * R)}, 1 ${f(-2.36 * R)}, ${f(0.21 * R)} ${f(-2.64 * R)}`,
      `M ${f(0.12 * R)} ${f(-2.29 * R)} L ${f(0.32 * R)} ${f(-2.43 * R)}`,
      `M -4 ${f(-1.79 * R)} C -9 ${f(-2.07 * R)}, -8 ${f(-2.25 * R)}, ${f(-0.46 * R)} ${f(-2.43 * R)}`,
      `M ${f(-0.31 * R)} ${f(-2.14 * R)} L ${f(-0.5 * R)} ${f(-2.18 * R)}`,
    ];
    children.push(
      path(trunkD, { kind: 'trunk' }),
      g([circle(0, cy + 0.15 * R, 0.78 * R), circle(-0.62 * R, cy + 0.36 * R, 0.49 * R)], {
        kind: 'crown-lo',
      }),
      g([circle(-0.21 * R, cy - 0.14 * R, 0.32 * R)], { kind: 'crown-hi', opacity: 0.7 }),
      g(
        bareBranches.map((d) => path(d)),
        { kind: 'bare' },
      ),
      ...([
        [-14, -2],
        [-6, 1],
        [8, -1],
        [16, -4],
      ] as const).map(([lx, ly]) => circle(lx, ly, 1.3, { kind: 'litter' })),
    );
  } else {
    const jb = (i: number, bcx: number, bcy: number, br: number): SceneCircle => {
      const k = hash(`${t.id}:crown:${i}`);
      return circle(
        bcx + (rand01(k) - 0.5) * 0.12 * R,
        bcy + (rand01(k + 1) - 0.5) * 0.1 * R,
        br * (0.94 + rand01(k + 2) * 0.12),
      );
    };
    const base = [
      circle(0, cy, R), // the central blob is never jittered
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
    children.push(
      path(trunkD, { kind: 'trunk' }),
      g(base, { kind: 'crown-lo' }),
      g(highlights, { kind: 'crown-hi' }),
    );
  }

  if (t.bloom) children.push(buildBloom(t.id, t.bloom, 0, cy, R * 1.18, 'crown'));
  if (t.signpost) children.push(buildSignpost(t.signpost, R));

  return g(children, {
    kind: 'tree',
    status: st,
    title: t.treeTitle,
    transform: `translate(${f(t.treeSpot.x)} ${f(t.treeSpot.y)})`,
  });
}

/** The human-witness signpost — a dashed-blank seal until the UAT verdict is
 *  signed, a filled seal (echoing the verdict's hue) after. The studio shows the
 *  state via the group class; the post + head shapes are the shared geometry. */
function buildSignpost(s: { outcome: 'pass' | 'fail' | null }, R: number): SceneG {
  const kind: SceneKind =
    s.outcome === null ? 'sign-blank' : s.outcome === 'pass' ? 'sign-pass' : 'sign-fail';
  return g(
    [
      ellipse(0.6, 0.8, 4, 1.6, { kind: 'shadow' }),
      rect(-1.3, -15, 2.6, 15, 1.1, { kind: 'sign-post' }),
      circle(0, -18, 6.5, { kind: 'sign-head' }),
    ],
    { kind, transform: `translate(${f(R * 0.7 + 9)} 0)` },
  );
}

// ---------------------------------------------------------------------------
// the recently-landed bloom (LandingBloom)
// ---------------------------------------------------------------------------

/** A transient, decaying halo + sparkle announcing a signed PASS. The positioning
 *  translate + age-decay opacity sit on the anchor; the animated pulse rides the
 *  inner group (so a CSS scale keyframe can't clobber the translate). Geometry is
 *  seeded by the unit id, so it never jitters between the surface's now-ticks. */
export function buildBloom(
  unitId: string,
  bloom: { ageRatio: number; outcome: 'pass' | 'fail' },
  cx: number,
  cy: number,
  r: number,
  kind: 'crown' | 'plant',
): SceneG {
  const ageOpacity = Number((0.3 + 0.65 * bloom.ageRatio).toFixed(2));
  const n = kind === 'crown' ? 4 : 3;
  const sparks: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand01(hash(`${unitId}:bloom:a${i}`)) * Math.PI * 2;
    const rr = r * (0.78 + rand01(hash(`${unitId}:bloom:r${i}`)) * 0.5);
    const sr = (kind === 'crown' ? 1.5 : 1) * (0.8 + rand01(hash(`${unitId}:bloom:s${i}`)) * 0.5);
    // top-down squash on y, same as the wisp orbit
    sparks.push(circle(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, sr, { kind: 'bloom-spark' }));
  }
  const inner = g([circle(0, 0, r, { kind: 'bloom-ring' }), ...sparks], {
    kind: kind === 'crown' ? 'bloom-crown' : 'bloom-plant',
    outcome: bloom.outcome,
  });
  return g([inner], {
    kind: 'bloom-anchor',
    transform: `translate(${f(cx)} ${f(cy)})`,
    opacity: ageOpacity,
  });
}

// ---------------------------------------------------------------------------
// a capability as garden flora (GardenPlant)
// ---------------------------------------------------------------------------

/** A capability as a flower bed / berry bush / sapling (hash-picked variant),
 *  tinted by its folded status; `unhealthy` withers it to the matching dead
 *  silhouette. */
export function buildPlant(p: ScenePlantInput): SceneG {
  const variant = hash(`${p.id}:variant`) % 3;
  const dead = p.status === 'unhealthy';
  const children: SceneNode[] = [circle(0, 0, 9.5, { kind: 'flora-hit' })];
  if (dead) children.push(ellipse(0, 0.5, 8, 3.2, { kind: 'dead-ground' }));
  children.push(ellipse(1, 1, dead ? 6 : 8, dead ? 2.2 : 2.6, { kind: 'shadow' }));
  children.push(buildPlantBody(dead, variant));
  if (p.bloom) children.push(buildBloom(p.id, p.bloom, 0, -5, 8, 'plant'));
  return g(children, {
    kind: 'flora',
    status: p.status,
    // The capability id — the data hook each mapper keys interactivity on (the studio
    // wires onSelectCap from it; the website uses it as data-id for delegation).
    id: p.id,
    title: p.title,
    transform: `translate(${f(p.x)} ${f(p.y)})`,
  });
}

/** The variant-specific flora body, wrapped in a plain `<g>` (matching the studio's
 *  `body` group). Six silhouettes: dead flower-bed / dead bush / dead sapling, and
 *  the living flower-bed / berry-bush / sapling. */
function buildPlantBody(dead: boolean, variant: number): SceneG {
  if (dead && variant === 0) {
    return g([
      ellipse(0, 0.4, 8.5, 3, { kind: 'flora-bed', opacity: 0.7 }),
      path('M 0.5 0 C 0.6 -6 0.4 -10 2.6 -11.4 C 4.4 -12.4 5.8 -10.8 5.6 -9.2', {
        kind: 'flora-dead-stem',
        strokeWidth: 1.2,
      }),
      circle(5.6, -8.2, 1.7, { kind: 'flora-dead-head', accent: true }),
      path('M -3.5 0 C -4 -5 -4.5 -8.5 -2.5 -10 C -1 -11 0.5 -10 0.8 -8.4', {
        kind: 'flora-dead-stem',
        strokeWidth: 1.1,
      }),
      circle(0.8, -7.6, 1.4, { kind: 'flora-dead-head' }),
      path('M 4.2 0 L 4.8 -5.2 L 7.6 -7.4', { kind: 'flora-dead-stem', strokeWidth: 1.1 }),
      circle(-7, -0.5, 1, { kind: 'litter' }),
      circle(2.5, 1.2, 1, { kind: 'litter' }),
      circle(6.5, 0.2, 1, { kind: 'litter' }),
    ]);
  }
  if (dead && variant === 1) {
    return g([
      path(
        'M 0 0 L -1 -4.5 M -1 -4.5 L -5 -8.5 M -1 -4.5 L 1.5 -9.5 M 1.5 -9.5 L 4.5 -11.5 M 1.5 -9.5 L 0.5 -12.5 M 0 -2.5 L 4 -6',
        { kind: 'flora-dead-twig', strokeWidth: 1.1 },
      ),
      circle(-4.5, -8, 1.1, { kind: 'litter', accent: true }),
      circle(4, -11, 1.1, { kind: 'litter' }),
      circle(-2.5, 0.8, 1, { kind: 'litter' }),
    ]);
  }
  if (dead) {
    return g([
      path('M 0 0 C 0.4 -5 1.5 -9 3.5 -13 M 2 -8.5 L -1.5 -12 M 3 -11 L 6 -13.5', {
        kind: 'flora-dead-twig',
        strokeWidth: 1.4,
      }),
      circle(-3, 0.8, 1, { kind: 'litter' }),
      circle(1.5, 1.4, 1, { kind: 'litter' }),
      circle(5, 0.4, 1, { kind: 'litter', accent: true }),
    ]);
  }
  if (variant === 0) {
    const petals = [0, 1, 2, 3, 4].map((k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      return circle(0.2 + Math.cos(a) * 2.3, -13 + Math.sin(a) * 2.3, 1.5, { kind: 'flora-light' });
    });
    return g([
      ellipse(0, 0.4, 8.5, 3, { kind: 'flora-bed' }),
      path('M -1 0 Q -7 -3 -9 -7 Q -4.5 -5.5 -1 0 Z', { kind: 'flora-dark' }),
      path('M 1.5 0 Q 7.5 -2.5 9 -6 Q 5 -5 1.5 0 Z', { kind: 'flora-dark' }),
      path('M -4 0 C -4.4 -4 -4.8 -7 -5.2 -10', { kind: 'flora-stem' }),
      path('M 0 0 C 0.2 -5 0.3 -9 0.2 -13', { kind: 'flora-stem' }),
      path('M 4 0 C 4.5 -4 5 -6.5 5.6 -9', { kind: 'flora-stem' }),
      circle(-5.2, -10, 2.6, { kind: 'flora-light' }),
      circle(5.6, -9, 2.3, { kind: 'flora-light' }),
      ...petals,
      circle(0.2, -13, 1.3, { kind: 'flora-core' }),
    ]);
  }
  if (variant === 1) {
    return g([
      polygon('0,-12.5 5.5,-10.5 8.5,-5.5 7,-1 0,0.8 -7,-1 -8.5,-5.5 -5.5,-10.5', {
        kind: 'flora-dark',
      }),
      polygon('-1,-12.5 4.5,-10.8 6,-7 0.5,-5.6 -4.8,-7.4 -4.6,-10.6', { kind: 'flora-light' }),
      circle(-3.5, -4.5, 1.5, { kind: 'flora-core' }),
      circle(2, -7.5, 1.5, { kind: 'flora-core' }),
      circle(4.5, -3.5, 1.4, { kind: 'flora-core' }),
    ]);
  }
  return g([
    path('M -1.2 0 C -1 -4 -0.8 -7 -0.6 -9.5 L 0.9 -9.5 C 1 -7 1.2 -4 1.4 0 Z', {
      kind: 'sapling-trunk',
    }),
    polygon('0,-18.5 5.4,-15.4 6.6,-10.2 3.4,-7.2 -3.4,-7.2 -6.6,-10.2 -5.4,-15.4', {
      kind: 'flora-dark',
    }),
    polygon('-0.6,-18.3 3.8,-15.8 3.4,-12 -1.6,-11.4 -4.4,-14.2', { kind: 'flora-light' }),
  ]);
}

// ---------------------------------------------------------------------------
// conifer decor (DecorTree)
// ---------------------------------------------------------------------------

/** A small leaning conifer with a snow cap — deliberately small so the central
 *  story tree dominates the island. The colour band (`c-N`) comes from the seed. */
export function buildConifer(x: number, y: number, h: number, seed: number): SceneG {
  const lean = (rand01(seed) - 0.5) * 2;
  const w = h * 0.42;
  return g(
    [
      ellipse(1, 1, w * 0.9, 2.4, { kind: 'shadow' }),
      path(`M ${f(lean)} ${f(-h)} L ${f(w)} 0 L ${f(-w)} 0 Z`, {
        kind: 'conifer-body',
        variant: seed % 3,
      }),
      path(
        `M ${f(lean)} ${f(-h)} L ${f(lean + w * 0.45)} ${f(-h * 0.45)} L ${f(lean - w * 0.45)} ${f(-h * 0.45)} Z`,
        { kind: 'conifer-snow' },
      ),
    ],
    { kind: 'conifer', transform: `translate(${f(x)} ${f(y)})` },
  );
}

// ---------------------------------------------------------------------------
// the in-flight build wisps (the harness orbit)
// ---------------------------------------------------------------------------

/** The orbiting build-harness layer: a wisp orbits a story while a leaf agent is
 *  mechanically building one of its units. Live-data driven (the surface folds
 *  which builds are in-flight); the core derives each orbit phase from the runId
 *  and lays the glow/dot/hit at the orbit radius. The mapper drives the rotation
 *  (the studio's SMIL `animateTransform`, the website's CSS) from `phase`. */
function buildWisps(t: SceneTerritoryInput): SceneG | null {
  if (!t.wisps.length) return null;
  const orbitR = t.radius * 0.72 + 10;
  const wisps = t.wisps.map((w) => {
    const phase = rand01(hash(w.runId)) * 360;
    return g(
      [
        g(
          [
            circle(0, 0, 12, { kind: 'wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0)` },
        ),
      ],
      { kind: 'wisp', title: w.title, phase },
    );
  });
  return g(wisps, { kind: 'wisps', transform: `translate(${f(t.centroid.x)} ${f(t.centroid.y)})` });
}

// ---------------------------------------------------------------------------
// the nameplate (world-plate)
// ---------------------------------------------------------------------------

function buildPlate(t: SceneTerritoryInput): SceneG {
  const p = t.plate;
  return g(
    [
      rect(0, 0, p.w, p.h, p.rx, { kind: 'plate-bg' }),
      text(p.w / 2, p.idY, p.idText, 'middle', { kind: 'plate-id' }),
      text(p.w / 2, p.subY, p.subText, 'middle', { kind: 'plate-sub' }),
    ],
    {
      kind: 'plate',
      title: p.title,
      transform: `translate(${f(t.centroid.x - p.w / 2)} ${f(t.labelY)})`,
    },
  );
}

// ---------------------------------------------------------------------------
// a whole island's flora layer (TerritoryFlora)
// ---------------------------------------------------------------------------

/** One island's flora group: conifers (expanded from the decor seeds), capability
 *  plants, and the central tree — all y-sorted so southern art overlaps northern —
 *  then the nameplate and the wisp orbit. */
export function buildTerritoryFlora(t: SceneTerritoryInput): SceneG {
  const drawables: { y: number; node: SceneNode }[] = [];

  for (const d of t.decor) {
    const count = 2 + (d.seed % 2);
    for (let i = 0; i < count; i++) {
      const a = rand01(d.seed + i * 7) * Math.PI * 2;
      const rr = rand01(d.seed + i * 13) * HEX_R * 0.55;
      const x = d.x + Math.cos(a) * rr;
      const y = d.y + Math.sin(a) * rr * 0.8 + 4;
      drawables.push({ y, node: buildConifer(x, y, 7 + rand01(d.seed + i) * 4, d.seed + i) });
    }
  }
  for (const plant of t.plants) drawables.push({ y: plant.y, node: buildPlant(plant) });
  drawables.push({ y: t.treeSpot.y, node: buildTree(t) });
  drawables.sort((a, b) => a.y - b.y);

  const children: SceneNode[] = drawables.map((d) => d.node);
  children.push(buildPlate(t));
  const wisps = buildWisps(t);
  if (wisps) children.push(wisps);

  return g(children, { kind: 'territory', status: t.status, id: t.id });
}

// ---------------------------------------------------------------------------
// the static layers (coast / ground / roads / empties / hits)
// ---------------------------------------------------------------------------

function isG(n: SceneG | null): n is SceneG {
  return n !== null;
}

function buildEmpties(input: SceneInput): SceneG {
  return g(
    input.empties.map((h) => {
      const c = hexCenter(h);
      return path(hexPath(c.x, c.y, HEX_R - 0.6), { kind: 'empty' });
    }),
    { kind: 'empties-layer' },
  );
}

function buildCoast(input: SceneInput): SceneG {
  const groups = input.territories
    .map((t): SceneG | null =>
      t.coastPaths.length
        ? g(
            t.coastPaths.map((d) => path(d, { kind: 'coast-shore' })),
            { kind: 'coast', status: t.status, id: t.id },
          )
        : null,
    )
    .filter(isG);
  return g(groups, { kind: 'coast-layer' });
}

function buildGround(input: SceneInput): SceneG {
  if (input.relaxedCells) {
    const cells = input.relaxedCells;
    const groups = input.territories
      .map((t, owner): SceneG | null => {
        const owned = cells.filter((c) => c.owner === owner);
        if (!owned.length) return null;
        return g(
          owned.map((c) =>
            path(polyPath(c.poly), c.wheat ? { kind: 'cell-wheat' } : { kind: 'cell', variant: c.variant }),
          ),
          { kind: 'ground', status: t.status, id: t.id },
        );
      })
      .filter(isG);
    return g(groups, { kind: 'ground-mesh' });
  }
  // classic extruded-hex ground — each tile is its own group (the studio's hex-land).
  const tiles = input.drawTiles
    .map(({ h, owner }): SceneG | null => {
      const t = input.territories[owner];
      if (!t) return null;
      const c = hexCenter(h);
      const key = axialKey(h);
      const wheat = (input.wheatSets[owner] ?? EMPTY_KEYS).has(key);
      return g(
        [
          path(hexPath(c.x, c.y + TILE_DEPTH, HEX_R), { kind: 'tile-side' }),
          path(
            hexPath(c.x, c.y, HEX_R),
            wheat ? { kind: 'tile-top-wheat' } : { kind: 'tile-top', variant: hash(`tile:${key}`) % 3 },
          ),
        ],
        { kind: 'tile', status: t.status, id: t.id },
      );
    })
    .filter(isG);
  return g(tiles, { kind: 'ground-hex' });
}

function buildRoads(input: SceneInput): SceneG {
  return g(
    input.roads.map((e) =>
      g([path(e.d, { kind: 'road-line' })], { kind: 'road', from: e.from, to: e.to, title: e.title }),
    ),
    { kind: 'roads-layer' },
  );
}

function buildHits(input: SceneInput): SceneG {
  return g(
    input.territories.map((t) => {
      const crownR = crownRadius(t.caps);
      const top = t.treeSpot.y - (2.7 * crownR + 16);
      const hgt = t.labelY + t.plate.h - top;
      return rect(t.centroid.x - t.radius, top, t.radius * 2, hgt, 14, {
        kind: 'hit',
        id: t.id,
        title: t.plate.title,
      });
    }),
    { kind: 'hits-layer' },
  );
}

// ---------------------------------------------------------------------------
// buildScene — the whole drawable tree
// ---------------------------------------------------------------------------

/**
 * The whole forest world as a framework-agnostic drawable tree (ADR-0093). The
 * root is the offset group; its children are the layers in canonical studio order:
 * pale coast, the smoothed coastland, the ground (mesh or hex), the `depends_on`
 * roads, the per-island flora, and the delegation hit areas. Each surface walks
 * this and maps roles → its own classes + behaviour; the surface owns its own
 * `<svg>` shell + `<defs>`, plus any surface-only chrome (the studio's solar
 * spokes / Shared-Islands panel / building stamps; the website's hit delegation)
 * layered on top.
 */
export function buildScene(input: SceneInput): SceneG {
  return g(
    [
      buildEmpties(input),
      buildCoast(input),
      buildGround(input),
      buildRoads(input),
      g(input.territories.map(buildTerritoryFlora), { kind: 'flora-layer' }),
      buildHits(input),
    ],
    { kind: 'world', transform: `translate(${f(input.offset.x)} ${f(input.offset.y)})` },
  );
}
