// map-dressing.ts — DRESS THE WHOLE MAP, ONE ISLAND AT A TIME, off the shipped descriptor stream.
//
// ⚠⚠ WHY THIS EXISTS, AND IT IS A MISREPORT GUARD RATHER THAN A FEATURE. `dressIslandFromKit` is
// named for what it dresses: ONE island. Until this module existed, `ForestWorldCanvas` handed it
// every `cell-ground` descriptor on the map in a single call — which is exactly right while the
// map holds one island and quietly wrong the moment it holds two. A capability's tree survives
// that, because it is placed from its own parcel's cells; a story's UAT BLOOM does not, because a
// bloom belongs to the whole ISLAND and is scattered over every cell it is given. One call for the
// whole map therefore scatters one story's signed criteria across every other story's island: the
// map asserting a signature on work nobody signed, which is ADR-0392 D5 / ADR-0398 D7's exact
// failure mode and worse than drawing nothing.
//
// That is why both shipped call sites passed `blooms: 0` with a comment saying so, and why closing
// it needed `InstanceDescriptor.island` first. The count is now real, and it is spent per island.
//
// ⚠ THE ACCEPTANCE QUESTION HERE IS A COUNT, NOT A PICTURE. The defect this module prevents is
// INVISIBLE: a perfectly ordinary-looking island wearing the wrong story's flowers. So the tests
// assert attribution — every bloom on an island belongs to a story that island represents, and the
// map's total equals the number of criteria the scene actually signs — on a fixture with MORE THAN
// ONE story, because a single-story fixture is satisfied by a dressing that ignores attribution
// entirely.
//
// ⚠ AND EACH ISLAND IS DRESSED IN ITS OWN CALL, so its props are placed against its own occupancy
// and nothing else. An island therefore looks the same alone as it does in a crowd of thirty-five
// — a property the whole-map call did not have and could not have had.
//
// ⚠ THREE ENTRY POINTS, AND THE DIFFERENCE IS WHAT STANDS — each one is a LAYER of the map's
// dressing, kept as its own function so a comparison page can render the map as it drew before any
// given landing rather than describing it.
//
//   dressMapFromKit    the vocabulary alone — one object per capability, one bloom per signature.
//                      What every comparison that ASKS about the vocabulary reads.
//   dressMapWithGroves + each healthy island's grove, grown against what the vocabulary stood
//                      (`grove-dressing.ts`). What the canvas stood from 2026-09-03.
//   dressMapWithCover  + each healthy island's GROUND COVER — the recipe's bushes, tufts and
//                      flower patches (`cover-dressing.ts`). ⚠ THIS IS WHAT THE CANVAS STANDS.
//
// Every layer is placed island by island for the same reason the blooms are — against that
// island's own ground — and each is placed AFTER the layer before it, so a grove pine is placed
// around the capability's tree and a bush around both, never the other way about.

import { COVER_DENSITY, dressCover } from './cover-dressing.js';
import { GROVE_DENSITY, dressGroves, islandExclusion, type GroveExclusion } from './grove-dressing.js';
import { capabilityFactsFrom, dressIslandFromKit, type KitPlacement, type RoleFootprints } from './kit-vocabulary.js';
import { cellsByIsland, parcelCellsFrom, type LayoutCell } from './parcel-cells.js';
import type { Descriptor3D } from './world-to-3d.js';

export interface MapDressingOptions {
  /** The relief amplitude the ground is built at, so props sit ON the land rather than through it. */
  relief: number;
  /** The ground width each role occupies, measured off the LOADED kit (`roleFootprints`). */
  footprint: RoleFootprints;
  /** Which rung of `GROVE_DENSITY_RUNGS` a healthy island's grove grows at. Omitted is the shipped
   *  pick (`GROVE_DENSITY`); the canopy comparison page's ladder arms are what pass it, and
   *  {@link dressMapFromKit} — which grows no grove at all — ignores it. */
  density?: number;
  /** Which rung of `COVER_DENSITY_RUNGS` a healthy island's ground cover is scattered at. Omitted
   *  is the shipped pick (`COVER_DENSITY`); the cover comparison page's ladder arms are what pass
   *  it, and every entry point but {@link dressMapWithCover} ignores it.
   *
   *  ⚠ A SECOND KNOB RATHER THAN A SHARED ONE, because the two layers are two looks: the grove's
   *  rung was picked against the recipe's 52–104 pines per island and the cover's against a
   *  different picture entirely, and one number for both would mean a scale-back on either could
   *  only be bought by scaling back the other. */
  coverDensity?: number;
}

// ⚠ THERE IS NO `seed` HERE, AND ITS ABSENCE IS DELIBERATE. `dressIslandFromKit` carries its own
// default and every island is dressed with it, which is not a clone: the candidate points a
// placement chooses between are sampled from the island's OWN cells, so two islands with the same
// seed and different ground place differently. A pass-through nobody calls would be speculative
// API AND an untestable branch — `check:mutation-diff` reads `opts.seed !== undefined ? {…, seed} :
// {…}` as unkillable, because passing `seed: undefined` and omitting it behave identically.

/**
 * HOW MANY UAT CRITERIA EACH STORY HAS SIGNED, read off the map's own descriptors.
 *
 * One `uat-bloom` descriptor is one signed criterion (the mapper emits them only for
 * `tall-flower-proven`), so this is a count of what the scene ALREADY asserts rather than a second
 * opinion about proof state. The map cannot come to disagree with itself about how many signatures
 * a story holds, because there is only one source.
 *
 * ⚠ A BLOOM WITH NO ISLAND IS DROPPED, and the direction of that failure is the point. An
 * unattributed signature is one that could be drawn on any island; refusing to count it means such
 * a story grows no flowers, never that every story grows its neighbour's.
 *
 * ⚠ DEDUPED ON THE CRITERION ID, so a scene that emitted a criterion twice counts it once. Blooms
 * carrying no id are counted individually — an unstamped marker is still a distinct marker, and
 * folding them all onto one absent key would under-report a scene the core simply did not stamp.
 */
export function signedCriteriaByIsland(descriptors: readonly Descriptor3D[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  const unnamed = new Map<string, number>();
  for (const d of descriptors) {
    if (d.kind !== 'uat-bloom') continue;
    const island = d.island;
    if (island === undefined) continue;
    if (d.criterion === undefined) {
      unnamed.set(island, (unnamed.get(island) ?? 0) + 1);
      continue;
    }
    const ids = seen.get(island);
    if (ids) ids.add(d.criterion);
    else seen.set(island, new Set([d.criterion]));
  }
  const out = new Map<string, number>();
  for (const [island, ids] of seen) out.set(island, ids.size);
  for (const [island, n] of unnamed) out.set(island, (out.get(island) ?? 0) + n);
  return out;
}

/**
 * EVERY PROP THE SHIPPED MAP STANDS, island by island.
 *
 * The order is first-seen island order, then the cells the substrate could not attribute — which
 * are dressed LAST and with NO blooms. Keeping them rather than dropping them is
 * {@link parcelCellsFrom}'s rule carried one level up: a substrate with no island groups at all
 * (the classic extruded-hex island, a hand-built fragment) still names its capabilities, and those
 * capabilities still own trees. What such cells may never grow is a per-STORY claim, because there
 * is no story to attribute it to.
 */
export function dressMapFromKit(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
): KitPlacement[] {
  return dressMap(descriptors, opts, null, false);
}

/**
 * EVERY PROP THE SHIPPED MAP STANDS, GROVES INCLUDED — {@link dressMapFromKit} and then, on every
 * island whose every cell is healthy, that island's grove against what the vocabulary already
 * stood there. The canvas calls this; the exclusion each island's grove honours is read off the
 * same descriptor stream (`islandExclusion`: the clipped coast, the trail docks' worn paths).
 *
 * ⚠ THE ORDER IS PART OF THE PLACEMENT, exactly as it is for the blooms: capabilities, then the
 * island's signatures, then its grove — so a grove member is placed around the tree that reports
 * a capability rather than that tree around a grove.
 */
export function dressMapWithGroves(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
): KitPlacement[] {
  return dressMap(descriptors, opts, islandExclusion, false);
}

/**
 * EVERYTHING THE SHIPPED MAP STANDS — {@link dressMapWithGroves} and then, on every island that
 * grew a grove, that island's GROUND COVER (`cover-dressing.ts`): the recipe's bushes, grass tufts
 * and flower patches, scattered over the same island against the same exclusion. **This is what
 * the canvas calls**; the two functions above are what a comparison page's earlier arms call, so
 * an arm can still show the map as it drew before this landing.
 *
 * ⚠ THE ORDER IS PART OF THE PLACEMENT, one level further than the grove took it: capabilities,
 * then the island's signatures, then its grove, then its cover — so a bush is scattered around
 * everything that reports something, and never the other way about. Cover keeps no clearance
 * (`clearanceFactor` returns zero for it, which is the recipe's own rule), so the ORDER is what
 * carries the relationship rather than an occupancy: the things that report are placed first and
 * are therefore placed on the ground they would have had with no cover at all. Adding or removing
 * the cover pass cannot move a single tree.
 */
export function dressMapWithCover(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
): KitPlacement[] {
  return dressMap(descriptors, opts, islandExclusion, true);
}

/** How an island's grove learns where it may not stand — `null` grows no grove at all. */
type ExclusionFor = (descriptors: readonly Descriptor3D[], island: string) => GroveExclusion;

function dressMap(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
  exclusionFor: ExclusionFor | null,
  cover: boolean,
): KitPlacement[] {
  const cells = parcelCellsFrom(descriptors);
  const signed = signedCriteriaByIsland(descriptors);
  const out: KitPlacement[] = [];

  const dress = (group: readonly LayoutCell[], blooms: number): KitPlacement[] =>
    dressIslandFromKit({
      cells: group,
      facts: capabilityFactsFrom(group),
      blooms,
      relief: opts.relief,
      footprint: opts.footprint,
    });

  for (const [island, group] of cellsByIsland(cells)) {
    const standing = dress(group, signed.get(island) ?? 0);
    out.push(...standing);
    if (exclusionFor === null) continue;
    // ⚠ ONE EXCLUSION PER ISLAND, BUILT ONCE AND HANDED TO BOTH PASSES. It carries a `shoreField`
    // and a `wearField` over the island's whole ground — the expensive part of dressing a map —
    // and two calls would be two fields the grove and the cover could come to disagree through.
    const exclusion = exclusionFor(descriptors, island);
    out.push(
      ...dressGroves({
        island,
        cells: group,
        standing,
        footprint: opts.footprint,
        relief: opts.relief,
        exclusion,
        density: opts.density ?? GROVE_DENSITY,
      }),
    );
    if (!cover) continue;
    out.push(
      ...dressCover({
        island,
        cells: group,
        relief: opts.relief,
        exclusion,
        density: opts.coverDensity ?? COVER_DENSITY,
      }),
    );
  }

  // ⚠ CALLED UNCONDITIONALLY, EVEN WHEN THERE IS NOTHING TO DRESS. An `if (unattributed.length)`
  // guard reads as thrift and is a branch no test can kill: dressing an empty cell set names no
  // capability and places no bloom, so it appends nothing and the two paths are indistinguishable.
  // ⚠ AND NO GROVE: a cell the substrate could not attribute belongs to no STORY, so there is no
  // story status for it to be healthy IN — the same fail-closed rule the blooms already follow.
  out.push(
    ...dress(
      cells.filter((c) => c.island === undefined),
      0,
    ),
  );

  return out;
}
