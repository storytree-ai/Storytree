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
import type { SceneKind, SceneNode, SceneStatus } from '@storytree/forest-world';

/** The focus-aware context the walk needs — the studio's per-render interactivity
 *  (the scene itself is focus-agnostic; focus / hover / selection are applied here). */
export interface SceneCtx {
  /** The focus-aware island class (mirrors TreeView's `territoryClass`), by id + folded status. */
  territoryClassById: (id: string, status: SceneStatus) => string;
  /** The focus-aware road class (mirrors TreeView's `roadClass`), by the road's ends. */
  roadClassByEnds: (from: string, to: string) => string;
  /** Statuses the legend has filtered out (a matching tree / plant wears `is-filtered`). */
  hidden: ReadonlySet<string>;
  onHoverStory: (id: string | null) => void;
  onSelectStory: (id: string) => void;
  onSelectCap: (storyId: string, capId: string) => void;
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
  'roads-layer': 'dag-road-net',
  'flora-layer': '',
  'hits-layer': '',
  empty: 'hex-empty',
  'coast-shore': 'coast-fill',
  'cell-wheat': 'relaxed-cell is-wheat',
  'tile-side': 'hex-side',
  'tile-top-wheat': 'hex-top is-wheat',
  'road-line': 'dag-road',
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
  wisp: 'world-wisp band-building',
  'wisp-hit': 'world-wisp-hit',
  'wisp-glow': 'world-wisp-glow',
  'wisp-dot': 'world-wisp-dot',
  plate: 'world-plate',
  'plate-bg': 'world-plate-bg',
  'plate-id': 'world-plate-id',
  'plate-sub': 'world-plate-sub',
  hit: '',
};

const fmt = (n: number): string => n.toFixed(1);

function withFilter(base: string, status: SceneStatus | undefined, ctx: SceneCtx): string {
  const s = status ?? 'unknown';
  return `${base} st-${s}${ctx.hidden.has(s) ? ' is-filtered' : ''}`;
}

/** The full className for a node — the studio's class for the role, plus the folded
 *  status / variant and the focus-aware island/road classes (mirroring TreeView). */
function composeClass(node: SceneNode, ctx: SceneCtx): string {
  const k = node.kind;
  if (!k) return '';
  const id = node.id ?? '';
  const status = node.status ?? 'unknown';
  switch (k) {
    case 'territory':
      return `hex-flora ${ctx.territoryClassById(id, status)}`;
    case 'coast':
      return `coast-fill-group ${ctx.territoryClassById(id, status)}`;
    case 'ground':
      return `relaxed-tile ${ctx.territoryClassById(id, status)}`;
    case 'tile':
      return `hex-tile ${ctx.territoryClassById(id, status)}`;
    case 'road':
      return ctx.roadClassByEnds(node.from ?? '', node.to ?? '');
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
    case 'tile': {
      const id = node.id ?? storyId;
      if (!id) return {};
      return {
        onMouseEnter: () => ctx.onHoverStory(id),
        onMouseLeave: () => ctx.onHoverStory(null),
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

function renderNode(
  node: SceneNode,
  key: React.Key,
  storyId: string | undefined,
  ctx: SceneCtx,
): React.JSX.Element | null {
  // The delegation hit layer is for the website (event delegation); the studio binds
  // per-node React handlers directly, so it never renders the hit rects (they would
  // otherwise paint over the islands and swallow the per-element clicks).
  if (node.kind === 'hits-layer') return null;
  const props: Record<string, unknown> = { key, ...handlersFor(node, ctx, storyId) };
  const cls = composeClass(node, ctx);
  if (cls) props.className = cls;
  if (node.transform) props.transform = node.transform;
  if (node.opacity != null) props.opacity = node.opacity;
  if (node.strokeWidth != null) props.strokeWidth = node.strokeWidth;
  if (node.kind === 'flora-hit' || node.kind === 'wisp-hit') props.fill = 'transparent';
  if (node.kind === 'bloom-anchor') props['aria-hidden'] = 'true';

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
  if (node.kind === 'wisp' && node.phase != null) {
    kids.push(
      React.createElement('animateTransform', {
        key: '__spin',
        attributeName: 'transform',
        type: 'rotate',
        from: `${fmt(node.phase)} 0 0`,
        to: `${fmt(node.phase + 360)} 0 0`,
        dur: '6s',
        repeatCount: 'indefinite',
      }),
    );
  }
  if (node.el === 'g') {
    const childStory = node.kind === 'territory' ? node.id : storyId;
    node.children.forEach((c, i) => {
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
