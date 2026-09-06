// shipped-wheat-scene.ts — THE WHEAT FIELD ON THE IN-PROGRESS ISLANDS, LADDERED ON HOW YELLOW IT
// IS, FOR THE OWNER (increment `paint-every-land-type-arc-inc-01` on `paint-every-land-type-arc`).
//
//   today          the map AS IT SHIPPED before this landing: the green islands wearing the
//                  six-layer stack, the 14 yellow islands FLAT (ADR-0492 D3's deploy gate), the
//                  deep shadow rung on the green alone (CONTROL — every "moved" is vs this)
//   wheat-<rung>   the wheat field on the yellow rows at the shipped strength, its ramps rebased
//                  onto one anchor of `WHEAT_ANCHORS` — straw / wheat / light-straw / mustard,
//                  the 2026-08-27 instrument's order from nearest a proof state to furthest —
//                  with the whole stack above it and the deep shadow rung on the painted tokens
//   shipped        what ships — `SHIPPED_WHEAT_ANCHOR` read off the source, so it IS one rung
//
// ⚠⚠ THE LADDER VARIES ONE THING: THE ANCHOR. Every wheat arm wears the same factor
// (`SHIPPED_WHEAT_MIX`), the same rows, the same stack above, the same shadow; a pixel between two
// rungs is the anchor's and nothing else's. The strength is the green's own on purpose — the
// arc's premise is that the TREATMENT transfers (+180.8% on green, +181.4% on wheat, the 2026-08-27
// lift), so the wheat is judged at the strength the green was judged at.
//
// ⚠⚠ THREE PICTURES, AND THE FIRST IS A PROOF OF NO CHANGE. `green` is the fixture island mono
// `healthy`, control against shipped: the two must be byte-identical, because this row may not
// touch the green islands' delivered look. `yellow` is the SAME fixture island mono `proposed` —
// one island at 8 px/unit, the read zoom — where the ladder is read. `forest` is THE REAL MAP,
// fitted: the studio's own layout for the live corpus, exported through the `?sceneExport=1`
// bridge by the spacing row (`chapter2-forest-spacing-2026-09-06/scenes/`, ADR-0521) and rendered
// through the shipped pipeline, so the owner sees the 14 in-progress islands change at once
// beside the 21 green ones — not a synthetic crowd
// (`fitted-forest-pictures-were-synthetic-until-the-scene-export-bridge`).
//
// ⚠ THE CONTROL IS THE MAP AS IT SHIPPED, BY CONSTRUCTION. Every arm's ground is
// `shippedGroundBuild` and every arm's material is `buildGroundMaterial`, the one construction the
// canvas uses, handed this arm's wheat (or `null`) and shadow depth. Nothing else differs.
//
// ⚠⚠ THE READER MODEL PRINTS AND DOES NOT FENCE (ADR-0503 D1 / ADR-0506, extended to the wheat
// by this row): `harness/wheat-status-reading.ts` reports, per rung, the ceiling WITH its grid
// step, the worst margin at the shipped strength and which family the worst pixel reads as —
// negative where it is negative, beside the green's own negative figure on the same instrument.
// A negative margin is a report; the look decides (ADR-0489 D3).
//
// ⚠ FRAME COST REPORTS, IT DOES NOT GATE (ADR-0517 D4): the GPU frame on the yellow island and on
// the real forest, control against shipped, on the RTX 2060's own clock.
//
// ⚠ SINCE THE PALENESS LADDER (`wheat-paleness-ladder`, 2026-09-06) EVERY WHEAT ARM HERE ALSO
// WEARS THE SHIPPED LIFT (`SHIPPED_WHEAT_LIFT`), held fixed — this ladder varies the anchor and
// nothing else, and the shipped twin has to coincide with one rung, which it cannot if the rungs
// sit at a lift the map no longer ships. The paleness ladder is `shipped-wheat-lift-scene.ts`,
// which varies the lift on the shipped anchor and shares this page's runner, pictures and
// readings through {@link WheatArmTable}.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE about the `src/`
// modules it imports. The pick lands in `src/ForestWorldCanvas.tsx` (`SHIPPED_WHEAT_ANCHOR`).

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE, type GroundWheatLayer } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { COVER_DENSITY } from '../src/cover-dressing.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  GROUND_TOKENS,
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  SHIPPED_SHADOW_DEPTH,
  SHIPPED_WHEAT,
  SHIPPED_WHEAT_ANCHOR,
  SHIPPED_WHEAT_LIFT,
  SHIPPED_WHEAT_MIX,
  WHEAT_GATE_ROWS,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { placementCasters } from '../src/ground-casters.js';
import { KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29, RENDER_ELEV_DEG, type KitPlacement } from '../src/kit-vocabulary.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import type { ShadowCaster } from '../src/land-shadow.js';
import { WHEAT_ANCHORS, WHEAT_STATUS_GATE } from '../src/land-wheat.js';
import { calibrateLights, intensitiesFor, type CalibratedIntensities, type LightCalibration } from '../src/light-calibration.js';
import { dressMapWithCover, type MapDressingOptions } from '../src/map-dressing.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import { SHADOW_DEPTH, SHADOW_EDGE, deepestAdmissibleRung, type ShadowDepthOptions } from '../src/shadow-rung.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_TOKENS } from './grain-status-reading.js';
import { grassReachableColours } from './grass-status-reading.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_GROUND_COLOUR, SHIPPED_LIGHTING } from './shipped-baseline.js';
import { FIT_ZOOM, crowdBlooms, crowdCasters, crowdCells, crowdSize, crowdStrips, orientedCamera, type CrowdZoom } from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import { REFERENCE_IMAGE, backgroundBytes, familyCensus } from './shipped-grass-scene.js';
import { landBox, screenExtent, type PixelBox, type ScreenExtent } from './shipped-land-ratio-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  armGroundBuild as spacingGroundBuild,
  armPlacements as spacingPlacements,
  armStream as spacingStream,
  fitCamera,
  loadSpacingArms,
  viewElevationDeg,
  type SpacingArm,
} from './shipped-spacing-scene.js';
import { VISIBLE_DELTA, sensitivityReasons, visibleDeltaDistribution, type VisibleDeltaReading } from './visible-delta.js';
import {
  greenReferenceMargin,
  wheatLadderReports,
  wheatShadowMargin,
  type WheatRungReport,
  type WheatShadowMargin,
} from './wheat-status-reading.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

// ---------------------------------------------------------------- the arms

export interface WheatArmSpec {
  id: string;
  /** The anchor the wheat's ramps are rebased onto; `null` is NO wheat — the control. */
  anchor: string | null;
  /** The rung's id in `WHEAT_ANCHORS`, for the caption; `null` on the control. */
  rung: string | null;
  /** The stop-luma lift every wheat arm wears — the SHIPPED one, held fixed; `null` on the control. */
  lift: number | null;
}

export const CONTROL_ARM = 'today';
export const SHIPPED_ARM = 'shipped';

export function wheatArmId(rung: string): string {
  return `wheat-${rung}`;
}

export const WHEAT_ARMS: readonly WheatArmSpec[] = [
  { id: CONTROL_ARM, anchor: null, rung: null, lift: null },
  ...WHEAT_ANCHORS.map((a): WheatArmSpec => ({ id: wheatArmId(a.id), anchor: a.hex, rung: a.id, lift: SHIPPED_WHEAT_LIFT })),
  {
    id: SHIPPED_ARM,
    anchor: SHIPPED_WHEAT_ANCHOR,
    rung: WHEAT_ANCHORS.find((a) => a.hex === SHIPPED_WHEAT_ANCHOR)?.id ?? null,
    lift: SHIPPED_WHEAT_LIFT,
  },
];

/** The ladder's arms, in order — the rungs, without the control or the shipped twin. */
export const LADDER_ARMS: readonly string[] = WHEAT_ANCHORS.map((a) => wheatArmId(a.id));

export function armSpec(id: string): WheatArmSpec {
  const found = WHEAT_ARMS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`shipped-wheat-scene: no arm "${id}"`);
  return found;
}

/** Do two arms draw the SAME picture? The shipped arm is meant to coincide with one rung, which
 *  is what makes it a pick rather than a fifth candidate; the driver refuses a run where it
 *  coincides with none. */
export function sameArm(a: WheatArmSpec, b: WheatArmSpec): boolean {
  return a.anchor === b.anchor && a.lift === b.lift;
}

/** The arm one rung DOWN the ladder (less yellow), or null — the control and the first rung have
 *  none, so "vs neighbour" always isolates ONE step of the anchor. The shipped twin's neighbour is
 *  its rung's. */
export function neighbourArm(id: string): string | null {
  const spec = armSpec(id);
  if (spec.anchor === null) return null;
  const rung = LADDER_ARMS.findIndex((arm) => armSpec(arm).anchor === spec.anchor);
  return rung > 0 ? LADDER_ARMS[rung - 1]! : null;
}

export function armCaption(id: string): string {
  const s = armSpec(id);
  if (s.anchor === null) {
    return `the map as it shipped — green islands painted, the in-progress yellow FLAT, the deep shadow on the green alone (CONTROL)`;
  }
  const anchor = WHEAT_ANCHORS.find((a) => a.hex === s.anchor);
  const what = anchor === undefined ? s.anchor : `${anchor.id} ${anchor.hex}: ${anchor.what}`;
  const tag = id === SHIPPED_ARM ? ' (SHIPS)' : '';
  return `the wheat at ${SHIPPED_WHEAT_MIX} on the in-progress rows, rebased onto ${what}, lifted ${s.lift?.toFixed(2)}; the stack above and the deep shadow as the green wears them${tag}`;
}

/** The wheat option one arm hands the material — `null` for the control, which is what makes its
 *  material byte-identical to the pre-wheat one rather than a wheated material set to zero.
 *  Every wheat arm wears the SHIPPED rows and the SHIPPED factor: the anchor is the one moving part. */
export function armWheat(id: string): GroundWheatLayer | null {
  const s = armSpec(id);
  if (s.anchor === null || s.lift === null) return null;
  return { mix: SHIPPED_WHEAT_MIX, rows: WHEAT_GATE_ROWS, anchor: s.anchor, lift: s.lift };
}

/**
 * THE SHADOW'S DEPTH ON ONE ARM — the shipped picks on every wheat arm (the painted tokens deep,
 * the green AND the yellow), and on the control the depth as it shipped BEFORE this landing: the
 * green alone deep, the yellow at the derived rung. Built from the same table
 * `SHIPPED_SHADOW_DEPTH` is built from, so the control's deep tokens are exactly the grass gate's.
 */
export function armDepth(id: string): ShadowDepthOptions {
  if (armSpec(id).anchor === null) return TODAY_SHADOW_DEPTH;
  return SHIPPED_SHADOW_DEPTH;
}

/** The depth the map wore until this landing: `SHADOW_DEPTH` on the grass gate's tokens only. */
export const TODAY_SHADOW_DEPTH: ShadowDepthOptions = {
  deep: SHADOW_DEPTH,
  deepTokens: GRASS_STATUS_GATE.map((status) => SHIPPED_GROUND_COLOUR.get(status)!),
  edge: SHADOW_EDGE,
};

// ---------------------------------------------------------------- the arm table

/**
 * WHAT A LADDER PAGE HAS TO SAY ABOUT ITS ARMS for the shared runner below to render, measure and
 * caption them: which arm is the control and which ships, what each arm hands the material, which
 * arm is one rung down, and the reader-model report the page prints. The yellowness ladder
 * ({@link YELLOWNESS_TABLE}) and the paleness ladder (`shipped-wheat-lift-scene.ts`) are two
 * tables over ONE runner, so the two pages cannot drift in how they build a scene or read a pixel.
 */
export interface WheatArmTable<M> {
  control: string;
  shipped: string;
  armsFor(pic: WheatPictureId): readonly string[];
  wheat(arm: string): GroundWheatLayer | null;
  depth(arm: string): ShadowDepthOptions;
  neighbour(arm: string): string | null;
  caption(arm: string): string;
  margins(): M;
}

// ---------------------------------------------------------------- the pictures

export type WheatPictureId = 'green' | 'yellow' | 'forest';

export interface WheatPicture {
  id: WheatPictureId;
  what: string;
  zoom: CrowdZoom;
}

export const READ_ZOOM = 8;

export const WHEAT_PICTURES: readonly WheatPicture[] = [
  { id: 'green', what: 'one GREEN island at the read zoom — the unchanged control: shipped must equal today, byte for byte', zoom: READ_ZOOM },
  { id: 'yellow', what: 'one IN-PROGRESS island at the read zoom — the same fixture island, its status the yellow; the ladder is read here', zoom: READ_ZOOM },
  { id: 'forest', what: 'the REAL forest, fitted — the studio’s own layout for the live corpus, 21 green and 14 in-progress islands', zoom: FIT_ZOOM },
];

export function picture(id: WheatPictureId): WheatPicture {
  const found = WHEAT_PICTURES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`shipped-wheat-scene: no picture "${id}"`);
  return found;
}

/** The green island is a PROOF of no change, so it carries the control and the shipped arm only;
 *  the ladder is read on the yellow island and on the forest. */
export function armsFor(pic: WheatPictureId): readonly string[] {
  return pic === 'green' ? [CONTROL_ARM, SHIPPED_ARM] : WHEAT_ARMS.map((a) => a.id);
}

/** The status the mono fixture island wears in a picture. */
export function pictureStatus(pic: WheatPictureId): string {
  if (pic === 'green') return GRASS_STATUS_GATE[0]!;
  if (pic === 'yellow') return WHEAT_STATUS_GATE[1]!;
  throw new Error('shipped-wheat-scene: the forest wears the real map’s statuses, not one');
}

// ---------------------------------------------------------------- what stands

/** The canvas's own dressing options (`ForestWorldCanvas.tsx`), stated once. */
const CANVAS_OPTIONS: MapDressingOptions = {
  relief: LAND_RELIEF_AMPLITUDE,
  footprint: KIT_FOOTPRINTS_2026_08_29,
  coverDensity: COVER_DENSITY,
};

/**
 * THE FIXTURE ISLAND, MONO — every parcel wearing `status`. The crowd's `one` size is mono
 * `healthy` (the status the committed single-island evidence was taken on); the yellow picture
 * re-stamps the same cells with the in-progress status, which is what the shipped mapper does
 * for a story whose folded status is `proposed` (`cell-ground.material` is the territory's status).
 *
 * ⚠ A `proposed` ISLAND HAS SIGNED NOTHING, so it stands no blooms: `crowdBlooms` derives its
 * blooms from `islandCriteria`, which marks every criterion pending on a non-healthy island. The
 * green picture keeps its blooms as the crowd stands them.
 */
export function monoStream(status: string): InstanceDescriptor[] {
  const size = crowdSize('one');
  const cells = crowdCells(size).map((c): InstanceDescriptor => ({ ...c, material: status }));
  const blooms = status === GRASS_STATUS_GATE[0] ? crowdBlooms(size) : [];
  return [...cells, ...blooms, ...crowdStrips(size)];
}

const streamMemo = new Map<string, InstanceDescriptor[]>();
const placementMemo = new Map<string, KitPlacement[]>();
const buildMemo = new Map<string, TimedGroundBuild>();

export interface TimedGroundBuild {
  build: ShippedGroundBuild;
  buildMs: number;
  casters: number;
}

/** A mono picture's descriptor stream, memoised. */
export function monoPictureStream(pic: WheatPictureId): InstanceDescriptor[] {
  const hit = streamMemo.get(pic);
  if (hit !== undefined) return hit;
  const built = monoStream(pictureStatus(pic));
  streamMemo.set(pic, built);
  return built;
}

export function monoPlacements(pic: WheatPictureId): KitPlacement[] {
  const hit = placementMemo.get(pic);
  if (hit !== undefined) return hit;
  const built = dressMapWithCover(monoPictureStream(pic), CANVAS_OPTIONS);
  placementMemo.set(pic, built);
  return built;
}

/** WHAT CASTS on a mono picture — the crowd's own casters unioned with one per placement, the same
 *  union the canvas hands its ground. The SAME list on every arm: the arms differ in the material. */
export function monoCasters(pic: WheatPictureId): ShadowCaster[] {
  return [
    ...crowdCasters(crowdSize('one')),
    ...placementCasters(monoPlacements(pic), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29),
  ];
}

/** THE SHIPPED GROUND for a mono picture — `shippedGroundBuild`, the function `CellGround` calls,
 *  built ONCE per picture: the field is the same on every arm, so the mount-time stamp is paid
 *  once and every arm reads the memo. */
export function monoGroundBuild(pic: WheatPictureId): TimedGroundBuild {
  const hit = buildMemo.get(pic);
  if (hit !== undefined) return hit;
  const stream = monoPictureStream(pic);
  const casters = monoCasters(pic);
  const t0 = performance.now();
  const build = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    casters,
    stream.filter((d) => d.kind === 'trail-strip'),
  );
  const timed = { build, buildMs: performance.now() - t0, casters: casters.length };
  buildMemo.set(pic, timed);
  return timed;
}

// ---------------------------------------------------------------- the real forest

/** The spacing export's arm that IS the shipped layout — the rung whose ratio equals the manifest's
 *  `shippedRatio`. Refused rather than defaulted: a page that rendered the wrong layout would show
 *  the right islands standing in the wrong places, which reads as art. */
export function shippedLayoutArm(arms: readonly SpacingArm[], shippedRatio: number): SpacingArm {
  const found = arms.find((a) => a.record.spacing.ratio === shippedRatio);
  if (found === undefined) {
    throw new Error(`shipped-wheat-scene: no exported layout carries the shipped ratio ${shippedRatio}`);
  }
  return found;
}

/** The status mix of a real stream's islands — how many islands wear each status, read off the
 *  `cell-ground` descriptors (one status per island, the mapper's own rule). */
export function islandStatusMix(stream: readonly InstanceDescriptor[]) {
  const byIsland = new Map<string, string>();
  for (const d of stream) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    byIsland.set(d.island, d.material ?? 'unknown');
  }
  const out: Record<string, number> = {};
  for (const status of byIsland.values()) out[status] = (out[status] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------- the scene

export interface WheatScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  arm: string;
  /** What the arm's material wore — `null` is no wheat. */
  wheat: GroundWheatLayer | null;
  groundTriangles: number;
  screen: ScreenExtent;
  meshes: number;
  buildMs: number;
  casters: number;
}

/** ONE ARM'S GROUND in one picture: the picture's build, this arm's material. */
function groundMesh(build: ShippedGroundBuild, wheat: GroundWheatLayer | null, depth: ShadowDepthOptions) {
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-wheat-scene: the picture drew no ground');
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
  // ⚠ THE SHIPPED BUILDER, HANDED THIS ARM'S WHEAT AND DEPTH AND NOTHING ELSE OF ITS OWN.
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras, depth, wheat);
  return { mesh: new THREE.Mesh(geometry, material), triangles: geo.triangles, positions: geo.positions };
}

function lightScene(scene: THREE.Scene, lit: CalibratedIntensities): void {
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
}

/** A MONO picture's scene: the fixture island at the read zoom, centred on the origin. */
export function buildMonoScene<M>(kit: LoadedKit, lit: CalibratedIntensities, table: WheatArmTable<M>, arm: string, pic: WheatPictureId): WheatScene {
  const timed = monoGroundBuild(pic);
  const wheat = table.wheat(arm);
  const ground = groundMesh(timed.build, wheat, table.depth(arm));
  const scene = new THREE.Scene();
  scene.add(ground.mesh);
  let meshes = 0;
  for (const mesh of kitMeshes(kit, monoPlacements(pic))) {
    scene.add(mesh);
    meshes += 1;
  }
  lightScene(scene, lit);
  const pxPerUnit = READ_ZOOM;
  const camera = orientedCamera({ x: 0, z: 0 }, pxPerUnit);
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    arm,
    wheat,
    groundTriangles: ground.triangles,
    screen: screenExtent(ground.positions, camera),
    meshes,
    buildMs: timed.buildMs,
    casters: timed.casters,
  };
}

/** THE REAL FOREST's scene, fitted: the spacing export's shipped layout through the shipped
 *  pipeline (the spacing page's own memoised build), with this arm's material. */
export function buildForestScene<M>(kit: LoadedKit, lit: CalibratedIntensities, table: WheatArmTable<M>, arm: string, layout: SpacingArm): WheatScene {
  const t0 = performance.now();
  const build = spacingGroundBuild(layout);
  const buildMs = performance.now() - t0;
  const wheat = table.wheat(arm);
  const ground = groundMesh(build, wheat, table.depth(arm));
  const scene = new THREE.Scene();
  scene.add(ground.mesh);
  let meshes = 0;
  for (const mesh of kitMeshes(kit, spacingPlacements(layout))) {
    scene.add(mesh);
    meshes += 1;
  }
  lightScene(scene, lit);
  const fit = fitCamera(ground.positions);
  const camera = orientedCamera(fit.centre, fit.pxPerUnit);
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit: fit.pxPerUnit,
    arm,
    wheat,
    groundTriangles: ground.triangles,
    screen: screenExtent(ground.positions, camera),
    meshes,
    buildMs,
    casters: build.field === null ? 0 : -1,
  };
}

// ---------------------------------------------------------------- the readings

export interface WheatReading {
  arm: string;
  /** What the arm's material wore — the reading describes itself. */
  wheat: GroundWheatLayer | null;
  picture: WheatPictureId;
  zoom: CrowdZoom;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  meshes: number;
  buildMs: number;
  box: PixelBox;
  stats: ImageStats;
  landPx: number;
  families: number;
  largestShare: number;
  topThreeShare: number;
  /** Against the CONTROL at the same picture. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** Against the rung one step down the ladder (null for the control and the first rung). */
  touchedVsNeighbour: number | null;
  visibleVsNeighbour: number | null;
  /** Against the SHIPPED arm — zero on the rung it coincides with, which is the pick made visible. */
  touchedVsShipped: number;
}

export interface ReferenceReading {
  width: number;
  height: number;
  families: number;
  largestShare: number;
  stats: ImageStats;
}

export interface WheatCostSpec {
  arm: string;
  picture: WheatPictureId;
  batch: number;
}

export interface WheatCostReading extends WheatCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

/** THE READER MODEL, PRINTED — every rung's report, the green's figure on the same instrument, and
 *  the shadow's own margin on the yellow at the deep rung. */
export interface WheatMargins {
  fac: number;
  step: number;
  rungs: WheatRungReport[];
  green: { fac: number; worstMargin: number; worstAt: string };
  shadow: WheatShadowMargin;
}

export function wheatMargins(step = 0.0005): WheatMargins {
  const derived = deepestAdmissibleRung(GROUND_TOKENS);
  if (derived === null) throw new Error('shipped-wheat-scene: the shipped palette admits no shadow rung');
  return {
    fac: SHIPPED_WHEAT_MIX,
    step,
    rungs: wheatLadderReports(SHIPPED_WHEAT_MIX, step, SHIPPED_WHEAT_LIFT),
    green: { fac: SHIPPED_GRASS.mix, ...greenReferenceMargin(SHIPPED_GRASS.mix, grassReachableColours(), GRASS_STATUS_GATE) },
    shadow: wheatShadowMargin(SHIPPED_TOKENS, derived, SHADOW_DEPTH),
  };
}

export interface WheatRunner<M = WheatMargins> {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  /** The real forest's status mix, read off the exported layout — the 21/14 the sheet claims. */
  forestMix(): Record<string, number>;
  layout(): { id: string; islands: number; head: string; generatedAt: string };
  warm(): void;
  read(arm: string, picture: WheatPictureId): WheatReading;
  sensitivity(picture: WheatPictureId): string[];
  margins(): M;
  cost(spec: WheatCostSpec): Promise<WheatCostReading>;
  snapshot(arm: string, picture: WheatPictureId): string;
  reference(url: string): Promise<ReferenceReading>;
}

async function fetchJsonFromPage(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`shipped-wheat-scene: ${url} answered ${res.status} — serve the harness from THIS worktree`);
  return res.json();
}

/** THE YELLOWNESS LADDER as a table — this page's own arms over the shared runner. */
export const YELLOWNESS_TABLE: WheatArmTable<WheatMargins> = {
  control: CONTROL_ARM,
  shipped: SHIPPED_ARM,
  armsFor,
  wheat: armWheat,
  depth: armDepth,
  neighbour: neighbourArm,
  caption: armCaption,
  margins: () => wheatMargins(),
};

export async function createWheatRunner<M>(table: WheatArmTable<M>): Promise<WheatRunner<M>> {
  const { manifest, arms: layouts } = await loadSpacingArms(fetchJsonFromPage);
  const layout = shippedLayoutArm(layouts, manifest.shippedRatio);
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
  const cache = new Map<string, WheatScene>();
  const sceneFor = (arm: string, pic: WheatPictureId): WheatScene => {
    const k = `${arm}|${pic}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = pic === 'forest' ? buildForestScene(kit, lit, table, arm, layout) : buildMonoScene(kit, lit, table, arm, pic);
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, pic: WheatPictureId): WheatScene => {
    const s = sceneFor(arm, pic);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixelMemo = new Map<string, Uint8ClampedArray>();
  const pixels = (arm: string, pic: WheatPictureId): Uint8ClampedArray => {
    const k = `${arm}|${pic}`;
    const hit = pixelMemo.get(k);
    if (hit !== undefined) return hit;
    const s = render(arm, pic);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(buf.buffer);
    pixelMemo.set(k, out);
    return out;
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    forestMix: () => islandStatusMix(spacingStream(layout)),
    layout: () => ({ id: layout.record.id, islands: layout.record.islands, head: manifest.studio.head, generatedAt: manifest.generatedAt }),
    warm() {
      for (const arm of table.armsFor('yellow')) render(arm, 'yellow');
    },
    read(arm, pic) {
      const s = render(arm, pic);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, pic);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(table.control, pic));
      const neighbour = table.neighbour(arm);
      const vsNeighbour = neighbour === null ? null : visibleDeltaDistribution(buf, pixels(neighbour, pic));
      const vsShipped = visibleDeltaDistribution(buf, pixels(table.shipped, pic));
      return {
        arm,
        wheat: s.wheat,
        picture: pic,
        zoom: picture(pic).zoom,
        elevationDeg: viewElevationDeg(s.camera),
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        meshes: s.meshes,
        buildMs: s.buildMs,
        box: landBox(buf, s.width, s.height, bg),
        stats: imageStats(buf, s.width, s.height, bg),
        landPx: census.land,
        families: census.families,
        largestShare: census.largestShare,
        topThreeShare: census.topThreeShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsNeighbour: vsNeighbour === null ? null : vsNeighbour.touched,
        visibleVsNeighbour: vsNeighbour === null ? null : vsNeighbour.visible,
        touchedVsShipped: vsShipped.touched,
      };
    },
    sensitivity(pic) {
      return sensitivityReasons(pixels(table.control, pic));
    },
    margins: () => table.margins(),
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.picture);
      renderer.setSize(s.width, s.height, false);
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
    snapshot(arm, pic) {
      render(arm, pic);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-wheat-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-wheat-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      const census = familyCensus(buf, REFERENCE_TRANSPARENT);
      return {
        width: c.width,
        height: c.height,
        families: census.families,
        largestShare: census.largestShare,
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
      };
    },
  };
}

/** The reference is transparent where it is not land; no painted pixel is (-1, -1, -1), so the
 *  census counts every opaque pixel — the same reading `shipped-cast-shadow-scene.ts` takes. */
const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

// ---------------------------------------------------------------- the page

export async function mountShippedWheat(root: HTMLElement): Promise<void> {
  const runner = await createWheatRunner(YELLOWNESS_TABLE);
  window.wheatRunner = runner;
  await mountWheatPage(root, runner, YELLOWNESS_TABLE);
}

/** THE PAGE'S BODY, shared by both ladders: the renderer line, the reference, and one row of
 *  captioned frames per picture. The caller has already parked the runner on `window`. */
export async function mountWheatPage<M>(root: HTMLElement, runner: WheatRunner<M>, table: WheatArmTable<M>): Promise<void> {
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const mix = runner.forestMix();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → scale ${cal.scale.toFixed(3)} · ` +
    `signed elevation ${RENDER_ELEV_DEG}° · ships: wheat ${SHIPPED_WHEAT.anchor} lifted ${SHIPPED_WHEAT.lift.toFixed(2)} at ${SHIPPED_WHEAT.mix} on rows [${SHIPPED_WHEAT.rows.join(', ')}] · ` +
    `real forest ${runner.layout().islands} islands: ${Object.entries(mix).map(([s, n]) => `${n} ${s}`).join(', ')}`;
  root.appendChild(head);
  const refHead = document.createElement('h2');
  refHead.textContent = 'THE REFERENCE — the render the owner stamped (Blender/Cycles)';
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
  for (const pic of WHEAT_PICTURES) {
    const h = document.createElement('h2');
    h.textContent = `${pic.id} — ${pic.what} — ${pic.zoom === FIT_ZOOM ? 'fitted' : `${pic.zoom} px/unit`}`;
    root.appendChild(h);
    const row = document.createElement('div');
    row.className = 'row';
    for (const arm of table.armsFor(pic.id)) {
      const r = runner.read(arm, pic.id);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = runner.snapshot(arm, pic.id);
      img.width = 900;
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent =
        `${arm} — ${table.caption(arm)} · ${r.families} families (largest ${(r.largestShare * 100).toFixed(1)}%) · ` +
        `MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()} · vs shipped ${r.touchedVsShipped.toLocaleString()} touched`;
      fig.appendChild(cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }
}

declare global {
  interface Window {
    wheatRunner?: WheatRunner<WheatMargins>;
  }
}
