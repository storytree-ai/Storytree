// shipped-footprint-scene.ts — THE TRUE FOOTPRINT AT THE SIGNED 50°, WITH THE GROVE DENSITY
// LADDERED BESIDE IT, on one sheet for the owner (ADR-0517; increment
// `restore-the-true-footprint-and-ladder-the-grove-density` on `land-ground-stack-arc`).
//
//   before     the map AS IT SHIPPED UNTIL THIS LANDING: the drawing's squashed footprint (234 × 46)
//              from the 45° camera, the grove at the rung it stood (CONTROL — every "moved" is vs this)
//   true-x1    the island's TRUE footprint (234 × 135) from the owner-signed 50°, the grove at the
//              RECIPE's own stand count
//   true-x2    the same, at twice the recipe's stands
//   true-x3    the same, at three times — the boldest rung rendered
//
// ⚠⚠ WHY THE DENSITY RIDES WITH THE FOOTPRINT. The owner picked the footprint and the elevation
// from PR #1820's ladder, and in the same breath asked why an island carries ~100 trees when no
// story has that many capabilities. The grove's stand count is AREA-proportional
// (`groveStandCount` = 13 × rung × area / RECIPE_ISLAND_AREA), and restoring the footprint
// triples the area — so the two cannot be judged in sequence: shipped alone, the footprint would
// have handed him a new shape and a worse version of his own complaint at once. This page shows
// the new shape at every rung with the two numbers that make his question answerable printed on
// every arm: CAPABILITY TREES and GROVE PINES per island, and their ratio.
//
// ⚠ THE RECIPE'S DENOMINATOR MOVED WITH THE BASIS, AND THAT IS NOT A DENSITY CHANGE.
// `RECIPE_ISLAND_AREA` is "the ground the recipe's thirteen stands were scattered over, in this
// map's placement units"; the same thirteen hexes measure 2.92× more in the true-footprint basis,
// so the constant was re-derived (`grove-dressing.ts`). Rung 1 is therefore STILL the recipe's
// thirteen stands on the fixture island — what changed is that the island is now the recipe's
// own shape, so a stand is round instead of a 3:1 ellipse and holds the recipe's 4–8 members
// instead of ~3. That is why the counts on this page differ from the canopy sheet's at the same
// rung, and it is the point of re-rendering the ladder rather than inheriting a pick.
//
// ⚠⚠ THE CONTROL IS HISTORY NOW AND SAYS SO. `before` cannot be read off `frameWorld` any more —
// the canvas looks down at 50° since this landing — so its 45° and its rung are typed as
// {@link PREVIOUS_ELEVATION_DEG} / {@link PREVIOUS_DENSITY}, labelled as what shipped until
// 2026-09-05. Its footprint is the shipped stream re-projected by exactly `sin 20°` about each
// island's centre — the exact inverse of what the mapper now does
// (`true-footprint.ts`), so it is the drawing the canvas drew and not a third island. Every OTHER
// arm reads the shipped elevation off `frameWorld` through the crowd's own `orientedCamera`, and
// the driver refuses a run where that camera does not look down at `RENDER_ELEV_DEG`.
//
// ⚠ EVERY ARM IS BUILT BY THE SHIPPED COMPOSITION ROOT. `shippedGroundBuild` (the function
// `CellGround` calls) over the arm's cells, casters and strips; `dressMapWithCover` with the SAME
// options object the canvas passes plus this arm's `density`; `buildGroundMaterial` with the
// shipped constants — so the shipped arm is today's map because there is one construction of it
// (`comparison-baseline-moves-under-the-page`). The three true arms share ONE descriptor stream
// and ONE ground MESH; their fields differ only by their casters, which is the grove.
//
// ⚠ FRAME COST IS TAKEN HERE, AND IT REPORTS — IT DOES NOT GATE (ADR-0517 D4). `cost()` is the
// same GPU-clock instrument the cover and canopy pages carry; `shipped-footprint-cost.mjs` drives
// it on the RTX 2060 and writes the number beside the sheet. The owner ruled that the look ships
// first and is scaled down later if it proves too expensive; a session may not hold the change on
// this figure, and may not thin the density to improve it.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE about the `src/`
// modules it imports. The pick — the footprint, the elevation, the rung — lands in `src/`.

import * as THREE from 'three';

import { groundFlattening } from '@storytree/forest-world';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { SHIPPED_ELEVATION_DEG, shippedElevationDeg } from '../src/camera-framing.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
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
import { GROVE_DENSITY, GROVE_DENSITY_RUNGS, RECIPE_ISLAND_AREA, groveEligible } from '../src/grove-dressing.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  KIT_ROLE_SIZE,
  RENDER_ELEV_DEG,
  isCoverPlacement,
  isGrovePlacement,
  type KitPlacement,
} from '../src/kit-vocabulary.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import {
  calibrateLights,
  intensitiesFor,
  type CalibratedIntensities,
  type LightCalibration,
} from '../src/light-calibration.js';
import { dressMapWithCover } from '../src/map-dressing.js';
import { cellsByIsland, parcelCellsFrom } from '../src/parcel-cells.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import type { ShadowCaster } from '../src/land-shadow.js';
import { islandCentres, stretchAboutIslands } from '../src/true-footprint.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { armDescriptors } from './shipped-canopy-scene.js';
import {
  FIT_ZOOM,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import {
  REFERENCE_IMAGE,
  backgroundBytes,
  familyCensus,
  referenceFamilies,
} from './shipped-grass-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  VISIBLE_DELTA,
  sensitivityReasons,
  visibleDeltaDistribution,
  type VisibleDeltaReading,
} from './visible-delta.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

// ---------------------------------------------------------------- the arms

/** Which ground plane an arm stands on: the 2D drawing's projected footprint the canvas shipped
 *  until 2026-09-05, or the island's TRUE footprint the mapper restores now. */
export type Footprint = 'drawn' | 'true';

/**
 * WHAT SHIPPED UNTIL THIS LANDING, typed as history. The canvas looked down at 45° from the spike
 * commit until ADR-0517 D2 (`camera-framing.ts` now reads `RENDER_ELEV_DEG`), and it stood the
 * grove at rung 2 (PR #1808). Neither can be READ off the shipped code any more, which is exactly
 * why they are written here: the control arm has to be the picture the owner saw yesterday.
 */
export const PREVIOUS_ELEVATION_DEG = 45;
export const PREVIOUS_DENSITY = 2;

/**
 * THE RECIPE AREA THE CONTROL'S COUNTS ARE PROPORTIONED AGAINST — the fixture island's rings in
 * the SQUASHED basis the mapper delivered until this landing (`grove-dressing.ts`: 8,424.6,
 * re-derived to 24,631.8 with the footprint). The control must reproduce yesterday's picture — 26
 * stands and the recipe's 216 ground-cover props on the fixture island at rung x2 — and both
 * counts now divide by the true-basis constant, so the control hands the dressing the basis it
 * stood in (`recipeIslandArea`, threaded through `dressMapWithCover` to the grove and the cover).
 * Without it the control would grow 9 stands and 74 cover props: a picture nobody ever saw.
 * (Scaling the RUNG instead — 2 × 2.92 = 5.85 — trips the grove's runaway guard, which is read at
 * the boldest declared rung; the guard is right, 5.85 is not a rung.)
 */
export const PREVIOUS_RECIPE_ISLAND_AREA = 8424.6;

export interface FootprintArmSpec {
  id: string;
  footprint: Footprint;
  elevationDeg: number;
  /** Which rung of `GROVE_DENSITY_RUNGS` the healthy islands' groves grow at. */
  density: number;
  /** The recipe area the counts are proportioned against — today's constant on the true arms,
   *  {@link PREVIOUS_RECIPE_ISLAND_AREA} on the control. */
  recipeIslandArea: number;
}

export const CONTROL_ARM = 'before';

export function trueArmId(density: number): string {
  return `true-x${density}`;
}

/** The density rungs rendered on the true footprint — the declared ladder, by import. */
export const DENSITY_LADDER: readonly number[] = [...GROVE_DENSITY_RUNGS];

/** Every arm: the control first, then the true footprint up the density ladder. */
export const FOOTPRINT_ARMS: readonly FootprintArmSpec[] = [
  {
    id: CONTROL_ARM,
    footprint: 'drawn',
    elevationDeg: PREVIOUS_ELEVATION_DEG,
    density: PREVIOUS_DENSITY,
    recipeIslandArea: PREVIOUS_RECIPE_ISLAND_AREA,
  },
  ...DENSITY_LADDER.map((density) => ({
    id: trueArmId(density),
    footprint: 'true' as const,
    elevationDeg: SHIPPED_ELEVATION_DEG,
    density,
    recipeIslandArea: RECIPE_ISLAND_AREA,
  })),
];

/** The arm the canvas stands after this landing: the true footprint at the shipped rung. */
export const SHIPPED_ARM: string = trueArmId(GROVE_DENSITY);

export function armSpec(id: string): FootprintArmSpec {
  const found = FOOTPRINT_ARMS.find((a) => a.id === id);
  if (!found) throw new Error(`shipped-footprint-scene: no arm "${id}"`);
  return found;
}

/** The true-footprint arm one rung LEANER on the ladder, or null at the bottom and for the control. */
export function leanerArm(id: string): string | null {
  const spec = armSpec(id);
  if (spec.footprint !== 'true') return null;
  const i = DENSITY_LADDER.indexOf(spec.density);
  return i > 0 ? trueArmId(DENSITY_LADDER[i - 1]!) : null;
}

/** What each arm IS, as the caption under its own picture. */
export function armCaption(id: string): string {
  const spec = armSpec(id);
  if (id === CONTROL_ARM) {
    return (
      `the map AS IT SHIPPED UNTIL 2026-09-05 — the 2D drawing’s squashed footprint (234 × ~46 units) from the ` +
      `${PREVIOUS_ELEVATION_DEG}° camera, the grove at rung x${PREVIOUS_DENSITY} — BEFORE (CONTROL)`
    );
  }
  const rung =
    spec.density === 1
      ? 'the RECIPE’S OWN stand count (13 stands per recipe-island of area)'
      : `${spec.density}× the recipe’s stands`;
  const tag = id === SHIPPED_ARM ? ' — THE SHIPPED PICK' : '';
  return (
    `the island’s TRUE footprint (234 × ~135 units, the recipe’s own) from the owner-signed ${spec.elevationDeg}°, ` +
    `the grove at ${rung}${tag}`
  );
}

/** One island and the thirty-five-island forest; read at 8 px/unit, judged fitted too. */
export const FOOTPRINT_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];
export const FOOTPRINT_ZOOMS: readonly number[] = [8];
export const FOOTPRINT_PICTURE_ZOOMS: readonly CrowdZoom[] = [...FOOTPRINT_ZOOMS, FIT_ZOOM];

// ---------------------------------------------------------------- what each arm stands on

const descriptorMemo = new Map<string, InstanceDescriptor[]>();

/**
 * The descriptor stream a footprint stands on — the canopy page's own crowd stream for `true`
 * (which the mapper now delivers unprojected), and that stream RE-PROJECTED by `sin 20°` about
 * each island's centre for `drawn`: the exact inverse of `restoreTrueFootprint`, so it is the
 * drawing the canvas drew until this landing. `shipped-footprint-scene.test.ts` holds the
 * round trip and the 234 × 46.
 */
export function footprintDescriptors(footprint: Footprint, size: CrowdSize): InstanceDescriptor[] {
  const key = `${footprint}|${size.id}`;
  const hit = descriptorMemo.get(key);
  if (hit !== undefined) return hit;
  const base = armDescriptors(size);
  const built = footprint === 'true' ? base : stretchAboutIslands(base, groundFlattening());
  descriptorMemo.set(key, built);
  return built;
}

export function footprintCells(footprint: Footprint, size: CrowdSize): InstanceDescriptor[] {
  return footprintDescriptors(footprint, size).filter((d) => d.kind === 'cell-ground');
}

export function footprintStrips(footprint: Footprint, size: CrowdSize): InstanceDescriptor[] {
  return footprintDescriptors(footprint, size).filter((d) => d.kind === 'trail-strip');
}

const placementMemo = new Map<string, KitPlacement[]>();

/**
 * WHAT STANDS ON AN ARM — `dressMapWithCover` with the SAME options the canvas passes
 * (`ForestWorldCanvas.tsx`: `{ relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29 }`)
 * plus this arm's density rung. Memoised per arm and size: the forest's dressing is thirty-five
 * islands' worth of placement.
 */
export function armPlacements(arm: string, size: CrowdSize): KitPlacement[] {
  const key = `${arm}|${size.id}`;
  const hit = placementMemo.get(key);
  if (hit !== undefined) return hit;
  const spec = armSpec(arm);
  const built = dressMapWithCover(footprintDescriptors(spec.footprint, size), {
    relief: LAND_RELIEF_AMPLITUDE,
    footprint: KIT_FOOTPRINTS_2026_08_29,
    density: spec.density,
    recipeIslandArea: spec.recipeIslandArea,
  });
  placementMemo.set(key, built);
  return built;
}

/** What darkens an arm's ground — the descriptor stream's casters UNIONED with one per placement,
 *  the same union the canvas hands its ground. */
export function armCasters(arm: string, size: CrowdSize): ShadowCaster[] {
  const spec = armSpec(arm);
  return [
    ...groundCasters(footprintDescriptors(spec.footprint, size)),
    ...placementCasters(armPlacements(arm, size), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29),
  ];
}

const groundBuildMemo = new Map<string, ShippedGroundBuild>();

/** THE SHIPPED GROUND, BUILT ONCE PER ARM AND SIZE — `shippedGroundBuild`, the function
 *  `CellGround` calls, over this arm's cells, casters and strips. */
export function armGroundBuild(arm: string, size: CrowdSize): ShippedGroundBuild {
  const key = `${arm}|${size.id}`;
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const spec = armSpec(arm);
  const built = shippedGroundBuild(
    footprintCells(spec.footprint, size),
    armCasters(arm, size),
    footprintStrips(spec.footprint, size),
  );
  groundBuildMemo.set(key, built);
  return built;
}

// ---------------------------------------------------------------- the two numbers

/**
 * THE COUNTS THE OWNER'S QUESTION TURNS ON. A capability tree is every placement that is neither a
 * grove member, nor ground cover, nor a signature bloom — the vocabulary's one object per
 * capability (ADR-0475). `pinesPerCapability` is the ratio he is reading: how many dressing pines
 * the map stands for every tree that MEANS something.
 */
export interface DressingCounts {
  placements: number;
  capabilityTrees: number;
  blooms: number;
  grovePines: number;
  cover: number;
  /** Islands in the stream, and how many of them grow a grove (every cell `healthy`). */
  islands: number;
  healthyIslands: number;
  /** Grove pines over capability trees, whole stream. */
  pinesPerCapability: number;
  /** Per HEALTHY island: capability trees and grove pines, so the forest reads like one island. */
  capabilityTreesPerHealthyIsland: number;
  grovePinesPerHealthyIsland: number;
}

export function dressingCounts(placements: readonly KitPlacement[], stream: readonly InstanceDescriptor[]): DressingCounts {
  let grovePines = 0;
  let cover = 0;
  let blooms = 0;
  for (const p of placements) {
    if (isGrovePlacement(p)) grovePines += 1;
    else if (isCoverPlacement(p)) cover += 1;
    else if (p.role === 'bloom') blooms += 1;
  }
  const capabilityTrees = placements.length - grovePines - cover - blooms;
  const byIsland = cellsByIsland(parcelCellsFrom(stream));
  let healthyIslands = 0;
  for (const cells of byIsland.values()) if (groveEligible(cells)) healthyIslands += 1;
  // Capability trees on the healthy islands only — the ratio he sees on a green island.
  const healthyIds = new Set([...byIsland.entries()].filter(([, cells]) => groveEligible(cells)).map(([id]) => id));
  let healthyCapabilityTrees = 0;
  for (const p of placements) {
    if (isGrovePlacement(p) || isCoverPlacement(p) || p.role === 'bloom') continue;
    if (healthyIds.has(p.capId.split('/')[0] ?? '')) healthyCapabilityTrees += 1;
  }
  return {
    placements: placements.length,
    capabilityTrees,
    blooms,
    grovePines,
    cover,
    islands: byIsland.size,
    healthyIslands,
    pinesPerCapability: capabilityTrees === 0 ? 0 : grovePines / capabilityTrees,
    capabilityTreesPerHealthyIsland: healthyIslands === 0 ? 0 : healthyCapabilityTrees / healthyIslands,
    grovePinesPerHealthyIsland: healthyIslands === 0 ? 0 : grovePines / healthyIslands,
  };
}

// ---------------------------------------------------------------- the camera

/**
 * A camera at `elevationDeg`, looking at `centre` from the +z side, with the frustum sized for
 * `pxPerUnit` — the crowd's `orientedCamera` with the elevation as a parameter. Used ONLY for the
 * control arm, whose 45° is history; every true arm takes `orientedCamera` itself, which reads
 * `frameWorld`.
 */
export function elevatedCamera(
  centre: { x: number; z: number },
  pxPerUnit: number,
  elevationDeg: number,
): THREE.OrthographicCamera {
  const halfW = CROWD_VIEWPORT.w / pxPerUnit / 2;
  const halfH = CROWD_VIEWPORT.h / pxPerUnit / 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -20000, 20000);
  const elev = (elevationDeg * Math.PI) / 180;
  const dist = 8000;
  camera.position.set(centre.x, Math.sin(elev) * dist, centre.z + Math.cos(elev) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(centre.x, 0, centre.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** This arm's camera: the SHIPPED one (read off `frameWorld` by the crowd page) for every true
 *  arm, the historical 45° for the control. */
export function armCamera(spec: FootprintArmSpec, pxPerUnit: number): THREE.OrthographicCamera {
  return spec.id === CONTROL_ARM
    ? elevatedCamera({ x: 0, z: 0 }, pxPerUnit, spec.elevationDeg)
    : orientedCamera({ x: 0, z: 0 }, pxPerUnit);
}

/** The unit view direction (eye minus target) of a camera looking at the origin. */
export function viewDirectionOf(camera: THREE.Camera): THREE.Vector3 {
  return camera.position.clone().normalize();
}

/** The elevation a camera looks down at, in degrees, read off its position. */
export function cameraElevationDeg(camera: THREE.Camera): number {
  const d = viewDirectionOf(camera);
  return (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
}

/** Complaints if the shipped camera is not the signed one — or the control is not the old one. */
export function cameraAgreement(): string[] {
  const out: string[] = [];
  const shipped = cameraElevationDeg(orientedCamera({ x: 0, z: 0 }, 1));
  if (Math.abs(shipped - RENDER_ELEV_DEG) > 1e-9) {
    out.push(`the shipped crowd camera looks down at ${shipped.toFixed(4)}°, not the signed ${RENDER_ELEV_DEG}°`);
  }
  if (Math.abs(shippedElevationDeg() - SHIPPED_ELEVATION_DEG) > 1e-9) {
    out.push(`frameWorld looks down at ${shippedElevationDeg().toFixed(4)}° against SHIPPED_ELEVATION_DEG ${SHIPPED_ELEVATION_DEG}`);
  }
  const control = cameraElevationDeg(elevatedCamera({ x: 0, z: 0 }, 1, PREVIOUS_ELEVATION_DEG));
  if (Math.abs(control - PREVIOUS_ELEVATION_DEG) > 1e-9) {
    out.push(`the control camera looks down at ${control.toFixed(4)}°, not the historical ${PREVIOUS_ELEVATION_DEG}°`);
  }
  if (Math.abs(PREVIOUS_ELEVATION_DEG - SHIPPED_ELEVATION_DEG) < 1e-9) {
    out.push('the control and the shipped elevation are the same number — the control is no longer "before"');
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

/** Fit rule: the px/unit at which `positions`, seen through a unit camera at this arm's elevation,
 *  land inside the buffer with the crowd page's margin. */
export function fitPxPerUnitFor(positions: ArrayLike<number>, spec: FootprintArmSpec): number {
  const e = screenExtent(positions, armCamera(spec, 1));
  const halfW = Math.max(Math.abs(e.minX), Math.abs(e.maxX)) + FIT_MARGIN;
  const halfH = Math.max(Math.abs(e.minY), Math.abs(e.maxY)) + FIT_MARGIN;
  return Math.min(CROWD_VIEWPORT.w / 2 / halfW, CROWD_VIEWPORT.h / 2 / halfH);
}

/** A pine's delivered height on screen at an elevation — the upright is foreshortened by cos. */
export function deliveredPineHeightPx(elevationDeg: number, pxPerUnit: number): number {
  return KIT_ROLE_SIZE.tree.units * Math.cos((elevationDeg * Math.PI) / 180) * pxPerUnit;
}

/** A ground-plane footprint: width along x and depth along z, in ground units. */
export interface GroundExtent {
  w: number;
  d: number;
}

/** The footprint of the ONE island nearest the origin — the island every 8 px/unit frame is
 *  centred on. */
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

/** The ground-plane depth (z extent) of a cell set — the footprint's own number, camera-free. */
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

// ---------------------------------------------------------------- the scene

export interface FootprintScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  spec: FootprintArmSpec;
  groundTriangles: number;
  ground: GroundExtent;
  island: GroundExtent;
  screen: ScreenExtent;
  counts: DressingCounts;
  casters: number;
  meshes: number;
}

/** ONE ARM'S SCENE: its ground build and placements, the camera it is judged from, nothing else free. */
export function buildFootprintScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: string,
  size: CrowdSize,
  zoom: CrowdZoom,
): FootprintScene {
  const spec = armSpec(arm);
  const build = armGroundBuild(arm, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-footprint-scene: the crowd drew no ground');
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
  const pxPerUnit = zoom === FIT_ZOOM ? fitPxPerUnitFor(geo.positions, spec) : zoom;
  const camera = armCamera(spec, pxPerUnit);
  const stream = footprintDescriptors(spec.footprint, size);
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    spec,
    groundTriangles: geo.triangles,
    ground: groundDepth(footprintCells(spec.footprint, size)),
    island: islandDepth(footprintCells(spec.footprint, size)),
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
        bg === null
          ? rgba[i + 3]! < 128
          : rgba[i]! === bg[0] && rgba[i + 1]! === bg[1] && rgba[i + 2]! === bg[2];
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

export interface FootprintReading {
  arm: string;
  footprint: Footprint;
  elevationDeg: number;
  density: number;
  recipeIslandArea: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  counts: DressingCounts;
  casters: number;
  meshes: number;
  ground: GroundExtent;
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
  /** Against the rung one leaner on the same footprint (null for the control and the bottom rung). */
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

export interface FootprintCostSpec {
  arm: string;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
}

export interface FootprintCostReading extends FootprintCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface FootprintRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  agreement(): string[];
  warm(): void;
  read(arm: string, size: CrowdSizeId, zoom: CrowdZoom): FootprintReading;
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  /** The frame cost of one arm on the GPU's own clock — a REPORT (ADR-0517 D4). */
  cost(spec: FootprintCostSpec): Promise<FootprintCostReading>;
  snapshot(arm: string, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceGeometry>;
}

export async function createFootprintRunner(): Promise<FootprintRunner> {
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
  const cache = new Map<string, FootprintScene>();
  const sceneFor = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): FootprintScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildFootprintScene(kit, lit, arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): FootprintScene => {
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
      for (const arm of FOOTPRINT_ARMS) render(arm.id, 'one', FOOTPRINT_ZOOMS[0]!);
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
        footprint: s.spec.footprint,
        elevationDeg: s.spec.elevationDeg,
        density: s.spec.density,
        recipeIslandArea: s.spec.recipeIslandArea,
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        counts: s.counts,
        casters: s.casters,
        meshes: s.meshes,
        ground: s.ground,
        island: s.island,
        screen: {
          w: s.screen.w,
          h: s.screen.h,
          wPx: s.screen.w * s.pxPerUnit,
          hPx: s.screen.h * s.pxPerUnit,
          aspect: s.screen.w / s.screen.h,
        },
        box: landBox(buf, s.width, s.height, bg),
        pineHeightPx: deliveredPineHeightPx(s.spec.elevationDeg, s.pxPerUnit),
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
        img.onerror = () => rej(new Error(`shipped-footprint-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-footprint-scene: no 2d context for the reference');
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

/** The two numbers, as one line under a picture. */
export function countsCaption(c: DressingCounts, size: CrowdSizeId): string {
  const ratio = c.pinesPerCapability.toFixed(1);
  if (size === 'one') {
    return `${c.capabilityTrees} capability trees · ${c.grovePines} grove pines (${ratio} per capability) · ${c.blooms} blooms · ${c.cover} ground cover`;
  }
  return (
    `${c.islands} islands, ${c.healthyIslands} green · ${c.capabilityTrees} capability trees · ${c.grovePines} grove pines ` +
    `(${ratio} per capability; per green island ${c.capabilityTreesPerHealthyIsland.toFixed(1)} trees, ${c.grovePinesPerHealthyIsland.toFixed(0)} pines) · ${c.cover} ground cover`
  );
}

export async function mountShippedFootprint(root: HTMLElement): Promise<void> {
  const runner = await createFootprintRunner();
  window.footprintRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target} · shipped elevation ${shippedElevationDeg().toFixed(2)}° (signed ${RENDER_ELEV_DEG}°) · ` +
    `control elevation ${PREVIOUS_ELEVATION_DEG}° · shipped rung x${GROVE_DENSITY} · camera agreement: ${runner.agreement().length === 0 ? 'the shipped camera is the signed one and the control is the old one' : runner.agreement().join('; ')}`;
  root.appendChild(head);
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, orthographic, 50°, the true footprint, 13 stands)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 900;
  refFig.appendChild(refImg);
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined-1948px.png — the look-fence, ADR-0489 D3';
  refFig.appendChild(refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);
  for (const size of FOOTPRINT_SIZES) {
    for (const zoom of FOOTPRINT_PICTURE_ZOOMS) {
      const h = document.createElement('h2');
      h.textContent = `${size.id} — ${zoom === FIT_ZOOM ? 'fitted (each arm at its own fit)' : `${zoom} px/unit`}`;
      root.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of FOOTPRINT_ARMS) {
        const r = runner.read(arm.id, size.id, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm.id, size.id, zoom);
        img.width = 900;
        fig.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm.id} — ${armCaption(arm.id)} · ${countsCaption(r.counts, size.id)} · ${r.pxPerUnit.toFixed(3)} px/unit · ` +
          `island on screen ${r.screen.wPx.toFixed(0)}×${r.screen.hPx.toFixed(0)} px (w/h ${r.screen.aspect.toFixed(2)}) · pine ${r.pineHeightPx.toFixed(0)} px tall · ` +
          `${r.families} families · MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs before ${r.visible.toLocaleString()}`;
        fig.appendChild(cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }
}

declare global {
  interface Window {
    footprintRunner?: FootprintRunner;
  }
}
