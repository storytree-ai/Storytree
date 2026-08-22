// canopy-geometry.ts — A SMALL TREE, as a solid. Pure, deterministic, browser-free,
// node:test-provable, inside the ADR-0123 provability firewall.
//
// WHY THIS EXISTS AND WHY IT IS NOT `tree-geometry.ts` SCALED DOWN. The owner's verdict on
// 2026-08-21 was not "make the hero tree smaller" — it was a SUBSTITUTION: "we ditch the middle
// tree, and instead opt for many small trees so it actually looks like a forrest/garden". The
// hero tree is a union of eight authored SVG lobes keyed to a story's id, whose whole job is to
// be ONE identifiable object carrying a status token in its crown (ADR-0226). A small tree has
// the opposite job: it is one of forty, it is never looked at alone, and everything it delivers
// it delivers as part of a mass. Those are different objects, so they get different modules.
//
// THE SHAPE IS TAKEN FROM A MEASUREMENT OF THE NAMED REFERENCE, not from taste. The research
// pass on ISLANDERS (`docs/research/chapter2-islanders-canopy-2026-08-22/`) read its trees off
// the delivered pixels at 4x-8x magnification. What is there:
//
//   - a TAPERED SPINDLE — widest around a third of the way up, narrowing to a point at the top
//     and to a small footprint at the ground;
//   - NO TRUNK, at any zoom. The canopy meets the ground directly;
//   - two silhouettes in circulation, a narrow spire and a rounder dome, never more;
//   - a delivered aspect around 2.3 : 1 (height : width);
//   - ONE canopy colour per island. Variation between neighbouring trees is entirely SIZE.
//     This is the finding that is easiest to get backwards, and getting it backwards — a grove
//     of individually-tinted trees — is what makes vegetation read as confetti.
//
// WHAT IS DELIBERATELY NOT COPIED, because the reference is TRANSLATED and never lifted: its
// trees are ~0.8% of their island's width, and at our 2 px per ground unit that would be 3.9
// delivered pixels, which this arc has already measured to be below the floor at which an
// isolated mark is still an object (~10 px). Our delivery is roughly 4x smaller in linear
// terms, so the RATIO cannot come across. See `CANOPY_WIDTH_FLOOR`.

import {
  addLathe,
  emptyRaw,
  finishRaw,
  mulberry32,
  type GeneratedMesh,
  type Raw,
} from './mesh-kit.js';
import { PROP_TOKENS } from './palette-band.js';

/** The tree, as one mesh per authored TOKEN — the shape `growTree` and `growFlower` already
 *  return, so a caller merges every family the same way and no mesh wears two colours. */
export type CanopyParts = Map<string, GeneratedMesh>;

/**
 * THE SMALLEST CANOPY WIDTH THIS ISLAND MAY DRAW, in ground units, and it is an inherited
 * measurement rather than a preference.
 *
 * PR #1498 established two floors on the delivered raster: a feature under ~1 ground unit is
 * aliasing shimmer, and an ISOLATED MARK under ~10 delivered pixels stops being an object — it
 * was why the shrine's 4.5-unit stepping stones vanished into the grass and had to go to 7. At
 * the delivered 2 px per ground unit, 10 px is 5 ground units.
 *
 * THIS IS THE WHOLE ANSWER TO "IS THIS JUST THE PLANT SPECKLE UNDER A NEW NAME". The fixture's
 * 144 plants are about 7.4 x 6 units — 15 x 12 delivered pixels — and read as speckle, which is
 * why every dressing thins them. A canopy tree is not distinguished from one by being bigger in
 * area; it is 5-9 units wide against a plant's 7.4. It is distinguished by being TALL: see
 * {@link CANOPY_ASPECT_FLOOR}.
 */
export const CANOPY_WIDTH_FLOOR = 5;

/**
 * THE SMALLEST HEIGHT : WIDTH A CANOPY TREE MAY HAVE, and it is the load-bearing number in this
 * module.
 *
 * A plant is WIDER THAN IT IS TALL (7.4 x 6 units) so it delivers a squat blob, and a squat blob
 * reads as texture painted ON the ground. A tree is more than twice as tall as it is wide, so it
 * delivers a vertical mark, and a vertical mark reads as an object STANDING ON the ground. That
 * is the whole difference between a forest and a green rash, it is a property of the silhouette
 * rather than of the count, and it is the reference's own proportion (measured 2.3 : 1).
 *
 * ⚠ HEIGHT FORESHORTENS AND WIDTH DOES NOT, so a WORLD aspect and a DELIVERED one are different
 * numbers and confusing them authors a shrub. The island renders at a 50-degree elevation, so a
 * world height H delivers H * cos(50) = 0.643 H pixels per unit while a width delivers all of
 * itself: delivered aspect = world aspect * 0.643.
 *
 * THE FLOOR IS THE POINT WHERE A MARK STOPS BEING GROUND TEXTURE. A plant delivers 15 x 12 —
 * wider than tall, 0.8 : 1. At world 2.0 a tree delivers 1.29 : 1, which is the other side of
 * square and the cheapest possible statement that this thing stands up. The reference's own
 * delivered 2.3 : 1 needs a WORLD aspect of 3.6, which is what {@link groveSpecs} actually
 * authors for a spire; the floor is the refusal, not the target.
 */
export const CANOPY_ASPECT_FLOOR = 2;

/** The two silhouettes in circulation. Two rather than one because the reference carries two and
 *  a grove of identical cones reads as a manufactured row; two rather than five because the
 *  reference does NOT carry five, and every extra silhouette is one more thing to defend. */
export type CanopyShape = 'spire' | 'dome';

export interface CanopySpec {
  /** Widest diameter, in ground units. Held at or above {@link CANOPY_WIDTH_FLOOR}. */
  width: number;
  /** Full WORLD height, base to tip, in ground units — not the drawn height. */
  height: number;
  shape: CanopyShape;
  /** The authored canopy token. One per island, never one per tree (see the header). */
  token?: string;
  /** Rotation about the upright axis, in radians. A solid of revolution is indifferent to it;
   *  it is here so a later non-revolved silhouette can use the same spec without a new field. */
  yaw?: number;
  seed?: number;
}

/** How many meridian segments a canopy is swept with.
 *
 *  NINE, and the number is chosen against the delivered raster rather than defaulted. A tree is
 *  10-18 delivered pixels wide, so its lit side spans five to nine pixels: at nine segments each
 *  facet is about one pixel across, which is the point past which more sides deliver nothing but
 *  triangles. Seven leaves a visible flat on the lit shoulder at the widest sizes. */
const CANOPY_SEGMENTS = 9;

/** How many rings the profile is sampled at. Eleven puts a ring every ~2-3 delivered pixels up
 *  the tree, which is fine enough that the banded material's rung boundaries follow the curve
 *  instead of following the tessellation. */
const CANOPY_RINGS = 11;

/**
 * The silhouette, as a radius fraction at a height fraction.
 *
 * ONE FORMULA WITH TWO SETTINGS RATHER THAN TWO HAND-DRAWN CURVES, so the difference between a
 * spire and a dome is three numbers a reader can check rather than two tables to compare.
 *
 *  - `peak` — where the widest point sits up the tree;
 *  - `rise` — the exponent below the peak. Below 1 the tree flares fast off its base;
 *  - `fall` — the exponent above it. Below 1 the tip is a spike, above 1 it is a shoulder;
 *  - `base` — the radius fraction AT the ground. Not zero: a tree tapering to a point where it
 *    meets the land reads as a spinning top balanced on its tip. The reference's trees have a
 *    narrow but visible footprint, and at these sizes 0.18 of 6 units is one ground unit, which
 *    is exactly the shimmer floor and no less.
 */
const PROFILES = {
  // A cypress/poplar: flares immediately, carries its width most of the way up, ends in a point.
  spire: { peak: 0.3, rise: 0.55, fall: 0.85, base: 0.18 },
  // A broadleaf: widest at the middle, a rounded top, a fatter foot.
  dome: { peak: 0.46, rise: 0.72, fall: 0.62, base: 0.3 },
} satisfies Record<CanopyShape, { peak: number; rise: number; fall: number; base: number }>;

/** The radius fraction at height fraction `t`, for one shape. Exported for the test, which
 *  asserts the silhouette's properties (monotone up to the peak, a point at the tip, a non-zero
 *  foot) rather than a table of sampled numbers that would have to be re-blessed on every tweak. */
export function canopyRadiusAt(shape: CanopyShape, t: number): number {
  const p = PROFILES[shape];
  const u = Math.min(1, Math.max(0, t));
  if (u >= 1) return 0;
  if (u <= p.peak) {
    const k = p.peak === 0 ? 1 : u / p.peak;
    return p.base + (1 - p.base) * Math.pow(k, p.rise);
  }
  const k = (1 - u) / (1 - p.peak);
  return Math.pow(k, p.fall);
}

/**
 * Grow one small tree, standing on `y = 0` at its own footprint — the caller translates it onto
 * the land, exactly as it does for a flower or the hero tree.
 *
 * ⚠ UNLIKE `growTree` THIS TAKES NO FORESHORTENING ARGUMENT, and the absence is deliberate. The
 * hero tree's dimensions come from a scene authored in a PROJECTED 20-degree drawing, so its
 * heights have to be un-projected on the way in or the tree towers or squats. A canopy tree's
 * dimensions are authored HERE, in world units, so there is nothing to recover. Threading a
 * foreshortening through anyway would apply the correction twice — a 6% error at this camera,
 * which is precisely the size that never looks wrong.
 */
/**
 * WHAT A NINE-SIDED LATHE ACTUALLY DELIVERS FOR A GIVEN RADIUS — and it is not the diameter.
 *
 * A polygon inscribed in a circle is NARROWER than the circle: at nine sides on this phase the
 * x-extent is 1.9397 r, so an authored width of 5 delivered 4.85 and a tree sitting exactly on
 * the 10-delivered-pixel object floor came out at 9.7. Three per cent, invisible, and on the
 * wrong side of a floor that exists precisely because the difference between 9.7 and 10 pixels
 * is the difference between a tree and a speck.
 *
 * Derived from the SAME angles `addLathe` sweeps rather than written as 0.9698, so it cannot
 * drift if {@link CANOPY_SEGMENTS} changes.
 */
const LATHE_X_EXTENT = (() => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let s = 0; s < CANOPY_SEGMENTS; s++) {
    const c = Math.cos((s / CANOPY_SEGMENTS) * Math.PI * 2);
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return (hi - lo) / 2;
})();

export function growCanopy(spec: CanopySpec): CanopyParts {
  const token = spec.token ?? PROP_TOKENS.canopy;
  const width = Math.max(CANOPY_WIDTH_FLOOR, spec.width);
  const height = Math.max(width * CANOPY_ASPECT_FLOOR, spec.height);
  // Compensated so `width` MEANS the delivered width — see LATHE_X_EXTENT.
  const halfWidth = width / 2 / LATHE_X_EXTENT;
  const raw: Raw = emptyRaw();

  // THE WIDEST POINT IS SAMPLED EXPLICITLY, not hoped for. Evenly-spaced rings miss a peak that
  // does not land on one: the dome's sits at 0.46 and the nearest ring at 0.4, so a tree asked
  // for 8 units wide grew 7.40 — the profile was right and the SAMPLING lost 7% of it. Both
  // ends are in the set for the same reason (the tip is where the point is).
  const ts = new Set<number>([0, PROFILES[spec.shape].peak, 1]);
  for (let i = 0; i < CANOPY_RINGS; i++) ts.add(i / (CANOPY_RINGS - 1));
  const profile = [...ts]
    .sort((a, b) => a - b)
    .map((t) => ({ r: canopyRadiusAt(spec.shape, t) * halfWidth, y: t * height }));
  addLathe(raw, profile, [0, 0, 0], CANOPY_SEGMENTS);

  const out: CanopyParts = new Map();
  if (raw.idx.length) out.set(token, finishRaw(raw));
  return out;
}

export interface CanopyCasterResult {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** The cylinder a canopy tree casts its contact shade as: the footprint's half-width and the
 *  UNPROJECTED height, read the same way every other caster on the island reads them. Taking
 *  the drawn height instead would leave a tree's shadow 6% short of the tree. */
export function canopyCaster(spec: CanopySpec, at: { x: number; z: number }): CanopyCasterResult {
  const halfWidth = Math.max(CANOPY_WIDTH_FLOOR, spec.width) / 2;
  return {
    x: at.x,
    z: at.z,
    // The shade pool is the CANOPY's radius, not the foot's: a tree's shadow is cast by the
    // widest part of it, and pooling at the 0.18 foot would put a dot under a 6-unit crown.
    radius: halfWidth,
    height: Math.max(halfWidth * 2 * CANOPY_ASPECT_FLOOR, spec.height),
  };
}

/** {@link groveSpecs}'s request. Named so a caller can DRAFT one — an optional field is assigned
 *  only when it is present, and an absent field still means "the default", exactly as omitting it
 *  from the literal did. */
export interface GroveSpecOptions {
  count: number;
  seed?: number;
  /** Widest diameter at the SMALLEST tree, in ground units. */
  minWidth?: number;
  /** Widest diameter at the LARGEST tree. */
  maxWidth?: number;
  /** WORLD height : width for a SPIRE. Defaults to 3.6, which is the world aspect that delivers
   *  the reference's measured 2.3 : 1 at this camera. Held at or above
   *  {@link CANOPY_ASPECT_FLOOR}. */
  aspect?: number;
  domeFraction?: number;
  token?: string;
}

/**
 * A grove's worth of specs from one seed: the SIZE variation that carries the whole look.
 *
 * THE VARIATION IS IN SIZE AND NOTHING ELSE, and that is the reference's own discipline. Its
 * groves hold trees ranging roughly 1 : 2.5 in height with one canopy colour between them; the
 * range is what makes a cluster read as a stand of trees rather than as a fence of identical
 * cones, and the single colour is what keeps it reading as one mass.
 *
 * `domeFraction` is how many of them take the rounder silhouette. Passing 0 or 1 gives a pure
 * stand, which is what a formal planting looks like; the middle is a wild one.
 */
export function groveSpecs(opts: GroveSpecOptions): CanopySpec[] {
  const rnd = mulberry32(opts.seed ?? 11);
  const minW = Math.max(CANOPY_WIDTH_FLOOR, opts.minWidth ?? CANOPY_WIDTH_FLOOR);
  const maxW = Math.max(minW, opts.maxWidth ?? minW * 1.8);
  const aspect = Math.max(CANOPY_ASPECT_FLOOR, opts.aspect ?? 3.6);
  const domeFraction = Math.min(1, Math.max(0, opts.domeFraction ?? 0.3));
  const out: CanopySpec[] = [];
  for (let i = 0; i < Math.max(0, Math.round(opts.count)); i++) {
    // BOTH randoms are drawn every iteration, before any branch, so the stream cannot depend on
    // which silhouette a tree happened to take — the same trap `scatter` documents.
    const rw = rnd();
    const rs = rnd();
    const width = minW + (maxW - minW) * rw;
    const shape: CanopyShape = rs < domeFraction ? 'dome' : 'spire';
    const spec: CanopySpec = {
      width,
      // A dome is authored SHORTER FOR ITS WIDTH than a spire — 0.66 of the spire's aspect,
      // floored so the clamp inside `growCanopy` can never silently fire. That is what makes it
      // a different TREE rather than the same tree wearing a rounder hat: at the default 3.6 a
      // spire delivers 2.3 : 1 and a dome 1.53 : 1, and the two silhouettes separate at
      // delivered size rather than only in the source.
      height: width * Math.max(CANOPY_ASPECT_FLOOR, aspect * (shape === 'dome' ? 0.66 : 1)),
      shape,
      seed: (opts.seed ?? 11) + i,
    };
    // An untokened request leaves `token` ABSENT, so `growCanopy` still falls back to
    // `PROP_TOKENS.canopy` — the same behaviour the conditional spread expressed.
    if (opts.token !== undefined) spec.token = opts.token;
    out.push(spec);
  }
  return out;
}
