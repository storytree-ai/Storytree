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
// ⚠ TWO ENTRY POINTS, AND THE DIFFERENCE IS WHAT STANDS — each one is a LAYER of the map's
// dressing, kept as its own function so a comparison page can render the map as it drew before any
// given landing rather than describing it.
//
//   dressMapFromKit    the vocabulary alone — one object per capability, one bloom per signature.
//                      What every comparison that ASKS about the vocabulary reads.
//   dressMapWithCover  + each healthy island's GROUND COVER — the recipe's bushes, tufts and
//                      flower patches (`cover-dressing.ts`). ⚠ THIS IS WHAT THE CANVAS STANDS.
//
// ⚠⚠ THERE WAS A THIRD, AND ITS ABSENCE IS THE DECISION. `dressMapWithGroves` stood each healthy
// island's grove between the two — thirteen stands of dressing pines per recipe-island of area,
// what the canvas stood from 2026-09-03 — and ADR-0518 retired the role outright on 2026-09-05:
// the owner read the grove as capabilities, and a tree on the map now means exactly one. No layer
// here places a `tree`. The comparison page that shows the map as it shipped until that landing
// composes its control from `harness/grove-history.ts`, outside `src/`, and nothing on the
// shipped path can reach it.
//
// Every layer is placed island by island for the same reason the blooms are — against that
// island's own ground — and the cover is placed AFTER the vocabulary, so a bush is scattered around
// the tree that reports a capability and never the other way about.

import { COVER_DENSITY, COVER_SIZE, dressCover } from './cover-dressing.js';
import { RECIPE_ISLAND_AREA, islandExclusion } from './dressing-ground.js';
import { capabilityFactsFrom, dressIslandFromKit, type KitPlacement, type RoleFootprints } from './kit-vocabulary.js';
import { cellsByIsland, parcelCellsFrom, type LayoutCell } from './parcel-cells.js';
import type { Descriptor3D } from './world-to-3d.js';

export interface MapDressingOptions {
  /** The relief amplitude the ground is built at, so props sit ON the land rather than through it. */
  relief: number;
  /** The ground width each role occupies, measured off the LOADED kit (`roleFootprints`). */
  footprint: RoleFootprints;
  /** Which rung of `COVER_DENSITY_RUNGS` a healthy island's ground cover is COUNTED at. Omitted is
   *  the shipped pick (`COVER_DENSITY`); the one-tree-per-capability page's ladder arms are what
   *  pass it, and {@link dressMapFromKit} — which grows no cover at all — ignores it. */
  coverDensity?: number;
  /** Which rung of `COVER_SIZE_RUNGS` a healthy island's ground cover is DRAWN at. Omitted is the
   *  shipped pick (`COVER_SIZE`); the cover comparison page's ladder arms are what pass it.
   *
   *  ⚠ TWO KNOBS ON ONE LAYER, laddered on two different pages and never together: size was
   *  laddered first (2026-09-04) with the count held at the recipe's own, because the literal port
   *  was near-invisible for a SCALE reason — 432 props moving 743 px past 20/255 where the canopy
   *  moved 194,440 — and the count is laddered now (ADR-0518 D2) at the settled size, because with
   *  the grove gone the cover is what carries the island. Each page varies exactly one. */
  coverSize?: number;
  /** The recipe island's area the cover counts are stated per (`cover-dressing.ts`'s
   *  `recipeIslandArea`). Omitted is the shipped `RECIPE_ISLAND_AREA`. An INSTRUMENT'S option, for
   *  a comparison page's control arm standing the map at a PREVIOUS island size (the
   *  land-per-capability page's `today`, 2026-09-05); {@link dressMapFromKit} ignores it. */
  recipeIslandArea?: number;
}

// ⚠ THERE IS NO `seed` HERE, AND ITS ABSENCE IS DELIBERATE. `dressIslandFromKit` carries its own
// default and every island is dressed with it, which is not a clone: the candidate points a
// placement chooses between are sampled from the island's OWN cells, so two islands with the same
// seed and different ground place differently. A pass-through nobody calls would be speculative
// API AND an untestable branch — `check:mutation-diff` reads `opts.seed !== undefined ? {…, seed} :
// {…}` as unkillable, because passing `seed: undefined` and omitting it behave identically.
//
// ⚠ `recipeIslandArea` IS BACK, AND FOR THE SAME REASON IT LEFT. It was threaded through both
// layers for ONE caller — the footprint page's control arm, reproducing the map in the squashed
// basis it shipped in before ADR-0517 — and went with that page, because an option with no caller
// is a default `??` nothing can flip. The land-per-capability ratio (2026-09-05) moved the basis
// again, so the page that ladders it stands its control at the previous basis through this option;
// `map-dressing.test.ts` flips the default, so the `??` is killable.

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
 * EVERY PROP THE VOCABULARY STANDS, island by island — one tree per capability, one bloom per
 * signed criterion, and nothing else.
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
  return dressMap(descriptors, opts, false);
}

/**
 * EVERYTHING THE SHIPPED MAP STANDS — {@link dressMapFromKit} and then, on every island whose
 * every cell is healthy, that island's GROUND COVER (`cover-dressing.ts`): the recipe's bushes,
 * grass tufts and flower patches, scattered over the island against the exclusion read off the
 * same descriptor stream (`islandExclusion`: the clipped coast's beach band, the trail docks' worn
 * paths). **This is what the canvas calls**; the function above is what a comparison page's
 * vocabulary arm calls.
 *
 * ⚠ THE ORDER IS PART OF THE PLACEMENT, exactly as it is for the blooms: capabilities, then the
 * island's signatures, then its cover — so a bush is scattered around everything that reports
 * something, and never the other way about. Cover keeps no clearance (`clearanceFactor` returns
 * zero for it, which is the recipe's own rule), so the ORDER is what carries the relationship
 * rather than an occupancy: the things that report are placed first and are therefore placed on
 * the ground they would have had with no cover at all. Adding or removing the cover pass cannot
 * move a single tree.
 */
export function dressMapWithCover(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
): KitPlacement[] {
  return dressMap(descriptors, opts, true);
}

function dressMap(
  descriptors: readonly Descriptor3D[],
  opts: MapDressingOptions,
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
    out.push(...dress(group, signed.get(island) ?? 0));
    if (!cover) continue;
    out.push(
      ...dressCover({
        island,
        cells: group,
        relief: opts.relief,
        // ⚠ ONE EXCLUSION PER ISLAND, read off the same stream the ground is built from. It
        // carries a `shoreField` and a `wearField` over the island's whole ground — the expensive
        // part of dressing a map — and it is built here rather than inside `dressCover` so the
        // layer stays provable with an INJECTED exclusion (`cover-dressing.test.ts`).
        exclusion: islandExclusion(descriptors, island),
        density: opts.coverDensity ?? COVER_DENSITY,
        size: opts.coverSize ?? COVER_SIZE,
        recipeIslandArea: opts.recipeIslandArea ?? RECIPE_ISLAND_AREA,
      }),
    );
  }

  // ⚠ CALLED UNCONDITIONALLY, EVEN WHEN THERE IS NOTHING TO DRESS. An `if (unattributed.length)`
  // guard reads as thrift and is a branch no test can kill: dressing an empty cell set names no
  // capability and places no bloom, so it appends nothing and the two paths are indistinguishable.
  // ⚠ AND NO COVER: a cell the substrate could not attribute belongs to no STORY, so there is no
  // story status for it to be healthy IN — the same fail-closed rule the blooms already follow.
  out.push(
    ...dress(
      cells.filter((c) => c.island === undefined),
      0,
    ),
  );

  return out;
}
