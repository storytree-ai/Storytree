// shipped-canopy-scene.ts — THE CANOPY ON THE SHIPPED GROUND: what stands on it, what that
// shades, and what a healthy island's grove does to the picture. Three arms, one thing each.
//
//   bare        the shipped ground alone — every layer at what ships, nothing standing and nothing casting,
//               nothing bought standing on it (CONTROL and DENOMINATOR)
//   capability  + the vocabulary: one pine per capability, one bloom per signature (ADR-0475) —
//               NOW CASTING, which until 2026-09-03 they did not (`ground-casters.ts`'s header)
//   groves      + the healthy island's grove: thirteen stands per recipe-island of area, four to
//               eight live pines each, every one below the capability's height and clear of the
//               beach and the path (`src/grove-dressing.ts`)
//
// THE INCREMENT: grove density and kit-tree shadows on the shipped forest map, toward the render
// the owner stamped (`land-combined-1948px.png`, ADR-0489 D3's look-fence) — which is forested,
// where the map that drew one pine per capability read sparse (ADR-0475 D7, a cost accepted at
// the time and now paid down against a picture).
//
// ⚠⚠ THE ARMS DIFFER IN EXACTLY THE DRESSING, AND NOTHING ELSE ON THE PAGE IS ARM-SPECIFIC. Every
// arm is `shippedGroundBuild` — the SHIPPED canvas's own builder, imported from `src/` — over the
// same parcels, the same strips, the same framing and the same material factory at the shipped
// strengths. What an arm chooses is its PLACEMENT LIST, and that list reaches the ground exactly
// the way it reaches the map: as the casters `shippedGroundBuild` is handed, unioned with the
// crowd's own descriptor-stream casters, through the same `placementCasters` the canvas calls. (⚠
// that second list was each island's story tree and is now EMPTY — ADR-0508 retired it.) So a pixel
// between two arms is attributable to what stands there and the shadow it throws, and to nothing
// else. `shipped-canopy-scene.test.ts` states that as a property of the source.
//
// ⚠ THE PROPS ARE LIT THE WAY THE MAP LIGHTS THEM. The ground ignores scene lights (the banded
// material computes its own lambert), but a bought crown is a `MeshStandardMaterial`, and drawn
// through anything but the map's own pipeline it comes out saturated or dark and reads as an art
// difference. So this page's renderer is put in exact-colour mode and its lights are CALIBRATED by
// the same two `src/` modules `<ForestWorldCanvas>` uses (`configureExactColour`,
// `calibrateLights` → `intensitiesFor`), which is the pipeline `kit-island-scene.ts` took the
// approved kit render through.
//
// ⚠ THE VERDICT IS NOT "IT RENDERS", AND IT IS NOT "PIXELS CHANGED". ADR-0490 D6 retires the
// touched-pixel count as a headline; an arm is judged on pixels that move MORE THAN 20/255 against
// the control, on the arc's family census, and — for this increment above all — by the owner's
// eye on the forest's FITTED view, which is the view the map opens on: a same-hue canopy over a
// same-hue island must leave the island a clean green block, not a smudge.
//
// ⚠ THE REFERENCE ARM IS AN IMAGE, NOT A SCENE — the approved Cycles render, measured through the
// same census and never differenced, exactly as `shipped-grass-scene.ts` carries it.
//
// THE PAGE ADOPTS NOTHING. `harness/` only — it produces EVIDENCE about the `src/` modules it
// imports; the crossing itself is the canvas's (`src/ForestWorldCanvas.tsx`).

import * as THREE from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
} from '../src/banded-ground-material.js';
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
import { placementCasters } from '../src/ground-casters.js';
import { GROVE_DENSITY, cellAt } from '../src/grove-dressing.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  isGrovePlacement,
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
import { dressMapFromKit, dressMapWithGroves } from '../src/map-dressing.js';
import { parcelCellsFrom, type LayoutCell } from '../src/parcel-cells.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import {
  awaitQuery,
  readIdentity,
  type DisjointTimerQuery,
  type RendererIdentity,
} from './frame-cost-scene.js';
import { kitMeshes, loadKit, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import {
  REFERENCE_IMAGE,
  backgroundBytes,
  familyCensus,
  referenceFamilies,
  type ReferenceReading,
} from './shipped-grass-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  VISIBLE_DELTA,
  sensitivityReasons,
  visibleDeltaDistribution,
  type VisibleDeltaReading,
} from './visible-delta.js';
import {
  FIT_ZOOM,
  crowdCasters,
  crowdCells,
  crowdDescriptors,
  crowdPxPerUnit,
  crowdSize,
  crowdStrips,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

/**
 * THE ARMS, control first — and the last three are a DENSITY LADDER rather than three ideas.
 *
 * ⚠⚠ THE LADDER IS THE OWNER'S SCALE-BACK LEVER (ADR-0503 D1/D3). He directed the layers be
 * applied boldly and judged by a picture per step, and the measured consequence of showing him one
 * rung is that he answers with a rung ("sand .9 looks the best" → "actually lets go with sand
 * 0.65", minutes apart, off one sheet). So every rung is RENDERED here and the shipped pick is a
 * pointer at one of them: a scale-back is then {@link GROVE_DENSITY} and {@link SHIPPED_GROVE_ARM},
 * two constants, and no re-measurement.
 */
export type CanopyArm = 'bare' | 'capability' | 'groves-x1' | 'groves-x2' | 'groves-x3';
export const CANOPY_ARMS: readonly CanopyArm[] = ['bare', 'capability', 'groves-x1', 'groves-x2', 'groves-x3'];

/** The arm every pixel figure is read against: the shipped ground with nothing bought on it. */
export const CONTROL_ARM: CanopyArm = 'bare';

/**
 * WHICH DENSITY RUNG EACH ARM GROWS AT — `null` for an arm that grows no grove at all, so the two
 * kinds of arm are told apart by this table rather than by parsing a name.
 *
 * ⚠ THE SHIPPED RUNG IS READ FROM THE CONSTANT, NEVER RESTATED. `groves-x2` is the arm the map
 * actually stands, so its entry IS `GROVE_DENSITY`; `canopy-arms-agree` in
 * `shipped-canopy-scene.test.ts` holds the name, the pointer and the constant to each other, which
 * is what stops a scale-back from leaving an arm labelled x2 drawing x1.
 */
export const CANOPY_ARM_DENSITY = {
  bare: null,
  capability: null,
  'groves-x1': 1,
  'groves-x2': GROVE_DENSITY,
  'groves-x3': 3,
} satisfies Record<CanopyArm, number | null>;

/** The rungs, in the order they are shown — every arm that grows a grove. */
export const GROVE_ARMS: readonly CanopyArm[] = CANOPY_ARMS.filter((a) => CANOPY_ARM_DENSITY[a] !== null);

/** The rung the shipped canvas stands, as an arm — what every "does the map read right" question
 *  is asked of, and what the driver's grove refusals are asked of. */
export const SHIPPED_GROVE_ARM: CanopyArm = 'groves-x2';

/** What each arm IS, as the caption under its own picture — beside the arm rather than in the
 *  HTML, so an arm cannot be added without a reader being told what it is. */
export const CANOPY_ARM_CAPTION = {
  bare: 'the shipped ground alone — every layer at what ships, nothing bought on it and, since the placeholder story tree was retired, nothing casting on it either (CONTROL)',
  capability:
    'the shipped ground + today’s vocabulary: one pine per capability, one bloom per signature — NOW casting their shadows',
  'groves-x1':
    '+ the healthy island’s grove at the RECIPE’S OWN stand count: 13 stands per recipe-island of area, 4–8 live ' +
    'pines each at 0.55–0.80 of the capability’s height, clear of the beach and the path',
  'groves-x2': '+ the grove at TWICE the recipe’s stands — the SHIPPED pick',
  'groves-x3': '+ the grove at THREE TIMES the recipe’s stands — the boldest rung rendered',
} satisfies Record<CanopyArm, string>;

/** One island and the thirty-five-island forest. The grove is read at BOTH: a canopy that reads on
 *  one island and smudges the forest's fitted view — the view the map OPENS on — has not answered. */
export const CANOPY_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];

/** The zoom the canopy is READ at, and the fitted overview it is JUDGED at. */
export const CANOPY_ZOOMS: readonly number[] = [8];
export const CANOPY_PICTURE_ZOOMS: readonly CrowdZoom[] = [...CANOPY_ZOOMS, FIT_ZOOM];

/** The frozen tables the canvas places and casts from — the same two, by import. */
export const CANOPY_FOOTPRINT = KIT_FOOTPRINTS_2026_08_29;
export const CANOPY_HEIGHTS = KIT_HEIGHTS_2026_08_29;

// ---------------------------------------------------------------- what stands, per arm

const descriptorMemo = new Map<CrowdSizeId, InstanceDescriptor[]>();

/** THE CROWD AS ONE DESCRIPTOR STREAM — ground, signatures AND the trail strips, which is what
 *  `worldTo3D` hands the canvas: the grove keeps off the worn path the strips' docks imply, so a
 *  stream without them would grow a grove across a path the ground draws. */
export function armDescriptors(size: CrowdSize): InstanceDescriptor[] {
  const hit = descriptorMemo.get(size.id);
  if (hit !== undefined) return hit;
  const built = [...crowdDescriptors(size), ...crowdStrips(size)];
  descriptorMemo.set(size.id, built);
  return built;
}

const placementMemo = new Map<string, KitPlacement[]>();

/**
 * WHAT EACH ARM STANDS. `bare` stands nothing; `capability` is the vocabulary
 * (`dressMapFromKit`); `groves` is what the CANVAS stands (`dressMapWithGroves`) — the same
 * functions, off the same stream, at the same frozen footprints the canvas places from.
 *
 * ⚠ MEMOISED PER ARM AND SIZE, and it is a `check:mutation-diff` requirement as much as a cost
 * one: the forest's dressing is 35 islands' worth of placement, and a suite that rebuilt it per
 * assertion reports Timeouts on a loaded runner, which the rung scores UNPROVEN.
 */
export function armPlacements(arm: CanopyArm, size: CrowdSize): KitPlacement[] {
  const key = `${arm}|${size.id}`;
  const hit = placementMemo.get(key);
  if (hit !== undefined) return hit;
  const opts = { relief: LAND_RELIEF_AMPLITUDE, footprint: CANOPY_FOOTPRINT };
  const density = CANOPY_ARM_DENSITY[arm];
  const built =
    arm === 'bare'
      ? []
      : density === null
        ? dressMapFromKit(armDescriptors(size), opts)
        : dressMapWithGroves(armDescriptors(size), { ...opts, density });
  placementMemo.set(key, built);
  return built;
}

/**
 * WHAT DARKENS THE GROUND, PER ARM: the crowd's own descriptor-stream casters UNIONED with one
 * caster per placement — the same union, through the same `placementCasters`, that the canvas
 * hands its ground.
 *
 * ⚠ THE FIRST HALF IS NOW EMPTY, AND THE UNION IS KEPT ANYWAY. `crowdCasters` was each island's
 * story tree; ADR-0508 retired the family, so it returns `[]` and `bare` is an island with nothing
 * standing on it and no pool at its centre — which is what a control for "what does the kit add"
 * should have been all along. The union stays because it is the CANVAS's own shape (a `cave-arch`
 * on a rim would come through it), and collapsing it to the placements would make this page stop
 * being the same scene as the map the moment a portal appeared on one.
 */
export function armCasters(arm: CanopyArm, size: CrowdSize): ShadowCaster[] {
  return [...crowdCasters(size), ...placementCasters(armPlacements(arm, size), CANOPY_FOOTPRINT, CANOPY_HEIGHTS)];
}

const groundBuildMemo = new Map<string, ShippedGroundBuild>();

/**
 * THE SHIPPED GROUND, BUILT ONCE PER ARM AND SIZE — `shippedGroundBuild`, the function `CellGround`
 * calls, handed this arm's casters. Per ARM rather than per size (unlike the skirt and status
 * pages) because the casters ARE what the arms vary, and the occlusion field is built from them.
 * The shore and wear thunks are memoised inside the build, so each arm pays those once.
 */
export function canopyGroundBuild(arm: CanopyArm, size: CrowdSize): ShippedGroundBuild {
  const key = `${arm}|${size.id}`;
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const built = shippedGroundBuild(crowdCells(size), armCasters(arm, size), crowdStrips(size));
  groundBuildMemo.set(key, built);
  return built;
}

/** Placements standing on NO cell of the crowd — the count the driver refuses on. A capability's
 *  tree is sampled inside its parcel and a grove member is accepted only inside one, so the honest
 *  answer is zero; a non-zero is a placement basis that has come apart from the ground's. */
export function offIslandCount(placements: readonly KitPlacement[], cells: readonly LayoutCell[]): number {
  let off = 0;
  for (const p of placements) if (cellAt(cells, p.at) === null) off += 1;
  return off;
}

/** What one arm costs and stands, in numbers a picture cannot carry. */
export interface CanopyPlan {
  /** The GROUND's triangles — identical on every arm, because a caster changes the field and never
   *  the mesh; the driver refuses a run where it is not. */
  groundTriangles: number;
  /** Objects standing: everything bought, by kind. `placements` is their sum. */
  placements: number;
  capabilityTrees: number;
  blooms: number;
  groves: number;
  /** Casters the field was built from, and how many of them are the kit's. */
  casters: number;
  kitCasters: number;
  offIsland: number;
}

export function canopyPlan(arm: CanopyArm, size: CrowdSize): CanopyPlan {
  const placements = armPlacements(arm, size);
  const groves = placements.filter(isGrovePlacement).length;
  const blooms = placements.filter((p) => p.role === 'bloom').length;
  const build = canopyGroundBuild(arm, size);
  return {
    groundTriangles: cellGroundGeometry(build.input).triangles,
    placements: placements.length,
    capabilityTrees: placements.length - groves - blooms,
    blooms,
    groves,
    casters: armCasters(arm, size).length,
    kitCasters: placements.length,
    offIsland: offIslandCount(placements, parcelCellsFrom(crowdCells(size))),
  };
}

// ---------------------------------------------------------------- the scene

export interface CanopyScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  islands: number;
  plan: CanopyPlan;
  /** MERGED kit meshes on the frame — one per (material, tint), a handful whatever stands. Zero on
   *  `bare`, and zero on a dressed arm whose kit never arrived, which is the case a picture of bare
   *  land cannot be told from — so the driver reads it. */
  meshes: number;
}

/**
 * ONE ARM'S SCENE — the SHIPPED pipeline entire, with the placement list as the only moving part.
 *
 * The ground is `shippedGroundBuild` + `buildGroundMaterial`, key for key what `CellGround`
 * builds; the props are `kitMeshes` over this arm's placements; the lights are the calibrated
 * pair the canvas hangs.
 */
export function buildCanopyScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: CanopyArm,
  size: CrowdSize,
  zoom: CrowdZoom,
): CanopyScene {
  const build = canopyGroundBuild(arm, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-canopy-scene: the crowd drew no ground');

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }

  // ⚠ THE MATERIAL IS THE SHIPPED ONE — the whole stack at the shipped strengths, the build's own
  // packed carriers, exactly the block `CellGround`'s `useMemo` runs. Nothing on this page varies
  // a layer; the arms vary what STANDS.
  const wearField = build.wear();
  const extras: GroundLayerExtras = { rock: SHIPPED_LAYERS.rock, detail: SHIPPED_LAYERS.detail };
  if (wearField !== null) extras.wear = { field: wearField, mix: SHIPPED_LAYERS.wearMix };
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));

  let meshes = 0;
  for (const mesh of kitMeshes(kit, armPlacements(arm, size))) {
    scene.add(mesh);
    meshes += 1;
  }

  // ⚠ THE CALIBRATED PAIR, aimed along the land's own authored sun — what `<CalibratedLights />`
  // hangs, at the intensities THIS renderer's probe delivered.
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
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
    plan: canopyPlan(arm, size),
    meshes,
  };
}

// ---------------------------------------------------------------- the instrument

/** What one arm delivered, on one frame — everything a row of the evidence table needs. */
export interface CanopyReading extends CanopyPlan {
  arm: CanopyArm;
  pxPerUnit: number;
  /** The renderer's own count for this frame — the ground's one draw plus one per merged kit mesh. */
  drawCalls: number;
  /** Triangles the renderer submitted for this frame — the ground's plus every prop's. */
  triangles: number;
  meshes: number;
  stats: ImageStats;
  /** Land pixels, colour families holding >=0.5% of them, and how concentrated they are. */
  land: number;
  families: number;
  largestShare: number;
  topThreeShare: number;
  /** Against the CONTROL arm. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
}

/**
 * ONE TIMED SAMPLE'S REQUEST — the arm, the picture and how many frames to put inside one GPU
 * query. The batch exists because a single frame at this scale is comparable to the timer's own
 * resolution; the driver divides it back out.
 */
export interface CanopyCostSpec {
  arm: CanopyArm;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
}

/** ONE TIMED SAMPLE — the GPU's own clock over `batch` frames of one arm, and what it drew. */
export interface CanopyCostReading extends CanopyCostSpec {
  /** The batch divided out, or `null` when the timer was unavailable or the sample was disjoint. */
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  /** The GPU reported it was interrupted during this sample. A disjoint sample is not a frame time. */
  disjoint: boolean;
  /** ⚠ THE LAST FRAME'S counters, never the batch's sum — three resets `info.render` per call. */
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  /** A hidden page suspends rAF and throttles the compositor; the driver refuses a run taken on one. */
  hidden: boolean;
}

export interface CanopyRunner {
  identity(): RendererIdentity;
  /** What the probe measured — printed beside the frames, so a saturated crown is attributable. */
  calibration(): LightCalibration;
  warm(): void;
  read(arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): CanopyReading;
  /** RUNG 2 over the pixels this run actually captured — see `visible-delta.ts`. */
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  /**
   * THE FRAME COST OF ONE ARM, on the GPU's own clock — ADR-0507 D7's second half, and the reason
   * `land-floor-measure.mjs`'s shape is reused rather than a `gl.finish()` wall clock: that route
   * was measured BLIND to an 8.7x change in real GPU work on this very harness family.
   *
   * ⚠ THE SCENE IS WARMED OUTSIDE THE TIMED BATCH. The first render of a configuration compiles
   * shaders and uploads 2.4M triangles of merged kit geometry; measured inside the batch that
   * arrives as the frame's cost and is a hundred times it.
   */
  cost(spec: CanopyCostSpec): Promise<CanopyCostReading>;
  snapshot(arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceReading>;
}

/**
 * ONE WebGL CONTEXT FOR THE WHOLE PAGE, in the map's own pipeline, with the kit loaded once.
 *
 * ⚠ THE PIPELINE IS SET BEFORE ANY SCENE IS BUILT, and the order is load-bearing: `THREE.Color`
 * converts at CONSTRUCTION against the global colour-management flag, so a material built first
 * keeps the conversion it was built with. Exact colour first, then the probe, then the scenes.
 */
export async function createCanopyRunner(): Promise<CanopyRunner> {
  const kit = await loadKit();
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  const cal = calibrateLights(renderer);
  const lit = intensitiesFor(cal);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const bg = backgroundBytes();

  const cache = new Map<string, CanopyScene>();
  const sceneFor = (arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): CanopyScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildCanopyScene(kit, lit, arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };

  const render = (arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): CanopyScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const pixels = (arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };

  const deltaOf = (arm: CanopyArm, size: CrowdSizeId, zoom: CrowdZoom): VisibleDeltaReading =>
    visibleDeltaDistribution(pixels(arm, size, zoom), pixels(CONTROL_ARM, size, zoom));

  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    warm() {
      for (const arm of CANOPY_ARMS) render(arm, 'one', CANOPY_ZOOMS[0]!);
    },
    read(arm, size, zoom) {
      const s = render(arm, size, zoom);
      // ⚠ READ THE COUNTERS OFF THIS ONE RENDER. three resets `info.render` at the top of every
      // `render()` call, so the figures are this frame's and nobody's else.
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, size, zoom);
      const census = familyCensus(buf, bg);
      const delta = deltaOf(arm, size, zoom);
      return {
        ...s.plan,
        arm,
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        meshes: s.meshes,
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        families: census.families,
        largestShare: census.largestShare,
        topThreeShare: census.topThreeShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.size, spec.zoom);
      renderer.setSize(s.width, s.height, false);
      // WARM-UP, outside the query: shader compile, buffer upload, pipeline setup. Real costs,
      // and NOT the per-frame cost being reported.
      for (const _ of Array.from({ length: 5 })) {
        void _;
        renderer.render(s.scene, s.camera);
      }
      gl.finish();
      // ⚠ THE COUNTERS COME OFF ONE RENDER AND ARE NOT DIVIDED — three resets `info.render` at the
      // top of every call, so after a batch the counter holds the LAST frame's figures.
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;

      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (timer) {
        // Reading the flag CLEARS it, so this scopes the disjoint report to THIS sample rather
        // than inheriting an interruption from an earlier one.
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
      // ⚠ A DISJOINT SAMPLE IS DISCARDED, NEVER AVERAGED IN. The GPU has said it was interrupted;
      // a number taken across that is not a frame time.
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
        img.onerror = () => rej(new Error(`shipped-canopy-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-canopy-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      // ⚠ THE REFERENCE IS MASKED ON ALPHA, NOT ON OUR BACKGROUND — a Cycles render with a
      // transparent sea, exactly as the grass page reads it.
      const census = referenceFamilies(buf);
      return {
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
        families: census.families,
        largestShare: census.largestShare,
      };
    },
  };
}

/** The sentinel `imageStats` is handed for the reference — a colour no opaque pixel holds, so the
 *  mask excludes nothing it should keep. */
const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

// ---------------------------------------------------------------- the page

/**
 * Render the whole comparison into `root`. The DOM half only — every number it prints comes from
 * {@link createCanopyRunner}, so the page and `shipped-canopy-measure.mjs` cannot disagree.
 *
 * ⚠⚠ THE RUNNER IS PUBLISHED BEFORE `warm()`, and the order is load-bearing: warming builds every
 * arm's field, and a slow page reads exactly like a broken one to a driver waiting on a handle
 * that does not exist yet (`a-shared-control-arm-breaks-when-a-layer-lands`).
 */
export async function mountShippedCanopy(root: HTMLElement): Promise<void> {
  const runner = await createCanopyRunner();
  window.canopyRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target}`;
  root.appendChild(head);

  // ⚠ THE REFERENCE GOES FIRST — a crossing is judged against the picture the owner approved.
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, no frame budget, not differenced)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 760;
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined — the approved ground and its forest (all seven layers, path-traced)';
  try {
    const r = await runner.reference(REFERENCE_IMAGE);
    refCap.textContent =
      `land-combined (APPROVED) — colour families ${r.families} · largest holds ` +
      `${(r.largestShare * 100).toFixed(1)}% · MICRO ${r.stats.micro.toFixed(2)} · ` +
      `STRUCT ${r.stats.struct.toFixed(2)}`;
  } catch {
    refCap.textContent = 'land-combined (APPROVED) — ⚠ NOT MEASURED (the image did not load)';
  }
  refFig.append(refImg, refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);

  const overview = document.createElement('h2');
  overview.textContent = 'the whole forest, fitted to a laptop screen — the view the map OPENS on';
  root.appendChild(overview);
  root.appendChild(armRow(runner, 'forest', FIT_ZOOM));

  for (const zoom of CANOPY_ZOOMS) {
    for (const size of CANOPY_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent = `${zoom} delivered px per ground unit — ${size.what}`;
      root.appendChild(h2);
      root.appendChild(armRow(runner, size.id, zoom));
    }
  }
}

/** One row of three arms at one size and zoom, each with its own numbers under it. */
function armRow(runner: CanopyRunner, size: CrowdSizeId, zoom: CrowdZoom): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  for (const arm of CANOPY_ARMS) {
    const r = runner.read(arm, size, zoom);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, size, zoom);
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${arm} · ${r.drawCalls} draw calls · ${r.triangles} tris · ${r.placements} objects ` +
      `(${r.capabilityTrees} capability trees, ${r.blooms} blooms, ${r.groves} grove pines) · ` +
      `${r.casters} casters (${r.kitCasters} kit) · families ${r.families} (largest ` +
      `${(r.largestShare * 100).toFixed(1)}%) · MICRO ${r.stats.micro.toFixed(2)} · STRUCT ` +
      `${r.stats.struct.toFixed(2)} · vs bare: ${r.visible} px moved >${VISIBLE_DELTA}/255 ` +
      `(${r.touched} touched) — ${CANOPY_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    row.appendChild(fig);
  }
  return row;
}

declare global {
  interface Window {
    canopyRunner?: CanopyRunner;
  }
}
