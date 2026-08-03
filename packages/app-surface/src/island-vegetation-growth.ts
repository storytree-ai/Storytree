// island-vegetation-growth — the DRIVER ADR-0292 D1 asked for.
//
// Everything green on an island used to enter as ONE rigid beat: the whole `hex-flora` group scaled
// 0.55 → 1 from the group's own centre, on a 0.42 s wall-clock CSS animation. Two things were wrong
// with that and this module replaces both.
//
//  1. It was one object where there are many. A tree, its capability plants, its conifers and its UAT
//     flowers all popped together, from a shared centre — so the tree appeared to grow out of its own
//     middle rather than out of the ground it is rooted in. ADR-0292 D1: each object grows on its OWN
//     beat, rooted at its OWN ground anchor, inside the window its island is already accreting in.
//
//  2. It was on the wrong clock. 0.42 s of wall-clock CSS cannot see the ADR-0286 D3 speed dial, so at
//     the 0.25x default the owner took the dial to, the vegetation finished at 0.74 s while the island
//     underneath it kept accreting for ~3.0 s: fully grown trees standing on ground that had not
//     arrived. Nothing here is timed. Every value is a pure function of the island's own local 0→1
//     accretion progress — the same cursor the ground, the roads and the schedule already ride — so
//     the dial is tracked by construction and there is one fewer clock in the system than before.
//
// PURE: no React, no DOM, no clock. It reads the settled scene once per island (the expensive half)
// and then answers "at cursor p, what does each object look like?" (the cheap half), exactly the split
// `forest-regrow-render.ts` already uses for island accretion.

import {
  crownRadius,
  hash,
  rand01,
  type SceneNode,
  type SceneStatus,
} from '@storytree/forest-world';
import {
  EXP16_TREE_GROWTH_TRACK,
  POSE_PLANT_GROWTH_TRACK,
  growthTrackPlacement,
  type GrowthTrackPlacement,
} from './shared-growth-tracks.js';
import {
  collectDefBounds,
  fitSpritePlacement,
  parseSimpleTransform,
  wrapperContentBounds,
  type Bounds,
} from './sprite-sizing.js';
import { resolveSprite, spriteKeyFor, type SpriteStyleSheet } from './sprite-sheet.js';

/**
 * What the map is CURRENTLY drawing an object with, so a growth track can inherit the size that is
 * actually on screen rather than the size the scene graph nominally asks for.
 *
 * This is not optional detail. The shipped studio default is the owner-attested `storybook` sprite
 * sheet, and a sheet applies its own per-asset scale fudge on top of the vector body's box — measured
 * on the real corpus, the Storybook tree renders at roughly a QUARTER of the vector body it replaces.
 * Sizing the track from the vector body alone therefore put a tree ~4x too large on every island (up
 * to 2.7x the island's own drawn width). Absent ⇒ the vector body is what renders, and what is
 * inherited.
 */
export interface VegetationArtContext {
  readonly spriteSheet?: SpriteStyleSheet | null;
  readonly artScale?: number;
}

/** What an object on an island is, for growth purposes. */
export type VegetationRole =
  /** The island's central tree — the exp-16 track (ADR-0292 D2). */
  | 'tree'
  /** One capability, as the retained pose-to-pose plant track (ADR-0292 D4). */
  | 'plant'
  /** Conifers, UAT flowers, parcel flora — they keep their vector art and sprout in place. */
  | 'decor'
  /** The nameplate. NOT vegetation: it settles, it never scales (ADR-0292 D1). */
  | 'plate';

// ── the schedule ─────────────────────────────────────────────────────────────────────────────────

/** The slice of an island's window entry delays are drawn from. */
export const VEGETATION_STAGGER_SPAN = 0.45;
/** Every staggered object's own growth span. `STAGGER + GROW === 1`, so the LAST object to start is
 *  also the last to finish, and it finishes exactly as its island lands — nothing outlives the
 *  window (ADR-0292 D6). */
export const VEGETATION_GROW_SPAN = 1 - VEGETATION_STAGGER_SPAN;
/** The nameplate's own settle window — after the vegetation is well under way, done before landing. */
export const PLATE_SETTLE_START = 0.55;
export const PLATE_SETTLE_END = 0.9;
/** World units the nameplate drops through as it settles. Translate only — never a scale, which is
 *  what would make a label look like it was growing out of the soil. */
export const PLATE_SETTLE_RISE = 8;

/**
 * The entry delay for one staggered object — DECORATIVE and deterministic (ADR-0292 D5).
 *
 * Seeded from the story id and the object's own ground anchor, so the same graph produces
 * byte-identical growth on every run, and an object's beat is a property of WHERE IT STANDS rather
 * than of where it happened to sit in a list. That second property is the honest one: it means the
 * stagger cannot accidentally encode the order capabilities were declared in, let alone the order
 * they were BUILT in. Making the plants sprout in capability build order was considered and declined
 * — it would be a genuine claim about the project and the map payload does not carry the ordering
 * that would make it true. A decorative stagger cannot be wrong; a semantic one that is not fed by
 * real data would be.
 */
export function vegetationStaggerDelay(storyId: string, role: VegetationRole, anchor: VegetationAnchor): number {
  const seed = hash(`${storyId}:veg:${role}:${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}`);
  return rand01(seed) * VEGETATION_STAGGER_SPAN;
}

// ── per-island variation of the ONE shared tree track (ADR-0292 D3) ───────────────────────────────

/**
 * MEASURED, and the answer is no: the frame index is NOT a usable status channel on this track.
 *
 * The idea was attractive — the procedural tree carried three forms for free (living canopy, withered
 * skeleton for `unhealthy`, small young form for `proposed`-or-empty), and one shared track cannot
 * draw a different silhouette per island, so stopping an island's tree at an early frame looked like
 * it would recover them for nothing. It does not, because of what exp-16's early frames actually ARE.
 * Rendered as a contact strip at real map size (~20 px), frames 0–11 are a thin sapling whip with a
 * few leaves and only frame 13 onward reads as a tree at all. So a ceiling of 2 makes an `unhealthy`
 * island look like a SEEDLING rather than a dead tree — the opposite of the signal — and a ceiling of
 * 9 makes a `proposed` island look like a weed. Both were built, measured on the real 40-island
 * corpus, and rejected on the picture.
 *
 * Status therefore rides HUE alone, which is the pattern ADR-0292 D3 pointed at in the first place:
 * ADR-0226/0227's hero spread bakes ONE `autumn-tree` silhouette per status "with only its crown
 * recoloured". Capability count rides SIZE, inherited from the body being replaced. Both are live and
 * asserted; the form channel is deliberately absent rather than present-but-lying.
 *
 * The cost this leaves on the table, named for the owner's LOOK rather than buried: the active sprite
 * sheet has an AUTHORED withered tree (`tree:unhealthy`), and a desaturated exp-16 is not it.
 */

/**
 * FALLBACK tree height, for the rare node whose body cannot be measured: the ~2.65·R the procedural
 * tree stood at, which is also the constant ADR-0221's `autumn-tree` hero was fitted with.
 *
 * It is a fallback and not the rule, because deriving the size from `SceneTerritoryInput.radius` is
 * what the first cut of this module did and it was measurably wrong: `radius` is the territory's
 * LAYOUT radius (spacing and reach), not the footprint the island actually draws, and the two differ
 * by enough that a `1.25·radius` tree came out ~2.7x taller than the tree it replaced — up to 2.3x
 * the island's own drawn width. See {@link replacedBodyHeight}.
 */
const TREE_FALLBACK_CROWN_TARGET = 2.6;
/** Per-story size jitter, so forty islands wearing one tree do not read as forty copies. */
const TREE_JITTER = 0.12;

/** Fallback plant height, when a plant's own body cannot be measured. `buildPlantBody`'s tallest
 *  silhouette tops out at y = -18.5, so the band is ~13–18 world units. */
const PLANT_FALLBACK_HEIGHT = 17;
const PLANT_JITTER = 0.16;

export interface VegetationAnchor {
  readonly x: number;
  readonly y: number;
}

/** How ONE island varies the shared tree track — computed once, from data the island already carries. */
export interface IslandTreeVariation {
  /** Full-grown height above the ground anchor, in local wrapper units. Carries CAPABILITY COUNT. */
  readonly matureHeight: number;
  /** Mirrored about its trunk — a seeded per-story variation. */
  readonly flipped: boolean;
  /** Carries STATUS, as the hue class the stylesheet keys on. */
  readonly status: SceneStatus;
}

export interface IslandVegetationInput {
  readonly storyId: string;
  readonly caps: number;
  readonly radius: number;
  readonly status: SceneStatus;
}

/**
 * The world-unit height of the BODY a shared-track frame is about to replace, including that body's
 * own placement scale. `null` when nothing measurable is there.
 *
 * This is the sizing rule the codebase already learned once, the hard way: `fitSpritePlacement` fits a
 * sprite into "the content box of the vector body it replaces — sprites inherit the scene's
 * data-driven size semantics (sapling vs hero, per-island veg scale) instead of stamping at the
 * manifest's native box", after the owner's 2026-07-23 "way too big" verdict. A growth track is the
 * same kind of swap and gets the same rule.
 *
 * It also does the D3 capability work for free and more honestly than a re-derivation could: the body
 * being replaced ALREADY encodes capability count (`crownRadius(caps)` for the procedural tree, and
 * `fittedHeroScale`'s crown term inside a `baked-use`'s own scale), so inheriting its size inherits
 * the signal exactly as the map carries it today — no better and, crucially, no worse.
 */
function replacedBodyHeight(
  node: SceneNode,
  defBounds?: ReadonlyMap<string, Bounds>,
  art?: VegetationArtContext,
): number | null {
  const bounds = wrapperContentBounds(node, defBounds);
  if (!bounds) return null;
  // What is on screen right now, in the wrapper's LOCAL space. When a sprite sheet covers this node
  // the answer is the sheet's own fitted box (art fudge and the `artScale` dial included) — the exact
  // number `trySprite` would draw. Otherwise it is the vector body's own box.
  const key = art?.spriteSheet ? spriteKeyFor(node) : null;
  const def = key && art?.spriteSheet ? resolveSprite(art.spriteSheet, key.kind, key.status) : null;
  const height = def
    ? fitSpritePlacement(def, bounds, art?.artScale ?? 1).height
    : bounds.maxY - bounds.minY;
  // LOCAL units, deliberately — the wrapper's own `transform` is NOT folded in. The growth image is
  // drawn inside that same wrapper, so the wrapper's `scale(s)` applies to it exactly as it applies to
  // the body being replaced. Folding `s` in here as well double-scaled every tree: measured on the
  // real corpus that put the tree at ~2.7x the size of the one it replaced, up to 2.7x the island's
  // own drawn width. Same reason `wrapperContentBounds` excludes it for `fitSpritePlacement`.
  return height > 0 ? height : null;
}

/**
 * Vary the one shared track for one island (ADR-0292 D3), following the ADR-0226/0227 hero-spread
 * pattern: define once, reference many, and let CODE carry what the art cannot.
 *
 * Two channels, and the requirement they exist to satisfy is that CAPABILITY COUNT and STATUS stay
 * readable in the tree after the swap:
 *   - SIZE inherited from the body being replaced ({@link replacedBodyHeight}) — capability count,
 *     carried exactly as the map carries it now.
 *   - HUE from a per-status class the stylesheet keys on — status, following ADR-0226/0227's hero
 *     spread, which carried status on one silhouette "with only its crown recoloured".
 * Plus a seeded size jitter and mirror, which claim nothing and only break the repetition. A third
 * channel (form, via the frame ceiling) was built and measured out — see the note above.
 */
export function islandTreeVariation(
  input: IslandVegetationInput,
  replacedHeight?: number | null,
): IslandTreeVariation {
  const seed = hash(`${input.storyId}:veg:tree`);
  const jitter = 1 - TREE_JITTER / 2 + rand01(seed) * TREE_JITTER;
  const base =
    replacedHeight != null && replacedHeight > 0
      ? replacedHeight
      : crownRadius(input.caps) * TREE_FALLBACK_CROWN_TARGET;
  return {
    matureHeight: Math.max(0, base * jitter),
    flipped: rand01(seed + 1) > 0.5,
    status: input.status,
  };
}

/** A capability plant's own seeded size + mirror, on the same inherit-the-body rule as the tree. The
 *  plant track carries no status form — a plant's status still reads from the island tint and its own
 *  class, exactly as it did. */
function plantVariation(
  storyId: string,
  anchor: VegetationAnchor,
  replacedHeight: number | null,
): { matureHeight: number; flipped: boolean } {
  const seed = hash(`${storyId}:veg:plant:${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}`);
  const base = replacedHeight != null && replacedHeight > 0 ? replacedHeight : PLANT_FALLBACK_HEIGHT;
  return {
    matureHeight: base * (1 - PLANT_JITTER / 2 + rand01(seed) * PLANT_JITTER),
    flipped: rand01(seed + 1) > 0.5,
  };
}

// ── the plan: one walk of the settled scene, per island ───────────────────────────────────────────

/**
 * WHERE an object's ground anchor is expressed, which decides how a rooted scale is written.
 *
 * `placement` — the object carries its own `translate(x y)` (a tree, a conifer, a capability plant, a
 * UAT flower). Its local origin already IS the ground contact, so growth is one appended `scale(g)`.
 *
 * `measured` — the object carries NO transform and draws in island coordinates. This is the whole
 * ADR-0226 parcel vocabulary, which is what the shipped map's per-capability vegetation actually is:
 * 2,000+ small marks whose geometry sits where it lies. Appending a bare `scale(g)` to one of those
 * would scale it about the WORLD ORIGIN and fling it in from the corner of the map — so its contact
 * is measured from its own geometry instead, and growth is written as the same
 * `translate(p) scale(g) translate(-p)` triple the land-cell accretion already uses.
 */
export type VegetationRootMode = 'placement' | 'measured';

export interface VegetationObjectPlan {
  /** The scene node this beat belongs to. IDENTITY is the key — the scene is memoised once, and
   *  keying on the node itself needs no id on nodes that never carried one (a conifer, a tree). */
  readonly node: SceneNode;
  readonly role: VegetationRole;
  /** The object's ground contact, in the coordinate space its parent draws it in. */
  readonly anchor: VegetationAnchor;
  readonly rootMode: VegetationRootMode;
  /** World-unit height of the body a shared track replaces here — the inherited size (see
   *  `replacedBodyHeight`). Null for a role that keeps its own art, or an unmeasurable body. */
  readonly replacedHeight: number | null;
  /** This object's own window, as a fraction of its island's accretion window. */
  readonly start: number;
  readonly end: number;
}

export interface IslandVegetationPlan {
  readonly storyId: string;
  readonly tree: IslandTreeVariation;
  readonly objects: readonly VegetationObjectPlan[];
}

/** The scene kinds that grow as vector DECOR — they keep their own art and sprout in place. */
const DECOR_KINDS: ReadonlySet<string> = new Set([
  'conifer',
  'parcel-flora',
  'tall-flower-proven',
  'tall-flower-pending',
  'tall-flower-failing',
]);

/** The role of one direct child of a `territory` group, or null when it is not vegetation at all
 *  (the wisp layers — a session's presence is not something the forest grows). */
function roleOf(node: SceneNode, storyId: string): VegetationRole | null {
  if (node.el === 'baked-use') {
    // The shipped central tree (ADR-0227's per-status `autumn-tree` colourway) is a `<use>`, not a
    // group, and `veg-tree-<storyId>` is the id `vegHeroTreeUse` stamps on it.
    return node.id === `veg-tree-${storyId}` ? 'tree' : null;
  }
  if (node.kind === 'tree') return 'tree';
  if (node.kind === 'flora') return 'plant';
  if (node.kind === 'plate') return 'plate';
  return node.kind !== undefined && DECOR_KINDS.has(node.kind) ? 'decor' : null;
}

/**
 * The ground anchor a beat is rooted in — the object's own placement when it has one, otherwise the
 * bottom-centre of its own geometry.
 *
 * Null when neither can be established (an exotic transform, an unmeasurable body). Such an object is
 * left OUT of the plan rather than grown about an origin that is not its own: an unrooted sprout is
 * worse than no sprout, because it reads as the object flying in from somewhere else.
 */
function rootOf(node: SceneNode): { anchor: VegetationAnchor; rootMode: VegetationRootMode } | null {
  if (node.transform !== undefined) {
    const t = parseSimpleTransform(node.transform);
    return t ? { anchor: { x: t.tx, y: t.ty }, rootMode: 'placement' } : null;
  }
  const bounds = wrapperContentBounds(node);
  if (!bounds) return null;
  return {
    // Bottom-centre: where the mark meets the ground, which is the only honest origin for something
    // that is supposed to grow OUT of it.
    anchor: { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY },
    rootMode: 'measured',
  };
}

/**
 * One island's growth plan, from the settled `territory` group the map already draws.
 *
 * Derived ONCE per scene: it walks the island's flora children and seeds every beat. Nothing in here
 * depends on the cursor, which is what keeps the per-frame half (below) cheap enough to run on a
 * surface whose measured cost is already a full-map rasterisation (ADR-0272).
 */
export function deriveIslandVegetationPlan(
  territory: SceneNode,
  input: IslandVegetationInput,
  defBounds?: ReadonlyMap<string, Bounds>,
  art?: VegetationArtContext,
): IslandVegetationPlan | null {
  if (territory.el !== 'g') return null;
  const objects: VegetationObjectPlan[] = [];
  let treeHeight: number | null = null;
  for (const child of territory.children) {
    const role = roleOf(child, input.storyId);
    if (!role) continue;
    const root = rootOf(child);
    if (!root) continue;
    const { anchor, rootMode } = root;
    if (role === 'tree') {
      // ADR-0292 D2: the tree IS the island's own cursor — no stagger, no offset. Tree and ground
      // finish together because they are the same number.
      treeHeight = replacedBodyHeight(child, defBounds, art);
      objects.push({ node: child, role, anchor, rootMode, replacedHeight: treeHeight, start: 0, end: 1 });
    } else if (role === 'plate') {
      objects.push({
        node: child,
        role,
        anchor,
        rootMode,
        replacedHeight: null,
        start: PLATE_SETTLE_START,
        end: PLATE_SETTLE_END,
      });
    } else {
      const start = vegetationStaggerDelay(input.storyId, role, anchor);
      objects.push({
        node: child,
        role,
        anchor,
        rootMode,
        replacedHeight: role === 'plant' ? replacedBodyHeight(child, defBounds, art) : null,
        start,
        end: start + VEGETATION_GROW_SPAN,
      });
    }
  }
  return { storyId: input.storyId, tree: islandTreeVariation(input, treeHeight), objects };
}

/** Every island's plan, keyed by story id. Islands the scene does not hold are simply absent. */
export function deriveIslandVegetationPlans(
  scene: SceneNode,
  inputs: readonly IslandVegetationInput[],
  art?: VegetationArtContext,
): ReadonlyMap<string, IslandVegetationPlan> {
  const territories = new Map<string, SceneNode>();
  const visit = (node: SceneNode): void => {
    if (node.kind === 'territory' && node.id !== undefined) {
      territories.set(node.id, node);
      return; // a territory never nests another
    }
    if (node.el === 'g') for (const child of node.children) visit(child);
  };
  visit(scene);
  // The shipped central tree is a `baked-use` whose geometry lives in a `<defs>` elsewhere in the
  // scene, so its size can only be measured with the def table in hand. Collected ONCE here, not per
  // island — this is the expensive half and it runs on a scene change, never on a cursor tick.
  const defBounds = collectDefBounds(scene);
  const plans = new Map<string, IslandVegetationPlan>();
  // Sorted so the derivation order — and any reported failure order — is independent of input order.
  for (const input of [...inputs].sort((a, b) => (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0))) {
    const territory = territories.get(input.storyId);
    if (!territory) continue;
    const plan = deriveIslandVegetationPlan(territory, input, defBounds, art);
    if (plan) plans.set(input.storyId, plan);
  }
  return plans;
}

// ── the per-frame selection ───────────────────────────────────────────────────────────────────────

/** What one object looks like at one cursor. A discriminated union because the three families enter
 *  in genuinely different ways — a tracked object swaps FRAME, a vector object scales from its root,
 *  and the nameplate only ever slides. */
export type VegetationRender =
  | {
      readonly kind: 'track';
      readonly role: 'tree' | 'plant';
      readonly placement: GrowthTrackPlacement;
      readonly status: SceneStatus | null;
      readonly grown: number;
    }
  | {
      readonly kind: 'rooted';
      readonly scale: number;
      readonly opacity: number;
      readonly grown: number;
      /** The point to scale ABOUT, when the object has no placement transform of its own to root in
       *  (see {@link VegetationRootMode}). Null ⇒ its local origin already is its ground contact. */
      readonly origin: VegetationAnchor | null;
    }
  | { readonly kind: 'settle'; readonly dy: number; readonly opacity: number; readonly grown: number };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** One object's own 0→1 across its own window. */
function localGrowth(object: VegetationObjectPlan, progress: number): number {
  if (object.end <= object.start) return progress >= object.end ? 1 : 0;
  return clamp01((progress - object.start) / (object.end - object.start));
}

/**
 * Select one island's vegetation at cursor `progress` (its OWN local accretion progress, 0→1).
 *
 * `progress >= 1` is the settled island, and it is deliberately not a special case with its own
 * branch: every beat has already reached its end, so a settled island's tree sits on its mature
 * frame, its decor carries no transform at all and its nameplate carries no offset. The map is quiet
 * because nothing is left to move, not because something switched the motion off (ADR-0292 D6).
 *
 * The map only ever contains what is still DIFFERENT from rest: a decor object at full growth and a
 * settled nameplate are omitted, so the settled forest's DOM is byte-identical to the one before this
 * arc except for the two tracked objects, which are images by design.
 */
export function islandVegetationAtProgress(
  plan: IslandVegetationPlan,
  progress: number,
): ReadonlyMap<SceneNode, VegetationRender> {
  const p = clamp01(progress);
  const out = new Map<SceneNode, VegetationRender>();
  for (const object of plan.objects) {
    const grown = localGrowth(object, p);
    if (object.role === 'tree') {
      out.set(object.node, {
        kind: 'track',
        role: 'tree',
        placement: growthTrackPlacement(EXP16_TREE_GROWTH_TRACK, {
          grown,
          matureHeight: plan.tree.matureHeight,
          flipped: plan.tree.flipped,
        }),
        status: plan.tree.status,
        grown,
      });
    } else if (object.role === 'plant') {
      const variation = plantVariation(plan.storyId, object.anchor, object.replacedHeight);
      out.set(object.node, {
        kind: 'track',
        role: 'plant',
        placement: growthTrackPlacement(POSE_PLANT_GROWTH_TRACK, {
          grown,
          matureHeight: variation.matureHeight,
          flipped: variation.flipped,
        }),
        status: null,
        grown,
      });
    } else if (object.role === 'plate') {
      if (grown >= 1) continue;
      out.set(object.node, {
        kind: 'settle',
        dy: -PLATE_SETTLE_RISE * (1 - grown),
        opacity: grown,
        grown,
      });
    } else {
      if (grown >= 1) continue;
      out.set(object.node, {
        kind: 'rooted',
        scale: grown,
        opacity: grown,
        grown,
        origin: object.rootMode === 'measured' ? object.anchor : null,
      });
    }
  }
  return out;
}
