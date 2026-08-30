// land-shadow.ts — THE CAST SHADOW, as a ground-space field. Pure, browser-free,
// node:test-provable — it imports only the relief field and the authored light.
//
// ⚠ IT LIVES IN `src/` BECAUSE IT HAS CROSSED (2026-08-30). It was the shipping half of
// `harness/land-shadow.ts` until then, fenced out of the public mirror because adoption is a
// separate and deliberate event (ADR-0380 D6 / ADR-0406 D2). The owner authorised it on
// 2026-08-29 — "i'm still hoping for future iterations to improve the ground texture and add
// shadows" — and asked for shadows again by name. `harness/land-shadow.ts` RE-EXPORTS every
// symbol below rather than keeping a copy.
//
// WHAT THIS IS AND WHAT IT IS NOT. It computes, per ground sample, how much of the authored
// light is blocked — a scalar in [0, 1]. It names no colour, picks no rung and touches no
// palette. `shadow-rung.ts` owns which rung a shadowed pixel lands on, and the closure argument
// is untouched: the material still emits `token x level`.
//
// WHY A GROUND-SPACE FIELD RATHER THAN A PER-VERTEX ATTRIBUTE, which was the first idea and is
// a decision already made and measured. The shipped ground is a triangle fan per parcel on
// parcels whose measured mean diameter is 16.57 ground units; the shadow this island throws is
// about 13 units long. A per-vertex attribute on that mesh carries no feature finer than a whole
// parcel, so the shadow would be smeared across entire capabilities and would read as a lighting
// bug. The field is sampled in the FRAGMENT stage instead, so its resolution is set here rather
// than by the mesh. The author-time compositor does the same thing (`shadow.py`'s `GRES`).
//
// WHY NOT A SHADOW MAP. A depth-buffer shadow map is the general answer and the wrong one here:
// it needs a second render pass, it resolves at the shadow camera's resolution rather than in
// ground units, and its bias artefacts (acne, peter-panning) are the class of defect this arc
// keeps mistaking for an art problem. The land is a height field lit by ONE authored direction
// that cannot move (ADR-0380 D6 fence 4 — the projection does not move), so the analytic form is
// both cheaper and provable in a node test, which a depth buffer is not.
//
// ⚠⚠ THE TERRAIN TERM DID NOT CROSS, AND THAT IS A MEASUREMENT RATHER THAN A TRIM. A height
// field self-shadows only where it is STEEPER than the light. The authored light climbs 1.438
// units per ground unit; the shipped relief's steepest slope at its amplitude of 2.2 is 0.455.
// So the terrain term is IDENTICALLY ZERO on the land as it ships — not small, zero — and
// crossing an O(samples x steps) march to add nothing would be payload wearing the clothes of
// rigour. {@link terrainSelfShadows} is what says so, {@link assertTerrainDoesNotSelfShadow} is
// the fence that fails loudly if the amplitude ever rises past it, and the march itself stays in
// `harness/land-shadow.ts` where the experiment's own amplitudes can still exercise it.

import { landGradient, landHeight, landHeightRange, LAND_RELIEF_AMPLITUDE } from './land-relief.js';
import { LIGHT_DIRECTION } from './shade-ladder.js';

/** Ground-space sampling resolution, in samples per ground unit.
 *
 *  THREE, not the author-time compositor's two, and the reason is the raster rather than taste:
 *  the evidence pages render at 8 delivered px per ground unit as well as at the overview's 2,
 *  and a field coarser than the raster it feeds shows its own texels as a staircase along the
 *  shadow's edge — which reads as a defect in the shadow rather than in the sampling. */
export const SHADOW_GRES = 3;

/** The soft edge, in ground units. `blender_tree.py:1948` gives the tree's shadow sun
 *  `angle = 26 deg` — *"soft edge: a hard contact rim is CG"* — and this is that decision carried
 *  across. It survives into the picture only as WHERE the edge falls, because the material has
 *  exactly one shadow rung and therefore thresholds this scalar; a penumbra needs rungs to be
 *  drawn in and there are none to spare. */
export const SHADOW_PENUMBRA = 1.2;

/** The largest texture edge the occlusion field may be uploaded at.
 *
 *  ⚠ IT EXISTS BECAUSE THE FIELD IS ALLOCATED OVER THE GROUND'S BOUNDS, NOT THE ISLAND'S AREA,
 *  and the shipped canvas draws whatever descriptors it is handed. One island is 234 x 46 units
 *  and costs 107 KB at {@link SHADOW_GRES}; a forest of thirty-five islands spread over a
 *  thousand units square would cost 36 MB of the visitor's memory for a field that is empty
 *  almost everywhere. Clamping the RESOLUTION rather than refusing keeps the shadow correct and
 *  merely coarser on a scene nobody has drawn yet, which is the failure a reader can see. */
export const SHADOW_TEXTURE_MAX = 2048;

/** How far outside the ground's own bounds the field extends, in ground units. A shadow leans
 *  away from the light and a contact pool spreads, so a field clipped to the land itself would
 *  cut both off at the coast; two units is past the reach of either at this island's scale. */
export const OCCLUSION_PAD = 2;

/** A caster: an upright cylinder standing on the land. The tall things on the shipped map are
 *  story trees and cave arches, so this is what one of those becomes. */
export interface ShadowCaster {
  /** Ground position (3D x, z). */
  x: number;
  z: number;
  /** Horizontal radius. */
  radius: number;
  /** Height above the land at its own foot. */
  height: number;
}

export interface GroundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ShadowField {
  /** Ground coordinate of sample (0, 0). */
  minX: number;
  minZ: number;
  /** Samples across and down. */
  w: number;
  h: number;
  /** Samples per ground unit. */
  gres: number;
  /** Occlusion, 0..255, row-major. A byte because it is uploaded as an 8-bit texture and storing
   *  more precision than the transport carries would be a lie about the field. */
  data: Uint8Array;
}

/** Ground distance a caster of unit height throws its shadow — DERIVED from the authored light,
 *  never typed. `|L_ground| / L_y` = cot(the light's elevation). At the authored direction this
 *  is 0.695, so a 19-unit story tree casts 13.2 ground units. */
export function shadowOffsetPerUnitHeight(): number {
  return Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z) / LIGHT_DIRECTION.y;
}

export interface ShadowDirectionResult {
  x: number;
  z: number;
}

/** The unit ground vector a shadow is thrown ALONG — away from the light. Derived in ONE place
 *  because getting the sign backwards produces a picture that is lit and shaded in exactly the
 *  wrong places while looking entirely plausible. */
export function shadowDirection(): ShadowDirectionResult {
  const ground = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z) || 1;
  return { x: -LIGHT_DIRECTION.x / ground, z: -LIGHT_DIRECTION.z / ground };
}

/** How steeply the authored light comes in: rise over run, i.e. `tan(elevation)`. At the authored
 *  direction the light sits 55.2 degrees above the horizon, so a ray climbs 1.44 units for every
 *  ground unit it travels. */
export function lightSlope(): number {
  return LIGHT_DIRECTION.y / Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z);
}

/** The longest shadow the LAND ALONE could throw at this relief amplitude: the field's whole
 *  peak-to-trough range converted to ground distance. It BOUNDS a terrain march, so the march can
 *  never be shortened into a false "nothing occludes this" — and it is emphatically not a claim
 *  that any terrain shadow exists. See {@link terrainSelfShadows}. */
export function maxTerrainCast(relief: number): number {
  return 2 * landHeightRange(relief) * shadowOffsetPerUnitHeight();
}

/** The steepest slope the relief field reaches, sampled over a patch several wavelengths wide.
 *  Sampled rather than solved: the field is a sum of waves with incommensurate directions, so its
 *  true supremum has no closed form worth trusting, and a sample over many periods is both honest
 *  about that and tight enough to decide the comparison below. */
export function maxTerrainSlope(relief: number, span = 200, step = 0.5): number {
  let peak = 0;
  for (let x = -span / 2; x <= span / 2; x += step) {
    for (let z = -span / 2; z <= span / 2; z += step) {
      const g = landGradient(x, z, relief);
      const m = Math.hypot(g.dx, g.dz);
      if (m > peak) peak = m;
    }
  }
  return peak;
}

/**
 * CAN THE LAND SHADOW ITSELF AT ALL? A height field self-shadows only where it is STEEPER than
 * the light, and this is that comparison.
 *
 * IT IS FALSE AT THE SHIPPED AMPLITUDE, AND THAT IS THE FINDING THIS MODULE RESTS ON. The
 * authored light comes in at 55.2 degrees; the relief's steepest slope at the shipped amplitude
 * of 2.2 is 24.4. Peak slope is linear in amplitude, so the amplitude it would take to reach the
 * light is about 7.0 — more than three times what ships. On this land, at any amplitude this arc
 * will accept, THE SHADOW IS THE CANOPY.
 */
export function terrainSelfShadows(relief: number): boolean {
  return maxTerrainSlope(relief) > lightSlope();
}

/**
 * The fence that keeps the omission above honest as the land changes.
 *
 * ⚠ IT IS A THROW RATHER THAN A COMMENT because the omission is invisible in the picture: a land
 * steep enough to shadow itself, drawn by a field that models only canopies, is simply a land
 * whose ridges are lit on both sides. Nobody looking at it would know a term was missing, and the
 * amplitude is one constant away from moving.
 */
export function assertTerrainDoesNotSelfShadow(relief: number = LAND_RELIEF_AMPLITUDE): void {
  if (terrainSelfShadows(relief)) {
    throw new Error(
      `land-shadow: the relief at amplitude ${relief} is steeper than the authored light ` +
        `(${maxTerrainSlope(relief).toFixed(3)} > ${lightSlope().toFixed(3)}), so the land now ` +
        'shadows itself and the canopy stamp alone is no longer the whole field. The terrain ' +
        'march lives in harness/land-shadow.ts and would have to cross before this amplitude ships.',
    );
  }
}

/** The allocation every occlusion field over one scene shares.
 *
 *  ⚠ ONE FUNCTION RATHER THAN THE SAME FOUR LINES IN TWO MODULES, because the cast field and the
 *  contact field are merged INDEX FOR INDEX. A field one texel off would slide every contact pool
 *  a third of a ground unit away from the prop that casts it — a defect that looks like a
 *  rendering artefact and gets chased as one. */
export interface OcclusionGrid {
  minX: number;
  minZ: number;
  w: number;
  h: number;
  gres: number;
}

/** The samples-per-unit a field over these bounds may actually use — {@link SHADOW_GRES} unless
 *  that would exceed {@link SHADOW_TEXTURE_MAX} on either edge. */
export function occlusionGres(
  bounds: GroundBounds,
  gres: number = SHADOW_GRES,
  max: number = SHADOW_TEXTURE_MAX,
): number {
  const spanX = bounds.maxX - bounds.minX + OCCLUSION_PAD * 2;
  const spanZ = bounds.maxZ - bounds.minZ + OCCLUSION_PAD * 2;
  const widest = Math.max(spanX, spanZ, 1e-6);
  return Math.min(gres, max / widest);
}

export function occlusionGrid(bounds: GroundBounds, gres: number = SHADOW_GRES): OcclusionGrid {
  const g = occlusionGres(bounds, gres);
  return {
    minX: bounds.minX - OCCLUSION_PAD,
    minZ: bounds.minZ - OCCLUSION_PAD,
    w: Math.max(1, Math.ceil((bounds.maxX - bounds.minX + OCCLUSION_PAD * 2) * g)),
    h: Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ + OCCLUSION_PAD * 2) * g)),
    gres: g,
  };
}

/** An empty field over a grid — what a scene with no casters delivers, and the base every stamp
 *  writes into. */
export function emptyField(grid: OcclusionGrid): ShadowField {
  return {
    minX: grid.minX,
    minZ: grid.minZ,
    w: grid.w,
    h: grid.h,
    gres: grid.gres,
    data: new Uint8Array(grid.w * grid.h),
  };
}

export interface CanopyShadowOptions {
  /** Ground-space extent to cover. */
  bounds: GroundBounds;
  /** Relief amplitude the land is wearing — 0 for a flat control. */
  relief: number;
  /** The upright casters. Empty is legal and delivers an identically-zero field. */
  casters: readonly ShadowCaster[];
  gres?: number;
}

/**
 * Stamp every caster's cast shadow into one field.
 *
 * A STAMP RATHER THAN A MARCH, and the difference is whether an evidence page renders in a second
 * or in a minute: a cylinder's shadow is a KNOWN shape — the swept disc from its foot to where
 * its tip lands — so each caster is rasterised into its own bounding box instead of every sample
 * being tested against every caster. The result is identical.
 */
export function buildCanopyShadowField(opts: CanopyShadowOptions): ShadowField {
  const grid = occlusionGrid(opts.bounds, opts.gres ?? SHADOW_GRES);
  const field = emptyField(grid);
  const { minX, minZ, w, h, gres } = grid;
  const data = field.data;
  const dir = shadowDirection();
  const perUnit = shadowOffsetPerUnitHeight();

  for (const c of opts.casters) {
    const baseY = landHeight(c.x, c.z, opts.relief);
    const reach = c.height * perUnit;
    const rr = c.radius + SHADOW_PENUMBRA;
    const tipX = c.x + dir.x * reach;
    const tipZ = c.z + dir.z * reach;
    const i0 = Math.max(0, Math.floor((Math.min(c.x, tipX) - rr - minX) * gres));
    const i1 = Math.min(w - 1, Math.ceil((Math.max(c.x, tipX) + rr - minX) * gres));
    const j0 = Math.max(0, Math.floor((Math.min(c.z, tipZ) - rr - minZ) * gres));
    const j1 = Math.min(h - 1, Math.ceil((Math.max(c.z, tipZ) + rr - minZ) * gres));
    for (let j = j0; j <= j1; j++) {
      const gz = minZ + j / gres;
      for (let i = i0; i <= i1; i++) {
        const gx = minX + i / gres;
        // Decompose the offset from the caster's foot into "along the shadow" and "across" it.
        const ox = gx - c.x;
        const oz = gz - c.z;
        const along = ox * dir.x + oz * dir.z;
        if (along < 0) continue; // toward the light: in front of the caster, never shadowed
        const across = Math.abs(ox * dir.z - oz * dir.x);
        if (across > rr) continue;
        // The ray from this sample toward the light reaches the caster's AXIS at this height
        // above the caster's foot. Occluded iff that is inside the cylinder.
        const rayAboveFoot = landHeight(gx, gz, opts.relief) - baseY + along / perUnit;
        if (rayAboveFoot < 0 || rayAboveFoot > c.height) continue;
        const soft =
          across <= c.radius - SHADOW_PENUMBRA
            ? 1
            : Math.max(0, Math.min(1, (rr - across) / (2 * SHADOW_PENUMBRA)));
        const v = Math.round(soft * 255);
        if (v > data[j * w + i]!) data[j * w + i] = v;
      }
    }
  }

  return field;
}

/** Sample the field at a ground point, bilinearly, as 0..1. The GPU does this in hardware; this
 *  is the same read for a node test, and having both means a test can assert about the values the
 *  shader will actually see. */
export function sampleShadowField(field: ShadowField, x: number, z: number): number {
  const fx = (x - field.minX) * field.gres;
  const fz = (z - field.minZ) * field.gres;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fz);
  const tx = fx - i0;
  const tz = fz - j0;
  const at = (i: number, j: number): number => {
    const ci = Math.max(0, Math.min(field.w - 1, i));
    const cj = Math.max(0, Math.min(field.h - 1, j));
    return field.data[cj * field.w + ci]! / 255;
  };
  const a = at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx;
  const b = at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx;
  return a * (1 - tz) + b * tz;
}

/** How much of the field is occluded past the material's own threshold. The material thresholds
 *  at 0.5 (one rung, so the decision is binary), and measuring the coverage at any OTHER
 *  threshold would report a shadow the picture does not contain. */
export function shadowCoverage(field: ShadowField, threshold = 0.5): number {
  let n = 0;
  for (let p = 0; p < field.data.length; p++) if (field.data[p]! / 255 > threshold) n++;
  return n / field.data.length;
}
