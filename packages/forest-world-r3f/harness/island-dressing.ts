// island-dressing.ts — WHAT IS BUILT ON THE ISLAND, and why each thing is where it is.
//
// Pure, browser-free, node:test-provable, and fenced into `harness/` with the rest of the
// live-render experiment. It generates no geometry of its own: `prop-linear.ts` and
// `prop-structures.ts` grow the props, `prop-layout.ts` says where things can go, and this
// module is the COMPOSITION — the part that is art rather than machinery.
//
// ============================================================================
// WHY THIS MODULE EXISTS, WHICH IS THE FINDING THAT PRODUCED IT
// ============================================================================
//
// The previous round showed the owner six whole islands and he rejected all six: *"these
// islands dont look nice at all, they all look the same/worse and look as if we havn't really
// broken any new ground."* The six differed by a flag each — light on, edge material, ground
// regional, bevel off — and a flag can only vary a QUANTITY. Six settings of one idea read as
// one idea, which is exactly what he said.
//
// The diagnosis that followed is measured rather than felt. Counted against the four reference
// images he supplied:
//
//     our island            4 kinds of object   ground, shrub, flower, tree
//     his pixel garden     ~8                   fence, tree, brick planter, flowers, paving...
//     his well garden      ~9                   stone wall, paving, well, water, wood fence...
//     his pavilion        ~15                   roof, posts, railings, lanterns, pots, stones...
//     his cottage         ~15                   house, chimney, porch, greenhouse, fences...
//
// And the observation that settles which half of the stack is short: his simplest reference is
// FLAT PIXEL ART — no cast shadow, no ambient occlusion, no terrain relief, no bevels — and it
// reads as a place while ours does not. Our island already carries more rendering technique
// than that picture carries. So the gap is CONTENT and MATERIALS, and another increment of
// shadow or palette work cannot close it.
//
// ADR-0406 is what makes the remedy legal: the harness island REPRESENTS NOTHING, so props,
// colour and new material tokens are unfenced on it. ADR-0406 D2 leaves the product map exactly
// as it was.
//
// ============================================================================
// THE APPEARANCE CALLS — the ADR-0392 D2 / ADR-0398 D3 record
// ============================================================================
//
// Every decision below is this session's, and every one is recorded with its reason. An
// unrecorded art call is a violation of that decision, not an exercise of it. The five that
// govern the whole file, rather than one dressing:
//
// (1) A DRESSING IS A PLACE, NOT A SETTING. Each entry answers "what KIND of place is this?"
//     rather than "how much of X?". That is forced by the rejection above: directions that
//     differ by a quantity are a ladder, and the owner has already told us a ladder reads as
//     one idea. So the five differ in what the island IS — an enclosed garden, a settlement, a
//     worked hillside, a monument, an unbuilt shore — and each brings its own props, its own
//     path material, its own vegetation density and its own relationship to the coast.
//
// (2) THE COAST IS SMOOTHED BEFORE ANYTHING IS BUILT ON IT, and this is the single biggest
//     structural change on the page. The island's outline is a cluster of thirteen hexagons and
//     it reads as a BOARD — the previous round's own write-up named that and could not fix it,
//     because fixing it looked like moving the land. It is not: `smoothLoop` (Chaikin corner
//     cutting) is applied to the RIM POLYLINE that props are built along, so a wall, a shore
//     band or a path ring follows a rounded plot even though the land under it is unchanged.
//     The land keeps its cells, its parcels and its bevel; what changes is the line the eye
//     traces, which is what a silhouette actually is.
//
// (3) VEGETATION IS THINNED, HARD. The fixture carries 144 plants, each about 15 x 12 delivered
//     pixels at 2 px/unit. A hundred and forty-four marks that size do not read as plants; they
//     read as speckle, and every reference carries between ten and thirty DISCRETE plant masses
//     with actual shapes. Every dressing therefore drops `plantFraction` well below 1 and puts
//     the recovered visual weight into hedges, pots and beds — bigger objects with silhouettes.
//
// (4) A ROOF IS THE BRIGHTEST THING ON THE ISLAND, AND THAT IS ARITHMETIC. Measured against the
//     authored light and the four-rung ladder: every vertical face lands on rung 0 (x0.78) at
//     every orientation, a horizontal top on rung 2 (x0.90), and ONLY a surface pitched toward
//     the light reaches rung 3 (x1.00) — a gable roof ridged along z at 30 degrees hits dot
//     0.936 on one slope and 0.486 on the other. So a pitched roof is simultaneously the
//     brightest and the highest-contrast surface available. Three of the five dressings put one
//     in the frame deliberately; the two that do not are the two that are meant to read as
//     unbuilt, and that absence is the point rather than an oversight.
//
// (5) COLOUR ACCENTS ARE CARRIED BY PROPS AND BY FLOWERING MASSES, NEVER BY THE GROUND. The
//     ground's colour is the one thing on this island that still resembles a signal on the
//     product map, and although ADR-0406 D1 would permit recolouring it, a session that learned
//     "the ground can be any colour" from an experiment would be learning the one lesson that
//     does not transfer (ADR-0406 D2). Terracotta, blossom, marigold and water are where the
//     colour goes. This is a self-imposed restraint, recorded as such.
//
// ⚠ WHAT THIS MODULE MAY NOT DO. It is an ART module and ADR-0392 D5 / ADR-0398 D7 stand: an
// art call may never settle a semantic question under cover of appearance. Nothing here reads,
// writes or reinterprets a capability's status — the dressings place props by GEOMETRY (which
// parcel is biggest, which point is furthest from an edge), never by what a parcel means.

import { groundCellsFrom, type GroundCell } from './island-descriptors.js';
import type { ShadowCaster } from './land-shadow.js';
import { PROP_TOKENS } from './palette-band.js';
import {
  growFenceRun,
  growHedgeRun,
  growPathRun,
  growPavedArea,
  growSteps,
  growWallRun,
  growWaterChannel,
  type GPoint,
  type PropParts,
} from './prop-linear.js';
import {
  centroidOf,
  grove,
  heightField,
  insetLoop,
  insideLoop,
  layoutCells,
  parcelLoop,
  parcelSummaries,
  resample,
  rimLoop,
  ring,
  scatter,
  smoothLoop,
  type LayoutCell,
} from './prop-layout.js';
import {
  growArch,
  growBoat,
  growCottage,
  growCrates,
  growLantern,
  growPavilion,
  growPlatform,
  growPot,
  growRock,
  growWell,
} from './prop-structures.js';
import { canopyCaster, groveSpecs, type CanopySpec } from './canopy-geometry.js';

export type DressingName = 'walled' | 'hamlet' | 'terrace' | 'shrine' | 'wild';

/** One merged prop group, in the exact shape `mergeParts` in `IslandView.tsx` consumes: parts
 *  keyed by authored token, plus a world offset. A run authored in absolute ground coordinates
 *  carries a zero offset; a point prop authored around its own origin carries the ground point
 *  it stands on, lifted onto the relief. */
export interface DressingGroup {
  parts: PropParts;
  offset: [number, number, number];
}

/** One small tree: what to grow, and the ground point it stands on. */
export interface CanopyPlacement {
  spec: CanopySpec;
  at: GPoint;
}

export interface Dressing {
  groups: DressingGroup[];
  /** What the props contribute to the occlusion field. Props that do not cast look pasted on,
   *  which is the one artefact that reads as a rendering bug rather than as a choice. */
  casters: ShadowCaster[];
  /** How much of the fixture's vegetation this dressing keeps — see call (3). */
  plantFraction: number;
  /**
   * THE ISLAND'S TREES — many small ones, in stands, replacing the hero tree (owner, 2026-08-21:
   * "we ditch the middle tree, and instead opt for many small trees so it actually looks like a
   * forrest/garden").
   *
   * IT IS PER-DRESSING RATHER THAN ONE RULE FOR THE ISLAND, and that is the same argument the
   * dressings themselves rest on. Where a place puts its trees is one of the loudest things it
   * says about what kind of place it is: an enclosed garden plants an orchard in its quarters,
   * a hamlet plants shelter round its yards, a worked hillside keeps its trees off the terraces
   * and at the margins, a monument plants an avenue, and a wild shore has thickets where nothing
   * cleared them. A single scatter applied to all five would hand the five directions back the
   * uniformity the owner rejected in the round before last.
   */
  canopy: CanopyPlacement[];
}

export interface DressingOptions {
  cells: readonly GroundCell[];
  /** The land's relief amplitude, so props sit ON the ground rather than on a remembered plane. */
  relief: number;
  seed?: number;
}

/** The island as the layout module wants it, plus everything every dressing needs from it. */
interface Ctx {
  cells: LayoutCell[];
  heightAt: (x: number, z: number) => number;
  /** The raw 52-edge rim — the land's actual outline. */
  rim: GPoint[];
  /** The rim ROUNDED — the line props follow. See call (2). */
  coast: GPoint[];
  parcels: ReturnType<typeof parcelSummaries>;
  /** The island's own middle — where a prop is pulled toward when its parcel sits on the coast. */
  centre: GPoint;
  seed: number;
}

/**
 * Two rounds of Chaikin, and the number is chosen rather than defaulted.
 *
 * One round leaves the hexagon corners still legible at delivered size; three starts eating the
 * island's own lobes and the plot loses the shape the land actually has, which would be an art
 * choice quietly overriding the data. Two removes the faceting and keeps the outline.
 */
const COAST_ROUNDS = 2;

function context(opts: DressingOptions): Ctx {
  const cells = layoutCells(opts.cells);
  const rim = rimLoop(cells);
  return {
    cells,
    heightAt: heightField(opts.relief),
    rim,
    coast: smoothLoop(rim, COAST_ROUNDS, true),
    parcels: parcelSummaries(cells),
    centre: centroidOf(cells),
    seed: opts.seed ?? 7,
  };
}

function distance(a: GPoint, b: GPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** A closed run: the polyline with its first point repeated, which is what the linear
 *  generators want for a loop. */
function closed(loop: readonly GPoint[]): GPoint[] {
  return [...loop, loop[0]!];
}

/** A point prop's group: authored around its own origin, dropped onto the land where it stands. */
function at(ctx: Ctx, parts: PropParts, p: GPoint, lift = 0): DressingGroup {
  return { parts, offset: [p.x, ctx.heightAt(p.x, p.z) + lift, p.z] };
}

/** A run authored in absolute ground coordinates — no offset, it is already where it belongs. */
function run(parts: PropParts): DressingGroup {
  return { parts, offset: [0, 0, 0] };
}

/** Casters sampled along a linear run, so a wall pools contact shade along its whole length
 *  rather than at one point. Sampled at the run's own thickness, which is the coarsest spacing
 *  that leaves no gap between neighbouring pools. */
function runCasters(points: readonly GPoint[], radius: number, height: number): ShadowCaster[] {
  const sampled = resample(points, Math.max(2, radius * 1.6), false);
  return sampled.map((p) => ({ x: p.x, z: p.z, radius, height }));
}

/**
 * PLANT A DRESSING'S TREES — the one place the canopy's arithmetic lives, so five dressings can
 * differ in WHERE they plant without five copies of how.
 *
 * THE CALLS THAT GOVERN EVERY DRESSING'S PLANTING, made once here rather than five times:
 *
 * - **TREES COME IN STANDS, WITH BARE GROUND BETWEEN.** {@link grove} rather than {@link scatter},
 *   and the difference is the research pass's central transferable finding: the reference packs
 *   twenty trees onto one small plateau and leaves the next one empty. A uniform scatter at the
 *   same count reads as a green rash — which is exactly what this island's 144 evenly dispersed
 *   plants already delivered, and why every dressing had to thin them.
 * - **A STAND CARRIES A RANGE OF HEIGHTS, NOT ONE HEIGHT.** Measured off the reference's groves
 *   at roughly 1 : 2.5. A stand of equal trees delivers a hedge; a stand with a range delivers
 *   a canopy, because the silhouette's top edge stops being a line.
 * - **ONE CANOPY COLOUR PER ISLAND.** The reference recolours EVERY tree on an island together
 *   and never tints one against its neighbour. A grove of individually-coloured trees is
 *   confetti, and it is the easiest half of the finding to get backwards.
 * - **EVERY TREE CASTS.** A prop that does not cast looks pasted on, and for a tree it is worse
 *   than that: the cast shadow is half of what separates a standing object from a mark painted
 *   on the ground. The pool is the CANOPY's radius, not the trunk's footprint.
 * - **TREES YIELD TO WHAT IS BUILT.** Every caller passes its paths, walls and courts as
 *   `avoid`, because a tree growing through a path says nobody walks it.
 */
function plantCanopy(
  ctx: Ctx,
  opts: {
    /** How far inside the smoothed coast trees may stand. */
    inset: number;
    clusters: number;
    perCluster: readonly [number, number];
    spread: number;
    minGap: number;
    clusterGap?: number;
    avoid?: readonly (readonly GPoint[])[];
    avoidGap?: number;
    minWidth?: number;
    maxWidth?: number;
    aspect?: number;
    domeFraction?: number;
    token?: string;
    /** Added to the dressing's seed, so two dressings never plant the same stand. */
    seedOffset?: number;
  },
) {
  const seed = ctx.seed + (opts.seedOffset ?? 0);
  const points = grove({
    loop: insetLoop(ctx.coast, opts.inset),
    clusters: opts.clusters,
    perCluster: opts.perCluster,
    spread: opts.spread,
    minGap: opts.minGap,
    // The rim inset already holds trees off the coast, so this is the second-order guard: a
    // canopy whose CENTRE clears the edge can still overhang it, and a tree hanging over the
    // water reads as a rendering fault rather than as a windswept one.
    edgeGap: 3,
    ...(opts.clusterGap === undefined ? {} : { clusterGap: opts.clusterGap }),
    ...(opts.avoid ? { avoid: opts.avoid } : {}),
    ...(opts.avoidGap === undefined ? {} : { avoidGap: opts.avoidGap }),
    seed,
  });
  const specs = groveSpecs({
    count: points.length,
    seed,
    ...(opts.minWidth === undefined ? {} : { minWidth: opts.minWidth }),
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(opts.aspect === undefined ? {} : { aspect: opts.aspect }),
    ...(opts.domeFraction === undefined ? {} : { domeFraction: opts.domeFraction }),
    ...(opts.token === undefined ? {} : { token: opts.token }),
  });
  const canopy = points.map((at, i) => ({ spec: specs[i]!, at }));
  return { canopy, casters: canopy.map((t) => canopyCaster(t.spec, t.at)) };
}

// ---------------------------------------------------------------------------
// A — THE WALLED GARDEN
// ---------------------------------------------------------------------------
//
// The owner's well-garden reference, translated to our island rather than copied from it: a
// stone retaining wall containing the whole plot, a paved path following it round, a court with
// a well at its centre, potted plants along the path, and beds of colour.
//
// THE CALLS, AND WHY EACH ONE IS HERE:
//
// - THE WALL IS THE SILHOUETTE. It follows the SMOOTHED coast (call 2), so the island stops
//   reading as thirteen hexagons and starts reading as a plot with an edge. This is the single
//   change most likely to be responsible if this direction reads better than the last round,
//   and it is the reason a wall was chosen over any other enclosing device.
// - IT IS BATTERED AT 0.45. A vertical face lands on rung 0 whatever way it points; at slope
//   0.4 the light-facing side lifts to rung 2 while the away-facing side stays on rung 0. So
//   the batter is what turns the wall from a silhouette into a solid, and 0.45 buys the lift
//   with a little margin rather than sitting on the boundary.
// - THE COPING IS A LIGHTER TOKEN. A wall's top face is horizontal, so it lands on rung 2 no
//   matter what; the only way to make the cap read as a separate course is a different token,
//   and `stoneLight` is one authored entry away from `stone`.
// - THE COURT IS OFF-CENTRE, TO THE EAST. The hero tree stands at ground (0, -6) with a 75-unit
//   crown; a court at the origin would sit under it and both would be illegible. Putting the
//   court at (46, 6) gives the island TWO centres of interest, which is what every reference
//   image has and what a single hero tree on a green field never did.
const WALLED_COURT: GPoint = { x: 54, z: 6 };

function walled(ctx: Ctx): Dressing {
  const groups: DressingGroup[] = [];
  const casters: ShadowCaster[] = [];
  const heightAt = ctx.heightAt;

  // The wall, just inside the rounded coast so it stands ON the land rather than off its edge.
  const wallLine = insetLoop(ctx.coast, 2.5);
  groups.push(
    run(
      growWallRun(closed(wallLine), {
        height: 6,
        thickness: 4.5,
        blockLength: 8,
        batter: 0.45,
        coping: true,
        heightAt,
        seed: ctx.seed,
      }),
    ),
  );
  casters.push(...runCasters(closed(wallLine), 2.4, 6));

  // The path ring: far enough inside the wall that a strip of grass reads between the two, which
  // is what stops the two stone tones merging into one grey band at delivered size.
  const pathRing = insetLoop(ctx.coast, 17);
  groups.push(
    run(
      // Eleven units and three slabs across — twenty-two delivered pixels of walked surface. The
      // first version at nine and two across read as a thin tan thread against the grass; a path
      // has to be wide enough that the eye follows it rather than noticing it.
      growPathRun(closed(pathRing), {
        width: 11,
        slabLength: 5.5,
        across: 3,
        thickness: 0.9,
        gap: 0.6,
        heightAt,
        seed: ctx.seed + 1,
      }),
    ),
  );

  // The court and its well — the second centre of interest.
  const court = ring(WALLED_COURT, 21, 12);
  groups.push(run(growPavedArea(court, { heightAt, kerb: true, token: PROP_TOKENS.paving })));
  groups.push(at(ctx, growWell({ radius: 7, wallHeight: 5, roof: true }), WALLED_COURT));
  casters.push({ x: WALLED_COURT.x, z: WALLED_COURT.z, radius: 7.5, height: 14 });
  // The court is DRESSED, not just paved. A well alone on a paved oval reads as a marker on a
  // patch; a pair of lanterns, a bench of crates and two big pots make it somewhere people stand,
  // which is the difference between the reference's well garden and a diagram of one.
  for (const s of [-1, 1]) {
    const lamp = offset(WALLED_COURT, s * 15, -13);
    groups.push(at(ctx, growLantern({ height: 11 }), lamp));
    casters.push({ x: lamp.x, z: lamp.z, radius: 1.8, height: 11 });
  }
  groups.push(at(ctx, growPot({ radius: 3.6, height: 5.2, contents: 'sapling', seed: 21 }), offset(WALLED_COURT, -14, 13)));
  groups.push(at(ctx, growPot({ radius: 3.4, height: 4.8, contents: 'blossom', seed: 22 }), offset(WALLED_COURT, 14, 14)));
  groups.push(at(ctx, growCrates({ seed: 7, count: 2, size: 2.8 }), offset(WALLED_COURT, 1, 17)));

  // A spur of path from the ring to the court, so the court is reached rather than stranded.
  const spurStart = nearestOn(pathRing, WALLED_COURT);
  groups.push(
    run(
      growPathRun([spurStart, WALLED_COURT], {
        width: 7,
        slabLength: 5,
        across: 2,
        heightAt,
        seed: ctx.seed + 2,
      }),
    ),
  );

  // Pots along the path. Spaced at 34 units — deliberately incommensurate with the ~16.5-unit
  // cell pitch, so the rhythm does not land on the parcel grid and re-create the per-cell
  // regularity the owner removed on 2026-08-16.
  const potSpots = resample(closed(pathRing), 34, false);
  const contents = ['shrub', 'blossom', 'marigold', 'sapling'] as const;
  potSpots.forEach((p, i) => {
    // Nudged inward off the path so the pot sits on grass beside it rather than in the way.
    const inward = towards(p, ctx.centre, 7);
    groups.push(
      at(
        ctx,
        growPot({ radius: 3, height: 4.5, contents: contents[i % contents.length]!, seed: i + 1 }),
        inward,
      ),
    );
    casters.push({ x: inward.x, z: inward.z, radius: 3, height: 7 });
  });

  // Two rail fences dividing the interior. In the well-garden reference the fences do not enclose
  // anything — they SEGMENT the plot, which is what stops a walled garden reading as one open
  // field with a border. Short runs rather than long ones, so they read as a screen between two
  // beds rather than as a second, weaker wall.
  const fences: [GPoint, GPoint][] = [
    [{ x: -74, z: -34 }, { x: -18, z: -30 }],
    [{ x: -6, z: 30 }, { x: 40, z: 38 }],
  ];
  fences.forEach((pair, i) => {
    const line = clipToIsland(ctx, pair[0], pair[1], 22);
    if (!line) return;
    groups.push(run(growFenceRun(line, { height: 5, postSpacing: 11, rails: 2, heightAt, seed: 30 + i })));
    casters.push(...runCasters(line, 1.2, 5));
  });

  // THE HEDGE RUN IS GONE, AND ITS OWN STATED REASON IS WHY. It was here as "a green mass with
  // a silhouette, standing in for the plants the thinning removed" — a stand-in for vegetation
  // this island did not have. It has vegetation now. Rendered together, a 4-unit hedge and a
  // 5-unit dome are the same object at delivered size: rows of small dark-green blobs beside
  // stands of small dark-green blobs, and the walled garden came out the busiest and least
  // legible island on the page because of it. Removing the stand-in is what lets the thing it
  // stood in for be read. The path ring keeps its own line without it, and the trees are planted
  // across the whole plot rather than being held off a hedge that is no longer there.

  // THE ORCHARD. A walled garden's trees are PLANTED, so they come in a few tight, even stands
  // in the quarters between the path ring and the wall, not scattered over the plot. More domes
  // than anywhere else on the page — a garden grows fruit, not cypress.
  //
  // ⚠ THE ASPECT AND THE DOME FRACTION ARE BOTH CORRECTIONS MADE BY LOOKING. The first version
  // asked for aspect 3.0 with three-quarters domes, and a dome is authored at 0.66 of the
  // spire's aspect: 3.0 x 0.66 = 1.98, which is under the floor, so the clamp fired and every
  // dome came out at exactly 2.0 world — 1.29 : 1 delivered. Barely on the tall side of square,
  // in a stand of mostly domes, next to a hedge run of similar blobs. It delivered the exact
  // failure this whole increment exists to avoid: the trees read as the shrub speckle wearing a
  // different name. At 3.4 a dome delivers 1.44 : 1 and a spire 2.19 : 1, and half of each
  // means the stand has a top edge rather than a line.
  //
  // SEVEN STANDS TO PLANT FIVE. The path ring, the court and the 8-unit rim inset between them
  // reject most of the plot, so five stands delivered eighteen trees at 5.0% canopy — the
  // thinnest island on the page, in the direction whose whole subject is CULTIVATED ground.
  // Asking for more stands rather than for a smaller avoid-gap is deliberate: a tree nine units
  // from a path is what makes the path read as walked, and buying trees by crowding it would
  // spend the thing this direction is actually about.
  const walledTrees = plantCanopy(ctx, {
    inset: 8,
    clusters: 7,
    perCluster: [4, 8],
    spread: 15,
    // The default stand separation is three spreads, which on this plot fits five centres and
    // no more — asking for seven changed nothing at all until this came down with it.
    clusterGap: 30,
    minGap: 9,
    avoid: [closed(pathRing), closed(court)],
    avoidGap: 9,
    minWidth: 5.5,
    maxWidth: 9,
    aspect: 3.4,
    domeFraction: 0.5,
    seedOffset: 40,
  });
  casters.push(...walledTrees.casters);

  return { groups, casters, plantFraction: 0.45, canopy: walledTrees.canopy };
}

// ---------------------------------------------------------------------------
// B — THE HAMLET
// ---------------------------------------------------------------------------
//
// A place people live. Three cottages on three different parcels, gravel paths worn between
// them, fenced yards, a well, and a coast left rocky rather than walled.
//
// THE CALLS:
//
// - NO PERIMETER WALL, ON PURPOSE. This is the direction that answers "does the island need to
//   be enclosed to read as a place?" — if A and B both read and only A has a wall, the wall is
//   not what did it. Keeping one variable genuinely absent is the only way that question stays
//   answerable, and the previous round had no such pair.
// - THREE BUILDINGS, NOT ONE. A single house on an island this size reads as a marker. Three
//   read as a relationship, and the paths between them are what carry it — the reference's
//   cottage image is mostly PATH and FENCE, with the house occupying maybe a fifth of the frame.
// - THE PATHS MEANDER. A dead-straight line between two points reads as drawn; a walked path
//   wanders. `meander` is seeded, so it is deterministic, and the sway is 8 units — about one
//   cottage width, which is enough to read as a curve at 2 px/unit and not so much that the
//   path stops looking like the shortest way there.
// - THE ROOFS RIDGE ALONG Z. See call (4): that is the orientation that reaches rung 3, and on
//   this direction the roofs are the brightest objects in the picture by a wide margin.
function hamlet(ctx: Ctx): Dressing {
  const groups: DressingGroup[] = [];
  const casters: ShadowCaster[] = [];
  const heightAt = ctx.heightAt;

  // Three well-separated parcels, chosen by geometry (area, then spread in x) rather than by
  // status — an art module does not read what a parcel means (ADR-0392 D5).
  const byArea = [...ctx.parcels].sort((a, b) => b.area - a.area);
  const sites = spread(byArea.map((p) => p.centroid), 3, 60);

  sites.forEach((site, i) => {
    // The parcel's centroid, pulled toward the island's own deepest interior point if it would
    // otherwise sit near the coast — a cottage half over the water edge reads as a bug.
    const seat = distance(site, ctx.centre) > 86 ? towards(site, ctx.centre, 18) : site;
    groups.push(
      at(
        ctx,
        growCottage({
          seed: i + 1,
          width: i === 0 ? 22 : 17,
          depth: i === 0 ? 16 : 13,
          wallHeight: 9,
          rise: 8,
          yaw: [0, 0.35, -0.28][i] ?? 0,
          porch: i === 0,
        }),
        seat,
      ),
    );
    casters.push({ x: seat.x, z: seat.z, radius: 10, height: 17 });
  });

  // Gravel paths between the cottages, and one out to the shore.
  const routes: GPoint[][] = [];
  for (let i = 0; i + 1 < sites.length; i++) {
    routes.push(meanderBetween(sites[i]!, sites[i + 1]!, ctx.seed + i));
  }
  routes.push(meanderBetween(sites[0]!, nearestOn(insetLoop(ctx.coast, 10), sites[0]!), ctx.seed + 9));
  for (const route of routes) {
    groups.push(
      run(
        // Ten units wide, three slabs across. Seven with a 1.1 joint gave slabs about 2.5 units
        // across — five delivered pixels — and the whole path read as a faint dotted line rather
        // than as a worn surface. Width is the lever that makes a path present at this size;
        // material contrast alone cannot rescue a track that is four pixels wide.
        growPathRun(route, {
          width: 10,
          slabLength: 4.5,
          across: 3,
          thickness: 0.7,
          gap: 0.8,
          heightAt,
          token: PROP_TOKENS.gravel,
          seed: ctx.seed + 20,
        }),
      ),
    );
  }

  // A fenced yard round each of the two smaller cottages.
  //
  // ⚠ NOT A CLOSED RING, AND THE FIRST VERSION WAS. A complete eight-sided ring of fence around a
  // cottage delivers as a hard orange ELLIPSE — the projection turns a circle in plan into an
  // ellipse on screen, and a uniform, unbroken one reads as a drawn annotation rather than as a
  // yard. Real yards have a gate and a side that runs into something else. Dropping three of the
  // eight spans opens the ring toward the path, which reads as an enclosure with a way in, and
  // breaks the ellipse that was doing the damage.
  sites.slice(1).forEach((site, i) => {
    const yard = ring(site, 18, 8, 0.3).slice(0, 6);
    groups.push(run(growFenceRun(yard, { height: 4.5, postSpacing: 10, rails: 2, heightAt, seed: 40 + i })));
    casters.push(...runCasters(yard, 1.1, 4.5));
  });

  // The village well, on the route between the first two cottages.
  const wellAt = midpoint(sites[0]!, sites[1] ?? sites[0]!);
  groups.push(at(ctx, growWell({ radius: 5, wallHeight: 4.5, roof: false }), wellAt));
  casters.push({ x: wellAt.x, z: wellAt.z, radius: 5, height: 4.5 });

  // Clutter — human-scale objects are what give a picture its sense of scale, and every
  // reference has some.
  groups.push(at(ctx, growCrates({ seed: 3, count: 3, size: 3 }), offset(sites[0]!, 14, 9)));
  groups.push(at(ctx, growPot({ radius: 3, height: 4, contents: 'marigold', seed: 5 }), offset(sites[0]!, -12, 7)));
  groups.push(at(ctx, growPot({ radius: 2.6, height: 3.6, contents: 'blossom', seed: 6 }), offset(sites[0]!, -9, 12)));

  // Boulders along the shore, so the unwalled edge has something on it.
  const shore = resample(insetLoop(ctx.coast, 7), 46, true);
  shore.forEach((p, i) => {
    groups.push(at(ctx, growRock({ seed: i + 11, radius: 4 + (i % 3), height: 3.5 + (i % 2) }), p));
    casters.push({ x: p.x, z: p.z, radius: 4, height: 4 });
  });

  // SHELTER. A hamlet's trees are what people left standing and what they planted for wind:
  // stands between the cottages and out toward the shore, kept off the worn routes. The widest
  // size range on the page, because a lived-in place accumulates trees of every age.
  const hamletTrees = plantCanopy(ctx, {
    inset: 9,
    clusters: 6,
    perCluster: [4, 9],
    spread: 19,
    minGap: 8.5,
    avoid: [...routes, ...sites.map((site) => ring(site, 20, 8))],
    avoidGap: 10,
    minWidth: 5,
    maxWidth: 10,
    aspect: 3.4,
    domeFraction: 0.45,
    seedOffset: 60,
  });
  casters.push(...hamletTrees.casters);

  return { groups, casters, plantFraction: 0.5, canopy: hamletTrees.canopy };
}

// ---------------------------------------------------------------------------
// C — THE TERRACES
// ---------------------------------------------------------------------------
//
// Worked ground: the island's own parcel boundaries become retaining walls, so the structure
// that is currently a faint bevel becomes architecture. Steps cross the walls, a stone channel
// carries water along one contour, and the planting runs in rows.
//
// THE CALLS:
//
// - THIS IS THE ONE DRESSING THAT USES THE ISLAND'S OWN STRUCTURE. A and B could be built on any
//   landmass; this one could not, because it is made of where the capabilities meet. That makes
//   it the most interesting direction if it reads and the most instructive if it does not.
// - THE WALLS ARE LOW — 3.5 UNITS. A terrace front is a step in the ground, not an enclosure.
//   At 3.5 units it delivers about 4.5 px of face at the 50-degree camera, which is enough to
//   read as an edge and not enough to cut the island into compartments.
// - ⚠ IT DRAWS BOUNDARIES, AND ON THE PRODUCT MAP THAT WOULD BE A SEMANTIC ACT. A drawn seam
//   between two capabilities is exactly the treatment the owner removed on 2026-08-16, and on
//   the shipped island it would assert a relationship. Here it asserts nothing (ADR-0406 D1) —
//   but if this direction is chosen, that is one of the things it COSTS, and the arc's end state
//   obliges saying so rather than discovering it at adoption.
// - NO HERO TREE. A terraced hillside with one enormous tree in the middle of it reads as a tree
//   with terraces behind it. The direction is about the ground, so the ground gets the frame.
function terrace(ctx: Ctx): Dressing {
  const groups: DressingGroup[] = [];
  const casters: ShadowCaster[] = [];
  const heightAt = ctx.heightAt;

  // The five largest parcels get a retaining front. Five rather than all eleven because at
  // delivered size eleven concentric walls is a maze, and because the largest parcels are the
  // ones whose fronts are long enough to read as terraces rather than as kerbs.
  // THREE parcels, not five, and the number was decided by looking. Five retaining fronts on an
  // island this size interlock into a maze — the walls stop reading as terrace edges and start
  // reading as a labyrinth, because a parcel outline is a blob rather than a contour and five
  // concentric blobs have no legible order. Three leaves grass between them, which is what makes
  // each one read as the edge of a level rather than as a partition.
  const big = [...ctx.parcels].sort((a, b) => b.area - a.area).slice(0, 3);
  // The retaining fronts, kept as they are built so the planting below can stand OFF them
  // rather than recompute them — `parcelLoop` throws for a parcel that is not one simple loop
  // (two of the eleven are not), and a second call would have to repeat that handling.
  const terraceFronts: GPoint[][] = [];
  big.forEach((parcel, i) => {
    // THE REAL PARCEL BOUNDARY, not a circle fitted to its area. That distinction is the whole
    // direction: a ring around a centroid would be five circles on a green field, and any island
    // could carry those. Walking the parcel's own outline is what makes the terraces made of
    // where the capabilities meet.
    let outline: GPoint[];
    try {
      outline = parcelLoop(ctx.cells, parcel.parcel);
    } catch {
      // A parcel whose cells do not form one simple loop has no single front to build. Skipping
      // it draws four terraces instead of five, which is a composition; guessing a circle for it
      // would draw something that is not the boundary and call it one.
      return;
    }
    const front = insetLoop(smoothLoop(outline, 1, true), 5);
    terraceFronts.push(closed(front));
    groups.push(
      run(
        growWallRun(closed(front), {
          height: 3.5,
          thickness: 3,
          blockLength: 6,
          batter: 0.45,
          coping: true,
          heightAt,
          seed: 50 + i,
        }),
      ),
    );
    casters.push(...runCasters(closed(front), 1.6, 3.5));

    // One flight of steps per terrace, crossing the front on its light-facing (west) side so the
    // treads catch the same rung the wall's own top face is on and the flight reads as a flight
    // rather than as a notch.
    const west = front.reduce((a, b) => (b.x < a.x ? b : a), front[0]!);
    const inward = towards(west, parcel.centroid, 7);
    groups.push(
      run(
        growSteps(towards(west, parcel.centroid, -6), inward, {
          steps: 4,
          width: 9,
          rise: 3.6,
          baseY: heightAt(west.x, west.z),
        }),
      ),
    );
  });

  // A stone water channel along the island's long axis — the only teal on the picture, and the
  // thing that says this ground is worked rather than merely stepped. Clipped to the island, so
  // the ends land on ground rather than in the sea.
  const channel = keepInside(
    ctx,
    [
      { x: -96, z: -14 },
      { x: -40, z: -4 },
      { x: 18, z: 6 },
      { x: 74, z: 2 },
      { x: 100, z: -8 },
    ],
    9,
  );
  groups.push(run(growWaterChannel(channel, { width: 5, kerbHeight: 1.4, kerbWidth: 1.6, heightAt })));
  casters.push(...runCasters(channel, 2.6, 1.4));

  // Crop rows, at 23-unit spacing — deliberately incommensurate with the ~16.5-unit cell pitch, so
  // the rhythm does not land on the parcel grid and re-create the per-cell regularity the owner
  // removed on 2026-08-16. Each row is CLIPPED to the island; a row that would fall entirely in
  // the water is simply not drawn.
  //
  // ⚠ TWO OF THE FIVE ROWS ARE FLOWERING, AND THAT IS A CORRECTION THIS DIRECTION NEEDED. Built
  // of stone, gravel, water and hedge alone, the terraces delivered FIVE materials — grey, green
  // and one teal line — which is a monochrome island with steps in it, i.e. the exact failure the
  // whole increment exists to fix, reproduced inside a direction meant to fix it. Alternating
  // marigold and blossom through the rows is what a worked hillside actually looks like and is
  // the cheapest colour available, because a crop row is already a mass with a silhouette.
  const cropTokens = [
    PROP_TOKENS.hedge,
    PROP_TOKENS.marigold,
    PROP_TOKENS.hedge,
    PROP_TOKENS.blossom,
    PROP_TOKENS.hedge,
  ];
  for (let i = 0; i < 5; i++) {
    const z = -46 + i * 23;
    // ⚠ THE ROWS ARE CLIPPED WELL INSIDE THE COAST AND EACH ONE IS TILTED. Run edge to edge and
    // dead level they delivered as five horizontal STRIPES across the whole island, which reads as
    // a flag rather than as planting — a row that spans everything belongs to nothing. Pulling
    // them 26 units off the coast leaves grass at both ends, and a small alternating tilt (about
    // four degrees) stops the five from being parallel lines at even spacing, which is the shape
    // the eye reads as a pattern rather than as a field.
    const tilt = (i % 2 === 0 ? 1 : -1) * 8;
    const line = clipToIsland(ctx, { x: -110, z: z - tilt }, { x: 110, z: z + tilt }, 26);
    if (!line) continue;
    groups.push(
      run(
        growHedgeRun(line, {
          height: 3.4,
          width: 3.6,
          lobeSpacing: 5,
          heightAt,
          seed: 60 + i,
          token: cropTokens[i]!,
        }),
      ),
    );
  }

  // A gravel track down one side, so the terraces are reached.
  const track = keepInside(
    ctx,
    [
      { x: -104, z: 30 },
      { x: -30, z: 40 },
      { x: 44, z: 34 },
      { x: 100, z: 20 },
    ],
    9,
  );
  groups.push(
    run(growPathRun(track, { width: 6, slabLength: 4, across: 2, heightAt, token: PROP_TOKENS.gravel, seed: 71 })),
  );

  // A rail fence along the track's upper side, and the working clutter at its head. Both are here
  // for the same reason the flowering rows are: a hillside of stone and green is not a worked
  // hillside, it is a quarry. Wood and fired clay are what say somebody tends this.
  const rail = clipToIsland(ctx, track[0]!, track[track.length - 1]!, 14);
  if (rail) {
    groups.push(run(growFenceRun(rail, { height: 4, postSpacing: 12, rails: 2, heightAt, seed: 72 })));
    casters.push(...runCasters(rail, 1.1, 4));
  }
  const yardHead = track[1] ?? track[0]!;
  groups.push(at(ctx, growCrates({ seed: 4, count: 3, size: 2.8 }), offset(yardHead, 6, -9)));
  groups.push(at(ctx, growPot({ radius: 3, height: 4.4, contents: 'marigold', seed: 12 }), offset(yardHead, -7, -6)));
  groups.push(at(ctx, growPot({ radius: 2.6, height: 3.8, contents: 'shrub', seed: 13 }), offset(yardHead, -1, -12)));

  // WORKED GROUND KEEPS ITS TREES AT THE MARGINS. Nothing grows on a terrace that is being
  // cropped, so the stands sit outside the retaining fronts, on the ground the terracing left
  // over. All spires and NO domes: a narrow cypress against a worked hillside is exactly what
  // the reference's own ochre island does, and it is the one silhouette that reads at all
  // against a horizontal-banded slope.
  //
  // ⚠ THE COUNT AND THE SIZE ARE A CORRECTION MADE BY LOOKING. The first version planted five
  // small stands of narrow spires, and against six near-white UAT daisies the terraces came out
  // the one island whose brightest objects were the flowers. Removing the hero tree took away
  // the picture's dark end everywhere, and it is the CANOPY that has to put it back — on every
  // other direction it does, and here it did not because there were too few trees and each was
  // too thin. Six stands of larger spires restores the range without touching the data.
  const terraceTrees = plantCanopy(ctx, {
    inset: 7,
    clusters: 6,
    perCluster: [4, 8],
    spread: 15,
    minGap: 8,
    avoid: [track, ...terraceFronts],
    avoidGap: 11,
    minWidth: 5.5,
    maxWidth: 8.5,
    aspect: 4,
    domeFraction: 0,
    seedOffset: 80,
  });
  casters.push(...terraceTrees.casters);

  return { groups, casters, plantFraction: 0.3, canopy: terraceTrees.canopy };
}

// ---------------------------------------------------------------------------
// D — THE SHRINE COURT
// ---------------------------------------------------------------------------
//
// A monument, approached. A raised stone platform carries a timber pavilion; a stepping-stone
// path runs to it from a gate at the shore, lit by lanterns; the ground around it is raked
// gravel rather than grass.
//
// THE CALLS:
//
// - THE PAVILION REPLACES THE HERO TREE AS THE FOCAL MASS, which is the arc's live question put
//   as a picture: the previous round found that removing the tree left the island "emptier
//   rather than cleaner" because nothing else was tall or dark. A pavilion is both, and it is
//   also the one object on the page whose roof is large enough for rung 3 to be a real area of
//   colour rather than a highlight.
// - THE GROUND IS MOSTLY EMPTY, AND THAT IS THE RISK THIS DIRECTION TAKES. Every other dressing
//   answers the reference count by adding kinds of object. This one answers it by SUBTRACTION —
//   few objects, all large, on a swept surface. If it reads, it says the count was never the
//   whole story and composition was; if it does not, that is worth knowing too, and it is the
//   cheapest possible way to find out.
// - THE LANTERNS ARE THE ONLY THINGS WEARING `PROP_TOKENS.lantern`, the palette's brightest
//   entry. Five of them, small, on a dark court — a bright token used anywhere else would stop
//   being an accent.
const SHRINE_CENTRE: GPoint = { x: 0, z: 2 };

function shrine(ctx: Ctx): Dressing {
  const groups: DressingGroup[] = [];
  const casters: ShadowCaster[] = [];
  const heightAt = ctx.heightAt;

  // A narrow gravel apron following the SMOOTHED coast, so this direction gets the rounded outline
  // too — by its own means. The walled garden gets it from a wall and the wild shore from a band of
  // sand; a monument's answer is a swept edge, which is both in character and structurally distinct
  // from the other two. Without it the shrine read as a house on a hexagon board, which is exactly
  // the complaint this whole increment exists to answer, surviving inside one of its directions.
  groups.push(
    run(
      // ⚠ NARROW AND THIN, AND THE REASON IS THAT TWO DIRECTIONS MUST NOT CONVERGE. At nine units
      // and two slabs across, this apron delivered as a pale band at the coast that read, at a
      // glance, like the walled garden's retaining wall — and "they all look the same" is the exact
      // verdict this whole increment exists to answer, so two directions arriving at the same
      // silhouette by different means is a failure even when each is defensible alone. Six units,
      // one slab across and half the thickness keeps the rounded outline while staying visibly
      // FLAT: a swept margin, not masonry.
      growPathRun(closed(insetLoop(ctx.coast, 4)), {
        width: 6,
        slabLength: 8,
        across: 1,
        thickness: 0.4,
        gap: 0.6,
        heightAt,
        token: PROP_TOKENS.gravel,
        seed: ctx.seed + 50,
      }),
    ),
  );

  // The raked court, then the platform standing in it. Radius 40 rather than anything larger: the
  // island's ground box is 233 x 135, but its CORNERS are water — it is a hex cluster whose outer
  // rows are shorter — so a court sized off the box would spill off the edge at the top and
  // bottom.
  groups.push(
    run(
      growPavedArea(ring(SHRINE_CENTRE, 40, 16), {
        thickness: 0.6,
        heightAt,
        token: PROP_TOKENS.gravel,
        kerb: true,
        kerbToken: PROP_TOKENS.stone,
      }),
    ),
  );
  groups.push(
    at(ctx, growPlatform({ profile: ring({ x: 0, z: 0 }, 26, 9), height: 4, courses: 3 }), SHRINE_CENTRE),
  );
  // ⚠ THE PAVILION IS BIGGER THAN THE FIRST VERSION, AND THE REASON IS A LOOK RATHER THAN A RULE.
  // At 28 x 21 on a 40-unit court it read as a shed on a beige disc — the court was the object and
  // the building was a detail on it, which is the opposite of what a monument does. At 40 x 26 the
  // roof spans two thirds of the platform and the building becomes the mass the court exists to
  // frame. This is the kind of call ADR-0392 D2 hands to the session; it is recorded because it
  // was made by looking at a delivered-size render, which is the only way it could have been made.
  groups.push(
    at(ctx, growPavilion({ width: 40, depth: 26, postHeight: 13, rise: 13, plinth: false }), SHRINE_CENTRE, 4),
  );
  casters.push({ x: SHRINE_CENTRE.x, z: SHRINE_CENTRE.z, radius: 20, height: 30 });

  // The approach: a gate at the shore, stepping stones to the court, lanterns along the way.
  const gate = nearestOn(insetLoop(ctx.coast, 9), { x: -110, z: 30 });
  groups.push(at(ctx, growArch({ width: 12, height: 14, depth: 4, yaw: 0.5 }), gate));
  casters.push({ x: gate.x, z: gate.z, radius: 6, height: 14 });

  const approach = meanderBetween(gate, offset(SHRINE_CENTRE, -40, -14), ctx.seed + 3, 6);
  groups.push(
    run(
      // ONE slab across and a wide joint: stepping stones, not paving. The stones are 7 units — big
      // enough that a single one is fourteen delivered pixels and reads as a stone. The first
      // version used 4.5 with a 3.4 gap and the whole approach vanished into the grass: below about
      // ten delivered pixels an isolated mark stops being an object and becomes noise, and a line
      // of noise is not a path.
      growPathRun(approach, {
        width: 7,
        slabLength: 7,
        across: 1,
        thickness: 0.9,
        gap: 3,
        heightAt,
        seed: ctx.seed + 31,
      }),
    ),
  );
  // Lanterns down the approach, alternating sides. Taller than a person and set well off the path,
  // so the row reads as lighting the way rather than as fenceposts in it.
  resample(approach, 26, false).forEach((p, i) => {
    const side = offset(p, 0, i % 2 === 0 ? 9 : -9);
    groups.push(at(ctx, growLantern({ height: 13 }), side));
    casters.push({ x: side.x, z: side.z, radius: 2, height: 13 });
  });

  // A channel running ALONGSIDE the approach and into the court, rather than across open grass.
  // The first version put a teal arc through empty ground north of the court, and a channel that
  // starts nowhere and ends nowhere reads as a rendering artefact rather than as water — the eye
  // needs to see what it serves. Offsetting the approach's own polyline gives it a purpose and a
  // pair of ends.
  const beside = approach.map((p, i, all) => {
    const nextPoint = all[Math.min(i + 1, all.length - 1)]!;
    const prev = all[Math.max(i - 1, 0)]!;
    const dx = nextPoint.x - prev.x;
    const dz = nextPoint.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x + (-dz / l) * 13, z: p.z + (dx / l) * 13 };
  });
  groups.push(
    run(growWaterChannel(keepInside(ctx, beside, 8), { width: 4.5, kerbHeight: 1.3, kerbWidth: 1.5, heightAt })),
  );

  // ⚠ THE TWO LONG HEDGE RUNS THAT FLANKED THE COURT ARE GONE, AND THE REASON IS WORTH RECORDING
  // because it is a projection failure rather than a taste one. They ran north-south at x = ±58,
  // and at this camera a north-south line foreshortens by sin(50 degrees) while its own height
  // does not — so a 52-unit hedge delivered as a narrow, nearly-vertical green BAR about six
  // pixels wide and forty tall. It read as two green pillars standing on the island. A run's
  // heading is therefore not a free choice here: an east-west run reads as a hedge and a
  // north-south one reads as a post, and that is true of every linear prop on this island.
  //
  // What replaces them does the job the hedges were there for — containing the court — without
  // the heading problem: clipped BLOCKS of hedge set east and west of the court, wide rather than
  // long, plus rocks, which is what a raked court actually carries.
  for (const s of [-1, 1]) {
    const line = clipToIsland(
      ctx,
      offset(SHRINE_CENTRE, s * 46, 34),
      offset(SHRINE_CENTRE, s * 84, 26),
      10,
    );
    if (!line) continue;
    groups.push(run(growHedgeRun(line, { height: 5, width: 7, lobeSpacing: 5, heightAt, seed: 80 + s })));
  }
  // Set stones around the court — the one thing a swept gravel court is never without, and the
  // cheapest way to stop the court reading as an empty disc.
  const stones = scatter({
    loop: insetLoop(ctx.coast, 26),
    count: 9,
    seed: ctx.seed + 12,
    minGap: 26,
    edgeGap: 4,
    avoid: [ring(SHRINE_CENTRE, 30, 12)],
    avoidGap: 6,
  });
  stones.forEach((p, i) => {
    groups.push(at(ctx, growRock({ seed: i + 41, radius: 3.5 + (i % 3), height: 3 + (i % 2) }), p));
    casters.push({ x: p.x, z: p.z, radius: 4, height: 3.5 });
  });

  // 0.30 rather than 0.18. At 0.18 the island outside the court was bare green, and "swept" needs
  // something to be swept CLEAR OF — an empty field reads as unfinished, not as disciplined.
  // AN AVENUE AND A DARK GROVE — the only planting on the page that is a COMPOSITION rather
  // than a habitat. Two tight stands flanking the approach and one behind the court, all
  // spires, all tall, in the deeper `canopyDark`: this is the direction whose thesis is
  // subtraction, and thirty scattered trees would refute it. Fewest trees, biggest each.
  const shrineTrees = plantCanopy(ctx, {
    inset: 10,
    clusters: 3,
    perCluster: [5, 8],
    spread: 16,
    minGap: 10,
    avoid: [approach, closed(ring(SHRINE_CENTRE, 44, 12))],
    avoidGap: 13,
    minWidth: 6.5,
    maxWidth: 10,
    aspect: 4.2,
    domeFraction: 0,
    token: PROP_TOKENS.canopyDark,
    seedOffset: 100,
  });
  casters.push(...shrineTrees.casters);

  return { groups, casters, plantFraction: 0.3, canopy: shrineTrees.canopy };
}

// ---------------------------------------------------------------------------
// E — THE WILD SHORE
// ---------------------------------------------------------------------------
//
// Nothing built. A sand shore rounding the coast, rock outcrops, a stone-rimmed pool, a boat
// pulled up, and vegetation dense and varied enough to have masses in it.
//
// THE CALLS:
//
// - THIS IS THE CONTROL FOR THE WHOLE PROP HYPOTHESIS. If the diagnosis is right, an island
//   given materials and masses but no architecture should still read far better than the round
//   the owner rejected — because it gains sand, stone, water, blossom and a shore, which is five
//   materials against one. If it reads no better than the rejected round, the finding is that
//   BUILDINGS are what those references were carrying, and that is a genuinely different
//   worklist. Either answer is worth the picture.
// - THE SHORE BAND IS A PATH RUN IN SAND, and that is a construction trick worth naming: an
//   annulus is not convex, so it cannot be one extruded ring. A wide, three-across run of sand
//   slabs following the smoothed coast is an annulus made of convex pieces, and it drapes over
//   the relief for free because each slab sits at its own ground height.
// - COLOUR COMES FROM FLOWERING THICKETS rather than from pots, because a pot is a built object
//   and this island has none. `growHedgeRun` wearing `blossom` and `marigold` is a mass of
//   colour with a silhouette — which is what call (3) says the thinned plants have to be
//   replaced by.
function wild(ctx: Ctx): Dressing {
  const groups: DressingGroup[] = [];
  const casters: ShadowCaster[] = [];
  const heightAt = ctx.heightAt;

  // The sand shore, following the rounded coast.
  const shoreLine = insetLoop(ctx.coast, 6);
  groups.push(
    run(
      growPathRun(closed(shoreLine), {
        width: 15,
        slabLength: 9,
        across: 3,
        thickness: 0.5,
        gap: 0.4,
        heightAt,
        token: PROP_TOKENS.sand,
        seed: ctx.seed + 40,
      }),
    ),
  );

  // Outcrops. Scattered by the layout module with a minimum gap, so they cluster like rock
  // rather than dotting like punctuation — and kept off the shore band so the two read apart.
  const rocks = scatter({
    loop: insetLoop(ctx.coast, 20),
    count: 14,
    seed: ctx.seed + 5,
    minGap: 17,
    edgeGap: 4,
  });
  rocks.forEach((p, i) => {
    const big = i % 4 === 0;
    groups.push(
      at(ctx, growRock({ seed: i + 21, radius: big ? 8 : 4.5, height: big ? 9 : 4, lobes: big ? 4 : 3 }), p),
    );
    casters.push({ x: p.x, z: p.z, radius: big ? 8 : 4.5, height: big ? 9 : 4 });
  });

  // The rock pool: a well with no roof is a stone-rimmed basin, which is exactly the shape a
  // pool wants and costs no new generator.
  const pool: GPoint = { x: -54, z: 22 };
  groups.push(at(ctx, growWell({ radius: 11, wallHeight: 3, roof: false }), pool));
  casters.push({ x: pool.x, z: pool.z, radius: 11, height: 3 });

  // A boat pulled up on the shore, and driftwood beside it — the two objects that put a human
  // scale on an island with no buildings.
  const beach = nearestOn(shoreLine, { x: 78, z: 44 });
  groups.push(at(ctx, growBoat({ length: 14, beam: 5, yaw: 0.9 }), beach));
  casters.push({ x: beach.x, z: beach.z, radius: 5, height: 3 });
  groups.push(at(ctx, growCrates({ seed: 9, count: 2, size: 2.6 }), offset(beach, -13, -6)));

  // Flowering thickets — the colour, carried by masses rather than by pots.
  const thickets: { line: GPoint[]; token: string; height: number }[] = [
    { line: [{ x: -92, z: -18 }, { x: -58, z: -30 }], token: PROP_TOKENS.blossom, height: 4.5 },
    { line: [{ x: 22, z: -38 }, { x: 62, z: -30 }], token: PROP_TOKENS.marigold, height: 3.8 },
    { line: [{ x: -18, z: 36 }, { x: 26, z: 44 }], token: PROP_TOKENS.hedge, height: 5 },
    { line: [{ x: 84, z: -8 }, { x: 102, z: 12 }], token: PROP_TOKENS.hedge, height: 4.2 },
  ];
  thickets.forEach((t, i) => {
    groups.push(
      run(growHedgeRun(t.line, { height: t.height, width: 7, lobeSpacing: 4, heightAt, seed: 90 + i, token: t.token })),
    );
    casters.push(...runCasters(t.line, 3.4, t.height));
  });

  // THICKETS. Nothing cleared this island, so it carries the most trees, in the loosest and
  // most overlapping stands — the only dressing where crowns are meant to merge into one mass.
  // It also takes the page's ONE warm canopy: the reference recolours a whole island's trees
  // together rather than adding a species, and a rust shore against teal water is the clearest
  // demonstration of that available. The pool and the beach are kept clear.
  const wildTrees = plantCanopy(ctx, {
    inset: 6,
    clusters: 7,
    perCluster: [5, 11],
    spread: 21,
    minGap: 7.5,
    clusterGap: 44,
    avoid: [closed(ring(pool, 22, 10)), closed(ring(beach, 26, 10))],
    avoidGap: 6,
    minWidth: 5,
    maxWidth: 9.5,
    aspect: 3.6,
    domeFraction: 0.5,
    token: PROP_TOKENS.canopyRust,
    seedOffset: 120,
  });
  casters.push(...wildTrees.casters);

  return { groups, casters, plantFraction: 0.7, canopy: wildTrees.canopy };
}

// ---------------------------------------------------------------------------
// small geometric helpers — kept here rather than in `prop-layout.ts` because each one exists
// to serve a composition decision above, not to describe the island
// ---------------------------------------------------------------------------

function offset(p: GPoint, dx: number, dz: number): GPoint {
  return { x: p.x + dx, z: p.z + dz };
}

/**
 * Trim a straight line to the part of it that is actually ON the island, with a margin.
 *
 * ⚠ THIS EXISTS BECAUSE THE ISLAND IS A HEX CLUSTER AND ITS BOUNDING BOX LIES. The ground spans
 * 233.8 x 135.1 units, but the corners of that box are open water: the outer hex rows are shorter
 * than the middle one, and two of the fifteen grid positions carry no tile at all. So a crop row
 * or a water channel authored as "from x = -78 to x = +78 at z = -46" — a perfectly reasonable
 * thing to write against the bounds — hangs off the edge at both ends and reads as a modelling
 * error, not as a composition.
 *
 * Hand-checking each literal against the tile list is exactly the sort of arithmetic that is
 * right the day it is written and wrong the next time the fixture changes. So the line is CLIPPED
 * to the island instead: sample it densely, keep the longest contiguous run of samples inside the
 * coast (inset by `margin`), and return that run's ends. A line entirely off the island returns
 * `null`, and the caller draws nothing rather than drawing something wrong.
 */
function clipToIsland(
  ctx: Ctx,
  a: GPoint,
  b: GPoint,
  margin: number,
): [GPoint, GPoint] | null {
  const fence = insetLoop(ctx.coast, margin);
  const steps = 96;
  let bestStart = -1;
  let bestLen = 0;
  let start = -1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (insideLoop(fence, p)) {
      if (start < 0) start = i;
      if (i - start + 1 > bestLen) {
        bestLen = i - start + 1;
        bestStart = start;
      }
    } else {
      start = -1;
    }
  }
  // Two samples is a segment about 2% of the line long — below that it is a sliver, and a sliver
  // of wall or channel reads as debris.
  if (bestStart < 0 || bestLen < 3) return null;
  const at = (i: number): GPoint => ({
    x: a.x + ((b.x - a.x) * i) / steps,
    z: a.z + ((b.z - a.z) * i) / steps,
  });
  return [at(bestStart), at(bestStart + bestLen - 1)];
}

/** The same clip for a multi-point route: every point pulled inside the coast if it strays. A
 *  route is a sequence of DESTINATIONS rather than a straight line, so pulling a stray point in
 *  keeps the route's shape where trimming it would lose a leg. */
function keepInside(ctx: Ctx, points: readonly GPoint[], margin: number): GPoint[] {
  const fence = insetLoop(ctx.coast, margin);
  return points.map((p) => (insideLoop(fence, p) ? p : nearestOn(fence, p)));
}

function midpoint(a: GPoint, b: GPoint): GPoint {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/** The point of `loop` nearest `p` — where a spur leaves a ring, where a gate meets a shore. */
function nearestOn(loop: readonly GPoint[], p: GPoint): GPoint {
  let best = loop[0]!;
  let bestD = Infinity;
  for (const q of loop) {
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** `d` units from `a` toward `b`. */
function towards(a: GPoint, b: GPoint, d: number): GPoint {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: a.x + (dx / l) * d, z: a.z + (dz / l) * d };
}

/** Pick `count` points from `candidates` that are at least `gap` apart, in the order given.
 *  Returns fewer if the candidates cannot supply that many — a site list that quietly wrapped
 *  around and put two cottages on top of each other would read as a modelling bug. */
function spread(candidates: readonly GPoint[], count: number, gap: number): GPoint[] {
  const out: GPoint[] = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (out.every((p) => Math.hypot(p.x - c.x, p.z - c.z) >= gap)) out.push(c);
  }
  // If the gap could not be met, fall back to the first `count` candidates rather than to a
  // shorter list: an island missing a cottage looks like a composition choice.
  if (out.length < count) {
    for (const c of candidates) {
      if (out.length >= count) break;
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

/** A walked route: a straight line with a seeded lateral sway, sampled at five points. Straight
 *  lines read as drawn; a path that wanders reads as walked. */
function meanderBetween(a: GPoint, b: GPoint, seed: number, sway = 8): GPoint[] {
  const steps = 5;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l;
  const nz = dx / l;
  const out: GPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // A single sine hump rather than a random walk: a wandering path with a seeded jitter per
    // point reads as a wobble, which looks like a defect. One smooth deviation reads as terrain
    // avoided. The seed only picks WHICH WAY it bends.
    const bend = Math.sin(t * Math.PI) * sway * (seed % 2 === 0 ? 1 : -1);
    out.push({ x: a.x + dx * t + nx * bend, z: a.z + dz * t + nz * bend });
  }
  return out;
}

const DRESSINGS = {
  walled,
  hamlet,
  terrace,
  shrine,
  wild,
} satisfies Record<DressingName, (ctx: Ctx) => Dressing>;

/**
 * Build one named dressing for an island.
 *
 * DETERMINISTIC BY CONSTRUCTION (ADR-0380 D6 fence 2, restated by ADR-0406 D5): the result is a
 * pure function of the ground cells, the relief amplitude and the seed. Nothing here reads a
 * clock or a random source, so the same island renders identically in a capture, in a test and
 * in a browser — which is what makes a picture evidence rather than an anecdote.
 */
export function buildDressing(name: DressingName, opts: DressingOptions): Dressing {
  // A CACHE RATHER THAN A CONVENIENCE, for the same reason `IslandView`'s shadow-field map is
  // one. A dressing is a few hundred props' worth of geometry and it is a pure function of these
  // three inputs, so an evidence page that draws the same island twice — once in the choice row,
  // once in its own section — would otherwise generate it twice. That page's capture gates on a
  // settled signal with a 30-second ceiling, and the failure mode when it is missed is not a slow
  // run: it is a canvas photographed before it has painted, which the harness reports as a blank
  // panel and refuses.
  //
  // ⚠ THE KEY FINGERPRINTS THE CELLS INCLUDING THEIR STATUS, EVEN THOUGH NO DRESSING READS
  // STATUS — and the reason is a test, not a doubt. The invariant at the top of this file says a
  // dressing places props by GEOMETRY and never by what a parcel means, and
  // `island-dressing.test.ts` proves it by building the same dressing on two scenes that differ
  // ONLY in one capability's status and asserting the geometry is identical. If the key ignored
  // status, both builds would hit the same cache entry, the assertion would compare an object to
  // itself, and the test would pass for a reason that has nothing to do with the property — the
  // vacuous green this repo has paid for more than once. Keying conservatively costs one string
  // per call and keeps the instrument able to fail.
  const key = `${name}|${opts.relief}|${opts.seed ?? 7}|${fingerprint(opts.cells)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = DRESSINGS[name](context(opts));
  cache.set(key, built);
  return built;
}

const cache = new Map<string, Dressing>();

/**
 * Empty the cache. A TEST HOOK, and it exists because without it the determinism test is
 * vacuous: two identical calls hit one cache entry, and asserting that an object equals itself is
 * a green that proves nothing about the generator. Clearing between the two builds is what makes
 * the comparison a comparison. Nothing in the renderer calls it.
 */
export function clearDressingCache(): void {
  cache.clear();
}

/** A cheap, complete-enough identity for a cell set: how many cells, what each one's status and
 *  parcel are, and where the whole thing sits. Cheap because it runs once per canvas and the
 *  alternative — hashing 164 polygons' worth of floats — would cost more than the build it
 *  guards on the only page that draws more than one island. */
function fingerprint(cells: readonly GroundCell[]): string {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const parts: string[] = [];
  for (const c of cells) {
    parts.push(`${c.status}/${c.parcel ?? ''}/${c.points.length}`);
    for (const p of c.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minZ) minZ = p.y;
      if (p.y > maxZ) maxZ = p.y;
    }
  }
  const r = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : 'x');
  return `${cells.length};${r(minX)},${r(maxX)},${r(minZ)},${r(maxZ)};${parts.join('|')}`;
}

/** Every dressing's name, for a page or a test that wants to walk them all. Sorted so the order
 *  is stable rather than dependent on the record literal's key order surviving an edit. */
export function dressingNames(): DressingName[] {
  return (Object.keys(DRESSINGS) as DressingName[]).sort();
}

/** Convenience for tests: build a dressing straight from a scene. */
export function dressingForScene(
  name: DressingName,
  scene: Parameters<typeof groundCellsFrom>[0],
  relief: number,
): Dressing {
  return buildDressing(name, { cells: groundCellsFrom(scene), relief });
}
