// grove-dressing.ts — THE GROVES: a healthy island's own forest, scattered AFTER the vocabulary has
// stood everything that reports something. Pure, browser-free, node:test-provable.
//
// ⚠⚠ WHAT THIS IS AND WHAT IT IS NOT. ADR-0475 settled ONE OBJECT PER CAPABILITY and named density
// a non-input ("Lets not worry about density for now"), and the map read sparse for it — ADR-0475
// D7 records that as a cost accepted knowingly. The owner then stamped a RENDER as the goal
// (`docs/research/chapter2-land-idiom-2026-08-27/land-combined-1948px.png`, the look-fence of
// ADR-0489 D3), and that render is FORESTED: thirteen stands of four to eight pines with bare ground
// between them, from `build_land.py`'s `scatter()` (`:1027-1091`), on top of nothing that reports.
// So this module grows the recipe's stands — and it grows them on GREEN ISLANDS AND NOWHERE ELSE,
// so that what it adds is still a reading rather than a decoration: a healthy story's island is the
// forested one; a yellow, brown, charred or slate island stays exactly as it drew; and `unknown`
// grows nothing, which is the vocabulary's load-bearing entry one rung up. The land is uniform per
// island and wears the STORY's own state (ADR-0475 D2), so the island's status IS its cells' status,
// read here as "every cell healthy" — a mixed island fails CLOSED and grows nothing.
//
// ⚠ A GROVE PINE IS THE `tree` ROLE WEARING `GROVE_CAP_ID` AND NO TINT — the kit's own green
// needles, the same two assemblies — and it is SMALLER: uniform(0.55, 0.80) of the role's height
// (the recipe draws uniform(0.70, 1.30); this is that spread moved below one), so the capability's
// own pine at scale 1 stays the tallest thing on its parcel and the per-capability object keeps
// reading at zoom. NEVER a dead trunk: the recipe's 9% dead trees (`:1070`) are deliberately not
// transcribed, because on this map a bare trunk is `unhealthy`'s signal and a grove that grew one
// would be the map reporting a state the work does not hold (ADR-0392 D5 / ADR-0398 D7).
//
// ⚠ THE OCCUPANCY IS THE ISLAND'S OWN. The capability trees and blooms already standing keep their
// FULL footprint clearance from every grove member; two grove members may stand at
// `GROVE_CLEARANCE` of theirs, because a stand whose crowns touch is what a grove is. The relaxation
// is declared ONCE (`pairClearance`, `kit-vocabulary.ts`), the placement keeps it through
// `worstClearance` and the detector `dressingOverlaps` measures against it — so a grove member
// standing inside a capability's pine is a defect the detector still names.
//
// ⚠⚠ THE BASIS IS THE SHIPPED GROUND'S PROJECTED SHAPE (`parcel-cells.ts`: 234 units wide, ~46
// deep — squashed in z), so the recipe's circular gaussian stand is an ELLIPSE here: σx stays the
// recipe's 3.6 and σz is the recipe's 3.0 scaled by the island's own depth/width aspect against the
// recipe island's (135.1 / 233.8). The exclusions are in the same basis because they are the fields
// the ground ACTUALLY DRAWS: nothing stands on the beach band (`SAND_SHIPPED_BEACH_WIDTH` from the
// CLIPPED coast, the distance walk the sand layer samples per fragment) or on the worn path (the
// recipe's own rule at `:1046`, `wear < 0.30`, through the SAME `wearOf` smoothstep the wear layer
// paints with). A placement that read some other coast or some other path would keep trees off a
// beach the ground does not draw and put them on one it does.
//
// ⚠ DETERMINISTIC, AND SEEDED PER ISLAND. `Math.random` is forbidden on this surface (ADR-0380 D6
// fence 2), so every draw is `propStream` — seeded from the island's id through `islandSeed`, the
// same hash the worn path's jitter uses, so two builds of one island grow the same grove and the
// thirty-five islands of a forest do not grow thirty-five copies of one.

import { SHIPPED_COAST, clipToCoast, coastalIsland, type CoastPoint } from './coast-clip.js';
import { islandPaths, islandSeed } from './island-path.js';
import {
  GROVE_CAP_ID,
  GROVE_CLEARANCE,
  KIT_ROLE_ASSEMBLIES,
  bestCandidate,
  candidatePoints,
  isGrovePlacement,
  propRadius,
  propStream,
  worstClearance,
  type KitAssembly,
  type KitPlacement,
  type Occupancy,
  type RoleFootprints,
} from './kit-vocabulary.js';
import { landHeight } from './land-relief.js';
import { SAND_SHIPPED_BEACH_WIDTH } from './land-sand.js';
import { indices } from './land-shadow.js';
import { WEAR_FALLOFF, wearOf } from './land-wear.js';
import type { GPoint, LayoutCell } from './parcel-cells.js';
import { shoreField } from './shore-fall.js';
import { wearField } from './trail-wear.js';
import type { Descriptor3D, InstanceDescriptor } from './world-to-3d.js';

/** The one story status whose island grows a grove. */
export const GROVE_STATUS = 'healthy';

/** The recipe's stand count on ITS island — `build_land.py:1036`, `forest: stands=13`. */
export const RECIPE_STANDS = 13;

/**
 * THE GROUND THOSE THIRTEEN STANDS WERE SCATTERED OVER, in this map's placement units.
 *
 * The shipped fixture island (`harness/island-fixture.ts`) IS the recipe's own thirteen-hex
 * footprint, and its parcel rings sum to 8,424.6 square units in the basis `parcelCellsFrom`
 * delivers — `ground-casters.ts` cites the same 8,425 for the same land. So an island of that area
 * grows the recipe's thirteen stands and every other island grows in proportion to its own area,
 * measured in the same basis. Every island on one map shares one projection, so proportional in
 * this basis is proportional in the real one.
 */
export const RECIPE_ISLAND_AREA = 8424.6;

/** The recipe island's depth over its width — `build_land.py:88`, `ASPECT = 233.8 / 135.1`, the
 *  real island's ground footprint. What a circular stand was authored on. */
export const RECIPE_ISLAND_ASPECT = 135.1 / 233.8;

/** The recipe's stand spread, `build_land.py:1064`: `rng.gauss(0, 3.6)` along x, `gauss(0, 3.0)`
 *  along y — the second re-read as this basis's z and scaled by {@link groveSigma}. */
export const GROVE_SIGMA_X = 3.6;
export const GROVE_SIGMA_Z = 3.0;

/** Members per stand, `build_land.py:1036`: `per_stand=(4, 8)`, inclusive at both ends. */
export const GROVE_MEMBERS_MIN = 4;
export const GROVE_MEMBERS_MAX = 8;

/** A grove pine's scale on top of the role's 18 units — BELOW one at its top, so a grove is never
 *  the tallest thing on a parcel. The recipe's own `uniform(0.70, 1.30)` (`:1069`) straddles one
 *  because its capability pines are not a signal; ours are. */
export const GROVE_SCALE_MIN = 0.55;
export const GROVE_SCALE_MAX = 0.8;

/** The recipe's path exclusion, `build_land.py:1046`: a prop may stand only where `wear < 0.30`.
 *  Through {@link pathClear} and `wearOf`'s smoothstep that is about 1.91 ground units from the
 *  path's centreline on the shipped 3.0-unit falloff. */
export const GROVE_WEAR_CEILING = 0.3;

/** The beach band nothing stands on — the width the shipped sand layer draws, from the clipped
 *  coast. The recipe keeps stand centres 3.0 from ITS 3.1-unit beach (`:1058`); ours is 9. */
export const GROVE_BEACH = SAND_SHIPPED_BEACH_WIDTH;

/** How many gaussian draws a member gets before the stand gives it up — `build_land.py:1063`,
 *  `for _try in range(30)`. Dropping a member is the recipe's own answer and is honest here for
 *  the reason it is dishonest for a capability's tree: a grove reports no unit of work. */
export const GROVE_MEMBER_TRIES = 30;

/** How many candidate points a stand's centre is chosen from — the resolution of the search, the
 *  same 96 `dressIslandFromKit` chooses a capability's tree from. */
export const STAND_CANDIDATES = 96;

/**
 * ⚠⚠ THE ONE TUNED NUMBER ON THIS SURFACE — HOW MANY OF THE RECIPE'S STANDS AN ISLAND GROWS, as a
 * multiple. Everything else here is transcribed from `build_land.py`; this is a LOOK, and it is a
 * look because the recipe's own count does not reach the recipe's own density on this map.
 *
 * WHY IT HAS TO EXIST. The recipe imposes NO clearance between two grove members at all
 * (`:1063-1065` tests only `inside` and `wear`), so its stands are 4–8 trees with crowns freely
 * overlapping. This map DOES keep a clearance between them ({@link GROVE_CLEARANCE}, declared and
 * detected because a placement nothing measures is how the owner's "rocks where the trees are"
 * defect happened), and this map's islands are three times shallower in z than the recipe's, so a
 * stand here is an ellipse about 7 x 2 units that physically cannot hold six pines of radius 5.
 * Measured on the fixture island at the recipe's own 13 stands: 42 pines, **3.2 per stand** against
 * the recipe's 4–8. Relaxing the clearance instead would buy the count back by letting crowns
 * interpenetrate, and the detector would then be measuring against a number chosen to make the
 * placement pass — so the honest lever is MORE STANDS, which is more clumps rather than tighter
 * ones, and every stand still keeps every rule.
 *
 * THE LADDER, rendered on the canopy comparison page and composed into
 * `docs/research/chapter2-ground-canopy-2026-09-03/` — {@link GROVE_DENSITY_RUNGS}. The shipped
 * pick is the middle rung, per ADR-0503 D1 (apply the layers boldly, ship a pick, let the owner
 * scale back along rungs already rendered); a scale-back is this one constant and no re-measurement.
 */
export const GROVE_DENSITY_RUNGS = [1, 2, 3] as const;

/** The rung the shipped map stands. */
export const GROVE_DENSITY = 2;

// ---------------------------------------------------------------- the island's own numbers

/** A ring's area by the shoelace formula — orientation-free, zero for fewer than three points. */
export function ringArea(points: readonly GPoint[]): number {
  let twice = 0;
  for (const [i, a] of points.entries()) {
    const b = points[(i + 1) % points.length]!;
    // Stryker disable next-line AssignmentOperator: EQUIVALENT — `-=` accumulates `-Σterm` rather
    // than `Σterm`, and the `Math.abs` below erases exactly that sign. The shoelace is
    // orientation-free ON PURPOSE (a ring wound the other way is the same ground), so no input
    // can distinguish them and no test can be written that does.
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) / 2;
}

/** The ground an island's cells cover, in placement units. */
export function cellsArea(cells: readonly LayoutCell[]): number {
  let area = 0;
  for (const c of cells) area += ringArea(c.points);
  return area;
}

/**
 * How many stands this island grows — the recipe's thirteen, in proportion to area, times the
 * density rung ({@link GROVE_DENSITY}, which is what a caller omitting the argument gets).
 *
 * ⚠⚠ AND IT REFUSES A RUNAWAY, which is a real guard rather than defensive noise. Every stand costs
 * a 96-candidate search against an occupancy that grows with what it has already placed, so the
 * placement is superlinear in this number and `indices(n)` MATERIALISES it — a corrupted area
 * therefore does not produce a wrong picture, it produces a hang. Measured: `check:mutation-diff`
 * scored four arithmetic mutants of {@link ringArea} and one of the division below as `Timeout`
 * (which it reports as UNPROVEN — never a pass, never a survivor) precisely because a fast
 * assertion killed them while a slow one hung; the counts they asked for on the recipe island were
 * 133, 432, `Infinity`, `NaN` and 2,357,742,254 against an honest 26. See {@link standCeiling}.
 *
 * ⚠ IT THROWS RATHER THAN CLAMPS, and on the shipped canvas that would take the map down. That is
 * the right direction anyway, because the alternative it replaces is not a drawn map — it is a
 * materialised billion-element array, i.e. a hung tab with no message. And the condition is
 * geometrically UNREACHABLE from a well-formed island: a simple ring's area cannot exceed its
 * bounding box's, the ceiling is read at the boldest rung while the map ships the middle one, and
 * a hex island's box exceeds its area by a further 20-40% — about 2x of headroom in total, so the
 * island's parcels would have to overlap each other by more than 100% to reach it.
 */
export function groveStandCount(cells: readonly LayoutCell[], density: number = GROVE_DENSITY): number {
  const stands = Math.round((RECIPE_STANDS * density * cellsArea(cells)) / RECIPE_ISLAND_AREA);
  const ceiling = standCeiling(cells);
  if (!Number.isFinite(stands) || stands > ceiling) {
    throw new Error(
      `grove-dressing: ${stands} stands asked for on an island whose own bounding box could ask ` +
        `for at most ${ceiling} at the boldest rung (${Math.max(...GROVE_DENSITY_RUNGS)}). That is ` +
        'an arithmetic fault in the area, not a dense island — a grove is placed by a superlinear ' +
        'search and this would hang rather than draw.',
    );
  }
  return stands;
}

/**
 * THE MOST STANDS THIS ISLAND COULD HONESTLY ASK FOR — the same rule, read off its BOUNDING BOX at
 * the boldest declared rung.
 *
 * ⚠ THE BOUNDING BOX, and that is the whole design. A simple ring's area never exceeds its bounding
 * box's, so this ceiling can never sit below an honest count however large the island — the guard
 * costs a real story with fifty capabilities nothing, which is the bar a guard has to clear here.
 * And it is computed from `Math.min`/`Math.max` over the same points, so the area arithmetic the
 * guard exists to catch cannot corrupt the ceiling with it.
 */
export function standCeiling(cells: readonly LayoutCell[]): number {
  const box = cellsBounds(cells);
  const boundingArea = (box.maxX - box.minX) * (box.maxZ - box.minZ);
  const boldest = Math.max(...GROVE_DENSITY_RUNGS);
  return Math.round((RECIPE_STANDS * boldest * boundingArea) / RECIPE_ISLAND_AREA);
}

/** The island's extent along each axis of the placement basis. Infinite-and-inverted over no
 *  points at all, which is what makes an empty island's bounding area zero rather than negative. */
export interface CellsBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function cellsBounds(cells: readonly LayoutCell[]): CellsBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of cells) {
    for (const p of c.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * The island's depth over its width in the placement basis, or the recipe's own aspect when the
 * cells bound no width at all — so an empty or degenerate island asks for the recipe's stand shape
 * rather than for a division by zero.
 */
export function cellsAspect(cells: readonly LayoutCell[]): number {
  const { minX, maxX, minZ, maxZ } = cellsBounds(cells);
  const width = maxX - minX;
  if (!(width > 0)) return RECIPE_ISLAND_ASPECT;
  return (maxZ - minZ) / width;
}

/** The stand's spread along each axis of the placement basis. */
export interface GroveSigma {
  x: number;
  z: number;
}

/**
 * THE RECIPE'S STAND, IN THIS BASIS: σx as authored, σz scaled by how much more squashed this
 * island is than the one the recipe was authored on. On the shipped fixture (46.2 deep over 233.8
 * wide) that is 3.0 x 0.342 = 1.03 — a stand drawn round here would be a stand three times too
 * deep on the island.
 */
export function groveSigma(cells: readonly LayoutCell[]): GroveSigma {
  return { x: GROVE_SIGMA_X, z: (GROVE_SIGMA_Z * cellsAspect(cells)) / RECIPE_ISLAND_ASPECT };
}

/** May this island grow a grove? Every cell healthy, and at least one cell to be healthy. An island
 *  whose cells disagree about their status is a scene defect, and it fails CLOSED here. */
export function groveEligible(cells: readonly LayoutCell[]): boolean {
  return cells.length > 0 && cells.every(isHealthyCell);
}

function isHealthyCell(c: LayoutCell): boolean {
  return c.status === GROVE_STATUS;
}

// ---------------------------------------------------------------- where a point stands

/** Is `p` inside the ring? Ray casting — the same test `kit-vocabulary.test.ts` holds the
 *  capability trees to their parcels with, here as a module function so the grove can ask it. */
export function insideRing(points: readonly GPoint[], p: GPoint): boolean {
  let inside = false;
  for (const [i, a] of points.entries()) {
    // Stryker disable next-line ArithmeticOperator: EQUIVALENT — `+ 1` pairs each vertex with its
    // SUCCESSOR instead of its predecessor, which enumerates the same edge SET (every edge, once,
    // read from its other end) and the crossing test below is symmetric in `a` and `b`. Probed
    // over 400,000 random rings and points: not one disagreement.
    const b = points[(i + points.length - 1) % points.length]!;
    if (straddles(a, b, p.z) && crossingIsRight(p.x, crossingX(a, b, p.z))) inside = !inside;
  }
  return inside;
}

/**
 * DOES THE EDGE `a`→`b` CROSS THE HORIZONTAL LINE THROUGH `z`? Half-open on purpose: a vertex
 * exactly ON the line counts for the edge BELOW it and not for the edge above, so a ray through a
 * vertex crosses the ring once rather than twice or not at all.
 *
 * ⚠ THE `>=` VARIANTS ARE NOT EQUIVALENT and are killed by a fixture — a ring with a vertex whose
 * z is exactly the probe's, which is the only input the convention can be seen through.
 */
export function straddles(a: GPoint, b: GPoint, z: number): boolean {
  return a.z > z !== b.z > z;
}

/** Where that edge meets the horizontal line through `z`, along x. */
export function crossingX(a: GPoint, b: GPoint, z: number): number {
  return ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x;
}

/**
 * IS THE CROSSING ON THE SIDE THIS RAY COUNTS? To the right of `px`, by convention.
 *
 * ⚠⚠ BOTH MUTANTS OF THIS OPERATOR ARE UNKILLABLE HERE, FOR TWO DIFFERENT REASONS, WHICH IS WHY
 * THE MUTATOR IS DISABLED RATHER THAN THE TEST WEAKENED.
 * `>=` counts the crossings on the LEFT instead, and a closed ring's crossings on the two sides of
 * a point always have the SAME parity — so it is a genuinely equivalent ray cast, and 400,000
 * random rings and points produced no disagreement.
 * `<=` differs only where `px` lands EXACTLY on a crossing, i.e. where the probe sits on the ring's
 * own boundary. That case is real and IS pinned, by
 * `insideRing pins the boundary convention: a probe exactly on a vertex is INSIDE` — but by a test
 * rather than by this rung, because one `Stryker disable` cannot keep one mutant of a mutator and
 * drop the other.
 */
// Stryker disable next-line EqualityOperator: EQUIVALENT / pinned by test — see the doc comment.
export function crossingIsRight(px: number, x: number): boolean {
  return px < x;
}

/** The first cell containing `p`, or `null` when it stands on none — off the island. */
export function cellAt(cells: readonly LayoutCell[], p: GPoint): LayoutCell | null {
  for (const c of cells) if (insideRing(c.points, p)) return c;
  return null;
}

// ---------------------------------------------------------------- where a grove may not stand

/** Where a grove may NOT stand — the beach band and the worn path, as one predicate. */
export interface GroveExclusion {
  clear(x: number, z: number): boolean;
}

/** Clear of the beach: at least {@link GROVE_BEACH} from the clipped coast. The shore field caps
 *  its distance at the width it was built for, so "at the cap" IS clear. */
export function beachClear(distance: number): boolean {
  return distance >= GROVE_BEACH;
}

/** Clear of the path: the recipe's `wear < 0.30`, through the wear layer's own smoothstep. */
export function pathClear(distance: number): boolean {
  // Stryker disable next-line EqualityOperator: EQUIVALENT, and MEASURED rather than asserted —
  // `<=` differs only where `wearOf(distance)` is EXACTLY 0.3, and no double is. `wearOf` is a
  // smoothstep, so bisecting it to the last bit brackets the ceiling between 0.30000000000000016
  // and 0.29999999999999993 with nothing between: the equality this mutant turns on is unreachable
  // from any input, so no fixture can be written that separates them.
  return wearOf(distance) < GROVE_WEAR_CEILING;
}

/**
 * THE EXCLUSION FOR ONE ISLAND, from its CLIPPED ground and its worn paths.
 *
 * ⚠ THE CLIPPED DESCRIPTORS, for the reason `shoreField` states at length: after `clipToCoast`
 * the boundary of the mesh IS the coast, so the distance to the mesh's rim is the distance to the
 * water. Handed the pre-clip parcels the band would sit a beach's width inland of the sand the
 * ground draws, and the grove would stand on the beach it was told to avoid.
 */
export function groveExclusion(
  clippedIsland: readonly InstanceDescriptor[],
  paths: readonly (readonly CoastPoint[])[],
): GroveExclusion {
  const shore = shoreField(clippedIsland, GROVE_BEACH);
  const wear = wearField(paths, WEAR_FALLOFF);
  return {
    clear(x: number, z: number): boolean {
      return beachClear(shore.sample(x, z).distance) && pathClear(wear.sample(x, z).distance);
    },
  };
}

/**
 * ONE ISLAND'S EXCLUSION, READ OFF THE MAP'S OWN DESCRIPTOR STREAM: its ground clipped to the
 * SAME coast the shipped ground is clipped to (`SHIPPED_COAST`, the same function), and its worn
 * paths from the SAME connector the wear layer paints from (`islandPaths` over the trail strips in
 * the stream). Nothing here is a second opinion about where the beach or the path is.
 *
 * ⚠ ONE ISLAND'S GROUND ALONE IS CLIPPED, and that is exact rather than an approximation: the coast
 * is seeded on the island's id and displaced from the island's own rim, so an island clipped by
 * itself is clipped as it is in the whole map. Every strip in the stream is offered to the
 * connector, which docks only the ends within reach of THIS island's rim.
 */
export function islandExclusion(descriptors: readonly Descriptor3D[], island: string): GroveExclusion {
  // Stryker disable next-line MethodExpression: EQUIVALENT — dropping the filter passes `skipped`
  // markers straight through, and {@link isInstance}'s own note says why that changes no answer.
  // What it DOES change is the static type, and a type is not an input this rung can vary.
  const instances = descriptors.filter(isInstance);
  // ⚠⚠ `coastalIsland`, NOT A SECOND COPY OF ITS RULE. This read `d.kind === 'cell-ground' &&
  // d.island === island`, and the mutation rung found the first half unkillable — correctly, and for
  // a reason worth keeping written down: every consumer downstream (`clipToCoast`, `shoreField`,
  // `islandRims`) re-asks `coastalIsland`, so a non-ground descriptor that slipped through here was
  // dropped three times over and could not change an answer. A guard no input can exercise is a
  // second copy of somebody else's rule, not a defence. What ONLY this line decides is the ISLAND —
  // hand it two islands' ground and the exclusion would keep a grove off the OTHER island's beach.
  const ground = instances.filter((d) => coastalIsland(d) === island);
  const clipped = clipToCoast(ground, SHIPPED_COAST);
  const paths = [...islandPaths(clipped, instances).values()].flat();
  return groveExclusion(clipped, paths);
}

// ---------------------------------------------------------------- the draws

/** A deterministic stream — `propStream`'s shape. */
export type Stream = () => number;

/** A standard normal draw by Box–Muller, two uniforms per draw. `1 - rand()` keeps the log's
 *  argument in (0, 1]: `propStream` delivers [0, 1), and `log(0)` is a member at infinity. */
export function gaussian(rand: Stream): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Members in this stand: the recipe's `randint(4, 8)`, inclusive at both ends. */
export function memberCount(rand: Stream): number {
  return GROVE_MEMBERS_MIN + Math.floor(rand() * (GROVE_MEMBERS_MAX - GROVE_MEMBERS_MIN + 1));
}

/** One member's scale, uniform over [{@link GROVE_SCALE_MIN}, {@link GROVE_SCALE_MAX}). */
export function memberScale(rand: Stream): number {
  return GROVE_SCALE_MIN + rand() * (GROVE_SCALE_MAX - GROVE_SCALE_MIN);
}

/** One member's yaw, uniform over a full turn — the recipe's `uniform(0, tau)`. */
export function memberYaw(rand: Stream): number {
  return rand() * Math.PI * 2;
}

/** One member's assembly — the recipe's `rng.choice(TREE_PAIRS)` over the two LIVE pines. Never
 *  the dead one, which is not in the tree role's list at all. */
export function memberAssembly(rand: Stream): KitAssembly {
  const choices = KIT_ROLE_ASSEMBLIES.tree;
  return choices[Math.floor(rand() * choices.length)]!;
}

// ---------------------------------------------------------------- the occupancy

/** An occupant the grove keeps clear of, flagged by whether it is itself a grove member. */
export interface GroveOccupant extends Occupancy {
  grove: boolean;
}

/** What a grove member of `radius` must keep from an occupant: the full sum against a capability's
 *  object or a bloom, {@link GROVE_CLEARANCE} of it against another grove member — the same rule
 *  `pairClearance` states for a pair, from the side of the one being placed. */
export function groveNeed(radius: number, o: GroveOccupant): number {
  return (radius + o.radius) * (o.grove ? GROVE_CLEARANCE : 1);
}

/** What already stands, as the grove's occupants — the ROLE's radius, never the scaled one
 *  (`pairClearance` says why), flagged grove or not off the placement's own `capId`. */
export function standingOccupants(
  placements: readonly KitPlacement[],
  footprint: RoleFootprints,
): GroveOccupant[] {
  const out: GroveOccupant[] = [];
  for (const p of placements) {
    out.push({ x: p.at.x, z: p.at.z, radius: propRadius(footprint, p.role), grove: isGrovePlacement(p) });
  }
  return out;
}

// ---------------------------------------------------------------- one stand

/**
 * WHERE A STAND IS CENTRED: the clear candidate furthest from everything standing — the same
 * best-candidate search a capability's tree is placed by, over the candidates the exclusion lets
 * through, keeping a tree's radius so a stand's middle is never inside the capability's own pine.
 * `null` when no candidate is clear, which drops the stand exactly as the recipe's `if not c:
 * continue` does.
 */
export function standCentre(
  parcels: readonly LayoutCell[],
  seed: number,
  radius: number,
  occupied: readonly GroveOccupant[],
  exclusion: GroveExclusion,
): GPoint | null {
  const clear = candidatePoints(parcels, STAND_CANDIDATES, seed).filter((p) => exclusion.clear(p.x, p.z));
  return bestCandidate(clear, radius, occupied, groveNeed);
}

/**
 * WHERE ONE MEMBER STANDS: gaussian draws around the centre until `ok` accepts one, or `null`
 * after {@link GROVE_MEMBER_TRIES} — the recipe's `for _try in range(30) … else: continue`.
 * `ok` is the caller's, so the acceptance rule is provable apart from the draws.
 */
export function memberPoint(
  centre: GPoint,
  sigma: GroveSigma,
  rand: Stream,
  ok: (p: GPoint) => boolean,
): GPoint | null {
  for (const _try of indices(GROVE_MEMBER_TRIES)) {
    const p = { x: centre.x + gaussian(rand) * sigma.x, z: centre.z + gaussian(rand) * sigma.z };
    if (ok(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------- the dressing

export interface GroveDressingOptions {
  /** The island's id — the seed, so two islands of one shape are two groves. */
  island: string;
  /** The island's ground cells in the placement basis — `parcelCellsFrom` on the shipped path. */
  cells: readonly LayoutCell[];
  /** What already stands on this island — the capability objects and the blooms, at full
   *  clearance. `dressIslandFromKit`'s output for the same cells. */
  standing: readonly KitPlacement[];
  footprint: RoleFootprints;
  /** The relief amplitude the ground is built at, so a grove sits ON the land. */
  relief: number;
  /** Where a grove may not stand — {@link islandExclusion} on the shipped path. */
  exclusion: GroveExclusion;
  /** Which rung of {@link GROVE_DENSITY_RUNGS} this island grows at. Omitted is {@link
   *  GROVE_DENSITY}, the shipped pick — the comparison page's ladder arms are what pass it. */
  density?: number;
}

/**
 * GROW THE ISLAND'S GROVE — thirteen stands per recipe-island of area, four to eight pines each,
 * every one a live green pine below the capability's own height, clear of the beach, the path,
 * and everything that reports something; or nothing at all on an island that is not healthy.
 *
 * ⚠ THE OCCUPANCY STARTS AS WHAT ALREADY STANDS and every member joins it as it is placed, so a
 * stand cannot grow into the stand before it any closer than {@link GROVE_CLEARANCE} allows, and
 * never into a capability's tree at all.
 */
export function dressGroves(opts: GroveDressingOptions): KitPlacement[] {
  if (!groveEligible(opts.cells)) return [];
  const parcels = opts.cells.filter(hasParcel);
  const rand = propStream(islandSeed(opts.island));
  const radius = propRadius(opts.footprint, 'tree');
  const occupied = standingOccupants(opts.standing, opts.footprint);
  const sigma = groveSigma(parcels);
  const out: KitPlacement[] = [];
  const ok = (p: GPoint): boolean =>
    cellAt(parcels, p) !== null &&
    opts.exclusion.clear(p.x, p.z) &&
    // Stryker disable next-line EqualityOperator: EQUIVALENT (measure zero) — a member exactly
    // touching its clearance, to the last bit of a double, is one input in a continuum.
    worstClearance(p, radius, occupied, groveNeed) >= 0;

  for (const _stand of indices(groveStandCount(parcels, opts.density ?? GROVE_DENSITY))) {
    const centre = standCentre(parcels, Math.floor(rand() * 0x7fffffff), radius, occupied, opts.exclusion);
    if (centre === null) continue;
    for (const _member of indices(memberCount(rand))) {
      const at = memberPoint(centre, sigma, rand, ok);
      if (at === null) continue;
      const scale = memberScale(rand);
      const yaw = memberYaw(rand);
      const assembly = memberAssembly(rand);
      occupied.push({ x: at.x, z: at.z, radius, grove: true });
      out.push({
        role: 'tree',
        assembly,
        capId: GROVE_CAP_ID,
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

/**
 * Everything in the stream that IS an instance — i.e. not a `skipped` marker. A type guard rather
 * than an inline filter, so the narrowing the two consumers rely on is stated once.
 *
 * ⚠ Stryker disable, with the reason it has always carried: a `skipped` descriptor is neither
 * ground (it has no `kind: 'cell-ground'`) nor a dockable strip, so letting one through changes no
 * answer either consumer gives. The guard exists for the TYPE, and a type is not an input.
 */
function isInstance(d: Descriptor3D): d is InstanceDescriptor {
  // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: EQUIVALENT
  return d.kind !== 'skipped';
}

/** A cell some capability owns — the ground a grove may stand on. A cell carrying no parcel is
 *  ground the map does not attribute, and a grove there would forest land the story does not
 *  claim, exactly as a bloom there would sign it. */
function hasParcel(c: LayoutCell): boolean {
  return c.parcel !== undefined;
}
