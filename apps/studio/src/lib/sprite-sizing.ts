// sprite-sizing — DERIVED sprite sizing for the sprite art-style render mode (sprite-art-sheets arc).
//
// The first cosy render stamped every sprite at its manifest's native box, which ignored the map's own
// size semantics — the vector factories size every mark from live data (a sapling crown at 0.62×, a
// capability's flora scaled by its tests, the veg hero tree per island), so fixed-size sprites read
// "way too big" (owner verdict 2026-07-23). This module restores size-as-data for sprites: it MEASURES
// the vector body a sprite replaces (the wrapper's own children — or, for an ADR-0218 `baked-use`
// placement, its referenced `baked-def`'s geometry) and FITS the sprite into that content box, so a
// sprite inherits every size rule the scene already encodes. The manifest's `w`/`h` demote to an
// aspect ratio; its optional `scale` stays as a per-asset art fudge; the `artScale` world setting is a
// global taste dial on top (default 1 = match the vector footprint).
//
// Pure and dependency-free like `sprite-sheet.ts` (no React, no DOM) — `SceneView` is the only
// consumer. Measurement is deliberately conservative: only `translate`/`scale` transforms are folded
// (a child carrying any other op is skipped), text is unmeasurable (skipped), and pure hit-targets /
// companion marks that are not part of the object's visual mass (`flora-hit`, blooms, signposts) are
// excluded so a blooming tree does not render a bigger sprite than its neighbour.

import type { BakedPaintNode, SceneBakedDef, SceneNode } from '@storytree/forest-world';
import type { SpriteDef } from './sprite-sheet.js';

/** An axis-aligned box in the wrapper's LOCAL coordinate space (pre-wrapper-transform). */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Marks excluded from a wrapper's visual mass: pure hit-targets, plus companion marks (blooms,
 *  signposts) that ride on a tree but are not the tree — including them would size a blooming tree's
 *  sprite differently from its neighbour's. */
const SKIP_KINDS: ReadonlySet<string> = new Set([
  'flora-hit',
  'hit',
  'bloom-anchor',
  'sign-blank',
  'sign-pass',
  'sign-fail',
]);

/** A simple affine (translate/scale only): p' = (sx·px + tx, sy·py + ty). */
interface SimpleAffine {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const IDENTITY: SimpleAffine = { sx: 1, sy: 1, tx: 0, ty: 0 };

/**
 * Parse a `transform` attribute composed of `translate(…)`/`scale(…)` ops (the only ops the scene
 * factories emit on measured nodes) into one {@link SimpleAffine}. Returns `null` when any other op
 * (`rotate`/`matrix`/`skew…`) appears — the caller skips that node rather than mis-measuring it.
 */
export function parseSimpleTransform(transform: string | undefined): SimpleAffine | null {
  if (!transform || transform.trim() === '') return IDENTITY;
  const acc: SimpleAffine = { ...IDENTITY };
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let matchedLen = 0;
  while ((m = re.exec(transform)) !== null) {
    matchedLen += m[0].length;
    const op = m[1];
    const args = (m[2] ?? '')
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number);
    if (args.some((n) => !Number.isFinite(n))) return null;
    if (op === 'translate') {
      const a = args[0] ?? 0;
      const b = args[1] ?? 0;
      // SVG composes left-to-right: acc ∘ translate — the translate happens INSIDE acc's scale.
      acc.tx += acc.sx * a;
      acc.ty += acc.sy * b;
    } else if (op === 'scale') {
      const a = args[0] ?? 1;
      const b = args[1] ?? a;
      acc.sx *= a;
      acc.sy *= b;
    } else {
      return null; // rotate/matrix/skew — unmeasurable here, skip the node.
    }
  }
  // Anything outside op(...) groups beyond whitespace means we failed to understand the string.
  const stripped = transform.replace(re, '').trim();
  if (stripped !== '' || matchedLen === 0) return null;
  return acc;
}

function applyAffine(b: Bounds, t: SimpleAffine): Bounds {
  const x1 = t.sx * b.minX + t.tx;
  const x2 = t.sx * b.maxX + t.tx;
  const y1 = t.sy * b.minY + t.ty;
  const y2 = t.sy * b.maxY + t.ty;
  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
  };
}

function union(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function pointsBounds(points: string): Bounds | null {
  const nums = points
    .split(/[\s,]+/)
    .filter((s) => s.length > 0)
    .map(Number);
  if (nums.length < 2 || nums.some((n) => !Number.isFinite(n))) return null;
  let out: Bounds | null = null;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i] as number;
    const y = nums[i + 1] as number;
    out = union(out, { minX: x, minY: y, maxX: x, maxY: y });
  }
  return out;
}

/** Per-command coordinate counts for the path scanner (endpoint/control points bound the curve). */
const PARAM_COUNTS: Record<string, number> = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7, H: 1, V: 1, Z: 0 };

/**
 * Bounds of a path `d` via its anchor + control points (the control polygon bounds the curve — a
 * slight over-estimate on deep curves, fine for sizing). Handles absolute AND relative commands for
 * M/L/H/V/C/S/Q/T/Z; arcs contribute their endpoints only. Returns `null` on anything unparseable.
 */
export function pathBounds(d: string): Bounds | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?/gi);
  if (!tokens || tokens.length === 0) return null;
  let out: Bounds | null = null;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let cmd = '';
  const add = (x: number, y: number): void => {
    out = union(out, { minX: x, minY: y, maxX: x, maxY: y });
  };
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        cx = startX;
        cy = startY;
        continue;
      }
    }
    if (cmd === '') return null;
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const count = PARAM_COUNTS[upper];
    if (count === undefined || count === 0) return null;
    const args: number[] = [];
    for (let k = 0; k < count; k++) {
      const v = Number(tokens[i + k]);
      if (!Number.isFinite(v)) return null;
      args.push(v);
    }
    i += count;
    switch (upper) {
      case 'H': {
        cx = rel ? cx + (args[0] as number) : (args[0] as number);
        add(cx, cy);
        break;
      }
      case 'V': {
        cy = rel ? cy + (args[0] as number) : (args[0] as number);
        add(cx, cy);
        break;
      }
      case 'A': {
        // endpoint-only: rx ry rot large sweep x y
        const x = args[5] as number;
        const y = args[6] as number;
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        add(cx, cy);
        break;
      }
      default: {
        // M/L/T/C/S/Q — every (x,y) pair bounds the curve; the LAST pair is the new cursor.
        for (let k = 0; k + 1 < args.length; k += 2) {
          const x = rel ? cx + (args[k] as number) : (args[k] as number);
          const y = rel ? cy + (args[k + 1] as number) : (args[k + 1] as number);
          add(x, y);
          if (k + 2 >= args.length) {
            cx = x;
            cy = y;
          }
        }
        if (upper === 'M') {
          startX = cx;
          startY = cy;
          cmd = rel ? 'l' : 'L'; // subsequent implicit pairs are linetos
        }
        break;
      }
    }
  }
  return out;
}

function bakedPaintBounds(node: BakedPaintNode): Bounds | null {
  switch (node.el) {
    case 'polygon':
      return pointsBounds(node.points);
    case 'path':
      return pathBounds(node.d);
    case 'ellipse':
      return { minX: node.cx - node.rx, maxX: node.cx + node.rx, minY: node.cy - node.ry, maxY: node.cy + node.ry };
  }
}

/** Bounds of one `baked-def`'s geometry (local def coordinates — exactly the space a `<use>` and
 *  therefore a replacing `<image>` renders in). */
export function bakedDefBounds(def: SceneBakedDef): Bounds | null {
  let out: Bounds | null = null;
  for (const n of def.nodes) out = union(out, bakedPaintBounds(n));
  return out;
}

/** Walk a scene for every `baked-def` and precompute its bounds — `SceneView` memoizes this once per
 *  scene and threads it to the sprite branch so a `baked-use` hero (the ADR-0227 status trees, the
 *  garden cottage/gazebo) sizes from its real geometry. */
export function collectDefBounds(root: SceneNode): ReadonlyMap<string, Bounds> {
  const out = new Map<string, Bounds>();
  const walk = (node: SceneNode): void => {
    if (node.el === 'baked-def') {
      const b = bakedDefBounds(node);
      if (b) out.set(node.defId, b);
      return;
    }
    if (node.el === 'g') for (const c of node.children) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Bounds of one scene node INCLUDING its own transform — `null` when unmeasurable (text, an exotic
 * transform, an unresolvable `baked-use`). Skipped kinds contribute nothing (see {@link SKIP_KINDS}).
 */
function sceneNodeBounds(node: SceneNode, defBounds?: ReadonlyMap<string, Bounds>): Bounds | null {
  if (node.kind && SKIP_KINDS.has(node.kind)) return null;
  const t = parseSimpleTransform(node.transform);
  if (!t) return null;
  let local: Bounds | null = null;
  switch (node.el) {
    case 'circle':
      local = { minX: node.cx - node.r, maxX: node.cx + node.r, minY: node.cy - node.r, maxY: node.cy + node.r };
      break;
    case 'ellipse':
      local = { minX: node.cx - node.rx, maxX: node.cx + node.rx, minY: node.cy - node.ry, maxY: node.cy + node.ry };
      break;
    case 'rect':
      local = { minX: node.x, maxX: node.x + node.width, minY: node.y, maxY: node.y + node.height };
      break;
    case 'polygon':
      local = pointsBounds(node.points);
      break;
    case 'path':
      local = pathBounds(node.d);
      break;
    case 'g': {
      for (const c of node.children) local = union(local, sceneNodeBounds(c, defBounds));
      break;
    }
    case 'baked-use':
      local = defBounds?.get(node.defId) ?? null;
      break;
    case 'baked-def':
    case 'text':
      return null;
  }
  if (!local) return null;
  return applyAffine(local, t);
}

/**
 * The content box a sprite replaces, in the WRAPPER's local space (the wrapper's own transform is NOT
 * applied — the replacing `<image>` carries it unchanged). For a `SceneG` wrapper: the union of its
 * measurable children. For a `baked-use` placement: its referenced def's bounds. `null` ⇒ nothing
 * measurable (the caller falls back to the manifest's native box).
 */
export function wrapperContentBounds(
  node: SceneNode,
  defBounds?: ReadonlyMap<string, Bounds>,
): Bounds | null {
  if (node.el === 'baked-use') return defBounds?.get(node.defId) ?? null;
  if (node.el !== 'g') return null;
  let out: Bounds | null = null;
  for (const c of node.children) out = union(out, sceneNodeBounds(c, defBounds));
  return out;
}

/** Content boxes flatter than this are treated as unmeasurable (a degenerate `M 0 0 Z` body) — the
 *  fit falls back to the manifest's native size rather than a zero-height sprite. */
const MIN_CONTENT_HEIGHT = 2;

/**
 * The `<image>` placement that FITS a sprite into the content box it replaces: height matches the
 * box's height, width follows the sprite's own aspect ratio, the bottom edge sits on the box's bottom
 * (standing objects ground where their vector body grounded), horizontally centred on the box.
 * `def.scale` (per-asset art fudge) and `artScale` (the world-settings dial) multiply the fitted size
 * around that same bottom-centre point. With no measurable box the sprite renders at its native
 * manifest size × `artScale`, seated by its own anchor — the pre-sizing behaviour, dial included.
 */
export function fitSpritePlacement(
  def: SpriteDef,
  content: Bounds | null,
  artScale: number,
): { x: number; y: number; width: number; height: number } {
  const fudge = (def.scale ?? 1) * artScale;
  if (!content || content.maxY - content.minY < MIN_CONTENT_HEIGHT) {
    const width = def.w * fudge;
    const height = def.h * fudge;
    return {
      x: -def.anchorX * width || 0,
      y: -def.anchorY * height || 0,
      width,
      height,
    };
  }
  const height = (content.maxY - content.minY) * fudge;
  const width = height * (def.w / def.h);
  const centerX = (content.minX + content.maxX) / 2;
  return {
    x: centerX - width / 2 || 0,
    // bottom-aligned on the content box: scaling grows the sprite upward from where it grounds.
    y: content.maxY - height || 0,
    width,
    height,
  };
}
