import type { SceneNode, SceneStatus } from '@storytree/forest-world';

// sprite-sheet — the SWAPPABLE SPRITE ART-SHEET manifest contract (sprite-art-sheets spike).
//
// Every studio-rendered object is a per-type factory in `scene.ts` emitting a `SceneG`/`SceneBakedUse`
// WRAPPER whose own `transform` is its ground anchor (a `translate(x y)`, sometimes followed by a
// `scale`). This module is the pure, browser-safe contract for re-skinning that wrapper with an image
// instead of its procedural vector body: a `SpriteStyleSheet` maps a drawable's semantic KEY
// (`${kind}:${status}` when the object carries a folded status, else `${kind}` alone) to a `SpriteDef`
// — an image `href` + its native box + a ground-contact PIVOT (`anchorX`/`anchorY`, 0..1 fractions of
// the sprite's own box). `resolveSprite` looks a drawable up (exact kind:status first, then the
// kind-only fallback, so a sheet may cover only SOME kinds/statuses and everything else stays vector);
// `spritePlacement` turns a resolved def into the `<image>` offset that seats its ground pivot at the
// wrapper's local (0,0) — so the wrapper's EXISTING `transform` (unchanged) still places it correctly.
//
// Deliberately depends on nothing (no React, no DOM, no `node:` imports) — the studio mapper
// (`SceneView.tsx`) is the ONLY consumer that decides, per node, whether to
// call `resolveSprite` at all (a `null` sheet / a miss ⇒ the node's existing vector body renders,
// byte-identical). Nothing here changes `buildScene`'s output — the scene graph carries no opinion
// about sprites; the sheet is purely a render-time skin the studio mapper applies on top.

/** One sprite in a style sheet: an image `href` (studio-served static asset, e.g.
 *  `/art-sheets/<name>/tree-healthy.svg`), its own native pixel box (`w`/`h`), and the GROUND-CONTACT
 *  PIVOT inside that box as a 0..1 fraction (`anchorX`/`anchorY`) — e.g. `{ anchorX: 0.5, anchorY: 1 }`
 *  is "bottom-centre", the usual ground anchor every factory already draws its wrapper transform onto.
 *  `scale` (default 1) lets one authored box be drawn larger/smaller than its native size without a
 *  second asset. */
export interface SpriteDef {
  href: string;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  scale?: number;
}

/** A named, labelled set of sprites keyed by drawable kind (+ optional status). `name` is the sheet's
 *  own id (matches its `art-sheets/<name>/` folder and the `artStyle` world-setting option value);
 *  `label` is the human-facing name the gear panel shows. */
export interface SpriteStyleSheet {
  name: string;
  label: string;
  sprites: Record<string, SpriteDef>;
}

/**
 * Resolve which sprite (if any) covers a drawable's `kind` (+ optional folded `status`). Tries the
 * exact `${kind}:${status}` entry first (a per-status colourway), then falls back to the bare `${kind}`
 * entry (one sprite for every status) — so a sheet author can cover every status distinctly, cover them
 * all with one fallback image, or mix both (an explicit override for one status, the rest sharing the
 * fallback). Returns `null` when neither is present — the caller's cue to render the vector body.
 */
export function resolveSprite(
  sheet: SpriteStyleSheet,
  kind: string,
  status?: string,
): SpriteDef | null {
  if (status) {
    const exact = sheet.sprites[`${kind}:${status}`];
    if (exact) return exact;
  }
  return sheet.sprites[kind] ?? null;
}

/**
 * The `<image>` placement that seats a resolved sprite's ground-contact pivot at the wrapper's local
 * `(0, 0)` — so the studio mapper can keep the wrapper's EXISTING `transform` untouched (the object's
 * ground anchor / any scale it already carries) and simply offset the image inside it. `scale` (default
 * 1) scales the sprite's own box before the pivot offset is computed, so the anchor still lands exactly
 * on the scaled edges/centre.
 */
export function spritePlacement(def: SpriteDef): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const scale = def.scale ?? 1;
  const width = def.w * scale;
  const height = def.h * scale;
  return {
    // `|| 0` normalizes a `-0` result (anchorX/anchorY of 0) to plain `0` — cosmetic, but it keeps a
    // `toFixed`'d attribute string from ever reading "-0.0" on the rendered `<image>`.
    x: -def.anchorX * width || 0,
    y: -def.anchorY * height || 0,
    width,
    height,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireNonEmptyString(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`sprite-sheet: ${what} must be a non-empty string`);
  }
  return v;
}

function requireFiniteNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`sprite-sheet: ${what} must be a finite number`);
  }
  return v;
}

function parseSpriteDef(key: string, raw: unknown): SpriteDef {
  if (!isRecord(raw)) {
    throw new Error(`sprite-sheet: sprite "${key}" must be an object`);
  }
  const href = requireNonEmptyString(raw.href, `sprite "${key}"'s "href"`);
  const w = requireFiniteNumber(raw.w, `sprite "${key}"'s "w"`);
  const h = requireFiniteNumber(raw.h, `sprite "${key}"'s "h"`);
  if (w <= 0) throw new Error(`sprite-sheet: sprite "${key}"'s "w" must be positive`);
  if (h <= 0) throw new Error(`sprite-sheet: sprite "${key}"'s "h" must be positive`);
  const anchorX = requireFiniteNumber(raw.anchorX, `sprite "${key}"'s "anchorX"`);
  const anchorY = requireFiniteNumber(raw.anchorY, `sprite "${key}"'s "anchorY"`);
  const out: SpriteDef = { href, w, h, anchorX, anchorY };
  if (raw.scale !== undefined) {
    const scale = requireFiniteNumber(raw.scale, `sprite "${key}"'s "scale"`);
    if (scale <= 0) throw new Error(`sprite-sheet: sprite "${key}"'s "scale" must be positive`);
    out.scale = scale;
  }
  return out;
}

/**
 * Validate + parse an arbitrary JSON value (a fetched `manifest.json`) into a `SpriteStyleSheet`,
 * throwing a descriptive error on anything malformed — never returning a half-parsed sheet. The
 * studio's loader catches the throw and degrades to vector (a bad manifest never crashes the map).
 */
export function parseStyleSheet(json: unknown): SpriteStyleSheet {
  if (!isRecord(json)) {
    throw new Error('sprite-sheet: manifest must be an object');
  }
  const name = requireNonEmptyString(json.name, 'manifest "name"');
  const label = requireNonEmptyString(json.label, 'manifest "label"');
  if (!isRecord(json.sprites)) {
    throw new Error('sprite-sheet: manifest "sprites" must be an object map');
  }
  const sprites: Record<string, SpriteDef> = {};
  for (const [key, raw] of Object.entries(json.sprites)) {
    sprites[key] = parseSpriteDef(key, raw);
  }
  return { name, label, sprites };
}

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
 *
 * Lives HERE rather than in the studio mapper because it is sprite POLICY, not React translation: the
 * vegetation growth driver has to ask the same question (what does this node actually render as, and
 * therefore what size should the growth track inherit?) and must not import a React module to do it.
 */
export function spriteKeyFor(node: SceneNode): { kind: string; status?: SceneStatus } | null {
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
