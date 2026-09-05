// land-per-capability.ts — THE ISLAND'S SIZE COMES FROM A DECLARED LAND-PER-CAPABILITY RATIO.
//
// The owner, 2026-09-05, on the one-tree-per-capability sheet: *"i want one tree per a capability,
// we need to scale the land size, can we build a ratio based on this as land should also scale per
// land size."* One tree per capability STANDS (ADR-0518 D1). What was wrong was the SIZE of the land
// under it: the island the 2D layout draws is `max(3, capabilities + 2)` hex tiles of `HEX_R = 27`
// (`apps/studio/src/components/TreeView.tsx`, `packages/forest-world/src/sizing.ts`), so island area
// already scales with capability count — through a constant nobody chose. On the fixture island it
// comes to ~2,240 units² of land per capability, and one tree standing on 2,240 units² is a tree
// adrift on a field. The picture he called nicer stood a tree on roughly 320.
//
// So the mapper sizes each island from a RATIO, per island, about the island's own centre
// (`scaleAboutIslands`, the same per-island affine seam ADR-0517 D1's footprint restoration uses):
//
//     island area  =  capabilities × LAND_AREA_PER_CAPABILITY
//
// exactly — the `+ 2` tile quota and the coast's lobing no longer leak into the size. The ratio's
// value is DERIVED from the two densities the owner has approved (see {@link LAND_AREA_PER_CAPABILITY})
// and laddered for his pick; the pick lands here and nowhere else.
//
// ⚠⚠ THE LAYOUT HOLDS STILL, AND THAT IS A MEASURED CONSEQUENCE, NOT A CHOICE MADE HERE. Each island
// scales about its own centre, so the forest's arrangement — the 2D layout's spacing — does not move;
// only each island's size does. Shrinking every island 2.6–4.4× linearly inside a fixed layout is the
// picture the increment's evidence sheet renders (`docs/research/chapter2-land-per-capability-*`),
// and whether the layout should compact with the islands is the OWNER'S layout question, escalated
// on `land-ground-stack-arc` rather than decided by a mapper constant. Compacting the layout on this
// side would be a second decision wearing this one's name.
//
// ⚠ THE TREES DO NOT SHRINK. The ratio is land per tree at the tree's SHIPPED size (`KIT_ROLE_SIZE`,
// picked for legibility at the overview zoom). Scaling the trees with the land would leave every
// picture identical up to the layout's gaps and answer nothing the owner asked. What DOES follow the
// island is every feature sized as a fraction of it — the beach band, the worn path, the noise
// lattices, the relief, the skirt — through {@link LAND_SCALE}, so a band tuned as a fraction of the
// 234-unit island stays that fraction of a 90-unit one.
//
// Pure: no React, no three — behind the provability firewall with `world-to-3d.ts`.

import { HEX_R } from '@storytree/forest-world';

import { scaleAboutIslands, type IslandCentre, type IslandScale } from './true-footprint.js';
import type { Descriptor3D, Transform3D } from './world-to-3d.js';

/** One hex tile's ground-plane area in the TRUE basis — a regular hexagon of circumradius `HEX_R`,
 *  `(3√3 / 2) · R²`. The unit every 2D island is built from, so the unit the old ratio hid in. */
export const HEX_TILE_AREA = ((3 * Math.sqrt(3)) / 2) * HEX_R * HEX_R;

/**
 * THE ISLAND EVERY GROUND-UNIT CONSTANT WAS TUNED ON: the harness fixture, thirteen hex tiles
 * carrying eleven capabilities (`harness/island-fixture.ts`, the shape `context-traversal-capture`
 * takes) — which is exactly the `capabilities + 2` quota the 2D layout gives an eleven-capability
 * story. Stated as tiles and capabilities rather than as an area so the arithmetic is visible.
 */
export const TUNED_FIXTURE = { tiles: 13, capabilities: 11 } as const;

/**
 * THE RATIO THE MAP INHERITED, on the fixture island: thirteen tiles over eleven capabilities, in
 * the true basis. ≈ 2,238.4 units² per capability. Every band, lattice and relief constant in this
 * package was judged on an island of this density, which is what {@link LAND_SCALE} is measured
 * against. (The delivered land reads a little smaller — the coast clip lobes the outline — and a
 * story with fewer capabilities inherits MORE per capability, since the `+ 2` is a larger share
 * of a smaller quota: a three-capability island gets 5/3 of this.)
 */
export const TUNED_LAND_AREA_PER_CAPABILITY = (HEX_TILE_AREA * TUNED_FIXTURE.tiles) / TUNED_FIXTURE.capabilities;

/**
 * THE LADDER, in ground units² of land per capability — rendered on the increment's sheet at both
 * zooms, one island and the forest, for the owner's pick. Its rungs are the increment's own, and
 * each carries its provenance:
 *
 *   318  the density of the arm the owner called nicer on 2026-09-05 (`today` on the
 *        one-tree-per-capability sheet): 72 trees — 11 capability trees and 61 grove pines — on
 *        the fixture island, ≈ 318 units² of delivered land per tree. ⚠ THE APPROVED CYCLES
 *        RENDER AGREES WITH IT once both are read in the same basis: `RECIPE_ISLAND_AREA` is
 *        24,631.8 units² in the true basis and the recipe stands thirteen stands of 4–8 pines
 *        (≈ 78), ≈ 316 per pine. `land-per-capability.test.ts` holds the two within a few percent.
 *   200  the midpoint rung between the two the increment names.
 *   108  the increment's reading of the recipe's density — `RECIPE_ISLAND_AREA` as it stood in the
 *        SQUASHED basis (8,424.6) over ~78 pines. It is the recipe density read through the
 *        drawing's 0.342 foreshortening, i.e. 2.9× too dense; it is rendered because the increment
 *        asked for it and because it is the boldest rung, not because it is a second approved density.
 *
 * ⚠ THE TREES' SIZE IS FIXED, so a rung is also a spacing: a tree every √K units — 17.8 at 318,
 * 14.1 at 200, 10.4 at 108 — against a pine 18 units tall and a tree clearance of ~10 units.
 */
export const LAND_AREA_PER_CAPABILITY_RUNGS = [318, 200, 108] as const;

/**
 * ⚠⚠ THE SHIPPED RATIO — the rung the map draws. PICKED ON THE LOOK (ADR-0489 D3, ADR-0503 D1),
 * from the ladder above rendered at both zooms on the RTX 2060
 * (`docs/research/chapter2-land-per-capability-2026-09-05/`). Its provenance is the ladder's: the
 * density of the picture the owner called nicer, which the approved render's own density agrees
 * with in the true basis. A constant with no provenance is how the old ratio drifted unchosen for
 * as long as it did; change this one on a rendered ladder, never by hand.
 */
export const LAND_AREA_PER_CAPABILITY = 318;

/**
 * THE LINEAR FACTOR EVERY ISLAND-RELATIVE CONSTANT FOLLOWS: how much smaller, edge to edge, the
 * shipped island is than the one the constants were tuned on — `√(shipped / tuned)`. A beach band,
 * a path width, a noise lattice or a relief amplitude authored in ground units against the tuned
 * island multiplies by this to stay the same FRACTION of the island it was judged as. It is one
 * global factor where the per-island factor varies a little (the `+ 2` quota), so a band is the
 * same absolute width on every island and a slightly larger fraction of a small story's.
 */
export const LAND_SCALE = Math.sqrt(LAND_AREA_PER_CAPABILITY / TUNED_LAND_AREA_PER_CAPABILITY);

/** A ground ring's area by the shoelace, absolute, in units². Fewer than three points is zero. */
export function ringArea(points: readonly Transform3D[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    twice += p.x * q.z - q.x * p.z;
  }
  return Math.abs(twice) / 2;
}

/** What an island's size is derived from: how many capabilities it holds and how much land it
 *  draws — the sum of its parcel rings' areas, which do not overlap. */
export interface IslandLand {
  island: string;
  /** Distinct capability parcels on this island — the `parcel` ids of its `cell-ground` cells. */
  capabilities: number;
  /** The island's drawn land, in ground units². */
  area: number;
}

/** Every island's capability count and drawn land, read off its `cell-ground` descriptors. An
 *  island with cells that name no parcel counts no capability from them. */
export function islandLand(descriptors: readonly Descriptor3D[]): Map<string, IslandLand> {
  const out = new Map<string, IslandLand>();
  const parcels = new Map<string, Set<string>>();
  for (const d of descriptors) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    const land = out.get(d.island) ?? { island: d.island, capabilities: 0, area: 0 };
    land.area += ringArea(d.points ?? []);
    if (d.parcel !== undefined) {
      const seen = parcels.get(d.island) ?? new Set<string>();
      seen.add(d.parcel);
      parcels.set(d.island, seen);
      land.capabilities = seen.size;
    }
    out.set(d.island, land);
  }
  return out;
}

/**
 * THE FACTOR ONE ISLAND SCALES BY, edge to edge: `√(capabilities × ratio / area)`, so that its
 * scaled area is exactly `capabilities × ratio`. An island holding no capability or drawing no land
 * has nothing to derive a size from and is left as drawn (factor 1) — the size is a reading of the
 * capability count, and where there is none there is no reading to draw.
 */
export function landRatioFactor(land: IslandLand, areaPerCapability: number): number {
  if (!Number.isFinite(areaPerCapability) || areaPerCapability <= 0) {
    throw new Error(`land-per-capability: the ratio must be a positive finite number of units² per capability, got ${areaPerCapability}`);
  }
  if (land.capabilities === 0 || land.area === 0) return 1;
  return Math.sqrt((land.capabilities * areaPerCapability) / land.area);
}

/**
 * SIZE EVERY ISLAND FROM THE RATIO: each island scaled isotropically about its own centre by
 * {@link landRatioFactor}, the whole stream — cells, blooms, caves, wisps, and the ribbons between
 * islands — through the same per-family rules the footprint restoration uses. The layout holds
 * still (see the header). Islands absent from the stream's `cell-ground` cells are untouched.
 */
export function sizeIslandsByCapability<T extends Descriptor3D>(
  descriptors: readonly T[],
  areaPerCapability: number = LAND_AREA_PER_CAPABILITY,
): T[] {
  const land = islandLand(descriptors);
  return scaleAboutIslands(descriptors, (island: string, _centre: IslandCentre): IslandScale => {
    // Every island the scale is asked about has ring vertices (`islandCentres` reads the same
    // cells), so it is in the land map.
    const f = landRatioFactor(land.get(island) as IslandLand, areaPerCapability);
    return { x: f, z: f };
  });
}
