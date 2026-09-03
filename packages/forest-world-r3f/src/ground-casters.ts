// ground-casters.ts — WHAT STANDS ON THE SHIPPED MAP, AND HOW MUCH SKY IT HIDES. Pure,
// browser-free, node:test-provable: it maps the descriptor families `ForestWorldCanvas` draws
// onto the cylinder abstraction the occlusion field is built from.
//
// ⚠⚠ THE FINDING THIS MODULE EXISTS TO CARRY — measured 2026-08-30, and it resizes what a shadow
// can do on this surface. The semantic scene for one island emits 1,089 objects that stand on the
// ground: 693 grass blades, 144 flora, 112 shrubs, 3 stems, 136 tall-flower parts and ONE story
// tree. The shipped mapper has a case for the tree and skips the other 1,088 — explicitly, as
// `{ kind: 'skipped' }` audit records, not by accident. So the shipped map draws ONE object on
// 8,425 square units of land, and every shadow it can cast is that one tree's.
//
// That is why `contact-shade.ts`'s ranking inverts here. Contact darkening was ranked FIRST of
// ten mechanisms separating the owner's references from our island — but it was ranked on the
// EXPERIMENT island, which stands 155 props, where 155 tight pools ARE most of what "placed
// rather than pasted" means. One pool is not. Both terms ship, because they merge into one
// texture and one rung and dropping either buys nothing; but the shadow this map can draw today
// is bounded by its own emptiness rather than by the field, and it will grow when the props do.
//
// ⚠⚠ AND THE PROPS DID GROW (2026-09-03), so the finding above is now history rather than the
// present. The bought kit crossed on 2026-08-30 and stood one object per capability plus one bloom
// per signature; until this landing every one of them cast NOTHING — `groundCasters` knew only the
// story tree and the cave portals, so the contact pools and cast shadows the field already carried
// were drawn under the placeholder tree alone while eleven pines and ten flowers floated. Every
// placement now contributes a caster ({@link placementCaster}) from the SAME placement list
// `KitProps` draws, computed once in the canvas before the ground is built, so the shadow and the
// object it belongs to cannot be two lists that agree today.
//
// ⚠ THE GEOMETRY CONSTANTS BELOW ARE THE MESHES' OWN. `ForestWorldCanvas` builds its story tree
// from them rather than from repeated literals, so a caster cannot come to disagree with the
// object it stands for — the same argument `bandGlsl` makes about the ladder, applied to a
// silhouette. A tree that grew and a shadow that did not would read as a rendering bug.

import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';
import type { GroundBounds, ShadowCaster } from './land-shadow.js';
import { propRadius, type KitPlacement, type RoleFootprints, type RoleHeights } from './kit-vocabulary.js';

/** The story tree's trunk: `cylinderGeometry(radiusTop, radiusBottom, height)`, standing on the
 *  descriptor's own y. */
export const STORY_TREE_TRUNK = { radiusTop: 1.2, radiusBottom: 1.6, height: 8 } as const;

/** The story tree's crown: `coneGeometry(radius, height, segments)`, centred `centreY` above the
 *  descriptor's own y — so it spans `centreY - height/2` to `centreY + height/2`. */
export const STORY_TREE_CROWN = { radius: 7, height: 14, segments: 8, centreY: 12 } as const;

/** How high the story tree reaches above the ground it stands on — the crown's tip. */
export function storyTreeTop(): number {
  return STORY_TREE_CROWN.centreY + STORY_TREE_CROWN.height / 2;
}

/**
 * The story tree, as an occluder.
 *
 * ⚠ THE CROWN'S RADIUS OVER ITS WHOLE HEIGHT, AND THE OVER-STATEMENT IS BOUNDED AND MEASURED.
 * `ShadowCaster` is a vertical cylinder; the crown is a CONE spanning y 5 to 19, so a cylinder of
 * its base radius casts shadow over a strip the cone does not — the ground within about 3.5 units
 * downwind of the trunk, where the cone's own shadow has not yet landed. Every square unit of
 * that strip lies inside the CONTACT pool, whose derived reach is 9.7 units from the same trunk,
 * so the delivered picture is identical and the merged field is the same field. Modelling the
 * taper instead would be arithmetic nobody could see.
 */
export function storyTreeCaster(tree: InstanceDescriptor): ShadowCaster {
  return {
    x: tree.transform.x,
    z: tree.transform.z,
    radius: STORY_TREE_CROWN.radius,
    height: storyTreeTop(),
  };
}

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
    if (d.kind === 'story-tree') out.push(storyTreeCaster(d));
    else if (d.kind === 'cave-arch') out.push(caveArchCaster(d));
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
