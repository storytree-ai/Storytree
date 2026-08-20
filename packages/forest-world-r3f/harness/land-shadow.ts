// land-shadow.ts — THE SHADOW FIELD, in ground space. Pure, browser-free,
// node:test-provable; fenced into `harness/` with the rest of the experiment.
//
// WHAT THIS IS AND WHAT IT IS NOT. It computes, per ground sample, how much of the authored
// light is blocked — a scalar in [0, 1]. It names no colour, picks no rung and touches no
// palette. `shadow-ladder.ts` owns which rung a shadowed pixel lands on, and the closure
// argument stays exactly where it was: the material still emits `token x level`.
//
// WHY A GROUND-SPACE FIELD RATHER THAN A PER-VERTEX ATTRIBUTE, WHICH WAS THE FIRST IDEA.
// The ground mesh is a triangle FAN PER CELL — one vertex per cell corner plus a centroid,
// on cells whose measured mean pitch is 16.5 ground units. A per-vertex shadow attribute on
// that mesh can carry a feature no finer than a whole cell, and the shadows this island
// actually throws are 4.3 ground units at the median plant. The shadow would have been
// smeared across entire capabilities and would have looked like a lighting bug. The field is
// sampled in the FRAGMENT stage instead, so its resolution is set here and not by the mesh.
// This is also what the author-time compositor does (`shadow.py`'s `GRES`), which is a point
// in its favour rather than a coincidence.
//
// WHY NOT A SHADOW MAP. A depth-buffer shadow map is the general answer and the wrong one
// here: it needs a second render pass per panel, it resolves at the shadow camera's
// resolution rather than in ground units, and its bias artefacts (acne, peter-panning) are
// exactly the class of defect this arc keeps mistaking for an art problem. The land is a
// height field lit by ONE authored direction that cannot move (ADR-0380 D6 fence 4 — the
// projection does not move), so the analytic form is both cheaper and provable in a node
// test, which a depth buffer is not.

import { landGradient, landHeight, landHeightRange } from './land-definition.js';
import { LIGHT_DIRECTION } from './palette-band.js';

/** Ground-space sampling resolution, in samples per ground unit.
 *
 *  THREE, not the compositor's two, and the reason is the page rather than taste: the island
 *  evidence sheet renders panels at 8 px/unit as well as at the delivered 2, and a field
 *  coarser than the raster it feeds shows its own texels as a staircase along the shadow's
 *  edge — which reads as a defect in the shadow rather than in the sampling. Three samples
 *  per unit keeps the field finer than the delivered raster and within half a texel of the
 *  8 px/unit one. */
export const SHADOW_GRES = 3;

/** The soft edge, in ground units. `blender_tree.py:1948` gives the tree's shadow sun
 *  `angle = 26 deg` — *"soft edge: a hard contact rim is CG"* — and this is that decision
 *  carried across. It survives into the picture only as WHERE the edge falls, because the
 *  material has exactly one shadow rung and therefore thresholds this scalar; a penumbra
 *  needs rungs to be drawn in and there are none to spare. */
export const SHADOW_PENUMBRA = 1.2;

/** A caster: an upright cylinder standing on the land. Plants are the tall things on this
 *  island, so this is what a plant becomes. */
export interface ShadowCaster {
  /** Ground position (3D x, z — already unprojected by the caller). */
  x: number;
  z: number;
  /** Horizontal radius. */
  radius: number;
  /** Height above the land at its own foot. */
  height: number;
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
  /** Occlusion, 0..255, row-major. A byte because it is uploaded as an 8-bit texture and
   *  storing more precision than the transport carries would be a lie about the field. */
  data: Uint8Array;
}

/** Ground distance a caster of unit height throws its shadow — DERIVED from the authored
 *  light, never typed. `|L_ground| / L_y` = cot(light elevation). At the authored direction
 *  this is 0.695, so the median 6.2-unit plant casts 4.3 ground units. */
export function shadowOffsetPerUnitHeight(): number {
  const ground = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z);
  return ground / LIGHT_DIRECTION.y;
}

/** The unit ground vector a shadow is thrown ALONG — away from the light. */
export function shadowDirection(): { x: number; z: number } {
  const ground = Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z) || 1;
  return { x: -LIGHT_DIRECTION.x / ground, z: -LIGHT_DIRECTION.z / ground };
}

/** The longest shadow the LAND ALONE could throw at this relief amplitude: the field's whole
 *  peak-to-trough range, converted to ground distance. It BOUNDS the terrain march below, so
 *  the march can never be shortened into a false "nothing occludes this". It is a bound on
 *  the DISTANCE, and — see `terrainSelfShadows` — it is emphatically not a claim that any
 *  terrain shadow exists. */
export function maxTerrainCast(relief: number): number {
  return 2 * landHeightRange(relief) * shadowOffsetPerUnitHeight();
}

/** How steeply the authored light comes in: rise over run, i.e. `tan(elevation)`. At the
 *  authored direction the light sits 55.2 degrees above the horizon, so a ray climbs 1.44
 *  units for every ground unit it travels. */
export function lightSlope(): number {
  return LIGHT_DIRECTION.y / Math.hypot(LIGHT_DIRECTION.x, LIGHT_DIRECTION.z);
}

/** The steepest slope the relief field reaches, sampled over a patch several wavelengths
 *  wide. Sampled rather than solved: the field is a sum of three waves with incommensurate
 *  directions, so its true supremum has no closed form worth trusting, and a sample over
 *  many periods is both honest about that and tight enough to decide the comparison below. */
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
 * CAN THE LAND SHADOW ITSELF AT ALL? A height field self-shadows only where it is STEEPER
 * than the light, and this is that comparison.
 *
 * IT IS FALSE AT THE SHIPPED AMPLITUDE, AND THAT IS A FINDING RATHER THAN A DEFECT. The
 * authored light comes in at 55.2 degrees; the relief's steepest slope at the shipped
 * amplitude 2.2 is 24.4. So the terrain term is IDENTICALLY ZERO on the land as it ships —
 * not small, ZERO. Peak slope is linear in amplitude (0.207 per unit), so the amplitude it
 * would take to reach the light is about 7.0: more than three times what ships, and more
 * than twice the 3.2 the previous increment already rejected for churning the island's
 * silhouette and leaning the plants into the hills. On this land, at any amplitude this arc
 * will accept, THE SHADOW IS THE CANOPY — which sharpens the 2026-08-17 pass's "terrain cast
 * is small in absolute terms" into something a session can act on. The parcel bevel does not
 * rescue it either: its face is 36 degrees, also under the light.
 */
export function terrainSelfShadows(relief: number): boolean {
  return maxTerrainSlope(relief) > lightSlope();
}

export interface ShadowFieldOptions {
  /** Ground-space extent to cover. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Relief amplitude the land is wearing — 0 for a flat control. */
  relief: number;
  /** The upright casters. Empty is legal and means "the land shadows only itself". */
  casters: readonly ShadowCaster[];
  gres?: number;
  /** Include the land's cast onto itself. Separable so a panel can show the two terms
   *  apart, and so a test can assert each one alone. */
  terrain?: boolean;
  /** Include the casters' cast onto the land. */
  canopy?: boolean;
}

/**
 * Build the field.
 *
 * TWO TERMS, COMPUTED DIFFERENTLY BECAUSE THEY ARE DIFFERENT SHAPES.
 *
 * TERRAIN is a march: from each sample, step toward the light and ask whether the land ever
 * rises above the ray. That is O(samples x steps) and it is the only honest way to ask it of
 * a height field.
 *
 * CANOPY is a STAMP: a cylinder's shadow is a known shape — the swept disc from its foot to
 * where its tip lands — so each caster is rasterised into its own bounding box rather than
 * every sample being tested against every caster. With 171 plants over 285k samples the
 * march form would be 49 million caster tests; the stamp form is about 110 thousand.
 * Identical result, and the difference is whether the page renders in a second or a minute.
 */
export function buildShadowField(opts: ShadowFieldOptions): ShadowField {
  const gres = opts.gres ?? SHADOW_GRES;
  const pad = 2;
  const minX = opts.bounds.minX - pad;
  const minZ = opts.bounds.minZ - pad;
  const w = Math.max(1, Math.ceil((opts.bounds.maxX - opts.bounds.minX + pad * 2) * gres));
  const h = Math.max(1, Math.ceil((opts.bounds.maxZ - opts.bounds.minZ + pad * 2) * gres));
  const data = new Uint8Array(w * h);
  const relief = opts.relief;
  const dir = shadowDirection();
  const perUnit = shadowOffsetPerUnitHeight();
  const wantTerrain = opts.terrain !== false;
  const wantCanopy = opts.canopy !== false;

  // Sample height cache: the terrain march reads `landHeight` at the SAME grid points many
  // times over (once as an origin, then again as a tap from every sample behind it), and the
  // three-wave sum is the hot cost of building the field.
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      heights[j * w + i] = landHeight(minX + i / gres, minZ + j / gres, relief);
    }
  }
  const heightAt = (gx: number, gz: number): number => {
    const i = Math.round((gx - minX) * gres);
    const j = Math.round((gz - minZ) * gres);
    if (i < 0 || j < 0 || i >= w || j >= h) return landHeight(gx, gz, relief);
    return heights[j * w + i]!;
  };

  if (wantTerrain && relief > 0) {
    const reach = maxTerrainCast(relief);
    const step = 1 / gres;
    // TOWARD the light — the opposite of `shadowDirection`, and getting this backwards
    // produces a picture that is lit and shaded in exactly the wrong places while looking
    // entirely plausible, which is why the sign is derived from one place.
    const tx = -dir.x;
    const tz = -dir.z;
    for (let j = 0; j < h; j++) {
      const gz = minZ + j / gres;
      for (let i = 0; i < w; i++) {
        const gx = minX + i / gres;
        const y0 = heights[j * w + i]!;
        let occ = 0;
        for (let d = step; d <= reach; d += step) {
          const rayY = y0 + d / perUnit;
          const excess = heightAt(gx + tx * d, gz + tz * d) - rayY;
          if (excess > 0) {
            // Soft in the EXCESS rather than in distance: a ridge that clears the ray by a
            // hair should not deliver the same shadow as one that clears it by a metre.
            const s = Math.min(1, excess / 0.5);
            if (s > occ) occ = s;
            if (occ >= 1) break;
          }
        }
        if (occ > 0) data[j * w + i] = Math.round(occ * 255);
      }
    }
  }

  if (wantCanopy) {
    for (const c of opts.casters) {
      const baseY = landHeight(c.x, c.z, relief);
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
          // Decompose the offset from the caster's foot into "along the shadow" and
          // "across" it.
          const ox = gx - c.x;
          const oz = gz - c.z;
          const along = ox * dir.x + oz * dir.z;
          if (along < 0) continue; // toward the light: in front of the caster, never shadowed
          const across = Math.abs(ox * dir.z - oz * dir.x);
          if (across > rr) continue;
          // The ray from this sample toward the light reaches the caster's AXIS at this
          // height above the caster's foot. Occluded iff that is inside the cylinder.
          const rayAboveFoot = heights[j * w + i]! - baseY + along / perUnit;
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
  }

  return { minX, minZ, w, h, gres, data };
}

/** Sample the field at a ground point, bilinearly, as 0..1. The GPU does this in hardware;
 *  this is the same read for a node test, and having both means a test can assert about the
 *  values the shader will actually see. */
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

/** How much of the field is in shadow, as a fraction of samples past the material's own
 *  threshold. The material thresholds at 0.5 (one rung, so the decision is binary), and
 *  measuring the coverage at any OTHER threshold would report a shadow the picture does not
 *  contain. */
export function shadowCoverage(field: ShadowField, threshold = 0.5): number {
  let n = 0;
  for (let p = 0; p < field.data.length; p++) if (field.data[p]! / 255 > threshold) n++;
  return n / field.data.length;
}
