// shipped-cover-scene.ts — THE GROUND COVER on the shipped map: the recipe's bushes, grass tufts
// and flower patches, at three sizes, each an arm over the SAME dressed ground.
//
//   bare       the shipped ground with the grove's SHADOWS in its field and nothing standing —
//              the prop MASK, and the denominator for "how much of this island is objects"
//   canopy     what the map stands TODAY: the vocabulary plus each healthy island's grove
//              (`dressMapWithGroves` at the shipped rung) — the CONTROL every pixel figure is
//              read against
//   cover-1    + the ground cover at `build_land.py` TRANSCRIBED — the literal port, kept as an
//              arm precisely because it is the one that does not work
//   cover-2.5  + the cover at the ISLAND's own linear scale (234 / 93.8)
//   cover-4.5  + the cover at the TREES' own scale (18 / 4.004) — the boldest rung rendered
//
// ⚠⚠ THE LADDER IS ON SIZE AND NOT ON COUNT, AND THAT IS THE FINDING THIS PAGE EXISTS TO SETTLE.
// The 2026-09-03 run of this increment laddered the COUNT with `build_land.py`'s own sizes and
// measured the result: 318 / 534 / 750 objects standing on one island moved 356 / 743 / 1,130
// pixels past ADR-0490 D6's 20/255 bar against the canopy — on an island where the canopy itself
// moved 194,440. Four hundred and thirty-two ground-cover props were in the scene, in the
// triangle counts and in the draw calls, and were not in the PICTURE. The cause is a scale
// mismatch the port inherited: the recipe's island is 93.8 ground units across and its pine 4.0
// units tall, where this map's island is 234 and its pine 18 — so every SIGNAL crossed already
// scaled and the ground cover crossed literal (`a-faithful-port-under-a-rule-the-source-lacks-
// under-delivers`, exactly). Standing MORE eight-pixel flecks was never going to answer it.
//
// ⚠ EVERY ARM STANDS ON THE SAME GROUND, built by the canopy page's own memoised builder for the
// SHIPPED grove arm — `canopyGroundBuild(SHIPPED_GROVE_ARM, size)`. That is exact rather than
// approximate here, because GROUND COVER CASTS NOTHING (`placementCasters` drops the dressing
// roles): a cover arm's caster list IS the canopy arm's, so its occlusion field is the same field
// and its ground is the same bytes. The only pixels that differ between any two arms are the
// props' own — which is what makes `bare` an honest mask and the per-arm object statistics a
// measurement of the objects rather than of the ground under them. The driver REFUSES a run in
// which a cover arm's caster count differs from the canopy arm's, so the rule cannot be quietly
// dropped and leave the page still reporting.
//
// ⚠ ONE KIT, AT WHAT SHIPS. Every dressed arm parses the same native-texel kit at
// `KIT_PROP_INDIRECT_FRACTION` (the crown-30 pick of 2026-09-04), so the lighting and the texture
// rung are held FIXED across this page and the arms differ in the cover alone. That is the
// opposite of the detail page, where the kit was the variable.
//
// ⚠ THE VERDICT IS NOT "IT RENDERS" AND IT IS NOT "PIXELS CHANGED" (ADR-0490 D6). An arm is judged
// on pixels moving MORE THAN 20/255 against the CONTROL, on the arc's family census, and by the
// owner's eye — including on the forest's FITTED view, the view the map opens on, where a carpet
// that turns every island into a smudge has not answered however good one island looks.
//
// THE PAGE ADOPTS NOTHING. `harness/` only: it produces EVIDENCE about the `src/` modules it
// imports. The crossing itself is the canvas's (`src/ForestWorldCanvas.tsx` stands
// `dressMapWithCover`).

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { COVER_SIZE, COVER_SIZE_RUNGS } from '../src/cover-dressing.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  buildGroundMaterial,
  type GroundLayerExtras,
} from '../src/ForestWorldCanvas.js';
import { GROVE_DENSITY } from '../src/grove-dressing.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { isDressingRole, isGrovePlacement, type KitPlacement, type KitRole } from '../src/kit-vocabulary.js';
import {
  calibrateLights,
  intensitiesFor,
  type CalibratedIntensities,
  type LightCalibration,
} from '../src/light-calibration.js';
import { dressMapWithCover } from '../src/map-dressing.js';
import { placementCasters } from '../src/ground-casters.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import type { ShadowCaster } from '../src/land-shadow.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import {
  awaitQuery,
  readIdentity,
  type DisjointTimerQuery,
  type RendererIdentity,
} from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import {
  CANOPY_FOOTPRINT,
  CANOPY_HEIGHTS,
  SHIPPED_GROVE_ARM,
  armCasters,
  armDescriptors,
  armPlacements,
  canopyGroundBuild,
} from './shipped-canopy-scene.js';
import {
  FIT_ZOOM,
  crowdCasters,
  crowdPxPerUnit,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import {
  REFERENCE_IMAGE,
  backgroundBytes,
  familyCensus,
  referenceFamilies,
  type ReferenceReading,
} from './shipped-grass-scene.js';
import { kitFacts, propMaskStats, type KitFacts, type PropMaskStats } from './shipped-detail-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  VISIBLE_DELTA,
  sensitivityReasons,
  visibleDeltaDistribution,
  type VisibleDeltaReading,
} from './visible-delta.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

export type CoverArm = 'bare' | 'canopy' | 'cover-1' | 'cover-2.5' | 'cover-4.5';

export const COVER_ARMS: readonly CoverArm[] = ['bare', 'canopy', 'cover-1', 'cover-2.5', 'cover-4.5'];

/** Today's picture — the map as it ships before this landing. Every "moved >20/255" is against it. */
export const CONTROL_ARM: CoverArm = 'canopy';

/** The arm that stands nothing on the same ground — the denominator for the prop mask. */
export const MASK_ARM: CoverArm = 'bare';

/**
 * WHICH SIZE RUNG EACH ARM DRAWS ITS COVER AT — `null` for an arm that wears none, so the two
 * kinds of arm are told apart by this table rather than by parsing a name.
 *
 * ⚠ THE RUNGS ARE READ FROM `COVER_SIZE_RUNGS`, NEVER RESTATED, and the SHIPPED arm's entry IS
 * `COVER_SIZE`. `shipped-cover-scene.test.ts` holds the name, the pointer and the constant to each
 * other — which is what stops a scale-back leaving an arm labelled 4.5 drawing 2.5.
 */
export const COVER_ARM_SIZE = {
  bare: null,
  canopy: null,
  'cover-1': COVER_SIZE_RUNGS[0]!,
  'cover-2.5': COVER_SIZE_RUNGS[1]!,
  'cover-4.5': COVER_SIZE_RUNGS[2]!,
} satisfies Record<CoverArm, number | null>;

/** The ladder, leanest first — every arm that wears cover at all. */
export const COVER_LADDER: readonly CoverArm[] = COVER_ARMS.filter((a) => COVER_ARM_SIZE[a] !== null);

/** The arms that stand the bought kit at all. */
export const DRESSED_ARMS: readonly CoverArm[] = COVER_ARMS.filter((a) => a !== MASK_ARM);

/**
 * THE SHIPPED PICK — the boldest rung rendered, per ADR-0503 D1/D3 (apply the layer boldly, judge
 * by the picture, let the owner scale back along rungs he has already seen). `COVER_SIZE` in
 * `src/cover-dressing.ts` is the constant the shipped map reads and the test holds the two agree;
 * a scale-back moves both together, to a rung already on this page's sheet.
 */
export const SHIPPED_COVER_ARM: CoverArm = 'cover-4.5';

/** What each arm IS, as the caption under its own picture — beside the arm rather than in the
 *  HTML, so an arm cannot be added without a reader being told what it is. */
export const COVER_ARM_CAPTION = {
  bare: 'the shipped ground with the grove’s SHADOWS in its field and nothing standing on it — the prop MASK (every pixel that differs from this is an object)',
  canopy:
    'TODAY: the vocabulary + each healthy island’s grove at the shipped rung, and no ground cover at all (CONTROL)',
  'cover-1':
    '+ the recipe’s ground cover at `build_land.py` TRANSCRIBED — 70 bushes, 120 grass tufts and 26 flower patches per recipe-island of area, at the recipe’s own literal widths',
  'cover-2.5':
    '+ the same scatter at the ISLAND’s own linear scale (this map’s island is 2.49x the recipe’s) — the same fraction of the island under cover as the approved render has',
  'cover-4.5':
    '+ the same scatter at the TREES’ own scale (this map’s pine is 4.50x the recipe’s) — the same proportion to the pines as the approved render has, and the boldest rung rendered',
} satisfies Record<CoverArm, string>;

/** One island and the thirty-five-island forest. The cover is read at BOTH: a carpet that reads on
 *  one island and smudges the forest's fitted view — the view the map OPENS on — has not answered. */
export const COVER_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];
export const COVER_ZOOMS: readonly number[] = [8];
export const COVER_PICTURE_ZOOMS: readonly CrowdZoom[] = [...COVER_ZOOMS, FIT_ZOOM];

// ---------------------------------------------------------------- what stands, per arm

const placementMemo = new Map<string, KitPlacement[]>();

/**
 * WHAT EACH ARM STANDS. `bare` stands nothing; `canopy` is what the canvas stood before this
 * landing (the canopy page's own `armPlacements` at the shipped grove arm, imported rather than
 * re-derived so the two pages cannot come to disagree about what "today" is); a `cover-*` arm is
 * what the canvas stands NOW (`dressMapWithCover`) at that arm's size rung.
 *
 * ⚠ EVERY COVER ARM HOLDS THE GROVE AT THE SHIPPED RUNG, so exactly one thing moves along the
 * ladder. `GROVE_DENSITY` is passed explicitly rather than left to the default, because the
 * default is what a later scale-back on the OTHER layer would silently change under this page.
 *
 * ⚠ MEMOISED PER ARM AND SIZE, and it is a `check:mutation-diff` requirement as much as a cost
 * one: the forest's dressing is 35 islands' worth of placement, and a suite that rebuilt it per
 * assertion reports Timeouts on a loaded runner, which the rung scores UNPROVEN.
 */
export function coverArmPlacements(arm: CoverArm, size: CrowdSize): KitPlacement[] {
  const key = `${arm}|${size.id}`;
  const hit = placementMemo.get(key);
  if (hit !== undefined) return hit;
  const coverSize = COVER_ARM_SIZE[arm];
  const built =
    coverSize === null
      ? armPlacements(arm === MASK_ARM ? 'bare' : SHIPPED_GROVE_ARM, size)
      : dressMapWithCover(armDescriptors(size), {
          relief: LAND_RELIEF_AMPLITUDE,
          footprint: CANOPY_FOOTPRINT,
          density: GROVE_DENSITY,
          coverSize,
        });
  placementMemo.set(key, built);
  return built;
}

/**
 * WHAT DARKENS THE GROUND, PER ARM — and it is the SAME LIST FOR EVERY DRESSED ARM, which is a
 * property this page MEASURES rather than assumes.
 *
 * ⚠ GROUND COVER CONTRIBUTES NO CASTER (`placementCasters` drops the dressing roles), so a cover
 * arm's caster list is the canopy arm's exactly and every dressed arm's occlusion field is the
 * same field. That is what lets every arm reuse ONE ground build. The driver asserts the equality
 * per run rather than trusting this sentence: if the rule were dropped, the cover arms would
 * silently start being compared against a different ground and every pixel figure on the page
 * would be measuring two things at once.
 */
export function coverArmCasters(arm: CoverArm, size: CrowdSize): ShadowCaster[] {
  return [
    ...crowdCasters(size),
    ...placementCasters(coverArmPlacements(arm, size), CANOPY_FOOTPRINT, CANOPY_HEIGHTS),
  ];
}

/** How many props of each ground-cover role an arm stands — the count the caption and the report
 *  quote, read off the placement list rather than recomputed from the recipe. */
export interface CoverCensus {
  objects: number;
  groves: number;
  cover: number;
  byRole: Record<string, number>;
}

export function coverCensus(placements: readonly KitPlacement[]): CoverCensus {
  const byRole: Record<string, number> = {};
  let cover = 0;
  for (const p of placements) {
    if (!isDressingRole(p.role)) continue;
    cover += 1;
    byRole[p.role] = (byRole[p.role] ?? 0) + 1;
  }
  return {
    objects: placements.length,
    groves: placements.filter(isGrovePlacement).length,
    cover,
    byRole,
  };
}

/**
 * The widest prop an arm actually delivers in the given roles, in ground units — read off the
 * PLACEMENTS rather than off the tables, so a size rung that reached the scatter without reaching
 * the props cannot pass unnoticed.
 */
export function widestWidth(
  placements: readonly KitPlacement[],
  footprint: Record<KitRole, number>,
  wanted: (role: KitRole) => boolean,
): number {
  let widest = 0;
  for (const p of placements) {
    if (!wanted(p.role)) continue;
    widest = Math.max(widest, footprint[p.role] * p.scale);
  }
  return widest;
}

/** The widest GROUND-COVER prop of any role — reported so a reader can see how big the layer got,
 *  and compared against a pine's canopy rather than against the criterion marker. */
export function widestCoverWidth(placements: readonly KitPlacement[], footprint: Record<KitRole, number>): number {
  return widestWidth(placements, footprint, isDressingRole);
}

/**
 * THE WIDEST GROUND-COVER FLOWER — and this is the one the criterion marker's distinctness is
 * argued against, NOT {@link widestCoverWidth}.
 *
 * ⚠⚠ THE BOUND IS FLOWER-AGAINST-FLOWER, and reading it as prop-against-prop is a mistake this
 * page made and had refused back at it on 2026-09-04. The marker is a TALL RED FLOWER: what may
 * never appear beside it is a second object a viewer would read as a flower of that colour or that
 * size. A BUSH is not confusable with it at any width — the boldest rung's bush is 6.2 units,
 * wider than the marker and nothing like it — and refusing the run on a bush would have scaled the
 * whole layer back to protect a claim nobody was making. The rule the row states is exact: ground
 * cover uses the kit's white flowers only, at under half the bloom's width, "so the red marker
 * stays the only red flower on the map AND THE ONLY ONE AT ITS SIZE".
 */
export function widestFlowerPatchWidth(
  placements: readonly KitPlacement[],
  footprint: Record<KitRole, number>,
): number {
  return widestWidth(placements, footprint, (role) => role === 'flowerPatch');
}

export interface CoverScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  groundTriangles: number;
  census: CoverCensus;
  /** How many casters the GROUND under this arm was built from — the canopy arm's, for every arm,
   *  which is what makes one build serve them all. */
  groundCasters: number;
  /** How many casters THIS arm's own placements would contribute. For every DRESSED arm it must
   *  equal the canopy arm's, because ground cover casts nothing; for `bare` it is zero, which is
   *  the mask arm standing nothing while still borrowing the canopy's ground. Two fields rather
   *  than one, because collapsing them is what made the first version of this check refuse the
   *  mask arm for doing exactly its job. */
  ownCasters: number;
  /** The widest ground-cover prop of any role, in ground units — reported, not fenced. */
  widestCover: number;
  /** The widest ground-cover FLOWER, in ground units — the one the marker's bound is on. */
  widestFlower: number;
  meshes: number;
}

/**
 * ONE ARM'S SCENE: the shipped grove arm's ground (its builder, its casters) and, when a kit is
 * handed in, this arm's placements stood from it — so two arms differ in what stands and in
 * nothing else.
 */
export function buildCoverScene(
  kit: LoadedKit | null,
  lit: CalibratedIntensities,
  arm: CoverArm,
  size: CrowdSize,
  zoom: CrowdZoom,
): CoverScene {
  const build = canopyGroundBuild(SHIPPED_GROVE_ARM, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-cover-scene: the crowd drew no ground');
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
  const placements = coverArmPlacements(arm, size);
  let meshes = 0;
  if (kit !== null) {
    for (const mesh of kitMeshes(kit, placements)) {
      scene.add(mesh);
      meshes += 1;
    }
  }
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
    groundTriangles: geo.triangles,
    census: coverCensus(placements),
    groundCasters: armCasters(SHIPPED_GROVE_ARM, size).length,
    ownCasters: coverArmCasters(arm, size).length,
    widestCover: widestCoverWidth(placements, CANOPY_FOOTPRINT),
    widestFlower: widestFlowerPatchWidth(placements, CANOPY_FOOTPRINT),
    meshes,
  };
}

export interface CoverReading {
  arm: CoverArm;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  census: CoverCensus;
  groundCasters: number;
  ownCasters: number;
  widestCover: number;
  widestFlower: number;
  meshes: number;
  stats: ImageStats;
  land: number;
  families: number;
  largestShare: number;
  topThreeShare: number;
  /** Pixels moved at all / past the visible bar against the CONTROL (today's picture). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** The same two against the arm one rung LEANER on the ladder (null off the ladder). */
  touchedVsLeaner: number | null;
  visibleVsLeaner: number | null;
  mask: PropMaskStats;
}

export interface CoverCostSpec {
  arm: CoverArm;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
}

export interface CoverCostReading extends CoverCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface CoverRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  warm(): void;
  read(arm: CoverArm, size: CrowdSizeId, zoom: CrowdZoom): CoverReading;
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  cost(spec: CoverCostSpec): Promise<CoverCostReading>;
  snapshot(arm: CoverArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceReading>;
}

/** The arm one rung leaner than `arm` on the size ladder, or null for the leanest and off-ladder. */
export function leanerArm(arm: CoverArm): CoverArm | null {
  const i = COVER_LADDER.indexOf(arm);
  return i > 0 ? COVER_LADDER[i - 1]! : null;
}

/**
 * EVERY DRESSED ARM'S CASTER LIST MATCHES THE CANOPY ARM'S, or the page is measuring two things.
 * Returned as a list of complaints rather than thrown, so the driver can print WHICH arm broke it
 * beside the run it broke.
 */
export function casterAgreement(size: CrowdSize): string[] {
  const want = armCasters(SHIPPED_GROVE_ARM, size).length;
  const out: string[] = [];
  for (const arm of DRESSED_ARMS) {
    const got = coverArmCasters(arm, size).length;
    if (got !== want) {
      out.push(
        `${arm} on ${size.id} casts ${got} shadows against the canopy arm's ${want} — ground cover has ` +
          'started casting, so this arm no longer stands on the same ground as the control and no ' +
          'pixel figure on the page is attributable to the cover alone',
      );
    }
  }
  return out;
}

export async function createCoverRunner(): Promise<CoverRunner> {
  // ONE kit for the whole page: the arms vary what STANDS, never the asset or its lighting, so a
  // second parse would be a second thing changing between arms.
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
  const cache = new Map<string, CoverScene>();
  const sceneFor = (arm: CoverArm, size: CrowdSizeId, zoom: CrowdZoom): CoverScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildCoverScene(arm === MASK_ARM ? null : kit, lit, arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };
  const render = (arm: CoverArm, size: CrowdSizeId, zoom: CrowdZoom): CoverScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixels = (arm: CoverArm, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    warm() {
      for (const arm of COVER_ARMS) render(arm, 'one', COVER_ZOOMS[0]!);
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
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        census: s.census,
        groundCasters: s.groundCasters,
        ownCasters: s.ownCasters,
        widestCover: s.widestCover,
        widestFlower: s.widestFlower,
        meshes: s.meshes,
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        families: census.families,
        largestShare: census.largestShare,
        topThreeShare: census.topThreeShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsLeaner: vsLeaner === null ? null : vsLeaner.touched,
        visibleVsLeaner: vsLeaner === null ? null : vsLeaner.visible,
        mask: propMaskStats(buf, pixels(MASK_ARM, size, zoom)),
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.size, spec.zoom);
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
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-cover-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-cover-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      const census = referenceFamilies(buf);
      return {
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
        families: census.families,
        largestShare: census.largestShare,
      };
    },
  };
}

const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

export async function mountShippedCover(root: HTMLElement): Promise<void> {
  const runner = await createCoverRunner();
  window.coverRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target}`;
  root.appendChild(head);
  const kitsHead = document.createElement('p');
  kitsHead.className = 'numbers';
  kitsHead.textContent = runner
    .kits()
    .map(
      (k) =>
        `${k.url}: ${k.wireBytes.toLocaleString()} B wire · ${k.gpuBytes.toLocaleString()} B on the GPU · ` +
        `${k.textures} textures at ${k.textureEdges.join('/')} texels · ${k.triangles.toLocaleString()} tris · ` +
        `loaded in ${k.loadMs.toFixed(0)} ms`,
    )
    .join('\n');
  root.appendChild(kitsHead);
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, no frame budget, not differenced)';
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
  for (const size of COVER_SIZES) {
    for (const zoom of COVER_PICTURE_ZOOMS) {
      const h = document.createElement('h2');
      const px = crowdPxPerUnit(size, zoom);
      h.textContent = `${size.id} — ${zoom === FIT_ZOOM ? `fitted, ${px.toFixed(3)} px/unit` : `${zoom} px/unit`}`;
      root.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of COVER_ARMS) {
        const r = runner.read(arm, size.id, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 900;
        fig.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm} — ${COVER_ARM_CAPTION[arm]} · ${r.drawCalls} calls · ${r.triangles.toLocaleString()} tris · ` +
          `${r.census.objects} objects (${r.census.cover} cover) · widest cover ${r.widestCover.toFixed(2)} units · ` +
          `${r.families} families · MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs control ${r.visible.toLocaleString()}`;
        fig.appendChild(cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }
}

declare global {
  interface Window {
    coverRunner?: CoverRunner;
  }
}
