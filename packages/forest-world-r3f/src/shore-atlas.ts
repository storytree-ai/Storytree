// shore-atlas.ts — THE DISTANCE-TO-COAST FIELD, PACKED OVER THE ISLANDS AND DELIVERED TO THE
// FRAGMENT STAGE. Layer 2's carrier, and layer 3's after it.
//
// ⚠⚠ IT IS A GROUND-SPACE TEXTURE AND NOT A VERTEX ATTRIBUTE, WHICH IS ADR-0490 D4 AND NOT A
// PREFERENCE. In `build_land.py` the shore value is a per-vertex attribute on a 0.55-unit grid.
// The shipped mesh's ground vertices lie either exactly ON the coast or >= 8.66 units inland —
// about 16x coarser than the feature — so a vertex attribute is smeared away entirely between
// them: the sand band would be a linear ramp across a parcel rather than a band along the water.
// Sampled per fragment from a field at {@link SHADOW_GRES} = 3 samples per ground unit, the
// delivered spacing is 0.33 units, which is FINER than the 0.55 Blender authored against. So the
// mechanism is not an approximation of the recipe here; it is the recipe at better resolution.
//
// ⚠⚠ IT RIDES THE OCCLUSION ATLAS'S OWN TILES, AND THAT IS THE WHOLE DESIGN. The mesh already
// carries one `atlasOrigin` attribute and the material already carries one `uShadowAtlasScale`;
// a second packing would need a second attribute and a second scale, and the two would have to
// AGREE about where each island's tile sits. This module takes the built occlusion field and
// reads its `tiles` — so the agreement is structural rather than two computations that happen to
// match today. When it broke, every island would read another island's stretch of coast and wear
// a sand band belonging to the wrong shape of land, which is the failure `shadow-atlas.ts`
// already records paying for once.
//
// ⚠ WHY A SECOND TEXTURE RATHER THAN A SECOND CHANNEL OF THE FIRST. The occlusion atlas is
// `RedFormat` / `UnsignedByteType` — one byte per texel. Widening it to two channels would double
// the payload of a texture every committed shadow figure was measured against and would put this
// layer's bytes on the shadow's ledger. A second single-channel texture over the same tiles keeps
// the shadow path BYTE-IDENTICAL, which is the claim the whole banded-ground line of work rests
// on, and costs one sampler and one fetch.

import {
  SHADOW_GRES,
  indices,
  type ShadowField,
} from './land-shadow.js';
import { blitTile, type AtlasField, type AtlasTile } from './shadow-atlas.js';
import { AUTHORED_SHORE_WIDTH, shoreField } from './shore-fall.js';
import type { InstanceDescriptor } from './world-to-3d.js';

/**
 * HOW FAR INLAND THE FIELD IS RESOLVED, in ground units — and it is DERIVED from the recipe's own
 * arithmetic rather than chosen.
 *
 * `build_land.py:880` divides the shore value by `BEACH + 0.9`, and `:878` puts the sand ramp's
 * upper stop at 0.70 — so the largest shore distance that can still change a delivered pixel is
 * `0.70 * (BEACH + 0.9)`, about 2.8 units. Past that every fragment is pure grass whatever the
 * exact distance is.
 *
 * ⚠ THE FIELD IS BUILT TO THE FULL DIVISOR, NOT TO THAT PRODUCT, and the margin is load-bearing:
 * the recipe adds a 0..1 noise to the distance BEFORE dividing (`:872-876`), so a fragment at 2.8
 * units can still be pushed under the ramp's top by the noise. Capping at 2.8 would clip the very
 * break-up the noise exists to create, and it would do it invisibly — as a sand line that goes
 * subtly straight exactly where the noise was trying hardest.
 *
 * ⚠ AND `ShoreSample.distance` IS CAPPED AT THE FIELD'S WIDTH, so this constant is what the cap
 * is; it is not merely how far we bothered to look.
 */
export const SAND_FIELD_WIDTH = AUTHORED_SHORE_WIDTH + 0.9;

/**
 * THE BYTE ENCODING — `distance / SAND_FIELD_WIDTH`, clamped, over 0..255.
 *
 * ⚠ THE QUANTISER IS NOT THE RESOLUTION LIMIT AND IT IS WORTH SAYING SO. A byte over 4.0 units is
 * 0.0157 units per step, while the field's own spacing is 0.33 — twenty times coarser. So the
 * transport carries more precision than the field has, which is the right way round: the reverse
 * (storing more precision than the transport carries) is the lie `ShadowField` names in its own
 * comment.
 */
export function encodeShore(distance: number): number {
  const t = Math.max(0, Math.min(1, distance / SAND_FIELD_WIDTH));
  return Math.round(t * 255);
}

/** The inverse, for the pure twin of the shader — so a test can state what a fragment reads
 *  without a GPU, through the same rounding the texture actually carries. */
export function decodeShore(byte: number): number {
  return (byte / 255) * SAND_FIELD_WIDTH;
}

/**
 * ONE TILE'S SHORE FIELD — the same grid `buildGroundOcclusion` produces for the same tile, so
 * {@link blitTile}'s size refusal is a real check rather than one that can never fire.
 *
 * ⚠ THE SAMPLE POINT IS THE TEXEL'S OWN CORNER, `minX + i / gres`, which is what
 * `occlusionGrid` uses. A half-texel offset here would shift the whole sand band by an eighth of
 * a unit against the shadows on the same island — small, systematic, and attributable to nothing.
 */
export function shoreTileField(
  reader: { sample(x: number, z: number): { distance: number } },
  tile: AtlasTile,
  gres: number,
): ShadowField {
  const data = new Uint8Array(tile.w * tile.h);
  for (const j of indices(tile.h)) {
    const z = tile.bounds.minZ + j / gres;
    for (const i of indices(tile.w)) {
      data[j * tile.w + i] = encodeShore(reader.sample(tile.bounds.minX + i / gres, z).distance);
    }
  }
  return { minX: tile.bounds.minX, minZ: tile.bounds.minZ, w: tile.w, h: tile.h, gres, data };
}

/**
 * THE WHOLE MAP'S SHORE FIELD, over the occlusion atlas's own tiles.
 *
 * ⚠⚠ IT TAKES THE BUILT OCCLUSION FIELD RATHER THAN RE-PACKING, which is what makes "the two
 * atlases agree about where each island is" true by construction. See the header.
 *
 * ⚠ AND IT READS THE CLIPPED DESCRIPTORS, for the reason `shoreField` states at length: after
 * `clipToCoast` the boundary of the mesh IS the coast, so the distance to the mesh's rim is the
 * distance to the water. Handed the pre-clip parcels it would measure to the hex silhouette and
 * lay the sand a beach's width inland of the sea.
 */
export function buildAtlasShore(
  cells: readonly InstanceDescriptor[],
  occlusion: AtlasField,
): AtlasField {
  const reader = shoreField(cells, SAND_FIELD_WIDTH);
  const data = new Uint8Array(occlusion.w * occlusion.h);
  // ⚠ THE ATLAS STARTS FULL, NOT EMPTY. Zero encodes distance ZERO — the waterline — so an
  // untouched texel would read as "this fragment is exactly on the coast" and deliver pure sand.
  // Every gap between tiles, and every island whose tile the loop somehow missed, would come out
  // as a sand-coloured rectangle. 255 is "far inland", i.e. pure grass: the value that makes an
  // unwritten texel deliver what the ground drew before this layer existed.
  data.fill(255);

  for (const tile of occlusion.tiles) {
    blitTile(data, occlusion.w, tile, shoreTileField(reader, tile, occlusion.gres));
  }

  return {
    w: occlusion.w,
    h: occlusion.h,
    gres: occlusion.gres,
    data,
    tiles: occlusion.tiles,
    // No caster is assigned here — the shore is a property of the land's own shape, not of
    // anything standing on it. Stated rather than omitted so the shared shape reads honestly.
    unassigned: 0,
  };
}

/** The field's own spacing in ground units, for the evidence sheet — the number the "finer than
 *  Blender's 0.55" claim is made of, derived rather than repeated. */
export function shoreSampleSpacing(gres: number = SHADOW_GRES): number {
  return 1 / gres;
}
