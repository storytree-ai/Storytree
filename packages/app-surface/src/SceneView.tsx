// SceneView — the studio's thin React MAPPER over the shared scene-graph (ADR-0093,
// strategy C, Unit 2b). It walks the framework-agnostic `SceneNode` tree from
// `@storytree/forest-world` and emits native React `<g>`/`<path>`/`<circle>`/… with
// the STUDIO's own class names + its existing per-node hover/click/focus handlers
// (keyed on the node id) — NOT `innerHTML` + event delegation (the reason the owner
// chose strategy C over B). The geometry + structure are the core's; this file owns
// only the role → studio-class translation and the interactivity.
//
// This IS the map's render now: `readRenderScene` treats everything except an explicit
// `?render=legacy` / `?render=inline` as the scene default, so the old inline render in
// TreeView is the escape hatch, not the canonical path. (The "behind a flag, default off"
// note this replaced was true only for the ADR-0093 rollout.) Visual parity with the
// inline render is operator-attested (ADR-0070), not asserted.

import React from 'react';
import {
  trailFillWidth,
  type BakedPaintNode,
  type SceneKind,
  type SceneNode,
  type SceneStatus,
} from '@storytree/forest-world';
import { resolveSprite, type SpriteStyleSheet } from './sprite-sheet.js';
import {
  collectDefBounds,
  fitSpritePlacement,
  wrapperContentBounds,
  type Bounds,
} from './sprite-sizing.js';
import type { TrailRevealPlan } from './trailReveal.js';
import type { NeighbourHighlightPlan } from './neighbourHighlight.js';
import type { LaneLayout } from './laneLayout.js';
import {
  clampMaskRevealProgress,
  strokeRevealAtProgress,
  type OrganicMaskPath,
  type OrganicMaskRevealRenderState,
} from './organic-mask-reveal.js';

export interface OrganicPoseRenderLayer {
  readonly trackId: string;
  readonly src: string;
  readonly frameIndex: number;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly assetAnchor: { readonly x: number; readonly y: number };
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly scale: number;
  readonly depthSlot: 'hero-tree-organic' | 'ground-plant-organic';
}

export interface NativeIslandGrowthRenderLayer {
  readonly storyId: string;
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly radius: { readonly x: number; readonly y: number };
  readonly progress: number;
}

/** The focus-aware context the walk needs — the studio's per-render interactivity
 *  (the scene itself is focus-agnostic; focus / hover / selection are applied here). */
export interface SceneCtx {
  /** The focus-aware island class (mirrors TreeView's `territoryClass`), by id + folded status. */
  territoryClassById: (id: string, status: SceneStatus) => string;
  /** The ARRIVAL draw-on plan (lib/trailReveal `arrivalGrowPlan`), or null when nothing
   *  is arriving. Trails are ALWAYS drawn now (owner 2026-07-07); a segment growing on an
   *  island arrival wears `is-growing` + its per-segment draw-on mask. Reused type shape;
   *  the plan is now rooted at arriving islands' direct edges, not a clicked focus. */
  reveal: TrailRevealPlan | null;
  /** Statuses the legend has filtered out (a matching tree / plant wears `is-filtered`). */
  hidden: ReadonlySet<string>;
  // NB: no island HOVER handler — hover-driven highlight was removed (owner 2026-07-06,
  // the mousemove recolour was the reported lag). Reveal-on-click was retired too (owner
  // 2026-07-07 — pathways are always drawn); the only focus affordance is the
  // `.is-selected` shore border on the clicked island.
  onSelectStory: (id: string) => void;
  onSelectCap: (storyId: string, capId: string) => void;
  /** Story ids whose islands play the ARRIVAL animation (a story that just appeared in
   *  the tree payload, or the `?arrive=` demo target): their coast/ground/flora form in
   *  stages AND their direct incident trails draw on from the new island (the `reveal`
   *  plan above). Absent/empty ⇒ no arrival classes/masks at all. */
  arrivalIds?: ReadonlySet<string> | null;
  /** The resolved sprite ART STYLE SHEET (sprite-art-sheets spike, default-off `artStyle` world
   *  setting) — PRESENT ⇒ any node whose sprite key {@link resolveSprite} covers renders an `<image>`
   *  instead of recursing into its vector children (see {@link trySprite} below); an uncovered kind
   *  always stays vector, so a sheet may cover only some kinds. `null`/absent (the `vector` default) ⇒
   *  every node renders vector, byte-identical to before this flag existed. */
  spriteSheet?: SpriteStyleSheet | null;
  /** Global sprite size dial (the `artScale` world setting, default 1) — multiplies the DERIVED fit
   *  {@link fitSpritePlacement} computes from the vector body a sprite replaces. Only read when
   *  `spriteSheet` is present. */
  artScale?: number;
  /** The SELECTION highlight plan (ADR-0242, `neighbourHighlightPlan`) — which trail segments sit on
   *  the selected story's OWN one-hop edges. Present ⇒ the trail-fill pass gains a `trail-lit` LANE
   *  drawn over each of those segments, narrower than the road beneath it so a shared trunk still
   *  reads as shared. Null/absent ⇒ no lane at all, byte-identical to before. (The neighbour ISLAND
   *  rings ride `territoryClassById`, which the caller composes from the same plan.) */
  neighbours?: NeighbourHighlightPlan | null;
  /** The laid-out selection lanes (`laneLayout`). PRESENT ⇒ the trail-fill pass draws ONE
   *  lane per route, island to island, in the relation's hue, plus any roundabout islands —
   *  and the per-segment `trail-lit` pass above is skipped entirely. Absent ⇒ the shipped
   *  ADR-0242 per-segment ink lane, byte-identical to before this existed. */
  lanes?: LaneLayout | null;
  /** Which selection motion the lanes carry: `draw` (each route draws on once, the default
   *  the studio ships) or `march` (a looping travelling dash). `none` leaves them still.
   *  Only read when {@link lanes} is present; `prefers-reduced-motion` overrides all three. */
  laneMotion?: 'draw' | 'march' | 'none';
  /** App-native clip growth for one existing SVG island. */
  nativeIslandGrowthLayer?: NativeIslandGrowthRenderLayer | null;
  /** Registered organic pose images planted into the canonical world painter order. */
  organicPoseLayers?: readonly OrganicPoseRenderLayer[] | null;
  /** Registered mature organic art revealed by app-owned SVG masks over retained native land. */
  organicMaskRevealLayer?: OrganicMaskRevealRenderState | null;
  /** INTERNAL (set by `SceneView` itself, never by TreeView): per-scene `baked-def` geometry bounds,
   *  so a `baked-use` hero (the ADR-0227 status trees, the garden cottage/gazebo) sizes from its real
   *  def geometry. Memoized once per scene in the component below. */
  defBounds?: ReadonlyMap<string, Bounds>;
}

/** Role → the studio's base class(es). Composed kinds (status / variant / focus) are
 *  handled in {@link composeClass}; a kind absent here (or mapped to '') renders an
 *  unclassed element (a structural `<g>`, or a child the studio styles via its group). */
const BASE: Partial<Record<SceneKind, string>> = {
  world: '',
  'empties-layer': 'hex-coast',
  'coast-layer': 'hex-coastland',
  'ground-mesh': 'relaxed-land',
  'ground-hex': 'hex-land',
  // the ADR-0169 trail network: cased passes (shadow/casing/fill + under-island ghosts)
  // + the non-visual per-edge reveal metadata. Per-segment classes compose in
  // composeClass (spur dash, reveal state).
  'trails-layer': 'trail-net',
  'trail-shadow-pass': 'trail-shadow-pass',
  'trail-casing-pass': 'trail-casing-pass',
  'trail-fill-pass': 'trail-fill-pass',
  'trail-ghost-pass': 'trail-ghost-pass',
  'trail-edges': 'trail-edges',
  'trail-edge': 'trail-edge',
  'cave-apron': 'cave-apron',
  'cave-arch': 'cave-arch',
  'cave-rim': 'cave-rim',
  'flora-layer': '',
  'hits-layer': '',
  empty: 'hex-empty',
  'coast-shore': 'coast-fill',
  'cell-wheat': 'relaxed-cell is-wheat',
  'tile-side': 'hex-side',
  'tile-top-wheat': 'hex-top is-wheat',
  shadow: 'flora-shadow',
  trunk: 'story-trunk',
  'crown-lo': 'crown-lo',
  'crown-hi': 'crown-hi',
  bare: 'story-bare',
  litter: 'leaf-litter',
  'sign-blank': 'story-sign sign-blank',
  'sign-pass': 'story-sign sign-witnessed verdict-pass',
  'sign-fail': 'story-sign sign-witnessed verdict-fail',
  'sign-post': '',
  'sign-head': '',
  'flora-hit': 'flora-hit',
  'dead-ground': 'dead-ground',
  'flora-bed': 'flora-bed',
  'flora-dark': 'flora-dark',
  'flora-light': 'flora-light',
  'flora-core': 'flora-core',
  'flora-stem': 'flora-stem',
  'flora-dead-stem': 'flora-dead-stem',
  'flora-dead-head': 'flora-dead-head',
  'flora-dead-twig': 'flora-dead-twig',
  'sapling-trunk': 'sapling-trunk',
  conifer: 'hex-conifer',
  'conifer-snow': 'conifer-snow',
  'bloom-anchor': 'world-bloom-anchor',
  'bloom-ring': 'bloom-ring',
  'bloom-spark': 'bloom-spark',
  wisps: '',
  // `wisp` composes its band from `phaseBand` in composeClass (band-red/green/building, ADR-0048
  // §3 v2); the BASE here is just the role class. (A composeClass case overrides this entry.)
  wisp: 'world-wisp',
  'wisp-hit': 'world-wisp-hit',
  'wisp-glow': 'world-wisp-glow',
  'wisp-dot': 'world-wisp-dot',
  // the story-CLAIM wisp (ADR-0138 §5): a DISTINCT class family from the build wisp — never
  // world-bloom/verdict-pass (the §5 honesty wall). `claim-wisp` composes its colour-state in
  // composeClass (state-authoring/proving/supplementing); the parts reuse fixed classes.
  'claim-wisps': '',
  'claim-wisp': 'world-claim-wisp',
  'claim-wisp-hit': 'world-claim-wisp-hit',
  'claim-wisp-glow': 'world-claim-wisp-glow',
  'claim-wisp-dot': 'world-claim-wisp-dot',
  // the claim-GRADE families (ADR-0200 D7): `hover-wisp*` (an exploring claim at rest beside the
  // tree) and `queue-wisp*` (a waiting claim in the visible line) — DISTINCT class families from both
  // the build wisp AND the orbiting claim wisp, never bloom/verdict (the §5 honesty wall). Each
  // composes its colour-state in composeClass exactly like `claim-wisp`; the parts below reuse fixed
  // classes. `departing-wisp*` (a released claim still fading, its own `departing-wisps` layer) is
  // stationary + colourless (a departure carries no colourState) — composeClass gives it a fixed base
  // class; the mapper folds its `ageRatio` to opacity (never a bloom/verdict class either).
  'hover-wisp': 'world-hover-wisp',
  'hover-wisp-hit': 'world-hover-wisp-hit',
  'hover-wisp-glow': 'world-hover-wisp-glow',
  'hover-wisp-dot': 'world-hover-wisp-dot',
  'queue-wisp': 'world-queue-wisp',
  'queue-wisp-hit': 'world-queue-wisp-hit',
  'queue-wisp-glow': 'world-queue-wisp-glow',
  'queue-wisp-dot': 'world-queue-wisp-dot',
  'departing-wisps': '',
  'departing-wisp': 'world-departing-wisp',
  'departing-wisp-hit': 'world-departing-wisp-hit',
  'departing-wisp-glow': 'world-departing-wisp-glow',
  'departing-wisp-dot': 'world-departing-wisp-dot',
  plate: 'world-plate',
  'plate-bg': 'world-plate-bg',
  'plate-id': 'world-plate-id',
  'plate-sub': 'world-plate-sub',
  hit: 'world-story-hit',
  // the UAT markers (forest-parcels inc 2; tall flowers, grounded-art inc 7): one soft flat flower per
  // criterion scattered around the island (the standing-stones were rejected as noisy/colliding, #832;
  // owner call 2026-07-20). The wrapper kinds (`tall-flower-proven`/`-pending`/`-failing`) compose the
  // shared `.tall-flower-marker` base + their state class in composeClass below. The body child kinds
  // map verbatim; `shadow` reuses the flora-shadow map.
  'tall-flower-stem': 'tall-flower-stem',
  'tall-flower-leaf': 'tall-flower-leaf',
  'tall-flower-petal': 'tall-flower-petal',
  'tall-flower-center': 'tall-flower-center',
  'tall-flower-bud': 'tall-flower-bud',
  'tall-flower-glow': 'tall-flower-glow',
  // the cosy-island GARDEN's flat decorative accents (grounded-art inc 11) — lavender + grass tufts,
  // colour CSS-side like the tall-flower family (ADR-0093 §4). Decorative, no verdict.
  'garden-lavender-stem': 'garden-lavender-stem',
  'garden-lavender-head': 'garden-lavender-head',
  'garden-grass-blade': 'garden-grass-blade',
  // ADR-0218: the fenced baked-art family. `baked-defs` is the definition layer (rendered as
  // `<defs>`, non-rendering — no class); `baked-art` is a placement `<use>` (a stable hook, no colour
  // of its own — the paint is inside the referenced def).
  'baked-defs': '',
  'baked-art': 'baked-art',
};

/**
 * One baked paint node (ADR-0218) as a native SVG element with RESOLVED paint inline. This is the one
 * place the studio mapper stamps `fill`/`stroke` from the scene rather than from a class, because a
 * bake's colour is material × N·L, not a category — the fenced exception. Mirrors the factory's own
 * SVG printer (`render-svg.ts`) element-for-element so a stone on the map and one on a contact sheet
 * cannot drift.
 */
function bakedEl(n: BakedPaintNode, key: React.Key): React.JSX.Element {
  const op = n.opacity !== undefined ? { opacity: n.opacity } : {};
  if (n.el === 'ellipse') {
    return React.createElement('ellipse', { key, cx: n.cx, cy: n.cy, rx: n.rx, ry: n.ry, fill: n.fill, ...op });
  }
  if (n.el === 'polygon') {
    return React.createElement('polygon', {
      key,
      points: n.points,
      fill: n.fill,
      stroke: n.stroke,
      strokeWidth: n.strokeWidth,
      strokeLinejoin: 'round',
      ...op,
    });
  }
  // path: a pierced wall (even-odd, filled) or a split fragment's inherited outline (unfilled,
  // round-capped so a short run does not read as a tick) — the render-svg.ts split.
  if (n.fillRule === 'evenodd') {
    return React.createElement('path', {
      key,
      d: n.d,
      fillRule: 'evenodd',
      fill: n.fill,
      stroke: n.stroke,
      strokeWidth: n.strokeWidth,
      strokeLinejoin: 'round',
      ...op,
    });
  }
  return React.createElement('path', {
    key,
    d: n.d,
    fill: 'none',
    stroke: n.stroke,
    strokeWidth: n.strokeWidth,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    ...op,
  });
}

const fmt = (n: number): string => n.toFixed(1);

function withFilter(base: string, status: SceneStatus | undefined, ctx: SceneCtx): string {
  const s = status ?? 'unknown';
  return `${base} st-${s}${ctx.hidden.has(s) ? ' is-filtered' : ''}`;
}

/** ` arrive-island` on an arriving island's per-island groups (coast / ground / flora /
 *  tiles) — the CSS keyframes stage its formation. */
function arriveIsland(id: string, ctx: SceneCtx): string {
  return ctx.arrivalIds?.has(id) ? ' arrive-island' : '';
}

/** The draw-on suffix for a trail-segment path: trails are ALWAYS drawn now (owner
 *  2026-07-07); a segment growing on an island ARRIVAL wears `is-growing` so its mask
 *  owns the draw-on. Absent an arrival, every trail simply paints. */
function revealClass(node: SceneNode, ctx: SceneCtx): string {
  const seg = node.id ? ctx.reveal?.byId.get(node.id) : undefined;
  return seg ? ' is-growing' : '';
}

/** The full className for a node — the studio's class for the role, plus the folded
 *  status / variant and the focus-aware island/trail classes (mirroring TreeView). */
function composeClass(node: SceneNode, ctx: SceneCtx): string {
  const k = node.kind;
  if (!k) return '';
  const id = node.id ?? '';
  const status = node.status ?? 'unknown';
  switch (k) {
    case 'world':
      // no world-root focus dim any more — trails are always drawn, so there is no
      // click-reveal to settle the rest of the world beneath (owner 2026-07-07).
      return '';
    case 'territory':
      return `hex-flora ${ctx.territoryClassById(id, status)}${arriveIsland(id, ctx)}`;
    case 'coast':
      return `coast-fill-group ${ctx.territoryClassById(id, status)}${arriveIsland(id, ctx)}`;
    case 'ground':
      return `relaxed-tile ${ctx.territoryClassById(id, status)}${arriveIsland(id, ctx)}`;
    case 'tile':
      return `hex-tile ${ctx.territoryClassById(id, status)}${arriveIsland(id, ctx)}`;
    case 'trail-shadow':
    case 'trail-casing':
    case 'trail-ghost':
      return `${k}${revealClass(node, ctx)}`;
    case 'trail-fill':
      // a spur (usage 1) draws a dashed footpath fill; the reveal mask grows it safely
      // (a mask stroke, never a dash-offset on the dashed stroke itself).
      return `trail-fill${node.spur ? ' is-spur' : ''}${revealClass(node, ctx)}`;
    case 'cave':
      // the cave arch wears the island's shadow/side-wall hue family, keyed by the
      // folded island status the core stamped on the group (ADR-0169 §2).
      return `world-cave st-${status}`;
    case 'tree':
      return withFilter('story-tree', node.status, ctx);
    case 'flora':
      return withFilter('garden-flora', node.status, ctx);
    case 'cell': {
      // A parcels-present island (forest-parcels inc 1) now sets a PER-CELL status — each ground cell
      // tinted by its assigned capability — so fold it through as `st-<status>` (ZERO new ground CSS:
      // the existing per-status cell tint carries the colour). A plain (non-parcel) cell carries no
      // status → the class is unchanged `relaxed-cell v-N`.
      const cellBase = `relaxed-cell v-${node.variant ?? 0}`;
      return node.status ? `${cellBase} st-${node.status}` : cellBase;
    }
    case 'tile-top':
      return `hex-top v-${node.variant ?? 0}`;
    case 'conifer-body':
      return `conifer-body c-${node.variant ?? 0}`;
    case 'bloom-crown':
      return `world-bloom bloom-crown verdict-${node.outcome ?? 'pass'}`;
    case 'bloom-plant':
      return `world-bloom bloom-plant verdict-${node.outcome ?? 'pass'}`;
    case 'wisp':
      // ADR-0048 §3 v2: the wisp wears its live red→green band (the core already folded the gate
      // phase → phaseBand). Default to the neutral teal `building` band when none is known. ADR-0138
      // §5: when the work-event also stamped a subagent role, add a `role-<colourState>` tint
      // ALONGSIDE the band (advisory, back-compat — absent → the plain band look, unchanged).
      return `world-wisp band-${node.phaseBand ?? 'building'}${
        node.colourState ? ` role-${node.colourState}` : ''
      }`;
    case 'claim-wisp':
      // ADR-0138 §5: a claim wisp is its OWN class family, coloured by what the orchestrator is doing
      // on the claimed story. NEVER world-bloom / verdict-pass — a claim is not a proof (the honesty
      // wall, asserted in SceneView.test.tsx). `colourState` is always present on a claim wisp.
      // ADR-0212: when a build is live on this story, its red→green band rides the SAME body as a
      // `band-*` class ALONGSIDE the state class — the merged build wisp. The band is a MOTION
      // channel in CSS (never a hue), so it cannot push the body toward the bloom's green.
      return `world-claim-wisp state-${node.colourState ?? 'supplementing'}${
        node.phaseBand ? ` band-${node.phaseBand}` : ''
      }`;
    case 'hover-wisp':
      // ADR-0200 D7: the exploring-grade family — a DISTINCT class from claim-wisp/queue-wisp, same
      // colour-state composition, same honesty wall (never bloom/verdict). Carries no band: window
      // shopping is by definition not building (ADR-0212 folds the band onto the work stage only).
      return `world-hover-wisp state-${node.colourState ?? 'supplementing'}`;
    case 'queue-wisp':
      // ADR-0200 D7: the waiting-grade family — a DISTINCT class from claim-wisp/hover-wisp, same
      // colour-state composition, same honesty wall (never bloom/verdict).
      return `world-queue-wisp state-${node.colourState ?? 'supplementing'}`;
    case 'parcel':
      // forest-parcels inc 1: the transparent per-capability ground group (id=capId, title for hover).
      // It carries the cap's folded status so a group-level rule can key on it; the visible tint lives
      // on the cells inside (also `st-<status>`). Same-named base class + `st-<status>` (frozen vocab).
      return `parcel st-${status}`;
    case 'parcel-flora':
      // one placed flora item: its theme (meadow/woodland/heath → `theme-<t>`) + the cap's status. The
      // colour itself stays CSS-side (a parallel lane owns the parcel colour block) — the mapper only
      // names the class the theme selects.
      return `parcel-flora theme-${node.theme ?? 'meadow'} st-${status}`;
    case 'parcel-blade':
    case 'parcel-shrub':
    case 'parcel-stem':
    case 'parcel-flower':
      // the generic flora marks — same-named class + the `v-<n>` facet suffix (exactly like cells).
      return `${k} v-${node.variant ?? 0}`;
    case 'tall-flower-proven':
    case 'tall-flower-pending':
    case 'tall-flower-failing':
      // forest-parcels inc 2 (tall flowers, grounded-art inc 7): the marker wrapper — the shared
      // `.tall-flower-marker` base (pointer-events: none, the markers are display-only) + its state
      // class, the composite the CSS keys the petal/centre/glow colour off
      // (`.tall-flower-proven .tall-flower-petal`, etc.).
      return `tall-flower-marker ${k}`;
    default: {
      const base = BASE[k] ?? '';
      return node.accent && base ? `${base} flora-dead-accent` : base;
    }
  }
}

/** The studio's per-node handlers (it binds React handlers directly — no delegation):
 *  an island group hovers + selects its story; a plant selects its capability. */
function handlersFor(
  node: SceneNode,
  ctx: SceneCtx,
  storyId: string | undefined,
): Record<string, unknown> {
  switch (node.kind) {
    case 'territory':
    case 'ground':
    case 'tile':
    // The generous per-story hit rect (`hit`) shares the island's hover+select: a click anywhere in
    // a story's region (crown, a gap between crown blobs, the moat margin around the island, or the
    // nameplate) selects it — restoring node-click at the zoomed-out contain fit (ADR #486).
    case 'hit': {
      const id = node.id ?? storyId;
      if (!id) return {};
      return {
        onClick: () => ctx.onSelectStory(id),
      };
    }
    case 'flora': {
      const capId = node.id;
      if (!capId || !storyId) return {};
      return {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          ctx.onSelectCap(storyId, capId);
        },
      };
    }
    default:
      return {};
  }
}

/**
 * Move the core's `hits-layer` (which `buildScene` appends LAST — painted on top, for the website's
 * delegation surface) to just behind the coast/ground/flora — directly after the empty moat. The
 * studio binds per-node React handlers instead, so its generous per-story hit rects must sit at the
 * BACK: there they catch a click on a story's crown / a gap between its crown blobs / the moat margin
 * around its island / its nameplate and SELECT the story (restoring node-click at the zoomed-out
 * `fit:'contain'` framing, #486), while the island tiles and the per-capability plants layered on top
 * still win their own clicks (the tiles re-select the same story; a plant selects its capability).
 */
function hitsLayerToBack(children: readonly SceneNode[]): readonly SceneNode[] {
  const hitsIdx = children.findIndex((c) => c.kind === 'hits-layer');
  if (hitsIdx < 0) return children;
  const out = [...children];
  const [hits] = out.splice(hitsIdx, 1);
  if (hits) out.splice(out.findIndex((c) => c.kind === 'empties-layer') + 1, 0, hits);
  return out;
}

function organicPoseImage(layer: OrganicPoseRenderLayer): React.ReactNode {
  const width = layer.canvas.width * layer.scale;
  const height = layer.canvas.height * layer.scale;
  const x = layer.worldAnchor.x - layer.assetAnchor.x * layer.scale;
  const y = layer.worldAnchor.y - layer.assetAnchor.y * layer.scale;
  return React.createElement('image', {
    key: `__organic-pose-${layer.trackId}`,
    href: layer.src,
    x: fmt(x),
    y: fmt(y),
    width: fmt(width),
    height: fmt(height),
    preserveAspectRatio: 'none',
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    'aria-hidden': true,
    'data-depth-slot': layer.depthSlot,
    'data-organic-track': layer.trackId,
    'data-organic-frame': String(layer.frameIndex),
    'data-world-anchor-x': fmt(layer.worldAnchor.x),
    'data-world-anchor-y': fmt(layer.worldAnchor.y),
  });
}

function maskId(layer: OrganicMaskRevealRenderState, kind: 'native-land' | 'plants' | 'hero-tree'): string {
  return `${layer.id}-${kind}`;
}

function maskPathD(path: OrganicMaskPath): string {
  return path.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${fmt(point.x)} ${fmt(point.y)}`)
    .join(' ');
}

function staggeredReveal(progress: number, stagger: number): number {
  return clampMaskRevealProgress((progress - stagger) / (1 - stagger));
}

/** Definition-only SVG masks. Mature art stays mounted; only these deterministic channels change. */
function organicMaskDefs(layer: OrganicMaskRevealRenderState): React.ReactNode {
  const native = layer.nativeLand;
  const landRx = native.radiusX * native.reveal;
  const landRy = native.radiusY * native.reveal;
  const definitions: React.ReactNode[] = [
    React.createElement(
      'mask',
      {
        key: 'native-land',
        id: maskId(layer, 'native-land'),
        maskUnits: 'userSpaceOnUse',
        x: fmt(native.worldAnchor.x - native.radiusX * 1.4),
        y: fmt(native.worldAnchor.y - native.radiusY * 1.4),
        width: fmt(native.radiusX * 2.8),
        height: fmt(native.radiusY * 2.8),
        'data-mask-reveal-definition': 'native-land',
      },
      React.createElement('rect', {
        x: fmt(native.worldAnchor.x - native.radiusX * 1.4),
        y: fmt(native.worldAnchor.y - native.radiusY * 1.4),
        width: fmt(native.radiusX * 2.8),
        height: fmt(native.radiusY * 2.8),
        fill: 'black',
      }),
      React.createElement('ellipse', {
        cx: fmt(native.worldAnchor.x),
        cy: fmt(native.worldAnchor.y + 12),
        rx: fmt(landRx),
        ry: fmt(landRy),
        fill: 'white',
        'data-mask-part': 'native-land',
      }),
      React.createElement('ellipse', {
        cx: fmt(native.worldAnchor.x - native.radiusX * 0.38),
        cy: fmt(native.worldAnchor.y - native.radiusY * 0.08),
        rx: fmt(landRx * 0.62),
        ry: fmt(landRy * 0.68),
        fill: 'white',
        'data-mask-part': 'native-land-lobe',
      }),
      React.createElement('ellipse', {
        cx: fmt(native.worldAnchor.x + native.radiusX * 0.36),
        cy: fmt(native.worldAnchor.y - native.radiusY * 0.12),
        rx: fmt(landRx * 0.66),
        ry: fmt(landRy * 0.72),
        fill: 'white',
        'data-mask-part': 'native-land-lobe',
      }),
    ),
  ];

  for (const registered of layer.layers) {
    const children: React.ReactNode[] = [
      React.createElement('rect', {
        key: 'black',
        x: 0,
        y: 0,
        width: registered.canvas.width,
        height: registered.canvas.height,
        fill: 'black',
      }),
    ];
    registered.paths.forEach((path, index) => {
      const channel = registered.revealState[path.part];
      const reveal = strokeRevealAtProgress(staggeredReveal(channel, path.stagger));
      children.push(
        React.createElement('path', {
          key: `path-${index}`,
          d: maskPathD(path),
          pathLength: 1,
          fill: 'none',
          stroke: 'white',
          strokeWidth: path.strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeDasharray: reveal.dashArray,
          strokeDashoffset: reveal.dashOffset,
          'data-mask-part': path.part,
        }),
      );
    });
    registered.foliage.forEach((cluster, index) => {
      const reveal = staggeredReveal(registered.revealState.foliage, cluster.stagger);
      children.push(
        React.createElement('ellipse', {
          key: `foliage-${index}`,
          cx: cluster.cx,
          cy: cluster.cy,
          rx: fmt(cluster.rx * reveal),
          ry: fmt(cluster.ry * reveal),
          fill: 'white',
          'data-mask-part': 'foliage',
        }),
      );
    });
    definitions.push(
      React.createElement(
        'mask',
        {
          key: registered.kind,
          id: maskId(layer, registered.kind),
          maskUnits: 'userSpaceOnUse',
          x: 0,
          y: 0,
          width: registered.canvas.width,
          height: registered.canvas.height,
          'data-mask-reveal-definition': registered.kind,
        },
        ...children,
      ),
    );
  }

  return React.createElement('defs', { key: '__organic-mask-reveal-defs' }, ...definitions);
}

function organicMaskImages(layer: OrganicMaskRevealRenderState): readonly React.ReactNode[] {
  return layer.layers.map((registered) =>
    React.createElement(
      'g',
      {
        key: `__organic-mask-${registered.kind}`,
        transform: `translate(${fmt(registered.x)} ${fmt(registered.y)}) scale(${registered.scale})`,
        'data-mask-reveal-layer': registered.kind,
        'data-depth-slot': registered.depthSlot,
        'data-world-socket': registered.worldSocket,
        'data-world-anchor-x': fmt(registered.worldSocketPoint.x),
        'data-world-anchor-y': fmt(registered.worldSocketPoint.y),
        'data-mask-reveal-progress': registered.reveal.toFixed(4),
      },
      React.createElement('image', {
        href: registered.src,
        x: 0,
        y: 0,
        width: registered.canvas.width,
        height: registered.canvas.height,
        preserveAspectRatio: 'none',
        pointerEvents: 'none',
        mask: `url(#${maskId(layer, registered.kind)})`,
        'aria-hidden': true,
      }),
    ),
  );
}

function nativeIslandClipId(layer: NativeIslandGrowthRenderLayer): string {
  return `organic-pose-native-island-${layer.storyId.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
}

function nativeIslandClip(layer: NativeIslandGrowthRenderLayer): React.ReactNode {
  const progress = Math.max(0, Math.min(1, layer.progress));
  return React.createElement(
    'defs',
    { key: '__organic-native-island-defs' },
    React.createElement(
      'clipPath',
      {
        id: nativeIslandClipId(layer),
        clipPathUnits: 'userSpaceOnUse',
      },
      React.createElement('ellipse', {
        cx: fmt(layer.worldAnchor.x),
        cy: fmt(layer.worldAnchor.y),
        rx: fmt(Math.max(0.01, layer.radius.x * progress)),
        ry: fmt(Math.max(0.01, layer.radius.y * progress)),
        'data-native-island-progress': progress.toFixed(4),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// the sprite art-style render mode (sprite-art-sheets spike, default-off)
// ---------------------------------------------------------------------------
//
// Every per-type factory (`buildTree`/`buildPlant`/`buildConifer`/the tall-flower marker/
// `gardenHeroUse`/`vegHeroTreeUse`) returns exactly ONE wrapper node whose own `transform` is its
// ground anchor. `resolveSprite` is a per-node lookup keyed by that wrapper's SEMANTIC kind (+ its
// folded status, when it carries one) — a hit swaps the wrapper for a single `<image>` positioned by
// `spritePlacement`, WITHOUT recursing into the wrapper's vector children (the sprite replaces the
// whole object, ADR sprite-art-sheets design rule 1); a miss falls through to today's vector render
// unchanged, so a sheet covering only SOME kinds still works everywhere else.

const GARDEN_HERO_DEF_PREFIX = 'garden-hero-';
const VEG_TREE_DEF_PREFIX = 'veg-hero-autumn-tree-';

/**
 * The sprite lookup key for a node. Most drawables key by their own `kind` (+ `status`, when folded) —
 * `tree`/`flora`/`conifer`/`tall-flower-proven` etc. A `baked-use` PLACEMENT (ADR-0218: the cottage /
 * gazebo / autumn-tree garden heroes, and the tree-spread's per-status `autumn-tree` colourway,
 * ADR-0227) is different: every such node shares the ONE scene `kind: 'baked-art'`, which cannot itself
 * tell a cottage from a gazebo — so it keys off its `defId` instead, stripping the known
 * `garden-hero-<id>` / `veg-hero-autumn-tree-<status>` def-id prefixes back to a stable manifest kind
 * (+ the folded status, for the tree-spread colourway). Returns `null` for anything with no usable key
 * (a plain structural `<g>`, an unrecognised baked-use def) — the caller's cue to render vector.
 */
function spriteKeyFor(node: SceneNode): { kind: string; status?: SceneStatus } | null {
  if (node.el === 'baked-use') {
    if (node.defId.startsWith(VEG_TREE_DEF_PREFIX)) {
      return { kind: 'autumn-tree', status: node.defId.slice(VEG_TREE_DEF_PREFIX.length) as SceneStatus };
    }
    if (node.defId.startsWith(GARDEN_HERO_DEF_PREFIX)) {
      return { kind: node.defId.slice(GARDEN_HERO_DEF_PREFIX.length) };
    }
    return null;
  }
  if (!node.kind) return null;
  return node.status ? { kind: node.kind, status: node.status } : { kind: node.kind };
}

/**
 * A sprite replaces its whole wrapper's ARTWORK, never the semantic descendants the scene composed
 * onto that wrapper for reasons the sprite sheet knows nothing about — today, the signed-proof bloom
 * (`bloom-anchor` > `bloom-crown`/`bloom-plant`, composed to `.world-bloom` by {@link composeClass})
 * `buildTree`/`buildPlant` splice in as a direct sibling child alongside the trunk/crown geometry a
 * sprite swap discards. Collect those preserved descendants (a shallow per-`g` walk, stopping at the
 * first `bloom-anchor` found along each branch — a bloom never nests a second bloom) so the caller can
 * render them ALONGSIDE the sprite `<image>` instead of silently dropping them.
 */
function collectPreservedDescendants(node: SceneNode, out: SceneNode[]): void {
  if (node.el !== 'g') return;
  for (const child of node.children) {
    if (child.kind === 'bloom-anchor') {
      out.push(child);
    } else {
      collectPreservedDescendants(child, out);
    }
  }
}

/**
 * Render `node` as a sprite `<image>` when `ctx.spriteSheet` covers its key — `null` when there is no
 * sheet, no usable key, or the sheet doesn't cover this node (the caller falls through to vector). The
 * image is positioned by {@link spritePlacement} and carries the wrapper's OWN `transform` untouched
 * (the object's existing ground anchor / scale), so nothing about WHERE the object sits changes — only
 * what draws there. Interactivity (the click handlers + delegation `data-*` hooks a vector `flora` node
 * would carry) is preserved so a sprite-swapped capability plant stays clickable. Text/tooltips/a11y
 * stay in the DOM: a `title` rides along as an accessible `<title>` child of the `<image>`, exactly as
 * the vector path does. Semantic descendants the replaced node owned (the signed-proof bloom) are
 * preserved as vector siblings of the image — see {@link collectPreservedDescendants}; renderer choice
 * may change artwork, it must never erase proof-bloom semantics.
 */
function trySprite(
  node: SceneNode,
  key: React.Key,
  storyId: string | undefined,
  ctx: SceneCtx,
): React.JSX.Element | null {
  const sheet = ctx.spriteSheet;
  if (!sheet) return null;
  const sk = spriteKeyFor(node);
  if (!sk) return null;
  const def = resolveSprite(sheet, sk.kind, sk.status);
  if (!def) return null;
  // DERIVED sizing (owner verdict 2026-07-23 "way too big"): fit the sprite into the content box of
  // the vector body it replaces — sprites inherit the scene's data-driven size semantics (sapling vs
  // hero, per-island veg scale) instead of stamping at the manifest's native box. `artScale` is the
  // world-settings taste dial; an unmeasurable body falls back to the native box.
  const place = fitSpritePlacement(def, wrapperContentBounds(node, ctx.defBounds), ctx.artScale ?? 1);
  const props: Record<string, unknown> = {
    key,
    href: def.href,
    x: fmt(place.x),
    y: fmt(place.y),
    width: fmt(place.width),
    height: fmt(place.height),
    ...handlersFor(node, ctx, storyId),
  };
  if (node.transform) props.transform = node.transform;
  // The sprite replaces the wrapper's pixels, not its semantic DOM identity. Keep the same class hooks
  // the vector wrapper carried (`story-tree`, `baked-art`, etc.) so coordinate hit-testing and downstream
  // interaction tooling still recognise the object after a default sheet is enabled.
  const cls = composeClass(node, ctx);
  if (cls) props.className = cls;
  if (node.kind === 'flora') {
    if (node.id) props['data-cap-id'] = node.id;
    if (storyId) props['data-story-id'] = storyId;
  } else if (storyId) {
    // TreeView's Electron-safe jittered-click path resolves the release coordinate through this stamp.
    // A clean click still bubbles to the enclosing territory handler; both routes must survive the swap.
    props['data-story-id'] = storyId;
  }
  const kids: React.ReactNode[] = [];
  if (node.title) kids.push(React.createElement('title', { key: '__title' }, node.title));
  const image = React.createElement('image', props, ...kids);

  const preserved: SceneNode[] = [];
  collectPreservedDescendants(node, preserved);
  if (preserved.length === 0) return image;
  return React.createElement(
    React.Fragment,
    { key },
    image,
    ...preserved.map((preservedNode, index) =>
      renderNode(preservedNode, `__preserved-${index}`, storyId, ctx),
    ),
  );
}

/** The lit lane is ONE EDGE WIDE — capped at the width of a usage-1 road — and never more
 *  than this fraction of the road it rides, so even a spur keeps a rim. */
const LIT_LANE_CAP = trailFillWidth(1);
const LIT_LANE_FRACTION = 0.8;

/**
 * The lane width for a segment of the given usage. ALWAYS narrower than
 * `trailFillWidth(usage)`, which is what keeps the merge honest — but the interesting half
 * is the CAP: a lane never grows past the width of a single-edge road, so on a trunk it
 * reads as exactly what it is, one edge's worth of traffic inside a road that carries many.
 * Live trunks on the real forest run to ~11 units wide; a constant inset off that leaves a
 * hairline rim and the lane just reads as a recolour, which is what the cap fixes. A
 * usage-1 spur — a road that really is the selection's alone — is lit nearly edge to edge.
 */
export function litLaneWidth(usage: number): number {
  return Math.min(LIT_LANE_CAP, trailFillWidth(usage) * LIT_LANE_FRACTION);
}

/**
 * The ADR-0242 lit-lane overlay for the trail-fill pass: one extra `trail-lit` path per
 * segment the selection's own edges run through, drawn AFTER every fill so the lanes sit
 * on top of the whole road network rather than under a later trunk. A lane inherits the
 * arrival draw-on mask when its segment is growing, so an arriving island's new lit road
 * still draws on rather than snapping in. Empty (no extra nodes at all) when nothing is
 * selected — the pass is then byte-identical to before this existed.
 */
function litLaneNodes(children: readonly SceneNode[], ctx: SceneCtx): React.JSX.Element[] {
  // A laid-out layout supersedes the per-segment pass entirely (see litRouteLanes).
  if (ctx.lanes && ctx.lanes.lanes.length > 0) return litRouteLanes(ctx);
  const plan = ctx.neighbours;
  if (!plan || plan.litSegments.size === 0) return [];
  const lanes: React.JSX.Element[] = [];
  for (const child of children) {
    if (child.el !== 'path' || !child.id || !plan.litSegments.has(child.id)) continue;
    const props: Record<string, unknown> = {
      key: `lit-${child.id}`,
      className: 'trail-lit',
      d: child.d,
      'data-id': child.id,
      strokeWidth: litLaneWidth(child.usage ?? 1),
    };
    if (ctx.reveal?.byId.get(child.id)) props.mask = `url(#trail-m-${child.id})`;
    lanes.push(React.createElement('path', props));
  }
  return lanes;
}

/** World units a lane's draw-on covers per second. Calibrated against the LIVE forest, where
 *  a one-hop route runs roughly 200–3700 units (median ~2500): fast enough that a long haul
 *  still lands inside a second, slow enough that the travel is legible rather than a flash.
 *  Getting this wrong is not cosmetic — a speed tuned for a small map pins every route to
 *  the ceiling clamp, which silently un-does the one-speed property this exists for. */
const LANE_DRAW_SPEED = 3400;
/** Seconds a lane takes to draw on — its own length at a fixed speed, so a short spur really
 *  is quicker than a long haul instead of every route taking the same time. Clamped at both
 *  ends so a stub still registers and the longest route stays brisk. */
export function laneDrawSeconds(length: number): number {
  return Math.max(0.28, Math.min(1.2, 0.15 + length / LANE_DRAW_SPEED));
}

/**
 * The lanes of a laid-out selection: ONE path per route, island to island, plus a roundabout
 * island under each junction the layout named.
 *
 * Why this replaces the per-segment pass rather than extending it: a segment is an artefact
 * of the routing merge and invisible to a reader, so a lane drawn per segment shows its
 * seams — the offset steps sideways at a junction, and a per-segment draw-on appears to
 * start fresh at every one instead of travelling from an island. Both were reported. A route
 * is one path, so it has no seams to show.
 *
 * `.is-drawing` opts each lane into the one-shot growth (its own duration, via a custom
 * property so the CSS owns the curve); the class is absent when the caller wants the quiet
 * resting state, and `prefers-reduced-motion` kills it regardless.
 */
function litRouteLanes(ctx: SceneCtx): React.JSX.Element[] {
  const layout = ctx.lanes;
  if (!layout) return [];
  const out: React.JSX.Element[] = [];
  for (const hub of layout.hubs) {
    out.push(
      React.createElement('circle', {
        key: `hub-${hub.x.toFixed(1)}-${hub.y.toFixed(1)}`,
        className: 'trail-lane-hub',
        cx: hub.x,
        cy: hub.y,
        r: Number((hub.r * 0.45).toFixed(2)),
      }),
    );
  }
  for (const lane of layout.lanes) {
    const props: Record<string, unknown> = {
      key: `lane-${lane.key}`,
      className: `trail-lane dir-${lane.dir}${ctx.laneMotion === 'march' ? ' is-marching' : ''}${
        ctx.laneMotion === 'draw' ? ' is-drawing' : ''
      }`,
      d: lane.d,
      'data-lane': lane.key,
      strokeWidth: lane.width,
    };
    if (ctx.laneMotion === 'draw') {
      // normalise the run so the growth is length-agnostic (no dash PERIOD to outrun a short
      // route), and hand the CSS this lane's own duration so all lanes travel at one speed
      props.pathLength = 1;
      props.style = { ['--lane-draw' as string]: `${laneDrawSeconds(lane.length).toFixed(2)}s` };
    }
    out.push(React.createElement('path', props));
  }
  return out;
}

function renderNode(
  node: SceneNode,
  key: React.Key,
  storyId: string | undefined,
  ctx: SceneCtx,
): React.JSX.Element | null {
  if (ctx.spriteSheet) {
    const sprite = trySprite(node, key, storyId, ctx);
    if (sprite) return sprite;
  }
  // ADR-0218: the fenced baked-art family renders outside the generic path. A `baked-def` becomes the
  // referenced `<g id>` holding the resolved-paint drawables; a `baked-use` becomes a `<use>` of it.
  if (node.el === 'baked-def') {
    return React.createElement('g', { key, id: node.defId }, ...node.nodes.map((n, i) => bakedEl(n, i)));
  }
  if (node.el === 'baked-use') {
    const useProps: Record<string, unknown> = { key, href: `#${node.defId}` };
    if (node.transform) useProps.transform = node.transform;
    const useCls = composeClass(node, ctx);
    if (useCls) useProps.className = useCls;
    return React.createElement('use', useProps);
  }

  const props: Record<string, unknown> = { key, ...handlersFor(node, ctx, storyId) };
  const cls = composeClass(node, ctx);
  if (cls) props.className = cls;
  if (node.transform) props.transform = node.transform;
  if (node.opacity != null) props.opacity = node.opacity;
  if (node.strokeWidth != null) props.strokeWidth = node.strokeWidth;
  const nativeLand = ctx.organicMaskRevealLayer?.nativeLand;
  if (
    nativeLand &&
    node.id === nativeLand.storyId &&
    (node.kind === 'coast' || node.kind === 'ground' || node.kind === 'territory')
  ) {
    props.mask = `url(#${maskId(ctx.organicMaskRevealLayer!, 'native-land')})`;
    props['data-native-land-mask-target'] = nativeLand.storyId;
  }
  const nativeIsland = ctx.nativeIslandGrowthLayer;
  if (
    nativeIsland &&
    (node.kind === 'coast' || node.kind === 'ground') &&
    node.id === nativeIsland.storyId
  ) {
    props.clipPath = `url(#${nativeIslandClipId(nativeIsland)})`;
    props['data-native-island-story'] = nativeIsland.storyId;
    props['data-native-island-progress'] = nativeIsland.progress.toFixed(4);
  }
  // Trail-segment paths (ADR-0169): stamp the reveal hooks into the DOM
  // (data-id/usage/edges/spur) and, when the focus plan names the segment, attach its
  // per-segment growth mask + step the stroke width from the REVEALED edge count (§3
  // multi-reveal width step-up — only the revealed edges are visible, so the width
  // reflects what the reveal shows, not the global usage).
  if (
    node.kind === 'trail-shadow' ||
    node.kind === 'trail-casing' ||
    node.kind === 'trail-fill' ||
    node.kind === 'trail-ghost'
  ) {
    if (node.id) props['data-id'] = node.id;
    if (node.usage != null) props['data-usage'] = node.usage;
    if (node.edges) props['data-edges'] = node.edges;
    if (node.spur) props['data-spur'] = 'true';
    const seg = node.id ? ctx.reveal?.byId.get(node.id) : undefined;
    if (seg) {
      props.mask = `url(#trail-m-${node.id})`;
      const widen =
        node.kind === 'trail-shadow' ? 5 : node.kind === 'trail-casing' ? 2.5 : 0;
      props.strokeWidth = trailFillWidth(seg.revealedUsage) + widen;
    }
  } else if (node.kind === 'trail-edge') {
    // the non-visual per-edge reveal metadata (from/to/ordered segment chain).
    if (node.from) props['data-from'] = node.from;
    if (node.to) props['data-to'] = node.to;
    if (node.segments) props['data-segments'] = node.segments;
  } else if (node.kind === 'cave') {
    if (node.island) props['data-island'] = node.island;
    if (node.edges) props['data-edges'] = node.edges;
  }
  if (
    node.kind === 'flora-hit' ||
    node.kind === 'wisp-hit' ||
    node.kind === 'claim-wisp-hit' ||
    node.kind === 'hover-wisp-hit' ||
    node.kind === 'queue-wisp-hit' ||
    node.kind === 'departing-wisp-hit' ||
    node.kind === 'hit'
  )
    props.fill = 'transparent';
  if (node.kind === 'bloom-anchor') props['aria-hidden'] = 'true';
  // ADR-0200 D7: a departing claim's fade is DATA (ageRatio, the core's job to place; the mapper's job
  // to turn it into opacity — deterministic, testable, never a CSS-only illusion). `1 - ageRatio`: a
  // just-released wisp (ageRatio 0) starts fully visible and fades to transparent as it ages out.
  if (node.kind === 'departing-wisp' && node.ageRatio != null) {
    props.opacity = Number((1 - node.ageRatio).toFixed(2));
  }
  // Stamp ids into the DOM so TreeView can select by COORDINATE hit-test (robust where the bubbled
  // `click` event is not — Electron retargets a captured click; a moved click can target a non-leaf
  // common ancestor). The per-node onClick above still drives the clean case.
  if (node.kind === 'territory' || node.kind === 'ground' || node.kind === 'tile' || node.kind === 'hit') {
    if (node.id) props['data-story-id'] = node.id;
  } else if (node.kind === 'flora') {
    if (node.id) props['data-cap-id'] = node.id;
    if (storyId) props['data-story-id'] = storyId;
  }

  switch (node.el) {
    case 'circle':
      props.cx = fmt(node.cx);
      props.cy = fmt(node.cy);
      props.r = fmt(node.r);
      break;
    case 'ellipse':
      props.cx = fmt(node.cx);
      props.cy = fmt(node.cy);
      props.rx = fmt(node.rx);
      props.ry = fmt(node.ry);
      break;
    case 'rect':
      props.x = fmt(node.x);
      props.y = fmt(node.y);
      props.width = fmt(node.width);
      props.height = fmt(node.height);
      props.rx = fmt(node.rx);
      break;
    case 'path':
      props.d = node.d;
      break;
    case 'polygon':
      props.points = node.points;
      break;
    case 'text':
      props.x = fmt(node.x);
      props.y = fmt(node.y);
      props.textAnchor = node.anchor;
      break;
    case 'g':
      break;
  }

  const kids: React.ReactNode[] = [];
  if (node.title) kids.push(React.createElement('title', { key: '__title' }, node.title));
  // Every orbiting wisp family rotates by its `phase` (geometry, seeded by runId / claim key). Since
  // ADR-0212 that includes `hover-wisp` — window shopping now spins on a small local orbit (which
  // REVERSES ADR-0200 D7's stationary rule on purpose; a future reader finding a spinning hover wisp
  // should land on ADR-0212, not file a bug). The legacy `wisp` kind stays until increment 3.
  //
  // ⚠ The rotate REPLACES the `transform` attribute on the node it animates, which is why the core
  // never puts a rest-spot translate on a rotated node — the hover family's rest spot lives on its
  // PARENT `g` and its orbit radius on a CHILD `g`. Flatten that nesting and the dot sweeps the
  // island centroid instead of its own rest spot.
  //
  // SPEED is the ADR-0212 motion channel: a claim body with a live build band orbits at the build
  // wisp's old 6s (active), an idle-claimed body keeps the calmer 9s, and window shopping drifts
  // slowest of all — so stage and activity read apart in motion as well as position.
  if (
    (node.kind === 'wisp' || node.kind === 'claim-wisp' || node.kind === 'hover-wisp') &&
    node.phase != null
  ) {
    const dur =
      node.kind === 'hover-wisp'
        ? '14s'
        : node.kind === 'claim-wisp'
          ? node.phaseBand
            ? '6s'
            : '9s'
          : '6s';
    kids.push(
      React.createElement('animateTransform', {
        key: '__spin',
        attributeName: 'transform',
        type: 'rotate',
        from: `${fmt(node.phase)} 0 0`,
        to: `${fmt(node.phase + 360)} 0 0`,
        dur,
        repeatCount: 'indefinite',
      }),
    );
  }
  if (node.el === 'g') {
    const childStory = node.kind === 'territory' ? node.id : storyId;
    // At the world root, sink the hit layer to the back so its rects catch clicks without covering
    // the island tiles / plants on top (see hitsLayerToBack).
    const children = node.kind === 'world' ? hitsLayerToBack(node.children) : node.children;
    const rendered: React.ReactNode[] = [];
    if (node.kind === 'world' && ctx.nativeIslandGrowthLayer) {
      rendered.push(nativeIslandClip(ctx.nativeIslandGrowthLayer));
    }
    if (node.kind === 'world' && ctx.organicMaskRevealLayer) {
      rendered.push(organicMaskDefs(ctx.organicMaskRevealLayer));
    }
    children.forEach((c, i) => {
      if (node.kind === 'world' && c.kind === 'trails-layer' && ctx.organicMaskRevealLayer) {
        rendered.push(...organicMaskImages(ctx.organicMaskRevealLayer));
      }
      const el = renderNode(c, i, childStory, ctx);
      if (el) rendered.push(el);
      if (node.kind === 'world' && c.kind === 'trails-layer' && ctx.organicPoseLayers) {
        rendered.push(...ctx.organicPoseLayers.map(organicPoseImage));
      }
    });
    if (node.kind === 'tree' || node.kind === 'flora' || node.kind === 'plate') {
      // Motion-safe inner wrapper (semantic-growth.css `arrive-pop`): `tree`/`flora`/`plate` are
      // the mapper-POSITIONED wrappers above — the `if (node.transform) props.transform =
      // node.transform;` line above already stamped this node's own SVG placement `transform`
      // (its ground/root anchor). A CSS `arrive-pop` sweep must never bind to THIS class directly
      // (the full `transform` shorthand would replace that placement attribute for the sweep's
      // duration): binding the scale sweep to this dedicated INNER `<g class="pop-motion-inner">`
      // instead keeps the outer placement wrapper's transform attribute completely static while
      // the sweep still scales everything the outer wrapper draws. Named WITHOUT "arrive" so it
      // never collides with the unrelated island-arrival `.arrive-island` staging class (a plain
      // `[class*="arrive"]` selector elsewhere must still find zero matches on a steady-state
      // board with no island arriving).
      kids.push(
        React.createElement('g', { key: '__pop-motion-inner', className: 'pop-motion-inner' }, ...rendered),
      );
    } else {
      kids.push(...rendered);
    }
    // ADR-0242: the selection's lit lanes ride on top of the finished fill pass.
    if (node.kind === 'trail-fill-pass') kids.push(...litLaneNodes(children, ctx));
  } else if (node.el === 'text') {
    kids.push(node.text);
  }

  // The baked-art DEFINITION layer is a non-rendering `<defs>` (its children are referenced by
  // `<use>`, ADR-0218); every other node keeps its own element name.
  const elName = node.el === 'g' && node.kind === 'baked-defs' ? 'defs' : node.el;
  return React.createElement(elName, props, ...kids);
}

/**
 * Render a scene tree as React SVG. The root is the core's offset `world` group; the
 * caller supplies the `<svg>` shell + `<defs>` and layers any studio-only chrome
 * (solar spokes, the Shared-Islands panel, building stamps) ON TOP.
 *
 * `React.memo` is LOAD-BEARING (ADR-0069, kept explicitly by ADR-0272 / memory
 * `studio-map-svg-scaling-wall`): a pointermove pans by updating the camera state on the parent, which
 * re-renders TreeView. The scene subtree does not depend on the camera, so as long as the caller hands
 * `scene` and `ctx` STABLE identities across a pan (TreeView memoises both), memo bails out here and the
 * ~O(nodes) React walk is skipped. Keep this wrapped — it is real work and still required.
 *
 * What it is NOT is the pan lag the owner feels. That attribution was carried here for a year and
 * ADR-0272 measured it away: a gesture frame costs 283 ms WITH the React walk against 275 ms for the
 * bare `<g>` attribute write, so this walk is ~3% of the frame. The other ~99.8% is rasterisation —
 * writing `transform` on an SVG `<g>` invalidates the paint artifact for the whole subtree, and an SVG
 * child gets no composited layer, so all ~14k paths re-raster every frame. The remedy is ADR-0272
 * decision 2 (pan rides a compositor-only CSS transform on an HTML wrapper, committed back to the `<g>`
 * on release), not this memo. Skipping this walk is worth its ~3%; do not read it as the fix.
 */
export const SceneView = React.memo(function SceneView({
  scene,
  ctx,
}: {
  scene: SceneNode;
  ctx: SceneCtx;
}): React.JSX.Element {
  // Sprite mode only: precompute every `baked-def`'s geometry bounds once per scene so trySprite can
  // size a `baked-use` hero from its real def (see sprite-sizing.ts). Inert (null) in vector mode.
  const defBounds = React.useMemo(
    () => (ctx.spriteSheet ? collectDefBounds(scene) : null),
    [scene, ctx.spriteSheet],
  );
  const walkCtx = defBounds ? { ...ctx, defBounds } : ctx;
  // The scene root (the `world` group) always renders — only the hit layer is skipped.
  return renderNode(scene, 'scene', undefined, walkCtx) ?? <g />;
});
