// SceneView — the studio's thin React MAPPER over the shared scene-graph (ADR-0093,
// strategy C, Unit 2b). It walks the framework-agnostic `SceneNode` tree from
// `@storytree/forest-world` and emits native React `<g>`/`<path>`/`<circle>`/… with
// the STUDIO's own class names + its existing per-node hover/click/focus handlers
// (keyed on the node id) — NOT `innerHTML` + event delegation (the reason the owner
// chose strategy C over B). The geometry + structure are the core's; this file owns
// only the role → studio-class translation and the interactivity.
//
// Behind a flag for now (`?render=scene`, default off) so the canonical inline
// render is untouched — visual parity is operator-attested (ADR-0070), not asserted.

import React from 'react';
import { trailFillWidth, type SceneKind, type SceneNode, type SceneStatus } from '@storytree/forest-world';
import type { TrailRevealPlan } from '../lib/trailReveal.js';

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
  plate: 'world-plate',
  'plate-bg': 'world-plate-bg',
  'plate-id': 'world-plate-id',
  'plate-sub': 'world-plate-sub',
  hit: 'world-story-hit',
};

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
    case 'cell':
      return `relaxed-cell v-${node.variant ?? 0}`;
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
      return `world-claim-wisp state-${node.colourState ?? 'supplementing'}`;
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

function renderNode(
  node: SceneNode,
  key: React.Key,
  storyId: string | undefined,
  ctx: SceneCtx,
): React.JSX.Element | null {
  const props: Record<string, unknown> = { key, ...handlersFor(node, ctx, storyId) };
  const cls = composeClass(node, ctx);
  if (cls) props.className = cls;
  if (node.transform) props.transform = node.transform;
  if (node.opacity != null) props.opacity = node.opacity;
  if (node.strokeWidth != null) props.strokeWidth = node.strokeWidth;
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
    node.kind === 'hit'
  )
    props.fill = 'transparent';
  if (node.kind === 'bloom-anchor') props['aria-hidden'] = 'true';
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
  // Both the build wisp (ADR-0048) and the story-claim wisp (ADR-0138) orbit — the rotation is the
  // node's `phase` (geometry, seeded by runId / claim key). The claim orbits a touch slower so the two
  // layers read as distinct in motion when both are present on one island.
  if ((node.kind === 'wisp' || node.kind === 'claim-wisp') && node.phase != null) {
    kids.push(
      React.createElement('animateTransform', {
        key: '__spin',
        attributeName: 'transform',
        type: 'rotate',
        from: `${fmt(node.phase)} 0 0`,
        to: `${fmt(node.phase + 360)} 0 0`,
        dur: node.kind === 'claim-wisp' ? '9s' : '6s',
        repeatCount: 'indefinite',
      }),
    );
  }
  if (node.el === 'g') {
    const childStory = node.kind === 'territory' ? node.id : storyId;
    // At the world root, sink the hit layer to the back so its rects catch clicks without covering
    // the island tiles / plants on top (see hitsLayerToBack).
    const children = node.kind === 'world' ? hitsLayerToBack(node.children) : node.children;
    children.forEach((c, i) => {
      const el = renderNode(c, i, childStory, ctx);
      if (el) kids.push(el);
    });
  } else if (node.el === 'text') {
    kids.push(node.text);
  }

  return React.createElement(node.el, props, ...kids);
}

/**
 * Render a scene tree as React SVG. The root is the core's offset `world` group; the
 * caller supplies the `<svg>` shell + `<defs>` and layers any studio-only chrome
 * (solar spokes, the Shared-Islands panel, building stamps) ON TOP.
 */
export function SceneView({ scene, ctx }: { scene: SceneNode; ctx: SceneCtx }): React.JSX.Element {
  // The scene root (the `world` group) always renders — only the hit layer is skipped.
  return renderNode(scene, 'scene', undefined, ctx) ?? <g />;
}
