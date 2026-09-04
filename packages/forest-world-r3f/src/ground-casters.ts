// ground-casters.ts — WHAT STANDS ON THE SHIPPED MAP, AND HOW MUCH SKY IT HIDES. Pure,
// browser-free, node:test-provable: it maps the descriptor families `ForestWorldCanvas` draws
// onto the cylinder abstraction the occlusion field is built from.
//
// ⚠⚠ THE FINDING THIS MODULE WAS BUILT TO CARRY IS NOW HISTORY, AND IT IS KEPT BECAUSE THE ARC'S
// EVIDENCE PAGES QUOTE IT. Measured 2026-08-30: the semantic scene for one island emits 1,089
// objects that stand on the ground — 693 grass blades, 144 flora, 112 shrubs, 3 stems, 136
// tall-flower parts and ONE story tree — and the shipped mapper had a case for the tree and
// skipped the other 1,088, explicitly, as `{ kind: 'skipped' }` audit records. So the shipped map
// drew ONE object on 8,425 square units of land, and every shadow it could cast was that one
// tree's. `contact-shade.ts`'s ranking inverted here for that reason: contact darkening was ranked
// FIRST of ten mechanisms on the EXPERIMENT island, which stands 155 props, where 155 tight pools
// ARE most of what "placed rather than pasted" means, and one pool is not.
//
// ⚠⚠ THEN THE PROPS GREW (2026-09-03) AND THE TREE WENT (2026-09-04), in that order, and the
// present is the second half. The bought kit crossed on 2026-08-30 standing one object per
// capability plus one bloom per signature, and until 2026-09-03 every one of them cast NOTHING —
// `groundCasters` knew only the story tree and the cave portals, so the pools the field already
// carried were drawn under the placeholder tree alone while eleven pines and ten flowers floated.
// Every placement now contributes a caster ({@link placementCaster}) from the SAME placement list
// `KitProps` draws, computed once in the canvas before the ground is built, so the shadow and the
// object it belongs to cannot be two lists that agree today. The placeholder tree was then retired
// outright (ADR-0508) — each island stands a grove now — and its caster went with it in the same
// landing, because a shadow with nothing casting it is the misreport this module exists to
// prevent. The dark pool at every island's CENTRE in every frame on this arc up to that date was
// the placeholder's; there is no longer anything at an island's centre that casts one.
//
// ⚠ WHAT STILL CASTS FROM THE DESCRIPTOR STREAM IS THE CAVE PORTAL, AND {@link groundCasters}
// KEEPING ONE CASE IS NOT A FUNCTION WAITING TO BE INLINED. It is the one place that answers
// "which descriptor families meet the ground", and the two families it answers NO for — wisps and
// trails — are decisions with reasons, held below and by this module's own tests.

import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';
import type { GroundBounds, ShadowCaster } from './land-shadow.js';
import { propRadius, type KitPlacement, type RoleFootprints, type RoleHeights } from './kit-vocabulary.js';

/** The cave portal's mouth half-width — `CaveArch`'s own `hw`, which is the 2D prop's rule. */
export function caveMouthHalfWidth(cave: InstanceDescriptor): number {
  return ((cave.width ?? 4) * 1.6) / 2;
}

/**
 * The cave portal, as an occluder.
 *
 * ⚠ IT IS A FLAT VERTICAL DISC, so a cylinder over-states it across its own face — by at most the
 * mouth's half-width, which is 3.2 units at the authored default. It is included anyway because
 * it is an OBJECT THAT MEETS THE GROUND, which is exactly what the reference board says every
 * darkened contact in those images is; and because a portal that cast nothing while a tree cast
 * something would read as the portal floating.
 */
export function caveArchCaster(cave: InstanceDescriptor): ShadowCaster {
  const hw = caveMouthHalfWidth(cave);
  return { x: cave.transform.x, z: cave.transform.z, radius: hw, height: hw };
}

/**
 * Every caster in a descriptor set.
 *
 * ⚠ THE `story-tree` CASE IS GONE BECAUSE THE FAMILY IS (ADR-0508), not because the tree stopped
 * casting. `world-to-3d.ts` no longer emits a `story-tree` descriptor at all — a `tree` group
 * skips — so a branch for it here would be unreachable code standing in for an object that is not
 * on the map, and a test exercising it would be green over nothing.
 *
 * ⚠ WISPS ARE DELIBERATELY EXCLUDED, and not because they are small. A wisp is drawn 20 units
 * ABOVE the ground — it does not meet the land at all, so it has no contact to darken — and it is
 * the LIVE-WORK signal (ADR-0200 / ADR-0142): it appears when a session claims a capability and
 * vanishes when the session releases it. A shadow that came and went with a claim would be the
 * LAND appearing to change under work that never touched it, which is the one direction this
 * surface may not be wrong in.
 *
 * Trails are excluded for the plainer reason that the shipped trail is a `<Line>` floating 0.2
 * units above the ground and touches no geometry.
 */
export function groundCasters(descriptors: readonly Descriptor3D[]): ShadowCaster[] {
  const out: ShadowCaster[] = [];
  for (const d of descriptors) {
    if (d.kind === 'cave-arch') out.push(caveArchCaster(d));
  }
  return out;
}

/**
 * A KIT PLACEMENT, AS AN OCCLUDER: a cylinder of its role's half-footprint and its role's height,
 * both multiplied by the placement's own scale.
 *
 * ⚠ THE FROZEN TABLES, NOT THE LOADED KIT. The canvas builds its ground synchronously, before the
 * asset is parsed, so the radius is `KIT_FOOTPRINTS_2026_08_29`'s and the height
 * `KIT_HEIGHTS_2026_08_29`'s — the same numbers the placement was made against, held to the loaded
 * kit by `footprintDriftOf` / `heightDriftOf` where the kit is loaded. A caster read off the asset
 * would arrive after the field was already stamped.
 *
 * ⚠ THE SCALE REACHES BOTH DIMENSIONS. A grove pine at 0.6 of the role's height is 0.6 of its
 * width too — the kit scales uniformly — so a caster that shrank the height and kept the footprint
 * would throw a shadow wider than the crown that casts it, which is the mismatch that reads as a
 * rendering bug rather than as art.
 */
export function placementCaster(
  placement: KitPlacement,
  footprint: RoleFootprints,
  heights: RoleHeights,
): ShadowCaster {
  return {
    x: placement.at.x,
    z: placement.at.z,
    radius: propRadius(footprint, placement.role) * placement.scale,
    height: heights[placement.role] * placement.scale,
  };
}

/** Every placement's caster, in placement order — the list `ForestWorldCanvas` unions with
 *  {@link groundCasters} and hands to the ground. One caster per placement, none dropped: a
 *  placement without a caster is an object that floats. */
export function placementCasters(
  placements: readonly KitPlacement[],
  footprint: RoleFootprints,
  heights: RoleHeights,
): ShadowCaster[] {
  const out: ShadowCaster[] = [];
  for (const placement of placements) out.push(placementCaster(placement, footprint, heights));
  return out;
}

/**
 * The ground-space rect a parcel set covers — what the occlusion field is allocated over.
 *
 * Returns `null` for a set that bounds nothing, because a field over an empty rect is a texture
 * of zero or one texel that every fragment then samples: the caller has to decide not to build
 * one, and a silently degenerate rect is the shape that reads as "the shadow just is not
 * showing".
 */
export function groundBounds(cells: readonly InstanceDescriptor[]): GroundBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const cell of cells) {
    for (const p of cell.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  // ONE test rather than two joined by `||`. A parcel ring carries x and z together, so minX and
  // minZ are finite or infinite as a pair and the second clause could never fire on its own —
  // an unkillable mutant standing in for a case that cannot arise.
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ };
}
