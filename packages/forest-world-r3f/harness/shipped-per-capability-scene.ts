// shipped-per-capability-scene.ts — ONE TREE PER CAPABILITY, WITH THE GROUND COVER LADDERED
// BESIDE IT, on one sheet for the owner (ADR-0518; increment
// `restore-the-true-footprint-and-ladder-the-grove-density` on `land-ground-stack-arc`, whose
// grove half was overtaken mid-flight).
//
//   today      the map AS IT SHIPPED UNTIL THIS LANDING: the true footprint from 50° (ADR-0517),
//              one tree per capability PLUS the healthy island's grove at the rung it stood (61
//              dressing pines beside 11 capability trees on the fixture island), the cover at the
//              recipe's own count (CONTROL — every "moved" is vs this)
//   cover-x1   ONE TREE PER CAPABILITY and nothing else tree-shaped, the cover at the recipe's own
//              count — what removing the grove alone does
//   cover-x2   the same, the cover at twice the recipe's count
//   cover-x3   the same, at three times
//   cover-x4   the same, at four times — the boldest rung rendered
//
// ⚠⚠ THE QUESTION THIS PAGE ANSWERS, AND THE ONE IT DOES NOT. The owner looked at a dressed island
// and asked why it carried ~100 trees when no story holds that many capabilities, then ruled: *"1
// tree per a capability it needs to look good not like a forest"*. The first half is DECIDED
// (ADR-0518 D1) and this page does not reopen it — there is no grove rung here, and `cover-x1`'s
// tree count IS the capability count. What is still an art call is the second half: with 3–6
// trees over a footprint ADR-0517 tripled, the ground cover is what carries the island (ADR-0518
// D2), and its COUNT is laddered here at the size rung that already shipped (`COVER_SIZE`, picked
// 2026-09-04) so each arm differs from its neighbour in exactly one thing. Sparse is the
// constraint; "looks good" is the goal; the pick is by the look (ADR-0489 D3, ADR-0503 D1).
//
// ⚠⚠ THE TREE COUNT IS PRINTED ON EVERY ARM, and it is the number he asked about. On `today` it
// is the capability trees AND the grove pines, separately; on every ladder arm the grove column
// is zero and the driver REFUSES a run where it is not — a ladder arm standing any tree that a
// capability did not put there is ADR-0518 D4's padding, arriving through the instrument.
//
// ⚠⚠ THE CONTROL IS HISTORY NOW AND SAYS SO. `today` cannot be composed from `src/` any more —
// `map-dressing.ts` grows no grove — so it is composed HERE from `grove-history.ts` (the deleted
// placement, verbatim, harness-only) on top of the vocabulary, with the cover at the count and
// size the map stood: `PREVIOUS_GROVE_DENSITY` / `PREVIOUS_COVER_DENSITY`, typed as what shipped
// until 2026-09-05. Every ladder arm is `dressMapWithCover` with the SAME options object the
// canvas passes plus this arm's `coverDensity`; the shipped arm is today's map because there is
// one construction of it (`comparison-baseline-moves-under-the-page`).
//
// ⚠ THE LADDER ARMS SHARE ONE GROUND MESH AND ONE OCCLUSION FIELD — ground cover casts nothing
// (`placementCasters` drops the dressing roles), so the four arms' casters are the vocabulary's
// exactly, and one `shippedGroundBuild` per size serves all four. The control's ground is its own
// build, because the grove cast. The driver refuses a run where a ladder arm's casters differ from
// `cover-x1`'s, or where the ground triangles differ between any two arms.
//
// ⚠ FRAME COST IS TAKEN HERE, AND IT REPORTS — IT DOES NOT GATE (ADR-0517 D4). Removing ~94% of
// the trees improves every number; the number is recorded beside the sheet and is not the reason
// for the change, and a good number does not substitute for the look judgement.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE about the `src/`
// modules it imports. The pick — the count rung — lands in `src/cover-dressing.ts`.

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { SHIPPED_ELEVATION_DEG, shippedElevationDeg } from '../src/camera-framing.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { COVER_DENSITY, COVER_DENSITY_RUNGS, COVER_SIZE, dressCover } from '../src/cover-dressing.js';
import { cellAt, dressingEligible, islandExclusion } from '../src/dressing-ground.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { groundCasters, placementCasters } from '../src/ground-casters.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  KIT_ROLE_SIZE,
  RENDER_ELEV_DEG,
  isCoverPlacement,
  type KitPlacement,
} from '../src/kit-vocabulary.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import type { ShadowCaster } from '../src/land-shadow.js';
import {
  calibrateLights,
  intensitiesFor,
  type CalibratedIntensities,
  type LightCalibration,
} from '../src/light-calibration.js';
import { dressMapFromKit, dressMapWithCover } from '../src/map-dressing.js';
import { cellsByIsland, parcelCellsFrom } from '../src/parcel-cells.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import { islandCentres } from '../src/true-footprint.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { GROVE_HISTORY_DENSITY, dressGrovesHistory, isGroveHistoryPlacement } from './grove-history.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { armDescriptors } from './shipped-canopy-scene.js';
import { FIT_ZOOM, crowdSize, orientedCamera, type CrowdSize, type CrowdSizeId, type CrowdZoom } from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import { REFERENCE_IMAGE, backgroundBytes, familyCensus, referenceFamilies } from './shipped-grass-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import { VISIBLE_DELTA, sensitivityReasons, visibleDeltaDistribution, type VisibleDeltaReading } from './visible-delta.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

// ---------------------------------------------------------------- the arms

/**
 * WHAT SHIPPED UNTIL THIS LANDING, typed as history. The map stood the grove at rung 1 (13 stands
 * per recipe-island of area, since ADR-0517's true footprint) and the cover at the recipe's own
 * count. Neither can be READ off the shipped code any more — `src/` grows no grove and the cover's
 * shipped count is now a rung of its own ladder — which is exactly why they are written here: the
 * control arm has to be the picture the owner saw yesterday.
 */
export const PREVIOUS_GROVE_DENSITY = GROVE_HISTORY_DENSITY;
export const PREVIOUS_COVER_DENSITY = 1;

export interface PerCapabilityArmSpec {
  id: string;
  /** Which rung of `COVER_DENSITY_RUNGS` the healthy islands' cover is counted at. */
  coverDensity: number;
  /** Whether this arm stands the RETIRED grove — true for the control only. */
  grove: boolean;
}

export const CONTROL_ARM = 'today';

export function coverArmId(density: number): string {
  return `cover-x${density}`;
}

/** The count rungs rendered — the declared ladder, by import. */
export const DENSITY_LADDER: readonly number[] = [...COVER_DENSITY_RUNGS];

/** Every arm: the control first, then one tree per capability up the cover's count ladder. */
export const PER_CAPABILITY_ARMS: readonly PerCapabilityArmSpec[] = [
  { id: CONTROL_ARM, coverDensity: PREVIOUS_COVER_DENSITY, grove: true },
  ...DENSITY_LADDER.map((density) => ({ id: coverArmId(density), coverDensity: density, grove: false })),
];

/** The arms that stand one tree per capability — the ladder, leanest first. */
export const LADDER_ARMS: readonly string[] = PER_CAPABILITY_ARMS.filter((a) => !a.grove).map((a) => a.id);

/** The arm the canvas stands after this landing: one tree per capability, the cover at the shipped rung. */
export const SHIPPED_ARM: string = coverArmId(COVER_DENSITY);

export function armSpec(id: string): PerCapabilityArmSpec {
  const found = PER_CAPABILITY_ARMS.find((a) => a.id === id);
  if (!found) throw new Error(`shipped-per-capability-scene: no arm "${id}"`);
  return found;
}

/** The ladder arm one rung LEANER, or null at the bottom and for the control. */
export function leanerArm(id: string): string | null {
  const spec = armSpec(id);
  if (spec.grove) return null;
  const i = DENSITY_LADDER.indexOf(spec.coverDensity);
  return i > 0 ? coverArmId(DENSITY_LADDER[i - 1]!) : null;
}

/** What each arm IS, as the caption under its own picture. */
export function armCaption(id: string): string {
  const spec = armSpec(id);
  if (spec.grove) {
    return (
      `the map AS IT SHIPPED UNTIL 2026-09-05 — the true footprint from ${SHIPPED_ELEVATION_DEG}°, one tree per capability ` +
      `PLUS the healthy island’s grove of dressing pines at rung x${PREVIOUS_GROVE_DENSITY}, the ground cover at the recipe’s own ` +
      `count (x${PREVIOUS_COVER_DENSITY}) — TODAY (CONTROL)`
    );
  }
  const rung =
    spec.coverDensity === 1
      ? 'the RECIPE’S OWN count (70 bushes, 120 tufts, 26 flower patches per recipe-island of area)'
      : `${spec.coverDensity}× the recipe’s count`;
  const tag = id === SHIPPED_ARM ? ' — THE SHIPPED PICK' : '';
  return `ONE TREE PER CAPABILITY and nothing else tree-shaped (ADR-0518), the ground cover at ${rung}, at the shipped size rung ${COVER_SIZE}${tag}`;
}

/** One island and the thirty-five-island forest; read at 8 px/unit, judged fitted too. */
export const PER_CAPABILITY_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];
export const PER_CAPABILITY_ZOOMS: readonly number[] = [8];
export const PER_CAPABILITY_PICTURE_ZOOMS: readonly CrowdZoom[] = [...PER_CAPABILITY_ZOOMS, FIT_ZOOM];

// ---------------------------------------------------------------- what each arm stands

const placementMemo = new Map<string, KitPlacement[]>();

/** The canvas's own dressing options (`ForestWorldCanvas.tsx`), stated once. */
const CANVAS_OPTIONS = { relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29 } as const;

/**
 * THE MAP AS IT SHIPPED UNTIL THIS LANDING, composed here because `src/` can no longer compose it:
 * the vocabulary (`dressMapFromKit`), then on every healthy island its grove (`grove-history.ts`,
 * against what the vocabulary stood there and the same exclusion the ground samples), then that
 * island's cover at the count and size the map stood. The same order `dressMapWithGroves` kept.
 */
export function dressMapAsShippedBefore(descriptors: readonly InstanceDescriptor[]): KitPlacement[] {
  const standing = dressMapFromKit(descriptors, CANVAS_OPTIONS);
  const out = [...standing];
  for (const [island, cells] of cellsByIsland(parcelCellsFrom(descriptors))) {
    if (!dressingEligible(cells)) continue;
    const exclusion = islandExclusion(descriptors, island);
    // What stands on THIS island, by geometry — the grove's occupancy — so no id convention is assumed.
    const own = standing.filter((p) => cellAt(cells, p.at) !== null);
    out.push(
      ...dressGrovesHistory({
        island,
        cells,
        standing: own,
        footprint: KIT_FOOTPRINTS_2026_08_29,
        relief: LAND_RELIEF_AMPLITUDE,
        exclusion,
        density: PREVIOUS_GROVE_DENSITY,
      }),
      ...dressCover({ island, cells, relief: LAND_RELIEF_AMPLITUDE, exclusion, density: PREVIOUS_COVER_DENSITY, size: COVER_SIZE }),
    );
  }
  return out;
}

/**
 * WHAT STANDS ON AN ARM — `dressMapWithCover` with the SAME options the canvas passes plus this
 * arm's count rung, or the historical composition for the control. Memoised per arm and size: the
 * forest's dressing is thirty-five islands' worth of placement.
 */
export function armPlacements(arm: string, size: CrowdSize): KitPlacement[] {
  const key = `${arm}|${size.id}`;
  const hit = placementMemo.get(key);
  if (hit !== undefined) return hit;
  const spec = armSpec(arm);
  const built = spec.grove
    ? dressMapAsShippedBefore(armDescriptors(size))
    : dressMapWithCover(armDescriptors(size), { ...CANVAS_OPTIONS, coverDensity: spec.coverDensity });
  placementMemo.set(key, built);
  return built;
}

/** What darkens an arm's ground — the descriptor stream's casters UNIONED with one per placement,
 *  the same union the canvas hands its ground. Ground cover contributes none. */
export function armCasters(arm: string, size: CrowdSize): ShadowCaster[] {
  return [
    ...groundCasters(armDescriptors(size)),
    ...placementCasters(armPlacements(arm, size), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29),
  ];
}

const groundBuildMemo = new Map<string, ShippedGroundBuild>();

/**
 * THE SHIPPED GROUND, BUILT ONCE PER CASTER SET AND SIZE — `shippedGroundBuild`, the function
 * `CellGround` calls. The four ladder arms share ONE build (their casters are the vocabulary's,
 * because cover casts nothing); the control has its own, because the grove cast.
 */
export function armGroundBuild(arm: string, size: CrowdSize): ShippedGroundBuild {
  const key = `${armSpec(arm).grove ? 'grove' : 'vocabulary'}|${size.id}`;
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const stream = armDescriptors(size);
  const built = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    armCasters(arm, size),
    stream.filter((d) => d.kind === 'trail-strip'),
  );
  groundBuildMemo.set(key, built);
  return built;
}

// ---------------------------------------------------------------- the numbers under the picture

/**
 * THE COUNTS THE OWNER'S QUESTION TURNS ON. A capability tree is every placement that is neither a
 * grove member (control only), nor ground cover, nor a signature bloom — the vocabulary's one
 * object per capability. `treesPerHealthyIsland` is the number he sees on a green island, and on
 * every ladder arm it equals the island's capability count.
 */
export interface DressingCounts {
  placements: number;
  capabilityTrees: number;
  blooms: number;
  /** Dressing pines — non-zero on the control only; the driver refuses any other arm standing one. */
  grovePines: number;
  cover: number;
  bushes: number;
  tufts: number;
  flowerPatches: number;
  islands: number;
  healthyIslands: number;
  /** Per HEALTHY island: capability trees, grove pines and cover, so the forest reads like one island. */
  capabilityTreesPerHealthyIsland: number;
  grovePinesPerHealthyIsland: number;
  coverPerHealthyIsland: number;
}

export function dressingCounts(placements: readonly KitPlacement[], stream: readonly InstanceDescriptor[]): DressingCounts {
  let grovePines = 0;
  let cover = 0;
  let bushes = 0;
  let tufts = 0;
  let flowerPatches = 0;
  let blooms = 0;
  for (const p of placements) {
    if (isGroveHistoryPlacement(p)) grovePines += 1;
    else if (isCoverPlacement(p)) {
      cover += 1;
      if (p.role === 'bush') bushes += 1;
      else if (p.role === 'tuft') tufts += 1;
      else flowerPatches += 1;
    } else if (p.role === 'bloom') blooms += 1;
  }
  const capabilityTrees = placements.length - grovePines - cover - blooms;
  const byIsland = cellsByIsland(parcelCellsFrom(stream));
  const healthyCells = [...byIsland.values()].filter((cells) => dressingEligible(cells));
  let healthyCapabilityTrees = 0;
  for (const p of placements) {
    if (isGroveHistoryPlacement(p) || isCoverPlacement(p) || p.role === 'bloom') continue;
    // On a healthy island, by geometry — the placement basis is the cells' own.
    if (healthyCells.some((cells) => cellAt(cells, p.at) !== null)) healthyCapabilityTrees += 1;
  }
  const healthy = healthyCells.length;
  return {
    placements: placements.length,
    capabilityTrees,
    blooms,
    grovePines,
    cover,
    bushes,
    tufts,
    flowerPatches,
    islands: byIsland.size,
    healthyIslands: healthy,
    capabilityTreesPerHealthyIsland: healthy === 0 ? 0 : healthyCapabilityTrees / healthy,
    grovePinesPerHealthyIsland: healthy === 0 ? 0 : grovePines / healthy,
    coverPerHealthyIsland: healthy === 0 ? 0 : cover / healthy,
  };
}

/** The numbers, as one line under a picture — the TREE count first, because it is the question. */
export function countsCaption(c: DressingCounts, size: CrowdSizeId): string {
  const trees = `${c.capabilityTrees} trees (one per capability)`;
  const grove = c.grovePines === 0 ? 'no dressing pines' : `${c.grovePines} dressing pines (${(c.grovePines / Math.max(1, c.capabilityTrees)).toFixed(1)} per capability)`;
  const cover = `${c.cover} ground cover (${c.bushes} bushes, ${c.tufts} tufts, ${c.flowerPatches} flower patches)`;
  if (size === 'one') return `${trees} · ${grove} · ${c.blooms} blooms · ${cover}`;
  return (
    `${c.islands} islands, ${c.healthyIslands} green · ${trees} · ${grove} · ${cover} · per green island ` +
    `${c.capabilityTreesPerHealthyIsland.toFixed(1)} trees, ${c.grovePinesPerHealthyIsland.toFixed(0)} dressing pines, ${c.coverPerHealthyIsland.toFixed(0)} cover`
  );
}

// ---------------------------------------------------------------- the camera and the framing

/** The unit view direction (eye minus target) of a camera looking at the origin. */
export function viewDirectionOf(camera: THREE.Camera): THREE.Vector3 {
  return camera.position.clone().normalize();
}

/** The elevation a camera looks down at, in degrees, read off its position. */
export function cameraElevationDeg(camera: THREE.Camera): number {
  const d = viewDirectionOf(camera);
  return (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
}

/** Complaints if the shipped camera is not the signed one. Every arm — the control included, since
 *  ADR-0517 landed before the grove was retired — is judged from the crowd's own camera. */
export function cameraAgreement(): string[] {
  const out: string[] = [];
  const shipped = cameraElevationDeg(orientedCamera({ x: 0, z: 0 }, 1));
  if (Math.abs(shipped - RENDER_ELEV_DEG) > 1e-9) {
    out.push(`the shipped crowd camera looks down at ${shipped.toFixed(4)}°, not the signed ${RENDER_ELEV_DEG}°`);
  }
  if (Math.abs(shippedElevationDeg() - SHIPPED_ELEVATION_DEG) > 1e-9) {
    out.push(`frameWorld looks down at ${shippedElevationDeg().toFixed(4)}° against SHIPPED_ELEVATION_DEG ${SHIPPED_ELEVATION_DEG}`);
  }
  return out;
}

/** The screen-plane extent of a set of world positions through a camera, in WORLD units of the
 *  screen plane (multiply by px/unit for pixels). */
export interface ScreenExtent {
  w: number;
  h: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function screenExtent(positions: ArrayLike<number>, camera: THREE.Camera): ScreenExtent {
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i]!, positions[i + 1]!, positions[i + 2]!).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { w: maxX - minX, h: maxY - minY, minX, maxX, minY, maxY };
}

/** The crowd page's fit margin, in ground units — the same 40 next door. */
export const FIT_MARGIN = 40;

/** Fit rule: the px/unit at which `positions`, seen through a unit shipped camera, land inside the
 *  buffer with the crowd page's margin. */
export function fitPxPerUnitFor(positions: ArrayLike<number>): number {
  const e = screenExtent(positions, orientedCamera({ x: 0, z: 0 }, 1));
  const halfW = Math.max(Math.abs(e.minX), Math.abs(e.maxX)) + FIT_MARGIN;
  const halfH = Math.max(Math.abs(e.minY), Math.abs(e.maxY)) + FIT_MARGIN;
  return Math.min(CROWD_VIEWPORT.w / 2 / halfW, CROWD_VIEWPORT.h / 2 / halfH);
}

/** A pine's delivered height on screen at the shipped elevation — the upright is foreshortened by cos. */
export function deliveredPineHeightPx(pxPerUnit: number): number {
  return KIT_ROLE_SIZE.tree.units * Math.cos((RENDER_ELEV_DEG * Math.PI) / 180) * pxPerUnit;
}

/** A ground-plane footprint: width along x and depth along z, in ground units. */
export interface GroundExtent {
  w: number;
  d: number;
}

/** The ground-plane extent of a cell set — the footprint's own number, camera-free. */
export function groundDepth(cells: readonly InstanceDescriptor[]): GroundExtent {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of cells) {
    for (const p of c.points ?? []) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return { w: maxX - minX, d: maxZ - minZ };
}

/** The footprint of the ONE island nearest the origin — the island every 8 px/unit frame is centred on. */
export function islandDepth(cells: readonly InstanceDescriptor[]): GroundExtent {
  const centres = islandCentres(cells);
  let nearest: string | undefined;
  let bestDist = Infinity;
  for (const [id, c] of centres) {
    const dist = Math.hypot(c.x, c.z);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = id;
    }
  }
  return groundDepth(cells.filter((d) => d.island === nearest));
}

// ---------------------------------------------------------------- the scene

export interface PerCapabilityScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  spec: PerCapabilityArmSpec;
  groundTriangles: number;
  island: GroundExtent;
  screen: ScreenExtent;
  counts: DressingCounts;
  casters: number;
  meshes: number;
}

/** ONE ARM'S SCENE: its ground build and placements, the shipped camera, nothing else free. */
export function buildPerCapabilityScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: string,
  size: CrowdSize,
  zoom: CrowdZoom,
): PerCapabilityScene {
  const spec = armSpec(arm);
  const build = armGroundBuild(arm, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-per-capability-scene: the crowd drew no ground');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }
  const wearField = build.wear();
  const extras: GroundLayerExtras = { rock: SHIPPED_LAYERS.rock, detail: SHIPPED_LAYERS.detail };
  if (wearField !== null) extras.wear = { field: wearField, mix: SHIPPED_LAYERS.wearMix };
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));
  const placements = armPlacements(arm, size);
  let meshes = 0;
  for (const mesh of kitMeshes(kit, placements)) {
    scene.add(mesh);
    meshes += 1;
  }
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
  const pxPerUnit = zoom === FIT_ZOOM ? fitPxPerUnitFor(geo.positions) : zoom;
  const camera = orientedCamera({ x: 0, z: 0 }, pxPerUnit);
  const stream = armDescriptors(size);
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    spec,
    groundTriangles: geo.triangles,
    island: islandDepth(stream.filter((d) => d.kind === 'cell-ground')),
    screen: screenExtent(geo.positions, camera),
    counts: dressingCounts(placements, stream),
    casters: armCasters(arm, size).length,
    meshes,
  };
}

// ---------------------------------------------------------------- the readings

/** The bounding box of the non-background pixels of a frame — the island as DELIVERED. */
export interface PixelBox {
  w: number;
  h: number;
  x0: number;
  y0: number;
  pixels: number;
}

export function landBox(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  bg: readonly [number, number, number] | null,
): PixelBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let pixels = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const isBg =
        bg === null ? rgba[i + 3]! < 128 : rgba[i]! === bg[0] && rgba[i + 1]! === bg[1] && rgba[i + 2]! === bg[2];
      if (isBg) continue;
      pixels += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (pixels === 0) return { w: 0, h: 0, x0: 0, y0: 0, pixels: 0 };
  return { w: maxX - minX + 1, h: maxY - minY + 1, x0: minX, y0: minY, pixels };
}

export interface PerCapabilityReading {
  arm: string;
  grove: boolean;
  coverDensity: number;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  counts: DressingCounts;
  casters: number;
  meshes: number;
  island: GroundExtent;
  screen: { w: number; h: number; wPx: number; hPx: number; aspect: number };
  box: PixelBox;
  pineHeightPx: number;
  stats: ImageStats;
  land: number;
  landShare: number;
  families: number;
  largestShare: number;
  /** Against the CONTROL — the map as it shipped. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** Against the rung one leaner on the ladder (null for the control and the bottom rung). */
  touchedVsLeaner: number | null;
  visibleVsLeaner: number | null;
}

export interface ReferenceGeometry {
  width: number;
  height: number;
  box: PixelBox;
  aspect: number;
  families: number;
  largestShare: number;
  stats: ImageStats;
}

export interface PerCapabilityCostSpec {
  arm: string;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
}

export interface PerCapabilityCostReading extends PerCapabilityCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface PerCapabilityRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  agreement(): string[];
  warm(): void;
  read(arm: string, size: CrowdSizeId, zoom: CrowdZoom): PerCapabilityReading;
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  /** The frame cost of one arm on the GPU's own clock — a REPORT (ADR-0517 D4). */
  cost(spec: PerCapabilityCostSpec): Promise<PerCapabilityCostReading>;
  snapshot(arm: string, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceGeometry>;
}

export async function createPerCapabilityRunner(): Promise<PerCapabilityRunner> {
  const t0 = performance.now();
  const kit = await loadKit(KIT_ASSET_URL);
  const loadMs = performance.now() - t0;
  setKitPropLighting(kit, KIT_PROP_INDIRECT_FRACTION);
  const facts = [kitFacts(kit, KIT_ASSET_URL, loadMs)];
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  const cal = calibrateLights(renderer);
  const lit = intensitiesFor(cal);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const bg = backgroundBytes();
  const cache = new Map<string, PerCapabilityScene>();
  const sceneFor = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): PerCapabilityScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildPerCapabilityScene(kit, lit, arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): PerCapabilityScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixels = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    agreement: () => cameraAgreement(),
    warm() {
      for (const arm of PER_CAPABILITY_ARMS) render(arm.id, 'one', PER_CAPABILITY_ZOOMS[0]!);
    },
    read(arm, size, zoom) {
      const s = render(arm, size, zoom);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, size, zoom);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(CONTROL_ARM, size, zoom));
      const leaner = leanerArm(arm);
      const vsLeaner = leaner === null ? null : visibleDeltaDistribution(buf, pixels(leaner, size, zoom));
      return {
        arm,
        grove: s.spec.grove,
        coverDensity: s.spec.coverDensity,
        elevationDeg: cameraElevationDeg(s.camera),
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        counts: s.counts,
        casters: s.casters,
        meshes: s.meshes,
        island: s.island,
        screen: {
          w: s.screen.w,
          h: s.screen.h,
          wPx: s.screen.w * s.pxPerUnit,
          hPx: s.screen.h * s.pxPerUnit,
          aspect: s.screen.w / s.screen.h,
        },
        box: landBox(buf, s.width, s.height, bg),
        pineHeightPx: deliveredPineHeightPx(s.pxPerUnit),
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        landShare: census.land / (s.width * s.height),
        families: census.families,
        largestShare: census.largestShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsLeaner: vsLeaner === null ? null : vsLeaner.touched,
        visibleVsLeaner: vsLeaner === null ? null : vsLeaner.visible,
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.size, spec.zoom);
      renderer.setSize(s.width, s.height, false);
      // Warmed outside the timed batch: the first render compiles shaders and uploads the merged
      // kit geometry, which is a hundred times a frame's cost.
      for (const _ of Array.from({ length: 5 })) {
        void _;
        renderer.render(s.scene, s.camera);
      }
      gl.finish();
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;
      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (timer) {
        gl.getParameter(timer.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (const _ of Array.from({ length: spec.batch })) {
            void _;
            renderer.render(s.scene, s.camera);
          }
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          gl.flush();
          gpuBatchNs = await awaitQuery(gl, query, 20_000);
          disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
          gl.deleteQuery(query);
        }
      }
      const usable = gpuBatchNs !== null && !disjoint ? gpuBatchNs : null;
      return {
        ...spec,
        gpuMsPerFrame: usable === null ? null : usable / 1e6 / spec.batch,
        gpuBatchNs,
        disjoint,
        drawCalls,
        triangles,
        timerQueryAvailable: timer !== null,
        hidden: document.hidden,
      };
    },
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-per-capability-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-per-capability-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      const census = referenceFamilies(buf);
      const box = landBox(buf, c.width, c.height, null);
      return {
        width: c.width,
        height: c.height,
        box,
        aspect: box.h === 0 ? 0 : box.w / box.h,
        families: census.families,
        largestShare: census.largestShare,
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
      };
    },
  };
}

const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

// ---------------------------------------------------------------- the page

export async function mountShippedPerCapability(root: HTMLElement): Promise<void> {
  const runner = await createPerCapabilityRunner();
  window.perCapabilityRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target} · shipped elevation ${shippedElevationDeg().toFixed(2)}° (signed ${RENDER_ELEV_DEG}°) · ` +
    `shipped cover count rung x${COVER_DENSITY} at size ${COVER_SIZE} · camera agreement: ${runner.agreement().length === 0 ? 'the shipped camera is the signed one' : runner.agreement().join('; ')}`;
  root.appendChild(head);
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, orthographic, 50°, the true footprint, 13 stands of pines)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 900;
  refFig.appendChild(refImg);
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined-1948px.png — the look-fence, ADR-0489 D3 (its pines are the recipe’s stands; the map stands one per capability)';
  refFig.appendChild(refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);
  for (const size of PER_CAPABILITY_SIZES) {
    for (const zoom of PER_CAPABILITY_PICTURE_ZOOMS) {
      const h = document.createElement('h2');
      h.textContent = `${size.id} — ${zoom === FIT_ZOOM ? 'fitted (each arm at its own fit)' : `${zoom} px/unit`}`;
      root.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of PER_CAPABILITY_ARMS) {
        const r = runner.read(arm.id, size.id, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm.id, size.id, zoom);
        img.width = 900;
        fig.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm.id} — ${armCaption(arm.id)} · ${countsCaption(r.counts, size.id)} · ${r.pxPerUnit.toFixed(3)} px/unit · ` +
          `island on screen ${r.screen.wPx.toFixed(0)}×${r.screen.hPx.toFixed(0)} px · pine ${r.pineHeightPx.toFixed(0)} px tall · ` +
          `${r.families} families · MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()}`;
        fig.appendChild(cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }
}

declare global {
  interface Window {
    perCapabilityRunner?: PerCapabilityRunner;
  }
}
