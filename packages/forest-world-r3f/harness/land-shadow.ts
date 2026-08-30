// land-shadow.ts — THE SHADOW FIELD: the crossed half RE-EXPORTED, plus the one term that did
// NOT cross.
//
// ⚠ THE CANOPY STAMP AND EVERYTHING AROUND IT CROSSED into `src/land-shadow.ts` on 2026-08-30 —
// the caster and field types, the authored light's own derivations, the sampling, the coverage,
// and the shared grid every occlusion field over one scene is allocated on. The shipped ground
// wears them, so a copy here would be two modules free to drift; `harness/scope-fence.test.ts`'s
// ADOPTED ledger holds both halves. The reasoning behind each of those — why the field is
// ground-space rather than per-vertex, why it is analytic rather than a depth-buffer shadow map,
// why the stamp is a stamp — moved with the code and is unabridged in its new home.
//
// ⚠⚠ WHAT STAYED IS THE TERRAIN MARCH, AND IT STAYED FOR A MEASUREMENT RATHER THAN FOR A FENCE.
// A height field self-shadows only where it is STEEPER than the light. The authored light climbs
// 1.438 units per ground unit; the shipped relief's steepest slope at its amplitude of 2.2 is
// 0.455, so on the land as it ships the terrain term is IDENTICALLY ZERO — not small, zero. The
// amplitude it would take to reach the light is about 7.0, more than three times what ships and
// more than twice the 3.2 an earlier increment already rejected for churning the island's
// silhouette. Crossing an O(samples x steps) march to contribute nothing to every shipped frame
// would be payload wearing the clothes of rigour, so the march lives here, where the experiment's
// own amplitudes can still exercise it, and `src/land-shadow.ts` carries
// `assertTerrainDoesNotSelfShadow` as the fence that fails loudly if the shipped amplitude ever
// rises past the light.

import { landHeight } from './land-definition.js';
import {
  buildCanopyShadowField,
  emptyField,
  maxTerrainCast,
  occlusionGrid,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  SHADOW_GRES,
  type GroundBounds,
  type ShadowCaster,
  type ShadowField,
} from '../src/land-shadow.js';
import { mergeOcclusion } from '../src/contact-shade.js';

export {
  OCCLUSION_PAD,
  SHADOW_GRES,
  SHADOW_PENUMBRA,
  SHADOW_TEXTURE_MAX,
  assertTerrainDoesNotSelfShadow,
  buildCanopyShadowField,
  emptyField,
  lightSlope,
  maxTerrainCast,
  maxTerrainSlope,
  occlusionGres,
  occlusionGrid,
  sampleShadowField,
  shadowCoverage,
  shadowDirection,
  shadowOffsetPerUnitHeight,
  terrainSelfShadows,
  type CanopyShadowOptions,
  type GroundBounds,
  type OcclusionGrid,
  type ShadowCaster,
  type ShadowDirectionResult,
  type ShadowField,
} from '../src/land-shadow.js';

export interface ShadowFieldOptions {
  /** Ground-space extent to cover. */
  bounds: GroundBounds;
  /** Relief amplitude the land is wearing — 0 for a flat control. */
  relief: number;
  /** The upright casters. Empty is legal and means "the land shadows only itself". */
  casters: readonly ShadowCaster[];
  gres?: number;
  /** Include the land's cast onto itself. Separable so a panel can show the two terms apart, and
   *  so a test can assert each one alone. */
  terrain?: boolean;
  /** Include the casters' cast onto the land. */
  canopy?: boolean;
}

/**
 * The land's cast onto ITSELF — a march, because that is the only honest way to ask a height
 * field whether it occludes a point: step toward the light and ask whether the land ever rises
 * above the ray.
 *
 * It is zero at every amplitude the shipped land will wear, which is why it did not cross. The
 * experiment can still ask for it.
 */
export function buildTerrainShadowField(
  bounds: GroundBounds,
  relief: number,
  gres: number = SHADOW_GRES,
): ShadowField {
  const grid = occlusionGrid(bounds, gres);
  const field = emptyField(grid);
  const { minX, minZ, w, h } = grid;
  const g = grid.gres;
  const data = field.data;
  if (relief <= 0) return field;

  // Sample height cache: the march reads `landHeight` at the SAME grid points many times over
  // (once as an origin, then again as a tap from every sample behind it), and the wave sum is the
  // hot cost of building the field.
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      heights[j * w + i] = landHeight(minX + i / g, minZ + j / g, relief);
    }
  }
  const heightAt = (gx: number, gz: number): number => {
    const i = Math.round((gx - minX) * g);
    const j = Math.round((gz - minZ) * g);
    if (i < 0 || j < 0 || i >= w || j >= h) return landHeight(gx, gz, relief);
    return heights[j * w + i]!;
  };

  const dir = shadowDirection();
  const perUnit = shadowOffsetPerUnitHeight();
  const reach = maxTerrainCast(relief);
  const step = 1 / g;
  // TOWARD the light — the opposite of `shadowDirection`, and getting this backwards produces a
  // picture that is lit and shaded in exactly the wrong places while looking entirely plausible,
  // which is why the sign is derived from one place.
  const tx = -dir.x;
  const tz = -dir.z;
  for (let j = 0; j < h; j++) {
    const gz = minZ + j / g;
    for (let i = 0; i < w; i++) {
      const gx = minX + i / g;
      const y0 = heights[j * w + i]!;
      let occ = 0;
      for (let d = step; d <= reach; d += step) {
        const rayY = y0 + d / perUnit;
        const excess = heightAt(gx + tx * d, gz + tz * d) - rayY;
        if (excess > 0) {
          // Soft in the EXCESS rather than in distance: a ridge that clears the ray by a hair
          // should not deliver the same shadow as one that clears it by a metre.
          const s = Math.min(1, excess / 0.5);
          if (s > occ) occ = s;
          if (occ >= 1) break;
        }
      }
      if (occ > 0) data[j * w + i] = Math.round(occ * 255);
    }
  }
  return field;
}

/**
 * Build the field: the terrain term and the canopy term, merged.
 *
 * ⚠ THE TWO TERMS ARE NOW BUILT SEPARATELY AND MERGED WITH `mergeOcclusion`, where they used to
 * be written into one array with a running max. The delivered field is IDENTICAL — a max over two
 * arrays is a max — and the shape is what lets the canopy half cross while the march stays here.
 */
export function buildShadowField(opts: ShadowFieldOptions): ShadowField {
  const gres = opts.gres ?? SHADOW_GRES;
  const wantTerrain = opts.terrain !== false;
  const wantCanopy = opts.canopy !== false;
  const terrain = wantTerrain
    ? buildTerrainShadowField(opts.bounds, opts.relief, gres)
    : emptyField(occlusionGrid(opts.bounds, gres));
  const canopy = wantCanopy
    ? buildCanopyShadowField({
        bounds: opts.bounds,
        relief: opts.relief,
        casters: opts.casters,
        gres,
      })
    : emptyField(occlusionGrid(opts.bounds, gres));
  return mergeOcclusion(terrain, canopy);
}
