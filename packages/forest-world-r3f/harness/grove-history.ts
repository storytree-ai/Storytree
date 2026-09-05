// grove-history.ts — THE RETIRED GROVE, kept ONLY so a comparison page can draw the map as it
// shipped until 2026-09-05. Harness-only: nothing in `src/` imports it, nothing on the shipped
// path can reach it, and it is not behind a flag — it is a control arm.
//
// ⚠⚠ WHAT THIS IS. Until ADR-0518 every healthy island stood a GROVE beside its capability trees:
// thirteen stands of dressing pines per recipe-island of area (`build_land.py`'s `scatter()`),
// four to eight members each, gaussian-spread around a centre, every one the `tree` role's own
// green pine at 0.55–0.80 of the role's height, wearing the `capId` `'grove'` and no tint. ADR-0507
// D2 admitted it; the form-and-size guarantee (the capability's own tree is always tallest on its
// parcel) held in the geometry and failed against the owner, who read the grove as capabilities:
// *"1 tree per a capability it needs to look good not like a forest"*. `src/grove-dressing.ts` was
// deleted in that landing and `src/map-dressing.ts` grows no third layer.
//
// ⚠⚠ WHY IT STILL EXISTS HERE. The sheet that landing owes the owner (ADR-0507 D7, ADR-0518 D2)
// shows the map AS IT SHIPPED — grove and all — beside the map as it ships now, both built on THIS
// run against THIS tree, because a committed frame from hours earlier is not a picture of what
// ships (`comparison-baseline-moves-under-the-page`). That control cannot be rendered without the
// placement, so the placement lives here, verbatim from the deleted module, named as history.
// `shipped-per-capability-scene.ts`'s control arm is its one caller.
//
// ⚠ IT IS NOT A SECOND SHIPPED PATH AND MUST NOT BECOME ONE. The day this file is imported from
// `src/`, `scope-fence.test.ts` reds; the day a page calls it for anything but a "before" arm, the
// page is lying about what ships. When the "before" picture stops being worth a sheet, delete this
// file with its page — the evidence directories keep the frames.

import { RECIPE_ISLAND_AREA, cellAt, cellsBounds, cellsArea, dressingEligible, type DressingExclusion, type Stream } from '../src/dressing-ground.js';
import { islandSeed } from '../src/island-path.js';
import {
  KIT_ROLE_ASSEMBLIES,
  bestCandidate,
  candidatePoints,
  propRadius,
  propStream,
  worstClearance,
  type KitAssembly,
  type KitPlacement,
  type Occupancy,
  type RoleFootprints,
} from '../src/kit-vocabulary.js';
import { landHeight } from '../src/land-relief.js';
import { indices } from '../src/land-shadow.js';
import type { GPoint, LayoutCell } from '../src/parcel-cells.js';

/** The `capId` a grove member wore — the one `capId` that named no unit of work. */
export const GROVE_HISTORY_CAP_ID = 'grove';

export function isGroveHistoryPlacement(p: KitPlacement): boolean {
  return p.capId === GROVE_HISTORY_CAP_ID;
}

/** The recipe's thirteen stands per recipe-island of area (`build_land.py:1036`). */
export const RECIPE_STANDS = 13;
/** The recipe's island aspect, depth over width — the stand's spread was scaled by the island's
 *  aspect against it. */
export const RECIPE_ISLAND_ASPECT = 135.1 / 233.8;
/** The stand's gaussian spread, `gauss(3.6, 3.0)` (`build_land.py:1064`). */
export const GROVE_SIGMA_X = 3.6;
export const GROVE_SIGMA_Z = 3.0;
/** Members per stand, `randint(4, 8)`. */
export const GROVE_MEMBERS_MIN = 4;
export const GROVE_MEMBERS_MAX = 8;
/** A member's scale against the tree role — the retired band ADR-0507 D2 rested on. */
export const GROVE_SCALE_MIN = 0.55;
export const GROVE_SCALE_MAX = 0.8;
/** Draws per member before the member is dropped (`for _try in range(30)`). */
export const GROVE_MEMBER_TRIES = 30;
/** Candidates a stand's centre is chosen among. */
export const STAND_CANDIDATES = 96;
/** The one declared relaxation of the occupancy rule: two grove members could stand at this
 *  fraction of the sum of their footprints. It went with the grove. */
export const GROVE_CLEARANCE = 0.45;
/** The rung the map stood when ADR-0518 retired the grove — rung 1 since the true footprint
 *  (ADR-0517), rung 2 on the squashed island before it. */
export const GROVE_HISTORY_DENSITY = 1;

/** How many stands an island grew — the recipe's thirteen, in proportion to area, times the rung. */
export function groveStandCount(cells: readonly LayoutCell[], density: number = GROVE_HISTORY_DENSITY): number {
  const stands = Math.round((RECIPE_STANDS * density * cellsArea(cells)) / RECIPE_ISLAND_AREA);
  const box = cellsBounds(cells);
  const ceiling = Math.round((RECIPE_STANDS * 3 * (box.maxX - box.minX) * (box.maxZ - box.minZ)) / RECIPE_ISLAND_AREA);
  if (!Number.isFinite(stands) || stands > ceiling) {
    throw new Error(`grove-history: ${stands} stands asked for on an island whose bounding box could ask for at most ${ceiling}`);
  }
  return stands;
}

/** The stand's spread along each axis of the placement basis. */
export interface GroveSigma {
  x: number;
  z: number;
}

/** The stand's spread in this basis: σx as authored, σz scaled by the island's aspect against the
 *  recipe's — on the true footprint the fixture island IS the recipe's aspect, so 3.0. */
export function groveSigma(cells: readonly LayoutCell[]): GroveSigma {
  const { minX, maxX, minZ, maxZ } = cellsBounds(cells);
  const width = maxX - minX;
  const aspect = width > 0 ? (maxZ - minZ) / width : RECIPE_ISLAND_ASPECT;
  return { x: GROVE_SIGMA_X, z: (GROVE_SIGMA_Z * aspect) / RECIPE_ISLAND_ASPECT };
}

/** A standard normal draw by Box–Muller, two uniforms per draw. */
export function gaussian(rand: Stream): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface GroveOccupant extends Occupancy {
  grove: boolean;
}

/** What a grove member of `radius` had to keep from an occupant: the full sum against anything
 *  that reports, `GROVE_CLEARANCE` of it against another grove member. */
export function groveNeed(radius: number, o: GroveOccupant): number {
  return (radius + o.radius) * (o.grove ? GROVE_CLEARANCE : 1);
}

export interface GroveHistoryOptions {
  island: string;
  cells: readonly LayoutCell[];
  /** What already stands on this island — the capability trees and the blooms, at full clearance. */
  standing: readonly KitPlacement[];
  footprint: RoleFootprints;
  relief: number;
  exclusion: DressingExclusion;
  density?: number;
}

/**
 * GROW THE ISLAND'S GROVE AS IT GREW UNTIL 2026-09-05 — the deleted `dressGroves`, verbatim in
 * its draws and its rules: thirteen stands per recipe-island of area, four to eight live pines
 * each, every one below the capability's own height, clear of the beach, the path, and everything
 * that reports something; or nothing at all on an island that is not healthy. Seeded on the bare
 * island id, which is why the cover's seed carries a `|cover` suffix to this day.
 */
export function dressGrovesHistory(opts: GroveHistoryOptions): KitPlacement[] {
  if (!dressingEligible(opts.cells)) return [];
  const parcels = opts.cells.filter((c) => c.parcel !== undefined);
  const rand = propStream(islandSeed(opts.island));
  const radius = propRadius(opts.footprint, 'tree');
  const occupied: GroveOccupant[] = opts.standing.map((p) => ({
    x: p.at.x,
    z: p.at.z,
    radius: propRadius(opts.footprint, p.role),
    grove: isGroveHistoryPlacement(p),
  }));
  const sigma = groveSigma(parcels);
  const out: KitPlacement[] = [];
  const ok = (p: GPoint): boolean =>
    cellAt(parcels, p) !== null && opts.exclusion.clear(p.x, p.z) && worstClearance(p, radius, occupied, groveNeed) >= 0;
  const pines: readonly KitAssembly[] = KIT_ROLE_ASSEMBLIES.tree;

  for (const _stand of indices(groveStandCount(parcels, opts.density ?? GROVE_HISTORY_DENSITY))) {
    const seed = Math.floor(rand() * 0x7fffffff);
    const clear = candidatePoints(parcels, STAND_CANDIDATES, seed).filter((p) => opts.exclusion.clear(p.x, p.z));
    const centre = bestCandidate(clear, radius, occupied, groveNeed);
    if (centre === null) continue;
    const members = GROVE_MEMBERS_MIN + Math.floor(rand() * (GROVE_MEMBERS_MAX - GROVE_MEMBERS_MIN + 1));
    for (const _member of indices(members)) {
      let at: GPoint | null = null;
      for (const _try of indices(GROVE_MEMBER_TRIES)) {
        const p = { x: centre.x + gaussian(rand) * sigma.x, z: centre.z + gaussian(rand) * sigma.z };
        if (ok(p)) {
          at = p;
          break;
        }
      }
      if (at === null) continue;
      const scale = GROVE_SCALE_MIN + rand() * (GROVE_SCALE_MAX - GROVE_SCALE_MIN);
      const yaw = rand() * Math.PI * 2;
      const assembly = pines[Math.floor(rand() * pines.length)]!;
      occupied.push({ x: at.x, z: at.z, radius, grove: true });
      out.push({
        role: 'tree',
        assembly,
        capId: GROVE_HISTORY_CAP_ID,
        tint: null,
        at,
        y: landHeight(at.x, at.z, opts.relief),
        yaw,
        scale,
      });
    }
  }
  return out;
}
