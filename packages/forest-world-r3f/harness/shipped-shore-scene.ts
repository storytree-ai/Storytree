// shipped-shore-scene.ts - THREE WIDTHS OF SHORE, COSTED AGAINST EACH OTHER AND AGAINST THE MAP
// WHOSE LAND DOES NOT FALL TO ITS COAST AT ALL.
//
// THE INCREMENT: the landform that falls to the shore, on `adopt-the-land-into-the-shipped-map-arc`
// - the SECOND of the approved treatment's six components, and the one the arc's own start-order
// note had lost track of. It could not have been built before the coast clip landed: a landform
// that falls to the shore needs a shore to fall to, and until 2026-09-01 the shipped mesh ended in
// raw 120-degree hex corners.
//
// WHAT WAS ESTABLISHED BEFORE THIS PAGE, by grep rather than inference. `src/land-relief.ts` is an
// unbounded sum of three sines and a function of POSITION ONLY - there is no shore term anywhere
// in it, and a repo-wide search for a shore falloff, a shore height term or a beach dip returns
// exactly one hit: the sentence in the reference README naming the component as WANTED. So the
// beach the coast clip added stands at whatever height the sine sum happens to give it, and PR
// #1776's own README says so in terms.
//
// WARNING - THE FORK THIS PAGE EXISTS TO SETTLE IS A NUMBER MISMATCH RATHER THAN A DESIGN CHOICE.
// The approved render's generator (`docs/research/chapter2-land-idiom-2026-08-27/build_land.py`)
// authors the landform in four lines, and this page transcribes them exactly:
//
//     BEACH = 3.1                                # shore band width, ground units
//     fall  = smoothstep(clip(shore / BEACH))
//     z     = relief * fall
//     z    -= 0.62 * (1 - fall)                  # the beach dips below the grass line
//
// The two scales AGREE - the generator's `ASPECT = 233.8 / 135.1` is "the real island's ground
// footprint" and the shipped island measures 234 units across - so 3.1 and 0.62 transfer as
// authored. But the beach THIS map draws is `COAST_OUTSET` = 7 units wide, more than twice the
// reference's band. So the authored width would leave over half of our own beach standing at full
// height. That is the question, and the arms are three answers to it:
//
//   `authored` - 3.1, the generator's own number. Faithful, and it finishes rising less than half
//                way across the beach the coast clip added.
//   `beach`    - 7, `COAST_OUTSET`. The fall covers exactly the land the coast added and no more,
//                so every prop still stands on ground that has not moved.
//   `shelf`    - 16.5, the island's mean parcel diameter. The fall reaches a whole parcel inland,
//                so the shore is a shelf rather than a lip - and it DOES move the ground under
//                props placed before the coast existed.
//
// AND `none` IS THE CONTROL AND THE DENOMINATOR: the map exactly as it draws today, coast and all.
//
// WARNING - ONE VARIABLE MOVES AND IT IS THE BAND WIDTH. Every arm is clipped to the SAME shipped
// coast ({@link SHIPPED_COAST}), wears the same ladder, grain, occlusion atlas, light and camera,
// and carries the same 0.62 dip. A pixel difference between two arms is attributable to the width
// and to nothing else on the page.
//
// WARNING - THE GEOMETRY COUNTERS ARE EXPECTED TO BE IDENTICAL ACROSS EVERY ARM, AND THAT IS A
// RESULT RATHER THAN AN OVERSIGHT. The shore fall moves vertices in Y and creates none, so
// triangles, ring vertices, attribute bytes and ground area cannot move - the component is exactly
// free in every count the coast increment spent. What it moves is the SHAPE: the vertical extent,
// how many vertices it touches at all, and - because the banded material quantises `dot(n, L)` -
// which RUNG each one lands on, which is the delivered colour. {@link ShorePlan} measures those
// instead, and a page reporting a triangle delta here would be reporting a bug.
//
// WARNING - THE DENOMINATOR IS QUOTED FOR THE REASON THE COAST PAGE QUOTES IT, AND IT DEGENERATES
// THE SAME WAY. A shore band is a thin annulus, so a percentage of the whole frame reads as nothing
// beside two pictures that are obviously different lands. Here the control and the reference are
// the SAME arm, so an arm-vs-control figure already IS the band's own footprint; the denominator
// earns its keep on the arm-vs-arm table, where 3.1 against 7 against 16.5 is the actual question.
//
// THE PAGE ADOPTS NOTHING. `harness/` only - it produces EVIDENCE about the `src/` module it
// imports. The adoption is a separate edit in the same landing.

import * as THREE from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundAtlasTexture,
  type BandedGroundMaterialOptions,
} from '../src/banded-ground-material.js';
import { cellGroundGeometry, triangulateRing } from '../src/cell-ground-geometry.js';
import {
  COAST_OUTSET,
  SHIPPED_COAST,
  clipToCoast,
  isSimpleRing,
  vertexKey,
} from '../src/coast-clip.js';
import { groundBounds } from '../src/ground-casters.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { rungOfNormal } from '../src/shade-ladder.js';
import {
  SHORE_ARMS,
  SHORE_ARM_WIDTH,
  shoreField,
  shoreRelief,
  type ShoreArm,
} from '../src/shore-fall.js';
import { SHORE_ARM_INSETS, armHasRing, shoreArmRingPlan } from '../src/shore-ring.js';
import { SHADOW_GRES } from '../src/land-shadow.js';
import { SHADOW_ATLAS_MAX, buildAtlasOcclusion, atlasOriginResolver, islandGroundBounds, packShadowAtlas } from '../src/shadow-atlas.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import {
  CROWD_ZOOMS,
  FIT_ZOOM,
  crowdCasters,
  crowdCells,
  crowdPxPerUnit,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import { GROUND_TOKENS, groundRowOf, linearColourOf } from './shipped-land-scene.js';

/** The arm every other row is read against: the map as it draws today - clipped to its coast, and
 *  with the land standing at whatever height the sine sum gives it right up to the waterline. */
export const REFERENCE_ARM: ShoreArm = 'none';

/** Every arm, control first - {@link SHORE_ARMS} itself, so an arm added to the module cannot be
 *  left silently out of the comparison. */
export const ALL_SHORE_ARMS: readonly ShoreArm[] = SHORE_ARMS;

/** The arms this page COMPARES — the control is deliberately not one of them. */
export const SHORE_TREATMENT_ARMS: readonly ShoreArm[] = SHORE_ARMS.filter(
  (a) => a !== REFERENCE_ARM,
);

/**
 * The arms on the WIDTH axis — those that move the band and nothing else.
 *
 * ⚠⚠ THIS PAGE NOW CARRIES TWO AXES MEETING AT ONE ARM, and saying which is which is what keeps
 * every refusal below meaningful. `none → authored → beach → shelf` moves the band's WIDTH and
 * creates no geometry, so its counters must be identical across all four. `beach → ring →
 * ring-pair` holds the width at 7 and moves the MESH, so its counters must differ — and a refusal
 * that demanded identity across every arm would now fire on the increment doing its job.
 */
export const SHORE_WIDTH_ARMS: readonly ShoreArm[] = SHORE_ARMS.filter((a) => !armHasRing(a));

/** The arms that insert an inset ring. `beach` is their control: same band, same everything, one
 *  mesh apart. DERIVED from the module's own table, so an arm cannot gain a ring and be compared
 *  against the wrong denominator. */
export const SHORE_RING_ARMS: readonly ShoreArm[] = SHORE_ARMS.filter((a) => armHasRing(a));

/** The arm every ring arm is read against — the shipped shore band with the mesh the map has. */
export const RING_REFERENCE_ARM: ShoreArm = 'beach';

/** What each arm adds, as the caption under its own picture — beside the arm rather than in the
 *  HTML, so an arm cannot be added without a reader being told what it is. */
export const SHORE_ARM_CAPTION = {
  none: 'the shipped map today - the land stands full height right up to the waterline (CONTROL)',
  authored: `+ the generator's own ${SHORE_ARM_WIDTH.authored}-unit band (under half the beach)`,
  beach: `+ a ${SHORE_ARM_WIDTH.beach}-unit band - exactly the land the coast clip added`,
  shelf: `+ a ${SHORE_ARM_WIDTH.shelf}-unit band — a whole parcel inland, a shelf not a lip`,
  ring: `beach + ONE inset ring at ${SHORE_ARM_INSETS.ring[0]!} units — the band gains vertices to bend through`,
  'ring-pair': `beach + TWO inset rings at the band's thirds — does a second ring keep paying?`,
} satisfies Record<ShoreArm, string>;

/** One island, and the thirty-five-island forest. The shore band is a per-island annulus, so ONE
 *  island is where its shape is read — but the forest is where a per-frame cost is honest, and it
 *  is where a band only a few delivered pixels wide either survives the overview zoom or does not. */
export const SHORE_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];

/** The two zooms every comparison on this arc is taken at. */
export const SHORE_ZOOMS: readonly number[] = [...CROWD_ZOOMS];

/** Those two plus the fitted overview, which is a CONTEXT picture and never a timing: `fit`
 *  delivers a different px/unit per scene. */
export const SHORE_PICTURE_ZOOMS: readonly CrowdZoom[] = [...SHORE_ZOOMS, FIT_ZOOM];

/** How wide the beach is, in ground units, at its authored value — the number multiplied by a
 *  zoom to say how many PIXELS of shore a reader is being shown. */
export const BEACH_GROUND_WIDTH = COAST_OUTSET;

/**
 * THE REGION EVERY ARM'S SAG IS MEASURED OVER, in ground units from the shore — FIXED, and the
 * same for all six.
 *
 * ⚠⚠ IT IS NOT THE ARM'S OWN BAND, AND THE FIRST DRAFT'S USE OF THAT WAS A COMPARISON THAT COULD
 * NOT BE READ. Measured over its own band, `authored` (3.1 units) came back with a LOWER mean sag
 * than `beach` (7) — 0.268 against 0.420 — and a reader would take that as the narrower band
 * tracking the land better. It is not: the two deliver the BIT-IDENTICAL land (they sit inside the
 * same vertex void), and the only thing that differed was how much of the shore each number was
 * averaged over. A statistic whose denominator moves with the arm is not a comparison.
 *
 * ⚠ FIXED AT THE BEACH THE COAST CLIP ACTUALLY ADDED, which is the ground this whole component is
 * about, and which makes `none` a real baseline rather than an empty row: the unfallen land has a
 * sag of its own there — the sine relief's chordal error — and every fall is read against it.
 */
export const SAG_REGION = COAST_OUTSET;

/**
 * What one arm costs and what it CHANGED, in numbers a picture cannot carry.
 *
 * ⚠⚠ THE FIRST FIVE ARE EXPECTED TO BE IDENTICAL ON EVERY ARM, AND THAT IS A RESULT RATHER THAN AN
 * OVERSIGHT. The shore fall moves vertices in Y and creates none, so it cannot move a triangle
 * count, a ring-vertex count, an attribute byte or a square unit of land. They are measured anyway,
 * and the driver REFUSES a run in which they differ, because "the component is free" is exactly the
 * class of claim that gets believed rather than checked — and because a future arm that DID spend
 * geometry would otherwise land silently.
 */
export interface ShorePlan {
  /** Triangles in the merged ground buffer. Identical across the WIDTH arms; the whole cost of a
   *  ring arm. */
  triangles: number;
  /** Ring vertices across every parcel — the WALL rings, which is what a ring arm lengthens.
   *  Identical across the width arms. */
  ringVertices: number;
  /** Bytes of vertex attribute the merged buffer uploads (position + normal + row + atlas origin).
   *  Identical across the width arms; a ring arm's second cost after the triangles. */
  attributeBytes: number;
  /** The island's summed parcel area, in square ground units.
   *
   *  ⚠⚠ IDENTICAL ON EVERY ARM INCLUDING THE RING ARMS, AND THAT IS THE RING'S SHARPEST CHECK
   *  RATHER THAN A LEFTOVER. The fall is vertical, so the width axis cannot move it. The ring axis
   *  DIVIDES parcels, and a division that lost or double-counted ground would move this number by
   *  exactly the ground it got wrong — which on a map whose colour reports a capability's status
   *  is a misreport (ADR-0392 D5 / ADR-0398 D7). Conserved area is the evidence that a divided
   *  parcel is still the same parcel. */
  groundArea: number;
  /** Parcels whose ring crosses itself. The coast clip's fold cap owns this; it must be zero on
   *  every arm and the driver refuses a run where it is not. Carried through rather than dropped
   *  because the shore is measured to the rim of exactly these parcels, so a folded parcel would be
   *  a folded SHORE as well as a misreported colour. */
  foldedParcels: number;

  // ---- what the shore fall actually moves ----------------------------------------------------

  /** Distinct ground vertices the arm moved at all, against the control — the band's own reach,
   *  counted rather than inferred from its width. */
  movedVertices: number;
  /** How many distinct ground vertices there are. `movedVertices / vertices` is the fraction of the
   *  island the band touches, which is the honest denominator for every claim below. */
  vertices: number;
  /** The largest drop any vertex took, in ground units. */
  maxDrop: number;
  /** The mean drop over the vertices that MOVED. Averaging it over the whole island instead would
   *  report a wide gentle band and a narrow steep one as the same land. */
  meanDrop: number;
  /** The lowest and highest ground the arm delivers, in ground units. */
  minHeight: number;
  maxHeight: number;
  // ---- what the INSET RING costs, and what it buys -------------------------------------------

  /** Parcels that meet the coast — the denominator {@link dividedParcels} is read against, since
   *  an island is mostly interior and a bare divided count says nothing about how much of the SHORE
   *  gained a band. 0 on every width arm, which did not look. */
  coastalParcels: number;
  /** Parcels whose top face was divided along an inset ring. 0 on every width arm. */
  dividedParcels: number;
  /** Divided parcels whose chain the ladder had to DEMOTE — a coast turning tighter than the ring.
   *  The cap's own report: a cap nobody can see reads as a shore that never needed one. */
  cappedParcels: number;
  /** The shallowest depth any divided parcel's chain kept, as a fraction of the authored inset.
   *  1 when nothing was demoted. */
  leastScale: number;
  /** Vertices the ring inserted into wall rings — the shared, edge-local half of the division, and
   *  the part that costs two triangles apiece rather than a whole parcel's worth. */
  insertedVertices: number;
  /** Top-face triangles whose centroid lies within {@link SAG_REGION} of the shore — the ones the
   *  ring exists to create, and the denominator {@link meanSag} is averaged over. The region is
   *  FIXED across arms, so this column is comparable and a growing count means a finer mesh rather
   *  than a wider band. */
  bandTriangles: number;
  /**
   * ⚠⚠ HOW FAR THE TRIANGULATED SURFACE DEPARTS FROM THE LAND IT IS APPROXIMATING, inside the
   * band, in ground units — THE NUMBER THIS INCREMENT EXISTS TO MOVE.
   *
   * The shore fall is an analytic field: `shoreRelief` answers at every point, smoothstep and all.
   * What the map DRAWS is a triangulation that samples that field at its vertices and interpolates
   * flat between them, so where the mesh has no vertices the falloff's shape is not merely coarse —
   * it is absent, replaced by a straight ramp from the waterline to the first interior corner 8.66
   * units inland. This is that gap, measured per triangle as the sag between its plane and the
   * field at its own centroid: the classic chordal error of a piecewise-linear approximation.
   *
   * ⚠ IT IS THE HONEST FORM OF THE QUESTION "did the shape become visible", because it is a
   * property of the SURFACE rather than of the pictures. A rung flip says a viewer would see a
   * different colour somewhere; this says how much of the authored landform the mesh is capable of
   * carrying at all. A ring that cost triangles and did not move this bought nothing.
   */
  maxSag: number;
  meanSag: number;

  /**
   * Vertices whose SHADE RUNG changed against the control.
   *
   * ⚠ THE ONLY NUMBER HERE A VIEWER CAN ACTUALLY SEE. The banded material quantises `dot(n, L)`
   * onto the authored ladder, so a moved normal is a moved rung is a different delivered colour —
   * and a band that moved geometry but flipped no rung would be INVISIBLE on the shipped material
   * however large its drop. A geometry figure alone cannot tell those two apart.
   *
   * ⚠ IT IS A LOWER BOUND AND SAYS SO. `rungOfNormal` is asked per VERTEX; the shader quantises per
   * FRAGMENT, so rung boundaries also fall BETWEEN vertices, where this cannot count them.
   */
  rungFlips: number;
}

/** Bytes per vertex the merged ground buffer uploads: position (3) + normal (3) + status row (1) +
 *  atlas origin (2), all `Float32`. Written as the sum rather than as 36 so a channel added to the
 *  buffer is a change to this line rather than a silently stale constant. */
const GROUND_FLOATS_PER_VERTEX = 3 + 3 + 1 + 2;

export function shorePlan(cells: readonly InstanceDescriptor[], arm: ShoreArm): ShorePlan {
  // ⚠ THE CLIP IS THE SAME ON EVERY ARM. The shore is measured to the rim of the CLIPPED parcels,
  // so the coast has to be settled before the band can be — and holding it fixed at
  // `SHIPPED_COAST` is what makes the band the only variable on this page.
  const clipped = clipToCoast(cells, SHIPPED_COAST);
  const relief = shoreRelief(clipped, arm);
  const control = shoreRelief(clipped, REFERENCE_ARM);
  // ⚠ THE RING PLAN IS BUILT ONCE AND READ TWICE — by the geometry and by the counters below. It
  // divides every parcel up front, so asking it again would repeat the whole distance-field sweep
  // and could, if anything about it were non-deterministic, hand the buffer and the report two
  // different meshes to describe.
  const ring = shoreArmRingPlan(clipped, arm);
  const geo = cellGroundGeometry({
    cells: clipped,
    resolve: linearColourOf,
    index: groundRowOf,
    relief,
    decompose: ring.decompose,
  });
  // ⚠ A FIELD OF ITS OWN, capped at {@link SAG_REGION} — the FIXED region every arm's sag is taken
  // over, never the arm's own band. `shoreRelief` holds a field too and does not expose it; sharing
  // one would couple this page to that module's internals for no saving a profile has ever shown.
  const field = shoreField(clipped, SAG_REGION);

  let ringVertices = 0;
  let groundArea = 0;
  let foldedParcels = 0;
  let bandTriangles = 0;
  let maxSag = 0;
  let sagSum = 0;
  // ⚠ DISTINCT GROUND VERTICES, keyed by `vertexKey` — the coast module's own key, so "a vertex"
  // means the same thing on both pages. The relaxed substrate interns its vertices, so a corner
  // shared by three parcels is ONE piece of ground: counting it three times would report the same
  // band as reaching further into a finely-divided island than into a coarse one.
  //
  // ⚠⚠ ON A RING ARM THIS SET IS LARGER, AND EVERY RATIO BELOW IS AGAINST ITS OWN DENOMINATOR.
  // `movedVertices / vertices` compares an arm to itself; comparing a ring arm's moved COUNT to a
  // width arm's would report a finer mesh as a wider band.
  const seen = new Map<string, { x: number; z: number }>();
  for (const c of clipped) {
    if (c.points === undefined || c.points.length < 3) continue;
    const faces = ring.decompose(c);
    const wall = faces.wall;
    ringVertices += wall.length;
    if (wall.length >= 3 && !isSimpleRing(wall)) foldedParcels += 1;
    let shoelace = 0;
    for (let i = 0; i < wall.length; i += 1) {
      const p = wall[i]!;
      const q = wall[(i + 1) % wall.length]!;
      shoelace += p.x * q.z - q.x * p.z;
      seen.set(vertexKey(p), p);
    }
    groundArea += Math.abs(shoelace) / 2;
    // ⚠⚠ THE SAG IS COMPUTED FROM THE DECOMPOSITION RATHER THAN FROM THE BUFFER, and that is what
    // keeps it a TOP-FACE measure. Walls are in the buffer too; their centroids sit halfway down a
    // vertical quad, nowhere near the surface, and a scan of the merged positions would have to
    // separate them by their normals — a threshold where none is needed. Triangulating the faces
    // here is the same `triangulateRing` the builder calls, so these are the very triangles drawn.
    for (const face of faces.faces) {
      for (const [a, b, cc] of triangulateRing(face)) {
        const cx = (a.x + b.x + cc.x) / 3;
        const cz = (a.z + b.z + cc.z) / 3;
        if (field.sample(cx, cz).distance >= SAG_REGION) continue;
        // The plane's height at the centroid IS the mean of its corners' heights, so no barycentric
        // arithmetic is needed and none can be got wrong.
        const plane = (relief.height(a.x, a.z) + relief.height(b.x, b.z) + relief.height(cc.x, cc.z)) / 3;
        const sag = Math.abs(plane - relief.height(cx, cz));
        bandTriangles += 1;
        sagSum += sag;
        if (sag > maxSag) maxSag = sag;
      }
      for (const p of face) seen.set(vertexKey(p), p);
    }
  }

  let movedVertices = 0;
  let maxDrop = 0;
  let dropSum = 0;
  let rungFlips = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const p of seen.values()) {
    const h = relief.height(p.x, p.z);
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
    const drop = control.height(p.x, p.z) - h;
    if (drop !== 0) {
      movedVertices += 1;
      dropSum += drop;
      if (drop > maxDrop) maxDrop = drop;
    }
    // ⚠ `rungOfNormal` IS THE SHADER'S OWN ANSWER, IMPORTED RATHER THAN TRANSCRIBED. This package
    // has already paid once for three hand-copied status palettes that disagreed with each other;
    // a fourth hand-copy of the lambert-to-rung step would be the same mistake in a new place.
    if (rungOfNormal(relief.normal(p.x, p.z)) !== rungOfNormal(control.normal(p.x, p.z))) {
      rungFlips += 1;
    }
  }

  return {
    triangles: geo.triangles,
    ringVertices,
    attributeBytes: geo.triangles * 3 * GROUND_FLOATS_PER_VERTEX * 4,
    groundArea,
    foldedParcels,
    coastalParcels: ring.census.coastal,
    dividedParcels: ring.census.divided,
    cappedParcels: ring.census.capped,
    leastScale: ring.census.leastScale,
    insertedVertices: ring.census.inserted,
    bandTriangles,
    maxSag,
    meanSag: bandTriangles === 0 ? 0 : sagSum / bandTriangles,
    movedVertices,
    vertices: seen.size,
    maxDrop,
    meanDrop: movedVertices === 0 ? 0 : dropSum / movedVertices,
    minHeight: seen.size === 0 ? 0 : minHeight,
    maxHeight: seen.size === 0 ? 0 : maxHeight,
    rungFlips,
  };
}

export interface ShoreLandScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  islands: number;
  plan: ShorePlan;
}

/**
 * Build one arm of one crowd at one zoom.
 *
 * ⚠ EVERY ARM SHARES THE LADDER, THE GRAIN, THE RELIEF, THE OCCLUSION ATLAS, THE LIGHT AND THE
 * CAMERA — the whole shipped pipeline as it stands after the shadow crossing. The only thing that
 * moves is which coast the parcels were clipped to, so a pixel difference between two arms is
 * attributable to the coast and to nothing else on the page.
 *
 * ⚠ THE OCCLUSION ATLAS IS PACKED OVER THE CLIPPED PARCELS, not over the originals, and that is
 * the same ordering the canvas uses. Packing it over the pre-clip bounds would leave the new beach
 * outside every island's tile, so the shore would read the atlas's edge texel and wear whatever
 * shadow happened to sit there.
 */
export function buildShoreScene(arm: ShoreArm, size: CrowdSize, zoom: CrowdZoom): ShoreLandScene {
  // ⚠ CLIPPED TO THE SHIPPED COAST ON EVERY ARM — the coast is settled, the BAND is the variable.
  // Passing `arm` here instead would move two things at once and every pixel difference on the
  // page would be unattributable.
  const cells = clipToCoast(crowdCells(size), SHIPPED_COAST);
  const casters = crowdCasters(size);
  if (groundBounds(cells) === null) throw new Error('shipped-shore-scene: the crowd bounds nothing');

  const geo = cellGroundGeometry({
    cells,
    resolve: linearColourOf,
    index: groundRowOf,
    relief: shoreRelief(cells, arm),
    // ⚠ THE SAME ARM DRIVES BOTH, and it has to: the relief supplies the falloff and the
    // decomposition supplies the vertices for it to bend through. An arm whose ring came from one
    // place and whose band came from another would be two variables wearing one name.
    decompose: shoreArmRingPlan(cells, arm).decompose,
    atlasOrigin: atlasOriginResolver(
      packShadowAtlas(islandGroundBounds(cells), SHADOW_GRES, SHADOW_ATLAS_MAX),
    ),
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));

  const opts: BandedGroundMaterialOptions = {
    tokens: GROUND_TOKENS,
    grain: 'normal',
    shadowAtlas: groundAtlasTexture(
      buildAtlasOcclusion({
        cells,
        relief: LAND_RELIEF_AMPLITUDE,
        casters,
        gres: SHADOW_GRES,
        max: SHADOW_ATLAS_MAX,
      }),
    ),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, createBandedGroundMaterial(opts)));
  // The banded material is unlit — it computes its own lambert against the authored
  // LIGHT_DIRECTION — so these reach nothing. They are here because the scene the product builds
  // has them, and a scene that dropped them would differ from it in two things.
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, SHIPPED_LIGHTING.directionalIntensity);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);

  const pxPerUnit = crowdPxPerUnit(size, zoom);
  return {
    scene,
    camera: orientedCamera({ x: 0, z: 0 }, pxPerUnit),
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    islands: size.islands,
    plan: shorePlan(crowdCells(size), arm),
  };
}

export interface ShoreReading {
  arm: ShoreArm;
  size: CrowdSizeId;
  pxPerUnit: number;
  width: number;
  height: number;
  islands: number;
  triangles: number;
  ringVertices: number;
  attributeBytes: number;
  groundArea: number;
  foldedParcels: number;
  coastalParcels: number;
  dividedParcels: number;
  cappedParcels: number;
  leastScale: number;
  insertedVertices: number;
  bandTriangles: number;
  maxSag: number;
  meanSag: number;
  movedVertices: number;
  vertices: number;
  maxDrop: number;
  meanDrop: number;
  minHeight: number;
  maxHeight: number;
  rungFlips: number;
  /** Draw calls the renderer actually submitted. One, on every arm — the shore fall moves vertices
   *  in Y and creates none, so it cannot add a mesh, which keeps
   *  `the forest's ground is ONE draw call` true through this crossing too. */
  drawCalls: number;
  trianglesSubmitted: number;
  /** Median GPU nanoseconds for one render, or null if the timer never resolved. */
  gpuNs: number | null;
  batch: number;
}

export interface ShoreRunner {
  identity(): RendererIdentity;
  warm(): void;
  geometry(arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): Omit<ShoreReading, 'gpuNs' | 'batch'>;
  /** Percentage of the FRAME differing between two arms at the same size and zoom. */
  changedPct(a: ShoreArm, b: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /** Pixels differing between two arms — the count {@link changedPct} reports as a percentage. */
  changedPixels(a: ShoreArm, b: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /**
   * How many pixels this arm's COAST covers — differenced against {@link REFERENCE_ARM}.
   *
   * ⚠⚠ IT IS THE DENOMINATOR EVERY OTHER PIXEL NUMBER ON THIS PAGE NEEDS. A coast is a thin
   * annulus around an island, so a figure quoted against the whole frame reads as "nothing
   * changed" beside two pictures that are obviously different shapes.
   */
  shorePixels(arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  snapshot(arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  time(arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom, batch: number): Promise<ShoreReading>;
  dispose(): void;
}

const GPU_TIMER = 'EXT_disjoint_timer_query_webgl2';

/** Wait for one timer query's result, or give up. The same eleven lines as the pages next door,
 *  and a copy for the reason they give: the shared helper sits beside fixtures this page does not
 *  use. */
async function elapsedNs(gl: WebGL2RenderingContext, query: WebGLQuery): Promise<number | null> {
  for (let i = 0; i < 600; i += 1) {
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

export function createShoreRunner(): ShoreRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER) as { TIME_ELAPSED_EXT: number } | null;
  const identity = readIdentity(gl);

  // ⚠ CACHED PER (arm, size, zoom). The clip re-chains every island's rim and re-runs the fold
  // cap; rebuilding it inside the sweep would time that arithmetic as though it were a frame, and
  // would report the arm that does the most CPU work as the slowest to DRAW.
  const built = new Map<string, ShoreLandScene>();
  const sceneFor = (arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): ShoreLandScene => {
    const key = `${arm}|${size}|${String(zoom)}`;
    const found = built.get(key);
    if (found) return found;
    const made = buildShoreScene(arm, crowdSize(size), zoom);
    built.set(key, made);
    return made;
  };

  const render = (arm: ShoreArm, size: CrowdSizeId, zoom: CrowdZoom): ShoreLandScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const readFrame = (s: ShoreLandScene): Uint8Array => {
    const px = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };

  const diffCount = (first: Uint8Array, second: Uint8Array): number => {
    let differing = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (
        first[i] !== second[i] ||
        first[i + 1] !== second[i + 1] ||
        first[i + 2] !== second[i + 2]
      ) {
        differing += 1;
      }
    }
    return differing;
  };

  const shape = (
    s: ShoreLandScene,
    arm: ShoreArm,
    size: CrowdSizeId,
  ): Omit<ShoreReading, 'gpuNs' | 'batch'> => ({
    arm,
    size,
    pxPerUnit: s.pxPerUnit,
    width: s.width,
    height: s.height,
    islands: s.islands,
    triangles: s.plan.triangles,
    ringVertices: s.plan.ringVertices,
    attributeBytes: s.plan.attributeBytes,
    groundArea: s.plan.groundArea,
    foldedParcels: s.plan.foldedParcels,
    coastalParcels: s.plan.coastalParcels,
    dividedParcels: s.plan.dividedParcels,
    cappedParcels: s.plan.cappedParcels,
    leastScale: s.plan.leastScale,
    insertedVertices: s.plan.insertedVertices,
    bandTriangles: s.plan.bandTriangles,
    maxSag: s.plan.maxSag,
    meanSag: s.plan.meanSag,
    movedVertices: s.plan.movedVertices,
    vertices: s.plan.vertices,
    maxDrop: s.plan.maxDrop,
    meanDrop: s.plan.meanDrop,
    minHeight: s.plan.minHeight,
    maxHeight: s.plan.maxHeight,
    rungFlips: s.plan.rungFlips,
    drawCalls: renderer.info.render.calls,
    trianglesSubmitted: renderer.info.render.triangles,
  });

  return {
    identity: () => identity,

    // THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP. The first render of any configuration
    // compiles shaders and uploads buffers, and leaving that inside the timing is what made an
    // earlier instrument on this arc report a heavier scene as faster than a lighter one.
    warm() {
      for (const size of SHORE_SIZES) {
        for (const zoom of SHORE_PICTURE_ZOOMS) {
          for (const arm of ALL_SHORE_ARMS) render(arm, size.id, zoom);
        }
      }
      gl.finish();
    },

    geometry(arm, size, zoom) {
      return shape(render(arm, size, zoom), arm, size);
    },

    changedPct(a, b, size, zoom) {
      const first = readFrame(render(a, size, zoom));
      const second = readFrame(render(b, size, zoom));
      return (diffCount(first, second) / (first.length / 4)) * 100;
    },

    changedPixels(a, b, size, zoom) {
      return diffCount(readFrame(render(a, size, zoom)), readFrame(render(b, size, zoom)));
    },

    shorePixels(arm, size, zoom) {
      return diffCount(
        readFrame(render(arm, size, zoom)),
        readFrame(render(REFERENCE_ARM, size, zoom)),
      );
    },

    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },

    async time(arm, size, zoom, batch) {
      const s = render(arm, size, zoom);
      const base = shape(s, arm, size);
      if (!timer) return { ...base, gpuNs: null, batch };
      const query = gl.createQuery();
      if (!query) return { ...base, gpuNs: null, batch };
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      for (let i = 0; i < batch; i += 1) renderer.render(s.scene, s.camera);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      const ns = await elapsedNs(gl, query);
      gl.deleteQuery(query);
      return { ...base, gpuNs: ns === null ? null : ns / batch, batch };
    },

    dispose() {
      renderer.dispose();
    },
  };
}

/** Mount the page: the forest fitted to a screen for context, then every arm at every zoom, with
 *  the runner on `window` for the driver to reach. */
export function mountShippedShore(root: HTMLElement): void {
  const runner = createShoreRunner();
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}`;
  root.appendChild(head);

  const overview = document.createElement('h2');
  overview.textContent =
    'the whole forest, fitted to a laptop screen — does a shore band survive at this delivered size?';
  root.appendChild(overview);
  const overviewRow = document.createElement('div');
  overviewRow.className = 'row';
  for (const arm of ALL_SHORE_ARMS) {
    const s = buildShoreScene(arm, crowdSize('forest'), FIT_ZOOM);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, 'forest', FIT_ZOOM);
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${arm} · ${s.pxPerUnit.toFixed(2)} px/unit · beach ≈ ` +
      `${(BEACH_GROUND_WIDTH * s.pxPerUnit).toFixed(1)} px — ${SHORE_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    overviewRow.appendChild(fig);
  }
  root.appendChild(overviewRow);

  for (const zoom of SHORE_ZOOMS) {
    for (const size of SHORE_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent =
        `${zoom} delivered px per ground unit — ${size.what} · ` +
        `the beach is ≈ ${(BEACH_GROUND_WIDTH * zoom).toFixed(0)} px wide here`;
      root.appendChild(h2);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of ALL_SHORE_ARMS) {
        const s = buildShoreScene(arm, size, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 620;
        const cap = document.createElement('figcaption');
        // ⚠ THE CAPTION LEADS WITH WHAT MOVED, NOT WITH THE TRIANGLE COUNT. On this page the
        // triangle count is the same on all four arms by construction, so a reader whose eye lands
        // on it first learns nothing; the band's reach and its rung flips are the figures that
        // separate the arms.
        cap.textContent =
          `${arm} · band ${SHORE_ARM_WIDTH[arm]} units · ` +
          `rings [${SHORE_ARM_INSETS[arm].map((i) => i.toFixed(2)).join(', ')}] · ` +
          `moved ${s.plan.movedVertices}/${s.plan.vertices} vertices · ` +
          `max drop ${s.plan.maxDrop.toFixed(2)} (mean ${s.plan.meanDrop.toFixed(2)}) · ` +
          `${s.plan.rungFlips} rung flips · ` +
          `SAG max ${s.plan.maxSag.toFixed(3)} mean ${s.plan.meanSag.toFixed(3)} over ` +
          `${s.plan.bandTriangles} band triangles · ` +
          `height ${s.plan.minHeight.toFixed(2)}…${s.plan.maxHeight.toFixed(2)} · ` +
          `${s.plan.triangles} triangles · ` +
          `${s.plan.dividedParcels}/${s.plan.coastalParcels} coastal parcels divided ` +
          `(${s.plan.cappedParcels} capped, least ` +
          `${s.plan.leastScale.toFixed(1)}) · ` +
          `${s.plan.foldedParcels} folded parcels`;
        fig.append(img, cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }

  window.shoreRunner = runner;
}

/** The runner the driver reaches for. A DECLARED GLOBAL rather than a cast at the assignment: an
 *  `as unknown as { … }` chain is the discarded-evidence shape the house TypeScript standard
 *  refuses, and it would let the property's type drift from the interface above. */
declare global {
  // eslint-disable-next-line no-var
  var shoreRunner: ShoreRunner;
}
