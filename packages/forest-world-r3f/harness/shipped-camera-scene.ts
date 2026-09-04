// shipped-camera-scene.ts — THE CAMERA'S ELEVATION, and the ground's FOOTPRINT, on one ladder for
// the owner: the shipped island with its groves and ground cover, seen from four elevations, on
// two ground planes — eight arms, every one of them the shipped composition with exactly two
// things free to move.
//
//   map-45    TODAY (CONTROL): the drawing's projected footprint, the shipped 45° camera
//   map-50    the same ground, the owner-signed 50° every approved render was taken at
//   map-55    the same ground, 55°
//   map-60    the same ground, 60°
//   true-45   the island's TRUE footprint — the hex cluster unprojected — at the shipped 45°
//   true-50   the true footprint at the signed 50°: the approved render's own geometry
//   true-55   the true footprint at 55°
//   true-60   the true footprint at 60°
//
// ⚠⚠ THE TWO AXES ARE TWO DIFFERENT CAUSES, AND THE PAGE EXISTS TO SEPARATE THEM. The owner reads
// the map's camera as too low. Two facts start the increment: (1) the shipped view is a 45°
// elevation (`camera-framing.ts`, `back · √2` from the target) while every render he approved was
// taken at the owner-signed 50° (`build_land.py`'s `RENDER_ELEV_DEG`, mirrored as
// `kit-vocabulary.ts`'s constant); (2) the shipped ground plane is the 2D map's ALREADY
// FORESHORTENED shape — `worldTo3D` maps the drawing's (x, y) straight to (x, 0, z), and the
// drawing is projected at `LAND_CAMERA_ELEVATION_DEG` = 20°, so the island is 234 wide and ~46
// deep where the hex cluster the recipe renders is 233.8 × 135.1. The 3D camera then foreshortens
// that squashed plane AGAIN. Raising a camera over a squashed plane makes a thin ribbon thinner
// from above, not rounder; the footprint arm is what tells the two apart. A ladder on the
// elevation alone would have answered the question he asked and not the one the geometry poses.
//
// ⚠⚠ THE PAGE DECIDES NOTHING. This row closes on the OWNER'S look, recorded as an ADR (the
// elevation is a signed constant — ADR-0392 D1: an owner look on a whole island at delivered
// size, not an agent art call). `SHIPPED_ELEVATION_DEG` is READ off `frameWorld`, never written
// here; the ladder's second rung is READ off `RENDER_ELEV_DEG`. Nothing in `src/` moves.
//
// ⚠ THE TRUE FOOTPRINT IS THE MAPPER HANDED THE UNPROJECTED OUTLINE, in two independent ways that
// the test holds equal: the fixture island built at `PLAN_VIEW_ELEVATION_DEG` (the scene's own
// `cameraElevationDeg` seam, 90°, sin = 1), and the shipped descriptor stream with every ground
// z divided by `groundFlattening()` = sin 20°. The crowd's synthetic forest goes through the
// second route, because its island offsets are the layout's own and not a scene's. Each island
// is stretched about its OWN centre so the layout holds still and exactly one thing moves;
// `unprojectDescriptors` records why the whole-map stretch was measured and rejected.
//
// ⚠ EVERY ARM IS BUILT BY THE SHIPPED COMPOSITION ROOT. `shippedGroundBuild` (the function
// `CellGround` calls) over the footprint's cells, casters and strips; `dressMapWithCover` with
// the SAME options object the canvas passes; `buildGroundMaterial` with the shipped constants —
// so the control is today's map only because there is one construction of it, never because a
// checklist was kept true (`comparison-baseline-moves-under-the-page`). Within a footprint the
// four elevations share ONE ground build and ONE placement list; the driver refuses a run where
// they do not, because then a difference between rungs would not be the camera's.
//
// ⚠ NO FRAME COST HERE, ON PURPOSE. The increment says not to re-measure the angle as if it were
// a layer: the ground coverage per frame changes with elevation, and `land-floor`'s coverage floor
// voids the overview view already. A camera is not a layer and its cost is not the question.
//
// THE PAGE ADOPTS NOTHING. `harness/` only: it produces EVIDENCE about the `src/` modules it
// imports. The pick, when the owner makes it, lands in `camera-framing.ts` and the crowd camera
// together, with every consumer of the elevation re-derived rather than inherited.

import * as THREE from 'three';

import { groundFlattening } from '@storytree/forest-world';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { frameWorld } from '../src/camera-framing.js';
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
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  KIT_ROLE_SIZE,
  RENDER_ELEV_DEG,
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
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import type { ShadowCaster } from '../src/land-shadow.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
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

// ---------------------------------------------------------------- the two axes

/** Which ground plane an arm stands on: the drawing's PROJECTED footprint the canvas ships, or
 *  the island's TRUE footprint (the hex cluster unprojected). */
export type Footprint = 'map' | 'true';
export const FOOTPRINTS: readonly Footprint[] = ['map', 'true'];

/**
 * THE ELEVATION THE SHIPPED CANVAS LOOKS DOWN AT, READ OFF `frameWorld` — never written here.
 *
 * `frameWorld` places the eye `back` up and `back` along +z from the target, and the whole point
 * of a control arm is that it is what ships; a `45` typed here would be a transcription that
 * stays 45 after the canvas moves. `shipped-camera-scene.test.ts` pins what this currently reads.
 */
export function shippedElevationDeg(): number {
  const frame = frameWorld([]);
  const dx = frame.position[0] - frame.target[0];
  const dy = frame.position[1] - frame.target[1];
  const dz = frame.position[2] - frame.target[2];
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

export const SHIPPED_ELEVATION_DEG: number = shippedElevationDeg();

/** The owner-signed elevation every approved render was taken at — `build_land.py`'s
 *  `RENDER_ELEV_DEG`, read through the `src/` constant that mirrors it. */
export const SIGNED_ELEVATION_DEG: number = RENDER_ELEV_DEG;

/**
 * THE LADDER — the shipped rung first, the signed rung second, then two steps of five degrees
 * above it. The increment names these four; the two above the signed value are there so the
 * owner can say "higher still" or "back" against rungs he has already seen (ADR-0503 D3).
 */
export const ELEVATION_LADDER: readonly number[] = [SHIPPED_ELEVATION_DEG, SIGNED_ELEVATION_DEG, 55, 60];

/** One arm: a footprint and an elevation. The id is `${footprint}-${elevation}`. */
export interface CameraArmSpec {
  id: string;
  footprint: Footprint;
  elevationDeg: number;
}

export function armId(footprint: Footprint, elevationDeg: number): string {
  return `${footprint}-${Math.round(elevationDeg)}`;
}

/** Every arm, footprint-major so a row of the sheet is one ground plane across the ladder. */
export const CAMERA_ARMS: readonly CameraArmSpec[] = FOOTPRINTS.flatMap((footprint) =>
  ELEVATION_LADDER.map((elevationDeg) => ({ id: armId(footprint, elevationDeg), footprint, elevationDeg })),
);

/** Today's picture — the shipped footprint at the shipped elevation. Every "moved >20/255" is
 *  against it. */
export const CONTROL_ARM: string = armId('map', SHIPPED_ELEVATION_DEG);

/** The approved render's own geometry — the true footprint at the signed elevation. */
export const REFERENCE_GEOMETRY_ARM: string = armId('true', SIGNED_ELEVATION_DEG);

export function armSpec(id: string): CameraArmSpec {
  const found = CAMERA_ARMS.find((a) => a.id === id);
  if (!found) throw new Error(`shipped-camera-scene: no arm "${id}"`);
  return found;
}

/** The arm one rung LOWER on the same footprint, or null at the bottom. */
export function lowerArm(id: string): string | null {
  const spec = armSpec(id);
  const i = ELEVATION_LADDER.indexOf(spec.elevationDeg);
  return i > 0 ? armId(spec.footprint, ELEVATION_LADDER[i - 1]!) : null;
}

/** The arm at the same elevation on the OTHER footprint. */
export function otherFootprintArm(id: string): string {
  const spec = armSpec(id);
  return armId(spec.footprint === 'map' ? 'true' : 'map', spec.elevationDeg);
}

/** What each arm IS, as the caption under its own picture. */
export function armCaption(id: string): string {
  const spec = armSpec(id);
  const ground =
    spec.footprint === 'map'
      ? 'the SHIPPED ground plane — the 2D drawing’s already-foreshortened footprint (234 × ~46 units)'
      : 'the island’s TRUE footprint — the hex cluster unprojected (234 × ~135 units, the recipe’s own)';
  const eye =
    spec.elevationDeg === SHIPPED_ELEVATION_DEG
      ? `the shipped ${spec.elevationDeg}° camera`
      : spec.elevationDeg === SIGNED_ELEVATION_DEG
        ? `the owner-signed ${spec.elevationDeg}° every approved render was taken at`
        : `a ${spec.elevationDeg}° camera`;
  const tag = spec.id === CONTROL_ARM ? ' — TODAY (CONTROL)' : spec.id === REFERENCE_GEOMETRY_ARM ? ' — the approved render’s own geometry' : '';
  return `${ground}, from ${eye}${tag}`;
}

/** One island and the thirty-five-island forest. The camera is read at both: the forest's FITTED
 *  view is the view the map opens on, and a deeper footprint costs it scale. */
export const CAMERA_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];
export const CAMERA_ZOOMS: readonly number[] = [8];
export const CAMERA_PICTURE_ZOOMS: readonly CrowdZoom[] = [...CAMERA_ZOOMS, FIT_ZOOM];

// ---------------------------------------------------------------- the true footprint

/**
 * THE DRAWING'S PROJECTION, UNDONE — PER ISLAND: every ground z stretched by `1 / groundFlattening()`
 * (sin of the declared land camera) about its OWN island's centre, x untouched.
 *
 * ⚠ ABOUT EACH ISLAND, NOT ABOUT THE ORIGIN, and the difference was measured rather than argued.
 * The first version stretched the whole stream about the forest origin, which unprojects the
 * layout's SPACING along with the islands — the thirty-five-island crowd became 10,235 units deep
 * and `shore-grid` refused the extent outright (478,401 buckets against its 262,144 cap). That is
 * a true fact about what re-laying the real map out would cost the shipped machinery, and it is
 * not this page's question: the owner is judging the ISLAND's footprint, so the arm that isolates
 * it holds the layout still and unsquashes each island in place. On one island the two are the
 * same picture up to where the island sits in the frame.
 *
 * ⚠ THE WHOLE STREAM, NOT THE CELLS ALONE. The strips dock on the coast, the blooms carry an
 * island's centre, a cave stands on the rim — every one of them was projected by the same
 * `projectGround`, so unprojecting the cells and leaving the rest would put the docks in the
 * water and the flowers off their islands. A descriptor that names its island is stretched about
 * that island; one that does not (a strip) is stretched about the nearest island's centre, which
 * for a strip landing on a coast is its own.
 */
export function unprojectDescriptors(descriptors: readonly InstanceDescriptor[]): InstanceDescriptor[] {
  const stretch = 1 / groundFlattening();
  const centres = islandCentres(descriptors);
  const centreFor = (d: InstanceDescriptor): number => {
    const own = d.island === undefined ? undefined : centres.get(d.island);
    if (own !== undefined) return own.z;
    let best = 0;
    let bestDist = Infinity;
    for (const c of centres.values()) {
      const dist = Math.hypot(d.transform.x - c.x, d.transform.z - c.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = c.z;
      }
    }
    return best;
  };
  return descriptors.map((d) => {
    const cz = centreFor(d);
    const at = (z: number): number => cz + (z - cz) * stretch;
    const moved: InstanceDescriptor = { ...d, transform: { ...d.transform, z: at(d.transform.z) } };
    if (d.points !== undefined) moved.points = d.points.map((p) => ({ ...p, z: at(p.z) }));
    return moved;
  });
}

/** Each island's ground centre — the mean of its cells' ring vertices — keyed by island id. */
export function islandCentres(descriptors: readonly InstanceDescriptor[]): Map<string, { x: number; z: number }> {
  const sums = new Map<string, { x: number; z: number; n: number }>();
  for (const d of descriptors) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    const acc = sums.get(d.island) ?? { x: 0, z: 0, n: 0 };
    for (const p of d.points ?? []) {
      acc.x += p.x;
      acc.z += p.z;
      acc.n += 1;
    }
    sums.set(d.island, acc);
  }
  const out = new Map<string, { x: number; z: number }>();
  for (const [id, acc] of sums) if (acc.n > 0) out.set(id, { x: acc.x / acc.n, z: acc.z / acc.n });
  return out;
}

const descriptorMemo = new Map<string, InstanceDescriptor[]>();

/** The descriptor stream one footprint stands on — the canopy page's own crowd stream for `map`
 *  (the same islands, strips and signatures every sibling page reads), unprojected for `true`. */
export function footprintDescriptors(footprint: Footprint, size: CrowdSize): InstanceDescriptor[] {
  const key = `${footprint}|${size.id}`;
  const hit = descriptorMemo.get(key);
  if (hit !== undefined) return hit;
  const base = armDescriptors(size);
  const built = footprint === 'map' ? base : unprojectDescriptors(base);
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
 * WHAT STANDS ON A FOOTPRINT — `dressMapWithCover` with the SAME options the canvas passes
 * (`ForestWorldCanvas.tsx`: `{ relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29 }`,
 * density and cover size left to their shipped defaults). Memoised per footprint and size: the
 * forest's dressing is thirty-five islands' worth of placement.
 */
export function footprintPlacements(footprint: Footprint, size: CrowdSize): KitPlacement[] {
  const key = `${footprint}|${size.id}`;
  const hit = placementMemo.get(key);
  if (hit !== undefined) return hit;
  const built = dressMapWithCover(footprintDescriptors(footprint, size), {
    relief: LAND_RELIEF_AMPLITUDE,
    footprint: KIT_FOOTPRINTS_2026_08_29,
  });
  placementMemo.set(key, built);
  return built;
}

/** What darkens a footprint's ground — the descriptor stream's casters UNIONED with one per
 *  placement, the same union the canvas hands its ground. */
export function footprintCasters(footprint: Footprint, size: CrowdSize): ShadowCaster[] {
  return [
    ...groundCasters(footprintDescriptors(footprint, size)),
    ...placementCasters(footprintPlacements(footprint, size), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29),
  ];
}

const groundBuildMemo = new Map<string, ShippedGroundBuild>();

/** THE SHIPPED GROUND, BUILT ONCE PER FOOTPRINT AND SIZE — `shippedGroundBuild`, the function
 *  `CellGround` calls. The four elevations of a footprint read this one build, which is what
 *  makes a difference between them the camera's and nothing else's. */
export function footprintGroundBuild(footprint: Footprint, size: CrowdSize): ShippedGroundBuild {
  const key = `${footprint}|${size.id}`;
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const built = shippedGroundBuild(
    footprintCells(footprint, size),
    footprintCasters(footprint, size),
    footprintStrips(footprint, size),
  );
  groundBuildMemo.set(key, built);
  return built;
}

// ---------------------------------------------------------------- the camera

/**
 * A camera at `elevationDeg`, looking at `centre` from the +z side, with the frustum sized for
 * `pxPerUnit` — the crowd's `orientedCamera` with the elevation as a parameter.
 *
 * ⚠ THE SHIPPED RUNG MUST BE THE SHIPPED CAMERA. `frameWorld` sits the eye at +z, so azimuth is
 * fixed and only the elevation moves; {@link shippedCameraAgreement} measures that this camera at
 * `SHIPPED_ELEVATION_DEG` looks along the very direction `orientedCamera` does, and the driver
 * refuses a run where it does not. The depth range is the instrument's, as next door.
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

/** The unit view direction (eye minus target) of a camera looking at the origin. */
export function viewDirectionOf(camera: THREE.Camera): THREE.Vector3 {
  return camera.position.clone().normalize();
}

/** Complaints if this page's shipped rung does not look along the crowd page's shipped camera. */
export function shippedCameraAgreement(): string[] {
  const ours = viewDirectionOf(elevatedCamera({ x: 0, z: 0 }, 1, SHIPPED_ELEVATION_DEG));
  const theirs = viewDirectionOf(orientedCamera({ x: 0, z: 0 }, 1));
  const out: string[] = [];
  if (ours.distanceTo(theirs) > 1e-9) {
    out.push(
      `the control arm looks along (${ours.x.toFixed(6)}, ${ours.y.toFixed(6)}, ${ours.z.toFixed(6)}) but the ` +
        `shipped crowd camera looks along (${theirs.x.toFixed(6)}, ${theirs.y.toFixed(6)}, ${theirs.z.toFixed(6)}) ` +
        '— the control is not today’s view',
    );
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

/** Fit rule: the px/unit at which `positions`, seen through a camera at `elevationDeg`, land inside
 *  the buffer with the crowd page's margin. Centred on the origin, as every scene here is. */
export function fitPxPerUnitFor(positions: ArrayLike<number>, elevationDeg: number): number {
  const e = screenExtent(positions, elevatedCamera({ x: 0, z: 0 }, 1, elevationDeg));
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
 *  centred on, and the one the stretch is checked against exactly (a forest's whole extent also
 *  carries the layout's spacing, which the per-island stretch leaves alone). */
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

export interface CameraScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  elevationDeg: number;
  footprint: Footprint;
  groundTriangles: number;
  /** The ground's own footprint in ground units, before any camera — the whole cell set. */
  ground: GroundExtent;
  /** The centre island's own footprint — what the stretch is checked against exactly. */
  island: GroundExtent;
  /** The ground mesh's screen-plane extent through THIS arm's camera, in world units. */
  screen: ScreenExtent;
  placements: number;
  casters: number;
  meshes: number;
}

/**
 * ONE ARM'S SCENE: the footprint's ground build and placements (shared across its four
 * elevations), a camera at this arm's elevation, and nothing else free.
 */
export function buildCameraScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: string,
  size: CrowdSize,
  zoom: CrowdZoom,
): CameraScene {
  const spec = armSpec(arm);
  const build = footprintGroundBuild(spec.footprint, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-camera-scene: the crowd drew no ground');
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
  const placements = footprintPlacements(spec.footprint, size);
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
  const pxPerUnit = zoom === FIT_ZOOM ? fitPxPerUnitFor(geo.positions, spec.elevationDeg) : zoom;
  const camera = elevatedCamera({ x: 0, z: 0 }, pxPerUnit, spec.elevationDeg);
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    elevationDeg: spec.elevationDeg,
    footprint: spec.footprint,
    groundTriangles: geo.triangles,
    ground: groundDepth(footprintCells(spec.footprint, size)),
    island: islandDepth(footprintCells(spec.footprint, size)),
    screen: screenExtent(geo.positions, camera),
    placements: placements.length,
    casters: footprintCasters(spec.footprint, size).length,
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

export interface CameraReading {
  arm: string;
  footprint: Footprint;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  placements: number;
  casters: number;
  meshes: number;
  /** The footprint's own ground size, camera-free — the whole cell set, and the centre island. */
  ground: GroundExtent;
  island: GroundExtent;
  /** The ground mesh's screen extent through this camera, in world units and in pixels. */
  screen: { w: number; h: number; wPx: number; hPx: number; aspect: number };
  /** The delivered picture's bounding box of non-background pixels — includes the props. */
  box: PixelBox;
  /** How tall a grove pine stands on screen at this camera. */
  pineHeightPx: number;
  stats: ImageStats;
  land: number;
  /** Land pixels as a share of the frame. */
  landShare: number;
  families: number;
  largestShare: number;
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** Against the rung one lower on the SAME footprint (null at the bottom rung). */
  touchedVsLower: number | null;
  visibleVsLower: number | null;
  /** Against the same elevation on the OTHER footprint. */
  touchedVsOtherFootprint: number;
  visibleVsOtherFootprint: number;
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

export interface CameraRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  agreement(): string[];
  warm(): void;
  read(arm: string, size: CrowdSizeId, zoom: CrowdZoom): CameraReading;
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  snapshot(arm: string, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceGeometry>;
}

export async function createCameraRunner(): Promise<CameraRunner> {
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
  const bg = backgroundBytes();
  const cache = new Map<string, CameraScene>();
  const sceneFor = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): CameraScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildCameraScene(kit, lit, arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, size: CrowdSizeId, zoom: CrowdZoom): CameraScene => {
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
    agreement: () => shippedCameraAgreement(),
    warm() {
      for (const arm of CAMERA_ARMS) render(arm.id, 'one', CAMERA_ZOOMS[0]!);
    },
    read(arm, size, zoom) {
      const s = render(arm, size, zoom);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, size, zoom);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(CONTROL_ARM, size, zoom));
      const lower = lowerArm(arm);
      const vsLower = lower === null ? null : visibleDeltaDistribution(buf, pixels(lower, size, zoom));
      const vsOther = visibleDeltaDistribution(buf, pixels(otherFootprintArm(arm), size, zoom));
      return {
        arm,
        footprint: s.footprint,
        elevationDeg: s.elevationDeg,
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        placements: s.placements,
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
        pineHeightPx: deliveredPineHeightPx(s.elevationDeg, s.pxPerUnit),
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        landShare: census.land / (s.width * s.height),
        families: census.families,
        largestShare: census.largestShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsLower: vsLower === null ? null : vsLower.touched,
        visibleVsLower: vsLower === null ? null : vsLower.visible,
        touchedVsOtherFootprint: vsOther.touched,
        visibleVsOtherFootprint: vsOther.visible,
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-camera-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-camera-scene: no 2d context for the reference');
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

export async function mountShippedCamera(root: HTMLElement): Promise<void> {
  const runner = await createCameraRunner();
  window.cameraRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target} · shipped elevation ${SHIPPED_ELEVATION_DEG.toFixed(2)}° · ` +
    `signed elevation ${SIGNED_ELEVATION_DEG}° · camera agreement: ${runner.agreement().length === 0 ? 'the control looks along the shipped camera' : runner.agreement().join('; ')}`;
  root.appendChild(head);
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, orthographic, 50°, the true footprint)';
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
  for (const size of CAMERA_SIZES) {
    for (const zoom of CAMERA_PICTURE_ZOOMS) {
      for (const footprint of FOOTPRINTS) {
        const h = document.createElement('h2');
        h.textContent = `${size.id} — ${footprint === 'map' ? 'the shipped footprint' : 'the true footprint'} — ${zoom === FIT_ZOOM ? 'fitted (each arm at its own fit)' : `${zoom} px/unit`}`;
        root.appendChild(h);
        const row = document.createElement('div');
        row.className = 'row';
        for (const elevationDeg of ELEVATION_LADDER) {
          const arm = armId(footprint, elevationDeg);
          const r = runner.read(arm, size.id, zoom);
          const fig = document.createElement('figure');
          const img = document.createElement('img');
          img.src = runner.snapshot(arm, size.id, zoom);
          img.width = 900;
          fig.appendChild(img);
          const cap = document.createElement('figcaption');
          cap.textContent =
            `${arm} — ${armCaption(arm)} · ${r.pxPerUnit.toFixed(3)} px/unit · island on screen ${r.screen.wPx.toFixed(0)}×${r.screen.hPx.toFixed(0)} px ` +
            `(w/h ${r.screen.aspect.toFixed(2)}) · pine ${r.pineHeightPx.toFixed(0)} px tall · land ${(r.landShare * 100).toFixed(1)}% of frame · ` +
            `${r.families} families · MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs control ${r.visible.toLocaleString()}`;
          fig.appendChild(cap);
          row.appendChild(fig);
        }
        root.appendChild(row);
      }
    }
  }
}

declare global {
  interface Window {
    cameraRunner?: CameraRunner;
  }
}
