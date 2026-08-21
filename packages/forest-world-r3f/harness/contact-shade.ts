// contact-shade.ts — CONTACT DARKENING (ambient occlusion), in ground space. Pure,
// browser-free, node:test-provable; fenced into `harness/` with the rest of the experiment.
//
// WHY THIS EXISTS AT ALL. The reference board (`docs/research/chapter2-reference-board-
// 2026-08-20/`) named ten mechanisms separating the owner's references from our island and
// ranked contact darkening FIRST: *"Every object in all three references darkens the ground
// where it meets it... it is doing most of the work of making things look placed rather than
// pasted. Our island has ZERO contact darkening."* It sat in the register as NOT ATTEMPTED,
// and it is the cheapest of the unattempted levers because it is a DARKENING — it lands on
// the shade ladder that already exists rather than needing new hues.
//
// WHY IT IS ITS OWN MODULE RATHER THAN A THIRD TERM IN `land-shadow.ts`. That file computes
// "how much of the authored light is blocked" — a directional question, answered by marching
// toward a light or by stamping a swept disc away from it. Contact darkening is not that. It
// approximates how much of the SKY a point cannot see, which is direction-free and lands on
// the lit side of a prop as well as the shaded one. Folding an omnidirectional term into a
// module whose whole argument is about one authored light direction would blur the reasoning
// in both. They meet in ONE texture (the material takes one occlusion field) and nowhere
// else — see `mergeOcclusion`.
//
// WHAT IT IS NOT. It names no colour and picks no rung, exactly as `land-shadow.ts` does not.
// `shadow-ladder.ts` owns which rung an occluded pixel lands on, and the closure argument is
// untouched: the material still emits `token x level`.

import type { ShadowCaster, ShadowField } from './land-shadow.js';
import { SHADOW_GRES } from './land-shadow.js';

/**
 * How far the contact pool is allowed to spread, as a multiplier on the DERIVED extent.
 *
 * ONE, AND THAT IS THE POINT — the falloff below is derived from each caster's own geometry
 * rather than dialled, so this exists to make a deliberate widening VISIBLE as a widening
 * rather than to hide it inside the derivation. If a pass ever raises it, that is an
 * appearance call and ADR-0392 D2 requires it recorded with its reason.
 */
export const CONTACT_SPREAD = 1;

/**
 * The fraction of the sky a vertical cylinder hides from a ground point at horizontal
 * distance `d` from its axis.
 *
 * DERIVED, NOT DIALLED, AND THE DERIVATION IS THE WHOLE DEFENCE. A tuned radial blob is
 * indistinguishable from this one in a still picture and impossible to argue with later; a
 * derived one prices itself against each prop's own size, which is precisely the property
 * the reference images have and a constant blob does not — a hero tree pools far more ground
 * than a shrub because it hides far more sky, not because someone chose a bigger number.
 *
 * Two independent factors, multiplied, because they are separable:
 *
 *   - AZIMUTH. Seen from distance `d`, a cylinder of radius `r` covers `2*asin(r/d)` of the
 *     full `2*PI` turn, i.e. a fraction `asin(r/d)/PI`. At the surface (`d = r`) that is 1/2:
 *     a cylinder you are touching hides half the horizon.
 *   - ELEVATION. From ground distance `s = d - r` off its flank, a cylinder of height `h`
 *     rises to elevation `atan(h/s)`. For DIFFUSE occlusion the cosine-weighted fraction of
 *     the hemisphere below elevation `t` is `sin^2(t)`, which is the standard result and not
 *     a choice made here.
 *
 * The product is doubled so that the contact limit is 1 rather than 1/2 — a point touching
 * the base of a tall prop is fully occluded on the side the prop is, which is the boundary
 * condition a reader's eye already expects.
 *
 * IT IS AN APPROXIMATION AND SAYING SO IS PART OF THE RECORD. A real hemispherical integral
 * would account for props occluding each other and for the ground's own curvature under the
 * relief; both are second-order against a single rung of a four-rung ladder, and neither
 * could change which side of the material's 0.5 threshold a sample lands on at the
 * distances this island works over.
 */
export function skyOcclusionAt(d: number, radius: number, height: number): number {
  const r = Math.max(radius, 1e-6);
  const h = Math.max(height, 0);
  if (h <= 0) return 0;
  if (d <= r) return 1;
  const azimuth = Math.asin(Math.min(1, r / d)) / Math.PI;
  const elevation = Math.atan(h / (d - r));
  const sky = Math.sin(elevation) ** 2;
  return Math.min(1, 2 * azimuth * sky);
}

/**
 * The ground distance at which a caster's occlusion falls to `threshold` — the pool's
 * visible EDGE, because the material thresholds the field rather than ramping it.
 *
 * Solved by bisection rather than in closed form: `skyOcclusionAt` is monotone decreasing in
 * `d` (both factors are), so a bisection is exact to the tolerance asked for, and the closed
 * form of `asin(r/d) * sin^2(atan(h/(d-r))) = c` is not worth the algebra or the reader's
 * time. It exists so the stamp below can bound its own rasterisation box instead of testing
 * every sample against every caster.
 */
export function contactReach(radius: number, height: number, threshold = 0.5): number {
  const r = Math.max(radius, 1e-6);
  if (skyOcclusionAt(r * 1.0001, r, height) < threshold) return r;
  let lo = r;
  let hi = r + Math.max(4, height) * 4;
  // Grow the bracket rather than assuming it: a very tall prop can reach past the guess, and
  // a bisection over a bracket that does not contain the root converges confidently to the
  // wrong answer.
  for (let i = 0; i < 40 && skyOcclusionAt(hi, r, height) >= threshold; i++) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (skyOcclusionAt(mid, r, height) >= threshold) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface ContactFieldOptions {
  /** Ground-space extent to cover — the SAME bounds the shadow field is built over, so the
   *  two grids can be merged index-for-index. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The upright props. Empty is legal and delivers an identically-zero field. */
  casters: readonly ShadowCaster[];
  gres?: number;
  /** Widen (or narrow) the derived pool. See {@link CONTACT_SPREAD}. */
  spread?: number;
}

/**
 * Build the contact field.
 *
 * A STAMP PER CASTER, bounded by {@link contactReach}, for exactly the reason
 * `buildShadowField`'s canopy term is a stamp: with 155 props over ~285k samples, testing
 * every sample against every caster is 44 million evaluations of an `asin` and an `atan`,
 * and the difference between that and the ~40 thousand a bounded stamp costs is whether the
 * evidence page renders in a second or in a minute.
 *
 * MAX RATHER THAN SUM where two pools overlap. A sum would drive the crowded middle of a
 * dense parcel to a solid slab of the occlusion rung — which is not what stacked occluders
 * do, and on a ONE-RUNG ladder the difference between 0.6 and 1.4 is invisible anyway, so a
 * sum would buy nothing and cost the shape.
 *
 * PADDED TO MATCH `buildShadowField` EXACTLY, including its `pad = 2`, because the merge
 * below is index-for-index and a field one texel off would slide every contact pool a third
 * of a ground unit away from the prop that casts it — which reads as a rendering bug and
 * would be chased as one.
 *
 * NO RELIEF ARGUMENT, DELIBERATELY, and this is the one asymmetry with `buildShadowField`
 * worth stating. That function needs the height field because a cast shadow's LENGTH depends
 * on the ground it lands on. A contact pool does not: it is a function of the occluder's own
 * footprint about its own foot, and every prop is already lifted onto the relief by the
 * caller, so the pool is centred on the land by construction. Taking a relief argument to
 * multiply nothing by it would look like rigour and be the opposite.
 */
export function buildContactField(opts: ContactFieldOptions): ShadowField {
  const gres = opts.gres ?? SHADOW_GRES;
  const pad = 2;
  const minX = opts.bounds.minX - pad;
  const minZ = opts.bounds.minZ - pad;
  const w = Math.max(1, Math.ceil((opts.bounds.maxX - opts.bounds.minX + pad * 2) * gres));
  const h = Math.max(1, Math.ceil((opts.bounds.maxZ - opts.bounds.minZ + pad * 2) * gres));
  const data = new Uint8Array(w * h);
  const spread = opts.spread ?? CONTACT_SPREAD;

  for (const c of opts.casters) {
    const reach = contactReach(c.radius, c.height) * spread;
    const i0 = Math.max(0, Math.floor((c.x - reach - minX) * gres));
    const i1 = Math.min(w - 1, Math.ceil((c.x + reach - minX) * gres));
    const j0 = Math.max(0, Math.floor((c.z - reach - minZ) * gres));
    const j1 = Math.min(h - 1, Math.ceil((c.z + reach - minZ) * gres));
    for (let j = j0; j <= j1; j++) {
      const gz = minZ + j / gres;
      for (let i = i0; i <= i1; i++) {
        const gx = minX + i / gres;
        const d = Math.hypot(gx - c.x, gz - c.z);
        if (d > reach) continue;
        // The spread divides the DISTANCE rather than multiplying the result, so widening a
        // pool moves its edge outward and leaves its contact value at 1 — scaling the value
        // instead would lift the whole field toward the threshold and turn a widening into a
        // brightening-then-darkening of everything at once.
        const occ = skyOcclusionAt(spread === 1 ? d : d / spread, c.radius, c.height);
        const v = Math.round(Math.min(1, occ) * 255);
        if (v > data[j * w + i]!) data[j * w + i] = v;
      }
    }
  }

  return { minX, minZ, w, h, gres, data };
}

/**
 * Combine two occlusion fields into one, taking the greater occlusion at every sample.
 *
 * MAX, NOT SUM, AND THE REASON IS THE LADDER RATHER THAN THE PHYSICS. The material has ONE
 * occlusion rung, so it thresholds; a sum and a max deliver identical pixels wherever either
 * term already passes the threshold, and differ only in how confidently they overshoot it.
 * Max is the form that stays correct if a second rung is ever authored, because the deepest
 * single occluder is a bound a reader can reason about and a sum of approximations is not.
 *
 * IT REFUSES ON A GRID MISMATCH rather than resampling. Two fields that disagree about their
 * origin or resolution cannot be merged into a meaningful third, and silently interpolating
 * one onto the other would put every contact pool a fraction of a unit away from its prop —
 * a defect that looks like a rendering artefact and gets chased as one.
 */
export function mergeOcclusion(a: ShadowField, b: ShadowField): ShadowField {
  if (a.w !== b.w || a.h !== b.h || a.gres !== b.gres || a.minX !== b.minX || a.minZ !== b.minZ) {
    throw new Error(
      'contact-shade: refusing to merge occlusion fields on different grids ' +
        `(${a.w}x${a.h}@${a.gres} from ${a.minX},${a.minZ} vs ` +
        `${b.w}x${b.h}@${b.gres} from ${b.minX},${b.minZ})`,
    );
  }
  const data = new Uint8Array(a.data.length);
  for (let p = 0; p < data.length; p++) data[p] = Math.max(a.data[p]!, b.data[p]!);
  return { minX: a.minX, minZ: a.minZ, w: a.w, h: a.h, gres: a.gres, data };
}

/** How much of the field is occluded past the material's own threshold. Same reasoning as
 *  `shadowCoverage`: measuring at any other threshold reports an effect the picture does not
 *  contain. */
export function contactCoverage(field: ShadowField, threshold = 0.5): number {
  let n = 0;
  for (let p = 0; p < field.data.length; p++) if (field.data[p]! / 255 > threshold) n++;
  return n / field.data.length;
}
